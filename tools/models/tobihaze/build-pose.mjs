#!/usr/bin/env node
// Pose tests of the head's mechanism: the clay head skinned to its skeleton (headrig.mjs) and posed (mouth open,
// buccal pumping, gill covers out, eyes raised or pulled down), with the bones moved rigidly by their joints, one GLB
// per pose for the x-ray and clay renders (render.mjs). Nothing here ships: the output goes to out/.
// Blend shapes before the skinning: the blink, the throat's pouch, the cheeks' inflation (solved per vertex for the
// `inflated` pose, so the posed skin lands on the balloon whatever the joints do) and the gape's correctives (the lower
// lip everted, the upper lip's stretch relaxed, the gum and the mouth's floor drawn back from the teeth) and the vent's (the
// gill slit's ends rounded as the covers swing out). Each blend shape carries its normal
// deltas (headrig.mjs morphNormals; the inflation's from its own rule, bindNormalDeltas), and the poses are shaded with
// them exactly as the game's morph targets will be: n = normalize(n0 + Σ w ΔN), then skinned. morphs.glb holds the
// bind head with every blend shape as a glTF morph target (POSITION and NORMAL) and their drivers in the mesh's extras.
// The teeth are fitted to the sculpt (skull.mjs fitTeeth). The blend shapes come from headmorphs.mjs, the code path the
// shipped tiers use too.
//   node tools/models/tobihaze/build-pose.mjs [--head <module>] [--inflated <module>] [--h <mm>] [--hb <mm>] [--poses a,b]
//     [--out <dir>] [--morphs 0]
// (--inflated: the inflated head, head-inflated.mjs by default, the target of the poses' `inflate` blend shape)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';
import { surfaceNets } from './mesher.mjs';
import { skullBones, fitTeeth } from './skull.mjs';
import { boundedUnion, movePoint } from './skel.mjs';
import { eyeGlobe } from './eye.mjs';
import { headWeights, HEAD_POSES, poseWorld, skinVertices, fixWinding, JOINT_NAMES } from './headrig.mjs';
import { headMorphs, MORPH_ORDER } from './headmorphs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const headModule = arg('--head');
const { headSDF, HEAD_SCULPT } = await import(headModule ? pathToFileURL(path.resolve(headModule)).href : new URL('./head.mjs', import.meta.url).href);
const h = Number(arg('--h', 0.09)) / HL, hb = Number(arg('--hb', 0.08)) / HL;
const outDir = path.resolve(arg('--out', path.join(here, 'out', 'poses')));
const poses = (arg('--poses') ?? Object.keys(HEAD_POSES).join(',')).split(',');

// the head in HL, its weights from the bones
const f = headSDF(HEAD_SCULPT, { cut: true });
const box = { min: [-0.08, -0.08, -0.5], max: [HEAD_SCULPT.cutS + 0.05, 0.85, 0.5] };
const head = surfaceNets(f, box, h, { log });
// (the few triangles the surface nets wind against their neighbours at the eyes' thin features turned over: the blink
// carries them out onto the closed dome, where they showed as black triangles)
const turned = fixWinding(head.indices);
log(`head ${head.position.length / 3} verts (${turned} triangles rewound)`);
// the teeth fitted to the sculpt (their tips just under the oral surface round them), the weights with them
const teeth = fitTeeth(f);
const skin = headWeights(head.position, head.indices, f, { K: HEAD_SCULPT, teeth });
log('weights');
const writeMorphs = arg('--morphs', '1') !== '0';
const needs = (k) => writeMorphs || poses.some((p) => HEAD_POSES[p]?.morph?.[k]);
// the blend shapes with their normal deltas (headmorphs.mjs): the blink (solved against the weights: the eye joints'
// share of the globe's drop is taken out of it), the throat's pouch, the gape's and the vent's correctives, and the
// inflation onto the inflated head (head-inflated.mjs, or --inflated) with its in-between corrective
const morphs = await headMorphs(head, skin, {
  K: HEAD_SCULPT, headSDF, headField: f, teeth, which: MORPH_ORDER.filter(needs), world: false, log,
  inflated: pathToFileURL(path.resolve(arg('--inflated', path.join(here, 'head-inflated.mjs')))).href,
});


// the bones meshed once per joint (bind pose), moved rigidly
const bones = skullBones({ teeth });
const boneMeshes = [];
for (const name of JOINT_NAMES) {
  for (const kind of ['Bone', 'Cart', 'Teeth']) {
    const fs_ = bones.filter((b) => b.joint === name && (kind === 'Teeth' ? b.tooth : kind === 'Cart' ? b.cart : !b.cart && !b.tooth)).map((b) => b.field);
    if (!fs_.length) continue;
    const m = surfaceNets(boundedUnion(fs_, { min: [-0.15, -0.15, -0.5], max: [1.25, 0.85, 0.5] }, kind === 'Teeth' ? 0.01 : 0.02), { min: [-0.12, -0.12, -0.45], max: [1.25, 0.85, 0.45] }, kind === 'Teeth' ? hb * 0.6 : hb);
    boneMeshes.push({ joint: name, kind, m });
  }
}
log(`bones ${boneMeshes.length} groups`);

const toObjMesh = (P, N, I) => {
  const n = P.length / 3, p = new Float32Array(n * 3), nn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p.set(toObject([P[i * 3] * HL, P[i * 3 + 1] * HL, P[i * 3 + 2] * HL]), i * 3);
    nn[i * 3] = N[i * 3 + 2]; nn[i * 3 + 1] = N[i * 3 + 1]; nn[i * 3 + 2] = -N[i * 3];
  }
  return { position: p, normal: nn, indices: I };
};
const rigid = (m, T) => {
  const n = m.position.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = movePoint([m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]], T);
    P.set(p, i * 3);
    const q = [m.normal[i * 3], m.normal[i * 3 + 1], m.normal[i * 3 + 2]], R = T.R;
    N.set([R[0] * q[0] + R[1] * q[1] + R[2] * q[2], R[3] * q[0] + R[4] * q[1] + R[5] * q[2], R[6] * q[0] + R[7] * q[1] + R[8] * q[2]], i * 3);
  }
  return { P, N };
};
// ---- the blend shapes with their normal deltas (bind frame): { name: { d, n } }
const P0 = head.position, N0 = head.normal, I0 = head.indices, nV = P0.length / 3;
const shapes = Object.fromEntries(morphs.names.map((k) => [k, { d: morphs.d[k], n: morphs.n[k] }]));
const objDelta = (D) => { const o = new Float32Array(D.length); for (let i = 0; i < D.length; i += 3) { o[i] = D[i + 2] * HL * 0.001; o[i + 1] = D[i + 1] * HL * 0.001; o[i + 2] = -D[i] * HL * 0.001; } return o; };
const objNDelta = (D) => { const o = new Float32Array(D.length); for (let i = 0; i < D.length; i += 3) { o[i] = D[i + 2]; o[i + 1] = D[i + 1]; o[i + 2] = -D[i]; } return o; };

fs.mkdirSync(outDir, { recursive: true });
// the bind head with every blend shape as a morph target (POSITION and NORMAL deltas, object frame) and their drivers
if (writeMorphs && Object.keys(shapes).length) {
  const gm = new GLBBuilder('tobihaze-head-morphs');
  const clay = gm.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
  const names = Object.keys(shapes);
  const prim = gm.primitive({ ...toObjMesh(P0, N0, I0), material: clay, targets: names.map((k) => objDelta(shapes[k].d)), normalTargets: names.map((k) => objNDelta(shapes[k].n)) });
  const mesh = gm.addMesh('Head', [prim], { targetNames: names, drivers: morphs.drivers });
  gm.json.meshes[mesh].weights = names.map(() => 0);
  gm.addScene('s', [gm.addNode({ name: 'Head', mesh })]);
  fs.writeFileSync(path.join(outDir, 'morphs.glb'), gm.toBuffer());
  log(`wrote morphs (${names.length} targets)`);
}
for (const name of poses) {
  const W = poseWorld(HEAD_POSES[name] ?? {});
  const gb = new GLBBuilder(`tobihaze-pose-${name}`);
  const clay = gb.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
  const cornea = gb.addMaterial({ name: 'Cornea', pbrMetallicRoughness: { baseColorFactor: [0.08, 0.09, 0.08, 1], metallicFactor: 0, roughnessFactor: 0.12 } });
  // the iris ring round the pupil under the same clear cornea (eye.mjs eyeGlobe: pupil + iris = the window), gold-brown
  // as in build-clay.mjs; its name carries 'Cornea' too, so a viewer that knows only the cornea draws the window dark
  const iris = gb.addMaterial({ name: 'Iris (Cornea)', pbrMetallicRoughness: { baseColorFactor: [0.52, 0.40, 0.17, 1], metallicFactor: 0, roughnessFactor: 0.12 } });
  const red = gb.addMaterial({ name: 'Bone', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.15, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.5 } });
  const enamel = gb.addMaterial({ name: 'Teeth', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.9, 0.82, 1], metallicFactor: 0, roughnessFactor: 0.35 } });
  // blend shapes first (in the bind frame, positions and normals as the game's morph targets: n = normalize(n0 + Σ w ΔN)),
  // then the skinning
  const mo = HEAD_POSES[name]?.morph ?? {};
  let base = P0, nrm0 = N0;
  const used = Object.entries(mo).filter(([k, w]) => w && shapes[k]);
  if (used.length) {
    base = Float32Array.from(P0); nrm0 = Float32Array.from(N0);
    for (const [k, w] of used) { const S = shapes[k]; for (let i = 0; i < base.length; i++) { base[i] += w * S.d[i]; nrm0[i] += w * S.n[i]; } }
    for (let v = 0; v < nV; v++) { const l = Math.hypot(nrm0[v * 3], nrm0[v * 3 + 1], nrm0[v * 3 + 2]) || 1; nrm0[v * 3] /= l; nrm0[v * 3 + 1] /= l; nrm0[v * 3 + 2] /= l; }
  }
  const posed = skinVertices(base, nrm0, skin, W);
  const nodes = [gb.addNode({ name: 'Head', mesh: gb.addMesh('Head', [gb.primitive({ ...toObjMesh(posed.position, posed.normal, head.indices), material: clay })]) })];
  for (const b of boneMeshes) {
    const { P, N } = rigid(b.m, W[b.joint]);
    const nm = `${b.kind}_${b.joint}`;
    nodes.push(gb.addNode({ name: nm, mesh: gb.addMesh(nm, [gb.primitive({ ...toObjMesh(P, N, b.m.indices), material: b.kind === 'Teeth' ? enamel : red })]) }));
  }
  // (the pose's `gaze` { pitch, yaw } (degrees): the globes turned in their sockets as the game's eye gaze turns them,
  // the eye's skin cap and window with them (they are the globe's own); pitch about the fore-aft axis, + = the window
  // up, then yaw about the vertical, + = the window forward; the head's skin does not move)
  const GZ = HEAD_POSES[name]?.gaze;
  const gazeR = (sd) => {
    if (!GZ) return null;
    const p = ((GZ.pitch ?? 0) * Math.PI) / 180, y = ((GZ.yaw ?? 0) * Math.PI) / 180, cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y);
    const P = [1, 0, 0, 0, cp, sd * sp, 0, -sd * sp, cp], Y = [cy, 0, -sd * sy, 0, 1, 0, sd * sy, 0, cy];
    return [0, 1, 2].flatMap((i) => [0, 1, 2].map((k) => Y[i * 3] * P[k] + Y[i * 3 + 1] * P[3 + k] + Y[i * 3 + 2] * P[6 + k]));
  };
  for (const side of [1, -1]) {
    const g = eyeGlobe(HEAD.eye.d / 2, { side });
    const T = W[side > 0 ? 'J_eyeL' : 'J_eyeR'];
    const c = [HEAD.eye.s, HEAD.eye.y, HEAD.eye.z * side];
    const n = g.position.length / 3, P = new Float32Array(n * 3), RG = gazeR(side);
    const turn = (a, i) => (RG ? [0, 1, 2].map((k) => RG[k * 3] * a[i * 3] + RG[k * 3 + 1] * a[i * 3 + 1] + RG[k * 3 + 2] * a[i * 3 + 2]) : [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]);
    for (let i = 0; i < n; i++) { const q = turn(g.position, i); P.set(movePoint([c[0] + q[0], c[1] + q[1], c[2] + q[2]], T), i * 3); }
    const gn = RG ? Float32Array.from({ length: n * 3 }, (_, j) => turn(g.normal, (j / 3) | 0)[j % 3]) : g.normal;
    const { N } = rigid({ position: P, normal: gn }, { R: T.R, t: [0, 0, 0] });
    // (the window as the pupil (cornea) and the iris ring round it, when the eye has them; else the whole window dark)
    const obj = toObjMesh(P, N, g.skin), win = g.pupil && g.iris ? [[g.pupil, cornea], [g.iris, iris]] : [[g.cornea, cornea]];
    nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh: gb.addMesh(side > 0 ? 'Eye_L' : 'Eye_R', [gb.primitive({ ...obj, material: clay }), ...win.map(([I, mat]) => gb.primitive({ ...toObjMesh(P, N, I), material: mat }))]) }));
  }
  const region = (s0, s1, y0, y1, z) => {
    const a = toObject([s0 * HL, y0 * HL, -z * HL]), b = toObject([s1 * HL, y1 * HL, z * HL]);
    return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
  };
  const root = gb.addNode({ name: 'Tobihaze_Pose', children: nodes, extras: { regions: { head: region(-0.05, 1.15, -0.12, 0.8, 0.4), face: region(-0.08, 0.55, -0.15, 0.8, 0.36) } } });
  gb.addScene('s', [root]);
  fs.writeFileSync(path.join(outDir, `${name}.glb`), gb.toBuffer());
  log(`wrote ${name}`);
}
