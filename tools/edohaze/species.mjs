// Species identity and viewer metadata for the adult エドハゼ build.
import { SL, TL } from './anatomy.mjs';

export const SPECIES = {
  key: 'edohaze',
  file: 'edohaze.glb',
  prefix: 'Edohaze',
  rootName: 'Edohaze_Adult',
  generator: 'edohaze-procedural-builder',
  scientific: 'Gymnogobius macrognathos (Bleeker, 1860)',
  commonName: 'エドハゼ, adult',
  pelvicBaseS: 11.6,
  tailContact: [SL + 6.4, 0.75, 0],
  pigmentPNG: true,
  animations: 'Idle (loop, breathing), Swim (loop, 9 Hz burst tail beat), Yawn (one-shot)',
  viewer: {
    title: 'エドハゼ（全長 約45mm）',
    subtitle: 'Gymnogobius macrognathos — adult',
    // ground contacts (bone, s mm, y mm | 'rim' = pelvic sucker rim | 'bot' = belly line | 'tail' = lower caudal lobe)
    contacts: [
      ['J_pelvic', 12.5, 'rim'], ['J_pelvic', 14.2, 'rim'], ['J_pelvic', 15.8, 'rim'],
      ['J_root', 14.6, 'bot'], ['J_sp1', 17.0, 'bot'], ['J_sp2', 20.4, 'bot'], ['J_sp3', 24.0, 'bot'],
      ['J_sp4', 27.6, 'bot'], ['J_sp5', 31.2, 'bot'], ['J_sp6', 34.6, 'bot'], ['J_caudal2', SL + 6.4, 'tail'],
    ],
    totalLengthM: TL / 1000,
    presetScale: TL / 50.0, // camera presets were authored for the 50 mm マハゼ
    // soft floor shadow along the spine (bone, s mm)
    shadowChain: [['J_head', 2.5], ['J_head', 7.2], ['J_root', 12.0], ['J_sp1', 15.5], ['J_sp3', 22.5], ['J_sp5', 29.8], ['J_sp7', 36.4], ['J_caudal2', SL + 4.4]],
    // dark shadow core: vertebral column (y = yc + 0.06 t) and the viscera block
    coreChain: [['J_root', 10.4, 3.22, 0.3], ['J_sp1', 16.5, 3.42, 0.27], ['J_sp3', 23.5, 3.42, 0.23], ['J_sp5', 30.5, 3.02, 0.18], ['J_sp7', 37.0, 2.63, 0.15],
      ['J_root', 13.0, 1.5, 1.15], ['J_sp2', 20.6, 1.45, 1.0]],
  },
  // eye shader: cyan-green guanine ring around the pupil and a cooler grazing sheen (photos 004, 028, 054, 055)
  eye: { sheen: [0.03, 0.1, 0.1], ring: [0.05, 0.085, 0.085, 0.09] },
  // Internal anatomy for the volumetric body shader (fish mm). Placed between the pectoral girdle
  // (11.2 mm) and the anus (24.65 mm); spine height from the loft (yc + 0.06·t ≈ 3.2–3.5 mm).
  // Lateral photos show a white, opaque peritoneum over the gut (silvery belly) and dorsal photos a
  // dark visceral mass seen through the back (melanin on the dorsal peritoneum).
  shaderAnatomy: {
    headWin: [7.7, 10.4],
    gillWin: [6.3, 7.6, 9.3, 10.2],
    haemal: [24.8, 26.6],
    // cavity centre 0.62·b below the section centre so the peritoneal shell stays under the column
    abdomen: [17.9, 0.62, 6.9, 1.15],
    spine: [3.3, SL - 0.4, 0.4],
    // long oblique jaw: rictus 2.85 mm, maxilla to 3.6 mm, gape 2.17 → 1.27 mm
    jaw: [2.6, 4.0, 2.3, 3.0],
    // pale, less amber tissue than the juvenile マハゼ (lower blue absorption)
    sigS: 1.3,
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
