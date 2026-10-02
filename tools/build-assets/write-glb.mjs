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

export async function writeGLB({ file, body, fins, eyes, rig, textures, params, meta = {}, weights, lodBodies = [], lodFins = [] }) {
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
  bodyMesh.addPrimitive(makePrim(body, mats.body, weights.body, 'body'));
  bodyMesh.addPrimitive(makePrim(body.mouth, mats.mouth, weights.mouth, 'mouth'));
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
  if (eyes) {
    for (const side of ['L', 'R']) {
      const e = side === 'L' ? eyes.left : eyes.right;
      const eyeBone = boneNodes[rig.index.get(`eye_${side}`)], headBoneIdx = rig.index.get(rig.bones[rig.index.get(`eye_${side}`)].parent), headBone = boneNodes[headBoneIdx];
      // ball + cornea rotate with the eye bone (pivot = eyeball centre, which is the bone position)
      const ballNode = doc.createNode(`Eye_${side}`).setRotation(e.quaternion);
      const bm = doc.createMesh(`Eye_${side}`);
      if (e.parts.ball) bm.addPrimitive(makePrim(e.parts.ball, mats.iris, null, `eye${side}_ball`));
      if (e.parts.cornea) bm.addPrimitive(makePrim(e.parts.cornea, mats.cornea, null, `eye${side}_cornea`));
      ballNode.setMesh(bm); eyeBone.addChild(ballNode);
      // orbit ring stays with the head
      if (e.parts.orbit) {
        const hp = rig.bones[headBoneIdx].pos, c = e.center;
        const on = doc.createNode(`EyeOrbit_${side}`).setTranslation([c[0] - hp[0], c[1] - hp[1], c[2] - hp[2]]).setRotation(e.quaternion);
        const om = doc.createMesh(`EyeOrbit_${side}`); om.addPrimitive(makePrim(e.parts.orbit, mats.orbit, null, `eye${side}_orbit`)); on.setMesh(om); headBone.addChild(on);
      }
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
    if (v < 0.25) c = [214, 168, 160];          // palate
    else if (v < 0.375) c = [196, 140, 136];       // left inner cheek
    else if (v < 0.625) c = [228, 206, 200];     // tongue / floor
    else c = [196, 140, 136];                      // right inner cheek
    const dark = 1 - 0.55 * Math.pow(u, 1.5);
    const o = (y * W + x) * 4; data[o] = c[0] * dark; data[o + 1] = c[1] * dark; data[o + 2] = c[2] * dark; data[o + 3] = 255;
  }
  return { width: W, height: H, data };
}
