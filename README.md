# webcode

基于 Docker 的浏览器可访问开发环境，内置 Theia IDE、可视化任务板、VNC 桌面和 AI 助手网关。

## 快速开始

镜像已发布至 Docker Hub：[`land007/webcode:latest`](https://hub.docker.com/r/land007/webcode)

```bash
# 复制配置文件
cp .env.example .env

# 按需编辑 .env（可直接使用默认值）

# 拉取镜像并启动
docker compose up -d
```

### 访问地址

| 服务 | 地址 | 认证 |
|------|------|------|
| Theia IDE | http://localhost:23000 | Basic Auth |
| Vibe Kanban | http://localhost:25173 | Basic Auth |
| noVNC 桌面 | http://localhost:26080 | VNC 密码 |
| VNC 客户端 | localhost:25901 | VNC 密码 |
| OpenClaw AI | http://localhost:28789 | Basic Auth |

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
| `OPENCLAW_PASSWORD` | `changeme` | OpenClaw 内部登录密码（独立于 Basic Auth） |
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

访问：http://localhost:23000（需输入 Basic Auth 账号密码）

### Vibe Kanban

看板式任务管理工具，用于跟踪项目进度。

访问：http://localhost:25173

### noVNC 桌面

在浏览器中操作完整 Linux 桌面（desktop 模式专属）。

访问：http://localhost:26080，输入 VNC 密码登录。

### OpenClaw AI 助手

自托管 AI 助手网关，支持配置多个 AI 服务。

访问：http://localhost:28789

**认证说明（两步）：**
1. 浏览器弹出 Basic Auth 对话框 → 输入 `AUTH_USER` / `AUTH_PASSWORD`
2. OpenClaw 内部登录页面 → 输入 `OPENCLAW_PASSWORD`

---

## OpenClaw 初始配置

首次启动后，需运行 onboard 命令完成初始化：

```bash
docker exec -it -u ubuntu webcode openclaw onboard
```

按提示完成配置后，刷新 http://localhost:28789 即可使用。

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
