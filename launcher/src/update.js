'use strict';

const { spawn } = require('child_process');
const https = require('https');

// ─── Helper functions ─────────────────────────────────────────────────────────────

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

// Global cancellation flag for update checks
let updateCheckCancelled = false;

/**
 * Cancel the ongoing update check.
 */
function cancelUpdateCheck() {
  updateCheckCancelled = true;
}

/**
 * Reset the cancellation flag.
 */
function resetUpdateCheckCancel() {
  updateCheckCancelled = false;
}

// ─── Container Version Detection ───────────────────────────────────────────────

/**
 * Get the local container image digest using docker inspect.
 * @param {string} imageName  e.g. 'land007/webcode:latest'
 * @returns {Promise<string|null>}  Digest string or null if not found
 */
function getLocalContainerDigest(imageName) {
  console.log('[getLocalContainerDigest] ========== START ==========');
  console.log('[getLocalContainerDigest] imageName:', imageName);

  return new Promise((resolve) => {
    try {
      const env = Object.assign({}, process.env, { PATH: buildDockerPath() });
      console.log('[getLocalContainerDigest] PATH set, length:', env.PATH ? env.PATH.length : 0);

      console.log('[getLocalContainerDigest] About to spawn docker command...');
      const proc = spawn('docker', ['inspect', '--format={{index .RepoDigests 0}}', imageName], { env });
      let stdout = '';
      let stderr = '';
      let completed = false;

      console.log('[getLocalContainerDigest] Process spawned, PID:', proc.pid);
      console.log('[getLocalContainerDigest] Waiting for events...');

      proc.stdout.on('data', (d) => {
        const chunk = d.toString();
        console.log('[getLocalContainerDigest] stdout data:', chunk.length, 'bytes, content:', chunk.substring(0, 50));
        stdout += chunk;
      });

      proc.stderr.on('data', (d) => {
        const chunk = d.toString();
        console.log('[getLocalContainerDigest] stderr data:', chunk);
        stderr += chunk;
      });

      proc.on('close', (code) => {
        console.log('[getLocalContainerDigest] ========== CLOSE ===========');
        console.log('[getLocalContainerDigest] exit code:', code);
        console.log('[getLocalContainerDigest] stdout total:', stdout.length, 'bytes');
        console.log('[getLocalContainerDigest] stdout:', stdout);
        console.log('[getLocalContainerDigest] stderr:', stderr);
        completed = true;
        if (code === 0 && stdout.trim()) {
          console.log('[getLocalContainerDigest] ✓ SUCCESS, resolving digest');
          resolve(stdout.trim());
        } else {
          console.log('[getLocalContainerDigest] ✗ FAILED, resolving null');
          resolve(null);
        }
      });

      proc.on('exit', (code) => {
        console.log('[getLocalContainerDigest] exit event, code:', code);
      });

      proc.on('error', (err) => {
        console.log('[getLocalContainerDigest] ========== ERROR ============');
        console.log('[getLocalContainerDigest] error:', err);
        console.log('[getLocalContainerDigest] error message:', err.message);
        console.log('[getLocalContainerDigest] error code:', err.code);
        completed = true;
        resolve(null);
      });

      // Timeout after 2 seconds
      const timeout = setTimeout(() => {
        console.log('[getLocalContainerDigest] ========== TIMEOUT ==========');
        console.log('[getLocalContainerDigest] Timeout! completed:', completed);
        if (!completed) {
          console.log('[getLocalContainerDigest] Killing process...');
          proc.kill('SIGKILL');
          resolve(null);
        }
      }, 2000);

      proc.on('exit', () => {
        clearTimeout(timeout);
      });
    } catch (err) {
      console.log('[getLocalContainerDigest] ========== EXCEPTION ========');
      console.log('[getLocalContainerDigest] Exception during spawn:', err);
      resolve(null);
    }
  });
}

/**
 * Get the remote container image digest using docker manifest inspect.
 * Tries Docker Hub first, then falls back to ghcr.io.
 * @param {string} imageName  e.g. 'land007/webcode:latest'
 * @returns {Promise<string|null>}  Digest string or null if failed
 */
function getRemoteContainerDigest(imageName) {
  const ghcrImage = 'ghcr.io/land007/webcode:latest';

  return new Promise((resolve) => {
    let completed = false;

    // Check if cancelled before starting
    if (updateCheckCancelled) {
      resolve(null);
      return;
    }

    const env = Object.assign({}, process.env, { PATH: buildDockerPath() });
    console.log('[getRemoteContainerDigest] ========== START ==========');
    console.log('[getRemoteContainerDigest] Trying Docker Hub first...');

    // Declare proc2 variable before overall timeout references it
    let proc2 = null;

    // Try Docker Hub first
    const proc = spawn('docker', ['manifest', 'inspect', imageName], { env });
    let stdout = '';
    let stderr = '';

    const finish = (result) => {
      if (!completed) {
        completed = true;
        console.log('[getRemoteContainerDigest] Finished, result:', result ? 'SUCCESS' : 'FAILED');
        resolve(result);
      }
    };

    proc.stdout.on('data', (d) => {
      const chunk = d.toString();
      console.log('[getRemoteContainerDigest] Docker Hub stdout:', chunk.length, 'bytes');
      stdout += chunk;
    });

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      console.log('[getRemoteContainerDigest] Docker Hub stderr:', chunk);
      stderr += chunk;
    });

    proc.on('close', (code) => {
      console.log('[getRemoteContainerDigest] Docker Hub close, code:', code);

      // Check if cancelled
      if (updateCheckCancelled) {
        finish(null);
        return;
      }

      if (code === 0 && stdout.trim()) {
        const digest = parseManifestDigest(stdout);
        if (digest) {
          console.log('[getRemoteContainerDigest] ✓ Docker Hub SUCCESS, digest:', digest.substring(0, 20) + '...');
          finish(digest);
          return;
        }
      }

      // Check if cancelled before trying ghcr.io
      if (updateCheckCancelled) {
        finish(null);
        return;
      }

      console.log('[getRemoteContainerDigest] Docker Hub failed, trying ghcr.io...');

      // Docker Hub failed, try ghcr.io
      const proc2 = spawn('docker', ['manifest', 'inspect', ghcrImage], { env });
      let stdout2 = '';
      let stderr2 = '';

      proc2.stdout.on('data', (d) => {
        const chunk = d.toString();
        console.log('[getRemoteContainerDigest] ghcr.io stdout:', chunk.length, 'bytes');
        stdout2 += chunk;
      });

      proc2.stderr.on('data', (d) => {
        const chunk = d.toString();
        console.log('[getRemoteContainerDigest] ghcr.io stderr:', chunk);
        stderr2 += chunk;
      });

      proc2.on('close', (code2) => {
        console.log('[getRemoteContainerDigest] ghcr.io close, code:', code2);
        if (code2 === 0 && stdout2.trim()) {
          const digest = parseManifestDigest(stdout2);
          if (digest) {
            console.log('[getRemoteContainerDigest] ✓ ghcr.io SUCCESS, digest:', digest.substring(0, 20) + '...');
            finish(digest);
          } else {
            console.log('[getRemoteContainerDigest] ✗ ghcr.io parse failed');
            finish(null);
          }
        } else {
          console.log('[getRemoteContainerDigest] ✗ ghcr.io failed');
          finish(null);
        }
      });

      proc2.on('error', (err) => {
        console.log('[getRemoteContainerDigest] ghcr.io error:', err);
      });

      proc2.on('exit', () => {
        clearTimeout(overallTimeout);
      });
    });

    proc.on('error', (err) => {
      console.log('[getRemoteContainerDigest] Docker Hub error:', err);
      finish(null);
    });

    // Overall timeout: 60 seconds for both attempts (manifest inspect is slow in China)
    const overallTimeout = setTimeout(() => {
      if (!completed) {
        console.log('[getRemoteContainerDigest] OVERALL TIMEOUT (60s)');
        proc.kill('SIGKILL');
        if (proc2) {
          proc2.kill('SIGKILL');
        }
        finish(null);
      }
    }, 60000);

    proc.on('exit', () => {
      // Don't clear timeout here - proc2 might still be running
    });
  });
}

/**
 * Parse digest from docker manifest inspect output.
 * @param {string} output  JSON output from docker manifest inspect
 * @returns {string|null}  Digest string or null
 */
function parseManifestDigest(output) {
  try {
    const manifest = JSON.parse(output.trim());
    // Get the digest for the current platform (amd64 or arm64)
    const platform = process.arch === 'arm64' ? 'arm64' : 'amd64';
    for (const manifestData of manifest.manifests || []) {
      if (manifestData.platform && manifestData.platform.architecture === platform) {
        return manifestData.digest;
      }
    }
    // Fallback to first manifest if platform not found
    if (manifest.manifests && manifest.manifests[0]) {
      return manifest.manifests[0].digest;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
}

/**
 * Compare two digest strings to check if they represent different images.
 * @param {string} digest1
 * @param {string} digest2
 * @returns {boolean}
 */
function digestsDiffer(digest1, digest2) {
  // If local digest is null (no local image), consider it as "update available"
  // User needs to pull the image
  if (!digest1 && digest2) {
    console.log('[digestsDiffer] No local image found, update available');
    return true;
  }
  // If remote digest is null (network error), can't determine
  if (!digest2) {
    console.log('[digestsDiffer] Remote digest unavailable, skipping check');
    return false;
  }
  // Compare digests
  const hash1 = digest1.replace(/^sha256:/, '').substring(0, 12);
  const hash2 = digest2.replace(/^sha256:/, '').substring(0, 12);
  const differs = hash1 !== hash2;
  console.log('[digestsDiffer] Comparing digests:', hash1, 'vs', hash2, '→', differs);
  return differs;
}

// ─── Launcher Version Detection ─────────────────────────────────────────────────

/**
 * Get the current launcher version from package.json.
 * @returns {string}  Version string (e.g. '1.0.0')
 */
function getLauncherVersion() {
  try {
    const packagePath = require('path').join(__dirname, '..', 'package.json');
    const pkg = require(packagePath);
    return pkg.version || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

/**
 * Get the latest launcher release version from GitHub releases API.
 * Tries direct GitHub API first, then falls back to ghproxy mirror.
 * @returns {Promise<string|null>}  Latest version string or null if failed
 */
function getLatestLauncherRelease() {
  return new Promise((resolve) => {
    // Check if cancelled before starting
    if (updateCheckCancelled) {
      resolve(null);
      return;
    }

    console.log('[getLatestLauncherRelease] Trying GitHub API directly...');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/land007/webcode/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'webcode-launcher'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        // Check if cancelled during data reception
        if (updateCheckCancelled) {
          req.destroy();
          resolve(null);
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        if (updateCheckCancelled) {
          resolve(null);
          return;
        }
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            const tagName = release.tag_name || '';
            // Remove 'v' prefix if present
            const version = tagName.replace(/^v/, '');
            console.log('[getLatestLauncherRelease] ✓ GitHub API SUCCESS, version:', version);
            resolve(version);
          } catch (e) {
            console.log('[getLatestLauncherRelease] ✗ GitHub API parse failed');
            tryGhproxyMirror();
          }
        } else {
          console.log('[getLatestLauncherRelease] ✗ GitHub API status:', res.statusCode);
          tryGhproxyMirror();
        }
      });
    });

    req.on('error', (err) => {
      console.log('[getLatestLauncherRelease] ✗ GitHub API error:', err.message);
      tryGhproxyMirror();
    });

    req.setTimeout(10000, () => {
      if (!updateCheckCancelled) {
        req.destroy();
      }
      console.log('[getLatestLauncherRelease] ✗ GitHub API TIMEOUT');
      tryGhproxyMirror();
    });

    req.end();

    // Fallback to ghproxy mirror
    function tryGhproxyMirror() {
      if (updateCheckCancelled) {
        resolve(null);
        return;
      }

      console.log('[getLatestLauncherRelease] Trying ghproxy mirror...');
      // Use ghproxy to access GitHub API
      const mirrorUrl = 'https://mirror.ghproxy.com/https://api.github.com/repos/land007/webcode/releases/latest';

      https.get(mirrorUrl, {
        headers: {
          'User-Agent': 'webcode-launcher'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          if (updateCheckCancelled) {
            res.destroy();
            resolve(null);
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (updateCheckCancelled) {
            resolve(null);
            return;
          }
          if (res.statusCode === 200) {
            try {
              const release = JSON.parse(data);
              const tagName = release.tag_name || '';
              const version = tagName.replace(/^v/, '');
              console.log('[getLatestLauncherRelease] ✓ ghproxy SUCCESS, version:', version);
              resolve(version);
            } catch (e) {
              console.log('[getLatestLauncherRelease] ✗ ghproxy parse failed');
              resolve(null);
            }
          } else {
            console.log('[getLatestLauncherRelease] ✗ ghproxy status:', res.statusCode);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        console.log('[getLatestLauncherRelease] ✗ ghproxy error:', err.message);
        resolve(null);
      }).setTimeout(15000, () => {
        console.log('[getLatestLauncherRelease] ✗ ghproxy TIMEOUT');
        resolve(null);
      });
    }
  });
}

/**
 * Compare two version strings using semver-like comparison.
 * @param {string} v1  Current version
 * @param {string} v2  Latest version
 * @returns {boolean}  True if v2 > v1
 */
function versionsDiffer(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p2 > p1) return true;
    if (p2 < p1) return false;
  }
  return false;
}

// ─── Main Update Check Function ────────────────────────────────────────────────

/**
 * Check for both container and launcher updates.
 * @param {Object} cfg  Configuration object
 * @param {Function} onProgress  Optional callback for progress updates (step: string, message: string)
 * @returns {Promise<Object>}  Update status object:
 *   - containerUpdate: boolean
 *   - launcherUpdate: boolean
 *   - remoteDigest: string|null
 *   - remoteVersion: string|null
 *   - localDigest: string|null
 *   - localVersion: string|null
 *   - cancelled: boolean
 */
async function checkForUpdates(cfg, onProgress) {
  const imageName = 'land007/webcode:latest';

  // Reset cancellation flag at start
  resetUpdateCheckCancel();

  // Check local container digest
  if (onProgress) onProgress('container-local', 'checking');
  const localDigest = await getLocalContainerDigest(imageName);

  if (updateCheckCancelled) {
    return { containerUpdate: false, launcherUpdate: false, cancelled: true };
  }

  // Check remote container digest
  if (onProgress) onProgress('container-remote', 'checking');
  const remoteDigest = await getRemoteContainerDigest(imageName);

  if (updateCheckCancelled) {
    return {
      containerUpdate: false,
      launcherUpdate: false,
      localDigest,
      cancelled: true
    };
  }

  const containerUpdate = digestsDiffer(localDigest, remoteDigest);

  console.log('[checkForUpdates] Container update check:');
  console.log('[checkForUpdates]   localDigest:', localDigest ? localDigest.substring(0, 30) + '...' : 'null');
  console.log('[checkForUpdates]   remoteDigest:', remoteDigest ? remoteDigest.substring(0, 30) + '...' : 'null');
  console.log('[checkForUpdates]   containerUpdate:', containerUpdate);

  // Check launcher update
  if (onProgress) onProgress('launcher', 'checking');
  const localVersion = getLauncherVersion();
  const remoteVersion = await getLatestLauncherRelease();

  if (updateCheckCancelled) {
    return {
      containerUpdate: false,
      launcherUpdate: false,
      localDigest,
      localVersion,
      cancelled: true
    };
  }

  const launcherUpdate = remoteVersion && versionsDiffer(localVersion, remoteVersion);

  if (onProgress) onProgress('complete', 'done');

  return {
    containerUpdate,
    launcherUpdate,
    remoteDigest,
    remoteVersion,
    localDigest,
    localVersion,
    cancelled: false
  };
}

// ─── Container Update Function ─────────────────────────────────────────────────

/**
 * Update the container by stopping, pulling, and restarting.
 * @param {Object} cfg  Configuration object (used for docker operations)
 * @param {Function} onData  Callback for progress updates (data: string)
 * @param {Function} onClose  Callback when complete (exitCode: number)
 * @returns {Object}  Process object
 */
function updateContainer(cfg, onData, onClose) {
  const { dockerDown, dockerUp } = require('./app.js');

  // Execute the update sequence
  async function performUpdate() {
    try {
      // Step 1: Stop container
      onData && onData('Stopping container...\n');
      await new Promise((resolve, reject) => {
        dockerDown(cfg, (data) => onData && onData(data), (code) => {
          if (code === 0) resolve();
          else reject(new Error(`docker down failed with code ${code}`));
        });
      });

      // Step 2: Pull new image (dockerUp handles pulling)
      onData && onData('Pulling latest image...\n');
      await new Promise((resolve, reject) => {
        dockerUp(cfg, (data) => onData && onData(data), (code) => {
          if (code === 0) resolve();
          else reject(new Error(`docker up failed with code ${code}`));
        });
      });

      // Complete
      if (onClose) onClose(0);
    } catch (err) {
      if (onData) {
        onData(`\n❌ Update failed: ${err.message}\n`);
      }
      if (onClose) onClose(1);
    }
  }

  // Start the update process
  performUpdate();

  // Return a mock process object for compatibility
  return {
    kill: () => {
      // Can't easily cancel async operations, but this is for API compatibility
    }
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────────

module.exports = {
  checkForUpdates,
  updateContainer,
  getLocalContainerDigest,
  getRemoteContainerDigest,
  getLauncherVersion,
  getLatestLauncherRelease,
  digestsDiffer,
  versionsDiffer,
  cancelUpdateCheck,
  resetUpdateCheckCancel,
};
