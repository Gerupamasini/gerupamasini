// How far the neck sleeve's plumage swells out of the resting body outline in the extreme neck poses (preening,
// sleep tuck, scratch, looking down; docs/validation.md §X). The body is skinned on the CPU as the shader does; each
// sleeve vertex (0.12 < s < 0.88, the plumage between trunk and head) is taken into the chest's rest frame and
// measured against the whole resting body outline (bodySculpt SDF, neck fill and head included):
//   out    largest distance outside the resting outline (mm): the "balloon" swelling over the shoulder
//   outB   the same over the trunk half of the sleeve (s < 0.55): the swelling over the shoulder and breast
//   p95    95th percentile of it over the sleeve vertices
//   n>3    sleeve vertices more than 3 mm outside
//   area   posed / rest area of the sleeve triangles (plumage surface: > 1 inflated, < 1 compressed)
// usage: node tools/dev/neckbulge.mjs [--lod=0] [--pose=regex]
import * as THREE from 'three';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, PREEN_VARIANTS } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { KentishPloverConfig as CFG, joints as J } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { getBodySDF } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const d = Number(args.lod ?? 0);
const poseRe = args.pose ? new RegExp(args.pose) : null;
const DEG = Math.PI / 180;
const POSES = [['stand', 'act', 'stand']];
for (const v of PREEN_VARIANTS) for (const t of [0.2, 0.5, 0.8]) POSES.push([`preen:${v}@${t}`, 'act', 'preen', t, v]);
POSES.push(['restTucked', 'act', 'restTucked'], ['scratch@0.5', 'act', 'scratch', 0.5]);
for (const p of [45, 60]) POSES.push([`pitch${p}`, 'gaze', 0, p * DEG, 0]);
for (const y of [90, 110]) POSES.push([`yaw${y}`, 'gaze', y * DEG, 0.02, 0]);
const sel = POSES.filter((p) => !poseRe || poseRe.test(p[0]));

const sdf = getBodySDF(CFG);
const model = new KentishPloverModel({ lods: [d], shadows: false });
const body = model.lods[d].meshes.find((m) => m.name === `body${d}`);
const g = body.geometry;
const R = g.getAttribute('aRest').array;
const S = g.getAttribute('aSleeve').array;
const idx = g.index.array;
const n = R.length / 3;
const inS = (i) => S[i] > 0.12 && S[i] < 0.88;
const tris = [];
for (let t = 0; t < idx.length; t += 3) if (inS(idx[t]) && inS(idx[t + 1]) && inS(idx[t + 2])) tris.push(t);
const area = (P, t) => {
  const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
  const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
  const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};
const restA = tris.reduce((a, t) => a + area(R, t), 0);
console.log(`LOD${d}: ${tris.length} sleeve triangles`);
console.log('pose'.padEnd(22), '  out   outB    p95   n>3   area');
const bindChest = new THREE.Vector3(...J.chest).multiplyScalar(0.001);
for (const P of sel) {
  const anim = new KentishPloverAnimator(model, { seed: 3 });
  if (P[1] === 'gaze') {
    anim.previewAction('stand', 0.3);
    const [yaw, pitch, roll] = P.slice(2);
    Object.assign(anim.gaze, { yaw, tYaw: yaw, pitch, tPitch: pitch, roll, tRoll: roll, timer: 1e9, mode: 'idle' });
    for (let i = 0; i < 30; i++) anim.update(1 / 60);
  } else anim.previewAction(P[2], P[3] ?? 0.3, P[4]);
  model.object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.bones.chest.matrixWorld).invert();
  const Pp = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const outs = [];
  let outB = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!inS(i)) continue;
    body.getVertexPosition(i, v);
    v.applyMatrix4(body.matrixWorld);
    Pp.set([v.x * 1000, v.y * 1000, v.z * 1000], i * 3);
    v.applyMatrix4(inv).add(bindChest).multiplyScalar(1000);
    const o = sdf(v.x, v.y, v.z);
    outs.push(o);
    if (S[i] < 0.55) outB = Math.max(outB, o);
  }
  outs.sort((a, b) => a - b);
  const pa = tris.reduce((a, t) => a + area(Pp, t), 0);
  const o = outs[outs.length - 1];
  console.log(`${P[0].padEnd(22)} ${o.toFixed(2).padStart(6)} ${outB.toFixed(2).padStart(6)} ${outs[Math.floor(outs.length * 0.95)].toFixed(2).padStart(6)} ${String(outs.filter((x) => x > 3).length).padStart(5)}  ${(pa / restA).toFixed(3)}`);
}
