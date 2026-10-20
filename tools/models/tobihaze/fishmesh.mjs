// The whole-fish skin as a render mesh per tier: the sculpt of body.mjs meshed at the tier's cell size, split into UV
// charts (charts.mjs) and simplified to the tier's triangle target (tiers.mjs). The body texture is square (2048² on the
// hero); its layout:
//   body    the trunk and tail, a cylinder about the body's axis (seam on the ventral midline)       [0, 0] – [1, 0.55]
//   head    the face, snout and eye turret, azimuthal about the forward axis                         [0, 0.56] – [0.36, 0.92]
//   socket  the inside of each dermal cup                                                            L [0.37, 0.56], R [0.46, 0.56], 0.08 square
//   lobe    each pectoral arm, a cylinder about its own axis (seam against the flank)                 L [0.56, 0.56], R [0.56, 0.72], 0.16 × 0.14
// The texel density is about 0.0019 HL (0.03 mm) per texel on the hero in every chart; [0.80, 0.56] – [1, 1] is free.
import { HL, HEAD, EYE_MM } from './anatomy.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { BODY_SCULPT, fishSDFmm, trunkProfile } from './body.mjs';
import { azimuthal, cylinder, limb, vec } from './charts.mjs';
import { tierMesh, ready } from './tiers.mjs';
import { surfaceNets } from './mesher.mjs';
import { fixWinding } from './headrig.mjs';
import { smoothstep } from './sdf.mjs';

export { ready };

/** The meshing box (fish mm): snout to the peduncle's end, the pectoral lobes and the eye domes inside. */
export const BODY_BOX = { min: [-0.08 * HL, -0.16 * HL, -0.62 * HL], max: [4.32 * HL, 0.85 * HL, 0.62 * HL] };

export const BODY_LAYOUT = {
  body: [0, 0, 1, 0.55],
  head: [0, 0.56, 0.36, 0.92],
  socketL: [0.37, 0.56, 0.45, 0.64],
  socketR: [0.46, 0.56, 0.54, 0.64],
  lobeL: [0.56, 0.56, 0.72, 0.70],
  lobeR: [0.56, 0.72, 0.72, 0.86],
};

/** The charts (fish mm) and the per-vertex chart choice. */
export function bodyCharts(K = BODY_SCULPT) {
  const prof = trunkProfile(K);
  const sC = 0.45 * HL, yC = 0.30 * HL;
  // the body's axis: the head's centre line ahead of the gill opening, the trunk's mid-height behind it
  const axisY = (s) => {
    const sh = s / HL, w = smoothstep(1.0, 1.4, sh);
    return w <= 0 ? yC : (1 - w) * yC + w * prof.at(Math.max(1.05, sh)).yc * HL;
  };
  const E = HEAD.eye, g = vec.norm(HEAD_SCULPT.cup.open);
  const P = K.pectoral, mm = (v) => v.map((c) => c * HL);
  const lobe = (side) => {
    const m = (v) => [v[0], v[1], v[2] * side];
    return { a: mm(m(P.shoulder)), b: mm(m(P.wrist)), out: [0, 0, side] };
  };
  const LL = lobe(1), LR = lobe(-1);
  const charts = [
    { name: 'head', rect: BODY_LAYOUT.head, project: azimuthal([sC, yC, 0], [-1, 0, 0], [0, 1, 0], Math.PI * 0.56) },
    { name: 'body', rect: BODY_LAYOUT.body, wrapV: true, project: cylinder(sC - 0.02 * HL, 4.30 * HL, axisY) },
    { name: 'socketL', rect: BODY_LAYOUT.socketL, project: azimuthal([E.s * HL, E.y * HL, E.z * HL], [-g[0], -g[1], -g[2]], [1, 0, 0], Math.PI * 0.75) },
    { name: 'socketR', rect: BODY_LAYOUT.socketR, project: azimuthal([E.s * HL, E.y * HL, -E.z * HL], [-g[0], -g[1], g[2]], [1, 0, 0], Math.PI * 0.75) },
    { name: 'lobeL', rect: BODY_LAYOUT.lobeL, wrapV: true, project: limb(LL.a, LL.b, LL.out) },
    { name: 'lobeR', rect: BODY_LAYOUT.lobeR, wrapV: true, project: limb(LR.a, LR.b, LR.out) },
  ];
  const re = (E.d / 2) * HL, rIn = re + (HEAD_SCULPT.cup.gap + HEAD_SCULPT.cup.thick * 0.6) * HL;
  const rLobe = Math.max(...P.radius) * HL;
  const inLobe = (p, L) => {
    const ax = vec.sub(L.b, L.a), len = Math.hypot(...ax), u = vec.scale(ax, 1 / len);
    const d = vec.sub(p, L.a), t = vec.dot(d, u) / len;
    if (t < 0.18) return false;
    const q = vec.sub(d, vec.scale(u, Math.min(1, t) * len));
    return Math.hypot(...q) < rLobe * 1.35;
  };
  const prefer = (p, n) => {
    for (const [ci, side] of [[2, 1], [3, -1]]) {
      const c = [E.s * HL, E.y * HL, E.z * HL * side];
      const d = vec.sub(c, p), l = Math.hypot(...d);
      if (l < rIn && vec.dot(n, d) / l > 0.15) return ci;
    }
    if (p[2] > 0 && inLobe(p, LL)) return 4;
    if (p[2] < 0 && inLobe(p, LR)) return 5;
    return p[0] < sC ? 0 : 1;
  };
  return { charts, prefer, axisY };
}

/**
 * The body's render mesh for a tier.
 * @param o { h: cell (mm), target: triangles, permissive?, log? }
 * @returns tiers.tierMesh's result (fish mm)
 */
export function bodyTierMesh(o, K = BODY_SCULPT) {
  const { charts, prefer } = bodyCharts(K);
  return tierMesh(fishSDFmm(HL, K), BODY_BOX, { ...o, charts, prefer });
}

/** The mesh with only the triangles `keep(t)` accepts, its vertices compacted (`source`: new vertex → old). */
export function filterTriangles(mesh, keep) {
  const n = mesh.position.length / 3, remap = new Int32Array(n).fill(-1), tris = [];
  let m = 0;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    if (!keep(t)) continue;
    for (let k = 0; k < 3; k++) { const v = mesh.indices[t * 3 + k]; if (remap[v] < 0) remap[v] = m++; tris.push(remap[v]); }
  }
  const source = new Uint32Array(m), position = new Float32Array(m * 3), normal = new Float32Array(m * 3);
  for (let v = 0; v < n; v++) {
    const j = remap[v];
    if (j < 0) continue;
    source[j] = v;
    position.set(mesh.position.subarray(v * 3, v * 3 + 3), j * 3);
    normal.set(mesh.normal.subarray(v * 3, v * 3 + 3), j * 3);
  }
  return { position, normal, indices: Uint32Array.from(tris), source };
}

/** Only the largest edge-connected component (the surface nets also mesh closed bubbles inside the sculpt, such as the
 * mouth cavity behind the closed slit: never seen, but they cost triangles and fold the UV charts). */
export function keepLargestComponent(mesh) {
  const n = mesh.position.length / 3, parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const count = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = find(I[t]); count.set(r, (count.get(r) ?? 0) + 1); }
  let best = -1, bestN = -1;
  for (const [r, c] of count) if (c > bestN) { best = r; bestN = c; }
  const out = filterTriangles(mesh, (t) => find(I[t * 3]) === best);
  out.dropped = I.length / 3 - bestN;
  return out;
}

/** Without the triangles lying wholly inside a resting eye globe (more than `margin` HL under its surface): the globe
 * mesh covers them, the head rig gives them the eye joint alone, and the blink keeps them inside the lowered globe. */
export function pruneInsideGlobes(mesh, { margin = 0.004 } = {}) {
  const r = EYE_MM.radius - margin * HL, c = EYE_MM.center, P = mesh.position, I = mesh.indices;
  const inside = (v) => {
    const x = P[v * 3] - c[0], y = P[v * 3 + 1] - c[1], z = Math.abs(P[v * 3 + 2]) - c[2];
    return x * x + y * y + z * z < r * r;
  };
  const out = filterTriangles(mesh, (t) => !(inside(I[t * 3]) && inside(I[t * 3 + 1]) && inside(I[t * 3 + 2])));
  out.pruned = I.length / 3 - out.indices.length / 3;
  return out;
}

/**
 * The whole fish's dense skin at a cell of h mm (fish frame mm): surface nets of the field, triangles wound with their
 * neighbours, only the outer skin (no inner bubbles), nothing hidden inside the globes. `source` maps each vertex to the
 * raw surface-nets vertex.
 * @param o { h, field?: distance (mm; default the full sculpt), box?, log? }
 */
export function fishDense({ h, field, box = BODY_BOX, log = () => {} }) {
  const f = field ?? fishSDFmm(HL);
  const raw = surfaceNets(f, box, h, { log });
  const turned = fixWinding(raw.indices);
  const a = keepLargestComponent(raw);
  const b = pruneInsideGlobes(a);
  const source = new Uint32Array(b.source.length);
  for (let i = 0; i < source.length; i++) source[i] = a.source[b.source[i]];
  log(`dense h ${h}: ${b.position.length / 3} vertices, ${b.indices.length / 3} triangles (turned ${turned}, dropped ${a.dropped} in bubbles, pruned ${b.pruned} inside the globes)`);
  return { position: b.position, normal: b.normal, indices: b.indices, source, field: f, stats: { turned, dropped: a.dropped, pruned: b.pruned } };
}
