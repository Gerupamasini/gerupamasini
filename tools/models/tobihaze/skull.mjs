// The トビハゼ head skeleton: every bone as a primitive of skel.mjs in the fish frame (HL units; s back from the snout
// tip, y up from the head's flat underside, z to the fish's LEFT), the left side given and mirrored, midline bones at
// z = 0. Each bone hangs from the joint that moves it, so posing the joints (rig) moves the bones as the real head does:
//   J_head      neurocranium (with the eyes' sockets) — the frame everything else is hung from
//   J_premax    premaxillae (upper jaw), sliding forward and down on the ethmoid when the mouth opens
//   J_maxL/R    maxillae, swinging forward about their head on the palatine as the lower jaw drops
//   J_jaw       lower jaw (dentaries + anguloarticulars), hinged on the quadrates
//   J_suspL/R   suspensorium (palatine–pterygoids–quadrate–symplectic–hyomandibula–preopercle), swinging out
//               about the hyomandibula's articulation with the skull (the cheeks widen, the mouth cavity expands)
//   J_opercL/R  opercular series (opercle, subopercle, interopercle), rotating out and up on the hyomandibula
//   J_hyoid     hyoid arch and branchiostegal rays, dropping the floor of the mouth and the throat
//   J_eyeL/R    the eye globes (rotation; elevation and retraction as translation)
// Positions are a first layout from gobioid osteology (Murdy 1989; Kim 1990; Saberi et al. 2022), fitted inside the
// photo-matched head (head.mjs); research/anat_osteology.md refines them.
import { rod, polyRod, plate, frame, ellipsoidF, unionOf, v3 } from './skel.mjs';
import { HEAD } from './anatomy.mjs';

const E = HEAD.eye;
const M = (p) => [p[0], p[1], -p[2]]; // mirror to the right side

/** Joint pivots (HL, fish frame) and hinge axes; parents first. */
export const HEAD_JOINTS = [
  { name: 'J_head', parent: null, pivot: [0.75, 0.40, 0] },
  { name: 'J_premax', parent: 'J_head', pivot: [0.10, 0.27, 0], slide: v3.norm([-0.55, -0.83, 0]) },
  { name: 'J_maxL', parent: 'J_head', pivot: [0.075, 0.245, 0.075], axis: v3.norm([0.15, 0.35, 1]) },
  { name: 'J_maxR', parent: 'J_head', pivot: [0.075, 0.245, -0.075], axis: v3.norm([0.15, 0.35, -1]) },
  { name: 'J_suspL', parent: 'J_head', pivot: [0.60, 0.47, 0.16], axis: v3.norm([0.95, 0.30, 0]) },
  { name: 'J_suspR', parent: 'J_head', pivot: [0.60, 0.47, -0.16], axis: v3.norm([0.95, 0.30, 0]) },
  // the lower jaw's hinge axis runs through both quadrate–articular joints
  { name: 'J_jaw', parent: 'J_head', pivot: [0.34, 0.095, 0], axis: [0, 0, 1] },
  { name: 'J_opercL', parent: 'J_suspL', pivot: [0.68, 0.46, 0.26], axis: v3.norm([0.25, 1, 0.15]) },
  { name: 'J_opercR', parent: 'J_suspR', pivot: [0.68, 0.46, -0.26], axis: v3.norm([0.25, 1, -0.15]) },
  { name: 'J_hyoid', parent: 'J_head', pivot: [0.58, 0.21, 0], axis: [0, 0, 1] },
  { name: 'J_eyeL', parent: 'J_head', pivot: [E.s, E.y, E.z] },
  { name: 'J_eyeR', parent: 'J_head', pivot: [E.s, E.y, -E.z] },
];

const F = (o, u, v) => frame(o, u, v);
/** Bone list: { name, joint, side: 'L'|'R'|'M', field, cart? } (cart: cartilage, drawn blue in the x-ray view). */
export function skullBones() {
  const bones = [];
  const add = (name, joint, side, field, cart = false) => bones.push({ name, joint, side, field, cart });
  // the right side is the left one mirrored (z → −z), so every frame, bend and winding stays consistent
  const sided = (name, jointL, jointR, make) => {
    const fL = make((p) => p);
    add(`${name}_L`, jointL, 'L', fL);
    add(`${name}_R`, jointR, 'R', (x, y, z) => fL(x, y, -z));
  };

  // ---- neurocranium (J_head)
  add('Neurocranium', 'J_head', 'M', unionOf([
    ellipsoidF(F([0.64, 0.40, 0], [1, 0.12, 0], [0, 1, 0]), [0.24, 0.13, 0.13]),            // braincase
    ellipsoidF(F([0.11, 0.30, 0], [1, 0.3, 0], [0, 1, 0]), [0.065, 0.055, 0.075]),          // ethmoid
    rod([0.12, 0.33, 0], [0.42, 0.52, 0], 0.028, 0.035),                                    // frontals: the narrow interorbital bar
    rod([0.12, 0.24, 0], [0.62, 0.30, 0], 0.014, 0.02),                                     // parasphenoid
    rod([0.62, 0.48, 0], [0.86, 0.50, 0], 0.03, 0.02),                                      // supraoccipital crest
  ], 0.03));
  sided('Otic', 'J_head', 'J_head', (m) => ellipsoidF(F(m([0.66, 0.44, 0.13]), [1, 0, 0], [0, 1, 0]), [0.10, 0.06, 0.05]));
  add('Cart_Rostral', 'J_premax', 'M', ellipsoidF(F([0.075, 0.23, 0], [0.55, 0.83, 0], [1, 0, 0]), [0.045, 0.02, 0.03]), true);

  // ---- upper jaw: premaxillae (J_premax) and maxillae (J_maxL/R)
  sided('Premaxilla', 'J_premax', 'J_premax', (m) => unionOf([
    polyRod([[0.035, 0.135, 0.004], [0.055, 0.132, 0.08], [0.12, 0.124, 0.155], [0.20, 0.114, 0.19], [0.265, 0.104, 0.202]].map(m), [0.013, 0.013, 0.011, 0.009, 0.006]),
    rod(m([0.040, 0.140, 0.012]), m([0.115, 0.265, 0.012]), 0.010, 0.006),               // ascending process
  ]));
  sided('Maxilla', 'J_maxL', 'J_maxR', (m) => polyRod([[0.075, 0.245, 0.075], [0.15, 0.185, 0.155], [0.235, 0.135, 0.195], [0.285, 0.105, 0.205]].map(m), [0.016, 0.013, 0.012, 0.014]));
  sided('Palatine', 'J_suspL', 'J_suspR', (m) => rod(m([0.085, 0.25, 0.085]), m([0.26, 0.30, 0.14]), 0.014, 0.011));

  // ---- lower jaw (J_jaw)
  sided('Dentary', 'J_jaw', 'J_jaw', (m) => unionOf([
    polyRod([[0.075, 0.068, 0.004], [0.10, 0.066, 0.085], [0.17, 0.064, 0.16], [0.25, 0.072, 0.20]].map(m), [0.014, 0.014, 0.012, 0.012]),
    rod(m([0.235, 0.072, 0.198]), m([0.255, 0.135, 0.20]), 0.012, 0.007),                // coronoid process
  ]));
  sided('Anguloarticular', 'J_jaw', 'J_jaw', (m) => rod(m([0.23, 0.070, 0.20]), m([0.355, 0.092, 0.215]), 0.016, 0.014));

  // ---- suspensorium (J_suspL/R)
  sided('Quadrate', 'J_suspL', 'J_suspR', (m) => plate(F(m([0.34, 0.095, 0.215]), [1, 0, 0], [0, 1, 0]), [[0, 0], [0.14, 0.03], [0.07, 0.17]], 0.012));
  sided('Pterygoids', 'J_suspL', 'J_suspR', (m) => plate(F(m([0.26, 0.20, 0.17]), [1, 0.15, 0.25], [0, 1, 0]), [[0, 0], [0.30, 0.0], [0.30, 0.17], [0.10, 0.16]], 0.008));
  sided('Hyomandibula', 'J_suspL', 'J_suspR', (m) => unionOf([
    rod(m([0.60, 0.46, 0.17]), m([0.575, 0.21, 0.215]), 0.022, 0.016),
    plate(F(m([0.53, 0.46, 0.17]), [1, 0, 0], [0, 1, 0]), [[0, 0], [0.16, 0], [0.09, -0.12]], 0.012),
  ]));
  sided('Symplectic', 'J_suspL', 'J_suspR', (m) => rod(m([0.575, 0.21, 0.215]), m([0.43, 0.14, 0.215]), 0.010, 0.007));
  sided('Preopercle', 'J_suspL', 'J_suspR', (m) => polyRod([[0.665, 0.48, 0.245], [0.655, 0.30, 0.27], [0.635, 0.12, 0.275], [0.58, 0.06, 0.26], [0.42, 0.045, 0.24]].map(m), [0.012, 0.016, 0.016, 0.014, 0.008]));

  // ---- opercular series (J_opercL/R)
  sided('Opercle', 'J_opercL', 'J_opercR', (m) => plate(F(m([0.68, 0.46, 0.27]), [1, -0.05, 0.12], [0, 1, 0]), [[0, 0], [0.31, -0.02], [0.29, -0.24], [0.06, -0.20]], 0.010, 0.006, 0.25));
  sided('Subopercle', 'J_opercL', 'J_opercR', (m) => plate(F(m([0.70, 0.20, 0.28]), [1, 0.02, 0.05], [0, 1, 0]), [[0, 0], [0.27, 0.01], [0.23, -0.12], [0.03, -0.11]], 0.008));
  sided('Interopercle', 'J_opercL', 'J_opercR', (m) => plate(F(m([0.44, 0.06, 0.245]), [1, 0.15, 0.1], [0, 1, 0]), [[0, 0], [0.24, 0.02], [0.24, -0.04], [0.02, -0.035]], 0.008));

  // ---- hyoid arch and branchiostegals (J_hyoid)
  sided('Ceratohyal', 'J_hyoid', 'J_hyoid', (m) => polyRod([[0.575, 0.205, 0.20], [0.49, 0.11, 0.18], [0.33, 0.045, 0.11], [0.23, 0.035, 0.035]].map(m), [0.014, 0.022, 0.016, 0.012]));
  for (let k = 0; k < 5; k++) {
    const t = k / 4, root = [0.36 + 0.17 * t, 0.05 + 0.05 * t, 0.12 + 0.06 * t], tip = [0.62 + 0.30 * t, 0.025 + 0.06 * t, 0.24 + 0.04 * t];
    const mid = v3.add(v3.lerp(root, tip, 0.5), [0, -0.012, 0.03]);
    sided(`Branchiostegal${k + 1}`, 'J_hyoid', 'J_hyoid', (m) => polyRod([root, mid, tip].map(m), [0.005, 0.005, 0.003]));
  }
  add('Urohyal', 'J_hyoid', 'M', unionOf([rod([0.25, 0.02, 0], [0.56, 0.005, 0], 0.012, 0.006), plate(F([0.30, 0.02, 0], [1, -0.05, 0], [0, 1, 0]), [[0, 0], [0.24, -0.01], [0.20, 0.035]], 0.006)]));

  // ---- pectoral girdle (on the trunk; drawn here for the layout)
  sided('Cleithrum', 'J_head', 'J_head', (m) => polyRod([[0.92, 0.58, 0.22], [0.99, 0.44, 0.28], [1.04, 0.22, 0.29], [0.94, 0.03, 0.18]].map(m), [0.012, 0.016, 0.018, 0.010]));
  return bones;
}

/** The skeleton's field for posing: { [boneName]: field } grouped by joint (bind pose). */
export function bonesByJoint() {
  const g = {};
  for (const b of skullBones()) (g[b.joint] ??= []).push(b);
  return g;
}
