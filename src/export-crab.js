import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { makeTextures, makeMaterials, buildCrab } from './crab-builder.js';
import { makeClips } from './crab-clips.js';
import { computeMikkTSpaceTangents, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MikkTSpace from 'three/addons/libs/mikktspace.module.js';

/** Builds the crab, drops it on y=0, bakes clips, returns GLB as base64. */
export async function exportCrab() {
  const tx = makeTextures(), mats = makeMaterials(tx);
  const crab = buildCrab(mats);
  await MikkTSpace.ready;
  crab.traverse((o) => { // MikkTSpace tangents so every renderer shades the normal map identically
    if (!o.isMesh || !o.material.normalMap) return;
    o.geometry = mergeVertices(computeMikkTSpaceTangents(o.geometry, MikkTSpace), 1e-5);
  });
  crab.updateMatrixWorld(true);
  const feet = new THREE.Box3();
  crab.traverse((o) => { if (o.isMesh && /leg\d_dactylus_mesh$/.test(o.name)) feet.expandByObject(o); });
  crab.position.y = -feet.min.y; // walking-leg tips on the ground (cm units)
  const root = new THREE.Group(); root.name = 'ChigoganiRoot'; root.scale.setScalar(0.01); // cm -> m
  root.userData = { species: 'Ilyoplax pusilla', sex: 'male (blue frontal patches, enlarged pair of chelipeds)', unit: 'GLB is in metres; carapace width ~1.0 cm' };
  root.add(crab);
  const clips = makeClips(crab);
  const scene = new THREE.Scene(); scene.name = 'Scene'; scene.add(root);
  scene.updateMatrixWorld(true);
  const buf = await new Promise((res, rej) => new GLTFExporter().parse(scene, res, rej, { binary: true, animations: clips }));
  const u8 = new Uint8Array(buf); let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return { b64: btoa(s), size: u8.length, bbox: (() => { const b = new THREE.Box3().setFromObject(crab); return [b.min.toArray(), b.max.toArray()]; })() };
}
