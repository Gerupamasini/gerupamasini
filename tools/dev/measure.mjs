// Measures the posed LOD0 model (CPU skinning) against docs/morphology.md targets.
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
const v = new THREE.Vector3();
function extent(pose, filter = () => true) {
  a.previewAction(pose, 0.25);
  m.object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of m.lods[0].meshes) {
    if (!filter(mesh.name)) continue;
    const n = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(v);
    }
  }
  return box;
}
const mmv = (x) => (x * 1000).toFixed(1);
const bw = (n) => m.bones[n].getWorldPosition(new THREE.Vector3());
const stand = extent('stand');
a.previewAction('stand', 0);
m.object.updateMatrixWorld(true);
const billTip = new THREE.Vector3(0, 0.0834, 0.054).applyMatrix4(m.bones.head.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(-m.bones.head.userData.bindLocalPos.x, 0, 0))); // approx
const body = extent('stand', (n) => n.startsWith('body'));
const feathers = extent('stand', (n) => n.startsWith('feathers'));
const flight = extent('glide', (n) => n.startsWith('feathers'));
const P9 = (() => { a.previewAction('stand', 0); m.object.updateMatrixWorld(true); const b = m.bones.p9_L; const f = b.userData.spec.feather; const d = new THREE.Vector3(Math.cos(f.angle*Math.PI/180),0,-Math.sin(f.angle*Math.PI/180)).multiplyScalar(f.length/1000); return d.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())).add(b.getWorldPosition(new THREE.Vector3())); })();
const rows = [
  ['Total length bill tip → tail tip (standing)', mmv(stand.max.z - stand.min.z), '142 ± 7 (photos, spec §1); 160 stretched'],
  ['Height (ground → crown)', mmv(stand.max.y), '106 ± 5 (photos, body_shape_spec.md §8)'],
  
  ['Max width incl. folded wings', mmv(Math.max(feathers.max.x, body.max.x) * 2), '43.5 ± 2 (spec §5)'],
  ['Body width (plumage outline)', mmv(body.max.x * 2), '41.5 ± 1.5 (spec §5)'],
  ['Wingspan (glide pose, feather tips)', mmv(flight.max.x - flight.min.x), '430 (guides) — see note'],
  ['Tail tip z / p9 tip z (standing)', `${mmv(feathers.min.z)} / ${mmv(P9.z)}`, 'primaries ≈ tail tip'],
];
const tar = bw('tarso_L').distanceTo(bw('foot_L'));
const tib = bw('tibio_L').distanceTo(bw('tarso_L'));
rows.push(['Tarsometatarsus (joint to joint)', mmv(tar), '29.5 (S1,S3; spec §9)']);
rows.push(['Tibiotarsus', mmv(tib), '35.7 (spec §9)']);
for (const r of rows) console.log(r[0].padEnd(46), String(r[1]).padStart(8), '  target', r[2]);
