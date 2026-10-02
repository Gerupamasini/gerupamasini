// Level of detail for ユビナガホンヤドカリ.
//
//   LOD0 macro / close-up : observation lock, tank, zukan. Full geometry (~32k tris body), long setae as
//                           geometry + setae cards, mouthparts, P4/P5, abdomen, spines and spinules,
//                           12-bone antennal flagella with dynamics, shell LOD0.
//   LOD1 normal gameplay  : ~10k tris, fewer setae cards, no spines, same rig and full behaviour.
//   LOD2 distant          : ~2.7k tris, no setae/mouthparts/abdomen, cheap antennae, half-rate IK,
//                           slower decisions, no shadow casting.
// Budgets follow docs/spec/02 §7 (hero ≤ 400k, lod1 ≤ 30k, lod2 ≤ 4k triangles).
export const LOD_TIERS = [
  { id: 0, name: 'LOD0', maxDist: 0.9, shellLOD: 0, castShadow: true, setae: true, decisionHz: 8 },
  { id: 1, name: 'LOD1', maxDist: 4.5, shellLOD: 1, castShadow: true, setae: true, decisionHz: 6 },
  { id: 2, name: 'LOD2', maxDist: Infinity, shellLOD: 2, castShadow: false, setae: false, decisionHz: 2 },
];

export const BUDGET = {
  trianglesBody: [32200, 10200, 2660],
  trianglesShell: [40000, 8000, 1300],
  drawCalls: [4, 4, 3], // body, setae, shell, contact shadow (LOD2: no setae)
  skinnedMeshes: [2, 2, 1],
  bones: 137,
  textures: 0, // all surface detail is procedural
  transparentMaterials: 1, // contact shadow only (setae use alpha test + alpha-to-coverage)
};

/**
 * Pick a tier from the camera/player distance with 12 % hysteresis. LOD0 (macro) is reserved for
 * close-up views (observation lock, tank, zukan).
 * @param {number} dist metres
 * @param {{locked?: boolean, closeup?: boolean, current?: number}} o
 */
export function chooseLOD(dist, o = {}) {
  if (o.locked || o.closeup) return 0;
  const lim = LOD_TIERS[1].maxDist * ((o.current ?? 1) <= 1 ? 1.12 : 0.88);
  return dist <= lim ? 1 : 2;
}
