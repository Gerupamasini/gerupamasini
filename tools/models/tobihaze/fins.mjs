// The トビハゼ's fins as meshes: the two dorsal fins, the anal fin and the caudal fin on the body's midline, the pectoral
// blades on the ends of the muscular lobes, the pelvic cup under the chest. Each fin is a fan of rays and a membrane
// between them, in the fish frame of anatomy.mjs (tables in head lengths HL, meshes in mm).
//
// Counts and shapes (research: literature_morph §2, §4; body_fins_colour §2, §6.2; measurements §1; behaviour §1.2, §5):
//   D1 XII flexible spines, a tall rounded fan, the spine tips standing a little free of the membrane (a notched margin);
//      about 0.6 of the body depth when half raised (A070, B067, B014), 0.9-1.0 erect (A001, B062, A065); folded it lies
//      low along the back, a streak in its groove (A030; ≤ 0.035 HL over the skin), and stops short of D2 (Lee 1995).
//   D2 I,12, long and low, rounded in front, even height (0.38-0.45 BD erect: A065, A001).
//   anal I,11, low, mirroring D2 on the belly (0.4-0.5 BD erect: A065); folded into a furrow along the ventral midline
//      (body.mjs keels.anal.groove; round B4: no vertex under the ventral line, B3 0.009 HL, B2 0.029).
//   caudal 17 principal rays (the outermost of each lobe unbranched) from the hypural plate just behind the caudal base,
//      their bases on a straight line down the midplane under the skin of the peduncle's end (round B4: the scales end
//      0.03 HL past SL on a straight vertical line, the fin's own fleshy base, a sheath as thick as the body there,
//      carries the peduncle's taper on over the rays' bases, so the visible fin is 0.75–0.76 HL from the skin's end to
//      the tip; B3's skin ran on as a rounded tongue 0.20–0.32 HL past SL, B2's flat end plate with the rays on its face
//      read as a brush in a metal band), and procurrent rays (6 dorsal, 6 ventral) along the peduncle's margins in front: the outline runs
//      on from the peduncle into the fin (A017, A070, A067); on land folded into a pointed lanceolate spear, its tip a
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
//      (Murdy, Lee, Itoh; B014, B010), 0.3-0.5 HL long; folded flat back under the belly (B067); on land pressed on the
//      ground under the chest (u1, B010, A005: round B3's 'press').
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
//   press    (pelvic, round B3) the cup pressed on the ground in LAND: each ray dives from its base and lies on a plane
//            FIN_SCULPT.pelvic.press.drop under the bases, tilted as the ground is in the head's frame with the front
//            raised 15° (def.press: its normal and a point, fish mm), J_pelvic left near 0 (B2 tilted the rigid cup 21°
//            until its rear rim touched: a vertical sail); round B4 its family pressLow / pressHigh / pressDeep for the
//            front raised 10–30° (def.presses; pelvicPressWeights / pelvicPress blend the two that bracket the chest's
//            height over the ground and pitch J_pelvic the rest of the way)
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
// finCardTargets(def) → { names (def.cardTargets, else ['fold'(, 'plant')]), deltas, normals } (the far tier's card
// blend shapes; round B3: the caudal's fold / spread / flex, the pelvic's fold / spread / press),
// finTierParams(tier). Besides the contract's fields a mesh carries `build` (its options; buildFinTargets rebuilds from
// them for a copied mesh), the median fins' and the caudal's `foldS` (fish mm: each vertex's s when folded, for the
// rig: see rig.mjs finWeights) and, not enumerable, `root` (the root point under every vertex, mm). The pectoral defs
// carry `bladePivot` (mm: the plant's heel, the ankle the sole turns on, for the rig's J_pecBlade), `sole` (the planted
// sole's plane, point, heel, heel axis and toe, for the rig's IK and the contacts) and `restPose` (the arm's rest pose
// the fold is authored in, as joint rotations); the caudal def carries `plate` (the hypural plate's s, the fleshy end's
// s, the skin's top and bottom at the plate) and `space` (the field it is kept clear of: the body but for the inside of
// its fleshy end, where the roots run by design; test-fins' gate 3 reads it); the pelvic def `press` (the plane).
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
    // (× 0.92 at round B3's integration, the trunk key's request: with B3's belly the erect D2 stood 0.455 BD, over the
    // gate's 0.45 and B2's review's 0.38-0.42 (A065, A001 0.355-0.395); now ≈ 0.42, anal / D2 ≈ 0.87)
    len: [0.1472, 0.2484, 0.2852, 0.3036, 0.3082, 0.3082, 0.3082, 0.3082, 0.3082, 0.3036, 0.2944, 0.276, 0.2576],
    angle: { bind: [36, 26], spread: [66, 52], fold: [5, 3] },
    spineAngle: { bind: 46, spread: 80, fold: 7 },
    bend: { bind: 8, spread: 3, fold: 0 },
    reach: 0.97, notch: 0.035, notchPow: 0.85,
    pleat: { bind: 0.008, spread: 0.002, fold: 0.012 }, sag: { bind: 0.004, spread: 0.001, fold: 0.003 },
  },
  // anal I,11
  anal: {
    keel: 'anal', inset: [0.015, 0.03], spines: 1, foldNormalHint: true, foldSurface: { margin: 0.001, stagger: 0.0002 },
    len: [0.12, 0.22, 0.26, 0.28, 0.29, 0.295, 0.30, 0.30, 0.30, 0.29, 0.28, 0.265],
    angle: { bind: [32, 24], spread: [62, 48], fold: [3, 2] }, foldLift: 26,   // (fold 6–4: the shorter keel of round B1 shingles its 12 rays closer; at 5–3, 1.35 % of the folded faces turned against their normals)
    spineAngle: { bind: 40, spread: 74, fold: 7 },
    bend: { bind: 8, spread: 3, fold: 0 },
    reach: 0.97, notch: 0.03, notchPow: 0.85,
    pleat: { bind: 0.007, spread: 0.002, fold: 0.011 }, sag: { bind: 0.004, spread: 0.001, fold: 0.003 },
  },
  // caudal (round B4: the scaled skin ends at the caudal base and the fin's own fleshy base carries the peduncle's taper on;
  // B3's skin ran on 0.20–0.32 HL past SL as a rounded tongue over the rays, a spatula over a short fringe; B2's flat end
  // plate with the rays on its face read as a brush in a metal band): 17 principal rays from the hypural plate `plateS`
  // HL from the caudal base (their roots under the skin's last `plateS` + the end's s; A070, A017, A067, A030: the scales
  // stop at a near-vertical line at the caudal base and the outline runs straight on into the fin), their bases on a
  // straight line down the midplane, the outermost `edge` HL inside its dorsal and ventral margins; dorsal and ventral
  // procurrent rays along the peduncle's margins in front (procS from the hypural plate), lying on them; principal
  // lengths a lanceolate profile peaking at `tipAt` of the fan (dorsal 0 → ventral 1, below the middle: the tip under the
  // axis, the lower margin the longer), the longest reaching TL (`tipS`, HL) from its base; angles (deg, from the body's
  // axis, + up) of the dorsal-most and ventral-most principal rays per state (bind: rounded-lanceolate, half way between
  // the folded spear and the spread fan; fold: the spear, its margins running on from the tapering peduncle's); `flesh`:
  // the fin's fleshy base, a smooth sheath round the rays' bases (caudalDef's extraLayout / extraPoint): where a ray
  // leaves the skin (the end's rounding, K.tailEnd) as thick as the body there (`k` × its half-width, at least `min`),
  // running `back` HL on under the skin, and carrying the body's taper on over the rays (a cubic from the body's own
  // slope down to nothing, never steeper than `maxSlope`; each ray's run `even` of the way to the longest), out past the
  // outermost rays `edgeFill` of the way to the body's margins; the rays' lenses thinned to a thread under its first
  // `cover` (def.lensScale, def.rowsFor); `rootState`: every state leaves the base along that state's root direction
  // (the sheath holds still) and turns to its own over `turnOver` HL past the skin's end; `flexFrom`: the flex's curl
  // starts this far (HL) past the skin's end, so the roots under the skin and the sheath stay there
  caudal: {
    principal: 17, plateS: -0.05, edge: 0.014, tipS: 80 / HL, tipAt: 0.69, upperDrop: [0.5, 1.4], lowerDrop: [0.14, 1.5],
    angle: { bind: [16, -12], spread: [36, -28], fold: [-9, 2], flex: [16, -12] },
    procS: [-0.18, -0.14, -0.10, -0.06, -0.02, 0.02],   // from the hypural plate
    procLen: { dorsal: [0.035, 0.06, 0.09, 0.125, 0.165, 0.21], ventral: [0.04, 0.07, 0.10, 0.14, 0.18, 0.23] },
    procAngle: { bind: [14, 18], spread: [22, 30], fold: [1, 0.5], flex: [14, 18] },
    flesh: { k: 1.0, min: 0.003, maxSlope: 0.32, back: 0.03, edgeFill: 0.98, cover: 0.6, even: 0.5 },
    flexFrom: 0.02, rootState: 'fold', turnOver: 0.08,
    thick: 3,            // the lowest principal rays thickened distally
    segScale: 0.5,       // its rows are far apart: the segments' joints only hinted
    flex: 38,            // deg the rays curl to the side at full flex
    reach: 0.97, procReach: 0.93, notch: 0.025, notchPow: 0.9,
    pleat: { bind: 0.005, spread: 0.002, fold: 0.008, flex: 0.005 }, sag: { bind: 0.004, spread: 0.001, fold: 0.002, flex: 0.004 },
  },
  // pectoral blade (round B3's pectoral system: one muscular lobe 0.36 HL from the shoulder to the lobe/fin junction,
  // body.mjs; the blade 0.45–0.50 HL; the whole fin 0.80–0.90 HL from the shoulder to the longest ray's tip: MEAS
  // 0.80, A070 0.84; Murdy's 25.8 % SL = 1.07 HL is the longest): 14 rays whose bases run straight across the lobe's
  // end, `span` × its width (BODY_SCULPT.pectoral.radius[2] × 2), `depth` HL under its end; lengths `maxLen` in the
  // middle of the fan, `edgeLen` of that at its edges, the fan rounded; fan angles (deg) in the lobe's flat plane (+
  // towards its leading edge wv, ray 0's side), turned by `turn`; the blade cupped (`curl`, + towards the outer face n).
  // The fleshy fin base (B2's cuff: the lobe ended in a 0.047 HL thick face and the 0.007 HL blade started inside it):
  // the rays' lenses at their roots as thick as `flesh.k` × the lobe's end (its half-width × fl[2]) and as wide as
  // `flesh.w` × their spacing (closing up into one corrugated surface over the bases, the caudal's mechanism), held over
  // `flesh.hold` HL and easing to the bare ray by `flesh.over`, so the lobe's skin runs on over the rays' bases.
  //   furl (the land default: u1, A001, B010, A005, A070; Pace & Gibb 2009: rays furled on land): the rays bundled
  //     (`fan.furl`: near parallel, the bundle 0.11–0.15 HL wide as the photos' furled blades 0.08–0.12) with the
  //     membrane pleated between them (`pleat.furl`)
  //   plant (from furl; round B4, `plant.mode` 'edge': u1, A070, B010, A005: the land blade keeps its broad face to the
  //     side down to the mud, the lobe and the inner blade in one near-vertical plane bent into u1's V at the junction,
  //     and the furled distal blade lies forward along the ground on its lower edge (A070's orange blade seen broad from
  //     5° above the mud; u1's tip pressed forward): the rays bundled as in furl, each turned in the fan's own plane
  //     toward the trailing edge (the side the land V bends to) by `plant.ankle` deg from the heel `plant.heel` HL past
  //     the bases, concentric (a ray `d` HL from the bundle's inner edge turns over (`plant.radius` + d) × ankle, so the
  //     bundle bends as one strip and keeps its width); def.sole then carries the foot's line (toe, its axis n). Mode
  //     'sole' is round B3's: each ray turned toward the outer face n into one plane, splayed ±`plant.splay`, pressed
  //     flat (`plant.flat`): a flat sole only when the lobe's broad face looks forward, edge-on to every side camera)
  //   fold (A030, A002, B067): authored with the arm in the rest pose (restArmPose: the lobe laid back flush on the
  //     flank, `rest.droop` deg below the horizontal, `rest.gap` HL off it; def.restPose carries the shoulder's
  //     rotation), the rays furled (`fan.fold`), swept `rest.sweep` deg up from the lobe's line (B067: the folded fan
  //     swept up and back) and hugging the flank (the trunk's skin) back from the junction, their lower faces
  //     `rest.margin` HL off it, reached over `rest.ramp` HL; then carried back to the bind through the shoulder's inverse
  //   spread (A061): the paddle, the fan opened 144°, flat
  //   prop: the junction's nominal flexion (deg, toward n) in the propped stance and (round B4) its in-plane sweep (deg,
  //     + toward the leading edge: the land leg's V, rig planeArm's −84°); the far tier's card bakes them into its
  //     'plant' (lod2 has the arm as J_pecL alone)
  pectoral: {
    rays: 14, span: 0.9, depth: 0.012, maxLen: 0.50, edgeLen: 0.62, junctionShift: -0.04,
    flesh: { k: 0.86, w: 0.5, hold: 0.02, over: 0.12 },
    fan: { bind: [34, -34], spread: [72, -72], fold: [3, -3], furl: [4, -4] },
    turn: { bind: 0, spread: 0, fold: 0, furl: 0 },
    curl: { bind: 6, spread: 3, fold: 0, furl: 3, plant: 0 },
    plant: { mode: 'edge', heel: 0.24, radius: 0.04, ankle: 25, over: 0.06, roll: 20, splay: 7, flat: 0.3, tipCurl: 0, solePleat: 0.05 },
    prop: { junction: 0, sweep: -84 },
    rest: { droop: 8, sweep: 12, gap: 0.004, from: 0.45, margin: 0.0012, ramp: 0.07 },
    reach: 0.97, notch: 0.04, notchPow: 0.85,
    // (round B4: the plant as furled as the furl, its pleats and sags: the 'edge' foot is the furled bundle bent)
    pleat: { bind: 0.004, spread: 0.0015, fold: 0.002, furl: 0.023, plant: 0.023 }, sag: { bind: 0.004, spread: 0.001, fold: 0.0015, furl: 0.003, plant: 0.003 },
  },
  // pelvic: per side the spine and 5 soft rays, bases along a short transverse line on the pelvic base (s from the base
  // centre, z), each ray's direction as (phi: deg round the vertical, 0 back, 90 out; beta: deg down from horizontal);
  // the frenum's front edge on the midline (F); the cup curls down at its rim; its rays a `rayScale` of the others' girth
  // (round B2: the bind cup a shallow dish seen from the front, not the steep V of round B1 (beta 55–20°); fold: each ray
  // hugs the belly back from its root, `foldPhi` deg out from straight back, a short knuckle `foldLift` deg off the
  // skin, its lower face `foldMargin` HL off the skin (B067: folded flat, pressed under the chest; the halves within
  // |z| ≤ 0.10 HL). Round B4: the rays 14 % longer (the fin 0.46 HL from the frenum to the longest tip, in the
  // literature's 0.3–0.5; B3 0.41), so the pressed cup reaches the mud under a chest propped up to 30°, the bind's beta
  // 3° flatter so its cup stays about as deep (0.130 HL under the bases, B3 0.127)
  pelvic: {
    base: { s: [-0.045, -0.040, -0.035, -0.030, -0.025, -0.020], z: [0.050, 0.042, 0.034, 0.026, 0.018, 0.010], frontS: -0.055 },
    len: [0.19, 0.28, 0.335, 0.39, 0.415, 0.39], frenumLen: 0.08,
    phi: { bind: [105, 76, 54, 36, 20, 7], spread: [125, 95, 70, 47, 27, 10] },
    beta: { bind: [27, 23.5, 20, 16, 15, 14], spread: [34, 30, 26, 22, 19, 16] },
    frenum: { bind: [180, 45], spread: [180, 55] },
    foldPhi: [7, 5, 3.5, 2.5, 1.5, 0.6], foldLift: 18, foldMargin: 0.0003,
    curl: { bind: 8, spread: 8, fold: 0 },
    // press (round B3; LAND, u1, B010, A005: the cup pressed on the ground under the chest, not a rigid tilted sail):
    // the ground a plane `drop` HL under the lowest ray base (u1: the pelvic base 0.14 HL over the mud; 0.222 in the rig's
    // integrated land state, where the settled chest holds the bases 1.3 mm higher: with 0.14 the rig had to tilt the
    // pressed cup 21° to reach the ground, the sail again; round B3 integration, rig request), tilted `tilt`
    // deg (rising toward the tail: the ground in the head's frame with the front raised by the rig's 15°, J_pelvic at 0);
    // each ray dives from its base at `dive` deg below the plane's tangent, fanned at `phi` (deg round the vertical, as
    // above; the frenum forward), and turns over its last `knee` HL onto the plane, its lower face `margin` HL over it
    press: { drop: 0.222, tilt: 15, dive: 60, knee: 0.05, margin: 0.0006, phi: [98, 72, 52, 35, 20, 7], frenumPhi: 180, raise: 15 },
    // (round B4) the press family over the front's raise, so the cup lies on the mud from the reach's low chest to a high
    // prop (rig: blend the two that bracket the bases' height over the ground, pelvicPressWeights, then J_pelvic's pitch
    // the rest of the way): pressLow (the reach and low props, raise 10°: the bases 0.158 HL over the ground), press (above:
    // the land state's 15°), pressDeep (high props, raise 30°: the plane as deep as the rays reach, a steeper dive; the
    // bases stand 0.41 HL over the mud there, J_pelvic's pitch takes the cup's rear the rest of the way); each its plane's
    // tilt (deg), drop (HL under the lowest base) and dive (deg), the rest as press
    presses: { pressLow: { tilt: 10, depth: 0.156, dive: 55, raise: 10 }, pressHigh: { tilt: 22.5, depth: 0.307, dive: 72, knee: 0.04, raise: 22.5 }, pressDeep: { tilt: 30, depth: 0.41, dive: 88, knee: 0.03, raise: 30 } },
    frenumReach: 0.55, reach: 0.96, medialReach: 0.5, medialNotch: 0.12, notch: 0.03, notchPow: 0.85,
    rootDepth: 0.006, rayScale: 0.72,
    pleat: { bind: 0.004, spread: 0.0015, fold: 0.0015, press: 0.0008, pressLow: 0.0008, pressHigh: 0.0008, pressDeep: 0.0008 }, sag: { bind: 0.003, spread: 0.001, fold: 0.0015, press: 0.0006, pressLow: 0.0006, pressHigh: 0.0006, pressDeep: 0.0006 },
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
      Fin_Anal: { relief: true, m: 3, sub: 2, nt: 20 },   // (round B3: hexagonal rays, no branched crests: in the groove's fold the split crests turned 9 % of the faces over)
      Fin_Caudal: { relief: true, m: 4, sub: 2, nt: 20, sheath: { step: 0.5, rows: 9 } },
      Fin_Pectoral_L: { relief: true, m: 4, sub: 2, nt: 14 },
      Fin_Pectoral_R: { relief: true, m: 4, sub: 2, nt: 14 },
      Fin_Pelvic: { relief: true, m: 4, sub: 2, nt: 16 },
    },
    lod1: {
      Fin_Dorsal1: { relief: false, sub: 2, nt: 14 },
      Fin_Dorsal2: { relief: false, sub: 2, nt: 11 },
      Fin_Anal: { relief: false, sub: 2, nt: 10 },
      Fin_Caudal: { relief: false, sub: 1, nt: 14, sheath: { step: 2, rows: 4 } },
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
      const hug = (p, l) => { const fr = ctx.midFrame(p[0], up), b = lerp((S.foldLift ?? FIN_SCULPT.fold.lift) * DEG, a, smoothstep(0, FIN_SCULPT.fold.knuckle, l)); return add(mul(fr.T, Math.cos(b)), mul(fr.O, Math.sin(b))); };
      // (round B3, the anal fin: held at a height over the skin instead (S.foldSurface): its lens' half-width over the
      // groove's floor, plus `margin`, the front rays `stagger` a ray higher (each over the next), so the folded fin
      // lies in its groove instead of hanging under the belly)
      const FS = S.foldSurface;
      if (!FS) return { hug };
      const pr = rayProfile(r.kind), c0 = ctx.f(r.base), L = r.len, dz = FS.stagger * (n - 1 - k);
      return { hug, surface: (l) => lerp(c0, pr.w * (1 - (1 - pr.tip) * Math.pow(l / L, 0.9)) + FS.margin + dz, smoothstep(0, FIN_SCULPT.fold.knuckle * 1.5, l)) };
    }
    const sb = S.bend[st in S.bend ? st : 'bind'];
    return { dir: add(mul(r.T0, Math.cos(a)), mul(r.O0, Math.sin(a))), bend: { toward: r.T0, angle: sb * DEG } };
  };
  const panels = rays.slice(1).map(() => ({ reach0: S.reach, reach1: S.reach, flat0: S.flatReach, flat1: S.flatReach, notch: S.notch, flatNotch: S.flatNotch, notchPow: S.notchPow }));
  return {
    name, type: 'median', dorsal, joint: 'spine', rect: FIN_ATLAS[name], rays, panels,
    targets: ['fold', 'spread'], state, hint: () => [0, 0, 1], pleat: S.pleat, sag: S.sag, ...(S.foldNormalHint ? { normalHint: (st) => st === 'fold' } : {}),
  };
}

/**
 * The peduncle's end as the body's field has it (HL), round B3: the hypural plate `plateS` behind the caudal base (the
 * principal rays' bases, in the midplane under the skin), the body's fleshy end behind it tapering to K.tailEnd.s, and
 * along it the midline skin's top and bottom (tabulated to the end: the procurrent rays lie on them) with their frame
 * (as ctx.midFrame, which stops at s 4.3); `halfW(y, s)` the body's half-width; `space`: the field the caudal is kept
 * clear of (fins.mjs rayCurves / evaluate, test-fins' gate 3), the body's own but for the flesh behind the hypural plate
 * inside its side outline, where the principal rays' roots run under the skin by design.
 */
function endPlate(ctx) {
  const K = ctx.K, S = FIN_SCULPT.caudal;
  const sH = K.caudalBase + S.plateS, sE = K.tailEnd.s + Math.max(0, K.tailEnd.bulge ?? 0), s0 = sH - 0.36, ds = 0.004, sLast = K.tailEnd.s - (K.tailEnd.blend ?? 0.01) - 0.004;
  const n = Math.ceil((sLast - s0) / ds), tab = { 1: new Float64Array(n + 1), [-1]: new Float64Array(n + 1) };
  for (const up of [1, -1])
    for (let i = 0; i <= n; i++) {
      const s = Math.min(sLast, s0 + i * ds), yc = ctx.prof.at(Math.min(s, K.caudalBase)).yc;
      const q = ctx.prof.at(s), mid = (q.yT + q.yB) / 2;
      tab[up][i] = ctx.along([s, ctx.f([s, yc, 0]) < 0 ? yc : mid, 0], [0, up, 0], 0.5)[1];
    }
  // (round B4: past the skin's end the margins run on as the folded fin's, the marginal principal rays' root direction,
  // so the procurrent rays folded along them converge into the spear instead of running on level past it)
  const edgeY = (s, up) => {
    const x = clamp((s - s0) / ds, 0, n - 1e-9), i = Math.floor(x), y = lerp(tab[up][i], tab[up][i + 1], x - i);
    return s <= sLast ? y : y + (s - sLast) * Math.tan(S.angle[S.rootState ?? 'fold'][up > 0 ? 0 : 1] * DEG);
  };
  const frame = (s, up) => {
    const h = 0.008, sl = (edgeY(s + h, up) - edgeY(s - h, up)) / (2 * h), T = nrm([1, sl, 0]);
    return { y: edgeY(s, up), T, O: up > 0 ? nrm([-sl, 1, 0]) : nrm([sl, -1, 0]) };
  };
  const halfW = (y, s) => { const p = [s, y, 0]; return ctx.f(p) >= 0 ? 0 : ctx.along(p, [0, 0, 1], 0.4)[2]; };
  // the clearance field: past the hypural plate and inside the side outline the fleshy end hides the roots (g > 0)
  const g = (p) => Math.min(p[0] - sH, edgeY(p[0], 1) - p[1], p[1] - edgeY(p[0], -1));
  const f = (p) => Math.max(ctx.f(p), g(p)), e = 1e-4;
  const grad = (p) => [0, 1, 2].map((c) => { const a = p.slice(), b = p.slice(); a[c] += e; b[c] -= e; return (f(a) - f(b)) / (2 * e); });
  const id = (p) => p.slice();
  return { sH, sE, top: edgeY(sH, 1), bottom: edgeY(sH, -1), edgeY, frame, halfW, yc: ctx.prof.at(K.caudalBase).yc, space: { f, grad, to: id, from: id } };
}

/** The caudal fin: procurrent rays along the peduncle's margins, the principal rays from the hypural plate under the
 * skin of the peduncle's fleshy end, their own fleshy base taking over where they leave it. */
function caudalDef(ctx) {
  const S = FIN_SCULPT.caudal, B = FIN_SCULPT.base;
  const plate = endPlate(ctx), sH = plate.sH, sE = plate.sE;
  const yTop = plate.top - S.edge, yBot = plate.bottom + S.edge;
  const rays = [];
  const proc = (up, j) => {
    const s = sH + S.procS[j], fr = plate.frame(s, up);
    return { base: sub([s, fr.y, 0], mul(fr.O, B.depth * 0.7)), len: S.procLen[up > 0 ? 'dorsal' : 'ventral'][j], kind: 'proc', simple: true, up, j, T0: fr.T, O0: fr.O };
  };
  const NP = S.procS.length;
  for (let j = 0; j < NP; j++) rays.push(proc(1, j));
  // the principal rays' bases straight down the hypural plate in the midplane; the longest ray reaching tipS from its
  // base along its bind direction
  const prof = (u) => (u < S.tipAt ? 1 - S.upperDrop[0] * ((S.tipAt - u) / S.tipAt) ** S.upperDrop[1]
    : 1 - S.lowerDrop[0] * ((u - S.tipAt) / (1 - S.tipAt)) ** S.lowerDrop[1]);
  const angleOf = (st, u) => lerp(S.angle[st][0], S.angle[st][1], u) * DEG;
  const kTip = Math.round(S.tipAt * (S.principal - 1)), uTip = kTip / (S.principal - 1);
  const maxLen = (S.tipS - sH) / Math.cos(angleOf('bind', uTip)) / prof(uTip);
  // the fleshy base (round B4): a smooth sheath round the fan's base (def.extraLayout / extraPoint, both faces), the
  // rays and the membrane inside it, so the fin's own skin runs the peduncle's section on past the scales' end and the
  // rays come out of it as it thins (A070, A067, A017: no comb, no band). Across the fan its half-thickness at the
  // seam (where the skin's end starts to round: K.tailEnd's cut less its blend; a marginal ray's path may leave by the
  // margin first) is the body's half-width there (`k` ×), out to the body's dorsal and ventral margins past the outermost
  // rays (closing to an edge there); along each ray it carries the body's taper on: a cubic from the seam (l0) down to
  // nothing over `len` (its first slope the body's own there, so the top view's outline runs on without a corner, no
  // slope over `maxSlope`), and back from the seam it runs `back` HL under the skin (no wider than 0.97 × the body)
  const bl = ctx.K.tailEnd.blend ?? 0.01, sCut = ctx.K.tailEnd.s;
  const taperFor = (H, sigma) => {
    // (the cubic g(x) on x = (l − l0) / len: g(0) 1, g'(0) m, g(1) 0, g'(1) 0; its steepest |g'| over [0, 1])
    const steep = (m) => { let mx = 0; for (let i = 0; i <= 40; i++) { const x = i / 40; mx = Math.max(mx, Math.abs(m + 2 * (-3 - 2 * m) * x + 3 * (2 + m) * x * x)); } return mx; };
    for (let len = 0.03; len < 0.8; len += 0.005) { const m = -Math.min(3, (sigma * len) / Math.max(1e-6, H)); if ((steep(m) * H) / len <= S.flesh.maxSlope) return { len: +len.toFixed(4), m: +m.toFixed(4) }; }
    return { len: 0.8, m: -Math.min(3, (sigma * 0.8) / Math.max(1e-6, H)) };
  };
  // (a line in the midplane from (sH, y) at the root's angle a: where it leaves the body, its seam, the body's half-width
  // and slope there, its taper, its run under the skin)
  const seamOf = (y, a, cap) => {
    const yAt = (q) => y + (q - sH) * Math.tan(a);
    let sOut = sH; while (sOut < sCut + 0.1 && ctx.f([sOut, yAt(sOut), 0]) < 0) sOut += 0.001;
    const sSeam = Math.max(sH, Math.min(sOut, sCut) - bl), l0 = (sSeam - sH) / Math.cos(a), endL = (Math.max(sH, Math.min(sOut, sCut)) - sH) / Math.cos(a);
    const w0 = plate.halfW(yAt(sSeam), sSeam), w1 = plate.halfW(yAt(sSeam - 0.01), sSeam - 0.01);
    const h = Math.max(S.flesh.min, S.flesh.k * w0), sigma = Math.max(0, ((w1 - w0) / 0.01) * Math.cos(a)) * S.flesh.k;
    const tp = taperFor(Math.max(1e-4, h), sigma), pre = [];
    for (let i = 0; i <= 6; i++) { const l = l0 - S.flesh.back + (S.flesh.back * i) / 6, q = sH + l * Math.cos(a), yq = yAt(q); pre.push([+l.toFixed(5), +(S.flesh.k * lerp(0.97, 1, i / 6) * Math.min(...cap.map((dy) => plate.halfW(yq + dy, q)))).toFixed(5)]); }
    return { y, a, l0, endL, h, len: tp.len, m: tp.m, sigma, pre, ySeam: yAt(sSeam), sSeam };
  };
  const spacing = (yTop - yBot) / (S.principal - 1);
  const sheath = [];
  for (let k = 0; k < S.principal; k++) {
    const u = k / (S.principal - 1), y = lerp(yTop, yBot, u), base = [sH, y, 0], sm = seamOf(y, angleOf(S.rootState, u), [0]);
    sheath.push(sm);
    rays.push({ base, len: maxLen * prof(u), kind: 'soft', simple: k === 0 || k === S.principal - 1, thick: k >= S.principal - S.thick, u, embed: sm.l0, endL: sm.endL });
  }
  for (let j = NP - 1; j >= 0; j--) rays.push(proc(-1, j));
  // (the sheath's end less rounded than the rays' own tapers make it: each run `even` of the way to the longest, its first
  // slope kept the body's)
  { const Lx = Math.max(...sheath.map((q) => q.len)); for (const q of sheath) { q.len = lerp(q.len, Lx, S.flesh.even); q.m = -Math.min(3, (q.sigma * q.len) / Math.max(1e-4, q.h)); } }
  // the sheath's margins: past the outermost rays to the body's top and bottom at the seam (E ray spacings), its
  // half-thickness there the body's (half way: `mid`), nothing at the edge
  const Etop = Math.max(0.2, (plate.edgeY(sheath[0].sSeam, 1) - sheath[0].ySeam) / spacing * S.flesh.edgeFill);
  const Ebot = Math.max(0.2, (sheath[S.principal - 1].ySeam - plate.edgeY(sheath[S.principal - 1].sSeam, -1)) / spacing * S.flesh.edgeFill);
  const ext = (E, kRay, dir) => [0.5, 1].map((f) => {
    const r0 = sheath[kRay], hw = plate.halfW(r0.ySeam - dir * f * E * spacing, r0.sSeam) * S.flesh.k * (f < 1 ? 1 : 0);
    return { ...r0, h: hw, pre: r0.pre.map(([l, h]) => [l, Math.min(h, hw)]), e: f * E };
  });
  const state = (st, k) => {
    const r = rays[k], key = st in S.angle ? st : 'bind';
    let spec;
    if (r.kind === 'proc') {
      const A = S.procAngle[key], a = lerp(A[0], A[1], r.j / (NP - 1)) * DEG, up = r.up;
      spec = st === 'fold'
        ? { hug: (p, l) => { const fr = plate.frame(p[0], up), b = lerp(FIN_SCULPT.fold.lift * DEG, a, smoothstep(0, FIN_SCULPT.fold.knuckle, l)); return add(mul(fr.T, Math.cos(b)), mul(fr.O, Math.sin(b))); } }
        : { dir: add(mul(r.T0, Math.cos(a)), mul(r.O0, Math.sin(a))) };
    } else {
      // (round B4: every state leaves the base along the root's direction, the fold's: the fleshy base continues the
      // peduncle's converging margins and does not move; past the seam (r.embed) the ray turns to its state's direction
      // over `turnOver`: the fan opens beyond the fleshy base, which keeps the body's section where the skin ends)
      const a0 = angleOf(S.rootState, r.u), a = angleOf(key, r.u), d0 = [Math.cos(a0), Math.sin(a0), 0], d1 = [Math.cos(a), Math.sin(a), 0];
      spec = key === S.rootState ? { dir: d0 } : { dir: d0, turn: { to: d1, at: r.endL ?? 0, over: S.turnOver } };
      // (the flex: the rays curl to the side from `flexFrom` past the seam, so the roots under the skin stay put; B3's
      // curled from the root and pushed them out through the tongue's thin sides)
      if (st === 'flex') {
        const L = r.len, from = Math.min(0.5 * L, (r.endL ?? 0) + S.flexFrom), T = spec.turn;
        spec = { at: (l) => turnToward(T ? slerp(d0, d1, smoothstep(T.at, T.at + T.over, l)) : d0, [0, 0, 1], S.flex * DEG * Math.pow(clamp((l - from) / (L - from), 0, 1), 1.6)) };
      }
    }
    // (a procurrent ray: from where it leaves the skin's end, round B4; lying on the peduncle's margin it stays there)
    if (st === 'flex' && r.kind === 'proc') {
      const L = r.len, from = Math.min(0.8 * L, Math.max(0, sCut - r.base[0])), d0 = spec.dir, hug = spec.hug;
      spec = { at: (l, p) => turnToward(hug ? hug(p, l) : d0, [0, 0, 1], S.flex * DEG * Math.pow(clamp((l - from) / (L - from), 0, 1), 1.6)) };
    }
    return spec;
  };
  const panels = [];
  for (let k = 0; k + 1 < rays.length; k++) {
    const rr = (r) => (r.kind === 'proc' ? S.procReach : S.reach);
    // (round B4: the single-sheet tier reaches the principal rays' tips: it has no lens tubes running on to them, and lod1's
    // visible fin was 0.025 HL short of the hero's)
    const fr = (r) => (r.kind === 'proc' ? S.procReach : 1);
    panels.push({ reach0: rr(rays[k]), reach1: rr(rays[k + 1]), flat0: fr(rays[k]), flat1: fr(rays[k + 1]), notch: S.notch, notchPow: S.notchPow });
  }
  // the sheath's columns across the fan (principal-ray units a: 0 the dorsal-most, P − 1 the ventral-most; the margins
  // past them) with their thickness profiles (a ray's own, between rays interpolated), and its rows along the rays
  const P1 = S.principal - 1, lerpS = (A, Bq, f) => ({
    l0: lerp(A.l0, Bq.l0, f), len: lerp(A.len, Bq.len, f), m: lerp(A.m, Bq.m, f), h: lerp(A.h, Bq.h, f), pre: A.pre.map((q, i) => [lerp(q[0], Bq.pre[i][0], f), lerp(q[1], Bq.pre[i][1], f)]),
  });
  const thick = (c, l) => {
    if (l < c.l0) { const Pr = c.pre; let i = 0; while (i + 2 < Pr.length && Pr[i + 1][0] < l) i++; return lerp(Pr[i][1], Pr[i + 1][1], clamp((l - Pr[i][0]) / Math.max(1e-9, Pr[i + 1][0] - Pr[i][0]), 0, 1)); }
    const x = (l - c.l0) / c.len;
    return x >= 1 ? 0 : c.h * (1 + x * (c.m + x * (-3 - 2 * c.m + x * (2 + c.m))));
  };
  const sheathCols = (o) => {
    const step = o.sheath?.step ?? 1, out = [];
    for (const q of ext(Etop, 0, -1).reverse()) out.push({ ...q, a: -q.e });
    for (let a = 0; a <= P1 + 1e-9; a += step) { const k0 = Math.min(P1 - 1, Math.floor(a)); out.push({ a, ...lerpS(sheath[k0], sheath[k0 + 1], a - k0) }); }
    for (const q of ext(Ebot, P1, 1)) out.push({ ...q, a: P1 + q.e });
    return out;
  };
  const sheathRows = (o, c) => { const n = o.sheath?.rows ?? 8, ls = [c.pre[0][0]]; for (let i = 0; i < n; i++) ls.push(c.l0 + c.len * (i / (n - 1)) ** (o.sheath?.pow ?? 1)); return ls; };
  const nearRay = (a) => NP + clamp(Math.round(a), 0, P1);
  const fanPoint = (S2, a, l) => {
    // (the unpleated centre line between the rays at a, and the fin's normal there; past the outermost rays run on by
    // the spacing between the last two)
    const at = (p) => { const k = NP + p, t = l / rays[k].len; return { C: curveAt(S2.curves[k], t), N: S2.frame(k, clamp(t, 0, 1)).N }; };
    if (a < 0 || a > P1) { const e = a < 0 ? -a : a - P1, A = at(a < 0 ? 0 : P1), Bq = at(a < 0 ? 1 : P1 - 1); return { C: add(A.C, mul(sub(A.C, Bq.C), e)), N: A.N }; }
    const k0 = Math.min(P1 - 1, Math.floor(a)), f = a - k0, A = at(k0), Bq = at(k0 + 1);
    return { C: lerp3(A.C, Bq.C, f), N: nrm(lerp3(A.N, Bq.N, f)) };
  };
  return {
    name: 'Fin_Caudal', type: 'caudal', joint: 'spine', rect: FIN_ATLAS.Fin_Caudal, rays, panels,
    targets: ['fold', 'spread', 'flex'], state, hint: () => [0, 0, 1], pleat: S.pleat, sag: S.sag, segScale: S.segScale, rowPow: 1.3,
    plate: { s: sH, end: sE, top: plate.top, bottom: plate.bottom },
    space: () => plate.space, cardTargets: ['fold', 'spread', 'flex'],
    // (round B4: the fleshy base as a sheath: a grid of columns × rows on either face; the rays' rows hidden in it thinned)
    sheath: { Etop, Ebot, rays: sheath.map((q) => ({ l0: q.l0, len: q.len, h: q.h, m: q.m })) },
    extraLayout: (o, { vert, tris, type }) => {
      if (o.sheath === false) return;
      const cols = sheathCols(o);
      for (const side of [1, -1]) {
        const ids = cols.map((c) => sheathRows(o, c).map((l) => { const k = nearRay(c.a); return vert({ type, k, t: l / rays[k].len, a: NP + c.a, sh: { col: c, side, l } }); }));
        for (let ci = 0; ci + 1 < cols.length; ci++) for (let ri = 0; ri + 1 < ids[ci].length; ri++) {
          const p = ids[ci][ri], q = ids[ci + 1][ri], r = ids[ci + 1][ri + 1], s = ids[ci][ri + 1];
          tris.push(p, q, r, p, r, s);
        }
      }
    },
    extraPoint: (v, S2) => {
      const c = v.sh.col, { C, N } = fanPoint(S2, c.a, v.sh.l), h = thick(c, v.sh.l);
      return { p: add(C, mul(N, v.sh.side * h)), ref: mul(N, v.sh.side), base: rays[v.k].base };
    },
    // (the rays' lenses thin to a thread inside the sheath, so the translucent fin shows no comb under it)
    lensScale: (k, t) => {
      const r = rays[k]; if (r.kind !== 'soft') return 1;
      const q = sheath[k - NP], t0 = (q.l0 + (S.flesh.cover - 0.25) * q.len) / r.len, t1 = (q.l0 + S.flesh.cover * q.len) / r.len;
      return 0.15 + 0.85 * smoothstep(t0, t1, t);
    },
    rowsFor: (k, ts, o) => {
      const r = rays[k];
      if (o.sheath === false || r.kind !== 'soft') return ts;
      const q = sheath[k - NP], tc = Math.min(0.9, (q.l0 + S.flesh.cover * q.len) / r.len);
      return [...ts.filter((t) => t <= 1e-9 || t >= tc + 1e-6), tc].sort((x, y) => x - y);
    },
    // (7 stations, round B3 integration, tech request: the far card's spread fan within 0.95 mm of the hero's in the water)
    cardRays: [0, NP, NP + 0.5 * S.tipAt * (S.principal - 1), NP + S.tipAt * (S.principal - 1), NP + (S.principal - 1) * (1 + S.tipAt) / 2, NP + S.principal - 1, rays.length - 1],
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
 * The left arm's rest pose (A030, A002, B067), the frame the pectoral 'fold' is authored in (round B3: one lobe): the
 * lobe turned about the shoulder until it lies back along the flank `rest.droop` deg below the horizontal, its medial
 * face `rest.gap` HL off the trunk's skin past `rest.from` of its length (its thickness read from the sculpt: radius ×
 * fl and the muscle belly; the root half fans into the flank: the shoulder sits on it and the rig's halo carries the
 * flank there), its outer face out (against the flank's normal at the junction). Returns the shoulder's rotation Q
 * (fish frame, from the bind), the junction's rest place W, the rigid transform `to` (bind → rest) with its inverse
 * `from`, and the joints' quaternions (J_pec; the junction's identity: the blade's fold is the blend shape).
 */
function restArmPose(ctx) {
  const K = ctx.K, P = K.pectoral, R = FIN_SCULPT.pectoral.rest, bare = ctx.bare();
  const S = P.shoulder, W0 = P.wrist, L = len3(sub(W0, S)), u = nrm(sub(W0, S));
  const nA = P.axes?.n ?? [0, 0, 1], fl = P.fl ?? [P.flat, P.flat, P.flat], bl = P.belly;
  const tm = clamp(len3(sub(P.elbow, S)) / L, 0.2, 0.8);
  const quad = (v, t) => v[0] * (((t - tm) * (t - 1)) / tm) + v[1] * ((t * (t - 1)) / (tm * (tm - 1))) + v[2] * ((t * (t - tm)) / (1 - tm));
  const thick = (t) => (quad(P.radius, t) + (bl ? bl.amp * Math.exp(-(((t - bl.at) / bl.w) ** 2)) : 0)) * quad(fl, t);
  // the lobe from the shoulder, `droop` deg below the horizontal and turned in until its medial face is `gap` off the
  // flank at its tightest past `from` of its length
  const at = (zc) => nrm([Math.cos(R.droop * DEG), -Math.sin(R.droop * DEG), zc]);
  const clearance = (zc) => { let m = Infinity; const d = at(zc); for (let i = 0; i <= 10; i++) { const t = R.from + (1 - R.from) * (i / 10); m = Math.min(m, bare.f(add(S, mul(d, t * L))) - thick(t)); } return m - R.gap; };
  let a = -1.5, b = 1.5;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (clearance(m) < 0) a = m; else b = m; }
  const W = add(S, mul(at(b), L));
  const Q = m3.between(frameOf(u, nA), frameOf(sub(W, S), nrm(bare.grad(W))));
  const QT = m3.T(Q);
  const to = (x) => add(S, m3.apply(Q, sub(x, S)));
  const from = (y) => add(S, m3.apply(QT, sub(y, S)));
  return { Q, Q2: Q, W, to, from, quats: { shoulder: m3.quat(Q), junction: [0, 0, 0, 1] } };
}

/** The pectoral blade (left; the right is built as its mirror image): round B3's fin on the one-lobe arm. */
function pectoralDef(ctx) {
  const S = FIN_SCULPT.pectoral, P = ctx.K.pectoral, PL = S.plant;
  // the lobe's frame at the junction, as body.mjs builds the lobe: u along it (shoulder → junction), n its outer face's
  // normal (BODY_SCULPT.pectoral.axes.n made square to u), wv across its flat width toward its leading edge (ray 0)
  const u = nrm(sub(P.wrist, P.shoulder));
  const n = nrm(perp(P.axes?.n ?? [0, 0, 1], u));
  const wv = cross(n, u);
  const r = P.radius[2], N = S.rays, half = S.span * r, hEnd = r * (P.fl?.[2] ?? P.flat);
  const lenAt = (x) => S.maxLen * (S.edgeLen + (1 - S.edgeLen) * Math.pow(Math.max(0, 1 - x * x), 0.7));
  const rays = [];
  const spacing = (2 * half) / (N - 1);
  for (let k = 0; k < N; k++) {
    const x = k / (N - 1);
    // straight across the lobe's end: from inside the lobe out along u to its end's skin, then `depth` in (along the
    // lobe's axis, not the skin's normal: the bases stay on their straight line however round the end's corners are);
    // the fleshy base over them as thick as the lobe's end
    const skin = ctx.along(add(P.wrist, add(mul(u, -0.04), mul(wv, lerp(half, -half, x)))), u, 0.3);
    const base = sub(skin, mul(u, S.depth));
    const F = S.flesh;
    rays.push({ base, len: lenAt(2 * x - 1), kind: 'soft', simple: k === 0 || k === N - 1, lead: k === 0, x, flesh: { h: F.k * hEnd * Math.sqrt(Math.max(0.3, 1 - (lerp(0.9, -0.9, x)) ** 2)), w: F.w * spacing, hold: F.hold, over: F.over, swell: 0 } });
  }
  const fanDir = (deg) => add(mul(u, Math.cos(deg * DEG)), mul(wv, Math.sin(deg * DEG)));
  const mid = mul(add(rays[(N - 1) >> 1].base, rays[N >> 1].base), 0.5);

  // ---- plant (from furl): the inner blade along the furled fan to the heel, then turned `ankle` deg toward the outer
  // face n into the sole's plane (spanned by the sole's direction and wv), its rays splayed ±splay in it; nS the sole's
  // normal away from the ground (−u at a 90° ankle)
  const an = PL.ankle * DEG, sDir = nrm(add(mul(u, Math.cos(an)), mul(n, Math.sin(an))));
  // (the sole rolled `plant.roll` deg about its own length, its leading (outer) edge down: flat on the ground when the lobe
  // leans that far out of the stroke's plane, the blade's hinges square to the body's axis: rig.mjs RIG.prop.lobeOut)
  const ro = (PL.roll ?? 0) * DEG, nS0 = nrm(sub(mul(n, Math.cos(an)), mul(u, Math.sin(an))));
  const nS = nrm(add(mul(nS0, Math.cos(ro)), mul(wv, Math.sin(ro)))), wS = nrm(sub(mul(wv, Math.cos(ro)), mul(nS0, Math.sin(ro))));
  const O = add(mid, mul(u, PL.heel));
  const edge = (PL.mode ?? 'sole') === 'edge';
  // (round B4, 'edge': the furled rays turned in the fan's plane toward the trailing edge (−wv, ray N − 1's side) from the
  // heel line square to the lobe, concentric: a ray d HL from the bundle's inner edge at the heel turns over
  // (radius + d) × ankle, so the bundle bends as one strip)
  const lat = (k, l) => dot(add(rays[k].base, mul(fanDir(lerp(S.fan.furl[0], S.fan.furl[1], rays[k].x)), l)), wv);
  const latMin = Math.min(...rays.map((_, k) => lat(k, PL.heel)));
  const plantRay = rays.map((ray, k) => {
    const fa = lerp(S.fan.furl[0], S.fan.furl[1], ray.x), din = fanDir(fa);
    if (edge) {
      const d = lat(k, PL.heel) - latMin, over = Math.max(0.01, (PL.radius + d) * PL.ankle * DEG);
      return { din, toe: fanDir(fa - PL.ankle), at: Math.max(0.05, PL.heel + dot(sub(mid, ray.base), u)), over };
    }
    const sp = lerp(PL.splay, -PL.splay, ray.x) * DEG, toe = nrm(add(mul(sDir, Math.cos(sp)), mul(wS, Math.sin(sp))));
    // the turn's start so that the ray, once turned, runs in the sole's plane: its height there is h0 + a·(din·nS) + I
    let I = 0;
    const M = 64;
    for (let i = 0; i < M; i++) I += (dot(slerp(din, toe, smoothstep(0, 1, (i + 0.5) / M)), nS) * PL.over) / M;
    const a = -(dot(sub(ray.base, O), nS) + I) / dot(din, nS);
    return { din, toe, at: Math.max(0.05, a), over: PL.over };
  });

  // ---- fold: in the arm's rest pose, hugging the bare trunk's flank, swept `rest.sweep` deg up from the lobe's line
  const rest = restArmPose(ctx), bare = ctx.bare();
  const Dl = m3.apply(rest.Q, u), Wl = m3.apply(rest.Q, wv);
  // (up on the flank: the lobe's line turned toward its leading edge, which the rest pose keeps uppermost)
  const sw = S.rest.sweep * DEG * Math.sign(Wl[1] || 1);
  const Dref = nrm(add(mul(Dl, Math.cos(sw)), mul(Wl, Math.sin(sw)))), Wref = nrm(sub(mul(Wl, Math.cos(sw)), mul(Dl, Math.sin(sw))));
  const restSpace = { to: rest.to, from: rest.from, f: bare.f, grad: bare.grad };

  const state = (st, k) => {
    const ray = rays[k], x = ray.x;
    const fan = (key) => ({ dir: fanDir(lerp(S.fan[key][0], S.fan[key][1], x) + (S.turn[key] ?? 0)), curl: { toward: n, angle: (S.curl[key] ?? 0) * DEG, pow: 2 } });
    if (st === 'plant') {
      const pr = plantRay[k], L = ray.len;
      // (round B4 'edge': the furled bundle (its curl toward n kept) bent in its plane; no sole to press)
      if (edge) return { dir: pr.din, turn: { to: pr.toe, at: pr.at, over: pr.over }, curl: { toward: n, angle: (S.curl.furl ?? 0) * DEG, pow: 2 } };
      // (the tips bent a little up off the ground past 0.85 of the ray, as rays bend under the load: Pace & Gibb 2009)
      return { dir: pr.din, turn: { to: pr.toe, at: pr.at, over: pr.over }, sole: pr.at + pr.over, tip: { from: 0.85 * L, toward: nS, angle: PL.tipCurl * DEG } };
    }
    if (st === 'plantHalf') {
      // half way: every step's direction half way between the bind's and the plant's (the rays keep their length)
      const b = fan('bind'), pr = plantRay[k], L = ray.len;
      return {
        at: (l) => slerp(turnToward(b.dir, b.curl.toward, b.curl.angle * (l / L) ** 2), slerp(pr.din, pr.toe, smoothstep(pr.at, pr.at + pr.over, l)), 0.5),
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
  const hintPlant = edge ? n : nrm(add(n, nS));
  const hint = (st) => (st === 'plant' || st === 'plantHalf' ? hintPlant : n);
  const def = {
    name: 'Fin_Pectoral_L', type: 'pectoral', side: 'L', joint: 'J_pecFinL', rect: FIN_ATLAS.Fin_Pectoral_L, rays, panels,
    targets: ['fold', 'spread', 'furl', 'plant', 'plantMid'], cardTargets: ['fold', 'spread', 'furl', 'plant'],
    state, hint, pleat: S.pleat, sag: S.sag, rowPow: 1.25,
    space: (st) => (st === 'fold' ? restSpace : null),
    // (5 stations, round B3 integration, tech request: 3 left the far paddle 0.59 of the hero's area in the water; the
    // margin row 3 % out (cardOut): lod2 → hero max in bind 0.68 → 0.56 mm, land 0.58 → 0.36, water 1.01 → 0.86)
    cardRays: [0, (N - 1) / 4, (N - 1) / 2, (3 * (N - 1)) / 4, N - 1], cardOut: 1.03, cardBend: (k) => Math.min(0.95, (plantRay[k].at + 0.5 * plantRay[k].over) / rays[k].len),
    rowBreaks: (k) => [0, 0.5, 1].map((f) => (plantRay[k].at + f * plantRay[k].over) / rays[k].len).filter((t) => t > 0.02 && t < 0.97),
    frame: { u, n, wv, wrist: P.wrist, mid },
    plantFrame: { nS, sDir, O, rays: plantRay },
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
  // the press states' grounds (S.press, round B4 also S.presses): each one's normal and a point on it
  const yBase = Math.min(...rays.map((r) => r.base[1]));
  // (press: `drop` under the lowest base straight down at the base's centre c; round B4's family by `depth`, the plane's
  // distance along its own normal from the base nearest it, as the rig measures the chest's height over the ground)
  const PRESS = Object.fromEntries([['press', S.press], ...Object.entries(S.presses ?? {}).map(([nm, q]) => [nm, { ...S.press, drop: undefined, ...q }])].map(([nm, q]) => {
    const PN = [-Math.sin(q.tilt * DEG), Math.cos(q.tilt * DEG), 0];
    const low = rays.reduce((a, r) => (dot(r.base, PN) < dot(a.base, PN) ? r : a)).base;
    const P0 = q.depth !== undefined ? sub(low, mul(PN, q.depth)) : [c0, yBase - q.drop, 0];
    return [nm, { ...q, PN, P0, depth: Math.min(...rays.map((r) => dot(sub(r.base, P0), PN))) }];
  }));
  const { PN, P0 } = PRESS.press;
  const state = (st, k) => {
    const r = rays[k], key = st in S.phi ? st : 'bind';
    if (PRESS[st]) {
      // down from the base at `dive` below the ground's tangent, turned onto the ground over the last `knee` above it
      const PR = PRESS[st], side = r.side || 1, L = r.len, phi = (r.kind === 'frenum' ? PR.frenumPhi : PR.phi[r.i]) * DEG;
      const tf = nrm(perp([Math.cos(phi), 0, side * Math.sin(phi)], PR.PN)), td = nrm(add(mul(tf, Math.cos(PR.dive * DEG)), mul(PR.PN, -Math.sin(PR.dive * DEG))));
      return { at: (l, p) => { const hc = (r.kind === 'frenum' ? 0.002 : lensHalf(defRef, r, l / L).h) + PR.margin; return slerp(tf, td, smoothstep(0, PR.knee, dot(sub(p, PR.P0), PR.PN) - hc)); } };
    }
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
  // the outer face of the cup: down and out from its middle (round B3: from the ray bases' height, the belly moved)
  const mid = [c0 + 0.12, yBase - 0.058, 0];
  const hint = () => [0, -1, 0];
  const hintAt = (p) => nrm(add([0, -1, 0], mul(nrm(sub(p, mid)), 0.6)));
  const defRef = {
    name: 'Fin_Pelvic', type: 'pelvic', joint: 'J_pelvic', rect: FIN_ATLAS.Fin_Pelvic, rays, panels,
    targets: ['fold', 'spread', ...Object.keys(PRESS)], state, hint, hintAt, pleat: S.pleat, sag: S.sag, rayScale: S.rayScale,
    // (the far tier's card: 11 stations round the cup's outline, both medial lobes and the notch between them (round B2's 5
    // covered 0.49 of the hero's area from below; these 0.82–0.86 in the bind, fold, spread and press, 20 triangles)
    cardRays: [1, 2.5, 4, 5.3, nl, nl + 0.5, nl + 1, nl + 1.7, nl + 3, nl + 4.5, 2 * nl], cardTargets: ['fold', 'spread', ...Object.keys(PRESS)],
    // (the margin row 4 % out, round B3 integration, tech request: the card covered 0.82-0.86 of the hero cup from below,
    // now 0.88-0.94, IoU 0.83-0.86)
    cardOut: 1.04,
    press: { normal: PN.map((c) => +c.toFixed(6)), point: P0.map((c) => +(c * HL).toFixed(4)) },
    // (round B4: every press of the family, its plane (fish mm, in J_pelvic's bind frame) and the bases' height over it,
    // HL, and the front raise it was authored for, by its order of depth: pelvicPressWeights)
    presses: Object.fromEntries(Object.entries(PRESS).sort((a, b) => a[1].depth - b[1].depth).map(([nm, q]) => [nm, { normal: q.PN.map((c) => +c.toFixed(6)), point: q.P0.map((c) => +(c * HL).toFixed(4)), depthHL: +q.depth.toFixed(4), raiseDeg: q.raise ?? q.tilt }])),
  };
  return defRef;
}

/**
 * The pelvic press family's weights for a chest at `heightHL` over the ground (round B4): the lowest pelvic ray base's
 * height over the ground plane, HL, measured along the plane's normal in J_pelvic's bind frame (pitch 0). Between two
 * presses' depths (def.presses, by depth) the two are blended linearly; under the shallowest, it is eased in from the bind
 * cup's own depth (the dish's lowest point under its bases: nothing to press); past the deepest, that one at 1 and
 * J_pelvic's pitch (+: the cup's rear down) takes it the rest of the way. The rig (pressPelvic) then pitches J_pelvic within
 * its clean range until the blended cup's lowest point is on the ground. Returns { [target]: w } (absent = 0).
 */
export function pelvicPressWeights(def, heightHL) {
  const fam = Object.entries(def.presses ?? { press: { depthHL: FIN_SCULPT.pelvic.press.drop } }).map(([nm, q]) => [nm, q.depthHL]).sort((a, b) => a[1] - b[1]);
  if (def._bindDepth === undefined) {
    const curves = rayCurves(def, 'bind'), y0 = Math.min(...def.rays.map((r) => r.base[1]));
    let lo = Infinity; for (const c of curves) for (const p of c.pts) lo = Math.min(lo, p[1]);
    Object.defineProperty(def, '_bindDepth', { value: Math.max(0, y0 - lo), enumerable: false });
  }
  const h0 = def._bindDepth, [n0, d0] = fam[0];
  if (heightHL <= d0) return heightHL <= h0 ? {} : { [n0]: +clamp((heightHL - h0) / Math.max(1e-6, d0 - h0), 0, 1).toFixed(4) };
  for (let i = 0; i + 1 < fam.length; i++) {
    const [na, da] = fam[i], [nb, db] = fam[i + 1];
    if (heightHL <= db) { const t = (heightHL - da) / (db - da); return { [na]: +(1 - t).toFixed(4), [nb]: +t.toFixed(4) }; }
  }
  return { [fam[fam.length - 1][0]]: 1 };
}

/**
 * The pelvic cup pressed onto a ground given in J_pelvic's bind frame (round B4; the rig carries the posed ground back
 * through J_pelvic's world transform): the press family's weights (pelvicPressWeights by the bases' height, then the
 * blend between the bracketing pair bisected until the cup's lowest point is on the ground at pitch 0), and only where
 * the deepest press still falls short or the shallowest still sinks in, J_pelvic's pitch (deg, + the cup's rear down,
 * about BODY_SCULPT.pelvicBase.c) searched out from 0 within `pitch` for the nearest contact.
 * @param def Fin_Pelvic's def; @param mesh its buildFinMesh mesh (fish mm); @param targets buildFinTargets(def, mesh)
 * @param ground { normal, point } (fish frame, mm; the normal away from the ground)
 * @returns { weights, pitch, gapMM (the lowest point over the ground, mm; 0 on contact), heightHL (the bases'), note? }
 */
export function pelvicPress(def, mesh, targets, ground, { pitch: [p0, p1] = [-5, 16], K = BODY_SCULPT } = {}) {
  const n = mesh.position.length / 3, N = ground.normal, G = ground.point, C = K.pelvicBase.c.map((c) => c * HL);
  const H = Math.min(...def.rays.map((r) => dot(sub(mul(r.base, HL), G), N))) / HL;
  const shapeOf = (ws) => { const P = Float64Array.from(mesh.position); for (const [nm, w] of Object.entries(ws)) { const k = targets.names.indexOf(nm); if (k < 0 || !w) continue; const D = targets.deltas[k]; for (let i = 0; i < n * 3; i++) P[i] += w * D[i]; } return P; };
  const low = (P, pitch) => {
    const a = (-pitch * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a); let lo = Infinity;
    for (let i = 0; i < n; i++) { const x = P[i * 3] - C[0], y = P[i * 3 + 1] - C[1]; lo = Math.min(lo, (x * ca - y * sa + C[0] - G[0]) * N[0] + (x * sa + y * ca + C[1] - G[1]) * N[1] + (P[i * 3 + 2] - G[2]) * N[2]); }
    return lo;
  };
  const bis = (f, a, b) => { const sa = Math.sign(f(a)); for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.sign(f(m)) === sa) a = m; else b = m; } return b; };
  let ws = pelvicPressWeights(def, H);
  const names = Object.keys(ws), fam = Object.entries(def.presses ?? {}).sort((a, b) => a[1].depthHL - b[1].depthHL).map(([nm]) => nm);
  // (the blend between the bracketing pair (or the shallowest eased from nothing) refined to touch at pitch 0)
  const pair = names.length === 2 ? names : names.length === 1 ? (fam.indexOf(names[0]) > 0 && ws[names[0]] === 1 ? [fam[fam.indexOf(names[0]) - 1], names[0]] : [null, names[0]]) : null;
  if (pair) {
    const at = (t) => low(shapeOf({ ...(pair[0] ? { [pair[0]]: 1 - t } : {}), [pair[1]]: t }), 0);
    if (at(0) > 0 && at(1) < 0) { const t = bis(at, 0, 1); ws = { ...(pair[0] ? { [pair[0]]: +(1 - t).toFixed(4) } : {}), [pair[1]]: +t.toFixed(4) }; }
    else ws = at(1) >= 0 ? { [pair[1]]: 1 } : pair[0] ? { [pair[0]]: 1 } : {};
  }
  const P = shapeOf(ws), g0 = low(P, 0);
  let pitch = 0, note;
  if (Math.abs(g0) > 1e-4) {
    let found = null;
    for (let st = 0.5; st <= Math.max(-p0, p1) + 1e-9 && found === null; st += 0.5) for (const dir of [1, -1]) { const x = dir * st; if (x < p0 || x > p1) continue; if (Math.sign(low(P, x)) !== Math.sign(g0)) { found = bis((q) => low(P, q), dir * (st - 0.5), x); break; } }
    if (found !== null) pitch = +found.toFixed(3); else note = g0 > 0 ? 'the cup cannot reach the ground' : 'the cup is under the ground at every pitch in range';
  }
  return { weights: ws, pitch, gapMM: +Math.max(0, low(P, pitch)).toFixed(4), heightHL: +H.toFixed(4), ...(note ? { note } : {}) };
}

/** The right pectoral: the left one mirrored (z → −z); its meshes are built from the left one's. */
function mirrorDef(L) {
  const m = (p) => [p[0], p[1], -p[2]];
  return {
    ...L, name: 'Fin_Pectoral_R', side: 'R', joint: 'J_pecFinR', rect: FIN_ATLAS.Fin_Pectoral_R,
    rays: L.rays.map((r) => ({ ...r, base: m(r.base) })), mirrorOf: L,
    frame: { u: m(L.frame.u), n: m(L.frame.n), wv: m(L.frame.wv), wrist: m(L.frame.wrist), mid: m(L.frame.mid) },
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
 * The left pectoral's data for the rig and the runtime (fish mm / fish-frame unit vectors, bind space; round B3):
 *   junctionPivot  the middle of the rays' bases: the J_pecFin pivot (the lobe/fin junction, the radial–ray joint)
 *   bladePivot     the heel (the middle rays' turn in 'plant', half way through it): the J_pecMid pivot, the ankle the
 *                  sole turns on (its flex axis: sole.axis)
 *   tipPivot       the planted sole's middle rays at `tipAt` of their length: the J_pecTip pivot (the tips bending
 *                  under load, the roll-off)
 *   flexAxis       the blade joints' common flex axis (wv: across the rays; + bends the distal part toward the outer
 *                  face n, which faces forward when the lobe stands as a leg)
 *   sole           the planted sole (blend shape 'plant' at 1): { normal (its plane's normal, away from the ground: the
 *                  world's up once the rig stands the arm so), point (its centroid), heel (= bladePivot), axis (the heel
 *                  line, across the rays), toe (its mean ray direction), tip (the middle rays' tips: the crawl's welded
 *                  point), ankle (deg), heelHL (from the middle rays' bases), from: { rayT (per ray: the sole starts) } }
 *   restPose       the arm's rest pose the 'fold' is authored in (restArmPose): the shoulder's local rotation as a
 *                  quaternion [x, y, z, w] about its bind pivot, { fish: { J_pecL }, object: { J_pecL } } (bind rotations
 *                  are identity, so object-frame local = the viewer's / glTF's); the blade's joints at rest
 *   prop           { junctionDeg }: the junction's nominal flexion in the propped stance (FIN_SCULPT.pectoral.prop)
 */
const TIP_AT = 0.8;
function pectoralExtras(d) {
  const S = FIN_SCULPT.pectoral, PF = d.plantFrame, n = d.rays.length;
  const curves = rayCurves(d, 'plant');
  const mids = [(n - 1) >> 1, n >> 1];
  const avgMid = (t) => mul(mids.map((k) => curveAt(curves[k], t(k))).reduce((a, b) => add(a, b)), 0.5);
  const heel = avgMid((k) => (PF.rays[k].at + 0.5 * PF.rays[k].over) / d.rays[k].len);
  // (the welded tip: the middle ray's tip vertex itself, its pleat included, so the contact is a vertex of the mesh)
  const tipP = avgMid(() => TIP_AT), tipEnd = sampler(d, 'plant').frame(n >> 1, 1).C;
  let sum = [0, 0, 0], cnt = 0, toe = [0, 0, 0];
  const from = [];
  curves.forEach((c, k) => {
    const t0 = (PF.rays[k].at + PF.rays[k].over) / d.rays[k].len;
    from.push(+Math.min(1, t0).toFixed(4));
    toe = add(toe, PF.rays[k].toe);
    for (let i = 0; i <= NSTEP; i++) if (i / NSTEP >= t0) { sum = add(sum, c.pts[i]); cnt++; }
  });
  const point = cnt ? mul(sum, 1 / cnt) : heel;
  const r4 = (v) => v.map((c) => +c.toFixed(4)), r6 = (v) => v.map((c) => +c.toFixed(6));
  // (round B4: the pivot moved `junctionShift` HL across the rays' bases toward the trailing edge, the inner side of the
  // land's in-plane bend (u1's V: the blade swept ~80° toward its trailing edge), so that side turns on the pivot instead
  // of being crushed)
  d.junctionPivot = r4(mul(add(d.frame.mid, mul(d.frame.wv, S.junctionShift ?? 0)), HL));
  d.bladePivot = r4(mul(heel, HL));
  d.tipPivot = r4(mul(tipP, HL));
  d.flexAxis = r6(d.frame.wv);
  // (round B4 'edge': the foot lies on its edge, its broad face's normal n; the heel's axis n, the in-plane bend's)
  const edgeMode = (S.plant.mode ?? 'sole') === 'edge';
  d.sole = {
    ...(edgeMode ? { edge: true } : {}),
    normal: r6(edgeMode ? d.frame.n : PF.nS), point: r4(mul(point, HL)), heel: r4(mul(heel, HL)), axis: r6(edgeMode ? d.frame.n : d.frame.wv), toe: r6(nrm(toe)), tip: r4(mul(tipEnd, HL)),
    ankle: S.plant.ankle, heelHL: S.plant.heel, from: { rayT: from },
  };
  const q = d.rest.quats;
  d.restPose = {
    note: 'the arm\'s rest pose the pectoral fold is authored in (fins.mjs restArmPose): the shoulder\'s local rotation about its bind pivot; the blade\'s joints at rest',
    fish: { J_pecL: r6(q.shoulder) },
    object: { J_pecL: r6(quatToObject(q.shoulder)) },
  };
  d.prop = { junctionDeg: S.prop.junction, ...(S.prop.sweep !== undefined ? { sweepDeg: S.prop.sweep } : {}) };
  // (the furled blade's tip: the crawl's welded point when the blade crutches furled, and the ray's direction there)
  { const SF = sampler(d, 'furl'), F1 = SF.frame(n >> 1, 1); d.furl = { tip: r4(mul(F1.C, HL)), tipDir: r6(F1.T) }; }
}

/** The right pectoral's copies of the left's extras, mirrored (z → −z; rotations as axial vectors). */
function mirrorExtras(R) {
  const L = R.mirrorOf, mp = (p) => [p[0], p[1], -p[2]], mq = (q) => [-q[0], -q[1], q[2], q[3]];
  R.junctionPivot = mp(L.junctionPivot); R.bladePivot = mp(L.bladePivot); R.tipPivot = mp(L.tipPivot); R.flexAxis = mp(L.flexAxis);
  R.sole = { ...L.sole, normal: mp(L.sole.normal), point: mp(L.sole.point), heel: mp(L.sole.heel), axis: mp(L.sole.axis), toe: mp(L.sole.toe), tip: mp(L.sole.tip) };
  const fish = { J_pecR: mq(L.restPose.fish.J_pecL) };
  R.restPose = { note: L.restPose.note, fish, object: Object.fromEntries(Object.entries(fish).map(([k, q]) => [k, quatToObject(q)])) };
  R.prop = { ...L.prop };
  R.furl = { tip: mp(L.furl.tip), tipDir: mp(L.furl.tipDir) };
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
      // (the planted pectoral's tips bent under load past `tip.from`)
      if (spec.tip && l > spec.tip.from) d = turnToward(d, spec.tip.toward, spec.tip.angle * ((l - spec.tip.from) / Math.max(1e-6, L - spec.tip.from)));
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
  // (a fin may take its normal from the hint alone in a state (def.normalHint: the folded anal fin, whose rays lie along
  // one another, round B3), where the line through the neighbours runs along the ray)
  let N = def.normalHint?.(st) ? [0, 0, 0] : cross(T, sub(Cn ?? C, Cp ?? C));
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
    // (a fin's own scale on a lens, e.g. thin where its extra surface hides it: round B4's caudal sheath)
    if (def.lensScale) { const q = def.lensScale(k, t); w *= q; h *= q; }
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
      // (round B3: the lenses' width may ease out on its own, later than their thickness (wEase, l), so the slab stays
      // closed while it thins to the bare rays)
      const ew = r.flesh.wEase ? 1 - smoothstep(r.flesh.wEase[0], r.flesh.wEase[1], l) : e;
      if (e > 0 || ew > 0) { h = Math.max(h, r.flesh.h * sw * e); w = Math.max(w, Math.min(r.flesh.w, 0.49 * gap) * ew); box = ew; }
    }
    // (the planted sole: the rays pressed flat on their ground side)
    const press = specs[k].sole !== undefined && l > specs[k].sole ? FIN_SCULPT.pectoral.plant.flat : 1;
    // the pleat: the rays alternately to either side, growing to the tip (the edge rays half)
    const sg = (k % 2 ? 1 : -1) * (k === 0 || k === n - 1 || r.kind === 'frenum' ? 0.5 : 1) * (r.kind === 'frenum' ? 0 : 1);
    // (planted: the pleats of the furled inner blade flattened over the sole, to `plant.solePleat` of theirs; none over a
    // fleshy base: the rays lie side by side in it, round B3)
    const pa = specs[k].sole !== undefined ? pleatAmp * lerp(1, FIN_SCULPT.pectoral.plant.solePleat ?? 1, smoothstep(specs[k].sole - 0.1, specs[k].sole - 0.02, l)) : pleatAmp;
    const Cq = add(C, mul(N, sg * pa * Math.pow(t, 0.8) * (1 - box)));
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
const LENS = 0, TIP = 1, EDGE = 2, MEM = 3, COL = 4, EXTRA = 5;   // (EXTRA: a fin's own extra surface, def.extraLayout / extraPoint: round B4's caudal sheath)

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
    const ts = makeRows(nk, br, def.rowPow ?? 1);
    // (a fin may thin a ray's rows where its own extra surface hides it: the caudal's sheath, round B4)
    return def.rowsFor ? def.rowsFor(k, ts, o) : ts;
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
  if (def.extraLayout) def.extraLayout(o, { vert, tris, type: EXTRA });
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
      // (between embedded roots, the caudal's under the skin of the peduncle's end: on their line, not the skin)
      rootCache.set(key, def.type === 'pectoral' || def.rays[k].embed || def.rays[k + 1].embed
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
    if (F.box > 0) { const k = 1 - (def.fleshSquare ?? 0.6) * F.box; x = Math.sign(x) * Math.abs(x) ** k; y = Math.sign(y) * Math.abs(y) ** k; }
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
    } else if (v.type === EXTRA) {
      ({ p, ref: rf, base: b } = def.extraPoint(v, S, st));
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
  // (round B4, tech P4: the end pads hold the edge rays' widest lens — a fleshy root's reaches ±uv.flesh of its slot,
  // not uvH — or its outer half clamped onto the rect's border: 28 hero pectoral triangles a side with no UV area)
  const edgeH = (r) => (r.flesh ? Math.max(uvH, FIN_SCULPT.uv.flesh) : uvH);
  const padL = edgeH(src.rays[0]) * w[0], padR = edgeH(src.rays[n - 1]) * w[w.length - 1], total = A[n - 1] + padL + padR;
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
  // (round B4: the vertices of a fin's extra surface flagged, 1: the caudal's fleshy sheath, for the materials (opaque)
  // and the checks)
  if (def.extraLayout) { const ex = new Uint8Array(nV); for (let i = 0; i < nV; i++) ex[i] = lay.V[i].type === EXTRA ? 1 : 0; Object.defineProperty(mesh, 'extra', { value: ex, enumerable: false }); }
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
 * The far tier's fin: a strip of triangles over the outline (stations across the fin, def.cardRays: five by default,
 * round B3's pectoral five, caudal seven, pelvic eleven; each from its root to the membrane's margin, pushed out by
 * def.cardOut, the pectoral's over the plant's heel), with the fin's uv rect
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
    // (def.cardOut: the margin row pushed out along the rays, at most to their tips: a card's chords between its stations
    // cut inside the fin's curved margin; round B3 integration, the pelvic's)
    const co = def.cardOut ?? 1, tk = Math.min(1, (co * Math.min(E * Lm, L0)) / La), tj = Math.min(1, (co * Math.min(E * Lm, L1)) / Lb);
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
  // (round B3, the pectorals: their card's states and, for 'plant', the junction's nominal prop flexion baked in: the far
  // tier has the arm as J_pecL alone; the right card's from the left's, mirrored)
  if (def.type === 'pectoral' && def.mirrorOf) {
    const L = finCardTargets(def.mirrorOf), fz = (a) => a.map((v, i) => (i % 3 === 2 ? -v : v));
    return { names: L.names, deltas: L.deltas.map(fz), normals: L.normals.map(fz) };
  }
  const bind = finCard(def), names = def.cardTargets ?? (def.type === 'pectoral' ? ['fold', 'plant'] : ['fold']);
  const deltas = [], normals = [];
  for (const st of names) {
    const c = finCard(def, { state: st });
    if (def.type === 'pectoral' && st === 'plant' && def.prop?.sweepDeg) {
      // (round B4: the land leg's junction swept in the blade's own plane (the rig's J_pecFin sweep about n at the
      // junction's pivot, + toward the leading edge wv = n × u), the far tier's arm being J_pecL alone)
      const piv = def.junctionPivot ?? mul(def.frame.mid, HL), ax = def.frame.n, a = def.prop.sweepDeg * DEG;
      for (let i = 0; i < c.position.length; i += 3) {
        const p = rotAbout(sub([c.position[i], c.position[i + 1], c.position[i + 2]], piv), ax, a), q = rotAbout([c.normal[i], c.normal[i + 1], c.normal[i + 2]], ax, a);
        c.position.set(add(p, piv), i); c.normal.set(q, i);
      }
    } else if (def.type === 'pectoral' && st === 'plant' && def.prop?.junctionDeg) {
      const piv = mul(def.frame.mid, HL), ax = def.frame.wv, a = def.prop.junctionDeg * DEG;
      // (+ toward the outer face n: the sense whose turn of u leans toward n)
      const sg = dot(cross(ax, def.frame.u), def.frame.n) >= 0 ? 1 : -1;
      for (let i = 0; i < c.position.length; i += 3) {
        const p = rotAbout(sub([c.position[i], c.position[i + 1], c.position[i + 2]], piv), ax, sg * a), q = rotAbout([c.normal[i], c.normal[i + 1], c.normal[i + 2]], ax, sg * a);
        c.position.set(add(p, piv), i); c.normal.set(q, i);
      }
    }
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
