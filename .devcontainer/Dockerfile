# Pinned to a stable LTS (24.04 "noble"). The rolling `:ubuntu` tag moved to
# 26.04 "resolute", which broke package availability (e.g. KasmVNC has no
# resolute build) and shipped Python 3.14. Pinning keeps the env reproducible.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ENV DEBIAN_FRONTEND=noninteractive
# UTF-8 so terminal TUIs (e.g. Claude Code) render box-drawing/emoji correctly.
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# XFCE desktop, Google Chrome, fonts, and build tooling.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      xfce4 xfce4-terminal xfce4-goodies \
      dbus-x11 x11-utils x11-xserver-utils xfonts-base \
      fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji fonts-powerline \
      xdg-utils curl ca-certificates \
      build-essential pkg-config git unzip zip jq \
      supervisor \
 && curl -sSL "https://dl.google.com/linux/direct/google-chrome-stable_current_$(dpkg --print-architecture).deb" -o /tmp/chrome.deb \
 && apt-get install -y /tmp/chrome.deb \
 && rm -f /tmp/chrome.deb \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# KasmVNC: modern VNC server with a built-in web client (no noVNC/websockify),
# better image quality, and seamless bidirectional clipboard on Chromium
# browsers. The .deb is per-Ubuntu-codename, so resolve it from /etc/os-release.
ARG KASMVNC_VERSION=1.4.0
RUN . /etc/os-release \
 && arch="$(dpkg --print-architecture)" \
 && curl -fsSL -o /tmp/kasmvnc.deb \
      "https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_${VERSION_CODENAME}_${KASMVNC_VERSION}_${arch}.deb" \
 && apt-get update \
 && apt-get install -y /tmp/kasmvnc.deb \
 && rm -f /tmp/kasmvnc.deb \
 && adduser vscode ssl-cert \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Chrome needs container-friendly flags inside the VNC desktop:
#   --no-sandbox            : the sandbox can't work in an unprivileged container
#   --disable-gpu           : there is no GPU; avoids GPU-process init crashes
#   --disable-dev-shm-usage : /dev/shm is only ~64MB; use /tmp to avoid renderer crashes
#   --test-type             : hides the yellow "unsupported command-line flag:
#                             --no-sandbox" infobar (cosmetic only)
#   --remote-debugging-port=9222 : expose the DevTools Protocol on localhost so
#                             the chrome-devtools MCP can drive this visible
#                             browser (gated behind the private codespace).
# Wrap the binary AND patch the menu launcher so both "just work", and make
# Chrome the default browser so CLIs (e.g. Claude Code) can auto-open links.
RUN printf '%s\n' '#!/bin/sh' \
      'exec /usr/bin/google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage --test-type --remote-debugging-port=9222 "$@"' \
      > /usr/local/bin/google-chrome \
 && chmod +x /usr/local/bin/google-chrome \
 && ln -sf /usr/local/bin/google-chrome /usr/local/bin/google-chrome-stable \
 && sed -i '/^Exec=/ s#google-chrome-stable#google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage --test-type --remote-debugging-port=9222#' \
      /usr/share/applications/google-chrome.desktop \
 && update-alternatives --install /usr/bin/x-www-browser x-www-browser /usr/local/bin/google-chrome 200 \
 && update-alternatives --install /usr/bin/gnome-www-browser gnome-www-browser /usr/local/bin/google-chrome 200

# Make `claude` open its auth/login links in the local XFCE desktop Chrome.
# VS Code overrides $BROWSER in its integrated terminal with its own helper
# (which opens links on the *client* machine, breaking the localhost callback),
# so we set BROWSER inline only for claude, at invocation time, via a wrapper.
RUN printf '%s\n' '' \
      '# Open Claude Code auth links in the local desktop Chrome' \
      'claude() { BROWSER=/usr/local/bin/google-chrome command claude "$@"; }' \
      >> /home/vscode/.bashrc

# Make xfce4-terminal paste on Ctrl+V (default is Ctrl+Shift+V, which trips up
# anyone pasting from their Mac). Copy stays Ctrl+Shift+C so Ctrl+C still = SIGINT.
RUN mkdir -p /home/vscode/.config/xfce4/xfce4-terminal \
 && printf '%s\n' '(gtk_accel_path "<Actions>/terminal-window/paste" "<Primary>v")' \
      > /home/vscode/.config/xfce4/xfce4-terminal/accels.scm \
 && chown -R vscode:vscode /home/vscode/.config

# uv: the Python runtime/installer the Slack bot + bridge run under
# (`uv run python ...`). Installed system-wide into /usr/local/bin so it's on
# PATH for every shell and user. (Previously patched in at runtime by Central's
# SSH provisioning; baked into the image now.)
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# Desktop launcher script (starts KasmVNC + XFCE); invoked from postStartCommand.
COPY start-desktop.sh /usr/local/bin/start-desktop.sh
RUN chmod +x /usr/local/bin/start-desktop.sh
