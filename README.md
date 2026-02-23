<p align="center">
  <img src="https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/icon-source.png" width="120" alt="webcode">
</p>

# webcode

![GitHub Stars](https://img.shields.io/github/stars/land007/webcode?style=social)
![License](https://img.shields.io/badge/license-MIT-blue)
![Docker Pulls](https://img.shields.io/docker/pulls/land007/webcode)
![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-blue)
![Image Size](https://img.shields.io/docker/image-size/land007/webcode/latest)

[📦 Repository](https://github.com/land007/webcode) | [🐳 Docker Hub](https://hub.docker.com/r/land007/webcode) | [🐛 Issues](https://github.com/land007/webcode/issues) | [📖 Changelog](https://github.com/land007/webcode/releases)

A Docker-based browser-accessible development environment with **Theia IDE**, **Vibe Kanban**, **noVNC Desktop**, and **OpenClaw AI**.

---

## ✨ What's Inside

| Component | Description |
|-----------|-------------|
| 💻 **Theia IDE** | Browser-based VS Code alternative with full coding experience |
| 📊 **Vibe Kanban** | Visual task board for project management |
| 🤖 **OpenClaw AI** | Self-hosted AI assistant gateway (supports multiple AI providers) |
| 🖥️ **noVNC Desktop** | Full GNOME Flashback Linux desktop accessible via browser |
| 🔒 **Sandboxed** | Complete isolation — AI cannot access your host files |

---

## 🎯 Use Cases

- **🧪 AI Development & Testing**: Experiment with AI tools safely without risking your host system
- **📚 Learning Environment**: Practice Linux, coding, or DevOps — reset instantly with `docker compose down -v`
- **🌐 Remote Development**: Access your full development environment from any device with a browser
- **🔧 Quick Project Sandbox**: Spin up an isolated dev environment for temporary projects

---

## 📊 Comparison

| | webcode | Local VS Code | GitPod / Codespaces |
|---|---|---|---|
| **Setup Time** | ~1 min | 30+ min | Instant |
| **Isolation** | ✅ Full container | ❌ Host system | ✅ Container |
| **AI Safety** | ✅ Sandbox protects host | ❌ AI has host access | ⚠️ Shared environment |
| **Offline Use** | ✅ Fully offline | ✅ | ❌ Requires internet |
| **Data Persistence** | ✅ Docker volumes | ✅ Local files | ⚠️ Needs setup |
| **Linux Desktop** | ✅ Included | ❌ N/A | ❌ N/A |
| **Cost** | Free (your hardware) | Free | Paid tiers |

---

## 🚀 Quick Start

### One-Command Install

**macOS / Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/install.sh | bash
```

**Windows** (PowerShell - **Run as Administrator**):
```powershell
irm https://raw.githubusercontent.com/land007/webcode/main/install.ps1 | iex
```

> **Note**: Windows users must run PowerShell as Administrator for automatic Node.js installation. Alternatively, use WSL to run the bash script.

This installer will:
- Detect your environment (desktop vs server)
- Offer Launcher GUI for desktop users (if Node.js 18+ is installed)
- Or install directly using Docker

---

### Method 1: Visual Launcher (Recommended for Desktop Users)

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

### Method 2: Docker Only (For Servers)

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

## Security & Isolation

**🔒 Will AI break my computer? No!**

Everything runs inside a **sandboxed Docker container**. Your host computer is 100% safe.

- ✅ **OpenClaw AI can't touch your files** — It only sees files inside the container, not your documents, photos, or anything on your computer
- ✅ **Go wild with experiments** — Run any code, install anything, break things inside — your computer stays untouched
- ✅ **One-command reset** — Messed up? Run `docker compose down -v` and start fresh

> 💡 **Think of it like this**: webcode is a safe "playground computer" inside your real computer. You can do anything inside the playground — it won't affect your real computer at all.

**⚠️ Advanced: Docker socket (optional)**

By default, `docker-compose.yml` has `/var/run/docker.sock` enabled for Docker-in-Docker. This gives the container extra power to manage other containers.

- **For most users**: Keep it enabled — you probably want this feature
- **For production/security**: Comment it out if running untrusted code

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

基于 Docker 的浏览器可访问开发环境，内置 **Theia IDE**、**Vibe Kanban**、**noVNC 桌面**和 **OpenClaw AI**。

---

## ✨ 内置组件

| 组件 | 说明 |
|------|------|
| 💻 **Theia IDE** | 浏览器版 VS Code 替代品，完整编码体验 |
| 📊 **Vibe Kanban** | 可视化看板任务管理工具 |
| 🤖 **OpenClaw AI** | 自托管 AI 助手网关（支持多种 AI 服务商） |
| 🖥️ **noVNC 桌面** | 通过浏览器访问的完整 GNOME Linux 桌面 |
| 🔒 **沙箱隔离** | 完全隔离 — AI 无法访问你的宿主机文件 |

---

## 🎯 适用场景

- **🧪 AI 开发与测试**：安全地试验各种 AI 工具，无需担心影响宿主机
- **📚 学习环境**：练习 Linux、编程或 DevOps — 用 `docker compose down -v` 一键重置
- **🌐 远程开发**：从任何设备的浏览器访问完整开发环境
- **🔧 临时项目沙盒**：为临时项目快速启动隔离的开发环境

---

## 📊 对比

| | webcode | 本地 VS Code | GitPod / Codespaces |
|---|---|---|---|
| **安装时间** | ~1 分钟 | 30+ 分钟 | 即开 |
| **隔离性** | ✅ 完全容器化 | ❌ 宿主机系统 | ✅ 容器 |
| **AI 安全性** | ✅ 沙箱保护宿主机 | ❌ AI 可访问宿主机 | ⚠️ 共享环境 |
| **离线使用** | ✅ 完全离线 | ✅ | ❌ 需要联网 |
| **数据持久化** | ✅ Docker 卷 | ✅ 本地文件 | ⚠️ 需配置 |
| **Linux 桌面** | ✅ 内置 | ❌ 无 | ❌ 无 |
| **费用** | 免费（自有硬件） | 免费 | 付费档位 |

### 一键安装

**macOS / Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/install.sh | bash
```

**Windows** (PowerShell - **需以管理员身份运行**):
```powershell
irm https://raw.githubusercontent.com/land007/webcode/main/install.ps1 | iex
```

> **Note**：Windows 用户必须以管理员身份运行 PowerShell 才能自动安装 Node.js。或者使用 WSL 运行 bash 脚本。

安装程序将：
- 自动检测环境（桌面 vs 服务器）
- 为桌面用户提供 Launcher 图形界面（需 Node.js 18+）
- 或直接使用 Docker 安装

---

### 方法一：Launcher 图形界面（桌面用户推荐）

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

### 方法二：仅 Docker（服务器场景）

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

## 安全性与隔离

**🔒 AI 会弄坏我的电脑吗？不会！**

所有操作都在**沙箱化的 Docker 容器**里运行。你的电脑 100% 安全。

- ✅ **OpenClaw AI 碰不到你的文件** — 它只能看到容器里的文件，碰不到你的文档、照片或电脑上的任何东西
- ✅ **随便折腾没关系** — 任何代码、任何操作、搞坏任何东西 — 你的电脑毫发无损
- ✅ **一键恢复** — 搞乱了？运行 `docker compose down -v` 就能重新开始

> 💡 **打个比方**：webcode 就像你真实电脑里的一台"沙盒电脑"。你可以在沙盒里为所欲为 — 完全不会影响你的真实电脑。

**⚠️ 高级：Docker socket（可选）**

默认情况下，`docker-compose.yml` 启用了 `/var/run/docker.sock` 以支持 Docker-in-Docker 功能，这会让容器获得管理其他容器的额外能力。

- **大多数用户**：保持启用 — 你可能需要这个功能
- **生产/安全场景**：如果运行不可信代码，可以注释掉这一行

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
