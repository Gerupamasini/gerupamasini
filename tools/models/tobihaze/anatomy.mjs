// Anatomical definition of an adult トビハゼ (Periophthalmus modestus), total length 80 mm.
//
// Fish space (millimetres):
//   s : distance from the snout tip along the body axis (0 = snout, SL = caudal base)
//   y : height (0 = ventral line under the head and chest), +y = dorsal
//   z : lateral, +z = fish's left side
// Object space of the exported glTF (metres): X = z, Y = y - Y0, Z = S0 - s  (head points to +Z).
// The object origin is the ventral line under the pectoral girdle (S0), the pivot of the land gait.
//
// Proportions were read from 70 reference photos (lateral, dorsal, frontal, oblique; iNaturalist research grade)
// and literature descriptions (blunt, steep snout; inferior wide mouth with a thick upper lip; eyes on top of the
// head, close-set, raised on turrets above the dorsal profile, each with a dermal cup below it; swollen opercular
// chambers; the pectoral fin carried on a muscular "arm"; subcylindrical trunk, compressed tail; long, low
// caudal peduncle and a lanceolate caudal fin). In % SL: head length 25, head width 18.5, body depth at the
// pectoral base 17, caudal peduncle depth 8.5, eye diameter 6.7, interorbital < 1.

import { clamp, smoothstep } from '../../lib/noise.mjs';

export const SL = 64.0; // standard length
export const S_END = 66.0; // end of the body loft (thin blade overlapping the caudal fin base)
export const TL = 80.0; // total length including the caudal fin
export const S0 = 17.0; // object-space origin along the axis (pectoral girdle)
export const Y0 = 0.0; // object-space origin height (ventral line)
/** the body texture's u range: the strip above it holds the pectoral arms */
export const BODY_U = 0.9;

// ---------------------------------------------------------------------------
// Profile key points (pre-cap dimensions, mm)
const KS = [0, 0.3, 0.7, 1.2, 1.8, 2.6, 3.6, 4.8, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 63, 64.5, 66];
// dorsal profile (without the eye turrets): steep, blunt forehead, level nape, slowly falling back
const KTOP = [5.6, 6.7, 7.6, 8.3, 8.85, 9.35, 9.8, 10.15, 10.45, 10.8, 11.1, 11.35, 11.55, 11.7, 11.8, 11.7, 11.4, 10.95, 10.45, 9.9, 9.35, 8.8, 8.25, 7.75, 7.3, 6.9, 6.65, 6.55, 6.45];
// ventral profile: the snout overhangs the mouth; flat chest and belly; the tail's lower edge rises gently
const KBOT = [2.6, 2.35, 2.05, 1.75, 1.3, 0.98, 0.72, 0.48, 0.3, 0.1, 0.02, 0.0, 0.0, 0.0, 0.02, 0.06, 0.15, 0.28, 0.45, 0.65, 0.88, 1.1, 1.3, 1.48, 1.62, 1.76, 1.85, 1.9, 1.96];
// half width: broad, rounded snout; cheeks (swollen opercular chambers) widest; tapering tail
const KW = [3.0, 3.6, 4.05, 4.4, 4.7, 4.95, 5.1, 5.25, 5.4, 5.65, 5.95, 6.05, 5.95, 5.75, 5.5, 5.25, 4.85, 4.4, 3.95, 3.5, 3.05, 2.62, 2.25, 1.92, 1.62, 1.36, 1.15, 0.92, 0.55];
// superellipse exponents (top / bottom): boxy head with a flat underside, round trunk, oval tail
const KNT = [2.1, 2.15, 2.2, 2.25, 2.3, 2.35, 2.35, 2.35, 2.35, 2.35, 2.3, 2.3, 2.3, 2.3, 2.25, 2.2, 2.15, 2.1, 2.1, 2.05, 2.05, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0];
const KNB = [2.4, 2.5, 2.6, 2.8, 3.0, 3.1, 3.15, 3.2, 3.2, 3.15, 3.1, 3.0, 2.95, 2.9, 2.85, 2.8, 2.7, 2.6, 2.5, 2.4, 2.3, 2.2, 2.15, 2.1, 2.05, 2.0, 2.0, 2.0, 2.0];
// height of the widest point relative to the mid-height: the cheeks bulge low, under the eyes
const KDY = [0, 0, -0.1, -0.2, -0.35, -0.5, -0.65, -0.8, -0.9, -1.0, -1.05, -1.05, -0.95, -0.8, -0.6, -0.45, -0.25, -0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export function monotone(xs, ys) {
  const n = xs.length;
  const d = new Array(n - 1);
  const m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid; else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}

const fTop = monotone(KS, KTOP);
const fBot = monotone(KS, KBOT);
const fW = monotone(KS, KW);
const fNT = monotone(KS, KNT);
const fNB = monotone(KS, KNB);
const fDY = monotone(KS, KDY);

// blunt snout: the front face is almost flat (superelliptic cap over the first ~1.5 mm)
const SNOUT_CAP = 2.4, SNOUT_E = 2.0;
const SNOUT_CAP_W = 2.8, SNOUT_E_W = 2.0;
const TAIL_BLADE0 = 62.5;

function snoutCap(s, len, e) {
  if (s >= len) return 1;
  const u = clamp(s / len, 0, 1);
  return Math.pow(Math.max(0, 1 - Math.pow(1 - u, e)), 1 / e);
}
function tailU(s) { return clamp((s - TAIL_BLADE0) / (S_END - TAIL_BLADE0), 0, 1); }

/** Cross-section parameters at s. */
export function section(s) {
  const top = fTop(s), bot = fBot(s);
  const c = snoutCap(s, SNOUT_CAP, SNOUT_E);
  // the cheeks bulge low: the split between the upper and lower superellipse halves (the widest point) sits below
  // mid-height on the head
  const yc = (top + bot) / 2 + fDY(s);
  const u = tailU(s);
  const ch = c * (1 - 0.4 * u * u);
  const cw = snoutCap(s, SNOUT_CAP_W, SNOUT_E_W) * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.35 * u);
  return { yc, t: (top - yc) * ch, b: (yc - bot) * ch, w: fW(s) * cw, nT: fNT(s), nB: fNB(s) };
}

export const topY = (s) => { const q = section(s); return q.yc + q.t; };
export const botY = (s) => { const q = section(s); return q.yc - q.b; };

const sgnpow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

/** Base loft surface point for parameter phi (0 = ventral midline, pi/2 = +z side, pi = dorsal). */
export function basePoint(s, phi, q = section(s)) {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const up = cp < 0;
  const n = up ? q.nT : q.nB;
  const h = up ? q.t : q.b;
  return [s, q.yc - h * sgnpow(cp, 2 / n), q.w * sgnpow(sp, 2 / n)];
}

export function superR(s, y, z, q = section(s)) {
  const dy = y - q.yc;
  const up = dy > 0;
  const h = Math.max(up ? q.t : q.b, 1e-4);
  const n = up ? q.nT : q.nB;
  const w = Math.max(q.w, 1e-4);
  return Math.pow(Math.pow(Math.abs(z) / w, n) + Math.pow(Math.abs(dy) / h, n), 1 / n);
}

/** Approximate signed distance (mm) to the base loft. */
export function baseDist(s, y, z) {
  const sc = clamp(s, 0.01, S_END - 0.01);
  const q = section(sc);
  const dy = y - q.yc;
  const r = superR(sc, y, z, q);
  const len = Math.hypot(dy, z);
  let d;
  if (r < 1e-6) d = -Math.min(q.w, dy > 0 ? q.t : q.b);
  else d = len * (1 - 1 / r);
  d *= 0.92;
  const ds = Math.abs(s - sc);
  if (ds > 0) d = Math.max(d, 0) + ds;
  return d;
}

/** Normalised height inside the section (-1 ventral … +1 dorsal). */
export function normHeight(s, y) {
  const q = section(clamp(s, 0.01, S_END - 0.01));
  const dy = y - q.yc;
  return dy / Math.max(dy > 0 ? q.t : q.b, 1e-3);
}

const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);
export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** +z side base-surface z at (s, y). */
export function sideZ(s, y) {
  const q = section(clamp(s, 0.01, S_END - 0.01));
  const dy = y - q.yc;
  const h = Math.max(dy > 0 ? q.t : q.b, 1e-4);
  const n = dy > 0 ? q.nT : q.nB;
  return q.w * Math.pow(Math.max(0, 1 - Math.pow(clamp(Math.abs(dy) / h), n)), 1 / n);
}

/** Base-surface point on the +z side at (s, y) and its outward normal. */
export function surfaceAt(s, y) {
  const z = sideZ(s, y);
  const e = 0.005;
  const g = [
    baseDist(s + e, y, z) - baseDist(s - e, y, z),
    baseDist(s, y + e, z) - baseDist(s, y - e, z),
    baseDist(s, y, z + e) - baseDist(s, y, z - e),
  ];
  return { p: [s, y, z], n: norm3(g) };
}

// ---------------------------------------------------------------------------
// Eyes. Each eye sits in a dermal cup on a turret that rises above the head; the two turrets almost touch over the
// narrow interorbital. Eyeball Ø 4.3 mm (6.7 % SL), centre 6.6 mm behind the snout, its top ~3 mm above the
// dorsal profile. The pupil looks sideways, up and a little forward (aerial vision over the flat).
// Retraction ("blinking", Aiello et al. 2023 PNAS): the eyeball sinks ~2.4 mm into the orbit and the dermal cup
// closes over it.
export const EYE = {
  center: [6.4, 11.6, 2.35],
  radius: 2.1,
  axis: norm3([-0.32, 0.55, 0.77]),
  retract: 2.5,
};
// turret: the skin mound that carries the cup (lower and slightly lateral to the eyeball centre)
const TURRET = { dc: [0.1, -1.5, 0.22], r: 2.6 };
// the cup's rim covers the lower ~35 % of the eyeball
const CAVITY_R = EYE.radius - 0.04;

// Gape (where the lips meet), side view on the +z side: from the front midline under the snout back to the rictus,
// below the front of the eye. The mouth is inferior: the snout and its thick upper lip overhang the lower jaw.
export const MOUTH = [[1.2, 1.92], [2.0, 1.86], [3.0, 1.78], [4.2, 1.68], [5.4, 1.58], [6.4, 1.5], [7.1, 1.44]];
export const RICTUS_S = 7.1;
// gill-cover margin (a groove: goby gill openings are small, ventrolateral) and the preopercle, top → bottom
export const OPERCLE = [[13.8, 8.6], [15.0, 7.3], [15.8, 5.7], [16.0, 4.2], [15.6, 2.7], [14.6, 1.3], [13.6, 0.5]];
export const PREOPERCLE = [[10.4, 8.8], [11.2, 7.0], [11.5, 5.0], [11.2, 3.0], [10.2, 1.4]];

/** y of the gape at s (piecewise linear on MOUTH). */
export function gapeY(s) {
  const P = MOUTH;
  if (s <= P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) {
    if (s <= P[i + 1][0]) {
      const f = (s - P[i][0]) / (P[i + 1][0] - P[i][0]);
      return P[i][1] + (P[i + 1][1] - P[i][1]) * f;
    }
  }
  return P[P.length - 1][1];
}

function capsuleChain(pts, radii) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], radii[i], radii[i + 1]]);
  return segs;
}
function capsuleChainDist(p, segs) {
  let best = 1e9;
  for (const [a, b, ra, rb] of segs) {
    const ab0 = b[0] - a[0], ab1 = b[1] - a[1], ab2 = b[2] - a[2];
    const ap0 = p[0] - a[0], ap1 = p[1] - a[1], ap2 = p[2] - a[2];
    const L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
    const t = clamp((ap0 * ab0 + ap1 * ab1 + ap2 * ab2) / L2, 0, 1);
    const d = Math.hypot(ap0 - ab0 * t, ap1 - ab1 * t, ap2 - ab2 * t) - (ra + (rb - ra) * t);
    if (d < best) best = d;
  }
  return best;
}
const mirrorZ = (segs) => segs.map(([a, b, ra, rb]) => [[a[0], a[1], -a[2]], [b[0], b[1], -b[2]], ra, rb]);
function ellipsoidDist(p, c, r) {
  const k0 = Math.hypot((p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]);
  const k1 = Math.hypot((p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2]));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}
const sphereDist = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;

// lip roll centre line along the gape, sunk so the roll protrudes by `out`
function lipLine(sign, radii, out) {
  return MOUTH.map(([s, y], i) => {
    const r = radii[i];
    const { p, n } = surfaceAt(s, y + sign * r * 0.9);
    if (i === 0) return [s + 0.05, y + sign * r * 0.9, 0];
    return [p[0] - n[0] * (r - out), p[1] - n[1] * (r - out), p[2] - n[2] * (r - out)];
  });
}

function onSurface(poly, inset = 0) {
  return poly.map(([s, y]) => {
    const { p, n } = surfaceAt(s, y);
    return [p[0] - n[0] * inset, p[1] - n[1] * inset, p[2] - n[2] * inset];
  });
}

function buildFeatures() {
  const n = MOUTH.length;
  // thick, fleshy upper lip all along the front (the snout's lower edge), thinner toward the corner;
  // the lower lip is thin and sits inside the upper one
  const ru = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.62 - 0.22 * f - 0.08 * f * f; });
  const rl = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.36 - 0.12 * f; });
  const lipsU = capsuleChain(lipLine(1, ru, 0.3), ru);
  const lipsL = capsuleChain(lipLine(-1, rl, 0.14).map((p, i) => (i === 0 ? [p[0] + 0.25, p[1], p[2]] : [p[0] + 0.1, p[1], p[2] * 0.97])), rl);
  const gape = onSurface(MOUTH, 0.0);
  gape[0] = [MOUTH[0][0] - 0.1, MOUTH[0][1], 0];
  const crease = capsuleChain(gape, MOUTH.map((_, i) => 0.09 - 0.03 * (i / (n - 1))));
  const operc = capsuleChain(onSurface(OPERCLE, 0.0), OPERCLE.map((_, i, a) => (i === 0 || i === a.length - 1 ? 0.03 : 0.09)));
  const preop = capsuleChain(onSurface(PREOPERCLE, 0.0), PREOPERCLE.map(() => 0.05));
  // gill slit: the free edge of the cover in front of the pectoral base (short, ventrolateral)
  const slit = capsuleChain(onSurface([[16.0, 4.9], [16.2, 3.9], [15.8, 2.6]], 0.0), [0.06, 0.12, 0.05]);
  const E = EYE;
  const eyeL = { c: E.center, t: [E.center[0] + TURRET.dc[0], E.center[1] + TURRET.dc[1], E.center[2] + TURRET.dc[2]] };
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], t: [eyeL.t[0], eyeL.t[1], -eyeL.t[2]] };
  return {
    lipsU, lipsUR: mirrorZ(lipsU), lipsL, lipsLR: mirrorZ(lipsL), crease, creaseR: mirrorZ(crease),
    operc, opercR: mirrorZ(operc), preop, preopR: mirrorZ(preop), slit, slitR: mirrorZ(slit),
    eyes: [eyeL, eyeR],
    // swollen opercular chamber (mudskippers hold water there on land) and the throat under it
    cheek: [12.4, 4.6, 4.75],
    throat: [11.0, 1.2, 0],
    pecLobe: [17.6, 3.15, 4.6],
    pelvicBase: [20.6, 0.3, 0],
    papilla: [36.4, botY(36.4) + 0.02, 0],
    nape: [17.5, topY(17.5) - 0.4, 0],
    interorb: [7.0, topY(7.0) + 0.2, 0],
    nostril: [1.6, 5.4, 2.6],
  };
}

export const FEAT = buildFeatures();

/**
 * Sculpted signed distance field (mm). Negative inside.
 * opts.cup = false closes the eye cups (dermal cup drawn over a retracted eye), opts.breathe inflates the
 * opercular chambers and the throat (buccal / opercular pumping on land).
 */
export function field(s, y, z, opts = null) {
  const F = FEAT;
  const p = [s, y, z];
  const az = Math.abs(z);
  const pm = [s, y, az];
  const L = z >= 0;
  const breathe = opts?.breathe ?? 0;
  let d = baseDist(s, y, z);
  // swollen cheeks / opercular chambers and the throat (branchiostegal region)
  if (s > 4 && s < 19) {
    d = smin(d, ellipsoidDist(pm, F.cheek, [4.6, 3.4 + 0.25 * breathe, 1.35 + 0.45 * breathe]), 1.4);
    d = smin(d, ellipsoidDist(p, [F.throat[0], F.throat[1] - 0.35 * breathe, 0], [4.4, 1.25 + 0.3 * breathe, 3.6]), 1.2);
  }
  // eye turrets
  if (s < 11) for (const e of F.eyes) d = smin(d, sphereDist(p, e.t, TURRET.r), 1.3);
  // nape hump (epaxial muscles behind the skull)
  // fleshy lips
  if (s < 9 && y < 3.5) {
    d = smin(d, capsuleChainDist(p, L ? F.lipsU : F.lipsUR), 0.22);
    d = smin(d, capsuleChainDist(p, L ? F.lipsL : F.lipsLR), 0.2);
  }
  // pectoral fin base (the muscular lobe the arm grows out of)
  if (s > 14 && s < 21.5) d = smin(d, ellipsoidDist(pm, F.pecLobe, [2.3, 1.9, 1.05]), 0.8);
  // pelvic base
  if (s > 17 && s < 24.5) d = smin(d, ellipsoidDist(p, F.pelvicBase, [2.4, 0.55, 1.7]), 0.6);
  // urogenital papilla
  if (s > 35 && s < 38) d = smin(d, sphereDist(p, F.papilla, 0.42), 0.25);

  // --- subtractions
  if (s < 11) {
    if (opts?.cupL ?? opts?.cup ?? true) d = smax(d, -sphereDist(p, F.eyes[0].c, CAVITY_R), 0.5);
    if (opts?.cupR ?? opts?.cup ?? true) d = smax(d, -sphereDist(p, F.eyes[1].c, CAVITY_R), 0.5);
  }
  if (s > 4 && s < 9.5) d = smax(d, -ellipsoidDist(p, F.interorb, [2.6, 0.45, 0.5]), 0.5);
  if (s < 9 && y < 3.5) d = smax(d, -capsuleChainDist(p, L ? F.crease : F.creaseR), 0.05);
  if (s > 12.5 && s < 17) d = smax(d, -capsuleChainDist(p, L ? F.operc : F.opercR), 0.12);
  if (s > 9.5 && s < 12.5) d = smax(d, -capsuleChainDist(p, L ? F.preop : F.preopR), 0.1);
  if (s > 15 && s < 17) d = smax(d, -capsuleChainDist(p, L ? F.slit : F.slitR), 0.05);
  return d;
}

export function fieldGrad(s, y, z, opts = null, e = 0.004) {
  return norm3([
    field(s + e, y, z, opts) - field(s - e, y, z, opts),
    field(s, y + e, z, opts) - field(s, y - e, z, opts),
    field(s, y, z + e, opts) - field(s, y, z - e, opts),
  ]);
}

/** Origin of the projection ray for a loft section (rays stay inside their own cross-section). */
export function rayOrigin(s) {
  // the snout is projected from one point behind it, so the rays fan out over the front of the face without
  // crossing (per-section rays there would run steeply down through the lips and fold the first rows)
  const S_TIP = 3.2;
  if (s < S_TIP + 1.5) {
    const qt = section(S_TIP);
    const tip = [S_TIP, qt.yc, 0];
    if (s <= S_TIP) return tip;
    const f = smoothstep(S_TIP, S_TIP + 1.5, s);
    const q = section(s);
    return [tip[0] + (s - tip[0]) * f, tip[1] + (q.yc - tip[1]) * f, 0];
  }
  const sc = clamp(s, 0.6, S_END - 0.6);
  const q = section(sc);
  return [sc, q.yc, 0];
}

/** Moves a base-loft point onto the sculpted surface along the ray from the section origin. */
export function project(p0, opts = null) {
  const o = rayOrigin(p0[0]);
  let dir = [p0[0] - o[0], p0[1] - o[1], p0[2] - o[2]];
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  if (L < 1e-6) return p0.slice();
  dir = [dir[0] / L, dir[1] / L, dir[2] / L];
  const at = (t) => field(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t, opts);
  let t0 = Math.max(0.02, L - 2.0);
  while (t0 > 0.02 && at(t0) > 0) t0 = Math.max(0.02, t0 - 0.8);
  const step = 0.05;
  let t1 = t0, found = false;
  for (let i = 0; i < 220; i++) {
    const t = t0 + step * (i + 1);
    if (at(t) > 0) { t1 = t; found = true; break; }
    t0 = t;
  }
  if (!found) return p0.slice();
  let lo = t0, hi = t1;
  for (let i = 0; i < 16; i++) {
    const m = 0.5 * (lo + hi);
    if (at(m) > 0) hi = m; else lo = m;
  }
  const t = 0.5 * (lo + hi);
  return [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
}

/** Fish-space (mm) -> glTF object space (m). */
export const toObject = (p) => [p[2] / 1000, (p[1] - Y0) / 1000, (S0 - p[0]) / 1000];
export const dirToObject = (d) => [d[2], d[1], -d[0]];

export { smoothstep, clamp };
