#!/usr/bin/env bash
# Bring up an XFCE session on KasmVNC. KasmVNC serves its own web client (with
# seamless clipboard) on the websocket port — no noVNC/websockify.
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

# Serve the web client over plain HTTP on the websocket port (the Codespaces
# proxy adds TLS); disabling SSL avoids TLS-in-TLS through the forwarded port.
cat > "$HOME/.vnc/kasmvnc.yaml" <<EOF
network:
  protocol: http
  ssl:
    require_ssl: false
EOF

if listening "$WEB_PORT"; then
  log "desktop already serving on $WEB_PORT; leaving it"
else
  log "starting KasmVNC on $VNC_DISPLAY (web $WEB_PORT)"
  vncserver -kill "$VNC_DISPLAY" >/dev/null 2>&1 || true
  rm -f "/tmp/.X${VNC_DISPLAY#:}-lock" "/tmp/.X11-unix/X${VNC_DISPLAY#:}" 2>/dev/null || true
  # -select-de XFCE generates the xstartup non-interactively (otherwise KasmVNC
  # prompts for the desktop environment and blocks). -disableBasicAuth: the
  # forwarded port is private/GitHub-auth gated, so no extra password. stdin
  # from /dev/null guards against any prompt blocking the lifecycle step.
  # -WebpEncodingTime 0 disables WebP (forces JPEG): KasmVNC's WebP frames can
  # fail to decode in the browser ("Failed to decode frame at index 0"); JPEG
  # is reliable. -disableBasicAuth: forwarded port is private/GitHub-auth gated.
  vncserver "$VNC_DISPLAY" -select-de XFCE \
    -geometry "$VNC_GEOMETRY" -depth "$VNC_DEPTH" \
    -websocketPort "$WEB_PORT" -disableBasicAuth -WebpEncodingTime 0 \
    </dev/null >/tmp/kasmvnc.log 2>&1 || log "vncserver exited $?"
fi

log "ready -> KasmVNC web on :${WEB_PORT}"
exit 0
