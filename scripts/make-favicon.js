// @ts-check
/**
 * Generate favicon.ico — the site emblem: a "tree of knowledge" on the brand indigo, matching
 * css/primer.css (`--primer-accent: #5b6ee1`). No build step and no image dependencies: each
 * size is rendered to an RGBA buffer by simple vector primitives (supersampled 4× for smooth
 * edges), encoded as a PNG by hand (zlib + CRC32), and packed into a multi-size ICO.
 *
 *   node scripts/make-favicon.js          # (re)write favicon.ico at the repo root
 *
 * The design is resolution-independent (normalized [0,1] coordinates), so the same emblem is
 * emitted at 16/32/48 px. Re-run after tweaking the palette or shapes.
 * @module
 */

import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SIZES = [16, 32, 48];
const SS = 4; // supersampling factor → 4×4 box downsample gives anti-aliased edges

/** Brand palette (hex → [r,g,b]). Indigo backdrop from --primer-accent. */
const C = {
  bg: hex("#5b6ee1"), // brand indigo
  trunk: hex("#8a5a36"), // warm brown
  canopy: hex("#34b36a"), // leaf green
  canopyLit: hex("#63d691"), // lighter green highlight
  fruit: hex("#fff3c4"), // warm cream "knowledge"
};

/** @param {string} s @returns {[number, number, number]} */
function hex(s) {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Render the emblem at `size` px → straight-alpha RGBA Uint8Array (length size*size*4).
 * @param {number} size @returns {Uint8Array} */
function renderIcon(size) {
  const hi = size * SS;
  // High-res straight-alpha buffer.
  const buf = new Uint8Array(hi * hi * 4);

  /** Paint colour `c` (opaque) at hi-res pixel (x,y) only where the rounded-square mask allows.
   * @param {number} x @param {number} y @param {[number,number,number]} c */
  const put = (x, y, c) => {
    const i = (y * hi + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  };

  const R = 0.2; // corner radius of the rounded-square silhouette
  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const nx = (x + 0.5) / hi;
      const ny = (y + 0.5) / hi;
      if (!insideRoundRect(nx, ny, R)) continue; // outside the badge → transparent

      // Painter's order: backdrop, trunk, canopy, highlight, fruit.
      let c = C.bg;
      // Trunk: a slim vertical bar rising from the base into the canopy.
      if (nx > 0.5 - 0.06 && nx < 0.5 + 0.06 && ny > 0.5 && ny < 0.86) c = C.trunk;
      // Canopy: a bold round crown (plus two side lobes for a fuller tree).
      if (
        inCircle(nx, ny, 0.5, 0.4, 0.3) ||
        inCircle(nx, ny, 0.34, 0.46, 0.18) ||
        inCircle(nx, ny, 0.66, 0.46, 0.18)
      ) {
        c = C.canopy;
      }
      // A soft highlight on the upper-left of the crown.
      if (inCircle(nx, ny, 0.42, 0.32, 0.12)) c = C.canopyLit;
      // Two "fruit" dots — the knowledge on the tree.
      if (inCircle(nx, ny, 0.4, 0.46, 0.05) || inCircle(nx, ny, 0.6, 0.4, 0.05)) c = C.fruit;

      put(x, y, c);
    }
  }

  return downsample(buf, hi, size);
}

/** Whether (x,y) is inside a disc.
 * @param {number} x @param {number} y @param {number} cx @param {number} cy @param {number} r
 * @returns {boolean} */
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Whether (x,y) lies in the unit rounded square with corner radius `r`.
 * @param {number} x @param {number} y @param {number} r @returns {boolean} */
function insideRoundRect(x, y, r) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const nx = clamp(x, r, 1 - r);
  const ny = clamp(y, r, 1 - r);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= r * r;
}

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Box-downsample a hi-res straight-alpha RGBA buffer to `size`, compositing with PREMULTIPLIED
 * alpha so the rounded-corner edges blend cleanly (no dark fringe) against transparency.
 * @param {Uint8Array} hiBuf @param {number} hi @param {number} size
 * @returns {Uint8Array}
 */
function downsample(hiBuf, hi, size) {
  const out = new Uint8Array(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * hi + (x * SS + dx)) * 4;
          const a = hiBuf[i + 3];
          sr += hiBuf[i] * a;
          sg += hiBuf[i + 1] * a;
          sb += hiBuf[i + 2] * a;
          sa += a;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = sa ? Math.round(sr / sa) : 0;
      out[o + 1] = sa ? Math.round(sg / sa) : 0;
      out[o + 2] = sa ? Math.round(sb / sa) : 0;
      out[o + 3] = Math.round(sa / n);
    }
  }
  return out;
}

// ---- PNG encoding (8-bit RGBA, color type 6) ------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Buffer} buf @returns {number} */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG chunk: length + type + data + CRC(type+data). @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode a straight-alpha RGBA buffer as a PNG. @param {Uint8Array} rgba @param {number} size */
function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10..12: compression / filter / interlace all 0

  // Raw scanlines: a filter byte (0 = none) per row, then RGBA pixels.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- ICO container (PNG-compressed entries) -------------------------------------------------

/** Pack PNG buffers (one per size) into an ICO. @param {{size:number, png:Buffer}[]} images */
function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const e = i * 16;
    dir[e] = img.size >= 256 ? 0 : img.size; // 0 means 256
    dir[e + 1] = img.size >= 256 ? 0 : img.size;
    dir[e + 2] = 0; // palette size
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

async function main() {
  const images = SIZES.map((size) => ({ size, png: encodePng(renderIcon(size), size) }));
  const ico = buildIco(images);
  const out = new URL("favicon.ico", `file://${ROOT}`);
  await writeFile(out, ico);
  console.log(`Wrote favicon.ico (${SIZES.join(", ")} px; ${ico.length} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
