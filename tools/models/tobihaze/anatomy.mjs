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
// Profiles measured on lateral photographs of live and preserved adults, overlaid on the model (TL 80 mm): a blunt,
// rounded snout - no point: its front is a tall bulb (~3.7 mm) whose most forward point lies just above the small,
// low mouth, and from it the face rises steeply and full to the eyes, which sit about half a head length back; the
// underside of the head is nearly flat back to the throat; deepest at the first dorsal fin, ~15 % TL; the belly a
// little below the throat; a long, low caudal peduncle:
// dorsal profile (without the eyes)
const KTOP = [5, 5.5, 6, 6.5, 7, 7.65, 8.3, 8.8, 9.15, 9.5, 9.6, 9.65, 9.7, 9.75, 9.95, 10.2, 10.7, 11.2, 11.1, 10.9, 10.45, 9.95, 9.35, 8.7, 8.1, 7.65, 7.4, 7.25, 7.1];
// ventral profile: under the snout tip the fleshy upper lip, the lower jaw and the throat curving down to the chest;
// the belly sags a little below the chest, the tail's lower edge rises to the peduncle
const KBOT = [1.2, 0.6, 0.25, -0.1, -0.4, -0.65, -0.85, -0.95, -1, -0.95, -0.85, -0.75, -0.65, -0.55, -0.47, -0.5, -0.6, -0.6, -0.4, -0.1, 0.25, 0.65, 1.05, 1.4, 1.7, 1.95, 2.1, 2.15, 2.2];
// half width: the snout is a rounded bulb narrower than the face (head-on it stands out from the face, in
// three-quarter view it overhangs the mouth), so the mouth is about half as wide as the face; behind it the face
// swells to broad, full cheeks (head ~1.05 × as wide as deep); a stout trunk tapering to the peduncle
const KW = [1.7, 2.05, 2.4, 2.75, 3.1, 3.45, 3.95, 4.55, 5.1, 5.6, 5.95, 6.05, 5.95, 5.75, 5.55, 5.55, 5.15, 4.8, 4.4, 3.95, 3.45, 2.95, 2.5, 2.1, 1.75, 1.45, 1.2, 0.95, 0.55];
// superellipse exponents (top / bottom): a rounded muzzle; head-on the head is bell-shaped, rounded and narrowing up
// to the eyes over a full, flat-bottomed face (photographs of the face head-on); round trunk, oval tail
const KNT = [1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.8, 1.88, 1.95, 2, 2.05, 2.15, 2.1, 2.1, 2.05, 2.05, 2, 2, 2, 2, 2, 2, 2, 2];
const KNB = [2, 2.05, 2.1, 2, 2, 2, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3, 2.4, 2.4, 2.4, 2.6, 2.5, 2.45, 2.4, 2.35, 2.3, 2.2, 2.15, 2.1, 2.05, 2, 2, 2, 2];
// height of the widest point relative to the mid-height: low on the snout (head-on a bell, broad at the mouth and
// narrowing up to the eyes), the cheeks full and low behind the mouth (the face is widest at about a third of its
// height)
const KDY = [-0.55, -0.55, -0.55, -0.55, -0.6, -0.65, -0.75, -0.95, -1.25, -1.7, -1.85, -1.75, -1.55, -1.25, -0.9, -0.6, -0.3, -0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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

// blunt snout: the profiles are rounded off over the first ~2 mm (an elliptical cap: a rounded front, not a flat one)
const SNOUT_CAP = 1.6, SNOUT_E = 2.2;
const SNOUT_CAP_W = 2.0, SNOUT_E_W = 2.2;
const TAIL_BLADE0 = 60.0;

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
// Eyes. Each eyeball sits on top of the head, about half a head length behind the snout tip (the forehead slopes down
// in front of it to the blunt snout); the two almost touch over the narrow interorbital. Eyeball Ø 3.0 mm (~0.3 of
// the head's depth), its centre at the height of the dorsal profile behind it, so its upper half stands above the
// head (it can be raised further, and pulled right down into the orbit). Positions read from lateral close-ups of
// live animals.
// Retraction ("blinking", Aiello et al. 2023 PNAS): the eyeball sinks ~2 mm into the orbit and the dermal cup
// closes over it.
export const EYE = {
  center: [7.6, 10.3, 1.72],
  radius: 1.52,
  // the eyes look out to the side, a little forward (~19°) and up (~14°): photographed from the side the pupil
  // faces the camera, head-on the dark eye shows on the outer front of each globe
  axis: norm3([-0.32, 0.24, 0.92]),
  retract: 2.0,
};
// at rest the globe looks a little above the optical axis' rest direction
{
  const fr = eyeFrame(EYE.axis), k = (4 * Math.PI) / 180;
  EYE.gaze = norm3(EYE.axis.map((x, i) => x * Math.cos(k) + fr.v[i] * Math.sin(k)));
}
// dermal cup: a thick skin cup holds the lower part of each eyeball (down, in and a little back: half-angle ~84°
// about that direction), so the globe's upper and outer face is bare - its lid margin runs ~30° below the eye's
// equator at the side, just under the pupil; below the margin the cup narrows a little into a short fleshy neck that
// rises out of the head with a small fillet (lateral photographs). Solid (no cavity): the eyeball mesh fills the
// rest, and a retracting eye simply sinks into it.
export const CUP = { skin: 0.11, cover: (90 * Math.PI) / 180, down: [0.1, -1, -0.45] };
/** window frame of an eye: the axis, a horizontal tangent and the vertical one (fish space) */
export function eyeFrame(a) {
  const h = norm3([a[2], 0, -a[0]]); // horizontal, perpendicular to the axis
  const v = [a[1] * h[2] - a[2] * h[1], a[2] * h[0] - a[0] * h[2], a[0] * h[1] - a[1] * h[0]];
  return { a, h, v: v[1] < 0 ? v.map((x) => -x) : v };
}
/** the cup's axis for an eye on the side sg (+1 left): down, medial and a little back */
export const cupDown = (sg) => norm3([CUP.down[0], CUP.down[1], CUP.down[2] * sg]);
/** signed angle (rad) of the direction o (from the eye's centre) from the cup's lid margin: > 0 bare globe, < 0 cup */
export function windowAngle(o, D) {
  const l = Math.hypot(o[0], o[1], o[2]) || 1;
  return Math.acos(clamp((o[0] * D[0] + o[1] * D[1] + o[2] * D[2]) / l, -1, 1)) - CUP.cover;
}
/** > 0 where the globe is bare, < 0 where the cup covers it; ~mm near the margin */
export function windowField(o, D) {
  return windowAngle(o, D) * EYE.radius;
}

// Gape (where the lips meet), side view on the +z side: from the front midline under the snout back to the mouth
// corner. A small mouth low under the blunt, overhanging snout (subterminal: the snout's front stands ~1 mm above
// and ahead of it): a short gape, head-on a small arch with the corners turned down and in (~40 % of the face's
// width; photographs head-on and in three-quarter view); the jaw itself reaches on back under the eye, hidden under
// the posterior lobe of the upper lip, a pale teardrop pad right behind the corner.
export const MOUTH = [[1.0, 2.05], [1.45, 1.99], [1.95, 1.82], [2.45, 1.52], [2.9, 1.12]];
export const RICTUS_S = 2.9;
// gill-cover margin, top → bottom: the rear and lower edge of the inflated opercular chamber, which stands proud of
// the body behind it as a rounded plate with a crisp rim (lateral photographs; the gill opening itself, small and
// ventrolateral, lies under the rim in front of the pectoral base), and the preopercle
export const OPERCLE = [[14.4, 8.7], [15.7, 7.4], [16.5, 5.8], [16.75, 4.2], [16.35, 2.7], [15.4, 1.3], [14.3, 0.4]];
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
  const eyeL = { c: E.center, a: E.axis, fr: eyeFrame(E.axis), D: cupDown(1) };
  const aR = [E.axis[0], E.axis[1], -E.axis[2]];
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], a: aR, fr: eyeFrame(aR), D: cupDown(-1) };
  // the posterior lobe of the upper lip: an oval pad on each side just behind the mouth corner (pale, studded with
  // sensory pores)
  const lp = surfaceAt(3.75, 1.45);
  const lipPad = { c: lp.p, n: lp.n };
  return {
    gapeLine: gx, gapeU, gapeLen,
    operc, opercR: mirrorZ(operc), preop, preopR: mirrorZ(preop), slit, slitR: mirrorZ(slit),
    eyes: [eyeL, eyeR],
    lipPad,
    // the opercular chamber (inflated with water on land: the breathe morph) and the throat under it
    cheek: [11.6, 4.2, 4.5],
    jowl: [6.8, 3.2, 3.8],
    throat: [9.0, 1.05, 0],
    pecLobe: [17.6, 3.15, 4.95],
    pelvicBase: [20.6, 0.3, 0],
    papilla: [36.4, botY(36.4) + 0.02, 0],
    nape: [17.5, topY(17.5) - 0.4, 0],
    interorb: [8.4, EYE.center[1] + 0.2, 0],
    nostril: [1.6, 5.4, 2.6],
  };
}

export const FEAT = buildFeatures();

/** closest point on the gape line (+z side): its arc parameter (0 = front midline … 1 = mouth corner), offset vector */
function nearGape(p) {
  const P = FEAT.gapeLine, U = FEAT.gapeU;
  const seg = [];
  let best = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = clamp(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2, 0, 1);
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    seg.push([d, (U[i] + (U[i + 1] - U[i]) * t) / FEAT.gapeLen, p[1] - q[1]]);
    best = Math.min(best, d);
  }
  // (the position along the line and the height above it are blended over the segments nearly as close as the
  // nearest: taken from the nearest alone they would jump where it changes - inside a bend of the line - and the lips
  // would step there)
  let w = 0, u = 0, dy = 0;
  for (const [d, su, sdy] of seg) { const k = Math.exp(-(((d - best) / 0.12) ** 2)); w += k; u += k * su; dy += k * sdy; }
  return { d: best, u: u / w, dy: dy / w };
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
  // (the roll is lowest head-on, under the overhanging snout: it shows mainly at the sides of the mouth)
  const notch = 0.7 + 0.3 * smoothstep(0.4, 1.6, Math.abs(p[2]));
  // (each lip fades in smoothly across the gape line: a step there would crease the skin)
  const up = smoothstep(-0.2, 0.05, g.dy) * (0.3 - 0.12 * g.u) * notch * Math.exp(-(((g.d - 0.55) / 0.65) ** 2));
  const lo = smoothstep(0.2, -0.05, g.dy) * (0.11 - 0.04 * g.u) * Math.exp(-(((g.d - 0.3) / 0.3) ** 2));
  const crease = 0.07 * Math.exp(-((g.d / 0.09) ** 2));
  // the lower jaw is set back under the overhanging upper lip (profile photographs: the outline steps back under
  // the lip), most at the front of the mouth
  const recess = smoothstep(0.1, -0.15, g.dy) * 0.24 * (1 - smoothstep(0.2, 0.75, g.u)) * Math.exp(-(((g.d - 0.75) / 0.7) ** 2));
  let r = (up + lo) * fade - crease * fade - recess;
  // the lip pad: a plump, glossy teardrop cushion (~3.8 × 2.6 mm) standing out of the cheek at the mouth's corner
  const c = FEAT.lipPad.c, n = FEAT.lipPad.n;
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const h = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  const t0 = v[0] - n[0] * h, t1 = v[1] - n[1] * h, t2 = v[2] - n[2] * h;
  // (a teardrop: fuller behind, narrowing forward toward the mouth corner)
  const fwd = smoothstep(0.6, -1.6, t0);
  const e = (t0 / 2.0) ** 2 + (t1 / (1.45 - 0.4 * fwd)) ** 2 + (t2 / (1.45 - 0.4 * fwd)) ** 2;
  r += 0.62 * Math.exp(-(e ** 1.7) * 1.3);
  return r;
}

/** s of the gill-cover margin at height y (the margin is single-valued in y), or -1 outside its span */
function opercS(y) {
  const P = OPERCLE;
  if (y > P[0][1] || y < P[P.length - 1][1]) return -1;
  for (let i = 0; i < P.length - 1; i++) {
    const [s0, y0] = P[i], [s1, y1] = P[i + 1];
    if (y <= y0 && y >= y1) return s0 + ((s1 - s0) * (y0 - y)) / (y0 - y1);
  }
  return -1;
}

/**
 * Outward displacement (mm) of the gill cover (p on the +z side): a plate over the opercular chamber, domed in its
 * middle, rising sharply at its rear and lower margin (a rim ~0.3 mm proud of the body behind it, with a fine crease
 * under it), fading into the face in front and under the throat.
 */
function opercRelief(p, w) {
  const [s, y, z] = p;
  const sc = opercS(clamp(y, OPERCLE[OPERCLE.length - 1][1], OPERCLE[0][1]));
  const sd = sc - s; // > 0 in front of the margin (on the cover)
  const lateral = smoothstep(0.35, 0.65, z / Math.max(w, 1e-3));
  const span = smoothstep(0.3, 1.3, y) * smoothstep(8.2, 6.2, y);
  const front = smoothstep(6.0, 10.5, s);
  const plate = smoothstep(-0.08, 0.38, sd);
  const dome = Math.exp(-(((s - 12.6) / 3.2) ** 2) - (((y - 4.6) / 2.6) ** 2));
  const crease = Math.exp(-(((sd + 0.1) / 0.15) ** 2));
  return lateral * span * (front * plate * (0.24 + 0.2 * dome) - 0.05 * crease);
}

// the pectoral arm's bind frame (fish space, left side); fins.mjs builds the arm and its web in it, rig.mjs puts the
// shoulder joint at `base`. The arm is bound as it stands when the fish is propped on its pectorals (photographs:
// thick fleshy limbs going down from the lower flank like legs, fused broadly into it, the fin's broad side fore and
// aft), so the poses it spends its time in bend its root least. `legacy` is the swept-back frame the motor's fixed fin
// poses were authored against (build.mjs exports the turn between the two so those poses come out as before).
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const PEC_AXIS = (() => {
  const ref = [0, 1, -0.25];
  const ldir = norm3([0.6, -0.58, 0.55]);
  const lwidth = norm3(ref.map((x, i) => x - ldir[i] * dot3(ref, ldir)));
  const legacy = { dir: ldir, width: lwidth, normal: norm3(cross3(ldir, lwidth)) };
  // the shoulder joint, 0.8 mm inside the flank low behind the gill cover (the flank's surface is at z ≈ 5.53 here)
  const base = [17.9, 3.2, 4.75];
  // down, a little out and forward; the broad side faces out, its width running forward
  const dir = norm3([-0.05, -0.95, 0.3]);
  const fwd = [-1, 0, 0];
  const width = norm3(fwd.map((x, i) => x - dir[i] * dot3(fwd, dir)));
  const normal = norm3(cross3(dir, width));
  return { base, dir, width, normal, legacy };
})();
/**
 * the arm's half widths (mm) along its axis, `a` measured from the shoulder joint (before the hand flattens and the
 * end is rounded off; fins.mjs builds the arm tube with these): a thick, nearly round root of muscle that fills the
 * shoulder's ball, flattening outward into the forearm
 */
export function armRadii(a) {
  return { rw: 2.08 + (1.75 - 2.08) * smoothstep(0.8, 2.8, a), rt: 1.98 + (1.1 - 1.98) * smoothstep(1.2, 3.2, a) };
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
  // (the guard lies well outside every part's reach, or the cut would crease the face)
  if (s > 0.5 && s < 19) {
    // inside the loft at rest (a smooth, full face); swells out when the chambers are pumped full
    d = smin(d, ellipsoidDist(pm, F.cheek, [5.0, 3.5 + 0.2 * breathe, 1.25 + 0.5 * breathe]), 0.7);
    // the puffy face under and in front of each eye: head-on it stands out to the side of the narrower snout, so the
    // snout reads as a knob between full cheeks, a soft furrow curving round it from the lip pads (photographs head-on)
    d = smin(d, ellipsoidDist(pm, F.jowl, [3.6, 2.5, 1.5]), 1.4);
    d = smin(d, ellipsoidDist(p, [F.throat[0], F.throat[1] - 0.35 * breathe, 0], [4.6, 1.3 + 0.3 * breathe, 4.0]), 1.0);
  }
  // the furrow between the eyes, cut before the eye cups go on (it would notch their inner sides)
  if (s > 4.5 && s < 12.5) d = smax(d, -ellipsoidDist(p, F.interorb, [3.0, 0.8, 0.32]), 0.35);
  // eye domes (meshed separately from the body loft, see body.mjs buildDomes): the cup, cut open around the axis;
  // blinking, the eye sinks and the cup closes into a lower dome
  if (opts?.dome && s < 13.5) F.eyes.forEach((e, i) => {
    const R = EYE.radius + CUP.skin;
    const ox = p[0] - e.c[0], oy = p[1] - e.c[1], oz = p[2] - e.c[2];
    const shut = (i === 0 ? opts?.cupL : opts?.cupR) === false || opts?.cup === false;
    let cup;
    if (shut) cup = Math.hypot(ox + 0.13, oy + 1.0, oz + 0.09 * Math.sign(e.c[2])) - (R - 0.09);
    // (the lid margin rolls over like a thick lid's edge)
    else cup = smax(Math.hypot(ox, oy, oz) - R, windowField([ox, oy, oz], e.D), 0.3);
    // the neck: a fleshy column under the globe, a little narrower than the cup, rising out of the head with a
    // small fillet; the cup merges into it tightly, so the eye reads as a ball held in a cup on a short neck
    const sg = Math.sign(e.c[2]);
    d = smin(d, ellipsoidDist(p, [e.c[0] + 0.13, e.c[1] - 1.26, e.c[2] - 0.13 * sg], [1.2, 1.3, 1.13]), 1.3);
    d = smin(d, cup, 0.38);
  });
  // lips and the lip pad: smooth displacements of the surface along the gape line (no creases, no folds)
  if (s < 8.5 && y < 5.2) d -= lipRelief(pm);
  // the gill cover: a raised plate with a crisp rear and lower rim
  if (s > 5.5 && s < 17.6 && y > 0 && y < 9.4) d -= opercRelief(pm, section(clamp(s, 0.01, S_END - 0.01)).w);
  // nape hump (epaxial muscles behind the skull)
  // fleshy lips
  // (no gill-cover grooves: in a live animal the cover's edge does not show through the skin; only the small gill
  // slit, low in front of the pectoral base)
  if (s > 15 && s < 17) d = smax(d, -capsuleChainDist(p, L ? F.slit : F.slitR), 0.05);
  // pelvic base
  if (s > 17 && s < 24.5) d = smin(d, ellipsoidDist(p, F.pelvicBase, [2.4, 0.55, 1.7]), 0.6);
  // urogenital papilla
  if (s > 35 && s < 38) d = smin(d, sphereDist(p, F.papilla, 0.42), 0.25);

  // --- subtractions
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
  const S_TIP = 4.3;
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
/**
 * object-space quaternion [x, y, z, w] (left side) turning the arm's bind frame onto the legacy swept-back frame: the
 * fixed fin poses (pose.js) append it, so they place the arm as they did when it was bound swept back
 */
export function pecBindFix() {
  const A = PEC_AXIS, L = A.legacy;
  // R = M_legacy · M_bindᵀ, columns dir, width, normal in object space
  const Mb = [A.dir, A.width, A.normal].map(dirToObject), Ml = [L.dir, L.width, L.normal].map(dirToObject);
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => Ml[0][i] * Mb[0][j] + Ml[1][i] * Mb[1][j] + Ml[2][i] * Mb[2][j]));
  const tr = R[0][0] + R[1][1] + R[2][2];
  let q;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    q = [(R[2][1] - R[1][2]) / S, (R[0][2] - R[2][0]) / S, (R[1][0] - R[0][1]) / S, 0.25 * S];
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    q = [0.25 * S, (R[0][1] + R[1][0]) / S, (R[0][2] + R[2][0]) / S, (R[2][1] - R[1][2]) / S];
  } else if (R[1][1] > R[2][2]) {
    const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    q = [(R[0][1] + R[1][0]) / S, 0.25 * S, (R[1][2] + R[2][1]) / S, (R[0][2] - R[2][0]) / S];
  } else {
    const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    q = [(R[0][2] + R[2][0]) / S, (R[1][2] + R[2][1]) / S, 0.25 * S, (R[1][0] - R[0][1]) / S];
  }
  const l = Math.hypot(...q);
  return q.map((x) => x / l);
}

export { smoothstep, clamp };
