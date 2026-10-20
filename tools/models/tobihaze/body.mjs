// The whole トビハゼ as one signed-distance sculpt, in head lengths (HL) of the fish frame (anatomy.mjs): the head of
// head.mjs (accepted against the photos first, then left alone: in front of s 0.95 the fish's field is the head's own,
// to 1e-6 HL), a trunk loft behind it from the measured body proportions, the muscular pectoral arms in their bind
// pose, the fleshy pelvic base, the low ridges the median fins stand on, the anus and the urogenital papilla, and the
// peduncle's compressed end the caudal fin grows out of. The fins' membranes, the eyes and the rig are separate
// (fins.mjs, eye.mjs, rig.mjs).
//
// Proportions (TL 4.96 HL, SL 4.17 HL; research: measurements §1, body_fins_colour §1–2, §6, behaviour §1.1, §5).
// Round B2 settled the trunk's depth against the head by overlaying the whole fish's lateral outline on A030, A002 and
// A070 matched at the snout tip and the caudal base, with the head as the scale check (scratchpad ref/work/b2_trunk:
// in A030, the cleanest relaxed lateral, the model's head lies within 0.005 TL of the photo's, so the trunk's numbers
// there are absolute; A002's head reads 25 % deeper than the model's at that matching, its head turned to the camera,
// and A070's throat is inflated, so those two are compared head-scaled / by the back's line only): the trunk is as deep
// as the head (body depth at the pectoral base / head depth 1.04 with the pelvic swelling, 1.03 without; A030 0.96,
// A070 0.96, B067 0.97, Itoh: depth and width greatest at the head), the belly on the head's floor line (A030: chin and
// belly on the same mud, B067 within 0.03 HL) so that seen from the front the trunk stays inside the head's outline
// (B002, u5) but for the pelvic base's thin swelling; the deepest point 0.129 TL at 0.35 TL, the taper from 0.38 TL
// (0.96 of it at 0.45, 0.78 at 0.60 TL); the back level from the nape (rising ≤ 0.01 HL) past the D1's middle and
// 0.012 HL under the nape at its end, then dropping with the photos; per-station depth within 0.0085 TL of A030
// (0.30–0.80 TL; the photo's bottom read as the mean of its lit edge and its contact line, ± 0.005–0.013 TL apart);
// the tail compressed (W/D ≈ 0.6) and holding its depth (0.306 HL, CPD 0.073 SL) to a flat hypural end plate; widths
// as A036 seen from above (0.12 TL at 0.30, 0.083 at 0.54, 0.046 at 0.76). Round to egg-shaped in front, compressed
// behind, with no step.
import { HEAD } from './anatomy.mjs';
import { HEAD_SCULPT, headSDF, loftTables, loftSDF } from './head.mjs';
import { smin, smax, ssub, clamp, smoothstep, ellipsoid, sphere, capsule, tube } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const deg = Math.PI / 180;

/** The pectoral arm's joints (left side, HL) from its bind-pose angles: the shoulder, then the upper arm `upper.len`
 * long at `upper.down` degrees below the horizontal (seen from the side) and `upper.out` degrees out from the flank,
 * then the forearm `fore.len` long, bent `fore.bend` degrees forward at the elbow in the plane of the arm's broad face. */
export function armJoints(A) {
  const t = A.upper.down * deg, p = A.upper.out * deg;
  const u1 = [Math.cos(p) * Math.cos(t), -Math.cos(p) * Math.sin(t), Math.sin(p)];
  // the broad face's normal: the lateral axis made perpendicular to the arm (the face lies on the flank when the arm
  // is folded back and faces out when it is planted); w1 runs across the arm toward its dorsal (leading) edge
  const n = nrm(sub([0, 0, 1], mul(u1, u1[2])));
  const w1 = cross(n, u1);
  const b = A.fore.bend * deg;
  const u2 = add(mul(u1, Math.cos(b)), mul(w1, -Math.sin(b)));
  const shoulder = A.shoulder, elbow = add(shoulder, mul(u1, A.upper.len)), wrist = add(elbow, mul(u2, A.fore.len));
  const r3 = (v) => v.map((c) => Math.round(c * 1e4) / 1e4);
  return { shoulder: r3(shoulder), elbow: r3(elbow), wrist: r3(wrist), u1, u2, n, w1 };
}

/** The bind pose of the left arm (the right is the mirror image), the pectoral system of round B2 (the three owners'
 * shared design): a slim flattened two-segment leg, shoulder → wrist 0.45 HL (upper arm over the radials 0.28, forearm
 * 0.17), widening into a spatulate wrist as wide as the blade's base; with the inner 0.16 HL of the blade continuing
 * the forearm it reaches 9.3–9.7 mm below the shoulder in a leg posture (upper arm 10–25° behind vertical, forearm
 * 10–20° ahead of it), the ≈ 9.5 mm a 15° prop needs (A070). The bind is half way between folded back along the flank
 * (A030, B067) and planted (u1, B010, A005; Pace & Gibb 2009 radial–ray angle 76°→178°): the upper arm 52° below the
 * horizontal and 26° out, the elbow bent 26° forward. The shoulder pivot sits on the flank's skin (z 0.33; B1's 0.35
 * stood 0.03 outside it): turned rigidly as the rig turns it (scratchpad b2_trunk armpose.mjs), the arm folds back
 * with its medial face flush on the flank (within −0.013 … +0.011 HL from 0.13 HL past the pivot: upper arm level,
 * 6° out, the elbow straightened and the forearm bent 20° in) and paddles out and forward (protraction 20–40°,
 * abduction 20–40°, swing 20–45°) without driving the arm past its root into the body wall; the arm stands off the
 * flank past its root (so the weights can part them), and its reach stays inside fishmesh's BODY_BOX (|z| ≤ 0.51). */
const ARM = {
  shoulder: [1.14, 0.285, 0.33],      // the girdle's hinge at the flank (pre-P1 1.08–1.15 HL; 45–60 % of the depth down)
  upper: { len: 0.28, down: 52, out: 26 },   // the four proximal radials 0.25–0.29 HL (OST §3.8; u1's upper arm ~0.3)
  fore: { len: 0.17, bend: 26 },             // the ray bases' fleshy pad to the wrist: shoulder → wrist 0.45 HL (B010 0.47)
};
const ARMJ = armJoints(ARM);

/** Every tunable of the body (HL units, fish frame). */
export const BODY_SCULPT = {
  // the trunk loft: it starts inside the head behind the opercle with the head loft's own section there (w and nL at
  // s 1.05–1.30 as head.mjs's loft has them, yW and nU close to it, so the head's morph into the trunk adds no waist), and
  // runs past the caudal base into the peduncle's end plate; same columns as the head loft. Seen from above the body
  // behind the gill margin is 0.92 W at 1.3 HL (B047) and tapers from there without a step (0.87 W at 1.5, 0.81 W at
  // 1.75: A036, measurements.md §4.2). The belly (yB) runs on the head's floor line (−0.010 … −0.016, the lower
  // section a little fuller, nL 2.35–2.45, so the belly rests broad on the mud as A030's and B067's do) to the vent,
  // then rises; the back (yT) is level to the D1's middle and drops from its end with the three photos (A030, A002,
  // A070 all 0.05 HL lower at 0.45 TL than at the nape), the tail's mid-line sinking to 0.233 HL at the caudal base.
  // The sections flatten a little toward the tail (nU, nL 2.15–2.2: flanks broad enough for the wet band of light
  // behind the anus, body_fins_colour §1.2). The peduncle holds its depth (0.306 HL) from 4.10 to its end plate and its
  // half-width tapers over the last 0.2 HL, W/D 0.58 at 4.10 and 0.50 at the caudal base (body_fins_colour §1.2, §6.1:
  // 0.55–0.65; A036), to 0.015 HL (0.24 mm) at the plate (tailEnd), whose edge the caudal rays spring from
  trunk: {
    s:  [1.05, 1.15, 1.30, 1.50, 1.75, 2.00, 2.25, 2.50, 2.80, 3.10, 3.40, 3.70, 3.95, 4.04, 4.10, 4.15, 4.17, 4.20, 4.22, 4.24, 4.30],
    w:  [0.320, 0.322, 0.321, 0.305, 0.283, 0.256, 0.236, 0.218, 0.198, 0.172, 0.146, 0.121, 0.100, 0.090, 0.0896, 0.0838, 0.0768, 0.0597, 0.0415, 0.015, 0.004],
    yT: [0.623, 0.626, 0.628, 0.630, 0.630, 0.626, 0.610, 0.562, 0.522, 0.485, 0.447, 0.413, 0.394, 0.390, 0.388, 0.386, 0.386, 0.386, 0.386, 0.386, 0.386],
    yB: [-0.010, -0.010, -0.011, -0.014, -0.016, -0.015, -0.010, 0.006, 0.020, 0.036, 0.052, 0.065, 0.074, 0.077, 0.078, 0.079, 0.079, 0.080, 0.080, 0.080, 0.080],
    yW: [0.235, 0.236, 0.232, 0.218, 0.210, 0.210, 0.212, 0.215, 0.220, 0.226, 0.232, 0.234, 0.234, 0.234, 0.233, 0.233, 0.233, 0.233, 0.233, 0.233, 0.233],
    nU: [2.10, 1.95, 1.95, 2.00, 2.05, 2.05, 2.05, 2.05, 2.10, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
    nL: [2.60, 2.50, 2.45, 2.40, 2.35, 2.30, 2.20, 2.15, 2.15, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
  },
  // behind the opercle the head's field morphs into the trunk's over this range (the head's own features end at the
  // opercle; a cut and a union would leave a ring where the two sections differ)
  join: { from: 1.05, to: 1.32 },
  // the head's flat floor, faded out behind the gill opening by `fadeDepth` only (0.01: the throat and the chest stay on
  // the head's floor line, where the head loft's own underside would hang 0.02–0.035 HL lower in the join)
  // (y, blend: the head's floorY and blend.floor unless given)
  floor: { fadeFrom: 1.0, fadeTo: 1.55, fadeDepth: 0.01 },
  // the pectoral arm (left; the right is the mirror image) in its bind pose (ARM above: shoulder, elbow, wrist), a
  // muscular flattened limb (Itoh 1999: the base "thick and strong"; Murdy: "a muscular, arm-like base"): the root
  // fanning onto the flank just behind the gill slit, the upper arm over the four elongate radials (a flattened oval,
  // fullest a third of the way down: the abductor and adductor bellies), the elbow (the radial–ray joint's fibrocartilage
  // pad) and the forearm, the fleshy pad over the ray bases, flattening to the wrist where the blade starts
  pectoral: {
    shoulder: ARMJ.shoulder,
    elbow: ARMJ.elbow,
    wrist: ARMJ.wrist,
    // half-width across the limb at shoulder / elbow / wrist: a slim leg (u1: the arm ~0.13 HL wide) narrowest at the
    // elbow, widening along the forearm into the spatulate wrist as wide as the blade's base (B010, A042: the fleshy lobe
    // flattens over the proximal rays, no knob and no neck where the fan starts)
    radius: [0.068, 0.058, 0.078],
    // thickness through the limb as a fraction of its width (flat; fl: at the shoulder, the elbow and the wrist: the upper
    // arm ~0.08 HL thick, the forearm flattening to a 0.047 HL paddle at the wrist, where the blade's ray bases spread)
    flat: 0.60,
    fl: [0.60, 0.56, 0.30],
    // the upper arm's muscle belly: extra half-width `amp` at `at` (share of the upper arm), `w` wide
    belly: { amp: 0.006, at: 0.35, w: 0.30 },
    // the elbow's knuckle (optional { off, r, blend }: an ellipsoid on the outside of the bend; off: a small pad there made
    // non-manifold edges at the far tier's 0.40 mm cell, and the two segments' union already rounds the elbow), and the
    // wrist's end rounding (the cap's radius along the arm as a share of the end's thickness: 0.35, a flat paddle's edge
    // the rays spring from, not a hemispherical knob)
    knuckle: null,
    capWrist: 0.35,
    capElbow: 0.45,
    elbowBlend: 0.04,
    // the fleshy root on the flank where the arm leaves it: a low ellipsoid pad (centre c, radii along s, y and z) the
    // arm's muscles fan into, butting against the gill margin behind the slit's pocket (gate: the pocket's gap the head's
    // own; B010, B067, u1: only the axilla's crease between them) and below the nape
    root: { c: [1.13, 0.245, 0.285], r: [0.085, 0.13, 0.055] },
    blend: 0.025,
    // the axes of the bind pose (for the rig and the charts): u1 along the upper arm, u2 along the forearm, n the broad
    // face's normal, w1 across the upper arm toward its leading edge
    axes: { u1: ARMJ.u1, u2: ARMJ.u2, n: ARMJ.n, w1: ARMJ.w1 },
    bind: ARM,
  },
  // the pelvic fins' fleshy base on the ventral midline under the chest (prepelvic 26.7–29.1 % SL = 1.11–1.21 HL: Lee
  // 1995, Itoh 1999), just behind the head's flat throat: c is where fins.mjs anchors the pelvic fins (their ray bases
  // c − 0.045 … c − 0.020) and the rig its J_pelvic; the swelling itself is centred `shift` from c, over the ray bases
  // (1.1375), a long low mound 0.011 HL under the head's floor line (the ventral midline's slope ≤ 9.5° from s 1.0 to
  // 1.3: no knob, no front step), the only part of the trunk that shows under the head from the front
  pelvicBase: { c: [1.17, 0.010, 0.0], r: [0.11, 0.022, 0.06], blend: 0.04, shift: -0.0325 },
  // the low ridges the median fins stand on (a fin's base line runs along the crest of its ridge), at the literature's
  // positions (behaviour §1.2, §5 C3): D1 from the predorsal 0.30 TL to 0.455 TL (base 0.155 TL; Murdy 0.18, A070
  // 0.17), D2 from 0.49 to 0.72 TL (pre-D2 59.2 % SL, Itoh; base 0.23 TL between Murdy's 0.19 and the photos' 0.25–0.28),
  // anal from 0.52 TL (preanal 62 % SL) to 0.705 TL, opposite D2 and ending a little before it (base 0.185 TL; Murdy 0.166).
  // The D1 stands in a shallow groove instead of on a ridge (body_fins_colour §2.3: it "folds into a groove"): its keel
  // sunk under the skin and a furrow `groove.depth` deep along its base (0.005–0.006 HL below the lips at mid-fin),
  // faded out at both ends
  keels: {
    d1: { s: [1.48, 2.255], radius: 0.015, inset: 0.020, groove: { depth: 0.007, r: 0.02 } },
    d2: { s: [2.43, 3.57], radius: 0.020, inset: 0.012 },
    anal: { s: [2.58, 3.50], radius: 0.018, inset: 0.010 },
    blend: 0.03,
  },
  // the anus (pre-anus 56.7 % SL, Itoh 1999: 0.477 TL) a small pit on the ventral midline, and the urogenital papilla
  // just behind it in front of the anal fin: a short cone pointing back and a little down, lying flat (pointed in males,
  // truncate in females: Lee 1995; one shared model, a blunt-tipped cone), slightly compressed; its tip 0.014 HL under
  // the raised belly, level with the head's floor
  anus: { s: 2.365, r: 0.013, k: 0.006 },
  papilla: { s: [2.42, 2.51], sink: 0.010, drop: 0.014, r: [0.024, 0.011], flat: 0.75, blend: 0.012 },
  // the caudal peduncle's end: the fin's rays fan out from here
  caudalBase: 4.17,
  // the peduncle's end plate behind the caudal base (the hypural plate under the fin's base): flat and as deep as the
  // peduncle (0.997 of its depth at 4.23), slightly bowed (the edges at s, mid-depth `bulge` further back), its corners
  // rounded by `blend` only, its half-width 0.015 HL: the caudal rays spring from its edge and the outline runs straight
  // on into the fin (no dome, no stump)
  tailEnd: { s: 4.24, blend: 0.008, bulge: 0.01 },
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

/** A flattened limb segment from a to b: an elliptic section, half-width r(t) across the limb in its broad face's
 * plane and half-thickness r(t)·fl(t) through it (n: the face normal, perpendicular to the axis), r and fl linear from
 * the a end to the b end plus an optional muscle belly; past either end a rounded cap (its radius along the axis
 * cap0 / cap1 × the end's thickness, or the end's half-width when not given). Quilez's ellipsoid bound on the local
 * section. */
function limbSegment(a, b, r0, r1, f0, f1, n, { belly = null, cap0 = null, cap1 = null } = {}) {
  const ax = sub(b, a), L = Math.hypot(...ax), u = mul(ax, 1 / L);
  const nn = nrm(sub(n, mul(u, dot(n, u)))), wv = cross(nn, u);
  const rAt = (t) => r0 + (r1 - r0) * t + (belly ? belly.amp * Math.exp(-(((t - belly.at) / belly.w) ** 2)) : 0);
  return (x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]];
    const ta = dot(p, u) / L, t = clamp(ta, 0, 1);
    const qa = (ta - t) * L, qw = dot(p, wv), qn = dot(p, nn);
    const r = rAt(t), h = r * (f0 + (f1 - f0) * t);
    const ra = qa === 0 ? r : qa < 0 ? (cap0 === null ? r : cap0 * h) : (cap1 === null ? r : cap1 * h);
    const k0 = Math.hypot(qa / ra, qw / r, qn / h), k1 = Math.hypot(qa / (ra * ra), qw / (r * r), qn / (h * h));
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -h;
  };
}

/** An ellipsoid with its axes along the unit vectors e0, e1, e2 (radii r). */
function orientedEllipsoid(c, e, r) {
  return (x, y, z) => {
    const p = [x - c[0], y - c[1], z - c[2]];
    const a = dot(p, e[0]) / r[0], b = dot(p, e[1]) / r[1], d = dot(p, e[2]) / r[2];
    const k0 = Math.hypot(a, b, d), k1 = Math.hypot(a / r[0], b / r[1], d / r[2]);
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(...r);
  };
}

/** A field that returns the distance to its bounding box (a lower bound) when farther than `far`, else `f`. */
function bounded(f, lo, hi, far = 0.12) {
  return (x, y, z) => {
    const bx = Math.max(lo[0] - x, 0, x - hi[0]), by = Math.max(lo[1] - y, 0, y - hi[1]), bz = Math.max(lo[2] - z, 0, z - hi[2]);
    const box = Math.hypot(bx, by, bz);
    return box > far ? box : f(x, y, z);
  };
}

/** The left pectoral arm's field (HL): root, upper arm, knuckle and forearm (z ≥ 0 side; callers pass |z|). */
export function armField(K = BODY_SCULPT) {
  // the arm's frame from its joints (so a caller that moves shoulder, elbow or wrist gets a consistent limb): u1 along
  // the upper arm, the broad face's normal n (the lateral axis made perpendicular to it), w1 across it
  const P = K.pectoral, u1 = nrm(sub(P.elbow, P.shoulder)), n = nrm(sub([0, 0, 1], mul(u1, u1[2]))), A = { u1, n, w1: cross(n, u1) };
  const fl = P.fl ?? [P.flat, P.flat, P.flat];
  // (the upper arm's end cap is short, capElbow × its thickness along the arm, so the elbow does not stand out behind
  // the bend as a bulb; the two segments are joined over `elbowBlend`)
  const upper = limbSegment(P.shoulder, P.elbow, P.radius[0], P.radius[1], fl[0], fl[1], n, { belly: P.belly, cap1: P.capElbow ?? null });
  const fore = limbSegment(P.elbow, P.wrist, P.radius[1], P.radius[2], fl[1], fl[2], n, { cap1: P.capWrist ?? null });
  const KN = P.knuckle, R = P.root;
  const knuckle = KN ? orientedEllipsoid(add(P.elbow, mul(A.w1, KN.off)), [A.u1, A.w1, n], KN.r) : null;
  // (root.at: its centre's distance along the upper arm from the shoulder; root.c: an axis-aligned ellipsoid instead)
  const root = R && R.at !== undefined
    ? orientedEllipsoid(add(add(P.shoulder, mul(A.u1, R.at)), mul(n, R.lift)), [A.u1, A.w1, n], R.r)
    : R ? ellipsoid(R.c, R.r) : null;
  const arm = (x, y, z) => {
    let d = smin(upper(x, y, z), fore(x, y, z), P.elbowBlend ?? 0.02);
    if (knuckle) d = smin(d, knuckle(x, y, z), KN.blend);
    if (root) d = smin(d, root(x, y, z), 0.03);
    return d;
  };
  const pts = [P.shoulder, P.elbow, P.wrist], pad = Math.max(...P.radius) + 0.12;
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])) - pad), hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) + pad);
  return bounded(arm, lo, hi);
}

/** The whole fish's distance function in HL units (s, y, z). H: the head's sculpt (a sealed copy for the coarser
 * tiers). f.head is the head's own field (with .parts and .cup, for the head rig), f.cup its eye cups, and
 * f.parts(x, y, z) the head's parts plus the body's: the fields before and after the pectoral lobes and the pelvic base
 * are united in (the rig's share of each), the lobe's and the pelvic base's own fields, the head–trunk morph weight. */
export function fishSDF(K = BODY_SCULPT, H = HEAD_SCULPT) {
  const head = headSDF({ ...H, floorY: -10 }, { cut: false });
  const trunk = loftSDF(loftTables(K.trunk, 4096));
  const P = K.pectoral;
  const lobe = armField(K);
  // (the swelling's centre `shift` along s from c: c is where the fins and the rig anchor the pelvic fins, the swelling
  // sits over the fins' ray bases, which fins.mjs lays out ahead of c)
  const PBc = K.pelvicBase.c, pelvic = ellipsoid([PBc[0] + (K.pelvicBase.shift ?? 0), PBc[1], PBc[2]], K.pelvicBase.r);
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
  // the shallow groove along the D1's base the folded spines lie in (body_fins_colour §2.3: "folds into a groove"): a
  // tube along the back whose bottom cuts `depth` into the midline, faded in and out at the fin's ends
  const GR = K.keels.d1.groove;
  const groove = GR ? (() => {
    const pts = [], radii = [], n = 12, [s0, s1] = K.keels.d1.s;
    for (let i = 0; i <= n; i++) {
      const s = s0 - 0.02 + ((s1 - s0 + 0.06) * i) / n, a = Math.sin((Math.PI * i) / n) ** 0.5;
      pts.push([s, prof.at(s).yT + GR.r - GR.depth * a, 0]); radii.push(GR.r);
    }
    return tube(pts, radii);
  })() : null;
  // the anus and the urogenital papilla on the ventral midline (their heights from the belly's line there)
  const AN = K.anus, PA = K.papilla;
  const anus = AN ? sphere([AN.s, prof.at(AN.s).yB, 0], AN.r) : null;
  const papilla = PA ? (() => {
    const a = [PA.s[0], prof.at(PA.s[0]).yB + PA.sink, 0], b = [PA.s[1], prof.at(PA.s[1]).yB - PA.drop, 0];
    const c = capsule(a, b, PA.r[0], PA.r[1]), k = PA.flat;
    // compressed: the cone's section narrower across (z) than tall
    return bounded((x, y, z) => c(x, y, z / k) * k, [a[0] - 0.05, b[1] - 0.05, -0.05], [b[0] + 0.05, a[1] + 0.05, 0.05], 0.06);
  })() : null;
  // the head's own flat floor (height and rounding as head.mjs applies it, so in front of the gill opening the fish is
  // the head exactly), faded out behind the gill opening
  const F = K.floor, FY = F.y ?? H.floorY, FB = F.blend ?? H.blend.floor;
  // the peduncle's end: a plane at tailEnd.s, bowed back by `bulge` at the section's mid-depth
  const TE = K.tailEnd, endP = prof.at(TE.s), endH = Math.max(1e-3, (endP.yT - endP.yB) / 2);
  const tailCut = (x, y) => x - (TE.s + (TE.bulge ?? 0) * (1 - Math.min(1, ((y - endP.yc) / endH) ** 2)));
  // the head–trunk morph's weight: C2 (6t⁵ − 15t⁴ + 10t³), so the blend adds no curvature step at either end of the
  // join (smoothstep's second derivative jumps by 6/(to − from)² there, a ring in the highlights wherever the head's and
  // the trunk's fields differ: round B1's section test put the belly's r'' at the join's end at 4.7 with it, 4.1 now,
  // one bend and no ripple)
  const joinW = (x) => { const t = clamp((x - K.join.from) / (K.join.to - K.join.from), 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };
  // the field in its stages: the head morphed into the trunk with the floor and the keels, then the pelvic base, then
  // the pectoral lobes (left and right by |z|)
  const core = (x, y, z) => {
    const wj = joinW(x);
    const dt = wj > 0 ? smax(trunk(x, y, z), tailCut(x, y), K.tailEnd.blend) : 0;
    let d = wj <= 0 ? head(x, y, z) : wj >= 1 ? dt : head(x, y, z) * (1 - wj) + dt * wj;
    // the head's flat floor (as head.mjs applies it), fading out behind the gill opening
    const fade = smoothstep(F.fadeFrom, F.fadeTo, x) * F.fadeDepth;
    d = smax(d, FY - fade - y, FB);
    if (x > 1.3) {
      d = smin(d, Math.min(kD1(x, y, z), kD2(x, y, z), kA(x, y, z)), K.keels.blend);
      if (groove) d = ssub(d, groove(x, y, z), 0.006);
      if (papilla) d = smin(d, papilla(x, y, z), PA.blend);
      if (anus && Math.abs(x - AN.s) < 0.1) d = ssub(d, anus(x, y, z), AN.k);
    }
    return d;
  };
  const f = (x, y, z) => {
    const d = smin(core(x, y, z), pelvic(x, y, z), K.pelvicBase.blend);
    return smin(d, lobe(x, y, Math.abs(z)), P.blend);
  };
  f.head = head;
  f.cup = head.cup;
  f.parts = (x, y, z) => {
    const noPelvic = core(x, y, z), dp = pelvic(x, y, z), noLobe = smin(noPelvic, dp, K.pelvicBase.blend);
    const dl = lobe(x, y, Math.abs(z));
    return {
      ...head.parts(x, y, z), wj: joinW(x),
      noPelvic, pelvic: dp, noLobe, lobe: dl, d: smin(noLobe, dl, P.blend),
    };
  };
  return f;
}

/** Where a point lies along the pectoral lobe (HL; side +1 left, −1 right): t from 0 at the shoulder through 1 at the
 * elbow to 2 at the wrist (nearest point of the polyline; past either end it runs on), r its distance from the axis. */
export function lobeParam(p, side = 1, K = BODY_SCULPT) {
  const P = K.pectoral, q = [p[0], p[1], p[2] * side];
  let best = null;
  [[P.shoulder, P.elbow, 0], [P.elbow, P.wrist, 1]].forEach(([a, b, k], i) => {
    const ab = sub(b, a), L2 = dot(ab, ab);
    let t = dot(sub(q, a), ab) / L2;
    // clamp at the inner joint only (the ends run on)
    if (i === 0) t = Math.min(t, 1); else t = Math.max(t, 0);
    const c = add(a, mul(ab, t)), r = Math.hypot(...sub(q, c));
    if (!best || r < best.r) best = { t: k + t, r };
  });
  return best;
}

/** The whole fish's distance in mm (fish frame) for a head length of HLmm; .hl is the field in HL (with .head, .cup and
 * .parts). */
export function fishSDFmm(HLmm, K = BODY_SCULPT, H = HEAD_SCULPT) {
  const f = fishSDF(K, H), k = 1 / HLmm;
  const g = (x, y, z) => f(x * k, y * k, z * k) * HLmm;
  g.hl = f;
  return g;
}

/** Landmarks for the fins and the rig (HL, fish frame; left side where sided). */
export function bodyLandmarks(K = BODY_SCULPT) {
  const prof = trunkProfile(K);
  return { prof, pectoral: K.pectoral, pelvicBase: K.pelvicBase, keels: K.keels, caudalBase: K.caudalBase, eye: HEAD.eye, anus: K.anus, papilla: K.papilla };
}
