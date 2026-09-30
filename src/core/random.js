// Deterministic PRNG + gradient noise used for individual variation and
// non-periodic "organic" modulation of motion (avoids robotic constant cycles).

export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** mulberry32 */
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  gauss() {
    // Box-Muller
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Normal distribution clamped to ±3 sigma. */
  normal(mean, sd) {
    const g = Math.max(-3, Math.min(3, this.gauss()));
    return mean + g * sd;
  }
  weighted(weights) {
    let sum = 0;
    for (const w of weights) sum += w;
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}

// ---------------------------------------------------------------------------
// 1D / 2D / 3D value-gradient noise (Perlin style), cheap and seedable.
// ---------------------------------------------------------------------------
const PERM = new Uint8Array(512);
(function initPerm() {
  const r = new RNG(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function grad1(h, x) {
  return (h & 1 ? -1 : 1) * (1 + (h & 7)) * x * 0.125;
}

/** Smooth 1D noise in approximately [-1, 1]. */
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = grad1(PERM[i & 255], f);
  const b = grad1(PERM[(i + 1) & 255], f - 1);
  return (a + (b - a) * fade(f)) * 2.0;
}

function grad3(h, x, y, z) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Classic Perlin 3D noise in approximately [-1, 1]. */
export function noise3(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;
  const l = (a, b, t) => a + t * (b - a);
  return l(
    l(
      l(grad3(PERM[AA] & 15, x, y, z), grad3(PERM[BA] & 15, x - 1, y, z), u),
      l(grad3(PERM[AB] & 15, x, y - 1, z), grad3(PERM[BB] & 15, x - 1, y - 1, z), u),
      v
    ),
    l(
      l(grad3(PERM[AA + 1] & 15, x, y, z - 1), grad3(PERM[BA + 1] & 15, x - 1, y, z - 1), u),
      l(grad3(PERM[AB + 1] & 15, x, y - 1, z - 1), grad3(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u),
      v
    ),
    w
  );
}

/** Fractal 1D noise: sum of octaves, normalised to ~[-1,1]. */
export function fbm1(x, octaves = 3) {
  let a = 0.5;
  let f = 1;
  let s = 0;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * noise1(x * f + i * 17.13);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
