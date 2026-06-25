"""One-time OAuth helper to mint a Slack *user* token (xoxp-…) for the operator.

The rest of the app acts *as a real Slack user* rather than as a bot. To do
that it needs a user token, which you get by having that user authorize the app
through Slack's OAuth v2 flow with **user scopes** (the `user_scope` param —
NOT "Sign in with Slack"/OpenID Connect, which only returns an identity token).

Run this once:

    uv run python slack_auth.py

It opens your browser to Slack's authorize page, you approve, and the token is
written to `.slack_user_token` (gitignored) and printed so you can also drop it
into `.env` as SLACK_USER_TOKEN.

Prerequisites (api.slack.com/apps -> your app):
  - "Basic Information" -> note the Client ID and Client Secret. Put them in env
    as SLACK_CLIENT_ID / SLACK_CLIENT_SECRET (or .env).
  - "OAuth & Permissions" -> "Redirect URLs" -> add the redirect this script
    uses (default http://localhost:4555/oauth/callback) and Save.
  - You do NOT need to pre-add user scopes in the UI; they're requested below.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import subprocess
import sys
import urllib.parse
import webbrowser

import aiohttp
from aiohttp import web
from dotenv import load_dotenv

# User scopes the polling app needs to read conversations and post as the user.
# Keep in sync with what message_poller.py / app.py actually call.
DEFAULT_USER_SCOPES = [
    "channels:history",
    "groups:history",
    "im:history",
    "mpim:history",
    "channels:read",
    "groups:read",
    "im:read",
    "mpim:read",
    "chat:write",
    "users:read",
    "search:read",  # only used when SLACK_WATCH_MENTIONS=1
]

AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
ACCESS_URL = "https://slack.com/api/oauth.v2.access"
TOKEN_FILE = os.path.join(os.path.dirname(__file__), ".slack_user_token")


# Path to the desktop-Chrome wrapper baked into the devcontainer image (it adds
# the container-friendly --no-sandbox flags). When present we launch it directly
# on the XFCE display rather than going through webbrowser/$BROWSER: VS Code's
# integrated terminal overrides $BROWSER with a helper that opens the link on the
# *client* machine, which can't reach the localhost callback running in here.
DESKTOP_CHROME = "/usr/local/bin/google-chrome"


def _open_browser(url: str) -> None:
    if os.path.exists(DESKTOP_CHROME):
        env = {**os.environ, "DISPLAY": os.getenv("DISPLAY", ":1")}
        try:
            subprocess.Popen(
                [DESKTOP_CHROME, url],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        except OSError:
            pass  # fall through to webbrowser
    webbrowser.open(url)


def _redirect_uri() -> str:
    return os.getenv("SLACK_OAUTH_REDIRECT_URI", "http://localhost:4555/oauth/callback")


def _redirect_port() -> int:
    return urllib.parse.urlparse(_redirect_uri()).port or 4555


async def _exchange_code(code: str, redirect_uri: str) -> dict:
    data = {
        "client_id": os.environ["SLACK_CLIENT_ID"],
        "client_secret": os.environ["SLACK_CLIENT_SECRET"],
        "code": code,
        "redirect_uri": redirect_uri,
    }
    async with aiohttp.ClientSession() as http:
        async with http.post(ACCESS_URL, data=data) as resp:
            return await resp.json()


async def run() -> str:
    load_dotenv()
    for required in ("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"):
        if not os.getenv(required):
            sys.exit(f"error: {required} is not set (see slack_auth.py docstring)")

    redirect_uri = _redirect_uri()
    state = secrets.token_urlsafe(16)
    result: dict[str, object] = {}
    done = asyncio.Event()

    async def callback(request: web.Request) -> web.Response:
        if request.query.get("state") != state:
            return web.Response(status=400, text="state mismatch; close and retry")
        err = request.query.get("error")
        if err:
            result["error"] = err
            done.set()
            return web.Response(text=f"Slack returned an error: {err}. You can close this tab.")
        result["code"] = request.query.get("code")
        done.set()
        return web.Response(text="Authorized. You can close this tab and return to the terminal.")

    web_app = web.Application()
    web_app.router.add_get(urllib.parse.urlparse(redirect_uri).path, callback)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, "localhost", _redirect_port())
    await site.start()

    params = urllib.parse.urlencode({
        "client_id": os.environ["SLACK_CLIENT_ID"],
        "user_scope": ",".join(DEFAULT_USER_SCOPES),
        "redirect_uri": redirect_uri,
        "state": state,
    })
    authorize = f"{AUTHORIZE_URL}?{params}"
    print("Opening browser to authorize. If it doesn't open, visit:\n", authorize)
    _open_browser(authorize)

    try:
        await asyncio.wait_for(done.wait(), timeout=300)
    except asyncio.TimeoutError:
        await runner.cleanup()
        sys.exit("error: timed out waiting for Slack authorization")
    await runner.cleanup()

    if result.get("error") or not result.get("code"):
        sys.exit(f"error: authorization failed: {result.get('error', 'no code returned')}")

    payload = await _exchange_code(str(result["code"]), redirect_uri)
    if not payload.get("ok"):
        sys.exit(f"error: token exchange failed: {payload.get('error')}")

    authed_user = payload.get("authed_user") or {}
    token = authed_user.get("access_token")
    if not token:
        sys.exit(f"error: no user access_token in response: {payload}")

    with open(TOKEN_FILE, "w") as f:
        f.write(token + "\n")
    os.chmod(TOKEN_FILE, 0o600)

    print(f"\nUser token saved to {TOKEN_FILE} (and printed below).")
    print(f"Authorized as user id: {authed_user.get('id')}")
    print(f"Granted scopes: {authed_user.get('scope')}")
    print(f"\nSet this in your environment / .env:\n  SLACK_USER_TOKEN={token}")
    return token


if __name__ == "__main__":
    asyncio.run(run())
