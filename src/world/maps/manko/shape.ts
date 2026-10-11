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
/** Signed distance (m) east of the near lake shore line: negative on the flat, positive over the water. */
export function shoreDist(x: number, z: number): number {
  return x + 10 * (vnoise(z * 0.02, 3.3) - 0.5) + 4 * (vnoise(z * 0.07, 9.1) - 0.5) - LAKE_SHORE_X;
}
export function lakeOpen(x: number, z: number): number {
  const near = smooth(-6, 14, shoreDist(x, z)), az = Math.abs(z + 60);
  const far = 1 - smooth(FAR_SHORE_X - 20, FAR_SHORE_X + 10, x - 18 * (vnoise(z * 0.01, 1.7) - 0.5));
  const lake = near * far * (1 - smooth(520, 640, az));
  return Math.max(lake, riverOpen(x, z));
}
/** The river (国場川) the lake is a widening of runs on past both its ends, up- and downstream: a channel narrowing to
 * ~180 m that winds away between the wooded banks to the horizon, so the lake never reads as a closed pond. */
export function riverCentre(z: number): number {
  const zc = z + 60, t = Math.max(0, Math.abs(zc) - 500);
  return (LAKE_SHORE_X + FAR_SHORE_X) / 2 + (zc < 0 ? 1 : -1) * 150 * Math.sin(t * 0.0032) + 30 * (vnoise(z * 0.004, 5.5) - 0.5) * smooth(420, 600, Math.abs(zc));
}
export function riverHalfWidth(z: number): number { return (FAR_SHORE_X - LAKE_SHORE_X) / 2 - 77 * smooth(420, 900, Math.abs(z + 60)); }
function riverOpen(x: number, z: number): number {
  const az = Math.abs(z + 60);
  if (az < 420) return 0;
  const half = riverHalfWidth(z), wob = 10 * (vnoise(x * 0.02, z * 0.02) - 0.5);
  return smooth(half + 8, half - 12, Math.abs(x - riverCentre(z)) + wob) * smooth(420, 520, az);
}
/** Mangrove islands in the basin (rounded domes in the aerial view). */
// (none on the creeks: the creek and its tributary run unbroken from the forest to the lake)
export const ISLANDS = [{ x: 18, z: -22, r: 7 }, { x: -40, z: 40, r: 6 }, { x: 8, z: 64, r: 6.5 }, { x: 60, z: -98, r: 6 }, { x: -50, z: -40, r: 5 }, { x: -30, z: 14, r: 4.5 }, { x: 92, z: 14, r: 7 }];
/** Limestone shore where the player arrives, the lake to the east and a mangrove dome beside it (user's photo). */
export const ENTRY = { x: 86, z: 74 };

/** 1 in the open basin/lake, 0 in the forest; the edge wobbles like the aerial view's shoreline. */
export function openness(x: number, z: number): number {
  let s = 0;
  const wob = 7 * (vnoise(x * 0.05, z * 0.05) - 0.5) + 2.5 * (vnoise(x * 0.25, z * 0.25) - 0.5);
  for (const l of LOBES) s = Math.max(s, smooth(l.r + 2, l.r - 4, Math.hypot(x - l.x, z - l.z) + wob));
  s = Math.max(s, lakeOpen(x, z));
  // the creek's mouth: a channel through the mangrove point to the lake
  s = Math.max(s, smooth(7 + Math.max(0, x) * 0.012, 4, Math.abs(z - creekZ(x)) + wob * 0.3) * smooth(66, 76, x) * (1 - smooth(104, 112, x)));
  for (const i of ISLANDS) s *= 1 - smooth(i.r + 1.5, i.r - 1.5, Math.hypot(x - i.x, z - i.z) + wob * 0.4);
  return s;
}
/** The raised entry bank: open ground, no canopy. */
export function bankAt(x: number, z: number): number { return smooth(10, 5, Math.hypot(x - ENTRY.x, (z - ENTRY.z) * 1.4)); }

/** The main creek through the flat, draining to the lake mouth. */
export function creekZ(x: number): number { return -10 + 11 * Math.sin(x * 0.035 + 0.6) + 3 * Math.sin(x * 0.1) - Math.max(0, x - 20) * 0.55; }
/** A tributary from the south lobes. */
export function tributaryX(z: number): number { return -10 + 7 * Math.sin(z * 0.06) + 2 * Math.sin(z * 0.17); }
/** Where the tributary joins the creek. */
export const JUNCTION = (() => {
  let best = Infinity, z = 0;
  for (let q = -40; q < 40; q += 0.02) { const d = Math.abs(q - creekZ(tributaryX(q))); if (d < best) { best = d; z = q; } }
  return { x: tributaryX(z), z };
})();
/**
 * The creeks' beds (thalwegs) fall steadily all the way to the lake, so the trickle left in them at low water runs
 * unbroken from the forest to the lake: the creek from its head in the west forest, the tributary from the south
 * forest down to the junction (m, map datum).
 */
export function creekBed(x: number): number { return x < -80 ? -0.12 + 0.012 * (-80 - x) : -0.12 - 0.0022 * (x + 80); }
export function tributaryBed(z: number): number { return creekBed(JUNCTION.x) + 0.0045 * (z - JUNCTION.z); }
/** The creek's floor down the mouth into the lake (its running minimum, so the trickle only ever falls), lazily tabled. */
let mouthTable: Float32Array | null = null;
function mouthFloor(x: number): number {
  if (!mouthTable) {
    mouthTable = new Float32Array(81);
    let low = Infinity;
    for (let i = 0; i <= 80; i++) { const xx = 96 + i * 0.25; low = Math.min(low, groundAt(xx, creekZ(xx))); mouthTable[i] = low; }
  }
  const f = Math.min(80, Math.max(0, (x - 96) / 0.25)), i = Math.min(79, Math.floor(f));
  return mouthTable[i] + (mouthTable[i + 1] - mouthTable[i]) * (f - i);
}
/** The low-water trickle in the creeks: its surface (a few centimetres over the bed), or -1e3 away from them. */
export function streamLevel(x: number, z: number): number {
  let level = -1e3;
  const widen = Math.max(0, x) * 0.012, cz = creekZ(x);
  if (x > -96 && x < 114 && Math.abs(z - cz) < (x > 96 ? 2.5 + widen : 5 + widen * 2)) {
    // (the head: the trickle seeps out of the forest floor, from nothing to its few centimetres)
    level = creekBed(x) + 0.035 - 0.1 * (1 - smooth(-92, -87, x));
    // (the mouth: it runs on down the channel's floor, only centimetres deep, and gives out where the lake's own
    // water stands at an ordinary low tide; where the shelf falls away beside it, it never stands over it)
    if (x > 96) {
      level = Math.min(level, mouthFloor(x) + 0.035) - 0.1 * smooth(107, 112, x);
      if (groundAt(x, z) < level - 0.05) level = -1e3;
    }
  }
  if (z > cz + 1 && z < 82 && Math.abs(x - tributaryX(z)) < 3.5) {
    const t = tributaryBed(z) + 0.03;
    // (inside the creek's strip the tributary's surface eases into the creek's: no step where they meet)
    level = level > -1e2 ? level + (t - level) * smooth(cz + 1, cz + 5, z) : t;
  }
  return level;
}
/** The channels cut down to their thalwegs (only ever lowering the ground): soft banks, a little steeper at the water. */
function carveCreeks(x: number, z: number, g: number): number {
  const widen = Math.max(0, x) * 0.012, dc = Math.abs(z - creekZ(x));
  const along = smooth(-98, -90, x) * (1 - smooth(112, 120, x));
  // (past the flat's edge the bed steepens down the lake's shelf, so the mouth has no sill)
  const bed = creekBed(x) - 0.03 * Math.max(0, x - 98);
  if (along > 0 && dc < 9) g -= along * (1 - smooth(6, 9, dc)) * Math.max(0, g - (bed + 0.34 * smooth(0.4, 2.6 + widen * 0.8, dc)));
  const alongT = smooth(JUNCTION.z - 1, JUNCTION.z + 2, z) * (1 - smooth(78, 86, z)), dt = Math.abs(x - tributaryX(z));
  if (alongT > 0 && dt < 6) g -= alongT * (1 - smooth(4, 6, dt)) * Math.max(0, g - (tributaryBed(z) + 0.26 * smooth(0.3, 1.8, dt)));
  return g;
}

/** Ground (mud/rubble/lake bed) everywhere, inside and outside the terrain. */
export function groundAt(x: number, z: number): number {
  const open = Math.max(openness(x, z), bankAt(x, z)), lake = lakeOpen(x, z);
  const hummocks = 0.05 * Math.sin(x * 0.41 + Math.sin(z * 0.23)) * Math.cos(z * 0.33)
    + 0.06 * Math.sin(x * 0.11 + z * 0.17) + 0.03 * Math.sin(x * 0.9 - z * 0.7) * Math.sin(z * 0.8);
  const benches = 0.08 * smooth(0.55, 0.9, Math.sin(x * 0.07 - 1.1) * Math.sin(z * 0.09 + 0.5));
  // Basin floor: exposed mud at low water, draining gently to the north-east.
  // (the hummocks and benches smooth out toward the lake, where the flat leans into it)
  const flat = 0.24 - (x - z) * 0.0011 + (hummocks + benches) * (1 - 0.75 * smooth(-35, -5, shoreDist(x, z)));
  // The creeks: the flat dips gently toward them over ~12 m, and only the last few metres to the channel are
  // steeper (a soft bank, not a trench cut into the flat)
  const dc = Math.abs(z - creekZ(x)), widen = Math.max(0, x) * 0.012;
  const creek = (0.17 * bump(dc, 12 + widen * 4) + 0.3 * (1 - smooth(1 + widen, 6.5 + widen * 1.5, dc))) * smooth(-96, -84, x) * (1 - lake);
  const dt = Math.abs(x - tributaryX(z));
  const trib = (0.07 * bump(dt, 7) + 0.16 * (1 - smooth(0.6, 3, dt))) * smooth(80, 70, z) * smooth(creekZ(tributaryX(z)) - 2, creekZ(tributaryX(z)) + 4, z);
  const basin = flat - creek - trib;
  // The lake bed falls to ~1.3 m below the datum.
  const lakeBed = -1.3 + 0.1 * vnoise(x * 0.05, z * 0.05);
  // Forest floor: raised mud, then the land rising gently far away into low wooded hills.
  const r = Math.hypot(x, z), hills = 14 * smooth(800, 1400, r) * (0.6 + 0.8 * vnoise(x * 0.004, z * 0.004));
  const forest = 0.5 + 0.08 * vnoise(x * 0.2, z * 0.2) + hills;
  // The near shore: the flat leans gently toward the lake over ~60 m (a fifth of a metre, under 0.5%), then a bank
  // of up to ~5° runs down to the bed. The lean stays shallow so that at spring high water (+0.85) the wading
  // limit (1 m) falls on the bank, not out on the flat. Across the lake the far shore keeps a plain blend.
  const sd = shoreDist(x, z), approach = smooth(-60, 0, sd), shelf = smooth(-4, 24, sd);
  const leaned = basin - 0.18 * approach;
  const nearShore = leaned + (lakeBed - leaned) * shelf;
  // (beyond the lake's ends the river's own banks: there the bed follows the river, not the basin's near shore)
  const water = nearShore + (basin + (lakeBed - basin) * smooth(0.25, 0.9, lake) - nearShore) * Math.max(smooth(200, 260, x), smooth(540, 620, Math.abs(z + 60)));
  // (its top rolls gently: broad swells, no angular little hollows to hold puddles)
  const bank = 1.6 * smooth(9, 3, Math.hypot(x - ENTRY.x, (z - ENTRY.z) * 1.4)) + (0.22 * (vnoise(x * 0.3, z * 0.3) - 0.5) + 0.05 * (vnoise(x * 1.1 + 3, z * 1.1) - 0.5)) * smooth(10, 4, Math.hypot(x - ENTRY.x, z - ENTRY.z));
  return carveCreeks(x, z, forest + (water - forest) * open + bank);
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
/** Distance (m) from the open mud/water into the closed forest, from chamfer-transformed rasters (lazily built):
 * 2 m over ±170 m (the terrain and its edge) and 4 m over ±800 m (the land round the lake, for the background's
 * edge rows and canopy). Drives the canopy roof's rise, the rows of trees and the thicket the player cannot enter. */
interface DepthRaster { half: number; step: number; n: number; d: Float32Array }
function buildDepth(half: number, step: number): DepthRaster {
  const n = Math.round(half / step) * 2 + 1, d = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step;
    d[j * n + i] = Math.max(openness(x, z), bankAt(x, z)) < 0.5 ? 1e6 : 0;
  }
  const a = step, b = step * Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - n] + a); if (i > 0) v = Math.min(v, d[k - n - 1] + b); if (i < n - 1) v = Math.min(v, d[k - n + 1] + b); }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = d[k];
    if (i < n - 1) v = Math.min(v, d[k + 1] + a);
    if (j < n - 1) { v = Math.min(v, d[k + n] + a); if (i < n - 1) v = Math.min(v, d[k + n + 1] + b); if (i > 0) v = Math.min(v, d[k + n - 1] + b); }
    d[k] = v;
  }
  return { half, step, n, d };
}
let fine: DepthRaster | null = null, coarse: DepthRaster | null = null;
function sampleDepth(r: DepthRaster, x: number, z: number): number | null {
  const fx = (x + r.half) / r.step, fz = (z + r.half) / r.step;
  if (fx < 0 || fz < 0 || fx > r.n - 1 || fz > r.n - 1) return null;
  const i = Math.min(r.n - 2, Math.floor(fx)), j = Math.min(r.n - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * r.n + i, d = r.d;
  const c = (q: number) => Math.min(q, 400);
  return (c(d[k]) * (1 - u) + c(d[k + 1]) * u) * (1 - v) + (c(d[k + r.n]) * (1 - u) + c(d[k + r.n + 1]) * u) * v;
}
export function forestDepth(x: number, z: number): number {
  fine ??= buildDepth(170, 2);
  const f = sampleDepth(fine, x, z);
  if (f !== null) return f;
  coarse ??= buildDepth(800, 4);
  return sampleDepth(coarse, x, z) ?? (Math.max(openness(x, z), bankAt(x, z)) < 0.5 ? 99 : 0);
}
/** The mangrove thicket: impassable beyond the front rows (its interior is the simplified canopy shell). */
export const THICKET_DEPTH = 11;
export function inThicket(x: number, z: number): boolean { return forestDepth(x, z) > THICKET_DEPTH; }
