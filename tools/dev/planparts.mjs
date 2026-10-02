// Which part forms the top-view (plan) outline: for each z the largest |x| of the posed relaxed stand (LOD0, CPU
// skinning with the feather shader's conform / lie terms) per feather type and for the body, and the plan width.
// usage: node tools/dev/planparts.mjs [pose=stand] [lod=0]
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
import { CONFORM_FOLD } from '../../src/birds/kentishPlover/anatomy/wingFold.js';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const LOD = Number(opt.lod ?? 0);
const m = new KentishPloverModel({ lods: [LOD], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
Object.assign(a.gaze, { yaw: 0, tYaw: 0, roll: 0, tRoll: 0, timer: 1e9, mode: 'idle' });
a.previewAction(opt.pose ?? 'stand', 0.25);
m.object.updateMatrixWorld(true);
const names = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const v = new THREE.Vector3();
const bins = new Map();
const put = (z, x, k) => {
  const b = Math.round(z / 5) * 5;
  const e = bins.get(b) ?? bins.set(b, {}).get(b);
  e[k] = Math.max(e[k] ?? 0, Math.abs(x));
};
for (const mesh of m.lods[LOD].meshes) {
  const isBody = mesh.name.startsWith('body');
  const isF = mesh.name.startsWith('feathers');
  if (!isBody && !isF) continue;
  const g = mesh.geometry;
  const P = g.getAttribute('position');
  const ft = g.getAttribute('aFeather');
  const conf = g.getAttribute('aConform');
  const core = g.getAttribute('aCore');
  const fold = m.current.feathers.userData.uniforms.uFold.value;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    if (isF) {
      const fv = v.x >= 0 ? fold.x : fold.y;
      const u = Math.min(1, Math.max(0, (fv - CONFORM_FOLD[0]) / (CONFORM_FOLD[1] - CONFORM_FOLD[0])));
      v.addScaledVector(new THREE.Vector3(conf.getX(i), conf.getY(i), conf.getZ(i)), u * u * (3 - 2 * u));
      v.addScaledVector(new THREE.Vector3(core.getX(i), core.getY(i), core.getZ(i)), Math.min(1, fv / 0.5));
    }
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
    put(v.z, v.x, isBody ? 'body' : names[Math.round(ft.getX(i))]);
  }
}
const short = { primary: 'prim', secondary: 'sec', tertial: 'tert', primaryCovert: 'pcov', greaterCovert: 'gcov', medianCovert: 'mcov', lesserCovert: 'lcov', alula: 'alula', rectrix: 'rect', upperTailCovert: 'utc', underTailCovert: 'ltc', scapular: 'scap', arm: 'arm', body: 'body' };
const keys = Object.keys(short);
console.log('   z  width  outline-by   ' + keys.map((k) => short[k].padStart(6)).join(''));
for (const z of [...bins.keys()].sort((p, q) => p - q)) {
  const e = bins.get(z);
  const [top, w] = Object.entries(e).sort((p, q) => q[1] - p[1])[0];
  console.log(`${String(z).padStart(4)}  ${(2 * w).toFixed(1).padStart(5)}  ${short[top].padEnd(10)}` + keys.map((k) => (e[k] ? e[k].toFixed(1) : '-').padStart(6)).join(''));
}
