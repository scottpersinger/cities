# agent-dev-desktop

A reusable **GitHub Codespaces environment** for an autonomous coding agent.
This repo is not a project — it's the *machine definition*. You create a
codespace from it, then the agent clones and runs **any** GitHub repo inside it.

## What you get

- **XFCE desktop in the browser** via TigerVNC + noVNC (port `6080`, auto-connects,
  no password — the forwarded port is private/GitHub-auth gated).
- **Google Chrome**, pre-flagged for containers (`--no-sandbox --disable-gpu
  --disable-dev-shm-usage`) and set as the default browser.
- **Node** (LTS) and **Python 3.12**, plus `build-essential`, `git`, `gh`,
  `jq`, etc. for building most repos.
- **Claude Code** installed globally; `claude` auth opens in the desktop Chrome
  so the OAuth localhost callback completes (no copy-paste).

## Using it as a general environment

A codespace is bootstrapped from *this* repo, but you can clone and run as many
other repos as you like inside it. Suggested workflow for the agent:

```bash
gh repo clone <owner>/<repo> ~/projects/<repo>   # uses the codespace's built-in auth
cd ~/projects/<repo>
# detect the stack and run it:
#   Node:   npm ci   (or pnpm/yarn) → npm run dev
#   Python: python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
```

Each cloned repo's own `.devcontainer/` is **not** applied automatically — this
environment is the kitchen-sink that runs them. (If you later need a repo's
*exact* environment, add the `docker-in-docker` feature + devcontainer CLI and
run `devcontainer up` against the clone.)

## Connecting to the desktop

Open the forwarded **`6080`** port in the browser. It auto-connects to XFCE.
Launch apps from **Applications** (Chrome is under *Internet*).

## Layout

```
.devcontainer/
  devcontainer.json   # features (node, python), ports, lifecycle, env
  Dockerfile          # XFCE + VNC + noVNC + Chrome + build tools
  start-desktop.sh    # idempotent VNC/noVNC launcher (postStartCommand)
```

## Notes / gotchas

- **`git pull` before "Rebuild Container"** — a rebuild uses the `.devcontainer/`
  files checked out in the codespace, not GitHub.
- The desktop launch is idempotent and detached, so it survives restarts.
- Heavy image — enable **Codespaces prebuilds** on this repo for fast startup.
