import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import {
  ABDOMEN, BIND, CARAPACE, CHELA_FEMALE, CHELA_MALE, EYE, MXP3, OUTLINE, dorsalRelief, legSpecs, marginHeight, vault,
  type ArticleName, type ArticleSpec, type LegId, type LegSpec, type V2,
} from './anatomy';
import { GeoBuilder, knotLerp, noise2, smooth } from '../gazami/mesh';
import { Rng } from '../../../core/Rng';

/**
 * What the shell's shader knows about each vertex of the ヤマトオサガニ (the `aPart` attribute): where on the animal it
 * is, so that one material colours and finishes the whole exoskeleton.
 */
export const PART = {
  DORSUM: 0,      // the carapace's dorsal face and its teeth
  UNDER: 1,       // the carapace's underside, the body wall, the pterygostomian regions
  STERNUM: 2,     // sternum, abdomen
  MXP: 3,         // the third maxillipeds (pale plates)
  CHELA_ARM: 4,   // cheliped coxa … carpus
  PALM: 5,        // cheliped propodus (palm and fixed finger)
  FINGER: 6,      // the cheliped's dactylus
  LEG: 7,         // walking legs (coxa … propodus)
  DACTYL: 8,      // walking legs' dactyli
  MEMBRANE: 9,    // articular membranes at the joints
  CORNEA: 10,
  STALK: 11,      // eyestalks, antennae, antennules
  SPINE: 12,      // spines and spinules on the limbs
  ORBIT: 13,      // the orbits' trenches (in shadow, where the folded eyestalks lie)
  TOOTH: 14,      // the teeth of the fingers' cutting edges
  FIXED: 15,      // the chela's fixed finger (its own piece on the propodus)
} as const;

/** `aAux.y` flags: parts only one form has (the material folds the other away) */
export const FLAG = { MALE_ABDOMEN: 1, FEMALE_ABDOMEN: 2, MALE_CHELA: 5, FEMALE_CHELA: 6 } as const;

/** how finely one tier is built */
export interface Lod {
  tier: 0 | 1 | 2;
  /** mm between samples of the outline's smooth runs and of the teeth's flanks */
  outlineStep: number;
  /** rings of the dorsal surface (s from the centre to the margin) */
  dome: number[];
  /** the underside's rows are all built (false: the coarse ones only) */
  fineUnder: boolean;
  /** rings over the sternum */
  sternum: number;
  /** sections round an article and mm between sections along it (tier 2: one tube per leg) */
  legRadial: number;
  legStep: number;
  spines: boolean;
  serrate: boolean;
  setae: boolean;
  eyeSeg: number;
  fingerTeeth: boolean;
  antennae: boolean;
}

export const LODS: Lod[] = [
  { tier: 0, outlineStep: 0.22, dome: [0.03, 0.065, 0.1, 0.14, 0.18, 0.22, 0.26, 0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.54, 0.58, 0.62, 0.66, 0.7, 0.735, 0.77, 0.8, 0.83, 0.86, 0.885, 0.91, 0.93, 0.948, 0.964, 0.977, 0.988, 1], fineUnder: true, sternum: 5, legRadial: 20, legStep: 0.34, spines: true, serrate: true, setae: true, eyeSeg: 20, fingerTeeth: true, antennae: true },
  { tier: 1, outlineStep: 1.05, dome: [0.22, 0.45, 0.65, 0.8, 0.9, 0.96, 1], fineUnder: true, sternum: 2, legRadial: 7, legStep: 1.9, spines: false, serrate: false, setae: false, eyeSeg: 7, fingerTeeth: false, antennae: false },
  { tier: 2, outlineStep: 3.6, dome: [0.55, 1], fineUnder: false, sternum: 1, legRadial: 3, legStep: 99, spines: false, serrate: false, setae: false, eyeSeg: 3, fingerTeeth: false, antennae: false },
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
export const legBone = (leg: LegId, side: Side, a: ArticleName | 'daF') => `J_${leg}${side}_${a}`;

export interface LegRig {
  id: LegId;
  side: Side;
  /** +1 left, −1 right */
  sg: number;
  spec: LegSpec;
  /** the side's own article lengths (mm) */
  lengths: number[];
  /** rest yaw of the coxa (rad from the outward x towards +z) */
  yaw: number;
  coxa: Vector3;
}

export interface RigDef {
  defs: BoneDef[];
  byName: Record<string, number>;
  legs: LegRig[];
}

const _q = new Quaternion();
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);

/** the frame of a leg at its coxa: x out along the rest yaw, y up, right-handed */
export function coxaFrame(yaw: number, sg: number, out: Quaternion): Quaternion {
  const x = new Vector3(sg * Math.cos(yaw), 0, Math.sin(yaw));
  const y = new Vector3(0, 1, 0);
  const z = new Vector3().crossVectors(x, y);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** a frame whose x runs along `dir` with y as near the world's up as it can be */
export function frameAlong(dir: Vector3, out: Quaternion, upHint = AY): Quaternion {
  const x = dir.clone().normalize();
  const y = upHint.clone().addScaledVector(x, -x.dot(upHint)).normalize();
  const z = new Vector3().crossVectors(x, y);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** the side's small differences: a real shell and real legs are never mirror images (fixed seed: the species' model) */
function sideRng(side: Side, k: number): Rng { return new Rng(0x05a9 + (side === 'L' ? 0 : 7919) + k * 131); }

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
      // (the cheliped's propodus and dactylus are the chela's: their lengths are the male form's)
      const arts = spec.id === 'P1' ? [...spec.articles, CHELA_MALE.palm, CHELA_MALE.da] : spec.articles;
      const lengths = arts.map((a) => a.length * (1 + (rng.next() - 0.5) * 0.025));
      const coxa = new Vector3(sg * (spec.coxa[0] + (rng.next() - 0.5) * 0.12), spec.coxa[1], spec.coxa[2] + (rng.next() - 0.5) * 0.12);
      const yaw = spec.yaw + (rng.next() - 0.5) * 0.04;
      const b = BIND[spec.id];
      const n = (a: ArticleName | 'daF') => legBone(spec.id, side, a);
      add(n('cx'), 'J_body', coxa, coxaFrame(yaw, sg, new Quaternion()).multiply(_q.setFromAxisAngle(AZ, b.pitch)));
      add(n('bi'), n('cx'), new Vector3(lengths[0], 0, 0), new Quaternion().setFromAxisAngle(AZ, b.lev));
      add(n('me'), n('bi'), new Vector3(lengths[1], 0, 0), new Quaternion().setFromAxisAngle(AY, sg * (b.meYaw ?? 0)).multiply(_q.setFromAxisAngle(AX, sg * b.roll)));
      add(n('ca'), n('me'), new Vector3(lengths[2], 0, 0), new Quaternion().setFromAxisAngle(AY, sg * (b.mcYaw ?? 0)).multiply(_q.setFromAxisAngle(AZ, b.mc)));
      add(n('pr'), n('ca'), new Vector3(lengths[3], 0, 0), new Quaternion().setFromAxisAngle(AZ, b.cp));
      if (spec.id === 'P1') {
        // the two chelae's dactyli, each on its own hinge on the palm
        add(n('da'), n('pr'), new Vector3(CHELA_MALE.hinge[0], CHELA_MALE.hinge[1], 0), new Quaternion().setFromAxisAngle(AZ, CHELA_MALE.daAngle + b.pd));
        add(n('daF'), n('pr'), new Vector3(CHELA_FEMALE.hinge[0], CHELA_FEMALE.hinge[1], 0), new Quaternion().setFromAxisAngle(AZ, CHELA_FEMALE.daAngle + b.pd));
      } else {
        add(n('da'), n('pr'), new Vector3(lengths[4], 0, 0), new Quaternion().setFromAxisAngle(AZ, b.pd));
      }
      legs.push({ id: spec.id, side, sg, spec, lengths, yaw, coxa });
    }
    // the eyestalk (bind: raised) and the third maxilliped
    const up = new Vector3(sg * EYE.up[0], EYE.up[1], EYE.up[2]).normalize();
    add(`J_eye_${side}`, 'J_body', new Vector3(sg * EYE.base[0], EYE.base[1], EYE.base[2]), frameAlong(up, new Quaternion(), new Vector3(0, 0, 1)));
    // (the plate hangs down and back from its top edge: x the crab's left on both sides, y out of the face, z down
    // the plate; the plate is built towards the midline from its hinge at its outer edge)
    const down = new Vector3(0, MXP3.y1 - MXP3.y0, MXP3.z1 - MXP3.z0).normalize();
    const face = new Vector3(0, down.z, -down.y);
    const mq = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(1, 0, 0), face, new Vector3().crossVectors(new Vector3(1, 0, 0), face)));
    add(`J_mxp_${side}`, 'J_body', new Vector3(sg * MXP3.halfWidth, MXP3.y0, MXP3.z0), mq);
  }
  return { defs, byName, legs };
}

/**
 * The bones each tier is skinned to (the budget's joints: hero 96, lod1 32, lod2 12 for a crab of this size). The
 * lighter tiers fold articles that do not need their own joint at their distance into the next one up: lod1 keeps
 * the knee and the dactylus of the long walking legs (the propodus rides on the carpus: the behaviour holds that joint
 * at its rest angle while lod1 is drawn), the knee alone of P5, the cheliped's elbow and wrist; lod2 one bone a leg.
 */
export function tierBone(tier: 0 | 1 | 2, name: string): string {
  if (name === 'J_root') return 'J_body';
  if (tier === 0 || name === 'J_body') return name;
  if (name.startsWith('J_eye_')) return tier === 1 ? name : 'J_body';
  if (name.startsWith('J_mxp_')) return 'J_body';
  const m = /^J_(P[1-5])([LR])_(\w+)$/.exec(name);
  if (!m) return 'J_body';
  const [, id, side, a] = m;
  const b = (x: string) => `J_${id}${side}_${x}`;
  if (tier === 2) return b('me');
  if (a === 'cx' || a === 'bi' || a === 'me') return b('me');
  if (id === 'P1') return a === 'ca' ? b('ca') : b('pr');
  if (id === 'P5') return b('ca');
  return a === 'da' ? b('da') : b('ca');
}

export function tierBones(rig: RigDef, tier: 0 | 1 | 2): string[] {
  const out: string[] = [];
  for (const d of rig.defs) { const t = tierBone(tier, d.name); if (!out.includes(t)) out.push(t); }
  // (keep the hierarchy's order; the root carries no vertices and is left out)
  return rig.defs.map((d) => d.name).filter((n) => n !== 'J_root' && out.includes(n));
}

// ------------------------------------------------------------------ the outline

interface EnvSample { x: number; z: number; ym: number; kind: string }

/** points along a Catmull-Rom through the knots, about `step` apart, without the first point */
function smoothRun(knots: V2[], step: number): V2[] {
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

/** the half outline of one side, front centre to posterior centre: smooth runs between the sharp knots (tips, notches) */
function halfOutline(side: Side, lod: Lod): EnvSample[] {
  const rng = sideRng(side, 1);
  // the side's own small differences in the knots (not the centre line's)
  const knots = OUTLINE.map((k) => ({ p: [k.p[0] === 0 ? 0 : k.p[0] + (rng.next() - 0.5) * 0.12, k.p[1] + (k.p[0] === 0 ? 0 : (rng.next() - 0.5) * 0.12)] as V2, kind: k.kind }));
  const env: EnvSample[] = [];
  const push = (p: V2, kind: string) => env.push({ x: p[0], z: p[1], ym: marginHeight(p[0], p[1]) + (rng.next() - 0.5) * 0.03, kind });
  push(knots[0].p, 'F');
  let run: V2[] = [knots[0].p];
  const sharp = (k: string) => k === 'T' || k === 'N';
  for (let i = 1; i < knots.length; i++) {
    const k = knots[i];
    run.push(k.p);
    const end = sharp(k.kind) || i === knots.length - 1 || sharp(knots[i - 1].kind);
    if (!end) continue;
    // the run up to this knot: a curve through its knots, or the straight flank of a tooth
    const pts = run.length > 2 && !sharp(knots[i - 1].kind) ? smoothRun(run, lod.outlineStep) : (() => {
      const a = run[run.length - 2], b = run[run.length - 1];
      const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / lod.outlineStep));
      const out: V2[] = [];
      for (let s = 1; s <= n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
      return out;
    })();
    // (the samples between the knots are plain edge: only the knots keep their kind)
    pts.forEach((p, j) => push(p, j === pts.length - 1 ? k.kind : 'E'));
    run = [k.p];
  }
  env[env.length - 1].x = 0;
  return env;
}

/** the whole outline: the left half front to back, then the right half back to front (x mirrored) */
export function outline(lod: Lod): EnvSample[] {
  const L = halfOutline('L', lod), R = halfOutline('R', lod);
  const loop = L.slice();
  for (let i = R.length - 2; i >= 1; i--) loop.push({ ...R[i], x: -R[i].x });
  return loop;
}

// ------------------------------------------------------------------ the carapace and the body

const C = CARAPACE;

/** the sternum's edge (left half, front to back): broad over the coxae, narrowing to the buccal frame and the abdomen */
const STERNUM_EDGE: V2[] = [[0, 7.6], [4.6, 7.4], [9.2, 6.6], [13.2, 5.2], [15.4, 3.0], [15.9, -0.8], [15.7, -4.8], [14.8, -7.9], [12.6, -9.6], [8.0, -10.4], [0, -10.5]];

/** where a ray from the outline's centre at angle `a` (from +z towards +x) crosses a closed half-polygon mirrored in x */
function rayHit(poly: V2[], a: number): V2 {
  const c = C.centre;
  const dx = Math.sin(a), dz = Math.cos(a);
  const sx = Math.sign(dx) || 1;
  let best: V2 = [c[0], c[1]];
  let bestT = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const p = [sx * poly[i][0], poly[i][1]], q = [sx * poly[i + 1][0], poly[i + 1][1]];
    const ex = q[0] - p[0], ez = q[1] - p[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - c[0]) * ez - (p[1] - c[1]) * ex) / den;
    const u = ((p[0] - c[0]) * dz - (p[1] - c[1]) * dx) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > bestT) { bestT = t; best = [c[0] + dx * t, c[1] + dz * t]; }
  }
  return best;
}

/**
 * The carapace and the body as one closed skin: the dorsal surface (rings over the outline, the vault and the regional
 * relief), the free margin's thin shelf with its teeth, and under it, sample for sample, the body: on the sides the
 * branchiostegal wall falling steeply to the pleural line over the coxae and in to the sternum's edge; at the front
 * the orbit's trench under the dorsal orbital margin, the crenulate infraorbital margin, and the pterygostomian
 * regions and the buccal frame below them; then the sternum.
 */
export function buildShell(gb: GeoBuilder, lod: Lod, body: number): void {
  const loop = outline(lod);
  const N = loop.length;
  const c = C.centre;
  const e = C.edge;
  const ang = loop.map((E) => { const a = Math.atan2(E.x - c[0], E.z - c[1]); return a < 0 ? a + 2 * Math.PI : a; });
  ang[0] = 0;
  const rad = loop.map((E) => Math.hypot(E.x - c[0], E.z - c[1]));
  // the outline smoothed round (the teeth and the notches not felt by the vault, nor by the body under the margin)
  const radS = new Float64Array(N), ymS = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let w = 0, r = 0, y = 0;
    for (let j = 0; j < N; j++) {
      let d = Math.abs(ang[j] - ang[i]);
      if (d > Math.PI) d = 2 * Math.PI - d;
      const k = Math.exp(-((d / 0.12) ** 2));
      w += k; r += k * rad[j]; y += k * loop[j].ym;
    }
    radS[i] = r / w; ymS[i] = y / w;
  }
  const lookup = (a: number): [number, number] => {
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ang[mid] <= a) lo = mid; else hi = mid; }
    const i0 = lo, i1 = (lo + 1) % N;
    const a1 = i1 === 0 ? 2 * Math.PI : ang[i1];
    const f = Math.max(0, Math.min(1, (a - ang[i0]) / Math.max(1e-9, a1 - ang[i0])));
    return [radS[i0] + (radS[i1] - radS[i0]) * f, ymS[i0] + (ymS[i1] - ymS[i0]) * f];
  };
  // the dorsal surface as a function of (x, z) over the smoothed outline (the teeth and notches do not crease it): the
  // vault, drawn down to the margin's height in the margin's band, the relief fading out over the band; the shell's
  // own small unevenness. Beyond the smoothed outline (the teeth) it keeps the margin's height
  const H = (x: number, z: number) => {
    let a = Math.atan2(x - c[0], z - c[1]);
    if (a < 0) a += 2 * Math.PI;
    const [Rs, yms] = lookup(a);
    const d = Math.hypot(x - c[0], z - c[1]);
    const q = Math.min(1, d / Rs);
    const zRim = c[1] + (z - c[1]) / Math.max(d / Rs, 1e-4);
    const base = vault(z, q);
    const rim = vault(zRim, 1);
    const w = smooth(0.6, 1.0, q);
    const unev = (noise2(x * 0.35 + 3.1, z * 0.35, 23) - 0.5) * 0.12 * (1 - q * q);
    return base + (yms - rim) * w * w + (dorsalRelief(x, z) + unev) * (1 - smooth(0.84, 0.985, q)) + e / 2;
  };
  const hN = 0.06;
  const domeV = (x: number, z: number, s: number, u: number) => {
    const y = H(x, z);
    const dx = (H(x + hN, z) - H(x - hN, z)) / (2 * hN), dz = (H(x, z + hN) - H(x, z - hN)) / (2 * hN);
    const l = Math.hypot(dx, 1, dz);
    const vi = gb.vn(x, y, z, -dx / l, 1 / l, -dz / l, body, 1, body, PART.DORSUM, s, u, 0);
    gb.setMm(vi, x, z);
    return vi;
  };
  // ---- the dorsal surface
  const rings = lod.dome;
  const grid: number[][] = [];
  const pole = domeV(c[0], c[1], 0, 0);
  for (let r = 0; r < rings.length; r++) {
    const s = rings[r];
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const E = loop[i];
      const x = c[0] + s * (E.x - c[0]), z = c[1] + s * (E.z - c[1]);
      if (r < rings.length - 1) row.push(domeV(x, z, s, i / N));
      else { const vi = gb.v(x, E.ym + e / 2, z, body, 1, body, PART.DORSUM, 1, i / N, 0); row.push(vi); }
    }
    grid.push(row);
  }
  for (let i = 0; i < N; i++) gb.tri(pole, grid[0][i], grid[0][(i + 1) % N]);
  for (let r = 0; r < grid.length - 1; r++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    gb.quad(grid[r][i], grid[r + 1][i], grid[r + 1][j], grid[r][j]);
  }
  // ---- under the margin: rows from the shelf's underside down to the sternum's edge
  // per sample: the smoothed outline point, its inward direction, how much of the front (orbit) it is
  const Es: V2[] = [], inw: V2[] = [], front: number[] = [], stern: V2[] = [];
  for (let i = 0; i < N; i++) {
    const a = ang[i];
    Es.push([c[0] + Math.sin(a) * radS[i], c[1] + Math.cos(a) * radS[i]]);
  }
  for (let i = 0; i < N; i++) {
    const p = Es[(i + N - 1) % N], q = Es[(i + 1) % N];
    const tx = q[0] - p[0], tz = q[1] - p[1], l = Math.hypot(tx, tz) || 1;
    // (the loop runs clockwise seen from above: left side front to back, then the right back to front)
    inw.push([-tz / l, tx / l]);
    const E = Es[i];
    front.push(smooth(6.6, 9.0, E[1]) * (1 - smooth(15.0, 17.0, Math.abs(E[0]))));
    stern.push(rayHit(STERNUM_EDGE, ang[i]));
  }
  // check the inward sense once: it must point to the centre at the front centre
  if (inw[0][1] > 0) for (const v of inw) { v[0] = -v[0]; v[1] = -v[1]; }
  type Row = (i: number) => { x: number; y: number; z: number; part: number; cav: number };
  const at = (i: number, d: number): V2 => [Es[i][0] + inw[i][0] * d, Es[i][1] + inw[i][1] * d];
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  /** the side's profile (branchiostegal wall, pleural line, body wall) and the front's (orbit, infraorbital margin, face) */
  const sideAt = (i: number, t: number): [number, number, number] => {
    // t: 0 just under the shelf … 1 the sternum's edge: the branchiostegal wall falls almost straight down (the scan's
    // transverse sections: a deep box), turns in at its foot over the coxae and meets the sternum
    const ym = ymS[i] - e;
    const top = at(i, 0.3), S = stern[i];
    const h = smooth(0.5, 1.0, t) * (0.85 + 0.15 * t) + 0.04 * t;
    const y = mix(ym - 0.25, 0.9, t);
    return [mix(top[0], S[0], h), y, mix(top[1], S[1], h)];
  };
  const centreFront = (i: number) => 1 - smooth(3.6, 6.0, Math.abs(Es[i][0]));
  const frontAt = (i: number, k: number): [number, number, number] => {
    const ym = ymS[i] - e;
    // k: the front's rows: 0 under the shelf, 1 the orbit's roof, 2 its floor and back wall, 3 the infraorbital margin
    // (standing a little proud of the dorsal margin: the scan's sagittal sections), 4 and 5 the face below it — the
    // pterygostomian regions, and in the middle the buccal frame recessed behind the maxillipeds — 6 the sternum's front
    const lobe = 1 - smooth(2.4, 4.0, Math.abs(Es[i][0]));
    const deep = 1 - 0.85 * lobe;
    const S = stern[i];
    const buccal = centreFront(i);
    switch (k) {
      case 0: { const p = at(i, 0.3); return [p[0], ym - 0.25, p[1]]; }
      case 1: { const p = at(i, 2.2 * deep); return [p[0], ym - 0.65, p[1]]; }
      case 2: { const p = at(i, 2.4 * deep); return [p[0], ym - 1.9, p[1]]; }
      case 3: { const p = at(i, -0.25 + 0.6 * lobe); return [p[0], ym - 2.6, p[1]]; }
      case 4: { const p = at(i, 0.6 + 1.6 * buccal); return [p[0], ym - 4.6, p[1]]; }
      case 5: { const p = at(i, 2.6 + 1.6 * buccal); return [p[0], mix(4.6, 3.6, buccal), p[1]]; }
      default: return [S[0], 1.9 * buccal + 0.9 * (1 - buccal), S[1]];
    }
  };
  const nRows = lod.fineUnder ? 7 : 3;
  const rows: Row[] = [];
  for (let k = 0; k < nRows; k++) {
    const kk = lod.fineUnder ? k : [0, 3, 6][k];
    const t = kk / 6;
    rows.push((i) => {
      const f = front[i];
      const sp = sideAt(i, t), fp = frontAt(i, kk);
      const part = f > 0.5 && (kk === 1 || kk === 2) ? PART.ORBIT : PART.UNDER;
      const cav = f * (kk === 1 || kk === 2 ? 0.8 : kk === 5 ? 0.35 : 0) + (1 - f) * (kk === 6 ? 0.5 : 0.12);
      return { x: mix(sp[0], fp[0], f), y: mix(sp[1], fp[1], f), z: mix(sp[2], fp[2], f), part, cav };
    });
  }
  const top = grid[grid.length - 1];
  const shelf: number[] = [];
  for (let i = 0; i < N; i++) {
    const E = loop[i];
    const vi = gb.v(E.x + inw[i][0] * 0.08, E.ym - e / 2, E.z + inw[i][1] * 0.08, body, 1, body, PART.UNDER, 1, i / N, 0.2);
    gb.setMm(vi, E.x, E.z);
    shelf.push(vi);
  }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; gb.quad(top[i], shelf[i], shelf[j], top[j]); }
  let prev = shelf;
  for (const R of rows) {
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = R(i);
      const vi = gb.v(p.x, p.y, p.z, body, 1, body, p.part, 0, i / N, p.cav);
      gb.setMm(vi, p.x, p.z);
      row.push(vi);
    }
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; gb.quad(prev[i], row[i], row[j], prev[j]); }
    prev = row;
  }
  // ---- the sternum: rings in to its centre, a little convex below
  const sc: V2 = [0, -1.5];
  const sRings = lod.sternum;
  for (let r = 1; r <= sRings; r++) {
    const k = 1 - r / (sRings + 1);
    const row: number[] = [];
    for (let i = 0; i < N; i++) {
      const S = stern[i];
      const x = sc[0] + (S[0] - sc[0]) * k, z = sc[1] + (S[1] - sc[1]) * k;
      const vi = gb.v(x, 0.9 * k * k - 0.1 * (1 - k * k), z, body, 1, body, PART.STERNUM, k, i / N, 0.1);
      gb.setMm(vi, x, z);
      row.push(vi);
    }
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; gb.quad(prev[i], row[i], row[j], prev[j]); }
    prev = row;
  }
  const sp = gb.v(sc[0], -0.12, sc[1], body, 1, body, PART.STERNUM, 0, 0, 0.1);
  for (let i = 0; i < N; i++) gb.tri(prev[i], sp, prev[(i + 1) % N]);
}

// ------------------------------------------------------------------ limbs

const angDist = (a: number, b: number) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };

interface ArticleOut {
  /** the article's surface at (t, a) in its local frame (for spines, teeth, setae) */
  surface(t: number, a: number): { p: Vector3; n: Vector3 };
}

/**
 * One article of a leg in its own frame (x distal from its proximal joint, y dorsal, z anterior for the left side): a
 * lofted tube through the spec's sections — never a cylinder: superellipse sections flattened as the article is,
 * keels and costae, the three-sided prism of the cheliped's merus — narrowed to a neck at the proximal joint (the
 * articular membrane, a clear waist) and rounded off beyond the distal joint, pointed at a dactylus's tip.
 */
function buildArticle(gb: GeoBuilder, spec: ArticleSpec, L: number, lod: Lod, bone: number, parent: number, part: number, last: boolean, flag = 0): ArticleOut {
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
    // the neck inside the parent's socket (a clear waist: B65, B70) and the rim at the distal end
    if (neck > 0) k *= 0.62 + 0.38 * smooth(0.0, neck, t);
    else if (t < 0.02) k *= 0.85 + 7.5 * Math.max(0, t);
    if (!last && t > 0.95) k *= 1 + 0.05 * Math.sin(Math.PI * Math.min(1, (t - 0.95) / 0.05));
    y *= k; z *= k;
    let rid = 0;
    if (spec.costae) for (const [ac, h, w] of spec.costae) rid += h * Math.exp(-((angDist(a, ac) / w) ** 2));
    if (rid) { const l = Math.hypot(ca * s.hz, sa * s.hy) || 1; const f = Math.min(1, Math.min(s.hy, s.hz) / 0.5) * (neck > 0 ? smooth(0, neck, t) : 1); y += ((ca * s.hz) / l) * rid * f; z += ((sa * s.hy) / l) * rid * f; }
    const th = twistAt(t);
    if (th) { const c = Math.cos(th), si = Math.sin(th); const y2 = y * c + z * si; z = -y * si + z * c; y = y2; }
    return new Vector3(t * L, s.cy + y, s.cz + z);
  };
  const angAt = (j: number, t: number) => j / nA - twistAt(t) / (Math.PI * 2);
  // stations along the article (finer at the neck and the tip)
  const ts: number[] = [];
  const nT = Math.max(1, Math.ceil(L / lod.legStep));
  const tStart = -Math.min(0.08, 0.5 / L);
  ts.push(tStart);
  if (neck > 0 && lod.tier < 2) ts.push(neck * 0.35, neck * 0.75);
  for (let i = 1; i <= nT; i++) { const t = i / nT; if (t > (neck > 0 && lod.tier < 2 ? neck : 0) + 0.02 && t < 1) ts.push(t); }
  if (last) { if (lod.tier === 0) ts.push(0.96, 0.99); ts.push(1); } else ts.push(1);
  ts.sort((a, b) => a - b);
  const capX = last ? 0 : Math.min(0.3, 0.16 * Math.min(sec(1).hy, sec(1).hz) + 0.06);
  const rows: number[][] = [];
  const weight = (t: number) => (neck > 0 ? 0.5 + 0.5 * smooth(tStart, neck, t) : t < 0.05 ? 0.75 + 5 * t : 1);
  const partAt = (t: number) => (neck > 0 && t < neck * 0.6 ? PART.MEMBRANE : part);
  for (const t of ts) {
    const row: number[] = [];
    for (let j = 0; j <= nA; j++) {
      const a = (j / nA) * Math.PI * 2;
      const p = radial(Math.max(0, t), a);
      if (t < 0) p.x = t * L;
      const cav = neck > 0 && t < neck ? 0.7 : t > 0.95 && !last ? 0.4 : 0;
      const vi = gb.v(p.x, p.y, p.z, bone, weight(t), parent, partAt(t), t, angAt(j, t), cav, flag);
      const sc = sec(Math.max(0, t));
      gb.setMm(vi, t * L, a * 0.5 * (sc.hy + sc.hz));
      row.push(vi);
    }
    gb.twin(row[0], row[nA]);
    rows.push(row);
  }
  const p0 = sec(0);
  const cap0 = gb.v(tStart * L - 0.12, p0.cy, p0.cz, bone, weight(tStart), parent, PART.MEMBRANE, 0, 0, 0.8, flag);
  for (let j = 0; j < nA; j++) gb.tri(cap0, rows[0][j + 1], rows[0][j]);
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < nA; j++) gb.quad(rows[r][j], rows[r][j + 1], rows[r + 1][j + 1], rows[r + 1][j]);
  const lastRow = rows[rows.length - 1];
  const s1 = sec(1);
  if (last) {
    for (let j = 0; j < nA; j++) gb.tri(lastRow[j], lastRow[j + 1], gb.vn(L + 0.02, s1.cy, s1.cz, 1, 0, 0, bone, 1, parent, part, 1, angAt(j + 0.5, 1), 0, flag));
  } else {
    let prevRow = lastRow;
    // (the distal end cut square with a narrow rim: the next article's neck sits in it, no sausage end)
    const caps = lod.tier === 0 ? ([[0.35, 0.97], [0.75, 0.78]] as const) : ([[0.7, 0.8]] as const);
    for (const [dx, k] of caps) {
      const row: number[] = [];
      for (let j = 0; j <= nA; j++) {
        const a = (j / nA) * Math.PI * 2;
        const p = radial(1, a);
        row.push(gb.v(L + capX * dx, s1.cy + (p.y - s1.cy) * k, s1.cz + (p.z - s1.cz) * k, bone, 1, parent, part, 1, angAt(j, 1), 0.35, flag));
      }
      gb.twin(row[0], row[nA]);
      for (let j = 0; j < nA; j++) gb.quad(prevRow[j], prevRow[j + 1], row[j + 1], row[j]);
      prevRow = row;
    }
    for (let j = 0; j < nA; j++) gb.tri(prevRow[j], prevRow[j + 1], gb.vn(L + capX, s1.cy, s1.cz, 1, 0, 0, bone, 1, parent, part, 1, angAt(j + 0.5, 1), 0.3, flag));
  }
  return {
    surface(t: number, a: number) {
      const p = radial(t, a);
      const eps = 0.01;
      const pa = radial(t, a + eps), pt = radial(Math.min(1, t + eps), a), pm = radial(Math.max(0, t - eps), a);
      const ta = pa.sub(p), tt = pt.sub(pm);
      return { p, n: new Vector3().crossVectors(ta, tt).normalize() };
    },
  };
}

/** a cone (spine, spinule, tooth) from `base` along `dir`, bending towards `bend` as it goes */
function cone(gb: GeoBuilder, base: Vector3, dir: Vector3, r: number, len: number, sides: number, bone: number, part: number, bend?: Vector3, flag = 0): void {
  const d = dir.clone().normalize();
  const u = new Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? AY : AX).normalize();
  const w = new Vector3().crossVectors(d, u);
  const steps = sides > 4 ? 2 : 1;
  const rings: number[][] = [];
  for (let s = 0; s < steps; s++) {
    const f = s / steps;
    const rr = r * (1 - f);
    const c = base.clone().addScaledVector(d, len * f);
    if (bend) c.addScaledVector(bend, len * 0.25 * f * f);
    const row: number[] = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(w, Math.sin(a) * rr);
      row.push(gb.v(p.x, p.y, p.z, bone, 1, bone, part, f, j / sides, s === 0 ? 0.5 : 0, flag));
    }
    rings.push(row);
  }
  const tipP = base.clone().addScaledVector(d, len);
  if (bend) tipP.addScaledVector(bend, len * 0.25);
  const tip = gb.v(tipP.x, tipP.y, tipP.z, bone, 1, bone, part, 1, 0, 0, flag);
  for (let s = 0; s < rings.length - 1; s++) for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    gb.quad(rings[s][j], rings[s][k], rings[s + 1][k], rings[s + 1][j]);
  }
  const lastR = rings[rings.length - 1];
  for (let j = 0; j < sides; j++) gb.tri(lastR[j], lastR[(j + 1) % sides], tip);
}

/**
 * hair cards along an article: a fringe of setae (drawn strand by strand in the setae material). `side` tells the
 * material which kind: 0 the carapace's lateral fringe, 1 long fine setae, 2 stiff short setae
 */
function fringe(hb: GeoBuilder, art: ArticleOut, t0: number, t1: number, a: number, len: number, tilt: number, bone: number, L: number, count: number, side = 0, flag = 0): void {
  const rows: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = t0 + ((t1 - t0) * i) / count;
    const { p, n } = art.surface(t, a);
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, (i + 0.5) / (count + 1)))) ** 0.5;
    const dir = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(AX, Math.sin(tilt)).normalize();
    const l = len * (0.5 + 0.5 * taper);
    const q = p.clone().addScaledVector(dir, l);
    const card = new Vector3().crossVectors(AX, dir).normalize();
    const u = t * L;
    rows.push([hb.vn(p.x, p.y, p.z, card.x, card.y, card.z, bone, 1, bone, side, u, 0, 0, flag), hb.vn(q.x, q.y, q.z, card.x, card.y, card.z, bone, 1, bone, side, u, 1, 0, flag)]);
  }
  for (let i = 0; i < rows.length - 1; i++) hb.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
}

function legPart(id: LegId, a: ArticleName): number {
  if (id === 'P1') return a === 'pr' ? PART.PALM : a === 'da' ? PART.FINGER : PART.CHELA_ARM;
  return a === 'da' ? PART.DACTYL : PART.LEG;
}

/**
 * Every leg's articles, spinules and (top tier) setae, skinned to the leg's bones; the cheliped carries both chelae,
 * the mature male's and the female's (the material folds away the one the individual does not have).
 */
export function buildLegs(gb: GeoBuilder, hb: GeoBuilder | null, lod: Lod, rig: RigDef): void {
  const m = new Matrix4();
  for (const leg of rig.legs) {
    if (lod.tier === 2) { buildLegTube(gb, leg, rig); continue; }
    const pieces: { spec: ArticleSpec; bone: string; L: number; flag: number; da: boolean; local?: Matrix4; finger?: boolean }[] = leg.spec.articles.map((spec, ai) => ({ spec, bone: legBone(leg.id, leg.side, spec.name), L: leg.lengths[ai], flag: 0, da: spec.name === 'da' }));
    if (leg.id === 'P1') {
      for (const [ch, flag, daBone] of [[CHELA_MALE, FLAG.MALE_CHELA, 'da'], [CHELA_FEMALE, FLAG.FEMALE_CHELA, 'daF']] as const) {
        const pr = legBone('P1', leg.side, 'pr');
        pieces.push({ spec: ch.palm, bone: pr, L: ch.palm.length, flag, da: false });
        // (the fixed finger: its own piece set at the palm's lower corner and bent down)
        pieces.push({ spec: ch.finger, bone: pr, L: ch.finger.length, flag, da: true, finger: true, local: new Matrix4().makeRotationZ(ch.fingerAngle).setPosition(ch.fingerAt[0], ch.fingerAt[1], 0) });
        pieces.push({ spec: ch.da, bone: legBone('P1', leg.side, daBone), L: ch.da.length, flag, da: true });
      }
    }
    for (const pc of pieces) {
      const { spec, L, flag } = pc;
      const bone = rig.byName[pc.bone];
      const def = rig.defs[bone];
      const parent = rig.byName[def.parent!];
      const start = gb.count, triStart = gb.idx.length;
      const last = pc.da;
      const art = buildArticle(gb, spec, L, lod, bone, pc.finger ? bone : parent, pc.finger ? PART.FIXED : legPart(leg.id, spec.name), last, flag);
      if (lod.spines && spec.spines) for (const s of spec.spines) {
        const { p, n } = art.surface(s.t, s.a);
        const dir = n.clone().multiplyScalar(Math.cos(s.lean)).addScaledVector(AX, Math.sin(s.lean)).normalize();
        cone(gb, p.addScaledVector(n, -0.1 * s.r), dir, s.r, s.length, 5, bone, PART.SPINE, AX.clone().multiplyScalar(0.4), flag);
      }
      // the serrulate margin: a row of small spinules leaning distally (B24, A1)
      if (lod.serrate && spec.serrate) {
        const S = spec.serrate;
        for (let k = 0; k < S.count; k++) {
          const t = S.t0 + ((S.t1 - S.t0) * (k + 0.5)) / S.count;
          const { p, n } = art.surface(t, S.a);
          const dir = n.clone().multiplyScalar(0.55).addScaledVector(AX, 0.83).normalize();
          const len = S.length * (0.75 + 0.5 * Math.abs(Math.sin(k * 2.17 + leg.yaw * 9)));
          cone(gb, p.addScaledVector(n, -0.05), dir, len * 0.32, len, 4, bone, PART.SPINE, undefined, flag);
        }
      }
      // the fingers' cutting edges: small teeth along both, and the male's big wedge on the fixed finger (Wada 2018)
      if (leg.id === 'P1' && (pc.finger || spec.name === 'da')) {
        const male = flag === FLAG.MALE_CHELA;
        const fixed = !!pc.finger;
        const [t0, t1] = fixed ? [0.06, 0.93] : [0.12, 0.92];
        const count = lod.fingerTeeth ? (male ? 15 : 11) : 0;
        const a = fixed ? 0 : Math.PI;
        for (let k = 0; k < count; k++) {
          const t = t0 + ((t1 - t0) * (k + 0.5)) / count;
          const { p, n } = art.surface(t, a);
          const size = (male ? 0.34 : 0.2) * (1 - 0.4 * ((k + 0.5) / count));
          const dir = n.clone().multiplyScalar(0.95).addScaledVector(AX, 0.3).normalize();
          cone(gb, p.addScaledVector(n, -0.08), dir, 0.55 * size, 0.9 * size, 4, bone, PART.TOOTH, undefined, flag);
        }
        if (male && fixed && lod.tier < 2) {
          // the wedge: a broad triangular tooth on the fixed finger's cutting edge
          const { p, n } = art.surface(CHELA_MALE.tooth.t, 0);
          cone(gb, p.addScaledVector(n, -0.25), n.clone().addScaledVector(AX, 0.2).normalize(), 1.0, CHELA_MALE.tooth.h, lod.fingerTeeth ? 6 : 3, bone, PART.TOOTH, AX.clone().multiplyScalar(0.3), flag);
        }
      }
      // setae (top tier): the meri's posterior margins, the propodi's lower margins, the dactyli, the cheliped's merus
      if (hb && lod.setae) {
        const hs = hb.count, ht = hb.idx.length;
        if (leg.id !== 'P1') {
          if (spec.name === 'me') { fringe(hb, art, 0.1, 0.95, -Math.PI / 2 - 0.2, 0.75, 0.75, bone, L, 18, 1); fringe(hb, art, 0.15, 0.9, Math.PI / 2 - 0.1, 0.35, 0.95, bone, L, 12, 2); }
          else if (spec.name === 'ca') fringe(hb, art, 0.15, 0.9, -Math.PI / 2, 0.6, 0.8, bone, L, 8, 1);
          else if (spec.name === 'pr') { fringe(hb, art, 0.15, 0.95, Math.PI, 0.55, 0.9, bone, L, 10, 2); fringe(hb, art, 0.15, 0.95, -Math.PI / 2, 0.5, 0.85, bone, L, 8, 1); }
          else if (spec.name === 'da') { fringe(hb, art, 0.08, 0.7, Math.PI / 2, 0.45, 0.85, bone, L, 9, 2); fringe(hb, art, 0.08, 0.7, -Math.PI / 2, 0.45, 0.85, bone, L, 9, 2); }
        } else if (spec.name === 'me') {
          fringe(hb, art, 0.1, 0.95, Math.PI + 0.6, 0.9, 0.7, bone, L, 16, 1);
        } else if (pc.finger && flag === FLAG.FEMALE_CHELA) {
          // the female's chela: long fine setae over the fingers' inner face (B62, B68)
          fringe(hb, art, 0.05, 0.9, -Math.PI / 2 - 0.4, 1.4, 0.55, bone, L, 12, 1, flag);
        }
        if (pc.local) hb.transform(hs, pc.local);
        if (leg.sg < 0) hb.mirrorZ(hs, ht);
        hb.transform(hs, m.copy(def.matrix));
      }
      if (pc.local) gb.transform(start, pc.local);
      if (leg.sg < 0) gb.mirrorZ(start, triStart);
      gb.transform(start, m.copy(def.matrix));
    }
  }
}

/**
 * The far tier's leg: one slender tube along the leg's joints as it stands in the bind pose (lod2 rides each leg on
 * one bone, its merus's): flattened at the merus, tapering to the dactylus's point; the cheliped's arm and both chelae
 * as low boxes.
 */
function buildLegTube(gb: GeoBuilder, leg: LegRig, rig: RigDef): void {
  const bone = rig.byName[legBone(leg.id, leg.side, 'me')];
  const P = (name: ArticleName | 'daF', x = 0, y = 0) => new Vector3(x, y, 0).applyMatrix4(rig.defs[rig.byName[legBone(leg.id, leg.side, name)]].matrix);
  const part = leg.id === 'P1' ? PART.CHELA_ARM : PART.LEG;
  const tube = (pts: Vector3[], radii: number[], prt: number, flag = 0) => {
    const sides = 4;
    let prev: number[] | null = null;
    for (let s = 0; s < pts.length; s++) {
      const tg = pts[Math.min(pts.length - 1, s + 1)].clone().sub(pts[Math.max(0, s - 1)]).normalize();
      const u = new Vector3().crossVectors(tg, AY).normalize();
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      const w = new Vector3().crossVectors(u, tg);
      const row: number[] = [];
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const p = pts[s].clone().addScaledVector(w, Math.sin(a) * radii[s] * 0.55).addScaledVector(u, Math.cos(a) * radii[s] * 1.05);
        row.push(gb.v(p.x, p.y, p.z, bone, 1, bone, prt, s / (pts.length - 1), j / sides, 0, flag));
      }
      if (prev) for (let j = 0; j < sides; j++) gb.quad(prev[j], prev[(j + 1) % sides], row[(j + 1) % sides], row[j]);
      prev = row;
    }
    const last = pts[pts.length - 1], tg = last.clone().sub(pts[pts.length - 2]).normalize();
    const tip = last.clone().addScaledVector(tg, radii[radii.length - 1]);
    const ti = gb.v(tip.x, tip.y, tip.z, bone, 1, bone, prt, 1, 0, 0, flag);
    for (let j = 0; j < sides; j++) gb.tri(prev![j], prev![(j + 1) % sides], ti);
  };
  if (leg.id !== 'P1') {
    const L = leg.lengths;
    const b = leg.spec.articles[2].sections[2].hz;
    const tip = P('da', L[5]);
    tube([P('cx'), P('me'), P('me', L[2] * 0.5), P('ca'), P('pr'), P('da'), tip], [1.1, 0.9 * b, b, 0.75 * b, 0.6 * b, 0.42 * b, 0.12], part);
    return;
  }
  tube([P('cx'), P('me'), P('ca'), P('ca', 5.0)], [1.4, 1.5, 1.8, 1.6], part);
  // the chelae: a palm and the two fingers each (the male's long, the female's small)
  for (const [ch, flag, daBone] of [[CHELA_MALE, FLAG.MALE_CHELA, 'da'], [CHELA_FEMALE, FLAG.FEMALE_CHELA, 'daF']] as const) {
    const L = ch.palm.length, h = ch.palm.sections[3].hy;
    const fa = ch.fingerAngle, fl = ch.finger.length;
    const fx = ch.fingerAt[0] + Math.cos(fa) * fl, fy = ch.fingerAt[1] + Math.sin(fa) * fl;
    tube([P('pr'), P('pr', L * 0.45), P('pr', L)], [h * 0.45, h * 0.9, h * 0.85], PART.PALM, flag);
    tube([P('pr', ch.fingerAt[0], ch.fingerAt[1]), P('pr', ch.fingerAt[0] + Math.cos(fa) * fl * 0.5, ch.fingerAt[1] + Math.sin(fa) * fl * 0.5), P('pr', fx, fy)], [h * 0.4, h * 0.3, 0.1], PART.FIXED, flag);
    tube([P(daBone), P(daBone, ch.da.length * 0.5, -0.3), P(daBone, ch.da.length, -1.0)], [h * 0.36, h * 0.28, 0.1], PART.FINGER, flag);
  }
}

// ------------------------------------------------------------------ eyes, mouthparts, abdomen, antennae

/**
 * The eye in its bone's frame (x out along the stalk): one surface from the joint in the socket to the tip — the short,
 * thick basal article (a collar), the long slender stalk with its slight waist a third of the way up and its gentle
 * swelling towards the tip, and the cornea, an elongate oval cap over the tip, a little wider than the stalk and
 * reaching further down its front and outer side than its back (B59, B66). Each vertex carries its signed distance
 * from the cornea's edge (`aSeg.x`, > 0 on the cornea) so that the shader draws the edge smooth whatever the
 * tessellation, and the angle round (`aSeg.y`).
 */
function buildEye(gb: GeoBuilder, lod: Lod, bone: number, sg: number): void {
  const sides = lod.eyeSeg;
  const E = EYE;
  const x0 = -0.35, xb = E.basal, xs = E.basal + E.stalk, xt = xs + E.cornea;
  const r = (x: number): number => {
    // the basal article: a collar a little wider than the stalk, narrowing into it
    if (x < xb) return E.basalR * (x < 0.3 ? 0.9 + 0.1 * smooth(x0, 0.3, x) : 1 - 0.1 * smooth(0.3, xb, x));
    if (x < xb + 0.4) return E.basalR * 0.9 + (E.stalkR - E.basalR * 0.9) * smooth(xb, xb + 0.4, x);
    if (x < xs) {
      // the stalk: a slight waist a third of the way up, swelling gently towards the cornea (B59)
      const f = (x - xb) / E.stalk;
      const waist = (1 - E.waist / E.stalkR) * Math.sin(Math.PI * Math.min(1, f / 0.7)) * (f < 0.7 ? 1 : 0);
      return E.stalkR * (1 - waist) * (1 + 0.14 * smooth(0.55, 1, f));
    }
    // the cornea: widest a third of the way along, closing round the tip
    const g = (x - xs) / E.cornea, rs = E.stalkR * 1.14;
    if (g < 0.35) return rs + (E.corneaR - rs) * smooth(0, 0.35, g);
    return Math.max(0.02, E.corneaR * Math.sqrt(Math.max(0, 1 - ((g - 0.35) / 0.65) ** 2)));
  };
  // the cornea's edge: oblique, reaching further down the stalk on its front (+y here) and outer face (sg·z)
  const edge = (a: number) => xs + 0.3 - 0.55 * Math.max(0, Math.cos(a)) - 0.35 * Math.max(0, sg * Math.sin(a));
  const stations: number[] = [];
  const nb = lod.tier === 0 ? 5 : lod.tier === 1 ? 2 : 1;
  for (let i = 0; i <= nb; i++) stations.push(x0 + ((xb + 0.35 - x0) * i) / nb);
  const ns = lod.tier === 0 ? 22 : lod.tier === 1 ? 4 : 1;
  for (let i = 1; i <= ns; i++) stations.push(xb + 0.35 + ((xs - xb - 0.35) * i) / ns);
  const nc = lod.tier === 0 ? 16 : lod.tier === 1 ? 4 : 2;
  for (let i = 1; i < nc; i++) stations.push(xs + E.cornea * (1 - Math.pow(1 - i / nc, 1.4)));
  let prev: number[] | null = null;
  for (const x of stations) {
    const row: number[] = [];
    const rr = r(x);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const y = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const sc = x - edge(a);
      const vi = gb.v(x, y, z, bone, 1, bone, x < xb + 0.2 ? PART.STALK : PART.CORNEA, sc, j / sides, x < 0.3 ? 0.6 : 0, 3);
      gb.setMm(vi, x, a * rr);
      row.push(vi);
    }
    gb.twin(row[0], row[sides]);
    if (prev) for (let j = 0; j < sides; j++) gb.quad(prev[j], prev[j + 1], row[j + 1], row[j]);
    prev = row;
  }
  for (let j = 0; j < sides; j++) gb.tri(prev![j], prev![j + 1], gb.vn(xt, 0, 0, 1, 0, 0, bone, 1, bone, PART.CORNEA, xt - xs, (j + 0.5) / sides, 0, 3));
}

/** the third maxilliped: a bulging oval plate (ischium and merus, the suture a third of the way down: the shader) */
function buildMxp(gb: GeoBuilder, lod: Lod, bone: number, sg: number): void {
  const nx = lod.tier === 0 ? 8 : 3, nz = lod.tier === 0 ? 12 : 4;
  const W = MXP3.halfWidth - 0.15;
  const Ld = Math.hypot(MXP3.y1 - MXP3.y0, MXP3.z1 - MXP3.z0);
  // in the bone's frame: x the crab's left (the plate runs from its hinge at the outer edge to the midline: −sg·x),
  // y out of the face, z down the plate
  const g: number[][] = [], b: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const row: number[] = [], brow: number[] = [];
    for (let k = 0; k <= nz; k++) {
      const v = k / nz;
      // an oval: the corners rounded off
      const half = Math.sqrt(Math.max(0, 1 - Math.pow(2 * v - 1, 4)));
      const x = -sg * W * (0.8 + 0.2 * half) * u;
      const bulge = 0.75 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + 0.15 * Math.sin(Math.PI * u);
      row.push(gb.v(x, 0.25 + bulge, Ld * v * (0.94 + 0.06 * half), bone, 1, bone, PART.MXP, u, v, 0.1, 0));
      brow.push(gb.v(x, -0.35, Ld * v, bone, 1, bone, PART.MXP, u, v, 0.9, 0));
    }
    g.push(row); b.push(brow);
  }
  // (faces out of the face on the front and into the body on the back: the winding follows the side)
  const q = (a: number, c: number, d: number, e: number, out: boolean) => (out === sg > 0 ? gb.quad(a, e, d, c) : gb.quad(a, c, d, e));
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    q(g[i][k], g[i][k + 1], g[i + 1][k + 1], g[i + 1][k], true);
    q(b[i][k], b[i][k + 1], b[i + 1][k + 1], b[i + 1][k], false);
  }
  // the rim all round
  const ring: [number, number][] = [];
  for (let k = 0; k <= nz; k++) ring.push([g[0][k], b[0][k]]);
  for (let i = 1; i <= nx; i++) ring.push([g[i][nz], b[i][nz]]);
  for (let k = nz - 1; k >= 0; k--) ring.push([g[nx][k], b[nx][k]]);
  for (let i = nx - 1; i >= 1; i--) ring.push([g[i][0], b[i][0]]);
  ring.push(ring[0]);
  for (let j = 0; j < ring.length - 1; j++) q(ring[j][0], ring[j][1], ring[j + 1][1], ring[j + 1][0], sg > 0);
}

/** the abdomen folded under the sternum: both the male's and the female's (the material keeps the individual's) */
function buildAbdomen(gb: GeoBuilder, lod: Lod, body: number): void {
  for (const sex of ['male', 'female'] as const) {
    const A = ABDOMEN[sex];
    const flag = sex === 'male' ? FLAG.MALE_ABDOMEN : FLAG.FEMALE_ABDOMEN;
    const nt = lod.tier === 0 ? 28 : lod.tier === 1 ? 6 : 2, nw = lod.tier === 0 ? 10 : lod.tier === 1 ? 3 : 1;
    const outer: number[][] = [], inner: number[][] = [];
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;
      const half = knotLerp(A.w.map(([tt, w]) => ({ t: tt, w })), t, (k) => k.w);
      const z = ABDOMEN.hinge + A.length * t;
      const row: number[] = [], irow: number[] = [];
      for (let j = 0; j <= nw; j++) {
        const u = (j / nw) * 2 - 1;
        const x = u * Math.max(0.05, half);
        // a low dome across; the somites' edges small steps (six somites and the telson: the shader draws the sutures)
        const y = -0.35 - 0.4 * (1 - u * u) * Math.min(1, half / 2.5) - 0.08 * Math.max(0, Math.sin(t * Math.PI * 7)) * (1 - u * u);
        row.push(gb.v(x, y, z, body, 1, body, PART.STERNUM, t, (u + 1) / 2, 0.2, flag));
        irow.push(gb.v(x, 0.05, z, body, 1, body, PART.STERNUM, t, (u + 1) / 2, 0.9, flag));
      }
      outer.push(row); inner.push(irow);
    }
    for (let i = 0; i < nt; i++) for (let j = 0; j < nw; j++) gb.quad(outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]);
    for (let i = 0; i < nt; i++) {
      gb.quad(outer[i][0], outer[i + 1][0], inner[i + 1][0], inner[i][0]);
      gb.quad(outer[i][nw], inner[i][nw], inner[i + 1][nw], outer[i + 1][nw]);
    }
  }
}

/** a slender rod (antennae, antennules) along a bent axis, radius r0 → r1 */
function rod(gb: GeoBuilder, start: Vector3, dir: Vector3, len: number, r0: number, r1: number, sides: number, steps: number, bone: number, part: number, bend: Vector3 | null = null): void {
  const d = dir.clone().normalize();
  const at = (t: number) => start.clone().addScaledVector(d, len * t).addScaledVector(bend ?? new Vector3(), t * t);
  let prev: number[] | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = at(t), tg = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    const u = new Vector3().crossVectors(tg, Math.abs(tg.y) < 0.9 ? AY : AX).normalize();
    const w = new Vector3().crossVectors(tg, u);
    const r = r0 + (r1 - r0) * t;
    const row: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
      row.push(gb.v(p.x, p.y, p.z, bone, 1, bone, part, t, j / sides, s === 0 ? 0.5 : 0, 0));
    }
    gb.twin(row[0], row[sides]);
    if (prev) for (let j = 0; j < sides; j++) gb.quad(prev[j], prev[j + 1], row[j + 1], row[j]);
    prev = row;
  }
  const tip = at(1);
  const ti = gb.v(tip.x, tip.y, tip.z, bone, 1, bone, part, 1, 0, 0, 0);
  for (let j = 0; j < sides; j++) gb.tri(prev![j], prev![j + 1], ti);
}

/** the antennules (a small "Y" folded between the eyestalks' bases: B66, B60) and the short antennae beside them */
function buildAntennae(gb: GeoBuilder, body: number): void {
  for (const sg of [1, -1]) {
    rod(gb, new Vector3(sg * 1.1, 11.6, 10.9), new Vector3(sg * 0.3, 0.85, 0.35), 0.9, 0.18, 0.13, 5, 2, body, PART.STALK);
    rod(gb, new Vector3(sg * 1.35, 12.45, 11.2), new Vector3(sg * 0.45, 0.85, 0.15), 0.9, 0.11, 0.05, 4, 3, body, PART.STALK, new Vector3(sg * 0.15, 0, 0.05));
    rod(gb, new Vector3(sg * 3.3, 11.7, 10.75), new Vector3(sg * 0.55, 0.75, 0.35), 1.8, 0.13, 0.04, 4, 4, body, PART.STALK, new Vector3(sg * 0.3, -0.1, 0));
  }
}

/** the carapace's lateral margins' fringe of setae (A32, B24, B49): cards along the outline, pointing out and down */
function marginSetae(hb: GeoBuilder, lod: Lod, body: number): void {
  const loop = outline(lod);
  const cards: [number, number][] = [];
  let run = false;
  const flush = () => {
    for (let i = 0; i < cards.length - 1; i++) hb.quad(cards[i][0], cards[i][1], cards[i + 1][1], cards[i + 1][0]);
    cards.length = 0;
  };
  for (let i = 0; i < loop.length; i += 3) {
    const E = loop[i], n = loop[(i + 1) % loop.length], p = loop[(i + loop.length - 1) % loop.length];
    const onSide = E.z < 6.5 && E.z > -10.5 && Math.abs(E.x) > 13;
    if (!onSide) { if (run) flush(); run = false; continue; }
    run = true;
    void n; void p;
    const sgn = E.x > 0 ? 1 : -1;
    const len = 0.55 + 0.25 * Math.abs(Math.sin(i * 0.37));
    const b = new Vector3(E.x, E.ym - 0.1, E.z);
    const q = b.clone().add(new Vector3(sgn * len * 0.8, -len * 0.55, 0));
    cards.push([hb.vn(b.x, b.y, b.z, 0, 0, 1, body, 1, body, 0, E.z, 0, 0, 0), hb.vn(q.x, q.y, q.z, 0, 0, 1, body, 1, body, 0, E.z, 1, 0, 0)]);
  }
  flush();
}

// ------------------------------------------------------------------ one tier

export interface TierGeometry {
  shell: BufferGeometry;
  setae: BufferGeometry | null;
  triangles: number;
  /** the bones the tier is skinned to (its skeleton), in the rig's order */
  bones: string[];
}

/** remap the builder's skin indices from the rig's bones to the tier's skeleton (articles folded together merge) */
function remapSkin(gb: GeoBuilder, rig: RigDef, tier: 0 | 1 | 2, bones: string[]): void {
  const idx = rig.defs.map((d) => bones.indexOf(tierBone(tier, d.name)));
  for (let v = 0; v < gb.count; v++) {
    const a = idx[gb.si[v * 4]], b = idx[gb.si[v * 4 + 1]];
    if (a === b) { gb.si[v * 4] = a; gb.si[v * 4 + 1] = a; gb.sw[v * 4] = 1; gb.sw[v * 4 + 1] = 0; }
    else { gb.si[v * 4] = a; gb.si[v * 4 + 1] = b; }
  }
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
    let s = gb.count;
    buildEye(gb, lod, eye, sg);
    gb.transform(s, m.copy(rig.defs[eye].matrix));
    if (lod.tier < 2) {
      const mx = rig.byName[`J_mxp_${side}`];
      s = gb.count;
      buildMxp(gb, lod, mx, sg);
      gb.transform(s, m.copy(rig.defs[mx].matrix));
    }
  }
  if (lod.antennae) buildAntennae(gb, body);
  if (hb) marginSetae(hb, lod, body);
  const bones = tierBones(rig, lod.tier);
  remapSkin(gb, rig, lod.tier, bones);
  if (hb) remapSkin(hb, rig, lod.tier, bones);
  const shell = gb.build();
  const setae = hb && hb.count > 0 ? hb.build() : null;
  return { shell, setae, triangles: gb.idx.length / 3 + (hb ? hb.idx.length / 3 : 0), bones };
}
