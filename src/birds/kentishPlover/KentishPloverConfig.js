// Kentish Plover (Charadrius alexandrinus) — all tunable numbers live here.
// Every value carries an evidence tag that maps to docs/research.md:
//   S#  = source id, reliability A–D as documented there.
//   "D" = derived from scaling laws / proportions because no measurement was found.
// Units: metres, seconds, radians unless noted. Bird-local frame: +Z forward, +Y up, +X bird's left.

const mm = (v) => v / 1000;

export const morphology = {
  // Measured / literature values
  totalLength: mm(160), // S2,S4,S5,S6
  wingChord: mm(108), // S1,S3
  wingspan: mm(430), // S4
  massKg: 0.042, // S9
  tailLength: mm(45), // S2,S3
  tarsus: mm(28), // S1,S3
  billLength: mm(16), // S2,S3,S26 (nihonensis bill slightly larger)
  sexualSizeRatio: 0.97, // female/male, S9 (~4% male-biased, mostly tarsus)

  // Derived (D) — see docs/morphology.md §1
  tibiotarsus: mm(36),
  tibiaBare: mm(11),
  femur: mm(18),
  toes: { inner: mm(13), mid: mm(19), outer: mm(15) }, // no hallux
  billDepthBase: mm(4.3),
  billWidthBase: mm(4.0),
  eyeAperture: mm(5.4),
  eyeballRadius: mm(4.0),
  headLength: mm(26),
  headHeight: mm(22),
  headWidth: mm(20),
  bodyLength: mm(84),
  bodyWidth: mm(44),
  bodyHeight: mm(40),
};

// Bind-pose joint positions (mm, bird-local). docs/morphology.md §2
export const joints = {
  body: [0, 56, -12],
  chest: [0, 58, 15],
  neck0: [0, 63, 27],
  neck1: [0, 68, 32],
  neck2: [0, 72, 36],
  head: [0, 75, 40],
  jaw: [0, 76.4, 57.5],
  eyeCenter: [5.9, 81.0, 49.9], // eyeball centre; aperture plane ≈2.9 mm lateral of it
  shoulder: [12, 64, 20],
  tail: [0, 59.5, -36.5], // pygostyle: rectrix bases lie ~12 mm inside the rump outline
  hip: [10, 52, -6],
  knee: [13, 48, 14],
  ankle: [11, 28.5, -16], // intertarsal joint (tibiotarsus 35.8 mm)
  foot: [10, 2.5, -7], // metatarsophalangeal joint (tarsus 27.5 mm)
};

// SDF sculpt of the feathered outline (mm). Ellipsoid = centre + radii; capsule = a,b,r.
// Tuned against the proportions in docs/morphology.md §1 and the silhouette rules §5.
export const bodySculpt = {
  smooth: 7.5,
  prims: [
    { type: 'ellipsoid', name: 'torso', c: [0, 57.5, -2], r: [20.5, 17.5, 36] },
    { type: 'ellipsoid', name: 'breast', c: [0, 58.5, 17], r: [20.5, 18.5, 19.5] },
    { type: 'ellipsoid', name: 'belly', c: [0, 51.5, 2], r: [16, 10, 22] },
    { type: 'ellipsoid', name: 'mantle', c: [0, 63.5, 2], r: [17, 10.5, 28] },
    { type: 'ellipsoid', name: 'rump', c: [0, 59.5, -31], r: [11.5, 8.5, 15] },
    { type: 'ellipsoid', name: 'undertail', c: [0, 55, -37], r: [8.5, 6, 12.5] },
    { type: 'capsule', name: 'neck', a: [0, 64, 27], b: [0, 74, 39], r: 11 },
    { type: 'ellipsoid', name: 'head', c: [0, 80.4, 48], r: [10.3, 11.1, 12.9], k: 5 },
    { type: 'ellipsoid', name: 'lores', c: [0, 78.2, 56.8], r: [5.8, 5.2, 5.2], k: 3.2 },
    { type: 'ellipsoid', name: 'chin', c: [0, 74.5, 53], r: [6.2, 4.6, 6.5], k: 4 },
    { type: 'ellipsoid', name: 'breastSideL', c: [14, 54.5, 25.5], r: [9.0, 9.8, 10.5], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketL', c: [13.5, 50.5, -4], r: [9.0, 6.5, 24], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketR', c: [-13.5, 50.5, -4], r: [9.0, 6.5, 24], k: 6 },
    { type: 'ellipsoid', name: 'breastSideR', c: [-14, 54.5, 25.5], r: [9.0, 9.8, 10.5], k: 6 },
  ],
  // Subtractive details (smooth subtraction)
  cuts: [
    { type: 'ellipsoid', name: 'eyeSocketL', c: [10.7, 81.3, 50.4], r: [2.1, 3.0, 3.2], k: 1.2 },
    { type: 'ellipsoid', name: 'eyeSocketR', c: [-10.7, 81.3, 50.4], r: [2.1, 3.0, 3.2], k: 1.2 },
  ],
  bounds: { min: [-26, 30, -60], max: [26, 95, 64] },
};

// Plumage palettes (sRGB hex). Estimated from textual descriptions — research.md §3.2 (C–D).
export const plumage = {
  palettes: {
    maleBreeding: {
      forehead: '#e6e2d8',
      frontalBar: '#1c1a18',
      crown: '#b8743f',
      nape: '#b37446',
      supercilium: '#e8e4da',
      eyeStripe: '#1e1b19',
      earCoverts: '#1e1b19',
      collar: '#e9e6de',
      mantle: '#958470',
      mantleDark: '#766652',
      fringe: '#b9ab92',
      breastPatch: '#1f1c1a',
      underparts: '#ecebe5',
      flightDark: '#2d2824',
      flightMid: '#5b5046',
      tailDark: '#4a4038',
      white: '#ebe9e3',
      bill: '#151413',
      legs: '#34322f',
      iris: '#24160d',
    },
    femaleBreeding: {
      forehead: '#e0d9cb',
      frontalBar: '#9e8c72',
      crown: '#9e8c72',
      nape: '#9d8c74',
      supercilium: '#ddd5c5',
      eyeStripe: '#6a5846',
      earCoverts: '#6f5d4b',
      collar: '#e9e6de',
      mantle: '#978672',
      mantleDark: '#786854',
      fringe: '#bbad94',
      breastPatch: '#6e5c4a',
      underparts: '#ecebe5',
      flightDark: '#2f2a26',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#151413',
      legs: '#353330',
      iris: '#24160d',
    },
    nonBreeding: {
      forehead: '#e2dcd0',
      frontalBar: '#9a8a74',
      crown: '#9a8a74',
      nape: '#9a8b77',
      supercilium: '#ded8cb',
      eyeStripe: '#7c6b58',
      earCoverts: '#7c6b58',
      collar: '#e9e6de',
      mantle: '#958878',
      mantleDark: '#786b5b',
      fringe: '#b8ac98',
      breastPatch: '#857563',
      underparts: '#ecebe5',
      flightDark: '#2f2a26',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#151413',
      legs: '#363431',
      iris: '#24160d',
    },
  },
  // Feather micro-structure (mm): scallop size per feather tract. Kept low-contrast on purpose.
  featherScale: { head: 1.1, neck: 1.7, breast: 2.4, belly: 2.8, mantle: 3.4, flank: 3.0, rump: 2.8 },
  normalStrength: { head: 0.35, neck: 0.45, breast: 0.35, belly: 0.3, mantle: 0.75, flank: 0.55, rump: 0.5 },
};

export const animation = {
  breathHz: 0.77, // allometry f=17.2*M^-0.31 /min
  breathAmp: 0.012, // fractional chest scale
  blinkInterval: [2, 7],
  blinkDuration: 0.12,
  saccadeInterval: { idle: [0.5, 1.8], scan: [0.25, 0.9], alert: [1.2, 3.0] },
  saccadeDuration: 0.075,
  walk: { speed: 0.25, strideHz: 2.8, duty: 0.62, bob: mm(1.2), footLift: mm(6), bodyPitch: 0.0 },
  run: { speed: 1.3, maxSpeed: 2.0, strideHz: 9.5, duty: 0.4, bob: mm(2.5), footLift: mm(5), bodyPitch: 0.14 },
  gaitCentreOffset: mm(7), // mid-stance foot position lies under the centre of mass, ahead of the hip (D)
  heelLift: { walk: mm(4), run: mm(6) }, // late-stance heel-off (MTP joint rises, toes stay down)
  stopDecel: 12,
  accel: 9,
  headStabilization: 0.8,
  footTrembleHz: 10,
  flight: {
    cruiseHz: 7.5, // Pennycuick 6.8 Hz baseline, S25
    takeoffHz: 9.0,
    cruiseSpeed: 11,
    downstrokeFraction: 0.55,
    glideBeforeLanding: [1.0, 1.8],
    crouchTime: 0.12,
    pushTime: 0.06,
    legThrustFraction: 0.9, // S23
  },
};

// Behaviour thresholds — docs/behavior.md §3 (S11, S12, S37). Distances in metres.
export const disturbance = {
  alertDistance: 50,
  walkAwayDistance: 35,
  runAwayDistance: 22,
  flightInitiationDistance: 14,
  persistSeconds: 9, // continued approach inside the walk-away zone eventually triggers flight
  // S11: ~80 m for nesting birds vs ~40 m for non-breeding flocks → multiplier by behavioural context
  contextScale: { nesting: 1.8, foraging: 1.0 },
  threatTypes: {
    human: { distanceScale: 1.0, flyBias: 0.0 },
    dog: { distanceScale: 1.6, flyBias: 0.5 },
    raptor: { distanceScale: 2.5, flyBias: 0.9 },
    crow: { distanceScale: 1.2, flyBias: 0.6 },
  },
  speedFactor: { reference: 1.3, exponent: 0.35 }, // faster approach → earlier reaction
  directnessWeight: 0.35,
  habituationRate: 0.004, // per second while threat stays beyond alertDistance*0.6
  habituationMax: 0.25,
  fearDecay: 0.18,
};

export const social = {
  personalSpace: 0.6,
  roostSpacing: 0.25,
  chaseHazard: 0.12, // per second when intruder within personalSpace*0.5 near food
  chaseDistance: [0.4, 1.2],
  alarmContagionRadius: 12,
  alarmContagion: 0.55,
  isolationRadius: 15,
};

export const foraging = {
  scanDuration: [0.8, 3.5],
  giveUpHazard: 0.9, // per second while scanning without detection
  movingDetectionFactor: 0.15,
  relocateDistance: [0.3, 1.5],
  relocateTurn: 1.2, // max turn (rad)
  walkToPreyMax: 0.35, // beyond this, run to prey
  detectionRange: 2.2,
  lookLatency: 0.3, // s after stopping before prey can be detected (D)
  footTrembleHazard: 0.08,
  sandpiperModeDensity: 0.8, // plasticity S13: very high prey density → short walking search
  maxPecksPerMinute: 25, // S18
};

export const drives = {
  hungerRate: 1 / 600, // per second (0→1 in 10 min without food)
  fatigueRate: 1 / 1500,
  fatigueRecovery: 1 / 240,
  comfortRate: 1 / 420,
  socialRate: 1 / 300,
};

// Individual variation: 1 SD as fraction, clamped to ±2 SD (no unrealistic individuals).
export const individualVariation = {
  bodyScale: 0.025,
  legLength: 0.03,
  melaninPatchScale: 0.12, // S10
  rufousSaturation: 0.08,
  plumageWear: 0.3,
  walkSpeed: 0.08,
  fearThreshold: 0.15,
  personalSpace: 0.2,
  animationTiming: 0.1,
  headMovement: 0.2,
  clampSD: 2,
};

export const lod = {
  distances: [2.5, 9, 30], // LOD0 < 2.5 m < LOD1 < 9 m < LOD2 < 30 m < LOD3
  sdfResolution: [1.15, 2.6, 4.6], // mm voxel per LOD0..2 (≈24k / 5k / 1.5k body tris)
  aiRate: [20, 20, 8, 3], // Hz per LOD
  animRate: [60, 60, 30, 15],
};

export const KentishPloverConfig = {
  morphology,
  joints,
  bodySculpt,
  plumage,
  animation,
  disturbance,
  social,
  foraging,
  drives,
  individualVariation,
  lod,
};

export default KentishPloverConfig;
