import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
const m = new KentishPloverModel({ lods: [2], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
a.previewAction('stand');
const P = (n) => { const v = m.bones[n].getWorldPosition(new THREE.Vector3()).multiplyScalar(1000); return `${n}: ${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`; };
for (const n of ['humerus_L','forearm_L','hand_L','p9_L','s1_L','s11_L','t2_L','lc_forearm_0_4_L','head','foot_L','tarso_L']) console.log(P(n));
// tip of p9: base + dir*len in bone space
const b = m.bones.p9_L; const f = b.userData.spec.feather;
const dir = new THREE.Vector3(Math.cos(f.angle*Math.PI/180),0,-Math.sin(f.angle*Math.PI/180)).multiplyScalar(f.length/1000);
const tip = dir.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())).add(b.getWorldPosition(new THREE.Vector3())).multiplyScalar(1000);
console.log('p9 tip', tip.toArray().map(v=>v.toFixed(1)).join(', '));
const q = m.bones.forearm_L.getWorldQuaternion(new THREE.Quaternion());
console.log('forearm X', new THREE.Vector3(1,0,0).applyQuaternion(q).toArray().map(v=>v.toFixed(2)), 'Y', new THREE.Vector3(0,1,0).applyQuaternion(q).toArray().map(v=>v.toFixed(2)));
