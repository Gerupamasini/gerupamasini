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
const fieldToModel = (f) => (x, y, z) => f((x - CT_S.shift) / CT_S.scale, y, z) * CT_S.scale;
/** A landmark in the head's frame (HL). */
export const lm = (name) => toModel(LM[name]);

// Joint pivots in the CT's frame and axes; parents first. Ranges (degrees or HL) are the measured ones (Michel 2014).
const JOINTS_CT = [
  // the head pitches on the first vertebra only a little (≤ 5°); the body does the rest
  { name: 'J_head', parent: null, pivot: L.condyle, axis: [0, 0, 1], range: [-5, 5] },
  // protrusion: a slide along the ascending process (anteroventral) and a tilt about its tip (+16°, front up)
  { name: 'J_premax', parent: 'J_head', pivot: L.pmxAscTip, axis: [0, 0, -1], slide: n3([-0.36, -0.93, 0]), range: [0, 16], slideRange: [0, 0.08] },
  // the maxilla swings its posterior end down and forward (+29°) and twists about its shaft (up to 90°)
  { name: 'J_maxL', parent: 'J_head', pivot: L.maxHead, axis: [0, 0, 1], twist: n3([0.80, -0.40, 0.46]), range: [0, 29] },
  { name: 'J_maxR', parent: 'J_head', pivot: [L.maxHead[0], L.maxHead[1], -L.maxHead[2]], axis: [0, 0, 1], twist: n3([0.80, -0.40, -0.46]), range: [0, 29] },
  // abduction: the ventral suspensorium swings out (−3 … +12°) about the palatine–hyomandibular line
  { name: 'J_suspL', parent: 'J_head', pivot: L.hyoCondA, axis: n3([-0.976, -0.085, -0.20]), range: [-3, 12] },
  { name: 'J_suspR', parent: 'J_head', pivot: [L.hyoCondA[0], L.hyoCondA[1], -L.hyoCondA[2]], axis: n3([0.976, 0.085, -0.20]), range: [-3, 12] },
  // the lower jaw drops about the line through both quadrate condyles (0 … 70°), the dentaries a further 0 … 30°
  { name: 'J_jaw', parent: 'J_head', pivot: [L.quadCondyle[0], L.quadCondyle[1], 0], axis: [0, 0, 1], range: [0, 70] },
  { name: 'J_imj', parent: 'J_jaw', pivot: [L.imj[0], L.imj[1], 0], axis: [0, 0, 1], range: [0, 30] },
  // the gill cover swings out (−6 … +20°) about its anterior margin and rises (0 … 8°) on the opercular process
  { name: 'J_opercL', parent: 'J_suspL', pivot: L.hyoOpProc, axis: n3([-0.26, 0.965, -0.03]), lift: n3([0.15, 0.10, 0.98]), range: [-6, 20] },
  { name: 'J_opercR', parent: 'J_suspR', pivot: [L.hyoOpProc[0], L.hyoOpProc[1], -L.hyoOpProc[2]], axis: n3([0.26, -0.965, -0.03]), lift: n3([0.15, 0.10, -0.98]), range: [-6, 20] },
  // the hyoid bars drop about the transverse line through the interhyal joints (0 … 18°)
  { name: 'J_hyoid', parent: 'J_head', pivot: [L.interhyal[0], L.interhyal[1], 0], axis: [0, 0, 1], range: [-3, 18] },
  // the eyes: rotation about the globe's centre; raised +0.03, lowered −0.13 (into the orbit) along y
  { name: 'J_eyeL', parent: 'J_head', pivot: [E.s, E.y, E.z] },
  { name: 'J_eyeR', parent: 'J_head', pivot: [E.s, E.y, -E.z] },
];
/** Joint pivots (HL, the head's frame) and axes; parents first. */
export const HEAD_JOINTS = JOINTS_CT.map((j) => (j.name.startsWith('J_eye') ? j : { ...j, pivot: toModel(j.pivot) }));

const F = (o, u, v) => frame(o, u, v);
const mid = (a, b, t = 0.5) => v3.lerp(a, b, t);
const off = (p, d) => v3.add(p, d);

/**
 * Bone list: { name, joint, side: 'L'|'R'|'M', field, cart, tooth } (cart: cartilage, drawn blue in the x-ray view;
 * tooth: the teeth, which also show in the open mouth of the skin builds).
 */
export function skullBones() {
  const bones = [];
  const add = (name, joint, side, field, cart = false) => bones.push({ name, joint, side, field, cart, tooth: name.startsWith('Teeth_') });
  // the right side is the left one mirrored (z → −z), so every frame, bend and winding stays consistent
  const sided = (name, joint, make, cart = false) => {
    const fL = make();
    const jR = joint.endsWith('L') ? `${joint.slice(0, -1)}R` : joint;
    add(`${name}_L`, joint, 'L', fL, cart);
    add(`${name}_R`, jR, 'R', (x, y, z) => fL(x, y, -z), cart);
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
  const pmxArm = [L.pmxFront, [0.012, 0.122, 0.035], [0.035, 0.132, 0.075], [0.075, 0.148, 0.110], [0.130, 0.165, 0.135], L.pmxArmEnd];
  sided('Premaxilla', 'J_premax', () => unionOf([
    strap([L.pmxAscBase, mid(L.pmxAscBase, L.pmxAscTip), L.pmxAscTip].map((p) => off(p, [0, 0, 0.008])), [0.028, 0.025, 0.018], 0.008, [0, 0, 1]),
    strap([L.pmxFront, [0.012, 0.19, 0.004], off(L.pmxAscBase, [0, 0, 0.006])], 0.03, 0.012, [1, 0, 0]),  // the body at the symphysis
    sheet(pmxArm.map((p, i) => off(p, [0, 0.022 - i * 0.002, 0])), pmxArm.map((p) => off(p, [0, -0.012, 0])), 0.012),
    rod([0.040, 0.27, 0.025], [0.05, 0.25, 0.04], 0.008, 0.006),                                          // articular process
  ], 0.004));
  // a single row of conical teeth, the front ones enlarged canines (Murdy 1989; Saberi et al. 2024)
  sided('Teeth_Premaxilla', 'J_premax', () => teeth(pmxArm.map((p) => off(p, [0.002, -0.016, 0.002])), 13, 0.024, 0.0045, [0, -1, 0.15], 0.5));
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
  // the dentary: a curved wedge, 0.03 deep at the symphysis, deepening back to the tall coronoid process; the rami
  // diverge ≈28° from the midline; a single row of conical teeth
  const dentTop = [L.dentSymTop, [0.020, 0.130, 0.040], [0.060, 0.127, 0.075], [0.120, 0.125, 0.105], [0.190, 0.130, 0.135], [0.250, 0.150, 0.155]];
  const dentBot = [L.dentSymBottom, [0.040, 0.088, 0.040], [0.085, 0.066, 0.075], [0.150, 0.048, 0.103], L.dentVentral, [0.275, 0.045, 0.150]];
  sided('Dentary', 'J_imj', () => unionOf([
    sheet(dentTop, dentBot, 0.016),
    plateFromPoints([[0.245, 0.135, 0.155], [0.285, 0.13, 0.165], L.coronoid, [0.30, 0.25, 0.168], [0.25, 0.16, 0.157]], 0.012),   // coronoid process
  ], 0.006));
  sided('Teeth_Dentary', 'J_imj', () => teeth(dentTop.slice(0, 5).map((p) => off(p, [0.004, 0.004, 0.0])), 12, 0.02, 0.004, [0, 1, 0.1], 0.55));
  // the anguloarticular: a triangular block with the C-shaped socket behind and the retroarticular knob below
  sided('Anguloarticular', 'J_jaw', () => unionOf([
    plateFromPoints([[0.26, 0.06, 0.155], [0.31, 0.04, 0.168], L.jawSocket, [0.33, 0.135, 0.172], [0.27, 0.15, 0.158]], 0.022),
    ellipsoidF(F(L.retroart, [1, 0, 0], [0, 1, 0]), [0.025, 0.018, 0.016]),
    rod(L.retroart, [0.325, 0.07, 0.172], 0.012, 0.016),
  ], 0.008));
  // Meckel's cartilage inside the dentary
  sided('Cart_Meckel', 'J_jaw', () => polyRod([[0.06, 0.10, 0.07], [0.15, 0.09, 0.115], [0.29, 0.09, 0.165]], [0.006, 0.007, 0.008]), true);

  // ------------------------------------------------------------------ opercular series (J_opercL/R)
  // the opercle: a thin, laterally convex inverted triangle hinged on the opercular process
  sided('Opercle', 'J_opercL', () => plateFromPoints([L.opFacet, L.opPeak, L.opPostDorsal, L.opPostMid, L.opPostVentral, [0.93, 0.20, 0.315], [0.86, 0.13, 0.305], L.opApex, [0.77, 0.25, 0.27]], 0.01, 0.005, 0.6, [0, 1, 7]));
  // the subopercle: a sickle along the opercle's posteroventral edge, with an anterior ascending process
  sided('Subopercle', 'J_opercL', () => strap([L.sopTop, [0.97, 0.21, 0.318], [0.92, 0.12, 0.312], L.sopCurve, [0.785, 0.105, 0.292], L.sopProc], [0.02, 0.035, 0.045, 0.045, 0.03, 0.015], 0.008));
  sided('Interopercle', 'J_opercL', () => strap([L.iopFront, mid(L.iopFront, L.iopBack), L.iopBack], [0.022, 0.034, 0.03], 0.008));

  // ------------------------------------------------------------------ hyoid arch and branchiostegals (J_hyoid)
  add('Basihyal', 'J_hyoid', 'M', rod(L.basihyal, [0.29, 0.115, 0], 0.012, 0.014), true);
  sided('Hypohyal', 'J_hyoid', () => ellipsoidF(F(L.hypohyal, [1, 0.3, 0.5], [0, 1, 0]), [0.025, 0.02, 0.018]));
  sided('Ceratohyal', 'J_hyoid', () => unionOf([
    sheet([off(L.achFront, [0, 0.016, 0]), off(mid(L.achFront, L.achBack), [0, 0.024, 0]), off(L.achBack, [0, 0.03, 0]), off(L.pchTop, [0, 0.012, 0])],
      [off(L.achFront, [0, -0.014, 0]), off(mid(L.achFront, L.achBack), [0, -0.02, 0]), off(L.achBack, [0, -0.03, 0]), off(L.pchTop, [-0.02, -0.035, 0])], 0.014),
    rod(L.pchTop, L.interhyal, 0.01, 0.008),                                                             // interhyal
  ], 0.006));
  add('Urohyal', 'J_hyoid', 'M', plate(F(L.urohyalFront, [1, -0.1, 0], [0, 1, 0]), [[0, 0.012], [0.17, -0.005], [0.175, -0.025], [0.06, -0.035], [0, -0.01]], 0.008));
  // five rays fanning back and up along the floor and side of the opercular chamber; the 5th a broad blade
  for (let k = 0; k < 5; k++) {
    const t = k / 4;
    const root = [0.40 + 0.24 * t, 0.10 + 0.06 * t, 0.10 + 0.11 * t], tip = [0.85 + 0.14 * t, 0.03 + 0.06 * t, 0.25 + 0.07 * t];
    const m1 = off(mid(root, tip, 0.45), [0, -0.035 + 0.01 * t, 0.045]);
    sided(`Branchiostegal${k + 1}`, 'J_hyoid', () => strap([root, m1, tip], [0.012, 0.014 + 0.03 * (k === 4), 0.008], 0.005));
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
  return bones.map((b) => ({ ...b, field: fieldToModel(b.field) }));
}

/** The skeleton grouped by joint (bind pose). */
export function bonesByJoint() {
  const g = {};
  for (const b of skullBones()) (g[b.joint] ??= []).push(b);
  return g;
}
