import { Vector2, Vector3 } from 'three';
import type { AmamoUniforms } from './kit';
import type { ShootSpec } from './AmamoPatch';
import { MOTION, SWAY_WAVES, postureState, smoothstep } from './params';

/**
 * The canopy's motion on the CPU: the same flow and lean the leaf shader (shader.ts, amShoot / amWaveFlow / amTangent)
 * gives a shoot, so an animal living among the blades can sway with them, in step. Only the shoot's central line is
 * followed (no leaf splay or flutter); the per-shoot hash jitter is kept, so it is in step with that very shoot.
 */

const K = SWAY_WAVES.map((w) => (2 * Math.PI) / w.lambda);
const W = K.map((k) => Math.sqrt(9.81 * k * Math.tanh(k * 1.2)));
const OFFS = [0, 2.1, 4.3];
const NOISE_K = [0.09, 0.07, 0.11];
const NOISE_O = [0, 5.3, 9.1];

const fract = (x: number) => x - Math.floor(x);
/** amHashS: the shader's shoot-level hash (no sine, so the GPU and the CPU agree) */
export function amHash(n: number): number {
  let p = fract(Math.fround(n * 0.1031));
  p = Math.fround(p * Math.fround(p + 33.33));
  p = Math.fround(p * Math.fround(p + p));
  return fract(p);
}
/** amH2 */
function amH2(x: number, y: number): number {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
/** amNoise: smooth value noise 0..1 */
export function amNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = amH2(ix, iy), b = amH2(ix + 1, iy), c = amH2(ix, iy + 1), d = amH2(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const rot = (x: number, y: number, a: number, out: Vector2) => out.set(Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y);

/** A shoot as the flow needs it (a grown ShootSpec, or a stand-in where no patch is grown). */
export interface ShootRef {
  x: number; y: number; z: number;
  /** fan azimuth (rad), longest leaf (m), sheath height (m), seed 0..1, leaf width (m) */
  fan: number; length: number; sheath: number; seed: number; width: number;
  /** tide-pool level over the shoot (-1e3: none) */
  pool: number;
}

export function shootRef(s: ShootSpec): ShootRef {
  return { x: s.x, y: s.y, z: s.z, fan: s.fan, length: s.length, sheath: s.sheath, seed: s.seed, width: s.width, pool: s.pool };
}

const tmpA = new Vector2(), tmpB = new Vector2(), tmpT = new Vector3(), tmpP = new Vector3();

/** The shoot's state for this frame: the water over it, how it sways, and the time-varying parts of the flow. */
export interface ShootState {
  depth: number; deep: number; sway: number; cur: number;
  /** the steady part of the flow (tidal current, its meanders and the shoot's jostle), m/s, already × cur */
  cx: number; cz: number;
  /** wave phases of the three trains and their gust factor */
  th: [number, number, number];
  gust: number;
  /** the shoot's own lean (rad, xz) */
  tx: number; tz: number;
}

export function shootState(u: AmamoUniforms, s: ShootRef, out?: ShootState): ShootState {
  const o = out ?? ({ th: [0, 0, 0] } as unknown as ShootState);
  const water = u.uAmWater.value;
  const lvl = s.pool > water + 0.01 && s.pool > s.y + 0.003 ? s.pool : water;
  const st = postureState(lvl - s.y, s.length);
  o.depth = lvl - s.y; o.deep = smoothstep(0.55, 1.5, st.submergence); o.sway = st.sway; o.cur = st.current;
  const t = u.uAmTime.value, Px = s.x, Pz = s.z;
  const C = u.uAmCurrent.value, Wv = u.uAmWave.value;
  const m = 0.8 + 0.4 * amNoise(Px * 0.05 + t * 0.01, Pz * 0.05 + t * 0.01);
  rot(C.x * m, C.y * m, 0.7 * (amNoise(Px * 0.03 - t * 0.012, Pz * 0.03 - t * 0.012) - 0.5), tmpA);
  const jit = (Math.hypot(C.x, C.y) + 0.3 * Wv.z) * 0.35;
  tmpA.x += jit * Math.sin(t * 0.9 + s.seed * 40 + Px * 0.7);
  tmpA.y += jit * Math.sin(t * 0.77 + s.seed * 23 + Pz * 0.6);
  o.cx = tmpA.x * o.cur; o.cz = tmpA.y * o.cur;
  for (let i = 0; i < 3; i++) {
    rot(Wv.x, Wv.y, SWAY_WAVES[i].turn, tmpB);
    o.th[i] = K[i] * (tmpB.x * Px + tmpB.y * Pz) - W[i] * t + OFFS[i]
      + 1.6 * amNoise(Px * NOISE_K[i] + NOISE_O[i], Pz * NOISE_K[i] + NOISE_O[i])
      + (amHash(s.seed * [211, 223, 227][i]) - 0.5) * 1.3;
  }
  const g = 0.35 + 1.3 * smoothstep(0.2, 0.85, amNoise(Px * 0.045 - Wv.x * t * 0.7, Pz * 0.045 - Wv.y * t * 0.7));
  o.gust = (1 + (g - 1) * Wv.w) * (0.75 + 0.5 * amHash(s.seed * 233));
  const fx = Math.cos(s.fan), fz = Math.sin(s.fan);
  const a = (amHash(s.seed * 91) - 0.5) * 0.26, b = (amHash(s.seed * 17) - 0.5) * 0.08;
  o.tx = fx * a - fz * b; o.tz = fz * a + fx * b;
  return o;
}

/** The water's horizontal velocity at the shoot (m/s): the steady flow plus the waves' orbital velocity delayed by `lag` rad. */
export function shootFlow(u: AmamoUniforms, S: ShootState, lag: number, out: Vector2): Vector2 {
  const Wv = u.uAmWave.value;
  let ux = 0, uz = 0;
  for (let i = 0; i < 3; i++) {
    rot(Wv.x, Wv.y, SWAY_WAVES[i].turn, tmpB);
    const v = Math.sin(S.th[i] - lag) * SWAY_WAVES[i].amp;
    ux += tmpB.x * v; uz += tmpB.y * v;
  }
  const k = Wv.z * S.gust * S.sway;
  return out.set(S.cx + ux * k, S.cz + uz * k);
}

/**
 * Unit tangent of the shoot's central line at arc length `s` (m from the base), as amTangent bends it (without the leaf
 * splay): stiff in the sheath, the flexible blade beyond it leaning with the flow, the waves' push delayed toward the tip.
 */
export function shootTangent(u: AmamoUniforms, ref: ShootRef, S: ShootState, s: number, out: Vector3): Vector3 {
  const hs = ref.sheath;
  const g = 0.22 * smoothstep(0, hs, s) + 0.78 * (1 - Math.exp(-Math.max(s - 0.6 * hs, 0) / MOTION.bendLength));
  shootFlow(u, S, (MOTION.tipLag * s) / Math.max(ref.length, 0.05), tmpA);
  const hx = S.tx + tmpA.x * MOTION.bendPerMps * g, hz = S.tz + tmpA.y * MOTION.bendPerMps * g;
  const m = Math.hypot(hx, hz), cap = MOTION.maxAngleWet;
  const th = cap * (1 - Math.exp(-m / cap));
  const dx = m > 1e-4 ? hx / m : Math.cos(ref.fan), dz = m > 1e-4 ? hz / m : Math.sin(ref.fan);
  return out.set(dx * Math.sin(th), Math.cos(th), dz * Math.sin(th));
}

/**
 * Points along the shoot's central line from the base, every `step` m up to `len` m (held under the water surface the
 * way the shader holds the blade: past the surface it runs along it). Returns the number written.
 */
export function shootLine(u: AmamoUniforms, ref: ShootRef, S: ShootState, step: number, len: number, out: Vector3[]): number {
  const ceil = ref.y + S.depth - 0.006;
  const T = tmpT;
  let n = 0;
  const p = tmpP.set(ref.x, ref.y, ref.z);
  out[n++].copy(p);
  for (let s = 0; s < len - 1e-9 && n < out.length; s += step) {
    shootTangent(u, ref, S, s + step * 0.5, T);
    p.addScaledVector(T, step);
    if (p.y > ceil) {
      const over = p.y - ceil;
      p.y = ceil;
      const h = Math.hypot(T.x, T.z);
      if (h > 1e-6) { p.x += (T.x / h) * over; p.z += (T.z / h) * over; }
    }
    out[n++].copy(p);
  }
  return n;
}
