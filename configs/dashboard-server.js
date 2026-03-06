#!/usr/bin/env node
'use strict';

/**
 * Dashboard Server
 *
 * A Node.js server that:
 * 1. Serves the dashboard.html static page on port 20000 with Basic Auth
 * 2. Creates proxy servers on ports 20001-20004 that:
 *    - Forward requests to actual services
 *    - Inject authentication headers automatically
 *    - Remove security headers to allow iframe embedding
 *    - Support WebSocket connections
 * 3. Provides /api/config (GET/POST) for runtime configuration management
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const httpProxy = require('http-proxy');
const crypto = require('crypto');

function checkPort(port) {
  return new Promise(resolve => {
    const s = net.createConnection(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(200, () => { s.destroy(); resolve(false); });
  });
}

// Session store: sessionId → { user, expires }
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

function createSession(user) {
  const id = crypto.randomUUID();
  sessions.set(id, { user, expires: Date.now() + SESSION_TTL });
  // Cleanup expired sessions periodically
  if (sessions.size % 100 === 0) {
    const now = Date.now();
    for (const [k, v] of sessions) {
      if (v.expires < now) sessions.delete(k);
    }
  }
  return id;
}

function getSessionUser(cookieHeader) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)webcode_session=([^;]+)/);
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s || s.expires < Date.now()) { sessions.delete(m[1]); return null; }
  return s.user;
}

// ── Supervisor helpers ────────────────────────────────────────────────────────
const SUPERVISOR_VALID_STATES = new Set(['RUNNING','STOPPED','STARTING','FATAL','EXITED','UNKNOWN','BACKOFF']);

function parseSupervisorOutput(out) {
  const services = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
    if (m && SUPERVISOR_VALID_STATES.has(m[2].toUpperCase())) {
      services.push({ name: m[1], state: m[2].toUpperCase(), detail: m[3] || '' });
    }
  }
  return services;
}

// ── Runtime configuration ─────────────────────────────────────────────────────
const CONFIG_FILE = '/home/ubuntu/.webcode/config.json';

function loadConfig() {
  let fileCfg = {};
  try { fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch(e) {}
  return {
    AUTH_USER:       fileCfg.AUTH_USER       || process.env.AUTH_USER       || 'admin',
    AUTH_PASSWORD:   fileCfg.AUTH_PASSWORD   || process.env.AUTH_PASSWORD   || 'changeme',
    VNC_PASSWORD:    fileCfg.VNC_PASSWORD    || process.env.VNC_PASSWORD    || 'changeme',
    OPENCLAW_TOKEN:  fileCfg.OPENCLAW_TOKEN  || process.env.OPENCLAW_TOKEN  || 'changeme',
    GIT_USER_NAME:   fileCfg.GIT_USER_NAME   || process.env.GIT_USER_NAME   || '',
    GIT_USER_EMAIL:  fileCfg.GIT_USER_EMAIL  || process.env.GIT_USER_EMAIL  || '',
    CF_TUNNEL_TOKEN: fileCfg.CF_TUNNEL_TOKEN || process.env.CF_TUNNEL_TOKEN || '',
    ENABLE_KANBAN:   fileCfg.ENABLE_KANBAN   || process.env.ENABLE_KANBAN   || 'true',
    ENABLE_OPENCLAW: fileCfg.ENABLE_OPENCLAW || process.env.ENABLE_OPENCLAW || 'true',
  };
}

let runtimeConfig = loadConfig();

function getBasicAuth() {
  return 'Basic ' + Buffer.from(`${runtimeConfig.AUTH_USER}:${runtimeConfig.AUTH_PASSWORD}`).toString('base64');
}

function getBearerAuth() {
  return 'Bearer ' + runtimeConfig.OPENCLAW_TOKEN;
}

// Configuration
const DASHBOARD_PORT = 20000;  // External port with Basic Auth (internal port, always 20000)
const DASHBOARD_HTML = '/opt/dashboard.html';

// Proxy port mapping (listen port -> target port)
// For path-based routing, use 'routes' array instead of 'target'
const PROXY_CONFIG = [
  { listen: 20001, target: 10001, authType: 'basic' },  // code-server IDE
  { listen: 20002, target: 10002, authType: 'basic' },  // Vibe Kanban
  { listen: 20003, target: 10003, authType: 'bearer' }, // OpenClaw AI
  {
    listen: 20004,
    authType: 'basic',
    routes: [
      { path: '/audio', target: 10006 },      // Audio WebSocket
      { path: '/websockify', target: 10004 }, // noVNC websockify
      { path: '*', target: 10004 },           // Default: noVNC
    ]
  },
];

// Returns true if request passes auth (session cookie, Basic Auth, or Bearer token)
function isAuthorized(req) {
  if (getSessionUser(req.headers.cookie)) return true;
  const h = req.headers.authorization || '';
  return h === getBasicAuth() || h === `Bearer ${runtimeConfig.AUTH_PASSWORD}`;
}

// Track proxy servers for graceful shutdown
const proxyServers = [];
const httpServers = [];

/**
 * Create a proxy server for a specific service
 * @param {number} listenPort - Port to listen on
 * @param {number} targetPort - Port to forward to (for simple proxy)
 * @param {string} authType - 'basic' or 'bearer'
 * @param {Array} routes - Optional path-based routes [{path, target}]
 */
function startProxy(listenPort, targetPort, authType, routes) {
  // Create multiple proxy servers for different targets if routes exist
  const proxyMap = new Map();

  const getProxy = (port) => {
    if (!proxyMap.has(port)) {
      const proxy = httpProxy.createProxyServer({
        ws: true,
        changeOrigin: true
      });

      // Inject Authorization header on proxy request (dynamic, reads runtimeConfig)
      proxy.on('proxyReq', (proxyReq) => {
        const authHeader = authType === 'bearer' ? getBearerAuth() : getBasicAuth();
        proxyReq.setHeader('Authorization', authHeader);
      });

      // Remove security headers to allow iframe embedding
      proxy.on('proxyRes', (proxyRes) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-content-type-options'];
      });

      // Handle proxy errors (res may be Socket for WS errors, not HTTP response)
      proxy.on('error', (err, req, res) => {
        console.error(`Proxy error on port ${listenPort} → :${port}:`, err.message);
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Service unavailable — container may still be starting.');
        } else if (res && typeof res.end === 'function') {
          res.end();
        }
      });

      // Handle WebSocket upgrade
      proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
        console.log(`Proxying WebSocket on port ${listenPort} → :${port}: ${req.url}`);
        const authHeader = authType === 'bearer' ? getBearerAuth() : getBasicAuth();
        proxyReq.setHeader('Authorization', authHeader);
        // Rewrite Origin to match the target so servers that validate Origin accept the connection
        proxyReq.setHeader('Origin', `http://localhost:${port}`);
      });

      proxyMap.set(port, proxy);
      proxyServers.push(proxy);
    }
    return proxyMap.get(port);
  };

  /**
   * Find target port based on request path
   */
  const getTargetPort = (url) => {
    if (!routes) return targetPort;

    // Sort routes by path specificity (longer paths first)
    const sortedRoutes = [...routes].sort((a, b) => b.path.length - a.path.length);

    for (const route of sortedRoutes) {
      if (route.path === '*') return route.target;
      if (url === route.path || url.startsWith(route.path + '/') || url.startsWith(route.path + '?')) {
        return route.target;
      }
    }
    return targetPort;
  };

  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (!isAuthorized(req)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="WebCode Dashboard"',
        'Content-Length': '12'
      });
      return res.end('Unauthorized');
    }
    const targetPort = getTargetPort(req.url);
    const proxy = getProxy(targetPort);
    proxy.web(req, res, { target: `http://localhost:${targetPort}` });
  });

  // Handle WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    if (!isAuthorized(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="WebCode Dashboard"\r\n\r\n');
      return socket.destroy();
    }
    const targetPort = getTargetPort(req.url);
    const proxy = getProxy(targetPort);
    console.log(`WebSocket upgrade on port ${listenPort} → :${targetPort}: ${req.url}`);
    proxy.ws(req, socket, head, { target: `http://localhost:${targetPort}` });
  });

  // Start listening
  server.listen(listenPort, '0.0.0.0', () => {
    if (routes) {
      const routeDesc = routes.map(r => `${r.path}→${r.target}`).join(', ');
      console.log(`Proxy :${listenPort} → [${routeDesc}] started`);
    } else {
      console.log(`Proxy :${listenPort} → :${targetPort} started`);
    }
  });

  httpServers.push(server);

  return server;
}

/**
 * Start the dashboard static file server with Basic Auth
 */
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // /api/ping — no auth required, just confirms server is alive
    if (req.url === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Check auth: accept session cookie, Basic Auth, or Bearer AUTH_PASSWORD
    const cookieUser = getSessionUser(req.headers.cookie);
    const authHeader = req.headers.authorization;
    let authed = false;
    let authedViaCredentials = false;
    if (cookieUser) {
      authed = true;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      authed = (authHeader.slice(7) === runtimeConfig.AUTH_PASSWORD);
      authedViaCredentials = authed;
    } else if (authHeader && authHeader.startsWith('Basic ')) {
      authed = (authHeader === getBasicAuth());
      authedViaCredentials = authed;
    }
    if (!authed) {
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="WebCode Dashboard"'
      });
      res.end('Authentication required');
      return;
    }
    // On successful credential login (not cookie), issue a session cookie for SSO
    if (authedViaCredentials) {
      const sessionId = createSession(runtimeConfig.AUTH_USER);
      res.setHeader('Set-Cookie',
        `webcode_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`
      );
    }

    // API: GET /api/config — return current config (passwords masked)
    if (req.method === 'GET' && req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        AUTH_USER:       runtimeConfig.AUTH_USER,
        AUTH_PASSWORD:   '••••',
        VNC_PASSWORD:    '••••',
        OPENCLAW_TOKEN:  '••••',
        GIT_USER_NAME:   runtimeConfig.GIT_USER_NAME,
        GIT_USER_EMAIL:  runtimeConfig.GIT_USER_EMAIL,
        CF_TUNNEL_TOKEN: runtimeConfig.CF_TUNNEL_TOKEN ? '••••' : '',
        ENABLE_KANBAN:   runtimeConfig.ENABLE_KANBAN,
        ENABLE_OPENCLAW: runtimeConfig.ENABLE_OPENCLAW,
        MODE:            process.env.MODE || 'desktop',
      }));
      return;
    }

    // API: POST /api/config — update config, persist to disk, apply side-effects
    if (req.method === 'POST' && req.url === '/api/config') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const patch = JSON.parse(body);

          // Read existing persisted config
          let fileCfg = {};
          try { fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch(e) {}

          // Merge non-empty fields only (empty string = leave unchanged)
          const FIELDS = ['AUTH_USER','AUTH_PASSWORD','VNC_PASSWORD','OPENCLAW_TOKEN',
                          'GIT_USER_NAME','GIT_USER_EMAIL','CF_TUNNEL_TOKEN','ENABLE_KANBAN','ENABLE_OPENCLAW'];
          for (const key of FIELDS) {
            if (patch[key] !== undefined && patch[key] !== '') {
              fileCfg[key] = patch[key];
            }
          }

          // Persist to disk
          fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(fileCfg, null, 2));

          // Detect changes for side-effects
          const prevConfig = { ...runtimeConfig };

          // Hot-reload runtimeConfig in memory
          runtimeConfig = loadConfig();

          // Side-effects
          if (patch.ENABLE_KANBAN !== undefined && patch.ENABLE_KANBAN !== '') {
            const action = patch.ENABLE_KANBAN === 'true' ? 'start' : 'stop';
            exec(`supervisorctl ${action} vibe-kanban`, (err) => {
              if (err) console.error(`[config] supervisorctl ${action} vibe-kanban:`, err.message);
            });
          }
          if (patch.ENABLE_OPENCLAW !== undefined && patch.ENABLE_OPENCLAW !== '') {
            const action = patch.ENABLE_OPENCLAW === 'true' ? 'start' : 'stop';
            exec(`supervisorctl ${action} openclaw`, (err) => {
              if (err) console.error(`[config] supervisorctl ${action} openclaw:`, err.message);
            });
          }
          if (patch.OPENCLAW_TOKEN && patch.OPENCLAW_TOKEN !== prevConfig.OPENCLAW_TOKEN) {
            exec('supervisorctl restart openclaw', (err) => {
              if (err) console.error('[config] supervisorctl restart openclaw:', err.message);
            });
          }
          if (patch.GIT_USER_NAME && patch.GIT_USER_NAME !== prevConfig.GIT_USER_NAME) {
            exec(`sudo -u ubuntu git config --global user.name ${JSON.stringify(patch.GIT_USER_NAME)}`, (err) => {
              if (err) console.error('[config] git config user.name:', err.message);
            });
          }
          if (patch.GIT_USER_EMAIL && patch.GIT_USER_EMAIL !== prevConfig.GIT_USER_EMAIL) {
            exec(`sudo -u ubuntu git config --global user.email ${JSON.stringify(patch.GIT_USER_EMAIL)}`, (err) => {
              if (err) console.error('[config] git config user.email:', err.message);
            });
          }
          if (patch.CF_TUNNEL_TOKEN && patch.CF_TUNNEL_TOKEN !== prevConfig.CF_TUNNEL_TOKEN) {
            exec('supervisorctl restart cloudflared', (err) => {
              if (err) console.error('[config] supervisorctl restart cloudflared:', err.message);
            });
          }

          console.log('[config] Runtime config updated and persisted');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // API: GET /api/iframe-urls — return iframe URLs with real passwords (for frontend)
    if (req.method === 'GET' && req.url === '/api/iframe-urls') {
      // We can't know the external hostname from here; return path-relative tokens
      // The frontend will construct full URLs using location.hostname and location.port
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        vncPassword:    runtimeConfig.VNC_PASSWORD,
        openclawToken:  runtimeConfig.OPENCLAW_TOKEN,
      }));
      return;
    }

    // API: GET /api/logs/:name — supervisor process logs (stdout + stderr)
    const logsMatch = req.method === 'GET' && req.url.match(/^\/api\/logs\/([a-zA-Z0-9_-]+)$/);
    if (logsMatch) {
      const processName = logsMatch[1];

      // Fetch both stdout and stderr in parallel
      exec(`supervisorctl tail ${processName} stdout`, (err1, stdout) => {
        exec(`supervisorctl tail ${processName} stderr`, (err2, stderr) => {
          const parts = [];
          if (stdout && stdout.trim()) parts.push(stdout.trim());
          if (stderr && stderr.trim()) parts.push('=== stderr ===\n' + stderr.trim());

          let output = parts.length > 0 ? parts.join('\n\n') : '(no output)';

          // Format: add [ERROR] prefix to lines containing error keywords
          const errorPattern = /[Ee]rror|[Ee]xception|[Ff]ail|[Ww]arn|Traceback|at\s+<|undefined|TypeError|ReferenceError|SyntaxError/;
          output = output.split('\n').map(line => {
            if (!line.trim()) return line;
            if (errorPattern.test(line)) return `[ERROR] ${line}`;
            return line;
          }).join('\n');

          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(output);
        });
      });
      return;
    }

    // API: POST /api/ide/locale — write argv.json to set code-server display language
    if (req.method === 'POST' && req.url === '/api/ide/locale') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { locale } = JSON.parse(body);
          if (!locale) throw new Error('locale field required');
          const argvPath = '/home/ubuntu/.code-server/User/argv.json';
          fs.mkdirSync(path.dirname(argvPath), { recursive: true });
          let argv = {};
          try { argv = JSON.parse(fs.readFileSync(argvPath, 'utf8')); } catch (e) {}
          argv.locale = locale.toLowerCase();
          fs.writeFileSync(argvPath, JSON.stringify(argv, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // API: POST /api/ide/settings — merge JSON into code-server user settings.json
    if (req.method === 'POST' && req.url === '/api/ide/settings') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const patch = JSON.parse(body);
          const settingsPath = '/home/ubuntu/.code-server/User/settings.json';
          fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
          let settings = {};
          try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
          Object.assign(settings, patch);
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // API: GET /api/status — supervisor process list
    if (req.method === 'GET' && req.url === '/api/status') {
      exec('supervisorctl status all', (_err, stdout) => {
        const services = parseSupervisorOutput(stdout);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(services));
      });
      return;
    }

    // API: POST /api/restart/:name — restart a supervisor process
    const restartMatch = req.method === 'POST' && req.url.match(/^\/api\/restart\/([a-zA-Z0-9_-]+)$/);
    if (restartMatch) {
      const processName = restartMatch[1];
      console.log(`[restart] request for: ${processName}`);
      exec(`supervisorctl restart ${processName}`, (err, stdout) => {
        console.log(`[restart] ${processName}: err=${err ? err.message : 'none'} stdout=${stdout.trim()}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: !err }));
      });
      return;
    }

    // Serve favicon.ico
    if (req.url === '/favicon.ico') {
      fs.readFile(path.join(path.dirname(DASHBOARD_HTML), 'favicon.ico'), (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/x-icon' });
        res.end(data);
      });
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
        // 直接从配置读取是否启用，而不是检测端口
        const kanbanEnabled = runtimeConfig.ENABLE_KANBAN !== 'false';
        const openclawEnabled = runtimeConfig.ENABLE_OPENCLAW !== 'false';
        const html = data
          .replace('__MODE__', process.env.MODE || 'desktop')
          .replace('__ENABLE_KANBAN__', kanbanEnabled ? 'true' : 'false')
          .replace('__ENABLE_OPENCLAW__', openclawEnabled ? 'true' : 'false');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
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

/**
 * Start all services
 */
function start() {
  console.log('Starting Dashboard Server...');

  // Start dashboard static server
  startDashboardServer();

  // Start all proxy servers
  PROXY_CONFIG.forEach(config => {
    startProxy(config.listen, config.target, config.authType, config.routes);
  });

  console.log('Dashboard Server fully started');
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('Shutting down Dashboard Server...');

  // Close all HTTP servers
  httpServers.forEach(server => {
    server.close(() => {
      console.log('HTTP server closed');
    });
  });

  // Close all proxy servers
  proxyServers.forEach(proxy => {
    proxy.close();
  });

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
start();
