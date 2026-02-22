# webcode 启动器（NW.js）

面向普通用户的桌面启动器。用户只需安装 Docker Desktop 和该启动器，无需克隆仓库或手动配置。

## 功能

- **安装向导**：首次运行时检测 Docker 环境 → 配置参数 → 一键启动容器
- **多标签工作区**：IDE (Theia)、看板 (Vibe Kanban)、桌面 (noVNC)、AI (OpenClaw)
- **自动登录**：本地代理注入 Basic Auth，iframe 无缝嵌入各服务
- **配置管理**：保存在本地应用数据目录，持久化配置
- **状态监控**：实时轮询容器状态，流式日志查看

## 开发运行

```bash
cd launcher
npm install
npx nw .
```

## 打包分发（可选）

```bash
npm install -g nw-builder
nwbuild -p win64,osx64,linux64 .
```

## 架构

```
NW.js 进程
├── index.html        主界面（向导 / 工作区）
├── src/config.js     配置读写（nw.App.dataPath/config.json）
└── src/app.js        Docker 管理 + 本地代理服务器

本地代理（http-proxy）
├── :14001 → :23000   Theia（注入 Basic Auth）
├── :14002 → :25173   Vibe Kanban（注入 Basic Auth）
└── :14003 → :28789   OpenClaw（注入 Basic Auth）

noVNC 直连（无需代理）
└── :26080            ?autoconnect=true&password=VNC_PASS
```

## 配置文件位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/webcode-launcher/config.json` |
| Windows | `%APPDATA%\webcode-launcher\config.json` |
| Linux | `~/.config/webcode-launcher/config.json` |

`docker-compose.yml` 存储在同目录的 `webcode/` 子目录中。

## 端口说明

| 代理端口 | 目标端口 | 服务 |
|----------|----------|------|
| 14001 | 23000 | Theia IDE |
| 14002 | 25173 | Vibe Kanban |
| 14003 | 28789 | OpenClaw |
| — | 26080 | noVNC（直连） |
