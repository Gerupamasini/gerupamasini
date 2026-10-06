// Anatomical definition of a ~50 mm TL juvenile Acanthogobius flavimanus (マハゼ幼魚).
//
// Fish space (millimetres):
//   s : distance from the snout tip along the body axis (0 = snout, SL = caudal base)
//   y : height (0 = ventral baseline under the head), +y = dorsal
//   z : lateral, +z = fish's left side
// Object space of the exported glTF (metres): X = z, Y = y - Y0, Z = S0 - s  (head points to +Z).

import { clamp, smoothstep } from '../lib/noise.mjs';
import { JUVENILE, pick } from './variant.mjs';
export { VARIANT, JUVENILE } from './variant.mjs';

export const SL = 41.0; // standard length
export const S_END = 43.2; // end of the body loft (thin blade overlapping the caudal fin base)
export const TL = 50.0; // total length including the caudal fin
export const S0 = 25.0; // object-space origin along the axis
export const Y0 = 3.2; // object-space origin height
export const VERT_START = 10.9; // first vertebra (behind the skull)
export const VERT_COUNT = 31;

// ---------------------------------------------------------------------------
// Profile key points (pre-cap dimensions)
// Measured on the lateral photo of a juvenile (IMG_1603, fine %SL grid) and cross-checked on IMG_9176,
// 03 and 05 (1 % SL = 0.41 mm). Snout tip 2.1 mm above the throat line (5 % SL); dorsal profile rises
// 2 % SL within the first 1 % SL (blunt, rounded snout), −7.5 % SL at the eye front, eye top at −9 %;
// head depth at the eye 13 % SL, body depth 17–18 % SL, caudal peduncle 7.5 % SL.
// Widths (KW, KNB, KDY, snout cap, cheek swelling) were refitted to dorsal, frontal and front-oblique photos:
// an orthographic camera is solved per photo from landmarks (snout tip, eyes, mouth corners) and the model's
// silhouette is overlaid on the photo; the snout tapers to a rounded wedge in dorsal view, the mouth is ~0.6
// of the head width and the cheeks swell smoothly behind the eyes.
// ---- adult (the earlier model: thick lips, long snout, small eye relative to the head)
const KS = [0.0, 0.41, 0.82, 1.23, 1.64, 2.05, 2.46, 2.87, 3.28, 4.1, 4.9, 6.15, 8.2, 10.25, 12.3, 15, 18, 21, 24, 27, 30, 33, 36, 38.5, 40.5, 42, 43.2];
const KTOP_A = [2.85, 3.08, 3.42, 3.66, 3.95, 4.23, 4.48, 4.8, 5.05, 5.3, 5.42, 5.63, 6.2, 6.52, 6.74, 6.95, 7.05, 6.95, 6.72, 6.38, 5.98, 5.6, 5.27, 5.05, 4.88, 4.78, 4.66];
const KBOT_A = [1.4, 1.2, 0.98, 0.83, 0.68, 0.54, 0.43, 0.33, 0.25, 0.13, 0.07, 0.03, 0.0, 0.0, 0.0, 0.0, 0.02, 0.12, 0.35, 0.7, 1.1, 1.48, 1.8, 2.0, 2.14, 2.24, 2.36];
const KW_A = [1.45, 1.62, 1.74, 1.84, 1.9, 1.95, 2.02, 2.1, 2.2, 2.42, 2.68, 3.08, 3.34, 3.32, 3.2, 3.05, 2.82, 2.58, 2.3, 1.98, 1.66, 1.36, 1.08, 0.86, 0.69, 0.56, 0.46];
const KNT_A = [2.2, 2.12, 2.04, 1.97, 1.91, 1.87, 1.84, 1.82, 1.8, 1.8, 1.82, 1.86, 1.92, 1.98, 2.02, 2.03, 2.0, 1.97, 1.95, 1.92, 1.9, 1.87, 1.84, 1.82, 1.8, 1.8, 1.8];
const KNB_A = [2.2, 2.3, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.45, 2.5, 2.6, 2.75, 2.85, 2.75, 2.65, 2.55, 2.45, 2.35, 2.2, 2.1, 2.0, 1.95, 1.9, 1.87, 1.85, 1.85, 1.85];

// Height of the widest point above the mid-height (mm): the snout is widest high up (below the eyes)
// and tapers to a narrower mouth and chin, as in the dorsal and frontal photos.
const KDY_A = [0.15, 0.2, 0.26, 0.32, 0.4, 0.46, 0.5, 0.54, 0.56, 0.52, 0.42, 0.24, 0.06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// ---- juvenile (lateral photo of a ~5 cm juvenile resting on sand, calibrated snout → caudal-base spot):
// deep, blunt snout whose dorsal profile climbs steeply to a large, high-set eye that bulges above the
// head line; oblique mouth (gape falls ~1.2 mm from the snout tip to the rictus under the eye front);
// thinner lips, flatter cheeks; dorsal profile almost straight from the eye to the first dorsal fin;
// deeper caudal peduncle (9 % SL)
const KTOP_J = [2.95, 3.65, 4.15, 4.45, 4.68, 4.86, 5.02, 5.17, 5.3, 5.52, 5.72, 5.95, 6.12, 6.22, 6.42, 6.8, 7.0, 6.95, 6.78, 6.5, 6.17, 5.85, 5.58, 5.4, 5.22, 5.08, 4.95];
const KBOT_J = [1.9, 1.62, 1.36, 1.14, 0.95, 0.78, 0.62, 0.48, 0.36, 0.18, 0.08, 0.03, 0.0, 0.0, 0.0, 0.0, 0.02, 0.1, 0.3, 0.58, 0.92, 1.24, 1.5, 1.68, 1.8, 1.88, 1.98];
const KTOP = pick(KTOP_A, KTOP_J);
const KBOT = pick(KBOT_A, KBOT_J);
const KW = KW_A, KNT = KNT_A, KNB = KNB_A, KDY = KDY_A;

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

const SNOUT_CAP = 0.62;
const CHEEK = pick(0.36, 0.2); // cheek swelling (mm): the juvenile's cheeks are flatter
const SNOUT_CAP_W = 1.1;
const SNOUT_CAP_WE = 2.0; // the width rounds off over a longer run: rounded snout tip in dorsal view
const TAIL_BLADE0 = 39.3;

// blunt, rounded snout front (superelliptic cap): the front face is almost flat, as in the photos
function snoutCap(s, len = SNOUT_CAP, e = 2.6) {
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

// Eye (left side, +z). Right eye mirrors z. Measured: centre 12 % SL behind the snout, 2.4 mm above
// the snout tip; eyeball Ø ≈ 2 mm; the iris ellipse (3.9 × 3.5 % SL) shows the pupil looks sideways,
// tilted ~26° upward and slightly forward. The eyes sit high and close (interorbital < eye Ø) and their
// tops rise just above the dorsal head profile.
// Close-up / frontal photos (user refs): each eye is a raised turret on the head top; the dorsomedial
// part of the dome is covered by pigmented skin, only a lateral cornea window shows the iris. Pupils
// look sideways, ~30° up and ~20° forward; interorbital < eye Ø. Frontal photos of a juvenile: the eye turrets
// span ~60 % of the cheek width and the pupils ~48 %, so the eyes sit close together on the head top.
// Juvenile (calibrated lateral photo): eye centre 13.7 % SL behind the snout and high on the head, orbit
// ring Ø ≈ 2.5 mm (6 % SL) with a large dark pupil (Ø ≈ 1.3 mm, half the visible eye); the eyeball top
// stands ~0.5 mm above the dorsal head line and most of the eyeball is exposed.
export const EYE = pick({
  center: [4.9, 4.9, 1.15],
  axis: norm3([-0.25, 0.45, 0.86]),
  radius: 1.0,
  skin: 0.06,
  aperture: 60 * (Math.PI / 180),
  pupil: 0.38, // pupil half-angle (rad)
  iris: 1.08, // iris half-angle (rad)
}, {
  center: [5.6, 5.05, 1.38],
  axis: norm3([-0.22, 0.42, 0.88]),
  radius: 1.15,
  skin: 0.05,
  aperture: 72 * (Math.PI / 180),
  pupil: 0.58,
  iris: 1.12,
});

// Gape (where the lips meet): from the snout tip gently down to the rictus at 8.5 % SL, just in front
// of the eye (the juvenile maxilla does not reach the eye centre). The upper jaw overhangs slightly.
export const MOUTH = pick(
  [[0.0, 1.98], [0.3, 1.95], [0.8, 1.87], [1.5, 1.74], [2.2, 1.6], [2.8, 1.49], [3.2, 1.42], [3.5, 1.37]],
  [[0.0, 2.45], [0.3, 2.4], [0.8, 2.27], [1.5, 2.04], [2.2, 1.78], [2.8, 1.52], [3.1, 1.38], [3.3, 1.3]],
);
export const RICTUS_S = MOUTH[MOUTH.length - 1][0];
// lip rolls (radius along the gape, f = 0 front … 1 corner) and how far they protrude from the skin
export const LIPS = pick(
  { ru: (f) => 0.4 - 0.19 * f - 0.08 * f * f, rl: (f) => 0.29 - 0.12 * f - 0.07 * f * f, outU: 0.18, outL: 0.13, groove: 0.62, band: [0.62, 0.22, 0.5, 0.18] },
  { ru: (f) => 0.29 - 0.13 * f - 0.05 * f * f, rl: (f) => 0.22 - 0.08 * f - 0.05 * f * f, outU: 0.12, outL: 0.09, groove: 0.48, band: [0.46, 0.16, 0.38, 0.12] },
);
const LIP_YMAX = MOUTH[0][1] + 1.12; // lips and gape creases live below this height
// Free margin of the gill cover (operculum + subopercle), top → bottom (head length ≈ 28.5 % SL).
export const OPERCLE = [[10.0, 5.1], [10.8, 4.62], [11.4, 3.8], [11.7, 2.8], [11.55, 1.8], [11.1, 0.95], [10.4, 0.38], [9.6, 0.08]];
// Preopercular groove (hinge side of the gill cover), top → bottom.
export const PREOPERCLE = pick(
  [[7.1, 4.8], [7.7, 3.62], [8.0, 2.5], [7.8, 1.5], [7.1, 0.75], [6.2, 0.32]],
  [[7.4, 4.95], [8.0, 3.7], [8.3, 2.5], [8.1, 1.5], [7.4, 0.75], [6.5, 0.32]],
);

// Rig pivots (fish space, mm)
export const PIVOTS = {
  jaw: pick([4.15, 1.0, 0], [3.95, 0.95, 0]),
  premax: pick([0.9, 2.6, 0], [1.0, 3.05, 0]),
  hyoid: [5.4, 0.45, 0],
  opercTop: [9.4, 4.9],
  opercBottom: [9.6, 0.45],
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
  // sits a little inside the upper one at the sides (the upper lip overlaps it), as in the photos
  const ru = MOUTH.map((_, i) => LIPS.ru(i / (n - 1)));
  const rl = MOUTH.map((_, i) => LIPS.rl(i / (n - 1)));
  const uPts = lipLine(1, ru, LIPS.outU);
  // behind the corner the upper lip (over the maxilla) curls down and back and sinks into the cheek
  {
    const g = gapeY(RICTUS_S);
    const { p, n: nn } = surfaceAt(RICTUS_S + 0.42, g - 0.16);
    const r = 0.075;
    uPts.push([p[0] - nn[0] * (r - 0.03), p[1] - nn[1] * (r - 0.03), p[2] - nn[2] * (r - 0.03)]);
    ru.push(r);
  }
  const lipsU = capsuleChain(uPts, ru);
  // the upper jaw overhangs the lower slightly: the lower lip starts a little behind the snout tip
  const lPts = lipLine(-1, rl, LIPS.outL).map((p, i) => {
    if (i === 0) return [p[0] + 0.12, p[1], p[2]];
    const f = i / (n - 1);
    return [p[0], p[1], p[2] * (1 - 0.035 * f)];
  });
  const lipsL = capsuleChain(lPts, rl);
  const gape = onSurface(MOUTH, 0.0);
  gape[0] = [-0.12, MOUTH[0][1], 0];
  const crease = capsuleChain(gape, MOUTH.map((_, i) => 0.065 - 0.015 * (i / (MOUTH.length - 1))));
  // premaxillary groove above the upper lip, mental groove below the lower lip
  const grooveU = onSurface(MOUTH.slice(1).map(([s, y]) => [s, y + LIPS.groove]), -0.02);
  grooveU.unshift([0.4, MOUTH[0][1] + LIPS.groove + 0.04, 0]);
  const grooveL = onSurface(MOUTH.slice(2, -1).map(([s, y]) => [s, y - 0.66]), -0.02);
  const gU = capsuleChain(grooveU, grooveU.map((_, i) => 0.05 - 0.02 * (i / grooveU.length)));
  const gL = capsuleChain(grooveL, grooveL.map(() => 0.05));

  const operc = capsuleChain(onSurface(OPERCLE.map(([s, y]) => [s + 0.07, y]), 0.0), OPERCLE.map((_, i, a) => (i === 0 || i === a.length - 1 ? 0.012 : 0.03)));
  const preop = capsuleChain(onSurface(PREOPERCLE, 0.0), PREOPERCLE.map(() => 0.018));

  const opS = surfaceAt(10.0, 2.55);
  const opPlate = [opS.p[0], opS.p[1], opS.p[2] - 0.32];

  const pecSurf = surfaceAt(12.35, 2.35);
  const pecLobe = [pecSurf.p[0], pecSurf.p[1], pecSurf.p[2] - 0.28];

  const nosA = pick(surfaceAt(1.05, 2.95), surfaceAt(1.15, 3.55));
  const nosB = pick(surfaceAt(2.4, 3.75), surfaceAt(2.95, 4.55));

  const E = EYE;
  const Rs = E.radius + E.skin;
  const cutOff = 1.3;
  const rho = Math.sqrt(Rs * Rs + cutOff * cutOff - 2 * Rs * cutOff * Math.cos(E.aperture));
  const eyeL = { c: E.center, cut: [E.center[0] + E.axis[0] * cutOff, E.center[1] + E.axis[1] * cutOff, E.center[2] + E.axis[2] * cutOff] };
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], cut: [eyeL.cut[0], eyeL.cut[1], -eyeL.cut[2]] };

  return {
    lipsU, lipsUR: mirrorZ(lipsU), lipsL, lipsLR: mirrorZ(lipsL),
    crease, creaseR: mirrorZ(crease), gU, gUR: mirrorZ(gU), gL, gLR: mirrorZ(gL),
    operc, opercR: mirrorZ(operc), preop, preopR: mirrorZ(preop),
    opPlate, pecLobe, nosA: nosA.p, nosAn: nosA.n, nosB: nosB.p,
    eyes: [eyeL, eyeR], Rs, rho,
    papilla: [22.9, botY(22.9) + 0.02, 0],
    anus: [22.45, botY(22.45) - 0.03, 0],
    pelvicBase: [12.0, botY(12.0) + 0.08, 0],
    interorb: [EYE.center[0], topY(EYE.center[0]) + 0.22, 0],
  };
}

export const FEAT = buildFeatures();

/** Sculpted signed distance field (mm). Negative inside the fish. */
export function field(s, y, z) {
  const F = FEAT;
  const p = [s, y, z];
  const az = Math.abs(z);
  const pm = [s, y, az]; // mirrored to the +z side for symmetric features
  const L = z >= 0;
  let d = baseDist(s, y, z);
  // eye mounds
  if (s < 8.5) for (const e of F.eyes) d = smin(d, sphereDist(p, e.c, F.Rs), 0.24);
  // cheeks (adductor muscles) and the gill-cover plate
  // (a swelling that follows the loft, so the cheek rises smoothly out of the narrow snout behind the eye)
  if (s > 2.5 && s < 11.5) d -= CHEEK * Math.exp(-(((s - 6.9) / 1.9) ** 2)) * Math.exp(-(((y - 2.3) / 1.45) ** 2));
  if (s > 7.5 && s < 12.5) d = smin(d, ellipsoidDist(pm, F.opPlate, [1.3, 2.0, 0.36]), 0.35);
  // fleshy lips
  if (s < RICTUS_S + 2 && y < LIP_YMAX) {
    d = smin(d, capsuleChainDist(p, L ? F.lipsU : F.lipsUR), 0.16);
    d = smin(d, capsuleChainDist(p, L ? F.lipsL : F.lipsLR), 0.16);
  }
  // pectoral fin base (fleshy lobe)
  if (s > 10.5 && s < 14.5) d = smin(d, ellipsoidDist(pm, F.pecLobe, [0.75, 1.55, 0.45]), 0.3);
  // pelvic disc base
  if (s > 10 && s < 14) d = smin(d, ellipsoidDist(p, F.pelvicBase, [1.1, 0.22, 0.9]), 0.25);
  // urogenital papilla
  if (s > 21.5 && s < 24.5) d = smin(d, sphereDist(p, F.papilla, 0.26), 0.15);
  // anterior nostril tube
  if (s < 3) d = smin(d, sphereDist(pm, [F.nosA[0] + F.nosAn[0] * 0.03, F.nosA[1] + F.nosAn[1] * 0.03, F.nosA[2] + F.nosAn[2] * 0.03], 0.1), 0.06);

  // --- subtractions
  if (s < 8.5) for (const e of F.eyes) d = smax(d, -sphereDist(p, e.cut, F.rho), 0.08);
  if (s < RICTUS_S + 2 && y < LIP_YMAX) {
    d = smax(d, -capsuleChainDist(p, L ? F.crease : F.creaseR), 0.04);
    d = smax(d, -capsuleChainDist(p, L ? F.gU : F.gUR), 0.06);
  }
  if (s > 8.5 && s < 12.5) d = smax(d, -capsuleChainDist(p, L ? F.operc : F.opercR), 0.05);
  if (s > 5.5 && s < 9) d = smax(d, -capsuleChainDist(p, L ? F.preop : F.preopR), 0.04);
  if (s > 2.5 && s < 7.5) d = smax(d, -ellipsoidDist(p, F.interorb, [1.4, 0.32, 0.38]), 0.22);
  if (s > 21.5 && s < 23.5) d = smax(d, -sphereDist(p, F.anus, 0.09), 0.05);
  if (s < 4) d = smax(d, -sphereDist(pm, F.nosB, 0.09), 0.05);
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
  const sc = clamp(s, 0.35, 40.2);
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
  const at = (t) => field(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
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
  return [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
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
