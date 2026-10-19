#!/usr/bin/env node
// Pose tests of the head's mechanism: the clay head skinned to its skeleton (headrig.mjs) and posed (mouth open,
// buccal pumping, gill covers out, eyes raised or pulled down), with the bones moved rigidly by their joints, one GLB
// per pose for the x-ray and clay renders (render.mjs). Nothing here ships: the output goes to out/.
//   node tools/models/tobihaze/build-pose.mjs [--head <module>] [--h <mm>] [--hb <mm>] [--poses a,b] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';
import { surfaceNets } from './mesher.mjs';
import { skullBones } from './skull.mjs';
import { boundedUnion, movePoint } from './skel.mjs';
import { eyeGlobe } from './eye.mjs';
import { headWeights, HEAD_POSES, poseWorld, skinVertices, blinkTargets, JOINT_NAMES } from './headrig.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const headModule = arg('--head');
const { headSDF, HEAD_SCULPT } = await import(headModule ? pathToFileURL(path.resolve(headModule)).href : './head.mjs');
const h = Number(arg('--h', 0.09)) / HL, hb = Number(arg('--hb', 0.08)) / HL;
const outDir = path.resolve(arg('--out', path.join(here, 'out', 'poses')));
const poses = (arg('--poses') ?? Object.keys(HEAD_POSES).join(',')).split(',');

// the head in HL, its weights from the bones
const f = headSDF(HEAD_SCULPT, { cut: true });
const box = { min: [-0.08, -0.08, -0.5], max: [HEAD_SCULPT.cutS + 0.05, 0.85, 0.5] };
const head = surfaceNets(f, box, h, { log });
log(`head ${head.position.length / 3} verts`);
const skin = headWeights(head.position, head.indices, f);
log('weights');
const needBlink = poses.some((p) => HEAD_POSES[p]?.morph);
const blink = needBlink ? blinkTargets(head.position, head.normal, headSDF, HEAD_SCULPT) : null;
if (blink) log('blink targets');

// the bones meshed once per joint (bind pose), moved rigidly
const bones = skullBones();
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
fs.mkdirSync(outDir, { recursive: true });
for (const name of poses) {
  const W = poseWorld(HEAD_POSES[name] ?? {});
  const gb = new GLBBuilder(`tobihaze-pose-${name}`);
  const clay = gb.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
  const cornea = gb.addMaterial({ name: 'Cornea', pbrMetallicRoughness: { baseColorFactor: [0.08, 0.09, 0.08, 1], metallicFactor: 0, roughnessFactor: 0.12 } });
  const red = gb.addMaterial({ name: 'Bone', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.15, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.5 } });
  const enamel = gb.addMaterial({ name: 'Teeth', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.9, 0.82, 1], metallicFactor: 0, roughnessFactor: 0.35 } });
  // blend shapes first (in the bind frame), then the skinning
  const mo = HEAD_POSES[name]?.morph ?? {};
  let base = head.position;
  if (blink && (mo.blinkL || mo.blinkR)) {
    base = new Float32Array(head.position);
    for (let i = 0; i < base.length; i++) base[i] += (mo.blinkL ?? 0) * blink.L[i] + (mo.blinkR ?? 0) * blink.R[i];
  }
  const posed = skinVertices(base, head.normal, skin, W);
  const nodes = [gb.addNode({ name: 'Head', mesh: gb.addMesh('Head', [gb.primitive({ ...toObjMesh(posed.position, posed.normal, head.indices), material: clay })]) })];
  for (const b of boneMeshes) {
    const { P, N } = rigid(b.m, W[b.joint]);
    const nm = `${b.kind}_${b.joint}`;
    nodes.push(gb.addNode({ name: nm, mesh: gb.addMesh(nm, [gb.primitive({ ...toObjMesh(P, N, b.m.indices), material: b.kind === 'Teeth' ? enamel : red })]) }));
  }
  for (const side of [1, -1]) {
    const g = eyeGlobe(HEAD.eye.d / 2, { side });
    const T = W[side > 0 ? 'J_eyeL' : 'J_eyeR'];
    const c = [HEAD.eye.s, HEAD.eye.y, HEAD.eye.z * side];
    const n = g.position.length / 3, P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) P.set(movePoint([c[0] + g.position[i * 3], c[1] + g.position[i * 3 + 1], c[2] + g.position[i * 3 + 2]], T), i * 3);
    const { N } = rigid({ position: P, normal: g.normal }, { R: T.R, t: [0, 0, 0] });
    const obj = toObjMesh(P, N, g.skin), objC = toObjMesh(P, N, g.cornea);
    nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh: gb.addMesh(side > 0 ? 'Eye_L' : 'Eye_R', [gb.primitive({ ...obj, material: clay }), gb.primitive({ ...objC, material: cornea })]) }));
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
