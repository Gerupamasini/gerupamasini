// Camera / pose presets for the digging tools (rendered with tools/models/nets/render.mjs --shots).
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('../../../src/assets/models/digging/manifest.json', import.meta.url), 'utf8'));
const IDS = ['dig_mini', 'dig_trowel', 'dig_shovel', 'dig_rake'];
const T = Object.fromEntries(IDS.map((id) => [id, manifest.tools[id]]));

/** studio: the tool held level, working end to the left, seen from front-right and above */
function studio(id, { yaw = -62, height = 0.36, zoom = 1 } = {}) {
  const t = T[id], L = t.overallLength_m;
  const mid = t.buttZ_m + L / 2;
  const a = (yaw * Math.PI) / 180;
  const pos = [-Math.sin(a) * mid, height, -Math.cos(a) * mid];
  const d = (L * 1.35 + 0.22) / zoom;
  const dir = [0.3, 0.55, 1], n = Math.hypot(...dir);
  const target = [0, height - 0.04, 0];
  return { name: `studio_${id}`, scene: 'studio', fov: 30, nets: [{ id, pos, rot: [0, yaw, 0] }], cam: { pos: dir.map((c, k) => target[k] + (c / n) * d), target }, keyTarget: target };
}

/** close-up of the working end: the tool points along +Z with its tip at (0, h, 0) */
function closeup(id, { cam, look = [0, 0, -0.04], h = 0.3, fov = 30 }) {
  const tip = T[id].tip_m;
  const c = [0, h, 0];
  return { name: `closeup_${id}`, scene: 'studio', fov, nets: [{ id, pos: [-tip[0], h - tip[1], -tip[2]], rot: [0, 0, 0] }], cam: { pos: c.map((v, k) => v + cam[k]), target: c.map((v, k) => v + look[k]) }, keyTarget: c };
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ground = (x, z) => -0.42 * (1 - smoothstep(0.4, 1.6, Math.abs(z + 0.25 + 0.35 * Math.sin(x * 0.4)))) + 0.02 * Math.sin(x * 1.3 + z * 0.7) + 0.012 * Math.sin(x * 3.1 - z * 2.3);
const at = (x, z, dy) => [x, ground(x, z) + dy, z];

export const SHOTS = [
  ...IDS.map((id) => studio(id)),
  {
    name: 'lineup', scene: 'studio', fov: 26,
    nets: IDS.map((id, k) => ({ id, pos: [(k - 1.5) * 0.3, 0.3, 0.45 - T[id].overallLength_m], rot: [0, 0, 0] })),
    cam: { pos: [1.15, 1.25, 1.55], target: [0, 0.2, -0.05] }, keyTarget: [0, 0.3, 0],
  },
  closeup('dig_mini', { cam: [0.1, 0.16, 0.12], look: [0, 0, -0.05] }),
  closeup('dig_trowel', { cam: [0.14, 0.2, 0.16], look: [0, 0, -0.08] }),
  closeup('dig_shovel', { cam: [0.32, 0.36, 0.3], look: [0, 0, -0.17], fov: 32 }),
  closeup('dig_rake', { cam: [0.16, 0.1, 0.16], look: [0, -0.02, -0.04] }),
  // field shots look toward +Z, away from the low sun (which stands toward -X, -Z)
  {
    name: 'field_dig_shovel', scene: 'field', fov: 34, exposure: 1.7,
    nets: [{ id: 'dig_shovel', rot: [74, 200, -4], anchor: 'Tip', anchorAt: at(0.3, 2.3, -0.17), wet: 0.35, mud: 0.8 }],
    cam: { pos: [-0.35, 0.62, 1.35], target: [0.25, 0.32, 2.3] },
  },
  {
    name: 'field_dig_trowel', scene: 'field', fov: 30, exposure: 1.7,
    nets: [{ id: 'dig_trowel', rot: [58, 160, 0], anchor: 'Tip', anchorAt: at(0.1, 2.3, -0.06), wet: 0.4, mud: 0.75 }],
    cam: { pos: [-0.12, 0.28, 1.88], target: [0.1, 0.07, 2.3] },
  },
  {
    name: 'field_dig_mini', scene: 'field', fov: 30, exposure: 1.7,
    nets: [{ id: 'dig_mini', rot: [-3, 130, 0], anchor: 'Tip', anchorAt: at(0.0, 2.3, 0.004), wet: 0.5, mud: 0.6 }],
    cam: { pos: [-0.22, 0.24, 2.02], target: [-0.03, 0.0, 2.4] },
  },
  {
    name: 'field_dig_rake', scene: 'field', fov: 30, exposure: 1.7,
    nets: [{ id: 'dig_rake', rot: [30, 200, 0], anchor: 'Tip', anchorAt: at(0.05, 2.3, -0.015), wet: 0.6, mud: 0.85 }],
    cam: { pos: [-0.2, 0.3, 1.88], target: [0.08, 0.06, 2.32] },
  },
];
