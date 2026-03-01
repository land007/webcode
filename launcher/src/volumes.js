'use strict';

const fs = require('fs');
const path = require('path');

// 默认 volume 配置（映射关系）
const DEFAULT_VOLUMES = {
  'dna-data': '/home/ubuntu/dna',
  'projects': '/home/ubuntu/projects',
  'vibe-kanban-data': '/home/ubuntu/.local/share/vibe-kanban',
  'theia-data': '/home/ubuntu/.theia',
  'user-data': '/home/ubuntu/.local/share',
  'openclaw-data': '/home/ubuntu/.openclaw',
  'chrome-data': '/home/ubuntu/.config',
  'gitconfig': '/home/ubuntu/.gitconfig-vol',
  'recordings': '/home/ubuntu/recordings'
};

// Volume 名称映射（用于显示）
const VOLUME_NAMES = {
  'dna-data': 'DNA',
  'projects': 'Projects',
  'vibe-kanban-data': 'Vibe Kanban',
  'theia-data': 'Theia Settings',
  'user-data': 'User Data',
  'openclaw-data': 'OpenClaw',
  'chrome-data': 'Chrome/Chromium',
  'gitconfig': 'Git Config',
  'recordings': 'Recordings'
};

/**
 * 为实例生成独立的 volume 名称
 * @param {string} instanceId - 实例 ID
 * @returns {Object} - volume 名称到容器路径的映射，同时包含 baseName 信息
 */
function getInstanceVolumes(instanceId) {
  const volumes = {};
  for (const [name, containerPath] of Object.entries(DEFAULT_VOLUMES)) {
    const instanceVolumeName = name + '-' + instanceId;
    volumes[instanceVolumeName] = {
      baseName: name,
      containerPath: containerPath
    };
  }
  return volumes;
}

/**
 * 从配置中获取 volume 设置（支持用户自定义共享）
 * @param {Object} cfg - 配置对象
 * @returns {Object} - volume 配置（简化格式：volumeName -> containerPath）
 */
function getVolumesFromConfig(cfg) {
  const instanceId = cfg.INSTANCE_ID || 'default';
  const volumes = getInstanceVolumes(instanceId);

  // 转换为简化格式
  const result = {};
  for (const [instanceVolumeName, info] of Object.entries(volumes)) {
    result[instanceVolumeName] = info.containerPath;
  }

  // 如果用户设置了 SHARE_VOLUMES，则某些 volume 不添加实例后缀
  if (cfg.SHARE_VOLUMES && Array.isArray(cfg.SHARE_VOLUMES)) {
    cfg.SHARE_VOLUMES.forEach(volName => {
      if (DEFAULT_VOLUMES[volName]) {
        result[volName] = DEFAULT_VOLUMES[volName];
      }
    });
  }

  return result;
}

/**
 * 更新 docker-compose.yml 中的 volume 映射
 * @param {string} workDir - 工作目录
 * @param {string} instanceId - 实例 ID
 */
function updateComposeVolumes(workDir, instanceId) {
  const composePath = path.join(workDir, 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    throw new Error('docker-compose.yml not found');
  }

  let content = fs.readFileSync(composePath, 'utf8');
  const instanceVolumes = getInstanceVolumes(instanceId);

  // 替换所有 volume 映射（挂载部分）
  for (const [instanceVolumeName, info] of Object.entries(instanceVolumes)) {
    const baseName = info.baseName;
    const containerPath = info.containerPath;

    // 替换挂载映射: - baseName:/container/path -> - instanceVolumeName:/container/path
    const escapedPath = containerPath.replace(/\//g, '\\/');
    const oldMount = new RegExp(`(-\\s+)${baseName}:(${escapedPath})`, 'g');
    const newMount = `$1${instanceVolumeName}:$2`;
    content = content.replace(oldMount, newMount);
  }

  // 替换 volumes 声明部分
  const volumesSectionStart = content.indexOf('\nvolumes:\n');
  if (volumesSectionStart !== -1) {
    let newVolumesSection = '\nvolumes:\n';

    for (const volumeName of Object.keys(instanceVolumes)) {
      newVolumesSection += `  ${volumeName}:\n`;
    }

    content = content.slice(0, volumesSectionStart) + newVolumesSection;
  }

  fs.writeFileSync(composePath, content, 'utf8');
}

/**
 * 将自定义目录挂载注入 docker-compose.yml
 * @param {string} workDir
 * @param {Array<{host:string, container:string}>} customVolumes
 */
function updateComposeCustomVolumes(workDir, customVolumes) {
  if (!customVolumes || customVolumes.length === 0) return;
  const composePath = path.join(workDir, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;

  const valid = customVolumes.filter(v => v.host && v.container);
  if (valid.length === 0) return;

  let content = fs.readFileSync(composePath, 'utf8');
  const extraLines = valid.map(v => `      - ${v.host}:${v.container}`).join('\n');

  // 插入到 recordings 挂载行之后
  content = content.replace(
    /( +- recordings:[^\n]*)/,
    `$1\n${extraLines}`
  );

  fs.writeFileSync(composePath, content, 'utf8');
}

/**
 * 按 Docker 访问模式更新 docker-compose.yml 中的 sock 挂载和 privileged 标志
 * @param {string} workDir - 工作目录
 * @param {string} mode - 'host' | 'dind' | 'none'
 */
function updateComposeDockerMode(workDir, mode) {
  const composePath = path.join(workDir, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) return;

  let content = fs.readFileSync(composePath, 'utf8');

  // 幂等清理：先删除已有的 sock 行和 privileged 行
  content = content.replace(/\n      - \/var\/run\/docker\.sock:\/var\/run\/docker\.sock/g, '');
  content = content.replace(/\n    privileged: true/g, '');

  if (mode === 'host') {
    // 在 volumes: 列表第一行之前插入 sock 挂载
    content = content.replace(
      /(    volumes:\n)/,
      '$1      - /var/run/docker.sock:/var/run/docker.sock\n'
    );
  } else if (mode === 'dind') {
    // 在 restart: 行之前插入 privileged: true
    content = content.replace(
      /(\n    restart:)/,
      '\n    privileged: true$1'
    );
  }
  // mode === 'none': 不需要额外操作

  fs.writeFileSync(composePath, content, 'utf8');
}

/**
 * 获取 volume 摘要信息（用于显示）
 * @param {Object} volumes - volume 配置
 * @returns {Array} - volume 信息数组
 */
function getVolumeSummary(volumes) {
  return Object.keys(volumes).map(key => ({
    key,
    name: VOLUME_NAMES[key.replace(/-.*$/, '')] || key,
    volume: key,
    path: volumes[key]
  }));
}

module.exports = {
  DEFAULT_VOLUMES,
  VOLUME_NAMES,
  getInstanceVolumes,
  getVolumesFromConfig,
  updateComposeVolumes,
  updateComposeDockerMode,
  updateComposeCustomVolumes,
  getVolumeSummary
};
