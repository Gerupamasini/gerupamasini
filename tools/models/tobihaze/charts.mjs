// UV charts of the トビハゼ surface. The sculpt is meshed without a parameterisation (mesher.mjs), so every vertex gets
// its texture coordinate from a projection of its fish-frame position, chosen per region (fishmesh.mjs bodyCharts):
//   azimuthal     equidistant projection of the direction from a centre about an axis (the face, the eye domes, the
//                 sockets, the tail's end)
//   halfCylinder  one side of the body about its axis: u along s, v round the side from the ventral midline (0) to the
//                 dorsal one (1) by arc length (no wrap: the two sides meet in seams under the keels and the fins)
//   limbPath      a tube about a polyline (the pectoral lobes): u = arc length along the smoothed axis, v round it with
//                 a parallel-transported reference, the seam on the medial side
//   twoSheet      a thin pocket's two walls (the gape's slit, the gill pocket) projected flat onto their mid-plane, one
//                 wall in each half of the rect (the walls face each other: their normals tell them apart)
// Triangles take the chart most of their corners prefer; vertices on a chart boundary are split, one copy per chart
// (an attribute seam the simplifier keeps). Every chart has a rectangle of the atlas ([x0, y0, x1, y1], v down); the
// textures are baked from the fish-frame position under each texel (bake.mjs), so a chart only has to be injective and
// stay inside its rectangle. What a projection cannot map injectively (folds, a triangle across a wrap seam, a corner
// outside its rectangle) repairFolds re-projects flat into the `patch` rectangle; uvStats measures all of it.

const TAU = Math.PI * 2;

/** Azimuthal equidistant projection about `axis` from `centre`; thetaMax maps to the rim of the unit disc. */
export function azimuthal(centre, axis, up, thetaMax) {
  const a = norm(axis), u0 = norm(sub(up, scale(a, dot(up, a)))), v0 = cross(a, u0);
  return (p) => {
    const d = sub(p, centre), r = Math.hypot(d[0], d[1], d[2]) || 1e-9;
    const th = Math.acos(Math.max(-1, Math.min(1, dot(d, a) / r)));
    const ph = Math.atan2(dot(d, v0), dot(d, u0));
    const k = th / thetaMax;
    return [0.5 + 0.5 * k * Math.cos(ph), 0.5 + 0.5 * k * Math.sin(ph), r];
  };
}

/** Cylinder about the line (s, axisY(s), 0): u from s0 to s1, v = 0 at the ventral midline, 0.5 at the dorsal one. */
export function cylinder(s0, s1, axisY) {
  return (p) => {
    const ang = Math.atan2(p[2], p[1] - axisY(p[0])); // 0 dorsal, +π/2 left, ±π ventral
    return [(p[0] - s0) / (s1 - s0), (ang + Math.PI) / TAU, Math.hypot(p[2], p[1] - axisY(p[0]))];
  };
}

/**
 * One side of a body about the line (s, axisY(s), 0): u = (s − s0) / (s1 − s0); v from the ventral midline (0) round
 * the side (z·side > 0) to the dorsal midline (1), with `margin` (radians) of the other side mapped beyond each end, so
 * a triangle across either midline stays in the rectangle. arc(s, φ) (optional, φ in [0, π]) → the share of the
 * section's arc length up to φ: the texels then lie evenly round the section instead of evenly in angle.
 */
export function halfCylinder(s0, s1, axisY, side, { margin = 0.12, arc = null } = {}) {
  const span = Math.PI + 2 * margin;
  return (p) => {
    let ph = Math.atan2(p[2] * side, -(p[1] - axisY(p[0]))); // 0 ventral, π/2 lateral, π dorsal
    if (ph < -Math.PI / 2) ph += TAU; // just over the dorsal midline: past π
    let b;
    if (arc && ph >= 0 && ph <= Math.PI) b = (margin + arc(p[0], ph) * Math.PI) / span;
    else b = (ph + margin) / span;
    return [(p[0] - s0) / (s1 - s0), b, Math.hypot(p[2], p[1] - axisY(p[0]))];
  };
}

/**
 * A tube about the polyline `points` (smoothed into a dense curve with a parallel-transported frame): u = the arc
 * length of the nearest point of the curve as a share of the polyline's length, mapped from t0 to t1 (before the first
 * point and past the last the curve runs on straight); v = the angle round the curve, counter-clockwise about it, 0.5
 * toward `ref` (its part perpendicular to the curve) and the seam opposite (a chart with wrapV).
 */
export function limbPath(points, ref, t0 = -0.2, t1 = 1.3, { samples = 64 } = {}) {
  // the smoothed curve: Catmull-Rom through the points (ends clamped), then sampled densely
  const P = points, curve = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.ceil(samples / (P.length - 1));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      curve.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  curve.push(P[P.length - 1].slice());
  const m = curve.length, cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(...sub(curve[i], curve[i - 1])));
  const L = cum[m - 1];
  // tangents and the transported reference
  const T = curve.map((_, i) => norm(sub(curve[Math.min(m - 1, i + 1)], curve[Math.max(0, i - 1)])));
  const E0 = [], E1 = [];
  let e = norm(sub(ref, scale(T[0], dot(ref, T[0]))));
  for (let i = 0; i < m; i++) {
    e = norm(sub(e, scale(T[i], dot(e, T[i]))));
    E0.push(e); E1.push(cross(T[i], e));
  }
  return (p) => {
    // nearest point of the curve (segments; the end segments run on beyond their ends)
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i + 1 < m; i++) {
      const a = curve[i], ab = sub(curve[i + 1], a), l2 = dot(ab, ab);
      let t = dot(sub(p, a), ab) / l2;
      if (i > 0) t = Math.max(0, t);
      if (i < m - 2) t = Math.min(1, t);
      const q = sub(p, add(a, scale(ab, t))), d = dot(q, q);
      if (d < best) { best = d; bi = i; bt = t; }
    }
    const tc = Math.max(0, Math.min(1, bt));
    const lerp = (A, B) => norm(add(scale(A[bi], 1 - tc), scale(B[bi + 1] ?? B[bi], tc)));
    const e0 = lerp(E0, E0), e1 = lerp(E1, E1);
    const s = cum[bi] + bt * (cum[bi + 1] - cum[bi]);
    const q = sub(p, add(curve[bi], scale(sub(curve[bi + 1], curve[bi]), bt)));
    const ang = Math.atan2(dot(q, e1), dot(q, e0)); // 0 toward ref
    return [(s / L - t0) / (t1 - t0), ((ang + Math.PI) / TAU + 0.5) % 1, Math.sqrt(best)];
  };
}

/** Straight segment limb (the older chart): cylinder about a → b, u = t from t0 to t1, v round it, 0.5 toward ref. */
export function limb(a, b, ref, t0 = -0.2, t1 = 1.25) {
  const ax = sub(b, a), L = Math.hypot(ax[0], ax[1], ax[2]), u = scale(ax, 1 / L);
  const e0 = norm(sub(ref, scale(u, dot(ref, u)))), e1 = cross(u, e0);
  return (p) => {
    const d = sub(p, a), t = dot(d, u) / L;
    const ang = Math.atan2(dot(d, e1), dot(d, e0)); // 0 at the seam
    return [(t - t0) / (t1 - t0), (ang + Math.PI) / TAU, Math.hypot(...sub(d, scale(u, dot(d, u))))];
  };
}

/**
 * A thin pocket's two walls flat on their mid-plane: (p, n) → [a, b]. frame(p) → { o, e0, e1, out } at the point (the
 * mid-plane's origin and axes, `out` the normal of the wall that faces outward... i.e. of the floor); a in [0, 1] along
 * e0 over len0, b along e1 over len1 into the upper half for the wall whose normal is against `out`, the lower half
 * for the other.
 */
export function twoSheet(frame, len0, len1, { split = 0.5 } = {}) {
  // (the roof, facing against `out`, is mirrored in a, so both walls keep the chart's one orientation)
  return (p, n) => {
    const F = frame(p), d = sub(p, F.o);
    const a = Math.max(0, Math.min(1, dot(d, F.e0) / len0 + 0.5)), b = Math.max(0, Math.min(1, dot(d, F.e1) / len1 + 0.5));
    const roof = n ? dot(n, F.out) < 0 : false, depth = Math.abs(dot(d, F.out));
    return roof ? [1 - a, b * split, depth] : [a, split + b * (1 - split), depth];
  };
}

/** Orthographic projection onto a plane: F = { o, e0, e1, out } (origin, in-plane axes, normal), a = along e0 over
 * len0, b = along e1 over len1, both centred on o; depth = the distance from the plane. */
export function planar(F, len0, len1) {
  return (p) => { const d = sub(p, F.o); return [dot(d, F.e0) / len0 + 0.5, dot(d, F.e1) / len1 + 0.5, Math.abs(dot(d, F.out))]; };
}

/** A fixed point (for hidden triangles: no texels; for the patch chart, whose triangles repairFolds lays out). */
export const pointChart = (a = 0.5, b = 0.5) => () => [a, b, 0];

/**
 * Split a mesh into charts.
 * @param mesh    { position, normal, indices } (fish frame)
 * @param charts  [{ name, rect: [x0, y0, x1, y1] (atlas share), project(p, n) → [a, b, depth] (a, b in 0..1; depth:
 *                the distance from the projection's viewpoint, for chartResolve), wrapV?, wrapShare? }]
 *                (wrapV: b wraps round once; a triangle across the wrap gets its low corners lifted by one turn, which
 *                takes `wrapShare` (default 1) of the rect's height, so the lifted copies stay in the rect when < 1)
 * @param prefer  (p, n, v) → chart index for vertex v
 * @param o       { force: Int16Array per triangle (chart index, −1 to choose by the corners) }
 * @returns { position, normal, uv, depth, indices, chart (per vertex), source (per vertex: index in the input), triChart }
 */
export function chartMesh(mesh, charts, prefer, o = {}) {
  const { position: P, normal: N, indices: I } = mesh;
  const nv = P.length / 3, nt = I.length / 3;
  const all = o.force && o.force.every((c) => c >= 0);
  const pref = new Int16Array(nv);
  if (!all) for (let v = 0; v < nv; v++) pref[v] = prefer([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], v);
  const triChart = new Int16Array(nt);
  for (let t = 0; t < nt; t++) {
    const f = o.force ? o.force[t] : -1;
    if (f >= 0) { triChart[t] = f; continue; }
    const a = pref[I[t * 3]], b = pref[I[t * 3 + 1]], c = pref[I[t * 3 + 2]];
    triChart[t] = a === b || a === c ? a : b === c ? b : a;
  }
  const key = new Map();
  const src = [], chart = [];
  const out = new Uint32Array(I.length);
  for (let t = 0; t < nt; t++) {
    const c = triChart[t];
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k], id = v * 64 + c;
      let ni = key.get(id);
      if (ni === undefined) { ni = src.length; key.set(id, ni); src.push(v); chart.push(c); }
      out[t * 3 + k] = ni;
    }
  }
  const n = src.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2), depth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = src[i];
    for (let k = 0; k < 3; k++) { position[i * 3 + k] = P[v * 3 + k]; normal[i * 3 + k] = N[v * 3 + k]; }
    const C = charts[chart[i]];
    let [a, b, d] = C.project([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]);
    // (crop [a0, b0, a1, b1]: the part of the projection's unit square the rect holds)
    if (C.crop) { a = (a - C.crop[0]) / (C.crop[2] - C.crop[0]); b = (b - C.crop[1]) / (C.crop[3] - C.crop[1]); }
    const ws = C.wrapV ? C.wrapShare ?? 1 : 1;
    uv[i * 2] = C.rect[0] + a * (C.rect[2] - C.rect[0]);
    uv[i * 2 + 1] = C.rect[1] + b * ws * (C.rect[3] - C.rect[1]);
    depth[i] = d ?? 0;
  }
  // a chart that wraps in v: a triangle across the seam gets its low corners lifted by one turn (its own copies), so
  // it spans the seam instead of the whole chart
  const extra = [];
  for (let t = 0; t < nt; t++) {
    const C = charts[triChart[t]];
    if (!C.wrapV) continue;
    const h = (C.rect[3] - C.rect[1]) * (C.wrapShare ?? 1);
    const vs = [0, 1, 2].map((k) => uv[out[t * 3 + k] * 2 + 1]);
    if (Math.max(...vs) - Math.min(...vs) < h * 0.5) continue;
    for (let k = 0; k < 3; k++) if (vs[k] - C.rect[1] < h * 0.5) extra.push({ i: out[t * 3 + k], t, k, h });
  }
  if (!extra.length) return { position, normal, uv, depth, indices: out, chart: Int16Array.from(chart), source: Uint32Array.from(src), triChart };
  const m = n + extra.length;
  const pos2 = new Float32Array(m * 3), nrm2 = new Float32Array(m * 3), uv2 = new Float32Array(m * 2), dep2 = new Float32Array(m);
  pos2.set(position); nrm2.set(normal); uv2.set(uv); dep2.set(depth);
  const lifted = new Map();
  let e = 0;
  for (const { i, t, k, h } of extra) {
    let j = lifted.get(i);
    if (j === undefined) {
      j = n + e++;
      lifted.set(i, j);
      for (let c = 0; c < 3; c++) { pos2[j * 3 + c] = position[i * 3 + c]; nrm2[j * 3 + c] = normal[i * 3 + c]; }
      uv2[j * 2] = uv[i * 2]; uv2[j * 2 + 1] = uv[i * 2 + 1] + h; dep2[j] = depth[i];
      src.push(src[i]); chart.push(chart[i]);
    }
    out[t * 3 + k] = j;
  }
  const ne = n + e;
  return { position: pos2.subarray(0, ne * 3), normal: nrm2.subarray(0, ne * 3), uv: uv2.subarray(0, ne * 2), depth: dep2.subarray(0, ne), indices: out, chart: Int16Array.from(chart), source: Uint32Array.from(src), triChart };
}

/**
 * Charts without overlaps: chartMesh; its assignment smoothed (cleanCharts: no speckles along the rules' boundaries);
 * then, chart by chart, a depth test in UV space from each projection's own viewpoint (its `depth`): a triangle more
 * than `share` of whose texels (or whose centre) lie behind another surface of the same chart by more than `eps` (mm)
 * is occluded there (a pad's underside behind the lip in the face's chart, the cheek below the collar in the dome's)
 * and moves to its chart's fallback (fallback(chart, centroid, normal) → chart), a few rounds until nothing moves; the
 * relay chart's (patch) regions closed; the rest smoothed again without undoing a move, and a last depth test.
 * @param o { size (texels of the atlas side, 2048), eps (mm), share (0.25), rounds (4), force, fallback, clean
 *          ({ passes, minIsland } or false), close (3), log }
 * @returns chartMesh's result with stats { moved: per round, pairs, closed, cleaned }
 */
export function chartResolve(mesh, charts, prefer, o = {}) {
  const log = o.log ?? (() => {});
  const size = o.size ?? 2048, eps = o.eps ?? 0.02, share = o.share ?? 0.25;
  const { position: P, indices: I } = mesh, nt = I.length / 3;
  let ch = chartMesh(mesh, charts, prefer, { force: o.force ?? null });
  const triChart = Int16Array.from(ch.triChart);
  const nb = triangleNeighbours(I, nt);
  const forced = o.force ? (t) => o.force[t] >= 0 : null;
  const cleaned = [];
  if (o.clean !== false) {
    cleaned.push(cleanCharts(I, triChart, charts, { ...(o.clean ?? {}), keep: forced, nb }));
    ch = chartMesh(mesh, charts, prefer, { force: triChart });
  }
  const moved = [], pairs = new Map(), left = new Map();
  const occlusion = (rounds) => {
    for (let round = 0; round < rounds; round++) {
      const occ = occludedTriangles(ch, charts, { size, eps, share });
      let m = 0;
      for (let t = 0; t < nt; t++) {
        if (!occ[t]) continue;
        const c = [0, 1, 2].map((q) => (P[I[t * 3] * 3 + q] + P[I[t * 3 + 1] * 3 + q] + P[I[t * 3 + 2] * 3 + q]) / 3);
        const nn = triNormal(P, I, t);
        const f = o.fallback ? o.fallback(triChart[t], c, nn) : -1;
        if (f >= 0 && f !== triChart[t]) {
          const k = `${charts[triChart[t]].name}→${charts[f].name}`;
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
          left.set(t, (left.get(t) ?? 0) | (1 << triChart[t]));
          triChart[t] = f; m++;
        }
      }
      moved.push(m);
      if (!m) break;
      ch = chartMesh(mesh, charts, prefer, { force: triChart });
    }
  };
  occlusion(o.rounds ?? 4);
  // the relay chart's (patch) regions closed: a triangle with two or more of its three neighbours there joins them
  // (a few passes), so the patch holds a few whole regions (a pad's underside, a pocket's end) instead of speckles
  // whose seams the simplifier could not collapse
  const relay = charts.findIndex((c) => c.relay);
  let closed = 0;
  if (relay >= 0 && (o.close ?? 3) > 0) {
    for (let pass = 0; pass < (o.close ?? 3); pass++) {
      const add = [];
      for (let t = 0; t < nt; t++) {
        if (triChart[t] === relay || charts[triChart[t]].hidden) continue;
        let k = 0;
        for (let j = 0; j < 3; j++) { const u = nb[t * 3 + j]; if (u >= 0 && triChart[u] === relay) k++; }
        if (k >= 2) add.push(t);
      }
      for (const t of add) triChart[t] = relay;
      closed += add.length;
      if (!add.length) break;
    }
  }
  if (o.clean !== false) {
    // (the moved triangles and the patch stay; the rest is smoothed round them)
    cleaned.push(cleanCharts(I, triChart, charts, { ...(o.clean ?? {}), passes: 1, keep: (t) => (forced && forced(t)) || left.has(t) || triChart[t] === relay, nb }));
  }
  ch = chartMesh(mesh, charts, prefer, { force: triChart });
  occlusion(1);
  log(`chartResolve: smoothed ${cleaned.join(' + ')} triangles; moved ${moved.join(' + ')} occluded triangles (${[...pairs].map(([k, v]) => `${k} ${v}`).join(', ')}), ${closed} more to close the patch's regions`);
  ch.stats = { moved, pairs: Object.fromEntries(pairs), closed, cleaned };
  return ch;
}

/**
 * Smooth a per-triangle chart assignment in place: a few passes of a mode filter (a triangle two or three of whose
 * neighbours share another chart takes it), then every connected piece of a chart smaller than `minIsland` triangles
 * goes to the chart most of its border touches. Hidden charts and `keep(t)` triangles stay. Returns the triangles
 * changed. (Where a projection's rule flips from vertex to vertex, along the collar's crease or a lip, the charts
 * otherwise meet in speckles: islands of a few triangles, each a UV seam the simplifier keeps.)
 */
export function cleanCharts(I, triChart, charts, { passes = 2, minIsland = 24, keep = null, nb = null } = {}) {
  const nt = I.length / 3;
  nb ??= triangleNeighbours(I, nt);
  const fixed = (t) => charts[triChart[t]].hidden || (keep && keep(t));
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    const upd = [];
    for (let t = 0; t < nt; t++) {
      if (fixed(t)) continue;
      const a = nb[t * 3], b = nb[t * 3 + 1], c = nb[t * 3 + 2];
      const ca = a >= 0 ? triChart[a] : -1, cb = b >= 0 ? triChart[b] : -1, cc = c >= 0 ? triChart[c] : -1;
      const m = ca >= 0 && (ca === cb || ca === cc) ? ca : cb >= 0 && cb === cc ? cb : -1;
      if (m >= 0 && m !== triChart[t] && !charts[m].hidden) upd.push([t, m]);
    }
    for (const [t, m] of upd) triChart[t] = m;
    changed += upd.length;
    if (!upd.length) break;
  }
  // small pieces
  const comp = new Int32Array(nt).fill(-1);
  let nc = 0;
  for (let s = 0; s < nt; s++) {
    if (comp[s] >= 0) continue;
    const c = triChart[s], stack = [s], members = [];
    comp[s] = nc;
    while (stack.length) {
      const t = stack.pop();
      members.push(t);
      for (let j = 0; j < 3; j++) { const u = nb[t * 3 + j]; if (u >= 0 && comp[u] < 0 && triChart[u] === c) { comp[u] = nc; stack.push(u); } }
    }
    nc++;
    if (members.length >= minIsland || charts[c].hidden || members.some((t) => keep && keep(t))) continue;
    const votes = new Map();
    for (const t of members) for (let j = 0; j < 3; j++) { const u = nb[t * 3 + j]; if (u >= 0 && triChart[u] !== c && !charts[triChart[u]].hidden) votes.set(triChart[u], (votes.get(triChart[u]) ?? 0) + 1); }
    let best = -1, bv = 0;
    for (const [k, v] of votes) if (v > bv) { bv = v; best = k; }
    if (best >= 0) { for (const t of members) triChart[t] = best; changed += members.length; }
  }
  return changed;
}

/** Each triangle's three edge neighbours (−1 on a border; on a non-manifold edge, one of them). */
export function triangleNeighbours(I, nt = I.length / 3) {
  const E = new Map(), nb = new Int32Array(nt * 3).fill(-1);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = a < b ? a * 4194304 + b : b * 4194304 + a;
    const u = E.get(key);
    if (u === undefined) E.set(key, t * 3 + k);
    else { nb[t * 3 + k] = Math.floor(u / 3); nb[u] = t; }
  }
  return nb;
}

/** Triangles behind another surface of their own chart (see chartResolve). */
export function occludedTriangles(mesh, charts, { size = 2048, eps = 0.02, share = 0.25 } = {}) {
  const { uv, indices: I, depth } = mesh, nt = I.length / 3, triChart = triCharts(mesh);
  const z = new Float32Array(size * size).fill(Infinity);
  const skip = (t) => { const C = charts[triChart[t]]; return C.hidden || C.relay; };
  const at = (t, cb) => rasterBary(uv, I, t, size, cb);
  for (let t = 0; t < nt; t++) {
    if (skip(t)) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const da = depth[a], db = depth[b], dc = depth[c];
    at(t, (p, w0, w1, w2) => { const d = w0 * da + w1 * db + w2 * dc; if (d < z[p]) z[p] = d; });
  }
  const occ = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    if (skip(t)) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const da = depth[a], db = depth[b], dc = depth[c];
    let n = 0, hid = 0;
    at(t, (p, w0, w1, w2) => { n++; if (w0 * da + w1 * db + w2 * dc > z[p] + eps) hid++; });
    if (n === 0) {
      // (smaller than a texel: its centre against the texel under it)
      const x = Math.min(size - 1, Math.max(0, Math.floor(((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3) * size)));
      const y = Math.min(size - 1, Math.max(0, Math.floor(((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3) * size)));
      if ((da + db + dc) / 3 > z[y * size + x] + eps) occ[t] = 1;
    } else if (hid > share * n) occ[t] = 1;
  }
  return occ;
}

/** Texel centres inside triangle t with their barycentric weights (both windings). */
function rasterBary(uv, I, t, size, cb) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  const ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) / area;
      const w1 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) cb(y * size + x, w0, w1, w2);
    }
  }
}

/** Signed UV area of triangle t (positive counter-clockwise in (u, v)). */
function uvArea(uv, I, t) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  return 0.5 * ((uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[b * 2 + 1] - uv[a * 2 + 1]) * (uv[c * 2] - uv[a * 2]));
}
function triArea3(P, I, t) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
  const w = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
  return 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
}
function triNormal(P, I, t) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
  const w = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}

/** Each chart's orientation: the sign of the UV area most of its 3D area has (+1, −1; 0 for an empty chart). */
export function chartOrientation(mesh, nCharts) {
  const { uv, indices: I, position: P } = mesh, triChart = triCharts(mesh);
  const acc = new Float64Array(nCharts);
  for (let t = 0; t < I.length / 3; t++) acc[triChart[t]] += Math.sign(uvArea(uv, I, t)) * triArea3(P, I, t);
  return Array.from(acc, (x) => Math.sign(x));
}
function triCharts(mesh) {
  if (mesh.triChart && mesh.triChart.length === mesh.indices.length / 3) return mesh.triChart;
  const I = mesh.indices, out = new Int16Array(I.length / 3);
  for (let t = 0; t < out.length; t++) out[t] = mesh.chart[I[t * 3]];
  return out;
}

/** The triangles a UV layout cannot keep: folded (against their chart's orientation), degenerate in UV while not in
 * 3D, or with a corner outside their chart's rect (beyond `tol`). Hidden charts (chart.hidden) are skipped. */
export function badTriangles(mesh, charts, { tol = 1e-6, degenerate = 0.02, overlap = null } = {}) {
  const { uv, indices: I, position: P } = mesh, triChart = triCharts(mesh);
  const orient = chartOrientation(mesh, charts.length);
  // the median texel stretch per chart (UV area per 3D area), to tell a collapsed triangle
  const ratios = charts.map(() => []);
  for (let t = 0; t < I.length / 3; t++) { const A = triArea3(P, I, t); if (A > 0) ratios[triChart[t]].push(Math.abs(uvArea(uv, I, t)) / A); }
  const med = ratios.map((r) => { if (!r.length) return 0; r.sort((a, b) => a - b); return r[r.length >> 1]; });
  const bad = new Uint8Array(I.length / 3);
  for (let t = 0; t < bad.length; t++) {
    const c = triChart[t], C = charts[c];
    if (C.hidden) continue;
    const s = uvArea(uv, I, t), A = triArea3(P, I, t);
    // (a triangle sent to a relay chart (the patch) and not laid out yet has no UV area)
    if (C.relay && s === 0) { bad[t] = 2; continue; }
    if (orient[c] !== 0 && s * orient[c] <= 0 && A > 0) { bad[t] = 1; continue; }
    if (A > 0 && Math.abs(s) / A < degenerate * med[c]) { bad[t] = 2; continue; }
    const R = C.rect;
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k], x = uv[v * 2], y = uv[v * 2 + 1];
      if (x < R[0] - tol || x > R[2] + tol || y < R[1] - tol || y > R[3] + tol) { bad[t] = 3; break; }
    }
  }
  // (overlap { size, eps }: and any triangle with a texel behind another of its chart: the overlaps the simplifier
  // made, or that the depth test let through below its share)
  if (overlap && mesh.depth) {
    const occ = occludedTriangles(mesh, charts, { size: overlap.size ?? 2048, eps: overlap.eps ?? 0.01, share: 0 });
    for (let t = 0; t < bad.length; t++) if (occ[t] && !bad[t]) bad[t] = 4;
  }
  return bad;
}

/**
 * Re-project what the charts cannot map: islands of bad triangles (badTriangles), each grown by `ring` rings of their
 * neighbours, are laid flat along their mean normal (split by normal direction when they curl too much for one plane,
 * down to single triangles) and shelf-packed into the patch chart's rect at the atlas' texel density.
 * @param mesh   { position, normal, uv, indices, chart (per vertex), source (per vertex), [other per-vertex arrays] }
 * @param charts the chart list; one of them named 'patch' (its rect receives the islands)
 * @param o      { ring (1), density: atlas share per mm (the charts' own, for the islands' scale), maxPasses (3), log }
 * @returns { mesh (new arrays, same triangle order), stats: { islands, triangles, scale, passes, left } }
 */
export function repairFolds(mesh, charts, o = {}) {
  const log = o.log ?? (() => {});
  const ci = charts.findIndex((c) => c.name === 'patch');
  if (ci < 0) throw new Error('repairFolds: no patch chart');
  let cur = mesh, stats = { islands: 0, triangles: 0, scale: 1, passes: 0, left: 0 };
  const isPatch = new Uint8Array(mesh.indices.length / 3);
  for (let pass = 0; pass < (o.maxPasses ?? 3); pass++) {
    const bad = badTriangles(cur, charts, o);
    const triChart = triCharts(cur);
    // (a bad patch triangle cannot come from the projection: it is re-laid on its own next pass with no ring)
    let nb = 0;
    for (let t = 0; t < bad.length; t++) if (bad[t]) nb++;
    stats.left = nb;
    if (!nb) break;
    stats.passes = pass + 1;
    const { mesh: next, islands } = relayIslands(cur, charts, ci, bad, triChart, { ...o, ring: pass === 0 ? o.ring ?? 1 : pass === 1 ? 1 : 0, single: pass === 2, isPatch });
    stats.islands += islands; stats.triangles += nb;
    cur = next;
  }
  stats.left = badTriangles(cur, charts, o).reduce((a, b) => a + (b ? 1 : 0), 0);
  if (stats.passes) cur = dropUnused(cur, o.vertexArrays);
  log(`repairFolds: ${stats.triangles} bad triangles in ${stats.islands} islands, ${stats.passes} passes, ${stats.left} left`);
  return { mesh: cur, stats };
}

/** The mesh without the vertices no triangle uses (the patch's old copies after a relayout). */
function dropUnused(mesh, more = []) {
  const I = mesh.indices, nv = mesh.position.length / 3, remap = new Int32Array(nv).fill(-1);
  let m = 0;
  for (let v = 0; v < nv; v++) remap[v] = -1;
  const used = new Uint8Array(nv);
  for (const v of I) used[v] = 1;
  for (let v = 0; v < nv; v++) if (used[v]) remap[v] = m++;
  if (m === nv) return mesh;
  const out = { ...mesh, indices: new Uint32Array(I.length) };
  for (let i = 0; i < I.length; i++) out.indices[i] = remap[I[i]];
  for (const k of ['position', 'normal', 'uv', 'chart', 'source', 'tangent', 'depth', ...more]) {
    const a = mesh[k];
    if (!a) continue;
    const c = a.length / nv, b = new a.constructor(m * c);
    for (let v = 0; v < nv; v++) if (remap[v] >= 0) for (let q = 0; q < c; q++) b[remap[v] * c + q] = a[v * c + q];
    out[k] = b;
  }
  return out;
}

function relayIslands(mesh, charts, ci, bad, triChart, o) {
  const { position: P, indices: I } = mesh, nt = I.length / 3, nv = P.length / 3;
  // vertex → triangles, by welded source (chart copies of a vertex are neighbours)
  const src = mesh.source;
  const key = (v) => src[v];
  const vt = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const s = key(I[t * 3 + k]); let a = vt.get(s); if (!a) vt.set(s, (a = [])); a.push(t); }
  const sel = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) if (bad[t]) sel[t] = 1;
  for (let r = 0; r < o.ring; r++) {
    const add = [];
    for (let t = 0; t < nt; t++) if (sel[t]) for (let k = 0; k < 3; k++) for (const u of vt.get(key(I[t * 3 + k]))) if (!sel[u] && !charts[triChart[u]].hidden) add.push(u);
    for (const u of add) sel[u] = 1;
  }
  // (the patch is laid out whole every time: the islands already in it are packed again with the new ones)
  for (let t = 0; t < nt; t++) if (triChart[t] === ci) sel[t] = 1;
  // islands: edge-connected components of the selection (through welded vertices)
  const parent = new Int32Array(nt).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const edgeT = new Map();
  for (let t = 0; t < nt; t++) {
    if (!sel[t]) continue;
    for (let k = 0; k < 3; k++) {
      const a = key(I[t * 3 + k]), b = key(I[t * 3 + (k + 1) % 3]), e = a < b ? a * 4194304 + b : b * 4194304 + a;
      const u = edgeT.get(e);
      if (u === undefined) edgeT.set(e, t); else { const ra = find(u), rb = find(t); if (ra !== rb) parent[rb] = ra; }
    }
  }
  const groups = new Map();
  for (let t = 0; t < nt; t++) if (sel[t]) { const r = find(t); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); }
  // each island flat: split by normal direction until every triangle faces its plane (n·N > 0.25) and no triangle
  // folds; single triangles when all else fails
  const pieces = [];
  const lay = (tris, depth) => {
    if (o.single || depth > 3) { for (const t of tris) pieces.push(planarPiece(mesh, [t])); return; }
    const N = [0, 0, 0];
    for (const t of tris) { const n = triNormal(P, I, t); N[0] += n[0]; N[1] += n[1]; N[2] += n[2]; }
    const l = Math.hypot(...N);
    let ok = l > 0;
    if (ok) for (const t of tris) { const n = triNormal(P, I, t), m = Math.hypot(...n) || 1; if ((n[0] * N[0] + n[1] * N[1] + n[2] * N[2]) / (m * l) < 0.25) { ok = false; break; } }
    if (ok) {
      const piece = planarPiece(mesh, tris, [N[0] / l, N[1] / l, N[2] / l]);
      if (!piece.folds) { pieces.push(piece); return; }
    }
    // split by the dominant direction among the island's normals (6 axes), then by connectivity
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const byDir = dirs.map(() => []);
    for (const t of tris) {
      const n = triNormal(P, I, t);
      let bi = 0, bv = -Infinity;
      dirs.forEach((d, i) => { const v = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; if (v > bv) { bv = v; bi = i; } });
      byDir[bi].push(t);
    }
    const nonEmpty = byDir.filter((g) => g.length);
    if (nonEmpty.length === 1) { for (const t of tris) pieces.push(planarPiece(mesh, [t])); return; }
    for (const g of nonEmpty) for (const comp of components(g)) lay(comp, depth + 1);
  };
  const components = (tris) => {
    const set = new Set(tris), pa = new Map(tris.map((t) => [t, t]));
    const f = (a) => { while (pa.get(a) !== a) { pa.set(a, pa.get(pa.get(a))); a = pa.get(a); } return a; };
    const em = new Map();
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const a = key(I[t * 3 + k]), b = key(I[t * 3 + (k + 1) % 3]), e = a < b ? a * 4194304 + b : b * 4194304 + a;
      const u = em.get(e);
      if (u === undefined) em.set(e, t); else if (set.has(u)) { const ra = f(u), rb = f(t); if (ra !== rb) pa.set(rb, ra); }
    }
    const out = new Map();
    for (const t of tris) { const r = f(t); if (!out.has(r)) out.set(r, []); out.get(r).push(t); }
    return [...out.values()];
  };
  // (the last pass lays only the triangles still bad one by one; the rest of their island as before)
  for (const g of groups.values()) {
    if (!o.single) { lay(g, 0); continue; }
    const rest = g.filter((t) => !bad[t]);
    for (const t of g) if (bad[t]) pieces.push(planarPiece(mesh, [t]));
    const o2 = o.single;
    o.single = false;
    for (const comp of components(rest)) if (comp.length) lay(comp, 0);
    o.single = o2;
  }
  // shelf packing into the patch rect at the charts' density (scaled down if they do not fit)
  const R = charts[ci].rect, W = R[2] - R[0], H = R[3] - R[1];
  const dens = o.density ?? 0.0157; // atlas share per mm (0.0019 HL per texel at 2048)
  const pad = o.pad ?? 2 / 2048;
  let scale = dens;
  for (let tries = 0; tries < 30; tries++) {
    if (shelf(pieces, scale, W, H, pad)) break;
    scale *= 0.85;
  }
  // rebuild: island triangles get new vertex copies (one per island vertex) with the packed UVs
  const n0 = nv;
  const arrays = ['position', 'normal', 'uv', 'chart', 'source', 'tangent', 'depth', ...(o.vertexArrays ?? [])].filter((k) => mesh[k]).map((k) => [k, mesh[k]]);
  let extra = 0;
  for (const pc of pieces) extra += pc.verts.length;
  const out = {};
  for (const [k, a] of arrays) { const c = a.length / nv, b = new a.constructor((nv + extra) * c); b.set(a); out[k] = b; }
  const indices = Uint32Array.from(I);
  const tc = Int16Array.from(triChart);
  let nx = n0;
  for (const pc of pieces) {
    const map = new Map();
    pc.verts.forEach((v, j) => {
      const w = nx++;
      map.set(v, w);
      for (const [k, a] of arrays) { const c = a.length / nv; for (let q = 0; q < c; q++) out[k][w * c + q] = a[v * c + q]; }
      out.uv[w * 2] = R[0] + pc.ox + pc.uv[j * 2] * scale;
      out.uv[w * 2 + 1] = R[1] + pc.oy + pc.uv[j * 2 + 1] * scale;
      out.chart[w] = ci;
    });
    for (const t of pc.tris) { for (let k = 0; k < 3; k++) indices[t * 3 + k] = map.get(I[t * 3 + k]); tc[t] = ci; o.isPatch[t] = 1; }
  }
  const res = { ...mesh, ...out, indices, triChart: tc };
  return { mesh: res, islands: pieces.length };
}

/** A set of triangles laid flat along N (mm in the plane, origin at the bbox's corner): { tris, verts, uv, w, h, folds }. */
function planarPiece(mesh, tris, N = null) {
  const { position: P, indices: I } = mesh;
  if (!N) { const n = triNormal(P, I, tris[0]), l = Math.hypot(...n) || 1; N = [n[0] / l, n[1] / l, n[2] / l]; }
  const t0 = Math.abs(N[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e0 = norm(sub(t0, scale(N, dot(t0, N)))), e1 = cross(N, e0);
  const verts = [], idx = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (!idx.has(v)) { idx.set(v, verts.length); verts.push(v); } }
  const uv = new Float64Array(verts.length * 2);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  verts.forEach((v, j) => {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], x = dot(p, e0), y = dot(p, e1);
    uv[j * 2] = x; uv[j * 2 + 1] = y;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  });
  for (let j = 0; j < verts.length; j++) { uv[j * 2] -= x0; uv[j * 2 + 1] -= y0; }
  // folds: a triangle facing away from N lies reversed in the plane ((e0, e1, N) is right-handed, so the triangles
  // wound counter-clockwise about N come out positive)
  let folds = 0;
  for (const t of tris) {
    const a = idx.get(I[t * 3]), b = idx.get(I[t * 3 + 1]), c = idx.get(I[t * 3 + 2]);
    const s = (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[b * 2 + 1] - uv[a * 2 + 1]) * (uv[c * 2] - uv[a * 2]);
    if (s <= 0) folds++;
  }
  return { tris, verts, uv, w: x1 - x0, h: y1 - y0, folds };
}

/** Shelf packing of pieces (w, h in mm) at `scale` (atlas share per mm) into W × H; sets ox, oy; false if they do not fit. */
function shelf(pieces, scale, W, H, pad) {
  const order = pieces.map((_, i) => i).sort((a, b) => pieces[b].h - pieces[a].h);
  let x = pad, y = pad, rowH = 0;
  for (const i of order) {
    const pc = pieces[i], w = pc.w * scale, h = pc.h * scale;
    if (w + 2 * pad > W) return false;
    if (x + w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
    if (y + h + pad > H) return false;
    pc.ox = x; pc.oy = y;
    x += w + pad; rowH = Math.max(rowH, h);
  }
  return true;
}

/**
 * UV quality per chart: triangles, folds, collapsed, corners outside the rect, texels claimed by more than one triangle
 * (rasterised at size × size, texel centres, half-open edges), coverage of the rect, and the texel density (mm of
 * surface per texel at that size: the area-weighted median, 10th and 90th percentiles of √(3D area / texel area)).
 * @returns { charts: [{ name, tris, folds, collapsed, outside, texels, overlap, overlapShare, coverage, density: {p10, p50, p90} }], total }
 */
export function uvStats(mesh, charts, { size = 2048, tol = 1e-6 } = {}) {
  const { uv, indices: I, position: P } = mesh, nt = I.length / 3, triChart = triCharts(mesh);
  const bad = badTriangles(mesh, charts, { tol });
  const S = charts.map((c) => ({ name: c.name, tris: 0, folds: 0, collapsed: 0, outside: 0, texels: 0, overlap: 0, dens: [] }));
  const count = new Uint8Array(size * size), owner = new Int16Array(size * size).fill(-1);
  for (let t = 0; t < nt; t++) {
    const c = triChart[t], st = S[c];
    st.tris++;
    if (bad[t] === 1) st.folds++; else if (bad[t] === 2) st.collapsed++; else if (bad[t] === 3) st.outside++;
    if (charts[c].hidden) continue;
    const A3 = triArea3(P, I, t), Au = Math.abs(uvArea(uv, I, t)) * size * size;
    if (Au > 0 && A3 > 0) st.dens.push([Math.sqrt(A3 / Au), A3]);
    rasterTri(uv, I, t, size, (p) => { if (count[p] < 255) count[p]++; owner[p] = c; });
  }
  // texels claimed more than once, per chart (the last claimant's chart)
  for (let p = 0; p < count.length; p++) {
    if (!count[p]) continue;
    const st = S[owner[p]];
    st.texels++;
    if (count[p] > 1) st.overlap++;
  }
  const out = S.map((st, c) => {
    const R = charts[c].rect, rectTex = Math.max(1, (R[2] - R[0]) * (R[3] - R[1]) * size * size);
    st.dens.sort((a, b) => a[0] - b[0]);
    const tot = st.dens.reduce((a, d) => a + d[1], 0);
    const pct = (q) => { let acc = 0; for (const d of st.dens) { acc += d[1]; if (acc >= q * tot) return d[0]; } return st.dens.length ? st.dens[st.dens.length - 1][0] : 0; };
    return { name: st.name, tris: st.tris, folds: st.folds, collapsed: st.collapsed, outside: st.outside, texels: st.texels, overlap: st.overlap, overlapShare: st.texels ? st.overlap / st.texels : 0, coverage: st.texels / rectTex, density: { p10: pct(0.1), p50: pct(0.5), p90: pct(0.9) } };
  });
  const total = out.reduce((a, s) => ({ tris: a.tris + s.tris, folds: a.folds + s.folds, collapsed: a.collapsed + s.collapsed, outside: a.outside + s.outside, texels: a.texels + s.texels, overlap: a.overlap + s.overlap }), { tris: 0, folds: 0, collapsed: 0, outside: 0, texels: 0, overlap: 0 });
  return { charts: out, total, size };
}

/** Texel centres inside triangle t (half-open: a centre on a shared edge belongs to one side only). */
function rasterTri(uv, I, t, size, cb) {
  const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
  let ax = uv[a * 2] * size, ay = uv[a * 2 + 1] * size, bx = uv[b * 2] * size, by = uv[b * 2 + 1] * size, cx = uv[c * 2] * size, cy = uv[c * 2 + 1] * size;
  let area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return;
  if (area < 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; area = -area; }
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5)), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5)), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
  // (a centre exactly on an edge counts for the triangle only on its 'top-left' edges, so two triangles sharing the
  // edge never both claim it)
  const owns = (dx, dy) => dy < 0 || (dy === 0 && dx > 0);
  const t0 = owns(cx - bx, cy - by), t1 = owns(ax - cx, ay - cy), t2 = owns(bx - ax, by - ay);
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const w1 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      const w2 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if ((w0 > 0 || (w0 === 0 && t0)) && (w1 > 0 || (w1 === 0 && t1)) && (w2 > 0 || (w2 === 0 && t2))) cb(y * size + x);
    }
  }
}

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const vec = { add, sub, scale, dot, cross, norm };
