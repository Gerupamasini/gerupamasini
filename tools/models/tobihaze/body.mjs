// The whole トビハゼ as one signed-distance sculpt, in head lengths (HL) of the fish frame (anatomy.mjs): the head of
// head.mjs (accepted against the photos first, then left alone: in front of s 0.95 the fish's field is the head's own,
// to 1e-6 HL), a trunk loft behind it from the measured body proportions, the muscular pectoral arms in their bind
// pose, the fleshy pelvic base, the low ridges the median fins stand on, the anus and the urogenital papilla, and the
// peduncle's compressed end the caudal fin grows out of. The fins' membranes, the eyes and the rig are separate
// (fins.mjs, eye.mjs, rig.mjs).
//
// Proportions (TL 4.96 HL, SL 4.17 HL; research: measurements §1, body_fins_colour §1–2, §6, behaviour §1.1, §5;
// round B1 traced the lateral photos A030, A002, A070 station by station in the snout–caudal-base frame): the deepest
// point at 0.30–0.40 TL, 0.150 TL (A030 0.145–0.150, A070 and A002 0.16–0.17 with full bellies: a relaxed fish between
// them), the belly fullest between the pectorals and the vent and hanging 0.09 HL under the head's flat floor (A030
// 0.085, A070 0.11 HL); the back level from the nape to the D1 origin (A030, A002: no higher there than at the nape),
// then dropping to the peduncle as both lying fish show (0.068 TL from 0.30 to 0.80 TL above the snout–caudal-base
// line), so the tail's axis sinks 0.05 HL toward the caudal base; the tail compressed (W/D ≈ 0.6) and tapering to a
// peduncle 0.06 TL deep (CPD 0.074 SL); widths as A036 seen from above (0.12 TL at 0.30, 0.084 at 0.54, 0.044 at
// 0.76). Round to egg-shaped in front, compressed behind, with no step.
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

/** The bind pose of the left arm (the right is the mirror image): half way between folded back along the flank (the
 * arm pointing back ~15° down, against the flank, the elbow straight: A030, B067) and planted as a leg (the arm near
 * vertical, ~20° out, the elbow bent ~100° so the blade lies flat forward: u1, B010, A005; Pace & Gibb 2009 radial–ray
 * angle 76°→178°): the upper arm 50° below the horizontal and 31° out, the elbow bent 30° forward, so from the bind the
 * shoulder turns 42° to folded and 33° to planted, the elbow 30° to straight and 70° to planted; the arm stands off the
 * flank from a third of the way down (the skin of arm and flank never fuse past the root, so the weights can part
 * them), and its reach stays inside fishmesh's BODY_BOX (|z| ≤ 0.57 of 0.62 HL). */
const ARM = {
  shoulder: [1.14, 0.29, 0.35],       // the girdle's hinge at the flank (pre-P1 1.08–1.15 HL; 45–60 % of the depth down)
  upper: { len: 0.27, down: 50, out: 31 },   // the four proximal radials 0.25–0.29 HL (OST §3.8)
  fore: { len: 0.12, bend: 30 },             // the ray bases' fleshy pad to the wrist: the lobe 0.39 HL (0.30–0.45; B010 0.37 from the root)
};
const ARMJ = armJoints(ARM);

/** Every tunable of the body (HL units, fish frame). */
export const BODY_SCULPT = {
  // the trunk loft: it starts inside the head behind the opercle with the head loft's own section there (w and nL at
  // s 1.05–1.30 as head.mjs's loft has them, yW and nU close to it, so the head's morph into the trunk adds no waist), and
  // runs past the caudal base into the peduncle's compressed end; same columns as the head loft. Seen from above the
  // body behind the gill margin is 0.92 W at 1.3 HL (B047) and tapers from there without a step (0.87 W at 1.5, 0.81 W at
  // 1.75: A036, measurements.md §4.2). The belly (yB) hangs under the head's floor from the pelvic base to the vent, its
  // lowest point at 1.6–1.8 HL (0.33–0.36 TL), 0.09 HL under the floor (A030 0.085, A070 0.11 HL); behind the vent the
  // back drops and the belly rises less than before, the tail's mid-line sinking from 0.27 to 0.23 HL at the caudal base
  // (the depth there as before: 0.066 TL at 0.80 TL; A030 0.057, A070 0.064, literature 0.065). The sections flatten a
  // little toward the tail (nU, nL 2.15–2.2: flanks broad enough for the wet band of light behind the anus,
  // body_fins_colour §1.2). From the caudal base (4.17) the peduncle thins to a blade (w 0.056 → 0.02) whose bowed end
  // (tailEnd) the caudal fin's membrane grows out of, instead of a blunt cut
  trunk: {
    s:  [1.05, 1.15, 1.30, 1.50, 1.75, 2.00, 2.25, 2.50, 2.80, 3.10, 3.40, 3.70, 3.95, 4.10, 4.20, 4.30],
    w:  [0.320, 0.322, 0.321, 0.305, 0.283, 0.256, 0.236, 0.218, 0.200, 0.172, 0.145, 0.114, 0.088, 0.074, 0.056, 0.020],
    yT: [0.623, 0.626, 0.628, 0.631, 0.630, 0.624, 0.612, 0.592, 0.560, 0.522, 0.480, 0.436, 0.400, 0.388, 0.382, 0.372],
    yB: [-0.045, -0.058, -0.080, -0.095, -0.100, -0.095, -0.080, -0.058, -0.030, 0.000, 0.025, 0.048, 0.068, 0.075, 0.078, 0.090],
    yW: [0.235, 0.236, 0.232, 0.215, 0.205, 0.205, 0.208, 0.212, 0.218, 0.226, 0.232, 0.236, 0.236, 0.234, 0.232, 0.231],
    nU: [2.10, 1.95, 1.95, 2.00, 2.05, 2.05, 2.05, 2.05, 2.10, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
    nL: [2.60, 2.50, 2.40, 2.30, 2.25, 2.20, 2.15, 2.15, 2.15, 2.15, 2.20, 2.20, 2.20, 2.20, 2.20, 2.20],
  },
  // behind the opercle the head's field morphs into the trunk's over this range (the head's own features end at the
  // opercle; a cut and a union would leave a ring where the two sections differ)
  join: { from: 1.05, to: 1.32 },
  // the head's flat floor, faded out behind the gill opening so the belly can hang below it (the throat stays flat to
  // the pelvic base, then the chest drops to the belly)
  // (y, blend: the head's floorY and blend.floor unless given)
  floor: { fadeFrom: 1.0, fadeTo: 1.55, fadeDepth: 0.25 },
  // the pectoral arm (left; the right is the mirror image) in its bind pose (ARM above: shoulder, elbow, wrist), a
  // muscular flattened limb (Itoh 1999: the base "thick and strong"; Murdy: "a muscular, arm-like base"): the root
  // fanning onto the flank just behind the gill slit, the upper arm over the four elongate radials (a flattened oval,
  // fullest a third of the way down: the abductor and adductor bellies), the elbow (the radial–ray joint's fibrocartilage
  // pad) and the forearm, the fleshy pad over the ray bases, flattening to the wrist where the blade starts
  pectoral: {
    shoulder: ARMJ.shoulder,
    elbow: ARMJ.elbow,
    wrist: ARMJ.wrist,
    // half-width across the limb at shoulder / elbow / wrist (the arm 0.13–0.16 HL wide: body_fins_colour §2.1, u1)
    radius: [0.080, 0.068, 0.066],
    // thickness through the limb as a fraction of its width (flat; fl: at the shoulder, the elbow and the wrist: the arm
    // 0.09–0.10 HL thick, flattening to 0.06 at the wrist, where the blade's ray bases spread)
    flat: 0.60,
    fl: [0.60, 0.56, 0.44],
    // the upper arm's muscle belly: extra half-width `amp` at `at` (share of the upper arm), `w` wide
    belly: { amp: 0.012, at: 0.35, w: 0.30 },
    // the elbow's knuckle (optional { off, r, blend }: an ellipsoid on the outside of the bend; off: a small pad there made
    // non-manifold edges at the far tier's 0.40 mm cell, and the two segments' union already rounds the elbow), and the
    // wrist's end rounding (the cap's radius along the arm as a share of the end's thickness)
    knuckle: null,
    capWrist: 1.0,
    capElbow: 1.0,
    elbowBlend: 0.035,
    // the fleshy root on the flank where the arm leaves it: a low ellipsoid pad (centre c, radii along s, y and z) the
    // arm's muscles fan into, behind the gill slit's pocket (gate: the pocket's gap the head's own) and below the nape
    root: { c: [1.165, 0.245, 0.295], r: [0.075, 0.125, 0.055] },
    blend: 0.025,
    // the axes of the bind pose (for the rig and the charts): u1 along the upper arm, u2 along the forearm, n the broad
    // face's normal, w1 across the upper arm toward its leading edge
    axes: { u1: ARMJ.u1, u2: ARMJ.u2, n: ARMJ.n, w1: ARMJ.w1 },
    bind: ARM,
  },
  // the pelvic fins' fleshy base on the ventral midline under the chest (prepelvic 26.7–29.1 % SL = 1.11–1.21 HL: Lee
  // 1995, Itoh 1999), just behind the head's flat throat, standing 0.025 HL proud of the belly
  pelvicBase: { c: [1.17, -0.055, 0.0], r: [0.085, 0.032, 0.062], blend: 0.03 },
  // the low ridges the median fins stand on (a fin's base line runs along the crest of its ridge), at the literature's
  // positions (behaviour §1.2, §5 C3): D1 from the predorsal 0.30 TL to 0.455 TL (base 0.155 TL; Murdy 0.18, A070
  // 0.17), D2 from 0.49 to 0.72 TL (pre-D2 59.2 % SL, Itoh; base 0.23 TL between Murdy's 0.19 and the photos' 0.25–0.28),
  // anal from 0.52 TL (preanal 62 % SL) to 0.705 TL, opposite D2 and ending a little before it (base 0.185 TL; Murdy 0.166)
  keels: {
    d1: { s: [1.48, 2.255], radius: 0.022, inset: 0.012 },
    d2: { s: [2.43, 3.57], radius: 0.020, inset: 0.012 },
    anal: { s: [2.58, 3.50], radius: 0.018, inset: 0.010 },
    blend: 0.03,
  },
  // the anus (pre-anus 56.7 % SL, Itoh 1999: 0.477 TL) a small pit on the ventral midline, and the urogenital papilla
  // just behind it in front of the anal fin: a short cone pointing back and down (pointed in males, truncate in females:
  // Lee 1995; one shared model, a blunt-tipped cone), slightly compressed
  anus: { s: 2.365, r: 0.013, k: 0.006 },
  papilla: { s: [2.42, 2.51], sink: 0.010, drop: 0.028, r: [0.024, 0.011], flat: 0.75, blend: 0.012 },
  // the caudal peduncle's end: the fin's rays fan out from here
  caudalBase: 4.17,
  // the peduncle's compressed end behind the caudal base: a thin rounded edge (the hypural plate under the fin's base)
  // (bulge: the end's outline seen from the side is convex, `bulge` further back at mid-depth than at the edges, like the
  // fleshy, scaled base of the caudal fin it continues into, so through the translucent membrane it reads as the fin's
  // base and not as a cut)
  tailEnd: { s: 4.235, blend: 0.03, bulge: 0.05 },
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
