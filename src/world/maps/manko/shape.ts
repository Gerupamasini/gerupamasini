/**
 * A gameplay interpretation of the 漫湖 wetland basin (user's aerial view and photos), not a surveyed reconstruction.
 * A lake, not the sea: a lobed basin of mud and shallow water (the 200 m × 200 m playable area) ringed by dense
 * mangrove forest, opening to the north-east into the wider lake, whose far shore is forest again, with low green
 * low hills beyond, and on the east the open lake with the city on its far shore. Mangrove islands stand in the
 * basin. Entry is a raised muddy-sand bank on the east shore (no rocks on the flat).
 * One world function serves the 300 m terrain (shape inside ±150 m) and the land around it out to the horizon.
 * Axes: +x east, +z south. Heights in metres in the map datum (simulated tide ±0.85 m).
 */
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (d: number, w: number) => Math.exp(-((d / w) ** 2));
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Lobes of the basin's open water/mud (centre x, z, radius). Their union, with wobble, is the open area. */
const LOBES = [
  { x: -8, z: 4, r: 70 }, { x: -52, z: -48, r: 38 }, { x: -60, z: 48, r: 32 }, { x: 36, z: -40, r: 42 },
  { x: 28, z: 56, r: 34 }, { x: 68, z: -76, r: 30 }, { x: 44, z: 76, r: 18 }, { x: -78, z: 0, r: 22 },
  // the east side open to the lake, with a mangrove point between (the photo's dome by the water)
  { x: 76, z: -12, r: 34 }, { x: 84, z: 40, r: 26 },
];
/** The open lake to the east (user's photo from the shore: wide khaki water, a low green far shore ~420 m out
 * with the city behind). The basin's east side shelves into it; beyond x ≈ 100 it is too deep to wade. */
export const LAKE_SHORE_X = 96, FAR_SHORE_X = 430;
export function lakeOpen(x: number, z: number): number {
  const wob = 10 * (vnoise(z * 0.02, 3.3) - 0.5) + 4 * (vnoise(z * 0.07, 9.1) - 0.5);
  const near = smooth(LAKE_SHORE_X - 6, LAKE_SHORE_X + 14, x + wob);
  const far = 1 - smooth(FAR_SHORE_X - 20, FAR_SHORE_X + 10, x - 18 * (vnoise(z * 0.01, 1.7) - 0.5));
  const ends = 1 - smooth(560, 700, Math.abs(z + 60));
  return near * far * ends;
}
/** Mangrove islands in the basin (rounded domes in the aerial view). */
export const ISLANDS = [{ x: 18, z: -22, r: 7 }, { x: -40, z: 40, r: 6 }, { x: 8, z: 64, r: 6.5 }, { x: 60, z: -98, r: 6 }, { x: -50, z: -40, r: 5 }, { x: -12, z: -6, r: 4.5 }, { x: 92, z: 14, r: 7 }];
/** Limestone shore where the player arrives, the lake to the east and a mangrove dome beside it (user's photo). */
export const ENTRY = { x: 86, z: 74 };

/** 1 in the open basin/lake, 0 in the forest; the edge wobbles like the aerial view's shoreline. */
export function openness(x: number, z: number): number {
  let s = 0;
  const wob = 7 * (vnoise(x * 0.05, z * 0.05) - 0.5) + 2.5 * (vnoise(x * 0.25, z * 0.25) - 0.5);
  for (const l of LOBES) s = Math.max(s, smooth(l.r + 2, l.r - 4, Math.hypot(x - l.x, z - l.z) + wob));
  s = Math.max(s, lakeOpen(x, z));
  for (const i of ISLANDS) s *= 1 - smooth(i.r + 1.5, i.r - 1.5, Math.hypot(x - i.x, z - i.z) + wob * 0.4);
  return s;
}
/** The raised entry bank: open ground, no canopy. */
export function bankAt(x: number, z: number): number { return smooth(10, 5, Math.hypot(x - ENTRY.x, (z - ENTRY.z) * 1.4)); }

/** The main creek through the flat, draining to the lake mouth. */
export function creekZ(x: number): number { return -10 + 11 * Math.sin(x * 0.035 + 0.6) + 3 * Math.sin(x * 0.1) - Math.max(0, x - 20) * 0.55; }
/** A tributary from the south lobes. */
export function tributaryX(z: number): number { return -10 + 7 * Math.sin(z * 0.06) + 2 * Math.sin(z * 0.17); }

/** Ground (mud/rubble/lake bed) everywhere, inside and outside the terrain. */
export function groundAt(x: number, z: number): number {
  const open = Math.max(openness(x, z), bankAt(x, z)), lake = lakeOpen(x, z);
  const hummocks = 0.05 * Math.sin(x * 0.41 + Math.sin(z * 0.23)) * Math.cos(z * 0.33)
    + 0.06 * Math.sin(x * 0.11 + z * 0.17) + 0.03 * Math.sin(x * 0.9 - z * 0.7) * Math.sin(z * 0.8);
  const benches = 0.08 * smooth(0.55, 0.9, Math.sin(x * 0.07 - 1.1) * Math.sin(z * 0.09 + 0.5));
  // Basin floor: exposed mud at low water, draining gently to the north-east.
  const flat = 0.24 - (x - z) * 0.0011 + hummocks + benches;
  const creek = 0.5 * bump(z - creekZ(x), 2.4 + Math.max(0, x) * 0.025) * smooth(-96, -84, x) * (1 - lake);
  const trib = 0.22 * bump(x - tributaryX(z), 1.3) * smooth(80, 70, z) * smooth(creekZ(tributaryX(z)) - 2, creekZ(tributaryX(z)) + 4, z);
  const basin = flat - creek - trib;
  // The lake bed falls to ~1.3 m below the datum.
  const lakeBed = -1.3 + 0.1 * vnoise(x * 0.05, z * 0.05);
  // Forest floor: raised mud, then the land rising gently far away into low wooded hills.
  const r = Math.hypot(x, z), hills = 14 * smooth(800, 1400, r) * (0.6 + 0.8 * vnoise(x * 0.004, z * 0.004));
  const forest = 0.5 + 0.08 * vnoise(x * 0.2, z * 0.2) + hills;
  const water = basin + (lakeBed - basin) * smooth(0.25, 0.9, lake);
  const bank = 1.6 * smooth(9, 3, Math.hypot(x - ENTRY.x, (z - ENTRY.z) * 1.4)) + 0.4 * (vnoise(x * 0.8, z * 0.8) - 0.5) * smooth(10, 4, Math.hypot(x - ENTRY.x, z - ENTRY.z));
  return forest + (water - forest) * open + bank;
}

/** Individual crowns of the closed forest: jittered 4.6 m cells, each a rounded dome (Worley distance).
 * Returns the dome (0..1) and the crown's centre, so the canopy relief, its shading and the foliage clusters agree. */
export const CROWN_CELL = 4.6;
export function crownAt(x: number, z: number): { dome: number; cx: number; cz: number; size: number } {
  const ix = Math.floor(x / CROWN_CELL), iz = Math.floor(z / CROWN_CELL);
  let best = Infinity, cx = 0, cz = 0, size = 1;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = ix + i, gz = iz + j, px = (gx + 0.15 + 0.7 * hash(gx, gz)) * CROWN_CELL, pz = (gz + 0.15 + 0.7 * hash(gz + 17, gx)) * CROWN_CELL;
    const r = 0.8 + 0.45 * hash(gx + 5, gz + 9), d = Math.hypot(x - px, z - pz) / r;
    if (d < best) { best = d; cx = px; cz = pz; size = r; }
  }
  return { dome: Math.max(0, 1 - (best / 3.1) ** 2), cx, cz, size };
}
/** Height of the mangrove canopy above the ground (0 in the open): a 2.3-4 m roof of rounded 4-6 m crowns. */
export function canopyAt(x: number, z: number): number {
  const closed = 1 - Math.max(openness(x, z), bankAt(x, z));
  if (closed < 0.02) return 0;
  const { dome } = crownAt(x, z);
  // the far shore across the lake: taller coastal woods (8-12 m) that hide the city's feet, as in the photo
  const coast = smooth(FAR_SHORE_X - 10, FAR_SHORE_X + 20, x) * 6.5;
  return smooth(0.35, 0.85, closed) * (2.3 + coast + 1.5 * vnoise(x * 0.03 + 3, z * 0.03) + (1.6 + coast * 0.2) * Math.sqrt(dome) + 0.25 * vnoise(x * 1.1, z * 1.1));
}
/** Canopy-roof profile by depth into the forest (m from the open edge): it stays under the crowns of the real
 * front rows and rises only behind them, like the forest's own dome, never a cliff on the mud. */
export function shellProfile(depth: number): number { return smooth(9, 28, depth); }

// ------------------------------------------------------------------ the 200 m terrain
export const HALF = 150;
export const heightAt = groundAt;

/** Palette: 0 sand, 1 muddy_sand, 2 mud, 3 gravel, 4 channel. */
export function substrateAt(x: number, z: number): number {
  const e = Math.hypot(x - ENTRY.x, (z - ENTRY.z) * 1.4);
  if (e < 9) return 1;                                            // the entry bank's muddy sand
  if (lakeOpen(x, z) > 0.5) return 4;                             // lake bed
  if (openness(x, z) > 0.5) {
    if (Math.abs(z - creekZ(x)) < 1.5 + Math.max(0, x) * 0.017 && x > -88) return 4;
    if (Math.abs(x - tributaryX(z)) < 0.75 && z < 74 && z > creekZ(x)) return 4;
  }
  return 2;
}

// ------------------------------------------------------------------ depth into the forest
/** Distance (m) from the open mud/water into the closed forest, from a 2 m raster with a chamfer transform over
 * ±170 m (lazily built, ~30k cells). Drives the canopy shell's rise, the front rows of tree models and the thicket
 * the player cannot enter. Beyond the raster: deep forest where closed. */
const D_HALF = 170, D_STEP = 2, D_N = D_HALF / D_STEP * 2 + 1;
let depthRaster: Float32Array | null = null;
function buildDepth(): Float32Array {
  const d = new Float32Array(D_N * D_N);
  for (let j = 0; j < D_N; j++) for (let i = 0; i < D_N; i++) {
    const x = -D_HALF + i * D_STEP, z = -D_HALF + j * D_STEP;
    d[j * D_N + i] = Math.max(openness(x, z), bankAt(x, z)) < 0.5 ? 1e6 : 0;
  }
  const a = D_STEP, b = D_STEP * Math.SQRT2;
  for (let j = 0; j < D_N; j++) for (let i = 0; i < D_N; i++) {
    const k = j * D_N + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - D_N] + a); if (i > 0) v = Math.min(v, d[k - D_N - 1] + b); if (i < D_N - 1) v = Math.min(v, d[k - D_N + 1] + b); }
    d[k] = v;
  }
  for (let j = D_N - 1; j >= 0; j--) for (let i = D_N - 1; i >= 0; i--) {
    const k = j * D_N + i; let v = d[k];
    if (i < D_N - 1) v = Math.min(v, d[k + 1] + a);
    if (j < D_N - 1) { v = Math.min(v, d[k + D_N] + a); if (i < D_N - 1) v = Math.min(v, d[k + D_N + 1] + b); if (i > 0) v = Math.min(v, d[k + D_N - 1] + b); }
    d[k] = v;
  }
  return d;
}
export function forestDepth(x: number, z: number): number {
  depthRaster ??= buildDepth();
  const fx = (x + D_HALF) / D_STEP, fz = (z + D_HALF) / D_STEP;
  if (fx < 0 || fz < 0 || fx > D_N - 1 || fz > D_N - 1) return Math.max(openness(x, z), bankAt(x, z)) < 0.5 ? 99 : 0;
  const i = Math.min(D_N - 2, Math.floor(fx)), j = Math.min(D_N - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * D_N + i, r = depthRaster;
  const c = (n: number) => Math.min(n, 400);
  return (c(r[k]) * (1 - u) + c(r[k + 1]) * u) * (1 - v) + (c(r[k + D_N]) * (1 - u) + c(r[k + D_N + 1]) * u) * v;
}
/** The mangrove thicket: impassable beyond the front rows (its interior is the simplified canopy shell). */
export const THICKET_DEPTH = 11;
export function inThicket(x: number, z: number): boolean { return forestDepth(x, z) > THICKET_DEPTH; }
