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
/** skin texture layout (u): the body loft, then a strip for the pectoral arms, then one for the eye domes */
export const BODY_U = 0.84;
export const ARM_U = [0.84, 0.92];
export const DOME_U = [0.92, 1.0];
// Texture coordinate along the body, t ∈ [0, 1] (u = t · BODY_U): quadratic over the snout cap, where the loft
// rows converge on the tip (s ∝ t² keeps texels square there instead of long radial wedges), linear behind it.
const UV_CAP = 2.4;
const UV_T1 = (2 * UV_CAP) / (S_END + UV_CAP);
const UV_A = UV_CAP / (UV_T1 * UV_T1), UV_M = (2 * UV_CAP) / UV_T1;
export const uvS = (t) => (t <= UV_T1 ? UV_A * t * t : UV_CAP + UV_M * (t - UV_T1));
export const uvT = (s) => (s <= UV_CAP ? Math.sqrt(Math.max(0, s) / UV_A) : UV_T1 + (s - UV_CAP) / UV_M);

// ---------------------------------------------------------------------------
// Profile key points (pre-cap dimensions, mm)
const KS = [0, 0.3, 0.7, 1.2, 1.8, 2.6, 3.6, 4.8, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 63, 64.5, 66];
// Profiles measured on lateral photographs of live and preserved adults (TL 80 mm; snout tip 4 mm up, blunt and
// rounded; the forehead climbs steeply to the eyes; deepest at the first dorsal fin, ~15 % TL; the belly a little
// below the throat; a long, low caudal peduncle):
// dorsal profile (without the eyes)
const KTOP = [4.6, 5.9, 6.9, 7.7, 8.3, 8.85, 9.25, 9.55, 9.85, 10.3, 10.6, 10.8, 10.95, 11.05, 11.15, 11.25, 11.4, 11.4, 11.2, 10.9, 10.45, 9.95, 9.35, 8.7, 8.1, 7.65, 7.4, 7.25, 7.1];
// ventral profile: under the snout tip the fleshy upper lip, the lower jaw and the throat curving down to the chest;
// the belly sags a little below the chest, the tail's lower edge rises to the peduncle
const KBOT = [3.3, 2.7, 2.15, 1.75, 1.4, 1.1, 0.85, 0.62, 0.44, 0.22, 0.08, 0.0, 0.0, 0.0, 0.0, -0.3, -0.55, -0.6, -0.4, -0.1, 0.25, 0.65, 1.05, 1.4, 1.7, 1.95, 2.1, 2.15, 2.2];
// half width: the snout is a rounded bulb about as tall as it is wide (head-on it stands out from the face, in
// three-quarter view it overhangs the mouth); the face widens behind the mouth to smooth, full cheeks (head ~1.05 ×
// as wide as deep); a stout trunk tapering to the peduncle
const KW = [2.4, 2.7, 3.05, 3.35, 3.6, 3.95, 4.25, 4.55, 4.8, 5.1, 5.3, 5.4, 5.35, 5.25, 5.2, 5.4, 5.15, 4.8, 4.4, 3.95, 3.45, 2.95, 2.5, 2.1, 1.75, 1.45, 1.2, 0.95, 0.55];
// superellipse exponents (top / bottom): a rounded muzzle; behind it a broad, flattish crown (the eyes sit on its upper
// corners) over a full, flat-bottomed face; round trunk, oval tail
const KNT = [2.0, 2.0, 2.05, 2.15, 2.3, 2.55, 2.8, 2.95, 2.95, 2.85, 2.6, 2.4, 2.25, 2.15, 2.15, 2.15, 2.15, 2.1, 2.1, 2.05, 2.05, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0];
const KNB = [2.0, 2.05, 2.1, 2.15, 2.2, 2.3, 2.45, 2.6, 2.75, 2.85, 2.85, 2.8, 2.75, 2.7, 2.65, 2.6, 2.5, 2.45, 2.4, 2.35, 2.3, 2.2, 2.15, 2.1, 2.05, 2.0, 2.0, 2.0, 2.0];
// height of the widest point relative to the mid-height: round at the muzzle, the cheeks full and low behind the mouth
const KDY = [0, 0, 0, 0, 0, -0.05, -0.15, -0.35, -0.6, -0.9, -1.05, -1.05, -0.95, -0.8, -0.6, -0.45, -0.25, -0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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
const SNOUT_CAP = 2.4, SNOUT_E = 2.5;
const SNOUT_CAP_W = 2.8, SNOUT_E_W = 2.5;
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
// Eyes. Each eyeball sits in a fleshy socket on top of the head; the two sockets almost touch over the narrow
// interorbital. Eyeball Ø 3.5 mm, centre 6.4 mm behind the snout, nested in the head's upper profile with its upper
// half standing above it (it can be raised further, and pulled right down into the orbit). Seen from the side
// and from the front the big pupil faces the camera: the optical axis points forward, outward and a little up
// (Ø, positions and the axis read from lateral and frontal close-ups of live animals).
// Retraction ("blinking", Aiello et al. 2023 PNAS): the eyeball sinks ~2.4 mm into the orbit and the dermal cup
// closes over it.
export const EYE = {
  center: [6.4, 10.8, 2.2],
  radius: 1.75,
  // the eyes look out to the side, a little forward (~19°) and up (~14°): photographed from the side the pupil
  // faces the camera, head-on the dark eye shows on the outer front of each dome
  axis: norm3([-0.32, 0.24, 0.92]),
  retract: 2.3,
};
// at rest the globe looks a little above the window's axis (the pupil sits just above the window's middle)
{
  const fr = eyeFrame(EYE.axis), k = (4 * Math.PI) / 180;
  EYE.gaze = norm3(EYE.axis.map((x, i) => x * Math.cos(k) + fr.v[i] * Math.sin(k)));
}
// dermal cup: skin over the eyeball everywhere except a large window around the optical axis, so the globe shows
// as a big, slightly wide oval on the outer front of a rounded dome (half-angles ~58° fore and aft, ~44° up and
// down; photographs: most of the eye's lateral face is the dark eye, the skin wraps its lower and rear part, pinkish
// under it); the two domes meet over the narrow interorbital. Solid (no cavity): the eyeball mesh fills the window,
// and a retracting eye simply sinks under it.
export const CUP = { skin: 0.06, halfH: (58 * Math.PI) / 180, halfV: (44 * Math.PI) / 180 };
/** window frame of an eye: the axis, a horizontal tangent and the vertical one (fish space) */
export function eyeFrame(a) {
  const h = norm3([a[2], 0, -a[0]]); // horizontal, perpendicular to the axis
  const v = [a[1] * h[2] - a[2] * h[1], a[2] * h[0] - a[0] * h[2], a[0] * h[1] - a[1] * h[0]];
  return { a, h, v: v[1] < 0 ? v.map((x) => -x) : v };
}
/** > 0 inside the (elliptical) window of the cup, < 0 where the skin covers the globe; ~mm near the rim */
export function windowField(o, fr) {
  const w = o[0] * fr.a[0] + o[1] * fr.a[1] + o[2] * fr.a[2];
  const u = o[0] * fr.h[0] + o[1] * fr.h[1] + o[2] * fr.h[2];
  const v = o[0] * fr.v[0] + o[1] * fr.v[1] + o[2] * fr.v[2];
  // angular radius in the ellipse's metric, 1 on the rim
  const k = Math.hypot(Math.atan2(u, w) / CUP.halfH, Math.atan2(v, w) / CUP.halfV);
  return (1 - k) * EYE.radius * CUP.halfV;
}

// Gape (where the lips meet), side view on the +z side: from the front midline under the snout back to the mouth
// corner. A small mouth at the front of the muzzle, under the overhanging snout and its thick upper lip; head-on it
// is a short arch with the corners turned down (~60 % of the face's width); the jaw itself reaches back under the
// eye, where the posterior lobe of the upper lip lies over it as a pale pad behind the corner.
export const MOUTH = [[0.85, 2.95], [1.35, 2.88], [1.9, 2.72], [2.45, 2.47], [2.95, 2.17], [3.4, 1.88]];
export const RICTUS_S = 3.4;
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
  const ru = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.72 - 0.22 * f; });
  const rl = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.44 - 0.1 * f; });
  void ru; void rl;
  // the gape line on the skin (front midline → corner), for the lip displacements
  const gape = onSurface(MOUTH, 0.0);
  gape[0] = [MOUTH[0][0] - 0.05, MOUTH[0][1], 0];
  // a short extension behind the corner: the line of the jaw under the lip pad
  const gx = [...gape, (() => { const q = surfaceAt(RICTUS_S + 1.6, MOUTH[MOUTH.length - 1][1] - 0.35); return q.p; })()];
  let acc = 0;
  const gapeU = gx.map((p, i) => (i === 0 ? 0 : (acc += Math.hypot(p[0] - gx[i - 1][0], p[1] - gx[i - 1][1], p[2] - gx[i - 1][2]))));
  const gapeLen = gapeU[gape.length - 1];
  // the gill cover's edge is only a soft line in the skin of a live animal
  const operc = capsuleChain(onSurface(OPERCLE, 0.0), OPERCLE.map((_, i, a) => (i === 0 || i === a.length - 1 ? 0.02 : 0.06)));
  const preop = capsuleChain(onSurface(PREOPERCLE, 0.0), PREOPERCLE.map(() => 0.025));
  // gill slit: the free edge of the cover in front of the pectoral base (short, ventrolateral)
  const slit = capsuleChain(onSurface([[16.0, 4.9], [16.2, 3.9], [15.8, 2.6]], 0.0), [0.06, 0.12, 0.05]);
  const E = EYE;
  const eyeL = { c: E.center, a: E.axis, fr: eyeFrame(E.axis) };
  const aR = [E.axis[0], E.axis[1], -E.axis[2]];
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], a: aR, fr: eyeFrame(aR) };
  // the posterior lobe of the upper lip: an oval pad on each side just behind the mouth corner (pale, studded with
  // sensory pores)
  const lp = surfaceAt(4.3, 2.25);
  const lipPad = { c: lp.p, n: lp.n };
  return {
    gapeLine: gx, gapeU, gapeLen,
    operc, opercR: mirrorZ(operc), preop, preopR: mirrorZ(preop), slit, slitR: mirrorZ(slit),
    eyes: [eyeL, eyeR],
    lipPad,
    // the opercular chamber (inflated with water on land: the breathe morph) and the throat under it
    cheek: [11.6, 4.2, 4.5],
    throat: [9.0, 1.05, 0],
    pecLobe: [17.6, 3.15, 4.95],
    pelvicBase: [20.6, 0.3, 0],
    papilla: [36.4, botY(36.4) + 0.02, 0],
    nape: [17.5, topY(17.5) - 0.4, 0],
    interorb: [7.4, EYE.center[1] + 0.2, 0],
    nostril: [1.6, 5.4, 2.6],
  };
}

export const FEAT = buildFeatures();

/** closest point on the gape line (+z side): its arc parameter (0 = front midline … 1 = mouth corner), offset vector */
function nearGape(p) {
  const P = FEAT.gapeLine, U = FEAT.gapeU;
  let best = Infinity, bu = 0, bq = P[0];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2, 0, 1);
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) { best = d; bq = q; bu = (U[i] + (U[i + 1] - U[i]) * t) / FEAT.gapeLen; }
  }
  return { d: best, u: bu, dy: p[1] - bq[1] };
}

/**
 * Outward displacement (mm) of the lips (p on the +z side): a thick, rounded upper lip just above the gape line,
 * a thinner lower lip below it, a fine crease where they meet; both fade past the mouth corner into the lip pad, an
 * oval cushion on the side of the jaw behind the corner.
 */
function lipRelief(p) {
  const g = nearGape(p);
  const fade = 1 - smoothstep(0.92, 1.25, g.u);
  // upper lip: a roll ~1.1 mm high centred 0.55 mm above the line; lower lip ~0.7 mm, 0.35 mm below
  // (a shallow notch in the middle of the upper lip)
  const notch = 1 - 0.08 * Math.exp(-((p[2] / 0.8) ** 2));
  const up = g.dy > -0.05 ? (0.27 - 0.1 * g.u) * notch * Math.exp(-(((g.d - 0.6) / 0.55) ** 2)) : 0;
  const lo = g.dy < 0.05 ? (0.17 - 0.05 * g.u) * Math.exp(-(((g.d - 0.35) / 0.32) ** 2)) : 0;
  const crease = 0.07 * Math.exp(-((g.d / 0.11) ** 2));
  let r = (up + lo) * fade - crease * fade;
  // the lip pad: a plump, glossy oval cushion (~4 × 2.7 mm) standing out of the cheek at the mouth's corner
  const c = FEAT.lipPad.c, n = FEAT.lipPad.n;
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const h = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  const t0 = v[0] - n[0] * h, t1 = v[1] - n[1] * h, t2 = v[2] - n[2] * h;
  const e = (t0 / 2.0) ** 2 + (t1 / 1.35) ** 2 + (t2 / 1.35) ** 2;
  r += 0.62 * Math.exp(-(e ** 2.2) * 1.4);
  return r;
}

/**
 * Sculpted signed distance field (mm). Negative inside.
 * opts.cup / cupL / cupR = false swell the socket skin shut over a retracted eye (blink), opts.breathe inflates the
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
  if (s > 3.5 && s < 19) {
    // inside the loft at rest (a smooth, full face); swells out when the chambers are pumped full
    d = smin(d, ellipsoidDist(pm, F.cheek, [5.0, 3.5 + 0.2 * breathe, 1.25 + 0.5 * breathe]), 0.7);
    d = smin(d, ellipsoidDist(p, [F.throat[0], F.throat[1] - 0.35 * breathe, 0], [4.6, 1.3 + 0.3 * breathe, 4.0]), 1.0);
  }
  // eye domes (meshed separately from the body loft, see body.mjs buildDomes): the cup, cut open around the axis;
  // blinking, the eye sinks and the cup closes into a lower dome
  if (opts?.dome && s < 12) F.eyes.forEach((e, i) => {
    const R = EYE.radius + CUP.skin;
    const ox = p[0] - e.c[0], oy = p[1] - e.c[1], oz = p[2] - e.c[2];
    const shut = (i === 0 ? opts?.cupL : opts?.cupR) === false || opts?.cup === false;
    let cup;
    if (shut) cup = Math.hypot(ox + 0.15, oy + 1.15, oz + 0.1 * Math.sign(e.c[2])) - (R - 0.1);
    // (the margin of the window rolls over like a thick lid's edge)
    else cup = smax(Math.hypot(ox, oy, oz) - R, windowField([ox, oy, oz], e.fr), 0.3);
    // a fleshy base under each dome, so the ball rises out of the forehead with a modest fillet (not a cone)
    const sg = Math.sign(e.c[2]);
    d = smin(d, ellipsoidDist(p, [e.c[0] + 0.2, e.c[1] - 1.5, e.c[2] - 0.1 * sg], [2.2, 1.05, 1.9]), 1.2);
    d = smin(d, cup, 1.1);
    // the lower lid: a thick fold of the cup under the window
    if (!shut) d = smin(d, ellipsoidDist(p, [e.c[0] + 0.15, e.c[1] - 1.3, e.c[2] + 0.2 * sg], [1.8, 0.95, 1.7]), 0.5);
  });
  // upper-lip pads
  // lips and the lip pad: smooth displacements of the surface along the gape line (no creases, no folds)
  if (s < 8.5 && y < 5.2) d -= lipRelief(pm);
  // nape hump (epaxial muscles behind the skull)
  // fleshy lips
  // pectoral fin base (the muscular lobe the arm grows out of)
  if (s > 14 && s < 21.5) d = smin(d, ellipsoidDist(pm, F.pecLobe, [2.3, 1.9, 1.05]), 0.8);
  // pelvic base
  if (s > 17 && s < 24.5) d = smin(d, ellipsoidDist(p, F.pelvicBase, [2.4, 0.55, 1.7]), 0.6);
  // urogenital papilla
  if (s > 35 && s < 38) d = smin(d, sphereDist(p, F.papilla, 0.42), 0.25);

  // --- subtractions
  if (s > 3.5 && s < 11.5) d = smax(d, -ellipsoidDist(p, F.interorb, [3.0, 0.8, 0.32]), 0.35);
  // (no gill-cover grooves: in a live animal the cover's edge does not show through the skin; only the small gill
  // slit, low in front of the pectoral base)
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

/** station (s) of the eye sockets' centre, the focus of the head's projection rays */
const S_SOCKET = 7.6;
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
  // the head behind the snout: the origins are drawn toward the eye sockets' station, so the rays fan forward and
  // backward and meet the sockets' front and back walls at an angle (per-section rays, which lie in the section's
  // plane, would graze those walls and flute them)
  const w = 0.7 * smoothstep(S_TIP + 1.5, S_TIP + 3.3, s) * smoothstep(13.5, 10.5, s);
  const sc = clamp(s + (S_SOCKET - s) * w, 0.6, S_END - 0.6);
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
