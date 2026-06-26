#!/usr/bin/env bash
# The coderbots setup wizard — the obvious entry point.
#
#   ./setup.sh
#
# Installs the wizard's deps on first run, then launches it interactively. Always
# runs (no autostart no-op), so you can re-run setup any time. The wizard also
# auto-launches when you open this codespace in VS Code (.vscode/tasks.json).
set -e
cd "$(dirname "$0")/setup-wizard"

if [ ! -d node_modules ]; then
  echo "Installing setup-wizard dependencies (first run)…"
  npm install
fi

exec npm run dev
