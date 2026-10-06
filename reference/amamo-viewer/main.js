// アマモ viewer: a single plant, a pioneer clump, sparse and dense patches and a whole meadow edge on a sand bed, under
// the game's own screen-space water, with the tide, the current and the waves on sliders. ?capture hides the panel and
// exposes window.__amamo for scripted renders (tools/models/amamo/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { AmamoKit, AmamoPatch, ShootGrid } from '../../src/world/amamo/index.ts';
import { WaterPass, makeSpillTexture } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 400);
camera.position.set(2.2, 1.3, 3.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;

// ---------------------------------------------------------------- the bed: grey sand with a little relief
const HALF = 20, N = 161;
const heightAt = (x, z) => 0.012 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.006 * Math.sin(x * 2.3 + z * 1.7);
const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 200, 200);
bedGeo.rotateX(-Math.PI / 2);
{
  const p = bedGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  bedGeo.computeVertexNormals();
}
const sandTex = (() => {
  const S = 256, data = new Uint8Array(S * S * 4);
  let a = 9;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < S * S; i++) { const v = 150 + rnd() * 40 - 20; data[i * 4] = v; data[i * 4 + 1] = v * 0.99; data[i * 4 + 2] = v * 0.95; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(160, 160); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
})();
const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ map: sandTex, color: new THREE.Color(0.62, 0.61, 0.58), roughness: 0.95 }));
bed.receiveShadow = true;
scene.add(bed);

// ---------------------------------------------------------------- sky, sun, environment
const skyScene = new THREE.Scene();
const sky = new Sky();
sky.scale.setScalar(1000);
skyScene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
const sunDir = new THREE.Vector3();
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x88aabb, 0x44392c, 0.3);
scene.add(hemi);
const pmrem = new THREE.PMREMGenerator(renderer);
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT);
let envTex = null;
function setSun(elev, azim) {
  const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim);
  sunDir.setFromSphericalCoords(1, phi, theta);
  su.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(20);
  cubeCam.update(renderer, skyScene);
  envTex?.dispose();
  envTex = pmrem.fromScene(skyScene).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.08;
}
const fogColor = new THREE.Color(0.75, 0.82, 0.86);
scene.background = fogColor;

// ---------------------------------------------------------------- the game's water over the bed
const hData = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hData[j * N + i] = heightAt(-HALF + (i / (N - 1)) * 2 * HALF, -HALF + (j / (N - 1)) * 2 * HALF);
const heightTexture = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.FloatType);
heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
const fakeTerrain = { heightTexture, spillTexture: makeSpillTexture(new Float32Array(N * N).fill(-1e3), N), half: HALF };
const waves = createWaves({ windDir: 0.7, depth: 0.6, seed: 11 });
const water = new WaterPass(fakeTerrain, waves);
water.setPolarized(true);
const underFog = new THREE.FogExp2(0x30473a, 0.45);

// ---------------------------------------------------------------- the eelgrass
const kit = new AmamoKit();
// the bed stands for ground at about T.P. -1.4 m (leaves ~60 cm)
const ground = { heightAt, poolAt: () => -1e3 };
const lengthAt = () => 0.6;
let patches = [];
function hole(x, z) {
  // bare holes and a ragged edge in the meadow (value noise)
  const n = Math.sin(x * 1.3 + 1.7) * Math.cos(z * 1.1 - 0.4) + 0.6 * Math.sin(x * 2.7 - z * 2.1 + 3.1) * Math.cos(z * 3.3 + x * 0.6);
  return n;
}
function build(kind) {
  for (const p of patches) p.dispose();
  patches = [];
  const grid = new ShootGrid();
  const add = (o) => { const p = new AmamoPatch({ kit, ground, grid, lengthAt, ...o }); scene.add(p); patches.push(p); };
  if (kind === 'single') add({ x: 0, z: 0, radius: 0.1, density: 1, kind: 'single', seed: 7, exposeRhizome: true, vigour: 1.25 });
  else if (kind === 'clump') add({ x: 0, z: 0, radius: 0.55, density: 45, kind: 'pioneer', seed: 21 });
  else if (kind === 'sparse') add({ x: 0, z: 0, radius: 2.0, density: 26, kind: 'sparse', seed: 33 });
  else if (kind === 'dense') add({ x: 0, z: 0, radius: 2.4, density: 95, kind: 'dense', seed: 45 });
  else {
    // a meadow edge: dense clones toward -x, sparse ones and pioneer clumps over bare sand toward +x
    const g2 = { ...ground, accept: (x, z) => hole(x, z) > -0.95 };
    const mk = (o) => { const p = new AmamoPatch({ kit, ground: g2, grid, lengthAt, ...o }); scene.add(p); patches.push(p); };
    let s = 100;
    for (const [x, z, r] of [[-3.2, -1.5, 2.6], [-3.6, 2.0, 2.4], [-1.2, 0.4, 2.2], [-5.5, 0.2, 2.6], [-1.6, -3.6, 2.0], [-1.8, 3.6, 2.0]]) mk({ x, z, radius: r, density: 95, kind: 'dense', seed: s++ });
    for (const [x, z, r] of [[1.6, -1.2, 1.6], [1.2, 2.4, 1.4], [2.8, 0.8, 1.2]]) mk({ x, z, radius: r, density: 26, kind: 'sparse', seed: s++ });
    for (const [x, z] of [[3.6, -2.6], [4.2, 1.9], [3.0, 3.9], [5.2, -0.3], [2.6, -3.9]]) mk({ x, z, radius: 0.45, density: 45, kind: 'pioneer', seed: s++ });
  }
  applyLod();
  updateInfo();
}

// ---------------------------------------------------------------- state and panel
const state = { kind: params.get('kind') ?? 'dense', depth: 1.2, current: 0.06, wave: 0.12, speed: 1, lod: 'auto', time: 0 };
const TIDES = { 満潮: 1.4, 浅水: 0.3, 干潮: -0.08 };
const KINDS = { single: '1 株', clump: '小株', sparse: '疎', dense: '密', meadow: '群落の縁' };
function seg(id, entries, get, set) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const [k, label] of entries) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = get() === k ? 'on' : '';
    b.onclick = () => { set(k); seg(id, entries, get, set); };
    el.appendChild(b);
  }
}
function slider(id, key, fmt) {
  const el = document.getElementById(id), out = document.getElementById(id + 'V');
  el.value = state[key];
  out.textContent = fmt(state[key]);
  el.oninput = () => { state[key] = Number(el.value); out.textContent = fmt(state[key]); if (key === 'depth') seg('tides', Object.entries(TIDES).map(([k]) => [k, k]), () => '', setTide); };
}
const setTide = (k) => { state.depth = TIDES[k]; slider('depth', 'depth', (v) => `${v.toFixed(2)}m`); };
seg('kinds', Object.entries(KINDS), () => state.kind, (k) => { state.kind = k; build(k); });
seg('tides', Object.entries(TIDES).map(([k]) => [k, k]), () => '', setTide);
seg('lods', [['auto', '自動'], ['0', '0'], ['1', '1'], ['2', '2']], () => String(state.lod), (k) => { state.lod = k === 'auto' ? 'auto' : Number(k); applyLod(); });
slider('depth', 'depth', (v) => `${v.toFixed(2)}m`);
slider('current', 'current', (v) => `${v.toFixed(2)}`);
slider('wave', 'wave', (v) => `${v.toFixed(2)}`);
slider('speed', 'speed', (v) => `${v.toFixed(2)}`);

function applyLod() {
  for (const p of patches) {
    let lod = state.lod;
    if (lod === 'auto') {
      const d = Math.max(0, Math.hypot(p.cx - camera.position.x, p.cz - camera.position.z) - p.reach);
      lod = d < 8 ? 0 : d < 22 ? 1 : 2;
    }
    p.setLod(lod, 1, 0);
  }
}
function updateInfo() {
  const shoots = patches.reduce((s, p) => s + p.shootCount, 0);
  const verts = patches.reduce((s, p) => s + p.drawnVertices, 0);
  document.getElementById('info').textContent = `株 ${shoots}  パッチ ${patches.length}\n葉の頂点 ${verts.toLocaleString()}`;
}

// ---------------------------------------------------------------- render
let rt = null;
function target() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rt || rt.width !== s.x || rt.height !== s.y) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(s.x, s.y, THREE.FloatType);
  }
  return rt;
}
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
setSun(Number(params.get('elev') ?? 48), Number(params.get('azim') ?? 200));
build(state.kind);

const sunCol = new THREE.Vector3();
function renderFrame(dt) {
  state.time += dt * state.speed;
  const u = kit.uniforms;
  u.uAmTime.value = state.time;
  u.uAmWater.value = state.depth;
  u.uAmCurrent.value.set(0, state.current);
  u.uAmWave.value.set(Math.cos(0.7), Math.sin(0.7), state.wave, 0.6);
  u.uAmSeaward.value.set(0, 1);
  water.setLevel(state.depth);
  sunCol.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  water.update(0, { sunUp: 1, sunDir, sunCol, ambient: 0.45, fogColor, fogDensity: 0.004, env: cubeRT.texture, day: 1 });
  water.uniforms.uTime.value = state.time;
  const under = camera.position.y < state.depth;
  scene.fog = under ? underFog : null;
  scene.background = under ? underFog.color : fogColor;
  const r = target();
  renderer.setRenderTarget(r);
  renderer.render(scene, camera);
  water.render(renderer, r, null, camera);
  renderer.setRenderTarget(null);
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  controls.update();
  if (state.lod === 'auto') applyLod();
  renderFrame(dt);
  requestAnimationFrame(loop);
}
if (!capture) requestAnimationFrame(loop);

// ---------------------------------------------------------------- scripted renders
window.__amamo = {
  kit, patches: () => patches,
  set(o) {
    if (o.kind && o.kind !== state.kind) { state.kind = o.kind; build(o.kind); }
    for (const k of ['depth', 'current', 'wave', 'time']) if (o[k] !== undefined) state[k] = o[k];
    if (o.lod !== undefined) state.lod = o.lod;
    if (o.sun) setSun(o.sun[0], o.sun[1]);
    if (o.cam) { camera.position.fromArray(o.cam); controls.target.fromArray(o.target ?? [0, 0.15, 0]); camera.lookAt(controls.target); }
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    applyLod();
    const t0 = performance.now();
    renderFrame(0);
    updateInfo();
    return { ms: Math.round(performance.now() - t0), shoots: patches.reduce((s, p) => s + p.shootCount, 0), verts: patches.reduce((s, p) => s + p.drawnVertices, 0) };
  },
};
