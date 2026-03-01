'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  AUTH_USER: 'admin',
  AUTH_PASSWORD: 'changeme',
  VNC_PASSWORD: 'changeme',
  VNC_RESOLUTION: '1920x1080',
  OPENCLAW_TOKEN: 'changeme',
  MODE: 'desktop',
  GIT_USER_NAME: '',
  GIT_USER_EMAIL: '',
  CF_TUNNEL_TOKEN: '',
  // 机器人 DNA 来源：可设为自己的 fork URL，支持自我进化生态
  DNA_REPO_URL: 'https://github.com/land007/webcode',
  // 端口配置（宿主机端口）
  PORT_THEIA: 20001,
  PORT_KANBAN: 20002,
  PORT_OPENCLAW: 20003,
  PORT_NOVNC: 20004,
  PORT_VNC: 20005,
  // 自定义目录挂载：[{ host: '/宿主机路径', container: '/容器路径' }, ...]
  CUSTOM_VOLUMES: [],
  // 自定义端口映射：[{ host: '8080', container: '3000' }, ...]
  CUSTOM_PORTS: [],
  // Docker 访问模式：'host'（挂载宿主机 socket）| 'dind'（容器内 dockerd）| 'none'（不启用）
  DOCKER_SOCK_MODE: 'host'
};

function getConfigPath() {
  return path.join(nw.App.dataPath, 'config.json');
}

function getWorkDir() {
  return path.join(nw.App.dataPath, 'webcode');
}

function configExists() {
  return fs.existsSync(getConfigPath());
}

function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return Object.assign({}, DEFAULT_CONFIG);
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
  } catch (e) {
    console.error('Failed to read config:', e);
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

function writeConfig(cfg) {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

function ensureComposeFile() {
  const workDir = getWorkDir();
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }
  const dest = path.join(workDir, 'docker-compose.yml');
  const src = path.join(__dirname, '..', 'assets', 'docker-compose.yml');
  // 始终用 assets 里的最新模板覆盖，避免使用旧版本
  fs.copyFileSync(src, dest);
}

// ─── Multi-instance support ───────────────────────────────────────────────────

function getGlobalConfigPath() {
  return path.join(nw.App.dataPath, 'global.json');
}

function readGlobalConfig() {
  const p = getGlobalConfigPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeGlobalConfig(global) {
  const p = getGlobalConfigPath();
  fs.writeFileSync(p, JSON.stringify(global, null, 2), 'utf8');
}

function getInstanceDir(id) {
  return path.join(nw.App.dataPath, 'instances', id);
}

function getInstanceConfigPath(id) {
  return path.join(getInstanceDir(id), 'config.json');
}

function getInstanceWorkDir(id) {
  return path.join(getInstanceDir(id), 'webcode');
}

function readInstanceConfig(id) {
  const p = getInstanceConfigPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch (e) {
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

function writeInstanceConfig(id, cfg) {
  const dir = getInstanceDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getInstanceConfigPath(id), JSON.stringify(cfg, null, 2), 'utf8');
}

function getDefaultPortsForIndex(index) {
  const base = 20001 + index * 100;
  return {
    PORT_THEIA:    base,
    PORT_KANBAN:   base + 1,
    PORT_OPENCLAW: base + 2,
    PORT_NOVNC:    base + 3,
    PORT_VNC:      base + 4
  };
}

function listInstances() {
  const global = readGlobalConfig();
  if (!global) return [];
  return global.instances || [];
}

function ensureInstanceComposeFile(id) {
  const workDir = getInstanceWorkDir(id);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }
  const dest = path.join(workDir, 'docker-compose.yml');
  const src = path.join(__dirname, '..', 'assets', 'docker-compose.yml');

  // Copy template
  fs.copyFileSync(src, dest);

  // Apply instance-specific volumes
  const volumes = require('./volumes');
  volumes.updateComposeVolumes(workDir, id);

  // Apply instance-specific ports
  const ports = require('./ports');
  const cfg = readInstanceConfig(id);
  if (cfg) {
    const portConfig = ports.getPortsFromConfig(cfg);
    ports.updateComposePorts(workDir, portConfig);
    ports.updateComposeCustomPorts(workDir, cfg.CUSTOM_PORTS || []);
  }

  // Apply Docker access mode (sock / dind / none)
  volumes.updateComposeDockerMode(workDir, cfg ? cfg.DOCKER_SOCK_MODE || 'host' : 'host');

  // Apply custom volumes
  volumes.updateComposeCustomVolumes(workDir, cfg ? cfg.CUSTOM_VOLUMES || [] : []);
}

function createInstance(name) {
  let global = readGlobalConfig();
  if (!global) {
    global = { version: 1, activeInstanceId: null, instances: [] };
  }

  const index = global.instances.length;
  const id = 'inst-' + Date.now();
  const projectName = 'webcode-' + id;
  const containerName = 'webcode-' + id;
  const workDir = getInstanceWorkDir(id);
  const ports = getDefaultPortsForIndex(index);

  const cfg = Object.assign({}, DEFAULT_CONFIG, ports, {
    INSTANCE_ID:    id,
    PROJECT_NAME:   projectName,
    CONTAINER_NAME: containerName,
    WORK_DIR:       workDir
  });

  const instanceDir = getInstanceDir(id);
  if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });
  writeInstanceConfig(id, cfg);
  ensureInstanceComposeFile(id);

  global.instances.push({ id, name: name || 'New Instance', createdAt: new Date().toISOString() });
  if (!global.activeInstanceId) global.activeInstanceId = id;
  writeGlobalConfig(global);

  return { id, cfg };
}

function removeInstance(id) {
  let global = readGlobalConfig();
  if (!global) return;

  global.instances = global.instances.filter(inst => inst.id !== id);
  if (global.activeInstanceId === id) {
    global.activeInstanceId = global.instances.length > 0 ? global.instances[0].id : null;
  }
  writeGlobalConfig(global);

  const dir = getInstanceDir(id);
  if (fs.existsSync(dir)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

function migrateFromSingleInstance() {
  const globalPath = getGlobalConfigPath();
  const oldConfigPath = getConfigPath();

  if (fs.existsSync(globalPath)) return false;
  if (!fs.existsSync(oldConfigPath)) return false;

  let oldCfg;
  try {
    oldCfg = Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(oldConfigPath, 'utf8')));
  } catch (e) {
    oldCfg = Object.assign({}, DEFAULT_CONFIG);
  }

  const id = 'inst-1';
  const instanceDir = getInstanceDir(id);
  if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });

  const migratedCfg = Object.assign({}, oldCfg, {
    INSTANCE_ID:    id,
    PROJECT_NAME:   'webcode',
    CONTAINER_NAME: 'webcode',
    WORK_DIR:       getInstanceWorkDir(id)
  });

  writeInstanceConfig(id, migratedCfg);
  ensureInstanceComposeFile(id);

  const global = {
    version: 1,
    activeInstanceId: id,
    instances: [{ id, name: 'Default', createdAt: new Date().toISOString() }]
  };
  writeGlobalConfig(global);

  try { fs.renameSync(oldConfigPath, oldConfigPath + '.bak'); } catch (e) {}

  return true;
}

module.exports = {
  DEFAULT_CONFIG,
  configExists,
  readConfig,
  writeConfig,
  getWorkDir,
  ensureComposeFile,
  // Multi-instance
  getGlobalConfigPath,
  readGlobalConfig,
  writeGlobalConfig,
  getInstanceDir,
  getInstanceConfigPath,
  getInstanceWorkDir,
  readInstanceConfig,
  writeInstanceConfig,
  getDefaultPortsForIndex,
  listInstances,
  ensureInstanceComposeFile,
  createInstance,
  removeInstance,
  migrateFromSingleInstance,
};
