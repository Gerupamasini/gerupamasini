// The whole トビハゼ as one signed-distance sculpt, in head lengths (HL) of the fish frame (anatomy.mjs): the head of
// head.mjs (accepted against the photos first, then left alone), a trunk loft behind it from the measured body
// proportions, the muscular pectoral lobes in their bind pose, the fleshy pelvic base and the low ridges the median fins
// stand on. The fins' membranes, the eyes and the rig are separate (fins.mjs, eye.mjs, rig.mjs).
//
// Proportions (research: measurements §1, body_fins_colour §1, §2, §6): TL 4.96 HL, SL 4.17 HL; body depth 0.69 HL at
// the pectoral base (0.165 SL, relaxed), deepest at 0.25-0.40 TL; caudal peduncle 0.31 HL deep at its narrowest; the
// back nearly level from the nape to the second dorsal fin, the belly fullest between the pectorals and the vent and
// sagging a little below the head's flat floor; round to egg-shaped in front, compressed behind.
import { HEAD } from './anatomy.mjs';
import { HEAD_SCULPT, headSDF, loftTables, loftSDF } from './head.mjs';
import { smin, smax, clamp, smoothstep, ellipsoid, tube, smoothPath } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** Every tunable of the body (HL units, fish frame). */
export const BODY_SCULPT = {
  // the trunk loft: it starts inside the head behind the opercle with the head loft's own section there (w and nL at
  // s 1.05–1.30 as head.mjs's loft has them, yW and nU close to it, so the head's morph into the trunk adds no waist), and
  // runs to the caudal base (SL = 4.17 HL); same columns as the head loft. Seen from above the body behind the gill
  // margin is 0.92 W at 1.3 HL (B047) and tapers from there without a step (0.87 W at 1.5, 0.81 W at 1.75: A036,
  // measurements.md §4.2)
  trunk: {
    s:  [1.05, 1.15, 1.30, 1.50, 1.75, 2.00, 2.25, 2.50, 2.80, 3.10, 3.40, 3.70, 3.95, 4.10, 4.20],
    w:  [0.320, 0.322, 0.321, 0.305, 0.283, 0.255, 0.235, 0.218, 0.200, 0.172, 0.145, 0.114, 0.088, 0.074, 0.068],
    yT: [0.623, 0.626, 0.628, 0.630, 0.630, 0.628, 0.622, 0.605, 0.580, 0.550, 0.515, 0.475, 0.445, 0.438, 0.435],
    yB: [-0.042, -0.050, -0.062, -0.070, -0.070, -0.062, -0.050, -0.032, -0.005, 0.030, 0.065, 0.100, 0.130, 0.135, 0.135],
    yW: [0.235, 0.236, 0.232, 0.218, 0.210, 0.212, 0.216, 0.222, 0.235, 0.250, 0.265, 0.278, 0.288, 0.288, 0.285],
    nU: [2.10, 1.95, 1.95, 2.00, 2.05, 2.05, 2.05, 2.00, 2.00, 2.00, 2.00, 2.00, 2.00, 2.00, 2.00],
    nL: [2.60, 2.50, 2.40, 2.30, 2.20, 2.15, 2.10, 2.10, 2.05, 2.00, 2.00, 2.00, 2.00, 2.00, 2.00],
  },
  // behind the opercle the head's field morphs into the trunk's over this range (the head's own features end at the
  // opercle; a cut and a union would leave a ring where the two sections differ)
  join: { from: 1.05, to: 1.32 },
  // the head's flat floor, faded out behind the gill opening so the belly can sag below it
  floor: { y: -0.010, blend: 0.04, fadeFrom: 1.0, fadeTo: 1.6, fadeDepth: 0.25 },
  // the pectoral lobe (left; the right is the mirror image) in its bind pose, half way between folded back along the
  // flank and planted as a leg: shoulder on the flank low behind the opercle, elbow, wrist; a flattened tapered limb
  pectoral: {
    shoulder: [1.12, 0.27, 0.26],
    elbow: [1.26, 0.12, 0.335],
    wrist: [1.39, -0.01, 0.37],
    // half-width across the limb at shoulder / elbow / wrist, thickness as a fraction of it
    radius: [0.088, 0.076, 0.064],
    flat: 0.56,
    // the fleshy root where the lobe leaves the flank
    root: { c: [1.11, 0.26, 0.21], r: [0.12, 0.12, 0.10] },
    blend: 0.05,
  },
  // the pelvic fins' fleshy base on the ventral midline under the chest
  pelvicBase: { c: [1.08, -0.035, 0.0], r: [0.10, 0.04, 0.07], blend: 0.03 },
  // the low ridges the median fins stand on (a fin's base line runs along the crest of its ridge)
  keels: {
    d1: { s: [1.48, 2.23], radius: 0.022, inset: 0.012 },
    d2: { s: [2.40, 3.70], radius: 0.020, inset: 0.012 },
    anal: { s: [2.62, 3.72], radius: 0.018, inset: 0.010 },
    blend: 0.03,
  },
  // the caudal peduncle's end: the fin's rays fan out from here
  caudalBase: 4.17,
  // the peduncle's rounded end just behind the caudal base
  tailEnd: { s: 4.21, blend: 0.035 },
};

/** The trunk loft's sampled tables (for fin placement and the rig: top, bottom, half-width per station). */
export function trunkProfile(K = BODY_SCULPT) {
  const T = loftTables(K.trunk, 4096);
  const at = (s) => {
    const sc = clamp(s, T.s0, T.sMax), f = (sc / T.sMax) * T.n, i = Math.min(T.n - 1, Math.floor(f)), t = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    return { w: L(T.w), yT: L(T.yT), yB: L(T.yB), yW: L(T.yW), nU: L(T.nU), nL: L(T.nL), yc: (L(T.yT) + L(T.yB)) / 2 };
  };
  return { T, at };
}

/** Distance to a flattened tapered limb from a to b (radii ra, rb across; `flat` × that through its thickness). */
function flatLimb(a, b, ra, rb, flat, faceN) {
  const ax = sub(b, a), L = Math.hypot(...ax), u = mul(ax, 1 / L);
  // thickness axis: the face normal made perpendicular to the limb; width axis across the limb
  let n = sub(faceN, mul(u, dot(faceN, u)));
  n = nrm(n);
  const wv = cross(n, u);
  return (x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]];
    const t = clamp(dot(p, u) / L, 0, 1);
    const q = sub(p, mul(u, t * L));
    const r = ra + (rb - ra) * t;
    // (past either end q keeps its axial part: the ends are rounded caps)
    const qa = dot(q, u), qw = dot(q, wv), qn = dot(q, n) / flat;
    return (Math.hypot(qa, qw, qn) - r) * Math.min(1, flat * 1.4);
  };
}

/** The whole fish's distance function in HL units (s, y, z). */
export function fishSDF(K = BODY_SCULPT, H = HEAD_SCULPT) {
  const head = headSDF({ ...H, floorY: -10 }, { cut: false });
  const trunk = loftSDF(loftTables(K.trunk, 4096));
  const P = K.pectoral;
  const faceN = [0, 0, 1];
  const lobeA = flatLimb(P.shoulder, P.elbow, P.radius[0], P.radius[1], P.flat, faceN);
  const lobeB = flatLimb(P.elbow, P.wrist, P.radius[1], P.radius[2], P.flat, faceN);
  const root = ellipsoid(P.root.c, P.root.r);
  const pelvic = ellipsoid(K.pelvicBase.c, K.pelvicBase.r);
  const prof = trunkProfile(K);
  const keel = (spec, top) => {
    const pts = [], radii = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const s = spec.s[0] + ((spec.s[1] - spec.s[0]) * i) / n, q = prof.at(s);
      pts.push([s, top ? q.yT - spec.inset : q.yB + spec.inset, 0]);
      // tapered at both ends
      radii.push(spec.radius * (0.35 + 0.65 * Math.sin((Math.PI * i) / n)));
    }
    return tube(pts, radii);
  };
  const kD1 = keel(K.keels.d1, true), kD2 = keel(K.keels.d2, true), kA = keel(K.keels.anal, false);
  const F = K.floor;
  return (x, y, z) => {
    const za = Math.abs(z);
    const wj = smoothstep(K.join.from, K.join.to, x);
    const dt = smax(trunk(x, y, z), x - K.tailEnd.s, K.tailEnd.blend);
    let d = wj <= 0 ? head(x, y, z) : wj >= 1 ? dt : head(x, y, z) * (1 - wj) + dt * wj;
    // the head's flat floor (as head.mjs applies it), fading out behind the gill opening
    const fade = smoothstep(F.fadeFrom, F.fadeTo, x) * F.fadeDepth;
    d = smax(d, F.y - fade - y, F.blend);
    d = smin(d, Math.min(kD1(x, y, z), kD2(x, y, z), kA(x, y, z)), K.keels.blend);
    d = smin(d, pelvic(x, y, z), K.pelvicBase.blend);
    d = smin(d, smin(root(x, y, za), Math.min(lobeA(x, y, za), lobeB(x, y, za)), 0.02), P.blend);
    return d;
  };
}

/** The whole fish's distance in mm (fish frame) for a head length of HLmm. */
export function fishSDFmm(HLmm, K = BODY_SCULPT, H = HEAD_SCULPT) {
  const f = fishSDF(K, H), k = 1 / HLmm;
  return (x, y, z) => f(x * k, y * k, z * k) * HLmm;
}

/** Landmarks for the fins and the rig (HL, fish frame; left side where sided). */
export function bodyLandmarks(K = BODY_SCULPT) {
  const prof = trunkProfile(K);
  return { prof, pectoral: K.pectoral, pelvicBase: K.pelvicBase, keels: K.keels, caudalBase: K.caudalBase, eye: HEAD.eye };
}
