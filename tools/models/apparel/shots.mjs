// Camera presets for the waders (tools/models/nets/render.mjs --shots tools/models/apparel/shots.mjs).
const W = 'wear_waders';
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ground = (x, z) => -0.42 * (1 - smoothstep(0.4, 1.6, Math.abs(z + 0.25 + 0.35 * Math.sin(x * 0.4)))) + 0.02 * Math.sin(x * 1.3 + z * 0.7) + 0.012 * Math.sin(x * 3.1 - z * 2.3);
export const SHOTS = [
  { name: 'studio_wear_waders', scene: 'studio', fov: 28, nets: [{ id: W, pos: [0, 0, 0], rot: [0, -25, 0] }], cam: { pos: [1.15, 1.3, 3.3], target: [0, 0.78, 0] }, keyTarget: [0, 0.8, 0] },
  { name: 'back_wear_waders', scene: 'studio', fov: 28, nets: [{ id: W, pos: [0, 0, 0], rot: [0, 160, 0] }], cam: { pos: [0.75, 1.4, 3.3], target: [0, 0.8, 0] }, keyTarget: [0, 0.8, 0] },
  { name: 'chest_wear_waders', scene: 'studio', fov: 28, nets: [{ id: W, pos: [0, 0, 0], rot: [0, -20, 0] }], cam: { pos: [0.45, 1.45, 1.25], target: [0, 1.2, 0.05] }, keyTarget: [0, 1.1, 0] },
  { name: 'boots_wear_waders', scene: 'studio', fov: 28, nets: [{ id: W, pos: [0, 0, 0], rot: [0, -30, 0] }], cam: { pos: [0.55, 0.42, 0.85], target: [0, 0.18, 0.02] }, keyTarget: [0, 0.2, 0] },
  {
    // standing on the flat, boots sunk a little, wet and muddy to the knees; looking away from the sun
    name: 'field_wear_waders', scene: 'field', fov: 32, exposure: 1.6,
    nets: [{ id: W, pos: [0.2, ground(0.2, 2.4) - 0.035, 2.4], rot: [0, 160, 0], wet: 0.5, mud: 0.75, waterline: ground(0.2, 2.4) + 0.12 }],
    cam: { pos: [-0.75, 1.15, 0.2], target: [0.2, 0.7, 2.4] },
  },
];
