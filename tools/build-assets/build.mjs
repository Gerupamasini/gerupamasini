// Build pipeline: params -> surface -> loft -> (fins, eyes, textures) -> rig/weights -> assets/generated/yamame.glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSurface, loadParams } from './surface.mjs';
import { applyStage } from './stages.mjs';
import { buildBody, meshStats } from './loft.mjs';
import { buildRig, bodyWeights, finWeights } from './rig.mjs';
import { writeGLB } from './write-glb.mjs';
import { newImage } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

async function optional(name) {
  try { return await import(`./${name}.mjs`); } catch (e) { console.log(`[build] module ${name} unavailable: ${e.message.split('\n')[0]}`); return null; }
}

export async function build({ stage = 'adult', seed = 1, out = path.join(ROOT, 'assets/generated/yamame.glb'), withTextures = true } = {}) {
  let params = loadParams();
  if (stage === 'adult') params = applyStage(params, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/src/stage_adult.json'), 'utf8')), 'adult');
  const surface = createSurface(params);
  const body = buildBody(surface, params);
  console.log('[build] body', JSON.stringify(meshStats(body)), 'mouth', JSON.stringify(meshStats(body.mouth)));

  const mods = { fins: await optional('fins'), eyes: await optional('eyes'), textures: await optional('textures') };
  let fins = null, eyes = null, textures = {};
  if (mods.fins?.buildFins) { try { fins = mods.fins.buildFins({ surface, params, seed }); console.log('[build] fins tris', fins.geometry.indices.length / 3); } catch (e) { console.log('[build] fins failed:', e.message); } }
  if (mods.eyes?.buildEyes) { try { eyes = mods.eyes.buildEyes({ surface, params, seed }); console.log('[build] eyes ok'); } catch (e) { console.log('[build] eyes failed:', e.message); } }
  if (withTextures && mods.textures?.generateBodyTextures) {
    try { const t = mods.textures.generateBodyTextures({ surface, params, seed }); textures.body = t; console.log('[build] textures ok'); } catch (e) { console.log('[build] textures failed:', e.message); }
  }
  if (fins?.textures) textures.fins = fins.textures;
  if (eyes?.textures) textures.eyes = eyes.textures;

  const eyeCenters = eyes ? { L: eyes.left.center, R: eyes.right.center } : undefined;
  const rig = buildRig(surface, params, { jawHinge: body.landmarks.jaw_hinge, eyeCenters });
  const nBody = body.positions.length / 3;
  const weights = {
    body: bodyWeights(rig, body.attrs, nBody),
    mouth: bodyWeights(rig, { _S: new Float32Array(body.mouth.positions.length / 3).fill(0.06), _JAW: body.mouth.attrs._JAW }, body.mouth.positions.length / 3),
    fins: fins ? finWeights(rig, fins.geometry.attrs, fins.geometry.positions.length / 3) : null,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writeGLB({ file: out, body, fins, eyes, rig, textures, params, weights, meta: { seed, bones: rig.bones.length } });
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`[build] wrote ${out} (${kb} KB), bones=${rig.bones.length}`);
  return { out, rig, body, params };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build({ stage: arg('stage', 'adult'), seed: Number(arg('seed', 1)), out: arg('out', path.join(ROOT, 'assets/generated/yamame.glb')) });
}
