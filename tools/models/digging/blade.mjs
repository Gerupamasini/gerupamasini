// Sheet-metal blades: a parametric top surface given a thickness (top face, under face and the rim
// wall between them), plus helpers to split painted / worn areas and to lay engraved depth marks.
import { MeshData, v3, clamp } from '../nets/geom.mjs';

/**
 * surf(s, t) -> [x, y, z]: the top (working) face; s in [-1, 1] across, t in [0, 1] heel -> tip.
 * The under face is the top face pushed back along its normal by `thick`. uv = (x, z) / tile.
 * Returns the mesh plus the per-vertex (s, t) so callers can classify areas.
 */
export function bladeShell(surf, { nu, nv, thick, tile = [0.04, 0.04] }) {
  const W = nu + 1, H = nv + 1;
  const P = [], N = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) P.push(surf(-1 + (2 * i) / nu, j / nv));
  const at = (i, j) => P[clamp(j, 0, nv) * W + clamp(i, 0, nu)];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let du = v3.sub(at(i + 1, j), at(i - 1, j)), dv = v3.sub(at(i, j + 1), at(i, j - 1));
    if (v3.len(du) < 1e-9) du = v3.sub(at(i + 1, j - 1), at(i - 1, j - 1)); // pointed tip row
    let n = v3.cross(dv, du);
    if (v3.len(n) < 1e-12) n = [0, 1, 0];
    N.push(v3.norm(n));
  }
  const m = new MeshData();
  const st = [];
  const push = (p, n, s, t) => { m.pos.push(...p); m.nrm.push(...n); m.uv.push(p[0] / tile[0], p[2] / tile[1]); m.dirt.push(0); m.ao.push(1); st.push([s, t]); };
  // top face, then under face
  for (let k = 0; k < W * H; k++) push(P[k], N[k], -1 + (2 * (k % W)) / nu, Math.floor(k / W) / nv);
  for (let k = 0; k < W * H; k++) push(v3.sub(P[k], v3.mul(N[k], thick)), v3.mul(N[k], -1), -1 + (2 * (k % W)) / nu, Math.floor(k / W) / nv);
  const B = W * H;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    m.idx.push(a, c, b, b, c, d);
    m.idx.push(B + a, B + b, B + c, B + b, B + d, B + c);
  }
  // rim wall around the outline: left edge (heel -> tip), tip row, right edge (tip -> heel), heel row
  const loop = [];
  for (let j = 0; j <= nv; j++) loop.push([0, j]);
  for (let i = 1; i <= nu; i++) loop.push([i, nv]);
  for (let j = nv - 1; j >= 0; j--) loop.push([nu, j]);
  for (let i = nu - 1; i >= 1; i--) loop.push([i, 0]);
  const L = loop.length;
  const base = m.vertexCount;
  for (let k = 0; k < L; k++) {
    const [i, j] = loop[k];
    const p = P[j * W + i], n = N[j * W + i];
    const nx = loop[(k + 1) % L], pv = loop[(k - 1 + L) % L];
    const tan = v3.norm(v3.sub(P[nx[1] * W + nx[0]], P[pv[1] * W + pv[0]]));
    let out = v3.cross(tan, n);
    if (v3.len(out) < 1e-9) out = [0, 0, 1];
    out = v3.norm(out);
    const s = -1 + (2 * i) / nu, t = j / nv;
    push(p, out, s, t);
    push(v3.sub(p, v3.mul(n, thick)), out, s, t);
    m.uv[m.uv.length - 4] = k * 0.002 / tile[0]; m.uv[m.uv.length - 3] = 0;
    m.uv[m.uv.length - 2] = k * 0.002 / tile[0]; m.uv[m.uv.length - 1] = thick / tile[1];
  }
  for (let k = 0; k < L; k++) {
    const a = base + 2 * k, b = base + 2 * ((k + 1) % L);
    m.idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { mesh: m, st };
}

/** split a mesh into two compacted meshes by a per-triangle predicate on its vertex indices */
export function splitTriangles(m, pred) {
  const out = [new MeshData(), new MeshData()];
  const remap = [new Map(), new Map()];
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    const k = pred(tri) ? 1 : 0;
    for (const v of tri) {
      let r = remap[k].get(v);
      if (r === undefined) {
        r = out[k].vertexCount;
        remap[k].set(v, r);
        out[k].pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
        out[k].nrm.push(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
        out[k].uv.push(m.uv[v * 2], m.uv[v * 2 + 1]);
        out[k].dirt.push(m.dirt[v]); out[k].ao.push(m.ao[v]);
      }
      out[k].idx.push(r);
    }
  }
  return out;
}

/**
 * Engraved / etched depth marks on a blade face: short strips across the blade at the given t values,
 * lifted a hair off the surface. marks: [{ t, s0, s1 }] (s range of each strip), width in metres.
 */
export function marks(surf, list, { width = 0.0006, lift = 0.00008, n = 6 } = {}) {
  const m = new MeshData();
  for (const { t, s0, s1 } of list) {
    const base = m.vertexCount;
    // dt for the requested physical width
    const p0 = surf((s0 + s1) / 2, t), p1 = surf((s0 + s1) / 2, Math.min(1, t + 0.001));
    const dt = (width / Math.max(1e-6, v3.len(v3.sub(p1, p0)))) * 0.001;
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      for (const tt of [t - dt / 2, t + dt / 2]) {
        const p = surf(s, tt);
        const a = surf(s + 0.01, tt), b = surf(s, tt + 0.001);
        const nn = v3.norm(v3.cross(v3.sub(b, p), v3.sub(a, p)));
        m.pos.push(...v3.add(p, v3.mul(nn, lift))); m.nrm.push(...nn); m.uv.push(k / n, 0); m.dirt.push(0.3); m.ao.push(0.9);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = base + 2 * k;
      m.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  return m;
}
