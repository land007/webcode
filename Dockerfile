FROM ubuntu:24.04

LABEL org.opencontainers.image.title="webcode" \
      org.opencontainers.image.description="Browser-accessible dev environment with Theia IDE, Vibe Kanban, noVNC Desktop and OpenClaw AI" \
      org.opencontainers.image.url="https://github.com/land007/webcode" \
      org.opencontainers.image.source="https://github.com/land007/webcode" \
      org.opencontainers.image.vendor="land007" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.logo="https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/icon-source.png" \
      org.opencontainers.image.version="${WEBCODE_VERSION:-dev}"

# Build-time version argument (defaults to 'dev' if not provided)
ARG WEBCODE_VERSION=dev
# Runtime version environment variable
ENV WEBCODE_VERSION=${WEBCODE_VERSION}

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=zh_CN.UTF-8
ENV LANGUAGE=zh_CN:zh
ENV LC_ALL=zh_CN.UTF-8

# ─── 1. Base system: locale, sudo, ubuntu user, common CLI tools ─────
RUN apt-get update && apt-get install -y --no-install-recommends \
        locales sudo ca-certificates curl wget git gnupg \
        openssl software-properties-common \
        vim nano less file tree htop lsof procps \
        zip unzip tar xz-utils \
        net-tools iputils-ping iproute2 dnsutils openssh-client \
        xdg-utils bash-completion \
    && locale-gen en_US.UTF-8 zh_CN.UTF-8 \
    && update-locale LANG=zh_CN.UTF-8 \
    && (id ubuntu &>/dev/null && usermod -s /bin/bash -aG sudo ubuntu || useradd -m -s /bin/bash -G sudo ubuntu) \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 2. Node.js 22.x ────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 2b. http-proxy for dashboard service ───────────────────────────
RUN npm install -g http-proxy


# ─── 3. Theia IDE native build deps ─────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxkbfile-dev libsecret-1-dev python3-dev python3-setuptools make g++ pkg-config \
        liblzma-dev bzip2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 4. Theia IDE (npm install + production build — SLOWEST STEP) ───
COPY configs/theia-package.json /opt/theia/package.json
RUN cd /opt/theia \
    && USE_LOCAL_GIT=true npm install \
    && NODE_OPTIONS=--max-old-space-size=3072 npx theia build --mode production \
    && npm prune --omit=dev \
    && chown -R ubuntu:ubuntu /opt/theia

# ─── 4b. Theia language pack (separate layer — does NOT bust step 4 cache) ───
# Download and UNPACK the Chinese (Simplified) language pack for Theia NLS support.
# Theia's local-dir plugin loader requires unpacked directories, not raw .vsix zips.
RUN apt-get install -y --no-install-recommends unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/theia/plugins \
    && curl -fsSL -o /tmp/zh-hans.vsix \
       "https://open-vsx.org/api/MS-CEINTL/vscode-language-pack-zh-hans/1.108.0/file/MS-CEINTL.vscode-language-pack-zh-hans-1.108.0.vsix" \
    && unzip -q /tmp/zh-hans.vsix -d /opt/theia/plugins/vscode-language-pack-zh-hans \
    && rm /tmp/zh-hans.vsix \
    && chown -R ubuntu:ubuntu /opt/theia/plugins

# ─── 5. Supervisor ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends supervisor \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 6. GNOME Flashback desktop (VNC-compatible, no GL needed) ──────
# Note: intentionally NO --no-install-recommends here so gnome desktop
# components pull in all recommended packages for a complete desktop.
RUN apt-get update && apt-get install -y \
        gnome-session-flashback gnome-terminal nautilus \
        metacity dbus-x11 gnome-panel gnome-settings-daemon \
        adwaita-icon-theme gnome-themes-extra \
        xfonts-base fonts-dejavu-core fonts-liberation2 fontconfig \
        fonts-hack \
        dconf-cli at-spi2-core \
        eog evince gnome-screenshot gedit xdg-user-dirs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 6b. GNOME / Terminal font defaults + panel layout fix ────────────
RUN mkdir -p /etc/dconf/profile /etc/dconf/db/local.d \
    && printf 'user-db:user\nsystem-db:local\n' > /etc/dconf/profile/user \
    && printf '[org/gnome/desktop/interface]\nmonospace-font-name='"'"'Hack 11'"'"'\n' \
       > /etc/dconf/db/local.d/00-terminal-font \
    && dconf update \
    && cp /usr/share/gnome-panel/layouts/default.layout \
       /usr/share/gnome-panel/layouts/gnome-flashback.layout \
    && cp /usr/share/gnome-panel/layouts/default.layout \
       /usr/share/gnome-panel/layouts/ubuntu.layout

# ─── 6c. hsetroot for dynamic background color switching ───────────────
RUN apt-get update && apt-get install -y --no-install-recommends hsetroot \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 6d. Theme switch script (light/dark mode) ─────────────────────────
COPY scripts/theme-switch.sh /usr/local/bin/theme-switch
RUN chmod +x /usr/local/bin/theme-switch \
    && printf '\n# Theme switch aliases\nalias light-mode="/usr/local/bin/theme-switch light"\nalias dark-mode="/usr/local/bin/theme-switch dark"\n' >> /home/ubuntu/.bashrc

# ─── 6e. Language switch script (Chinese/English) ───────────────────────
COPY scripts/lang-switch.sh /usr/local/bin/lang-switch
RUN chmod +x /usr/local/bin/lang-switch \
    && printf '\n# Language switch aliases\nalias chinese="/usr/local/bin/lang-switch zh"\nalias english="/usr/local/bin/lang-switch en"\n' >> /home/ubuntu/.bashrc

# ─── 7. VNC + noVNC ─────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
        tigervnc-standalone-server tigervnc-common tigervnc-tools \
        x11-xserver-utils \
        python3 python3-numpy \
    && git clone --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC \
    && git clone --depth 1 https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify \
    && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 8. Chinese input (fcitx 4 + pinyin engines) ───────────────────
# Note: intentionally NO --no-install-recommends here so fcitx pulls
# in all frontends (gtk2/gtk3/xim), UI (classic), and IM modules.
RUN apt-get update && apt-get install -y \
        fcitx fcitx-googlepinyin fcitx-pinyin fcitx-config-gtk \
        fonts-noto-cjk fonts-noto-cjk-extra \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 8b. PulseAudio + Python WebSocket server deps ──────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        pulseaudio pulseaudio-utils \
        python3-websockets \
        python3-pip \
        ffmpeg \
        libopus0 \
        gcc python3-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && pip3 install --no-cache-dir --break-system-packages opuslib

# ─── 9. Docker CLI (client only, auto-detect arch) ──────────────────
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        docker-ce-cli docker-compose-plugin \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 9b. Cloudflare Tunnel client (via official apt repo — avoids GitHub rate limits) ───
RUN curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
        | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null \
    && echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared noble main" \
        > /etc/apt/sources.list.d/cloudflared.list \
    && apt-get update && apt-get install -y --no-install-recommends cloudflared \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 10. Browser: amd64=Google Chrome, arm64=Chromium ────────────────
# Use container-specific user-data-dir to avoid SingletonLock conflicts
# when multiple containers share the same chrome-data volume
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        curl -LO https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
        && apt-get update && apt-get install -y ./google-chrome-stable_current_amd64.deb \
        && rm -f google-chrome-stable_current_amd64.deb \
        && printf '#!/bin/sh\nexport PULSE_SERVER="unix:/run/user/1000/pulse/native"\nexport PULSE_SINK="webcode_null"\nexport PULSE_SOURCE="webcode_mic"\nHOSTNAME=$$(hostname)\nUSER_DATA_DIR=/home/ubuntu/.config/google-chrome-$$HOSTNAME\nmkdir -p "$$USER_DATA_DIR"\nexec /usr/bin/google-chrome-stable --user-data-dir="$$USER_DATA_DIR" --password-store=basic "$@"\n' > /usr/local/bin/browser \
        && chmod +x /usr/local/bin/browser; \
    else \
        add-apt-repository -y ppa:xtradeb/apps \
        && apt-get update && apt-get install -y chromium \
        && printf '#!/bin/sh\nexport PULSE_SERVER="unix:/run/user/1000/pulse/native"\nexport PULSE_SINK="webcode_null"\nexport PULSE_SOURCE="webcode_mic"\nHOSTNAME=$$(hostname)\nUSER_DATA_DIR=/home/ubuntu/.config/chromium-$$HOSTNAME\nmkdir -p "$$USER_DATA_DIR"\nexec /usr/bin/chromium --user-data-dir="$$USER_DATA_DIR" --password-store=basic "$@"\n' > /usr/local/bin/browser \
        && chmod +x /usr/local/bin/browser; \
    fi \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 11. User setup & docker group ──────────────────────────────────
RUN groupadd -f docker && usermod -aG docker ubuntu \
    && mkdir -p /home/ubuntu/projects /home/ubuntu/Desktop \
       /home/ubuntu/.local/share /home/ubuntu/.theia \
    && echo 'alias docker="sudo /usr/bin/docker"' >> /home/ubuntu/.bashrc \
    && touch /home/ubuntu/.hushlogin \
    && chown -R ubuntu:ubuntu /home/ubuntu

# ─── 11b. nvm for ubuntu user ────────────────────────────────────────
RUN su -l ubuntu -c \
    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'

# ─── 11c. v2rayN (GUI proxy client) ─────────────────────────────────
RUN ARCH=$(dpkg --print-architecture) \
    && case "$ARCH" in \
        amd64) V2RAYN_ARCH=64 ;; \
        arm64) V2RAYN_ARCH=arm64 ;; \
        *) V2RAYN_ARCH="$ARCH" ;; \
    esac \
    && V2RAYN_VER=$(curl -fsSL https://api.github.com/repos/2dust/v2rayN/releases/latest | grep '"tag_name"' | cut -d'"' -f4) \
    && curl -fsSL "https://github.com/2dust/v2rayN/releases/download/${V2RAYN_VER}/v2rayN-linux-${V2RAYN_ARCH}.deb" -o /tmp/v2rayn.deb \
    && apt-get install -y /tmp/v2rayn.deb \
    && rm /tmp/v2rayn.deb \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 12. Config files (COPY last — most likely to change) ───────────
COPY configs/theia-settings.json /opt/theia-defaults/settings.json

COPY configs/supervisord.conf /etc/supervisor/supervisord.conf
COPY configs/supervisord-lite.conf /etc/supervisor/conf.d/supervisord-lite.conf
COPY configs/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf
COPY configs/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-theia.conf
COPY configs/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-openclaw.conf
COPY configs/supervisor-cloudflared.conf /etc/supervisor/conf.d/supervisor-cloudflared.conf
COPY configs/supervisor-analytics.conf /etc/supervisor/conf.d/supervisor-analytics.conf

COPY configs/supervisor-audio.conf /etc/supervisor/conf.d/supervisor-audio.conf
COPY configs/supervisor-dashboard.conf /etc/supervisor/conf.d/supervisor-dashboard.conf
COPY configs/dashboard-server.js /opt/dashboard-server.js
COPY configs/dashboard.html /opt/dashboard.html
COPY scripts/audio-ws-server.py /opt/audio-ws-server.py
COPY scripts/audio-ws-wrapper.sh /opt/audio-ws-wrapper.sh
COPY configs/audio-player.html /opt/noVNC/audio.html
COPY configs/audio-bar.js /opt/noVNC/audio-bar.js
RUN chmod +x /opt/audio-ws-server.py /opt/audio-ws-wrapper.sh \
    && sed -i 's|<head>|<head>\n    <meta charset="UTF-8">|' /opt/noVNC/vnc.html \
    && sed -i 's|</body>|<script src="audio-bar.js"></script>\n</body>|' /opt/noVNC/vnc.html

COPY configs/touch-handler.js /opt/noVNC/touch-handler.js
RUN sed -i 's|</body>|<script src="touch-handler.js"></script>\n</body>|' /opt/noVNC/vnc.html

COPY configs/xsession /opt/xsession
RUN chmod +x /opt/xsession

COPY configs/desktop-shortcuts/ /opt/desktop-shortcuts/

COPY scripts/startup.sh /opt/startup.sh
COPY scripts/vnc-setpass.py /opt/vnc-setpass.py
COPY scripts/analytics.sh /scripts/analytics.sh
RUN chmod +x /opt/startup.sh /scripts/analytics.sh

RUN echo "land007/webcode" > /.image_name && \
    echo $(date "+%Y-%m-%d_%H:%M:%S") > /.image_time

# ─── Environment defaults ───────────────────────────────────────────
ENV MODE=desktop
ENV PASSWORD=
ENV VNC_RESOLUTION=1920x1080

ENTRYPOINT ["/opt/startup.sh"]

#docker build -t land007/webcode:latest .