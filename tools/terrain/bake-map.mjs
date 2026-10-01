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
  { cx: -20, cz: -50, rx: 12, rz: 8, depth: 0.22 },
  { cx: 45, cz: 40, rx: 9, rz: 9, depth: 0.3 },
  { cx: -115, cz: 55, rx: 14, rz: 7, depth: 0.2 },
  { cx: 92, cz: -62, rx: 7, rz: 5, depth: 0.18 },
  { cx: 10, cz: 80, rx: 16, rz: 10, depth: 0.3 },
  { cx: 120, cz: 100, rx: 10, rz: 8, depth: 0.22 },
];

// ridge-and-runnel: an offshore sand bar with a trough behind it. Sea water enters the trough through notches in
// the bar, so water reaches close to the dry beach well before high tide (the "海水が手前に入ってくる" look).
const BAR = { zc: 15, amp: 8, wavelength: 60, width: 11, height: 0.22, runnelOffset: 22, runnelWidth: 8, runnelDepth: 0.28, gaps: [-60, 70], gapWidth: 6 };
function barAndRunnel(x, z) {
  const zc = BAR.zc + BAR.amp * Math.sin(x / BAR.wavelength);
  const win = smooth(-150, -120, x) * (1 - smooth(120, 150, x));
  let bar = BAR.height * Math.exp(-(((z - zc) / BAR.width) ** 2)) * win;
  let gap = 0;
  for (const gx of BAR.gaps) gap += Math.exp(-(((x - gx) / BAR.gapWidth) ** 2));
  bar *= 1 - 0.92 * Math.min(1, gap);
  const runnel = -BAR.runnelDepth * Math.exp(-(((z - (zc - BAR.runnelOffset)) / BAR.runnelWidth) ** 2)) * win;
  return { bar, runnel, inBar: bar > 0.08, inRunnel: runnel < -0.1 };
}

// 澪筋: small braided drainage channels running seaward across the flat
const RUNNELS = [
  { xs: -130, z0: -75, A: 6, L: 28, phi: 0.3 },
  { xs: -95, z0: -60, A: 9, L: 35, phi: 2.1 },
  { xs: -35, z0: -80, A: 7, L: 30, phi: 1.1 },
  { xs: 5, z0: -70, A: 10, L: 40, phi: 4.0 },
  { xs: 55, z0: -65, A: 6, L: 26, phi: 0.9 },
  { xs: 100, z0: -78, A: 8, L: 33, phi: 2.8 },
  { xs: 140, z0: -60, A: 5, L: 24, phi: 1.7 },
];
function drainage(x, z) {
  let depth = 0, weight = 0;
  for (const r of RUNNELS) {
    if (z < r.z0 - 5) continue;
    const t = clamp((z - r.z0) / 130, 0, 1);
    const xc = r.xs + r.A * Math.sin((z - r.z0) / r.L + r.phi) + 3 * fbm(z / 15 + r.phi * 7, r.xs / 50, 2);
    const w = 1.5 + 2.5 * t;
    const D = 0.06 + 0.16 * t;
    const d = Math.abs(x - xc);
    const g = Math.exp(-((d / w) ** 2)) * smooth(r.z0 - 5, r.z0 + 10, z);
    depth += D * g;
    weight = Math.max(weight, g);
  }
  return { depth: Math.min(depth, 0.26), weight };
}

function height(x, z) {
  let h = baseProfile(z);
  const intertidal = smooth(-130, -115, z);
  h += 0.12 * fbm(x / 70, z / 70, 3) * intertidal + 0.05 * fbm(x / 22, z / 22, 3) * intertidal;
  h += 0.025 * fbm(x / 4.5, z / 4.5, 2) * intertidal; // ripples
  const br = barAndRunnel(x, z);
  h += br.bar + br.runnel;
  for (const p of POOLS) {
    const dx = (x - p.cx) / p.rx, dz = (z - p.cz) / p.rz;
    h -= p.depth * Math.exp(-(dx * dx + dz * dz) * 1.3);
  }
  h -= drainage(x, z).depth;
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
  const dr = drainage(x, z);
  if (dr.weight > 0.5) return idx.mud;
  const br = barAndRunnel(x, z);
  if (br.inBar) return idx.sand;
  if (br.inRunnel) return idx.muddy_sand;
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
