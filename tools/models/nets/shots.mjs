// Camera / pose presets for render.mjs. Units: metres, degrees. Sizes come from the built manifest.
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('../../../src/assets/models/nets/manifest.json', import.meta.url), 'utf8'));
const IDS = ['net_small', 'net_shallow', 'net_fine', 'net_deep', 'net_dframe', 'net_carbon'];
const LEN = Object.fromEntries(IDS.map((id) => [id, manifest.nets[id].overallLength_m]));
const BUTT = Object.fromEntries(IDS.map((id) => [id, manifest.nets[id].buttZ_m]));

/** a studio product shot: the net held level, the hoop to the left, seen from front-right and above */
function studio(id, { yaw = -62, height = 0.66, elev = 0.42, side = 0.28, zoom = 1, name = `studio_${id}`, extra = {} } = {}) {
  const L = LEN[id];
  const mid = BUTT[id] + L / 2;
  const a = (yaw * Math.PI) / 180;
  const pos = [-Math.sin(a) * mid, height, -Math.cos(a) * mid];
  const d = (L * 1.12 + 0.45) / zoom;
  const dir = [side, elev, 1];
  const n = Math.hypot(...dir);
  const target = [0, height - 0.12, 0];
  return { name, scene: 'studio', nets: [{ id, pos, rot: [0, yaw, 0], ...extra }], cam: { pos: dir.map((c, k) => target[k] + (c / n) * d), target }, keyTarget: [0, height, 0] };
}

export const SHOTS = [
  ...IDS.map((id) => studio(id)),
  // all six side by side at true scale, hoops aligned
  {
    name: 'lineup', scene: 'studio', fov: 28,
    nets: IDS.map((id, k) => ({ id, pos: [(k - 2.5) * 0.44, 0.62, 0.7 - (LEN[id] - 0.4)], rot: [0, 0, 0] })),
    cam: { pos: [2.6, 2.3, 3.3], target: [0, 0.35, 0.1] }, keyTarget: [0, 0.5, 0],
  },
];

/** close-up of the hoop and bag: the net points along +Z with its hoop centre at (0, 0.62, 0) */
const HOOP_Z = Object.fromEntries(IDS.map((id) => [id, manifest.nets[id].mouthCentre_m[2]]));
export function closeup(id, { name = `closeup_${id}`, cam = [0.22, 0.12, 0.3], look = [0.06, -0.05, 0.02], fov = 30, extra = {}, scene = 'studio' } = {}) {
  const c = [0, 0.62, 0];
  return { name, scene, fov, nets: [{ id, pos: [0, 0.62, -HOOP_Z[id]], rot: [0, 0, 0], ...extra }], cam: { pos: c.map((v, k) => v + cam[k]), target: c.map((v, k) => v + look[k]) }, keyTarget: c };
}
SHOTS.push(...Object.keys(HOOP_Z).map((id) => closeup(id)));

// ---------------------------------------------------------------- tidal flat (keep in step with makeField in the viewer)
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ground = (x, z) => -0.42 * (1 - smoothstep(0.4, 1.6, Math.abs(z + 0.25 + 0.35 * Math.sin(x * 0.4)))) + 0.02 * Math.sin(x * 1.3 + z * 0.7) + 0.012 * Math.sin(x * 3.1 - z * 2.3);
const WATER = -0.045;
SHOTS.push(
  {
    name: 'field_net_shallow', scene: 'field', fov: 34, exposure: 1.0,
    nets: [{ id: 'net_shallow', rot: [30, -118, 6], mouthAt: [0.0, WATER - 0.03, -0.05], wet: 0.8, mud: 0.2, waterline: WATER, bag: { Trail: 0.45, Wet: 0.2 } }],
    cam: { pos: [0.62, 0.1, 0.72], target: [-0.02, -0.1, -0.08] },
  },
  {
    name: 'field_net_dframe', scene: 'field', fov: 34,
    nets: [{ id: 'net_dframe', rot: [38, -150, 0], mouthAt: [-0.25, ground(-0.25, 1.02) + 0.13, 1.02], wet: 1, mud: 0.85, waterline: WATER, bag: { Wet: 0.6, Stream: 0.2 } }],
    cam: { pos: [0.95, 0.42, 1.55], target: [-0.25, -0.02, 1.02] },
  },
  {
    name: 'field_net_small', scene: 'field', fov: 30,
    nets: [{ id: 'net_small', rot: [8, -105, -6], mouthAt: [0.1, ground(0.1, 2.2) + 0.3, 2.2], wet: 0.55, mud: 0.7, bag: { Wet: 0.7 } }],
    cam: { pos: [0.75, 0.62, 2.85], target: [0.1, 0.22, 2.2] },
  },
  {
    name: 'field_net_carbon', scene: 'field', fov: 32,
    nets: [{ id: 'net_carbon', rot: [30, -120, 0], mouthAt: [0.2, WATER + 0.03, 0.1], wet: 0.7, mud: 0.05, waterline: WATER, bag: { Stream: 0.25 } }],
    cam: { pos: [1.2, 0.55, 1.35], target: [0.05, -0.05, 0.0] },
  },
  // bag morph states, left to right: rest, Stream, Invert, Trail, Wet
  {
    name: 'bag_states', scene: 'studio', fov: 24,
    nets: ['', 'Stream', 'Invert', 'Trail', 'Wet'].map((t, k) => ({ id: 'net_shallow', pos: [(k - 2) * 0.4, 0.66, -0.93], rot: [0, 0, 0], bag: t ? { [t]: 1 } : {} })),
    cam: { pos: [0.35, 0.95, 2.75], target: [0, 0.5, 0] }, keyTarget: [0, 0.5, 0],
  },
  // surface states: clean, wet, muddy
  {
    name: 'surface_states', scene: 'studio', fov: 26,
    nets: [[0, 0], [1, 0], [0.6, 0.9]].map(([wet, mud], k) => ({ id: 'net_small', pos: [(k - 1) * 0.3, 0.5, -0.53], rot: [0, 0, 0], wet, mud, bag: { Wet: wet * 0.8 } })),
    cam: { pos: [0.5, 0.95, 1.3], target: [0, 0.4, 0.0] }, keyTarget: [0, 0.5, 0],
  },
  // LOD tiers at the same size: hero, lod1, lod2
  {
    name: 'lod_tiers', scene: 'studio', fov: 26,
    nets: ['hero', 'lod1', 'lod2'].map((tier, k) => ({ id: 'net_deep', tier, pos: [(k - 1) * 0.42, 0.62, -1.67], rot: [0, 0, 0] })),
    cam: { pos: [0.6, 1.0, 1.5], target: [0, 0.45, 0.0] }, keyTarget: [0, 0.5, 0],
  },
);
