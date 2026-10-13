import { Bone, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { ARMS, ARM_BONES, EYE, FUNNEL, TENTACLE_BONES, armBase, toModel } from './anatomy';
import { armBone, armRadius, mimiikaRig, tenBone, type RigDef } from './geometry';

/**
 * The skeleton of one ミミイカ and the application of a behaviour pose to it (no rendering: the scene, the viewer
 * and the tests use it alike).
 *   J_root ─ J_head ─ J_eye_L, J_eye_R, J_funnelSwing ─ J_funnel ─ J_funnelTip, J_arm{I…IV}{L,R}_0…4, J_ten{L,R}_0…5
 *          └ J_fin_L, J_fin_R
 * The mantle's own motion (ventilation, the jet's contraction) and the waves along the fins are made in the vertex
 * shader (materials.ts), so the mantle needs no bones of its own; so is the thinning of a stretched arm (armThin).
 * armJoints / armTip give an arm's joints and tip from a pose alone (the same per-joint rotations as applyPose), for
 * the behaviour's sand at the arm tips and for the tests.
 */

export interface Pose {
  pos: Vector3;
  quat: Quaternion;
  /** head on the neck (rad) */
  headPitch: number;
  headYaw: number;
  /** per arm (ARMS order) and joint: curl towards the oral side (rad) and sideways swing */
  armCurl: Float32Array;
  armSwing: Float32Array;
  /**
   * per arm (ARMS order): its length (1 at rest, ARM_EXT_MIN … ARM_EXT_MAX; stretched it thins), where its first
   * bone points (head frame), the side it bends to and its suckers face (head frame), and how far that aim is taken
   * (0 the rest frame … 1 aimed; the first bone turns at most ARM_AIM_MAX, joints 1 and 2 take the rest)
   */
  armExt: Float32Array;
  armAim: Vector3[];
  armBend: Vector3[];
  armAimW: Float32Array;
  /** the tentacles: extension 0 (in the pockets) … 1 (full length), aim (model frame) and how much it is followed, curl per joint */
  ten: { ext: number; aim: Vector3; aimW: number; curl: number }[];
  /** fins: fold (> 0 raised), wave amplitude (rad-ish), wave phase, waves along the fin */
  finFold: [number, number];
  finAmp: [number, number];
  finPh: [number, number];
  finK: number;
  /** mantle's radial scale (1 at rest; < 1 contracted in a jet) */
  mantle: number;
  funnelPitch: number;
  funnelYaw: number;
  /** the funnel swung far to one side up the flank (−1 right … 1 left), as it rests and ventilates (20, 29) */
  funnelSide: number;
  /** gaze of each eye (head frame), and how wide the pupils are (0 slit … 1 round) */
  eyes: [Vector3, Vector3];
  /** how far the gaze may turn up (rad; buried, the pupils face up: more than the lids' low opening otherwise allows) */
  gazeUp: number;
  pupil: number;
  /** the lids' opening: 0 narrowed … 1 wide open (half open at rest and buried, wide at night and in alarm) */
  lid: number;
  /** burial (0 … 1), sand stuck on the back, sand thrown over the head */
  bury: number;
  sandCoat: number;
  headCover: number;
  /** chromatophores: expansion of the yellow, red and brown sets; mottle, iridophores, the glassy pale of a hunter */
  chroma: { y: number; r: number; b: number; mottle: number; irid: number; pale: number };
  /** height of the belly over the ground (m) */
  lift: number;
}

/** the side an arm bends to at rest: its oral face, towards the crown's axis (head frame) */
function restBend(a: (typeof ARMS)[number]): Vector3 {
  const B = armBase(a), d = new Vector3(...B.dir);
  return new Vector3(...B.out).addScaledVector(d, -d.dot(new Vector3(...B.out))).normalize().negate();
}

export function emptyPose(): Pose {
  return {
    pos: new Vector3(), quat: new Quaternion(), headPitch: 0, headYaw: 0,
    armCurl: new Float32Array(ARMS.length * ARM_BONES), armSwing: new Float32Array(ARMS.length * ARM_BONES),
    armExt: new Float32Array(ARMS.length).fill(1), armAim: ARMS.map((a) => new Vector3(...armBase(a).dir)), armBend: ARMS.map(restBend), armAimW: new Float32Array(ARMS.length),
    ten: [0, 1].map(() => ({ ext: 0, aim: new Vector3(0, 0, 1), aimW: 0, curl: 0 })),
    finFold: [0, 0], finAmp: [0, 0], finPh: [0, 0], finK: 1, mantle: 1, funnelPitch: 0, funnelYaw: 0, funnelSide: 0,
    eyes: [new Vector3(...EYE.gaze).normalize(), new Vector3(-EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize()], gazeUp: 0.1, pupil: 0.15, lid: 0.45,
    bury: 0, sandCoat: 0, headCover: 0, chroma: { y: 0.5, r: 0.5, b: 0.4, mottle: 0.3, irid: 0.6, pale: 0 }, lift: 0,
  };
}

const _m = new Matrix4(), _p = new Matrix4(), _s = new Vector3();
/** Bones of one animal under `parent` (rest pose from the shared rig definition). */
export function createBones(rig: RigDef, parent: Object3D): { bones: Record<string, Bone>; list: Bone[] } {
  const bones: Record<string, Bone> = {}, list: Bone[] = [];
  for (const d of rig.defs) {
    const b = new Bone();
    b.name = d.name;
    const p = d.parent ? rig.defs[rig.byName[d.parent]] : null;
    _m.copy(d.matrix);
    if (p) _m.premultiply(_p.copy(p.inverse));
    _m.decompose(b.position, b.quaternion, _s);
    b.userData.rest = { pos: b.position.clone(), quat: b.quaternion.clone() };
    bones[d.name] = b;
    list.push(b);
  }
  for (const d of rig.defs) (d.parent ? bones[d.parent] : parent).add(bones[d.name]);
  return { bones, list };
}

const _q = new Quaternion(), _q2 = new Quaternion(), _v = new Vector3(), _x = new Vector3(), _y = new Vector3();
const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
const restQ = (b: Bone) => (b.userData.rest as { quat: Quaternion }).quat;
const restP = (b: Bone) => (b.userData.rest as { pos: Vector3 }).pos;

const _g0 = new Vector3(), _gx = new Vector3(), _gy = new Vector3(), _up = new Vector3(), _hq = new Quaternion(), _hp = new Vector3(), _hs = new Vector3();
/**
 * The eye bone's orientation for a gaze `dir` (head frame): within ±0.3 rad sideways and ±0.1 rad up and down of its
 * resting gaze (the iris must fill the lids' opening, which is low; up to `upMax` when it lies buried), and rolled
 * against the head's tilt so that the slit of the pupil stays level (the statocysts: 19, 20, 32). `up` is the world's
 * up in the head frame.
 */
function aimEye(b: Bone, dir: Vector3, up: Vector3, upMax: number): void {
  const g0 = _g0.set(0, 0, 1).applyQuaternion(restQ(b));
  const gx = _gx.crossVectors(AY, g0).normalize(), gy = _gy.crossVectors(g0, gx);
  // (a target behind the eye's own side: back towards the rest gaze, rather than snapping between the limits)
  const k = Math.min(1, Math.max(0, (dir.dot(g0) + 0.2) / 0.4)), w = k * k * (3 - 2 * k);
  dir = _hp.copy(g0).lerp(dir, w).normalize();
  const yaw = Math.max(-0.3, Math.min(0.3, Math.atan2(dir.dot(gx), dir.dot(g0))));
  const pitch = Math.max(-0.1, Math.min(Math.max(0.1, upMax), Math.atan2(dir.dot(gy), Math.hypot(dir.dot(gx), dir.dot(g0)))));
  const z = _x.copy(g0).multiplyScalar(Math.cos(pitch) * Math.cos(yaw)).addScaledVector(gx, Math.cos(pitch) * Math.sin(yaw)).addScaledVector(gy, Math.sin(pitch)).normalize();
  const xx = _y.crossVectors(up, z);
  if (xx.lengthSq() < 1e-8) xx.crossVectors(AY, z);
  xx.normalize();
  const yy = _v.crossVectors(z, xx);
  _m.makeBasis(xx, yy, z);
  b.quaternion.setFromRotationMatrix(_m);
}

/** how far the funnel's mouth is opened by the mantle's squeeze (±10 % with each breath, 1.25 in a jet) */
export const funnelOpening = (mantle: number): number => Math.max(0.9, Math.min(1.25, 1 + 4.5 * (1 - mantle)));
/** the funnel's pitch as posed (negative: down): turned aside it dips a little so its mouth stays under the head */
export const funnelPitchOf = (P: Pose): number => Math.max(-0.6, P.funnelPitch - 0.35 * Math.abs(P.funnelYaw) * (1 - Math.abs(P.funnelSide)));
/** the swing to one side: about the head's vertical, tilted towards that side (the tube rises up the flank) */
export function funnelSwingQ(side: number, out: Quaternion): Quaternion {
  const sg = side >= 0 ? 1 : -1, b = FUNNEL.swingTilt;
  return out.setFromAxisAngle(_sw.set(-Math.sin(b) * sg, Math.cos(b), 0), FUNNEL.swing * side);
}
const _sw = new Vector3();

// ------------------------------------------------------------------ the arms

/** an arm's length range (× rest): stretched to about twice its length when it reaches out over the sand to bury */
export const ARM_EXT_MIN = 0.6;
export const ARM_EXT_MAX = 2.2;
/**
 * how far an arm's first bone may turn from its rest direction (rad, ≈ 50°): the arm's thick base is rigid on that
 * bone (to 10 % of its length), and turned further it cuts into the eye's dome and the head; joints 1 and 2 take the
 * rest of the turn, half each
 */
export const ARM_AIM_MAX = 0.87;
/** the arm's radius as it is stretched: × 1 / √ext (its volume kept), never thicker than at rest */
export const armThin = (ext: number): number => 1 / Math.sqrt(Math.min(ARM_EXT_MAX, Math.max(1, ext)));
/**
 * where along the arm (t, 0 crown … 1 tip) the thinning sets in: the base on the crown (rigid on bone 0, not
 * stretched) keeps its girth where it meets the head; the vertex shader uses the same ramp (materials.ts)
 */
export const ARM_THIN_T: readonly [number, number] = [0.05, 0.2];
/** the radius factor at t along a stretched arm */
export function armThinAt(ext: number, t: number): number {
  const x = Math.min(1, Math.max(0, (t - ARM_THIN_T[0]) / (ARM_THIN_T[1] - ARM_THIN_T[0])));
  return 1 + (armThin(ext) - 1) * x * x * (3 - 2 * x);
}
export const armExtOf = (P: Pose, i: number): number => Math.min(ARM_EXT_MAX, Math.max(ARM_EXT_MIN, P.armExt[i]));

/** the head on the neck: its rest rotation, pitched and turned */
function headQ(P: Pose, rest: Quaternion, out: Quaternion): Quaternion {
  return out.copy(rest).multiply(_q.setFromAxisAngle(AX, -P.headPitch)).multiply(_q2.setFromAxisAngle(AY, P.headYaw));
}

const _rq: Quaternion[] = [], _chain = Array.from({ length: ARM_BONES }, () => new Quaternion());
const _az = new Vector3(), _ab = new Vector3(), _ax = new Vector3(), _zt = new Vector3(), _ma = new Matrix4();
const _D = new Quaternion(), _S = new Quaternion(), _T = new Quaternion(), _E = new Quaternion(), _qi = new Quaternion();
const ZL = new Vector3(0, 0, 1);
/**
 * The local rotations of arm i's five bones (rest: their rest rotations on their parents), shared by applyPose and the
 * FK. Bone 0 turns from rest towards the frame of P.armAim (z) and P.armBend (the oral −y side faces it), by
 * P.armAimW, but its direction by at most ARM_AIM_MAX (its twist about its own axis is free); what is left of the turn
 * goes to joints 1 and 2, half each, so that from joint 2 on the arm points along the aim. Then each joint's curl
 * (about x, towards the oral side) and swing (about y), as before: with aimW 0 the result is today's rest × curl × swing.
 */
function armChain(P: Pose, i: number, rest: readonly Quaternion[], out: Quaternion[]): void {
  const w = Math.min(1, Math.max(0, P.armAimW[i]));
  let split = false;
  out[0].copy(rest[0]);
  if (w > 0) {
    const z = _az.copy(P.armAim[i]).normalize();
    const y = _ab.copy(P.armBend[i]).addScaledVector(z, -P.armBend[i].dot(z));
    // (a bend along the aim says nothing of the side: the rest frame's oral side, −y)
    if (y.lengthSq() < 1e-8) { y.set(0, -1, 0).applyQuaternion(rest[0]); y.addScaledVector(z, -y.dot(z)); }
    y.normalize().negate();
    _ax.crossVectors(y, z);
    _ma.makeBasis(_ax, y, z);
    // the turn from rest in the bone's rest frame, taken by w
    _D.copy(rest[0]).invert().multiply(_qi.setFromRotationMatrix(_ma));
    _D.copy(_qi.identity().slerp(_D, w));
    // direction (swing S) and twist (T) about the bone's own axis; the swing past the limit is handed on
    _zt.copy(ZL).applyQuaternion(_D);
    const th = Math.acos(Math.min(1, Math.max(-1, _zt.z)));
    if (th > ARM_AIM_MAX) {
      _S.setFromUnitVectors(ZL, _zt);
      _T.copy(_S).invert().multiply(_D);
      // what joints 1 and 2 must add: the swing left over, seen from the limited frame (S0·T)
      const s0 = _qi.identity().slerp(_S, ARM_AIM_MAX / th);
      _D.copy(s0).multiply(_T);
      _E.copy(_D).invert().multiply(_S).multiply(_T);
      _E.copy(_qi.identity().slerp(_E, 0.5));
      split = true;
    }
    out[0].multiply(_D);
  }
  for (let k = 0; k < ARM_BONES; k++) {
    const j = i * ARM_BONES + k;
    if (k > 0) out[k].copy(rest[k]);
    if (split && (k === 1 || k === 2)) out[k].multiply(_E);
    out[k].multiply(_q.setFromAxisAngle(AX, P.armCurl[j])).multiply(_q2.setFromAxisAngle(AY, P.armSwing[j]));
  }
}

/** the rest data of the arms' chains from the rig definition (local to the parent, as createBones makes them) */
interface ArmRest { pos: Vector3[]; quat: Quaternion[]; tip: number }
let ARM_REST: { head: { pos: Vector3; quat: Quaternion }; arms: ArmRest[] } | null = null;
function armRest(): NonNullable<typeof ARM_REST> {
  if (ARM_REST) return ARM_REST;
  const rig = mimiikaRig();
  const local = (name: string) => {
    const d = rig.defs[rig.byName[name]], p = d.parent ? rig.defs[rig.byName[d.parent]] : null;
    const m = new Matrix4().copy(d.matrix);
    if (p) m.premultiply(p.inverse);
    const pos = new Vector3(), quat = new Quaternion();
    m.decompose(pos, quat, new Vector3());
    return { pos, quat };
  };
  const arms = ARMS.map((a) => {
    const ls = Array.from({ length: ARM_BONES }, (_, k) => local(armBone(a, k)));
    return { pos: ls.map((l) => l.pos), quat: ls.map((l) => l.quat), tip: a.length / ARM_BONES / 1000 };
  });
  return (ARM_REST = { head: local('J_head'), arms });
}

const _fq = new Quaternion(), _fp = new Vector3(), _fv = new Vector3(), _fk = Array.from({ length: ARM_BONES }, () => new Quaternion());
const _joints = Array.from({ length: ARM_BONES + 1 }, () => new Vector3());
/**
 * Arm i's five joints and its tip for pose P (out[0 … 5]), in the root's frame in model millimetres (behaviour's
 * toWorld takes them as they are). The same rotations, stretch and last-bone scale as applyPose: the tip is the mesh's.
 */
export function armJoints(P: Pose, i: number, out: Vector3[]): Vector3[] {
  const R = armRest(), A = R.arms[i];
  armChain(P, i, A.quat, _fk);
  const ext = armExtOf(P, i);
  headQ(P, R.head.quat, _fq);
  _fp.copy(R.head.pos);
  for (let k = 0; k < ARM_BONES; k++) {
    _fp.add(_fv.copy(A.pos[k]).multiplyScalar(k > 0 ? ext : 1).applyQuaternion(_fq));
    _fq.multiply(_fk[k]);
    (out[k] ??= new Vector3()).copy(_fp).multiplyScalar(1000);
  }
  _fp.add(_fv.set(0, 0, A.tip * ext).applyQuaternion(_fq));
  (out[ARM_BONES] ??= new Vector3()).copy(_fp).multiplyScalar(1000);
  return out;
}

/** arm i's tip (root frame, model mm) */
export function armTip(P: Pose, i: number, out: Vector3): Vector3 {
  return out.copy(armJoints(P, i, _joints)[ARM_BONES]);
}

const _eyeC = new Vector3(), _sa = new Vector3(), _su = new Vector3();
/**
 * How far arm i's skin stays outside the eyes' domes (EYE.r + EYE.skin; model mm, negative inside), from the FK
 * centre line and the arm's radius (thinned as it is stretched), from the crown (the base a disc on it, not a ball:
 * the tube runs on into the head) to the tip. Within a few tenths of a mm of the skinned mesh's own surface, whose
 * bends are a blend of the bones (the tests compare them).
 */
export function armEyeGap(P: Pose, i: number): number {
  const a = ARMS[i], R = armRest(), J = armJoints(P, i, _joints);
  const ext = armExtOf(P, i), Rd = EYE.r + EYE.skin;
  // the eyes' centres turn with the head about the head's joint
  headQ(P, R.head.quat, _fq).multiply(_qi.copy(R.head.quat).invert());
  let best = Infinity;
  for (const side of [1, -1]) {
    _eyeC.set(...toModel([EYE.x * side, EYE.y, EYE.z])).sub(R.head.pos).applyQuaternion(_fq).add(R.head.pos).multiplyScalar(1000);
    for (let k = 0; k < ARM_BONES; k++) {
      const len = _su.subVectors(J[k + 1], J[k]).length();
      _su.divideScalar(len || 1);
      const s = _sa.subVectors(_eyeC, J[k]).dot(_su), rho = _sa.addScaledVector(_su, -s).length();
      const t0 = k / ARM_BONES, t1 = (k + 1) / ARM_BONES;
      const r = (t: number) => armRadius(a, t) * armThinAt(ext, t);
      let d: number;
      if (s >= 0 && s <= len) d = rho - r(t0 + (t1 - t0) * (s / len));
      else if (s < 0) d = k === 0 ? Math.hypot(s, Math.max(0, rho - r(0))) : Math.hypot(s, rho) - r(t0);
      else d = _eyeC.distanceTo(J[k + 1]) - r(t1);
      best = Math.min(best, d - Rd);
    }
  }
  return best;
}

/** Pose → root transform and bone rotations (ends with one world-matrix update of the whole model). */
export function applyPose(root: Object3D, bones: Record<string, Bone>, P: Pose): void {
  root.position.copy(P.pos);
  root.quaternion.copy(P.quat);
  const head = bones.J_head;
  headQ(P, restQ(head), head.quaternion);
  ARMS.forEach((a, i) => {
    for (let k = 0; k < ARM_BONES; k++) _rq[k] = restQ(bones[armBone(a, k)]);
    armChain(P, i, _rq, _chain);
    const ext = armExtOf(P, i);
    for (let k = 0; k < ARM_BONES; k++) {
      const b = bones[armBone(a, k)];
      b.quaternion.copy(_chain[k]);
      // stretched: the joints spread apart, and the last bone (no children: no shear) scales along the arm, so that
      // the mesh's tip is the FK's
      if (k > 0) b.position.copy(restP(b)).multiplyScalar(ext);
      if (k === ARM_BONES - 1) b.scale.set(1, 1, ext);
    }
  });
  ([1, -1] as const).forEach((side, i) => {
    const T = P.ten[i];
    const ext = Math.max(0.06, Math.min(1, T.ext));
    for (let k = 0; k < TENTACLE_BONES; k++) {
      const b = bones[tenBone(side, k)];
      if (k === 0) {
        // aimed at the prey (head frame), out of its resting direction
        const z = _v.copy(T.aim).normalize();
        const xx = _x.crossVectors(AY, z).normalize();
        _y.crossVectors(z, xx);
        _m.makeBasis(xx, _y, z);
        _q.setFromRotationMatrix(_m);
        b.quaternion.copy(restQ(b)).slerp(_q, Math.max(0, Math.min(1, T.aimW)));
        // drawn into its pocket: the whole tentacle a little smaller as well as shorter
        b.scale.setScalar(0.55 + 0.45 * Math.min(1, ext * 2.5));
      } else {
        // the stalk telescopes: each joint closer to the last (the club keeps its size)
        b.position.copy(restP(b)).multiplyScalar(ext);
        b.quaternion.copy(restQ(b)).multiply(_q.setFromAxisAngle(AX, T.curl));
      }
    }
  });
  for (const [i, name] of (['J_fin_L', 'J_fin_R'] as const).entries()) {
    const b = bones[name];
    const side = i === 0 ? 1 : -1;
    b.quaternion.copy(restQ(b)).multiply(_q.setFromAxisAngle(AZ, P.finFold[i] * side));
  }
  // the water breathed in round the neck leaves through the funnel: its mouth opens as the mantle squeezes (±10 % with
  // each breath, most in a jet) and draws in as it fills; turned aside under the head, the tube dips a little so that its
  // mouth stays clear of the head's skin
  // swung aside (20, 29) the whole free funnel turns up the flank, a little narrower across (its broad base does not
  // turn into depth that would cut the mantle's lip), its mouth tipped to face out and down along the flank
  const sF = funnelOpening(P.mantle), side = Math.max(-1, Math.min(1, P.funnelSide));
  const fs = bones.J_funnelSwing, f = bones.J_funnel, ft = bones.J_funnelTip;
  fs.quaternion.copy(restQ(fs)).multiply(funnelSwingQ(side, _q));
  f.quaternion.copy(restQ(f)).multiply(_q.setFromAxisAngle(AX, -funnelPitchOf(P))).multiply(_q2.setFromAxisAngle(AY, P.funnelYaw));
  f.scale.set(1 - 0.28 * Math.abs(side), 1, 1);
  ft.quaternion.copy(restQ(ft)).multiply(_q.setFromAxisAngle(AX, 0.5 * Math.abs(side)));
  ft.scale.set(sF, sF, 1);
  // the world's up in the head's frame (for the eyes' counter-roll)
  bones.J_head.updateWorldMatrix(true, false);
  bones.J_head.matrixWorld.decompose(_hp, _hq, _hs);
  _up.set(0, 1, 0).applyQuaternion(_hq.invert());
  aimEye(bones.J_eye_L, P.eyes[0], _up, P.gazeUp);
  aimEye(bones.J_eye_R, P.eyes[1], _up, P.gazeUp);
  root.updateMatrixWorld(true);
}
