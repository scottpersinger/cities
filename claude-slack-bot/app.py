"""Slack ↔ Claude bridge.

Run: `uv run python app.py`. Requires SLACK_BOT_TOKEN, SLACK_APP_TOKEN in env (or .env).

Slack app setup (Socket Mode):
  1. api.slack.com/apps -> Create New App -> From scratch.
  2. Socket Mode -> Enable.
  3. App-Level Tokens -> create one with scope `connections:write`. -> SLACK_APP_TOKEN.
  4. OAuth & Permissions -> Bot Token Scopes:
       app_mentions:read, chat:write, channels:history, groups:history,
       im:history, im:read, im:write, mpim:history, users:read, commands.
  5. Event Subscriptions -> Enable Events. Subscribe to bot events:
       app_mention, message.channels, message.groups, message.im, message.mpim.
  6. Slash Commands -> Create New Command:
       Command: /clear   Description: Reset Claude session in this thread/DM.
       (Request URL is unused with Socket Mode; put any placeholder.)
  7. Install to workspace. -> SLACK_BOT_TOKEN.
  8. Invite the bot to the channel(s) you want it in.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import signal
import time
from typing import Any

from dotenv import load_dotenv
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler
from slack_sdk.errors import SlackApiError

from session_manager import SessionManager

# Slack rejects chat.update with `msg_too_long` well below the documented
# 40k-char limit (heavy mrkdwn pushes it down further). Cap each message at
# this many chars and roll over to a new follow-up message when we hit it.
MAX_MSG_CHARS = 2800

# chat.update is rate-limited at ~1/sec per message. Throttle non-forced
# flushes to honor that without ever falling behind on tool-use breakpoints.
MIN_UPDATE_INTERVAL_S = 1.0

# Random "I'm working on it" placeholders — one is picked per turn so the
# initial reply is a little less monotonous. Wrapped in `_…_` for Slack italic.
THINKING_PHRASES = (
    "thinking…",
    "consulting the oracle…",
    "reticulating splines…",
    "summoning brain cells…",
    "herding electrons…",
    "doing the math on my fingers…",
    "bribing the LLM…",
    "rummaging through tabs…",
    "spinning up the hamster wheel…",
    "untangling my thoughts…",
    "checking my notes…",
    "negotiating with future me…",
    "warming up the GPUs…",
    "googling, but cooler…",
    "peeling back the layers…",
    "reading between the lines…",
    "sharpening pencils…",
    "putting the kettle on…",
    "waking up the interns…",
    "polishing my answer…",
    # Movie / TV references
    "compiling the Matrix…",
    "phoning home…",
    "consulting HAL 9000…",
    "checking with the Force…",
    "I'll be right back…",
    "going to plaid…",
    "channeling Yoda…",
    "consulting the precogs…",
    "to infinity and beyond…",
    "may the odds be in my favor…",
    "assembling the Avengers…",
    "warming up the DeLorean…",
    "winter is coming…",
    "asking Gandalf for advice…",
    "feeding the Mogwai (not after midnight)…",
    "checking in with the Dude…",
    "shaken, not stirred…",
    "warming up the TARDIS…",
    "doing the math like Will Hunting…",
    "pulling a Hermione…",
    "putting the band back together…",
    "calling Ghostbusters…",
    # Music / pop-culture references
    "queuing up Bohemian Rhapsody…",
    "channeling my inner Beyoncé…",
    "dropping the beat…",
    "remixing the answer…",
    # Gaming / nerd-culture references
    "rolling for initiative…",
    "punching in the Konami code…",
    "doing a barrel roll…",
    "shaking the Magic 8-Ball…",
    "respawning at the keyboard…",
)

load_dotenv()

# install.py needs SLACK_CLIENT_ID / SLACK_CLIENT_SECRET (OAuth app install), so
# they live in .env too. But slack_bolt auto-enables OAuth the moment it sees
# them in the environment, which makes AsyncApp ignore our static bot token and
# try to resolve tokens from an (empty) installation store — the bot then can't
# authorize events. We run plain Socket Mode with a fixed bot token, so drop
# these before constructing the app.
for _install_only in ("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"):
    os.environ.pop(_install_only, None)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("claude-slack-bot")

app = AsyncApp(token=os.environ["SLACK_BOT_TOKEN"])

def _parse_sources(raw: str) -> list[str]:
    return [s.strip() for s in raw.split(",") if s.strip()]


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


_extra_args: dict[str, str | None] = {}
if _truthy(os.getenv("CLAUDE_CHROME")):
    _extra_args["chrome"] = None


# Slack renders messages with its own "mrkdwn" dialect, NOT GitHub-flavored
# Markdown. Tables, `[text](url)` links, `**bold**`, and `# headings` come out
# as raw text. This append is added to the agent's system prompt so its replies
# render correctly in both channels and DMs.
SLACK_FORMATTING_PROMPT = """\
Your replies are posted directly to Slack. Format every response in Slack's
"mrkdwn" dialect, not standard or GitHub-flavored Markdown:

- Bold: *single asterisks* (NOT **double**).
- Italic: _underscores_ (NOT *single asterisks*).
- Strikethrough: ~tildes~.
- Inline code: `backticks`. Code blocks: triple backticks (no language tag).
- Links: <https://example.com|label> — NEVER use [label](url) syntax.
- Bullets: a leading "• " or "- " on each line.
- Block quotes: a leading "> ".
- Headings (#, ##, ###) do not render — use a *bold* line instead.
- Tables (| col | col |) do not render — use a bulleted list, one row per
  bullet, with fields separated by " — " or "·". Never emit pipe-and-dash
  table syntax.

Keep output tight: Slack threads are narrow. Prefer short bulleted lists over
long paragraphs."""


sessions = SessionManager(
    # Run each claude subprocess in the directory the bot was launched from.
    # `cd` to the repo/project you want the agent to work in, then start the bot.
    cwd=os.getcwd(),
    permission_mode=os.getenv("CLAUDE_PERMISSION_MODE", "bypassPermissions"),
    model=os.getenv("CLAUDE_MODEL") or None,
    setting_sources=_parse_sources(
        os.getenv("CLAUDE_SETTING_SOURCES", "user,project,local")
    ),
    extra_args=_extra_args,
    system_prompt_append=SLACK_FORMATTING_PROMPT,
)

# Optional sidecar channel that gets a per-turn progress message (header,
# tool-use lines, final ✅/❌). Channel ID like "C0123…", not "#botspeak" —
# the bot must be invited to the channel.
BOTSPEAK_CHANNEL = os.getenv("BOTSPEAK_CHANNEL") or None

_bot_user_id: str | None = None


async def get_bot_user_id(client) -> str:
    global _bot_user_id
    if _bot_user_id is None:
        auth = await client.auth_test()
        _bot_user_id = auth["user_id"]
    return _bot_user_id


def session_key(event: dict[str, Any]) -> str:
    """One Claude session per Slack thread; DMs use the channel id."""
    if event.get("channel_type") == "im":
        return f"dm:{event['channel']}"
    return f"thread:{event.get('thread_ts') or event['ts']}"


def thread_ts_for_reply(event: dict[str, Any]) -> str | None:
    if event.get("channel_type") == "im":
        return None  # DMs don't need threading
    return event.get("thread_ts") or event["ts"]


class SlackStreamer:
    """Streams text into a thread, rolling over to a new message when the
    current one is about to exceed Slack's `chat.update` length limit."""

    def __init__(self, client, channel: str, thread_ts: str | None):
        self._client = client
        self._channel = channel
        self._thread_ts = thread_ts
        self._ts: str | None = None
        self._body = ""
        self._last_flushed_len = 0
        self._last_flush_at = 0.0
        self._placeholder = f"_{random.choice(THINKING_PHRASES)}_"

    async def open(self) -> None:
        resp = await self._client.chat_postMessage(
            channel=self._channel, thread_ts=self._thread_ts, text=self._placeholder
        )
        self._ts = resp["ts"]

    async def append(self, text: str, *, hard_break: bool = False) -> None:
        """Add `text` to the current message. If it would overflow, finalize
        the current message and start a new one. `hard_break` forces a
        rollover even if there's room (used to put a tool notice at the top
        of a new message so it's visible promptly)."""
        if not text:
            return
        if len(self._body) + len(text) > MAX_MSG_CHARS or (
            hard_break and self._body.strip()
        ):
            await self.flush(force=True)
            await self._roll_over()
        self._body += text
        await self.flush()

    async def flush(self, force: bool = False) -> None:
        if self._ts is None:
            return
        now = time.monotonic()
        delta = len(self._body) - self._last_flushed_len
        if not force:
            if delta < 120:
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
            err = e.response.get("error") if e.response else None
            if err == "msg_too_long":
                # Body grew past Slack's actual limit between checks. Trim
                # this message, roll over, and re-stage the tail.
                log.warning(
                    "msg_too_long at %d chars; rolling over", len(self._body),
                )
                tail = self._body[MAX_MSG_CHARS:]
                trimmed = self._body[:MAX_MSG_CHARS].rstrip() + " …"
                try:
                    await self._client.chat_update(
                        channel=self._channel, ts=self._ts, text=trimmed
                    )
                except SlackApiError:
                    log.exception("chat_update retry after trim failed")
                await self._roll_over()
                self._body = tail
                self._last_flushed_len = 0
                self._last_flush_at = time.monotonic()
                if tail.strip():
                    await self.flush(force=True)
            else:
                log.exception("chat_update failed (%s)", err)

    async def _roll_over(self) -> None:
        resp = await self._client.chat_postMessage(
            channel=self._channel, thread_ts=self._thread_ts, text="…"
        )
        self._ts = resp["ts"]
        self._body = ""
        self._last_flushed_len = 0
        self._last_flush_at = 0.0

    async def replace_with(self, text: str) -> None:
        """Overwrite the current message — used for terminal error reporting."""
        if self._ts is None:
            return
        try:
            await self._client.chat_update(
                channel=self._channel, ts=self._ts, text=text
            )
        except SlackApiError:
            log.exception("chat_update (error message) failed")


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def _short_tool_summary(name: str | None, args: dict | None) -> str:
    """One-line summary for the #botspeak channel."""
    name = name or "?"
    args = args or {}
    if name == "Bash" and "command" in args:
        return f"🔧 `bash` `{_truncate(str(args['command']), 200)}`"
    if name in ("Edit", "Write", "Read") and "file_path" in args:
        return f"🔧 `{name}` `{args['file_path']}`"
    if name.startswith("mcp__"):
        # mcp__claude-in-chrome__navigate -> "🔧 chrome:navigate"
        parts = name.split("__", 2)
        bare = ":".join(parts[1:]) if len(parts) >= 3 else name
        return f"🔧 `{bare}`"
    return f"🔧 `{name}`"


class BotspeakLogger:
    """Sidecar progress log to a dedicated channel (e.g. #botspeak).

    One message per turn, edited in place: a header that links back to the
    source thread + user, followed by one line per tool call, ending with a
    ✅/❌ result. No-op when `channel` is None."""

    # Slack rejects chat.update with `msg_too_long` well below the documented
    # 40k limit, especially with mrkdwn entities like <#chan>, <@user>, and
    # <url|label>. Match the conservative cap SlackStreamer uses.
    _MAX_CHARS = MAX_MSG_CHARS

    def __init__(
        self,
        client,
        channel: str | None,
        source_channel: str,
        source_thread_ts: str | None,
        user: str,
        skey: str,
        turn_n: int,
        prompt: str,
    ):
        self._client = client
        self._channel = channel
        self._source_channel = source_channel
        self._source_thread_ts = source_thread_ts
        self._user = user
        self._skey = skey
        self._turn_n = turn_n
        self._prompt = prompt
        self._ts: str | None = None
        self._lines: list[str] = []
        self._last_flush_at = 0.0
        self._last_flushed_count = 0

    @property
    def enabled(self) -> bool:
        return bool(self._channel)

    async def open(self) -> None:
        if not self.enabled:
            return
        permalink = await self._fetch_permalink()
        head_ref = f"<{permalink}|thread>" if permalink else "thread"
        preview = self._prompt.replace("\n", " ").strip()
        if len(preview) > 200:
            preview = preview[:199] + "…"
        header = (
            f"🧵 {head_ref} in <#{self._source_channel}> · <@{self._user}> · "
            f"turn {self._turn_n}\n> {preview}"
        )
        self._lines.append(header)
        try:
            resp = await self._client.chat_postMessage(
                channel=self._channel, text="\n".join(self._lines),
            )
            self._ts = resp["ts"]
        except SlackApiError:
            log.exception("botspeak open failed (channel=%s)", self._channel)
            self._channel = None  # disable for the rest of this turn

    async def _fetch_permalink(self) -> str | None:
        ts = self._source_thread_ts
        if not ts:
            return None
        try:
            resp = await self._client.chat_getPermalink(
                channel=self._source_channel, message_ts=ts,
            )
            return resp.get("permalink")
        except SlackApiError:
            return None

    async def add_tool(self, name: str | None, args: dict | None) -> None:
        if not self._ts:
            return
        self._lines.append(_short_tool_summary(name, args))
        await self._flush(force=True)

    async def add_tool_error(self, content: str) -> None:
        if not self._ts:
            return
        self._lines.append(f"   ⚠️ `{_truncate(content, 200)}`")
        await self._flush(force=True)

    async def finish(self, summary: str, error: str | None = None) -> None:
        if not self._ts:
            return
        if error:
            self._lines.append(f"❌ {error}")
        elif summary:
            self._lines.append(f"✅ {summary}")
        else:
            self._lines.append("✅ done")
        await self._flush(force=True)

    async def _flush(self, force: bool = False) -> None:
        if not self._ts or not self._channel:
            return
        text = "\n".join(self._lines)
        if len(text) > self._MAX_CHARS:
            await self._roll_over()
            return
        now = time.monotonic()
        if not force and (now - self._last_flush_at) < MIN_UPDATE_INTERVAL_S:
            return
        try:
            await self._client.chat_update(
                channel=self._channel, ts=self._ts, text=text,
            )
            self._last_flush_at = now
            self._last_flushed_count = len(self._lines)
        except SlackApiError as e:
            err = e.response.get("error") if e.response else None
            if err == "msg_too_long":
                log.warning(
                    "botspeak msg_too_long at %d chars; rolling over", len(text),
                )
                await self._roll_over()
            else:
                log.exception("botspeak chat_update failed (%s)", err)

    async def _roll_over(self) -> None:
        try:
            tail = self._lines[-1:]
            resp = await self._client.chat_postMessage(
                channel=self._channel,
                text="…(continued)\n" + "\n".join(tail),
            )
            self._ts = resp["ts"]
            self._lines = ["…(continued)", *tail]
            self._last_flush_at = time.monotonic()
            self._last_flushed_count = len(self._lines)
        except SlackApiError:
            log.exception("botspeak roll-over failed")


async def handle_user_message(event: dict[str, Any], client) -> None:
    text = event.get("text", "") or ""
    bot_id = await get_bot_user_id(client)
    text = text.replace(f"<@{bot_id}>", "").strip()
    if not text:
        return

    channel = event["channel"]
    user = event.get("user", "?")
    reply_thread = thread_ts_for_reply(event)
    skey = session_key(event)
    new_session = not sessions.exists(skey)

    log.info(
        "incoming message channel=%s user=%s session=%s new=%s len=%d",
        channel, user, skey, new_session, len(text),
    )
    log.debug("incoming text: %s", text)

    streamer = SlackStreamer(client, channel, reply_thread)
    await streamer.open()

    # Once we open this message, the bot has posted in `reply_thread` — keep
    # the thread on the "respond to all replies" list for future on_message
    # events (avoids a conversations.replies API hit on later replies).
    if reply_thread is not None:
        _bot_thread_keys.add(_thread_cache_key(channel, reply_thread))

    session = await sessions.get_or_create(skey)

    botspeak = BotspeakLogger(
        client,
        BOTSPEAK_CHANNEL,
        source_channel=channel,
        source_thread_ts=reply_thread,
        user=user,
        skey=skey,
        turn_n=session.next_turn_number,
        prompt=text,
    )
    await botspeak.open()

    last_result_summary = ""
    error: Exception | None = None

    try:
        async for chunk in session.send(text):
            if chunk.kind == "text":
                await streamer.append(chunk.text)
            elif chunk.kind == "tool_use":
                await botspeak.add_tool(chunk.name, chunk.args)
            elif chunk.kind == "tool_result":
                if chunk.is_error:
                    await botspeak.add_tool_error(chunk.text)
            elif chunk.kind == "result":
                if chunk.text:
                    last_result_summary = chunk.text
        await streamer.flush(force=True)
    except Exception as e:
        error = e
        log.exception("session error on %s", skey)
        await streamer.replace_with(f":warning: error: `{e}`")

    await botspeak.finish(
        last_result_summary,
        error=f"{type(error).__name__}: {error}" if error else None,
    )


@app.command("/clear")
async def on_clear(ack, command, client):
    await ack()

    channel_id = command["channel_id"]
    thread_ts = command.get("thread_ts")
    user_id = command["user_id"]

    if channel_id.startswith("D"):
        skey = f"dm:{channel_id}"
        reply_thread = None
    elif thread_ts:
        skey = f"thread:{thread_ts}"
        reply_thread = thread_ts
    else:
        await client.chat_postEphemeral(
            channel=channel_id,
            user=user_id,
            text="Run `/clear` inside a thread with me, or in our DM.",
        )
        return

    log.info("/clear invoked user=%s channel=%s session=%s", user_id, channel_id, skey)
    cleared = await sessions.drop(skey)
    log.info("/clear result session=%s cleared=%s", skey, cleared)
    text = "🧹 Session cleared." if cleared else "_No active session here._"
    await client.chat_postMessage(channel=channel_id, thread_ts=reply_thread, text=text)


@app.event("app_mention")
async def on_app_mention(event, client):
    await handle_user_message(event, client)


# Threads we've confirmed the bot has posted in (cleared per process; survives
# /clear and SessionManager state). Used to keep responding to follow-up
# replies after a session was dropped, without forcing the user to re-@.
_bot_thread_keys: set[str] = set()


def _thread_cache_key(channel: str, thread_ts: str) -> str:
    return f"{channel}:{thread_ts}"


async def _bot_participates_in_thread(
    client, channel: str, thread_ts: str, bot_id: str,
) -> bool:
    """True iff the bot has at least one message in this thread.

    Result is cached per (channel, thread_ts). Only successful "yes" results
    are cached — a "no" might become a "yes" later if the bot is invited via
    @-mention, and we want that path to be picked up immediately.
    """
    key = _thread_cache_key(channel, thread_ts)
    if key in _bot_thread_keys:
        return True
    try:
        resp = await client.conversations_replies(
            channel=channel, ts=thread_ts, limit=200,
        )
        for m in resp.get("messages", []):
            if m.get("user") == bot_id:
                _bot_thread_keys.add(key)
                return True
        return False
    except SlackApiError:
        log.exception(
            "conversations.replies failed for %s/%s", channel, thread_ts,
        )
        return False


@app.event("message")
async def on_message(event, client):
    # Skip bot's own messages, edits, joins, etc.
    if event.get("bot_id") or event.get("subtype"):
        return

    bot_id = await get_bot_user_id(client)

    # In channels: respond to any reply inside a thread the bot has
    # participated in. The `app_mention` handler covers the opening message,
    # so we skip messages that mention the bot here to avoid double-handling.
    if event.get("channel_type") != "im":
        thread_ts = event.get("thread_ts")
        if not thread_ts:
            return
        if f"<@{bot_id}>" in (event.get("text") or ""):
            return  # app_mention handler will take it
        skey = session_key(event)
        if not sessions.exists(skey):
            # Session may have been dropped by /clear or a process restart.
            # Verify the bot has actually posted in this thread before
            # waking up — otherwise any thread reply in any channel would
            # trigger the bot.
            if not await _bot_participates_in_thread(
                client, event["channel"], thread_ts, bot_id,
            ):
                return

    await handle_user_message(event, client)


async def main() -> None:
    handler = AsyncSocketModeHandler(app, os.environ["SLACK_APP_TOKEN"])

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    log.info("connecting to slack via socket mode")
    await handler.connect_async()
    log.info("connected; waiting for events")
    try:
        await stop.wait()
    finally:
        log.info("shutting down")
        await handler.close_async()
        await sessions.close_all()


if __name__ == "__main__":
    asyncio.run(main())
