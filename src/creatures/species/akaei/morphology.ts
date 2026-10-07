/**
 * アカエイ Hemitrygon akajei: body plan, traced from the 70 reference photos (docs/models/akaei/README.md lists them)
 * and the species literature. Everything is in units of the disc width (DW = 1); the model is scaled by the individual's
 * disc width. Frame: +Z toward the snout, +Y dorsal, +X the animal's left; origin on the margin plane under the middle
 * of the trunk (the widest point of the disc is a little ahead of it).
 *
 * Evidence tags: [PHOTO nnn] measured on that photo, [LIT] species literature (Last et al. 2016, FishBase), [EST] estimate.
 */

/** a smooth curve through (x, y) control points: monotone cubic (no overshoot between stations) */
export class Curve {
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly ms: number[];
  constructor(points: [number, number][]) {
    const p = [...points].sort((a, b) => a[0] - b[0]);
    this.xs = p.map((q) => q[0]);
    this.ys = p.map((q) => q[1]);
    const n = p.length, d: number[] = [], m: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((this.ys[i + 1] - this.ys[i]) / (this.xs[i + 1] - this.xs[i]));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    this.ms = m;
  }
  at(x: number): number {
    const xs = this.xs, n = xs.length;
    if (x <= xs[0]) return this.ys[0];
    if (x >= xs[n - 1]) return this.ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.ys[i] + (t3 - 2 * t2 + t) * h * this.ms[i] + (-2 * t3 + 3 * t2) * this.ys[i + 1] + (t3 - t2) * h * this.ms[i + 1];
  }
}

const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** polynomial smooth minimum: the rounded corner where two margins meet */
const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export const MORPH = {
  // ------------------------------------------------------------------ disc
  /** snout tip; the snout is triangular and slightly produced [LIT, PHOTO 006, 014, 045] */
  zSnout: 0.47,
  /** the broadly rounded outer corner of the pectoral fin, a little ahead of mid-disc [PHOTO 014, 035, 045] */
  zApex: 0.06,
  /** the free rear corner of the pectoral fin over the pelvic fins: DW / DL = 1.2 [LIT 1.1–1.2, PHOTO 014, 047] */
  zRear: -0.36,
  /** the end of the trunk where the tail tube takes over */
  zEnd: -0.445,
  /** anterior margin: nearly straight, a shallow concavity just behind the snout and convex toward the apex [PHOTO 006, 035, 045] */
  anteriorCurve: 0.32,
  /** posterior margin convex [LIT], the free rear tip bluntly rounded [PHOTO 012, 029, 047] */
  posteriorExp: 1.75,
  rearHalfWidth: 0.12,
  apexRound: 0.06,
  /** pelvic fins showing behind the disc either side of the tail base [PHOTO 012, 045, 047, 052] */
  pelvic: [[-0.36, 0.12], [-0.372, 0.086], [-0.39, 0.1], [-0.41, 0.093], [-0.428, 0.064], [-0.445, 0.034]] as [number, number][],

  // ------------------------------------------------------------------ thickness (DW units)
  /** half-width of the trunk (the raised, rigid body over the skull, gills and gut) [PHOTO 005, 006, 056] */
  trunkHalfWidth: [[0.47, 0.0], [0.43, 0.05], [0.36, 0.105], [0.27, 0.14], [0.2, 0.152], [0.08, 0.158], [-0.05, 0.165], [-0.18, 0.15], [-0.3, 0.122], [-0.37, 0.1], [-0.42, 0.07], [-0.445, 0.034]] as [number, number][],
  /** dorsal height of the trunk above the margin plane: "disc relatively thick" [LIT], domed behind the spiracles [PHOTO 005, 056, 069] */
  trunkHeight: [[0.47, 0.003], [0.42, 0.01], [0.34, 0.024], [0.25, 0.039], [0.15, 0.053], [0.02, 0.065], [-0.1, 0.067], [-0.22, 0.06], [-0.32, 0.048], [-0.4, 0.036], [-0.445, 0.024]] as [number, number][],
  /** ventral depth of the trunk below the margin plane: the belly is flat, a little full behind the gills [PHOTO 045, 047, 055] */
  trunkDepth: [[0.47, 0.003], [0.4, 0.008], [0.3, 0.015], [0.2, 0.019], [0.1, 0.023], [-0.05, 0.029], [-0.2, 0.031], [-0.32, 0.026], [-0.4, 0.02], [-0.445, 0.016]] as [number, number][],
  /** thickness of the pectoral fin where it leaves the trunk, thinning to a rounded edge [PHOTO 004, 008, 069] */
  finHeight: [[0.47, 0.002], [0.35, 0.012], [0.2, 0.018], [0.05, 0.02], [-0.15, 0.018], [-0.3, 0.012], [-0.37, 0.008], [-0.445, 0.006]] as [number, number][],
  rimHalf: 0.0022,

  // ------------------------------------------------------------------ head
  /** eyes on raised orbits ~ a quarter of the disc length behind the snout [PHOTO 005, 006, 014, 037] */
  eye: { x: 0.08, z: 0.262, r: 0.0165, orbitR: 0.022, orbitH: 0.012 },
  /** spiracles right behind the eyes and larger than them, opening up and slightly back [PHOTO 005, 006, 011, 027, 056] */
  spiracle: { x: 0.088, z: 0.208, rx: 0.019, rz: 0.03, yaw: 0.26, depth: 0.007 },
  /** mouth a transverse, gently arched slit under the eyes; nostrils and the nasal curtain in front [PHOTO 047, 049, 050, 055] */
  mouth: { z: 0.245, halfW: 0.037, arch: 0.008 },
  nostril: { x: 0.03, z: 0.268, len: 0.022 },
  /** five pairs of gill slits in arcs converging backward [PHOTO 047–052, 055] */
  gills: [
    { x: 0.098, z: 0.182, len: 0.03, ang: 0.42 },
    { x: 0.097, z: 0.155, len: 0.029, ang: 0.36 },
    { x: 0.094, z: 0.128, len: 0.027, ang: 0.3 },
    { x: 0.089, z: 0.103, len: 0.024, ang: 0.24 },
    { x: 0.083, z: 0.08, len: 0.02, ang: 0.16 },
  ],
  cloaca: { z: -0.385, halfW: 0.012 },

  // ------------------------------------------------------------------ tail
  /** tail length from the pelvic fins, intact; tips are often lost [LIT < 1–1.6 DW, PHOTO 012, 014, 029, 061] */
  tailLength: 1.45,
  /** where the tail tube starts (inside the trunk, so the join is hidden) */
  tailStart: -0.405,
  /** depressed at the base, tapering to the sting, then a whip [LIT, PHOTO 007, 012, 014] */
  tailHalfWidth: [[-0.03, 0.037], [0.0, 0.034], [0.1, 0.027], [0.25, 0.019], [0.35, 0.016], [0.5, 0.0115], [0.7, 0.007], [0.9, 0.0038], [1.0, 0.0014]] as [number, number][],
  tailHalfHeight: [[-0.03, 0.022], [0.0, 0.02], [0.1, 0.018], [0.25, 0.0145], [0.35, 0.0125], [0.5, 0.009], [0.7, 0.0058], [0.9, 0.0034], [1.0, 0.0013]] as [number, number][],
  /** a skin fold under the tail behind the sting, a low keel on top [LIT, PHOTO 007, 014] */
  ventralFold: { s0: 0.33, s1: 0.76, h: 0.013 },
  dorsalKeel: { s0: 0.37, s1: 0.7, h: 0.0045 },
  /** the serrated sting on top of the tail at about 30 % of its length, ~ 0.13 DW long [LIT, PHOTO 007, 035] */
  sting: { s: 0.268, len: 0.14, halfW: 0.0082, halfT: 0.002, lift: 0.13, teeth: 26 },
  /** small spear-shaped thorns on the midline in front of the sting (adults) [LIT] */
  thorns: [0.165, 0.2, 0.232],
};

export const DISC = {
  /** disc length (snout to the free rear corner of the pectorals) in DW */
  length: MORPH.zSnout - MORPH.zRear,
  span: MORPH.zSnout - MORPH.zEnd,
};

const trunkW = new Curve(MORPH.trunkHalfWidth);
const trunkH = new Curve(MORPH.trunkHeight);
const trunkD = new Curve(MORPH.trunkDepth);
const finH = new Curve(MORPH.finHeight);
const pelvic = new Curve(MORPH.pelvic);
const tailW = new Curve(MORPH.tailHalfWidth);
const tailH = new Curve(MORPH.tailHalfHeight);

function rawHalfWidth(z: number): number {
  const M = MORPH;
  if (z >= M.zSnout) return 0;
  if (z < M.zRear) return pelvic.at(z);
  const q = (M.zSnout - z) / (M.zSnout - M.zApex);
  const ant = 0.5 * (q + M.anteriorCurve * q * (1 - q) * (q - 0.3));
  const t = (M.zApex - z) / (M.zApex - M.zRear);
  const post = t <= 0 ? 0.5 : M.rearHalfWidth + (0.5 - M.rearHalfWidth) * Math.pow(Math.max(0, 1 - Math.pow(t, M.posteriorExp)), 0.85);
  // the snout tip itself is rounded off a little
  const tip = smoothstep(0, 0.022, M.zSnout - z);
  return smin(ant, post, M.apexRound) * (0.45 + 0.55 * tip);
}

/** the rounded apex pulls the widest point in: rescale so the disc is exactly one DW across */
const WIDTH_NORM = (() => { let m = 0; for (let z = MORPH.zRear; z < MORPH.zSnout; z += 0.0005) m = Math.max(m, rawHalfWidth(z)); return 0.5 / m; })();

/** half-width of the outline at z (the disc, then the pelvic fins) */
export function halfWidth(z: number): number {
  const w = rawHalfWidth(z);
  return z < MORPH.zRear ? w : w * WIDTH_NORM;
}

const gauss = (dx: number, dz: number, rx: number, rz: number): number => Math.exp(-(dx * dx) / (rx * rx) - (dz * dz) / (rz * rz));

/** the soft, rigid trunk: 1 on the midline, 0 where the pectoral fin begins (with zero slope) */
export function trunkBump(x: number, z: number, scale = 1): number {
  const b = trunkW.at(z) * scale;
  if (b <= 1e-5) return 0;
  const s = Math.abs(x) / b;
  return s >= 1 ? 0 : (1 - s * s) * (1 - s * s);
}

/** half-width of the trunk at z */
export function trunkHalfWidth(z: number): number { return trunkW.at(z); }

/** dorsal surface height above the margin plane at (x, z) inside the outline */
export function dorsalHeight(x: number, z: number): number {
  const M = MORPH;
  const w = Math.max(1e-5, halfWidth(z));
  const u = Math.min(1, Math.abs(x) / w);
  const F = finH.at(z), T = trunkH.at(z);
  const one = Math.max(0, 1 - u * u);
  let h = M.rimHalf * Math.sqrt(one) + F * Math.pow(one, 1.3) + Math.max(0, T - F) * trunkBump(x, z);
  const ax = Math.abs(x);
  // raised orbits, the spiracles' hollows behind them, a faint ridge over the spine
  const E = M.eye, S = M.spiracle;
  h += E.orbitH * gauss(ax - E.x, z - E.z, E.orbitR, E.orbitR * 1.1);
  const sx = ax - S.x, sz = z - S.z, cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
  const su = sx * cy - sz * sy, sv = sx * sy + sz * cy;
  const sd = Math.hypot(su / S.rx, sv / S.rz);
  h += 0.004 * Math.exp(-((sd - 1.05) ** 2) / 0.08) - S.depth * Math.exp(-sd * sd * 1.6);
  h += 0.0025 * Math.exp(-(x * x) / (0.02 * 0.02)) * smoothstep(0.15, 0.0, z) * smoothstep(-0.45, -0.3, z);
  return h;
}

/** ventral depth below the margin plane (positive down) at (x, z) */
export function ventralDepth(x: number, z: number): number {
  const M = MORPH;
  const w = Math.max(1e-5, halfWidth(z));
  const u = Math.min(1, Math.abs(x) / w);
  const F = finH.at(z) * 0.55, V = trunkD.at(z);
  const one = Math.max(0, 1 - u * u);
  return M.rimHalf * Math.sqrt(one) + F * Math.pow(one, 1.3) + Math.max(0, V - F) * trunkBump(x, z, 0.92);
}

/** the tail's cross-section half-axes at s (0 base … 1 tip; s < 0 runs inside the trunk) */
export function tailSection(s: number): { a: number; c: number } {
  return { a: tailW.at(s), c: tailH.at(s) };
}

/** the depth of the tail's ventral fold and dorsal keel at s */
export function tailFins(s: number): { fold: number; keel: number } {
  const F = MORPH.ventralFold, K = MORPH.dorsalKeel;
  const fold = F.h * smoothstep(F.s0, F.s0 + 0.06, s) * (1 - smoothstep(F.s1 - 0.18, F.s1, s));
  const keel = K.h * smoothstep(K.s0, K.s0 + 0.05, s) * (1 - smoothstep(K.s1 - 0.15, K.s1, s));
  return { fold, keel };
}

/** z of the tail at arc length s (bind pose: straight back from the trunk) */
export function tailZ(s: number): number { return MORPH.zEnd - s * MORPH.tailLength; }
