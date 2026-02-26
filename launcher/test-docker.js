const { spawn } = require('child_process');

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

const env = Object.assign({}, process.env, { PATH: buildDockerPath() });
console.log('PATH:', env.PATH);

const proc = spawn('docker', ['inspect', '--format={{index .RepoDigests 0}}', 'land007/webcode:latest'], { env });
let stdout = '';
let stderr = '';
let completed = false;

proc.stdout.on('data', (d) => { stdout += d.toString(); });
proc.stderr.on('data', (d) => { stderr += d.toString(); });

proc.on('close', (code) => {
  completed = true;
  console.log('Exit code:', code);
  console.log('stdout:', stdout);
  console.log('stderr:', stderr);
  console.log('stdout.trim() length:', stdout.trim().length);
});

proc.on('error', (err) => {
  console.log('Process error:', err);
});

setTimeout(() => {
  console.log('Still running after 2s, completed =', completed);
  if (!completed) {
    proc.kill('SIGKILL');
    console.log('Killed process');
  }
}, 2000);
