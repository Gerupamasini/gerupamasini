import { Matrix4, Quaternion, Vector3, type Bone } from 'three';
import {
  BONES, B_DORSAL, B_EYE_L, B_EYE_R, B_HEAD, B_JAW, B_PEC_L, B_PEC_R, B_SNOUT, DORSAL_BONES, MODEL_TL, NSEG, PIVOT_K, STATIONS,
  dorsalBoneS, segmentOf, zOf,
} from './anatomy';
import { rigRest } from './geometry';

/**
 * A pose of the rig, in the model's own space (root space before the individual's scale, metres at the 20 cm model):
 * the centreline (the chain's stations), the head on it, the snout's suction, the eyes, the fins.
 *
 * The rig is driven from the centreline: every chain bone sits on its station, pointing along its segment, its
 * dorsal side carried along the body by parallel transport from the pivot (so a body coiled round a blade or bent in a
 * C keeps a consistent back). Head, snout, jaw, eyes, pectoral and dorsal-fin bones ride on that frame. All bones are
 * children of the root, so each frame is written directly.
 */
export interface Pose {
  /** station positions (NSEG + 1, snout end first), model space */
  pts: Vector3[];
  /** which way the back faces at the pivot (model space, need not be unit or perpendicular) */
  up: Vector3;
  /** head on the trunk (rad): pitch > 0 lifts the snout (the pivot strike), yaw > 0 turns it to the left */
  headPitch: number;
  headYaw: number;
  /** snout's suction 0..1 (the hyoid drops, the tube widens), lower jaw open 0..1 */
  snout: number;
  jaw: number;
  /** each eye: forward (rad, gaze turned toward the snout) and up */
  eyeL: [number, number];
  eyeR: [number, number];
  /** pectoral fins: angle off the body (rad) */
  pecL: number;
  pecR: number;
  /** dorsal fin: each ray bone's sideways angle (rad) */
  dorsal: Float32Array;
  /** dorsal fin raised 0..1 (folded flat at 0) */
  dorsalRaise: number;
  /** caudal fan: 1 open, ~0.7 folded */
  caudal: number;
}

export function restPose(): Pose {
  const pts = STATIONS.map((s) => new Vector3(0, 0, zOf(s) * MODEL_TL));
  return {
    pts, up: new Vector3(0, 1, 0), headPitch: 0, headYaw: 0, snout: 0, jaw: 0, eyeL: [0, 0], eyeR: [0, 0],
    pecL: 0.5, pecR: 0.5, dorsal: new Float32Array(DORSAL_BONES), dorsalRaise: 1, caudal: 1,
  };
}

export const SEG_LEN = Array.from({ length: NSEG }, (_, k) => (STATIONS[k + 1] - STATIONS[k]) * MODEL_TL);

const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion();
const va = new Vector3(), vb = new Vector3();
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

/**
 * The free-swimming centreline: the pivot segment pitched by `pitch` (rad, head up) and yawed by `yaw`, each joint
 * bent by yawBend[k] (to the left) and pitchBend[k] (head end up) — joint k between segments k-1 and k.
 */
export function chainFromBends(pts: Vector3[], pitch: number, yaw: number, yawBend: Float32Array, pitchBend: Float32Array): void {
  const q0 = qc.setFromAxisAngle(Y, yaw).multiply(qb.setFromAxisAngle(X, -pitch));
  pts[PIVOT_K].set(0, 0, 0);
  // forward to the head: q[k] = q[k+1] · J[k+1]
  qa.copy(q0);
  for (let k = PIVOT_K - 1; k >= 0; k--) {
    qa.multiply(qb.setFromAxisAngle(Y, yawBend[k + 1])).multiply(qb.setFromAxisAngle(X, -pitchBend[k + 1]));
    va.copy(Z).applyQuaternion(qa);
    pts[k].copy(pts[k + 1]).addScaledVector(va, SEG_LEN[k]);
  }
  // back to the tail: q[k] = q[k-1] · J[k]⁻¹
  qa.copy(q0);
  for (let k = PIVOT_K; k < NSEG; k++) {
    if (k > PIVOT_K) qa.multiply(qb.setFromAxisAngle(X, pitchBend[k])).multiply(qb.setFromAxisAngle(Y, -yawBend[k]));
    va.copy(Z).applyQuaternion(qa);
    pts[k + 1].copy(pts[k]).addScaledVector(va, -SEG_LEN[k]);
  }
}

/**
 * Re-space a centreline to the segment lengths, keeping the pivot where it is and each segment's direction
 * (after blending two centrelines point by point).
 */
export function respace(pts: Vector3[]): void {
  for (let k = PIVOT_K - 1; k >= 0; k--) {
    va.subVectors(pts[k], pts[k + 1]);
    const l = va.length();
    if (l < 1e-9) va.set(0, 0, 1); else va.divideScalar(l);
    pts[k].copy(pts[k + 1]).addScaledVector(va, SEG_LEN[k]);
  }
  for (let k = PIVOT_K + 1; k <= NSEG; k++) {
    va.subVectors(pts[k], pts[k - 1]);
    const l = va.length();
    if (l < 1e-9) va.set(0, 0, -1); else va.divideScalar(l);
    pts[k].copy(pts[k - 1]).addScaledVector(va, SEG_LEN[k - 1]);
  }
}

/** The bones of one fish, by role. */
export interface Rig { bones: Bone[] }

const segQ: Quaternion[] = Array.from({ length: NSEG }, () => new Quaternion());
const segUp: Vector3[] = Array.from({ length: NSEG }, () => new Vector3());
const segDir: Vector3[] = Array.from({ length: NSEG }, () => new Vector3());
const m4 = new Matrix4();
const qHead = new Quaternion(), qSnout = new Quaternion();
const pHead = new Vector3(), pSnout = new Vector3();
const snoutScale = new Vector3();

function frameQ(dir: Vector3, up: Vector3, out: Quaternion): Quaternion {
  vb.crossVectors(up, dir);
  m4.makeBasis(vb, up, dir);
  return out.setFromRotationMatrix(m4);
}
function orthoUp(up: Vector3, dir: Vector3, out: Vector3, fallback: Vector3): Vector3 {
  out.copy(up).addScaledVector(dir, -up.dot(dir));
  if (out.lengthSq() < 1e-10) out.copy(fallback).addScaledVector(dir, -fallback.dot(dir));
  if (out.lengthSq() < 1e-10) out.set(1, 0, 0).addScaledVector(dir, -dir.x);
  return out.normalize();
}

/** Write a pose into a fish's bones. `lod` 2 skips the head's fine parts and the fins (not drawn). */
export function applyPose(bones: Bone[], pose: Pose, lod: 0 | 1 | 2 = 0): void {
  const rest = rigRest().pos;
  const P = pose.pts;
  for (let k = 0; k < NSEG; k++) {
    segDir[k].subVectors(P[k], P[k + 1]);
    const l = segDir[k].length();
    if (l > 1e-9) segDir[k].divideScalar(l); else segDir[k].set(0, 0, 1);
  }
  orthoUp(pose.up, segDir[PIVOT_K], segUp[PIVOT_K], Y);
  for (let k = PIVOT_K - 1; k >= 0; k--) orthoUp(segUp[k + 1], segDir[k], segUp[k], Y);
  for (let k = PIVOT_K + 1; k < NSEG; k++) orthoUp(segUp[k - 1], segDir[k], segUp[k], Y);
  for (let k = 0; k < NSEG; k++) {
    frameQ(segDir[k], segUp[k], segQ[k]);
    const b = bones[k];
    b.position.copy(P[k]);
    b.quaternion.copy(segQ[k]);
  }
  // caudal fan open / folded (the last bone carries it)
  bones[NSEG - 1].scale.set(1, pose.caudal, 1);
  // head on the trunk: rotated at the occiput
  qHead.copy(segQ[0]).multiply(qa.setFromAxisAngle(Y, pose.headYaw)).multiply(qb.setFromAxisAngle(X, -pose.headPitch));
  pHead.copy(P[0]);
  const head = bones[B_HEAD];
  head.position.copy(pHead);
  head.quaternion.copy(qHead);
  const place = (bi: number, parentRest: Vector3, parentPos: Vector3, parentQ: Quaternion, scale?: Vector3) => {
    va.subVectors(rest[bi], parentRest);
    if (scale) va.multiply(scale);
    return va.applyQuaternion(parentQ).add(parentPos);
  };
  // snout: rigid on the head, widened by the suction
  const sn = bones[B_SNOUT];
  pSnout.copy(place(B_SNOUT, rest[B_HEAD], pHead, qHead));
  qSnout.copy(qHead);
  sn.position.copy(pSnout);
  sn.quaternion.copy(qSnout);
  snoutScale.set(1 + 0.22 * pose.snout, 1 + 0.34 * pose.snout, 1);
  sn.scale.copy(snoutScale);
  const jaw = bones[B_JAW];
  jaw.position.copy(place(B_JAW, rest[B_SNOUT], pSnout, qSnout, snoutScale));
  jaw.quaternion.copy(qSnout).multiply(qa.setFromAxisAngle(X, 0.55 * pose.jaw));
  jaw.scale.copy(snoutScale);
  // eyes: each on its own (pipefishes move them independently)
  for (const [bi, side, e] of [[B_EYE_L, 1, pose.eyeL], [B_EYE_R, -1, pose.eyeR]] as const) {
    const b = bones[bi];
    b.position.copy(place(bi, rest[B_HEAD], pHead, qHead));
    b.quaternion.copy(qHead).multiply(qa.setFromAxisAngle(Y, -side * e[0])).multiply(qb.setFromAxisAngle(Z, side * e[1]));
  }
  if (lod === 2) return;
  // pectorals: on the trunk's first segment, swinging out and back
  for (const [bi, side, a] of [[B_PEC_L, 1, pose.pecL], [B_PEC_R, -1, pose.pecR]] as const) {
    const b = bones[bi];
    b.position.copy(place(bi, rest[0], P[0], segQ[0]));
    b.quaternion.copy(segQ[0]).multiply(qa.setFromAxisAngle(Y, side * (a - 0.5) * 0.9)).multiply(qb.setFromAxisAngle(Z, side * (a - 0.5) * 0.25));
  }
  // dorsal fin: each ray bone on the segment under it, the rays swung sideways by the wave, lowered when folded
  for (let i = 0; i < DORSAL_BONES; i++) {
    const bi = B_DORSAL + i;
    const k = segmentOf(dorsalBoneS(i));
    const b = bones[bi];
    b.position.copy(place(bi, rest[k], P[k], segQ[k]));
    b.quaternion.copy(segQ[k]).multiply(qa.setFromAxisAngle(Z, pose.dorsal[i])).multiply(qb.setFromAxisAngle(X, -1.05 * (1 - pose.dorsalRaise)));
  }
}

export const BONE_COUNT = BONES.length;
