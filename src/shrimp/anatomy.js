// Anatomical constants for Exopalaemon orientis. 1 unit = 1 m.
// Tags follow docs/RESEARCH.md: [E] species fact, [R] inferred from relatives, [G] game-filled.

export const TOTAL_LENGTH = 0.055; // [R]/[G] representative adult, rostrum tip to telson tip

const L = TOTAL_LENGTH;

export const ANATOMY = {
  totalLength: L,

  // Cephalothorax. Local origin = posterior carapace margin, +X forward.
  carapace: {
    length: 0.24 * L, // [R]
    height: 0.105 * L,
    width: 0.085 * L,
  },

  // Rostrum: longer than carapace, basal crest + subdistal teeth. [R] Exopalaemon
  rostrum: {
    length: 0.26 * L,
    baseHeight: 0.028 * L,
    dorsalCrestTeeth: 6, // [R] 5-7
    dorsalSubdistalTeeth: 1, // [R] 1-2
    ventralTeeth: 8, // [R] 6-10
    tipUpturn: 0.18, // rad
  },

  // Abdomen somites 1-6 relative lengths ([R] Caridea: 6th longest, 3rd tallest).
  abdomen: {
    lengths: [0.085, 0.085, 0.09, 0.075, 0.07, 0.115].map((f) => f * L),
    heights: [0.1, 0.1, 0.105, 0.09, 0.075, 0.055].map((f) => f * L),
    widths: [0.08, 0.078, 0.072, 0.064, 0.056, 0.045].map((f) => f * L),
    // Range of motion per joint (rad). Positive = ventral flexion.
    flexMax: [0.35, 0.45, 0.7, 0.6, 0.55, 0.45],
    extendMax: [0.06, 0.08, 0.12, 0.12, 0.1, 0.12],
  },

  telson: { length: 0.1 * L, baseWidth: 0.022 * L }, // [R]
  uropod: { length: 0.1 * L, width: 0.035 * L }, // [R]

  eye: { corneaRadius: 0.018 * L, stalkLength: 0.03 * L, spreadYaw: 0.6 }, // [R]

  antennule: {
    peduncleLength: 0.13 * L,
    flagellumLength: 0.75 * L, // [R] ~body length
    nodes: 12,
  },
  antenna: {
    scaphoceriteLength: 0.16 * L,
    flagellumLength: 1.7 * L, // [R] 1.5-2x body
    nodes: 24,
  },

  // Pereopods: [merus, carpus, propodus, dactylus] fractions of L, attach x on carapace.
  pereopods: [
    { name: 'P1', chela: true, attachX: 0.2, segs: [0.09, 0.07, 0.05, 0.022].map((f) => f * L), r: 0.0042 * L },
    { name: 'P2', chela: true, attachX: 0.36, segs: [0.13, 0.12, 0.08, 0.035].map((f) => f * L), r: 0.0055 * L },
    { name: 'P3', chela: false, attachX: 0.52, segs: [0.14, 0.06, 0.1, 0.03].map((f) => f * L), r: 0.0048 * L },
    { name: 'P4', chela: false, attachX: 0.67, segs: [0.15, 0.06, 0.11, 0.03].map((f) => f * L), r: 0.0046 * L },
    { name: 'P5', chela: false, attachX: 0.82, segs: [0.15, 0.06, 0.12, 0.03].map((f) => f * L), r: 0.0044 * L },
  ],

  pleopod: { length: 0.1 * L, width: 0.018 * L },

  // Kinematics [R]
  walk: { stepLength: 0.12 * L, stepDuration: 0.16, speed: 0.9 * L }, // ~0.9 BL/s
  swim: { pleopodHz: 4.5, speed: 2.5 * L },
  tailFlip: { flexTime: 0.025, reextendTime: 0.06, deltaV: 0.55, pitch: 1.3, maxFlips: 3 },

  mass: 0.0023, // kg, from volume estimate
};
