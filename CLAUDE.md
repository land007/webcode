# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**webcode** is a Docker-based browser-accessible development environment that provides:
- A full GNOME Flashback desktop accessible via VNC/noVNC (browser)
- Theia IDE (browser-based VS Code-like editor) on port 10001
- Vibe Kanban (task board) on port 10002
- OpenClaw (self-hosted AI assistant gateway) on port 10003
- noVNC web client on port 10004, TigerVNC on port 10005
- Chinese input support (fcitx + Google Pinyin)
- Docker-in-Docker capability (Docker CLI inside container)

**Port Architecture:**
- **10001-10005**: Internal application ports (actual app listeners)
- **20001-20005**: External access ports via Caddy (with Basic Auth)
- **11001-11004**: Launcher proxy ports (desktop app internal use, no auth)

## Running the Environment

```bash
# Start with desktop mode (default)
docker compose up -d

# Start with lite mode (no VNC desktop, just Theia + Vibe Kanban)
MODE=lite docker compose up -d

# Custom VNC password and resolution
VNC_PASSWORD=mypassword VNC_RESOLUTION=1280x720 docker compose up -d

# Custom Basic Auth credentials
AUTH_USER=myuser AUTH_PASSWORD=mypassword docker compose up -d
```

**Access points (as configured in docker-compose.yml):**
- Theia IDE: http://localhost:20001 (Basic Auth)
- Vibe Kanban: http://localhost:20002 (Basic Auth)
- OpenClaw gateway: http://localhost:20003 (Basic Auth)
- noVNC browser client: http://localhost:20004 (VNC password)
- VNC client: localhost:20005 (VNC password: `changeme`)

Default Basic Auth credentials: `admin` / `changeme` (configurable via `AUTH_USER` / `AUTH_PASSWORD`)

## Building the Docker Image

```bash
# Local build
docker build -t webcode .

# Multi-arch build (matches CI)
docker buildx build --platform linux/amd64,linux/arm64 -t webcode .
```

## Architecture

### Dockerfile Layer Order (optimized for cache hits)
1. Base system (locale, sudo, CLI tools)
2. Node.js 22.x
3. Theia native build dependencies
4. **Theia IDE build** — slowest step, pinned to `@theia/*: 1.60.2`; cached unless `configs/theia-package.json` changes
5. Supervisor
6. GNOME Flashback desktop
7. VNC (TigerVNC) + noVNC
8. Chinese input (fcitx)
9. Docker CLI
10. Browser (Google Chrome on amd64, Chromium on arm64)
11. User/group setup
12. **Config files** — copied last so most changes don't bust Theia cache

### Startup Modes (`scripts/startup.sh`)
- **desktop mode**: Runs full GNOME session via `supervisord.conf` (includes xvnc, desktop, novnc, theia, vibe-kanban, openclaw, caddy)
- **lite mode**: Runs only Theia + Vibe Kanban + OpenClaw + Caddy via `supervisord-lite.conf` (no VNC/desktop overhead)

### Authentication Architecture
Caddy serves as a unified Basic Auth gateway in front of Theia, Vibe Kanban, and OpenClaw. Internal services bind to `127.0.0.1` only; Caddy listens on `0.0.0.0` and proxies authenticated requests. noVNC/VNC retain their own VNC password authentication.

### Key Config Files
| File | Purpose |
|------|---------|
| `configs/theia-package.json` | Theia plugin set; changing this triggers a full Theia rebuild |
| `configs/supervisord.conf` | Main supervisor config (desktop mode) |
| `configs/supervisord-lite.conf` | Lite mode supervisor config |
| `configs/supervisor-theia.conf` | Theia process (port 10001, serves `/home/ubuntu/projects`) |
| `configs/supervisor-vibe-kanban.conf` | Vibe Kanban process (port 10002) |
| `configs/supervisor-openclaw.conf` | OpenClaw gateway process (port 10003, launched via npx) |
| `configs/Caddyfile` | Caddy reverse proxy config with Basic Auth (ports 20001-20004) |
| `configs/supervisor-caddy.conf` | Caddy process (ports 20001-20004) |
| `configs/supervisord.conf` | Main supervisor config, includes noVNC (port 10004) and TigerVNC (port 10005) |
| `configs/xsession` | GNOME Flashback session startup script |
| `configs/desktop-shortcuts/` | `.desktop` files for Chrome, Theia, Vibe Kanban on desktop |

### Persistent Volumes (docker-compose.yml)
- `projects` → `/home/ubuntu/projects` — user code
- `theia-data` → `/home/ubuntu/.theia` — Theia settings
- `vibe-kanban-data` → `/home/ubuntu/.local/share/vibe-kanban`
- `user-data` → `/home/ubuntu/.local/share` — includes bash history
- `openclaw-data` → `/home/ubuntu/.openclaw` — OpenClaw config and data
- `gitconfig` → `/home/ubuntu/.gitconfig-vol` — git identity (symlinked to `~/.gitconfig` at startup)
- `/var/run/docker.sock` — Docker socket passthrough

## CI/CD

GitHub Actions (`.github/workflows/`) builds and pushes multi-arch images (`linux/amd64`, `linux/arm64`) to both Docker Hub and GitHub Container Registry on pushes to `main` or version tags (`v*`). Requires `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets.

## Important Notes

- The `abc/` directory exists but is currently empty.
- The `docker_ubuntu-unity-novnc/` directory contains a reference upstream project (Ubuntu 20.04 Unity desktop) that this project is derived from.
- Theia is pinned to `1.60.2` across all `@theia/*` packages to ensure compatibility with native build dependencies.
- When modifying the Dockerfile, keep config file `COPY` instructions near the end to maximize layer cache reuse for the expensive Theia build step.
- OpenClaw and Vibe Kanban are both launched via `npx` at runtime (not pre-installed in the image), so first startup may take longer while packages are fetched. Run `docker exec -it -u ubuntu webcode openclaw onboard` to complete OpenClaw initial configuration.
