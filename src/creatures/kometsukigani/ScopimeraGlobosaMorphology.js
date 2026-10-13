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
 * third maxillipeds: two opercular plates closing the buccal frame (002–005, 2.webp, 4.webp, 063, 027, 035). Each
 * plate is a merus above — its top a rounded arch, a small V notch between the two arches on the midline — and an
 * ischium below a transverse suture just above the middle; thin plates, the merus gently domed, the ischium flatter,
 * outer surface with rounded tubercles [L] (Wong et al. 2010). Outline: Geometry MXP_OUTLINE.
 */
export const MXP3 = {
  /**
   * each plate: width (lateral hinge to the midline), height (top of the merus' arch to the ischium's lower edge,
   * along the plate), dome height. 063 (CW 317 px): the pair 0.42 CW across and 0.33 tall seen from the front, from
   * 0.02 to 0.35 above the sternum, the suture at 0.19 and the notch between the arches from 0.29 up; 027 (CW 285
   * px): 0.40 × 0.32. Those heights are foreshortened by the lean (below): along the plate 0.33 / cos 33° ≈ 0.39,
   * the top just under the epistome, the arches level with the antennular fossae (b67, b68) [P]
   */
  width: 0.212, height: 0.39, thick: 0.03,
  /**
   * hinge (outer margin) position: x, y (the plate's mid-height), z (body frame) — just in front of the face
   * (Morphology FACE), the top at 0.35 above the sternum, the lower edge at 0.02 and 0.14 forward of the sternum
   */
  hinge: [0.21, 0.185, 0.25],
  /**
   * the plates' tilt from vertical, the top forward: the buccal frame faces forward and down, so they show 0.33 CW
   * of their length from the front (063) and 0.15–0.2 from below (b69, b30, b66) [P]
   */
  leanDeg: -33,
};

/**
 * Chelipeds: homochelous; finely granular; carpus elongate, slightly shorter than the merus; whole limb about
 * 2 × CL in mature males (Wong et al. 2010; Crabs of Japan) [L]. Palm moderately inflated with dark speckles,
 * fingers long, slender, porcelain white-blue with denticulate cutting edges, a triangular tooth on the movable
 * finger, a narrow gape, tips brownish and crossing (002–005, 011) [P][L]. A long oval tympanum on the inner face
 * of the merus [L].
 */
export const CHELIPED = {
  /**
   * coxa socket (body frame): at the sternum's anterolateral corner, just behind and beside the buccal frame (b69,
   * b30, b66); and the limb's bind direction (yaw from +Z toward the side, pitch down)
   */
  base: [0.245, 0.06, 0.05], yawDeg: 30, pitchDeg: -20,
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
 * base: coxa socket (x, y, z) in the coxal notches along the sternum's lateral margin (Morphology STERNUM): a close
 * row from just behind the cheliped's coxa (z −0.02) to the sternum's posterior corner (z −0.29), each coxa nearly
 * touching the next (b69, b66, b30 from below; 012, 2.webp). The proximal segments run out and forward (P2) or back
 * (P5) under the branchiostegites, so the meri leave the carapace's margin about 0.1 further forward or back
 * (008, 009 from above) [P]. yawDeg: bind direction in the horizontal plane measured from the lateral axis toward
 * the front (009, 008: P2 points forward, P3 a little forward, P4 a little back, P5 back) [P]. roll: the leg's twist about its
 * long axis, the dorsal face tilted forward (the anterior margin down): most on the first leg (29°), least on the
 * last (9°). With a depth of a little over a third of the breadth the meri then show 0.15–0.16 CW from above
 * (009, 057) and 0.12–0.13 from the front (063) — both measured with the silhouette fits of SHAPE_AUDIT.md 7 [P].
 */
export const LEGS = [
  { name: 1, pereiopod: 'P2', base: [0.29, 0.05, -0.02], yawDeg: 56, coxa: 0.05, basis: 0.048, ischium: 0.042, merus: 0.47, carpus: 0.2, propodus: 0.23, dactylus: 0.31,
    merusB: 0.16, merusD: 0.058, carpusB: 0.1, carpusD: 0.044, propB: 0.09, propD: 0.037, dacB: 0.064, dacD: 0.03, roll: 0.5 },
  { name: 2, pereiopod: 'P3', base: [0.32, 0.05, -0.115], yawDeg: 22, coxa: 0.05, basis: 0.048, ischium: 0.042, merus: 0.51, carpus: 0.21, propodus: 0.24, dactylus: 0.33,
    merusB: 0.165, merusD: 0.06, carpusB: 0.102, carpusD: 0.045, propB: 0.092, propD: 0.038, dacB: 0.066, dacD: 0.031, roll: 0.35 },
  { name: 3, pereiopod: 'P4', base: [0.325, 0.05, -0.205], yawDeg: -14, coxa: 0.05, basis: 0.046, ischium: 0.041, merus: 0.47, carpus: 0.2, propodus: 0.23, dactylus: 0.31,
    merusB: 0.16, merusD: 0.058, carpusB: 0.1, carpusD: 0.044, propB: 0.09, propD: 0.037, dacB: 0.064, dacD: 0.03, roll: 0.25 },
  { name: 4, pereiopod: 'P5', base: [0.29, 0.05, -0.29], yawDeg: -36, coxa: 0.045, basis: 0.042, ischium: 0.038, merus: 0.37, carpus: 0.16, propodus: 0.19, dactylus: 0.26,
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
  /**
   * the dactylus meets the sand nearly upright, the curved spike's point in the sand (063: vertical; 035, 027, 044:
   * 70–80°) [P]
   */
  dactylDeg: -72,
  /**
   * foot radius from the coxa socket in the ground plane, per leg. At the calm height that raises each merus about
   * 43° and puts the knees 0.56–0.58 CW above the sand, level with the top of the carapace and 0.6–0.8 CW out from
   * the midline, the knee bent to ~95°; carpus and propodus slope down at ~40° and the dactylus stands nearly
   * upright, the feet 1.2–1.25 CW out (P3). Measured on the ground-level front views 035 (knees 0.66–0.77 out, level
   * with the dome; P3's foot 1.46 out), 063 (P2's knee 0.52 up, 0.71 out; its foot 1.25 out), 027, 040 and 044 (knees
   * at or above the top of the carapace): the legs stand tall and close in, not sprawled like a spider's [P]
   */
  footReach: [0.92, 0.98, 0.92, 0.76],
};

/** abdomen: male narrow (006), female broad and rounded (062); folded tight under the sternum [P][L] */
export const ABDOMEN = {
  /**
   * male: a narrow strip lying in a trough along the midline of the sternum, from its posterior margin almost to its
   * front — the basal somites 1–2 broad across the posterior margin, somites 3–6 parallel-sided, the telson a
   * rounded tip (b30, b66, b69: 0.17–0.26 of the sternum's width; 062) [P]. widths at the base (somites 1–2), along
   * somites 3–6 and at the telson; somite lengths from the base forward (b30)
   */
  male: { baseWidth: 0.25, width: 0.15, telsonWidth: 0.12, somites: [0.035, 0.035, 0.06, 0.065, 0.07, 0.075], telson: 0.085 },
  /**
   * female: a broad rounded plate covering most of the sternum, its lateral margins nearly reaching the coxae, the
   * front rounded (b61, b39, 2.webp): widths at the base, the widest point (somites 4–5) and the telson
   */
  female: { baseWidth: 0.4, width: 0.56, telsonWidth: 0.2, somites: [0.03, 0.035, 0.06, 0.07, 0.075, 0.08], telson: 0.07 },
  /** the posterior margin of the abdomen (body z), at the sternum's posterior end [P] */
  z0: -0.385,
};

/**
 * The sternum (the body's underside), measured on the ventral views b69, b66 (specimens) and b30, b39, 2.webp (live
 * crabs on their backs), scaled by the third maxillipeds' width (0.42–0.45 CW, as in 063): a broad shield 0.66 CW
 * across between the coxae and 0.47 long, its front a straight edge behind the buccal frame (z 0.08), the cheliped
 * coxae at its anterolateral corners and the four walking legs' coxae in a close row along each side, the last at
 * the posterior corner [P]. Plan outline, left half, front midline round to the posterior midline.
 */
export const STERNUM = {
  outline: [
    [0, 0.08], [0.1, 0.08], [0.17, 0.076], [0.215, 0.064], [0.245, 0.04], [0.27, 0.005], [0.295, -0.04],
    [0.316, -0.09], [0.33, -0.15], [0.33, -0.2], [0.316, -0.25], [0.29, -0.3], [0.25, -0.34], [0.19, -0.37],
    [0.1, -0.386], [0, -0.39],
  ],
  /** height of its lateral margin above its centre: the plate is gently convex [P] */
  edgeY: 0.025,
  /**
   * sutures between the sternites: from beside the abdomen out to the gaps between the coxae, the anterior ones
   * nearly transverse, the posterior ones swept back (b30, b66: white lines on the live crab) [P]: [x, z] medial
   * end → lateral end
   */
  sutures: [
    [[0.085, 0.012], [0.262, 0.01]],
    [[0.085, -0.068], [0.305, -0.066]],
    [[0.085, -0.148], [0.33, -0.163]],
    [[0.085, -0.228], [0.318, -0.252]],
  ],
  /** the trough the male abdomen lies in: half-width, depth [P] */
  trough: [0.082, 0.012],
};

/**
 * The face in profile, on the midline: the deflexed front, the antennular fossae under it, the epistome, and the
 * buccal frame sloping down and back to the sternum's front — the third maxillipeds face forward and down (seen
 * from below they show 0.15–0.2 CW of their length, from the front 0.33: b69, b30, b66 against 063) [P].
 * [y, z] from the front margin down.
 */
export const FACE = [[0.44, 0.41], [0.4, 0.388], [0.36, 0.352], [0.33, 0.322], [0.02, 0.118], [0.0, 0.08]];

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
