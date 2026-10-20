// The トビハゼ's skeleton and skin weights for the whole fish (body_contract §3, the integration design §4): the head's
// mechanism (skull.mjs HEAD_JOINTS, weights from its bones by headrig.mjs headWeights), the axial chain from the
// vertebral column, the pectoral arm (shoulder, elbow, wrist, blade), the pelvic base; the lighter tiers' skeletons
// (gobyTiers reduceSkeleton); the fins' and teeth's weights; the axes and ranges the runtime drives.
//
// Frames: joint pivots `at` in fish mm (s back from the snout tip, y up from the head's flat floor, z to the fish's
// left), `obj` the object frame (metres, +X left, +Y dorsal, +Z anterior: anatomy.toObject). Every bind rotation is the
// identity, so a joint's local axes are the object axes and AXES lists them there.
//
// Axial chain (RIG.column). Periophthalmus has 26 vertebrae, 10 precaudal + 16 caudal (Murdy 1989; Lee et al. 1995).
// The column runs from the occipital condyle (J_head's pivot, s 0.898 HL) to the hypural joint at the caudal base
// (BODY_SCULPT.caudalBase, SL 4.17 HL). Its two parts are not alike:
//   - precaudal vertebrae ≈ 0.155 HL: D1's 12 spines stand on pterygiophores in interneural spaces 3 to 8 (formula
//     3-1301000 or 1311*00, Murdy; Lee), so its base 1.48 → 2.23 HL spans about 5 vertebrae (0.15 HL each); the body
//     cavity and the ribs run back to the vent (pre-anus 56.7 % SL = 2.36 HL): this part is stiff
//   - caudal vertebrae ≈ 0.11 HL: D2 (I,12, base 2.40 → 3.70) and the anal fin (I,11, 2.62 → 3.72) stand one
//     pterygiophore to a space, so 1.1–1.3 HL hold about 11–12 vertebrae; the first haemal spine lies at the D2 origin
//     (2.45 HL, between the vent and the anal fin's first pterygiophore)
// The bending the photos and films show follows that split: on land the front body and head stay still (Swanson & Gibb
// 2004), crawling bends the body only in a small midsection and tail kink (Wicaksono 2022: −21° → −4°, +25° → 0°), the
// escape jump's J-curl folds the tail alongside the body with its sharpest bend at ⅔ of the length (3.3 HL; up to 20°
// per intervertebral joint) and A043 shows the fold starting behind the pectorals and tightest at 2.5–3.3 HL, the
// swim is carangiform over the rear two thirds. So the rig's stations are intervertebral joints, two or three precaudal
// vertebrae to a rig bone in front (J_root behind the 2nd: the head block is the skull, the girdle and the first two
// vertebrae under the supracleithrum) and three caudal vertebrae to a bone behind the vent, where the bends are:
//   J_root 1.21 (2/3)  J_sp1 1.52 (4/5)  J_sp2 1.985 (7/8)  J_sp3 2.45 (10/11, precaudal | caudal)  J_sp4 2.88 (14/15)
//   J_sp5 3.20 (17/18)  J_sp6 3.525 (20/21)  J_sp7 3.85 (23/24)  J_caudal 4.17 (the hypural joint, the fin's hinge)
// then J_caudal2 / J_caudal3 in the caudal fin (its rays bend along their length). A vertex's axial weights blend
// linearly between consecutive bone centres (the knots: RIG.axialBlend), so each bend spreads evenly over the vertebrae
// on either side of its joint; the head's rows rule in front of RIG.headSplit (1.20 HL), where they are J_head alone.
//
// Pectoral arm (BODY_SCULPT.pectoral, read at build time): the shoulder (girdle–radial joint; the girdle is on the
// skull, so J_pecL hangs from J_head), the elbow (the radial–ray joint inside the fleshy lobe: Pace & Gibb's intra-fin
// joint, 76° → 178° in a land stroke), the wrist (the lobe's end, where the free blade starts) and the blade (J_pecBlade,
// half way out the fan: the rays bending under load). The lobe's vertices take the arm's rows by their place along it
// (armParam: 0 shoulder, 1 elbow, 2 wrist, by arc length), in the lobe's share of the fish's field (fishSDF.parts: noLobe
// against lobe, held off the gill cover, smoothed over the mesh); the flank round the arm's root follows the shoulder in
// part (RIG.shoulderHalo); the pelvic base likewise takes J_pelvic.
import { HL, EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { BODY_SCULPT, trunkProfile, fishSDF } from './body.mjs';
import { HEAD_SCULPT, headSDF } from './head.mjs';
import { HEAD_JOINTS, fitTeeth } from './skull.mjs';
import { JOINT_NAMES as HEAD_NAMES, headWeights, marginCurve, BLINK_DROP, HEAD_POSES } from './headrig.mjs';
import { filterTriangles } from './fishmesh.mjs';
import { reduceSkeleton, remapSkin } from '../../lib/gobyTiers.mjs';
import { sampleSurface } from './transfer.mjs';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mirror = (p) => [p[0], p[1], -p[2]];
const mm = (p) => p.map((c) => c * HL);
const r4 = (v) => +v.toFixed(4);

/** Every tunable of the rig (HL unless stated). */
export const RIG = {
  // the vertebral column: from the occipital condyle to the hypural joint, `precaudal` vertebrae to `split`, `caudal`
  // vertebrae behind it (see the header)
  column: { split: 2.45, precaudal: 10, caudal: 16 },
  // the rig's stations as intervertebral joints (the number of vertebrae in front of the joint)
  stations: { J_root: 2, J_sp1: 4, J_sp2: 7, J_sp3: 10, J_sp4: 14, J_sp5: 17, J_sp6: 20, J_sp7: 23, J_caudal: 26 },
  // the caudal fin's joints as fractions of the fin's length (caudal base → TL), their height below the axis there
  caudalFin: { J_caudal2: 0.36, J_caudal3: 0.68, drop: 0.03 },
  // in front of this the head's rows (headWeights) rule; there they are J_head alone
  headSplit: 1.20,
  // the weights between two knots: 'linear' (each bend spread evenly between the bone centres, as the vertebrae share it) or
  // 'smooth' (smoothstep: the bend bunched at the joints; the J-curl's inner side compressed to 0.465 at the 0.1st
  // percentile in bands, against 0.606 linear, poses.mjs ax0/ax1)
  axialBlend: 'linear',
  // the head's submesh for headWeights: triangles whose centroid lies in front of this
  headSub: 1.32,
  // the arm's rows along its length (HL of arc from the shoulder, from armParam's t): the elbow takes over from the
  // shoulder over `elbow` (from − to + of the elbow's place: the bend spread over about the lobe's radius either side of
  // the radial–ray joint), the wrist from the elbow over `wrist` (before the wrist's place: the fleshy pad over the ray
  // bases stays the elbow's, its end cap where the blade starts is the wrist's); `soft`: the two segments' parameters
  // blended over this difference of their distances (the nearer segment alone jumps across the inside of the bend)
  lobe: { elbow: [-0.06, 0.05], wrist: [-0.07, 0.0], soft: 0.015 },
  // the lobe's share is held off the gill cover: none in front of the opercle's margin + `margin[0]` (the slit and its
  // fused membrane, headrig's fuse band), all of it from margin + `margin[1]`
  lobeGate: { margin: [0.012, 0.07] },
  // the lobe's and the pelvic base's shares smoothed over the mesh to this radius (HL; passes scaled by the cell), so a
  // thin protrusion's steep field difference does not step
  shareSmooth: 0.03,
  // the lobe's share over this half-width of the field difference at least (the sculpt's own blend is narrower: 0.025 gave
  // the root's fillet 8–15 % more stretch at the 99.9th percentile in the arm's poses than 0.05, poses.mjs ab0/ab1)
  lobeBand: 0.05,
  // the flank round the arm's root follows the shoulder in part (`share` of J_pec out to `reach[0]` from the shoulder's
  // pivot, none beyond `reach[1]`): the fin's abductor and adductor fan onto the girdle under loose skin, and spread over
  // this halo the shoulder's swing stretches a band instead of tearing the narrow fillet where the arm leaves the flank
  shoulderHalo: { share: 0.5, reach: [0.05, 0.24] },
  // the blade joint's pivot when fins.mjs gives none: this far out past the wrist's cap along elbow → wrist
  bladeLen: 0.40,
  // the vertebrae's bend limit (Swanson & Gibb 2004: up to 20° per intervertebral joint in the land jump's coil)
  perVertebra: 20,
};

const TL_HL = 80 / HL;

/** The intervertebral joints' s (HL): k vertebrae behind the condyle, k = 0 … 26. */
export function vertebralJoints(K = BODY_SCULPT, R = RIG) {
  const s0 = HEAD_JOINTS.find((j) => j.name === 'J_head').pivot[0], s1 = K.caudalBase, C = R.column;
  const out = [];
  for (let k = 0; k <= C.precaudal + C.caudal; k++) {
    out.push(k <= C.precaudal ? s0 + ((C.split - s0) * k) / C.precaudal : C.split + ((s1 - C.split) * (k - C.precaudal)) / C.caudal);
  }
  return out;
}

const PROFILE = trunkProfile(BODY_SCULPT);
const yAxis = (s) => PROFILE.at(Math.max(1.05, Math.min(s, BODY_SCULPT.caudalBase))).yc;

/** The blade joint's pivot (fish mm) of the left arm: fins.mjs's own (half way out the fan) when it has one. */
async function bladePivotL() {
  try {
    const F = await import('./fins.mjs');
    const def = F.finDefinitions?.(BODY_SCULPT)?.find((d) => d.name === 'Fin_Pectoral_L');
    if (def?.bladePivot) return { at: [...def.bladePivot], from: 'fins.mjs bladePivot' };
  } catch { /* no fins.mjs yet */ }
  const P = BODY_SCULPT.pectoral, u = norm3(sub3(P.wrist, P.elbow));
  return { at: mm(add3(P.wrist, mul3(u, P.radius[2] + 0.5 * RIG.bladeLen))), from: 'estimate: wrist + (r_wrist + bladeLen/2) along elbow → wrist' };
}
const BLADE = await bladePivotL();

function buildJoints() {
  const V = vertebralJoints(), P = BODY_SCULPT.pectoral, st = RIG.stations;
  const hj = Object.fromEntries(HEAD_JOINTS.map((j) => [j.name, j]));
  const head = (name, parent) => ({ name, parent, at: mm(hj[name].pivot), head: true });
  const ax = (name, parent, k) => ({ name, parent, at: [V[k] * HL, yAxis(V[k]) * HL, 0], vertebra: k });
  const cb = BODY_SCULPT.caudalBase, yc = yAxis(cb), fin = (f) => [(cb + (TL_HL - cb) * f) * HL, (yc - RIG.caudalFin.drop * f / RIG.caudalFin.J_caudal3) * HL, 0];
  const arm = (side) => {
    const s = side > 0 ? 'L' : 'R', m = (p) => (side > 0 ? p : mirror(p));
    return [
      { name: `J_pec${s}`, parent: 'J_head', at: mm(m(P.shoulder)) },
      { name: `J_pecElbow${s}`, parent: `J_pec${s}`, at: mm(m(P.elbow)) },
      { name: `J_pecWrist${s}`, parent: `J_pecElbow${s}`, at: mm(m(P.wrist)) },
      { name: `J_pecBlade${s}`, parent: `J_pecWrist${s}`, at: side > 0 ? [...BLADE.at] : mirror(BLADE.at) },
    ];
  };
  const J = [
    ax('J_root', null, st.J_root),
    { ...head('J_head', 'J_root') },
    head('J_premax', 'J_head'), head('J_maxL', 'J_head'), head('J_maxR', 'J_head'), head('J_suspL', 'J_head'), head('J_suspR', 'J_head'),
    head('J_jaw', 'J_head'), head('J_imj', 'J_jaw'), head('J_opercL', 'J_suspL'), head('J_opercR', 'J_suspR'), head('J_hyoid', 'J_head'),
    head('J_eyeL', 'J_head'), head('J_eyeR', 'J_head'),
    ...arm(1), ...arm(-1),
    { name: 'J_pelvic', parent: 'J_head', at: mm(BODY_SCULPT.pelvicBase.c) },
    ax('J_sp1', 'J_root', st.J_sp1), ax('J_sp2', 'J_sp1', st.J_sp2), ax('J_sp3', 'J_sp2', st.J_sp3), ax('J_sp4', 'J_sp3', st.J_sp4),
    ax('J_sp5', 'J_sp4', st.J_sp5), ax('J_sp6', 'J_sp5', st.J_sp6), ax('J_sp7', 'J_sp6', st.J_sp7),
    ax('J_caudal', 'J_sp7', st.J_caudal),
    { name: 'J_caudal2', parent: 'J_caudal', at: fin(RIG.caudalFin.J_caudal2) },
    { name: 'J_caudal3', parent: 'J_caudal2', at: fin(RIG.caudalFin.J_caudal3) },
  ];
  for (const j of J) { j.at = j.at.map(r4); j.obj = toObject(j.at); }
  return J;
}

/** The hero skeleton, builder order = skin order (parents first, bind rotation identity): [{ name, parent, at (fish mm),
 * obj (object m), head?, vertebra? }]. */
export const JOINTS = buildJoints();
/** name → hero index */
export const J = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));
export const NJ = JOINTS.length;

/** The joints each tier keeps (body_contract §3). */
export const TIER_JOINTS = {
  hero: JOINTS.map((j) => j.name),
  lod1: JOINTS.map((j) => j.name).filter((n) => !['J_premax', 'J_maxL', 'J_maxR', 'J_imj', 'J_pecBladeL', 'J_pecBladeR', 'J_caudal3'].includes(n)),
  lod2: ['J_root', 'J_head', 'J_pecL', 'J_pecR', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'],
};

/** A tier's skeleton: { joints (kept, builder order), remap: Int16Array (hero index → the tier's index of the joint that
 * takes its weights: itself or its nearest kept ancestor) }. */
export function jointsForTier(tier) {
  const { kept, remap } = reduceSkeleton(JOINTS, TIER_JOINTS[tier]);
  return { joints: kept, remap: Int16Array.from(remap) };
}

// ------------------------------------------------------------------------------------------------ the axial rows

/** The axial chain's knots: [name, s (HL)], the bone centres (J_head's at HEAD_SPLIT). */
export const AXIAL_KNOTS = (() => {
  const chain = ['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2', 'J_caudal3'];
  const s = chain.map((n) => JOINTS[J[n]].at[0] / HL);
  const knots = [['J_head', RIG.headSplit]];
  chain.forEach((n, i) => knots.push([n, ((s[i] + (i + 1 < s.length ? s[i + 1] : TL_HL)) / 2)]));
  return knots.map(([n, k]) => [n, r4(k)]);
})();
const KNOT_J = AXIAL_KNOTS.map(([n]) => J[n]), KNOT_S = AXIAL_KNOTS.map(([, k]) => k);

/** The axial row at s (HL): smoothstep between consecutive knots. Adds `scale` × the row into `row` (Float32Array(NJ)). */
export function axialRow(s, row = new Float32Array(NJ), scale = 1) {
  if (s <= KNOT_S[0]) { row[KNOT_J[0]] += scale; return row; }
  for (let k = 0; k + 1 < KNOT_S.length; k++) {
    if (s <= KNOT_S[k + 1]) {
      const t = RIG.axialBlend === 'linear' ? clamp((s - KNOT_S[k]) / (KNOT_S[k + 1] - KNOT_S[k]), 0, 1) : smoothstep(KNOT_S[k], KNOT_S[k + 1], s);
      row[KNOT_J[k]] += scale * (1 - t); row[KNOT_J[k + 1]] += scale * t;
      return row;
    }
  }
  row[KNOT_J[KNOT_J.length - 1]] += scale;
  return row;
}

/**
 * Where a point lies along the pectoral arm (HL; side +1 left, −1 right): t from 0 at the shoulder through 1 at the elbow
 * to 2 at the wrist, as body.lobeParam, but the two segments' parameters blended by their distances (RIG.lobe.soft)
 * instead of the nearer one taken: across the inside of the elbow's bend the nearer segment changes and lobeParam's t
 * jumps (0.93 → 1.16 for a 30° bend at the lobe's radius), which would step the elbow's weight.
 */
export function armParam(p, side = 1, K = BODY_SCULPT) {
  const P = K.pectoral, q = [p[0], p[1], p[2] * side], seg = [];
  [[P.shoulder, P.elbow, 0], [P.elbow, P.wrist, 1]].forEach(([a, b, k], i) => {
    const ab = sub3(b, a), L2 = dot3(ab, ab);
    let t = dot3(sub3(q, a), ab) / L2;
    if (i === 0) t = Math.min(t, 1); else t = Math.max(t, 0);
    seg.push({ t: k + t, r: Math.hypot(...sub3(q, add3(a, mul3(ab, t)))) });
  });
  // (the upper arm's share: 1 where it is the nearer by more than a few `soft`)
  const w = 1 / (1 + Math.exp((seg[0].r - seg[1].r) / RIG.lobe.soft));
  return { t: seg[0].t * w + seg[1].t * (1 - w), r: Math.min(seg[0].r, seg[1].r) };
}

/** The arm's row at its parameter t (armParam; side +1 left, −1 right), added × scale into row. */
export function lobeRow(t, side, row = new Float32Array(NJ), scale = 1, K = BODY_SCULPT) {
  const s = side > 0 ? 'L' : 'R', L = RIG.lobe, P = K.pectoral;
  const L1 = Math.hypot(...sub3(P.elbow, P.shoulder)), L2 = Math.hypot(...sub3(P.wrist, P.elbow));
  const arc = t <= 1 ? t * L1 : L1 + (t - 1) * L2, aw = L1 + L2;
  const a = smoothstep(L1 + L.elbow[0], L1 + L.elbow[1], arc), b = Math.min(a, smoothstep(aw + L.wrist[0], aw + L.wrist[1], arc));
  row[J[`J_pec${s}`]] += scale * (1 - a); row[J[`J_pecElbow${s}`]] += scale * (a - b); row[J[`J_pecWrist${s}`]] += scale * b;
  return row;
}

/** The boxes (HL) outside which the lobe's and the pelvic base's shares are 0. */
function partBoxes(K = BODY_SCULPT) {
  const P = K.pectoral, pad = Math.max(...P.radius, ...P.root.r) + P.blend + 0.06;
  const pts = [P.shoulder, P.elbow, P.wrist, P.root.c];
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])) - pad), hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) + pad);
  const B = K.pelvicBase, padP = B.blend + 0.05;
  return {
    lobe: (x, y, za) => x > lo[0] && x < hi[0] && y > lo[1] && y < hi[1] && za > lo[2] && za < hi[2],
    pelvic: (x, y, z) => Math.abs(x - B.c[0]) < B.r[0] + padP && Math.abs(y - B.c[1]) < B.r[1] + padP && Math.abs(z - B.c[2]) < B.r[2] + padP,
  };
}

/** The lobe's and the pelvic base's shares at a point (HL), from the fish's field parts: smoothstep over ±blend of the
 * difference between the field without the part and the part's own; the lobe's held off the gill cover (RIG.lobeGate:
 * none in front of the opercle's margin and its fused band, so the arm never drags the cover or the slit). */
export function partShares(fish, K = BODY_SCULPT) {
  const box = partBoxes(K), bl = Math.max(K.pectoral.blend, RIG.lobeBand ?? 0), bp = Math.max(K.pelvicBase.blend, RIG.pelvicBand ?? 0);
  const sOp = marginCurve(HEAD_SCULPT.opercle.path), G = RIG.lobeGate.margin;
  return (x, y, z) => {
    const inL = box.lobe(x, y, Math.abs(z)), inP = box.pelvic(x, y, z);
    if (!inL && !inP) return { m: 0, mp: 0 };
    const p = fish.parts(x, y, z);
    const gate = inL ? smoothstep(sOp(y) + G[0], sOp(y) + G[1], x) : 0;
    return { m: inL && gate > 0 ? gate * smoothstep(-bl, bl, p.noLobe - p.lobe) : 0, mp: inP ? smoothstep(-bp, bp, p.noPelvic - p.pelvic) : 0 };
  };
}

/** Jacobi smoothing of per-vertex scalars over the mesh's edges to a radius (HL) independent of the cell: about
 * (radius / mean edge)² passes. Only vertices within reach of a nonzero value change. */
export function smoothShares(fields, indices, P, radius) {
  const n = P.length / 3;
  let el = 0, ne = 0;
  for (let t = 0; t < indices.length; t += 3) { const a = indices[t], b = indices[t + 1]; el += Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]); ne++; }
  el /= ne || 1;
  const iters = Math.max(1, Math.round((radius / el) ** 2));
  const act = new Uint8Array(n);
  for (const f of fields) for (let v = 0; v < n; v++) if (f[v] > 0) act[v] = 1;
  const nb = new Map();
  const add = (a, b) => { if (!nb.has(a)) nb.set(a, []); nb.get(a).push(b); };
  // (the active region grown by the passes' reach: one ring per pass)
  for (let r = 0; r < iters; r++) {
    const grow = Uint8Array.from(act);
    for (let t = 0; t < indices.length; t += 3) { const a = indices[t], b = indices[t + 1], c = indices[t + 2]; if (act[a] || act[b] || act[c]) { grow[a] = grow[b] = grow[c] = 1; } }
    act.set(grow);
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (!(act[a] || act[b] || act[c])) continue;
    add(a, b); add(a, c); add(b, a); add(b, c); add(c, a); add(c, b);
  }
  const vs = [...nb.keys()];
  return fields.map((f) => {
    let cur = Float32Array.from(f), nxt = Float32Array.from(f);
    for (let it = 0; it < iters; it++) {
      for (const v of vs) { const N = nb.get(v); let s = cur[v] * N.length; for (const u of N) s += cur[u]; nxt[v] = s / (2 * N.length); }
      [cur, nxt] = [nxt, cur];
    }
    return cur;
  }).concat([{ iters, edge: el }]);
}

/**
 * A vertex's body row from its place alone (HL): the axial row, the arm's and the pelvic base's shares over it. In front
 * of HEAD_SPLIT the head's rows (headWeights, mesh-based) stand in place of the axial row (heroRig); this is the rule
 * behind it, and the fins' roots use it (finWeights).
 */
/** The shoulder's halo on the flank round the arm's root (RIG.shoulderHalo, held off the gill cover as the lobe is): that
 * share of the row handed to J_pecL/R. Returns the share. */
const SOP = marginCurve(HEAD_SCULPT.opercle.path);
export function addHalo(p, row) {
  const H = RIG.shoulderHalo;
  if (!H || !(H.share > 0)) return 0;
  const side = p[2] >= 0 ? 1 : -1, sh = BODY_SCULPT.pectoral.shoulder;
  const d = Math.hypot(p[0] - sh[0], p[1] - sh[1], p[2] - side * sh[2]);
  if (d >= H.reach[1]) return 0;
  const G = RIG.lobeGate.margin, gate = smoothstep(SOP(p[1]) + G[0], SOP(p[1]) + G[1], p[0]);
  const w = H.share * (1 - smoothstep(H.reach[0], H.reach[1], d)) * gate;
  if (!(w > 0)) return 0;
  for (let k = 0; k < NJ; k++) row[k] *= 1 - w;
  row[J[side > 0 ? 'J_pecL' : 'J_pecR']] += w;
  return w;
}

export function bodyRowAt(p, shares, row = new Float32Array(NJ)) {
  row.fill(0);
  const { m, mp } = shares(p[0], p[1], p[2]);
  axialRow(p[0], row, 1);
  addHalo(p, row);
  if (m > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - m; lobeRow(armParam(p, p[2] >= 0 ? 1 : -1).t, p[2] >= 0 ? 1 : -1, row, m); }
  if (mp > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - mp; row[J.J_pelvic] += mp; }
  return row;
}

// ------------------------------------------------------------------------------------------------ the hero rows

const HEAD_TO_HERO = Int16Array.from(HEAD_NAMES.map((n) => (J[n] ?? -1)));

/**
 * The hero's weight rows on the dense hero mesh (fishmesh.fishDense): the head's rows (headWeights on the head's
 * submesh, the bones' groups mapped to the hero's joints) in front of HEAD_SPLIT, the axial rows behind, the pectoral
 * arm's and the pelvic base's rows over them in their shares of the field.
 * @param dense { position (mm), normal, indices }
 * @param fish  the whole fish's field in HL (body.fishSDF: .head, .parts)
 * @param o     { log, teeth (skull.fitTeeth of the head; default fitted here), headField (the head's field with .parts and
 *              .cup; default headSDF(HEAD_SCULPT, { cut: false })), K: the head's sculpt }
 * @returns { rows: Float32Array(n·NJ), nJ, headSub: { position (HL), normal, indices, ids (dense vertex) , skin (head
 *   space, headWeights) }, m, mp: Float32Array(n) (the lobe's and the pelvic base's shares), lobeT: Float32Array(n),
 *   teeth, headField }
 */
export function heroRig(dense, fish = fishSDF(), o = {}) {
  const log = o.log ?? (() => {});
  const n = dense.position.length / 3, K = o.K ?? HEAD_SCULPT;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) P[i] = dense.position[i] / HL;
  // the head's submesh (centroid in front of RIG.headSub) in HL
  const I = dense.indices, split = o.headSub ?? RIG.headSub;
  const sub = filterTriangles({ position: P, normal: dense.normal, indices: I }, (t) => P[I[t * 3] * 3] + P[I[t * 3 + 1] * 3] + P[I[t * 3 + 2] * 3] < 3 * split);
  const headField = o.headField ?? headSDF(K, { cut: false });
  const teeth = o.teeth ?? fitTeeth(headField);
  const skinH = headWeights(sub.position, sub.indices, headField, { K, teeth, ...(o.headWeights ?? {}) });
  log(`head weights on ${sub.position.length / 3} vertices`);
  // the lobe's and the pelvic base's shares (smoothed over the mesh to RIG.shareSmooth, the lobe's gated off the gill
  // cover again after), the arm's parameter
  const shares = partShares(fish), m0 = new Float32Array(n), mp0 = new Float32Array(n), lobeT = new Float32Array(n).fill(-9);
  for (let v = 0; v < n; v++) {
    const sh = shares(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    m0[v] = sh.m; mp0[v] = sh.mp;
  }
  const radius = o.shareSmooth ?? RIG.shareSmooth;
  const [m, mp, sm] = radius > 0 ? smoothShares([m0, mp0], I, P, radius) : [m0, mp0, { iters: 0 }];
  const sOp = marginCurve(HEAD_SCULPT.opercle.path), G = RIG.lobeGate.margin;
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (m[v] < 1e-4) { m[v] = 0; } else { m[v] = Math.min(1, m[v]) * smoothstep(sOp(y) + G[0], sOp(y) + G[1], x); if (m[v] > 0) lobeT[v] = armParam([x, y, z], z >= 0 ? 1 : -1).t; }
    if (mp[v] < 1e-4) mp[v] = 0; else mp[v] = Math.min(1, mp[v]);
  }
  log(`lobe and pelvic shares (smoothed ${sm.iters} passes)`);
  const rows = new Float32Array(n * NJ), inSub = new Int32Array(n).fill(-1), halo = new Float32Array(n);
  for (let i = 0; i < sub.source.length; i++) inSub[sub.source[i]] = i;
  const row = new Float32Array(NJ);
  for (let v = 0; v < n; v++) {
    row.fill(0);
    const x = P[v * 3], z = P[v * 3 + 2], i = inSub[v];
    if (x < RIG.headSplit && i >= 0) {
      for (let q = 0; q < 4; q++) {
        const w = skinH.weights[i * 4 + q];
        if (!w) continue;
        const hj = HEAD_TO_HERO[skinH.joints[i * 4 + q]];
        if (hj < 0) throw new Error(`heroRig: head joint ${HEAD_NAMES[skinH.joints[i * 4 + q]]} carries skin but is not in the rig`);
        row[hj] += w;
      }
    } else axialRow(x, row, 1);
    halo[v] = addHalo([x, P[v * 3 + 1], z], row);
    if (m[v] > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - m[v]; lobeRow(lobeT[v], z >= 0 ? 1 : -1, row, m[v]); }
    if (mp[v] > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - mp[v]; row[J.J_pelvic] += mp[v]; }
    rows.set(row, v * NJ);
  }
  log('rows');
  return {
    rows, nJ: NJ, m, mp, lobeT, halo, teeth, headField,
    headSub: { position: sub.position, normal: sub.normal, indices: sub.indices, ids: sub.source, skin: skinH },
  };
}

/**
 * The head-space skin the head's blend shapes are solved against (body_contract §3, design §4.4): the packed hero
 * weights of the head's submesh (what the GLB ships), every joint outside the head's mechanism (the arm, the pelvic base,
 * the axial chain: all at rest in the head's poses) handed to J_head; and the inflation's mask scale (1 − the lobe's
 * and the pelvic base's shares), so the arm's root and the pelvic base stay off the balloon.
 * @param rig    heroRig's result
 * @param packed packTop4(rig.rows) (hero space)
 * @returns { skin: { joints: Uint16Array, weights: Float32Array } (headrig JOINT_NAMES space), inflateScale: Float32Array }
 */
export function morphSkin(rig, packed) {
  const ids = rig.headSub.ids, n = ids.length, joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), scale = new Float32Array(n);
  const toHead = Int16Array.from(JOINTS.map((j) => { const k = HEAD_NAMES.indexOf(j.name); return k >= 0 ? k : 0; }));
  for (let i = 0; i < n; i++) {
    const v = ids[i], acc = new Map();
    for (let q = 0; q < 4; q++) { const w = packed.weights[v * 4 + q]; if (!w) continue; const k = toHead[packed.joints[v * 4 + q]]; acc.set(k, (acc.get(k) ?? 0) + w); }
    [...acc.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, w], q) => { joints[i * 4 + q] = k; weights[i * 4 + q] = w / 255; });
    scale[i] = Math.max(0, 1 - rig.m[v] - rig.mp[v]);
  }
  return { skin: { joints, weights }, inflateScale: scale };
}

/** The top four of each row as uint8 joints and weights summing to 255 (the rounding's remainder to the largest, as
 * gobyTiers.remapSkin does). */
export function packTop4(rows, nJ = NJ) {
  const n = rows.length / nJ, joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  const top = [0, 0, 0, 0], tw = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) {
    tw.fill(-1); top.fill(0);
    for (let k = 0; k < nJ; k++) {
      const w = rows[v * nJ + k];
      if (!(w > tw[3])) continue;
      let q = 3; while (q > 0 && w > tw[q - 1]) { tw[q] = tw[q - 1]; top[q] = top[q - 1]; q--; }
      tw[q] = w; top[q] = k;
    }
    let s = 0; for (let q = 0; q < 4; q++) if (tw[q] > 0) s += tw[q];
    const qw = [0, 0, 0, 0];
    let tot = 0;
    for (let q = 0; q < 4; q++) { qw[q] = tw[q] > 0 ? Math.round((tw[q] / (s || 1)) * 255) : 0; tot += qw[q]; }
    if (!s) { qw[0] = 255; top[0] = J.J_head; tot = 255; }
    qw[0] += 255 - tot;
    for (let q = 0; q < 4; q++) { joints[v * 4 + q] = qw[q] > 0 ? top[q] : 0; weights[v * 4 + q] = qw[q]; }
  }
  return { joints, weights };
}

/** A tier's packed skin from the hero's (gobyTiers.remapSkin through jointsForTier's remap). */
export function skinForTier(packed, tier) {
  if (tier === 'hero') return packed;
  return remapSkin(packed, jointsForTier(tier).remap);
}

// ------------------------------------------------------------------------------------------------ fins and teeth

let SHARES = null;
const shares0 = () => (SHARES ??= partShares(fishSDF()));

/**
 * The hero-space packed weights of a fins.mjs mesh (body_contract §5): the dorsal and anal fins on the axial row at each
 * vertex's ray base (baseS: the same row as the body's skin under the base, so nothing parts when the body bends), the
 * caudal on the axial row at the vertex's own s (it bends along its length over J_caudal → J_caudal3), the pectoral
 * blade from the body's row at its root (the lobe's end) to J_pecWrist by rayT 0.3 and on to J_pecBlade by 0.6, the
 * pelvic fins from the body's row at their root (the pelvic base) to J_pelvic by rayT 0.2.
 * @param def  finDefinitions' entry ({ name, type, side?, joint, rays: [{ base (HL) }] })
 * @param mesh buildFinMesh's result ({ position (mm), rayT, ray, baseS (mm), root? (mm, per vertex) })
 * @param o    { body: { position (mm), indices, rows (heroRig's), grid? (transfer.vertexGrid of position) }: the hero's skin,
 *             to read the body's rows under the roots off it (without it they come from the rule, bodyRowAt) }
 * @returns { joints: Uint8Array(n·4), weights: Uint8Array(n·4) }
 */
export function finWeights(def, mesh, o = {}) {
  const n = mesh.position.length / 3, rows = new Float32Array(n * NJ), row = new Float32Array(NJ), base = new Float32Array(NJ);
  const type = def.type ?? (def.joint === 'spine' ? 'median' : 'pectoral');
  const side = def.side === 'R' || /_R$/.test(def.name) ? -1 : 1, S = side > 0 ? 'L' : 'R';
  const rootOf = (v) => {
    if (mesh.root) return [mesh.root[v * 3] / HL, mesh.root[v * 3 + 1] / HL, mesh.root[v * 3 + 2] / HL];
    // the ray bases (def.rays[k].base, HL) between which the vertex lies
    const r = clamp(mesh.ray[v], 0, def.rays.length - 1), k0 = Math.floor(r), k1 = Math.min(def.rays.length - 1, k0 + 1), f = r - k0;
    const a = def.rays[k0].base, b = def.rays[k1].base;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  // the body's rows at the roots: sampled off the skin (o.body: the hero's dense mesh and its rows; exact) or by the rule
  let sampled = null;
  if (o.body) {
    const pts = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) pts.set(rootOf(v).map((c) => c * HL), v * 3);
    sampled = sampleSurface({ position: o.body.position, indices: o.body.indices, data: o.body.rows, dim: NJ }, pts, { grid: o.body.grid });
  }
  const baseAt = (v) => { if (sampled) base.set(sampled.subarray(v * NJ, v * NJ + NJ)); else bodyRowAt(rootOf(v), shares0(), base); return base; };
  for (let v = 0; v < n; v++) {
    row.fill(0);
    const t = mesh.rayT[v];
    if (type === 'pectoral' || /^J_pecWrist/.test(def.joint ?? '')) {
      // the blade: the body's row at the root (the lobe's end), then the wrist by rayT 0.3, the blade joint by 0.6
      const a = smoothstep(0, 0.3, t), b = smoothstep(0.3, 0.6, t);
      if (a < 1) { const B = baseAt(v); for (let k = 0; k < NJ; k++) row[k] = B[k] * (1 - a); }
      row[J[`J_pecWrist${S}`]] += a * (1 - b); row[J[`J_pecBlade${S}`]] += a * b;
    } else {
      // the fin's own rule, eased in from the body's row at the root over the first `ease` of the rays
      let ease;
      if (type === 'pelvic' || def.joint === 'J_pelvic') { row[J.J_pelvic] = 1; ease = 0.2; }
      else if (type === 'caudal') { axialRow(mesh.position[v * 3] / HL, row, 1); ease = 0.15; }
      else { axialRow(mesh.baseS[v] / HL, row, 1); ease = 0.15; }
      const a = smoothstep(0, ease, t);
      if (a < 1) { const B = baseAt(v); for (let k = 0; k < NJ; k++) row[k] = a * row[k] + (1 - a) * B[k]; }
    }
    rows.set(row, v * NJ);
  }
  return packTop4(rows, NJ);
}

/** The teeth's weights (hero): the premaxillary rows on J_premax, the dentary rows on J_imj (whose halves J_imjL/R are
 * bone-only and not in the shipped rig). group: 'premax' | 'dentary' | 'dentaryL' | 'dentaryR' (or the bone names
 * Teeth_Premaxilla_* / Teeth_Dentary_*). */
export function teethWeights(group, n) {
  const j = /prem/i.test(group) ? J.J_premax : /dent/i.test(group) ? J.J_imj : null;
  if (j === null) throw new Error(`teethWeights: unknown group ${group}`);
  const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) { joints[v * 4] = j; weights[v * 4] = 255; }
  return { joints, weights };
}

// ------------------------------------------------------------------------------------------------ axes for the runtime

/** An axis (fish frame, unit) oriented so that a small positive turn about `pivot` moves `probe` along `want`. */
function axisFor(pivot, axis, probe, want) {
  const a = norm3(axis), d = cross3(a, sub3(probe, pivot));
  return dot3(d, want) >= 0 ? a : mul3(a, -1);
}
/** The right side's axis from the left's: mirrored as an axial vector (−s, −y, +z), so a positive angle mirrors. */
const mirrorAxial = (a) => [-a[0], -a[1], a[2]];
const obj = (a) => dirToObject(a).map(r4);

/** The pectoral arm's local frame at a joint (fish frame, left side): u along the segment, n the flat lobe's broad face
 * normal (BODY_SCULPT.pectoral.axes.n when the sculpt gives it, else the lateral axis made square to u, as body.mjs's
 * limbs are built), w = n × u across the lobe. */
function armFrame(a, b, faceN = BODY_SCULPT.pectoral.axes?.n ?? [0, 0, 1]) {
  const u = norm3(sub3(b, a)), n = norm3(sub3(faceN, mul3(u, dot3(faceN, u))));
  return { u, n, w: cross3(n, u) };
}

function buildAxes() {
  const at = (n) => JOINTS[J[n]].at, P = BODY_SCULPT.pectoral;
  const ch = (axisFish, range, extra = {}) => ({ axis: obj(axisFish), range, ...extra });
  const joints = {};
  // the axial chain: yaw (+ bends the segment behind toward the fish's left) and pitch (+ bends it up); ranges from the
  // vertebrae either side of the joint (RIG.perVertebra per intervertebral joint between the two bone centres)
  const V = vertebralJoints(), chain = ['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'];
  chain.forEach((nm, i) => {
    const p = at(nm), behind = add3(p, [5, 0, 0]);
    const kPrev = i > 0 ? RIG.stations[chain[i - 1]] : 0, kNext = i + 1 < chain.length ? RIG.stations[chain[i + 1]] : RIG.column.precaudal + RIG.column.caudal;
    const kHere = RIG.stations[nm], nVert = (kHere - kPrev) / 2 + (kNext - kHere) / 2;
    const yawMax = nm === 'J_caudal' ? 35 : Math.min(70, Math.round(RIG.perVertebra * nVert));
    const pitchMax = nm === 'J_caudal' ? 45 : Math.min(30, Math.round(8 * nVert));
    joints[nm] = {
      kind: nm === 'J_root' ? 'root (the body block behind the head; its node also carries the fish\'s heading)' : nm === 'J_caudal' ? 'hypural joint (the caudal fin\'s hinge)' : 'spine',
      vertebrae: nm === 'J_caudal' ? 'hypural' : `${kHere}/${kHere + 1}`, sMM: r4(p[0]),
      channels: {
        yaw: ch(axisFor(p, [0, 1, 0], behind, [0, 0, 1]), [-yawMax, yawMax], { positive: 'the segment behind toward the fish\'s left' }),
        pitch: ch(axisFor(p, [0, 0, 1], behind, [0, 1, 0]), [-Math.round(pitchMax * 0.6), pitchMax], { positive: 'the segment behind up (dorsal)' }),
      },
    };
  });
  for (const nm of ['J_caudal2', 'J_caudal3']) {
    const p = at(nm), behind = add3(p, [3, 0, 0]);
    joints[nm] = { kind: 'caudal fin (the rays bending along their length)', sMM: r4(p[0]), channels: {
      yaw: ch(axisFor(p, [0, 1, 0], behind, [0, 0, 1]), [-30, 30], { positive: 'the fin behind toward the fish\'s left' }),
      pitch: ch(axisFor(p, [0, 0, 1], behind, [0, 1, 0]), [-20, 30], { positive: 'the fin behind up' }),
    } };
  }
  // the head on the first vertebra: ≤ 5° (Michel 2014: the skull and girdle are rigid; the body pitches over the fins)
  const hj = Object.fromEntries(HEAD_JOINTS.map((j) => [j.name, j]));
  { const p = at('J_head'), front = add3(p, [-8, 0, 0]); joints.J_head = { kind: 'head on the first vertebra', channels: {
    pitch: ch(axisFor(p, hj.J_head.axis, front, [0, 1, 0]), hj.J_head.range, { positive: 'the snout up' }),
    yaw: ch(axisFor(p, [0, 1, 0], front, [0, 0, 1]), [-5, 5], { positive: 'the snout toward the fish\'s left' }),
  } }; }
  // the head's mechanism (skull.mjs HEAD_JOINTS): axis, lift, twist, slide (object frame; slide in metres per unit), ranges
  for (const nm of ['J_premax', 'J_maxL', 'J_maxR', 'J_suspL', 'J_suspR', 'J_jaw', 'J_imj', 'J_opercL', 'J_opercR', 'J_hyoid']) {
    const H = hj[nm], c = {};
    if (H.axis) c.angle = ch(H.axis, H.range);
    if (H.lift) c.lift = ch(H.lift, [-25, 10]);
    if (H.twist) c.twist = ch(H.twist, [0, 90]);
    joints[nm] = { kind: 'head mechanism (skull.mjs HEAD_JOINTS)', channels: c, ...(H.slide ? { slide: { dir: obj(H.slide), mPerUnit: r4(HL * 0.001), range: H.slideRange } } : {}) };
  }
  // the eyes: translation only (they carry the cups' rims and the web: headWeights); the globes turn as the Eye nodes
  for (const s of ['L', 'R']) joints[`J_eye${s}`] = { kind: 'eye (translation only)', translate: { dir: [0, 1, 0], rangeM: [r4(-BLINK_DROP * HL * 0.001), r4(0.03 * HL * 0.001)], restM: 0, liftM: r4(0.03 * HL * 0.001), dropM: r4(BLINK_DROP * HL * 0.001) } };
  // the pectoral arm, left (the right mirrored as axial vectors): the shoulder's swing (about the lateral axis: the lobe
  // swept forward or back as seen from the side, prop 80–90° and reach 40° forward-down: body_fins_colour §2.1),
  // protraction (about the girdle's vertical hinge, OST §3.8: a forward arc round the flank), abduction (about the fore-
  // aft axis: the lobe out from the flank and up) and its twist about its own axis; the elbow's flexion (Pace & Gibb
  // 2009: the intra-fin angle 76° → 178° on land; bind ≈ 171°) and bend; the wrist's flexion (the blade turned forward
  // 70–110° and laid flat when the lobe stands as a leg) and bend; the blade's flex (the rays bending under the load)
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R', fx = (a) => (side > 0 ? a : mirrorAxial(a)), fp = (p) => (side > 0 ? p : mirror(p));
    const sh = P.shoulder, el = P.elbow, wr = P.wrist, F1 = armFrame(sh, el), F2 = armFrame(el, wr);
    const tip = add3(wr, mul3(norm3(sub3(wr, el)), 0.3));
    joints[`J_pec${S}`] = { kind: 'pectoral shoulder', channels: {
      swing: ch(fx(axisFor(sh, [0, 0, 1], el, [-1, 0, 0])), [-60, 110], { positive: 'the lobe swept forward (seen from the side)' }),
      protraction: ch(fx(axisFor(sh, [0, 1, 0], el, [-1, 0, 0])), [-45, 70], { positive: 'the lobe forward round the flank (the vertical hinge)' }),
      abduction: ch(fx(axisFor(sh, [1, 0, 0], el, [0, 0, 1])), [-25, 70], { positive: 'the lobe out from the flank / up' }),
      twist: ch(fx(axisFor(sh, F1.u, add3(sh, mul3(F1.w, 0.1)), F1.n)), [-60, 60], { positive: 'the lobe\'s front edge turned out' }),
    } };
    // (the intra-fin angle 180° − bend runs 76° → 178° on land (Pace & Gibb 2009): flexion from the bind bend b is b − 2 back
    // to straight and 104 − b on)
    // (signed about the flexion axis: + when the bind forearm is already flexed forward)
    const flexAx = axisFor(el, F2.n, wr, [-1, 0, 0]), bend = (Math.atan2(dot3(cross3(F1.u, F2.u), flexAx), dot3(F1.u, F2.u)) * 180) / Math.PI;
    joints[`J_pecElbow${S}`] = { kind: 'pectoral elbow (radial–ray joint in the lobe)', bindBendDeg: r4(bend), intraFinAngleDeg: { bind: r4(180 - bend), range: [76, 178] }, channels: {
      flexion: ch(fx(flexAx), [Math.round(2 - bend), Math.round(104 - bend)], { positive: 'the forearm forward (the intra-fin angle closing)' }),
      bend: ch(fx(axisFor(el, F2.w, wr, F2.n)), [-35, 35], { positive: 'the forearm out of the lobe\'s plane, outward' }),
    } };
    joints[`J_pecWrist${S}`] = { kind: 'pectoral wrist (the blade\'s root)', channels: {
      flexion: ch(fx(axisFor(wr, F2.n, tip, [-1, 0, 0])), [-40, 110], { positive: 'the blade turned forward' }),
      bend: ch(fx(axisFor(wr, F2.w, tip, F2.n)), [-60, 60], { positive: 'the blade out of the lobe\'s plane, outward' }),
    } };
    const bp = fp(BLADE.at.map((c) => c / HL)), bt = add3(side > 0 ? BLADE.at.map((c) => c / HL) : bp, mul3(F2.u, 0.2));
    joints[`J_pecBlade${S}`] = { kind: 'pectoral blade (mid-fan)', pivotFrom: BLADE.from, channels: {
      flex: ch(fx(axisFor(BLADE.at.map((c) => c / HL), F2.n, bt, [-1, 0, 0])), [-40, 60], { positive: 'the outer blade turned forward' }),
    } };
    void bp;
  }
  // the pelvic fins' base: pitch about the lateral axis (+ presses the rear of the cup down: the piston, Wicaksono 2022)
  { const p = BODY_SCULPT.pelvicBase.c, rear = add3(p, [0.2, 0, 0]); joints.J_pelvic = { kind: 'pelvic base', channels: {
    pitch: ch(axisFor(p, [0, 0, 1], rear, [0, -1, 0]), [-20, 35], { positive: 'the cup\'s rear down' }),
    roll: ch(axisFor(p, [1, 0, 0], add3(p, [0, -0.1, 0]), [0, 0, 1]), [-15, 15], { positive: 'the cup tilted toward the fish\'s left' }),
  } }; }
  for (const [nm, d] of Object.entries(joints)) { d.parent = JOINTS[J[nm]].parent; d.pivotM = JOINTS[J[nm]].obj.map((c) => +c.toFixed(6)); }
  if (joints.J_root) joints.J_root.parent = null;
  const ex = (side) => {
    const S = side > 0 ? 'L' : 'R', open = norm3(HEAD_SCULPT.cup.open), w = side > 0 ? open : mirror(open);
    return {
      joint: `J_eye${S}`, node: `Eye_${S}`, ...(side < 0 ? { mirrored: true } : {}), radiusMM: r4(EYE_MM.radius),
      window: obj(w), liftM: r4(0.03 * HL * 0.001), dropM: r4(BLINK_DROP * HL * 0.001),
      // the gaze turns the Eye node about the globe's centre (build-pose.mjs): pitch about the fore-aft axis (+ = the
      // window up), then yaw about the vertical (+ = the window forward), relative to the resting window (55° out, 15° up:
      // LB §4; behaviour.md §3.9 yaw −20…100° from forward, pitch −20…60°)
      gaze: { pitch: { axis: obj(side > 0 ? [-1, 0, 0] : [1, 0, 0]), range: [-35, 45], positive: 'window up' },
        yaw: { axis: obj(side > 0 ? [0, -1, 0] : [0, 1, 0]), range: [-45, 75], positive: 'window forward' }, order: 'pitch then yaw' },
    };
  };
  const spine = [['J_head', r4(JOINTS[J.J_head].at[0])], ...['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2', 'J_caudal3'].map((n) => [n, r4(JOINTS[J[n]].at[0])])];
  return {
    units: 'object frame: metres, +X the fish\'s left, +Y dorsal, +Z anterior; angles in degrees; bind rotations identity, so these are the joints\' local axes; a right-hand turn about `axis` by a positive angle moves as `positive` says',
    hlMM: r4(HL), tlMM: 80,
    joints,
    spine: { tlMM: 80, joints: spine, knots: AXIAL_KNOTS.map(([n, k]) => [n, r4(k * HL)]), vertebrae: { count: 26, precaudal: 10, caudal: 16, jointsMM: vertebralJoints().map((s) => r4(s * HL)) } },
    pectoral: { L: ['J_pecL', 'J_pecElbowL', 'J_pecWristL', 'J_pecBladeL'], R: ['J_pecR', 'J_pecElbowR', 'J_pecWristR', 'J_pecBladeR'] },
    eyes: { L: ex(1), R: ex(-1) },
    head: { poses: HEAD_POSES, blinkDropHL: BLINK_DROP },
  };
}

/** Runtime metadata (root extras): per joint its object-frame axes and ranges, the spine table, the arms' chains, the
 * eyes (translation-only joints, gaze on the Eye nodes), the head's poses. */
export const AXES = buildAxes();

/** AXES restricted to a tier's joints (the spine table, the chains and the joint list cut to what the tier keeps). */
export function axesForTier(tier) {
  const keep = new Set(TIER_JOINTS[tier]);
  return {
    ...AXES, tier, jointNames: TIER_JOINTS[tier],
    joints: Object.fromEntries(Object.entries(AXES.joints).filter(([k]) => keep.has(k))),
    spine: { ...AXES.spine, joints: AXES.spine.joints.filter(([k]) => keep.has(k)), knots: AXES.spine.knots.filter(([k]) => keep.has(k)) },
    pectoral: { L: AXES.pectoral.L.filter((k) => keep.has(k)), R: AXES.pectoral.R.filter((k) => keep.has(k)) },
    eyes: keep.has('J_eyeL') ? AXES.eyes : null,
  };
}

export { HEAD_NAMES, HL };
