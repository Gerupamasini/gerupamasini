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
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  // (round B4) the transitions between the states (transitionPlan, TRANSITIONS): the arc sampled at `samples` points, `keys`
  // keys; the lift's directions (deg per unit of scale, the left arm's channels) tried in order, each scaled up to `maxDeg`
  // by bisection until the blade keeps clearMM·sin²(πu) over the ground along the arc (within `tolMM`; round B4 test, B3
  // states: land→rest needs the depression and the junction's flexion together, 45° for the ground; land→reach 15°; the
  // shoulder's swing alone or the twist push the blade down)
  transition: { samples: 20, keys: 8, clearMM: 1.0, tolMM: 0.05, maxDeg: 70, lift: { depflex: { J_pec: { depression: -1 }, J_pecFin: { flexion: 1 } }, dep: { J_pec: { depression: -1 } }, flex: { J_pecFin: { flexion: 1 } }, swing: { J_pec: { swing: 1 } } } },
  // (round B3) the pelvic cup's press in the land state (pressPelvic): J_pelvic's pitch searched within this (deg; round B4:
  // [-8, 28] → the press family's clean range within the channel's, AXES J_pelvic)
  pelvicPress: { pitch: [-5, 16] },
  // (round B4, fins P3 / poses P4: B3's J_pelvic pitch [-20, 35] and roll ±15 put the cup into the chest at both ends: 1,726
  // vertices 1.92 mm deep folded at -20°, 169 bare at +35°; the trunk key's clean ranges per state on the B4 cup (pelvic4:
  // no vertex past 0.02 HL from its root more than 0.05 mm inside the body, the body unmoved): the bare cup pitch [-5, 5] /
  // roll ±3, fold [0, 8] / ±3 (7 here: lod1's cup 0.06 mm in at 8°), spread [-5, 8] / ±5, pressLow [-10, 16] / ±10, press [-15, 20] / ±10, pressHigh and
  // pressDeep [-20, 20] / ±15. The channels' ranges are their union over what the runtime drives, `coupled` each state's
  // own (deg; `morph`: the Fin_Pelvic targets whose summed weight ≥ `min` select the entry, `bare` when none does; several
  // selected: the intersection))
  // (round B4 test on the skinned B4 cup, rig t_pelvic: each range's single-axis ends are clean, but pitch and roll at their
  // ends together put up to 7 vertices 0.11 mm into the chest (pressLow at (16°, ±10°)); with |roll| / its end + max(0,
  // pitch) / its end ≤ `cornerSum` every shape is clean at 1.25)
  pelvic: {
    pitch: [-5, 16], roll: [-10, 10], cornerSum: 1.25,
    coupled: [
      { bare: true, pitch: [-5, 5], roll: [-3, 3], note: 'the cup in its bind shape (no fold, spread or press ≥ 0.25)' },
      { morph: ['fold'], min: 0.25, pitch: [0, 7], roll: [-3, 3], note: 'folded under the belly (rest, water, swim)' },
      { morph: ['spread'], min: 0.25, pitch: [-5, 8], roll: [-5, 5], note: 'spread' },
      { morph: ['pressLow', 'press', 'pressHigh', 'pressDeep'], min: 0.25, pitch: [-5, 16], roll: [-10, 10], note: 'pressed on the ground (land, reach, the props: rig.mjs pressPelvic)' },
    ],
  },
  // the eyes' lift (HL): the joint's range up to `eyeLift` (the alert periscope, u1 and A070: the eye's top 0.5–0.9 ED over
  // the nape, the rest 0.55; +0.08: 0.93 ED) with the eyes-up correctives (headmorphs EYES_UP: skinned alone, the collar
  // past +0.03 stretches in a band, 383 web edges over 2× at +0.05 and 1,345 at +0.08, against 3 and 118 with them);
  // `eyeLiftBare` the most without them (round B1's); `eyeAlert` the alert state's: the land and reach states', the
  // prop's and the crawl's (round T1: 0.03, the bare lift — B4's 0.06 stood the globe on a narrow stalk, a periscope
  // against u1's eye seated in its broad turret: in the hero's land pose, ortho front view, the stalk from the globe's
  // bulge down to the head's shoulder 0.61 ED at 0.06, 0.53 at 0.03, 0.45 at 0 (u1 ≈ 0.5 under the window), the globe's
  // top over the dorsal outline 0.93 / 0.80 / 0.64 ED, side view; tech key, scratchpad ref/work/t1_tech eyesil). The joint
  // keeps its range to `eyeLift` for a brief alert peak, but past 0.03 the eyesUp correctives keep the collar's web, not
  // its breadth: the silhouette is the periscope's still, so the behaviour should hold the lift within liftBareM until
  // they are re-solved for a broad dome
  eyeLift: 0.08, eyeLiftBare: 0.03, eyeAlert: 0.03,
  // the shoulder's channels (round B3, about the bind lobe; deg): swing (about the lateral axis: the lobe swept forward
  // or back as seen from the side), protraction (about the vertical: forward round the flank, the girdle's hinge),
  // depression (about the lobe's bind face normal: the lobe down in its own plane), twist (about its own axis).
  // Round B4: a CLEAN set, the ranges and the coupled limits together (Σ sum[channel] × value ≤ max): every pose inside
  // it, with the junction anywhere in its own range, keeps the arm root's neighbourhood (every skin triangle within 0.35
  // HL of the shoulder) at area ≥ 0.3 of the bind at the 0.1st percentile on hero AND lod1 and the lobe out of the flank
  // (out/pectoral p_lim.mjs + an_lim.py, both arms: 6,000 random poses inside, 0 failing; the box without the coupled limits failed
  // 7 %, B3's whole box 41 %). Fitted round the poses the rig uses (the land leg, the welded prop 10–25°, the crawl, rest,
  // water, reach); each coupled limit cuts one failing corner:
  //   1 the lobe pulled back with its face turned in (protraction −, twist −) and not lowered: into the flank
  //   2, 3 swung forward while raised (swing +, depression +): the root's front fillet crushed
  //   4 pulled back while level (protraction −, depression +): into the flank behind the gill cover
  //   5 pulled back and twisted in: the lobe's inner face into the flank
  //   6, 7 swung (and drawn) forward and twisted in: lod1's root crushed
  //   8 twisted out while pulled back, 9 swung and drawn far forward while level, 10 drawn forward and twisted out:
  //     lod1's root crushed (both sides: lod1's mesh is not a mirror image, its right root fails where the left holds)
  // The bind (all 0) lies outside (twist): the IK and the states start inside it.
  shoulder: {
    swing: [-12, 30], protraction: [-22, 28], depression: [-52, 2], twist: [-60, -8],
    coupled: [
      { sum: { swing: 0.43, protraction: -1, depression: 0.54, twist: -0.54 }, max: 41, note: 'pulled back, turned in, not lowered: the lobe into the flank' },
      { sum: { swing: 1, depression: 0.67 }, max: 23.5, note: 'swung forward while raised: the root crushed' },
      { sum: { swing: 0.43, depression: 1 }, max: 7.5, note: 'raised (with a forward swing): the root crushed' },
      { sum: { protraction: -1, depression: 0.65 }, max: 14, note: 'pulled back while level: into the flank behind the gill cover' },
      { sum: { protraction: -1, twist: -0.5 }, max: 46, note: 'pulled back and twisted in: the inner face into the flank' },
      { sum: { swing: 1, twist: -0.5 }, max: 52, note: 'swung forward and twisted in: lod1\'s root crushed' },
      { sum: { swing: 1, protraction: 1, twist: -0.5 }, max: 58, note: 'swung and drawn forward, twisted in: lod1\'s root crushed' },
      { sum: { protraction: -0.8, twist: 1 }, max: 0, note: 'twisted out while pulled back: lod1\'s root crushed' },
      { sum: { swing: 1, protraction: 1, depression: 0.5 }, max: 42, note: 'swung and drawn far forward, level: lod1\'s root crushed' },
      { sum: { protraction: 1, twist: 1 }, max: 3, note: 'drawn forward and twisted out: lod1\'s right root crushed' },
    ],
  },
  // the junction (the radial–ray joint; deg): flexion about the blade's width axis (+ the blade toward the lobe's outer
  // face), sweep about the face normal (the blade turned in its own plane; − toward its trailing edge: with the lobe
  // standing as a leg, the blade forward). Round B4: the land arm's broad faces stand to the side, so the intra-fin angle
  // a side view reads (Pace & Gibb 2009: 76° → 178° on land) is the in-plane one, 180° − |sweep|: the sweep held to
  // −104 … −2 (76–178°); the flexion (out of the blade's plane) −45 … 32
  junction: { flexion: [-45, 32], sweep: [-104, -2] },
  // mid-blade (the heel) and distal (the tips): flex about the blade's width axis (+ the distal part toward the outer
  // face: planted, the sole's toes lifted, the roll-off; the furled crutch's heel bends up to ~100° mid-stance, the tips
  // −60 … +70 pressed and rolled off)
  mid: { flex: [-45, 100], sweep: [-45, 45] },
  tip: { flex: [-60, 70] },
  // the states' arms (statePose: the single source build.mjs, the shots and the runtime read; round B4, every one inside
  // the clean limits above):
  //   rest (A030: B3's arm lay along the flank 3.8 mm over the mud): the arm down and back to the mud, the furled blade
  //     flat on it (solveArmPlant 'prop' on the settled rest body: the distal blade's broad face down, its lowest `lift`
  //     mm over the mud, the lobe toward `lobeFwd` deg back of the vertical and `lobeOut` out, the junction's flexion
  //     toward `junction`); `arm` the solved channels (the hero's), used where no tier mesh is given
  //   water (A061, A042; B3's fans stood 59° from the horizontal, edge-on to A061 at 1 % of their area): the spread fans
  //     28° from the horizontal, 95 % of their area to A061, beside the flank (centre 6.1 mm behind, 3.5 below and 6.3
  //     out of the shoulder, 1.7 mm off the flank at the nearest): the shoulder's and the junction's channels
  //     (out/pectoral t_water.mjs); round B4 integration (the rig key's request: the bottom rest's contact the belly, not
  //     the fans): depression −32.45 → −40, the fans' lowest point from 0.64 mm under the belly's to 0.31 mm over it (tilt
  //     28.4°, 91 % of the area to A061, centre 6.5 back / 2.4 down / 6.4 out; hero root 0.632, 0 flips; lod1 0.387)
  //   reach (A023, A070): the front raised `raise`, the lobe forward and down (`lobeFwd` deg forward of the vertical,
  //     `lobeOut` out, in the front body's frame) as far as the clean limits let it, the fan half spread (`spread`) lying
  //     flat on the mud forward, its centre `aheadHL` ahead of the shoulder and `outHL` out of it
  rest: { lobeFwd: -35, lobeOut: 35, junction: 0, lift: 0.06, arm: { J_pec: { swing: 29.979, protraction: 11.996, depression: -31.244, twist: -32.051 }, J_pecFin: { flexion: 22.629, sweep: -74.058 }, J_pecMid: { flex: 29.113, sweep: -0.663 }, J_pecTip: { flex: 0 } } },
  water: { swing: 17.03, protraction: -10.28, depression: -40, twist: -49.62, junction: 18.78, sweep: -10.21 },
  reach: { raise: 10, lobeFwd: 10, lobeOut: 30, spread: 0.5, aheadHL: 0.45, outHL: 0.3, contactW: 3, junction: 0, sweep: -70, sweepW: 0.3, lift: 0.04, seed: { J_pec: { swing: 20, protraction: 5, depression: -10, twist: -40 }, J_pecFin: { flexion: 30, sweep: -80 } } },
  // (round B4) the crawl as a full cycle (crawlCycle / crawlPose; Pace & Gibb 2009, behaviour §3.1): `cycleS` s a cycle,
  // the stance `duty` of it (its first `lift` and last `set` of the cycle the body rising off / settling onto the mud
  // straight up and down, the push between), `strideMM` forward per cycle (0.19 TL: 0.375 BL/s at 0.5 s), the feet planted
  // with their weld point `aheadMM` ahead of the shoulder, the body vaulted `vaultMM` through the push (belly, pelvic cup
  // and tail clear), the feet swung forward `clearMM` over the mud at the recovery's middle (at least `liftMM` all the
  // way); `frames` keyframes a cycle; the arms' pulls (faces square to s past `faceMax`, the junction's flexion toward 0,
  // each channel toward the frame before, the weld's weight per mm, the foot's heading)
  crawl: { cycleS: 0.5, duty: 0.6, lift: 0.08, set: 0.08, strideMM: 15, aheadMM: 7.5, raiseDeg: 15, vaultMM: 0.4, clearMM: 1.0, liftMM: 0.3, clearSlack: 0.1, sweepFrom: -90, sweepTo: -5, sweepW: 1, thetaFrom: 30, thetaTo: 120, thetaW: 0.3, strokeW: 3, frames: 48, faceW: 3, bladeFaceW: 3, faceMax: 10, junctionW: 0.2, prevW: 0.3, weldK: 40, rollTol: 0.005, rollIters: 12 },
  // the propped land posture (A070, A005, u1, B010, A001, A009; solveArmPlant): the front's raise (bent over J_sp1 and
  // J_sp2 by RIG.bend.prop: B2's `split` here is gone, round B3); the lobe's posture the IK leans toward (`lobeFwd` deg forward of the vertical in the fish
  // frame, `lobeOut` out: 80–90° to the body's axis), the junction toward fins.mjs's nominal prop flexion, pulled with
  // `posture` (cost per deg²); the IK's seed
  // (round B4) `plane`: the land arm as one leg in one plane (planeArm: the broad faces to the side, u1's V), tilted out
  // `abduct` deg and turned `yaw` (+ front edge out), the Newton's start (tL, sweep); `weld`: propPose's held-foot solve
  // at other raises (the posture's pulls)
  prop: { raise: 15, heelSink: 0.04, lobeFwd: -8, lobeOut: 20, toeAz: 5, planeW: 5, wpEnd: 0.5, seed: { J_pec: { protraction: 45, depression: 35 } }, plane: { abduct: 32, yaw: 0, tL: 40, sweep: -85 }, weld: { prevW: 0.3, faceW: 3, bladeFaceW: 3, faceMax: 8, junctionW: 0.5 } },
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
    joints[`J_pecFin${S}`] = { kind: 'pectoral lobe/fin junction (the radial–ray joint, the visible main hinge)', pivotFrom: BLADE.from, intraFinAngleDeg: { formula: '180 − |sweep| (round B4: the side view of the land arm, its faces to the side; the in-plane angle)', range: [180 + RIG.junction.sweep[0], 180 + RIG.junction.sweep[1]], biology: { land: [76, 178], water: [121, 213] } }, order: ['flexion', 'sweep'], channels: {
      flexion: ch(fx(flexAx), [...RIG.junction.flexion], { positive: 'the blade toward the lobe\'s outer face (forward when the lobe stands as a leg: the intra-fin angle closing)' }),
      sweep: ch(fx(axisFor(jf, F1.n, far, wAx)), [...RIG.junction.sweep], { positive: 'the blade turned in its own plane toward its leading edge' }),
    } };
    joints[`J_pecMid${S}`] = { kind: 'pectoral mid-blade (the planted foot\'s heel: the ankle the foot turns on)', pivotFrom: BLADE.from, order: ['flex', 'sweep'], channels: {
      flex: ch(fx(midAx), [...RIG.mid.flex], { positive: 'the outer blade toward the lobe\'s outer face: planted, the sole\'s toes lifted off the ground (the roll-off)' }),
      // (round B4: the ankle in the blade's own plane, the furled bundle bending at the heel as the land foot does
      // (fins.mjs plant 'edge'): the foot held on the mud while the front rises or sinks (rig.propPose) and through the
      // crawl's stance)
      sweep: ch(fx(axisFor(jm, F1.n, add3(jm, mul3(F1.u, 0.2)), wAx)), [...RIG.mid.sweep], { positive: 'the outer blade turned in its own plane toward its leading edge' }),
    } };
    joints[`J_pecTip${S}`] = { kind: 'pectoral blade tips (the rays bending under load)', pivotFrom: BLADE.from, order: ['flex'], channels: {
      flex: ch(fx(tipAx), [...RIG.tip.flex], { positive: 'the tips toward the outer face: planted, lifted off the ground' }),
    } };
  }
  // the pelvic fins' base: pitch about the lateral axis (+ presses the rear of the cup down: the piston, Wicaksono 2022)
  // (round B4: the ranges the cup clears the chest in, RIG.pelvic: the channels' the union, `coupled` per blend-shape state)
  { const p = BODY_SCULPT.pelvicBase.c, rear = add3(p, [0.2, 0, 0]), PV = RIG.pelvic; joints.J_pelvic = { kind: 'pelvic base', order: ['pitch', 'roll'], channels: {
    pitch: ch(axisFor(p, [0, 0, 1], rear, [0, -1, 0]), [...PV.pitch], { positive: 'the cup\'s rear down' }),
    roll: ch(axisFor(p, [1, 0, 0], add3(p, [0, -0.1, 0]), [0, 0, 1]), [...PV.roll], { positive: 'the cup tilted toward the fish\'s left' }),
  }, coupled: structuredClone(PV.coupled), cornerSum: PV.cornerSum, coupledRule: `by the Fin_Pelvic blend-shape weights: the entries whose \`morph\` targets sum to ≥ \`min\` apply (several: the intersection of their ranges), the \`bare\` entry when none does; within them, and with |roll| / the roll range's end + max(0, pitch) / the pitch range's end ≤ ${PV.cornerSum} (the corners cut), the cup stays out of the chest (no vertex more than 0.05 mm inside; rig.mjs pelvicRange)` }; }
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
    crawl: { ...structuredClone(RIG.crawl), contact: 'the furled blade\'s distal tip rolling on the mud (crawlCycle: J_pecTip held at 0, the distal blade one piece with J_pecMid; the lowest of its vertices bears, welded where it touched, and passes the contact on as the crutch turns: frames[i].contacts.weld (world mm, this cycle\'s) and .vertex (index in the tier\'s furled distal blade, plantedSole(\'L\', { state: \'furl\', every: 1 }).blade past J_pecFin)); crawlPose(phase) shifts the contacts strideMM a whole cycle', speed: 'runtime speed = strideMM / cycleS (0.375 BL/s at the defaults; behaviour §3.1: P. barbarus 0.31–0.40 BL/s on mud)', phases: 'crawlPose(phase): phase 0–duty the stance (lift, push, set-down: the body vaulted vaultMM clear of the mud, belly, pelvic cup and tail; the junction 90° → 175°), duty–1 the recovery (the body still on the cup and the belly, the crutches lifted clearMM and swung strideMM forward); whole cycles add strideMM to J_root\'s t' },
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
export const ARM_IK = [['J_pec', 'swing'], ['J_pec', 'protraction'], ['J_pec', 'depression'], ['J_pec', 'twist'], ['J_pecFin', 'flexion'], ['J_pecFin', 'sweep'], ['J_pecMid', 'flex'], ['J_pecTip', 'flex'], ['J_pecMid', 'sweep']];

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
export function plantedSole(side = 'L', { tier = 'hero', every = 2, state = 'plant', morph = null } = {}) {
  const key = `${side}:${tier}:${every}:${state}:${morph ? JSON.stringify(morph) : ''}`;
  if (SOLE[key]) return SOLE[key];
  if (!FINS) throw new Error('plantedSole: fins.mjs is not available');
  const def = FINS.finDefinitions(BODY_SCULPT).find((d) => d.name === `Fin_Pectoral_${side}`);
  const mesh = FINS.buildFinMesh(def, FINS.finTierParams(tier)[def.name]), tg = FINS.buildFinTargets(def, mesh, { normals: false });
  // (round B4, state 'flat': the blade in a blend of its shapes (`morph`, e.g. { furl: 1 }, { spread: 0.5 }) laid on its
  // broad face: the distal part (J_pecMid's and J_pecTip's: one piece with J_pecTip held at 0) the sole, the lobe's outer
  // face normal (def.sole.axis, fins.mjs frame n) its normal: the rest's blade on the mud, the reach's fan)
  if (state === 'flat') {
    const mo = morph ?? { furl: 1 }, Lmax = Math.max(...def.rays.map((r) => r.len)), tipL = 0.5 * (RIG.blade.tip[0] + RIG.blade.tip[1]) * Lmax;
    const pts = [], all = [];
    for (let v = 0, c = 0; v < mesh.position.length / 3; v++) {
      if (c++ % every) continue;
      const k = clamp(Math.round(mesh.ray[v]), 0, def.rays.length - 1), l = mesh.rayT[v] * def.rays[k].len;
      const p = [0, 1, 2].map((q) => mesh.position[v * 3 + q] + Object.entries(mo).reduce((a, [nm, w]) => { const i = tg.names.indexOf(nm); return a + (i >= 0 ? w * tg.deltas[i][v * 3 + q] : 0); }, 0));
      const joint = l >= tipL ? `J_pecTip${side}` : l >= (def.plantFrame ?? def.mirrorOf.plantFrame).rays[k].at ? `J_pecMid${side}` : `J_pecFin${side}`;
      if (l >= 0.06) all.push({ p, joint });
      if (joint !== `J_pecFin${side}` && l >= 0.06) pts.push(p);
    }
    return (SOLE[key] = { points: pts, tipPoints: [], blade: all, normal: [...def.sole.axis], heel: [...def.bladePivot], tip: [...def.furl.tip], joint: `J_pecMid${side}`, tipJoint: `J_pecMid${side}`, state });
  }
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
  return (SOLE[key] = { points: pts, tipPoints: tipPts, blade: all, normal: [...normal], heel: [...def.bladePivot], tip: [...def.sole.tip], joint: jM, tipJoint: jT, ...(def.sole.edge ? { edge: true } : {}) });
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

/** The ground a settle would find under a pose as it is (2026-10-25, the pose lock): settleOnGround's lowest posed point
 * of what `spec` counts (the skin's lower half the arms do not carry — behind `spec.from`'s pivot unless spec.ground is
 * 'all' — and the fins it names), no joint moved. The states' and the prop keys' solve grounds are this of their own
 * poses, so build.mjs re-measures them on a new mesh for poses it holds (poselock.mjs). Returns mm. */
export function groundUnder(pose, parts, spec) {
  return settleOnGround(pose, parts, { ...spec, joints: [] }).groundMM;
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
  const mode = o.mode ?? 'prop', P = { ...RIG.prop, ...(o.prop ?? {}) }, sides = {}, D2R = Math.PI / 180;
  const W0 = poseWorldHero(body), Th = W0.J_head;
  const nomJ = o.junction ?? (P.face ? P.flexion ?? 0 : BLADE.prop?.junctionDeg ?? 20);
  // (round B4: the front body's axes in the posed frame: s (back), its forward on the ground, its outward (left) on it)
  const sHead = norm3(rvT(Th, [1, 0, 0])), fwdG = norm3([-sHead[0], 0, -sHead[2]]), outG = [fwdG[2], 0, -fwdG[0]];
  const faceN = BODY_SCULPT.pectoral.axes?.n ?? [0, 0, 1];
  let furled = false;
  for (const S of o.sides ?? ['L', 'R']) {
    const sd = S === 'L' ? 1 : -1, mz = (d) => [d[0], d[1], d[2] * sd];
    const sole = o.sole?.[S] ?? plantedSole(S);
    const fwd = P.lobeFwd * D2R, out = P.lobeOut * D2R;
    // (the lobe's wanted direction: o.lobe in the posed frame, o.lobeHead in the front body's (J_head's) frame, or RIG.prop's)
    const lobeWant = o.lobe ? norm3(mz(o.lobe.L ?? o.lobe[S])) : o.lobeHead ? norm3(rvT(Th, mz(o.lobeHead))) : norm3(rvT(Th, mz([-Math.sin(fwd) * Math.cos(out), -Math.cos(fwd) * Math.cos(out), Math.sin(out)])));
    const chans = ARM_IK.map(([j, c]) => [`${j}${S}`, c]);
    // (o.lock: [joint, channel] pairs held at 0, e.g. lod1's J_pecTip, which that tier does not keep)
    // (round B4, o.fixed: { L: { J_pec: { swing: v, … } } }: channels held at given values (the right mirrored by the
    // same values), e.g. a shoulder chosen from the root-safe set with only the blade solved)
    const fixedV = (j, c) => { const f = o.fixed?.[S] ?? o.fixed?.L; const v = f?.[j]?.[c] ?? f?.[j.replace(/R$/, 'L')]?.[c] ?? f?.[j.replace(/[LR]$/, '')]?.[c]; return v; };
    const ranges = chans.map(([j, c]) => ((o.lock ?? []).some(([lj, lc]) => `${lj}${S}` === j && lc === c) ? [0, 0] : fixedV(j, c) !== undefined ? [fixedV(j, c), fixedV(j, c)] : AXES.joints[j].channels[c].range));
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
      // (round B4) the lobe's and the inner blade's broad faces (their outer normals: the bind lobe's axes.n carried by
      // J_pec and by J_pecFin) and the sole's centroid against the shoulder (HL: ahead along the front body's heading on
      // the ground, out from it); the inner blade's direction (the junction to the heel), the intra-fin angle the side
      // view reads (lobe to inner blade)
      const nL = norm3(rvT(W[`J_pec${S}`], mz(faceN))), nB = norm3(rvT(W[`J_pecFin${S}`], mz(faceN)));
      let cen = null;
      if (sole.points.length) { cen = [0, 0, 0]; for (const q of sole.points) cen = add3(cen, mvT(Tm, q)); cen = mul3(cen, 1 / sole.points.length); }
      const dc = cen ? sub3(cen, a) : null, ahead = dc ? dot3(dc, fwdG) / HL : 0, outC = dc ? (dot3(dc, outG) * sd) / HL : 0;
      const heel = mvT(W[`J_pecMid${S}`], JOINTS[J[`J_pecMid${S}`]].at), inB = norm3(sub3(heel, b)), intra = angDeg(mul3(lobe, -1), inB);
      // (round B4: an edge foot (fins.mjs plant mode 'edge') is level when its toe line is: the foot's pitch, deg)
      const toeW = sole.edge && tw ? norm3(tw) : null, pitch = toeW ? (Math.asin(clamp(toeW[1], -1, 1)) * 180) / Math.PI : null;
      return { p, W, lo, hi, blo, nn, nt, td, lobe, tip, a, lim, Tm, az, hinge, inner, ba, nL, nB, ahead, outC, intra, cen, toeW, pitch, inB };
    };
    const K = 10, KN = 50;
    const resid = (x, wp) => {
      const G = geo(x), r = [];
      if (mode === 'prop' && P.face) {
        // (round B4: the broad faces to the side (B010, A005, B014, u1, A070): the lobe's and the inner blade's outer
        // normals square to the front body's s (their width along the body, what a side camera sees), the lobe toward its
        // posture, the sole's centroid toward `aheadHL` / `outHL` from the shoulder, its toes toward `toeAz`)
        r.push(K * (Math.min(G.lo, G.blo - P.heelSink) - g), ...(G.toeW ? [KN * G.toeW[1]] : [KN * G.nn[0], KN * G.nn[2]]));
        for (let k = 0; k < 3; k++) r.push(wp * 3 * (P.lobeW ?? 1) * (G.lobe[k] - lobeWant[k]));
        // (a face may turn up to `faceMax` deg off that plane freely: cos 20° keeps 0.94 of the width)
        const fm = Math.sin(((P.faceMax ?? 0) * Math.PI) / 180), hinge = (d) => Math.sign(d) * Math.max(0, Math.abs(d) - fm);
        r.push(wp * (P.faceW ?? 0) * hinge(dot3(G.nL, sHead)), wp * (P.bladeFaceW ?? 0) * hinge(dot3(G.nB, sHead)));
        if (P.aheadHL !== undefined) r.push(wp * (P.contactW ?? 1) * (G.ahead - P.aheadHL));
        if (P.outHL !== undefined) r.push(wp * (P.contactW ?? 1) * (G.outC - P.outHL));
        r.push((wp * (P.junctionW ?? 0.5) * (x[iJ] - nomJ)) / 30, (wp * (P.sweepW ?? 0.2) * (x[iSw] - (P.sweep ?? 0))) / 30, (wp * (P.midW ?? 0.5) * (x[iM] - (P.mid ?? 0))) / 30, (wp * 0.5 * x[iT]) / 30, (wp * (P.toeW ?? 1) * (G.az - P.toeAz)) / 20);
        if (P.intra !== undefined) r.push((wp * (P.intraW ?? 1) * (G.intra - P.intra)) / 30);
        if (P.planeW) r.push(P.planeW * dot3(G.hinge, rvT(Th, [1, 0, 0])));
      } else if (mode === 'prop') {
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
        // (round B4, o.clearMM: the whole blade that far over the ground: a crawl's recovery swing)
        r.push((o.weldK ?? K) * Math.min(0, G.blo - 1.5 * (o.heelSink ?? P.heelSink) - g - (o.clearMM ?? 0)));
        // (the junction toward o.junction (its flexion, deg) or the arm's inner angle toward o.inner (deg))
        r.push(((o.junctionW ?? 1) * (o.inner !== undefined ? G.inner - o.inner : x[iJ] - nomJ)) / 30, ((o.sweepW ?? 0.5) * (x[iSw] - (o.sweep ?? 0))) / 30, ((o.toeW ?? wp * 0.5) * (G.az - (o.toeAz ?? P.toeAz))) / 20);
        // (the heel's ankle toward a target: the blade straightening as the sole rolls onto its tips)
        if (o.midTarget !== undefined) r.push(((o.midW ?? 1) * (x[iM] - o.midTarget)) / 30);
        // (the intra-fin angle (lobe to distal blade) toward o.bladeAngle)
        if (o.bladeAngle !== undefined && G.ba !== null) r.push(((o.bladeW ?? 1) * (G.ba - o.bladeAngle)) / 30);
        // (a stance's smoothness: each channel near the previous frame's)
        if (prev && o.prevW) for (let i = 0; i < x.length; i++) r.push(((Array.isArray(o.prevW) ? o.prevW[i] ?? 0.3 : o.prevW) * (x[i] - prev[i])) / 30);
        if (o.lobe || o.lobeHead) for (let k = 0; k < 3; k++) r.push((o.lobeW ?? 1) * wp * 3 * (G.lobe[k] - lobeWant[k]));
        // (round B4: the broad faces kept square to the front body's s, past `faceMax` deg)
        if (o.faceW || o.bladeFaceW) { const fm = Math.sin(((o.faceMax ?? 0) * Math.PI) / 180), hg = (d) => Math.sign(d) * Math.max(0, Math.abs(d) - fm); r.push((o.faceW ?? 0) * hg(dot3(G.nL, sHead)), (o.bladeFaceW ?? 0) * hg(dot3(G.nB, sHead))); }
        // (round B4, o.stroke { n, down, fwd (world unit vectors), W, theta, thetaW }: the leg in one plane (the lobe, the
        // inner blade and the distal blade's direction square to n: the crawl's stroke plane, so the broad faces stay to
        // the side) and the distal blade's angle in it (deg from `fwd` toward `down`: 0 lying forward, 90 straight down)
        if (o.stroke) {
          const st = o.stroke, w = st.W ?? 3;
          r.push(w * dot3(G.lobe, st.n), w * dot3(G.inB, st.n));
          if (G.td) {
            r.push(w * dot3(G.td, st.n));
            if (st.theta !== undefined) r.push(((st.thetaW ?? 1) * ((Math.atan2(dot3(G.td, st.down), dot3(G.td, st.fwd)) * 180) / Math.PI - st.theta)) / 10);
          }
        }
        // (only the lobe's lean out from the body (deg, in the front body's frame): the weld and the sole set the rest)
        if (o.lobeOut !== undefined) { const lz = dot3(G.lobe, rvT(Th, mz([0, 0, 1]))); r.push(((o.lobeW ?? 1) * wp * ((Math.asin(clamp(lz, -1, 1)) * 180) / Math.PI - o.lobeOut)) / 10); }
      }
      for (const v of x) r.push((0.02 * v) / 90);
      r.push(30 * G.lim);
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
    const fromVals = (vals) => chans.map(([j, c]) => vals?.[j]?.[c] ?? vals?.[j.replace(/R$/, 'L')]?.[c] ?? vals?.[j.replace(/[LR]$/, '')]?.[c] ?? 0);
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
      const err = mode === 'prop' ? Math.abs(Math.min(G.lo, G.blo - P.heelSink) - g) + 0.02 * (G.pitch !== null ? Math.abs(G.pitch) : Math.hypot(G.nn[0], G.nn[2]) * 57.3) : wfErr(G) + Math.max(0, g - G.blo);
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
      tiltDeg: G.pitch !== null ? +Math.abs(G.pitch).toFixed(3) : +ang(G.nn, [0, 1, 0]).toFixed(3), tipTiltDeg: +ang(G.nt, [0, 1, 0]).toFixed(3),
      soleLowMM: +(G.lo - g).toFixed(4), soleHighMM: +(G.hi - g).toFixed(4), bladeLowMM: +(G.blo - g).toFixed(4),
      lobeDeg: +ang(G.lobe, lobeWant).toFixed(2), lobeToBodyDeg: +Math.min(lobeToBody, 180 - lobeToBody).toFixed(2),
      lobeFwdDeg: +((Math.atan2(-lh[0], -lh[1]) * 180) / Math.PI).toFixed(2), lobeOutDeg: +((Math.asin(clamp(lh[2] * sd, -1, 1)) * 180) / Math.PI).toFixed(2),
      junctionDeg: +best.x[iJ].toFixed(2), intraFinDeg: G.ba !== null ? +G.ba.toFixed(2) : +(180 - best.x[iJ]).toFixed(2), innerDeg: +G.inner.toFixed(2),
      lobeToSoleDeg: toeW ? +ang(G.lobe, toeW).toFixed(2) : null,
      toeAzimuthDeg: toeW ? +((Math.atan2(toeW[2] * sd, -toeW[0]) * 180) / Math.PI).toFixed(2) : null,
      soleCentreMM: cen.map((c) => +c.toFixed(4)), tipMM: G.tip.map((c) => +c.toFixed(4)), tipErrMM: tg || wf ? +wfErr(G).toFixed(4) : null,
      shoulderMM: G.a.map((c) => +c.toFixed(4)), limitExcess: +G.lim.toFixed(4),
      ...(G.td ? { tipPitchDeg: +((Math.asin(clamp(-G.td[1], -1, 1)) * 180) / Math.PI).toFixed(2) } : {}),
      // (round B4) the broad faces' tilt off the plane square to the front body's s (deg: 0 = the full width to a side
      // camera), the sole's centroid against the shoulder (HL), the side view's intra-fin angle (lobe to inner blade)
      faceLobeDeg: +((Math.asin(clamp(Math.abs(dot3(G.nL, sHead)), 0, 1)) * 180) / Math.PI).toFixed(2), faceBladeDeg: +((Math.asin(clamp(Math.abs(dot3(G.nB, sHead)), 0, 1)) * 180) / Math.PI).toFixed(2),
      contactAheadHL: +G.ahead.toFixed(4), contactOutHL: +G.outC.toFixed(4), intraSideDeg: +G.intra.toFixed(2),
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
 * The land arm as one leg in one plane (round B4; u1, B010, A005, B014, A070: the lobe's and the furled blade's broad
 * faces seen from the side, B3's forward-turned faces read as a stick on a ski): the plane through the shoulder that
 * holds the front body's s, tilted out `abduct` deg (its normal both faces' outer normal: their width runs along the
 * body) and turned `yaw` deg about the vertical (+ its front edge out); the lobe `tL` deg back from the plane's down,
 * the junction swept `sweep` deg in the blade's own plane (− toward its trailing edge: the blade forward, u1's V, the
 * intra-fin angle 180° − |sweep| on Pace & Gibb's land range 76–178°), the planted foot (fins.mjs 'plant', mode 'edge':
 * the furled distal blade bent forward in its plane) on the ground with its toe line level: (tL, sweep) by Newton on
 * the foot's height and pitch. The shoulder's channels are fitted to the plane's frame (fitChannels, in J_head's
 * frame, J_pecL's parent); the junction's flexion, the heel and the tips at 0. The right side the same channel values
 * (the axes mirror).
 * @param body the body's pose (propped, settled); @param g the ground (fish mm, posed)
 * @param o { abduct, yaw, tL, sweep (the Newton's start), raise (when `body` is not yet propped), side 'L' }
 * @returns { values: { J_pecL, J_pecFinL, J_pecMidL, J_pecTipL } (the left's), tL, sweep, heightMM, pitchDeg, converged }
 */
export function planeArm(body, g, o = {}) {
  const PL = { ...RIG.prop.plane, ...o }, D = Math.PI / 180, a = PL.abduct * D, yw = (PL.yaw ?? 0) * D;
  const AX = BODY_SCULPT.pectoral.axes, u0 = norm3(AX.u1), n0 = norm3(sub3(AX.n, mul3(u0, dot3(AX.n, u0))));
  const frame = (u, n) => { const x = norm3(u), y = norm3(sub3(n, mul3(x, dot3(n, x)))); return [x, y, cross3(x, y)]; };
  const between = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[0][c] * B[0][r] + A[1][c] * B[1][r] + A[2][c] * B[2][r]));
  const ry = (v) => [v[0] * Math.cos(yw) - v[2] * Math.sin(yw), v[1], v[0] * Math.sin(yw) + v[2] * Math.cos(yw)];
  const np = ry([0, Math.sin(a), Math.cos(a)]), dp = ry([0, -Math.cos(a), Math.sin(a)]), sA = ry([1, 0, 0]);
  const shoulder = (tL) => fitChannels('J_pecL', between(frame(u0, n0), frame(add3(mul3(dp, Math.cos(tL * D)), mul3(sA, Math.sin(tL * D))), np))).values;
  const sole = plantedSole('L'), toeB = BLADE.sole?.toe ?? [1, 0, 0];
  const base = o.raise ? proppedPose(o.raise, body) : body;
  const F = (tL, sw) => {
    const p = { ...base, J_pecL: shoulder(tL), J_pecFinL: { flexion: 0, sweep: sw } }, W = poseWorldHero(p);
    let lo = Infinity;
    for (const q of sole.points) lo = Math.min(lo, mvT(W.J_pecMidL, q)[1]);
    for (const q of sole.tipPoints) lo = Math.min(lo, mvT(W.J_pecTipL, q)[1]);
    for (const b of sole.blade) lo = Math.min(lo, mvT(W[b.joint], b.p)[1]);
    const t = norm3(rvT(W.J_pecMidL, toeB));
    return { h: lo - g, pitch: (Math.asin(clamp(t[1], -1, 1)) * 180) / Math.PI };
  };
  let x = [PL.tL ?? 45, PL.sweep ?? -90], f0 = F(x[0], x[1]);
  for (let it = 0; it < 50 && Math.hypot(f0.h, f0.pitch / 10) > 1e-6; it++) {
    const r = [f0.h, f0.pitch / 10];
    const Jc = [0, 1].map((i) => { const y = x.slice(); y[i] += 0.05; const f = F(y[0], y[1]); return [(f.h - f0.h) / 0.05, (f.pitch - f0.pitch) / 10 / 0.05]; });
    const det = Jc[0][0] * Jc[1][1] - Jc[1][0] * Jc[0][1] || 1e-12;
    const dx = [-(r[0] * Jc[1][1] - r[1] * Jc[1][0]) / det, -(Jc[0][0] * r[1] - Jc[0][1] * r[0]) / det], s = Math.min(1, 10 / (Math.hypot(...dx) || 1));
    x = [x[0] + s * dx[0], x[1] + s * dx[1]];
    f0 = F(x[0], x[1]);
  }
  const values = { J_pecL: shoulder(x[0]), J_pecFinL: { flexion: 0, sweep: +x[1].toFixed(3) }, J_pecMidL: { flex: 0 }, J_pecTipL: { flex: 0 } };
  return { values, tL: +x[0].toFixed(3), sweep: +x[1].toFixed(3), heightMM: +f0.h.toFixed(4), pitchDeg: +f0.pitch.toFixed(4), converged: Math.abs(f0.h) < 0.005 && Math.abs(f0.pitch) < 0.05 };
}

/**
 * The propped land pose at any front raise with the feet WELDED (round B4; the runtime's IDLE raise 10–25°, behaviour
 * §3.6: the soles stay put while the front rises or sinks): the reference land state (statePose 'land', RIG.prop.raise)
 * gives each foot's frame (J_pecMid's world transform: the planted foot rides it whole); at `raise` the body is propped
 * and laid on the ground again (settleOnGround) and each arm solved by solveArmPlant 'weld' with that frame held
 * (weldFrame J_pecMid), the broad faces kept square to the front body's s, seeded from the reference arm.
 * @param raise deg   @param o { tierMesh, fins, pelvic (as statePose), ref: statePose('land')'s result (else solved here) }
 * @returns { pose, ground, solved, weldErrMM, raise }
 */
export function propPose(raise, o = {}) {
  const ref = o.ref ?? statePose('land', o), Wr = poseWorldHero(ref.pose), pm = JOINTS[J.J_pecMidL].at;
  const to = [pm, add3(pm, [1, 0, 0]), add3(pm, [0, 1, 0])].map((q) => mvT(Wr.J_pecMidL, q));
  const eyes = { J_eyeL: { t: [0, RIG.eyeAlert, 0] }, J_eyeR: { t: [0, RIG.eyeAlert, 0] } }, body = { ...eyes };
  let g = ref.ground.y;
  if (o.tierMesh && RIG.bend?.land) {
    const st = settleOnGround(proppedPose(raise, { ...body, morph: structuredClone(STATE_MORPHS.land) }), { skin: o.tierMesh, fins: o.fins ?? {} }, RIG.bend.land);
    for (const [j, d] of Object.entries(st.deltas)) body[j] = { ...(body[j] ?? {}), pitch: +((body[j]?.pitch ?? 0) + d).toFixed(3) };
    g = st.groundMM;
  }
  // (the rear body stays where it lay: proppedPose turns the whole fish about J_root's pivot and bends the front back, so
  // the rear's place shifts with the raise; J_root's t puts the rear (J_sp3's pivot, behind the bend) back on the
  // reference's, the ground with it, so neither the belly nor the feet slide)
  { const p3 = JOINTS[J.J_sp3].at, a = mvT(Wr.J_sp3, p3), b = mvT(poseWorldHero(proppedPose(raise, body)).J_sp3, p3), d = sub3(a, b);
    body.J_root = { ...(body.J_root ?? {}), t: d.map((c) => +(c / HL).toFixed(6)) }; g += d[1]; }
  // (o.seedPose: a neighbouring raise's solution, the continuation propFrames walks)
  const sp = o.seedPose ?? ref.pose, seedV = { L: Object.fromEntries(['J_pecL', 'J_pecFinL', 'J_pecMidL', 'J_pecTipL'].map((j) => [j, sp[j]])), R: Object.fromEntries(['J_pecR', 'J_pecFinR', 'J_pecMidR', 'J_pecTipR'].map((j) => [j, sp[j]])) };
  const W = RIG.prop.weld ?? {};
  const sol = solveArmPlant(body, null, { y: g }, { raise, mode: 'weld', weldFrame: { joint: 'J_pecMid', to }, seed: seedV, seedOnly: true, lock: [['J_pecTip', 'flex']], prevW: W.prevW ?? 0.3, faceW: W.faceW ?? 3, bladeFaceW: W.bladeFaceW ?? 3, faceMax: W.faceMax ?? 8, junction: 0, junctionW: W.junctionW ?? 0.5, ...(W.sweep !== undefined ? { sweep: W.sweep, sweepW: W.sweepW ?? 1 } : {}), heelSink: 0, sole: { L: plantedSole('L'), R: plantedSole('R') } });
  if (o.pelvic?.targets?.names?.includes('press')) { const pr = pressPelvic(sol.pose, o.pelvic, g); sol.pose = pr.pose; sol.pelvic = pr.result; }
  sol.pose.morph = { ...structuredClone(STATE_MORPHS.land), ...sol.pose.morph };
  return { pose: sol.pose, ground: { y: +g.toFixed(4) }, solved: sol, weldErrMM: Math.max(sol.sides.L.tipErrMM, sol.sides.R.tipErrMM), raise };
}

/**
 * The welded prop's keyframes over the runtime's raise range (round B4; behaviour §3.6, IDLE 10–25°): propPose at each of
 * `raises` (deg), walked out from the reference raise each way, every solve seeded from its neighbour's, so a runtime
 * that interpolates the channels between two keyframes keeps the feet where they stood.
 * @param o as propPose (+ raises)
 * @returns [{ raise, pose, ground, weldErrMM }] by raise
 */
export function propFrames(o = {}) {
  const ref = o.ref ?? statePose('land', o), r0 = RIG.prop.raise, raises = o.raises ?? RIG.prop.raises ?? Array.from({ length: 13 }, (_, i) => 10 + 1.25 * i);
  // (every keyframe carries J_root's t, the reference's 0, so the channels interpolate alike)
  const p0 = structuredClone(ref.pose); p0.J_root = { ...(p0.J_root ?? {}), t: p0.J_root?.t ?? [0, 0, 0] };
  const out = [{ raise: r0, pose: p0, ground: ref.ground, weldErrMM: 0 }];
  for (const dir of [-1, 1]) {
    let seed = ref.pose;
    for (const r of raises.filter((x) => (x - r0) * dir > 0).sort((a, b) => dir * (a - b))) {
      const p = propPose(r, { ...o, ref, seedPose: seed });
      // (round T3: every key with the land state's eyes' gaze, statePose's default)
      if (ref.pose.gaze && !p.pose.gaze) p.pose.gaze = structuredClone(ref.pose.gaze);
      out.push({ raise: r, pose: p.pose, ground: p.ground, weldErrMM: p.weldErrMM, pelvic: p.solved.pelvic });
      seed = p.pose;
    }
  }
  return out.sort((a, b) => a.raise - b.raise);
}

/**
 * The land arm's plant with the foot flat on the ground `aheadMM` ahead of the shoulder (round B4; the crawl's touch-down):
 * planeArm's leg (the faces to the side) with the heel's in-plane ankle (J_pecMid sweep) as a third unknown, (tL, junction
 * sweep, ankle) by Newton on the foot's height, its toe line's pitch and its weld point's place ahead of the shoulder.
 * @returns as planeArm, + ankle, aheadMM
 */
export function plantArm(body, g, o = {}) {
  const PL = { ...RIG.prop.plane, ...o }, D = Math.PI / 180, a = PL.abduct * D, yw = (PL.yaw ?? 0) * D;
  const AX = BODY_SCULPT.pectoral.axes, u0 = norm3(AX.u1), n0 = norm3(sub3(AX.n, mul3(u0, dot3(AX.n, u0))));
  const frame = (u, n) => { const x = norm3(u), y = norm3(sub3(n, mul3(x, dot3(n, x)))); return [x, y, cross3(x, y)]; };
  const between = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[0][c] * B[0][r] + A[1][c] * B[1][r] + A[2][c] * B[2][r]));
  const ry = (v) => [v[0] * Math.cos(yw) - v[2] * Math.sin(yw), v[1], v[0] * Math.sin(yw) + v[2] * Math.cos(yw)];
  const np = ry([0, Math.sin(a), Math.cos(a)]), dp = ry([0, -Math.cos(a), Math.sin(a)]), sA = ry([1, 0, 0]);
  const shoulder = (tL) => fitChannels('J_pecL', between(frame(u0, n0), frame(add3(mul3(dp, Math.cos(tL * D)), mul3(sA, Math.sin(tL * D))), np))).values;
  const sole = o.sole ?? plantedSole('L'), toeB = BLADE.sole?.toe ?? [1, 0, 0], weldB = o.weldBind ?? sole.tip;
  const W0 = poseWorldHero(body), Th = W0.J_head, sH = norm3(rvT(Th, [1, 0, 0])), fw = norm3([-sH[0], 0, -sH[2]]);
  const sh = mvT(W0.J_pecL, JOINTS[J.J_pecL].at);
  // (o.furl: the furled crutch (the crawl's), no foot to level: the tip on the ground `aheadMM` ahead, the heel straight;
  // (tL, sweep) on those two)
  const n3 = o.furl ? 2 : 3;
  const vals = (x) => ({ J_pecL: shoulder(x[0]), J_pecFinL: { flexion: 0, sweep: x[1] }, J_pecMidL: { flex: 0, sweep: n3 === 3 ? x[2] : 0 }, J_pecTipL: { flex: 0 } });
  const F = (x) => {
    const W = poseWorldHero({ ...body, ...vals(x) });
    let lo = Infinity;
    for (const q of sole.points) lo = Math.min(lo, mvT(W.J_pecMidL, q)[1]);
    for (const q of sole.tipPoints) lo = Math.min(lo, mvT(W.J_pecTipL, q)[1]);
    for (const b of sole.blade) lo = Math.min(lo, mvT(W[b.joint], b.p)[1]);
    const t = norm3(rvT(W.J_pecMidL, toeB)), wp = mvT(W.J_pecMidL, weldB);
    // (o.onWeld: the weld point itself on the ground (the crawl's touch-down on its tip) instead of the lowest point)
    if (o.furl) return [wp[1] - g, (dot3(sub3(wp, sh), fw) - (o.aheadMM ?? 7)) / 2];
    return [(o.onWeld ? wp[1] : lo) - g, ((Math.asin(clamp(t[1], -1, 1)) * 180) / Math.PI - (o.pitchDeg ?? 0)) / 10, (dot3(sub3(wp, sh), fw) - (o.aheadMM ?? 7)) / 2];
  };
  // (Levenberg–Marquardt within the leg's bounds: the lobe 10–70° back, the junction 0 … −110°, the ankle ±45°)
  const lo3 = [10, -110, -45].slice(0, n3), hi3 = [70, 0, 45].slice(0, n3), cl = (y) => y.map((v, i) => clamp(v, lo3[i], hi3[i])), ix = [...Array(n3).keys()];
  let x = cl([PL.tL ?? 40, PL.sweep ?? -80, PL.ankle ?? 0].slice(0, n3)), f0 = F(x), c0 = f0.reduce((s, v) => s + v * v, 0), lam = 1e-3;
  for (let it = 0; it < 80 && c0 > 1e-12; it++) {
    const Jc = ix.map((i) => { const y = x.slice(); y[i] += 0.05; const f = F(y); return f.map((v, k) => (v - f0[k]) / 0.05); });
    const A = ix.map((i) => ix.map((j) => Jc[i].reduce((s, v, k) => s + v * Jc[j][k], 0))), gv = ix.map((i) => Jc[i].reduce((s, v, k) => s + v * f0[k], 0));
    let ok = false;
    for (let tr = 0; tr < 10 && !ok; tr++) {
      const dx = solveN(A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lam) + 1e-9 : v))), gv.map((v) => -v)), y = cl(x.map((v, i) => v + dx[i])), fy = F(y), cy = fy.reduce((s, v) => s + v * v, 0);
      if (cy < c0) { x = y; f0 = fy; c0 = cy; lam = Math.max(1e-7, lam / 3); ok = true; } else lam *= 4;
    }
    if (!ok) break;
  }
  const values = vals(x);
  return { values, tL: +x[0].toFixed(3), sweep: +x[1].toFixed(3), ankle: n3 === 3 ? +x[2].toFixed(3) : 0, heightMM: +f0[0].toFixed(4), pitchDeg: n3 === 3 ? +(f0[1] * 10).toFixed(4) : null, aheadErrMM: +(f0[n3 - 1] * 2).toFixed(4), converged: Math.hypot(...f0) < 0.005 };
}

/**
 * The crawl as a full cycle a runtime can loop (round B4; Pace & Gibb 2009, behaviour §3.1: both fins together, the duty
 * ≈ 0.6, 93 % of the forward motion in the stance, the weight on the pelvic cup in the recovery): `frames` keyframes over
 * one cycle (phase 0 → 1; linear interpolation of the channels between them keeps every gate, out/pectoral t_crawl.mjs):
 *   stance (phase 0 … duty)  both crutches (the furled blades, J_pecTip held at 0) on their distal tips, which ROLL on
 *     the mud (the bearing vertex welded where it touched, the contact passed to the next vertex the crutch's turn brings
 *     down: no contact slides, none goes under), while the body vaults: in [0, lift] it rises `vaultMM` straight up, in
 *     [lift, duty − set] it moves `strideMM` forward (smootherstep) with its axis straight and head-up by the land raise
 *     (`raiseDeg`), in [duty − set, duty] it is set down straight on the pelvic cup and the belly; each arm by
 *     solveArmPlant 'weld' in the stroke plane (the lobe, the inner and the distal blade square to a plane through the
 *     shoulder holding the body's heading, tilted out `abduct`: the broad faces stay to the side), the distal blade's
 *     angle in it turned one way from `thetaFrom` to `thetaTo`, the junction's in-plane sweep from `sweepFrom` (the V,
 *     intra-fin 90°) to `sweepTo` (straight, 175°: Pace & Gibb's 76° → 178°), inside the clean limits
 *   recovery (duty … 1)  the body still on the cup and the belly, each crutch's touch-down vertex carried on an arc
 *     (`clearMM` up at its middle, the whole blade over the mud) to its next spot `strideMM` ahead, its channels pulled
 *     toward the touch-down's, so phase 1 is phase 0 of the next cycle with the body `strideMM` further on
 * The tail is held straight back and lifted clear with the whole body in the stance (Itoh 1999 saw P. modestus lift its
 * caudal while it moved on its pectorals; McInroe 2016: on level ground the tail is held straight back and not used): a
 * tail touching the mud while the body moves would slide.
 * @param tierMesh the tier's skin { position, skin, names } (the ground); o.tier 'lod1' for lod1's own furled blade
 * @param o RIG.crawl overrides; land: statePose('land')'s result (its body), fins / pelvic (as statePose takes them)
 * @returns { frames: [{ phase, pose, contacts: { weld: { L, R } | null, vertex, transfers, ground: [names] }, tipErrMM }],
 *   weldMM / weldRMM (the touch-down's contacts, world), weldBind (the touch-down vertex, bind), strideMM, cycleS, duty,
 *   speedBLs, ground, schedule }
 */
export function crawlCycle(tierMesh, o = {}) {
  const C = { ...RIG.crawl, ...(o.tier && RIG.crawl[o.tier] ? RIG.crawl[o.tier] : {}), ...o };
  const lock = [['J_pecTip', 'flex']];
  const eyes = { J_eyeL: { t: [0, RIG.eyeAlert, 0] }, J_eyeR: { t: [0, RIG.eyeAlert, 0] } };
  // the body at rest (the land state's: the front raised, the rear and the folded caudal on the mud, the pelvic pressed)
  const land = o.land ?? statePose('land', { tierMesh, fins: o.fins, pelvic: o.pelvic });
  // (at the crawl's own raise `raiseDeg`: propPose's body, the rear where the land state's lay)
  const base = C.raiseDeg !== undefined && C.raiseDeg !== RIG.prop.raise ? propPose(C.raiseDeg, { tierMesh, fins: o.fins, pelvic: o.pelvic, ref: land }) : land;
  const rest = {};
  for (const [j, e] of Object.entries(base.pose)) if (!/^J_pec/.test(j) && j !== 'morph') rest[j] = structuredClone(e);
  Object.assign(rest, eyes);
  const g = base.ground.y, morph = structuredClone(base.pose.morph);
  morph.Fin_Pectoral_L = { furl: 1 }; morph.Fin_Pectoral_R = { furl: 1 };
  // the crutch: the blade furled (Pace & Gibb 2009: the rays furled on land, the fin's tip the contact). Its distal part
  // (beyond the heel: J_pecMid's and J_pecTip's, one rigid piece with J_pecTip held at 0) ROLLS on the mud: every vertex
  // of the tier's furled blade there is a candidate contact; the lowest one is welded where it touched (its `spot`) and
  // when the crutch's turn brings another below the mud, the contact passes to it where it touches (a polygon rolling
  // without slip: no contact vertex moves while it bears, none goes under). The inner blade (J_pecFin's) is kept over
  // the mud by the solve. The left arm is solved, the right mirrors it (the body is straight).
  const plane = { ...(C.abduct !== undefined ? { abduct: C.abduct } : {}), ...(C.yaw !== undefined ? { yaw: C.yaw } : {}) };
  const sTier = C.tier === 'lod1' ? 'lod1' : 'hero', sole = plantedSole('L', { state: 'furl', tier: sTier, every: sTier === 'hero' ? 2 : 1 });
  const distal = plantedSole('L', { state: 'furl', tier: sTier, every: 1 }).blade.filter((b) => b.joint !== 'J_pecFinL').map((b) => b.p);
  const shaft = sole.blade.filter((b) => b.joint === 'J_pecFinL');
  const soleOf = (tipB, whole = false) => ({ ...sole, blade: whole ? sole.blade : shaft, tip: tipB, tipJoint: 'J_pecMidL' });
  // the touch-down's first guess: the furled tip (fins.mjs def.furl.tip) on the mud `aheadMM` ahead of the shoulder with
  // the leg in the land state's plane (plantArm); the rolling solve below then lifts the inner blade off the mud
  const pa = plantArm(rest, g, { ...plane, aheadMM: C.aheadMM, furl: true, sole, weldBind: sole.tip, tL: 25, sweep: -70 });
  // (a first guess only: the touch-down's contact is where the rolled solve puts it; a plant short of `aheadMM` by a
  // fraction of a mm is kept, a wrong one is not)
  if (Math.abs(pa.heightMM) > 0.3 || Math.abs(pa.aheadErrMM) > 1) throw new Error(`crawlCycle: the touch-down did not converge (${JSON.stringify(pa)})`);
  const leftOf = (p) => Object.fromEntries(Object.entries(p).filter(([j]) => /^J_pec.*L$/.test(j)));
  const mirrorVals = (v) => Object.fromEntries(Object.entries(v).map(([j, c]) => [j.replace(/L$/, 'R'), structuredClone(c)]));
  const armOf = (v) => ({ ...v, ...mirrorVals(v) });
  const posture = { faceW: C.faceW, bladeFaceW: C.bladeFaceW, faceMax: C.faceMax, junction: 0, junctionW: C.junctionW, heelSink: 0, lock, prevW: C.prevW, weldK: C.weldK, flat: 0, tipFlat: 0, toeW: 0, ...(C.planeW ? { planeW: C.planeW } : {}) };
  // the body's profile: forward (−s, mm) and up (mm) over the cycle
  const ss = (u) => { const t = clamp(u, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  const D = C.duty, Lf = C.lift, St = C.set;
  const fwdAt = (ph) => (ph <= D ? C.strideMM * ss((ph - Lf) / (D - Lf - St)) : C.strideMM);
  const upAt = (ph) => (ph >= D ? 0 : C.vaultMM * Math.min(ss(ph / Lf), ss((D - ph) / St)));
  const t0 = rest.J_root?.t ?? [0, 0, 0];
  const bodyAt = (ph) => { const b = structuredClone(rest); b.J_root = { ...(b.J_root ?? {}), t: [t0[0] - fwdAt(ph) / HL, t0[1] + upAt(ph) / HL, t0[2]] }; return b; };
  // the stroke plane (world): through the shoulder, holding the body's heading on the ground, tilted out `abduct` deg
  // (planeArm's land plane, yaw 0, but square to the ground's forward so the body's travel stays in it); the distal
  // blade's angle in it from `thetaFrom` at the touch-down (bent forward in the V) to `thetaTo` at the lift-off (the arm
  // straight back): it turns one way through the stance, so the contact rolls one way over the furled tip
  const sk = (() => { const Th = poseWorldHero(rest).J_head, sH = norm3(rvT(Th, [1, 0, 0])), fw = norm3([-sH[0], 0, -sH[2]]), out = [fw[2], 0, -fw[0]], a = ((C.abduct ?? RIG.prop.plane.abduct) * Math.PI) / 180;
    return { fwd: fw, n: add3(mul3([0, 1, 0], Math.sin(a)), mul3(out, Math.cos(a))), down: add3(mul3([0, 1, 0], -Math.cos(a)), mul3(out, Math.sin(a))) }; })();
  const thetaAt = (ph) => (ph <= D ? C.thetaFrom + (C.thetaTo - C.thetaFrom) * clamp(fwdAt(ph) / C.strideMM, 0, 1) : C.thetaTo + (C.thetaFrom - C.thetaTo) * ss((ph - D) / (1 - D)));
  const strokeAt = (ph) => ({ ...sk, W: C.strokeW, theta: thetaAt(ph), thetaW: C.thetaW });
  // (the junction's in-plane sweep through the stance: Pace & Gibb 2009's intra-fin angle 76° → 178° on land, the blade
  // bent forward in a V at the touch-down and straight behind at the lift-off, 180° − |sweep|; back again in the recovery)
  const sweepAt = (ph) => (ph <= D ? C.sweepFrom + (C.sweepTo - C.sweepFrom) * clamp(fwdAt(ph) / C.strideMM, 0, 1) : C.sweepTo + (C.sweepFrom - C.sweepTo) * ss((ph - D) / (1 - D)));
  const solveL = (body, tipB, target, seed, extra = {}, whole = false) => {
    const sol = solveArmPlant(body, null, { y: g }, { ...posture, ...extra, sides: ['L'], mode: 'weld', target: { L: target }, sole: { L: soleOf(tipB, whole) }, seed: { L: seed }, seedOnly: true });
    return { vals: leftOf(sol.pose), err: sol.sides.L.tipErrMM, side: sol.sides.L };
  };
  const lowest = (body, vals) => {
    const W = poseWorldHero({ ...body, ...vals }); let q = -1, y = Infinity, at = null;
    for (let i = 0; i < distal.length; i++) { const w = mvT(W.J_pecMidL, distal[i]); if (w[1] < y) { y = w[1]; q = i; at = w; } }
    return { q, y, at };
  };
  // (one stance frame: the contact welded, passed on while another distal vertex is under the mud)
  const roll = (body, piv, seed, ph) => {
    let s = null, transfers = 0;
    for (let it = 0; it < C.rollIters; it++) {
      s = solveL(body, distal[piv.i], [piv.spot[0], g, piv.spot[1]], seed, { sweep: sweepAt(ph), sweepW: C.sweepW, stroke: strokeAt(ph) });
      const lo = lowest(body, s.vals);
      if (lo.y >= g - C.rollTol || lo.q === piv.i) break;
      piv = { i: lo.q, spot: [lo.at[0], lo.at[2]] }; transfers++; seed = s.vals;
    }
    return { ...s, piv, transfers };
  };
  const nearest = (p) => { let q = 0, d = Infinity; distal.forEach((b, i) => { const e = Math.hypot(...sub3(b, p)); if (e < d) { d = e; q = i; } }); return q; };
  // the touch-down (phase 0): rolled from the plant's tip
  const W0 = poseWorldHero({ ...rest, ...pa.values }), tip0 = mvT(W0.J_pecMidL, sole.tip);
  const td = roll(rest, { i: nearest(sole.tip), spot: [tip0[0], tip0[2]] }, pa.values, 0);
  const piv0 = td.piv, arms0 = td.vals;
  const N = C.frames, frames = [], stanceN = Math.round(N * D);
  const contact = (piv) => ({ L: [piv.spot[0], g, piv.spot[1]].map((c) => +c.toFixed(4)), R: [piv.spot[0], g, -piv.spot[1]].map((c) => +c.toFixed(4)) });
  frames.push({ phase: 0, vals: arms0, err: td.err, piv: piv0, transfers: td.transfers });
  let prev = arms0, piv = piv0;
  for (let i = 1; i <= stanceN; i++) {
    const r = roll(bodyAt(i / N), piv, prev, i / N);
    frames.push({ phase: i / N, vals: r.vals, err: r.err, piv: r.piv, transfers: r.transfers });
    prev = r.vals; piv = r.piv;
  }
  // the recovery: the touch-down's contact vertex carried on an arc (`clearMM` up at its middle) from where the stance
  // left it to its next spot `strideMM` ahead, the whole blade `liftMM` … over the mud; its channels pulled toward the
  // touch-down's over the second half, so phase 1 is phase 0 of the next cycle
  const bEnd = bodyAt(D), Pend = mvT(poseWorldHero({ ...bEnd, ...prev }).J_pecMidL, distal[piv0.i]);
  const lerpV = (A, B, w) => Object.fromEntries(Object.entries(A).map(([j, e]) => [j, Object.fromEntries(Object.entries(e).map(([c, v]) => [c, v + ((B[j]?.[c] ?? v) - v) * w]))]));
  for (let i = stanceN + 1; i < N; i++) {
    const ph = i / N, u = (ph - D) / (1 - D), e = ss(u), up = C.clearMM * Math.sin(Math.PI * u);
    const tgt = [Pend[0] + (piv0.spot[0] - C.strideMM - Pend[0]) * e, Pend[1] + (g - Pend[1]) * e + up, Pend[2] + (piv0.spot[1] - Pend[2]) * e];
    const seed = lerpV(prev, arms0, ss((u - 0.4) / 0.6));
    const s = solveL(bodyAt(ph), distal[piv0.i], tgt, seed, { clearMM: Math.max(0, Math.min(C.clearMM, up) - C.clearSlack), sweep: sweepAt(ph), sweepW: C.sweepW, stroke: strokeAt(ph) }, true);
    frames.push({ phase: ph, vals: s.vals, err: s.err, piv: null });
    prev = s.vals;
  }
  frames.push({ phase: 1, vals: arms0, err: 0, piv: null });
  const out = frames.map((f) => {
    const stance = f.phase <= D + 1e-9;
    return { phase: +f.phase.toFixed(5), pose: { ...bodyAt(f.phase), ...armOf(f.vals), morph: structuredClone(morph) }, tipErrMM: +(f.err ?? 0).toFixed(4), contacts: { weld: stance && f.piv ? contact(f.piv) : null, ...(stance && f.piv ? { vertex: f.piv.i, transfers: f.transfers } : {}), ground: stance && upAt(f.phase) > 0.05 ? [] : ['belly', 'pelvic', 'caudal'] } };
  });
  const schedule = {
    stance: [0, D], lift: [0, Lf], push: [Lf, D - St], setDown: [D - St, D], recovery: [D, 1],
    note: 'phase 0: both crutches touched down (the furled blades\' distal tips), the body on the pelvic cup and the belly; lift: the body rises straight up off the mud on the crutches; push: the body moves strideMM forward, vaulted (belly, pelvic cup and tail clear); set-down: lowered straight onto the cup and the belly; through the stance each crutch rolls on its distal tip (contacts.weld: the bearing vertex\'s spot on the mud; contacts.vertex: its index in the tier\'s furled distal blade); recovery: the body still, each crutch lifted on an arc clearMM over the mud and touched down strideMM ahead (phase 1 = phase 0 of the next cycle, J_root t + strideMM forward)',
  };
  const weld0 = contact(piv0);
  return { plantNote: { tL: pa.tL, sweep: pa.sweep, converged: pa.converged }, frames: out, weldMM: weld0.L, weldRMM: weld0.R, weldBind: distal[piv0.i].map((c) => +c.toFixed(4)), contactVertexBind: distal[piv0.i].map((c) => +c.toFixed(4)), strideMM: C.strideMM, cycleS: C.cycleS, duty: D, speedBLs: +(C.strideMM / 80 / C.cycleS).toFixed(4), ground: +g.toFixed(4), plant: pa, schedule };
}

/** The crawl's keyframes (compatibility with build.mjs' round B3 call): crawlCycle's frames with `phase` over the whole
 * cycle, `weld` the left weld point at phase 0 (world mm), `strideMM`, `ground`, and the cycle's schedule. */
export function crawlFrames(tierMesh, o = {}) {
  const C = crawlCycle(tierMesh, o);
  return { ...C, frames: C.frames.map((f) => ({ ...f, raise: RIG.prop.raise })), weld: C.weldMM };
}

const CYCLES = new Map();
/**
 * The crawl's pose at any phase (round B4; the runtime's loop): the cycle's keyframes (crawlCycle on the tier's skin,
 * cached per tier and stride, or o.cycle) interpolated linearly (the channels and J_root's t), the whole cycles before it
 * adding `strideMM` each to J_root's t (phase 2.25: the third cycle, a quarter in).
 * @param phase cycles (any real ≥ 0)   @param o { stride (mm), tier, tierMesh (to solve a cycle), cycle, land, fins, pelvic }
 * @returns { pose, stance (bool), contacts: { weld: { L, R } (world mm, this cycle's) | null, ground: [names] } }
 */
export function crawlPose(phase, o = {}) {
  const key = `${o.tier ?? 'hero'}:${o.stride ?? RIG.crawl.strideMM}`;
  let C = o.cycle ?? CYCLES.get(key);
  if (!C) {
    if (!o.tierMesh) throw new Error('crawlPose: give o.cycle (crawlCycle\'s result, e.g. the GLB extras) or o.tierMesh to solve it');
    C = crawlCycle(o.tierMesh, { tier: o.tier, strideMM: o.stride ?? RIG.crawl.strideMM, land: o.land, fins: o.fins, pelvic: o.pelvic });
    CYCLES.set(key, C);
  }
  const n = Math.floor(phase), f = phase - n, F = C.frames, k = Math.min(F.length - 2, Math.floor(f * (F.length - 1))), t = f * (F.length - 1) - k;
  const A = F[k].pose, B = F[k + 1].pose, pose = structuredClone(A);
  for (const [j, e] of Object.entries(B)) {
    if (j === 'morph' || !e || typeof e !== 'object' || Array.isArray(e)) continue;
    pose[j] ??= {};
    for (const [c, v] of Object.entries(e)) {
      const a = A[j]?.[c];
      pose[j][c] = Array.isArray(v) ? v.map((x, i) => (a?.[i] ?? 0) + (x - (a?.[i] ?? 0)) * t) : (a ?? 0) + (v - (a ?? 0)) * t;
    }
  }
  pose.J_root = { ...(pose.J_root ?? {}), t: [(pose.J_root?.t?.[0] ?? 0) - (n * C.strideMM) / HL, pose.J_root?.t?.[1] ?? 0, pose.J_root?.t?.[2] ?? 0] };
  const stance = f <= C.duty;
  const shift = (p) => (p ? [p[0] - n * C.strideMM, p[1], p[2]] : null);
  return { pose, stance, contacts: { weld: F[k].contacts.weld ? { L: shift(F[k].contacts.weld.L), R: shift(F[k].contacts.weld.R) } : null, ground: F[k].contacts.ground } };
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
  reach: { Fin_Pectoral_L: { spread: 0.5 }, Fin_Pectoral_R: { spread: 0.5 }, Fin_Caudal: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Dorsal2: { fold: 0.3 } },
  rest: { Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Caudal: { fold: 1 }, Fin_Pectoral_L: { furl: 1 }, Fin_Pectoral_R: { furl: 1 }, Fin_Pelvic: { fold: 1 } },
  water: { Fin_Pectoral_L: { spread: 1 }, Fin_Pectoral_R: { spread: 1 }, Fin_Caudal: { spread: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.8 }, Fin_Anal: { fold: 0.8 } },
};
// (round B4, fins P4: B3's water spread the caudal into a fan, but its reference photo shows the bottom rest under water:
// A061, A060, A029, behaviour §3.3 "the fish lies flat, pectorals fanned sideways and forward like paddles, median fins
// folded, tail straight": the caudal closed into a long spear (its side-view depth 2.16 → 1.06 × the peduncle's), every
// median fin and the pelvic cup folded, the pectorals as the paddle state has them. The swimming fish (behaviour §3.3:
// carangiform, the caudal's thrust, the paddles spread, D2 and the anal fin half raised) is the separate `swim` state)
Object.assign(STATE_MORPHS, {
  water: { ...Object.fromEntries(Object.entries(STATE_MORPHS.water).filter(([k]) => /^Fin_Pectoral_/.test(k))), Fin_Caudal: { fold: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 1 }, Fin_Anal: { fold: 1 }, Fin_Pelvic: { fold: 1 } },
  swim: { ...Object.fromEntries(Object.entries(STATE_MORPHS.water).filter(([k]) => /^Fin_Pectoral_/.test(k))), Fin_Caudal: { spread: 1 }, Fin_Dorsal1: { fold: 1 }, Fin_Dorsal2: { fold: 0.5 }, Fin_Anal: { fold: 0.5 }, Fin_Pelvic: { fold: 1 } },
});

/** The states solved on a tier mesh (the ground, the planted arms, the settled body): a bare statePose call answers them
 * from the shipped file (round B4). */
export const SOLVED_STATES = ['land', 'reach', 'rest'];
/** No tier mesh, ground, hero result or body pose: nothing to solve with. */
const isBare = (o = {}) => !(o.tierMesh || o.ground || o.hero || o.pose || o.fins || o.pelvic || o.pressPelvic);
const SHIPPED = new Map();
/** The shipped states file (build.mjs writes it beside the tier GLBs: { [tier]: { [state]: { pose, groundMM, … }, crawl,
 * transitions } }): `file`, else $TOBIHAZE_STATES, else out/tiers/states.json next to this module. */
export function shippedStates(file = null) {
  const f = file ?? process.env.TOBIHAZE_STATES ?? fileURLToPath(new URL('./out/tiers/states.json', import.meta.url));
  if (!SHIPPED.has(f)) {
    if (!fs.existsSync(f)) throw new Error(`statePose: called without a tier mesh, and no shipped states at ${f} (run build.mjs, or pass o.tierMesh / o.statesFile)`);
    SHIPPED.set(f, JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return SHIPPED.get(f);
}
/** One state of one tier as the build shipped it: { pose, ground: { y }, shipped } (round B4, poses P4: statePose's
 * answer without a tier mesh, so the shots, the tests and contactsFor read the poses the GLBs carry). */
export function shippedState(state, tier = 'hero', file = null) {
  const S = shippedStates(file)[tier]?.[state];
  if (!S?.pose) throw new Error(`statePose: no shipped '${state}' for ${tier} (run build.mjs, or pass o.tierMesh)`);
  return { pose: structuredClone(S.pose), ground: Number.isFinite(S.groundMM) ? { y: S.groundMM, from: 'shipped' } : null, shipped: true };
}

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
 *   water  the bottom rest under water (round B4; A061, A060, A029, behaviour §3.3): the body straight, the paddles beside
 *          the flank, out and forward (RIG.water's channels), their fans spread, the caudal closed into a spear, every
 *          median fin and the pelvic cup folded (B3's water, with the swim wave and the caudal fan, is now `swim`)
 *   swim   swimming (behaviour §3.3, carangiform): half of the rig's swim wave over the rear two thirds, the paddles as in
 *          the water, the caudal spread, D1 folded, D2 and the anal fin half raised
 * Called bare (no tier mesh, ground, hero result or pose) for a state solved on a mesh, or for a lighter tier, the build's
 * shipped pose (shippedState), so every caller reads the same poses (round B4).
 * Round T3 (key tech; the eye findings' P7): every state's pose carries the eyes' default gaze, `gaze: { L, R }` (AXES
 * eyes.*.gaze.default: behaviour §3.9's rest window 55° out and 15° up, from the bind window's B2/B4 rest — yaw 16.7°,
 * pitch 2.8°), so the GLBs' states, states.json and the sheets look where the fish looks without a hand-applied gaze; the
 * near tiers' Eye nodes take it (the viewer's applyPose, the runtime), lod2 (no eye nodes) none.
 * @returns { pose (with `morph` and `gaze`), ground? (land, reach: from solveArmPlant), solved? }
 */
export function statePose(state, tier = 'hero', o = {}) {
  const r = statePoseOf(state, tier, o);
  const t = tier && typeof tier === 'object' ? 'hero' : tier;
  if (r?.pose && t !== 'lod2' && !r.pose.gaze) r.pose.gaze = defaultGaze();
  return r;
}
/** The eyes' default gaze per side (AXES eyes.*.gaze.default, yaw and pitch in degrees: the Eye nodes' own channels). */
export function defaultGaze() {
  const g = (S) => { const d = AXES.eyes?.[S]?.gaze?.default ?? {}; return { yaw: d.yaw ?? 0, pitch: d.pitch ?? 0 }; };
  return { L: g('L'), R: g('R') };
}
function statePoseOf(state, tier = 'hero', o = {}) {
  // (round B3: statePose(state, tier, o); statePose(state, o) is the hero's. A lighter tier's is the hero's carried over:
  // o.hero, the hero's result, or solved here)
  if (tier && typeof tier === 'object') { o = tier; tier = 'hero'; }
  // (round B4, poses P4: called bare (no tier mesh, ground, hero result or body pose), the states the build solved on the
  // hero's tier mesh and shipped (shippedState: out/tiers/states.json, every tier's own entry), so a bare call answers the
  // same pose as the GLBs' extras; B3's bare 'rest' was the unsettled one and its bare 'land' threw. The water and the
  // swim need no mesh and are solved here on the hero as before)
  if (isBare(o) && (tier !== 'hero' || SOLVED_STATES.includes(state))) return shippedState(state, tier, o.statesFile);
  if (tier !== 'hero') return stateForTier(o.hero ?? statePose(state, 'hero', o), tier, o);
  const both = (j, v) => ({ [`${j}L`]: v, [`${j}R`]: structuredClone(v) });
  if (state === 'water' || state === 'swim') {
    const amp = [1, 2, 3.5, 5, 6.5, 7.5, 8, 9], Wt = RIG.water;
    // (round B4: the water state is the bottom rest under water, A061: the body straight; the swim keeps B3's half wave)
    const wave = state === 'swim' ? Object.fromEntries(SPINE_BEND.map((j, i) => [j, { yaw: +(amp[i] * Math.sin(0.3 + i)).toFixed(2) }])) : {};
    return { pose: { ...wave, ...both('J_pec', { swing: Wt.swing, protraction: Wt.protraction, depression: Wt.depression, twist: Wt.twist }), ...both('J_pecFin', { flexion: Wt.junction, sweep: Wt.sweep ?? 0 }), morph: structuredClone(STATE_MORPHS[state]) } };
  }
  if (state === 'rest') {
    const pose = { morph: structuredClone(STATE_MORPHS.rest) }, Rr = RIG.rest;
    // (round B4) the arm down and back to the mud, the furled blade flat on it (A030): RIG.rest.arm where no tier mesh
    // is given, else solved on the settled body (below)
    for (const S of ['L', 'R']) for (const [j, v] of Object.entries(Rr.arm)) pose[`${j}${S}`] = { ...v };
    // (round B3) the whole underside laid on the ground (settleOnGround, RIG.bend.rest: B2's prone fish lay on its folded
    // pelvic fin with the rear third floating, the peduncle 1.46 mm and the caudal 1.44 mm over the mud; A030, B067)
    if (o.tierMesh && RIG.bend?.rest) {
      // (round B4: the pectorals left out of the settle: the arms are laid on the ground it finds)
      const finsNoPec = Object.fromEntries(Object.entries(o.fins ?? {}).filter(([k]) => !/^Fin_Pectoral_/.test(k)));
      const st = settleOnGround(pose, { skin: o.tierMesh, fins: finsNoPec }, RIG.bend.rest);
      const body = Object.fromEntries(Object.entries(st.pose).filter(([j]) => !/^J_pec/.test(j)));
      const sol = solveArmPlant(body, null, { y: st.groundMM + Rr.lift }, { mode: 'prop', sides: ['L'], sole: { L: plantedSole('L', { state: 'flat', morph: { furl: 1 } }) }, prop: { face: false, lobeFwd: Rr.lobeFwd, lobeOut: Rr.lobeOut, heelSink: 0, toeAz: 0 }, junction: Rr.junction, lock: [['J_pecTip', 'flex']], seed: { L: Object.fromEntries(Object.entries(Rr.arm).map(([j, v]) => [`${j}L`, v])) } });
      const L = Object.fromEntries(Object.entries(sol.pose).filter(([j]) => /^J_pec.*L$/.test(j)));
      const out = { ...st.pose, ...L, ...Object.fromEntries(Object.entries(L).map(([j, v]) => [j.replace(/L$/, 'R'), structuredClone(v)])), morph: pose.morph };
      return { pose: out, ground: { y: st.groundMM, from: 'settleOnGround (the lowest posed point)' }, settled: st, arm: sol.sides.L };
    }
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
    if (state === 'land' && RIG.prop.plane) {
      // (round B4: the planar leg, planeArm; solveArmPlant with every channel held reports its contact and posture)
      const body = proppedPose(RIG.prop.raise, { ...eyes, ...(o.pose ?? {}) });
      let g = o.ground?.y;
      if (g === undefined) { const keep = notArm(o.tierMesh), s1 = JOINTS[J.J_sp1].at[0]; g = lowestPosed(o.tierMesh, poseWorldHero(body), (v) => keep(v) && o.tierMesh.position[v * 3] > s1).y; }
      const pa = planeArm(body, g, o.plane ?? {});
      const fixed = { L: pa.values };
      sol = solveArmPlant(body, null, { y: g }, { prop: { face: true }, fixed, seed: { L: pa.values, R: pa.values }, seedOnly: true, pelvic: o.pelvic ?? null });
      sol.plane = { tL: pa.tL, sweep: pa.sweep, heightMM: pa.heightMM, pitchDeg: pa.pitchDeg, converged: pa.converged };
    } else if (state === 'land') sol = solveArmPlant({ ...eyes, ...(o.pose ?? {}) }, o.tierMesh ?? null, o.ground ?? null, { raise: RIG.prop.raise, pelvic: o.pelvic ?? null });
    else {
      // (round B4) the reach (A023, A070): the half-spread fan laid flat on the mud ahead (plantedSole 'flat'), the lobe
      // toward forward-down, the fan's centre `aheadHL` ahead of and `outHL` out of the shoulder; the left solved, the
      // right mirrored
      const Rc = RIG.reach, body = proppedPose(Rc.raise, { ...eyes, ...(o.pose ?? {}) });
      let g = o.ground?.y;
      if (g === undefined) { const keep = notArm(o.tierMesh), s1 = JOINTS[J.J_sp1].at[0]; g = lowestPosed(o.tierMesh, poseWorldHero(body), (v) => keep(v) && o.tierMesh.position[v * 3] > s1).y; }
      const one = solveArmPlant(body, null, { y: g + Rc.lift }, { sides: ['L'], sole: { L: plantedSole('L', { state: 'flat', morph: { spread: Rc.spread } }) }, prop: { face: true, flexion: Rc.junction, faceW: 0, bladeFaceW: 0, lobeFwd: Rc.lobeFwd, lobeOut: Rc.lobeOut, aheadHL: Rc.aheadHL, outHL: Rc.outHL, contactW: Rc.contactW, toeW: 0, planeW: 0, junctionW: 0.2, sweep: Rc.sweep, sweepW: Rc.sweepW, heelSink: 0, seed: Rc.seed }, lock: [['J_pecTip', 'flex']] });
      const L = Object.fromEntries(Object.entries(one.pose).filter(([j]) => /^J_pec.*L$/.test(j)));
      sol = { ...one, pose: { ...one.pose, ...Object.fromEntries(Object.entries(L).map(([j, v]) => [j.replace(/L$/, 'R'), structuredClone(v)])) }, ground: { y: +g.toFixed(4), from: o.ground ? 'given' : 'the skin\'s lowest under the rear' } };
      sol.pose.morph = { ...(sol.pose.morph ?? {}), Fin_Pectoral_L: { spread: Rc.spread }, Fin_Pectoral_R: { spread: Rc.spread } };
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
  // (round B4: the trunk key's press family, fins.mjs def.presses (pressLow, press, pressHigh, pressDeep by their depth
  // under the bases), blended along the family at J_pelvic 0: pressFamily)
  const fam = pelvicPressFamily(pelvic);
  if (fam.length > 1) return pressFamily(pose, pelvic, g, fam);
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

/** J_pelvic's clean ranges for the cup's blend-shape weights ({ fold, spread, press… }: AXES J_pelvic `coupled`, round
 * B4): { pitch: [lo, hi], roll: [lo, hi], cornerSum (|roll|/end + max(0, pitch)/end ≤ it), from: the entries applied }. */
export function pelvicRange(w = {}, A = AXES.joints.J_pelvic) {
  const on = A.coupled.filter((c) => c.morph && c.morph.reduce((s, k) => s + (w[k] ?? 0), 0) >= c.min);
  const use = on.length ? on : A.coupled.filter((c) => c.bare);
  const cut = (k) => use.reduce((r, c) => [Math.max(r[0], c[k][0]), Math.min(r[1], c[k][1])], [...A.channels[k].range]);
  return { pitch: cut('pitch'), roll: cut('roll'), cornerSum: A.cornerSum ?? null, from: use.map((c) => c.note) };
}
/** A J_pelvic pose clamped into the clean range of the cup's blend-shape weights (pelvicRange, the corners cut): { pitch,
 * roll }. */
export function clampPelvic({ pitch = 0, roll = 0 } = {}, w = {}) {
  const r = pelvicRange(w), p = clamp(pitch, r.pitch[0], r.pitch[1]);
  const rEnd = roll >= 0 ? r.roll[1] : -r.roll[0], share = r.cornerSum ? Math.min(1, r.cornerSum - Math.max(0, p) / r.pitch[1]) : 1;
  return { pitch: p, roll: Math.sign(roll) * Math.min(Math.abs(roll), Math.max(0, share) * rEnd) };
}

/** The pelvic press family's target names the cup has, shallowest first (fins.mjs def.presses' depthHL, round B4 trunk;
 * B3's lone 'press' otherwise). */
let PELVIC_DEF;
export function pelvicPressFamily(pelvic) {
  if (PELVIC_DEF === undefined) PELVIC_DEF = FINS?.finDefinitions?.(BODY_SCULPT)?.find((d) => d.name === 'Fin_Pelvic') ?? null;
  const have = new Set(pelvic.targets?.names ?? []), P = PELVIC_DEF?.presses;
  if (P) { const fam = Object.entries(P).sort((a, b) => a[1].depthHL - b[1].depthHL).map(([nm]) => nm).filter((nm) => have.has(nm)); if (fam.length) return fam; }
  return have.has('press') ? ['press'] : [];
}

/**
 * The pelvic cup pressed onto the ground by the press family (round B4; the trunk key's fins.mjs presses, each authored
 * for a chest height: the reach's low chest to a 30° prop; B3's one press reached the ground at 15° only, the cup short
 * by 0.6–2.5 mm at 25–35° and tilted bare in the reach). At J_pelvic 0 the cup is eased along the family (t: −1 the bare
 * cup, 0 the shallowest press, k the k-th, fractions blending the two either side) until its lowest skinned point is on
 * the ground (bisection: deeper presses reach lower; below the bare dish, t −2 … −1, the cup eased into its 'fold' for a
 * chest lower than the dish is deep); only where the deepest press is still short, or the folded cup already under the
 * ground, J_pelvic's pitch is searched within RIG.pelvicPress.pitch (+ the cup's rear down), inside the clean ranges
 * (AXES J_pelvic `coupled`).
 * @returns as pressPelvic: { pose (J_pelvic pitch, morph Fin_Pelvic weights), result: { pitch, weights, t, gapMM, note? } }
 */
function pressFamily(pose, pelvic, g, fam) {
  const names = pelvic.names ?? TIER_JOINTS.hero, ids = Int32Array.from({ length: pelvic.position.length / 3 }, (_, i) => i);
  const D = fam.map((nm) => pelvic.targets.deltas[pelvic.targets.names.indexOf(nm)]);
  // (t < −1, where the cup has a 'fold': the bare dish eased into the cup folded flat under the belly, t = −2 folded: a chest
  // lower than the bare dish is deep, e.g. the reach's, where every press and the bare dish reach under the ground)
  const fold = pelvic.targets.names.includes('fold') ? pelvic.targets.deltas[pelvic.targets.names.indexOf('fold')] : null, tMin = fold ? -2 : -1;
  const weightsAt = (t) => { const w = {}; if (t < 0) { if (t > -1) w[fam[0]] = 1 + t; else if (t < -1 && fold) w.fold = Math.min(1, -1 - t); return w; } const i = Math.min(fam.length - 1, Math.floor(t)), f = t - i; if (f > 1e-9 && i + 1 < fam.length) { w[fam[i]] = 1 - f; w[fam[i + 1]] = f; } else w[fam[i]] = 1; return w; };
  const at = (t, x) => {
    const w = weightsAt(t), P = Float32Array.from(pelvic.position);
    fam.forEach((nm, k) => { if (w[nm]) for (let q = 0; q < P.length; q++) P[q] += w[nm] * D[k][q]; });
    if (w.fold) for (let q = 0; q < P.length; q++) P[q] += w.fold * fold[q];
    const Wd = poseWorldHero({ ...pose, J_pelvic: { ...(pose.J_pelvic ?? {}), pitch: x } }), Q = skinSome(P, pelvic.skin, Wd, ids, names);
    let m = Infinity; for (let i = 1; i < Q.length; i += 3) m = Math.min(m, Q[i]); return m - g;
  };
  const bisect = (f, a, b) => { const sa = Math.sign(f(a)); for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.sign(f(m)) === sa) a = m; else b = m; } return (a + b) / 2; };
  const tMax = fam.length - 1;
  // (the pitch searched within the press's range and the clean range of the cup's shape at that t: AXES J_pelvic coupled)
  const pr = (t) => { const r = pelvicRange(weightsAt(t)).pitch; return [Math.max(RIG.pelvicPress.pitch[0], r[0]), Math.min(RIG.pelvicPress.pitch[1], r[1])]; };
  let t = 0, pitch = 0, note;
  if (at(tMax, 0) > 0) {
    t = tMax; const b0 = pr(t)[1];
    if (at(tMax, b0) > 0) { pitch = b0; note = 'the deepest press cannot reach the ground'; } else pitch = bisect((x) => at(tMax, x), 0, b0);
  } else if (at(tMin, 0) < 0) {
    t = tMin; const a0 = Math.min(0, pr(t)[0]);
    if (at(tMin, a0) < 0) { pitch = a0; note = `the ${fold ? 'folded' : 'bare'} cup is under the ground at the least pitch`; } else pitch = bisect((x) => at(tMin, x), a0, 0);
  } else t = bisect((y) => at(y, 0), tMin, tMax);
  const w = Object.fromEntries(Object.entries(weightsAt(t)).map(([k, v]) => [k, +v.toFixed(4)])), wAll = Object.fromEntries([...fam, ...(fold ? ['fold'] : [])].map((nm) => [nm, w[nm] ?? 0]));
  pitch = +pitch.toFixed(3);
  const result = { pitch, weights: w, t: +t.toFixed(4), gapMM: +Math.max(0, at(t, pitch)).toFixed(4), ...(note ? { note } : {}) };
  const out = { ...pose, J_pelvic: { ...(pose.J_pelvic ?? {}), pitch }, morph: { ...(pose.morph ?? {}), Fin_Pelvic: { ...(pose.morph?.Fin_Pelvic ?? {}), ...wAll } } };
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
  // (round T3: lod2 merges its globes into the Body at rest: no Eye node to take the gaze)
  if (tier === 'lod2') delete p.gaze;
  const hasUp = o.morphNames ? (S2) => o.morphNames.includes(`eyesUp${S2}`) : () => tier !== 'lod2';
  const bare = RIG.eyeLiftBare;
  for (const S2 of ['L', 'R']) { const e = p[`J_eye${S2}`]; if (e?.t && !hasUp(S2)) e.t = [e.t[0], Math.min(e.t[1], bare), e.t[2]]; }
  return { pose: p, ground: S.ground ?? null };
}

// ------------------------------------------------------------------------------------------------ transitions

/**
 * The transitions between the reference states (round B4, poses P2: B3 shipped static states only, and a runtime blend
 * of their channels swept the planted blade through the ground: land→rest 2.8 mm under it, land→water 4.7, land→reach
 * 0.5). Each pair is one rule the runtime follows from `from` to `to` (and backwards, u → 1 − u):
 *   e(u) = u²(3 − 2u)               the ease (the plant left and reached slowly while the lift rises fast)
 *   body(u) = lerp(from, to, e(u))  every channel but the arms', the non-pectoral fins' weights, the ground (groundMM)
 *   arms(u) = lerp(from, to, e(u)) + sin(πu) · lift   the arms' channels (J_pec*: L as written, R the same values, the
 *                                    rig's mirror), the pectoral blend shapes lerped
 * `lift` (deg per channel, the left arm's) is solved here on the hero's tier mesh: along the first of RIG.transition.lift's
 * directions that works, the least scale whose arc keeps every blade vertex at or above the body's lowest point (the
 * ground; within the endpoints' own clearance when a state holds its blade lower, e.g. a paddle under the belly) and
 * whose peak lifts the blade `clearMM` off, with no blade vertex inside the body (ray parity on the posed skin). The arc
 * lifts the planted sole off, swings the arm over and sets it down again: no planted fin slides or sweeps through the mud.
 * `keys` samples it (u, pose, groundMM) for a runtime that lerps keys instead (gated at 10 sub-steps between keys too).
 * The pairs are the state graph's edges: land is the hub on land (reach ↔ rest and reach ↔ water go through land: the B4
 * rest → reach arc found no lift that cleared the mud), water ↔ swim in the water; swim ↔ the land states through water.
 */
export const TRANSITIONS = [['land', 'rest'], ['land', 'reach'], ['land', 'water'], ['rest', 'water'], ['water', 'swim']];
const isArmKey = (k) => /^J_pec/.test(k), isArmFin = (k) => /^Fin_Pectoral_/.test(k);
const lerpChannels = (a = {}, b = {}, t) => {
  const o = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = a?.[k], y = b?.[k];
    if (Array.isArray(x) || Array.isArray(y)) { const X = x ?? [0, 0, 0], Y = y ?? [0, 0, 0]; o[k] = X.map((v, i) => +(v + (Y[i] - v) * t).toFixed(6)); }
    // (round T3: a nested entry — the gaze's { L: { yaw, pitch }, R } — lerped member by member)
    else if ((x && typeof x === 'object') || (y && typeof y === 'object')) o[k] = lerpChannels(x ?? {}, y ?? {}, t);
    else o[k] = +((x ?? 0) + ((y ?? 0) - (x ?? 0)) * t).toFixed(4);
  }
  return o;
};
/** The two poses blended: the arms' channels and the pectoral blend shapes by `lam`, everything else by `mu` (channels
 * and weights lerped as a runtime lerps them, a missing one 0). */
export function blendPoses(A, B, lam, mu = lam) {
  const out = {}, mo = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (k !== 'morph') out[k] = lerpChannels(A[k], B[k], isArmKey(k) ? lam : mu);
  for (const f of new Set([...Object.keys(A.morph ?? {}), ...Object.keys(B.morph ?? {})])) mo[f] = lerpChannels(A.morph?.[f], B.morph?.[f], isArmFin(f) ? lam : mu);
  out.morph = mo;
  return out;
}
/** A transition's pose at u: the blend at e(u) = u²(3 − 2u) (eased in and out: the arm leaves its plant slowly while the lift
 * rises fast) plus sin(πu)·lift on both arms (left channels; the right the same values, the rig's mirror), each channel held
 * in its AXES range. */
export function transitionPose(A, B, u, lift = {}) {
  const e = u * u * (3 - 2 * u), p = blendPoses(A, B, e, e), k = Math.sin(Math.PI * u);
  for (const [j, ch] of Object.entries(lift)) for (const S of ['L', 'R']) {
    const name = `${j}${S}`, rg = AXES.joints[name]?.channels;
    p[name] = { ...(p[name] ?? {}) };
    for (const [c, v] of Object.entries(ch)) { const r = rg?.[c]?.range ?? [-180, 180]; p[name][c] = +clamp((p[name][c] ?? 0) + k * v, r[0], r[1]).toFixed(4); }
  }
  return p;
}
/** Points inside a closed triangle soup (parity of the crossings of the ray along +s): a (y, z) bin grid. */
function parityGrid(P, I, cell = 0.4) {
  let y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
  const ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, bins = new Array(ny * nz);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ya = Math.floor((Math.min(P[a + 1], P[b + 1], P[c + 1]) - y0) / cell), yb = Math.floor((Math.max(P[a + 1], P[b + 1], P[c + 1]) - y0) / cell);
    const za = Math.floor((Math.min(P[a + 2], P[b + 2], P[c + 2]) - z0) / cell), zb = Math.floor((Math.max(P[a + 2], P[b + 2], P[c + 2]) - z0) / cell);
    for (let iy = ya; iy <= yb; iy++) for (let iz = za; iz <= zb; iz++) (bins[iy * nz + iz] ??= []).push(t);
  }
  return (px, py, pz) => {
    py += 1.37e-6; pz += 2.71e-6;
    const iy = Math.floor((py - y0) / cell), iz = Math.floor((pz - z0) / cell);
    if (iy < 0 || iz < 0 || iy >= ny || iz >= nz) return false;
    let n = 0;
    for (const t of bins[iy * nz + iz] ?? []) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ay = P[a + 1] - py, az = P[a + 2] - pz, by = P[b + 1] - py, bz = P[b + 2] - pz, cy = P[c + 1] - py, cz = P[c + 2] - pz;
      const d1 = ay * bz - az * by, d2 = by * cz - bz * cy, d3 = cy * az - cz * ay;
      if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
      const s = d1 + d2 + d3; if (Math.abs(s) < 1e-30) continue;
      if ((P[a] * d2 + P[b] * d3 + P[c] * d1) / s > px) n++;
    }
    return n % 2 === 1;
  };
}
/**
 * A pose measured on a tier for the transitions: the body's lowest point (the skin the arms do not carry and every fin
 * but the pectorals: the ground under it), the pectoral blades' lowest, their clearance (blade − body, mm), and with
 * `inside` the blade vertices inside the posed skin deeper than `depthMM` (to the nearest skin vertex; `parts.skin.indices`
 * needed).
 */
export function armClearance(pose, parts, { inside = false, depthMM = 0.05 } = {}) {
  const names = parts.skin.names ?? TIER_JOINTS.hero, Wd = poseWorldHero(pose), keep = (parts._keep ??= notArm({ ...parts.skin, names }));
  const ids = (parts._ids ??= Int32Array.from({ length: parts.skin.position.length / 3 }, (_, v) => v).filter((v) => keep(v)));
  const Ps = inside ? skinPacked(parts.skin.position, parts.skin.skin, Wd, { names }) : skinSome(parts.skin.position, parts.skin.skin, Wd, ids, names);
  let body = Infinity;
  if (inside) for (const v of ids) body = Math.min(body, Ps[v * 3 + 1]); else for (let i = 1; i < Ps.length; i += 3) body = Math.min(body, Ps[i]);
  let blade = Infinity; const bladeP = [];
  for (const [nm, f] of Object.entries(parts.fins ?? {})) {
    const P = Float32Array.from(f.position);
    for (const [k, w] of Object.entries(pose.morph?.[nm] ?? {})) { const i = f.targets?.names?.indexOf(k) ?? -1; if (i < 0 || !w) continue; const D = f.targets.deltas[i]; for (let q = 0; q < P.length; q++) P[q] += w * D[q]; }
    const Q = skinPacked(P, f.skin, Wd, { names });
    let m = Infinity; for (let i = 1; i < Q.length; i += 3) m = Math.min(m, Q[i]);
    if (isArmFin(nm)) { blade = Math.min(blade, m); bladeP.push(Q); } else body = Math.min(body, m);
  }
  const out = { bodyMM: body, bladeMM: blade, clearMM: blade - body };
  if (inside) {
    const isIn = parityGrid(Ps, parts.skin.indices);
    // (each inside vertex's depth: its distance to the posed skin's nearest triangle; the mask marks those deeper than
    // `depthMM`, the fleshy root lens sitting a hair inside the lobe's skin left out)
    const cell = 0.3, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let v = 0; v < Ps.length / 3; v++) { const kk = key(Ps[v * 3], Ps[v * 3 + 1], Ps[v * 3 + 2]); let a = grid.get(kk); if (!a) grid.set(kk, (a = [])); a.push(v); }
    const I = parts.skin.indices, vt = (parts._vt ??= (() => { const a = Array.from({ length: Ps.length / 3 }, () => []); for (let t = 0; t < I.length; t += 3) for (let q = 0; q < 3; q++) a[I[t + q]].push(t); return a; })());
    const depth = (x, y, z) => {
      // (the nearest skin vertex within 1.2 mm, then the exact distance to the triangles round the vertices within 0.3 mm of it)
      let d = Infinity; const near = [], i0 = Math.floor(x / cell), j0 = Math.floor(y / cell), k0 = Math.floor(z / cell);
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (let c = -4; c <= 4; c++) for (const v of grid.get(`${i0 + a},${j0 + b},${k0 + c}`) ?? []) { const e = Math.hypot(Ps[v * 3] - x, Ps[v * 3 + 1] - y, Ps[v * 3 + 2] - z); near.push([v, e]); d = Math.min(d, e); }
      let best = Infinity, p = [x, y, z], seen = new Set();
      for (const [v, e] of near) if (e < d + 0.3) for (const t of vt[v]) { if (seen.has(t)) continue; seen.add(t); const g = (q) => [Ps[I[t + q] * 3], Ps[I[t + q] * 3 + 1], Ps[I[t + q] * 3 + 2]]; const r = triDist(p, g(0), g(1), g(2)); if (Number.isFinite(r)) best = Math.min(best, r); }
      return best;
    };
    const tot = bladeP.reduce((a, Q) => a + Q.length / 3, 0), mask = new Uint8Array(tot);
    let n = 0, k = 0; for (const Q of bladeP) for (let i = 0; i < Q.length; i += 3, k++) if (isIn(Q[i], Q[i + 1], Q[i + 2]) && depth(Q[i], Q[i + 1], Q[i + 2]) > depthMM) { n++; mask[k] = 1; }
    out.inside = n; out.insideMask = mask;
  }
  return out;
}
/**
 * One transition solved (see TRANSITIONS): the lift along RIG.transition.lift's directions, the arc's samples and keys.
 * @param A, B statePose results (hero)   @param parts { skin: { position, skin, names, indices }, fins: { [name]:
 *   { position, skin, targets } } } (the hero's tier skin and fins)   @param o { clearMM, samples, keys, fixedLift (the
 *   lift to take instead of solving one: its keys and gates measured as they are; 2026-10-25, the pose lock) }
 * @returns { lift, direction, scale, minClearMM, peakClearMM, allowMM: [from, to], inside, keys: [{ u, pose, groundMM }],
 *   keyMinClearMM, pass, note }
 */
export function transitionPlan(A, B, parts, o = {}) {
  const C = { ...RIG.transition, ...o }, N = C.samples, us = Array.from({ length: N - 1 }, (_, i) => (i + 1) / N);
  const cA = armClearance(A.pose, parts).clearMM, cB = armClearance(B.pose, parts).clearMM;
  // (blade vertices the states themselves hold inside the skin, e.g. the fleshy root lens under the lobe's skin, the rest's
  // fold laid on the flank: those may stay inside along the arc; any other is a blade through the body)
  const mA = armClearance(A.pose, parts, { inside: true }).insideMask, mB = armClearance(B.pose, parts, { inside: true }).insideMask;
  const newInside = (pose) => { const m = armClearance(pose, parts, { inside: true }).insideMask; let c = 0; for (let i = 0; i < m.length; i++) if (m[i] && !mA[i] && !mB[i]) c++; return c; };
  // (the clearance a sample must keep: the ground, or the endpoints' own where a state holds its blade lower, lerped)
  const allow = (u) => { const e = u * u * (3 - 2 * u); return Math.min(0, (1 - e) * cA + e * cB) - C.tolMM; };
  const scaled = (d, s) => Object.fromEntries(Object.entries(d).map(([j, ch]) => [j, Object.fromEntries(Object.entries(ch).map(([c, v]) => [c, +(v * s).toFixed(3)]))]));
  // (worst: the least of (clearance − allow) − clearMM·sin²(πu) over the arc's samples: ≥ 0 keeps the blade off the ground
  // and lifts it clearMM at the arc's middle, the margin easing to 0 at the plants; plain: the least clearance − allow)
  const run = (lift) => { let worst = Infinity, plain = Infinity, peak = -Infinity; for (const u of us) { const c = armClearance(transitionPose(A.pose, B.pose, u, lift), parts).clearMM - allow(u); worst = Math.min(worst, c - C.clearMM * Math.sin(Math.PI * u) ** 2); plain = Math.min(plain, c); peak = Math.max(peak, c); } return { worst, plain, peak }; };
  const ok = (r) => r.worst >= 0;
  const plain = run({});
  let best = null;
  if (o.fixedLift) best = { lift: structuredClone(o.fixedLift), direction: 'held (pose lock)', scale: null, r: run(o.fixedLift) };
  else if (ok(plain)) best = { lift: {}, direction: 'none', scale: 0, r: plain };
  for (const [dn, d] of Object.entries(C.lift)) {
    if (best) break;
    if (!ok(run(scaled(d, C.maxDeg)))) continue;
    let a = 0, b = C.maxDeg;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (ok(run(scaled(d, m)))) b = m; else a = m; }
    const lift = scaled(d, Math.ceil(b)), r = run(lift);
    // (no blade inside the body along the arc: else the next direction)
    let ins = 0; for (const u of us) ins = Math.max(ins, newInside(transitionPose(A.pose, B.pose, u, lift)));
    if (ins > 0) continue;
    best = { lift, direction: dn, scale: Math.ceil(b), r };
  }
  const lift = best?.lift ?? {}, r = best?.r ?? plain;
  // (the keys a key-lerping runtime takes, and their own gate: 10 sub-steps between keys)
  const ku = Array.from({ length: C.keys + 1 }, (_, i) => i / C.keys);
  const keys = ku.map((u) => { const pose = transitionPose(A.pose, B.pose, u, lift), m = armClearance(pose, parts); return { u: +u.toFixed(4), pose, groundMM: +Math.min(m.bodyMM, m.bladeMM).toFixed(4) }; });
  let keyMin = Infinity;
  for (let k = 0; k + 1 < keys.length; k++) for (let s = 1; s < 10; s++) { const t = s / 10, u = keys[k].u + (keys[k + 1].u - keys[k].u) * t; keyMin = Math.min(keyMin, armClearance(blendPoses(keys[k].pose, keys[k + 1].pose, t, t), parts).clearMM - allow(u)); }
  let inside = 0; for (const u of us) inside = Math.max(inside, newInside(transitionPose(A.pose, B.pose, u, lift)));
  return {
    lift, direction: best?.direction ?? 'none (no direction cleared)', scale: best?.scale ?? null, minClearMM: +r.plain.toFixed(3), liftMarginMM: +r.worst.toFixed(3), peakClearMM: +r.peak.toFixed(3), endClearMM: [+cA.toFixed(3), +cB.toFixed(3)],
    inside, keys, keyMinClearMM: +keyMin.toFixed(3), pass: !!best && keyMin >= 0 && inside === 0,
  };
}
/**
 * Every transition of TRANSITIONS on the hero (build.mjs writes them beside the states): { 'a>b': { from, to, rule,
 * lift, curve, keys, gate } }, `b>a` the same arc backwards (u → 1 − u).
 */
export function stateTransitions(states, parts, o = {}) {
  const out = {};
  for (const [a, b] of o.pairs ?? TRANSITIONS) {
    if (!states[a] || !states[b]) continue;
    // (o.lifts: { 'a>b': lift } held instead of solved — build.mjs's pose lock)
    const T = transitionPlan(states[a], states[b], parts, { ...o, fixedLift: o.lifts?.[`${a}>${b}`] });
    out[`${a}>${b}`] = {
      from: a, to: b, ease: 'u²(3 − 2u)', curve: 'sin(πu)', lift: T.lift, liftDirection: T.direction,
      rule: 'e(u) = u²(3 − 2u); body(u) = lerp(from, to, e(u)) (every channel but the arms\', the other fins\' weights, groundMM); arms(u) = lerp(from, to, e(u)) + sin(πu)·lift (J_pec*: `lift` is the left arm\'s, the right takes the same values, the rig\'s mirror; each channel held in its AXES range), the pectoral weights lerped; backwards (to→from) the same with u → 1 − u',
      keys: T.keys, gate: { minClearMM: T.minClearMM, peakClearMM: T.peakClearMM, endClearMM: T.endClearMM, keyMinClearMM: T.keyMinClearMM, liftMarginMM: T.liftMarginMM, insideBlade: T.inside, pass: T.pass, note: 'clearance: the pectoral blades\' lowest point over the body\'s (the ground), mm, at 19 points of the arc (min, against the endpoints\' own lerped where a state holds the blade lower) and between the keys (10 sub-steps); insideBlade: blade vertices inside the posed skin (ray parity) that neither state holds inside' },
    };
  }
  return out;
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
  // (round B4, poses P4: without o.states the tier's shipped states, statePose(state, tier) bare; B3 solved 'land' here
  // without the fins and took the unsettled 'rest')
  void pel;
  const states = o.states ?? Object.fromEntries(Object.entries(shippedStates(o.statesFile)[tierName] ?? {}).filter(([, S]) => S?.pose).map(([st]) => [st, statePose(st, tierName, { statesFile: o.statesFile })]));
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
