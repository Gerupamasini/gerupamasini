// Geometry helpers for the hand-net builder: parametric grids (lathe, sweep, free surfaces) with
// numeric normals, physical-scale UVs (metres / tile), and simple 4x4 transforms.
//
// Conventions (all nets): metres, +Y up, +Z toward the hoop, +X to the right of the handle.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- vectors
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// ---------------------------------------------------------------- matrices (column-major like glTF)
export const m4 = {
  identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  translate: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scale: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rotX: (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  mul: (a, b) => {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  },
  chain: (...ms) => ms.reduce((acc, m) => m4.mul(acc, m)),
  point: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
  dir: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]],
};

/** quaternion [x, y, z, w] for a rotation of `a` radians about the unit axis */
export function quatAxis(axis, a) {
  const s = Math.sin(a / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)];
}

// ---------------------------------------------------------------- mesh container
/**
 * A triangle mesh with per-vertex position, normal, uv (metres / tile, may exceed 1), dirt (mud
 * propensity 0..1) and ao (baked cavity, 0..1).
 */
export class MeshData {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.dirt = []; this.ao = []; this.idx = [];
  }
  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this.idx.length / 3; }

  append(o) {
    const base = this.vertexCount;
    this.pos.push(...o.pos); this.nrm.push(...o.nrm); this.uv.push(...o.uv); this.dirt.push(...o.dirt); this.ao.push(...o.ao);
    for (const i of o.idx) this.idx.push(i + base);
    return this;
  }

  transform(m) {
    for (let i = 0; i < this.pos.length; i += 3) {
      const p = m4.point(m, [this.pos[i], this.pos[i + 1], this.pos[i + 2]]);
      const n = v3.norm(m4.dir(m, [this.nrm[i], this.nrm[i + 1], this.nrm[i + 2]]));
      this.pos[i] = p[0]; this.pos[i + 1] = p[1]; this.pos[i + 2] = p[2];
      this.nrm[i] = n[0]; this.nrm[i + 1] = n[1]; this.nrm[i + 2] = n[2];
    }
    return this;
  }

  /** f(p, n) -> {dirt?, ao?} evaluated per vertex (multiplies ao, maxes dirt) */
  shade(f) {
    for (let i = 0, k = 0; i < this.pos.length; i += 3, k++) {
      const r = f([this.pos[i], this.pos[i + 1], this.pos[i + 2]], [this.nrm[i], this.nrm[i + 1], this.nrm[i + 2]]);
      if (r.dirt !== undefined) this.dirt[k] = Math.max(this.dirt[k], r.dirt);
      if (r.ao !== undefined) this.ao[k] *= r.ao;
    }
    return this;
  }

  /** mass properties helper: signed volume of a closed mesh (m^3) */
  volume() {
    let v = 0;
    const P = this.pos;
    for (let t = 0; t < this.idx.length; t += 3) {
      const a = this.idx[t] * 3, b = this.idx[t + 1] * 3, c = this.idx[t + 2] * 3;
      v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    return Math.abs(v);
  }

  centroid() {
    const c = [0, 0, 0];
    const n = this.vertexCount || 1;
    for (let i = 0; i < this.pos.length; i += 3) { c[0] += this.pos[i]; c[1] += this.pos[i + 1]; c[2] += this.pos[i + 2]; }
    return v3.mul(c, 1 / n);
  }

  arrays() {
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nrm),
      uv: new Float32Array(this.uv),
      indices: this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
      dirt: new Float32Array(this.dirt),
      ao: new Float32Array(this.ao),
    };
  }
}

// ---------------------------------------------------------------- grids
/**
 * Build a (nu+1) x (nv+1) vertex grid. posFn(i, j) -> [x,y,z]; i = 0..nu (i = nu duplicates i = 0 when
 * closedU so the uv seam can jump), j = 0..nv. Normals are central differences (wrapping in u when
 * closedU); degenerate rows (poles) borrow the neighbouring row's normal. flip reverses winding.
 * uvFn(i, j, P) -> [u, v]. When uvFn is 'arc', uv = arc length (metres) / tile [tu, tv].
 */
export function grid({ nu, nv, closedU = true, closedV = false, posFn, uvFn, tile = [0.05, 0.05], flip = false, uOffset = 0 }) {
  const W = nu + 1, H = nv + 1;
  const P = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) P[j * W + i] = (closedU && i === nu) ? null : posFn(i, j);
  if (closedU) for (let j = 0; j < H; j++) P[j * W + nu] = P[j * W];
  const at = (i, j) => {
    if (closedU) i = ((i % nu) + nu) % nu; else i = clamp(i, 0, nu);
    if (closedV) j = ((j % nv) + nv) % nv; else j = clamp(j, 0, nv);
    return P[j * W + i];
  };
  const N = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const du = v3.sub(at(i + 1, j), at(i - 1, j));
    const dv = v3.sub(at(i, j + 1), at(i, j - 1));
    let n = v3.cross(du, dv);
    N[j * W + i] = v3.len(n) < 1e-14 ? null : v3.norm(flip ? v3.mul(n, -1) : n);
  }
  // fill degenerate normals from the nearest valid row
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (N[j * W + i]) continue;
    for (let d = 1; d < H; d++) {
      const a = N[clamp(j + d, 0, H - 1) * W + i] ? clamp(j + d, 0, H - 1) : N[clamp(j - d, 0, H - 1) * W + i] ? clamp(j - d, 0, H - 1) : -1;
      if (a >= 0) {
        // a pole: average the ring's normals for a single direction
        let acc = [0, 0, 0];
        for (let k = 0; k < nu; k++) acc = v3.add(acc, N[a * W + k] || [0, 0, 0]);
        N[j * W + i] = v3.norm(acc);
        break;
      }
    }
    if (!N[j * W + i]) N[j * W + i] = [0, 1, 0];
  }
  // uvs
  const UV = new Array(W * H);
  if (uvFn === 'arc') {
    // u: arc length around each row (centred on uOffset * row length); v: arc length down column i
    const rowLen = [];
    for (let j = 0; j < H; j++) {
      let s = 0; const acc = [0];
      for (let i = 1; i < W; i++) { s += v3.len(v3.sub(P[j * W + i], P[j * W + i - 1])); acc.push(s); }
      rowLen.push(acc);
    }
    const colLen = [];
    for (let i = 0; i < W; i++) {
      let s = 0; const acc = [0];
      for (let j = 1; j < H; j++) { s += v3.len(v3.sub(P[j * W + i], P[(j - 1) * W + i])); acc.push(s); }
      colLen.push(acc);
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const L = rowLen[j][W - 1];
      UV[j * W + i] = [(rowLen[j][i] - L * uOffset) / tile[0], colLen[i][j] / tile[1]];
    }
  } else {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) UV[j * W + i] = uvFn(i, j, P[j * W + i]);
  }
  const m = new MeshData();
  for (let k = 0; k < W * H; k++) {
    m.pos.push(...P[k]); m.nrm.push(...N[k]); m.uv.push(...UV[k]); m.dirt.push(0); m.ao.push(1);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (flip) m.idx.push(a, c, b, b, c, d); else m.idx.push(a, b, c, b, d, c);
  }
  m.W = W; m.H = H; m.P = P;
  return m;
}

/**
 * Surface of revolution about +Z. profile: [[z, r], ...] (r may be 0 at the ends to close them).
 * A profile point repeated twice makes a hard crease. rMod(a, z, r) optionally reshapes the radius
 * (knurls, hex flats, ribs). tile: [around, along] metres per texture repeat.
 */
export function lathe(profile, segs, { rMod = null, tile = [0.05, 0.05], rRef = null, phase = 0 } = {}) {
  // resolve creases: a repeated point splits the grid into separate strips joined at the crease
  const strips = [[]];
  for (let k = 0; k < profile.length; k++) {
    const p = profile[k];
    const prev = profile[k - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) { strips.push([p]); continue; }
    strips[strips.length - 1].push(p);
  }
  const out = new MeshData();
  const R = rRef ?? Math.max(...profile.map((p) => p[1]));
  let vOff = 0;
  for (const strip of strips) {
    if (strip.length < 2) continue;
    const sLen = [0];
    for (let k = 1; k < strip.length; k++) sLen.push(sLen[k - 1] + Math.hypot(strip[k][0] - strip[k - 1][0], strip[k][1] - strip[k - 1][1]));
    const g = grid({
      nu: segs, nv: strip.length - 1, closedU: true,
      posFn: (i, j) => {
        const a = (i / segs) * TAU + phase;
        const [z, r0] = strip[j];
        const r = rMod ? rMod(a, z, r0) : r0;
        return [Math.cos(a) * r, Math.sin(a) * r, z];
      },
      uvFn: (i, j) => [((i / segs) * TAU * R) / tile[0], (vOff + sLen[j]) / tile[1]],
      flip: false,
    });
    vOff += sLen[sLen.length - 1];
    out.append(g);
  }
  return out;
}

// ---------------------------------------------------------------- paths
export function bezier(p0, p1, p2, p3, n) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([0, 1, 2].map((c) => u * u * u * p0[c] + 3 * u * u * t * p1[c] + 3 * u * t * t * p2[c] + t * t * t * p3[c]));
  }
  return pts;
}

/** resample a polyline to n points evenly spaced by arc length (closed: last != first) */
export function resample(pts, n, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts;
  const s = [0];
  for (let k = 1; k < P.length; k++) s.push(s[k - 1] + v3.len(v3.sub(P[k], P[k - 1])));
  const L = s[s.length - 1];
  const out = [];
  const count = closed ? n : n;
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const t = closed ? (k / n) * L : (k / (n - 1)) * L;
    while (seg < s.length - 2 && s[seg + 1] < t) seg++;
    const f = (t - s[seg]) / Math.max(1e-12, s[seg + 1] - s[seg]);
    out.push(v3.lerp(P[seg], P[seg + 1], clamp(f)));
  }
  out.length_m = L;
  return out;
}

export function pathLength(pts, closed = false) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += v3.len(v3.sub(pts[k], pts[k - 1]));
  if (closed) L += v3.len(v3.sub(pts[0], pts[pts.length - 1]));
  return L;
}

export function tangents(pts, closed = false) {
  const n = pts.length;
  return pts.map((p, k) => {
    const a = closed ? pts[(k - 1 + n) % n] : pts[Math.max(0, k - 1)];
    const b = closed ? pts[(k + 1) % n] : pts[Math.min(n - 1, k + 1)];
    return v3.norm(v3.sub(b, a));
  });
}

/**
 * Sweep a closed 2D profile along a path. The frame at each point is T (tangent), side = T x up,
 * and the profile's [x, y] map to side * x + upv * y where upv = side x T (so y follows `up`).
 * upFn(k) can override `up` per point (for non-planar paths). Profile is counter-clockwise.
 * uv: u around the profile (metres / tile[0]), v along the path (metres / tile[1]).
 */
export function sweep(path, profile, { closed = false, up = [0, 1, 0], upFn = null, tile = [0.01, 0.05], scaleFn = null, capEnds = false } = {}) {
  const T = tangents(path, closed);
  const n = path.length;
  const np = profile.length;
  const sAlong = [0];
  for (let k = 1; k < n; k++) sAlong.push(sAlong[k - 1] + v3.len(v3.sub(path[k], path[k - 1])));
  const sProf = [0];
  for (let k = 1; k <= np; k++) sProf.push(sProf[k - 1] + Math.hypot(profile[k % np][0] - profile[k - 1][0], profile[k % np][1] - profile[k - 1][1]));
  const frame = (k) => {
    const u = upFn ? upFn(k) : up;
    let side = v3.cross(T[k], u);
    if (v3.len(side) < 1e-9) side = v3.cross(T[k], [1, 0, 0]);
    side = v3.norm(side);
    const upv = v3.norm(v3.cross(side, T[k]));
    return { side, upv };
  };
  const frames = path.map((_, k) => frame(k));
  const g = grid({
    nu: np, nv: closed ? n : n - 1, closedU: true, closedV: closed,
    posFn: (i, j) => {
      const k = j % n;
      const { side, upv } = frames[k];
      const s = scaleFn ? scaleFn(k / (n - 1), k) : 1;
      const [px, py] = profile[i % np];
      return v3.add(path[k], v3.add(v3.mul(side, px * s), v3.mul(upv, py * s)));
    },
    uvFn: (i, j) => [sProf[i] / tile[0], (j < n ? sAlong[j] : sAlong[n - 1] + v3.len(v3.sub(path[0], path[n - 1]))) / tile[1]],
    flip: true,
  });
  if (capEnds && !closed) {
    for (const [k, dirSign] of [[0, -1], [n - 1, 1]]) {
      const cap = new MeshData();
      const { side, upv } = frames[k];
      const s = scaleFn ? scaleFn(k / (n - 1), k) : 1;
      const c = path[k];
      const nn = v3.mul(T[k], dirSign);
      cap.pos.push(...c, ...profile.flatMap(([px, py]) => v3.add(c, v3.add(v3.mul(side, px * s), v3.mul(upv, py * s)))));
      for (let q = 0; q <= np; q++) { cap.nrm.push(...nn); cap.dirt.push(0); cap.ao.push(1); }
      cap.uv.push(0, 0, ...profile.flatMap(([px, py]) => [px / tile[0], py / tile[0]]));
      for (let q = 0; q < np; q++) {
        const a = 1 + q, b = 1 + ((q + 1) % np);
        if (dirSign > 0) cap.idx.push(0, b, a); else cap.idx.push(0, a, b);
      }
      g.append(cap);
    }
  }
  return g;
}

export const circleProfile = (r, n, ry = r) => Array.from({ length: n }, (_, k) => [Math.cos((k / n) * TAU) * r, Math.sin((k / n) * TAU) * ry]);

/** a torus-like ring of a tube along a circle in the plane perpendicular to `axis` */
export function ring(center, axis, R, r, nu, nv, tile = [0.01, 0.05]) {
  const a = v3.norm(axis);
  const t0 = v3.norm(Math.abs(a[1]) < 0.9 ? v3.cross(a, [0, 1, 0]) : v3.cross(a, [1, 0, 0]));
  const t1 = v3.cross(a, t0);
  const path = Array.from({ length: nv }, (_, k) => { const q = (k / nv) * TAU; return v3.add(center, v3.add(v3.mul(t0, Math.cos(q) * R), v3.mul(t1, Math.sin(q) * R))); });
  return sweep(path, circleProfile(r, nu), { closed: true, up: a, tile });
}
