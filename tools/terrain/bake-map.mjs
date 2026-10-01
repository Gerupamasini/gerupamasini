#!/usr/bin/env node
// Bakes the 西のなぎさ (kasai_west) terrain: height.png (16-bit height split into R/G) and substrate.png (index in R).
//   node tools/terrain/bake-map.mjs [--map kasai_west]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const mapId = args[args.indexOf('--map') + 1] || 'kasai_west';
const mapDef = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'maps', `${mapId}.json`), 'utf8'));
const outDir = path.join(root, 'public', 'data', 'maps', mapId);

// ------------------------------------------------------------------ noise (2D simplex-like value noise, seeded)
const SEED = 20261001;
function hash2(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263 + SEED * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const u = fade(fx), v = fade(fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
/** fractal noise in [-1, 1] */
function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * (vnoise(x * f + i * 17.3, y * f - i * 9.1) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ terrain definition (T.P. metres; x east, z south)
const SIZE = mapDef.size_m;
const N = mapDef.resolution;
const half = SIZE / 2;

// beach profile along z: berm at the north, gentle intertidal slope to the south
function baseProfile(z) {
  if (z <= -150) return 2.2;
  if (z <= -125) return lerp(2.2, 0.9, (z + 150) / 25);
  return lerp(0.9, -1.9, (z + 125) / 285);
}

// tidal creek (澪) meandering on the west side, draining south
function channel(x, z) {
  if (z < -112) return 0;
  const t = clamp((z + 110) / 270, 0, 1);
  const xc = -70 + 25 * Math.sin((z + 100) / 70) + 6 * fbm(z / 40, 3.3, 2);
  const w = 3 + 5 * t;
  const D = 0.35 + 0.65 * t;
  const d = Math.abs(x - xc);
  const g = Math.exp(-(d * d) / (w * w));
  const fadeIn = smooth(-112, -95, z);
  return { depth: D * g * fadeIn, weight: g * fadeIn };
}

const POOLS = [
  { cx: -20, cz: -30, rx: 12, rz: 8, depth: 0.25 },
  { cx: 45, cz: 10, rx: 9, rz: 9, depth: 0.3 },
  { cx: -115, cz: 45, rx: 14, rz: 7, depth: 0.2 },
  { cx: 92, cz: -52, rx: 7, rz: 5, depth: 0.18 },
  { cx: 10, cz: 62, rx: 16, rz: 10, depth: 0.3 },
  { cx: 120, cz: 90, rx: 10, rz: 8, depth: 0.22 },
];

function height(x, z) {
  let h = baseProfile(z);
  const intertidal = smooth(-130, -115, z);
  h += 0.12 * fbm(x / 70, z / 70, 3) * intertidal + 0.05 * fbm(x / 22, z / 22, 3) * intertidal;
  h += 0.025 * fbm(x / 4.5, z / 4.5, 2) * intertidal; // ripples
  // sand bar with a sheltered flat behind it
  const barX = smooth(-45, -25, x) * (1 - smooth(70, 90, x));
  h += 0.12 * Math.exp(-(((z - 20) / 7) ** 2)) * barX;
  for (const p of POOLS) {
    const dx = (x - p.cx) / p.rx, dz = (z - p.cz) / p.rz;
    h -= p.depth * Math.exp(-(dx * dx + dz * dz) * 1.3);
  }
  const ch = channel(x, z);
  if (ch) h -= ch.depth;
  return h;
}

const PALETTE = mapDef.substrate.palette; // ['sand','muddy_sand','mud','gravel','channel']
const idx = Object.fromEntries(PALETTE.map((p, i) => [p, i]));

function substrate(x, z, h) {
  const ch = channel(x, z);
  if (ch && ch.weight > 0.55) return idx.channel;
  if (ch && ch.weight > 0.22) return idx.mud;
  const n = fbm(x / 25, z / 25, 3);
  const n2 = fbm(x / 12 + 50, z / 12 - 20, 3);
  if (h > 0.9 && n2 > 0.5) return idx.gravel;
  if (h > 1.0 + 0.2 * n) return idx.sand;
  if (h > 0.15 + 0.3 * n) return n2 > 0.55 && h > 0.4 ? idx.sand : idx.muddy_sand;
  return n > 0.6 && h > -0.5 ? idx.muddy_sand : idx.mud;
}

// ------------------------------------------------------------------ bake
const hPng = new PNG({ width: N, height: N });
const sPng = new PNG({ width: N, height: N });
const hmin = mapDef.height.min_tp_m, hmax = mapDef.height.max_tp_m;
let lo = Infinity, hi = -Infinity;
const hist = new Array(PALETTE.length).fill(0);
let intertidalCells = 0;
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -half + (i / (N - 1)) * SIZE;
    const z = -half + (j / (N - 1)) * SIZE;
    const h = height(x, z);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    const v = Math.round(clamp((h - hmin) / (hmax - hmin), 0, 1) * 65535);
    const o = (j * N + i) * 4;
    hPng.data[o] = v >> 8; hPng.data[o + 1] = v & 255; hPng.data[o + 2] = 0; hPng.data[o + 3] = 255;
    const s = substrate(x, z, h);
    hist[s]++;
    sPng.data[o] = s; sPng.data[o + 1] = 0; sPng.data[o + 2] = 0; sPng.data[o + 3] = 255;
    if (h > -1.1 && h < 1.1) intertidalCells++;
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'height.png'), PNG.sync.write(hPng, { colorType: 6 }));
fs.writeFileSync(path.join(outDir, 'substrate.png'), PNG.sync.write(sPng, { colorType: 6 }));
console.log(`wrote ${path.relative(root, outDir)}/height.png + substrate.png (${N}x${N}, ${SIZE} m)`);
console.log(`height range ${lo.toFixed(2)} .. ${hi.toFixed(2)} m (encoded ${hmin}..${hmax})`);
console.log('substrate:', PALETTE.map((p, i) => `${p} ${(100 * hist[i] / (N * N)).toFixed(1)}%`).join(', '));
console.log(`intertidal (−1.1..1.1 m): ${(100 * intertidalCells / (N * N)).toFixed(1)}% of the map`);
if (lo < hmin || hi > hmax) { console.error('height out of encoded range'); process.exit(1); }
