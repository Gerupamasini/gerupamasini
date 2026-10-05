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
  /** the front margin stands this much higher than the lateral margin (front views 2.webp, 4.webp, 001–005) [P] */
  frontRise: 0.2,
  /** z of the widest point (slightly behind the middle, 009) [P] */
  widestZ: -0.05,
  /** posterior margin half-width (straight, 009: 140 px of 280) [P] */
  posteriorHalf: 0.25,
  /** half-width at the external orbital angles (009, 002) [P] */
  orbitalAngleHalf: 0.39,
  /** the front between the orbits: narrow, deflexed, a median groove [P][R] */
  frontHalf: 0.065,
  /** eyestalk base centre: x (002: centres 0.29 CW apart at the base, but the sockets open at ±0.11), y, z [P] */
  eyeBase: [0.11, 0.53, 0.395],
  /** sternum ventral face is y = 0; the branchiostegite wall meets it at about this inset [R] */
  ventralInset: 0.86,
};

/**
 * Eyestalks (erect in 003–005, 027, 035, 063; folded obliquely along the orbit in 001, 007–009).
 * Long, slender, translucent with white chromatophores; terminal cornea dark brown with gold flecks (013). [P]
 */
export const EYE = {
  /** basal article */
  baseLen: 0.05, baseR: 0.03,
  /** stalk proper: stout, slightly club-shaped — about 0.07 CW thick in 2.webp and 4.webp (013) [P] */
  stalkLen: 0.2, stalkR0: 0.03, stalkR1: 0.033,
  /** terminal cornea: a dark oval window over the front of the tip, a little swollen (2.webp, 4.webp, 013) [P] */
  corneaLen: 0.095, corneaR: 0.037,
  /** erect pose: leaning out and a little forward from vertical (degrees) [P] */
  erectOutDeg: 14, erectForwardDeg: 10,
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
  width: 0.24, height: 0.34, thick: 0.065,
  /** hinge (outer margin) position: x, y, z (body frame) */
  hinge: [0.24, 0.245, 0.43],
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
  base: [0.22, 0.13, 0.32], yawDeg: 30, pitchDeg: -20,
  coxa: 0.055, basis: 0.05, ischium: 0.045,
  merus: 0.34, merusH: 0.15, merusW: 0.09,
  carpus: 0.25, carpusR: 0.055,
  /** palm: a broad, laterally compressed oval (2.webp, 4.webp, 003–005); fingers a little shorter than the palm */
  palm: 0.29, palmH: 0.23, palmW: 0.095,
  finger: 0.2, fingerH: 0.08, fingerW: 0.04,
  dactylus: 0.215,
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
 * Lengths re-measured on the flat dorsal specimen (007: CW 258 px; meri of P3/P4 ≈ 150 px long, 50 px tall with
 * their translucent margins and setae — the opaque face ≈ 0.16 CW, as in 009 and 063 and the live front views;
 * dactyli ≈ 90 px) and the waving male (6.webp, CW ≈ 270 px, P2 merus ≈ 160 px): P2 ≈ 1.4, P3 ≈ 1.5, P4 ≈ 1.4,
 * P5 ≈ 1.1 CW — legs clearly longer than the carapace is wide [P][L].
 *
 * base: coxa socket (x, y, z) on the ventrolateral edge; yawDeg: bind direction in the horizontal plane measured
 * from the lateral axis toward the front (009: P2 points forward, P5 back) [P]. merusW = height of the merus'
 * broad face, merusT = its thickness. roll: the leg's twist about its long axis (anterior face turned a little
 * upward, as in 016, 027, 063) [P].
 */
export const LEGS = [
  { name: 1, pereiopod: 'P2', base: [0.33, 0.1, 0.15], yawDeg: 50, coxa: 0.055, basis: 0.055, ischium: 0.05, merus: 0.5, carpus: 0.2, propodus: 0.27, dactylus: 0.27, merusW: 0.16, merusT: 0.058, roll: 0.3 },
  { name: 2, pereiopod: 'P3', base: [0.37, 0.095, 0.02], yawDeg: 17, coxa: 0.055, basis: 0.055, ischium: 0.05, merus: 0.55, carpus: 0.21, propodus: 0.28, dactylus: 0.28, merusW: 0.165, merusT: 0.06, roll: 0.25 },
  { name: 3, pereiopod: 'P4', base: [0.36, 0.095, -0.12], yawDeg: -15, coxa: 0.055, basis: 0.05, ischium: 0.048, merus: 0.5, carpus: 0.2, propodus: 0.26, dactylus: 0.26, merusW: 0.155, merusT: 0.058, roll: 0.2 },
  { name: 4, pereiopod: 'P5', base: [0.3, 0.1, -0.24], yawDeg: -50, coxa: 0.05, basis: 0.048, ischium: 0.044, merus: 0.38, carpus: 0.16, propodus: 0.21, dactylus: 0.22, merusW: 0.135, merusT: 0.052, roll: 0.15 },
];

/** natural standing stance (degrees in the limb plane) used for the rest pose and as the IK's preferred shape [P] */
export const STANCE = {
  /**
   * sternum height above the ground: calm, alert (raised on the legs), feeding crouch, and the waving display —
   * up on the tips of nearly straight legs, the sternum ~0.8 CW above the sand (6.webp) [P][R]
   */
  bodyHeight: { calm: 0.18, alert: 0.34, feed: 0.12, hide: 0.05, display: 0.72 },
  /** the dactylus meets the sand steeply: walking on the tips (027, 063) [P] */
  dactylDeg: -72,
  /**
   * foot radius from the coxa socket in the ground plane, per leg: at the calm height the knee (merus–carpus)
   * is bent to ~102° inside and the merus rises ~30° from the body, so the knee is the highest point of the leg
   * (027, 035, 063, 2.webp, 4.webp). Tip-to-tip span of the third legs ≈ 2.7 CW (2.webp ≈ 2.8) [P]
   */
  footReach: [0.97, 1.03, 0.95, 0.76],
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
