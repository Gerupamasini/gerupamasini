// Assemble the Yamame GLB with glTF-Transform (Node only; no Blender). Structure: spec07 §7.3.4.
import { Document, NodeIO, VertexLayout } from '@gltf-transform/core';
import { KHRMaterialsClearcoat, KHRMaterialsIridescence, KHRMaterialsIOR, KHRMaterialsSpecular, KHRTextureTransform } from '@gltf-transform/extensions';
import { encodePng } from './png.mjs';
import { boneLocalTranslations, inverseBindMatrices } from './rig.mjs';

// shortest-arc quaternion taking +Z to dir (xyzw)
function quatFromZ(dir) {
  const l = Math.hypot(...dir); const [x, y, z] = dir.map((v) => v / l);
  if (z < -0.999999) return [0, 1, 0, 0];
  const w = 1 + z; const q = [-y, x, 0, w]; const n = Math.hypot(...q); return q.map((v) => v / n);
}

export async function writeGLB({ file, body, fins, eyes, rig, textures, params, meta = {}, weights }) {
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

  // ---- textures & materials ----
  const tex = (name, img) => doc.createTexture(name).setImage(encodePng(img)).setMimeType('image/png');
  const mats = {};
  const T = {};
  if (textures?.body) {
    T.albedo = tex('body_albedo', textures.body.albedo); T.normal = tex('body_normal', textures.body.normal); T.orm = tex('body_orm', textures.body.orm);
  }
  mats.body = doc.createMaterial('M_Body').setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(false);
  if (T.albedo) mats.body.setBaseColorTexture(T.albedo);
  if (T.normal) mats.body.setNormalTexture(T.normal).setNormalScale(1);
  if (T.orm) { mats.body.setOcclusionTexture(T.orm).setOcclusionStrength(1).setMetallicRoughnessTexture(T.orm); }
  else { mats.body.setBaseColorFactor([0.62, 0.58, 0.42, 1]).setRoughnessFactor(0.4).setMetallicFactor(0.3); }
  const bc = params.render?.body || {};
  mats.body.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(bc.clearcoat ?? 0.35).setClearcoatRoughnessFactor(bc.clearcoat_roughness ?? 0.12));
  mats.body.setExtension('KHR_materials_iridescence', iridExt.createIridescence().setIridescenceFactor(bc.iridescence ?? 0.10).setIridescenceIOR(1.33));
  mats.body.setExtension('KHR_materials_ior', iorExt.createIOR().setIOR(1.4));

  mats.mouth = doc.createMaterial('M_Mouth').setBaseColorTexture(tex('mouth_albedo', mouthTexture())).setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(true);
  mats.fin = doc.createMaterial('M_Fin').setAlphaMode('BLEND').setDoubleSided(true).setRoughnessFactor(0.5).setMetallicFactor(0);
  if (textures?.fins) {
    mats.fin.setBaseColorTexture(tex('fin_albedo', textures.fins.albedo));
    if (textures.fins.normal) mats.fin.setNormalTexture(tex('fin_normal', textures.fins.normal));
    if (textures.fins.orm) mats.fin.setOcclusionTexture(tex('fin_orm', textures.fins.orm)).setMetallicRoughnessTexture(tex('fin_orm2', textures.fins.orm));
  } else mats.fin.setBaseColorFactor([0.7, 0.65, 0.5, 0.6]);
  const eyeTex = textures?.eyes?.iris ? tex('eye_iris', textures.eyes.iris) : null;
  mats.iris = doc.createMaterial('M_Eye_Iris').setRoughnessFactor(0.25).setMetallicFactor(0.0); if (eyeTex) mats.iris.setBaseColorTexture(eyeTex); else mats.iris.setBaseColorFactor([0.05, 0.04, 0.03, 1]);
  mats.cornea = doc.createMaterial('M_Eye_Cornea').setAlphaMode('BLEND').setBaseColorFactor([1, 1, 1, 0.12]).setRoughnessFactor(0.02).setMetallicFactor(0);
  mats.cornea.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.02));
  mats.orbit = doc.createMaterial('M_Eye_Orbit').setBaseColorFactor([0.12, 0.09, 0.06, 1]).setRoughnessFactor(0.5).setMetallicFactor(0.1);

  // ---- mesh helper ----
  const accessor = (name, type, array, normalized = false) => doc.createAccessor(name, buffer).setType(type).setArray(array).setNormalized(normalized);
  const makePrim = (g, mat, joints, name) => {
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', accessor(name + '_pos', 'VEC3', g.positions))
      .setAttribute('NORMAL', accessor(name + '_nrm', 'VEC3', g.normals))
      .setAttribute('TEXCOORD_0', accessor(name + '_uv', 'VEC2', g.uvs))
      .setIndices(accessor(name + '_idx', 'SCALAR', g.indices));
    if (joints) { prim.setAttribute('JOINTS_0', accessor(name + '_j', 'VEC4', joints.joints)); prim.setAttribute('WEIGHTS_0', accessor(name + '_w', 'VEC4', joints.weights)); }
    if (g.attrs) for (const [k, v] of Object.entries(g.attrs)) if (k.startsWith('_') && k !== '_JAW') prim.setAttribute(k, accessor(name + k, 'SCALAR', v));
    return prim;
  };

  // ---- body (skinned): body skin + mouth tube ----
  const bodyMesh = doc.createMesh('Body_LOD0');
  bodyMesh.addPrimitive(makePrim(body, mats.body, weights.body, 'body'));
  bodyMesh.addPrimitive(makePrim(body.mouth, mats.mouth, weights.mouth, 'mouth'));
  const bodyNode = doc.createNode('Body_LOD0').setMesh(bodyMesh).setSkin(skin); rootNode.addChild(bodyNode);

  if (fins) {
    const finMesh = doc.createMesh('Fins_LOD0'); finMesh.addPrimitive(makePrim(fins.geometry, mats.fin, weights.fins, 'fins'));
    const finNode = doc.createNode('Fins_LOD0').setMesh(finMesh).setSkin(skin); rootNode.addChild(finNode);
  }
  if (eyes) {
    for (const side of ['L', 'R']) {
      const e = side === 'L' ? eyes.left : eyes.right; const parent = boneNodes[rig.index.get(`eye_${side}`)];
      const eyeNode = doc.createNode(`Eye_${side}`); eyeNode.setRotation(quatFromZ(e.axis));
      const m = doc.createMesh(`Eye_${side}`);
      if (e.parts.ball) m.addPrimitive(makePrim(e.parts.ball, mats.iris, null, `eye${side}_ball`));
      if (e.parts.orbit) m.addPrimitive(makePrim(e.parts.orbit, mats.orbit, null, `eye${side}_orbit`));
      if (e.parts.cornea) m.addPrimitive(makePrim(e.parts.cornea, mats.cornea, null, `eye${side}_cornea`));
      eyeNode.setMesh(m); parent.addChild(eyeNode);
    }
  }
  const io = new NodeIO().registerExtensions([KHRMaterialsClearcoat, KHRMaterialsIridescence, KHRMaterialsIOR, KHRMaterialsSpecular, KHRTextureTransform]).setVertexLayout(VertexLayout.SEPARATE);
  await io.write(file, doc);
  return { file };
}

function mouthTexture() {
  const W = 64, H = 64; const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = y / (H - 1);   // u along the mouth (tip..throat), v around the loop (0 roof .. 0.375 left floor ...)
    let c;
    if (v < 0.25) c = [196, 110, 112];          // palate
    else if (v < 0.375) c = [178, 84, 90];       // left inner cheek
    else if (v < 0.625) c = [232, 178, 178];     // tongue / floor
    else c = [178, 84, 90];                      // right inner cheek
    const dark = 1 - 0.55 * Math.pow(u, 1.5);
    const o = (y * W + x) * 4; data[o] = c[0] * dark; data[o + 1] = c[1] * dark; data[o + 2] = c[2] * dark; data[o + 3] = 255;
  }
  return { width: W, height: H, data };
}
