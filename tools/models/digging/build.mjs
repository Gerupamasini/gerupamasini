#!/usr/bin/env node
// Builds the digging tools (or, with --set optics, the binoculars) as GLB files with LODs:
//   node tools/models/digging/build.mjs [--set digging|optics] [--tool <id>|all] [--tier hero|lod1|lod2|all]
// Output: src/assets/models/<set>/<id>.<tier>.glb and src/assets/models/<set>/manifest.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { createMaterials } from '../nets/pbr.mjs';
import { v3 } from '../nets/geom.mjs';
import { DIG_TOOLS } from './tools.mjs';
import { OPTICS } from '../optics/binoculars.mjs';
import { APPAREL } from '../apparel/waders.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
// --set digging (default) | optics | apparel: which catalogue and output folder
const SET = arg('--set', 'digging');
const CATALOGUE = { digging: DIG_TOOLS, optics: OPTICS, apparel: APPAREL }[SET];
const outDir = path.join(root, 'src', 'assets', 'models', SET);
const sel = arg('--tool', 'all');
const tierSel = arg('--tier', 'all');

const TIERS = {
  hero: { clothU: 44, clothV: 56, strapN: 40, bladeU: 48, bladeV: 56, wireSegs: 14, lathe: 40, latheSmall: 14, steps: 14, hoopN: 120, clawN: 16, detail: 0, tex: 1 },
  lod1: { clothU: 24, clothV: 32, strapN: 20, bladeU: 20, bladeV: 24, wireSegs: 8, lathe: 18, latheSmall: 8, steps: 8, hoopN: 56, clawN: 8, detail: 1, tex: 0.5 },
  lod2: { clothU: 12, clothV: 14, strapN: 10, bladeU: 8, bladeV: 10, wireSegs: 5, lathe: 10, latheSmall: 6, steps: 5, hoopN: 24, clawN: 4, detail: 2, tex: 0.25 },
};

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

function buildTool(tool, tierName) {
  const Q = TIERS[tierName];
  const d = tool.build(Q);
  const gb = new GLBBuilder('higata-dig-builder');
  gb.json.asset.copyright = 'Procedurally generated (geometry and textures), 干潟図鑑.';
  const { prim, stats } = createMaterials(gb, { tierName, texScale: Q.tex });
  const byMat = new Map();
  let kg = 0, com = [0, 0, 0], zMin = Infinity, zMax = -Infinity;
  for (const p of d.parts) {
    if (!p.mesh.vertexCount) continue;
    if (!byMat.has(p.material)) byMat.set(p.material, []);
    byMat.get(p.material).push(p.mesh);
    kg += p.kg;
    com = v3.add(com, v3.mul(p.mesh.centroid(), p.kg));
    for (let i = 2; i < p.mesh.pos.length; i += 3) { zMin = Math.min(zMin, p.mesh.pos[i]); zMax = Math.max(zMax, p.mesh.pos[i]); }
  }
  com = v3.mul(com, 1 / kg);
  const prims = [];
  for (const [mat, list] of byMat) {
    const merged = list[0];
    for (let k = 1; k < list.length; k++) merged.append(list[k]);
    prims.push(prim(merged, mat));
  }
  const toolNode = gb.addNode({ name: 'Tool', mesh: gb.addMesh('Tool', prims) });
  const r4 = (a) => a.map((v) => +v.toFixed(4));
  const notes = {
    Grip_Main: 'dominant hand (the origin); the tool runs along local +Z',
    Grip_Support: 'second hand / fingertip position',
    Tip: 'the point that enters the ground first',
    Blade_Center: 'middle of the working face (what a scoop carries)',
    Eye_L: 'left exit pupil (eyecup); put the eye / camera here',
    Eye_R: 'right exit pupil (eyecup)',
    Objective_Center: 'between the objective lenses; the binoculars look along +Z',
    Hips: 'hip height of the wearer (for attaching to a character)',
    Chest_Top: 'front of the chest opening',
    Foot_L: 'left boot, on the ground under the ball of the foot',
    Foot_R: 'right boot',
  };
  const empties = Object.entries(d.nodes).map(([name, p]) => gb.addNode({ name, translation: r4(p), extras: { higataTool: { note: notes[name] } } }));
  const info = {
    id: tool.id, ja: tool.ja, en: tool.en, use: tool.use, tier: tierName, spec: tool.spec, materialsJa: tool.materials,
    units: 'metres', axes: '+Y up (working face up), +Z from the grip toward the working end, +X right; origin = centre of the dominant-hand grip',
    mass_g: Math.round(kg * 1000),
    balancePoint_m: +com[2].toFixed(3),
    overallLength_m: +(zMax - zMin).toFixed(3),
    buttZ_m: +zMin.toFixed(3),
    ...(d.nodes.Tip ? { tip_m: r4(d.nodes.Tip) } : {}),
    ...(tool.spec.maxDepth_cm ? { maxDigDepth_m: tool.spec.maxDepth_cm / 100 } : {}),
    attributes: { COLOR_0: 'baked cavity / occlusion', _DIRT: 'mud propensity 0..1 (see netMaterials.ts / prepareNet)' },
  };
  const rootNode = gb.addNode({ name: tool.id, children: [toolNode, ...empties], extras: { higataTool: info } });
  gb.addScene(tool.id, [rootNode]);
  return { glb: gb.toBuffer(), info, stats };
}

fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { tools: {} };
const tiers = tierSel === 'all' ? Object.keys(TIERS) : [tierSel];
for (const tool of CATALOGUE) {
  if (sel !== 'all' && sel !== tool.id) continue;
  for (const tier of tiers) {
    const { glb, info, stats } = buildTool(tool, tier);
    const file = `${tool.id}.${tier}.glb`;
    fs.writeFileSync(path.join(outDir, file), glb);
    const e = (manifest.tools[tool.id] = { ...(manifest.tools[tool.id] || { tiers: {} }), ja: tool.ja, en: tool.en, use: tool.use, spec: tool.spec });
    if (tier === 'hero') Object.assign(e, { mass_g: info.mass_g, balancePoint_m: info.balancePoint_m, overallLength_m: info.overallLength_m, buttZ_m: info.buttZ_m, tip_m: info.tip_m });
    e.tiers[tier] = { file, triangles: stats.triangles, vertices: stats.vertices, bytes: glb.length };
    log(`${file}: ${stats.triangles} tris, ${(glb.length / 1e6).toFixed(2)} MB, ${info.mass_g} g (target ${tool.spec.mass_g}), balance ${info.balancePoint_m} m, length ${info.overallLength_m} m (target ${tool.spec.total_cm / 100})`);
  }
}
manifest.lodDistances_m = { hero: 0, lod1: 2.5, lod2: 9 };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
