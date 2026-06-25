# SlackTroop

SlackTroop is your AI teammate. You communicate with it via Slack, and it accomplishes tasks on your behalf. We have been using it extensively at biztrip.ai, starting with coding tasks but expanding its scope steadily to include website updates, marketing analytics, and other design and analysis tasks.

<img width="657" height="604" alt="image" src="https://github.com/user-attachments/assets/e6bb3903-4cdc-49dd-b183-c9580c5215d6" />

SlackTroop signs in as a **real Slack user** (via OAuth) and drives a persistent local [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) process per Slack conversation. It polls Slack with that user's token, answers DMs (and, optionally, @-mentions of you) as you, and continues each conversation in-thread. Type `/clear` as a message to reset a session.

> **Note:** this is *not* a bot install. There's no bot user, no Socket Mode, and no Slash Command — SlackTroop authenticates as a human user and acts entirely on that user's behalf. Set it up against a **dedicated** Slack account, not your personal one.

It uses the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/python) to spawn the real `claude` CLI as a long-running subprocess and pipes stream-json over stdin/stdout — full tool access (Bash, Edit, Read, Write, MCP, sub-agents, etc.), no feature loss.

The key features that make SlackTroop powerful:

- Runs on a local machine, configured with a full development environment.
- Configured to have access to key infrastructure: Github, JIRA, Slack, custom MCP servers.
- Configured with `claude-in-chrome` browser extension for browser automation

Hosted `Claude Code` is not able to do very good browser automation, and has limited (or dangerous) access to your internal tools and configuration. Running in the cloud limits visiblity and debuggability.

Running locally, with the combination of browser automation and access to our key development tools, means that SlackTroop can do pretty much everything that a member of the dev team can do. And as we give it access to more tools it can increasing help with marketing, sales, and customer support.

## Features

* Interaction via Slack. Maintains separate working contexts per Slack thread so multiple people can talk to it at once.
* Acts as a real Slack user via OAuth — no bot install, and it polls with the user token so there's no need for any publicly addressable webhook endpoint.
* Supports a 'debug stream' where granular logging is sent to a dedicated Slack channel. Great for seeing exactly what the bot is doing.
* "Github poller" lets you assign SlackTroop as a PR reviewer for automated code reviews
* Easily extensible by adding new Skills. Or vibe code you some new features.
  
## Adding Skills

Once you have SlackTroop running, to get the full power you should create [Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that capture re-usable tasks and workflow. These are specific to your codebase, environment and business.

Some of the skills we use extensively include:

**review-pr** - Our own PR review skill, which teaches Claude how to run our app, run its tests, and take screenshots via browser automation. We use SlackTroop extensively to review PRs beyond code analysis but by actually running and exercising our app.

**fix-github-issues** - This skill explains how SlackTroop should pickup tasks from our Github issues list, write code, and create a PR (with screenshots) to solve the issue. 

...plus lots of skills specific to our stack and customer MCP servers.

## Architecture

```
Slack  ◀──user token──▶  message_poller.py  ──▶  app.py  ──asyncio──▶  SessionManager
        (poll DMs/mentions)                                                │
                                                                           ├── thread:T123  ──▶  claude (subprocess)
                                                                           ├── thread:T456  ──▶  claude (subprocess)
                                                                           └── dm:D789      ──▶  claude (subprocess)
```

- `slack_auth.py` mints a user token (`xoxp-…`) once via OAuth. `message_poller.py` polls Slack with it for new DMs (and optionally @-mentions), synthesizes an event, and hands it to `app.py`.
- One persistent `claude` process per Slack thread (or per DM channel).
- Each turn: user text is piped to the subprocess's stdin; assistant text and tool-use events stream back from stdout and are posted/updated in Slack **as the signed-in user**.
- Turns within a session are serialized by an `asyncio.Lock` so concurrent messages on one thread don't collide on the stdin pipe.
- Sessions live in memory; restarting the process drops them. `/clear` drops a single session.

## Setup
Most of the work to setup SlackTroop is creating accounts for the bot, creating the Slack app, and then getting everyting setup on a decidcate computer. It's basically the same work as setting up a new developer on your team.

We created a dedicated Google Workspace user and Github account for SlackTroop. This lets SlackTroop have full identity and not get confused with some actual person.

Install the Claude-in-chrome extension in local Chrome and make sure that it's working properly.

Install the 'gh' Github CLI, and authenticate, so your bot can access Github effectively.

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- The `claude` CLI installed and authenticated locally (`claude` should run from your shell without prompting).
- 
## Slack app setup (user OAuth)

SlackTroop acts **as the Slack user who authorizes it**. Do this whole section
while signed into your browser as that dedicated user (ideally in a throwaway
dev workspace) — whoever clicks **Allow** is who the agent becomes.

### A. Create the app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. `SlackTroop-test`), pick the **workspace** to develop in → **Create App**.

### B. Add the User Token Scopes

1. Left sidebar → **OAuth & Permissions**.
2. Scroll to **Scopes** → **User Token Scopes** (the lower box — *not* Bot Token Scopes).
3. **Add an OAuth Scope** for each (search by name, click to add):
   - `chat:write`
   - `channels:history`, `groups:history`, `im:history`, `mpim:history`
   - `channels:read`, `groups:read`, `im:read`, `mpim:read`
   - `users:read`
   - `files:write` — required for the per-turn transcript upload (see [Per-turn transcript](#per-turn-transcript)).
   - `search:read` — only if you'll set `SLACK_WATCH_MENTIONS=1` (adding it now saves a re-auth later).

These match `DEFAULT_USER_SCOPES` in `slack_auth.py`.

### C. Add the localhost redirect URL

1. Same page → **Redirect URLs** → **Add New Redirect URL**.
2. Enter exactly (Slack permits `http` for `localhost`):
   ```
   http://localhost:4555/oauth/callback
   ```
3. **Add** → **Save URLs**.

This must match `SLACK_OAUTH_REDIRECT_URI` character-for-character (trailing slash included).

### D. Put credentials in `.env`

1. Left sidebar → **Basic Information** → **App Credentials**.
2. Copy **Client ID** and **Client Secret** (click *Show*) into `.env`:
   ```bash
   cp .env.example .env
   ```
   ```
   SLACK_CLIENT_ID=<your client id>
   SLACK_CLIENT_SECRET=<your client secret>
   ```

### E. Set up localhost and mint the token

`slack_auth.py` *is* the localhost server: it listens on port 4555, opens your
browser to Slack's authorize page, catches the redirect, exchanges the auth
code, and saves the user token.

1. Make sure **port 4555 is free**:
   ```bash
   lsof -i :4555
   ```
   If something's using it, either stop it or pick another port — set
   `SLACK_OAUTH_REDIRECT_URI=http://localhost:<port>/oauth/callback` in `.env`
   **and** add that same URL in step C.
2. Confirm your default browser is logged into Slack as the dedicated user.
3. Run:
   ```bash
   uv run python slack_auth.py
   ```
4. Review scopes → **Allow**. The browser shows "Authorized…", and the terminal
   prints the user id + granted scopes and writes the token to `.slack_user_token`
   (gitignored). It also prints `SLACK_USER_TOKEN=…` if you'd rather keep it in `.env`.

If the workspace restricts app installs you'll hit an admin-approval wall here —
use a personal/dev workspace instead. If you change scopes later, re-run
`slack_auth.py` to re-authorize.

### F. Verify before running the agent

```bash
uv run python check_slack.py
```

Read-only — confirms `auth.test`, and lists the DMs (with their last message)
the poller will watch. Add `--post <channel-or-dm-id>` to also test `chat:write`.

> Why user scopes and not "Sign in with Slack"? *Sign in with Slack* (OpenID Connect) only returns an identity token — it can't read or post messages. The OAuth flow with **user scopes** above returns a user token that acts as the person.

## Configuration

```bash
cp .env.example .env
# fill in SLACK_CLIENT_ID and SLACK_CLIENT_SECRET, then run slack_auth.py
```

| Variable | Default | Notes |
| --- | --- | --- |
| `SLACK_CLIENT_ID` | — | required for `slack_auth.py`; from **Basic Information** |
| `SLACK_CLIENT_SECRET` | — | required for `slack_auth.py`; from **Basic Information** |
| `SLACK_USER_TOKEN` | — | user token `xoxp-…`; if unset, `app.py` reads `.slack_user_token` written by `slack_auth.py` |
| `SLACK_OAUTH_REDIRECT_URI` | `http://localhost:4555/oauth/callback` | must match a Redirect URL on the Slack app |
| `SLACK_POLL_INTERVAL_S` | `10` | how often to poll Slack for new messages, in seconds. `conversations.history` runs once per DM per cycle (Tier 3, ~50/min), so keep `interval_s >= active_DMs * 60 / 50`. |
| `SLACK_WATCH_MENTIONS` | `0` | set to `1` to also answer @-mentions of you in channels (via `search.messages`; needs `search:read`). DMs are always watched. |
| `CLAUDE_CWD` | `$HOME` | working directory each `claude` subprocess runs in |
| `CLAUDE_PERMISSION_MODE` | `bypassPermissions` | `default` / `acceptEdits` / `plan` / `bypassPermissions` |
| `CLAUDE_MODEL` | (claude default) | e.g. `claude-opus-4-7` |
| `CLAUDE_SETTING_SOURCES` | `user,project,local` | which Claude Code config layers to inherit; comma-separated subset of `user`, `project`, `local`. See [MCP servers and other settings](#mcp-servers-and-other-settings). |
| `CLAUDE_CHROME` | `0` | set to `1` to spawn `claude` with `--chrome`, enabling the Claude-in-Chrome browser MCP (requires the Chrome extension installed for this user). |
| `BOTSPEAK_CHANNEL` | — | optional channel ID (e.g. `C0123ABCD`) to mirror per-turn progress into. See [Sidecar progress channel](#sidecar-progress-channel). |
| `SESSION_IDLE_TIMEOUT_S` | `14400` | close sessions idle longer than this many seconds (default 4h). Set to `0` to disable. See [Session eviction](#session-eviction). |
| `SESSION_REAP_INTERVAL_S` | `300` | how often the reaper scans for idle sessions, in seconds. |
| `PR_REVIEW_CHANNEL` | — | when set, the bot polls GitHub for PRs that have `PR_REVIEW_LOGIN` assigned as a requested reviewer and opens a Slack thread in this channel asking the agent to review. See [PR review poller](#pr-review-poller). |
| `PR_REVIEW_LOGIN` | `bizzy-btbot` | GitHub login the poller watches as a requested reviewer. |
| `PR_POLL_INTERVAL_S` | `60` | poll interval (seconds). |
| `LOG_LEVEL` | `INFO` | set to `DEBUG` for full prompts, full assistant text, full tool args, full tool results, and thinking blocks. See [Debugging](#debugging). |

### MCP servers and other settings

By default the Claude Agent SDK does **not** read your `~/.claude` config — meaning MCP servers, slash commands, sub-agents, and skills you've set up locally are invisible to the bot. Setting `CLAUDE_SETTING_SOURCES=user,project,local` (the default here) tells the SDK to load:

- `user` — `~/.claude/settings.json` and `~/.claude.json` (your global MCP servers, etc.)
- `project` — `<CLAUDE_CWD>/.claude/settings.json` (project-level config)
- `local` — `<CLAUDE_CWD>/.claude/settings.local.json` (gitignored local overrides)

Set it to a smaller list (or empty) if you want the bot's `claude` to run with an isolated config — useful if a local MCP server you don't want exposed via Slack would otherwise be auto-loaded.

### About `CLAUDE_PERMISSION_MODE`

There is no UI in Slack to approve permission prompts, so the default is `bypassPermissions`. That means Claude can run any tool — including `Bash` — in `CLAUDE_CWD` and anywhere else its tools can reach, with no human in the loop. Treat the bot as a remote-code-execution surface scoped to whatever account it runs under, and lock down `CLAUDE_CWD` accordingly. Switch to `acceptEdits` if you want a tighter blast radius (Claude can read freely but won't write/exec without prompts — and prompts will block, since nothing answers them).

## Run

```bash
uv sync
uv run python app.py
```

On macOS, run it under `caffeinate` so the asyncio event loop isn't paused by App Nap, idle sleep, or display sleep — when the loop pauses, polling stops and replies are delayed until it wakes:

```bash
caffeinate -dimsu -- uv run python app.py
```

You should see `authenticated as user=…` and `polling slack as user …; waiting for messages`. Now just **DM the user account** SlackTroop is signed in as (from another Slack account), and it'll reply as that user:

```
what files are in the current dir?
```

Continue the conversation by replying in the same DM/thread. Send `/clear` (or `!clear`) as a message to drop the session and start fresh on the next one.

If you set `SLACK_WATCH_MENTIONS=1`, @-mentioning the user in any channel they're in also starts a threaded reply.

## PR review poller

When `PR_REVIEW_CHANNEL` is set, a background asyncio task polls GitHub every `PR_POLL_INTERVAL_S` seconds (default 60s) for open PRs that have `PR_REVIEW_LOGIN` (default `bizzy-btbot`) assigned as a requested reviewer. When a new request shows up:

1. The bot posts a top-level message in `PR_REVIEW_CHANNEL` — `📬 PR review requested — <repo>#N\n> title`.
2. The bot then kicks off a Slack thread reply in that message, prompting itself with `/review-pr <url>`. The agent picks up the `review-pr` skill (checkout in a worktree, run the app, drive the UI, capture a GIF, post a verdict back to the PR) and streams progress to the same Slack thread.

Mechanics:

- **Auth**: the poller shells out to `gh search prs`, so it inherits whatever account is logged in via `gh auth login` on the host. No `GITHUB_TOKEN` env var needed. If `gh` is not on PATH the poller logs a warning at startup and stays disabled — the rest of the bot is unaffected.
- **Dedup**: the poller keeps an in-memory set of `(repo, number)` keys. On startup it *seeds* the set with everything currently in the queue and does **not** fire for those — restarting the bot will never re-announce already-pending requests. Only requests that appear after startup trigger an announcement. To trigger a review of a pre-existing request, remove `bizzy-btbot` from the requested reviewers and re-add.
- **Removal from queue**: GitHub removes a user from `requested-reviewers` once they submit a review (a real PR review, not a plain issue comment). If the agent posts a comment instead of submitting a review, the request stays in the queue forever — but the in-memory dedup means it still won't re-fire while the bot is running. After restart it would seed it as already-seen.
- **Channel**: must be a channel ID like `C0123ABCD`, not `#name`. The bot needs to be invited to it.

## Session eviction

Each Slack thread holds onto a long-lived `claude` subprocess (~80–130 MB resident). Without eviction, an active bot accumulates many idle subprocesses over time — a week of typical use can easily reach 2+ GB.

A background reaper closes any session whose last turn finished more than `SESSION_IDLE_TIMEOUT_S` seconds ago (default `14400` = 4 hours). Sessions that are currently mid-turn are skipped — the reaper checks the per-session asyncio lock and won't touch a session that's working.

Threads aren't lost: with the [thread-aware reconnect](#thread-aware-reconnect) below, the next reply in an evicted thread spawns a fresh subprocess transparently. Cost is the cold-start time on that next reply (~1–2s) plus one `conversations.replies` call to confirm the bot had posted in the thread.

Tune via env: `SESSION_IDLE_TIMEOUT_S=3600` for a tighter hour-long TTL, `SESSION_REAP_INTERVAL_S=60` to scan more often, or `SESSION_IDLE_TIMEOUT_S=0` to disable eviction entirely.

## Sidecar progress channel

Setting `BOTSPEAK_CHANNEL=<channel-id>` mirrors per-turn progress to a dedicated channel so people can watch what the bot is doing without cluttering the source thread. One message per turn, edited in place:

```
🧵 <link to thread> in #channel · @user · turn 4
> "what files are in cwd?"
🔧 `bash` `ls -la`
🔧 `Read` `/path/to/file.py`
   ⚠️ `<error message if any>`
✅ duration=2400ms cost=$0.012 usage={...}
```

Header includes a permalink back to the source thread (Slack's `chat.getPermalink`) so anyone in #botspeak can jump into the original conversation. Tool-result errors get an inline `⚠️` line; successful results aren't shown (would be too noisy). Final line is `✅` with the result summary, or `❌` with the error class on failure.

Get the channel ID from Slack (channel header → "About" → bottom of the panel, or right-click the channel → "Copy link" and grab the trailing ID). The bot must be invited to the channel; uses `chat:write` which is already in the bot's scope list.

DM events also flow into #botspeak — be aware that this surfaces parts of private DMs into a public-ish sidecar. If that's not what you want, leave `BOTSPEAK_CHANNEL` unset and rely on the per-turn transcript file (uploaded into the source thread itself, see below).

## Per-turn transcript

Tool-call activity isn't streamed inline into the Slack message anymore — only assistant text appears in the live reply. Instead, each turn that involved at least one tool call (or that errored) produces a transcript file uploaded to the same thread when the turn ends:

- Filename: `transcript-<session-key>-<unix-ts>.txt` (uploaded as a text snippet).
- Contents: the user prompt, every assistant text block, every tool invocation with full JSON-pretty args, and a final `[result]` line with `duration` / `cost` / `usage` — or an `[error]` line if the turn raised. Tool *results* are intentionally omitted to keep the file readable; they're still in the bot's stderr at `LOG_LEVEL=DEBUG` if you need them.
- Pure-text turns (no tool calls, no error) skip the upload to keep the thread tidy.

Upload uses `files_upload_v2` and requires the `files:write` user scope listed above. If you added that scope after the first authorization, re-run `slack_auth.py` so the user token picks it up.

## Debugging

The bot logs every step of each turn so you can watch what's happening on the host machine. Logs go to stderr; redirect or `tee` as needed.

At `LOG_LEVEL=INFO` (default) you'll see, per Slack message:

- `incoming message channel=… user=… session=thread:… new=… len=…`
- `connecting claude subprocess` / `connected` (first turn only)
- `turn N: user prompt (X chars): '…'` (preview, truncated)
- `turn N: assistant text (X chars): '…'`
- `turn N: tool_use Bash id=toolu_… args={…}` for each tool call
- `turn N: tool_result id=toolu_… is_error=False (X chars): '…'`
- `turn N: result is_error=False duration_ms=… cost_usd=… usage=…`
- `clear command …` when someone sends `/clear`
- `disconnecting` / `closed` on shutdown or `/clear`

At `LOG_LEVEL=DEBUG` you also get full (untruncated) prompt text, full assistant text, full tool results, thinking blocks, and SDK-level system messages (init, MCP server status, etc.).

The SDK's own stderr (subprocess startup, MCP connection errors) is passed through to the parent process's stderr, so it shows up in the same terminal.

Each session's log records are namespaced under a logger called `claude-slack-bot.session[<key>]`, so you can filter for a single thread by grepping its session key (e.g. `thread:1714000000.123456`).

## Files

- `slack_auth.py` — one-time OAuth helper that mints the user token (`xoxp-…`).
- `message_poller.py` — polls Slack (DMs + optional mentions) with the user token and dispatches new messages.
- `app.py` — user-token web client, message routing, streaming replies, `/clear` text command.
- `session_manager.py` — per-key persistent `ClaudeSDKClient` lifecycle and turn serialization.
- `pr_poller.py` — background GitHub PR review-request poller.
- `pyproject.toml` / `uv.lock` — uv-managed dependencies.
- `.env.example` — template for required + optional env vars.
