/**
 * Seeded noise for the flat generator (CPU side, also runs inside the worker).
 * Gradient noise uses 256 hashed unit gradients (isotropic, no axis-aligned streaks); every field that needs
 * independent randomness takes its own seed, so changing one feature never reshuffles another.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit integer hash of two integers and a seed. */
export function hash2i(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

export function hash01(x: number, y: number, seed: number): number {
  return hash2i(x, y, seed) / 4294967296;
}

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** IEEE 754 half-float bits of x (rounded), for the half-float textures. */
export function toHalf(x: number): number {
  f32[0] = x;
  const b = u32[0];
  const sign = (b >>> 16) & 0x8000;
  const e = ((b >>> 23) & 0xff) - 112;
  let m = b & 0x7fffff;
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    m = (m | 0x800000) >> (1 - e);
    return sign | ((m + 0x1000) >> 13);
  }
  return (sign | (e << 10) | (m >> 13)) + ((m >> 12) & 1);
}

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Perlin-style gradient noise in about [-1, 1]. */
export class Noise2 {
  private readonly perm = new Uint16Array(512);
  private readonly gx = new Float32Array(256);
  private readonly gy = new Float32Array(256);

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  noise(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const X = ix & 255, Y = iy & 255;
    const p = this.perm, gx = this.gx, gy = this.gy;
    const a = p[p[X] + Y], b = p[p[X + 1] + Y], c = p[p[X] + Y + 1], d = p[p[X + 1] + Y + 1];
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const n00 = gx[a] * fx + gy[a] * fy;
    const n10 = gx[b] * (fx - 1) + gy[b] * fy;
    const n01 = gx[c] * fx + gy[c] * (fy - 1);
    const n11 = gx[d] * (fx - 1) + gy[d] * (fy - 1);
    const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
    return 1.42 * (nx0 + (nx1 - nx0) * v);
  }

  /** fractal sum normalised to about [-1, 1]; each octave is rotated so the lattices never line up */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
    let s = 0, a = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * this.noise(x, y);
      norm += a;
      const nx = x * 0.8 - y * 0.6, ny = x * 0.6 + y * 0.8;
      x = nx * lacunarity + 17.31;
      y = ny * lacunarity - 9.17;
      a *= gain;
    }
    return s / norm;
  }

  /** ridged noise in [0, 1]: sharp crests */
  ridged(x: number, y: number, octaves = 3): number {
    let s = 0, a = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += a * (1 - Math.abs(this.noise(x, y)));
      norm += a;
      x = x * 2.07 + 31.1;
      y = y * 2.07 - 7.7;
      a *= 0.5;
    }
    return s / norm;
  }
}

/** Monotone cubic (Fritsch–Carlson) interpolation through sorted key points. */
export class MonotoneCurve {
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly ms: Float64Array;

  constructor(points: readonly (readonly [number, number])[]) {
    const n = points.length;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.ms = new Float64Array(n);
    for (let i = 0; i < n; i++) { this.xs[i] = points[i][0]; this.ys[i] = points[i][1]; }
    const d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) d[i] = (this.ys[i + 1] - this.ys[i]) / (this.xs[i + 1] - this.xs[i]);
    this.ms[0] = d[0];
    this.ms[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) this.ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { this.ms[i] = 0; this.ms[i + 1] = 0; continue; }
      const a = this.ms[i] / d[i], b = this.ms[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); this.ms[i] = t * a * d[i]; this.ms[i + 1] = t * b * d[i]; }
    }
  }

  at(x: number): number {
    const xs = this.xs, n = xs.length;
    if (x <= xs[0]) return this.ys[0];
    if (x >= xs[n - 1]) return this.ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.ys[lo] + (t3 - 2 * t2 + t) * h * this.ms[lo] + (-2 * t3 + 3 * t2) * this.ys[hi] + (t3 - t2) * h * this.ms[hi];
  }
}
