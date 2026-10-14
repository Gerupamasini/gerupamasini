// Species constants shared by the model builder (tools/) and the viewer (src/): single source of truth for
// sizes and landmark positions along the body that the pose model, shaders and contact solver need.
//
// ヒメハゼ Favonigobius gymnauchen (Bleeker, 1860), adult. Fish space is millimetres from the snout tip.
// Proportions are in %SL from the reference-photo morphometry (specimens 004/005, 022, 025/031, 026 with
// rulers/colour cards; live fish 003, 007, 028, 029, 057, 067, 069, 070) — see README "Morphometry".

export const SPECIES = {
  scientificName: 'Favonigobius gymnauchen (Bleeker, 1860)',
  japaneseName: 'ヒメハゼ',
  englishName: 'sharp-nosed sand goby',
};

export const SL_MM = 43.0;           // standard length (specimen A: 38.9 mm; photo set 38–47 mm SL)
const pct = (p) => (p * SL_MM) / 100;
export const TL_MM = pct(123);       // rounded caudal: TL/SL 1.20–1.25 (mean 1.22; live fish 1.25)

// Axial chain (joint name, s in mm). Head joint just behind the skull, root at the pelvic girdle,
// then evenly to the hypural plate (caudal base = SL) and into the caudal fin.
export const SPINE = [
  ['J_head', pct(21)], ['J_root', pct(28.5)], ['J_sp1', pct(37)], ['J_sp2', pct(46)], ['J_sp3', pct(55)], ['J_sp4', pct(64)],
  ['J_sp5', pct(73)], ['J_sp6', pct(82)], ['J_sp7', pct(91)], ['J_caudal', pct(100)], ['J_caudal2', pct(110)],
];

// turning C-bend pivots about the pelvic disc (fraction of TL)
export const SPINE_PIVOT_X = pct(28.5) / TL_MM;

// Vertebral column: Gobiidae typically 10 + 16 = 26 (R: family value; F. gymnauchen count not found)
export const VERT_START = pct(22.5);
export const VERT_COUNT = 26;
export const SPINE_END = pct(99);    // last centrum (urostyle) just before the caudal base

// Landmarks used by the volumetric shader (mm)
export const LANDMARKS = {
  headEnd: [pct(19.5), pct(25)],     // skull/gill region fades out between these
  gill: [pct(15.5), pct(19), pct(22), pct(24.5)], // gill filaments under the cover: rise, rise, fall, fall
  anus: pct(53),                     // vent ~52–55 %SL (photo 005)
  gut: [pct(39), pct(13.5)],         // abdominal cavity centre s and half-length (pectoral girdle → vent)
};

// Optical tissue constants for the volumetric body shader: scattering (1/mm) and absorption (1/mm, rgb).
// ヒメハゼ adults are pale, translucent straw-tan (warmer and less milky than the juvenile マハゼ) [P 025/031/041/069]
// The abdomen is opaque white (silvery-white peritoneum: no gut outline visible in any photo) [P colour report §2.5]
export const TISSUE = { sigS: 0.75, sigA: [0.016, 0.03, 0.07], peritoneum: [0.15, 9.0] }; // clearer, less yellow (live photo 2026-10)

// Points that can touch the sand (bone, s mm, kind) — y is resolved from the profile by the builder.
export const CONTACT_S = {
  pelvicRim: [pct(28.5), pct(33), pct(37.5)],
  belly: [['J_root', pct(35)], ['J_sp1', pct(42)], ['J_sp2', pct(50)], ['J_sp3', pct(59)], ['J_sp4', pct(68)], ['J_sp5', pct(77)], ['J_sp6', pct(86)]],
  tail: pct(112),
};

// soft shadow capsule chain along the spine (bone, s mm)
export const SHADOW_CHAIN = [['J_head', pct(6)], ['J_head', pct(17)], ['J_root', pct(29)], ['J_sp1', pct(38)], ['J_sp3', pct(57)], ['J_sp5', pct(75)], ['J_sp7', pct(92)], ['J_caudal2', pct(110)]];

// object-space Z (m) of the turning pivots: pelvic disc when perched, centre of mass (~35 %TL) when swimming
export const S0_MM = 26.0; // object origin along the axis (must match tools/himehaze/anatomy.mjs S0)
export const PIVOTS_Z = { perch: (S0_MM - pct(28.5)) * 0.001, swim: (S0_MM - 0.35 * TL_MM) * 0.001 };

export { pct };
