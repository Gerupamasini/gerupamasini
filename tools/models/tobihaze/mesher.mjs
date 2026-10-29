// Surface nets over a signed-distance function: one vertex per grid cell the surface crosses, projected onto the
// surface, and a quad per grid edge the surface crosses (split on its shorter diagonal). The grid is walked one slab
// along s at a time (two slices of distances and two slabs of vertex indices in memory), and the distance is evaluated
// only near the surface: a coarse grid first, then the fine points in the coarse cells the surface can reach (the
// others take the coarse grid's sign). Normals come from the distance's gradient, not from the facets.
import { gradient } from './sdf.mjs';

class Grow {
  constructor(Type, n = 1 << 16) { this.Type = Type; this.a = new Type(n); this.n = 0; }
  push3(a, b, c) {
    if (this.n + 3 > this.a.length) { const b2 = new this.Type(this.a.length * 2); b2.set(this.a); this.a = b2; }
    this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c;
  }
  view() { return this.a.subarray(0, this.n); }
}

/**
 * @param f      distance function (x, y, z) in the frame's units
 * @param box    { min: [x, y, z], max: [x, y, z] }
 * @param h      fine cell size
 * @param o      { coarse: cells per coarse cell (4), project: projection steps (3), log }
 * @returns { position: Float32Array, normal: Float32Array, indices: Uint32Array }
 */
export function surfaceNets(f, box, h, o = {}) {
  const B = o.coarse ?? 4, steps = o.project ?? 3, log = o.log ?? (() => {});
  const [x0, y0, z0] = box.min;
  const nx = Math.ceil((box.max[0] - x0) / h), ny = Math.ceil((box.max[1] - y0) / h), nz = Math.ceil((box.max[2] - z0) / h);
  const H = h * B;
  const cx = Math.ceil(nx / B), cy = Math.ceil(ny / B), cz = Math.ceil(nz / B);
  // coarse grid of distances
  const C = new Float32Array((cx + 1) * (cy + 1) * (cz + 1));
  const ci = (i, j, k) => (i * (cy + 1) + j) * (cz + 1) + k;
  for (let i = 0; i <= cx; i++)
    for (let j = 0; j <= cy; j++)
      for (let k = 0; k <= cz; k++) C[ci(i, j, k)] = f(x0 + i * H, y0 + j * H, z0 + k * H);
  // coarse cells the surface can reach (a corner nearer than the cell's diagonal), dilated by one cell
  const act0 = new Uint8Array(cx * cy * cz), act = new Uint8Array(cx * cy * cz);
  const ai = (i, j, k) => (i * cy + j) * cz + k;
  const reach = H * 1.8;
  for (let i = 0; i < cx; i++)
    for (let j = 0; j < cy; j++)
      for (let k = 0; k < cz; k++) {
        let m = Infinity;
        for (let c = 0; c < 8; c++) m = Math.min(m, Math.abs(C[ci(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]));
        if (m < reach) act0[ai(i, j, k)] = 1;
      }
  for (let i = 0; i < cx; i++)
    for (let j = 0; j < cy; j++)
      for (let k = 0; k < cz; k++) {
        if (!act0[ai(i, j, k)]) continue;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const I = i + a, J = j + b, K = k + c;
          if (I >= 0 && J >= 0 && K >= 0 && I < cx && J < cy && K < cz) act[ai(I, J, K)] = 1;
        }
      }
  let evals = 0;
  const coarseAt = (i, j, k) => {
    // trilinear in the coarse grid (sign away from the surface)
    const fi = i / B, fj = j / B, fk = k / B;
    const I = Math.min(cx - 1, Math.floor(fi)), J = Math.min(cy - 1, Math.floor(fj)), K = Math.min(cz - 1, Math.floor(fk));
    const u = fi - I, v = fj - J, w = fk - K;
    let s = 0;
    for (let c = 0; c < 8; c++) {
      const a = c & 1, b = (c >> 1) & 1, d = (c >> 2) & 1;
      s += C[ci(I + a, J + b, K + d)] * (a ? u : 1 - u) * (b ? v : 1 - v) * (d ? w : 1 - w);
    }
    return s;
  };
  const slice = (i, out) => {
    const x = x0 + i * h;
    for (let j = 0; j <= ny; j++)
      for (let k = 0; k <= nz; k++) {
        const I = Math.min(cx - 1, Math.floor(i / B)), J = Math.min(cy - 1, Math.floor(j / B)), K = Math.min(cz - 1, Math.floor(k / B));
        // a point on a coarse cell's face belongs to the cells on both sides: active if either is
        let on = act[ai(I, J, K)];
        if (!on && i % B === 0 && I > 0) on = act[ai(I - 1, J, K)];
        if (!on && j % B === 0 && J > 0) on = act[ai(I, J - 1, K)];
        if (!on && k % B === 0 && K > 0) on = act[ai(I, J, K - 1)];
        if (on) { out[j * (nz + 1) + k] = f(x, y0 + j * h, z0 + k * h); evals++; }
        else out[j * (nz + 1) + k] = coarseAt(i, j, k);
      }
  };
  const SZ = (ny + 1) * (nz + 1);
  let sA = new Float32Array(SZ), sB = new Float32Array(SZ);
  let vPrev = new Int32Array(ny * nz).fill(-1), vCur = new Int32Array(ny * nz).fill(-1);
  const pos = new Grow(Float32Array, 1 << 20), idx = new Grow(Uint32Array, 1 << 21);
  const P = (vi) => [pos.a[vi * 3], pos.a[vi * 3 + 1], pos.a[vi * 3 + 2]];
  const quad = (a, b, c, d, axis, outward) => {
    // a b c d around the edge (in order round it); split on the shorter diagonal; each triangle turned to face the
    // way the surface crosses the edge (outward: +1 when the edge's first point is inside, the normal along +axis)
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const pa = P(a), pb = P(b), pc = P(c), pd = P(d);
    const d1 = (pa[0] - pc[0]) ** 2 + (pa[1] - pc[1]) ** 2 + (pa[2] - pc[2]) ** 2;
    const d2 = (pb[0] - pd[0]) ** 2 + (pb[1] - pd[1]) ** 2 + (pb[2] - pd[2]) ** 2;
    const t = d1 <= d2 ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
    for (let q = 0; q < 6; q += 3) {
      const A = P(t[q]), Bp = P(t[q + 1]), Cp = P(t[q + 2]);
      const u = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], v = [Cp[0] - A[0], Cp[1] - A[1], Cp[2] - A[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[axis] * outward >= 0) idx.push3(t[q], t[q + 1], t[q + 2]);
      else idx.push3(t[q], t[q + 2], t[q + 1]);
    }
  };
  slice(0, sA);
  const at = (s, j, k) => s[j * (nz + 1) + k];
  for (let i = 0; i < nx; i++) {
    slice(i + 1, sB);
    vCur.fill(-1);
    // cell vertices of slab i
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++) {
        const v = [at(sA, j, k), at(sB, j, k), at(sA, j + 1, k), at(sB, j + 1, k), at(sA, j, k + 1), at(sB, j, k + 1), at(sA, j + 1, k + 1), at(sB, j + 1, k + 1)];
        let mask = 0;
        for (let c = 0; c < 8; c++) if (v[c] < 0) mask |= 1 << c;
        if (mask === 0 || mask === 255) continue;
        // mean of the edge crossings
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let c = 0; c < 8; c++)
          for (const e of [1, 2, 4]) {
            const c2 = c | e;
            if (c2 === c || (c & e)) continue;
            const a = v[c], b = v[c2];
            if ((a < 0) === (b < 0)) continue;
            const t = a / (a - b);
            const ax = c & 1, ay = (c >> 1) & 1, az = (c >> 2) & 1;
            const bx = c2 & 1, by = (c2 >> 1) & 1, bz = (c2 >> 2) & 1;
            sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
          }
        let px = x0 + (i + sx / n) * h, py = y0 + (j + sy / n) * h, pz = z0 + (k + sz / n) * h;
        // onto the surface (Newton steps along the gradient), kept near its cell
        const qx = px, qy = py, qz = pz;
        for (let it = 0; it < steps; it++) {
          const d = f(px, py, pz);
          const g = gradient(f, px, py, pz, h * 0.25);
          const gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
          if (gg < 1e-12) break;
          px -= (d * g[0]) / gg; py -= (d * g[1]) / gg; pz -= (d * g[2]) / gg;
          const mx = px - qx, my = py - qy, mz = pz - qz, ml = Math.hypot(mx, my, mz);
          if (ml > h * 1.2) { const s = (h * 1.2) / ml; px = qx + mx * s; py = qy + my * s; pz = qz + mz * s; }
          if (Math.abs(d) < h * 1e-3) break;
        }
        vCur[j * nz + k] = pos.n / 3;
        pos.push3(px, py, pz);
      }
    // quads: x-edges between slices i and i+1 (cells of slab i)
    for (let j = 1; j < ny; j++)
      for (let k = 1; k < nz; k++) {
        const a = at(sA, j, k), b = at(sB, j, k);
        if ((a < 0) === (b < 0)) continue;
        const v = (jj, kk) => vCur[jj * nz + kk];
        quad(v(j - 1, k - 1), v(j, k - 1), v(j, k), v(j - 1, k), 0, a < 0 ? 1 : -1);
      }
    // y- and z-edges in slice i (cells of slabs i-1 and i)
    if (i > 0) {
      for (let j = 0; j < ny; j++)
        for (let k = 1; k < nz; k++) {
          const a = at(sA, j, k), b = at(sA, j + 1, k);
          if ((a < 0) === (b < 0)) continue;
          quad(vPrev[j * nz + k - 1], vCur[j * nz + k - 1], vCur[j * nz + k], vPrev[j * nz + k], 1, a < 0 ? 1 : -1);
        }
      for (let j = 1; j < ny; j++)
        for (let k = 0; k < nz; k++) {
          const a = at(sA, j, k), b = at(sA, j, k + 1);
          if ((a < 0) === (b < 0)) continue;
          quad(vPrev[(j - 1) * nz + k], vPrev[j * nz + k], vCur[j * nz + k], vCur[(j - 1) * nz + k], 2, a < 0 ? 1 : -1);
        }
    }
    [sA, sB] = [sB, sA];
    [vPrev, vCur] = [vCur, vPrev];
  }
  const position = pos.view().slice();
  const indices = idx.view().slice();
  const nv = position.length / 3;
  // normals from the field
  const normal = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const g = gradient(f, position[v * 3], position[v * 3 + 1], position[v * 3 + 2], h * 0.5);
    const l = Math.hypot(g[0], g[1], g[2]) || 1;
    normal[v * 3] = g[0] / l; normal[v * 3 + 1] = g[1] / l; normal[v * 3 + 2] = g[2] / l;
  }
  log(`surface nets ${nx}×${ny}×${nz} @ ${h}: ${evals} fine evaluations, ${nv} vertices, ${indices.length / 3} triangles`);
  return { position, normal, indices };
}
