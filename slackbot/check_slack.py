"""Read-only smoke test for the Slack user-token setup.

Verifies the token works, shows who you're authenticated as, and lists the DMs
(and their most recent message) that the poller would watch — WITHOUT running
the agent or posting anything. Run this after slack_auth.py and before app.py:

    uv run python check_slack.py

Optionally test chat:write by posting a throwaway message to a channel/DM id:

    uv run python check_slack.py --post D0123ABCD
"""

from __future__ import annotations

import argparse
import asyncio

from slack_sdk.web.async_client import AsyncWebClient

from app import _load_user_token


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--post",
        metavar="CHANNEL_ID",
        help="post a test message to this channel/DM id to verify chat:write",
    )
    args = parser.parse_args()

    client = AsyncWebClient(token=_load_user_token())

    auth = await client.auth_test()
    self_id = auth["user_id"]
    print(f"✅ auth.test ok — user={auth.get('user')} id={self_id} team={auth.get('team')}")

    # List DMs (what _list_dms / the poller iterates).
    resp = await client.conversations_list(types="im", exclude_archived=True, limit=200)
    dms = [c for c in resp.get("channels", []) if not c.get("is_user_deleted")]
    print(f"\n📨 {len(dms)} DM conversation(s) the poller would watch:")
    for c in dms[:20]:
        cid = c["id"]
        other = c.get("user", "?")
        try:
            hist = await client.conversations_history(channel=cid, limit=1)
            msgs = hist.get("messages", [])
            if msgs:
                m = msgs[0]
                who = "you" if m.get("user") == self_id else m.get("user", "?")
                preview = (m.get("text", "") or "").replace("\n", " ")[:60]
                last = f"last: <{who}> {preview!r}"
            else:
                last = "last: (empty)"
        except Exception as e:
            last = f"history error: {e}"
        print(f"  • {cid} (with {other}) — {last}")
    if len(dms) > 20:
        print(f"  …and {len(dms) - 20} more")

    if args.post:
        print(f"\n✍️  posting a test message to {args.post} …")
        r = await client.chat_postMessage(
            channel=args.post, text="✅ SlackTroop chat:write test — you can ignore this."
        )
        print(f"   posted ts={r['ts']} (chat:write works)")

    print("\nLooks good. Start the agent with: uv run python app.py")


if __name__ == "__main__":
    asyncio.run(main())
