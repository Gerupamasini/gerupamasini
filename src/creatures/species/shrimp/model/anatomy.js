// Kinematic constants. Morphology (shapes, proportions, colour) lives in morphology.js,
// traced from the reference photos. Tags follow docs/RESEARCH.md: [E] species fact,
// [R] inferred from relatives, [G] game-filled.
import { TL, MORPH } from './morphology.js';

const L = TL;

export const ANATOMY = {
  totalLength: L,

  abdomen: {
    // Joint range of motion (rad), measured from straight. Positive = ventral flexion.
    // The resting live posture (MORPH.rest.joints) already dorsiflexes the first joint by
    // ~0.38 rad and flexes s3/s4 by ~0.35 rad [PHOTO 001].
    flexMax: [0.35, 0.5, 0.75, 0.7, 0.6, 0.5],
    extendMax: [0.55, 0.12, 0.15, 0.15, 0.12, 0.12],
    rest: MORPH.rest.joints,
  },

  // Kinematics [R]
  walk: { stepLength: 0.22 * L, stepDuration: 0.34, speed: 0.4 * L }, // ~0.4 BL/s, ~1.8 steps/s per leg
  swim: { pleopodHz: 4.5, speed: 2.5 * L },
  tailFlip: { flexTime: 0.025, reextendTime: 0.06, deltaV: 0.55, pitch: 1.3, maxFlips: 3 },
};
