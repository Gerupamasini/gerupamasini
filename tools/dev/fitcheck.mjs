// Photo-fit export (docs/body_shape_spec.md §19): poses the LOD0 model in the relaxed stand (gaze yaw 0,
// default gaze pitch) and writes its posed triangles (mm, bird-local) without legs and feet, plus the
// landmarks the Frame-A transform needs, for tools/dev/fitcheck.py to rasterise and score against the photo
// median silhouettes. The photo data is not part of the repository: fitcheck.py reads it from a path.
// usage: node tools/dev/fitcheck.mjs [out.json] [pose=stand] [t=0.25] [lod=0|1|2|3] [landmarks=lod0.json]
//   lod 1/2: that detail level posed the same way; lod 3: the far impostor (one static stand, KentishPloverLOD);
//   landmarks: take bill tip / tail tip (the Frame-A scale) from an LOD0 export, so all levels share one frame
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator, GAZE_PITCH_REST } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { getBodySDF, bodyDisplacementMasks, FLUFF_REST } from '../../src/birds/kentishPlover/anatomy/bodyMesh.js';
import { KentishPloverConfig as CFG } from '../../src/birds/kentishPlover/KentishPloverConfig.js';
import { CONFORM_FOLD } from '../../src/birds/kentishPlover/anatomy/wingFold.js';
import { KentishPloverManager } from '../../src/birds/kentishPlover/KentishPloverLOD.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.includes('=')) ?? 'fitcheck.json';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const pose = opt.pose ?? 'stand';

const LOD = Number(opt.lod ?? 0);
const m = new KentishPloverModel({ lods: [Math.min(LOD, 2)], shadows: false });
const a = new KentishPloverAnimator(m, { seed: 1 });
// §19.1: head straight ahead, bill at its rest angle — no saccade during the settle / the simulated strides
Object.assign(a.gaze, { yaw: 0, tYaw: 0, roll: 0, tRoll: 0, pitch: GAZE_PITCH_REST, tPitch: GAZE_PITCH_REST, timer: 1e9, mode: 'idle' });
a.previewAction(pose, Number(opt.t ?? 0.25));
m.object.updateMatrixWorld(true);

// bare parts: aPart 0 bill, 4 mouth lining are kept; 1 leg skin, 2 claw, 3 feathered thigh, 5 foot pad are legs
const LEG_PARTS = new Set([1, 2, 3, 5]);
const v = new THREE.Vector3();
const meshes = {};
let billTip = null;
let tailTip = null;
// LOD3: the instanced far mesh, unposed (its stand is modelled in), the wing panels collapsed as in its shader
const farMeshes = () => {
  const far = KentishPloverManager.prototype._buildFarMesh.call({}, 1);
  const g = far.geometry;
  const w = g.getAttribute('aWing');
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (Math.abs(w.getX(i)) > 0.5) pos.setX(i, 0.008 * w.getX(i) + (pos.getX(i) - 0.008 * w.getX(i)) * 0.08);
  g.setIndex([...Array(pos.count).keys()]);
  // its legs (boxes below the belly) are left out like the other levels' (aPart 1)
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(Array.from({ length: pos.count }, (_, i) => (pos.getY(i) < 0.0385 && Math.abs(Math.abs(pos.getX(i)) - 0.0078) < 0.0012 ? 1 : 9)), 1));
  far.updateMatrixWorld(true);
  far.applyBoneTransform = () => {};
  return [far];
};
for (const mesh of LOD === 3 ? farMeshes() : m.lods[LOD].meshes) {
  const g = mesh.geometry;
  const n = g.getAttribute('position').count;
  const P = new Float32Array(n * 3);
  // the shaders' fluff displacement (CPU skinning alone leaves it out): body along its rest normal, the
  // plumage lying on it along aLie (bodyMesh.bodyDisplacementMasks)
  const df = (a.p.fluff - FLUFF_REST) * 0.001;
  const nrm = g.getAttribute('normal');
  const lie = g.getAttribute('aLie');
  const lieM = g.getAttribute('aLieMask');
  const rest = g.getAttribute('aRest');
  const core = g.getAttribute('aCore');
  const conf = g.getAttribute('aConform');
  const fold = m.current.feathers?.userData.uniforms.uFold.value;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(g.getAttribute('position'), i);
    if (mesh.name.startsWith('body') && df) {
      const r = [rest.getX(i), rest.getY(i), rest.getZ(i)];
      const nn = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
      v.addScaledVector(new THREE.Vector3(...nn), df * bodyDisplacementMasks(r, nn)[0]);
    }
    if (lie && df) v.addScaledVector(new THREE.Vector3(lie.getX(i), lie.getY(i), lie.getZ(i)), df * lieM.getX(i));
    // the arm tube collapses onto its axis as the wing folds (feather shader: aCore · smoothstep(0, 0.5, fold))
    // folded wing feathers bent onto their shell (feather shader: aConform · smoothstep(CONFORM_FOLD, fold))
    if (conf) {
      const u = Math.min(1, Math.max(0, ((v.x >= 0 ? fold.x : fold.y) - CONFORM_FOLD[0]) / (CONFORM_FOLD[1] - CONFORM_FOLD[0])));
      v.addScaledVector(new THREE.Vector3(conf.getX(i), conf.getY(i), conf.getZ(i)), u * u * (3 - 2 * u));
    }
    if (core) {
      const u = Math.min(1, Math.max(0, (v.x >= 0 ? fold.x : fold.y) / 0.5));
      v.addScaledVector(new THREE.Vector3(core.getX(i), core.getY(i), core.getZ(i)), u * u * (3 - 2 * u));
    }
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld).multiplyScalar(1000);
    P[i * 3] = v.x;
    P[i * 3 + 1] = v.y;
    P[i * 3 + 2] = v.z;
  }
  const part = g.getAttribute('aPart');
  const ft = g.getAttribute('aFeather');
  const idx = g.index.array;
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
    if (part && [i0, i1, i2].some((i) => LEG_PARTS.has(Math.round(part.getX(i))))) continue;
    tris.push(i0, i1, i2);
  }
  for (let i = 0; i < n; i++) {
    if (part && Math.round(part.getX(i)) === 0 && (!billTip || P[i * 3 + 2] > billTip[2])) billTip = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    // tail tip: rearmost point of the rectrices (type 8) and primaries (type 0)
    if (ft && [0, 8].includes(Math.round(ft.getX(i))) && (!tailTip || P[i * 3 + 2] < tailTip[2])) tailTip = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  }
  const used = [...new Set(tris)];
  const remap = new Map(used.map((o, k) => [o, k]));
  const pos = [];
  for (const o of used) pos.push(+P[o * 3].toFixed(2), +P[o * 3 + 1].toFixed(2), +P[o * 3 + 2].toFixed(2));
  meshes[mesh.name] = { pos, tri: tris.map((o) => remap.get(o)) };
}

// posed joints (mm) for the leg / skeleton checks
const bw = (name) => m.bones[name].getWorldPosition(new THREE.Vector3()).multiplyScalar(1000).toArray().map((x) => +x.toFixed(2));
const joints = Object.fromEntries(['body', 'chest', 'neck0', 'head', 'eye_L', 'tail', 'femur_L', 'tibio_L', 'tarso_L', 'foot_L', 'humerus_L', 'forearm_L', 'hand_L'].map((n) => [n, bw(n)]));

// the body SDF (rest = relaxed bind) on a 0.5 mm side grid, for the SDF-only widths / tibia checks
const sdf = getBodySDF(CFG);
const tib = [];
for (let t = 0; t <= 1.0001; t += 0.1) {
  const [k, an] = [CFG.joints.knee, CFG.joints.ankle];
  const p = k.map((x, i) => x + (an[i] - x) * t);
  tib.push({ t: +t.toFixed(1), p: p.map((x) => +x.toFixed(1)), d: +sdf(...p).toFixed(2) });
}
// §19.9: tibia inside the belly above y 39.5, knee ≤ −3 mm inside over the femur's swing (stride, hip
// compensation of the walk / run pitch: −0.5 … +0.25 rad about the hip)
let tibiaMax = -Infinity;
for (let t = 0; t <= 1.0001; t += 0.01) {
  const p = CFG.joints.knee.map((x, i) => x + (CFG.joints.ankle[i] - x) * t);
  if (p[1] >= 39.5) tibiaMax = Math.max(tibiaMax, sdf(...p));
}
let kneeMax = -Infinity;
for (let a = -0.5; a <= 0.2501; a += 0.05) {
  const [h, k] = [CFG.joints.hip, CFG.joints.knee];
  const [dy, dz] = [k[1] - h[1], k[2] - h[2]];
  kneeMax = Math.max(kneeMax, sdf(k[0], h[1] + Math.cos(a) * dy - Math.sin(a) * dz, h[2] + Math.sin(a) * dy + Math.cos(a) * dz));
}
const checks = { tibiaMaxSdfAboveY39_5: +tibiaMax.toFixed(2), kneeMaxSdfOverSwing: +kneeMax.toFixed(2) };
if (opt.landmarks) ({ billTip, tailTip } = JSON.parse(readFileSync(opt.landmarks, 'utf8')));
writeFileSync(out, JSON.stringify({ pose, lod: LOD, billTip, tailTip, joints, tibia: tib, checks, meshes }));
console.log(`fitcheck: ${pose} LOD${LOD} → ${out}  billTip ${billTip.map((x) => x.toFixed(1))}  tailTip ${tailTip.map((x) => x.toFixed(1))}`);
