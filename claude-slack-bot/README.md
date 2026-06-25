# claude-slack-bot

A Slack bot that drives a persistent local [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) process per Slack thread. Mention the bot to start a session; reply in-thread to continue it; use `/clear` to reset.

It uses the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/python) to spawn the real `claude` CLI as a long-running subprocess and pipes stream-json over stdin/stdout — full tool access (Bash, Edit, Read, Write, MCP, sub-agents, etc.), no feature loss.

## Architecture

```
Slack  ──Socket Mode──▶  app.py  ──asyncio──▶  SessionManager
                                                   │
                                                   ├── thread:T123  ──▶  claude (subprocess)
                                                   ├── thread:T456  ──▶  claude (subprocess)
                                                   └── dm:D789      ──▶  claude (subprocess)
```

- One persistent `claude` process per Slack thread (or per DM channel).
- Each turn: user text is piped to the subprocess's stdin; assistant text and tool-use events stream back from stdout and are posted/updated in Slack.
- Turns within a session are serialized by an `asyncio.Lock` so concurrent Slack events on one thread don't collide on the stdin pipe.
- Sessions live in memory; restarting the bot drops them. `/clear` drops a single session.

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- The `claude` CLI installed and authenticated locally (`claude` should run from your shell without prompting).

## Slack app setup (Socket Mode)

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. **Socket Mode** → toggle on.
3. **Basic Information** → **App-Level Tokens** → create one with scope `connections:write`. This is your `SLACK_APP_TOKEN` (`xapp-…`).
4. **OAuth & Permissions** → **Bot Token Scopes**, add:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`, `groups:history`, `im:history`, `mpim:history`
   - `im:read`, `im:write`
   - `users:read`
   - `commands`
   - `files:write` — required for the per-turn transcript upload (see [Per-turn transcript](#per-turn-transcript)).
5. **Event Subscriptions** → enable events, subscribe to bot events:
   - `app_mention`
   - `message.channels`, `message.groups`, `message.im`, `message.mpim`
6. **Slash Commands** → **Create New Command**:
   - Command: `/clear`
   - Description: `Reset Claude session in this thread/DM.`
   - Request URL: any placeholder (Socket Mode ignores it).
7. **Install App** to your workspace. Copy the **Bot User OAuth Token** (`xoxb-…`) — that's `SLACK_BOT_TOKEN`.
8. Invite the bot to the channel(s) you want it in: `/invite @your-bot`.

If you change scopes later, reinstall the app.

## Configuration

```bash
cp .env.example .env
# fill in SLACK_BOT_TOKEN and SLACK_APP_TOKEN
```

| Variable | Default | Notes |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | — | required, `xoxb-…` |
| `SLACK_APP_TOKEN` | — | required, `xapp-…` |
| `CLAUDE_CWD` | `$HOME` | working directory each `claude` subprocess runs in |
| `CLAUDE_PERMISSION_MODE` | `bypassPermissions` | `default` / `acceptEdits` / `plan` / `bypassPermissions` |
| `CLAUDE_MODEL` | (claude default) | e.g. `claude-opus-4-7` |
| `CLAUDE_SETTING_SOURCES` | `user,project,local` | which Claude Code config layers to inherit; comma-separated subset of `user`, `project`, `local`. See [MCP servers and other settings](#mcp-servers-and-other-settings). |
| `CLAUDE_CHROME` | `0` | set to `1` to spawn `claude` with `--chrome`, enabling the Claude-in-Chrome browser MCP (requires the Chrome extension installed for this user). |
| `BOTSPEAK_CHANNEL` | — | optional channel ID (e.g. `C0123ABCD`) to mirror per-turn progress into. See [Sidecar progress channel](#sidecar-progress-channel). |
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

On macOS, run it under `caffeinate` so the asyncio event loop isn't paused by App Nap, idle sleep, or display sleep — when the loop pauses, Socket Mode pings stop, the session goes stale, and any Slack messages that arrive before the bot reconnects are lost:

```bash
caffeinate -dimsu -- uv run python app.py
```

A telltale that the process is being suspended is `slack_bolt` logging `disconnected for <minutes>+ seconds` repeatedly, where the gap matches wall-clock time since the previous reconnect — that's the heartbeat loop noticing it was paused, not a network drop.

You should see `connected; waiting for events`. In Slack, mention the bot in a channel it's been invited to:

```
@claude what files are in the current dir?
```

It'll reply in a thread. Continue the conversation by replying in that thread (no need to re-mention). Run `/clear` in the thread (or in the DM) to drop the session and start fresh on the next message.

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

Upload uses `files_upload_v2` and requires the `files:write` bot scope listed above. If you added that scope after the initial install, reinstall the app from **OAuth & Permissions → Reinstall to Workspace** so the existing bot token picks it up.

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
- `/clear invoked …` / `/clear result …` for slash commands
- `disconnecting` / `closed` on shutdown or `/clear`

At `LOG_LEVEL=DEBUG` you also get full (untruncated) prompt text, full assistant text, full tool results, thinking blocks, and SDK-level system messages (init, MCP server status, etc.).

The SDK's own stderr (subprocess startup, MCP connection errors) is passed through to the parent process's stderr, so it shows up in the same terminal.

Each session's log records are namespaced under a logger called `claude-slack-bot.session[<key>]`, so you can filter for a single thread by grepping its session key (e.g. `thread:1714000000.123456`).

## Files

- `app.py` — Slack Bolt async app, Socket Mode handler, message + slash-command routing.
- `session_manager.py` — per-key persistent `ClaudeSDKClient` lifecycle and turn serialization.
- `pyproject.toml` / `uv.lock` — uv-managed dependencies.
- `.env.example` — template for required + optional env vars.
