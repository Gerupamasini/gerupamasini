// Bill checks (anatomy/bill.js, docs/morphology.md §6, validation §AE):
//  1. section profile (width, culmen height, lower-mandible depth by distance from the tip)
//  2. where the keratin leaves the plumage (body SDF at the bind vertices, aBillF): exposed culmen and the
//     lower mandible's feather line, LOD0
//  3. the mesh tip against the Animator's bill-tip reference BILL.tip during the three pecks (contact frame):
//     nearest bill vertex to BILL.tip and the lowest bill vertex below it
//  4. the gape: tip opening and the opening where the bill leaves the plumage, for jaw angles 0…0.2 rad
// usage: node tools/dev/billcheck.mjs
import * as THREE from 'three';
import { KentishPloverModel, getGeometries } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { BILL, billProfile } from '../../src/birds/kentishPlover/anatomy/bareParts.js';
import { billFrame } from '../../src/birds/kentishPlover/anatomy/bill.js';

const J = CFG.joints;
const F = billFrame();
console.log(`1. profile (mm; mesh base→tip ${F.L.toFixed(2)}, xt = from the tip)`);
for (const xt of [0.5, 1, 2, 3, 4.6, 6, 7.5, 9, 11, 13, 14, 15]) {
  const p = billProfile(1 - xt / F.L);
  console.log(`   xt ${String(xt).padStart(4)}  width ${p.W.toFixed(2)}  culmen ${p.Hu.toFixed(2)}  lower ${p.Hl.toFixed(2)}  depth ${(p.Hu + p.Hl).toFixed(2)}`);
}

const g = getGeometries(0).bare;
const part = g.getAttribute('aPart');
const fea = g.getAttribute('aBillF');
const uv = g.getAttribute('uv');
let up = 0;
let lo = 0;
for (let i = 0; i < part.count; i++) {
  if (Math.round(part.getX(i)) !== 0 || fea.getX(i) > 98 || fea.getX(i) <= 0) continue;
  if (uv.getX(i) > 2) lo = Math.max(lo, uv.getY(i));
  else up = Math.max(up, uv.getY(i));
}
console.log(`2. leaves the plumage (LOD0): upper mandible ${up.toFixed(1)} mm from the tip (exposed culmen), lower ${lo.toFixed(1)} mm`);

const m = new KentishPloverModel({ lods: [0], shadows: false });
const bare = m.lods[0].meshes.find((x) => x.name.startsWith('bare'));
const pos = bare.geometry.getAttribute('position');
const kera = [];
for (let i = 0; i < part.count; i++) if (Math.round(part.getX(i)) === 0 && fea.getX(i) < 98) kera.push(i);
const v = new THREE.Vector3();
const tipW = (a) => new THREE.Vector3(...BILL.tip.map((x, i) => (x - J.head[i]) * 0.001)).applyMatrix4(a.b.head.matrixWorld);
console.log('3. pecks: mesh tip vs BILL.tip at contact');
for (const type of ['polychaete', 'crab', 'amphipod']) {
  const a = new KentishPloverAnimator(m, { seed: 3 });
  const target = new THREE.Vector3(0, 0, CFG.animation.peck.reach);
  a.previewAction('forage', 0);
  a.setGaze('ground', target);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  a.play('peck', { target, preyType: type });
  let best = null;
  for (let f = 0; f < 120 && a.action; f++) {
    a.update(1 / 60);
    m.object.updateMatrixWorld(true);
    const tip = tipW(a);
    if (best && tip.y >= best.y) continue;
    let low = Infinity;
    let near = Infinity;
    for (const i of kera) {
      bare.getVertexPosition(i, v).applyMatrix4(bare.matrixWorld);
      low = Math.min(low, v.y);
      near = Math.min(near, v.distanceTo(tip));
    }
    best = { y: tip.y, low, near };
  }
  console.log(`   ${type.padEnd(10)}  nearest vertex ${(best.near * 1000).toFixed(3)} mm, lowest bill vertex ${((best.y - best.low) * 1000).toFixed(2)} mm below BILL.tip`);
}

console.log('4. gape (bind, jaw opened about its bone): opening at the tip / where the lower mandible leaves the plumage (mm)');
const a = new KentishPloverAnimator(m, { seed: 3 });
a.previewAction('stand', 0.3);
const q0 = m.bones.jaw.quaternion.clone();
const lowerTop = (xt) => new THREE.Vector3(...BILL.tip).addScaledVector(new THREE.Vector3(...F.a), -xt);
for (const ang of [0, 0.05, 0.1, 0.16, 0.2]) {
  m.bones.jaw.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang));
  m.object.updateMatrixWorld(true);
  const out = [];
  for (const xt of [1, lo]) {
    // rest point on the commissure: carried by the head (upper) and by the jaw (lower)
    const p = lowerTop(xt).multiplyScalar(0.001);
    const up = p.clone().sub(new THREE.Vector3(...J.head).multiplyScalar(0.001)).applyMatrix4(m.bones.head.matrixWorld);
    const lw = p.clone().sub(new THREE.Vector3(...J.jaw).multiplyScalar(0.001)).applyMatrix4(m.bones.jaw.matrixWorld);
    out.push((up.distanceTo(lw) * 1000).toFixed(2));
  }
  console.log(`   jaw ${ang.toFixed(2)} rad: tip ${out[0]}  rictus ${out[1]}`);
}
m.bones.jaw.quaternion.copy(q0);
