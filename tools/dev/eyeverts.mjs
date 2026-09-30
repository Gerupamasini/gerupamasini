import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
const m = new KentishPloverModel({ lods: [0], shadows: false });
m.object.updateMatrixWorld(true);
const mesh = m.lods[0].meshes.find((x) => x.name === 'eyeball0');
const g = mesh.geometry;
const pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
const v = new THREE.Vector3();
for (const i of [0, 1, 24, 48, 24 * 5, 24 * 10, pos.count / 2, pos.count / 2 + 24 * 5]) {
  mesh.getVertexPosition(i, v);
  console.log(i, 'bind', [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => (x * 1000).toFixed(2)).join(','), 'skinned', v.toArray().map((x) => (x * 1000).toFixed(2)).join(','), 'bones', si.getX(i), si.getY(i), sw.getX(i).toFixed(2), sw.getY(i).toFixed(2));
}
console.log('index count', g.index.count, 'verts', pos.count, 'max index', Math.max(...g.index.array));
