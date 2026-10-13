/**
 * Small numeric helpers shared by the コメツキガニ modules (no three.js state, safe to unit-test in node).
 */

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** 32-bit string hash (FNV-1a). */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** mulberry32: a closure returning [0, 1). */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of a few ints to [0, 1). */
export function hash01(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] (quintic), for micro-motion that never repeats like a sine. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash01(i, seed, 71) * 2 - 1, b = hash01(i + 1, seed, 71) * 2 - 1;
  return a + (b - a) * u;
}

/** Two octaves of noise1: organic jitter. */
export function fbm1(x, seed = 0) {
  return noise1(x, seed) * 0.66 + noise1(x * 2.3 + 17.1, seed + 9) * 0.34;
}

/** Critically damped scalar spring: keeps procedural channels from snapping. */
export class Spring {
  constructor(v = 0, freq = 6) {
    this.v = v;
    this.vel = 0;
    this.freq = freq;
  }
  step(target, dt, freq = this.freq) {
    if (dt <= 0) return this.v;
    const w = TAU * freq;
    const f = 1 + 2 * dt * w;
    const oo = w * w, hoo = dt * oo, hhoo = dt * hoo;
    const detInv = 1 / (f + hhoo);
    const detX = f * this.v + dt * this.vel + hhoo * target;
    const detV = this.vel + hoo * (target - this.v);
    this.v = detX * detInv;
    this.vel = detV * detInv;
    return this.v;
  }
  reset(v) { this.v = v; this.vel = 0; }
}

/**
 * Exponential random interval with a floor (Poisson-like event timing): behaviours that recur
 * "now and then" instead of on a metronome.
 */
export function expInterval(rand, mean, min = 0) {
  return min + -Math.log(1 - rand() * 0.999) * Math.max(1e-3, mean - min);
}

/** Random in [a, b] from a rand() closure. */
export const rrange = (rand, a, b) => a + (b - a) * rand();
