---
name: webcode-hotreload
description: 快速开发调试 webcode 项目，避免每次修改都重新构建 Docker 镜像。直接复制文件到容器，重启对应服务，立即验证效果，确认后提交 git。
---

# WebCode 热重载开发

## 概述

webcode 项目快速开发调试流程。通过直接复制修改后的文件到运行中的容器，并重启对应服务，实现秒级迭代速度，而非每次都进行耗时的 Docker 镜像重建。

**适用场景**：修改配置文件、HTML/JS 静态文件、Node.js 服务脚本等

**不适用场景**：修改 Dockerfile、Theia 依赖（theia-package.json）、系统级依赖等需要重新构建的情况

## 快速开始

### 标准开发流程

```bash
# 1. 修改本地文件
vim configs/dashboard.html

# 2. 复制到容器
docker cp configs/dashboard.html webcode:/opt/dashboard.html

# 3. 重启服务
docker exec webcode supervisorctl restart dashboard

# 4. 验证效果
docker exec webcode supervisorctl status dashboard
open http://localhost:20000

# 5. 确认后提交
git add configs/
git commit -m "fix: improve layout"
```

**总耗时**：约 5-10 秒（对比 Docker build 的 5-10 分钟）

## 文件类型映射

| 本地文件 | 容器路径 | 重启命令 | 说明 |
|---------|---------|---------|------|
| `configs/dashboard-server.js` | `/opt/dashboard-server.js` | `supervisorctl restart dashboard` | Node.js 服务 |
| `configs/dashboard.html` | `/opt/dashboard.html` | `supervisorctl restart dashboard` | 静态文件需服务重读 |
| `configs/supervisor-theia.conf` | `/etc/supervisor/conf.d/supervisor-theia.conf` | `supervisorctl reread && update` | Supervisor 配置 |
| `configs/supervisor-vibe-kanban.conf` | `/etc/supervisor/conf.d/supervisor-vibe-kanban.conf` | `supervisorctl restart vibe-kanban` | 进程配置 |
| `configs/supervisor-openclaw.conf` | `/etc/supervisor/conf.d/supervisor-openclaw.conf` | `supervisorctl restart openclaw` | 进程配置 |
| `configs/xsession` | `/opt/xsession` | 需重启桌面环境 | 会话脚本 |
| `configs/startup.sh` | `/opt/startup.sh` | 需重启容器 | 启动脚本 |

## 常用服务命令

### 查看所有服务状态

```bash
docker exec webcode supervisorctl status
```

### 重启单个服务

```bash
# Dashboard
docker exec webcode supervisorctl restart dashboard

# Theia IDE
docker exec webcode supervisorctl restart theia

# Vibe Kanban
docker exec webcode supervisorctl restart vibe-kanban

# OpenClaw
docker exec webcode supervisorctl restart openclaw
```

### 查看服务日志

```bash
# 标准输出（最后 100 行）
docker exec webcode supervisorctl tail dashboard stdout

# 错误输出
docker exec webcode supervisorctl tail dashboard stderr

# 实时跟踪
docker exec webcode supervisorctl tail -f dashboard stdout
```

### Supervisor 配置变更

```bash
# 重新读取配置
docker exec webcode supervisorctl reread

# 应用变更（启动新增/修改的服务）
docker exec webcode supervisorctl update

# 组合命令
docker exec webcode bash -c 'supervisorctl reread && supervisorctl update'
```

## 验证与调试

### 验证服务运行

```bash
# 检查进程状态
docker exec webcode supervisorctl status dashboard

# 应该显示：RUNNING pid xxx, uptime 0:00:XX
```

### 测试 API 端点

```bash
# 状态 API
docker exec webcode sh -c 'curl -s -u admin:changeme http://localhost:20000/api/status'

# 日志 API
docker exec webcode sh -c 'curl -s -u admin:changeme http://localhost:20000/api/logs/dashboard | head -20'

# 检查更新 API（如果存在）
docker exec webcode sh -c 'curl -s -u admin:changeme http://localhost:20000/api/check-update'
```

### 测试静态文件

```bash
# 验证文件存在
docker exec webcode ls -la /opt/dashboard.html

# 检查文件权限
docker exec webcode stat /opt/dashboard-server.js

# 测试 HTTP 响应
docker exec webcode sh -c 'curl -s -I http://localhost:20000/ | head -5'
```

### 浏览器验证

```bash
# macOS
open http://localhost:20000

# Linux
xdg-open http://localhost:20000

# 手动打开并刷新
# 浏览器访问 http://localhost:20000
# 按 Cmd+R / F5 强制刷新
```

## 故障排查

### 问题：文件复制后服务无法启动

**症状**：`supervisorctl status` 显示 `FATAL` 或 `BACKOFF`

**排查步骤**：

```bash
# 1. 检查错误日志
docker exec webcode supervisorctl tail dashboard stderr

# 2. 检查语法错误（Node.js）
docker exec webcode node --check /opt/dashboard-server.js

# 3. 检查文件权限
docker exec webcode ls -la /opt/dashboard-server.js
# 应该是 -rw-r--r-- (644)

# 4. 恢复原文件
git checkout configs/dashboard-server.js
docker cp configs/dashboard-server.js webcode:/opt/dashboard-server.js
docker exec webcode supervisorctl restart dashboard
```

### 问题：修改没有生效

**可能原因**：
1. 浏览器缓存
2. 文件复制到错误路径
3. 忘记重启服务

**解决方案**：

```bash
# 1. 清除浏览器缓存
# Chrome: Cmd+Shift+R 强制刷新

# 2. 验证容器内文件
docker exec webcode cat /opt/dashboard.html | head -20

# 3. 确认服务重启
docker exec webcode supervisorctl status dashboard

# 4. 查看服务日志
docker exec webcode supervisorctl tail dashboard stdout | tail -20
```

### 问题：Supervisor 配置错误

**症状**：`supervisorctl reread` 报错

**解决方案**：

```bash
# 1. 测试配置文件
docker exec webcode supervisorctl configtest

# 2. 查看详细错误
docker exec webcode cat /var/log/supervisord.log

# 3. 恢复配置
git checkout configs/supervisor-theia.conf
docker cp configs/supervisor-theia.conf webcode:/etc/supervisor/conf.d/
docker exec webcode supervisorctl reread
docker exec webcode supervisorctl update
```

### 问题：容器完全崩溃

**症状**：`docker exec` 无响应，服务全部停止

**解决方案**：

```bash
# 1. 重启容器
docker compose restart

# 2. 如果还不行，重建容器
docker compose down
docker compose up -d

# 3. 检查容器日志
docker logs webcode --tail 100
```

## 完整示例：调试 Dashboard 日志功能

### 场景

修改 dashboard-server.js 和 dashboard.html，实现日志显示为悬浮模态框。

### 步骤

```bash
# === 步骤 1: 修改文件 ===
vim configs/dashboard-server.js
# 添加 /api/logs/:name 端点支持 stderr

vim configs/dashboard.html
# 将日志改为模态框显示

# === 步骤 2: 复制到容器 ===
docker cp configs/dashboard-server.js webcode:/opt/dashboard-server.js
docker cp configs/dashboard.html webcode:/opt/dashboard.html

# === 步骤 3: 重启服务 ===
docker exec webcode supervisorctl restart dashboard

# === 步骤 4: 验证服务状态 ===
docker exec webcode supervisorctl status dashboard
# 输出: dashboard  RUNNING   pid xxx, uptime 0:00:XX

# === 步骤 5: 测试 API ===
docker exec webcode sh -c 'curl -s -u admin:changeme http://localhost:20000/api/logs/dashboard | head -10'

# === 步骤 6: 浏览器测试 ===
open http://localhost:20000
# 手动操作：
# 1. 点击状态胶囊打开进程模态框
# 2. 点击某个服务的日志按钮
# 3. 验证日志以悬浮模态框显示

# === 步骤 7: 查看日志确认无错误 ===
docker exec webcode supervisorctl tail dashboard stderr | tail -10

# === 步骤 8: 提交代码 ===
git add configs/dashboard-server.js configs/dashboard.html
git commit -m "feat: display logs in floating modal

- Add stderr support to /api/logs/:name endpoint
- Replace inline log expansion with modal overlay
- Improve error log highlighting with red background
"
```

### 总耗时

- 文件修改：2 分钟
- 热重载测试：30 秒
- 总计：**2.5 分钟**（对比 Docker build 的 10+ 分钟）

## 高级技巧

### 批量文件复制

```bash
# 复制整个目录
docker cp configs/ webcode:/opt/

# 复制多个文件
docker cp configs/dashboard-server.js webcode:/opt/
docker cp configs/dashboard.html webcode:/opt/
docker cp configs/favicon.ico webcode:/opt/
```

### 组合命令

```bash
# 一键复制并重启
docker cp configs/dashboard.html webcode:/opt/dashboard.html && \
docker exec webcode supervisorctl restart dashboard && \
docker exec webcode supervisorctl status dashboard
```

### Shell 别名（可选）

在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
# WebCode 快速命令
alias wcp='docker cp'                      # webcode copy
alias wrs='docker exec webcode supervisorctl restart'  # webcode restart
alias wss='docker exec webcode supervisorctl status'   # webcode service status
alias wlog='docker exec webcode supervisorctl tail'    # webcode logs
```

使用示例：

```bash
wcp configs/dashboard.html webcode:/opt/dashboard.html
wrs dashboard
wss
wlog dashboard stdout | tail -20
```

### 监控模式

```bash
# 实时查看服务状态
watch -n 2 'docker exec webcode supervisorctl status'

# 实时查看日志
docker exec webcode supervisorctl tail -f dashboard stdout
```

## 何时需要完整重建

以下情况**必须**使用 `docker build`：

### 1. 修改 Dockerfile

```bash
# Dockerfile 变更需要重建
vim Dockerfile
docker build -t webcode .
docker compose up -d --force-recreate
```

### 2. 修改 Theia 依赖

```bash
# Theia package.json 变化
vim configs/theia-package.json
docker build -t webcode .
# 这是最慢的步骤（约 10-15 分钟）
```

### 3. 添加系统级依赖

```bash
# Dockerfile 中添加 RUN apt-get install
vim Dockerfile
docker build -t webcode .
```

### 4. 修改容器基础配置

```bash
# 修改用户、目录结构等基础配置
vim Dockerfile
docker build --no-cache -t webcode .
```

## 最佳实践

### 1. 开发前检查

```bash
# 确保容器运行
docker ps | grep webcode

# 检查服务状态
docker exec webcode supervisorctl status

# 查看当前分支
git branch
```

### 2. 修改前备份

```bash
# 创建开发分支
git checkout -b dev/logs-modal

# 或使用 stash
git stash
```

### 3. 增量提交

```bash
# 每个功能点单独提交
git add configs/dashboard-server.js
git commit -m "feat: add stderr support to logs API"

git add configs/dashboard.html
git commit -m "feat: display logs in modal overlay"
```

### 4. 测试充分

```bash
# 测试所有相关功能
# - 服务正常启动
# - API 响应正确
# - 浏览器显示正常
# - 无控制台错误

# 查看所有服务状态
docker exec webcode supervisorctl status

# 检查所有服务日志
docker exec webcode supervisorctl tail all stderr | grep -i error
```

### 5. 清理

```bash
# 开发完成后合并到主分支
git checkout main
git merge dev/logs-modal
git branch -d dev/logs-modal

# 或删除 stash
git stash drop
```

## 相关资源

- **容器名称**: `webcode`（默认，可通过 docker-compose.yml 修改）
- **Supervisor 文档**: http://supervisord.org/
- **Dashboard 端口**: 20000（Basic Auth）
- **项目文档**: `/Users/jiayiqiu/智能体/webcode/README.md`
