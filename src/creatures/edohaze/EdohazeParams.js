// Morphometric & behavioural parameters for Gymnogobius macrognathos.
// Every value carries a provenance tag, see docs/edohaze/RESEARCH.md:
//   'confirmed'  documented for this species
//   'inferred'   estimated from Gymnogobius / gobiid literature
//   'game'       gameplay supplement
// All lengths are fractions of standard length (SL) unless noted.
// World units are metres; local fish frame: +Z forward (snout), +Y dorsal, +X left.

export const EDOHAZE_TL_METRES = 0.045; // adult ~40–60 mm TL (confirmed)

export const MORPH = {
  tlOverSl: 1.22,               // caudal fin ≈ 22% SL (inferred)
  headLength: 0.29,             // inferred
  headDepth: 0.145,             // round head section (confirmed shape, inferred value)
  headWidth: 0.15,
  maxDepth: 0.155,              // slender, cylindrical (confirmed shape)
  bodyWidth: 0.13,
  eyeDiameter: 0.06,            // inferred
  interorbital: 0.03,           // narrow, dorsal eyes (inferred)
  snoutLength: 0.07,
  upperJawLength: 0.14,         // large jaw (confirmed shape) reaching below rear of eye (inferred)
  mouthWidth: 0.11,
  peduncleDepth: 0.095,
  peduncleLength: 0.17,
  d1Origin: 0.37, d1End: 0.50,  // D1 VII (confirmed counts)
  d2Origin: 0.58, d2End: 0.81,  // D2 I,12; set further back than typical gobies (confirmed)
  anOrigin: 0.62, anEnd: 0.81,  // A I,10 (confirmed)
  pectoralBase: 0.285, pectoralLength: 0.21,
  pelvicOrigin: 0.295, pelvicLength: 0.16, // fused pelvic disc (family trait)
  caudalLength: 0.22,           // rounded margin (inferred)
  rays: { d1: 7, d2: 13, anal: 11, caudal: 17, pectoral: 18, pelvic: 10 },
};

// Axial position s ∈ [0,1] (snout → hypural). Local z = (S0 - s) * SL.
export const S0 = 0.40;

// Dorso-ventral / lateral profile as function of s (fractions of SL).
// Returns { top, bottom, half } — top/bottom measured from the body axis.
// Hand-fitted piecewise smooth curves; keeps the slender goby silhouette.
export function bodyProfile(s, sexScale = 1) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Snout: rounded, jaw large → blunt front with a quick rise.
  const nose = Math.pow(sm(0.0, 0.10, s), 0.55);
  const head = sm(0.0, 0.26, s);
  // Depth envelope: rises through head, near-constant trunk, tapers to peduncle.
  const trunk = 1 - 0.38 * sm(0.52, 0.86, s);
  const depthHalf = 0.5 * MORPH.maxDepth * (0.25 + 0.75 * nose) * (0.88 + 0.12 * head) * trunk;
  // Width: head broad & round, trunk slightly compressed, peduncle strongly compressed.
  const wHead = 0.5 * MORPH.headWidth * sexScale * (0.3 + 0.7 * Math.pow(sm(0.0, 0.14, s), 0.6));
  const wTrunk = 0.5 * MORPH.bodyWidth * (1 - 0.62 * sm(0.45, 0.92, s));
  const half = s < 0.30 ? lerp(wHead, wTrunk, sm(0.18, 0.30, s)) : wTrunk;
  // Dorsal profile slightly lower than ventral on the head (eyes sit high; mouth low).
  const top = depthHalf * (0.95 + 0.05 * sm(0.2, 0.5, s));
  const bottom = depthHalf * (1.05 - 0.10 * sm(0.55, 0.9, s));
  // Caudal flare at hypural plate
  const flare = 1 + 0.10 * sm(0.93, 1.0, s);
  return { top: top * flare, bottom: bottom * flare, half: Math.max(half, 0.004) };
}

function lerp(a, b, t) { return a + (b - a) * t; }

// Locomotor performance for a ~45 mm fish (inferred from small-fish kinematics).
export const LOCO = {
  cruiseBLs: 1.5,          // body lengths / s during hops
  burstBLs: 14,            // fast-start peak
  maxTailFreq: 22,         // Hz, burst
  hopTailFreq: 7,          // Hz
  waveLengthBL: 0.95,      // subcarangiform
  tailAmpBL: 0.10,         // one-sided tail amplitude at cruise
  ventilationHz: [1.4, 3.2], // rest → stressed (inferred)
};

export const HABITAT = {
  preferredSubstrate: ['sandy_mud', 'mud'], // confirmed
  maxHoverHeightBL: 1.5,   // game: never leaves the bottom layer
  exposedDepthBL: 1.2,     // water depth below which fish retreats to burrow (inferred from low-tide burrow use)
  spawningMonths: [3, 4, 5], // confirmed
};
