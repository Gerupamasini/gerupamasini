// Anatomical reference data for Favonigobius gymnauchen (ヒメハゼ), Tokyo Bay population.
//
// Every value carries a provenance tag:
//   F = confirmed in literature (FishBase / museum / papers, see README "Sources")
//   P = judged from photographs (multiple individuals, lateral + dorsal views)
//   R = inferred from related Favonigobius / sand-dwelling Gobiidae
//   G = game-implementation assumption
//
// Longitudinal coordinate s: 0 = snout tip, 1 = caudal fin tip (TL = 1.0).

export const SPECIES = {
  scientificName: 'Favonigobius gymnauchen (Bleeker, 1860)',
  japaneseName: 'ヒメハゼ',
  englishName: 'sharp-nosed sand goby',
  family: 'Gobiidae (Gobiiformes)',
  genus: 'Favonigobius',
};

// Default adult total length in metres. Species reaches ~9 cm TL (F); Tokyo Bay tidal-flat adults
// commonly 5-8 cm (P, survey photos). 1 scene unit = 1 m.
export const DEFAULT_TL = 0.07;

export const PROPORTIONS = {
  SL: [0.82, 'P'],              // standard length / TL (rounded caudal ≈ 18% TL)
  headLength: [0.25, 'P'],      // ≈ 0.30 SL
  snoutLength: [0.075, 'P'],    // pointed snout ("sharp-nosed")
  eyeDiameter: [0.058, 'P'],    // ≈ 0.23 HL; large, dorsolateral
  eyeCentreS: [0.11, 'P'],
  interorbital: [0.012, 'P'],   // eyes very close on top of head (narrow interorbital)
  maxDepth: [0.15, 'P'],        // at D1 origin
  headWidth: [0.145, 'P'],      // head slightly wider than deep behind eyes
  headDepth: [0.12, 'P'],
  peduncleDepth: [0.075, 'P'],
  peduncleLength: [0.13, 'P'],
  lowerJawProtrudes: [true, 'F'], // 下顎が上顎より突出 (Tokyo Metropolitan survey leaflet)
  mouthRearS: [0.095, 'P'],     // gape ends under the anterior half of the eye
  mouthOblique: [0.45, 'P'],    // radians, oblique gape
  opercleRearS: [0.245, 'P'],
  napeNaked: [true, 'F'],       // gymn-auchen = "naked nape"; predorsal region scaleless
};

// Fin placement in s. Ray counts are FishBase (F); positions and sizes are photo-derived (P).
export const FINS = {
  dorsal1: { spines: [6, 'F'], sRange: [0.31, 0.43], height: 0.13, maleSpineExt: 0.07 },
  dorsal2: { spines: [1, 'F'], rays: [9, 'F'], sRange: [0.46, 0.69], height: 0.10 },
  anal:    { spines: [1, 'F'], rays: [9, 'F'], sRange: [0.51, 0.69], height: 0.085 },
  caudal:  { rays: [17, 'R'], sRange: [0.82, 1.0], shape: 'rounded-lanceolate (P)' },
  pectoral:{ rays: [17, 'R'], baseS: 0.245, length: 0.19 },
  pelvic:  { rays: [5, 'R'], baseS: 0.265, length: 0.14, fused: ['disc with frenum', 'R/F (Gobiidae)'] },
};

// Cross-section keyframes along s. top/bot = dorsal/ventral half-heights, w = half-width (all ×TL).
// n = superellipse exponent of upper half, nb = lower half (flat benthic belly → larger).
export const SECTIONS = [
  { s: 0.000, top: 0.003, bot: 0.003, w: 0.004, n: 2.0, nb: 2.0, yc: -0.004 },
  { s: 0.020, top: 0.016, bot: 0.018, w: 0.020, n: 2.1, nb: 2.2, yc: -0.004 },
  { s: 0.055, top: 0.032, bot: 0.033, w: 0.040, n: 2.2, nb: 2.6, yc: -0.002 },
  { s: 0.100, top: 0.052, bot: 0.045, w: 0.058, n: 2.3, nb: 3.0, yc: 0.000 },
  { s: 0.160, top: 0.061, bot: 0.056, w: 0.072, n: 2.3, nb: 3.2, yc: 0.001 },
  { s: 0.240, top: 0.068, bot: 0.064, w: 0.073, n: 2.2, nb: 3.0, yc: 0.002 },
  { s: 0.320, top: 0.074, bot: 0.068, w: 0.064, n: 2.1, nb: 2.6, yc: 0.003 },
  { s: 0.450, top: 0.066, bot: 0.060, w: 0.052, n: 2.0, nb: 2.3, yc: 0.004 },
  { s: 0.600, top: 0.052, bot: 0.048, w: 0.038, n: 1.9, nb: 2.0, yc: 0.004 },
  { s: 0.720, top: 0.040, bot: 0.037, w: 0.024, n: 1.8, nb: 1.8, yc: 0.004 },
  { s: 0.800, top: 0.038, bot: 0.036, w: 0.017, n: 1.7, nb: 1.7, yc: 0.004 },
  { s: 0.835, top: 0.036, bot: 0.034, w: 0.012, n: 1.6, nb: 1.6, yc: 0.004 },
  { s: 0.850, top: 0.030, bot: 0.028, w: 0.007, n: 1.6, nb: 1.6, yc: 0.004 },
];

// Colour pattern (P, synthesised from many Tokyo Bay / Seto Inland Sea photos; consistent with FishBase text).
export const PATTERN = {
  ground: [0.68, 0.62, 0.50],          // pale sand-beige dorsum
  belly: [0.88, 0.87, 0.82],           // whitish, slightly translucent
  mottle: [0.42, 0.34, 0.24],          // brown speckling on upper side (F: dark brown & white speckling)
  blotch: [0.20, 0.17, 0.14],          // ~5 dark mid-lateral blotches (F), last at caudal base
  midlateralBlotchS: [0.26, 0.38, 0.51, 0.64, 0.79],
  saddleS: [0.30, 0.44, 0.57, 0.70],   // faint dorsal saddles (P, variable)
  eyeStripe: true,                     // brown stripe eye → above mid-jaw (F)
  whiteFlecks: true,                   // pearly white flecks on flanks (P) / narrow white lines low on sides (F, occasional)
  finSpots: 'rows of small brown dots on D2, caudal rays (P)',
  maleD1: 'dark distal area with pale margin; elongated anterior spine (F)',
};

// Rig layout: bone name → s position along the body axis.
export const SPINE_BONES = [
  ['Head', 0.13], ['Spine01', 0.25], ['Spine02', 0.36], ['Spine03', 0.47],
  ['Spine04', 0.58], ['Spine05', 0.68], ['TailBase', 0.78], ['TailMid', 0.86], ['TailTip', 0.95],
];
export const ROOT_S = 0.30; // pivot ≈ pelvic disc / centre of mass (G)
