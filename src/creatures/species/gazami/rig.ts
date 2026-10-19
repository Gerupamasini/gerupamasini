import { Bone, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { BIND, type LegId } from './anatomy';
import { ARTICLES, SIDES, coxaFrame, legBone, type LegRig, type RigDef, type Side } from './geometry';

/**
 * The skeleton of one ガザミ, the pose a behaviour writes and its application to the bones, and the legs' kinematics
 * (no rendering: the scene, the viewer and the tests use it alike).
 *   J_root (on the ground under the body, the heading) ─ J_body (the carapace and the body: height, pitch, roll)
 *     ├ J_{P1…P5}{L,R}_cx ─ _bi ─ _me ─ _ca ─ _pr ─ _da   (5 legs a side × 6 articles)
 *     ├ J_eye_{L,R}, J_a1_{L,R} (antennules), J_a2_{L,R} (antennae), J_mxp_{L,R} (third maxillipeds)
 * Joint angles are anatomical and mean the same on both sides: `promo` swings the leg forward at the coxa, `lev`
 * raises it at the basis, `mc`, `cp`, `pd` lift the carpus, propodus and dactylus (negative: flexed down), `roll` and
 * `cpRoll` turn the merus and the propodus about their axes (the paddle's feathering), `mcYaw` swings the cheliped's
 * carpus in towards the midline (negative) and `pd` of a cheliped is its gape.
 */

export interface LegPose {
  promo: number;
  pitch: number;
  lev: number;
  roll: number;
  /** the cheliped's merus swung out to the side at the ischio-meral joint (+ outwards) */
  meYaw: number;
  mcYaw: number;
  mc: number;
  cp: number;
  cpRoll: number;
  cpYaw: number;
  pd: number;
}

export interface Pose {
  /** the root: the ground point under the body, and the heading (rad; forward = (sin, cos)) */
  pos: Vector3;
  heading: number;
  /** the body over the root: height of the sternum over the ground (mm at CW 100), pitch (+ nose up), roll (+ left up), sideways shift */
  lift: number;
  pitch: number;
  roll: number;
  /** the legs, `${id}${side}` */
  legs: Record<string, LegPose>;
  /** the eyestalks: raised (1 up in use … 0 folded back into the orbits) and their swivel */
  eyeRaise: [number, number];
  eyeYaw: [number, number];
  /** antennules' flick (0 … 1), antennae's swing (rad) */
  a1: [number, number];
  a2: [number, number];
  /** the third maxillipeds parted (0 … 1) */
  mxp: number;
  /** buried (0 … 1: the sand's level over the body as a share of its depth), sand clinging to the shell (0 … 1) */
  bury: number;
  sandCoat: number;
}

export const legKey = (id: LegId, side: Side) => `${id}${side}`;

export function bindLeg(id: LegId): LegPose {
  const b = BIND[id];
  return { promo: 0, pitch: b.pitch, lev: b.lev, roll: b.roll, meYaw: b.meYaw ?? 0, mcYaw: b.mcYaw ?? 0, mc: b.mc, cp: b.cp, cpRoll: 0, cpYaw: 0, pd: b.pd };
}

export function emptyPose(): Pose {
  const legs: Record<string, LegPose> = {};
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5'] as LegId[]) for (const s of SIDES) legs[legKey(id, s)] = bindLeg(id);
  return {
    pos: new Vector3(), heading: 0, lift: 6, pitch: 0, roll: 0, legs,
    eyeRaise: [1, 1], eyeYaw: [0, 0], a1: [0, 0], a2: [0, 0], mxp: 0, bury: 0, sandCoat: 0,
  };
}

export function copyLeg(a: LegPose, out: LegPose): LegPose {
  out.promo = a.promo; out.pitch = a.pitch; out.lev = a.lev; out.roll = a.roll; out.meYaw = a.meYaw; out.mcYaw = a.mcYaw; out.mc = a.mc; out.cp = a.cp; out.cpRoll = a.cpRoll; out.cpYaw = a.cpYaw; out.pd = a.pd;
  return out;
}

const _m = new Matrix4(), _p = new Matrix4(), _s = new Vector3();
/** Bones of one animal under `parent` (rest pose from the shared rig definition, in metres). */
export function createBones(rig: RigDef, parent: Object3D): { bones: Record<string, Bone>; list: Bone[] } {
  const bones: Record<string, Bone> = {}, list: Bone[] = [];
  for (const d of rig.defs) {
    const b = new Bone();
    b.name = d.name;
    _m.compose(d.pos.clone().multiplyScalar(0.001), d.quat, _s.set(1, 1, 1));
    _m.decompose(b.position, b.quaternion, _s);
    b.userData.rest = { pos: b.position.clone(), quat: b.quaternion.clone() };
    bones[d.name] = b;
    list.push(b);
  }
  for (const d of rig.defs) (d.parent ? bones[d.parent] : parent).add(bones[d.name]);
  void _p;
  return { bones, list };
}

const _q = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion();
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
const restQ = (b: Bone) => (b.userData.rest as { quat: Quaternion }).quat;
const restP = (b: Bone) => (b.userData.rest as { pos: Vector3 }).pos;

/** per leg: its coxa's fixed frame (rest yaw, no pitch), cached by bone */
const COXA_BASE = new WeakMap<Bone, Quaternion>();

/** a leg's pose onto its six bones */
export function applyLeg(bones: Record<string, Bone>, leg: LegRig, P: LegPose, scale = 1): void {
  const sg = leg.sg;
  const n = (a: (typeof ARTICLES)[number]) => bones[legBone(leg.id, leg.side, a)];
  const cx = n('cx');
  let base = COXA_BASE.get(cx);
  if (!base) { base = coxaFrame(leg.yaw, sg, new Quaternion()); COXA_BASE.set(cx, base); }
  cx.quaternion.copy(base).multiply(_q.setFromAxisAngle(AY, -sg * P.promo)).multiply(_q2.setFromAxisAngle(AZ, P.pitch));
  n('bi').quaternion.setFromAxisAngle(AZ, P.lev);
  n('me').quaternion.setFromAxisAngle(AY, sg * P.meYaw).multiply(_q.setFromAxisAngle(AX, sg * P.roll));
  n('ca').quaternion.setFromAxisAngle(AY, sg * P.mcYaw).multiply(_q.setFromAxisAngle(AZ, P.mc));
  n('pr').quaternion.setFromAxisAngle(AY, sg * P.cpYaw).multiply(_q.setFromAxisAngle(AZ, P.cp)).multiply(_q3.setFromAxisAngle(AX, sg * P.cpRoll));
  n('da').quaternion.setFromAxisAngle(AZ, P.pd);
  // (a cheliped can be scaled as a whole: the sexes and the larger claw)
  cx.scale.setScalar(scale);
}

/** Pose → root transform and bone rotations (ends with one world-matrix update of the whole model). */
export function applyPose(root: Object3D, bones: Record<string, Bone>, rig: RigDef, P: Pose, chelaScale: [number, number] = [1, 1]): void {
  root.position.copy(P.pos);
  root.quaternion.setFromAxisAngle(AY, P.heading);
  const body = bones.J_body;
  body.position.set(0, P.lift * 0.001, 0);
  body.quaternion.setFromAxisAngle(AX, -P.pitch).premultiply(_q.setFromAxisAngle(AZ, P.roll));
  for (const leg of rig.legs) applyLeg(bones, leg, P.legs[legKey(leg.id, leg.side)], leg.id === 'P1' ? chelaScale[leg.side === 'L' ? 0 : 1] : 1);
  SIDES.forEach((side, i) => {
    const sg = side === 'L' ? 1 : -1;
    // the eyestalk folds back and out into its orbit (a turn about the stalk's base) and swivels a little
    const e = bones[`J_eye_${side}`];
    const fold = 1 - P.eyeRaise[i];
    e.quaternion.copy(restQ(e)).multiply(_q.setFromAxisAngle(AY, sg * (1.25 * fold) + P.eyeYaw[i])).multiply(_q2.setFromAxisAngle(AZ, -0.55 * fold));
    const a1 = bones[`J_a1_${side}`];
    a1.quaternion.copy(restQ(a1)).multiply(_q.setFromAxisAngle(AZ, 0.6 * P.a1[i]));
    const a2 = bones[`J_a2_${side}`];
    a2.quaternion.copy(restQ(a2)).multiply(_q.setFromAxisAngle(AY, sg * P.a2[i]));
    const mx = bones[`J_mxp_${side}`];
    mx.quaternion.copy(restQ(mx)).multiply(_q.setFromAxisAngle(AZ, sg * 0.45 * P.mxp));
    void restP;
  });
  root.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ the legs' kinematics

/** a walking leg's chain in its own vertical plane: the distal joints follow the knee (cp) and keep the dactylus at an angle */
export interface PlanarLeg {
  /** lengths: coxa, basis-ischium + merus (fused), carpus, propodus, dactylus (mm) */
  l: [number, number, number, number, number];
  pitch: number;
}

export function planarOf(leg: LegRig): PlanarLeg {
  const L = leg.lengths;
  return { l: [L[0], L[1] + L[2], L[3], L[4], L[5]], pitch: BIND[leg.id].pitch };
}

/**
 * Where the dactylus's tip is in the leg's plane (r out from the coxa's joint, h up) for levation `lev`, knee `mc`,
 * `cp` and the dactylus's absolute angle `th` in the plane (rad from the outward horizontal, negative down).
 */
export function planarTip(L: PlanarLeg, lev: number, mc: number, cp: number, th: number, out: { r: number; h: number; jr: number; jh: number }) {
  let a = L.pitch, r = L.l[0] * Math.cos(a), h = L.l[0] * Math.sin(a);
  a += lev; r += L.l[1] * Math.cos(a); h += L.l[1] * Math.sin(a);
  a += mc; r += L.l[2] * Math.cos(a); h += L.l[2] * Math.sin(a);
  a += cp; r += L.l[3] * Math.cos(a); h += L.l[3] * Math.sin(a);
  out.jr = r; out.jh = h;
  out.r = r + L.l[4] * Math.cos(th); out.h = h + L.l[4] * Math.sin(th);
  return out;
}

const _t = { r: 0, h: 0, jr: 0, jh: 0 }, _t2 = { r: 0, h: 0, jr: 0, jh: 0 };
/**
 * IK of a walking leg for a foot target (r, h) in its plane: levation and knee by Newton steps from the leg's last
 * pose (warm start), the propodus following the knee (`cpK`), the dactylus held at `th`. Out of reach the leg
 * stretches towards the target as far as its joints allow. Writes lev, mc, cp, pd; returns the miss (mm).
 */
export function solvePlanar(L: PlanarLeg, r: number, h: number, th: number, P: LegPose, cpK = 0.32, cp0 = -0.08): number {
  // (the knee never quite straightens: a crab's walking leg keeps its bend, and the straight leg is the IK's trap)
  const clampL = (v: number) => Math.max(-0.6, Math.min(1.25, v));
  const clampK = (v: number) => Math.max(-2.1, Math.min(-0.12, v));
  const run = (lev: number, mc: number): [number, number, number] => {
    for (let it = 0; it < 8; it++) {
      const cp = cpK * mc + cp0;
      planarTip(L, lev, mc, cp, th, _t);
      const er = r - _t.r, eh = h - _t.h;
      if (er * er + eh * eh < 1e-4) break;
      const e = 1e-3;
      planarTip(L, lev + e, mc, cp, th, _t2);
      const a11 = (_t2.r - _t.r) / e, a21 = (_t2.h - _t.h) / e;
      planarTip(L, lev, mc + e, cpK * (mc + e) + cp0, th, _t2);
      const a12 = (_t2.r - _t.r) / e, a22 = (_t2.h - _t.h) / e;
      const det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-6) { mc = clampK(mc - 0.1); continue; }
      let dl = (a22 * er - a12 * eh) / det, dk = (-a21 * er + a11 * eh) / det;
      const mag = Math.hypot(dl, dk);
      if (mag > 0.35) { dl *= 0.35 / mag; dk *= 0.35 / mag; }
      lev = clampL(lev + dl); mc = clampK(mc + dk);
    }
    planarTip(L, lev, mc, cpK * mc + cp0, th, _t);
    return [lev, mc, Math.hypot(r - _t.r, h - _t.h)];
  };
  let best = run(P.lev, Math.min(P.mc, -0.12));
  // a warm start that ends far off (out of reach a moment ago, stuck at a limit): again from a bent leg
  if (best[2] > 0.5) { const b = run(0.6, -1.0); if (b[2] < best[2]) best = b; }
  const [lev, mc, miss] = best;
  const cp = cpK * mc + cp0;
  P.lev = lev; P.mc = mc; P.cp = cp;
  // the dactylus's own joint: its absolute angle less the chain's
  P.pd = th - (L.pitch + lev + mc + cp);
  return miss;
}

const _v = new Vector3(), _w = new Vector3();
/**
 * IK of a walking leg for a foot target in the body's frame (mm): the coxa swings the leg's plane to the target
 * (promo), then the planar chain reaches it. `th` the dactylus's angle in the plane. Returns the miss (mm).
 */
export function solveLeg(leg: LegRig, PL: PlanarLeg, target: Vector3, th: number, P: LegPose, cpK?: number, cp0?: number): number {
  const sg = leg.sg;
  _v.copy(target).sub(leg.coxa);
  // the target's direction in the horizontal plane against the rest direction (forward positive on both sides)
  const ang = Math.atan2(_v.z, sg * _v.x);
  P.promo = Math.max(-1.0, Math.min(1.0, ang - leg.yaw));
  const r = Math.hypot(_v.x, _v.z), h = _v.y;
  P.pitch = PL.pitch;
  return solvePlanar(PL, r, h, th, P, cpK, cp0);
}

/** forward kinematics of a leg's tip in the body's frame (mm) from a pose (walking legs; the plane of the coxa's swing) */
export function legTip(leg: LegRig, PL: PlanarLeg, P: LegPose, out = new Vector3()): Vector3 {
  planarTip(PL, P.lev, P.mc, P.cp, PL.pitch + P.lev + P.mc + P.cp + P.pd, _t);
  const a = leg.yaw + P.promo;
  _w.set(leg.sg * Math.cos(a), 0, Math.sin(a));
  return out.copy(leg.coxa).addScaledVector(_w, _t.r).add(_v.set(0, _t.h, 0));
}
