'use strict';
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const ROOT     = __dirname;
const DISTDIR  = path.join(ROOT, '..', 'dist');  // webcode/dist/ — outside srcDir
const STAGEDIR = path.join(os.tmpdir(), 'webcode-launcher-stage');  // prod-only sources
const BUILDDIR = path.join(os.tmpdir(), 'webcode-launcher-build');  // nwbuild output
const CACHE    = path.join(ROOT, '.nw-cache');

const argPlatform = process.argv[2];
const argArch     = process.argv[3];

const ALL_TARGETS = [
  { platform: 'osx',   arch: 'arm64' },
  { platform: 'osx',   arch: 'x64'   },
  { platform: 'win',   arch: 'x64'   },
  { platform: 'linux', arch: 'x64'   },
  { platform: 'linux', arch: 'arm64' },
];

const targets = (argPlatform && argArch)
  ? [{ platform: argPlatform, arch: argArch }]
  : ALL_TARGETS;

/** Copy app sources (excluding devDependencies) to a staging directory. */
function prepareStage() {
  console.log(`\n==> Preparing staging dir: ${STAGEDIR}`);
  fs.rmSync(STAGEDIR, { recursive: true, force: true });
  fs.mkdirSync(STAGEDIR, { recursive: true });

  // Copy source files (exclude node_modules, dist, .nw-cache, build artifacts)
  const EXCLUDE = new Set(['node_modules', '.nw-cache', 'dist', 'build.js', 'build.sh', 'scripts']);
  for (const entry of fs.readdirSync(ROOT)) {
    if (EXCLUDE.has(entry)) continue;
    fs.cpSync(path.join(ROOT, entry), path.join(STAGEDIR, entry), { recursive: true });
  }

  // Install production dependencies only
  console.log('    npm install --omit=dev ...');
  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: STAGEDIR, stdio: 'inherit' });
}

async function build(nwbuild, platform, arch) {
  const outDir = path.join(BUILDDIR, `${platform}-${arch}`);
  console.log(`\n==> Building ${platform}-${arch} → ${outDir}`);

  const appOptions =
    platform === 'win'
      ? {
          name: 'webcode',
          version: '1.0.0',
          fileDescription: 'webcode Launcher',
          fileVersion: '1.0.0.0',
          productVersion: '1.0.0.0',
          productName: 'webcode',
          languageCode: 1033,
          icon: path.join(ROOT, 'assets', 'icon.ico'),
        }
      : platform === 'linux'
        ? {
            name: 'webcode',
            genericName: 'webcode Launcher',
            comment: 'Browser-accessible dev environment, powered by Docker',
            icon: path.join(ROOT, 'assets', 'icon.png'),
            categories: ['Development', 'Utility'],
            startupNotify: true,
          }
        : /* osx */ {
            name: 'webcode',
            CFBundleIdentifier: 'io.github.land007.webcode',
            CFBundleName: 'webcode',
            CFBundleDisplayName: 'webcode',
            CFBundleSpokenName: 'webcode',
            CFBundleVersion: '1.0.0',
            CFBundleShortVersionString: '1.0.0',
            LSApplicationCategoryType: 'public.app-category.developer-tools',
            NSHumanReadableCopyright: 'Copyright © 2024 land007',
            icon: path.join(ROOT, 'assets', 'icon.icns'),
          };

  await nwbuild({
    mode: 'build',
    version: 'stable',
    flavor: 'normal',
    platform,
    arch,
    srcDir: STAGEDIR,
    glob: false,
    outDir,
    cacheDir: CACHE,
    cache: true,
    app: appOptions,
    logLevel: 'info',
  });
}

(async () => {
  const { default: nwbuild } = await import('nw-builder');
  fs.mkdirSync(DISTDIR,  { recursive: true });
  fs.mkdirSync(BUILDDIR, { recursive: true });

  prepareStage();

  for (const { platform, arch } of targets) {
    await build(nwbuild, platform, arch);
  }

  console.log('\n==> Zipping outputs...');
  for (const { platform, arch } of targets) {
    const name    = `webcode-launcher-${platform}-${arch}`;
    const srcDir  = path.join(BUILDDIR, `${platform}-${arch}`);
    const zipFile = path.join(DISTDIR,  `${name}.zip`);
    execSync(`cd "${srcDir}" && zip -qr "${zipFile}" .`, { shell: true });
    console.log(`    Zipped: ${zipFile}`);
  }

  console.log('\nAll builds complete.');
})();
