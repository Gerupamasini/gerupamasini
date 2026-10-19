// トビハゼ (Periophthalmus modestus) anatomy: the measured proportions every part of the build reads.
//
// Sources (docs/models/tobihaze/README.md): pixel landmarks on the reference photos (lateral A030, A070, B008, B010,
// B012, B067; frontal B002/A010, B003, B070; dorsal B049–B051, A036), cross-checked between the views, and Murdy
// (1989) for the head width. Lengths are in mm for a TL 80 mm adult; the head is laid out in head lengths (HL).
//
// Fish frame (mm): s = distance back from the snout tip along the body axis, y = up from the flat underside of the
// head, z = to the fish's left. Object frame (metres, as the other gobies' GLBs): +Z anterior, +Y dorsal, +X left;
// toObject() converts.

export const TL = 80;                 // total length (mm)
export const SL = TL / 1.19;          // standard length: caudal fin 0.19 SL
export const HL = 0.24 * SL;          // head length: snout tip to the opercle edge

/** Head proportions in HL (the consensus of the photo measurements). */
export const HEAD = {
  depthNape: 0.63,        // dorsal profile just behind the eyes (eyes excluded)
  width: 0.70,            // at the cheeks, relaxed (0.80–0.85 inflated)
  widestS: 0.62,          // where the cheeks bulge most
  widestY: 0.27,
  snoutTipY: 0.24,        // the snout's most anterior point, above the flat underside
  faceAngle: 70,          // the face front rises at about 70° from the snout to the eyes
  eye: {
    d: 0.207,             // globe diameter (ED): the bare globe, without the cup's rim
    s: 0.33,              // centre, back from the snout tip
    y: 0.640,             // centre height: on top of the skull, the lens ≈0.03 HL above the frontal arch (ZK 2024)
    z: 0.106,             // centres ≈1.02 ED apart, either side of the narrow frontal bridge (Michel 2014, Aiello 2023)
  },
  turretWidth: 0.34,      // the block the eyes sit on (0.48 W); the globes overhang it at the sides
  mouthCornerS: 0.31,     // the jaw's corner, under the front half of the eye
  lipLobeEndS: 0.39,      // the upper lip's fleshy lobe reaches back under the eye's rear third
  lipHeight: 0.08,        // the upper lip roll's height in profile
  gapeY: 0.07,            // the closed mouth's line above the underside (subterminal, level)
};

export const EYE_MM = {
  radius: (HEAD.eye.d * HL) / 2,
  center: [HEAD.eye.s * HL, HEAD.eye.y * HL, HEAD.eye.z * HL],
};

/** Pivot of the object frame: the fish frame's point that lands on the object origin. */
export const S0 = 0.5 * TL;
export const Y0 = 0.3 * HL;

export const toObject = ([s, y, z]) => [z * 0.001, (y - Y0) * 0.001, (S0 - s) * 0.001];
export const dirToObject = ([s, y, z]) => [z, y, -s];
