"""OAuth v2 installer for this bot's Slack app — mints and saves the bot token.

Assumes you've already *created* the Slack app (in the UI) and configured it
with the bot scopes + the redirect URL below. (To configure it in one shot,
paste the output of `python install.py --show-manifest` into the app's
Features -> App Manifest editor.)

This runs the OAuth v2 authorization-code flow:

    python install.py

It opens Slack's authorize page, catches the redirect (with ?code=) on a
localhost server, and exchanges the code for a bot token in-process
(oauth.v2.access) — Slack never displays the token. The bot token (xoxb-...)
is written to .env as SLACK_BOT_TOKEN. A successful exchange is the
install-completion signal.

Prerequisites in .env (copy from the app's Basic Information page):
    SLACK_CLIENT_ID, SLACK_CLIENT_SECRET

The redirect URI defaults to http://localhost:4555/oauth/callback and is
configurable via SLACK_OAUTH_REDIRECT_URI; it must exactly match a redirect URL
registered on the app.

Still manual afterward (no Slack API for it): the app-level token (xapp-...)
that Socket Mode needs — Basic Information -> App-Level Tokens, scope
`connections:write` -> SLACK_APP_TOKEN.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
ACCESS_URL = "https://slack.com/api/oauth.v2.access"

DEFAULT_REDIRECT_URI = "http://localhost:4555/oauth/callback"
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

DESCRIPTION = "Drives a persistent Claude Code session per Slack thread."

# Bot token scopes — must match what app.py actually uses (see README). These
# are requested in the OAuth authorize URL and listed in --show-manifest.
BOT_SCOPES = [
    "app_mentions:read",
    "chat:write",
    "channels:history",
    "groups:history",
    "im:history",
    "mpim:history",
    "im:read",
    "im:write",
    "users:read",
    "commands",
    "files:write",
]

# Bot events. With Socket Mode on they need no request URL.
BOT_EVENTS = [
    "app_mention",
    "message.channels",
    "message.groups",
    "message.im",
    "message.mpim",
]


# --- .env helpers (stdlib; avoids a python-dotenv dependency here) -----------

def read_env_file(path: str) -> dict[str, str]:
    """Parse KEY=VALUE lines from a .env file (ignores blanks/comments)."""
    values: dict[str, str] = {}
    if not os.path.exists(path):
        return values
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def config(key: str, env_file: dict[str, str]) -> str | None:
    """Real environment variables win; fall back to the .env file."""
    return os.getenv(key) or env_file.get(key)


def upsert_env(path: str, key: str, value: str) -> None:
    """Set key=value in the .env file, replacing an existing line or appending."""
    line = f"{key}={value}"
    lines: list[str] = []
    found = False
    if os.path.exists(path):
        with open(path) as f:
            lines = f.read().splitlines()
        for i, existing in enumerate(lines):
            if existing.split("=", 1)[0].strip() == key:
                lines[i] = line
                found = True
                break
    if not found:
        lines.append(line)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


# --- manifest (reference only; printed by --show-manifest) -------------------

def build_manifest(name: str, redirect_uri: str) -> dict:
    """The Slack app manifest for one coder bot — paste into the app's App
    Manifest editor to set scopes, events, /clear, Socket Mode, and the OAuth
    redirect URL in one shot. Not used by the install flow itself."""
    return {
        "display_information": {
            "name": name,
            "description": DESCRIPTION,
        },
        "features": {
            "bot_user": {
                "display_name": name,
                "always_online": True,
            },
            "slash_commands": [
                {
                    "command": "/clear",
                    "description": "Reset Claude session in this thread/DM.",
                    "should_escape": False,
                }
            ],
        },
        "oauth_config": {
            "redirect_urls": [redirect_uri],
            "scopes": {"bot": BOT_SCOPES},
        },
        "settings": {
            "event_subscriptions": {"bot_events": BOT_EVENTS},
            "interactivity": {"is_enabled": False},
            "org_deploy_enabled": False,
            "socket_mode_enabled": True,
            "token_rotation_enabled": False,
        },
    }


# --- OAuth v2 install --------------------------------------------------------

def _open(url: str) -> bool:
    try:
        return webbrowser.open(url)
    except Exception:
        return False


def _exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    """Trade the authorization code for tokens (oauth.v2.access). This call is
    the backend half of the install — Slack never shows the token in a UI."""
    body = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }
    ).encode()
    req = urllib.request.Request(
        ACCESS_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _capture_code(redirect_uri: str, state: str, timeout_s: float = 300.0) -> dict:
    """Serve the redirect URI locally until Slack hits it with ?code=&state=."""
    parsed = urllib.parse.urlparse(redirect_uri)
    path = parsed.path or "/"
    port = parsed.port or 80
    result: dict[str, str] = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (stdlib naming)
            req = urllib.parse.urlparse(self.path)
            if req.path != path:
                self.send_response(404)
                self.end_headers()
                return
            q = urllib.parse.parse_qs(req.query)
            got_state = (q.get("state") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            if got_state != state:
                self.wfile.write(b"state mismatch; close this tab and retry.")
                return
            if q.get("error"):
                result["error"] = q["error"][0]
                self.wfile.write(b"Slack returned an error. Check the terminal.")
            else:
                result["code"] = (q.get("code") or [""])[0]
                self.wfile.write(b"Authorized. Close this tab and return to the terminal.")
            done.set()

        def log_message(self, *_args):  # silence per-request logging
            return

    httpd = HTTPServer(("localhost", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        if not done.wait(timeout=timeout_s):
            result["error"] = "timed out waiting for Slack authorization"
    finally:
        httpd.shutdown()
    return result


def install() -> int:
    env_file = read_env_file(ENV_PATH)
    client_id = config("SLACK_CLIENT_ID", env_file)
    client_secret = config("SLACK_CLIENT_SECRET", env_file)
    redirect_uri = config("SLACK_OAUTH_REDIRECT_URI", env_file) or DEFAULT_REDIRECT_URI

    missing = [
        n
        for n, v in (("SLACK_CLIENT_ID", client_id), ("SLACK_CLIENT_SECRET", client_secret))
        if not v
    ]
    if missing:
        print(
            f"error: {', '.join(missing)} not set.\n"
            "Copy the app's Client ID and Client Secret (Basic Information) into .env.",
            file=sys.stderr,
        )
        return 1

    state = secrets.token_urlsafe(16)
    authorize = f"{AUTHORIZE_URL}?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "scope": ",".join(BOT_SCOPES),
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    print("Opening browser to authorize. If it doesn't open, visit:\n")
    print(f"  {authorize}\n")
    _open(authorize)

    result = _capture_code(redirect_uri, state)
    if result.get("error") or not result.get("code"):
        print(f"error: authorization failed: {result.get('error', 'no code returned')}", file=sys.stderr)
        return 1

    payload = _exchange_code(client_id, client_secret, result["code"], redirect_uri)
    if not payload.get("ok"):
        print(f"error: token exchange failed: {payload.get('error')}", file=sys.stderr)
        return 1

    token = payload.get("access_token")  # the bot token (xoxb-...)
    if not token:
        print(f"error: no bot access_token in response: {payload}", file=sys.stderr)
        return 1

    upsert_env(ENV_PATH, "SLACK_BOT_TOKEN", token)

    team = payload.get("team") or {}
    print("\nInstall complete — token minted in-process and saved.")
    print(f"  team:        {team.get('name')} ({team.get('id')})")
    print(f"  bot_user_id: {payload.get('bot_user_id')}")
    print(f"  scopes:      {payload.get('scope')}")
    print(f"  SLACK_BOT_TOKEN written to {ENV_PATH}")
    print(
        "\nStill manual (no Slack API for it) — Socket Mode app-level token:\n"
        "  Basic Information -> App-Level Tokens -> Generate, scope `connections:write`\n"
        "  -> copy xapp-... into .env as SLACK_APP_TOKEN.\n"
        "\nThen run the bot:  uv run python app.py"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OAuth v2 installer for the bot's Slack app (mints + saves the bot token)."
    )
    parser.add_argument(
        "--show-manifest",
        action="store_true",
        help="Print the app manifest JSON (paste into the app's App Manifest editor) and exit.",
    )
    parser.add_argument(
        "--name",
        default="claude-coder",
        help="Display name used in --show-manifest output (default: claude-coder).",
    )
    args = parser.parse_args()

    if args.show_manifest:
        env_file = read_env_file(ENV_PATH)
        redirect_uri = config("SLACK_OAUTH_REDIRECT_URI", env_file) or DEFAULT_REDIRECT_URI
        print(json.dumps(build_manifest(args.name, redirect_uri), indent=2))
        return 0

    return install()


if __name__ == "__main__":
    sys.exit(main())
