// Small shared helpers for the ユビナガホンヤドカリ modules: seeded randomness, smooth noise for
// non-periodic micro-motion, damping and angle helpers. Everything is allocation-free in the hot path.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** frame-rate independent exponential approach */
export const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** mulberry32: small, fast, deterministic */
export class SeededRandom {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
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
  chance(p) {
    return this.next() < p;
  }
  normal() {
    const u = Math.max(1e-9, this.next()), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  /** heavy-tailed waiting time (log-normal), median m seconds */
  wait(m, spread = 0.6) {
    return m * Math.exp(spread * this.normal());
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

/** integer hash → [0,1) */
export function hash1(n) {
  let x = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** 1D value noise with quintic interpolation, range [-1, 1]. `seed` decorrelates channels. */
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = hash1(i * 1013 + seed * 7919) * 2 - 1;
  const b = hash1((i + 1) * 1013 + seed * 7919) * 2 - 1;
  return a + (b - a) * u;
}

/** fractal 1D noise (2 octaves, incommensurate frequencies) – never repeats visibly */
export function fbm1(t, seed = 0) {
  return 0.66 * noise1(t, seed) + 0.34 * noise1(t * 2.31 + 17.7, seed + 101);
}

/** 2D value noise in [-1, 1] (used at build time for shell damage, pattern seeds) */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash1(a * 374761 + b * 668265 + seed * 9176) * 2 - 1;
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/**
 * Event scheduler for non-periodic micro-motions: each channel fires after a random (log-normal)
 * interval and produces a smooth 0→1→0 pulse with its own duration. Avoids any visible period.
 */
export class Twitch {
  constructor(rng, medianInterval, duration, spread = 0.7) {
    this.rng = rng;
    this.median = medianInterval;
    this.duration = duration;
    this.spread = spread;
    this.timer = rng.wait(medianInterval, spread);
    this.t = -1;
    this.value = 0;
    this.sign = 1;
    this.amp = 1;
  }
  update(dt, rateScale = 1) {
    if (this.t >= 0) {
      this.t += dt / this.duration;
      if (this.t >= 1) {
        this.t = -1;
        this.value = 0;
        this.timer = this.rng.wait(this.median, this.spread) / Math.max(0.05, rateScale);
      } else {
        const s = Math.sin(Math.PI * this.t);
        this.value = s * s * this.amp * this.sign;
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.t = 0;
        this.sign = this.rng.chance(0.5) ? 1 : -1;
        this.amp = this.rng.range(0.4, 1);
      }
    }
    return this.value;
  }
}

/** critically-damped-ish 1D spring (semi-implicit Euler) */
export class Spring1 {
  constructor(value = 0, stiffness = 120, damping = 18) {
    this.x = value;
    this.v = 0;
    this.k = stiffness;
    this.c = damping;
  }
  update(target, dt) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

const _qa = new THREE.Quaternion();
/** rotate quaternion `q` toward `target` by at most `maxAngle` radians */
export function rotateTowards(q, target, maxAngle) {
  const ang = q.angleTo(target);
  if (ang < 1e-6) return q.copy(target);
  return q.slerp(_qa.copy(target), Math.min(1, maxAngle / ang));
}

/** axis-angle vector (rad) of the rotation taking qa to qb, expressed in world frame */
export function rotationError(qa, qb, out) {
  const d = _qa.copy(qb).multiply(qa.clone().invert());
  if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
  const s = Math.sqrt(Math.max(0, 1 - d.w * d.w));
  const angle = 2 * Math.acos(clamp(d.w, -1, 1));
  if (s < 1e-6) return out.set(0, 0, 0);
  return out.set(d.x / s, d.y / s, d.z / s).multiplyScalar(angle);
}
