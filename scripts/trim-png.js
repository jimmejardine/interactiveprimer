// @ts-check
/**
 * Trim fully-transparent margins from a PNG, in place — so a downloaded cartoon (e.g. an
 * OpenClipart render, which sits in a large padded canvas) is cropped tight to its subject.
 *
 *   node scripts/trim-png.js <file.png> [marginPx]
 *
 * Requires an **8-bit RGBA, non-interlaced** PNG (what OpenClipart's PNG renders give). The image
 * MUST have transparency: a PNG with no alpha channel — or one that is fully opaque — is rejected
 * (pick a different, transparent clip-art instead). `marginPx` (default 6) keeps a few transparent
 * pixels around the subject so edges aren't clipped. Uses only Node's built-in `zlib` — no deps.
 * @module
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const FILE = process.argv[2];
const MARGIN = Number(process.argv[3] ?? 6);
const ALPHA = 8; // alpha above this counts as part of the subject

if (!FILE) {
  console.error("Usage: node scripts/trim-png.js <file.png> [marginPx]");
  process.exit(1);
}

/** PNG CRC-32 table + helper. */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** @param {Buffer} buf */
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** @param {string} type @param {Buffer} data */
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const png = readFileSync(FILE);
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
const [bitDepth, colorType, interlace] = [png[24], png[25], png[28]];
if (colorType !== 6) {
  console.error(
    `${FILE}: colour type ${colorType} has no alpha channel — the image is not transparent. ` +
      `Pick a different (transparent) clip-art, or re-export as RGBA.`,
  );
  process.exit(1);
}
if (bitDepth !== 8 || interlace !== 0) {
  console.error(`${FILE}: expected 8-bit, non-interlaced RGBA PNG (got bitDepth ${bitDepth}, interlace ${interlace}).`);
  process.exit(1);
}

// Gather + inflate IDAT.
let off = 8;
/** @type {Buffer[]} */
const idat = [];
while (off < png.length) {
  const len = png.readUInt32BE(off);
  if (png.toString("ascii", off + 4, off + 8) === "IDAT") idat.push(png.subarray(off + 8, off + 8 + len));
  off += 12 + len;
}
const raw = inflateSync(Buffer.concat(idat));

// Un-filter into RGBA pixels (filter types 0–4).
const bpp = 4;
const stride = w * bpp;
const px = Buffer.alloc(h * stride);
/** @param {number} a @param {number} b @param {number} c */
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < h; y++) {
  const ft = raw[y * (stride + 1)];
  const rowIn = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  const row = px.subarray(y * stride, y * stride + stride);
  const prev = y ? px.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    let v = rowIn[i];
    if (ft === 1) v += a;
    else if (ft === 2) v += b;
    else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) v += paeth(a, b, c);
    row[i] = v & 0xff;
  }
}

// Alpha bounding box.
let minX = w, minY = h, maxX = -1, maxY = -1;
let anyTransparent = false;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const alpha = px[y * stride + x * bpp + 3];
    if (alpha < 255) anyTransparent = true;
    if (alpha > ALPHA) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (!anyTransparent) {
  console.error(`${FILE}: image is fully opaque (no transparency). Pick a transparent clip-art instead.`);
  process.exit(1);
}
if (maxX < 0) {
  console.error(`${FILE}: image is entirely transparent — nothing to keep.`);
  process.exit(1);
}
minX = Math.max(0, minX - MARGIN);
minY = Math.max(0, minY - MARGIN);
maxX = Math.min(w - 1, maxX + MARGIN);
maxY = Math.min(h - 1, maxY + MARGIN);
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
if (cw === w && ch === h) {
  console.log(`${FILE}: already tight (${w}x${h}); nothing to trim.`);
  process.exit(0);
}

// Crop + re-encode (filter 0 / "none" per row).
const cstride = cw * bpp;
const out = Buffer.alloc(ch * (cstride + 1));
for (let y = 0; y < ch; y++) {
  out[y * (cstride + 1)] = 0;
  px.copy(out, y * (cstride + 1) + 1, (minY + y) * stride + minX * bpp, (minY + y) * stride + (minX + cw) * bpp);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(cw, 0);
ihdr.writeUInt32BE(ch, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
writeFileSync(
  FILE,
  Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]),
);
console.log(`${FILE}: trimmed ${w}x${h} → ${cw}x${ch}.`);
