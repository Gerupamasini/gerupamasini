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
// outside its rectangle, an overlap) repairFolds first tries in a neighbour's chart, then lays out as a few islands in
// the `patch` rectangle (merged, conformally mapped, unfolded where no disc); uvStats measures all of it.

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
  // (margin: one for both midlines, or [ventral, dorsal]: round B3's far tier reaches further over the ventral one,
  // where its long triangles span the broad flat throat)
  const [mV, mD] = Array.isArray(margin) ? margin : [margin, margin];
  const span = Math.PI + mV + mD;
  return (p) => {
    let ph = Math.atan2(p[2] * side, -(p[1] - axisY(p[0]))); // 0 ventral, π/2 lateral, π dorsal
    if (ph < -Math.PI / 2) ph += TAU; // just over the dorsal midline: past π
    let b;
    if (arc && ph >= 0 && ph <= Math.PI) b = (mV + arc(p[0], ph) * Math.PI) / span;
    else b = (ph + mV) / span;
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

/** Triangles behind another surface of their own chart (see chartResolve). A chart with keep: 'outer' (a projection
 * from a point or a line inside the body: the face's, the body halves', the lobes', the tail's) keeps the outermost
 * surface along each of its rays, the outer skin, and gives up the nearer ones under it (an overhang's underside, the
 * jaw's side under the lip, a pocket's wall); the others (planar and the sockets') keep the nearest. */
export function occludedTriangles(mesh, charts, { size = 2048, eps = 0.02, share = 0.25 } = {}) {
  const { uv, indices: I, depth } = mesh, nt = I.length / 3, triChart = triCharts(mesh);
  const zMin = new Float32Array(size * size).fill(Infinity), zMax = new Float32Array(size * size).fill(-Infinity);
  const skip = (t) => { const C = charts[triChart[t]]; return C.hidden || C.relay; };
  const at = (t, cb) => rasterBary(uv, I, t, size, cb);
  for (let t = 0; t < nt; t++) {
    if (skip(t)) continue;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const da = depth[a], db = depth[b], dc = depth[c];
    at(t, (p, w0, w1, w2) => { const d = w0 * da + w1 * db + w2 * dc; if (d < zMin[p]) zMin[p] = d; if (d > zMax[p]) zMax[p] = d; });
  }
  const occ = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    if (skip(t)) continue;
    const outer = charts[triChart[t]].keep === 'outer';
    const hidden = outer ? (d, p) => d < zMax[p] - eps : (d, p) => d > zMin[p] + eps;
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    const da = depth[a], db = depth[b], dc = depth[c];
    let n = 0, hid = 0;
    at(t, (p, w0, w1, w2) => { n++; if (hidden(w0 * da + w1 * db + w2 * dc, p)) hid++; });
    if (n === 0) {
      // (smaller than a texel: its centre against the texel under it)
      const x = Math.min(size - 1, Math.max(0, Math.floor(((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3) * size)));
      const y = Math.min(size - 1, Math.max(0, Math.floor(((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3) * size)));
      if (hidden((da + db + dc) / 3, y * size + x)) occ[t] = 1;
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
    // (all three corners in the chart's rect, or for the patch in one of its bins, `rects`)
    const inR = (R) => { for (let k = 0; k < 3; k++) { const v = I[t * 3 + k], x = uv[v * 2], y = uv[v * 2 + 1]; if (x < R[0] - tol || x > R[2] + tol || y < R[1] - tol || y > R[3] + tol) return false; } return true; };
    if (!(C.rects ?? [C.rect]).some(inR)) bad[t] = 3;
  }
  // (overlap { size, eps }: and any triangle with a texel behind another of its chart: the overlaps the simplifier
  // made, or that the depth test let through below its share)
  if (overlap && mesh.depth) {
    const occ = occludedTriangles(mesh, charts, { size: overlap.size ?? 2048, eps: overlap.eps ?? 0.01, share: overlap.share ?? 0 });
    for (let t = 0; t < bad.length; t++) if (occ[t] && !bad[t]) bad[t] = 4;
  }
  return bad;
}

/**
 * Re-project what the charts cannot map, as a few large islands in the `patch` chart. First each bad triangle
 * (badTriangles) tried in a neighbour's chart (refitTriangles), then the small groups left — and small pieces of the
 * patch — mended inside the chart round them (relaxInChart; o.relax: its options, false to skip). The rest and the
 * patch's own triangles are closed over `close` rings (islands within about twice that of each other merge), grown by
 * `ring` rings of their neighbours (a margin of skin), every island still under `minIsland` triangles grown a ring at a
 * time until it is no longer (`maxGrow` rings); then each island laid flat (flattenIsland: a conformal map, LSCM, of a
 * disc, or of the island cut open into one; split where that folds or overlaps itself) and packed into the patch's
 * rect — and into the spare rects, the charts the mesh leaves empty (o.spare: names) — at the charts' texel density,
 * `pad` apart.
 * @param mesh   { position, normal, uv, indices, chart (per vertex), source (per vertex: the welded vertex),
 *               [other per-vertex arrays] }
 * @param charts the chart list; one of them named 'patch' (its rect, and its bins `rects` once spares are added)
 * @param o      { ring (2), minIsland (40), maxGrow (6), density: atlas share per mm, pad (atlas share), spare,
 *               maxPasses (3), overlap (badTriangles'), log }
 * @returns { mesh (new arrays, same triangle order), stats: { islands, singles, triangles, scale, passes, left, bins } }
 */
export function repairFolds(mesh, charts, o = {}) {
  const log = o.log ?? (() => {});
  const ci = charts.findIndex((c) => c.name === 'patch');
  if (ci < 0) throw new Error('repairFolds: no patch chart');
  // the bins: the patch's rect, then each spare chart this mesh does not use
  const used = new Set(triCharts(mesh));
  const spare = (o.spare ?? []).map((n) => charts.findIndex((c) => c.name === n)).filter((k) => k >= 0 && !used.has(k));
  charts[ci].rects = [charts[ci].rect, ...spare.map((k) => charts[k].rect)];
  let cur = mesh, stats = { islands: 0, singles: 0, triangles: 0, scale: 1, passes: 0, left: 0, bins: charts[ci].rects.length };
  for (let pass = 0; pass < (o.maxPasses ?? 3); pass++) {
    let bad = badTriangles(cur, charts, o);
    // (first each bad triangle tried in its neighbours' charts: one that maps it the right way round, unstretched,
    // inside the rect and on free texels takes it)
    if (pass === 0 && o.refit !== false) {
      const rf = refitTriangles(cur, charts, bad, { size: o.overlap?.size ?? o.size ?? 2048 });
      if (rf.moved) { cur = rf.mesh; bad = badTriangles(cur, charts, o); stats.refit = rf.moved; }
    }
    // (then the small groups left mended inside the chart round them: relaxInChart)
    if (pass === 0 && o.relax !== false) {
      const rx = relaxInChart(cur, charts, bad, { ...(o.relax ?? {}), size: o.overlap?.size ?? o.size ?? 2048 });
      if (rx.moved) { cur = rx.mesh; bad = badTriangles(cur, charts, o); stats.relaxed = rx.moved; stats.mended = rx.groups; }
    }
    const triChart = triCharts(cur);
    let nb = 0;
    for (let t = 0; t < bad.length; t++) if (bad[t]) nb++;
    stats.left = nb;
    if (!nb) break;
    stats.passes = pass + 1;
    // (the first pass grows and merges; a later one only re-lays what is still bad, with the rest of the patch)
    const r = relayIslands(cur, charts, ci, bad, triChart, { ...o, close: pass === 0 ? o.close ?? 2 : 0, ring: pass === 0 ? o.ring ?? 1 : 0, minIsland: pass === 0 ? o.minIsland ?? 40 : 0, last: pass === (o.maxPasses ?? 3) - 1 });
    stats.islands = r.islands; stats.singles = r.singles; stats.scale = r.scale; stats.triangles = r.triangles; if (pass === 0) { stats.grownBy = r.grownBy; stats.groups = r.groups; }
    cur = r.mesh;
  }
  stats.left = badTriangles(cur, charts, o).reduce((a, b) => a + (b ? 1 : 0), 0);
  if (stats.passes) cur = dropUnused(cur, o.vertexArrays);
  log(`repairFolds: ${stats.triangles} triangles in ${stats.islands} islands (${stats.singles} single), ${stats.bins} bin(s), scale ${(stats.scale / (o.density ?? 0.0157)).toFixed(2)} of the density, ${stats.passes} passes, ${stats.left} left; refit ${stats.refit ?? 0}, mended in their charts ${stats.relaxed ?? 0} in ${stats.mended ?? 0} groups, groups ${stats.groups}, selected bad+patch → closed → margin → grown ${stats.grownBy?.join(' → ')}; layouts tried ${JSON.stringify(FLAT)}`);
  for (const k of Object.keys(FLAT)) delete FLAT[k];
  return { mesh: cur, stats };
}

/** A point's UV in a chart (chartMesh's mapping: the projection, its crop, the rect; wrapV charts are not handled). */
function projectUV(C, p, n) {
  let [a, b, d] = C.project(p, n);
  if (C.crop) { a = (a - C.crop[0]) / (C.crop[2] - C.crop[0]); b = (b - C.crop[1]) / (C.crop[3] - C.crop[1]); }
  return [C.rect[0] + a * (C.rect[2] - C.rect[0]), C.rect[1] + b * (C.rect[3] - C.rect[1]), d ?? 0];
}

/**
 * Bad triangles moved to a neighbour's chart where they fit: for each bad triangle (not hidden), the charts of its
 * edge neighbours (welded by `source`; not the patch, hidden or wrapping charts) are tried in turn; the first that maps
 * it with the chart's orientation, a texel stretch within 4× of the chart's median, every corner in the rect and no
 * texel already covered (half-open edges, so the edges it shares with that chart's triangles are free) takes it, with
 * the vertex copies that chart already has or new ones. Returns { mesh, moved }.
 */
function refitTriangles(mesh, charts, bad, { size = 2048 } = {}) {
  const { position: P, normal: N, indices: I0, source: src } = mesh, nt = I0.length / 3, nv = P.length / 3;
  const triChart = Int16Array.from(triCharts(mesh));
  const orient = chartOrientation(mesh, charts.length);
  const ratios = charts.map(() => []);
  for (let t = 0; t < nt; t++) { if (bad[t]) continue; const A = triArea3(P, I0, t); if (A > 0) ratios[triChart[t]].push(Math.abs(uvArea(mesh.uv, I0, t)) / A); }
  const med = ratios.map((r) => { if (!r.length) return 0; r.sort((a, b) => a - b); return r[r.length >> 1]; });
  // texels covered by the good triangles
  const occ = new Uint8Array(size * size);
  for (let t = 0; t < nt; t++) { const C = charts[triChart[t]]; if (bad[t] || C.hidden || C.relay) continue; rasterTri(mesh.uv, I0, t, size, (p) => { occ[p] = 1; }); }
  const nbr = triangleNeighbours(Uint32Array.from(I0, (v) => src[v]), nt);
  // (source, chart) → vertex
  const copy = new Map(), ck = (s, c) => s * 64 + c;
  for (let v = 0; v < nv; v++) copy.set(ck(src[v], mesh.chart[v]), v);
  const I = Uint32Array.from(I0), extra = [];
  let moved = 0;
  for (let t = 0; t < nt; t++) {
    if (!bad[t] || charts[triChart[t]].hidden) continue;
    const cand = new Set();
    for (let k = 0; k < 3; k++) { const u = nbr[t * 3 + k]; if (u >= 0 && !bad[u]) cand.add(triChart[u]); }
    for (const c of cand) {
      const C = charts[c];
      if (C.hidden || C.relay || C.wrapV || !orient[c] || !med[c]) continue;
      const vs = [0, 1, 2].map((k) => I[t * 3 + k]);
      const uv = vs.map((v) => { const ex = copy.get(ck(src[v], c)); if (ex !== undefined && ex < nv) return [mesh.uv[ex * 2], mesh.uv[ex * 2 + 1], mesh.depth?.[ex] ?? 0]; const e = extra.find((x) => x.s === src[v] && x.c === c); if (e) return e.uv; return projectUV(C, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]); });
      const R = C.rect;
      if (uv.some(([x, y]) => x < R[0] || x > R[2] || y < R[1] || y > R[3])) continue;
      const tuv = Float64Array.from(uv.flatMap((q) => [q[0], q[1]])), A3 = triArea3(P, I, t);
      const s = 0.5 * ((tuv[2] - tuv[0]) * (tuv[5] - tuv[1]) - (tuv[3] - tuv[1]) * (tuv[4] - tuv[0]));
      if (s * orient[c] <= 0 || !(A3 > 0)) continue;
      const r = Math.abs(s) / A3 / med[c];
      if (r < 0.25 || r > 4) continue;
      let free = true;
      const cells = [];
      rasterTri(tuv, [0, 1, 2], 0, size, (p) => { if (occ[p]) free = false; cells.push(p); });
      if (!free) continue;
      for (const p of cells) occ[p] = 1;
      // the corners: the chart's existing copies, or new vertices
      for (let k = 0; k < 3; k++) {
        const v = vs[k], key = ck(src[v], c);
        let w = copy.get(key);
        if (w === undefined) { w = nv + extra.length; extra.push({ from: v, s: src[v], c, uv: uv[k] }); copy.set(key, w); }
        I[t * 3 + k] = w;
      }
      triChart[t] = c; moved++;
      break;
    }
  }
  if (!moved) return { mesh, moved };
  const m = nv + extra.length, out = { ...mesh, indices: I, triChart };
  for (const k of ['position', 'normal', 'uv', 'chart', 'source', 'tangent', 'depth']) {
    const a = mesh[k];
    if (!a) continue;
    const c = a.length / nv, b = new a.constructor(m * c);
    b.set(a);
    extra.forEach((e, i) => { for (let q = 0; q < c; q++) b[(nv + i) * c + q] = a[e.from * c + q]; });
    out[k] = b;
  }
  extra.forEach((e, i) => { const w = nv + i; out.uv[w * 2] = e.uv[0]; out.uv[w * 2 + 1] = e.uv[1]; out.chart[w] = e.c; if (out.depth) out.depth[w] = e.uv[2]; });
  return { mesh: out, moved };
}

/**
 * Small groups of bad triangles (and small pieces of the patch) mended inside the chart round them, instead of cut out
 * to the patch as islands of their own: a group (edge-connected, not hidden, at most `maxTris`) and its neighbourhood
 * in a chart C its good neighbours have — `rings` vertex rings of C's good triangles round it — are laid again in C:
 * the vertices a good triangle of C outside the neighbourhood shares held where C has them; inside, by mean-value
 * weights (a Tutte-like embedding from the 3D angles, the ring and the seams with other charts held); failing that, by a
 * conformal map (LSCM) pinned to the held vertices, the seams free. Kept if every triangle of the neighbourhood then has
 * C's orientation, a texel stretch within `lo`–1/`lo` of C's median (a good one: no worse than half or twice its own),
 * its corners in C's rect and no texel another triangle covers; else the next ring count, the next chart, or the group
 * stays for the patch. In `rounds` (a group whose neighbours were bad may find a chart once they are mended). Returns
 * { mesh, moved (triangles taken from the patch or a bad layout), groups (mended) }.
 */
function relaxInChart(mesh, charts, bad, { rings = [2, 3, 4, 6], rounds = 3, maxTris = 60, maxRegion = 800, lo = 0.1, size = 2048 } = {}) {
  const { position: P, normal: N, indices: I0, source: src } = mesh, nt = I0.length / 3, nv = P.length / 3;
  const triChart = Int16Array.from(triCharts(mesh));
  const orient = chartOrientation(mesh, charts.length);
  const ratios = charts.map(() => []);
  for (let t = 0; t < nt; t++) { if (bad[t]) continue; const A = triArea3(P, I0, t); if (A > 0) ratios[triChart[t]].push(Math.abs(uvArea(mesh.uv, I0, t)) / A); }
  const med = ratios.map((r) => { if (!r.length) return 0; r.sort((a, b) => a - b); return r[r.length >> 1]; });
  // working copies (new vertex copies appended)
  const I = Uint32Array.from(I0), uv = Array.from(mesh.uv), chart = Array.from(mesh.chart), depth = mesh.depth ? Array.from(mesh.depth) : null, from = [];
  // (the patch's own triangles too: a small piece of it inside one chart goes back to that chart if it fits)
  const dead = Uint8Array.from(bad, (b, t) => ((b || charts[triChart[t]].relay) && !charts[triChart[t]].hidden ? 1 : 0));
  // texels covered by the good triangles (counts)
  const occ = new Uint16Array(size * size);
  const good = (t) => !dead[t] && !charts[triChart[t]].hidden && !charts[triChart[t]].relay;
  for (let t = 0; t < nt; t++) if (good(t)) rasterTri(uv, I, t, size, (p) => { occ[p]++; });
  // welded vertex → triangles
  const ws = Uint32Array.from(I0, (v) => src[v]);
  let nw = 0;
  for (let v = 0; v < nv; v++) if (src[v] + 1 > nw) nw = src[v] + 1;
  const start = new Uint32Array(nw + 1), anyV = new Int32Array(nw).fill(-1);
  for (let i = 0; i < I0.length; i++) anyV[ws[i]] = I0[i];
  for (const w of ws) start[w + 1]++;
  for (let w = 0; w < nw; w++) start[w + 1] += start[w];
  const fill = start.slice(0, nw), wt = new Uint32Array(ws.length);
  for (let i = 0; i < ws.length; i++) wt[fill[ws[i]]++] = (i / 3) | 0;
  const trisOf = (w) => wt.subarray(start[w], start[w + 1]);
  const nbr = triangleNeighbours(ws, nt);
  const copy = new Map(), ck = (s, c) => s * 64 + c;
  for (let v = 0; v < nv; v++) copy.set(ck(src[v], chart[v]), v);
  const posW = (w) => anyV[w];
  let moved = 0, mended = 0, why = {}, groups = [];
  const note = (k) => { why[k] = (why[k] ?? 0) + 1; }, stat = {};
  for (let round = 0; round < rounds; round++) {
    const before = mended;
    why = {};
    // the groups
    const seen = new Uint8Array(nt);
    groups = [];
    for (let t = 0; t < nt; t++) {
      if (!dead[t] || seen[t]) continue;
      const g = [t]; seen[t] = 1;
      for (let i = 0; i < g.length; i++) for (let k = 0; k < 3; k++) { const u = nbr[g[i] * 3 + k]; if (u >= 0 && dead[u] && !seen[u]) { seen[u] = 1; g.push(u); } }
      groups.push(g);
    }
    for (const g of groups) {
      if (g.length > maxTris) { note('big'); continue; }
      const inG = new Set(g);
      const tally = new Map();
      for (const t of g) for (let k = 0; k < 3; k++) { const u = nbr[t * 3 + k]; if (u >= 0 && !inG.has(u) && good(u)) tally.set(triChart[u], (tally.get(triChart[u]) ?? 0) + 1); }
      const cands = [...tally].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => !charts[c].wrapV && orient[c] && med[c]);
      let done = false, last = cands.length ? 'none' : 'noChart';
      for (const c of cands) {
        if (done) break;
        const C = charts[c];
        for (const nr of rings) {
          // the neighbourhood: the group and nr vertex rings of C's good triangles
          const inR = new Set(g);
          let front = new Set(g.flatMap((t) => [ws[t * 3], ws[t * 3 + 1], ws[t * 3 + 2]]));
          for (let r = 0; r < nr; r++) {
            const nf = new Set();
            for (const w of front) for (const u of trisOf(w)) if (!inR.has(u) && triChart[u] === c && good(u)) { inR.add(u); for (let k = 0; k < 3; k++) nf.add(ws[u * 3 + k]); }
            front = nf;
          }
          if (inR.size > maxRegion) break;
          const R = [...inR], Wset = new Set(R.flatMap((t) => [ws[t * 3], ws[t * 3 + 1], ws[t * 3 + 2]]));
          const W = [...Wset], idx = new Map(W.map((w, i) => [w, i]));
          const interior = W.map((w) => { for (const u of trisOf(w)) if (!inR.has(u)) return false; return true; });
          // (held: a vertex a good triangle of C outside the neighbourhood shares; the others may move — the seam's with
          // other charts too, in the conformal solve)
          const held = W.map((w) => { for (const u of trisOf(w)) if (!inR.has(u) && triChart[u] === c && good(u)) return true; return false; });
          if (!g.some((t) => [0, 1, 2].some((k) => !held[idx.get(ws[t * 3 + k])]))) { last = 'edge'; continue; }
          // C's UV of each vertex (its copy, or the projection), and its depth along C's rays
          const U0 = new Float64Array(W.length * 2), D = new Float64Array(W.length);
          let ok = true;
          W.forEach((w, i) => {
            const v = posW(w), ex = copy.get(ck(w, c));
            const q = projectUV(C, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]);
            if (ex !== undefined) { U0[i * 2] = uv[ex * 2]; U0[i * 2 + 1] = uv[ex * 2 + 1]; D[i] = held[i] && depth ? depth[ex] : q[2]; return; }
            if (!q.every(Number.isFinite)) ok = false;
            U0[i * 2] = q[0]; U0[i * 2 + 1] = q[1]; D[i] = q[2];
          });
          if (!ok) continue;
          // (what may move starts inside C's rect: a corner C maps past its rect's edge — across the body halves' midline
          // margin, in front of their start — is pulled onto it)
          const Rc = C.rect, e6 = 1e-6;
          W.forEach((w, i) => { if (held[i]) return; U0[i * 2] = Math.min(Rc[2] - e6, Math.max(Rc[0] + e6, U0[i * 2])); U0[i * 2 + 1] = Math.min(Rc[3] - e6, Math.max(Rc[1] + e6, U0[i * 2 + 1])); });
          const p3 = (w) => { const v = posW(w); return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; };
          const X3 = Float64Array.from(W.flatMap(p3)), LT = Uint32Array.from(R.flatMap((t) => [idx.get(ws[t * 3]), idx.get(ws[t * 3 + 1]), idx.get(ws[t * 3 + 2])]));
          for (const method of ['meanValue', 'conformal']) {
            let U;
            if (method === 'meanValue') {
              // the inner vertices by mean-value weights (3D: per triangle, the angle at each corner weighs its two edges),
              // Gauss–Seidel from C's map; the ring and the seam held
              if (!interior.some(Boolean)) continue;
              U = Float64Array.from(U0);
              const Wt = W.map(() => new Map());
              for (let r = 0; r < R.length; r++) {
                const q = [LT[r * 3], LT[r * 3 + 1], LT[r * 3 + 2]], x = q.map((i) => [X3[i * 3], X3[i * 3 + 1], X3[i * 3 + 2]]);
                for (let k = 0; k < 3; k++) {
                  const i = q[k];
                  if (!interior[i]) continue;
                  const a = sub(x[(k + 1) % 3], x[k]), b = sub(x[(k + 2) % 3], x[k]), la = Math.hypot(...a), lb = Math.hypot(...b);
                  if (!(la > 0 && lb > 0)) continue;
                  const tn = Math.tan(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb)))) / 2);
                  const j1 = q[(k + 1) % 3], j2 = q[(k + 2) % 3];
                  Wt[i].set(j1, (Wt[i].get(j1) ?? 0) + tn / la); Wt[i].set(j2, (Wt[i].get(j2) ?? 0) + tn / lb);
                }
              }
              for (let it = 0; it < 4000; it++) {
                let delta = 0;
                for (let i = 0; i < W.length; i++) {
                  if (!interior[i]) continue;
                  let sw = 0, su = 0, sv = 0;
                  for (const [j, w] of Wt[i]) { sw += w; su += w * U[j * 2]; sv += w * U[j * 2 + 1]; }
                  if (!(sw > 0)) continue;
                  const nu = su / sw, nv2 = sv / sw;
                  delta = Math.max(delta, Math.abs(nu - U[i * 2]), Math.abs(nv2 - U[i * 2 + 1]));
                  U[i * 2] = nu; U[i * 2 + 1] = nv2;
                }
                if (delta < 1e-9) break;
              }
            } else {
              // every vertex not held free in a conformal map (LSCM) pinned to the held ones
              U = lscmHeld(X3, LT, held, U0, orient[c] < 0);
              if (!U) continue;
            }
            // the checks: orientation, stretch, rect, free texels (the neighbourhood's own good texels set aside)
            const L = Float64Array.from({ length: R.length * 6 }, (_, j) => U[LT[((j / 2) | 0)] * 2 + (j % 2)]);
            const LI = Uint32Array.from({ length: R.length * 3 }, (_, j) => j);
            let pass = true;
            for (let r = 0; r < R.length && pass; r++) {
              const t = R[r], sA = uvArea(L, LI, r), A3 = triArea3(P, I0, t);
              if (!(A3 > 0) || sA * orient[c] <= 0) { pass = false; last = 'flip'; break; }
              // (the group's triangles within 1/10–10× of C's median texel stretch; the good ones round it no worse than
              // half or twice what they had, or than those bounds)
              const st = Math.abs(sA) / A3 / med[c], pre = dead[t] ? null : Math.abs(uvArea(uv, I, t)) / A3 / med[c];
              if (st < (pre === null ? lo : Math.min(lo, pre / 2)) || st > (pre === null ? 1 / lo : Math.max(1 / lo, pre * 2))) { pass = false; last = 'stretch'; }
              for (let k = 0; k < 3; k++) { const x = L[r * 6 + k * 2], y = L[r * 6 + k * 2 + 1]; if (x < C.rect[0] || x > C.rect[2] || y < C.rect[1] || y > C.rect[3]) { pass = false; last = 'rect'; } }
            }
            if (!pass) continue;
            for (const t of R) if (good(t)) rasterTri(uv, I, t, size, (p) => { occ[p]--; });
            const cells = [];
            for (let r = 0; r < R.length && pass; r++) rasterTri(L, LI, r, size, (p) => { if (occ[p]) pass = false; cells.push(p); });
            if (!pass) { last = 'overlap'; for (const t of R) if (good(t)) rasterTri(uv, I, t, size, (p) => { occ[p]++; }); continue; }
            for (const p of cells) occ[p]++;
            // commit: C's copy of each vertex (new where it has none), those not held moved
            W.forEach((w, i) => {
              let v = copy.get(ck(w, c));
              if (v === undefined) {
                v = chart.length;
                from.push(posW(w)); chart.push(c); uv.push(U[i * 2], U[i * 2 + 1]); if (depth) depth.push(D[i]);
                copy.set(ck(w, c), v);
              } else if (!held[i]) { uv[v * 2] = U[i * 2]; uv[v * 2 + 1] = U[i * 2 + 1]; if (depth) depth[v] = D[i]; }
            });
            for (const t of R) {
              for (let k = 0; k < 3; k++) I[t * 3 + k] = copy.get(ck(ws[t * 3 + k], c));
              if (dead[t]) { dead[t] = 0; moved++; }
              triChart[t] = c;
            }
            mended++;
            done = true;
            stat[method] = (stat[method] ?? 0) + 1;
            break;
          }
          if (done) break;
        }
      }
      if (!done) { note(last); if (process.env.RELAX_DEBUG === "2" && nt < 200000) { const c0 = [0, 1, 2].map((q) => P[I0[g[0] * 3] * 3 + q]); console.log(`  relax failed: ${last} n ${g.length} at ${c0.map((x) => x.toFixed(2)).join(",")} mm charts ${cands.map((c) => charts[c].name).join(",")} bad ${[...new Set(g.map((t) => bad[t]))].join(",")} from ${[...new Set(g.map((t) => charts[triChart[t]].name))].join(",")}`); } }
    }
    if (mended === before) break;
  }
  if (process.env.RELAX_DEBUG) console.log('relaxInChart', groups.length, 'groups; mended by', JSON.stringify(stat), 'not mended:', JSON.stringify(why));
  if (!mended) return { mesh, moved: 0, groups: 0 };
  const m = chart.length, out = { ...mesh, indices: I, triChart };
  for (const k of ['position', 'normal', 'source', 'tangent']) {
    const a = mesh[k];
    if (!a) continue;
    const cc = a.length / nv, b = new a.constructor(m * cc);
    b.set(a);
    from.forEach((f, i) => { for (let q = 0; q < cc; q++) b[(nv + i) * cc + q] = a[f * cc + q]; });
    out[k] = b;
  }
  out.uv = new mesh.uv.constructor(uv);
  out.chart = new mesh.chart.constructor(chart);
  if (depth) out.depth = new mesh.depth.constructor(depth);
  return { mesh: out, moved, groups: mended };
}

/**
 * A conformal map (LSCM's energy) of a small mesh with some vertices held: X3 (n·3 positions), LT (corner indices),
 * held (per vertex), U0 (n·2: the held vertices' UV and the others' first guess), mirror (the map reverses the
 * triangles' winding, as a chart seen from inside does: solved in u mirrored). Conjugate gradients on the normal
 * equations. Returns the n·2 UV, or null with fewer than two held vertices.
 */
function lscmHeld(X3, LT, held, U0, mirror) {
  const n = X3.length / 3, m = LT.length / 3, sg = mirror ? -1 : 1;
  let nh = 0;
  for (let v = 0; v < n; v++) if (held[v]) nh++;
  if (nh < 2) return null;
  const rows = [];
  for (let i = 0; i < m; i++) {
    const a = LT[i * 3], b = LT[i * 3 + 1], c = LT[i * 3 + 2];
    const p0 = [X3[a * 3], X3[a * 3 + 1], X3[a * 3 + 2]], p1 = [X3[b * 3], X3[b * 3 + 1], X3[b * 3 + 2]], p2 = [X3[c * 3], X3[c * 3 + 1], X3[c * 3 + 2]];
    const e1 = sub(p1, p0), e2 = sub(p2, p0), Nn = cross(e1, e2), A2 = Math.hypot(...Nn);
    if (!(A2 > 1e-14)) continue;
    const ex = norm(e1), ey = norm(cross(Nn, ex));
    const q = [[0, 0], [dot(e1, ex), 0], [dot(e2, ex), dot(e2, ey)]];
    const s = 1 / Math.sqrt(2 * A2), cs = [];
    for (let j = 0; j < 3; j++) { const p = q[(j + 1) % 3], r = q[(j + 2) % 3], e = [r[0] - p[0], r[1] - p[1]]; cs.push([e[0] * s, e[1] * s, -e[1] * s, e[0] * s]); }
    const vs = [a, b, c];
    rows.push(vs.map((v, j) => [v, cs[j][0], cs[j][2]]), vs.map((v, j) => [v, cs[j][1], cs[j][3]]));
  }
  const idx = new Int32Array(n).fill(-1);
  let nu = 0;
  for (let v = 0; v < n; v++) if (!held[v]) idx[v] = nu++;
  const pin = (v) => [sg * U0[v * 2], U0[v * 2 + 1]];
  const X = new Float64Array(nu * 2);
  for (let v = 0; v < n; v++) if (idx[v] >= 0) { X[idx[v] * 2] = sg * U0[v * 2]; X[idx[v] * 2 + 1] = U0[v * 2 + 1]; }
  const Ab = rows.map((row) => { let b = 0; for (const [v, cu, cv] of row) if (idx[v] < 0) { const pp = pin(v); b -= cu * pp[0] + cv * pp[1]; } return b; });
  const mulA = (x) => rows.map((row) => { let t = 0; for (const [v, cu, cv] of row) if (idx[v] >= 0) t += cu * x[idx[v] * 2] + cv * x[idx[v] * 2 + 1]; return t; });
  const mulAt = (y, out) => { out.fill(0); rows.forEach((row, r) => { for (const [v, cu, cv] of row) if (idx[v] >= 0) { out[idx[v] * 2] += cu * y[r]; out[idx[v] * 2 + 1] += cv * y[r]; } }); return out; };
  const Ax = mulA(X), res = Ab.map((b, r) => b - Ax[r]);
  const Rr = mulAt(res, new Float64Array(nu * 2)), Dd = Float64Array.from(Rr), T = new Float64Array(nu * 2);
  let rr = Rr.reduce((a, x) => a + x * x, 0);
  const rr0 = rr;
  for (let it = 0; it < 3000 && rr > 1e-24 * Math.max(1e-12, rr0); it++) {
    const AD = mulA(Dd), dAAd = AD.reduce((a, x) => a + x * x, 0);
    if (!(dAAd > 0)) break;
    const alpha = rr / dAAd;
    for (let i = 0; i < X.length; i++) X[i] += alpha * Dd[i];
    mulAt(AD, T);
    for (let i = 0; i < Rr.length; i++) Rr[i] -= alpha * T[i];
    const rr1 = Rr.reduce((a, x) => a + x * x, 0), beta = rr1 / rr;
    for (let i = 0; i < Dd.length; i++) Dd[i] = Rr[i] + beta * Dd[i];
    rr = rr1;
  }
  const U = Float64Array.from(U0);
  for (let v = 0; v < n; v++) if (idx[v] >= 0) { U[v * 2] = sg * X[idx[v] * 2]; U[v * 2 + 1] = X[idx[v] * 2 + 1]; }
  return U.every(Number.isFinite) ? U : null;
}

/** The mesh without the vertices no triangle uses (the patch's old copies after a relayout). */
function dropUnused(mesh, more = []) {
  const I = mesh.indices, nv = mesh.position.length / 3, remap = new Int32Array(nv).fill(-1);
  let m = 0;
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
  // welded vertices (chart copies of a vertex are one); the triangles' edge neighbours through them
  const src = mesh.source, key = (v) => src[v];
  const nbr = triangleNeighbours(Uint32Array.from(I, (v) => key(v)), nt);
  const hiddenT = (t) => charts[triChart[t]].hidden;
  const sel = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) if ((bad[t] && !hiddenT(t)) || triChart[t] === ci) sel[t] = 1;
  const count = () => sel.reduce((a, x) => a + x, 0), grownBy = [count()];
  // one ring of edge neighbours more round the triangles of `mask` (not already selected, not hidden)
  const growRing = (mask) => {
    const add = new Set();
    for (let t = 0; t < nt; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const u = nbr[t * 3 + k]; if (u >= 0 && !mask[u] && !sel[u] && !hiddenT(u)) add.add(u); }
    return [...add];
  };
  // islands within 2·close edge rings of each other merged (a closing: grown by `close` rings, then shrunk by as many
  // without giving up what was selected), then a margin of `ring` rings round each
  const close = o.close ?? 0;
  if (close > 0) {
    const orig = Uint8Array.from(sel), grown = Uint8Array.from(sel);
    for (let r = 0; r < close; r++) { const add = []; for (let t = 0; t < nt; t++) if (grown[t]) for (let k = 0; k < 3; k++) { const u = nbr[t * 3 + k]; if (u >= 0 && !grown[u] && !hiddenT(u)) add.push(u); } for (const u of add) grown[u] = 1; }
    const keep = Uint8Array.from(grown);
    for (let r = 0; r < close; r++) {
      const drop = [];
      for (let t = 0; t < nt; t++) if (keep[t] && !orig[t]) for (let k = 0; k < 3; k++) { const u = nbr[t * 3 + k]; if (u < 0 || !keep[u]) { drop.push(t); break; } }
      for (const t of drop) keep[t] = 0;
    }
    for (let t = 0; t < nt; t++) if (keep[t]) sel[t] = 1;
  }
  grownBy.push(count());
  for (let r = 0; r < (o.ring ?? 0); r++) for (const u of growRing(sel)) sel[u] = 1;
  grownBy.push(count());
  // islands: edge-connected components of the selection (through welded vertices); small ones grown until they are not
  const islandsOf = (mask) => {
    const parent = new Int32Array(nt).map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const edgeT = new Map();
    for (let t = 0; t < nt; t++) {
      if (!mask[t]) continue;
      for (let k = 0; k < 3; k++) {
        const a = key(I[t * 3 + k]), b = key(I[t * 3 + (k + 1) % 3]), e = a < b ? a * 4194304 + b : b * 4194304 + a;
        const u = edgeT.get(e);
        if (u === undefined) edgeT.set(e, t); else { const ra = find(u), rb = find(t); if (ra !== rb) parent[rb] = ra; }
      }
    }
    const groups = new Map();
    for (let t = 0; t < nt; t++) if (mask[t]) { const r = find(t); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(t); }
    return [...groups.values()];
  };
  let groups = islandsOf(sel);
  const minIsland = o.minIsland ?? 0;
  for (let pass = 0; pass < (o.maxGrow ?? 6) && minIsland > 0; pass++) {
    const small = groups.filter((g) => g.length < minIsland);
    if (!small.length) break;
    let grew = 0;
    for (const g of small) {
      const m = new Uint8Array(nt);
      for (const t of g) m[t] = 1;
      for (const u of growRing(m)) { sel[u] = 1; grew++; }
    }
    if (!grew) break;
    groups = islandsOf(sel);
  }
  grownBy.push(count());
  // each island flat (pieces in mm), then packed
  const pieces = [];
  for (const g of groups) {
    const n0 = pieces.length;
    flattenIsland(mesh, g, key, pieces, { last: o.last });
    if (process.env.FLAT_DEBUG === '2') { const pc = localPiece(P, I, g, key); console.log(`group nt ${nt} ${g.length} tris, loops ${pc.loops}, chi ${pc.chi} → ${pieces.length - n0} pieces (${pieces.slice(n0).map((p) => p.tris.length).join(' ')})`); }
  }
  const bins = charts[ci].rects ?? [charts[ci].rect];
  const dens = o.density ?? 0.0157; // atlas share per mm (0.0019 HL per texel at 2048)
  const pad = o.pad ?? 4 / 2048;
  for (const pc of pieces) orientPiece(pc);
  let scale = dens;
  for (let tries = 0; tries < 40; tries++) {
    if (shelfBins(pieces, scale, bins, pad)) break;
    scale *= 0.92;
  }
  // rebuild: each piece's welded vertices get new copies (one per welded vertex) with the packed UVs
  const arrays = ['position', 'normal', 'uv', 'chart', 'source', 'tangent', 'depth', ...(o.vertexArrays ?? [])].filter((k) => mesh[k]).map((k) => [k, mesh[k]]);
  let extra = 0;
  for (const pc of pieces) extra += pc.rep.length;
  const out = {};
  for (const [k, a] of arrays) { const c = a.length / nv, b = new a.constructor((nv + extra) * c); b.set(a); out[k] = b; }
  const indices = Uint32Array.from(I);
  const tc = Int16Array.from(triChart);
  let nx = nv;
  for (const pc of pieces) {
    const base = nx;
    pc.rep.forEach((v, j) => {
      const w = nx++;
      for (const [k, a] of arrays) { const c = a.length / nv; for (let q = 0; q < c; q++) out[k][w * c + q] = a[v * c + q]; }
      // (a piece turned 90°: (x, y) → (h − y, x), a rotation, so the winding keeps)
      const x = pc.rot ? pc.h - pc.uv[j * 2 + 1] : pc.uv[j * 2], y = pc.rot ? pc.uv[j * 2] : pc.uv[j * 2 + 1];
      out.uv[w * 2] = pc.ox + x * scale;
      out.uv[w * 2 + 1] = pc.oy + y * scale;
      out.chart[w] = ci;
    });
    for (let i = 0; i < pc.tris.length; i++) { const t = pc.tris[i]; for (let k = 0; k < 3; k++) indices[t * 3 + k] = base + pc.loc[i * 3 + k]; tc[t] = ci; }
  }
  const res = { ...mesh, ...out, indices, triChart: tc };
  return { mesh: res, grownBy, groups: groups.length, islands: pieces.length, singles: pieces.filter((p) => p.tris.length === 1).length, scale, triangles: pieces.reduce((a, p) => a + p.tris.length, 0) };
}

/**
 * One island laid flat, pushed to `pieces` as { tris, rep (a mesh vertex per local vertex), loc (local corner indices
 * per triangle), uv (mm, per local vertex), w, h }. A disc (one boundary loop) is mapped conformally (LSCM); a piece
 * that is no disc is first cut open into one (cutToDisc) and mapped the same way; a small one that folds, overlaps
 * itself or stretches its texels more than `stretch`× (p95 / p5) is unfolded triangle by triangle if that cuts it in
 * few pieces; else it is cut in two across its longest axis, each half laid again; a small region that still fails is
 * projected flat along its mean normal, split by normal cones (45°), or laid triangle by triangle. The single triangles
 * left are joined to a piece they share an edge with where they fit (attachSingles).
 */
function flattenIsland(mesh, tris, key, pieces, o = {}) {
  const P = mesh.position, I = mesh.indices;
  const lay = (ts, depth, out = pieces) => {
    const pc = localPiece(P, I, ts, key);
    const disc = pc.loops === 1 && pc.chi === 1;
    if (disc && ts.length > 1) { const l = lscm(pc); if (l && pieceOK(pc, l)) { out.push(finishPiece(pc, l)); return; } if (process.env.FLAT_DEBUG === "2") console.log("disc", ts.length, "lscm", pieceWhy(pc, l), "depth", depth); }
    // (no disc — a handle, a ring: cut open along the fewest edges into one, cutToDisc, and mapped the same way)
    if (!disc && ts.length > 2) {
      const cuts = cutToDisc(pc), laid = cuts ? cuts.map((c) => (c.tris.length > 1 ? lscm(c) : planarUV(c))) : null;
      if (process.env.FLAT_DEBUG === '2') console.log('cut', ts.length, 'loops', pc.loops, 'chi', pc.chi, cuts ? cuts.map((c, i) => `${c.tris.length}:${pieceWhy(c, laid[i])}`).join(' ') : 'none');
      if (cuts && cuts.length <= Math.max(1, ts.length / 12) && cuts.every((c, i) => laid[i] && pieceOK(c, laid[i]))) { cuts.forEach((c, i) => out.push(finishPiece(c, laid[i]))); return; }
    }
    // (a small piece that is no disc, or folds: unfolded, cut where its corners would meet again)
    // (if that leaves single triangles, the halves below are tried too and the layout with fewer singles kept)
    if (ts.length > 1 && ts.length <= 80) {
      const uf = unfoldGreedy(pc);
      if (uf.length <= Math.max(2, ts.length / 12)) {
        const ones = uf.filter((u) => u.pc.tris.length === 1).length;
        if (ones && ts.length >= 8 && depth < 12) {
          const halves = bisect(P, I, ts), alt = [];
          if (halves.length > 1) {
            for (const h of halves) for (const c of connectedParts(I, h, key)) lay(c, depth + 1, alt);
            if (alt.filter((q) => q.tris.length === 1).length < ones) { out.push(...alt); return; }
          }
        }
        for (const u of uf) out.push(finishPiece(u.pc, u.uv));
        return;
      }
    }
    // (no disc — a ring round a globe's cap, an annulus round the arm — or one that folds: cut in two across its longest
    // axis, each half's connected parts laid again; a compact piece stays compact)
    if (ts.length >= 8 && depth < 12) {
      const halves = bisect(P, I, ts);
      if (halves.length > 1) { for (const h of halves) for (const c of connectedParts(I, h, key)) lay(c, depth + 1, out); return; }
    }
    // (small: flat along its mean normal, else by normal cones, else triangle by triangle)
    const pl = planarUV(pc);
    if (pieceOK(pc, pl)) { out.push(finishPiece(pc, pl)); return; }
    if (ts.length > 1 && depth < 16) {
      const segs = segmentByNormal(P, I, ts, key, 45);
      if (segs.length > 1) { for (const s of segs) for (const c of connectedParts(I, s, key)) lay(c, depth + 4, out); return; }
    }
    // (last: the triangles unfolded one by one across their shared edges, isometric and never reversed; then singles)
    if (ts.length > 1) { for (const u of unfoldGreedy(pc)) out.push(finishPiece(u.pc, u.uv)); return; }
    if (process.env.FLAT_DEBUG && ts.length > 1) console.log('singles from', ts.length, 'tris, disc', disc, 'loops', pc.loops, 'chi', pc.chi, 'planar', pieceWhy(pc, pl), 'lscm', disc ? pieceWhy(pc, lscm(pc)) : '-', 'depth', depth);
    for (const t of ts) { const p1 = localPiece(P, I, [t], key); out.push(finishPiece(p1, planarUV(p1))); }
  };
  const n0 = pieces.length;
  lay(tris, 0);
  attachSingles(P, I, key, pieces, n0);
}

/**
 * The single triangles an island's layout left (pieces[n0..]) joined to a piece of the same island they share an edge
 * with: on the corners that piece already has when the triangle then keeps its winding, a texel stretch within 1/4–4×
 * of the piece's and no texel of the piece under it (a notch filled); else across one shared edge, its third corner a
 * new vertex placed from its 3D edge lengths on the far side (the same checks). A single that fits nowhere stays.
 */
function attachSingles(P, I, key, pieces, n0) {
  const own = pieces.slice(n0);
  if (own.length < 2) return;
  const singles = own.filter((p) => p.tris.length === 1), others = own.filter((p) => p.tris.length > 1);
  if (!singles.length || !others.length) return;
  const dropped = new Set();
  for (const sp of singles) {
    const t = sp.tris[0], ks = [0, 1, 2].map((k) => key(I[t * 3 + k])), x3 = [0, 1, 2].map((k) => { const v = I[t * 3 + k]; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; });
    const a3 = 0.5 * Math.hypot(...cross(sub(x3[1], x3[0]), sub(x3[2], x3[0])));
    if (!(a3 > 0)) continue;
    for (const pc of others) {
      const at = new Map(pc.rep.map((v, j) => [key(v), j]));
      const has = ks.map((k) => at.get(k));
      const nHas = has.filter((j) => j !== undefined).length;
      if (nHas < 2) continue;
      // the piece's scale (UV area per 3D area)
      let A3 = 0, AU = 0;
      for (let i = 0; i < pc.tris.length; i++) {
        const tt = pc.tris[i], q = [0, 1, 2].map((k) => { const v = I[tt * 3 + k]; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; });
        A3 += 0.5 * Math.hypot(...cross(sub(q[1], q[0]), sub(q[2], q[0]))); AU += Math.abs(areaUV(pc.uv, pc.loc, i));
      }
      const k0 = AU / (A3 || 1);
      const tryUV = (uvs, newV) => {
        const sA = 0.5 * ((uvs[1][0] - uvs[0][0]) * (uvs[2][1] - uvs[0][1]) - (uvs[1][1] - uvs[0][1]) * (uvs[2][0] - uvs[0][0]));
        if (!(sA > 0)) return false;
        const r = sA / a3 / k0;
        if (r < 0.25 || r > 4) return false;
        // no texel of the piece under it (the piece rasterised on a grid round the triangle)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of uvs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const span = Math.max(x1 - x0, y1 - y0) * 3, R = 64, ox = (x0 + x1) / 2 - span / 2, oy = (y0 + y1) / 2 - span / 2;
        const toG = (x, y) => [(x - ox) / span, (y - oy) / span];
        const cnt = new Uint8Array(R * R), tuv = new Float64Array(6), I3 = [0, 1, 2];
        for (let i = 0; i < pc.loc.length / 3; i++) {
          for (let k = 0; k < 3; k++) { const g = toG(pc.uv[pc.loc[i * 3 + k] * 2], pc.uv[pc.loc[i * 3 + k] * 2 + 1]); tuv[k * 2] = g[0]; tuv[k * 2 + 1] = g[1]; }
          rasterTri(tuv, I3, 0, R, (p) => { cnt[p] = 1; });
        }
        for (let k = 0; k < 3; k++) { const g = toG(uvs[k][0], uvs[k][1]); tuv[k * 2] = g[0]; tuv[k * 2 + 1] = g[1]; }
        let over = 0;
        rasterTri(tuv, I3, 0, R, (p) => { if (cnt[p]) over++; });
        if (over) return false;
        // joined: the triangle's corners (a new local vertex for the placed one)
        const loc = [];
        for (let k = 0; k < 3; k++) {
          if (newV === k) { const j = pc.rep.length; pc.rep.push(I[t * 3 + k]); pc.uv = Float64Array.from([...pc.uv, uvs[k][0], uvs[k][1]]); loc.push(j); } else loc.push(has[k]);
        }
        pc.tris = [...pc.tris, t]; pc.loc = Int32Array.from([...pc.loc, ...loc]);
        return true;
      };
      let done = false;
      if (nHas === 3) done = tryUV(has.map((j) => [pc.uv[j * 2], pc.uv[j * 2 + 1]]), -1);
      // (across each shared edge: the third corner placed isometrically, on the far side from the piece's triangle on it)
      for (let k = 0; k < 3 && !done; k++) {
        const a = k, b = (k + 1) % 3, c = (k + 2) % 3;
        if (has[a] === undefined || has[b] === undefined) continue;
        const ua = [pc.uv[has[a] * 2], pc.uv[has[a] * 2 + 1]], ub = [pc.uv[has[b] * 2], pc.uv[has[b] * 2 + 1]];
        const e = [ub[0] - ua[0], ub[1] - ua[1]], le = Math.hypot(...e);
        const la = Math.hypot(...sub(x3[c], x3[a])), lb3 = Math.hypot(...sub(x3[b], x3[a])), sc = le / (lb3 || 1);
        if (!(le > 0)) continue;
        // (in the piece's scale: c from a along the edge by the 3D angle at a, to the left of a → b: the winding kept)
        const cosA = dot(sub(x3[b], x3[a]), sub(x3[c], x3[a])) / ((lb3 || 1) * (la || 1)), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const d = [e[0] / le, e[1] / le], nrm = [-d[1], d[0]], L = la * sc;
        const uc = [ua[0] + L * (cosA * d[0] + sinA * nrm[0]), ua[1] + L * (cosA * d[1] + sinA * nrm[1])];
        const uvs = [];
        uvs[a] = ua; uvs[b] = ub; uvs[c] = uc;
        done = tryUV(uvs, c);
      }
      // (else the piece laid again with it: a conformal map of the two together, cut open into a disc where they are
      // none, kept if it passes as a piece of its own would)
      if (!done) {
        const both = localPiece(P, I, [...pc.tris, t], key);
        const discs = both.loops === 1 && both.chi === 1 ? [both] : cutToDisc(both);
        if (discs && discs.length === 1) {
          const l = lscm(discs[0]);
          if (l && pieceOK(discs[0], l)) { const f = finishPiece(discs[0], l); pc.tris = f.tris; pc.rep = f.rep; pc.loc = f.loc; pc.uv = f.uv; done = true; }
          if (process.env.FLAT_DEBUG === '2' && !done) console.log('attach re-lay', pc.tris.length + 1, 'tris:', pieceWhy(discs[0], l));
        } else if (process.env.FLAT_DEBUG === '2') console.log('attach re-lay: loops', both.loops, 'chi', both.chi, 'discs', discs ? discs.length : 'none');
      }
      if (done) { dropped.add(sp); break; }
    }
  }
  if (!dropped.size) return;
  const keep = pieces.slice(0, n0).concat(own.filter((p) => !dropped.has(p)));
  pieces.length = 0;
  pieces.push(...keep);
}

/**
 * A local piece that is no disc (a handle, a ring, a border that touches itself) cut open into one: a spanning tree of
 * its triangles across their shared edges (an edge is shared when exactly two triangles run along it in opposite
 * directions; any other — three triangles on it, or two wound against each other — is a border), the shared edges it
 * does not cross the cut, pruned back to the loops (and their paths to the border); then each vertex split into one
 * copy per fan of corners the cut and the border separate; the parts joined only at corners or across a border edge
 * each cut on their own. Returns the discs [{ tris, rep (with repeats), loc, pos }], or null where one is still no disc.
 */
function cutToDisc(pc) {
  const { tris, loc } = pc, m = tris.length, ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  // (the parts joined by shared edges — two triangles along an edge in opposite directions — each cut on its own)
  const E = new Map();
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) {
    const a = loc[i * 3 + k], b = loc[i * 3 + (k + 1) % 3], key = ek(a, b);
    if (!E.has(key)) E.set(key, []);
    E.get(key).push([i, a < b ? 1 : 0]);
  }
  const comp = new Int32Array(m).fill(-1), parts = [];
  for (let i0 = 0; i0 < m; i0++) {
    if (comp[i0] >= 0) continue;
    const q = [i0];
    comp[i0] = parts.length;
    for (let h = 0; h < q.length; h++) for (let k = 0; k < 3; k++) {
      const i = q[h], l = E.get(ek(loc[i * 3 + k], loc[i * 3 + (k + 1) % 3]));
      if (l.length !== 2 || l[0][1] === l[1][1]) continue;
      const j = l[0][0] === i ? l[1][0] : l[0][0];
      if (comp[j] < 0) { comp[j] = parts.length; q.push(j); }
    }
    parts.push(q);
  }
  const out = [];
  for (const q of parts) {
    const sub = q.length === m ? pc : subPiece(pc, q);
    const d = cutOne(sub);
    if (!d) return null;
    out.push(d);
  }
  return out;
}

/** The local piece of some of a piece's triangles (local indices `q`), its vertices renumbered. */
function subPiece(pc, q) {
  const id = new Map(), rep = [], pos = [], loc = new Int32Array(q.length * 3);
  q.forEach((i, r) => {
    for (let k = 0; k < 3; k++) {
      const v = pc.loc[i * 3 + k];
      let j = id.get(v);
      if (j === undefined) { j = rep.length; id.set(v, j); rep.push(pc.rep[v]); pos.push(pc.pos[v * 3], pc.pos[v * 3 + 1], pc.pos[v * 3 + 2]); }
      loc[r * 3 + k] = j;
    }
  });
  return { tris: q.map((i) => pc.tris[i]), rep, loc, pos: Float64Array.from(pos) };
}

function cutOne(pc) {
  const { tris, rep, loc, pos } = pc, m = tris.length, n = rep.length, ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  const E = new Map();
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) {
    const a = loc[i * 3 + k], b = loc[i * 3 + (k + 1) % 3], key = ek(a, b);
    if (!E.has(key)) E.set(key, []);
    E.get(key).push([i, a < b ? 1 : 0]);
  }
  const shared = (l) => l.length === 2 && l[0][1] !== l[1][1];
  // the dual spanning tree
  const inTree = new Set(), seen = new Uint8Array(m), q = [0];
  seen[0] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (let k = 0; k < 3; k++) {
      const key = ek(loc[i * 3 + k], loc[i * 3 + (k + 1) % 3]), l = E.get(key);
      if (!shared(l)) continue;
      const j = l[0][0] === i ? l[1][0] : l[0][0];
      if (!seen[j]) { seen[j] = 1; inTree.add(key); q.push(j); }
    }
  }
  if (q.length !== m) return null;
  // the cut: shared edges the tree does not cross, pruned where they dangle (the border never pruned)
  const cut = new Set(), deg = new Int32Array(n), border = new Uint8Array(n);
  for (const [key, l] of E) {
    const a = Math.floor(key / 1048576), b = key % 1048576;
    if (!shared(l)) { border[a] = border[b] = 1; deg[a]++; deg[b]++; continue; }
    if (!inTree.has(key)) { cut.add(key); deg[a]++; deg[b]++; }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const key of cut) {
      const a = Math.floor(key / 1048576), b = key % 1048576;
      if ((deg[a] === 1 && !border[a]) || (deg[b] === 1 && !border[b])) { cut.delete(key); deg[a]--; deg[b]--; changed = true; }
    }
  }
  // each vertex's corners joined across the shared edges not cut; one copy per class
  const par = new Int32Array(m * 3).map((_, x) => x), f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const cornerOf = (i, v) => { for (let k = 0; k < 3; k++) if (loc[i * 3 + k] === v) return i * 3 + k; return -1; };
  for (const [key, l] of E) {
    if (!shared(l) || cut.has(key)) continue;
    const a = Math.floor(key / 1048576), b = key % 1048576;
    for (const v of [a, b]) { const x = f(cornerOf(l[0][0], v)), y = f(cornerOf(l[1][0], v)); if (x !== y) par[y] = x; }
  }
  const rep2 = [], pos2 = [], loc2 = new Int32Array(m * 3), cls = new Map();
  for (let c = 0; c < m * 3; c++) {
    const r = f(c), v = loc[c];
    let j2 = cls.get(r);
    if (j2 === undefined) { j2 = rep2.length; cls.set(r, j2); rep2.push(rep[v]); pos2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
    loc2[c] = j2;
  }
  // (a disc now: one border loop, Euler characteristic 1, every edge shared by opposite windings or on the border)
  const D = new Set();
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) D.add(loc2[i * 3 + k] * 1048576 + loc2[i * 3 + (k + 1) % 3]);
  let edges = 0;
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) edges += D.has(loc2[i * 3 + (k + 1) % 3] * 1048576 + loc2[i * 3 + k]) ? 1 : 2;
  if (rep2.length - edges / 2 + m !== 1) return null;
  return { tris, rep: rep2, loc: loc2, pos: Float64Array.from(pos2), loops: 1, chi: 1 };
}

/**
 * A local piece unfolded into the plane, greedily: the largest triangle not yet laid in its own plane, then breadth
 * first each triangle across an edge it shares with one already laid in this piece, its third corner placed from its
 * 3D edge lengths on the far side of that edge (isometric, never reversed) — unless it would overlap a triangle of the
 * piece, then it waits for a later piece. A corner reached again by another path at another place gets its own copy,
 * so a piece is cut there. Returns [{ pc (local: tris, rep, loc, pos), uv }] covering every triangle.
 */
function unfoldGreedy(pc) {
  const { pos, loc, tris } = pc, m = tris.length;
  const P3 = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const len = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
  const em = new Map(), ek = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let i = 0; i < m; i++) for (let k = 0; k < 3; k++) { const q = ek(loc[i * 3 + k], loc[i * 3 + (k + 1) % 3]); if (!em.has(q)) em.set(q, []); em.get(q).push(i); }
  const area = Array.from({ length: m }, (_, i) => area3L(pos, loc, i));
  const done = new Uint8Array(m), out = [];
  // (two laid triangles overlap: no separating axis among their edges' normals, with a little slack)
  const overlap = (A, B) => {
    const sc = Math.max(Math.abs(A[1][0] - A[0][0]), Math.abs(A[1][1] - A[0][1]), 1e-9) * 1e-4;
    for (const T of [A, B]) for (let k = 0; k < 3; k++) {
      const p = T[k], q = T[(k + 1) % 3], nx = -(q[1] - p[1]), ny = q[0] - p[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const r of A) { const d = r[0] * nx + r[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const r of B) { const d = r[0] * nx + r[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      const l = Math.hypot(nx, ny) || 1;
      if (a1 <= b0 + sc * l || b1 <= a0 + sc * l) return false;
    }
    return true;
  };
  while (true) {
    let seed = -1, ba = -1;
    for (let i = 0; i < m; i++) if (!done[i] && area[i] > ba) { ba = area[i]; seed = i; }
    if (seed < 0) break;
    const at = new Map();
    {
      const [a, b, c] = [loc[seed * 3], loc[seed * 3 + 1], loc[seed * 3 + 2]];
      const e1 = sub(P3(b), P3(a)), e2 = sub(P3(c), P3(a)), N = cross(e1, e2), ex = norm(e1), ey = norm(cross(N, ex));
      at.set(seed, [[0, 0], [dot(e1, ex), 0], [dot(e2, ex), dot(e2, ey)]]);
      done[seed] = 1;
    }
    const queue = [seed];
    while (queue.length) {
      const i = queue.shift(), Ti = at.get(i);
      for (let k = 0; k < 3; k++) {
        const a = loc[i * 3 + k], b = loc[i * 3 + (k + 1) % 3];
        for (const j of em.get(ek(a, b))) {
          if (done[j]) continue;
          const ka = [0, 1, 2].find((q) => loc[j * 3 + q] === a), kb = [0, 1, 2].find((q) => loc[j * 3 + q] === b);
          if (ka === undefined || kb === undefined) continue;
          const kc = 3 - ka - kb, A = Ti[k], B = Ti[(k + 1) % 3], c = loc[j * 3 + kc];
          const ab = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (!(ab > 0)) continue;
          const la = len(a, c), lb = len(b, c), x = (la * la - lb * lb + ab * ab) / (2 * ab), h = Math.sqrt(Math.max(0, la * la - x * x));
          const ux = [(B[0] - A[0]) / ab, (B[1] - A[1]) / ab], uy = [-ux[1], ux[0]];
          const Ci = Ti[(k + 2) % 3], side = (Ci[0] - A[0]) * uy[0] + (Ci[1] - A[1]) * uy[1] > 0 ? -1 : 1;
          const C = [A[0] + ux[0] * x + uy[0] * h * side, A[1] + ux[1] * x + uy[1] * h * side];
          const tri = [];
          tri[ka] = A; tri[kb] = B; tri[kc] = C;
          // (a triangle wound against its neighbour would come out reversed: it waits for a piece of its own)
          if ((tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]) <= 0 && h > 0) continue;
          let clash = false;
          for (const [q, Tq] of at) if (q !== i && overlap(tri, Tq)) { clash = true; break; }
          if (clash) continue;
          at.set(j, tri); done[j] = 1; queue.push(j);
        }
      }
    }
    // the piece's local vertices: one per (vertex, place)
    const ids = [...at.keys()], rep = [], loc2 = new Int32Array(ids.length * 3), uvl = [], copies = new Map(), pv = [];
    ids.forEach((i, n) => {
      for (let k = 0; k < 3; k++) {
        const v = loc[i * 3 + k], p = at.get(i)[k];
        let list = copies.get(v);
        if (!list) copies.set(v, (list = []));
        let j = list.find((q) => Math.hypot(uvl[q * 2] - p[0], uvl[q * 2 + 1] - p[1]) < 1e-6 * (1 + Math.abs(p[0]) + Math.abs(p[1])));
        if (j === undefined) { j = rep.length; rep.push(pc.rep[v]); uvl.push(p[0], p[1]); list.push(j); pv.push(v); }
        loc2[n * 3 + k] = j;
      }
    });
    const pos2 = new Float64Array(rep.length * 3);
    pv.forEach((v, j) => { pos2[j * 3] = pos[v * 3]; pos2[j * 3 + 1] = pos[v * 3 + 1]; pos2[j * 3 + 2] = pos[v * 3 + 2]; });
    out.push({ pc: { tris: ids.map((i) => tris[i]), rep, loc: loc2, pos: pos2 }, uv: Float64Array.from(uvl) });
  }
  return out;
}

/** Triangles split by the plane through their centroid normal to their longest principal axis (two halves). */
function bisect(P, I, tris) {
  const c = tris.map((t) => [0, 1, 2].map((q) => (P[I[t * 3] * 3 + q] + P[I[t * 3 + 1] * 3 + q] + P[I[t * 3 + 2] * 3 + q]) / 3));
  const m = [0, 1, 2].map((q) => c.reduce((a, x) => a + x[q], 0) / c.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const x of c) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (x[i] - m[i]) * (x[j] - m[j]);
  // (the principal axis by power iteration)
  let v = [1, 0.7, 0.3];
  for (let it = 0; it < 40; it++) { const w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]); const l = Math.hypot(...w) || 1; v = w.map((x) => x / l); }
  const d = c.map((x) => (x[0] - m[0]) * v[0] + (x[1] - m[1]) * v[1] + (x[2] - m[2]) * v[2]);
  const sorted = Float64Array.from(d).sort(), med = sorted[sorted.length >> 1];
  const a = [], b = [];
  tris.forEach((t, i) => (d[i] < med ? a : b).push(t));
  return [a, b].filter((h) => h.length);
}

/** Edge-connected parts of a set of triangles (through welded vertices). */
function connectedParts(I, tris, key) {
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
}

/** A set of triangles with its vertices welded by `key`: { tris, rep, loc, pos (Float64 n·3), nrm (per triangle),
 * loops (boundary loops), chi }. */
function localPiece(P, I, tris, key) {
  const id = new Map(), rep = [], loc = new Int32Array(tris.length * 3);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k], kk = key(v);
      let j = id.get(kk);
      if (j === undefined) { j = rep.length; id.set(kk, j); rep.push(v); }
      loc[i * 3 + k] = j;
    }
  });
  const n = rep.length, pos = new Float64Array(n * 3);
  rep.forEach((v, j) => { pos[j * 3] = P[v * 3]; pos[j * 3 + 1] = P[v * 3 + 1]; pos[j * 3 + 2] = P[v * 3 + 2]; });
  // boundary: directed edges without a twin
  const E = new Map(), ek = (a, b) => a * 1048576 + b;
  for (let i = 0; i < tris.length; i++) for (let k = 0; k < 3; k++) E.set(ek(loc[i * 3 + k], loc[i * 3 + (k + 1) % 3]), 1);
  const next = new Map();
  let edges = 0;
  for (let i = 0; i < tris.length; i++) for (let k = 0; k < 3; k++) {
    const a = loc[i * 3 + k], b = loc[i * 3 + (k + 1) % 3];
    if (!E.has(ek(b, a))) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); edges += 2; } else edges += 1;
  }
  let loops = 0;
  const seen = new Set();
  for (const [a0, outs] of next) for (const b0 of outs) {
    if (seen.has(ek(a0, b0))) continue;
    loops++;
    let a = a0, b = b0, guard = 0;
    seen.add(ek(a, b));
    while (b !== a0 && guard++ < 1e6) { const c = (next.get(b) ?? []).find((x) => !seen.has(ek(b, x))); if (c === undefined) break; a = b; b = c; seen.add(ek(a, b)); }
  }
  const chi = n - edges / 2 + tris.length;
  return { tris, rep, loc, pos, loops, chi };
}

/** Least-squares conformal map of a local piece (two pinned vertices far apart): uv (Float64, n·2, mm scale) or null. */
function lscm(pc) {
  const { pos, loc, tris } = pc, n = pos.length / 3, m = tris.length;
  // the rows: per triangle two, over (u_j, v_j) of its three corners, in the triangle's own plane
  const rows = [];
  for (let i = 0; i < m; i++) {
    const a = loc[i * 3], b = loc[i * 3 + 1], c = loc[i * 3 + 2];
    const p0 = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], p1 = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], p2 = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const e1 = sub(p1, p0), e2 = sub(p2, p0), N = cross(e1, e2), A2 = Math.hypot(...N);
    if (!(A2 > 1e-14)) continue;
    const ex = norm(e1), ey = norm(cross(N, ex));
    const q = [[0, 0], [dot(e1, ex), 0], [dot(e2, ex), dot(e2, ey)]];
    const s = 1 / Math.sqrt(2 * A2); // 1 / (2 √A), A = A2 / 2
    const cs = [];
    for (let j = 0; j < 3; j++) {
      const p = q[(j + 1) % 3], r = q[(j + 2) % 3], e = [r[0] - p[0], r[1] - p[1]];
      cs.push([e[0] * s, e[1] * s, -e[1] * s, e[0] * s]); // u: e, v: R90 e = (−e_y, e_x)
    }
    const vs = [a, b, c];
    rows.push(vs.map((v, j) => [v, cs[j][0], cs[j][2]]), vs.map((v, j) => [v, cs[j][1], cs[j][3]]));
  }
  if (!rows.length) return null;
  // pins: the vertex farthest from vertex 0, and the one farthest from it
  const far = (from) => { let best = 0, bd = -1; for (let v = 0; v < n; v++) { const d = (pos[v * 3] - pos[from * 3]) ** 2 + (pos[v * 3 + 1] - pos[from * 3 + 1]) ** 2 + (pos[v * 3 + 2] - pos[from * 3 + 2]) ** 2; if (d > bd) { bd = d; best = v; } } return [best, Math.sqrt(bd)]; };
  const [p0] = far(0), [p1, L] = far(p0);
  if (!(L > 0)) return null;
  const pinned = new Map([[p0, [0, 0]], [p1, [L, 0]]]);
  // unknowns: u, v of every unpinned vertex
  const idx = new Int32Array(n).fill(-1);
  let nu = 0;
  for (let v = 0; v < n; v++) if (!pinned.has(v)) idx[v] = nu++;
  const X = new Float64Array(nu * 2);
  // initial guess: a planar projection (fast convergence)
  const pl = planarUV(pc);
  for (let v = 0; v < n; v++) if (idx[v] >= 0) { X[idx[v] * 2] = pl[v * 2]; X[idx[v] * 2 + 1] = pl[v * 2 + 1]; }
  // A x = b with the pins moved to b; solve AᵀA x = Aᵀb by conjugate gradients
  const Ab = rows.map((row) => { let b = 0; for (const [v, cu, cv] of row) if (idx[v] < 0) { const pp = pinned.get(v); b -= cu * pp[0] + cv * pp[1]; } return b; });
  const mulA = (x) => rows.map((row) => { let s = 0; for (const [v, cu, cv] of row) if (idx[v] >= 0) s += cu * x[idx[v] * 2] + cv * x[idx[v] * 2 + 1]; return s; });
  const mulAt = (y, out) => { out.fill(0); rows.forEach((row, r) => { for (const [v, cu, cv] of row) if (idx[v] >= 0) { out[idx[v] * 2] += cu * y[r]; out[idx[v] * 2 + 1] += cv * y[r]; } }); return out; };
  const Ax = mulA(X), res = Ab.map((b, r) => b - Ax[r]);
  const R = mulAt(res, new Float64Array(nu * 2)), D = Float64Array.from(R), T = new Float64Array(nu * 2);
  let rr = R.reduce((a, x) => a + x * x, 0);
  const rr0 = rr;
  for (let it = 0; it < Math.max(200, 4 * Math.sqrt(nu) * 10) && rr > 1e-20 * Math.max(1, rr0); it++) {
    const AD = mulA(D);
    const dAAd = AD.reduce((a, x) => a + x * x, 0);
    if (!(dAAd > 0)) break;
    const alpha = rr / dAAd;
    for (let i = 0; i < X.length; i++) X[i] += alpha * D[i];
    mulAt(AD, T);
    for (let i = 0; i < R.length; i++) R[i] -= alpha * T[i];
    const rr1 = R.reduce((a, x) => a + x * x, 0);
    const beta = rr1 / rr;
    for (let i = 0; i < D.length; i++) D[i] = R[i] + beta * D[i];
    rr = rr1;
  }
  const uv = new Float64Array(n * 2);
  for (let v = 0; v < n; v++) {
    if (idx[v] >= 0) { uv[v * 2] = X[idx[v] * 2]; uv[v * 2 + 1] = X[idx[v] * 2 + 1]; } else { const pp = pinned.get(v); uv[v * 2] = pp[0]; uv[v * 2 + 1] = pp[1]; }
  }
  // scaled to the piece's 3D area (mm)
  let a3 = 0, au = 0;
  for (let i = 0; i < tris.length; i++) { a3 += area3L(pos, loc, i); au += areaUV(uv, loc, i); }
  if (!(au > 0)) return null;
  const k = Math.sqrt(a3 / au);
  for (let i = 0; i < uv.length; i++) uv[i] *= k;
  return uv;
}

/** A local piece flat along its area-weighted mean normal (mm, (e0, e1, N) right-handed). */
function planarUV(pc) {
  const { pos, loc, tris } = pc, n = pos.length / 3, N = [0, 0, 0];
  for (let i = 0; i < tris.length; i++) { const f = triN(pos, loc, i); N[0] += f[0]; N[1] += f[1]; N[2] += f[2]; }
  let Nn = norm(N);
  if (!(Math.hypot(...N) > 0)) Nn = [0, 0, 1];
  const t0 = Math.abs(Nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e0 = norm(sub(t0, scale(Nn, dot(t0, Nn)))), e1 = cross(Nn, e0);
  const uv = new Float64Array(n * 2);
  for (let v = 0; v < n; v++) { const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]; uv[v * 2] = dot(p, e0); uv[v * 2 + 1] = dot(p, e1); }
  return uv;
}

/** A layout acceptable: no triangle reversed or collapsed, no texel covered twice, texel stretch p95 / p5 ≤ 3. */
function pieceOK(pc, uv, o = {}) { const w = pieceWhy(pc, uv, o); FLAT[w] = (FLAT[w] ?? 0) + 1; return w === 'ok'; }
const FLAT = {};
function pieceWhy(pc, uv, { stretch = 3 } = {}) {
  if (!uv) return 'none';
  const { pos, loc, tris } = pc, m = tris.length, sc = [];
  let a3t = 0, aut = 0;
  for (let i = 0; i < m; i++) { a3t += area3L(pos, loc, i); aut += Math.abs(areaUV(uv, loc, i)); }
  const med = aut / (a3t || 1);
  for (let i = 0; i < m; i++) {
    const s = areaUV(uv, loc, i), a3 = area3L(pos, loc, i);
    if (a3 <= 0) continue;
    if (s <= 0) return 'flip';
    if (s / a3 < 0.02 * med) return 'collapse';
    sc.push([Math.sqrt(s / a3), a3]);
  }
  if (sc.length > 8) {
    sc.sort((a, b) => a[0] - b[0]);
    const tot = sc.reduce((a, x) => a + x[1], 0), pct = (q) => { let acc = 0; for (const x of sc) { acc += x[1]; if (acc >= q * tot) return x[0]; } return sc[sc.length - 1][0]; };
    if (pct(0.95) / pct(0.05) > stretch) return 'stretch';
  }
  if (m < 3) return 'ok';
  // self-overlap: the piece rasterised over its bounding box (half-open edges: shared edges claim nothing twice)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let v = 0; v < uv.length / 2; v++) { x0 = Math.min(x0, uv[v * 2]); x1 = Math.max(x1, uv[v * 2]); y0 = Math.min(y0, uv[v * 2 + 1]); y1 = Math.max(y1, uv[v * 2 + 1]); }
  const R = Math.min(384, Math.max(32, Math.ceil(Math.sqrt(m) * 6))), s = R / Math.max(x1 - x0, y1 - y0, 1e-9);
  const cnt = new Uint8Array(R * R), tuv = new Float64Array(6), I3 = [0, 1, 2];
  let over = 0, cov = 0;
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < 3; k++) { const v = loc[i * 3 + k]; tuv[k * 2] = (uv[v * 2] - x0) * s / R; tuv[k * 2 + 1] = (uv[v * 2 + 1] - y0) * s / R; }
    rasterTri(tuv, I3, 0, R, (p) => { if (cnt[p]) over++; else cov++; if (cnt[p] < 255) cnt[p]++; });
  }
  return over <= Math.max(1, 0.002 * cov) ? 'ok' : 'overlap';
}

/** The piece with its UVs from 0, turned so its longer axis runs along u (principal axes): { ...pc, uv, w, h }. */
function finishPiece(pc, uv) { return { tris: pc.tris, rep: pc.rep, loc: pc.loc, uv: Float64Array.from(uv), w: 0, h: 0 }; }
function orientPiece(pc) {
  const uv = pc.uv, n = uv.length / 2;
  let mx = 0, my = 0;
  for (let v = 0; v < n; v++) { mx += uv[v * 2] / n; my += uv[v * 2 + 1] / n; }
  let sxx = 0, syy = 0, sxy = 0;
  for (let v = 0; v < n; v++) { const x = uv[v * 2] - mx, y = uv[v * 2 + 1] - my; sxx += x * x; syy += y * y; sxy += x * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), s = Math.sin(th);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let v = 0; v < n; v++) {
    const x = uv[v * 2] - mx, y = uv[v * 2 + 1] - my;
    // (a rotation: the winding stays)
    uv[v * 2] = c * x + s * y; uv[v * 2 + 1] = -s * x + c * y;
    x0 = Math.min(x0, uv[v * 2]); x1 = Math.max(x1, uv[v * 2]); y0 = Math.min(y0, uv[v * 2 + 1]); y1 = Math.max(y1, uv[v * 2 + 1]);
  }
  for (let v = 0; v < n; v++) { uv[v * 2] -= x0; uv[v * 2 + 1] -= y0; }
  pc.w = x1 - x0; pc.h = y1 - y0;
}

/** Regions of triangles whose normals lie within `coneDeg` of their seed's (the largest left), grown over welded edges. */
function segmentByNormal(P, I, tris, key, coneDeg) {
  const cosC = Math.cos((coneDeg * Math.PI) / 180), set = new Set(tris), nrm = new Map(), area = new Map();
  for (const t of tris) { const f = triNormal(P, I, t), l = Math.hypot(...f) || 1; nrm.set(t, [f[0] / l, f[1] / l, f[2] / l]); area.set(t, l); }
  const nb = new Map(), em = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const a = key(I[t * 3 + k]), b = key(I[t * 3 + (k + 1) % 3]), e = a < b ? a * 4194304 + b : b * 4194304 + a;
    const u = em.get(e);
    if (u === undefined) em.set(e, t); else { if (!nb.has(t)) nb.set(t, []); if (!nb.has(u)) nb.set(u, []); nb.get(t).push(u); nb.get(u).push(t); }
  }
  const left = new Set(tris), out = [];
  while (left.size) {
    let seed = -1, ba = -1;
    for (const t of left) if (area.get(t) > ba) { ba = area.get(t); seed = t; }
    const N = nrm.get(seed), region = [seed], stack = [seed];
    left.delete(seed);
    while (stack.length) {
      const t = stack.pop();
      for (const u of nb.get(t) ?? []) {
        if (!left.has(u) || !set.has(u)) continue;
        const n = nrm.get(u);
        if (n[0] * N[0] + n[1] * N[1] + n[2] * N[2] < cosC) continue;
        left.delete(u); region.push(u); stack.push(u);
      }
    }
    out.push(region);
  }
  // (regions of fewer than `minSeg` triangles join the neighbouring region they share most edges with: a lone triangle
  // whose normal leaves the cone would otherwise become an island of its own)
  const minSeg = 6, of = new Map();
  out.forEach((r, i) => { for (const t of r) of.set(t, i); });
  for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    out.forEach((r, i) => {
      if (!r.length || r.length >= minSeg) return;
      const votes = new Map();
      for (const t of r) for (const u of nb.get(t) ?? []) { const j = of.get(u); if (j !== undefined && j !== i && out[j].length) votes.set(j, (votes.get(j) ?? 0) + 1); }
      let best = -1, bv = 0;
      for (const [j, v] of votes) if (v > bv) { bv = v; best = j; }
      if (best < 0) return;
      for (const t of r) { out[best].push(t); of.set(t, best); }
      r.length = 0; moved++;
    });
    if (!moved) break;
  }
  return out.filter((r) => r.length);
}

/** Shelf packing into bins (atlas rects [x0, y0, x1, y1]) at `scale` (atlas share per mm), the tallest first, first
 * fit: each piece goes on the first open shelf of any bin with room (a shelf as tall as its first piece), else on a new
 * shelf in the first bin with height left; a piece that fits no other way is tried turned 90° (pc.rot). Sets each
 * piece's ox, oy (atlas); false if they do not all fit. */
function shelfBins(pieces, scale, bins, pad) {
  const order = pieces.map((_, i) => i).sort((a, b) => Math.max(pieces[b].h, pieces[b].w) - Math.max(pieces[a].h, pieces[a].w) || pieces[b].h - pieces[a].h);
  const shelves = [], top = bins.map(() => pad);
  const place = (pc, w, h) => {
    for (const S of shelves) {
      const R = bins[S.b];
      if (h <= S.h && S.x + w + pad <= R[2] - R[0]) { pc.ox = R[0] + S.x; pc.oy = R[1] + S.y; S.x += w + pad; return true; }
    }
    for (let b = 0; b < bins.length; b++) {
      const R = bins[b];
      if (w + 2 * pad > R[2] - R[0] || top[b] + h + pad > R[3] - R[1]) continue;
      const S = { b, y: top[b], h, x: pad };
      top[b] += h + pad; shelves.push(S);
      pc.ox = R[0] + S.x; pc.oy = R[1] + S.y; S.x += w + pad;
      return true;
    }
    return false;
  };
  for (const i of order) {
    const pc = pieces[i], w = pc.w * scale, h = pc.h * scale;
    // (landscape first: the pieces are turned so their long axis runs along u)
    pc.rot = false;
    if (place(pc, w, h)) continue;
    if (place(pc, h, w)) { pc.rot = true; continue; }
    return false;
  }
  return true;
}

function area3L(pos, loc, i) {
  const a = loc[i * 3], b = loc[i * 3 + 1], c = loc[i * 3 + 2];
  const u = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]], w = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
  return 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
}
function triN(pos, loc, i) {
  const a = loc[i * 3], b = loc[i * 3 + 1], c = loc[i * 3 + 2];
  const u = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]], w = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}
function areaUV(uv, loc, i) {
  const a = loc[i * 3], b = loc[i * 3 + 1], c = loc[i * 3 + 2];
  return 0.5 * ((uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) - (uv[b * 2 + 1] - uv[a * 2 + 1]) * (uv[c * 2] - uv[a * 2]));
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
