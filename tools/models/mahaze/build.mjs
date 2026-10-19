#!/usr/bin/env node
// Builds src/assets/models/mahaze/mahaze_<variant>.<tier>.glb (geometry + baked textures) procedurally.
//   node tools/models/mahaze/build.mjs [--variant juvenile|subadult|adult] [--tier hero|lod1|lod2] [--dump-textures <dir>]
//                                      [--validate]
// Each file carries the nine looks of its growth stage: three patterns × three colour morphs, in the maps' channels
// (the melanophores of every pattern, the standard colour's ground) and a table of the morphs in the body's extras
// (`morphs`): the game rebuilds each fish's colour from them (src/creatures/species/mahaze/colourMorph.js). Each tier
// fits the model budget (size class L): see tools/lib/gobyBuild.mjs for what every level holds.
//   --validate  also bakes every pattern in every colour the old way and logs how close the rebuilt colours come
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGobyTier } from '../../lib/gobyBuild.mjs';
import { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, MOUTH, RICTUS_S, VARIANT, GROWTH, profileTable, toObject, botY } from './anatomy.mjs';
import { buildBody, morphTable, rebuildMorph } from './body.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas } from './fins.mjs';
import { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE, PUPIL_GLOW } from './eye.mjs';
import { buildMouth, buildGills } from './interior.mjs';
import { JOINTS, J, AXES, REST_POSE, bodyWeights, interiorWeights, finWeights, buildClips } from './rig.mjs';
import { FIN_TARGETS } from '../../../src/creatures/species/mahaze/pose.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
// --tier hero|lod1|lod2 selects the detail level (hero = observation quality, lod1 = near, lod2 = far)
const tierIdx = args.indexOf('--tier');
const tierName = tierIdx >= 0 ? args[tierIdx + 1] : args.includes('--fast') ? 'lod1' : 'hero';
// The levels of a size-class L goby (≤ 300 mm): hero 250 000 triangles / 8 maps of 2048; lod1 25 000 / 4 of 1024;
// lod2 3 000 / 3 of 512 (tools/models/budget.json). The far level is baked at twice its size and filtered down; its
// maps are 256 like the M gobies' (a far fish is a few dozen pixels long, and every map's far models together are
// downloaded on entering it: docs/quality/model-budget.md §1).
const TIERS = {
  hero: { NS: 400, NV: 184, NSb: 400, NVb: 192, texW: 2048, texH: 1024, texDown: 0, finSub: 4, finNT: 30, finNTCaudal: 36, atlas: 2048, eyeNT: 48, eyeNP: 64, interior: true, cap: true, lod2: false },
  lod1: { NS: 150, NV: 52, NSb: 200, NVb: 96, texW: 1024, texH: 512, texDown: 0, finSub: 2, finNT: 8, finNTCaudal: 10, atlas: 1024, eyeNT: 16, eyeNP: 24, interior: false, cap: false, lod2: false },
  lod2: { NS: 56, NV: 18, NSb: 100, NVb: 48, texW: 512, texH: 256, texDown: 1, finSub: 1, finNT: 3, finNTCaudal: 4, atlas: 256, eyeNT: 6, eyeNP: 8, interior: false, cap: false, lod2: true },
};
const tier = TIERS[tierName];
if (!tier) { console.error(`unknown tier ${tierName}`); process.exit(1); }
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
const outFile = path.join(root, 'src', 'assets', 'models', 'mahaze', `mahaze_${VARIANT}.${tierName}.glb`);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
log(`variant: ${VARIANT} (growth ${GROWTH}), tier ${tierName}`);

const SPECIES = {
  prefix: 'Mahaze',
  rootName: 'Mahaze_Juvenile',
  generator: 'mahaze-procedural-builder',
  scientific: 'Acanthogobius flavimanus (Temminck & Schlegel, 1845)',
  commonName: `マハゼ (yellowfin goby), ${{ juvenile: 'juvenile', subadult: 'subadult (between juvenile and adult)', adult: 'adult-proportioned' }[VARIANT]}`,
  variant: VARIANT,
  extras: { growth: GROWTH },
  // the fish rests on the rim of its pelvic sucker; the lower caudal lobe touches the bed at rest
  pelvicBaseS: 12.0,
  tailContact: [48.0, 0.6, 0],
  animations: 'Idle (loop, breathing), Swim (loop, 8 Hz burst tail beat), Yawn (one-shot)',
  eye: { pupilGlow: PUPIL_GLOW },
};

buildGobyTier({
  root, outFile, tierName, tier, log, dumpDir, S: SPECIES,
  // jaws: s / y ramps of the dense lip and jaw tissue (s0, s1, y0, y1) for the translucent shaders
  A: { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, profileTable, toObject, botY, jaws: [RICTUS_S - 0.5, RICTUS_S + 1.1, MOUTH[0][1] + 0.42, MOUTH[0][1] + 1.22] },
  buildBody,
  F: { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas },
  E: { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE },
  I: { buildMouth, buildGills },
  R: { JOINTS, J, AXES, REST_POSE, bodyWeights, interiorWeights, finWeights, buildClips },
  FIN_TARGETS,
  morphs: { table: morphTable(), rebuild: rebuildMorph, validate: args.includes('--validate') },
});
