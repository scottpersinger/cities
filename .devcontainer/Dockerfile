FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install Google Chrome
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
 && curl -sSL https://dl.google.com/linux/direct/google-chrome-stable_current_$(dpkg --print-architecture).deb -o /tmp/chrome.deb \
 && apt-get -y install /tmp/chrome.deb \
 && rm -f /tmp/chrome.deb \
 && rm -rf /var/lib/apt/lists/*

# Chrome needs container-friendly flags to run inside the VNC desktop:
#   --no-sandbox            : the sandbox can't work in an unprivileged container
#   --disable-gpu           : there is no GPU; avoids GPU-process init crashes
#   --disable-dev-shm-usage : /dev/shm is only ~64MB here; use /tmp to avoid renderer crashes
# Apply them to the terminal command (wrapper) AND the desktop menu launcher
# so clicking the Chrome icon "just works" with no flags to type.
RUN printf '%s\n' '#!/bin/sh' \
      'exec /usr/bin/google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"' \
      > /usr/local/bin/google-chrome \
 && chmod +x /usr/local/bin/google-chrome \
 && ln -sf /usr/local/bin/google-chrome /usr/local/bin/google-chrome-stable \
 && sed -i '/^Exec=/ s#google-chrome-stable#google-chrome-stable --no-sandbox --disable-gpu --disable-dev-shm-usage#' \
      /usr/share/applications/google-chrome.desktop
