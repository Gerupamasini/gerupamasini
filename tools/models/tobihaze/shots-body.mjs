// The whole-fish comparison shots (render.mjs --shots shots-body.mjs): orthographic side, top, front and underside, and
// perspective views matched to the full-body reference photos (lateral A030 / A070, dorsal A036, 3/4 A005 / B010).
const clay = (name, view) => ({ name, mode: 'clay', view: { fit: 'body', margin: 0.06, ...view } });
const sil = (name, view) => ({ name, mode: 'silhouette', view: { fit: 'body', margin: 0.06, ...view } });

export const SHOTS = [
  clay('b_side', { azim: -90, elev: 0, ortho: true }),
  clay('b_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  clay('b_front', { azim: 0, elev: 0, ortho: true }),
  clay('b_under', { azim: 0, elev: -90, ortho: true, topUp: 1 }),
  clay('b_rear', { azim: 180, elev: 0, ortho: true }),
  clay('b_q34', { azim: -40, elev: 22, fov: 25 }),
  clay('b_q34r', { azim: -130, elev: 25, fov: 25 }),
  clay('b_low', { azim: -60, elev: 6, fov: 25 }),
  sil('bs_side', { azim: -90, elev: 0, ortho: true }),
  sil('bs_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
];
