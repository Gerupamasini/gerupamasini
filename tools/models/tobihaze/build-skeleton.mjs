#!/usr/bin/env node
// The head skeleton (skull.mjs) meshed inside the clay skin, for the x-ray comparisons with cleared and stained
// specimens (viewer modes 'xray' and 'bones'). Optionally posed: --pose '{"J_jaw": {"angle": 30}, ...}' (degrees about
// the joint's axis, or "slide": HL along J_premax's slide direction, or "t": [ds, dy, dz]).
//   node tools/models/tobihaze/build-skeleton.mjs [--head <sculpt module>] [--h <mm>] [--hb <mm>] [--out <glb>] [--pose <json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';
import { surfaceNets } from './mesher.mjs';
import { skullBones, HEAD_JOINTS } from './skull.mjs';
import { worldTransforms, axisAngle, posed, movePoint, v3 } from './skel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
const headModule = arg('--head');
const { headSDF, HEAD_SCULPT } = await import(headModule ? pathToFileURL(path.resolve(headModule)).href : './head.mjs');
const h = Number(arg('--h', 0.08)), hb = Number(arg('--hb', 0.04));
const outFile = path.resolve(arg('--out', path.join(here, 'out', 'skeleton.glb')));

// pose → world transforms
const poseArg = JSON.parse(arg('--pose', '{}'));
const local = {};
for (const j of HEAD_JOINTS) {
  const p = poseArg[j.name];
  if (!p) continue;
  local[j.name] = {
    R: p.angle && j.axis ? axisAngle(j.axis, (p.angle * Math.PI) / 180) : undefined,
    t: p.slide && j.slide ? v3.mul(j.slide, p.slide) : p.t,
  };
}
const W = worldTransforms(HEAD_JOINTS, local);

const toMM = (f) => (x, y, z) => f(x / HL, y / HL, z / HL) * HL;
const box = { min: [-0.12 * HL, -0.12 * HL, -0.45 * HL], max: [1.25 * HL, 0.85 * HL, 0.45 * HL] };
function toObj(m) {
  const n = m.position.length / 3, p = new Float32Array(n * 3), nn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p.set(toObject([m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2]]), i * 3);
    nn[i * 3] = m.normal[i * 3 + 2]; nn[i * 3 + 1] = m.normal[i * 3 + 1]; nn[i * 3 + 2] = -m.normal[i * 3];
  }
  return { position: p, normal: nn, indices: m.indices };
}

const gb = new GLBBuilder('tobihaze-skeleton');
const clay = gb.addMaterial({ name: 'Clay', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.7, 0.66, 1], metallicFactor: 0, roughnessFactor: 0.6 } });
const red = gb.addMaterial({ name: 'Bone', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.15, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.5 } });
const nodes = [];
if (!args.includes('--no-skin')) {
  const skin = surfaceNets(toMM(headSDF(HEAD_SCULPT, { cut: true })), box, h, { log });
  nodes.push(gb.addNode({ name: 'Head', mesh: gb.addMesh('Head', [gb.primitive({ ...toObj(skin), material: clay })]) }));
}
const bones = skullBones();
for (const group of [{ name: 'Bone_Skeleton', pick: (b) => !b.cart }, { name: 'Cart_Skeleton', pick: (b) => b.cart }]) {
  const fs_ = bones.filter(group.pick).map((b) => posed(b.field, W[b.joint]));
  if (!fs_.length) continue;
  const f = (x, y, z) => { let d = Infinity; for (const g of fs_) d = Math.min(d, g(x, y, z)); return d; };
  const m = surfaceNets(toMM(f), box, hb, { log });
  nodes.push(gb.addNode({ name: group.name, mesh: gb.addMesh(group.name, [gb.primitive({ ...toObj(m), material: red })]) }));
  log(`${group.name}: ${m.indices.length / 3} tris`);
}
// eyes (posed with their joints)
const eyeMesh = (() => {
  const r = EYE_MM.radius * 0.001, nt = 32, np = 64, pos = [], nrm = [], idx = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= np; i++) {
    const th = (j / nt) * Math.PI, ph = (i / np) * Math.PI * 2, n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    pos.push(...n.map((v) => v * r)); nrm.push(...n);
  }
  for (let j = 0; j < nt; j++) for (let i = 0; i < np; i++) { const a = j * (np + 1) + i, b = a + 1, c = a + np + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  return gb.addMesh('Eye', [gb.primitive({ position: new Float32Array(pos), normal: new Float32Array(nrm), indices: new Uint32Array(idx), material: clay })]);
})();
for (const side of [1, -1]) {
  const c = movePoint([HEAD.eye.s, HEAD.eye.y, HEAD.eye.z * side], W[side > 0 ? 'J_eyeL' : 'J_eyeR']);
  nodes.push(gb.addNode({ name: side > 0 ? 'Eye_L' : 'Eye_R', mesh: eyeMesh, translation: toObject(c.map((v) => v * HL)) }));
}
const region = (s0, s1, y0, y1, z) => {
  const a = toObject([s0 * HL, y0 * HL, -z * HL]), b = toObject([s1 * HL, y1 * HL, z * HL]);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
};
const root = gb.addNode({ name: 'Tobihaze_Skeleton', children: nodes, extras: { regions: { head: region(-0.05, 1.15, -0.05, 0.75, 0.4), face: region(-0.05, 0.5, -0.05, 0.75, 0.36) } } });
gb.addScene('s', [root]);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, gb.toBuffer());
log(`wrote ${path.relative(process.cwd(), outFile)}`);
