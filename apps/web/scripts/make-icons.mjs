/**
 * Generate the app icons.
 *
 *   node scripts/make-icons.mjs
 *
 * Committed as a script rather than as three mystery PNGs: the icon is drawn
 * from the same tokens as the app (page violet, frame violet, measurement
 * green), so if those move the icon can be regenerated instead of redrawn.
 *
 * The mark is the instrument, not a letter: a Bloch sphere with its equator and
 * a state vector on it. That is the one picture this product is about, and it
 * reads at 16px because it is three shapes.
 *
 * PNG is encoded by hand — zlib is in Node, and a flat RGBA image needs nothing
 * else. Pulling in an image library for one build artefact is not worth a
 * dependency.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "..", "public");

/* -- Tokens, from styles/tokens.css (night) ---------------------------------- */
const PAGE = [0x14, 0x0a, 0x2b];
const FRAME = [0x9d, 0x7f, 0xd6];
const MEASURE = [0x46, 0xe6, 0xa8];

/* -- A very small PNG encoder ------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of w*h*4 */
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 are compression, filter and interlace — all zero.

  // One filter byte (0 = None) in front of every scanline.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const src = y * w * 4;
    const dst = y * (1 + w * 4);
    raw[dst] = 0;
    rgba.copy ? rgba.copy(raw, dst + 1, src, src + w * 4) : Buffer.from(rgba).copy(raw, dst + 1, src, src + w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -- Drawing ------------------------------------------------------------------ */

/**
 * Coverage of a pixel by a shape, sampled 3x3.
 *
 * Antialiasing by supersampling: at 192px an aliased circle looks like a
 * cog, and this icon is mostly curves.
 */
function coverage(x, y, inside) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
    }
  }
  return hits / 9;
}

function blend(out, i, colour, alpha) {
  if (alpha <= 0) return;
  for (let c = 0; c < 3; c++) {
    out[i + c] = Math.round(out[i + c] * (1 - alpha) + colour[c] * alpha);
  }
  out[i + 3] = 255;
}

function draw(size, { padding = 0 } = {}) {
  const out = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const inner = size / 2 - padding;

  // Sphere geometry, in units of the inner box.
  const R = inner * 0.62;          // sphere radius
  const RING = Math.max(1.5, size * 0.018);  // outline weight
  const EQ_RY = R * 0.30;          // equator ellipse minor axis
  // The state vector: up and to the right, on the surface.
  const vx = cx + R * 0.60;
  const vy = cy - R * 0.62;
  const VEC = Math.max(2, size * 0.032);

  const onCircle = (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return Math.abs(d - R) <= RING / 2;
  };
  // Distance to an ellipse, normalised by the gradient. Scaling the implicit
  // value directly gives a band that is thin at the poles and fat at the sides,
  // which is what made the equator bulge out past the sphere.
  const EQ_RX = R * 0.94;
  const onEquator = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const f = (dx * dx) / (EQ_RX * EQ_RX) + (dy * dy) / (EQ_RY * EQ_RY) - 1;
    const grad = 2 * Math.hypot(dx / (EQ_RX * EQ_RX), dy / (EQ_RY * EQ_RY));
    if (grad === 0) return false;
    return Math.abs(f / grad) <= RING / 2;
  };
  // Thick line segment from the centre to the state, with a round cap.
  const onVector = (x, y) => {
    const ax = vx - cx, ay = vy - cy;
    const t = Math.max(0, Math.min(1, ((x - cx) * ax + (y - cy) * ay) / (ax * ax + ay * ay)));
    const px = cx + ax * t, py = cy + ay * t;
    return Math.hypot(x - px, y - py) <= VEC / 2;
  };
  const onTip = (x, y) => Math.hypot(x - vx, y - vy) <= VEC * 1.15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Ground. Full-bleed: maskable icons are cropped to a circle by the OS,
      // and a transparent corner there shows the launcher wallpaper through it.
      out[i] = PAGE[0]; out[i + 1] = PAGE[1]; out[i + 2] = PAGE[2]; out[i + 3] = 255;

      blend(out, i, FRAME, coverage(x, y, onEquator) * 0.85);
      blend(out, i, FRAME, coverage(x, y, onCircle));
      blend(out, i, MEASURE, coverage(x, y, onVector));
      blend(out, i, MEASURE, coverage(x, y, onTip));
    }
  }
  return out;
}

/* -- Write -------------------------------------------------------------------- */

mkdirSync(PUBLIC, { recursive: true });

const OUTPUTS = [
  // Maskable icons are cropped to a circle on Android, so the mark is drawn
  // inside the safe zone rather than edge to edge.
  ["icon-192.png", 192, { padding: 192 * 0.11 }],
  ["icon-512.png", 512, { padding: 512 * 0.11 }],
  ["apple-touch-icon.png", 180, { padding: 180 * 0.08 }],
  ["favicon-32.png", 32, { padding: 1 }],
];

for (const [name, size, opts] of OUTPUTS) {
  const png = encodePng(size, size, draw(size, opts));
  writeFileSync(path.join(PUBLIC, name), png);
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
