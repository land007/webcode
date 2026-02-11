FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# ─── 1. Base system: locale, sudo, ubuntu user ──────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        locales sudo ca-certificates curl wget git gnupg \
        openssl software-properties-common \
    && locale-gen en_US.UTF-8 \
    && (id ubuntu &>/dev/null && usermod -s /bin/bash -aG sudo ubuntu || useradd -m -s /bin/bash -G sudo ubuntu) \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 2. GNOME Flashback desktop (VNC-compatible, no GL needed) ──────
RUN apt-get update && apt-get install -y --no-install-recommends \
        gnome-session-flashback gnome-terminal nautilus \
        metacity dbus-x11 gnome-panel gnome-settings-daemon \
        adwaita-icon-theme gnome-themes-extra \
        xfonts-base \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 3. VNC + noVNC ─────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
        tigervnc-standalone-server tigervnc-common tigervnc-tools \
        python3 python3-numpy \
    && git clone --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC \
    && git clone --depth 1 https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify \
    && ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 4. Chinese input (fcitx + googlepinyin) ────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        fcitx fcitx-googlepinyin \
        fonts-noto-cjk fonts-noto-cjk-extra \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 5. Docker CLI (client only, auto-detect arch) ──────────────────
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        docker-ce-cli docker-compose-plugin \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 6. Browser: amd64=Google Chrome, arm64=Chromium ─────────────────
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        curl -LO https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
        && apt-get update && apt-get install -y ./google-chrome-stable_current_amd64.deb \
        && rm -f google-chrome-stable_current_amd64.deb \
        && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/browser; \
    else \
        apt-get update && apt-get install -y --no-install-recommends chromium-browser \
        && ln -sf /usr/bin/chromium-browser /usr/local/bin/browser; \
    fi \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 7. Node.js 22.x ────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 8. Theia IDE (npm install) ─────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxkbfile-dev libsecret-1-dev python3-dev make g++ pkg-config \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY configs/theia-package.json /opt/theia/package.json
RUN cd /opt/theia \
    && npm install \
    && NODE_OPTIONS=--max-old-space-size=3072 npx theia build --mode production \
    && npm prune --omit=dev \
    && chown -R ubuntu:ubuntu /opt/theia

# ─── 9. Supervisor ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends supervisor \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 10. Config files ───────────────────────────────────────────────
# Theia default settings (will be copied on first run if user hasn't customized)
COPY configs/theia-settings.json /opt/theia-defaults/settings.json

# Supervisor configs
COPY configs/supervisord.conf /etc/supervisor/supervisord.conf
COPY configs/supervisord-lite.conf /etc/supervisor/conf.d/supervisord-lite.conf
COPY configs/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf
COPY configs/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-theia.conf

# GNOME xsession
COPY configs/xsession /opt/xsession
RUN chmod +x /opt/xsession

# Desktop shortcuts
COPY configs/desktop-shortcuts/ /opt/desktop-shortcuts/

# Startup script + helpers
COPY scripts/startup.sh /opt/startup.sh
COPY scripts/vnc-setpass.py /opt/vnc-setpass.py
RUN chmod +x /opt/startup.sh

# ─── 11. User setup & docker group ──────────────────────────────────
RUN groupadd -f docker && usermod -aG docker ubuntu \
    && mkdir -p /home/ubuntu/projects /home/ubuntu/Desktop \
       /home/ubuntu/.local/share /home/ubuntu/.theia \
    && chown -R ubuntu:ubuntu /home/ubuntu

# ─── Environment defaults ───────────────────────────────────────────
ENV MODE=desktop
ENV PASSWORD=
ENV VNC_RESOLUTION=1920x1080

ENTRYPOINT ["/opt/startup.sh"]
