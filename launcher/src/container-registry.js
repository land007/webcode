'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Port configuration
const PORT_RANGES = {
  SERVICE_BASE: 21000,
  PROXY_BASE: 11100,
  PORT_STEP: 100
};

// Container registry path
function getRegistryPath() {
  return path.join(nw.App.dataPath, 'registry.json');
}

function getContainersDir() {
  return path.join(nw.App.dataPath, 'containers');
}

// Generate UUID v4
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Container Registry - manages multiple webcode containers
 */
class ContainerRegistry {
  constructor() {
    this.data = this.load();
    this.ensureDirectories();
  }

  /**
   * Load registry from disk or create empty one
   */
  load() {
    const registryPath = getRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return this.createEmpty();
    }
    try {
      const raw = fs.readFileSync(registryPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load registry:', e);
      return this.createEmpty();
    }
  }

  /**
   * Save registry to disk
   */
  save() {
    const registryPath = getRegistryPath();
    const dir = path.dirname(registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(registryPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  /**
   * Create empty registry structure
   */
  createEmpty() {
    return {
      containers: [],
      nextServicePortBase: PORT_RANGES.SERVICE_BASE + PORT_RANGES.PORT_STEP,
      nextProxyPortBase: PORT_RANGES.PROXY_BASE + PORT_RANGES.PORT_STEP,
      version: 1
    };
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    const containersDir = getContainersDir();
    if (!fs.existsSync(containersDir)) {
      fs.mkdirSync(containersDir, { recursive: true });
    }
  }

  /**
   * Allocate ports for a new container
   */
  allocatePorts() {
    const index = this.data.containers.length;
    const offset = index * PORT_RANGES.PORT_STEP;

    return {
      service: {
        theia: PORT_RANGES.SERVICE_BASE + offset + 1,
        kanban: PORT_RANGES.SERVICE_BASE + offset + 2,
        openclaw: PORT_RANGES.SERVICE_BASE + offset + 3,
        novnc: PORT_RANGES.SERVICE_BASE + offset + 4,
        vnc: PORT_RANGES.SERVICE_BASE + offset + 5
      },
      proxy: {
        theia: PORT_RANGES.PROXY_BASE + offset + 1,
        kanban: PORT_RANGES.PROXY_BASE + offset + 2,
        openclaw: PORT_RANGES.PROXY_BASE + offset + 3,
        novnc: PORT_RANGES.PROXY_BASE + offset + 4
      }
    };
  }

  /**
   * Create a new container
   */
  createContainer(name, description, config = {}) {
    const id = uuidv4();
    const shortId = id.substring(0, 8);
    const ports = this.allocatePorts();

    const container = {
      id,
      name: name || `Container ${shortId}`,
      description: description || '',
      status: 'stopped',
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),

      // Docker identifiers
      containerName: `webcode-${shortId}`,
      composeProject: `webcode-${shortId}`,

      // Working directory
      workDir: path.join(getContainersDir(), id, 'workdir'),
      configDir: path.join(getContainersDir(), id),

      // Ports
      ports: ports.service,
      proxyPorts: ports.proxy,

      // Configuration
      config: Object.assign({
        MODE: 'desktop',
        AUTH_USER: 'admin',
        AUTH_PASSWORD: 'changeme',
        VNC_PASSWORD: 'changeme',
        VNC_RESOLUTION: '1920x1080',
        OPENCLAW_TOKEN: 'changeme',
        GIT_USER_NAME: '',
        GIT_USER_EMAIL: '',
        CF_TUNNEL_TOKEN: '',
        DNA_REPO_URL: 'https://github.com/land007/webcode',
        CUSTOM_VOLUMES: [],
        CUSTOM_PORTS: []
      }, config)
    };

    // Create directories
    fs.mkdirSync(container.workDir, { recursive: true });
    fs.mkdirSync(container.configDir, { recursive: true });

    // Save container-specific config
    this.saveContainerConfig(container);

    // Add to registry
    this.data.containers.push(container);
    this.save();

    return container;
  }

  /**
   * Save container-specific configuration
   */
  saveContainerConfig(container) {
    const configPath = path.join(container.configDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(container.config, null, 2), 'utf8');
  }

  /**
   * Load container-specific configuration
   */
  loadContainerConfig(containerId) {
    const container = this.getContainer(containerId);
    if (!container) return null;

    const configPath = path.join(container.configDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return container.config;
    }

    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Failed to load container config:', e);
      return container.config;
    }
  }

  /**
   * Update container configuration
   */
  updateContainerConfig(containerId, newConfig) {
    const container = this.getContainer(containerId);
    if (!container) return false;

    // Merge config
    container.config = Object.assign({}, container.config, newConfig);

    // Save both container config and registry
    this.saveContainerConfig(container);
    this.save();

    return true;
  }

  /**
   * Delete a container
   */
  deleteContainer(containerId) {
    const container = this.getContainer(containerId);
    if (!container) return false;

    const containerDir = path.join(getContainersDir(), containerId);
    if (fs.existsSync(containerDir)) {
      fs.rmSync(containerDir, { recursive: true, force: true });
    }

    this.data.containers = this.data.containers.filter(c => c.id !== containerId);
    this.save();

    return true;
  }

  /**
   * Get container by ID
   */
  getContainer(containerId) {
    return this.data.containers.find(c => c.id === containerId);
  }

  /**
   * Get container by name
   */
  getContainerByName(name) {
    return this.data.containers.find(c => c.name === name);
  }

  /**
   * List all containers
   */
  listContainers() {
    return this.data.containers;
  }

  /**
   * Update container status
   */
  updateStatus(containerId, status) {
    const container = this.getContainer(containerId);
    if (container) {
      container.status = status;
      container.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Rename container
   */
  renameContainer(containerId, newName) {
    const container = this.getContainer(containerId);
    if (container) {
      container.name = newName;
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Duplicate container configuration
   */
  duplicateContainer(sourceContainerId, newName) {
    const source = this.getContainer(sourceContainerId);
    if (!source) return null;

    // Create new container with same config
    const newContainer = this.createContainer(
      newName || `${source.name} (copy)`,
      source.description,
      Object.assign({}, source.config)
    );

    return newContainer;
  }

  /**
   * Migrate legacy single-container setup to registry
   */
  migrateLegacyConfig(legacyConfig) {
    if (this.data.containers.length > 0) {
      return; // Already has containers
    }

    // Create a default container from legacy config
    this.createContainer(
      '主项目',
      '从前版迁移的默认容器',
      Object.assign({}, legacyConfig)
    );
  }
}

module.exports = {
  ContainerRegistry,
  getRegistryPath,
  getContainersDir,
  PORT_RANGES
};
