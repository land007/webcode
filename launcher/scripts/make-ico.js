'use strict';
/**
 * 用 sips（macOS 内置）把 icon.png 缩放成多尺寸，再打包成 ICO 文件。
 * ICO 格式规范：每个子图用 PNG 字节直接嵌入（Windows Vista+ 支持）。
 */
const fs  = require('fs');
const os  = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT     = path.join(__dirname, '..');
const SRC_PNG  = path.join(ROOT, 'assets', 'icon.png');
const DEST_ICO = path.join(ROOT, 'assets', 'icon.ico');
const TMP      = path.join(os.tmpdir(), 'webcode-ico-tmp');

const SIZES = [16, 32, 48, 64, 128, 256];

fs.mkdirSync(TMP, { recursive: true });

// 1. 生成各尺寸 PNG
const images = SIZES.map(size => {
  const out = path.join(TMP, `icon_${size}.png`);
  execSync(`sips -z ${size} ${size} "${SRC_PNG}" --out "${out}"`, { stdio: 'pipe' });
  return { size, data: fs.readFileSync(out) };
});

// 2. 组装 ICO（ICONDIR + ICONDIRENTRY[] + PNG data）
const count      = images.length;
const headerSize = 6;
const entrySize  = 16;
let   offset     = headerSize + count * entrySize;

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = 1 (icon)
header.writeUInt16LE(count, 4);

const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0); // width  (0 means 256)
  e.writeUInt8(size === 256 ? 0 : size, 1); // height (0 means 256)
  e.writeUInt8(0, 2);  // colorCount
  e.writeUInt8(0, 3);  // reserved
  e.writeUInt16LE(1,  4); // planes
  e.writeUInt16LE(32, 6); // bitCount
  e.writeUInt32LE(data.length, 8);  // bytesInRes
  e.writeUInt32LE(offset, 12);      // imageOffset
  offset += data.length;
  return e;
});

const ico = Buffer.concat([header, ...entries, ...images.map(i => i.data)]);
fs.writeFileSync(DEST_ICO, ico);
fs.rmSync(TMP, { recursive: true });

console.log(`icon.ico created: ${DEST_ICO} (${(ico.length / 1024).toFixed(1)} KB)`);
