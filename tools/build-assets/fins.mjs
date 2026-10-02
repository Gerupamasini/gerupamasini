// Fin geometry + fin atlas texture generator for the Yamame model.  Pure functions, no three.js, no I/O.
// Contract: docs/yamame/impl/CONTRACT.md §1 (coordinates), §3 (colour spaces), §5.2 (interface).
//   buildFins({ surface, params, genome, seed }) -> { geometry, ranges, textures, report }
//
// Coordinates: metres, +X = forward (snout), +Y = up, +Z = right; body-local origin at s = s_origin.
// Spec sources: 02_形態仕様 §2.5 (origin s / base / height / rays / shape), 03 §3.5.1/§3.5.4 (fin colours),
//   05 §5.1.2 (ray-group bones: pectoral 3, pelvic 2, dorsal 3, anal 2, caudal 5), 06 §6.5 (alpha compositing, no transmission).
// Values that are not in the sources are tagged [E] (engineering choice).
//
// Design summary
//  * Every ray-fin is ONE thin corrugated sheet parameterised by (t, r): t = 0 (leading edge) .. 1 (trailing edge) across the
//    ray fan, r = 0 (root) .. 1 (ray tip).  Each ray is a (slightly curved) polyline; the membrane between rays is a
//    Catmull-Rom blend of neighbouring rays, so the planform outline is smooth.  A pleat cos(2*pi*t*(n-1)) of 0.1-0.3 mm
//    makes each ray a ridge; the distal margin is scalloped (V notches between ray tips) and wobbles; the leading ray
//    is a thin tapered tube (rounded front edge); the root is buried 0.4 mm in the body and covered by a fleshy "collar"
//    bump that is draped over the skin (alpha fades to 0 at its rim, so it blends into the body).
//  * The adipose fin is an opaque closed lobe; the caudal sheet overlaps the peduncle (outer rays start on the outline ahead of s = 1).
//  * Vertex attributes: _FINID (fin id), _FINT (0 leading .. 1 trailing), _FINR (0 root .. 1 tip).
export const FIN_IDS = { dorsal: 0, adipose: 1, pectoral_R: 2, pectoral_L: 3, pelvic_R: 4, pelvic_L: 5, anal: 6, caudal: 7 };

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MM = 1e-3;
const EMBED = 0.4 * MM;            // root buried in the body: CONTRACT §1 says 0.3-0.5 mm

// ----------------------------------------------------------------------------------------------- small math
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** smooth value noise in [-1,1] */
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y); const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (lerp(lerp(a, b, u), lerp(c, d, u), v)) * 2 - 1;
}
function fbm(x, y, seed, oct = 3) {
  let s = 0, a = 0.5, f = 1, norm_ = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f, seed + o * 101); norm_ += a; a *= 0.5; f *= 2.03; }
  return s / norm_;
}
function catmull(p0, p1, p2, p3, f) {
  const f2 = f * f, f3 = f2 * f;
  const a = -0.5 * f3 + f2 - 0.5 * f, b = 1.5 * f3 - 2.5 * f2 + 1, c = -1.5 * f3 + 2 * f2 + 0.5 * f, d = 0.5 * f3 - 0.5 * f2;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
}

// ----------------------------------------------------------------------------------------------- atlas layout
// 1024^2 atlas.  Each cell maps t -> x (0..w-1) and r -> y (0..h-1); root (r=0) at the top row.  Texel-centre mapping.
export const ATLAS_SIZE = 1024;
export const ATLAS_CELLS = {
  caudal:      { x: 8,   y: 8,   w: 496, h: 344 },
  dorsal:      { x: 520, y: 8,   w: 496, h: 344 },
  anal:        { x: 8,   y: 360, w: 368, h: 344 },
  pectoral:    { x: 384, y: 360, w: 368, h: 344 },
  pelvic:      { x: 760, y: 360, w: 256, h: 344 },
  adipose:     { x: 8,   y: 712, w: 168, h: 304 },
  col_dorsal:  { x: 184, y: 712, w: 144, h: 304 },
  col_pectoral:{ x: 336, y: 712, w: 144, h: 304 },
  col_pelvic:  { x: 488, y: 712, w: 144, h: 304 },
  col_anal:    { x: 640, y: 712, w: 144, h: 304 },
};
function cellUV(cell, t, r) {
  const W = ATLAS_SIZE;
  return [(cell.x + 0.5 + clamp(t, 0, 1) * (cell.w - 1)) / W, (cell.y + 0.5 + clamp(r, 0, 1) * (cell.h - 1)) / W];
}

// ----------------------------------------------------------------------------------------------- mesh accumulator
class Mesh {
  constructor() { this.p = []; this.n = []; this.uv = []; this.t = []; this.r = []; this.idx = []; }
  get nv() { return this.p.length; }
  vert(p, uv, t, r, n = null) { this.p.push(p); this.n.push(n); this.uv.push(uv); this.t.push(t); this.r.push(r); return this.p.length - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** area-weighted normals for vertices [v0, v1) from triangles [i0, i1) (indices array offset) */
  computeNormals(v0, v1, i0, i1) {
    const acc = new Array(v1 - v0).fill(0).map(() => [0, 0, 0]);
    for (let i = i0; i < i1; i += 3) {
      const a = this.idx[i], b = this.idx[i + 1], c = this.idx[i + 2];
      const fn = cross(sub(this.p[b], this.p[a]), sub(this.p[c], this.p[a]));
      for (const v of [a, b, c]) if (v >= v0 && v < v1) { const q = acc[v - v0]; q[0] += fn[0]; q[1] += fn[1]; q[2] += fn[2]; }
    }
    for (let v = v0; v < v1; v++) if (!this.n[v]) this.n[v] = norm(acc[v - v0]);
  }
  /** flip winding of triangles [i0,i1) and negate stored normals for [v0,v1) */
  flip(v0, v1, i0, i1) {
    for (let i = i0; i < i1; i += 3) { const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t; }
    for (let v = v0; v < v1; v++) if (this.n[v]) this.n[v] = mul(this.n[v], -1);
  }
  mirrorZ() {
    for (let v = 0; v < this.nv; v++) { this.p[v] = [this.p[v][0], this.p[v][1], -this.p[v][2]]; if (this.n[v]) this.n[v] = [this.n[v][0], this.n[v][1], -this.n[v][2]]; }
    for (let i = 0; i < this.idx.length; i += 3) { const t = this.idx[i + 1]; this.idx[i + 1] = this.idx[i + 2]; this.idx[i + 2] = t; }
  }
}

// ----------------------------------------------------------------------------------------------- body helpers
function makeBody(surface) {
  const SL = surface.SL;
  const nD = surface.params.section.exponent_dorsal.v, nV = surface.params.section.exponent_ventral.v;
  /** local frame on the skin: point, outward normal, d/ds (towards the tail), d/dalpha */
  function frame(s, a) {
    const ds = 2e-4, da = 2e-3;
    const P = surface.point(s, a), N = surface.normal(s, a);
    const Ps = mul(sub(surface.point(s + ds, a), surface.point(s - ds, a)), 1 / (2 * ds));
    const Pa = mul(sub(surface.point(s, a + da), surface.point(s, a - da)), 1 / (2 * da));
    return { P, N, Ps, Pa };
  }
  /** alpha of the skin point at lateral offset z (m, signed, + right) next to the dorsal (ventral=false) or ventral midline */
  function alphaForZ(s, z, ventral) {
    const sec = surface.section(clamp(s, 0, 1)); const w = sec.w * SL; const n = ventral ? nV : nD;
    const q = clamp(Math.abs(z) / w, 0, 1); const a0 = Math.asin(Math.pow(q, n / 2));
    const sg = z >= 0 ? 1 : -1;
    return ventral ? Math.PI - sg * a0 : sg * a0;
  }
  /** implicit body function: < 1 inside the loft, 1 on the skin */
  function inside(Pt) {
    const s = clamp(surface.xToS(Pt[0]), 0, 1); const sec = surface.section(s);
    const yy = (Pt[1] - sec.c * SL) / (sec.h * SL); const zz = Pt[2] / (sec.w * SL);
    const n = yy >= 0 ? nD : nV;
    return Math.pow(Math.abs(yy), n) + Math.pow(Math.abs(zz), n);
  }
  return { SL, frame, alphaForZ, inside, nD, nV };
}

// ----------------------------------------------------------------------------------------------- ray-fin specification
// A FinSpec has n rays; ray j: root B, unit direction D (in the fin plane), length L, in-plane curl kap (toward Cv),
// out-of-plane bend bnd (along Nf).  rayPoint(j, r) = B + L r D + 0.5 L kap r^2 S + L bnd r^2 Nf.
function rayPoint(F, j, r) {
  const q = F.rays[j];
  const r2 = r * r;
  return [
    q.B[0] + q.L * (r * q.D[0] + 0.5 * q.kap * r2 * q.S[0] + q.bnd * r2 * F.Nf[0]),
    q.B[1] + q.L * (r * q.D[1] + 0.5 * q.kap * r2 * q.S[1] + q.bnd * r2 * F.Nf[1]),
    q.B[2] + q.L * (r * q.D[2] + 0.5 * q.kap * r2 * q.S[2] + q.bnd * r2 * F.Nf[2]),
  ];
}
function finPoint(F, t, r) {
  const n = F.n; const jf = t * (n - 1);
  let j0 = Math.floor(jf); if (j0 > n - 2) j0 = n - 2; if (j0 < 0) j0 = 0;
  const f = jf - j0;
  return catmull(rayPoint(F, Math.max(j0 - 1, 0), r), rayPoint(F, j0, r), rayPoint(F, j0 + 1, r), rayPoint(F, Math.min(j0 + 2, n - 1), r), f);
}
function finishRays(F) {
  for (const q of F.rays) {
    const Cv = q.Cv || F.Cv;
    const c = sub(Cv, mul(q.D, dot(Cv, q.D)));
    q.S = norm(c);
  }
}
/** rescale ray lengths so that the extent along `axis` (or the chord length when axis=null) equals targets[j] */
function fitRays(F, targets, axis) {
  for (let j = 0; j < F.n; j++) {
    const q = F.rays[j]; q.L = 1;
    const tip = sub(rayPoint(F, j, 1), q.B);
    const ext = axis ? dot(tip, axis) : len(tip);
    q.L = targets[j] / Math.max(ext, 1e-6);
  }
}
const edgeWobble = (F, t) => F.wob * (0.5 + 0.5 * fbm(t * F.wobFreq + 3.7, 0.5, F.seed + 11, 3));
/** r at which the membrane ends for column t (V notches between ray tips, wobble, damage bites) */
function columnEnd(F, t) {
  const jf = t * (F.n - 1);
  let e = 1 - edgeWobble(F, t);
  if (F.lod.notch) {
    const nv = 0.5 - 0.5 * Math.cos(TAU * jf);               // 0 on a ray, 1 between rays
    const nv2 = 0.5 - 0.5 * Math.cos(2 * TAU * jf + 1.3);     // finer irregular notches (branch tips) [E]
    e -= F.notch * Math.pow(nv, 1.25) + F.notch2 * nv2 * (0.4 + 0.6 * hash2(Math.floor(jf), 7, F.seed));
  }
  for (const b of F.bites) { const d = Math.abs(t - b.t) / b.w; if (d < 1) e -= b.depth * 0.5 * (1 + Math.cos(Math.PI * d)); }
  return clamp(e, 0.2, 1);
}
/** pleat (ray = ridge) + gentle warp, displacement along Nf in metres.  The pleat is only meshed at detail >= ~0.5; the normal map always carries it. */
function reliefAt(F, t, r) {
  const jf = t * (F.n - 1);
  const env = sstep(0.05, 0.22, r) * (1 - 0.6 * sstep(0.45, 1.0, r));
  let pleat = 0;
  if (F.lod.pleat) {
    const bb = sstep(0.6, 0.95, r) * 0.5;                      // rays divide near the tip: the pleat frequency doubles [E]
    const ridge = (1 - bb) * Math.cos(TAU * jf) + bb * Math.cos(2 * TAU * jf);
    const lead = 1 + F.leadBoost * Math.exp(-Math.pow(jf / 0.45, 2)) + F.trailBoost * Math.exp(-Math.pow((F.n - 1 - jf) / 0.45, 2));
    // keep the pleat slope moderate where the ray pitch is small: amplitude <= 0.14 * pitch   [E]
    pleat = Math.min(F.amp, 0.14 * F.pitchAt(r)) * env * ridge * lead;
  }
  const warp = F.warp * sstep(0.1, 0.5, r) * r * fbm(t * F.warpFreq, r * 0.9 + 4.1, F.seed + 29, 2);
  return pleat + warp;
}
/** tabulate the ray pitch (chord / (n-1)) along r so that the pleat amplitude can follow it */
function prepFin(F) {
  const N = 24; const tab = [];
  for (let i = 0; i <= N; i++) { const r = i / N; tab.push(len(sub(finPoint(F, 1, r), finPoint(F, 0, r))) / (F.n - 1)); }
  F.pitchAt = (r) => { const x = clamp(r, 0, 1) * N; const i = Math.min(Math.floor(x), N - 1); return Math.max(lerp(tab[i], tab[i + 1], x - i), 0.2 * MM); };
  return F;
}

// ----------------------------------------------------------------------------------------------- sheet / tube / collar builders
function addSheet(M, F, nc, rows) {
  const n = F.n; const cell = ATLAS_CELLS[F.cell];
  const v0 = M.nv, i0 = M.idx.length;
  const colEnd = [];
  for (let c = 0; c < nc; c++) {
    const t = c / (nc - 1); const e = columnEnd(F, t); colEnd.push(e);
    for (let k = 0; k <= rows; k++) {
      const r = (k / rows) * e;
      let p = finPoint(F, t, r);
      const d = reliefAt(F, t, r);
      p = madd(p, F.Nf, d);
      if (F.clearance) p = F.clearance(p, r);
      M.vert(p, cellUV(cell, t, r), t, r);
    }
  }
  const idx = (c, k) => v0 + c * (rows + 1) + k;
  for (let c = 0; c < nc - 1; c++) for (let k = 0; k < rows; k++) {
    const a = idx(c, k), b = idx(c + 1, k), cc = idx(c + 1, k + 1), d = idx(c, k + 1);
    // alternate the diagonal for a symmetric look
    if ((c + k) & 1) { M.tri(a, b, cc); M.tri(a, cc, d); } else { M.tri(a, b, d); M.tri(b, cc, d); }
  }
  // orient so the geometric normal points to +Nf
  const mid = Math.floor(nc / 2), kk = Math.floor(rows / 2);
  const pa = M.p[idx(mid, kk)], pb = M.p[idx(Math.min(mid + 1, nc - 1), kk)], pc = M.p[idx(mid, Math.min(kk + 1, rows))];
  const fn = cross(sub(pb, pa), sub(pc, pa));
  const flipped = dot(fn, F.Nf) < 0;
  M.computeNormals(v0, M.nv, i0, M.idx.length);
  if (flipped) M.flip(v0, M.nv, i0, M.idx.length);
  // the winding must stay consistent with the quad ordering, so if flipped, normals were flipped as well
  F.colEnd = colEnd;
  return { v0, v1: M.nv, nc, rows };
}

function addTube(M, F, j, rad0, rows, sides = 4) {
  const t = j / (F.n - 1); const cell = ATLAS_CELLS[F.cell];
  const e = columnEnd(F, t);
  const rings = [];
  const pts = [];
  for (let k = 0; k <= rows; k++) {
    const r = lerp(0.015, e * 0.985, k / rows);
    let p = finPoint(F, t, r); p = madd(p, F.Nf, reliefAt(F, t, r)); if (F.clearance) p = F.clearance(p, r);
    pts.push({ p, r });
  }
  for (let k = 0; k <= rows; k++) {
    const T = norm(sub(pts[Math.min(k + 1, rows)].p, pts[Math.max(k - 1, 0)].p));
    const e1 = norm(sub(F.Nf, mul(T, dot(F.Nf, T)))); const e2 = cross(T, e1);
    const rad = Math.max(0.05 * MM, rad0 * (1 - 0.72 * pts[k].r)) * (k === rows ? 0.4 : 1);
    const ring = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU; const nn = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)));
      ring.push(M.vert(madd(pts[k].p, nn, rad), cellUV(cell, t, pts[k].r), t, pts[k].r, nn));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rows; k++) for (let s = 0; s < sides; s++) {
    const a = rings[k][s], b = rings[k][(s + 1) % sides], c = rings[k + 1][(s + 1) % sides], d = rings[k + 1][s];
    M.tri(a, b, c); M.tri(a, c, d);
  }
  // tip cap
  const tipP = madd(pts[rows].p, norm(sub(pts[rows].p, pts[rows - 1].p)), 0.1 * MM);
  const apex = M.vert(tipP, cellUV(cell, t, pts[rows].r), t, pts[rows].r, norm(sub(pts[rows].p, pts[rows - 1].p)));
  for (let s = 0; s < sides; s++) M.tri(rings[rows][s], rings[rows][(s + 1) % sides], apex);
  // outward winding check (normal of first quad vs stored radial normal)
  const a = rings[2][0], b = rings[2][1], d = rings[3][0];
  const fn = cross(sub(M.p[b], M.p[a]), sub(M.p[d], M.p[a]));
  if (dot(fn, M.n[a]) < 0) { /* fix: reverse the triangles we just added */
    const tris = (rows * sides * 2 + sides) * 3; const i1 = M.idx.length;
    for (let i = i1 - tris; i < i1; i += 3) { const q = M.idx[i + 1]; M.idx[i + 1] = M.idx[i + 2]; M.idx[i + 2] = q; }
  }
}

/** Skin-hugging flesh bump around a fin root; rim sits 0.4 mm inside the skin with alpha 0 */
function addCollar(M, body, surface, C, attrs) {
  const nu = C.nu, nv = C.nv; const v0 = M.nv, i0 = M.idx.length; const cell = ATLAS_CELLS[C.cell];
  const SL = body.SL;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu; const shp = Math.pow(Math.max(1 - Math.pow(Math.abs(2 * u - 1), C.endPow ?? 2.4), 0), 0.75);
    for (let j = 0; j <= nv; j++) {
      const vv = (j / nv) * 2 - 1; const hw = C.hw(u);
      let s = C.s(u), a = C.a ? C.a(u) : 0;
      if (C.mode === 'dorsal') a = body.alphaForZ(s, vv * hw, false);
      else if (C.mode === 'ventral') a = body.alphaForZ(s, vv * hw, true);
      else if (C.mode === 'alpha') { const fr = body.frame(s, a); a += (vv * hw) / len(fr.Pa); }
      else if (C.mode === 's') { const fr = body.frame(s, a); s += (vv * hw) / len(fr.Ps); }
      const bump = shp * Math.pow(Math.max(1 - vv * vv, 0), 1.0);
      const off = -EMBED + (C.H + EMBED) * bump;
      M.vert(surface.point(s, a, off), cellUV(cell, u, (vv + 1) / 2), u, 0);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = v0 + i * (nv + 1) + j, b = a + 1, c = a + nv + 2, d = a + nv + 1;
    M.tri(a, b, c); M.tri(a, c, d);
  }
  M.computeNormals(v0, M.nv, i0, M.idx.length);
  // outward: compare to body normal at the patch centre
  const mid = v0 + Math.floor(nu / 2) * (nv + 1) + Math.floor(nv / 2);
  const nb = surface.normal(C.s(0.5), C.a ? C.a(0.5) : (C.mode === 'ventral' ? Math.PI : 0));
  if (dot(M.n[mid], nb) < 0) M.flip(v0, M.nv, i0, M.idx.length);
}

// ----------------------------------------------------------------------------------------------- per-fin planforms
function makeCtx({ surface, params, genome, seed }) {
  const P = params ?? surface.params; const G = genome?.fins ?? {};
  const vary = G.variation ?? 1;
  const body = makeBody(surface);
  const rayCount = (k, d) => Math.round(genome?.fin_ray_count?.[k] ?? G.ray_count?.[k] ?? genome?.[`fin_ray_count_${k}`] ?? d);
  const damage = clamp(genome?.fin_damage ?? G.damage ?? 0, 0, 1);
  return { surface, P, G, genome: genome ?? {}, body, SL: surface.SL, vary, seed, rayCount, damage };
}
function makeBites(rng, damage, maxN) {
  const out = []; if (damage <= 0) return out;
  const nb = Math.min(maxN, Math.ceil(damage * 3));
  for (let i = 0; i < nb; i++) out.push({ t: 0.15 + 0.8 * rng(), w: 0.06 + 0.1 * rng() * (0.5 + damage), depth: damage * (0.18 + 0.3 * rng()) });
  return out;
}
function baseSpec(ctx, key, cellKey, n, seedOff, over = {}) {
  return Object.assign({
    key, cell: cellKey, n, seed: ctx.seed * 7919 + seedOff, rays: [], Cv: [0, 0, 1], Nf: [0, 0, 1],
    amp: 0.14 * MM, leadBoost: 0.9, trailBoost: 0, notch: 0.04, notch2: 0.012, wob: 0.014, wobFreq: 3.2,
    warp: 0.35 * MM, warpFreq: 2.2, bites: [], tubeRad: 0.27 * MM, tubes: [0],
  }, over);
}
const rngFor = (ctx, off) => mulberry32((ctx.seed * 1000003 + off * 7727) >>> 0);

function specDorsal(ctx) {
  const { surface, P, SL, vary } = ctx; const fp = P.fins.dorsal; const n = ctx.rayCount('dorsal', fp.rays);
  const rng = rngFor(ctx, 1); const F = baseSpec(ctx, 'dorsal', 'dorsal', n, 1, { amp: 0.15 * MM, notch: 0.022, notch2: 0.012, warp: 0.4 * MM, tubeRad: 0.3 * MM });
  F.bites = makeBites(rng, ctx.damage, 2);
  const tilt = (rng() - 0.5) * 2 * 2.2 * DEG * vary;            // fin leans slightly to one side [E]
  const A1 = [-1, 0, 0], A2 = [0, Math.cos(tilt), Math.sin(tilt)]; F.A1 = A1; F.A2 = A2; F.Nf = [0, -Math.sin(tilt), Math.cos(tilt)];
  F.Cv = A1;
  const thF = (44 + (rng() - 0.5) * 6 * vary) * DEG, thR = (60 + (rng() - 0.5) * 6 * vary) * DEG;   // rays lean back and fan out: ~44 deg at the front edge, ~60 deg at the rear [P: p049 dorsal crop]
  const H = fp.height * SL; const tgt = [];
  const bow = (rng() - 0.5) * 0.03 * vary;
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1); const s = fp.origin_s + fp.base_len * u;
    const th = lerp(thF, thR, Math.pow(u, 0.9));
    const e = u < 0.06 ? 0.93 + (u / 0.06) * 0.07 : 1 - 0.74 * Math.pow((u - 0.06) / 0.94, 1.45);   // tall front edge, low rear: convex distal margin [P: p049/p016]
    F.rays.push({ B: surface.point(s, 0, -EMBED), D: add(mul(A1, Math.sin(th)), mul(A2, Math.cos(th))), L: 1, kap: 0.2 + 0.1 * (rng() - 0.5) * vary, bnd: 0.03 + bow + 0.03 * (2 * u - 1) });
    tgt.push(H * e * (1 + 0.025 * (rng() - 0.5) * 2 * vary));
  }
  finishRays(F); fitRays(F, tgt, A2); prepFin(F);
  F.collar = { cell: 'col_dorsal', mode: 'dorsal', s: (u) => fp.origin_s - 0.004 + (fp.base_len + 0.008) * u, hw: (u) => 3.4 * MM * (0.55 + 0.45 * Math.sin(Math.PI * u)), H: 0.7 * MM };
  F.dims = { base_len: fp.base_len, height: fp.height, origin_s: fp.origin_s };
  return F;
}

function specAnal(ctx) {
  const { surface, P, SL, vary } = ctx; const fp = P.fins.anal; const n = ctx.rayCount('anal', fp.rays);
  const rng = rngFor(ctx, 2); const F = baseSpec(ctx, 'anal', 'anal', n, 2, { amp: 0.14 * MM, notch: 0.025, notch2: 0.012, warp: 0.4 * MM, tubeRad: 0.27 * MM });
  F.bites = makeBites(rng, ctx.damage * 0.4, 1);
  const tilt = (rng() - 0.5) * 2 * 2 * DEG * vary;
  const A1 = [-1, 0, 0], A2 = [0, -Math.cos(tilt), Math.sin(tilt)]; F.A1 = A1; F.A2 = A2; F.Nf = [0, Math.sin(tilt), Math.cos(tilt)]; F.Cv = A1;
  const thF = (56 + (rng() - 0.5) * 5 * vary) * DEG, thR = (60 + (rng() - 0.5) * 5 * vary) * DEG;   // longest ray 0.113-0.119 SL for 0.064 SL height => ~56 deg [P: r10 F-14]
  const H = fp.height * SL; const tgt = [];
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1); const s = fp.origin_s + fp.base_len * u;
    const th = lerp(thF, thR, Math.pow(u, 0.8));
    const e = u < 0.05 ? 0.94 + (u / 0.05) * 0.06 : 1 - 0.7 * Math.pow((u - 0.05) / 0.95, 1.25);
    F.rays.push({ B: surface.point(s, Math.PI, -EMBED), D: add(mul(A1, Math.sin(th)), mul(A2, Math.cos(th))), L: 1, kap: 0.16 + 0.08 * (rng() - 0.5) * vary, bnd: 0.03 + 0.03 * (2 * u - 1) });
    tgt.push(H * e * (1 + 0.025 * (rng() - 0.5) * 2 * vary));
  }
  finishRays(F); fitRays(F, tgt, A2); prepFin(F);
  F.collar = { cell: 'col_anal', mode: 'ventral', s: (u) => fp.origin_s - 0.004 + (fp.base_len + 0.008) * u, hw: (u) => 3.2 * MM * (0.55 + 0.45 * Math.sin(Math.PI * u)), H: 0.6 * MM };
  F.dims = { base_len: fp.base_len, height: fp.height, origin_s: fp.origin_s };
  return F;
}

function specPelvic(ctx, sideSeed) {
  const { surface, P, SL, vary, body } = ctx; const fp = P.fins.pelvic; const n = ctx.rayCount('pelvic', fp.rays);
  const rng = rngFor(ctx, 3 + sideSeed * 13); const F = baseSpec(ctx, 'pelvic', 'pelvic', n, 3 + sideSeed * 13, { amp: 0.13 * MM, notch: 0.02, notch2: 0.01, warp: 0.35 * MM, tubeRad: 0.26 * MM });
  F.bites = makeBites(rng, ctx.damage * 0.3, 1);
  const baseW = 0.03;                                              // base length along the belly [E: 02 gives only length]
  const aP = Math.PI - (0.55 + 0.04 * (rng() - 0.5) * vary);       // ventro-lateral attachment [E]
  const delta = (17 + 3 * (rng() - 0.5) * 2 * vary) * DEG;         // abduction of the fin plane from the belly [P: p049 slightly open]
  const A1 = [-1, 0, 0], A2 = [0, -Math.cos(delta), Math.sin(delta)]; F.A1 = A1; F.A2 = A2; F.Nf = [0, Math.sin(delta), Math.cos(delta)]; F.Cv = A2;
  const phF = (37 + 4 * (rng() - 0.5) * vary) * DEG, phR = (9 + 3 * (rng() - 0.5) * vary) * DEG; const tgt = [];
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1); const s = fp.origin_s + baseW * u; const ph = lerp(phF, phR, Math.pow(u, 0.9));
    const e = u < 0.08 ? 0.93 + (u / 0.08) * 0.07 : 1 - 0.6 * Math.pow((u - 0.08) / 0.92, 1.05);
    F.rays.push({ B: surface.point(s, aP, -EMBED), D: add(mul(A1, Math.cos(ph)), mul(A2, Math.sin(ph))), L: 1, kap: 0.12 + 0.06 * (rng() - 0.5) * vary, bnd: 0.035 + 0.03 * (2 * u - 1) });
    tgt.push(fp.length * SL * e * (1 + 0.03 * (rng() - 0.5) * 2 * vary));
  }
  finishRays(F); fitRays(F, tgt, null); prepFin(F);
  F.clearance = (p, r) => (r > 0.08 ? pushOut(body, p, 0.5 * MM) : p);
  F.collar = { cell: 'col_pelvic', mode: 'alpha', s: (u) => fp.origin_s - 0.004 + (baseW + 0.008) * u, a: () => aP, hw: (u) => 3.8 * MM * (0.55 + 0.45 * Math.sin(Math.PI * u)), H: 0.7 * MM };
  F.dims = { length: fp.length, origin_s: fp.origin_s };
  return F;
}

function specPectoral(ctx, sideSeed) {
  const { surface, P, SL, vary, body } = ctx; const fp = P.fins.pectoral; const n = ctx.rayCount('pectoral', fp.rays);
  const rng = rngFor(ctx, 4 + sideSeed * 17); const F = baseSpec(ctx, 'pectoral', 'pectoral', n, 4 + sideSeed * 17, { amp: 0.1 * MM, notch: 0.016, notch2: 0.01, warp: 0.45 * MM, tubeRad: 0.26 * MM, leadBoost: 1.0 });
  F.bites = makeBites(rng, ctx.damage, 2);
  // base: centre at 1/6 of the body depth above the belly line, runs down and slightly back; upper end at s = 0.258 [P: r10 F-14, 02 §2.5]
  const sec = surface.section(fp.origin_s); const baseH = 0.038 * SL;   // base height on the flank [E]
  const yTop = (sec.c - sec.h + (2 * sec.h) / 6) * SL + baseH / 2;
  const sOf = (u) => fp.origin_s + 0.006 * u;
  const aOf = (u) => surface.alphaAtHeight(sOf(u), yTop - baseH * u);
  const uC = 0.5; const fr = body.frame(sOf(uC), aOf(uC));
  const Tr = norm(fr.Ps), N = fr.N;
  const Dn = norm(sub(sub(fr.Pa, mul(Tr, dot(fr.Pa, Tr))), mul(N, dot(fr.Pa, N))));
  const abd = (16 + 4 * (rng() - 0.5) * 2 * vary) * DEG;            // resting abduction: slightly open from the flank [task: 体側に少し開いた休止姿勢]
  const A1 = norm(add(mul(Tr, Math.cos(abd)), mul(N, Math.sin(abd)))), A2 = Dn;
  F.A1 = A1; F.A2 = A2; F.Nf = norm(cross(A1, A2)); if (dot(F.Nf, N) < 0) F.Nf = mul(F.Nf, -1); F.Cv = A2;
  const psT = (-5 + 3 * (rng() - 0.5) * vary) * DEG, psB = (21 + 4 * (rng() - 0.5) * vary) * DEG; const tgt = [];
  const prof = [[0, 0.88], [0.08, 0.97], [0.2, 1.0], [0.4, 0.97], [0.6, 0.86], [0.8, 0.68], [0.92, 0.55], [1, 0.45]];   // elongated blade, rounded tip [P: r10 F-12 細長く先端が丸い]
  const ev = (u) => { for (let i = 0; i < prof.length - 1; i++) if (u <= prof[i + 1][0]) return lerp(prof[i][1], prof[i + 1][1], sstep(prof[i][0], prof[i + 1][0], u)); return prof[prof.length - 1][1]; };
  for (let j = 0; j < n; j++) {
    const u = j / (n - 1); const ps = lerp(psT, psB, Math.pow(u, 1.0));
    F.rays.push({ B: surface.point(sOf(u), aOf(u), -EMBED), D: add(mul(A1, Math.cos(ps)), mul(A2, Math.sin(ps))), L: 1, kap: 0.1 + 0.08 * (rng() - 0.5) * vary, bnd: 0.05 + 0.04 * (2 * u - 1) * 0.5 - 0.03 * Math.sin(Math.PI * u) });
    tgt.push(fp.length * SL * ev(u) * (1 + 0.03 * (rng() - 0.5) * 2 * vary));
  }
  finishRays(F); fitRays(F, tgt, null); prepFin(F);
  F.clearance = (p, r) => (r > 0.06 ? pushOut(body, p, 0.5 * MM) : p);
  F.collar = { cell: 'col_pectoral', mode: 's', s: sOf, a: aOf, hw: (u) => 3.8 * MM * (0.6 + 0.4 * Math.sin(Math.PI * u)), H: 0.8 * MM };
  F.dims = { length: fp.length, origin_s: fp.origin_s };
  return F;
}

function specCaudal(ctx) {
  const { surface, P, SL, vary } = ctx; const fp = P.fins.caudal; const n = ctx.rayCount('caudal', fp.principal_rays);
  const rng = rngFor(ctx, 5); const F = baseSpec(ctx, 'caudal', 'caudal', n, 5, { amp: 0.13 * MM, notch: 0.02, notch2: 0.012, warp: 0.55 * MM, tubeRad: 0.24 * MM, leadBoost: 0.8, trailBoost: 0.8, tubes: [0, n - 1] });
  F.bites = makeBites(rng, ctx.damage * 0.5, 1);
  F.A1 = [-1, 0, 0]; F.A2 = [0, 1, 0]; F.Nf = [0, 0, 1]; F.Cv = [0, 1, 0];
  // The fin sheet overlaps the peduncle: the outer rays start on the dorsal / ventral outline well ahead of s = 1 (procurrent rays),
  // the inner rays start 2-3 mm inside the body, so the peduncle outline flows into the fin margins without a cuff. [task: 基部は尾柄に被さる]
  const sR = 0.985;
  const rootOf = (v) => {
    const s_ = sR - 0.027 * Math.pow(Math.abs(v), 3);
    const sec = surface.section(s_);
    return [surface.sToX(s_), (sec.c + v * sec.h) * SL - Math.sign(v) * EMBED * Math.pow(Math.abs(v), 4), 0];
  };
  const xS1 = surface.sToX(1.0); const tipX = xS1 - fp.length * SL; const Yh = (fp.span * SL) / 2; const fork = fp.fork_depth * SL;
  const yC = surface.section(1).c * SL;
  const lobeU = 1 + 0.015 * (rng() - 0.5) * 2 * vary, lobeL = 1 + 0.015 * (rng() - 0.5) * 2 * vary;
  const twist = (rng() < 0.5 ? -1 : 1) * (0.02 + 0.02 * rng()) * vary; const cup = 0.02 + 0.02 * rng();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1); const v = 1 - 2 * u;                     // +1 upper lobe .. -1 lower lobe
    const g = Math.pow(Math.max(1 - Math.pow(Math.abs(v), 2.2), 0), 1.4);
    const lobe = v > 0 ? lobeU : lobeL;
    const tip = [tipX + fork * g + 0.012 * SL * Math.pow(sstep(0.78, 1, Math.abs(v)), 1.5), yC + Yh * v * lobe, 0];   // rounded lobe tips
    const root = rootOf(v);
    const kap = 0.2 * Math.pow(Math.abs(v), 1.6) + 0.02 * (rng() - 0.5), bnd = cup * (v * v - 0.35) + twist * v + 0.01 * (rng() - 0.5), Cv = [0, v >= 0 ? 1 : -1, 0];
    // choose D and L so that the curved ray still ends exactly at `tip` (in the fin plane)
    let d = sub(tip, root), L = len(d), D = norm(d);
    for (let it = 0; it < 3; it++) {
      const S = norm(sub(Cv, mul(D, dot(Cv, D))));
      d = sub(sub(tip, root), mul(S, 0.5 * kap * L)); L = len(d); D = norm(d);
    }
    F.rays.push({ B: root, D, L, kap, bnd, Cv });
  }
  finishRays(F); prepFin(F);
  F.collar = null;
  F.dims = { length: fp.length, span: fp.span, fork_depth: fp.fork_depth, origin_s: 1.0 };
  return F;
}

/** push a point outside the body by a clearance (metres); used for the paired fins that lie against the flank */
function pushOut(body, p, clr) {
  const f = body.inside(p);
  if (f >= 1.02) return p;
  // find the smallest |z| at which the section function reaches 1 + clearance (numerically)
  const sgn = p[2] >= 0 ? 1 : -1; let lo = Math.abs(p[2]), hi = Math.abs(p[2]) + 0.02;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (body.inside([p[0], p[1], sgn * m]) < 1.02) lo = m; else hi = m; }
  return [p[0], p[1], sgn * Math.max(Math.abs(p[2]), hi + clr * 0.5)];
}

// ----------------------------------------------------------------------------------------------- adipose fin
function buildAdiposeMesh(ctx, lod) {
  const { surface, P, SL, vary, body } = ctx; const fp = P.fins.adipose; const rng = rngFor(ctx, 6);
  const M = new Mesh(); const cell = ATLAS_CELLS.adipose;
  const nu = lod.adipose[0], nphi = lod.adipose[1]; const H = fp.height * SL;
  const lean = (0.5 + 0.15 * (rng() - 0.5) * 2 * vary);            // laid back (p049) .. upright (p016) [P: r10 F-13]
  const W0 = 1.3 * MM;                                             // half-thickness at the base: a fleshy lobe, not a plate [E]
  const shape = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.8);
  const rows = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu; const s = fp.origin_s + fp.base_len * u; const sh = i === 0 || i === nu ? 0 : shape(u);
    const hh = H * sh * (1 + 0.04 * vnoise(u * 5, 1.3, ctx.seed + 3)); const ww = W0 * Math.pow(sh, 0.75);
    const top = surface.point(s, 0)[1];
    const row = [];
    for (let j = 0; j <= nphi; j++) {
      const phi = (Math.PI * j) / nphi; const z = ww * Math.cos(phi); const yUp = hh * Math.sin(phi);
      const a = body.alphaForZ(s, z, false); const yb = surface.point(s, a, -0.5 * MM)[1];
      const x = surface.sToX(s) - (lean * yUp + 0.4 * yUp * yUp / H);
      const nn = null;
      row.push(M.vert([x, yb + yUp, z], cellUV(cell, u, j / nphi), u, sh > 0 ? Math.sin(phi) * sh : 0, nn));
    }
    rows.push(row);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nphi; j++) { const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j]; M.tri(a, b, c); M.tri(a, c, d); }
  M.computeNormals(0, M.nv, 0, M.idx.length);
  // outward = away from the axis at the lobe top
  const mid = rows[Math.floor(nu / 2)][Math.floor(nphi / 2)];
  if (M.n[mid][1] < 0) M.flip(0, M.nv, 0, M.idx.length);
  return { M, dims: { base_len: fp.base_len, height: fp.height, origin_s: fp.origin_s } };
}

// ----------------------------------------------------------------------------------------------- texture synthesis
// All colours below are sRGB 0..255 of the fin's own albedo (alpha-composited by the renderer).  They are brighter /
// more saturated than the 03 §3.5.1 medians because those were measured through the translucent membrane over a background
// (bg_contaminated) [03 §3.5.1 note].
const rgb = (r, g, b) => [r, g, b];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function texSpecs(ctx, finSpecs) {
  const G = ctx.G; const we = Object.assign({ pelvic: 0.8, anal: 0.8, dorsal: 0, pectoral: 0 }, G.white_edge ?? {});   // [06 §6.5: white edge probabilistic; default individual shows pelvic/anal white]
  const sat = G.caudal_margin_sat ?? ctx.genome.caudal_margin_sat ?? 0.3;                                          // [03 §3.4.3 caudal_margin_sat]
  const mk = (kind, F, extra) => {
    const rb = []; const rng = mulberry32(ctx.seed * 31 + kind.length * 17);
    for (let j = 0; j < F.n; j++) rb.push((kind === 'caudal' ? 0.28 : 0.42) + 0.3 * rng());
    return Object.assign({ kind, n: F.n, rb, seed: ctx.seed + F.seed, cell: F.cell }, extra);
  };
  const T = {};
  T.dorsal = mk('dorsal', finSpecs.dorsal, { mem: rgb(132, 120, 110), ray: rgb(176, 160, 150), flesh: rgb(92, 82, 66), aMem: 0.4, aRay: 0.74, aBase: 0.86, ridgeH: 0.09, rough: 0.55, white: we.dorsal, dots: G.dorsal_dots ?? 1, rayTint: rgb(150, 110, 70), rayTintAmt: 0.0 });
  T.anal = mk('anal', finSpecs.anal, { mem: rgb(196, 186, 180), ray: rgb(230, 222, 214), flesh: rgb(176, 168, 156), aMem: 0.42, aRay: 0.74, aBase: 0.86, ridgeH: 0.09, rough: 0.52, white: we.anal, rayTint: rgb(214, 128, 78), rayTintAmt: 0.22 });
  T.pelvic = mk('pelvic', finSpecs.pelvic, { mem: rgb(194, 178, 160), ray: rgb(232, 220, 206), flesh: rgb(176, 168, 156), aMem: 0.44, aRay: 0.76, aBase: 0.86, ridgeH: 0.09, rough: 0.52, white: we.pelvic, rayTint: rgb(214, 128, 78), rayTintAmt: 0.22 });
  T.pectoral = mk('pectoral', finSpecs.pectoral, { mem: G.pectoral_color ?? rgb(222, 172, 82), ray: rgb(236, 196, 120), flesh: rgb(196, 176, 148), aMem: 0.5, aRay: 0.8, aBase: 0.88, ridgeH: 0.08, rough: 0.5, white: we.pectoral, rayTint: rgb(200, 120, 40), rayTintAmt: 0.0, leadDark: 0.45 });
  T.caudal = mk('caudal', finSpecs.caudal, { mem: rgb(134, 122, 112), ray: rgb(180, 166, 156), flesh: rgb(104, 96, 80), aMem: 0.42, aRay: 0.74, aBase: 0.9, ridgeH: 0.09, rough: 0.55, white: 0, sat: sat, orange: rgb(190, 100, 48) });
  return T;
}

/** evaluate one fin pixel at fin coordinates (t, r); w/l: physical size (m) of the cell */
function evalFinPixel(T, t, r, phys, out) {
  const n = T.n; const jf = t * (n - 1); const k = clamp(Math.round(jf), 0, n - 1); const d = jf - k;
  const rb = T.rb[k]; const sp = 0.3 * sstep(rb, 1.0, r); const sig = lerp(0.13, 0.08, r) * (0.8 + 0.4 * hash2(k, 3, T.seed));
  const dl = Math.abs(Math.abs(d) - sp); const rayFade = 1 - 0.4 * sstep(0.78, 1.0, r);
  const kvar = 0.85 + 0.3 * hash2(k, 5, T.seed);
  const ray = Math.exp(-Math.pow(dl / sig, 2)) * rayFade * kvar;
  // translucency noise (fine striations along the rays + slow mottling)
  const mott = 0.5 + 0.5 * fbm(t * 9, r * 5, T.seed + 3, 3);
  const stri = 0.5 + 0.5 * vnoise(jf * 3.1, r * 14, T.seed + 9);
  // root flesh -> membrane
  const rootW = 1 - sstep(0.0, 0.3, r);
  let col = mixc(T.mem, T.ray, ray * 0.6);
  col = mixc(col, T.flesh, rootW * 0.75);
  // gentle distal fading / darkening
  let a = lerp(T.aMem, T.aRay, ray);
  a *= 0.9 + 0.2 * mott; a *= 0.92 + 0.12 * stri;
  a = Math.max(a, T.aBase * (1 - sstep(0.0, 0.3, r)));
  const edge = sstep(0.8, 1.0, r); a *= 1 - 0.78 * edge;                        // margin and tip fade [06 §6.5 ④]
  a *= 1 - 0.3 * sstep(0.55, 1.0, Math.abs(t - 0.5) * 2) * sstep(0.5, 1.0, r);   // outer edges thinner
  let rough = T.rough - 0.07 * ray;
  const kind = T.kind;
  if (kind === 'dorsal') {
    col = mixc(col, rgb(70, 62, 52), 0.35 * sstep(0.6, 1.0, r) * (1 - ray) + 0.0);
    col = mixc(col, rgb(96, 84, 62), 0.4 * Math.exp(-Math.pow(t / 0.07, 2)) * (0.4 + 0.6 * sstep(0.1, 0.5, r)));          // darker leading edge
    // minute dark dots (0.3-0.6 mm) scattered over the lower 60 % of the membrane [03 §3.2.3, E]
    if (T.dots) {
      const gw = phys.w / (1.3 * MM), gl = phys.l / (1.3 * MM);
      const ti = t * gw, ri = r * gl; const cx = Math.floor(ti), cy = Math.floor(ri);
      let dm = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const ix = cx + ox, iy = cy + oy; const h0 = hash2(ix, iy, T.seed + 71); if (h0 > 0.22) continue;
        const px = ix + 0.2 + 0.6 * hash2(ix, iy, T.seed + 72), py = iy + 0.2 + 0.6 * hash2(ix, iy, T.seed + 73);
        const rad = (0.22 + 0.2 * hash2(ix, iy, T.seed + 74)) / 1.3;
        const dd = Math.hypot(ti - px, ri - py) / rad; if (dd < 1.4) dm = Math.max(dm, 1 - sstep(0.6, 1.4, dd));
      }
      const zone = sstep(0.0, 0.2, r) * (1 - sstep(0.62, 0.85, r));
      col = mixc(col, rgb(52, 44, 40), 0.75 * dm * zone); a = Math.max(a, 0.8 * dm * zone);
    }
    if (T.white > 0) col = mixc(col, rgb(228, 224, 214), T.white * sstep(0.7, 0.98, r) * Math.exp(-Math.pow(t / 0.25, 2)));
  } else if (kind === 'pectoral') {
    // amber, deeper at the base; olive-brown leading band on some individuals [03 §3.5.4]
    col = mixc(col, rgb(204, 132, 40), 0.35 * (1 - sstep(0, 0.6, r)));
    col = mixc(col, rgb(214, 190, 120), 0.35 * sstep(0.5, 1.0, r));
    col = mixc(col, rgb(128, 104, 56), T.leadDark * Math.exp(-Math.pow(t / 0.06, 2)) * (0.5 + 0.5 * sstep(0.05, 0.4, r)));
    if (T.white > 0) col = mixc(col, rgb(236, 232, 220), T.white * Math.exp(-Math.pow(t / 0.1, 2)));
  } else if (kind === 'pelvic' || kind === 'anal') {
    col = mixc(col, T.rayTint, T.rayTintAmt * ray * sstep(0.15, 0.8, r));
    if (T.white > 0) {
      const w = T.white * (Math.exp(-Math.pow(t / (kind === 'anal' ? 0.13 : 0.15), 2)) * (0.55 + 0.45 * sstep(0.1, 0.5, r)) + 0.55 * sstep(0.82, 0.97, r) * Math.exp(-Math.pow(t / 0.4, 2)));
      col = mixc(col, rgb(238, 235, 228), clamp(w, 0, 0.95)); a = lerp(a, Math.max(a, 0.78), clamp(w, 0, 1) * 0.8 * (1 - 0.5 * edge));
    }
  } else if (kind === 'caudal') {
    col = mixc(col, rgb(72, 64, 56), 0.4 * sstep(0.84, 1.0, r) * (1 - 0.5 * ray));                 // dark trailing margin
    col = mixc(col, rgb(100, 90, 80), 0.25 * (1 - sstep(0, 0.35, r)));
    // lower-lobe margin: weak orange-red [03 §3.4.3 caudal_margin_sat, 06 §6.5; photos 17/47]
    const lower = sstep(0.5, 0.97, t); const wgt = T.sat * 1.7;
    const ow = clamp(wgt * lower * (0.75 * sstep(0.5, 0.95, r) + 0.9 * Math.exp(-Math.pow((1 - t) / 0.05, 2)) * sstep(0.15, 0.6, r)), 0, 0.85);
    col = mixc(col, T.orange, ow); a = Math.max(a, a + ow * 0.12);
  }
  // rays are never fully clear: leading-edge ray is the thickest
  const lead = Math.exp(-Math.pow(t * (n - 1) / 0.5, 2)); a = Math.max(a, 0.82 * lead * (1 - 0.6 * edge));
  if (kind === 'caudal') a = Math.max(a, 0.8 * Math.exp(-Math.pow((1 - t) * (n - 1) / 0.5, 2)) * (1 - 0.6 * edge));
  // dark absorption on rays (ray lines visible "うっすら" [06 §1-9])
  const absorb = 1 - 0.06 * ray; col = [col[0] * absorb, col[1] * absorb, col[2] * absorb];
  // subtle lightness mottling
  const lm = 0.96 + 0.08 * mott; col = [col[0] * lm, col[1] * lm, col[2] * lm];
  out.r = col[0]; out.g = col[1]; out.b = col[2]; out.a = clamp(a, 0, 1);
  // ray ridge height (mm) for the normal map: narrow line on each ray, fades toward the tip
  const hr = T.ridgeH * Math.exp(-Math.pow(dl / (sig * 0.8), 2)) * sstep(0.0, 0.12, r) * (1 - 0.55 * sstep(0.5, 1.0, r)) * (0.85 + 0.3 * hash2(k, 6, T.seed));
  out.h = hr + 0.012 * vnoise(jf * 5, r * 30, T.seed + 17);
  out.rough = rough; out.ao = 1 - 0.28 * rootW - 0.07 * (1 - ray) * 0.6;
  return out;
}

function paintAtlas(ctx, T, physByCell, extra) {
  const W = ATLAS_SIZE, H = ATLAS_SIZE;
  const albedo = new Uint8Array(W * H * 4), normal = new Uint8Array(W * H * 4), orm = new Uint8Array(W * H * 4);
  // neutral defaults: transparent grey albedo, flat normal, AO 1, rough 0.6
  for (let i = 0; i < W * H; i++) { albedo[i * 4] = 128; albedo[i * 4 + 1] = 120; albedo[i * 4 + 2] = 108; albedo[i * 4 + 3] = 0; normal[i * 4] = 128; normal[i * 4 + 1] = 128; normal[i * 4 + 2] = 255; normal[i * 4 + 3] = 255; orm[i * 4] = 255; orm[i * 4 + 1] = 153; orm[i * 4 + 2] = 0; orm[i * 4 + 3] = 255; }
  const PAD = 4; const o = {};
  const put = (X, Y, c, a, nx, ny, nz, ao, ro) => {
    const i = (Y * W + X) * 4;
    albedo[i] = clamp(Math.round(c[0]), 0, 255); albedo[i + 1] = clamp(Math.round(c[1]), 0, 255); albedo[i + 2] = clamp(Math.round(c[2]), 0, 255); albedo[i + 3] = clamp(Math.round(a * 255), 0, 255);
    normal[i] = clamp(Math.round((nx * 0.5 + 0.5) * 255), 0, 255); normal[i + 1] = clamp(Math.round((ny * 0.5 + 0.5) * 255), 0, 255); normal[i + 2] = clamp(Math.round((nz * 0.5 + 0.5) * 255), 0, 255); normal[i + 3] = 255;
    orm[i] = clamp(Math.round(ao * 255), 0, 255); orm[i + 1] = clamp(Math.round(ro * 255), 0, 255); orm[i + 2] = 0; orm[i + 3] = 255;
  };
  for (const key of ['caudal', 'dorsal', 'anal', 'pectoral', 'pelvic']) {
    const cell = ATLAS_CELLS[key]; const Tk = T[key]; const phys = physByCell[key];
    const gw = cell.w + 2 * PAD, gh = cell.h + 2 * PAD;
    const hmap = new Float32Array(gw * gh);
    const data = new Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const t = clamp((gx - PAD) / (cell.w - 1), 0, 1), r = clamp((gy - PAD) / (cell.h - 1), 0, 1);
      const px = evalFinPixel(Tk, t, r, phys, {}); hmap[gy * gw + gx] = px.h; data[gy * gw + gx] = px;
    }
    const dx = phys.w / (cell.w - 1) / MM, dy = phys.l / (cell.h - 1) / MM;     // mm per texel
    for (let gy = 1; gy < gh - 1; gy++) for (let gx = 1; gx < gw - 1; gx++) {
      const X = cell.x - PAD + gx, Y = cell.y - PAD + gy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const hx = (hmap[gy * gw + gx + 1] - hmap[gy * gw + gx - 1]) / (2 * dx), hy = (hmap[(gy + 1) * gw + gx] - hmap[(gy - 1) * gw + gx]) / (2 * dy);
      // glTF: green = up in the image, so n.y = +dH/dy_img;  n.x = -dH/dx
      const nx = -hx * 1.4, ny = hy * 1.4, nz = 1; const il = 1 / Math.hypot(nx, ny, nz);
      const px = data[gy * gw + gx];
      put(X, Y, [px.r, px.g, px.b], px.a, nx * il, ny * il, nz * il, px.ao, px.rough);
    }
  }
  // opaque lobe (adipose) and collar swatches
  const fleshCells = [
    ['adipose', rgb(152, 150, 126), rgb(112, 108, 92), 1.0, 0.68, true],
    ['col_dorsal', rgb(104, 94, 76), rgb(96, 86, 70), 0.0, 0.62, false],
    ['col_pectoral', rgb(194, 176, 150), rgb(176, 156, 134), 0.0, 0.6, false],
    ['col_pelvic', rgb(190, 184, 170), rgb(176, 170, 156), 0.0, 0.6, false],
    ['col_anal', rgb(190, 184, 170), rgb(176, 170, 156), 0.0, 0.6, false],
  ];
  for (const [key, c0, c1, , ro, opaque] of fleshCells) {
    const cell = ATLAS_CELLS[key];
    for (let gy = -PAD; gy < cell.h + PAD; gy++) for (let gx = -PAD; gx < cell.w + PAD; gx++) {
      const X = cell.x + gx, Y = cell.y + gy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const uu = clamp(gx / (cell.w - 1), 0, 1), vv = clamp(gy / (cell.h - 1), 0, 1);
      const nz_ = vnoise(uu * 11, vv * 13, ctx.seed + 41) * 0.5 + vnoise(uu * 29, vv * 31, ctx.seed + 43) * 0.25;
      let col, a;
      if (opaque) {
        // adipose lobe: grey-cream, darker toward the base / lower flanks, lighter crest [03 §3.5.1: (137,137,110); 02: grey-cream]
        const crest = Math.pow(Math.sin(Math.PI * vv), 1.5); col = mixc(c1, c0, crest); a = 1;
        col = mixc(col, rgb(168, 164, 140), 0.25 * Math.exp(-Math.pow((uu - 0.4) / 0.25, 2)) * crest);
      } else {
        col = mixc(c1, c0, 0.5 + 0.5 * nz_);
        const dE = Math.hypot(2 * uu - 1, 2 * vv - 1);
        a = (1 - sstep(0.25, 1.0, dE)) * 0.9;
      }
      const m = 0.97 + 0.06 * nz_; col = [col[0] * m, col[1] * m, col[2] * m];
      put(X, Y, col, a, nz_ * 0.04, nz_ * 0.04, 1, 0.9 + 0.1 * (0.5 + nz_), ro);
    }
  }
  return {
    albedo: { width: W, height: H, data: albedo },
    normal: { width: W, height: H, data: normal },
    orm: { width: W, height: H, data: orm },
  };
}

// ----------------------------------------------------------------------------------------------- main entry
/** level of detail from the `detail` argument: 1 = LOD0 (~5k tris for all fins), 0.5 = LOD1 (~2k), 0.25 = LOD2 (~0.8k) */
function lodParams(d) {
  if (d >= 0.75) {      // LOD0: 2 columns per ray (ridge + valley => the pleat is in the mesh), leading-ray tubes, collars
    const x = Math.min(d, 2); const cpr = x >= 1.75 ? 4 : x >= 1.25 ? 3 : 2;
    return { cpr, rowsMul: 0.9 + 0.1 * x, sides: 4, tubeRowsMul: 1, collar: [Math.round(10 * x), 4], adipose: [Math.round(14 * x), 6], notch: true, pleat: true, stride: 1, name: 'LOD0' };
  }
  if (d >= 0.4) return { cpr: 2, rowsMul: 0.6, sides: 0, tubeRowsMul: 0, collar: [6, 3], adipose: [8, 4], notch: true, pleat: true, stride: 1, name: 'LOD1' };   // pleat only as a zig-zag; tubes dropped
  return { cpr: 1, rowsMul: 0.4, sides: 0, tubeRowsMul: 0, collar: null, adipose: [6, 3], notch: false, pleat: false, stride: 2, name: 'LOD2' };                  // ray-pair columns, no pleat / notch geometry
}

export function buildFins({ surface, params, genome = {}, seed = 1, detail = 1 } = {}) {
  const ctx = makeCtx({ surface, params, genome, seed });
  const { body, SL } = ctx;
  const lod = lodParams(detail);
  const specs = {
    dorsal: specDorsal(ctx), anal: specAnal(ctx), caudal: specCaudal(ctx),
    pectoral_R: specPectoral(ctx, 0), pectoral_L: specPectoral(ctx, 1), pelvic_R: specPelvic(ctx, 0), pelvic_L: specPelvic(ctx, 1),
  };
  for (const F of Object.values(specs)) F.lod = lod;
  const ROWS = { dorsal: 12, anal: 12, caudal: 14, pectoral_R: 10, pectoral_L: 10, pelvic_R: 9, pelvic_L: 9 };
  const rowsOf = (k) => Math.max(4, Math.round(ROWS[k] * lod.rowsMul));
  const colsOf = (F) => (lod.stride === 1 ? (F.n - 1) * lod.cpr + 1 : Math.max(4, Math.round((F.n - 1) / lod.stride) + 1));
  const out = { p: [], n: [], uv: [], id: [], t: [], r: [], idx: [] };
  const ranges = []; const finReports = {};
  const append = (name, id, M, extra = {}) => {
    const vBase = out.p.length; const iStart = out.idx.length;
    for (let v = 0; v < M.nv; v++) { out.p.push(M.p[v]); out.n.push(M.n[v]); out.uv.push(M.uv[v]); out.id.push(id); out.t.push(M.t[v]); out.r.push(M.r[v]); }
    for (const i of M.idx) out.idx.push(i + vBase);
    ranges.push({ name, id, start: iStart, count: out.idx.length - iStart, vertexStart: vBase, vertexCount: M.nv, ...extra });
    return vBase;
  };
  const rayFinNames = ['dorsal', 'anal', 'pectoral_R', 'pectoral_L', 'pelvic_R', 'pelvic_L', 'caudal'];
  const meshes = {};
  for (const name of rayFinNames) {
    const F = specs[name]; const M = new Mesh(); const rows = rowsOf(name);
    const sheet = addSheet(M, F, colsOf(F), rows);
    if (lod.sides > 0) for (const j of F.tubes) addTube(M, F, j, F.tubeRad, Math.max(4, Math.round(rows * 0.8 * lod.tubeRowsMul)), lod.sides);
    if (F.collar && lod.collar) addCollar(M, body, surface, Object.assign({ nu: lod.collar[0], nv: lod.collar[1] }, F.collar));
    // statistics measured on the sheet (right-side frame, before mirroring)
    F.stats = sheetStats(F, sheet, M, surface, SL);
    if (name.endsWith('_L')) M.mirrorZ();
    meshes[name] = M;
  }
  const ad = buildAdiposeMesh(ctx, lod);
  // draw order inside the geometry follows 06 §6.5: dorsal, adipose, pectoral R/L, pelvic R/L, anal, caudal  (ids 0..7)
  const order = ['dorsal', 'adipose', 'pectoral_R', 'pectoral_L', 'pelvic_R', 'pelvic_L', 'anal', 'caudal'];
  for (const name of order) {
    const id = FIN_IDS[name];
    if (name === 'adipose') { append(name, id, ad.M, { opaque: true }); finReports[name] = adiposeReport(ad, surface, SL); continue; }
    append(name, id, meshes[name]);
    finReports[name] = finReport(name, specs[name], ctx);
  }
  // pectoral / pelvic left use the same atlas cell (mirrored geometry)
  const phys = {
    caudal: physOf(specs.caudal), dorsal: physOf(specs.dorsal), anal: physOf(specs.anal), pectoral: physOf(specs.pectoral_R), pelvic: physOf(specs.pelvic_R),
  };
  const T = texSpecs(ctx, { dorsal: specs.dorsal, anal: specs.anal, caudal: specs.caudal, pectoral: specs.pectoral_R, pelvic: specs.pelvic_R });
  const textures = paintAtlas(ctx, T, phys, {});

  const nv = out.p.length;
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  const idF = new Float32Array(nv), tF = new Float32Array(nv), rF = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    positions.set(out.p[i], i * 3); normals.set(out.n[i] || [0, 1, 0], i * 3); uvs.set(out.uv[i], i * 2);
    idF[i] = out.id[i]; tF[i] = out.t[i]; rF[i] = out.r[i];
  }
  const indices = new Uint32Array(out.idx);
  const report = {
    seed, sl_m: SL, detail, lod: lod.name, columnsPerRay: lod.cpr,
    counts: { vertices: nv, triangles: indices.length / 3 },
    fins: finReports,
    rayGroups: {
      note: '_FINT (0 leading .. 1 trailing) -> ray-group bone (05 §5.1.2).  Suggested weights: group g of G has centre (g+0.5)/G; blend linearly between neighbouring centres.  caudal t=0 is the UPPER lobe edge, t=1 the lower lobe edge.',
      pectoral: { groups: 3, ids: [2, 3], bones: ['r0', 'r1', 'r2'], tCentres: [1 / 6, 0.5, 5 / 6] },
      pelvic: { groups: 2, ids: [4, 5], bones: ['r0', 'r1'], tCentres: [0.25, 0.75] },
      dorsal: { groups: 3, ids: [0], bones: ['dorsal_r0', 'dorsal_r1', 'dorsal_r2'], tCentres: [1 / 6, 0.5, 5 / 6] },
      anal: { groups: 2, ids: [6], bones: ['anal_r0', 'anal_r1'], tCentres: [0.25, 0.75] },
      caudal: { groups: 5, ids: [7], bones: ['caudal_ray_u2', 'caudal_ray_u1', 'caudal_ray_mid', 'caudal_ray_l1', 'caudal_ray_l2'], tCentres: [0.1, 0.3, 0.5, 0.7, 0.9] },
      adipose: { note: 'adipose_01/02: _FINR 0..1 (height above the base) blends 01 (base) -> 02 (tip); _FINT is the front-to-back position', ids: [1] },
    },
    atlas: { size: ATLAS_SIZE, cells: Object.fromEntries(Object.entries(ATLAS_CELLS).map(([k, c]) => [k, { ...c, uv: [(c.x + 0.5) / ATLAS_SIZE, (c.y + 0.5) / ATLAS_SIZE, (c.x + c.w - 0.5) / ATLAS_SIZE, (c.y + c.h - 0.5) / ATLAS_SIZE] }])), note: 'cell x = t (leading -> trailing), y = r (root at the top row).  pectoral_R/L, pelvic_R/L share a cell.' },
    colours: { note: 'albedo is the fin\'s own colour (sRGB); the renderer composites with alpha. Pectoral amber ~ (224,176,84) vs 03 median (185,155,85) measured through the membrane.', white_edge: T.pelvic.white, caudal_margin_sat: T.caudal.sat },
    alpha: { membrane: [T.dorsal.aMem, T.pectoral.aMem], ray: [T.dorsal.aRay, T.pectoral.aRay], base: T.dorsal.aBase, note: '06 §6.5: membrane 0.45 (0.3-0.7), ray 0.80, base 0.85' },
    material: { transparent: true, depthWrite: false, side: 'DoubleSide', castShadow: false, normalScaleY: -1, note: 'three needs normalScale.y = -1 for derivative tangents (as GLTFLoader does)' },
    root_embed_mm: EMBED / MM,
  };
  return {
    geometry: { positions, normals, uvs, indices, attrs: { _FINID: idF, _FINT: tF, _FINR: rF } },
    ranges, textures, report,
  };
}

function physOf(F) {
  // mean chord across the fan at mid-length and ray length (metres) -> used to scale the normal-map slopes and dots
  const n = F.n; let w = 0, c = 0;
  for (const r of [0.4, 0.55, 0.7, 0.85]) { w += len(sub(finPoint(F, 1, r), finPoint(F, 0, r))); c++; }
  return { w: w / c, l: F.rays[Math.min(2, n - 1)].L };
}

function sheetStats(F, sheet, M, surface, SL) {
  // per-column extent along the ray from root to the end (vertical or chord), and bounding box
  const { v0, nc, rows } = sheet; let maxVert = 0, maxChord = 0; let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let c = 0; c < nc; c++) {
    const a = M.p[v0 + c * (rows + 1)], b = M.p[v0 + c * (rows + 1) + rows];
    maxVert = Math.max(maxVert, Math.abs(dot(sub(b, a), F.A2))); maxChord = Math.max(maxChord, len(sub(b, a)));
    for (let k = 0; k <= rows; k++) { const p = M.p[v0 + c * (rows + 1) + k]; minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
  }
  return { maxVert, maxChord, bbox: [minX, minY, minZ, maxX, maxY, maxZ] };
}

function finReport(name, F, ctx) {
  const SL = ctx.SL; const st = F.stats; const base = name.split('_')[0];
  const rep = { rays: F.n, origin_s: F.dims.origin_s };
  const r0 = F.rays[0].B, r1 = F.rays[F.n - 1].B;
  rep.pivot = [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2, (r0[2] + r1[2]) / 2];      // centre of the root line (body-local, right-side frame)
  rep.bbox = st.bbox;
  if (base === 'dorsal' || base === 'anal') {
    rep.base_len_over_SL = len(sub(r1, r0)) / SL; rep.height_over_SL = st.maxVert / SL; rep.target = { base_len: F.dims.base_len, height: F.dims.height };
    rep.longest_ray_over_SL = st.maxChord / SL;
  } else if (base === 'pectoral' || base === 'pelvic') {
    rep.length_over_SL = st.maxChord / SL; rep.target = { length: F.dims.length };
  } else if (base === 'caudal') {
    rep.span_over_SL = (st.bbox[4] - st.bbox[1]) / SL; rep.length_over_SL = (ctx.surface.sToX(1.0) - st.bbox[0]) / SL;
    const mid = F.rays[(F.n - 1) >> 1]; const tipMid = rayPoint(F, (F.n - 1) >> 1, 1);
    rep.fork_depth_over_SL = (tipMid[0] - st.bbox[0]) / SL; rep.target = { span: F.dims.span, length: F.dims.length, fork_depth: F.dims.fork_depth };
  }
  return rep;
}
function adiposeReport(ad, surface, SL) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of ad.M.p) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
  const s0 = ad.dims.origin_s; const topY = surface.point(s0 + ad.dims.base_len / 2, 0)[1];
  return { origin_s: s0, base_len_over_SL: ad.dims.base_len, height_over_SL: (maxY - topY) / SL, target: { base_len: ad.dims.base_len, height: ad.dims.height }, bbox: [minX, minY, 0, maxX, maxY, 0], pivot: [surface.sToX(s0 + ad.dims.base_len / 2), topY, 0] };
}
