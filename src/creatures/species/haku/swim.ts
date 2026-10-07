import type { Object3D } from 'three';
import { MODEL_TL, S_PIVOT, SPINE_S } from './anatomy';

/**
 * Swimming pose of the ハク rig: a travelling wave down the body whose amplitude grows from a small head yaw to the
 * full tail sweep, plus a C-shaped body curvature for turns and the escape C-start.
 *
 * Lateral midline (TL units, + = the fish's left):
 *   h(s, t) = A · e(s) · sin(2π s / λ − φ(t))  +  ½ κ (s − s_pivot)²
 *   e(s)    = 0.18 − 0.62 s + 1.44 s²     (head 0.18, minimum 0.11 just behind the head, tail tip 1)
 *   λ       = 0.95 TL                       (a subcarangiform wave: a little under one wave on the body)
 * so the head barely moves and the sweep grows toward the tail, and the crest runs head → tail as φ grows.
 */

export const WAVELENGTH = 0.95;

/** amplitude envelope along the body (1 at the tail tip) */
export function envelope(s: number): number {
  return 0.18 - 0.62 * s + 1.44 * s * s;
}

/** lateral displacement of the midline at s (TL units) */
export function midline(s: number, phase: number, amp: number, curv: number): number {
  const d = s - S_PIVOT;
  return amp * envelope(s) * Math.sin((2 * Math.PI * s) / WAVELENGTH - phase) + 0.5 * curv * d * d;
}

export interface SwimPose {
  /** wave phase (radians) */
  phase: number;
  /** tail-tip half amplitude (TL units): ~0.03 hovering, 0.08–0.1 cruising, 0.16 in a burst */
  amp: number;
  /** body curvature (1/TL): + bends the fish concave to its left (turning left); ±7 at the height of a C-start */
  curv: number;
  /** head bend down relative to the trunk (radians, + = snout down): pecking at the bottom */
  headBend: number;
  /** pectoral abduction 0 (pressed to the flank) .. 1 (spread), per side, and a sculling offset (radians) */
  pecL: number;
  pecR: number;
  pecBeat: number;
  /** first dorsal fin: 0 erect .. 1 folded down */
  d1Fold: number;
  /** jaw drop 0..1 */
  jaw: number;
  /** gill covers swung open 0 (shut against the shoulder) .. 1 (flared wide) */
  oper: number;
}

export function restPose(): SwimPose {
  return { phase: 0, amp: 0.03, curv: 0, headBend: 0, pecL: 0.3, pecR: 0.3, pecBeat: 0, d1Fold: 0, jaw: 0, oper: 0 };
}

/** Segment angles of the axial chain (yaw of each bone relative to the root), radians. */
export function chainAngles(phase: number, amp: number, curv: number, out: number[] = []): number[] {
  const n = SPINE_S.length;
  for (let j = 0; j < n; j++) {
    const s0 = SPINE_S[j], s1 = j < n - 1 ? SPINE_S[j + 1] : 1;
    const dx = midline(s1, phase, amp, curv) - midline(s0, phase, amp, curv);
    // a bone yawed by α points its −Z (tailward) axis along (−sin α, 0, −cos α)
    out[j] = Math.atan2(-dx, s1 - s0);
  }
  return out;
}

export interface RigBones {
  head: Object3D;
  spine: Object3D[];
  pecL: Object3D;
  pecR: Object3D;
  d1: Object3D;
  jaw: Object3D;
  operL: Object3D;
  operR: Object3D;
}

const angles: number[] = [];

/**
 * Write a pose into the rig. `detail` 0 = everything, 1 = no pectoral sculling detail, 2 = the axial wave only.
 * spine[0] is J_head (the chain's root); its sideways offset is the head's recoil.
 */
export function applyPose(rig: RigBones, p: SwimPose, detail: 0 | 1 | 2): void {
  chainAngles(p.phase, p.amp, p.curv, angles);
  const sp = rig.spine;
  sp[0].position.x = midline(SPINE_S[0], p.phase, p.amp, p.curv) * MODEL_TL;
  sp[0].rotation.set(p.headBend * 0.6, angles[0], 0);
  for (let j = 1; j < sp.length; j++) sp[j].rotation.set(j === 1 ? -p.headBend * 0.6 : 0, angles[j] - angles[j - 1], 0);
  if (detail === 2) return;
  // pectorals: spread outward about the base (the left fin's tip goes to +X with a negative yaw), sculling up and down
  const beat = detail === 0 ? p.pecBeat : 0;
  rig.pecL.rotation.set(0, -(0.08 + 1.05 * p.pecL) - beat * 0.35, -beat * 0.5);
  rig.pecR.rotation.set(0, (0.08 + 1.05 * p.pecR) + beat * 0.35, beat * 0.5);
  rig.d1.rotation.set(-1.15 * p.d1Fold, 0, 0);
  rig.jaw.rotation.set(0.28 * p.jaw, 0, 0);
  // the gill covers swing out about their articulation, the free edge furthest, the lower part out and down a little
  const a = 0.17 * p.oper;
  rig.operL.rotation.set(0, -a, 0.35 * a);
  rig.operR.rotation.set(0, a, -0.35 * a);
}
