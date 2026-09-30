import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
const pose = process.argv[2];
if (pose) a.previewAction(pose, 0.3);
m.object.updateMatrixWorld(true);
const v = new THREE.Vector3();
for (const mesh of m.lods[0].meshes) {
  if (!/eye|cornea|lids/.test(mesh.name)) continue;
  const n = mesh.geometry.getAttribute('position').count;
  const c = new THREE.Vector3(); let k = 0;
  for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); if (v.x > 0) { c.add(v); k++; } }
  c.divideScalar(k).multiplyScalar(1000);
  console.log(mesh.name.padEnd(10), 'left-side centroid mm', c.toArray().map((x) => x.toFixed(2)).join(', '));
}
console.log('eye_L bone', m.bones.eye_L.getWorldPosition(new THREE.Vector3()).multiplyScalar(1000).toArray().map((x) => x.toFixed(2)).join(', '));
console.log('head bone', m.bones.head.getWorldPosition(new THREE.Vector3()).multiplyScalar(1000).toArray().map((x) => x.toFixed(2)).join(', '));
