#!/usr/bin/env node
// Builds the six hand nets (タモ網) as GLB files with LODs:
//   node tools/models/nets/build.mjs [--net <id>|all] [--tier hero|lod1|lod2|all] [--dump-textures <dir>]
// Output: src/assets/models/nets/<id>.<tier>.glb and src/assets/models/nets/manifest.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { GLBBuilder } from '../../lib/glb.mjs';
import { encodePNG } from '../../lib/png.mjs';
import { v3, m4, smooth } from './geom.mjs';
import { BAG_TARGETS } from './bag.mjs';
import { NETS } from './nets.mjs';
import * as TX from './textures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = path.join(root, 'src', 'assets', 'models', 'nets');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const netSel = arg('--net', 'all');
const tierSel = arg('--tier', 'all');
const dumpDir = arg('--dump-textures', null);

const TIERS = {
  // hero: first person / inspection; lod1: a few metres; lod2: across the flat
  hero: { wireSegs: 12, hoopN: 180, lathe: 32, latheSmall: 16, steps: 14, bagNU: 96, bagNV: 36, hemSegs: 12, detail: 0, tex: 1 },
  lod1: { wireSegs: 7, hoopN: 96, lathe: 16, latheSmall: 10, steps: 8, bagNU: 48, bagNV: 18, hemSegs: 8, detail: 1, tex: 0.5 },
  lod2: { wireSegs: 5, hoopN: 56, lathe: 10, latheSmall: 6, steps: 6, bagNU: 24, bagNV: 10, hemSegs: 6, detail: 2, tex: 0.25 },
};

// ---------------------------------------------------------------- materials
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** baseColorFactor that turns a texture of mean sRGB `base` into the target sRGB colour */
const factor = (srgb, base) => [...srgb.map((c) => Math.min(1, lin(c) / lin(base))), 1];

// texture sets: generator, hero size, mean albedo (sRGB) of the generated texture
const TEXSETS = {
  brushed: { fn: TX.brushedMetal, size: 512, base: 0.8 },
  powder: { fn: TX.powderCoat, size: 512, base: 0.9 },
  carbon: { fn: TX.carbonTwill, size: 1024, base: 1 },
  wood: { fn: TX.beechWood, size: 1024, base: 1 },
  eva: { fn: TX.evaFoam, size: 512, base: 0.86 },
  knurl: { fn: TX.rubberKnurl, size: 512, base: 0.92 },
  plastic: { fn: TX.plasticGrain, size: 256, base: 0.9 },
  canvas: { fn: TX.canvasDuck, size: 1024, base: 0.86 },
  tape: { fn: TX.tapeTwill, size: 512, base: 0.92 },
  cord: { fn: TX.twistedCord, size: 512, base: 0.92 },
  raschel: { fn: TX.raschelNet, size: 1024, base: 0.9, alpha: true },
  knotted: { fn: TX.knottedNet, size: 1024, base: 0.9, alpha: true },
  woven: { fn: TX.wovenMesh, size: 1024, base: 0.93, alpha: true },
  rubbernet: { fn: TX.rubberNet, size: 1024, base: 0.9, alpha: true },
};

// porosity: how much water soaks in and darkens it (0 metal .. 1 cotton); see netMaterials.ts
const MATS = {
  stainless: { tex: 'brushed', color: [0.79, 0.8, 0.82], rough: 1, metal: 1, role: 'metal', porosity: 0 },
  stainless_polished: { tex: 'brushed', color: [0.8, 0.81, 0.82], rough: 0.55, metal: 1, role: 'metal', porosity: 0 },
  zinc: { tex: 'brushed', color: [0.72, 0.73, 0.7], rough: 1, metal: 1, role: 'metal', porosity: 0 },
  alu_natural: { tex: 'brushed', color: [0.82, 0.83, 0.84], rough: 0.95, metal: 1, role: 'metal', porosity: 0 },
  alu_silver: { tex: 'brushed', color: [0.76, 0.77, 0.79], rough: 1, metal: 1, role: 'metal', porosity: 0 },
  alu_olive: { tex: 'brushed', color: [0.36, 0.4, 0.27], rough: 1, metal: 1, role: 'metal', porosity: 0 },
  alu_gunmetal: { tex: 'brushed', color: [0.3, 0.31, 0.33], rough: 0.9, metal: 1, role: 'metal', porosity: 0 },
  alu_champagne: { tex: 'brushed', color: [0.87, 0.77, 0.58], rough: 0.8, metal: 1, role: 'metal', porosity: 0 },
  steel_black: { tex: 'powder', color: [0.075, 0.078, 0.082], rough: 1, metal: 0, role: 'coating', porosity: 0.05 },
  beech: { tex: 'wood', color: [1, 1, 1], rough: 1, metal: 0, role: 'wood', porosity: 0.55, raw: true },
  eva_black: { tex: 'eva', color: [0.09, 0.09, 0.09], rough: 1, metal: 0, role: 'foam', porosity: 0.35 },
  eva_gray: { tex: 'eva', color: [0.21, 0.215, 0.22], rough: 1, metal: 0, role: 'foam', porosity: 0.35 },
  rubber_black: { tex: 'knurl', color: [0.07, 0.07, 0.07], rough: 1, metal: 0, role: 'rubber', porosity: 0.05 },
  vinyl_black: { tex: 'plastic', color: [0.055, 0.055, 0.055], rough: 1, metal: 0, role: 'rubber', porosity: 0.05 },
  plastic_black: { tex: 'plastic', color: [0.05, 0.05, 0.052], rough: 0.85, metal: 0, role: 'plastic', porosity: 0 },
  carbon: { tex: 'carbon', color: [1, 1, 1], rough: 1, metal: 0, role: 'carbon', porosity: 0, raw: true, clearcoat: [1, 0.035] },
  canvas: { tex: 'canvas', color: [0.76, 0.69, 0.55], rough: 1, metal: 0, role: 'fabric', porosity: 1, sheen: [[0.55, 0.5, 0.42], 0.55] },
  thread: { tex: 'tape', color: [0.8, 0.76, 0.66], rough: 1, metal: 0, role: 'fabric', porosity: 1 },
  tape_white: { tex: 'tape', color: [0.84, 0.84, 0.8], rough: 1, metal: 0, role: 'fabric', porosity: 0.8, sheen: [[0.7, 0.7, 0.7], 0.5] },
  tape_black: { tex: 'tape', color: [0.07, 0.07, 0.072], rough: 1, metal: 0, role: 'fabric', porosity: 0.8, sheen: [[0.25, 0.25, 0.25], 0.5] },
  cord_navy: { tex: 'cord', color: [0.12, 0.15, 0.27], rough: 1, metal: 0, role: 'fabric', porosity: 0.9, sheen: [[0.3, 0.32, 0.4], 0.6] },
  rope_green: { tex: 'cord', color: [0.25, 0.3, 0.19], rough: 1, metal: 0, role: 'fabric', porosity: 0.6, sheen: [[0.35, 0.38, 0.3], 0.6] },
  twine_green: { tex: 'cord', color: [0.22, 0.27, 0.16], rough: 1, metal: 0, role: 'fabric', porosity: 0.6 },
  rubber_bead: { tex: 'plastic', color: [0.085, 0.08, 0.075], rough: 0.7, metal: 0, role: 'rubber', porosity: 0, clearcoat: [0.4, 0.3] },
  net_white: { tex: 'raschel', color: [0.8, 0.81, 0.78], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.8, 0.8, 0.8], 0.45] },
  net_green: { tex: 'raschel', color: [0.12, 0.2, 0.14], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.16, 0.22, 0.17], 0.5] },
  net_gray: { tex: 'raschel', color: [0.66, 0.68, 0.66], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.6, 0.6, 0.6], 0.45] },
  net_knotted: { tex: 'knotted', color: [0.27, 0.31, 0.19], rough: 1, metal: 0, role: 'net', porosity: 0.7, net: true, sheen: [[0.35, 0.4, 0.3], 0.5] },
  net_woven: { tex: 'woven', color: [0.93, 0.94, 0.93], rough: 1, metal: 0, role: 'net', porosity: 0.3, net: true, blend: true },
  net_rubber: { tex: 'rubbernet', color: [0.12, 0.11, 0.1], rough: 1, metal: 0, role: 'net', porosity: 0.05, net: true, clearcoat: [0.5, 0.25] },
};

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${m}`);

function toJPEG(w, h, ch, data, quality) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = data[i * ch]; rgba[i * 4 + 1] = data[i * ch + 1]; rgba[i * 4 + 2] = data[i * ch + 2]; rgba[i * 4 + 3] = 255; }
  return jpeg.encode({ data: rgba, width: w, height: h }, quality).data;
}

const texCache = new Map();
function texSet(key, scale) {
  const def = TEXSETS[key];
  const size = Math.max(64, Math.round(def.size * scale));
  const ck = `${key}@${size}`;
  if (!texCache.has(ck)) texCache.set(ck, def.fn(size));
  return texCache.get(ck);
}

// ---------------------------------------------------------------- build one net / tier
function buildNet(net, tierName) {
  const Q = TIERS[tierName];
  const d = net.build(Q);
  const gb = new GLBBuilder('higata-net-builder');
  gb.json.asset.copyright = 'Procedurally generated (geometry and textures), 干潟図鑑.';
  const REPEAT = 10497, LINEAR = 9729, MIPMAP = 9987;
  const sampler = gb.addSampler({ magFilter: LINEAR, minFilter: MIPMAP, wrapS: REPEAT, wrapT: REPEAT });

  // textures and materials on demand
  const texIdx = new Map();
  const image = (name, w, h, ch, data, fmt) => {
    const buf = fmt === 'jpeg' ? toJPEG(w, h, ch, data, 90) : encodePNG(w, h, ch, data);
    if (dumpDir) { fs.mkdirSync(dumpDir, { recursive: true }); fs.writeFileSync(path.join(dumpDir, `${name}.${fmt === 'jpeg' ? 'jpg' : 'png'}`), buf); }
    return gb.addImage(buf, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', name);
  };
  const textures = (key) => {
    if (texIdx.has(key)) return texIdx.get(key);
    const T = texSet(key, Q.tex);
    const sfx = `${key}_${T.w}`;
    const r = {
      color: gb.addTexture(image(`${sfx}_basecolor`, T.w, T.h, T.ch, T.albedo, T.alpha ? 'png' : 'jpeg'), sampler, `${sfx}_basecolor`),
      normal: gb.addTexture(image(`${sfx}_normal`, T.w, T.h, 3, T.normal, 'png'), sampler, `${sfx}_normal`),
      orm: gb.addTexture(image(`${sfx}_orm`, T.w, T.h, 3, T.orm, 'png'), sampler, `${sfx}_orm`),
    };
    texIdx.set(key, r);
    return r;
  };
  const matIdx = new Map();
  const material = (key) => {
    if (matIdx.has(key)) return matIdx.get(key);
    const M = MATS[key];
    if (!M) throw new Error(`unknown material ${key}`);
    const T = textures(M.tex);
    const base = TEXSETS[M.tex].base;
    const def = {
      name: key,
      pbrMetallicRoughness: {
        baseColorTexture: { index: T.color },
        baseColorFactor: M.raw ? [1, 1, 1, 1] : factor(M.color, base),
        metallicRoughnessTexture: { index: T.orm },
        metallicFactor: M.metal,
        roughnessFactor: M.rough,
      },
      normalTexture: { index: T.normal, scale: 1 },
      occlusionTexture: { index: T.orm, strength: 1 },
      extras: { higataNet: { role: M.role, porosity: M.porosity, texture: M.tex, tileMetres: texSet(M.tex, Q.tex).tile } },
    };
    if (M.net) {
      // blended, not alpha-tested: up close the threads are crisp (alpha is 0 or 1 at full resolution)
      // and further away the mip chain averages them into the real see-through haze of a mesh bag,
      // which an alpha test would cut away entirely
      def.doubleSided = true;
      def.alphaMode = 'BLEND';
    }
    const ext = {};
    if (M.clearcoat) { ext.KHR_materials_clearcoat = { clearcoatFactor: M.clearcoat[0], clearcoatRoughnessFactor: M.clearcoat[1] }; gb.useExtension('KHR_materials_clearcoat'); }
    if (M.sheen && tierName !== 'lod2') { ext.KHR_materials_sheen = { sheenColorFactor: M.sheen[0], sheenRoughnessFactor: M.sheen[1] }; gb.useExtension('KHR_materials_sheen'); }
    if (Object.keys(ext).length) def.extensions = ext;
    const i = gb.addMaterial(def);
    matIdx.set(key, i);
    return i;
  };

  // merge parts by material into primitives
  const stats = { triangles: 0, vertices: 0 };
  const massParts = [];
  const prim = (mesh, matKey, extra = {}) => {
    const a = mesh.arrays();
    stats.triangles += mesh.triangleCount; stats.vertices += mesh.vertexCount;
    const n = mesh.vertexCount;
    const ao = new Uint8Array(n * 4), dirt = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const g = Math.round(Math.min(1, Math.max(0, a.ao[i])) * 255);
      ao[i * 4] = g; ao[i * 4 + 1] = g; ao[i * 4 + 2] = g; ao[i * 4 + 3] = 255;
      dirt[i] = Math.round(Math.min(1, Math.max(0, a.dirt[i])) * 255);
    }
    return gb.primitive({
      position: a.position, normal: a.normal, uv: a.uv, uvFloat: true, indices: a.indices, material: material(matKey),
      extraAttributes: { COLOR_0: { array: ao, type: 'VEC4', normalized: true }, _DIRT: { array: dirt, type: 'SCALAR', normalized: true } },
      ...extra,
    });
  };
  const meshFromParts = (name, parts, toRoot, shadeFn) => {
    const byMat = new Map();
    for (const p of parts) {
      shadeFn(p.mesh);
      if (!byMat.has(p.material)) byMat.set(p.material, []);
      byMat.get(p.material).push(p.mesh);
      massParts.push({ kg: p.kg, c: m4.point(toRoot, p.mesh.centroid()) });
    }
    const prims = [];
    for (const [mat, list] of byMat) {
      const merged = list[0];
      for (let k = 1; k < list.length; k++) merged.append(list[k]);
      prims.push(prim(merged, mat));
    }
    return gb.addMesh(name, prims);
  };

  // handle sections (chained along +Z)
  const sectionNodes = [];
  let prevZ = 0;
  for (const s of d.handle) {
    const toRoot = m4.translate(0, 0, s.z);
    const mesh = meshFromParts(s.name, s.parts, toRoot, (m) => m.shade((p) => ({ dirt: 0.04 + 0.5 * smooth(d.tipZ - 0.3, d.tipZ, p[2] + s.z) + 0.15 * smooth(-0.04, -0.12, p[2] + s.z) })));
    const node = gb.addNode({ name: s.name, mesh, translation: [0, 0, s.z - prevZ], children: [] });
    if (sectionNodes.length) gb.json.nodes[sectionNodes[sectionNodes.length - 1]].children.push(node);
    sectionNodes.push(node);
    prevZ = s.z;
  }
  const lastZ = d.handle[d.handle.length - 1].z;
  // frame pivot + frame + bag + mouth
  const q = d.pivotRot;
  const rotM = (() => {
    const [x, y, z, w] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
  })();
  const frameToRoot = m4.mul(m4.translate(0, 0, d.tipZ), rotM);
  const frameMesh = meshFromParts('Frame', d.frame, frameToRoot, (m) => m.shade((p, n) => ({ dirt: 0.2 + 0.5 * smooth(0.2, -0.9, n[1]) + 0.3 * smooth(0.07, 0.0, p[2]) })));
  const frameNode = gb.addNode({ name: 'Frame', mesh: frameMesh });
  const bagPrims = d.bag.prims.map((p) => {
    massParts.push({ kg: p.kg, c: m4.point(frameToRoot, p.mesh.centroid()) });
    return prim(p.mesh, p.material, { targets: p.targets.map((t) => t.dpos), normalTargets: p.targets.map((t) => t.dnrm) });
  });
  const bagMesh = gb.addMesh('Bag', bagPrims, { targetNames: BAG_TARGETS });
  gb.json.meshes[bagMesh].weights = BAG_TARGETS.map(() => 0);
  const bagNode = gb.addNode({ name: 'Bag', mesh: bagMesh });
  const bi = d.bagInfo;
  const mouthNode = gb.addNode({
    name: 'Mouth', translation: d.mouth,
    extras: { higataNet: { note: 'hoop centre; local +Y is the way the opening faces, the bag hangs toward -Y', meanRadius_m: +bi.Rmean.toFixed(4), bagBottom_m: bi.bottom.map((v) => +v.toFixed(4)) } },
  });
  const pivot = gb.addNode({ name: 'Frame_Pivot', translation: [0, 0, d.tipZ - lastZ], rotation: q, children: [frameNode, bagNode, mouthNode] });
  gb.json.nodes[sectionNodes[sectionNodes.length - 1]].children.push(pivot);
  const gripMain = gb.addNode({ name: 'Grip_Main', translation: d.grips.main, extras: { higataNet: { note: 'dominant hand; the shaft runs along local +Z' } } });
  const gripSup = gb.addNode({ name: 'Grip_Support', translation: d.grips.support, extras: { higataNet: { note: 'second hand' } } });

  // mass and balance
  const M = massParts.reduce((a, p) => a + p.kg, 0);
  const com = massParts.reduce((a, p) => v3.add(a, v3.mul(p.c, p.kg / M)), [0, 0, 0]);
  // overall extents in root space
  const mouthRoot = m4.point(frameToRoot, d.mouth);
  let zFar = -Infinity, zNear = Infinity;
  for (const p of d.frame) for (let i = 0; i < p.mesh.pos.length; i += 3) zFar = Math.max(zFar, m4.point(frameToRoot, p.mesh.pos.slice(i, i + 3))[2]);
  for (const s of d.handle) for (const p of s.parts) for (let i = 2; i < p.mesh.pos.length; i += 3) zNear = Math.min(zNear, p.mesh.pos[i] + s.z);

  // morph-only clips (compose with any hand animation)
  const clip = (name, keys) => {
    const times = new Float32Array(keys.map((k) => k[0]));
    const values = new Float32Array(keys.flatMap((k) => k[1]));
    gb.addAnimation({ name, channels: [{ node: bagNode, path: 'weights', times, values }] });
  };
  // weights order: Stream, Invert, Trail, Wet
  clip('Bag_Scoop', [[0, [0, 0, 0, 0]], [0.3, [0, 0, 0.85, 0]], [0.55, [0.45, 0, 0.55, 0]], [0.8, [1, 0, 0.05, 0.1]], [1.05, [0.15, 0.2, 0, 0.35]], [1.3, [0.05, 0, 0, 0.3]], [1.6, [0, 0, 0, 0.25]]]);
  clip('Bag_Dip', [[0, [0, 0, 0, 0]], [0.25, [0, 0.9, 0, 0]], [0.6, [0, 1, 0.1, 0.1]], [0.9, [0.85, 0, 0, 0.4]], [1.2, [0.35, 0, 0, 0.8]], [1.6, [0, 0, 0, 1]]]);
  {
    const keys = [];
    for (let k = 0; k <= 18; k++) {
      const t = k * 0.05, s = Math.sin(t * Math.PI * 2 * 4.2) * Math.exp(-t * 2.2);
      keys.push([t, [Math.max(0, s), Math.max(0, -s) * 0.7, 0, 1]]);
    }
    clip('Bag_Shake', keys);
  }
  if (d.foldAxis) {
    const ax = d.foldAxis;
    const times = new Float32Array([0, 0.25, 0.8]);
    const qs = [0, 0.35, Math.PI * 0.98].flatMap((a) => [ax[0] * Math.sin(a / 2), ax[1] * Math.sin(a / 2), ax[2] * Math.sin(a / 2), Math.cos(a / 2)]);
    gb.addAnimation({ name: 'Frame_Fold', channels: [{ node: pivot, path: 'rotation', times, values: new Float32Array(qs) }] });
  }

  const info = {
    id: net.id, ja: net.ja, en: net.en, use: net.use, tier: tierName, spec: net.spec, materialsJa: net.materials,
    units: 'metres', axes: '+Y up, +Z from the grip toward the hoop, +X right; origin = centre of the dominant-hand grip',
    mass_g: Math.round(M * 1000),
    balancePoint_m: +com[2].toFixed(3),
    overallLength_m: +(zFar - zNear).toFixed(3),
    buttZ_m: +zNear.toFixed(3), tipZ_m: +d.tipZ.toFixed(3),
    mouthCentre_m: mouthRoot.map((v) => +v.toFixed(4)),
    morphTargets: BAG_TARGETS,
    clips: ['Bag_Scoop', 'Bag_Dip', 'Bag_Shake', ...(d.foldAxis ? ['Frame_Fold'] : [])],
    nodes: { grip: 'Grip_Main', support: 'Grip_Support', pivot: 'Frame_Pivot', mouth: 'Mouth', bag: 'Bag', sections: d.handle.map((s) => s.name) },
    attributes: { COLOR_0: 'baked cavity / occlusion (multiplies base colour)', _DIRT: 'mud propensity 0..1 (see netMaterials.ts)' },
  };
  const rootNode = gb.addNode({ name: net.id, children: [sectionNodes[0], gripMain, gripSup], extras: { higataNet: info } });
  gb.addScene(net.id, [rootNode]);
  const glb = gb.toBuffer();
  return { glb, info, stats };
}

// ---------------------------------------------------------------- main
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { nets: {} };
const tiers = tierSel === 'all' ? Object.keys(TIERS) : [tierSel];
for (const net of NETS) {
  if (netSel !== 'all' && netSel !== net.id) continue;
  for (const tier of tiers) {
    const { glb, info, stats } = buildNet(net, tier);
    const file = `${net.id}.${tier}.glb`;
    fs.writeFileSync(path.join(outDir, file), glb);
    manifest.nets[net.id] = manifest.nets[net.id] || { ja: net.ja, en: net.en, use: net.use, spec: net.spec, tiers: {} };
    if (tier === 'hero') Object.assign(manifest.nets[net.id], { mass_g: info.mass_g, balancePoint_m: info.balancePoint_m, overallLength_m: info.overallLength_m });
    manifest.nets[net.id].tiers[tier] = { file, triangles: stats.triangles, vertices: stats.vertices, bytes: glb.length };
    log(`${file}: ${stats.triangles} tris, ${(glb.length / 1e6).toFixed(2)} MB, ${info.mass_g} g, balance ${info.balancePoint_m} m, length ${info.overallLength_m} m`);
  }
}
manifest.lodDistances_m = { hero: 0, lod1: 2.5, lod2: 9 };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
