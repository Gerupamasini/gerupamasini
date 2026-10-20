// The トビハゼ's teeth as the hero tier's `Mouth_Teeth` mesh (build.mjs): one row on each premaxilla and each dentary
// (13 + 12 a side: Murdy 1989, a single row of caninoid teeth, the front ones enlarged), placed as skull.mjs fits them
// to the sculpt (fitTeeth: each tooth from its root on its jaw bone along its own axis to just under the oral surface,
// so the closed mouth hides every tip and the gape's corrective draws the gum back round them) and shaped as skull.mjs
// toothField draws them: a cone from the root whose upper `curve` of the length hooks toward the inside of the mouth by
// `bend` of the length. Here each tooth is a hexagonal tube along that bent axis (rings at the root, the bend, half way
// up the crown and the crown's base, a point at the tip): 42 triangles a tooth, 2,100 for the 50, against the hero's
// 3,000 for the teeth (body_contract §6). The root end is open (it lies in the jaw's tissue and bone).
// Units: the fitted rows are in head lengths (HL, fish frame, left side); the mesh is in fish mm, each vertex tagged with
// its row ('premax' rides J_premax, 'dentary' J_imj: rig.mjs teethWeights), its uv the body atlas's teeth swatch.
import { HL } from './anatomy.mjs';
import { TOOTH_FIT } from './skull.mjs';
import { BODY_LAYOUT } from './fishmesh.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One tooth's axis as toothField bends it: [[point, radius], …] from the root to the tip (HL). */
export function toothAxis(t, F = TOOTH_FIT) {
  const len = Math.hypot(...sub(t.tip, t.root));
  if (!t.bend || !(F.bend > 0)) return [[t.root, t.r], [add(t.root, mul(sub(t.tip, t.root), 0.5)), t.r * 0.59], [t.tip, t.r * 0.18]];
  const dir = nrm(sub(t.tip, t.root)), mid = add(t.root, mul(dir, len * (1 - F.curve)));
  const q1 = add(add(mid, mul(dir, len * F.curve * 0.5)), mul(t.bend, len * F.bend * 0.25));
  const tip = add(t.tip, mul(t.bend, len * F.bend));
  const r1 = t.r * (0.18 + 0.82 * F.curve), r2 = t.r * (0.18 + 0.82 * F.curve * 0.5), r3 = t.r * 0.18;
  return [[t.root, t.r], [mid, r1], [q1, r2], [add(q1, mul(sub(tip, q1), 0.5)), (r2 + r3) / 2], [tip, r3]];
}

/**
 * The teeth mesh.
 * @param teeth skull.mjs fitTeeth(head) ({ premax, dentary: [{ root, tip, r, bend }] }, HL, left side)
 * @param o { sides (6), layout (BODY_LAYOUT), sink: { premax, dentary } (HL, each tooth moved that far back along its own
 *   axis, root first; TEETH_SINK) }
 * @returns { position (fish mm), normal, uv, indices, group: Uint8Array per vertex (0 premax, 1 dentary), groups: ['premax',
 *   'dentary'], triangles }
 */
/** Each row's sink into its jaw (HL; round B4, the rig key's request: the fitted premaxillary row's front tips stood
 * 0.03–0.15 mm out of the closed upper lip at bind and in every pose — 8 tip vertices, B1–B3 — a geometry fault of the
 * fit, not of the weights: the premaxillary teeth sunk 0.01 HL (0.16 mm) along their own axes; the dentary's hidden). */
export const TEETH_SINK = { premax: 0.01, dentary: 0 };

export function teethMesh(teeth, { sides = 6, layout = BODY_LAYOUT, sink = TEETH_SINK } = {}) {
  const R = layout.teeth, uc = [(R[0] + R[2]) / 2, (R[1] + R[3]) / 2];
  const P = [], N = [], G = [], I = [];
  const groups = ['premax', 'dentary'];
  for (const [g, row] of groups.map((k, i) => [i, teeth[k] ?? []])) {
    for (const side of [1, -1]) {
      for (const t0 of row) {
        // (the sink: root and tip moved back along the tooth's own axis)
        const sk = sink?.[groups[g]] ?? 0, dir0 = nrm(sub(t0.tip, t0.root));
        const t = sk ? { ...t0, root: sub(t0.root, mul(dir0, sk)), tip: sub(t0.tip, mul(dir0, sk)) } : t0;
        const ax = toothAxis(t);
        // the last station is the tip's point: rings at the others, a frame carried along the axis
        const base = P.length / 3;
        let ref = null;
        const rings = ax.length - 1;
        for (let i = 0; i < rings; i++) {
          const p = ax[i][0], r = ax[i][1], d = nrm(sub(ax[i + 1][0], i > 0 ? ax[i - 1][0] : p));
          if (!ref) ref = nrm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
          else ref = nrm(sub(ref, mul(d, dot(ref, d))));
          const bi = cross(d, ref);
          for (let k = 0; k < sides; k++) {
            const a = (2 * Math.PI * k) / sides, n = add(mul(ref, Math.cos(a)), mul(bi, Math.sin(a)));
            const q = add(p, mul(n, r));
            P.push(q[0] * HL, q[1] * HL, q[2] * HL * side); N.push(n[0], n[1], n[2] * side); G.push(g);
          }
        }
        const tip = ax[ax.length - 1][0], td = nrm(sub(tip, ax[ax.length - 2][0]));
        // (the point a little past the axis' end, as the rod's round cap reaches)
        const apex = add(tip, mul(td, ax[ax.length - 1][1]));
        P.push(apex[0] * HL, apex[1] * HL, apex[2] * HL * side); N.push(td[0], td[1], td[2] * side); G.push(g);
        const ap = P.length / 3 - 1;
        // outward winding on the left (the ring runs counter-clockwise about the axis); the right side mirrored, rewound
        const tri = (a, b, c) => (side > 0 ? I.push(a, b, c) : I.push(a, c, b));
        for (let i = 0; i + 1 < rings; i++) for (let k = 0; k < sides; k++) {
          const a = base + i * sides + k, b = base + i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
          tri(a, b, d); tri(a, d, c);
        }
        for (let k = 0; k < sides; k++) tri(base + (rings - 1) * sides + k, base + (rings - 1) * sides + ((k + 1) % sides), ap);
      }
    }
  }
  const n = P.length / 3, position = Float32Array.from(P), indices = Uint32Array.from(I);
  // the normals from the facets (the cones' slopes), area-weighted per tooth
  const normal = new Float32Array(n * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const u = sub(position.subarray(b * 3, b * 3 + 3), position.subarray(a * 3, a * 3 + 3)), w = sub(position.subarray(c * 3, c * 3 + 3), position.subarray(a * 3, a * 3 + 3));
    const f = cross(u, w);
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normal[v * 3 + k] += f[k];
  }
  for (let v = 0; v < n; v++) {
    let x = normal[v * 3], y = normal[v * 3 + 1], z = normal[v * 3 + 2], l = Math.hypot(x, y, z);
    if (!(l > 0)) { x = N[v * 3]; y = N[v * 3 + 1]; z = N[v * 3 + 2]; l = Math.hypot(x, y, z) || 1; }
    normal[v * 3] = x / l; normal[v * 3 + 1] = y / l; normal[v * 3 + 2] = z / l;
  }
  const uv = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) { uv[v * 2] = uc[0]; uv[v * 2 + 1] = uc[1]; }
  return { position, normal, uv, indices, group: Uint8Array.from(G), groups, triangles: indices.length / 3 };
}
