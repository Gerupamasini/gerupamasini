import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
import { getBodySDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
const sdf = getBodySDF(CFG);
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
a.previewAction('stand');
m.object.updateMatrixWorld(true);
const names = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const mesh = m.object.children.find((c) => c.name === 'feathers0');
const ft = mesh.geometry.getAttribute('aFeather');
const v = new THREE.Vector3();
const hits = {};
for (let i = 0; i < ft.count; i++) {
  mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
  if (v.x < 0 || v.y > 52 || v.z < -20) continue;
  const d = sdf(v.x, v.y, v.z);
  if (d < 0.8) continue;
  const k = `${names[Math.round(ft.getX(i))]}#${ft.getY(i)}@${m.boneList[mesh.geometry.getAttribute('skinIndex').getX(i)].name}@y${v.y.toFixed(0)}`;
  hits[k] = Math.max(hits[k] ?? 0, d);
}
console.log(Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, d]) => `${k}:${d.toFixed(1)}mm`).join('  '));
