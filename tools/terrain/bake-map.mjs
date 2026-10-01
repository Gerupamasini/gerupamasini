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

// ------------------------------------------------------------------ noise (seeded value + gradient noise, fbm, domain warp)
const SEED = (mapDef.seed ?? 20261001) >>> 0;
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
/** Perlin gradient noise in [-1, 1]: rounder hills and hollows than value noise */
function gnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g = (cx, cy, dx, dy) => { const t = hash2(cx * 3 + 11, cy * 3 + 7) * Math.PI * 2; return Math.cos(t) * dx + Math.sin(t) * dy; };
  const n00 = g(ix, iy, fx, fy), n10 = g(ix + 1, iy, fx - 1, fy), n01 = g(ix, iy + 1, fx, fy - 1), n11 = g(ix + 1, iy + 1, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
}
/** fractal value noise in [-1, 1] */
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
/** fractal gradient noise in [-1, 1] */
function gfbm(x, y, oct = 4, gain = 0.5) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * gnoise(x * f + i * 23.7, y * f + i * 13.9);
    norm += amp;
    amp *= gain;
    f *= 2.07;
  }
  return s / norm;
}
/** ridged noise in [0, 1]: sharp crests (sand waves, bar tops) */
function ridged(x, y, oct = 3) {
  let s = 0, amp = 0.6, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * (1 - Math.abs(gnoise(x * f + i * 31.1, y * f - i * 7.7)));
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return s / norm;
}
/** domain warp: feed the coordinates through a noise displacement so hills bend and merge like real relief */
function warp(x, y, L, A) {
  return [x + A * gfbm(x / L + 5.1, y / L + 2.3, 2), y + A * gfbm(x / L - 3.7, y / L + 8.9, 2)];
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

// random relief (the Minecraft-like part): seeded, domain-warped gradient noise at four scales plus ridged sand waves.
// Amplitudes are tidal-flat sized (tens of centimetres), so the flat keeps sloping to the sea but gets hummocks, hollows
// that hold water, and low bars that break the plane.
const RELIEF = { macro: [110, 0.42], meso: [38, 0.2], fine: [11, 0.055], micro: [4.5, 0.018], ridge: [21, 0.14] };
function relief(x, z) {
  const [wx, wz] = warp(x, z, 90, 18);
  let h = RELIEF.macro[1] * gfbm(wx / RELIEF.macro[0], wz / RELIEF.macro[0], 3);
  h += RELIEF.meso[1] * gfbm(wx / RELIEF.meso[0] + 40, wz / RELIEF.meso[0] - 17, 3);
  h += RELIEF.fine[1] * gfbm(x / RELIEF.fine[0] - 9, z / RELIEF.fine[0] + 61, 2);
  h += RELIEF.micro[1] * fbm(x / RELIEF.micro[0], z / RELIEF.micro[0], 2);
  // sand waves: ridged crests, only where a large-scale mask says so (otherwise the flat is smooth)
  const mask = smooth(0.1, 0.5, gfbm(x / 75 + 300, z / 75 - 120, 2));
  h += RELIEF.ridge[1] * (ridged(wx / RELIEF.ridge[0] + 7, wz / RELIEF.ridge[0] + 3) - 0.55) * mask;
  // the sea bed far out is smoother
  return h * (1 - 0.45 * smooth(70, 150, z));
}

function height(x, z) {
  let h = baseProfile(z);
  const intertidal = smooth(-130, -115, z);
  h += relief(x, z) * intertidal;
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

/**
 * Substrate from a continuous "mudness" score, so sand and mud separate the way they do on a real flat: mud settles in
 * sheltered hollows, around the creek and runnels and on the low flat; sand holds the highs, the bar, the slopes and the
 * upper beach. Large-scale zones (seeded noise) and a little edge roughness keep the boundaries organic.
 *   rel   local height above the surrounding 12 m (m): hollows negative, hummocks positive
 *   slope local gradient
 */
function mudness(x, z, h, rel, slope) {
  const ch = channel(x, z), dr = drainage(x, z), br = barAndRunnel(x, z);
  const [wx, wz] = warp(x, z, 120, 25);
  const zone = gfbm(wx / 140 + 77, wz / 140 - 31, 3);           // -1..1 large patches
  let m = 0.47;
  m += 0.24 * zone;
  m += 0.10 * (1 - smooth(-80, 60, x));                           // the creek side (west) is muddier
  m -= 2.4 * clamp(rel, -0.15, 0.15);                             // hollows collect fines, highs are winnowed
  m -= 0.22 * clamp((h + 0.4) / 1.2, -1, 1);                      // the lower flat is muddier
  m -= 1.6 * clamp(slope, 0, 0.12);                               // current-swept slopes stay sandy
  m += 0.55 * (ch ? ch.weight : 0) + 0.45 * dr.weight;            // creek and runnel margins
  m += br.inRunnel ? 0.22 : 0;
  m -= 0.55 * smooth(0.04, 0.16, br.bar);                         // the bar is clean sand
  m -= 0.4 * smooth(0.85, 1.4, h);                                // upper beach
  m += 0.09 * fbm(x / 9 + 13, z / 9 - 41, 2);                     // ragged edges
  return m;
}

function substrate(x, z, h, m) {
  const ch = channel(x, z);
  if (ch && ch.weight > 0.55) return idx.channel;
  const n2 = fbm(x / 12 + 50, z / 12 - 20, 3);
  if (h > 0.9 && n2 > 0.5) return idx.gravel;
  if (m > 0.66) return idx.mud;
  if (m > 0.46) return idx.muddy_sand;
  return idx.sand;
}

// ------------------------------------------------------------------ bake
const hPng = new PNG({ width: N, height: N });
const sPng = new PNG({ width: N, height: N });
const hmin = mapDef.height.min_tp_m, hmax = mapDef.height.max_tp_m;
let lo = Infinity, hi = -Infinity;
const hist = new Array(PALETTE.length).fill(0);
let intertidalCells = 0;
const cell = SIZE / (N - 1);
const H = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(-half + i * cell, -half + j * cell);
// local mean height over ~12 m (separable box blur) for the relative relief used by the substrate
const R = Math.max(1, Math.round(6 / cell));
const tmp = new Float32Array(N * N), B = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  let sum = 0, cnt = 0;
  for (let i = -R; i < N; i++) {
    if (i + R < N) { sum += H[j * N + i + R]; cnt++; }
    if (i - R - 1 >= 0) { sum -= H[j * N + i - R - 1]; cnt--; }
    if (i >= 0) tmp[j * N + i] = sum / cnt;
  }
}
for (let i = 0; i < N; i++) {
  let sum = 0, cnt = 0;
  for (let j = -R; j < N; j++) {
    if (j + R < N) { sum += tmp[(j + R) * N + i]; cnt++; }
    if (j - R - 1 >= 0) { sum -= tmp[(j - R - 1) * N + i]; cnt--; }
    if (j >= 0) B[j * N + i] = sum / cnt;
  }
}
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -half + i * cell;
    const z = -half + j * cell;
    const k = j * N + i;
    const h = H[k];
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    const v = Math.round(clamp((h - hmin) / (hmax - hmin), 0, 1) * 65535);
    const o = k * 4;
    hPng.data[o] = v >> 8; hPng.data[o + 1] = v & 255; hPng.data[o + 2] = 0; hPng.data[o + 3] = 255;
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const slope = Math.hypot((H[j * N + i1] - H[j * N + i0]) / ((i1 - i0) * cell), (H[j1 * N + i] - H[j0 * N + i]) / ((j1 - j0) * cell));
    const s = substrate(x, z, h, mudness(x, z, h, h - B[k], slope));
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
