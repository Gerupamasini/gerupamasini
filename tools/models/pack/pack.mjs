// Packs one GLB for the game: images to KTX2 (KHR_texture_basisu), geometry to EXT_meshopt_compression.
// Everything else stays as it was, index for index: the materials, the extras (some name textures by their index,
// e.g. the gobies' pigmentTexture), the nodes, skins and animations.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { readGLB, writeGLB } from '../../lib/glb.mjs';
import { decodeImage, decodeKTX2, encodeKTX2, psnr } from './ktx2.mjs';
import { MIN_PSNR, PACK_SETTINGS } from './settings.mjs';

const COLOR_SLOTS = new Set(['baseColorTexture', 'emissiveTexture', 'sheenColorTexture', 'specularColorTexture', 'diffuseTexture', 'specularGlossinessTexture']);
const NORMAL_SLOTS = new Set(['normalTexture', 'clearcoatNormalTexture']);
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/**
 * How each image is used: 'normal', 'color' (sRGB) or 'data' (linear). Images that only the extras point at (the
 * custom hero materials' pigment, data and cap textures) go by their name.
 */
export function imageRoles(json) {
  const roles = new Map();
  const mark = (texIndex, role) => {
    const src = json.textures?.[texIndex]?.source;
    if (src === undefined) return;
    const prev = roles.get(src);
    // a normal map stays one; otherwise colour wins over data (the sRGB metric is the stricter on what shows)
    if (prev === 'normal' || (prev === 'color' && role === 'data')) return;
    roles.set(src, role);
  };
  const walk = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object' || k === 'extras') continue;
      if (k.endsWith('Texture') && typeof v.index === 'number') mark(v.index, NORMAL_SLOTS.has(k) ? 'normal' : COLOR_SLOTS.has(k) ? 'color' : 'data');
      else walk(v);
    }
  };
  for (const m of json.materials ?? []) walk(m);
  (json.images ?? []).forEach((im, i) => {
    if (roles.has(i)) return;
    const n = im.name ?? '';
    roles.set(i, /normal/i.test(n) ? 'normal' : /basecolor|albedo|colou?r|diffuse|iris/i.test(n) ? 'color' : 'data');
  });
  return roles;
}

/** For every buffer view: the accessors on it, and whether any of them is a primitive's index list. */
function viewUses(json) {
  const uses = new Map();
  const use = (bv) => {
    if (!uses.has(bv)) uses.set(bv, { accessors: [], index: false, triangles: true, sparse: false });
    return uses.get(bv);
  };
  (json.accessors ?? []).forEach((a, i) => {
    if (a.bufferView !== undefined) use(a.bufferView).accessors.push(i);
    if (a.sparse) {
      use(a.sparse.indices.bufferView).sparse = true;
      use(a.sparse.values.bufferView).sparse = true;
    }
  });
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      if (p.indices === undefined) continue;
      const bv = json.accessors[p.indices].bufferView;
      if (bv === undefined) continue;
      const u = use(bv);
      u.index = true;
      if ((p.mode ?? 4) !== 4) u.triangles = false;
    }
  }
  return uses;
}

/** The meshopt encoding of a buffer view, or null where it cannot be encoded on its own (it is then kept raw). */
function meshoptView(json, bv, use, bytes) {
  if (!use || use.sparse || !use.accessors.length) return null;
  if (use.index) {
    if (use.accessors.length !== 1) return null;
    const a = json.accessors[use.accessors[0]];
    const size = COMPONENT_BYTES[a.componentType];
    if ((size !== 2 && size !== 4) || (a.byteOffset ?? 0) !== 0 || bv.byteLength !== a.count * size) return null;
    const mode = use.triangles && a.count % 3 === 0 ? 'TRIANGLES' : 'INDICES';
    return { mode, count: a.count, stride: size, data: MeshoptEncoder.encodeGltfBuffer(bytes, a.count, size, mode) };
  }
  let stride = bv.byteStride;
  if (!stride) {
    // tightly packed: one element size for every accessor on the view
    const sizes = new Set(use.accessors.map((i) => COMPONENT_BYTES[json.accessors[i].componentType] * COMPONENTS[json.accessors[i].type]));
    if (sizes.size !== 1) return null;
    stride = [...sizes][0];
  }
  if (stride % 4 !== 0 || stride > 256 || bv.byteLength % stride !== 0) return null;
  const count = bv.byteLength / stride;
  return { mode: 'ATTRIBUTES', count, stride, data: MeshoptEncoder.encodeGltfBuffer(bytes, count, stride, 'ATTRIBUTES') };
}

/** One image to KTX2, through the cache (keyed by the image's bytes, its role and the settings). */
async function packImage(src, role, cacheDir) {
  const key = crypto.createHash('sha256').update(PACK_SETTINGS).update(role).update(src).digest('hex');
  const file = cacheDir && path.join(cacheDir, `${key}.ktx2`);
  const meta = cacheDir && path.join(cacheDir, `${key}.json`);
  if (file && fs.existsSync(file) && fs.existsSync(meta)) return { ktx2: fs.readFileSync(file), ...JSON.parse(fs.readFileSync(meta, 'utf8')) };
  const ktx2 = Buffer.from(await encodeKTX2(src, role));
  const ref = decodeImage(src);
  const got = await decodeKTX2(ktx2);
  if (got.width !== ref.width || got.height !== ref.height) throw new Error(`KTX2 size ${got.width}x${got.height} != ${ref.width}x${ref.height}`);
  const alpha = ref.data.some((v, i) => (i & 3) === 3 && v !== 255);
  const m = { width: ref.width, height: ref.height, levels: got.levels, psnr: +psnr(ref.data, got.data, [0, 1, 2]).toFixed(2), psnrAlpha: alpha ? +psnr(ref.data, got.data, [3]).toFixed(2) : null };
  if (file) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, ktx2);
    fs.writeFileSync(meta, JSON.stringify(m));
  }
  return { ktx2, ...m };
}

/** Packs a GLB. Returns the packed file and what was done to it. */
export async function packModel(buf, { cacheDir = null } = {}) {
  const { json, bin } = readGLB(buf);
  if ((json.buffers?.length ?? 0) > 1 || json.buffers?.[0]?.uri !== undefined) throw new Error('only single-buffer GLBs are packed');
  if (json.extensionsUsed?.some((e) => e === 'KHR_texture_basisu' || e === 'EXT_meshopt_compression')) throw new Error('already packed');
  await MeshoptEncoder.ready;
  const roles = imageRoles(json);
  const imageOfView = new Map((json.images ?? []).map((im, i) => [im.bufferView, i]).filter(([bv]) => bv !== undefined));
  const uses = viewUses(json);

  const parts = [];
  let length = 0;
  const append = (bytes) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); length += pad; }
    const at = length;
    parts.push(bytes);
    length += bytes.length;
    return at;
  };
  let fallback = 0;
  const stats = { images: 0, minPsnr: 99, minPsnrImage: null, imageBytesIn: 0, imageBytesOut: 0, views: 0, meshoptViews: 0, geometryBytesIn: 0, geometryBytesOut: 0 };

  const converted = new Set();
  const views = [];
  for (let i = 0; i < (json.bufferViews ?? []).length; i++) {
    const bv = json.bufferViews[i];
    const bytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    const img = imageOfView.get(i);
    if (img !== undefined) {
      const role = roles.get(img);
      const r = await packImage(bytes, role, cacheDir);
      const name = json.images[img].name ?? `image ${img}`;
      for (const [p, ch] of [[r.psnr, 'rgb'], [r.psnrAlpha, 'alpha']]) {
        if (p === null) continue;
        if (p < MIN_PSNR) throw new Error(`${name} (${role}): ${ch} PSNR ${p} dB < ${MIN_PSNR}`);
        if (p < stats.minPsnr) { stats.minPsnr = p; stats.minPsnrImage = `${name} ${ch}`; }
      }
      stats.images++;
      converted.add(img);
      stats.imageBytesIn += bytes.length;
      stats.imageBytesOut += r.ktx2.length;
      views.push({ ...(bv.name ? { name: bv.name } : {}), buffer: 0, byteOffset: append(r.ktx2), byteLength: r.ktx2.length });
      continue;
    }
    stats.views++;
    stats.geometryBytesIn += bytes.length;
    const enc = meshoptView(json, bv, uses.get(i), bytes);
    if (enc && enc.data.length < bytes.length * 0.95) {
      fallback += (4 - (fallback % 4)) % 4;
      const out = { ...bv, buffer: 1, byteOffset: fallback, byteLength: bv.byteLength };
      out.extensions = { ...bv.extensions, EXT_meshopt_compression: { buffer: 0, byteOffset: append(Buffer.from(enc.data)), byteLength: enc.data.length, byteStride: enc.stride, mode: enc.mode, count: enc.count } };
      fallback += bv.byteLength;
      stats.meshoptViews++;
      stats.geometryBytesOut += enc.data.length;
      views.push(out);
    } else {
      stats.geometryBytesOut += bytes.length;
      views.push({ ...bv, buffer: 0, byteOffset: append(bytes) });
    }
  }
  if (json.bufferViews) json.bufferViews = views;

  const require = (ext) => {
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), ext])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), ext])];
  };
  if (stats.images) {
    for (const i of converted) json.images[i].mimeType = 'image/ktx2';
    for (const t of json.textures ?? []) {
      if (!converted.has(t.source)) continue;
      t.extensions = { ...t.extensions, KHR_texture_basisu: { source: t.source } };
      delete t.source;
    }
    require('KHR_texture_basisu');
  }
  if (stats.meshoptViews) {
    json.buffers = [{ byteLength: 0 }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }];
    require('EXT_meshopt_compression');
  }
  const glb = writeGLB(json, Buffer.concat(parts));
  return { glb, stats: { ...stats, bytesIn: buf.length, bytesOut: glb.length } };
}
