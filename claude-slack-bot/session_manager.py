"""Per-Slack-thread persistent Claude sessions.

Each session wraps a long-lived `ClaudeSDKClient`, which itself wraps a
persistent `claude` CLI subprocess speaking stream-json over stdin/stdout.
Turns are serialized per session via an asyncio.Lock so concurrent Slack
events on the same thread don't interleave on one stdin pipe.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import AsyncIterator, Optional

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
from claude_agent_sdk.types import (
    AssistantMessage,
    ResultMessage,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

log = logging.getLogger("claude-slack-bot.session")


@dataclass
class Chunk:
    """One piece of output produced during a turn.

    `kind` is one of:
      - "text"        — assistant text block, suitable for streaming to Slack.
      - "tool_use"    — formatted tool invocation (name + full args) for the transcript.
      - "tool_result" — formatted tool result (id, is_error, full content) for the transcript.
      - "result"      — terminal turn summary (duration / cost / usage / error).

    The optional `name` / `args` / `is_error` fields are populated for
    `tool_use` and `tool_result` chunks so consumers can format short-form
    summaries without re-parsing `text`.
    """

    kind: str
    text: str
    name: Optional[str] = None
    args: Optional[dict] = None
    is_error: bool = False


class Session:
    def __init__(self, key: str, options: ClaudeAgentOptions):
        self.key = key
        self.log = logging.getLogger(f"claude-slack-bot.session[{key}]")
        self._client = ClaudeSDKClient(options=options)
        self._connected = False
        self._lock = asyncio.Lock()
        self._turn = 0

    @property
    def next_turn_number(self) -> int:
        """The 1-based turn number that the next call to `send()` will use."""
        return self._turn + 1

    async def _ensure_connected(self) -> None:
        if not self._connected:
            self.log.info("connecting claude subprocess")
            await self._client.connect()
            self._connected = True
            self.log.info("connected")

    async def send(self, prompt: str) -> AsyncIterator[Chunk]:
        async with self._lock:
            await self._ensure_connected()
            self._turn += 1
            turn = self._turn
            self.log.info(
                "turn %d: user prompt (%d chars): %r",
                turn, len(prompt), _truncate(prompt, 200),
            )
            await self._client.query(prompt)
            async for msg in self._client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            self.log.info(
                                "turn %d: assistant text (%d chars): %r",
                                turn, len(block.text), _truncate(block.text, 200),
                            )
                            self.log.debug("turn %d: full text: %s", turn, block.text)
                            yield Chunk("text", block.text)
                        elif isinstance(block, ToolUseBlock):
                            self.log.info(
                                "turn %d: tool_use %s id=%s args=%s",
                                turn, block.name, block.id,
                                _truncate(repr(block.input or {}), 400),
                            )
                            yield Chunk(
                                "tool_use",
                                _format_tool_use_full(block),
                                name=block.name,
                                args=dict(block.input or {}),
                            )
                        elif isinstance(block, ThinkingBlock):
                            self.log.debug(
                                "turn %d: thinking (%d chars): %s",
                                turn, len(block.thinking),
                                _truncate(block.thinking, 500),
                            )
                elif isinstance(msg, UserMessage):
                    for block in msg.content:
                        if isinstance(block, ToolResultBlock):
                            content = block.content
                            if isinstance(content, list):
                                content_str = " ".join(
                                    getattr(c, "text", repr(c)) for c in content
                                )
                            else:
                                content_str = str(content)
                            level = (
                                logging.WARNING if block.is_error else logging.INFO
                            )
                            self.log.log(
                                level,
                                "turn %d: tool_result id=%s is_error=%s "
                                "(%d chars): %r",
                                turn, block.tool_use_id, block.is_error,
                                len(content_str), _truncate(content_str, 200),
                            )
                            self.log.debug(
                                "turn %d: tool_result full: %s", turn, content_str,
                            )
                            yield Chunk(
                                "tool_result",
                                _format_tool_result(
                                    block.tool_use_id, block.is_error, content_str
                                ),
                                is_error=bool(block.is_error),
                            )
                elif isinstance(msg, SystemMessage):
                    self.log.debug(
                        "turn %d: system subtype=%s data=%s",
                        turn, getattr(msg, "subtype", "?"),
                        _truncate(repr(getattr(msg, "data", {})), 300),
                    )
                elif isinstance(msg, ResultMessage):
                    is_err = getattr(msg, "is_error", False)
                    duration = getattr(msg, "duration_ms", None)
                    cost = getattr(msg, "total_cost_usd", None)
                    usage = getattr(msg, "usage", None)
                    self.log.info(
                        "turn %d: result is_error=%s duration_ms=%s cost_usd=%s "
                        "usage=%s",
                        turn, is_err, duration, cost,
                        _truncate(repr(usage), 200) if usage else None,
                    )
                    parts: list[str] = []
                    if is_err:
                        parts.append(f"ERROR: {getattr(msg, 'result', '')}")
                    if duration is not None:
                        parts.append(f"duration={duration}ms")
                    if cost is not None:
                        parts.append(f"cost=${cost}")
                    if usage is not None:
                        parts.append(f"usage={usage}")
                    yield Chunk("result", " ".join(parts))
                    return

    async def close(self) -> None:
        if self._connected:
            self.log.info("disconnecting")
            try:
                await self._client.disconnect()
            finally:
                self._connected = False
                self.log.info("closed")


_MAX_TOOL_RESULT_CHARS = 32_000


def _format_tool_use_full(block: ToolUseBlock) -> str:
    """Verbose tool-call entry for the per-turn transcript file."""
    import json
    args = block.input or {}
    try:
        rendered = json.dumps(args, indent=2, ensure_ascii=False, default=str)
    except Exception:
        rendered = repr(args)
    return f"[tool_use] {block.name} id={block.id}\n{rendered}"


def _format_tool_result(tool_use_id: str, is_error: bool, content: str) -> str:
    head = f"[tool_result] id={tool_use_id} is_error={is_error} chars={len(content)}"
    body = content
    if len(body) > _MAX_TOOL_RESULT_CHARS:
        body = body[:_MAX_TOOL_RESULT_CHARS] + f"\n…[truncated, +{len(content) - _MAX_TOOL_RESULT_CHARS} chars]"
    return f"{head}\n{body}"


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


class SessionManager:
    def __init__(
        self,
        cwd: str,
        permission_mode: str,
        model: Optional[str] = None,
        setting_sources: Optional[list[str]] = None,
        extra_args: Optional[dict[str, Optional[str]]] = None,
        system_prompt_append: Optional[str] = None,
    ):
        self._cwd = cwd
        self._permission_mode = permission_mode
        self._model = model
        self._setting_sources = setting_sources
        self._extra_args = extra_args or {}
        self._system_prompt_append = system_prompt_append
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    def _build_options(self) -> ClaudeAgentOptions:
        kwargs: dict = {
            "cwd": self._cwd,
            "permission_mode": self._permission_mode,
        }
        if self._model:
            kwargs["model"] = self._model
        if self._setting_sources:
            kwargs["setting_sources"] = self._setting_sources
        if self._extra_args:
            kwargs["extra_args"] = dict(self._extra_args)
        if self._system_prompt_append:
            kwargs["system_prompt"] = {
                "type": "preset",
                "preset": "claude_code",
                "append": self._system_prompt_append,
            }
        return ClaudeAgentOptions(**kwargs)

    async def get_or_create(self, key: str) -> Session:
        async with self._lock:
            session = self._sessions.get(key)
            if session is None:
                session = Session(key, self._build_options())
                self._sessions[key] = session
            return session

    def exists(self, key: str) -> bool:
        return key in self._sessions

    async def drop(self, key: str) -> bool:
        """Close and forget the session for `key`. Returns True if one existed."""
        async with self._lock:
            session = self._sessions.pop(key, None)
        if session is None:
            return False
        await session.close()
        return True

    async def close_all(self) -> None:
        for session in list(self._sessions.values()):
            await session.close()
        self._sessions.clear()
