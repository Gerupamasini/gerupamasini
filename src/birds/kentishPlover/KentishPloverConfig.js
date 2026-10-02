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
  eyeAperture: mm(5.3), // apparent eye in the photos: 5.4–6 mm with the lid rim (pale-faced birds, eye→bill-tip scale)
  eyeballRadius: mm(4.4),
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
  // Neck sleeve (bodyMesh.computeSpineWeights, animator _poseSleeve): the plumage between trunk and head is carried
  // by `n` helper bones spaced along a centre line from `a` (on the trunk, centre of the neck base) to `b` (in the
  // head, centre of the head–neck junction). Each turns by its share of the head's rotation about its own point of
  // the line, so every cross-section of the sleeve turns about its own centre (no candy-wrapper twist about the
  // vertebrae at the back of the neck).
  sleeve: { a: [0, 74, 16], b: [0, 90, 19], n: 5 },
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
    // (19 → 22 wide: from above the back is a broad rounded dome over which the wings fold, widest at mid-body and
    // tapering smoothly to the tail, not a narrow spindle with the folded wings pressed flat against its sides —
    // validation §Y. The front view is unchanged: the breast and its sides set the width there)
    { type: 'ellipsoid', name: 'torso', c: [0, 66, -12], r: [22, 19.5, 39.5], rx: 29 },
    { type: 'ellipsoid', name: 'breast', c: [0, 66, 11], r: [19.5, 21.5, 20.5] },
    { type: 'ellipsoid', name: 'belly', c: [0, 47, -11], r: [15.5, 11.5, 21.5] },
    { type: 'ellipsoid', name: 'mantleNape', c: [0, 86.5, 6], r: [15, 7.5, 13.5] },
    { type: 'ellipsoid', name: 'rump', c: [0, 61, -48], r: [9.5, 6.5, 16], rx: 24 },
    // fuller lower back and rump under the folded tertials (z −30…−55, below the back line, which is unchanged): the
    // plan outline tapers from the mid-body to the tail in one convex curve instead of narrowing to a 25 mm stem at
    // z −40 (validation §Y)
    { type: 'ellipsoid', name: 'backFull', c: [0, 63, -38], r: [17.5, 4.8, 24], rx: 16, k: 3.5 },
    { type: 'ellipsoid', name: 'undertail', c: [0, 59.5, -52.5], r: [7, 2, 13], rx: 15 }, // under-tail keel, covered by the LTC
    { type: 'ellipsoid', name: 'head', c: [0, 93.5, 24], r: [12.5, 12.5, 15], k: 5 },
    // lores pulled back so the feathering meets the bill at the photographed feather line (z 39.6: eye → bill
    // base 14.8 mm along the bill axis, 43 photos), not 2 mm further out as a wall the bill stuck out of
    { type: 'ellipsoid', name: 'lores', c: [0, 90.4, 35.3], r: [5.6, 4.9, 4.8], k: 3.2 },
    // feathering drawn out round the bill base (forehead into the culmen, chin into the lower mandible): a short
    // cone of plumage hugging the bill, not a cut (p012, p070, p050, p010)
    { type: 'capsule', name: 'billCuff', a: [0, 91.6, 35.8], b: [0, 89.9, 39.9], r: 2.0, k: 2.4 },
    { type: 'ellipsoid', name: 'chin', c: [0, 84, 31], r: [9, 6, 7], k: 4 },
    // ear-covert / cheek plumage behind and below the eye, a little fuller than the head's ellipsoid: from the front the
    // eyes sit inside the outline of the head, the cheeks the widest part at eye level (p037, p058, p063 — the bare
    // ellipsoid put the eye openings on the outline and their dark walls stood out of it)
    { type: 'ellipsoid', name: 'cheekL', c: [9.7, 94.0, 21.0], r: [3.8, 5.4, 5.0], k: 3 },
    { type: 'ellipsoid', name: 'cheekR', c: [-9.7, 94.0, 21.0], r: [3.8, 5.4, 5.0], k: 3 },
    { type: 'ellipsoid', name: 'foreBreast', c: [0, 76, 24], r: [14, 14, 13] },
    // (1 mm in from x 11.5: from above the shoulders round off into the wider mid-body instead of standing out as
    // square corners in front of the folded wings — validation §Y; front width unchanged, the torso sets it now)
    { type: 'ellipsoid', name: 'breastSideL', c: [10.5, 66, 10], r: [8.5, 12, 11], k: 6 },
    { type: 'ellipsoid', name: 'breastSideR', c: [-10.5, 66, 10], r: [8.5, 12, 11], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketL', c: [12, 53, -14], r: [7.3, 7.5, 18], k: 6 },
    { type: 'ellipsoid', name: 'flankPocketR', c: [-12, 53, -14], r: [7.3, 7.5, 18], k: 6 },
    // fill the top-view waist and keep the tibia inside the belly (spec §5, §9)
    { type: 'ellipsoid', name: 'midFlankL', c: [9.6, 48.5, -2], r: [8.5, 9, 14], k: 6 },
    { type: 'ellipsoid', name: 'midFlankR', c: [-9.6, 48.5, -2], r: [8.5, 9, 14], k: 6 },
    // Sides of the neck: no waist between head and body from any view (p037, p058, p063 and the front-3/4 reference:
    // the head sits on an egg, the outline runs convex from the cheek out to the breast). Without them the front
    // width fell from 42.6 mm at the breast to 33 at y 84 and rose to the cheeks again (a 2 mm notch at y 90 and
    // the scapulars standing out as shoulders). Front width now 41.1 / 39.4 / 36.7 / 34.2 / 30.8 at y 74 / 80 / 84 /
    // 88 / 92 — concave in y (outline convex) into the cheeks; inside the side silhouette (Frame-A IoU unchanged)
    { type: 'ellipsoid', name: 'neckSideL', c: [8, 79.5, 14], r: [11, 9.2, 13.5], k: 7 },
    { type: 'ellipsoid', name: 'neckSideR', c: [-8, 79.5, 14], r: [11, 9.2, 13.5], k: 7 },
    { type: 'ellipsoid', name: 'neckUpperL', c: [6, 88.6, 15.5], r: [9.4, 6.2, 10], k: 6 },
    { type: 'ellipsoid', name: 'neckUpperR', c: [-6, 88.6, 15.5], r: [9.4, 6.2, 10], k: 6 },
    // lower breast sides (y 56–62): the front outline dipped 2.2 mm between the breast and the flank pockets, and the
    // top view 2 mm between breast and flanks at z 0
    { type: 'ellipsoid', name: 'sideFillL', c: [11, 59.5, 0], r: [9.3, 9, 15], k: 6 },
    { type: 'ellipsoid', name: 'sideFillR', c: [-11, 59.5, 0], r: [9.3, 9, 15], k: 6 },
    // One egg from the breast down, no second (belly) lobe: the flank pockets and mid-flanks drawn in by 1–1.5 mm
    // (front width tapers from 42.8 at y 64 to 39.7 / 35.7 at y 50 / 44 instead of a 42 mm column down to y 48),
    // and the crease between breast and belly filled — seen from 15–60° off the front the underside dipped 0.5–1.2 mm
    // at y 46–53 between the two (a "double belly"); now ≤ 0.2 mm from every view between the throat and the belly
    { type: 'ellipsoid', name: 'lowerBreastL', c: [8, 56, 11], r: [9, 9, 11], k: 7 },
    { type: 'ellipsoid', name: 'lowerBreastR', c: [-8, 56, 11], r: [9, 9, 11], k: 7 },
  ],
  // Subtractive details (smooth subtraction)
  // Eye openings: a 2.8 mm tube along the eye axis through the plumage, its rim rounded over ≈1 mm — the cornea
  // (flush with the surrounding feathers at its apex) sits 1.2 mm down in it, the plumage rim overlapping the lid
  // margin (photos: the eye is set into the face, not a ball on it: p001, p010, p035, p012)
  // (an almond, not a round tube: two capsules r 3.4 shifted ±1.37 mm across the axis and intersected — the lid
  // arcs meet in corners in front of and behind the eye; opening ≈5.7 × 3.6 mm, ≈6.7 × 4.7 with the dark lid
  // margin, as the photographed eye of the pale-faced birds: 6.7–7.8 × 3.8–5.4 mm, median height 4.7 (p062,
  // p035, p018, p045, p050, p006, p039 on the eye → bill-tip scale). The round 6.4 mm opening read as a black ball)
  cuts: [
    { type: 'vesica', name: 'eyeSocketL', a: [9.03, 95.2, 25.9], b: [16.19, 96.17, 27.93], r: 3.4, off: [0.17, -1.36, 0.05], k: 0.9 },
    { type: 'vesica', name: 'eyeSocketR', a: [-9.03, 95.2, 25.9], b: [-16.19, 96.17, 27.93], r: 3.4, off: [-0.17, -1.36, 0.05], k: 0.9 },
  ],
  // Upper eyelid fold: the feathered upper lid stands a little proud of the opening, merged into its upper arc (a
  // separate ridge above it read as a shelf) (p012, p043, p050)
  adds: [
    { type: 'ellipsoid', name: 'upperLidL', c: [10.95, 97.95, 26.4], r: [0.8, 0.65, 3.0], k: 0.6 },
    { type: 'ellipsoid', name: 'upperLidR', c: [-10.95, 97.95, 26.4], r: [0.8, 0.65, 3.0], k: 0.6 },
  ],
  // LOD0 face patches (anatomy/bodyMesh.js): eye sockets and bill base polygonised at 0.3 mm over the base mesh
  facePatch: {
    patches: [
      { c: [12.1, 95.6, 26.8], r: 5.5 },
      { c: [-12.1, 95.6, 26.8], r: 5.5 },
      { c: [0, 90.3, 39.2], r: 5.5 },
    ],
    res: 0.3,
    maxBaseRes: 1.5,
  },
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
      fringeMix: 0.12, // faint: the closed wing of the breeding male reads smooth (p006, p012, p070)
      breastPatch: '#1f1c1b',
      underparts: '#e9e8e3',
      flightDark: '#3a3632',
      flightMid: '#5b5046',
      tailDark: '#4a4038',
      white: '#ebe9e3',
      bill: '#1a1818',
      billRoughness: 0.48, // a dull sheen, no glossy streak (p012, p070)
      legs: '#827369', // rendered ≈ the photos' white-balanced tarsus #8a7a6d (p006, p020, p070); '#5a534f' rendered near-black
      iris: '#1d1512',
      eyelidRing: '#6f6863', // a thin greyish lower lid in the black mask, not a pale ring (p012, p070)
      eyelidRingUpper: '#1e1a19', // upper lid dark in the black mask, pale only below the eye (p012, p043)
      headPattern: [13, 1, 1], // [supercilium end z (mm), loral stripe, mask round the eye] (KentishPloverMaterials)
      capStreak: 0.3, // fine crown streaks (0 none … 1 strong): faint in the rufous cap (p070), clearer in p012
      rufousCap: true, // crown / crownRear / nape blend toward plumage.sandyCap with individual.rufousAmount
    },
    femaleBreeding: {
      forehead: '#e2ddd6',
      frontalBar: '#917d6b', // warmer sandy brown cap than the mauve-grey it rendered (p050, p008, p052)
      crown: '#917d6b',
      nape: '#937c69',
      supercilium: '#e2dedc',
      eyeStripe: '#8a7263',
      earCoverts: '#76604f',
      collar: '#ecebe6',
      mantle: '#8a7468',
      mantleDark: '#705c51',
      fringe: '#ad988f',
      fringeMix: 0.5, // pale-edged coverts and tertials (p039, p052)
      breastPatch: '#6c5a4f',
      underparts: '#e9e8e3',
      flightDark: '#3c3834',
      flightMid: '#5d5248',
      tailDark: '#4c423a',
      white: '#ebe9e3',
      bill: '#1a1818',
      legs: '#8e8583',
      iris: '#1d1512',
      eyelidRing: '#dcd6cd',
      // supercilium ends over the eye's rear edge, the cap drops to the ear coverts; the brown stripe runs through the
      // eye — under it too, where the pale eye-ring shows against it (p050, p062, p008)
      headPattern: [24, 0.75, 0.75],
      capStreak: 0.65, // streaked / pale-tipped crown (p050, p062)
      capDrop: 1.6, // the cap's front edge (mm below the male's bar) — a narrow supercilium over the eye (p050, p008)
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
      legs: '#92857e', // photos #9b8d86 (p001, p050)
      iris: '#1d1512',
      eyelidRing: '#e4d9cf',
      headPattern: [20, 0.5, 0.6], // pale lores, brown through the eye (p001, p035)
      capStreak: 0.65, // (p001, p035)
      capDrop: 1.3,
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
      collar: '#e2dbcf',
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
      legs: '#7a6365', // pinkish grey, photos #81696b (p035, p063, p059)
      iris: '#1d1512',
      eyelidRing: '#dcd6cd',
      headPattern: [22, 0.5, 0.7], // brown through the eye, pale eye-ring (p062, p045)
      capStreak: 0.8, // pale-fringed crown feathers (p062, p063)
      capDrop: 1.8, // the cap reaches the eye's upper lid (p062, p045)
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
  // Tail secondary motion (Animator._tailSecondary): a stiff, well-damped spring (6 Hz, ζ 0.5) driven by the trunk's
  // vertical, pitch and yaw accelerations — ≈0.01 rad dip per 1.5 m/s² of step bob, ≈0.04 rad against a peck's pitch,
  // ≈0.03 rad outward at the start of a 100 rad/s² turn. Per unit acceleration: lift rad/(m/s²)·ω², pitch and yaw
  // rad/(rad/s²)·ω²; max rad; maxForce caps a jolt
  tailLag: { hz: 6, damping: 0.5, lift: 9.5, pitch: 0.7, yaw: 0.43, max: 0.06, maxForce: 85 },
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
  // Peck (ACTIONS.peck; animation_reference.md §06). Plovers peck by tipping the whole trunk forward over the
  // planted feet (pivot at the hips, intertarsal joints flex, tail rises) on a SHORT neck that extends only in the
  // last ≈0.1 s of the stab (p007, p061; spec §7, §12: axis −22°, belly 20–25 mm). Segment times in s (scaled by
  // the individual's animation timing); D unless noted (no video could be analysed, research.md §0):
  //   aim     head turns the bill onto the prey and lowers it with the first ~60% of the trunk tip
  //   hold    binocular fixation, the head cocked back a little (cock)
  //   strike  stab along the bill axis, accelerating to contact, overshoot then settle (bill 50–60°: photos)
  //   grab / lift / toss (swallow: quick upward flick of the bill, jaw open) / recover (trunk first, head follows)
  // small prey ≈0.3 s handling (behavior.md §2) → 0.6 s action; worms 1–2 tugs (brace and lean back, worm
  // resists, re-grip) and two swallowing tosses (1.4–1.8 s); crabs a fast lunge, lift, shake and one beat on the
  // ground (1.2 s; behavior.md §2: 1–2 s)
  peck: {
    tip: 0.70, // trunk pitch at contact (rad from the relaxed stand: axis −22°, spec §12)
    tipOvershoot: 0.04,
    crouch: mm(12), // trunk lowered (legs flexed) at contact
    reach: mm(58), // bill tip ahead of the root at contact with no trunk shift (the AI stops this far short)
    aim: [mm(23), mm(1)], // bill tip this far above / behind the prey while aiming (the stab comes down at ≈80°)
    cock: mm(1.5),
    billAim: 52, // bill below horizontal (deg) while aiming, at contact, lifted (photos 50–60°, p007, p061)
    billStrike: 63,
    billLift: 46,
    billToss: 24,
    liftFwd: 0.4, // bill tip forward per mm lifted (prey handling: the head rises clear of the fore-breast)
    small: { aim: 0.11, hold: 0.04, strike: 0.09, grab: 0.04, lift: 0.08, toss: 0.1, tosses: 1, recover: 0.14, depth: mm(1.5) },
    polychaete: { aim: 0.13, hold: 0.07, strike: 0.11, grab: 0.07, tug: 0.36, pull: [mm(10), mm(14)], extract: 0.13, toss: 0.13, tosses: 2, recover: 0.2, depth: mm(4) },
    crab: { aim: 0.08, hold: 0.02, strike: 0.09, grab: 0.04, lift: 0.08, shake: 0.55, shakeHz: 6.5, toss: 0.14, tosses: 1, recover: 0.18, depth: mm(1) },
  },
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
  // s between stopping at the prey and the strike (fixation, binocular aim; D): after a walk, after a run (the
  // momentum absorbed first), at a crab (struck at once, before it reaches its burrow)
  peckFixation: { afterWalk: [0.05, 0.18], afterRun: [0.12, 0.3], sprint: [0.0, 0.05] },
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
