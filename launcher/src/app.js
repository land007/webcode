'use strict';

const { spawn } = require('child_process');
const http = require('http');
const httpProxy = require('http-proxy');
const {
  configExists, readConfig, writeConfig,
  getWorkDir, ensureComposeFile
} = require('./config.js');

// ─── Proxy servers ───────────────────────────────────────────────────────────

const proxyServers = [];

function startProxy(listenPort, targetPort, authBase64) {
  const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('Authorization', 'Basic ' + authBase64);
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
    // Add Authorization header to WebSocket connections
    proxyReq.setHeader('Authorization', 'Basic ' + authBase64);
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
  const auth = Buffer.from(`${cfg.AUTH_USER}:${cfg.AUTH_PASSWORD}`).toString('base64');
  startProxy(14001, 23000, auth);   // Theia
  startProxy(14002, 25173, auth);   // Vibe Kanban
  startProxy(14003, 28789, auth);   // OpenClaw
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
    GIT_USER_EMAIL: cfg.GIT_USER_EMAIL || ''
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

function dockerUp(cfg, onData, onClose) {
  ensureComposeFile();
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
  configExists
};
