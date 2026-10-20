// The whole-fish comparison shots (render.mjs --shots shots-body.mjs, on a build-clay.mjs --body GLB):
//   b_*   orthographic side, top, front, underside and rear, and free perspective views (clay)
//   ms_*  measurement silhouettes: orthographic, framed on a fixed box (MEASURE below) with no margin, so a pixel maps
//         to the fish frame exactly (the photo overlays in the trunk round read the box back from here); render them at
//         the box's aspect (side 1400 × 750, top 600 × 1120, front 900 × 750)
//   mc_*  the same framing in clay
//   m_*   perspective views matched to the reference photos' cameras (elevation and turn estimated from each photo):
//         lateral A030 / A002 / u1 (fish facing right: azim < 0, its right side) and A070 (facing left), 3/4 A005 /
//         B010 / B067 / A042 (the propped arm), front B002 (from about 30° above)
//   j_*   the head–trunk junction behind the gill cover close up (side, above, below): rings or steps show here
//   t_*   the peduncle's end (side, 3/4, above); v_low the anus and the urogenital papilla from below
//   l_*   the pectoral lobe close up (side, front, 3/4, behind, below), framed on a box round the left arm
//   p_*   the pelvic base under the chest (side, from below and in front) and the front views that show whether the trunk
//         stays inside the head's outline (f_level: straight on; m_u5: the owner's u5, the fish's front raised ~12° so the
//         camera sits that much below the bind fish's axis)
//   e_*   the peduncle's end plate (from above and below, square on: the taper of its half-width, the plate's edge)
// (round B1: the matched photos and the overlays are in the scratchpad's ref/cmp/b1_trunk_*.jpg; the photos' cameras
// for A030 / A002 are near-lateral telephoto shots, u1 a low close shot from in front of the right side, B010 / A005 the
// same fish from above its left side, B067 the left side from a little in front, B002 from about 30° above the snout;
// round B2's sheets ref/cmp/b2_trunk_*.jpg, with the lateral overlays computed from the field: scratchpad
// ref/work/b2_trunk/scripts sil.mjs + ovl.py, matched at the snout tip and the caudal base, the head as the scale check)
import { HL, toObject } from './anatomy.mjs';

const box = (s0, s1, y0, y1, z0, z1) => {
  const a = toObject([s0 * HL, y0 * HL, z0 * HL]), b = toObject([s1 * HL, y1 * HL, z1 * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
/** The measurement frames (fish frame, HL): [s0, s1, y0, y1, z0, z1]. */
export const MEASURE = {
  side: [-0.3, 5.3, -1.3, 1.7, -0.8, 0.8],
  top: [-0.3, 5.3, -0.4, 1.0, -1.5, 1.5],
  front: [-0.3, 5.3, -0.6, 1.0, -0.96, 0.96],
};
const M = Object.fromEntries(Object.entries(MEASURE).map(([k, v]) => [k, box(...v)]));
const lobeBox = box(0.80, 1.75, -0.40, 0.70, -0.05, 0.62), chest = box(0.70, 1.80, -0.40, 0.75, -0.62, 0.62);
// the head–trunk junction behind the gill cover (for rings or steps in the highlights) and the tail's end
const junction = box(0.85, 1.65, -0.15, 0.70, -0.40, 0.40), tail = box(3.40, 4.40, 0.0, 0.55, -0.15, 0.15), vent = box(2.20, 2.75, -0.15, 0.20, -0.15, 0.15);
const plate = box(3.95, 4.30, 0.05, 0.42, -0.12, 0.12), pelvis = box(0.85, 1.55, -0.10, 0.35, -0.30, 0.30);
const clay = (name, view) => ({ name, mode: 'clay', view: { fit: 'body', margin: 0.06, ...view } });
const sil = (name, view) => ({ name, mode: 'silhouette', view: { margin: 0, ...view } });

export const SHOTS = [
  clay('b_side', { azim: -90, elev: 0, ortho: true }),
  clay('b_sideL', { azim: 90, elev: 0, ortho: true }),
  clay('b_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  clay('b_front', { azim: 0, elev: 0, ortho: true }),
  clay('b_under', { azim: 0, elev: -90, ortho: true, topUp: 1 }),
  clay('b_rear', { azim: 180, elev: 0, ortho: true }),
  clay('b_q34', { azim: -40, elev: 22, fov: 25 }),
  clay('b_q34r', { azim: -130, elev: 25, fov: 25 }),
  clay('b_low', { azim: -60, elev: 6, fov: 25 }),
  // measurement silhouettes and their clay (fixed frames, no margin)
  sil('ms_side', { azim: -90, elev: 0, ortho: true, fit: M.side }),
  sil('ms_sideL', { azim: 90, elev: 0, ortho: true, fit: M.side }),
  sil('ms_top', { azim: 0, elev: 90, ortho: true, topUp: 1, fit: M.top }),
  sil('ms_front', { azim: 0, elev: 0, ortho: true, fit: M.front }),
  { name: 'mc_side', mode: 'clay', view: { azim: -90, elev: 0, ortho: true, margin: 0, fit: M.side } },
  { name: 'mc_sideL', mode: 'clay', view: { azim: 90, elev: 0, ortho: true, margin: 0, fit: M.side } },
  { name: 'mc_top', mode: 'clay', view: { azim: 0, elev: 90, ortho: true, topUp: 1, margin: 0, fit: M.top } },
  // matched to the photos
  clay('m_A030', { azim: -90, elev: 4, fov: 8 }),
  clay('m_A002', { azim: -97, elev: 3, fov: 10 }),
  clay('m_A070', { azim: 92, elev: 5, fov: 10 }),
  clay('m_u1', { azim: -104, elev: 3, fov: 36, fit: chest, margin: 0.25 }),
  clay('m_A005', { azim: 70, elev: 24, fov: 22 }),
  clay('m_B010', { azim: 72, elev: 30, fov: 24, fit: chest, margin: 0.1 }),
  clay('m_B067', { azim: 64, elev: 6, fov: 24, fit: chest, margin: 0.1 }),
  clay('m_A042', { azim: 60, elev: 62, fov: 20 }),
  clay('m_B002', { azim: 0, elev: 28, fov: 30, fit: chest, margin: 0.05 }),
  clay('m_B051', { azim: 0, elev: 62, fov: 14, fit: chest, margin: 0.05 }),
  clay('m_A036', { azim: 0, elev: 90, topUp: -1, fov: 8 }),
  // the junction in raking light (the key light low behind the camera's side) from the side, above and below; the tail's
  // end; the vent and the urogenital papilla
  { name: 'j_side', mode: 'clay', view: { azim: 75, elev: 12, fov: 22, fit: junction, margin: 0.04 } },
  { name: 'j_top', mode: 'clay', view: { azim: 60, elev: 55, fov: 22, fit: junction, margin: 0.04 } },
  { name: 'j_under', mode: 'clay', view: { azim: 50, elev: -40, fov: 22, fit: junction, margin: 0.04 } },
  { name: 't_side', mode: 'clay', view: { azim: 90, elev: 5, fov: 22, fit: tail, margin: 0.06 } },
  { name: 't_q34', mode: 'clay', view: { azim: 130, elev: 25, fov: 22, fit: tail, margin: 0.06 } },
  { name: 't_top', mode: 'clay', view: { azim: 0, elev: 90, topUp: 1, fov: 22, fit: tail, margin: 0.06 } },
  { name: 'v_low', mode: 'clay', view: { azim: 70, elev: -30, fov: 22, fit: vent, margin: 0.1 } },
  // the left arm close up
  clay('l_side', { azim: 90, elev: 0, fov: 20, fit: lobeBox, margin: 0.05 }),
  clay('l_front', { azim: 15, elev: 5, fov: 20, fit: lobeBox, margin: 0.05 }),
  clay('l_q34', { azim: 50, elev: 25, fov: 20, fit: lobeBox, margin: 0.05 }),
  clay('l_back', { azim: 140, elev: 15, fov: 20, fit: lobeBox, margin: 0.05 }),
  clay('l_under', { azim: 60, elev: -35, fov: 20, fit: lobeBox, margin: 0.05 }),
  // round B2: the pelvic base, the front views, the end plate
  clay('p_side', { azim: 90, elev: -6, fov: 20, fit: pelvis, margin: 0.05 }),
  clay('p_under', { azim: 30, elev: -55, fov: 20, fit: pelvis, margin: 0.05 }),
  clay('f_level', { azim: 0, elev: 0, fov: 20, fit: chest, margin: 0.08 }),
  clay('m_u5', { azim: 0, elev: -12, fov: 26, fit: chest, margin: 0.08 }),
  sil('ms_frontLevel', { azim: 0, elev: 0, ortho: true, fit: M.front }),
  { name: 'e_top', mode: 'clay', view: { azim: 0, elev: 90, topUp: 1, ortho: true, fit: plate, margin: 0.06 } },
  { name: 'e_under', mode: 'clay', view: { azim: 0, elev: -90, topUp: 1, ortho: true, fit: plate, margin: 0.06 } },
  { name: 'e_side', mode: 'clay', view: { azim: 90, elev: 0, ortho: true, fit: plate, margin: 0.06 } },
  { name: 'e_q34', mode: 'clay', view: { azim: 140, elev: 20, fov: 22, fit: plate, margin: 0.06 } },
];
