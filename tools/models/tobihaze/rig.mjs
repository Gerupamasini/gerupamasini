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
import { HL, HEAD, EYE_MM, toObject, dirToObject } from './anatomy.mjs';
import { BODY_SCULPT, trunkProfile, fishSDF } from './body.mjs';
import { HEAD_SCULPT, headSDF } from './head.mjs';
import { HEAD_JOINTS, fitTeeth } from './skull.mjs';
import { axisAngle, worldTransforms } from './skel.mjs';
import { eyeGlobe } from './eye.mjs';
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
  // the radial–ray joint), the wrist from the elbow over `wrist` (null: the lobe's skin stays the elbow's to its end, the
  // wrist turns only the blade's rays where they leave the flesh: round B1's [−0.07, 0] put the spatulate end cap on the
  // wrist, and a 40° wrist flexion then sheared the cap against the forearm, area 0.02–0.03 at the 0.1st percentile, 32–38
  // new flipped facets and 27–30 skin vertices through the skin); `soft`: the two segments' parameters blended over this
  // difference of their distances (the nearer segment alone jumps across the inside of the bend)
  lobe: { elbow: [-0.06, 0.05], wrist: null, soft: 0.015 },
  // the lobe's share is held off the gill cover: none in front of the opercle's margin + `margin[0]` (the slit and its
  // fused membrane, headrig's fuse band), all of it from margin + `margin[1]`
  lobeGate: { margin: [0.012, 0.07] },
  // the lobe's and the pelvic base's shares smoothed over the mesh to this radius (HL; passes scaled by the cell), so a
  // thin protrusion's steep field difference does not step (round B2: 0.03 → 0.05, with lobeBand 0.08 and rootPad: the
  // arm's root at a 60° swing went from area 0.07–0.19 at the 0.1st percentile to 0.30–0.32, b2_rig t_sweep)
  shareSmooth: 0.05,
  // the lobe's share over this half-width of the field difference at least (the sculpt's own blend is narrower: 0.025 gave
  // the root's fillet 8–15 % more stretch at the 99.9th percentile in the arm's poses than 0.05, poses.mjs ab0/ab1;
  // round B2: 0.08)
  lobeBand: 0.08,
  // the flank round the arm's root follows the shoulder in part (`share` of J_pec out to `reach[0]` from the shoulder's
  // pivot, none beyond `reach[1]`): the fin's abductor and adductor fan onto the girdle under loose skin, and spread over
  // this halo the shoulder's swing stretches a band instead of tearing the narrow fillet where the arm leaves the flank
  shoulderHalo: { share: 0.5, reach: [0.05, 0.24] },
  // the arm's row eased in along the arm from its root (armParam t: 0 at the shoulder's pivot, the elbow at 1): the
  // root pad fused to the flank (t < 0.2) keeps the body's row, the upper arm takes the shoulder's over its first half
  // (rootPadShare; null: the arm's row over the whole lobe, as round B1). On the B2 arm, round B1's rows crushed the
  // root in the swim, hop and reach poses (area p001 0.14–0.27, 17–256 new flipped facets); these take every rig pose
  // to 0 new flips and area ≥ 0.46 but the forward reach, which the shoulder's coupled limit keeps from crushing
  rootPad: [0, 0.5],
  // the blade joint's pivot when fins.mjs gives none: this far out past the wrist's cap along elbow → wrist
  bladeLen: 0.40,
  // the pectoral blade's rows along its rays (rayT): the body's row at the root eased into J_pecWrist by `wrist`, J_pecBlade
  // across the planted sole's heel (fins.mjs def.sole) or over `band` without one
  blade: { wrist: 0.3, band: [0.3, 0.6], heel: true },
  // the dorsal and anal fins' rows carried from the ray's base toward its folded place over this band of rayT (fins.mjs
  // test 14's proposed rule: 0 folded vertices inside the arched back)
  medianFold: [0.15, 0.6],
  // the vertebrae's bend limit (Swanson & Gibb 2004: up to 20° per intervertebral joint in the land jump's coil)
  perVertebra: 20,
  // the stiff front's yaw tighter than its vertebrae allow (deg; round B1: 50 and 60): the head and front stay still in
  // the coil and a crawl bends the body only a little behind the pectorals (Swanson & Gibb 2004; Wicaksono 2022)
  yawCap: { J_sp1: 30, J_sp2: 45 },
  // the whole chain's curl (AXES.spine.curlBudget): Σ|yaw| over J_sp1 … J_caudal at most `yawAbsSum` (round B1: the rig's
  // 208° J clean, 260° buried the caudal, every joint at its limit (505°) put 4,701 vertices through the trunk), and
  // the recommended J-curl (deg per joint) the escape jump coils by, sharpest at ⅔ of the length
  curl: { joints: ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'], yawAbsSum: 220, perVertebraDeg: 20, jcurl: [8, 18, 30, 36, 40, 36, 25, 15] },
  // the eyes' lift (HL): the joint's range up to `eyeLift` (the alert periscope, u1 and A070: the eye's top 0.5–0.9 ED over
  // the nape, the rest 0.55; +0.08: 0.93 ED) with the eyes-up correctives (headmorphs EYES_UP: skinned alone, the collar
  // past +0.03 stretches in a band, 383 web edges over 2× at +0.05 and 1,345 at +0.08, against 3 and 118 with them);
  // `eyeLiftBare` the most without them (round B1's); `eyeAlert` the alert state's (0.84 ED)
  eyeLift: 0.08, eyeLiftBare: 0.03, eyeAlert: 0.06,
  // the shoulder's channel ranges (deg) and its coupled limits (Σ coefficient × channel ≤ max): the skin's own limits on
  // the B2 arm with these rows (round B1's: swing [−60, 110], protraction [−45, 70], abduction [−25, 70], twist ±60 and
  // no coupled limit). Fitted on 1,133 probe poses (b2_rig t_combo, h 0.14: swing × abduction × protraction at twist
  // 0, 450; × twist ±15/30/50, 360; high protraction × twist, 72; the forward boundary finely, 31; random inside two
  // earlier sets, 220) against the root's gate over its whole neighbourhood (every triangle within 0.35 HL of the
  // shoulder: area ≥ 0.3 of the bind at the 0.1st percentile, ≤ 5 new flipped facets, no skin vertex through the skin).
  // The clean set is not convex (past ~40° of forward swing the axilla's front crushes in a band between the abducted
  // and the protracted arm; the twist must follow the swing), so these half-spaces keep its abducted side and the
  // states' poses (WATER 51.5/43.5, REST, LAND, the crawl's reach): none of the 190 failing probes is allowed (round
  // B1's ranges allowed all of them), 689 of the 943 clean ones are; 100 fresh random poses inside: b2_rig combo_rand4.
  shoulder: {
    swing: [-45, 75], protraction: [-25, 70], abduction: [-20, 70], twist: [-60, 60],
    coupled: [
      { sum: { abduction: -1, protraction: -1 }, max: 27, note: 'pressed in and turned back together: the arm into the flank (abduction −10° with protraction −25°: 650–3,200 skin vertices through it)' },
      { sum: { abduction: -1, protraction: -1, twist: -0.4 }, max: 35, note: 'the same with the front edge turned in (abduction −3° protraction −21° twist −31°: 68 vertices through)' },
      { sum: { swing: 3.1, abduction: -1, protraction: 0.3 }, max: 116.2, note: 'the forward swing: past 37.5° each degree needs 3.1° of abduction (adducted, the root drives into the gill cover: swing 45° abduction 0°: area 0.23); with the next limit, 52.5° at most' },
      { sum: { swing: 1.4, abduction: 1, protraction: 1.5 }, max: 120, note: 'forward, out and round the flank at once: the root\'s top folds (swing 36° abduction 20° protraction 40°: area 0.28; 45/20/40: 0.18)' },
      { sum: { twist: 1, swing: -1.2, abduction: -0.75, protraction: -0.2 }, max: 66, note: 'the front edge turned out with the arm swung back: the root folds and the arm enters the flank (swing −45° twist +30°: area 0.29; adducted, twist +15°: 170 vertices through)' },
      { sum: { twist: -1, swing: 1.2, abduction: -2, protraction: 1.6 }, max: 94, note: 'the front edge turned in with the arm swung forward and protracted (swing 40° abduction −20° twist −15°: area 0.21)' },
      { sum: { twist: -1, protraction: -1, swing: 0.2 }, max: 55, note: 'the front edge turned in with the arm turned back: the lobe into the flank (protraction −20° twist −50°: skin through the skin)' },
      { sum: { twist: 1, protraction: 0.5, swing: -1, abduction: -1 }, max: 80, note: 'the front edge turned out with the arm protracted and swung back (swing −30° protraction 40° twist 50°: area 0.23; −21/8/69/59: 0.14)' },
      { sum: { twist: -1, protraction: 1, abduction: 1, swing: 1 }, max: 127, note: 'the front edge turned in with the arm protracted and abducted (abduction 30° protraction 55° twist −50°: area 0.19)' },
    ],
  },
  // the elbow's total bend (deg, bind's + flexion) at most this (the intra-fin angle ≥ 127°): past it the inside of the
  // bend crushes (bend 56°: elbow area 0.26 at the 0.1st percentile; 66°: 0.11 and 5 flipped facets). Pace & Gibb's
  // 76° intra-fin angle needs an elbow corrective shape
  elbowMaxBend: 53,
  // the wrist (deg): its flexion turns the blade in its own plane, which shears the membrane by its root (±40°: the
  // planted blade's edges 0.17–2.95 of their length); its bend (out of the plane) keeps it within 0.83–1.44 at ±60°
  wrist: { flexion: [-20, 20], bend: [-60, 60] },
  // the blade's flex: 'w' about the axis across the rays in the fan's plane (the lobe's width, F2.w), or 'heel' about
  // fins.mjs's planted heel line (def.sole.axis, 12° from w); its range (deg)
  bladeFlexAxis: 'w', bladeFlexRange: [-30, 60],
  // the rest state's arm (statePose 'rest'): fins.mjs's rest pose with the shoulder abducted `abduction` deg more (its
  // arm's medial face otherwise sinks 0.24 mm into the flank, 430 skin vertices through the skin; +4°: 1); the water
  // state's paddles (round B1's WATER: clean on these rows, the root's area 0.62 at the 0.1st percentile)
  rest: { abduction: 4 },
  // the crawl's stance for the runtime (b2_rig t_crawl: the sole welded on the ground while the body moves over it, the
  // arm solved by solveArmPlant with a target, every step's IK exact (≤ 0.05 mm, sole tilt ≤ 2°), within the channels'
  // and the coupled limits, the arm's root clean: area ≥ 0.3 at the 0.1st percentile, no flipped facet, no vertex through
  // the skin): with the front raised 12–15°, the sole's centre from the shoulder's neutral plant (fish frame, mm: behind
  // it and out from it, ground level), welded from `ahead` mm ahead of it (toward the head: the stance's start) to `behind`
  // mm behind it (its end), within `lateral` mm in and out (raise 15°, Δz 0: 5 mm ahead … 1 mm behind clean; further ahead
  // the shoulder's coupled limit stops the reach, further behind the sole tilts past 2° and lifts as the arm runs out)
  crawl: { raiseDeg: [12, 15], neutral: { 15: { backMM: 1.77, outMM: 5.3, shoulderHeightMM: 9.06 }, 12: { backMM: 2.29, outMM: 6.21, shoulderHeightMM: 8.24 } }, stanceMM: { ahead: 5, behind: 1 }, lateralMM: [-1, 0.5] },
  water: { shoulder: { swing: 51.5, abduction: 43.5 }, elbow: { flexion: -20 } },
  // the propped land posture (A070, A005, u1, B010; solveArmPlant): the front's raise bent over J_sp1 … J_sp3 in these
  // shares; the leg's posture the IK leans toward (fish frame, left side): the upper arm 15° behind the vertical and 10°
  // out, the forearm 15° ahead of it (the shared pectoral design of round B2), pulled with `posture` (cost per deg²); the
  // IK's second seed
  prop: { raise: 15, heelSink: 0.04, split: [0.2, 0.3, 0.5], upper: [0.255, -0.951, 0.174], fore: [-0.205, -0.963, 0.174], posture: 0.001, seed: { J_pec: { swing: 20, abduction: -10 }, J_pecElbow: { flexion: 10 } } },
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

/** The blade joint's pivot (fish mm) of the left arm: fins.mjs's own when it has one (round B2: the planted sole's heel,
 * with the sole itself: def.sole, bind space, mm and unit vectors), else half way out along the lobe. */
let FINS = null;
async function bladePivotL() {
  try {
    const F = await import('./fins.mjs');
    FINS = F;
    const def = F.finDefinitions?.(BODY_SCULPT)?.find((d) => d.name === 'Fin_Pectoral_L');
    if (def?.bladePivot) return { at: [...def.bladePivot], from: def.sole ? 'fins.mjs bladePivot (the planted sole\'s heel)' : 'fins.mjs bladePivot', sole: def.sole ?? null, restPose: def.restPose ?? null, def };
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

/** The joints each tier keeps (body_contract §3; round B2: lod1 keeps the blades' joints, 28 ≤ 32, so the planted
 * sole's heel and its roll-off are the same joint at hero and lod1 and one arm IK serves both). */
export const TIER_JOINTS = {
  hero: JOINTS.map((j) => j.name),
  lod1: JOINTS.map((j) => j.name).filter((n) => !['J_premax', 'J_maxL', 'J_maxR', 'J_imj', 'J_caudal3'].includes(n)),
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
  const a = smoothstep(L1 + L.elbow[0], L1 + L.elbow[1], arc), b = L.wrist ? Math.min(a, smoothstep(aw + L.wrist[0], aw + L.wrist[1], arc)) : 0;
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

/** The share of the arm's own row a lobe vertex takes by its place along the arm (armParam t): the root pad fused to the
 * flank (t < RIG.rootPad[1]) hands its row back to the body's (the trunk round's request: the pad is flank muscle the
 * fin's abductors fan into, and turned rigidly with the shoulder it drags and shears the flank round it). */
export function rootPadShare(t) {
  const RP = RIG.rootPad;
  return RP ? smoothstep(RP[0], RP[1], t) : 1;
}

export function bodyRowAt(p, shares, row = new Float32Array(NJ)) {
  row.fill(0);
  const { m: m0, mp } = shares(p[0], p[1], p[2]);
  axialRow(p[0], row, 1);
  addHalo(p, row);
  const t = m0 > 0 ? armParam(p, p[2] >= 0 ? 1 : -1).t : 0, m = m0 > 0 ? m0 * rootPadShare(t) : 0;
  if (m > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - m; lobeRow(t, p[2] >= 0 ? 1 : -1, row, m); }
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
    const ma = m[v] > 0 ? m[v] * rootPadShare(lobeT[v]) : 0;
    if (ma > 0) { for (let k = 0; k < NJ; k++) row[k] *= 1 - ma; lobeRow(lobeT[v], z >= 0 ? 1 : -1, row, ma); }
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
  // the blade joint's band along each ray (rayT): the planted sole's heel (fins.mjs plantFrame.rays[k].at, the turn's
  // start, to def.sole.from.rayT[k], the sole's), so J_pecBlade is the ankle the sole turns on and the whole sole rides it
  // rigidly; without a sole (round B1's fins) 0.3 … 0.6
  const heel = type === 'pectoral' && RIG.blade.heel !== false && def.sole?.from?.rayT && (def.plantFrame ?? def.mirrorOf?.plantFrame)?.rays
    ? (def.plantFrame ?? def.mirrorOf.plantFrame).rays.map((pr, k) => { const tB = def.sole.from.rayT[k], tA = clamp(pr.at / def.rays[k].len, RIG.blade.wrist, tB - 0.05); return [tA, Math.max(tB, tA + 0.05)]; })
    : null;
  const heelAt = (r) => { if (!heel) return RIG.blade.band; const x = clamp(r, 0, heel.length - 1), k0 = Math.floor(x), k1 = Math.min(heel.length - 1, k0 + 1), f = x - k0; return [heel[k0][0] + (heel[k1][0] - heel[k0][0]) * f, heel[k0][1] + (heel[k1][1] - heel[k0][1]) * f]; };
  const MF = RIG.medianFold;
  for (let v = 0; v < n; v++) {
    row.fill(0);
    const t = mesh.rayT[v];
    if (type === 'pectoral' || /^J_pecWrist/.test(def.joint ?? '')) {
      // the blade: the body's row at the root (the lobe's end), then the wrist by rayT RIG.blade.wrist, the blade joint
      // across the heel
      const [tA, tB] = heelAt(mesh.ray[v]);
      const a = smoothstep(0, RIG.blade.wrist, t), b = smoothstep(tA, tB, t);
      if (a < 1) { const B = baseAt(v); for (let k = 0; k < NJ; k++) row[k] = B[k] * (1 - a); }
      row[J[`J_pecWrist${S}`]] += a * (1 - b); row[J[`J_pecBlade${S}`]] += a * b;
    } else {
      // the fin's own rule, eased in from the body's row at the root over the first `ease` of the rays
      let ease;
      if (type === 'pelvic' || def.joint === 'J_pelvic') { row[J.J_pelvic] = 1; ease = 0.2; }
      else if (type === 'caudal') { axialRow(mesh.position[v * 3] / HL, row, 1); ease = 0.15; }
      else {
        // the dorsal and anal fins: the axial row at the ray's base, carried along the ray toward the vertebrae it lies
        // over when folded (fins.mjs mesh.foldS; without it, half way toward the vertex's own s), so a folded ray's tip
        // follows the back's arch instead of standing rigid on its base's vertebra (round B1: 813 folded-D1 vertices
        // 0.97 mm inside the back at +8° pitch a joint)
        const s0 = mesh.baseS[v], s1 = mesh.foldS ? mesh.foldS[v] : s0 + 0.5 * (mesh.position[v * 3] - s0);
        axialRow((s0 + (s1 - s0) * smoothstep(MF[0], MF[1], t)) / HL, row, 1); ease = 0.15;
      }
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
export const mirrorAxial = (a) => [-a[0], -a[1], a[2]];
const obj = (a) => dirToObject(a).map(r4);
/** object-frame direction → fish frame (the inverse of anatomy.dirToObject) */
export const objToFish = (a) => [-a[2], a[1], a[0]];

/** The pectoral arm's local frame at a joint (fish frame, left side): u along the segment, n the flat lobe's broad face
 * normal (BODY_SCULPT.pectoral.axes.n when the sculpt gives it, else the lateral axis made square to u, as body.mjs's
 * limbs are built), w = n × u across the lobe. */
function armFrame(a, b, faceN = BODY_SCULPT.pectoral.axes?.n ?? [0, 0, 1]) {
  const u = norm3(sub3(b, a)), n = norm3(sub3(faceN, mul3(u, dot3(faceN, u))));
  return { u, n, w: cross3(n, u) };
}

/** The resting window's direction (fish frame, left eye): the pupil's centroid seen from the globe's centre (eye.mjs
 * eyeGlobe), and its angles: out from straight ahead in the horizontal plane, up from the horizontal. Round B1 wrote 55°
 * out and 15° up from the literature (behaviour §3.9's defaults); the globe as built looks 71.7° out and 12.2° up. */
export const EYE_REST = (() => {
  const g = eyeGlobe(HEAD.eye.d / 2, { side: 1, nt: 40, np: 64 }), c = [0, 0, 0];
  for (const i of new Set(g.pupil)) for (let k = 0; k < 3; k++) c[k] += g.position[i * 3 + k];
  const w = norm3(c);
  return { dir: w, outDeg: (Math.atan2(w[2], -w[0]) * 180) / Math.PI, upDeg: (Math.asin(w[1]) * 180) / Math.PI };
})();

/** behaviour.md §3.9: the gaze's absolute range (yaw −20 … 100° out from straight ahead, pitch −20 … 60° up), the
 * defaults 55° out and 15° up; the eye's lift for the alert periscope (u1, A070: the eye's top 0.5–0.9 ED over the nape,
 * the rest 0.45–0.64; the model's rest 0.55 ED) */
const GAZE = { outDeg: [-20, 100], upDeg: [-20, 60], defaultOut: 55, defaultUp: 15 };

/** The axial chain's joints that bend the body (J_root is the attitude), in order. */
export const SPINE_BEND = ['J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'];

function buildAxes() {
  const at = (n) => JOINTS[J[n]].at, P = BODY_SCULPT.pectoral;
  const ch = (axisFish, range, extra = {}) => ({ axis: obj(axisFish), range, ...extra });
  const joints = {};
  // the attitude (J_root: the parent of J_head and of J_sp1, so it turns the whole fish and bends nothing): yaw, pitch
  // and roll, unbounded (round B1 gave it the spine's 40° / 16° and the land prop stopped at its −10° limit). Its axes'
  // signs follow the chain's (+ yaw: the tail toward the fish's left; + pitch: the tail up), so B1's poses keep their
  // meaning; the front is raised by bending J_sp1 … J_sp3 (pitch +: the segment behind up against the front) with the
  // attitude snout-up by as much (J_root pitch −raise), so the rear stays level (proppedPose).
  {
    const p = at('J_root'), behind = add3(p, [5, 0, 0]), top = add3(p, [0, 5, 0]);
    joints.J_root = {
      kind: 'root: the whole fish\'s attitude (heading, pitch, roll; it bends nothing: J_head and J_sp1 both hang from it). A driver may put the attitude on J_root or on the model\'s root node; the front is raised by bending J_sp1 … J_sp3 (pitch +, the segments behind up against the front) while J_root pitches the whole fish snout-up by as much (pitch −raise), so the rear stays level (rig.mjs proppedPose)',
      sMM: r4(p[0]), order: ['yaw', 'pitch', 'roll'],
      channels: {
        yaw: ch(axisFor(p, [0, 1, 0], behind, [0, 0, 1]), [-180, 180], { positive: 'the tail toward the fish\'s left (the snout turns right)' }),
        pitch: ch(axisFor(p, [0, 0, 1], behind, [0, 1, 0]), [-90, 90], { positive: 'the tail up (the snout down)' }),
        roll: ch(axisFor(p, [1, 0, 0], top, [0, 0, 1]), [-180, 180], { positive: 'the back toward the fish\'s left (the left side down)' }),
      },
    };
  }
  // the bending chain: yaw (+ bends the segment behind toward the fish's left) and pitch (+ bends it up); ranges from the
  // vertebrae either side of the joint (RIG.perVertebra per intervertebral joint between the two bone centres), the
  // stiff front tighter (RIG.yawCap: Swanson & Gibb 2004, the head and front still in the coil; round B1's J-curl
  // used 8° and 18° there); the whole chain's curl is bounded by AXES.spine.curlBudget
  const V = vertebralJoints(), chain = ['J_root', ...SPINE_BEND];
  chain.forEach((nm, i) => {
    if (nm === 'J_root') return;
    const p = at(nm), behind = add3(p, [5, 0, 0]);
    const kPrev = RIG.stations[chain[i - 1]], kNext = i + 1 < chain.length ? RIG.stations[chain[i + 1]] : RIG.column.precaudal + RIG.column.caudal;
    const kHere = RIG.stations[nm], nVert = (kHere - kPrev) / 2 + (kNext - kHere) / 2;
    const yawMax = Math.min(RIG.yawCap[nm] ?? 70, nm === 'J_caudal' ? 35 : Math.round(RIG.perVertebra * nVert));
    const pitchMax = nm === 'J_caudal' ? 45 : Math.min(30, Math.round(8 * nVert));
    joints[nm] = {
      kind: nm === 'J_caudal' ? 'hypural joint (the caudal fin\'s hinge)' : 'spine',
      vertebrae: nm === 'J_caudal' ? 'hypural' : `${kHere}/${kHere + 1}`, sMM: r4(p[0]), order: ['yaw', 'pitch'],
      channels: {
        yaw: ch(axisFor(p, [0, 1, 0], behind, [0, 0, 1]), [-yawMax, yawMax], { positive: 'the segment behind toward the fish\'s left' }),
        pitch: ch(axisFor(p, [0, 0, 1], behind, [0, 1, 0]), [-Math.round(pitchMax * 0.6), pitchMax], { positive: 'the segment behind up (dorsal)' }),
      },
    };
  });
  void V;
  for (const nm of ['J_caudal2', 'J_caudal3']) {
    const p = at(nm), behind = add3(p, [3, 0, 0]);
    joints[nm] = { kind: 'caudal fin (the rays bending along their length)', sMM: r4(p[0]), order: ['yaw', 'pitch'], channels: {
      yaw: ch(axisFor(p, [0, 1, 0], behind, [0, 0, 1]), [-30, 30], { positive: 'the fin behind toward the fish\'s left' }),
      pitch: ch(axisFor(p, [0, 0, 1], behind, [0, 1, 0]), [-20, 30], { positive: 'the fin behind up' }),
    } };
  }
  // the head on the first vertebra: ≤ 5° (Michel 2014: the skull and girdle are rigid; the body pitches over the fins)
  const hj = Object.fromEntries(HEAD_JOINTS.map((j) => [j.name, j]));
  { const p = at('J_head'), front = add3(p, [-8, 0, 0]); joints.J_head = { kind: 'head on the first vertebra', order: ['yaw', 'pitch'], channels: {
    yaw: ch(axisFor(p, [0, 1, 0], front, [0, 0, 1]), [-5, 5], { positive: 'the snout toward the fish\'s left' }),
    pitch: ch(axisFor(p, hj.J_head.axis, front, [0, 1, 0]), hj.J_head.range, { positive: 'the snout up' }),
  } }; }
  // the head's mechanism (skull.mjs HEAD_JOINTS): axis, lift, twist, slide (object frame; slide in metres per unit), ranges,
  // composed angle then lift (headrig.poseLocals); the right side's twist written as the axial mirror of the left's
  // (skull.mjs gives J_maxR the left's twist mirrored as a position, so the same twist would turn the two maxillae
  // unlike; no head pose uses twist)
  for (const nm of ['J_premax', 'J_maxL', 'J_maxR', 'J_suspL', 'J_suspR', 'J_jaw', 'J_imj', 'J_opercL', 'J_opercR', 'J_hyoid']) {
    const H = hj[nm], c = {};
    if (H.axis) c.angle = ch(H.axis, H.range);
    if (H.lift) c.lift = ch(H.lift, [-25, 10]);
    if (H.twist) c.twist = ch(nm === 'J_maxR' ? mirrorAxial(hj.J_maxL.twist) : H.twist, [0, 90]);
    joints[nm] = { kind: 'head mechanism (skull.mjs HEAD_JOINTS)', order: ['angle', 'lift', 'twist'].filter((k) => c[k]), channels: c, ...(H.slide ? { slide: { dir: obj(H.slide), mPerUnit: r4(HL * 0.001), range: H.slideRange } } : {}) };
  }
  // the eyes: translation only (they carry the cups' rims and the web: headWeights); the globes turn as the Eye nodes
  const liftM = r4(RIG.eyeLift * HL * 0.001), dropM = r4(BLINK_DROP * HL * 0.001);
  for (const s of ['L', 'R']) joints[`J_eye${s}`] = { kind: 'eye (translation only)', translate: { dir: [0, 1, 0], rangeM: [-dropM, liftM], restM: 0, liftM, dropM, alertM: r4(RIG.eyeAlert * HL * 0.001), liftBareM: r4(RIG.eyeLiftBare * HL * 0.001), note: `lifts past liftBareM need the eyesUp${s} blend shape (weight = lift / liftM); a tier without it keeps the lift within liftBareM` } };
  // the pectoral arm, left (the right mirrored as axial vectors): the shoulder's swing (about the lateral axis: the lobe
  // swept forward or back as seen from the side, prop 80–90° and reach 40° forward-down: body_fins_colour §2.1),
  // protraction (about the girdle's vertical hinge, OST §3.8: a forward arc round the flank), abduction (about the fore-
  // aft axis: the lobe out from the flank and up) and its twist about its own axis; the elbow's flexion (Pace & Gibb
  // 2009: the intra-fin angle 76° → 178° on land) and bend; the wrist's flexion (the blade turned forward) and bend; the
  // blade's flex. Every axis is built on the LEFT side only and mirrored for the right (fx): the same channel values on
  // L and R give mirror images (round B1 built the blade's right axis from the mirrored pivot and the left frame, which
  // flipped its sign)
  const F1 = armFrame(P.shoulder, P.elbow), F2 = armFrame(P.elbow, P.wrist);
  const sh = P.shoulder, el = P.elbow, wr = P.wrist;
  const tip = add3(wr, mul3(F2.u, 0.3));
  const flexAx = axisFor(el, F2.n, wr, [-1, 0, 0]), bend = (Math.atan2(dot3(cross3(F1.u, F2.u), flexAx), dot3(F1.u, F2.u)) * 180) / Math.PI;
  // the blade's flex: about the axis across the rays in the blade's own plane (F2.w; round B1 used the face normal n, which
  // swung the fan inside its own plane and tore the membrane: edge ratio 0.02 … 2.88 at 30°), through J_pecBlade's pivot
  // (fins.mjs: the planted sole's heel); + lifts the planted sole's toes off the ground (def.sole.normal: the roll-off at
  // the end of a stance), which turns the relaxed fan's tip toward the lobe's inner face (−n)
  const bl = BLADE.at.map((c) => c / HL);
  const bladeAxis = RIG.bladeFlexAxis === 'heel' && BLADE.sole ? norm3(BLADE.sole.axis) : F2.w;
  const bladeProbe = BLADE.sole ? BLADE.sole.point.map((c) => c / HL) : add3(bl, mul3(F2.u, 0.2));
  const bladeWant = BLADE.sole ? BLADE.sole.normal : mul3(F2.n, -1);
  const bladeFlex = axisFor(bl, bladeAxis, bladeProbe, bladeWant);
  const bindTipToward = dot3(cross3(bladeFlex, F2.u), F2.n) > 0 ? '+n (out of the lobe\'s outer face)' : '−n (toward the lobe\'s inner face)';
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R', fx = (a) => (side > 0 ? a : mirrorAxial(a));
    joints[`J_pec${S}`] = { kind: 'pectoral shoulder', order: ['swing', 'protraction', 'abduction', 'twist'], channels: {
      swing: ch(fx(axisFor(sh, [0, 0, 1], el, [-1, 0, 0])), [...RIG.shoulder.swing], { positive: 'the lobe swept forward (seen from the side)' }),
      protraction: ch(fx(axisFor(sh, [0, 1, 0], el, [-1, 0, 0])), [...RIG.shoulder.protraction], { positive: 'the lobe forward round the flank (the vertical hinge)' }),
      abduction: ch(fx(axisFor(sh, [1, 0, 0], el, [0, 0, 1])), [...RIG.shoulder.abduction], { positive: 'the lobe out from the flank / up' }),
      twist: ch(fx(axisFor(sh, F1.u, add3(sh, mul3(F1.w, 0.1)), F1.n)), [...RIG.shoulder.twist], { positive: 'the lobe\'s front edge turned out' }),
    }, coupled: RIG.shoulder.coupled.map((c) => ({ ...structuredClone(c), note: `Σ sum[channel] × value ≤ max (deg): ${c.note}` })) };
    // (the intra-fin angle 180° − bend runs 76° → 178° on land (Pace & Gibb 2009): flexion from the bind bend b is b − 2 back
    // to straight and 104 − b on; signed about the flexion axis: + when the bind forearm is already flexed forward)
    joints[`J_pecElbow${S}`] = { kind: 'pectoral elbow (radial–ray joint in the lobe)', bindBendDeg: r4(bend), intraFinAngleDeg: { bind: r4(180 - bend), range: [180 - RIG.elbowMaxBend, 178], biology: [76, 178] }, order: ['flexion', 'bend'], channels: {
      flexion: ch(fx(flexAx), [Math.round(2 - bend), Math.round(RIG.elbowMaxBend - bend)], { positive: 'the forearm forward (the intra-fin angle closing)' }),
      bend: ch(fx(axisFor(el, F2.w, wr, F2.n)), [-35, 35], { positive: 'the forearm out of the lobe\'s plane, outward' }),
    } };
    joints[`J_pecWrist${S}`] = { kind: 'pectoral wrist (the blade\'s root)', order: ['flexion', 'bend'], channels: {
      flexion: ch(fx(axisFor(wr, F2.n, tip, [-1, 0, 0])), [...RIG.wrist.flexion], { positive: 'the blade turned forward in its own plane' }),
      bend: ch(fx(axisFor(wr, F2.w, tip, F2.n)), [...RIG.wrist.bend], { positive: 'the blade out of the lobe\'s plane, outward' }),
    } };
    joints[`J_pecBlade${S}`] = { kind: 'pectoral blade (the planted sole\'s heel: the ankle the sole turns on)', pivotFrom: BLADE.from, order: ['flex'], channels: {
      flex: ch(fx(bladeFlex), [...RIG.bladeFlexRange], { positive: `the outer blade bent out of the fan about the line across its rays: planted, the sole's toes lifted off the ground (the roll-off); relaxed, the fan's tip toward ${bindTipToward}` }),
    } };
  }
  // the pelvic fins' base: pitch about the lateral axis (+ presses the rear of the cup down: the piston, Wicaksono 2022)
  { const p = BODY_SCULPT.pelvicBase.c, rear = add3(p, [0.2, 0, 0]); joints.J_pelvic = { kind: 'pelvic base', order: ['pitch', 'roll'], channels: {
    pitch: ch(axisFor(p, [0, 0, 1], rear, [0, -1, 0]), [-20, 35], { positive: 'the cup\'s rear down' }),
    roll: ch(axisFor(p, [1, 0, 0], add3(p, [0, -0.1, 0]), [0, 0, 1]), [-15, 15], { positive: 'the cup tilted toward the fish\'s left' }),
  } }; }
  for (const [nm, d] of Object.entries(joints)) { d.parent = JOINTS[J[nm]].parent; d.pivotM = JOINTS[J[nm]].obj.map((c) => +c.toFixed(6)); }
  if (joints.J_root) joints.J_root.parent = null;
  const yawLim = (a, b) => [Math.round(a), Math.round(b)];
  const ex = (side) => {
    const S = side > 0 ? 'L' : 'R', open = norm3(HEAD_SCULPT.cup.open), w = side > 0 ? open : mirror(open);
    const out = EYE_REST.outDeg, up = EYE_REST.upDeg;
    return {
      joint: `J_eye${S}`, node: `Eye_${S}`, ...(side < 0 ? { mirrored: true } : {}), radiusMM: r4(EYE_MM.radius),
      window: obj(w), windowCentre: obj(side > 0 ? EYE_REST.dir : mirror(EYE_REST.dir)), restOutDeg: +out.toFixed(1), restUpDeg: +up.toFixed(1),
      liftM, dropM, alertLiftM: r4(RIG.eyeAlert * HL * 0.001),
      // the gaze turns the Eye node about the globe's centre (build-pose.mjs): pitch about the fore-aft axis (+ = the
      // window up), then yaw about the vertical (+ = the window forward), relative to the resting window (restOutDeg out,
      // restUpDeg up); the ranges are behaviour.md §3.9's absolute ones (yaw −20 … 100° out from straight ahead, pitch
      // −20 … 60° up) taken from that rest: out = restOutDeg − yaw, up ≈ restUpDeg + pitch
      gaze: {
        pitch: { axis: obj(side > 0 ? [-1, 0, 0] : [1, 0, 0]), range: yawLim(GAZE.upDeg[0] - up, GAZE.upDeg[1] - up), positive: 'window up' },
        yaw: { axis: obj(side > 0 ? [0, -1, 0] : [0, 1, 0]), range: yawLim(out - GAZE.outDeg[1], out - GAZE.outDeg[0]), positive: 'window forward' },
        order: 'pitch then yaw',
        default: { yaw: +(out - GAZE.defaultOut).toFixed(1), pitch: +(GAZE.defaultUp - up).toFixed(1), note: 'behaviour §3.9\'s default gaze (55° out, 15° up)' },
      },
      // (lod1's hood closes over a globe looking within this of its rest: round B1 left 22 of 102 window vertices bare
      // at pitch 45)
      blinkGaze: { maxDeg: 20, note: 'ease the gaze to within 20° of the rest during the blink\'s down-stroke (the lid closes over the resting window)' },
    };
  };
  const spine = [['J_head', r4(JOINTS[J.J_head].at[0])], ...['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2', 'J_caudal3'].map((n) => [n, r4(JOINTS[J[n]].at[0])])];
  return {
    units: 'object frame: metres, +X the fish\'s left, +Y dorsal, +Z anterior; angles in degrees; bind rotations identity, so these are the joints\' local axes; a right-hand turn about `axis` by a positive angle moves as `positive` says',
    composition: 'a joint with several channels turns by R = R(order[0]) · R(order[1]) · … (each about its bind axis: the first listed is the outermost), whatever order the pose object lists them in',
    hlMM: r4(HL), tlMM: 80,
    joints,
    spine: {
      tlMM: 80, joints: spine, knots: AXIAL_KNOTS.map(([n, k]) => [n, r4(k * HL)]), vertebrae: { count: 26, precaudal: 10, caudal: 16, jointsMM: vertebralJoints().map((s) => r4(s * HL)) },
      bend: SPINE_BEND, attitude: 'J_root',
      // (every joint at its own limit coils the tail through the trunk: round B1's maxCurl, 505° of yaw, put 4,701 skin
      // vertices and the caudal inside the body; 260° buries the caudal; the rig's 208° J is clean)
      curlBudget: { ...RIG.curl, note: 'Σ|yaw| over `joints` ≤ yawAbsSum and ≤ perVertebraDeg × the vertebrae a joint stands for; the J-curl of the escape jump as `jcurl` (deg per joint, sharpest at ⅔ of the length: Swanson & Gibb 2004), scaled down to fit' },
    },
    pectoral: {
      L: ['J_pecL', 'J_pecElbowL', 'J_pecWristL', 'J_pecBladeL'], R: ['J_pecR', 'J_pecElbowR', 'J_pecWristR', 'J_pecBladeR'],
      lod2Aim: 'lod2 has the arm as J_pecL/R alone: aim it so its bind elbow, wrist and blade heel land where the hero\'s chain puts them (rig.mjs poseForTier: a best-fit rotation of the three points and the blade\'s face)',
      plant: 'land: rig.mjs solveArmPlant (the sole flat on the ground: its plane\'s normal straight up, its lowest vertex on the ground; fins.mjs plant = 1, plantMid = 0)',
    },
    // (the crawl's stance: RIG.crawl; the sole's welded contact is contactsFor's soleL/R)
    crawl: { ...RIG.crawl, contact: 'soleL / soleR (contactsFor, land)', strideBL: [+((RIG.crawl.stanceMM.ahead + RIG.crawl.stanceMM.behind) / 80).toFixed(3), +((RIG.crawl.stanceMM.ahead + RIG.crawl.stanceMM.behind + 2) / 80).toFixed(3)], note: 'the stance the IK holds exactly with a clean arm root; with the front raised 12–15°' },
    eyes: { L: ex(1), R: ex(-1) },
    head: { poses: HEAD_POSES, blinkDropHL: BLINK_DROP },
  };
}

/** Runtime metadata (root extras): per joint its object-frame axes, ranges and channel order, the spine table and its
 * curl budget, the arms' chains, the eyes (translation-only joints, gaze on the Eye nodes), the head's poses. */
export const AXES = buildAxes();

/** AXES restricted to a tier's joints (the spine table, the chains and the joint list cut to what the tier keeps). */
export function axesForTier(tier) {
  const keep = new Set(TIER_JOINTS[tier]);
  return {
    ...AXES, tier, jointNames: TIER_JOINTS[tier],
    joints: Object.fromEntries(Object.entries(AXES.joints).filter(([k]) => keep.has(k))),
    spine: { ...AXES.spine, joints: AXES.spine.joints.filter(([k]) => keep.has(k)), knots: AXES.spine.knots.filter(([k]) => keep.has(k)), bend: AXES.spine.bend.filter((k) => keep.has(k)) },
    pectoral: { ...AXES.pectoral, L: AXES.pectoral.L.filter((k) => keep.has(k)), R: AXES.pectoral.R.filter((k) => keep.has(k)) },
    eyes: keep.has('J_eyeL') ? AXES.eyes : null,
  };
}

/** The L/R mirror test of AXES (round B1's J_pecBladeR.flex and J_maxR.twist were polar, not axial, mirrors): every
 * …L joint's channel against its …R twin, whose axis must be the axial mirror (object frame: (x, y, z) → (x, −y, −z))
 * with the same range and order. Returns the mismatches ([] when the rig mirrors exactly). */
export function mirrorErrors(axes = AXES, tol = 1e-6) {
  const out = [];
  for (const [name, A] of Object.entries(axes.joints)) {
    if (!/L$/.test(name)) continue;
    const B = axes.joints[name.replace(/L$/, 'R')];
    if (!B) continue;
    if (JSON.stringify(A.order ?? null) !== JSON.stringify(B.order ?? null)) out.push(`${name}: order`);
    for (const [c, ch] of Object.entries(A.channels ?? {})) {
      const m = B.channels?.[c];
      if (!m) { out.push(`${name}.${c}: missing on R`); continue; }
      if (ch.axis && m.axis) { const w = [ch.axis[0], -ch.axis[1], -ch.axis[2]], d = Math.hypot(w[0] - m.axis[0], w[1] - m.axis[1], w[2] - m.axis[2]); if (d > tol) out.push(`${name}.${c}: axis off the axial mirror by ${d.toFixed(4)}`); }
      if (JSON.stringify(ch.range ?? null) !== JSON.stringify(m.range ?? null)) out.push(`${name}.${c}: range`);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ posing (fish frame)

/** A joint's local rotation (fish frame, row-major 3×3) for its channel values ({ channel: deg }), composed in the
 * joint's AXES order (R = R(order[0]) · R(order[1]) · …); unknown channels are ignored. */
export function jointRotation(name, values, axes = AXES) {
  const A = axes.joints[name];
  if (!A || !values) return null;
  const order = A.order ?? Object.keys(A.channels ?? {});
  let R = null;
  for (const c of order) {
    const deg = values[c];
    if (!deg || !A.channels?.[c]) continue;
    const Q = axisAngle(objToFish(A.channels[c].axis), (deg * Math.PI) / 180);
    R = R ? mul33(R, Q) : Q;
  }
  return R;
}
const mul33 = (A, B) => { const C = new Array(9); for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) C[i * 3 + k] = A[i * 3] * B[k] + A[i * 3 + 1] * B[3 + k] + A[i * 3 + 2] * B[6 + k]; return C; };
/** An object-frame quaternion [x, y, z, w] as a fish-frame rotation matrix (row-major). */
export function quatToFish(q) {
  const l = Math.hypot(...q) || 1, [x, y, z] = objToFish([q[0] / l, q[1] / l, q[2] / l]), w = q[3] / l;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

/**
 * Local transforms (fish mm) of a pose for the hero skeleton: { J_x: { channel: deg, …, t: [ds, dy, dz] (HL), slide:
 * units of the joint's slide } } by AXES' channels and order (the viewer's pose objects and headrig's HEAD_POSES both
 * read so: HEAD_POSES' `angle` / `lift` / `slide` / `t` are the head joints' channels here). Entries for joints the rig
 * does not ship (J_jawL, J_opercRollL …) are ignored.
 */
export function poseLocalsHero(pose = {}) {
  const L = {};
  for (const [name, e] of Object.entries(pose)) {
    if (!(name in J) || !e || typeof e !== 'object') continue;
    // (a quaternion [x, y, z, w] in the object frame, as the viewer and glTF take it: fins.mjs def.restPose.object)
    if (Array.isArray(e)) { if (e.length === 4) L[name] = { R: quatToFish(e) }; continue; }
    const R = jointRotation(name, e);
    let t = e.t ? e.t.map((c) => c * HL) : null;
    const sl = AXES.joints[name]?.slide;
    if (e.slide && sl) { const d = objToFish(sl.dir).map((c) => c * e.slide * HL); t = t ? add3(t, d) : d; }
    if (R || t) L[name] = { ...(R ? { R } : {}), ...(t ? { t } : {}) };
  }
  return L;
}

/** World transforms (fish mm: p_world = R p_bind + t) of the hero skeleton for a pose (poseLocalsHero). */
export function poseWorldHero(pose = {}) {
  return worldTransforms(JOINTS.map((j) => ({ name: j.name, parent: j.parent, pivot: j.at })), poseLocalsHero(pose));
}

/** Linear blend skinning (fish mm) of positions by packed weights (uint8, hero joint indices unless `names` maps a
 * tier's) and world transforms keyed by name. Normals too when given. */
export function skinPacked(pos, skin, W, { normal = null, names = TIER_JOINTS.hero } = {}) {
  const n = pos.length / 3, P = new Float32Array(n * 3), N = normal ? new Float32Array(n * 3) : null;
  const I3 = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  const T = names.map((nm) => W[nm] ?? I3), sc = skin.weights instanceof Uint8Array ? 1 / 255 : 1;
  for (let v = 0; v < n; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
    for (let q = 0; q < 4; q++) {
      const w = skin.weights[v * 4 + q] * sc;
      if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + q]];
      x += w * (R[0] * px + R[1] * py + R[2] * pz + t[0]); y += w * (R[3] * px + R[4] * py + R[5] * pz + t[1]); z += w * (R[6] * px + R[7] * py + R[8] * pz + t[2]);
      if (N) { const nx = normal[v * 3], ny = normal[v * 3 + 1], nz = normal[v * 3 + 2]; a += w * (R[0] * nx + R[1] * ny + R[2] * nz); b += w * (R[3] * nx + R[4] * ny + R[5] * nz); c += w * (R[6] * nx + R[7] * ny + R[8] * nz); }
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    if (N) { const l = Math.hypot(a, b, c) || 1; N[v * 3] = a / l; N[v * 3 + 1] = b / l; N[v * 3 + 2] = c / l; }
  }
  return N ? { position: P, normal: N } : P;
}

// ------------------------------------------------------------------------------------------------ the arm's IK (land)

/** The arm's IK channels in the order solveArmPlant's vector holds them (the blade's flex is held at 0 unless asked). */
export const ARM_IK = [['J_pec', 'swing'], ['J_pec', 'protraction'], ['J_pec', 'abduction'], ['J_pec', 'twist'], ['J_pecElbow', 'flexion'], ['J_pecElbow', 'bend'], ['J_pecWrist', 'flexion'], ['J_pecWrist', 'bend'], ['J_pecBlade', 'flex']];

/** How far a joint's channel values break its limits (deg: the ranges' overshoot plus the coupled limits'); 0 inside. */
export function limitExcess(name, values, axes = AXES) {
  const A = axes.joints[name];
  if (!A || !values) return 0;
  let e = 0;
  for (const [c, ch] of Object.entries(A.channels ?? {})) {
    const v = values[c] ?? 0;
    if (ch.range) e += Math.max(0, ch.range[0] - v) + Math.max(0, v - ch.range[1]);
  }
  for (const k of A.coupled ?? []) {
    let s = 0;
    for (const [c, f] of Object.entries(k.sum)) s += f * (values[c] ?? 0);
    e += Math.max(0, s - k.max);
  }
  return e;
}

const SOLE = {};
/**
 * The planted sole (fins.mjs: the pectoral blade with its 'plant' blend shape at 1) of one side in the bind frame: its
 * vertices past each ray's turn (def.sole.from; round B1's fins: past half the ray), their plane's normal (pointing off
 * the ground once planted) and the heel, and the planted blade's vertices past rayT 0.3 (`blade`: none may go under the
 * ground; those before it ride the wrist and the lobe's end). Fish mm.
 * @param side 'L' | 'R'   @param o { tier: the fins' mesh tier (the hero's: its rays' lens relief is the sole's underside), every: keep every n-th }
 */
export function plantedSole(side = 'L', { tier = 'hero', every = 2 } = {}) {
  const key = `${side}:${tier}:${every}`;
  if (SOLE[key]) return SOLE[key];
  if (!FINS) throw new Error('plantedSole: fins.mjs is not available');
  const def = FINS.finDefinitions(BODY_SCULPT).find((d) => d.name === `Fin_Pectoral_${side}`);
  const mesh = FINS.buildFinMesh(def, FINS.finTierParams(tier)[def.name]), tg = FINS.buildFinTargets(def, mesh);
  const kP = tg.names.indexOf('plant');
  const pts = [], all = [];
  for (let v = 0, c = 0; v < mesh.position.length / 3; v++) {
    const k = clamp(Math.round(mesh.ray[v]), 0, def.rays.length - 1), from = def.sole?.from?.rayT?.[k] ?? 0.5;
    if (c++ % every) continue;
    const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q] + (kP >= 0 ? tg.deltas[kP][v * 3 + q] : 0));
    if (mesh.rayT[v] >= 0.3) all.push(p);
    if (mesh.rayT[v] >= from + 0.02) pts.push(p);
  }
  let normal = def.sole?.normal;
  if (!normal) {
    // (a sole without fins.mjs's plane: the points' least-variance direction, toward the forearm's end)
    const c = pts.reduce((a, p) => add3(a, p), [0, 0, 0]).map((x) => x / pts.length), C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of pts) { const d = sub3(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j]; }
    let n = [0.2, 1, 0.1];
    const Ci = inv33(C);
    for (let it = 0; it < 60; it++) n = norm3([0, 1, 2].map((r) => Ci[r * 3] * n[0] + Ci[r * 3 + 1] * n[1] + Ci[r * 3 + 2] * n[2]));
    const P = BODY_SCULPT.pectoral, u = norm3(sub3(P.wrist, P.elbow));
    normal = dot3(n, mul3(u, side === 'L' ? -1 : -1)) >= 0 ? n : mul3(n, -1);
  }
  return (SOLE[key] = { points: pts, blade: all, normal: [...normal], heel: def.bladePivot ? [...def.bladePivot] : null, joint: `J_pecBlade${side}` });
}
const inv33 = (A) => {
  const [a, b, c, d, e, f, g, h, i] = A, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) || 1e-30;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((x) => x / det);
};
function solveN(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    const d = M[i][i] || 1e-12;
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / d; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / (M[i][i] || 1e-12); }
  return x;
}
const mvT = (T, p) => [T.R[0] * p[0] + T.R[1] * p[1] + T.R[2] * p[2] + T.t[0], T.R[3] * p[0] + T.R[4] * p[1] + T.R[5] * p[2] + T.t[1], T.R[6] * p[0] + T.R[7] * p[1] + T.R[8] * p[2] + T.t[2]];
const rvT = (T, d) => [T.R[0] * d[0] + T.R[1] * d[1] + T.R[2] * d[2], T.R[3] * d[0] + T.R[4] * d[1] + T.R[5] * d[2], T.R[6] * d[0] + T.R[7] * d[1] + T.R[8] * d[2]];
const angDeg = (a, b) => (Math.acos(clamp(dot3(norm3(a), norm3(b)), -1, 1)) * 180) / Math.PI;

/**
 * The body's propped posture (A070: the front raised by `raise` degrees with the rear body flat): the bend spread over
 * J_sp1 … J_sp3 (RIG.prop.split; + pitch: the segment behind up) and the attitude (J_root pitch −raise: the snout up), so
 * the trunk behind J_sp3 lies level and the head block and chest stand `raise` above it. Added to `pose`'s own values.
 */
export function proppedPose(raise, pose = {}) {
  const out = structuredClone(pose), sp = RIG.prop.split;
  const add = (j, c, v) => { out[j] = { ...(out[j] ?? {}) }; out[j][c] = +((out[j][c] ?? 0) + v).toFixed(4); };
  add('J_root', 'pitch', -raise);
  ['J_sp1', 'J_sp2', 'J_sp3'].forEach((j, i) => add(j, 'pitch', raise * sp[i]));
  return out;
}

/** The lowest posed point (fish mm) of a skinned mesh among the vertices `keep` admits: { y, at, v }. */
export function lowestPosed(mesh, W, keep = null) {
  const names = mesh.names ?? TIER_JOINTS.hero, P = skinPacked(mesh.position, mesh.skin, W, { names });
  let best = { y: Infinity, at: null, v: -1 };
  for (let v = 0; v < P.length / 3; v++) if ((!keep || keep(v)) && P[v * 3 + 1] < best.y) best = { y: P[v * 3 + 1], at: [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], v };
  return best;
}

/** The vertices of a packed skin no pectoral joint carries more than `share` of (the body without the arms). */
export function notArm(mesh, share = 0.2) {
  const names = mesh.names ?? TIER_JOINTS.hero, arm = new Set(names.map((n, i) => (/^J_pec/.test(n) ? i : -1)).filter((i) => i >= 0));
  return (v) => { let s = 0; for (let q = 0; q < 4; q++) if (arm.has(mesh.skin.joints[v * 4 + q])) s += mesh.skin.weights[v * 4 + q]; return s <= share * (mesh.skin.weights instanceof Uint8Array ? 255 : 1); };
}

/**
 * Plants the pectoral soles flat on the ground (the shared pectoral design of round B2; A070, A005, u1, B010): an IK of
 * each arm's channels (AXES' ranges and coupled limits) so the planted sole (plantedSole: fins.mjs 'plant' at 1) lies
 * flat on the ground: its plane's normal straight up and its lowest vertex on the ground, the arm in the leg's posture the
 * photos show (the upper arm down and a little back, the forearm down and forward: RIG.prop.upper / fore, a light pull).
 * With `o.raise` the body is first propped (proppedPose: the front raised by bending J_sp1 … J_sp3, the rear flat) and
 * the ground taken under the rear body; the pelvic cup can be pressed onto the same ground (o.pelvic: J_pelvic pitch).
 * @param pose     the body's pose (channel values by joint, as AXES / the viewer read them); the arms' entries are replaced
 * @param tierMesh { position (fish mm), skin { joints, weights }, names? (the skin's joint names; default the hero's) }:
 *                 the skin that sets the ground (its lowest posed vertex the arms do not carry) when `ground` is null
 * @param ground   { y } (fish mm, posed frame) or null
 * @param o        { raise (deg), sides ['L', 'R'], seed: { L: values } (a warm start), target: { L: [s, z] } (fish mm, posed: where the sole's centroid must
 *                 stand on the ground, e.g. welded through a crawl's stance), pelvic: { position, skin, names? } (the pelvic fin's mesh, to press it
 *                 onto the ground), bladeFlex: true to let the blade's flex level the sole too, sole: { L, R } }
 * @returns { pose (the whole pose: body + arms, + morph { Fin_Pectoral_L/R: { plant: 1, plantMid: 0 } }), ground: { y,
 *   from }, sides: { L: { values, tiltDeg, soleLowMM, soleHighMM, upperDeg, foreDeg, limitExcess }, R }, pelvic? }
 */
export function solveArmPlant(pose = {}, tierMesh = null, ground = null, o = {}) {
  let body = o.raise ? proppedPose(o.raise, pose) : structuredClone(pose);
  for (const k of Object.keys(body)) if (/^J_pec/.test(k)) delete body[k];
  let g = ground?.y ?? null, gFrom = ground ? 'given' : null;
  if (g === null) {
    if (!tierMesh) throw new Error('solveArmPlant: give the ground or a tier mesh to find it under');
    const W0 = poseWorldHero(body), keep = notArm(tierMesh);
    // (the ground under the rear body when propped: behind J_sp1, where the trunk lies on it)
    const s1 = JOINTS[J.J_sp1].at[0];
    const low = lowestPosed(tierMesh, W0, o.raise ? (v) => keep(v) && tierMesh.position[v * 3] > s1 : keep);
    g = low.y; gFrom = `the skin's lowest posed vertex (bind s ${(tierMesh.position[low.v * 3] / HL).toFixed(3)} HL)`;
  }
  const sides = {}, P = RIG.prop;
  for (const S of o.sides ?? ['L', 'R']) {
    const sd = S === 'L' ? 1 : -1, mz = (d) => [d[0], d[1], d[2] * sd];
    const sole = o.sole?.[S] ?? plantedSole(S);
    const upperWant = norm3(mz(P.upper)), foreWant = norm3(mz(P.fore)), target = o.target?.[S] ?? null;
    const chans = ARM_IK.filter(([, c]) => o.bladeFlex || c !== 'flex').map(([j, c]) => [`${j}${S}`, c]);
    const ranges = chans.map(([j, c]) => AXES.joints[j].channels[c].range);
    const sh = JOINTS[J[`J_pec${S}`]].at, el = JOINTS[J[`J_pecElbow${S}`]].at, wr = JOINTS[J[`J_pecWrist${S}`]].at;
    const build = (x) => {
      const p = structuredClone(body);
      chans.forEach(([j, c], i) => { p[j] = { ...(p[j] ?? {}), [c]: x[i] }; });
      return p;
    };
    const evalX = (x) => {
      const p = build(x), W = poseWorldHero(p), Tb = W[sole.joint];
      let lo = Infinity, hi = -Infinity;
      for (const q of sole.points) { const y = mvT(Tb, q)[1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      for (const q of sole.blade ?? []) { const y = mvT(Tb, q)[1] + P.heelSink; if (y < lo) lo = y; }
      const n = rvT(Tb, sole.normal), tilt = angDeg(n, [0, 1, 0]);
      const a = mvT(W[`J_pec${S}`], sh), b = mvT(W[`J_pecElbow${S}`], el), c = mvT(W[`J_pecWrist${S}`], wr);
      const up = angDeg(sub3(b, a), upperWant), fo = angDeg(sub3(c, b), foreWant);
      const lim = [`J_pec${S}`, `J_pecElbow${S}`, `J_pecWrist${S}`, `J_pecBlade${S}`].reduce((e, j) => e + limitExcess(j, p[j]), 0);
      const cost = 1e4 * (lo - g) ** 2 + 50 * tilt ** 2 + P.posture * (up * up + fo * fo) + 100 * lim * lim;
      return { cost, lo, hi, tilt, up, fo, lim, p };
    };
    // Levenberg–Marquardt on the residuals: the sole's lowest vertex on the ground and its normal straight up (weighted
    // K: the constraints), the upper arm and the forearm toward the leg's directions (wp), every channel toward its bind
    // (a light pull: the least turning), the coupled limits (soft); the channels kept in their ranges. The posture's
    // weight is lowered in stages so the constraints end exact (the posture only chooses among the exact solutions)
    const K = 10, KN = 50;
    const resid = (x, wp) => {
      const p = build(x), W = poseWorldHero(p), Tb = W[sole.joint];
      let lo = Infinity;
      for (const q of sole.points) { const y = mvT(Tb, q)[1]; if (y < lo) lo = y; }
      for (const q of sole.blade ?? []) { const y = mvT(Tb, q)[1] + P.heelSink; if (y < lo) lo = y; }
      const nn = norm3(rvT(Tb, sole.normal));
      const a = mvT(W[`J_pec${S}`], sh), b = mvT(W[`J_pecElbow${S}`], el), c = mvT(W[`J_pecWrist${S}`], wr);
      const du = norm3(sub3(b, a)), df = norm3(sub3(c, b));
      const r = [K * (lo - g), KN * nn[0], KN * nn[2], ...[0, 1, 2].map((k) => wp * (du[k] - upperWant[k])), ...[0, 1, 2].map((k) => wp * (df[k] - foreWant[k]))];
      if (target) { const cc = [0, 0, 0]; for (const q of sole.points) { const m2 = mvT(Tb, q); cc[0] += m2[0]; cc[2] += m2[2]; } r.push(K * (cc[0] / sole.points.length - target[0]), K * (cc[2] / sole.points.length - target[1])); }
      for (const v of x) r.push((0.1 * v) / 90);
      for (const j of [`J_pec${S}`]) r.push(limitExcess(j, p[j]));
      return r;
    };
    const cost = (r) => r.reduce((a2, v) => a2 + v * v, 0);
    const lm = (x0, wp, iters = 80) => {
      let x = x0.slice(), r = resid(x, wp), c0 = cost(r), lam = 1e-2;
      for (let it = 0; it < iters; it++) {
        const n = x.length, m = r.length, Jm = [];
        for (let i = 0; i < n; i++) { const y = x.slice(); const hh = 0.02; y[i] += hh; const ry = resid(y, wp); Jm.push(ry.map((v, k) => (v - r[k]) / hh)); }
        const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let sa = 0; for (let k = 0; k < m; k++) sa += Jm[i][k] * Jm[j][k]; return sa; }));
        const gv = Array.from({ length: n }, (_, i) => { let sa = 0; for (let k = 0; k < m; k++) sa += Jm[i][k] * r[k]; return sa; });
        let improved = false;
        for (let tries = 0; tries < 8 && !improved; tries++) {
          const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lam) + 1e-9 : v)));
          const d = solveN(Ad, gv.map((v) => -v));
          const y = x.map((v, i) => clamp(v + d[i], ranges[i][0], ranges[i][1])), ry = resid(y, wp), cy = cost(ry);
          if (cy < c0) { x = y; r = ry; c0 = cy; lam = Math.max(1e-7, lam / 3); improved = true; } else lam *= 4;
        }
        if (!improved) break;
      }
      return x;
    };
    const seeds = [chans.map(() => 0), chans.map(([j, c]) => P.seed[j.replace(/[LR]$/, '')]?.[c] ?? 0)];
    // (a warm start: the previous frame's or stance step's values, o.seed[S] = { joint: { channel } })
    if (o.seed?.[S]) seeds.unshift(chans.map(([j, c]) => o.seed[S][j]?.[c] ?? 0));
    let best = null;
    for (const x0 of seeds) {
      let x = x0.map((v, i) => clamp(v, ranges[i][0], ranges[i][1]));
      for (const wp of [2, 0.5, 0.1, 0.02]) x = lm(x, wp);
      const cur = evalX(x);
      const score = 1e4 * (cur.lo - g) ** 2 + 50 * cur.tilt ** 2 + P.posture * (cur.up ** 2 + cur.fo ** 2) + 100 * cur.lim ** 2;
      if (!best || score < best.score) best = { x, cur, score };
    }
    const v = {}; chans.forEach(([j, c], i) => { (v[j] ??= {})[c] = +best.x[i].toFixed(3); });
    const Wb = poseWorldHero(build(best.x))[sole.joint], cen = [0, 0, 0]; for (const q of sole.points) { const m2 = mvT(Wb, q); for (let k = 0; k < 3; k++) cen[k] += m2[k] / sole.points.length; }
    sides[S] = { soleCentreMM: cen.map((c) => +c.toFixed(4)), values: v, tiltDeg: +best.cur.tilt.toFixed(3), soleLowMM: +(best.cur.lo - g).toFixed(4), soleHighMM: +(best.cur.hi - g).toFixed(4), upperDeg: +best.cur.up.toFixed(2), foreDeg: +best.cur.fo.toFixed(2), limitExcess: +best.cur.lim.toFixed(4) };
    for (const [j, c] of Object.entries(v)) body[j] = { ...(body[j] ?? {}), ...c };
  }
  const out = { pose: { ...body, morph: { ...(pose.morph ?? {}), Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 } } }, ground: { y: +g.toFixed(4), from: gFrom }, sides };
  // the pelvic cup pressed onto the same ground (J_pelvic pitch, + the cup's rear down)
  if (o.pelvic) {
    const rg = AXES.joints.J_pelvic.channels.pitch.range, at = (x) => { const p = { ...out.pose, J_pelvic: { ...(out.pose.J_pelvic ?? {}), pitch: x } }; return lowestPosed(o.pelvic, poseWorldHero(p)).y - g; };
    let a = rg[0], b = rg[1];
    if (at(b) > 0) out.pelvic = { pitch: b, gapMM: +at(b).toFixed(4), note: 'the cup cannot reach the ground' };
    else if (at(a) < 0) out.pelvic = { pitch: a, gapMM: +at(a).toFixed(4), note: 'the cup is below the ground at its least pitch' };
    else { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (at(m) > 0) a = m; else b = m; } out.pelvic = { pitch: +b.toFixed(3), gapMM: +at(b).toFixed(4) }; }
    out.pose.J_pelvic = { ...(out.pose.J_pelvic ?? {}), pitch: out.pelvic.pitch };
  }
  return out;
}


/** The channel values (AXES order and ranges) whose rotation comes closest to a given local rotation R (fish frame,
 * row-major): Gauss–Newton on the matrix difference from the bind. e.g. fins.mjs's restPose quaternions as channels. */
export function fitChannels(name, R, { from = null } = {}) {
  const A = AXES.joints[name], order = A.order ?? Object.keys(A.channels);
  let x = order.map((c) => from?.[c] ?? 0);
  const res = (y) => { const M = jointRotation(name, Object.fromEntries(order.map((c, i) => [c, y[i]]))) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]; return M.map((v, k) => v - R[k]); };
  for (let it = 0; it < 60; it++) {
    const r = res(x), Jm = order.map((_, i) => { const y = x.slice(); y[i] += 0.01; return res(y).map((v, k) => (v - r[k]) / 0.01); });
    const n = x.length, Am = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Jm[i].reduce((a, v, k) => a + v * Jm[j][k], 0) + (i === j ? 1e-6 : 0)));
    const d = solveN(Am, Jm.map((row) => -row.reduce((a, v, k) => a + v * r[k], 0)));
    x = x.map((v, i) => v + d[i]);
    if (Math.hypot(...d) < 1e-6) break;
  }
  const err = Math.hypot(...res(x));
  return { values: Object.fromEntries(order.map((c, i) => [c, +x[i].toFixed(3)])), errDeg: +((2 * Math.asin(Math.min(1, err / Math.sqrt(8))) * 180) / Math.PI).toFixed(4) };
}

// ------------------------------------------------------------------------------------------------ the states' poses

/** The fins' blend-shape weights of the three reference states (fins.mjs targets; plantMid 4w(1 − w) = 0 at w 1). */
export const STATE_MORPHS = {
  land: { Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  rest: { Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Caudal: { fold: 1 }, Fin_Pectoral_L: { fold: 1 }, Fin_Pectoral_R: { fold: 1 }, Fin_Pelvic: { fold: 1 } },
  water: { Fin_Pectoral_L: { spread: 1 }, Fin_Pectoral_R: { spread: 1 }, Fin_Caudal: { spread: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.8 }, Fin_Anal: { fold: 0.8 } },
};

/**
 * The reference states' poses (joint channel values as AXES reads them; the viewer's pose objects), the runtime's and
 * the final renders' common ground:
 *   land   propped on the pectorals (A070, A005, u1, B010): the front raised RIG.prop.raise° over J_sp1 … J_sp3, the
 *          soles planted flat (solveArmPlant on `o.tierMesh`, the pelvic cup pressed onto the same ground with
 *          `o.pelvic`), the eyes raised to the alert lift
 *   rest   prone (A030, B067): the arms laid back on the flank in fins.mjs's rest pose (def.restPose: the fold is authored
 *          in it; the shoulder as channels, exact; the elbow as its quaternion, which the channels reach only within 3.5°),
 *          the shoulder abducted RIG.rest.abduction° more so the arm's medial face clears the flank, every fin folded
 *   water  swimming (A061): half of the rig's swim wave over the rear two thirds, the pectorals out and forward as
 *          paddles with their fans spread, the caudal spread, the dorsal and anal fins folded
 * @returns { pose (with `morph`), ground? (land: from solveArmPlant), solved? }
 */
export function statePose(state, o = {}) {
  const both = (j, v) => ({ [`${j}L`]: v, [`${j}R`]: structuredClone(v) });
  if (state === 'water') {
    const amp = [1, 2, 3.5, 5, 6.5, 7.5, 8, 9];
    const wave = Object.fromEntries(SPINE_BEND.map((j, i) => [j, { yaw: +(amp[i] * Math.sin(0.3 + i)).toFixed(2) }]));
    return { pose: { ...wave, ...both('J_pec', { ...RIG.water.shoulder }), ...both('J_pecElbow', { ...RIG.water.elbow }), morph: structuredClone(STATE_MORPHS.water) } };
  }
  if (state === 'rest') {
    const pose = { morph: structuredClone(STATE_MORPHS.rest) };
    const rp = BLADE.restPose;
    for (const S of ['L', 'R']) {
      if (rp) {
        const qs = S === 'L' ? rp.object.J_pecL : mirrorQuatObj(rp.object.J_pecL), qe = S === 'L' ? rp.object.J_pecElbowL : mirrorQuatObj(rp.object.J_pecElbowL);
        const f = fitChannels(`J_pec${S}`, quatToFish(qs)).values;
        pose[`J_pec${S}`] = { ...f, abduction: +(f.abduction + RIG.rest.abduction).toFixed(3) };
        pose[`J_pecElbow${S}`] = [...qe];
      } else {
        pose[`J_pec${S}`] = { swing: -41, abduction: -18 + RIG.rest.abduction };
        pose[`J_pecElbow${S}`] = { flexion: AXES.joints[`J_pecElbow${S}`].channels.flexion.range[0] };
      }
    }
    return { pose };
  }
  if (state === 'land') {
    const eyes = { J_eyeL: { t: [0, RIG.eyeAlert, 0] }, J_eyeR: { t: [0, RIG.eyeAlert, 0] } };
    const sol = solveArmPlant({ ...eyes, ...(o.pose ?? {}) }, o.tierMesh ?? null, o.ground ?? null, { raise: RIG.prop.raise, pelvic: o.pelvic ?? null });
    sol.pose.morph = { ...structuredClone(STATE_MORPHS.land), ...sol.pose.morph };
    return { pose: sol.pose, ground: sol.ground, solved: sol };
  }
  throw new Error(`statePose: unknown state ${state}`);
}
/** An object-frame quaternion for the left side → the right side's (mirrored z → −z in the fish frame = x → −x in the object
 * frame; an axial vector: (x, y, z) → (x, −y, −z)). */
const mirrorQuatObj = (q) => [q[0], -q[1], -q[2], q[3]];

// ------------------------------------------------------------------------------------------------ ground contacts

/** The lowest crossing of the vertical line through (x, z) with a mesh's triangles (fish mm; y up): { y, tri, w } or null. */
export function rayDown(P, I, x, z) {
  let best = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ax = P[a] - x, az = P[a + 2] - z, bx = P[b] - x, bz = P[b + 2] - z, cx = P[c] - x, cz = P[c + 2] - z;
    const d1 = ax * bz - az * bx, d2 = bx * cz - bz * cx, d3 = cx * az - cz * ax;
    if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
    const s = d1 + d2 + d3;
    if (Math.abs(s) < 1e-14) continue;
    const w = [d2 / s, d3 / s, d1 / s], y = w[0] * P[a + 1] + w[1] * P[b + 1] + w[2] * P[c + 1];
    if (!best || y < best.y) best = { y, tri: t / 3, w };
  }
  return best;
}

/**
 * The ground contacts of one tier in each reference state, in bone-local form for the runtime (runtime.md §9: foot
 * points on bones): each the posed surface's lowest point there (skin: a downward ray cast on the tier's own posed
 * triangles at the station; fins: the posed fin's lowest vertices), the tier's joint that carries it most (kept in the
 * tier), its offset in that bone's bind frame (`local`, object metres from the joint's pivot: bone · local is the point
 * whatever the bone does), the morph weights the state assumes, and its distance to the posed surface (0 by construction
 * on this tier: the gate is that it stays so on the tier the runtime draws).
 * @param tierName 'hero' | 'lod1' | 'lod2'
 * @param parts { skin: { position (mm), indices, skin { joints, weights } (the tier's joint indices) },
 *   fins: { [name]: { position (mm), indices, skin, targets: { names, deltas (mm) } } } (lod2: the merged cards may be
 *   given per fin as well) }
 * @param o { states: { land, rest, water }: statePose results to use (default statePose(…) with the tier's skin for the
 *   ground), stations: belly stations (HL) }
 * @returns { [state]: { pose, morphs, groundMM, contacts: [{ name, kind, bone, local, mm, obj, groundGapMM }] } }
 */
export function contactsFor(tierName, parts, o = {}) {
  const names = TIER_JOINTS[tierName], jIdx = Object.fromEntries(names.map((n, i) => [n, i]));
  const skin = { ...parts.skin, names };
  const pel = parts.fins?.Fin_Pelvic ? { position: parts.fins.Fin_Pelvic.position, skin: parts.fins.Fin_Pelvic.skin, names } : null;
  const states = o.states ?? { land: statePose('land', { tierMesh: skin, pelvic: pel }), rest: statePose('rest'), water: statePose('water') };
  const stations = o.stations ?? [1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9];
  const out = {};
  const morphFin = (f, ws) => {
    const P = Float32Array.from(f.position);
    for (const [k, w] of Object.entries(ws ?? {})) { const i = f.targets?.names?.indexOf(k) ?? -1; if (i < 0 || !w) continue; const D = f.targets.deltas[i]; for (let q = 0; q < P.length; q++) P[q] += w * D[q]; }
    return P;
  };
  // the tier joint carrying a vertex most
  const domOf = (sk, v) => { let b = 0, bw = -1; for (let q = 0; q < 4; q++) if (sk.weights[v * 4 + q] > bw) { bw = sk.weights[v * 4 + q]; b = sk.joints[v * 4 + q]; } return names[b]; };
  for (const [st, S] of Object.entries(states)) {
    const pose = poseForTier(S.pose, tierName), W = poseWorldHero(pose), morphs = pose.morph ?? {};
    const PS = skinPacked(skin.position, skin.skin, W, { names });
    const finP = {};
    for (const [nm, f] of Object.entries(parts.fins ?? {})) finP[nm] = { P: skinPacked(morphFin(f, morphs[nm]), f.skin, W, { names }), f };
    // the ground: the lowest posed point of everything
    let g = Infinity;
    for (let i = 1; i < PS.length; i += 3) g = Math.min(g, PS[i]);
    for (const { P } of Object.values(finP)) for (let i = 1; i < P.length; i += 3) g = Math.min(g, P[i]);
    const list = [];
    const local = (bone, p) => {
      const T = W[bone], q = sub3(p, T.t), Rt = [T.R[0], T.R[3], T.R[6], T.R[1], T.R[4], T.R[7], T.R[2], T.R[5], T.R[8]];
      const b = [Rt[0] * q[0] + Rt[1] * q[1] + Rt[2] * q[2], Rt[3] * q[0] + Rt[4] * q[1] + Rt[5] * q[2], Rt[6] * q[0] + Rt[7] * q[1] + Rt[8] * q[2]];
      return dirToObject(sub3(b, JOINTS[J[bone]].at)).map((c) => +(c * 0.001).toFixed(7));
    };
    const add = (name, kind, bone, p, extra = {}) => { if (!p || !bone) return; list.push({ name, kind, bone, local: local(bone, p), mm: p.map((c) => +c.toFixed(4)), obj: toObject(p).map((c) => +c.toFixed(7)), groundGapMM: +(p[1] - g).toFixed(4), ...extra }); };
    // skin: the posed position of the station's bind point on the ventral midline → the vertical through it → its lowest crossing
    const stationPoint = (sHL, yHL) => {
      const row = new Float32Array(NJ); axialRow(sHL, row, 1);
      const p = [sHL * HL, yHL * HL, 0], q = [0, 0, 0];
      for (let k = 0; k < NJ; k++) if (row[k] > 0) { const T = W[JOINTS[k].name]; const m = mvT(T, p); for (let c = 0; c < 3; c++) q[c] += row[k] * m[c]; }
      return { q, row };
    };
    const skinContact = (name, sHL, yHL, boneHero) => {
      const { q, row } = stationPoint(sHL, yHL);
      const hit = rayDown(PS, skin.indices, q[0], q[2]);
      if (!hit) return;
      const t = hit.tri * 3, vs = [skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]];
      // (the bone: the station's own axial joint, or the given one, as the tier keeps it)
      let bone = boneHero; if (!bone) { let jb = 0; for (let k = 1; k < NJ; k++) if (row[k] > row[jb]) jb = k; bone = JOINTS[jb].name; }
      while (bone && !(bone in jIdx)) bone = JOINTS[J[bone]].parent;
      add(name, 'skin', bone, [q[0], hit.y, q[2]], { tierBone: domOf(skin.skin, vs[0]) });
    };
    skinContact('chin', 0.25, 0.0, 'J_jaw');
    skinContact('throat', 0.75, 0.0, 'J_hyoid');
    for (const s0 of stations) skinContact(`belly${s0.toFixed(1)}`, s0, 0.0, null);
    skinContact('peduncle', BODY_SCULPT.caudalBase - 0.05, 0.1, 'J_caudal');
    // fins: the lowest posed vertices (the caudal and anal at their lowest, the pelvic cup's; the pectorals' sole: in land
    // the centroid of the sole's vertices within 0.15 mm of its lowest, else the blade's lowest)
    // (a fin's contact: of its vertices within 0.1 mm of its lowest, the one nearest their centroid: a flat-lying fin's
    // single lowest vertex jumps along it from tier to tier)
    const lowestFin = (nm, sel = null) => {
      const F = finP[nm]; if (!F) return null;
      let lo = Infinity; for (let v = 0; v < F.P.length / 3; v++) if ((!sel || sel(v)) && F.P[v * 3 + 1] < lo) lo = F.P[v * 3 + 1];
      const near = []; for (let v = 0; v < F.P.length / 3; v++) if ((!sel || sel(v)) && F.P[v * 3 + 1] - lo < 0.1) near.push(v);
      if (!near.length) return null;
      const c = [0, 0, 0]; for (const v of near) for (let k = 0; k < 3; k++) c[k] += F.P[v * 3 + k] / near.length;
      let b = near[0], bd = Infinity; for (const v of near) { const d = Math.hypot(F.P[v * 3] - c[0], F.P[v * 3 + 1] - c[1], F.P[v * 3 + 2] - c[2]); if (d < bd) { bd = d; b = v; } }
      return { v: b, p: [F.P[b * 3], F.P[b * 3 + 1], F.P[b * 3 + 2]], bone: domOf(F.f.skin, b), near };
    };
    for (const nm of ['Fin_Pelvic', 'Fin_Anal', 'Fin_Caudal']) { const L = lowestFin(nm); if (L) add(nm.replace('Fin_', '').toLowerCase(), 'fin', L.bone, L.p); }
    for (const sd of ['L', 'R']) {
      const nm = `Fin_Pectoral_${sd}`, F = finP[nm]; if (!F) continue;
      const L = lowestFin(nm);
      if (st === 'land') {
        let lo = Infinity; for (let v = 0; v < F.P.length / 3; v++) lo = Math.min(lo, F.P[v * 3 + 1]);
        const near = []; for (let v = 0; v < F.P.length / 3; v++) if (F.P[v * 3 + 1] - lo < 0.15) near.push(v);
        add(`sole${sd}`, 'fin', L.bone, L.p, { verts: near.length });
        // the sole's ends along the toe (for the runtime's foot plane): the farthest touching vertices fore and aft
        let fa = near[0], fb = near[0]; for (const v of near) { if (F.P[v * 3] < F.P[fa * 3]) fa = v; if (F.P[v * 3] > F.P[fb * 3]) fb = v; }
        add(`sole${sd}Front`, 'fin', domOf(F.f.skin, fa), [F.P[fa * 3], F.P[fa * 3 + 1], F.P[fa * 3 + 2]]);
        add(`sole${sd}Back`, 'fin', domOf(F.f.skin, fb), [F.P[fb * 3], F.P[fb * 3 + 1], F.P[fb * 3 + 2]]);
      } else add(`blade${sd}`, 'fin', L.bone, L.p);
    }
    out[st] = { pose, morphs, groundMM: +g.toFixed(4), contacts: list };
  }
  return out;
}

/** Each contact of contactsFor carried by its bone (bone · local) against a tier's posed surface in the same state:
 * the distance (mm) to the nearest posed triangle, skin and fins (the gate: ≤ 0.1 mm on every tier). */
export function contactGaps(tierName, parts, result) {
  const names = TIER_JOINTS[tierName], gaps = {};
  for (const [st, R] of Object.entries(result)) {
    const W = poseWorldHero(poseForTier(R.pose, tierName)), morphs = R.pose.morph ?? {};
    const meshes = [{ P: skinPacked(parts.skin.position, parts.skin.skin, W, { names }), I: parts.skin.indices }];
    for (const [nm, f] of Object.entries(parts.fins ?? {})) {
      const P = Float32Array.from(f.position);
      for (const [k, w] of Object.entries(morphs[nm] ?? {})) { const i = f.targets?.names?.indexOf(k) ?? -1; if (i < 0 || !w) continue; for (let q = 0; q < P.length; q++) P[q] += w * f.targets.deltas[i][q]; }
      meshes.push({ P: skinPacked(P, f.skin, W, { names }), I: f.indices });
    }
    gaps[st] = {};
    for (const c of R.contacts) {
      const T = W[c.bone], b = add3(JOINTS[J[c.bone]].at, objToFish(c.local).map((x) => x * 1000)), p = mvT(T, b);
      let d = Infinity;
      for (const m of meshes) for (let t = 0; t < m.I.length; t += 3) {
        const a = m.I[t] * 3, bb = m.I[t + 1] * 3, cc = m.I[t + 2] * 3;
        if (Math.min(m.P[a], m.P[bb], m.P[cc]) > p[0] + 1 || Math.max(m.P[a], m.P[bb], m.P[cc]) < p[0] - 1) continue;
        d = Math.min(d, triDist(p, [m.P[a], m.P[a + 1], m.P[a + 2]], [m.P[bb], m.P[bb + 1], m.P[bb + 2]], [m.P[cc], m.P[cc + 1], m.P[cc + 2]]));
      }
      gaps[st][c.name] = +d.toFixed(4);
    }
  }
  return gaps;
}
/** distance from p to triangle abc (Ericson's closest point) */
function triDist(p, a, b, c) {
  const ab = sub3(b, a), ac = sub3(c, a), ap = sub3(p, a), d1 = dot3(ab, ap), d2 = dot3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
  const bp = sub3(p, b), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return Math.hypot(...sub3(p, add3(a, mul3(ab, v)))); }
  const cp = sub3(p, c), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return Math.hypot(...sub3(p, add3(a, mul3(ac, w)))); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return Math.hypot(...sub3(p, add3(b, mul3(sub3(c, b), w)))); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return Math.hypot(...sub3(p, add3(a, add3(mul3(ab, v), mul3(ac, w)))));
}

// ------------------------------------------------------------------------------------------------ a pose on a lighter tier

/** The rotation (row-major) best turning the vectors a[i] onto b[i] with weights w[i] (Horn's quaternion method). */
function bestRotation(a, b, w = a.map(() => 1)) {
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  a.forEach((p, i) => { const q = b[i], k = w[i]; Sxx += k * p[0] * q[0]; Sxy += k * p[0] * q[1]; Sxz += k * p[0] * q[2]; Syx += k * p[1] * q[0]; Syy += k * p[1] * q[1]; Syz += k * p[1] * q[2]; Szx += k * p[2] * q[0]; Szy += k * p[2] * q[1]; Szz += k * p[2] * q[2]; });
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  // the largest eigenvector by power iteration on N + c I (c makes it positive definite)
  const c = 4 * Math.max(1e-9, ...N.flat().map(Math.abs));
  let q = [1, 0.01, 0.02, 0.03];
  for (let it = 0; it < 200; it++) { const r = N.map((row, i) => row.reduce((s, v, j) => s + v * q[j], 0) + c * q[i]); const l = Math.hypot(...r); q = r.map((x) => x / l); }
  const [qw, qx, qy, qz] = q;
  return [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw), 2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw), 2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)];
}
/** fish-frame rotation (row-major) → object-frame quaternion [x, y, z, w] */
export function fishToQuatObj(R) {
  const t = R[0] + R[4] + R[8];
  let w, x, y, z;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (R[7] - R[5]) / s; y = (R[2] - R[6]) / s; z = (R[3] - R[1]) / s; }
  else if (R[0] > R[4] && R[0] > R[8]) { const s = Math.sqrt(1 + R[0] - R[4] - R[8]) * 2; w = (R[7] - R[5]) / s; x = s / 4; y = (R[1] + R[3]) / s; z = (R[2] + R[6]) / s; }
  else if (R[4] > R[8]) { const s = Math.sqrt(1 + R[4] - R[0] - R[8]) * 2; w = (R[2] - R[6]) / s; x = (R[1] + R[3]) / s; y = s / 4; z = (R[5] + R[7]) / s; }
  else { const s = Math.sqrt(1 + R[8] - R[0] - R[4]) * 2; w = (R[3] - R[1]) / s; x = (R[2] + R[6]) / s; y = (R[5] + R[7]) / s; z = s / 4; }
  const o = dirToObject([x, y, z]);
  return [o[0], o[1], o[2], w].map((v) => +v.toFixed(7));
}

/**
 * A pose carried onto a lighter tier's skeleton (the tiers draw the same fish in the same pose): lod2 has the arm as one
 * bone (J_pecL/R), so the shoulder is aimed to put the arm's end where the hero's elbow, wrist and blade put it (the
 * bind wrist and blade heel turned onto their posed places, the blade's face with them: AXES.pectoral.lod2Aim); the
 * joints a tier drops otherwise just fall away (their skin rides the kept ancestor).
 * @returns the pose for the tier (lod2: J_pecL/R as object-frame quaternions)
 */
export function poseForTier(pose, tier) {
  if (tier !== 'lod2') return pose;
  const out = structuredClone(pose), W = poseWorldHero(pose);
  for (const S of ['L', 'R']) {
    if (!['J_pec', 'J_pecElbow', 'J_pecWrist', 'J_pecBlade'].some((j) => pose[`${j}${S}`])) continue;
    const sh = JOINTS[J[`J_pec${S}`]].at, Ts = W[`J_pec${S}`];
    const pts = [[`J_pecElbow${S}`, 0.5], [`J_pecWrist${S}`, 1], [`J_pecBlade${S}`, 1]].map(([j, w]) => ({ b: JOINTS[J[j]].at, p: mvT(W[j], JOINTS[J[j]].at), w }));
    // (the blade's face: its bind normal turned by the blade joint)
    const n0 = BODY_SCULPT.pectoral.axes?.n ?? [0, 0, 1], n = S === 'L' ? n0 : mirror(n0);
    const shP = mvT(Ts, sh), a = pts.map((q) => sub3(q.b, sh)), b = pts.map((q) => sub3(q.p, shP));
    a.push(mul3(n, 3)); b.push(mul3(rvT(W[`J_pecBlade${S}`], n), 3));
    const Rw = bestRotation(a, b, [...pts.map((q) => q.w), 0.5]);
    // the local rotation under the parent (J_head): R_parent⁻¹ R_world
    const Tp = W[JOINTS[J[`J_pec${S}`]].parent], Rpt = [Tp.R[0], Tp.R[3], Tp.R[6], Tp.R[1], Tp.R[4], Tp.R[7], Tp.R[2], Tp.R[5], Tp.R[8]];
    const Rl = [0, 1, 2].flatMap((i) => [0, 1, 2].map((k) => Rpt[i * 3] * Rw[k] + Rpt[i * 3 + 1] * Rw[3 + k] + Rpt[i * 3 + 2] * Rw[6 + k]));
    out[`J_pec${S}`] = fishToQuatObj(Rl);
    for (const j of ['J_pecElbow', 'J_pecWrist', 'J_pecBlade']) delete out[`${j}${S}`];
  }
  return out;
}

export { HEAD_NAMES, HL };
