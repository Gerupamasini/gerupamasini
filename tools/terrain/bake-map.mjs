#!/usr/bin/env node
// Bakes the 東なぎさ (kasai_west) terrain: height.png (16-bit height split into R/G) and substrate.png (index in R).
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

// 東なぎさ: a flat enclosed by a U of stone levee (捨石の導流堤) open to the bay in the south. Outside the levee the
// water is deep; inside, the flat climbs from the mouth to an upper sand berm against the levee's inner toe, with
// sand bars standing out of it and creeks running in from the mouth (after the aerial photos of the enclosure).
const LV = mapDef.levee;
const PATH = LV.path;
const PATH_LEN = [0];
for (let i = 1; i < PATH.length; i++) PATH_LEN.push(PATH_LEN[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
const TOTAL = PATH_LEN[PATH_LEN.length - 1];
/** nearest point of the levee's centre line: distance and the arc length from the first tip */
function leveeNearest(x, z) {
  let best = 1e9, s = 0;
  for (let i = 1; i < PATH.length; i++) {
    const [ax, az] = PATH[i - 1], [bx, bz] = PATH[i];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    const u = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
    const d = Math.hypot(x - ax - vx * u, z - az - vz * u);
    if (d < best) { best = d; s = PATH_LEN[i - 1] + u * Math.sqrt(L2); }
  }
  return { d: best, s };
}
// the enclosure: the levee's line closed across the mouth from tip to tip
const MOUTH = [PATH[PATH.length - 1], PATH[0]];
function insideEnclosure(x, z) {
  let inside = false;
  const poly = PATH;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** distance to the mouth's line (tip to tip) */
function mouthDist(x, z) {
  const [[ax, az], [bx, bz]] = MOUTH;
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const u = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
  return Math.hypot(x - ax - vx * u, z - az - vz * u);
}

/** a field of rounded boulders (cellular): ~1 at a stone's top, falling to 0 in the gaps between stones */
function boulders(x, z) {
  const C = 1.3, ix = Math.floor(x / C), iz = Math.floor(z / C);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = (ix + i + 0.15 + 0.7 * dhash(ix + i, iz + j, 11)) * C, cz = (iz + j + 0.15 + 0.7 * dhash(ix + i, iz + j, 12)) * C;
    const d = Math.hypot(x - cx, z - cz) / C;
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return smooth(0, 0.35, f2 - f1) * (1 - 0.5 * smooth(0.2, 0.7, f1));
}
/** the levee: its height where it stands and how much of the ground it claims (0..1) */
function leveeAt(x, z) {
  const { d, s } = leveeNearest(x, z);
  const tipDist = Math.min(s, TOTAL - s);
  // the crest sinks toward each tip, the last stretch a drowned heap of stones
  const sink = smooth(LV.tip_m, 0, tipDist);
  const crestH = LV.crest_tp_m - 3.4 * sink + 0.15 * fbm(s / 6 + 3, d / 4, 2);
  const run = (crestH + 2.6) / LV.slope;
  const reach = LV.crest_half_m + run;
  if (d > reach + 1) return { h: -9, m: 0, d };
  // a rounded crest, straight rubble faces, a little roughness of the stones
  const t = clamp((d - LV.crest_half_m) / run, 0, 1);
  const h = crestH - (crestH + 2.6) * t + 0.12 * fbm(x / 1.6 + 7, z / 1.6 - 3, 2) + 0.32 * (boulders(x, z) - 0.5);
  return { h, m: 1 - smooth(reach - 2, reach + 1, d), d };
}

// the base surface: inside the enclosure, the flat rising from the mouth to the north; outside, the bay floor
const SEA = -2.4;
function baseInside(x, z) {
  const s = mouthDist(x, z);
  return -1.05 + 1.45 * Math.pow(smooth(0, 250, s), 0.85);
}
function baseProfile(x, z) {
  if (insideEnclosure(x, z)) return baseInside(x, z);
  // outside: the bay, shoaling only off the mouth, where the flat's own sediment spills out
  const md = mouthDist(x, z);
  return lerp(-1.0, SEA, smooth(0, 40, md)) + 0.08 * fbm(x / 30, z / 30, 2);
}
/** 0 outside the enclosure (the bay), 1 well inside it: where the flat's relief, creeks and pools belong */
function flatMask(x, z) {
  const inside = insideEnclosure(x, z);
  const { d } = leveeNearest(x, z);
  const off = smooth(LV.crest_half_m + 4, LV.crest_half_m + 14, d);
  return inside ? off : off * (1 - smooth(0, 25, mouthDist(x, z)));
}

// the upper berm: clean sand heaped against the levee's inner toe, standing above the ordinary high water (dry most
// of the time: the strandline and the reeds are up here), broadest along the sheltered north, thinning to the tips.
// Returns how much berm is here (0..1) and the height its top stands at.
function berm(x, z) {
  if (!insideEnclosure(x, z)) return { k: 0, top: 0 };
  const { d, s } = leveeNearest(x, z);
  const along = smooth(10, 80, Math.min(s, TOTAL - s));
  const width = 7 + 9 * smooth(-0.3, 0.6, fbm(s / 30 + 4, 1.7, 2));
  const k = along * smooth(LV.crest_half_m + 6 + width, LV.crest_half_m + 4 + 0.5 * width, d);
  return { k, top: 1.45 + 0.2 * fbm(x / 14 + 2, z / 14 - 7, 2) - 0.25 * smooth(LV.crest_half_m + 4, LV.crest_half_m + 6 + width, d) };
}

// sand bars: the pale banks standing out of the flat (dry at most tides), after the aerial views
const BARS = [
  { pts: [[-96, 60], [-80, 74], [-50, 84], [-10, 94], [32, 102], [58, 112]], w: 13, h: 1.25 },   // the long spit
  { pts: [[22, 44], [58, 38], [92, 54], [108, 84]], w: 11, h: 1.05 },                             // the south-east bank
  { pts: [[-98, -62], [-84, -34], [-74, -6], [-76, 18]], w: 15, h: 1.15 },                         // the west bank
  { pts: [[44, -70], [70, -60], [96, -44]], w: 9, h: 0.95 },                                       // a low bank in the north-east
];
/** how much bar is here (0..1) and the height its crest stands at */
function barAt(x, z) {
  let k = 0, top = 0;
  for (const b of BARS) {
    for (let i = 1; i < b.pts.length; i++) {
      const [ax, az] = b.pts[i - 1], [bx, bz] = b.pts[i];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const u = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
      const d = Math.hypot(x - ax - vx * u, z - az - vz * u);
      // tapering at the ends, a ragged edge
      const end = Math.min(i - 1 + u, b.pts.length - 1 - (i - 1 + u));
      const w = b.w * (0.55 + 0.45 * smooth(0, 1.2, end)) * (1 + 0.25 * fbm(x / 9 + 11, z / 9 - 2, 2));
      const kk = smooth(w, w * 0.3, d);
      if (kk > k) { k = kk; top = b.h * (0.8 + 0.2 * smooth(0, 1.5, end)); }
    }
  }
  return { k, top };
}

// ------------------------------------------------------------------ tidal creeks: a dendritic network
// Trunks come in through the mouth and run up the flat, meandering and branching as they go, each branch narrower and
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
    let nx = px + Math.sin(h) * step, nz = pz + Math.cos(h) * step;
    // a sand bar turns the creek aside: it runs along the bar's flank instead of cutting through it
    for (let k = 1; k <= 12 && barAt(nx, nz).k > 0.15; k++) {
      const turn = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.27;
      nx = px + Math.sin(h + turn) * step; nz = pz + Math.cos(h + turn) * step;
      if (barAt(nx, nz).k <= 0.15) h += turn;
    }
    if (barAt(nx, nz).k > 0.15) break;
    // stay off the levee and inside the enclosure (the trunks start just outside the mouth)
    if (Math.abs(nx) > half - 6 || Math.abs(nz) > half - 2) break;
    if (leveeNearest(nx, nz).d < LV.crest_half_m + 18) break;
    if (len > 20 && !insideEnclosure(nx, nz) && mouthDist(nx, nz) > 12) break;
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
// the trunks are laid out by hand after the aerial photos: the main creek comes in between the spit's end and the east
// tip, winds through the middle of the enclosure to its sheltered north; a second runs up the east side; a short
// one drains the mouth. Each meanders a little about its line, and branches grow off it at random.
const TRUNKS = [
  { pts: [[80, 160], [72, 122], [46, 96], [10, 72], [-28, 58], [-52, 34], [-50, -4], [-28, -34], [2, -62], [22, -92]], w: [12, 3.5], d: [0.85, 0.3] },
  { pts: [[10, 72], [16, 30], [6, -6], [30, -34], [58, -24]], w: [7, 2.5], d: [0.55, 0.2] },
  { pts: [[72, 122], [98, 100], [112, 62], [112, 14], [100, -22]], w: [8, 2.5], d: [0.6, 0.2] },
  { pts: [[-10, 160], [-6, 128], [-40, 116]], w: [7, 3], d: [0.5, 0.25] },
];
for (const tr of TRUNKS) {
  const phase = crand() * 100;
  const lens = [0];
  for (let i = 1; i < tr.pts.length; i++) lens.push(lens[i - 1] + Math.hypot(tr.pts[i][0] - tr.pts[i - 1][0], tr.pts[i][1] - tr.pts[i - 1][1]));
  const total = lens[lens.length - 1];
  let prev = null, sinceBranch = 0, side = 1;
  for (let a = 0; a <= total; a += 2.5) {
    let i = 1;
    while (i < lens.length - 1 && lens[i] < a) i++;
    const u = (a - lens[i - 1]) / (lens[i] - lens[i - 1]);
    const [ax, az] = tr.pts[i - 1], [bx, bz] = tr.pts[i];
    const tx = (bx - ax) / (lens[i] - lens[i - 1]), tz = (bz - az) / (lens[i] - lens[i - 1]);
    const off = 4.5 * gnoise(a / 26 + phase, 3.3) + 1.5 * gnoise(a / 9 + phase, 7.1);
    const p = [ax + (bx - ax) * u - tz * off, az + (bz - az) * u + tx * off];
    const t = a / total;
    const w = lerp(tr.w[0], tr.w[1], t), d = lerp(tr.d[0], tr.d[1], t);
    if (prev) SEGS.push({ x0: prev[0], z0: prev[1], x1: p[0], z1: p[1], w, d, along: a, phase });
    prev = p;
    sinceBranch += 2.5;
    if (sinceBranch > 22 && w > 3 && crand() < 0.2 && insideEnclosure(p[0], p[1])) {
      const heading = Math.atan2(tx, tz) + side * (0.7 + 0.6 * crand());
      growCreek(p[0], p[1], heading, 1, 40 + 50 * crand(), w * 0.5, d * 0.65, a);
      side = -side;
      sinceBranch = 0;
    }
  }
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

// tide pools: seeded hollows on the banks, clear of the creeks and the levee, inside the enclosure
const POOLS = [];
{
  let tries = 0;
  while (POOLS.length < 14 && tries++ < 600) {
    const cx = (crand() * 2 - 1) * (half - 25), cz = (crand() * 2 - 1) * (half - 30);
    if (!insideEnclosure(cx, cz) || leveeNearest(cx, cz).d < 30) continue;
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
  return h;
}

// random relief (the Minecraft-like part): seeded, domain-warped gradient noise at four scales plus ridged sand waves.
// Amplitudes are tidal-flat sized (tens of centimetres), so the flat keeps its slope but gets hummocks, hollows that
// hold water, and low bars that break the plane.
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
  return h;
}

function height(x, z) {
  const fm = flatMask(x, z);
  let h = baseProfile(x, z);
  // the bars and the berm stand on the flat; the relief roughens it all
  const bar = barAt(x, z);
  const barK = bar.k * fm;
  h += barK * Math.max(0, bar.top - h);
  h += relief(x, z) * fm;
  const bm = berm(x, z);
  h = lerp(h, Math.max(h, bm.top), bm.k);
  const ck = creekAt(x, z);
  // the banks: the flat rises away from the creeks (a low dome between them), then the creek cuts in
  h += 0.09 * smooth(0, DOME_R, ck.dist) * fm;
  h += dimples(x, z) * fm * (1 - smooth(0.2, 0.6, barK));
  for (const p of POOLS) {
    const rx = (x - p.cx) * Math.cos(p.rot) - (z - p.cz) * Math.sin(p.rot), rz = (x - p.cx) * Math.sin(p.rot) + (z - p.cz) * Math.cos(p.rot);
    const dx = rx / p.rx, dz = rz / p.rz;
    h -= p.depth * Math.exp(-(dx * dx + dz * dz) * 1.3);
  }
  h -= ck.depth * (0.35 + 0.65 * fm);
  // the levee: everything is blended into its rubble faces
  const lv = leveeAt(x, z);
  if (lv.m > 0) h = lerp(h, Math.max(h, lv.h), lv.m);
  return clamp(h, -3.45, 5.9);
}

const PALETTE = mapDef.substrate.palette; // ['sand','muddy_sand','mud','gravel','channel','rock']
const idx = Object.fromEntries(PALETTE.map((p, i) => [p, i]));

/**
 * Substrate from a continuous "mudness" score, so sand and mud separate the way they do on a real flat: mud settles in
 * sheltered hollows, around the creeks and on the low flat; sand holds the bars, the slopes and the berm. Large-scale
 * zones (seeded noise) and a little edge roughness keep the boundaries organic.
 *   rel   local height above the surrounding 12 m (m): hollows negative, hummocks positive
 *   slope local gradient
 */
function mudness(x, z, h, rel, slope) {
  const ch = channel(x, z);
  const [wx, wz] = warp(x, z, 120, 25);
  const zone = gfbm(wx / 140 + 77, wz / 140 - 31, 3);           // -1..1 large patches
  let m = 0.47;
  m += 0.24 * zone;
  m -= 2.4 * clamp(rel, -0.15, 0.15);                             // hollows collect fines, highs are winnowed
  m -= 0.22 * clamp((h + 0.4) / 1.2, -1, 1);                      // the lower flat is muddier
  m -= 1.6 * clamp(slope, 0, 0.12);                               // current-swept slopes stay sandy
  m += 0.55 * (ch ? ch.weight : 0);                               // creek margins
  m -= 0.7 * smooth(0.25, 0.7, barAt(x, z).k);                      // the bars are clean sand
  m -= 0.6 * smooth(0.2, 0.6, berm(x, z).k);                       // and so is the berm
  m += 0.09 * fbm(x / 9 + 13, z / 9 - 41, 2);                     // ragged edges
  m += 0.32 * mudZone(x, z);                                       // the sheltered mud flat
  if (!insideEnclosure(x, z)) m += 0.15;                          // the bay floor outside: silt
  return m;
}

// a 泥干潟: the sheltered middle of the enclosure (where the photos show the dark flat), soft-edged and ragged
const MUD_ZONE = { cx: 20, cz: -35, rx: 55, rz: 38, rot: -0.3 };
function mudZone(x, z) {
  const c = Math.cos(MUD_ZONE.rot), sn = Math.sin(MUD_ZONE.rot);
  const rx = ((x - MUD_ZONE.cx) * c - (z - MUD_ZONE.cz) * sn) / MUD_ZONE.rx, rz = ((x - MUD_ZONE.cx) * sn + (z - MUD_ZONE.cz) * c) / MUD_ZONE.rz;
  const r = Math.hypot(rx, rz) + 0.18 * fbm(x / 22 + 5, z / 22 - 9, 2);
  return smooth(1.0, 0.7, r);
}

function substrate(x, z, h, m) {
  // the levee is built of stone; its drowned tips too
  const lv = leveeAt(x, z);
  if (lv.m > 0.5 && lv.d < LV.crest_half_m + (lv.h + 2.6) / LV.slope - 1.0) return idx.rock;
  const ch = channel(x, z);
  if (ch && ch.weight > 0.5 && ch.depth > 0.07) return idx.channel;
  // shell grit and gravel along the strandline of the berm
  const n2 = fbm(x / 12 + 50, z / 12 - 20, 3);
  if (h > 1.15 && n2 > 0.45) return idx.gravel;
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
console.log(`creek segments: ${SEGS.length}`);
console.log(`intertidal (−1.1..1.1 m): ${(100 * intertidalCells / (N * N)).toFixed(1)}% of the map`);
if (lo < hmin || hi > hmax) { console.error('height out of encoded range'); process.exit(1); }
