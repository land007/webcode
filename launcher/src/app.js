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

/** macOS GUI apps get a minimal PATH; prepend all common Docker locations. */
function buildDockerPath() {
  const extra = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/Applications/Docker.app/Contents/Resources/bin',
  ];
  const current = process.env.PATH || '';
  const parts = current ? current.split(':') : [];
  // prepend extras that aren't already present
  const merged = [...extra.filter(p => !parts.includes(p)), ...parts];
  return merged.join(':');
}

function buildEnv(cfg) {
  return Object.assign({}, process.env, {
    PATH: buildDockerPath(),
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
  // 始终用最新模板覆盖 docker-compose.yml
  ensureComposeFile();

  // 检查端口冲突并自动修复
  let ports = getPortsFromConfig(cfg);
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
    ports = fixedPorts;

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

  // 无论是否有冲突，始终将当前端口配置写入 docker-compose.yml
  updateComposePorts(getWorkDir(), ports);

  // 注入自定义目录挂载
  if (cfg.CUSTOM_VOLUMES && cfg.CUSTOM_VOLUMES.length > 0) {
    updateComposeVolumes(getWorkDir(), cfg.CUSTOM_VOLUMES);
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
  const env = Object.assign({}, process.env, { PATH: buildDockerPath() });
  const ver = spawn('docker', ['--version'], { env });
  let verOut = '';
  ver.stdout.on('data', d => { verOut += d.toString(); });
  ver.on('close', (code) => {
    if (code !== 0) { callback(result); return; }
    result.installed = true;
    result.version = verOut.trim();
    const info = spawn('docker', ['info'], { env });
    info.on('close', (c) => {
      result.running = (c === 0);
      callback(result);
    });
    // kill after 5s to avoid hanging
    setTimeout(() => info.kill(), 5000);
  });
  setTimeout(() => ver.kill(), 5000);
}

// ─── Custom volume injection ─────────────────────────────────────────────────

/**
 * Inject custom bind-mount volumes into docker-compose.yml.
 * Called after ensureComposeFile() so the file is always fresh from template.
 * @param {string} workDir
 * @param {Array<{host:string, container:string}>} customVolumes
 */
function updateComposeVolumes(workDir, customVolumes) {
  const fs = require('fs');
  const path = require('path');
  const composePath = path.join(workDir, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;

  const validVolumes = customVolumes.filter(v => v.host && v.container);
  if (validVolumes.length === 0) return;

  let content = fs.readFileSync(composePath, 'utf8');
  // Insert custom volume lines just before "    environment:" in the service block
  const mountLines = validVolumes
    .map(v => `      - ${v.host}:${v.container}`)
    .join('\n');
  content = content.replace('    environment:', mountLines + '\n    environment:');
  // Append new named volume declarations (host without '/' = named volume)
  const namedVols = validVolumes
    .filter(v => !v.host.includes('/'))
    .map(v => v.host);
  namedVols.forEach(vol => {
    if (!content.includes(`\n  ${vol}:`)) {
      content = content.trimEnd() + `\n  ${vol}:\n`;
    }
  });
  fs.writeFileSync(composePath, content, 'utf8');
}

// ─── Supervisor status ────────────────────────────────────────────────────────

const SUPERVISOR_VALID_STATES = new Set(['RUNNING', 'STOPPED', 'STARTING', 'FATAL', 'EXITED', 'UNKNOWN', 'BACKOFF']);

function parseSupervisorOutput(out) {
  const services = [];
  const lines = out.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    // Format: "name   RUNNING   pid 123, uptime 0:01:02"
    const match = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
    // Only accept lines where the second token is a known supervisor state
    if (match && SUPERVISOR_VALID_STATES.has(match[2].toUpperCase())) {
      services.push({ name: match[1], state: match[2].toUpperCase(), detail: match[3] || '' });
    }
  }
  return services;
}

/**
 * Update Theia's color theme by writing to ~/.theia/settings.json inside the container.
 * @param {Object} cfg
 * @param {string} themeName  e.g. 'Dark (Theia)' or 'Light (Theia)'
 * @param {Function} [callback]  (exitCode)
 */
function setTheiaTheme(cfg, themeName, callback) {
  const script =
    "const fs=require('fs'),f='/home/ubuntu/.theia/settings.json';" +
    "let s={};try{s=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}" +
    "s['workbench.colorTheme']=" + JSON.stringify(themeName) + ";" +
    "fs.mkdirSync('/home/ubuntu/.theia',{recursive:true});" +
    "fs.writeFileSync(f,JSON.stringify(s,null,2));";
  const proc = spawn('docker', ['exec', '-u', 'ubuntu', 'webcode', 'node', '-e', script], {
    env: buildEnv(cfg)
  });
  proc.on('close', (code) => { if (callback) callback(code); });
}

/**
 * Run supervisorctl status inside the webcode container.
 * @param {Object} cfg
 * @param {Function} callback  (err, [{name, state, detail}])
 */
function supervisorStatus(cfg, callback) {
  const proc = spawn('docker', ['exec', 'webcode', 'supervisorctl', 'status', 'all'], {
    env: buildEnv(cfg)
  });
  let out = '';
  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', d => { out += d.toString(); });
  proc.on('close', () => {
    callback(null, parseSupervisorOutput(out));
  });
}

/**
 * Restart the specified supervisor-managed process.
 * @param {Object} cfg
 * @param {string} processName  Process name, e.g. 'theia', 'vibe-kanban', 'openclaw'
 * @param {Function} callback  (exitCode)
 */
function supervisorRestart(cfg, processName, callback) {
  const proc = spawn('docker', ['exec', 'webcode', 'supervisorctl', 'restart', processName], {
    env: buildEnv(cfg)
  });
  proc.on('close', (code) => { if (callback) callback(code); });
}

/**
 * Get logs for a specific supervisor-managed process.
 * Uses 'tail -1000' to get more lines, and formats output to distinguish stderr.
 * @param {Object} cfg
 * @param {string} processName  Process name
 * @param {Function} callback  (formatted log string with error markers)
 */
function supervisorProcessLog(cfg, processName, callback) {
  // Get more log lines (1000 instead of 100)
  const proc = spawn('docker', ['exec', 'webcode', 'supervisorctl', 'tail', '-1000', processName], {
    env: buildEnv(cfg)
  });
  let out = '';
  proc.stdout.on('data', d => { out += d.toString(); });
  proc.stderr.on('data', d => { out += d.toString(); });
  proc.on('close', () => {
    if (callback) {
      // Format the output: add [ERROR] prefix for lines that appear to be errors
      const lines = out.split('\n');
      const formatted = lines.map(line => {
        if (!line.trim()) return line;
        // Detect error patterns
        const isError = /[Ee]rror|[Ee]xception|[Ff]ail|[Ww]arn|Traceback|at\s+<|undefined|TypeError|ReferenceError|SyntaxError/.test(line);
        return isError ? `[ERROR] ${line}` : line;
      }).join('\n');
      callback(formatted);
    }
  });
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
  supervisorStatus,
  supervisorRestart,
  supervisorProcessLog,
  readConfig,
  writeConfig,
  configExists,
  checkPorts,
  autoFixPorts,
  getPortsFromConfig,
  getPortSummary
};
