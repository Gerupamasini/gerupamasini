import { Bone, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { ARMS, ARM_BONES, EYE, TENTACLE_BONES } from './anatomy';
import { armBone, tenBone, type RigDef } from './geometry';

/**
 * The skeleton of one ミミイカ and the application of a behaviour pose to it (no rendering: the scene, the viewer
 * and the tests use it alike).
 *   J_root ─ J_head ─ J_eye_L, J_eye_R, J_funnel ─ J_funnelTip, J_arm{I…IV}{L,R}_0…4, J_ten{L,R}_0…5
 *          └ J_fin_L, J_fin_R
 * The mantle's own motion (ventilation, the jet's contraction) and the waves along the fins are made in the vertex
 * shader (materials.ts), so the mantle needs no bones of its own.
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
  /** gaze of each eye (head frame), and how wide the pupils are (0 slit … 1 round) */
  eyes: [Vector3, Vector3];
  pupil: number;
  /** the lids' opening: 0 narrowed (buried) … 1 wide open */
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

export function emptyPose(): Pose {
  return {
    pos: new Vector3(), quat: new Quaternion(), headPitch: 0, headYaw: 0,
    armCurl: new Float32Array(ARMS.length * ARM_BONES), armSwing: new Float32Array(ARMS.length * ARM_BONES),
    ten: [0, 1].map(() => ({ ext: 0, aim: new Vector3(0, 0, 1), aimW: 0, curl: 0 })),
    finFold: [0, 0], finAmp: [0, 0], finPh: [0, 0], finK: 1, mantle: 1, funnelPitch: 0, funnelYaw: 0,
    eyes: [new Vector3(...EYE.gaze).normalize(), new Vector3(-EYE.gaze[0], EYE.gaze[1], EYE.gaze[2]).normalize()], pupil: 0.15, lid: 0.45,
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
 * resting gaze (the iris must fill the lids' opening, which is low), and rolled against the head's tilt so that the slit
 * of the pupil stays level (the statocysts: 19, 20, 32). `up` is the world's up in the head frame.
 */
function aimEye(b: Bone, dir: Vector3, up: Vector3): void {
  const g0 = _g0.set(0, 0, 1).applyQuaternion(restQ(b));
  const gx = _gx.crossVectors(AY, g0).normalize(), gy = _gy.crossVectors(g0, gx);
  const yaw = Math.max(-0.3, Math.min(0.3, Math.atan2(dir.dot(gx), dir.dot(g0))));
  const pitch = Math.max(-0.1, Math.min(0.1, Math.atan2(dir.dot(gy), Math.hypot(dir.dot(gx), dir.dot(g0)))));
  const z = _x.copy(g0).multiplyScalar(Math.cos(pitch) * Math.cos(yaw)).addScaledVector(gx, Math.cos(pitch) * Math.sin(yaw)).addScaledVector(gy, Math.sin(pitch)).normalize();
  const xx = _y.crossVectors(up, z);
  if (xx.lengthSq() < 1e-8) xx.crossVectors(AY, z);
  xx.normalize();
  const yy = _v.crossVectors(z, xx);
  _m.makeBasis(xx, yy, z);
  b.quaternion.setFromRotationMatrix(_m);
}

/** how far the funnel's mouth is opened by the mantle's squeeze */
export const funnelOpening = (mantle: number): number => Math.max(0.88, Math.min(1.3, 1 + 4.5 * (1 - mantle)));
/** the funnel's pitch as posed (negative: down), with the dip that keeps an opened or turned mouth under the head */
export const funnelPitchOf = (P: Pose): number => P.funnelPitch - 0.4 * Math.max(0, funnelOpening(P.mantle) - 1) - 0.35 * Math.abs(P.funnelYaw);

/** Pose → root transform and bone rotations (ends with one world-matrix update of the whole model). */
export function applyPose(root: Object3D, bones: Record<string, Bone>, P: Pose): void {
  root.position.copy(P.pos);
  root.quaternion.copy(P.quat);
  const head = bones.J_head;
  head.quaternion.copy(restQ(head)).multiply(_q.setFromAxisAngle(AX, -P.headPitch)).multiply(_q2.setFromAxisAngle(AY, P.headYaw));
  ARMS.forEach((a, i) => {
    for (let k = 0; k < ARM_BONES; k++) {
      const b = bones[armBone(a, k)];
      const j = i * ARM_BONES + k;
      b.quaternion.copy(restQ(b)).multiply(_q.setFromAxisAngle(AX, P.armCurl[j])).multiply(_q2.setFromAxisAngle(AY, P.armSwing[j]));
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
  // each breath, most in a jet) and draws in as it fills; opened or turned aside, the tube dips a little so that its
  // mouth stays clear of the head's skin
  const sF = funnelOpening(P.mantle);
  const f = bones.J_funnel, ft = bones.J_funnelTip;
  const pitch = funnelPitchOf(P);
  f.quaternion.copy(restQ(f)).multiply(_q.setFromAxisAngle(AX, -pitch)).multiply(_q2.setFromAxisAngle(AY, P.funnelYaw));
  ft.scale.set(sF, 1 + 0.25 * (sF - 1), 1);
  // the world's up in the head's frame (for the eyes' counter-roll)
  bones.J_head.updateWorldMatrix(true, false);
  bones.J_head.matrixWorld.decompose(_hp, _hq, _hs);
  _up.set(0, 1, 0).applyQuaternion(_hq.invert());
  aimEye(bones.J_eye_L, P.eyes[0], _up);
  aimEye(bones.J_eye_R, P.eyes[1], _up);
  root.updateMatrixWorld(true);
}
