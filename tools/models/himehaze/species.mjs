// Species identity and viewer metadata for the adult ヒメハゼ build (the マハゼ GLB pipeline, ported from the
// stand-alone Himehaze project: photo-measured anatomy, fins and pattern, see docs/models/himehaze/README.md).
import { SL, TL, MALE, VARIANT } from './anatomy.mjs';
import { PELVIC } from './fins.mjs';
import { CONTACT_S, SHADOW_CHAIN } from './fish-species.mjs';

export const SPECIES = {
  key: 'himehaze',
  file: MALE ? 'himehaze_male.glb' : 'himehaze.glb',
  prefix: 'Himehaze',
  rootName: 'Himehaze_Adult',
  generator: 'himehaze-procedural-builder',
  scientific: 'Favonigobius gymnauchen (Bleeker, 1860)',
  commonName: `ヒメハゼ (sharp-nosed sand goby), adult ${MALE ? 'breeding male' : 'female / non-breeding'}`,
  variant: VARIANT,
  // the fish rests on the rim of its pelvic disc (11.95 mm from the snout)
  pelvicBaseS: PELVIC.base,
  // lowest point of the lower caudal lobe at rest (the rounded tail reaches 112 %SL)
  tailContact: [SL * 1.12, 1.0, 0],
  pigmentPNG: false,
  animations: 'Idle (loop, breathing), Swim (loop, 8 Hz burst tail beat), Yawn (one-shot)',
  viewer: {
    title: MALE ? 'ヒメハゼ 繁殖期の雄（全長 約53mm）' : 'ヒメハゼ（全長 約53mm）',
    subtitle: 'Favonigobius gymnauchen — adult',
    // ground contacts (bone, s mm, 'rim' = pelvic disc rim | 'bot' = belly line | 'tail' = lower caudal lobe),
    // from the project's CONTACT_S (pelvic disc 28.5–37.5 %SL, belly to 86 %SL, tail 112 %SL)
    contacts: [
      ...CONTACT_S.pelvicRim.map((s) => ['J_pelvic', +s.toFixed(2), 'rim']),
      ...CONTACT_S.belly.map(([bone, s]) => [bone, +s.toFixed(2), 'bot']),
      ['J_caudal2', +CONTACT_S.tail.toFixed(2), 'tail'],
    ],
    totalLengthM: TL / 1000,
    presetScale: 1.0,
    finGrazeMin: 0.3,
    finEdge: [0.03, 0.3, 1],
    finOpCap: [0.12, 0.3, 0.75],
    // soft floor shadow along the spine (bone, s mm)
    shadowChain: SHADOW_CHAIN.map(([bone, s]) => [bone, +s.toFixed(2)]),
  },
};
