#!/usr/bin/env bash
# Bring up an XFCE session on TigerVNC (display :1 / port 5901) and expose it
# over the browser via noVNC (port 6080).
#
# Designed to run from postStartCommand on every container start/resume:
#   - idempotent: if VNC/noVNC are already listening, it leaves them alone
#     (so a resume keeps your running desktop session);
#   - detached: background processes survive after this script returns;
#   - never fails: always exits 0 so the lifecycle step can't be marked failed
#     (a failed postStartCommand is itself a reason background procs get reaped).
set -uo pipefail

VNC_DISPLAY=":1"
VNC_PORT="5901"
NOVNC_PORT="6080"
VNC_GEOMETRY="${VNC_GEOMETRY:-1440x900}"
VNC_DEPTH="${VNC_DEPTH:-24}"

log() { echo "[start-desktop] $*"; }
listening() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

VNCSERVER="$(command -v tigervncserver || command -v vncserver || true)"
if [ -z "$VNCSERVER" ]; then
  log "ERROR: tigervncserver not found; skipping desktop start"
  exit 0
fi

mkdir -p "$HOME/.vnc"

# XFCE session startup (used by TigerVNC versions that honor ~/.vnc/xstartup;
# newer builds use /etc/X11/Xtigervnc-session, which also launches XFCE).
cat > "$HOME/.vnc/xstartup" <<'EOF'
#!/bin/sh
unset SESSION_MANAGER DBUS_SESSION_BUS_ADDRESS
export XDG_RUNTIME_DIR="/tmp/runtime-$(id -un)"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
exec dbus-launch --exit-with-session startxfce4
EOF
chmod +x "$HOME/.vnc/xstartup"

# Start the VNC server only if nothing already serves :1.
# No password: the forwarded port is private (GitHub-auth gated) and the server
# only listens on localhost (-localhost yes), reached via noVNC; that also lets
# -SecurityTypes None be used without TigerVNC's no-auth refusal.
if listening "$VNC_PORT"; then
  log "VNC already listening on $VNC_PORT; leaving it"
else
  log "starting VNC on $VNC_DISPLAY"
  "$VNCSERVER" -kill "$VNC_DISPLAY" >/dev/null 2>&1 || true
  rm -f "/tmp/.X${VNC_DISPLAY#:}-lock" "/tmp/.X11-unix/X${VNC_DISPLAY#:}" 2>/dev/null || true
  "$VNCSERVER" "$VNC_DISPLAY" -geometry "$VNC_GEOMETRY" -depth "$VNC_DEPTH" \
    -localhost yes -SecurityTypes None >/tmp/vnc.log 2>&1 || log "vncserver exited $?"
fi

# Start noVNC only if nothing already serves 6080. Fully detach it (setsid +
# nohup + closed stdin) so it outlives this postStartCommand invocation.
if listening "$NOVNC_PORT"; then
  log "noVNC already listening on $NOVNC_PORT; leaving it"
else
  log "starting noVNC on $NOVNC_PORT"
  setsid nohup websockify --web=/usr/share/novnc "$NOVNC_PORT" "localhost:${VNC_PORT}" \
    >/tmp/novnc.log 2>&1 </dev/null &
  disown 2>/dev/null || true
fi

log "ready -> noVNC on :${NOVNC_PORT} (no password)"
exit 0
