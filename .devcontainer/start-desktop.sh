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

# The pid recorded in our KasmVNC pidfile (empty if we haven't launched).
our_xvnc_pid() { cat "$HOME/.vnc/"*":${VNC_DISPLAY#:}.pid" 2>/dev/null | head -1; }

# Who currently owns the WEB_PORT listening socket, as "name/pid" (for logs).
# Anything we don't recognise here is the boot-time occupant we collide with.
port_owner() {
  ss -ltnp 2>/dev/null | grep ":$WEB_PORT " \
    | grep -oE '"[^"]+",pid=[0-9]+' | head -1 | tr -d '"' | sed 's/,pid=/\//'
}

# True only when the process actually *listening* on WEB_PORT is our own Xvnc.
# This is the crucial distinction: at boot an external occupant (the Codespaces
# port forwarder) holds 6080, so our Xvnc dies with EADDRINUSE — yet for a beat
# the pidfile pid is alive AND the port is occupied (by the occupant), which is
# enough to fool a "pid alive && something on the port" check into a false
# "serving". Matching the socket's *owning* pid to our pidfile can't be fooled:
# only one process can own the listen socket, and we require it to be ours.
vnc_serving() {
  local pid
  pid=$(our_xvnc_pid)
  [ -n "$pid" ] || return 1
  ss -ltnp 2>/dev/null | grep ":$WEB_PORT " | grep -q "pid=$pid,"
}

if ! command -v vncserver >/dev/null 2>&1; then
  log "ERROR: KasmVNC vncserver not found; skipping desktop start"
  exit 0
fi

mkdir -p "$HOME/.vnc"

# KasmVNC won't start non-interactively until a control user with write access
# exists: otherwise `vncserver` prints "you need a KasmVNC user with write
# permissions / [1] Create a new user [2] Start without one" and waits for a
# selection. With stdin from /dev/null it reads an empty answer, loops forever
# pegging a CPU at ~100%, and never binds the web port — so Connect just hangs.
# Pre-seed that user. The password is unused at connect time (-disableBasicAuth
# gates access behind the private GitHub-auth'd forwarded port) but kasmvncpasswd
# still requires it to be at least 6 characters.
if [ ! -s "$HOME/.kasmpasswd" ]; then
  log "creating KasmVNC control user"
  printf '%s\n%s\n' "kasmvnc123" "kasmvnc123" \
    | kasmvncpasswd -u kasm_user -rwo "$HOME/.kasmpasswd" >/dev/null 2>&1 \
    || log "WARNING: kasmvncpasswd failed; vncserver may prompt"
fi

# Serve the web client over plain HTTP on the websocket port (the Codespaces
# proxy adds TLS); disabling SSL avoids TLS-in-TLS through the forwarded port.
cat > "$HOME/.vnc/kasmvnc.yaml" <<EOF
network:
  protocol: http
  ssl:
    require_ssl: false
EOF

# Launch KasmVNC once.
#   -select-de XFCE generates the xstartup non-interactively (otherwise KasmVNC
#   prompts for the desktop environment and blocks). -disableBasicAuth: the
#   forwarded port is private/GitHub-auth gated, so no extra password. stdin
#   from /dev/null guards against any prompt blocking the lifecycle step.
#   -WebpEncodingTime 0 disables WebP (forces JPEG): KasmVNC's WebP frames can
#   fail to decode in the browser ("Failed to decode frame at index 0"); JPEG
#   is reliable.
launch_vnc() {
  vncserver -kill "$VNC_DISPLAY" >/dev/null 2>&1 || true
  rm -f "/tmp/.X${VNC_DISPLAY#:}-lock" "/tmp/.X11-unix/X${VNC_DISPLAY#:}" 2>/dev/null || true
  vncserver "$VNC_DISPLAY" -select-de XFCE \
    -geometry "$VNC_GEOMETRY" -depth "$VNC_DEPTH" \
    -websocketPort "$WEB_PORT" -disableBasicAuth -WebpEncodingTime 0 \
    </dev/null >/tmp/kasmvnc.log 2>&1 || log "vncserver exited $?"
}

# Bring the web port up, verifying it actually binds. The vncserver wrapper
# reports success even when Xvnc then dies — and at boot the Codespaces port
# agent can transiently hold 6080, so the first Xvnc fails with EADDRINUSE
# ("Address already in use") and exits. So we don't trust the wrapper: we check
# that something is really listening, and retry until it is.
#
# The transient occupant usually releases within seconds, but on a cold start
# it can hold the port far longer — long enough to burn through a handful of
# back-to-back attempts and leave the desktop down (Connect then just hangs).
# So we retry on a wall-clock budget rather than a fixed attempt count, and
# when the port is held by someone else (EADDRINUSE) we wait for them to let go
# before relaunching instead of spending an attempt fighting for it.
START_DEADLINE=$(( $(date +%s) + 120 ))
attempt=0
while ! vnc_serving && [ "$(date +%s)" -lt "$START_DEADLINE" ]; do
  attempt=$((attempt + 1))
  log "starting KasmVNC on $VNC_DISPLAY (web $WEB_PORT), attempt $attempt"
  launch_vnc
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    vnc_serving && break
    sleep 1
  done
  vnc_serving && break
  # Our Xvnc didn't take the port — almost always EADDRINUSE because something
  # else still holds 6080. Log who, so we can see the occupant in creation.log,
  # then back off (don't relaunch tight) until the wall-clock budget is spent.
  log "not serving after attempt $attempt; :$WEB_PORT held by: $(port_owner || echo 'nobody/unknown')"
  sleep 3
done

vnc_serving \
  && log "ready -> KasmVNC web on :${WEB_PORT}" \
  || log "ERROR: desktop never bound :${WEB_PORT} after retries"
exit 0
