// Carrying per-vertex data from the hero's dense mesh to another mesh of the same fish (the lighter tiers' meshes, a
// fin's root on the skin): weight rows and 3-vectors (the head's blend shapes' world displacements, normal deltas), each
// target vertex taking the inverse-distance mean of its k nearest hero vertices of the same tissue class (the integration
// design §4.5). The tiers mesh other fields (sealed: no gape slit, no gill pocket; far: smoother), but the surfaces lie
// within a cell of each other, so the k nearest hero vertices of the right class are the skin the tier vertex stands for.
// The classes keep the two sides of a thin gap apart: the lower lip from the upper (gapeSide, told by the unsealed
// sculpt), the gill cover's free edge from the body wall under it, the head's surface inside a resting globe from the
// skin outside, the pectoral arm from the flank it lies against, the pelvic base from the belly.
// Units: positions in fish mm unless stated.
import { HL, HEAD } from './anatomy.mjs';
import { HEAD_SCULPT } from './head.mjs';
import { gapeSide, marginCurve } from './headrig.mjs';

/** Tissue classes. */
export const TISSUE = { rest: 0, lowerJaw: 1, flap: 2, inGlobe: 3, lobe: 4, pelvic: 5 };

/**
 * A uniform grid over a point set (mm): query(p, k, accept) → the k nearest points [[index, d²], …] (nearest first)
 * among those accept(index) admits, searching rings of cells outward until no nearer point can remain (or `maxR` mm);
 * closest(p, indices, vt) → the closest point of the mesh's triangles round the nearest vertex: { tri, w: barycentrics,
 * ids, d }.
 */
export function vertexGrid(position, cell = 0.2, { maxR = 3 } = {}) {
  const n = position.length / 3, inv = 1 / cell, cells = new Map();
  const key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  const ci = new Int32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const i = Math.floor(position[v * 3] * inv), j = Math.floor(position[v * 3 + 1] * inv), k = Math.floor(position[v * 3 + 2] * inv);
    ci[v * 3] = i; ci[v * 3 + 1] = j; ci[v * 3 + 2] = k;
    const h = key(i, j, k);
    let a = cells.get(h); if (!a) cells.set(h, (a = [])); a.push(v);
  }
  const query = (p, kk = 4, accept = null) => {
    const i0 = Math.floor(p[0] * inv), j0 = Math.floor(p[1] * inv), k0 = Math.floor(p[2] * inv);
    const best = [];
    const rings = Math.ceil(maxR * inv);
    for (let r = 0; r <= rings; r++) {
      // every point within r·cell of p's cell has been seen once ring r is done: stop when the k-th is nearer than that
      if (best.length >= kk && best[kk - 1][1] <= (r - 1) * (r - 1) * cell * cell) break;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue;
        const list = cells.get(key(i0 + a, j0 + b, k0 + c));
        if (!list) continue;
        for (const v of list) {
          if (ci[v * 3] !== i0 + a || ci[v * 3 + 1] !== j0 + b || ci[v * 3 + 2] !== k0 + c) continue;
          if (accept && !accept(v)) continue;
          const dx = position[v * 3] - p[0], dy = position[v * 3 + 1] - p[1], dz = position[v * 3 + 2] - p[2], d2 = dx * dx + dy * dy + dz * dz;
          if (best.length < kk) { best.push([v, d2]); best.sort((x, y) => x[1] - y[1]); } else if (d2 < best[kk - 1][1]) { best[kk - 1] = [v, d2]; best.sort((x, y) => x[1] - y[1]); }
        }
      }
    }
    return best;
  };
  let vt = null;
  const closest = (p, indices, accept = null) => {
    if (!vt) { vt = Array.from({ length: n }, () => []); for (let t = 0; t < indices.length / 3; t++) for (let k = 0; k < 3; k++) vt[indices[t * 3 + k]].push(t); }
    const near = query(p, 3, accept);
    let best = null;
    for (const [v] of near) for (const t of vt[v]) {
      const ids = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
      const P = ids.map((i) => [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]);
      const r = closestBary(p, P[0], P[1], P[2]);
      if (!best || r.d < best.d) best = { tri: t, ids, w: r.w, d: r.d };
    }
    return best;
  };
  return { query, closest, cell };
}

/** The closest point of triangle abc to p as barycentrics (Ericson, Real-Time Collision Detection §5.1.5), and its distance. */
export function closestBary(p, a, b, c) {
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  let w;
  if (d1 <= 0 && d2 <= 0) w = [1, 0, 0];
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) w = [0, 1, 0];
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); w = [1 - t, t, 0]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) w = [0, 0, 1];
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); w = [1 - t, 0, t]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / ((d4 - d3) + (d5 - d6)); w = [0, 1 - t, t]; }
            else { const den = 1 / (va + vb + vc), v2 = vb * den, w2 = vc * den; w = [1 - v2 - w2, v2, w2]; }
          }
        }
      }
    }
  }
  const q = [0, 1, 2].map((k) => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]);
  return { w, d: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) };
}

/**
 * A vertex's tissue class (the same rule for the hero's vertices and a tier's, so the sides of a thin gap find each
 * other's own skin): 3 inside a resting globe (r < its radius), 4 the pectoral arm (its share > 0.5), 5 the pelvic base
 * (> 0.5), 1 the lower jaw's tissue in front of the rictus (gapeSide of the unsealed sculpt), 2 the gill cover's free edge
 * (in front of the opercle's margin + 0.005, behind margin − `flapReach`, within the gill slit's heights ± 0.02), else 0.
 * @param p    position (mm)
 * @param o    { fish: the whole fish's field in HL (.head.parts), shares: rig.mjs partShares(fish) (or { m, mp } given),
 *             m, mp: the shares when known (the hero's smoothed ones), K: the head's sculpt (HEAD_SCULPT), flapReach (HL) }
 */
export function tissueClass(p, o = {}) {
  const K = o.K ?? HEAD_SCULPT, x = p[0] / HL, y = p[1] / HL, z = p[2] / HL;
  const E = HEAD.eye, re = E.d / 2;
  if (Math.hypot(x - E.s, y - E.y, Math.abs(z) - E.z) < re) return TISSUE.inGlobe;
  let m = o.m, mp = o.mp;
  if ((m === undefined || mp === undefined) && o.shares) ({ m, mp } = o.shares(x, y, z));
  if (m > 0.5) return TISSUE.lobe;
  if (mp > 0.5) return TISSUE.pelvic;
  if (x < 0.36 && o.fish) {
    CLS.lower ??= gapeSide(K, 0.33);
    if (CLS.lower(x, y, o.fish.head.parts(x, y, z))) return TISSUE.lowerJaw;
  }
  CLS.sOp ??= marginCurve(K.opercle.path);
  const GS = K.gillSlit ?? { y0: 0.175, y1: 0.375 }, b = x - CLS.sOp(y), reach = o.flapReach ?? 0.08;
  if (y > GS.y0 - 0.02 && y < GS.y1 + 0.02 && b < 0.005 && b > -reach && Math.abs(z) > 0.15) return TISSUE.flap;
  return TISSUE.rest;
}
const CLS = {};

/** The k nearest source vertices of the target's class (any class if none within reach), inverse-distance weights. */
function neighbours(grid, src, p, cls, n, k, o) {
  const normalOk = (v) => !o.normal || !src.normal || (src.normal[v * 3] * n[0] + src.normal[v * 3 + 1] * n[1] + src.normal[v * 3 + 2] * n[2]) > (o.minDot ?? 0);
  let near = grid.query(p, k, (v) => src.cls[v] === cls && normalOk(v));
  if (!near.length || near[0][1] > (o.maxD ?? 1) ** 2) near = grid.query(p, k, (v) => src.cls[v] === cls);
  if (!near.length) near = grid.query(p, k);
  const eps = (o.eps ?? 0.01) ** 2;
  let ws = 0;
  const w = near.map(([v, d2]) => { const x = 1 / (d2 + eps); ws += x; return [v, x]; });
  return w.map(([v, x]) => [v, x / ws]);
}

/**
 * Weight rows carried to another mesh.
 * @param src { position (mm), rows: Float32Array(n·J), J, cls: Uint8Array (tissueClass), normal? }
 * @param dst { position (mm), cls, normal? }
 * @param o   { k (4), cell (mm, 0.2), normal: true to take only source vertices facing the target's way (dot > minDot),
 *            grid: a vertexGrid of src.position to reuse }
 * @returns Float32Array(nDst·J), each row the inverse-distance mean of its neighbours' (sums kept at 1)
 */
export function transferRows(src, dst, o = {}) {
  const J = src.J, k = o.k ?? 4, grid = o.grid ?? vertexGrid(src.position, o.cell ?? 0.2), n = dst.position.length / 3;
  const out = new Float32Array(n * J);
  for (let v = 0; v < n; v++) {
    const p = [dst.position[v * 3], dst.position[v * 3 + 1], dst.position[v * 3 + 2]], nn = dst.normal ? [dst.normal[v * 3], dst.normal[v * 3 + 1], dst.normal[v * 3 + 2]] : null;
    for (const [u, w] of neighbours(grid, src, p, dst.cls[v], nn, k, o)) for (let j = 0; j < J; j++) out[v * J + j] += w * src.rows[u * J + j];
  }
  return out;
}

/**
 * 3-vectors carried to another mesh (a blend shape's world displacement, its normal deltas, any n·3 data).
 * @param src { position (mm), data: Float32Array(n·3), cls, normal? }
 * @param dst { position (mm), cls, normal? }
 * @returns Float32Array(nDst·3)
 */
export function transferVec3(src, dst, o = {}) {
  const k = o.k ?? 4, grid = o.grid ?? vertexGrid(src.position, o.cell ?? 0.2), n = dst.position.length / 3, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const p = [dst.position[v * 3], dst.position[v * 3 + 1], dst.position[v * 3 + 2]], nn = dst.normal ? [dst.normal[v * 3], dst.normal[v * 3 + 1], dst.normal[v * 3 + 2]] : null;
    for (const [u, w] of neighbours(grid, src, p, dst.cls[v], nn, k, o)) for (let c = 0; c < 3; c++) out[v * 3 + c] += w * src.data[u * 3 + c];
  }
  return out;
}

/**
 * The hero's alert eye lift carried to a tier without eye joints (round B4, poses P4: lod2 has no J_eyeL/R and no eyesUp, so
 * its alert eyes stood 0.9 mm under the near tiers' in the land state and popped at the lod1 ↔ lod2 switch): the hero's
 * dense skin moved as the lift moves it (the eyesUp correctives at lift / their full lift plus the eye joints' share of the
 * lift: the joints only translate) carried to the tier's vertices by tissue class (transferVec3), fish mm, bind frame.
 * @param H build.mjs heroData ({ dense, packed, D, cls, grid })   @param dst { position, normal, cls } (the tier's skin)
 * @param o { lift (HL, the alert's), full (HL, the eyesUp shapes' lift), eyeJ: [J_eyeL, J_eyeR] hero joint indices, HL }
 * @returns Float32Array(nDst·3) mm
 */
export function eyeLiftOnTier(H, dst, { lift, full = 0.08, eyeJ, HL: hl = HL } = {}) {
  const nD = H.dense.position.length / 3, w = lift / full, M = new Float32Array(nD * 3);
  const dL = H.D.eyesUpL, dR = H.D.eyesUpR;
  for (let v = 0; v < nD; v++) {
    let share = 0; for (let q = 0; q < 4; q++) if (eyeJ.includes(H.packed.joints[v * 4 + q])) share += H.packed.weights[v * 4 + q] / 255;
    for (let c = 0; c < 3; c++) M[v * 3 + c] = w * ((dL?.[v * 3 + c] ?? 0) + (dR?.[v * 3 + c] ?? 0));
    M[v * 3 + 1] += share * lift * hl;
  }
  return transferVec3({ position: H.dense.position, normal: H.dense.normal, cls: H.cls, data: M }, dst, { grid: H.grid, normal: true });
}

/** The data of a source mesh sampled at points by their closest point on its surface (barycentric), e.g. a fin's roots
 * on the hero's skin: src { position, indices, data, dim }, points (mm, n·3) → Float32Array(n·dim). */
export function sampleSurface(src, points, o = {}) {
  const grid = o.grid ?? vertexGrid(src.position, o.cell ?? 0.2), dim = src.dim, n = points.length / 3, out = new Float32Array(n * dim);
  for (let v = 0; v < n; v++) {
    const c = grid.closest([points[v * 3], points[v * 3 + 1], points[v * 3 + 2]], src.indices);
    if (!c) continue;
    c.ids.forEach((id, j) => { for (let d = 0; d < dim; d++) out[v * dim + d] += c.w[j] * src.data[id * dim + d]; });
  }
  return out;
}
