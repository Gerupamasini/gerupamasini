#!/usr/bin/env node
// Builds the エドハゼ GLB tiers (geometry + baked textures) procedurally, with the マハゼ pipeline.
//   node tools/models/edohaze/build.mjs [--tier hero|lod1|lod2] [--fast] [--dump-textures <dir>]
//   GOBY_GRAVID=1 node tools/models/edohaze/build.mjs --tier hero   (the gravid female)
// Each tier fits the model budget (size class M): see tools/lib/gobyBuild.mjs for what every level holds.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGobyTier, GOBY_TIERS } from '../../lib/gobyBuild.mjs';
import { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, GRAVID, profileTable, toObject, botY } from './anatomy.mjs';
import { buildBody } from './body.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas } from './fins.mjs';
import { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE } from './eye.mjs';
import { buildMouth, buildGills } from './interior.mjs';
import { JOINTS, J, AXES, REST_POSE, bodyWeights, interiorWeights, finWeights, buildClips } from './rig.mjs';
import { FIN_TARGETS } from '../../../src/creatures/species/mahaze/pose.js';
import { SPECIES } from './species.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
// --tier hero|lod1|lod2 selects the detail level (hero = observation quality, lod1 = near, lod2 = far)
const tierIdx = args.indexOf('--tier');
const tierName = tierIdx >= 0 ? args[tierIdx + 1] : args.includes('--fast') ? 'lod1' : 'hero';
const tier = GOBY_TIERS[tierName];
if (!tier) { console.error(`unknown tier ${tierName}`); process.exit(1); }
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
// GOBY_GRAVID=1 builds the gravid female (egg-swollen belly) as its own set of tiers
const outFile = path.join(root, 'src', 'assets', 'models', 'edohaze', `edohaze${GRAVID ? '_gravid' : ''}.${tierName}.glb`);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

buildGobyTier({
  root, outFile, tierName, tier, log, dumpDir, S: SPECIES,
  A: { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, profileTable, toObject, botY },
  buildBody,
  F: { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas },
  E: { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE },
  I: { buildMouth, buildGills },
  R: { JOINTS, J, AXES, REST_POSE, bodyWeights, interiorWeights, finWeights, buildClips },
  FIN_TARGETS,
});
