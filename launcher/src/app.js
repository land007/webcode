'use strict';

const { spawn } = require('child_process');
const http = require('http');
const httpProxy = require('http-proxy');
const {
  configExists, readConfig, writeConfig,
  getWorkDir, ensureComposeFile,
  ensureInstanceComposeFile, writeInstanceConfig
} = require('./config.js');
const {
  checkPorts, autoFixPorts, getPortsFromConfig,
  updateComposePorts, updateComposeCustomPorts,
  getPortSummary
} = require('./ports.js');
const {
  checkForUpdates, updateContainer,
  getLocalImageId, getRemoteImageId,
  getLocalContainerDigest, getRemoteContainerDigest
} = require('./update.js');

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
    // res may not exist or may not be a valid HTTP response object (e.g., for WebSocket errors)
    if (res && typeof res.writeHead === 'function' && typeof res.end === 'function' && !res.headersSent) {
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

// Calculate proxy port from container port (proxy = container - 9000)
function getProxyPort(containerPort) {
  return containerPort - 9000;
}

function startProxies(cfg) {
  stopProxies();
  const basicAuth = 'Basic ' + Buffer.from(`${cfg.AUTH_USER}:${cfg.AUTH_PASSWORD}`).toString('base64');
  const ports = getPortsFromConfig(cfg);

  startProxy(getProxyPort(ports.theia), ports.theia, basicAuth);       // Theia
  startProxy(getProxyPort(ports.kanban), ports.kanban, basicAuth);     // Vibe Kanban
  startProxy(getProxyPort(ports.openclaw), ports.openclaw, 'Bearer ' + cfg.OPENCLAW_TOKEN); // OpenClaw
  startProxy(getProxyPort(ports.novnc), ports.novnc, basicAuth);       // noVNC
  startProxy(getProxyPort(ports.dashboard), ports.dashboard, basicAuth); // Dashboard
}

// ─── Docker helpers ──────────────────────────────────────────────────────────

/** macOS GUI apps get a minimal PATH; prepend all common Docker locations. */
function buildDockerPath() {
  const extra = [
    '/usr/local/bin',                          // Intel Mac Homebrew / Docker Desktop default
    '/opt/homebrew/bin',                       // Apple Silicon Mac Homebrew
    '/opt/homebrew/sbin',
    '/Applications/Docker.app/Contents/Resources/bin',  // Docker Desktop bundled
    '/Applications/Docker.app/Contents/Resources/bin/docker',  // Direct docker binary
    '~/.docker/bin',                           // User-local Docker installations
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
    COMPOSE_PROJECT_NAME: cfg.PROJECT_NAME || 'webcode',
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
    cwd: cfg.WORK_DIR || getWorkDir(),
    env: buildEnv(cfg)
  });

  // Handle spawn errors (e.g., docker command not found)
  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      const errorMsg = '\n❌ 错误：未找到 Docker 命令\n\n请确保已安装 Docker Desktop 并正确启动。\nmacOS: https://www.docker.com/products/docker-desktop/\n\n';
      onData && onData(errorMsg);
    } else {
      const errorMsg = `\n❌ Docker 错误：${err.message}\n\n`;
      onData && onData(errorMsg);
    }
    onClose && onClose(1);
  });

  proc.stdout.on('data', (d) => onData && onData(d.toString()));
  proc.stderr.on('data', (d) => onData && onData(d.toString()));
  proc.on('close', (code) => onClose && onClose(code));
  return proc;
}

async function dockerUp(cfg, onData, onClose, options = {}) {
  // 始终用最新模板覆盖 docker-compose.yml
  if (cfg.INSTANCE_ID) {
    ensureInstanceComposeFile(cfg.INSTANCE_ID);
  } else {
    ensureComposeFile();
  }

  const workDir = cfg.WORK_DIR || getWorkDir();

  // ─── Pull image with fallback to ghcr.io ─────────────────────────────────────────────────────────────
  // 跳过 pull（用于快速重启）
  if (!options.skipPull) {
    const imageName = 'land007/webcode:latest';
    const ghcrImage = 'ghcr.io/land007/webcode:latest';

    onData && onData('正在拉取镜像...\n');

    const pullResult = await new Promise((resolve) => {
      const pullProc = spawn('docker', ['pull', imageName], { env: buildEnv(cfg) });
      let pullOutput = '';
      let pullError = '';

      pullProc.stdout.on('data', (d) => {
        const text = d.toString();
        pullOutput += text;
        onData && onData(text);
      });
      pullProc.stderr.on('data', (d) => {
        const text = d.toString();
        pullError += text;
        onData && onData(text);
      });
      pullProc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: pullError || pullOutput });
        }
      });
    });

    if (!pullResult.success) {
      onData && onData('Docker Hub 拉取失败，尝试从 GitHub Container Registry 下载...\n');

      const fallbackResult = await new Promise((resolve) => {
        const fallbackProc = spawn('docker', ['pull', ghcrImage], { env: buildEnv(cfg) });
        let fbOutput = '';
        let fbError = '';

        fallbackProc.stdout.on('data', (d) => {
          const text = d.toString();
          fbOutput += text;
          onData && onData(text);
        });
        fallbackProc.stderr.on('data', (d) => {
          const text = d.toString();
          fbError += text;
          onData && onData(text);
        });
        fallbackProc.on('close', (code) => {
          if (code === 0) {
            // Tag the ghcr.io image as land007/webcode:latest
            onData && onData('正在标记镜像为 ' + imageName + '...\n');
            const tagProc = spawn('docker', ['tag', ghcrImage, imageName], { env: buildEnv(cfg) });
            tagProc.on('close', (tagCode) => {
              if (tagCode === 0) {
                onData && onData('✅ 镜像下载成功（使用 GitHub Container Registry 备用源）\n\n');
                resolve({ success: true });
              } else {
                resolve({ success: false, error: 'Tag failed' });
              }
            });
          } else {
            resolve({ success: false, error: fbError || fbOutput });
          }
        });
      });

      if (!fallbackResult.success) {
        onData && onData('❌ 镜像拉取失败：Docker Hub 和 GitHub Container Registry 均无法访问\n');
        onData && onData('请检查网络连接或稍后重试\n\n');
        // Continue anyway - docker compose will try to pull
      }
    } else {
      onData && onData('✅ 镜像拉取完成\n\n');
    }
  } else {
    onData && onData('⚡ 跳过镜像拉取（快速启动模式）\n\n');
  }

  // ─── Port conflict detection and auto-fix ─────────────────────────────────────────────────────────────────

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
    cfg.PORT_DASHBOARD = fixedPorts.dashboard;
    ports = fixedPorts;

    // 保存配置
    if (cfg.INSTANCE_ID) {
      writeInstanceConfig(cfg.INSTANCE_ID, cfg);
    } else {
      writeConfig(cfg);
    }

    onData && onData('端口已自动调整：\n');
    for (const [key, result] of Object.entries(checkResults)) {
      if (!result.available) {
        onData && onData(`  ${result.name}: ${result.port} → ${fixedPorts[key]}\n`);
      }
    }
    onData && onData('\n');
  }

  // 无论是否有冲突，始终将当前端口配置写入 docker-compose.yml
  updateComposePorts(workDir, ports);

  // 注入自定义端口映射
  if (cfg.CUSTOM_PORTS && cfg.CUSTOM_PORTS.length > 0) {
    updateComposeCustomPorts(workDir, cfg.CUSTOM_PORTS);
  }

  // 注入自定义目录挂载
  if (cfg.CUSTOM_VOLUMES && cfg.CUSTOM_VOLUMES.length > 0) {
    updateComposeVolumes(workDir, cfg.CUSTOM_VOLUMES);
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
    cwd: cfg.WORK_DIR || getWorkDir(),
    env: buildEnv(cfg)
  });

  proc.on('error', (err) => {
    // Docker command not found or other spawn error
    callback(err, []);
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
  const result = { installed: false, running: false, version: '', error: null };
  const env = Object.assign({}, process.env, { PATH: buildDockerPath() });

  const ver = spawn('docker', ['--version'], { env });
  let verOut = '';
  let verErr = '';

  ver.stdout.on('data', d => { verOut += d.toString(); });
  ver.stderr.on('data', d => { verErr += d.toString(); });

  ver.on('error', (err) => {
    // Docker command not found (ENOENT)
    if (err.code === 'ENOENT') {
      result.error = 'not_found';
      callback(result);
    } else {
      result.error = err.message;
      callback(result);
    }
  });

  ver.on('close', (code) => {
    if (code !== 0) {
      result.error = 'not_found';
      callback(result);
      return;
    }
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
      services.push({ name: match[1], state: match[2].toLowerCase(), detail: match[3] || '' });
    }
  }
  return services;
}

/**
 * Update Theia's color theme by writing to ~/.theia/settings.json inside the container.
 * @param {Object} cfg
 * @param {string} themeName  e.g. 'dark' or 'light'
 * @param {Function} [callback]  (exitCode)
 */
function setTheiaTheme(cfg, themeName, callback) {
  const script =
    "const fs=require('fs'),f='/home/ubuntu/.theia/settings.json';" +
    "let s={};try{s=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}" +
    "s['workbench.colorTheme']=" + JSON.stringify(themeName) + ";" +
    "fs.mkdirSync('/home/ubuntu/.theia',{recursive:true});" +
    "fs.writeFileSync(f,JSON.stringify(s,null,2));";
  const proc = spawn('docker', ['exec', '-u', 'ubuntu', cfg.CONTAINER_NAME || 'webcode', 'node', '-e', script], {
    env: buildEnv(cfg)
  });
  proc.on('error', (err) => { if (callback) callback(1); });
  proc.on('close', (code) => { if (callback) callback(code); });
}

/**
 * Update desktop theme (background + GTK theme) inside the container.
 * @param {Object} cfg
 * @param {string} themeName  'dark' or 'light'
 * @param {Function} [callback]  (exitCode)
 */
function setDesktopTheme(cfg, themeName, callback) {
  const proc = spawn('docker', ['exec', '-u', 'ubuntu', cfg.CONTAINER_NAME || 'webcode', '/usr/local/bin/theme-switch', themeName], {
    env: buildEnv(cfg)
  });
  proc.on('error', (err) => { if (callback) callback(1); });
  proc.on('close', (code) => { if (callback) callback(code); });
}

/**
 * Run supervisorctl status inside the webcode container.
 * @param {Object} cfg
 * @param {Function} callback  (err, [{name, state, detail}])
 */
function supervisorStatus(cfg, callback) {
  const proc = spawn('docker', ['exec', cfg.CONTAINER_NAME || 'webcode', 'supervisorctl', 'status', 'all'], {
    env: buildEnv(cfg)
  });

  proc.on('error', (err) => {
    callback(err, []);
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
  const proc = spawn('docker', ['exec', cfg.CONTAINER_NAME || 'webcode', 'supervisorctl', 'restart', processName], {
    env: buildEnv(cfg)
  });
  proc.on('error', (err) => { if (callback) callback(1); });
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
  const dockerArgs = (extra) => ['exec', cfg.CONTAINER_NAME || 'webcode', 'supervisorctl', 'tail', '-1000', processName].concat(extra);
  let stdoutOut = '', stderrOut = '', done = 0;

  function finish() {
    if (++done < 2) return;
    const parts = [];
    if (stdoutOut.trim()) parts.push(stdoutOut);
    if (stderrOut.trim()) parts.push('=== stderr ===\n' + stderrOut);
    const out = parts.join('\n');
    const lines = out.split('\n');
    const formatted = lines.map(line => {
      if (!line.trim()) return line;
      const isError = /[Ee]rror|[Ee]xception|[Ff]ail|[Ww]arn|Traceback|at\s+<|undefined|TypeError|ReferenceError|SyntaxError/.test(line);
      return isError ? `[ERROR] ${line}` : line;
    }).join('\n');
    if (callback) callback(formatted);
  }

  const pStdout = spawn('docker', dockerArgs([]), { env: buildEnv(cfg) });
  pStdout.on('error', () => finish()); // On error, count as done
  pStdout.stdout.on('data', d => { stdoutOut += d.toString(); });
  pStdout.stderr.on('data', d => { stdoutOut += d.toString(); });
  pStdout.on('close', finish);

  const pStderr = spawn('docker', dockerArgs(['stderr']), { env: buildEnv(cfg) });
  pStderr.on('error', () => finish()); // On error, count as done
  pStderr.stdout.on('data', d => { stderrOut += d.toString(); });
  pStderr.stderr.on('data', d => { stderrOut += d.toString(); });
  pStderr.on('close', finish);
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

// ─── Volume helpers ───────────────────────────────────────────────────────────

/**
 * Remove a named Docker volume (compose-managed).
 * Finds the actual volume name via the compose label, then calls `docker volume rm`.
 * @param {string} volumeName  Logical volume name from docker-compose.yml, e.g. 'projects'
 * @param {Function} callback  (exitCode, output)
 */
function dockerVolumeRm(volumeName, callback) {
  const env = Object.assign({}, process.env, { PATH: buildDockerPath() });
  // Find the actual full volume name using the label Docker Compose attaches
  const ls = spawn('docker', ['volume', 'ls', '--filter', 'label=com.docker.compose.volume=' + volumeName, '-q'], { env });

  ls.on('error', (err) => {
    callback(1, 'Docker error: ' + err.message);
  });

  let found = '';
  ls.stdout.on('data', d => { found += d.toString(); });
  ls.on('close', () => {
    const actual = found.trim();
    if (!actual) {
      callback(1, 'Volume not found: ' + volumeName);
      return;
    }
    const rm = spawn('docker', ['volume', 'rm', actual], { env });

    rm.on('error', (err) => {
      callback(1, 'Docker error: ' + err.message);
    });

    let out = '';
    rm.stdout.on('data', d => { out += d.toString(); });
    rm.stderr.on('data', d => { out += d.toString(); });
    rm.on('close', (code) => { callback(code, out.trim() || actual); });
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  startProxies,
  stopProxies,
  getProxyPort,
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
  getPortSummary,
  dockerVolumeRm,
  setTheiaTheme,
  setDesktopTheme,
  checkForUpdates,
  updateContainer,
  getLocalImageId,
  getRemoteImageId,
  getLocalContainerDigest,
  getRemoteContainerDigest,
  buildDockerPath,
};
