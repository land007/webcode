# MVP: 迁移到 SSO 架构 - 移除 Caddy，使用 dashboard-server.js

## 概述

将当前的 Caddy 反向代理架构迁移到纯 dashboard-server.js SSO 架构。此 MVP 实现核心功能，确保系统可用性，安全加固将在后续版本中完成。

**目标**：
- 完全移除 Caddy 依赖
- dashboard-server.js 处理所有认证和代理
- 实现单点登录（SSO）：用户只在 Dashboard (20000) 输入一次密码

**MVP 范围**：
1. ✅ dashboard-server.js 添加 Basic Auth 验证
2. ✅ 修改端口配置（20001-20004）
3. ✅ 修改 iframe URL
4. ✅ 移除 Caddy 相关配置
5. ✅ 添加认证日志

**不在 MVP 范围**（后续版本）：
- 会话管理（Cookie-based）
- 速率限制
- 安全头部（CSP）
- 退出登录功能

## 架构变更

### 之前（使用 Caddy）
```
用户 → Caddy (20000) Basic Auth → dashboard-server.js (10000)
       ↓ iframe
用户 → Caddy (20001-20004) Basic Auth → 服务 (10001-10004)
```

### 之后（纯 dashboard-server.js）
```
用户 → dashboard-server.js (20000) Basic Auth → Dashboard HTML
       ↓ iframe
用户 → dashboard-server.js (20001-20004) 自动注入认证 → 服务 (10001-10004)
```

## 实施步骤

### 步骤 1: 增强 dashboard-server.js - 添加 Basic Auth

**文件**: `configs/dashboard-server.js`

#### 1.1 修改端口配置

**位置**: 第 22-31 行

**原代码**：
```javascript
// Configuration
const DASHBOARD_PORT = 10000;

// Proxy port mapping (listen port -> target port)
const PROXY_CONFIG = [
  { listen: 10010, target: 10001, authType: 'basic' },
  { listen: 10011, target: 10002, authType: 'basic' },
  { listen: 10012, target: 10003, authType: 'bearer' },
  { listen: 10013, target: 10004, authType: 'basic' },
];
```

**新代码**：
```javascript
// Configuration
const DASHBOARD_PORT = 20000;

// Proxy port mapping (listen port -> target port)
const PROXY_CONFIG = [
  { listen: 20001, target: 10001, authType: 'basic' },  // Theia IDE
  { listen: 20002, target: 10002, authType: 'basic' },  // Vibe Kanban
  { listen: 20003, target: 10003, authType: 'bearer' }, // OpenClaw AI
  { listen: 20004, target: 10004, authType: 'basic' },  // noVNC
];
```

#### 1.2 添加认证日志函数

**位置**: 在 `startProxy()` 函数之后添加（第 107 行后）

**新代码**：
```javascript
/**
 * Log authentication attempt
 * @param {string} result - 'success' or 'failure'
 * @param {string} authHeader - Authorization header value
 */
function logAuth(result, authHeader) {
  const timestamp = new Date().toISOString();
  if (result === 'success') {
    // 只记录时间，不记录认证头（安全考虑）
    console.log(`[${timestamp}] Auth: SUCCESS`);
  } else {
    console.log(`[${timestamp}] Auth: FAILED`);
  }
}
```

#### 1.3 修改 startDashboardServer() 添加 Basic Auth 验证

**位置**: 第 112-138 行

**原代码**：
```javascript
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // Serve dashboard.html for root path
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(DASHBOARD_HTML, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading dashboard');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else {
      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(DASHBOARD_PORT, '0.0.0.0', () => {
    console.log(`Dashboard server started on port ${DASHBOARD_PORT}`);
  });

  httpServers.push(server);
  return server;
}
```

**新代码**：
```javascript
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // Check Basic Auth
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      logAuth('failure', 'missing');
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="WebCode Dashboard"'
      });
      res.end('Authentication required');
      return;
    }

    // Verify credentials
    if (authHeader !== BASIC_AUTH) {
      logAuth('failure', 'invalid');
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Invalid credentials');
      return;
    }

    logAuth('success', authHeader);

    // Serve dashboard.html for root path
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(DASHBOARD_HTML, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading dashboard');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    } else {
      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(DASHBOARD_PORT, '0.0.0.0', () => {
    console.log(`Dashboard server started on port ${DASHBOARD_PORT}`);
  });

  httpServers.push(server);
  return server;
}
```

### 步骤 2: 修改 dashboard.html

**文件**: `configs/dashboard.html`

**位置**: 第 316-319 行

**原代码**：
```html
<iframe id="frame-desktop" class="visible" src="http://127.0.0.1:10013/vnc.html" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-ide" src="http://127.0.0.1:10010" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-kanban" src="http://127.0.0.1:10011" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-ai" src="http://127.0.0.1:10012" allow="clipboard-read; clipboard-write;"></iframe>
```

**新代码**：
```html
<iframe id="frame-desktop" class="visible" src="http://127.0.0.1:20004/vnc.html" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-ide" src="http://127.0.0.1:20001" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-kanban" src="http://127.0.0.1:20002" allow="clipboard-read; clipboard-write;"></iframe>
<iframe id="frame-ai" src="http://127.0.0.1:20003" allow="clipboard-read; clipboard-write;"></iframe>
```

### 步骤 3: 从 supervisord.conf 移除 Caddy

**文件**: `configs/supervisord.conf`

**位置**: 第 41-42 行

**原代码**：
```ini
[include]
files = /etc/supervisor/conf.d/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-dashboard.conf /etc/supervisor/conf.d/supervisor-caddy.conf /etc/supervisor/conf.d/supervisor-cloudflared.conf /etc/supervisor/conf.d/supervisor-analytics.conf /etc/supervisor/conf.d/supervisor-audio.conf
```

**新代码**：
```ini
[include]
files = /etc/supervisor/conf.d/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-dashboard.conf /etc/supervisor/conf.d/supervisor-cloudflared.conf /etc/supervisor/conf.d/supervisor-analytics.conf /etc/supervisor/conf.d/supervisor-audio.conf
```

**注意**：移除了 `/etc/supervisor/conf.d/supervisor-caddy.conf`

### 步骤 4: 从 supervisord-lite.conf 移除 Caddy

**文件**: `configs/supervisord-lite.conf`

**位置**: 第 15-16 行

**原代码**：
```ini
[include]
files = /etc/supervisor/conf.d/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-dashboard.conf /etc/supervisor/conf.d/supervisor-caddy.conf /etc/supervisor/conf.d/supervisor-cloudflared.conf /etc/supervisor/conf.d/supervisor-analytics.conf
```

**新代码**：
```ini
[include]
files = /etc/supervisor/conf.d/supervisor-theia.conf /etc/supervisor/conf.d/supervisor-vibe-kanban.conf /etc/supervisor/conf.d/supervisor-openclaw.conf /etc/supervisor/conf.d/supervisor-dashboard.conf /etc/supervisor/conf.d/supervisor-cloudflared.conf /etc/supervisor/conf.d/supervisor-analytics.conf
```

### 步骤 5: 从 Dockerfile 移除 Caddy

**文件**: `Dockerfile`

#### 5.1 移除 Caddy 安装

**位置**: 第 84-87 行

**原代码**：
```dockerfile
# ─── 10. Caddy ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends caddy \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
```

**操作**：删除这几行

#### 5.2 移除 Caddyfile 复制

**位置**: 第 203-204 行

**原代码**：
```dockerfile
COPY configs/Caddyfile /etc/caddy/Caddyfile
COPY configs/supervisor-caddy.conf /etc/supervisor/conf.d/supervisor-caddy.conf
```

**操作**：删除这几行

### 步骤 6: 验证配置文件

**docker-compose.yml** - 无需修改，端口映射保持不变：

```yaml
ports:
  - "20000:20000"  # Dashboard (dashboard-server.js with Basic Auth)
  - "20001:20001"  # Theia (dashboard-server.js proxy)
  - "20002:20002"  # Vibe Kanban (dashboard-server.js proxy)
  - "20003:20003"  # OpenClaw (dashboard-server.js proxy)
  - "20004:20004"  # noVNC (dashboard-server.js proxy)
  - "20005:10005"  # TigerVNC (direct connection)
```

**launcher/assets/docker-compose.yml** - 同上，无需修改

## 测试验证

### 1. 构建镜像

```bash
cd /Users/jiayiqiu/智能体/webcode
docker build -t land007/webcode:latest .
```

### 2. 重启容器

```bash
docker compose down && docker compose up -d
```

### 3. 检查进程状态

```bash
docker exec webcode supervisorctl status
```

**期望输出**：
```
analytics                        RUNNING   pid ...
audio-ws                         RUNNING   pid ...
cloudflared                      RUNNING   pid ...
dashboard                        RUNNING   pid ...
desktop                          RUNNING   pid ...
novnc                            RUNNING   pid ...
openclaw                         RUNNING   pid ...
pulseaudio                       RUNNING   pid ...
theia                            RUNNING   pid ...
vibe-kanban                      RUNNING   pid ...
xvnc                             RUNNING   pid ...
```

**不应该看到**：`caddy`

### 4. 检查端口监听

```bash
docker exec webcode netstat -tlnp | grep -E "20000|20001|20002|20003|20004"
```

**期望输出**：
```
tcp        0      0 0.0.0.0:20000           0.0.0.0:*               LISTEN      xxxxx/node
tcp        0      0.0.0.0:20001           0.0.0.0:*               LISTEN      xxxxx/node
tcp        0      0.0.0.0:20002           0.0.0.0:*               LISTEN      xxxxx/node
tcp        0      0.0.0.0:20003           0.0.0.0:*               LISTEN      xxxxx/node
tcp        0.0.0.0:20004           0.0.0.0:*               LISTEN      xxxxx/node
```

### 5. 测试 Dashboard 认证

```bash
curl -I http://localhost:20000
```

**期望输出**（未认证）：
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="WebCode Dashboard"
```

```bash
curl -I -u admin:changeme http://localhost:20000
```

**期望输出**（已认证）：
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

### 6. 测试 Dashboard 页面

1. 打开浏览器访问 http://localhost:20000
2. 应该弹出认证对话框
3. 输入用户名：`admin`，密码：`changeme`
4. Dashboard 页面应该加载
5. 测试 4 个标签页，所有 iframe 应该正常加载（无需再次认证）

### 7. 测试 Launcher

1. 打开 launcher 应用
2. 点击各服务按钮
3. 应该直接打开服务（无需认证）

### 8. 检查认证日志

```bash
docker exec webcode tail -f /tmp/dashboard_stdout.log
```

**期望看到**：
```
[2024-02-28T...] Auth: SUCCESS
[2024-02-28T...] Auth: FAILED
```

## 回滚方案

如果出现问题，按以下步骤回滚：

```bash
# 1. 恢复 Caddyfile 和 supervisor-caddy.conf
git checkout configs/Caddyfile configs/supervisor-caddy.conf

# 2. 恢复 supervisord.conf
git checkout configs/supervisord.conf configs/supervisord-lite.conf

# 3. 恢复 dashboard-server.js 和 dashboard.html
git checkout configs/dashboard-server.js configs/dashboard.html

# 4. 重新构建镜像
docker build -t land007/webcode:latest .

# 5. 重启容器
docker compose down && docker compose up -d
```

## 文件清单

### 需要修改的文件（6 个）

| 文件 | 修改内容 | 行数变化 |
|------|---------|---------|
| `configs/dashboard-server.js` | 1. 修改端口配置<br>2. 添加认证日志<br>3. 添加 Basic Auth 验证 | +20 -5 |
| `configs/dashboard.html` | 修改 iframe URL | +4 -4 |
| `configs/supervisord.conf` | 移除 supervisor-caddy.conf 引用 | -1 |
| `configs/supervisord-lite.conf` | 移除 supervisor-caddy.conf 引用 | -1 |
| `Dockerfile` | 移除 Caddy 安装和配置文件复制 | -10 |
| `launcher/assets/docker-compose.yml` | 无需修改 | 0 |

### 可以删除的文件（2 个）

| 文件 | 操作 | 原因 |
|------|------|------|
| `configs/Caddyfile` | 保留（用于回滚） | Caddy 已弃用 |
| `configs/supervisor-caddy.conf` | 保留（用于回滚） | Caddy 已弃用 |

### 无需修改的文件

| 文件 | 原因 |
|------|------|
| `docker-compose.yml` | 端口映射保持不变 |
| `launcher/src/ports.js` | 端口配置已正确 |
| `launcher/src/app.js` | 已有 SSO 代理实现 |

## 优势

1. ✅ **简化架构**：移除 Caddy，减少依赖
2. ✅ **统一认证**：dashboard-server.js 处理所有认证
3. ✅ **单点登录**：用户只在 Dashboard 输入一次密码
4. ✅ **减小镜像**：移除 Caddy 减小镜像体积（约 40MB）
5. ✅ **更好的性能**：减少一层代理跳转
6. ✅ **易于维护**：所有认证逻辑在一个服务中

## 已知限制（MVP）

1. ⚠️ **密码明文传输**：Basic Auth 使用 Base64 编码（非加密）
   - **缓解措施**：仅在内网使用，或通过 SSH 隧道访问

2. ⚠️ **无会话超时**：浏览器关闭前一直保持认证
   - **后续版本**：实现 Cookie-based 会话管理

3. ⚠️ **无速率限制**：可能被暴力破解
   - **缓解措施**：使用强密码
   - **后续版本**：实现登录失败锁定

4. ⚠️ **无退出登录**：无法主动退出
   - **后续版本**：实现 /logout 端点

## 后续版本（v2.0）

- [ ] 实现会话管理（Cookie-based）
- [ ] 添加速率限制
- [ ] 添加安全头部（CSP, X-Frame-Options）
- [ ] 实现退出登录功能
- [ ] 添加 HTTPS 支持
- [ ] 实现多因素认证（可选）
