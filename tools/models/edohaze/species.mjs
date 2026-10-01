// Species identity and viewer metadata for the adult エドハゼ build.
import { SL, TL, section } from './anatomy.mjs';

export const SPECIES = {
  key: 'edohaze',
  file: 'edohaze.glb',
  prefix: 'Edohaze',
  rootName: 'Edohaze_Adult',
  generator: 'edohaze-procedural-builder',
  scientific: 'Gymnogobius macrognathos (Bleeker, 1860)',
  commonName: 'エドハゼ, adult',
  pelvicBaseS: 11.6,
  // lower caudal lobe margin at rest: 1.92 mm below the caudal-base centre (principal-ray bases ±1.3 mm)
  tailContact: [SL + 4.4, section(SL - 0.1).yc - 2.9, 0], // lowest point of the lower caudal lobe at rest
  pigmentPNG: true,
  animations: 'Idle (loop, breathing), Swim (loop, 9 Hz burst tail beat), Yawn (one-shot)',
  viewer: {
    title: 'エドハゼ（全長 約45mm）',
    subtitle: 'Gymnogobius macrognathos — adult',
    // ground contacts (bone, s mm, y mm | 'rim' = pelvic sucker rim | 'bot' = belly line | 'tail' = lower caudal lobe)
    contacts: [
      ['J_pelvic', 12.5, 'rim'], ['J_pelvic', 14.2, 'rim'], ['J_pelvic', 15.8, 'rim'],
      ['J_root', 14.6, 'bot'], ['J_sp1', 17.0, 'bot'], ['J_sp2', 20.4, 'bot'], ['J_sp3', 24.0, 'bot'],
      ['J_sp4', 27.6, 'bot'], ['J_sp5', 31.2, 'bot'], ['J_sp6', 34.6, 'bot'], ['J_caudal2', SL + 4.4, 'tail'],
      // erect anal fin (lowest point at rest): the fish rests on it instead of pressing it into the sand (015)
      ['J_sp5', 29.7, -1.5],
    ],
    totalLengthM: TL / 1000,
    // the camera presets were authored for the 50 mm マハゼ; keeping them shows the adult エドハゼ (4–6 cm,
    // RDB) at its true size, about 10 % shorter than the juvenile マハゼ
    presetScale: 1.0,
    // edge-on fins: hyaline lines in the dorsal photos, not bright white strips; folded or edge-on fins are
    // invisible or faint from above (029, 025, 065: ≤ 1.05× their surroundings), membranes alpha 0.15–0.3
    finGrazeMin: 0.3,
    finEdge: [0.03, 0.3, 1],
    finOpCap: [0.12, 0.3, 0.75],
    // soft floor shadow along the spine (bone, s mm)
    shadowChain: [['J_head', 2.5], ['J_head', 7.2], ['J_root', 12.0], ['J_sp1', 15.5], ['J_sp3', 22.5], ['J_sp5', 29.8], ['J_sp7', 36.4], ['J_caudal2', SL + 4.4]],
    // dark shadow core: vertebral column (y = yc + 0.06 t) and the viscera block
    coreChain: [['J_root', 10.4, 3.22, 0.3], ['J_sp1', 16.5, 3.42, 0.27], ['J_sp3', 23.5, 3.42, 0.23], ['J_sp5', 30.5, 3.02, 0.18], ['J_sp7', 37.0, 2.63, 0.15],
      ['J_root', 13.0, 1.5, 1.15], ['J_sp2', 20.6, 1.45, 1.0]],
  },
  // eye shader: cyan-green guanine ring around the pupil and a cooler grazing sheen (photos 004, 028, 054, 055);
  // a deep navy pupil (059 [12–15,23–25,47–73], B−R 35–60) with a teal eyeshine in its lower half (054
  // [4,52,75], spec median [48,92,101]) and only a pin-point highlight, not a mirror ball
  eye: {
    sheen: [0.03, 0.1, 0.1], ring: [0.05, 0.085, 0.085, 0.06],
    pupil: [0.004, 0.01, 0.045], shine: [0.02, 0.11, 0.15, 1], pupilEnvCut: 0.75, lensRough: 0.025,
  },
  // Internal anatomy for the volumetric body shader (fish mm). Placed between the pectoral girdle
  // (11.2 mm) and the anus (24.65 mm); spine height from the loft (yc + 0.06·t ≈ 3.2–3.5 mm).
  // Lateral photos show a white, opaque peritoneum over the gut (silvery belly) and dorsal photos a
  // dark visceral mass seen through the back (melanin on the dorsal peritoneum).
  shaderAnatomy: {
    headWin: [7.7, 10.05],
    // gills show pink-red through the thin opercle (059 lower opercle [142–159,112–128,104–117], 016, 025),
    // over s 7.6–9.9 and y 0.6–3.3 mm, ending with the opercle margin (head length 0.265 SL)
    gillWin: [6.3, 7.6, 9.0, 9.9],
    gillK: [0.025, 0.38, 0.32],
    gillHn: [-1.15, -0.95, 0.0, 0.35],
    // yellow-green gold iridescent patch on the upper opercle only (059, 044: [150,144,120]), never a
    // milky disc: weak gain, tint above y 2.6 mm, half the wet specular over the gill cover
    opercTint: [0.6, 0.65, 0.36, 0.4],
    opercWin: [0.6, 2.4, 2.8, 0.5],
    haemal: [24.8, 26.6],
    // cavity centre 0.62·b below the section centre so the peritoneal shell stays under the column; it ends
    // at 24.0 mm (s 0.63) in a sharp, rounded hind wall (042, 058, 044: edge 0.02–0.03 SL wide), with a dusky
    // melanised roof (midline band 0.72–0.85× the flank behind it) over an opaque silvery-white gut
    abdomen: [17.5, 0.62, 6.5, 1.15],
    gut: [0.9, 2.5, 1.0],
    peri: [2.6, 2.6, 2.6, 0.12],
    // posterior axial melanophores read as thin hairlines, not a smear (042, 058)
    melRows: [0.9, 0.8],
    spineK: [0.7, 0.75, 0.85],
    septK: 0.8,
    // satin sheen broken up by the scales; no continuous highlight along the tail (042, 013, 059)
    film: [0.15, 0.2, 0.25],
    spine: [3.3, SL - 0.4, 0.4],
    // long oblique jaw: rictus 2.85 mm, maxilla to 3.6 mm, gape 2.17 → 1.27 mm
    jaw: [2.6, 4.0, 2.3, 3.0],
    // pale, less amber tissue than the juvenile マハゼ (lower blue absorption)
    sigS: 1.0,
    sigA: [0.02, 0.04, 0.085],
    organs: [
      { name: 'liver', c: [12.9, 1.45, 0.2], r: [1.8, 1.0, 1.65], k: [1.3, 2.3, 2.9] },
      { name: 'stomach + gut', c: [19.0, 1.35, -0.1], r: [4.3, 0.95, 1.25], k: [1.0, 1.4, 2.3] },
      { name: 'dark peritoneum roof', c: [17.9, 2.45, 0.0], r: [6.2, 0.28, 1.6], k: [4.2, 4.4, 4.6] },
      { name: 'kidney', c: [18.0, 2.95, 0.0], r: [6.6, 0.2, 0.3], k: [0.8, 2.6, 2.6] },
      { name: 'heart', c: [9.3, 0.85, 0.0], r: [0.62, 0.45, 0.55], k: [0.5, 4.0, 3.6] },
      { name: 'brain', c: [5.3, 4.1, 0.0], r: [2.1, 0.7, 0.72], k: [0.15, 0.2, 0.3] },
      { name: 'otolith L', c: [6.9, 3.45, 0.72], r: [0.3, 0.19, 0.1], k: [6.0, 6.0, 6.0] },
      { name: 'otolith R', c: [6.9, 3.45, -0.72], r: [0.3, 0.19, 0.1], k: [6.0, 6.0, 6.0] },
    ],
  },
};
