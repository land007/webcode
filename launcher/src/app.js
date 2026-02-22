'use strict';

const { spawn } = require('child_process');
const http = require('http');
const httpProxy = require('http-proxy');
const {
  configExists, readConfig, writeConfig,
  getWorkDir, ensureComposeFile
} = require('./config.js');
const {
  checkPorts, autoFixPorts, getPortsFromConfig,
  updateComposePorts, getPortSummary
} = require('./ports.js');

// ─── Proxy servers ───────────────────────────────────────────────────────────

const proxyServers = [];

// authHeader: full Authorization header value, e.g. 'Basic <b64>' or 'Bearer <token>'
function startProxy(listenPort, targetPort, authHeader) {
  const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('Authorization', authHeader);
  });

  proxy.on('proxyRes', (proxyRes) => {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['x-content-type-options'];
  });

  proxy.on('error', (err, req, res) => {
    console.error(`Proxy error on port ${listenPort}:`, err.message);
    if (res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Service unavailable — container may still be starting.');
    }
  });

  proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
    console.log(`Proxying WebSocket on port ${listenPort}: ${req.url}`);
    proxyReq.setHeader('Authorization', authHeader);
    // Rewrite Origin to match the target so servers that validate Origin (e.g. Vibe Kanban) accept the connection.
    // changeOrigin:true only rewrites Host, not Origin.
    proxyReq.setHeader('Origin', `http://localhost:${targetPort}`);
  });

  const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: `http://localhost:${targetPort}` });
  });

  server.on('upgrade', (req, socket, head) => {
    console.log(`WebSocket upgrade on port ${listenPort}: ${req.url}`);
    proxy.ws(req, socket, head, { target: `http://localhost:${targetPort}` });
  });

  server.listen(listenPort, '127.0.0.1', () => {
    console.log(`Proxy :${listenPort} → :${targetPort} started`);
  });

  proxyServers.push(server);
  return server;
}

function stopProxies() {
  for (const s of proxyServers) {
    s.close();
  }
  proxyServers.length = 0;
}

function startProxies(cfg) {
  stopProxies();
  const basicAuth = 'Basic ' + Buffer.from(`${cfg.AUTH_USER}:${cfg.AUTH_PASSWORD}`).toString('base64');
  const ports = getPortsFromConfig(cfg);
  startProxy(11001, ports.theia, basicAuth);                        // Theia
  startProxy(11002, ports.kanban, basicAuth);                       // Vibe Kanban
  startProxy(11003, ports.openclaw, 'Bearer ' + cfg.OPENCLAW_TOKEN); // OpenClaw (own token auth, no Caddy basicauth)
  startProxy(11004, ports.novnc, basicAuth);                        // noVNC
}

// ─── Docker helpers ──────────────────────────────────────────────────────────

function buildEnv(cfg) {
  return Object.assign({}, process.env, {
    MODE: cfg.MODE || 'desktop',
    AUTH_USER: cfg.AUTH_USER,
    AUTH_PASSWORD: cfg.AUTH_PASSWORD,
    OPENCLAW_TOKEN: cfg.OPENCLAW_TOKEN,
    VNC_PASSWORD: cfg.VNC_PASSWORD,
    VNC_RESOLUTION: cfg.VNC_RESOLUTION || '1920x1080',
    CF_TUNNEL_TOKEN: cfg.CF_TUNNEL_TOKEN || '',
    GIT_USER_NAME: cfg.GIT_USER_NAME || '',
    GIT_USER_EMAIL: cfg.GIT_USER_EMAIL || '',
    DNA_REPO_URL: cfg.DNA_REPO_URL || 'https://github.com/land007/webcode'
  });
}

function dockerSpawn(args, cfg, onData, onClose) {
  const proc = spawn('docker', args, {
    cwd: getWorkDir(),
    env: buildEnv(cfg)
  });
  proc.stdout.on('data', (d) => onData && onData(d.toString()));
  proc.stderr.on('data', (d) => onData && onData(d.toString()));
  proc.on('close', (code) => onClose && onClose(code));
  return proc;
}

async function dockerUp(cfg, onData, onClose) {
  ensureComposeFile();

  // 检查端口冲突并自动修复
  const ports = getPortsFromConfig(cfg);
  const checkResults = await checkPorts(ports);

  const hasConflicts = Object.values(checkResults).some(r => !r.available);

  if (hasConflicts) {
    onData && onData('检测到端口冲突，正在自动修复...\n');

    const fixedPorts = await autoFixPorts(ports);

    // 更新配置
    cfg.PORT_THEIA = fixedPorts.theia;
    cfg.PORT_KANBAN = fixedPorts.kanban;
    cfg.PORT_OPENCLAW = fixedPorts.openclaw;
    cfg.PORT_NOVNC = fixedPorts.novnc;
    cfg.PORT_VNC = fixedPorts.vnc;

    // 更新 docker-compose.yml
    updateComposePorts(getWorkDir(), fixedPorts);

    // 保存配置
    writeConfig(cfg);

    onData && onData('端口已自动调整：\n');
    for (const [key, result] of Object.entries(checkResults)) {
      if (!result.available) {
        onData && onData(`  ${result.name}: ${result.port} → ${fixedPorts[key]}\n`);
      }
    }
    onData && onData('\n');
  }

  return dockerSpawn(['compose', 'up', '-d'], cfg, onData, onClose);
}

function dockerDown(cfg, onData, onClose) {
  return dockerSpawn(['compose', 'down'], cfg, onData, onClose);
}

function dockerLogs(cfg, onData) {
  return dockerSpawn(['compose', 'logs', '-f', '--tail=200'], cfg, onData);
}

function dockerPs(cfg, callback) {
  const proc = spawn('docker', ['compose', 'ps', '--format', 'json'], {
    cwd: getWorkDir(),
    env: buildEnv(cfg)
  });
  let out = '';
  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.on('close', () => {
    try {
      // docker compose ps --format json outputs one JSON object per line
      const lines = out.trim().split('\n').filter(Boolean);
      const containers = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      callback(null, containers);
    } catch (e) {
      callback(e, []);
    }
  });
}

// Check docker is installed and running
function checkDocker(callback) {
  const result = { installed: false, running: false, version: '' };
  const ver = spawn('docker', ['--version']);
  let verOut = '';
  ver.stdout.on('data', d => { verOut += d.toString(); });
  ver.on('close', (code) => {
    if (code !== 0) { callback(result); return; }
    result.installed = true;
    result.version = verOut.trim();
    const info = spawn('docker', ['info']);
    info.on('close', (c) => {
      result.running = (c === 0);
      callback(result);
    });
    // kill after 5s to avoid hanging
    setTimeout(() => info.kill(), 5000);
  });
  setTimeout(() => ver.kill(), 5000);
}

// ─── Status polling ───────────────────────────────────────────────────────────

let pollTimer = null;

function startPolling(cfg, onStatus) {
  stopPolling();
  function poll() {
    dockerPs(cfg, (err, containers) => {
      onStatus(err ? [] : containers);
    });
  }
  poll();
  pollTimer = setInterval(poll, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  startProxies,
  stopProxies,
  dockerUp,
  dockerDown,
  dockerLogs,
  dockerPs,
  checkDocker,
  startPolling,
  stopPolling,
  readConfig,
  writeConfig,
  configExists,
  checkPorts,
  autoFixPorts,
  getPortsFromConfig,
  getPortSummary
};
