import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** Frame-rate independent exponential approach. `rate` = 1/time-constant. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const dampAngle = (a, b, rate, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
/** Probability that an event with hazard rate `rate` (1/s) happens during dt. */
export const hazard = (rate, dt) => 1 - Math.exp(-Math.max(0, rate) * dt);

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** Gaussian with SD and clamp in SD units. */
  rng.variation = (sd, clampSD = 2) => clamp(rng.gauss(), -clampSD, clampSD) * sd;
  return rng;
}

/** Smooth 1D value noise in [-1,1], used to drive non-looping micro motion. */
export function makeNoise1D(seed = 1, size = 256) {
  const rng = makeRng(seed);
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = rng() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[((i % size) + size) % size];
    const b = table[(((i + 1) % size) + size) % size];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

/** Fractal 1D noise (2 octaves) — organic, never exactly periodic within a session. */
export function makeFbm1D(seed = 1) {
  const n1 = makeNoise1D(seed);
  const n2 = makeNoise1D(seed * 7 + 3);
  return (x) => n1(x) * 0.7 + n2(x * 2.31 + 17.1) * 0.3;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
/** Quaternion whose basis has X along xDir and Y as close as possible to yHint. */
export function frameQuat(xDir, yHint, out = new THREE.Quaternion()) {
  _x.copy(xDir).normalize();
  _z.crossVectors(_x, yHint).normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
/** Quaternion whose basis has Z (forward) along zDir and Y close to up. */
export function lookQuat(zDir, up = new THREE.Vector3(0, 1, 0), out = new THREE.Quaternion()) {
  _z.copy(zDir).normalize();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Mirror a left-side local quaternion to the right side (see docs/morphology.md §2). */
export const mirrorQuat = (q, out = new THREE.Quaternion()) => out.set(-q.x, -q.y, q.z, q.w);

export const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const mmV3 = (a) => new THREE.Vector3(a[0] / 1000, a[1] / 1000, a[2] / 1000);
