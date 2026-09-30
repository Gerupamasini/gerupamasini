# Morphology from the reference photos (70-photo PDF, collected 2026-09-30)

The numbers are in `src/shrimp/morphology.js` (TL units, with photo IDs).
The photos themselves are **not** in the repo, because the PDF grants no redistribution rights.

## Method
- Photos were measured on pixel grids, with a common scale bar from the cornea diameter (0.033 TL).
  - Lateral: 001, 002, 014
  - Dorsal: 005–007 (rotated so the body axis is horizontal)
- The validation harness `validation/` renders the rest pose orthographically.
  The model silhouette is overlaid on photo 001 with a 2-point similarity transform, anchored on the eye and the posterior carapace margin.
  - Current residuals: s3 hump 14 px, telson tip 21 px, rostrum tip 13 px. At about 1100 px per TL this is 1–2% of TL.

## Decisions
- **Rostrum: 0.25 TL ahead of the eye (1.3–1.4 CL).**
  - Supported by the literature ("rostrum 1.6–1.7× carapace, overreaching antennal scale by anterior 0.4"; NIBR Invertebrate Fauna of Korea 21) and by live photos 002 and 005–007.
  - Parallel photo analysts reported 0.7–0.8 CL. That came from dead specimen 014 and from missing the very thin distal tip in 001, so I rejected it.
- **Resting posture from 001.** s1 rises about 26° above the carapace. The hump peaks at s3, and the abdomen bends sharply at s3/s4. The tail fan is inclined about 35°.
- **Eyes stand far out laterally.** The stalk points about 80° from forward, with cornea centres at ±0.078 TL.
- **Colour.** The live body is milky grey, not glass: about #7a807c over a dark background and #9b8f6a over white.
  - Chromatophores are red-brown dots, denser in bands at the posterior margin of each somite, in a line along the side of the carapace, on the eyestalks, along the scaphocerite margin and on the rostrum edges.
  - There is a dark mark at each uropod base.
- **Other features:**
  - Pleopods are broad milky paddles.
  - P2 is the longest cheliped, with fingers slightly longer than the palm.
  - The long upper ramus of the antennule is bluish (048).
