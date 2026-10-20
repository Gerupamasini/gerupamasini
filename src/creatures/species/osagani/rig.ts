import { Bone, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { BIND, CHELA_FEMALE, CHELA_MALE, EYE, type LegId } from './anatomy';
import { SIDES, coxaFrame, legBone, type LegRig, type RigDef, type Side } from './geometry';

/**
 * The skeleton of one ヤマトオサガニ, the pose a behaviour writes and its application to the bones, and the legs'
 * kinematics (no rendering: the scene, the viewer and the tests use it alike).
 *   J_root (on the ground under the body, the heading) ─ J_body (the carapace and the body: height, pitch, roll)
 *     ├ J_{P1…P5}{L,R}_cx ─ _bi ─ _me ─ _ca ─ _pr ─ _da   (5 legs a side × 6 articles; the cheliped's propodus also
 *     │                                                     carries _daF, the female chela's dactylus)
 *     ├ J_eye_{L,R} (the eyestalks, raised in the bind pose), J_mxp_{L,R} (third maxillipeds)
 * Joint angles are anatomical and mean the same on both sides: `promo` swings the leg forward at the coxa, `lev` raises
 * it at the basis, `mc`, `cp`, `pd` lift the carpus, propodus and dactylus (negative: flexed down), `roll` and `cpRoll`
 * turn the merus and the propodus about their axes, `meYaw` swings the cheliped's merus out, `mcYaw` its carpus in
 * towards the midline (negative), and `pd` of a cheliped is its gape.
 */

export interface LegPose {
  promo: number;
  pitch: number;
  lev: number;
  roll: number;
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
  /** the body over the root: height of the sternum over the ground (mm at CW 35), pitch (+ nose up), roll (+ left up) */
  lift: number;
  pitch: number;
  roll: number;
  legs: Record<string, LegPose>;
  /** the eyestalks: raised (1 upright … 0 folded into the orbit's trench) and a sideways lean (rad) */
  eyeRaise: [number, number];
  eyeLean: [number, number];
  /** the third maxillipeds parted (0 … 1) */
  mxp: number;
  /** how far down its burrow (0 out … 1 gone), mud clinging to the shell (0 … 1) */
  burrow: number;
  mudCoat: number;
}

export const legKey = (id: LegId, side: Side) => `${id}${side}`;

export function bindLeg(id: LegId): LegPose {
  const b = BIND[id];
  return { promo: 0, pitch: b.pitch, lev: b.lev, roll: b.roll, meYaw: b.meYaw ?? 0, mcYaw: b.mcYaw ?? 0, mc: b.mc, cp: b.cp, cpRoll: 0, cpYaw: 0, pd: b.pd };
}

export function emptyPose(): Pose {
  const legs: Record<string, LegPose> = {};
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5'] as LegId[]) for (const s of SIDES) legs[legKey(id, s)] = bindLeg(id);
  return { pos: new Vector3(), heading: 0, lift: 8, pitch: 0, roll: 0, legs, eyeRaise: [1, 1], eyeLean: [0, 0], mxp: 0, burrow: 0, mudCoat: 0 };
}

export function copyLeg(a: LegPose, out: LegPose): LegPose {
  out.promo = a.promo; out.pitch = a.pitch; out.lev = a.lev; out.roll = a.roll; out.meYaw = a.meYaw; out.mcYaw = a.mcYaw; out.mc = a.mc; out.cp = a.cp; out.cpRoll = a.cpRoll; out.cpYaw = a.cpYaw; out.pd = a.pd;
  return out;
}

const _m = new Matrix4(), _s = new Vector3();
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
  return { bones, list };
}

const _q = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion();
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
const restQ = (b: Bone) => (b.userData.rest as { quat: Quaternion }).quat;

/** per leg: its coxa's fixed frame (rest yaw, no pitch), cached by bone */
const COXA_BASE = new WeakMap<Bone, Quaternion>();
/** per side: the turn that folds a raised eyestalk into its orbit (in the body's frame) */
const EYE_FOLD: Record<Side, Quaternion> = {
  L: new Quaternion().setFromUnitVectors(new Vector3(EYE.up[0], EYE.up[1], EYE.up[2]).normalize(), new Vector3(EYE.folded[0], EYE.folded[1], EYE.folded[2]).normalize()),
  R: new Quaternion().setFromUnitVectors(new Vector3(-EYE.up[0], EYE.up[1], EYE.up[2]).normalize(), new Vector3(-EYE.folded[0], EYE.folded[1], EYE.folded[2]).normalize()),
};
const IDQ = new Quaternion();

/** a leg's pose onto its bones; `arm` scales a cheliped from its merus on (the sexes, the male's growth) */
export function applyLeg(bones: Record<string, Bone>, leg: LegRig, P: LegPose, arm = 1): void {
  const sg = leg.sg;
  const n = (a: 'cx' | 'bi' | 'me' | 'ca' | 'pr' | 'da' | 'daF') => bones[legBone(leg.id, leg.side, a)];
  const cx = n('cx');
  let base = COXA_BASE.get(cx);
  if (!base) { base = coxaFrame(leg.yaw, sg, new Quaternion()); COXA_BASE.set(cx, base); }
  cx.quaternion.copy(base).multiply(_q.setFromAxisAngle(AY, -sg * P.promo)).multiply(_q2.setFromAxisAngle(AZ, P.pitch));
  n('bi').quaternion.setFromAxisAngle(AZ, P.lev);
  const me = n('me');
  me.quaternion.setFromAxisAngle(AY, sg * P.meYaw).multiply(_q.setFromAxisAngle(AX, sg * P.roll));
  n('ca').quaternion.setFromAxisAngle(AY, sg * P.mcYaw).multiply(_q.setFromAxisAngle(AZ, P.mc));
  n('pr').quaternion.setFromAxisAngle(AY, sg * P.cpYaw).multiply(_q.setFromAxisAngle(AZ, P.cp)).multiply(_q3.setFromAxisAngle(AX, sg * P.cpRoll));
  // (a cheliped's `pd` is its gape: each chela's dactylus closes onto its own fixed finger at 0)
  if (leg.id === 'P1') {
    n('da').quaternion.setFromAxisAngle(AZ, CHELA_MALE.daAngle + P.pd);
    n('daF').quaternion.setFromAxisAngle(AZ, CHELA_FEMALE.daAngle + P.pd);
    me.scale.setScalar(arm);
  } else n('da').quaternion.setFromAxisAngle(AZ, P.pd);
}

/** Pose → root transform and bone rotations (ends with one world-matrix update of the whole model). */
export function applyPose(root: Object3D, bones: Record<string, Bone>, rig: RigDef, P: Pose, arm = 1): void {
  root.position.copy(P.pos);
  root.quaternion.setFromAxisAngle(AY, P.heading);
  const body = bones.J_body;
  body.position.set(0, P.lift * 0.001, 0);
  body.quaternion.setFromAxisAngle(AX, -P.pitch).premultiply(_q.setFromAxisAngle(AZ, P.roll));
  for (const leg of rig.legs) applyLeg(bones, leg, P.legs[legKey(leg.id, leg.side)], arm);
  SIDES.forEach((side, i) => {
    const sg = side === 'L' ? 1 : -1;
    // the eyestalk swings down and out into its orbit about its joint, and leans a little to the side
    const e = bones[`J_eye_${side}`];
    const fold = Math.min(1, Math.max(0, 1 - P.eyeRaise[i]));
    _q.slerpQuaternions(IDQ, EYE_FOLD[side], fold);
    _q2.setFromAxisAngle(AZ, -sg * P.eyeLean[i] * (1 - fold));
    e.quaternion.copy(restQ(e)).premultiply(_q).premultiply(_q2);
    const mx = bones[`J_mxp_${side}`];
    mx.quaternion.copy(restQ(mx)).multiply(_q3.setFromAxisAngle(AZ, sg * 0.35 * P.mxp));
  });
  root.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ the legs' kinematics

/** a walking leg's chain in its own vertical plane: the distal joints follow the knee (cp) and keep the dactylus at an angle */
export interface PlanarLeg {
  /** lengths: coxa, basis-ischium + merus (fused), carpus, propodus, dactylus (mm) */
  l: [number, number, number, number, number];
  pitch: number;
  /** the rest angles of the propodus and the dactylus (for the tiers that fold them: lod1) */
  cpBind: number;
  pdBind: number;
}

export function planarOf(leg: LegRig): PlanarLeg {
  const L = leg.lengths;
  const b = BIND[leg.id];
  return { l: [L[0], L[1] + L[2], L[3], L[4], L[5]], pitch: b.pitch, cpBind: b.cp, pdBind: b.pd };
}

/** where the dactylus's tip is in the leg's plane (r out from the coxa's joint, h up) */
export function planarTip(L: PlanarLeg, lev: number, mc: number, cp: number, th: number, out: { r: number; h: number; jr: number; jh: number }) {
  let a = L.pitch, r = L.l[0] * Math.cos(a), h = L.l[0] * Math.sin(a);
  a += lev; r += L.l[1] * Math.cos(a); h += L.l[1] * Math.sin(a);
  a += mc; r += L.l[2] * Math.cos(a); h += L.l[2] * Math.sin(a);
  a += cp; r += L.l[3] * Math.cos(a); h += L.l[3] * Math.sin(a);
  out.jr = r; out.jh = h;
  out.r = r + L.l[4] * Math.cos(th); out.h = h + L.l[4] * Math.sin(th);
  return out;
}

/**
 * How the IK treats the distal joints: 'full' — the propodus follows the knee and the dactylus is held at the angle
 * asked for; 'lod1' — the propodus stays at its rest angle (lod1 folds it into the carpus); 'stiff' — the propodus and
 * the dactylus both stay at rest (P5 on lod1: the whole distal leg rides on the carpus).
 */
export type DistalMode = 'full' | 'lod1' | 'stiff';

const _t = { r: 0, h: 0, jr: 0, jh: 0 }, _t2 = { r: 0, h: 0, jr: 0, jh: 0 };
/**
 * IK of a walking leg for a foot target (r, h) in its plane: levation and knee by Newton steps from the leg's last
 * pose (warm start); the propodus following the knee (`cpK`) and the dactylus held at `th` (or both at rest, by the
 * tier). Out of reach the leg stretches towards the target as far as its joints allow. Writes lev, mc, cp, pd; returns
 * the miss (mm).
 */
export function solvePlanar(L: PlanarLeg, r: number, h: number, th: number, P: LegPose, mode: DistalMode = 'full', cpK = 0.28, cp0 = -0.08): number {
  // (the knee never quite straightens: a crab's walking leg keeps its bend, and the straight leg is the IK's trap)
  const clampL = (v: number) => Math.max(-0.7, Math.min(1.35, v));
  const clampK = (v: number) => Math.max(-2.3, Math.min(-0.15, v));
  const cpOf = (mc: number) => (mode === 'full' ? cpK * mc + cp0 : L.cpBind);
  const thOf = (lev: number, mc: number) => (mode === 'stiff' ? L.pitch + lev + mc + L.cpBind + L.pdBind : th);
  const run = (lev: number, mc: number): [number, number, number] => {
    for (let it = 0; it < 10; it++) {
      planarTip(L, lev, mc, cpOf(mc), thOf(lev, mc), _t);
      const er = r - _t.r, eh = h - _t.h;
      if (er * er + eh * eh < 1e-4) break;
      const e = 1e-3;
      planarTip(L, lev + e, mc, cpOf(mc), thOf(lev + e, mc), _t2);
      const a11 = (_t2.r - _t.r) / e, a21 = (_t2.h - _t.h) / e;
      planarTip(L, lev, mc + e, cpOf(mc + e), thOf(lev, mc + e), _t2);
      const a12 = (_t2.r - _t.r) / e, a22 = (_t2.h - _t.h) / e;
      const det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-6) { mc = clampK(mc - 0.1); continue; }
      let dl = (a22 * er - a12 * eh) / det, dk = (-a21 * er + a11 * eh) / det;
      const mag = Math.hypot(dl, dk);
      if (mag > 0.35) { dl *= 0.35 / mag; dk *= 0.35 / mag; }
      lev = clampL(lev + dl); mc = clampK(mc + dk);
    }
    planarTip(L, lev, mc, cpOf(mc), thOf(lev, mc), _t);
    return [lev, mc, Math.hypot(r - _t.r, h - _t.h)];
  };
  let best = run(P.lev, Math.min(P.mc, -0.15));
  if (best[2] > 0.3) { const b = run(0.7, -1.1); if (b[2] < best[2]) best = b; }
  const [lev, mc, miss] = best;
  const cp = cpOf(mc);
  P.lev = lev; P.mc = mc; P.cp = cp;
  P.pd = mode === 'stiff' ? L.pdBind : th - (L.pitch + lev + mc + cp);
  return miss;
}

const _v = new Vector3(), _w = new Vector3();
const _k = { r: 0, h: 0, z: 0 };
/**
 * Where the foot is in the leg's own frame (r out, h up, z forward) for a pose whose knee swings the distal leg out of
 * the merus's vertical plane: by `kneeYaw` (a turn about the merus's own y axis: positive swings it back) and by the
 * merus's `roll` (a turn of the knee's plane about the merus's axis: positive turns its dorsal edge forward, so that
 * the distal leg hanging under it swings back).
 */
function swungTip(L: PlanarLeg, P: LegPose, kneeYaw: number, roll: number, out: { r: number; h: number; z: number }) {
  planarTip(L, P.lev, P.mc, P.cp, L.pitch + P.lev + P.mc + P.cp + P.pd, _t);
  // the knee (end of the fused basis-merus) and the merus's axis in the plane
  const a1 = L.pitch + P.lev;
  const r1 = L.l[0] * Math.cos(L.pitch) + L.l[1] * Math.cos(a1), h1 = L.l[0] * Math.sin(L.pitch) + L.l[1] * Math.sin(a1);
  const Dr = _t.r - r1, Dh = _t.h - h1;
  const dx = Dr * Math.cos(a1) + Dh * Math.sin(a1), dy = -Dr * Math.sin(a1) + Dh * Math.cos(a1);
  const c = Math.cos(kneeYaw), s = Math.sin(kneeYaw), cr = Math.cos(roll), sr = Math.sin(roll);
  // (in the merus's frame: the knee's swing, then the roll about the merus's axis)
  const X = dx * c, Y = dy * cr + dx * s * sr, Z = dy * sr - dx * s * cr;
  out.r = r1 + X * Math.cos(a1) - Y * Math.sin(a1);
  out.h = h1 + X * Math.sin(a1) + Y * Math.cos(a1);
  out.z = Z;
  return out;
}

/**
 * IK of a walking leg for a foot target in the body's frame (mm): the coxa swings the leg to the target (promo), the
 * planar chain reaches it, and the knee's own swing and the merus's roll (the leg's rest values) are allowed for by
 * corrections of the reach and the swing. Returns the miss (mm).
 */
export function solveLeg(leg: LegRig, PL: PlanarLeg, target: Vector3, th: number, P: LegPose, mode: DistalMode = 'full'): number {
  const sg = leg.sg;
  _v.copy(target).sub(leg.coxa);
  const ang = Math.atan2(_v.z, sg * _v.x);
  let Rt = Math.hypot(_v.x, _v.z);
  const Ht = _v.y;
  const ky = BIND[leg.id].mcYaw ?? 0, kr = BIND[leg.id].roll;
  const bent = ky !== 0 || kr !== 0;
  P.pitch = PL.pitch;
  P.mcYaw = ky;
  P.roll = kr;
  let off = 0, miss = 0;
  // (a foot out of reach is drawn in towards the coxa at the same height, not left to swing below the ground: the
  // gait then steps it)
  for (let attempt = 0; attempt < 3; attempt++) {
    let r = Rt, h = Ht;
    for (let it = 0; it < (bent ? 8 : 1); it++) {
      miss = solvePlanar(PL, r, h, th, P, mode);
      if (!bent) break;
      swungTip(PL, P, ky, kr, _k);
      off = Math.atan2(_k.z, _k.r);
      const er = Rt - Math.hypot(_k.r, _k.z), eh = Ht - _k.h;
      if (er * er + eh * eh < 1e-4) break;
      // (the roll shortens the distal leg's drop by its cosine: the height's correction scaled up to match)
      r += er; h += eh / Math.max(0.45, Math.cos(kr));
    }
    if (bent) { swungTip(PL, P, ky, kr, _k); miss = Math.hypot(Math.hypot(_k.r, _k.z) - Rt, _k.h - Ht); }
    if (miss < 0.25 || Rt < 4) break;
    Rt -= miss + 0.3;
  }
  P.promo = Math.max(-1.1, Math.min(1.1, ang - leg.yaw - off));
  return miss + Math.hypot(_v.x, _v.z) - Rt;
}

/** forward kinematics of a walking leg's tip in the body's frame (mm) from a pose */
export function legTip(leg: LegRig, PL: PlanarLeg, P: LegPose, out = new Vector3()): Vector3 {
  swungTip(PL, P, P.mcYaw, P.roll, _k);
  const a = leg.yaw + P.promo + Math.atan2(_k.z, _k.r);
  _w.set(leg.sg * Math.cos(a), 0, Math.sin(a));
  return out.copy(leg.coxa).addScaledVector(_w, Math.hypot(_k.r, _k.z)).add(_v.set(0, _k.h, 0));
}
