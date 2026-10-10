// Camera set-ups for the アカエイ renders (viewer: reference/akaei-viewer). orbit = [azimuth, elevation, distance] around
// the animal (azimuth 0 looks at it from in front), in its own frame; look = offset of the aim point (x left, y up, z fwd).
export const SHOTS = [
  { name: 'rest_three_quarter', behaviour: 'BOTTOM_REST', t: 2, orbit: [0.7, 0.42, 1.0], fov: 35, sun: [0.5, 1.1] },
  { name: 'rest_top', behaviour: 'BOTTOM_REST', t: 2, orbit: [0.0, 1.45, 1.25], fov: 35, sun: [0.5, 1.1], look: [0, 0, -0.18] },
  { name: 'head_close', behaviour: 'BOTTOM_REST', t: 2.3, orbit: [0.45, 0.55, 0.42], fov: 32, sun: [0.6, 1.0], look: [0, 0, 0.06] },
  { name: 'tail_sting', behaviour: 'BOTTOM_REST', t: 3, orbit: [1.9, 0.55, 0.32], fov: 30, sun: [0.6, 1.0], look: [0, 0, -0.3] },
  { name: 'swim_side', behaviour: 'GLIDE_SWIM', start: 'swim', t: 1.4, orbit: [1.35, 0.12, 1.2], fov: 35, sun: [0.6, 1.1] },
  { name: 'swim_front', behaviour: 'GLIDE_SWIM', start: 'swim', t: 1.0, orbit: [0.25, 0.25, 1.05], fov: 35, sun: [0.6, 1.1] },
  { name: 'swim_above', behaviour: 'GLIDE_SWIM', start: 'swim', t: 1.2, orbit: [0.6, 1.0, 1.4], fov: 35, sun: [0.6, 1.1], look: [0, 0, -0.15] },
  { name: 'burrow_digging', behaviour: 'BURROW_IN_SAND', t: 1.2, orbit: [0.7, 0.4, 1.0], fov: 35, sun: [0.5, 1.1] },
  { name: 'burrow_buried', behaviour: 'BURROW_IN_SAND', t: 6, orbit: [0.7, 0.55, 0.95], fov: 35, sun: [0.5, 1.1] },
  { name: 'buried_eyes', behaviour: 'BURROW_IN_SAND', start: 'buried', t: 3, orbit: [0.35, 0.6, 0.45], fov: 32, sun: [0.6, 1.0], look: [0, 0, 0.06] },
  { name: 'forage_pulse', behaviour: 'FORAGE', t: 5.0, orbit: [0.9, 0.35, 1.0], fov: 35, sun: [0.5, 1.1] },
  { name: 'escape_burst', behaviour: 'ESCAPE', start: 'buried', t: 0.35, orbit: [1.1, 0.35, 1.3], fov: 38, sun: [0.5, 1.1] },
  { name: 'escape_glide', behaviour: 'ESCAPE', t: 1.6, orbit: [1.5, 0.3, 1.5], fov: 38, sun: [0.5, 1.1] },
  { name: 'ventral', behaviour: 'SPECIMEN', orbit: [0.0, -1.3, 0.75], fov: 35, sun: [0.4, -1.0], air: true, exposure: 1.1 },
  { name: 'ventral_head', behaviour: 'SPECIMEN', orbit: [0.0, -1.25, 0.32], fov: 32, sun: [0.4, -1.0], air: true, exposure: 1.1, look: [0, 0, 0.06] },
  { name: 'lod0', behaviour: 'BOTTOM_REST', lod: 0, t: 2, orbit: [0.9, 0.5, 1.15], fov: 35, sun: [0.5, 1.1] },
  { name: 'lod1', behaviour: 'BOTTOM_REST', lod: 1, t: 2, orbit: [0.9, 0.5, 1.15], fov: 35, sun: [0.5, 1.1] },
  { name: 'lod2', behaviour: 'BOTTOM_REST', lod: 2, t: 2, orbit: [0.9, 0.5, 1.15], fov: 35, sun: [0.5, 1.1] },
];
