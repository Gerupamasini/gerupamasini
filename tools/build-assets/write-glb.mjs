// Assemble the Yamame GLB with glTF-Transform (Node only; no Blender). Structure: spec07 §7.3.4.
import { Document, NodeIO, VertexLayout } from '@gltf-transform/core';
import { KHRMaterialsClearcoat, KHRMaterialsIridescence, KHRMaterialsIOR, KHRMaterialsSpecular, KHRTextureTransform } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { encodePng } from './png.mjs';
import { boneLocalTranslations, inverseBindMatrices } from './rig.mjs';

// shortest-arc quaternion taking +Z to dir (xyzw)
function quatFromZ(dir) {
  const l = Math.hypot(...dir); const [x, y, z] = dir.map((v) => v / l);
  if (z < -0.999999) return [0, 1, 0, 0];
  const w = 1 + z; const q = [-y, x, 0, w]; const n = Math.hypot(...q); return q.map((v) => v / n);
}

export async function writeGLB({ file, body, teeth = null, gills = null, fins, eyes, rig, textures, params, meta = {}, weights, lodBodies = [], lodFins = [], lodEyes = [], morphs = [] }) {
  const doc = new Document();
  const clearcoatExt = doc.createExtension(KHRMaterialsClearcoat), iridExt = doc.createExtension(KHRMaterialsIridescence), iorExt = doc.createExtension(KHRMaterialsIOR), specExt = doc.createExtension(KHRMaterialsSpecular);
  const buffer = doc.createBuffer('main');
  const scene = doc.createScene('Yamame');

  // ---- nodes (skeleton) ----
  const rootNode = doc.createNode('Yamame');
  rootNode.setExtras({ type: 'Yamame', version: 1, stage: params.stage || 'parr', sl_m: params.sl_m.v, groups: { Body: ['Body_LOD0'], Fins: ['Fins_LOD0'], Eyes: ['Eye_L', 'Eye_R'], Skeleton: ['fish_root'] }, ...meta });
  scene.addChild(rootNode);
  const local = boneLocalTranslations(rig);
  const boneNodes = rig.bones.map((b, i) => doc.createNode(b.name).setTranslation(local[i]));
  rig.bones.forEach((b, i) => { if (b.parent) boneNodes[rig.index.get(b.parent)].addChild(boneNodes[i]); });
  rootNode.addChild(boneNodes[0]);

  const skin = doc.createSkin('YamameSkin').setSkeleton(boneNodes[0]);
  boneNodes.forEach((n) => skin.addJoint(n));
  skin.setInverseBindMatrices(doc.createAccessor('IBM', buffer).setType('MAT4').setArray(inverseBindMatrices(rig)));

  // ---- animation clips (05 §5.7.1): only on bones the procedural pass does NOT own (fin ray-group bones), so there is one owner per bone ----
  const qEuler = (x, y, z) => { const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz]; };
  const makeClip = (name, T, keys, tracks) => {      // tracks: [{bone, f(t01) -> [rx, ry, rz] radians}]
    const anim = doc.createAnimation(name); const times = new Float32Array(keys + 1).map((_, i) => (i / keys) * T);
    const input = doc.createAccessor(`${name}_t`, buffer).setType('SCALAR').setArray(times);
    for (const tr of tracks) {
      const out = new Float32Array((keys + 1) * 4); for (let i = 0; i <= keys; i++) out.set(qEuler(...tr.f((i % keys) / keys)), i * 4);       // last key == first key: seamless loop
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(doc.createAccessor(`${name}_${tr.bone}`, buffer).setType('VEC4').setArray(out)).setInterpolation('LINEAR');
      anim.addSampler(sampler); anim.addChannel(doc.createAnimationChannel().setTargetNode(boneNodes[rig.index.get(tr.bone)]).setTargetPath('rotation').setSampler(sampler));
    }
    return anim;
  };
  const D = Math.PI / 180, TAU2 = Math.PI * 2, tracksFlutter = [], tracksScull = [];
  let ph = 0.3;
  for (const side of ['R', 'L']) {
    const sg = side === 'R' ? 1 : -1;
    for (let r = 0; r < 3; r++) {
      const p0 = ph += 1.7;
      tracksFlutter.push({ bone: `pectoral_${side}_r${r}`, f: (t) => [0, sg * 2.2 * D * Math.sin(TAU2 * t + p0), 1.6 * D * Math.sin(2 * TAU2 * t + p0 * 0.7)] });
      tracksScull.push({ bone: `pectoral_${side}_r${r}`, f: (t) => [0, sg * 7 * D * Math.sin(TAU2 * t + r * 0.55), 5 * D * Math.sin(TAU2 * t + r * 0.55 + 1.2)] });
    }
    for (let r = 0; r < 2; r++) { const p0 = ph += 1.3; tracksFlutter.push({ bone: `pelvic_${side}_r${r}`, f: (t) => [0, sg * 1.8 * D * Math.sin(TAU2 * t + p0), 1.2 * D * Math.sin(TAU2 * t + p0 + 0.9)] }); }
  }
  for (let r = 0; r < 3; r++) { const p0 = ph += 1.1; tracksFlutter.push({ bone: `dorsal_r${r}`, f: (t) => [1.3 * D * Math.sin(TAU2 * t + p0), 0, 2.0 * D * Math.sin(TAU2 * t + p0 + 0.6)] }); }
  for (let r = 0; r < 2; r++) { const p0 = ph += 1.9; tracksFlutter.push({ bone: `anal_r${r}`, f: (t) => [1.2 * D * Math.sin(TAU2 * t + p0), 0, 1.8 * D * Math.sin(TAU2 * t + p0 + 0.6)] }); }
  makeClip('FinFlutter', 3.0, 24, tracksFlutter);       // 2-4 s loop, small ray-group wobble of every fin (05 §5.7.1)
  makeClip('PectoralScull', 2.0, 24, tracksScull);      // hover scull of the pectoral ray groups (weight = w_hover at runtime)

  // ---- textures & materials ----
  const tex = (name, img) => doc.createTexture(name).setImage(encodePng(img)).setMimeType('image/png');
  // big colour / ORM / normal atlases go out as JPEG (4:4:4, q93-96) to keep the GLB small enough for a single-file page (< 16 MB with base64)
  const jpegBytes = async (img, q = 93) => new Uint8Array(await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).removeAlpha().jpeg({ quality: q, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer());
  const texJ = async (name, img, q) => doc.createTexture(name).setImage(await jpegBytes(img, q)).setMimeType('image/jpeg');
  const mats = {};
  const T = {};
  if (textures?.body) {
    T.albedo = await texJ('body_albedo', textures.body.albedo); T.normal = await texJ('body_normal', textures.body.normal, 96); T.orm = await texJ('body_orm', textures.body.orm, 95);
  }
  mats.body = doc.createMaterial('M_Body').setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(false);
  if (T.albedo) mats.body.setBaseColorTexture(T.albedo);
  if (T.normal) mats.body.setNormalTexture(T.normal).setNormalScale(1);
  if (T.orm) { mats.body.setOcclusionTexture(T.orm).setOcclusionStrength(1).setMetallicRoughnessTexture(T.orm); }
  else { mats.body.setBaseColorFactor([0.62, 0.58, 0.42, 1]).setRoughnessFactor(0.4).setMetallicFactor(0.3); }
  const bc = params.render?.body || {};
  mats.body.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(bc.clearcoat ?? 0.2).setClearcoatRoughnessFactor(bc.clearcoat_roughness ?? 0.12));
  mats.body.setExtension('KHR_materials_iridescence', iridExt.createIridescence().setIridescenceFactor(bc.iridescence ?? 0.10).setIridescenceIOR(1.33));
  mats.body.setExtension('KHR_materials_ior', iorExt.createIOR().setIOR(1.4));

  if (textures?.head && body.split) {
    const H = textures.head; const hc = params.render?.head || params.render?.body || {};
    mats.head = doc.createMaterial('M_Head').setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(false)
      .setBaseColorTexture(await texJ('head_albedo', H.albedo)).setNormalTexture(await texJ('head_normal', H.normal, 96)).setNormalScale(1);
    const ho = await texJ('head_orm', H.orm, 95); mats.head.setOcclusionTexture(ho).setOcclusionStrength(1).setMetallicRoughnessTexture(ho);
    mats.head.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(hc.clearcoat ?? 0.2).setClearcoatRoughnessFactor(hc.clearcoat_roughness ?? 0.12));
    mats.head.setExtension('KHR_materials_iridescence', iridExt.createIridescence().setIridescenceFactor(hc.iridescence ?? 0.10).setIridescenceIOR(1.33));
    mats.head.setExtension('KHR_materials_ior', iorExt.createIOR().setIOR(1.4));
  }
  mats.mouth = doc.createMaterial('M_Mouth').setBaseColorTexture(tex('mouth_albedo', mouthTexture())).setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(true);
  mats.gill = doc.createMaterial('M_Gill').setBaseColorFactor([0.30, 0.025, 0.03, 1]).setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(true);
  mats.teeth = doc.createMaterial('M_Teeth').setBaseColorFactor([0.93, 0.9, 0.82, 1]).setRoughnessFactor(0.3).setMetallicFactor(0).setDoubleSided(true);
  mats.fin = doc.createMaterial('M_Fin').setAlphaMode('BLEND').setDoubleSided(true).setRoughnessFactor(0.5).setMetallicFactor(0);
  if (textures?.fins) {
    mats.fin.setBaseColorTexture(tex('fin_albedo', textures.fins.albedo));
    if (textures.fins.normal) mats.fin.setNormalTexture(tex('fin_normal', textures.fins.normal));
    if (textures.fins.orm) { const o = tex('fin_orm', textures.fins.orm); mats.fin.setOcclusionTexture(o).setMetallicRoughnessTexture(o); }
  } else mats.fin.setBaseColorFactor([0.7, 0.65, 0.5, 0.6]);
  const E = textures?.eyes;
  mats.iris = doc.createMaterial('M_Eye_Iris').setRoughnessFactor(1).setMetallicFactor(1);
  if (E?.iris) {
    mats.iris.setBaseColorTexture(tex('eye_iris', E.iris));
    if (E.iris_normal) mats.iris.setNormalTexture(tex('eye_iris_normal', E.iris_normal));
    if (E.iris_orm) { const o = tex('eye_iris_orm', E.iris_orm); mats.iris.setOcclusionTexture(o).setMetallicRoughnessTexture(o); }
  } else mats.iris.setBaseColorFactor([0.05, 0.04, 0.03, 1]).setRoughnessFactor(0.25).setMetallicFactor(0);
  // cornea: the eye module specifies additive blending (not expressible in glTF) -> exported as dark BLEND; Yamame.js swaps in AdditiveBlending at load
  mats.cornea = doc.createMaterial('M_Eye_Cornea').setAlphaMode('BLEND').setBaseColorFactor([0, 0, 0, 0.15]).setRoughnessFactor(0.03).setMetallicFactor(0);
  mats.orbit = doc.createMaterial('M_Eye_Orbit').setRoughnessFactor(0.5).setMetallicFactor(0.0);
  if (E?.orbit) mats.orbit.setBaseColorTexture(tex('eye_orbit', E.orbit)); else mats.orbit.setBaseColorFactor([0.12, 0.09, 0.06, 1]);

  // ---- mesh helper ----
  const accessor = (name, type, array, normalized = false) => doc.createAccessor(name, buffer).setType(type).setArray(array).setNormalized(normalized);
  const unitNormals = (n) => { const o = Float32Array.from(n); for (let i = 0; i < o.length; i += 3) { const l = Math.hypot(o[i], o[i + 1], o[i + 2]); if (l < 1e-8 || !Number.isFinite(l)) { o[i] = 0; o[i + 1] = 0; o[i + 2] = 1; } else { o[i] /= l; o[i + 1] /= l; o[i + 2] /= l; } } return o; };
  const makePrim = (g, mat, joints, name) => {
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', accessor(name + '_pos', 'VEC3', g.positions))
      .setAttribute('NORMAL', accessor(name + '_nrm', 'VEC3', unitNormals(g.normals)))
      .setAttribute('TEXCOORD_0', accessor(name + '_uv', 'VEC2', g.uvs))
      .setIndices(accessor(name + '_idx', 'SCALAR', g.indices));
    if (joints) { prim.setAttribute('JOINTS_0', accessor(name + '_j', 'VEC4', joints.joints)); prim.setAttribute('WEIGHTS_0', accessor(name + '_w', 'VEC4', joints.weights)); }
    if (g.attrs) for (const [k, v] of Object.entries(g.attrs)) if (k.startsWith('_') && k !== '_JAW') prim.setAttribute(k, accessor(name + k, 'SCALAR', v));
    return prim;
  };

  // ---- body (skinned): body skin + mouth tube ----
  const bodyMesh = doc.createMesh('Body_LOD0');
  const bodyPrim = makePrim(body.split ? { ...body, indices: body.split.indicesBody } : body, mats.body, weights.body, 'body');
  const morphTargets = morphs.map((M) => doc.createPrimitiveTarget(M.name).setAttribute('POSITION', accessor(`morph_${M.name}`, 'VEC3', M.dPos)));
  for (const t of morphTargets) bodyPrim.addTarget(t);
  bodyMesh.addPrimitive(bodyPrim);
  if (mats.head) {
    // head primitive: same vertices / skin / morph targets, its own index list and the head-atlas UVs
    const headPrim = doc.createPrimitive().setMaterial(mats.head).setIndices(accessor('head_idx', 'SCALAR', body.split.indicesHead)).setAttribute('TEXCOORD_0', accessor('head_uv', 'VEC2', body.split.uvsHead));
    for (const sem of bodyPrim.listSemantics()) if (sem !== 'TEXCOORD_0') headPrim.setAttribute(sem, bodyPrim.getAttribute(sem));
    for (const t of morphTargets) headPrim.addTarget(t);
    bodyMesh.addPrimitive(headPrim);
  }
  if (morphs.length) { bodyMesh.setWeights(morphs.map(() => 0)); bodyMesh.setExtras({ targetNames: morphs.map((M) => M.name) }); }
  const mouthPrim = makePrim(body.mouth, mats.mouth, weights.mouth, 'mouth');
  for (const M of morphs) mouthPrim.addTarget(doc.createPrimitiveTarget(M.name).setAttribute('POSITION', accessor(`morph0_${M.name}`, 'VEC3', new Float32Array(body.mouth.positions.length))));   // glTF: every primitive of a mesh needs the same target count
  bodyMesh.addPrimitive(mouthPrim);
  if (gills) {
    const gp = makePrim({ ...gills, indices: gills.indices }, mats.gill, weights.gills, 'gills');
    for (const M of morphs) gp.addTarget(doc.createPrimitiveTarget(M.name).setAttribute('POSITION', accessor(`morph2_${M.name}`, 'VEC3', new Float32Array(gills.positions.length))));
    bodyMesh.addPrimitive(gp);
  }
  if (teeth) {
    const tp = makePrim(teeth, mats.teeth, weights.teeth, 'teeth');
    for (const M of morphs) tp.addTarget(doc.createPrimitiveTarget(M.name).setAttribute('POSITION', accessor(`morph1_${M.name}`, 'VEC3', new Float32Array(teeth.positions.length))));
    bodyMesh.addPrimitive(tp);
  }
  const bodyNode = doc.createNode('Body_LOD0').setMesh(bodyMesh).setSkin(skin); rootNode.addChild(bodyNode);

  // lower LODs share the skin (same Skeleton / bindMatrix); the runtime assembles THREE.LOD from the *_LODn nodes
  for (const L of lodBodies) {
    const m = doc.createMesh(`Body_LOD${L.level}`); m.addPrimitive(makePrim(L.body, mats.body, L.weights.body, `body${L.level}`));
    if (L.withMouth) m.addPrimitive(makePrim(L.body.mouth, mats.mouth, L.weights.mouth, `mouth${L.level}`));
    rootNode.addChild(doc.createNode(`Body_LOD${L.level}`).setMesh(m).setSkin(skin));
  }
  for (const L of lodFins) {
    const m = doc.createMesh(`Fins_LOD${L.level}`); m.addPrimitive(makePrim(L.fins.geometry, mats.fin, L.weights, `fins${L.level}`));
    rootNode.addChild(doc.createNode(`Fins_LOD${L.level}`).setMesh(m).setSkin(skin));
  }
  if (fins) {
    const finMesh = doc.createMesh('Fins_LOD0'); finMesh.addPrimitive(makePrim(fins.geometry, mats.fin, weights.fins, 'fins'));
    const finNode = doc.createNode('Fins_LOD0').setMesh(finMesh).setSkin(skin); rootNode.addChild(finNode);
  }
  // eyes: LOD0 nodes are named Eye_L / Eye_R / EyeOrbit_L / EyeOrbit_R; lower detail levels get a _LODn suffix (the runtime toggles their visibility with the body LOD)
  const addEyes = (E, suffix) => {
    for (const side of ['L', 'R']) {
      const e = side === 'L' ? E.left : E.right;
      const eyeBone = boneNodes[rig.index.get(`eye_${side}`)], headBoneIdx = rig.index.get(rig.bones[rig.index.get(`eye_${side}`)].parent), headBone = boneNodes[headBoneIdx];
      // ball + cornea rotate with the eye bone (pivot = eyeball centre, which is the bone position)
      const ballNode = doc.createNode(`Eye_${side}${suffix}`).setRotation(e.quaternion);
      const bm = doc.createMesh(`Eye_${side}${suffix}`);
      if (e.parts.ball) bm.addPrimitive(makePrim(e.parts.ball, mats.iris, null, `eye${side}${suffix}_ball`));
      if (e.parts.cornea) bm.addPrimitive(makePrim(e.parts.cornea, mats.cornea, null, `eye${side}${suffix}_cornea`));
      ballNode.setMesh(bm); eyeBone.addChild(ballNode);
      // orbit ring stays with the head
      if (e.parts.orbit) {
        const hp = rig.bones[headBoneIdx].pos, c = e.center;
        const on = doc.createNode(`EyeOrbit_${side}${suffix}`).setTranslation([c[0] - hp[0], c[1] - hp[1], c[2] - hp[2]]).setRotation(e.quaternion);
        const om = doc.createMesh(`EyeOrbit_${side}${suffix}`); om.addPrimitive(makePrim(e.parts.orbit, mats.orbit, null, `eye${side}${suffix}_orbit`)); on.setMesh(om); headBone.addChild(on);
      }
    }
  };
  if (eyes) addEyes(eyes, '');
  for (const L of lodEyes) addEyes(L.eyes, `_LOD${L.level}`);
  const io = new NodeIO().registerExtensions([KHRMaterialsClearcoat, KHRMaterialsIridescence, KHRMaterialsIOR, KHRMaterialsSpecular, KHRTextureTransform]).setVertexLayout(VertexLayout.SEPARATE);
  await io.write(file, doc);
  return { file };
}

function mouthTexture() {
  // u along the cavity (0 lips .. 1 throat), v around the loop (0 roof, 0.25 left cheek, 0.375-0.625 tongue / floor, 0.75 right cheek).
  // Pale pink-grey mucosa at the lips falling off to a dark violet throat (reference photos: lit tissue ~(163,133,139), cavity ~(47,48,59)).
  const W = 128, H = 128; const data = new Uint8Array(W * H * 4);
  const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h = (h ^ (h >>> 13)) >>> 0; return (h & 0xffff) / 65535; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = y / (H - 1);
    let c;
    if (v < 0.25) c = [196, 158, 158];          // palate
    else if (v < 0.375) c = [170, 122, 128];     // left inner cheek
    else if (v < 0.625) c = [214, 190, 186];     // tongue / floor
    else c = [170, 122, 128];                    // right inner cheek
    const lipBand = 1 - Math.min(1, u / 0.05);   // pale lip rim at the very front
    const depth = Math.pow(Math.min(1, Math.max(0, (u - 0.04) / 0.96)), 0.7);
    const dark = 1 - 0.86 * depth;
    const n = 0.88 + 0.24 * vn(u * 18, v * 40);
    const o = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) { const base = c[k] * (1 - lipBand) + [230, 210, 205][k] * lipBand; data[o + k] = Math.min(255, base * dark * n + [40, 22, 32][k] * depth * 0.5); }
    data[o + 3] = 255;
  }
  return { width: W, height: H, data };
}
