// The トビハゼ head skeleton: every bone as a primitive of skel.mjs in the fish frame (HL units; s back from the snout
// tip, y up from the head's flat underside, z to the fish's LEFT), the left side given and mirrored, midline bones at
// z = 0. Each bone hangs from the joint that moves it, so posing the joints moves the bones as the real head does:
//   J_head      neurocranium, the pectoral girdle fixed to it (Michel et al. 2014: no cleithral retraction)
//   J_premax    premaxillae (upper jaw): slide forward and down along their ascending processes, and tilt up
//   J_maxL/R    maxillae: swing about their heads on the palatines, the posterior ends down and forward
//   J_suspL/R   suspensorium (palatine, ectopterygoid, quadrate, metapterygoid, symplectic, hyomandibula,
//               preopercle): swings out about the line through the palatine–ethmoid joint and the two hyomandibular
//               condyles, widening the cheeks and the mouth cavity
//   J_jaw       lower jaw (anguloarticulars), hinged on the quadrates; J_imj: the dentaries' extra flexion on the
//               intramandibular joint at the widest gapes
//   J_opercL/R  opercular series (opercle, subopercle, interopercle) on the hyomandibula's opercular process
//   J_hyoid     hyoid arch and branchiostegal rays, depressed about the interhyal joints
//   J_chL/R     each hyoid bar (hypohyal, ceratohyal, interhyal) splayed out about its hypohyal, so the interhyals
//               follow the abducted suspensoria (the cheeks' inflation)
//   J_bstegL/R  the branchiostegal rays fanned down and out on the ceratohyal (the gill chambers' floor ballooning)
//   J_opercRollL/R  the opercular series rolled out about the fore-aft line through its facet (the cheeks' inflation)
//   J_jawL/R, J_imjL/R  the lower jaw's halves (anguloarticular; dentary with its teeth) splayed at the symphysis, so the
//               articulars stay on the abducted quadrates (the cheeks' inflation)
//   J_eyeL/R    the eye globes
//
// Positions are the landmark table of research/anat_osteo.md: Michel et al. 2014 Fig. 2A (micro-CT of P. barbarus,
// lateral) with y × 0.92 to fit our P. modestus head, z from their ventral and frontal CT views and Lee 1990 (P.
// modestus, as P. cantonensis), shapes from Murdy 1989. LM holds them; the bones are drawn through them.
import { rod, polyRod, plate, plateFromPoints, strap, sheet, teeth, frame, ellipsoidF, unionOf, v3 } from './skel.mjs';
import { HEAD } from './anatomy.mjs';

const E = HEAD.eye;

/** Landmarks (s, y, z), left side. */
export const LM = {
  // neurocranium
  vomer: [0.163, 0.274, 0], mesethmoid: [0.163, 0.472, 0],
  latEthDorsal: [0.177, 0.527, 0.05], latEthWing: [0.210, 0.460, 0.16],
  lacrimalTop: [0.145, 0.387, 0.170], lacrimalBottom: [0.145, 0.278, 0.180],
  frontalFront: [0.269, 0.591, 0.02], frontalTop: [0.416, 0.627, 0.02],
  orbitFront: [0.226, 0.482, 0.10], orbitBack: [0.476, 0.512, 0.10], orbitFloor: [0.335, 0.400, 0.02],
  paraFront: [0.189, 0.354, 0], paraMid: [0.335, 0.385, 0], paraBack: [0.492, 0.443, 0],
  sphenotic: [0.470, 0.432, 0.22], pterotic: [0.771, 0.535, 0.21], epiotic: [0.771, 0.558, 0.10],
  supraocc: [0.703, 0.600, 0], exocc: [0.798, 0.443, 0.15], condyle: [0.900, 0.423, 0],
  // upper jaw
  pmxAscTip: [0.079, 0.426, 0.01], pmxAscBase: [0.013, 0.257, 0], pmxFront: [0.006, 0.117, 0], pmxArmEnd: [0.197, 0.182, 0.15],
  rostral: [0.090, 0.368, 0], maxHead: [0.036, 0.340, 0.05], maxEnd: [0.316, 0.199, 0.21],
  palCondyle: [0.165, 0.423, 0.10], palHead: [0.048, 0.310, 0.06], palPlateBack: [0.265, 0.316, 0.09],
  ectoFront: [0.258, 0.245, 0.13], ectoBack: [0.355, 0.141, 0.18],
  // lower jaw
  dentSymTop: [0.010, 0.129, 0], dentSymBottom: [0.024, 0.101, 0], dentVentral: [0.226, 0.039, 0.12], coronoid: [0.321, 0.266, 0.17],
  jawSocket: [0.337, 0.099, 0.175], retroart: [0.294, 0.021, 0.17], imj: [0.285, 0.120, 0.16],
  // suspensorium
  quadCondyle: [0.345, 0.095, 0.175], quadApex: [0.500, 0.300, 0.19], quadArm: [0.674, 0.160, 0.24],
  sympTop: [0.577, 0.249, 0.22], sympBottom: [0.400, 0.130, 0.20], metaptTip: [0.518, 0.344, 0.19],
  hyoCondA: [0.569, 0.475, 0.165], hyoCondP: [0.739, 0.489, 0.20], hyoOpProc: [0.723, 0.405, 0.24],
  hyoShaft: [0.671, 0.230, 0.235], hyoLobe: [0.510, 0.375, 0.19],
  popTop: [0.674, 0.351, 0.25], popAngle: [0.682, 0.141, 0.27], popFront: [0.645, 0.085, 0.26],
  // opercular series
  opFacet: [0.718, 0.411, 0.24], opPeak: [0.882, 0.477, 0.27], opPostDorsal: [0.989, 0.460, 0.27],
  opPostMid: [1.008, 0.371, 0.30], opPostVentral: [0.987, 0.313, 0.32], opApex: [0.805, 0.099, 0.30],
  sopTop: [0.987, 0.310, 0.31], sopCurve: [0.819, 0.075, 0.30], sopProc: [0.763, 0.181, 0.28],
  iopFront: [0.468, 0.082, 0.20], iopBack: [0.703, 0.078, 0.25],
  // hyoid
  basihyal: [0.200, 0.120, 0], hypohyal: [0.290, 0.074, 0.03], achFront: [0.310, 0.078, 0.05], achBack: [0.550, 0.156, 0.19],
  pchTop: [0.645, 0.189, 0.21], interhyal: [0.655, 0.230, 0.205], urohyalFront: [0.300, 0.055, 0], urohyalBack: [0.470, 0.037, 0],
  // pectoral girdle
  pttDorsal: [0.771, 0.558, 0.10], pttVentral: [0.798, 0.443, 0.15], pttBack: [0.974, 0.525, 0.20],
  sclTop: [1.010, 0.586, 0.22], sclBottom: [1.029, 0.467, 0.23],
  clTop: [0.994, 0.487, 0.24], clPostMid: [1.016, 0.305, 0.29], clBend: [0.997, 0.201, 0.27], clLimb: [0.924, 0.109, 0.20], clSym: [0.820, 0.055, 0],
  scapula: [1.061, 0.371, 0.25], coracoid: [1.061, 0.201, 0.24],
};
const L = LM;
const n3 = v3.norm;

// The CT's head length runs from the premaxilla's tip to the opercle's bony margin; ours from the skin of the snout
// (≈0.045 HL in front of the premaxilla: the upper lip over the teeth and the snout's thick skin sheath) to the opercle's skin
// margin. The bones are drawn in the CT's s and placed into the head by this map (y and z already fitted, see above).
export const CT_S = { shift: 0.045, scale: 0.948 };
const toModel = (p) => [CT_S.shift + CT_S.scale * p[0], p[1], p[2]];

// The lower jaw closed into the head: the CT puts the dentary's tip 0.04 HL under the premaxilla's (Michel et al.
// 2014 Fig. 2A: upper-jaw tip y 0.29, lower 0.25), but the landmarks above, refitted to the soft tissue, had the
// symphysis level with it, above the gape and inside the upper lip, so the lower teeth stood out of the lower lip
// as soon as the jaw dropped. The lower jaw's bones are drawn turned JAW_FIT degrees down about the quadrate
// condyles (the coronoid process a little forward; the maxillo-mandibular ligament keeps its length: the maxilla at
// 26.75° for the jaw at 70 + 15°, as before), and JAW_FIT_S shorter along s (from the condyles), so its tip lies in the
// sculpt's receding chin (s ≈ 0.095, set back under the upper lip: anat_soft.md §1.2), not in front of the lower lip.
// (Round n15: 5° and 0.90, with the dentary refitted below (DENT_FIT). The n14 sculpt's lower jaw is a thin wedge under
// a low gape: its tissue (below the slit) has its top at y 0.082–0.088 from s 0.09 to the rictus, its front at s 0.085
// on the midline, and it is only 0.04 HL deep at s 0.10. The CT's dentary, 0.09 HL deep, stood 0.03–0.04 HL above that
// top at 3° / 0.97 (its teeth at y 0.102–0.125 inside the upper lip, the front two ahead of the chin at s 0.073), so the
// jaw carried no lip over its teeth when it dropped: they stood 0.044 HL in front of the lower lip at half gape.)
export const JAW_FIT = 5, JAW_FIT_S = 0.90;
// The dentary in the sculpt's lower jaw: its alveolar edge lowered (CT y, per dentTop point, the coronoid's root kept)
// and its symphysis made shallower (the ventral edge drawn toward the top by `depth`), so the whole toothed ramus lies in
// the lower jaw's tissue: the tips of its teeth 0.008 HL or more under the tissue's top (under the lower lip and the
// gum, so none shows at rest and the lip stays in front of them at the gape), the bone inside the chin but for 0.004 HL.
export const DENT_FIT = { drop: [0.028, 0.028, 0.028, 0.035, 0.05, 0], depth: [0.55, 0.6, 0.75, 0.9, 1, 1], toothH: 0.009 };
// The tooth rows fitted to the sculpt (fitTeeth, round n16): each tooth from its root on its jaw bone along its own axis
// up (dentary) or down (premaxilla) to `tipIn` under the oral surface of the tissue round it, so the closed mouth hides
// every tip while the gape's corrective (headrig.mjs gapeTargets) draws the gum back round them and they stand
// 0.005-0.008 HL proud of it; the front teeth the enlarged canines (Murdy 1989; Saberi et al. 2024: a single row of
// caninoid teeth): `canine` their gum-recession and radius factors from the symphysis back. The premaxilla carries its row
// on an alveolar flange down to them (the upper lip's pads hang below the bone, so its own edge lies 0.03-0.08 HL over
// the mouth's roof).
// (round n17: each tooth caniniform, recurved: its upper `curve` of the length bends toward the mouth's inside (back and
// toward the midline, across the row) by `bend` of its length, so the crowns hook inward as a goby's do; the front
// canines `canine` [gum, radius] times the row's, the first pair the stoutest)
export const TOOTH_FIT = { tipIn: 0.003, maxLen: { dentary: 0.024, premax: 0.05 }, canine: [[1.35, 1.6], [1.2, 1.35], [1.08, 1.12]], flange: 0.007, curve: 0.45, bend: 0.3 };
const QMJ_CT = [LM.quadCondyle[0], LM.quadCondyle[1], 0];
const jawFitPoint = (p) => {
  const a = (JAW_FIT * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), x = p[0] - QMJ_CT[0], y = p[1] - QMJ_CT[1];
  return [QMJ_CT[0] + (x * c - y * sn) * JAW_FIT_S, QMJ_CT[1] + x * sn + y * c, p[2]];
};
const jawFitField = (f) => {
  const a = (-JAW_FIT * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return (x, y, z) => { const dx = (x - QMJ_CT[0]) / JAW_FIT_S, dy = y - QMJ_CT[1]; return f(QMJ_CT[0] + dx * c - dy * sn, QMJ_CT[1] + dx * sn + dy * c, z) * JAW_FIT_S; };
};
const fieldToModel = (f) => (x, y, z) => f((x - CT_S.shift) / CT_S.scale, y, z) * CT_S.scale;
/** A landmark in the head's frame (HL). */
const JAW_LM = new Set(['dentSymTop', 'dentSymBottom', 'dentVentral', 'coronoid', 'jawSocket', 'retroart', 'imj']);
export const lm = (name) => toModel(JAW_LM.has(name) ? jawFitPoint(LM[name]) : LM[name]);

/** The lower jaw's splay axis (left side; the right one mirrored), J_jawL/R and J_imjL/R. */
export const JAW_SPLAY_AXIS = n3([0, -1, 0]);
// Joint pivots in the CT's frame and axes; parents first. Ranges (degrees or HL) are the measured ones (Michel 2014).
const JOINTS_CT = [
  // the head pitches on the first vertebra only a little (≤ 5°); the body does the rest
  { name: 'J_head', parent: null, pivot: L.condyle, axis: [0, 0, 1], range: [-5, 5] },
  // protrusion: a slide along the ascending process (anteroventral) and a tilt about its tip (+16°, front up)
  { name: 'J_premax', parent: 'J_head', pivot: L.pmxAscTip, axis: [0, 0, -1], slide: n3([-0.36, -0.93, 0]), range: [0, 16], slideRange: [0, 0.08] },
  // the maxilla swings its posterior end down and forward (+29°) and twists about its shaft (up to 90°): about −z, so a
  // positive angle turns the shaft (which runs back and down from its head) steeper, its tip toward the coronoid
  // process it is tied to (the maxillo-mandibular ligament)
  { name: 'J_maxL', parent: 'J_head', pivot: L.maxHead, axis: [0, 0, -1], twist: n3([0.80, -0.40, 0.46]), range: [0, 29] },
  { name: 'J_maxR', parent: 'J_head', pivot: [L.maxHead[0], L.maxHead[1], -L.maxHead[2]], axis: [0, 0, -1], twist: n3([0.80, -0.40, -0.46]), range: [0, 29] },
  // abduction: the ventral suspensorium swings out (−3 … +12°) about the palatine–hyomandibular line
  { name: 'J_suspL', parent: 'J_head', pivot: L.hyoCondA, axis: n3([-0.976, -0.085, -0.20]), range: [-3, 12] },
  { name: 'J_suspR', parent: 'J_head', pivot: [L.hyoCondA[0], L.hyoCondA[1], -L.hyoCondA[2]], axis: n3([0.976, 0.085, -0.20]), range: [-3, 12] },
  // the lower jaw drops about the line through both quadrate condyles (0 … 70°), the dentaries a further 0 … 30°
  { name: 'J_jaw', parent: 'J_head', pivot: [L.quadCondyle[0], L.quadCondyle[1], 0], axis: [0, 0, 1], range: [0, 70] },
  { name: 'J_imj', parent: 'J_jaw', pivot: jawFitPoint([L.imj[0], L.imj[1], 0]), axis: [0, 0, 1], range: [0, 30] },
  // the gill cover swings out (−6 … +20°) about its anterior margin and rises (0 … 8°) on the opercular process: the
  // axis runs down the anterior margin (opercular facet → apex), so a positive angle carries the posterior margin out;
  // the right side's axes are the left's mirrored as axial vectors (−s, −y, +z)
  { name: 'J_opercL', parent: 'J_suspL', pivot: L.hyoOpProc, axis: n3([0.26, -0.965, 0.03]), lift: n3([0.15, 0.10, 0.98]), range: [-6, 20] },
  { name: 'J_opercR', parent: 'J_suspR', pivot: [L.hyoOpProc[0], L.hyoOpProc[1], -L.hyoOpProc[2]], axis: n3([-0.26, 0.965, 0.03]), lift: n3([-0.15, -0.10, 0.98]), range: [-6, 20] },
  // the hyoid bars drop about the transverse line through the interhyal joints (0 … 18°)
  { name: 'J_hyoid', parent: 'J_head', pivot: [L.interhyal[0], L.interhyal[1], 0], axis: [0, 0, 1], range: [-3, 18] },
  // the eyes: rotation about the globe's centre; raised +0.03, lowered −0.13 (into the orbit) along y
  { name: 'J_eyeL', parent: 'J_head', pivot: [E.s, E.y, E.z] },
  { name: 'J_eyeR', parent: 'J_head', pivot: [E.s, E.y, -E.z] },
  // the hyoid bars splay: each ceratohyal swings its hind end out about its hypohyal (the symphysis's ligaments), so
  // the interhyal follows the abducted suspensorium instead of parting from it (the cheeks' inflation)
  { name: 'J_chL', parent: 'J_hyoid', pivot: L.hypohyal, axis: n3([-0.05, -0.94, 0.32]), range: [0, 15] },
  { name: 'J_chR', parent: 'J_hyoid', pivot: [L.hypohyal[0], L.hypohyal[1], -L.hypohyal[2]], axis: n3([0.05, 0.94, 0.32]), range: [0, 15] },
  // the branchiostegal rays fan down and out on the ceratohyal (the gill membranes ballooning the throat): about the
  // line of their heads, tilted so that a positive angle swings the rays' tips ventrally and laterally
  { name: 'J_bstegL', parent: 'J_chL', pivot: [0.52, 0.13, 0.155], axis: n3([0.30, -0.30, -0.90]), range: [0, 35] },
  { name: 'J_bstegR', parent: 'J_chR', pivot: [0.52, 0.13, -0.155], axis: n3([-0.30, 0.30, -0.90]), range: [0, 35] },
  // the lower jaw's halves splay at the symphysis (the intermandibular ligament), so each ramus follows its abducted
  // suspensorium and the articular stays on the quadrate (the cheeks' inflation): about the line through the symphysis
  // tilted so that a positive angle swings the ramus's hind end out and a little up, as the quadrate goes; J_jawL/R carry
  // the anguloarticulars (on J_jaw), J_imjL/R the dentaries with their teeth (on J_imj), turned together
  // the opercular series rolls out about the fore-aft line through its facet on the hyomandibula (the ball joint's third
  // freedom): a positive angle carries the opercle's ventral half, the subopercle and the interopercle laterally, so its
  // front edge follows the inflated cheek although the suspensorium, tied to the lower jaw, abducts no further
  { name: 'J_opercRollL', parent: 'J_opercL', pivot: L.hyoOpProc, axis: [-1, 0, 0], range: [0, 20] },
  { name: 'J_opercRollR', parent: 'J_opercR', pivot: [L.hyoOpProc[0], L.hyoOpProc[1], -L.hyoOpProc[2]], axis: [1, 0, 0], range: [0, 20] },
  { name: 'J_jawL', parent: 'J_jaw', pivot: jawFitPoint([L.dentSymTop[0], L.dentSymTop[1], 0]), axis: JAW_SPLAY_AXIS, range: [0, 15] },
  { name: 'J_jawR', parent: 'J_jaw', pivot: jawFitPoint([L.dentSymTop[0], L.dentSymTop[1], 0]), axis: [-JAW_SPLAY_AXIS[0], -JAW_SPLAY_AXIS[1], JAW_SPLAY_AXIS[2]], range: [0, 15] },
  { name: 'J_imjL', parent: 'J_imj', pivot: jawFitPoint([L.dentSymTop[0], L.dentSymTop[1], 0]), axis: JAW_SPLAY_AXIS, range: [0, 15] },
  { name: 'J_imjR', parent: 'J_imj', pivot: jawFitPoint([L.dentSymTop[0], L.dentSymTop[1], 0]), axis: [-JAW_SPLAY_AXIS[0], -JAW_SPLAY_AXIS[1], JAW_SPLAY_AXIS[2]], range: [0, 15] },
];
/** Joint pivots (HL, the head's frame) and axes; parents first. */
export const HEAD_JOINTS = JOINTS_CT.map((j) => (j.name.startsWith('J_eye') ? j : { ...j, pivot: toModel(j.pivot) }));

const F = (o, u, v) => frame(o, u, v);
const mid = (a, b, t = 0.5) => v3.lerp(a, b, t);
const off = (p, d) => v3.add(p, d);

// the default tooth rows (CT frame): the roots along each jaw's alveolar path, the axes, as teeth() spaces them
const PMX_ARM = [L.pmxFront, [0.012, 0.122, 0.035], [0.035, 0.132, 0.075], [0.075, 0.148, 0.110], [0.130, 0.165, 0.135], L.pmxArmEnd];
const DENT_TOP = [L.dentSymTop, [0.020, 0.130, 0.040], [0.060, 0.127, 0.075], [0.120, 0.125, 0.105], [0.190, 0.130, 0.135], [0.250, 0.150, 0.155]].map((p, i) => off(p, [0, -DENT_FIT.drop[i], 0]));
const rowRoots = (path, n) => {
  const Ls = [0];
  for (let i = 1; i < path.length; i++) Ls.push(Ls[i - 1] + Math.hypot(...v3.sub(path[i], path[i - 1])));
  return Array.from({ length: n }, (_, k) => {
    const d = ((k + 0.5) / n) * Ls[Ls.length - 1];
    let i = 1; while (i < path.length - 1 && Ls[i] < d) i++;
    return v3.lerp(path[i - 1], path[i], Math.min(1, Math.max(0, (d - Ls[i - 1]) / (Ls[i] - Ls[i - 1] || 1))));
  });
};
/** The default tooth rows in the head's frame (left side): { dentary, premax: [{ root, dir, len, r }] }. */
export function toothRows() {
  const dRoots = rowRoots(DENT_TOP.slice(0, 5).map((p, i) => off(p, [0.010 - 0.0015 * i, -0.007 + 0.001 * Math.min(4, i), -0.006 * Math.min(1, i)])), 12);
  const pRoots = rowRoots(PMX_ARM.map((p, i) => off(p, [0.020 - 0.003 * i, -0.001, -0.006 * Math.min(1, i)])), 13);
  const a = (JAW_FIT * Math.PI) / 180, dDir = v3.norm([-0.05 * Math.cos(a) - 1 * Math.sin(a), -0.05 * Math.sin(a) + 1 * Math.cos(a), -0.05]);
  const toM = (p) => toModel(p);
  return {
    dentary: dRoots.map((p, k) => ({ root: toM(jawFitPoint(p)), dir: dDir, len: DENT_FIT.toothH * (1 - 0.45 * ((k + 0.5) / 12)) * JAW_FIT_S, r: 0.0034 * (1 - 0.45 * ((k + 0.5) / 12)) })),
    premax: pRoots.map((p, k) => ({ root: toM(p), dir: v3.norm([0.1, -1, 0.1]), len: 0.012 * (1 - 0.45 * ((k + 0.5) / 13)), r: 0.0036 * (1 - 0.45 * ((k + 0.5) / 13)) })),
  };
}
/**
 * The tooth rows fitted to the sculpt (TOOTH_FIT): along its axis from its root, each tooth reaches to `tipIn` under the
 * first oral surface of the tissue round it (head: the head's field, headSDF); the front ones are the enlarged canines.
 * @returns { dentary, premax: [{ root, tip, r }] } (head frame, left side)
 */
export function fitTeeth(head, o = {}) {
  const F = { ...TOOTH_FIT, ...o }, rows = toothRows(), out = {};
  for (const [row, teeth] of Object.entries(rows)) {
    out[row] = teeth.map((t, k) => {
      // from the root along the axis, out of the tissue (the first exit into the mouth's air)
      let d = 0.002, exit = null;
      for (; d < F.maxLen[row]; d += 0.0005) { const q = v3.add(t.root, v3.mul(t.dir, d)); if (head(q[0], q[1], q[2]) > 0) { exit = d; break; } }
      // (a canine is longer by the gum drawn back further round it: `canine` [gum, radius] factors)
      const cf = F.canine[k] ?? [1, 1];
      const len = exit === null ? t.len : exit - F.tipIn;
      // (the bend: across the row toward its inside, the row's inward normal in (s, z) from its neighbours, made square to
      // the tooth's axis)
      const a = teeth[Math.max(0, k - 1)].root, c = teeth[Math.min(teeth.length - 1, k + 1)].root, ds = c[0] - a[0], dz = c[2] - a[2];
      let b = [dz, 0, -ds]; const bd = v3.dot(b, t.dir); b = v3.sub(b, v3.mul(t.dir, bd)); const bl = Math.hypot(...b) || 1; b = b.map((x) => x / bl);
      return { root: t.root, tip: v3.add(t.root, v3.mul(t.dir, len)), r: t.r * cf[1], exit, gum: cf[0], bend: b };
    });
  }
  return out;
}

/** One fitted tooth's field (model frame): a cone from its root, its upper `curve` of the length bent by `bend` of it. */
export function toothField(t, o = {}) {
  const F = { ...TOOTH_FIT, ...o }, len = Math.hypot(...v3.sub(t.tip, t.root));
  if (!t.bend || !(F.bend > 0)) return rod(t.root, t.tip, t.r, t.r * 0.18);
  const dir = v3.norm(v3.sub(t.tip, t.root)), mid = v3.add(t.root, v3.mul(dir, len * (1 - F.curve)));
  // (the crown's arc as two segments: half way up it bent a quarter, at the tip the whole `bend`)
  const q1 = v3.add(v3.add(mid, v3.mul(dir, len * F.curve * 0.5)), v3.mul(t.bend, len * F.bend * 0.25));
  const tip = v3.add(t.tip, v3.mul(t.bend, len * F.bend));
  const r1 = t.r * (0.18 + 0.82 * F.curve), r2 = t.r * (0.18 + 0.82 * F.curve * 0.5);
  const A = rod(t.root, mid, t.r, r1), B = rod(mid, q1, r1, r2), C = rod(q1, tip, r2, t.r * 0.18);
  return (x, y, z) => Math.min(A(x, y, z), B(x, y, z), C(x, y, z));
}

/**
 * Bone list: { name, joint, side: 'L'|'R'|'M', field, cart, tooth } (cart: cartilage, drawn blue in the x-ray view;
 * tooth: the teeth, which also show in the open mouth of the skin builds).
 * @param o { teeth: fitTeeth(head) — the tooth rows fitted to the sculpt; without it the default rows }
 */
export function skullBones(o = {}) {
  const bones = [];
  const add = (name, joint, side, field, cart = false) => bones.push({ name, joint, side, field, cart, tooth: name.startsWith('Teeth_') });
  // the right side is the left one mirrored (z → −z), so every frame, bend and winding stays consistent
  // (skin: the bone's former outline, kept for the skin's weights (headrig.mjs headWeights) where a bone was drawn in
  // under the rest skin, so no pose's skinning changes with it)
  const sided = (name, joint, make, cart = false, skin = null) => {
    const fL = make(), sL = skin ? skin() : null;
    const jR = joint.endsWith('L') ? `${joint.slice(0, -1)}R` : joint;
    add(`${name}_L`, joint, 'L', fL, cart);
    add(`${name}_R`, jR, 'R', (x, y, z) => fL(x, y, -z), cart);
    if (sL) { bones[bones.length - 2].skinField = sL; bones[bones.length - 1].skinField = (x, y, z) => sL(x, y, -z); }
  };

  // ------------------------------------------------------------------ neurocranium (J_head)
  // The frontals are reduced to one narrow arch between the orbits, which open upward: the eyes sit on top of the
  // skull, in a hole bounded only by the lateral ethmoids in front, the sphenotics behind and this bridge.
  add('Neurocranium', 'J_head', 'M', unionOf([
    // vomer: a small arrowhead under the ethmoid, its shaft running back into the parasphenoid
    plateFromPoints([off(L.vomer, [-0.01, 0, 0]), [0.215, 0.30, 0.03], [0.215, 0.30, -0.03]], 0.02),
    rod(L.vomer, L.paraFront, 0.012, 0.012),
    // parasphenoid: the floor of the orbits, rising back to the prootic, then level under the braincase
    polyRod([L.paraFront, L.paraMid, L.paraBack, [0.62, 0.45, 0], [0.86, 0.43, 0]], [0.012, 0.014, 0.018, 0.03, 0.025]),
    // mesethmoid knob and the ethmoid block between the lateral ethmoids
    ellipsoidF(F(L.mesethmoid, [1, 0, 0], [0, 1, 0]), [0.02, 0.025, 0.022]),
    ellipsoidF(F([0.19, 0.43, 0], [1, 0, 0], [0, 1, 0]), [0.035, 0.09, 0.05]),
    // the frontal arch: two narrow bars side by side, from the ethmoid up over the orbits to the postorbital roof
    polyRod([[0.19, 0.50, 0.012], [0.269, 0.591, 0.011], [0.34, 0.618, 0.010], [0.416, 0.627, 0.011], [0.49, 0.605, 0.04]], [0.011, 0.010, 0.009, 0.010, 0.02]),
    polyRod([[0.19, 0.50, -0.012], [0.269, 0.591, -0.011], [0.34, 0.618, -0.010], [0.416, 0.627, -0.011], [0.49, 0.605, -0.04]], [0.011, 0.010, 0.009, 0.010, 0.02]),
    // postorbital roof (frontals, sphenotics, pterotics, supraoccipital fused): a low dome widening backward
    plate(F([0.48, 0.585, 0], [1, 0, 0], [0, 0, 1]), [[0, -0.05], [0.03, -0.20], [0.30, -0.21], [0.36, -0.12], [0.36, 0.12], [0.30, 0.21], [0.03, 0.20], [0, 0.05]], 0.022, 0.011),
    // braincase and otic capsules under the roof, the pterosphenoid wall forming the orbit's back
    ellipsoidF(F([0.64, 0.50, 0], [1, 0.08, 0], [0, 1, 0]), [0.20, 0.085, 0.13]),
    ellipsoidF(F([0.52, 0.50, 0], [1, 0.2, 0], [0, 1, 0]), [0.06, 0.07, 0.10]),
    // supraoccipital: a low plate-like crest (P. modestus; not P. barbarus's spine), and the exoccipitals to the condyle
    plate(F([0.60, 0.585, 0], [1, 0, 0], [0, 1, 0]), [[0, 0], [0.10, 0.018], [0.20, -0.01], [0.24, -0.06], [0.10, -0.02]], 0.012),
    ellipsoidF(F([0.85, 0.44, 0], [1, 0, 0], [0, 1, 0]), [0.06, 0.04, 0.07]),
  ], 0.012));
  sided('LateralEthmoid', 'J_head', () => plateFromPoints([[0.20, 0.33, 0.02], [0.215, 0.33, 0.12], L.latEthWing, [0.205, 0.50, 0.12], L.latEthDorsal, [0.19, 0.52, 0.015]], 0.03, 0.012));
  sided('Lacrimal', 'J_head', () => plateFromPoints([L.lacrimalBottom, [0.17, 0.30, 0.182], [0.17, 0.39, 0.172], L.lacrimalTop, [0.125, 0.33, 0.176]], 0.008));
  sided('Sphenotic', 'J_head', () => unionOf([rod([0.50, 0.50, 0.12], L.sphenotic, 0.022, 0.012), plateFromPoints([[0.48, 0.55, 0.10], [0.52, 0.55, 0.19], L.sphenotic, [0.47, 0.50, 0.12]], 0.02)], 0.01));
  sided('Pterotic', 'J_head', () => unionOf([rod([0.62, 0.55, 0.18], L.pterotic, 0.025, 0.018), rod(L.pterotic, [0.80, 0.50, 0.17], 0.018, 0.014)], 0.01));
  sided('Epiotic', 'J_head', () => ellipsoidF(F(L.epiotic, [1, 0, 0], [0, 1, 0]), [0.04, 0.025, 0.035]));
  sided('Exoccipital', 'J_head', () => rod([0.80, 0.46, 0.06], L.exocc, 0.025, 0.015));

  // ------------------------------------------------------------------ upper jaw: premaxillae (J_premax), maxillae (J_maxL/R)
  // the premaxilla: a tall thin ascending process (0.18 HL, leaning back 21°) over a body at the symphysis and a
  // toothed alveolar arm curving back along the mouth's U to under the eye's front
  const pmxArm = PMX_ARM;
  // (with fitted teeth (o.teeth) the arm's alveolar flange reaches down to their roots: model frame, see TOOTH_FIT)
  const fT = o.teeth, toCT = (p) => [(p[0] - CT_S.shift) / CT_S.scale, p[1], p[2]];
  const modelField = (fm) => (x, y, z) => fm(CT_S.shift + CT_S.scale * x, y, z) / CT_S.scale;
  const fitRow = (row) => { const fs = row.map((t) => toothField(t)); return modelField((x, y, z) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y, z)); return d; }); };
  sided('Premaxilla', 'J_premax', () => unionOf([
    strap([L.pmxAscBase, mid(L.pmxAscBase, L.pmxAscTip), L.pmxAscTip].map((p) => off(p, [0, 0, 0.008])), [0.028, 0.025, 0.018], 0.008, [0, 0, 1]),
    strap([L.pmxFront, [0.012, 0.19, 0.004], off(L.pmxAscBase, [0, 0, 0.006])], 0.03, 0.012, [1, 0, 0]),  // the body at the symphysis
    sheet(pmxArm.map((p, i) => off(p, [0, 0.022 - i * 0.002, 0])), pmxArm.map((p) => off(p, [0, -0.012, 0])), 0.012),
    rod([0.040, 0.27, 0.025], [0.05, 0.25, 0.04], 0.008, 0.006),                                          // articular process
    ...(fT ? [(() => { const top = fT.premax.map((t) => toCT(t.root)), bot = fT.premax.map((t) => toCT(v3.add(t.tip, v3.mul(v3.norm(v3.sub(t.root, t.tip)), Math.min(0.012, 0.6 * Math.hypot(...v3.sub(t.tip, t.root))))))); return sheet(top, bot, TOOTH_FIT.flange); })()] : []),
  ], 0.004));
  // a single row of conical teeth, the front ones enlarged canines (Murdy 1989; Saberi et al. 2024)
  // the teeth stand on the arm's inner edge, behind the median lip's front (Murdy 1989: the upper lip overlaps both
  // rows when the mouth is closed), their tips at the gape
  sided('Teeth_Premaxilla', 'J_premax', () => fT ? fitRow(fT.premax) : teeth(pmxArm.map((p, i) => off(p, [0.020 - 0.003 * i, -0.001, -0.006 * Math.min(1, i)])), 13, 0.012, 0.0036, [0.1, -1, 0.1], 0.55));
  add('Cart_Rostral', 'J_premax', 'M', ellipsoidF(F(L.rostral, [0.3, 1, 0], [1, 0, 0]), [0.03, 0.02, 0.028]), true);
  // the maxilla: a slender rod from its twisted anterior loop (on the palatine and the premaxilla's articular
  // process) down and back to the rictus, its posterior end a flattened blade tied to the coronoid process
  sided('Maxilla', 'J_maxL', () => unionOf([
    polyRod([[0.030, 0.300, 0.030], [0.022, 0.330, 0.042], L.maxHead, [0.10, 0.312, 0.125], [0.20, 0.258, 0.182]], [0.008, 0.010, 0.013, 0.012, 0.012]),
    strap([[0.20, 0.258, 0.182], [0.26, 0.228, 0.200], L.maxEnd], [0.024, 0.032, 0.036], 0.008),
  ], 0.006));

  // ------------------------------------------------------------------ suspensorium (J_suspL/R)
  // the palatine: an ascending arch from its condyle on the lateral ethmoid to its head under the maxilla, and a
  // posterior plate; its ventral process is reduced, so a gap (a ligament) separates it from the ectopterygoid
  sided('Palatine', 'J_suspL', () => unionOf([
    polyRod([L.palCondyle, [0.11, 0.39, 0.085], [0.07, 0.345, 0.07], L.palHead], [0.014, 0.012, 0.011, 0.012]),
    plateFromPoints([[0.18, 0.40, 0.095], L.palPlateBack, [0.25, 0.27, 0.11], [0.19, 0.30, 0.10]], 0.012),
  ], 0.008));
  sided('Ectopterygoid', 'J_suspL', () => strap([L.ectoFront, mid(L.ectoFront, L.ectoBack), L.ectoBack], [0.016, 0.022, 0.02], 0.007));
  // the quadrate: a thin triangle with a long posterior arm, a fenestra between the arms, a saddle condyle
  sided('Quadrate', 'J_suspL', () => unionOf([
    plateFromPoints([L.quadCondyle, [0.42, 0.105, 0.19], [0.55, 0.13, 0.215], L.quadArm, [0.66, 0.185, 0.24], [0.52, 0.17, 0.21], [0.47, 0.22, 0.20], L.quadApex, [0.44, 0.30, 0.19], [0.36, 0.15, 0.178]], 0.012),
    ellipsoidF(F(L.quadCondyle, [0, 0, 1], [0, 1, 0]), [0.03, 0.022, 0.02]),
  ], 0.008));
  sided('Metapterygoid', 'J_suspL', () => plateFromPoints([[0.45, 0.27, 0.188], [0.53, 0.29, 0.198], L.metaptTip, [0.47, 0.33, 0.19]], 0.008));
  sided('Symplectic', 'J_suspL', () => rod(L.sympTop, L.sympBottom, 0.012, 0.007));
  // the hyomandibula: an inverted fan with two condyles on the skull, the opercular process behind, the shaft down
  sided('Hyomandibula', 'J_suspL', () => unionOf([
    plateFromPoints([L.hyoCondA, L.hyoCondP, [0.745, 0.44, 0.225], L.hyoOpProc, [0.69, 0.33, 0.235], [0.685, 0.25, 0.237], L.hyoShaft, [0.645, 0.27, 0.23], [0.61, 0.34, 0.215], L.hyoLobe], 0.014),
    ellipsoidF(F(L.hyoCondA, [1, 0, 0], [0, 1, 0]), [0.025, 0.018, 0.02]),
    ellipsoidF(F(L.hyoCondP, [1, 0, 0], [0, 1, 0]), [0.025, 0.018, 0.02]),
    ellipsoidF(F(L.hyoOpProc, [1, 0, 0], [0, 1, 0]), [0.02, 0.016, 0.016]),
  ], 0.008));
  // the preopercle: a narrow crescent strap, almost vertical, concave forward
  sided('Preopercle', 'J_suspL', () => strap([L.popTop, [0.684, 0.26, 0.262], [0.688, 0.18, 0.268], L.popAngle, [0.665, 0.105, 0.265], L.popFront], [0.03, 0.045, 0.05, 0.05, 0.04, 0.025], 0.01));

  // ------------------------------------------------------------------ lower jaw (J_jaw, J_imj)
  // the dentary: a curved wedge, shallow at the symphysis, deepening back to the tall coronoid process; the rami
  // diverge ≈28° from the midline; a single row of conical teeth
  // (refitted to the sculpt's lower jaw: DENT_FIT)
  const dentTop = DENT_TOP;
  const dentBot = [L.dentSymBottom, [0.040, 0.088, 0.040], [0.085, 0.066, 0.075], [0.150, 0.048, 0.103], L.dentVentral, [0.275, 0.045, 0.150]].map((p, i) => v3.lerp(dentTop[i], p, DENT_FIT.depth[i]));
  sided('Dentary', 'J_imjL', () => jawFitField(unionOf([
    sheet(dentTop, dentBot, 0.016),
    plateFromPoints([[0.245, 0.135, 0.155], [0.285, 0.13, 0.165], L.coronoid, [0.30, 0.25, 0.168], [0.25, 0.16, 0.157]], 0.012),   // coronoid process
  ], 0.006)));
  // the lower teeth stand on the dentary's inner (lingual) edge, behind the lower lip, their tips at the gape
  sided('Teeth_Dentary', 'J_imjL', () => fT ? fitRow(fT.dentary) : jawFitField(teeth(dentTop.slice(0, 5).map((p, i) => off(p, [0.010 - 0.0015 * i, -0.007 + 0.001 * Math.min(4, i), -0.006 * Math.min(1, i)])), 12, DENT_FIT.toothH, 0.0034, [-0.05, 1, -0.05], 0.55)));
  // the anguloarticular: a triangular block with the C-shaped socket behind and the retroarticular knob below (the
  // knob drawn 0.022 higher and a little medial of the landmark, a little smaller, inside the sculpt's narrow jaw corner:
  // it stood up to 0.036 HL out of the skin under the rictus)
  const RA = off(L.retroart, [0.004, 0.022, -0.008]);
  sided('Anguloarticular', 'J_jawL', () => jawFitField(unionOf([
    plateFromPoints([[0.26, 0.06, 0.155], [0.31, 0.04, 0.168], L.jawSocket, [0.33, 0.135, 0.172], [0.27, 0.15, 0.158]], 0.022),
    ellipsoidF(F(RA, [1, 0, 0], [0, 1, 0]), [0.022, 0.014, 0.013]),
    rod(RA, [0.325, 0.07, 0.168], 0.011, 0.015),
  ], 0.008)));
  // Meckel's cartilage inside the dentary
  sided('Cart_Meckel', 'J_jawL', () => jawFitField(polyRod([[0.06, 0.10, 0.07], [0.15, 0.09, 0.115], [0.29, 0.09, 0.165]], [0.006, 0.007, 0.008])), true);

  // ------------------------------------------------------------------ opercular series (J_opercL/R)
  // the opercle: a thin, laterally convex inverted triangle hinged on the opercular process
  sided('Opercle', 'J_opercRollL', () => plateFromPoints([L.opFacet, L.opPeak, L.opPostDorsal, L.opPostMid, L.opPostVentral, [0.93, 0.20, 0.315], [0.86, 0.13, 0.300], off(L.opApex, [0, 0, -0.008]), [0.77, 0.25, 0.27]], 0.01, 0.005, 0.6, [0, 1, 7]),
    false, () => plateFromPoints([L.opFacet, L.opPeak, L.opPostDorsal, L.opPostMid, L.opPostVentral, [0.93, 0.20, 0.315], [0.86, 0.13, 0.305], L.opApex, [0.77, 0.25, 0.27]], 0.01, 0.005, 0.6, [0, 1, 7]));
  // the subopercle: a sickle along the opercle's posteroventral edge, with an anterior ascending process
  // (its ventral curve 0.018 HL in from the landmark, and the opercle's apex 0.008, so both stay under the rest skin of
  // the head's lower flank: they stood 0.011-0.017 HL out of it at s 0.80-0.85, y 0.05)
  sided('Subopercle', 'J_opercRollL', () => strap([L.sopTop, [0.97, 0.21, 0.318], [0.92, 0.12, 0.304], off(L.sopCurve, [0, 0, -0.018]), [0.785, 0.105, 0.287], L.sopProc], [0.02, 0.035, 0.045, 0.045, 0.03, 0.015], 0.008),
    false, () => strap([L.sopTop, [0.97, 0.21, 0.318], [0.92, 0.12, 0.312], L.sopCurve, [0.785, 0.105, 0.292], L.sopProc], [0.02, 0.035, 0.045, 0.045, 0.03, 0.015], 0.008));
  sided('Interopercle', 'J_opercRollL', () => strap([L.iopFront, mid(L.iopFront, L.iopBack), L.iopBack], [0.022, 0.034, 0.03], 0.008));

  // ------------------------------------------------------------------ hyoid arch and branchiostegals (J_hyoid)
  add('Basihyal', 'J_hyoid', 'M', rod(L.basihyal, [0.29, 0.115, 0], 0.012, 0.014), true);
  sided('Hypohyal', 'J_chL', () => ellipsoidF(F(L.hypohyal, [1, 0.3, 0.5], [0, 1, 0]), [0.025, 0.02, 0.018]));
  sided('Ceratohyal', 'J_chL', () => unionOf([
    sheet([off(L.achFront, [0, 0.016, 0]), off(mid(L.achFront, L.achBack), [0, 0.024, 0]), off(L.achBack, [0, 0.03, 0]), off(L.pchTop, [0, 0.012, 0])],
      [off(L.achFront, [0, -0.014, 0]), off(mid(L.achFront, L.achBack), [0, -0.02, 0]), off(L.achBack, [0, -0.03, 0]), off(L.pchTop, [-0.02, -0.035, 0])], 0.014),
    rod(L.pchTop, L.interhyal, 0.01, 0.008),                                                             // interhyal
  ], 0.006));
  add('Urohyal', 'J_hyoid', 'M', plate(F(L.urohyalFront, [1, -0.1, 0], [0, 1, 0]), [[0, 0.012], [0.17, -0.005], [0.175, -0.025], [0.06, -0.035], [0, -0.01]], 0.008));
  // five rays fanning back and up along the floor and side of the opercular chamber; the 5th a broad blade
  for (let k = 0; k < 5; k++) {
    const t = k / 4;
    const root = [0.40 + 0.24 * t, 0.10 + 0.06 * t, 0.10 + 0.11 * t], tip0 = [0.85 + 0.14 * t, 0.03 + 0.06 * t, 0.25 + 0.07 * t], tip = off(tip0, [0, 0, -0.022 * (k === 4)]);
    // (the fifth ray's middle and tip 0.01 and 0.02 HL nearer the midline: they stood out of the rest skin's lower flank)
    const m1 = off(mid(root, tip, 0.45), [0, -0.035 + 0.01 * t, 0.045 - 0.01 * (k === 4)]);
    const m0 = off(mid(root, tip0, 0.45), [0, -0.035 + 0.01 * t, 0.045]);
    sided(`Branchiostegal${k + 1}`, 'J_bstegL', () => strap([root, m1, tip], [0.012, 0.014 + 0.03 * (k === 4), 0.008], 0.005), false, k === 4 ? () => strap([root, m0, tip0], [0.012, 0.044, 0.008], 0.005) : null);
  }

  // ------------------------------------------------------------------ gill arches (the branchial basket, envelope level)
  for (let k = 0; k < 4; k++) {
    const t = k / 3, floor = [0.33 + 0.07 * t, 0.095, 0.035], angle = [0.62 + 0.06 * t, 0.17 + 0.03 * t, 0.155 + 0.01 * t], top = [0.60 + 0.06 * t, 0.36, 0.06];
    sided(`GillArch${k + 1}`, 'J_head', () => polyRod([floor, mid(floor, angle), angle, top], [0.006, 0.007, 0.007, 0.006]));
  }

  // ------------------------------------------------------------------ pectoral girdle (on the trunk, rigid to the skull)
  sided('Posttemporal', 'J_head', () => unionOf([rod(L.pttDorsal, L.pttBack, 0.01, 0.012), rod(L.pttVentral, mid(L.pttDorsal, L.pttBack, 0.6), 0.008, 0.01)], 0.006));
  sided('Supracleithrum', 'J_head', () => strap([L.sclTop, L.sclBottom], 0.06, 0.01));
  sided('Cleithrum', 'J_head', () => strap([L.clTop, [1.012, 0.40, 0.27], L.clPostMid, L.clBend, [0.96, 0.15, 0.24], L.clLimb, [0.87, 0.075, 0.11], off(L.clSym, [0, 0, 0.012])], [0.03, 0.05, 0.06, 0.055, 0.045, 0.035, 0.025, 0.02], 0.012));
  sided('Scapula', 'J_head', () => plateFromPoints([[1.04, 0.33, 0.25], [1.085, 0.335, 0.26], [1.08, 0.41, 0.255], [1.045, 0.40, 0.25]], 0.01));
  sided('Coracoid', 'J_head', () => plateFromPoints([[1.035, 0.27, 0.245], [1.08, 0.25, 0.25], [1.04, 0.15, 0.235], [0.96, 0.13, 0.22], [1.0, 0.18, 0.24]], 0.01));
  return bones.map((b) => ({ ...b, field: fieldToModel(b.field), ...(b.skinField ? { skinField: fieldToModel(b.skinField) } : {}) }));
}

/** The skeleton grouped by joint (bind pose). */
export function bonesByJoint() {
  const g = {};
  for (const b of skullBones()) (g[b.joint] ??= []).push(b);
  return g;
}
