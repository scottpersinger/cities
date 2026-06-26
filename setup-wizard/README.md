# coderbots setup-wizard

A **rich CLI setup wizard** that runs inside an `agent-dev-desktop` Codespace to
get a coding agent ready to work. It walks you through five steps:

1. **Install your agent** — Claude Code (the only agent today).
2. **Authenticate agent** — log in to Claude (email + verification code) via the
   desktop browser.
3. **Install Claude-in-Chrome** — add and pair the browser extension.
4. **Test + start the listener** — smoke-test Claude Code driving Chrome, then
   start the agent event listener that connects to Central.
5. **Pick a repo to work on** — choose a repo, push its `.env` to Codespace
   secrets (and the live env), clone it, let Claude set it up and run it, and
   open it in the desktop browser.

## Run

```bash
cd setup-wizard
pnpm install
pnpm dev        # or: pnpm build && pnpm start
```

In a provisioned Codespace it's also on the PATH as `coderbots-setup`.

## Design

- **Step framework** (`src/types.ts`, `src/steps/*`): each step is
  `{ id, title, summary, check?, run }`. `check()` makes steps idempotent so the
  wizard can offer to skip work that's already done.
- **Resumable**: progress is persisted to `~/.coderbots/setup-state.json`
  (`src/state.ts`). Re-running offers to resume or start over; a failed step can
  be retried, skipped, or quit (progress is saved either way).
- **Browser steps are guided-manual** (`src/env.ts` → `openUrl`): the wizard
  opens the relevant page in the desktop Chrome (`/usr/local/bin/google-chrome`)
  and waits for you to confirm. Robust, no brittle CDP automation.
- **`claude` is spawned with `BROWSER` forced** to the desktop Chrome
  (`src/env.ts` → `claude()`), because the image's bashrc shim that does this
  for interactive shells isn't inherited by child processes.
- **GitHub work goes through `gh`** (`gh repo list/clone`, `gh secret set --app
  codespaces`) rather than hand-rolling the Codespaces secrets sealed-box
  encryption.

## Not done yet

Step 4's **event listener** (`src/listener.ts`) is a documented **stub**. It
depends on a Central **event dispatcher** that doesn't exist yet — today Central
only *enqueues* events; nothing dispatches them out to a codespace. The listener
is wired into the flow and degrades gracefully (logs why it didn't start) until
Central exposes a dispatch endpoint and issues `CENTRAL_URL` / `CENTRAL_TOKEN`.

Other first-pass simplifications worth hardening later:

- Agent auth uses an **interactive `claude` hand-off**; swap for a confirmed
  non-interactive login command if the pinned Claude Code version has one.
- The extension URL in `src/steps/install-extension.ts` is a placeholder — set
  the canonical Chrome Web Store listing.
