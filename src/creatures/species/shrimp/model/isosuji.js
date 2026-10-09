// イソスジエビ (Palaemon pacificus) as a difference from the シラタエビ (Exopalaemon orientis) model.
// Everything not overridden here is the シラタエビ morphology/kinematics (morphology.js, anatomy.js).
// docs/creatures/isosujiebi/README.md lists every difference with its evidence; photo numbers refer
// to the user-supplied 50-photo PDF (2026-10-08), [LIT] to the Plazi treatment of P. pacificus.
import { MORPH, TL } from './morphology.js';
import { ANATOMY } from './anatomy.js';

/** Adult total length (m): 40-50 mm [LIT; PHOTO 18 ruler ~48 mm]. Geometry is built at TL and scaled. */
export const ISOSUJI_TL = 0.048;

const morph = structuredClone(MORPH);
{
  const M = morph;
  // Stockier: carapace deeper and broader [PHOTO 02, 12, 30, 47].
  M.carapace.stations = M.carapace.stations.map(([x, d, v, w]) => [x, d * 1.08, v * 1.08, w * 1.06]);
  // Abdomen: a gentle arch, no sharp s3 hump [PHOTO 02, 15, 30, 47].
  M.abdomen = M.abdomen.map((s, i) => ({ ...s, h0: s.h0 * 1.06, h1: s.h1 * 1.06, w0: s.w0 * 1.04, w1: s.w1 * 1.04, ...(i === 2 ? { hump: 0.03 } : {}) }));
  M.rest.joints = [-0.3, 0.08, 0.14, 0.3, 0.16, 0.12];
  M.rest.fanSpread = 0.62;

  // Rostrum [LIT: formula 1-3+6-9/3-5, distal half ascendant; PHOTO 08, 12, 18: tip about at the scaphocerite tip].
  // No elevated basal crest (Exopalaemon has one): the dorsal margin is straight over the base, the blade is
  // deep with ventral teeth, and the distal half rises and tapers.
  Object.assign(M.rostrum, {
    baseX: 0.13,
    tipAhead: 0.17,
    dorsal: [[0, 0.0], [0.2, 0.003], [0.45, 0.005], [0.65, 0.008], [0.82, 0.014], [1, 0.024]],
    ventral: [[0, -0.024], [0.2, -0.022], [0.45, -0.018], [0.65, -0.01], [0.82, 0.0], [1, 0.022]],
    halfThick: [[0, 0.0065], [0.35, 0.004], [0.7, 0.0022], [1, 0.0006]],
    // 2 postorbital teeth on the carapace (s < eye at 0.23), 6 on the rostrum, 1 subapical
    crestTeeth: [0.06, 0.17, 0.29, 0.37, 0.45, 0.53, 0.61, 0.69],
    crestToothHeight: 0.009,
    crestToothLean: 0.9,
    accessoryTooth: 0.9,
    ventralTeeth: [0.42, 0.52, 0.62, 0.72],
    ventralToothHeight: 0.005,
  });

  // Eyes: large dark cornea, stalk shorter and less lateral than Exopalaemon (~57 deg) [PHOTO 07, 20, 34, 41].
  Object.assign(M.eye, { corneaR: 0.018, stalkLen: 0.044, yaw: 1.0, pitch: 0.12, y: 0.03 });

  // Antennae: orange-brown flagella, 1.5-2 TL [PHOTO 13, 20, 33, 48]; antennules yellow-brown [PHOTO 18, 28, 41].
  M.antennule.flagella = [
    { len: 0.7, tint: 0xc8924e, yaw: 0.1, pitch: 0.45 },
    { len: 0.22, tint: 0xd4b07c, yaw: 0.35, pitch: 0.3 },
    { len: 0.55, tint: 0xc8924e, yaw: -0.15, pitch: 0.15 },
  ];
  M.antenna.flagellumLen = 1.8;
  M.antenna.scaphocerite = { ...M.antenna.scaphocerite, len: 0.135, divergence: 0.18 };

  // Pereopods [LIT: P1 carpus 1.6 x chela; P2 chela 1.3-1.4 x carpus]; walking legs long and slender,
  // the body carried high [PHOTO 13, 15, 30, 47].
  M.pereopods = [
    { name: 'P1', chela: true, x: 0.145, segs: [0.035, 0.058, 0.066, 0.022, 0.019], r: 0.003 },
    { name: 'P2', chela: true, x: 0.115, segs: [0.04, 0.066, 0.052, 0.04, 0.03], r: 0.0045 },
    { name: 'P3', chela: false, x: 0.078, segs: [0.048, 0.088, 0.044, 0.076, 0.026], r: 0.0034 },
    { name: 'P4', chela: false, x: 0.045, segs: [0.05, 0.092, 0.044, 0.08, 0.026], r: 0.0032 },
    { name: 'P5', chela: false, x: 0.012, segs: [0.052, 0.098, 0.044, 0.088, 0.026], r: 0.003 },
  ];
  M.uropod.exo = { ...M.uropod.exo, maxHalf: 0.032 };

  Object.assign(M.colour, {
    chromatophore: 0x7a3418,
    eyestalkPigment: 0xd08024,
    stomach: 0x2a2414,
    hepatopancreas: 0x5c6030, // green-brown mass under the carapace [PHOTO 20, 24, 33, 36]
    ovary: 0x7d8a3a,
    hindgut: 0x3a2c18,
  });

  // Stripe layout, read by ShrimpModel into the aPat/aPatW geometry attributes (see materials.js PAT_MODE).
  M.pattern = {
    // Carapace side: 4-6 oblique lines, postero-dorsal -> antero-ventral [PHOTO 02, 12, 18, 30];
    // dorsum: sinuous longitudinal lines [PHOTO 34, 41].
    carapace: { lines: 5, slant: 0.3, offset: 0.35, dorsal: 3.2 },
    // Abdomen: 2 bands per somite (thin mid, bold posterior), tilted forward-down on the pleura
    // [PHOTO 15, 30, 40, 47]; pale dots between them, yellow on the pleural margins [PHOTO 09, 12, 21, 23].
    abdomen: { perSomite: 2, first: 0.42, slant: 0.14, dots: 0.8 },
    // Walking legs and chelipeds: black ring before each joint, orange-yellow ring at it [PHOTO 13, 34, 49].
    // Per podomere [orange centre, black centre, proximal orange] along the segment (-1 = none).
    legs: {
      ischium: [-1, -1, -1],
      merus: [0.94, 0.8, -1],
      carpus: [0.93, 0.79, 0.07],
      propodus: [0.94, 0.8, 0.08],
      dactylus: [0.35, -1, -1],
      palm: [-1, -1, 0.1],
    },
    // Uropods: a yellow-orange spot ringed black near the tip of the exopod [PHOTO 11, 13, 19, 20, 34, 38].
    ocellus: { exo: { at: 0.75, r: 0.022, w: 1 }, endo: { at: 0.79, r: 0.013, w: 0.6 } },
  };
}

const anatomy = {
  ...ANATOMY,
  abdomen: { ...ANATOMY.abdomen, rest: morph.rest.joints },
  // Longer legs: longer, slightly quicker steps; climbs over rock [PHOTO 23, 26, 27, 31].
  walk: { stepLength: 0.26 * TL, stepDuration: 0.3, speed: 0.5 * TL },
  // Short hops between rocks rather than cruising.
  swim: { pleopodHz: 5, speed: 2.0 * TL },
  // One or two flips backward, then into cover.
  tailFlip: { ...ANATOMY.tailFlip, deltaV: 0.6, pitch: 1.1, maxFlips: 2 },
  // Feet are dropped onto rock from this far above the body (m at TL scale), so the legs reach up a ledge.
  footProbe: 0.05,
  // Resting antennae: independent left/right antennule flicks and a slow low sweep of the antennae.
  antennae: { independentFlicks: true, flickEvery: [0.5, 1.6], idleSweep: 0.1, idleSweepHz: 0.22, tremor: 0.015 },
  // Rocks the animal walks over instead of around.
  climbsRocks: true,
};

/**
 * Material overrides, merged over the シラタエビ materials in ShrimpModel. Translucent olive body with
 * dark brown-black stripes [PHOTO 02, 12, 15, 30, 47], bluish legs with black/orange rings, ocellate fan.
 */
const stripe = { lineColor: 0x1e130b, lineEdge: 0x6e3a18, dotColor: 0xf3eedb, dotColor2: 0xf2c234, lineW: 0.085, lineBold: 1.7 };
const look = {
  abdomen: { color: 0xc4b47a, alpha: 0.09, rimAlpha: 0.36, sheen: 0.1, keep: 0.35, dotR: 0.18, chroma: 0x7a3418, chromaCore: 0x3a1a0c, pattern: { mode: 1, ...stripe } },
  carapace: { color: 0xc2b47e, alpha: 0.08, rimAlpha: 0.34, sheen: 0.1, keep: 0.3, dotR: 0.18, chroma: 0x7a3418, chromaCore: 0x3a1a0c, pattern: { mode: 1, ...stripe, lineW: 0.09 } },
  rostrum: { color: 0xe8e2cc, chroma: 0x8a3c18, chromaCore: 0x4a1c0a },
  legs: { color: 0xb8d4e2, alpha: 0.16, rimAlpha: 0.55, keep: 0.15, pattern: { mode: 2, bandColor: 0xf2a01a, bandDark: 0x16100c, bandW: 0.07 } },
  append: { color: 0xb9bca8, alpha: 0.05, rimAlpha: 0.2, sheen: 0.1 }, // pleopods: glassy, not milky paddles
  fan: { color: 0xb4cede, alpha: 0.12, rimAlpha: 0.36, sheen: 0.1, clearcoat: 0.4, keep: 0.3, chroma: 0x6a3a1c, pattern: { mode: 3, bandColor: 0xf4b424, bandDark: 0x15100c } },
  stalk: { color: 0xd8c8a4, chroma: 0xd08024, chromaCore: 0x8a4a12 },
  muscle: { color: 0xa69656, opacity: 0.4 }, // olive-amber translucency [PHOTO 02, 12, 30, 47]
  cephTissue: { color: 0xaaa070, opacity: 0.24 },
  eye: { periph: [0.16, 0.09, 0.05], rim: [0.72, 0.56, 0.3], pupil: [0.015, 0.01, 0.007] },
  antennaTint: 0xb4652c,
  flagellumOpacity: 0.62,
};

export const ISOSUJI = { id: 'isosuji', ja: 'イソスジエビ', sci: 'Palaemon pacificus', TL: ISOSUJI_TL, morph, anatomy, look };
