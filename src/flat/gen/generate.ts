/**
 * The fictional flat: a gently sloping sand flat in front of a stepped sea wall, after 葛西海浜公園 (西なぎさ).
 *
 * Frame: metres, x east, z south (the sea), y up, heights in T.P. (mean sea level 0). The walkable square is
 * x, z ∈ [-150, 150]; the fine grid covers 400 m around it at 0.25 m, the far grid 4 km at 4 m so the beach and
 * the bay carry on into the haze.
 *
 * Shore-normal profile (zz = distance seaward of the curved shore line):
 *   park lawn +4.6 | sea wall (a mesh) | dry upper beach with a berm +2.6…+1.9 | beach face to +0.6
 *   | low-tide terrace +0.6…-0.4 with ridge-and-runnel bars, pools and creeks | lower flat → the bay
 * Everything that can vary is random within physical bounds and seeded per feature, so one seed always gives the
 * same flat and changing one feature never reshuffles another.
 */
import { Noise2, MonotoneCurve, mulberry32, clamp, lerp, smoothstep } from './noise';

export const WALK_HALF = 150;
export const FINE_SIZE = 400;
export const FINE_CELL = 0.25;
export const FAR_SIZE = 4000;
export const FAR_CELL = 4;
/** the sea wall's beach-side foot (zz) and the park behind it; the mesh in Scenery follows the same shore line */
export const WALL_FOOT_ZZ = -178;
export const WALL_TOP_ZZ = -186;
export const PARK_HEIGHT = 4.6;

export interface Grid {
  n: number;
  size: number;
  cell: number;
  /** world coordinate of sample 0 (both axes) */
  origin: number;
}

export interface FineGrid extends Grid {
  height: Float32Array;
  /** RGBA8: mud, shell, ripple amplitude, ripple asymmetry (0 wave ripples … 1 current ripples) */
  mat: Uint8Array;
  /** RGBA8: ripple wave-vector direction (x, z encoded), wavelength (3…20 cm), megaripple amplitude */
  rip: Uint8Array;
  /** per cell: creek flow direction (x, z) and influence, for the water's surface flow */
  flow: Float32Array;
  /** per cell: surface of the water still running down a creek at low tide (-100 where there is none) */
  creek: Float32Array;
}

export interface FarGrid extends Grid {
  height: Float32Array;
  /** RGBA8: mud, shell, 0, 0 */
  mat: Uint8Array;
}

export interface ChannelPath {
  order: number;
  /** x, z pairs every STEP metres along the centre line */
  pts: Float32Array;
  halfWidth: Float32Array;
  depth: Float32Array;
  bed: Float32Array;
  /** signed curvature (1/m), positive turning left (toward +n) */
  kappa: Float32Array;
}

export interface Boulder {
  x: number;
  z: number;
  /** characteristic radius (m) */
  r: number;
  rot: number;
  seed: number;
  /** 0: weathered concrete block, 1: rounded stone */
  kind: number;
}

export interface ShoreDef {
  a1: number; l1: number; p1: number;
  a2: number; l2: number; p2: number;
  bay: number;
}

export interface FlatData {
  seed: number;
  fine: FineGrid;
  far: FarGrid;
  channels: ChannelPath[];
  boulders: Boulder[];
  /** where the main creek leaves the sea wall (outfall) */
  outfall: { x: number; z: number; dir: number };
  /** shore-line offset coefficients, so the sea wall and the props follow the shore */
  shore: ShoreDef;
  /** prevailing wind (direction of travel, unit vector x, z) */
  wind: [number, number];
}

export const STEP = 0.4;

/** Distance of the shore line south of z = 0 at x (the smooth part; see shoreLine for the full line). */
export function shoreOffset(s: ShoreDef, x: number): number {
  return s.a1 * Math.sin(x / s.l1 + s.p1) + s.a2 * Math.sin(x / s.l2 + s.p2) + s.bay * (x / 1000) * (x / 1000);
}

/** The shore line (z at x) exactly as the generator used it, for the sea wall and the props. */
export function shoreLine(seed: number, shore: ShoreDef): (x: number) => number {
  const n = new Noise2(seed + 11);
  return (x) => shoreOffset(shore, x) + 2.2 * n.fbm(x / 55, 4.1, 2);
}

// T.P. heights along the shore normal. The wall is a mesh; under it the ground steps up to the park.
const PROFILE = new MonotoneCurve([
  [-3000, PARK_HEIGHT], [-186.5, PARK_HEIGHT], [-184, 2.9], [-178, 2.62], [-165, 2.42], [-152, 2.18], [-147, 2.22],
  [-141, 2.02], [-130, 1.52], [-120, 0.98], [-112, 0.62], [-95, 0.47], [-60, 0.33], [-20, 0.2], [20, 0.07],
  [60, -0.06], [100, -0.24], [135, -0.46], [175, -0.72], [230, -1.05], [320, -1.5], [480, -2.2], [800, -3.4],
  [1400, -5.2], [3000, -8],
]);

interface Bar { z0: number; a1: number; l1: number; p1: number; tilt: number; h: number; wSea: number; wLand: number; runnelD: number; runnelW: number; runnelGap: number; seed: number }
interface PoolLobe { x: number; z: number; rx: number; rz: number; rot: number; depth: number }
interface PoolDesign { x: number; z: number; r: number; lobes: PoolLobe[]; seed: number }

/** A scalar function sampled on a regular lattice and read back bilinearly (for smooth fields). */
class Lattice {
  readonly v: Float32Array;
  constructor(readonly o: number, readonly step: number, readonly n: number, f: (x: number, z: number) => number) {
    this.v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.v[j * n + i] = f(o + i * step, o + j * step);
  }
  at(x: number, z: number): number {
    const n = this.n;
    const fx = clamp((x - this.o) / this.step, 0, n - 1.0001), fz = clamp((z - this.o) / this.step, 0, n - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, w = fz - j, k = j * n + i, v = this.v;
    return (v[k] * (1 - u) + v[k + 1] * u) * (1 - w) + (v[k + n] * (1 - u) + v[k + n + 1] * u) * w;
  }
}

export function generateFlat(seed: number, progress?: (label: string, f: number) => void): FlatData {
  const rnd = mulberry32(seed ^ 0x5eed);
  const nShore = new Noise2(seed + 11), nRelief = new Noise2(seed + 23), nWarp = new Noise2(seed + 31);
  const nBar = new Noise2(seed + 41), nPool = new Noise2(seed + 53), nZone = new Noise2(seed + 61), nChan = new Noise2(seed + 71);
  const nRip = new Noise2(seed + 83), nShell = new Noise2(seed + 97);

  const shore: ShoreDef = {
    a1: 7 + 5 * rnd(), l1: 190 + 80 * rnd(), p1: rnd() * 6.28,
    a2: 3 + 3 * rnd(), l2: 70 + 40 * rnd(), p2: rnd() * 6.28,
    bay: 22 + 14 * rnd(),
  };
  const shoreZ = shoreLine(seed, shore);
  // wind from the south-west (the afternoon sea breeze), travelling north-east
  const windA = -0.62 + 0.3 * (rnd() - 0.5);
  const wind: [number, number] = [Math.cos(windA), Math.sin(windA)];

  // ---------------------------------------------------------------- bars (ridge and runnel)
  const bars: Bar[] = [];
  const barZ = [-35 + 10 * rnd(), 38 + 12 * rnd(), 112 + 14 * rnd()];
  barZ.forEach((z0, i) => bars.push({
    z0, a1: 5 + 6 * rnd() + i * 3, l1: 80 + 70 * rnd(), p1: rnd() * 6.28, tilt: (rnd() - 0.5) * 0.18,
    h: [0.08, 0.13, 0.17][i] * (0.85 + 0.3 * rnd()), wSea: 13 + 6 * rnd() + i * 3, wLand: 5 + 3 * rnd(), runnelD: [0.06, 0.09, 0.11][i] * (0.8 + 0.4 * rnd()),
    runnelW: 5 + 3 * rnd() + i, runnelGap: 9 + 4 * rnd(), seed: Math.floor(rnd() * 1e6),
  }));
  // a bar's crest line and along-shore strength depend on x only: one value per column
  const barLine = (b: Bar, x: number) => b.z0 + b.a1 * Math.sin(x / b.l1 + b.p1) + 0.45 * b.a1 * Math.sin(x / (b.l1 * 0.37) + b.p1 * 2.3) + b.tilt * x + 9 * nBar.fbm(x / 70 + b.seed * 0.001, b.seed * 0.0007, 3);
  const barAlong = (b: Bar, x: number) => smoothstep(-0.6, 0.2, nBar.fbm(x / 80 + b.seed * 0.0013, 3.7 + b.seed * 0.0003, 3)) * (0.75 + 0.25 * nBar.noise(x / 23 + b.seed * 0.002, 1.7));
  const barTmp = { crest: 0, runnel: 0 };
  /** bar relief and two masks: crest (sand, winnowed) and runnel (mud, standing water) */
  const barAt = (zz: number, zc: ArrayLike<number>, along: ArrayLike<number>) => {
    let h = 0; barTmp.crest = 0; barTmp.runnel = 0;
    for (let bi = 0; bi < bars.length; bi++) {
      const b = bars[bi];
      const dz = zz - zc[bi];
      if (dz < -45 || dz > 75) continue;
      const a = along[bi];
      const w = dz > 0 ? b.wSea : b.wLand;
      const g = Math.exp(-(dz / w) * (dz / w));
      h += b.h * g * a;
      barTmp.crest = Math.max(barTmp.crest, g * a * smoothstep(0.03, 0.1, b.h * a));
      const rz = dz + b.runnelGap;
      const rg = Math.exp(-(rz / b.runnelW) * (rz / b.runnelW)) * (0.35 + 0.65 * a);
      h -= b.runnelD * rg;
      barTmp.runnel = Math.max(barTmp.runnel, rg);
    }
    return h;
  };

  // ---------------------------------------------------------------- designed tide pools
  // one to three overlapping lobes each, so the outlines are irregular, never a clean ellipse
  const pools: PoolDesign[] = [];
  for (let tries = 0; tries < 900 && pools.length < 40; tries++) {
    const x = (rnd() * 2 - 1) * 185, z = -105 + rnd() * 215;
    const zz = z - shoreZ(x);
    if (zz < -102 || zz > 120) continue;
    const big = rnd();
    const r = 2 * Math.pow(15 / 2, big * big);   // mostly small, a few large
    if (pools.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + r) * 0.9)) continue;
    const lobes: PoolLobe[] = [];
    const nl = 1 + Math.floor(rnd() * rnd() * 3.2);
    const rot0 = (rnd() - 0.5) * 0.9 + (rnd() < 0.25 ? 1.57 : 0);
    const depth = (0.035 + 0.06 * rnd()) * (0.7 + 0.5 * Math.sqrt(r / 6));
    for (let l = 0; l < nl; l++) {
      const a = rnd() * 6.28, d = l === 0 ? 0 : r * (0.45 + 0.4 * rnd());
      const rr = r * (l === 0 ? 1 : 0.45 + 0.4 * rnd());
      const aspect = 1 + rnd() * 1.8;
      lobes.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, rx: rr * Math.sqrt(aspect), rz: rr / Math.sqrt(aspect), rot: rot0 + (rnd() - 0.5) * 0.8, depth: depth * (l === 0 ? 1 : 0.6 + 0.5 * rnd()) });
    }
    pools.push({ x, z, r: r * 1.9, lobes, seed: Math.floor(rnd() * 1e6) });
  }

  // ---------------------------------------------------------------- base height (no creeks yet)
  const macro = (x: number, z: number) => {
    const wx = x + 22 * nWarp.fbm(x / 160 + 3.1, z / 160 - 7.7, 2), wz = z + 22 * nWarp.fbm(x / 160 - 5.3, z / 160 + 1.9, 2);
    return 0.12 * nRelief.fbm(wx / 170, wz / 170, 3) + 0.055 * nRelief.fbm(wx / 52 + 40, wz / 52 - 17, 3);
  };
  const envelope = (zz: number) => {
    if (zz < -183) return 0;
    if (zz < -141) return 0.45 * smoothstep(-183, -175, zz);          // dry beach: soft hummocks
    if (zz < -116) return lerp(0.45, 0.2, smoothstep(-141, -128, zz)); // beach face: planed by the swash
    return lerp(0.2, 1, smoothstep(-116, -100, zz)) * lerp(1, 0.35, smoothstep(160, 420, zz));
  };
  const profileAt = (zz: number, bermNoise: number) => PROFILE.at(zz) + 0.1 * Math.exp(-(((zz + 147) / 4.5) ** 2)) * (0.7 + 0.3 * bermNoise);
  const aeolian = (x: number, z: number, zz: number) => (zz > -183 && zz < -140 ? 0.09 * smoothstep(-183, -170, zz) * (1 - smoothstep(-150, -140, zz)) * nRelief.fbm(x / 14 + 77, z / 9 - 13, 3) : 0);

  progress?.('起伏', 0.04);
  const fineN = Math.round(FINE_SIZE / FINE_CELL) + 1;
  const farN = Math.round(FAR_SIZE / FAR_CELL) + 1;
  const fineO = -FINE_SIZE / 2, farO = -FAR_SIZE / 2;
  const latN = Math.round(FINE_SIZE / 2) + 3, latO = fineO - 2;     // 2 m lattices over the fine grid
  const macroL = new Lattice(latO, 2, latN, macro);
  const aeolL = new Lattice(latO, 2, latN, (x, z) => aeolian(x, z, z - shoreZ(x)));

  // per column of the fine grid
  const colShore = new Float32Array(fineN), colBerm = new Float32Array(fineN);
  const colZc = bars.map(() => new Float32Array(fineN)), colAl = bars.map(() => new Float32Array(fineN));
  for (let i = 0; i < fineN; i++) {
    const x = fineO + i * FINE_CELL;
    colShore[i] = shoreZ(x);
    colBerm[i] = nShore.noise(x / 40, 2.2);
    bars.forEach((b, bi) => { colZc[bi][i] = barLine(b, x); colAl[bi][i] = barAlong(b, x); });
  }
  const zcTmp = new Float32Array(bars.length), alTmp = new Float32Array(bars.length);

  const fineH = new Float32Array(fineN * fineN);
  const crest = new Float32Array(fineN * fineN);
  const runnel = new Float32Array(fineN * fineN);
  for (let j = 0; j < fineN; j++) {
    const z = fineO + j * FINE_CELL;
    for (let i = 0; i < fineN; i++) {
      const x = fineO + i * FINE_CELL, k = j * fineN + i;
      const zz = z - colShore[i];
      const env = envelope(zz);
      let h = profileAt(zz, colBerm[i]) + env * macroL.at(x, z);
      if (env > 0) h += env * (0.02 * nRelief.fbm(x / 12 - 9, z / 12 + 61, 2) + 0.0075 * nRelief.noise(x / 3.6 + 4, z / 3.6 - 2));
      h += aeolL.at(x, z);
      for (let bi = 0; bi < bars.length; bi++) { zcTmp[bi] = colZc[bi][i]; alTmp[bi] = colAl[bi][i]; }
      h += barAt(zz, zcTmp, alTmp);
      fineH[k] = h;
      crest[k] = barTmp.crest;
      runnel[k] = barTmp.runnel;
    }
    if ((j & 127) === 0) progress?.('起伏', 0.04 + 0.22 * (j / fineN));
  }
  const farH = new Float32Array(farN * farN);
  {
    const shoreFar = new Float32Array(farN), bermFar = new Float32Array(farN);
    const zcF = bars.map(() => new Float32Array(farN)), alF = bars.map(() => new Float32Array(farN));
    for (let i = 0; i < farN; i++) {
      const x = farO + i * FAR_CELL;
      shoreFar[i] = shoreZ(x); bermFar[i] = nShore.noise(x / 40, 2.2);
      bars.forEach((b, bi) => { zcF[bi][i] = barLine(b, x); alF[bi][i] = barAlong(b, x); });
    }
    for (let j = 0; j < farN; j++) {
      const z = farO + j * FAR_CELL;
      for (let i = 0; i < farN; i++) {
        const x = farO + i * FAR_CELL;
        if (Math.abs(x) < FINE_SIZE / 2 - 8 && Math.abs(z) < FINE_SIZE / 2 - 8) continue;   // taken from the fine grid below
        const zz = z - shoreFar[i];
        for (let bi = 0; bi < bars.length; bi++) { zcTmp[bi] = zcF[bi][i]; alTmp[bi] = alF[bi][i]; }
        farH[j * farN + i] = profileAt(zz, bermFar[i]) + envelope(zz) * macro(x, z) + aeolian(x, z, zz) + barAt(zz, zcTmp, alTmp);
      }
    }
  }

  // pools: pressed into the fine grid (and the far one, coarsely)
  progress?.('潮だまり', 0.28);
  const poolRelief = (p: PoolDesign, x: number, z: number) => {
    let d = 0;
    const edge = 1 + 0.3 * nPool.fbm(x / (p.r * 0.35) + p.seed * 0.001, z / (p.r * 0.35), 2);
    for (const L of p.lobes) {
      const dx = x - L.x, dz = z - L.z, c = Math.cos(L.rot), s = Math.sin(L.rot);
      const u = (dx * c + dz * s) / L.rx, v = (-dx * s + dz * c) / L.rz;
      const rr = Math.sqrt(u * u + v * v) * edge;
      if (rr >= 1) continue;
      const t = 1 - smoothstep(0.3, 1, rr);
      d = Math.min(d, -L.depth * Math.pow(t, 1.25));
    }
    return d === 0 ? 0 : d * (0.85 + 0.15 * nPool.noise(x / 1.7, z / 1.7));
  };
  const forFine = (x0: number, z0: number, x1: number, z1: number, f: (x: number, z: number, k: number) => void) => {
    const i0 = clamp(Math.floor((x0 - fineO) / FINE_CELL), 0, fineN - 1), i1 = clamp(Math.ceil((x1 - fineO) / FINE_CELL), 0, fineN - 1);
    const j0 = clamp(Math.floor((z0 - fineO) / FINE_CELL), 0, fineN - 1), j1 = clamp(Math.ceil((z1 - fineO) / FINE_CELL), 0, fineN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(fineO + i * FINE_CELL, fineO + j * FINE_CELL, j * fineN + i);
  };
  const forFar = (x0: number, z0: number, x1: number, z1: number, f: (x: number, z: number, k: number) => void) => {
    const i0 = clamp(Math.floor((x0 - farO) / FAR_CELL), 0, farN - 1), i1 = clamp(Math.ceil((x1 - farO) / FAR_CELL), 0, farN - 1);
    const j0 = clamp(Math.floor((z0 - farO) / FAR_CELL), 0, farN - 1), j1 = clamp(Math.ceil((z1 - farO) / FAR_CELL), 0, farN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(farO + i * FAR_CELL, farO + j * FAR_CELL, j * farN + i);
  };
  const poolMask = new Float32Array(fineN * fineN);
  for (const p of pools) {
    const R = p.r * 1.4;
    forFine(p.x - R, p.z - R, p.x + R, p.z + R, (x, z, k) => {
      const d = poolRelief(p, x, z);
      if (d === 0) return;
      fineH[k] += d;
      poolMask[k] = Math.max(poolMask[k], clamp(-d / p.lobes[0].depth, 0, 1));
    });
  }

  // ---------------------------------------------------------------- creeks
  progress?.('澪筋', 0.36);
  const fineHeightAt = (x: number, z: number) => {
    const fx = clamp((x - fineO) / FINE_CELL, 0, fineN - 1.001), fz = clamp((z - fineO) / FINE_CELL, 0, fineN - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * fineN + i;
    return (fineH[k] * (1 - u) + fineH[k + 1] * u) * (1 - v) + (fineH[k + fineN] * (1 - u) + fineH[k + fineN + 1] * u) * v;
  };
  const farHeightAt = (x: number, z: number) => {
    const fx = clamp((x - farO) / FAR_CELL, 0, farN - 1.001), fz = clamp((z - farO) / FAR_CELL, 0, farN - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * farN + i;
    return (farH[k] * (1 - u) + farH[k + 1] * u) * (1 - v) + (farH[k + farN] * (1 - u) + farH[k + farN + 1] * u) * v;
  };
  const groundAt = (x: number, z: number) => (Math.abs(x) < FINE_SIZE / 2 - 1 && Math.abs(z) < FINE_SIZE / 2 - 1 ? fineHeightAt(x, z) : farHeightAt(x, z));

  const channels: ChannelPath[] = [];
  const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  /**
   * Trace one creek as a sine-generated meander (Langbein & Leopold) around a steered mean direction. The meander
   * wavelength follows the local width (about twelve widths), and wavelength, amplitude and skew all wander, so no
   * two bends are alike; a little directional noise adds the kinks of real creeks.
   */
  const trace = (o: {
    x: number; z: number; dir: number; order: number; w0: number; w1: number; d0: number; d1: number; maxLen: number;
    omega: number; widths: number; steer: (x: number, z: number, s: number) => number; stop: (x: number, z: number, s: number) => boolean; seed: number;
  }): ChannelPath => {
    const pts: number[] = [], hw: number[] = [], dp: number[] = [];
    let x = o.x, z = o.z, mean = o.dir;
    const r = mulberry32(o.seed + 1);
    let phase = r() * 6.28;
    const skew = (r() - 0.3) * 0.5;
    const ns = o.seed * 0.0137;
    for (let s = 0; s < o.maxLen; s += STEP) {
      const f = s / o.maxLen;
      const w = lerp(o.w0, o.w1, Math.sqrt(f)) * (0.8 + 0.4 * (nChan.noise(s / 23 + ns, 1.3) * 0.5 + 0.5));
      pts.push(x, z);
      hw.push(w);
      dp.push(lerp(o.d0, o.d1, f) * (0.85 + 0.3 * (nChan.noise(s / 31 + ns, 7.9) * 0.5 + 0.5)));
      if (o.stop(x, z, s)) break;
      const target = o.steer(x, z, s);
      mean += clamp(angDiff(target, mean), -0.02, 0.02) * STEP * 1.4;
      const L = Math.max(6, o.widths * 2 * w) * (0.65 + 0.7 * (nChan.noise(s / 70 + ns, 3.3) * 0.5 + 0.5));
      phase += (2 * Math.PI * STEP) / L;
      const om = o.omega * clamp(0.35 + 0.9 * (nChan.fbm(s / 55 - ns, 9.1, 2) * 0.5 + 0.5), 0.2, 1.25);
      const theta = mean + om * Math.sin(phase) + om * om * skew * Math.cos(3 * phase) + 0.18 * nChan.fbm(s / 7 + ns, 5.5, 2);
      x += Math.cos(theta) * STEP;
      z += Math.sin(theta) * STEP;
    }
    const n = pts.length / 2;
    const P = new Float32Array(pts), W = new Float32Array(hw), D = new Float32Array(dp);
    // curvature from the turning of the centre line, over a few metres
    const K = new Float32Array(n);
    const span = 6;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - span), b = Math.min(n - 1, i + span);
      if (b - a < 2) continue;
      const m = (a + b) >> 1;
      const t0 = Math.atan2(P[m * 2 + 1] - P[a * 2 + 1], P[m * 2] - P[a * 2]), t1 = Math.atan2(P[b * 2 + 1] - P[m * 2 + 1], P[b * 2] - P[m * 2]);
      K[i] = angDiff(t1, t0) / Math.max((b - a) * STEP * 0.5, 0.1);
    }
    // bed: the depth below the ground, never rising downstream (where the ground rises, a bar, the creek cuts it)
    const B = new Float32Array(n);
    let low = Infinity;
    for (let i = 0; i < n; i++) {
      low = Math.min(low, groundAt(P[i * 2], P[i * 2 + 1]) - D[i]);
      B[i] = low;
    }
    return { order: o.order, pts: P, halfWidth: W, depth: D, bed: B, kappa: K };
  };

  // main creek: from the outfall in the sea wall, across the flat to the bay
  const ox = -95 + 70 * rnd();
  const oz = shoreOffset(shore, ox) + WALL_FOOT_ZZ + 1.0;
  const seaward = Math.PI / 2;
  // (angles: atan2(dz, dx); +x east, +z south, so π/2 runs straight out to sea and smaller angles bend east)
  const mainBend = (rnd() - 0.5) * 0.5;
  const main = trace({
    x: ox, z: oz, dir: seaward + (rnd() - 0.5) * 0.5, order: 0, w0: 0.55, w1: 4.4, d0: 0.1, d1: 0.62, maxLen: 560,
    omega: 0.85, widths: 12, seed: Math.floor(rnd() * 1e6),
    steer: (x, z, s) => seaward + mainBend * Math.sin(s / 160 + 1.3) + clamp((x + 25) / 260, -0.6, 0.6),
    stop: (x, z) => z > 340,
  });
  channels.push(main);
  // a second, smaller creek draining the east side to the bay
  const east = trace({
    x: 55 + 70 * rnd(), z: -92 + 18 * rnd(), dir: seaward - 0.2, order: 1, w0: 0.25, w1: 2.2, d0: 0.035, d1: 0.36, maxLen: 440,
    omega: 0.75, widths: 13, seed: Math.floor(rnd() * 1e6),
    steer: (x, z, s) => seaward - 0.15 + 0.2 * Math.sin(s / 110) + clamp((x - 85) / 300, -0.4, 0.4),
    stop: (x, z) => z > 320,
  });
  channels.push(east);
  // tributaries: start on the flat and wander into a bigger creek, joining at an acute angle
  const nearestOn = (c: ChannelPath, x: number, z: number) => {
    let best = Infinity, bi = 0;
    for (let i = 0; i < c.pts.length / 2; i += 2) {
      const d = (c.pts[i * 2] - x) ** 2 + (c.pts[i * 2 + 1] - z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return { d: Math.sqrt(best), i: bi };
  };
  const nTrib = 8 + Math.floor(rnd() * 4);
  for (let t = 0, tries = 0; t < nTrib && tries < 80; tries++) {
    const parent = rnd() < 0.66 ? main : east;
    const sx = (rnd() * 2 - 1) * 175, sz = -85 + rnd() * 160;
    const zz = sz - shoreZ(sx);
    if (zz < -95 || zz > 115) continue;
    const near = nearestOn(parent, sx, sz);
    if (near.d < 14 || near.d > 110) continue;
    t++;
    const trib = trace({
      x: sx, z: sz, dir: Math.atan2(parent.pts[near.i * 2 + 1] - sz, parent.pts[near.i * 2] - sx), order: 2,
      w0: 0.08, w1: 0.45 + 0.55 * rnd(), d0: 0.01, d1: 0.06 + 0.1 * rnd(), maxLen: near.d * 2.2 + 30,
      omega: 0.35 + 0.4 * rnd(), widths: 16 + 10 * rnd(), seed: Math.floor(rnd() * 1e6),
      steer: (x, z) => {
        const q = nearestOn(parent, x, z);
        const k = Math.min(parent.pts.length / 2 - 1, q.i + 30);
        return Math.atan2(parent.pts[k * 2 + 1] - z, parent.pts[k * 2] - x);
      },
      stop: (x, z) => nearestOn(parent, x, z).d < 0.6,
    });
    channels.push(trib);
  }

  // carve every creek into both grids; keep the creek's influence for the sediment, ripple and flow fields
  progress?.('澪筋', 0.46);
  const chanW = new Float32Array(fineN * fineN);      // 1 in the bed … 0 a few widths away
  const chanT = new Float32Array(fineN * fineN * 2);  // ebb flow direction there
  const chanBed = new Float32Array(fineN * fineN);    // 1 at the thalweg, 0 at the banks
  const chanInner = new Float32Array(fineN * fineN);  // inner (point-bar) side of a bend
  const chanSize = new Float32Array(fineN * fineN);   // half-width of the creek (m)
  const creek = new Float32Array(fineN * fineN).fill(-100);
  const scratch = {
    fine: { tag: new Int32Array(fineN * fineN).fill(-1), d2: new Float32Array(fineN * fineN), seg: new Int32Array(fineN * fineN), t: new Float32Array(fineN * fineN) },
    far: { tag: new Int32Array(farN * farN).fill(-1), d2: new Float32Array(farN * farN), seg: new Int32Array(farN * farN), t: new Float32Array(farN * farN) },
  };
  const carve = (c: ChannelPath, cid: number, grid: 'fine' | 'far') => {
    const n = c.pts.length / 2;
    if (n < 3) return;
    const H = grid === 'fine' ? fineH : farH;
    const each = grid === 'fine' ? forFine : forFar;
    const cell = grid === 'fine' ? FINE_CELL : FAR_CELL;
    const S = scratch[grid];
    const touched: number[] = [];
    // pass 1: nearest centre-line point per cell (the minimum over all segments of this creek)
    for (let i0 = 0; i0 < n - 1; i0 += 8) {
      const i1 = Math.min(n - 1, i0 + 8);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, wMax = 0;
      for (let i = i0; i <= i1; i++) {
        x0 = Math.min(x0, c.pts[i * 2]); x1 = Math.max(x1, c.pts[i * 2]);
        z0 = Math.min(z0, c.pts[i * 2 + 1]); z1 = Math.max(z1, c.pts[i * 2 + 1]);
        wMax = Math.max(wMax, c.halfWidth[i]);
      }
      const R = wMax * 3.4 + 1.2 + cell;
      const a = Math.max(0, i0 - 1), b = Math.min(n - 2, i1);
      each(x0 - R, z0 - R, x1 + R, z1 + R, (x, z, k) => {
        let best = Infinity, bi = a, bt = 0;
        for (let i = a; i <= b; i++) {
          const px = c.pts[i * 2], pz = c.pts[i * 2 + 1], ex = c.pts[i * 2 + 2] - px, ez = c.pts[i * 2 + 3] - pz;
          const L2 = ex * ex + ez * ez || 1e-9;
          const t = clamp(((x - px) * ex + (z - pz) * ez) / L2, 0, 1);
          const dx = x - (px + ex * t), dz = z - (pz + ez * t), d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bi = i; bt = t; }
        }
        if (S.tag[k] !== cid) { S.tag[k] = cid; S.d2[k] = best; S.seg[k] = bi; S.t[k] = bt; touched.push(k); }
        else if (best < S.d2[k]) { S.d2[k] = best; S.seg[k] = bi; S.t[k] = bt; }
      });
    }
    // pass 2: the cross-section, once per cell
    const N = grid === 'fine' ? fineN : farN, O = grid === 'fine' ? fineO : farO;
    for (const k of touched) {
      const x = O + (k % N) * cell, z = O + Math.floor(k / N) * cell;
      const bi = S.seg[k], bt = S.t[k];
      const px = c.pts[bi * 2], pz = c.pts[bi * 2 + 1], ex = c.pts[bi * 2 + 2] - px, ez = c.pts[bi * 2 + 3] - pz;
      const L = Math.hypot(ex, ez) || 1e-6;
      const tx = ex / L, tz = ez / L;
      const side = (x - px) * -tz + (z - pz) * tx;   // signed lateral offset (+ left of travel)
      const w = lerp(c.halfWidth[bi], c.halfWidth[bi + 1], bt);
      const D = lerp(c.depth[bi], c.depth[bi + 1], bt);
      const bed = lerp(c.bed[bi], c.bed[bi + 1], bt);
      const kap = lerp(c.kappa[bi], c.kappa[bi + 1], bt);
      // thalweg pushed toward the outer bank of a bend; the inner side is a gentle point bar
      const ck = clamp(kap * w * 2.2, -0.62, 0.62);
      const nt = -ck * w;
      const wl = w * (1 + 0.12 * nChan.noise(x / 1.3, z / 1.3));
      const half = side < nt ? wl + nt : wl - nt;
      const u = (side - nt) / Math.max(half, 0.05);
      const outer = (side < nt) === (ck > 0);
      const au = Math.abs(u);
      let carved: number;
      if (au < 1) carved = bed + D * (1 - Math.pow(1 - au * au, outer ? 0.45 : 1.7));
      else carved = bed + D + (Math.abs(side - nt) - half) * (outer ? 0.55 : 0.12);
      if (carved < H[k]) H[k] = carved;
      else if (c.order < 2 && au > 1) {
        // muddy levees: a few centimetres along the banks of the bigger creeks
        const lev = 0.018 * Math.exp(-(((au - 1.35) / 0.35) ** 2));
        H[k] += lev * smoothstep(0.25, 0, carved - H[k]);
      }
      if (grid === 'fine') {
        // the ebb trickle: a few centimetres over the bed, deepening downstream (the main creek drains the outfall)
        if (au < 1.15) {
          const f = bi / n;
          const q = c.order === 0 ? lerp(0.035, 0.13, f) : c.order === 1 ? lerp(0.015, 0.07, f) : lerp(0.003, 0.012, f);
          creek[k] = Math.max(creek[k], bed + q);
        }
        const infl = au < 1 ? 1 : Math.exp(-(au - 1) * 1.1);
        if (infl > chanW[k]) {
          chanW[k] = infl;
          chanT[k * 2] = tx; chanT[k * 2 + 1] = tz;
          chanBed[k] = au < 1 ? 1 - au : 0;
          chanInner[k] = !outer && au < 1.6 ? 1 - au / 1.6 : 0;
          chanSize[k] = w;
        }
      }
    }
  };
  channels.forEach((c, i) => { carve(c, i, 'fine'); carve(c, i, 'far'); });

  // the far grid takes the fine one where both exist (blended over the last few metres by the renderer)
  for (let j = 0; j < farN; j++) {
    const z = farO + j * FAR_CELL;
    if (Math.abs(z) > FINE_SIZE / 2) continue;
    for (let i = 0; i < farN; i++) {
      const x = farO + i * FAR_CELL;
      if (Math.abs(x) > FINE_SIZE / 2) continue;
      farH[j * farN + i] = fineHeightAt(x, z);
    }
  }

  // ---------------------------------------------------------------- sediment, ripple and flow fields
  progress?.('底質', 0.58);
  const blurred = boxBlur(fineH, fineN, Math.round(5 / FINE_CELL), 2);
  const N = fineN;
  // smooth fields on the 2 m lattice
  const warpX = (x: number, z: number) => x + 18 * nWarp.fbm(x / 90 + 11, z / 90 - 4, 2);
  const warpZ = (x: number, z: number) => z + 18 * nWarp.fbm(x / 90 - 6, z / 90 + 9, 2);
  const zoneL = new Lattice(latO, 2, latN, (x, z) => { const wx = warpX(x, z), wz = warpZ(x, z); return 0.32 * nZone.fbm(wx / 120, wz / 120, 3) + 0.18 * nZone.fbm(wx / 26 + 50, wz / 26 - 30, 3); });
  const patchL = new Lattice(latO, 2, latN, (x, z) => nZone.fbm(warpX(x, z) / 26 + 50, warpZ(x, z) / 26 - 30, 3));
  const raL = new Lattice(latO, 2, latN, (x, z) => 0.35 * nRip.fbm(x / 40, z / 40, 2) + 0.12 * nRip.noise(x / 8, z / 8));
  const lamL = new Lattice(latO, 2, latN, (x, z) => nRip.fbm(x / 30 + 7, z / 30, 2) * 0.5 + 0.5);
  const asymL = new Lattice(latO, 2, latN, (x, z) => nRip.noise(x / 25 + 3, z / 25 - 1) * 0.5 + 0.5);
  const ampL = new Lattice(latO, 2, latN, (x, z) => nRip.fbm(x / 18 + 30, z / 18 + 5, 3) * 0.5 + 0.5);
  const aeoAmpL = new Lattice(latO, 2, latN, (x, z) => nRip.fbm(x / 9 - 20, z / 9 + 2, 3) * 0.5 + 0.5);
  const aeoLamL = new Lattice(latO, 2, latN, (x, z) => nRip.noise(x / 12, z / 12 + 40) * 0.5 + 0.5);
  const megaL = new Lattice(latO, 2, latN, (x, z) => nRip.fbm(x / 45 + 70, z / 45 - 70, 2) * 0.5 + 0.5);
  const shellL = new Lattice(latO, 2, latN, (x, z) => nShell.fbm(x / 7 + 3, z / 7 - 8, 3) * 0.5 + 0.5);
  // the strand lines depend on x only
  const colWrack1 = new Float32Array(N), colWrack2 = new Float32Array(N), colWrack2s = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = fineO + i * FINE_CELL;
    colWrack1[i] = -139.5 + 1.5 * nShell.noise(x / 9, 1.1);
    colWrack2[i] = -131 + 2 * nShell.noise(x / 13, 4.2);
    colWrack2s[i] = smoothstep(0.2, 0.6, nShell.noise(x / 21, 8.8) * 0.5 + 0.5);
  }
  const mat = new Uint8Array(N * N * 4);
  const rip = new Uint8Array(N * N * 4);
  const flow = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) {
    const z = fineO + j * FINE_CELL;
    for (let i = 0; i < N; i++) {
      const x = fineO + i * FINE_CELL, k = j * N + i;
      const h = fineH[k], hs = blurred[k];
      const zz = z - colShore[i];
      const rel = h - hs;
      // depth gradient of the smoothed ground: wave ripples form with crests along the depth contours
      const il = Math.max(0, i - 8), ir = Math.min(N - 1, i + 8), jd = Math.max(0, j - 8), ju = Math.min(N - 1, j + 8);
      const gx = (blurred[j * N + ir] - blurred[j * N + il]) / ((ir - il) * FINE_CELL);
      const gz = (blurred[ju * N + i] - blurred[jd * N + i]) / ((ju - jd) * FINE_CELL);
      const slope = Math.hypot(gx, gz);
      const cw = chanW[k];
      // ---- mud: sheltered, low, wet ground; sand on the bars, the slopes and the beach
      let m = 0.4 + 1.25 * zoneL.at(x, z) + 0.08 * (1 - smoothstep(-120, 40, x));   // the creek's side (west) is muddier
      m += 0.5 * runnel[k];
      m -= 0.7 * crest[k];
      m -= 3.0 * clamp(rel, -0.12, 0.12);
      m -= 1.4 * clamp(slope - 0.004, 0, 0.1);
      m += 0.55 * chanInner[k] + 0.4 * cw * (1 - chanBed[k]) - 0.25 * chanBed[k] * smoothstep(0.6, 2.5, chanSize[k]);
      m += 0.3 * poolMask[k] * (0.5 + 0.5 * patchL.at(x, z));
      m += 0.07 * nZone.noise(x / 3.1 + 9, z / 3.1 - 3);          // ragged edges
      m *= smoothstep(-122, -100, zz);                               // the beach is sand
      const mud = smoothstep(0.36, 0.74, m);
      // ---- shell hash: creek lag, runnel floors, the strand lines, scattered drifts
      let sh = 0.75 * chanBed[k] * smoothstep(0.4, 1.5, chanSize[k]) + 0.25 * runnel[k] * (1 - mud);
      sh += 0.9 * Math.exp(-(((zz - colWrack1[i]) / 1.6) ** 2));
      sh += 0.45 * Math.exp(-(((zz - colWrack2[i]) / 2.2) ** 2)) * colWrack2s[i];
      sh += 0.5 * smoothstep(0.55, 0.85, shellL.at(x, z)) * (1 - mud);
      sh = clamp(sh, 0, 1);
      // ---- ripples
      let dx = -gx, dz = -gz;
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-6) { dx = 0; dz = -1; } else { dx /= dl; dz /= dl; }
      const sn = smoothstep(0.0005, 0.004, slope);
      dx = lerp(0, dx, sn); dz = lerp(-1, dz, sn);
      { const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      const ra = raL.at(x, z);
      let rx = dx * Math.cos(ra) - dz * Math.sin(ra), rz = dx * Math.sin(ra) + dz * Math.cos(ra);
      let lam = 0.062 + 0.018 * lamL.at(x, z);
      let asym = 0.12 + 0.2 * smoothstep(0.2, 0.8, asymL.at(x, z));
      // creeks: current ripples, crests across the ebb flow, longer and asymmetric
      if (cw > 0.01) {
        const t = smoothstep(0.15, 0.85, cw);
        const tx = chanT[k * 2], tz = chanT[k * 2 + 1];
        const sgn = tx * rx + tz * rz < 0 ? -1 : 1;
        rx = lerp(rx * sgn, tx, t); rz = lerp(rz * sgn, tz, t);
        const l = Math.hypot(rx, rz) || 1;
        rx /= l; rz /= l;
        lam = lerp(lam, 0.1 + 0.05 * smoothstep(0.5, 3, chanSize[k]), t);
        asym = lerp(asym, 0.85, t);
      }
      // amplitude: sand only; patches of plane bed; the swash-planed beach face has none
      let amp = (1 - mud) * smoothstep(0.25, 0.65, ampL.at(x, z) + 0.25);
      amp *= smoothstep(-118, -104, zz);
      amp *= 1 - 0.5 * crest[k] * smoothstep(0.05, 0.12, rel + 0.08);
      // dry beach above the strand line: aeolian ripples (風紋), crests across the wind
      if (zz < -141 && zz > -184) {
        const t = smoothstep(-141, -146, zz);
        rx = lerp(rx, wind[0], t); rz = lerp(rz, wind[1], t);
        const l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
        lam = lerp(lam, 0.075 + 0.03 * aeoLamL.at(x, z), t);
        asym = lerp(asym, 0.45, t);
        amp = Math.max(amp, t * smoothstep(0.35, 0.6, aeoAmpL.at(x, z)));
      }
      // megaripples (sand waves, 0.6–1.5 m) in the bigger creeks and on the sandy lower flat
      let mega = smoothstep(1.2, 3.2, chanSize[k]) * cw * (1 - mud);
      mega = Math.max(mega, smoothstep(40, 120, zz) * (1 - mud) * smoothstep(0.55, 0.8, megaL.at(x, z)));
      const o = k * 4;
      mat[o] = Math.round(mud * 255);
      mat[o + 1] = Math.round(sh * 255);
      mat[o + 2] = Math.round(clamp(amp, 0, 1) * 255);
      mat[o + 3] = Math.round(clamp(asym, 0, 1) * 255);
      rip[o] = Math.round((rx * 0.5 + 0.5) * 255);
      rip[o + 1] = Math.round((rz * 0.5 + 0.5) * 255);
      rip[o + 2] = Math.round(clamp((lam - 0.03) / 0.17, 0, 1) * 255);
      rip[o + 3] = Math.round(clamp(mega, 0, 1) * 255);
      flow[k * 3] = chanT[k * 2];
      flow[k * 3 + 1] = chanT[k * 2 + 1];
      flow[k * 3 + 2] = cw * smoothstep(0.15, 1.2, chanSize[k]);
    }
    if ((j & 127) === 0) progress?.('底質', 0.58 + 0.32 * (j / N));
  }
  // far grid material: the same rules from the coarse relief (no ripples that far)
  const farMat = new Uint8Array(farN * farN * 4);
  const farBlur = boxBlur(farH, farN, 2, 2);
  for (let j = 0; j < farN; j++) {
    const z = farO + j * FAR_CELL;
    for (let i = 0; i < farN; i++) {
      const x = farO + i * FAR_CELL, k = j * farN + i;
      let mud: number, sh: number;
      if (Math.abs(x) < FINE_SIZE / 2 && Math.abs(z) < FINE_SIZE / 2) {
        const fi = Math.round((x - fineO) / FINE_CELL), fj = Math.round((z - fineO) / FINE_CELL);
        mud = mat[(fj * N + fi) * 4] / 255; sh = mat[(fj * N + fi) * 4 + 1] / 255;
      } else {
        const zz = z - shoreZ(x);
        const wx = warpX(x, z), wz = warpZ(x, z);
        let m = 0.22 + 0.32 * nZone.fbm(wx / 120, wz / 120, 2) + 0.18 * nZone.noise(wx / 26 + 50, wz / 26 - 30);
        m -= 3.2 * clamp(farH[k] - farBlur[k], -0.12, 0.12);
        m *= smoothstep(-122, -100, zz);
        mud = smoothstep(0.32, 0.78, m);
        sh = 0.9 * Math.exp(-(((zz + 139.5) / 2.5) ** 2));
      }
      farMat[k * 4] = Math.round(mud * 255);
      farMat[k * 4 + 1] = Math.round(clamp(sh, 0, 1) * 255);
    }
  }

  // ---------------------------------------------------------------- boulders: old concrete blocks and stones on the beach
  const boulders: Boulder[] = [];
  const br = mulberry32(seed + 404);
  for (let t = 0; t < 400 && boulders.length < 26; t++) {
    const x = (br() * 2 - 1) * 190;
    const z = -150 + br() * 60 + shoreOffset(shore, x);
    const zz = z - shoreZ(x);
    if (zz < -175 || zz > -95) continue;
    if (boulders.some((b) => Math.hypot(b.x - x, b.z - z) < 3)) continue;
    const r = 0.18 + 0.55 * br() * br();
    boulders.push({ x, z, r, rot: br() * 6.28, seed: Math.floor(br() * 1e6), kind: br() < 0.45 ? 0 : 1 });
  }

  progress?.('仕上げ', 0.96);
  return {
    seed,
    fine: { n: fineN, size: FINE_SIZE, cell: FINE_CELL, origin: fineO, height: fineH, mat, rip, flow, creek },
    far: { n: farN, size: FAR_SIZE, cell: FAR_CELL, origin: farO, height: farH, mat: farMat },
    channels,
    boulders,
    outfall: { x: ox, z: oz, dir: main.pts.length > 4 ? Math.atan2(main.pts[3] - main.pts[1], main.pts[2] - main.pts[0]) : seaward },
    shore,
    wind,
  };
}

/** Separable box blur, `passes` times (≈ Gaussian), radius r cells, clamped edges. */
export function boxBlur(src: Float32Array, n: number, r: number, passes: number): Float32Array {
  const a = Float32Array.from(src);
  const b = new Float32Array(n * n);
  const w = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      const row = j * n;
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[row + clamp(i, 0, n - 1)];
      for (let i = 0; i < n; i++) {
        b[row + i] = s / w;
        s += a[row + Math.min(n - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += b[clamp(j, 0, n - 1) * n + i];
      for (let j = 0; j < n; j++) {
        a[j * n + i] = s / w;
        s += b[Math.min(n - 1, j + r + 1) * n + i] - b[Math.max(0, j - r) * n + i];
      }
    }
  }
  return a;
}
