#!/usr/bin/env node
/**
 * test-supervisor.js
 * 本地测试脚本：验证能否从宿主机通过 docker exec 获取容器内 supervisor 进程状态
 *
 * 用法：node launcher/test-supervisor.js [容器名称]
 *
 * 示例：node launcher/test-supervisor.js
 *       node launcher/test-supervisor.js webcode
 */

'use strict';

const { spawn } = require('child_process');

const containerName = process.argv[2] || 'webcode';

console.log(`\n测试目标容器：${containerName}`);
console.log('执行：docker exec ' + containerName + ' supervisorctl status all\n');
console.log('─'.repeat(60));

const proc = spawn('docker', ['exec', containerName, 'supervisorctl', 'status', 'all'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (d) => {
  const text = d.toString();
  process.stdout.write(text);
  stdout += text;
});

proc.stderr.on('data', (d) => {
  const text = d.toString();
  process.stderr.write('\x1b[31m[stderr] ' + text + '\x1b[0m');
  stderr += text;
});

proc.on('close', (code) => {
  console.log('─'.repeat(60));
  console.log(`\n退出码：${code}`);

  if (stderr.includes('unix_http_server') || stderr.includes('supervisorctl section')) {
    console.log('\n\x1b[33m⚠ 诊断：supervisord.conf 缺少 [unix_http_server] 配置段。\x1b[0m');
    console.log('解决方法：在 supervisord.conf 中添加：');
    console.log('  [unix_http_server]');
    console.log('  file=/tmp/supervisor.sock');
    console.log('  chmod=0700');
    console.log('\n  [supervisorctl]');
    console.log('  serverurl=unix:///tmp/supervisor.sock');
    console.log('\n  [rpcinterface:supervisor]');
    console.log('  supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface');
    return;
  }

  if (code !== 0 && !stdout.trim()) {
    console.log('\n\x1b[31m✗ 命令失败。可能的原因：\x1b[0m');
    console.log('  1. 容器 "' + containerName + '" 未运行（docker ps 查看）');
    console.log('  2. supervisord 未在容器内运行');
    console.log('  3. docker 未安装或未在 PATH 中');
    return;
  }

  // 解析输出
  const VALID_STATES = new Set(['RUNNING', 'STOPPED', 'STARTING', 'FATAL', 'EXITED', 'UNKNOWN', 'BACKOFF']);
  const lines = stdout.trim().split('\n');
  const services = [];

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
    if (match && VALID_STATES.has(match[2].toUpperCase())) {
      services.push({ name: match[1], state: match[2].toUpperCase(), detail: match[3] || '' });
    }
  }

  if (services.length === 0) {
    console.log('\n\x1b[33m⚠ 未解析到任何服务状态行。\x1b[0m');
    return;
  }

  console.log(`\n\x1b[32m✓ 成功解析 ${services.length} 个服务：\x1b[0m`);
  for (const svc of services) {
    const color = svc.state === 'RUNNING' ? '\x1b[32m' :
                  svc.state === 'STARTING' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${color}● ${svc.state}\x1b[0m  ${svc.name}  ${svc.detail}`);
  }
});
