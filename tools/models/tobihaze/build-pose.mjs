#!/usr/bin/env node
// Pose tests of the head's mechanism: the clay head skinned to its skeleton (headrig.mjs) and posed (mouth open,
// buccal pumping, gill covers out, eyes raised or pulled down), with the bones moved rigidly by their joints, one GLB
// per pose for the x-ray and clay renders (render.mjs). Nothing here ships: the output goes to out/.
// Blend shapes before the skinning: the blink, the throat's pouch, and the cheeks' inflation (solved per vertex for
// the `inflated` pose, so the posed skin lands on the balloon whatever the joints do).
//   node tools/models/tobihaze/build-pose.mjs [--head <module>] [--inflated <module>] [--h <mm>] [--hb <mm>] [--poses a,b]
//     [--out <dir>]
// (--inflated: the inflated head, head-inflated.mjs by default, the target of the poses' `inflate` blend shape)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { HL, HEAD, EYE_MM, toObject } from './anatomy.mjs';
import { surfaceNets } from './mesher.mjs';
import { skullBones } from './skull.mjs';
import { boundedUnion, movePoint } from './skel.mjs';
import { eyeGlobe } from './eye.mjs';
import { headWeights, HEAD_POSES, poseWorld, skinVertices, blinkTargets, throatTargets, inflateTargets, inflateMorph, inflateMidMorph, smoothSculpt, JOINT_NAMES } from './headrig.mjs';

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
log(`head ${head.position.length / 3} verts`);
const skin = headWeights(head.position, head.indices, f, { K: HEAD_SCULPT });
log('weights');
const needBlink = poses.some((p) => HEAD_POSES[p]?.morph?.blinkL || HEAD_POSES[p]?.morph?.blinkR);
// (the blink's blend shape is solved against the weights: the eye joints' share of the globe's drop is taken out of it)
const blink = needBlink ? blinkTargets(head.position, head.normal, headSDF, HEAD_SCULPT, { weights: skin }) : null;
if (blink) log('blink targets');
const needThroat = poses.some((p) => HEAD_POSES[p]?.morph?.throat);
const throat = needThroat ? throatTargets(head.position, head.normal, HEAD_SCULPT) : null;
if (throat) log('throat targets');
// the inflation's blend shapes: onto the inflated head (head-inflated.mjs), solved for the full `inflated` pose, and
// its in-between corrective (exact at `inflatedHalf`; driven by 4w(1 − w) from the inflate weight w)
let inflate = null, inflateMid = null, inflateMask = null, inflateProjS = null, inflateField = null, inflateD = null;
if (poses.some((p) => HEAD_POSES[p]?.morph?.inflate)) {
  const IM = await import(pathToFileURL(path.resolve(arg('--inflated', path.join(here, 'head-inflated.mjs')))).href);
  inflateField = IM.inflatedSDF(HEAD_SCULPT, { cut: true, headSDF });
  const inf = inflateTargets(head.position, head.indices, f, headSDF(smoothSculpt(HEAD_SCULPT), { cut: true }), inflateField, { K: HEAD_SCULPT });
  inflate = inflateMorph(head.position, skin, poseWorld(HEAD_POSES.inflated), inf);
  const HP = HEAD_POSES.inflatedHalf;
  inflateMid = inflateMidMorph(head.position, skin, poseWorld(HP), inf, inflate, HP.morph.inflate);
  // (the displacement at full weight: inflateTargets applies the mask)
  inflateMask = inf.mask; inflateD = inf.d;
  // the projected skin (1) against the features riding on it (0), smoothed so the normals' two rules blend
  inflateProjS = smoothField(Float32Array.from(inf.projected), head.indices, 3);
  log(`inflate targets (${inf.stats.projected} projected, ${inf.stats.filled} filled)`);
}


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
let bindFN = null;
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
  if ((blink && (mo.blinkL || mo.blinkR)) || (throat && mo.throat)) {
    base = new Float32Array(head.position);
    for (let i = 0; i < base.length; i++) base[i] += (blink ? (mo.blinkL ?? 0) * blink.L[i] + (mo.blinkR ?? 0) * blink.R[i] : 0) + (throat ? (mo.throat ?? 0) * throat[i] : 0);
  }
  if (inflate && mo.inflate) {
    if (base === head.position) base = new Float32Array(head.position);
    for (let i = 0; i < base.length; i++) base[i] += mo.inflate * inflate[i] + (mo.inflateMid ?? 0) * inflateMid[i];
  }
  // the blink's normals: where the blend shape turns the cup up over the lowered globe (by up to ~100°), the bind normal
  // is turned as the smoothed facets round it turn, so the closed hood is lit as the shape it is (the bind normals left
  // dark smears on its front, where the cup's lower profile is laid onto the globe)
  let nrm0 = head.normal;
  if (blink && (mo.blinkL || mo.blinkR)) {
    bindFN ??= smoothField(faceNormals(head.position, head.indices), head.indices, 2);
    const fm = smoothField(faceNormals(base, head.indices), head.indices, 2);
    nrm0 = Float32Array.from(head.normal);
    for (let v = 0; v < nrm0.length / 3; v++) {
      const dl = Math.hypot((mo.blinkL ?? 0) * blink.L[v * 3], (mo.blinkL ?? 0) * blink.L[v * 3 + 1], (mo.blinkL ?? 0) * blink.L[v * 3 + 2]) + Math.hypot((mo.blinkR ?? 0) * blink.R[v * 3], (mo.blinkR ?? 0) * blink.R[v * 3 + 1], (mo.blinkR ?? 0) * blink.R[v * 3 + 2]);
      if (dl < 1e-6) continue;
      const a = [bindFN[v * 3], bindFN[v * 3 + 1], bindFN[v * 3 + 2]], b = [fm[v * 3], fm[v * 3 + 1], fm[v * 3 + 2]];
      const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1;
      for (let k = 0; k < 3; k++) { a[k] /= la; b[k] /= lb; }
      const r = rotateTo(a, b, [head.normal[v * 3], head.normal[v * 3 + 1], head.normal[v * 3 + 2]]), l = Math.hypot(...r) || 1;
      nrm0[v * 3] = r[0] / l; nrm0[v * 3 + 1] = r[1] / l; nrm0[v * 3 + 2] = r[2] / l;
    }
  }
  const posed = skinVertices(base, nrm0, skin, W);
  // the inflation's normals. The skin lands at the bind position moved by the inflation's displacement (the joints
  // swing only the bones inside it): on the projected skin the normal is the bind's turned toward the balloon's own at
  // the displaced point (its field's gradient), in the mask's share; the features riding on the skin (the gill margin,
  // the pads) turn as the smoothed facets round them turn
  if (inflate && mo.inflate) {
    const P = posed.position, N = posed.normal, e = 2e-4, g = inflateField, B = head.position, N0 = head.normal, D = inflateD;
    const fb = smoothField(faceNormals(B, head.indices), head.indices, 4);
    const fp = smoothField(faceNormals(P, head.indices), head.indices, 4);
    for (let v = 0; v < P.length / 3; v++) {
      const w = Math.min(1, mo.inflate * inflateMask[v]);
      if (w < 1e-3) continue;
      const a = [fb[v * 3], fb[v * 3 + 1], fb[v * 3 + 2]], b = [fp[v * 3], fp[v * 3 + 1], fp[v * 3 + 2]];
      const la = Math.hypot(...a) || 1, lb = Math.hypot(...b) || 1;
      for (let k = 0; k < 3; k++) { a[k] /= la; b[k] /= lb; }
      const n0 = [N0[v * 3], N0[v * 3 + 1], N0[v * 3 + 2]];
      let r = rotateTo(a, b, n0);
      const pj = inflateProjS[v];
      if (pj > 1e-3) {
        const x = B[v * 3] + D[v * 3], y = B[v * 3 + 1] + D[v * 3 + 1], z = B[v * 3 + 2] + D[v * 3 + 2];
        let gx = g(x + e, y, z) - g(x - e, y, z), gy = g(x, y + e, z) - g(x, y - e, z), gz = g(x, y, z + e) - g(x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1;
        const t = [n0[0] * (1 - w) + (w * gx) / gl, n0[1] * (1 - w) + (w * gy) / gl, n0[2] * (1 - w) + (w * gz) / gl];
        const tl = Math.hypot(...t) || 1;
        r = [0, 1, 2].map((k) => r[k] * (1 - pj) + (t[k] / tl) * pj);
      }
      const l = Math.hypot(...r) || 1;
      N[v * 3] = r[0] / l; N[v * 3 + 1] = r[1] / l; N[v * 3 + 2] = r[2] / l;
    }
  }
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

/** Area-weighted vertex normals of a triangle mesh. */
function faceNormals(P, I) {
  const N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}

/** Jacobi smoothing of a per-vertex field (any number of components) over the mesh's edges. */
function smoothField(A, I, k) {
  let n = 0; for (const i of I) if (i >= n) n = i + 1;
  const m = A.length / n;
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
  let cur = Float32Array.from(A), nxt = new Float32Array(A.length);
  for (let it = 0; it < k; it++) {
    for (let v = 0; v < n; v++) for (let c = 0; c < m; c++) { let s = cur[v * m + c]; for (const u of nb[v]) s += cur[u * m + c]; nxt[v * m + c] = s / (nb[v].size + 1); }
    [cur, nxt] = [nxt, cur];
  }
  return cur;
}
/** The rotation taking unit a to unit b, applied to n (Rodrigues). */
function rotateTo(a, b, n) {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c < -0.999) return n;
  const vn = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]], k = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / (1 + c);
  return [n[0] * c + vn[0] + v[0] * k, n[1] * c + vn[1] + v[1] * k, n[2] * c + vn[2] + v[2] * k];
}
