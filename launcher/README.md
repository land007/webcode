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
├── :11001 → :10001   Theia（注入 Basic Auth）
├── :11002 → :10002   Vibe Kanban（注入 Basic Auth）
├── :11003 → :10003   OpenClaw（注入 Basic Auth）
└── :11004 → :10004   noVNC（注入 Basic Auth）
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
| 11001 | 10001 | Theia IDE |
| 11002 | 10002 | Vibe Kanban |
| 11003 | 10003 | OpenClaw |
| 11004 | 10004 | noVNC |

## 机器人自我进化（DNA 生态）

容器内置 `/home/ubuntu/dna` 目录，挂载为持久化 Docker volume。启动时若目录为空，自动从 `DNA_REPO_URL` 克隆项目源码。

**机器人进化工作流：**

1. 容器启动 → `/home/ubuntu/dna` 自动 clone 基因库
2. 机器人（AI）在容器内修改 DNA（Dockerfile、configs 等）
3. 通过已挂载的 `/var/run/docker.sock` 执行 `docker build` 构建新镜像
4. `docker run` 启动子代容器，形成新机器人

**使用 fork 仓库作为基因来源：**

在 `config.json` 中设置 `DNA_REPO_URL` 字段：

```json
{
  "DNA_REPO_URL": "https://github.com/your-fork/webcode"
}
```

**生态链路：**

```
原始库 https://github.com/land007/webcode
    ↑ PR / merge（机器人进化成果反哺）
    │
fork-A/webcode ──→ 机器人 A（DNA_REPO_URL=fork-A）
    │                  └─→ 子代容器
fork-B/webcode ──→ 机器人 B（DNA_REPO_URL=fork-B）
    │                  └─→ 子代容器
    └──→ 互相 PR，形成开放进化生态
```
