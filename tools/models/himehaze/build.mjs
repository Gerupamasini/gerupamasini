#!/usr/bin/env node
// Builds the ヒメハゼ GLB tiers (geometry + baked textures) procedurally, with the マハゼ pipeline.
//   node tools/models/himehaze/build.mjs [--tier hero|lod1|lod2] [--male] [--fast] [--dump-textures <dir>]
//   --male (or HIMEHAZE_VARIANT=male) builds the breeding male (filamentous first dorsal spine, black cheek,
//   dusky pelvic and anal fins) as its own set of tiers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { GLBBuilder } from '../../lib/glb.mjs';
import { encodePNG } from '../../lib/png.mjs';
import { S0, Y0, SL, S_END, TL, VERT_START, VERT_COUNT, EYE, MALE, profileTable, toObject, botY } from './anatomy.mjs';
import { buildBody } from './body.mjs';
import { finDefinitions, buildFinMesh, buildFinTargets, paintFinAtlas, ATLAS } from './fins.mjs';
import { buildEyeMesh, eyeTransform, paintIris, PUPIL_ANGLE, IRIS_ANGLE, CORNEA_BULGE } from './eye.mjs';
import { buildMouth, buildGills } from './interior.mjs';
import { JOINTS, J, AXES, bodyWeights, interiorWeights, finWeights, buildClips } from './rig.mjs';
import { FIN_TARGETS } from '../../../src/creatures/species/mahaze/pose.js';
import { SPECIES } from './species.mjs';
import { packBodyMaps, meanPigments, insetIris, eyeUvToAtlas, irisRectUV, packCap, finHeroMaps, collapseJoints, remapWeights, lodExtras, LOD2_JOINTS } from '../../lib/gobyLod.mjs';
const P = SPECIES.prefix;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
// --tier hero|lod1|lod2 selects the detail level (hero = observation quality, lod1 = near, lod2 = mid distance)
const tierIdx = args.indexOf('--tier');
const tierName = tierIdx >= 0 ? args[tierIdx + 1] : args.includes('--fast') ? 'lod1' : 'hero';
// within the model budget of a middle-sized species (M: docs/quality/model-budget.md): hero ≤ 150 000 triangles, eight
// maps of ≤ 2048, six materials; lod1 ≤ 15 000 triangles, four maps of ≤ 1024; lod2 ≤ 1500 triangles, two maps of
// ≤ 256, two materials, 12 joints
const TIERS = {
  hero: { NS: 310, NV: 152, NSb: 400, NVb: 192, texW: 2048, texH: 1024, finSub: 3, finNT: 24, finNTCaudal: 28, iris: 512, eyeNT: 40, eyeNP: 60, interior: true, finMask: false, finDown: 0 },
  lod1: { NS: 110, NV: 48, NSb: 200, NVb: 96, texW: 1024, texH: 512, finSub: 2, finNT: 6, finNTCaudal: 8, iris: 256, eyeNT: 10, eyeNP: 16, interior: false, finMask: false, finDown: 1, lod: true },
  lod2: { NS: 24, NV: 16, NSb: 100, NVb: 48, texW: 256, texH: 128, finSub: 1, finNT: 3, finNTCaudal: 3, iris: 64, eyeNT: 4, eyeNP: 6, interior: false, finMask: true, finDown: 3, lod: true, far: true },
};
const tier = TIERS[tierName];
if (!tier) { console.error(`unknown tier ${tierName}`); process.exit(1); }
const dumpIdx = args.indexOf('--dump-textures');
const dumpDir = dumpIdx >= 0 ? args[dumpIdx + 1] : null;
// --male builds the breeding male as its own set of tiers
const outFile = path.join(root, 'src', 'assets', 'models', 'himehaze', `himehaze${MALE ? '_male' : ''}.${tierName}.glb`);

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

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

const gb = new GLBBuilder(SPECIES.generator);
// every tier carries packed maps and one material per part, within the model budget (tools/lib/gobyLod.mjs)
const HERO = tierName === 'hero', FAR = !!tier.far;
const EXTS = HERO ? ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_clearcoat'] : ['KHR_materials_ior', ...(FAR ? [] : ['KHR_materials_clearcoat'])];
for (const e of EXTS) gb.useExtension(e);

const LINEAR = 9729, MIPMAP = 9987, CLAMP = 33071, REPEAT = 10497;
const sBody = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: REPEAT });
const sClamp = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: CLAMP, wrapT: CLAMP });

// ---------------------------------------------------------------- body
log('body');
log(`tier ${tierName}, variant ${SPECIES.variant}`);
const body = buildBody({ NS: tier.NS, NV: tier.NV, NSb: tier.NSb, NVb: tier.NVb, texW: tier.texW, texH: tier.texH, lod: true, cap: HERO, log });
const BT = body.textures;
const profile = profileTable(512);
const frameExtras = {
  fishFrame: { S0, Y0, SL, SEND: S_END, unitsPerMM: 0.001 },
  vertebrae: { start: VERT_START, count: VERT_COUNT },
  profile: { n: profile.length, fields: ['yc', 't', 'b', 'w', 'nT', 'nB'], data: profile.flat() },
  ...(SPECIES.shaderAnatomy ? { anatomy: SPECIES.shaderAnatomy } : {}),
};
// albedo without the melanin and the pigments in channels (one pattern: its melanin fills the three; see packBodyMaps)
// (melRGB below: the melanin's darkening of the albedo; its green coefficient encodes the melanin maps)
const MEL_RGB = [3.2, 3.44, 3.76];
const pk = packBodyMaps([BT], FAR, BT.width, BT.height, MEL_RGB[1], HERO);
const tA = gb.addTexture(image(gb, 'body_basecolor_nomelanin', BT.width, BT.height, 4, pk.A, 'png'), sBody, FAR ? 'body_basecolor_nomelanin_melanin' : 'body_basecolor_nomelanin_xanthophores');
const tNrm = FAR ? null : gb.addTexture(image(gb, 'body_normal', BT.width, BT.height, 3, BT.normal, 'png'), sBody, 'body_normal');
const orm = HERO ? downsample2(BT.width, BT.height, 3, BT.orm) : null;
const tOrm = orm ? gb.addTexture(image(gb, 'body_orm', orm.w, orm.h, 3, orm.data, 'png'), sBody, 'body_occlusion_roughness') : null;
// (the distance tiers' melanin as its sRGB-encoded darkening: named a colour map so the packer keeps it sRGB; the
// hero's as densities, a data map: see encodeMelanin)
const tB = !pk.B ? null : HERO
  ? gb.addTexture(image(gb, 'body_melanin_iridophores', BT.width, BT.height, 4, pk.B, 'png'), sBody, 'body_melanin_iridophores')
  : gb.addTexture(image(gb, 'body_melanin_darkening_colour', BT.width, BT.height, 4, pk.B, 'png'), sBody, 'body_melanin_darkening_iridophores');
// the hero's snout cap: planar (y, z) projected front of the snout, replaces the converging loft UVs at the tip
let snoutCap = null;
if (HERO) {
  const cap = packCap([BT.cap], MEL_RGB[1], true);
  const tCap = gb.addTexture(image(gb, 'snoutcap_packed', cap.w, cap.h, 4, cap.data, 'png'), sClamp, 'snoutcap_albedo_rough_melanin_xanthophores');
  snoutCap = { packed: tCap, panels: cap.panels, rectMM: BT.cap.rect };
}
const mBody = gb.addMaterial({
  name: `${P}_Body`,
  pbrMetallicRoughness: { baseColorTexture: { index: tA }, metallicFactor: 0, roughnessFactor: HERO ? 1 : 0.33, ...(tOrm !== null ? { metallicRoughnessTexture: { index: tOrm } } : {}) },
  ...(tNrm !== null ? { normalTexture: { index: tNrm, scale: 1 } } : {}),
  ...(tOrm !== null ? { occlusionTexture: { index: tOrm, strength: 0.85 } } : {}),
  extensions: HERO
    ? {
      KHR_materials_transmission: { transmissionFactor: 0.5 },
      KHR_materials_volume: { thicknessFactor: 0.008, attenuationDistance: 0.0035, attenuationColor: [0.93, 0.74, 0.5] },
      KHR_materials_ior: { ior: 1.37 },
      KHR_materials_clearcoat: { clearcoatFactor: 0.35, clearcoatRoughnessFactor: 0.14 },
    }
    : { KHR_materials_ior: { ior: 1.37 }, ...(FAR ? {} : { KHR_materials_clearcoat: { clearcoatFactor: 0.35, clearcoatRoughnessFactor: 0.14 } }) },
  extras: {
    mahaze: {
      role: 'body',
      ...frameExtras,
      ...(tB !== null ? { pigmentTexture: tB } : {}),
      ...(snoutCap ? { snoutCap } : {}),
      // (the bake darkens the albedo by exp(-1.6 mel (2.0, 2.15, 2.35)))
      lod: lodExtras({ far: FAR, melRGB: MEL_RGB, pigments: meanPigments(BT), density: HERO }),
    },
  },
});

// ---------------------------------------------------------------- skeleton
log('rig');
const jointNodes = JOINTS.map((j) => {
  const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
  return gb.addNode({ name: j.name, translation: j.obj.map((v, k) => v - par[k]), children: [] });
});
JOINTS.forEach((j, i) => { if (j.parent) gb.json.nodes[jointNodes[J[j.parent]]].children.push(jointNodes[i]); });
// the far tier skins to fewer joints (the others stay as plain nodes, carrying the eyes)
const collapsed = FAR ? collapseJoints(JOINTS, LOD2_JOINTS.M) : null;
const skinJoints = collapsed ? collapsed.kept : JOINTS.map((j, i) => i);
const ibm = new Float32Array(skinJoints.length * 16);
skinJoints.forEach((ji, i) => {
  const j = JOINTS[ji];
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.obj[0], -j.obj[1], -j.obj[2], 1], i * 16);
});
const skin = gb.addSkin({ name: `${P}_Rig`, joints: skinJoints.map((i) => jointNodes[i]), skeleton: jointNodes[J.J_root], inverseBindMatrices: gb.addAccessor(ibm, 'MAT4') });
const skinned = [];
const skinAttrs = (w0) => {
  const w = collapsed ? remapWeights(w0, collapsed.map) : w0;
  return { JOINTS_0: { array: w.joints, type: 'VEC4' }, WEIGHTS_0: { array: w.weights, type: 'VEC4', normalized: true } };
};

const bw = bodyWeights(body);
// (no normal map on the far tier: no tangents)
const bodyPrim = gb.primitive({ position: body.position, normal: body.normal, tangent: FAR ? null : body.tangent, uv: body.uv, indices: body.indices, material: mBody, extraAttributes: skinAttrs(bw) });
skinned.push(gb.addNode({ name: 'Body', mesh: gb.addMesh('Body', [bodyPrim]), skin }));

// ---------------------------------------------------------------- mouth & gill interiors
log('interiors');
const mInterior = tier.interior ? gb.addMaterial({
  name: `${P}_Interior`,
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.3 },
  doubleSided: true,
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatRoughnessFactor: 0.08 } },
  extras: { mahaze: { role: 'interior' } },
}) : null;
const interiorParts = tier.interior ? (() => { const mouth = buildMouth(body); const gills = buildGills(body); return [mouth.cavity, mouth.teeth, gills]; })() : [];
for (const part of interiorParts) {
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
const defs = finDefinitions();
const atlas = paintFinAtlas(defs, log);
// the atlas is painted at full size; the distance tiers carry it downsampled
const finAtlasDown = (ch, data) => { let w = atlas.size, h = atlas.size; for (let i = 0; i < tier.finDown; i++) ({ w, h, data } = downsample2(w, h, ch, data)); return { w, h, data }; };
// one map for the fins and the eyes: the iris in the atlas's free corner; the hero's fins add their relief and pigments
const col = insetIris(finAtlasDown(4, atlas.color), paintIris(tier.iris), ATLAS);
const tAtlas = gb.addTexture(image(gb, 'fin_eye_basecolor_alpha', col.w, col.h, 4, col.data, 'png'), sClamp, 'fin_eye_basecolor_alpha');
let finHero = null;
if (HERO) {
  const fm = finHeroMaps([atlas], atlas.size * atlas.size);
  finHero = {
    relief: gb.addTexture(image(gb, 'fin_relief_ray_coverage', atlas.size, atlas.size, 4, fm.relief, 'png'), sClamp, 'fin_relief_xy_ray_coverage'),
    pigment: gb.addTexture(image(gb, 'fin_melanin_iridophores', atlas.size, atlas.size, 4, fm.pigment, 'png'), sClamp, 'fin_melanin_iridophores'),
  };
}
const mFin = gb.addMaterial({
  name: `${P}_Fin`,
  pbrMetallicRoughness: { baseColorTexture: { index: tAtlas }, metallicFactor: 0, roughnessFactor: 0.38 },
  alphaMode: tier.finMask ? 'MASK' : 'BLEND',
  ...(tier.finMask ? { alphaCutoff: 0.5 } : {}),
  doubleSided: true,
  extensions: { KHR_materials_ior: { ior: 1.36 } },
  extras: { mahaze: { role: 'fin', ...(finHero ?? {}) } },
});
const eyeExtras = { role: 'eye', radiusMM: EYE.radius, pupilAngle: PUPIL_ANGLE, irisAngle: IRIS_ANGLE, corneaBulge: CORNEA_BULGE, ...(SPECIES.eye || {}), irisRect: irisRectUV(ATLAS) };
// the far tier's eyes share the fins' material (the iris is opaque in the atlas)
const mEye = FAR ? mFin : gb.addMaterial({
  name: `${P}_Eye`,
  pbrMetallicRoughness: { baseColorTexture: { index: tAtlas }, metallicFactor: 0, roughnessFactor: 0.4 },
  extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.03 }, KHR_materials_ior: { ior: 1.376 } },
  extras: { mahaze: eyeExtras },
});
const eye = buildEyeMesh(tier.eyeNT, tier.eyeNP);
eye.uv = eyeUvToAtlas(eye.uv, ATLAS);
const meshEye = gb.addMesh('Eye', [gb.primitive({ ...eye, material: mEye })]);
for (const [side, name, jn] of [[1, 'Eye_L', 'J_eyeL'], [-1, 'Eye_R', 'J_eyeR']]) {
  const tr = eyeTransform(side);
  const node = gb.addNode({ name, mesh: meshEye, rotation: tr.rotation, ...(tr.offset ? { translation: tr.offset } : {}) });
  gb.json.nodes[jointNodes[J[jn]]].children.push(node);
}

// ---------------------------------------------------------------- fins
log('fins');
const finNodes = {};
let contactFishY = botY(SPECIES.pelvicBaseS) - 0.2; // lowest point of the pelvic sucker rim (the fish rests on it)
for (const def of defs) {
  const SUB = tier.finSub, NT = def.name === 'Fin_Caudal' ? tier.finNTCaudal : tier.finNT;
  const m = buildFinMesh(def, SUB, NT);
  if (def.type === 'pelvic') { contactFishY = Infinity; for (let i = 1; i < m.fish.length; i += 3) contactFishY = Math.min(contactFishY, m.fish[i]); }
  const w = finWeights(def.name, m.fish, m.rayT, m.baseS);
  const names = FIN_TARGETS[def.name];
  const targets = buildFinTargets(def, SUB, NT, names);
  // (tangents only for the hero's fin shader: the glTF fin material has no normal map)
  const prim = gb.primitive({ ...m, ...(HERO ? {} : { tangent: null }), material: mFin, extraAttributes: skinAttrs(w), targets });
  const mesh = gb.addMesh(def.name, [prim], { targetNames: names });
  gb.json.meshes[mesh].weights = names.map(() => 0);
  finNodes[def.name] = gb.addNode({ name: def.name, mesh, skin, extras: { mahaze: { fin: def.name } } });
  skinned.push(finNodes[def.name]);
}

// ---------------------------------------------------------------- animations
// (the game poses the fish procedurally; the clips serve the encyclopedia's preview, which never shows the far tier)
if (!FAR) {
  log('animations');
  for (const clip of buildClips()) {
    const channels = clip.channels.map((c) => ({ node: jointNodes[c.joint], path: c.path, times: c.times, values: c.values }));
    for (const wch of clip.weights) channels.push({ node: finNodes[wch.mesh], path: 'weights', times: wch.times, values: wch.values });
    gb.addAnimation({ name: clip.name, channels });
    log(`  ${clip.name}: ${clip.duration.toFixed(3)}s, ${channels.length} channels`);
  }
}

// ---------------------------------------------------------------- scene
const rootNode = gb.addNode({
  name: SPECIES.rootName,
  children: [jointNodes[J.J_root]],
  extras: {
    species: SPECIES.scientific,
    commonName: SPECIES.commonName,
    variant: SPECIES.variant,
    totalLength_mm: TL,
    standardLength_mm: SL,
    units: 'metres (+Y dorsal, +Z anterior)',
    animations: SPECIES.animations,
    // rig axes (object space, sign folded in) for procedural animation with src/fish/pose.js
    mahazeRig: { axes: AXES, contactY: toObject([SPECIES.pelvicBaseS, contactFishY, 0])[1], tailContactY: toObject(SPECIES.tailContact)[1] },
    ...(SPECIES.viewer ? { viewer: SPECIES.viewer } : {}),
  },
});
// skinned meshes sit at the scene root (their node transforms are ignored; joints drive them)
gb.addScene(P, [rootNode, ...skinned]);
gb.json.asset.copyright = 'Procedurally generated model (no photographic textures).';

const glb = gb.toBuffer();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, glb);
log(`wrote ${path.relative(root, outFile)} (${(glb.length / 1e6).toFixed(2)} MB), body ${body.stats.vertices} verts / ${body.stats.triangles} tris`);
