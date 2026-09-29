import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBodyMaterial, createProfileTexture } from './materials/BodyMaterial.js';
import { createFinMaterials } from './materials/FinMaterial.js';
import { createEyeMaterial } from './materials/EyeMaterial.js';
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
const floor = createFloor(shared, -0.0105);
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
const fish = { root: null, body: null, eyes: [], fins: [], originals: new Map(), profile: null, frame: null };

// ---------------------------------------------------------------------------- loading
const loader = new GLTFLoader();
const progressEl = document.getElementById('progress');
loader.load(MODEL_URL, (gltf) => onLoaded(gltf).catch((e) => fail(e.message || String(e))), (ev) => {
  if (ev.total) progressEl.textContent = `モデル読み込み中… ${Math.round((ev.loaded / ev.total) * 100)}%`;
}, (err) => fail(`モデルを読み込めません: ${err.message || err}. ローカルサーバー経由で開いてください (npm run serve)。`));

async function onLoaded(gltf) {
  const parser = gltf.parser;
  const root = gltf.scene;
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    m.layers.set(LAYER_FISH);
    fish.originals.set(m, m.material);
    const x = m.material.userData.mahaze || {};
    if (x.role === 'body') fish.body = m;
    else if (x.role === 'eye') fish.eyes.push(m);
    else if (x.role === 'fin') fish.fins.push({ mesh: m });
  }
  if (!fish.body) throw new Error('Body mesh not found in glTF');

  // body
  const bx = fish.body.material.userData.mahaze;
  const pigment = await parser.getDependency('texture', bx.pigmentTexture);
  pigment.colorSpace = THREE.NoColorSpace;
  fish.profile = bx.profile;
  fish.frame = bx.fishFrame;
  const orig = fish.body.material;
  const bodyMat = createBodyMaterial({
    textures: { albedo: orig.map, normal: orig.normalMap, orm: orig.roughnessMap || orig.aoMap, pigment },
    profileTexture: createProfileTexture(bx.profile),
    frame: bx.fishFrame,
    vertebrae: bx.vertebrae,
    shared,
  });
  fish.body.userData.custom = bodyMat;
  fish.body.onBeforeRender = () => {
    if (fish.body.material === bodyMat) bodyMat.uniforms.uInvModel.value.copy(fish.body.matrixWorld).invert();
  };

  // eyes
  const eyeOrig = fish.eyes[0].material;
  const eyeMat = createEyeMaterial({ irisTexture: eyeOrig.map, params: eyeOrig.userData.mahaze, shared });
  for (const e of fish.eyes) e.userData.custom = eyeMat;

  // fins (two passes each)
  const finOrig = fish.fins[0].mesh.material;
  const finData = await parser.getDependency('texture', finOrig.userData.mahaze.dataTexture);
  finData.colorSpace = THREE.NoColorSpace;
  const finMats = createFinMaterials({ textures: { color: finOrig.map, data: finData, normal: finOrig.normalMap }, shared });
  for (const f of fish.fins) {
    const scatter = new THREE.Mesh(f.mesh.geometry, finMats.scatter);
    scatter.layers.set(LAYER_FISH);
    scatter.layers.enable(LAYER_BEHIND);
    f.mesh.layers.enable(LAYER_BEHIND);
    scatter.name = `${f.mesh.name}_scatter`;
    f.mesh.add(scatter);
    f.scatter = scatter;
    f.mesh.userData.custom = finMats.transmit;
    f.mesh.geometry.computeBoundingSphere();
    f.center = f.mesh.geometry.boundingSphere.center.clone();
  }

  scene.add(root);
  fish.root = root;
  applyMaterialMode();
  setCameraPreset('whole', true);
  progressEl.remove();
  document.body.classList.add('ready');
  window.__mahazeReady = true;
}

function applyMaterialMode() {
  const custom = state.custom;
  fish.body.material = custom ? fish.body.userData.custom : fish.originals.get(fish.body);
  for (const e of fish.eyes) e.material = custom ? e.userData.custom : fish.originals.get(e);
  for (const f of fish.fins) {
    f.mesh.material = custom ? f.mesh.userData.custom : fish.originals.get(f.mesh);
    f.scatter.visible = custom;
  }
  fbKey.visible = fbHemi.visible = !custom;
}

// ---------------------------------------------------------------------------- camera presets
const PRESETS = {
  whole: { target: [0, 0.0005, 0.0], pos: [0.082, 0.024, 0.036] },
  head: { target: [0.0005, 0.0012, 0.0185], pos: [0.022, 0.011, 0.034] },
  tail: { target: [0, 0.0003, -0.017], pos: [0.028, 0.006, -0.008] },
  below: { target: [0, -0.001, 0.004], pos: [0.045, -0.03, 0.03] },
};
let camTween = null;
function setCameraPreset(name, instant = false) {
  const p = PRESETS[name];
  const to = { target: new THREE.Vector3(...p.target), pos: new THREE.Vector3(...p.pos) };
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

const shadowS = [3.5, 8.5, 13.5, 19, 25, 31, 37, 45];
function updateFloorShadow() {
  if (!fish.profile) return;
  const P = fish.profile, F = fish.frame;
  const arr = floor.material.uniforms.uShadow.value;
  shadowS.forEach((s, i) => {
    const k = Math.min(P.n - 1, Math.round((Math.min(s, F.SEND) / F.SEND) * (P.n - 1)));
    const [yc, t, b, w] = P.data.slice(k * 6, k * 6 + 4);
    let r = s > F.SEND ? 1.6 : Math.max(0.6, (t + b + 2 * w) * 0.25);
    const obj = new THREE.Vector3(0, (yc - F.Y0) * 0.001, (F.S0 - Math.min(s, F.SEND + 3)) * 0.001);
    obj.applyMatrix4(fish.body.matrixWorld);
    arr[i].set(obj.x, obj.y, obj.z, r * 0.001 * (s > F.SEND ? 0.5 : 1));
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
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  particles.material.uniforms.uPxScale.value = bh * camera.projectionMatrix.elements[5] * 0.5;
}
window.addEventListener('resize', resize);
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
  controls.update();
  updateLight();
  fbKey.position.copy(shared.uLightDir.value).multiplyScalar(0.3);
  if (fish.root) {
    fish.root.updateMatrixWorld();
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
document.getElementById('floor').addEventListener('change', (e) => { floor.visible = e.target.checked && envName === 'water'; });
document.getElementById('snow').addEventListener('change', (e) => { particles.visible = e.target.checked; });
document.getElementById('autorot').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; controls.autoRotateSpeed = 0.8; });
document.getElementById('follow').addEventListener('change', (e) => { state.followCamera = e.target.checked; });
document.getElementById('quality').addEventListener('change', (e) => { pixelRatio = Math.min(window.devicePixelRatio || 1, Number(e.target.value)); resize(); });
document.getElementById('toggle-panel').addEventListener('click', () => document.body.classList.toggle('panel-hidden'));
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const pick = (group, v) => document.querySelector(`#${group} button[data-v="${v}"]`)?.click();
  if (e.key === 'f') pick('light-mode', 'front');
  if (e.key === 'b') pick('light-mode', 'back');
  if (e.key === 's') pick('light-mode', 'side');
  if (e.key === '1') pick('cam-preset', 'whole');
  if (e.key === '2') pick('cam-preset', 'head');
  if (e.key === '3') pick('cam-preset', 'tail');
});

// URL parameters for reproducible views (?light=back&view=tail&debug=1)
if (params.get('light')) document.querySelector(`#light-mode button[data-v="${params.get('light')}"]`)?.click();
if (params.get('debug')) document.querySelector(`#debug button[data-v="${params.get('debug')}"]`)?.click();
if (params.get('shading')) document.querySelector(`#shading button[data-v="${params.get('shading')}"]`)?.click();
if (params.get('env')) document.querySelector(`#env button[data-v="${params.get('env')}"]`)?.click();
if (params.get('floor') === '0') { document.getElementById('floor').checked = false; floor.visible = false; }
const initialView = params.get('view');
if (initialView) {
  const wait = setInterval(() => { if (window.__mahazeReady) { clearInterval(wait); setCameraPreset(initialView, true); } }, 50);
}
if (params.get('cam')) {
  // cam=px,py,pz,tx,ty,tz (metres)
  const c = params.get('cam').split(',').map(Number);
  const wait = setInterval(() => {
    if (window.__mahazeReady) { clearInterval(wait); camera.position.set(c[0], c[1], c[2]); controls.target.set(c[3], c[4], c[5]); controls.update(); }
  }, 50);
}

function fail(msg) {
  const el = document.getElementById('progress');
  if (el) { el.textContent = msg; el.classList.add('error'); }
  console.error(msg);
}
