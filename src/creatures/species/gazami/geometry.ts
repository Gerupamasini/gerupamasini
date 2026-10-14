import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import {
  ABDOMEN, ANTENNA, ANTENNULE, BIND, CARAPACE, DACTYL_HINGE, ENVELOPE_BACK, EYE, MXP3, ORBIT, domeProfile, dorsalRelief, legSpecs,
  marginHeight, marginTeeth, type ArticleSpec, type LegId, type LegSpec, type ToothSpec, type V2,
} from './anatomy';
import { GeoBuilder, PART, knotLerp, noise2, smooth } from './mesh';
import { Rng } from '../../../core/Rng';

/** how finely one tier is built */
export interface Lod {
  tier: 0 | 1 | 2;
  /** mm between samples of the smooth margins; columns across one tooth's base (even) and rows out to its tip */
  envStep: number;
  toothCols: number;
  toothRows: number;
  /** rings of the dome (s from the centre to the margin) */
  dome: number[];
  /** rings of the underside (fractions towards the pleural line), of the body wall and the sternum */
  under: number;
  /** sections round an article and mm between sections along it */
  legRadial: number;
  legStep: number;
  spines: boolean;
  spineSides: number;
  fingerTeeth: boolean;
  setae: boolean;
  eyeSeg: number;
  antennae: boolean;
}

export const LODS: Lod[] = [
  { tier: 0, envStep: 1.1, toothCols: 8, toothRows: 6, dome: [0.06, 0.12, 0.19, 0.26, 0.33, 0.4, 0.47, 0.54, 0.6, 0.66, 0.72, 0.77, 0.82, 0.86, 0.9, 0.93, 0.955, 0.975, 0.99, 1], under: 1, legRadial: 18, legStep: 1.1, spines: true, spineSides: 8, fingerTeeth: true, setae: true, eyeSeg: 22, antennae: true },
  { tier: 1, envStep: 2.6, toothCols: 4, toothRows: 3, dome: [0.14, 0.3, 0.46, 0.6, 0.72, 0.82, 0.9, 0.96, 1], under: 0.6, legRadial: 9, legStep: 3.2, spines: true, spineSides: 4, fingerTeeth: false, setae: false, eyeSeg: 10, antennae: true },
  { tier: 2, envStep: 7.5, toothCols: 2, toothRows: 1, dome: [0.35, 0.7, 0.92, 1], under: 0.3, legRadial: 5, legStep: 9, spines: false, spineSides: 3, fingerTeeth: false, setae: false, eyeSeg: 5, antennae: false },
];

// ------------------------------------------------------------------ the rig

export interface BoneDef {
  name: string;
  parent: string | null;
  /** rest transform relative to the parent (mm), and the bind matrix in the model's frame (mm) */
  pos: Vector3;
  quat: Quaternion;
  matrix: Matrix4;
  /** inverse bind matrix in metres (for the skeleton) */
  inverse: Matrix4;
}

export type Side = 'L' | 'R';
export const SIDES: Side[] = ['L', 'R'];
export const ARTICLES = ['cx', 'bi', 'me', 'ca', 'pr', 'da'] as const;
export const legBone = (leg: LegId, side: Side, a: (typeof ARTICLES)[number]) => `J_${leg}${side}_${a}`;

export interface LegRig {
  id: LegId;
  side: Side;
  /** +1 left, −1 right */
  sg: number;
  /** the side's own article lengths (mm) and spec */
  spec: LegSpec;
  lengths: number[];
  /** rest yaw of the coxa (rad from the outward x towards +z, mirrored for the right) */
  yaw: number;
  coxa: Vector3;
}

export interface RigDef {
  defs: BoneDef[];
  byName: Record<string, number>;
  legs: LegRig[];
}

const _q = new Quaternion(), _q2 = new Quaternion();
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);

/** the frame of a leg at its coxa: x out along the rest yaw (and down by the pitch), y up, right-handed */
export function coxaFrame(yaw: number, sg: number, out: Quaternion): Quaternion {
  const x = new Vector3(sg * Math.cos(yaw), 0, Math.sin(yaw));
  const y = new Vector3(0, 1, 0);
  const z = new Vector3().crossVectors(x, y);
  const m = new Matrix4().makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}

/** the side's small differences: a real shell and real legs are never mirror images (fixed seed: the species' model) */
function sideRng(side: Side, k: number): Rng { return new Rng(0x6a5a + (side === 'L' ? 0 : 7919) + k * 131); }

export function rigDefinition(): RigDef {
  const defs: BoneDef[] = [];
  const byName: Record<string, number> = {};
  const add = (name: string, parent: string | null, pos: Vector3, quat: Quaternion) => {
    const local = new Matrix4().compose(pos, quat, new Vector3(1, 1, 1));
    const matrix = parent ? new Matrix4().multiplyMatrices(defs[byName[parent]].matrix, local) : local.clone();
    const m = matrix.clone();
    const e = m.elements;
    e[12] *= 0.001; e[13] *= 0.001; e[14] *= 0.001;
    byName[name] = defs.length;
    defs.push({ name, parent, pos: pos.clone(), quat: quat.clone(), matrix, inverse: m.invert() });
  };
  add('J_root', null, new Vector3(), new Quaternion());
  add('J_body', 'J_root', new Vector3(), new Quaternion());
  const legs: LegRig[] = [];
  for (const side of SIDES) {
    const sg = side === 'L' ? 1 : -1;
    for (const [li, spec] of legSpecs().entries()) {
      const rng = sideRng(side, 10 + li);
      const lengths = spec.articles.map((a) => a.length * (1 + (rng.next() - 0.5) * 0.03));
      const coxa = new Vector3(sg * (spec.coxa[0] + (rng.next() - 0.5) * 0.3), spec.coxa[1], spec.coxa[2] + (rng.next() - 0.5) * 0.3);
      const yaw = spec.yaw + (rng.next() - 0.5) * 0.04;
      const b = BIND[spec.id];
      const n = (a: (typeof ARTICLES)[number]) => legBone(spec.id, side, a);
      add(n('cx'), 'J_body', coxa, coxaFrame(yaw, sg, new Quaternion()).multiply(_q.setFromAxisAngle(AZ, b.pitch)));
      add(n('bi'), n('cx'), new Vector3(lengths[0], 0, 0), new Quaternion().setFromAxisAngle(AZ, b.lev));
      // (turns about y and x run the other way on the right: its frame is the left's mirror image made right-handed)
      add(n('me'), n('bi'), new Vector3(lengths[1], 0, 0), new Quaternion().setFromAxisAngle(AY, sg * (b.meYaw ?? 0)).multiply(_q.setFromAxisAngle(AX, sg * b.roll)));
      add(n('ca'), n('me'), new Vector3(lengths[2], 0, 0), new Quaternion().setFromAxisAngle(AY, sg * (b.mcYaw ?? 0)).multiply(_q.setFromAxisAngle(AZ, b.mc)));
      add(n('pr'), n('ca'), new Vector3(lengths[3], 0, 0), new Quaternion().setFromAxisAngle(AZ, b.cp));
      const daPos = spec.id === 'P1' ? new Vector3(lengths[4] * DACTYL_HINGE.t, DACTYL_HINGE.y, 0) : new Vector3(lengths[4], 0, 0);
      add(n('da'), n('pr'), daPos, new Quaternion().setFromAxisAngle(AZ, b.pd));
      legs.push({ id: spec.id, side, sg, spec, lengths, yaw, coxa });
    }
    // eyes, antennae, antennules, third maxillipeds
    const eyeDir = new Vector3(sg * EYE.dir[0], EYE.dir[1], EYE.dir[2]).normalize();
    add(`J_eye_${side}`, 'J_body', new Vector3(sg * EYE.base[0], EYE.base[1], EYE.base[2]), frameAlong(eyeDir, sg, new Quaternion()));
    const aDir = new Vector3(sg * ANTENNA.dir[0], ANTENNA.dir[1], ANTENNA.dir[2]).normalize();
    add(`J_a2_${side}`, 'J_body', new Vector3(sg * ANTENNA.base[0], ANTENNA.base[1], ANTENNA.base[2]), frameAlong(aDir, sg, new Quaternion()));
    add(`J_a1_${side}`, 'J_body', new Vector3(sg * ANTENNULE.base[0], ANTENNULE.base[1], ANTENNULE.base[2]), frameAlong(new Vector3(sg * 0.95, 0.12, 0.25).normalize(), sg, new Quaternion()));
    // (the plates slope down and back from their front edge: a turn about x)
    add(`J_mxp_${side}`, 'J_body', new Vector3(sg * MXP3.halfWidth, MXP3.y, MXP3.z0), new Quaternion().setFromAxisAngle(AX, MXP3.slope));
  }
  return { defs, byName, legs };
}

/** a frame whose x runs along `dir` with y as near the world's up as it can be (z = x × y) */
function frameAlong(dir: Vector3, _sg: number, out: Quaternion): Quaternion {
  const x = dir.clone().normalize();
  const y = new Vector3(0, 1, 0).addScaledVector(x, -x.y).normalize();
  const z = new Vector3().crossVectors(x, y);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

// ------------------------------------------------------------------ the margin's outline

interface PlacedTooth {
  spec: ToothSpec;
  tip: V2;
  /** base corners on the envelope (anterior, posterior) and the base's middle */
  a: V2;
  b: V2;
  mid: V2;
  /** columns of the loop it spans [i0, i1] (filled in by the loop) */
  i0: number;
  i1: number;
}

interface EnvSample { x: number; z: number; ym: number; tooth: number }

/** the teeth of one side, placed (the side's own jitter) */
function placeTeeth(side: Side): PlacedTooth[] {
  const rng = sideRng(side, 1);
  const specs = marginTeeth();
  // directions of the teeth (rad from +x towards +z): the frontal teeth straight forward, the anterolateral ones
  // leaning less forward towards the spine (61: near the orbit almost forward, by T8 about 45°)
  const dirs: Record<string, number> = { F1: 1.54, F2: 1.47, IO: 1.36, T1: 1.31, T2: 1.22, T3: 1.13, T4: 1.05, T5: 0.98, T6: 0.91, T7: 0.86, T8: 0.8 };
  const out: PlacedTooth[] = [];
  for (const s0 of specs) {
    const s: ToothSpec = { ...s0, length: s0.length * (1 + (rng.next() - 0.5) * (s0.conical ? 0.07 : 0.12)), lift: s0.lift + (rng.next() - 0.5) * (s0.conical ? 0.5 : 0.15) };
    const tip: V2 = [s0.tip[0] + (rng.next() - 0.5) * (s0.conical ? 0.6 : 0.35), s0.tip[1] + (rng.next() - 0.5) * (s0.conical ? 0.7 : 0.3)];
    if (s.conical) {
      // the spine's base: from behind T8 to the start of the posterolateral margin
      const a: V2 = [39.7, -1.0], b: V2 = [ENVELOPE_BACK[0][0], ENVELOPE_BACK[0][1]];
      const mid: V2 = [(a[0] + b[0]) / 2 - 0.4, (a[1] + b[1]) / 2];
      // keep the spine's length as specified from its base's middle
      const dx = tip[0] - mid[0], dz = tip[1] - mid[1], L = Math.hypot(dx, dz);
      const k = s.length / L;
      out.push({ spec: s, tip: [mid[0] + dx * k, mid[1] + dz * k], a, b, mid, i0: 0, i1: 0 });
      continue;
    }
    const ang = dirs[s.name] + (rng.next() - 0.5) * 0.06;
    const d: V2 = [Math.cos(ang), Math.sin(ang)];
    const mid: V2 = [tip[0] - d[0] * s.length, tip[1] - d[1] * s.length];
    out.push({ spec: s, tip, a: mid, b: mid, mid, i0: 0, i1: 0 });
  }
  // base corners: the anterolateral teeth share their corners (V notches between them), the frontal teeth and T1
  // take their half width along the margin
  const al = out.filter((t) => /^T[1-8]$/.test(t.spec.name));
  for (let k = 0; k < al.length; k++) {
    const t = al[k];
    if (k > 0) t.a = [(al[k - 1].mid[0] + t.mid[0]) / 2, (al[k - 1].mid[1] + t.mid[1]) / 2];
    if (k < al.length - 1) t.b = [(al[k + 1].mid[0] + t.mid[0]) / 2, (al[k + 1].mid[1] + t.mid[1]) / 2];
  }
  // T1's front corner on the orbit's outer edge; T8's back corner at the spine's base
  const t1 = al[0], t8 = al[al.length - 1], spine = out[out.length - 1];
  {
    const tx = t1.b[0] - t1.mid[0], tz = t1.b[1] - t1.mid[1], l = Math.hypot(tx, tz);
    t1.a = [t1.mid[0] - (tx / l) * t1.spec.base, t1.mid[1] - (tz / l) * t1.spec.base];
  }
  // T8's back corner a half base behind its middle, along the margin; the spine's base starts there
  {
    const tx = t8.mid[0] - al[al.length - 2].mid[0], tz = t8.mid[1] - al[al.length - 2].mid[1], l = Math.hypot(tx, tz);
    t8.b = [t8.mid[0] + (tx / l) * t8.spec.base, t8.mid[1] + (tz / l) * t8.spec.base];
    spine.a = t8.b;
    const b = spine.b;
    spine.mid = [(spine.a[0] + b[0]) / 2 - 0.4, (spine.a[1] + b[1]) / 2];
    const dx = spine.tip[0] - spine.mid[0], dz = spine.tip[1] - spine.mid[1], L = Math.hypot(dx, dz);
    const k = spine.spec.length / L;
    spine.tip = [spine.mid[0] + dx * k, spine.mid[1] + dz * k];
  }
  for (const t of out) {
    if (!/^(F1|F2|IO)$/.test(t.spec.name)) continue;
    t.a = [t.mid[0] - t.spec.base, t.mid[1] + 0.05];
    t.b = [t.mid[0] + t.spec.base, t.mid[1] - 0.05];
  }
  return out;
}

/** a quadratic through a, m (at its middle) and b */
const quadThrough = (a: V2, m: V2, b: V2, t: number): V2 => {
  const c: V2 = [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2];
  return [(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]];
};

/** points along a polyline through the knots (Catmull-Rom), about `step` apart, without the first point */
function smoothRun(knots: V2[], step: number): V2[] {
  if (knots.length < 2) return [];
  const pts: V2[] = [];
  const P = (i: number) => knots[Math.max(0, Math.min(knots.length - 1, i))];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return pts;
}

/**
 * The half outline of one side from the front's centre to the posterior margin's centre: the envelope sampled for
 * the tier, each tooth's base on exactly `toothCols` + 1 samples.
 */
function halfOutline(side: Side, lod: Lod): { env: EnvSample[]; teeth: PlacedTooth[] } {
  const teeth = placeTeeth(side);
  const rng = sideRng(side, 2);
  const env: EnvSample[] = [];
  const push = (p: V2, tooth: number) => {
    const ym = marginHeight(p[0], p[1]) + (rng.next() - 0.5) * 0.08;
    env.push({ x: p[0], z: p[1], ym, tooth });
  };
  const toothRun = (k: number) => {
    const t = teeth[k];
    const m = lod.toothCols;
    // (the first corner is already the last sample)
    for (let c = 1; c <= m; c++) push(quadThrough(t.a, t.mid, t.b, c / m), c < m ? k : -1);
    t.i1 = env.length - 1;
    t.i0 = t.i1 - m;
  };
  const byName = (n: string) => teeth.findIndex((t) => t.spec.name === n);
  push([0, CARAPACE.front - 0.25], -1);
  /** a straight run from the last sample to `b` (ending on b) */
  const straight = (b: V2) => {
    const l = env[env.length - 1];
    const d = Math.hypot(b[0] - l.x, b[1] - l.z);
    if (d < 0.05) return;
    const n = Math.max(1, Math.round(d / lod.envStep));
    for (let k = 1; k <= n; k++) push([l.x + ((b[0] - l.x) * k) / n, l.z + ((b[1] - l.z) * k) / n], -1);
  };
  // the median notch to F1, F2, the inner orbital angle
  for (const name of ['F1', 'F2', 'IO']) {
    const k = byName(name);
    straight(teeth[k].a);
    toothRun(k);
  }
  // the orbital notch: a rounded dip from the inner orbital angle to T1's front corner (61, 19, 64)
  {
    const l = env[env.length - 1];
    const s0: V2 = [l.x, l.z], s1 = teeth[byName('T1')].a;
    const d = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
    const n = Math.max(3, Math.round(d / Math.min(lod.envStep, 1.4)));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const dip = ORBIT.depth * Math.pow(Math.sin(Math.PI * u), 0.75) * (1 - 0.15 * u);
      push([s0[0] + (s1[0] - s0[0]) * u + 0.25 * dip * Math.sin(Math.PI * u), s0[1] + (s1[1] - s0[1]) * u - dip], -1);
    }
  }
  for (let k = byName('T1'); k <= byName('T9'); k++) toothRun(k);
  // the posterolateral and posterior margins
  for (const p of smoothRun([[env[env.length - 1].x, env[env.length - 1].z], ...ENVELOPE_BACK.slice(1)], lod.envStep)) push(p, -1);
  env[env.length - 1].x = 0;
  return { env, teeth };
}

/** a whole outline: the left half front to back, then the right half back to front (x mirrored) */
export function outline(lod: Lod): { loop: EnvSample[]; teeth: { t: PlacedTooth; sg: number }[] } {
  const L = halfOutline('L', lod), R = halfOutline('R', lod);
  const loop: EnvSample[] = L.env.slice();
  const nL = L.env.length;
  const teeth: { t: PlacedTooth; sg: number }[] = L.teeth.map((t) => ({ t, sg: 1 }));
  // the right half reversed, without its first (front centre) and last (back centre) samples, which the left has
  const rEnv = R.env;
  for (let i = rEnv.length - 2; i >= 1; i--) loop.push({ ...rEnv[i], x: -rEnv[i].x, tooth: rEnv[i].tooth >= 0 ? rEnv[i].tooth + 100 : -1 });
  // the right teeth's columns: the reversed index of their samples
  const idxR = (i: number) => nL + (rEnv.length - 2 - i);
  for (const t of R.teeth) {
    const i0 = idxR(t.i1), i1 = idxR(t.i0);
    const tt = { ...t, tip: [-t.tip[0], t.tip[1]] as V2, a: [-t.b[0], t.b[1]] as V2, b: [-t.a[0], t.a[1]] as V2, mid: [-t.mid[0], t.mid[1]] as V2, i0, i1 };
    teeth.push({ t: tt, sg: -1 });
  }
  return { loop, teeth };
}

// ------------------------------------------------------------------ the carapace and the body

const C = CARAPACE;
/** ray from the outline's centre through (x, z) meets an ellipse (cx 0, centre z zc, half axes ax, az): the factor along the ray */
function rayEllipse(dx: number, dz: number, ax: number, zc: number, az: number): number {
  const cz = C.centre[1] - zc;
  const A = (dx * dx) / (ax * ax) + (dz * dz) / (az * az);
  const B = (2 * cz * dz) / (az * az);
  const Cc = (cz * cz) / (az * az) - 1;
  const disc = Math.max(0, B * B - 4 * A * Cc);
  return (-B + Math.sqrt(disc)) / (2 * A);
}

/**
 * The carapace and the body as one closed skin: the dorsal dome (polar rings over the outline) over the free margin,
 * the teeth and the lateral spines grown out of the margin as their own patches (their base rows are the margin's
 * vertices: no seam), and round under the margin the underside, the body wall over the coxae and the sternum.
 */
export function buildShell(gb: GeoBuilder, lod: Lod, body: number): void {
  const { loop, teeth } = outline(lod);
  const N = loop.length;
  const c = C.centre;
  const e2 = C.edge / 2;
  const Ym0 = 12.4;
  const rings = [0, ...lod.dome];
  const D = rings.length;           // dorsal rows 0 … D-1 (row 0 the pole), row D-1 the margin's top
  const grid: number[][] = [];
  const cavDorsal = (x: number, z: number) => Math.max(0, Math.min(1, -(dorsalRelief(x, z) - dorsalRelief(x + 1.2, z) * 0.5 - dorsalRelief(x - 1.2, z) * 0.5) * 2.2));
  // the dome's height as a function of (x, z) alone: its fall from the centre follows a smoothed outline (so the
  // orbits' notches and the spines' bases do not dent or swell the whole dome along their rays), and only within the
  // margin's band is it drawn to the real margin; its normals come from this function, not from the polar rings
  const ang = loop.map((E) => { const a = Math.atan2(E.x - c[0], E.z - c[1]); return a < 0 ? a + 2 * Math.PI : a; });
  ang[0] = 0;
  const rad = loop.map((E) => Math.hypot(E.x - c[0], E.z - c[1]));
  const radS = new Float64Array(N), ymS = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let w = 0, r = 0, y = 0;
    for (let j = 0; j < N; j++) {
      let d = Math.abs(ang[j] - ang[i]);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const k = Math.exp(-((d / 0.22) ** 2));
      w += k; r += k * rad[j]; y += k * loop[j].ym;
    }
    radS[i] = r / w; ymS[i] = y / w;
  }
  const lookup = (a: number): [number, number, number, number] => {
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ang[mid] <= a) lo = mid; else hi = mid; }
    const i0 = lo, i1 = (lo + 1) % N;
    const a1 = i1 === 0 ? 2 * Math.PI : ang[i1];
    const f = Math.max(0, Math.min(1, (a - ang[i0]) / Math.max(1e-9, a1 - ang[i0])));
    const L = (u: ArrayLike<number>) => u[i0] + (u[i1] - u[i0]) * f;
    return [L(rad), L(radS), loop[i0].ym + (loop[i1].ym - loop[i0].ym) * f, L(ymS)];
  };
  const domeAt = (x: number, z: number, d: number, Rs: number, yms: number) => {
    const ss = Math.min(1, d / Rs);
    const unev = (noise2(x * 0.11 + 3.1, z * 0.11, 11) - 0.5) * 0.3 * (1 - ss * ss);
    return Ym0 + (yms - Ym0) * ss * ss + C.dome * domeProfile(ss) + unev;
  };
  const H = (x: number, z: number) => {
    let a = Math.atan2(x - c[0], z - c[1]);
    if (a < 0) a += 2 * Math.PI;
    const [R, Rs, ym, yms] = lookup(a);
    const d = Math.hypot(x - c[0], z - c[1]);
    const q = d / R;
    const hs = domeAt(x, z, d, Rs, yms);
    // the margin's band: drawn from the smooth dome down to the real margin at the outline
    const atRim = domeAt(x, z, R, Rs, yms);
    const w = smooth(0.62, 1.0, q);
    const relief = dorsalRelief(x, z) * (1 - smooth(0.8, 1.0, q));
    return hs + (ym - atRim) * w * w + relief + e2;
  };
  const hN = 0.12;
  const domeV = (x: number, y: number, z: number, s: number, u: number, cav: number) => {
    const dx = (H(x + hN, z) - H(x - hN, z)) / (2 * hN), dz = (H(x, z + hN) - H(x, z - hN)) / (2 * hN);
    const l = Math.hypot(dx, 1, dz);
    return gb.vn(x, y, z, -dx / l, 1 / l, -dz / l, body, 1, body, PART.DORSUM, s, u, cav);
  };
  // the pole
  const pole = domeV(c[0], H(c[0], c[1]), c[1], 0, 0, 0);
  for (let r = 1; r < D; r++) {
    const s = rings[r];
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const E = loop[i];
      const x = c[0] + s * (E.x - c[0]), z = c[1] + s * (E.z - c[1]);
      const y = r < D - 1 ? H(x, z) : E.ym + e2;
      row.push(r < D - 1 ? domeV(x, y, z, s, i / N, cavDorsal(x, z)) : gb.v(x, y, z, body, 1, body, PART.DORSUM, s, i / N, cavDorsal(x, z)));
    }
    grid.push(row);
  }
  // pole fan
  for (let i = 0; i < N; i++) gb.tri(pole, grid[0][i], grid[0][(i + 1) % N]);
  for (let r = 0; r < grid.length - 1; r++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    gb.quad(grid[r][i], grid[r + 1][i], grid[r + 1][j], grid[r][j]);
  }
  const top = grid[grid.length - 1];
  // the margin's underside row
  const bottom: number[] = [];
  for (let i = 0; i < N; i++) {
    const E = loop[i];
    bottom.push(gb.v(E.x, E.ym - e2, E.z, body, 1, body, PART.UNDER, 1, i / N, 0.35));
  }
  // the free margin's band, except under the teeth (their own edges take its place)
  const inTooth = new Uint8Array(N);
  for (const { t } of teeth) for (let i = t.i0; i < t.i1; i++) inTooth[((i % N) + N) % N] = 1;
  for (let i = 0; i < N; i++) {
    if (inTooth[i]) continue;
    const j = (i + 1) % N;
    gb.quad(top[i], bottom[i], bottom[j], top[j]);
  }
  // the teeth and the spines
  for (const { t, sg } of teeth) buildTooth(gb, lod, t, sg, loop, top, bottom, body);
  // the underside: from the margin in to the pleural line, down the body wall to the sternum's edge, over the sternum
  const P = C.pleural, St = C.sternum;
  const plZc = (P.front + P.back) / 2, plAz = (P.front - P.back) / 2;
  const stZc = (St.front + St.back) / 2, stAz = (St.front - St.back) / 2;
  const under: { w: number; dy: (ym: number, py: number) => number; part: number; cav: number }[] = [
    { w: 0.06, dy: (ym) => ym - e2 - 0.35, part: PART.UNDER, cav: 0.45 },
    { w: 0.22, dy: (ym) => ym - e2 - 1.5, part: PART.UNDER, cav: 0.55 },
    { w: 0.42, dy: (ym, py) => 0.62 * (ym - 4.2) + 0.38 * (py + 3.2), part: PART.UNDER, cav: 0.6 },
    { w: 0.66, dy: (_ym, py) => py + 2.6, part: PART.UNDER, cav: 0.7 },
    { w: 0.86, dy: (_ym, py) => py + 0.9, part: PART.UNDER, cav: 0.8 },
    { w: 1.0, dy: (_ym, py) => py, part: PART.UNDER, cav: 0.85 },
  ];
  const wall = [0.35, 0.75, 1.0];
  const sternum = [0.45, 0.8];
  const keep = (k: number, n: number) => lod.under >= 1 || k === n - 1 || (k % Math.round(1 / lod.under)) === 0;
  let prev = bottom;
  const rowsUnder: number[][] = [];
  const plPt: V2[] = [], stPt: V2[] = [], plY: number[] = [];
  for (let i = 0; i < N; i++) {
    const E = loop[i];
    const dx = E.x - c[0], dz = E.z - c[1];
    const kp = Math.min(0.97, rayEllipse(dx, dz, P.ax, plZc, plAz));
    const ks = Math.min(kp - 0.05, rayEllipse(dx, dz, St.ax, stZc, stAz));
    plPt.push([c[0] + dx * kp, c[1] + dz * kp]);
    stPt.push([c[0] + dx * ks, c[1] + dz * ks]);
    const zf = E.z;
    plY.push(zf > 8 ? P.y + (P.yFront - P.y) * smooth(8, 20, zf) : zf < -10 ? P.y + (P.yBack - P.y) * smooth(-10, -20, zf) : P.y);
  }
  under.forEach((u, k) => {
    if (!keep(k, under.length)) return;
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const E = loop[i];
      const x = E.x + (plPt[i][0] - E.x) * u.w, z = E.z + (plPt[i][1] - E.z) * u.w;
      row.push(gb.v(x, u.dy(E.ym, plY[i]), z, body, 1, body, u.part, 1 + u.w, i / N, u.cav));
    }
    rowsUnder.push(row);
  });
  wall.forEach((w, k) => {
    if (!keep(k, wall.length)) return;
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = plPt[i][0] + (stPt[i][0] - plPt[i][0]) * w, z = plPt[i][1] + (stPt[i][1] - plPt[i][1]) * w;
      const y = plY[i] + (St.y + 0.3 - plY[i]) * smooth(0, 1, w) - (w > 0.2 && w < 0.9 ? 0.6 * Math.sin(Math.PI * w) : 0);
      row.push(gb.v(x, y, z, body, 1, body, w < 0.99 ? PART.UNDER : PART.STERNUM, 2 + w, i / N, 0.9 - 0.3 * w));
    }
    rowsUnder.push(row);
  });
  sternum.forEach((w) => {
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = stPt[i][0] + (c[0] - stPt[i][0]) * w, z = stPt[i][1] + (c[1] - stPt[i][1]) * w;
      row.push(gb.v(x, St.y - 0.7 - 0.25 * w, z, body, 1, body, PART.STERNUM, 3 + w, i / N, 0.25));
    }
    rowsUnder.push(row);
  });
  for (const row of rowsUnder) {
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; gb.quad(prev[i], row[i], row[j], prev[j]); }
    prev = row;
  }
  const bpole = gb.v(c[0], St.y - 1.0, c[1], body, 1, body, PART.STERNUM, 4, 0, 0.2);
  for (let i = 0; i < N; i++) gb.tri(bpole, prev[(i + 1) % N], prev[i]);
}

/**
 * One tooth (or the lateral spine) grown out of the margin: its dorsal face from the margin's top row out to its
 * outline, its edge round the outline (thin, to nothing at the tip), its ventral face back to the margin's bottom row.
 */
function buildTooth(gb: GeoBuilder, lod: Lod, t: PlacedTooth, sg: number, loop: EnvSample[], top: number[], bottom: number[], bone: number): void {
  const N = loop.length;
  const m = t.i1 - t.i0;
  if (m <= 0) return;
  const R = t.spec.conical ? lod.toothRows + (lod.tier === 0 ? 4 : 1) : lod.toothRows;
  const col = (k: number) => (((t.i0 + k) % N) + N) % N;
  const O: V2[] = [];
  const A: V2 = [loop[col(0)].x, loop[col(0)].z], B: V2 = [loop[col(m)].x, loop[col(m)].z];
  const cen: V2 = [(A[0] + B[0] + t.tip[0]) / 3, (A[1] + B[1] + t.tip[1]) / 3];
  // which edge leads (towards the front): the anterior corner is A on the left, B on the right (the loop runs back there)
  const front = sg > 0 ? 0 : 1;
  for (let k = 0; k <= m; k++) {
    const u = k / m;
    const firstHalf = u <= 0.5;
    const q = firstHalf ? u / 0.5 : (u - 0.5) / 0.5;
    const P0 = firstHalf ? A : t.tip, P1 = firstHalf ? t.tip : B;
    const p: V2 = [P0[0] + (P1[0] - P0[0]) * q, P0[1] + (P1[1] - P0[1]) * q];
    // the edge's perpendicular, pointing away from the tooth: the leading edge a little convex, the trailing edge
    // straight (the spine's long trailing edge concave, sweeping into the posterolateral margin: 61, 39)
    let nx = -(P1[1] - P0[1]), nz = P1[0] - P0[0];
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    if (nx * (p[0] - cen[0]) + nz * (p[1] - cen[1]) < 0) { nx = -nx; nz = -nz; }
    const leading = (firstHalf ? 0 : 1) === front;
    const amt = (leading ? (t.spec.conical ? 0.45 : 0.25) : (t.spec.conical ? -0.9 : 0.1)) * Math.sin(Math.PI * q);
    p[0] += nx * amt; p[1] += nz * amt;
    O.push(p);
  }
  const thick = t.spec.thick;
  const topRows: number[][] = [], botRows: number[][] = [];
  for (let r = 0; r <= R; r++) {
    const along = r / R;
    const tr: number[] = [], br: number[] = [];
    for (let k = 0; k <= m; k++) {
      if (r === 0) { tr.push(top[col(k)]); br.push(bottom[col(k)]); continue; }
      const E = loop[col(k)];
      const lat = (2 * k) / m - 1;
      const tipness = 1 - Math.abs(lat);
      const x = E.x + (O[k][0] - E.x) * along, z = E.z + (O[k][1] - E.z) * along;
      const yEdge = E.ym + (marginHeight(O[k][0], O[k][1]) + t.spec.lift * tipness - E.ym);
      const yc = E.ym + (yEdge - E.ym) * along;
      // the half thickness: the margin's at the base, the tooth's free edge (thin, to nothing at the tip) at the
      // outline, and a rounded body along the middle (the spine is a robust cone, flattened a little)
      const edgeT = t.spec.conical ? thick * 0.42 * Math.pow(1 - tipness, 0.9) + C.edge * 0.2 * (1 - tipness) : C.edge * Math.pow(1 - tipness, 1.1);
      const body = (thick - C.edge) * 0.5 * (1 - lat * lat) * smooth(0, 0.25, along) * Math.pow(1 - along, 0.8);
      const h = 0.5 * (C.edge * (1 - along) + edgeT * along) + Math.max(0, body);
      const atTip = r === R && k === m / 2;
      tr.push(gb.v(x, yc + (atTip ? 0 : h), z, bone, 1, bone, PART.DORSUM, along, tipness, 0, 4 + along * tipness));
      br.push(atTip ? tr[tr.length - 1] : gb.v(x, yc - h, z, bone, 1, bone, PART.UNDER, along, tipness, 0.3, 4 + along * tipness));
    }
    topRows.push(tr); botRows.push(br);
  }
  for (let r = 0; r < R; r++) for (let k = 0; k < m; k++) {
    gb.quad(topRows[r][k], topRows[r + 1][k], topRows[r + 1][k + 1], topRows[r][k + 1]);
    gb.quad(botRows[r][k], botRows[r][k + 1], botRows[r + 1][k + 1], botRows[r + 1][k]);
  }
  // the edge round the outline
  const T = topRows[R], Bt = botRows[R];
  for (let k = 0; k < m; k++) {
    gb.tri(T[k], Bt[k], Bt[k + 1]);
    gb.tri(T[k], Bt[k + 1], T[k + 1]);
  }
}

// ------------------------------------------------------------------ limbs

const angDist = (a: number, b: number) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };

interface ArticleOut {
  /** the article's surface at (t, a) in its local frame (for spines, teeth, setae) */
  surface(t: number, a: number): { p: Vector3; n: Vector3 };
}

/**
 * One article of a leg in its own frame (x distal from its proximal joint, y dorsal, z anterior for the left side):
 * a lofted tube through the spec's sections (superellipse, costae, the three-sided prism of the cheliped's merus),
 * narrowed to a neck at the proximal joint (the articular membrane) and rounded off beyond the distal joint (into
 * which the next article's neck fits), pointed at the dactylus's tip.
 */
function buildArticle(gb: GeoBuilder, spec: ArticleSpec, L: number, lod: Lod, bone: number, parent: number, part: number, last: boolean): ArticleOut {
  const nA = lod.legRadial;
  const neck = spec.neck ?? 0;
  const n = spec.n ?? 2.2;
  const sec = (t: number) => ({
    hy: knotLerp(spec.sections, t, (k) => k.hy), hz: knotLerp(spec.sections, t, (k) => k.hz),
    cy: knotLerp(spec.sections, t, (k) => k.cy ?? 0), cz: knotLerp(spec.sections, t, (k) => k.cz ?? 0),
  });
  const twistAt = (t: number) => (spec.twist ? knotLerp(spec.twist.map(([tt, v]) => ({ t: tt, v })), Math.max(0, t), (k) => k.v) : 0);
  const radial = (t: number, a: number) => {
    const s = sec(t);
    const ca = Math.cos(a), sa = Math.sin(a);
    const pw = 2 / n;
    let y = s.hy * Math.sign(ca) * Math.pow(Math.abs(ca), pw);
    let z = s.hz * Math.sign(sa) * Math.pow(Math.abs(sa), pw);
    let k = 1;
    if (spec.tri) k *= 1 + spec.tri[0] * Math.cos(3 * (a - spec.tri[1]));
    // the neck inside the parent's socket and the rim at the distal end
    if (neck > 0) k *= 0.76 + 0.24 * smooth(0.0, neck, t);
    else if (t < 0.02) k *= 0.85 + 7.5 * Math.max(0, t);
    if (!last && t > 0.96) k *= 1 + 0.035 * Math.sin(Math.PI * Math.min(1, (t - 0.96) / 0.04));
    y *= k; z *= k;
    let rid = 0;
    if (spec.costae) for (const [ac, h, w] of spec.costae) rid += h * Math.exp(-((angDist(a, ac) / w) ** 2));
    if (rid) { const l = Math.hypot(ca * s.hz, sa * s.hy) || 1; const f = Math.min(1, Math.min(s.hy, s.hz) / 1.5); y += ((ca * s.hz) / l) * rid * f; z += ((sa * s.hy) / l) * rid * f; }
    // the twist: the section turned about the axis, its anterior face (+z) towards the top (+y)
    const th = twistAt(t);
    if (th) { const c = Math.cos(th), si = Math.sin(th); const y2 = y * c + z * si; z = -y * si + z * c; y = y2; }
    return new Vector3(t * L, s.cy + y, s.cz + z);
  };
  // (the angle round as the shader reads it — top, outer face — follows the twist)
  const angAt = (j: number, t: number) => j / nA - twistAt(t) / (Math.PI * 2);
  // stations along the article (finer at the joints and the tip)
  const ts: number[] = [];
  const nT = Math.max(2, Math.ceil(L / lod.legStep));
  const tStart = -Math.min(0.08, 0.9 / L);
  ts.push(tStart);
  if (neck > 0 && lod.tier < 2) { ts.push(neck * 0.35, neck * 0.75); }
  for (let i = 1; i <= nT; i++) { const t = i / nT; if (t > (neck > 0 ? neck : 0) + 0.02 && t < 1) ts.push(t); }
  if (last) { if (lod.tier === 0) ts.push(0.97, 0.995); ts.push(1); } else { ts.push(1); }
  ts.sort((a, b) => a - b);
  const capX = last ? 0 : Math.min(1.0, 0.3 * Math.min(sec(1).hy, sec(1).hz) + 0.25);
  const rows: number[][] = [];
  const weight = (t: number) => (neck > 0 ? 0.5 + 0.5 * smooth(tStart, neck, t) : t < 0.05 ? 0.75 + 5 * t : 1);
  const partAt = (t: number) => (neck > 0 && t < neck * 0.6 ? PART.MEMBRANE : part);
  // (each ring closes on a twin of its first vertex, so that the angle around runs 0 … 1 without wrapping back
  // through every other angle across the last quads: that seam lies along the top)
  for (const t of ts) {
    const row: number[] = [];
    for (let j = 0; j <= nA; j++) {
      const a = (j / nA) * Math.PI * 2;
      const p = radial(Math.max(0, t), a);
      if (t < 0) p.x = t * L;
      const cav = neck > 0 && t < neck ? 0.7 : t > 0.96 && !last ? 0.4 : 0;
      const vi = gb.v(p.x, p.y, p.z, bone, weight(t), parent, partAt(t), t, angAt(j, t), cav);
      const sc = sec(Math.max(0, t));
      gb.setMm(vi, t * L, a * 0.5 * (sc.hy + sc.hz));
      row.push(vi);
    }
    gb.twin(row[0], row[nA]);
    rows.push(row);
  }
  // caps: proximal (inside the parent) and distal (rounded, under the next article's neck)
  const p0 = sec(0);
  const cap0 = gb.v(tStart * L - 0.3, p0.cy, p0.cz, bone, weight(tStart), parent, PART.MEMBRANE, 0, 0, 0.8);
  for (let j = 0; j < nA; j++) gb.tri(cap0, rows[0][j + 1], rows[0][j]);
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < nA; j++) {
    const k = j + 1;
    gb.quad(rows[r][j], rows[r][k], rows[r + 1][k], rows[r + 1][j]);
  }
  const lastRow = rows[rows.length - 1];
  const s1 = sec(1);
  if (last) {
    // (a pole vertex for each triangle, at the angle of its edge, the normal along the axis)
    for (let j = 0; j < nA; j++) gb.tri(lastRow[j], lastRow[j + 1], gb.vn(L + 0.05, s1.cy, s1.cz, 1, 0, 0, bone, 1, parent, part, 1, angAt(j + 0.5, 1), 0));
  } else {
    let prevRow = lastRow;
    for (const [dx, k] of [[0.5, 0.86], [0.85, 0.55]] as const) {
      const row: number[] = [];
      for (let j = 0; j <= nA; j++) {
        const a = (j / nA) * Math.PI * 2;
        const p = radial(1, a);
        row.push(gb.v(L + capX * dx, s1.cy + (p.y - s1.cy) * k, s1.cz + (p.z - s1.cz) * k, bone, 1, parent, part, 1, angAt(j, 1), 0.35));
      }
      gb.twin(row[0], row[nA]);
      for (let j = 0; j < nA; j++) { const kk = j + 1; gb.quad(prevRow[j], prevRow[kk], row[kk], row[j]); }
      prevRow = row;
    }
    for (let j = 0; j < nA; j++) gb.tri(prevRow[j], prevRow[j + 1], gb.vn(L + capX, s1.cy, s1.cz, 1, 0, 0, bone, 1, parent, part, 1, angAt(j + 0.5, 1), 0.3));
  }
  return {
    surface(t: number, a: number) {
      const p = radial(t, a);
      const e = 0.01;
      const pa = radial(t, a + e), pt = radial(Math.min(1, t + e), a), pm = radial(Math.max(0, t - e), a);
      const ta = pa.sub(p), tt = pt.sub(pm);
      const nrm = new Vector3().crossVectors(ta, tt).normalize();
      return { p, n: nrm };
    },
  };
}

/** a cone (spine, tooth) from `base` along `dir`, bending towards `bend` as it goes */
function cone(gb: GeoBuilder, base: Vector3, dir: Vector3, r: number, len: number, sides: number, bone: number, part: number, bend?: Vector3): void {
  const d = dir.clone().normalize();
  const u = new Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? AY : AX).normalize();
  const w = new Vector3().crossVectors(d, u);
  const steps = sides > 4 ? 3 : 1;
  const rings: number[][] = [];
  for (let s = 0; s < steps; s++) {
    const f = s / steps;
    const rr = r * (1 - f) * (s === 0 ? 1 : 1 - 0.15 * f);
    const c = base.clone().addScaledVector(d, len * f);
    if (bend) c.addScaledVector(bend, len * 0.25 * f * f);
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(w, Math.sin(a) * rr);
      row.push(gb.v(p.x, p.y, p.z, bone, 1, bone, part, f, j / sides, s === 0 ? 0.5 : 0));
    }
    rings.push(row);
  }
  const tipP = base.clone().addScaledVector(d, len);
  if (bend) tipP.addScaledVector(bend, len * 0.25);
  const tip = gb.v(tipP.x, tipP.y, tipP.z, bone, 1, bone, part, 1, 0, 0);
  for (let s = 0; s < rings.length - 1; s++) for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    gb.quad(rings[s][j], rings[s][k], rings[s + 1][k], rings[s + 1][j]);
  }
  const lastR = rings[rings.length - 1];
  for (let j = 0; j < sides; j++) gb.tri(lastR[j], lastR[(j + 1) % sides], tip);
}

/** hair cards along an article: a fringe of setae (drawn strand by strand in the setae material) */
function fringe(hb: GeoBuilder, art: ArticleOut, t0: number, t1: number, a: number, len: number, tilt: number, bone: number, L: number, count: number, side = 0): void {
  const rows: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = t0 + ((t1 - t0) * i) / count;
    const { p, n } = art.surface(t, a);
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, (i + 0.5) / (count + 1)))) ** 0.6;
    const dir = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(AX, Math.sin(tilt)).normalize();
    const l = len * (0.55 + 0.45 * taper);
    const q = p.clone().addScaledVector(dir, l);
    const card = new Vector3().crossVectors(AX, dir).normalize();
    const u = t * L;
    const b = hb.vn(p.x, p.y, p.z, card.x, card.y, card.z, bone, 1, bone, side, u, 0);
    const e = hb.vn(q.x, q.y, q.z, card.x, card.y, card.z, bone, 1, bone, side, u, 1);
    rows.push([b, e]);
  }
  for (let i = 0; i < rows.length - 1; i++) hb.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
}

function legPart(id: LegId, a: (typeof ARTICLES)[number]): number {
  if (id === 'P1') return a === 'pr' ? PART.PALM : a === 'da' ? PART.FINGER : PART.CHELA_ARM;
  if (id === 'P5') return a === 'cx' || a === 'bi' ? PART.LEG : a === 'pr' ? PART.PADDLE_PR : a === 'da' ? PART.PADDLE_DA : PART.PADDLE;
  return a === 'da' ? PART.DACTYL : PART.LEG;
}

/** every leg's articles, spines, the fingers' teeth and (top tier) the setae, skinned to the leg's bones */
export function buildLegs(gb: GeoBuilder, hb: GeoBuilder | null, lod: Lod, rig: RigDef): void {
  const m = new Matrix4();
  for (const leg of rig.legs) {
    leg.spec.articles.forEach((spec, ai) => {
      const name = legBone(leg.id, leg.side, spec.name);
      const bone = rig.byName[name];
      const def = rig.defs[bone];
      const parent = rig.byName[def.parent!];
      const L = leg.lengths[ai];
      const last = spec.name === 'da';
      const start = gb.count, triStart = gb.idx.length;
      const art = buildArticle(gb, spec, L, lod, bone, ai === 0 ? parent : parent, legPart(leg.id, spec.name), last);
      // spines (the cheliped's merus, carpus and palm)
      if (lod.spines && spec.spines) for (const s of spec.spines) {
        const { p, n } = art.surface(s.t, s.a);
        const dir = n.clone().multiplyScalar(Math.cos(s.lean)).addScaledVector(AX, Math.sin(s.lean)).normalize();
        cone(gb, p.addScaledVector(n, -0.25 * s.r), dir, s.r * (lod.tier === 0 ? 1 : 1.15), s.length, lod.spineSides, bone, PART.SPINE, AX.clone().multiplyScalar(0.6));
      }
      // the fingers' cutting edges: alternately large and small teeth, the largest (molariform) near the base
      if (leg.id === 'P1' && (spec.name === 'pr' || spec.name === 'da') && lod.tier < 2) {
        const fixed = spec.name === 'pr';
        const [t0, t1, count] = fixed ? [0.6, 0.955, lod.fingerTeeth ? 13 : 5] : [0.1, 0.92, lod.fingerTeeth ? 14 : 5];
        const a = fixed ? 0 : Math.PI;
        for (let k = 0; k < count; k++) {
          const t = t0 + ((t1 - t0) * (k + 0.5)) / count;
          const big = k % 2 === 0;
          const baseK = 1 - 0.55 * ((k + 0.5) / count);
          const { p, n } = art.surface(t, a);
          const size = (big ? 1.0 : 0.6) * baseK * (lod.fingerTeeth ? 1 : 1.3);
          const dir = n.clone().multiplyScalar(0.94).addScaledVector(AX, 0.35).normalize();
          cone(gb, p.addScaledVector(n, -0.2), dir, 0.62 * size, 1.05 * size, lod.fingerTeeth ? 5 : 3, bone, PART.TOOTH);
        }
      }
      // the setae: fringes on the paddle's margins and the walking dactyli; short ones along the cheliped's merus
      if (hb && lod.setae) {
        const hs = hb.count, ht = hb.idx.length;
        if (leg.id === 'P5' && (spec.name === 'pr' || spec.name === 'da')) {
          fringe(hb, art, 0.08, 0.98, Math.PI / 2, spec.name === 'da' ? 1.6 : 1.3, 0.55, bone, L, 26, 1);
          fringe(hb, art, 0.08, 0.98, -Math.PI / 2, spec.name === 'da' ? 1.7 : 1.2, 0.55, bone, L, 26, 1);
        } else if (spec.name === 'da' && leg.id !== 'P1') {
          fringe(hb, art, 0.12, 0.85, 0, leg.id === 'P4' ? 1.2 : 0.8, 0.75, bone, L, 14, 2);
          fringe(hb, art, 0.12, 0.85, Math.PI, leg.id === 'P4' ? 1.2 : 0.8, 0.75, bone, L, 14, 2);
        } else if (spec.name === 'pr' && leg.id !== 'P1') {
          fringe(hb, art, 0.2, 0.95, Math.PI, 0.7, 0.9, bone, L, 10, 2);
        } else if (leg.id === 'P1' && spec.name === 'me') {
          fringe(hb, art, 0.1, 0.9, -1.6, 0.55, 0.8, bone, L, 14, 2);
        }
        if (leg.sg < 0) hb.mirrorZ(hs, ht);
        hb.transform(hs, m.copy(def.matrix));
      }
      if (leg.sg < 0) gb.mirrorZ(start, triStart);
      gb.transform(start, m.copy(def.matrix));
    });
  }
}

// ------------------------------------------------------------------ eyes, antennae, mouthparts, abdomen

/**
 * A slender rod along a bent axis (start + dir·len·t + bend·t²), radius r0 → r1, the rings closed on twins and the
 * tip on its own pole vertices: the mouthparts' palps and exopods, the antennae's segments and flagella. `aSeg` is
 * (t, the angle round), `aMm` (mm along it, mm round) for the annuli the shader draws.
 */
function rod(gb: GeoBuilder, start: Vector3, dir: Vector3, len: number, r0: number, r1: number, sides: number, steps: number, bone: number, part: number, flag = 0, bend: Vector3 | null = null, cav0 = 0.5): void {
  const d = dir.clone().normalize();
  const at = (t: number) => start.clone().addScaledVector(d, len * t).addScaledVector(bend ?? ZERO3, t * t);
  const tan = (t: number) => at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
  let prev: number[] | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = at(t), tg = tan(t);
    const u = new Vector3().crossVectors(tg, Math.abs(tg.y) < 0.9 ? AY : AX).normalize();
    const w = new Vector3().crossVectors(tg, u);
    const r = r0 + (r1 - r0) * t;
    const row: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
      const vi = gb.v(p.x, p.y, p.z, bone, 1, bone, part, t, j / sides, s === 0 ? cav0 : 0, flag);
      gb.setMm(vi, t * len, a * r);
      row.push(vi);
    }
    gb.twin(row[0], row[sides]);
    if (prev) for (let j = 0; j < sides; j++) gb.quad(prev[j], prev[j + 1], row[j + 1], row[j]);
    prev = row;
  }
  const tip = at(1).addScaledVector(tan(1), r1 * 0.7), tn = tan(1);
  for (let j = 0; j < sides; j++) {
    const vi = gb.vn(tip.x, tip.y, tip.z, tn.x, tn.y, tn.z, bone, 1, bone, part, 1, (j + 0.5) / sides, 0, flag);
    gb.setMm(vi, len + r1 * 0.7, 0);
    gb.tri(prev![j], prev![j + 1], vi);
  }
}
const ZERO3 = new Vector3();

/**
 * The eye in its bone's frame (x out along the stalk, y up, z medial on the left and lateral on the right, so that the
 * lateral side is −sg·z): one surface from the stalk's base in the orbit to the tip of the eye. The stalk is short and
 * a little club-shaped, swelling into the eye, an ellipsoid a little wider than high (61, 64, 65, 66). The cornea is
 * not a separate globe: it is an oblique cap over the eye's tip, reaching further back underneath and on the outer
 * side than on top, where the stalk's cuticle hoods it (61, 66). Each vertex carries its signed distance from the
 * cornea's edge (`aSeg.x`, > 0 on the cornea) so that the shader draws the edge smooth whatever the tessellation, and
 * the angle round (`aSeg.y`, 0 … 1, the ring closed on a twin) for the facets.
 */
function buildEye(gb: GeoBuilder, lod: Lod, bone: number, sg: number): void {
  const sides = lod.eyeSeg;
  const R = EYE.r, Rv = R * 0.92, ax = R * 0.95;
  const cx = EYE.stalk + R * 0.45;
  // where the eye's surface is as wide as the stalk: the stalk runs up to there
  const th0 = Math.asin(Math.min(0.95, EYE.stalkR / R));
  const xJoin = cx - ax * Math.cos(th0);
  // the cornea's axis: out along the stalk, tipped down and to the outer side
  const lat = -sg;
  const c = new Vector3(1, -0.35, 0.45 * lat).normalize();
  const capCos = 0.28;
  const d = new Vector3();
  const rows: { x: number; ry: number; rz: number; eye: boolean; cav: number }[] = [];
  const nStalk = lod.tier === 0 ? 5 : lod.tier === 1 ? 2 : 1;
  for (let i = 0; i <= nStalk; i++) {
    const f = i / nStalk;
    // a waist a third of the way up, swelling towards the eye
    const r = EYE.stalkR * (1.06 - 0.1 * Math.sin(Math.PI * Math.min(1, f * 1.4)) + 0.04 * f);
    rows.push({ x: f * xJoin, ry: r * 0.96, rz: r, eye: false, cav: i === 0 ? 0.6 : 0 });
  }
  const nEye = lod.tier === 0 ? 14 : lod.tier === 1 ? 6 : 3;
  for (let i = 1; i <= nEye; i++) {
    // denser towards the tip, where the highlight and the pseudopupil are
    const f = i / nEye;
    if (i === nEye) break;
    const th = th0 + (Math.PI - th0) * (1 - Math.pow(1 - f, 1.5));
    rows.push({ x: cx - ax * Math.cos(th), ry: Rv * Math.sin(th), rz: R * Math.sin(th), eye: true, cav: 0 });
  }
  const ring = (k: number): number[] => {
    const rw = rows[k];
    const out: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const y = Math.cos(a) * rw.ry, z = Math.sin(a) * rw.rz;
      d.set((rw.x - cx) / ax, y / Rv, z / R).normalize();
      const sc = d.dot(c) - capCos;
      out.push(gb.v(rw.x, y, z, bone, 1, bone, PART.CORNEA, sc, j / sides, rw.cav, 3));
    }
    gb.twin(out[0], out[sides]);
    return out;
  };
  let prev = ring(0);
  for (let k = 1; k < rows.length; k++) {
    const row = ring(k);
    for (let j = 0; j < sides; j++) gb.quad(prev[j], prev[j + 1], row[j + 1], row[j]);
    prev = row;
  }
  // the tip: a pole vertex for each triangle (the cornea's centre, its normal straight out)
  const tipSc = new Vector3(1, 0, 0).dot(c) - capCos;
  for (let j = 0; j < sides; j++) gb.tri(prev[j], prev[j + 1], gb.vn(cx + ax, 0, 0, 1, 0, 0, bone, 1, bone, PART.CORNEA, tipSc, (j + 0.5) / sides, 0, 3));
}

/** the third maxillipeds: two rounded plates (ischium and merus) over the buccal frame, hinged at their outer edges */
function buildMxp(gb: GeoBuilder, hb: GeoBuilder | null, lod: Lod, bone: number, sg: number, m: Matrix4): void {
  const start = gb.count;
  const nx = lod.tier === 0 ? 6 : 3, nz = lod.tier === 0 ? 10 : 4;
  const W = MXP3.halfWidth - 0.4, Z0 = 0, Z1 = MXP3.z1 - MXP3.z0;
  // the plate in its hinge's frame: x from the outer edge (0) inwards (−sg … towards the midline), z back along it
  const grid: number[][] = [], under: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const row: number[] = [], urow: number[] = [];
    for (let k = 0; k <= nz; k++) {
      const v = k / nz;
      const z = Z0 + (Z1 - Z0) * v;
      // the merus (the upper third, under the epistome) narrower, rounded at its inner corner; the ischium below
      // meets its fellow at the midline, its lower inner corner rounded too
      const w = W * (1 - 0.15 * (1 - smooth(0, 0.35, v)) * smooth(0.3, 1, u)) * (1 - 0.12 * smooth(0.8, 1, v) * smooth(0.5, 1, u));
      const x = -sg * w * u;
      const bulge = 1.2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.05));
      row.push(gb.v(x, -0.5 - bulge, z, bone, 1, bone, PART.STERNUM, u, v, 0.15, 0));
      urow.push(gb.v(x, 0.6, z, bone, 1, bone, PART.STERNUM, u, v, 0.8, 0));
    }
    grid.push(row); under.push(urow);
  }
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (sg > 0) {
      gb.quad(grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]);
      gb.quad(under[i][k], under[i + 1][k], under[i + 1][k + 1], under[i][k + 1]);
    } else {
      gb.quad(grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]);
      gb.quad(under[i][k], under[i][k + 1], under[i + 1][k + 1], under[i + 1][k]);
    }
  }
  // the plate's rim
  const rim = (a: number[], b: number[], flip: boolean) => { for (let k = 0; k < a.length - 1; k++) flip ? gb.quad(a[k], b[k], b[k + 1], a[k + 1]) : gb.quad(a[k], a[k + 1], b[k + 1], b[k]); };
  const f = sg > 0;
  rim(grid[nx], under[nx], f);
  rim(grid.map((r) => r[0]), under.map((r) => r[0]), !f);
  rim(grid.map((r) => r[nz]), under.map((r) => r[nz]), f);
  if (lod.tier < 2) {
    const sides = lod.tier === 0 ? 7 : 4, steps = lod.tier === 0 ? 4 : 2;
    const L = -Z1;
    // the palp (carpus, propodus, dactylus) folded down along the merus's inner edge, in front of the plate (66)
    const px = -sg * (W * 0.86 - 0.35);
    rod(gb, new Vector3(px, -1.0, -0.06 * L), new Vector3(sg * 0.12, -0.05, -1), 1.5, 0.5, 0.42, sides, steps, bone, PART.STERNUM, 3, null, 0.4);
    rod(gb, new Vector3(px + sg * 0.18, -1.05, -0.06 * L - 1.55), new Vector3(sg * 0.1, -0.08, -1), 1.35, 0.4, 0.32, sides, steps, bone, PART.STERNUM, 3, null, 0.4);
    rod(gb, new Vector3(px + sg * 0.32, -1.15, -0.06 * L - 2.95), new Vector3(sg * 0.05, -0.1, -1), 1.1, 0.3, 0.12, sides, steps, bone, PART.STERNUM, 3, new Vector3(-sg * 0.15, -0.1, 0), 0.4);
    // the exopod along the outer edge, its flagellum curling in over the merus
    rod(gb, new Vector3(-sg * 0.45, -0.75, -0.92 * L), new Vector3(0, -0.05, 1), 0.72 * L, 0.42, 0.34, sides, steps + 2, bone, PART.STERNUM, 3, new Vector3(0, -0.25, 0), 0.5);
    rod(gb, new Vector3(-sg * 0.45, -1.0, -0.2 * L), new Vector3(-sg * 0.8, -0.2, 0.55), 1.8, 0.2, 0.06, sides - 1, steps, bone, PART.STERNUM, 3, new Vector3(-sg * 0.1, 0, -0.5), 0.3);
  }
  gb.transform(start, m);
  // setae along the inner edge (pale, a short fringe meeting its fellow's at the midline)
  if (hb) {
    const hs = hb.count;
    const n = 14;
    const rows: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const v = 0.04 + 0.92 * (k / n);
      const w = W * (1 - 0.15 * (1 - smooth(0, 0.35, v)));
      const p = new Vector3(-sg * w, -0.5, Z1 * v);
      const dir = new Vector3(-sg, -0.55, -0.15).normalize();
      const q = p.clone().addScaledVector(dir, 0.75 + 0.25 * Math.sin(k * 2.3));
      const card = new Vector3().crossVectors(new Vector3(0, 0, 1), dir).normalize();
      rows.push([hb.vn(p.x, p.y, p.z, card.x, card.y, card.z, bone, 1, bone, 2, v * -Z1, 0), hb.vn(q.x, q.y, q.z, card.x, card.y, card.z, bone, 1, bone, 2, v * -Z1, 1)]);
    }
    for (let k = 0; k < n; k++) hb.quad(rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]);
    hb.transform(hs, m);
  }
}

/** the abdomen folded under the sternum: both the male's and the female's (the material keeps the individual's) */
function buildAbdomen(gb: GeoBuilder, lod: Lod, body: number): void {
  for (const sex of ['male', 'female'] as const) {
    const A = ABDOMEN[sex];
    const flag = sex === 'male' ? 1 : 2;
    const nt = lod.tier === 0 ? 24 : lod.tier === 1 ? 8 : 4, nw = lod.tier === 0 ? 8 : lod.tier === 1 ? 4 : 2;
    const outer: number[][] = [], inner: number[][] = [];
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;
      const half = knotLerp(A.w.map(([tt, w]) => ({ t: tt, w })), t, (k) => k.w);
      const z = ABDOMEN.hinge + A.length * t;
      const row: number[] = [], irow: number[] = [];
      for (let j = 0; j <= nw; j++) {
        const u = j / nw * 2 - 1;
        const x = u * Math.max(0.05, half);
        // a low dome across, the somites' edges as small steps (the shader draws the sutures)
        const y = -1.0 - 0.7 * (1 - u * u) * Math.min(1, half / 4) - 0.18 * Math.max(0, Math.sin(t * Math.PI * 6.5)) * (1 - u * u);
        row.push(gb.v(x, y, z, body, 1, body, PART.STERNUM, t, (u + 1) / 2, 0.2, flag));
        irow.push(gb.v(x, -0.15, z, body, 1, body, PART.STERNUM, t, (u + 1) / 2, 0.9, flag));
      }
      outer.push(row); inner.push(irow);
    }
    for (let i = 0; i < nt; i++) for (let j = 0; j < nw; j++) {
      gb.quad(outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]);
    }
    // the edges (left, right, tip)
    for (let i = 0; i < nt; i++) {
      gb.quad(outer[i][0], outer[i + 1][0], inner[i + 1][0], inner[i][0]);
      gb.quad(outer[i][nw], inner[i][nw], inner[i + 1][nw], outer[i + 1][nw]);
    }
  }
}

/**
 * The antenna and the antennule in their bones' frames (x along each). The antenna: two short peduncle segments in the
 * orbital hiatus and a long, thin, annulated flagellum curving out and down (66). The antennule, folded transversely
 * in its fossa under the front: three peduncle segments, then the thick outer flagellum with its brush of aesthetascs
 * and a thin inner one (66: the little "Y" between the eyes); the shader draws the annuli.
 */
function buildAntennae(gb: GeoBuilder, lod: Lod, a2: number, a1: number, ma2: Matrix4, ma1: Matrix4, sg: number): void {
  const sides = lod.tier === 0 ? 6 : 4, st = lod.tier === 0 ? 3 : 1;
  const A = ANTENNA.length, R = ANTENNA.r;
  let s = gb.count;
  rod(gb, new Vector3(0, 0, 0), AX, 0.9, R * 1.9, R * 1.7, sides, 1, a2, PART.STALK, 0, null, 0.6);
  rod(gb, new Vector3(0.9, 0, 0), new Vector3(1, -0.05, 0.02), 0.8, R * 1.6, R * 1.3, sides, 1, a2, PART.STALK, 0, null, 0.4);
  rod(gb, new Vector3(1.7, -0.04, 0.02), new Vector3(1, -0.1, 0.05), A, R * 1.0, R * 0.3, Math.max(4, sides - 2), lod.tier === 0 ? 10 : 3, a2, PART.STALK, 1, new Vector3(0, -0.9 * A * 0.25, 0.5 * A * 0.15), 0.3);
  gb.transform(s, ma2);
  s = gb.count;
  const r = ANTENNULE.r;
  rod(gb, new Vector3(0, 0, 0), AX, 1.2, r * 1.35, r * 1.15, sides, st, a1, PART.STALK, 0, null, 0.7);
  rod(gb, new Vector3(1.2, 0, 0), new Vector3(1, 0.25, 0), 0.9, r * 1.0, r * 0.85, sides, 1, a1, PART.STALK, 0, null, 0.4);
  rod(gb, new Vector3(2.07, 0.22, 0), new Vector3(0.8, 0.6, 0), 0.75, r * 0.8, r * 0.7, sides, 1, a1, PART.STALK, 0, null, 0.4);
  // the outer flagellum (thick, the aesthetascs' brush) and the inner (thin)
  rod(gb, new Vector3(2.5, 0.68, 0), new Vector3(0.45, 0.9, -0.1 * sg), 1.7, r * 0.62, r * 0.25, sides, lod.tier === 0 ? 5 : 2, a1, PART.STALK, 2, new Vector3(0.3, -0.1, 0), 0.3);
  if (lod.tier === 0) rod(gb, new Vector3(2.5, 0.62, 0), new Vector3(0.9, 0.35, 0.1 * sg), 1.3, r * 0.3, r * 0.12, 4, 3, a1, PART.STALK, 1, null, 0.3);
  gb.transform(s, ma1);
}

// ------------------------------------------------------------------ one tier

export interface TierGeometry {
  shell: BufferGeometry;
  setae: BufferGeometry | null;
  triangles: number;
}

/** the whole crab for one tier: the shell (body, legs, eyes, mouthparts) and, on the top tier, the setae */
export function buildTier(rig: RigDef, lod: Lod): TierGeometry {
  const gb = new GeoBuilder();
  const hb = lod.setae ? new GeoBuilder() : null;
  const body = rig.byName.J_body;
  buildShell(gb, lod, body);
  buildAbdomen(gb, lod, body);
  buildLegs(gb, hb, lod, rig);
  const m = new Matrix4();
  for (const side of SIDES) {
    const sg = side === 'L' ? 1 : -1;
    const eye = rig.byName[`J_eye_${side}`];
    const s = gb.count;
    buildEye(gb, lod, eye, sg);
    gb.transform(s, m.copy(rig.defs[eye].matrix));
    buildMxp(gb, hb, lod, rig.byName[`J_mxp_${side}`], sg, m.copy(rig.defs[rig.byName[`J_mxp_${side}`]].matrix));
    if (lod.antennae) buildAntennae(gb, lod, rig.byName[`J_a2_${side}`], rig.byName[`J_a1_${side}`], rig.defs[rig.byName[`J_a2_${side}`]].matrix.clone(), rig.defs[rig.byName[`J_a1_${side}`]].matrix.clone(), sg);
  }
  // the setae of the carapace's anterolateral margin (short, beneath the teeth: 6) are part of the shell's shader
  const shell = gb.build();
  const setae = hb && hb.count > 0 ? hb.build() : null;
  return { shell, setae, triangles: gb.idx.length / 3 + (hb ? hb.idx.length / 3 : 0) };
}

void _q2;
