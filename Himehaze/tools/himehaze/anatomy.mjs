// Anatomical definition of an adult ヒメハゼ Favonigobius gymnauchen (SL 43 mm, TL ≈ 53 mm).
//
// Fish space (millimetres):
//   s : distance from the snout tip along the body axis (0 = snout, SL = caudal base)
//   y : height (0 = lowest point of the belly at the pectoral girdle), +y = dorsal
//   z : lateral, +z = fish's left side
// Object space of the exported glTF (metres): X = z, Y = y - Y0, Z = S0 - s  (head points to +Z).
//
// Evidence tags: [F] literature, [P] measured on the reference photos (IDs given), [R] related species /
// family value, [G] modelling assumption.

import { clamp, smoothstep } from '../lib/noise.mjs';
import { SL_MM, TL_MM, VERT_START as VS, VERT_COUNT as VC, S0_MM } from '../../src/fish/species.js';

export const SL = SL_MM;      // standard length
export const S_END = 44.4;    // end of the body loft (thin blade overlapping the caudal fin base)
export const TL = TL_MM;      // total length (rounded caudal, TL/SL 1.23 [P])
export const S0 = S0_MM;      // object-space origin along the axis (~60 %SL)
export const Y0 = 3.6;        // object-space origin height = snout–caudal-base axis
export const VERT_START = VS; // first vertebra (behind the skull)
export const VERT_COUNT = VC;
const P = (p) => (p * SL) / 100; // %SL → mm

// Build variant: 'female' (default; also non-breeding males look like this) or 'male' (breeding male):
//   node tools/build-model.mjs --male   (or HIMEHAZE_VARIANT=male)
export const VARIANT = (typeof process !== 'undefined' && (process.env.HIMEHAZE_VARIANT || (process.argv.includes('--male') ? 'male' : ''))) || 'female';
export const MALE = VARIANT === 'male';

// ---------------------------------------------------------------------------
// Profile key points (pre-cap dimensions)
// Lateral outline [P]: closed-mouth specimens 025/031 (C) and 026 (D), cross-checked on 004/005 (A),
// 022 (B) and live fish 007, 003, 029, 069 — snout–caudal-base axis normalised to SL, %SL above/below the
// axis, converted with 1 %SL = 0.43 mm and the axis at y = 3.6 mm. The closed-mouth body is nearly
// symmetric about that axis; deepest (15.8 %SL) at the pectoral girdle / pelvic base (22–30 %SL), dorsal
// outline almost flat 20–50 %SL, caudal peduncle 7.9–8.3 %SL deep at 85–95 %SL.
// At 8–12 %SL the photographed outline is formed by the eye rims: the loft top is kept lower there and the
// eyes are added as sculpted mounds (top of eye ≈ 0.5 %SL below the outline maximum).
const KS = [0.0, 0.43, 0.86, 1.29, 1.72, 2.15, 2.58, 3.44, 4.3, 5.16, 6.02, 6.88, 7.74, 8.6, 9.46, 10.75, 12.9, 15.05, 17.2, 19.35, 21.5, 23.65, 25.8, 27.95, 30.1, 32.25, 34.4, 36.55, 38.7, 40.85, 43.0, 44.4];
const KTOP = [3.73, 4.3, 4.58, 4.92, 5.14, 5.38, 5.6, 5.78, 5.93, 6.12, 6.32, 6.46, 6.59, 6.69, 6.76, 6.82, 6.84, 6.84, 6.82, 6.79, 6.71, 6.58, 6.38, 6.18, 5.98, 5.79, 5.52, 5.39, 5.33, 5.34, 5.38, 5.3];
const KBOT = [3.15, 2.66, 2.35, 2.08, 1.86, 1.64, 1.41, 1.1, 0.93, 0.8, 0.63, 0.5, 0.41, 0.24, 0.13, 0.03, 0.15, 0.35, 0.53, 0.6, 0.62, 0.68, 0.79, 0.9, 1.05, 1.34, 1.57, 1.77, 1.83, 1.86, 1.84, 1.9];
// Half-widths [P: dorsal views 049, 015, 052L, 058 (straightened, %SL stations), "in-water" blend]: blunt
// parabolic snout (half-width ≈ 2.7·√x %SL), nearly parallel at the eyes (W ≈ 14), abrupt widening into the
// cheek/opercle bulge (W 19–20 %SL at 15–25 %SL: the head is wider than deep), near-linear taper of the trunk,
// strongly compressed peduncle (W 5.3 at 90 %SL, 2.9 at the caudal base).
const KW = [1.0, 1.3, 1.65, 1.95, 2.19, 2.33, 2.45, 2.75, 3.05, 3.31, 3.65, 3.92, 4.09, 4.17, 4.17, 4.13, 3.87, 3.61, 3.23, 3.05, 2.84, 2.54, 2.37, 2.21, 2.04, 1.87, 1.7, 1.42, 1.14, 0.92, 0.62, 0.45];
// superellipse exponents: rounded, nearly cylindrical trunk; slightly flattened throat and chest
const KNT = [2.2, 2.15, 2.1, 2.05, 2.0, 1.98, 1.96, 1.95, 1.95, 1.96, 1.98, 2.0, 2.02, 2.04, 2.05, 2.06, 2.06, 2.05, 2.04, 2.02, 2.0, 1.98, 1.95, 1.92, 1.9, 1.88, 1.86, 1.84, 1.82, 1.8, 1.8, 1.8];
const KNB = [2.2, 2.3, 2.4, 2.45, 2.5, 2.55, 2.6, 2.65, 2.7, 2.72, 2.72, 2.7, 2.65, 2.6, 2.55, 2.5, 2.45, 2.38, 2.3, 2.25, 2.2, 2.15, 2.1, 2.05, 2.0, 1.95, 1.9, 1.87, 1.85, 1.85, 1.85, 1.85];

// Height of the widest point above the mid-height (mm): widest at cheek level below the eyes
const KDY = [0.1, 0.14, 0.18, 0.22, 0.26, 0.3, 0.32, 0.3, 0.24, 0.16, 0.08, 0.03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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

// short blunt snout whose front face (both lips) is a small rounded vertical face ~1.2 %SL tall [P 025/031/026]
const SNOUT_CAP = 0.45;
const SNOUT_CAP_W = 0.9;
const SNOUT_CAP_WE = 2.0; // rounded snout tip in dorsal view
const TAIL_BLADE0 = 40.8;

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
  const ch = c * (1 - 0.12 * u * u); // the peduncle keeps its depth into the fin base (procurrent rays) [P]
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

// Eye (left side, +z). Right eye mirrors z. [P] lateral specimens: eyeball Ø 3.6–4.3 %SL (mean 3.95 horizontal;
// the vertical diameter reads 2.85 because the eye faces partly upward), centre at 8.3 %SL behind the snout and
// 4.1 %SL above the snout–caudal-base axis, its top only ~0.5 %SL below the head outline; live fish (007, 003,
// 041, 062, 065) show raised orbital turrets on the head top with a notch behind them, pupils looking sideways,
// up (~35–40°) and slightly forward, and a narrow interorbital (dorsal views 049, 050, 039).
export const EYE = {
  // x: lateral specimens 7.7–9.9 %SL (snout ≈ eye diameter, Fauna Sinica) → 9 %SL; eye centres 7.4 %SL apart
  // in dorsal view (049/015/052L/058), the eyes sitting ~1.2 %SL inside the cheek outline [P]
  center: [P(9.0), Y0 + P(3.2), P(3.6)], // slightly back/lower to the live photo 2026-10 (centre ≈ 9, +3.5 %SL)
  axis: norm3([-0.22, 0.64, 0.74]), // ~40° above horizontal, out, slight forward convergence (toe-in 10–15°) [P]
  radius: 1.27,  // enlarged to the live photo 2026-10 (eye ≈ 6 %SL incl. rim); Ø 2.35 mm ≈ 5.5 %SL: visible eye dome 5.9 (4.7–6.7) %SL ≈ 0.245 HL [P head 004/025/031]; 22–26 %HL [F]
  skin: 0.06,
  aperture: 64 * (Math.PI / 180), // wider visible dome (live photo 2026-10)
};

// Gape (where the lips meet), closed mouth [P 025/031]: from the snout tip at axis −0.8 %SL obliquely down to
// the rictus at (5.6, −2.9) %SL, below the front edge of the eye; the slit slopes ~25° (oblique, terminal mouth).
// rictus at 4.9 (4.5–5.5) %SL, ~3 %SL below the axis, under the front edge of the eye; slit ~25° [P head]
export const MOUTH = [[0.0, 3.27], [0.28, 3.2], [0.62, 3.07], [1.0, 2.92], [1.4, 2.76], [1.72, 2.62], [1.95, 2.5], [2.13, 2.38]];
export const RICTUS_S = 2.13;
// Free margin of the gill cover (operculum + subopercle membrane), top → bottom [P 025/031/026]: the cover ends
// at 21.5–23.5 %SL (bony) / 23.5–25 %SL (membrane) in a convex arc; head length ≈ 24 %SL.
export const OPERCLE = [[9.3, 5.65], [9.95, 5.05], [10.3, 4.2], [10.35, 3.35], [10.12, 2.5], [9.6, 1.78], [8.85, 1.25], [8.0, 0.95]];
// Preopercular groove (hinge side of the gill cover), top → bottom: behind the eye at ~15–16 %SL, where a dark
// subocular/cheek bar lies in most individuals [P 025/026/031/062].
// (preopercular margin, a dark bar in most fish, at 16.8 (15.2–18.2) %SL [P head])
export const PREOPERCLE = [[6.7, 5.25], [7.05, 4.35], [7.15, 3.4], [6.9, 2.45], [6.35, 1.7], [5.6, 1.25]];

// Rig pivots (fish space, mm)
export const PIVOTS = {
  jaw: [2.7, 2.05, 0],
  premax: [0.55, 3.55, 0],
  hyoid: [4.4, 1.25, 0],
  opercTop: [8.6, 5.7],
  opercBottom: [8.6, 1.3],
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
  // thick fleshy lips [P 041, 062, 065: both lips form the small vertical front face of the snout, ~1.2 %SL
  // tall]; the lower lip is about as thick as the upper one and sits slightly AHEAD of it (lower jaw projects
  // 0.3 %SL at rest, 1.35 %SL when gaping — specimens 004/005/006/022) [P]
  const ru = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.29 - 0.12 * f - 0.07 * f * f; });
  const rl = MOUTH.map((_, i) => { const f = i / (n - 1); return 0.28 - 0.1 * f - 0.08 * f * f; });
  const uPts = lipLine(1, ru, 0.14);
  // behind the corner the upper lip (over the maxilla) curls down and back and sinks into the cheek
  {
    const g = gapeY(RICTUS_S);
    const { p, n: nn } = surfaceAt(RICTUS_S + 0.42, g - 0.16);
    const r = 0.075;
    uPts.push([p[0] - nn[0] * (r - 0.03), p[1] - nn[1] * (r - 0.03), p[2] - nn[2] * (r - 0.03)]);
    ru.push(r);
  }
  const lipsU = capsuleChain(uPts, ru);
  // the lower jaw projects slightly: the lower lip reaches a little ahead of the upper one at the front
  const lPts = lipLine(-1, rl, 0.15).map((p, i) => {
    if (i === 0) return [p[0] - 0.1, p[1], p[2]];
    const f = i / (n - 1);
    return [p[0] - 0.06 * (1 - f), p[1], p[2] * (1 - 0.02 * f)];
  });
  uPts[0] = [uPts[0][0] + 0.05, uPts[0][1], uPts[0][2]];
  const lipsL = capsuleChain(lPts, rl);
  const gape = onSurface(MOUTH, 0.0);
  gape[0] = [-0.12, MOUTH[0][1], 0];
  const crease = capsuleChain(gape, MOUTH.map((_, i) => 0.065 - 0.015 * (i / (MOUTH.length - 1))));
  // premaxillary groove above the upper lip, mental groove below the lower lip
  const grooveU = onSurface(MOUTH.slice(1).map(([s, y]) => [s, y + 0.5]), -0.02);
  grooveU.unshift([0.35, MOUTH[0][1] + 0.52, 0]);
  const grooveL = onSurface(MOUTH.slice(2, -1).map(([s, y]) => [s, y - 0.52]), -0.02);
  const gU = capsuleChain(grooveU, grooveU.map((_, i) => 0.05 - 0.02 * (i / grooveU.length)));
  const gL = capsuleChain(grooveL, grooveL.map(() => 0.05));

  const operc = capsuleChain(onSurface(OPERCLE.map(([s, y]) => [s + 0.07, y]), 0.0), OPERCLE.map((_, i, a) => (i === 0 || i === a.length - 1 ? 0.012 : 0.03)));
  const preop = capsuleChain(onSurface(PREOPERCLE, 0.0), PREOPERCLE.map(() => 0.018));

  const opS = surfaceAt(8.6, 3.5);
  const opPlate = [opS.p[0], opS.p[1], opS.p[2] - 0.32];

  // fleshy, pale lobe in front of the pectoral rays (x 22–26, y −1…−4 %SL) [P 025/031]
  const pecSurf = surfaceAt(10.4, 2.55);
  const pecLobe = [pecSurf.p[0], pecSurf.p[1], pecSurf.p[2] - 0.28];

  // anterior nostril (short tube above the upper lip) and posterior nostril in front of the eye [R gobiid; P 041]
  const nosA = surfaceAt(0.95, 4.05);
  const nosB = surfaceAt(2.15, 4.85);

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
    papilla: [P(54), botY(P(54)) + 0.02, 0],
    anus: [P(53), botY(P(53)) - 0.03, 0],
    pelvicBase: [P(27.8), botY(P(27.8)) + 0.08, 0],
    interorb: [EYE.center[0], topY(EYE.center[0]) + 0.18, 0],
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
  const E = EYE.center;
  let d = baseDist(s, y, z);
  // eye turrets on the head top
  if (s < E[0] + 3.2) for (const e of F.eyes) d = smin(d, sphereDist(p, e.c, F.Rs), 0.2);
  // cheeks (adductor muscles) swelling below and behind the eye, and the gill-cover plate
  if (s > 1.8 && s < 9.5) d -= 0.3 * Math.exp(-(((s - 5.9) / 1.7) ** 2)) * Math.exp(-(((y - 3.0) / 1.3) ** 2));
  if (s > 6.5 && s < 11.0) d = smin(d, ellipsoidDist(pm, F.opPlate, [1.25, 1.9, 0.34]), 0.32);
  // fleshy lips
  if (s < RICTUS_S + 1.6 && y < 4.0) {
    d = smin(d, capsuleChainDist(p, L ? F.lipsU : F.lipsUR), 0.13);
    d = smin(d, capsuleChainDist(p, L ? F.lipsL : F.lipsLR), 0.13);
  }
  // pectoral fin base (fleshy lobe)
  if (s > 8.8 && s < 12.4) d = smin(d, ellipsoidDist(pm, F.pecLobe, [0.8, 1.4, 0.42]), 0.28);
  // pelvic disc base
  if (s > F.pelvicBase[0] - 2 && s < F.pelvicBase[0] + 2) d = smin(d, ellipsoidDist(p, F.pelvicBase, [1.0, 0.2, 0.85]), 0.22);
  // urogenital papilla
  if (Math.abs(s - F.papilla[0]) < 1.6) d = smin(d, sphereDist(p, F.papilla, 0.24), 0.14);
  // anterior nostril tube
  if (s < 2.2) d = smin(d, sphereDist(pm, [F.nosA[0] + F.nosAn[0] * 0.03, F.nosA[1] + F.nosAn[1] * 0.03, F.nosA[2] + F.nosAn[2] * 0.03], 0.09), 0.05);

  // --- subtractions
  if (s < E[0] + 3.2) for (const e of F.eyes) d = smax(d, -sphereDist(p, e.cut, F.rho), 0.07);
  if (s < RICTUS_S + 1.6 && y < 4.0) {
    d = smax(d, -capsuleChainDist(p, L ? F.crease : F.creaseR), 0.035);
    d = smax(d, -capsuleChainDist(p, L ? F.gU : F.gUR), 0.05);
  }
  if (s > 7.0 && s < 11.2) d = smax(d, -capsuleChainDist(p, L ? F.operc : F.opercR), 0.05);
  if (s > 4.6 && s < 7.8) d = smax(d, -capsuleChainDist(p, L ? F.preop : F.preopR), 0.04);
  // interorbital groove between the close-set eyes and the post-orbital notch [P: dip of ~0.6 %SL behind the eyes]
  if (s > 1.8 && s < 6.6) d = smax(d, -ellipsoidDist(p, F.interorb, [1.6, 0.3, 0.45]), 0.2);
  if (Math.abs(s - F.anus[0]) < 1.2) d = smax(d, -sphereDist(p, F.anus, 0.085), 0.05);
  if (s < 3.0) d = smax(d, -sphereDist(pm, F.nosB, 0.085), 0.05);
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
  const sc = clamp(s, 0.3, S_END - 3.0);
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

// ---------------------------------------------------------------------------
// Internal organs for the volumetric shader (ellipsoids, fish mm; absorption per mm, rgb).
// Placed relative to the measured landmarks (eye, pectoral girdle 26.4 %SL, vent ~53 %SL) and the local
// section, following goby anatomy [R]: liver behind the pectoral girdle, gut and dark peritoneum filling the
// abdominal cavity to the vent, kidney under the column, heart under the gill chamber, brain behind the eyes.
export function organs() {
  const at = (s, hn, zf = 0) => { const q = section(s); return [s, q.yc + (hn > 0 ? hn * q.t : hn * q.b), zf * q.w]; };
  const R = (s, rs, fy, fz) => { const q = section(s); return [rs, fy * (q.t + q.b) * 0.5, fz * q.w]; };
  const E = EYE.center;
  const sPec = P(26.4), sVent = P(53);
  const cav = (sPec + sVent) / 2, half = (sVent - sPec) / 2;
  return [
    { name: 'liver', c: at(sPec + 1.5, -0.5, 0.06), r: R(sPec + 1.5, 1.8, 0.33, 0.62), k: [1.3, 2.3, 2.9] },
    { name: 'gut', c: at(cav + 1.0, -0.6, -0.03), r: R(cav + 1.0, half * 0.66, 0.29, 0.5), k: [1.0, 1.4, 2.3] },
    // white (guanine) peritoneum: blocks the view of the gut but is not dark [P colour report]
    { name: 'peritoneum', c: at(cav, -0.22, 0), r: R(cav, half * 0.98, 0.09, 0.66), k: [0.9, 0.95, 1.0] },
    { name: 'kidney', c: at(cav, -0.08, 0), r: R(cav, half * 1.05, 0.065, 0.12), k: [0.8, 2.6, 2.6] },
    { name: 'heart', c: at(OPERCLE[6][0], -0.72, 0), r: [0.62, 0.45, 0.55], k: [0.5, 4.0, 3.6] },
    { name: 'brain', c: at(E[0] + 2.0, 0.3, 0), r: [2.1, 0.68, 0.72], k: [0.15, 0.2, 0.3] },
    { name: 'otolithL', c: [E[0] + 3.3, section(E[0] + 3.3).yc + 0.12, 0.72], r: [0.3, 0.19, 0.1], k: [6, 6, 6] },
    { name: 'otolithR', c: [E[0] + 3.3, section(E[0] + 3.3).yc + 0.12, -0.72], r: [0.3, 0.19, 0.1], k: [6, 6, 6] },
    { name: 'swimbladder', c: at(cav, 0.0, 0), r: [0.01, 0.01, 0.01], k: [0, 0, 0] }, // gobies: reduced/absent in adults [R]
  ];
}

// height of the snout–caudal-base axis (photo frame) in fish space
export const Y_AX = Y0;

// Colour-pattern parameters (see body.mjs, "ヒメハゼ colour pattern"). Positions in %SL; hn = relative height in the
// section (−1 ventral … +1 dorsal). Defaults describe a typical live adult; `dark` scales the melanophore
// density between pale (≈0.7, e.g. 025/031) and heavily mottled individuals (≈1.4, e.g. 026).
export const PATTERN = {
  dark: MALE ? 1.15 : 1.0,
  // mid-lateral blotches [x %SL, h (0 ventral … 1 dorsal), peak darkening, σx %SL, σy %SL, tilt°]
  // measured as luminance deficits on specimens A–D + 031 (positional SD ≤ 0.6 %SL) [P colour report §3.1];
  // literature: "4 (–5) blotches of 2 paired spots, ~2 scales wide" [F]
  blotches: [[28.3, 0.72, 0.8, 2.0, 1.5, -15], [41.0, 0.51, 0.65, 2.1, 1.3, -13], [57.0, 0.57, 0.82, 1.9, 1.3, 11], [73.0, 0.6, 0.8, 1.9, 1.4, 0], [87.4, 0.57, 0.75, 1.9, 1.3, 0]],
  blotchSplitP: 0.4,
  secondary: MALE ? [49, 65, 80.5, 92] : [65, 80.5],   // fainter extra marks (dark morph has all four)
  secondaryPeak: MALE ? 0.45 : 0.25,
  lowerRow: [50, 59, 66, 78],                          // small spots above the anal-fin base (h 0.12)
  // dense core ≈ 2 × 1.8 %SL at x 97–98.5, y 0…+0.5; streaks continue onto the fin rays (fins.mjs) [P fin report §6a]
  caudalSpot: { s: 97.8, len: 1.5, hn: 0.05, h: 0.36, k: 1.25 },
  // rust spots: 3 rows at h 0.65 / 0.78 / 0.90, one per scale column (period 2.8 %SL), Ø 0.85–1.05 %SL
  rustRows: [0.65, 0.78, 0.9],
  rustPeriod: 2.8,
  rustRadius: 0.47,
  rustStart: 25,
  rustEnd: 96,
  rustXan: 0.85,
  rustColor: [0.42, 0.17, 0.04], // linear albedo inside a rust spot (calibrated 0.43,0.23,0.08; live 0.25,0.12,0.03)
  // saddlets across the dorsal midline (weak) [P colour report §3.3; dorsal views]
  saddles: [30, 48, 57, 70, 79, 88],
  saddleK: MALE ? 0.5 : 0.38,
  // pale interspaces between the blotches [x, h, lift] and pearly flecks on the dorsum [P §3.7]
  paleInterspaces: [[46, 0.55, 0.25], [63.5, 0.55, 0.3], [79, 0.55, 0.3], [93.5, 0.52, 0.55]],
  pearlCount: 30,
  head: { preorbital: 0.35, cheekBar: 0.75, opercSpot: 0.6, subocular: 0.8 },
  pecSpot: 0.8,
  headMottle: 1.0,
  pearl: 0.35,
  // breeding male: cheeks and gill covers turn jet black [F: Sanbanze aquarium, Hiroshima Univ. museum; P 062 lower, 001, 014]
  blackCheek: MALE ? 1.0 : 0.0,
};
