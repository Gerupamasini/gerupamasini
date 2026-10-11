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
  /** carapace length / width; plates 007–009 (dorsal, flattened specimen): 233 px / 266 px [P] */
  lengthRatio: 0.86,
  /**
   * total body height, sternum to the top of the dome: the live crab seen from the ground (063, 027, 035) is a
   * low, broad dome — 0.44–0.56 CW tall (SHAPE_AUDIT.md) [P]
   */
  height: 0.5,
  /** height of the lateral margin above the sternum face: the sides curve down well below the dome [P] */
  marginY: 0.27,
  /**
   * the front margin (the orbits) stands this much higher than the lateral margin: in the ground-level front
   * views the eyestalks rise from just under the top of the dome (063: 15 px below it in a 155 px tall body) [P]
   */
  frontRise: 0.11,
  /** z of the widest point (slightly behind the middle, 009) [P] */
  widestZ: -0.05,
  /** posterior margin half-width (straight, 009: 140 px of 280) [P] */
  posteriorHalf: 0.25,
  /** half-width at the external orbital angles (009, 002) [P] */
  orbitalAngleHalf: 0.39,
  /** the front between the orbits: narrow, deflexed, a median groove [P][R] */
  frontHalf: 0.065,
  /** eyestalk base centre: x (002: centres 0.29 CW apart at the base, but the sockets open at ±0.11), y, z [P] */
  eyeBase: [0.16, 0.39, 0.38],
  /** sternum ventral face is y = 0; the branchiostegite wall meets it at about this inset [R] */
  ventralInset: 0.8,
};

/**
 * Eyestalks (erect in 003–005, 027, 035, 063; folded obliquely along the orbit in 001, 007–009).
 * Long, slender, translucent with white chromatophores; terminal cornea dark brown with gold flecks (013). [P]
 */
export const EYE = {
  /** basal article, sunk in the orbit */
  baseLen: 0.035, baseR: 0.021,
  /**
   * stalk proper: slender, narrow at its neck and slightly club-shaped toward the tip; 0.035–0.05 CW thick and
   * 0.16–0.2 CW visible above the orbit in the live crab (061, 063, 027; 013 for the shape) [P]
   */
  stalkLen: 0.185, stalkR0: 0.019, stalkR1: 0.023,
  /** terminal cornea: a small bulb only a little wider than the stalk (1.2–1.6 ×), about 0.06 long (013, 061) [P] */
  corneaLen: 0.065, corneaR: 0.033,
  /** erect pose: leaning out and a little forward from vertical (degrees) [P] */
  erectOutDeg: 7, erectForwardDeg: 8,
  /** folded pose: lying laterally along the orbital margin (001, 009) [P] */
  foldOutDeg: 72, foldForwardDeg: -8,
};

/**
 * third maxillipeds: two large, strongly convex opercular plates closing the whole buccal frame — the most
 * conspicuous thing in the face (002–005, 2.webp, 4.webp); merus a little smaller than the ischium, an oblique
 * suture between them, outer surface with rounded tubercles [L] (Wong et al. 2010)
 */
export const MXP3 = {
  /**
   * each plate: width, height (ischium + merus), convexity. In the front views (2.webp, 4.webp) the
   * pair fills the face from just under the eyestalk bases to the sternum, about 1.5 × as wide as tall (2.webp,
   * plates 003–005) [P]
   */
  width: 0.225, height: 0.31, thick: 0.055,
  /** hinge (outer margin) position: x, y, z (body frame) */
  hinge: [0.225, 0.2, 0.425],
  /** plates lean back from vertical (the face slopes a little) */
  leanDeg: 12,
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
  base: [0.21, 0.11, 0.3], yawDeg: 30, pitchDeg: -20,
  coxa: 0.045, basis: 0.04, ischium: 0.04,
  /** merus and carpus slender: the live crab's arm is a thin rod beside the face, not a block (063, 027, 049) [P] */
  merus: 0.26, merusH: 0.085, merusW: 0.06,
  carpus: 0.17, carpusR: 0.038,
  /**
   * palm: deep (height ≈ 0.8 × length), laterally compressed — a plate, not a ball (011, 003); fingers a little
   * shorter than the palm, slender (011). These are a female's / small male's (027, 035, 057); large males are
   * 1.2 × (002–005, 061) [P]
   */
  palm: 0.23, palmH: 0.18, palmW: 0.068,
  finger: 0.18, fingerH: 0.05, fingerW: 0.028,
  dactylus: 0.19,
  /** females: whole limb ≈ 1.6 CL; mature males > 2 CL [L] */
  maleScale: 1.2,
};

/**
 * Walking legs P2–P5 (Leg_*1 … Leg_*4). Long, banded; legs 1 and 2 (P2, P3) longest and about equal, leg 4 (P5)
 * shortest [L]. Lengths from the flat dorsal specimen 009 (CW 266 px): merus 0.5–0.6, carpus 0.2, propodus
 * 0.24–0.26, dactylus 0.3 (P2–P4) [P].
 *
 * Cross-sections: the meri are flattened so that, on the living crab, their BROAD face is seen from above
 * (0.12–0.13 CW wide in 049, 057) and their thin edge from the front (0.08–0.1 CW in 063): bone-local Z (forward /
 * back, horizontal in the bind pose) carries the broad width `*B`, Y (dorsal, in the flexion plane) the depth `*D`.
 * Each merus has one undivided oval tympanum covering most of its broad face, above and below [L] (the dark
 * speckled ovals of 009, 010, 049). Carpus short and stout; propodus parallel-sided; dactylus lanceolate, tapering
 * to a sharp tip (009, 068) [P][L].
 *
 * base: coxa socket (x, y, z) on the ventrolateral edge; yawDeg: bind direction in the horizontal plane measured
 * from the lateral axis toward the front (009: P2 points forward, P5 back) [P]. roll: the leg's twist about its
 * long axis (the anterior edge turned a little up, 049, 063) [P].
 */
export const LEGS = [
  { name: 1, pereiopod: 'P2', base: [0.32, 0.09, 0.15], yawDeg: 50, coxa: 0.05, basis: 0.05, ischium: 0.045, merus: 0.48, carpus: 0.19, propodus: 0.25, dactylus: 0.27,
    merusB: 0.135, merusD: 0.08, carpusB: 0.095, carpusD: 0.066, propB: 0.08, propD: 0.056, dacB: 0.055, dacD: 0.044, roll: 0.2 },
  { name: 2, pereiopod: 'P3', base: [0.36, 0.085, 0.02], yawDeg: 17, coxa: 0.05, basis: 0.05, ischium: 0.045, merus: 0.52, carpus: 0.2, propodus: 0.26, dactylus: 0.28,
    merusB: 0.14, merusD: 0.082, carpusB: 0.098, carpusD: 0.068, propB: 0.082, propD: 0.058, dacB: 0.056, dacD: 0.045, roll: 0.18 },
  { name: 3, pereiopod: 'P4', base: [0.35, 0.085, -0.12], yawDeg: -15, coxa: 0.05, basis: 0.048, ischium: 0.044, merus: 0.48, carpus: 0.19, propodus: 0.25, dactylus: 0.26,
    merusB: 0.135, merusD: 0.08, carpusB: 0.095, carpusD: 0.066, propB: 0.08, propD: 0.056, dacB: 0.055, dacD: 0.044, roll: 0.15 },
  { name: 4, pereiopod: 'P5', base: [0.29, 0.09, -0.24], yawDeg: -50, coxa: 0.045, basis: 0.045, ischium: 0.04, merus: 0.38, carpus: 0.15, propodus: 0.2, dactylus: 0.22,
    merusB: 0.12, merusD: 0.072, carpusB: 0.085, carpusD: 0.056, propB: 0.072, propD: 0.048, dacB: 0.05, dacD: 0.04, roll: 0.1 },
];

/** natural standing stance (degrees in the limb plane) used for the rest pose and as the IK's preferred shape [P] */
export const STANCE = {
  /**
   * sternum height above the ground: calm, alert (raised on the legs), feeding crouch, and the waving display.
   * Resting and feeding, the crab sits low — sternum and folded chelae nearly on the sand (063, 027, 035, 019);
   * walking it rises a little (040, 044, 068); waving it stands up on its legs (6.webp) [P]
   */
  bodyHeight: { calm: 0.09, alert: 0.2, feed: 0.05, hide: 0.03, display: 0.42 },
  /** the dactylus meets the sand steeply: walking on the tips (027, 063) [P] */
  dactylDeg: -72,
  /**
   * foot radius from the coxa socket in the ground plane, per leg: at the calm height the merus rises only
   * ~15–20° from the body, so the knee sits at the height of the carapace's side, not above the dome, and the
   * carpus, propodus and dactylus drop steeply to the sand (063, 027, 019) — not a spider's high knees [P]
   */
  footReach: [1.03, 1.09, 1.02, 0.83],
};

/** abdomen: male narrow (006), female broad and rounded (062); folded tight under the sternum [P][L] */
export const ABDOMEN = {
  /** male: a narrow plate about a fifth of the body wide, tapering to a rounded telson (3.webp, 006) */
  male: { width0: 0.26, width1: 0.22, length: 0.42 },
  female: { width0: 0.52, width1: 0.46, length: 0.44 },
  z0: -0.36,
};

/** size: carapace width (mm). Max ≈ 10 mm (males), ≈ 8 mm (females) (Wada 1981); lab adults 8 ± 1 mm (Sassa & Watabe 2008) [L] */
export const SIZE = { meanCW_mm: 8.0, sdCW_mm: 1.2, minCW_mm: 3.5, maxCW_mm: 10.5, maleMax_mm: 10.5, femaleMax_mm: 8.5 };

/**
 * pellets relative to CW [P] (plates 016, 017, 036, the burrow photo; 5.webp: field pellets a third of the carapace
 * wide, round, the sand itself): feeding pellets round, excavation lumps larger
 */
export const PELLET = { feedDiam: [0.24, 0.36], digDiam: [0.36, 0.62] };

/** burrow entrance diameter relative to the owner's CW [P][R] */
export const BURROW = { entranceDiam: [0.8, 1.0], shaftSlantDeg: [20, 45] };

/** Total length of a leg (CW) */
export function legLength(L) {
  return L.coxa + L.basis + L.ischium + L.merus + L.carpus + L.propodus + L.dactylus;
}
