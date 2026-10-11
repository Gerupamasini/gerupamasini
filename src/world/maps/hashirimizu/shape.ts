/**
 * 走水 (Hashirimizu, toward 観音崎): the shape of the shore as pure functions, shared by the terrain bake
 * (tools/terrain/bake-hashirimizu.mjs) and the game (eelgrass, clam beds, habitat). No imports, so Node can
 * run it straight from the bake script.
 *
 * A compressed pocket shore, not a survey: 80 m of coast, a low seawall, a small sand beach and then one gentle,
 * nearly constant slope out into the bay, a touch gentler over the clam flat. World frame: the sea lies to +x (east,
 * as at 走水 the sun comes up over the water), the coast runs along z; looking out to sea, left is -z (north, toward
 * 観音崎) and right is +z (south, the thicker eelgrass).
 *
 * Distances "from the shore" (d) are measured seaward from the 0 m line, the foot of the dry beach:
 *     d < -10.6   the road and the grass behind the seawall
 *    -10.6..-10   the seawall (a low concrete revetment, ~1.3 m)
 *      -10..0     the dry sand beach
 *        0..5     beach toe and the water's edge
 *        5..12    the clam flat (a little gentler)
 *       12..22    the shallow eelgrass, walkable in chest waders
 *       22..25    the outer eelgrass, deeper
 *         25..    deeper and deeper on the same slope: the waders stop somewhere past here
 */

export const SIZE = 96;
export const RES = 385;
export const HALF = SIZE / 2;
/** x of the 0 m line */
export const ZERO_X = -22;
/** alongshore extent of the walkable shore (m either side of z = 0) */
export const ALONG = 40;
/** heights stored in the PNG span this range (T.P. metres) */
export const MIN_TP = -4.2;
export const MAX_TP = 3.4;

/** the reference tide the depths below are designed for: a typical exploring tide, a little below mean sea level */
export const REF_TIDE = -0.3;
/** ground height at 12 m (the inner edge of the eelgrass): 30 cm of water at the reference tide */
const H12 = REF_TIDE - 0.3;

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** seaward slope (drop per metre) at distance d: the beach face, then 6 %, 4 % over the clam flat, 5 % beyond */
export function slopeAt(d: number): number {
  return 0.11 + (0.06 - 0.11) * sstep(-3, 0, d) + (0.04 - 0.06) * sstep(4, 6, d) + (0.05 - 0.04) * sstep(11, 13, d);
}

const D0 = -12, D1 = 76, STEP = 0.05;
const PROFILE = (() => {
  const n = Math.round((D1 - D0) / STEP) + 1;
  const h = new Float64Array(n);
  // integrate the slope, then anchor the curve at 12 m
  for (let i = 1; i < n; i++) {
    const dm = D0 + (i - 0.5) * STEP;
    h[i] = h[i - 1] - slopeAt(dm) * STEP;
  }
  const i12 = Math.round((12 - D0) / STEP);
  const off = H12 - h[i12];
  for (let i = 0; i < n; i++) h[i] += off;
  return h;
})();

/** ground height (T.P. m) of the beach and the sea floor at distance d from the 0 m line (no seawall, no detail) */
export function profile(d: number): number {
  const u = (Math.max(D0, Math.min(D1, d)) - D0) / STEP;
  const i = Math.min(PROFILE.length - 2, Math.floor(u));
  const f = u - i;
  return PROFILE[i] * (1 - f) + PROFILE[i + 1] * f;
}

/** how far the beach and its seawall run on along the coast beyond the map, to the wooded points at either end (z) */
export const COAST_N = -116;
export const COAST_S = 284;

/** the seawall's face: its foot at d = -10, its top at -10.6 */
export const WALL_FOOT = -10;
export const WALL_TOP_D = -10.6;
export const WALL_TOP = 2.3;

export const offshore = (x: number): number => x - ZERO_X;
/** -1 at the left (north) end of the shore, +1 at the right (south) end */
export const side = (z: number): number => Math.max(-1, Math.min(1, z / ALONG));

// ------------------------------------------------------------------ deterministic noise (integer hash)
function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  let fx = x - xi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
const fbm = (x: number, z: number, seed: number): number => 0.55 * vnoise(x, z, seed) + 0.3 * vnoise(x * 2.03, z * 2.03, seed + 1) + 0.15 * vnoise(x * 4.1, z * 4.1, seed + 2);

// ------------------------------------------------------------------ ground
/**
 * Ground height (T.P. m): the profile, the seawall and the land behind it, and a few centimetres of slow alongshore
 * undulation (the slope stays one slope).
 */
export function heightAt(x: number, z: number): number {
  const d = offshore(x);
  if (d <= WALL_TOP_D) {
    // the grass and the road behind the wall, rising a little inland
    return WALL_TOP + 0.03 + Math.min(0.5, (WALL_TOP_D - d) * 0.03) + 0.05 * (vnoise(x * 0.3, z * 0.3, 41) - 0.5);
  }
  if (d < WALL_FOOT) {
    const u = (d - WALL_TOP_D) / (WALL_FOOT - WALL_TOP_D);
    return WALL_TOP + (profile(WALL_FOOT) - WALL_TOP) * sstep(0, 1, u);
  }
  let h = profile(d);
  // slow undulation along the coast: ±4 cm, fading out over the dry beach
  h += 0.08 * (fbm(z * 0.045 + 3.1, d * 0.04, 7) - 0.5) * sstep(-6, 2, d);
  // a small berm at the top of the beach, where the high tides leave their line
  h += 0.06 * Math.exp(-((d + 5.5) ** 2) / 2.5);
  return h;
}

/** substrate index into the map palette ["sand", "muddy_sand", "mud", "gravel", "channel"] */
export function substrateAt(x: number, z: number): number {
  const d = offshore(x), sd = side(z);
  if (d <= WALL_FOOT) return 3;
  // finer sediment offshore and to the right, where the eelgrass holds it
  const fines = sstep(9, 16, d) * (0.55 + 0.35 * sd) + 0.25 * (vnoise(x * 0.25, z * 0.25, 23) - 0.5) + 0.25 * sstep(26, 40, d);
  if (fines > 0.95 && sd > 0.2) return 2;
  if (fines > 0.42) return 1;
  return 0;
}

// ------------------------------------------------------------------ eelgrass
/** where eelgrass can stand at all: from the clam flat's outer edge seaward (thinning into the deep) */
export function eelgrassZone(x: number, z: number): number {
  const d = offshore(x);
  if (Math.abs(z) > ALONG + 4) return 0;
  return sstep(10.5, 12.5, d) * (1 - sstep(30, 38, d));
}

/**
 * The bed's pattern, 0..1 (thresholds: dense > 0.6, sparse > 0.53, a small clump > 0.47, else bare): going out from
 * the clam flat, a dense band, a bare strip, sparse plants, a small sandy gap, and dense again, the bands wavering and
 * broken up along the coast; denser to the right (south), thinner to the left.
 */
export function eelgrassField(x: number, z: number): number {
  const zone = eelgrassZone(x, z);
  if (zone <= 0) return 0;
  const d = offshore(x), sd = side(z);
  // the bands wander a few metres along the coast
  const dw = d + 3.2 * (vnoise(z * 0.12 + 1.7, 0.3, 31) - 0.5) * 2 + 1.4 * (vnoise(z * 0.35, d * 0.25, 37) - 0.5) * 2;
  const bands =
    0.8 * sstep(12, 13.4, dw) * (1 - sstep(16.0, 17.2, dw)) +    // the dense inner band
    0.52 * sstep(18.2, 19.2, dw) * (1 - sstep(20.4, 21.2, dw)) +   // sparse, after the bare strip
    0.8 * sstep(22.0, 23.2, dw) * (1 - sstep(29, 34, dw));          // dense again, out to the deep
  // each band is a string of clones: gaps open along the coast every several metres
  const clones = sstep(0.4, 0.56, fbm(x * 0.11 + 5.0, z * 0.15, 47));
  // patches and holes at the 2–6 m scale, so no band is ever a clean stripe
  const patch = (fbm(x * 0.22, z * 0.22, 53) - 0.5) * 0.55 + (vnoise(x * 0.6, z * 0.6, 59) - 0.5) * 0.2;
  const lean = 0.12 * sd;
  return Math.max(0, Math.min(1, (bands * (0.2 + 0.8 * clones) + patch + lean + 0.1) * zone));
}
