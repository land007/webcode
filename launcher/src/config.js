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
  // 端口配置（宿主机端口）
  PORT_THEIA: 20001,
  PORT_KANBAN: 20002,
  PORT_OPENCLAW: 20003,
  PORT_NOVNC: 20004,
  PORT_VNC: 20005
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
  if (!fs.existsSync(dest)) {
    const src = path.join(__dirname, '..', 'assets', 'docker-compose.yml');
    fs.copyFileSync(src, dest);
  }
}

module.exports = {
  DEFAULT_CONFIG,
  configExists,
  readConfig,
  writeConfig,
  getWorkDir,
  ensureComposeFile
};
