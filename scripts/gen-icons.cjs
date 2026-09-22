// scripts/gen-icons.cjs — renders the Apex Launcher brand icon (no deps)
// Outputs: build/icon.png (512), build/icon.ico (16/32/48/256), build/tray.png (32)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const C1 = [99, 102, 241];   // indigo  #6366f1  (top)
const C2 = [147, 51, 234];   // purple  #9333ea  (bottom)
const WHITE = [246, 246, 252];

function distSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

// Signed distance in logical [0,size]x[0,size] space to the glyph strokes (neg = inside)
function glyphDist(u, v, size) {
  const cx = size / 2, topY = size * 0.26, baseY = size * 0.87, barY = size * 0.55;
  const halfSpan = size * 0.34, barHalf = size * 0.205, tw = size * 0.165;
  const dLeft = distSeg(u, v, cx - halfSpan, baseY, cx, topY) - tw / 2;
  const dRight = distSeg(u, v, cx + halfSpan, baseY, cx, topY) - tw / 2;
  const dBar = distSeg(u, v, cx - barHalf, barY, cx + barHalf, barY) - tw / 2;
  return Math.min(dLeft, dRight, dBar);
}

// Coverage 0..1 at logical position (u,v)
function sample(u, v, size, tray) {
  if (tray) {
    const d = glyphDist(u, v, size);
    return d < 0 ? 2 : 0;
  }
  const cx = size / 2, r = size * 0.21;
  const dx = Math.abs(u - cx) - (size / 2 - r);
  const dy = Math.abs(v - cx) - (size / 2 - r);
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  const mask = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
  const cov = mask < 0 ? 1 : 0;
  if (!cov) return 0;
  if (glyphDist(u, v, size) < 0) return 2; // glyph
  return 1; // background
}

function render(size, { tray } = {}) {
  const S = 3;
  const out = Buffer.alloc(size * size * 4);
  let glyphPx = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0, bg = 0, gl = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = x + (sx + 0.5) / S;
          const v = y + (sy + 0.5) / S;
          const c = sample(u, v, size, tray);
          if (c === 0) continue;
          hits++;
          if (c === 2) gl++;
          else bg++;
        }
      }
      const o = (y * size + x) * 4;
      if (hits === 0) continue;
      const cov = hits / (S * S);
      const fy = y / size, fx = x / size;
      if (tray || gl > 0) {
        const base = tray ? [0, 0, 0, 0] : bgColor(fx, fy);
        const gcov = gl / hits;
        let r = base[0] + (WHITE[0] - base[0]) * gcov;
        let g = base[1] + (WHITE[1] - base[1]) * gcov;
        let b = base[2] + (WHITE[2] - base[2]) * gcov;
        out[o] = r; out[o + 1] = g; out[o + 2] = b;
        out[o + 3] = Math.round((tray ? cov * (1.0) : Math.min(1, (bg + gl) / (S * S))) * 255);
        if (tray && gl > 0) glyphPx++;
        continue;
      }
      const c0 = bgColor(fx, fy);
      out[o] = c0[0]; out[o + 1] = c0[1]; out[o + 2] = c0[2];
      out[o + 3] = Math.round(cov * 255);
    }
  }
  return { out, glyphPx };
}

function bgColor(fx, fy) {
  const t = fy;
  let r = C1[0] + (C2[0] - C1[0]) * t;
  let g = C1[1] + (C2[1] - C1[1]) * t;
  let b = C1[2] + (C2[2] - C1[2]) * t;
  const sheen = Math.max(0, 1 - fy * 4) * 18;
  const side = (1 - Math.abs(fx - 0.5) * 1.6) * 6;
  r = Math.min(255, r + sheen + side);
  g = Math.min(255, g + sheen + side);
  b = Math.min(255, b + sheen + side);
  return [r, g, b];
}

// ── PNG encoder ───────────────────────────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ── ICO encoder (PNG entries) ─────────────────────────────
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const parts = [header];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.size >= 256 ? 0 : img.size;
    entry[1] = img.size >= 256 ? 0 : img.size;
    entry[2] = 0; entry[3] = 0;
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.data.length;
    parts.push(entry);
  }
  for (const img of images) parts.push(img.data);
  return Buffer.concat(parts);
}

const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });

const png512 = encodePng(render(512).out, 512);
fs.writeFileSync(path.join(buildDir, "icon.png"), png512);
console.log("build/icon.png", png512.length, "bytes");

const ico = encodeIco([16, 32, 48, 256].map((s) => ({ size: s, data: encodePng(render(s).out, s) })));
fs.writeFileSync(path.join(buildDir, "icon.ico"), ico);
console.log("build/icon.ico", ico.length, "bytes");

const trayRes = render(32, { tray: true });
const tray = encodePng(trayRes.out, 32);
fs.writeFileSync(path.join(buildDir, "tray.png"), tray);
console.log("build/tray.png", tray.length, "bytes, glyph pixels:", trayRes.glyphPx);
console.log("TRAY_B64=" + tray.toString("base64"));