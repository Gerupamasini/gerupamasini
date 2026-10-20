// The トビハゼ's fins as meshes: the two dorsal fins, the anal fin and the caudal fin on the body's midline, the pectoral
// blades on the ends of the muscular lobes, the pelvic cup under the chest. Each fin is a fan of rays and a membrane
// between them, in the fish frame of anatomy.mjs (tables in head lengths HL, meshes in mm).
//
// Counts and shapes (research: literature_morph §2, §4; body_fins_colour §2, §6.2; measurements §1; behaviour §1.2, §5):
//   D1 XII flexible spines, a tall rounded fan, the spine tips standing a little free of the membrane (a notched margin);
//      about 0.6 of the body depth when half raised (A070, B067, B014), 0.9-1.0 erect (A001, B062, A065); folded it lies
//      low along the back, a streak in its groove (A030; ≤ 0.035 HL over the skin), and stops short of D2 (Lee 1995).
//   D2 I,12, long and low, rounded in front, even height (0.38-0.45 BD erect: A065, A001).
//   anal I,11, low, mirroring D2 on the belly (0.4-0.5 BD erect: A065).
//   caudal 17 principal rays (the outermost of each lobe unbranched) from the peduncle's end plate, their bases on a
//      straight line down its face over its whole depth, a fleshy, scaled base as thick as the plate running on over
//      their roots, and procurrent rays (6 dorsal, 6 ventral) along the peduncle's edges in front: the outline runs on
//      from the peduncle into the fin (A017, A070, A067); on land folded into a pointed lanceolate spear, its tip a
//      little below the body's axis and its lower margin the straighter and longer (A017, A070, A059); relaxed
//      rounded-lanceolate; spread rounded (A061, A065); the lowest rays thickened distally (Murdy 1989).
//   pectoral (round B2's shared design: the owner's "developed pectoral fins") the arm (body.mjs) 0.40-0.45 HL from the
//      shoulder to a spatulate wrist as wide as the fin's base; the blade 14 soft rays from a straight line across the
//      wrist's end (0.9 of its width), 0.46 HL long, its fan rounded; the whole fin 0.85-0.95 HL from the shoulder to the
//      longest ray's tip (MEAS 0.80-0.84, Murdy 25.8 % SL = 1.07 HL). Spread 144° under water, a paddle (A061); furled
//      flat against the flank at rest (A030, A040, B067); planted on land as the foot of a slim leg: the inner blade
//      continuing the forearm down to the mud, the distal blade (past a heel ≈ 0.17 HL from the bases) flat on the
//      ground, pointing back and out (A070, A005, u1, B010).
//   pelvic I,5 a side: two fins joined in front by a frenum and along their inner rays by a membrane about half their
//      length, the rear margin notched: a shallow cup open to the rear under the chest, a dish seen from the front
//      (Murdy, Lee, Itoh; B014, B010), 0.3-0.5 HL long; folded flat back under the belly (B067).
//
// Geometry. Every ray is a raised round ridge on both faces of the membrane: a lens-shaped tube (half-width w across the
// fin, half-thickness h through it) along the ray's centre line, the membrane sheet running from the edge of one ray's
// lens to the edge of the next (the two share their positions exactly, so nothing gaps). Spines are thick at the base
// and taper; the soft rays narrow a little at every other row (the segments) and, with four segments to an arc, split
// into two ridges near their tips (the branches). The membrane sags between the rays and pleats (the rays alternately
// a little to either side), and ends a little short of the ray tips between them (a scalloped margin; D1's notched
// between the free spine tips). The lighter tier (relief: false) is the same fin as a single sheet whose columns run
// along the rays, its roots cut a little deeper (base.flatDepth) into the coarser skin.
//
// Placement. The bases sit on the body's skin (the field of body.mjs, read at build time with the keels, the lobe's
// wrist, the peduncle's end plate and the pelvic base of BODY_SCULPT, so the trunk's changes carry over), a little under
// it so no seam shows from any side; the dorsal and anal base lines follow the back's and belly's curve. Past the root
// the rays are kept off the body (pushed out along the field's gradient), and so is every vertex of the membrane.
//
// States: the bind mesh is the relaxed, half-raised fin; buildFinTargets gives the blend shapes towards
//   fold     D1, D2 down along the back, the anal fin back along the belly, the caudal closed into its spear, the pelvic
//            fins laid back hugging the belly (|z| ≤ 0.10 HL, no lower than 0.01 HL under it), the pectoral blade furled
//            flat on the flank, authored with the arm in its rest pose (def.restPose: the arm laid back flush on the
//            flank) and carried back to the bind through the wrist: tangent to the skin, ≤ 0.3 mm off it, in that pose
//   spread   erect / the fan fully open (the pectoral's paddle)
//   flex     (caudal) the fin's rear bent to the fish's left (+z); a negative weight bends it to the right
//   plant    (pectoral) the inner blade furled along the forearm to the heel, the rest turned into one plane, the sole
//            (def.sole): flat when the forearm stands as a leg (FIN_SCULPT.pectoral.plant lean / splay; the rig's IK,
//            rig.mjs solveArmPlant, levels it exactly by def.sole.normal), its rays fanned back and out, pressed flat on
//            their ground side; plantMid is its corrective, driven at 4w(1-w) with plant = w, which keeps the rays their
//            length half way
// Each target also comes with its normals' deltas (unit vectors, fish frame: dirToObject, no scale), so the folded,
// spread and planted fins shade as they lie ({ normals: false } leaves them out: see buildFinTargets).
//
// Interface (body_contract §5): FIN_SCULPT, FIN_ATLAS, finDefinitions(K), buildFinMesh(def, { sub, nt, m?, relief? }),
// buildFinTargets(def, mesh, { normals? }) → { names, deltas (mm), normals }, finCard(def, { state? }),
// finCardTargets(def) → { names ['fold'(, 'plant')], deltas, normals } (the far tier's card blend shapes),
// finTierParams(tier). Besides the contract's fields a mesh carries `build` (its options; buildFinTargets rebuilds from
// them for a copied mesh), the median fins' and the caudal's `foldS` (fish mm: each vertex's s when folded, for the
// rig: see rig.mjs finWeights) and, not enumerable, `root` (the root point under every vertex, mm). The pectoral defs
// carry `bladePivot` (mm: the plant's heel, the ankle the sole turns on, for the rig's J_pecBlade), `sole` (the planted
// sole's plane, point, heel, heel axis and toe, for the rig's IK and the contacts) and `restPose` (the arm's rest pose
// the fold is authored in, as joint rotations); the caudal def carries `plate` (the end plate the rays spring from).
// UVs: u across the rays by their spacing, v along them by length (uvMap), the same on every tier and card.
// Weights (rig.mjs finWeights): D1, D2 and the anal fin by each vertex's baseS (the axial row of the body under its
// root; round B2 asks the rig to blend toward foldS by rayT, so a folded ray's tip follows the arched back), the caudal
// by the vertex's own s, the blade from J_pecWrist to J_pecBlade, the pelvic on J_pelvic; a lens and the membrane edge
// beside it share positions and attributes, so they skin alike.
import { HL } from './anatomy.mjs';
import { BODY_SCULPT, fishSDF, trunkProfile } from './body.mjs';

const DEG = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const perp = (v, n) => sub(v, mul(n, dot(v, n)));
/** d turned by the angle `ang` towards b (in the plane of d and b). */
const turnToward = (d, b, ang) => {
  const q = perp(b, d), l = len3(q);
  if (l < 1e-9 || !ang) return d;
  return nrm(add(mul(d, Math.cos(ang)), mul(q, Math.sin(ang) / l)));
};
/** Spherical interpolation of unit vectors. */
const slerp = (a, b, t) => {
  const c = clamp(dot(a, b), -1, 1), om = Math.acos(c);
  if (om < 1e-6) return a;
  const s = Math.sin(om);
  return nrm(add(mul(a, Math.sin((1 - t) * om) / s), mul(b, Math.sin(t * om) / s)));
};

/** Every tunable of the fins (HL, degrees). */
export const FIN_SCULPT = {
  // the root: how deep the base row sits under the skin; how far from its base a vertex may still be inside the body;
  // the rays' clearance over the skin once they have left it (on top of their lens), reached over `ramp` of their length
  // (flatDepth: the single-sheet tier's roots this deep: its coarser skin (lod1) cuts a little deeper than the hero's,
  // round B1 found 3–8 of its root vertices up to 0.034 mm outside it at 0.006)
  base: { depth: 0.006, flatDepth: 0.009, free: 0.02, clear: 0.004, ramp: 0.05, minClear: 0.0015, along: 0.03 },
  // a folded median ray first rises at `lift` deg over its `knuckle` (HL), then lies at its fold angle over the skin
  // (a fin's own `foldLift` first: D1's lower, see there)
  fold: { lift: 38, knuckle: 0.03 },
  // a ray's cross-section at its base: half-width w across the fin, half-thickness h through it, `tip` the share left at
  // the tip; soft rays: every other row past `segStart` narrower by `seg` (the segments), split into two ridges from
  // `branch` of the length (four segments to an arc only); `uvHalf` the ray's half-width in the atlas (ray-index units)
  ray: {
    spine: { w: 0.0105, h: 0.0092, tip: 0.22 },
    soft: { w: 0.0078, h: 0.0062, tip: 0.42, seg: 0.2, segStart: 0.2, branch: 0.56 },
    proc: { w: 0.0066, h: 0.0054, tip: 0.35 },
    gap: 0.38,           // a lens never wider than this share of the gap to its neighbour (packed rays near a root)
    uvHalf: 0.1,
  },
  // D1 XII: lengths front to back; angles (deg) from the back's tangent towards its outward normal, first and last spine,
  // per state; the spines curve back a little (bend, deg over the length); membrane reach on the spines (their tips free)
  // (fold: round B1's 6–4° over a 38° knuckle stood the folded D1 0.074 HL over the back as a comb of spines; the
  // literature folds it into a groove and A030 shows a thin streak: lower, flatter)
  d1: {
    keel: 'd1', inset: [0.012, 0.02], spines: 12,
    // (round B2 integration: × 0.94 — the trunk's B2 body is shallower at the pectoral base (BD 1.044 × HD), which put
    // the same spines at 0.99 BD erect; now erect 0.93 (A001 0.93), half raised 0.62 (photo mean 0.60); the shorter
    // folded spines shingle less, so the fold's knuckle lift goes 25 → 28 (hero fold winding 98.92 → 99.22 %; folded
    // height over the back 0.0307 HL))
    len: [0.526, 0.592, 0.611, 0.592, 0.555, 0.498, 0.432, 0.367, 0.301, 0.244, 0.188, 0.141],
    angle: { bind: [54, 9], spread: [98, 24], fold: [3, 2] }, anglePow: { bind: 1.35 }, foldLift: 28,
    bend: { bind: 10, spread: 4, fold: 0 },
    reach: 0.93, flatReach: 1.0, notch: 0.06, notchPow: 0.8, flatNotch: 0.12,
    pleat: { bind: 0.011, spread: 0.003, fold: 0.016 }, sag: { bind: 0.006, spread: 0.001, fold: 0.004 },
  },
  // D2 I,12
  d2: {
    keel: 'd2', inset: [0.015, 0.03], spines: 1,
    len: [0.16, 0.27, 0.31, 0.33, 0.335, 0.335, 0.335, 0.335, 0.335, 0.33, 0.32, 0.30, 0.28],
    angle: { bind: [36, 26], spread: [66, 52], fold: [5, 3] },
    spineAngle: { bind: 46, spread: 80, fold: 7 },
    bend: { bind: 8, spread: 3, fold: 0 },
    reach: 0.97, notch: 0.035, notchPow: 0.85,
    pleat: { bind: 0.008, spread: 0.002, fold: 0.012 }, sag: { bind: 0.004, spread: 0.001, fold: 0.003 },
  },
  // anal I,11
  anal: {
    keel: 'anal', inset: [0.015, 0.03], spines: 1,
    len: [0.12, 0.22, 0.26, 0.28, 0.29, 0.295, 0.30, 0.30, 0.30, 0.29, 0.28, 0.265],
    angle: { bind: [32, 24], spread: [62, 48], fold: [6, 4] },   // (fold 6–4: the shorter keel of round B1 shingles its 12 rays closer; at 5–3, 1.35 % of the folded faces turned against their normals)
    spineAngle: { bind: 40, spread: 74, fold: 7 },
    bend: { bind: 8, spread: 3, fold: 0 },
    reach: 0.97, notch: 0.03, notchPow: 0.85,
    pleat: { bind: 0.007, spread: 0.002, fold: 0.011 }, sag: { bind: 0.004, spread: 0.001, fold: 0.003 },
  },
  // caudal: 17 principal rays from the peduncle's end plate (the hypural plate: their bases on a straight line down the
  // plate's face, read from the body's field, the outermost `edge` HL inside its dorsal and ventral corners so the fan
  // covers the plate's whole depth and no corner of the body shows past the first and last ray), dorsal and ventral
  // procurrent rays along its edges in front (procS from the plate); principal lengths a lanceolate profile peaking at
  // `tipAt` of the fan (dorsal 0 → ventral 1, below the middle: the tip under the axis, the lower margin the longer),
  // the longest reaching TL (`tipS`, HL) from its base; angles (deg, from the body's axis, + up) of the dorsal-most and
  // ventral-most principal rays per state (bind: rounded-lanceolate, half way between the folded spear and the spread
  // fan; round B1's 8° / −4° was a parallel brush); `flesh`: the fin's fleshy, scaled base (the peduncle's skin running
  // on over the ray roots): the principal rays' lenses at their roots as thick as `k` × the plate's half-width there
  // and as wide as `w` × the gap to the next ray (so they close up into one corrugated surface), held over `hold` HL
  // (swelling by `swell` past the face's rounded rim, which hides under it) and easing to the bare ray by `over`
  caudal: {
    principal: 17, edge: 0.012, spanMin: 0.40, tipS: 80 / HL, tipAt: 0.69, upperDrop: [0.5, 1.4], lowerDrop: [0.14, 1.5],
    angle: { bind: [16, -12], spread: [36, -28], fold: [-9, 2], flex: [16, -12] },
    procS: [-0.265, -0.225, -0.185, -0.145, -0.105, -0.068],   // from the plate's face
    procLen: { dorsal: [0.035, 0.06, 0.09, 0.125, 0.165, 0.21], ventral: [0.04, 0.07, 0.10, 0.14, 0.18, 0.23] },
    procAngle: { bind: [14, 18], spread: [22, 30], fold: [-2, -4], flex: [14, 18] },
    flesh: { k: 0.96, w: 0.47, over: 0.10, hold: 0.02, swell: 0.10 },
    thick: 3,            // the lowest principal rays thickened distally
    segScale: 0.5,       // its rows are far apart: the segments' joints only hinted
    flex: 38,            // deg the rays curl to the side at full flex
    reach: 0.97, procReach: 0.93, notch: 0.025, notchPow: 0.9,
    pleat: { bind: 0.005, spread: 0.002, fold: 0.008, flex: 0.005 }, sag: { bind: 0.004, spread: 0.001, fold: 0.002, flex: 0.004 },
  },
  // pectoral blade (the shared design of round B2: the arm 0.40–0.45 HL from the shoulder to a spatulate wrist as wide
  // as the fin's base, the blade 0.44–0.48 HL, the whole fin 0.85–0.95 HL from the shoulder to the longest ray's tip;
  // MEAS 0.80–0.84, Murdy 25.8 % SL = 1.07 HL, B067's folded blade ≈ 0.55 HL): 14 rays whose bases run straight across
  // the wrist's end, `span` × its width (the lobe's width there, BODY_SCULPT.pectoral.radius[2] × 2), `depth` HL under
  // its end face; lengths `maxLen` in the middle of the fan, `edgeLen` of that at its edges, the fan rounded; fan angles
  // (deg) in the lobe's flat plane (+ towards the lobe's wv edge: the trailing edge when the arm stands as a leg),
  // turned by `turn`; the blade cupped towards the body (`curl`).
  //   plant (A070, A005, u1, B010): the inner blade continues the forearm, its rays furled (`plant.inner`: the fan's
  //     angles, converging) down to a heel `plant.heel` HL from the middle rays' bases, where each ray turns (over
  //     `plant.over`) into one plane, the sole: flat on the ground when the forearm stands `plant.lean` deg forward of
  //     the vertical and `plant.splay` deg out with its broad face outward (the rig's IK, rig.mjs solveArmPlant, levels
  //     it exactly: def.sole carries the plane); the sole's rays fanned from `plant.sole[0]` (deg from out towards
  //     back; the trailing edge's ray) to `plant.sole[1]` (the leading edge's): back and out; on the ground the rays'
  //     lenses are flattened on their lower side to `plant.flat` of their thickness (pressed rays)
  //   fold (A030, A040, B067): authored with the arm in the rest pose (fins.mjs restArmPose: the upper arm and forearm
  //     laid back flush on the flank, `rest.droop` deg below the horizontal, `rest.gap` HL off it; def.restPose carries
  //     the joints' rotations), the blade's rays furled (`fan.fold`) and hugging the flank (the trunk's skin) back from
  //     the wrist, their lower faces `rest.margin` HL off it, reached over `rest.ramp` HL; then carried back to the bind
  //     through the wrist's inverse
  //   spread (A061): the paddle, the fan opened 144°, flat
  pectoral: {
    rays: 14, span: 0.9, depth: 0.006, maxLen: 0.46, edgeLen: 0.62,
    fan: { bind: [44, -44], spread: [72, -72], fold: [8, -8] },
    turn: { bind: 6, spread: 4, fold: 0 },
    curl: { bind: 8, spread: 3, fold: 0, plant: 0 },
    plant: { heel: 0.18, over: 0.06, lean: 12, splay: 10, inner: [-3, 3], sole: [80, 10], flat: 0.25 },
    rest: { droop: 12, droop2: 14, gap: 0.004, from: 0.85, margin: 0.0012, ramp: 0.07 },
    reach: 0.97, notch: 0.04, notchPow: 0.85,
    pleat: { bind: 0.005, spread: 0.0015, fold: 0.002, plant: 0.0005 }, sag: { bind: 0.004, spread: 0.001, fold: 0.0015, plant: 0.0005 },
  },
  // pelvic: per side the spine and 5 soft rays, bases along a short transverse line on the pelvic base (s from the base
  // centre, z), each ray's direction as (phi: deg round the vertical, 0 back, 90 out; beta: deg down from horizontal);
  // the frenum's front edge on the midline (F); the cup curls down at its rim; its rays a `rayScale` of the others' girth
  // (round B2: the bind cup a shallow dish seen from the front, not the steep V of round B1 (beta 55–20°); fold: each ray
  // hugs the belly back from its root, `foldPhi` deg out from straight back, a short knuckle `foldLift` deg off the
  // skin, its lower face `foldMargin` HL off the skin (B067: folded flat, pressed under the chest; the halves within
  // |z| ≤ 0.10 HL)
  pelvic: {
    base: { s: [-0.045, -0.040, -0.035, -0.030, -0.025, -0.020], z: [0.050, 0.042, 0.034, 0.026, 0.018, 0.010], frontS: -0.055 },
    len: [0.17, 0.25, 0.30, 0.34, 0.36, 0.34], frenumLen: 0.08,
    phi: { bind: [105, 76, 54, 36, 20, 7], spread: [125, 95, 70, 47, 27, 10] },
    beta: { bind: [30, 26, 22, 19, 16, 13], spread: [34, 30, 26, 22, 19, 16] },
    frenum: { bind: [180, 45], spread: [180, 55] },
    foldPhi: [7, 5, 3.5, 2.5, 1.5, 0.6], foldLift: 18, foldMargin: 0.0003,
    curl: { bind: 8, spread: 8, fold: 0 },
    frenumReach: 0.55, reach: 0.96, medialReach: 0.5, medialNotch: 0.12, notch: 0.03, notchPow: 0.85,
    rootDepth: 0.006, rayScale: 0.72,
    pleat: { bind: 0.004, spread: 0.0015, fold: 0.0015 }, sag: { bind: 0.003, spread: 0.001, fold: 0.0015 },
  },
  // the atlas mapping (uvMap): no ray slot narrower than this share of the mean
  uv: { minSlot: 0.15, lenPow: 1.5, flesh: 0.45 },
  // the single-sheet tier: its pleats and sags a share of the relief tier's (it has no ridges to pleat round)
  flat: { pleat: 0.3, pleatFold: 0.5, sag: 0.5, sagFold: 0.5 },
  // per tier: membrane columns between rays (sub), rows along the longest ray (nt; shorter rays proportionally fewer),
  // segments per half of a ray's lens (m: 2 diamond, 3 hexagon, 4 with branches), relief false = a single sheet
  tiers: {
    hero: {
      Fin_Dorsal1: { relief: true, m: 3, sub: 3, nt: 38 },
      Fin_Dorsal2: { relief: true, m: 4, sub: 2, nt: 22 },
      Fin_Anal: { relief: true, m: 4, sub: 2, nt: 20 },
      Fin_Caudal: { relief: true, m: 4, sub: 2, nt: 20 },
      Fin_Pectoral_L: { relief: true, m: 4, sub: 2, nt: 14 },
      Fin_Pectoral_R: { relief: true, m: 4, sub: 2, nt: 14 },
      Fin_Pelvic: { relief: true, m: 4, sub: 2, nt: 16 },
    },
    lod1: {
      Fin_Dorsal1: { relief: false, sub: 2, nt: 14 },
      Fin_Dorsal2: { relief: false, sub: 2, nt: 11 },
      Fin_Anal: { relief: false, sub: 2, nt: 10 },
      Fin_Caudal: { relief: false, sub: 1, nt: 14 },
      Fin_Pectoral_L: { relief: false, sub: 2, nt: 11 },
      Fin_Pectoral_R: { relief: false, sub: 2, nt: 11 },
      Fin_Pelvic: { relief: false, sub: 2, nt: 9 },
    },
  },
};

/**
 * The fin atlas (2048², px [x, y, w, h], v down): each fin's rect, the pectorals sharing one (left and right are
 * mirror images). Areas roughly by the fins' sizes; the iris' corner { x 1040, y 1552, w 480, h 480 } (gobyTiers
 * IRIS_RECT_2048) and a 16-px ring round it stay free.
 */
export const FIN_ATLAS = {
  Fin_Caudal: [0, 0, 1024, 768],
  Fin_Dorsal1: [1024, 0, 1024, 768],
  Fin_Pectoral_L: [0, 768, 1024, 512],
  Fin_Pectoral_R: [0, 768, 1024, 512],
  Fin_Pelvic: [1024, 768, 1024, 512],
  Fin_Dorsal2: [0, 1280, 1024, 384],
  Fin_Anal: [0, 1664, 1024, 384],
};
const ATLAS = 2048, INSET = 6;
export const IRIS_RECT = { x: 1040, y: 1552, w: 480, h: 480 };

// ------------------------------------------------------------------------------------------------ the body's field
const CTX = new WeakMap();
/** The body's field (HL) and the helpers that put fins on it, one per sculpt. */
function bodyContext(K) {
  if (CTX.has(K)) return CTX.get(K);
  const F = fishSDF(K), prof = trunkProfile(K);
  const f = (p) => F(p[0], p[1], p[2]);
  const e = 1e-4;
  const grad = (p) => {
    const [x, y, z] = p;
    return [(F(x + e, y, z) - F(x - e, y, z)) / (2 * e), (F(x, y + e, z) - F(x, y - e, z)) / (2 * e), (F(x, y, z + e) - F(x, y, z - e)) / (2 * e)];
  };
  // the skin along a ray from an inside point (bisection)
  const along = (p0, dir, maxD = 1) => {
    // (from a point inside: if p0 is outside, start from the first inside point behind it)
    let a = 0, b = maxD;
    if (f(p0) >= 0) { let back = 0; while (back < maxD && f(add(p0, mul(dir, -back))) >= 0) back += 0.002; a = -back; }
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(add(p0, mul(dir, m))) < 0) a = m; else b = m; }
    return add(p0, mul(dir, (a + b) / 2));
  };
  // Newton onto the zero set
  const project = (p, steps = 12) => {
    let q = p.slice();
    for (let i = 0; i < steps; i++) {
      const d = f(q), g = grad(q), gg = dot(g, g) || 1;
      q = sub(q, mul(g, d / gg));
      if (Math.abs(d) < 1e-7) break;
    }
    return q;
  };
  /** A point under the skin: onto the surface, then `depth` in along the field's gradient. */
  const root = (p, depth) => { const q = project(p); return sub(q, mul(nrm(grad(q)), depth)); };
  // the skin on the midline (dorsal up = 1, ventral -1), tabulated
  const S0 = 0.8, S1 = 4.3, DS = 0.005, NS = Math.round((S1 - S0) / DS);
  const mid = { 1: new Float64Array(NS + 1), [-1]: new Float64Array(NS + 1) };
  // (behind the peduncle's end the skin's last section runs on, level)
  const sEnd = K.tailEnd.s - 0.03;
  for (const up of [1, -1])
    for (let i = 0; i <= NS; i++) {
      const s = S0 + i * DS, yc = prof.at(Math.max(s, 1.05)).yc;
      mid[up][i] = s <= sEnd ? along([s, yc, 0], [0, up, 0], 0.8)[1] : mid[up][i - 1];
    }
  const midY = (s, up) => {
    const x = clamp((s - S0) / DS, 0, NS - 1e-9), i = Math.floor(x), t = x - i;
    return lerp(mid[up][i], mid[up][i + 1], t);
  };
  /** The midline skin's frame at s: T along it (towards +s), O its outward normal (both in the s-y plane). */
  const midFrame = (s, up) => {
    const h = 0.01, sl = (midY(s + h, up) - midY(s - h, up)) / (2 * h);
    const T = nrm([1, sl, 0]);
    return { y: midY(s, up), T, O: up > 0 ? nrm([-sl, 1, 0]) : nrm([sl, -1, 0]) };
  };
  /** Newton onto the iso-surface f = c (HL) from a point near it. */
  const toLevel = (p, c, steps = 6) => {
    let q = p.slice();
    for (let i = 0; i < steps; i++) {
      const d = f(q) - c, g = grad(q), gg = dot(g, g) || 1;
      q = sub(q, mul(g, d / gg));
      if (Math.abs(d) < 1e-7) break;
    }
    return q;
  };
  const ctx = { K, F, f, grad, along, project, root, toLevel, prof, midY, midFrame };
  /** The body without the pectoral arms (their field moved far away): the trunk's flank the folded blade lies on. */
  let bare = null;
  ctx.bare = () => {
    if (!bare) {
      const P = K.pectoral, far = (p) => [p[0], p[1], 10];
      const K2 = { ...K, pectoral: { ...P, shoulder: far(P.shoulder), elbow: far(P.elbow), wrist: far(P.wrist), root: null } };
      bare = bodyContext(K2);
    }
    return bare;
  };
  CTX.set(K, ctx);
  return ctx;
}

// ------------------------------------------------------------------------------------------------ the fins
const rayProfile = (kind) => FIN_SCULPT.ray[kind === 'spine' ? 'spine' : kind === 'proc' ? 'proc' : 'soft'];

/** D1, D2 and the anal fin: rays on the keel's crest, standing at angles from the skin's tangent. */
function medianDef(key, name, ctx) {
  const S = FIN_SCULPT[key], K = ctx.K, B = FIN_SCULPT.base;
  const dorsal = key !== 'anal', up = dorsal ? 1 : -1;
  const keel = K.keels[S.keel];
  const n = S.len.length;
  const s0 = keel.s[0] + S.inset[0], s1 = keel.s[1] - S.inset[1];
  const rays = S.len.map((L, k) => {
    const s = lerp(s0, s1, k / (n - 1));
    const fr = ctx.midFrame(s, up);
    const skin = [s, fr.y, 0];
    const base = sub(skin, mul(fr.O, B.depth));
    return { base, len: L, kind: k < S.spines ? 'spine' : 'soft', T0: fr.T, O0: fr.O, simple: k < S.spines };
  });
  const angleOf = (state, k) => {
    const st = state in S.angle ? state : 'bind';
    if (k < S.spines && S.spineAngle && S.spines === 1) return S.spineAngle[st];
    const k0 = S.spines === 1 ? 1 : 0, x = (k - k0) / (n - 1 - k0);
    // (the fan's front opens wider than its back: `anglePow` > 1 spreads the front rays' angles)
    return lerp(S.angle[st][1], S.angle[st][0], Math.pow(1 - x, S.anglePow?.[st] ?? 1));
  };
  const state = (st, k) => {
    const r = rays[k], a = angleOf(st, k) * DEG;
    if (st === 'fold') {
      // the folded ray hugs the skin: at every point its direction is the local tangent turned out by the fold angle,
      // after a short knuckle at its root that lifts it clear of the skin (the folded rays lie shingled, each over the
      // next, not pressed into one layer)
      return { hug: (p, l) => { const fr = ctx.midFrame(p[0], up), b = lerp((S.foldLift ?? FIN_SCULPT.fold.lift) * DEG, a, smoothstep(0, FIN_SCULPT.fold.knuckle, l)); return add(mul(fr.T, Math.cos(b)), mul(fr.O, Math.sin(b))); } };
    }
    const sb = S.bend[st in S.bend ? st : 'bind'];
    return { dir: add(mul(r.T0, Math.cos(a)), mul(r.O0, Math.sin(a))), bend: { toward: r.T0, angle: sb * DEG } };
  };
  const panels = rays.slice(1).map(() => ({ reach0: S.reach, reach1: S.reach, flat0: S.flatReach, flat1: S.flatReach, notch: S.notch, flatNotch: S.flatNotch, notchPow: S.notchPow }));
  return {
    name, type: 'median', dorsal, joint: 'spine', rect: FIN_ATLAS[name], rays, panels,
    targets: ['fold', 'spread'], state, hint: () => [0, 0, 1], pleat: S.pleat, sag: S.sag,
  };
}

/**
 * The peduncle's end plate as the body's field has it (HL): its face's s at mid-depth, the dorsal and ventral ends of
 * its face (where the skin's end bends forward past `bendS` from the face: the corners' rounding), and the face's s and
 * the body's half-width at a height y (just in front of the face).
 */
function endPlate(ctx) {
  const K = ctx.K, q = ctx.prof.at(K.caudalBase);
  const s0 = K.caudalBase - 0.12;
  const faceS = (y) => (ctx.f([s0, y, 0]) >= 0 ? null : ctx.along([s0, y, 0], [1, 0, 0], 0.5)[0]);
  const mid = faceS(q.yc);
  // the face's extent: from the middle up and down while the end stays within bendS of the middle's s (the corners)
  const bendS = 0.012;
  const edge = (dir) => {
    let a = q.yc, b = q.yc + dir * 0.6;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2, s = faceS(m); if (s !== null && s > mid - bendS) a = m; else b = m; }
    return a;
  };
  const halfW = (y, s) => { const p = [s, y, 0]; return ctx.f(p) >= 0 ? 0 : ctx.along(p, [0, 0, 1], 0.4)[2]; };
  return { mid, top: edge(1), bottom: edge(-1), faceS, halfW, yc: q.yc, depth: q.yT - q.yB };
}

/** The caudal fin: procurrent rays along the peduncle's edges, the principal rays from its end plate. */
function caudalDef(ctx) {
  const S = FIN_SCULPT.caudal, K = ctx.K, B = FIN_SCULPT.base;
  const plate = endPlate(ctx);
  // (a domed end has no flat face to speak of: then the fan spans `spanMin` of the depth either side of the axis, on the dome)
  const yTop = Math.max(plate.top - S.edge, plate.yc + S.spanMin * plate.depth), yBot = Math.min(plate.bottom + S.edge, plate.yc - S.spanMin * plate.depth);
  const rays = [];
  const proc = (up, j) => {
    const s = plate.mid + S.procS[j], fr = ctx.midFrame(s, up);
    return { base: sub([s, fr.y, 0], mul(fr.O, B.depth * 0.7)), len: S.procLen[up > 0 ? 'dorsal' : 'ventral'][j], kind: 'proc', simple: true, up, j, T0: fr.T, O0: fr.O };
  };
  const NP = S.procS.length;
  for (let j = 0; j < NP; j++) rays.push(proc(1, j));
  // the principal rays' bases straight down the plate's face (on a domed end: its curve), `depth` in from it; the
  // longest ray reaching tipS from its base along its bind direction
  const prof = (u) => (u < S.tipAt ? 1 - S.upperDrop[0] * ((S.tipAt - u) / S.tipAt) ** S.upperDrop[1]
    : 1 - S.lowerDrop[0] * ((u - S.tipAt) / (1 - S.tipAt)) ** S.lowerDrop[1]);
  const kTip = Math.round(S.tipAt * (S.principal - 1)), aTip = lerp(S.angle.bind[0], S.angle.bind[1], kTip / (S.principal - 1)) * DEG;
  const bases = [];
  for (let k = 0; k < S.principal; k++) {
    const u = k / (S.principal - 1), y = lerp(yTop, yBot, u);
    const fs = plate.faceS(y) ?? plate.mid;
    bases.push({ base: [fs - B.depth, y, 0], u, hw: plate.halfW(y, fs - B.depth) });
  }
  const maxLen = (S.tipS - bases[kTip].base[0]) / Math.cos(aTip) / prof(bases[kTip].u);
  for (let k = 0; k < S.principal; k++) {
    const { base, u, hw } = bases[k];
    rays.push({ base, len: maxLen * prof(u), kind: 'soft', simple: k === 0 || k === S.principal - 1, thick: k >= S.principal - S.thick, u, flesh: { h: Math.max(0, Math.min(S.flesh.k * hw, hw - 0.0025)), over: S.flesh.over, hold: S.flesh.hold, swell: S.flesh.swell, w: (S.flesh.w * (yTop - yBot)) / (S.principal - 1) } });
  }
  for (let j = NP - 1; j >= 0; j--) rays.push(proc(-1, j));
  const state = (st, k) => {
    const r = rays[k], key = st in S.angle ? st : 'bind';
    let spec;
    if (r.kind === 'proc') {
      const A = S.procAngle[key], a = lerp(A[0], A[1], r.j / (NP - 1)) * DEG, up = r.up;
      spec = st === 'fold'
        ? { hug: (p, l) => { const fr = ctx.midFrame(p[0], up), b = lerp(FIN_SCULPT.fold.lift * DEG, a, smoothstep(0, FIN_SCULPT.fold.knuckle, l)); return add(mul(fr.T, Math.cos(b)), mul(fr.O, Math.sin(b))); } }
        : { dir: add(mul(r.T0, Math.cos(a)), mul(r.O0, Math.sin(a))) };
    } else {
      const a = lerp(S.angle[key][0], S.angle[key][1], r.u) * DEG;
      spec = { dir: [Math.cos(a), Math.sin(a), 0] };
    }
    if (st === 'flex') spec.curl = { toward: [0, 0, 1], angle: S.flex * DEG, pow: 1.6 };
    return spec;
  };
  const panels = [];
  for (let k = 0; k + 1 < rays.length; k++) {
    const rr = (r) => (r.kind === 'proc' ? S.procReach : S.reach);
    panels.push({ reach0: rr(rays[k]), reach1: rr(rays[k + 1]), notch: S.notch, notchPow: S.notchPow });
  }
  return {
    name: 'Fin_Caudal', type: 'caudal', joint: 'spine', rect: FIN_ATLAS.Fin_Caudal, rays, panels,
    targets: ['fold', 'spread', 'flex'], state, hint: () => [0, 0, 1], pleat: S.pleat, sag: S.sag, segScale: S.segScale, rowPow: 1.3,
    plate: { s: plate.mid, top: plate.top, bottom: plate.bottom },
    cardRays: [0, NP, NP + S.tipAt * (S.principal - 1), NP + S.principal - 1, rays.length - 1],
  };
}

// ---- small rotation helpers (3×3 as rows; the arm's rest pose)
const m3 = {
  /** R with R·a[i] = b[i] for two orthonormal frames (rows a[0..2], b[0..2]): Σ b_i a_iᵀ. */
  between: (a, b) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[0][c] * b[0][r] + a[1][c] * b[1][r] + a[2][c] * b[2][r])),
  apply: (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)],
  T: (R) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => R[c][r])),
  mul: (A, B) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c])),
  /** the unit quaternion [x, y, z, w] of a rotation matrix */
  quat: (R) => {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s, s / 4]; }
    else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; q = [s / 4, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s, (R[2][1] - R[1][2]) / s]; }
    else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; q = [(R[0][1] + R[1][0]) / s, s / 4, (R[1][2] + R[2][1]) / s, (R[0][2] - R[2][0]) / s]; }
    else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; q = [(R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, s / 4, (R[1][0] - R[0][1]) / s]; }
    const l = Math.hypot(...q);
    return q.map((c) => c / l);
  },
};
/** An orthonormal frame [u, n', u × n'] with n' the part of n square to u. */
const frameOf = (u, n) => { const a = nrm(u), b = nrm(perp(n, a)); return [a, b, cross(a, b)]; };
/** v turned about the unit axis by ang (rad, right hand). */
const rotAbout = (v, axis, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang), k = dot(axis, v);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, k * (1 - c)));
};
/** A fish-frame quaternion [x, y, z, w] in the object frame (anatomy.mjs toObject: (s, y, z) → (z, y, −s)). */
const quatToObject = (q) => [q[2], q[1], -q[0], q[3]];

/** A ray's lens at t: half-width w across the fin, half-thickness h through it (tapered; before the gap clamp). */
function lensHalf(def, r, t) {
  const pr = rayProfile(r.kind);
  const taper = 1 - (1 - (r.thick ? 0.85 : pr.tip)) * Math.pow(t, 0.9);
  const lead = r.lead ? 1.2 : r.thick ? 1.12 : 1, sc = def.rayScale ?? 1;
  return { w: pr.w * taper * lead * sc, h: pr.h * taper * lead * sc };
}

/**
 * The left arm's rest pose (A030, A040, B067), the frame the pectoral 'fold' is authored in: the upper arm swung back
 * about the shoulder until it lies along the flank `rest.droop` deg below the horizontal, its medial face `rest.gap` HL
 * off the trunk's skin all along (its thickness read from the sculpt: radius × fl and the muscle belly), its broad face
 * against the flank; the forearm likewise, `rest.droop2` deg down, the elbow straightened to follow the flank; the wrist
 * at rest (the blade's fold is the blend shape). Returns the joints' rotations (fish frame: J_pec about the shoulder
 * from the bind, J_pecElbow local to it, J_pecWrist identity) and the wrist's rigid transform `to` (bind → rest) with
 * its inverse `from`.
 */
function restArmPose(ctx) {
  const K = ctx.K, P = K.pectoral, R = FIN_SCULPT.pectoral.rest, bare = ctx.bare();
  const S = P.shoulder, E0 = P.elbow, W0 = P.wrist;
  const L1 = len3(sub(E0, S)), L2 = len3(sub(W0, E0)), u1 = nrm(sub(E0, S)), u2 = nrm(sub(W0, E0));
  const nA = P.axes?.n ?? [0, 0, 1], fl = P.fl ?? [P.flat, P.flat, P.flat], bl = P.belly;
  const thick1 = (t) => (P.radius[0] + (P.radius[1] - P.radius[0]) * t + (bl ? bl.amp * Math.exp(-(((t - bl.at) / bl.w) ** 2)) : 0)) * (fl[0] + (fl[1] - fl[0]) * t);
  const thick2 = (t) => (P.radius[1] + (P.radius[2] - P.radius[1]) * t) * (fl[1] + (fl[2] - fl[1]) * t);
  // a segment from p0, `len` long, `droop` deg below the horizontal and turned in until its medial face is `gap` off
  // the flank at its tightest past `from` of its length (the upper arm's root half fans into the flank: the shoulder
  // sits on it, and the rig's halo carries the flank there)
  const lay = (p0, len, droop, thick, from) => {
    const at = (zc) => nrm([Math.cos(droop * DEG), -Math.sin(droop * DEG), zc]);
    const clearance = (zc) => { let m = Infinity; const d = at(zc); for (let i = 0; i <= 8; i++) { const t = from + (1 - from) * (i / 8); m = Math.min(m, bare.f(add(p0, mul(d, t * len))) - thick(t)); } return m - R.gap; };
    let a = -1.5, b = 1.5;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (clearance(m) < 0) a = m; else b = m; }
    return add(p0, mul(at(b), len));
  };
  const E = lay(S, L1, R.droop, thick1, R.from), W = lay(E, L2, R.droop2, thick2, 0);
  const nf1 = nrm(bare.grad(E));
  const Q1 = m3.between(frameOf(u1, nA), frameOf(sub(E, S), nf1));
  // (the elbow: the shortest turn from the forearm as the shoulder carried it onto the flank's line: its axis square to
  // the forearm, so the rig's elbow channels (flexion about n, bend about w) make it; no twist)
  const a2 = m3.apply(Q1, u2), b2 = nrm(sub(W, E)), ax = cross(a2, b2), sa = len3(ax);
  const Re = sa < 1e-9 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : (() => {
    const k = mul(ax, 1 / sa), ang = Math.atan2(sa, dot(a2, b2));
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => rotAbout(e, k, ang));
  })();
  // (rotAbout of the basis gives the columns; as rows: transpose)
  const Q2 = m3.mul(m3.T(Re), Q1);
  const QT = m3.T(Q2);
  const to = (x) => add(E, m3.apply(Q2, sub(x, E0)));
  const from = (y) => add(E0, m3.apply(QT, sub(y, E)));
  return { Q1, Q2, E, W, to, from, quats: { shoulder: m3.quat(Q1), elbow: m3.quat(m3.mul(m3.T(Q1), Q2)), wrist: [0, 0, 0, 1] } };
}

/** The pectoral blade (left; the right is built as its mirror image). */
function pectoralDef(ctx) {
  const S = FIN_SCULPT.pectoral, P = ctx.K.pectoral, PL = S.plant;
  // the lobe's frame at the wrist, as body.mjs builds the lobe: u along elbow→wrist, n through its thickness (the arm's
  // broad face normal, BODY_SCULPT.pectoral.axes.n: the lateral axis made perpendicular to the UPPER arm, which the
  // forearm, bent in the face's plane, shares), wv across its flat width (the trailing edge when the arm stands as a leg)
  const u = nrm(sub(P.wrist, P.elbow));
  const n = nrm(perp(P.axes?.n ?? [0, 0, 1], u));
  const wv = cross(n, u);
  const r = P.radius[2], N = S.rays, half = S.span * r;
  const lenAt = (x) => S.maxLen * (S.edgeLen + (1 - S.edgeLen) * Math.pow(Math.max(0, 1 - x * x), 0.7));
  const rays = [];
  for (let k = 0; k < N; k++) {
    const x = k / (N - 1);
    // straight across the spatulate wrist: from inside the lobe out along u to its end's skin, then `depth` in
    const skin = ctx.along(add(P.wrist, add(mul(u, -0.04), mul(wv, lerp(half, -half, x)))), u, 0.3);
    // (in along the lobe's axis, not the skin's normal: the bases stay on their straight line across the wrist however round
    // its end's corners are)
    const base = sub(skin, mul(u, S.depth));
    rays.push({ base, len: lenAt(2 * x - 1), kind: 'soft', simple: k === 0 || k === N - 1, lead: k === 0, x });
  }
  const fanDir = (deg) => add(mul(u, Math.cos(deg * DEG)), mul(wv, Math.sin(deg * DEG)));
  const toBindFrame = (F, v) => add(add(mul(u, dot(v, F[0])), mul(n, dot(v, F[1]))), mul(wv, dot(v, F[2])));

  // ---- plant: the planted forearm's frame (world: forward −s, up +y, out +z): from the vertical leg (u down, n out,
  // wv back) leaned `lean` forward and `splay` out; up, back and out read in it give the sole's plane and its rays'
  // toes in the bind's (u, n, wv)
  let F = [[0, -1, 0], [0, 0, 1], [1, 0, 0]];
  F = F.map((v) => rotAbout(v, [0, 0, 1], -PL.lean * DEG)).map((v) => rotAbout(v, [-1, 0, 0], PL.splay * DEG));
  const nS = nrm(toBindFrame(F, [0, 1, 0])), back = nrm(toBindFrame(F, [1, 0, 0])), out = nrm(toBindFrame(F, [0, 0, 1]));
  const mid = mul(add(rays[(N - 1) >> 1].base, rays[N >> 1].base), 0.5);
  const O = add(mid, mul(u, PL.heel));
  const plantRay = rays.map((ray) => {
    const din = fanDir(lerp(PL.inner[0], PL.inner[1], ray.x));
    const c = lerp(PL.sole[0], PL.sole[1], ray.x) * DEG;
    const toe = nrm(perp(add(mul(out, Math.cos(c)), mul(back, Math.sin(c))), nS));
    // the turn's start so that the ray, once turned, runs in the sole's plane: its height there is h0 + a·(din·nS) + I
    let I = 0;
    const M = 64;
    for (let i = 0; i < M; i++) I += (dot(slerp(din, toe, smoothstep(0, 1, (i + 0.5) / M)), nS) * PL.over) / M;
    const a = -(dot(sub(ray.base, O), nS) + I) / dot(din, nS);
    return { din, toe, at: Math.max(0.02, a) };
  });

  // ---- fold: in the arm's rest pose, hugging the bare trunk's flank
  const rest = restArmPose(ctx), bare = ctx.bare();
  const Dref = m3.apply(rest.Q2, u), Wref = m3.apply(rest.Q2, wv);
  const restSpace = { to: rest.to, from: rest.from, f: bare.f, grad: bare.grad };

  const state = (st, k) => {
    const ray = rays[k], x = ray.x;
    const fan = (key) => ({ dir: fanDir(lerp(S.fan[key][0], S.fan[key][1], x) + S.turn[key]), curl: { toward: mul(n, -1), angle: S.curl[key] * DEG, pow: 2 } });
    if (st === 'plant') {
      const pr = plantRay[k];
      return { dir: pr.din, turn: { to: pr.toe, at: pr.at, over: PL.over }, sole: pr.at + PL.over };
    }
    if (st === 'plantHalf') {
      // half way: every step's direction half way between the bind's and the plant's (the rays keep their length)
      const b = fan('bind'), pr = plantRay[k], L = ray.len;
      return {
        at: (l) => slerp(turnToward(b.dir, b.curl.toward, b.curl.angle * (l / L) ** 2), slerp(pr.din, pr.toe, smoothstep(pr.at, pr.at + PL.over, l)), 0.5),
      };
    }
    if (st === 'fold') {
      const a = lerp(S.fan.fold[0], S.fan.fold[1], x) * DEG, dk = add(mul(Dref, Math.cos(a)), mul(Wref, Math.sin(a)));
      const L = ray.len, pleat = S.pleat.fold * (k === 0 || k === N - 1 ? 0.5 : 1);
      const c0 = bare.f(rest.to(ray.base));
      return {
        hug: (p) => nrm(perp(dk, nrm(bare.grad(p)))),
        surface: (l) => { const t = l / L; return lerp(c0, lensHalf(def, ray, t).h + pleat * Math.pow(t, 0.8) + S.rest.margin, smoothstep(0, S.rest.ramp, l)); },
      };
    }
    return fan(st in S.fan ? st : 'bind');
  };
  const panels = rays.slice(1).map(() => ({ reach0: S.reach, reach1: S.reach, notch: S.notch, notchPow: S.notchPow }));
  const hintPlant = nrm(add(n, nS));
  const hint = (st) => (st === 'plant' || st === 'plantHalf' ? hintPlant : n);
  const def = {
    name: 'Fin_Pectoral_L', type: 'pectoral', side: 'L', joint: 'J_pecWristL', rect: FIN_ATLAS.Fin_Pectoral_L, rays, panels,
    targets: ['fold', 'spread', 'plant', 'plantMid'], state, hint, pleat: S.pleat, sag: S.sag, rowPow: 1.25,
    space: (st) => (st === 'fold' ? restSpace : null),
    cardRays: [0, (N - 1) / 2, N - 1], cardBend: (k) => Math.min(0.95, (plantRay[k].at + 0.5 * PL.over) / rays[k].len),
    rowBreaks: (k) => [0, 0.5, 1].map((f) => (plantRay[k].at + f * PL.over) / rays[k].len).filter((t) => t > 0.02 && t < 0.97),
    frame: { u, n, wv, wrist: P.wrist },
    plantFrame: { nS, back, out, O, rays: plantRay },
    rest,
  };
  return def;
}

/** The pelvic cup: the frenum's edge, the left spine and soft rays, the right ones mirrored, the frenum again. */
function pelvicDef(ctx) {
  const S = FIN_SCULPT.pelvic, PB = ctx.K.pelvicBase;
  const c0 = PB.c[0];
  const onBelly = (s, z) => ctx.root(ctx.along([s, PB.c[1] + 0.02, z], [0, -1, 0], 0.5), S.rootDepth);
  const one = (side) => S.len.map((L, i) => ({
    base: onBelly(c0 + S.base.s[i], side * S.base.z[i]), len: L, kind: i === 0 ? 'spine' : 'soft', simple: i === 0 || i === 1, side, i,
  }));
  const F = { base: onBelly(c0 + S.base.frontS, 0), len: S.frenumLen, kind: 'frenum', side: 0, i: -1 };
  const left = one(1), right = one(-1).reverse();
  const rays = [{ ...F }, ...left, ...right, { ...F, end: true }];
  const dirOf = (phi, beta, side) => [Math.cos(phi * DEG) * Math.cos(beta * DEG), -Math.sin(beta * DEG), side * Math.sin(phi * DEG) * Math.cos(beta * DEG)];
  const state = (st, k) => {
    const r = rays[k], key = st in S.phi ? st : 'bind';
    if (st === 'fold') {
      // back along the belly, hugging it: the skin's tangent turned `foldPhi` out, lifted `foldLift` off it over a short
      // knuckle, then held at the lens' thickness off the skin (the frenum straight back on the midline)
      const phi = (r.kind === 'frenum' ? 0 : S.foldPhi[r.i]) * DEG, side = r.side || 1, L = r.len;
      const pleat = S.pleat.fold * (r.kind === 'frenum' ? 0 : 1), c0 = ctx.f(r.base);
      return {
        hug: (p, l) => {
          const g = nrm(ctx.grad(p)), bk = nrm(perp([1, 0, 0], g)), ou = nrm(perp([0, 0, side], g));
          const a = lerp(S.foldLift * DEG, 0, smoothstep(0, FIN_SCULPT.fold.knuckle, l)), t = add(mul(bk, Math.cos(phi)), mul(ou, Math.sin(phi)));
          return nrm(add(mul(t, Math.cos(a)), mul(g, Math.sin(a))));
        },
        surface: (l) => { const t = l / L; return lerp(c0, (r.kind === 'frenum' ? 0.002 : lensHalf(defRef, r, t).h) + pleat * Math.pow(t, 0.8) + S.foldMargin, smoothstep(0, FIN_SCULPT.fold.knuckle * 1.5, l)); },
      };
    }
    if (r.kind === 'frenum') { const [phi, beta] = S.frenum[key]; return { dir: dirOf(phi, beta, 1) }; }
    const d = dirOf(S.phi[key][r.i], S.beta[key][r.i], r.side);
    return { dir: d, curl: { toward: [0, -1, 0], angle: S.curl[key] * DEG, pow: 2 } };
  };
  const nl = left.length;
  const panels = [];
  for (let k = 0; k + 1 < rays.length; k++) {
    const a = rays[k], b = rays[k + 1];
    if (a.kind === 'frenum') panels.push({ reach0: 1, reach1: S.frenumReach, notch: 0.05, notchPow: 1 });
    else if (b.kind === 'frenum') panels.push({ reach0: S.frenumReach, reach1: 1, notch: 0.05, notchPow: 1 });
    else if (k === nl) panels.push({ reach0: S.medialReach, reach1: S.medialReach, notch: S.medialNotch, notchPow: 1.2 });
    else panels.push({ reach0: S.reach, reach1: S.reach, notch: S.notch, notchPow: S.notchPow });
  }
  // the outer face of the cup: down and out from its middle
  const mid = [c0 + 0.12, PB.c[1] - 0.08, 0];
  const hint = () => [0, -1, 0];
  const hintAt = (p) => nrm(add([0, -1, 0], mul(nrm(sub(p, mid)), 0.6)));
  const defRef = {
    name: 'Fin_Pelvic', type: 'pelvic', joint: 'J_pelvic', rect: FIN_ATLAS.Fin_Pelvic, rays, panels,
    targets: ['fold', 'spread'], state, hint, hintAt, pleat: S.pleat, sag: S.sag, rayScale: S.rayScale,
    cardRays: [1, 3.5, nl + 0.5, 2 * nl - 2.5, 2 * nl],
  };
  return defRef;
}

/** The right pectoral: the left one mirrored (z → −z); its meshes are built from the left one's. */
function mirrorDef(L) {
  const m = (p) => [p[0], p[1], -p[2]];
  return {
    ...L, name: 'Fin_Pectoral_R', side: 'R', joint: 'J_pecWristR', rect: FIN_ATLAS.Fin_Pectoral_R,
    rays: L.rays.map((r) => ({ ...r, base: m(r.base) })), mirrorOf: L,
    frame: { u: m(L.frame.u), n: m(L.frame.n), wv: m(L.frame.wv), wrist: m(L.frame.wrist) },
  };
}

/**
 * The fins of the fish: [{ name, type 'median'|'caudal'|'pectoral'|'pelvic', side?, dorsal?, joint ('spine': follow the
 * axial chain, each ray at its base's s and the caudal at each vertex's s; else the joint's name), rect (FIN_ATLAS),
 * rays: [{ base [s,y,z] HL, dir (bind, unit), len HL, kind 'spine'|'soft'|'proc'|'frenum', simple }], targets }]
 * (and the internals buildFinMesh needs). K: the body's sculpt (its keels, lobe and pelvic base are read here).
 */
export function finDefinitions(K = BODY_SCULPT) {
  const ctx = bodyContext(K);
  const pecL = pectoralDef(ctx);
  const defs = [
    medianDef('d1', 'Fin_Dorsal1', ctx), medianDef('d2', 'Fin_Dorsal2', ctx), medianDef('anal', 'Fin_Anal', ctx),
    caudalDef(ctx), pecL, mirrorDef(pecL), pelvicDef(ctx),
  ];
  for (const d of defs) {
    Object.defineProperty(d, 'ctx', { value: ctx, enumerable: false });
    // the bind direction of every ray (its first step), for the rig (the blade joint's pivot) and the summary
    const src = d.mirrorOf ?? d;
    if (d.mirrorOf) Object.defineProperty(d.mirrorOf, 'ctx', { value: ctx, enumerable: false });
    const curves = rayCurves(src, 'bind');
    d.rays.forEach((r, k) => {
      const c = curves[k].pts;
      const dir = nrm(sub(c[Math.min(4, c.length - 1)], c[0]));
      r.dir = d.mirrorOf ? [dir[0], dir[1], -dir[2]] : dir;
    });
    if (d.type === 'pectoral' && !d.mirrorOf) pectoralExtras(d);
  }
  const R = defs.find((d) => d.mirrorOf);
  if (R) mirrorExtras(R);
  return defs;
}

/**
 * The left pectoral's data for the rig and the runtime (fish mm / fish-frame unit vectors, bind space):
 *   bladePivot  the heel (the middle rays' turn in 'plant', half way through it): the J_pecBlade pivot, the ankle the
 *               sole turns on (its flex axis: sole.axis)
 *   sole        the planted sole (blend shape 'plant' at 1): { normal (its plane's normal, away from the ground: the
 *               world's up once the rig stands the arm so), point (its centroid), heel (= bladePivot), axis (the heel
 *               line, across the rays), toe (its mean ray direction), lean / splay (deg: the forearm's posture it is
 *               flat in: leaned forward of the vertical and out, its broad face outward), heelHL (from the middle rays'
 *               bases), from: { rayT (per ray: the sole starts here) } }
 *   restPose    the arm's rest pose the 'fold' is authored in (restArmPose): local rotations as quaternions [x, y, z, w]
 *               about the joints' bind pivots, { fish: { J_pecL, J_pecElbowL, J_pecWristL }, object: { … } } (bind
 *               rotations are identity, so object-frame local = the viewer's / glTF's)
 */
function pectoralExtras(d) {
  const S = FIN_SCULPT.pectoral, PF = d.plantFrame, n = d.rays.length;
  const curves = rayCurves(d, 'plant');
  const mids = [(n - 1) >> 1, n >> 1];
  const heel = mul(mids.map((k) => curveAt(curves[k], (PF.rays[k].at + 0.5 * S.plant.over) / d.rays[k].len)).reduce((a, b) => add(a, b)), 0.5);
  let sum = [0, 0, 0], cnt = 0, toe = [0, 0, 0];
  const from = [];
  curves.forEach((c, k) => {
    const t0 = (PF.rays[k].at + S.plant.over) / d.rays[k].len;
    from.push(+Math.min(1, t0).toFixed(4));
    toe = add(toe, PF.rays[k].toe);
    for (let i = 0; i <= NSTEP; i++) if (i / NSTEP >= t0) { sum = add(sum, c.pts[i]); cnt++; }
  });
  const point = cnt ? mul(sum, 1 / cnt) : heel;
  const r4 = (v) => v.map((c) => +c.toFixed(4)), r6 = (v) => v.map((c) => +c.toFixed(6));
  d.bladePivot = mul(heel, HL);
  d.sole = {
    normal: r6(PF.nS), point: r4(mul(point, HL)), heel: r4(mul(heel, HL)), axis: r6(nrm(cross(d.frame.n, PF.nS))), toe: r6(nrm(toe)),
    lean: S.plant.lean, splay: S.plant.splay, heelHL: S.plant.heel, from: { rayT: from },
  };
  const q = d.rest.quats;
  d.restPose = {
    note: 'the arm\'s rest pose the pectoral fold is authored in (fins.mjs restArmPose): local rotations about the joints\' bind pivots',
    fish: { J_pecL: r6(q.shoulder), J_pecElbowL: r6(q.elbow), J_pecWristL: q.wrist },
    object: { J_pecL: r6(quatToObject(q.shoulder)), J_pecElbowL: r6(quatToObject(q.elbow)), J_pecWristL: q.wrist },
  };
}

/** The right pectoral's copies of the left's extras, mirrored (z → −z; rotations as axial vectors). */
function mirrorExtras(R) {
  const L = R.mirrorOf, mp = (p) => [p[0], p[1], -p[2]], mq = (q) => [-q[0], -q[1], q[2], q[3]];
  R.bladePivot = mp(L.bladePivot);
  R.sole = { ...L.sole, normal: mp(L.sole.normal), point: mp(L.sole.point), heel: mp(L.sole.heel), axis: mp(L.sole.axis), toe: mp(L.sole.toe) };
  const f = L.restPose.fish;
  const fish = { J_pecR: mq(f.J_pecL), J_pecElbowR: mq(f.J_pecElbowL), J_pecWristR: f.J_pecWristL };
  R.restPose = { note: L.restPose.note, fish, object: Object.fromEntries(Object.entries(fish).map(([k, q]) => [k, quatToObject(q)])) };
}

// ------------------------------------------------------------------------------------------------ ray curves
const NSTEP = 48;

/** The rays' centre lines in a state: integrated from their direction rules, kept off the body past the root, then
 * resampled at even arc length (a ray keeps its length in every state). */
function rayCurves(def, st) {
  const ctx = def.ctx, B = FIN_SCULPT.base;
  // (a state authored in another pose of the fish, the pectoral's fold in the arm's rest pose: its curves are built
  // there, against that pose's field, and carried back to the bind)
  const space = def.space?.(st) ?? null;
  const fF = space ? space.f : ctx.f, gF = space ? space.grad : ctx.grad;
  const toLevel = (p, c) => {
    let q = p;
    for (let it = 0; it < 6; it++) { const d = fF(q) - c, g = gF(q), gg = dot(g, g) || 1; q = sub(q, mul(g, d / gg)); if (Math.abs(d) < 1e-7) break; }
    return q;
  };
  return def.rays.map((r, k) => {
    const spec = def.state(st, k), L = r.len, dl = L / NSTEP;
    const prof = rayProfile(r.kind);
    const dirAt = (l, p) => {
      let d = spec.at ? spec.at(l, p) : spec.hug ? spec.hug(p, l) : spec.turn ? slerp(spec.dir, spec.turn.to, smoothstep(spec.turn.at, spec.turn.at + spec.turn.over, l)) : spec.dir;
      if (spec.bend) d = turnToward(d, spec.bend.toward, spec.bend.angle * (l / L));
      if (spec.curl) d = turnToward(d, spec.curl.toward, spec.curl.angle * (l / L) ** (spec.curl.pow ?? 2));
      return d;
    };
    let p = space ? space.to(r.base) : r.base.slice();
    const pts = [p];
    for (let i = 0; i < NSTEP; i++) {
      const half = add(p, mul(dirAt(i * dl, p), dl * 0.5));
      p = add(p, mul(dirAt((i + 0.5) * dl, half), dl));
      // (a hugging state: held at its height over the skin, step by step)
      if (spec.surface) p = toLevel(p, spec.surface((i + 1) * dl));
      pts.push(p);
    }
    // past the root: clear of the skin by the lens and a margin
    if (!spec.surface) {
      for (let i = 1; i <= NSTEP; i++) {
        const l = i * dl, c = (prof.w * 1.1 + B.clear) * smoothstep(0, B.ramp, l);
        let q = pts[i];
        for (let it = 0; it < 3; it++) {
          const d = fF(q);
          if (d >= c) break;
          q = add(q, mul(nrm(gF(q)), c - d));
        }
        pts[i] = q;
      }
    }
    // even arc length, the ray's own length
    const cum = [0];
    for (let i = 1; i <= NSTEP; i++) cum.push(cum[i - 1] + len3(sub(pts[i], pts[i - 1])));
    const out = [pts[0]];
    let j = 1;
    for (let i = 1; i <= NSTEP; i++) {
      const target = (i / NSTEP) * L;
      while (j < NSTEP && cum[j] < target) j++;
      if (cum[j] < target) {
        // (shorter than its length: run on along the last step)
        out.push(add(pts[NSTEP], mul(nrm(sub(pts[NSTEP], pts[NSTEP - 1])), target - cum[NSTEP])));
      } else {
        const f = (target - cum[j - 1]) / Math.max(1e-12, cum[j] - cum[j - 1]);
        out.push(lerp3(pts[j - 1], pts[j], f));
      }
    }
    return { pts: space ? out.map(space.from) : out, L };
  });
}
const curveAt = (c, t) => {
  const x = clamp(t, 0, 1) * NSTEP, i = Math.min(NSTEP - 1, Math.floor(x));
  return lerp3(c.pts[i], c.pts[i + 1], x - i);
};
const tangentAt = (c, t) => {
  const x = clamp(t, 0, 1) * NSTEP, i = Math.min(NSTEP - 1, Math.floor(x)), f = x - i;
  const a = sub(c.pts[i + 1], c.pts[i]);
  const i2 = f < 0.5 ? Math.max(0, i - 1) : Math.min(NSTEP - 1, i + 1);
  const b = sub(c.pts[i2 + 1], c.pts[i2]);
  const w = f < 0.5 ? 0.5 - f : f - 0.5;
  return nrm(lerp3(a, b, i2 === i ? 0 : w));
};

/** A state's sampler: the frame of every ray at t (centre line with its pleat, normal N through the fin, B across it
 * towards the next ray, the lens' half-width and thickness) and the membrane between two rays. */
/** The fin's normal at ray k, t: square to the ray and to the line through its neighbours, on the hint's side. */
function finNormal(def, curves, st, k, t) {
  const n = def.rays.length, C = curveAt(curves[k], t), T = tangentAt(curves[k], t);
  const Cp = k > 0 ? curveAt(curves[k - 1], t) : null, Cn = k < n - 1 ? curveAt(curves[k + 1], t) : null;
  let N = cross(T, sub(Cn ?? C, Cp ?? C));
  const hint = def.hintAt ? def.hintAt(C) : def.hint(st);
  if (len3(N) < 1e-9) N = perp(hint, T);
  N = nrm(N);
  if (dot(N, hint) < 0) N = mul(N, -1);
  return { C, T, N, Cp, Cn };
}

/** Which side of every ray (N × T or its opposite) faces the next ray, from the bind half way up. */
function bSigns(def) {
  if (def._bSign) return def._bSign;
  const curves = rayCurves(def, 'bind'), n = def.rays.length;
  const out = def.rays.map((r, k) => {
    const { C, T, N, Cp, Cn } = finNormal(def, curves, 'bind', k, 0.5);
    const toward = Cn ? sub(Cn, C) : sub(C, Cp);
    return dot(cross(N, T), perp(toward, T)) >= 0 ? 1 : -1;
  });
  Object.defineProperty(def, '_bSign', { value: out, enumerable: false });
  return out;
}

function sampler(def, st, flat = false) {
  const curves = rayCurves(def, st), n = def.rays.length, R = FIN_SCULPT.ray;
  const FL = FIN_SCULPT.flat;
  const pleatAmp = (def.pleat[st] ?? def.pleat.bind) * (flat ? (st === 'fold' ? FL.pleatFold : FL.pleat) : 1), sagAmp = (def.sag[st] ?? def.sag.bind) * (flat ? (st === 'fold' ? FL.sagFold : FL.sag) : 1);
  const bSign = bSigns(def);
  const specs = def.rays.map((r, k) => def.state(st, k));
  const frame = (k, t, joint = 0) => {
    const r = def.rays[k];
    const { C, T, N, Cp, Cn } = finNormal(def, curves, st, k, t);
    // B: across the ray towards the next one; its side is fixed per ray (from the bind) so no state twists a lens
    let Bv = mul(nrm(cross(N, T)), bSign[k]);
    // at the root the lens lies along the base line (on the skin), turning square to the ray within `along` of it
    const l = t * r.len;
    if (l < FIN_SCULPT.base.along) {
      const bp = k > 0 ? def.rays[k - 1].base : r.base, bn = k < n - 1 ? def.rays[k + 1].base : r.base;
      let Bb = perp(sub(bn, bp), N);
      if (len3(Bb) > 1e-9) {
        Bb = nrm(Bb);
        if (dot(Bb, Bv) < 0) Bb = mul(Bb, -1);
        Bv = nrm(lerp3(Bb, Bv, smoothstep(0, FIN_SCULPT.base.along, l)));
      }
    }
    // the lens: tapered, narrower at the joints, never wider than its share of the gap to a neighbour
    const pr = rayProfile(r.kind);
    let { w, h } = lensHalf(def, r, t);
    if (joint) { const sg = (pr.seg ?? 0) * (def.segScale ?? 1); w *= 1 - sg; h *= 1 - sg; }
    // (the ridge rises out of the skin: lower at the very root)
    h *= 0.5 + 0.5 * smoothstep(0, FIN_SCULPT.base.along, t * r.len);
    let gap = Infinity;
    for (const O of [Cp, Cn]) if (O) gap = Math.min(gap, len3(perp(sub(O, C), T)));
    if (gap < Infinity && w > R.gap * gap) { const s = (R.gap * gap) / w; w *= s; h *= Math.max(0.6, s); }
    // (the caudal's fleshy base: the peduncle's skin running on over the ray roots, as thick as the plate)
    let box = 0;
    if (r.flesh && !flat) {
      // (held over the face's rounded rim, swelling a little past it so the rim hides under it, then easing out)
      const e = 1 - smoothstep(r.flesh.hold, r.flesh.over, l), sw = 1 + r.flesh.swell * smoothstep(0, r.flesh.hold, l);
      if (e > 0) { h = Math.max(h, r.flesh.h * sw * e); w = Math.max(w, Math.min(r.flesh.w, 0.49 * gap) * e); box = e; }
    }
    // (the planted sole: the rays pressed flat on their ground side)
    const press = specs[k].sole !== undefined && l > specs[k].sole ? FIN_SCULPT.pectoral.plant.flat : 1;
    // the pleat: the rays alternately to either side, growing to the tip (the edge rays half)
    const sg = (k % 2 ? 1 : -1) * (k === 0 || k === n - 1 || r.kind === 'frenum' ? 0.5 : 1) * (r.kind === 'frenum' ? 0 : 1);
    const Cq = add(C, mul(N, sg * pleatAmp * Math.pow(t, 0.8)));
    return { C: Cq, T, N, B: Bv, w, h, press, box };
  };
  /** The membrane of panel k (between rays k and k+1) at f across it and tau up it (its edges e0, e1 at tk, tj on the rays). */
  const membrane = (k, f, tau, tk, tj, e0, e1, baseFix) => {
    const F0 = frame(k, tk), F1 = frame(k + 1, tj);
    let p = lerp3(e0, e1, f);
    const Np = nrm(add(F0.N, F1.N));
    p = add(p, mul(Np, (k % 2 ? 1 : -1) * sagAmp * Math.sin(Math.PI * f) * Math.pow(tau, 0.9)));
    if (baseFix) p = add(p, mul(baseFix, 1 - smoothstep(0, 0.15, tau)));
    return { p, N: Np };
  };
  return { curves, frame, membrane, n };
}

// ------------------------------------------------------------------------------------------------ topology
const LENS = 0, TIP = 1, EDGE = 2, MEM = 3, COL = 4;

/** Rows along a ray: n even steps (t = u^pow) and the breakpoints (where membranes end) exactly. */
function makeRows(n, breaks, pow = 1) {
  const ts = [];
  for (let j = 0; j <= n; j++) ts.push(Math.pow(j / n, pow));
  const br = breaks.filter((b) => b > 1e-6 && b < 1 - 1e-6);
  const keep = ts.filter((t) => !br.some((b) => Math.abs(t - b) < 0.45 / n));
  const all = [...keep, ...br].sort((a, b) => a - b);
  return all.filter((t, i) => i === 0 || t - all[i - 1] > 1e-6);
}

/** Lens cross-section (unit, at rest): q = 0 at −B, over +N to q = m at +B, back under −N. */
const ringXY = (q, m) => { const ph = Math.PI - (q * Math.PI) / m; return [Math.cos(ph), Math.sin(ph)]; };

/** The mesh's topology for the options (relief, m, sub, nt): vertex records and triangles. */
function layout(def, o) {
  const relief = !!o.relief, m = relief ? (o.m ?? 3) : 0, sub = Math.max(1, o.sub ?? 2), nt = o.nt ?? 16;
  const n = def.rays.length, Lmax = Math.max(...def.rays.map((r) => r.len)), uvH = FIN_SCULPT.ray.uvHalf;
  const V = [], tris = [];
  const vert = (v) => { V.push(v); return V.length - 1; };
  const reachOf = (p, side) => (relief ? (side ? p.reach1 : p.reach0) : (side ? (p.flat1 ?? p.reach1) : (p.flat0 ?? p.reach0)));
  const hasLens = (k) => relief && def.rays[k].kind !== 'frenum';
  const rows = def.rays.map((r, k) => {
    const nk = Math.max(o.nmin ?? 3, Math.round((nt * r.len) / Lmax));
    const br = [];
    if (k > 0) br.push(reachOf(def.panels[k - 1], 1));
    if (k < n - 1) br.push(reachOf(def.panels[k], 0));
    // (rows of its own where a ray bends in some state: the planted blade's heel)
    if (def.rowBreaks) br.push(...def.rowBreaks(k));
    return makeRows(nk, br, def.rowPow ?? 1);
  });
  // the rays: lens tubes (relief); a plain ray is a column of each panel beside it
  const ring = [];
  def.rays.forEach((r, k) => {
    const pr = rayProfile(r.kind);
    const ts = rows[k];
    if (hasLens(k)) {
      const rings = [];
      let parity = 0;
      // (no ring at t = 1: the lens closes onto its tip there)
      const rts = ts.filter((t) => t < 1 - 1e-9);
      rts.forEach((t, i) => {
        const joint = r.kind === 'soft' && t > (pr.segStart ?? 1) && i < rts.length - 1 ? (parity++ % 2) : 0;
        const ids = [];
        for (let q = 0; q < 2 * m; q++) ids.push(vert({ type: LENS, k, t, q, joint, a: k + uvH * ringXY(q, m)[0] }));
        rings.push({ t, ids, joint });
      });
      const tip = vert({ type: TIP, k, t: 1, a: k });
      for (let i = 0; i + 1 < rings.length; i++)
        for (let q = 0; q < 2 * m; q++) {
          const a = rings[i].ids[q], b = rings[i].ids[(q + 1) % (2 * m)], c = rings[i + 1].ids[(q + 1) % (2 * m)], d = rings[i + 1].ids[q];
          tris.push(a, b, c, a, c, d);
        }
      const lr = rings[rings.length - 1];
      for (let q = 0; q < 2 * m; q++) tris.push(lr.ids[q], lr.ids[(q + 1) % (2 * m)], tip);
      ring[k] = rings;
    }
  });
  // the membranes: per panel, its edge columns (copies of the lens edges, or the shared plain columns) and sub-1
  // columns between, zipped together
  // (a plain column is copied per panel too: the sheet creases at every ray, as a pleated fin does, and its normals
  // do not average across the crease)
  const edgeColumn = (k, side, reach) => {
    if (!hasLens(k)) return rows[k].filter((t) => t <= reach + 1e-9).map((t) => ({ t, id: vert({ type: COL, k, t, a: k }) }));
    const q = side > 0 ? m : 0;
    return ring[k].filter((rg) => rg.t <= reach + 1e-9).map((rg) => ({ t: rg.t, id: vert({ type: EDGE, k, side, t: rg.t, joint: rg.joint, q, a: k + side * uvH }) }));
  };
  // (a membrane's rows join its two rays at equal distances from their roots, up to the shorter ray's reach, then fan
  // out to the longer one's: folded, with the rays side by side, the sheet never turns over)
  const panelL = [];
  def.panels.forEach((p, k) => {
    const r0 = reachOf(p, 0), r1 = reachOf(p, 1);
    const La = def.rays[k].len, Lb = def.rays[k + 1].len;
    const L0 = La * r0, L1 = Lb * r1, Lm = Math.max(L0, L1);
    panelL[k] = { L0, L1, Lm };
    const tau = (col, L) => col.map((v) => ({ id: v.id, t: (v.t * L) / Lm }));
    const c0 = tau(edgeColumn(k, 1, r0), La), c1 = tau(edgeColumn(k + 1, -1, r1), Lb);
    const notch = relief ? p.notch : (p.flatNotch ?? p.notch);
    const a0 = hasLens(k) ? k + uvH : k, a1 = hasLens(k + 1) ? k + 1 - uvH : k + 1;
    const nLong = Math.max(c0.length, c1.length) - 1;
    const cols = [c0];
    for (let c = 1; c < sub; c++) {
      const f = c / sub, E = 1 - notch * Math.pow(Math.sin(Math.PI * f), p.notchPow ?? 1);
      const cnt = Math.max(2, Math.round(nLong * E));
      const pow = def.rowPow ?? 1;
      const col = [];
      for (let j = 0; j <= cnt; j++) {
        const tau = E * Math.pow(j / cnt, pow);
        const t = lerp(Math.min(tau * Lm, L0) / La, Math.min(tau * Lm, L1) / Lb, f);
        col.push({ t: tau, id: vert({ type: MEM, k, f, tau, t, a: lerp(a0, a1, f) }) });
      }
      cols.push(col);
    }
    cols.push(c1);
    for (let c = 0; c + 1 < cols.length; c++) zipper(cols[c], cols[c + 1], tris);
  });
  return { V, tris, relief, m, sub, nt, n, panelL };
}

/** Triangles between two columns of rows (each from its base at 0 up to its own top), by their distance up the panel. */
function zipper(A, B, tris) {
  const nA = A.length - 1, nB = B.length - 1;
  const pa = (i) => A[i].t, pb = (j) => B[j].t;
  let i = 0, j = 0;
  while (i < nA || j < nB) {
    if (j >= nB || (i < nA && pa(i + 1) <= pb(j + 1))) { tris.push(A[i].id, B[j].id, A[i + 1].id); i++; }
    else { tris.push(A[i].id, B[j].id, B[j + 1].id); j++; }
  }
}

// ------------------------------------------------------------------------------------------------ evaluation
/** Every vertex of the layout in a state (HL), with its base point and its reference direction (for winding). */
function evaluate(def, lay, st) {
  const S = sampler(def, st, !lay.relief), { V } = lay, B = FIN_SCULPT.base, ctx = def.ctx;
  const nV = V.length, P = new Float64Array(nV * 3), ref = new Float64Array(nV * 3), base = new Float64Array(nV * 3);
  const m = lay.m;
  // the membrane's root between two rays: on the skin like the rays' (fixed in every state)
  if (!def._roots) Object.defineProperty(def, '_roots', { value: new Map(), enumerable: false });
  const rootCache = def._roots;
  const memRoot = (k, f) => {
    const key = `${k}:${f.toFixed(5)}`;
    if (!rootCache.has(key)) {
      const a = def.rays[k].base, b = def.rays[k + 1].base;
      rootCache.set(key, def.type === 'pectoral'
        ? lerp3(a, b, f) : ctx.root(lerp3(a, b, f), B.depth));
    }
    return rootCache.get(key);
  };
  const lensPoint = (k, t, q, joint) => {
    const F = S.frame(k, t, joint), r = def.rays[k];
    let [x, y] = ringXY(q, m);
    // the branches: the ridge widens and its crest splits (four segments to an arc)
    const pr = rayProfile(r.kind);
    if (m === 4 && r.kind === 'soft' && !r.simple && t > pr.branch) {
      const b = smoothstep(pr.branch, Math.min(1, pr.branch + 0.18), t);
      const qq = q % 4;
      const wide = 1 + 0.45 * b;
      if (qq === 1 || qq === 3) { x = Math.sign(x) * lerp(Math.SQRT1_2, 0.55, b) * wide; y = Math.sign(y) * lerp(Math.SQRT1_2, 1, b); }
      else if (qq === 2) y *= 1 - 0.85 * b;
      else x *= wide;
    }
    if (F.press < 1 && y < 0) y *= F.press;
    // (the caudal's fleshy base: the lens squared off towards a box, so the root lenses close up into one slab)
    if (F.box > 0) { const k = 1 - 0.6 * F.box; x = Math.sign(x) * Math.abs(x) ** k; y = Math.sign(y) * Math.abs(y) ** k; }
    return { p: add(F.C, add(mul(F.B, x * F.w), mul(F.N, y * F.h))), F };
  };
  for (let i = 0; i < nV; i++) {
    const v = V[i];
    let p, rf, b;
    if (v.type === LENS) {
      const { p: q, F } = lensPoint(v.k, v.t, v.q, v.joint);
      p = q; rf = sub(q, F.C); b = def.rays[v.k].base;
    } else if (v.type === TIP) {
      const F = S.frame(v.k, 1);
      p = F.C; rf = F.T; b = def.rays[v.k].base;
    } else if (v.type === EDGE) {
      const { p: q, F } = lensPoint(v.k, v.t, v.q, v.joint);
      p = q; rf = F.N; b = def.rays[v.k].base;
    } else if (v.type === COL) {
      const F = S.frame(v.k, v.t);
      p = F.C; rf = F.N; b = def.rays[v.k].base;
    } else {
      // membrane between the edges of rays k and k+1, at equal distances from their roots
      const k = v.k, PL = lay.panelL[k];
      const tk = Math.min(v.tau * PL.Lm, PL.L0) / def.rays[k].len, tj = Math.min(v.tau * PL.Lm, PL.L1) / def.rays[k + 1].len;
      const e0 = lay.relief && def.rays[k].kind !== 'frenum' ? lensPoint(k, tk, m, 0).p : S.frame(k, tk).C;
      const e1 = lay.relief && def.rays[k + 1].kind !== 'frenum' ? lensPoint(k + 1, tj, 0, 0).p : S.frame(k + 1, tj).C;
      const root = memRoot(k, v.f);
      const b0 = lay.relief && def.rays[k].kind !== 'frenum' ? lensPoint(k, 0, m, 0).p : S.frame(k, 0).C;
      const b1 = lay.relief && def.rays[k + 1].kind !== 'frenum' ? lensPoint(k + 1, 0, 0, 0).p : S.frame(k + 1, 0).C;
      const fix = sub(root, lerp3(b0, b1, v.f));
      const M = S.membrane(k, v.f, v.tau, tk, tj, e0, e1, fix);
      p = M.p; rf = M.N; b = root;
    }
    P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
    ref[i * 3] = rf[0]; ref[i * 3 + 1] = rf[1]; ref[i * 3 + 2] = rf[2];
    base[i * 3] = b[0]; base[i * 3 + 1] = b[1]; base[i * 3 + 2] = b[2];
  }
  // nothing inside the body away from the root (a state authored in another pose: against that pose's body, there)
  const space = def.space?.(st) ?? null, fF = space ? space.f : ctx.f, gF = space ? space.grad : ctx.grad;
  const cache = new Map();
  for (let i = 0; i < nV; i++) {
    let p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const b = [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
    if (len3(sub(p, b)) <= B.free) continue;
    const key = `${p[0].toFixed(7)},${p[1].toFixed(7)},${p[2].toFixed(7)}`;
    if (cache.has(key)) p = cache.get(key);
    else {
      let q = space ? space.to(p) : p;
      for (let it = 0; it < 4; it++) {
        const d = fF(q);
        if (d >= B.minClear) break;
        q = add(q, mul(nrm(gF(q)), B.minClear - d + 1e-5));
      }
      p = space ? space.from(q) : q;
      cache.set(key, p);
    }
    P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
  }
  // the single-sheet tier's root cut deeper (its coarser skin): eased out over `free` from the root, the same in every
  // state (the root never moves)
  if (!lay.relief && B.flatDepth > B.depth) {
    const gcache = new Map();
    for (let i = 0; i < nV; i++) {
      const b = [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]], p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      const e = 1 - smoothstep(0, B.free, len3(sub(p, b)));
      if (e <= 0) continue;
      const key = `${b[0].toFixed(6)},${b[1].toFixed(6)},${b[2].toFixed(6)}`;
      if (!gcache.has(key)) gcache.set(key, nrm(ctx.grad(b)));
      const q = sub(p, mul(gcache.get(key), (B.flatDepth - B.depth) * e));
      P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2];
    }
  }
  return { P, ref, base, S };
}

/** Area-weighted vertex normals. */
function vertexNormals(P, tris, nV) {
  const N = new Float64Array(nV * 3);
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const j of [a, b, c]) { N[j] += nx; N[j + 1] += ny; N[j + 2] += nz; }
  }
  for (let i = 0; i < nV; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

/** Wind the triangles consistently over every connected piece (a lens, a membrane panel), then turn each piece so its
 * faces agree with its vertices' reference directions on the whole (the lens outwards, the membrane towards +N). */
function orient(tris, P, ref) {
  const nT = tris.length / 3, edges = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < nT; t++)
    for (let e = 0; e < 3; e++) {
      const k = key(tris[t * 3 + e], tris[t * 3 + ((e + 1) % 3)]);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(t);
    }
  const has = (t, a, b) => { for (let e = 0; e < 3; e++) if (tris[t * 3 + e] === a && tris[t * 3 + ((e + 1) % 3)] === b) return true; return false; };
  const flip = (t) => { const x = tris[t * 3 + 1]; tris[t * 3 + 1] = tris[t * 3 + 2]; tris[t * 3 + 2] = x; };
  const seen = new Uint8Array(nT);
  for (let s0 = 0; s0 < nT; s0++) {
    if (seen[s0]) continue;
    const comp = [s0];
    seen[s0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const t = comp[q];
      for (let e = 0; e < 3; e++) {
        const a = tris[t * 3 + e], b = tris[t * 3 + ((e + 1) % 3)];
        for (const u of edges.get(key(a, b))) {
          if (seen[u]) continue;
          // a neighbour wound alike runs the shared edge the other way
          if (has(u, a, b)) flip(u);
          seen[u] = 1;
          comp.push(u);
        }
      }
    }
    let score = 0;
    for (const t of comp) {
      const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
      const fn = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
      score += Math.sign(dot(fn, [ref[a] + ref[b] + ref[c], ref[a + 1] + ref[b + 1] + ref[c + 1], ref[a + 2] + ref[b + 2] + ref[c + 2]]));
    }
    if (score < 0) for (const t of comp) flip(t);
  }
}

const OPTS = new WeakMap();

/**
 * The fin's atlas mapping (round B2; B1 had u = ray index, v = rayT, 20× uneven texels on the caudal): u across the
 * rays by their spacing in the bind half way up the shorter of each pair, weighted by (the pair's length / the longest
 * ray)^lenPow so short rays (the caudal's procurrent strips) take little room, no slot under `minSlot` of the mean;
 * v along the rays by length (l / the longest ray); a lens takes ±uvHalf of its slot, the caudal's fleshy root lenses
 * up to ±`uv.flesh` (they are most of the surface there). The same for every tier and the cards (one texture).
 * Returns { U(a) (a: the fractional ray index, lens edges at k ± uvHalf) → 0…1, Lmax (HL), rays: [u of each ray] }.
 */
function uvMap(def) {
  const src = def.mirrorOf ?? def;
  if (src._uv) return src._uv;
  const curves = rayCurves(src, 'bind'), n = src.rays.length, Lmax = Math.max(...src.rays.map((r) => r.len)), uvH = FIN_SCULPT.ray.uvHalf;
  let w = [];
  for (let k = 0; k + 1 < n; k++) {
    const r0 = src.rays[k], r1 = src.rays[k + 1], l = 0.5 * Math.min(r0.len, r1.len);
    const d = len3(sub(curveAt(curves[k], l / r0.len), curveAt(curves[k + 1], l / r1.len)));
    w.push(d * (Math.max(r0.len, r1.len) / Lmax) ** FIN_SCULPT.uv.lenPow);
  }
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  w = w.map((x) => Math.max(x, FIN_SCULPT.uv.minSlot * mean));
  const A = [0];
  w.forEach((x) => A.push(A[A.length - 1] + x));
  const padL = uvH * w[0], padR = uvH * w[w.length - 1], total = A[n - 1] + padL + padR;
  const U = (a) => {
    if (a <= 0) return (padL + a * w[0]) / total;
    if (a >= n - 1) return (padL + A[n - 1] + (a - (n - 1)) * w[n - 2]) / total;
    const k = Math.min(n - 2, Math.floor(a));
    return (padL + A[k] + (a - k) * w[k]) / total;
  };
  const out = { U, Lmax, rays: A.map((x) => (padL + x) / total) };
  Object.defineProperty(src, '_uv', { value: out, enumerable: false });
  return out;
}
/** A vertex record's distance up its ray(s) (HL): a ray's own t × its length; a membrane's at equal distances. */
function vertexL(def, lay, v) {
  if (v.type !== MEM) return v.t * def.rays[v.k].len;
  const PL = lay.panelL[v.k];
  return lerp(Math.min(v.tau * PL.Lm, PL.L0), Math.min(v.tau * PL.Lm, PL.L1), v.f);
}

/**
 * A fin's mesh in its bind (relaxed, half-raised) state.
 * @param def one of finDefinitions()
 * @param o { sub: membrane columns between rays, nt: rows along the longest ray, m?: lens segments per arc (2-4),
 *   relief?: rays as ridges (default sub ≥ 2) } — finTierParams(tier)[def.name]
 * @returns { name, position (fish mm), normal, uv (atlas, v down), indices, rayT (0 base → 1 ray tip), ray (fractional
 *   ray index), baseS (fish mm, s of the root under the vertex), side? }
 */
export function buildFinMesh(def, o = {}) {
  const opts = { relief: (o.sub ?? 2) >= 2, ...o };
  if (def.mirrorOf) return mirrorMesh(buildFinMesh(def.mirrorOf, opts), def);
  const lay = layout(def, opts);
  const ev = evaluate(def, lay, 'bind');
  orient(lay.tris, ev.P, ev.ref);
  const nV = lay.V.length;
  const N = vertexNormals(ev.P, lay.tris, nV);
  const position = new Float32Array(nV * 3), normal = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
  const rayT = new Float32Array(nV), ray = new Float32Array(nV), baseS = new Float32Array(nV);
  const [rx, ry, rw, rh] = def.rect, UV = uvMap(def), uvH = FIN_SCULPT.ray.uvHalf;
  // (a lens' half of its slot in the atlas: wider over the caudal's fleshy root, where the lenses are the surface)
  const uvh = (k, t) => {
    const r = def.rays[k];
    if (!lay.relief || r.kind === 'frenum') return 0;
    if (!r.flesh) return uvH;
    const l = t * r.len, e = 1 - smoothstep(r.flesh.hold, r.flesh.over, l);
    return uvH + (FIN_SCULPT.uv.flesh - uvH) * e;
  };
  const aOf = (v) => {
    if (v.type === LENS) return v.k + uvh(v.k, v.t) * ringXY(v.q, lay.m)[0];
    if (v.type === EDGE) return v.k + v.side * uvh(v.k, v.t);
    if (v.type !== MEM) return v.a;
    const PL = lay.panelL[v.k], tk = Math.min(v.tau * PL.Lm, PL.L0) / def.rays[v.k].len, tj = Math.min(v.tau * PL.Lm, PL.L1) / def.rays[v.k + 1].len;
    return lerp(v.k + uvh(v.k, tk), v.k + 1 - uvh(v.k + 1, tj), v.f);
  };
  for (let i = 0; i < nV; i++) {
    const v = lay.V[i];
    for (let c = 0; c < 3; c++) { position[i * 3 + c] = ev.P[i * 3 + c] * HL; normal[i * 3 + c] = N[i * 3 + c]; }
    uv[i * 2] = (rx + INSET + clamp(UV.U(aOf(v)), 0, 1) * (rw - 2 * INSET)) / ATLAS;
    uv[i * 2 + 1] = (ry + INSET + clamp(vertexL(def, lay, v) / UV.Lmax, 0, 1) * (rh - 2 * INSET)) / ATLAS;
    rayT[i] = v.t; ray[i] = v.a; baseS[i] = ev.base[i * 3] * HL;
  }
  const mesh = { name: def.name, position, normal, uv, indices: Uint32Array.from(lay.tris), rayT, ray, baseS, build: { ...opts } };
  if (def.side) mesh.side = def.side;
  // the median fins' and the caudal's: each vertex's s (fish mm) when the fin is folded, for the rig (a folded ray lies
  // back over the vertebrae behind its base: weighted toward the axial row at foldS, its tip follows the back's arch)
  if (def.type === 'median' || def.type === 'caudal') {
    const evF = evaluate(def, lay, 'fold'), foldS = new Float32Array(nV);
    for (let i = 0; i < nV; i++) foldS[i] = evF.P[i * 3] * HL;
    mesh.foldS = foldS;
  }
  // (not enumerable: the root point under every vertex, fish mm, for the checks)
  const root = new Float32Array(nV * 3);
  for (let i = 0; i < nV * 3; i++) root[i] = ev.base[i] * HL;
  Object.defineProperty(mesh, 'root', { value: root, enumerable: false });
  OPTS.set(mesh, { lay, bind: ev.P, bindN: N });
  return mesh;
}

/** The right pectoral's mesh from the left's: z mirrored, triangles rewound. */
function mirrorMesh(L, def) {
  const position = L.position.slice(), normal = L.normal.slice(), indices = L.indices.slice();
  for (let i = 2; i < position.length; i += 3) { position[i] = -position[i]; normal[i] = -normal[i]; }
  for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
  const mesh = { ...L, name: def.name, position, normal, indices, side: def.side, uv: L.uv.slice() };
  if (L.root) {
    const root = L.root.slice();
    for (let i = 2; i < root.length; i += 3) root[i] = -root[i];
    Object.defineProperty(mesh, 'root', { value: root, enumerable: false });
  }
  OPTS.set(mesh, { mirrorOf: L });
  return mesh;
}

/**
 * The fin's blend shapes: { names, deltas: Float32Array[] (fish mm, per vertex), normals: Float32Array[] (unit normal
 * deltas) } towards each of def.targets ('fold', 'spread' and the fin's own: caudal 'flex', pectoral 'plant' with its
 * 'plantMid' corrective). o.normals false: no normal deltas (normals: [], so a GLB writer adds no NORMAL targets and
 * three.js packs the morph texture with positions only, half the size). Round B2 measured what that would cost
 * (out/fins/probe_normals.mjs): the targets turn the normals by p50 8–50° (D1's fold 50°, the pectoral's plant 37°),
 * p95 60–90°, so a folded or planted fin would shade as if still erect; the saving is about 0.9 MB of GPU memory over
 * the hero's and lod1's fins (1.8 → 0.9). Kept by default; the integrator decides.
 */
export function buildFinTargets(def, mesh, { normals: withNormals = true } = {}) {
  let o = OPTS.get(mesh);
  // (a copy of the mesh: built again from its options, the same vertices in the same order)
  if (!o && mesh.build) o = OPTS.get(buildFinMesh(def, mesh.build));
  if (!o) throw new Error(`buildFinTargets: ${mesh.name} was not built by buildFinMesh`);
  if (o.mirrorOf) {
    const L = buildFinTargets(def.mirrorOf, o.mirrorOf, { normals: withNormals });
    const flip = (arr) => arr.map((d) => { const x = d.slice(); for (let i = 2; i < x.length; i += 3) x[i] = -x[i]; return x; });
    return { names: L.names, deltas: flip(L.deltas), normals: flip(L.normals) };
  }
  const { lay, bind, bindN } = o, nV = lay.V.length;
  const shape = (st) => {
    const ev = evaluate(def, lay, st);
    return { P: ev.P, N: vertexNormals(ev.P, lay.tris, nV) };
  };
  const cache = {};
  const get = (st) => (cache[st] ??= shape(st));
  const deltas = [], normals = [];
  for (const name of def.targets) {
    const d = new Float32Array(nV * 3), dn = new Float32Array(nV * 3);
    if (name === 'plantMid') {
      const half = get('plantHalf'), full = get('plant');
      for (let i = 0; i < nV * 3; i++) {
        d[i] = (half.P[i] - 0.5 * (bind[i] + full.P[i])) * HL;
        dn[i] = half.N[i] - 0.5 * (bindN[i] + full.N[i]);
      }
    } else {
      const s = get(name);
      for (let i = 0; i < nV * 3; i++) { d[i] = (s.P[i] - bind[i]) * HL; dn[i] = s.N[i] - bindN[i]; }
    }
    deltas.push(d);
    if (withNormals) normals.push(dn);
  }
  return { names: def.targets.slice(), deltas, normals };
}

/**
 * The far tier's fin: 8 triangles over the outline (five stations across the fin, each from its root to the membrane's
 * margin; the pectoral three stations, each from its root over the plant's heel to the margin), with the fin's uv rect
 * and the mesh attributes; the bind's outline, or another state's ({ state: 'fold' | 'spread' | 'plant' | … }: the same
 * vertices and triangles in every state, so the far tier's merged Fins mesh can carry them as blend shapes:
 * finCardTargets).
 */
export function finCard(def, { state = 'bind' } = {}) {
  if (def.mirrorOf) {
    const L = finCard(def.mirrorOf, { state });
    return mirrorMesh(L, def);
  }
  const S = sampler(def, state, true), n = def.rays.length, UV = uvMap(def);
  // stations across the fin, rows up it: the root and the margin (5 × 2), or for a fin that bends along its rays (the
  // pectoral's planted sole) 3 stations × the root, the bend and the margin; the same vertices in every state
  const stations = def.cardRays ?? [0, (n - 1) / 4, (n - 1) / 2, (3 * (n - 1)) / 4, n - 1];
  const nr = def.cardBend ? 3 : 2;
  const pts = [], attr = [];
  for (const a of stations) {
    const k = Math.min(n - 2, Math.floor(a)), f = a - k;
    const p = def.panels[k], La = def.rays[k].len, Lb = def.rays[k + 1].len;
    const L0 = La * (p.flat0 ?? p.reach0), L1 = Lb * (p.flat1 ?? p.reach1), Lm = Math.max(L0, L1);
    const E = 1 - (p.flatNotch ?? p.notch) * Math.pow(Math.sin(Math.PI * f), p.notchPow ?? 1);
    const tk = Math.min(E * Lm, L0) / La, tj = Math.min(E * Lm, L1) / Lb;
    const b = lerp3(def.rays[k].base, def.rays[k + 1].base, f);
    pts.push(b);
    attr.push({ a, t: 0, l: 0, s: b[0] });
    if (nr === 3) {
      const ta = Math.min(tk, def.cardBend(k)), tb = Math.min(tj, def.cardBend(k + 1));
      pts.push(lerp3(S.frame(k, ta).C, S.frame(k + 1, tb).C, f));
      attr.push({ a, t: lerp(ta, tb, f), l: lerp(ta * La, tb * Lb, f), s: b[0] });
    }
    pts.push(lerp3(S.frame(k, tk).C, S.frame(k + 1, tj).C, f));
    attr.push({ a, t: lerp(tk, tj, f), l: lerp(tk * La, tj * Lb, f), s: b[0] });
  }
  const nV = pts.length, idx = [];
  for (let i = 0; i + 1 < stations.length; i++)
    for (let j = 0; j + 1 < nr; j++) {
      const a = i * nr + j, b = i * nr + j + 1, c = (i + 1) * nr + j + 1, d = (i + 1) * nr + j;
      idx.push(a, d, c, a, c, b);
    }
  const P = new Float64Array(nV * 3);
  pts.forEach((p, i) => P.set(p, i * 3));
  // the card's face towards the fin's +N side
  const ref = new Float64Array(nV * 3);
  pts.forEach((p, i) => { const k = Math.min(n - 2, Math.floor(attr[i].a)); const F = S.frame(k, Math.max(0.3, attr[i].t)); ref.set(F.N, i * 3); });
  orient(idx, P, ref);
  const N = vertexNormals(P, idx, nV);
  const [rx, ry, rw, rh] = def.rect;
  const position = new Float32Array(nV * 3), normal = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
  const rayT = new Float32Array(nV), ray = new Float32Array(nV), baseS = new Float32Array(nV);
  for (let i = 0; i < nV; i++) {
    for (let c = 0; c < 3; c++) { position[i * 3 + c] = P[i * 3 + c] * HL; normal[i * 3 + c] = N[i * 3 + c]; }
    uv[i * 2] = (rx + INSET + clamp(UV.U(attr[i].a), 0, 1) * (rw - 2 * INSET)) / ATLAS;
    uv[i * 2 + 1] = (ry + INSET + clamp(attr[i].l / UV.Lmax, 0, 1) * (rh - 2 * INSET)) / ATLAS;
    rayT[i] = attr[i].t; ray[i] = attr[i].a; baseS[i] = attr[i].s * HL;
  }
  const mesh = { name: def.name, position, normal, uv, indices: Uint32Array.from(idx), rayT, ray, baseS };
  if (def.side) mesh.side = def.side;
  return mesh;
}

/**
 * The far tier's card blend shapes: { names, deltas (fish mm per card vertex), normals (unit deltas) } towards 'fold'
 * (every fin) and 'plant' (the pectorals): finCard(def, { state }) − finCard(def), vertex for vertex. Round B1's lod2
 * cards stayed in the bind (the planted pectoral cards hung 2.55 mm under the hero's ground, D1 half raised); with these
 * on the merged Fins mesh, driven like the hero's, the far fish folds and plants as the near one does.
 */
export function finCardTargets(def) {
  const bind = finCard(def), names = def.type === 'pectoral' ? ['fold', 'plant'] : ['fold'];
  const deltas = [], normals = [];
  for (const st of names) {
    const c = finCard(def, { state: st });
    deltas.push(c.position.map((v, i) => v - bind.position[i]));
    normals.push(c.normal.map((v, i) => v - bind.normal[i]));
  }
  return { names, deltas, normals };
}

/** The mesh options per fin for a tier: { [finName]: { sub, nt, m, relief } } ('hero' | 'lod1'). */
export function finTierParams(tier) {
  const T = FIN_SCULPT.tiers[tier];
  if (!T) throw new Error(`finTierParams: no tier ${tier} (hero, lod1; lod2 uses finCard)`);
  return Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { ...v }]));
}
