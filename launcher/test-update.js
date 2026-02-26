const { spawn } = require('child_process');

// 测试docker inspect是否能正常完成
console.log('Test 1: Simple docker inspect');

const proc = spawn('docker', ['inspect', '--format={{index .RepoDigests 0}}', 'land007/webcode:latest']);
let stdout = '';
let stderr = '';
let closeCalled = false;
let exitCalled = false;

const startTime = Date.now();

proc.stdout.on('data', (d) => {
  console.log('stdout data:', d.toString().length, 'bytes');
  stdout += d.toString();
});

proc.stderr.on('data', (d) => {
  console.log('stderr data:', d.toString());
  stderr += d.toString();
});

proc.on('close', (code) => {
  closeCalled = true;
  const duration = Date.now() - startTime;
  console.log('[close] Code:', code, 'Duration:', duration + 'ms');
  console.log('[close] stdout length:', stdout.length);
  console.log('[close] stdout:', stdout);
  console.log('[close] stderr:', stderr);
});

proc.on('exit', (code) => {
  exitCalled = true;
  const duration = Date.now() - startTime;
  console.log('[exit] Code:', code, 'Duration:', duration + 'ms');
});

proc.on('error', (err) => {
  console.log('[error]', err);
});

setTimeout(() => {
  console.log('=== After 1s ===');
  console.log('closeCalled:', closeCalled, 'exitCalled:', exitCalled, 'stdout length:', stdout.length);
}, 1000);

setTimeout(() => {
  console.log('=== After 3s ===');
  if (!closeCalled) {
    console.log('Process still not closed, killing...');
    proc.kill();
  }
}, 3000);
