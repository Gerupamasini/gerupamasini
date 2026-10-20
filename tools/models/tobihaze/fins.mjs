// The トビハゼ's fins as meshes: the two dorsal fins, the anal fin and the caudal fin on the body's midline, the pectoral
// blades on the ends of the muscular lobes, the pelvic cup under the chest. Each fin is a fan of rays and a membrane
// between them, in the fish frame of anatomy.mjs (tables in head lengths HL, meshes in mm).
//
// Counts and shapes (research: literature_morph §2, §4; body_fins_colour §2, §6.2; measurements §1; behaviour §1.2, §5):
//   D1 XII flexible spines, a tall rounded fan, the spine tips standing a little free of the membrane (a notched margin);
//      about 0.6 of the body depth when half raised (A070, B067, B014), 0.9-1.0 erect (A001, B062, A065); folded it lies
//      along the back and stops short of D2 (Lee 1995).
//   D2 I,12, long and low, rounded in front, even height (0.38-0.45 BD erect: A065, A001).
//   anal I,11, low, mirroring D2 on the belly (0.4-0.5 BD erect: A065).
//   caudal 17 principal rays (the outermost of each lobe unbranched) and procurrent rays (6 dorsal, 6 ventral) along the
//      peduncle's edges; on land folded into a pointed lanceolate spear, its tip a little below the body's axis and its
//      lower margin the straighter and longer (A017, A070, A059); spread rounded-lanceolate (A061, A065); the lowest
//      rays thickened distally (genus character, Murdy 1989).
//   pectoral blade 14 soft rays fanning from the lobe's wrist, the blade continuing the lobe (B010, A005); spread
//      120-150 deg under water (A061), furled on land, flexed flat on the ground under the wrist when propped (A070,
//      A001, A005); about 0.4 HL long (measurements: whole fin 0.80 HL).
//   pelvic I,5 a side: two fins joined in front by a frenum and along their inner rays by a membrane about half their
//      length, the rear margin notched: a shallow cup open to the rear under the chest (Murdy, Lee, Itoh; B014, B067,
//      B010), 0.3-0.5 HL long.
//
// Geometry. Every ray is a raised round ridge on both faces of the membrane: a lens-shaped tube (half-width w across the
// fin, half-thickness h through it) along the ray's centre line, the membrane sheet running from the edge of one ray's
// lens to the edge of the next (the two share their positions exactly, so nothing gaps). Spines are thick at the base
// and taper; the soft rays narrow a little at every other row (the segments) and, with four segments to an arc, split
// into two ridges near their tips (the branches). The membrane sags between the rays and pleats (the rays alternately
// a little to either side), and ends a little short of the ray tips between them (a scalloped margin; D1's notched
// between the free spine tips). The lighter tier (relief: false) is the same fin as a single sheet whose columns run
// along the rays.
//
// Placement. The bases sit on the body's skin (the field of body.mjs, read at build time with the keels, the lobe's
// wrist and the pelvic base of BODY_SCULPT, so the trunk's changes carry over), a little under it so no seam shows from
// any side; the dorsal and anal base lines follow the back's and belly's curve. Past the root the rays are kept off the
// body (pushed out along the field's gradient), and so is every vertex of the membrane.
//
// States: the bind mesh is the relaxed, half-raised fin; buildFinTargets gives the blend shapes towards
//   fold     D1, D2 down along the back, the anal fin back along the belly, the caudal closed into its spear, the
//            pectoral blade's fan closed, the pelvic fins folded back against the belly
//   spread   erect / the fan fully open
//   flex     (caudal) the fin's rear bent to the fish's left (+z); a negative weight bends it to the right
//   plant    (pectoral) the blade flexed at the wrist and laid flat across the lobe's end, fanned forwards and outwards:
//            on the ground when the lobe stands as a leg (prop, crutching); plantMid is its corrective, driven at
//            4w(1-w) with plant = w, which keeps the rays their length half way (a 90 deg turn blended linearly would
//            shorten them by 29 %)
// Each target also comes with its normals' deltas (unit vectors, fish frame: dirToObject, no scale), so the folded,
// spread and planted fins shade as they lie.
//
// Interface (body_contract §5): FIN_SCULPT, FIN_ATLAS, finDefinitions(K), buildFinMesh(def, { sub, nt, m?, relief? }),
// buildFinTargets(def, mesh) → { names, deltas (mm), normals }, finCard(def, { state? }), finTierParams(tier). Besides
// the contract's fields a mesh carries `build` (its options; buildFinTargets rebuilds from them for a copied mesh) and,
// not enumerable, `root` (the root point under every vertex, mm). The pectoral defs carry `bladePivot` (mm): half way
// out along the middle of the fan, for the rig's J_pecBlade. Weights (rig.mjs finWeights): D1, D2 and the anal fin by
// each vertex's baseS (the axial row of the body under its root), the caudal by the vertex's own s, the blade from
// J_pecWrist (rayT < 0.3) to J_pecBlade (0.6), the pelvic on J_pelvic; a lens and the membrane edge beside it share
// positions and attributes, so they skin alike.
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
  base: { depth: 0.006, free: 0.02, clear: 0.004, ramp: 0.05, minClear: 0.0015, along: 0.03 },
  // a folded median ray first rises at `lift` deg over its `knuckle` (HL), then lies at its fold angle over the skin
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
  d1: {
    keel: 'd1', inset: [0.012, 0.02], spines: 12,
    len: [0.56, 0.63, 0.65, 0.63, 0.59, 0.53, 0.46, 0.39, 0.32, 0.26, 0.20, 0.15],
    angle: { bind: [54, 9], spread: [98, 24], fold: [6, 4] }, anglePow: { bind: 1.35 },
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
  // caudal: 17 principal rays from the peduncle's end (bases over `span` of its depth about its centre line), dorsal
  // and ventral procurrent rays along its edges in front; principal lengths a lanceolate profile peaking at `tipAt` of
  // the fan (dorsal 0 → ventral 1, below the middle: the tip under the axis, the lower margin the longer); angles (deg,
  // from the body's axis, + up) of the dorsal-most and ventral-most principal rays per state
  caudal: {
    principal: 17, span: 0.42, maxLen: 0.685, tipAt: 0.69, upperDrop: [0.5, 1.4], lowerDrop: [0.14, 1.5],
    angle: { bind: [8, -4], spread: [36, -28], fold: [-9, 2], flex: [8, -4] },
    procS: [-0.2, -0.16, -0.12, -0.08, -0.04, -0.005],   // from the caudal base
    procLen: { dorsal: [0.035, 0.06, 0.09, 0.125, 0.165, 0.21], ventral: [0.04, 0.07, 0.10, 0.14, 0.18, 0.23] },
    procAngle: { bind: [10, 14], spread: [22, 30], fold: [-2, -4], flex: [10, 14] },
    thick: 3,            // the lowest principal rays thickened distally
    segScale: 0.5,       // its rows are far apart: the segments' joints only hinted
    flex: 38,            // deg the rays curl to the side at full flex
    reach: 0.97, procReach: 0.93, notch: 0.025, notchPow: 0.9,
    pleat: { bind: 0.005, spread: 0.002, fold: 0.008, flex: 0.005 }, sag: { bind: 0.004, spread: 0.001, fold: 0.002, flex: 0.004 },
  },
  // pectoral blade: 14 rays from an arc round the lobe's rounded end (± `baseArc` deg about the lobe's axis, the root's
  // depth under its skin); lengths `maxLen` in the middle of the fan, `edgeLen` of that at its edges; fan angles (deg) in the lobe's flat plane (+ towards the lobe's upper edge), turned back by `turn`;
  // the blade cupped towards the body (`curl`); plant: the blade laid across the lobe's end, its rays from `planted[0]`
  // (out and a little back) to `planted[1]` (forwards and a little in), the turn at the wrist `bendAt` from the base
  // over `bendOver`
  pectoral: {
    rays: 14, baseArc: 50, maxLen: 0.36, edgeLen: 0.70,
    fan: { bind: [44, -44], spread: [72, -72], fold: [6, -6] },
    turn: { bind: 6, spread: 4, fold: 10 },
    curl: { bind: 8, spread: 3, fold: 5, plant: 0 },
    planted: [28, -100], bendAt: 0.012, bendOver: 0.065,
    reach: 0.97, notch: 0.04, notchPow: 0.85,
    pleat: { bind: 0.005, spread: 0.0015, fold: 0.009, plant: 0.002 }, sag: { bind: 0.004, spread: 0.001, fold: 0.002, plant: 0.002 },
  },
  // pelvic: per side the spine and 5 soft rays, bases along a short transverse line on the pelvic base (s from the base
  // centre, z), each ray's direction as (phi: deg round the vertical, 0 back, 90 out; beta: deg down from horizontal);
  // the frenum's front edge on the midline (F); the cup curls down at its rim; its rays a `rayScale` of the others' girth
  pelvic: {
    base: { s: [-0.045, -0.040, -0.035, -0.030, -0.025, -0.020], z: [0.050, 0.042, 0.034, 0.026, 0.018, 0.010], frontS: -0.055 },
    len: [0.17, 0.25, 0.30, 0.34, 0.36, 0.34], frenumLen: 0.08,
    phi: { bind: [105, 76, 54, 36, 20, 7], spread: [125, 95, 70, 47, 27, 10], fold: [40, 29, 21, 14, 8, 3] },
    beta: { bind: [55, 48, 38, 30, 24, 20], spread: [34, 30, 26, 22, 19, 16], fold: [12, 11, 10, 9, 8, 7] },
    frenum: { bind: [180, 70], spread: [180, 55], fold: [180, 55] },
    curl: { bind: 12, spread: 8, fold: 3 },
    frenumReach: 0.55, reach: 0.96, medialReach: 0.5, medialNotch: 0.12, notch: 0.03, notchPow: 0.85,
    rootDepth: 0.006, rayScale: 0.72,
    pleat: { bind: 0.004, spread: 0.0015, fold: 0.007 }, sag: { bind: 0.003, spread: 0.001, fold: 0.002 },
  },
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
      Fin_Pectoral_L: { relief: false, sub: 2, nt: 9 },
      Fin_Pectoral_R: { relief: false, sub: 2, nt: 9 },
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
  const ctx = { K, F, f, grad, along, project, root, prof, midY, midFrame };
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
      return { hug: (p, l) => { const fr = ctx.midFrame(p[0], up), b = lerp(FIN_SCULPT.fold.lift * DEG, a, smoothstep(0, FIN_SCULPT.fold.knuckle, l)); return add(mul(fr.T, Math.cos(b)), mul(fr.O, Math.sin(b))); } };
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

/** The caudal fin: procurrent rays along the peduncle's edges, the principal rays from its end. */
function caudalDef(ctx) {
  const S = FIN_SCULPT.caudal, K = ctx.K, B = FIN_SCULPT.base;
  const q = ctx.prof.at(K.caudalBase), depth = q.yT - q.yB;
  const yTop = q.yc + S.span * depth, yBot = q.yc - S.span * depth;
  const rays = [];
  const proc = (up, j) => {
    const s = K.caudalBase + S.procS[j], fr = ctx.midFrame(s, up);
    return { base: sub([s, fr.y, 0], mul(fr.O, B.depth * 0.7)), len: S.procLen[up > 0 ? 'dorsal' : 'ventral'][j], kind: 'proc', simple: true, up, j, T0: fr.T, O0: fr.O };
  };
  const NP = S.procS.length;
  for (let j = 0; j < NP; j++) rays.push(proc(1, j));
  for (let k = 0; k < S.principal; k++) {
    const u = k / (S.principal - 1), y = lerp(yTop, yBot, u);
    // from inside the peduncle out through its rounded end
    const skin = ctx.along([K.caudalBase - 0.1, y, 0], [1, 0, 0], 0.4);
    const base = ctx.root(skin, B.depth);
    const L = u < S.tipAt ? S.maxLen * (1 - S.upperDrop[0] * ((S.tipAt - u) / S.tipAt) ** S.upperDrop[1])
      : S.maxLen * (1 - S.lowerDrop[0] * ((u - S.tipAt) / (1 - S.tipAt)) ** S.lowerDrop[1]);
    rays.push({ base, len: L, kind: 'soft', simple: k === 0 || k === S.principal - 1, thick: k >= S.principal - S.thick, u });
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
    targets: ['fold', 'spread', 'flex'], state, hint: () => [0, 0, 1], pleat: S.pleat, sag: S.sag, segScale: S.segScale,
    cardRays: [0, NP, NP + S.tipAt * (S.principal - 1), NP + S.principal - 1, rays.length - 1],
  };
}

/** The pectoral blade (left; the right is built as its mirror image). */
function pectoralDef(ctx) {
  const S = FIN_SCULPT.pectoral, P = ctx.K.pectoral, B = FIN_SCULPT.base;
  // the lobe's frame at the wrist, as body.mjs builds the lobe: u along elbow→wrist, n through its thickness (the arm's
  // broad face normal, BODY_SCULPT.pectoral.axes.n: the lateral axis made perpendicular to the UPPER arm, which the
  // forearm, bent in the face's plane, shares; +z made perpendicular to the forearm instead tilted the blade 16.7° out of
  // the lobe's flat on the bent arm of round B1), wv across its flat width
  const u = nrm(sub(P.wrist, P.elbow));
  const n = nrm(perp(P.axes?.n ?? [0, 0, 1], u));
  const wv = cross(n, u);
  const r = P.radius[2];
  const N = S.rays;
  const lenAt = (x) => S.maxLen * (S.edgeLen + (1 - S.edgeLen) * Math.pow(Math.max(0, 1 - x * x), 0.7));
  const rays = [];
  for (let k = 0; k < N; k++) {
    const x = k / (N - 1);
    const pb = lerp(S.baseArc, -S.baseArc, x) * DEG;
    // a point on the rounded end, put under its skin
    const guess = add(P.wrist, add(mul(u, r * Math.cos(pb)), mul(wv, r * Math.sin(pb))));
    const base = ctx.root(guess, B.depth);
    rays.push({ base, len: lenAt(2 * x - 1), kind: 'soft', simple: k === 0 || k === N - 1, lead: k === 0, x });
  }
  const fanDir = (deg) => add(mul(u, Math.cos(deg * DEG)), mul(wv, Math.sin(deg * DEG)));
  const state = (st, k) => {
    const x = rays[k].x;
    if (st === 'plant' || st === 'plantHalf') {
      const d0 = fanDir(lerp(S.fan.bind[0], S.fan.bind[1], x) + S.turn.bind);
      const c = lerp(S.planted[0], S.planted[1], x) * DEG;
      let d1 = add(mul(n, Math.cos(c)), mul(wv, Math.sin(c)));
      if (st === 'plantHalf') d1 = slerp(d0, d1, 0.5);
      return { dir: d0, turn: { to: d1, at: S.bendAt, over: S.bendOver } };
    }
    const key = st in S.fan ? st : 'bind';
    const d = fanDir(lerp(S.fan[key][0], S.fan[key][1], x) + S.turn[key]);
    return { dir: d, curl: { toward: mul(n, -1), angle: S.curl[key] * DEG, pow: 2 } };
  };
  const panels = rays.slice(1).map(() => ({ reach0: S.reach, reach1: S.reach, notch: S.notch, notchPow: S.notchPow }));
  const hint = (st) => (st === 'plant' ? mul(u, -1) : st === 'plantHalf' ? nrm(sub(n, u)) : n);
  return {
    name: 'Fin_Pectoral_L', type: 'pectoral', side: 'L', joint: 'J_pecWristL', rect: FIN_ATLAS.Fin_Pectoral_L, rays, panels,
    targets: ['fold', 'spread', 'plant', 'plantMid'], state, hint, pleat: S.pleat, sag: S.sag, rowPow: 1.25,
    frame: { u, n, wv, wrist: P.wrist },
  };
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
  return {
    name: 'Fin_Pelvic', type: 'pelvic', joint: 'J_pelvic', rect: FIN_ATLAS.Fin_Pelvic, rays, panels,
    targets: ['fold', 'spread'], state, hint, hintAt, pleat: S.pleat, sag: S.sag, rayScale: S.rayScale,
    cardRays: [1, 3.5, nl + 0.5, 2 * nl - 2.5, 2 * nl],
  };
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
    // the blade joint's pivot (fish mm): half way out along the middle of the fan (the mean of its two middle rays'
    // base + 0.5 len dir), for the rig's J_pecBlade
    if (d.type === 'pectoral') {
      const n = d.rays.length, mid = [d.rays[(n - 1) >> 1], d.rays[n >> 1]];
      d.bladePivot = mul(mid.map((r) => add(r.base, mul(r.dir, 0.5 * r.len))).reduce((a, b) => add(a, b)), 0.5 * HL);
    }
  }
  return defs;
}

// ------------------------------------------------------------------------------------------------ ray curves
const NSTEP = 48;

/** The rays' centre lines in a state: integrated from their direction rules, kept off the body past the root, then
 * resampled at even arc length (a ray keeps its length in every state). */
function rayCurves(def, st) {
  const ctx = def.ctx, B = FIN_SCULPT.base;
  return def.rays.map((r, k) => {
    const spec = def.state(st, k), L = r.len, dl = L / NSTEP;
    const prof = rayProfile(r.kind);
    const dirAt = (l, p) => {
      let d = spec.hug ? spec.hug(p, l) : spec.turn ? slerp(spec.dir, spec.turn.to, smoothstep(spec.turn.at, spec.turn.at + spec.turn.over, l)) : spec.dir;
      if (spec.bend) d = turnToward(d, spec.bend.toward, spec.bend.angle * (l / L));
      if (spec.curl) d = turnToward(d, spec.curl.toward, spec.curl.angle * (l / L) ** (spec.curl.pow ?? 2));
      return d;
    };
    let p = r.base.slice();
    const pts = [p];
    for (let i = 0; i < NSTEP; i++) {
      const half = add(p, mul(dirAt(i * dl, p), dl * 0.5));
      p = add(p, mul(dirAt((i + 0.5) * dl, half), dl));
      pts.push(p);
    }
    // past the root: clear of the skin by the lens and a margin
    {
      for (let i = 1; i <= NSTEP; i++) {
        const l = i * dl, c = (prof.w * 1.1 + B.clear) * smoothstep(0, B.ramp, l);
        let q = pts[i];
        for (let it = 0; it < 3; it++) {
          const d = ctx.f(q);
          if (d >= c) break;
          q = add(q, mul(nrm(ctx.grad(q)), c - d));
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
    return { pts: out, L };
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
    const taper = 1 - (1 - (r.thick ? 0.85 : pr.tip)) * Math.pow(t, 0.9);
    const lead = r.lead ? 1.2 : r.thick ? 1.12 : 1;
    let w = pr.w * taper * lead, h = pr.h * taper * lead;
    if (joint) { const sg = (pr.seg ?? 0) * (def.segScale ?? 1); w *= 1 - sg; h *= 1 - sg; }
    // (the ridge rises out of the skin: lower at the very root; smaller rays on a small fin)
    const sc = def.rayScale ?? 1;
    w *= sc; h *= sc * (0.5 + 0.5 * smoothstep(0, FIN_SCULPT.base.along, t * r.len));
    let gap = Infinity;
    for (const O of [Cp, Cn]) if (O) gap = Math.min(gap, len3(perp(sub(O, C), T)));
    if (gap < Infinity && w > R.gap * gap) { const s = (R.gap * gap) / w; w *= s; h *= Math.max(0.6, s); }
    // the pleat: the rays alternately to either side, growing to the tip (the edge rays half)
    const sg = (k % 2 ? 1 : -1) * (k === 0 || k === n - 1 || r.kind === 'frenum' ? 0.5 : 1) * (r.kind === 'frenum' ? 0 : 1);
    const Cq = add(C, mul(N, sg * pleatAmp * Math.pow(t, 0.8)));
    return { C: Cq, T, N, B: Bv, w, h };
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
  // nothing inside the body away from the root
  const cache = new Map();
  for (let i = 0; i < nV; i++) {
    let p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const b = [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]];
    if (len3(sub(p, b)) <= B.free) continue;
    const key = `${p[0].toFixed(7)},${p[1].toFixed(7)},${p[2].toFixed(7)}`;
    if (cache.has(key)) p = cache.get(key);
    else {
      for (let it = 0; it < 4; it++) {
        const d = ctx.f(p);
        if (d >= B.minClear) break;
        p = add(p, mul(nrm(ctx.grad(p)), B.minClear - d + 1e-5));
      }
      cache.set(key, p);
    }
    P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
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
  const [rx, ry, rw, rh] = def.rect, uvH = FIN_SCULPT.ray.uvHalf, n = def.rays.length;
  for (let i = 0; i < nV; i++) {
    const v = lay.V[i];
    for (let c = 0; c < 3; c++) { position[i * 3 + c] = ev.P[i * 3 + c] * HL; normal[i * 3 + c] = N[i * 3 + c]; }
    const un = (v.a + uvH) / (n - 1 + 2 * uvH);
    uv[i * 2] = (rx + INSET + clamp(un, 0, 1) * (rw - 2 * INSET)) / ATLAS;
    uv[i * 2 + 1] = (ry + INSET + clamp(v.t, 0, 1) * (rh - 2 * INSET)) / ATLAS;
    rayT[i] = v.t; ray[i] = v.a; baseS[i] = ev.base[i * 3] * HL;
  }
  const mesh = { name: def.name, position, normal, uv, indices: Uint32Array.from(lay.tris), rayT, ray, baseS, build: { ...opts } };
  if (def.side) mesh.side = def.side;
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
 * 'plantMid' corrective).
 */
export function buildFinTargets(def, mesh) {
  let o = OPTS.get(mesh);
  // (a copy of the mesh: built again from its options, the same vertices in the same order)
  if (!o && mesh.build) o = OPTS.get(buildFinMesh(def, mesh.build));
  if (!o) throw new Error(`buildFinTargets: ${mesh.name} was not built by buildFinMesh`);
  if (o.mirrorOf) {
    const L = buildFinTargets(def.mirrorOf, o.mirrorOf);
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
    deltas.push(d); normals.push(dn);
  }
  return { names: def.targets.slice(), deltas, normals };
}

/**
 * The far tier's fin: a strip of 8 triangles over the outline (five stations across the fin, each from its root to the
 * membrane's margin), with the fin's uv rect and the mesh attributes; the bind's outline, or another state's
 * ({ state: 'fold' } for a far fish on land).
 */
export function finCard(def, { state = 'bind' } = {}) {
  if (def.mirrorOf) {
    const L = finCard(def.mirrorOf, { state });
    return mirrorMesh(L, def);
  }
  const S = sampler(def, state, true), n = def.rays.length, uvH = FIN_SCULPT.ray.uvHalf;
  const stations = def.cardRays ?? [0, (n - 1) / 4, (n - 1) / 2, (3 * (n - 1)) / 4, n - 1];
  const pts = [], attr = [];
  for (const a of stations) {
    const k = Math.min(n - 2, Math.floor(a)), f = a - k;
    const p = def.panels[k], La = def.rays[k].len, Lb = def.rays[k + 1].len;
    const L0 = La * (p.flat0 ?? p.reach0), L1 = Lb * (p.flat1 ?? p.reach1), Lm = Math.max(L0, L1);
    const E = 1 - (p.flatNotch ?? p.notch) * Math.pow(Math.sin(Math.PI * f), p.notchPow ?? 1);
    const tk = Math.min(E * Lm, L0) / La, tj = Math.min(E * Lm, L1) / Lb;
    const b = lerp3(def.rays[k].base, def.rays[k + 1].base, f);
    pts.push(b, lerp3(S.frame(k, tk).C, S.frame(k + 1, tj).C, f));
    attr.push({ a, t: 0, s: b[0] }, { a, t: lerp(tk, tj, f), s: b[0] });
  }
  const nV = pts.length, idx = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = 2 * i, b = 2 * i + 1, c = 2 * i + 3, d = 2 * i + 2;
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
    const un = (attr[i].a + uvH) / (n - 1 + 2 * uvH);
    uv[i * 2] = (rx + INSET + un * (rw - 2 * INSET)) / ATLAS;
    uv[i * 2 + 1] = (ry + INSET + attr[i].t * (rh - 2 * INSET)) / ATLAS;
    rayT[i] = attr[i].t; ray[i] = attr[i].a; baseS[i] = attr[i].s * HL;
  }
  const mesh = { name: def.name, position, normal, uv, indices: Uint32Array.from(idx), rayT, ray, baseS };
  if (def.side) mesh.side = def.side;
  return mesh;
}

/** The mesh options per fin for a tier: { [finName]: { sub, nt, m, relief } } ('hero' | 'lod1'). */
export function finTierParams(tier) {
  const T = FIN_SCULPT.tiers[tier];
  if (!T) throw new Error(`finTierParams: no tier ${tier} (hero, lod1; lod2 uses finCard)`);
  return Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { ...v }]));
}
