// Skeleton of one individual and the application of a behaviour pose to it (no rendering: used by the
// scene and by the tests).
import * as THREE from 'three';
import { EYES, MOUTH, S_ROOT } from './anatomy.js';

const M = 0.001;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _g = new THREE.Vector3(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3();

/** Orientation of an eye looking along `dir` (model frame), its local +y kept towards the fish's back (+X). */
export function eyeQuaternion(dir, out = new THREE.Quaternion()) {
  const z = _v.copy(dir).normalize();
  _x.set(0, 0, 1).addScaledVector(z, -z.z).normalize();   // forward, across the gaze
  _y.crossVectors(z, _x);
  if (_y.x < 0) { _x.negate(); _y.negate(); }
  _m.makeBasis(_x, _y, z);
  return out.setFromRotationMatrix(_m);
}
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1);

/** Lower jaw axis: the mouth opens towards the ventral side and a little towards the blind side. */
export function jawAxis() {
  const j = MOUTH.joint;
  const tip = new THREE.Vector3(MOUTH.tipX * M, 0, (S_ROOT + 0.2) * M).sub(new THREE.Vector3(j.x * M, 0, (S_ROOT - j.s) * M));
  return new THREE.Vector3().crossVectors(tip, new THREE.Vector3(-1, -0.3, 0).normalize()).normalize();
}

/** Bones of one individual under `parent` (rest pose from the shared rig definition). */
export function createBones(rig, parent) {
  const bones = {}, list = [];
  for (const d of rig.defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    const p = d.parent ? rig.defs[rig.byName[d.parent]] : null;
    b.position.copy(d.pos).sub(p ? p.pos : new THREE.Vector3());
    b.quaternion.copy(d.quat);
    b.userData.rest = { pos: b.position.clone(), quat: b.quaternion.clone() };
    b.userData.def = d;
    bones[d.name] = b;
    list.push(b);
  }
  for (const d of rig.defs) (d.parent ? bones[d.parent] : parent).add(bones[d.name]);
  return { bones, list };
}

/** Pose (behavior.js) → root transform and bone rotations. */
export function applyPose(root, bones, P, axis) {
  root.position.copy(P.pos);
  root.quaternion.copy(P.quat);
  // spine: lateral flexion (vertical in the world) and a little flexion in the plane of the body
  for (const [name, a] of Object.entries(P.bend)) {
    bones[name].quaternion.setFromAxisAngle(_ax, a).multiply(_q.setFromAxisAngle(_ay, P.curl[name] || 0));
  }
  const fin = (tag, arr) => {
    for (let k = 0; k < arr.length; k++) {
      const b = bones[`J_${tag}${k}`];
      b.quaternion.setFromAxisAngle(b.userData.def.axis, arr[k]);
    }
  };
  fin('D', P.dorsal);
  fin('A', P.anal);
  bones.J_pecE.quaternion.setFromAxisAngle(_ax, P.pecE);
  bones.J_pecB.quaternion.setFromAxisAngle(_ax, P.pecB);
  bones.J_pelE.quaternion.setFromAxisAngle(_az, -P.pelvic);
  bones.J_pelB.quaternion.setFromAxisAngle(_az, P.pelvic);
  bones.J_jaw.quaternion.setFromAxisAngle(axis, P.jaw * 0.5);
  bones.J_premax.position.copy(bones.J_premax.userData.rest.pos).add(_v.set(-0.15 * M * P.premax, 0, 0.45 * M * P.premax));
  // eyes: aimed within ±0.55 rad of the resting gaze; raised on their turrets when buried or alert
  EYES.forEach((e, i) => {
    const b = bones[e.bone];
    const rest = b.userData.rest;
    const g0 = _g.set(0, 0, 1).applyQuaternion(rest.quat);
    const want = P.eyes[i].dir;
    const ang = g0.angleTo(want);
    const d = new THREE.Vector3().copy(want);
    if (ang > 0.55) d.copy(g0).lerp(want, 0.55 / ang).normalize();
    eyeQuaternion(d, b.quaternion);
    b.position.copy(rest.pos).addScaledVector(g0, P.eyes[i].raise * 0.6 * M);
  });
  root.updateMatrixWorld(true);
}
