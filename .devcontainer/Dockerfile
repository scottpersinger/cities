FROM mcr.microsoft.com/devcontainers/base:ubuntu

ENV DEBIAN_FRONTEND=noninteractive

# XFCE desktop + TigerVNC + noVNC, Google Chrome, and helpers.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      xfce4 xfce4-terminal xfce4-goodies \
      dbus-x11 x11-utils x11-xserver-utils xfonts-base \
      tigervnc-standalone-server tigervnc-common \
      novnc websockify \
      xdg-utils curl ca-certificates \
 && curl -sSL "https://dl.google.com/linux/direct/google-chrome-stable_current_$(dpkg --print-architecture).deb" -o /tmp/chrome.deb \
 && apt-get install -y /tmp/chrome.deb \
 && rm -f /tmp/chrome.deb \
 && printf '%s' '<!doctype html><meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=remote">' > /usr/share/novnc/index.html \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Chrome needs container-friendly flags inside the VNC desktop:
#   --no-sandbox            : the sandbox can't work in an unprivileged container
#   --disable-gpu           : there is no GPU; avoids GPU-process init crashes
#   --disable-dev-shm-usage : /dev/shm is only ~64MB; use /tmp to avoid renderer crashes
# Wrap the binary AND patch the menu launcher so both "just work", and make
# Chrome the default browser so CLIs (e.g. Claude Code) can auto-open links.
RUN printf '%s\n' '#!/bin/sh' \
      'exec /usr/bin/google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"' \
      > /usr/local/bin/google-chrome \
 && chmod +x /usr/local/bin/google-chrome \
 && ln -sf /usr/local/bin/google-chrome /usr/local/bin/google-chrome-stable \
 && sed -i '/^Exec=/ s#google-chrome-stable#google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage#' \
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

# Desktop launcher script (starts VNC + noVNC); invoked from postStartCommand.
COPY start-desktop.sh /usr/local/bin/start-desktop.sh
RUN chmod +x /usr/local/bin/start-desktop.sh
