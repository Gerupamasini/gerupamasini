// Morphology of ユビナガホンヤドカリ Pagurus minutus, in shield lengths (SL = 1).
//
// Evidence tags (see docs/creatures/yubinagahonyadokari/01_research.md):
//   [D] directly documented for P. minutus (Komai & Mishima 2003; Jung et al. 2018; Korean NIBR fauna;
//       Japanese field guides; the 70 reference photographs)
//   [G] inferred from Pagurus / other hermit crabs
//   [P] proportion read from the reference photographs (no published measurement)
//   [S] game supplement (no data found; chosen to be consistent with the above)
//
// Body frame: +Z forward (rostrum), +Y up, +X = the animal's LEFT. Origin = posterior margin of the shield
// at mid-height of the cephalothorax. The model is built in SL units and scaled by SL (metres) at runtime.

export const MORPH = {
  // ── size distribution ─────────────────────────────────────────────────────────────────────────
  // SL 3–6 mm typical, max ≈ 7 mm [D]; males larger [D]
  shieldLength_mm: { mean: 4.2, sd: 0.9, min: 2.0, max: 7.0 },
  /** game "length" (全長 shown in the zukan) = this × SL: crab in walking posture incl. shell [S] */
  totalLengthPerSL: 4.5,
  /** body (incl. abdomen) volume ≈ k·SL³ (mm³) – used by shell evaluation [S] */
  bodyVolumeK: 1.6,

  // ── cephalothorax ─────────────────────────────────────────────────────────────────────────────
  shield: {
    length: 1.0,
    width: 1 / 1.05, // L:W 1.0–1.1 [D]
    height: 0.4, // dorsal dome above the branchiostegites [P]
    rostrum: { len: 0.06, halfWidth: 0.085 }, // broadly rounded-triangular, ≈ level with lateral projections [D]
    lateralProjection: { x: 0.36, len: 0.055, halfWidth: 0.07 }, // bluntly rounded [D]
    gastricSpot: { z: 0.55, radius: 0.09 }, // dark-brown median spot on gastric region [D]
  },
  posteriorCarapace: { length: 0.85, widthEnd: 0.66, heightEnd: 0.42 }, // membranous, weakly calcified [G]

  // ── coxa positions (body frame) ───────────────────────────────────────────────────────────────
  // anomuran sternum is narrow; P1–P3 under the shield's posterior half, P4–P5 under the posterior carapace [G][P]
  coxae: {
    cheliped: { x: 0.2, y: -0.24, z: 0.22 },
    p2: { x: 0.25, y: -0.26, z: 0.02 },
    p3: { x: 0.25, y: -0.25, z: -0.18 },
    p4: { x: 0.2, y: -0.2, z: -0.4 },
    p5: { x: 0.13, y: -0.14, z: -0.6 },
  },

  // ── eyes ──────────────────────────────────────────────────────────────────────────────────────
  eye: {
    base: { x: 0.12, y: 0.07, z: 0.98 },
    length: 0.8, // 0.7–0.9 SL [D]
    radiusBase: 0.085, // weakly inflated at base [D]
    radiusMid: 0.065,
    corneaRadius: 0.078, // corneas only slightly dilated [D]
    corneaLength: 0.16,
    restYaw: 0.3, // splay (rad) [P]
    restPitch: 0.28, // raised (rad) [P]
    acicle: 0.05, // ocular acicle, triangular [G]
  },

  // ── antennules (A1) ───────────────────────────────────────────────────────────────────────────
  antennule: {
    base: { x: 0.055, y: -0.03, z: 0.96 },
    peduncle: [0.27, 0.25, 0.3], // overreaches corneas slightly when extended [D]
    radius: 0.032,
    flagellum: 0.24, // short, biramous [G]; orange-yellow in some individuals [D: photos 009, 029]
  },

  // ── antennae (A2) ─────────────────────────────────────────────────────────────────────────────
  antenna: {
    base: { x: 0.27, y: -0.04, z: 0.92 },
    peduncle: [0.2, 0.22, 0.24, 0.2], // reaches distal margin of cornea [D]
    radius: 0.042,
    acicle: 0.26, // arcuate [G]
    flagellum: 4.8, // longer than the shell in photos [P]
    flagellumRadius: 0.024,
    annuli: 72,
    whitePeriod: 4, // olive annuli regularly interrupted by white ones [D]
  },

  // ── third maxillipeds ─────────────────────────────────────────────────────────────────────────
  mxp3: {
    base: { x: 0.07, y: -0.24, z: 0.78 },
    segments: [0.2, 0.16, 0.14, 0.1], // banded white/dark brown [D: photos 016, 021, 026]
    radius: 0.028,
  },

  // ── chelipeds (P1) ────────────────────────────────────────────────────────────────────────────
  // right clearly larger [D]; right chela ovate (♀) or elongate with weaker armature (♂) [D];
  // male major-chela propodus ≈ 1.7 SL (guarding males, 6.38 mm / SL 3.76 mm) [D – verify]
  chelipeds: {
    R: {
      coxa: 0.15, basis: 0.17, merus: 0.7, carpus: 0.6,
      chela: { female: 1.35, male: 1.7 }, // propodus incl. fixed finger
      palmFraction: 0.6,
      dactylFraction: 0.46, // movable finger / chela length
      widthRatio: { female: 0.6, male: 0.5 }, // palm width / chela length (dorsal view, ovate) [D shape, S value]
      thicknessRatio: 0.33,
      merusSection: [0.13, 0.16], carpusSection: [0.15, 0.17],
    },
    L: {
      coxa: 0.13, basis: 0.14, merus: 0.58, carpus: 0.46,
      chela: { female: 0.85, male: 0.88 }, // smaller and slender [D]; length [P]
      palmFraction: 0.5,
      dactylFraction: 0.52,
      widthRatio: { female: 0.36, male: 0.34 },
      thicknessRatio: 0.26,
      merusSection: [0.09, 0.11], carpusSection: [0.09, 0.105],
    },
  },

  // ── walking legs P2, P3 (Leg_*1, Leg_*2) ───────────────────────────────────────────────────────
  // dactyl 1.2–1.5 × propodus (left P3 1.3–1.6) [D]; slender, slightly curved ventrally, weakly twisted [D]
  // segment ratios merus/carpus/propodus [P][G]
  walkingLegs: {
    R1: { coxa: 0.18, basis: 0.28, merus: 0.95, carpus: 0.52, propodus: 0.72, dactylus: 1.0 },
    L1: { coxa: 0.18, basis: 0.28, merus: 0.97, carpus: 0.53, propodus: 0.73, dactylus: 1.02 },
    R2: { coxa: 0.18, basis: 0.28, merus: 0.92, carpus: 0.5, propodus: 0.74, dactylus: 0.98 },
    L2: { coxa: 0.18, basis: 0.28, merus: 0.94, carpus: 0.51, propodus: 0.72, dactylus: 1.08 },
    section: {
      // [half-height (dorso-ventral, in the leg plane), half-width (antero-posterior)] at proximal → distal
      // stout, as in the dorsal-view photos 063/064 (article width ≈ 0.2 SL) [P]
      coxa: [[0.14, 0.13], [0.13, 0.12]],
      basis: [[0.115, 0.105], [0.125, 0.105]],
      merus: [[0.14, 0.1], [0.152, 0.106]], // laterally compressed [G]
      carpus: [[0.118, 0.092], [0.132, 0.098]],
      propodus: [[0.11, 0.087], [0.09, 0.075]],
      dactylus: [[0.076, 0.07], [0.009, 0.008]],
    },
    dactylCurve: 0.2, // ventral curvature (rad over the length) [D: slightly curved]
    dactylTwist: 0.28, // weak twist (rad) [D]
    carpalSpine: 0.04, // dorsodistal carpal spine [G]
    dactylSpinules: 9, // ventral corneous spinules [G]
  },

  // ── reduced legs P4, P5 (Leg_*3, Leg_*4): shell holding, mostly hidden [G] ────────────────────
  reducedLegs: {
    P4: { coxa: 0.12, basis: 0.14, merus: 0.38, carpus: 0.2, propodus: 0.24, dactylus: 0.12, section: 0.055 },
    P5: { coxa: 0.1, basis: 0.1, merus: 0.28, carpus: 0.14, propodus: 0.18, dactylus: 0.08, section: 0.042 },
  },

  // ── abdomen (pleon) ───────────────────────────────────────────────────────────────────────────
  // membranous, dextrally coiled; uropods asymmetrical; telson with median terminal cleft [D]
  abdomen: {
    length: 2.3, // [S] no ratio published
    segments: 8,
    radiusBase: 0.34,
    radiusEnd: 0.16,
    flatten: 0.78, // dorso-ventral flattening of the soft pleon [G]
    telson: 0.16,
    uropodL: 0.2, // left better developed [G: Calcinus]
    uropodR: 0.14,
  },

  // ── shell seat (aperture grip point) in body frame ─────────────────────────────────────────────
  // default; each shell species overrides y/z with its own carry pose (PagurusMinutusShell.js)
  shellAnchor: { x: -0.02, y: 0.15, z: -0.7 },
};

/**
 * Colour palette (sRGB hex). Values read from the photographs and descriptions [D]; matched against
 * photos 001, 002, 021, 022, 050 and 063: a muted grey-olive/khaki, never lime, with brown mottling.
 *  - overall pale greenish-brown; shield light yellowish-brown with a dark-brown gastric spot
 *  - chelipeds olive-brown with dense white/cream granules
 *  - walking legs olive/grey-brown with one dark-brown median longitudinal stripe on the lateral face,
 *    dark transverse bands mid-leg, dactyl with a median WHITE section (green-white-green from the tip),
 *    tips NOT white (white tips = P. filholi)
 *  - eyestalks milky/yellowish-white with a brown mid band; corneas with two transverse dark stripes
 *  - antennal flagellum olive with regularly spaced white annuli
 */
export const PALETTE = {
  shield: '#a3906f',
  shieldDark: '#5b4027',
  branchio: '#999380',
  softCarapace: '#8c8f74',
  sternum: '#c9c0a2',
  legBase: '#8a8670',
  legStripe: '#3b2e22',
  legBand: '#4d3f2d',
  legPale: '#ada58c',
  dactylBase: '#737458',
  dactylWhite: '#c9c3ad',
  dactylTip: '#5a4a32',
  cheliped: '#7f7b5e',
  chelaGranule: '#ddd6c0',
  chelaFinger: '#a09679',
  chelaFingerTip: '#6b5130',
  membrane: '#8e8a72',
  eyestalk: '#cbc2a6',
  eyeBand: '#6e5a40',
  cornea: '#8d8975',
  corneaStripe: '#3b362c',
  antenna: '#615c48',
  antennaWhite: '#cdc7b6',
  antennule: '#a8946a',
  mxp: '#c4bda6',
  mxpBand: '#4c3a26',
  abdomen: '#8b8a63',
  abdomenDeep: '#5d6942',
  uropod: '#9c9468',
  setae: '#c9bf9f',
};

/**
 * Colour morphs seen in the field [D]: brownish, dark green, flesh-coloured (Urayasu); pale yellow and
 * orange-red individuals in the photo set. `weight` = relative frequency [S].
 */
export const COLORWAYS = [
  { id: 'olive', weight: 0.46, hue: 0.0, sat: 1.0, val: 1.0, green: 0.55 },
  { id: 'brown', weight: 0.22, hue: 0.03, sat: 0.95, val: 0.92, green: 0.2 },
  { id: 'darkgreen', weight: 0.16, hue: -0.04, sat: 1.05, val: 0.78, green: 0.9 },
  { id: 'flesh', weight: 0.08, hue: 0.06, sat: 0.8, val: 1.1, green: 0.05 },
  { id: 'paleyellow', weight: 0.05, hue: 0.02, sat: 0.9, val: 1.22, green: 0.25 },
  { id: 'orange', weight: 0.03, hue: 0.09, sat: 1.25, val: 1.0, green: 0.0 },
];

/** derive per-individual dimensions (SL units) */
export function individualMorph(sex = 'f', variation = 0) {
  const m = sex === 'm' ? 'male' : 'female';
  const v = 1 + variation * 0.06; // ±6 % individual variation of the major chela [S]
  const R = MORPH.chelipeds.R, L = MORPH.chelipeds.L;
  return {
    sex,
    chelaR: R.chela[m] * v,
    chelaRWidth: R.chela[m] * v * R.widthRatio[m],
    chelaL: L.chela[m],
    chelaLWidth: L.chela[m] * L.widthRatio[m],
  };
}

/** SL in mm ↔ game length in mm */
export const slFromLength = (length_mm) => length_mm / MORPH.totalLengthPerSL;
export const lengthFromSL = (sl_mm) => sl_mm * MORPH.totalLengthPerSL;
