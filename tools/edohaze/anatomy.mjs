// Anatomical definition of an adult エドハゼ Gymnogobius macrognathos (~45 mm TL).
// All proportions come from photogrammetry of 28 lateral and 4 dorsal reference photos (70-photo set,
// see docs/edohaze/PHOTO_SPEC.md): medians in units of SL on the snout-tip → caudal-base axis.
//
// Fish space (millimetres):
//   s : distance from the snout tip along the body axis (0 = snout, SL = caudal base)
//   y : height (0 = ventral baseline under the head), +y = dorsal
//   z : lateral, +z = fish's left side
// Object space of the exported glTF (metres): X = z, Y = y - Y0, Z = S0 - s  (head points to +Z).

import { clamp, smoothstep } from '../lib/noise.mjs';

export const SL = 38.0; // standard length
export const S_END = 40.0; // end of the body loft (thin blade overlapping the caudal fin base)
export const TL = 45.3; // total length including the caudal fin (TL/SL = 1.193, n = 20)
export const S0 = 23.0; // object-space origin along the axis
export const Y0 = 3.0; // object-space origin height
export const VERT_START = 9.4; // first vertebra (behind the skull)
export const VERT_COUNT = 34; // + urostyle = 35 vertebrae (Fishbase)

// ---------------------------------------------------------------------------
// Profile key points (mm; y = 0 at the ventral line under the pelvic disc)
// Medians of 28 lateral photos (dorsal/ventral outline excluding fins, 14 stations) and 4 dorsal photos
// (half-width). Converted with y = (h + 0.068)·SL, h measured from the snout-tip → caudal-base axis.
//   s/SL  0.02  0.05  0.10  0.15  0.20  0.25  0.30  0.40  0.50  0.60  0.70  0.80  0.90  1.00
//   top   3.80  4.44  5.17* 5.24  5.53  5.90  6.14  6.38  6.22  6.02  5.45  4.90  4.35  3.92
//   bot   0.87  0.49  0.34  0.23  0.14  0.14  0.06  0.04  0.46  0.55  0.89  0.91  0.95  1.20
//   halfW 1.50  2.02  2.47  2.74* 2.77* 2.81* 2.54  2.58  2.53  1.85  1.31  1.06  0.74  0.40
// (* outline includes the eye turret / cheek and opercle swelling added by the sculpt, so the loft is lower)
// Max depth 16.7 %SL at s≈0.4; caudal peduncle 7.7 %SL at s≈0.955; head half-width 7.4 %SL.
const KS = [0.0, 0.38, 0.76, 1.14, 1.52, 1.9, 2.47, 3.04, 3.8, 4.75, 5.7, 7.6, 9.5, 11.4, 13.3, 15.2, 17.1, 19.0, 20.9, 22.8, 26.6, 30.4, 34.2, 36.3, 38.0, 40.0];
const KTOP = [3.4, 3.5, 3.85, 4.08, 4.26, 4.45, 4.67, 4.92, 5.03, 5, 5.17, 5.54, 5.8, 6.02, 6.16, 6.16, 6.13, 5.96, 5.93, 5.68, 5.13, 4.54, 4, 3.69, 3.64, 3.6];
const KBOT = [1.1, 0.82, 0.63, 0.48, 0.38, 0.33, 0.31, 0.25, 0.21, 0.19, 0.14, 0.08, 0.06, 0.08, 0.09, 0.06, 0.2, 0.26, 0.32, 0.23, 0.4, 0.43, 0.53, 0.6, 0.61, 1.05];
const KW = [1.15, 1.46, 1.64, 1.78, 1.93, 2.12, 2.18, 2.47, 2.57, 2.52, 2.58, 2.83, 2.57, 2.26, 2.3, 2.33, 2.19, 2.01, 1.96, 1.88, 1.52, 1.21, 0.86, 0.63, 0.48, 0.42];
const KNT = [2.2, 2.12, 2.04, 1.97, 1.91, 1.87, 1.84, 1.82, 1.8, 1.8, 1.82, 1.88, 1.95, 2.0, 2.02, 2.02, 2.0, 1.97, 1.95, 1.92, 1.88, 1.85, 1.82, 1.8, 1.8, 1.8];
const KNB = [2.2, 2.3, 2.4, 2.4, 2.4, 2.45, 2.5, 2.55, 2.6, 2.7, 2.8, 2.85, 2.75, 2.65, 2.55, 2.45, 2.35, 2.25, 2.2, 2.1, 2.0, 1.95, 1.9, 1.87, 1.85, 1.85];

// Height of the widest point above the mid-height (mm): the broad, depressed head is widest high up
// (cheeks under the eyes) and tapers to the chin, as in the dorsal photos (025, 027, 029, 043).
const KDY = [0.12, 0.18, 0.24, 0.3, 0.36, 0.4, 0.44, 0.46, 0.45, 0.4, 0.3, 0.14, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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

const SNOUT_CAP = 0.45;
const SNOUT_CAP_W = 1.1;
const SNOUT_CAP_WE = 2.0; // the width rounds off over a longer run: rounded snout tip in dorsal view
const TAIL_BLADE0 = 37.4;

// blunt, rounded snout front (superelliptic cap): the front face is almost flat, as in the photos — 0.01 SL
// behind the tip the head already spans h +0.023 … −0.038 SL (058: +0.023 … −0.05; 004: +0.03 … −0.03)
function snoutCap(s, len = SNOUT_CAP, e = 3.5) {
  if (s >= len) return 1;
  const u = clamp(s / len, 0, 1);
  return Math.pow(Math.max(0, 1 - Math.pow(1 - u, e)), 1 / e);
}
// the caudal peduncle ends in a thin vertical blade that merges into the caudal fin plane
function tailU(s) { return clamp((s - TAIL_BLADE0) / (S_END - TAIL_BLADE0), 0, 1); }

/** Cross-section parameters at s. */
export function section(s) {
  const top = fTop(s), bot = fBot(s);
  const c = snoutCap(s);
  const yc = (top + bot) / 2 + fDY(s) * c;
  const u = tailU(s);
  const ch = c * (1 - 0.45 * u * u);
  const cw = snoutCap(s, SNOUT_CAP_W, SNOUT_CAP_WE) * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.4 * u);
  return {
    yc,
    t: (top - yc) * ch,
    b: (yc - bot) * ch,
    w: fW(s) * cw,
    nT: fNT(s),
    nB: fNB(s),
  };
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

/** Normalised superellipse radius of a fish-space point (1 = base surface). */
export function superR(s, y, z, q = section(s)) {
  const dy = y - q.yc;
  const up = dy > 0;
  const h = Math.max(up ? q.t : q.b, 1e-4);
  const n = up ? q.nT : q.nB;
  const w = Math.max(q.w, 1e-4);
  return Math.pow(Math.pow(Math.abs(z) / w, n) + Math.pow(Math.abs(dy) / h, n), 1 / n);
}

/** Approximate signed distance (mm) to the base loft (radial distance within the section). */
export function baseDist(s, y, z) {
  const sc = clamp(s, 0.01, S_END - 0.01);
  const q = section(sc);
  const dy = y - q.yc;
  const r = superR(sc, y, z, q);
  const len = Math.hypot(dy, z);
  let d;
  if (r < 1e-6) d = -Math.min(q.w, dy > 0 ? q.t : q.b);
  else d = len * (1 - 1 / r);
  // lateral slope of the loft along s makes the radial distance an over-estimate; damp it
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

// ---------------------------------------------------------------------------
// Sculpt features (smooth CSG on top of the loft)

const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

/** Base-surface point on the +z side at (s, y) and its outward normal. */
export function surfaceAt(s, y) {
  const q = section(s);
  const dy = y - q.yc;
  const up = dy > 0;
  const h = up ? q.t : q.b;
  const n = up ? q.nT : q.nB;
  const a = clamp(Math.abs(dy) / h, 0, 1);
  const z = q.w * Math.pow(Math.max(0, 1 - Math.pow(a, n)), 1 / n);
  const e = 0.005;
  const g = [
    baseDist(s + e, y, z) - baseDist(s - e, y, z),
    baseDist(s, y + e, z) - baseDist(s, y - e, z),
    baseDist(s, y, z + e) - baseDist(s, y, z - e),
  ];
  return { p: [s, y, z], n: norm3(g) };
}

// Eye (left side, +z). Right eye mirrors z. Photo medians (n = 31 lateral, 4 dorsal): visible disc centred at
// s = 0.088 SL, h = +0.037 SL, 0.045 SL across (incl. the dark rim), 0.037–0.040 SL tall (top +0.056–0.058,
// bottom +0.019), its top 0.3–0.9 %SL below the head profile; interorbital between the dark domes ≈ 0.038 SL.
// In 059 and 054 the eye is a proud globular dome looking sideways and somewhat up (~22°), the whole lower
// iris showing. The pupil drawn by the eye shader lies on the iris plane, 0.35 R out along the axis: the
// centre puts it at s 0.088, h +0.037 SL in the viewer's lateral shot (its perspective shifts the bulging eye
// ~0.01 SL forward of the orthographic position), with the domes' medial edges 0.019 SL off the midline.
export const EYE = {
  center: [3.58, 3.81, 1.28],
  axis: norm3([-0.16, 0.37, 0.92]),
  radius: 0.86,
  skin: 0.05,
  aperture: 68 * (Math.PI / 180),
};
// dorsal corneal window (see buildFeatures): axis ~75° above horizontal, slightly forward and outward
export const EYE_DORSAL_AXIS = norm3([-0.15, 0.96, 0.26]);
const EYE_DORSAL_APERTURE = 55 * (Math.PI / 180);

// Gape: from the snout tip (h = −0.011 SL) straight down and back at ~25° to the rictus at s 0.081,
// h −0.042 SL (under the front of the eye; 008 traces s 0.083, h −0.046; 034 s 0.079). The maxilla runs on
// to ~0.095 SL (below the eye centre/rear) — the large jaw of "macrognathos"; the lower jaw is level with
// or slightly ahead of the upper.
export const MOUTH = [[0.0, 2.17], [0.3, 2.06], [0.8, 1.83], [1.4, 1.56], [2.0, 1.29], [2.45, 1.08], [2.7, 0.97], [2.85, 0.9]];
export const RICTUS_S = 2.85;
export const MAXILLA_END = [3.6, 0.95];
// Free margin of the gill cover (operculum + subopercle), top → bottom: head length 0.269 SL (s 10.05 mm; spec
// 0.271 [0.252, 0.285], pooled re-measures 0.264). The gill opening ends dorsally at y 4.0 mm, low enough on
// the flank not to show as a slit from above (dorsal photos 025, 029, 043, 065).
export const OPERCLE = [[9.39, 4.0], [9.78, 3.47], [10.05, 2.57], [9.92, 1.67], [9.56, 0.9], [9.05, 0.39], [8.51, 0.12]];
// Preopercular groove (hinge side of the gill cover), top → bottom.
export const PREOPERCLE = [[6.26, 4.37], [6.8, 3.31], [7.07, 2.3], [6.89, 1.4], [6.26, 0.73], [5.45, 0.34]];

// Rig pivots (fish space, mm)
export const PIVOTS = {
  jaw: [3.75, 0.95, 0],
  premax: [0.7, 2.75, 0],
  hyoid: [4.7, 0.4, 0],
  opercTop: [8.35, 4.45],
  opercBottom: [8.5, 0.45],
};

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

function onSurface(poly, inset = 0, lift = 0, dy = 0) {
  return poly.map(([s, y]) => {
    const { p, n } = surfaceAt(Math.max(s, 0.12), y + dy);
    return [p[0] - n[0] * inset, p[1] - n[1] * inset + lift, p[2] - n[2] * inset];
  });
}

function capsuleChain(pts, radii) {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], radii[i], radii[i + 1]]);
  return segs;
}

function capsuleChainDist(p, segs) {
  let best = 1e9;
  for (const [a, b, ra, rb] of segs) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2, 0, 1);
    const d = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - (ra + (rb - ra) * t);
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

// lip roll centre line: follows the gape at a vertical offset, sunk so the roll protrudes by `out`
function lipLine(sign, radii, out) {
  // each roll is centred one radius above (upper) / below (lower) the gape, so the lips meet at the gape
  // line without overlapping across it (the mesh is cut there when the jaw opens)
  const pts = MOUTH.map(([s, y], i) => {
    if (i === 0) return null;
    const dy = sign * radii[i] * 0.95;
    const { p, n } = surfaceAt(s, y + dy);
    const r = radii[i];
    return [p[0] - n[0] * (r - out), p[1] - n[1] * (r - out), p[2] - n[2] * (r - out)];
  });
  // front centre (the lips of both sides meet across the snout tip)
  const r0 = radii[0];
  pts[0] = [r0 - out * 1.2, MOUTH[0][1] + sign * r0 * 0.95, 0];
  return pts;
}

function buildFeatures() {
  const n = MOUTH.length;
  // upper lip: thick and fleshy in front, tapering toward the mouth corner; the lower lip is thinner and
  // sits a little inside the upper one at the sides (the upper lip overlaps it), as in the photos; its front
  // (chin) is nearly as full as the upper lip's (059)
  const ru = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.36 - 0.17 * f - 0.07 * f * f; });
  const rl = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.32 - 0.15 * f - 0.07 * f * f; });
  const uPts = lipLine(1, ru, 0.18);
  // behind the corner the upper lip (over the maxilla) curls down and back and sinks into the cheek
  {
    const g = gapeY(RICTUS_S);
    const { p, n: nn } = surfaceAt(RICTUS_S + 0.42, g - 0.16);
    const r = 0.075;
    uPts.push([p[0] - nn[0] * (r - 0.03), p[1] - nn[1] * (r - 0.03), p[2] - nn[2] * (r - 0.03)]);
    ru.push(r);
  }
  const lipsU = capsuleChain(uPts, ru);
  // lips flush at the front (059; lower-jaw tip s −0.001 [−0.002, +0.002] SL): the lower lip reaches to 0.03 mm
  // behind the upper lip's tip, never ahead of it (the tip defines the photo axis)
  const lPts = lipLine(-1, rl, 0.13).map((p, i) => {
    if (i === 0) return [p[0] - 0.03, p[1], p[2]];
    const f = i / (n - 1);
    return [p[0], p[1], p[2] * (1 - 0.035 * f)];
  });
  const lipsL = capsuleChain(lPts, rl);
  const gape = onSurface(MOUTH, 0.0);
  gape[0] = [-0.12, MOUTH[0][1], 0];
  const crease = capsuleChain(gape, MOUTH.map((_, i) => 0.065 - 0.015 * (i / (MOUTH.length - 1))));
  // premaxillary groove above the upper lip, mental groove below the lower lip
  const grooveU = onSurface(MOUTH.slice(1).map(([s, y]) => [s, y + 0.62]), -0.02);
  grooveU.unshift([0.4, MOUTH[0][1] + 0.66, 0]);
  const grooveL = onSurface(MOUTH.slice(2, -1).map(([s, y]) => [s, y - 0.66]), -0.02);
  const gU = capsuleChain(grooveU, grooveU.map((_, i) => 0.05 - 0.02 * (i / grooveU.length)));
  const gL = capsuleChain(grooveL, grooveL.map(() => 0.05));

  // a fine groove only: the margin is a soft translucent membrane edge, not an incised line (059, 054, 057)
  const operc = capsuleChain(onSurface(OPERCLE.map(([s, y]) => [s + 0.07, y]), 0.0), OPERCLE.map((_, i, a) => (i === 0 || i === a.length - 1 ? 0.008 : 0.015)));
  const preop = capsuleChain(onSurface(PREOPERCLE, 0.0), PREOPERCLE.map(() => 0.018));

  const opS = surfaceAt(8.2, 2.35); // cheeks/opercle widest in front, soft step-in at the margin (dorsal photos)
  const opPlate = [opS.p[0], opS.p[1], opS.p[2] - 0.54];

  const pecSurf = surfaceAt(11.05, 2.2);
  const pecLobe = [pecSurf.p[0], pecSurf.p[1], pecSurf.p[2] - 0.28];

  const nosA = surfaceAt(0.8, 2.95);
  const nosB = surfaceAt(1.85, 3.65);

  const E = EYE;
  const Rs = E.radius + E.skin;
  const cutOff = 1.3;
  // the lateral window's cut sphere sits nearer the eye: the cheek, wider than the eye below it, is carved
  // only in a thin ring around the lower rim instead of a broad cup (059, 054: proud dome, thin rim)
  const cutOffL = 1.15;
  const rho = Math.sqrt(Rs * Rs + cutOffL * cutOffL - 2 * Rs * cutOffL * Math.cos(E.aperture));
  // second, dorsal corneal window: from above the eyes show as large dark domes whose medial edges are only
  // 0.038 SL apart (dorsal photos 025, 029, 043); the lateral window alone leaves 0.067 SL of skin between them
  const rho2 = Math.sqrt(Rs * Rs + cutOff * cutOff - 2 * Rs * cutOff * Math.cos(EYE_DORSAL_APERTURE));
  const at = (ax, D) => [E.center[0] + ax[0] * D, E.center[1] + ax[1] * D, E.center[2] + ax[2] * D];
  const eyeL = { c: E.center, cut: at(E.axis, cutOffL), cut2: at(EYE_DORSAL_AXIS, cutOff) };
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], cut: [eyeL.cut[0], eyeL.cut[1], -eyeL.cut[2]], cut2: [eyeL.cut2[0], eyeL.cut2[1], -eyeL.cut2[2]] };

  return {
    lipsU, lipsUR: mirrorZ(lipsU), lipsL, lipsLR: mirrorZ(lipsL),
    crease, creaseR: mirrorZ(crease), gU, gUR: mirrorZ(gU), gL, gLR: mirrorZ(gL),
    operc, opercR: mirrorZ(operc), preop, preopR: mirrorZ(preop),
    opPlate, pecLobe, nosA: nosA.p, nosAn: nosA.n, nosB: nosB.p,
    eyes: [eyeL, eyeR], Rs, rho, rho2,
    papilla: [25.1, botY(25.1) + 0.02, 0],
    anus: [24.65, botY(24.65) - 0.03, 0],
    pelvicBase: [11.6, botY(11.6) + 0.08, 0],
    interorb: [EYE.center[0], topY(EYE.center[0]) + 0.2, 0],
  };
}

export const FEAT = buildFeatures();

/** Sculpted signed distance field (mm). Negative inside the fish. */
export function field(s, y, z, eyeCut = true) {
  const F = FEAT;
  const p = [s, y, z];
  const az = Math.abs(z);
  const pm = [s, y, az]; // mirrored to the +z side for symmetric features
  const L = z >= 0;
  let d = baseDist(s, y, z);
  // eye mounds: a tight blend, so the skin does not climb onto the cornea (only a thin rim over its upper edge)
  if (s < 6.5) for (const e of F.eyes) d = smin(d, sphereDist(p, e.c, F.Rs), 0.12);
  // cheeks (adductor muscles) and the gill-cover plate
  // (a swelling that follows the loft, so the cheek rises smoothly out of the narrow snout behind the eye)
  if (s > 1.8 && s < 10.4) d -= 0.4 * Math.exp(-(((s - 5.6) / 1.75) ** 2)) * Math.exp(-(((y - 2.1) / 1.35) ** 2));
  // (a broad, soft blend that fades out toward the throat: the lower head is smooth and flat to slightly convex,
  // no jowl pouches or creases under the gill cover — 059, 054, 057)
  if (s > 6.0 && s < 11.2) {
    const f = smoothstep(0.6, 1.6, y);
    if (f > 0) d += (smin(d, ellipsoidDist(pm, F.opPlate, [1.3, 1.8, 0.34]), 0.5) - d) * f;
  }
  // fleshy lips
  if (s < 4.6 && y < 3.0) {
    d = smin(d, capsuleChainDist(p, L ? F.lipsU : F.lipsUR), 0.15);
    d = smin(d, capsuleChainDist(p, L ? F.lipsL : F.lipsLR), 0.15);
  }
  // pectoral fin base (fleshy lobe)
  if (s > 9.6 && s < 13.0) d = smin(d, ellipsoidDist(pm, F.pecLobe, [0.68, 1.4, 0.42]), 0.28);
  // pelvic disc base
  if (s > 9.6 && s < 13.6) d = smin(d, ellipsoidDist(p, F.pelvicBase, [1.0, 0.2, 0.82]), 0.23);
  // urogenital papilla
  if (s > 24.0 && s < 26.4) d = smin(d, sphereDist(p, F.papilla, 0.24), 0.14);
  // anterior nostril tube
  if (s < 2.4) d = smin(d, sphereDist(pm, [F.nosA[0] + F.nosAn[0] * 0.03, F.nosA[1] + F.nosAn[1] * 0.03, F.nosA[2] + F.nosAn[2] * 0.03], 0.1), 0.06);

  // --- subtractions
  if (eyeCut && s < 6.5) for (const e of F.eyes) {
    d = smax(d, -sphereDist(p, e.cut, F.rho), 0.07);
    d = smax(d, -sphereDist(p, e.cut2, F.rho2), 0.07);
  }
  if (s < 4.6 && y < 3.0) {
    d = smax(d, -capsuleChainDist(p, L ? F.crease : F.creaseR), 0.04);
    d = smax(d, -capsuleChainDist(p, L ? F.gU : F.gUR), 0.06);
  }
  if (s > 7.5 && s < 11.2 && y > 0.25) d += (smax(d, -capsuleChainDist(p, L ? F.operc : F.opercR), 0.03) - d) * smoothstep(0.25, 0.9, y);
  if (s > 4.8 && s < 8.0) d = smax(d, -capsuleChainDist(p, L ? F.preop : F.preopR), 0.04);
  if (s > 1.8 && s < 5.2) d = smax(d, -ellipsoidDist(p, F.interorb, [1.15, 0.28, 0.3]), 0.2);
  if (s > 23.7 && s < 25.6) d = smax(d, -sphereDist(p, F.anus, 0.085), 0.05);
  if (s < 3.0) d = smax(d, -sphereDist(pm, F.nosB, 0.08), 0.05);
  return d;
}

export function fieldGrad(s, y, z, e = 0.004) {
  const g = [
    field(s + e, y, z) - field(s - e, y, z),
    field(s, y + e, z) - field(s, y - e, z),
    field(s, y, z + e) - field(s, y, z - e),
  ];
  return norm3(g);
}

/** Origin of the projection ray for a loft section. */
export function rayOrigin(s) {
  // rays stay inside their own cross-section (so feature lines such as the gape keep their height);
  // only the very tips use a shared origin
  const sc = clamp(s, 0.35, S_END - 3.0);
  const q = section(sc);
  return [sc, q.yc, 0];
}

/** Moves a base-loft point onto the sculpted surface along the ray from the section origin. */
export function project(p0) {
  const o = rayOrigin(p0[0]);
  let dir = [p0[0] - o[0], p0[1] - o[1], p0[2] - o[2]];
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  if (L < 1e-6) return p0.slice();
  dir = [dir[0] / L, dir[1] / L, dir[2] / L];
  // march on the surface without the corneal windows: section rays graze the steep posterodorsal wall of
  // the eye socket and would alternate between skin and socket (a saw-tooth rim)
  const at = (t) => field(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t, false);
  let t0 = Math.max(0.02, L - 1.2);
  while (t0 > 0.02 && at(t0) > 0) t0 = Math.max(0.02, t0 - 0.5);
  const step = 0.035;
  let t1 = t0;
  let found = false;
  for (let i = 0; i < 140; i++) {
    const t = t0 + step * (i + 1);
    if (at(t) > 0) { t1 = t; found = true; break; }
    t0 = t;
  }
  if (!found) return p0.slice();
  let lo = t0, hi = t1;
  for (let i = 0; i < 14; i++) {
    const m = 0.5 * (lo + hi);
    if (at(m) > 0) hi = m; else lo = m;
  }
  const t = 0.5 * (lo + hi);
  return sinkEyeWindow([o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t]);
}

/** Points of the eye mound inside the corneal window slide along −axis onto the window sphere (socket). */
function sinkEyeWindow(p) {
  if (p[0] > 6.5) return p;
  const e = FEAT.eyes[p[2] >= 0 ? 0 : 1];
  const side = (ax) => (p[2] >= 0 ? ax : [ax[0], ax[1], -ax[2]]);
  p = sinkInto(p, e.cut, FEAT.rho, side(EYE.axis));
  return sinkInto(p, e.cut2, FEAT.rho2, side(EYE_DORSAL_AXIS));
}
function sinkInto(p, c, rho, a) {
  const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const qq = q[0] * q[0] + q[1] * q[1] + q[2] * q[2], rr = rho * rho;
  if (qq >= rr) return p;
  const qa = q[0] * a[0] + q[1] * a[1] + q[2] * a[2];
  const t = qa + Math.sqrt(qa * qa - qq + rr);
  return [p[0] - a[0] * t, p[1] - a[1] * t, p[2] - a[2] * t];
}

/** Distance through the base volume from p along dir (mm). */
export function throughDist(p, dir, maxLen = 16) {
  const inside = (t) => superR(clamp(p[0] + dir[0] * t, 0.01, S_END - 0.01), p[1] + dir[1] * t, p[2] + dir[2] * t) <= 1 &&
    p[0] + dir[0] * t > 0 && p[0] + dir[0] * t < S_END;
  const n = 48;
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const t = (maxLen * i) / n;
    if (!inside(t)) {
      let lo = prev, hi = t;
      for (let k = 0; k < 10; k++) {
        const m = 0.5 * (lo + hi);
        if (inside(m)) lo = m; else hi = m;
      }
      return 0.5 * (lo + hi);
    }
    prev = t;
  }
  return maxLen;
}

/** Fish-space (mm) -> glTF object space (m). */
export const toObject = (p) => [p[2] / 1000, (p[1] - Y0) / 1000, (S0 - p[0]) / 1000];
export const dirToObject = (d) => [d[2], d[1], -d[0]];

/** Profile table exported to the viewer (for the volumetric shader). */
export function profileTable(n = 512) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * S_END;
    const q = section(s);
    rows.push([+q.yc.toFixed(4), +q.t.toFixed(4), +q.b.toFixed(4), +q.w.toFixed(4), +q.nT.toFixed(4), +q.nB.toFixed(4)]);
  }
  return rows;
}

export { smoothstep, clamp };
