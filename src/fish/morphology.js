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
// The snout (s < 0.07) is blunt and rounded: the profile rises steeply right
// behind the lips and the forehead is convex (p12_0, p42_1), not a wedge.
// Dorsal profile (height of the back above the axis)
//
// Behind the hypural plate (s > 1) the scaled peduncle does not end in a cap:
// the flesh runs on as a thin, laterally compressed tongue over the base of
// the caudal rays and closes in a rounded (convex) margin on the fin (p12_1,
// p40_1), so the fin grows out of the body instead of being plugged into it.
// The peduncle itself is deep (minimum depth ~0.16 SL, p40_1 / p42_0) and
// strongly compressed laterally: a broad flat wedge, not a round stalk.
const DORSAL_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.15, 0.23, 0.31, 0.385, 0.44, 0.52, 0.62, 0.73, 0.84, 0.93, 0.975, 1.0, 1.03, 1.06, 1.085, 1.1, 1.11, 1.116];
const DORSAL_Y = [0.019, 0.037, 0.06, 0.082, 0.1, 0.123, 0.161, 0.194, 0.214, 0.221, 0.214, 0.186, 0.142, 0.104, 0.086, 0.087, 0.087, 0.081, 0.067, 0.048, 0.032, 0.017, 0.006];
// Ventral profile (negative = below axis)
const VENTRAL_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.15, 0.21, 0.31, 0.41, 0.5, 0.6, 0.69, 0.76, 0.85, 0.92, 0.965, 1.0, 1.03, 1.06, 1.085, 1.1, 1.11, 1.116];
const VENTRAL_Y = [-0.011, -0.031, -0.05, -0.065, -0.077, -0.089, -0.106, -0.133, -0.149, -0.155, -0.148, -0.124, -0.103, -0.077, -0.068, -0.0705, -0.072, -0.067, -0.056, -0.04, -0.027, -0.015, -0.006];
// Half body width (dorsal view). The snout is broad and rounded in dorsal
// view (a blunt muzzle, not a wedge); the tongue behind s = 1 thins out to
// little more than the thickness of the fleshy fin base.
// (the muzzle at the lips is a little narrower than the head behind it: in
// front view the lips span about 0.4 of the interorbital width, p29_0)
// (the head is broad at the eyes and over the cheeks: in front view it is
// about as wide as deep there, flat-fronted, and the eyes sit almost flush
// in its outline rather than standing out of a head that narrows toward the
// snout, p09_1, p29_0)
const WIDTH_S = [0.0, 0.01, 0.033, 0.066, 0.108, 0.16, 0.22, 0.29, 0.36, 0.45, 0.55, 0.65, 0.75, 0.85, 0.93, 0.97, 1.0, 1.02, 1.04, 1.06, 1.08, 1.095, 1.108, 1.116];
const WIDTH_Z = [0.012, 0.028, 0.05, 0.066, 0.077, 0.087, 0.094, 0.099, 0.1, 0.097, 0.089, 0.075, 0.057, 0.038, 0.026, 0.02, 0.015, 0.0118, 0.0092, 0.0066, 0.0042, 0.0025, 0.0014, 0.001];
// Vertical position of the widest level (-1 = ventral edge, +1 = dorsal edge)
const WMAX_S = [0.0, 0.1, 0.3, 0.5, 0.75, 1.0, 1.12];
const WMAX_Y = [0.0, -0.08, -0.2, -0.24, -0.12, 0.0, 0.0];
// Superellipse exponents of the cross-section. >2 = boxy/full, <2 = keeled.
// The head is close to elliptic (n ~ 2): a boxier section shows as a crease
// where the top of the head meets the cheek. Around the eyes it is a little
// fuller (a broad, flattish interorbital and brow over the eyes, p09_1),
// fading back to elliptic behind the operculum.
const NTOP_S = [0.0, 0.06, 0.15, 0.25, 0.35, 0.5, 0.75, 1.0, 1.12];
const NTOP_V = [2.1, 2.55, 2.65, 2.3, 1.95, 1.9, 1.85, 1.95, 1.95];
const NBOT_S = [0.0, 0.15, 0.35, 0.55, 0.7, 0.85, 1.0, 1.12];
const NBOT_V = [2.1, 2.3, 2.4, 2.35, 1.95, 1.85, 1.95, 1.95];

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
  // eye: centre in (s, y); radius of the eyeball. The eye sits in its orbit
  // nearly flush with the head (p05_1, p12_0, p25_0, p11_1): only a low cap
  // of a larger ball shows, ringed by a soft fleshy rim of orbital skin, so
  // it never reads as a marble set on the head.
  eyeS: 0.1157,
  eyeY: 0.0118,
  // (a smaller ball standing further proud keeps the same visible disc in
  // side view but bulges out of the head in front view, as in p09_1, p29_0)
  // (the ball a little more proud: a corneal dome in front view rather than
  // a flat lens; the visible disc ~5 % smaller and the fleshy rim around it
  // much narrower, so the whole eye reads ~20 % smaller than an eye ringed
  // by a broad halo, while the iris disc stays close to the photos)
  // (front view: a flatter cap of a larger ball, so the eye bulges only
  // ~15 % of its diameter beyond the head outline with the same visible
  // disc in side view, p09_1, p29_0)
  eyeR: 0.0449,
  eyeProtrusion: 0.3, // fraction of radius standing proud of the head surface
  // pupil radius (SL): a round black pupil, about half the visible eye
  // (p05_1, p12_0, p11_1, p25_0); the rest is a broad brass / silver-grey iris
  pupilR: 0.016,
  // mouth (terminal, very slightly superior)
  mouthY: -0.005,
  // open gape (front view of p09_1: a taller-than-wide oval, round-topped,
  // the lower jaw dropping well below the upper lip, about a third of the
  // interorbital width across)
  mouthOpenRW: 0.03, // half-width at the upper lip
  mouthOpenTop: 0.018, // upper lip above the mouth line when open
  mouthOpenBot: 0.037, // lower lip below it (the jaw drops)
  mouthOpenFwd: 0.0035, // the open lips push forward a little
  // closed mouth (front view of p29_0, p09_1): a small, gently arched cleft
  // about a quarter to a third of the interorbital width across under a
  // rounded upper lip; the lip fold runs on behind the corners along the
  // sides of the snout (side view: p05_1, p25_0)
  // (the cleft about 0.35 of the interorbital width across, p29_0)
  // (front view: the cleft with its lips about 0.35-0.4 IO across)
  mouthClosedRW: 0.0125, // half-width of the cleft
  // (a wider gap showed a dark open slit in the resting face)
  mouthClosedRH: 0.0005, // the closed lips meet: only a fine cleft line
  mouthClosedDroop: 0.0025, // the corners hang this far below the midline
  mouthCornerBack: 0.007, // ...and sit this far behind the front of the lips
  mouthProtrusion: 0.012, // premaxillary protrusion (separate morph)
  mouthDepth: 0.075, // depth of the buccal cavity into the head
  // nostrils (paired nares) in front of the eye, at about the level of the
  // top of the eye just under the dorsal outline
  nareS: 0.044,
  nareY: 0.061,
  // opercular (gill cover) posterior margin: s as function of y
  opercTopY: 0.118,
  opercBotY: -0.108,
  // pectoral fin base (just behind the lower opercular margin)
  pectoralS: 0.305,
  pectoralY: -0.088,
};

/** s-coordinate of the free posterior margin of the operculum at height y. */
export function opercMarginS(y) {
  // C-shaped margin: most posterior at mid-height, curving forward above
  // (to the dorsal end of the gill opening) and strongly forward below
  // (towards the isthmus / branchiostegal membrane).
  const t = clamp((y - head.opercBotY) / (head.opercTopY - head.opercBotY), 0, 1); // 0 bottom .. 1 top
  // (head length tip -> margin ~2.7 snout-eye distances, HL/SL ~0.31:
  // p05_1, p12_0, p11_1 and the koi skeleton)
  const mid = 0.303;
  const up = 0.27;
  const down = 0.238;
  const k = t - 0.52;
  if (k >= 0) return mid - (mid - up) * Math.pow(k / 0.48, 1.9);
  return mid - (mid - down) * Math.pow(-k / 0.52, 1.6);
}

/** Preopercle ridge (the curved bony ridge between eye and operculum). */
export function preopercS(y) {
  // vertical limb at ~0.65 HL, half an eye diameter behind the orbit, curving
  // forward ventrally toward the jaw joint
  return opercMarginS(y) - 0.1 - 0.02 * Math.max(0, -y) / 0.1;
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

/** Caudal ray direction (radians from the backward axis) at d = |r - 0.5| * 2. */
export function caudalRayAngle(d) {
  const proc = smoothstep(0.78, 1.0, d);
  return 0.5 * Math.pow(d, 0.85) + 0.12 * proc;
}

/** Caudal ray base [s, |y|] on the hypural plate / peduncle margin. */
export function caudalRayBase(d) {
  // procurrent rays creep forward along the peduncle margin
  // (the hypural fan spans most of the deep peduncle, so the outer rays leave
  // the body at its dorsal / ventral outline)
  const proc = smoothstep(0.78, 1.0, d);
  return [1.0 - 0.075 * proc, 0.073 * Math.min(1, d / 0.8) + 0.006 * proc];
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/**
 * Comet caudal fin ray length as a function of ray position r (0 dorsal ..
 * 1 ventral). Each lobe is a long ribbon (p40_1, p42_0): the central rays
 * form a deep, round-bottomed fork whose inner margin runs almost parallel to
 * the leading edge; the lobe ends in a broad, obliquely truncated, rounded
 * end formed by the tips of many nearly equally long rays, and the leading
 * edge (outermost principal ray) drops into the short procurrent rays.
 * Lengths are solved in the nominal rest pose (caudal spread 0.9).
 */
export function caudalRayLength(r, lobe = 0.72, fork = 0.23) {
  const d = Math.abs(r - 0.5) * 2; // 0 at fork .. 1 at outer procurrent ray
  const tip = 0.8; // outermost principal ray (leading edge, longest)
  const spread = 0.9;
  const kIn = 0.25; // rounding of the inner corner of the lobe end
  const kOut = 0.14; // rounding of the leading-edge corner
  const kFork = 0.06; // rounding of the fork notch
  const L = lobe + kOut * 0.25;
  // inner margin: a line through the fork point, opening slightly less than
  // the leading edge so the lobe widens a little toward its end
  const [s0, y0] = caudalRayBase(d);
  const th = caudalRayAngle(d) * spread;
  const thl = caudalRayAngle(tip) * spread - 0.06;
  const dx = -Math.cos(th);
  const dy = Math.sin(th);
  const tx = -Math.cos(thl);
  const ty = Math.sin(thl);
  const den = dx * ty - dy * tx; // < 0 while the ray opens less than the margin
  const num = (-1 - fork + s0) * ty + y0 * tx;
  let inner = den < -1e-5 ? num / den : 1e3;
  if (inner < 0) inner = 1e3;
  // the margin bows slightly: the lobe broadens toward its end (paddle)
  inner *= 1 + Math.pow(Math.max(Math.min(inner, 2) - fork, 0), 2);
  // round-bottomed notch
  const hf = Math.max(kFork - Math.abs(inner - fork), 0) / kFork;
  inner = Math.max(inner, fork) + hf * hf * kFork * 0.25;
  // lobe end: oblique (leading edge longest) and rounded
  const e = Math.max(d / tip, 0.3);
  const end = L * (1 - 0.2 * (1 - e) - 0.8 * (e - 0.75) * (e - 0.75));
  // outer margin, extended past the tip so the margins can be blended
  const u = (d - tip) / (1 - tip);
  const outer = u >= 0 ? L * (1 - 0.97 * u) + 0.01 : L * (1 - 3.0 * u);
  return smin(smin(inner, end, kIn), outer, kOut);
}

export function buildFinDefs(variation = {}) {
  const lobe = variation.caudalLobe ?? 0.72;
  const fork = variation.caudalFork ?? 0.25;
  const dorsalH = variation.dorsalHeight ?? 0.25;
  const pectL = variation.pectoralLength ?? 0.3;
  const pelvL = variation.pelvicLength ?? 0.34;
  const analL = variation.analLength ?? 0.22;

  // CAUDAL — 19 principal + 5 procurrent each side = 29 rays
  const caudalRays = rayProfile(29, (r) => {
    const d = Math.abs(r - 0.5) * 2;
    const sgn = r < 0.5 ? 1 : -1;
    const [s, yb] = caudalRayBase(d);
    const yBase = sgn * yb;
    const angle = sgn * caudalRayAngle(d); // radians from -x axis
    return { s, y: yBase, z: 0, angle, length: caudalRayLength(r, lobe, fork), r };
  });

  // DORSAL — 3 unbranched + 16 branched
  const dorsalRays = rayProfile(19, (r, i) => {
    const s = lerp(0.452, 0.815, Math.pow(r, 0.97));
    const lenFront = i === 0 ? 0.05 : i === 1 ? 0.13 : i === 2 ? 0.235 : 1;
    const branchedLen = dorsalH * (1 - 0.55 * Math.pow(Math.max(0, (i - 3) / 15), 1.1));
    const length = i < 3 ? lenFront * (dorsalH / 0.3) : branchedLen;
    const angle = lerp(0.66, 0.4, r); // elevation from the backward axis (radians)
    return { s, y: profile.top(s) - 0.003, z: 0, angle, length, r, spine: i === 2 };
  });

  // ANAL — 3 unbranched + 6 branched (single fin in the comet)
  const analRays = rayProfile(9, (r, i) => {
    const s = lerp(0.742, 0.83, r);
    const lens = [0.05, 0.12, 0.2, 0.225, 0.215, 0.195, 0.17, 0.14, 0.11]; // rounded margin
    return { s, y: profile.bot(s) + 0.003, z: 0, angle: lerp(0.92, 0.55, r), length: lens[i] * (analL / 0.2), r };
  });

  // PECTORAL — 16 rays, leading edge ray thick
  const pectoralRays = rayProfile(16, (r, i) => {
    // rounded paddle: rays 2-5 longest, the margin convex toward the short trailing rays
    const lens = [0.23, 0.26, 0.265, 0.262, 0.255, 0.244, 0.23, 0.213, 0.194, 0.173, 0.152, 0.131, 0.111, 0.093, 0.077, 0.063];
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
    // pelvic fan: 2nd ray longest, the margin slightly convex posteriorly
    const lens = [0.29, 0.33, 0.315, 0.285, 0.248, 0.21, 0.175, 0.142, 0.112];
    return { s: 0.465 + 0.025 * r, y: 0, angle: lerp(0.0, 0.58, r), length: lens[i] * (pelvL / 0.33), r };
  });

  return {
    caudal: { rays: caudalRays, chains: [0, 0.1, 0.22, 0.34, 0.5, 0.66, 0.78, 0.9, 1.0], nodes: 10 },
    dorsal: { rays: dorsalRays, chains: [0, 0.16, 0.4, 0.7, 1.0], nodes: 7 },
    anal: { rays: analRays, chains: [0, 0.35, 0.65, 1.0], nodes: 6 },
    pectoral: { rays: pectoralRays, chains: [0, 0.33, 0.66, 1.0], nodes: 7 },
    pelvic: { rays: pelvicRays, chains: [0, 0.5, 1.0], nodes: 6 },
  };
}
