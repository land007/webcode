'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

// 默认端口配置
const DEFAULT_PORTS = {
  theia: 20001,
  kanban: 20002,
  openclaw: 20003,
  novnc: 20004,
  vnc: 20005
};

// 端口配置名称映射
const PORT_NAMES = {
  theia: 'Theia IDE',
  kanban: 'Vibe Kanban',
  openclaw: 'OpenClaw AI',
  novnc: 'noVNC',
  vnc: 'TigerVNC'
};

/**
 * 检测端口是否可用
 * @param {number} port - 要检测的端口号
 * @returns {Promise<boolean>} - 端口是否可用
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false);
      } else {
        // 其他错误也认为不可用
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * 检测多个端口的可用性
 * @param {Object} ports - 端口配置对象 { theia: 20001, kanban: 20002, ... }
 * @returns {Promise<Object>} - 检测结果 { theia: { available: true, port: 20001 }, ... }
 */
async function checkPorts(ports) {
  const results = {};
  const keys = Object.keys(ports);

  for (const key of keys) {
    const port = ports[key];
    const available = await isPortAvailable(port);
    results[key] = {
      port,
      available,
      name: PORT_NAMES[key] || key
    };
  }

  return results;
}

/**
 * 寻找可用端口（从指定端口开始递增）
 * @param {number} startPort - 起始端口号
 * @param {number} maxAttempts - 最大尝试次数
 * @returns {Promise<number>} - 可用的端口号，如果都不可用返回 -1
 */
async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return -1;
}

/**
 * 自动修复端口冲突
 * @param {Object} ports - 当前端口配置
 * @returns {Promise<Object>} - 修复后的端口配置
 */
async function autoFixPorts(ports) {
  const results = await checkPorts(ports);
  const fixedPorts = { ...ports };
  // 记录已分配的端口（含原本已占用的），防止多个服务被分配到同一端口
  const usedPorts = new Set(Object.values(fixedPorts));

  for (const key of Object.keys(results)) {
    const result = results[key];
    if (!result.available) {
      // 从 +100 开始找一个未被任何服务占用的可用端口
      let candidate = result.port + 100;
      let newPort = -1;
      for (let i = 0; i < 200; i++) {
        const port = candidate + i;
        if (!usedPorts.has(port) && await isPortAvailable(port)) {
          newPort = port;
          break;
        }
      }
      if (newPort > 0) {
        usedPorts.delete(fixedPorts[key]); // 移除旧端口占位
        usedPorts.add(newPort);
        fixedPorts[key] = newPort;
        console.log(`Port ${result.port} (${result.name}) is in use, changed to ${newPort}`);
      }
    }
  }

  return fixedPorts;
}

/**
 * 从配置中获取端口设置
 * @param {Object} cfg - 配置对象
 * @returns {Object} - 端口配置
 */
function getPortsFromConfig(cfg) {
  return {
    theia: cfg.PORT_THEIA || DEFAULT_PORTS.theia,
    kanban: cfg.PORT_KANBAN || DEFAULT_PORTS.kanban,
    openclaw: cfg.PORT_OPENCLAW || DEFAULT_PORTS.openclaw,
    novnc: cfg.PORT_NOVNC || DEFAULT_PORTS.novnc,
    vnc: cfg.PORT_VNC || DEFAULT_PORTS.vnc
  };
}

/**
 * 更新 docker-compose.yml 中的端口映射
 * @param {string} workDir - 工作目录
 * @param {Object} ports - 端口配置
 */
function updateComposePorts(workDir, ports) {
  const composePath = path.join(workDir, 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    throw new Error('docker-compose.yml not found');
  }

  let content = fs.readFileSync(composePath, 'utf8');

  // 替换端口映射
  content = content.replace(/"(\d+):20001"/, `"${ports.theia}:20001"`);
  content = content.replace(/"(\d+):20002"/, `"${ports.kanban}:20002"`);
  content = content.replace(/"(\d+):20003"/, `"${ports.openclaw}:20003"`);
  content = content.replace(/"(\d+):20004"/, `"${ports.novnc}:20004"`);
  content = content.replace(/"(\d+):10005"/, `"${ports.vnc}:10005"`);

  fs.writeFileSync(composePath, content, 'utf8');
}

/**
 * 获取端口摘要信息（用于显示）
 * @param {Object} ports - 端口配置
 * @returns {Array} - 端口信息数组
 */
function getPortSummary(ports) {
  return Object.keys(ports).map(key => ({
    key,
    name: PORT_NAMES[key] || key,
    port: ports[key]
  }));
}

module.exports = {
  DEFAULT_PORTS,
  PORT_NAMES,
  isPortAvailable,
  checkPorts,
  findAvailablePort,
  autoFixPorts,
  getPortsFromConfig,
  updateComposePorts,
  getPortSummary
};
