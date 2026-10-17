// UV charts of the トビハゼ surface. The sculpt is meshed without a parameterisation (mesher.mjs), so every vertex gets
// its texture coordinate from a projection of its fish-frame position, chosen per region:
//   head    azimuthal (equidistant) projection of the direction from a point inside the head, about the forward axis:
//           continuous over the whole face, snout and eye turret, no pole on the face
//   body    cylinder about the body's axis, u along s, v round it with the seam on the ventral midline
//   socket  the inside of each dermal cup (it would overlap the cup's outside in the head projection), projected from
//           the eye's centre
//   lobe    the fleshy pectoral arms (body.mjs), a cylinder about each arm's own axis
// Triangles take the chart most of their corners prefer; vertices on a chart boundary are split, one copy per chart
// (an attribute seam the simplifier keeps). Every chart has a rectangle of the atlas; the textures are baked from the
// fish-frame position under each texel (bake.mjs), so the charts meet without visible seams.

const TAU = Math.PI * 2;

/** Azimuthal equidistant projection about `axis` from `centre`; thetaMax maps to the rim of the unit disc. */
export function azimuthal(centre, axis, up, thetaMax) {
  const a = norm(axis), u0 = norm(sub(up, scale(a, dot(up, a)))), v0 = cross(a, u0);
  return (p) => {
    const d = sub(p, centre), r = Math.hypot(d[0], d[1], d[2]) || 1e-9;
    const th = Math.acos(Math.max(-1, Math.min(1, dot(d, a) / r)));
    const ph = Math.atan2(dot(d, v0), dot(d, u0));
    const k = th / thetaMax;
    return [0.5 + 0.5 * k * Math.cos(ph), 0.5 + 0.5 * k * Math.sin(ph)];
  };
}

/** Cylinder about the line (s, axisY(s), 0): u from s0 to s1, v = 0 at the ventral midline, 0.5 at the dorsal one. */
export function cylinder(s0, s1, axisY) {
  return (p) => {
    const ang = Math.atan2(p[2], p[1] - axisY(p[0])); // 0 dorsal, +π/2 left, ±π ventral
    return [(p[0] - s0) / (s1 - s0), (ang + Math.PI) / TAU];
  };
}

/**
 * Split a mesh into charts.
 * @param mesh    { position, normal, indices } (fish frame)
 * @param charts  [{ name, rect: [x0, y0, x1, y1] (atlas share), project(p) → [a, b] in 0..1, wrapV? }]
 * @param prefer  (p, n) → chart index for a vertex
 * @returns { position, normal, uv, indices, chart (per vertex), source (per vertex: index in the input) }
 */
export function chartMesh(mesh, charts, prefer) {
  const { position: P, normal: N, indices: I } = mesh;
  const nv = P.length / 3;
  const pref = new Int16Array(nv);
  for (let v = 0; v < nv; v++) pref[v] = prefer([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]);
  const triChart = new Int16Array(I.length / 3);
  for (let t = 0; t < I.length / 3; t++) {
    const a = pref[I[t * 3]], b = pref[I[t * 3 + 1]], c = pref[I[t * 3 + 2]];
    triChart[t] = a === b || a === c ? a : b === c ? b : a;
  }
  const key = new Map();
  const src = [], chart = [];
  const out = new Uint32Array(I.length);
  for (let t = 0; t < I.length / 3; t++) {
    const c = triChart[t];
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k], id = v * 64 + c;
      let ni = key.get(id);
      if (ni === undefined) { ni = src.length; key.set(id, ni); src.push(v); chart.push(c); }
      out[t * 3 + k] = ni;
    }
  }
  const n = src.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = src[i];
    for (let k = 0; k < 3; k++) { position[i * 3 + k] = P[v * 3 + k]; normal[i * 3 + k] = N[v * 3 + k]; }
    const C = charts[chart[i]];
    const [a, b] = C.project([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    uv[i * 2] = C.rect[0] + a * (C.rect[2] - C.rect[0]);
    uv[i * 2 + 1] = C.rect[1] + b * (C.rect[3] - C.rect[1]);
  }
  // a chart that wraps in v (the body's cylinder): a triangle across the ventral seam gets its low corners lifted by
  // one turn (its own copies), so it spans the seam instead of the whole chart; the bake fills the overflow band
  const extra = [];
  for (let t = 0; t < out.length / 3; t++) {
    const C = charts[triChart[t]];
    if (!C.wrapV) continue;
    const h = C.rect[3] - C.rect[1];
    const vs = [0, 1, 2].map((k) => uv[out[t * 3 + k] * 2 + 1]);
    if (Math.max(...vs) - Math.min(...vs) < h * 0.5) continue;
    for (let k = 0; k < 3; k++) {
      if (vs[k] - C.rect[1] < h * 0.5) {
        const i = out[t * 3 + k];
        extra.push({ i, t, k });
      }
    }
  }
  if (extra.length) {
    const m = n + extra.length;
    const pos2 = new Float32Array(m * 3), nrm2 = new Float32Array(m * 3), uv2 = new Float32Array(m * 2);
    pos2.set(position); nrm2.set(normal); uv2.set(uv);
    extra.forEach(({ i, t, k }, e) => {
      const j = n + e;
      for (let c = 0; c < 3; c++) { pos2[j * 3 + c] = position[i * 3 + c]; nrm2[j * 3 + c] = normal[i * 3 + c]; }
      const C = charts[chart[i]];
      uv2[j * 2] = uv[i * 2];
      uv2[j * 2 + 1] = uv[i * 2 + 1] + (C.rect[3] - C.rect[1]);
      out[t * 3 + k] = j;
      src.push(src[i]); chart.push(chart[i]);
    });
    return { position: pos2, normal: nrm2, uv: uv2, indices: out, chart: Int16Array.from(chart), source: Uint32Array.from(src) };
  }
  return { position, normal, uv, indices: out, chart: Int16Array.from(chart), source: Uint32Array.from(src) };
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
export const vec = { sub, scale, dot, cross, norm };
