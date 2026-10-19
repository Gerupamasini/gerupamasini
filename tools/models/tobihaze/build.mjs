#!/usr/bin/env node
// The トビハゼ model: the sculpt (head.mjs + body.mjs) meshed per tier (fishmesh.mjs), the eyes (eye.mjs), the fins
// (fins.mjs) and the skeleton with its skin weights (rig.mjs), written as one GLB per tier:
//   src/assets/models/tobihaze/tobihaze.{hero,lod1,lod2}.glb
// Class M budget (tools/models/budget.json): hero ≤ 150k triangles / 96 joints, lod1 ≤ 15k / 32, lod2 ≤ 1.5k / 12.
//   node tools/models/tobihaze/build.mjs [--tier hero|lod1|lod2|all] [--out <dir>] [--clay]
// --clay writes plain clay materials (the shape stage); without it the baked textures are used (textures.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLBBuilder } from '../../lib/glb.mjs';
import { reduceSkeleton, remapSkin, vertexNormals, mergeParts } from '../../lib/gobyTiers.mjs';
import { HL, TL, SL, toObject, dirToObject } from './anatomy.mjs';
import { bodyTierMesh, ready, BODY_LAYOUT } from './fishmesh.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, finCard } from './fins.mjs';
import { buildEyeMesh, eyeRestFrame } from './eye.mjs';
import { JOINTS, J, LOD2_KEEP, bodyWeights, finWeights, AXES } from './rig.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);

/** Per tier: body cell (mm) and triangle target, fin density, eye segments, iris rect. */
export const TIERS = {
  hero: { h: 0.075, target: 76000, finSub: 4, finNT: 24, eyeNT: 32, eyeNP: 48, tex: 2048 },
  lod1: { h: 0.16, target: 7600, finSub: 1, finNT: 6, eyeNT: 10, eyeNP: 14, tex: 1024 },
  lod2: { h: 0.40, target: 760, card: true, eyeNT: 4, eyeNP: 6, tex: 256, permissive: true },
};
const IRIS_RECT = [0.80, 0.56, 1.0, 0.76]; // in the body texture's free corner (fishmesh.mjs layout)

// ------------------------------------------------------------------------------------------------ frames
const posToObject = (p) => {
  const n = p.length / 3, o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) o.set(toObject([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]), i * 3);
  return o;
};
const dirsToObject = (d, stride = 3) => {
  const n = d.length / stride, o = new Float32Array(d.length);
  for (let i = 0; i < n; i++) {
    const v = dirToObject([d[i * stride], d[i * stride + 1], d[i * stride + 2]]);
    o[i * stride] = v[0]; o[i * stride + 1] = v[1]; o[i * stride + 2] = v[2];
    if (stride === 4) o[i * 4 + 3] = d[i * 4 + 3];
  }
  return o;
};
const deltasToObject = (d) => dirsToObject(d).map((v) => v * 0.001);
/** v rotated by the unit quaternion q = [x, y, z, w] */
const qrot = (q, v) => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};

/** The skeleton in the object frame: world pivots and local translations (bind rotation identity). */
function skeleton(joints) {
  const obj = joints.map((j) => toObject(j.at));
  const idx = Object.fromEntries(joints.map((j, i) => [j.name, i]));
  return joints.map((j, i) => {
    const p = j.parent ? obj[idx[j.parent]] : [0, 0, 0];
    return { ...j, obj: obj[i], local: [obj[i][0] - p[0], obj[i][1] - p[1], obj[i][2] - p[2]], parentIndex: j.parent ? idx[j.parent] : -1 };
  });
}

/** Write the joints as nodes, the skin, and return { skin, jointNodes, rootJoint }. */
function addSkeleton(gb, sk, prefix) {
  const nodes = sk.map((j) => gb.addNode({ name: j.name, translation: j.local }));
  sk.forEach((j, i) => {
    const kids = sk.map((c, k) => (c.parentIndex === i ? nodes[k] : -1)).filter((k) => k >= 0);
    if (kids.length) gb.json.nodes[nodes[i]].children = kids;
  });
  const ibm = new Float32Array(sk.length * 16);
  sk.forEach((j, i) => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1];
    ibm.set(m, i * 16);
  });
  const acc = gb.addAccessor(ibm, 'MAT4');
  const rootIndex = sk.findIndex((j) => j.parentIndex < 0);
  const skin = gb.addSkin({ name: `${prefix}_Rig`, joints: nodes, inverseBindMatrices: acc, skeleton: nodes[rootIndex] });
  return { skin, jointNodes: nodes, rootJoint: nodes[rootIndex] };
}

// ------------------------------------------------------------------------------------------------ materials
function clayMaterials(gb, P, tier) {
  const body = gb.addMaterial({ name: `${P}_Body`, pbrMetallicRoughness: { baseColorFactor: [0.55, 0.5, 0.43, 1], metallicFactor: 0, roughnessFactor: 0.45 }, extras: { tobihaze: { role: 'body' } } });
  const fin = gb.addMaterial({
    name: tier === 'lod2' ? `${P}_Fins` : `${P}_Fin`, doubleSided: true,
    alphaMode: tier === 'lod2' ? 'MASK' : 'BLEND', ...(tier === 'lod2' ? { alphaCutoff: 0.5 } : {}),
    pbrMetallicRoughness: { baseColorFactor: [0.62, 0.52, 0.40, tier === 'lod2' ? 1 : 0.7], metallicFactor: 0, roughnessFactor: 0.5 },
    extras: { tobihaze: { role: 'fin', ...(tier === 'lod2' ? { merged: true } : {}) } },
  });
  const eye = tier === 'lod2' ? fin : gb.addMaterial({ name: `${P}_Eye`, pbrMetallicRoughness: { baseColorFactor: [0.25, 0.22, 0.18, 1], metallicFactor: 0, roughnessFactor: 0.08 }, extras: { tobihaze: { role: 'eye', irisRect: IRIS_RECT } } });
  return { body, fin, eye };
}

// ------------------------------------------------------------------------------------------------ tier
export async function buildTier(tierName, { outFile, clay = true } = {}) {
  await ready;
  const T = TIERS[tierName];
  const P = 'Tobihaze';
  const gb = new GLBBuilder('tobihaze-builder');
  const lod2 = tierName === 'lod2';

  // skeleton (lod2: reduced)
  const full = skeleton(JOINTS);
  let sk = full, remap = null;
  if (lod2) {
    const r = reduceSkeleton(full, LOD2_KEEP);
    remap = r.remap;
    sk = skeleton(r.kept.map(({ name, parent, at }) => ({ name, parent, at })));
  }
  const reskin = (w) => (remap ? remapSkin(w, remap) : w);
  const { skin, jointNodes, rootJoint } = addSkeleton(gb, sk, P);
  const jointIndex = Object.fromEntries(sk.map((j, i) => [j.name, i]));
  const mats = clayMaterials(gb, P, tierName);
  const sceneNodes = [];

  // body
  const body = bodyTierMesh({ h: T.h, target: T.target, permissive: T.permissive, log });
  const bw = reskin(bodyWeights(body.position, body.normal));
  const bodyPrim = gb.primitive({
    position: posToObject(body.position), normal: dirsToObject(body.normal), tangent: lod2 ? null : dirsToObject(body.tangent, 4),
    uv: body.uv, indices: body.indices, material: mats.body,
    extraAttributes: { JOINTS_0: { array: bw.joints, type: 'VEC4' }, WEIGHTS_0: { array: bw.weights, type: 'VEC4', normalized: true } },
  });
  sceneNodes.push(gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [bodyPrim], { tobihaze: { part: 'body' } }), skin }));
  let tris = body.indices.length / 3;

  // eyes: on the hero/lod1 one mesh shared by Eye_L / Eye_R under their joints; on lod2 merged into the fins' mesh
  const eye = buildEyeMesh({ nt: T.eyeNT, np: T.eyeNP, irisRect: IRIS_RECT });
  const eyeObj = { position: eye.position.map((v) => v * 0.001), normal: eye.normal, uv: eye.uv, indices: eye.indices };
  const lod2Parts = [];
  let eyeMesh = -1;
  for (const side of ['L', 'R']) {
    const fr = eyeRestFrame(side);
    if (lod2) {
      // posed at rest, weighted to the head
      const jn = jointIndex.J_head;
      const c = full[J[`J_eye${side}`]].obj;
      const n = eye.position.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = qrot(fr.rotationObject, [eyeObj.position[i * 3], eyeObj.position[i * 3 + 1], eyeObj.position[i * 3 + 2]]);
        const nn = qrot(fr.rotationObject, [eye.normal[i * 3], eye.normal[i * 3 + 1], eye.normal[i * 3 + 2]]);
        for (let k = 0; k < 3; k++) { pos[i * 3 + k] = c[k] + v[k]; nrm[i * 3 + k] = nn[k]; }
      }
      const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { joints[i * 4] = jn; weights[i * 4] = 255; }
      lod2Parts.push({ position: pos, normal: nrm, uv: eye.uv, indices: eye.indices, joints, weights });
    } else {
      if (eyeMesh < 0) eyeMesh = gb.addMesh('Eye', [gb.primitive({ ...eyeObj, material: mats.eye })], { tobihaze: { part: 'eye' } });
      const node = gb.addNode({ name: `Eye_${side}`, mesh: eyeMesh, rotation: fr.rotationObject, extras: { tobihaze: { eye: side } } });
      const jn = jointNodes[jointIndex[`J_eye${side}`]];
      const jnode = gb.json.nodes[jn];
      jnode.children = [...(jnode.children || []), node];
      tris += eye.indices.length / 3;
    }
  }

  // fins
  const defs = finDefinitions();
  for (const def of defs) {
    if (lod2) {
      const c = finCard(def);
      const w = reskin(finWeights(def, c));
      lod2Parts.push({ position: posToObject(c.position), normal: dirsToObject(c.normal ?? vertexNormals(c.position, c.indices)), uv: c.uv, indices: c.indices, joints: w.joints, weights: w.weights });
      continue;
    }
    const m = buildFinMesh(def, { sub: T.finSub, nt: def.type === 'caudal' ? Math.round(T.finNT * 1.25) : T.finNT });
    const w = finWeights(def, m);
    const tg = buildFinTargets(def, m);
    const prim = gb.primitive({
      position: posToObject(m.position), normal: dirsToObject(m.normal), uv: m.uv, indices: m.indices, material: mats.fin,
      targets: tg.deltas.map(deltasToObject),
      extraAttributes: { JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } },
    });
    const mesh = gb.addMesh(def.name, [prim], { targetNames: tg.names, tobihaze: { part: 'fin', fin: def.name } });
    gb.json.meshes[mesh].weights = tg.names.map(() => 0);
    sceneNodes.push(gb.addNode({ name: def.name, mesh, skin, extras: { tobihaze: { fin: def.name } } }));
    tris += m.indices.length / 3;
  }
  if (lod2) {
    const merged = mergeParts(lod2Parts);
    const prim = gb.primitive({
      position: merged.position, normal: merged.normal, uv: merged.uv, indices: merged.indices, material: mats.fin,
      extraAttributes: { JOINTS_0: { array: merged.joints, type: 'VEC4' }, WEIGHTS_0: { array: merged.weights, type: 'VEC4', normalized: true } },
    });
    sceneNodes.push(gb.addNode({ name: 'Fins', mesh: gb.addMesh('Fins', [prim], { tobihaze: { part: 'fins', merged: true } }), skin, extras: { tobihaze: { fin: 'merged' } } }));
    tris += merged.indices.length / 3;
  }

  // root and scene
  const regions = viewerRegions();
  const rootNode = gb.addNode({
    name: P, children: [rootJoint],
    extras: {
      species: 'periophthalmus_modestus', commonName: 'トビハゼ', totalLength_mm: TL, standardLength_mm: SL, units: 'm',
      tobihaze: { tier: tierName, axes: AXES, joints: sk.map((j) => j.name), hlMM: HL },
      regions,
    },
  });
  gb.addScene(P, [rootNode, ...sceneNodes]);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, gb.toBuffer());
  log(`${tierName}: ${tris} triangles, ${sk.length} joints → ${path.relative(root, outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB)`);
  return { tris, joints: sk.length };
}

/** Boxes for the photo-comparison viewer's framing (object frame). */
function viewerRegions() {
  const region = (s0, s1, y0, y1, z) => {
    const a = toObject([s0 * HL, y0 * HL, -z * HL]), b = toObject([s1 * HL, y1 * HL, z * HL]);
    return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
  };
  return {
    body: region(-0.02, TL / HL, -0.2, 1.3, 0.6),
    head: region(-0.02, 1.3, -0.02, 0.75, 0.38),
    face: region(-0.02, 0.5, -0.02, 0.75, 0.36),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = arg('--tier', 'all');
  const outDir = path.resolve(arg('--out', path.join(root, 'src/assets/models/tobihaze')));
  for (const t of which === 'all' ? Object.keys(TIERS) : [which]) await buildTier(t, { outFile: path.join(outDir, `tobihaze.${t}.glb`), clay: args.includes('--clay') });
}
