# 迁移到纯 SSO 架构 - 完全使用 dashboard-server.js，移除 Caddy

## Context

当前架构使用 Caddy 作为反向代理和认证网关。用户希望统一使用 SSO（单点登录）架构，完全使用 dashboard-server.js 替代 Caddy 的所有功能。

**目标**：
- 完全移除 Caddy
- dashboard-server.js 监听 20000 端口，提供 Dashboard 主页并处理 Basic Auth
- dashboard-server.js 监听 20001-20004 端口，代理到服务并自动注入认证
- 整个系统使用统一的 SSO 架构

## 当前架构

```
用户 → Caddy (20000-20004) → 服务
       Basic Auth
```

## 目标架构

### 统一 SSO 架构（无 Caddy）
```
┌── Browser 访问 Dashboard (20000)
│   dashboard-server.js ← Basic Auth（一次认证）
│   ↓
│   Dashboard HTML (iframe)
│   ↓
│   dashboard-server.js (20001-20004) ← 自动注入认证
│   ↓
│   服务 (10001-10004)
│
└── Launcher 按钮访问
    launcher 代理 (11001-11004) ← 自动注入认证
    ↓
    dashboard-server.js (20001-20004) ← 自动注入认证
    ↓
    服务 (10001-10004)
```

## 实施方案

### 1. 增强 dashboard-server.js - 添加 Basic Auth

**文件**: `configs/dashboard-server.js`

**在 `startDashboardServer()` 函数中添加 Basic Auth 验证**（第 112-138 行）：

```javascript
/**
 * Start the dashboard static file server with Basic Auth
 */
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // Check Basic Auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="WebCode Dashboard"'
      });
      res.end('Authentication required');
      return;
    }

    // Verify credentials
    const expectedAuth = BASIC_AUTH;
    if (authHeader !== expectedAuth) {
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Invalid credentials');
      return;
    }

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

**修改端口配置**（第 22-31 行）：
```javascript
// Configuration
const DASHBOARD_PORT = 20000;  // 改为外部端口

// Proxy port mapping (listen port -> target port)
const PROXY_CONFIG = [
  { listen: 20001, target: 10001, authType: 'basic' },  // Theia IDE
  { listen: 20002, target: 10002, authType: 'basic' },  // Vibe Kanban
  { listen: 20003, target: 10003, authType: 'bearer' }, // OpenClaw AI
  { listen: 20004, target: 10004, authType: 'basic' },  // noVNC
];
```

### 2. 修改 dashboard.html

**文件**: `configs/dashboard.html`

**修改 iframe URL**（第 316-319 行）：
```html
<!-- 旧代码（无法工作） -->
<iframe id="frame-desktop" class="visible" src="http://127.0.0.1:10013/vnc.html" ...></iframe>
<iframe id="frame-ide" src="http://127.0.0.1:10010" ...></iframe>
<iframe id="frame-kanban" src="http://127.0.0.1:10011" ...></iframe>
<iframe id="frame-ai" src="http://127.0.0.1:10012" ...></iframe>

<!-- 新代码（SSO 访问） -->
<iframe id="frame-desktop" class="visible" src="http://127.0.0.1:20004/vnc.html" ...></iframe>
<iframe id="frame-ide" src="http://127.0.0.1:20001" ...></iframe>
<iframe id="frame-kanban" src="http://127.0.0.1:20002" ...></iframe>
<iframe id="frame-ai" src="http://127.0.0.1:20003" ...></iframe>
```

### 3. 移除 Caddy 配置

#### 3.1 删除 Caddyfile 配置

**文件**: `configs/Caddyfile`

**完全移除或清空**：
```caddyfile
# Caddy 已弃用，所有功能由 dashboard-server.js 接管
# 此文件保留用于兼容性，但不被使用
```

#### 3.2 从 supervisord.conf 移除 caddy

**文件**: `configs/supervisord.conf`

**移除 caddy 配置引用**（第 41-42 行）：
```ini
[include]
files = /etc/supervisor/conf.d/supervisor-theia.conf \
        /etc/supervisor/conf.d/supervisor-vibe-kanban.conf \
        /etc/supervisor/conf.d/supervisor-openclaw.conf \
        /etc/supervisor/conf.d/supervisor-dashboard.conf \
        /etc/supervisor/conf.d/supervisor-cloudflared.conf \
        /etc/supervisor/conf.d/supervisor-analytics.conf \
        /etc/supervisor/conf.d/supervisor-audio.conf
```

**移除**：`/etc/supervisor/conf.d/supervisor-caddy.conf`

#### 3.3 从 supervisord-lite.conf 移除 caddy

**文件**: `configs/supervisord-lite.conf`

**同样的修改**

#### 3.4 删除 supervisor-caddy.conf

**文件**: `configs/supervisor-caddy.conf`

**删除此文件**或保留但不被引用

### 4. 更新 Dockerfile

**文件**: `Dockerfile`

**移除 Caddy 安装**（第 84-87 行）：
```dockerfile
# 移除这些行
RUN apt-get update && apt-get install -y --no-install-recommends caddy \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
```

**移除 Caddyfile 复制**（第 203-204 行）：
```dockerfile
# 移除这些行
COPY configs/Caddyfile /etc/caddy/Caddyfile
COPY configs/supervisor-caddy.conf /etc/supervisor/conf.d/supervisor-caddy.conf
```

### 5. 修改 docker-compose.yml

**文件**: `docker-compose.yml`

**端口映射保持不变**（无需修改）：
```yaml
ports:
  - "20000:20000"  # Dashboard (dashboard-server.js with Basic Auth)
  - "20001:20001"  # Theia (dashboard-server.js proxy)
  - "20002:20002"  # Vibe Kanban (dashboard-server.js proxy)
  - "20003:20003"  # OpenClaw (dashboard-server.js proxy)
  - "20004:20004"  # noVNC (dashboard-server.js proxy)
  - "20005:10005"  # TigerVNC (direct connection)
```

**原因**：
- 端口映射不变，但背后是 dashboard-server.js 在监听，不再是 Caddy

### 6. 更新 launcher 配置

**文件**: `launcher/src/app.js`

**移除 Caddy 依赖**（无需修改代码，launcher 已经使用自己的代理）

**文件**: `launcher/assets/docker-compose.yml`

**端口映射保持不变**

## 端口映射总结

| 外部端口 | 内部服务 | 处理方式 | 认证方式 |
|---------|---------|---------|---------|
| 20000 | dashboard-server.js (20000) | 直接 | Basic Auth（用户输入一次）|
| 20001 | dashboard-server.js (20001) | 直接 | 自动注入 Basic Auth |
| 20002 | dashboard-server.js (20002) | 直接 | 自动注入 Basic Auth |
| 20003 | dashboard-server.js (20003) | 直接 | 自动注入 Bearer Token |
| 20004 | dashboard-server.js (20004) | 直接 | 自动注入 Basic Auth |
| 20005 | TigerVNC (10005) | 直接 | VNC Password |

## 优势

1. **统一 SSO 架构**：所有认证由 dashboard-server.js 处理
2. **简化架构**：移除 Caddy，减少依赖
3. **减少代理层级**：用户 → dashboard-server.js → 服务（只有一层）
4. **更好的性能**：减少一个代理跳转
5. **易于维护**：所有认证逻辑集中在一个服务
6. **减小镜像体积**：移除 Caddy 减小镜像大小

## 验证步骤

1. **重新构建镜像**：
   ```bash
   docker build -t land007/webcode:latest .
   ```

2. **重启容器**：
   ```bash
   docker compose down && docker compose up -d
   ```

3. **检查进程状态**：
   ```bash
   docker exec webcode supervisorctl status
   ```
   应该看到：
   - dashboard: RUNNING
   - caddy: 不应该存在
   - theia: RUNNING
   - vibe-kanban: RUNNING
   - openclaw: RUNNING
   - novnc: RUNNING

4. **检查端口监听**：
   ```bash
   docker exec webcode netstat -tlnp | grep -E "20000|20001|20002|20003|20004"
   ```
   应该看到 dashboard-server.js（node）监听这些端口

5. **测试 Dashboard SSO**：
   - 访问 http://localhost:20000
   - 浏览器应该弹出 Basic Auth 认证框
   - 输入 admin/changeme
   - Dashboard 页面应该加载
   - 测试 4 个标签页：
     - Desktop: 应该显示 noVNC（无需再次认证）
     - IDE: 应该显示 Theia（无需再次认证）
     - Kanban: 应该显示 Vibe Kanban（无需再次认证）
     - AI: 应该显示 OpenClaw（无需再次认证）

6. **测试 Launcher SSO**：
   - 打开 launcher
   - 点击各服务按钮
   - 应该直接打开服务（无需认证）

## 关键文件清单

### 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `configs/dashboard-server.js` | 1. 修改 DASHBOARD_PORT 为 20000<br>2. 修改 PROXY_CONFIG 端口为 20001-20004<br>3. 在 startDashboardServer() 添加 Basic Auth 验证 |
| `configs/dashboard.html` | 修改 iframe URL 为 20001-20004 |
| `configs/supervisord.conf` | 移除 supervisor-caddy.conf 引用 |
| `configs/supervisord-lite.conf` | 移除 supervisor-caddy.conf 引用 |
| `Dockerfile` | 1. 移除 Caddy 安装<br>2. 移除 Caddyfile 和 supervisor-caddy.conf 复制 |

### 可以删除的文件

| 文件 | 操作 |
|------|------|
| `configs/Caddyfile` | 删除或保留用于参考 |
| `configs/supervisor-caddy.conf` | 删除 |

### 无需修改的文件

| 文件 | 原因 |
|------|------|
| `docker-compose.yml` | 端口映射保持不变 |
| `launcher/assets/docker-compose.yml` | 端口映射保持不变 |
| `launcher/src/ports.js` | 端口配置已正确 |
| `launcher/src/app.js` | 已有 SSO 代理实现 |

## 风险评估

1. **低风险**：
   - dashboard-server.js 已经有代理实现，只是增强认证功能
   - Launcher 已经有 SSO 代理，不受影响

2. **需要注意**：
   - 确保 Basic Auth 实现正确（用户名:密码 base64 编码）
   - 确保 dashboard-server.js 在 supervisord 中正确启动
   - 测试所有服务的 WebSocket 连接（Theia, noVNC）

3. **回滚方案**：
   - 如果有问题，可以恢复 Caddyfile 和 supervisor-caddy.conf
   - 重新构建镜像即可
