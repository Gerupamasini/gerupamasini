// Rear-most point (posed relaxed stand, LOD0, CPU skinning with the feather shader's conform / lie terms) of each
// primary, inner secondary, tertial and rectrix (left side) and of the tail coverts: where the wing tips and the tail
// end, and how far apart the folded primaries' tips lie (mm).
// usage: node tools/dev/tips.mjs [pose=stand]
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { CONFORM_FOLD } from '../../src/birds/kentishPlover/anatomy/wingFold.js';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
Object.assign(a.gaze, { yaw: 0, tYaw: 0, roll: 0, tRoll: 0, timer: 1e9, mode: 'idle' });
a.previewAction(opt.pose ?? 'stand', 0.25);
m.object.updateMatrixWorld(true);
const v = new THREE.Vector3();
const tip = new Map();
for (const mesh of m.lods[0].meshes) {
  if (!mesh.name.startsWith('feathers')) continue;
  const g = mesh.geometry;
  const P = g.getAttribute('position');
  const conf = g.getAttribute('aConform');
  const core = g.getAttribute('aCore');
  const si = g.getAttribute('skinIndex');
  const fold = m.current.feathers.userData.uniforms.uFold.value;
  for (let i = 0; i < P.count; i++) {
    const name = mesh.skeleton.bones[si.getX(i)].name;
    if (!/^(p\d+|t\d|r\d|s1[01])_L$|^tail$/.test(name)) continue;
    v.fromBufferAttribute(P, i);
    const fv = v.x >= 0 ? fold.x : fold.y;
    const u = Math.min(1, Math.max(0, (fv - CONFORM_FOLD[0]) / (CONFORM_FOLD[1] - CONFORM_FOLD[0])));
    v.addScaledVector(new THREE.Vector3(conf.getX(i), conf.getY(i), conf.getZ(i)), u * u * (3 - 2 * u));
    v.addScaledVector(new THREE.Vector3(core.getX(i), core.getY(i), core.getZ(i)), Math.min(1, fv / 0.5));
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
    if (name === 'tail' && v.x < 0) continue;
    const t = tip.get(name);
    if (!t || v.z < t.z) tip.set(name, v.clone());
  }
}
for (const [k, p] of [...tip].sort((p, q) => p[1].z - q[1].z)) console.log(`${k.padEnd(7)} z ${p.z.toFixed(1)}  x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}`);
