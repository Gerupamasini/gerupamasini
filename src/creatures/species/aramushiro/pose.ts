import { Matrix4, Quaternion, Vector3, Vector4 } from 'three';
import { FOOT, MODEL_SH } from './anatomy';
import { PART, REST } from './body';
import { LANDMARKS, lowestY } from './shell';
import type { SoftPose } from './materials';

/**
 * One frame of the アラムシロ's body, as the behaviour leaves it (behavior.ts) and the GPU takes it (body.ts): the
 * shell on the foot (or fallen onto the bed), the foot's rhythm, the head, the tentacles, the siphon, the proboscis,
 * the withdrawal. Lengths in metres at the model size, angles in radians.
 */
export interface AmPose {
  /** the shell on the foot: lifted, surged forward, swayed about the aperture; 0 carried … 1 fallen on its side */
  shellLift: number; shellSurge: number; shellYaw: number; shellRoll: number; shellPitch: number; shellFall: number;
  /** the foot: ripple phase (cycles), reach and haul (0..1), crawling (0..1), turn (1/m), dig (0..1), front lift (m), width (×) */
  ripple: number; reach: number; haul: number; crawl: number; turn: number; dig: number; lift: number; width: number;
  /** the head: forward (m), turned, raised or lowered */
  headExt: number; headYaw: number; headPitch: number;
  /** per tentacle (left, right): length share, direction, bend, bend plane, wobble */
  tentExt: [number, number]; tentYaw: [number, number]; tentPitch: [number, number]; tentBend: [number, number]; tentPlane: [number, number]; tentWob: [number, number];
  siphonExt: number; siphonYaw: number; siphonPitch: number; siphonBend: number; siphonPlane: number; siphonWob: number;
  /** the proboscis: everted share, direction, bend */
  probExt: number; probYaw: number; probPitch: number; probBend: number; probPlane: number;
  /** withdrawal: tentacles and siphon, head, foot (0 out … 1 in); the operculum shut */
  retractTubes: number; retractHead: number; retractFoot: number; shut: number;
  /** the side the shell falls to when the foot lets go (+1 its right, −1 its left) */
  fallSide: number;
}

export function restPose(): AmPose {
  return {
    shellLift: 0, shellSurge: 0, shellYaw: 0, shellRoll: 0, shellPitch: 0, shellFall: 0,
    ripple: 0, reach: 0, haul: 0, crawl: 0, turn: 0, dig: 0, lift: 0.04 * MODEL_SH, width: 1,
    headExt: 0, headYaw: 0, headPitch: 0,
    tentExt: [1, 1], tentYaw: [REST.tentacle[0].yaw, REST.tentacle[1].yaw], tentPitch: [REST.tentacle[0].pitch, REST.tentacle[1].pitch],
    tentBend: [0.35, 0.35], tentPlane: [0, Math.PI], tentWob: [0.15, 0.15],
    siphonExt: 1, siphonYaw: REST.siphonYaw, siphonPitch: REST.siphonPitch, siphonBend: 0.35, siphonPlane: Math.PI / 2, siphonWob: 0.12,
    probExt: 0, probYaw: 0, probPitch: -0.3, probBend: 0, probPlane: 0,
    retractTubes: 0, retractHead: 0, retractFoot: 0, shut: 0,
    fallSide: 1,
  };
}

/** the uniforms that carry a pose to the GPU (shared by the soft material and the shell material's far foot) */
export function poseUniforms(): SoftPose {
  return {
    uPartM: { value: Array.from({ length: 7 }, () => new Matrix4()) },
    uPartP: { value: Array.from({ length: 7 }, () => new Vector4(1, 0, 0, 0)) },
    uFoot: { value: new Vector4(0, 0, 0, 0) },
    uFoot2: { value: new Vector4(0, 0, 0, 1) },
    uRetract: { value: new Vector4() },
    uAperture: { value: new Vector3() },
    uShellM: { value: new Matrix4() },
    uTime: { value: 0 },
  };
}

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion();
const va = new Vector3(), vb = new Vector3(), vc = new Vector3();
const ma = new Matrix4(), mb = new Matrix4();
const REST_INV = REST.shellM.clone().invert();
const PIVOT = REST.aperture.clone();

/** rotation that turns +z to the direction (yaw about up, then pitch up) */
function aim(yaw: number, pitch: number, out: Quaternion): Quaternion {
  qa.setFromAxisAngle(Y, yaw);
  qb.setFromAxisAngle(X, -pitch);
  return out.copy(qa).multiply(qb);
}

/** the shell's matrix (shell frame → animal frame) for a pose */
export function shellMatrix(p: AmPose, out = new Matrix4()): Matrix4 {
  // carried: swayed and lifted about the aperture (where the columellar muscle holds it)
  qa.setFromAxisAngle(Y, p.shellYaw);
  qb.setFromAxisAngle(Z, p.shellRoll);
  qc.setFromAxisAngle(X, -p.shellPitch);
  qa.multiply(qb).multiply(qc);
  ma.makeRotationFromQuaternion(qa);
  out.makeTranslation(-PIVOT.x, -PIVOT.y, -PIVOT.z).premultiply(ma);
  out.premultiply(mb.makeTranslation(PIVOT.x, PIVOT.y + p.shellLift, PIVOT.z + p.shellSurge));
  out.multiply(REST.shellM);
  if (p.shellFall <= 0) return out;
  // fallen: rolled onto its side and lowered to rest on the bed
  qa.setFromAxisAngle(Z, 0.85 * p.fallSide);
  qb.setFromAxisAngle(X, 0.18);
  qa.multiply(qb);
  fallen.makeRotationFromQuaternion(qa).multiply(REST.shellM);
  fallen.premultiply(ma.makeTranslation(0, -lowestY(fallen), 0));
  // blend the two placements (position and rotation)
  out.decompose(va, ra, vc);
  fallen.decompose(vb, rb, vc);
  const f = Math.min(1, p.shellFall), s = f * f * (3 - 2 * f);
  return out.compose(va.lerp(vb, s), ra.slerp(rb, s), vc.set(1, 1, 1));
}
const fallen = new Matrix4();
const ra = new Quaternion(), rb = new Quaternion();

const headM = new Matrix4(), shellM = new Matrix4(), deltaM = new Matrix4(), tmpM = new Matrix4();
const opA = new Matrix4(), opB = new Matrix4();

/** Write a pose into the GPU's uniforms; returns the shell's matrix (shell frame → animal frame). */
export function applyPose(p: AmPose, u: SoftPose, time: number, outShell = new Matrix4()): Matrix4 {
  shellMatrix(p, shellM);
  outShell.copy(shellM);
  deltaM.multiplyMatrices(shellM, REST_INV);
  u.uShellM.value.copy(deltaM);
  u.uAperture.value.copy(LANDMARKS.aperture).applyMatrix4(shellM);
  u.uTime.value = time;
  u.uFoot.value.set(p.ripple, p.reach, p.haul, p.crawl);
  u.uFoot2.value.set(p.turn, p.dig, p.lift, p.width);
  u.uRetract.value.set(p.retractTubes, p.retractHead, p.retractFoot, p.shut);
  const M = u.uPartM.value, P = u.uPartP.value;
  // the head: turned and nodded about the neck, pushed forward
  const hp = REST.headPivot;
  aim(p.headYaw, p.headPitch, qa);
  headM.makeRotationFromQuaternion(qa);
  headM.premultiply(tmpM.makeTranslation(hp.x, hp.y, hp.z + p.headExt)).multiply(tmpM.makeTranslation(-hp.x, -hp.y, -hp.z));
  M[PART.head].copy(headM);
  // the tentacles from the head's front corners
  for (let s = 0; s < 2; s++) {
    const t = REST.tentacle[s];
    aim(p.tentYaw[s], p.tentPitch[s], qa);
    M[PART.tentacleL + s].compose(t.base, qa, va.set(1, 1, 1)).premultiply(headM);
    P[PART.tentacleL + s].set(p.tentExt[s], p.tentBend[s], p.tentPlane[s], p.tentWob[s]);
  }
  // the siphon from the canal (it rides with the shell)
  vb.copy(REST.siphonBase).applyMatrix4(REST.shellM);
  aim(p.siphonYaw, p.siphonPitch, qa);
  M[PART.siphon].compose(vb, qa, va.set(1, 1, 1)).premultiply(deltaM);
  P[PART.siphon].set(p.siphonExt, p.siphonBend, p.siphonPlane, p.siphonWob);
  // the proboscis from the mouth
  aim(p.probYaw, p.probPitch, qa);
  M[PART.proboscis].compose(REST.mouth, qa, va.set(1, 1, 1)).premultiply(headM);
  P[PART.proboscis].set(Math.max(0.0, p.probExt), p.probBend, p.probPlane, 0.05);
  // the operculum: on the back of the foot (moving with its hind part), or shut in the aperture
  opA.copy(REST.opercFoot);
  const L = FOOT.length * MODEL_SH;
  opA.elements[14] += L * (-0.07 * p.haul * 0.7);
  opA.elements[13] -= p.dig * 0.02 * L;
  opB.multiplyMatrices(shellM, REST.opercShut);
  const k = Math.min(1, Math.max(0, p.shut));
  if (k <= 0) M[PART.operculum].copy(opA);
  else if (k >= 1) M[PART.operculum].copy(opB);
  else {
    const pa = va, pb = vb, sc = vc;
    const ra = qb, rb = qc;
    opA.decompose(pa, ra, sc);
    opB.decompose(pb, rb, sc);
    const s = k * k * (3 - 2 * k);
    M[PART.operculum].compose(pa.lerp(pb, s), ra.slerp(rb, s), sc.set(1, 1, 1));
  }
  return outShell;
}
