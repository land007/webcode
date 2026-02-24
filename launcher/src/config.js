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
  DNA_REPO_URL: 'https://github.com/land007/webcode',
  // Port configuration (legacy, for backward compatibility)
  PORT_THEIA: 20001,
  PORT_KANBAN: 20002,
  PORT_OPENCLAW: 20003,
  PORT_NOVNC: 20004,
  PORT_VNC: 20005,
  // Custom mappings
  CUSTOM_VOLUMES: [],
  CUSTOM_PORTS: []
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
  fs.copyFileSync(src, dest);
}

// ─── Per-container configuration (new) ────────────────────────────────

/**
 * Get config path for a specific container
 */
function getContainerConfigPath(containerId) {
  const containersDir = path.join(nw.App.dataPath, 'containers');
  return path.join(containersDir, containerId, 'config.json');
}

/**
 * Read configuration for a specific container
 */
function readContainerConfig(containerId) {
  const configPath = getContainerConfigPath(containerId);
  if (!fs.existsSync(configPath)) {
    return Object.assign({}, DEFAULT_CONFIG);
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
  } catch (e) {
    console.error('Failed to read container config:', e);
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

/**
 * Write configuration for a specific container
 */
function writeContainerConfig(containerId, cfg) {
  const configPath = getContainerConfigPath(containerId);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Get work directory for a specific container
 */
function getContainerWorkDir(containerId) {
  const containersDir = path.join(nw.App.dataPath, 'containers');
  return path.join(containersDir, containerId, 'workdir');
}

/**
 * Ensure compose file for a specific container
 */
function ensureContainerComposeFile(containerId, ports) {
  const workDir = getContainerWorkDir(containerId);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  const dest = path.join(workDir, 'docker-compose.yml');
  const src = path.join(__dirname, '..', 'assets', 'docker-compose.yml');

  // Copy template
  let content = fs.readFileSync(src, 'utf8');

  // Replace ports if provided
  if (ports) {
    content = content
      .replace(/"20001:20001"/, `"${ports.theia}:20001"`)
      .replace(/"20002:20002"/, `"${ports.kanban}:20002"`)
      .replace(/"20003:20003"/, `"${ports.openclaw}:20003"`)
      .replace(/"20004:20004"/, `"${ports.novnc}:20004"`);
  }

  fs.writeFileSync(dest, content, 'utf8');
}

module.exports = {
  DEFAULT_CONFIG,
  configExists,
  readConfig,
  writeConfig,
  getWorkDir,
  ensureComposeFile,
  // Per-container config (new)
  readContainerConfig,
  writeContainerConfig,
  getContainerWorkDir,
  ensureContainerComposeFile,
  getContainerConfigPath
};
