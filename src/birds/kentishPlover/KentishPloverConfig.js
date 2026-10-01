// Kentish Plover (Charadrius alexandrinus) — all tunable numbers live here.
// Every value carries an evidence tag that maps to docs/research.md:
//   S#  = source id, reliability A–D as documented there.
//   "D" = derived from scaling laws / proportions because no measurement was found.
// Units: metres, seconds, radians unless noted. Bird-local frame: +Z forward, +Y up, +X bird's left.

const mm = (v) => v / 1000;

export const morphology = {
  // Measured / literature values
  totalLength: mm(160), // S2,S4,S5,S6 (museum length, neck stretched — not compared with the standing model)
  standingLength: mm(142), // bill tip → tail tip chord, relaxed stand (photos, body_shape_spec.md §1)
  wingChord: mm(108), // S1,S3
  wingspan: mm(430), // S4
  massKg: 0.042, // S9
  tailLength: mm(45), // S2,S3
  tarsus: mm(29.5), // S1,S3 (29–29.8); photo tarsus/L 0.205–0.21 (spec §9)
  billLength: mm(15.9), // exposed culmen S2,S3,S26; photo bill/L 0.112 (spec §6)
  sexualSizeRatio: 0.97, // female/male, S9 (~4% male-biased, mostly tarsus)

  // Derived (D) — see docs/morphology.md §1; head and body from the photos (spec §5, §6, §8)
  tibiotarsus: mm(35.7),
  tibiaBare: mm(9),
  femur: mm(18.2),
  toes: { inner: mm(13), mid: mm(19), outer: mm(15) }, // no hallux
  billDepthBase: mm(4.0),
  billWidthBase: mm(3.6),
  eyeAperture: mm(4.6), // apparent eye in the photos (bill / eye 3.0–3.4, p070, p043)
  eyeballRadius: mm(4.0),
  headLength: mm(36),
  headHeight: mm(22),
  headWidth: mm(24.5),
  bodyLength: mm(99),
  bodyWidth: mm(41.5),
  bodyHeight: mm(47),
};

// Bind-pose joint positions (mm, bird-local). The bind IS the relaxed stand (photos, body_shape_spec.md §16):
// body axis 10° tail-down and back line 23° are sculpted in, so the relaxed posture has pitch 0.
export const joints = {
  body: [0, 64, -12],
  chest: [0, 66, 11],
  // no visible neck at rest (spec §7): the chain stays for head motion, NECK_LEN ≈ 20 mm
  neck0: [0, 74, 0],
  neck1: [0, 80, 5],
  neck2: [0, 85, 10],
  head: [0, 88.5, 14],
  jaw: [0, 87.5, 38],
  eyeCenter: [7.6, 95, 25.5], // eyeball centre (spec §6); head surface at x 12.3, eye 9.5 mm behind the breast front;
  // sunk 0.4 mm so the cornea apex (x 11.5) stays inside the head outline (photos: the eye sits in the dark stripe)
  shoulder: [10, 77, 6],
  tail: [0, 61, -42], // pygostyle (spec §11)
  // legs (spec §9): the knee sits 7 mm inside the belly, the tibia leaves it under the belly at (±8.3, 37, −11.5)
  hip: [9.5, 63.5, -10], // femur 18.2 mm
  knee: [8.5, 56.5, 6.8], // tibiotarsus 35.7 mm, 43° from vertical
  ankle: [8, 30.3, -17.5], // intertarsal joint 5–6 mm below the belly outline
  foot: [7, 2.4, -7], // metatarsophalangeal joint (tarsus 29.8 mm joint to joint, 20° from vertical)
};

// SDF sculpt of the feathered outline (mm). Ellipsoid = centre + radii (+ rx: pitch in degrees, + = front up);
// capsule = a,b,r. Photo-fitted prototype t9 (body_shape_spec.md §16; Frame-A IoU 0.945 vs the relaxed
// median silhouette of 17 photos): head and body one egg shape, no neck capsule (mantleNape and foreBreast
// fill the neck), deep bowl-shaped belly lowest at z ≈ −12, straight taper of the rear third.
export const bodySculpt = {
  smooth: 7.5,
  prims: [
    { type: 'ellipsoid', name: 'torso', c: [0, 66, -12], r: [19, 19.5, 39.5], rx: 29 },
    { type: 'ellipsoid', name: 'breast', c: [0, 66, 11], r: [19.5, 21.5, 20.5] },
    { type: 'ellipsoid', name: 'belly', c: [0, 47, -11], r: [15.5, 11.5, 21.5] },
    { type: 'ellipsoid', name: 'mantleNape', c: [0, 86.5, 6], r: [15, 7.5, 13.5] },
    { type: 'ellipsoid', name: 'rump', c: [0, 61, -48], r: [9.5, 6.5, 16], rx: 24 },
    { type: 'ellipsoid', name: 'undertail', c: [0, 59.5, -52.5], r: [7, 2, 13], rx: 15 }, // under-tail keel, covered by the LTC
    { type: 'ellipsoid', name: 'head', c: [0, 93.5, 24], r: [12.5, 12.5, 15], k: 5 },
    { type: 'ellipsoid', name: 'lores', c: [0, 90, 37], r: [6, 5, 5], k: 3.2 },
    { type: 'ellipsoid', name: 'chin', c: [0, 84, 31], r: [9, 6, 7], k: 4 },
    { type: 'ellipsoid', name: 'foreBreast', c: [0, 76, 24], r: [14, 14, 13] },
    { type: 'ellipsoid', name: 'breastSideL', c: [11.5, 66, 12], r: [8.5, 12, 11], k: 6 },
    { type: 'ellipsoid', name: 'breastSideR', c: [-11.5, 66, 12], r: [8.5, 12, 11], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketL', c: [13.5, 52, -14], r: [7.5, 7.5, 18], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketR', c: [-13.5, 52, -14], r: [7.5, 7.5, 18], k: 6 },
    // fill the top-view waist and keep the tibia inside the belly (spec §5, §9)
    { type: 'ellipsoid', name: 'midFlankL', c: [10.5, 48, -2], r: [8.5, 9, 14], k: 6 },
    { type: 'ellipsoid', name: 'midFlankR', c: [-10.5, 48, -2], r: [8.5, 9, 14], k: 6 },
  ],
  // Subtractive details (smooth subtraction)
  cuts: [
    { type: 'ellipsoid', name: 'eyeSocketL', c: [12.8, 95.2, 25.8], r: [2.1, 2.6, 2.8], k: 1.2 },
    { type: 'ellipsoid', name: 'eyeSocketR', c: [-12.8, 95.2, 25.8], r: [2.1, 2.6, 2.8], k: 1.2 },
  ],
  // the SDF spans x ±21, y 36–105, z −66…41
  bounds: { min: [-24, 32, -70], max: [24, 109, 46] },
  // Neck outline for the head/neck contact checks only (animator): the neck is not sculpted (it is filled by
  // mantleNape and foreBreast at rest), but when the head turns or stretches the neck bones carry this tube
  neckContact: { a: [0, 74, 0], b: [0, 88.5, 14], r: 9 },
};

// Plumage palettes (sRGB hex): white-balanced medians of 19 reference photos (body_shape_spec.md §13).
// Keys read by the shaders are kept; crownRear, fringeMix, eyelidRing, billRoughness and subterminalDark are
// optional (fall back to crown, 0.55, the lid rim colour, 0.46 and false).
export const plumage = {
  palettes: {
    // reference individual (spec §13.1; p006, p043, p065, p066, p070): warm pale-rufous cap brighter than the
    // mantle (≥1.15× luminance, saturation ≥0.35), black frontal bar, grey legs, uniformly black iris
    maleBreeding: {
      forehead: '#e9e8e3',
      frontalBar: '#1a1818',
      crown: '#b88f6c',
      crownRear: '#c09470',
      nape: '#c29a76',
      supercilium: '#e6e3de',
      eyeStripe: '#1e1a19',
      earCoverts: '#2a211e',
      collar: '#ecebe6',
      mantle: '#9a8574',
      mantleDark: '#72665c',
      fringe: '#bda88e',
      fringeMix: 0.25,
      breastPatch: '#1f1c1b',
      underparts: '#e9e8e3',
      flightDark: '#3a3632',
      flightMid: '#5b5046',
      tailDark: '#4a4038',
      white: '#ebe9e3',
      bill: '#1a1818',
      billRoughness: 0.3,
      legs: '#8a8381', // mid-grey (p006, p020, p017); '#5a534f' rendered near-black under the sun
      iris: '#120f0f',
      eyelidRing: '#dcd6cd',
      rufousCap: true, // crown / crownRear / nape blend toward plumage.sandyCap with individual.rufousAmount
    },
    femaleBreeding: {
      forehead: '#e2ddd6',
      frontalBar: '#8c7870',
      crown: '#8c7870',
      nape: '#8e7567',
      supercilium: '#e2dedc',
      eyeStripe: '#8a7263',
      earCoverts: '#76604f',
      collar: '#ecebe6',
      mantle: '#8a7468',
      mantleDark: '#705c51',
      fringe: '#ad988f',
      fringeMix: 0.35,
      breastPatch: '#6c5a4f',
      underparts: '#e9e8e3',
      flightDark: '#3c3834',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#1a1818',
      legs: '#8e8583',
      iris: '#120f0f',
      eyelidRing: '#dcd6cd',
    },
    nonBreeding: {
      forehead: '#e0dad2',
      frontalBar: '#907d6d',
      crown: '#907d6d',
      nape: '#9e8c76',
      supercilium: '#d8cdc2',
      eyeStripe: '#826c60',
      earCoverts: '#877b69',
      collar: '#e9e6e0',
      mantle: '#7c6c61',
      mantleDark: '#5d5242',
      fringe: '#c6bcb1',
      fringeMix: 0.6,
      breastPatch: '#6e6258',
      underparts: '#e9e8e3',
      flightDark: '#3c3834',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#1a1818',
      legs: '#908886',
      iris: '#120f0f',
      eyelidRing: '#e4d9cf',
    },
    // juvenile (spec §13.2; p062, p063): buff-fringed upperparts with a dark subterminal band, diffuse
    // incomplete breast band, indistinct collar
    juvenile: {
      forehead: '#e4e7e2',
      frontalBar: '#7c6961',
      crown: '#7c6961',
      nape: '#615956',
      supercilium: '#cbcac1',
      eyeStripe: '#675f52',
      earCoverts: '#624a3e',
      collar: '#d9cfc0',
      mantle: '#806a54',
      mantleDark: '#5f4f3e',
      fringe: '#bba68e',
      fringeMix: 0.9,
      subterminalDark: true,
      breastPatch: '#8f7d70',
      underparts: '#e9e8e3',
      flightDark: '#3c3834',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#161915',
      legs: '#958a88', // pinkish grey (p063, p059)
      iris: '#120f0f',
      eyelidRing: '#dcd6cd',
    },
  },
  // Photo appearance → albedo: palette colours are darkened by (Y / 0.82)^(γ − 1) so the rendered mantle / white
  // luminance matches the photos under the scene's sun and ACES (spec §13; measured on side renders)
  apparentGamma: 1.55,
  // rufousAmount 0.3 (sandy cap, p012, p020, p054) … 1.0 (the palette's rufous cap), spec §13.1
  sandyCap: { crown: '#a89483', crownRear: '#ad9886', nape: '#b09c8a' },
  // Feather micro-structure (mm): scallop size per feather tract. Kept low-contrast on purpose.
  featherScale: { head: 1.1, neck: 1.7, breast: 2.4, belly: 2.8, mantle: 3.4, flank: 3.0, rump: 2.8 },
  // head, neck and underparts nearly smooth in the photos (spec §15: 0.05–0.1); tiles stay on the upperparts
  normalStrength: { head: 0.08, neck: 0.1, breast: 0.1, belly: 0.08, mantle: 0.4, flank: 0.18, rump: 0.3 }, // mantle 0.75 → 0.4: tiles read as plates (spec §10.4)
};

export const animation = {
  breathHz: 0.77, // allometry f=17.2*M^-0.31 /min
  breathAmp: 0.012, // fractional chest scale
  blinkInterval: [2, 7],
  blinkDuration: 0.12,
  saccadeInterval: { idle: [0.5, 1.8], scan: [0.25, 0.9], alert: [1.2, 3.0] },
  saccadeDuration: 0.075,
  // bodyPitch / neck: relative to the bind (= relaxed stand, body axis 10° tail-down). Walking levels the body
  // (axis −1°, bill 26°, crown only ≈6 mm above the back: 12 photos) and running tips it slightly further
  // (spec §12, §17.3). The head is carried forward of the breast and clear of the plumage BY CONSTRUCTION: the
  // spec's neck −0.4 / −0.5 with the head lowered pressed it into the shoulders — the contact solver pushed it
  // every frame (±2.2 mm sideways as the trunk swayed: head judder, gaitjitter.mjs) and the Frame-A walk profile
  // had a nape notch up to 0.066 L low (photos p003, p017, p006: crown clearly above the back).
  // The hind-neck fill (animator napeFill) closes the rest of that notch. tools/dev/posture.mjs: walk crown 96.4,
  // crown − back 5.9 (spec +6 ± 4); run 91, +3.8; contact correction 0 in both (Frame-A walk IoU 0.892)
  walk: { speed: 0.25, strideHz: 2.8, duty: 0.62, bob: mm(1.2), footLift: mm(6), bodyPitch: 0.19, neck: -0.25, headDown: mm(2), headFwd: mm(6) },
  run: { speed: 1.3, maxSpeed: 2.0, strideHz: 9.5, duty: 0.4, bob: mm(2.5), footLift: mm(5), bodyPitch: 0.2, neck: -0.28, headDown: mm(3.5), headFwd: mm(8.5) },
  sway: mm(0.6), // lateral trunk sway per stride (D)
  // Trunk bob (2 per stride) and sway (1 per stride) are limited to this acceleration (m/s², ≈0.15 g): walking
  // keeps its full 1.2 mm inverted-pendulum bob (needs ≈0.75), running at 9.5 Hz is left with ≈0.2 mm — the body
  // glides level while the legs blur, like a wind-up toy (C: plover runs look "gliding", research.md §5.6, S32).
  // A 2.5 mm bob at 19 Hz is only 3 frames per cycle at 60 fps and read as vibration (D; tools/dev/gaitjitter.mjs)
  trunkMaxAccel: 1.5,
  // Acceleration lean: forward on starting, back on braking. Low-passed input and a small gain → a slight rock
  // (≈1.5°) on starts/stops instead of a 6° nod that followed every speed change (D; gaitjitter.mjs)
  lean: { gain: 0.008, max: 0.06, inputRate: 10, rate: 6 }, // rad per m/s², clamp (rad), smoothing rates (1/s)
  gaitCentreOffset: mm(7), // mid-stance foot position lies under the centre of mass, ahead of the hip (D)
  heelLift: { walk: mm(4), run: mm(6) }, // late-stance heel-off (MTP joint rises, toes stay down)
  stopDecel: 12,
  accel: 9,
  // Max ground yaw acceleration (rad/s²). The heading still converges at turnRate 6/9, but its rate ramps up and
  // brakes over a few frames instead of stepping from 0 to 5–18 rad/s in one frame at every start (a one-frame
  // twist of the whole bird about its feet; the trunk sits ~12 mm behind them). A 180° pivot takes ≈0.35 s,
  // a 30° heading correction ≈0.15 s (D; tools/dev/gaitjitter.mjs)
  turnAccel: 100,
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
  rufousAmount: [0.3, 1.0], // cap colour, uniform-ish over this range, biased rufous (spec §13.1)
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
  // skeleton pose rate per LOD (Hz); Infinity = every rendered frame. Near birds must be posed every frame: the
  // follow camera moves every frame, and a skipped pose (frame-time jitter, 120/144 Hz displays) made the whole
  // bird jolt by up to v·dt on screen (D; tools/dev/gaitjitter.mjs)
  animRate: [Infinity, Infinity, 30, 15],
  // A throttled bird that walks/runs stays where it was posed until its next pose (so its planted feet stay
  // planted), but is re-posed early once it lags its entity by more than this angle as seen from the camera
  // (rad; ≈1 px at 800 px / 45°): a running LOD2 bird near 9 m would otherwise advance in 4 px steps at 30 Hz.
  maxLagAngle: 0.001,
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
