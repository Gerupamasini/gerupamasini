// From the sculpt's distance field to a tier's render mesh: surface nets at the tier's own cell size, the UV charts,
// simplification to the tier's triangle target (meshoptimizer, aware of the normals and the UVs, so the charts'
// seams survive), and tangents for the normal map. The far tiers mesh coarser cells first: a dense mesh's chart seams
// alone would hold more vertices than a far tier's whole budget.
import { MeshoptSimplifier, MeshoptTangents } from 'meshoptimizer';
import { surfaceNets } from './mesher.mjs';
import { chartMesh } from './charts.mjs';

export const ready = Promise.all([MeshoptSimplifier.ready, MeshoptTangents.ready]);

/**
 * @param f        distance (fish frame, mm)
 * @param box      { min, max } (mm)
 * @param o        { h: cell (mm), target: triangles, charts, prefer, uvWeight?, normalWeight?, log? }
 * @returns { position, normal, tangent, uv, indices, chart, dense } (fish frame mm; dense = the unsimplified mesh)
 */
export function tierMesh(f, box, o) {
  const log = o.log ?? (() => {});
  const dense = surfaceNets(f, box, o.h, { log });
  const ch = chartMesh(dense, o.charts, o.prefer);
  const n = ch.position.length / 3;
  const attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    attrs[i * 5] = ch.normal[i * 3]; attrs[i * 5 + 1] = ch.normal[i * 3 + 1]; attrs[i * 5 + 2] = ch.normal[i * 3 + 2];
    attrs[i * 5 + 3] = ch.uv[i * 2]; attrs[i * 5 + 4] = ch.uv[i * 2 + 1];
  }
  const nw = o.normalWeight ?? 0.5, uw = o.uvWeight ?? 2;
  let idx = ch.indices;
  if (idx.length / 3 > o.target) {
    [idx] = MeshoptSimplifier.simplifyWithAttributes(ch.indices, ch.position, 3, attrs, 5, [nw, nw, nw, uw, uw], null, o.target * 3, 0.02, []);
  }
  // keep only the vertices the simplified triangles use
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (const v of idx) if (remap[v] < 0) remap[v] = m++;
  const position = new Float32Array(m * 3), normal = new Float32Array(m * 3), uv = new Float32Array(m * 2), chart = new Int16Array(m);
  for (let v = 0; v < n; v++) {
    const j = remap[v];
    if (j < 0) continue;
    position.set(ch.position.subarray(v * 3, v * 3 + 3), j * 3);
    normal.set(ch.normal.subarray(v * 3, v * 3 + 3), j * 3);
    uv.set(ch.uv.subarray(v * 2, v * 2 + 2), j * 2);
    chart[j] = ch.chart[v];
  }
  const indices = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) indices[i] = remap[idx[i]];
  const tangent = MeshoptTangents.generateTangents(indices, position, 3, normal, 3, uv, 2);
  log(`tier mesh: ${m} vertices, ${indices.length / 3} triangles (dense ${dense.indices.length / 3}, charted ${n} vertices)`);
  return { position, normal, tangent, uv, indices, chart, dense, charted: ch };
}
