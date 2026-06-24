#!/usr/bin/env bash
# Bring up an XFCE session on KasmVNC. KasmVNC serves its own web client (with
# seamless clipboard) directly on the websocket port — no noVNC/websockify.
#
# Runs from postStartCommand on every start/resume:
#   - idempotent: if the web port is already serving, leave it alone;
#   - never fails: always exits 0 so the lifecycle step can't be marked failed.
set -uo pipefail

VNC_DISPLAY=":1"
WEB_PORT="6080"
VNC_GEOMETRY="${VNC_GEOMETRY:-1440x900}"
VNC_DEPTH="${VNC_DEPTH:-24}"

log() { echo "[start-desktop] $*"; }
listening() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

if ! command -v vncserver >/dev/null 2>&1; then
  log "ERROR: KasmVNC vncserver not found; skipping desktop start"
  exit 0
fi

mkdir -p "$HOME/.vnc"

# Serve the web client over plain HTTP on $WEB_PORT (the Codespaces proxy adds
# TLS); disabling SSL avoids TLS-in-TLS through the forwarded port.
cat > "$HOME/.vnc/kasmvnc.yaml" <<EOF
network:
  protocol: http
  websocket_port: ${WEB_PORT}
  ssl:
    require: false
EOF

# XFCE session.
cat > "$HOME/.vnc/xstartup" <<'EOF'
#!/bin/sh
unset SESSION_MANAGER DBUS_SESSION_BUS_ADDRESS
export XDG_RUNTIME_DIR="/tmp/runtime-$(id -un)"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
exec dbus-launch --exit-with-session startxfce4
EOF
chmod +x "$HOME/.vnc/xstartup"

# KasmVNC wants a password file to exist even though we disable basic auth on
# the (private, GitHub-auth-gated) forwarded port. Create one once.
if [ ! -f "$HOME/.kasmpasswd" ]; then
  printf 'vscode\nvscode\n' | vncpasswd -u kasm_user -w >/dev/null 2>&1 \
    || log "vncpasswd setup failed (continuing)"
fi

if listening "$WEB_PORT"; then
  log "desktop already serving on $WEB_PORT; leaving it"
else
  log "starting KasmVNC on $VNC_DISPLAY (web $WEB_PORT)"
  vncserver -kill "$VNC_DISPLAY" >/dev/null 2>&1 || true
  rm -f "/tmp/.X${VNC_DISPLAY#:}-lock" "/tmp/.X11-unix/X${VNC_DISPLAY#:}" 2>/dev/null || true
  vncserver "$VNC_DISPLAY" -geometry "$VNC_GEOMETRY" -depth "$VNC_DEPTH" \
    -websocketPort "$WEB_PORT" -disableBasicAuth \
    >/tmp/kasmvnc.log 2>&1 || log "vncserver exited $?"
fi

log "ready -> KasmVNC web on :${WEB_PORT}"
exit 0
