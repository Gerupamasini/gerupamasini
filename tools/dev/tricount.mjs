import { getGeometries, getSpec } from '../../src/birds/kentishPlover/KentishPloverModel.js';
const tri = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
for (const d of [0, 1, 2]) {
  const t0 = performance.now();
  const g = getGeometries(d);
  const parts = { body: tri(g.body), feathers: tri(g.feathers), bare: tri(g.bare), eyes: g.eyes ? tri(g.eyes.eyeball) + tri(g.eyes.cornea) + tri(g.eyes.lids) : 0 };
  const verts = g.body.getAttribute('position').count + g.feathers.getAttribute('position').count + g.bare.getAttribute('position').count;
  console.log(`LOD${d}`, JSON.stringify(parts), 'total tris', Object.values(parts).reduce((a, b) => a + b, 0), 'verts', verts, `build ${(performance.now() - t0).toFixed(0)} ms`);
}
console.log('bones', getSpec().boneNames.length);
