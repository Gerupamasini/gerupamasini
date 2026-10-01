// Loads a goby species (photoreal glTF from the procedural model pipeline) once and creates any number of
// individuals from it: each gets its own skeleton, materials (colour, mouth / gill state, fin ground
// contact) and behaviour, while geometry, textures and shader programs are shared.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createBodyMaterial, createProfileTexture } from '../materials/BodyMaterial.js';
import { createFinMaterials } from '../materials/FinMaterial.js';
import { createEyeMaterial } from '../materials/EyeMaterial.js';
import { createInteriorMaterial } from '../materials/InteriorMaterial.js';
import { createPoseModel } from './pose.js';
import { createBehavior } from './Behavior.js';

export const LAYER_FISH = 2;   // body, eyes, fins (main pass)
export const LAYER_BEHIND = 3; // fins are also drawn into the background buffer so they show through thin tissue

// juvenile マハゼ defaults (the viewer had these built in; エドハゼ ships its own in the glTF extras)
const MAHAZE_VIEWER = {
  shadowChain: [['J_head', 3.0], ['J_head', 8.0], ['J_root', 13.0], ['J_sp1', 17.0], ['J_sp3', 25.0], ['J_sp5', 33.0], ['J_sp7', 40.0], ['J_caudal2', 46.5]],
  coreChain: [['J_root', 11.2, 3.68, 0.34], ['J_sp1', 18.5, 3.68, 0.3], ['J_sp3', 26.5, 3.66, 0.26], ['J_sp5', 34.5, 3.64, 0.21], ['J_sp7', 40.4, 3.6, 0.17],
    ['J_root', 12.6, 1.6, 1.25], ['J_sp2', 20.8, 1.55, 1.05]],
  contacts: [
    ['J_pelvic', 13.0, 'rim'], ['J_pelvic', 14.8, 'rim'], ['J_pelvic', 16.6, 'rim'],
    ['J_root', 15.5, 'bot'], ['J_sp1', 18.5, 'bot'], ['J_sp2', 22.5, 'bot'], ['J_sp3', 26.5, 'bot'],
    ['J_sp4', 30.5, 'bot'], ['J_sp5', 34.5, 'bot'], ['J_sp6', 38.5, 'bot'], ['J_caudal2', 48.0, 'tail'],
  ],
  finGrazeMin: 0.1, finEdge: [0.03, 0.3, 0], finOpCap: [1, 0, 0],
};

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url.split('/').pop()})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total && onProgress) onProgress(Math.min(1, loaded / total));
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Load one species: parse the glTF and prepare everything individuals share. */
export async function loadSpecies(key, url, onProgress) {
  const bytes = await fetchBytes(url, onProgress);
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new URL('.', new URL(url, location.href)).href);
  const parser = gltf.parser;
  const scene = gltf.scene;
  let body = null, eye = null, fin = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const x = o.material.userData.mahaze || {};
    if (x.role === 'body') body = o;
    else if (x.role === 'eye') eye = o;
    else if (x.role === 'fin' && !fin) fin = o;
  });
  const bx = body.material.userData.mahaze;
  const pigment = await parser.getDependency('texture', bx.pigmentTexture);
  pigment.colorSpace = THREE.NoColorSpace;
  const capAlbedo = await parser.getDependency('texture', bx.snoutCap.albedoRoughness);
  const capPigment = await parser.getDependency('texture', bx.snoutCap.pigment);
  capAlbedo.colorSpace = THREE.SRGBColorSpace;
  capPigment.colorSpace = THREE.NoColorSpace;
  const finData = await parser.getDependency('texture', fin.material.userData.mahaze.dataTexture);
  finData.colorSpace = THREE.NoColorSpace;
  let rigNode = null;
  scene.traverse((o) => { if (!rigNode && o.userData && o.userData.mahazeRig) rigNode = o; });
  const rig = rigNode.userData.mahazeRig;
  const sv = { ...MAHAZE_VIEWER, ...(rigNode.userData.viewer || {}) };
  return {
    key,
    scene,
    rig,
    viewer: sv,
    model: createPoseModel(rig.axes.body),
    profile: bx.profile,
    frame: bx.fishFrame,
    vertebrae: bx.vertebrae,
    anatomy: bx.anatomy,
    capRect: bx.snoutCap.rectMM,
    bodyTextures: { albedo: body.material.map, normal: body.material.normalMap, orm: body.material.roughnessMap || body.material.aoMap, pigment, capAlbedo, capPigment },
    profileTexture: createProfileTexture(bx.profile),
    eyeTexture: eye.material.map,
    eyeParams: eye.material.userData.mahaze,
    finTextures: { color: fin.material.map, data: finData, normal: fin.material.normalMap },
    commonName: rigNode.userData.commonName,
    eyeMat: null,
  };
}

/**
 * One goby.
 * @param sp  species from loadSpecies()
 * @param o   { shared, world, scale, tint, melanin, start, home, range, burrow, startHidden, rng, slot }
 */
export function createIndividual(sp, o) {
  const { shared } = o;
  const root = SkeletonUtils.clone(sp.scene);
  root.name = `${sp.key}_${o.slot}`;
  const bones = {};
  const meshes = [];
  root.traverse((n) => {
    if (n.isBone) bones[n.name] = n;
    if (n.isMesh) meshes.push(n);
  });
  // rest pose in object space (unscaled), before the root is moved
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  for (const b of Object.values(bones)) b.userData.restObj = b.getWorldPosition(new THREE.Vector3());
  const jointRest = Object.fromEntries(Object.entries(bones).map(([k, b]) => [k, b.userData.restObj.clone()]));

  const fish = { sp, root, bones, body: null, eyes: [], fins: [], interiors: [], slot: o.slot };
  for (const m of meshes) {
    m.layers.set(LAYER_FISH);
    m.frustumCulled = false;
    const x = m.material.userData.mahaze || {};
    if (x.role === 'body') fish.body = m;
    else if (x.role === 'eye') fish.eyes.push(m);
    else if (x.role === 'fin') fish.fins.push({ mesh: m });
    else if (x.role === 'interior') fish.interiors.push(m);
  }

  // ---- materials
  const sv = sp.viewer;
  fish.body.material = createBodyMaterial({
    textures: sp.bodyTextures,
    capRect: sp.capRect,
    profileTexture: sp.profileTexture,
    frame: sp.frame,
    vertebrae: sp.vertebrae,
    anatomy: sp.anatomy,
    shared,
    tint: o.tint ?? [1, 1, 1],
    melanin: o.melanin ?? 1,
  });
  if (!sp.eyeMat) sp.eyeMat = createEyeMaterial({ irisTexture: sp.eyeTexture, params: sp.eyeParams, shared });
  for (const e of fish.eyes) e.material = sp.eyeMat;
  fish.interiorMat = createInteriorMaterial({ shared });
  for (const m of fish.interiors) m.material = fish.interiorMat;
  // fins: the edge-on look is per species, the sand contact plane per individual
  fish.finShared = {
    ...shared,
    uFloorY: { value: -1e3 },
    uFinGrazeMin: { value: sv.finGrazeMin ?? 0.1 },
    uFinEdge: { value: new THREE.Vector3(...(sv.finEdge || [0.03, 0.3, 0])) },
    uFinOpCap: { value: new THREE.Vector3(...(sv.finOpCap || [1, 0, 0])) },
  };
  const finMats = createFinMaterials({ textures: sp.finTextures, shared: fish.finShared });
  for (const f of fish.fins) {
    const scatter = new THREE.SkinnedMesh(f.mesh.geometry, finMats.scatter);
    scatter.bind(f.mesh.skeleton, f.mesh.bindMatrix);
    scatter.morphTargetInfluences = f.mesh.morphTargetInfluences;
    scatter.morphTargetDictionary = f.mesh.morphTargetDictionary;
    scatter.frustumCulled = false;
    scatter.layers.set(LAYER_FISH);
    scatter.layers.enable(LAYER_BEHIND);
    f.mesh.layers.enable(LAYER_BEHIND);
    scatter.name = `${f.mesh.name}_scatter`;
    f.mesh.parent.add(scatter);
    f.scatter = scatter;
    f.mesh.material = finMats.transmit;
    f.mesh.geometry.computeBoundingSphere();
    f.center = f.mesh.geometry.boundingSphere.center.clone();
  }

  // ---- body geometry helpers (fish mm → object metres)
  const F = sp.frame, P = sp.profile;
  const sec = (s) => { const k = Math.min(P.n - 1, Math.max(0, Math.round((s / F.SEND) * (P.n - 1)))); return P.data.slice(k * 6, k * 6 + 4); };
  const botY = (s) => { const [yc, , b] = sec(s); return yc - b; };
  const objPt = (s, y, z = 0) => new THREE.Vector3(z * 0.001, (y - F.Y0) * 0.001, (F.S0 - s) * 0.001);
  const onBone = (bone, s, y, z = 0) => ({ bone: bones[bone], p: objPt(s, y, z).sub(bones[bone].userData.restObj) });
  const rimY = sp.rig.contactY * 1000 + F.Y0;
  const tailY = sp.rig.tailContactY * 1000 + F.Y0;
  const contacts = sv.contacts.map(([bone, sMM, y]) => onBone(bone, sMM, y === 'rim' ? rimY : y === 'bot' ? botY(sMM) : y === 'tail' ? tailY : y));
  // the chin touches down when the head is lowered to peck at the sediment
  contacts.push(onBone('J_head', 2.0, botY(2.0)), onBone('J_head', 4.5, botY(4.5)));
  const gillS = sp.anatomy?.gillWin ? sp.anatomy.gillWin[3] : 11.3;
  const [gyc, , gb, gw] = sec(gillS);
  const points = {
    snout: onBone('J_head', 0.8, sec(1.0)[0] - 0.4),
    belly: onBone('J_pelvic', 14.0, rimY),
    gillL: onBone('J_head', gillS, gyc - 0.35 * gb, gw * 0.95),
    gillR: onBone('J_head', gillS, gyc - 0.35 * gb, -gw * 0.95),
    eyeS: F.S0 - (bones.J_eyeL.userData.restObj.z * 1000),
  };
  fish.shadowChain = sv.shadowChain.map(([bone, s]) => {
    const [yc, t, b, w] = sec(Math.min(s, F.SEND));
    const r = s > F.SEND ? 1.6 : Math.max(0.6, (t + b + 2 * w) * 0.25);
    return { bone: bones[bone], p: objPt(Math.min(s, F.SEND + 3), yc).sub(bones[bone].userData.restObj), r: r * 0.001 * (s > F.SEND ? 0.5 : 1) };
  });
  fish.coreChain = sv.coreChain.map(([bone, s, y, r]) => ({ bone: bones[bone], p: objPt(s, y).sub(bones[bone].userData.restObj), r: r * 0.001 }));

  root.scale.setScalar(o.scale ?? 1);
  fish.scale = o.scale ?? 1;
  fish.behavior = createBehavior({
    root,
    bones,
    finMeshes: Object.fromEntries(fish.fins.map((f) => [f.mesh.name, f.mesh])),
    axes: sp.rig.axes,
    contacts,
    model: sp.model,
    world: o.world,
    species: sp.key,
    jointRest,
    points,
    scale: fish.scale,
    rng: o.rng,
    start: o.start,
    home: o.home,
    range: o.range,
    burrow: o.burrow,
    startHidden: o.startHidden,
    personality: o.personality,
  });
  fish.points = points;
  return fish;
}

const _w = new THREE.Vector3();
/** Per-frame update of an individual (behaviour, mouth / gill shading, fin ground plane). */
export function updateIndividual(fish, dt) {
  const b = fish.behavior;
  b.update(dt);
  fish.root.updateMatrixWorld(true);
  fish.interiorMat.uniforms.uMouthOpen.value = b.state.mouthOpen || 0;
  fish.interiorMat.uniforms.uGillOpen.value = b.state.gillOpen || 0;
  // fins pressed against the sand lie on it (a little below the local surface, so ripples do not cut them)
  fish.finShared.uFloorY.value = b.state.floorY - 0.00025;
}

/** Shadow capsules (world) for the terrain shader; slot arrays are written in place. */
export function writeShadow(fish, shadowArr, coreArr, boundArr) {
  const i = fish.slot;
  const vis = fish.root.visible;
  fish.shadowChain.forEach((c, k) => {
    if (!vis) { shadowArr[i * 8 + k].set(0, 0, 0, 0); return; }
    _w.copy(c.p);
    c.bone.localToWorld(_w);
    shadowArr[i * 8 + k].set(_w.x, _w.y, _w.z, c.r * fish.scale);
  });
  fish.coreChain.forEach((c, k) => {
    if (!vis) { coreArr[i * 7 + k].set(0, 0, 0, 0); return; }
    _w.copy(c.p);
    c.bone.localToWorld(_w);
    coreArr[i * 7 + k].set(_w.x, _w.y, _w.z, c.r * fish.scale);
  });
  if (!vis) { boundArr[i].set(0, 0, 0, 0); return; }
  _w.copy(fish.root.position);
  boundArr[i].set(_w.x, _w.y, _w.z, fish.behavior.bl * 0.75);
}
