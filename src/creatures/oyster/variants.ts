import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { Rng, hashInts } from '../../core/Rng';

/**
 * A growth pattern: the shell's history written on its surface. The same pattern drives the geometry (where the
 * big frilled lamellae stand) and the baked textures (the minor lamellae, growth lines, rays and pits between them),
 * so the edges in the mesh and the edges in the normal map are the same edges.
 *
 * Coordinates on a valve are (u, s): u runs once along the margin from one side of the beak, round the ventral
 * margin and back (0..1); s is the growth coordinate, 0 at the beak and 1 at today's margin. Growth lines are lines
 * of constant s, radial folds lines of constant u.
 *
 * The major lamellae are kept in a small table per valve: for each lamella k and each of LAM_W samples along u,
 *   s_k(u)   where its free edge lies (wavy along the margin, bowing outward over each radial fold)
 *   h_k(u)   the step down onto the next, younger layer (fraction of shell length)
 *   lift(u)  how far the free edge curls up off the shell into a frill (fraction of length)
 *   ov(u)    how far the frill overhangs the younger layer (growth units)
 */
export const LAM_W = 256;
export const MAX_K = 12;

export interface ValvePattern {
  /** number of major lamellae */
  K: number;
  /** LAM_W × MAX_K × 4 floats: (s, h, lift, ov) */
  table: Float32Array;
}

export interface GrowthVariant {
  index: number;
  seed: number;
  lower: ValvePattern;
  upper: ValvePattern;
  /** radial folds: count over the margin, phase, warp, warp phase */
  plic: [number, number, number, number];
  /** minor lamellae per unit growth, radial striae count, pigment rays count, bore-hole density */
  detail: [number, number, number, number];
  /** adductor scar (u, s, half-width u, half-height s) */
  scar: [number, number, number, number];
  /** the packed tables of both valves as a float texture (rows 0..MAX_K-1 lower, MAX_K.. upper) */
  texture: DataTexture;
}

/** Radial folds (plicae) as a function of u: irregular, fading toward the beak on both sides. Mirrored in GLSL. */
export function plication(u: number, p: readonly [number, number, number, number]): number {
  const [n, ph, w, ph2] = p;
  const env = smooth(0.04, 0.22, u) * smooth(0.96, 0.78, u);
  return Math.cos(Math.PI * 2 * (u * n + ph) + w * Math.sin(Math.PI * 2 * u * 1.37 + ph2) + 0.6 * w * Math.sin(Math.PI * 2 * u * 3.1 + ph2 * 1.7)) * env;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 1D value noise with smooth interpolation, period-free. */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const a = hashInts(i, seed) / 4294967296, b = hashInts(i + 1, seed) / 4294967296;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
function fbm1(x: number, seed: number): number {
  return 0.55 * noise1(x, seed) + 0.3 * noise1(x * 2.13 + 7.1, seed + 1) + 0.15 * noise1(x * 4.7 + 3.3, seed + 2);
}

function valvePattern(rng: Rng, seed: number, upper: boolean, plic: [number, number, number, number]): ValvePattern {
  // more lamellae on the lower valve; the lid's are flatter and closer
  const K = upper ? rng.int(5, 8) : rng.int(5, 9);
  const table = new Float32Array(LAM_W * MAX_K * 4);
  // growth slows with age: the lamellae crowd toward the margin
  const first = rng.range(0.13, 0.22), last = rng.range(0.88, 0.95), r = rng.range(0.74, 0.9);
  const gaps: number[] = [];
  let sum = 0;
  for (let k = 0; k < K - 1; k++) { const g = Math.pow(r, k) * rng.range(0.7, 1.3); gaps.push(g); sum += g; }
  const pos: number[] = [first];
  for (let k = 0; k < K - 1; k++) pos.push(pos[k] + (gaps[k] / sum) * (last - first));
  for (let k = 0; k < K; k++) {
    const ks = hashInts(seed, k, upper ? 17 : 3);
    const wav = rng.range(0.008, 0.03);
    const bow = rng.range(0.004, 0.018) * (upper ? 0.6 : 1);
    const hBase = (upper ? 0.0045 : 0.0085) * rng.range(0.6, 1.5) * (0.75 + 0.5 * (k / K));
    const lBase = (upper ? 0.0035 : 0.006) * rng.range(0.3, 1.6) * (0.6 + 0.8 * (k / K));
    const fluted = rng.chance(upper ? 0.2 : 0.35);
    for (let i = 0; i < LAM_W; i++) {
      const u = i / (LAM_W - 1);
      const pl = plication(u, plic);
      const crest = Math.max(0, pl);
      let sk = pos[k] + wav * (fbm1(u * 9 + k * 3.7, ks) - 0.5) * 2 + bow * pl;
      // toward the beak on both sides the growth lines converge on the hinge
      const side = Math.min(u, 1 - u);
      sk *= 0.92 + 0.08 * smooth(0, 0.15, side);
      const o = (k * LAM_W + i) * 4;
      const prev = k > 0 ? table[((k - 1) * LAM_W + i) * 4] : 0.02;
      sk = Math.min(0.975, Math.max(prev + 0.028, sk));
      const hn = fbm1(u * 14 + k * 1.3, ks + 9);
      const env = smooth(0.0, 0.12, side);
      table[o] = sk;
      // sectors where this layer stands proud and sectors where it has merged into the next
      const sector = Math.pow(0.15 + 1.3 * fbm1(u * 5 + k * 2.9, ks + 31), 1.6);
      table[o + 1] = hBase * (0.4 + 0.9 * hn) * (1 + 0.6 * crest) * sector * env;
      // frills lift most over the fold crests; a fluted lamella curls into short scoops there
      const lf = lBase * Math.pow(0.1 + 1.4 * fbm1(u * 16 + k * 5.1, ks + 21), 2) * (fluted ? 0.4 + 2.2 * Math.pow(crest, 2) : 0.7 + 0.8 * crest) * (0.4 + sector) * env;
      table[o + 2] = lf;
      table[o + 3] = (0.004 + 0.016 * Math.min(1, lf / 0.01)) * (upper ? 0.6 : 1);
    }
  }
  return { K, table };
}

const cache = new Map<number, GrowthVariant>();

/** The growth pattern of one variant index (the shared atlas has GROWTH_VARIANTS of them). Deterministic, cached. */
export function growthVariant(index: number, globalSeed = 0x0a5c1): GrowthVariant {
  const key = index * 7919 + globalSeed;
  const hit = cache.get(key);
  if (hit) return hit;
  const seed = hashInts(globalSeed, index, 0x6a1);
  const rng = new Rng(seed);
  const plic: [number, number, number, number] = [rng.range(5.5, 11), rng.range(0, 1), rng.range(0.6, 2.2), rng.range(0, 6.28)];
  const lower = valvePattern(rng, seed, false, plic);
  const upper = valvePattern(rng, seed ^ 0x51, true, plic);
  const data = new Float32Array(LAM_W * MAX_K * 2 * 4);
  data.set(lower.table, 0);
  data.set(upper.table, LAM_W * MAX_K * 4);
  const texture = new DataTexture(data, LAM_W, MAX_K * 2, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  const v: GrowthVariant = {
    index,
    seed,
    lower,
    upper,
    plic,
    detail: [rng.range(30, 55), rng.range(70, 140), rng.range(5, 14), rng.range(0.2, 1)],
    scar: [rng.range(0.56, 0.66), rng.range(0.55, 0.66), rng.range(0.045, 0.06), rng.range(0.08, 0.11)],
    texture,
  };
  cache.set(key, v);
  return v;
}

/** One lamella of a valve sampled at u: (s, h, lift, ov), linearly interpolated along u like the GLSL does. */
export function lamellaAt(p: ValvePattern, k: number, u: number, out: [number, number, number, number]): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, u)) * (LAM_W - 1);
  const i = Math.min(LAM_W - 2, Math.floor(x));
  const f = x - i;
  const a = (k * LAM_W + i) * 4, b = a + 4;
  const t = p.table;
  out[0] = t[a] + (t[b] - t[a]) * f;
  out[1] = t[a + 1] + (t[b + 1] - t[a + 1]) * f;
  out[2] = t[a + 2] + (t[b + 2] - t[a + 2]) * f;
  out[3] = t[a + 3] + (t[b + 3] - t[a + 3]) * f;
  return out;
}
