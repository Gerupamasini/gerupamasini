// Build pipeline: params -> surface -> loft -> (fins, eyes, textures) -> rig/weights -> assets/generated/yamame.glb
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSurface, loadParams } from './surface.mjs';
import { applyStage } from './stages.mjs';
import { buildBody, meshStats } from './loft.mjs';
import { buildRig, bodyWeights, finWeights } from './rig.mjs';
import { writeGLB } from './write-glb.mjs';
import { sampleBodyGenome } from './genome.mjs';

// LOD presets (spec 06 §6.8.1): body loft density; fins use the fin module's `detail`. LOD0 is the hero mesh.
export const LODS = [
  { level: 0, loft: { n_upper: 12, n_lower: 14, steps: [[0, 0.30, 0.005], [0.30, 0.90, 0.0167], [0.90, 1.0, 0.025]] }, withMouth: true, finDetail: 1.0 },
  { level: 1, loft: { n_upper: 8, n_lower: 8, steps: [[0, 0.30, 0.012], [0.30, 0.90, 0.04], [0.90, 1.0, 0.05]], capT: [0.9, 0.7, 0.4, 0.1] }, withMouth: true, finDetail: 0.5 },
  { level: 2, loft: { n_upper: 5, n_lower: 5, steps: [[0, 0.30, 0.03], [0.30, 0.90, 0.10], [0.90, 1.0, 0.10]], capT: [0.8, 0.4] }, withMouth: false, finDetail: 0.25 },
];
import { newImage } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

async function optional(name) {
  try { return await import(`./${name}.mjs`); } catch (e) { console.log(`[build] module ${name} unavailable: ${e.message.split('\n')[0]}`); return null; }
}

export async function build({ stage = 'adult', seed = 1, out = path.join(ROOT, 'assets/generated/yamame.glb'), withTextures = true, withLods = true, individual = false } = {}) {
  let params = loadParams();
  if (stage === 'adult') params = applyStage(params, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/src/stage_adult.json'), 'utf8')), 'adult');
  const bodyGenome = individual ? sampleBodyGenome(seed) : {};
  if (individual) { console.log('[build] individual', seed, JSON.stringify(bodyGenome)); params = structuredClone(params); params.sl_m = { ...params.sl_m, v: bodyGenome.sl_m }; }
  const surface = createSurface(params, bodyGenome);
  const body = buildBody(surface, params, LODS[0].loft);
  console.log('[build] body', JSON.stringify(meshStats(body)), 'mouth', JSON.stringify(meshStats(body.mouth)));

  const mods = { fins: await optional('fins'), eyes: await optional('eyes'), textures: await optional('textures') };
  let fins = null, eyes = null, textures = {};
  if (mods.fins?.buildFins) { try { fins = mods.fins.buildFins({ surface, params, seed }); console.log('[build] fins tris', fins.geometry.indices.length / 3); } catch (e) { console.log('[build] fins failed:', e.message); } }
  if (mods.eyes?.buildEyes) { try { eyes = mods.eyes.buildEyes({ surface, params, seed }); console.log('[build] eyes ok'); } catch (e) { console.log('[build] eyes failed:', e.message); } }
  if (withTextures && mods.textures?.generateBodyTextures) {
    try { const genome = individual && mods.textures.sampleGenome ? mods.textures.sampleGenome(seed) : {}; const t = mods.textures.generateBodyTextures({ surface, params, seed, genome }); textures.body = t; console.log('[build] textures ok'); } catch (e) { console.log('[build] textures failed:', e.message); }
  }
  if (fins?.textures) textures.fins = fins.textures;
  if (eyes?.textures) textures.eyes = eyes.textures;

  const eyeCenters = eyes ? { L: eyes.left.center, R: eyes.right.center } : undefined;
  const rig = buildRig(surface, params, { jawHinge: body.landmarks.jaw_hinge, eyeCenters });
  const nBody = body.positions.length / 3;
  const weights = {
    body: bodyWeights(rig, body.attrs, nBody, { operculumEdge: params.operculum.edge_s.v }),
    mouth: bodyWeights(rig, { _S: new Float32Array(body.mouth.positions.length / 3).fill(0.06), _JAW: body.mouth.attrs._JAW }, body.mouth.positions.length / 3),
    fins: fins ? finWeights(rig, fins.geometry.attrs, fins.geometry.positions.length / 3) : null,
  };
  // lower LODs
  const lodBodies = [], lodFins = [];
  if (withLods) {
    for (const L of LODS.slice(1)) {
      const b = buildBody(surface, params, L.loft); const n = b.positions.length / 3;
      lodBodies.push({ level: L.level, body: b, withMouth: L.withMouth, weights: {
        body: bodyWeights(rig, b.attrs, n, { operculumEdge: params.operculum.edge_s.v }),
        mouth: bodyWeights(rig, { _S: new Float32Array(b.mouth.positions.length / 3).fill(0.06), _JAW: b.mouth.attrs._JAW }, b.mouth.positions.length / 3) } });
      console.log(`[build] LOD${L.level} body tris`, b.indices.length / 3, L.withMouth ? `+ mouth ${b.mouth.indices.length / 3}` : '');
      if (mods.fins?.buildFins && fins) {
        try { const f = mods.fins.buildFins({ surface, params, seed, detail: L.finDetail }); lodFins.push({ level: L.level, fins: f, weights: finWeights(rig, f.geometry.attrs, f.geometry.positions.length / 3) }); console.log(`[build] LOD${L.level} fins tris`, f.geometry.indices.length / 3); } catch (e) { console.log('[build] fin LOD failed:', e.message); }
      }
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writeGLB({ file: out, body, fins, eyes, rig, textures, params, weights, lodBodies, lodFins, meta: { seed, bones: rig.bones.length } });
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`[build] wrote ${out} (${kb} KB), bones=${rig.bones.length}`);
  return { out, rig, body, params };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build({ stage: arg('stage', 'adult'), seed: Number(arg('seed', 1)), individual: process.argv.includes('--individual'), out: arg('out', path.join(ROOT, 'assets/generated/yamame.glb')) });
}
