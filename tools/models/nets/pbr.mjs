// Shared PBR texture sets and materials for the procedural tool models (nets, digging tools).
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { encodePNG } from '../../lib/png.mjs';
import * as TX from './textures.mjs';

// ---------------------------------------------------------------- materials
export const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** baseColorFactor that turns a texture of mean sRGB `base` into the target sRGB colour */
export const factor = (srgb, base) => [...srgb.map((c) => Math.min(1, lin(c) / lin(base))), 1];

// texture sets: generator, hero size, mean albedo (sRGB) of the generated texture
export const TEXSETS = {
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
export const MATS = {
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
  // binoculars
  armor_olive: { tex: 'plastic', color: [0.17, 0.2, 0.14], rough: 0.95, metal: 0, role: 'rubber', porosity: 0.05 },
  lens: { tex: 'plastic', color: [0.015, 0.02, 0.022], rough: 0.06, metal: 0, role: 'glass', porosity: 0, clearcoat: [1, 0.02], iridescence: 1 },
  // digging tools
  steel_bare: { tex: 'brushed', color: [0.6, 0.6, 0.59], rough: 1, metal: 1, role: 'metal', porosity: 0 },
  brass: { tex: 'brushed', color: [0.84, 0.66, 0.38], rough: 0.75, metal: 1, role: 'metal', porosity: 0 },
  wood_varnish: { tex: 'wood', color: [1, 1, 1], rough: 0.8, metal: 0, role: 'wood', porosity: 0.15, raw: true, clearcoat: [0.55, 0.25] },
  wood_red: { tex: 'wood', color: [0.48, 0.12, 0.08], rough: 0.85, metal: 0, role: 'wood', porosity: 0.15, clearcoat: [0.5, 0.3], baseOverride: 0.55 },
  pp_green: { tex: 'plastic', color: [0.14, 0.38, 0.22], rough: 0.85, metal: 0, role: 'plastic', porosity: 0 },
  tpr_gray: { tex: 'knurl', color: [0.2, 0.21, 0.22], rough: 1, metal: 0, role: 'rubber', porosity: 0.05 },
  engrave: { tex: 'plastic', color: [0.2, 0.2, 0.2], rough: 1, metal: 0.3, role: 'metal', porosity: 0 },
  net_white: { tex: 'raschel', color: [0.8, 0.81, 0.78], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.8, 0.8, 0.8], 0.45] },
  net_green: { tex: 'raschel', color: [0.12, 0.2, 0.14], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.16, 0.22, 0.17], 0.5] },
  net_gray: { tex: 'raschel', color: [0.66, 0.68, 0.66], rough: 1, metal: 0, role: 'net', porosity: 0.85, net: true, sheen: [[0.6, 0.6, 0.6], 0.45] },
  net_knotted: { tex: 'knotted', color: [0.27, 0.31, 0.19], rough: 1, metal: 0, role: 'net', porosity: 0.7, net: true, sheen: [[0.35, 0.4, 0.3], 0.5] },
  net_woven: { tex: 'woven', color: [0.93, 0.94, 0.93], rough: 1, metal: 0, role: 'net', porosity: 0.3, net: true, blend: true },
  net_rubber: { tex: 'rubbernet', color: [0.12, 0.11, 0.1], rough: 1, metal: 0, role: 'net', porosity: 0.05, net: true, clearcoat: [0.5, 0.25] },
};

export function toJPEG(w, h, ch, data, quality) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = data[i * ch]; rgba[i * 4 + 1] = data[i * ch + 1]; rgba[i * 4 + 2] = data[i * ch + 2]; rgba[i * 4 + 3] = 255; }
  return jpeg.encode({ data: rgba, width: w, height: h }, quality).data;
}

const texCache = new Map();
export function texSet(key, scale) {
  const def = TEXSETS[key];
  const size = Math.max(64, Math.round(def.size * scale));
  const ck = `${key}@${size}`;
  if (!texCache.has(ck)) texCache.set(ck, def.fn(size));
  return texCache.get(ck);
}

/**
 * Material / primitive factory for one GLB: textures and materials are added on first use.
 * prim(mesh, materialKey, extra) writes a primitive with float tiling UVs, baked occlusion in COLOR_0
 * and mud propensity in _DIRT.
 */
export function createMaterials(gb, { tierName, texScale, dumpDir = null, extrasKey = 'higataNet' }) {
  const Q = { tex: texScale };
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
    const base = M.baseOverride ?? TEXSETS[M.tex].base;
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
      extras: { [extrasKey]: { role: M.role, porosity: M.porosity, texture: M.tex, tileMetres: texSet(M.tex, Q.tex).tile } },
    };
    if (M.net) {
      // blended, not alpha-tested: up close the threads are crisp (alpha is 0 or 1 at full resolution)
      // and further away the mip chain averages them into the real see-through haze of a mesh bag,
      // which an alpha test would cut away entirely
      def.doubleSided = true;
      def.alphaMode = 'BLEND';
    }
    const ext = {};
    if (M.iridescence) { ext.KHR_materials_iridescence = { iridescenceFactor: M.iridescence, iridescenceIor: 1.8, iridescenceThicknessMinimum: 250, iridescenceThicknessMaximum: 420 }; gb.useExtension('KHR_materials_iridescence'); }
    if (M.clearcoat) { ext.KHR_materials_clearcoat = { clearcoatFactor: M.clearcoat[0], clearcoatRoughnessFactor: M.clearcoat[1] }; gb.useExtension('KHR_materials_clearcoat'); }
    if (M.sheen && tierName !== 'lod2') { ext.KHR_materials_sheen = { sheenColorFactor: M.sheen[0], sheenRoughnessFactor: M.sheen[1] }; gb.useExtension('KHR_materials_sheen'); }
    if (Object.keys(ext).length) def.extensions = ext;
    const i = gb.addMaterial(def);
    matIdx.set(key, i);
    return i;
  };

  // merge parts by material into primitives
  const stats = { triangles: 0, vertices: 0 };
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
  return { material, prim, stats };
}
