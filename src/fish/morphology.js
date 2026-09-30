// Comet goldfish (Carassius auratus, single-tail "comet" form) morphometrics.
//
// All lengths are in units of STANDARD LENGTH (SL = snout tip -> end of the
// hypural plate / caudal fin base). Values were measured on the clean lateral
// reference photographs supplied with the brief (p06, p34, p40 of the photo
// collection) and cross-checked against published goldfish / Carassius
// morphometrics — see docs/RESEARCH_REPORT.md §2 for the sources.
//
// Local rest frame of the fish:
//   x : forward axis, snout tip at x = 0, body extends to x = -1 (s = -x)
//   y : dorsal (up)
//   z : lateral (left side = +z)
// The longitudinal axis (y = 0) passes through the mouth / snout tip.

import { monotoneCubic, smoothstep, clamp, lerp } from '../core/math.js';

// --- Lateral (side view) profiles --------------------------------------------
// Dorsal profile (height of the back above the axis)
const DORSAL_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.15, 0.23, 0.31, 0.385, 0.455, 0.56, 0.67, 0.78, 0.88, 0.955, 1.0, 1.04];
const DORSAL_Y = [0.011, 0.027, 0.047, 0.069, 0.092, 0.111, 0.144, 0.178, 0.203, 0.214, 0.198, 0.164, 0.12, 0.087, 0.069, 0.066, 0.068];
// Ventral profile (negative = below axis)
const VENTRAL_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.15, 0.21, 0.31, 0.41, 0.5, 0.6, 0.69, 0.76, 0.85, 0.92, 0.965, 1.0, 1.04];
const VENTRAL_Y = [-0.011, -0.026, -0.042, -0.057, -0.071, -0.083, -0.097, -0.119, -0.134, -0.141, -0.138, -0.118, -0.1, -0.071, -0.056, -0.056, -0.061, -0.066];
// Half body width (dorsal view)
const WIDTH_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.16, 0.22, 0.29, 0.36, 0.45, 0.55, 0.65, 0.75, 0.85, 0.93, 1.0, 1.02, 1.04];
const WIDTH_Z = [0.012, 0.022, 0.036, 0.05, 0.064, 0.077, 0.088, 0.097, 0.1, 0.097, 0.089, 0.075, 0.057, 0.038, 0.026, 0.018, 0.011, 0.003];
// Vertical position of the widest level (-1 = ventral edge, +1 = dorsal edge)
const WMAX_S = [0.0, 0.1, 0.3, 0.5, 0.75, 1.0];
const WMAX_Y = [0.0, -0.08, -0.2, -0.24, -0.12, 0.0];
// Superellipse exponents of the cross-section. >2 = boxy/full, <2 = keeled.
const NTOP_S = [0.0, 0.15, 0.35, 0.5, 0.75, 1.0];
const NTOP_V = [2.2, 2.15, 2.0, 1.9, 1.85, 1.95];
const NBOT_S = [0.0, 0.15, 0.35, 0.55, 0.7, 0.85, 1.0];
const NBOT_V = [2.2, 2.3, 2.45, 2.35, 1.95, 1.85, 1.95];

export const profile = {
  top: monotoneCubic(DORSAL_S, DORSAL_Y),
  bot: monotoneCubic(VENTRAL_S, VENTRAL_Y),
  hw: monotoneCubic(WIDTH_S, WIDTH_Z),
  wmax: monotoneCubic(WMAX_S, WMAX_Y),
  nTop: monotoneCubic(NTOP_S, NTOP_V),
  nBot: monotoneCubic(NBOT_S, NBOT_V),
};

// --- Head landmarks ------------------------------------------------------------
export const head = {
  // eye: centre in (s, y); radius of the exposed eyeball
  eyeS: 0.122,
  eyeY: 0.012,
  eyeR: 0.038,
  eyeProtrusion: 0.5, // fraction of radius standing proud of the head surface
  // mouth (terminal, very slightly superior)
  mouthY: 0.002,
  mouthOpenRW: 0.027, // open gape half-width
  mouthOpenRH: 0.025, // open gape half-height
  mouthClosedRW: 0.022,
  mouthClosedRH: 0.0022,
  mouthProtrusion: 0.011, // premaxillary protrusion when open
  mouthDepth: 0.075, // depth of the buccal cavity into the head
  // nostrils (paired nares) in front of the eye
  nareS: 0.05,
  nareY: 0.041,
  // opercular (gill cover) posterior margin: s as function of y
  opercTopY: 0.118,
  opercBotY: -0.108,
  // pectoral fin base (just behind the lower opercular margin)
  pectoralS: 0.3,
  pectoralY: -0.083,
};

/** s-coordinate of the free posterior margin of the operculum at height y. */
export function opercMarginS(y) {
  // C-shaped margin: most posterior at mid-height, curving forward above
  // (to the dorsal end of the gill opening) and strongly forward below
  // (towards the isthmus / branchiostegal membrane).
  const t = clamp((y - head.opercBotY) / (head.opercTopY - head.opercBotY), 0, 1); // 0 bottom .. 1 top
  const mid = 0.296;
  const up = 0.262;
  const down = 0.228;
  const k = t - 0.52;
  if (k >= 0) return mid - (mid - up) * Math.pow(k / 0.48, 1.9);
  return mid - (mid - down) * Math.pow(-k / 0.52, 1.6);
}

/** Preopercle ridge (the curved bony ridge between eye and operculum). */
export function preopercS(y) {
  return opercMarginS(y) - 0.058 - 0.02 * Math.max(0, -y) / 0.1;
}

// --- Cross-section --------------------------------------------------------------
/**
 * Point on the body surface for axial parameter s (0 snout .. 1 caudal base)
 * and angle theta (0 = ventral midline, PI/2 = left flank, PI = dorsal ridge).
 * Returns [y, z] in SL units (without head detail displacement).
 */
export function sectionPoint(s, theta, out) {
  const T = profile.top(s);
  const B = profile.bot(s);
  const W = Math.max(profile.hw(s), 1e-4);
  const mid = 0.5 * (T + B);
  const half = 0.5 * (T - B);
  const ym = mid + profile.wmax(s) * half;
  const a = -Math.cos(theta); // -1 ventral .. +1 dorsal
  const b = Math.sin(theta); // lateral
  const n = a >= 0 ? profile.nTop(s) : profile.nBot(s);
  const e = 2 / n;
  const ya = Math.sign(a) * Math.pow(Math.abs(a), e);
  const zb = Math.sign(b) * Math.pow(Math.abs(b), e);
  out[0] = ym + (a >= 0 ? T - ym : ym - B) * ya;
  out[1] = W * zb;
  return out;
}

/** Approximate thickness of the body at (s, y) — used for subsurface tint. */
export function thicknessAt(s) {
  return 2 * profile.hw(clamp(s, 0, 1));
}

// --- Fins ------------------------------------------------------------------------
// Each fin is described by a list of rays: base point (s, y, zSide) on the body,
// a rest direction in the fin plane and a length. Fins are later resolved into
// geometry (one vertex column per ray + membrane columns) and a handful of
// simulated "ray chains" that drive deformation.
//
// Ray counts follow Carassius auratus meristics (see research report):
//   dorsal  III-IV + 15-19   anal  II-III + 5-6   pectoral 15-17
//   pelvic  8-9              caudal 19 principal (10 + 9) + procurrent rays

function rayProfile(n, fn) {
  const rays = [];
  for (let i = 0; i < n; i++) rays.push(fn(i / (n - 1), i));
  return rays;
}

/** Comet caudal fin ray length as a function of ray position r (0 dorsal .. 1 ventral). */
export function caudalRayLength(r, lobe = 0.72, fork = 0.23) {
  const d = Math.abs(r - 0.5) * 2; // 0 at fork .. 1 at outer procurrent ray
  const tip = 0.8; // position of the longest (lobe-tip) ray
  if (d <= tip) {
    const t = d / tip;
    // inner (fork) margin almost straight -> slightly concave
    return fork + (lobe - fork) * Math.pow(t, 1.25);
  }
  const t = (d - tip) / (1 - tip);
  // outer margin: rays shorten rapidly into the short procurrent rays
  return lobe * (1 - 0.97 * Math.pow(t, 0.7)) + 0.01;
}

export function buildFinDefs(variation = {}) {
  const lobe = variation.caudalLobe ?? 0.72;
  const fork = variation.caudalFork ?? 0.25;
  const dorsalH = variation.dorsalHeight ?? 0.3;
  const pectL = variation.pectoralLength ?? 0.26;
  const pelvL = variation.pelvicLength ?? 0.3;
  const analL = variation.analLength ?? 0.2;

  // CAUDAL — 19 principal + 5 procurrent each side = 29 rays
  const caudalRays = rayProfile(29, (r) => {
    const d = Math.abs(r - 0.5) * 2;
    const sgn = r < 0.5 ? 1 : -1;
    // procurrent rays creep forward along the peduncle margin
    const proc = smoothstep(0.78, 1.0, d);
    const s = 1.0 - 0.075 * proc;
    const yBase = sgn * (0.062 * Math.min(1, d / 0.8) + 0.004 * proc);
    const angle = sgn * (0.42 * Math.pow(d, 0.9) + 0.12 * proc); // radians from -x axis
    return { s, y: yBase, z: 0, angle, length: caudalRayLength(r, lobe, fork), r };
  });

  // DORSAL — 3 unbranched + 16 branched
  const dorsalRays = rayProfile(19, (r, i) => {
    const s = lerp(0.452, 0.815, Math.pow(r, 0.97));
    const lenFront = i === 0 ? 0.05 : i === 1 ? 0.14 : i === 2 ? 0.27 : 1;
    const branchedLen = dorsalH * (1 - 0.74 * Math.pow(Math.max(0, (i - 3) / 15), 0.85));
    const length = i < 3 ? lenFront * (dorsalH / 0.3) : branchedLen;
    const angle = lerp(0.74, 0.34, r); // elevation from the backward axis (radians)
    return { s, y: profile.top(s) - 0.003, z: 0, angle, length, r, spine: i === 2 };
  });

  // ANAL — 3 unbranched + 6 branched (single fin in the comet)
  const analRays = rayProfile(9, (r, i) => {
    const s = lerp(0.742, 0.83, r);
    const lens = [0.05, 0.12, 0.2, 0.22, 0.205, 0.18, 0.15, 0.12, 0.09];
    return { s, y: profile.bot(s) + 0.003, z: 0, angle: lerp(0.92, 0.55, r), length: lens[i] * (analL / 0.2), r };
  });

  // PECTORAL — 16 rays, leading edge ray thick
  const pectoralRays = rayProfile(16, (r, i) => {
    const lens = [0.2, 0.235, 0.25, 0.26, 0.255, 0.245, 0.23, 0.21, 0.19, 0.17, 0.15, 0.13, 0.115, 0.1, 0.085, 0.07];
    // base is an oblique line (leading ray dorsal-anterior, trailing ray ventral-posterior)
    return {
      s: head.pectoralS + 0.028 * r,
      y: head.pectoralY - 0.02 * r,
      angle: lerp(0.0, 0.9, r), // fan angle inside the fin plane
      length: lens[i] * (pectL / 0.26),
      r,
    };
  });

  // PELVIC — 9 rays
  const pelvicRays = rayProfile(9, (r, i) => {
    const lens = [0.25, 0.3, 0.29, 0.26, 0.23, 0.2, 0.17, 0.14, 0.11];
    return { s: 0.47 + 0.02 * r, y: 0, angle: lerp(0.0, 0.62, r), length: lens[i] * (pelvL / 0.3), r };
  });

  return {
    caudal: { rays: caudalRays, chains: [0, 0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9, 1.0], nodes: 10 },
    dorsal: { rays: dorsalRays, chains: [0, 0.16, 0.4, 0.7, 1.0], nodes: 7 },
    anal: { rays: analRays, chains: [0, 0.35, 0.65, 1.0], nodes: 6 },
    pectoral: { rays: pectoralRays, chains: [0, 0.33, 0.66, 1.0], nodes: 7 },
    pelvic: { rays: pelvicRays, chains: [0, 0.5, 1.0], nodes: 6 },
  };
}
