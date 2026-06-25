"""Polls Slack for new messages to respond to, using the operator's user token.

A Slack *user* token can't subscribe to the Events API / Socket Mode the way a
bot can, so instead of receiving pushes we poll. Three sources:

  - DMs: every direct-message conversation the user is in. Any incoming message
    (from someone other than the operator) triggers a turn.
  - Mentions (optional, SLACK_WATCH_MENTIONS=1): `search.messages` for the
    user's own @-mention. Best-effort — search indexing lags a few seconds and
    needs the `search:read` scope. A mention is what pulls the agent into a
    channel thread.
  - Followed threads: once a mention pulls the agent into a thread, that thread
    is polled with `conversations.replies` (instant, no search lag) so *every*
    follow-up reply is answered without re-@-mentioning. A thread stops being
    followed after `thread_follow_ttl_s` of inactivity; re-mention to revive it.

On startup the poller *seeds*: it records the latest timestamp in each existing
DM and stamps a start time, so it only ever fires on messages that arrive
*after* startup. Old backlog is never answered.

For each new message it synthesizes an event dict shaped like the Slack event
payloads `handle_user_message` already consumes, and calls the `on_message`
callback with it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Optional

from slack_sdk.errors import SlackApiError

log = logging.getLogger("claude-slack-bot.msg-poller")

EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


class MessagePoller:
    def __init__(
        self,
        client,
        self_user_id: str,
        on_message: EventCallback,
        interval_s: float = 10.0,
        watch_mentions: bool = False,
        dm_list_refresh_s: float = 60.0,
        thread_follow_ttl_s: float = 3600.0,
    ):
        self._client = client
        self._self_user_id = self_user_id
        self._on_message = on_message
        self._interval_s = interval_s
        self._watch_mentions = watch_mentions
        # The DM list rarely changes, and conversations.list is a Tier-2
        # (20/min) method — so cache it and only re-list this often. A brand
        # new DM is therefore noticed within at most this many seconds.
        self._dm_list_refresh_s = dm_list_refresh_s
        # Stop polling a followed thread after this much inactivity. Bounds how
        # many conversations.replies calls we make per cycle (Tier 3, ~50/min).
        self._thread_follow_ttl_s = thread_follow_ttl_s
        self._cached_dms: list[str] = []
        self._dms_listed_at = 0.0
        self._task: Optional[asyncio.Task] = None
        # Per-DM cursor: channel_id -> ts of the newest message we've handled.
        self._dm_cursors: dict[str, str] = {}
        # Mentions we've already dispatched (by ts), to dedup across polls.
        self._mention_seen: set[str] = set()
        # Followed channel threads: (channel, thread_root_ts) -> cursor ts of
        # the newest reply we've handled in that thread.
        self._threads: dict[tuple[str, str], str] = {}
        # Only react to messages newer than this (seeded at startup).
        self._start_ts = "0"

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(), name="message-poller")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _loop(self) -> None:
        self._start_ts = f"{time.time():.6f}"
        try:
            await self._seed()
        except Exception:
            log.exception("message poller seed failed")
        log.info(
            "message poller started: interval=%ss watch_mentions=%s",
            self._interval_s, self._watch_mentions,
        )
        while True:
            try:
                await asyncio.sleep(self._interval_s)
                await self._poll_dms()
                if self._watch_mentions:
                    await self._poll_mentions()
                # Followed threads are only ever populated via mentions, so this
                # is a no-op when watch_mentions is off.
                await self._poll_threads()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("message poll iteration failed")

    async def _get_dms(self, *, force: bool = False) -> list[str]:
        """DM channel ids, cached for `dm_list_refresh_s` to spare the
        Tier-2 conversations.list budget."""
        now = time.monotonic()
        if not force and self._cached_dms and (
            now - self._dms_listed_at < self._dm_list_refresh_s
        ):
            return self._cached_dms
        self._cached_dms = await self._list_dms()
        self._dms_listed_at = now
        return self._cached_dms

    async def _list_dms(self) -> list[str]:
        """Channel ids of all (non-archived) direct messages the user is in."""
        ids: list[str] = []
        cursor: Optional[str] = None
        while True:
            resp = await self._client.conversations_list(
                types="im",
                exclude_archived=True,
                limit=200,
                cursor=cursor,
            )
            for c in resp.get("channels", []):
                if not c.get("is_user_deleted"):
                    ids.append(c["id"])
            cursor = (resp.get("response_metadata") or {}).get("next_cursor")
            if not cursor:
                break
        return ids

    async def _seed(self) -> None:
        dms = await self._get_dms(force=True)
        for cid in dms:
            try:
                resp = await self._client.conversations_history(channel=cid, limit=1)
                msgs = resp.get("messages", [])
                if msgs:
                    self._dm_cursors[cid] = msgs[0]["ts"]
            except SlackApiError:
                log.exception("seed history failed for %s", cid)
        log.info("message poller seeded %d DM(s)", len(self._dm_cursors))

    async def _poll_dms(self) -> None:
        for cid in await self._get_dms():
            # New conversations (opened after startup) have no cursor yet; only
            # pick up messages that arrived after we started.
            oldest = self._dm_cursors.get(cid, self._start_ts)
            try:
                resp = await self._client.conversations_history(
                    channel=cid, oldest=oldest, limit=50,
                )
            except SlackApiError:
                log.exception("conversations.history failed for %s", cid)
                continue
            # Slack returns newest-first; handle oldest-first.
            messages = list(reversed(resp.get("messages", [])))
            newest = oldest
            for m in messages:
                ts = m.get("ts", "")
                if ts and ts > newest:
                    newest = ts
                if not self._is_actionable(m):
                    continue
                await self._dispatch_dm(cid, m)
            self._dm_cursors[cid] = newest

    def _is_actionable(self, m: dict[str, Any]) -> bool:
        # Skip our own messages (the operator's, including the agent's replies),
        # bot messages, edits, joins, and other subtyped events.
        if m.get("subtype") or m.get("bot_id"):
            return False
        if m.get("user") == self._self_user_id:
            return False
        return bool(m.get("text"))

    async def _dispatch_dm(self, channel: str, m: dict[str, Any]) -> None:
        event = {
            "channel": channel,
            "channel_type": "im",
            "user": m.get("user", "?"),
            "ts": m["ts"],
            "thread_ts": m.get("thread_ts"),
            "text": m.get("text", ""),
        }
        try:
            await self._on_message(event)
        except Exception:
            log.exception("on_message failed for DM %s ts=%s", channel, m.get("ts"))

    async def _poll_mentions(self) -> None:
        query = f"<@{self._self_user_id}>"
        try:
            resp = await self._client.search_messages(
                query=query, sort="timestamp", sort_dir="desc", count=20,
            )
        except SlackApiError:
            log.exception("search.messages failed")
            return
        matches = ((resp.get("messages") or {}).get("matches")) or []
        for match in matches:
            ts = match.get("ts", "")
            if not ts or ts <= self._start_ts or ts in self._mention_seen:
                continue
            if match.get("user") == self._self_user_id:
                continue
            self._mention_seen.add(ts)
            channel = (match.get("channel") or {}).get("id")
            if not channel:
                continue
            # Reply in a thread hung off the mentioning message (or the thread
            # it's already in). That same root keys the followed-thread cursor.
            root = match.get("thread_ts") or ts
            tkey = (channel, root)
            if tkey in self._threads:
                # Already following this thread — the thread poller will pick
                # this message up via conversations.replies. Don't double-send.
                continue
            self._threads[tkey] = ts
            event = {
                "channel": channel,
                "channel_type": "channel",
                "user": match.get("user", "?"),
                "ts": ts,
                "thread_ts": root,
                "text": match.get("text", ""),
            }
            try:
                await self._on_message(event)
            except Exception:
                log.exception("on_message failed for mention ts=%s", ts)

    async def _poll_threads(self) -> None:
        if not self._threads:
            return
        now = time.time()
        # Drop threads that have gone quiet so the replies-call count stays bounded.
        for tkey, cursor in list(self._threads.items()):
            try:
                age = now - float(cursor)
            except ValueError:
                age = 0.0
            if age > self._thread_follow_ttl_s:
                del self._threads[tkey]
        for (channel, root), cursor in list(self._threads.items()):
            try:
                resp = await self._client.conversations_replies(
                    channel=channel, ts=root, oldest=cursor, limit=50,
                )
            except SlackApiError:
                log.exception("conversations.replies failed for %s/%s", channel, root)
                continue
            newest = cursor
            for m in resp.get("messages", []):
                ts = m.get("ts", "")
                # The thread parent is always returned first; skip it and
                # anything at/under the cursor we've already handled.
                if not ts or ts <= cursor:
                    continue
                if ts > newest:
                    newest = ts
                if not self._is_actionable(m):
                    continue
                await self._dispatch_thread(channel, root, m)
            self._threads[(channel, root)] = newest

    async def _dispatch_thread(self, channel: str, root: str, m: dict[str, Any]) -> None:
        event = {
            "channel": channel,
            "channel_type": "channel",
            "user": m.get("user", "?"),
            "ts": m["ts"],
            "thread_ts": root,
            "text": m.get("text", ""),
        }
        try:
            await self._on_message(event)
        except Exception:
            log.exception(
                "on_message failed for thread reply %s/%s ts=%s",
                channel, root, m.get("ts"),
            )
