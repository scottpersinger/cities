#!/usr/bin/env bash
# Launched by VS Code (.vscode/tasks.json, runOn: folderOpen) when this codespace
# is opened in the editor. Installs the wizard's deps on first run, then starts
# it in auto mode. In auto mode the wizard no-ops once every step is complete,
# so this is harmless to run on every open.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing setup-wizard dependencies (first run)…"
  npm install
fi

export CODERBOTS_AUTOSTART=1
exec npm run dev
