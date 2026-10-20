// From a dense surface-net mesh to a tier's render mesh: the UV charts, simplification region by region to each
// region's own triangle target (meshoptimizer, aware of the normals, the UVs and any extra per-vertex data the caller
// gives, e.g. the head morphs' displacements, so the vertices those need survive), the folds the simplification made
// in UV laid flat again (charts.repairFolds), and per-vertex tangents for the normal map (vertexTangents: meshopt's
// are per triangle corner; a vertex whose corners disagree is split). meshoptimizer only drops vertices
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

/**
 * Triangles `isIn(centroid)` accepts (a region never seen: the skin inside a resting eye globe) replaced by fans over
 * each boundary loop of that region, from the loop's first vertex, wound as the triangles they replace: the far tier's
 * caps inside the globes keep only the junction ring. No vertex is added. Returns { indices, region, removed, added }.
 */
export function refillRegions(P, indices, region, isIn) {
  const nt = indices.length / 3, drop = new Uint8Array(nt);
  let removed = 0;
  for (let t = 0; t < nt; t++) {
    const c = [0, 1, 2].map((q) => (P[indices[t * 3] * 3 + q] + P[indices[t * 3 + 1] * 3 + q] + P[indices[t * 3 + 2] * 3 + q]) / 3);
    if (isIn(c)) { drop[t] = 1; removed++; }
  }
  if (!removed) return { indices, region, removed: 0, added: 0 };
  // the dropped region's boundary: its half-edges a → b whose twin b → a is not dropped
  const H = new Set(), key = (a, b) => a * 4194304 + b;
  for (let t = 0; t < nt; t++) if (drop[t]) for (let k = 0; k < 3; k++) H.add(key(indices[t * 3 + k], indices[t * 3 + (k + 1) % 3]));
  const next = new Map(), regOf = new Map();
  for (let t = 0; t < nt; t++) if (drop[t]) for (let k = 0; k < 3; k++) {
    const a = indices[t * 3 + k], b = indices[t * 3 + (k + 1) % 3];
    if (H.has(key(b, a))) continue;
    if (!next.has(a)) next.set(a, []);
    next.get(a).push(b); regOf.set(a, region[t]);
  }
  const out = [], outR = [], used = new Set();
  for (let t = 0; t < nt; t++) if (!drop[t]) { out.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]); outR.push(region[t]); }
  let added = 0, bad = false;
  for (const [a0, outs] of next) for (const b0 of outs) {
    if (used.has(key(a0, b0))) continue;
    const loop = [a0];
    let a = a0, b = b0, guard = 0;
    used.add(key(a, b));
    while (b !== a0 && guard++ < 1e5) { loop.push(b); const c = (next.get(b) ?? []).find((x) => !used.has(key(b, x))); if (c === undefined) { bad = true; break; } a = b; b = c; used.add(key(a, b)); }
    if (bad || loop.length < 3) { bad = true; break; }
    for (let i = 1; i + 1 < loop.length; i++) { out.push(loop[0], loop[i], loop[i + 1]); outR.push(regOf.get(a0)); added++; }
  }
  // (a boundary that is not a set of simple loops: keep the triangles as they were)
  if (bad) return { indices, region, removed: 0, added: 0 };
  return { indices: Uint32Array.from(out), region: Uint8Array.from(outR), removed, added };
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
    const rOf = regionOfTri(dense, null);
    simp = simplifyRegions(dense, rOf, regions, { ...A, lock, log });
    if (o.refill) {
      // (the triangles the refill frees go back to the regions: simplified again to targets raised by as many)
      let rf = refillRegions(dense.position, simp.indices, simp.region, o.refill);
      const saved = rf.removed - rf.added;
      if (saved > 0) {
        const total = regions.reduce((a, R) => a + R.target, 0);
        const regions2 = regions.map((R) => ({ ...R, target: Math.round(R.target * (1 + saved / total)) }));
        simp = simplifyRegions(dense, rOf, regions2, { ...A, lock, log });
        rf = refillRegions(dense.position, simp.indices, simp.region, o.refill);
      }
      if (rf.removed) { simp.indices = rf.indices; simp.region = rf.region; log(`  refilled ${rf.removed} hidden triangles with ${rf.added}`); }
    }
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
  // (triangles with two corners on one dense vertex — chart copies of it, or the same index — have no area, no tangent
  // frame and no edges of the welded skin: dropped, the skin stays closed)
  {
    const d = dropZeroArea(tier);
    if (d.dropped) { tier = d.mesh; region = Uint8Array.from(d.keep, (t) => region[t]); log(`  dropped ${d.dropped} triangles with no area or doubled (${d.duplicates})`); }
  }
  if (o.repair !== false) {
    const r = repairFolds(tier, o.charts, { ...(o.repair ?? {}), log });
    tier = r.mesh; repair = r.stats;
  }
  // per-vertex tangents (meshopt's are per corner: vertices whose corners disagree are split, every per-vertex array
  // carried to the copies, so `source` still maps each to its dense vertex)
  const vt = vertexTangents(tier, { keys: ['position', 'normal', 'uv', 'chart', 'source', 'depth'] });
  tier = { ...vt.mesh, triChart: tier.triChart };
  const tangent = vt.tangent;
  const nT = tier.indices.length / 3;
  log(`tier mesh: ${tier.position.length / 3} vertices, ${nT} triangles (dense ${dense.indices.length / 3}, charted ${charted.position.length / 3} vertices${repair ? `, ${repair.islands} patch islands` : ''}); tangents: ${vt.stats.split} vertices split, ${vt.stats.fallback} without UV area`);
  return { ...tier, tangent, region, dense, charted, stats: { regions: regions.map((R, r) => ({ name: R.name, target: R.target, triangles: region.reduce((a, x) => a + (x === r ? 1 : 0), 0), error: simp.errors[r] })), locked: simp.locked, repair, tangents: vt.stats } };
}

/**
 * Per-vertex tangents for a normal map (glTF TANGENT: xyz unit and perpendicular to the vertex normal, w = ±1 with the
 * bitangent cross(N, T)·w pointing up the image, i.e. toward −v: the glTF / three.js convention, which the baker's
 * tangentNormals follows). meshoptimizer's generateTangents (MikkTSpace-like) returns one tangent per triangle corner
 * (index_count × 4) with its bitangent along +v; here the corners of each vertex are summed weighted by their 3D angle,
 * the sum made perpendicular to the vertex normal (Gram–Schmidt) and w taken from the corners. Where a vertex's corners
 * disagree (opposite w, or tangents more than `maxAngle`° apart, as across a UV fold or mirror), the vertex is split:
 * one copy per group of agreeing corners, each copy carrying every per-vertex array in `keys`. A vertex none of whose
 * triangles has UV area (the hidden chart's, the teeth's constant UV) gets a perpendicular of its normal, w +1.
 * @param mesh { position, normal, uv, indices, [keys]: per-vertex arrays }
 * @param o { keys (default position, normal, uv), maxAngle (45) }
 * @returns { mesh: { ...keys arrays (split), indices }, tangent: Float32Array(n·4), stats: { split, fallback, corners } }
 */
export function vertexTangents(mesh, { keys = ['position', 'normal', 'uv'], maxAngle = 45 } = {}) {
  const I = mesh.indices, P = mesh.position, N = mesh.normal, UV = mesh.uv, nv = P.length / 3, nc = I.length;
  const C = MeshoptTangents.generateTangents(I instanceof Uint32Array ? I : Uint32Array.from(I), P, 3, N, 3, UV, 2);
  if (C.length !== nc * 4) throw new Error(`vertexTangents: expected ${nc * 4} corner floats, got ${C.length}`);
  const cosMax = Math.cos((maxAngle * Math.PI) / 180);
  // each corner: its angle in 3D (the weight), whether its triangle has UV area, its tangent and its glTF sign
  const ang = new Float64Array(nc), ok = new Uint8Array(nc), sgn = new Int8Array(nc);
  for (let t = 0; t < nc / 3; t++) {
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const du1 = UV[v[1] * 2] - UV[v[0] * 2], dv1 = UV[v[1] * 2 + 1] - UV[v[0] * 2 + 1], du2 = UV[v[2] * 2] - UV[v[0] * 2], dv2 = UV[v[2] * 2 + 1] - UV[v[0] * 2 + 1];
    const det = du1 * dv2 - du2 * dv1;
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
      const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
      const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
      const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
      ang[t * 3 + k] = l1 > 0 && l2 > 0 ? Math.acos(Math.max(-1, Math.min(1, (e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]) / (l1 * l2)))) : 0;
      const q = (t * 3 + k) * 4, tl = Math.hypot(C[q], C[q + 1], C[q + 2]);
      ok[t * 3 + k] = Math.abs(det) > 1e-14 && Number.isFinite(tl) && tl > 0.5 && ang[t * 3 + k] > 0 ? 1 : 0;
      // (meshopt's bitangent runs along +v; glTF's normal map +y is up the image, −v: the sign flipped)
      sgn[t * 3 + k] = C[q + 3] < 0 ? 1 : -1;
    }
  }
  const byV = Array.from({ length: nv }, () => []);
  for (let k = 0; k < nc; k++) byV[I[k]].push(k);
  const out = [], extra = [], newIndex = Uint32Array.from(I);
  let split = 0, fallback = 0;
  const perp = (n) => {
    const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
    const t = [a[0] - d * n[0], a[1] - d * n[1], a[2] - d * n[2]], l = Math.hypot(...t) || 1;
    return [t[0] / l, t[1] / l, t[2] / l];
  };
  const finish = (n, T) => {
    const d = T[0] * n[0] + T[1] * n[1] + T[2] * n[2], t = [T[0] - d * n[0], T[1] - d * n[1], T[2] - d * n[2]], l = Math.hypot(...t);
    return l > 1e-9 ? [t[0] / l, t[1] / l, t[2] / l] : null;
  };
  const tangents = new Array(nv);
  for (let v = 0; v < nv; v++) {
    let n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
    const nl = Math.hypot(...n) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
    // groups of agreeing corners (same sign, tangent within maxAngle of the group's running sum)
    const groups = [];
    for (const k of byV[v]) {
      if (!ok[k]) continue;
      const q = k * 4, T = [C[q] * ang[k], C[q + 1] * ang[k], C[q + 2] * ang[k]], tl = Math.hypot(...T);
      let g = groups.find((G) => G.s === sgn[k] && (G.sum[0] * T[0] + G.sum[1] * T[1] + G.sum[2] * T[2]) / ((Math.hypot(...G.sum) || 1) * (tl || 1)) >= cosMax);
      if (!g) groups.push((g = { s: sgn[k], sum: [0, 0, 0], w: 0, corners: [] }));
      g.sum[0] += T[0]; g.sum[1] += T[1]; g.sum[2] += T[2]; g.w += ang[k]; g.corners.push(k);
    }
    if (!groups.length) { tangents[v] = [...perp(n), 1]; fallback++; continue; }
    groups.sort((a, b) => b.w - a.w);
    // (the heaviest group keeps the vertex; the corners with no UV area stay with it)
    const t0 = finish(n, groups[0].sum) ?? perp(n);
    tangents[v] = [...t0, groups[0].s];
    for (let g = 1; g < groups.length; g++) {
      const id = nv + extra.length;
      extra.push(v);
      out.push([...(finish(n, groups[g].sum) ?? perp(n)), groups[g].s]);
      for (const k of groups[g].corners) newIndex[k] = id;
      split++;
    }
  }
  const m = nv + extra.length, res = { indices: newIndex };
  for (const k of keys) {
    const a = mesh[k];
    if (!a) continue;
    const c = a.length / nv;
    if (!Number.isInteger(c)) throw new Error(`vertexTangents: ${k} is not per vertex`);
    const b = new a.constructor(m * c);
    b.set(a);
    extra.forEach((v, i) => { for (let q = 0; q < c; q++) b[(nv + i) * c + q] = a[v * c + q]; });
    res[k] = b;
  }
  const tangent = new Float32Array(m * 4);
  for (let v = 0; v < nv; v++) tangent.set(tangents[v], v * 4);
  out.forEach((t, i) => tangent.set(t, (nv + i) * 4));
  return { mesh: res, tangent, stats: { split, fallback, corners: nc } };
}

/** The triangles of a charted tier mesh with two corners on the same dense vertex (`source`) dropped, and those on the
 * same three dense vertices as another: wound alike, one is kept; wound oppositely (a flap the simplifier folded back
 * onto its neighbour, or a refill fan closing over a triangle already there: four triangles on each of its edges), both
 * go. Returns { mesh (unused vertices kept), keep (old triangle index per kept triangle), dropped, duplicates (dropped
 * as such), zeroArea (kept triangles with no 3D area) }. */
export function dropZeroArea(mesh) {
  const I = mesh.indices, S = mesh.source, P = mesh.position, nt = I.length / 3, live = new Uint8Array(nt);
  const sid = (v) => (S ? S[v] : v);
  for (let t = 0; t < nt; t++) { const sa = sid(I[t * 3]), sb = sid(I[t * 3 + 1]), sc = sid(I[t * 3 + 2]); live[t] = sa === sb || sb === sc || sa === sc ? 0 : 1; }
  // the same three dense vertices: grouped by the sorted triple, each with its winding (even or odd permutation of it)
  const groups = new Map();
  for (let t = 0; t < nt; t++) {
    if (!live[t]) continue;
    const s = [sid(I[t * 3]), sid(I[t * 3 + 1]), sid(I[t * 3 + 2])], m = s.indexOf(Math.min(...s));
    const r = [s[m], s[(m + 1) % 3], s[(m + 2) % 3]], odd = r[1] > r[2] ? 1 : 0, key = `${r[0]},${Math.min(r[1], r[2])},${Math.max(r[1], r[2])}`;
    if (!groups.has(key)) groups.set(key, [[], []]);
    groups.get(key)[odd].push(t);
  }
  let duplicates = 0;
  for (const [even, odd] of groups.values()) {
    if (even.length + odd.length < 2) continue;
    const pairs = Math.min(even.length, odd.length), d = even.length - pairs > 0 ? even.slice(pairs) : odd.slice(pairs);
    const gone = [...even.slice(0, pairs), ...odd.slice(0, pairs), ...d.slice(1)];
    for (const t of gone) { live[t] = 0; duplicates++; }
  }
  const keep = [];
  let zeroArea = 0;
  for (let t = 0; t < nt; t++) {
    if (!live[t]) continue;
    keep.push(t);
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    if (Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) === 0) zeroArea++;
  }
  const dropped = nt - keep.length;
  if (!dropped) return { mesh, keep, dropped, duplicates, zeroArea };
  const indices = new Uint32Array(keep.length * 3);
  keep.forEach((t, i) => { indices[i * 3] = I[t * 3]; indices[i * 3 + 1] = I[t * 3 + 1]; indices[i * 3 + 2] = I[t * 3 + 2]; });
  const out = { ...mesh, indices };
  if (mesh.triChart) out.triChart = Int16Array.from(keep, (t) => mesh.triChart[t]);
  return { mesh: out, keep, dropped, duplicates, zeroArea };
}

/** The TANGENT gate: per vertex |t| = 1, t ⟂ n and w = ±1 (counts of the vertices that fail each, at `tol`). */
export function tangentCheck(normal, tangent, { tol = 1e-3 } = {}) {
  const n = normal.length / 3;
  if (tangent.length !== n * 4) return { n, stride: tangent.length / n, bad: n };
  let unit = 0, ortho = 0, sign = 0, maxDot = 0, maxLen = 0;
  for (let v = 0; v < n; v++) {
    const t = [tangent[v * 4], tangent[v * 4 + 1], tangent[v * 4 + 2]], w = tangent[v * 4 + 3];
    const N = [normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]], nl = Math.hypot(...N) || 1, tl = Math.hypot(...t);
    const d = Math.abs((t[0] * N[0] + t[1] * N[1] + t[2] * N[2]) / (nl * (tl || 1)));
    if (!(Math.abs(tl - 1) <= tol)) unit++;
    if (!(d <= tol)) ortho++;
    if (w !== 1 && w !== -1) sign++;
    maxDot = Math.max(maxDot, d); maxLen = Math.max(maxLen, Math.abs(tl - 1));
  }
  return { n, stride: 4, unit, ortho, sign, maxDot, maxLen, bad: unit + ortho + sign };
}
