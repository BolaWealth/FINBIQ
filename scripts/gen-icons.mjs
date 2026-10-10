// Generates FINBIQ PWA icons (no dependencies — uses Node zlib).
// Run: node scripts/gen-icons.mjs  (writes apps/web/public/icons/*.png)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "web", "public", "icons");
mkdirSync(outDir, { recursive: true });

// Brand: deep purple bg, gold ring, white block "F".
const PURPLE = [91, 33, 182];
const GOLD = [201, 162, 39];
const WHITE = [255, 255, 255];

function roundedMask(x, y, s, r) {
  const corners = [
    [r, r], [s - r, r], [r, s - r], [s - r, s - r],
  ];
  if (x >= r && x < s - r) return true;
  if (y >= r && y < s - r) return true;
  for (const [cx, cy] of corners) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

// Block-letter F from rectangles, relative coords 0..1.
function inF(u, v) {
  const bar = u > 0.30 && u < 0.44; // vertical stem
  const top = v > 0.22 && v < 0.32 && u >= 0.30 && u < 0.70; // top arm
  const mid = v > 0.45 && v < 0.54 && u >= 0.30 && u < 0.62; // mid arm
  const stem = bar && v >= 0.22 && v < 0.78;
  return stem || top || mid;
}

function render(size, { ring = true, bg = PURPLE } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const ringR = size * 0.30;
  const ringW = size * 0.035;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = [0, 0, 0, 0]; // transparent outside rounded square
      if (roundedMask(x + 0.5, y + 0.5, size, r)) {
        px = [...bg, 255];
        const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (ring && Math.abs(dist - ringR) < ringW) px = [...GOLD, 255];
        if (inF((x + 0.5) / size, (y + 0.5) / size)) px = [...WHITE, 255];
      }
      buf.set(px, (y * size + x) * 4);
    }
  }
  return buf;
}

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, opts) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const px = render(size, opts);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter byte: none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(join(outDir, "icon-192.png"), png(192, {}));
writeFileSync(join(outDir, "icon-512.png"), png(512, {}));
writeFileSync(join(outDir, "maskable-512.png"), png(512, { ring: false }));
writeFileSync(join(outDir, "apple-touch-icon.png"), png(180, {}));
console.log("icons written to", outDir);
