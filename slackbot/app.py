"""Slack ↔ Claude bridge that acts as a *real Slack user* (not a bot).

Run: `uv run python app.py`. Requires a Slack user token (SLACK_USER_TOKEN, or
the `.slack_user_token` file written by slack_auth.py) in env (or .env).

A user token can't subscribe to the Events API / Socket Mode the way a bot can,
so instead of receiving event pushes we *poll* (see message_poller.py). Replies
are posted as the signed-in user via the same token.

Setup:
  1. api.slack.com/apps -> Create New App -> From scratch.
  2. "OAuth & Permissions" -> "Redirect URLs" -> add
       http://localhost:4555/oauth/callback   (must match slack_auth.py) -> Save.
  3. "Basic Information" -> copy Client ID + Client Secret into env as
       SLACK_CLIENT_ID / SLACK_CLIENT_SECRET.
  4. Run `uv run python slack_auth.py` once. Approve in the browser. It mints a
       user token (xoxp-…) with the required user scopes and saves it.
  5. Run `uv run python app.py`. The agent now answers DMs (and, optionally,
       @-mentions) as you.

There is no bot identity, no Socket Mode, and no Slash Command — `/clear` is a
plain text command you type in the conversation.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import random
import signal
import time
from typing import Any

from dotenv import load_dotenv
from slack_sdk.errors import SlackApiError
from slack_sdk.http_retry.builtin_async_handlers import (
    AsyncRateLimitErrorRetryHandler,
)
from slack_sdk.web.async_client import AsyncWebClient

from message_poller import MessagePoller
from pr_poller import PR, PRPoller
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

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("claude-slack-bot")


def _load_user_token() -> str:
    """The operator's Slack user token (xoxp-…). Prefer the env var; fall back
    to the `.slack_user_token` file written by slack_auth.py."""
    tok = os.getenv("SLACK_USER_TOKEN")
    if tok and tok.strip():
        return tok.strip()
    path = os.path.join(os.path.dirname(__file__), ".slack_user_token")
    if os.path.exists(path):
        with open(path) as f:
            tok = f.read().strip()
        if tok:
            return tok
    raise SystemExit(
        "No Slack user token. Run `uv run python slack_auth.py` to mint one, "
        "or set SLACK_USER_TOKEN in your environment."
    )


# Web client authenticated as the operator. Assigned in main() once the token
# is loaded; module-global so background tasks (PR poller) can post too.
client: AsyncWebClient | None = None


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


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        log.warning("invalid %s=%r; falling back to %s", name, raw, default)
        return default


# Sessions idle longer than this are closed by the background reaper. The
# subprocess exits, freeing ~80–130 MB resident. Default: 4 hours. Set to 0
# (or negative) to disable eviction. Threads keep working — the next reply
# in an evicted thread just spawns a fresh `claude` subprocess.
_session_idle_timeout = _float_env("SESSION_IDLE_TIMEOUT_S", 14400.0)
_session_reap_interval = _float_env("SESSION_REAP_INTERVAL_S", 300.0)

sessions = SessionManager(
    cwd=os.getenv("CLAUDE_CWD", os.path.expanduser("~")),
    permission_mode=os.getenv("CLAUDE_PERMISSION_MODE", "bypassPermissions"),
    model=os.getenv("CLAUDE_MODEL") or None,
    setting_sources=_parse_sources(
        os.getenv("CLAUDE_SETTING_SOURCES", "user,project,local")
    ),
    extra_args=_extra_args,
    system_prompt_append=SLACK_FORMATTING_PROMPT,
    idle_timeout_s=(_session_idle_timeout if _session_idle_timeout > 0 else None),
    reap_interval_s=_session_reap_interval,
)

# Optional sidecar channel that gets a per-turn progress message (header,
# tool-use lines, final ✅/❌). Channel ID like "C0123…", not "#botspeak" —
# the bot must be invited to the channel.
BOTSPEAK_CHANNEL = os.getenv("BOTSPEAK_CHANNEL") or None

# When a GitHub PR is found with PR_REVIEW_LOGIN as a requested reviewer,
# announce it in this channel and start a Slack thread asking the bot to
# review. Unset to disable the poller.
PR_REVIEW_CHANNEL = os.getenv("PR_REVIEW_CHANNEL") or None
PR_REVIEW_LOGIN = os.getenv("PR_REVIEW_LOGIN", "bizzy-btbot")
PR_POLL_INTERVAL_S = _float_env("PR_POLL_INTERVAL_S", 60.0)

# How often to poll Slack for new messages, and whether to also watch for
# @-mentions of the operator (via search.messages — needs the search:read
# scope and lags a few seconds). DMs are always watched. Note that
# conversations.history (one call per DM per cycle) is a Tier-3 method
# (~50 req/min), so the sustainable interval scales with how many DMs you
# have: roughly interval_s >= active_DMs * 60 / 50.
SLACK_POLL_INTERVAL_S = _float_env("SLACK_POLL_INTERVAL_S", 10.0)
SLACK_WATCH_MENTIONS = _truthy(os.getenv("SLACK_WATCH_MENTIONS"))

_self_user_id: str | None = None


async def get_self_user_id(client) -> str:
    global _self_user_id
    if _self_user_id is None:
        auth = await client.auth_test()
        _self_user_id = auth["user_id"]
    return _self_user_id


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
    self_id = await get_self_user_id(client)
    text = text.replace(f"<@{self_id}>", "").strip()
    if not text:
        return

    channel = event["channel"]
    user = event.get("user", "?")
    reply_thread = thread_ts_for_reply(event)
    skey = session_key(event)

    # `/clear` was a slash command under the bot; without an app there's no
    # slash command, so accept it (or `!clear`) as plain text instead.
    if text.lower() in ("/clear", "!clear"):
        log.info("clear command user=%s channel=%s session=%s", user, channel, skey)
        cleared = await sessions.drop(skey)
        await client.chat_postMessage(
            channel=channel,
            thread_ts=reply_thread,
            text="🧹 Session cleared." if cleared else "_No active session here._",
        )
        return

    new_session = not sessions.exists(skey)

    log.info(
        "incoming message channel=%s user=%s session=%s new=%s len=%d",
        channel, user, skey, new_session, len(text),
    )
    log.debug("incoming text: %s", text)

    streamer = SlackStreamer(client, channel, reply_thread)
    await streamer.open()

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

    transcript = io.StringIO()
    transcript.write(
        f"=== {time.strftime('%Y-%m-%d %H:%M:%S')} session={skey} user={user} ===\n\n"
    )
    transcript.write(f"[user]\n{text}\n\n")
    tool_count = 0
    last_result_summary = ""
    error: Exception | None = None

    try:
        async for chunk in session.send(text):
            if chunk.kind == "text":
                await streamer.append(chunk.text)
                transcript.write(f"[assistant]\n{chunk.text}\n\n")
            elif chunk.kind == "tool_use":
                tool_count += 1
                transcript.write(f"{chunk.text}\n\n")
                await botspeak.add_tool(chunk.name, chunk.args)
            elif chunk.kind == "tool_result":
                if chunk.is_error:
                    await botspeak.add_tool_error(chunk.text)
            elif chunk.kind == "result":
                if chunk.text:
                    transcript.write(f"[result] {chunk.text}\n")
                    last_result_summary = chunk.text
        await streamer.flush(force=True)
    except Exception as e:
        error = e
        log.exception("session error on %s", skey)
        transcript.write(f"\n[error] {type(e).__name__}: {e}\n")
        await streamer.replace_with(f":warning: error: `{e}`")

    await botspeak.finish(
        last_result_summary,
        error=f"{type(error).__name__}: {error}" if error else None,
    )

    if tool_count > 0 or error is not None:
        await _upload_transcript(
            client, channel, reply_thread, skey, transcript.getvalue(),
        )


async def _upload_transcript(
    client, channel: str, thread_ts: str | None, skey: str, content: str,
) -> None:
    safe_key = skey.replace(":", "-").replace(".", "-")
    filename = f"transcript-{safe_key}-{int(time.time())}.txt"
    try:
        await client.files_upload_v2(
            channel=channel,
            thread_ts=thread_ts,
            content=content,
            filename=filename,
            title=f"transcript ({skey})",
            snippet_type="text",
        )
    except Exception:
        log.exception("transcript upload failed for %s", skey)


async def _on_pr_review_requested(pr: PR) -> None:
    """Poller callback: announce the request in PR_REVIEW_CHANNEL, then kick
    off a Slack thread asking the agent to review the PR. The session in that
    thread runs the agent's normal `review` flow.
    """
    if not PR_REVIEW_CHANNEL or client is None:
        log.warning("PR_REVIEW_CHANNEL unset or client not ready; ignoring %s", pr.key)
        return

    announce = (
        f"📬 *PR review requested* — <{pr.url}|{pr.repo}#{pr.number}>\n"
        f"> {pr.title}"
    )
    try:
        resp = await client.chat_postMessage(
            channel=PR_REVIEW_CHANNEL, text=announce,
        )
    except SlackApiError:
        log.exception("PR announcement post failed for %s", pr.url)
        return
    parent_ts = resp["ts"]

    # Synthesize an event so handle_user_message can run the normal pipeline
    # (streaming reply, transcript, botspeak) for a self-initiated turn.
    # `user` isn't a real Slack user_id — it'll render as raw text in the
    # botspeak header, which is fine and signals "automated trigger".
    synthesized = {
        "channel": PR_REVIEW_CHANNEL,
        "channel_type": "channel",
        "user": "pr-poller",
        "ts": parent_ts,
        "thread_ts": parent_ts,
        "text": f"/review-pr {pr.url}",
    }
    try:
        await handle_user_message(synthesized, client)
    except Exception:
        log.exception("handle_user_message failed for PR %s", pr.url)


pr_poller = PRPoller(
    login=PR_REVIEW_LOGIN,
    on_new=_on_pr_review_requested,
    interval_s=PR_POLL_INTERVAL_S,
)


async def main() -> None:
    global client, _self_user_id
    client = AsyncWebClient(token=_load_user_token())
    # Honor Slack's Retry-After on 429s automatically instead of dropping the
    # call. Polling is rate-limit sensitive (conversations.history is Tier 3).
    client.retry_handlers.append(
        AsyncRateLimitErrorRetryHandler(max_retry_count=3)
    )
    auth = await client.auth_test()
    _self_user_id = auth["user_id"]
    log.info(
        "authenticated as user=%s id=%s team=%s",
        auth.get("user"), _self_user_id, auth.get("team"),
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    sessions.start_reaper()

    msg_poller = MessagePoller(
        client,
        _self_user_id,
        on_message=lambda event: handle_user_message(event, client),
        interval_s=SLACK_POLL_INTERVAL_S,
        watch_mentions=SLACK_WATCH_MENTIONS,
    )
    msg_poller.start()

    if PR_REVIEW_CHANNEL:
        pr_poller.start()
    else:
        log.info("PR_REVIEW_CHANNEL unset; PR poller disabled")

    log.info("polling slack as user %s; waiting for messages", _self_user_id)
    try:
        await stop.wait()
    finally:
        log.info("shutting down")
        await msg_poller.stop()
        await pr_poller.stop()
        await sessions.close_all()


if __name__ == "__main__":
    asyncio.run(main())
