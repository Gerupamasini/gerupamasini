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
import { buildTeeth } from './teeth.mjs';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Relative morph targets on the LOD0 body skin (05 §5.1.3). Amplitudes: body depth +-1 SD = 0.024/0.241 = 10 % [P, n=27]; peduncle +-0.013/0.091 = 14 % [P]; belly / cheek / branchiostegal [E].
// Head-region shape (s < 0.22) is left untouched by the depth morphs so the eyes, mouth tube and gill cover stay consistent. Not built: mt_gape / mt_opercle_flare (jaw_lower / opercle bones),
// mt_kype / mt_upper_jaw_ext (nuptial males excluded by D2), mt_head_len (needs ring re-spacing), mt_eye_size (eye mesh, set per individual), mt_fin_wear (fin atlas).
export const MORPHS = [
  { name: 'mt_body_depth', surf: { dorsal_mul: (s) => 1 + 0.10 * sstep(0.22, 0.42, s), ventral_mul: (s) => 1 + 0.10 * sstep(0.22, 0.42, s) } },
  { name: 'mt_belly', surf: { ventral_mul: (s) => 1 + 0.14 * sstep(0.30, 0.45, s) * (1 - sstep(0.70, 0.88, s)) } },
  { name: 'mt_peduncle', surf: { dorsal_mul: (s) => 1 + 0.14 * sstep(0.72, 0.95, s), ventral_mul: (s) => 1 + 0.14 * sstep(0.72, 0.95, s) } },
  { name: 'mt_buccal_swell', loft: { morph: { cheek: 1 } } },
  { name: 'mt_branchiostegal', loft: { morph: { branch: 1 } } },
];

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

export async function build({ stage = 'adult', seed = 1, out = path.join(ROOT, 'assets/generated/yamame.glb'), withTextures = true, withLods = true, individual = false, sl = null } = {}) {
  let params = loadParams();
  if (stage === 'adult') params = applyStage(params, JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/src/stage_adult.json'), 'utf8')), 'adult');
  const bodyGenome = individual ? sampleBodyGenome(seed) : {};
  if (sl) { bodyGenome.sl_m = sl; params = structuredClone(params); params.sl_m = { ...params.sl_m, v: sl }; }
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
    teeth: null,
    fins: fins ? finWeights(rig, fins.geometry.attrs, fins.geometry.positions.length / 3) : null,
  };
  const teeth = body.mouth.lips ? buildTeeth({ lips: body.mouth.lips, SL: surface.SL, seed }) : null;
  if (teeth) { const n = teeth.positions.length / 3; weights.teeth = bodyWeights(rig, { _S: new Float32Array(n).fill(0.06), _JAW: teeth.attrs._JAW }, n); console.log('[build] teeth tris', teeth.indices.length / 3); }
  // morph targets (LOD0 body skin only): same topology, positions differ
  const morphs = [];
  for (const M of MORPHS) {
    const sM = createSurface(params, { ...bodyGenome, ...(M.surf || {}) }); const bM = buildBody(sM, params, { ...LODS[0].loft, ...(M.loft || {}) });
    if (bM.positions.length !== body.positions.length) { console.log('[build] morph', M.name, 'topology mismatch, skipped'); continue; }
    const d = new Float32Array(body.positions.length); let mx = 0; for (let i = 0; i < d.length; i++) { d[i] = bM.positions[i] - body.positions[i]; mx = Math.max(mx, Math.abs(d[i])); }
    morphs.push({ name: M.name, dPos: d }); console.log(`[build] morph ${M.name} max delta ${(mx * 1000).toFixed(2)} mm`);
  }
  // lower LODs
  const lodBodies = [], lodFins = [], lodEyes = [];
  if (withLods) {
    for (const L of LODS.slice(1)) {
      const b = buildBody(surface, params, L.loft); const n = b.positions.length / 3;
      lodBodies.push({ level: L.level, body: b, withMouth: L.withMouth, weights: {
        body: bodyWeights(rig, b.attrs, n, { operculumEdge: params.operculum.edge_s.v }),
        mouth: bodyWeights(rig, { _S: new Float32Array(b.mouth.positions.length / 3).fill(0.06), _JAW: b.mouth.attrs._JAW }, b.mouth.positions.length / 3) } });
      console.log(`[build] LOD${L.level} body tris`, b.indices.length / 3, L.withMouth ? `+ mouth ${b.mouth.indices.length / 3}` : '');
      if (mods.eyes?.buildEyes && eyes) {
        try { const e = mods.eyes.buildEyes({ surface, params, seed, detail: L.finDetail }); lodEyes.push({ level: L.level, eyes: e }); console.log(`[build] LOD${L.level} eyes tris`, (e.left.parts.ball?.indices.length ?? 0) / 3 + (e.left.parts.cornea?.indices.length ?? 0) / 3 + (e.left.parts.orbit?.indices.length ?? 0) / 3, 'per eye'); } catch (er) { console.log('[build] eye LOD failed:', er.message); }
      }
      if (mods.fins?.buildFins && fins) {
        try { const f = mods.fins.buildFins({ surface, params, seed, detail: L.finDetail }); lodFins.push({ level: L.level, fins: f, weights: finWeights(rig, f.geometry.attrs, f.geometry.positions.length / 3) }); console.log(`[build] LOD${L.level} fins tris`, f.geometry.indices.length / 3); } catch (e) { console.log('[build] fin LOD failed:', e.message); }
      }
    }
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await writeGLB({ file: out, body, teeth, fins, eyes, rig, textures, params, weights, lodBodies, lodFins, lodEyes, morphs, meta: { seed, bones: rig.bones.length } });
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`[build] wrote ${out} (${kb} KB), bones=${rig.bones.length}`);
  return { out, rig, body, params };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build({ stage: arg('stage', 'adult'), seed: Number(arg('seed', 1)), individual: process.argv.includes('--individual'), sl: arg('sl', null) ? Number(arg('sl')) : null, out: arg('out', path.join(ROOT, 'assets/generated/yamame.glb')) });
}
