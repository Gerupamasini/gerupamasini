import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { FEATHER_TYPE } from '../../src/birds/kentishPlover/anatomy/feathers.js';
import { getBodySDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
const sdf = getBodySDF(CFG);
const m = new KentishPloverModel({ lods: [0], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
a.previewAction(process.argv[2] || 'stand');
m.object.updateMatrixWorld(true);
const names = Object.fromEntries(Object.entries(FEATHER_TYPE).map(([k, v]) => [v, k]));
const mesh = m.object.children.find((c) => c.name === 'feathers0');
const ft = mesh.geometry.getAttribute('aFeather');
const v = new THREE.Vector3();
const out = {};
for (let i = 0; i < ft.count; i++) {
  mesh.getVertexPosition(i, v);
  v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
  if (v.x < 0 || v.z < -45) continue;
  const d = sdf(v.x, v.y, v.z); // distance outside the body outline (mm)
  const t = names[Math.round(ft.getX(i))];
  const o = (out[t] ??= { n: 0, far: 0, maxD: 0, at: null });
  o.n++;
  if (d > 6) o.far++;
  if (d > o.maxD) { o.maxD = d; o.at = v.toArray().map((x) => x.toFixed(1)).join(','); }
}
for (const [k, o] of Object.entries(out)) console.log(k.padEnd(15), `verts>6mm: ${String(o.far).padStart(4)}/${o.n}  max ${o.maxD.toFixed(1)} mm at ${o.at}`);
