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
  /** carapace length / width; plates 007–009 (dorsal, flattened specimens): 0.82–0.88 (009: 237 / 292 px) [P] */
  lengthRatio: 0.82,
  /**
   * total body height, sternum to the top of the dome: the live crab seen from the ground (063, 027, 035) is a
   * low, broad dome — 0.44–0.56 CW tall (SHAPE_AUDIT.md) [P]
   */
  height: 0.5,
  /** height of the lateral margin above the sternum face: the sides curve down well below the dome [P] */
  marginY: 0.27,
  /**
   * the front margin (the orbits) stands this much higher than the lateral margin: seen from the ground in front
   * the front is nearly the top of the body — the front lobe 0.46 and the orbits 0.42 above the sternum, the dome
   * only 0.04 higher behind them (063: CW 317 px; 027) [P]
   */
  frontRise: 0.17,
  /** z of the widest point (slightly behind the middle, 009) [P] */
  widestZ: -0.12,
  /** posterior margin half-width (straight, 009: 140 px of 280) [P] */
  posteriorHalf: 0.25,
  /** half-width at the external orbital angles (009, 002) [P] */
  orbitalAngleHalf: 0.39,
  /** the front between the orbits: narrow, deflexed, a median groove [P][R] */
  frontHalf: 0.065,
  /**
   * eyestalk base centre: x, y, z — the stalks stand 0.24–0.28 CW apart (063: 0.235, 027: 0.28, measured with the
   * body height as the scale) [P]
   */
  eyeBase: [0.125, 0.4, 0.36],
  /** sternum ventral face is y = 0; the branchiostegite wall meets it at about this inset [R] */
  ventralInset: 0.88,
};

/**
 * Eyestalks (erect in 003–005, 027, 035, 063; folded obliquely along the orbit in 001, 007–009).
 * Long, slender, translucent with white chromatophores; terminal cornea dark brown with gold flecks (013). [P]
 */
export const EYE = {
  /** basal article, sunk in the orbit */
  baseLen: 0.035, baseR: 0.026,
  /**
   * stalk proper: 0.052 CW at its neck out of the orbit, thickening a little upward to 0.068 under the cornea;
   * 0.19–0.21 CW visible above the front margin, the corneas' tops 0.61–0.63 above the sternum (0.12 above the
   * dome). Measured with the body height and the third maxillipeds as the scale (063: CW 317 px — stalk 20–22 px,
   * cornea 30 px; 027: CW 285 px — stalk 20 px, cornea 28 px; 013 for the shape) [P]
   */
  stalkLen: 0.135, stalkR0: 0.026, stalkR1: 0.034,
  /**
   * terminal cornea: an ovoid bulb about 1.5 × the stalk below it, 0.1 CW across (063: 0.095–0.1, 027: 0.098); the
   * dark window on its outer and front side, the clear cuticle wrapping round behind it (013) [P]
   */
  corneaLen: 0.09, corneaR: 0.051,
  /** erect pose: nearly upright — the stalks stand parallel, corneas 0.24–0.28 CW apart (063, 027) [P] */
  erectOutDeg: 2, erectForwardDeg: 8,
  /** folded pose: lying laterally along the orbital margin (001, 009) [P] */
  foldOutDeg: 72, foldForwardDeg: -8,
};

/**
 * third maxillipeds: two large opercular plates closing the whole buccal frame — the most conspicuous thing in the
 * face (002–005, 2.webp, 4.webp, 063) — but thin lids, only gently arched, their margins thin and nearly flush with
 * the face around them (063, 027 seen from the side of the face); merus a little smaller than the ischium, an
 * oblique suture between them, outer surface with rounded tubercles [L] (Wong et al. 2010)
 */
export const MXP3 = {
  /**
   * each plate: width (from the hinge to a hair past the midline: closed, the pair overlaps a little; 063: the pair
   * 0.5 CW across, 0.38 tall, a rounded rectangle each), height (ischium + merus), arch (the lid's rise above its
   * margins). In the front views (2.webp, 4.webp) the
   * pair fills the face from just under the eyestalk bases to the sternum, about 1.5 × as wide as tall (2.webp,
   * plates 003–005) [P]
   */
  width: 0.25, height: 0.41, thick: 0.026,
  /** hinge (outer margin) position: x, y, z (body frame); the plates reach up to just under the front (063) */
  hinge: [0.24, 0.2, 0.41],
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
  base: [0.21, 0.11, 0.285], yawDeg: 30, pitchDeg: -20,
  coxa: 0.045, basis: 0.04, ischium: 0.04,
  /** merus and carpus slender: the live crab's arm is a thin rod beside the face, not a block (063, 027, 049) [P] */
  merus: 0.26, merusH: 0.11, merusW: 0.07,
  /**
   * carpus: a big rounded knob lying across above the palm in the folded chela, its top level with the front margin
   * (063: 0.23 CW across, 0.22 tall; 027, 002); carpusR is its greatest half-depth [P]
   */
  carpus: 0.17, carpusR: 0.094,
  /**
   * palm: deep (height ≈ 0.85 × length), laterally compressed — a plate, not a ball (011, 003); fingers a little
   * shorter than the palm, slender (011). These are a female's / small male's (027, 035, 057); large males are
   * 1.2 × (002–005, 061; 063: 0.32 × 0.28 CW) [P]
   */
  palm: 0.25, palmH: 0.215, palmW: 0.055,
  /**
   * fingers about two thirds of the palm (002, 003: 0.55–0.65; 011 seen from the side: 0.75), deep at their base
   * and tapering to sharp amber tips, the gape a narrow dark slit between them (002–004, 011) [P]
   */
  finger: 0.155, fingerH: 0.052, fingerW: 0.024,
  dactylus: 0.165,
  /** females: whole limb ≈ 1.6 CL; mature males > 2 CL [L] */
  maleScale: 1.2,
};

/**
 * Walking legs P2–P5 (Leg_*1 … Leg_*4). Long, banded; legs 1 and 2 (P2, P3) longest and about equal, leg 4 (P5)
 * shortest [L]. Lengths from the flat dorsal specimens 007 (CW 256 px) and 009 (CW 266 px): merus ≈ 0.5, carpus
 * ≈ 0.21, propodus ≈ 0.23, dactylus ≈ 0.33 — the dactylus LONGER than the propodus, a long slim spike (P2–P4) [P].
 *
 * Cross-sections: flat blades, not rods. On the living crab the BROAD face is seen from above and the thin edge
 * from the front: bone-local Z (forward / back, horizontal in the bind pose) carries the broad width `*B`, Y (dorsal,
 * in the flexion plane) the depth `*D`, about a third of it. Breadths with the clear margins, from 009 (CW 290 px)
 * and 007: merus a leaf 0.1 at its base, 0.16 just before the middle, 0.06 at the knee; carpus a club 0.045 → 0.1;
 * propodus an oval 0.09 in its proximal third → 0.045; dactylus 0.055 at its base to a needle point. Every segment
 * necked to 0.045–0.06 at its joints. Depth ≈ 0.06 (merus) → 0.03 (dactylus); with the roll that is the 0.12–0.13
 * the meri and carpi show from the front in 063 [P]. Each merus has one undivided oval tympanum covering most of
 * its broad face, above and below [L] (the dark speckled ovals of 009, 010, 049).
 *
 * base: coxa socket (x, y, z) on the ventrolateral edge; yawDeg: bind direction in the horizontal plane measured
 * from the lateral axis toward the front (009: P2 points forward, P5 back) [P]. roll: the leg's twist about its
 * long axis, the dorsal face tilted forward (the anterior margin down): most on the first leg (29°), least on the
 * last (9°). With a depth of a little over a third of the breadth the meri then show 0.15–0.16 CW from above
 * (009, 057) and 0.12–0.13 from the front (063) — both measured with the silhouette fits of SHAPE_AUDIT.md 7 [P].
 */
export const LEGS = [
  { name: 1, pereiopod: 'P2', base: [0.32, 0.09, 0.16], yawDeg: 56, coxa: 0.05, basis: 0.048, ischium: 0.042, merus: 0.47, carpus: 0.2, propodus: 0.23, dactylus: 0.31,
    merusB: 0.16, merusD: 0.058, carpusB: 0.1, carpusD: 0.044, propB: 0.09, propD: 0.037, dacB: 0.064, dacD: 0.03, roll: 0.5 },
  { name: 2, pereiopod: 'P3', base: [0.36, 0.085, 0.03], yawDeg: 22, coxa: 0.05, basis: 0.048, ischium: 0.042, merus: 0.51, carpus: 0.21, propodus: 0.24, dactylus: 0.33,
    merusB: 0.165, merusD: 0.06, carpusB: 0.102, carpusD: 0.045, propB: 0.092, propD: 0.038, dacB: 0.066, dacD: 0.031, roll: 0.35 },
  { name: 3, pereiopod: 'P4', base: [0.35, 0.085, -0.12], yawDeg: -14, coxa: 0.05, basis: 0.046, ischium: 0.041, merus: 0.47, carpus: 0.2, propodus: 0.23, dactylus: 0.31,
    merusB: 0.16, merusD: 0.058, carpusB: 0.1, carpusD: 0.044, propB: 0.09, propD: 0.037, dacB: 0.064, dacD: 0.03, roll: 0.25 },
  { name: 4, pereiopod: 'P5', base: [0.29, 0.09, -0.24], yawDeg: -44, coxa: 0.045, basis: 0.042, ischium: 0.038, merus: 0.37, carpus: 0.16, propodus: 0.19, dactylus: 0.26,
    merusB: 0.14, merusD: 0.052, carpusB: 0.088, carpusD: 0.04, propB: 0.08, propD: 0.034, dacB: 0.058, dacD: 0.028, roll: 0.15 },
];

/** natural standing stance (degrees in the limb plane) used for the rest pose and as the IK's preferred shape [P] */
export const STANCE = {
  /**
   * sternum height above the ground: calm, alert (raised on the legs), feeding crouch, and the waving display.
   * Resting and feeding, the crab sits low — sternum and folded chelae nearly on the sand (063, 027, 035, 019);
   * walking it rises a little (040, 044, 068); waving it stands up on its legs (6.webp) [P]
   */
  bodyHeight: { calm: 0.09, alert: 0.2, feed: 0.05, hide: 0.03, display: 0.42 },
  /** the dactylus meets the sand steeply, the curved spike's point in the sand (063: 65–75°; 027, 068) [P] */
  dactylDeg: -66,
  /**
   * foot radius from the coxa socket in the ground plane, per leg. At the calm height that sets the merus rising
   * about 35° (063: P2's knee 0.48 CW above the sand, under the top of the dome) and the knee bent to ~110°, the
   * carpus and propodus dropping at ~35° and the dactylus steeply to the sand — the feet within about 1.3 CW of the
   * body's centre (063, 016, 057), not sprawled out at the end of long, nearly straight legs like a spider's [P]
   */
  footReach: [0.98, 1.02, 0.96, 0.8],
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
