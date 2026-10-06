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

// beach profile along z: the park's land at the north, a steep earthen bank down to the sandy upper beach, then the
// gentle intertidal slope to the south (the open bay)
const BANK = { landZ: -152, landH: 5.0, footZ: -144, footH: 1.55 };
function baseProfile(z) {
  if (z <= BANK.landZ) return BANK.landH;
  if (z <= BANK.footZ) return lerp(BANK.landH, BANK.footH, (z - BANK.landZ) / (BANK.footZ - BANK.landZ));
  if (z <= -125) return lerp(BANK.footH, 0.9, (z - BANK.footZ) / (-125 - BANK.footZ));
  return lerp(0.9, -1.9, (z + 125) / 285);
}
/** 0 on the beach, 1 on the bank and the land behind it (relief, creeks and dimples stop at its foot) */
function bankMask(z) { return smooth(BANK.footZ + 3, BANK.footZ - 3, z); }

// the east and west edges: low earthen levees (渚の土塁) running from the land down toward the bay, where they sink
// away so the open sea stays open. Rounded crests, a little roughness, and the flat is blended into them.
const LEVEE = { inner: 133, crest: 147, crestH: 2.9, sinkZ0: 100, sinkZ1: 148 };
function leveeAt(x, z) {
  const ax = Math.abs(x);
  const m = smooth(LEVEE.inner, LEVEE.crest, ax);
  if (m <= 0) return { h: 0, m: 0 };
  const sink = smooth(LEVEE.sinkZ0, LEVEE.sinkZ1, z);
  const crest = LEVEE.crestH - 4.6 * sink - 0.25 * smooth(LEVEE.crest + 4, half, ax) + 0.12 * fbm(x / 7 + 3, z / 7 - 5, 2);
  return { h: Math.max(crest, baseProfile(z)), m: m * (1 - smooth(LEVEE.sinkZ1, LEVEE.sinkZ1 + 10, z)) };
}

// ------------------------------------------------------------------ tidal creeks: a dendritic network
// Trunks come in from the bay and run up the flat, meandering and branching as they go, each branch narrower and
// shallower than the one it left; the flat between creeks rises a little away from them, so at half tide the creeks
// hold water while the banks stand out — the braided, veined look of a real flat from above.
let creekRand = SEED ^ 0x5bd1e995;
function crand() { creekRand = (Math.imul(creekRand ^ (creekRand >>> 15), 2246822519) + 374761393) >>> 0; return creekRand / 4294967296; }
const SEGS = [];   // { x0, z0, x1, z1, w, d, along, phase }: along = distance from the mouth at x0, phase = this creek's own seed
function growCreek(x, z, heading, order, length, w, d, along0 = 0) {
  let px = x, pz = z, h = heading, len = 0;
  const step = 3, wiggle = 0.9 + 0.5 * crand(), phase = crand() * 100;
  let sinceBranch = 0, side = crand() < 0.5 ? 1 : -1;
  while (len < length) {
    const t = len / length;
    // meander: noise-driven bends, pulled back toward the way up the flat (north is heading π)
    const bend = 0.55 * wiggle * gnoise(len / 22 + phase, order * 3.7 + 1.3) + 0.25 * gnoise(len / 60 + phase * 2, order + 9.2);
    h += bend * 0.5 + 0.06 * Math.sin(Math.PI - h);
    const nx = px + Math.sin(h) * step, nz = pz + Math.cos(h) * step;
    if (Math.abs(nx) > half - 6 || nz < -118) break;
    const wt = w * (1 - 0.72 * t), dt = d * (1 - 0.78 * t);
    SEGS.push({ x0: px, z0: pz, x1: nx, z1: nz, w: wt, d: dt, along: along0 + len, phase });
    px = nx; pz = nz; len += step; sinceBranch += step;
    if (order < 4 && sinceBranch > 14 + 10 * order && wt > 1.6 && crand() < 0.16) {
      const ang = side * (0.55 + 0.55 * crand());
      growCreek(px, pz, h + ang, order + 1, length * (0.38 + 0.2 * crand()), wt * (0.5 + 0.15 * crand()), dt * (0.62 + 0.15 * crand()), along0 + len);
      side = -side;
      sinceBranch = 0;
    }
  }
}
// four trunks from the south edge, their mouths spread across the width
for (const [x0, len, w, d] of [[-95, 230, 11, 0.6], [-15, 250, 13, 0.7], [60, 215, 10, 0.55], [128, 180, 8, 0.45]]) {
  growCreek(x0, half - 4, Math.PI + (crand() - 0.5) * 0.4, 0, len, w, d);
}
// bucket the segments for fast lookup. A segment is listed in every bucket within DOME_R of it (the bank dome needs
// the distance to the nearest creek out to that range; past it the dome is flat, so a missing segment costs nothing).
const BUCKET = 12, NB = Math.ceil(SIZE / BUCKET) + 1, DOME_R = 28;
const buckets = Array.from({ length: NB * NB }, () => []);
for (const s of SEGS) {
  const r = Math.max(3 * s.w + 2, DOME_R + 4);
  const i0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - r + half) / BUCKET)), i1 = Math.min(NB - 1, Math.floor((Math.max(s.x0, s.x1) + r + half) / BUCKET));
  const j0 = Math.max(0, Math.floor((Math.min(s.z0, s.z1) - r + half) / BUCKET)), j1 = Math.min(NB - 1, Math.floor((Math.max(s.z0, s.z1) + r + half) / BUCKET));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * NB + i].push(s);
}
/** the creek cut at a point: depth (m) and a 0..1 weight for how much creek this is; the distance to the nearest creek */
function creekAt(x, z) {
  const bi = Math.floor((x + half) / BUCKET), bj = Math.floor((z + half) / BUCKET);
  let depth = 0, weight = 0, dist = 1e9;
  if (bi < 0 || bj < 0 || bi >= NB || bj >= NB) return { depth, weight, dist };
  for (const s of buckets[bj * NB + bi]) {
    const vx = s.x1 - s.x0, vz = s.z1 - s.z0, L2 = vx * vx + vz * vz || 1e-6;
    const u = clamp(((x - s.x0) * vx + (z - s.z0) * vz) / L2, 0, 1);
    const dx = x - (s.x0 + vx * u), dz = z - (s.z0 + vz * u);
    const dd = Math.sqrt(dx * dx + dz * dz);
    // a bank slightly ragged with noise
    const wl = s.w * (1 + 0.22 * fbm(x / 7 + 3, z / 7 - 5, 2));
    const g = Math.exp(-((dd / wl) ** 2) * 1.1);
    // scour pools along the bed: stretches where the thalweg is deeper, so the creek keeps a chain of water at low tide
    const along = s.along + u * Math.sqrt(L2);
    const scour = smooth(0.15, 0.6, gnoise(along / 16 + s.phase, s.phase * 0.37 + 2.5)) * (0.4 + 0.6 * smooth(0, 60, along));
    const cut = s.d * (0.35 + 0.65 * g) * (1 + 0.5 * scour * g) * smooth(2.2 * wl, 0.0, dd);
    if (cut > depth) depth = cut;
    if (g > weight) weight = g;
    if (dd - wl < dist) dist = dd - wl;
  }
  return { depth, weight, dist: Math.max(0, dist) };
}
function channel(x, z) {
  const c = creekAt(x, z);
  return c.depth > 0.002 ? { depth: c.depth, weight: c.weight } : 0;
}
function drainage() { return { depth: 0, weight: 0 }; }
function barAndRunnel() { return { bar: 0, runnel: 0, inBar: false, inRunnel: false }; }

// tide pools: seeded hollows on the banks, clear of the creeks, more of them low on the flat
const POOLS = [];
{
  let tries = 0;
  while (POOLS.length < 14 && tries++ < 400) {
    const cx = (crand() * 2 - 1) * (half - 25), cz = -95 + crand() * 160;
    if (creekAt(cx, cz).dist < 9) continue;
    if (POOLS.some((p) => Math.hypot(p.cx - cx, p.cz - cz) < 28)) continue;
    const r = 5 + crand() * 9;
    POOLS.push({ cx, cz, rx: r * (0.8 + 0.5 * crand()), rz: r * (0.7 + 0.5 * crand()), depth: 0.1 + crand() * 0.14, rot: crand() * Math.PI });
  }
}
// ------------------------------------------------------------------ dimples: a thin random field of hollows and humps
// A jittered grid of cells across the flat: most cells get a shallow hollow (5–20 cm deep, 6–18 m across, a little
// elongated), the rest a low hump. The hollows keep water when the tide leaves, so there is a wadeable pool within a
// short walk at any tide, and the flat reads as gently uneven rather than a plane.
const DIMPLE_CELL = 18;
function dhash(i, j, k) {
  let n = (Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 2246822519) ^ SEED) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function dimples(x, z) {
  const ci = Math.floor(x / DIMPLE_CELL), cj = Math.floor(z / DIMPLE_CELL);
  let h = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj;
    const cx = (i + 0.1 + 0.8 * dhash(i, j, 1)) * DIMPLE_CELL, cz = (j + 0.1 + 0.8 * dhash(i, j, 2)) * DIMPLE_CELL;
    const hollow = dhash(i, j, 3) < 0.7;
    const rx = 3 + 6 * dhash(i, j, 4), rz = rx * (0.6 + 0.6 * dhash(i, j, 5)), rot = dhash(i, j, 6) * Math.PI;
    const amp = hollow ? -(0.05 + 0.15 * dhash(i, j, 7)) : 0.02 + 0.04 * dhash(i, j, 7);
    const ux = (x - cx) * Math.cos(rot) - (z - cz) * Math.sin(rot), uz = (x - cx) * Math.sin(rot) + (z - cz) * Math.cos(rot);
    const q = (ux / rx) ** 2 + (uz / rz) ** 2;
    if (q > 6) continue;
    // a flat-bottomed bowl: the floor is level enough to stand in, the rim comes up in the outer third
    h += amp * (1 - smooth(0.4, 1.0, Math.sqrt(q)));
  }
  // fades on the sea bed (the pools matter where the tide leaves) and above the berm
  return h * (1 - 0.6 * smooth(80, 150, z)) * smooth(-120, -105, z);
}

// random relief (the Minecraft-like part): seeded, domain-warped gradient noise at four scales plus ridged sand waves.
// Amplitudes are tidal-flat sized (tens of centimetres), so the flat keeps sloping to the sea but gets hummocks, hollows
// that hold water, and low bars that break the plane.
const RELIEF = { macro: [120, 0.16], meso: [40, 0.09], fine: [11, 0.04], micro: [4.5, 0.014], ridge: [21, 0.05] };
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
  const intertidal = smooth(-130, -115, z) * (1 - bankMask(z));
  h += relief(x, z) * intertidal;
  const ck = creekAt(x, z);
  // the banks: the flat rises away from the creeks (a low dome between them), then the creek cuts in
  h += 0.09 * smooth(0, DOME_R, ck.dist) * intertidal * (1 - 0.6 * smooth(70, 150, z));
  h += dimples(x, z) * intertidal;
  for (const p of POOLS) {
    const rx = (x - p.cx) * Math.cos(p.rot) - (z - p.cz) * Math.sin(p.rot), rz = (x - p.cx) * Math.sin(p.rot) + (z - p.cz) * Math.cos(p.rot);
    const dx = rx / p.rx, dz = rz / p.rz;
    h -= p.depth * Math.exp(-(dx * dx + dz * dz) * 1.3);
  }
  h -= ck.depth * (1 - bankMask(z));
  // the bank itself is bare earth with a little roughness
  h += 0.06 * fbm(x / 5 + 9, z / 5 + 2, 2) * bankMask(z);
  // the side levees: the flat (creeks and all) is blended into them
  const lv = leveeAt(x, z);
  h = lerp(h, lv.h, lv.m);
  return Math.max(h, -3.45);   // the deepest trunk mouths stay inside the encoded range
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
  // the earthen bank, the land behind it and the side levees: packed earth and stone (gravel)
  const lv = leveeAt(x, z);
  if (bankMask(z) > 0.5 || (lv.m > 0.5 && lv.h > baseProfile(z) + 0.25)) return idx.gravel;
  const ch = channel(x, z);
  if (ch && ch.weight > 0.5 && ch.depth > 0.07) return idx.channel;
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
