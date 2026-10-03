/**
 * コメツキガニ Scopimera globosa (De Haan, 1835) — Dotillidae. Body plan in carapace-width units (CW = 1).
 *
 * Every number carries its provenance:
 *   [P]  measured on the reference photographs (docs/creatures/kometsukigani/REFERENCES.md, plates 001–070)
 *   [L]  from the literature on S. globosa (docs/creatures/kometsukigani/RESEARCH.md)
 *   [R]  inferred from related Dotillidae (Scopimera inflata, Dotilla, Ilyoplax) or general brachyuran anatomy
 *   [G]  game-side completion where neither is available
 *
 * Frames: +Z anterior, +Y dorsal, +X the crab's left. The Body bone sits at the centre of the sternum's ventral
 * face; carapace and sternum geometry hang off it. Appendage bones run along their own +X (proximal → distal),
 * +Y dorsal in the limb's flexion plane, +Z = X × Y.
 */

/** carapace (plan outline and heights) */
export const CARAPACE = {
  /** carapace length / width; plates 007–009 (dorsal, flattened specimen): 235 px / 280 px [P] */
  lengthRatio: 0.84,
  /** total body height, sternum to the top of the dome, side views 027, 060, 063 [P] */
  height: 0.58,
  /** height of the lateral (anterolateral) margin above the sternum face [P] */
  marginY: 0.32,
  /** z of the widest point (slightly behind the middle, 009) [P] */
  widestZ: -0.05,
  /** posterior margin half-width (straight, 009: 140 px of 280) [P] */
  posteriorHalf: 0.25,
  /** half-width at the external orbital angles (009, 002) [P] */
  orbitalAngleHalf: 0.39,
  /** the front between the orbits: narrow, deflexed, a median groove [P][R] */
  frontHalf: 0.065,
  /** eyestalk base centre: x (002: centres 0.29 CW apart at the base, but the sockets open at ±0.11), y, z [P] */
  eyeBase: [0.11, 0.42, 0.395],
  /** sternum ventral face is y = 0; the branchiostegite wall meets it at about this inset [R] */
  ventralInset: 0.86,
};

/**
 * Eyestalks (erect in 003–005, 027, 035, 063; folded obliquely along the orbit in 001, 007–009).
 * Long, slender, translucent with white chromatophores; terminal cornea dark brown with gold flecks (013). [P]
 */
export const EYE = {
  /** basal article */
  baseLen: 0.05, baseR: 0.032,
  /** stalk proper (slightly club-shaped) */
  stalkLen: 0.19, stalkR0: 0.026, stalkR1: 0.03,
  /** terminal cornea (occupies the distal third, a little wider than the stalk) [P] */
  corneaLen: 0.085, corneaR: 0.037,
  /** erect pose: leaning out and a little forward from vertical (degrees) [P] */
  erectOutDeg: 14, erectForwardDeg: 10,
  /** folded pose: lying laterally along the orbital margin (001, 009) [P] */
  foldOutDeg: 72, foldForwardDeg: -8,
};

/** third maxillipeds: two broad opercular plates (heart-shaped pair, 002–005, ventral 006, 012) [P] */
export const MXP3 = {
  /** each plate: width, height (ischium + merus), thickness */
  width: 0.19, height: 0.25, thick: 0.034,
  /** hinge (outer margin) position: x, y, z (body frame) */
  hinge: [0.19, 0.2, 0.402],
  /** plates lean back from vertical (the face slopes a little) */
  leanDeg: 8,
};

/**
 * Chelipeds: homochelous; finely granular; carpus elongate, slightly shorter than the merus; whole limb about
 * 2 × CL in mature males (Wong et al. 2010; Crabs of Japan) [L]. Palm moderately inflated with dark speckles,
 * fingers long, slender, porcelain white-blue with denticulate cutting edges, a triangular tooth on the movable
 * finger, a narrow gape, tips brownish and crossing (002–005, 011) [P][L]. A long oval tympanum on the inner face
 * of the merus [L].
 */
export const CHELIPED = {
  /** coxa socket (body frame) and the limb's bind direction (yaw from +Z toward the side, pitch down) */
  base: [0.22, 0.13, 0.32], yawDeg: 30, pitchDeg: -20,
  coxa: 0.055, basis: 0.05, ischium: 0.045,
  merus: 0.34, merusH: 0.15, merusW: 0.09,
  carpus: 0.27, carpusR: 0.055,
  palm: 0.25, palmH: 0.19, palmW: 0.1,
  finger: 0.29, fingerH: 0.05, fingerW: 0.036,
  dactylus: 0.3,
  /** females: whole limb ≈ 1.6 CL; mature males > 2 CL [L] */
  maleScale: 1.12,
};

/**
 * Walking legs P2–P5 (Leg_*1 … Leg_*4). Long and slender, banded; legs 1 and 2 (P2, P3) longest and about equal,
 * leg 4 (P5) shortest [L]. Meri flattened side to side (broad anterior and posterior faces), each with one
 * undivided oval tympanum covering most of the face, on both faces [L] — the dark speckled ovals of 009/010 (the
 * pinned specimen shows them from above because its legs were laid flat). Carpus short; propodus with setal
 * fringes; dactylus long, slender, lanceolate, tapering to a sharp tip (009, 063) [P][L].
 *
 * base: coxa socket (x, y, z) on the ventrolateral edge; yawDeg: bind direction in the horizontal plane measured
 * from the lateral axis toward the front (009: P2 points forward, P5 back) [P]. merusW = height of the merus'
 * broad face, merusT = its thickness. roll: the leg's twist about its long axis (anterior face turned a little
 * upward, as in 016, 027, 063) [P].
 */
export const LEGS = [
  { name: 1, pereiopod: 'P2', base: [0.33, 0.1, 0.15], yawDeg: 50, coxa: 0.055, basis: 0.055, ischium: 0.05, merus: 0.42, carpus: 0.17, propodus: 0.24, dactylus: 0.21, merusW: 0.15, merusT: 0.058, roll: 0.3 },
  { name: 2, pereiopod: 'P3', base: [0.37, 0.095, 0.02], yawDeg: 17, coxa: 0.055, basis: 0.055, ischium: 0.05, merus: 0.43, carpus: 0.17, propodus: 0.24, dactylus: 0.21, merusW: 0.155, merusT: 0.058, roll: 0.25 },
  { name: 3, pereiopod: 'P4', base: [0.36, 0.095, -0.12], yawDeg: -15, coxa: 0.055, basis: 0.05, ischium: 0.048, merus: 0.38, carpus: 0.16, propodus: 0.22, dactylus: 0.2, merusW: 0.15, merusT: 0.056, roll: 0.2 },
  { name: 4, pereiopod: 'P5', base: [0.3, 0.1, -0.24], yawDeg: -50, coxa: 0.05, basis: 0.048, ischium: 0.044, merus: 0.31, carpus: 0.14, propodus: 0.19, dactylus: 0.19, merusW: 0.13, merusT: 0.05, roll: 0.15 },
];

/** natural standing stance (degrees in the limb plane) used for the rest pose and as the IK's preferred shape [P] */
export const STANCE = {
  /** sternum height above the ground: calm, alert (raised on the legs), feeding crouch [P][R] */
  bodyHeight: { calm: 0.26, alert: 0.36, feed: 0.15, hide: 0.05 },
  /** the dactylus meets the sand steeply: walking on the tips (027, 063) [P] */
  dactylDeg: -72,
  /**
   * foot radius from the coxa socket in the ground plane, per leg: at the calm height the knee (merus–carpus)
   * stays bent to ~118° inside, so the knee is the highest point of the leg (027, 035, 063). Tip-to-tip span of
   * the third legs ≈ 2.5 CW, the low end of the specimens' 2.5–3 (007–009, legs laid flat) [P]
   */
  footReach: [0.9, 0.91, 0.83, 0.71],
};

/** abdomen: male narrow (006), female broad and rounded (062); folded tight under the sternum [P][L] */
export const ABDOMEN = {
  male: { width0: 0.1, width1: 0.07, length: 0.36 },
  female: { width0: 0.34, width1: 0.3, length: 0.4 },
  z0: -0.36,
};

/** size: carapace width (mm). Max ≈ 10 mm (males), ≈ 8 mm (females) (Wada 1981); lab adults 8 ± 1 mm (Sassa & Watabe 2008) [L] */
export const SIZE = { meanCW_mm: 8.0, sdCW_mm: 1.2, minCW_mm: 3.5, maxCW_mm: 10.5, maleMax_mm: 10.5, femaleMax_mm: 8.5 };

/** pellets relative to CW [P] (plates 016, 017, 036, user photo): feeding pellets small and round, excavation lumps larger */
export const PELLET = { feedDiam: [0.19, 0.27], digDiam: [0.33, 0.6] };

/** burrow entrance diameter relative to the owner's CW [P][R] */
export const BURROW = { entranceDiam: [0.8, 1.0], shaftSlantDeg: [20, 45] };

/** Total length of a leg (CW) */
export function legLength(L) {
  return L.coxa + L.basis + L.ischium + L.merus + L.carpus + L.propodus + L.dactylus;
}
