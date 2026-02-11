#!/bin/bash
set -e

MODE="${MODE:-desktop}"

# ─── Docker socket GID fix ───────────────────────────────────────────
if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
    groupmod -g "$DOCKER_GID" docker 2>/dev/null || true
    usermod -aG docker ubuntu 2>/dev/null || true
fi

# ─── Create project directory and fix permissions ────────────────────
mkdir -p /home/ubuntu/projects
mkdir -p /home/ubuntu/Desktop
mkdir -p /home/ubuntu/.local/share/vibe-kanban
chown -R ubuntu:ubuntu /home/ubuntu/projects
chown -R ubuntu:ubuntu /home/ubuntu/Desktop
chown -R ubuntu:ubuntu /home/ubuntu/.local

# ─── Persist bash history ────────────────────────────────────────────
HIST_DIR="/home/ubuntu/.local/share/shell"
mkdir -p "$HIST_DIR"
if [ ! -f "$HIST_DIR/.bash_history" ]; then
    touch "$HIST_DIR/.bash_history"
fi
ln -sf "$HIST_DIR/.bash_history" /home/ubuntu/.bash_history
chown -R ubuntu:ubuntu "$HIST_DIR"

# ─── Persist gitconfig ──────────────────────────────────────────────
if [ -f /home/ubuntu/.gitconfig-vol ]; then
    ln -sf /home/ubuntu/.gitconfig-vol /home/ubuntu/.gitconfig
fi

# ─── Theia settings ─────────────────────────────────────────────────
mkdir -p /home/ubuntu/.theia
if [ ! -f /home/ubuntu/.theia/settings.json ]; then
    cp /opt/theia-defaults/settings.json /home/ubuntu/.theia/settings.json
fi
chown -R ubuntu:ubuntu /home/ubuntu/.theia

# ─── Mode selection ─────────────────────────────────────────────────
if [ "$MODE" = "lite" ]; then
    echo "[startup] Lite mode: starting Theia + Vibe Kanban only (no VNC desktop)"
    exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord-lite.conf
else
    echo "[startup] Desktop mode: starting full GNOME desktop + all services"

    # VNC password setup
    mkdir -p /home/ubuntu/.vnc
    VNC_PASS="${PASSWORD:-$(openssl rand -base64 8)}"
    if [ -z "$PASSWORD" ]; then
        echo "[startup] Generated VNC password: $VNC_PASS"
    fi

    # Find vncpasswd binary (could be vncpasswd or tigervncpasswd)
    VNCPASSWD_BIN=""
    for cmd in vncpasswd tigervncpasswd /usr/bin/vncpasswd /usr/bin/tigervncpasswd; do
        if command -v "$cmd" &>/dev/null || [ -x "$cmd" ]; then
            VNCPASSWD_BIN="$cmd"
            break
        fi
    done

    if [ -n "$VNCPASSWD_BIN" ]; then
        echo "$VNC_PASS" | "$VNCPASSWD_BIN" -f > /home/ubuntu/.vnc/passwd
    else
        echo "[startup] WARNING: vncpasswd not found, writing password via Python"
        python3 /opt/vnc-setpass.py "$VNC_PASS" /home/ubuntu/.vnc/passwd
    fi

    chmod 600 /home/ubuntu/.vnc/passwd
    chown -R ubuntu:ubuntu /home/ubuntu/.vnc

    # Clean stale X locks (previously in vnc-wrapper.sh)
    rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

    # Copy xsession (supervisor desktop process reads ~/.xsession)
    cp /opt/xsession /home/ubuntu/.xsession
    chmod +x /home/ubuntu/.xsession
    chown ubuntu:ubuntu /home/ubuntu/.xsession

    # Desktop shortcuts
    cp /opt/desktop-shortcuts/*.desktop /home/ubuntu/Desktop/ 2>/dev/null || true
    chmod +x /home/ubuntu/Desktop/*.desktop 2>/dev/null || true
    chown -R ubuntu:ubuntu /home/ubuntu/Desktop

    exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
fi
