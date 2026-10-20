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
// Pectoral arm (round B3; BODY_SCULPT.pectoral and fins.mjs's pectoral extras, read at build time), four joints a side:
//   J_pecL     the shoulder (girdle–radial joint; the girdle is on the skull, so it hangs from J_head): the one muscular
//              lobe turns on it (B2's elbow inside the lobe is gone: it showed as a knee)
//   J_pecFinL  the lobe/fin junction (the radial–ray joint under the lobe's fleshy end, fins.mjs junctionPivot: Pace &
//              Gibb's intra-fin joint, 76° → 178° on land, 121° → 213° in water): the visible main hinge
//   J_pecMidL  mid-blade (the planted sole's heel, fins.mjs bladePivot: the furled rays bending under load, the ankle the
//              sole turns on)
//   J_pecTipL  distal (fins.mjs tipPivot: the ray tips bending under load, the roll-off at the end of a stance)
// (B2's J_pecElbowL / J_pecWristL / J_pecBladeL are gone: J_pecFinL ≈ B2's wrist, J_pecMidL = B2's blade heel.) lod1
// keeps J_pecL, J_pecFinL, J_pecMidL (3 a side), lod2 J_pecL alone. The lobe's vertices take the arm's rows by their
// place along it (armParam: 0 shoulder … 2 junction, by arc length): J_pecL to the lobe's last RIG.lobe.fin HL, which
// bends with the junction; in the lobe's share of the fish's field (fishSDF.parts: noLobe against lobe, held off the
// gill cover, smoothed over the mesh); the flank round the arm's root follows the shoulder in part (RIG.shoulderHalo);
// the pelvic base likewise takes J_pelvic.
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
  // the arm's rows along its length (round B3: one lobe, HL of arc from the shoulder, from armParam's t): J_pecL to the
  // lobe's end, the junction J_pecFin taking over across `fin` (HL from the lobe's end point: the fleshy end bends with
  // the fin's base, which the blade's rows carry from J_pecFin, so the junction bends over a band, not at a crease);
  // `soft`: armParam's two halves blended over this difference of their distances (collinear now: no jump)
  lobe: { fin: [-0.075, 0.02], soft: 0.015 },
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
  // the arm's row eased in along the arm from its root (armParam t: 0 at the shoulder's pivot, 1 at the lobe's middle):
  // the root pad fused to the flank keeps the body's row, the lobe takes the shoulder's over its first 0.14 HL
  // (rootPadShare; null: the arm's row over the whole lobe, as round B1). On the B2 arm, round B1's rows crushed the
  // root in the swim, hop and reach poses (area p001 0.14–0.27, 17–256 new flipped facets); B2's (0 … 0.14 HL) took
  // every rig pose to 0 new flips and area ≥ 0.46 but the forward reach
  rootPad: [0, 0.78],
  // the blade joints' pivots when fins.mjs gives none: this far out along the lobe from its end
  bladeLen: 0.40,
  // the pectoral blade's rows along its rays (round B3; rayT): the body's row at the root (the lobe's end) eased into
  // J_pecFin by `fin`, J_pecMid across the planted sole's heel (fins.mjs def.sole: plantFrame.rays[k].at → sole.from),
  // J_pecTip across `tip` (rayT; the tip pivot at fins.mjs TIP_AT 0.8); without a sole J_pecMid over `band`
  blade: { fin: 0.12, band: [0.45, 0.6], heel: true, tip: [0.74, 0.86] },
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
  // (round B3) the body's own posture in the states (proppedPose, settleOnGround):
  //   prop    the front's raise bent over `joints` (+ pitch: the segment behind up against the front): the first `upTo`
  //           degrees in `split` shares, the rest in `over` shares (a joint at its AXES pitch maximum hands its share on to the
  //           others: 35° bends J_sp1 16° and J_sp2 19°, inside their 20° and 24°; RIG.prop.split is no longer read). B2 put half
  //           of the raise on J_sp3 (the vent: the belly in front of it lifted off, and past 18° the soles could not
  //           reach); the photos bend the body just behind the pelvic fins and the D1's front (A070: the belly on the mud
  //           from about mid-D1 back; B062, 35°: the bend right behind the pectorals), so the bend sits on J_sp1 and J_sp2
  //   ground  the rear laid on the ground after the prop (land) or the whole underside (rest): small pitches of `land.joints`
  //           / `rest.joints` (deg, within ±`maxDeg` of the pose's own and AXES' ranges) found by Levenberg–Marquardt so
  //           the lowest point of each ventral band (bind s, HL; the skin the arms do not carry) and of each folded fin
  //           named lies on the ground (the lowest posed point of everything the state counts), the pitches held small
  //           (`reg` per deg²) and alike from joint to joint (`smooth` per deg²)
  bend: {
    prop: { joints: ['J_sp1', 'J_sp2', 'J_sp3'], split: [0.4, 0.6, 0], upTo: 15, over: [0.5, 0.5, 0] },
    land: { joints: ['J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'], bands: [[2.0, 2.4], [2.4, 2.7], [2.7, 3.0], [3.0, 3.3], [3.3, 3.6], [3.6, 3.9], [3.9, 4.3]], fins: ['Fin_Caudal'], ground: ['Fin_Anal', 'Fin_Caudal'], from: 'J_sp1', maxDeg: 8, reg: 0.002, smooth: 0.01 },
    rest: { joints: ['J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal'], bands: [[0.15, 0.6], [0.6, 1.0], [1.0, 1.5], [1.5, 2.0], [2.0, 2.4], [2.4, 2.7], [2.7, 3.0], [3.0, 3.3], [3.3, 3.6], [3.6, 3.9], [3.9, 4.3]], fins: ['Fin_Caudal'], ground: 'all', maxDeg: 8, reg: 0.002, smooth: 0.01 },
  },
  // (round B3) the pelvic cup's press in the land state (pressPelvic): J_pelvic's pitch searched within this (deg)
  pelvicPress: { pitch: [-8, 28] },
  // the eyes' lift (HL): the joint's range up to `eyeLift` (the alert periscope, u1 and A070: the eye's top 0.5–0.9 ED over
  // the nape, the rest 0.55; +0.08: 0.93 ED) with the eyes-up correctives (headmorphs EYES_UP: skinned alone, the collar
  // past +0.03 stretches in a band, 383 web edges over 2× at +0.05 and 1,345 at +0.08, against 3 and 118 with them);
  // `eyeLiftBare` the most without them (round B1's); `eyeAlert` the alert state's (0.84 ED)
  eyeLift: 0.08, eyeLiftBare: 0.03, eyeAlert: 0.06,
  // the shoulder's channels (round B3, about the bind lobe; deg): swing (about the lateral axis: the lobe swept forward
  // or back as seen from the side), protraction (about the vertical: forward round the flank, the girdle's hinge),
  // depression (about the lobe's bind face normal: the lobe down in its own plane), twist (about its own axis). These
  // ranges are the IK's search box, not a clean set: every state's and crawl frame's pose solved inside them passes the
  // arm root's gate over its whole neighbourhood (every skin triangle within 0.35 HL of the shoulder: area ≥ 0.3 of the
  // bind at the 0.1st percentile, no skin vertex through the skin), but their corners do not (out/pectoral t_root.mjs:
  // swing −35° alone 0.52, −50° 0.35, −35° with twist +30° 0.35; protraction −40° puts the lobe into the flank); coupled
  // limits fitted to the B3 lobe are still to come (B2's were for the old elbowed arm and its channels)
  shoulder: {
    swing: [-60, 70], protraction: [-75, 75], depression: [-70, 60], twist: [-60, 60],
    coupled: [],
  },
  // the junction (the radial–ray joint; deg): flexion about the blade's width axis (+ the blade toward the lobe's outer
  // face: forward when the lobe stands as a leg; the intra-fin angle 180° − flexion: Pace & Gibb 2009 76° → 178° on land,
  // 121° → 213° in water), sweep about the face normal (the blade turned in its own plane toward its leading edge)
  junction: { flexion: [-45, 105], sweep: [-25, 25] },
  // mid-blade (the heel) and distal (the tips): flex about the blade's width axis (+ the distal part toward the outer
  // face: planted, the sole's toes lifted, the roll-off; the furled crutch's heel bends up to ~100° mid-stance, the tips
  // −60 … +70 pressed and rolled off)
  mid: { flex: [-45, 100] },
  tip: { flex: [-60, 70] },
  // the states' arms (statePose: the single source build.mjs, the shots and the runtime read): rest, fins.mjs's rest
  // pose plus these offsets (deg by channel); water, the shoulder's and the junction's channels (A061, A042: the spread
  // fan beside the flank behind the shoulder, out, back and down, its centre 3.9 mm off the flank; out/pectoral
  // opt_water.mjs's search within the root-safe box swing ±20, twist ±30); reach, the front's raise, the lobe's direction
  // (deg below the horizontal, deg out from straight ahead: 29° forward of the perpendicular and 34° out in the front
  // body's frame), the planted tip's place (mm ahead of the shoulder, out from it) and the junction's flexion the IK
  // leans toward
  rest: { protraction: 0 },
  water: { swing: -15, protraction: -20, depression: 12, twist: 20, junction: -15, sweep: 20 },
  reach: { raise: 10, lobe: [44, 36], aheadMM: 9, outMM: 3, lobeW: 1, junction: 30, flat: 2 },
  // the crawl's stance (crawlFrames; Pace & Gibb 2009: synchronous, the rays furled on land, the fin's tip the contact):
  // the furled blade (`blade` 'furl') with its tip welded `aheadMM` ahead of the shoulder and `outMM` out from it (its
  // mid-line `liftMM` above the ground) while the body moves `strideMM` over it at a raise of raiseDeg [start, end]; the
  // lobe swept back on its schedule (`lobeFwd`, `lobeOut`: deg in the front body's frame, knots spread over the stance;
  // pulled with `lobeW`), the blade bending at the heel (J_pecMid) to reach the tip (each frame seeded from the arm's
  // two-link solution in the plane of the lobe and the tip), the tips pressed `tipPitch` deg below the horizontal (pulled
  // with `tipPress`); the arm's inner angle (lobe to the line to the tip) opening ~100° → 170°; `frames` frames.
  // (prevW: each channel's pull toward the frame's seed, ARM_IK order)
  // (lod1: crawlFrames(…, { tier: 'lod1' }) with J_pecTip held at 0 and these overrides: the tips not pressed, the lobe
  // pulled harder onto a shallower sweep)
  crawl: { blade: 'furl', raiseDeg: [12, 12], frames: 8, strideMM: 14.2, aheadMM: 6.5, outMM: 6, liftMM: 0.5, lobeFwd: [-35, -55, -62], lobeOut: [32, 32, 30], lobeW: 3, tipPitch: [10, 10, 15, 30], tipPress: 3, junctionW: 0.3, midW: 0.3, weldK: 40, planeW: 0, toeW: 0, junction: [80, 10], flat: 10, tipFlat: 20, rollFrom: 0.6, straighten: 1, prevW: [0.3, 1, 1, 3, 0.3, 3, 0.3, 0.3], lod1: { tipPress: 0, lobeW: 6, lobeFwd: [-30, -48, -58], liftMM: 0.2 } },
  // the propped land posture (A070, A005, u1, B010, A001, A009; solveArmPlant): the front's raise (bent over J_sp1 and
  // J_sp2 by RIG.bend.prop: B2's `split` here is gone, round B3); the lobe's posture the IK leans toward (`lobeFwd` deg forward of the vertical in the fish
  // frame, `lobeOut` out: 80–90° to the body's axis), the junction toward fins.mjs's nominal prop flexion, pulled with
  // `posture` (cost per deg²); the IK's seed
  prop: { raise: 15, heelSink: 0.04, lobeFwd: -8, lobeOut: 20, toeAz: 5, planeW: 5, wpEnd: 0.5, seed: { J_pec: { protraction: 45, depression: 35 } } },
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

/** The blade joints' pivots (fish mm) of the left arm (round B3): fins.mjs's own when it has them (the junction: the
 * middle of the rays' bases; the mid-blade: the planted sole's heel; the tip: the sole's middle rays at 0.8 of their
 * length; with the sole, the rest pose, the flex axis and the nominal prop: bind space, mm and unit vectors), else
 * estimates along the lobe. */
let FINS = null;
async function bladePivotL() {
  try {
    const F = await import('./fins.mjs');
    FINS = F;
    const def = F.finDefinitions?.(BODY_SCULPT)?.find((d) => d.name === 'Fin_Pectoral_L');
    if (def?.bladePivot && def.junctionPivot) return { at: [...def.bladePivot], fin: [...def.junctionPivot], tip: [...def.tipPivot], axis: def.flexAxis, from: 'fins.mjs pectoral extras (junctionPivot, bladePivot: the planted sole\'s heel, tipPivot)', sole: def.sole ?? null, restPose: def.restPose ?? null, prop: def.prop ?? null, def };
  } catch { /* no fins.mjs yet */ }
  const P = BODY_SCULPT.pectoral, u = norm3(sub3(P.wrist, P.shoulder)), n = norm3(sub3(P.axes.n, mul3(u, dot3(P.axes.n, u))));
  const along = (k) => mm(add3(P.wrist, mul3(u, k)));
  return { at: along(0.5 * RIG.bladeLen), fin: along(0), tip: along(0.8 * RIG.bladeLen), axis: cross3(n, u), from: 'estimate: along the lobe past its end' };
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
    const mb = (p) => (side > 0 ? [...p] : mirror(p));
    return [
      { name: `J_pec${s}`, parent: 'J_head', at: mm(m(P.shoulder)) },
      { name: `J_pecFin${s}`, parent: `J_pec${s}`, at: mb(BLADE.fin) },
      { name: `J_pecMid${s}`, parent: `J_pecFin${s}`, at: mb(BLADE.at) },
      { name: `J_pecTip${s}`, parent: `J_pecMid${s}`, at: mb(BLADE.tip) },
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

/** The joints each tier keeps (body_contract §3; round B3: hero 4 a side (shoulder, junction, mid-blade, distal); lod1
 * 3 a side (J_pecTip's weights to J_pecMid), so the planted sole's heel is the same joint at hero and lod1 and one arm
 * IK serves both: 26 ≤ 32; lod2 J_pecL/R alone). */
export const TIER_JOINTS = {
  hero: JOINTS.map((j) => j.name),
  lod1: JOINTS.map((j) => j.name).filter((n) => !['J_premax', 'J_maxL', 'J_maxR', 'J_imj', 'J_caudal3', 'J_pecTipL', 'J_pecTipR'].includes(n)),
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

/** The arm's row at its parameter t (armParam; side +1 left, −1 right), added × scale into row (round B3: J_pecL along
 * the lobe, J_pecFin over its last RIG.lobe.fin: the fleshy end bending with the fin's base). */
export function lobeRow(t, side, row = new Float32Array(NJ), scale = 1, K = BODY_SCULPT) {
  const s = side > 0 ? 'L' : 'R', L = RIG.lobe, P = K.pectoral;
  const L1 = Math.hypot(...sub3(P.elbow, P.shoulder)), L2 = Math.hypot(...sub3(P.wrist, P.elbow));
  const arc = t <= 1 ? t * L1 : L1 + (t - 1) * L2, aw = L1 + L2;
  const b = smoothstep(aw + L.fin[0], aw + L.fin[1], arc);
  row[J[`J_pec${s}`]] += scale * (1 - b); row[J[`J_pecFin${s}`]] += scale * b;
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
 * blade (round B3) from the body's row at its root (the lobe's fleshy end) to J_pecFin by 0.06 HL, J_pecMid across the
 * planted sole's heel and J_pecTip across 0.37–0.43 HL (RIG.blade), the pelvic fins from the body's row at their root
 * (the pelvic base) to J_pelvic by rayT 0.2.
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
  // the mid-blade joint's band along each ray (absolute length from the base, HL): the planted sole's heel (fins.mjs
  // plantFrame.rays[k].at, the turn's start, to def.sole.from.rayT[k], the sole's), so J_pecMid is the ankle the sole
  // turns on and the whole sole rides it rigidly; without a sole RIG.blade.band of the longest ray; the tip joint's band
  // RIG.blade.tip of the longest ray (the short edge rays end before it)
  const Lmax = Math.max(...def.rays.map((r) => r.len)), B0 = RIG.blade;
  const heel = type === 'pectoral' && B0.heel !== false && def.sole?.from?.rayT && (def.plantFrame ?? def.mirrorOf?.plantFrame)?.rays
    ? (def.plantFrame ?? def.mirrorOf.plantFrame).rays.map((pr, k) => { const L = def.rays[k].len, lB = def.sole.from.rayT[k] * L, lA = clamp(pr.at, B0.fin * Lmax, lB - 0.02); return [lA, Math.max(lB, lA + 0.02)]; })
    : null;
  const heelAt = (r) => { if (!heel) return B0.band.map((x) => x * Lmax); const x = clamp(r, 0, heel.length - 1), k0 = Math.floor(x), k1 = Math.min(heel.length - 1, k0 + 1), f = x - k0; return [heel[k0][0] + (heel[k1][0] - heel[k0][0]) * f, heel[k0][1] + (heel[k1][1] - heel[k0][1]) * f]; };
  const lenAt = (r) => { const x = clamp(r, 0, def.rays.length - 1), k0 = Math.floor(x), k1 = Math.min(def.rays.length - 1, k0 + 1), f = x - k0; return def.rays[k0].len + (def.rays[k1].len - def.rays[k0].len) * f; };
  const MF = RIG.medianFold;
  for (let v = 0; v < n; v++) {
    row.fill(0);
    const t = mesh.rayT[v];
    if (type === 'pectoral' || /^J_pecFin/.test(def.joint ?? '')) {
      // the blade (round B3): the body's row at the root (the lobe's fleshy end), then the junction by RIG.blade.fin of
      // the longest ray, the mid-blade joint across the heel, the tip joint across RIG.blade.tip
      const l = t * lenAt(mesh.ray[v]), [lA, lB] = heelAt(mesh.ray[v]);
      const a = smoothstep(0, B0.fin * Lmax, l), b = smoothstep(lA, lB, l), c = Math.min(b, smoothstep(B0.tip[0] * Lmax, B0.tip[1] * Lmax, l));
      if (a < 1) { const B = baseAt(v); for (let k = 0; k < NJ; k++) row[k] = B[k] * (1 - a); }
      row[J[`J_pecFin${S}`]] += a * (1 - b); row[J[`J_pecMid${S}`]] += a * (b - c); row[J[`J_pecTip${S}`]] += a * c;
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
  // (to 7 decimals, round B3 integration: B2's 4 put the blink's −0.1 HL drop (−1.6135 mm) outside its own −1.6 mm range)
  const r7 = (v) => +v.toFixed(7), liftM = r7(RIG.eyeLift * HL * 0.001), dropM = r7(BLINK_DROP * HL * 0.001);
  for (const s of ['L', 'R']) joints[`J_eye${s}`] = { kind: 'eye (translation only)', translate: { dir: [0, 1, 0], rangeM: [-dropM, liftM], restM: 0, liftM, dropM, alertM: r7(RIG.eyeAlert * HL * 0.001), liftBareM: r7(RIG.eyeLiftBare * HL * 0.001), note: `lifts past liftBareM need the eyesUp${s} blend shape (weight = lift / liftM); a tier without it keeps the lift within liftBareM` } };
  // the pectoral arm, left (the right mirrored as axial vectors; round B3: one lobe and three blade joints): the
  // shoulder's swing (about the lateral axis: the lobe swept forward or back as seen from the side), protraction (about
  // the girdle's vertical hinge, OST §3.8: forward round the flank, the outer face turning forward), depression (about
  // the bind lobe's face normal: the lobe down in its own plane) and its twist about its own axis; the junction's flexion
  // (about the blade's width axis: the intra-fin angle 180° − flexion, Pace & Gibb 2009 76° → 178° on land) and sweep
  // (the blade turned in its own plane); the mid-blade's and the tip's flex (the same width axis, through the planted
  // sole's heel and its distal fifth). Every axis is built on the LEFT side only and mirrored for the right (fx): the
  // same channel values on L and R give mirror images
  const F1 = armFrame(P.shoulder, P.wrist);
  const sh = P.shoulder, wr = P.wrist;
  const pv = (p) => p.map((c) => c / HL), jf = pv(BLADE.fin), jm = pv(BLADE.at), jt = pv(BLADE.tip);
  const wAx = norm3(BLADE.axis ?? F1.w), far = add3(jf, mul3(F1.u, 0.3));
  const flexAx = axisFor(jf, wAx, far, F1.n), midAx = axisFor(jm, wAx, add3(jm, mul3(F1.u, 0.2)), F1.n), tipAx = axisFor(jt, wAx, add3(jt, mul3(F1.u, 0.1)), F1.n);
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R', fx = (a) => (side > 0 ? a : mirrorAxial(a));
    joints[`J_pec${S}`] = { kind: 'pectoral shoulder (the girdle–radial joint; one lobe to the junction)', order: ['swing', 'protraction', 'depression', 'twist'], channels: {
      swing: ch(fx(axisFor(sh, [0, 0, 1], wr, [-1, 0, 0])), [...RIG.shoulder.swing], { positive: 'the lobe swept forward (seen from the side)' }),
      protraction: ch(fx(axisFor(sh, [0, 1, 0], wr, [-1, 0, 0])), [...RIG.shoulder.protraction], { positive: 'the lobe forward round the flank (the vertical hinge; its outer face turning forward)' }),
      depression: ch(fx(axisFor(sh, F1.n, wr, [0, -1, 0])), [...RIG.shoulder.depression], { positive: 'the lobe down in its own plane (its leading edge turning out)' }),
      twist: ch(fx(axisFor(sh, F1.u, add3(sh, mul3(F1.w, 0.1)), F1.n)), [...RIG.shoulder.twist], { positive: 'the lobe\'s leading edge turned toward its outer face' }),
    }, coupled: RIG.shoulder.coupled.map((c) => ({ ...structuredClone(c), note: `Σ sum[channel] × value ≤ max (deg): ${c.note}` })) };
    joints[`J_pecFin${S}`] = { kind: 'pectoral lobe/fin junction (the radial–ray joint, the visible main hinge)', pivotFrom: BLADE.from, intraFinAngleDeg: { formula: '180 − flexion', range: [180 - RIG.junction.flexion[1], 180 - RIG.junction.flexion[0]], biology: { land: [76, 178], water: [121, 213] } }, order: ['flexion', 'sweep'], channels: {
      flexion: ch(fx(flexAx), [...RIG.junction.flexion], { positive: 'the blade toward the lobe\'s outer face (forward when the lobe stands as a leg: the intra-fin angle closing)' }),
      sweep: ch(fx(axisFor(jf, F1.n, far, wAx)), [...RIG.junction.sweep], { positive: 'the blade turned in its own plane toward its leading edge' }),
    } };
    joints[`J_pecMid${S}`] = { kind: 'pectoral mid-blade (the planted sole\'s heel: the ankle the sole turns on)', pivotFrom: BLADE.from, order: ['flex'], channels: {
      flex: ch(fx(midAx), [...RIG.mid.flex], { positive: 'the outer blade toward the lobe\'s outer face: planted, the sole\'s toes lifted off the ground (the roll-off)' }),
    } };
    joints[`J_pecTip${S}`] = { kind: 'pectoral blade tips (the rays bending under load)', pivotFrom: BLADE.from, order: ['flex'], channels: {
      flex: ch(fx(tipAx), [...RIG.tip.flex], { positive: 'the tips toward the outer face: planted, lifted off the ground' }),
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
      curlBudget: { ...RIG.curl, note: 'Σ|yaw| over `joints` ≤ yawAbsSum and ≤ perVertebraDeg × the vertebrae a joint stands for; the J-curl of the escape jump as `jcurl` (deg per joint, sharpest at ⅔ of the length: Swanson & Gibb 2004), scaled down to fit', enforce: 'before posing, scale the yaws of `joints` alike so Σ|yaw| ≤ yawAbsSum (rig.mjs capCurl): every joint at its own limit (430°) put the caudal through the trunk' },
    },
    pectoral: {
      L: ['J_pecL', 'J_pecFinL', 'J_pecMidL', 'J_pecTipL'], R: ['J_pecR', 'J_pecFinR', 'J_pecMidR', 'J_pecTipR'],
      renamed: { J_pecElbow: 'gone (one lobe: B2\'s elbow showed as a knee)', J_pecWrist: 'J_pecFin (the lobe/fin junction)', J_pecBlade: 'J_pecMid (the planted sole\'s heel)', new: 'J_pecTip (the distal tips)' },
      lod2Aim: 'lod2 has the arm as J_pecL/R alone, with the hero\'s J_pecL rotation (rig.mjs poseForTier); its blade cards carry the states (fold, spread, furl, plant: the plant card with the junction\'s nominal prop flexion baked in, fins.mjs FIN_SCULPT.pectoral.prop)',
      plant: 'land: rig.mjs solveArmPlant (the sole flat on the ground: its plane\'s normal straight up, its lowest vertex on the ground; fins.mjs plant = 1, plantMid = 0)',
      states: 'rig.mjs statePose(\'land\' | \'reach\' | \'rest\' | \'water\') and crawlFrames(): the one source for build.mjs, the shots and the runtime',
    },
    // (the crawl's stance: RIG.crawl and rig.mjs crawlFrames; the welded point is the furled blade's tip)
    crawl: { ...structuredClone(RIG.crawl), contact: 'the furled blade\'s tip (fins.mjs def.furl.tip: the middle ray\'s end, J_pecTip; crawlFrames returns it welded in the world as `weld`)' },
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

/** The arm's IK channels in the order solveArmPlant's vector holds them (round B3: the shoulder's four, the junction's
 * two, the mid-blade's and the tip's flex). */
export const ARM_IK = [['J_pec', 'swing'], ['J_pec', 'protraction'], ['J_pec', 'depression'], ['J_pec', 'twist'], ['J_pecFin', 'flexion'], ['J_pecFin', 'sweep'], ['J_pecMid', 'flex'], ['J_pecTip', 'flex']];

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
 * The planted sole (fins.mjs: the pectoral blade with its 'plant' blend shape at 1) of one side in the bind frame (round
 * B3): its vertices past each ray's turn (def.sole.from) up to the tips' band (`points`, riding J_pecMid) and past it
 * (`tipPoints`, riding J_pecTip), their plane's normal (pointing off the ground once planted), the heel, the welded tip
 * (def.sole.tip: the middle rays' tips, the crawl's contact) and the planted blade's vertices past 0.06 HL with the
 * joint each rides (`blade`: none may go under the ground). Fish mm.
 * @param side 'L' | 'R'   @param o { tier: the fins' mesh tier (the hero's: its rays' lens relief is the sole's underside), every: keep every n-th }
 */
export function plantedSole(side = 'L', { tier = 'hero', every = 2, state = 'plant' } = {}) {
  const key = `${side}:${tier}:${every}:${state}`;
  if (SOLE[key]) return SOLE[key];
  if (!FINS) throw new Error('plantedSole: fins.mjs is not available');
  const def = FINS.finDefinitions(BODY_SCULPT).find((d) => d.name === `Fin_Pectoral_${side}`);
  const mesh = FINS.buildFinMesh(def, FINS.finTierParams(tier)[def.name]), tg = FINS.buildFinTargets(def, mesh, { normals: false });
  // (state 'furl': the furled blade (the crawl's crutch: Pace & Gibb's rays furled on land) with its tip, no sole)
  if (state === 'furl') {
    const kF = tg.names.indexOf('furl'), Lmax = Math.max(...def.rays.map((r) => r.len)), tipL = 0.5 * (RIG.blade.tip[0] + RIG.blade.tip[1]) * Lmax;
    const all = [], tipPts = [];
    for (let v = 0, c = 0; v < mesh.position.length / 3; v++) {
      if (c++ % every) continue;
      const k = clamp(Math.round(mesh.ray[v]), 0, def.rays.length - 1), l = mesh.rayT[v] * def.rays[k].len;
      const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q] + tg.deltas[kF][v * 3 + q]);
      if (l >= 0.06) all.push({ p, joint: l >= tipL ? `J_pecTip${side}` : l >= (def.plantFrame ?? def.mirrorOf.plantFrame).rays[k].at ? `J_pecMid${side}` : `J_pecFin${side}` });
      if (l >= tipL) tipPts.push(p);
    }
    // (the welded tip: def.furl.tip, the hero's middle ray's tip vertex; on another tier its own vertex nearest it)
    let tip = [...def.furl.tip];
    if (tier !== 'hero') { let bd = Infinity; for (let v = 0; v < mesh.position.length / 3; v++) { const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q] + tg.deltas[kF][v * 3 + q]), d = Math.hypot(...sub3(p, def.furl.tip)); if (d < bd) { bd = d; tip = p; } } }
    return (SOLE[key] = { points: [], tipPoints: tipPts, blade: all, normal: null, heel: [...def.bladePivot], tip, tipDir: [...def.furl.tipDir], joint: `J_pecMid${side}`, tipJoint: `J_pecTip${side}`, state });
  }
  const kP = tg.names.indexOf('plant'), Lmax = Math.max(...def.rays.map((r) => r.len)), tipL = 0.5 * (RIG.blade.tip[0] + RIG.blade.tip[1]) * Lmax;
  const pts = [], tipPts = [], all = [];
  const jM = `J_pecMid${side}`, jT = `J_pecTip${side}`, jF = `J_pecFin${side}`;
  for (let v = 0, c = 0; v < mesh.position.length / 3; v++) {
    const k = clamp(Math.round(mesh.ray[v]), 0, def.rays.length - 1), from = def.sole?.from?.rayT?.[k] ?? 0.5;
    if (c++ % every) continue;
    const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q] + (kP >= 0 ? tg.deltas[kP][v * 3 + q] : 0));
    const l = mesh.rayT[v] * def.rays[k].len, onSole = mesh.rayT[v] >= from + 0.02;
    if (l >= 0.06) all.push({ p, joint: l >= tipL ? jT : onSole || l >= (def.plantFrame ?? def.mirrorOf.plantFrame).rays[k].at ? jM : jF });
    if (onSole) (l >= tipL ? tipPts : pts).push(p);
  }
  const normal = def.sole.normal;
  return (SOLE[key] = { points: pts, tipPoints: tipPts, blade: all, normal: [...normal], heel: [...def.bladePivot], tip: [...def.sole.tip], joint: jM, tipJoint: jT });
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

/** The spine's curl held to its budget (round B3; AXES.spine.curlBudget: B2 only wrote it, and the joints' own yaw ranges
 * sum to 430°, which buries the caudal in the trunk): the yaws of RIG.curl.joints scaled alike so Σ|yaw| ≤ yawAbsSum.
 * Returns a new pose (the same one when within the budget). */
export function capCurl(pose, C = RIG.curl) {
  const sum = C.joints.reduce((a, j) => a + Math.abs(pose[j]?.yaw ?? 0), 0);
  if (!(sum > C.yawAbsSum)) return pose;
  const out = structuredClone(pose), k = C.yawAbsSum / sum;
  for (const j of C.joints) if (out[j]?.yaw) out[j].yaw = +(out[j].yaw * k).toFixed(4);
  return out;
}

/**
 * The body's propped posture (A070: the front raised by `raise` degrees with the rear body flat): the bend spread over
 * J_sp1 … J_sp3 (propBend: RIG.bend.prop; + pitch: the segment behind up) and the attitude (J_root pitch −raise: the snout
 * up), so the trunk behind the bend lies level and the head block and chest stand `raise` above it. Added to `pose`'s own
 * values.
 */
export function proppedPose(raise, pose = {}) {
  const out = structuredClone(pose);
  const add = (j, c, v) => { out[j] = { ...(out[j] ?? {}) }; out[j][c] = +((out[j][c] ?? 0) + v).toFixed(4); };
  add('J_root', 'pitch', -raise);
  for (const [j, v] of Object.entries(propBend(raise))) add(j, 'pitch', v);
  return out;
}

/** The prop's bend per joint (deg pitch) for a raise (RIG.bend.prop: the first `upTo` degrees in `split` shares, the rest
 * in `over` shares, a joint at its AXES pitch maximum handing its share on to the others). */
export function propBend(raise, B = RIG.bend.prop) {
  const out = Object.fromEntries(B.joints.map((j) => [j, 0])), max = Object.fromEntries(B.joints.map((j) => [j, AXES.joints[j].channels.pitch.range[1]]));
  const first = Math.min(raise, B.upTo);
  B.joints.forEach((j, i) => { out[j] += first * B.split[i]; });
  let rest = raise - first;
  for (let pass = 0; pass < B.joints.length && rest > 1e-9; pass++) {
    const open = B.joints.map((j, i) => (out[j] < max[j] - 1e-9 ? B.over[i] : 0)), tot = open.reduce((a, c) => a + c, 0);
    if (!(tot > 0)) break;
    let given = 0;
    B.joints.forEach((j, i) => { if (!open[i]) return; const take = Math.min(max[j] - out[j], (rest * open[i]) / tot); out[j] += take; given += take; });
    rest -= given;
  }
  if (rest > 1e-9) throw new Error(`propBend: a raise of ${raise}° is past the joints' pitch maxima`);
  return Object.fromEntries(Object.entries(out).map(([j, v]) => [j, +v.toFixed(4)]));
}

/** Positions (fish mm) of the vertices `ids` of a packed skin skinned by world transforms W (keyed by name). */
function skinSome(pos, skin, W, ids, names = TIER_JOINTS.hero) {
  const out = new Float32Array(ids.length * 3), I3 = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }, T = names.map((nm) => W[nm] ?? I3), sc = skin.weights instanceof Uint8Array ? 1 / 255 : 1;
  for (let i = 0; i < ids.length; i++) {
    const v = ids[i], px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let q = 0; q < 4; q++) {
      const w = skin.weights[v * 4 + q] * sc; if (!w) continue;
      const { R, t } = T[skin.joints[v * 4 + q]];
      x += w * (R[0] * px + R[1] * py + R[2] * pz + t[0]); y += w * (R[3] * px + R[4] * py + R[5] * pz + t[1]); z += w * (R[6] * px + R[7] * py + R[8] * pz + t[2]);
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

/**
 * The body laid on the ground (round B3; A030, A070, B067: in the prone rest and the propped land state the belly, the
 * ventral tail and the folded caudal lie on the mud; B2's states held the rear third up to 1.6 mm over it): small pitches
 * of the spine's joints (and in the rest the attitude) so that the lowest point of each ventral band (bind s, HL; the
 * skin the arms do not carry, its lower half) and of each folded fin named lies on the ground, the lowest posed point of
 * everything the state counts (`ground`: 'all' the skin and every fin, or the skin behind `from`'s pivot and the fins
 * named). Levenberg–Marquardt on the bands' heights above the ground, the pitches held small (`reg`) and alike from joint
 * to joint (`smooth`), each within ±`maxDeg` of the pose's own value and AXES' range. The fins are posed with the pose's
 * morph weights.
 * @param pose  channel values by joint (+ morph); the result adds to the joints' pitches
 * @param parts { skin: { position (mm), skin { joints, weights }, names? }, fins: { [name]: { position, skin, targets:
 *              { names, deltas } } } } (the tier the state is solved on: the hero's)
 * @param spec  RIG.bend.land | RIG.bend.rest (or the like)
 * @returns { pose, deltas: { joint: deg }, gapsMM: { band: mm, fin: mm }, groundMM, cost }
 */
export function settleOnGround(pose, parts, spec) {
  const names = parts.skin.names ?? TIER_JOINTS.hero, P0 = parts.skin.position, n = P0.length / 3, keep = notArm({ ...parts.skin, names });
  const sMin = spec.ground === 'all' ? -Infinity : JOINTS[J[spec.from ?? 'J_sp1']].at[0];
  // (the candidates for a band's lowest point and the ground: the skin's lower half, not the arms)
  const cand = [], bandOf = [];
  for (let v = 0; v < n; v++) {
    const s = P0[v * 3] / HL;
    if (!keep(v) || P0[v * 3 + 1] > yAxis(s) * HL) continue;
    const b = spec.bands.findIndex(([a, c]) => s >= a && s < c);
    if (b < 0 && P0[v * 3] <= sMin) continue;
    cand.push(v); bandOf.push(b);
  }
  const ids = Int32Array.from(cand);
  const mo = pose.morph ?? {};
  const fins = Object.entries(parts.fins ?? {}).filter(([nm]) => spec.ground === 'all' || spec.ground.includes(nm) || spec.fins.includes(nm)).map(([nm, f]) => {
    const P = Float32Array.from(f.position);
    for (const [k, w] of Object.entries(mo[nm] ?? {})) { const i = f.targets?.names?.indexOf(k) ?? -1; if (i < 0 || !w) continue; for (let q = 0; q < P.length; q++) P[q] += w * f.targets.deltas[i][q]; }
    // (every vertex of a fin may be its lowest: all of them, at most every 2nd of a big one)
    const step = P.length / 3 > 3000 ? 2 : 1, fid = []; for (let v = 0; v < P.length / 3; v += step) fid.push(v);
    return { nm, P, skin: f.skin, ids: Int32Array.from(fid), band: spec.fins.includes(nm), ground: spec.ground === 'all' || spec.ground.includes(nm) };
  });
  const js = spec.joints, base = js.map((j) => pose[j]?.pitch ?? 0);
  const lo = js.map((j, i) => Math.max(AXES.joints[j].channels.pitch.range[0], base[i] - spec.maxDeg)), hi = js.map((j, i) => Math.min(AXES.joints[j].channels.pitch.range[1], base[i] + spec.maxDeg));
  const build = (x) => { const p = structuredClone(pose); js.forEach((j, i) => { p[j] = { ...(p[j] ?? {}), pitch: base[i] + x[i] }; }); return p; };
  const measure = (x) => {
    const W = poseWorldHero(build(x)), S = skinSome(P0, parts.skin.skin, W, ids, names);
    const low = spec.bands.map(() => Infinity), finLow = {};
    let g = Infinity;
    for (let i = 0; i < ids.length; i++) { const y = S[i * 3 + 1]; g = Math.min(g, y); if (bandOf[i] >= 0 && y < low[bandOf[i]]) low[bandOf[i]] = y; }
    for (const F of fins) { const Q = skinSome(F.P, F.skin, W, F.ids, names); let m = Infinity; for (let i = 1; i < Q.length; i += 3) m = Math.min(m, Q[i]); finLow[F.nm] = m; if (F.ground) g = Math.min(g, m); }
    return { g, gaps: low.map((y) => y - g), fins: Object.fromEntries(fins.filter((F) => F.band).map((F) => [F.nm, finLow[F.nm] - g])) };
  };
  const resid = (x) => {
    const m = measure(x), r = [...m.gaps.map((d) => (Number.isFinite(d) ? d : 0)), ...Object.values(m.fins)];
    x.forEach((v) => r.push(Math.sqrt(spec.reg) * v));
    for (let i = 0; i + 1 < x.length; i++) r.push(Math.sqrt(spec.smooth) * (x[i + 1] - x[i]));
    return r;
  };
  const cost = (r) => r.reduce((a, v) => a + v * v, 0);
  let x = js.map(() => 0), r = resid(x), c0 = cost(r), lam = 1e-2;
  const clampX = (y) => y.map((v, i) => clamp(v, lo[i] - base[i], hi[i] - base[i]));
  for (let it = 0; it < 60; it++) {
    const Jm = x.map((_, i) => { const y = x.slice(); y[i] += 0.05; const ry = resid(y); return ry.map((v, k) => (v - r[k]) / 0.05); });
    const nx = x.length, A = Array.from({ length: nx }, (_, i) => Array.from({ length: nx }, (_, j) => Jm[i].reduce((a, v, k) => a + v * Jm[j][k], 0)));
    const gv = Jm.map((row) => row.reduce((a, v, k) => a + v * r[k], 0));
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lam) + 1e-9 : v)));
      const y = clampX(x.map((v, i) => v + solveN(Ad, gv.map((q) => -q))[i])), ry = resid(y), cy = cost(ry);
      if (cy < c0 - 1e-12) { x = y; r = ry; c0 = cy; lam = Math.max(1e-7, lam / 3); improved = true; } else lam *= 4;
    }
    if (!improved) break;
  }
  const m = measure(x), out = build(x);
  for (const j of js) out[j].pitch = +out[j].pitch.toFixed(3);
  const gapsMM = Object.fromEntries([...spec.bands.map(([a, c], i) => [`${a}-${c}`, +m.gaps[i].toFixed(3)]), ...Object.entries(m.fins).map(([k, v]) => [k, +v.toFixed(3)])]);
  return { pose: out, deltas: Object.fromEntries(js.map((j, i) => [j, +x[i].toFixed(3)])), gapsMM, groundMM: +m.g.toFixed(4), cost: +c0.toFixed(5) };
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
 * The pectoral arms' IK (round B3; A070, A005, u1, B010, A001, A009): each arm's channels (ARM_IK: the shoulder's four,
 * the junction's two, the mid-blade's and the tip's flex, in AXES' ranges and coupled limits) solved by Levenberg–
 * Marquardt for one of two contacts:
 *   'prop'  the planted sole (plantedSole: fins.mjs plant = 1) flat on the ground (its plane's normal straight up, the
 *           lowest of the planted blade on the ground), the lobe leaning toward RIG.prop's posture (in the front body's
 *           frame `lobeFwd` deg forward of its perpendicular and `lobeOut` out: 80–90° to the body's axis), the junction
 *           toward fins.mjs's nominal prop flexion (the far tier's card bakes it), the mid-blade and the tips at rest
 *   'weld'  the sole's tip (def.sole.tip, riding J_pecTip) exactly on a target point (o.target, fish mm in the posed
 *           frame: welded through a crawl's stance), nothing of the planted blade below the ground, the tips and the sole
 *           as flat as they can stay (o.flat: the weight of their normals' tilt; the heel lifts first), the junction toward
 *           o.junction (deg) with weight o.junctionW, the lobe toward o.lobe with weight o.lobeW when given
 * With `o.raise` the body is first propped (proppedPose: the front raised by bending J_sp1 … J_sp3, the rear flat) and
 * the ground taken under the rear body; the pelvic cup can be pressed onto the same ground (o.pelvic: J_pelvic pitch).
 * The posture weights are lowered in stages so the contact ends exact (the posture only chooses among the exact ones).
 * @param pose     the body's pose (channel values by joint, as AXES / the viewer read them); the arms' entries are replaced
 * @param tierMesh { position (fish mm), skin { joints, weights }, names? }: the skin that sets the ground (its lowest
 *                 posed vertex the arms do not carry, behind J_sp1 when propped) when `ground` is null
 * @param ground   { y } (fish mm, posed frame) or null
 * @param o        { raise (deg), sides ['L', 'R'], mode 'prop' | 'weld', seed: { L: { joint: { channel } } } (a warm
 *                 start; seedOnly: no fallback seed), target: { L: [s, z] | [s, y, z] } (weld; weldK its weight per mm),
 *                 lobe: { L: [x, y, z] } (a posed-frame direction, left; the right mirrored), lobeHead (the same in the
 *                 front body's frame), lobeOut (deg), lobeW, junction (deg flexion) or inner (deg: shoulder – junction
 *                 – tip), junctionW, bladeAngle (deg: lobe to the distal blade), bladeW, midTarget, midW, flat, tipFlat,
 *                 tipPress / tipPitch (the furled tip's pitch below the horizontal), toeAz, toeW, planeW (the hinge
 *                 square to the body's axis), prevW (per channel, toward the seed), heelSink, pelvic: { position,
 *                 skin, names? }, sole: { L, R } (plantedSole: 'plant', or 'furl' for the furled crutch) }
 * @returns { pose (the whole pose: body + arms, + morph { Fin_Pectoral_L/R: { plant: 1, plantMid: 0 } } or { furl: 1 }
 *   with the furled sole), ground: { y,
 *   from }, sides: { L: { values, tiltDeg, tipTiltDeg, soleLowMM, soleHighMM, lobeDeg, lobeToBodyDeg, lobeFwdDeg,
 *   lobeOutDeg, junctionDeg, intraFinDeg (lobe to the distal blade), innerDeg (shoulder – junction – tip), lobeToSoleDeg,
 *   toeAzimuthDeg, soleCentreMM, tipMM, tipErrMM, shoulderMM, limitExcess, tipPitchDeg? }, R }, pelvic? }
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
  const mode = o.mode ?? 'prop', P = RIG.prop, sides = {}, D2R = Math.PI / 180;
  const W0 = poseWorldHero(body), Th = W0.J_head;
  const nomJ = o.junction ?? BLADE.prop?.junctionDeg ?? 20;
  let furled = false;
  for (const S of o.sides ?? ['L', 'R']) {
    const sd = S === 'L' ? 1 : -1, mz = (d) => [d[0], d[1], d[2] * sd];
    const sole = o.sole?.[S] ?? plantedSole(S);
    const fwd = P.lobeFwd * D2R, out = P.lobeOut * D2R;
    // (the lobe's wanted direction: o.lobe in the posed frame, o.lobeHead in the front body's (J_head's) frame, or RIG.prop's)
    const lobeWant = o.lobe ? norm3(mz(o.lobe.L ?? o.lobe[S])) : o.lobeHead ? norm3(rvT(Th, mz(o.lobeHead))) : norm3(rvT(Th, mz([-Math.sin(fwd) * Math.cos(out), -Math.cos(fwd) * Math.cos(out), Math.sin(out)])));
    const chans = ARM_IK.map(([j, c]) => [`${j}${S}`, c]);
    // (o.lock: [joint, channel] pairs held at 0, e.g. lod1's J_pecTip, which that tier does not keep)
    const ranges = chans.map(([j, c]) => ((o.lock ?? []).some(([lj, lc]) => `${lj}${S}` === j && lc === c) ? [0, 0] : AXES.joints[j].channels[c].range));
    const idx = (j, c) => chans.findIndex(([a, b]) => a === `${j}${S}` && b === c);
    const iJ = idx('J_pecFin', 'flexion'), iSw = idx('J_pecFin', 'sweep'), iM = idx('J_pecMid', 'flex'), iT = idx('J_pecTip', 'flex');
    const sh = JOINTS[J[`J_pec${S}`]].at, jn = JOINTS[J[`J_pecFin${S}`]].at;
    const tg = o.target?.[S] ? (o.target[S].length === 2 ? [o.target[S][0], g, o.target[S][1]] : o.target[S]) : null;
    // (o.weldFrame { joint: 'J_pecMid' | 'J_pecTip', to: [3 points] } (left, posed mm): that blade joint's world transform
    // held where it was, the sole (or its tips) welded whole; the right side mirrored)
    const wf = o.weldFrame ? (() => { const jn2 = `${o.weldFrame.joint}${S}`, pv = JOINTS[J[jn2]].at; return { joint: jn2, bind: [pv, add3(pv, [1, 0, 0]), add3(pv, [0, 1, 0])], to: o.weldFrame.to.map(mz) }; })() : null;
    if (mode === 'weld' && !tg && !wf) throw new Error('solveArmPlant: the weld needs o.target or o.weldFrame');
    const build = (x) => { const p = structuredClone(body); chans.forEach(([j, c], i) => { p[j] = { ...(p[j] ?? {}), [c]: x[i] }; }); return p; };
    const toeB = BLADE.sole?.toe ? mz(BLADE.sole.toe) : null;
    const geo = (x) => {
      const p = build(x), W = poseWorldHero(p), Tm = W[sole.joint], Tt = W[sole.tipJoint];
      let lo = Infinity, hi = -Infinity, blo = Infinity;
      for (const q of sole.points) { const y = mvT(Tm, q)[1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      for (const q of sole.tipPoints) { const y = mvT(Tt, q)[1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      for (const b of sole.blade) { const y = mvT(W[b.joint], b.p)[1]; if (y < blo) blo = y; }
      // (the furled crutch (sole.normal null): no sole plane; the tip's own direction instead, `td`)
      const nn = sole.normal ? norm3(rvT(Tm, sole.normal)) : [0, 1, 0], nt = sole.normal ? norm3(rvT(Tt, sole.normal)) : [0, 1, 0];
      const td = sole.tipDir ? norm3(rvT(Tt, sole.tipDir)) : null;
      const a = mvT(W[`J_pec${S}`], sh), b = mvT(W[`J_pecFin${S}`], jn), lobe = norm3(sub3(b, a));
      const tip = mvT(Tt, sole.tip);
      const lim = [`J_pec${S}`, `J_pecFin${S}`, `J_pecMid${S}`, `J_pecTip${S}`].reduce((e, j) => e + limitExcess(j, p[j]), 0);
      // (the sole's mean toe direction's azimuth on the ground: 0 forward, + out)
      const tw = td ?? (toeB ? rvT(Tm, toeB) : null), az = tw ? (Math.atan2(tw[2] * sd, -tw[0]) * 180) / Math.PI : 0;
      // (the junction's hinge axis in the posed frame)
      const hinge = norm3(rvT(W[`J_pecFin${S}`], objToFish(AXES.joints[`J_pecFin${S}`].channels.flexion.axis)));
      // (the arm's inner angle at the junction: shoulder – junction – the blade's tip, deg)
      const inner = angDeg(sub3(a, b), sub3(tip, b));
      // (the intra-fin angle as the photos and Pace & Gibb read it: the lobe against the distal blade (the sole's toe
      // direction, the furled tip's), 180° when the fin is straight)
      const ba = tw ? angDeg(mul3(lobe, -1), tw) : null;
      return { p, W, lo, hi, blo, nn, nt, td, lobe, tip, a, lim, Tm, az, hinge, inner, ba };
    };
    const K = 10, KN = 50;
    const resid = (x, wp) => {
      const G = geo(x), r = [];
      if (mode === 'prop') {
        r.push(K * (Math.min(G.lo, G.blo - P.heelSink) - g), KN * G.nn[0], KN * G.nn[2]);
        for (let k = 0; k < 3; k++) r.push(wp * 3 * (G.lobe[k] - lobeWant[k]));
        r.push((wp * 2 * (x[iJ] - nomJ)) / 30, (wp * 0.5 * x[iM]) / 30, (wp * 0.5 * x[iT]) / 30, (wp * 3 * x[iSw]) / 30, (wp * (G.az - P.toeAz)) / 20);
        // (the blade's hinge axis square to the body's axis: the arm's stroke plane holds the line the body moves along,
        // so a crawl from this stance stays in one plane)
        if (P.planeW) r.push(P.planeW * dot3(G.hinge, rvT(Th, [1, 0, 0])));
      } else {
        if (wf) {
          // (a welded frame: the joint's world transform held at the target's: three points round its pivot)
          const T = G.W[wf.joint];
          for (let i = 0; i < 3; i++) { const q = mvT(T, wf.bind[i]); for (let k = 0; k < 3; k++) r.push(10 * K * (q[k] - wf.to[i][k])); }
        } else {
          const KW = o.weldK ?? K;
          r.push(KW * (G.tip[0] - tg[0]), KW * (G.tip[1] - tg[1]), KW * (G.tip[2] - tg[2]));
          const fw = o.flat ?? 2;
          if (sole.normal) r.push(fw * G.nn[0], fw * G.nn[2], (o.tipFlat ?? 3 * fw) * G.nt[0], (o.tipFlat ?? 3 * fw) * G.nt[2]);
          // (the furled crutch's tips pressed: the distal rays' direction `tipPitch` deg below the horizontal)
          if (G.td && o.tipPress) r.push((o.tipPress * ((Math.asin(clamp(-G.td[1], -1, 1)) * 180) / Math.PI - (o.tipPitch ?? 0))) / 10);
        }
        // (the stroke's plane: the junction's hinge square to the body's axis)
        if (o.planeW) r.push(o.planeW * dot3(G.hinge, rvT(Th, [1, 0, 0])));
        r.push((o.weldK ?? K) * Math.min(0, G.blo - 1.5 * (o.heelSink ?? P.heelSink) - g));
        // (the junction toward o.junction (its flexion, deg) or the arm's inner angle toward o.inner (deg))
        r.push(((o.junctionW ?? 1) * (o.inner !== undefined ? G.inner - o.inner : x[iJ] - nomJ)) / 30, (0.5 * x[iSw]) / 30, ((o.toeW ?? wp * 0.5) * (G.az - (o.toeAz ?? P.toeAz))) / 20);
        // (the heel's ankle toward a target: the blade straightening as the sole rolls onto its tips)
        if (o.midTarget !== undefined) r.push(((o.midW ?? 1) * (x[iM] - o.midTarget)) / 30);
        // (the intra-fin angle (lobe to distal blade) toward o.bladeAngle)
        if (o.bladeAngle !== undefined && G.ba !== null) r.push(((o.bladeW ?? 1) * (G.ba - o.bladeAngle)) / 30);
        // (a stance's smoothness: each channel near the previous frame's)
        if (prev && o.prevW) for (let i = 0; i < x.length; i++) r.push(((Array.isArray(o.prevW) ? o.prevW[i] : o.prevW) * (x[i] - prev[i])) / 30);
        if (o.lobe || o.lobeHead) for (let k = 0; k < 3; k++) r.push((o.lobeW ?? 1) * wp * 3 * (G.lobe[k] - lobeWant[k]));
        // (only the lobe's lean out from the body (deg, in the front body's frame): the weld and the sole set the rest)
        if (o.lobeOut !== undefined) { const lz = dot3(G.lobe, rvT(Th, mz([0, 0, 1]))); r.push(((o.lobeW ?? 1) * wp * ((Math.asin(clamp(lz, -1, 1)) * 180) / Math.PI - o.lobeOut)) / 10); }
      }
      for (const v of x) r.push((0.02 * v) / 90);
      r.push(10 * G.lim);
      return r;
    };
    const cost = (r) => r.reduce((a2, v) => a2 + v * v, 0);
    const lm = (x0, wp, iters = 60) => {
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
        if (!improved || c0 < 1e-14) break;
      }
      return x;
    };
    const fromVals = (vals) => chans.map(([j, c]) => vals?.[j]?.[c] ?? vals?.[j.replace(/[LR]$/, '')]?.[c] ?? 0);
    const prev = o.seed?.[S] ? fromVals(o.seed[S]) : null;
    // (the weld's error: the welded frame's points' worst distance, or the tip's)
    const wfErr = (G) => (wf ? Math.max(...wf.bind.map((b, i) => Math.hypot(...sub3(mvT(G.W[wf.joint], b), wf.to[i])))) : Math.hypot(...sub3(G.tip, tg)));
    // (o.seedOnly: the given seed alone, no fallback to RIG.prop's (a stance's frames stay on one branch))
    const seeds = o.seedOnly && o.seed?.[S] ? [] : [fromVals(P.seed)];
    if (o.seed?.[S]) seeds.unshift(fromVals(o.seed[S]));
    else seeds.push(chans.map(() => 0));
    let best = null;
    for (const x0 of seeds) {
      let x = x0.map((v, i) => clamp(v, ranges[i][0], ranges[i][1]));
      // (the posture's weight lowered in stages but held at `wpEnd` in the last: B2's 0.02 let the least-turning pull
      // decide, which kept the arm near its bind)
      for (const wp of (o.seed?.[S] ? [1, P.wpEnd] : [2, 1, P.wpEnd])) x = lm(x, wp);
      const G = geo(x);
      const err = mode === 'prop' ? Math.abs(Math.min(G.lo, G.blo - P.heelSink) - g) + 0.02 * Math.hypot(G.nn[0], G.nn[2]) * 57.3 : wfErr(G) + Math.max(0, g - G.blo);
      const score = 1e4 * err * err + cost(resid(x, P.wpEnd)) + 100 * G.lim * G.lim;
      if (!best || score < best.score) best = { x, G, score };
      if (o.seed?.[S] && err < 0.01 && G.lim < 1e-3) break;
    }
    const v = {}; chans.forEach(([j, c], i) => { (v[j] ??= {})[c] = +best.x[i].toFixed(3); });
    const G = best.G, Tm = G.Tm;
    let cen = [0, 0, 0]; for (const q of sole.points) cen = add3(cen, mul3(mvT(Tm, q), 1 / sole.points.length));
    if (!sole.points.length) for (const q of sole.tipPoints) cen = add3(cen, mul3(mvT(G.W[sole.tipJoint], q), 1 / sole.tipPoints.length));
    const bodyAx = norm3(rvT(Th, [-1, 0, 0])), ang = (a, b) => (Math.acos(clamp(dot3(norm3(a), norm3(b)), -1, 1)) * 180) / Math.PI;
    // (the lobe in the front body's frame: forward of its perpendicular, out)
    const lh = rvT({ R: [Th.R[0], Th.R[3], Th.R[6], Th.R[1], Th.R[4], Th.R[7], Th.R[2], Th.R[5], Th.R[8]] }, G.lobe);
    const toeW = G.td ?? (toeB ? norm3(rvT(Tm, toeB)) : null);
    if (sole.state === 'furl') furled = true;
    const lobeToBody = ang(G.lobe, bodyAx);
    sides[S] = {
      values: v, mode,
      tiltDeg: +ang(G.nn, [0, 1, 0]).toFixed(3), tipTiltDeg: +ang(G.nt, [0, 1, 0]).toFixed(3),
      soleLowMM: +(G.lo - g).toFixed(4), soleHighMM: +(G.hi - g).toFixed(4), bladeLowMM: +(G.blo - g).toFixed(4),
      lobeDeg: +ang(G.lobe, lobeWant).toFixed(2), lobeToBodyDeg: +Math.min(lobeToBody, 180 - lobeToBody).toFixed(2),
      lobeFwdDeg: +((Math.atan2(-lh[0], -lh[1]) * 180) / Math.PI).toFixed(2), lobeOutDeg: +((Math.asin(clamp(lh[2] * sd, -1, 1)) * 180) / Math.PI).toFixed(2),
      junctionDeg: +best.x[iJ].toFixed(2), intraFinDeg: G.ba !== null ? +G.ba.toFixed(2) : +(180 - best.x[iJ]).toFixed(2), innerDeg: +G.inner.toFixed(2),
      lobeToSoleDeg: toeW ? +ang(G.lobe, toeW).toFixed(2) : null,
      toeAzimuthDeg: toeW ? +((Math.atan2(toeW[2] * sd, -toeW[0]) * 180) / Math.PI).toFixed(2) : null,
      soleCentreMM: cen.map((c) => +c.toFixed(4)), tipMM: G.tip.map((c) => +c.toFixed(4)), tipErrMM: tg || wf ? +wfErr(G).toFixed(4) : null,
      shoulderMM: G.a.map((c) => +c.toFixed(4)), limitExcess: +G.lim.toFixed(4),
      ...(G.td ? { tipPitchDeg: +((Math.asin(clamp(-G.td[1], -1, 1)) * 180) / Math.PI).toFixed(2) } : {}),
    };
    for (const [j, c] of Object.entries(v)) body[j] = { ...(body[j] ?? {}), ...c };
  }
  const fm = furled ? { furl: 1 } : { plant: 1, plantMid: 0 };
  const out = { pose: { ...body, morph: { ...(pose.morph ?? {}), Fin_Pectoral_L: { ...fm }, Fin_Pectoral_R: { ...fm } } }, ground: { y: +g.toFixed(4), from: gFrom }, sides };
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

/**
 * The crawl's stance (round B3; Pace & Gibb 2009: both fins synchronous, the rays furled on land and the fin's tip the
 * contact, planted ahead of and below the shoulder, the radials swung back through the push while the fin opens; the
 * tips bending under load): `frames` poses through one stance with the furled blade's tip (fins.mjs def.furl.tip, riding
 * J_pecTip; `blade` 'plant': the planted sole's, def.sole.tip) welded at one world point while the body moves `strideMM`
 * forward over it (J_root's `t`: the fish frame of the first frame is the world), propped at a raise from raiseDeg[0] to
 * raiseDeg[1]. Each frame's arms by solveArmPlant 'weld': the tip exact, the lobe toward its schedule (`lobeFwd`,
 * `lobeOut`), the tips pressed (`tipPitch`), seeded from the arm's two-link solution (the lobe, then junction → heel →
 * tip in the plane of the lobe and the tip, the heel bent the sole's way; the shoulder's rotation fitted to the lobe and
 * that plane's hinge, held from the frame before where the arm runs straight). Without `lobeFwd` the lobe comes from the
 * shoulder–junction–tip triangle with the blade's chord (`elbowOut` turning the junction out) and, with `blade` 'plant',
 * from the previous frame (the sole flat until `rollFrom`, the junction toward `junction`).
 * @param tierMesh the hero's (or a tier's) skin: { position, skin, names? } (the ground under the rear body)
 * @param o RIG.crawl overrides (knots: a value or an array spread evenly over the stance)
 * @returns { frames: [{ phase, raise, pose (+ morph furl 1 | plant 1), tip (posed mm), tipErrMM, sides }], weld: [s, y,
 *   z] (mm, world), strideMM, ground }
 */
export function crawlFrames(tierMesh, o = {}) {
  // (o.tier 'lod1': that tier keeps 3 joints a side (no J_pecTip: its weights ride J_pecMid), so its stance is solved
  // with J_pecTip held at 0 and RIG.crawl.lod1's overrides; the weld then holds on lod1 too)
  const C = { ...RIG.crawl, ...(o.tier === 'lod1' ? RIG.crawl.lod1 : {}), ...o }, out = [];
  const lock = C.tier === 'lod1' ? [['J_pecTip', 'flex']] : undefined;
  const base0 = proppedPose(C.raiseDeg[0], {});
  // (the ground and the shoulder at the stance's start)
  const W0 = poseWorldHero(base0), keep = notArm(tierMesh), s1 = JOINTS[J.J_sp1].at[0];
  const g = lowestPosed(tierMesh, W0, (v) => keep(v) && tierMesh.position[v * 3] > s1).y;
  const sh0 = mvT(W0.J_pecL, JOINTS[J.J_pecL].at);
  // (the first frame from the propped stance's arm: the sole planted as in the land state; the weld where its tip
  // lands, or `aheadMM` / `outMM` from the shoulder when given)
  const prop0 = solveArmPlant(base0, null, { y: g }, {});
  // (`liftMM`: the welded point (the tip ray's mid-line) that far above the ground, its underside on it)
  const weld = C.aheadMM !== undefined ? [sh0[0] - C.aheadMM, g + (C.liftMM ?? 0), sh0[2] + (C.outMM ?? 0)] : [prop0.sides.L.tipMM[0], g, prop0.sides.L.tipMM[2]];
  // (the furled crutch (C.blade 'furl'; Pace & Gibb 2009: the rays furled on land, the fin's tip the contact): its tip
  // welded, no sole to keep flat)
  const sTier = C.tier === 'lod1' ? 'lod1' : 'hero', every = sTier === 'hero' ? 2 : 1;
  const furl = C.blade === 'furl', sole = furl ? { L: plantedSole('L', { state: 'furl', tier: sTier, every }), R: plantedSole('R', { state: 'furl', tier: sTier, every }) } : undefined;
  // (the junction's flexion: two values (start, end) or knots spread evenly over the stance)
  const knots = (k, ph) => { if (!Array.isArray(k)) return k; const u = ph * (k.length - 1), i = Math.min(k.length - 2, Math.floor(u)); return k[i] + (k[i + 1] - k[i]) * (u - i); };
  let seed = { L: prop0.sides.L.values, R: prop0.sides.R.values }, toeAz = null;
  // (the arm's triangle (C.triangle, the furled crutch's default): shoulder, junction, the welded tip, with the lobe's
  // length and the blade's chord; in the stroke's plane (through the shoulder, the tip and the line the body moves along)
  // the junction behind the shoulder–tip line: the lobe's direction and the inner angle the IK leans toward)
  const shB = JOINTS[J.J_pecL].at, jnB = JOINTS[J.J_pecFinL].at, Lb = Math.hypot(...sub3(jnB, shB));
  const Bc = Math.hypot(...sub3(furl ? sole.L.tip : BLADE.sole?.tip ?? jnB, jnB)) * (C.chord ?? 1);
  const triangle = C.triangle ?? furl;
  let prevHinge = null;
  // (the blade as two links: junction → heel (J_pecMid), heel → the welded tip)
  const jmB = JOINTS[J.J_pecMidL].at, LA = Math.hypot(...sub3(jmB, jnB)), LB = Math.hypot(...sub3(furl ? sole.L.tip : BLADE.sole?.tip ?? jmB, jmB));
  const lobeB = norm3(sub3(jnB, shB)), hingeB = norm3(objToFish(AXES.joints.J_pecFinL.channels.flexion.axis));
  for (let i = 0; i < C.frames; i++) {
    const ph = i / (C.frames - 1), raise = C.raiseDeg[0] + (C.raiseDeg[1] - C.raiseDeg[0]) * ph;
    // the body moved forward by stride × phase (−s), its rear kept on the ground
    let body = proppedPose(raise, {});
    body.J_root = { ...(body.J_root ?? {}), t: [-(C.strideMM * ph) / HL, 0, 0] };
    const lowY = lowestPosed(tierMesh, poseWorldHero(body), (v) => keep(v) && tierMesh.position[v * 3] > s1).y;
    // (the vault: the body lifted by the push, `vaultMM` at the stance's end, its belly off the ground: Pace & Gibb 2009,
    // the rays more than the radials lift the body)
    body.J_root.t[1] = (g - lowY + (C.vaultMM ?? 0) * ph) / HL;
    const junction = knots(C.junction, ph);
    const lobeOut = knots(C.lobeOut, ph);
    // (with `lobeFwd` (knots, deg forward of the front body's perpendicular) the whole lobe's direction is pulled: the
    // radials protracted at the touch-down, retracted through the push)
    const lf = C.lobeFwd !== undefined ? (knots(C.lobeFwd, ph) * Math.PI) / 180 : null, lo2 = (lobeOut * Math.PI) / 180;
    const lobeHead = lf === null ? undefined : [-Math.sin(lf) * Math.cos(lo2), -Math.cos(lf) * Math.cos(lo2), Math.sin(lo2)];
    let triLobe, triInner, triSeed, triMid, triFlex;
    if (triangle) {
      const Wb = poseWorldHero(body), Sx = mvT(Wb.J_pecL, shB), d = sub3(weld, Sx), dl = Math.hypot(...d), dh = norm3(d);
      const nP = norm3(cross3([1, 0, 0], dh)), perp = cross3(nP, dh);
      const al = Math.acos(clamp((Lb * Lb + dl * dl - Bc * Bc) / (2 * Lb * dl), -1, 1));
      // (of the two junctions in that plane, the one behind (+s); then turned `elbowOut` deg round the shoulder–tip line
      // toward the outside (the elbow out: the lobe kept off the flank as it sweeps back))
      const back = (perp[0] >= 0 ? perp : mul3(perp, -1)), outw = nP[2] < 0 ? mul3(nP, -1) : nP, ps = (knots(C.elbowOut ?? 0, ph) * Math.PI) / 180;
      triLobe = norm3(add3(mul3(dh, Math.cos(al)), mul3(add3(mul3(back, Math.cos(ps)), mul3(outw, Math.sin(ps))), Math.sin(al))));
      triInner = (Math.acos(clamp((Lb * Lb + Bc * Bc - dl * dl) / (2 * Lb * Bc), -1, 1)) * 180) / Math.PI;
      // (with `lobeFwd` the lobe follows that schedule instead (the front body's frame), the blade bending (J_pecMid,
      // J_pecTip) to take up the length; the inner angle the lobe's with the line to the tip)
      let hinge = null, flex1 = null, flex2 = 0;
      if (lobeHead) {
        // (the lobe on its schedule; the blade in the plane of the lobe and the tip as two links (junction → heel, heel →
        // tip) reaching the tip with the heel bent the sole's way (the first link nearer the lobe's line, the second
        // pressed forward))
        triLobe = norm3(rvT(Wb.J_head, lobeHead));
        const Jx = add3(Sx, mul3(triLobe, Lb)), JT = sub3(weld, Jx), D = Math.hypot(...JT);
        triInner = angDeg(mul3(triLobe, -1), JT);
        // (the arm's plane: the lobe and the line to the tip; near straight (that line along the lobe) it is held from the
        // frame before, so the shoulder's twist does not spin)
        const hc = cross3(triLobe, norm3(JT)), sw = clamp(Math.hypot(...hc) / 0.5, 0, 1);
        hinge = norm3(hc);
        if (prevHinge && sw < 1) { const ph2 = norm3(sub3(prevHinge, mul3(triLobe, dot3(prevHinge, triLobe)))); hinge = norm3(add3(mul3(hinge, sw), mul3(ph2, 1 - sw))); }
        prevHinge = hinge;
        const rot = (v, th) => add3(mul3(v, Math.cos(th)), mul3(cross3(hinge, v), Math.sin(th)));
        const beta = (angDeg(triLobe, JT) * Math.PI) / 180, gam = Math.acos(clamp((LA * LA + D * D - LB * LB) / (2 * LA * D), -1, 1));
        const d1 = rot(triLobe, beta - gam), Mx = add3(Jx, mul3(d1, LA)), d2 = norm3(sub3(weld, Mx));
        flex1 = ((beta - gam) * 180) / Math.PI;
        flex2 = (Math.atan2(dot3(cross3(d1, d2), hinge), dot3(d1, d2)) * 180) / Math.PI;
      }
      // (the IK's seed: the shoulder's rotation taking the bind lobe and the junction's hinge onto the triangle's (the hinge
      // square to the arm's plane, so the junction's + flexion bends the blade toward the tip), the junction at 180° − inner)
      const Jx = add3(Sx, mul3(triLobe, Lb)), Th = Wb.J_head;
      hinge ??= norm3(cross3(triLobe, norm3(sub3(weld, Jx))));
      const inv = (v) => [0, 1, 2].map((c) => Th.R[c] * v[0] + Th.R[3 + c] * v[1] + Th.R[6 + c] * v[2]);
      const lh = inv(triLobe), hh0 = inv(hinge), hh = norm3(sub3(hh0, mul3(lh, dot3(hh0, lh))));
      const hB = norm3(sub3(hingeB, mul3(lobeB, dot3(hingeB, lobeB)))), A = [lobeB, hB, cross3(lobeB, hB)], B = [lh, hh, cross3(lh, hh)];
      const Rm = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A.reduce((sa, a, k) => sa + B[k][r] * a[c], 0)));
      triSeed = { J_pec: fitChannels('J_pecL', Rm).values, J_pecFin: { flexion: flex1 ?? 180 - triInner, sweep: 0 }, J_pecMid: { flex: flex2 }, J_pecTip: { flex: 0 } };
      triMid = flex2; triFlex = flex1;
    }
    // (the lobe's lean out from the body: the weld and the flat sole set its sweep; the sole flat from the plant, the
    // heel free to lift after `rollFrom`: the roll onto the tips)
    // (the tip welded; the tips flat on the ground; the sole flat until `rollFrom`, then its heel free to lift (the roll
    // onto the tips); the sole's heading held near the plant's; the junction toward the schedule)
    const roll = Math.max(0, (ph - C.rollFrom) / (1 - C.rollFrom)), flat = C.flat * (1 - Math.min(1, 3 * roll));
    // (rolling: the blade straightening at the heel (the ankle the plant bakes in undone) while the tips stay flat)
    const midTarget = roll > 0 ? -C.straighten * roll * (FINS?.FIN_SCULPT?.pectoral?.plant?.ankle ?? 45) : undefined;
    const sol = solveArmPlant(body, null, { y: g }, { mode: 'weld', target: { L: weld, R: [weld[0], weld[1], -weld[2]] }, junction, junctionW: C.junctionW, flat, tipFlat: knots(C.tipFlat, ph), lobeOut: lobeHead || triangle ? undefined : lobeOut, lobeHead: triangle ? undefined : lobeHead, lobe: triangle ? { L: triLobe } : undefined, lobeW: C.lobeW, weldK: C.weldK, seed: triangle ? { L: triSeed, R: triSeed } : seed, seedOnly: triangle, lock, prevW: i || triangle ? C.prevW : 0, heelSink: furl ? 0 : undefined, toeAz: toeAz ?? C.toeAz, toeW: toeAz === null && C.toeAz === undefined ? 0 : C.toeW, midTarget: furl ? (triMid !== undefined && lobeHead ? triMid : knots(C.mid ?? 0, ph)) : midTarget, midW: C.midW, sole, tipPress: furl ? C.tipPress ?? 3 : 0, tipPitch: knots(C.tipPitch ?? 0, ph), planeW: C.planeW ?? 0, bladeAngle: C.bladeAngle !== undefined ? knots(C.bladeAngle, ph) : undefined, bladeW: C.bladeW, inner: triangle && !lobeHead ? triInner : C.inner !== undefined ? knots(C.inner, ph) : undefined, ...(triangle && lobeHead ? { junction: triFlex } : {}) });
    if (toeAz === null) toeAz = sol.sides.L.toeAzimuthDeg;
    seed = { L: sol.sides.L.values, R: sol.sides.R.values };
    sol.pose.morph = { ...(sol.pose.morph ?? {}), Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } };
    out.push({ phase: +ph.toFixed(4), raise: +raise.toFixed(3), pose: sol.pose, tip: sol.sides.L.tipMM, tipErrMM: Math.max(sol.sides.L.tipErrMM, sol.sides.R.tipErrMM), sides: sol.sides });
  }
  return { frames: out, weld: weld.map((c) => +c.toFixed(4)), strideMM: C.strideMM, ground: +g.toFixed(4) };
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

/** The fins' blend-shape weights of the reference states (fins.mjs targets; plantMid 4w(1 − w) = 0 at w 1). */
export const STATE_MORPHS = {
  land: { Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  reach: { Fin_Pectoral_L: { plant: 1, plantMid: 0 }, Fin_Pectoral_R: { plant: 1, plantMid: 0 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  rest: { Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Caudal: { fold: 1 }, Fin_Pectoral_L: { fold: 1 }, Fin_Pectoral_R: { fold: 1 }, Fin_Pelvic: { fold: 1 } },
  water: { Fin_Pectoral_L: { spread: 1 }, Fin_Pectoral_R: { spread: 1 }, Fin_Caudal: { spread: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.8 }, Fin_Anal: { fold: 0.8 } },
};

/**
 * The reference states' poses (joint channel values as AXES reads them; the viewer's pose objects): the ONE source the
 * build (build.mjs heroStates writes them into every tier's extras and states.json), the final renders and the runtime
 * read (round B3: no overrides elsewhere):
 *   land   propped on the pectorals (A070, A005, u1, B010, A001, A009): the front raised RIG.prop.raise° over J_sp1 …
 *          J_sp3, the lobes near-perpendicular to the body (80–90°), the blades bent forward at the junction and the
 *          heel and the soles planted flat beside and a little ahead of the shoulders (solveArmPlant 'prop' on
 *          `o.tierMesh`, the pelvic cup pressed onto the same ground with `o.pelvic`), the eyes raised to the alert lift
 *   reach  the arm reaching forward (A023, A070): the lobe forward and down (RIG.reach.lobe: deg below the horizontal,
 *          forward of the lateral), the planted blade's tip RIG.reach.aheadMM in front of the shoulder (solveArmPlant
 *          'weld'), the front raised RIG.reach.raise°
 *   rest   prone (A030, A002, B067): the lobes laid back on the flank in fins.mjs's rest pose (def.restPose: the fold is
 *          authored in it; the shoulder as channels) plus RIG.rest's offsets, the blade joints at rest, every fin folded
 *   water  swimming (A061): half of the rig's swim wave over the rear two thirds, the paddles beside the flank, out and
 *          forward (RIG.water's channels), their fans spread, the caudal spread, the dorsal and anal fins folded
 * @returns { pose (with `morph`), ground? (land, reach: from solveArmPlant), solved? }
 */
export function statePose(state, tier = 'hero', o = {}) {
  // (round B3: statePose(state, tier, o); statePose(state, o) is the hero's. A lighter tier's is the hero's carried over:
  // o.hero, the hero's result, or solved here)
  if (tier && typeof tier === 'object') { o = tier; tier = 'hero'; }
  if (tier !== 'hero') return stateForTier(o.hero ?? statePose(state, 'hero', o), tier, o);
  const both = (j, v) => ({ [`${j}L`]: v, [`${j}R`]: structuredClone(v) });
  if (state === 'water') {
    const amp = [1, 2, 3.5, 5, 6.5, 7.5, 8, 9], Wt = RIG.water;
    const wave = Object.fromEntries(SPINE_BEND.map((j, i) => [j, { yaw: +(amp[i] * Math.sin(0.3 + i)).toFixed(2) }]));
    return { pose: { ...wave, ...both('J_pec', { swing: Wt.swing, protraction: Wt.protraction, depression: Wt.depression, twist: Wt.twist }), ...both('J_pecFin', { flexion: Wt.junction, sweep: Wt.sweep ?? 0 }), morph: structuredClone(STATE_MORPHS.water) } };
  }
  if (state === 'rest') {
    const pose = { morph: structuredClone(STATE_MORPHS.rest) };
    const rp = BLADE.restPose;
    for (const S of ['L', 'R']) {
      if (rp) {
        const qs = S === 'L' ? rp.object.J_pecL : mirrorQuatObj(rp.object.J_pecL);
        const f = fitChannels(`J_pec${S}`, quatToFish(qs)).values;
        for (const [c, d] of Object.entries(RIG.rest)) if (c in f) f[c] = +(f[c] + d).toFixed(3);
        pose[`J_pec${S}`] = f;
      } else pose[`J_pec${S}`] = { protraction: -45, depression: -40 };
    }
    // (round B3) the whole underside laid on the ground (settleOnGround, RIG.bend.rest: B2's prone fish lay on its folded
    // pelvic fin with the rear third floating, the peduncle 1.46 mm and the caudal 1.44 mm over the mud; A030, B067)
    if (o.tierMesh && RIG.bend?.rest) { const st = settleOnGround(pose, { skin: o.tierMesh, fins: o.fins ?? {} }, RIG.bend.rest); return { pose: st.pose, ground: { y: st.groundMM, from: 'settleOnGround (the lowest posed point)' }, settled: st }; }
    return { pose };
  }
  if (state === 'land' || state === 'reach') {
    const eyes = { J_eyeL: { t: [0, RIG.eyeAlert, 0] }, J_eyeR: { t: [0, RIG.eyeAlert, 0] } };
    // (round B3) the rear laid on the ground first (settleOnGround, RIG.bend.land; B2's propped fish stood on its papilla
    // and soles with the tail up to 1.6 mm and the folded caudal 1.4 mm in the air: A070, A030 have them on the mud), the
    // arms then planted on that ground; the pelvic cup pressed by its 'press' blend shape where fins.mjs has one (round
    // B3's: the rays laid on the ground under the chest, J_pelvic near 0; pressPelvic) instead of tilted whole
    if (o.tierMesh && !o.ground && RIG.bend?.land) {
      const raise = state === 'land' ? RIG.prop.raise : RIG.reach.raise, body = { ...eyes, ...(o.pose ?? {}) };
      const st = settleOnGround(proppedPose(raise, { ...body, morph: { ...structuredClone(STATE_MORPHS[state]), ...(body.morph ?? {}) } }), { skin: o.tierMesh, fins: o.fins ?? {} }, RIG.bend.land);
      for (const [j, d] of Object.entries(st.deltas)) body[j] = { ...(body[j] ?? {}), pitch: +((body[j]?.pitch ?? 0) + d).toFixed(3) };
      const press = o.pelvic?.targets?.names?.includes('press') ? o.pelvic : null;
      o = { ...o, pose: body, ground: { y: st.groundMM }, settled: st, ...(press ? { pelvic: null, pressPelvic: press } : {}) };
    }
    let sol;
    if (state === 'land') sol = solveArmPlant({ ...eyes, ...(o.pose ?? {}) }, o.tierMesh ?? null, o.ground ?? null, { raise: RIG.prop.raise, pelvic: o.pelvic ?? null });
    else {
      const R = RIG.reach, body = proppedPose(R.raise, { ...eyes, ...(o.pose ?? {}) });
      const ref = solveArmPlant(body, o.tierMesh ?? null, o.ground ?? null, { sides: ['L'] });
      const g = ref.ground.y, sh = ref.sides.L.shoulderMM;
      const d2r = Math.PI / 180, lobe = [-Math.cos(R.lobe[0] * d2r) * Math.cos(R.lobe[1] * d2r), -Math.sin(R.lobe[0] * d2r), Math.cos(R.lobe[0] * d2r) * Math.sin(R.lobe[1] * d2r)];
      const tgt = [sh[0] - R.aheadMM, g, sh[2] + R.outMM];
      sol = solveArmPlant(body, null, { y: g }, { mode: 'weld', target: { L: tgt, R: [tgt[0], tgt[1], -tgt[2]] }, lobe: { L: lobe }, lobeW: R.lobeW, junction: R.junction, junctionW: 0.5, flat: R.flat });
      sol.ground = ref.ground;
    }
    if (o.pressPelvic) { const pr = pressPelvic(sol.pose, o.pressPelvic, sol.ground.y); sol.pose = pr.pose; sol.pelvic = pr.result; }
    if (o.settled) sol.settled = o.settled;
    sol.pose.morph = { ...structuredClone(STATE_MORPHS[state]), ...sol.pose.morph };
    return { pose: sol.pose, ground: sol.ground, solved: sol };
  }
  throw new Error(`statePose: unknown state ${state}`);
}
/** An object-frame quaternion for the left side → the right side's (mirrored z → −z in the fish frame = x → −x in the object
 * frame; an axial vector: (x, y, z) → (x, −y, −z)). */
const mirrorQuatObj = (q) => [q[0], -q[1], -q[2], q[3]];

/**
 * The pelvic cup pressed onto the ground (round B3; u1, B010, A005: the cup lies on the mud under the chest): its 'press'
 * blend shape at 1 (fins.mjs, authored for the land state's raise with J_pelvic near 0) and J_pelvic's pitch found by
 * bisection within RIG.pelvicPress.pitch so the pressed cup's lowest point is on the ground (+ pitch: the cup's rear down);
 * where even the least pitch puts the pressed cup under the ground (a lower raise) the press is eased (weight w < 1) at
 * pitch 0, or, the bare cup under it too, left out and the cup tilted up until it clears.
 * @param pose   the pose (+ morph); @param pelvic { position, skin, names?, targets { names, deltas } }; @param g ground y (mm)
 * @returns { pose (J_pelvic pitch, morph Fin_Pelvic press w), result: { pitch, w, gapMM, note? } }
 */
export function pressPelvic(pose, pelvic, g) {
  const names = pelvic.names ?? TIER_JOINTS.hero, k = pelvic.targets.names.indexOf('press'), D = pelvic.targets.deltas[k];
  const ids = Int32Array.from({ length: pelvic.position.length / 3 }, (_, i) => i);
  const at = (x, w = 1) => {
    const P = Float32Array.from(pelvic.position, (v, q) => v + w * D[q]), W = poseWorldHero({ ...pose, J_pelvic: { ...(pose.J_pelvic ?? {}), pitch: x } }), Q = skinSome(P, pelvic.skin, W, ids, names);
    let m = Infinity; for (let i = 1; i < Q.length; i += 3) m = Math.min(m, Q[i]); return m - g;
  };
  const bisect = (f, a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } return b; };
  const [a0, b0] = RIG.pelvicPress.pitch;
  let result;
  if (at(b0) > 0) result = { pitch: b0, w: 1, gapMM: +at(b0).toFixed(4), note: 'the pressed cup cannot reach the ground' };
  else if (at(a0) < 0) {
    // (the chest nearer the ground than the press was authored for, e.g. a lower raise: the press eased, J_pelvic at 0)
    if (at(0, 0) >= 0) { const w = +bisect((x) => -at(0, x), 0, 1).toFixed(4); result = { pitch: 0, w, gapMM: +at(0, w).toFixed(4), note: 'the press eased to reach the ground at pitch 0' }; }
    else { const x = at(a0, 0) > 0 ? +bisect((y) => at(y, 0), a0, 0).toFixed(3) : a0; result = { pitch: x, w: 0, gapMM: +at(x, 0).toFixed(4), note: 'no press: the cup tilted up to clear the ground' }; }
  } else { const x = +bisect((y) => at(y), a0, b0).toFixed(3); result = { pitch: x, w: 1, gapMM: +at(x).toFixed(4) }; }
  const out = { ...pose, J_pelvic: { ...(pose.J_pelvic ?? {}), pitch: result.pitch }, morph: { ...(pose.morph ?? {}), Fin_Pelvic: { ...(pose.morph?.Fin_Pelvic ?? {}), press: result.w } } };
  return { pose: out, result };
}

/**
 * A state's pose for a lighter tier (round B3: statePose(state, tier) is the one source the build writes into each tier's
 * extras and states.json and the runtime takes): the hero's carried onto the tier's skeleton (poseForTier: lod2's blade
 * joints dropped), the joints the tier does not keep dropped, the eyes' lift held within liftBareM where the tier has no
 * eyesUp corrective (o.morphNames: the tier's blend shapes; without it the hero and lod1 have them, round B3). Only the
 * weights the state sets itself are written (the fins'); the joint-driven correctives (eyesUp, blink, gape: the meshes'
 * extras `drive`) are left to their joints, so a blink in the alert state (J_eye dropped) takes eyesUp to 0 with it (B2
 * wrote eyesUp 0.75 into the land state: closed, the hood left 31 of 520 cornea vertices bare).
 * @param S statePose's hero result   @param tier 'lod1' | 'lod2'   @param o { morphNames }
 * @returns { pose, ground }
 */
export function stateForTier(S, tier, o = {}) {
  const keep = new Set(TIER_JOINTS[tier]), p = structuredClone(poseForTier(S.pose, tier));
  for (const k of Object.keys(p)) if (/^J_/.test(k) && !keep.has(k)) delete p[k];
  const hasUp = o.morphNames ? (S2) => o.morphNames.includes(`eyesUp${S2}`) : () => tier !== 'lod2';
  const bare = RIG.eyeLiftBare;
  for (const S2 of ['L', 'R']) { const e = p[`J_eye${S2}`]; if (e?.t && !hasUp(S2)) e.t = [e.t[0], Math.min(e.t[1], bare), e.t[2]]; }
  return { pose: p, ground: S.ground ?? null };
}

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
      if (st === 'land' || st === 'reach') {
        let lo = Infinity; for (let v = 0; v < F.P.length / 3; v++) lo = Math.min(lo, F.P[v * 3 + 1]);
        const near = []; for (let v = 0; v < F.P.length / 3; v++) if (F.P[v * 3 + 1] - lo < 0.15) near.push(v);
        add(`sole${sd}`, 'fin', L.bone, L.p, { verts: near.length });
        // the sole's ends along the toe (for the runtime's foot plane): the farthest touching vertices fore and aft
        let fa = near[0], fb = near[0]; for (const v of near) { if (F.P[v * 3] < F.P[fa * 3]) fa = v; if (F.P[v * 3] > F.P[fb * 3]) fb = v; }
        add(`sole${sd}Front`, 'fin', domOf(F.f.skin, fa), [F.P[fa * 3], F.P[fa * 3 + 1], F.P[fa * 3 + 2]]);
        add(`sole${sd}Back`, 'fin', domOf(F.f.skin, fb), [F.P[fb * 3], F.P[fb * 3 + 1], F.P[fb * 3 + 2]]);
        // (round B3) the sole's tip: the crawl's welded point (fins.mjs def.sole.tip, bind space with 'plant' applied): the
        // tier's vertex nearest it
        const tipB = BLADE.sole?.tip ? (sd === 'L' ? BLADE.sole.tip : mirror(BLADE.sole.tip)) : null, kP = F.f.targets?.names?.indexOf('plant') ?? -1;
        if (tipB && kP >= 0) {
          let bv = -1, bd = Infinity;
          for (let v = 0; v < F.P.length / 3; v++) { const q = [0, 1, 2].map((c) => F.f.position[v * 3 + c] + F.f.targets.deltas[kP][v * 3 + c]); const d = Math.hypot(...sub3(q, tipB)); if (d < bd) { bd = d; bv = v; } }
          add(`soleTip${sd}`, 'fin', domOf(F.f.skin, bv), [F.P[bv * 3], F.P[bv * 3 + 1], F.P[bv * 3 + 2]], { bindOffMM: +bd.toFixed(3) });
        }
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
        // (round B3: a zero-area triangle gave triDist NaN, which Math.min spread into the gap: B2's extras had null gaps)
        const e = triDist(p, [m.P[a], m.P[a + 1], m.P[a + 2]], [m.P[bb], m.P[bb + 1], m.P[bb + 2]], [m.P[cc], m.P[cc + 1], m.P[cc + 2]]);
        if (Number.isFinite(e)) d = Math.min(d, e);
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
  // (a degenerate triangle: its nearest corner)
  if (!Number.isFinite(den)) return Math.min(Math.hypot(...ap), Math.hypot(...bp), Math.hypot(...cp));
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
 * A pose carried onto a lighter tier's skeleton (the tiers draw the same fish in the same pose): the joints a tier drops
 * fall away (their skin rides the kept ancestor). Round B3: lod2 has the arm as J_pecL/R alone and the one lobe on it,
 * so the shoulder keeps the hero's rotation exactly (B2 aimed a best-fit of its elbow, wrist and blade, which tilted
 * the lobe); the blade cards carry the states, the planted card with the junction's nominal prop flexion (fins.mjs
 * finCardTargets: AXES.pectoral.lod2Aim).
 * @returns the pose for the tier (lod2: without the blade joints)
 */
export function poseForTier(pose, tier) {
  if (tier !== 'lod2') return pose;
  const out = structuredClone(pose);
  for (const S of ['L', 'R']) for (const j of ['J_pecFin', 'J_pecMid', 'J_pecTip']) delete out[`${j}${S}`];
  return out;
}

export { HEAD_NAMES, HL };
