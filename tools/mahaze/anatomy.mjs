// Anatomical definition of a ~50 mm TL juvenile Acanthogobius flavimanus (マハゼ幼魚).
//
// Fish space (millimetres):
//   s : distance from the snout tip along the body axis (0 = snout, SL = caudal base)
//   y : height (0 = ventral baseline under the head), +y = dorsal
//   z : lateral, +z = fish's left side
// Object space of the exported glTF (metres): X = z, Y = y - Y0, Z = S0 - s  (head points to +Z).

import { clamp, smoothstep } from '../lib/noise.mjs';

export const SL = 41.0; // standard length
export const S_END = 43.2; // end of the body loft (thin blade overlapping the caudal fin base)
export const TL = 50.0; // total length including the caudal fin
export const S0 = 25.0; // object-space origin along the axis
export const Y0 = 3.2; // object-space origin height
export const VERT_START = 10.9; // first vertebra (behind the skull)
export const VERT_COUNT = 31;

// ---------------------------------------------------------------------------
// Profile key points (pre-cap dimensions)
const KS = [0.0, 0.6, 1.5, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 16.0, 19.0, 22.0, 25.0, 28.0, 31.0, 34.0, 37.0, 39.5, 41.0, 43.2];
const KTOP = [2.85, 3.3, 4.0, 4.62, 5.0, 5.15, 5.3, 5.5, 5.85, 6.2, 6.3, 6.18, 5.92, 5.55, 5.2, 4.9, 4.65, 4.5, 4.4, 4.25];
const KBOT = [1.15, 0.92, 0.52, 0.2, 0.05, 0.0, 0.0, 0.0, 0.05, 0.1, 0.15, 0.3, 0.55, 0.8, 1.02, 1.18, 1.28, 1.36, 1.42, 1.6];
const KW = [1.05, 1.4, 1.9, 2.5, 3.05, 3.4, 3.55, 3.42, 3.18, 2.92, 2.7, 2.46, 2.2, 1.9, 1.58, 1.28, 0.98, 0.76, 0.6, 0.45];
const KNT = [2.2, 2.2, 2.25, 2.3, 2.35, 2.35, 2.3, 2.25, 2.2, 2.1, 2.05, 2.0, 1.95, 1.92, 1.9, 1.85, 1.82, 1.8, 1.8, 1.8];
const KNB = [2.4, 2.6, 2.8, 3.1, 3.2, 3.2, 3.1, 3.0, 2.85, 2.7, 2.55, 2.4, 2.25, 2.1, 2.0, 1.95, 1.9, 1.85, 1.85, 1.85];

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

const SNOUT_CAP = 0.9;
const TAIL_BLADE0 = 39.3;

function snoutCap(s) {
  if (s >= SNOUT_CAP) return 1;
  const u = clamp(s / SNOUT_CAP, 0, 1);
  return Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
}
// the caudal peduncle ends in a thin vertical blade that merges into the caudal fin plane
function tailU(s) { return clamp((s - TAIL_BLADE0) / (S_END - TAIL_BLADE0), 0, 1); }

/** Cross-section parameters at s. */
export function section(s) {
  const top = fTop(s), bot = fBot(s);
  const yc = (top + bot) / 2;
  const c = snoutCap(s);
  const u = tailU(s);
  const ch = c * (1 - 0.45 * u * u);
  const cw = c * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.4 * u);
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

// Eye (left side, +z). Right eye mirrors z.
export const EYE = {
  center: [5.3, 4.2, 1.45],
  axis: norm3([-0.2, 0.72, 0.66]),
  radius: 1.25,
  skin: 0.1,
  aperture: 57 * (Math.PI / 180),
};

// Mouth line (s, y) on the lateral surface; lips follow it.
export const MOUTH = [[0.02, 1.98], [0.35, 1.9], [0.9, 1.75], [1.6, 1.58], [2.5, 1.42], [3.4, 1.3], [4.2, 1.22], [4.8, 1.18]];
// Opercular margin (s, y)
export const OPERCLE = [[10.0, 4.75], [10.7, 4.2], [11.25, 3.4], [11.45, 2.5], [11.3, 1.6], [10.8, 0.85], [10.0, 0.35]];
// Preopercular groove (s, y)
export const PREOPERCLE = [[7.2, 4.0], [7.9, 3.3], [8.25, 2.5], [8.0, 1.7], [7.2, 1.05], [6.2, 0.65]];

function onSurface(poly, inset = 0, lift = 0, dy = 0) {
  return poly.map(([s, y]) => {
    const { p, n } = surfaceAt(s, y + dy);
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

function buildFeatures() {
  const upperLip = onSurface(MOUTH.map(([s, y]) => [s, y]), 0.14, 0.12);
  const lowerLip = onSurface(MOUTH.map(([s, y]) => [s, y]), 0.15, -0.14);
  const mouthCrease = onSurface(MOUTH, 0.0, 0.0);
  upperLip[0][2] = 0; lowerLip[0][2] = 0; mouthCrease[0][2] = 0;
  const n = MOUTH.length;
  const ru = MOUTH.map((_, i) => (i === 0 ? 0.12 : i === 1 ? 0.16 : 0.19 - 0.08 * (i / (n - 1))));
  const rl = MOUTH.map((_, i) => 0.16 - 0.08 * (i / (n - 1)));
  const rc = MOUTH.map((_, i) => 0.06 - 0.02 * (i / (n - 1)));
  const lipsU = capsuleChain(upperLip, ru);
  const lipsL = capsuleChain(lowerLip, rl);
  const crease = capsuleChain(mouthCrease, rc);
  const operc = capsuleChain(onSurface(OPERCLE, -0.01), OPERCLE.map((_, i) => (i === OPERCLE.length - 1 ? 0.03 : 0.05)));

  const pecSurf = surfaceAt(12.35, 2.35);
  const pecLobe = [pecSurf.p[0], pecSurf.p[1], pecSurf.p[2] - 0.28];

  const nosA = surfaceAt(1.35, 3.25);
  const nosB = surfaceAt(2.55, 3.95);

  const E = EYE;
  const Rs = E.radius + E.skin;
  const cutOff = 1.3;
  const rho = Math.sqrt(Rs * Rs + cutOff * cutOff - 2 * Rs * cutOff * Math.cos(E.aperture));
  const eyeL = { c: E.center, cut: [E.center[0] + E.axis[0] * cutOff, E.center[1] + E.axis[1] * cutOff, E.center[2] + E.axis[2] * cutOff] };
  const eyeR = { c: [eyeL.c[0], eyeL.c[1], -eyeL.c[2]], cut: [eyeL.cut[0], eyeL.cut[1], -eyeL.cut[2]] };

  return {
    lipsU, lipsUR: mirrorZ(lipsU), lipsL, lipsLR: mirrorZ(lipsL),
    crease, creaseR: mirrorZ(crease), operc, opercR: mirrorZ(operc),
    pecLobe, nosA: nosA.p, nosAn: nosA.n, nosB: nosB.p,
    eyes: [eyeL, eyeR], Rs, rho,
    papilla: [22.9, botY(22.9) + 0.02, 0],
    anus: [22.45, botY(22.45) - 0.03, 0],
    pelvicBase: [12.0, botY(12.0) + 0.08, 0],
    interorb: [5.4, topY(5.4) + 0.28, 0],
  };
}

export const FEAT = buildFeatures();

/** Sculpted signed distance field (mm). Negative inside the fish. */
export function field(s, y, z) {
  const F = FEAT;
  const p = [s, y, z];
  const az = Math.abs(z);
  const pm = [s, y, az]; // mirrored to the +z side for symmetric features
  let d = baseDist(s, y, z);
  // eye bulges
  for (const e of F.eyes) d = smin(d, sphereDist(p, e.c, F.Rs), 0.5);
  // lips
  if (s < 6.5 && y < 3.2) {
    d = smin(d, capsuleChainDist(p, z >= 0 ? F.lipsU : F.lipsUR), 0.18);
  }
  // pectoral fin base (fleshy lobe)
  if (s > 10.5 && s < 14.5) d = smin(d, ellipsoidDist(pm, F.pecLobe, [0.75, 1.55, 0.45]), 0.3);
  // pelvic disc base
  if (s > 10 && s < 14) d = smin(d, ellipsoidDist(p, F.pelvicBase, [1.1, 0.22, 0.9]), 0.25);
  // urogenital papilla
  if (s > 21.5 && s < 24.5) d = smin(d, sphereDist(p, F.papilla, 0.26), 0.15);
  // anterior nostril tube
  if (s < 3) d = smin(d, sphereDist(pm, [F.nosA[0] + F.nosAn[0] * 0.02, F.nosA[1] + F.nosAn[1] * 0.02, F.nosA[2] + F.nosAn[2] * 0.02], 0.11), 0.07);

  // --- subtractions
  for (const e of F.eyes) d = smax(d, -sphereDist(p, e.cut, F.rho), 0.14);
  if (s < 6.5 && y < 3.0) d = smax(d, -capsuleChainDist(p, z >= 0 ? F.crease : F.creaseR), 0.05);
  if (s > 9 && s < 12.5) d = smax(d, -capsuleChainDist(p, z >= 0 ? F.operc : F.opercR), 0.05);
  if (s > 3 && s < 8) d = smax(d, -ellipsoidDist(p, F.interorb, [1.7, 0.42, 0.55]), 0.3);
  if (s > 21.5 && s < 23.5) d = smax(d, -sphereDist(p, F.anus, 0.09), 0.05);
  if (s < 4) d = smax(d, -sphereDist(pm, F.nosB, 0.1), 0.06);
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
  const sc = clamp(s, 2.6, 40.2);
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
