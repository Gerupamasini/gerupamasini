// Camera presets for the binoculars (tools/models/nets/render.mjs --shots tools/models/optics/shots.mjs).
const B = 'obs_binoculars';
export const SHOTS = [
  {
    name: 'studio_obs_binoculars', scene: 'studio', fov: 26,
    nets: [{ id: B, pos: [0, 0.2, -0.075], rot: [0, -55, 0] }],
    cam: { pos: [0.2, 0.33, 0.3], target: [0, 0.195, 0] }, keyTarget: [0, 0.2, 0],
  },
  {
    name: 'eyepiece_obs_binoculars', scene: 'studio', fov: 26,
    nets: [{ id: B, pos: [0, 0.2, 0.075], rot: [0, 180 + 25, 0] }],
    cam: { pos: [0.09, 0.27, 0.24], target: [0, 0.2, 0] }, keyTarget: [0, 0.2, 0],
  },
  {
    name: 'front_obs_binoculars', scene: 'studio', fov: 26,
    nets: [{ id: B, pos: [0, 0.2, -0.075], rot: [0, 25, 0] }],
    cam: { pos: [-0.1, 0.28, 0.28], target: [0, 0.2, 0] }, keyTarget: [0, 0.2, 0],
  },
  {
    // over the shoulder: the binoculars raised toward the far edge of the flat
    name: 'field_obs_binoculars', scene: 'field', fov: 34, exposure: 1.5,
    nets: [{ id: B, pos: [0, 1.45, 2.4], rot: [-4, 180, 0], wet: 0.1 }],
    cam: { pos: [0.2, 1.52, 2.62], target: [-0.05, 1.42, 2.25] },
  },
];
