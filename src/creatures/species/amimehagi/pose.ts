import type { Object3D, Vector3 } from 'three';
import { CAUDAL, FIN_BONES } from './anatomy';

/**
 * The アミメハギ's pose: what its fins and body are doing at a moment. The fish is a balistiform swimmer: it is moved
 * by waves running along the long soft dorsal and anal fins (in step, so that their rolling moments cancel), steadied
 * and turned by the fluttering pectorals, steered by the folded tail as a rudder; only a burst brings the tail into
 * play, beating hard with the peduncle.
 */
export interface FinPose {
  /** the soft dorsal and anal fins: wave phase (rad), ray deflection (rad), waves along the fin, direction (+1 head → tail: forward thrust, −1 backing) */
  medPhase: number;
  medAmp: number;
  medWaves: number;
  medDir: number;
  /** a sideways set of both median fins (rad): a slow turn on the spot */
  medBias: number;
  /** pectorals: beat phase, amplitude (rad) and how far each stands out from the flank (0 pressed .. 1 out) */
  pecPhaseL: number;
  pecPhaseR: number;
  pecAmpL: number;
  pecAmpR: number;
  pecOpenL: number;
  pecOpenR: number;
  /** the tail: beat phase and amplitude (tail-tip yaw, rad), a steady rudder angle (rad), body curvature for turns (rad over the trunk) */
  tailPhase: number;
  tailAmp: number;
  rudder: number;
  curv: number;
  /** caudal fan 0 folded .. 1 spread */
  caudalSpread: number;
  /** first dorsal spine 0 folded into its groove .. 1 erect */
  spine: number;
  /** pelvic flap 0 tucked .. 1 dropped */
  flap: number;
  /** mouth 0 shut .. 1 wide (a suction peck) */
  jaw: number;
  /** each eye's gaze relative to its resting line: forward (+) / back, up (+) / down (rad) */
  eyeL: { yaw: number; pitch: number };
  eyeR: { yaw: number; pitch: number };
}

export function restPose(): FinPose {
  return {
    medPhase: 0, medAmp: 0.12, medWaves: 1.2, medDir: 1, medBias: 0,
    pecPhaseL: 0, pecPhaseR: Math.PI, pecAmpL: 0.25, pecAmpR: 0.25, pecOpenL: 0.35, pecOpenR: 0.35,
    tailPhase: 0, tailAmp: 0, rudder: 0, curv: 0, caudalSpread: 0.45, spine: 0.7, flap: 0.15, jaw: 0,
    eyeL: { yaw: 0, pitch: 0 }, eyeR: { yaw: 0, pitch: 0 },
  };
}

export interface RigBones {
  head: Object3D;
  /** J_sp1, J_sp2, J_ped, J_tail */
  trunk: Object3D[];
  jaw: Object3D;
  eyeL: Object3D;
  eyeR: Object3D;
  spine: Object3D;
  flap: Object3D;
  pecL: Object3D;
  pecL2: Object3D;
  pecR: Object3D;
  pecR2: Object3D;
  cauU: Object3D;
  cauL: Object3D;
  dor: Object3D[];
  ana: Object3D[];
  /** the fins' rotation axes from the rest rig */
  dorsalAxes: Vector3[];
  analAxes: Vector3[];
  pecBase: [Vector3, Vector3];
}

const MID_SPREAD = (CAUDAL.closed + CAUDAL.open) / 2;

/** How much each fin ray swings at bone i of n: the wave fades toward both ends of the fin. */
export function finEnvelope(i: number, n = FIN_BONES): number {
  return 0.55 + 0.45 * Math.sin((Math.PI * i) / (n - 1));
}

/** The deflection of the median fins' bone i (rad): a travelling wave along the fin. */
export function medianAngle(p: FinPose, i: number, n = FIN_BONES): number {
  const x = i / (n - 1);
  return p.medBias + p.medAmp * finEnvelope(i, n) * Math.sin(p.medPhase - p.medDir * 2 * Math.PI * p.medWaves * x);
}

/**
 * Write a pose into the rig. `detail` 0 = everything, 1 = no pectoral wave or eye movement, 2 = the trunk, tail and
 * caudal fan only (the far tier has no separate fins).
 */
export function applyPose(r: RigBones, p: FinPose, detail: 0 | 1 | 2): void {
  // the trunk: a deep stiff body; the wave of a tail beat lives in the peduncle, a turn bends the whole of it a little
  const ph = p.tailPhase, A = p.tailAmp;
  const t0 = 0.1 * A * Math.sin(ph - 0.5) + 0.25 * p.curv;
  const t1 = 0.35 * A * Math.sin(ph - 1.1) + 0.35 * p.curv;
  const t2 = 0.8 * A * Math.sin(ph - 1.8) + 0.4 * p.curv + 0.5 * p.rudder;
  r.head.rotation.set(0, -0.05 * A * Math.sin(ph), 0);
  r.trunk[0].rotation.set(0, 0.04 * A * Math.sin(ph - 0.2), 0);
  r.trunk[1].rotation.set(0, t0, 0);
  r.trunk[2].rotation.set(0, t1 + 0.5 * p.rudder, 0);
  r.trunk[3].rotation.set(0, t2, 0);
  // the caudal fan opens about its base
  const d = (p.caudalSpread * (CAUDAL.open - CAUDAL.closed) + CAUDAL.closed) - MID_SPREAD;
  r.cauU.rotation.set(d, 0, 0);
  r.cauL.rotation.set(-d, 0, 0);
  if (detail === 2) return;
  // the soft dorsal and anal fins: one wave along both, their rays swinging to the same side
  for (let i = 0; i < r.dor.length; i++) {
    const a = medianAngle(p, i, r.dor.length);
    r.dor[i].quaternion.setFromAxisAngle(r.dorsalAxes[i], a);
    r.ana[i].quaternion.setFromAxisAngle(r.analAxes[i], -a);
  }
  // pectorals: stand out from the flank and row; the outer half lags (a wave out along the fin)
  const sL = Math.sin(p.pecPhaseL), sR = Math.sin(p.pecPhaseR);
  r.pecL.quaternion.setFromAxisAngle(r.pecBase[0], 0.95 * p.pecOpenL + p.pecAmpL * sL);
  r.pecR.quaternion.setFromAxisAngle(r.pecBase[1], -(0.95 * p.pecOpenR + p.pecAmpR * sR));
  if (detail === 0) {
    r.pecL2.quaternion.setFromAxisAngle(r.pecBase[0], 0.6 * p.pecAmpL * Math.sin(p.pecPhaseL - 1.3));
    r.pecR2.quaternion.setFromAxisAngle(r.pecBase[1], -0.6 * p.pecAmpR * Math.sin(p.pecPhaseR - 1.3));
  } else {
    r.pecL2.quaternion.identity();
    r.pecR2.quaternion.identity();
  }
  // the spine folds back into its groove; the flap swings down and forward; the jaw drops
  r.spine.rotation.set(-(1 - p.spine) * 1.2, 0, 0);
  r.flap.rotation.set(-p.flap * 0.38, 0, 0);
  r.jaw.rotation.set(p.jaw * 0.6, 0, 0);
  if (detail === 0) {
    r.eyeL.rotation.set(0, -p.eyeL.yaw, p.eyeL.pitch, 'YZX');
    r.eyeR.rotation.set(0, p.eyeR.yaw, -p.eyeR.pitch, 'YZX');
  }
}
