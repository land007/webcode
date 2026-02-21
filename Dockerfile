FROM ubuntu:24.04

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

# ─── 3. Theia IDE native build deps ─────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxkbfile-dev libsecret-1-dev python3-dev python3-setuptools make g++ pkg-config \
        liblzma-dev bzip2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 4. Theia IDE (npm install + production build — SLOWEST STEP) ───
COPY configs/theia-package.json /opt/theia/package.json
RUN cd /opt/theia \
    && npm install \
    && NODE_OPTIONS=--max-old-space-size=3072 npx theia build --mode production \
    && npm prune --omit=dev \
    && chown -R ubuntu:ubuntu /opt/theia

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

# ─── 9. Docker CLI (client only, auto-detect arch) ──────────────────
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        docker-ce-cli docker-compose-plugin \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 10. Browser: amd64=Google Chrome, arm64=Chromium ────────────────
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
        curl -LO https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
        && apt-get update && apt-get install -y ./google-chrome-stable_current_amd64.deb \
        && rm -f google-chrome-stable_current_amd64.deb \
        && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/browser; \
    else \
        add-apt-repository -y ppa:xtradeb/apps \
        && apt-get update && apt-get install -y chromium \
        && ln -sf /usr/bin/chromium /usr/local/bin/browser; \
    fi \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ─── 11. User setup & docker group ──────────────────────────────────
RUN groupadd -f docker && usermod -aG docker ubuntu \
    && mkdir -p /home/ubuntu/projects /home/ubuntu/Desktop \
       /home/ubuntu/.local/share /home/ubuntu/.theia \
    && chown -R ubuntu:ubuntu /home/ubuntu

# ─── 12. Config files (COPY last — most likely to change) ───────────
COPY configs/theia-settings.json /opt/theia-defaults/settings.json

COPY configs/supervisord.conf /etc/supervisor/supervisord.conf
COPY configs/supervisord-lite.conf /etc/supervisor/conf.d/supervisord-lite.conf
COPY configs/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf
COPY configs/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-theia.conf
COPY configs/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-openclaw.conf

COPY configs/xsession /opt/xsession
RUN chmod +x /opt/xsession

COPY configs/desktop-shortcuts/ /opt/desktop-shortcuts/

COPY scripts/startup.sh /opt/startup.sh
COPY scripts/vnc-setpass.py /opt/vnc-setpass.py
RUN chmod +x /opt/startup.sh

# ─── Environment defaults ───────────────────────────────────────────
ENV MODE=desktop
ENV PASSWORD=
ENV VNC_RESOLUTION=1920x1080

ENTRYPOINT ["/opt/startup.sh"]
