# webcode

![GitHub Stars](https://img.shields.io/github/stars/land007/webcode?style=social)
![Docker Pulls](https://img.shields.io/docker/pulls/land007/webcode)
![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-blue)
![Image Size](https://img.shields.io/docker/image-size/land007/webcode/latest)

[📦 Repository](https://github.com/land007/webcode) | [🐛 Issues](https://github.com/land007/webcode/issues) | [📖 Changelog](https://github.com/land007/webcode/releases)

A Docker-based browser-accessible development environment with Theia IDE, visual task board, VNC desktop, and AI assistant gateway.

---

> **📦 View on GitHub**: [land007/webcode](https://github.com/land007/webcode) | **🐛 Report Issues**: [GitHub Issues](https://github.com/land007/webcode/issues)

## 🚀 Quick Start

### Method 1: Docker Only (Recommended for Servers)

**Prerequisites**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS / Windows) or [Docker Engine](https://docs.docker.com/engine/install/) (Linux)

**Steps (macOS / Linux / Windows WSL / Git Bash)**:

```bash
# Create working directory
mkdir -p ~/webcode && cd ~/webcode

# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml -o docker-compose.yml

# Start
docker compose up -d
```

> **Windows PowerShell alternative** (if curl is unavailable):
> ```powershell
> New-Item -ItemType Directory -Force "$env:USERPROFILE\webcode"
> Set-Location "$env:USERPROFILE\webcode"
> Invoke-WebRequest -Uri "https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml" -OutFile docker-compose.yml
> docker compose up -d
> ```

**Access**:

| Service | URL |
|---------|-----|
| Theia IDE | http://localhost:20001 |
| Vibe Kanban | http://localhost:20002 |
| OpenClaw AI | http://localhost:20003 |
| noVNC Desktop | http://localhost:20004 |
| VNC Client | localhost:20005 (VNC protocol) |

Default credentials: `admin` / `changeme`, VNC password: `changeme`

**Stop**: `docker compose down`

**Custom passwords** (via .env file):

```bash
cp .env.example .env   # edit .env to change passwords
docker compose up -d
```

---

### Method 2: Visual Launcher (Recommended for Desktop Users)

![Launcher Setup](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-launcher-setup.png)

**Prerequisites**:
- Docker Desktop (macOS / Windows) or Docker Engine (Linux)
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/)

**macOS / Linux**:

```bash
git clone https://github.com/land007/webcode.git ~/webcode
cd ~/webcode/launcher
npm install
npx nw .
```

> Linux requires a desktop environment (`$DISPLAY` or Wayland) to display the window.

**Windows** (PowerShell or cmd):

```bat
git clone https://github.com/land007/webcode.git %USERPROFILE%\webcode
cd %USERPROFILE%\webcode\launcher
npm install
npx nw .
```

A GUI window will appear where you can configure credentials, ports, and startup mode, then click **Start** to launch the container.

![Launcher Status](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-launcher-status.png)

---

## Advanced

The image is published on Docker Hub: [`land007/webcode:latest`](https://hub.docker.com/r/land007/webcode), supporting `linux/amd64` and `linux/arm64`.

```bash
cp .env.example .env
# Edit .env as needed (defaults work out of the box)
docker compose up -d
```

### Access Points

| Service | URL | Auth |
|---------|-----|------|
| Theia IDE | http://localhost:20001 | Basic Auth |
| Vibe Kanban | http://localhost:20002 | Basic Auth |
| OpenClaw AI | http://localhost:20003 | Basic Auth |
| noVNC Desktop | http://localhost:20004 | VNC password |
| VNC Client | localhost:20005 | VNC password |

**Port pattern:**
- **20001–20004**: Caddy proxy ports (Basic Auth protected)
- **20005**: VNC direct port (VNC password auth)

Default Basic Auth: `admin` / `changeme`
Default VNC password: `changeme`

---

## Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `desktop` | Run mode: `desktop` (with VNC) / `lite` (no desktop) |
| `VNC_PASSWORD` | auto-generated | VNC login password (desktop mode only) |
| `VNC_RESOLUTION` | `1920x1080` | Desktop resolution (desktop mode only) |
| `AUTH_USER` | `admin` | Basic Auth username for Theia / Vibe Kanban / OpenClaw |
| `AUTH_PASSWORD` | `changeme` | Basic Auth password |
| `OPENCLAW_TOKEN` | `changeme` | OpenClaw gateway token (pass via `?token=<value>`) |
| `GIT_USER_NAME` | — | Git commit username |
| `GIT_USER_EMAIL` | — | Git commit email |
| `CF_TUNNEL_TOKEN` | empty (disabled) | Cloudflare Tunnel token; enables tunnel when set |

---

## Run Modes

### Desktop Mode (default)

Full GNOME Flashback desktop, accessible via browser or VNC client, with Chinese input support (fcitx + Google Pinyin).

```bash
docker compose up -d
# or explicitly
MODE=desktop docker compose up -d
```

### Lite Mode

Runs only Theia + Vibe Kanban + OpenClaw — no VNC desktop, lower resource usage.

```bash
MODE=lite docker compose up -d
```

> noVNC / VNC are unavailable in lite mode.

---

## Services

### Theia IDE

Browser-based VS Code. Working directory is `/home/ubuntu/projects` inside the container (mapped to the `projects` volume).

![Theia IDE](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-theia.png)

Access: http://localhost:20001 (Basic Auth required)

### Vibe Kanban

Kanban-style task management tool for tracking project progress.

![Vibe Kanban](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-kanban.png)

Access: http://localhost:20002

### noVNC Desktop

Full Linux desktop in your browser (desktop mode only).

![noVNC Desktop](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-desktop.png)

Access: http://localhost:20004 — enter the VNC password to log in.

### OpenClaw AI Assistant

Self-hosted AI assistant gateway supporting multiple AI services.

![OpenClaw AI](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-openclaw.png)

Access: http://localhost:20003

**Two-step authentication:**
1. Browser Basic Auth dialog → enter `AUTH_USER` / `AUTH_PASSWORD`
2. OpenClaw login → pass token via `?token=<OPENCLAW_TOKEN>`

---

## OpenClaw Initial Setup

After first startup, run the onboard command to complete initialization:

```bash
docker exec -it -u ubuntu webcode openclaw onboard
```

Follow the prompts, then refresh http://localhost:20003.

---

## Common Commands

```bash
# View running status
docker compose ps

# View logs (all services)
docker compose logs -f

# View logs for a specific service
docker exec -it webcode supervisorctl tail -f theia

# Stop
docker compose down

# Stop and delete volumes (caution: erases all data)
docker compose down -v

# Restart a single service (e.g. theia)
docker exec -it webcode supervisorctl restart theia
```

---

## Data Persistence

The following data is stored in Docker volumes and survives container rebuilds:

| Volume | Contents |
|--------|----------|
| `projects` | User code (`/home/ubuntu/projects`) |
| `theia-data` | Theia plugins and settings |
| `vibe-kanban-data` | Kanban task data |
| `user-data` | bash history and other user data |
| `openclaw-data` | OpenClaw config and data |
| `gitconfig` | Git identity (`.gitconfig`) |

---
---

# webcode（中文文档）

基于 Docker 的浏览器可访问开发环境，内置 Theia IDE、可视化任务板、VNC 桌面和 AI 助手网关。

---

> **📦 GitHub 仓库**: [land007/webcode](https://github.com/land007/webcode) | **🐛 提交问题**: [GitHub Issues](https://github.com/land007/webcode/issues)

## 🚀 快速开始

### 方法一：仅 Docker（推荐用于服务器）

**先决条件**：安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（macOS / Windows）或 [Docker Engine](https://docs.docker.com/engine/install/)（Linux）

**步骤（macOS / Linux / Windows WSL / Git Bash 均适用）**：

```bash
# 创建工作目录
mkdir -p ~/webcode && cd ~/webcode

# 下载 docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml -o docker-compose.yml

# 启动
docker compose up -d
```

> **Windows PowerShell 替代方案**（如果没有 curl）：
> ```powershell
> New-Item -ItemType Directory -Force "$env:USERPROFILE\webcode"
> Set-Location "$env:USERPROFILE\webcode"
> Invoke-WebRequest -Uri "https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml" -OutFile docker-compose.yml
> docker compose up -d
> ```

**访问地址**：

| 服务 | 地址 |
|------|------|
| Theia IDE | http://localhost:20001 |
| Vibe Kanban | http://localhost:20002 |
| OpenClaw AI | http://localhost:20003 |
| noVNC 桌面 | http://localhost:20004 |
| VNC 客户端 | localhost:20005（VNC 协议） |

默认账号：`admin` / `changeme`，VNC 密码：`changeme`

**停止**：`docker compose down`

**自定义密码**（通过 .env 文件）：

```bash
cp .env.example .env   # 编辑 .env 修改密码
docker compose up -d
```

---

### 方法二：Launcher 图形界面（桌面用户推荐）

![Launcher 设置向导](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-launcher-setup.png)

**先决条件**：
- Docker Desktop（macOS / Windows）或 Docker Engine（Linux）
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/)

**macOS / Linux**：

```bash
git clone https://github.com/land007/webcode.git ~/webcode
cd ~/webcode/launcher
npm install
npx nw .
```

> Linux 需要桌面环境（`$DISPLAY` 或 Wayland）才能显示窗口。

**Windows**（PowerShell 或 cmd）：

```bat
git clone https://github.com/land007/webcode.git %USERPROFILE%\webcode
cd %USERPROFILE%\webcode\launcher
npm install
npx nw .
```

弹出图形界面后，可配置账号密码、端口、启动模式，点击 **Start** 即可启动容器。

![Launcher 状态页](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-launcher-status.png)

---

## 高级用法

镜像已发布至 Docker Hub：[`land007/webcode:latest`](https://hub.docker.com/r/land007/webcode)，支持 `linux/amd64` 和 `linux/arm64`。

```bash
cp .env.example .env
# 按需编辑 .env（可直接使用默认值）
docker compose up -d
```

### 访问地址

| 服务 | 地址 | 认证 |
|------|------|------|
| Theia IDE | http://localhost:20001 | Basic Auth |
| Vibe Kanban | http://localhost:20002 | Basic Auth |
| OpenClaw AI | http://localhost:20003 | Basic Auth |
| noVNC 桌面 | http://localhost:20004 | VNC 密码 |
| VNC 客户端 | localhost:20005 | VNC 密码 |

**端口规律：**
- **20001–20004**: Caddy 代理端口（带 Basic Auth）
- **20005**: VNC 直连端口（VNC 密码认证）

默认 Basic Auth：`admin` / `changeme`
默认 VNC 密码：`changeme`

---

## 配置说明（.env）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `desktop` | 运行模式：`desktop`（含 VNC 桌面）/ `lite`（无桌面） |
| `VNC_PASSWORD` | 空（自动生成）| VNC 登录密码，仅 desktop 模式有效 |
| `VNC_RESOLUTION` | `1920x1080` | 桌面分辨率，仅 desktop 模式有效 |
| `AUTH_USER` | `admin` | Basic Auth 用户名，适用于 Theia / Vibe Kanban / OpenClaw |
| `AUTH_PASSWORD` | `changeme` | Basic Auth 密码 |
| `OPENCLAW_TOKEN` | `changeme` | OpenClaw 网关 token（访问时通过 `?token=<值>` 传入） |
| `GIT_USER_NAME` | — | Git 提交用户名 |
| `GIT_USER_EMAIL` | — | Git 提交邮箱 |
| `CF_TUNNEL_TOKEN` | 空（不启用）| Cloudflare Tunnel token，设置后自动启用内网穿透 |

---

## 运行模式

### Desktop 模式（默认）

完整 GNOME Flashback 桌面，通过浏览器或 VNC 客户端访问，支持中文输入（fcitx + Google 拼音）。

```bash
docker compose up -d
# 或显式指定
MODE=desktop docker compose up -d
```

### Lite 模式

仅运行 Theia + Vibe Kanban + OpenClaw，无 VNC 桌面，资源占用更小。

```bash
MODE=lite docker compose up -d
```

> Lite 模式下 noVNC / VNC 不可用。

---

## 各服务说明

### Theia IDE

浏览器版 VS Code，工作目录为容器内 `/home/ubuntu/projects`（对应 `projects` 数据卷）。

![Theia IDE](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-theia.png)

访问：http://localhost:20001（需输入 Basic Auth 账号密码）

### Vibe Kanban

看板式任务管理工具，用于跟踪项目进度。

![Vibe Kanban](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-kanban.png)

访问：http://localhost:20002

### noVNC 桌面

在浏览器中操作完整 Linux 桌面（desktop 模式专属）。

![noVNC 桌面](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-desktop.png)

访问：http://localhost:20004，输入 VNC 密码登录。

### OpenClaw AI 助手

自托管 AI 助手网关，支持配置多个 AI 服务。

![OpenClaw AI](https://raw.githubusercontent.com/land007/webcode/main/images/screenshot-openclaw.png)

访问：http://localhost:20003

**认证说明（两步）：**
1. 浏览器弹出 Basic Auth 对话框 → 输入 `AUTH_USER` / `AUTH_PASSWORD`
2. OpenClaw 内部登录页面 → 使用 `?token=<OPENCLAW_TOKEN>` 传入 token

---

## OpenClaw 初始配置

首次启动后，需运行 onboard 命令完成初始化：

```bash
docker exec -it -u ubuntu webcode openclaw onboard
```

按提示完成配置后，刷新 http://localhost:20003 即可使用。

---

## 常用命令

```bash
# 查看运行状态
docker compose ps

# 查看日志（所有服务）
docker compose logs -f

# 查看特定服务日志
docker exec -it webcode supervisorctl tail -f theia

# 停止
docker compose down

# 停止并删除数据卷（慎用，会清除所有数据）
docker compose down -v

# 重启单个服务（以 theia 为例）
docker exec -it webcode supervisorctl restart theia
```

---

## 数据持久化

以下数据存储在 Docker 数据卷中，容器重建后不会丢失：

| 数据卷 | 内容 |
|--------|------|
| `projects` | 用户代码（`/home/ubuntu/projects`） |
| `theia-data` | Theia 插件与设置 |
| `vibe-kanban-data` | Kanban 任务数据 |
| `user-data` | bash 历史记录等用户数据 |
| `openclaw-data` | OpenClaw 配置与数据 |
| `gitconfig` | Git 用户信息（`.gitconfig`） |
