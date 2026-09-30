// Checks that every generated mesh has triangle winding consistent with its vertex normals.
import * as THREE from 'three';
import { getGeometries } from '../../src/birds/kentishPlover/KentishPloverModel.js';
const check = (name, g) => {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), idx = g.index.array;
  let good = 0, bad = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
    fn.subVectors(b, a).cross(c.clone().sub(a));
    if (fn.lengthSq() < 1e-20) continue;
    vn.fromBufferAttribute(n, idx[i]).add(new THREE.Vector3().fromBufferAttribute(n, idx[i + 1])).add(new THREE.Vector3().fromBufferAttribute(n, idx[i + 2]));
    fn.dot(vn) > 0 ? good++ : bad++;
  }
  console.log(name.padEnd(16), `consistent ${(100 * good / (good + bad)).toFixed(1)}%  (${bad} inverted of ${good + bad})`);
};
for (const d of [0, 1, 2]) {
  const g = getGeometries(d);
  check(`LOD${d} body`, g.body);
  check(`LOD${d} bare`, g.bare);
  if (g.eyes) { check(`LOD${d} eyeball`, g.eyes.eyeball); check(`LOD${d} cornea`, g.eyes.cornea); }
}
