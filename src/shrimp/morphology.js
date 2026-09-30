// Morphology of Exopalaemon orientis traced from the user-supplied reference photos
// (docs/MORPHOLOGY.md lists photo IDs and methods). All lengths are fractions of TL
// (rostrum tip -> telson tip along the midline) unless stated. Frame: +X anterior,
// +Y dorsal, +Z left; origin at the carapace/abdomen articulation (posterior carapace
// margin at mid-height).
//
// Evidence tags: [PHOTO nnn] measured on that photo; [LIT] species literature;
// [PHOTO+LIT] both agree; [EST] estimate where neither resolves the detail.

export const TL = 0.06; // m, default adult [PHOTO 014 ruler: CL 12-13 mm -> TL ~65-70 mm; range 45-75 mm]

export const MORPH = {
  // ------------------------------------------------------------------ carapace
  carapace: {
    eyeX: 0.18, // eye centre -> posterior margin = CL [PHOTO 001, 005 scaled by cornea diameter]
    frontX: 0.193, // anterior margin (antennal region) [PHOTO 001]
    // [x, dorsal y, ventral y, half-width]  (lateral 001 at 0.000878 TL/px; dorsal 005 at 0.000947 TL/px)
    stations: [
      [0.0, 0.0496, -0.0496, 0.052],
      [0.02, 0.0478, -0.0488, 0.055],
      [0.045, 0.045, -0.047, 0.057],
      [0.09, 0.0443, -0.041, 0.054],
      [0.125, 0.0435, -0.028, 0.048],
      [0.16, 0.0426, -0.0145, 0.041],
      [0.18, 0.041, -0.012, 0.036],
      [0.193, 0.03, -0.01, 0.03],
    ],
    // Half contour (dorsal midline -> ventral midline), normalised. Rounded dorsum,
    // branchiostegites flaring slightly outward and turning in under the gill chamber.
    contour: [
      [0, 1], [0.5, 0.93], [0.82, 0.72], [0.97, 0.38], [1.0, 0.0], [0.98, -0.4],
      [0.9, -0.75], [0.78, -0.95], [0.6, -1.0], [0.4, -0.88], [0.18, -0.8], [0, -0.78],
    ],
    antennalSpine: { x: 0.193, y: 0.012, z: 0.026, len: 0.012 }, // [LIT]/[PHOTO 015]
    branchiostegalSpine: { x: 0.19, y: -0.008, z: 0.03, len: 0.01 }, // [LIT]
  },

  // ------------------------------------------------------------------ rostrum
  // [LIT] rostrum 1.6-1.7 x carapace, overreaching the antennal scale by its anterior 0.4;
  // distal 0.6 very slender and obliquely upward; dorsal crest 6-8 teeth, the posteriormost
  // on the carapace; tip with a minute accessory tooth; ventral 4-6 teeth.
  // [PHOTO 002, 005-007] tip 0.25 TL ahead of the eye centre (1.3-1.4 CL); crest over the orbit.
  rostrum: {
    baseX: 0.13, // crest begins on the carapace behind the orbit [PHOTO 001 overlay; LIT posteriormost tooth on carapace]
    tipAhead: 0.25, // tip x = eyeX + tipAhead
    // Dorsal/ventral edges along the rostrum, s = 0 (base) .. 1 (tip); y relative to carapace dorsal line at the base.
    dorsal: [[0, 0.0], [0.1, 0.007], [0.25, 0.011], [0.36, 0.008], [0.5, 0.002], [0.75, 0.004], [0.9, 0.01], [1, 0.018]],
    ventral: [[0, -0.03], [0.1, -0.026], [0.25, -0.016], [0.36, -0.008], [0.5, -0.004], [0.75, 0.0], [0.9, 0.007], [1, 0.017]],
    halfThick: [[0, 0.007], [0.3, 0.0045], [0.55, 0.0022], [1, 0.0006]],
    crestTeeth: [0.03, 0.068, 0.106, 0.144, 0.182, 0.22, 0.258], // 7 teeth spanning eye-0.04..eye+0.03 TL [PHOTO 001, 015, 048; LIT 6-8]
    crestToothHeight: 0.011,
    crestToothLean: 0.8, // rad, forward lean [PHOTO 015 ~45 deg]
    accessoryTooth: 0.965, // minute subapical tooth -> bifid tip [LIT, PHOTO 048]
    ventralTeeth: [0.5, 0.57, 0.64, 0.71, 0.78], // 5 [LIT 4-6]
    ventralToothHeight: 0.0045,
  },

  // ------------------------------------------------------------------ abdomen
  // Tergite dorsal lengths [PHOTO 001 lateral + 005 dorsal], heights [PHOTO 001], half-widths incl.
  // flaring pleura [PHOTO 005]. Pleuron of s2 is the largest and overlaps s1 and s3 (Caridea).
  abdomen: [
    { len: 0.0640, h0: 0.094, h1: 0.086, w0: 0.056, w1: 0.057, pleuron: 0.55 },
    { len: 0.0788, h0: 0.098, h1: 0.102, w0: 0.057, w1: 0.055, pleuron: 1.0 },
    { len: 0.0893, h0: 0.102, h1: 0.1, w0: 0.054, w1: 0.049, pleuron: 0.8, hump: 0.08 },
    { len: 0.0735, h0: 0.088, h1: 0.076, w0: 0.048, w1: 0.042, pleuron: 0.7 },
    { len: 0.0735, h0: 0.07, h1: 0.057, w0: 0.041, w1: 0.034, pleuron: 0.6 },
    { len: 0.0998, h0: 0.05, h1: 0.034, w0: 0.03, w1: 0.021, pleuron: 0.0 },
  ],
  somiteContour: [
    [0, 1], [0.45, 0.93], [0.78, 0.7], [0.95, 0.3], [1.0, -0.15], [0.97, -0.55],
    [0.88, -0.88], [0.74, -1.0], [0.56, -0.9], [0.42, -0.66], [0.2, -0.58], [0, -0.58],
  ],
  somite6Contour: [
    [0, 1], [0.5, 0.9], [0.85, 0.6], [1.0, 0.1], [0.95, -0.45], [0.75, -0.85], [0.45, -1.0], [0, -0.95],
  ],

  // Resting live posture from the dorsal tangents in 001: carapace -3, s1 -25, s2 -15, s3 0, s4 +20,
  // s5 +27, s6 +33, telson +34 deg (+ = descending backward). Joint flexion = successive differences.
  rest: {
    joints: [-0.46, 0.12, 0.2, 0.42, 0.2, 0.15], // carapace->s1 ... s5->s6 (rad, + = ventral flexion) [PHOTO 001 overlay]
    telson: 0.03,
    fanSpread: 0.35, // rad half-angle; live animals spread to ~0.7 [PHOTO 009], handled ones close it
    fanRoll: 0.85, // closed fan: uropods rolled lateral-edge-down so the fan reads as a leaf in side view [PHOTO 001, 004]
    standClearance: 0.07, // ventral carapace above substrate [PHOTO 001]
  },

  // ------------------------------------------------------------------ tail fan [PHOTO 004, 009, 018, 019]
  telson: { len: 0.12, baseHalf: 0.019, tipHalf: 0.002, dorsalSpines: [0.45, 0.7] },
  uropod: {
    exo: { len: 0.145, maxHalf: 0.021, at: 0.6, toothAt: 0.85 },
    endo: { len: 0.125, maxHalf: 0.017, at: 0.55 },
  },

  // ------------------------------------------------------------------ eyes [PHOTO 001, 005, 007]
  eye: {
    corneaR: 0.0165,
    offset: 0.078, // cornea centre from the midline
    stalkR: 0.011,
    stalkLen: 0.057, // to the cornea; base sits 0.012 TL off the midline [PHOTO 005, 007]
    yaw: 1.4, // rad from forward (~80 deg, nearly perpendicular)
    pitch: 0.09,
    y: 0.027, // eye centre height [PHOTO 001]
    rimFrac: 0.15, // translucent corneal rim around the dark core
  },

  // ------------------------------------------------------------------ antennae
  antennule: {
    peduncle: [0.045, 0.03, 0.028], // 3 articles [EST from PHOTO 007]
    stylocerite: 0.03,
    flagella: [
      { len: 0.6, tint: 0x9fb6c8, yaw: 0.1, pitch: 0.45 }, // upper long ramus, bluish [PHOTO 048]
      { len: 0.2, tint: 0xd8d4c8, yaw: 0.35, pitch: 0.3 }, // upper short ramus (fused base)
      { len: 0.5, tint: 0xd8d4c8, yaw: -0.15, pitch: 0.15 }, // lower ramus
    ],
    carriagePitch: 0.43, // forward-up ~25 deg [PHOTO 002]
  },
  antenna: {
    scaphocerite: { len: 0.14, half: 0.021, divergence: 0.21, tilt: 0.17 }, // [PHOTO 007 + LIT]
    flagellumLen: 2.0, // 1.5-2.5 TL [PHOTO 001, 005]
  },

  // ------------------------------------------------------------------ pereopods [PHOTO 001, 014, 015; EST]
  // [ischium, merus, carpus, propodus(palm), dactylus(finger)], radius at merus
  pereopods: [
    { name: 'P1', chela: true, x: 0.165, segs: [0.04, 0.065, 0.075, 0.025, 0.025], r: 0.0032 },
    { name: 'P2', chela: true, x: 0.14, segs: [0.045, 0.075, 0.09, 0.045, 0.05], r: 0.0045 }, // fingers slightly > palm [PHOTO 048]
    { name: 'P3', chela: false, x: 0.11, segs: [0.05, 0.1, 0.05, 0.08, 0.025], r: 0.0038 },
    { name: 'P4', chela: false, x: 0.08, segs: [0.05, 0.1, 0.05, 0.085, 0.025], r: 0.0036 },
    { name: 'P5', chela: false, x: 0.05, segs: [0.05, 0.1, 0.05, 0.09, 0.025], r: 0.0034 },
  ],
  maxilliped3: { segs: [0.07, 0.06, 0.06], r: 0.0035 },

  // ------------------------------------------------------------------ pleopods [PHOTO 001, 004, 017]
  pleopod: { protopod: 0.04, protoR: 0.006, ramus: 0.075, ramusHalf: 0.011, ramusMaxAt: 0.35, curl: 0.2, restBack: 0.45, ramusBack: 0.75 }, // broad milky paddles seen side-on [PHOTO 003]

  // ------------------------------------------------------------------ colour [PHOTO live only]
  colour: {
    bodyOverDark: 0x7a807c, // [PHOTO 001, 011]
    bodyOverWhite: 0x9b8f6a, // [PHOTO 005, 007] (white bg #d5d4d4)
    appendage: 0xbabaaf, // legs/pleopods [PHOTO 004]
    chromatophore: 0x6a4a2a, // cores #5d532e-#8a5a30 [PHOTO 005, 007, 009]
    eyestalkPigment: 0x5d3f16, // [PHOTO 007]
    stomach: 0x272114, // [PHOTO 007]
    hepatopancreas: 0x5f5638, // [PHOTO 002, 014]
    ovary: 0x8c8456, // [PHOTO 011; olive in 048]
    hindgut: 0x3b3020,
    cornea: 0x141010,
    blueSpot: 0x1e2a3a, // occasional females [PHOTO 045, 048]
  },
};

/** Convenience: absolute metres for a TL fraction at a given total length. */
export const m = (f, tl = TL) => f * tl;
