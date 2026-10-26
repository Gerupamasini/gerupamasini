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
  // (round B4 integration: the kept triangles' edges, so a fan whose diagonal runs along one of them — four triangles on
  // that edge, a non-manifold lod2 since the round-B4 trunk shifted the far field — starts from another loop vertex)
  const kept = new Set(), ukey = (a, b) => (a < b ? key(a, b) : key(b, a));
  for (let i = 0; i < out.length; i += 3) for (let k = 0; k < 3; k++) kept.add(ukey(out[i + k], out[i + (k + 1) % 3]));
  const clashes = (L, r) => { let n = 0; for (let i = 2; i + 1 < L.length; i++) if (kept.has(ukey(L[r], L[(r + i) % L.length]))) n++; return n; };
  let added = 0, bad = false;
  for (const [a0, outs] of next) for (const b0 of outs) {
    if (used.has(key(a0, b0))) continue;
    const loop = [a0];
    let a = a0, b = b0, guard = 0;
    used.add(key(a, b));
    while (b !== a0 && guard++ < 1e5) { loop.push(b); const c = (next.get(b) ?? []).find((x) => !used.has(key(b, x))); if (c === undefined) { bad = true; break; } a = b; b = c; used.add(key(a, b)); }
    if (bad || loop.length < 3) { bad = true; break; }
    // (a loop through one vertex twice — a pinched boundary — split there into simple loops, each fanned on its own: one
    // fan over both put four triangles on the apex's edge to that vertex)
    const simple = [], stack = [loop];
    while (stack.length) {
      const Lp = stack.pop(), seen = new Map();
      let cut = null;
      for (let i = 0; i < Lp.length && !cut; i++) { if (seen.has(Lp[i])) cut = [seen.get(Lp[i]), i]; else seen.set(Lp[i], i); }
      if (!cut) { if (Lp.length >= 3) simple.push(Lp); continue; }
      stack.push(Lp.slice(cut[0], cut[1]), Lp.slice(cut[1]).concat(Lp.slice(0, cut[0])));
    }
    for (const lp of simple) {
      // (the fan's apex: the loop's first vertex unless one of its diagonals is a kept edge, then the first that has none
      // — or the fewest)
      let r0 = 0, best = clashes(lp, 0);
      for (let r = 1; r < lp.length && best > 0; r++) { const c = clashes(lp, r); if (c < best) { best = c; r0 = r; } }
      const L = lp.slice(r0).concat(lp.slice(0, r0));
      for (let i = 1; i + 1 < L.length; i++) { out.push(L[0], L[i], L[i + 1]); outR.push(regOf.get(a0)); added++; }
      for (let i = 2; i + 1 < L.length; i++) kept.add(ukey(L[0], L[i]));
    }
  }
  // (a boundary that is not a set of simple loops: keep the triangles as they were)
  if (bad) return { indices, region, removed: 0, added: 0 };
  return { indices: Uint32Array.from(out), region: Uint8Array.from(outR), removed, added };
}

/**
 * A closed skin made 2-manifold where its dense mesh is not (2026-10-26: the lip and eye round's sealed lod1 field gave
 * its dense mesh 8 edges with more than two triangles — the upper-lip pad touching the lower jaw along an edge on each
 * side, which fishmesh.splitPinches' field pairing did not part, and at the left cup a triangle doubled by the cap of a
 * three-edge hole — and the simplification keeps such edges as they are):
 *   1. a triangle each of whose edges has more than two triangles, and without which each has two wound oppositely, is
 *      dropped (a stray copy over the cap the hole got)
 *   2. each end of an edge still shared by more than two triangles split by its fans — its triangles joined only across
 *      the edges two of them share —: one copy a fan beyond the first, every copy and the original eased `apart` mm into
 *      its own sheet's solid along its fan's area normal (splitPinches' rule), so the parted sheets share no point
 * New vertices are appended (normal and source as the original's). Returns { mesh (mesh's own when nothing changed),
 * dropped, split, nonManifold (edges left) }.
 */
export function manifoldSkin(mesh, { apart = 0.002 } = {}) {
  const P = mesh.position, nv = P.length / 3;
  let I = Array.from(mesh.indices);
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edges = () => { const E = new Map(); for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) { const q = key(I[t * 3 + k], I[t * 3 + (k + 1) % 3]); let l = E.get(q); if (!l) E.set(q, (l = [])); l.push(t); } return E; };
  const dir = (t, a, b) => { for (let k = 0; k < 3; k++) if (I[t * 3 + k] === a && I[t * 3 + (k + 1) % 3] === b) return 1; return -1; };
  let E = edges(), dropped = 0;
  // 1. the stray triangles
  const drop = new Set();
  for (const [q, l] of E) {
    if (l.length <= 2) continue;
    for (const t of l) {
      if (drop.has(t)) continue;
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], rest = E.get(key(a, b)).filter((u) => u !== t && !drop.has(u));
        if (rest.length !== 2 || dir(rest[0], a, b) + dir(rest[1], a, b) !== 0) ok = false;
      }
      if (ok) drop.add(t);
    }
  }
  if (drop.size) { I = I.filter((_, i) => !drop.has((i / 3) | 0)); dropped = drop.size; E = edges(); }
  // 2. the ends of the edges left split by their fans (found on the topology as it is, then the copies put in): each
  // end's triangles joined across the edges only two triangles share; a crowded edge's four triangles fall into two
  // pairs at each end, each pair wound oppositely along it (else the edge is left). Two sheets touching pair them alike
  // at both ends: both ends split. Where the surface folds onto itself along the edge the ends pair them crosswise:
  // splitting one end alone parts it (the edge's two pairs then meet the other end as one fan), so only one is
  const ends = new Set(), crowded = [];
  for (const [q, l] of E) if (l.length > 2) { const e = [Math.floor(q / 4194304), q % 4194304]; ends.add(e[0]); ends.add(e[1]); crowded.push([e, l]); }
  const vt = new Map();
  if (ends.size) for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (ends.has(v)) { let l = vt.get(v); if (!l) vt.set(v, (l = [])); l.push(t); } }
  const fanOf = new Map();
  for (const v of ends) {
    const ts = vt.get(v) ?? [], pa = new Map(ts.map((t) => [t, t]));
    const f = (a) => { while (pa.get(a) !== a) { pa.set(a, pa.get(pa.get(a))); a = pa.get(a); } return a; };
    for (const t of ts) for (let k = 0; k < 3; k++) {
      const w = I[t * 3 + k];
      if (w === v) continue;
      const l = E.get(key(v, w));
      if (l.length !== 2) continue;
      const u = l[0] === t ? l[1] : l[0], a = f(u), b = f(t);
      if (a !== b) pa.set(b, a);
    }
    fanOf.set(v, new Map(ts.map((t) => [t, f(t)])));
  }
  const splitV = new Set(), holdV = new Set();
  for (const [[a, b], l] of crowded) {
    if (l.length !== 4) continue;
    // (the pairing at an end: the partner of l[0] among the other three, when the fans make two pairs wound oppositely)
    const pairing = (v) => {
      const F = fanOf.get(v), mates = l.slice(1).filter((t) => F.get(t) === F.get(l[0]));
      if (mates.length !== 1) return null;
      const rest = l.slice(1).filter((t) => t !== mates[0]);
      if (F.get(rest[0]) !== F.get(rest[1]) || F.get(rest[0]) === F.get(l[0])) return null;
      if (dir(l[0], a, b) + dir(mates[0], a, b) !== 0 || dir(rest[0], a, b) + dir(rest[1], a, b) !== 0) return null;
      return mates[0];
    };
    const pa = pairing(a), pb = pairing(b);
    if (pa !== null && pa === pb) { splitV.add(a); splitV.add(b); }
    else if (pa !== null) { splitV.add(a); holdV.add(b); }
    else if (pb !== null) { splitV.add(b); holdV.add(a); }
  }
  const extra = [], moved = new Set(), redo = [];
  for (const v of splitV) {
    if (holdV.has(v)) continue;
    const F = fanOf.get(v), roots = [...new Set(F.values())];
    if (roots.length < 2) continue;
    moved.add(v);
    for (let r = 1; r < roots.length; r++) {
      const c = nv + extra.length;
      extra.push(v); moved.add(c);
      for (const [t, rt] of F) if (rt === roots[r]) for (let k = 0; k < 3; k++) if (I[t * 3 + k] === v) redo.push([t * 3 + k, c]);
    }
  }
  for (const [i, c] of redo) I[i] = c;
  if (!dropped && !extra.length) return { mesh, dropped: 0, split: 0, nonManifold: 0 };
  const m = nv + extra.length, position = new Float32Array(m * 3), normal = new Float32Array(m * 3);
  position.set(P); normal.set(mesh.normal);
  const source = mesh.source ? new Uint32Array(m) : null;
  if (source) source.set(mesh.source);
  extra.forEach((v, i) => { position.set(P.subarray(v * 3, v * 3 + 3), (nv + i) * 3); normal.set(mesh.normal.subarray(v * 3, v * 3 + 3), (nv + i) * 3); if (source) source[nv + i] = mesh.source[v]; });
  if (apart > 0 && moved.size) {
    const fan = new Float64Array(m * 3);
    for (let t = 0; t < I.length / 3; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (!moved.has(a) && !moved.has(b) && !moved.has(c)) continue;
      const u = [0, 1, 2].map((k) => position[b * 3 + k] - position[a * 3 + k]), w = [0, 1, 2].map((k) => position[c * 3 + k] - position[a * 3 + k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const x of [a, b, c]) if (moved.has(x)) for (let k = 0; k < 3; k++) fan[x * 3 + k] += n[k];
    }
    for (const x of moved) { const l = Math.hypot(fan[x * 3], fan[x * 3 + 1], fan[x * 3 + 2]); if (l > 0) for (let k = 0; k < 3; k++) position[x * 3 + k] -= (apart * fan[x * 3 + k]) / l; }
  }
  const indices = Uint32Array.from(I);
  let left = 0; { const E2 = new Map(); for (let t = 0; t < indices.length; t += 3) for (let k = 0; k < 3; k++) { const q = key(indices[t + k], indices[t + (k + 1) % 3]); E2.set(q, (E2.get(q) ?? 0) + 1); } for (const c of E2.values()) if (c > 2) left++; }
  return { mesh: { ...mesh, position, normal, indices, ...(source ? { source } : {}) }, dropped, split: extra.length, nonManifold: left };
}

/**
 * The decimation lock's held triangles on T3's own UVs (2026-10-26): each held triangle of a tier mesh — its three dense
 * vertices a held lock triangle's — gets at each corner the copy that holds the lock's corner UV (T3's GLB, uint16) in
 * T3's chart (the lock's; a rect the patch packs into — the patch's, a spare's — the patch), a new copy where none does
 * (where T3's repair had moved it: its mends in a chart, its patch islands; or where T3's charting differs), and is kept
 * as it is by the repair (charts.repairFolds' keep: never bad, never grown into a patch island, never moved by a mend;
 * the islands it lays packed round T3's, charts.packAround). Most corners have that copy already: frozenPlan chose it,
 * this charting mapping the place as T3's did. The atlas outside the zones is then T3's to the texel, the pectoral
 * lobes' (wrapping charts, whose seam frozenPlan's first copy crossed the wrong way) and the patch islands' too. A lock
 * without UVs: a held triangle across two charts is sent to the patch unlaid instead (its UVs spanned the atlas, and
 * the overlap test then failed whatever chart lay under it: 206 of domeL's triangles under one held bodyL sliver).
 * @param mesh { position, normal, uv, depth, indices, chart, source (dense vertex), triChart }
 * @param held [{ t (lock triangle), w (its corners' dense vertices, in the lock's order) }]
 * @param L    the lock in effect ({ tris: { uv, chart } })
 * @returns { mesh (vertices appended), keep (per triangle), kept, moved (kept on new copies), copies, relayed }
 */
export function restoreHeld(mesh, held, L, charts, { spare = [] } = {}) {
  const I = Uint32Array.from(mesh.indices), S = mesh.source, nt = I.length / 3, nv0 = mesh.position.length / 3;
  const triChart = Int16Array.from(mesh.triChart), keep = new Uint8Array(nt);
  const key = (a, b, d) => [a, b, d].sort((x, y) => x - y).join(','), byKey = new Map();
  for (const h of held) byKey.set(key(...h.w), h);
  const LUV = L.tris.uv ?? null, patch = charts.findIndex((C) => C.relay), spareSet = new Set(spare), q = (x) => Math.round(x * 65535);
  // (the copies by dense vertex, chart and uint16 UV)
  const have = new Map(), qk = (sv, ch, u, w) => `${sv}:${ch}:${q(u)}:${q(w)}`;
  for (let v = 0; v < nv0; v++) have.set(qk(S[v], mesh.chart[v], mesh.uv[v * 2], mesh.uv[v * 2 + 1]), v);
  const from = [], uvOf = [], chOf = [];
  const copy = (v, ch, u, w) => { const k = qk(S[v], ch, u, w); let x = have.get(k); if (x === undefined) { x = nv0 + from.length; have.set(k, x); from.push(v); uvOf.push([u, w]); chOf.push(ch); } return x; };
  let kept = 0, moved = 0, relayed = 0;
  for (let t = 0; t < nt; t++) {
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], h = byKey.get(key(S[v[0]], S[v[1]], S[v[2]]));
    if (!h) continue;
    if (!LUV) {
      if (patch >= 0 && !(mesh.chart[v[1]] === mesh.chart[v[0]] && mesh.chart[v[2]] === mesh.chart[v[0]])) {
        const R = charts[patch].rect;
        for (let k = 0; k < 3; k++) I[t * 3 + k] = copy(v[k], patch, R[0], R[1]);
        triChart[t] = patch; relayed++;
      }
      continue;
    }
    const was = L.tris.chart?.[h.t] ?? null;
    let ch = was ? charts.findIndex((C) => C.name === was) : -1;
    if (ch < 0 || charts[ch].relay || spareSet.has(was)) ch = patch;
    if (ch < 0) continue;
    let fresh = false;
    for (let k = 0; k < 3; k++) {
      const j = h.w.indexOf(S[v[k]]), u = LUV[h.t * 6 + j * 2], w = LUV[h.t * 6 + j * 2 + 1];
      if (mesh.chart[v[k]] === ch && q(mesh.uv[v[k] * 2]) === q(u) && q(mesh.uv[v[k] * 2 + 1]) === q(w)) continue;
      I[t * 3 + k] = copy(v[k], ch, u, w); fresh = true;
    }
    triChart[t] = ch; keep[t] = 1; kept++; if (fresh) moved++;
  }
  const out = { ...mesh, indices: I, triChart };
  if (from.length) {
    for (const nm of ['position', 'normal', 'uv', 'chart', 'source', 'depth']) {
      const a = mesh[nm];
      if (!a) continue;
      const w = a.length / nv0, b = new a.constructor((nv0 + from.length) * w);
      b.set(a); from.forEach((v, i) => { for (let k = 0; k < w; k++) b[(nv0 + i) * w + k] = a[v * w + k]; });
      out[nm] = b;
    }
    for (let i = 0; i < from.length; i++) {
      const u = nv0 + i, C = charts[chOf[i]], p = [0, 1, 2].map((k) => out.position[u * 3 + k]), n = [0, 1, 2].map((k) => out.normal[u * 3 + k]);
      out.uv[u * 2] = uvOf[i][0]; out.uv[u * 2 + 1] = uvOf[i][1]; out.chart[u] = chOf[i];
      // (the depth along the chart's rays, for the repair's overlap test; the patch has none)
      if (out.depth) out.depth[u] = C.relay ? 0 : C.project(p, n)[2] ?? 0;
    }
  }
  return { mesh: out, keep, kept, moved, copies: from.length, relayed };
}

/**
 * (2026-10-26, round 3) A dense mesh's vertices inside `inside(p)` (fish mm) faired along the surface: `iters` rounds of
 * the umbrella step (each vertex `lambda` of the way to its neighbours' mean), each followed by a projection back onto
 * the field's zero set (two Newton steps along its numeric gradient, step `eps` mm). The surface nets' vertices sit at
 * their cells' mass points, so a crease sharper than the cell — the cup's lip under the globe at lod1's 0.16 mm, its
 * rounding 0.010 HL — comes out a staircase along its length, which no simplification error takes out (the lod1 "saw
 * teeth" along the cup's lip in clay; the hero's 0.09 mm cell rounds it). Positions are copied, not changed in place
 * (the dense mesh's vertex ids stay, so `source`, the rig rows and the morphs carry over as before). Returns { position,
 * moved (vertices), max (mm) }.
 */
export function fairBand(dense, f, inside, { iters = 6, lambda = 0.5, mu = 0, project: onto = true, normals = 'field', hold = null, eps = 0.01, nh = null } = {}) {
  const P0 = dense.position, I = dense.indices, nv = P0.length / 3, P = Float32Array.from(P0);
  const band = new Uint8Array(nv);
  let n = 0;
  for (let v = 0; v < nv; v++) if (!(hold && hold[v]) && inside([P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]])) { band[v] = 1; n++; }
  if (!n) return { position: P0, moved: 0, max: 0 };
  const nb = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3];
    if (band[a]) { let s = nb.get(a); if (!s) nb.set(a, (s = new Set())); s.add(b); }
    if (band[b]) { let s = nb.get(b); if (!s) nb.set(b, (s = new Set())); s.add(a); }
  }
  const project = (p) => {
    for (let k = 0; k < 2; k++) {
      const d = f(p[0], p[1], p[2]);
      const g = [(f(p[0] + eps, p[1], p[2]) - f(p[0] - eps, p[1], p[2])) / (2 * eps), (f(p[0], p[1] + eps, p[2]) - f(p[0], p[1] - eps, p[2])) / (2 * eps), (f(p[0], p[1], p[2] + eps) - f(p[0], p[1], p[2] - eps)) / (2 * eps)];
      const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (!(g2 > 1e-12)) break;
      for (let q = 0; q < 3; q++) p[q] -= (d * g[q]) / g2;
    }
    return p;
  };
  // (a step `w` of the way to the neighbours' mean: lambda, then Taubin's mu < 0 when given — so the crease is rounded
  // without the band shrinking —, each optionally followed by the projection)
  const step = (w) => {
    const Q = Float32Array.from(P);
    for (const [v, s] of nb) {
      const m = [0, 0, 0];
      for (const u of s) for (let q = 0; q < 3; q++) m[q] += P[u * 3 + q] / s.size;
      const p = [0, 1, 2].map((q) => P[v * 3 + q] + w * (m[q] - P[v * 3 + q]));
      if (onto) project(p);
      for (let q = 0; q < 3; q++) Q[v * 3 + q] = p[q];
    }
    P.set(Q);
  };
  for (let it = 0; it < iters; it++) { step(lambda); if (mu) step(mu); }
  // (the moved vertices' normals: from the field again, as the mesher takes them — central differences at half the
  // cell —, or normals 'mesh': the faired mesh's own, its triangles' area-weighted, so the shading follows the rounded
  // crease instead of the field's sharp one; their neighbours' too)
  const N = dense.normal ? Float32Array.from(dense.normal) : null, gh = nh ?? eps;
  let max = 0;
  for (const v of nb.keys()) max = Math.max(max, Math.hypot(P[v * 3] - P0[v * 3], P[v * 3 + 1] - P0[v * 3 + 1], P[v * 3 + 2] - P0[v * 3 + 2]));
  if (N && normals === 'mesh') {
    const want = new Set(nb.keys()); for (const s of nb.values()) for (const u of s) want.add(u);
    const acc = new Map([...want].map((v) => [v, [0, 0, 0]]));
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (!acc.has(a) && !acc.has(b) && !acc.has(c)) continue;
      const u = [0, 1, 2].map((q) => P[b * 3 + q] - P[a * 3 + q]), w = [0, 1, 2].map((q) => P[c * 3 + q] - P[a * 3 + q]);
      const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const x of [a, b, c]) { const m = acc.get(x); if (m) for (let q = 0; q < 3; q++) m[q] += fn[q]; }
    }
    for (const [v, m] of acc) {
      const l = Math.hypot(...m);
      if (!(l > 0)) continue;
      // (wound outward as the field's gradient)
      const sg = m[0] * N[v * 3] + m[1] * N[v * 3 + 1] + m[2] * N[v * 3 + 2] < 0 ? -1 : 1;
      for (let q = 0; q < 3; q++) N[v * 3 + q] = (sg * m[q]) / l;
    }
  } else if (N) for (const v of nb.keys()) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const g = [f(x + gh, y, z) - f(x - gh, y, z), f(x, y + gh, z) - f(x, y - gh, z), f(x, y, z + gh) - f(x, y, z - gh)], l = Math.hypot(...g) || 1;
    for (let q = 0; q < 3; q++) N[v * 3 + q] = g[q] / l;
  }
  return { position: P, normal: N, moved: nb.size, max };
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

// ------------------------------------------------------------------------------------------------ the decimation lock

/** The decimation lock in effect while `fn` runs (2026-10-25; decimlock.mjs, build.mjs lighterSkin): `L` { tris:
 * { position (mm), indices, chart (per triangle: a chart name or null), uv (per triangle corner, 2026-10-26: its UV in
 * that simplification's GLB; null in an older lock), focus (null, or { inside(p mm) → bool, error, label }: a part of
 * the free surface simplified to a finer error) } — a former simplification of this tier —, free(centroid) → bool —
 * where it may change —, changedCell(key) → bool and cell (mm) — the dense cells the sculpt changed since —, label };
 * tierMesh holds every triangle of it outside `free` on unchanged dense skin and simplifies the rest (frozenPlan), the
 * held ones on their own UVs (restoreHeld). null: none. Returns fn's result; tierMesh's stats.frozen report it. */
let DECIMATION_LOCK = null;
export function withDecimationLock(L, fn) {
  const prev = DECIMATION_LOCK;
  DECIMATION_LOCK = L;
  try { return fn(); } finally { DECIMATION_LOCK = prev; }
}

/** (2026-10-26, round 2) The decimation lock's floor (decimlock FLOOR, `L.tris.floor`: { inside(p mm) → bool, label }):
 * each vertex of `position` (mm, in place) inside it that lies below the lock's skin there — the lowest lock triangle
 * whose (s, z) projection holds the vertex's: the skin's underside — lifted onto it. Returns { lifted, max (mm) }. */
export function floorToLock(position, L) {
  const F = L?.tris?.floor;
  if (!F) return { lifted: 0, max: 0 };
  const LP = L.tris.position, LI = L.tris.indices, tris = [], B = F.box, m = 2;
  for (let t = 0; t < LI.length / 3; t++) {
    const p = [0, 1, 2].map((k) => [LP[LI[t * 3 + k] * 3], LP[LI[t * 3 + k] * 3 + 1], LP[LI[t * 3 + k] * 3 + 2]]);
    // (the lock triangles near the box: a corner within `m` mm of it)
    if (!p.some(([s, y, z]) => s >= B.s[0] - m && s <= B.s[1] + m && y >= B.y[0] - m && y <= B.y[1] + m && Math.abs(z) <= B.z + m)) continue;
    tris.push(p);
  }
  let lifted = 0, max = 0;
  for (let v = 0; v < position.length / 3; v++) {
    const s = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
    if (!F.inside([s, y, z])) continue;
    let floor = -Infinity;
    for (const [a, b, c] of tris) {
      // (barycentric in the s–z plane)
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      const w0 = ((b[2] - c[2]) * (s - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, w1 = ((c[2] - a[2]) * (s - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, w2 = 1 - w0 - w1;
      if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
      const yy = w0 * a[1] + w1 * b[1] + w2 * c[1];
      if (floor === -Infinity || yy < floor) floor = yy;
    }
    // (round 3: `share` of the way, F.share — the lock's big triangles chord the chin's curved underside, so the whole way
    // lifts a vertex beside the midline over the skin T3 had at the midline itself)
    if (floor > y + 1e-5 && floor - y <= (F.maxLift ?? Infinity)) { const up = (floor - y) * (F.share ?? 1); position[v * 3 + 1] = y + up; lifted++; max = Math.max(max, up); }
  }
  return { lifted, max };
}

/**
 * (2026-10-26, round 2) Small islands of the slit's wall charts (mouthRoof, mouthFloor, by name) on the outer skin given
 * back to the skin's chart: an edge-connected group of at most `maxTris` triangles in one of them, every triangle across
 * its border in one other chart C (not hidden, not the patch), is laid in C by C's own projection (new vertex copies). The
 * lips' margins facing down / up near the closed mouth's line go with the walls (fishmesh prefer, LIP.band 0.05 HL); the
 * round 1 head turned a few faces at the notch where the median lip meets the pad (s 1 mm, y 1.7–2.0, z −1.1 to −1.4)
 * down within that band, and lod1 kept them as a 5-triangle island of mouthRoof amid the face: baked as the mouth's
 * interior, the dark "sawtooth" teeth on the pad's top in the front views. A group with a held triangle (`keep`) stays.
 * Used under the decimation lock only (lod1, lod2). Returns { mesh, moved, groups }.
 */
export function slitIslandsToSkin(mesh, charts, { names = ['mouthRoof', 'mouthFloor'], maxTris = 12, keep = null } = {}) {
  const I = Uint32Array.from(mesh.indices), S = mesh.source, nt = I.length / 3, nv = mesh.position.length / 3;
  const wall = new Set(names.map((nm) => charts.findIndex((C) => C.name === nm)).filter((k) => k >= 0));
  if (!wall.size) return { mesh, moved: 0, groups: 0 };
  const triChart = Int16Array.from(mesh.triChart ?? Array.from({ length: nt }, (_, t) => mesh.chart[I[t * 3]]));
  // (edge neighbours by dense vertex: across the charts' seams)
  const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`), byE = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const e = ek(S[I[t * 3 + k]], S[I[t * 3 + (k + 1) % 3]]); let a = byE.get(e); if (!a) byE.set(e, (a = [])); a.push(t); }
  const nbrs = (t) => { const out = []; for (let k = 0; k < 3; k++) for (const u of byE.get(ek(S[I[t * 3 + k]], S[I[t * 3 + (k + 1) % 3]])) ?? []) if (u !== t) out.push(u); return out; };
  const seen = new Uint8Array(nt), extra = [], copy = new Map();
  let moved = 0, groups = 0;
  for (let t0 = 0; t0 < nt; t0++) {
    if (seen[t0] || !wall.has(triChart[t0])) continue;
    const ch = triChart[t0], grp = [t0], border = new Set();
    seen[t0] = 1;
    for (let i = 0; i < grp.length && grp.length <= maxTris; i++) for (const u of nbrs(grp[i])) {
      if (triChart[u] === ch) { if (!seen[u]) { seen[u] = 1; grp.push(u); } } else border.add(triChart[u]);
    }
    if (grp.length > maxTris || border.size !== 1 || (keep && grp.some((t) => keep[t]))) continue;
    const c = [...border][0], C = charts[c];
    if (C.hidden || C.relay || C.wrapV || wall.has(c)) continue;
    for (const t of grp) {
      for (let k = 0; k < 3; k++) {
        const v = I[t * 3 + k], key = `${S[v]}:${c}`;
        let w = copy.get(key);
        if (w === undefined) {
          // (the dense vertex's copy C already has, else a new one by C's projection)
          for (let x = 0; x < nv && w === undefined; x++) if (S[x] === S[v] && mesh.chart[x] === c) w = x;
          if (w === undefined) {
            const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q]), n = [0, 1, 2].map((q) => mesh.normal[v * 3 + q]);
            let [a, b, d] = C.project(p, n);
            if (C.crop) { a = (a - C.crop[0]) / (C.crop[2] - C.crop[0]); b = (b - C.crop[1]) / (C.crop[3] - C.crop[1]); }
            w = nv + extra.length; extra.push({ from: v, uv: [C.rect[0] + a * (C.rect[2] - C.rect[0]), C.rect[1] + b * (C.rect[3] - C.rect[1])], d: d ?? 0, c });
          }
          copy.set(key, w);
        }
        I[t * 3 + k] = w;
      }
      triChart[t] = c; moved++;
    }
    groups++;
  }
  if (!moved) return { mesh, moved, groups };
  const out = { ...mesh, indices: I, triChart };
  for (const k of ['position', 'normal', 'uv', 'chart', 'source', 'depth']) {
    const a = mesh[k];
    if (!a) continue;
    const w = a.length / nv, b = new a.constructor((nv + extra.length) * w);
    b.set(a); extra.forEach((e, i) => { for (let q = 0; q < w; q++) b[(nv + i) * w + q] = a[e.from * w + q]; });
    out[k] = b;
  }
  extra.forEach((e, i) => { const u = nv + i; out.uv[u * 2] = e.uv[0]; out.uv[u * 2 + 1] = e.uv[1]; out.chart[u] = e.c; if (out.depth) out.depth[u] = e.d; });
  return { mesh: out, moved, groups };
}

/** Distance from p to triangle abc (closest point, Ericson). */
function pointTriDist(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}
/** Distance from p to segment ab. */
function pointSegDist(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1e-30;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L2));
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2]);
}

/**
 * One region's input with the decimation lock held (2026-10-25): the lock's triangles that lie in the region, outside
 * `free`, on dense skin the sculpt did not change and whose corners are vertices of this mesh at the same place — the
 * frozen ones — as they are (their vertices locked), and the rest of the region's dense surface to simplify, joined to
 * them along each frozen edge that borders it (a lens edge a → b):
 *   1. the dense triangles are labelled by the lock triangle nearest their centroid: free unless it is held (in a zone,
 *      more than two dense edges off a held one, free too: skin the lock never had)
 *   2. the lens edges walked loop by loop; per lens edge the shortest path a → … → b over dense edges (Dijkstra) through
 *      vertices that touch a free-labelled triangle — else, where the free part is thin, any vertex within 1.5 dense
 *      edges of the edge on its free side —, no frozen corner and no vertex an earlier cut took but the loop's previous
 *      one's (two cuts that share no vertex cannot cross); each loop's cuts end to end with their spikes (u → v → u, where
 *      the free part reaches a frozen corner by one edge) dropped: the free part's edge; a vertex met twice: a crossing
 *   3. the free surface: flooded from the dense triangle on the far side of every edge of that walk, never across a cut
 *   4. each lens edge's pocket (between the frozen edge and its path) a fan from a: (a, x_i, x_i+1), wound as the frozen
 *      triangle's neighbour, so the input is one oriented manifold: frozen ∪ pockets ∪ free (checked: every directed
 *      edge round the frozen part and the cuts once, with its twin)
 * A lens edge without a path, a crossing, a stitch that is not manifold or a flood that leaks under the frozen surface
 * (from the cut it started at) unfreezes the frozen triangles there and the plan starts again (up to o.rounds, 60);
 * none left frozen: null (simplified as before).
 * @param P positions (mm)  @param sub the region's triangles (vertex indices)  @param wid vertex → welded id
 * @param L withDecimationLock's  @param o { lockW (per lock vertex: its welded id here, or −1), lockTris (the lock
 *   triangles of this region: simplifyRegions assigns each to one), border(w) → bool (the welded id on another region's
 *   border too), chartOf (per vertex chart index, the charted tiers; null: one copy a vertex), chartIndex(name) → index or
 *   −1, rounds, log, debug (each failing round logged: TOBI_FROZEN_DEBUG=1 in simplifyRegions) }
 * @returns null | { indices (the region's input), lock (vertex indices to lock), frozen, freeTarget, stats }
 */
export function frozenPlan(P, sub, wid, L, o = {}) {
  const log = o.log ?? (() => {});
  const T = L.tris, LP = T.position, LI = T.indices, nL = LI.length / 3, nS = sub.length / 3;
  // ---- the region's vertices by welded id and by place
  const copies = new Map();
  for (let i = 0; i < sub.length; i++) { const v = sub[i], w = wid(v); let a = copies.get(w); if (!a) copies.set(w, (a = [])); if (!a.includes(v)) a.push(v); }
  const posW = (w) => { const v = copies.get(w)[0]; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; };
  // (each lock vertex's welded id, o.lockW, found by simplifyRegions over the whole mesh; one this region does not have
  // counts as not found)
  const findW = (i) => { const w = o.lockW[i]; return w >= 0 && copies.has(w) ? w : -1; };
  const lp = (i) => [LP[i * 3], LP[i * 3 + 1], LP[i * 3 + 2]];
  const cell = L.cell ?? 1;
  // (2026-10-26: the copies of welded corners `ws` in chart `ch` that lie together in it — a wrapping chart (the
  // pectoral lobes) has two copies of a vertex by its seam, one lifted by a turn: the first copy alone put a triangle
  // across the seam the wrong way round, its UV spanning the whole rect, and the repair sent the lobe to the patch —;
  // without o.uv, the first copy in the chart)
  const uvd = (a, b) => Math.max(Math.abs(o.uv[a * 2] - o.uv[b * 2]), Math.abs(o.uv[a * 2 + 1] - o.uv[b * 2 + 1]));
  const togetherIn = (ws, ch) => {
    const cs = ws.map((x) => copies.get(x).filter((v) => o.chartOf[v] === ch));
    if (!o.uv || cs.every((c) => c.length <= 1)) return cs.map((c) => c[0]);
    let best = null, bd = Infinity;
    for (const a of cs[0]) {
      const r = [a, ...cs.slice(1).map((c) => c.reduce((p, v) => (uvd(v, a) < uvd(p, a) ? v : p), c[0]))];
      const d = uvd(r[0], r[1]) + uvd(r[1], r[2]) + uvd(r[0], r[2]);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  // (a changed dense cell under or beside the triangle: a cell's centre within half its diagonal and `m` of it)
  const changedNear = (pc, lo, hi, m = 0.3) => {
    if (!L.changedCell) return false;
    const r = 0.87 * cell + m;
    for (let i = Math.floor((lo[0] - r) / cell); i <= Math.floor((hi[0] + r) / cell); i++) for (let j = Math.floor((lo[1] - r) / cell); j <= Math.floor((hi[1] + r) / cell); j++) for (let k = Math.floor((lo[2] - r) / cell); k <= Math.floor((hi[2] + r) / cell); k++) {
      const key = `${i},${j},${k}`;
      if (!L.changedCell(key)) continue;
      // (2026-10-26, round 2: a fringe cell's own moved points where the lock has them, decimlock.changedCells)
      const mv = T.cells?.moved?.get(key);
      if (mv) { for (let q = 0; q < mv.length; q += 3) if (pointTriDist([mv[q], mv[q + 1], mv[q + 2]], pc[0], pc[1], pc[2]) <= m) return true; continue; }
      if (pointTriDist([(i + 0.5) * cell, (j + 0.5) * cell, (k + 0.5) * cell], pc[0], pc[1], pc[2]) <= r) return true;
    }
    return false;
  };
  // ---- the lock's triangles in this region: their welded corners, centroids, whether each may be held
  const LT = [];
  for (const t of o.lockTris ?? Array.from({ length: nL }, (_, i) => i)) {
    const pc = [0, 1, 2].map((k) => lp(LI[t * 3 + k])), c = [0, 1, 2].map((q) => (pc[0][q] + pc[1][q] + pc[2][q]) / 3);
    const w = [0, 1, 2].map((k) => findW(LI[t * 3 + k])), ch = T.chart?.[t] ? o.chartIndex?.(T.chart[t]) ?? -1 : -1;
    const mapped = w.every((x) => x >= 0);
    const lo = [0, 1, 2].map((q) => Math.min(pc[0][q], pc[1][q], pc[2][q])), hi = [0, 1, 2].map((q) => Math.max(pc[0][q], pc[1][q], pc[2][q]));
    let why = null;
    if (!mapped) why = 'moved'; else if (new Set(w).size < 3) why = 'degenerate'; else if (L.free?.(c)) why = 'zone'; else if (changedNear(pc, lo, hi)) why = 'changed';
    // (its copies: the lock's chart if every corner has one there, else a chart all three share, else each corner's copy
    // in the lock's chart or the chart most of the corners have — a triangle across a seam, which the repair after the
    // simplification (charts.repairFolds) lays into one chart: its UVs, not its place)
    let vs = null, mixed = false, exact = false;
    if (!why && o.chartOf && o.uv && T.uv) {
      // (2026-10-26: the copies that hold T3's own UVs at each corner — the lock's corner UVs, to the GLB's uint16 — so a
      // held triangle keeps its T3 chart and its place in it: across a wrapping chart's seam (the pectoral lobes) the
      // lifted copies, which the first copy in the chart is not; T3's patch islands have none and take the rule below)
      const q = (x) => Math.round(x * 65535);
      const m = w.map((x, k) => copies.get(x).find((v) => q(o.uv[v * 2]) === q(T.uv[t * 6 + k * 2]) && q(o.uv[v * 2 + 1]) === q(T.uv[t * 6 + k * 2 + 1])) ?? -1);
      if (m.every((v) => v >= 0)) { vs = m; exact = true; }
    }
    if (!why && !vs) {
      if (o.chartOf) {
        const charts = w.map((x) => new Set(copies.get(x).map((v) => o.chartOf[v])));
        let pick = ch >= 0 && charts.every((s) => s.has(ch)) ? ch : -1;
        if (pick < 0) for (const c0 of charts[0]) if (charts[1].has(c0) && charts[2].has(c0)) { pick = c0; break; }
        if (pick >= 0) vs = togetherIn(w, pick);
        else {
          const tally = new Map(); for (const s of charts) for (const c0 of s) tally.set(c0, (tally.get(c0) ?? 0) + 1);
          const best = [...tally].sort((a, b) => (b[0] === ch) - (a[0] === ch) || b[1] - a[1])[0][0];
          vs = w.map((x) => copies.get(x).find((v) => o.chartOf[v] === best) ?? copies.get(x).find((v) => o.chartOf[v] === ch) ?? copies.get(x)[0]);
          mixed = true;
        }
      } else vs = w.map((x) => copies.get(x)[0]);
    }
    LT.push({ t, pc, c, w, vs, lo, hi, held: !why, why, mixed, exact });
  }
  const freeTarget0 = LT.filter((x) => !x.held).length;
  if (!LT.some((x) => x.held)) return null;
  // ---- the dense triangles: welded corners, centroids, adjacency by welded edge
  const DW = new Int32Array(sub.length); for (let i = 0; i < sub.length; i++) DW[i] = wid(sub[i]);
  const dc = (d) => [0, 1, 2].map((q) => (P[sub[d * 3] * 3 + q] + P[sub[d * 3 + 1] * 3 + q] + P[sub[d * 3 + 2] * 3 + q]) / 3);
  const ekey = (a, b) => a * 4194304 + b;
  const dirTri = new Map();
  for (let d = 0; d < nS; d++) for (let k = 0; k < 3; k++) dirTri.set(ekey(DW[d * 3 + k], DW[d * 3 + (k + 1) % 3]), d);
  const nbr = new Map();
  for (let d = 0; d < nS; d++) for (let k = 0; k < 3; k++) { const a = DW[d * 3 + k], b = DW[d * 3 + (k + 1) % 3]; for (const [x, y] of [[a, b], [b, a]]) { let s = nbr.get(x); if (!s) nbr.set(x, (s = new Set())); s.add(y); } }
  // the dense mesh's median edge (the seed and leak distances' unit)
  const el = []; for (let d = 0; d < Math.min(nS, 4000); d++) { const a = sub[d * 3], b = sub[d * 3 + 1]; el.push(Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])); }
  el.sort((a, b) => a - b); const hd = el[el.length >> 1] || 0.1;
  // the lock triangles' grid (nearest-triangle queries)
  const G = 0.6, grid = new Map(), gk = (i, j, k) => `${i},${j},${k}`;
  LT.forEach((x, n) => { for (let i = Math.floor(x.lo[0] / G); i <= Math.floor(x.hi[0] / G); i++) for (let j = Math.floor(x.lo[1] / G); j <= Math.floor(x.hi[1] / G); j++) for (let k = Math.floor(x.lo[2] / G); k <= Math.floor(x.hi[2] / G); k++) { const key = gk(i, j, k); let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(n); } });
  const nearest = (p) => {
    const i0 = Math.floor(p[0] / G), j0 = Math.floor(p[1] / G), k0 = Math.floor(p[2] / G);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= 6; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
        for (const n of grid.get(gk(i0 + i, j0 + j, k0 + k)) ?? []) { const x = LT[n], e = pointTriDist(p, x.pc[0], x.pc[1], x.pc[2]); if (e < bd) { bd = e; best = n; } }
      }
      if (best >= 0 && bd < r * G) break;
    }
    return [best, bd];
  };
  const owner = new Int32Array(nS), ownerD = new Float32Array(nS), cen = [];
  for (let d = 0; d < nS; d++) { const c = dc(d); cen.push(c); [owner[d], ownerD[d]] = nearest(c); }
  const freeHere = new Uint8Array(nS);
  for (let d = 0; d < nS; d++) if (L.free?.(cen[d])) freeHere[d] = 1;
  // ---- rounds: plan, check, unfreeze where it fails
  const rounds = o.rounds ?? 60;
  let fail = null;
  for (let round = 0; round < rounds; round++) {
    const frozen = LT.filter((x) => x.held), fV = new Set(), fDir = new Map();
    for (const x of frozen) for (let k = 0; k < 3; k++) { fV.add(x.w[k]); fDir.set(ekey(x.w[k], x.w[(k + 1) % 3]), x); }
    // the lens edges: a frozen edge a → b whose twin b → a no frozen triangle has, not on another region's border
    const lens = [];
    for (const x of frozen) for (let k = 0; k < 3; k++) { const a = x.w[k], b = x.w[(k + 1) % 3]; if (fDir.has(ekey(b, a))) continue; if (o.border?.(a) && o.border?.(b)) continue; lens.push({ a, b, x, k }); }
    // the labels: a dense triangle is free unless its nearest lock triangle is held (and it is not in a zone)
    const isFree = new Uint8Array(nS), touch = new Set();
    // (in a zone, a dense triangle more than 2 edges off its nearest held triangle is free too: new skin the lock never had)
    for (let d = 0; d < nS; d++) if (owner[d] < 0 || !LT[owner[d]].held || (freeHere[d] && ownerD[d] > 2 * hd)) { isFree[d] = 1; for (let k = 0; k < 3; k++) touch.add(DW[d * 3 + k]); }
    // the cuts, loop by loop along the frozen boundary, each through vertices no earlier cut took: cuts that share no vertex
    // cannot cross, so a free part too thin for two of them gets none (no path: its frozen triangle unfreezes, the part
    // grows) instead of two that cross and let the flood out
    // (a corner of the frozen boundary the free part reaches by one dense edge only: the two cuts there share it, out and
    // back — a spike, which the loop's walk drops below; so a cut may share vertices with the loop's previous cut)
    const byStart = new Map(); for (const e of lens) { let l = byStart.get(e.a); if (!l) byStart.set(e.a, (l = [])); l.push(e); }
    const loops = [], taken = new Set();
    for (const e0 of lens) {
      if (taken.has(e0)) continue;
      const loop = [];
      let e = e0;
      while (e && !taken.has(e)) { taken.add(e); loop.push(e); e = (byStart.get(e.b) ?? []).find((q) => !taken.has(q)); }
      loops.push(loop);
    }
    const order = loops.flat(), loopOf = new Map(), posIn = new Map();
    loops.forEach((lp, li) => lp.forEach((e, i) => { loopOf.set(e, li); posIn.set(e, i); }));
    const used = new Set(), interiorOf = new Map();
    const bad = new Set(), paths = [];
    let sharedOK = new Set();
    // (the shortest path a → b through the vertices `allow` admits, within 3 chords and 4 dense edges of length)
    const shortest = (e, allow) => {
      const A = posW(e.a), B = posW(e.b), cap = 3 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) + 4 * hd;
      const dist = new Map([[e.a, 0]]), prev = new Map(), done = new Set();
      for (let it = 0; it < 4000; it++) {
        let u = -1, du = Infinity;
        for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
        if (u < 0 || du > cap) return null;
        if (u === e.b) break;
        done.add(u);
        const pu = posW(u);
        for (const v of nbr.get(u) ?? []) {
          if (done.has(v) || (v !== e.b && (fV.has(v) || (used.has(v) && !sharedOK.has(v)) || !allow(v)))) continue;
          const pv = posW(v), nd = du + Math.hypot(pu[0] - pv[0], pu[1] - pv[1], pu[2] - pv[2]);
          if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
        }
      }
      if (!prev.has(e.b)) return null;
      const path = [e.b]; while (path[path.length - 1] !== e.a) path.push(prev.get(path[path.length - 1]));
      return path.reverse();
    };
    let relaxed = 0;
    for (const e of order) {
      // (the vertices this cut may share: the loop's previous cut's, and for its last the first's)
      const lp = loops[loopOf.get(e)], i0 = posIn.get(e);
      sharedOK = new Set([...(interiorOf.get(lp[i0 - 1]) ?? []), ...(i0 === lp.length - 1 && i0 > 0 ? interiorOf.get(lp[0]) ?? [] : [])]);
      // (first through the free-labelled skin; else, where the free part is thin, through any vertex within 1.5 dense edges
      // of the frozen edge on its free side: the side away from the frozen triangle's third corner)
      let path = shortest(e, (v) => touch.has(v));
      if (!path) {
        const A = posW(e.a), B = posW(e.b), C = posW(e.x.w[(e.k + 2) % 3]), ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], inward = [n[1] * ab[2] - n[2] * ab[1], n[2] * ab[0] - n[0] * ab[2], n[0] * ab[1] - n[1] * ab[0]];
        const il = Math.hypot(...inward) || 1;
        path = shortest(e, (v) => { const p = posW(v); if (pointSegDist(p, A, B) > 1.5 * hd) return false; return ((p[0] - A[0]) * inward[0] + (p[1] - A[1]) * inward[1] + (p[2] - A[2]) * inward[2]) / il <= 0.25 * hd; });
        if (path) relaxed++;
      }
      if (!path) {
        bad.add(e.x);
        if (o.debug) { const f = (w) => posW(w).map((x) => x.toFixed(2)).join(' '); const nb = [...(nbr.get(e.a) ?? [])]; log(`      no path ${f(e.a)} → ${f(e.b)} (third ${f(e.x.w[(e.k + 2) % 3])}); a's neighbours: ${nb.length}, touch ${nb.filter((v) => touch.has(v)).length}, frozen ${nb.filter((v) => fV.has(v)).length}, used ${nb.filter((v) => used.has(v)).length}; b's: ${[...(nbr.get(e.b) ?? [])].length}, touch ${[...(nbr.get(e.b) ?? [])].filter((v) => touch.has(v)).length}, frozen ${[...(nbr.get(e.b) ?? [])].filter((v) => fV.has(v)).length}, used ${[...(nbr.get(e.b) ?? [])].filter((v) => used.has(v)).length}`); }
        continue;
      }
      interiorOf.set(e, path.slice(1, -1));
      for (let i = 1; i + 1 < path.length; i++) used.add(path[i]);
      paths.push({ ...e, path });
    }
    if (bad.size) { for (const x of bad) { x.held = false; x.why = 'no path'; } fail = `${bad.size} lens edges without a path`; if (o.debug) log(`    round ${round}: ${fail} (of ${lens.length})`); continue; }
    // the cut: each loop's cuts walked end to end, its spikes (u → v → u) dropped — the free part's edge; a vertex the walk
    // still meets twice is a crossing: the cuts through it fail
    const cutEdges = [], crossed = new Set();
    for (const lp of loops) {
      const P0 = lp.map((e) => paths.find((p) => p.a === e.a && p.b === e.b && p.x === e.x)), walk = [], owner2 = [];
      P0.forEach((p, pi) => { for (let i = 0; i + 1 < p.path.length; i++) { walk.push(p.path[i]); owner2.push(pi); } });
      let changed = true;
      while (changed && walk.length > 2) {
        changed = false;
        for (let i = 0; i < walk.length && walk.length > 2; i++) {
          const n = walk.length, a = walk[(i + n - 1) % n], c = walk[(i + 1) % n];
          if (a === c) { const j = (i + 1) % n; owner2[(i + n - 1) % n] = owner2[j]; const drop = [i, j].sort((x, y) => y - x); for (const q of drop) { walk.splice(q, 1); owner2.splice(q, 1); } changed = true; break; }
        }
      }
      const seen = new Map();
      walk.forEach((w, i) => { if (!fV.has(w)) { if (seen.has(w)) { crossed.add(P0[owner2[i]].x); crossed.add(P0[owner2[seen.get(w)]].x); } else seen.set(w, i); } });
      for (let i = 0; i < walk.length && walk.length > 2; i++) cutEdges.push([walk[i], walk[(i + 1) % walk.length], owner2[i]]);
    }
    if (crossed.size) { for (const x of crossed) { x.held = false; x.why = 'crossing'; } fail = `${crossed.size} cuts cross`; if (o.debug) log(`    round ${round}: ${fail}`); continue; }
    // the free surface: flooded from the far side of every cut edge
    const cut = new Set(), ukey = (a, b) => (a < b ? ekey(a, b) : ekey(b, a));
    for (const p of paths) for (let i = 0; i + 1 < p.path.length; i++) cut.add(ukey(p.path[i], p.path[i + 1]));
    const inFree = new Uint8Array(nS), stack = [], seedOf = new Int32Array(nS).fill(-1), par = new Int32Array(nS).fill(-1);
    for (const [u, v] of cutEdges) { const d = dirTri.get(ekey(v, u)); if (d !== undefined && !inFree[d]) { inFree[d] = 1; seedOf[d] = paths.findIndex((p) => p.path.includes(u) && p.path.includes(v)); stack.push(d); } }
    // (only there: every free part is bounded by lens edges, so their far sides reach all of it; a seed anywhere else could
    // lie outside a cut that runs inside a zone, and flood under the held surface)
    while (stack.length) {
      const d = stack.pop();
      for (let k = 0; k < 3; k++) {
        const a = DW[d * 3 + k], b = DW[d * 3 + (k + 1) % 3];
        if (cut.has(ukey(a, b))) continue;
        const u = dirTri.get(ekey(b, a));
        if (u === undefined || inFree[u]) continue;
        inFree[u] = 1; seedOf[u] = seedOf[d]; par[u] = d; stack.push(u);
      }
    }
    // (a leak: a flooded triangle under a held one, far from every cut — the paths' frozen edges near it unfreeze)
    const chords = paths.map((p) => [posW(p.a), posW(p.b)]);
    const leakAt = [];
    for (let d = 0; d < nS; d++) {
      if (!inFree[d] || isFree[d] || freeHere[d]) continue;
      let near = Infinity; for (const [A, B] of chords) { near = Math.min(near, pointSegDist(cen[d], A, B)); if (near < 3 * hd + 0.2) break; }
      if (near >= 3 * hd + 0.2) leakAt.push(d);
    }
    if (leakAt.length) {
      // (the leak's source: the cut whose far side each leaking triangle was flooded from — a cut through a free part too
      // thin to hold it, e.g. one long held sliver's edge — its held triangle unfrozen, the free part fattened there)
      const hit = new Set();
      for (const d0 of leakAt) { let d = d0, n = 0; while (par[d] >= 0 && n++ < nS) d = par[d]; if (seedOf[d] >= 0) hit.add(paths[seedOf[d]].x); }
      for (const x of hit) { x.held = false; x.why = 'leak'; }
      fail = `the free surface leaked under ${leakAt.length} held dense triangles`;
      if (o.debug) log(`    round ${round}: ${fail}; unfreezing ${hit.size}; e.g. ${leakAt.slice(0, 3).map((d) => cen[d].map((x) => x.toFixed(2)).join(' ')).join(' | ')}`);
      if (o.debug) {
        // (the first leaking triangle's seed: the cut it was flooded from)
        let d = leakAt[0]; while (par[d] >= 0) d = par[d];
        const sp = seedOf[d] >= 0 ? paths[seedOf[d]] : null, f = (w) => posW(w).map((x) => x.toFixed(2)).join(' ');
        if (sp) log(`      leak from the cut ${f(sp.a)} → ${f(sp.b)} (${sp.path.length} vertices; its frozen triangle ${sp.x.w.map(f).join(' | ')})`);
      }
      if (!hit.size) break;
      continue;
    }
    // the input: frozen, pockets, free
    const tris = [], kind = [];
    for (const x of frozen) { tris.push(x.vs[0], x.vs[1], x.vs[2]); kind.push(0); }
    // (a's copy in the chart of the pocket's corner xi; with the UVs, the one nearest xi in UV — by a wrapping chart's
    // seam, the copy on xi's side —, the held triangle's own first on a tie)
    const copyIn = (w, chart, near, own) => {
      const a = copies.get(w);
      if (!o.chartOf) return a[0];
      const c = a.filter((v) => o.chartOf[v] === chart);
      if (!c.length) return -1;
      if (!o.uv) return c[0];
      return c.reduce((p, v) => (uvd(v, near) < uvd(p, near) ? v : p), o.chartOf[own] === chart ? own : c[0]);
    };
    for (const p of paths) {
      const aCopy = p.x.vs[p.k];
      for (let i = 1; i + 1 < p.path.length; i++) {
        const d = dirTri.get(ekey(p.path[i + 1], p.path[i]));
        const cornerOf = (w) => { for (let k = 0; k < 3; k++) if (DW[d * 3 + k] === w) return sub[d * 3 + k]; return -1; };
        const xi = cornerOf(p.path[i]), xj = cornerOf(p.path[i + 1]);
        const ach = o.chartOf ? copyIn(p.a, o.chartOf[xi], xi, aCopy) : -1;
        tris.push(ach >= 0 ? ach : aCopy, xi, xj); kind.push(1);
      }
    }
    for (let d = 0; d < nS; d++) if (inFree[d]) { tris.push(sub[d * 3], sub[d * 3 + 1], sub[d * 3 + 2]); kind.push(2); }
    // the stitch checked: welded, every directed edge once, each with its twin, round the frozen surface and the cuts
    const band = new Set(fV); for (const p of paths) for (const w of p.path) band.add(w);
    const dirs = new Map();
    let degenerate = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const w = [wid(tris[i]), wid(tris[i + 1]), wid(tris[i + 2])];
      if (w[0] === w[1] || w[1] === w[2] || w[0] === w[2]) { degenerate++; continue; }
      for (let k = 0; k < 3; k++) { const q = ekey(w[k], w[(k + 1) % 3]); dirs.set(q, (dirs.get(q) ?? 0) + 1); }
    }
    const badV = new Set();
    for (const [q, n] of dirs) {
      const a = Math.floor(q / 4194304), b = q % 4194304;
      if (!band.has(a) && !band.has(b)) continue;
      if (n > 1 || (!dirs.has(ekey(b, a)) && !(o.border?.(a) && o.border?.(b)))) { badV.add(a); badV.add(b); }
    }
    if (degenerate || badV.size) {
      let hit = 0;
      for (const x of frozen) if (x.w.some((w) => badV.has(w))) { x.held = false; x.why = 'stitch'; hit++; }
      fail = `the stitch is not manifold at ${badV.size} vertices (${degenerate} degenerate)`;
      if (o.debug) log(`    round ${round}: ${fail}; e.g. ${[...badV].slice(0, 4).map((w) => posW(w).map((x) => x.toFixed(2)).join(' ')).join(' | ')}`);
      if (!hit && !degenerate) break;
      if (!hit) for (const p of paths) { p.x.held = false; p.x.why = 'stitch'; }
      continue;
    }
    const lockV = new Set(); for (const w of fV) for (const v of copies.get(w)) lockV.add(v);
    const why = {}; for (const x of LT) if (!x.held) why[x.why] = (why[x.why] ?? 0) + 1;
    const stats = { label: L.label, round, lockTriangles: LT.length, frozen: frozen.length, acrossSeams: frozen.filter((x) => x.mixed).length, ...(T.uv && o.uv ? { t3UV: frozen.filter((x) => x.exact).length } : {}), relaxedCuts: relaxed, free: LT.length - frozen.length, why, lensEdges: paths.length, pocketTriangles: kind.filter((k) => k === 1).length, freeDense: kind.filter((k) => k === 2).length, freeDenseOf: nS };
    log(`  decimation lock ${L.label ?? ''}: ${frozen.length} of ${LT.length} triangles held (${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(', ')} not${stats.t3UV !== undefined ? `; ${stats.t3UV} on T3's own UVs` : ''}), ${paths.length} lens edges, ${stats.pocketTriangles} pocket triangles, ${stats.freeDense} of ${nS} dense triangles to simplify${round ? ` (round ${round + 1})` : ''}`);
    // (held: each held triangle's lock index and its corners' welded ids — the dense vertices — in the lock's order)
    return { indices: Uint32Array.from(tris), lock: [...lockV], frozen: frozen.map((x) => x.w), held: frozen.map((x) => ({ t: x.t, w: x.w })), freeTarget: LT.length - frozen.length, freeTarget0, stats };
  }
  log(`  decimation lock ${L.label ?? ''}: not held (${fail})`);
  return null;
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
  const parts = [], regOut = [], errors = [], frozen = [], heldOut = [];
  // (2026-10-25, the decimation lock: each lock vertex's welded id — the one vertex of this mesh at its place, within
  // 2e-4 mm; none, or two (a split vertex), −1 — and each lock triangle's region: the region a corner is inside of, else
  // (every corner on the border or not found) the regions' own rule on its centroid)
  let lockW = null, lockRegion = null;
  if (o.frozen) {
    const LP = o.frozen.tris.position, LI = o.frozen.tris.indices, Q = 1e-3, place = new Map(), seen = new Set();
    for (let v = 0; v < nv; v++) { const w = wid(v); if (seen.has(w) || !mask.has(w)) continue; seen.add(w); const k = `${Math.round(P[v * 3] / Q)},${Math.round(P[v * 3 + 1] / Q)},${Math.round(P[v * 3 + 2] / Q)}`; let a = place.get(k); if (!a) place.set(k, (a = [])); a.push(v); }
    lockW = new Int32Array(LP.length / 3).fill(-1);
    for (let i = 0; i < lockW.length; i++) {
      const p = [LP[i * 3], LP[i * 3 + 1], LP[i * 3 + 2]], i0 = Math.round(p[0] / Q), j0 = Math.round(p[1] / Q), k0 = Math.round(p[2] / Q), hit = new Set();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const v of place.get(`${i0 + a},${j0 + b},${k0 + c}`) ?? []) if (Math.max(Math.abs(P[v * 3] - p[0]), Math.abs(P[v * 3 + 1] - p[1]), Math.abs(P[v * 3 + 2] - p[2])) < 2e-4) hit.add(wid(v));
      if (hit.size === 1) lockW[i] = [...hit][0];
    }
    // (2026-10-26, round 2: a lock vertex outside the zones not found at its place takes the one welded vertex within the
    // lock's tolerance of it, its nearest — the zones' sculpt moved the skin next to them by up to 0.009 mm, decimlock
    // FRINGE_MM)
    const tol = o.frozen.tris.tol ?? 0;
    if (tol > 0) {
      const G = Math.max(tol, Q) * 2, coarse = new Map();
      for (const a of place.values()) for (const v of a) { const k = `${Math.floor(P[v * 3] / G)},${Math.floor(P[v * 3 + 1] / G)},${Math.floor(P[v * 3 + 2] / G)}`; let b = coarse.get(k); if (!b) coarse.set(k, (b = [])); b.push(v); }
      let snapped = 0;
      for (let i = 0; i < lockW.length; i++) {
        if (lockW[i] >= 0) continue;
        const p = [LP[i * 3], LP[i * 3 + 1], LP[i * 3 + 2]];
        if (o.frozen.free?.(p)) continue;
        const i0 = Math.floor(p[0] / G), j0 = Math.floor(p[1] / G), k0 = Math.floor(p[2] / G), best = new Map();
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const v of coarse.get(`${i0 + a},${j0 + b},${k0 + c}`) ?? []) {
          const d = Math.hypot(P[v * 3] - p[0], P[v * 3 + 1] - p[1], P[v * 3 + 2] - p[2]);
          if (d <= tol) { const w = wid(v); best.set(w, Math.min(best.get(w) ?? Infinity, d)); }
        }
        if (best.size) { lockW[i] = [...best].sort((x, y) => x[1] - y[1])[0][0]; snapped++; }
      }
      if (snapped) log(`  decimation lock: ${snapped} lock vertices outside the zones found within ${tol} mm of their place`);
    }
    const nL = LI.length / 3, chartIdx = (t) => (o.frozen.tris.chart?.[t] ? o.chartIndex?.(o.frozen.tris.chart[t]) ?? -1 : -1);
    lockRegion = new Int16Array(nL).fill(-1);
    for (let t = 0; t < nL; t++) {
      let r = -1;
      for (let k = 0; k < 3; k++) { const w = lockW[LI[t * 3 + k]]; if (w < 0) continue; const mm = mask.get(w) ?? 0; if (mm && !(mm & (mm - 1))) { r = 31 - Math.clz32(mm); break; } }
      if (r < 0) {
        const c = [0, 1, 2].map((q) => (LP[LI[t * 3] * 3 + q] + LP[LI[t * 3 + 1] * 3 + q] + LP[LI[t * 3 + 2] * 3 + q]) / 3);
        r = 0; while (r < regions.length - 1 && !(regions[r].select ? regions[r].select(c, chartIdx(t)) : false)) r++;
      }
      lockRegion[t] = r;
    }
  }
  for (let r = 0; r < regions.length; r++) {
    const R = regions[r], sub = [];
    for (let t = 0; t < nt; t++) if (regionOf[t] === r) sub.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
    let idx = Uint32Array.from(sub), err = 0, target = R.target, lockR = lock;
    // (2026-10-25: the decimation lock, o.frozen — withDecimationLock: the lock's triangles held, the rest simplified to
    // the lock's own count there)
    const lockTris = lockRegion ? [...lockRegion.keys()].filter((t) => lockRegion[t] === r) : null;
    const plan = o.frozen && sub.length && lockTris.length ? frozenPlan(P, idx, wid, o.frozen, {
      border: (w) => { const mm = mask.get(w) ?? 0; return !!(mm & (mm - 1)); },
      lockW, lockTris, chartOf: o.chartOf ?? null, chartIndex: o.chartIndex, uv: o.uv ?? null, log, debug: !!process.env.TOBI_FROZEN_DEBUG,
    }) : null;
    if (plan) {
      // (the free part: the lock's own count there, plus what the region's target gained since the lock — e.g. the far
      // tier's second pass, raised by what the refill freed)
      const base = o.frozen.tris.targets?.[R.name];
      idx = plan.indices; target = plan.frozen.length + plan.freeTarget + (Number.isFinite(base) ? R.target - base : 0);
      lockR = Uint8Array.from(lock); for (const v of plan.lock) lockR[v] = 1;
      frozen.push({ region: R.name, ...plan.stats, target });
      heldOut.push(...plan.held);
    }
    const F = plan ? o.frozen.focus ?? o.frozen.tris?.focus ?? null : null;
    if (idx.length / 3 > target && F) {
      // (2026-10-26, the decimation lock's focus — the median lip: a part of the free surface simplified to a finer error
      // than the rest. Pass 1, the rest locked, only the focus's vertices collapse, to F.error; pass 2, the focus's
      // vertices left locked, the rest to its own count — what a plain simplification gives it — so the focus's extra
      // triangles are its own. The vertices inside: F.inside(p), mm)
      // (2026-10-26, round 3: F.parts — decimlock FOCUS_PARTS —, each part simplified in turn to its own error, the
      // finest first, everything but that part's vertices locked; a vertex in two parts goes with the finer. F.inside,
      // the union, may be narrowed by the caller (tierMesh's patch rule): a part's vertex counts only inside it too)
      const parts = F.parts ?? [{ label: F.label, error: F.error, inside: F.inside }];
      const inF = (v) => F.inside([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
      const cin = (ix) => { let n = 0; for (let i = 0; i < ix.length; i += 3) if ([0, 1, 2].every((k) => inF(ix[i + k]))) n++; return n; };
      const [plain] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, attrs, stride || 1, weights, lockR, target * 3, R.error ?? 1, R.flags ?? []);
      let a = idx;
      const taken = new Set(), perPart = [];
      for (const Q of parts) {
        const lockA = Uint8Array.from(lockR), mine = new Set();
        for (const v of new Set(a)) {
          const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
          if (!taken.has(v) && inF(v) && Q.inside(p)) mine.add(v); else lockA[v] = 1;
        }
        if (!mine.size) { perPart.push(`${Q.label} 0`); continue; }
        [a] = MeshoptSimplifier.simplifyWithAttributes(a, P, 3, attrs, stride || 1, weights, lockA, 0, Q.error, R.flags ?? []);
        for (const v of mine) taken.add(v);
        let n = 0; for (let i = 0; i < a.length; i += 3) if ([0, 1, 2].some((k) => mine.has(a[i + k]))) n++;
        perPart.push(`${Q.label} ${n} at ${Q.error}`);
      }
      const lockB = Uint8Array.from(lockR);
      for (const v of new Set(a)) if (inF(v)) lockB[v] = 1;
      const nPlain = cin(plain), nA = cin(a), extra = Math.max(0, nA - nPlain);
      target += extra;
      [idx, err] = MeshoptSimplifier.simplifyWithAttributes(a, P, 3, attrs, stride || 1, weights, lockB, target * 3, R.error ?? 1, R.flags ?? []);
      frozen[frozen.length - 1].focus = { error: F.error, plain: nPlain, focus: nA, extra, triangles: cin(idx), ...(F.parts ? { parts: perPart } : {}) };
      log(`  region ${R.name}: the focus (${F.label ?? 'focus'}) at error ${F.error}: ${nA} triangles (a plain simplification left it ${nPlain}), ${extra} more for the region${F.parts ? ` (${perPart.join('; ')})` : ''}`);
    } else if (idx.length / 3 > target) {
      [idx, err] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, attrs, stride || 1, weights, lockR, target * 3, R.error ?? 1, R.flags ?? []);
    }
    if (plan) {
      // (every held triangle kept? welded)
      const out = new Set(); for (let i = 0; i < idx.length; i += 3) out.add([wid(idx[i]), wid(idx[i + 1]), wid(idx[i + 2])].sort((a, b) => a - b).join(','));
      const lost = plan.frozen.filter((w) => !out.has([...w].sort((a, b) => a - b).join(','))).length;
      frozen[frozen.length - 1].lostHeld = lost;
      if (lost) log(`  region ${R.name}: ${lost} held triangles lost in the simplification`);
    }
    log(`  region ${R.name}: ${sub.length / 3} → ${idx.length / 3} triangles (target ${target}${plan ? `, ${plan.frozen.length} held` : ''}, error ${err.toExponential(2)})`);
    parts.push(idx); errors.push(err);
    regOut.push(new Uint8Array(idx.length / 3).fill(r));
  }
  const len = parts.reduce((a, p) => a + p.length, 0), indices = new Uint32Array(len), region = new Uint8Array(len / 3);
  let at = 0, rt = 0;
  parts.forEach((p, r) => { indices.set(p, at); at += p.length; region.set(regOut[r], rt); rt += regOut[r].length; });
  return { indices, region, errors, locked, ...(frozen.length ? { frozen, held: heldOut } : {}) };
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
  // (2026-10-26, round 3: the decimation lock's fairing — decimlock FAIR, `L.tris.fair`: a crease the tier's cell
  // staircases faired along the surface before the charts and the simplification; the zones only)
  const FR = DECIMATION_LOCK?.tris?.fair;
  if (FR && typeof f === 'function') {
    const r = fairBand(dense, f, FR.inside, { ...FR, hold: o.lockDense ?? null, nh: FR.nh ?? (o.h ? o.h * 0.5 : null) });
    if (r.moved) { dense = { ...dense, position: r.position, ...(r.normal ? { normal: r.normal } : {}) }; log(`  faired ${FR.label}: ${r.moved} dense vertices, at most ${r.max.toFixed(3)} mm`); }
  }
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
  let tier, charted, region, simp, keepTri = null, repair = null;
  // after the simplification: the held triangles on T3's UVs (decimation lock `L`), triangles without area dropped,
  // the repair
  const finish = (L) => {
    keepTri = null; repair = null;
    // (2026-10-26, the decimation lock: the held triangles on T3's own UVs, kept as they are by the repair — restoreHeld)
    if (simp.held?.length && L) {
      const r = restoreHeld(tier, simp.held, L, o.charts, { spare: o.repair?.spare ?? [] });
      tier = r.mesh; keepTri = r.keep;
      log(`  held on T3's UVs: ${r.kept} of ${simp.held.length} held triangles kept as they are through the repair (${r.moved} of them on ${r.copies} new vertex copies: T3's mends and patch islands, where this charting differs)${r.relayed ? `; ${r.relayed} across two charts sent to the patch` : ''}`);
    }
    log(`  simplified: ${chartTally(tier.triChart, o.charts)}`);
    // (triangles with two corners on one dense vertex — chart copies of it, or the same index — have no area, no tangent
    // frame and no edges of the welded skin: dropped, the skin stays closed)
    {
      const d = dropZeroArea(tier);
      if (d.dropped) { tier = d.mesh; region = Uint8Array.from(d.keep, (t) => region[t]); if (keepTri) keepTri = Uint8Array.from(d.keep, (t) => keepTri[t]); log(`  dropped ${d.dropped} triangles with no area or doubled (${d.duplicates})`); }
    }
    // (2026-10-26, round 2: the slit's wall charts' small islands on the outer skin back to the skin's chart)
    if (L && o.repair !== false) {
      const sl = slitIslandsToSkin(tier, o.charts, { keep: keepTri });
      if (sl.moved) { tier = sl.mesh; log(`  ${sl.moved} triangles in ${sl.groups} islands of the slit's walls amid the skin laid in the skin's chart`); }
    }
    if (o.repair !== false) {
      const r = repairFolds(tier, o.charts, { ...(o.repair ?? {}), log, ...(keepTri ? { keep: keepTri } : {}) });
      tier = r.mesh; repair = r.stats;
      // (and once more after the repair: a face that folds in the skin's chart the repair's refit lays in a wall chart
      // whose plane maps it the right way round — the notch's 4 at s 1 mm. In the skin's chart such a triangle, a texel
      // or two, samples the face round it; in the wall's it took the mouth's interior)
      if (L) {
        const sl = slitIslandsToSkin(tier, o.charts, { keep: keepTri });
        if (sl.moved) { tier = sl.mesh; log(`  after the repair: ${sl.moved} triangles in ${sl.groups} islands of the slit's walls amid the skin laid in the skin's chart`); }
      }
    }
  };
  if (o.simplifyFirst) {
    const ident = Uint32Array.from({ length: nD }, (_, i) => i);
    const A = attrsFor(dense.normal, null, ident, nD);
    const lock = o.lockDense ?? null;
    const rOf = regionOfTri(dense, null);
    simp = simplifyRegions(dense, rOf, regions, { ...A, lock, log, frozen: DECIMATION_LOCK });
    if (o.refill) {
      // (the triangles the refill frees go back to the regions: simplified again to targets raised by as many; with the
      // decimation lock, its free part's target raised by them)
      let rf = refillRegions(dense.position, simp.indices, simp.region, o.refill);
      const saved = rf.removed - rf.added;
      if (saved > 0) {
        const total = regions.reduce((a, R) => a + R.target, 0);
        const regions2 = regions.map((R) => ({ ...R, target: Math.round(R.target * (1 + saved / total)) }));
        simp = simplifyRegions(dense, rOf, regions2, { ...A, lock, log, frozen: DECIMATION_LOCK });
        rf = refillRegions(dense.position, simp.indices, simp.region, o.refill);
      }
      if (rf.removed) { simp.indices = rf.indices; simp.region = rf.region; log(`  refilled ${rf.removed} hidden triangles with ${rf.added}`); }
    }
    const c = compactMesh(dense, simp.indices, ['position', 'normal']);
    // (2026-10-26, round 2: the lock's floor — lod2's chin no lower than T3's, decimlock FLOOR)
    if (DECIMATION_LOCK?.tris?.floor) {
      const f = floorToLock(c.position, DECIMATION_LOCK);
      log(`  floor (${DECIMATION_LOCK.tris.floor.label}): ${f.lifted} vertices lifted onto the lock's skin, at most ${f.max.toFixed(3)} mm`);
    }
    const m1 = { position: c.position, normal: c.normal, indices: c.indices };
    const pf = (p, n, v) => o.prefer(p, n, c.map[v]);
    charted = o.resolve ? chartResolve(m1, o.charts, pf, { ...o.resolve, force: forceFor(m1), log }) : chartMesh(m1, o.charts, pf, { force: forceFor(m1) });
    const source = new Uint32Array(charted.source.length);
    for (let i = 0; i < source.length; i++) source[i] = c.map[charted.source[i]];
    tier = { position: charted.position, normal: charted.normal, uv: charted.uv, depth: charted.depth, indices: charted.indices, chart: charted.chart, source, triChart: charted.triChart };
    region = simp.region;
    finish(DECIMATION_LOCK);
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
    const rOf = regionOfTri(charted, (t) => tc[t]);
    // (2026-10-26, round 2: the decimation lock's focus kept out of the patch. The focus's fine triangles where the
    // chart's projection turns edge-on — the notch where the median lip meets the pad, the lip's lower edge — folded,
    // the mend in their chart failed, and the repair laid them as islands of 4–9 triangles (17–30 texels) in the patch:
    // the bake's dilation and the sampler's filtering bled the neighbouring islands into them, dark teeth along the
    // pad's top on the front views (round 1: two islands at s 1.14 mm, y 1.8, |z| 1.3–1.4; T3, and the focus off: none).
    // So a patch triangle whose centroid lies in the focus leaves the focus off round it (a ball of `r`, 0.25 mm; the
    // balls add up pass by pass) and the free part is simplified again, at most o.focusPasses (6) more times)
    const F0 = DECIMATION_LOCK ? DECIMATION_LOCK.focus ?? DECIMATION_LOCK.tris?.focus ?? null : null;
    const avoid = [], passes = o.focusPasses ?? 6;
    for (let pass = 0; ; pass++) {
      const L = F0 && avoid.length ? { ...DECIMATION_LOCK, focus: { ...F0, inside: (p) => F0.inside(p) && !avoid.some(([x, y, z, r]) => (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2 < r * r) } } : DECIMATION_LOCK;
      simp = simplifyRegions(charted, rOf, regions, { ...A, lock, weld: charted.source, log, frozen: L, chartOf: charted.chart, chartIndex: (nm) => o.charts.findIndex((c) => c.name === nm), uv: charted.uv });
      // the kept triangles' charts: the corners' chart (every corner of a charted triangle has its chart)
      const c = compactMesh(charted, simp.indices, ['position', 'normal', 'uv', 'chart', 'source', 'depth']);
      const triChart = new Int16Array(c.indices.length / 3);
      for (let t = 0; t < triChart.length; t++) triChart[t] = c.chart[c.indices[t * 3]];
      tier = { position: c.position, normal: c.normal, uv: c.uv, depth: c.depth, indices: c.indices, chart: c.chart, source: c.source, triChart };
      region = simp.region;
      finish(L);
      if (!F0 || o.repair === false || pass >= passes) break;
      const pi = o.charts.findIndex((C) => C.relay), P = tier.position, I = tier.indices, hits = [];
      for (let t = 0; t < I.length / 3; t++) {
        if (keepTri?.[t] || tier.chart[I[t * 3]] !== pi) continue;
        const q = [0, 1, 2].map((k) => (P[I[t * 3] * 3 + k] + P[I[t * 3 + 1] * 3 + k] + P[I[t * 3 + 2] * 3 + k]) / 3);
        if (F0.inside(q)) hits.push(q);
      }
      if (!hits.length) break;
      const r = 0.25;
      for (const q of hits) avoid.push([...q, r]);
      log(`  focus: ${hits.length} of its triangles laid in the patch — the focus off within ${r.toFixed(2)} mm of them, the free part simplified again (pass ${pass + 2})`);
    }
  }
  // per-vertex tangents (meshopt's are per corner: vertices whose corners disagree are split, every per-vertex array
  // carried to the copies, so `source` still maps each to its dense vertex)
  const vt = vertexTangents(tier, { keys: ['position', 'normal', 'uv', 'chart', 'source', 'depth'] });
  tier = { ...vt.mesh, triChart: tier.triChart };
  const tangent = vt.tangent;
  const nT = tier.indices.length / 3;
  log(`tier mesh: ${tier.position.length / 3} vertices, ${nT} triangles (dense ${dense.indices.length / 3}, charted ${charted.position.length / 3} vertices${repair ? `, ${repair.islands} patch islands` : ''}); tangents: ${vt.stats.split} vertices split, ${vt.stats.fallback} without UV area`);
  return { ...tier, tangent, region, dense, charted, stats: { regions: regions.map((R, r) => ({ name: R.name, target: R.target, triangles: region.reduce((a, x) => a + (x === r ? 1 : 0), 0), error: simp.errors[r] })), locked: simp.locked, repair, tangents: vt.stats, ...(simp.frozen ? { frozen: simp.frozen } : {}) } };
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
