// Layout of the per-fish rig data texture (RGBA32F, one row per fish).
//
//   [spine positions  NS texels]  world xyz, w = unused
//   [spine rotations  NS texels]  world quaternion (x,y,z,w)
//   [fin chain nodes  2 texels per node] position xyz / membrane normal xyz
//   [misc             MISC texels]
//
// Every simulated fin "ray chain" is a polyline of `nodes` points. The GPU
// reconstructs fin membranes by Catmull-Rom interpolation along and across
// chains, so the fin surface bends continuously (no rigid cards).

import { buildFinDefs } from './morphology.js';

export const NS = 24; // spine samples from snout (s=0) to caudal base (s=1)
export const MISC = 4;

export const FIN_TYPES = { caudal: 0, dorsal: 1, anal: 2, pectoral: 3, pelvic: 4 };

/** Ordered fin instances of one fish. Paired fins appear twice (side +1 = left). */
export function finInstances() {
  const defs = buildFinDefs();
  return [
    { name: 'caudal', type: 0, side: 0, def: defs.caudal },
    { name: 'dorsal', type: 1, side: 0, def: defs.dorsal },
    { name: 'anal', type: 2, side: 0, def: defs.anal },
    { name: 'pectoralL', type: 3, side: 1, def: defs.pectoral },
    { name: 'pectoralR', type: 3, side: -1, def: defs.pectoral },
    { name: 'pelvicL', type: 4, side: 1, def: defs.pelvic },
    { name: 'pelvicR', type: 4, side: -1, def: defs.pelvic },
  ];
}

export function buildRigLayout() {
  const fins = finInstances();
  let texel = 2 * NS;
  for (const f of fins) {
    f.nChains = f.def.chains.length;
    f.nNodes = f.def.nodes;
    f.base = texel;
    texel += f.nChains * f.nNodes * 2;
  }
  const misc = texel;
  texel += MISC;
  return { width: texel, fins, misc, NS };
}
