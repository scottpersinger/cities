#!/usr/bin/env bash
# Starts an XFCE session on TigerVNC (display :1 / port 5901) and exposes it
# over the browser via noVNC (port 6080). Safe to run repeatedly.
set -euo pipefail

VNC_DISPLAY=":1"
VNC_PORT="5901"
NOVNC_PORT="6080"
VNC_GEOMETRY="${VNC_GEOMETRY:-1440x900}"
VNC_DEPTH="${VNC_DEPTH:-24}"

VNCSERVER="$(command -v tigervncserver || command -v vncserver || true)"
if [ -z "$VNCSERVER" ]; then
  echo "ERROR: tigervncserver not found" >&2
  exit 1
fi

mkdir -p "$HOME/.vnc"

# XFCE session startup (used by TigerVNC versions that honor ~/.vnc/xstartup).
cat > "$HOME/.vnc/xstartup" <<'EOF'
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export XDG_RUNTIME_DIR="/tmp/runtime-$(id -un)"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
exec dbus-launch --exit-with-session startxfce4
EOF
chmod +x "$HOME/.vnc/xstartup"

# (Re)start the VNC server on :1.
# No VNC password: this TigerVNC build ships no vncpasswd, and the forwarded
# port is private (gated by GitHub auth). The server only listens on localhost
# (-localhost yes); noVNC and the Codespaces port-forward reach it from inside
# the container, which also lets -SecurityTypes None be used without the refusal.
"$VNCSERVER" -kill "$VNC_DISPLAY" >/dev/null 2>&1 || true
rm -f "/tmp/.X${VNC_DISPLAY#:}-lock" "/tmp/.X11-unix/X${VNC_DISPLAY#:}" 2>/dev/null || true
"$VNCSERVER" "$VNC_DISPLAY" -geometry "$VNC_GEOMETRY" -depth "$VNC_DEPTH" \
  -localhost yes -SecurityTypes None

# (Re)start noVNC on 6080 -> 5901.
pkill -f "websockify.*${NOVNC_PORT}" >/dev/null 2>&1 || true
nohup websockify --web=/usr/share/novnc "$NOVNC_PORT" "localhost:${VNC_PORT}" \
  >/tmp/novnc.log 2>&1 &

echo "XFCE desktop ready -> noVNC on :${NOVNC_PORT} (no password)"
