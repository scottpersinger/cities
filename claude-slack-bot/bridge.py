"""Ably → Claude bridge (the in-codespace consumer).

The one-way counterpart to Central's publisher (see central/docs/axon-event-bus.md).
This process runs *inside the codespace*, subscribes to the codespace's Ably
channel, drives one persistent Claude session per `thread_key`, and posts replies
straight back to Slack with the codespace's own bot token. Nothing is published
back through Ably.

Run:  uv run python bridge.py  (normally started by supervisord)

Credentials are provisioned into .env by Central over SSH:
  ABLY_KEY      a per-codespace Ably key scoped subscribe+history to THIS
               codespace's channel only (full isolation between users)
  ABLY_CHANNEL  the channel name, "cs-<CODESPACE_NAME>" (falls back to deriving
               it from CODESPACE_NAME)
  SLACK_BOT_TOKEN  the codespace posts replies to Slack itself

Durability: ably-python has no "rewind", so on startup we backfill via REST
channel history (messages published while the codespace was down/booting), then
subscribe live. Dedup by message id persisted in .ably-<channel>.json.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import signal
import time
from typing import Any, Optional

from ably import AblyRealtime
from dotenv import load_dotenv
from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.errors import SlackApiError

from session_manager import SessionManager

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("bridge")

# Slack mrkdwn formatting guidance (same intent as app.py's prompt) so replies
# render correctly when the agent posts them.
SLACK_FORMATTING_PROMPT = """\
Your replies are posted directly to Slack. Format every response in Slack's
"mrkdwn" dialect, not standard or GitHub-flavored Markdown:
- Bold: *single asterisks* (NOT **double**). Italic: _underscores_.
- Inline code: `backticks`. Code blocks: triple backticks (no language tag).
- Links: <https://example.com|label> — NEVER [label](url).
- Headings (#, ##) do not render — use a *bold* line instead.
Keep output tight: Slack threads are narrow.

To attach a file (screenshot, image, document) to your reply, save it to disk
and put its absolute path on its own line prefixed with `ATTACH:`, e.g.:
  ATTACH: /workspaces/app/shot.png
Emit one ATTACH line per file. The file is uploaded to this thread; the ATTACH
line itself is removed from your message, so write a normal sentence too."""

MAX_MSG_CHARS = 2800
MIN_UPDATE_INTERVAL_S = 1.0
THINKING_PHRASES = (
    "thinking…",
    "reticulating splines…",
    "consulting the oracle…",
    "warming up the GPUs…",
    "rummaging through tabs…",
)


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


def _parse_sources(raw: str) -> list[str]:
    return [s.strip() for s in raw.split(",") if s.strip()]


def build_session_manager() -> SessionManager:
    """Mirror app.py's SessionManager configuration so the agent behaves the
    same whether driven from Slack Socket Mode or from Ably."""
    extra_args: dict[str, str | None] = {}
    if _truthy(os.getenv("CLAUDE_CHROME", "1")):
        extra_args["chrome"] = None
    return SessionManager(
        cwd=os.getcwd(),
        permission_mode=os.getenv("CLAUDE_PERMISSION_MODE", "bypassPermissions"),
        model=os.getenv("CLAUDE_MODEL") or None,
        setting_sources=_parse_sources(
            os.getenv("CLAUDE_SETTING_SOURCES", "user,project,local")
        ),
        extra_args=extra_args,
        system_prompt_append=SLACK_FORMATTING_PROMPT,
    )


class SlackRenderer:
    """Compact streaming renderer: post a placeholder, then edit it in place as
    the agent's text accumulates, rolling over to a new message before Slack's
    length limit. A trimmed-down sibling of app.py's SlackStreamer — Phase 1
    keeps it simple; a later pass can share one implementation."""

    def __init__(self, client: AsyncWebClient, channel: str, thread_ts: Optional[str]):
        self._client = client
        self._channel = channel
        self._thread_ts = thread_ts
        self._ts: Optional[str] = None
        self._body = ""
        self._last_flushed_len = 0
        self._last_flush_at = 0.0
        self._placeholder = f"_{random.choice(THINKING_PHRASES)}_"

    async def open(self) -> None:
        resp = await self._client.chat_postMessage(
            channel=self._channel, thread_ts=self._thread_ts, text=self._placeholder
        )
        self._ts = resp["ts"]

    async def append(self, text: str) -> None:
        if not text:
            return
        if len(self._body) + len(text) > MAX_MSG_CHARS:
            await self.flush(force=True)
            await self._roll_over()
        self._body += text
        await self.flush()

    async def flush(self, force: bool = False) -> None:
        if self._ts is None:
            return
        now = time.monotonic()
        if not force:
            if len(self._body) - self._last_flushed_len < 120:
                return
            if now - self._last_flush_at < MIN_UPDATE_INTERVAL_S:
                return
        rendered = self._body.strip() or self._placeholder
        try:
            await self._client.chat_update(
                channel=self._channel, ts=self._ts, text=rendered
            )
            self._last_flushed_len = len(self._body)
            self._last_flush_at = now
        except SlackApiError as e:
            log.warning("chat_update failed: %s", e)

    async def _roll_over(self) -> None:
        resp = await self._client.chat_postMessage(
            channel=self._channel, thread_ts=self._thread_ts, text="…"
        )
        self._ts = resp["ts"]
        self._body = ""
        self._last_flushed_len = 0
        self._last_flush_at = 0.0

    async def replace_with(self, text: str) -> None:
        if self._ts is None:
            return
        try:
            await self._client.chat_update(
                channel=self._channel, ts=self._ts, text=text
            )
        except SlackApiError:
            log.exception("chat_update (error message) failed")


async def handle_user_message(
    payload: dict[str, Any], sessions: SessionManager, slack: AsyncWebClient
) -> None:
    thread_key = payload.get("thread_key")
    channel = payload.get("channel")
    reply_ts = payload.get("reply_thread_ts")
    text = payload.get("text") or payload.get("content") or ""
    if not thread_key or not channel or not text:
        log.warning("skipping user.message missing thread_key/channel/text: %s", payload)
        return

    log.info("user.message thread=%s channel=%s len=%d", thread_key, channel, len(text))
    renderer = SlackRenderer(slack, channel, reply_ts)
    await renderer.open()
    session = await sessions.get_or_create(thread_key)
    full_text: list[str] = []
    try:
        async for chunk in session.send(text):
            if chunk.kind == "text":
                full_text.append(chunk.text)
                # Strip ATTACH: lines from what's shown; we upload them below.
                await renderer.append(_ATTACH_RE.sub("", chunk.text))
        await renderer.flush(force=True)
    except Exception as e:  # noqa: BLE001 — surface any turn failure to Slack
        log.exception("session error on %s", thread_key)
        await renderer.replace_with(f":warning: error: `{e}`")

    # Upload any files the agent flagged (parse the full text so a marker split
    # across stream chunks is still caught).
    paths = [m.group(1).strip() for m in _ATTACH_RE.finditer("".join(full_text))]
    if paths:
        await upload_files(slack, channel, reply_ts, paths)


# A line like `ATTACH: /abs/path/to/file` flags a file to upload to the thread.
_ATTACH_RE = re.compile(r"^[ \t]*ATTACH:[ \t]*(.+?)[ \t]*$", re.MULTILINE)


async def upload_files(
    slack: AsyncWebClient,
    channel: str,
    thread_ts: Optional[str],
    paths: list[str],
) -> None:
    for path in paths:
        p = path if os.path.isabs(path) else os.path.join(os.getcwd(), path)
        if not os.path.isfile(p):
            log.warning("ATTACH: file not found: %s", p)
            continue
        try:
            await slack.files_upload_v2(
                channel=channel,
                thread_ts=thread_ts,
                file=p,
                filename=os.path.basename(p),
            )
            log.info("uploaded %s to channel=%s", p, channel)
        except SlackApiError:
            log.exception("files_upload_v2 failed for %s", p)


async def handle_session_clear(payload: dict[str, Any], sessions: SessionManager) -> None:
    thread_key = payload.get("thread_key")
    if not thread_key:
        return
    cleared = await sessions.drop(thread_key)
    log.info("session.clear thread=%s cleared=%s", thread_key, cleared)


async def dispatch(
    name: Optional[str],
    payload: Any,
    sessions: SessionManager,
    slack: AsyncWebClient,
) -> None:
    # Ably delivers the message name (== our event_type) and data (== payload,
    # already JSON-decoded to a dict by the SDK).
    if not isinstance(payload, dict):
        # Some encodings deliver data as a JSON string; tolerate that.
        try:
            payload = json.loads(payload) if payload else {}
        except (TypeError, json.JSONDecodeError):
            log.warning("unparseable payload for name=%s", name)
            return
    if name == "user.message":
        await handle_user_message(payload, sessions, slack)
    elif name == "session.clear":
        await handle_session_clear(payload, sessions)
    else:
        log.debug("ignoring message name=%s", name)


# --- dedup / resume state ----------------------------------------------------
# ably-python has no "rewind", so on startup we backfill missed messages via REST
# history and dedup against what we've already processed. We persist the last
# processed message id + timestamp in the bridge dir (on the /workspaces volume
# that survives codespace stop/start) so a restart resumes where it left off.
STATE_DIR = os.getenv("ABLY_STATE_DIR") or os.path.dirname(os.path.abspath(__file__))


def _state_path(channel: str) -> str:
    return os.path.join(STATE_DIR, f".ably-{channel}.json")


def load_state(channel: str) -> dict[str, Any]:
    try:
        with open(_state_path(channel)) as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def save_state(channel: str, last_id: str, last_ts: Optional[int]) -> None:
    """Persist the last-processed message id + timestamp atomically. Best-effort:
    a failure here only risks reprocessing on a future restart, never a crash."""
    path = _state_path(channel)
    tmp = f"{path}.tmp"
    try:
        with open(tmp, "w") as f:
            json.dump({"last_id": last_id, "last_ts": last_ts}, f)
        os.replace(tmp, path)
    except OSError as e:
        log.warning("could not persist ably state: %s", e)


def resolve_channel() -> str:
    """The channel this codespace subscribes to: ABLY_CHANNEL, else cs-<name>."""
    name = os.getenv("ABLY_CHANNEL")
    if name:
        return name
    cs = os.getenv("CODESPACE_NAME")
    if cs:
        return f"cs-{cs}"
    raise SystemExit("no ABLY_CHANNEL or CODESPACE_NAME to resolve the channel")


async def run_consumer(
    ably_key: str,
    channel_name: str,
    sessions: SessionManager,
    slack: AsyncWebClient,
    stop: asyncio.Event,
) -> None:
    """Subscribe live to the codespace's Ably channel and backfill anything
    published while we were down (REST history). The Ably realtime SDK handles
    reconnection/continuity itself — no hand-rolled reconnect loop."""
    from ably import AblyRest

    state = load_state(channel_name)
    last_ts: Optional[int] = state.get("last_ts")
    seen: set[str] = set()
    if state.get("last_id"):
        seen.add(state["last_id"])
    inflight: set[asyncio.Task] = set()

    def record(msg: Any) -> bool:
        """True if this is a new message to process (and mark it seen+persisted)."""
        if msg.id in seen:
            return False
        seen.add(msg.id)
        if len(seen) > 2000:  # keep the dedup set bounded
            seen.clear()
            seen.add(msg.id)
        save_state(channel_name, msg.id, getattr(msg, "timestamp", None))
        return True

    async with AblyRealtime(ably_key) as realtime:
        channel = realtime.channels.get(channel_name)

        def on_message(msg: Any) -> None:
            if not record(msg):
                return
            # Run the turn concurrently so the subscribe callback returns fast;
            # per-thread ordering is held by the Session lock in SessionManager.
            task = asyncio.create_task(dispatch(msg.name, msg.data, sessions, slack))
            inflight.add(task)
            task.add_done_callback(inflight.discard)

        await channel.subscribe(on_message)
        log.info("subscribed to %s (live)", channel_name)

        # Backfill AFTER subscribing so nothing slips through the gap; dedup by id
        # handles any overlap. Fetch forwards from the last timestamp we saw.
        try:
            rest = AblyRest(ably_key)
            rchan = rest.channels.get(channel_name)
            kwargs: dict[str, Any] = {"direction": "forwards", "limit": 100}
            if last_ts:
                kwargs["start"] = last_ts + 1
            result = await rchan.history(**kwargs)
            n = 0
            while result is not None:
                for m in result.items:
                    if not record(m):
                        continue
                    await dispatch(m.name, m.data, sessions, slack)
                    n += 1
                result = await result.next() if result.has_next() else None
            if n:
                log.info("backfilled %d message(s) from history", n)
            await rest.close()
        except Exception as e:  # noqa: BLE001 — backfill is best-effort
            log.warning("history backfill failed (continuing live): %s", e)

        await stop.wait()


def _missing_config() -> list[str]:
    """Required config the bridge can't start without, given the current env.
    Call after refreshing from .env."""
    missing = [
        k for k in ("ABLY_KEY", "SLACK_BOT_TOKEN") if not os.environ.get(k)
    ]
    # The channel is given directly (ABLY_CHANNEL) or derived from CODESPACE_NAME.
    if not (os.environ.get("ABLY_CHANNEL") or os.environ.get("CODESPACE_NAME")):
        missing.append("ABLY_CHANNEL (or CODESPACE_NAME)")
    return missing


async def wait_for_config(poll_secs: float = 3.0) -> tuple[str, str]:
    """Block until the required config is present, re-reading .env each time.

    On a fresh codespace the bridge starts (supervisord) before Central's
    provisioning has written ABLY_KEY / SLACK_BOT_TOKEN / ABLY_CHANNEL into .env.
    Rather than exit, we wait: reload .env and re-check every few seconds until
    the keys appear, then return. `override=True` so values written after the
    process started replace any stale/empty ones loaded at import.
    """
    warned = False
    while True:
        load_dotenv(override=True)
        missing = _missing_config()
        if not missing:
            return os.environ["ABLY_KEY"], os.environ["SLACK_BOT_TOKEN"]
        if not warned:
            log.warning(
                "waiting for config: missing %s — re-checking .env every %.0fs",
                ", ".join(missing),
                poll_secs,
            )
            warned = True
        else:
            log.debug("still waiting for config: missing %s", ", ".join(missing))
        await asyncio.sleep(poll_secs)


async def main() -> None:
    ably_key, slack_token = await wait_for_config()
    channel_name = resolve_channel()

    sessions = build_session_manager()
    slack = AsyncWebClient(token=slack_token)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    try:
        await run_consumer(ably_key, channel_name, sessions, slack, stop)
    finally:
        log.info("shutting down")
        await sessions.close_all()


if __name__ == "__main__":
    asyncio.run(main())
