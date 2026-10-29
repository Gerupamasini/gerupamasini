// The head comparison shots (render.mjs): the five orthographic/standard views, and views matched to the reference
// photos' cameras (elevation and turn estimated from the photos, docs/models/tobihaze/README.md).
const clay = (name, view) => ({ name, mode: 'clay', view: { fit: 'head', margin: 0.1, ...view } });
const sil = (name, view) => ({ name, mode: 'silhouette', view: { fit: 'head', margin: 0.1, ...view } });

export const SHOTS = [
  clay('front', { azim: 0, elev: 0, ortho: true }),
  clay('side', { azim: -90, elev: 0, ortho: true }),
  clay('top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  clay('q34', { azim: -40, elev: 18, fov: 25 }),
  clay('macro', { azim: -22, elev: 20, fov: 16, fit: 'face', margin: 0.04 }),
  sil('sil_front', { azim: 0, elev: 0, ortho: true }),
  sil('sil_side', { azim: -90, elev: 0, ortho: true }),
  sil('sil_top', { azim: 0, elev: 90, ortho: true, topUp: 1 }),
  // matched to photos
  clay('m_B002_front30', { azim: 0, elev: 30, fov: 25 }),
  clay('m_B008_side', { azim: -62, elev: 8, fov: 25 }),
  clay('m_B010_q34', { azim: 66, elev: 34, fov: 25 }),
  clay('m_B050_top', { azim: 0, elev: 55, fov: 10 }),
  clay('m_B051_top', { azim: 0, elev: 62, fov: 10 }),
  clay('m_B070_rear', { azim: 180, elev: 35, fov: 25 }),
  // the macro photos' close cameras: the eye domes, nearest the lens, are magnified against the face
  clay('mc_B002_front30', { azim: 0, elev: 30, fov: 50, fit: 'face', margin: 0.02 }),
  clay('mc_B010_q34', { azim: 66, elev: 34, fov: 50, fit: 'face', margin: 0.02 }),
];
