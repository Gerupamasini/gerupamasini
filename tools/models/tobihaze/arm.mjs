// The pectoral arm of the トビハゼ as one mesh with its own fillet onto the flank.
//
// The arm (the muscular base over the elongated radials) grows out of the flank low behind the gill slit. The body's
// loft cannot carry a limb's root (cast from the body's axis, its rays graze a bump standing out of the flank, and
// its texture smears over it), so - as for the eye domes - the arm is meshed on its own from its own axis: rings of
// rays from the axis out to the arm blended into the flank (a fillet round the root), and where those rays start to
// graze, each meridian walks on down the fillet and out over the flank until it lies on the body's skin. That skirt
// is drawn over the body with a depth offset (the overlay material), its normals turn to the flank's and its paint
// is the body's own pattern sampled at the same points, so the arm's edge shows nothing.
import { field, fieldGrad, PEC_AXIS, armRadii, norm3, ARM_U } from './anatomy.mjs';
import { PEC } from './fins.mjs';
import { clamp, smoothstep } from '../../lib/noise.mjs';

const TAU = Math.PI * 2;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};

/**
 * join: where the ray-cast rings hand over to the plain tube (mm from the shoulder joint; the hand flattens from
 * here); fillet: blend radius of the arm's root into the flank; step: spacing of the rings and of the walk
 */
export const ARM = { join: PEC.joint - 0.2, fillet: 1.3, step: 0.02 };

// ------------------------------------------------------------------------------------------------ the arm's solid
const axisAt = (a) => add(PEC_AXIS.base, scl(PEC_AXIS.dir, a));
/** unit direction from the axis to the ring's point at angle phi (the ring is an ellipse, rw across, rt through) */
function radial(a, phi) {
  const R = armRadii(a);
  return norm3(add(scl(PEC_AXIS.width, Math.cos(phi) * R.rw), scl(PEC_AXIS.normal, Math.sin(phi) * R.rt)));
}
/** approximate distance to the arm's root tube (left side), up to a little past the join */
function tubeDist(p) {
  const A = PEC_AXIS;
  const v = sub(p, A.base);
  const a = dot(v, A.dir), u = dot(v, A.width), t = dot(v, A.normal);
  const ac = clamp(a, -1.15, ARM.join + 1.0);
  const R = armRadii(ac);
  // (its root is rounded off inside the body, under the flank, so it raises no bump beyond the fillet round the arm)
  const k = ac < 0.6 ? Math.sqrt(Math.max(0.04, 1 - ((0.6 - ac) / 1.8) ** 2)) : 1;
  const rw = R.rw * k, rt = R.rt * k;
  return (Math.hypot(u / rw, t / rt) - 1) * Math.min(rw, rt) + Math.abs(a - ac);
}
/**
 * how much of the shoulder joint's motion a skin point takes (both sides): all of it on the arm, fading over the
 * fillet to none where the arm's skirt ends on the flank. The skirt and the flank's skin under it take the same share,
 * so they move together and the skirt never sinks into the flank; beyond the skirt the flank is untouched.
 */
export function pecShare(p) {
  // (an even fade over the whole fillet spreads the stretch of a swing over all of it)
  return 1 - smoothstep(0.0, 1.25, tubeDist([p[0], p[1], Math.abs(p[2])]));
}
/** the arm's root blended into the body (left side) */
export function armField(p) {
  return smin(field(p[0], p[1], p[2]), tubeDist(p), ARM.fillet);
}
function armGrad(p, e = 0.004) {
  return norm3([
    armField([p[0] + e, p[1], p[2]]) - armField([p[0] - e, p[1], p[2]]),
    armField([p[0], p[1] + e, p[2]]) - armField([p[0], p[1] - e, p[2]]),
    armField([p[0], p[1], p[2] + e]) - armField([p[0], p[1], p[2] - e]),
  ]);
}
/** first exit of the ray c + d·t out of the arm's solid (from about t0 on) */
function rayExit(c, d, t0 = 0) {
  const f = (t) => armField(add(c, scl(d, t)));
  let a = Math.max(0, t0 - 0.4);
  while (a > 0 && f(a) > 0) a = Math.max(0, a - 0.4);
  let b = -1;
  for (let t = a + 0.025; t < 9; t += 0.025) { if (f(t) > 0) { b = t; break; } a = t; }
  if (b < 0) b = a;
  for (let k = 0; k < 22; k++) { const m = 0.5 * (a + b); if (f(m) > 0) b = m; else a = m; }
  const t = 0.5 * (a + b);
  const p = add(c, scl(d, t));
  return { t, p, n: armGrad(p) };
}
function toSurface(p) {
  let q = p;
  for (let k = 0; k < 8; k++) {
    const f = armField(q);
    if (Math.abs(f) < 1e-5) break;
    q = sub(q, scl(armGrad(q), f));
  }
  return q;
}
/** height of p above the body's own skin (without the arm), along the body's normal; < 0 under it */
function bodyGap(p) {
  const hn = fieldGrad(p[0], p[1], p[2]);
  const g = (k) => field(p[0] - hn[0] * k, p[1] - hn[1] * k, p[2] - hn[2] * k);
  let lo = -0.8, hi = 3.5;
  if (!(g(lo) > 0 && g(hi) < 0)) return { gap: field(p[0], p[1], p[2]), hn };
  for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
  return { gap: 0.5 * (lo + hi), hn };
}

// ------------------------------------------------------------------------------------------------ meridians
/**
 * One meridian of the left arm's root (cached), as a polyline from the join ring down to the skirt's end, with its arc
 * length: rings of rays from the axis while they meet the surface squarely, then a walk down the surface in the plane
 * of the axis and the last ray, over the fillet and out on the flank, until it has lain on the body's skin for a while.
 */
export const MER = new Map();
function meridian(phi) {
  const key = phi.toFixed(6);
  let M = MER.get(key);
  if (M) return M;
  const pts = [], as = [];
  let prev = null, merged = -1;
  for (let a = ARM.join; a > -1.4; a -= ARM.step) {
    const r = radial(a, phi);
    const q = rayExit(axisAt(a), r, prev ? prev.t : armRadii(a).rw);
    // (stop where the rays graze the fillet, or jump, or wander off over the body)
    if (prev && (dot(r, q.n) < 0.42 || q.t - prev.t > 0.25 || q.t > armRadii(a).rw + 2.5)) break;
    pts.push(q.p); as.push(a);
    prev = { ...q, r, a };
    // the rays have come down onto the flank itself
    if (bodyGap(q.p).gap < 0.015) { merged = 0; break; }
  }
  // walk on, in the plane through the axis and the last ray, away from the arm's tip
  const m = norm3(cross(PEC_AXIS.dir, prev.r));
  let p = prev.p, tprev = scl(PEC_AXIS.dir, -1);
  let k = 0;
  for (k = 1; k < 450; k++) {
    const n = armGrad(p);
    let t = norm3(cross(m, n));
    if (dot(t, tprev) < 0) t = scl(t, -1);
    p = toSurface(add(p, scl(t, ARM.step)));
    p = toSurface(sub(p, scl(m, dot(sub(p, PEC_AXIS.base), m))));
    pts.push(p); as.push(dot(sub(p, PEC_AXIS.base), PEC_AXIS.dir));
    tprev = t;
    if (merged < 0) { if (bodyGap(p).gap < 0.015) merged = k; }
    else if ((k - merged) * ARM.step > 0.35) break;
  }
  const A = [0];
  for (let i = 1; i < pts.length; i++) A.push(A[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  M = { pts, as, A, len: A[A.length - 1] };
  MER.set(key, M);
  return M;
}
function onMeridian(M, d) {
  const A = M.A, dd = clamp(d, 0, M.len);
  let lo = 0, hi = A.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (A[mid] > dd) hi = mid; else lo = mid; }
  const f = A[hi] > A[lo] ? (dd - A[lo]) / (A[hi] - A[lo]) : 0;
  return { p: add(scl(M.pts[lo], 1 - f), scl(M.pts[hi], f)), a: M.as[lo] + (M.as[hi] - M.as[lo]) * f };
}
/** meridians are cached on a fixed set of angles; points in between are interpolated and put back on the surface */
const NPHI = 96;
let SKIRT_MAX = null;
/** the longest skirt (arc length from the join ring to its end): the skirt's rows run over 0 … this */
export function skirtMax() {
  if (SKIRT_MAX === null) {
    SKIRT_MAX = 0;
    for (let j = 0; j < NPHI; j++) SKIRT_MAX = Math.max(SKIRT_MAX, meridian((j / NPHI) * TAU).len);
  }
  return SKIRT_MAX;
}
function skirtAt(d, phi) {
  const x = (((phi / TAU) % 1) + 1) % 1 * NPHI;
  const j0 = Math.floor(x) % NPHI, j1 = (j0 + 1) % NPHI, f = x - Math.floor(x);
  const A = onMeridian(meridian((j0 / NPHI) * TAU), d), B = onMeridian(meridian((j1 / NPHI) * TAU), d);
  let p = add(scl(A.p, 1 - f), scl(B.p, f));
  if (f > 1e-6 && f < 1 - 1e-6) p = toSurface(p);
  return { p, a: A.a + (B.a - A.a) * f };
}

// ------------------------------------------------------------------------------------------------ the tube
/** the hand: past the join the arm is a plain tube, flattening into the hand and rounded off at its edge */
function tubeRing(g, phi) {
  const { len } = PEC;
  const a = ARM.join + g * (len - ARM.join);
  const hand = smoothstep(0, 0.75, g * (len - ARM.join) / (len - ARM.join));
  const R = armRadii(a);
  const f = (a - ARM.join) / (len - ARM.join);
  const cap = f > 0.55 ? Math.pow(Math.max(0, 1 - ((f - 0.55) / 0.45) ** 2), 0.6) : 1;
  const rw = (R.rw + (1.7 - R.rw) * hand) * cap, rt = (R.rt + (0.95 - R.rt) * hand) * cap;
  const p = add(axisAt(a), add(scl(PEC_AXIS.width, Math.cos(phi) * rw), scl(PEC_AXIS.normal, Math.sin(phi) * rt)));
  return { p, a };
}

/**
 * A point of the left arm's surface: g ∈ [0, 1] from the skirt's end (0) through the join ring (G_JOIN) to the tip
 * (1), phi round the arm. Returns the point, its normal (the flank's where the skirt has merged), `a` (mm along the
 * axis from the shoulder joint) and `skirt` (1 on the skirt's merged edge … 0 from the join ring on).
 */
let G_JOIN = null;
export function gJoin() {
  if (G_JOIN === null) G_JOIN = skirtMax() / (skirtMax() + (PEC.len - ARM.join));
  return G_JOIN;
}
export function armPoint(g, phi) {
  const gj = gJoin();
  if (g >= gj) {
    const { p, a } = tubeRing((g - gj) / (1 - gj), phi);
    // (the tube's normal without its taper: the mesh takes its faces' instead)
    const R = armRadii(a);
    return { p, a, skirt: 0, tube: true, n: norm3(add(scl(PEC_AXIS.width, Math.cos(phi) / R.rw), scl(PEC_AXIS.normal, Math.sin(phi) / R.rt))) };
  }
  const d = (1 - g / gj) * skirtMax();
  const { p, a } = skirtAt(d, phi);
  let n = armGrad(p);
  const { gap, hn } = bodyGap(p);
  const wn = 1 - smoothstep(0.0, 0.18, gap);
  if (wn > 0) n = norm3(add(scl(n, 1 - wn), scl(hn, wn)));
  return { p, n, a, skirt: 1 - smoothstep(0.0, 1.0, gap), gap };
}

/**
 * The arm mesh (left side; the right one mirrors z): rows from the skirt's merged edge to the hand's edge. Returns
 * fish-space vertices, normals, uvs (in the body texture's arm strip), `at` (mm along the axis, for the wrist) and
 * `pec` (how much of the shoulder joint's motion each vertex takes: all of it on the arm, none at the skirt's edge).
 */
export function buildArm(NA = 18, NR = 20, side = 1, NS = null) {
  const gj = gJoin();
  const nS = NS ?? Math.max(3, Math.round(NA * 1.2));
  const G = [];
  for (let i = 0; i <= nS; i++) G.push((i / nS) * gj);
  for (let i = 1; i <= NA; i++) G.push(gj + (i / NA) * (1 - gj));
  const fish = [], nrm = [], uv = [], at = [], pec = [];
  const rows = [];
  for (const g of G) {
    const row = [];
    for (let j = 0; j <= NR; j++) {
      const phi = (j / NR) * TAU;
      const P = armPoint(g, phi);
      const p = side > 0 ? P.p : [P.p[0], P.p[1], -P.p[2]];
      row.push(fish.length / 3);
      fish.push(...p);
      nrm.push(...(!P.tube ? (side > 0 ? P.n : [P.n[0], P.n[1], -P.n[2]]) : [0, 0, 0]));
      uv.push(ARM_U[0] + (ARM_U[1] - ARM_U[0]) * (0.02 + 0.96 * g), j / NR);
      at.push(P.a);
      // the arm and its root turn with the shoulder joint; down the fillet the skirt lets go, and where it lies on the
      // flank it stays with the body
      pec.push(P.tube ? 1 : pecShare(P.p));
    }
    rows.push(row);
  }
  const tris = [];
  for (let i = 0; i < G.length - 1; i++) for (let j = 0; j < NR; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    if (side > 0) tris.push(a, b, c, a, c, d); else tris.push(a, c, b, a, d, c);
  }
  // the tube's normals from its faces (they follow its taper and the rounded edge of the hand); the skirt keeps the
  // surface's own (and the flank's where it has merged); the join ring averages the two
  {
    const P = (k) => [fish[k * 3], fish[k * 3 + 1], fish[k * 3 + 2]];
    const acc = new Float64Array(fish.length);
    for (let k = 0; k < tris.length; k += 3) {
      const [a, b, c] = [tris[k], tris[k + 1], tris[k + 2]];
      const fn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
      for (const v of [a, b, c]) { acc[v * 3] += fn[0]; acc[v * 3 + 1] += fn[1]; acc[v * 3 + 2] += fn[2]; }
    }
    for (const row of rows) {
      const a = row[0], z = row[row.length - 1];
      for (let c = 0; c < 3; c++) { const t = acc[a * 3 + c] + acc[z * 3 + c]; acc[a * 3 + c] = t; acc[z * 3 + c] = t; }
    }
    const tipN = side > 0 ? PEC.dir : [PEC.dir[0], PEC.dir[1], -PEC.dir[2]];
    rows.forEach((row, i) => {
      for (const v of row) {
        let fnv = norm3([acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]]);
        const own = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
        const hasOwn = own[0] !== 0 || own[1] !== 0 || own[2] !== 0;
        if (hasOwn && dot(fnv, own) < 0) fnv = scl(fnv, -1);
        let n;
        if (i === rows.length - 1) n = tipN;
        else if (!hasOwn) n = fnv;
        else if (i === nS) n = norm3(add(own, fnv));
        else n = own;
        nrm[v * 3] = n[0]; nrm[v * 3 + 1] = n[1]; nrm[v * 3 + 2] = n[2];
      }
    });
    // tube normals from faces can point in when the winding is inverted: orient them like the radial direction
    rows.forEach((row, i) => {
      if (i < nS || i === rows.length - 1) return;
      row.forEach((v, j) => {
        const a = at[v];
        let r = radial(a, (j / NR) * TAU);
        if (side < 0) r = [r[0], r[1], -r[2]];
        if (dot(r, [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]]) < 0) { nrm[v * 3] *= -1; nrm[v * 3 + 1] *= -1; nrm[v * 3 + 2] *= -1; }
      });
    });
  }
  // make sure the winding faces out (tested on the tube, half way along it)
  {
    const P = (k) => [fish[k * 3], fish[k * 3 + 1], fish[k * 3 + 2]];
    const i = nS + Math.max(1, Math.floor(NA / 3));
    const t0 = (i * NR + 2) * 6;
    const a = tris[t0], b = tris[t0 + 1], c = tris[t0 + 2];
    const fn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
    const n0 = [nrm[a * 3], nrm[a * 3 + 1], nrm[a * 3 + 2]];
    if (dot(fn, n0) < 0) for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
  }
  return { fish, nrm, uv, at, pec, indices: tris };
}

/** occlusion of a point of the arm's skin by the arm's root and the body round it (1: open) */
export function armOcclusion(p, n) {
  let occ = 0;
  const dks = [0.12, 0.3, 0.6, 1.1, 1.8], wks = [0.3, 0.27, 0.2, 0.14, 0.09];
  for (let m = 0; m < dks.length; m++) occ += (wks[m] * Math.max(0, dks[m] - armField(add(p, scl(n, dks[m]))))) / dks[m];
  return clamp(1 - occ * 1.2, 0.25, 1);
}
