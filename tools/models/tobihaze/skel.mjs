// Skeleton toolkit for the トビハゼ head: bone primitives as signed-distance fields in the fish frame (HL units, see
// anatomy.mjs), joints with pivots and axes, and posing (each part follows its joint's transform). skull.mjs lists the
// bones; the skin (head.mjs) is built over them, and the rig's joints are these joints, so the mouth, the gill covers
// and the eyes move as the real mechanism does.
import { clamp, smin } from './sdf.mjs';

// --------------------------------------------------------------------------------------------- vectors
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const { add, sub, mul, dot, cross, norm } = v3;

/** A right-handed frame from an origin, a first axis u and an approximate second axis v (w = u × v). */
export function frame(o, u, vApprox) {
  const U = norm(u), W = norm(cross(U, vApprox)), V = cross(W, U);
  return { o, u: U, v: V, w: W, local: (p) => { const d = sub(p, o); return [dot(d, U), dot(d, V), dot(d, W)]; } };
}

// --------------------------------------------------------------------------------------------- primitives
/** Tapered capsule from a to b (radii ra, rb). */
export function rod(a, b, ra, rb = ra) {
  const ab = sub(b, a), L2 = dot(ab, ab) || 1e-12;
  return (x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]], t = clamp(dot(p, ab) / L2, 0, 1);
    const q = sub(p, mul(ab, t));
    return Math.hypot(q[0], q[1], q[2]) - (ra + (rb - ra) * t);
  };
}

/** A rod along a polyline (radii per point), the hard union of its tapered segments. */
export function polyRod(points, radii) {
  const segs = [];
  for (let i = 0; i + 1 < points.length; i++) segs.push(rod(points[i], points[i + 1], radii[i], radii[i + 1]));
  return (x, y, z) => { let d = Infinity; for (const s of segs) d = Math.min(d, s(x, y, z)); return d; };
}

/** Signed distance to a 2D polygon (points [[u, v], ...], either winding). */
function polygon2D(P) {
  return (u, v) => {
    let d = Infinity, s = 1;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [ix, iy] = P[i], [jx, jy] = P[j];
      const ex = jx - ix, ey = jy - iy, wx = u - ix, wy = v - iy;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-12), 0, 1);
      const dx = wx - ex * t, dy = wy - ey * t;
      d = Math.min(d, dx * dx + dy * dy);
      // crossing-number inside test (as in Quilez's polygon distance)
      const c1 = v >= iy, c2 = v < jy, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
}

/**
 * A thin bony plate: a 2D outline (points [[u, v], ...] in the frame F's u–v plane) extruded ±thick/2 along F.w, its
 * edges rounded by `round`. Optional `bend`: the plate curved about its v axis (w offset = bend · u²), as the opercle's
 * gentle dome.
 */
export function plate(F, outline, thick, round = thick * 0.5, bend = 0) {
  const d2 = polygon2D(outline), h = thick / 2;
  return (x, y, z) => {
    const [u, v, w0] = F.local([x, y, z]);
    const w = w0 - bend * u * u;
    const a = d2(u, v) + round, b = Math.abs(w) - h + round;
    return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - round;
  };
}

/**
 * A plate through 3D landmarks: the frame from the first three (origin p0, u toward p1, v toward p2), every point
 * projected into its plane as the outline (`basis`: other indices for the frame when the first three are nearly in
 * line). For bones measured as landmark polygons (the opercle, the quadrate).
 */
export function plateFromPoints(points, thick, round = thick * 0.5, bend = 0, basis = [0, 1, 2]) {
  const [a, b, c] = basis.map((i) => points[i]);
  const F = frame(a, sub(b, a), sub(c, a));
  return plate(F, points.map((p) => { const l = F.local(p); return [l[0], l[1]]; }), thick, round, bend);
}

/**
 * A flat strap along a polyline (3D points), `width` wide in the plane the points span and `thick` thick: the union
 * of one plate per segment with rounded ends. For the preopercle's crescent, the subopercle's sickle, the rays.
 * `width` may be a number or one value per point; `normal` (optional) fixes the plate's thickness direction.
 */
export function strap(points, width, thick, normal) {
  const W = (i) => (Array.isArray(width) ? width[i] : width);
  let n = normal;
  if (!n) { // the plane of the polyline: the sum of the cross products of consecutive chords
    n = [0, 0, 0];
    for (let i = 1; i + 1 < points.length; i++) n = add(n, cross(sub(points[i], points[0]), sub(points[i + 1], points[0])));
    if (Math.hypot(...n) < 1e-9) n = [0, 0, 1];
  }
  n = norm(n);
  const parts = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const u = norm(sub(points[i + 1], points[i])), side = norm(cross(n, u));
    const wa = W(i) / 2, wb = W(i + 1) / 2;
    // interior joints: each segment runs on past the joint by half its width, so the bend is filled on both sides
    const a = i > 0 ? sub(points[i], mul(u, wa)) : points[i], b = i + 2 < points.length ? add(points[i + 1], mul(u, wb)) : points[i + 1];
    const quad = [add(a, mul(side, wa)), add(b, mul(side, wb)), sub(b, mul(side, wb)), sub(a, mul(side, wa))];
    const F = frame(a, u, side);
    parts.push(plate(F, quad.map((p) => { const l = F.local(p); return [l[0], l[1]]; }), thick));
  }
  // the segments overlap at the joints; a small blend fills the wedge on the outside of each bend
  return (x, y, z) => { let d = Infinity; for (const f of parts) d = smin(d, f(x, y, z), thick * 0.5); return d; };
}

/**
 * A curved bony sheet between two polylines (top and bottom edges, the same number of points), `thick` thick: one
 * plate per quad, smoothly united. For the dentary's curved wedge and the ceratohyal.
 */
export function sheet(top, bottom, thick, k = thick * 0.4) {
  const quads = [];
  // neighbouring quads overlap by `thick` (a shared edge alone would leave a crack: each plate is zero on its border)
  const ext = (p, q, first, last) => { const d = norm(sub(q, p)); return [first ? p : sub(p, mul(d, thick)), last ? q : add(q, mul(d, thick))]; };
  for (let i = 0; i + 1 < top.length; i++) {
    const first = i === 0, last = i + 2 === top.length;
    const [b0, b1] = ext(bottom[i], bottom[i + 1], first, last), [t0, t1] = ext(top[i], top[i + 1], first, last);
    quads.push(plateFromPoints([b0, b1, t1, t0], thick));
  }
  return (x, y, z) => { let d = Infinity; for (const f of quads) d = k > 0 ? smin(d, f(x, y, z), k) : Math.min(d, f(x, y, z)); return d; };
}

/** Conical teeth along a polyline: n cones of height h (base radius r) pointing along dir, spread over the path. */
export function teeth(path, n, h, r, dir, shrink = 0.6) {
  const L = [0];
  for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
  const at = (d) => {
    let i = 1; while (i < path.length - 1 && L[i] < d) i++;
    const t = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
    return v3.lerp(path[i - 1], path[i], clamp(t, 0, 1));
  };
  const D = norm(dir), cones = [];
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n, p = at(f * L[L.length - 1]), s = 1 - (1 - shrink) * f; // the front teeth the largest
    cones.push(rod(p, add(p, mul(D, h * s)), r * s, r * 0.15));
  }
  return (x, y, z) => { let d = Infinity; for (const c of cones) d = Math.min(d, c(x, y, z)); return d; };
}

/** Ellipsoid in a frame (radii along F.u, F.v, F.w). */
export function ellipsoidF(F, r) {
  return (x, y, z) => {
    const [u, v, w] = F.local([x, y, z]);
    const k0 = Math.hypot(u / r[0], v / r[1], w / r[2]), k1 = Math.hypot(u / (r[0] * r[0]), v / (r[1] * r[1]), w / (r[2] * r[2]));
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
  };
}

/** The smooth union of several fields. */
export function unionOf(fields, k = 0) {
  return (x, y, z) => { let d = Infinity; for (const f of fields) d = k > 0 ? smin(d, f(x, y, z), k) : Math.min(d, f(x, y, z)); return d; };
}

// --------------------------------------------------------------------------------------------- joints and posing
/** Rotation matrix (row-major 3×3) about a unit axis by angle a (radians). */
export function axisAngle(axis, a) {
  const [x, y, z] = norm(axis), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
const mv = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
const mm = (A, B) => {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
};
const mt = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * World transforms of a joint hierarchy for a pose.
 * @param joints [{ name, parent, pivot: [s,y,z] }]
 * @param pose   { [name]: { R?: 3×3 row-major (local rotation about the pivot), t?: [ds,dy,dz] (local translation) } }
 * @returns { [name]: { R, t } } world: p_world = R · p_bind + t
 */
export function worldTransforms(joints, pose = {}) {
  const out = {};
  for (const j of joints) {
    const P = j.parent ? out[j.parent] : { R: I3, t: [0, 0, 0] };
    const L = pose[j.name] ?? {};
    const R = L.R ?? I3, tt = L.t ?? [0, 0, 0];
    // local: rotate about the pivot, then translate: p' = R (p − c) + c + t
    const c = j.pivot;
    const lt = add(sub(c, mv(R, c)), tt);
    out[j.name] = { R: mm(P.R, R), t: add(mv(P.R, lt), P.t) };
  }
  return out;
}

/** A field posed by a world transform: f evaluated at the bind position of the query point. */
export function posed(f, T) {
  if (!T) return f;
  const Rt = mt(T.R);
  return (x, y, z) => { const p = mv(Rt, sub([x, y, z], T.t)); return f(p[0], p[1], p[2]); };
}

/** A point (bind frame) moved by a world transform. */
export const movePoint = (p, T) => (T ? add(mv(T.R, p), T.t) : p);

/**
 * The hard union of many fields, fast: each field's bounding box is found once by sampling it on a coarse grid over
 * `box` (HL), and a field is evaluated only where its box is nearer than the best distance so far.
 */
export function boundedUnion(fields, box, step = 0.02) {
  const items = fields.map((f) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let x = box.min[0]; x <= box.max[0]; x += step)
      for (let y = box.min[1]; y <= box.max[1]; y += step)
        for (let z = box.min[2]; z <= box.max[2]; z += step)
          if (f(x, y, z) < step) { const p = [x, y, z]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
    const pad = step * 1.5;
    return { f, lo: lo.map((v) => v - pad), hi: hi.map((v) => v + pad), empty: lo[0] === Infinity };
  }).filter((it) => !it.empty);
  return (x, y, z) => {
    let d = Infinity;
    for (const it of items) {
      const bx = Math.max(it.lo[0] - x, 0, x - it.hi[0]), by = Math.max(it.lo[1] - y, 0, y - it.hi[1]), bz = Math.max(it.lo[2] - z, 0, z - it.hi[2]);
      const b = Math.hypot(bx, by, bz);
      if (b > 0 && b >= d) continue;
      const v = it.f(x, y, z);
      if (v < d) d = v;
    }
    // far from every box: the box distance bounds the field from below, which is all the mesher needs there
    if (d === Infinity) { for (const it of items) { const bx = Math.max(it.lo[0] - x, 0, x - it.hi[0]), by = Math.max(it.lo[1] - y, 0, y - it.hi[1]), bz = Math.max(it.lo[2] - z, 0, z - it.hi[2]); d = Math.min(d, Math.hypot(bx, by, bz)); } }
    return d;
  };
}
