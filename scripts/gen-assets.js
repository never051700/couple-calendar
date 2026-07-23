// 개발 초기 플레이스홀더 PNG 에셋 생성기 (외부 의존성 없음)
// 현재 배포 아이콘(icon-ios.png, notification-icon-android.png)은 생성하지 않습니다.
// 기존 플레이스홀더를 덮어써도 될 때만 사용: node scripts/gen-assets.js --force
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

if (!process.argv.includes('--force')) {
  console.error(
    '현재 앱 아이콘 생성기가 아닙니다. 플레이스홀더를 덮어쓰려면 --force를 사용하세요.',
  );
  process.exit(2);
}

function solidPng(width, height, [r, g, b, a]) {
  const bytesPerPixel = 4;
  const rowLen = width * bytesPerPixel + 1; // +1 filter byte
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * bytesPerPixel;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32
const crcTable = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive: true });

const BLUE = [59, 130, 246, 255];
const WHITE = [255, 255, 255, 255];

fs.writeFileSync(path.join(dir, 'icon.png'), solidPng(1024, 1024, BLUE));
fs.writeFileSync(path.join(dir, 'adaptive-icon.png'), solidPng(1024, 1024, BLUE));
fs.writeFileSync(path.join(dir, 'splash.png'), solidPng(1284, 1284, WHITE));
fs.writeFileSync(path.join(dir, 'notification-icon.png'), solidPng(96, 96, WHITE));
fs.writeFileSync(path.join(dir, 'favicon.png'), solidPng(48, 48, BLUE));

console.log(
  '플레이스홀더 생성 완료: assets/icon.png, adaptive-icon.png, splash.png, notification-icon.png, favicon.png',
);
