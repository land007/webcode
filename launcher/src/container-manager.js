'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Docker helpers (adapted from app.js) ─────────────────────────────

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
  const merged = [...extra.filter(p => !parts.includes(p)), ...parts];
  return merged.join(':');
}

function buildEnv(container, cfg) {
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

/**
 * Container Manager - handles Docker operations for specific containers
 */
class ContainerManager {
  constructor(registry) {
    this.registry = registry;
    this.runningProcesses = new Map(); // containerId -> { compose, logs }
  }

  /**
   * Spawn docker command for a specific container
   */
  dockerSpawn(container, args, cfg, onData, onClose) {
    const proc = spawn('docker', args, {
      cwd: container.workDir,
      env: buildEnv(container, cfg)
    });
    proc.stdout.on('data', (d) => onData && onData(d.toString()));
    proc.stderr.on('data', (d) => onData && onData(d.toString()));
    proc.on('close', (code) => onClose && onClose(code));
    return proc;
  }

  /**
   * Generate docker-compose.yml for a container
   */
  generateComposeFile(container) {
    const cfg = container.config;

    const template = `version: '3.8'
services:
  webcode:
    image: land007/webcode:latest
    container_name: ${container.containerName}
    ports:
      - "${container.ports.theia}:20001"
      - "${container.ports.kanban}:20002"
      - "${container.ports.openclaw}:20003"
      - "${container.ports.novnc}:20004"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${container.composeProject}-projects:/home/ubuntu/projects
      - ${container.composeProject}-theia:/home/ubuntu/.theia
      - ${container.composeProject}-vibe-kanban:/home/ubuntu/.local/share/vibe-kanban
      - ${container.composeProject}-openclaw:/home/ubuntu/.openclaw
      - ${container.composeProject}-user-data:/home/ubuntu/.local/share
      - ${container.composeProject}-gitconfig:/home/ubuntu/.gitconfig-vol
    environment:
      - MODE=\${MODE:desktop}
      - AUTH_USER=\${AUTH_USER:admin}
      - AUTH_PASSWORD=\${AUTH_PASSWORD:changeme}
      - OPENCLAW_TOKEN=\${OPENCLAW_TOKEN:changeme}
      - VNC_PASSWORD=\${VNC_PASSWORD:changeme}
      - VNC_RESOLUTION=\${VNC_RESOLUTION:1920x1080}
      - CF_TUNNEL_TOKEN=\${CF_TUNNEL_TOKEN:}
      - GIT_USER_NAME=\${GIT_USER_NAME:}
      - GIT_USER_EMAIL=\${GIT_USER_EMAIL:}
      - DNA_REPO_URL=\${DNA_REPO_URL:https://github.com/land007/webcode}

volumes:
  ${container.composeProject}-projects:
  ${container.composeProject}-theia:
  ${container.composeProject}-vibe-kanban:
  ${container.composeProject}-openclaw:
  ${container.composeProject}-user-data:
  ${container.composeProject}-gitconfig:
`;

    fs.writeFileSync(
      path.join(container.workDir, 'docker-compose.yml'),
      template,
      'utf8'
    );
  }

  /**
   * Start a container
   */
  async startContainer(containerId, onData, onClose) {
    const container = this.registry.getContainer(containerId);
    if (!container) {
      onData && onData('Container not found\n');
      return null;
    }

    // Update status
    this.registry.updateStatus(containerId, 'starting');

    // Generate compose file
    this.generateComposeFile(container);

    // Load config
    const cfg = this.registry.loadContainerConfig(containerId);

    // Inject custom ports if configured
    if (cfg.CUSTOM_PORTS && cfg.CUSTOM_PORTS.length > 0) {
      this.injectCustomPorts(container, cfg.CUSTOM_PORTS);
    }

    // Inject custom volumes if configured
    if (cfg.CUSTOM_VOLUMES && cfg.CUSTOM_VOLUMES.length > 0) {
      this.injectCustomVolumes(container, cfg.CUSTOM_VOLUMES);
    }

    // Start container
    const proc = this.dockerSpawn(
      container,
      ['compose', '-p', container.composeProject, 'up', '-d'],
      cfg,
      onData,
      (code) => {
        if (code === 0) {
          this.registry.updateStatus(containerId, 'running');
        } else {
          this.registry.updateStatus(containerId, 'error');
        }
        onClose && onClose(code);
      }
    );

    this.runningProcesses.set(containerId, { compose: proc });
    return proc;
  }

  /**
   * Stop a container
   */
  stopContainer(containerId, onData, onClose) {
    const container = this.registry.getContainer(containerId);
    if (!container) {
      onData && onData('Container not found\n');
      return;
    }

    this.registry.updateStatus(containerId, 'stopping');

    const cfg = this.registry.loadContainerConfig(containerId);
    const proc = this.dockerSpawn(
      container,
      ['compose', '-p', container.composeProject, 'down'],
      cfg,
      onData,
      (code) => {
        if (code === 0) {
          this.registry.updateStatus(containerId, 'stopped');
        }
        onClose && onClose(code);
      }
    );

    // Clean up running processes
    const running = this.runningProcesses.get(containerId);
    if (running) {
      if (running.logs) running.logs.kill();
      this.runningProcesses.delete(containerId);
    }

    return proc;
  }

  /**
   * Get container logs
   */
  getContainerLogs(containerId, onData) {
    const container = this.registry.getContainer(containerId);
    if (!container) return;

    const cfg = this.registry.loadContainerConfig(containerId);

    // Kill existing log process if any
    const running = this.runningProcesses.get(containerId);
    if (running && running.logs) {
      running.logs.kill();
    }

    const proc = this.dockerSpawn(
      container,
      ['compose', '-p', container.composeProject, 'logs', '-f', '--tail=200'],
      cfg,
      onData,
      null
    );

    // Store log process
    if (!this.runningProcesses.has(containerId)) {
      this.runningProcesses.set(containerId, {});
    }
    this.runningProcesses.get(containerId).logs = proc;

    return proc;
  }

  /**
   * Get container status
   */
  getContainerStatus(containerId, callback) {
    const container = this.registry.getContainer(containerId);
    if (!container) {
      callback(new Error('Container not found'), []);
      return;
    }

    const cfg = this.registry.loadContainerConfig(containerId);
    const proc = spawn('docker', ['compose', '-p', container.composeProject, 'ps', '--format', 'json'], {
      cwd: container.workDir,
      env: buildEnv(container, cfg)
    });

    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => {
      try {
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

  /**
   * Inject custom ports into docker-compose.yml
   */
  injectCustomPorts(container, customPorts) {
    const composePath = path.join(container.workDir, 'docker-compose.yml');
    if (!fs.existsSync(composePath)) return;

    const validPorts = customPorts.filter(p => p.host && p.container);
    if (validPorts.length === 0) return;

    let content = fs.readFileSync(composePath, 'utf8');

    // Find the ports section and add custom ports
    const portsSection = validPorts
      .map(p => `      - "${p.host}:${p.container}"`)
      .join('\n');

    // Insert after the last port line
    const lastPortLine = content.match(/      - "\d+:\d+"\n/);
    if (lastPortLine) {
      const insertPos = content.indexOf(lastPortLine[0]) + lastPortLine[0].length;
      content = content.slice(0, insertPos) + portsSection + '\n' + content.slice(insertPos);
    }

    fs.writeFileSync(composePath, content, 'utf8');
  }

  /**
   * Inject custom volumes into docker-compose.yml
   */
  injectCustomVolumes(container, customVolumes) {
    const composePath = path.join(container.workDir, 'docker-compose.yml');
    if (!fs.existsSync(composePath)) return;

    const validVolumes = customVolumes.filter(v => v.host && v.container);
    if (validVolumes.length === 0) return;

    let content = fs.readFileSync(composePath, 'utf8');

    // Insert custom volume lines before "environment:"
    const mountLines = validVolumes
      .map(v => `      - ${v.host}:${v.container}`)
      .join('\n');

    content = content.replace('    environment:', mountLines + '\n    environment:');

    // Append named volume declarations
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

  /**
   * Execute command inside container
   */
  execInContainer(containerId, command, args, callback) {
    const container = this.registry.getContainer(containerId);
    if (!container) {
      callback(new Error('Container not found'), '');
      return;
    }

    const cfg = this.registry.loadContainerConfig(containerId);
    const proc = spawn('docker', ['exec', container.containerName, ...args], {
      env: buildEnv(container, cfg)
    });

    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { out += d.toString(); });
    proc.on('close', (code) => {
      callback(code !== 0 ? new Error(`Command failed with code ${code}`) : null, out);
    });

    return proc;
  }

  /**
   * Get supervisor status from container
   */
  getSupervisorStatus(containerId, callback) {
    this.execInContainer(containerId, 'supervisorctl', ['status', 'all'], (err, out) => {
      if (err) {
        callback(err, []);
        return;
      }

      const services = [];
      const lines = out.trim().split('\n');
      const VALID_STATES = new Set(['RUNNING', 'STOPPED', 'STARTING', 'FATAL', 'EXITED', 'UNKNOWN', 'BACKOFF']);

      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
        if (match && VALID_STATES.has(match[2].toUpperCase())) {
          services.push({ name: match[1], state: match[2].toLowerCase(), detail: match[3] || '' });
        }
      }

      callback(null, services);
    });
  }

  /**
   * Restart supervisor process in container
   */
  restartSupervisorProcess(containerId, processName, callback) {
    const container = this.registry.getContainer(containerId);
    if (!container) {
      callback(new Error('Container not found'));
      return;
    }

    const cfg = this.registry.loadContainerConfig(containerId);
    const proc = spawn('docker', ['exec', container.containerName, 'supervisorctl', 'restart', processName], {
      env: buildEnv(container, cfg)
    });

    proc.on('close', (code) => {
      callback(code !== 0 ? new Error(`Restart failed with code ${code}`) : null);
    });
  }

  /**
   * Clean up all running processes
   */
  cleanup() {
    for (const [containerId, processes] of this.runningProcesses) {
      if (processes.compose) processes.compose.kill();
      if (processes.logs) processes.logs.kill();
    }
    this.runningProcesses.clear();
  }
}

module.exports = ContainerManager;
