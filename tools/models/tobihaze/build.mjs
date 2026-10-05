#!/usr/bin/env node
// Builds src/assets/models/tobihaze/tobihaze.<tier>.glb (geometry + baked textures) procedurally.
//   node tools/models/tobihaze/build.mjs --tier hero|lod1|lod2 [--dump-textures <dir>]
//
// Node hierarchy (all skin parts are SkinnedMeshes on one skeleton):
//   TobihazeRoot ─ J_root (skeleton) … J_eyeL ─ Eye_L, J_eyeR ─ Eye_R
//               ├ Head (skin + mouth interior)   ├ Body          ├ Tail (skin + caudal fin)
//               ├ PectoralFin_L / _R (arm + web) ├ PelvicFin     ├ DorsalFin (D1 + D2)   └ AnalFin
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { GLBBuilder } from '../../lib/glb.mjs';
import { encodePNG } from '../../lib/png.mjs';
import { S0, Y0, SL, S_END, TL, EYE, BODY_U, toObject, dirToObject, botY } from './anatomy.mjs';
import { buildSkin, skinParts, skinTarget, buildMouth, buildDomes, bakeSkinTextures, SPLIT } from './body.mjs';
import { finDefinitions, buildFinMesh, buildFinFold, paintFinAtlas, buildArm, armPaint, mirrorMesh, PEC, PELVIC } from './fins.mjs';
import { buildEyeMesh, eyeRotation, paintEye, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE } from './eye.mjs';
import { JOINTS, J, skinWeights, mouthWeights, armWeights, finWeights, buildClips, CLIP_SPEED } from './rig.mjs';
import { MORPHS, SPINE } from '../../../src/creatures/species/tobihaze/pose.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const tierIdx = args.indexOf('--tier');
const tierName = tierIdx >= 0 ? args[tierIdx + 1] : 'hero';
const TIERS = {
  hero: { NS: 420, NV: 232, tex: [2048, 1024], fin: 2048, finSub: 5, finNT: 28, iris: 1024, eye: [48, 64], dome: [84, 192], arm: [32, 28], mouth: true, finMask: false },
  lod1: { NS: 200, NV: 112, tex: [1024, 512], fin: 1024, finSub: 3, finNT: 14, iris: 512, eye: [24, 32], dome: [52, 120], arm: [22, 18], mouth: true, finMask: false },
  lod2: { NS: 56, NV: 30, tex: [512, 256], fin: 512, finSub: 1, finNT: 4, iris: 128, eye: [8, 10], dome: [10, 20], arm: [4, 6], mouth: false, finMask: true },
};
const tier = TIERS[tierName];
if (!tier) { console.error(`unknown tier ${tierName}`); process.exit(1); }
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
const outFile = path.join(root, 'src', 'assets', 'models', 'tobihaze', `tobihaze.${tierName}.glb`);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

function toJPEG(w, h, ch, data, quality) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = data[i * ch]; rgba[i * 4 + 1] = data[i * ch + 1]; rgba[i * 4 + 2] = data[i * ch + 2]; rgba[i * 4 + 3] = 255; }
  return jpeg.encode({ data: rgba, width: w, height: h }, quality).data;
}
function image(gb, name, w, h, ch, data, fmt = 'png', quality = 92) {
  const buf = fmt === 'jpeg' ? toJPEG(w, h, ch, data, quality) : encodePNG(w, h, ch, data);
  if (dumpDir) { fs.mkdirSync(dumpDir, { recursive: true }); fs.writeFileSync(path.join(dumpDir, `${tierName}_${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`), buf); }
  log(`  image ${name}: ${w}x${h} ${fmt} ${(buf.length / 1e6).toFixed(2)} MB`);
  return gb.addImage(buf, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', name);
}

const gb = new GLBBuilder('tobihaze-procedural-builder');
gb.useExtension('KHR_materials_clearcoat');
gb.useExtension('KHR_materials_ior');
gb.useExtension('KHR_materials_iridescence');
const LINEAR = 9729, MIPMAP = 9987, CLAMP = 33071, REPEAT = 10497;
const sBody = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: REPEAT });
const sClamp = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: CLAMP });

// ---------------------------------------------------------------- skin textures
log(`tier ${tierName}`);
log('skin textures');
const [TW, TH] = tier.tex;
const ST = bakeSkinTextures({ W: TW, H: TH, armPaint, log });
const tAlb = gb.addTexture(image(gb, 'skin_basecolor', TW, TH, 3, ST.albedo, 'jpeg', 93), sBody, 'skin_basecolor');
const tNrm = gb.addTexture(image(gb, 'skin_normal', TW, TH, 3, ST.normal, 'png'), sBody, 'skin_normal');
const tOrm = gb.addTexture(image(gb, 'skin_orm', TW, TH, 3, ST.orm, 'png'), sBody, 'skin_occlusion_roughness');
const tData = gb.addTexture(image(gb, 'skin_data', TW, TH, 3, ST.data, 'png'), sBody, 'skin_mud_mucus_sun');
const mSkin = gb.addMaterial({
  name: 'Tobihaze_Skin',
  pbrMetallicRoughness: { baseColorTexture: { index: tAlb }, metallicFactor: 0, roughnessFactor: 1, metallicRoughnessTexture: { index: tOrm } },
  normalTexture: { index: tNrm, scale: 1 },
  occlusionTexture: { index: tOrm, strength: 0.9 },
  extensions: {
    // the mucus film: a thin clear layer over the skin (the runtime material modulates it with wetness)
    KHR_materials_clearcoat: { clearcoatFactor: 0.8, clearcoatRoughnessFactor: 0.06 },
    KHR_materials_ior: { ior: 1.4 },
  },
  extras: { tobihaze: { role: 'skin', dataTexture: tData, bodyU: BODY_U } },
});

// ---------------------------------------------------------------- skeleton
log('rig');
const jointNodes = JOINTS.map((j) => {
  const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
  return gb.addNode({ name: j.name, translation: j.obj.map((v, k) => v - par[k]), children: [] });
});
JOINTS.forEach((j, i) => { if (j.parent) gb.json.nodes[jointNodes[J[j.parent]]].children.push(jointNodes[i]); });
const ibm = new Float32Array(JOINTS.length * 16);
JOINTS.forEach((j, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1], i * 16));
const skin = gb.addSkin({ name: 'Tobihaze_Rig', joints: jointNodes, skeleton: jointNodes[J.J_root], inverseBindMatrices: gb.addAccessor(ibm, 'MAT4') });
const skinAttrs = (w) => ({ JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } });
const parts = [];
const zeros = (n) => new Float32Array(n * 3);

// ---------------------------------------------------------------- skin (head / body / tail)
log('skin mesh');
const G = buildSkin(tier.NS, tier.NV, log);
const SP = skinParts(G);
log(`  head ${SP.head.list.length} v, body ${SP.body.list.length} v, tail ${SP.tail.list.length} v`);
log('  morph targets (breathe, blink) …');
const headTargets = [
  skinTarget(SP.head, { breathe: 1 }),
  zeros(SP.head.list.length),
  zeros(SP.head.list.length),
];
const bodyTargets = [skinTarget(SP.body, { breathe: 1 }, 24)];

// mouth interior (hero / lod1)
const mInterior = gb.addMaterial({
  name: 'Tobihaze_Mouth',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.35 },
  doubleSided: true,
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.05 } },
  extras: { tobihaze: { role: 'interior' } },
});
const headPrims = [gb.primitive({ position: SP.head.position, normal: SP.head.normal, tangent: SP.head.tangent, uv: SP.head.uv, indices: SP.head.indices, material: mSkin, extraAttributes: skinAttrs(skinWeights(SP.head.list)), targets: headTargets })];
// the eye domes (dermal cups), meshed from the eyes' centres
{
  log('  eye domes …');
  const D = buildDomes(tier.dome[0], tier.dome[1]);
  const n = D.position.length / 3;
  const w = { joints: new Uint8Array(n * 4), weights: new Uint8Array(n * 4) };
  for (let k = 0; k < n; k++) { w.joints[k * 4] = J.J_head; w.weights[k * 4] = 255; }
  headPrims.push(gb.primitive({ position: D.position, normal: D.normal, tangent: D.tangent, uv: D.uv, indices: D.indices, material: mSkin,
    extraAttributes: skinAttrs(w), targets: [zeros(n), D.blinkL, D.blinkR] }));
  log(`    ${n} v`);
}
if (tier.mouth) {
  const mouth = buildMouth(G);
  const n = mouth.position.length / 3;
  headPrims.push(gb.primitive({ position: mouth.position, normal: mouth.normal, uv: mouth.uv, indices: mouth.indices, material: mInterior,
    extraAttributes: { ...skinAttrs(mouthWeights(mouth)), COLOR_0: { array: mouth.color, type: 'VEC4' } }, targets: [zeros(n), zeros(n), zeros(n)] }));
  log(`  mouth interior ${n} v`);
}
const meshHead = gb.addMesh('Head', headPrims, { targetNames: MORPHS.Head });
gb.json.meshes[meshHead].weights = MORPHS.Head.map(() => 0);
parts.push(gb.addNode({ name: 'Head', mesh: meshHead, skin }));
const meshBody = gb.addMesh('Body', [gb.primitive({ position: SP.body.position, normal: SP.body.normal, tangent: SP.body.tangent, uv: SP.body.uv, indices: SP.body.indices, material: mSkin, extraAttributes: skinAttrs(skinWeights(SP.body.list)), targets: bodyTargets })], { targetNames: MORPHS.Body });
gb.json.meshes[meshBody].weights = [0];
parts.push(gb.addNode({ name: 'Body', mesh: meshBody, skin }));

// ---------------------------------------------------------------- fins
log('fins');
const defs = finDefinitions();
const atlas = paintFinAtlas(defs, tier.fin, log);
const tFinCol = gb.addTexture(image(gb, 'fin_basecolor_alpha', atlas.size, atlas.size, 4, atlas.color, 'png'), sClamp, 'fin_basecolor_alpha');
const tFinNrm = gb.addTexture(image(gb, 'fin_normal', atlas.size, atlas.size, 3, atlas.normal, 'jpeg', 95), sClamp, 'fin_normal');
const mFin = gb.addMaterial({
  name: 'Tobihaze_Fin',
  pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, metallicFactor: 0, roughnessFactor: 0.42 },
  normalTexture: { index: tFinNrm, scale: 1 },
  alphaMode: tier.finMask ? 'MASK' : 'BLEND',
  ...(tier.finMask ? { alphaCutoff: 0.45 } : {}),
  doubleSided: true,
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.5, clearcoatRoughnessFactor: 0.08 } },
  extras: { tobihaze: { role: 'fin' } },
});
const D = Object.fromEntries(defs.map((d) => [d.name, d]));
const finPrim = (def, extraTargets = null, side = 1, mirrorIt = false) => {
  let m = buildFinMesh(def, tier.finSub, tier.finNT);
  let fold = buildFinFold(def, m, tier.finSub, tier.finNT);
  if (mirrorIt) { m = mirrorMesh(m); for (let k = 0; k < fold.length; k += 3) fold[k] = -fold[k]; }
  const kind = def.type === 'pectoral' ? 'Fin_Pectoral' : def.name;
  const w = finWeights(kind, m, side);
  return { prim: gb.primitive({ position: m.position, normal: m.normal, uv: m.uv, indices: m.indices, material: mFin, extraAttributes: skinAttrs(w), targets: extraTargets ? extraTargets(m, fold) : [fold] }), mesh: m };
};
// dorsal fins (one mesh, two fold targets)
{
  const d1 = finPrim(D.Fin_Dorsal1, (m, fold) => [fold, zeros(m.position.length / 3)]);
  const d2 = finPrim(D.Fin_Dorsal2, (m, fold) => [zeros(m.position.length / 3), fold]);
  const mesh = gb.addMesh('DorsalFin', [d1.prim, d2.prim], { targetNames: MORPHS.DorsalFin });
  gb.json.meshes[mesh].weights = [0, 0];
  parts.push(gb.addNode({ name: 'DorsalFin', mesh, skin }));
}
{
  const a = finPrim(D.Fin_Anal);
  const mesh = gb.addMesh('AnalFin', [a.prim], { targetNames: MORPHS.AnalFin });
  gb.json.meshes[mesh].weights = [0];
  parts.push(gb.addNode({ name: 'AnalFin', mesh, skin }));
}
// tail: the skin behind SPLIT.tail and the caudal fin
{
  const c = finPrim(D.Fin_Caudal);
  const tailSkin = gb.primitive({ position: SP.tail.position, normal: SP.tail.normal, tangent: SP.tail.tangent, uv: SP.tail.uv, indices: SP.tail.indices, material: mSkin, extraAttributes: skinAttrs(skinWeights(SP.tail.list)), targets: [zeros(SP.tail.list.length)] });
  const mesh = gb.addMesh('Tail', [tailSkin, c.prim], { targetNames: MORPHS.Tail });
  gb.json.meshes[mesh].weights = [0];
  parts.push(gb.addNode({ name: 'Tail', mesh, skin }));
}
// pectoral fins: the muscular arm (skin material) and the web
for (const [side, name] of [[1, 'PectoralFin_L'], [-1, 'PectoralFin_R']]) {
  const arm = buildArm(tier.arm[0], tier.arm[1], side);
  const n = arm.fish.length / 3;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), tangent = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    position.set(toObject(arm.fish.slice(k * 3, k * 3 + 3)), k * 3);
    normal.set(dirToObject(arm.nrm.slice(k * 3, k * 3 + 3)), k * 3);
    // tangent: along the arm, made square to the normal (at the rounded tip, where the normal turns along the arm,
    // the arm's width direction instead)
    const d = dirToObject(side > 0 ? PEC.dir : [PEC.dir[0], PEC.dir[1], -PEC.dir[2]]);
    const nn = normal.subarray(k * 3, k * 3 + 3);
    let t = [0, 1, 2].map((c) => d[c] - nn[c] * (d[0] * nn[0] + d[1] * nn[1] + d[2] * nn[2]));
    if (Math.hypot(...t) < 0.2) {
      const wv = dirToObject(side > 0 ? PEC.width : [PEC.width[0], PEC.width[1], -PEC.width[2]]);
      t = [0, 1, 2].map((c) => wv[c] - nn[c] * (wv[0] * nn[0] + wv[1] * nn[1] + wv[2] * nn[2]));
    }
    const tl = Math.hypot(...t) || 1;
    tangent.set([t[0] / tl, t[1] / tl, t[2] / tl, 1], k * 4);
  }
  const armPrim = gb.primitive({ position, normal, tangent, uv: new Float32Array(arm.uv), indices: new Uint32Array(arm.indices), material: mSkin, extraAttributes: skinAttrs(armWeights(arm.at, side)), targets: [zeros(n)] });
  const web = finPrim(D.Fin_Pectoral_L, null, side, side < 0);
  const mesh = gb.addMesh(name, [armPrim, web.prim], { targetNames: MORPHS[name] });
  gb.json.meshes[mesh].weights = [0];
  parts.push(gb.addNode({ name, mesh, skin }));
}
let pelvicLowY = Infinity;
{
  const p = finPrim(D.Fin_Pelvic);
  for (let k = 1; k < p.mesh.position.length; k += 3) pelvicLowY = Math.min(pelvicLowY, p.mesh.position[k]);
  const mesh = gb.addMesh('PelvicFin', [p.prim], { targetNames: MORPHS.PelvicFin });
  gb.json.meshes[mesh].weights = [0];
  parts.push(gb.addNode({ name: 'PelvicFin', mesh, skin }));
}

// ---------------------------------------------------------------- eyes (rigid, children of the eye joints)
log('eyes');
const eyeTex = paintEye(tier.iris);
const tIris = gb.addTexture(image(gb, 'eye_basecolor', eyeTex.size, eyeTex.size, 3, eyeTex.rgb, 'jpeg', 95), sClamp, 'eye_basecolor');
const tEyeMR = gb.addTexture(image(gb, 'eye_metal_rough', eyeTex.size, eyeTex.size, 3, eyeTex.mr, 'png'), sClamp, 'eye_metal_rough');
const tEyeIr = gb.addTexture(image(gb, 'eye_iridescence', eyeTex.size, eyeTex.size, 3, eyeTex.irid, 'png'), sClamp, 'eye_iridescence');
const mEye = gb.addMaterial({
  name: 'Tobihaze_Eye',
  pbrMetallicRoughness: { baseColorTexture: { index: tIris }, metallicRoughnessTexture: { index: tEyeMR }, metallicFactor: 1, roughnessFactor: 1 },
  extensions: {
    KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.02 },
    KHR_materials_ior: { ior: 1.376 },
    // structural colour of the iris ring and the lens glow: copper ↔ turquoise-blue with the angle
    KHR_materials_iridescence: {
      iridescenceFactor: 1, iridescenceTexture: { index: tEyeIr }, iridescenceIor: 1.4,
      iridescenceThicknessMinimum: 220, iridescenceThicknessMaximum: 560, iridescenceThicknessTexture: { index: tEyeIr },
    },
  },
  extras: { tobihaze: { role: 'eye', radiusMM: EYE.radius, pupilAngle: PUPIL_ANGLE, irisAngle: IRIS_ANGLE, corneaBulge: CORNEA_BULGE } },
});
const eye = buildEyeMesh(tier.eye[0], tier.eye[1]);
const meshEye = gb.addMesh('Eye', [gb.primitive({ ...eye, material: mEye })]);
for (const [side, name, jn] of [[1, 'Eye_L', 'J_eyeL'], [-1, 'Eye_R', 'J_eyeR']]) {
  const node = gb.addNode({ name, mesh: meshEye, rotation: eyeRotation(side) });
  gb.json.nodes[jointNodes[J[jn]]].children.push(node);
}

// ---------------------------------------------------------------- animations
log('animations');
const partByName = Object.fromEntries(parts.map((n) => [gb.json.nodes[n].name, n]));
for (const clip of buildClips()) {
  const channels = clip.channels.map((c) => ({ node: jointNodes[c.joint], path: c.path, times: c.times, values: c.values }));
  for (const wch of clip.weights) if (partByName[wch.mesh] !== undefined) channels.push({ node: partByName[wch.mesh], path: 'weights', times: wch.times, values: wch.values });
  gb.addAnimation({ name: clip.name, channels });
  log(`  ${clip.name}: ${clip.duration.toFixed(3)}s, ${channels.length} channels`);
}

// ---------------------------------------------------------------- scene
const objY = (y) => (y - Y0) / 1000;
const rootNode = gb.addNode({
  name: 'TobihazeRoot',
  children: [jointNodes[J.J_root], ...parts],
  extras: {
    species: 'Periophthalmus modestus Cantor, 1842',
    commonName: 'トビハゼ (shuttles hoppfish / mudskipper), adult',
    totalLength_mm: TL,
    standardLength_mm: SL,
    units: 'metres (+Y dorsal, +Z anterior, +X the fish\'s left); origin on the ventral line under the pectoral girdle',
    animations: 'Idle, Crawl (one crutching stroke), Hop, Swim, Blink, Feed',
    tobihazeRig: {
      tlMM: TL, slMM: SL, s0MM: S0,
      spine: SPINE,
      eyeRetract_m: EYE.retract / 1000,
      eyeRadius_m: EYE.radius / 1000,
      // arm geometry for the IK (object space, metres; left side, the right mirrors X)
      pec: { base: toObject(PEC.base), wrist: toObject(PEC.wrist), dir: dirToObject(PEC.dir), width: dirToObject(PEC.width), normal: dirToObject(PEC.normal), armLen_m: PEC.joint / 1000, handLen_m: (PEC.len - PEC.joint + 0.88 * 7.9) / 1000 },
      // contact geometry: the belly line under the chain and the pelvic fins' lowest point
      contacts: { pelvicY_m: pelvicLowY, bellyY: SPINE.map(([n, s]) => [n, objY(botY(Math.min(s, S_END - 0.5)))]) },
      splits: SPLIT,
      clips: { crawlSpeed_mps: CLIP_SPEED.Crawl },
    },
  },
});
gb.addScene('Tobihaze', [rootNode]);
gb.json.asset.copyright = 'Procedurally generated model (no photographic textures).';
const glb = gb.toBuffer();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, glb);
log(`wrote ${path.relative(root, outFile)} (${(glb.length / 1e6).toFixed(2)} MB)`);
