#!/usr/bin/env node
// Builds models/mahaze_<variant>.glb (geometry + baked textures) procedurally; --variant juvenile (default) | adult.
//   node tools/build-model.mjs [--fast] [--dump-textures <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { GLBBuilder } from './lib/glb.mjs';
import { encodePNG } from './lib/png.mjs';
import { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, MOUTH, RICTUS_S, VARIANT, GROWTH, profileTable, toObject, botY } from './mahaze/anatomy.mjs';
import { buildBody, COLORS } from './mahaze/body.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas } from './mahaze/fins.mjs';
import { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE, PUPIL_GLOW } from './mahaze/eye.mjs';
import { buildMouth, buildGills } from './mahaze/interior.mjs';
import { JOINTS, J, AXES, bodyWeights, interiorWeights, finWeights, buildClips } from './mahaze/rig.mjs';
import { FIN_TARGETS } from '../src/fish/pose.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
const outFile = path.join(root, 'models', `mahaze_${VARIANT}.glb`);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);
log(`variant: ${VARIANT} (growth ${GROWTH})`);

function toJPEG(w, h, ch, data, quality) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * ch];
    rgba[i * 4 + 1] = data[i * ch + 1];
    rgba[i * 4 + 2] = data[i * ch + 2];
    rgba[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data: rgba, width: w, height: h }, quality).data;
}

function downsample2(w, h, ch, data) {
  const W = w >> 1, H = h >> 1;
  const out = new Uint8Array(W * H * ch);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < ch; c++) {
        const i = (a, b) => data[((y * 2 + b) * w + x * 2 + a) * ch + c];
        out[(y * W + x) * ch + c] = (i(0, 0) + i(1, 0) + i(0, 1) + i(1, 1) + 2) >> 2;
      }
  return { w: W, h: H, data: out };
}

function image(gb, name, w, h, ch, data, fmt = 'png', quality = 92) {
  const buf = fmt === 'jpeg' ? toJPEG(w, h, ch, data, quality) : encodePNG(w, h, ch, data);
  if (dumpDir) {
    fs.mkdirSync(dumpDir, { recursive: true });
    fs.writeFileSync(path.join(dumpDir, `${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`), buf);
  }
  log(`  image ${name}: ${w}x${h} ${fmt} ${(buf.length / 1e6).toFixed(2)} MB`);
  return gb.addImage(buf, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', name);
}

const gb = new GLBBuilder();
for (const e of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_clearcoat']) gb.useExtension(e);

const LINEAR = 9729, MIPMAP = 9987, CLAMP = 33071, REPEAT = 10497;
const sBody = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: REPEAT });
const sClamp = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: CLAMP });

// ---------------------------------------------------------------- body
log('body');
// three patterns × three colour morphs per growth stage (glTF KHR_materials_variants): same mesh, own
// albedo / pigment textures for every pattern and colour
const PATTERN_IDS = [1, 2, 3];
const COLOR_IDS = COLORS.map((c, i) => i + 1);
const VARIANTS = PATTERN_IDS.flatMap((p) => COLOR_IDS.map((c) => ({ pattern: p, color: c })));
const body = buildBody({ NS: fast ? 230 : 460, NV: fast ? 112 : 224, NSb: fast ? 200 : 400, NVb: fast ? 96 : 192, texW: fast ? 1024 : 2048, texH: fast ? 512 : 1024, patterns: PATTERN_IDS, colors: COLOR_IDS, log });
const BT = body.textures;
const tNrm = gb.addTexture(image(gb, 'body_normal', BT.width, BT.height, 3, BT.normal, 'png'), sBody, 'body_normal');
const orm = downsample2(BT.width, BT.height, 3, BT.orm);
const tOrm = gb.addTexture(image(gb, 'body_orm', orm.w, orm.h, 3, orm.data, 'png'), sBody, 'body_occlusion_roughness');
const vol = downsample2(BT.width, BT.height, 3, BT.volume);
const tVol = gb.addTexture(image(gb, 'body_transmission_thickness', vol.w, vol.h, 3, vol.data, 'png'), sBody, 'body_transmission_thickness');
const profile = profileTable(512);
// one body material per pattern and colour: albedo, pigment and snout cap differ; normal, ORM and thickness
// are shared
const suffix = (p, c) => (p === 1 && c === 1 ? '' : `_p${p}${c === 1 ? '' : `_${COLORS[c - 1].name}`}`);
const bodyMaterial = (T, p, c) => {
  const sfx = suffix(p, c);
  const tAlb = gb.addTexture(image(gb, `body_basecolor${sfx}`, T.width, T.height, 3, T.albedo, 'jpeg', 93), sBody, `body_basecolor${sfx}`);
  const tPig = gb.addTexture(image(gb, `body_pigment${sfx}`, T.width, T.height, 3, T.pigment, 'jpeg', 95), sBody, `body_pigment_mel_irid_xan${sfx}`);
  const tCapAlb = gb.addTexture(image(gb, `snoutcap_basecolor_roughness${sfx}`, T.cap.size, T.cap.size, 4, T.cap.albedo, 'png'), sClamp, `snoutcap_basecolor_roughness${sfx}`);
  const tCapPig = gb.addTexture(image(gb, `snoutcap_pigment${sfx}`, T.cap.size, T.cap.size, 3, T.cap.pigment, 'png'), sClamp, `snoutcap_pigment${sfx}`);
  return gb.addMaterial({
    name: `Mahaze_Body${sfx}`,
    pbrMetallicRoughness: { baseColorTexture: { index: tAlb }, metallicFactor: 0, roughnessFactor: 1, metallicRoughnessTexture: { index: tOrm } },
    normalTexture: { index: tNrm, scale: 1 },
    occlusionTexture: { index: tOrm, strength: 0.85 },
    extensions: {
      KHR_materials_transmission: { transmissionFactor: 0.5, transmissionTexture: { index: tVol } },
      KHR_materials_volume: { thicknessFactor: 0.008, thicknessTexture: { index: tVol }, attenuationDistance: 0.0035, attenuationColor: [0.93, 0.74, 0.5] },
      KHR_materials_ior: { ior: 1.37 },
      KHR_materials_clearcoat: { clearcoatFactor: 0.35, clearcoatRoughnessFactor: 0.14 },
    },
    extras: {
      mahaze: {
        role: 'body',
        pattern: p,
        color: c,
        pigmentTexture: tPig,
        // planar (y, z) projected front of the snout, replaces the converging loft UVs at the tip
        snoutCap: { albedoRoughness: tCapAlb, pigment: tCapPig, rectMM: T.cap.rect },
        // jaws: s/y ramps of the dense lip and jaw tissue (s0, s1, y0, y1) for the volumetric shader
        fishFrame: { S0, Y0, SL, SEND: S_END, unitsPerMM: 0.001, jaws: [RICTUS_S - 0.5, RICTUS_S + 1.1, MOUTH[0][1] + 0.42, MOUTH[0][1] + 1.22] },
        vertebrae: { start: VERT_START, count: VERT_COUNT },
        profile: { n: profile.length, fields: ['yc', 't', 'b', 'w', 'nT', 'nB'], data: profile.flat() },
      },
    },
  });
};
const bodyMats = VARIANTS.map(({ pattern: p, color: c }) => {
  const T = body.patternTextures[PATTERN_IDS.indexOf(p)];
  return bodyMaterial({ ...T, ...T.colors[COLOR_IDS.indexOf(c)] }, p, c);
});
const mBody = bodyMats[0];
gb.useExtension('KHR_materials_variants');
gb.json.extensions = {
  ...(gb.json.extensions || {}),
  KHR_materials_variants: { variants: VARIANTS.map(({ pattern: p, color: c }) => ({ name: `pattern${p}_${COLORS[c - 1].name}`, extras: { mahaze: { pattern: p, color: c } } })) },
};
// mats[i] is the material of variant i
const variantMappings = (mats) => ({ KHR_materials_variants: { mappings: mats.map((material, i) => ({ material, variants: [i] })) } });

// ---------------------------------------------------------------- skeleton
log('rig');
const jointNodes = JOINTS.map((j) => {
  const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
  return gb.addNode({ name: j.name, translation: j.obj.map((v, k) => v - par[k]), children: [] });
});
JOINTS.forEach((j, i) => { if (j.parent) gb.json.nodes[jointNodes[J[j.parent]]].children.push(jointNodes[i]); });
const ibm = new Float32Array(JOINTS.length * 16);
JOINTS.forEach((j, i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1], i * 16);
});
const skin = gb.addSkin({ name: 'Mahaze_Rig', joints: jointNodes, skeleton: jointNodes[J.J_root], inverseBindMatrices: gb.addAccessor(ibm, 'MAT4') });
const skinned = [];
const skinAttrs = (w) => ({ JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } });

const bw = bodyWeights(body);
const bodyPrim = gb.primitive({ position: body.position, normal: body.normal, tangent: body.tangent, uv: body.uv, indices: body.indices, material: mBody, extraAttributes: skinAttrs(bw) });
bodyPrim.extensions = variantMappings(bodyMats);
skinned.push(gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [bodyPrim]), skin }));

// ---------------------------------------------------------------- mouth & gill interiors
log('interiors');
const mInterior = gb.addMaterial({
  name: 'Mahaze_Interior',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.3 },
  doubleSided: true,
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatRoughnessFactor: 0.08 } },
  extras: { mahaze: { role: 'interior' } },
});
const mouth = buildMouth(body);
const gills = buildGills(body);
for (const part of [mouth.cavity, mouth.teeth, gills]) {
  const w = interiorWeights(part, body);
  const prim = gb.primitive({
    position: part.position, normal: part.normal, uv: part.uv, indices: part.indices, material: mInterior,
    extraAttributes: { ...skinAttrs(w), COLOR_0: { array: part.color, type: 'VEC4' }, _GILL: { array: part.gill, type: 'SCALAR' } },
  });
  skinned.push(gb.addNode({ name: part.name, mesh: gb.addMesh(part.name, [prim]), skin }));
  log(`  ${part.name}: ${part.position.length / 3} verts`);
}

// ---------------------------------------------------------------- eyes (children of the eye joints)
log('eyes');
const iris = paintIris(fast ? 512 : 1024);
const tIris = gb.addTexture(image(gb, 'eye_iris', iris.size, iris.size, 3, iris.rgb, 'jpeg', 94), sClamp, 'eye_iris');
const mEye = gb.addMaterial({
  name: 'Mahaze_Eye',
  pbrMetallicRoughness: { baseColorTexture: { index: tIris }, metallicFactor: 0, roughnessFactor: 0.4 },
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.03 }, KHR_materials_ior: { ior: 1.376 } },
  extras: { mahaze: { role: 'eye', radiusMM: EYE.radius, pupilAngle: PUPIL_ANGLE, irisAngle: IRIS_ANGLE, corneaBulge: CORNEA_BULGE, pupilGlow: PUPIL_GLOW } },
});
const eye = buildEyeMesh();
const meshEye = gb.addMesh('Eye', [gb.primitive({ ...eye, material: mEye })]);
for (const [side, name, jn] of [[1, 'Eye_L', 'J_eyeL'], [-1, 'Eye_R', 'J_eyeR']]) {
  const tr = eyeTransform(side);
  const node = gb.addNode({ name, mesh: meshEye, rotation: tr.rotation });
  gb.json.nodes[jointNodes[J[jn]]].children.push(node);
}

// ---------------------------------------------------------------- fins
log('fins');
const defs = finDefinitions();
let tFinNrm = null;
// fin atlases per pattern; the colour morph only tints them (baseColorFactor) and scales their melanophores
const finAtlases = PATTERN_IDS.map((k) => {
  const sfx = k === 1 ? '' : `_p${k}`;
  const atlas = paintFinAtlas(defs, log, k);
  const tFinCol = gb.addTexture(image(gb, `fin_basecolor_alpha${sfx}`, atlas.size, atlas.size, 4, atlas.color, 'png'), sClamp, `fin_basecolor_alpha${sfx}`);
  if (tFinNrm === null) tFinNrm = gb.addTexture(image(gb, 'fin_normal', atlas.size, atlas.size, 3, atlas.normal, 'jpeg', 95), sClamp, 'fin_normal');
  const tFinData = gb.addTexture(image(gb, `fin_data${sfx}`, atlas.size, atlas.size, 4, atlas.data, 'png'), sClamp, `fin_ray_mel_irid_coverage${sfx}`);
  return { tFinCol, tFinData };
});
const finMats = VARIANTS.map(({ pattern: p, color: c }) => {
  const { tFinCol, tFinData } = finAtlases[PATTERN_IDS.indexOf(p)];
  const fin = COLORS[c - 1].fin;
  return gb.addMaterial({
    name: `Mahaze_Fin${suffix(p, c)}`,
    pbrMetallicRoughness: { baseColorTexture: { index: tFinCol }, baseColorFactor: [...fin.tint, 1], metallicFactor: 0, roughnessFactor: 0.38 },
    normalTexture: { index: tFinNrm, scale: 1 },
    alphaMode: 'BLEND',
    doubleSided: true,
    extensions: { KHR_materials_ior: { ior: 1.36 } },
    extras: { mahaze: { role: 'fin', pattern: p, color: c, dataTexture: tFinData, tint: fin.tint, melK: fin.melK } },
  });
});
const mFin = finMats[0];
const finNodes = {};
let contactFishY = botY(12.0) - 0.2; // lowest point of the pelvic sucker rim (the fish rests on it)
for (const def of defs) {
  const SUB = 6, NT = def.name === 'Fin_Caudal' ? 44 : 36;
  const m = buildFinMesh(def, SUB, NT);
  if (def.type === 'pelvic') { contactFishY = Infinity; for (let i = 1; i < m.fish.length; i += 3) contactFishY = Math.min(contactFishY, m.fish[i]); }
  const w = finWeights(def.name, m.fish, m.rayT, m.baseS);
  const names = FIN_TARGETS[def.name];
  const targets = buildFinTargets(def, SUB, NT, names);
  const prim = gb.primitive({ ...m, material: mFin, extraAttributes: skinAttrs(w), targets });
  prim.extensions = variantMappings(finMats);
  const mesh = gb.addMesh(def.name, [prim], { targetNames: names });
  gb.json.meshes[mesh].weights = names.map(() => 0);
  finNodes[def.name] = gb.addNode({ name: def.name, mesh, skin, extras: { mahaze: { fin: def.name } } });
  skinned.push(finNodes[def.name]);
}

// ---------------------------------------------------------------- animations
log('animations');
for (const clip of buildClips()) {
  const channels = clip.channels.map((c) => ({ node: jointNodes[c.joint], path: c.path, times: c.times, values: c.values }));
  for (const wch of clip.weights) channels.push({ node: finNodes[wch.mesh], path: 'weights', times: wch.times, values: wch.values });
  gb.addAnimation({ name: clip.name, channels });
  log(`  ${clip.name}: ${clip.duration.toFixed(3)}s, ${channels.length} channels`);
}

// ---------------------------------------------------------------- scene
const rootNode = gb.addNode({
  name: 'Mahaze_Juvenile',
  children: [jointNodes[J.J_root]],
  extras: {
    species: 'Acanthogobius flavimanus (Temminck & Schlegel, 1845)',
    commonName: `マハゼ (yellowfin goby), ${{ juvenile: 'juvenile', subadult: 'subadult (between juvenile and adult)', adult: 'adult-proportioned' }[VARIANT]}`,
    variant: VARIANT,
    growth: GROWTH,
    totalLength_mm: TL,
    standardLength_mm: SL,
    units: 'metres (+Y dorsal, +Z anterior)',
    animations: 'Idle (loop, breathing), Swim (loop, 8 Hz burst tail beat), Yawn (one-shot)',
    // rig axes (object space, sign folded in) for procedural animation with src/fish/pose.js
    mahazeRig: { axes: AXES, contactY: toObject([12.0, contactFishY, 0])[1], tailContactY: toObject([48.0, 0.6, 0])[1] },
  },
});
// skinned meshes sit at the scene root (their node transforms are ignored; joints drive them)
gb.addScene('Mahaze', [rootNode, ...skinned]);
gb.json.asset.copyright = 'Procedurally generated model (no photographic textures).';

const glb = gb.toBuffer();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, glb);
log(`wrote ${path.relative(root, outFile)} (${(glb.length / 1e6).toFixed(2)} MB), body ${body.stats.vertices} verts / ${body.stats.triangles} tris`);
