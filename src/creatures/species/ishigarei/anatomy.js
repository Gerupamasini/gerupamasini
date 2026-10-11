// イシガレイ (Platichthys bicoloratus) juvenile, total length 70 mm: every measurement of the model in one place.
//
// Fish frame (mm): s = distance from the snout tip backwards along the body axis, x = dorsoventral offset from
// the vertebral axis (+ dorsal), y = height above the mid-plane of the body (+ eyed side = right side).
// The fish is right-eyed ("左ヒラメに右カレイ") and lies on its blind (left) side, so in the model frame
// (metres, see toModel) +Y is up (eyed side), +Z is forward (snout) and +X points to the dorsal fin.
// Seen from above with the head pointing right, the dorsal fin is on top — as in every photograph of the
// eyed side.
//
// Proportions are taken from the reference photographs (measured on the 70 photos listed in docs/models/ishigarei/README.md): juvenile of TL 55–95 mm,
// SL ≈ 0.82 TL, body depth ≈ 0.45 SL, head ≈ 0.25 SL, dorsal fin from above the upper eye, anal fin from
// behind the pelvic fins, small eyed-side pectoral, rounded caudal fin, both eyes on raised turrets close
// together on the right side, the upper (migrated) eye on the dorsal profile and a little behind the lower
// one, a small terminal mouth whose blind-side jaw is the longer one.

export const TL_MM = 70.0;
export const SL_MM = 57.5;
export const S_ROOT = 20.0;          // origin of the model (≈ centre of the body disc)
export const S_END = SL_MM + 0.4;    // last body ring (closes the caudal peduncle)
export const HEAD_END = 14.5;        // free margin of the gill cover (head / body mesh split)
export const X_RANGE = [-14.5, 14.5]; // texture atlas range across the body (mm)

// ------------------------------------------------------------------------------------------ interpolation
// monotone cubic (Fritsch–Carlson): no overshoot between control points
export function monotone(xs, ys) {
  const n = xs.length;
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const k = (lo + hi) >> 1; if (xs[k] <= x) lo = k; else hi = k; }
    const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------------ planform
// dorsal (xd) and ventral (xv) body margins without fins. Deepest at s ≈ 25 (≈ 0.45 SL); the snout is
// short and blunt; the peduncle is short and deep (≈ 0.12 SL).
const PLAN_S = [0, 1.0, 2.5, 4.0, 5.5, 7.5, 10, 14, 18, 24, 30, 36, 42, 47, 51, 54, 56, 57.5, S_END];
const PLAN_D = [0.9, 2.3, 3.4, 4.3, 5.2, 6.4, 7.9, 9.9, 11.4, 12.6, 12.6, 11.6, 9.4, 7.0, 5.2, 4.1, 3.75, 3.6, 3.55];
const PLAN_V = [-1.2, -2.7, -3.9, -4.9, -5.9, -7.1, -8.6, -10.6, -12.1, -13.2, -13.0, -11.8, -9.5, -7.0, -5.2, -4.1, -3.75, -3.6, -3.55];
const _xd = monotone(PLAN_S, PLAN_D);
const _xv = monotone(PLAN_S, PLAN_V);

// ------------------------------------------------------------------------------------------ eyes, mouth
// Eye_UpperSide_1 = lower (right) eye, Eye_UpperSide_2 = upper (migrated left) eye on the dorsal profile,
// a little behind the lower one; a narrow bony ridge between them. Gaze axes point up and outwards.
export const EYES = [
  { name: 'Eye_UpperSide_1', bone: 'J_eye1', s: 5.5, x: 1.35, r: 1.55, turret: 1.3, lift: -0.12, gaze: [-0.38, 0.86, 0.34] },
  { name: 'Eye_UpperSide_2', bone: 'J_eye2', s: 6.9, x: 4.95, r: 1.55, turret: 1.2, lift: -0.1, gaze: [0.42, 0.85, 0.3] },
];
// The mouth (photographs 29, 37, 43, 48, 49, 52, 60, 62, 65, 70): small and terminal, at the very tip of the
// head a little ventral of the axis. Thick fleshy lips stand out in front of the head's outline as a short pout,
// the dorsal profile drawn in just behind the upper lip; the lower jaw reaches a little further forward than the
// upper and ends in a small chin knob. The cleft runs back and slightly ventrally (≈ 20°) to the corner, which
// lies under the front edge of the lower eye; the jaws of the blind side are the longer ones (pleuronectine
// asymmetry), so the corner sits further back there. Opened, the lower jaw drops ventrally and a little towards
// the blind side; the mouth is pale flesh inside.
export const MOUTH = {
  tipX: -0.55,                    // x of the cleft where the lips meet in front
  front: 0.25,                    // s where the lips turn round the front of the snout
  upperTip: -0.3,                 // s of the upper lip's front
  lowerTip: -0.48,                // s of the lower jaw's front (slightly ahead: a little prognathous)
  cornerTop: { s: 3.7, x: -1.95 },
  cornerBot: { s: 4.4, x: -2.35 },
  joint: { s: 5.0, x: -2.6 },     // articulation of the lower jaw (pivot of J_jaw)
  premax: { s: 0.6, x: 0.2 },     // upper jaw (protrusion)
  lip: { upper: 0.27, lower: 0.31, corner: 0.12, chin: 0.08 },  // lip radii (mm)
};
export function cleftX(s, side) {
  const c = side > 0 ? MOUTH.cornerTop : MOUTH.cornerBot;
  const t = clamp(s / c.s, 0, 1.4);
  // slightly convex: the cleft drops faster near the corner
  return MOUTH.tipX + (c.x - MOUTH.tipX) * (0.75 * t + 0.25 * t * t);
}
export function cornerS(side) { return side > 0 ? MOUTH.cornerTop.s : MOUTH.cornerBot.s; }

export function dorsalEdge(s) {
  // the upper eye bulges over the dorsal profile, with a shallow notch in front of it
  const e = EYES[1];
  // the snout is drawn in just behind the upper lip, and a little again before the upper eye
  return _xd(s) + 0.75 * Math.exp(-(((s - e.s) / 1.9) ** 2)) - 0.36 * Math.exp(-(((s - 1.5) / 0.9) ** 2)) - 0.2 * Math.exp(-(((s - 3.8) / 1.0) ** 2));
}
export function ventralEdge(s) { return _xv(s); }

// ------------------------------------------------------------------------------------------ thickness
// half-thickness of the eyed (top) and blind (bottom) sides along the axis; the eyed side is more domed,
// the blind side flatter. A 70 mm juvenile is about 5 mm thick at the head.
const TH_S = [0, 1.5, 4, 7, 10, 14, 18, 24, 30, 36, 42, 48, 52, 55, 57.5, S_END];
const TH_T = [0.45, 1.15, 1.85, 2.3, 2.6, 2.7, 2.6, 2.35, 2.1, 1.75, 1.4, 1.05, 0.85, 0.75, 0.62, 0.12];
const TH_B = [0.45, 0.95, 1.45, 1.8, 2.0, 2.1, 2.0, 1.75, 1.5, 1.25, 1.0, 0.8, 0.66, 0.58, 0.5, 0.1];
export const thickTop = monotone(TH_S, TH_T);
export const thickBot = monotone(TH_S, TH_B);

// gill cover (operculum): elliptical plate; its free margin is where the gill opening is
export const OPERC = { s: 9.3, x: -0.6, rs: 5.2, rx: 7.6 };
export function opercE(s, x) { return ((s - OPERC.s) / OPERC.rs) ** 2 + ((x - OPERC.x) / OPERC.rx) ** 2; }
// lateral line: almost straight, with a low arch over the pectoral fin
export function lateralLineX(s) { return 0.15 + 1.25 * Math.exp(-(((s - 18) / 6.5) ** 2)); }

/** Surface height (mm, outward) at (s, x) on the eyed (side = +1) or blind (side = -1) side, before the
 *  section profile is applied: the features of the head on top of the smooth lens-shaped section. */
export function surfaceFeatures(s, x, side) {
  let h = 0;
  if (side > 0) {
    // eye turrets: raised orbits; a collar of skin holds each eyeball just below its equator
    for (const e of EYES) {
      const d = Math.hypot(s - e.s, x - e.x);
      h += e.turret * (1 - smoothstep(0.9 * e.r, 2.05 * e.r, d));
    }
    // narrow interorbital ridge
    const [a, b] = EYES;
    const ex = b.s - a.s, ez = b.x - a.x, L2 = ex * ex + ez * ez;
    const t = clamp(((s - a.s) * ex + (x - a.x) * ez) / L2, 0, 1);
    const dr = Math.hypot(s - (a.s + ex * t), x - (a.x + ez * t));
    h += 0.35 * Math.exp(-((dr / 0.55) ** 2)) * smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.75, t);
    // snout: slightly hollow in front of the eyes
    h -= 0.25 * Math.exp(-(((s - 2.8) / 1.4) ** 2) - (((x - 1.5) / 2.0) ** 2));
  }
  // mouth: the jaws a little swollen along the cleft (the lips themselves are their own geometry)
  const c = cornerS(side);
  const inMouth = 1 - smoothstep(c - 0.4, c + 0.8, s);
  if (inMouth > 0) {
    const dx = x - cleftX(s, side);
    h += inMouth * (0.12 * Math.exp(-((dx / 1.1) ** 2)) - 0.06 * Math.exp(-((dx / 0.15) ** 2)));
  }
  // gill cover: a thin raised plate whose margin steps down to the body
  const e = opercE(s, x);
  h += 0.11 * (1 - smoothstep(0.82, 1.02, e)) * smoothstep(2.0, 5.0, s);
  // abdomen: the viscera bulge a little on both sides behind the head, more on the blind side
  h += (side > 0 ? 0.12 : 0.25) * Math.exp(-(((s - 15) / 5.5) ** 2) - (((x + 5) / 4.5) ** 2));
  return h;
}

/** Normalised section profile across the body (|u| = 1 at the margins): lens with thin fin-base zones. */
export function sectionProfile(u, side) {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  const k = side > 0 ? 0.66 : 0.42;
  return Math.pow(1 - a * a, k) * (1 - 0.3 * smoothstep(0.6, 1.0, a));
}

/** Outer surface height (mm, signed: + eyed side up, − blind side down) at (s, x). */
export function surfaceY(s, x, side) {
  const xd = dorsalEdge(s), xv = ventralEdge(s);
  const xc = 0.5 * (xd + xv), hw = 0.5 * (xd - xv);
  const u = clamp((x - xc) / hw, -1, 1);
  const T = side > 0 ? thickTop(s) : thickBot(s);
  const fade = 1 - smoothstep(0.86, 1.0, Math.abs(u));
  return side * (T * sectionProfile(u, side) + surfaceFeatures(s, x, side) * fade);
}

/** Centre of an eyeball in the fish frame (mm): on its turret, slightly above the skin collar. */
export function eyeCentre(e) {
  return [e.s, e.x, surfaceY(e.s, e.x, 1) + e.lift];
}

// ------------------------------------------------------------------------------------------ fins
// u runs along the fin base (front → back), the fin height is the ray length. Ray counts follow the
// species (D 63–74, A 46–52, C 18, P 10, V 6); rays are drawn in the fin texture.
export const FINS = {
  dorsal: {
    s0: 6.6, s1: 55.6, rays: 68,
    // ray length (mm) along the base
    height: monotone([0, 0.08, 0.3, 0.55, 0.72, 0.88, 1], [1.4, 2.6, 4.9, 6.4, 6.3, 4.6, 2.6]),
    sweep: monotone([0, 0.5, 1], [0.32, 0.42, 0.62]),  // backward inclination of the rays (rad from the normal)
    bones: 14,
  },
  anal: {
    s0: 17.6, s1: 55.6, rays: 50,
    height: monotone([0, 0.07, 0.3, 0.5, 0.7, 0.88, 1], [1.6, 3.3, 5.6, 6.5, 6.0, 4.3, 2.5]),
    sweep: monotone([0, 0.5, 1], [0.2, 0.38, 0.6]),
    bones: 10,
  },
  caudal: {
    // rounded: central rays longest
    s: SL_MM - 0.5, x0: -3.45, x1: 3.45, rays: 18, len: 12.5, spread: 0.72,
  },
  pectoralEyed: { s: 15.6, x: 0.9, len: 6.6, width: 1.7, rays: 10 },
  pectoralBlind: { s: 15.4, x: 0.5, len: 4.6, width: 1.2, rays: 9 },
  pelvic: { s: 11.6, len: 3.4, rays: 6 },
};

// ------------------------------------------------------------------------------------------ skeleton
// bones on the vertebral axis; J_root is fixed to the model root, J_head and J_sp1 hang from it
export const SPINE = [
  ['J_head', 9.0], ['J_root', 17.0], ['J_sp1', 22.5], ['J_sp2', 28.0], ['J_sp3', 33.5], ['J_sp4', 39.0],
  ['J_sp5', 44.5], ['J_sp6', 50.0], ['J_caudal', 55.5], ['J_caudal2', 62.5],
];
export const SPINE_S = Object.fromEntries(SPINE);
export const POSTERIOR = SPINE.slice(2).map((b) => b[0]); // J_sp1 … J_caudal2 (chain)

/** Spine bone weights for a point at s (two bones, smooth blend; the head is rigid in front of J_head). */
export function spineWeights(s) {
  if (s <= HEAD_END + 0.5) {
    // the skull is rigid; it blends into the trunk between the head joint and the gill cover
    const t = smoothstep(SPINE[0][1] + 1.5, HEAD_END + 0.5, s);
    return t > 0 ? [['J_head', 1 - t], ['J_root', t]] : [['J_head', 1]];
  }
  for (let i = 1; i < SPINE.length - 1; i++) {
    const [a, sa] = SPINE[i], [b, sb] = SPINE[i + 1];
    if (s <= sb) {
      const t = smoothstep(sa, sb, s);
      return [[a, 1 - t], [b, t]];
    }
  }
  return [[SPINE[SPINE.length - 1][0], 1]];
}

/** mm in the fish frame → metres in the model frame (+X dorsal, +Y eyed side, +Z snout). */
export function toModel(s, x, y, out = [0, 0, 0]) {
  out[0] = x * 0.001; out[1] = y * 0.001; out[2] = (S_ROOT - s) * 0.001;
  return out;
}

/** Packed profile for shaders: 256 samples over [0, S_END] of (xd, xv, top, bottom) in mm. */
export function profileTable(n = 256) {
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * S_END;
    data[i * 4] = dorsalEdge(s);
    data[i * 4 + 1] = ventralEdge(s);
    data[i * 4 + 2] = thickTop(s);
    data[i * 4 + 3] = thickBot(s);
  }
  return data;
}
