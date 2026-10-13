// The sand the アカエイ throws (the shared dust, src/creatures/fx/SandDust.ts), for docs/creatures/sand-dust.md:
//   node tools/models/akaei/render.mjs --shots tools/models/akaei/dust-shots.mjs --out docs/creatures/sand-dust --width 960 --height 600
export const SHOTS = [
  { name: 'akaei_takeoff', behaviour: 'GLIDE_SWIM', t: 0.4, orbit: [1.2, 0.3, 1.2], fov: 35, sun: [0.5, 1.1] },
  { name: 'akaei_burrow', behaviour: 'BURROW_IN_SAND', t: 1.5, orbit: [0.9, 0.3, 0.6], fov: 35, sun: [0.5, 1.1], look: [0.1, 0, 0] },
  { name: 'akaei_escape', behaviour: 'ESCAPE', start: 'buried', t: 0.35, orbit: [1.1, 0.35, 1.3], fov: 38, sun: [0.5, 1.1] },
  { name: 'akaei_escape_above', behaviour: 'ESCAPE', start: 'buried', t: 0.6, orbit: [0.3, 1.2, 1.6], fov: 38, sun: [0.5, 1.1] },
];
