// Camera set-ups for the oyster renders (viewer: reference/oyster-viewer). orbit = [azimuth, elevation, distance]
// around the subject's centre (azimuth 0 looks from the ventral margin toward the beak).
export const SHOTS = [
  { name: 'hero_top', mode: 'individual', seed: 7, lod: 0, wet: 1, gape: 0.035, orbit: [0.4, 1.1, 0.2], fov: 35, sun: [0.9, 0.8] },
  { name: 'hero_side', mode: 'individual', seed: 7, lod: 0, wet: 1, gape: 0.035, orbit: [1.5, 0.22, 0.2], fov: 32, sun: [0.9, 0.6] },
  { name: 'hero_gape', mode: 'individual', seed: 7, lod: 0, wet: 1, gape: 0.045, orbit: [0.0, 0.12, 0.11], fov: 30, sun: [0.1, 0.5] },
  { name: 'hero_closed', mode: 'individual', seed: 7, lod: 0, wet: 1, gape: 0.0, orbit: [0.0, 0.12, 0.11], fov: 30, sun: [0.1, 0.5] },
  { name: 'hero_dry', mode: 'individual', seed: 7, lod: 0, wet: 0, gape: 0, orbit: [-0.8, 0.6, 0.2], fov: 35, sun: [0.9, 0.8] },
  { name: 'hero_b', mode: 'individual', seed: 23, lod: 0, wet: 1, gape: 0.03, orbit: [0.9, 0.7, 0.2], fov: 35, sun: [0.9, 0.8] },
  { name: 'hero_c', mode: 'individual', seed: 61, lod: 0, wet: 0.5, gape: 0.0, orbit: [-0.3, 0.5, 0.2], fov: 35, sun: [-0.6, 0.7] },
  { name: 'dead_gaping', mode: 'individual', seed: 31, dead: 1, lod: 0, wet: 1, orbit: [0.2, 0.75, 0.22], fov: 35, sun: [0.9, 0.8] },
  { name: 'lod0', mode: 'individual', seed: 23, dead: 0, lod: 0, wet: 1, gape: 0.03, orbit: [0.9, 0.5, 0.22], fov: 35, sun: [0.9, 0.8] },
  { name: 'lod1', mode: 'individual', seed: 23, dead: 0, lod: 1, wet: 1, gape: 0.03, orbit: [0.9, 0.5, 0.22], fov: 35, sun: [0.9, 0.8] },
  { name: 'lod2', mode: 'individual', seed: 23, dead: 0, lod: 2, wet: 1, gape: 0.03, orbit: [0.9, 0.5, 0.22], fov: 35, sun: [0.9, 0.8] },
  { name: 'lineup', mode: 'lineup', seed: 4, lod: 0, wet: 0.8, gape: 0.03, orbit: [0.0, 0.95, 0.75], fov: 35, sun: [0.9, 0.8] },
  { name: 'cluster', mode: 'cluster', seed: 5, dead: 0, lod: 0, wet: 1, gape: 0.03, orbit: [0.4, 0.55, 0.6], fov: 35, sun: [0.9, 0.7] },
  { name: 'cluster_close', mode: 'cluster', seed: 5, dead: 0, lod: 0, wet: 1, gape: 0.03, orbit: [1.4, 0.35, 0.35], fov: 35, sun: [0.9, 0.7] },
  { name: 'reef_wide', mode: 'reef', seed: 3, wet: 1, gape: 0.03, orbit: [0.3, 0.45, 2.6], fov: 40, sun: [0.9, 0.6] },
  { name: 'reef_mid', mode: 'reef', seed: 3, wet: 1, gape: 0.03, orbit: [0.8, 0.35, 1.1], fov: 40, sun: [0.9, 0.6] },
];
