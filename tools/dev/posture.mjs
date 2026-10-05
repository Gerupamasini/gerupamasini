// Posture presets vs the photo table (docs/body_shape_spec.md §7, §9, §12): poses the model (LOD1, CPU skinning,
// gaze fixed straight ahead) and prints crown height, crown − back, belly clearance, body axis, bill angle,
// tarsus angle, eye ahead of the breast front and the neck stretch for every posture / action frame.
// usage: node tools/dev/posture.mjs [pose[@t] ...]     e.g.  stand walk@0.25 peck@0.28
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, GAZE_PITCH_REST } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { BILL } from '../../src/birds/kentishPlover/anatomy/bareParts.js';

const J = CFG.joints;
const poses = process.argv.slice(2).length ? process.argv.slice(2) : ['stand', 'alert', 'walk@0.25', 'run@0.25', 'forage', 'peck@0.28', 'restOneLeg', 'restTucked', 'sit', 'flight@0.3', 'glide'];
const m = new KentishPloverModel({ lods: [1], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
const head = CFG.bodySculpt.headContact;
const v = new THREE.Vector3();
const mm = (p) => p.clone().multiplyScalar(1000);
const local = (bone, p) => new THREE.Vector3(...p.map((x, i) => (x - J[bone][i]) * 0.001)).applyMatrix4(a.b[bone].matrixWorld).multiplyScalar(1000);
const deg = (r) => (r * 180) / Math.PI;
// bind body axis (breast front → under-tail, photos) is 10° tail-down; the body bone's pitch adds to it
const BIND_AXIS = 10;

// distance (mm) of the posed bill tip from the action's bill target (peck: does the bill reach the ground?)
const billErr = (a, tip) => {
  const act = a.action;
  const tg = act?.def.pose(act.t / act.dur, act.params, a, {})?.billTarget;
  return tg ? tip.distanceTo(mm(tg)) : NaN;
};
console.log('pose            crown  crown−back  belly  axis°  bill°  tarsus°  eye−breast  stretch  bodyY   billTip(z,y)  →target');
for (const spec of poses) {
  const [pose, t] = spec.split('@');
  Object.assign(a.gaze, { yaw: 0, tYaw: 0, roll: 0, tRoll: 0, pitch: GAZE_PITCH_REST, tPitch: GAZE_PITCH_REST, timer: 1e9, mode: 'idle' });
  a.previewAction(pose, Number(t ?? 0.3));
  m.object.updateMatrixWorld(true);
  // crown: highest point of the head ellipsoid
  let crown = -Infinity;
  for (let la = -6; la <= 6; la++)
    for (let lo = 0; lo < 24; lo++) {
      const p = [head.c[0] + head.r[0] * Math.cos(la * 0.26) * Math.sin(lo * 0.2618), head.c[1] + head.r[1] * Math.sin(la * 0.26), head.c[2] + head.r[2] * Math.cos(la * 0.26) * Math.cos(lo * 0.2618)];
      crown = Math.max(crown, local('head', p).y);
    }
  // back: highest point of the posed body / feather meshes behind the shoulder (z < −5 in rest space)
  let back = -Infinity;
  let belly = Infinity;
  let breast = -Infinity;
  for (const mesh of m.lods[1].meshes.slice(0, 2)) {
    const g = mesh.geometry;
    const rest = g.getAttribute('aRest') ?? null;
    const n = g.getAttribute('position').count;
    for (let i = 0; i < n; i++) {
      const rz = rest ? rest.getZ(i) : 0;
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
      if (mesh.name.startsWith('body') && rest) {
        if (rz < -5 && rz > -60) back = Math.max(back, v.y);
        if (rz > -40 && rz < 15) belly = Math.min(belly, v.y);
        if (rest.getY(i) < 80 && rest.getY(i) > 50) breast = Math.max(breast, v.z);
      }
    }
  }
  const q = a.b.body.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const axis = BIND_AXIS - deg(Math.asin(-fwd.y));
  const bt = local('head', BILL.tip);
  const bb = local('head', BILL.base);
  const bill = deg(Math.atan2(bb.y - bt.y, Math.hypot(bt.z - bb.z, bt.x - bb.x)));
  const ta = mm(a.b.tarso_L.getWorldPosition(new THREE.Vector3()));
  const fo = mm(a.b.foot_L.getWorldPosition(new THREE.Vector3()));
  const tars = deg(Math.atan2(Math.hypot(fo.z - ta.z, fo.x - ta.x), ta.y - fo.y)) * Math.sign(fo.z - ta.z);
  const eye = local('head', J.eyeCenter);
  const by = mm(a.b.body.getWorldPosition(new THREE.Vector3())).y;
  const f = (x, w = 7) => (Number.isFinite(x) ? x.toFixed(1) : '–').padStart(w);
  console.log(`${spec.padEnd(14)}${f(crown)}${f(crown - back, 11)}${f(belly)}${f(axis)}${f(bill)}${f(tars, 9)}${f(eye.z - breast, 12)}${f(a.neckStretch ?? 1, 9)}${f(by)}   ${f(bt.z)},${f(bt.y)}${f(billErr(a, bt), 9)}`);
}
