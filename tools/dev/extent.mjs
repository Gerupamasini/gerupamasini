import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
const pose = process.argv[2] || 'stand';
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
a.previewAction(pose, Number(process.argv[3] ?? 0.3));
m.object.updateMatrixWorld(true);
const names = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const mesh = m.object.children.find((c) => c.name === 'feathers0');
const g = mesh.geometry;
const ft = g.getAttribute('aFeather');
const stats = {};
const v = new THREE.Vector3();
for (let i = 0; i < ft.count; i++) {
  mesh.getVertexPosition(i, v);
  v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
  if (v.x < 0) continue; // left side only
  const t = names[Math.round(ft.getX(i))];
  const s = (stats[t] ??= { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9, n: 0 });
  s.minX = Math.min(s.minX, v.x); s.maxX = Math.max(s.maxX, v.x); s.minY = Math.min(s.minY, v.y); s.maxY = Math.max(s.maxY, v.y); s.minZ = Math.min(s.minZ, v.z); s.maxZ = Math.max(s.maxZ, v.z); s.n++;
}
for (const [k, s] of Object.entries(stats)) console.log(k.padEnd(16), ['x', s.minX, s.maxX, 'y', s.minY, s.maxY, 'z', s.minZ, s.maxZ].map((x) => (typeof x === 'number' ? x.toFixed(1) : x)).join(' '));
