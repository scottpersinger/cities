"""Background poller for GitHub PRs that have a specific user assigned as a
requested reviewer. When a new request shows up, fires an async callback so
the bot can open a Slack thread and kick off a review.

Uses the host `gh` CLI via subprocess so we inherit the user's gh auth and
don't need to manage a GitHub token in env. If `gh` is not on PATH the
poller logs a warning and stays disabled — the rest of the bot is unaffected.

Dedup is by (repo, number). On startup the poller "seeds" — it records every
currently-pending request as already-seen and only fires on requests that
appear *after* startup. This avoids re-spamming a review channel for every
queued PR every time the bot restarts. The trade-off: a request that's open
when the bot starts is never reviewed automatically; remove and re-add the
reviewer to trigger it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

log = logging.getLogger("claude-slack-bot.pr-poller")


@dataclass
class PR:
    url: str
    title: str
    number: int
    repo: str  # "owner/name"
    updated_at: str

    @property
    def key(self) -> str:
        return f"{self.repo}#{self.number}"


class PRPoller:
    def __init__(
        self,
        login: str,
        on_new: Callable[[PR], Awaitable[None]],
        interval_s: float = 60.0,
    ):
        self._login = login
        self._on_new = on_new
        self._interval_s = interval_s
        self._seen: set[str] = set()
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        if shutil.which("gh") is None:
            log.warning(
                "`gh` CLI not on PATH; PR poller disabled. Install gh and "
                "run `gh auth login` to enable PR review polling."
            )
            return
        self._task = asyncio.create_task(self._loop(), name="pr-poller")
        log.info(
            "PR poller started: login=%s interval=%ss",
            self._login, self._interval_s,
        )

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
        # Seed: record current state without firing on_new, so we only act
        # on requests that appear after startup.
        try:
            initial = await self._fetch()
            self._seen = {p.key for p in initial}
            log.info(
                "PR poller seeded with %d existing requests for %s",
                len(self._seen), self._login,
            )
        except Exception:
            log.exception("PR poller initial fetch failed")

        while True:
            try:
                await asyncio.sleep(self._interval_s)
                prs = await self._fetch()
                # Trim _seen of PRs that are no longer in the queue (closed,
                # reviewed, or reviewer removed) so the set doesn't grow.
                current_keys = {p.key for p in prs}
                self._seen.intersection_update(current_keys)

                new = [p for p in prs if p.key not in self._seen]
                for pr in new:
                    self._seen.add(pr.key)
                    log.info("new PR review request: %s — %s", pr.key, pr.title)
                    try:
                        await self._on_new(pr)
                    except Exception:
                        log.exception(
                            "on_new callback failed for %s", pr.key,
                        )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("PR poll iteration failed")

    async def _fetch(self) -> list[PR]:
        proc = await asyncio.create_subprocess_exec(
            "gh", "search", "prs",
            "--review-requested", self._login,
            "--state", "open",
            "--json", "url,title,number,repository,updatedAt",
            "--limit", "100",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            log.warning(
                "gh search prs failed rc=%d stderr=%s",
                proc.returncode, stderr.decode(errors="replace")[:500],
            )
            return []
        try:
            items = json.loads(stdout.decode() or "[]")
        except json.JSONDecodeError:
            log.exception("gh output not JSON: %r", stdout[:200])
            return []
        out: list[PR] = []
        for it in items:
            repo_obj = it.get("repository") or {}
            # gh returns the repo as an object with nameWithOwner; older
            # versions used `name` for the full slug. Fall back gracefully.
            repo = (
                repo_obj.get("nameWithOwner")
                or repo_obj.get("name")
                or "?"
            )
            out.append(PR(
                url=it.get("url", ""),
                title=it.get("title", ""),
                number=int(it.get("number", 0)),
                repo=repo,
                updated_at=it.get("updatedAt", ""),
            ))
        return out
