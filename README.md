<p align="center">
  <img src="https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/icon-source.png" width="120" alt="webcode">
</p>

# webcode

![GitHub Stars](https://img.shields.io/github/stars/land007/webcode?style=social)
![License](https://img.shields.io/badge/license-MIT-blue)
![Docker Pulls](https://img.shields.io/docker/pulls/land007/webcode)
![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-blue)
![Image Size](https://img.shields.io/docker/image-size/land007/webcode/latest)

[📦 Repository](https://github.com/land007/webcode) | [🐳 Docker Hub](https://hub.docker.com/r/land007/webcode) | [🐛 Issues](https://github.com/land007/webcode/issues) | [📖 Releases](https://github.com/land007/webcode/releases)

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

## 🚀 Installation

### Method 1: Desktop App — Download & Run (Easiest) ⭐

No Git or Node.js needed. Just Docker Desktop + a download.

**Step 1 — Install Docker Desktop** (if not already installed):

| Platform | Download |
|----------|----------|
| macOS | [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) |
| Windows | [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) |
| Linux | [Docker Engine](https://docs.docker.com/engine/install/) |

**Step 2 — Download the webcode Launcher app:**

Go to the [**Releases page**](https://github.com/land007/webcode/releases/latest) and download the file for your platform:

| Platform | File to download |
|----------|-----------------|
| macOS (Apple Silicon / M1+) | `webcode-launcher-osx-arm64-*.zip` |
| macOS (Intel) | `webcode-launcher-osx-x64-*.zip` |
| Windows | `webcode-launcher-win-x64-*.zip` |
| Linux | `webcode-launcher-linux-x64-*.zip` |

**Step 3 — Unzip and run:**

- **macOS**: Unzip → right-click `webcode.app` → **Open** (required first time to bypass Gatekeeper)
- **Windows**: Unzip → double-click `webcode.exe` → click "Run anyway" if SmartScreen appears
- **Linux**: Unzip → run `./webcode`

The app will guide you through setup with a step-by-step wizard.

---

### Method 2: One-Command Installer (Terminal)

**macOS / Linux**:
```bash
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/install.sh | bash
```

**Windows** (PowerShell — **Run as Administrator**):
```powershell
irm https://raw.githubusercontent.com/land007/webcode/main/install.ps1 | iex
```

---

### Method 3: Docker Only (Servers / Headless)

No GUI needed. Requires [Docker](https://docs.docker.com/engine/install/).

**macOS / Linux / WSL / Git Bash:**
```bash
mkdir -p ~/webcode && cd ~/webcode
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

**Windows PowerShell:**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\webcode"
Set-Location "$env:USERPROFILE\webcode"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml" -OutFile docker-compose.yml
docker compose up -d
```

---

## 🌐 Access

After startup, open these URLs in your browser:

| Service | URL | Login |
|---------|-----|-------|
| 💻 Theia IDE | http://localhost:20001 | `admin` / `changeme` |
| 📊 Vibe Kanban | http://localhost:20002 | `admin` / `changeme` |
| 🤖 OpenClaw AI | http://localhost:20003 | `admin` / `changeme` |
| 🖥️ noVNC Desktop | http://localhost:20004 | VNC password: `changeme` |
| VNC client app | localhost:20005 | VNC password: `changeme` |

> Default credentials are `admin` / `changeme`. Change them via `.env` (see Configuration).

---

## 🔒 Security & Isolation

**Will AI break my computer? No!**

Everything runs inside a **sandboxed Docker container**. Your host computer is completely safe.

- ✅ **AI can't touch your files** — It only sees files inside the container, not your documents, photos, or anything on your real computer
- ✅ **Experiment freely** — Run any code, install anything, break things inside — your computer stays untouched
- ✅ **One-command reset** — Messed up? Run `docker compose down -v` and start fresh in seconds

> 💡 Think of it like a "sandbox computer" running inside your real computer. You can do anything inside the sandbox — it won't affect your real computer at all.

**⚠️ About Docker socket (optional)**

By default, `/var/run/docker.sock` is mounted for Docker-in-Docker capability.
- **Most users**: Keep it — you'll want this feature
- **Security-sensitive use**: Comment it out in `docker-compose.yml` if running untrusted code

---

## ⚙️ Configuration (.env)

Create a `.env` file next to `docker-compose.yml` to customize settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `desktop` | `desktop` (with VNC desktop) or `lite` (no desktop, lighter) |
| `AUTH_USER` | `admin` | Login username for Theia / Vibe Kanban / OpenClaw |
| `AUTH_PASSWORD` | `changeme` | Login password |
| `VNC_PASSWORD` | auto-generated | VNC desktop password (desktop mode only) |
| `VNC_RESOLUTION` | `1920x1080` | Desktop resolution (desktop mode only) |
| `OPENCLAW_TOKEN` | `changeme` | OpenClaw token (pass as `?token=<value>` in the URL) |
| `GIT_USER_NAME` | — | Git commit username |
| `GIT_USER_EMAIL` | — | Git commit email |
| `CF_TUNNEL_TOKEN` | empty | Cloudflare Tunnel token — enables remote access when set |

```bash
cp .env.example .env
# Edit .env, then:
docker compose up -d
```

---

## 🖥️ Run Modes

**Desktop mode** (default) — Full GNOME Linux desktop in your browser, with Chinese input (fcitx + Google Pinyin):
```bash
docker compose up -d
```

**Lite mode** — Only Theia + Vibe Kanban + OpenClaw, no desktop (lower resource usage):
```bash
MODE=lite docker compose up -d
```

---

## 🔧 Common Commands

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and erase all data (caution!)
docker compose down -v

# Restart a single service
docker exec -it webcode supervisorctl restart theia
```

---

## 💾 Data Persistence

Your data survives container restarts and updates — stored in Docker volumes:

| Volume | What's stored |
|--------|---------------|
| `projects` | Your code (`/home/ubuntu/projects`) |
| `theia-data` | Theia plugins and settings |
| `vibe-kanban-data` | Kanban task data |
| `user-data` | Bash history and user data |
| `openclaw-data` | OpenClaw config and data |
| `gitconfig` | Git identity (`.gitconfig`) |

---

## 🤖 OpenClaw First-Time Setup

After first startup, run this once to complete initialization:
```bash
docker exec -it -u ubuntu webcode openclaw onboard
```
Follow the prompts, then refresh http://localhost:20003.

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

---

## 🚀 安装方式

### 方式一：下载桌面应用（最简单）⭐

不需要安装 Git 或 Node.js，只需安装 Docker Desktop 后下载应用即可。

**第一步 — 安装 Docker Desktop**（已安装可跳过）：

| 平台 | 下载地址 |
|------|---------|
| macOS | [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) |
| Windows | [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) |
| Linux | [Docker Engine](https://docs.docker.com/engine/install/) |

**第二步 — 下载 webcode 启动器应用**：

前往 [**Releases 页面**](https://github.com/land007/webcode/releases/latest) 下载对应平台的文件：

| 平台 | 下载文件 |
|------|---------|
| macOS（Apple Silicon / M1 及以上） | `webcode-launcher-osx-arm64-*.zip` |
| macOS（Intel 芯片） | `webcode-launcher-osx-x64-*.zip` |
| Windows | `webcode-launcher-win-x64-*.zip` |
| Linux | `webcode-launcher-linux-x64-*.zip` |

**第三步 — 解压并运行**：

- **macOS**：解压后右键点击 `webcode.app` → 选择**打开**（首次运行需要这样操作以绕过系统安全提示）
- **Windows**：解压后双击 `webcode.exe`，如弹出 SmartScreen 警告，点击"仍要运行"
- **Linux**：解压后运行 `./webcode`

应用会通过图形向导一步步引导你完成设置。

---

### 方式二：一键命令安装（终端）

**macOS / Linux**：
```bash
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/install.sh | bash
```

**Windows**（PowerShell — **需以管理员身份运行**）：
```powershell
irm https://raw.githubusercontent.com/land007/webcode/main/install.ps1 | iex
```

---

### 方式三：纯 Docker（服务器 / 无图形界面）

不需要图形界面。需要安装 [Docker](https://docs.docker.com/engine/install/)。

**macOS / Linux / WSL / Git Bash：**
```bash
mkdir -p ~/webcode && cd ~/webcode
curl -fsSL https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml -o docker-compose.yml
docker compose up -d
```

**Windows PowerShell：**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\webcode"
Set-Location "$env:USERPROFILE\webcode"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml" -OutFile docker-compose.yml
docker compose up -d
```

---

## 🌐 访问地址

启动后，在浏览器中打开以下地址：

| 服务 | 地址 | 登录账号 |
|------|------|---------|
| 💻 Theia IDE | http://localhost:20001 | `admin` / `changeme` |
| 📊 Vibe Kanban | http://localhost:20002 | `admin` / `changeme` |
| 🤖 OpenClaw AI | http://localhost:20003 | `admin` / `changeme` |
| 🖥️ noVNC 桌面 | http://localhost:20004 | VNC 密码：`changeme` |
| VNC 客户端软件 | localhost:20005 | VNC 密码：`changeme` |

> 默认账号密码为 `admin` / `changeme`，可通过 `.env` 文件修改（见配置说明）。

---

## 🔒 安全性与隔离

**AI 会弄坏我的电脑吗？不会！**

所有操作都在**沙箱化的 Docker 容器**里运行，你的电脑完全安全。

- ✅ **AI 碰不到你的文件** — 它只能看到容器里的文件，碰不到你的文档、照片或电脑上的任何东西
- ✅ **随便折腾没关系** — 运行任何代码、安装任何东西、把容器弄坏 — 你的真实电脑毫发无损
- ✅ **一键恢复** — 搞乱了？运行 `docker compose down -v` 几秒内即可重新开始

> 💡 打个比方：webcode 就像你真实电脑里的一台"沙盒电脑"。你可以在沙盒里为所欲为，完全不会影响你的真实电脑。

**⚠️ 关于 Docker socket（可选）**

默认 `docker-compose.yml` 挂载了 `/var/run/docker.sock`，支持容器内管理其他容器（Docker-in-Docker）。
- **大多数用户**：保持启用 — 通常需要这个功能
- **安全敏感场景**：如果运行不可信代码，可在 `docker-compose.yml` 中注释掉该行

---

## ⚙️ 配置说明（.env）

在 `docker-compose.yml` 同目录下创建 `.env` 文件来自定义设置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `desktop` | 运行模式：`desktop`（含桌面）或 `lite`（无桌面，更轻量） |
| `AUTH_USER` | `admin` | 登录用户名，适用于 Theia / Vibe Kanban / OpenClaw |
| `AUTH_PASSWORD` | `changeme` | 登录密码 |
| `VNC_PASSWORD` | 自动生成 | VNC 桌面密码（仅 desktop 模式有效） |
| `VNC_RESOLUTION` | `1920x1080` | 桌面分辨率（仅 desktop 模式有效） |
| `OPENCLAW_TOKEN` | `changeme` | OpenClaw token（访问时在 URL 末尾加 `?token=<值>`） |
| `GIT_USER_NAME` | — | Git 提交用户名 |
| `GIT_USER_EMAIL` | — | Git 提交邮箱 |
| `CF_TUNNEL_TOKEN` | 空（不启用）| Cloudflare Tunnel token，设置后自动启用远程访问 |

```bash
cp .env.example .env
# 按需修改 .env，然后：
docker compose up -d
```

---

## 🖥️ 运行模式

**Desktop 模式**（默认）— 完整 GNOME Linux 桌面，通过浏览器访问，支持中文输入（fcitx + Google 拼音）：
```bash
docker compose up -d
```

**Lite 模式** — 仅运行 Theia + Vibe Kanban + OpenClaw，无桌面，资源占用更小：
```bash
MODE=lite docker compose up -d
```

---

## 🔧 常用命令

```bash
# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止
docker compose down

# 停止并清除所有数据（慎用！）
docker compose down -v

# 重启单个服务（以 theia 为例）
docker exec -it webcode supervisorctl restart theia
```

---

## 💾 数据持久化

以下数据存储在 Docker 数据卷中，容器重建后不会丢失：

| 数据卷 | 内容 |
|--------|------|
| `projects` | 你的代码（`/home/ubuntu/projects`） |
| `theia-data` | Theia 插件与设置 |
| `vibe-kanban-data` | Kanban 任务数据 |
| `user-data` | bash 历史记录等用户数据 |
| `openclaw-data` | OpenClaw 配置与数据 |
| `gitconfig` | Git 用户信息（`.gitconfig`） |

---

## 🤖 OpenClaw 首次初始化

首次启动后，运行以下命令完成初始化（只需一次）：
```bash
docker exec -it -u ubuntu webcode openclaw onboard
```
按提示完成配置后，刷新 http://localhost:20003 即可使用。
