import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBodyMaterial, createProfileTexture } from './materials/BodyMaterial.js';
import { createFinMaterials } from './materials/FinMaterial.js';
import { createEyeMaterial } from './materials/EyeMaterial.js';
import { createInteriorMaterial } from './materials/InteriorMaterial.js';
import { createBehavior } from './fish/Behavior.js';
import { createBackground, createFloor, createParticles } from './scene/Environment.js';
import { createPost } from './scene/Post.js';

// window.MAHAZE_MODEL_URL can point the viewer at another copy of the model (e.g. a .gltf with external textures)
const MODEL_URL = window.MAHAZE_MODEL_URL || new URL('../models/mahaze_juvenile.glb', import.meta.url).href;
const LAYER_FISH = 2; // body, eyes, fins (main pass)
const LAYER_BEHIND = 3; // fins are also drawn into the background buffer so they show through thin tissue
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------- renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) {
  fail('WebGL2 と浮動小数点レンダーターゲット (EXT_color_buffer_float) が必要です。');
}
renderer.toneMapping = THREE.NoToneMapping;
let pixelRatio = Math.min(window.devicePixelRatio || 1, Number(params.get('dpr')) || 1.5);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.0004, 6);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.006;
controls.maxDistance = 0.45;
controls.zoomSpeed = 0.9;
controls.screenSpacePanning = true;

// ---------------------------------------------------------------------------- shared uniforms
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const shared = {
  uLightDir: { value: v3(0.3, 0.8, 0.5).normalize() },
  uLightColor: { value: v3(3.2, 3.05, 2.8) },
  uWaterDeep: { value: v3(0.004, 0.017, 0.021) },
  uWaterUp: { value: v3(0.03, 0.085, 0.095) },
  uSurfaceGlow: { value: v3(0.22, 0.38, 0.38) },
  uAmbUp: { value: v3(0.11, 0.2, 0.21) },
  uAmbDown: { value: v3(0.022, 0.045, 0.05) },
  uFogColor: { value: v3(0.012, 0.038, 0.044) },
  uFogDensity: { value: 1.1 },
  uTime: { value: 0 },
  uScatter: { value: 1.0 },
  uInterior: { value: 0.45 },
  uCausticAmt: { value: 0.22 },
  uFinDensity: { value: 1.0 },
  uDebug: { value: 0 },
  uBg: { value: null },
  uResolution: { value: new THREE.Vector2(1, 1) },
};

// ---------------------------------------------------------------------------- render targets
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
const envRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
const mainRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, samples: 4 });
shared.uBg.value = envRT.texture;
const post = createPost();
post.material.uniforms.uTex.value = mainRT.texture;

// ---------------------------------------------------------------------------- environment
const background = createBackground(shared);
const floor = createFloor(shared, -0.0034);
const followPos = new THREE.Vector3();
const followTarget = new THREE.Vector3();
const particles = createParticles(shared);
scene.add(background, floor, particles);
// lights are only used by the standard-PBR fallback materials of the glTF
const fbKey = new THREE.DirectionalLight(0xfff4e6, 3.2);
const fbHemi = new THREE.HemisphereLight(0x3a7a80, 0x0b1a1c, 1.4);
scene.add(fbKey, fbKey.target, fbHemi);

// background presets: natural underwater light, or a bright aquarium/light box like the reference photos
const ENV_PRESETS = {
  water: { deep: [0.004, 0.017, 0.021], up: [0.03, 0.085, 0.095], glow: [0.22, 0.38, 0.38], ambUp: [0.11, 0.2, 0.21], ambDown: [0.022, 0.045, 0.05], fog: [0.012, 0.038, 0.044], fogD: 1.1 },
  tank: { deep: [0.3, 0.335, 0.325], up: [0.6, 0.64, 0.62], glow: [0.22, 0.23, 0.22], ambUp: [0.46, 0.49, 0.48], ambDown: [0.26, 0.28, 0.27], fog: [0.46, 0.49, 0.48], fogD: 0.35 },
};
function applyEnv(name) {
  const e = ENV_PRESETS[name];
  shared.uWaterDeep.value.set(...e.deep);
  shared.uWaterUp.value.set(...e.up);
  shared.uSurfaceGlow.value.set(...e.glow);
  shared.uAmbUp.value.set(...e.ambUp);
  shared.uAmbDown.value.set(...e.ambDown);
  shared.uFogColor.value.set(...e.fog);
  shared.uFogDensity.value = e.fogD;
  floor.visible = name === 'water' && document.getElementById('floor').checked;
}

// ---------------------------------------------------------------------------- state
const state = {
  lightMode: 'front',
  azOffset: 0,
  elOffset: 0,
  intensity: 1,
  followCamera: true,
  custom: true,
};
const LIGHT_PRESETS = {
  front: { az: 28, el: 30 },
  back: { az: 13, el: 15 },
  side: { az: 90, el: 22 },
};
const fish = { root: null, body: null, eyes: [], fins: [], interiors: [], originals: new Map(), profile: null, frame: null, bones: {}, behavior: null };

// ---------------------------------------------------------------------------- loading
const loader = new GLTFLoader();
const progressEl = document.getElementById('progress');
const progressText = progressEl.querySelector('.msg');
const progressBar = progressEl.querySelector('.bar i');
function setProgress(text, frac) {
  progressText.textContent = text;
  if (frac !== undefined) progressBar.style.width = `${Math.round(frac * 100)}%`;
}

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
    if (total) onProgress(Math.min(1, loaded / total));
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// A .gltf whose buffer is a base64 data: URI is repacked into an in-memory GLB, because hosts with a
// strict Content-Security-Policy refuse fetch() of data: URIs (which GLTFLoader would otherwise do).
function toGLB(bytes) {
  if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const json = JSON.parse(new TextDecoder().decode(bytes));
  let bin = new Uint8Array(0);
  const b0 = json.buffers && json.buffers[0];
  if (b0 && typeof b0.uri === 'string' && b0.uri.startsWith('data:')) {
    const raw = atob(b0.uri.slice(b0.uri.indexOf(',') + 1));
    bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    delete b0.uri;
  }
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLen);
  out.set(enc, 20);
  if (bin.length) {
    dv.setUint32(20 + jsonLen, binLen, true); dv.setUint32(24 + jsonLen, 0x004e4942, true);
    out.set(bin, 28 + jsonLen);
  }
  return out.buffer;
}

async function loadModel(url) {
  const abs = new URL(url, location.href).href;
  const bytes = await fetchBytes(abs, (f) => setProgress(`モデルを読み込み中… ${Math.round(f * 100)}%`, f * 0.85));
  setProgress('テクスチャを展開中…', 0.9);
  const gltf = await loader.parseAsync(toGLB(bytes), new URL('.', abs).href);
  setProgress('シェーダーを準備中…', 0.97);
  await onLoaded(gltf);
}
loadModel(MODEL_URL).catch((err) => fail(`モデルを読み込めませんでした: ${err && err.message ? err.message : err}`));

async function onLoaded(gltf) {
  const parser = gltf.parser;
  const root = gltf.scene;
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
    if (o.isBone) fish.bones[o.name] = o;
  });
  for (const m of meshes) {
    m.layers.set(LAYER_FISH);
    m.frustumCulled = false; // skinned: bounds change with the animation
    fish.originals.set(m, m.material);
    const x = m.material.userData.mahaze || {};
    if (x.role === 'body') fish.body = m;
    else if (x.role === 'eye') fish.eyes.push(m);
    else if (x.role === 'fin') fish.fins.push({ mesh: m });
    else if (x.role === 'interior') fish.interiors.push(m);
  }
  if (!fish.body) throw new Error('Body mesh not found in glTF');

  // body
  const bx = fish.body.material.userData.mahaze;
  const pigment = await parser.getDependency('texture', bx.pigmentTexture);
  pigment.colorSpace = THREE.NoColorSpace;
  const capAlbedo = await parser.getDependency('texture', bx.snoutCap.albedoRoughness);
  const capPigment = await parser.getDependency('texture', bx.snoutCap.pigment);
  capAlbedo.colorSpace = THREE.SRGBColorSpace; // rgb decoded to linear on sampling; alpha (roughness) stays linear
  capPigment.colorSpace = THREE.NoColorSpace;
  fish.profile = bx.profile;
  fish.frame = bx.fishFrame;
  const orig = fish.body.material;
  const bodyMat = createBodyMaterial({
    textures: { albedo: orig.map, normal: orig.normalMap, orm: orig.roughnessMap || orig.aoMap, pigment, capAlbedo, capPigment },
    capRect: bx.snoutCap.rectMM,
    profileTexture: createProfileTexture(bx.profile),
    frame: bx.fishFrame,
    vertebrae: bx.vertebrae,
    shared,
  });
  fish.body.userData.custom = bodyMat;

  // eyes
  const eyeOrig = fish.eyes[0].material;
  const eyeMat = createEyeMaterial({ irisTexture: eyeOrig.map, params: eyeOrig.userData.mahaze, shared });
  for (const e of fish.eyes) e.userData.custom = eyeMat;

  // mouth / gill interiors
  const interiorMat = createInteriorMaterial({ shared });
  for (const m of fish.interiors) m.userData.custom = interiorMat;
  fish.interiorMat = interiorMat;

  // fins (two passes each, both skinned to the same skeleton)
  const finOrig = fish.fins[0].mesh.material;
  const finData = await parser.getDependency('texture', finOrig.userData.mahaze.dataTexture);
  finData.colorSpace = THREE.NoColorSpace;
  const finMats = createFinMaterials({ textures: { color: finOrig.map, data: finData, normal: finOrig.normalMap }, shared });
  for (const f of fish.fins) {
    const scatter = new THREE.SkinnedMesh(f.mesh.geometry, finMats.scatter);
    scatter.bind(f.mesh.skeleton, f.mesh.bindMatrix);
    // both passes share the fin's morph state (fold / flex / sculling wave)
    scatter.morphTargetInfluences = f.mesh.morphTargetInfluences;
    scatter.morphTargetDictionary = f.mesh.morphTargetDictionary;
    scatter.frustumCulled = false;
    scatter.layers.set(LAYER_FISH);
    scatter.layers.enable(LAYER_BEHIND);
    f.mesh.layers.enable(LAYER_BEHIND);
    scatter.name = `${f.mesh.name}_scatter`;
    f.mesh.parent.add(scatter);
    f.scatter = scatter;
    f.mesh.userData.custom = finMats.transmit;
    f.mesh.geometry.computeBoundingSphere();
    f.center = f.mesh.geometry.boundingSphere.center.clone();
  }

  scene.add(root);
  root.updateMatrixWorld(true);
  for (const bone of Object.values(fish.bones)) bone.userData.restObj = bone.getWorldPosition(new THREE.Vector3());
  fish.root = root;
  const rig = root.getObjectByName('Mahaze_Juvenile').userData.mahazeRig;
  // the sand is at the level of the pelvic disc: the goby rests on the bottom
  floor.position.y = rig.contactY;
  fish.behavior = createBehavior({
    root,
    bones: fish.bones,
    finMeshes: Object.fromEntries(fish.fins.map((f) => [f.mesh.name, f.mesh])),
    axes: rig.axes,
    contactY: rig.contactY,
    floorY: rig.contactY,
  });
  fish.behavior.setAuto(document.getElementById('auto').checked);
  applyMaterialMode();
  if (!userMovedCamera) setCameraPreset(currentPreset, true);
  progressEl.hidden = true;
  document.body.classList.add('ready');
  // debugging / automated capture: advance the behaviour without waiting for real time
  window.__mahaze = { fish, camera, controls, THREE, step: (sec) => { for (let t = 0; t < sec; t += 1 / 60) fish.behavior.update(1 / 60); } };
  window.__mahazeReady = true;
}

function applyMaterialMode() {
  if (!fish.body) return;
  const custom = state.custom;
  fish.body.material = custom ? fish.body.userData.custom : fish.originals.get(fish.body);
  for (const e of fish.eyes) e.material = custom ? e.userData.custom : fish.originals.get(e);
  for (const m of fish.interiors) m.material = custom ? m.userData.custom : fish.originals.get(m);
  for (const f of fish.fins) {
    f.mesh.material = custom ? f.mesh.userData.custom : fish.originals.get(f.mesh);
    f.scatter.visible = custom;
  }
  fbKey.visible = fbHemi.visible = !custom;
}

// ---------------------------------------------------------------------------- camera presets
// radius: half-size (m) of the part that must stay in view
const PRESETS = {
  whole: { target: [0, 0.0005, 0.0], pos: [0.082, 0.024, 0.036], radius: 0.029 },
  head: { target: [0.0005, 0.0012, 0.0185], pos: [0.022, 0.011, 0.034], radius: 0.0085 },
  tail: { target: [0, 0.0003, -0.017], pos: [0.028, 0.006, -0.008], radius: 0.012 },
  below: { target: [0, -0.0008, 0.012], pos: [0.02, -0.0012, 0.06], radius: 0.02 },
};
let camTween = null;
let userMovedCamera = false;
const initialPreset = params.get('view') || 'whole';
controls.addEventListener('start', () => { userMovedCamera = true; camTween = null; });

// the free (unobstructed) part of the canvas, in CSS px
const view = { w: 1, h: 1, ox: 0, oy: 0 };
function measureFreeArea() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const panel = document.querySelector('.panel');
  let ox = 0, oy = 0;
  if (panel && !document.body.classList.contains('panel-hidden')) {
    const r = panel.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      if (r.width > w * 0.6) oy = Math.min(h * 0.6, h - r.top + 8); // bottom sheet (narrow screens)
      else if (r.left < w * 0.3) ox = Math.min(w * 0.6, r.right + 8); // side panel
    }
  }
  Object.assign(view, { w, h, ox, oy });
}
function applyViewOffset() {
  const { w, h, ox, oy } = view;
  camera.aspect = (w + ox) / (h + oy);
  if (ox || oy) camera.setViewOffset(w + ox, h + oy, 0, oy, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
// distance at which a sphere of radius r fits inside the free area
function fitDistance(r) {
  const { w, h, ox, oy } = view;
  const fpx = ((h + oy) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const half = Math.min(Math.atan(((w - ox) / 2) / fpx), Math.atan(((h - oy) / 2) / fpx));
  return (r * 1.12) / Math.sin(half);
}

let currentPreset = initialPreset;
function setCameraPreset(name, instant = false) {
  const p = PRESETS[name] || PRESETS.whole;
  currentPreset = PRESETS[name] ? name : 'whole';
  userMovedCamera = false;
  // presets are authored in the fish frame; follow the fish wherever it has swum
  const toWorld = (v) => (fish.root ? fish.root.localToWorld(v) : v);
  const target = toWorld(new THREE.Vector3(...p.target));
  const off = toWorld(new THREE.Vector3(...p.pos)).sub(target);
  off.setLength(Math.min(controls.maxDistance, Math.max(off.length(), fitDistance(p.radius))));
  const to = { target, pos: target.clone().add(off) };
  if (instant) {
    controls.target.copy(to.target);
    camera.position.copy(to.pos);
    controls.update();
    return;
  }
  camTween = { from: { target: controls.target.clone(), pos: camera.position.clone() }, to, t: 0 };
}

// ---------------------------------------------------------------------------- light
const tmp = { toCam: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), base: new THREE.Vector3() };
function updateLight() {
  if (!state.followCamera) return;
  const { toCam, right, up, base } = tmp;
  toCam.copy(camera.position).sub(controls.target).normalize();
  right.crossVectors(new THREE.Vector3(0, 1, 0), toCam);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  up.crossVectors(toCam, right).normalize();
  const pr = LIGHT_PRESETS[state.lightMode];
  if (state.lightMode === 'back') base.copy(toCam).negate();
  else if (state.lightMode === 'side') base.copy(right);
  else base.copy(toCam);
  const baseRight = state.lightMode === 'side' ? toCam.clone().negate() : right;
  const az = THREE.MathUtils.degToRad((state.lightMode === 'side' ? 0 : pr.az) + state.azOffset);
  const el = THREE.MathUtils.degToRad(pr.el + state.elOffset);
  const d = shared.uLightDir.value;
  d.copy(base).multiplyScalar(Math.cos(el) * Math.cos(az))
    .addScaledVector(baseRight, Math.cos(el) * Math.sin(az))
    .addScaledVector(up, Math.sin(el))
    .normalize();
  // keep the key light from coming straight from below the sea floor
  if (d.y < -0.35) { d.y = -0.35; d.normalize(); }
}

// ---------------------------------------------------------------------------- per-frame helpers
const _v = new THREE.Vector3();
function sortFins() {
  const list = fish.fins.map((f) => ({ f, d: _v.copy(f.center).applyMatrix4(f.mesh.matrixWorld).distanceToSquared(camera.position) }));
  list.sort((a, b) => b.d - a.d);
  list.forEach(({ f }, i) => {
    f.mesh.renderOrder = 100 + i * 2;
    f.scatter.renderOrder = 101 + i * 2;
  });
}

// soft shadow capsule chain along the (animated) spine
const SHADOW_CHAIN = [['J_head', 3.0], ['J_head', 8.0], ['J_root', 13.0], ['J_sp1', 17.0], ['J_sp3', 25.0], ['J_sp5', 33.0], ['J_sp7', 40.0], ['J_caudal2', 46.5]];
const _bv = new THREE.Vector3();
function updateFloorShadow() {
  if (!fish.profile) return;
  const P = fish.profile, F = fish.frame;
  const arr = floor.material.uniforms.uShadow.value;
  SHADOW_CHAIN.forEach(([boneName, s], i) => {
    const bone = fish.bones[boneName];
    const k = Math.min(P.n - 1, Math.round((Math.min(s, F.SEND) / F.SEND) * (P.n - 1)));
    const [yc, t, b, w] = P.data.slice(k * 6, k * 6 + 4);
    const r = s > F.SEND ? 1.6 : Math.max(0.6, (t + b + 2 * w) * 0.25);
    // axis point at s in the rest pose, re-expressed in the bone's frame, then carried by the animated bone
    _bv.set(0, (yc - F.Y0) * 0.001, (F.S0 - Math.min(s, F.SEND + 3)) * 0.001).sub(bone.userData.restObj);
    bone.localToWorld(_bv);
    arr[i].set(_bv.x, _bv.y, _bv.z, r * 0.001 * (s > F.SEND ? 0.5 : 1));
  });
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  const bw = Math.max(1, Math.floor(w * pixelRatio)), bh = Math.max(1, Math.floor(h * pixelRatio));
  envRT.setSize(bw, bh);
  mainRT.setSize(bw, bh);
  shared.uResolution.value.set(bw, bh);
  post.material.uniforms.uRes.value.set(bw, bh);
  measureFreeArea();
  applyViewOffset();
  particles.material.uniforms.uPxScale.value = bh * camera.projectionMatrix.elements[5] * 0.5;
  // keep a preset view framed when the viewport changes, unless the user has moved the camera
  if (!userMovedCamera && !camTween) setCameraPreset(currentPreset, true);
}
window.addEventListener('resize', resize);
// narrow screens start with the panel folded so the fish is not hidden behind it
if (window.innerWidth < 720 && !params.has('panel')) document.body.classList.add('panel-hidden');
resize();

// ---------------------------------------------------------------------------- loop
const timer = new THREE.Timer();
let frozenTime = params.has('t') ? Number(params.get('t')) : null;
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  shared.uTime.value = frozenTime ?? shared.uTime.value + dt;
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 0.9);
    const e = camTween.t < 0.5 ? 4 * camTween.t ** 3 : 1 - (-2 * camTween.t + 2) ** 3 / 2;
    controls.target.lerpVectors(camTween.from.target, camTween.to.target, e);
    camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, e);
    if (camTween.t >= 1) camTween = null;
  }
  if (fish.behavior) {
    fish.behavior.update(dt);
    fish.root.updateMatrixWorld(true);
    fish.interiorMat.uniforms.uMouthOpen.value = fish.behavior.state.mouthOpen || 0;
    fish.interiorMat.uniforms.uGillOpen.value = fish.behavior.state.gillOpen || 0;
    if (document.getElementById('follow-fish').checked) {
      // spring-damped follow: the camera trails a dart slightly instead of being welded to the fish
      followTarget.copy(fish.behavior.anchor());
      followTarget.y = 0;
      const k = 1 - Math.exp(-dt * 5);
      const delta = followPos.clone().lerp(followTarget, k).sub(followPos);
      followPos.add(delta);
      controls.target.add(delta);
      camera.position.add(delta);
      if (camTween) { camTween.from.target.add(delta); camTween.from.pos.add(delta); camTween.to.target.add(delta); camTween.to.pos.add(delta); }
    } else followPos.copy(fish.behavior.anchor()).setY(0);
  }
  controls.update();
  updateLight();
  fbKey.position.copy(shared.uLightDir.value).multiplyScalar(0.3);
  if (fish.root) {
    sortFins();
    updateFloorShadow();
  }
  renderScene();
  requestAnimationFrame(frame);
}

function renderScene() {
  camera.layers.set(0);
  if (state.custom) camera.layers.enable(LAYER_BEHIND);
  renderer.setRenderTarget(envRT);
  renderer.render(scene, camera);
  camera.layers.set(0);
  camera.layers.enable(LAYER_FISH);
  renderer.setRenderTarget(mainRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(post.scene, post.camera);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------- UI
function bindSeg(id, onPick) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    for (const x of el.querySelectorAll('button')) x.classList.toggle('on', x === b);
    onPick(b.dataset.v);
  });
}
function bindRange(id, fn) {
  const el = document.getElementById(id);
  const out = document.querySelector(`output[for="${id}"]`);
  const upd = () => { const v = Number(el.value); fn(v); if (out) out.textContent = el.dataset.fmt ? el.dataset.fmt.replace('#', v) : v; };
  el.addEventListener('input', upd);
  upd();
}
bindSeg('light-mode', (v) => { state.lightMode = v; });
bindSeg('cam-preset', (v) => setCameraPreset(v));
bindSeg('shading', (v) => { state.custom = v === 'custom'; if (fish.body) applyMaterialMode(); });
bindSeg('debug', (v) => { shared.uDebug.value = Number(v); });
let envName = 'water';
bindSeg('env', (v) => { envName = v; applyEnv(v); });
bindRange('light-az', (v) => { state.azOffset = v; });
bindRange('light-el', (v) => { state.elOffset = v; });
bindRange('light-int', (v) => {
  state.intensity = v;
  shared.uLightColor.value.set(3.2, 3.05, 2.8).multiplyScalar(v);
  fbKey.intensity = 3.2 * v;
});
bindRange('scatter', (v) => { shared.uScatter.value = v; });
bindRange('interior', (v) => { shared.uInterior.value = v; });
bindRange('exposure', (v) => { post.material.uniforms.uExposure.value = v; });
document.getElementById('auto').addEventListener('change', (e) => fish.behavior?.setAuto(e.target.checked));
document.getElementById('freeze').addEventListener('change', (e) => fish.behavior?.setPaused(e.target.checked));
document.getElementById('act-swim').addEventListener('click', () => fish.behavior?.dart());
document.getElementById('act-yawn').addEventListener('click', () => fish.behavior?.yawn());
document.getElementById('act-flick').addEventListener('click', () => fish.behavior?.flick());
document.getElementById('floor').addEventListener('change', (e) => { floor.visible = e.target.checked && envName === 'water'; });
document.getElementById('snow').addEventListener('change', (e) => { particles.visible = e.target.checked; });
document.getElementById('autorot').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; controls.autoRotateSpeed = 0.8; });
document.getElementById('follow').addEventListener('change', (e) => { state.followCamera = e.target.checked; });
document.getElementById('quality').addEventListener('change', (e) => { pixelRatio = Math.min(window.devicePixelRatio || 1, Number(e.target.value)); resize(); });
document.getElementById('toggle-panel').addEventListener('click', () => {
  document.body.classList.toggle('panel-hidden');
  measureFreeArea();
  applyViewOffset();
  particles.material.uniforms.uPxScale.value = shared.uResolution.value.y * camera.projectionMatrix.elements[5] * 0.5;
  if (!userMovedCamera) setCameraPreset(currentPreset, !!camTween);
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const pick = (group, v) => document.querySelector(`#${group} button[data-v="${v}"]`)?.click();
  if (e.key === 'f') pick('light-mode', 'front');
  if (e.key === 'b') pick('light-mode', 'back');
  if (e.key === 's') pick('light-mode', 'side');
  if (e.key === '1') pick('cam-preset', 'whole');
  if (e.key === '2') pick('cam-preset', 'head');
  if (e.key === '3') pick('cam-preset', 'tail');
  if (e.key === 'y') fish.behavior?.yawn();
  if (e.key === 'w') fish.behavior?.dart();
  if (e.key === 'd') fish.behavior?.flick();
});

// URL parameters for reproducible views (?light=back&view=tail&debug=1)
if (params.get('light')) document.querySelector(`#light-mode button[data-v="${params.get('light')}"]`)?.click();
if (params.get('debug')) document.querySelector(`#debug button[data-v="${params.get('debug')}"]`)?.click();
if (params.get('shading')) document.querySelector(`#shading button[data-v="${params.get('shading')}"]`)?.click();
if (params.get('env')) document.querySelector(`#env button[data-v="${params.get('env')}"]`)?.click();
if (params.get('floor') === '0') { document.getElementById('floor').checked = false; floor.visible = false; }
if (params.get('anim')) {
  // anim=yawn:1.0 | swim:0.1 | freeze  → reproducible stills
  const [name, t] = params.get('anim').split(':');
  const wait = setInterval(() => {
    if (!window.__mahazeReady) return;
    clearInterval(wait);
    fish.behavior.pose(name === 'freeze' ? 'perch' : name, Number(t) || 0);
    document.getElementById('freeze').checked = true;
  }, 50);
}
if (params.get('cam')) {
  // cam=px,py,pz,tx,ty,tz (metres)
  const c = params.get('cam').split(',').map(Number);
  const wait = setInterval(() => {
    if (window.__mahazeReady) { clearInterval(wait); userMovedCamera = true; camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); controls.update(); }
  }, 50);
}

function fail(msg) {
  msg = String(msg);
  if (msg.length > 240) msg = `${msg.slice(0, 240)}…`;
  const el = document.getElementById('progress');
  if (el) {
    el.hidden = false;
    el.classList.add('error');
    el.querySelector('.msg').textContent = msg;
  }
  console.error(msg);
}
