/**
 * The surf lab's beach (surf-lab.html): an ocean beach made to show what the surf does, as pure functions. Not a real
 * place. World frame as at 走水: the sea lies to +x, the shore runs along z.
 *
 * Going out from the dunes: a dry beach rising gently to a berm, a steep beach face (about 1:7, with beach cusps, the
 * shore break: waves plunge right on it), a small step and trough at its foot, a low-tide terrace at 1:20, an
 * outer bar whose crest is about a metre and a half down (the bigger waves break on it, re-form in the trough
 * behind and break again on the face), and the deeper water beyond. At the north end (−z) a rocky reef: boulders
 * standing out of the water on the terrace and a submerged ledge further out (waves strike them, the lee behind is
 * calmer, the crests bend round).
 */
export const SIZE = 96;
export const RES = 385;
export const HALF = SIZE / 2;
/** x of the 0 m line (the foot of the berm) */
export const ZERO_X = -30;
export const MIN_TP = -4.4;
export const MAX_TP = 3.4;

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function hash2(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  let fx = x - xi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/** the cross-shore profile (T.P. m) at distance d seaward of the 0 m line, the bar's crest moved by `barShift` m */
export function profile(d: number, barShift = 0): number {
  // the dunes and the dry beach: rising gently landward from the berm
  if (d < -4) return 1.3 + Math.min(1.4, (-4 - d) * 0.045) + 0.5 * sstep(16, 26, -d);
  // the face: 1:7 from the berm (1.3 m) down to the step at its foot
  let h = 1.3 - (d + 4) / 7;
  // the step and the trough at the face's foot, then the terrace at 1:20 and the deeper water at 1:35
  const foot = 1.3 - 15 / 7;   // (d = 11)
  if (d > 11) h = foot - 0.18 * sstep(11, 12.5, d) * (1 - sstep(13, 16, d)) - (d - 11) / 20;
  if (d > 38) h = foot - 27 / 20 - (d - 38) / 35;
  // the outer bar
  const b = d - 47 - barShift;
  h += 1.05 * Math.exp(-(b * b) / 22) - 0.25 * Math.exp(-((b - 8) ** 2) / 18);
  return h;
}

/** the rocks at the north end: emergent boulders on the terrace and a submerged ledge (height above the sand, m) */
export function rocksAt(x: number, z: number): number {
  const d = x - ZERO_X;
  let r = 0;
  const boulders: [number, number, number, number][] = [
    // d, z, radius, height above the sand
    [17, -30, 2.4, 2.1], [21, -27, 1.6, 1.6], [14.5, -33.5, 1.8, 1.5], [23.5, -32, 1.3, 1.1], [19, -35, 2.0, 1.8],
  ];
  for (const [bd, bz, rad, ht] of boulders) {
    const q = Math.hypot(d - bd, (z - bz) * 1.15) / rad;
    if (q < 1.25) {
      const lump = 0.85 + 0.3 * vnoise(x * 1.7, z * 1.7, 71);
      r = Math.max(r, ht * lump * Math.max(0, 1 - q * q) ** 0.6);
    }
  }
  // the ledge: a low rib running out to sea, its top a metre under the low-tide terrace
  const ld = d - 30, lz = z + 31 - 0.25 * ld;
  if (ld > -6 && ld < 16) r = Math.max(r, 0.9 * Math.exp(-(lz * lz) / 5) * sstep(-6, -2, ld) * (1 - sstep(10, 16, ld)) * (0.8 + 0.4 * vnoise(x * 0.9, z * 0.9, 73)));
  return r;
}

/** ground height (T.P. m) */
export function heightAt(x: number, z: number): number {
  const d = x - ZERO_X;
  // the bar wavers along the shore, and the face carries cusps (a crescent every 14 m or so)
  const barShift = 3.5 * (vnoise(z * 0.035 + 2.1, 0.5, 11) - 0.5) * 2;
  let h = profile(d, barShift);
  const cusp = Math.cos((z / 14) * 2 * Math.PI + 0.6 * vnoise(z * 0.05, 1.3, 13)) * 0.11;
  h += cusp * sstep(-4, -1, d) * (1 - sstep(4, 9, d));
  // a few centimetres of unevenness everywhere
  h += 0.05 * (vnoise(x * 0.2, z * 0.2, 17) - 0.5) + 0.02 * (vnoise(x * 0.9, z * 0.9, 19) - 0.5);
  return h + rocksAt(x, z);
}

/** substrate index into the palette ["sand", "muddy_sand", "mud", "gravel", "channel", "rock"] */
export function substrateAt(x: number, z: number): number {
  if (rocksAt(x, z) > 0.12) return 5;
  const d = x - ZERO_X;
  // a little gravel and shell at the step at the face's foot
  if (d > 10 && d < 12.5 && vnoise(x * 0.8, z * 0.8, 29) > 0.45) return 3;
  return 0;
}

/** the terrain grid the World builds from (no image files) */
export function makeGrid(): { n: number; size: number; heights: Float32Array; substrate: Uint8Array } {
  const n = RES, heights = new Float32Array(n * n), substrate = new Uint8Array(n * n), cell = SIZE / (n - 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -HALF + i * cell, z = -HALF + j * cell;
    heights[j * n + i] = heightAt(x, z);
    substrate[j * n + i] = substrateAt(x, z);
  }
  return { n, size: SIZE, heights, substrate };
}
