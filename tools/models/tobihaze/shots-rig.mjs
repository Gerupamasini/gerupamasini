// Rig pose shots (render.mjs --shots shots-rig.mjs, on a posed whole-fish GLB): the fish framed whole from the side,
// 3/4 above and below, from above and behind; close-ups of the left pectoral arm (its root on the flank, the elbow and
// the wrist, from the side, from below and from behind) and of the head (face, side, front, below). The posed GLBs carry
// their own regions in the root's extras: `fish` (the posed bounding box), `armL` / `armR` (round the posed arm), `head`.
// Every view also comes as x_<name>, drawn in the GLB's own colours (the stretch and weight maps written as vertex
// colours) instead of clay.
// Body poses: --only p_side,p_q34,p_top,p_low,p_rear,a_side,a_low,a_back; head poses: --only h_q34,h_side,h_front,h_low.
const VIEWS = {
  p_side: { fit: 'fish', azim: 90, elev: 0, ortho: true },
  p_q34: { fit: 'fish', azim: 40, elev: 20 },
  p_top: { fit: 'fish', azim: 0, elev: 90, ortho: true, topUp: 1 },
  p_low: { fit: 'fish', azim: 55, elev: -18 },
  p_rear: { fit: 'fish', azim: 145, elev: 22 },
  p_front: { fit: 'fish', azim: 10, elev: 8 },
  a_side: { fit: 'armL', azim: 90, elev: 5, margin: 0.25, fov: 22 },
  a_low: { fit: 'armL', azim: 30, elev: -35, margin: 0.25, fov: 22 },
  a_back: { fit: 'armL', azim: 150, elev: 15, margin: 0.25, fov: 22 },
  a_front: { fit: 'armL', azim: 20, elev: 10, margin: 0.25, fov: 22 },
  h_q34: { fit: 'head', azim: 40, elev: 12, margin: 0.04, fov: 24 },
  h_side: { fit: 'head', azim: 90, elev: 0, margin: 0.04, fov: 24 },
  h_front: { fit: 'head', azim: 0, elev: 5, margin: 0.04, fov: 24 },
  h_low: { fit: 'head', azim: 30, elev: -25, margin: 0.04, fov: 24 },
};
const view = (v) => ({ margin: 0.06, fov: 25, ...v });
export const SHOTS = [
  ...Object.entries(VIEWS).map(([name, v]) => ({ name, mode: 'clay', view: view(v) })),
  ...Object.entries(VIEWS).map(([name, v]) => ({ name: `x_${name}`, mode: 'textured', view: view(v) })),
];
