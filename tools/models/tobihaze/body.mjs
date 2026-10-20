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
// and A070's throat is inflated, so those two are compared head-scaled / by the back's line only). Round B3
// (scratchpad ref/work/b3_trunk) lowered the belly off the head's floor line, where B2 had laid it (a parallel-sided
// tube from 0.15 to 0.45 TL): the lower outline sags convex from the throat to the vent (0.031 HL under the chord
// from s 0.95 to the vent; within 0.0005 HL of its convex hull past the throat's bend), 0.036–0.040 HL under the
// head's underside at 0.30–0.45 TL (B067 0.035–0.046, A030's lit belly edge), so from the front only a thin crescent
// shows under the chin (0.040 HL deep, |z| ≤ 0.18: B002, u5); the back eases down from the nape, so the deepest
// section is 0.134 TL at 0.32 TL, 1.076 × the head's depth (BD at the pectoral base 1.04); the rear trunk 0.02–0.03 HL
// lower at 0.60–0.75 TL; every station within 0.0095 TL of A030 at 0.30–0.80 TL in top, bottom and depth (the photo's
// bottom read as the mean of its lit edge and its contact line; B2 0.0137 top / 0.0112 bottom). The tail compressed
// (W/D ≈ 0.6) holding its depth to the caudal base, then (round B3, B2's flat end plate read as a brush plugged into a
// metal band) tapering on past it into the fin's fleshy base: half-width 0.063 HL at the caudal base easing to 0.010
// HL 0.24 HL behind it (|dw/ds| ≤ 0.29, no bevel), its sides near parallel there, the dorsal and ventral margins
// converging into the folded fin's outline (A070, A017, A067, A030), its end a rounded tongue over the middle rays (from
// 0.20 HL behind the caudal base at the margins to 0.32 at mid-depth: the scaled base reaching furthest onto the
// middle of the fin); the caudal's principal rays start under that skin (fins.mjs). Widths as A036 seen from above (0.12 TL at 0.30, 0.083 at 0.54, 0.046 at 0.76). Round to egg-shaped in
// front, compressed behind, with no step.
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

/** The pectoral arm's bind pose (left side, HL) from its angles (round B3): one straight, flattened, muscular lobe from
 * the shoulder (the girdle's hinge on the flank) to the lobe/fin junction (the radial–ray joint, where the fin's rays
 * start under the lobe's fleshy end), `lobe.len` long. Its direction is read from the fin's folded rest (lying back along
 * the flank: u0 +s, its broad outer face n0 +z, its leading edge w0 = n0 × u0 up): protracted `lobe.protraction` deg
 * about the vertical (forward round the flank, OST §3.8's vertical hinge: the outer face turns to face forward), then
 * depressed `lobe.depression` deg in its own plane (about n: the lobe down, its leading edge turning out). Returns the
 * shoulder, the junction (`wrist`, the name the API keeps), the lobe's middle (`elbow`, kept for the API: no joint and
 * no bend there), u along the lobe (u1 = u2), n its outer face's normal, w1 across it toward its leading edge. */
export function armJoints(A) {
  const p = A.lobe.protraction * deg, d = A.lobe.depression * deg;
  const u0 = [Math.cos(p), 0, Math.sin(p)], n = [-Math.sin(p), 0, Math.cos(p)], w0 = [0, 1, 0];
  const u = add(mul(u0, Math.cos(d)), mul(w0, -Math.sin(d))), w1 = add(mul(w0, Math.cos(d)), mul(u0, Math.sin(d)));
  const shoulder = A.shoulder, wrist = add(shoulder, mul(u, A.lobe.len)), elbow = add(shoulder, mul(u, A.lobe.len * A.lobe.mid));
  const r3 = (v) => v.map((c) => Math.round(c * 1e4) / 1e4);
  return { shoulder: r3(shoulder), elbow: r3(elbow), wrist: r3(wrist), u1: u, u2: u, n, w1 };
}

/** The bind pose of the left arm (the right is the mirror image), the pectoral system of round B3. B2's two-segment leg
 * (a slim upper arm narrowest at its knee, a forearm widening into a cuff the blade came out of) read as a stick with a
 * knee and a wrist cuff (b2_findings anatomy P1/P3, fins P2). The photos show ONE muscular flattened lobe, widest at its
 * root and tapering smoothly (B010, A005: a straight leg; u1, A001: the lobe straight from the flank to the bend, the
 * bend at the lobe/fin junction, the furled rays below it), its skin running on over the rays' bases (the fin's fleshy
 * base: fins.mjs). Shoulder → junction 0.36 HL: u1 0.33 and A001 0.34 (the lobe from its root on the flank to the bend),
 * B010 0.43 (with the fleshy fin base, seen from above), A070 0.27 (partly behind the flank); research 0.30–0.45 HL, the
 * 4 radials 0.25–0.29 HL plus the ray bases' pad. With the blade's 0.50 HL the whole fin is 0.84 HL (MEAS 0.80, A070
 * 0.84). The bind lies half way between the states: protracted 45° (folded rest 0°, propped and paddling 70–100°) and
 * depressed 45° (rest −5…10°, prop 75–90°): the lobe 45° below the horizontal, half way out from the flank, its outer
 * face turned forward and out; its end stays inside fishmesh's BODY_BOX (|z| ≤ 0.62, y ≥ −0.16). */
const ARM = {
  shoulder: [1.14, 0.285, 0.33],      // the girdle's hinge at the flank (pre-P1 1.08–1.15 HL; 45–60 % of the depth down)
  lobe: { len: 0.36, protraction: 45, depression: 45, mid: 0.5 },
};
const ARMJ = armJoints(ARM);

/** Every tunable of the body (HL units, fish frame). */
export const BODY_SCULPT = {
  // the trunk loft: it starts inside the head behind the opercle with the head loft's own section there (w and nL at
  // s 1.05–1.30 as head.mjs's loft has them, yW and nU close to it, so the head's morph into the trunk adds no waist), and
  // runs past the caudal base into the fin's fleshy base; same columns as the head loft. Seen from above the body
  // behind the gill margin is 0.92 W at 1.3 HL (B047) and tapers from there without a step (0.87 W at 1.5, 0.81 W at
  // 1.75: A036, measurements.md §4.2). The belly (yB, round B3) sags from the throat (−0.012 at 1.05) to −0.050 at
  // 1.8 and rises again to the vent (the lower section a little fuller, nL 2.35–2.45, so the belly rests broad on the
  // mud as A030's and B067's do); the back (yT) eases down from the nape (0.627 at 1.3, 0.613 at 1.75) and drops from
  // the D1's end with the three photos (A030, A002, A070), the rear trunk 0.02–0.03 HL lower than B2's at 0.60–0.75 TL
  // (A030, A002), the tail's mid-line at 0.233 HL at the caudal base. The sections flatten a little toward the tail
  // (nU, nL 2.15–2.2: flanks broad enough for the wet band of light behind the anus, body_fins_colour §1.2). The
  // peduncle (W/D 0.58 at 4.04, 0.41 at the caudal base; body_fins_colour §1.2, §6.1, A036) runs on past the caudal base
  // as the caudal fin's fleshy base (round B3): its half-width 0.063 HL at 4.17 easing to 0.010 at 4.41 and 0.008 at
  // the tongue's tip (|dw/ds| ≤ 0.29, the sides near parallel over the last 0.1 HL so the fin's own fleshy base takes
  // over without a crease), its top falling and its bottom rising into the folded fin's margins (its depth 0.304 HL at
  // 4.17, 0.24 at 4.37 where the end's margins are)
  trunk: {
    s:  [1.05, 1.15, 1.30, 1.50, 1.75, 2.00, 2.25, 2.40, 2.50, 2.80, 3.10, 3.40, 3.70, 3.95, 4.04, 4.10, 4.15, 4.20, 4.25, 4.30, 4.35, 4.40, 4.50],
    w:  [0.320, 0.322, 0.321, 0.305, 0.283, 0.256, 0.236, 0.225, 0.218, 0.198, 0.172, 0.146, 0.121, 0.100, 0.090, 0.080, 0.068, 0.054, 0.040, 0.027, 0.0170, 0.0105, 0.0080],
    yT: [0.623, 0.626, 0.627, 0.618, 0.613, 0.606, 0.592, 0.566, 0.550, 0.506, 0.460, 0.420, 0.398, 0.390, 0.388, 0.387, 0.386, 0.380, 0.369, 0.356, 0.343, 0.330, 0.304],
    yB: [-0.012, -0.0255, -0.0365, -0.047, -0.0498, -0.0492, -0.0452, -0.019, -0.004, 0.012, 0.030, 0.035, 0.047, 0.066, 0.073, 0.077, 0.079, 0.082, 0.086, 0.090, 0.095, 0.100, 0.110],
    yW: [0.235, 0.236, 0.232, 0.218, 0.210, 0.210, 0.212, 0.214, 0.215, 0.220, 0.226, 0.232, 0.234, 0.234, 0.234, 0.233, 0.233, 0.233, 0.233, 0.233, 0.233, 0.233, 0.233],
    nU: [2.10, 1.95, 1.95, 2.00, 2.05, 2.05, 2.05, 2.05, 2.05, 2.10, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
    nL: [2.60, 2.50, 2.45, 2.40, 2.35, 2.30, 2.20, 2.17, 2.15, 2.15, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
  },
  // behind the opercle the head's field morphs into the trunk's over this range (the head's own features end at the
  // opercle; a cut and a union would leave a ring where the two sections differ)
  join: { from: 1.05, to: 1.32 },
  // the head's flat floor, lowered behind the gill opening by `fadeDepth` (smoothstep from fadeFrom to fadeTo), trimming
  // the head's part of the join only (round B3: the head loft's own underside would hang 0.02–0.035 HL lower there;
  // the trunk's belly behind is its own yB, which B2's floor capped at −0.02 and rounded up by up to 0.01 HL)
  // (y, blend: the head's floorY and blend.floor unless given)
  floor: { fadeFrom: 1.0, fadeTo: 1.7, fadeDepth: 0.09 },
  // the pectoral arm (left; the right is the mirror image) in its bind pose (ARM above), one muscular flattened lobe
  // (Itoh 1999: the base "thick and strong"; Murdy: "a muscular, arm-like base") over the four elongate radials and the
  // rays' bases: the root fanning onto the flank just behind the gill slit, the lobe a flattened oval widest at its root
  // (the abductor and adductor bellies) and tapering smoothly, flattening toward the junction where the fin's fleshy base
  // (fins.mjs: the rays' lenses as thick as the lobe's end, thinning over 0.1 HL) runs on from it. The API's three points:
  // shoulder, elbow (the lobe's middle: collinear, no joint), wrist (the junction: the lobe's end on its axis)
  pectoral: {
    shoulder: ARMJ.shoulder,
    elbow: ARMJ.elbow,
    wrist: ARMJ.wrist,
    // half-width across the lobe at its root, middle and junction (B010: 0.21 HL wide at the shoulder's root, 0.15 at
    // mid-lobe; u1 0.145 at mid-lobe; research 0.13–0.15 HL): widest at the root, a smooth taper (quadratic through the
    // three), never widening toward the junction; the rays' bases span 0.9 of the end's width
    radius: [0.076, 0.069, 0.061],
    // thickness through the lobe as a fraction of its width (fl: at the root, the middle and the junction: a flattened
    // oval 0.085 HL thick at the root, 0.066 mid-lobe, 0.042 at the junction, where the fin's fleshy base takes over)
    flat: 0.56,
    fl: [0.56, 0.48, 0.34],
    // the muscle belly: extra half-width `amp` at `at` (share of the lobe), `w` wide
    belly: { amp: 0.005, at: 0.22, w: 0.25 },
    // the lobe's end rounding at the junction (the cap's radius along the lobe as a share of the end's thickness: a
    // rounded edge the fin's fleshy base continues, not a flat face: B2's 0.35 left a cuff)
    capWrist: 1.0,
    // the fleshy root on the flank where the arm leaves it: a low ellipsoid pad (centre c, radii along s, y and z) the
    // arm's muscles fan into, butting against the gill margin behind the slit's pocket (gate: the pocket's gap the head's
    // own; B010, B067, u1: only the axilla's crease between them) and below the nape
    root: { c: [1.13, 0.245, 0.285], r: [0.085, 0.13, 0.055] },
    blend: 0.025,
    // the axes of the bind pose (for the rig, the fins and the charts): u1 = u2 along the lobe, n its outer face's
    // normal, w1 across it toward its leading edge
    axes: { u1: ARMJ.u1, u2: ARMJ.u2, n: ARMJ.n, w1: ARMJ.w1 },
    bind: ARM,
  },
  // the pelvic fins' fleshy base on the ventral midline under the chest (prepelvic 26.7–29.1 % SL = 1.11–1.21 HL: Lee
  // 1995, Itoh 1999), just behind the head's flat throat: c is where fins.mjs anchors the pelvic fins (their ray bases
  // c − 0.045 … c − 0.020) and the rig its J_pelvic (round B3: c 0.012 HL over the ray bases' hinge on the lowered belly,
  // was 0.022); the swelling itself is centred `shift` from c and `lift` above it, inside the belly (round B3: B2's
  // mound 0.011 HL under the head's floor stood out of the throat's line as the belly sank; the throat now bends once,
  // its slope ≤ 7.5° from s 1.0 to 1.3), kept for the rig's pelvic share
  pelvicBase: { c: [1.17, -0.012, 0.0], r: [0.11, 0.022, 0.06], blend: 0.04, shift: -0.0325, lift: 0.05 },
  // the low ridges the median fins stand on (a fin's base line runs along the crest of its ridge), at the literature's
  // positions (behaviour §1.2, §5 C3): D1 from the predorsal 0.30 TL to 0.455 TL (base 0.155 TL; Murdy 0.18, A070
  // 0.17), D2 from 0.49 to 0.72 TL (pre-D2 59.2 % SL, Itoh; base 0.23 TL between Murdy's 0.19 and the photos' 0.25–0.28),
  // anal from 0.52 TL (preanal 62 % SL) to 0.705 TL, opposite D2 and ending a little before it (base 0.185 TL; Murdy 0.166).
  // The D1 stands in a shallow groove instead of on a ridge (body_fins_colour §2.3: it "folds into a groove"): its keel
  // sunk under the skin and a furrow `groove.depth` deep along its base (0.005–0.006 HL below the lips at mid-fin),
  // faded out at both ends; round B3 the anal fin likewise (its keel sunk, a furrow along the ventral midline over
  // groove.s, past the fin's end where its folded rays reach): the folded fin lies in it, its lowest point ≤ 0.009 HL
  // under the ventral line (B2: 0.029, the lowest point of the resting fish's tail)
  keels: {
    d1: { s: [1.48, 2.255], radius: 0.015, inset: 0.020, groove: { depth: 0.007, r: 0.02 } },
    d2: { s: [2.43, 3.57], radius: 0.020, inset: 0.012 },
    anal: { s: [2.58, 3.50], radius: 0.018, inset: 0.020, groove: { depth: 0.016, r: 0.022, s: [2.56, 3.84] } },
    blend: 0.03,
  },
  // the anus (pre-anus 56.7 % SL, Itoh 1999: 0.477 TL) a small pit on the ventral midline, and the urogenital papilla
  // just behind it in front of the anal fin: a short cone pointing back and a little down, lying flat (pointed in males,
  // truncate in females: Lee 1995; one shared model, a blunt-tipped cone), slightly compressed; its tip `drop` under
  // the belly's line there (round B3: 0.004, so with the lowered belly the papilla is not a rear contact on the ground)
  anus: { s: 2.365, r: 0.013, k: 0.006 },
  papilla: { s: [2.42, 2.51], sink: 0.010, drop: 0.004, r: [0.024, 0.011], flat: 0.75, blend: 0.012 },
  // the caudal base (SL; the hypural joint): the fin's rays fan out from the hypural plate just behind it (fins.mjs)
  caudalBase: 4.17,
  // the end of the fin's fleshy base (round B3; B2 ended the body at a flat plate at 4.24 with the rays on its face, the
  // brush in a metal band of both reviews): a cut at s at the margins, bowed back by `bulge` at mid-depth into a rounded
  // tongue over the middle rays (the scaled base reaching furthest onto the fin's middle; a straight end margin still
  // read as a band in the clay side views), rounded by `blend`, where the body is 0.008–0.014 HL thick a side and the
  // fin's own fleshy base takes over at that thickness
  tailEnd: { s: 4.37, blend: 0.012, bulge: 0.12 },
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

/** A field that returns the distance to its bounding box (a lower bound) when farther than `far`, else `f`. */
function bounded(f, lo, hi, far = 0.12) {
  return (x, y, z) => {
    const bx = Math.max(lo[0] - x, 0, x - hi[0]), by = Math.max(lo[1] - y, 0, y - hi[1]), bz = Math.max(lo[2] - z, 0, z - hi[2]);
    const box = Math.hypot(bx, by, bz);
    return box > far ? box : f(x, y, z);
  };
}

/** The pectoral lobe (round B3): one straight flattened limb from a (the shoulder) to b (the junction), an elliptic
 * section of half-width r(t) across it in its broad face's plane and half-thickness r(t)·fl(t) through it (n: the face
 * normal), r and fl smooth quadratics through their values at the root, at `tm` (the lobe's middle) and at the junction
 * (so the taper has no corner: B2's two segments made the knee), plus the muscle belly; past the junction a rounded cap
 * `cap1` × the end's thickness long, at the root the root's own half-width (the root pad covers it). */
function lobeSegment(a, b, r, f, tm, n, { belly = null, cap1 = null } = {}) {
  const ax = sub(b, a), L = Math.hypot(...ax), u = mul(ax, 1 / L);
  const nn = nrm(sub(n, mul(u, dot(n, u)))), wv = cross(nn, u);
  // (a quadratic through (0, v0), (tm, v1), (1, v2))
  const quad = (v, t) => { const l0 = ((t - tm) * (t - 1)) / tm, l1 = (t * (t - 1)) / (tm * (tm - 1)), l2 = (t * (t - tm)) / (1 - tm); return v[0] * l0 + v[1] * l1 + v[2] * l2; };
  const rAt = (t) => quad(r, t) + (belly ? belly.amp * Math.exp(-(((t - belly.at) / belly.w) ** 2)) : 0);
  return (x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]];
    const ta = dot(p, u) / L, t = clamp(ta, 0, 1);
    const qa = (ta - t) * L, qw = dot(p, wv), qn = dot(p, nn);
    const rr = rAt(t), h = rr * quad(f, t);
    const ra = qa === 0 ? rr : qa < 0 ? rr : (cap1 === null ? rr : cap1 * h);
    const k0 = Math.hypot(qa / ra, qw / rr, qn / h), k1 = Math.hypot(qa / (ra * ra), qw / (rr * rr), qn / (h * h));
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -h;
  };
}

/** The left pectoral arm's field (HL): the root pad and the lobe (z ≥ 0 side; callers pass |z|). */
export function armField(K = BODY_SCULPT) {
  // the lobe's frame from its points (so a caller that moves the shoulder and the junction gets a consistent limb): u
  // along it, the broad outer face's normal n (the bind's axes.n made square to u; the lateral axis without it)
  const P = K.pectoral, u = nrm(sub(P.wrist, P.shoulder)), n0 = P.axes?.n ?? [0, 0, 1], n = nrm(sub(n0, mul(u, dot(n0, u))));
  const fl = P.fl ?? [P.flat, P.flat, P.flat];
  const L = Math.hypot(...sub(P.wrist, P.shoulder)), tm = clamp(Math.hypot(...sub(P.elbow, P.shoulder)) / L, 0.2, 0.8);
  const lobe = lobeSegment(P.shoulder, P.wrist, P.radius, fl, tm, n, { belly: P.belly, cap1: P.capWrist ?? null });
  const R = P.root;
  const root = R ? ellipsoid(R.c, R.r) : null;
  const arm = (x, y, z) => {
    let d = lobe(x, y, z);
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
  const PBc = K.pelvicBase.c, pelvic = ellipsoid([PBc[0] + (K.pelvicBase.shift ?? 0), PBc[1] + (K.pelvicBase.lift ?? 0), PBc[2]], K.pelvicBase.r);
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
  // (round B3: the anal fin likewise, on the ventral midline: its folded rays lie in it instead of hanging under the
  // belly, where round B2's stood 0.029 HL below the ventral line and held the tail off the ground at rest)
  const grooveOf = (spec, top) => {
    const GR = spec.groove;
    if (!GR) return null;
    const pts = [], radii = [], n = 12, [s0, s1] = GR.s ?? spec.s;
    for (let i = 0; i <= n; i++) {
      const s = s0 - 0.02 + ((s1 - s0 + 0.06) * i) / n, a = Math.sin((Math.PI * i) / n) ** 0.5, q = prof.at(s);
      pts.push([s, top ? q.yT + GR.r - GR.depth * a : q.yB - GR.r + GR.depth * a, 0]); radii.push(GR.r);
    }
    return tube(pts, radii);
  };
  const groove = grooveOf(K.keels.d1, true), grooveA = grooveOf(K.keels.anal, false);
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
    // the head's flat floor (as head.mjs applies it), lowered behind the gill opening by `fade`, trims the head's part
    // of the join only (round B3: applied to the blend it also capped the trunk's belly, which then lay on the floor's
    // line, and its rounding raised the belly up to 0.01 HL wherever the two met: a stall in the throat's line), so
    // the trunk's own lower outline (yB) is the belly behind the join
    const dh = wj < 1 ? smax(head(x, y, z), FY - smoothstep(F.fadeFrom, F.fadeTo, x) * F.fadeDepth - y, FB) : 0;
    let d = wj <= 0 ? dh : wj >= 1 ? dt : dh * (1 - wj) + dt * wj;
    if (x > 1.3) {
      d = smin(d, Math.min(kD1(x, y, z), kD2(x, y, z), kA(x, y, z)), K.keels.blend);
      if (groove) d = ssub(d, groove(x, y, z), 0.006);
      if (grooveA && x > (K.keels.anal.groove.s ?? K.keels.anal.s)[0] - 0.08 && x < (K.keels.anal.groove.s ?? K.keels.anal.s)[1] + 0.12) d = ssub(d, grooveA(x, y, z), 0.006);
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
