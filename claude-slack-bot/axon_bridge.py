"""Axon → Claude bridge (the in-codespace consumer).

The one-way counterpart to Central's publisher (see central/docs/axon-event-bus.md
and the proven spike in central/spikes/axon/). This process runs *inside the
codespace*, subscribes to the codespace's Axon over SSE, drives one persistent
Claude session per `thread_key`, and posts replies straight back to Slack with
the codespace's own bot token. Nothing is published back through the Axon.

Run:  uv run python axon_bridge.py

Two transports, selected by env (see docs/axon-multitenant-security.md):

  * Relay mode (AXON_RELAY_URL set) — multi-tenant safe. Subscribe through
    Central's relay with a per-codespace bearer token (AXON_RELAY_TOKEN) that
    Central maps to exactly this codespace's Axon. No Runloop key and no
    account-wide axon listing live in the codespace, so a compromised codespace
    can reach only its own Axon.

  * Direct mode (legacy, default when AXON_RELAY_URL is unset) — the codespace
    holds the account RUNLOOP_API_KEY and talks to Runloop directly. Runloop has
    no per-axon authorization, so that key can read/publish every tenant's Axon.
    Only safe single-tenant or with the interim mitigations in the doc.

Direct mode resolves the Axon by:
  1. AXON_ID env var (preferred — Central injects it; no account-wide read), else
  2. listing axons by name `cs-<CODESPACE_NAME>` (requires an account-scoped key;
     disable with AXON_ALLOW_NAME_LOOKUP=0).

Required env:
  * SLACK_BOT_TOKEN, always.
  * Relay mode:  AXON_RELAY_URL + AXON_RELAY_TOKEN.
  * Direct mode: RUNLOOP_API_KEY + (AXON_ID or CODESPACE_NAME).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import signal
import time
from dataclasses import dataclass
from typing import Any, Optional

import aiohttp
from dotenv import load_dotenv
from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.errors import SlackApiError

from session_manager import SessionManager

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("axon-bridge")

RUNLOOP_BASE_URL = os.getenv("RUNLOOP_BASE_URL", "https://api.runloop.ai")

# Slack mrkdwn formatting guidance (same intent as app.py's prompt) so replies
# render correctly when the agent posts them.
SLACK_FORMATTING_PROMPT = """\
Your replies are posted directly to Slack. Format every response in Slack's
"mrkdwn" dialect, not standard or GitHub-flavored Markdown:
- Bold: *single asterisks* (NOT **double**). Italic: _underscores_.
- Inline code: `backticks`. Code blocks: triple backticks (no language tag).
- Links: <https://example.com|label> — NEVER [label](url).
- Headings (#, ##) do not render — use a *bold* line instead.
Keep output tight: Slack threads are narrow."""

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
    same whether driven from Slack Socket Mode or from the Axon."""
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
    try:
        async for chunk in session.send(text):
            if chunk.kind == "text":
                await renderer.append(chunk.text)
        await renderer.flush(force=True)
    except Exception as e:  # noqa: BLE001 — surface any turn failure to Slack
        log.exception("session error on %s", thread_key)
        await renderer.replace_with(f":warning: error: `{e}`")


async def handle_session_clear(payload: dict[str, Any], sessions: SessionManager) -> None:
    thread_key = payload.get("thread_key")
    if not thread_key:
        return
    cleared = await sessions.drop(thread_key)
    log.info("session.clear thread=%s cleared=%s", thread_key, cleared)


async def dispatch(
    event: dict[str, Any], sessions: SessionManager, slack: AsyncWebClient
) -> None:
    et = event.get("event_type")
    try:
        payload = json.loads(event.get("payload") or "{}")
    except (TypeError, json.JSONDecodeError):
        log.warning("unparseable payload on seq=%s", event.get("sequence"))
        return
    if et == "user.message":
        await handle_user_message(payload, sessions, slack)
    elif et == "session.clear":
        await handle_session_clear(payload, sessions)
    else:
        log.debug("ignoring event_type=%s seq=%s", et, event.get("sequence"))


async def resolve_axon_id(http: aiohttp.ClientSession, api_key: str) -> str:
    """Find this codespace's Axon by its deterministic name, `cs-<CODESPACE_NAME>`.

    Central names each codespace's Axon after the codespace, so the bridge can
    resolve its own id from `CODESPACE_NAME` alone — no callback to Central, no
    bootstrap secret, and Central need not be reachable from here. `AXON_ID`
    short-circuits this (handy for local testing).
    """
    direct = os.getenv("AXON_ID")
    if direct:
        log.info("using AXON_ID from env: %s", direct)
        return direct

    # Falling back to the account-wide list. This requires a Runloop key that can
    # read *every* axon in the account, which is not multi-tenant-isolated — a
    # compromised codespace could enumerate and subscribe to other tenants' axons.
    # Central should inject AXON_ID directly (it names axons deterministically) so
    # this path is never taken in production. See docs/axon-multitenant-security.md.
    if not _truthy(os.getenv("AXON_ALLOW_NAME_LOOKUP", "1")):
        raise SystemExit(
            "AXON_ID not set and name lookup disabled (AXON_ALLOW_NAME_LOOKUP=0). "
            "Provision AXON_ID directly, or use relay mode (AXON_RELAY_URL)."
        )
    log.warning(
        "SECURITY: resolving axon via account-wide list (GET /v1/axons); this needs "
        "an account-scoped Runloop key and is not multi-tenant-isolated. Prefer "
        "injecting AXON_ID or using AXON_RELAY_URL — see docs/axon-multitenant-security.md."
    )

    codespace = os.environ["CODESPACE_NAME"]  # always set inside a codespace
    name = f"cs-{codespace}"
    log.info("resolving axon by name: %s", name)
    headers = {"Authorization": f"Bearer {api_key}"}
    async with http.get(
        f"{RUNLOOP_BASE_URL}/v1/axons",
        params={"name": name, "limit": "100"},
        headers=headers,
    ) as r:
        r.raise_for_status()
        data = await r.json()

    # `name` is a *prefix* match, so filter to an exact name. If more than one
    # remains (a recreated codespace / recycled Axon), prefer the most recent.
    exact = [a for a in data.get("axons", []) if a.get("name") == name]
    if not exact:
        raise SystemExit(f"no Axon named {name!r} found — was the codespace provisioned by Central?")
    exact.sort(key=lambda a: a.get("created_at_ms") or 0, reverse=True)
    axon_id = exact[0]["id"]
    if len(exact) > 1:
        log.warning("%d axons named %s; using most recent %s", len(exact), name, axon_id)
    log.info("resolved %s -> %s", name, axon_id)
    return axon_id


# Where the last-processed Axon sequence is persisted so a restart resumes past
# events it already handled instead of replaying the whole log (Axon is an
# append-only stream with no per-subscriber ack — the consumer owns its offset).
# Defaults to the bridge dir, which lives on the /workspaces volume that persists
# across codespace stop/start.
SEQ_DIR = os.getenv("AXON_SEQ_DIR") or os.path.dirname(os.path.abspath(__file__))


def _seq_path(key: str) -> str:
    return os.path.join(SEQ_DIR, f".axon-{key}.seq")


def load_seq(key: str) -> int:
    """Last sequence we durably recorded for this stream, or -1 if none."""
    try:
        with open(_seq_path(key)) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return -1


def save_seq(key: str, seq: int) -> None:
    """Persist the read offset atomically (write-then-rename). Best-effort: a
    failure here just risks reprocessing on a future restart, never a crash."""
    path = _seq_path(key)
    tmp = f"{path}.tmp"
    try:
        with open(tmp, "w") as f:
            f.write(str(seq))
        os.replace(tmp, path)
    except OSError as e:
        log.warning("could not persist axon sequence %s: %s", seq, e)


@dataclass
class Transport:
    """How the bridge reaches its event stream. Built once at startup so the SSE
    loop is identical whether we go through Central's relay or straight to
    Runloop — only the URL, auth header, and seq-file key differ."""

    subscribe_url: str  # full SSE endpoint, ready to GET with after_sequence params
    headers: dict[str, str]  # auth + Accept; never logged
    seq_key: str  # stable id for the persisted read offset (.axon-<seq_key>.seq)


async def build_transport(http: aiohttp.ClientSession) -> Transport:
    """Pick relay (multi-tenant safe) or direct (legacy) transport from env.

    Relay mode keeps the Runloop key out of the codespace entirely: Central holds
    it, validates the per-codespace bearer token, and proxies only this
    codespace's Axon. See docs/axon-multitenant-security.md.
    """
    relay = os.getenv("AXON_RELAY_URL")
    if relay:
        token = os.environ["AXON_RELAY_TOKEN"]  # presence enforced by _missing_config
        base = relay.rstrip("/")
        # The relay is already scoped to this codespace's Axon, so there is no axon
        # id in the path — Central resolves it from the token.
        url = f"{base}/subscribe/sse"
        key = os.getenv("CODESPACE_NAME") or "relay"
        log.info("transport: Central relay at %s (no Runloop key in codespace)", base)
        return Transport(
            subscribe_url=url,
            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
            seq_key=f"relay-{key}",
        )

    api_key = os.environ["RUNLOOP_API_KEY"]  # presence enforced by _missing_config
    axon_id = await resolve_axon_id(http, api_key)
    log.info("transport: direct to Runloop, axon %s", axon_id)
    return Transport(
        subscribe_url=f"{RUNLOOP_BASE_URL}/v1/axons/{axon_id}/subscribe/sse",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "text/event-stream"},
        seq_key=axon_id,
    )


async def consume(
    http: aiohttp.ClientSession,
    transport: Transport,
    sessions: SessionManager,
    slack: AsyncWebClient,
    stop: asyncio.Event,
) -> None:
    """Subscribe to the Axon SSE stream and dispatch events. Tracks the last
    sequence and reconnects from it on idle timeout (408) or disconnect — the
    resume strategy proven in the spike (design §10)."""
    url = transport.subscribe_url
    headers = transport.headers
    seq_key = transport.seq_key
    # Resume past what we already processed across restarts, not just reconnects.
    after_seq = load_seq(seq_key)
    if after_seq >= 0:
        log.info("resuming from persisted sequence %s", after_seq)
    # Hold references to in-flight turn tasks so they aren't garbage-collected
    # mid-execution (asyncio keeps only weak refs to bare create_task results).
    inflight: set[asyncio.Task] = set()

    while not stop.is_set():
        params = {"after_sequence": str(after_seq)} if after_seq >= 0 else {}
        try:
            async with http.get(url, headers=headers, params=params) as resp:
                if resp.status == 408:
                    log.info("idle timeout (408); reconnecting from seq=%s", after_seq)
                    continue
                if resp.status != 200:
                    body = await resp.text()
                    log.error("subscribe HTTP %s: %s", resp.status, body[:300])
                    await asyncio.sleep(2)
                    continue
                log.info("subscribed to %s (after_sequence=%s)", seq_key, after_seq)
                event_name: Optional[str] = None
                data_lines: list[str] = []
                async for raw in resp.content:
                    line = raw.decode("utf-8").rstrip("\r\n")
                    if line == "":  # dispatch the buffered event
                        if data_lines:
                            data = "\n".join(data_lines)
                            if event_name == "error":
                                log.error("stream error: %s", data)
                            else:
                                evt = json.loads(data)
                                after_seq = evt.get("sequence", after_seq)
                                # Persist the offset as we advance it (matches the
                                # in-memory reconnect-resume semantics) so a restart
                                # doesn't replay the whole log.
                                save_seq(seq_key, after_seq)
                                # Run the turn concurrently so the SSE loop keeps
                                # reading; per-thread ordering is held by the
                                # Session lock inside SessionManager.
                                task = asyncio.create_task(dispatch(evt, sessions, slack))
                                inflight.add(task)
                                task.add_done_callback(inflight.discard)
                        event_name, data_lines = None, []
                    elif line.startswith(":"):
                        continue
                    elif line.startswith("event:"):
                        event_name = line[len("event:"):].strip()
                    elif line.startswith("data:"):
                        data_lines.append(line[len("data:"):].lstrip(" "))
        except aiohttp.ClientError as e:
            log.warning("connection error: %s; retrying", e)
            await asyncio.sleep(2)


def _missing_config() -> list[str]:
    """Required config the bridge can't start without, given the current env.
    Call after refreshing from .env. Requirements differ by transport: relay mode
    needs only the relay URL+token (no Runloop key), direct mode needs the Runloop
    key and a way to find the axon."""
    missing = [] if os.environ.get("SLACK_BOT_TOKEN") else ["SLACK_BOT_TOKEN"]
    if os.environ.get("AXON_RELAY_URL"):
        # Relay mode: Central holds the Runloop key and resolves the axon.
        if not os.environ.get("AXON_RELAY_TOKEN"):
            missing.append("AXON_RELAY_TOKEN")
    else:
        # Direct mode: the codespace authenticates to Runloop itself.
        if not os.environ.get("RUNLOOP_API_KEY"):
            missing.append("RUNLOOP_API_KEY")
        # The axon can be given directly (AXON_ID) or resolved from CODESPACE_NAME.
        if not (os.environ.get("AXON_ID") or os.environ.get("CODESPACE_NAME")):
            missing.append("AXON_ID (or CODESPACE_NAME)")
    return missing


async def wait_for_config(poll_secs: float = 3.0) -> str:
    """Block until the required config is present, re-reading .env each time,
    then return SLACK_BOT_TOKEN. Transport credentials are read later by
    build_transport (they differ by mode).

    On a fresh codespace the bridge starts (postStartCommand / supervisord)
    before Central's provisioning has written SLACK_BOT_TOKEN / AXON_ID into
    .env. Rather than exit, we wait: reload .env and re-check every few seconds
    until the keys appear, then return. `override=True` so values written after
    the process started replace any stale/empty ones loaded at import.
    """
    warned = False
    while True:
        load_dotenv(override=True)
        missing = _missing_config()
        if not missing:
            return os.environ["SLACK_BOT_TOKEN"]
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
    slack_token = await wait_for_config()

    sessions = build_session_manager()
    slack = AsyncWebClient(token=slack_token)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    async with aiohttp.ClientSession() as http:
        transport = await build_transport(http)
        consumer = asyncio.create_task(
            consume(http, transport, sessions, slack, stop)
        )
        await stop.wait()
        log.info("shutting down")
        consumer.cancel()
        await sessions.close_all()


if __name__ == "__main__":
    asyncio.run(main())
