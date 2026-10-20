// From a dense surface-net mesh to a tier's render mesh: the UV charts, simplification region by region to each
// region's own triangle target (meshoptimizer, aware of the normals, the UVs and any extra per-vertex data the caller
// gives, e.g. the head morphs' displacements, so the vertices those need survive), the folds the simplification made
// in UV laid flat again (charts.repairFolds), and tangents for the normal map. meshoptimizer only drops vertices
// (never simplifyWithUpdate, which moves them), so every tier vertex is a dense vertex: `source` maps it there, and the
// rig and the morphs computed on the dense mesh carry over exactly. The far tier simplifies first and charts after:
// a dense mesh's chart seams alone would hold more vertices than its whole budget, and collapses across them
// (Permissive) make triangles that span two charts.
// Flags: Regularize on the trunk (even triangles under the spine's bending); no Prune (a region's submesh can hold a
// small piece fenced by locked vertices, which Prune would drop, opening a hole at the region border); the target error
// is left open (1), so each region lands on its triangle target and reports the error it reached.
import { MeshoptSimplifier, MeshoptTangents } from 'meshoptimizer';
import { surfaceNets } from './mesher.mjs';
import { chartMesh, chartResolve, repairFolds } from './charts.mjs';
import { fixWinding } from './headrig.mjs';

export const ready = Promise.all([MeshoptSimplifier.ready, MeshoptTangents.ready]);

/**
 * Topology of a triangle mesh with its vertices welded by `weld` (per-vertex id, e.g. the dense source, so that chart
 * copies count once; default: exact position).
 * @returns { V, E, F, components: number, componentSizes, open (edges with one triangle), nonManifold (edges with more
 *   than two), degenerate (triangles with a repeated welded corner), chi, genus (closed manifold only, else null) }
 */
export function meshTopology(mesh, { weld = null } = {}) {
  const I = mesh.indices, P = mesh.position, nv = P.length / 3;
  let id = weld;
  if (!id) {
    const m = new Map();
    id = new Uint32Array(nv);
    for (let v = 0; v < nv; v++) {
      const k = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
      let j = m.get(k);
      if (j === undefined) m.set(k, (j = m.size));
      id[v] = j;
    }
  }
  const E = new Map(), used = new Set();
  let degenerate = 0;
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < I.length; t += 3) {
    const a = id[I[t]], b = id[I[t + 1]], c = id[I[t + 2]];
    used.add(a); used.add(b); used.add(c);
    if (a === b || b === c || a === c) { degenerate++; continue; }
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const q = key(x, y); E.set(q, (E.get(q) ?? 0) + 1); }
  }
  let open = 0, nonManifold = 0;
  for (const c of E.values()) if (c === 1) open++; else if (c > 2) nonManifold++;
  let maxId = 0;
  for (const u of used) if (u + 1 > maxId) maxId = u + 1;
  const parent = new Int32Array(maxId).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(id[I[t]]), b = find(id[I[t + 1]]), c = find(id[I[t + 2]]);
    if (b !== a) parent[b] = a;
    const c2 = find(c); if (c2 !== a) parent[c2] = a;
  }
  const comp = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = find(id[I[t]]); comp.set(r, (comp.get(r) ?? 0) + 1); }
  const F = I.length / 3, V = used.size, chi = V - E.size + F;
  const componentSizes = [...comp.values()].sort((a, b) => b - a);
  // vertices where the surface touches itself: their triangles form more than one fan through their edges
  const vt = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = id[I[t + k]]; let l = vt.get(a); if (!l) vt.set(a, (l = [])); l.push(t); }
  let pinched = 0;
  for (const [v, ts] of vt) {
    if (ts.length < 2) continue;
    const pa = new Map(ts.map((t) => [t, t]));
    const f = (a) => { while (pa.get(a) !== a) { pa.set(a, pa.get(pa.get(a))); a = pa.get(a); } return a; };
    const byW = new Map();
    for (const t of ts) for (let k = 0; k < 3; k++) {
      const w = id[I[t + k]];
      if (w === v) continue;
      const u = byW.get(w);
      if (u === undefined) byW.set(w, t); else { const a = f(u), b = f(t); if (a !== b) pa.set(b, a); }
    }
    if (new Set(ts.map(f)).size > 1) pinched++;
  }
  const genus = !open && !nonManifold && !degenerate && !pinched ? (2 * componentSizes.length - chi) / 2 : null;
  return { V, E: E.size, F, components: componentSizes.length, componentSizes, open, nonManifold, pinched, degenerate, chi, genus };
}

/** Triangles per chart (for the logs). */
export function chartTally(triChart, charts) {
  const n = new Map();
  for (const c of triChart) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n].sort((a, b) => a[0] - b[0]).map(([c, k]) => `${charts[c].name} ${k}`).join(', ');
}

/** Only the vertices the triangles use, renumbered (`map`: new → old). Per-vertex arrays named in `keys` follow. */
export function compactMesh(mesh, indices, keys) {
  const nv = mesh.position.length / 3, remap = new Int32Array(nv).fill(-1);
  let m = 0;
  for (const v of indices) if (remap[v] < 0) remap[v] = m++;
  const map = new Uint32Array(m);
  for (let v = 0; v < nv; v++) if (remap[v] >= 0) map[remap[v]] = v;
  const out = { indices: new Uint32Array(indices.length), map };
  for (let i = 0; i < indices.length; i++) out.indices[i] = remap[indices[i]];
  for (const k of keys) {
    const a = mesh[k];
    if (!a) continue;
    const c = a.length / nv, b = new a.constructor(m * c);
    for (let j = 0; j < m; j++) for (let q = 0; q < c; q++) b[j * c + q] = a[map[j] * c + q];
    out[k] = b;
  }
  return out;
}

/**
 * Simplify a mesh region by region, each region to its own triangle target. The vertices two regions share (their
 * border, welded by `weld`) are locked, so the regions stay joined without a crack; `lock` (per vertex) locks more.
 * @param mesh     { position, indices }
 * @param regionOf Uint8Array per triangle: region index
 * @param regions  [{ name, target (triangles), flags? (meshopt flags), error? (target error, default 1: the count
 *                 decides) }]
 * @param o        { attrs: Float32Array(n·stride), stride, weights: number[stride], lock: Uint8Array(n), weld, log }
 * @returns { indices, region (per triangle), errors: number[], locked }
 */
export function simplifyRegions(mesh, regionOf, regions, o = {}) {
  const log = o.log ?? (() => {});
  const P = mesh.position, I = mesh.indices, nv = P.length / 3, nt = I.length / 3;
  const weld = o.weld ?? null, wid = (v) => (weld ? weld[v] : v);
  // the border: welded vertices used by more than one region
  const mask = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const w = wid(I[t * 3 + k]); mask.set(w, (mask.get(w) ?? 0) | (1 << regionOf[t])); }
  const lock = new Uint8Array(nv);
  if (o.lock) lock.set(o.lock);
  let locked = 0;
  for (let v = 0; v < nv; v++) { const mm = mask.get(wid(v)) ?? 0; if (mm & (mm - 1)) lock[v] = 1; if (lock[v]) locked++; }
  const stride = o.stride ?? 0;
  const attrs = stride ? o.attrs : new Float32Array(nv);
  const weights = stride ? o.weights : [0];
  const parts = [], regOut = [], errors = [];
  for (let r = 0; r < regions.length; r++) {
    const R = regions[r], sub = [];
    for (let t = 0; t < nt; t++) if (regionOf[t] === r) sub.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
    let idx = Uint32Array.from(sub), err = 0;
    if (idx.length / 3 > R.target) {
      [idx, err] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, attrs, stride || 1, weights, lock, R.target * 3, R.error ?? 1, R.flags ?? []);
    }
    log(`  region ${R.name}: ${sub.length / 3} → ${idx.length / 3} triangles (target ${R.target}, error ${err.toExponential(2)})`);
    parts.push(idx); errors.push(err);
    regOut.push(new Uint8Array(idx.length / 3).fill(r));
  }
  const len = parts.reduce((a, p) => a + p.length, 0), indices = new Uint32Array(len), region = new Uint8Array(len / 3);
  let at = 0, rt = 0;
  parts.forEach((p, r) => { indices.set(p, at); at += p.length; region.set(regOut[r], rt); rt += regOut[r].length; });
  return { indices, region, errors, locked };
}

/**
 * A tier's render mesh.
 * @param f    distance (fish mm), meshed at o.h over `box` when o.dense is not given
 * @param box  { min, max } (mm)
 * @param o    { h, dense ({ position, normal, indices } fish mm), charts, prefer (p, n, v) → chart, force (per dense
 *             triangle chart, −1 free), regions: [{ name, target, flags?, error?, select(centroid mm, chart) → bool }]
 *             (the first region that selects a triangle takes it; the last takes the rest) or target (one region),
 *             extraAttrs: { data: Float32Array(nDense·k), weights: number[k] } (per dense vertex), lockDense:
 *             Uint8Array(nDense), uvWeight (2), normalWeight (0.5), simplifyFirst, repair (repairFolds' options; false
 *             to skip), log }
 * @returns { position, normal, tangent, uv, indices, chart (per vertex), source (per vertex → dense vertex), region
 *   (per triangle), triChart, dense, charted, stats }
 */
export function tierMesh(f, box, o) {
  const log = o.log ?? (() => {});
  let dense = o.dense;
  if (!dense) { dense = surfaceNets(f, box, o.h, { log }); fixWinding(dense.indices); }
  const nD = dense.position.length / 3;
  const regions = o.regions ?? [{ name: 'all', target: o.target, flags: o.flags ?? [], select: () => true }];
  const nw = o.normalWeight ?? 0.5, uw = o.uvWeight ?? 2;
  const X = o.extraAttrs, k = X ? X.weights.length : 0;
  const regionOfTri = (mesh, chartOf) => {
    const I = mesh.indices, P = mesh.position, out = new Uint8Array(I.length / 3);
    for (let t = 0; t < out.length; t++) {
      const c = [0, 1, 2].map((q) => (P[I[t * 3] * 3 + q] + P[I[t * 3 + 1] * 3 + q] + P[I[t * 3 + 2] * 3 + q]) / 3);
      let r = 0;
      while (r < regions.length - 1 && !(regions[r].select ? regions[r].select(c, chartOf ? chartOf(t) : -1) : false)) r++;
      out[t] = r;
    }
    return out;
  };
  const attrsFor = (normal, uv, src, n) => {
    const stride = 3 + (uv ? 2 : 0) + k, A = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      let q = i * stride;
      A[q++] = normal[i * 3]; A[q++] = normal[i * 3 + 1]; A[q++] = normal[i * 3 + 2];
      if (uv) { A[q++] = uv[i * 2]; A[q++] = uv[i * 2 + 1]; }
      for (let j = 0; j < k; j++) A[q++] = X.data[src[i] * k + j];
    }
    const weights = [nw, nw, nw, ...(uv ? [uw, uw] : []), ...(X ? X.weights : [])];
    return { attrs: A, stride, weights };
  };
  // forced charts per triangle (forceTri(centroid) → chart index or −1)
  const forceFor = (mesh) => {
    if (!o.forceTri) return null;
    const I = mesh.indices, P = mesh.position, out = new Int16Array(I.length / 3);
    for (let t = 0; t < out.length; t++) out[t] = o.forceTri([0, 1, 2].map((q) => (P[I[t * 3] * 3 + q] + P[I[t * 3 + 1] * 3 + q] + P[I[t * 3 + 2] * 3 + q]) / 3));
    return out;
  };
  let tier, charted, region, simp;
  if (o.simplifyFirst) {
    const ident = Uint32Array.from({ length: nD }, (_, i) => i);
    const A = attrsFor(dense.normal, null, ident, nD);
    const lock = o.lockDense ?? null;
    simp = simplifyRegions(dense, regionOfTri(dense, null), regions, { ...A, lock, log });
    const c = compactMesh(dense, simp.indices, ['position', 'normal']);
    const m1 = { position: c.position, normal: c.normal, indices: c.indices };
    const pf = (p, n, v) => o.prefer(p, n, c.map[v]);
    charted = o.resolve ? chartResolve(m1, o.charts, pf, { ...o.resolve, force: forceFor(m1), log }) : chartMesh(m1, o.charts, pf, { force: forceFor(m1) });
    const source = new Uint32Array(charted.source.length);
    for (let i = 0; i < source.length; i++) source[i] = c.map[charted.source[i]];
    tier = { position: charted.position, normal: charted.normal, uv: charted.uv, depth: charted.depth, indices: charted.indices, chart: charted.chart, source, triChart: charted.triChart };
    region = simp.region;
  } else {
    const force = o.force ?? forceFor(dense);
    charted = o.resolve ? chartResolve(dense, o.charts, o.prefer, { ...o.resolve, force, log }) : chartMesh(dense, o.charts, o.prefer, { force });
    // (what the projections fold on the dense mesh laid flat before the simplification, which keeps those seams)
    if (o.repair !== false && o.denseRepair !== false) charted = repairFolds(charted, o.charts, { ...(o.repair ?? {}), overlap: null, ...(o.denseRepair ?? {}), log }).mesh;
    log(`  dense charted: ${charted.position.length / 3} vertices; ${chartTally(charted.triChart, o.charts)}`);
    const n = charted.position.length / 3;
    const A = attrsFor(charted.normal, charted.uv, charted.source, n);
    let lock = null;
    if (o.lockDense) { lock = new Uint8Array(n); for (let i = 0; i < n; i++) lock[i] = o.lockDense[charted.source[i]]; }
    const tc = charted.triChart;
    simp = simplifyRegions(charted, regionOfTri(charted, (t) => tc[t]), regions, { ...A, lock, weld: charted.source, log });
    // the kept triangles' charts: the corners' chart (every corner of a charted triangle has its chart)
    const c = compactMesh(charted, simp.indices, ['position', 'normal', 'uv', 'chart', 'source', 'depth']);
    const triChart = new Int16Array(c.indices.length / 3);
    for (let t = 0; t < triChart.length; t++) triChart[t] = c.chart[c.indices[t * 3]];
    tier = { position: c.position, normal: c.normal, uv: c.uv, depth: c.depth, indices: c.indices, chart: c.chart, source: c.source, triChart };
    region = simp.region;
  }
  let repair = null;
  log(`  simplified: ${chartTally(tier.triChart, o.charts)}`);
  if (o.repair !== false) {
    const r = repairFolds(tier, o.charts, { ...(o.repair ?? {}), log });
    tier = r.mesh; repair = r.stats;
  }
  const tangent = MeshoptTangents.generateTangents(tier.indices, tier.position, 3, tier.normal, 3, tier.uv, 2);
  // (a triangle with no UV area gives a NaN tangent: the vertex normal's perpendicular instead)
  for (let i = 0; i < tangent.length / 4; i++) {
    if (Number.isFinite(tangent[i * 4]) && Math.hypot(tangent[i * 4], tangent[i * 4 + 1], tangent[i * 4 + 2]) > 0.5) continue;
    const n = [tier.normal[i * 3], tier.normal[i * 3 + 1], tier.normal[i * 3 + 2]], a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2], t = [a[0] - d * n[0], a[1] - d * n[1], a[2] - d * n[2]], l = Math.hypot(...t) || 1;
    tangent[i * 4] = t[0] / l; tangent[i * 4 + 1] = t[1] / l; tangent[i * 4 + 2] = t[2] / l; tangent[i * 4 + 3] = 1;
  }
  const nT = tier.indices.length / 3;
  log(`tier mesh: ${tier.position.length / 3} vertices, ${nT} triangles (dense ${dense.indices.length / 3}, charted ${charted.position.length / 3} vertices${repair ? `, ${repair.islands} patch islands` : ''})`);
  return { ...tier, tangent, region, dense, charted, stats: { regions: regions.map((R, r) => ({ name: R.name, target: R.target, triangles: region.reduce((a, x) => a + (x === r ? 1 : 0), 0), error: simp.errors[r] })), locked: simp.locked, repair } };
}
