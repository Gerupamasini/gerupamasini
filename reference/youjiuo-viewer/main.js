// ヨウジウオ viewer: studio views of one fish (side / top / head / front, any tier, lit like the reference photographs
// of fish in clear cases), a dark aquarium among a few eelgrass shoots (like the photographs of fish in a tank with
// eelgrass), and an eelgrass meadow under the game's own screen-space water with several fish, all driven by the
// game's YoujiuoDriver with a stand-in brain. ?capture hides the panel and exposes window.__yj for scripted renders
// (tools/models/youjiuo/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { AmamoKit, AmamoPatch, ShootGrid } from '../../src/world/amamo/index.ts';
import { WaterPass, makeSpillTexture } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
import { YoujiuoDriver } from '../../src/creatures/species/youjiuo/YoujiuoDriver.ts';
import { GOLDEN_MORPH, SILVER_MORPH, YJ_UNIFORMS } from '../../src/creatures/species/youjiuo/materials.ts';
import { Rng } from '../../src/core/Rng.ts';

const params = new URLSearchParams(location.search);
window.THREE = THREE;
import * as AMAMO from '../../src/world/amamo/index.ts';
window.AMAMO = AMAMO;
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const camera = new THREE.PerspectiveCamera(35, 1, 0.003, 300);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const species = { id: 'syngnathus_schlegeli', model: { modelLength_mm: 200, driver: 'youjiuo' }, brain: { params: {} } };
function individual(i, x, z, len = 190) {
  return {
    id: `syngnathus_schlegeli#${(0x2000 + i * 7).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: (i * 2.1) % 6.28,
    length_mm: len, weight_g: 3, sex: 'm', stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(4321 + i * 77), cell: 3, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

const state = { scene: params.get('scene') ?? (capture ? 'side' : 'meadow'), lod: 'auto', time: 0, depth: 0.85, brain: true };
let scene = null, fishes = [], floor = null, water = null, rt = null, kit = null, patches = [], sun = null, envTex = null, waterOn = false;
const sunDir = new THREE.Vector3(), sunCol = new THREE.Vector3();
let fogColor = new THREE.Color(0.75, 0.82, 0.86);
const underFog = new THREE.FogExp2(0x2c4a44, 0.5);
let brainRng = new Rng(77);

function clear() {
  for (const f of fishes) f.driver.dispose();
  fishes = [];
  for (const p of patches) p.dispose();
  patches = [];
  scene = new THREE.Scene();
  waterOn = false;
  YJ_UNIFORMS.uYjAir.value = 0;
  YJ_UNIFORMS.uYjCaustic.value = 0.5;
  YJ_UNIFORMS.uYjSkyGain.value = 0.35;
  YJ_UNIFORMS.uYjWater.value.set(0.085, 0.15, 0.145);
}

/** the eelgrass the fish see (the game's MeadowProbe over the viewer's patches) */
const probe = {
  get kit() { return kit; },
  coverAt(x, z) {
    let c = 0;
    for (const p of patches) { const d = Math.hypot(p.cx - x, p.cz - z); if (d < p.reach * 0.95) c = Math.max(c, Math.min(1, p.shootCount / (Math.PI * p.reach * p.reach) / 85)); }
    return c;
  },
  shootsNear(x, z, r, max = 24) {
    const out = [];
    for (const p of patches) {
      if (Math.hypot(p.cx - x, p.cz - z) > r + p.reach + 0.05) continue;
      for (const s of p.shoots) { const d = Math.hypot(s.x - x, s.z - z); if (d <= r) out.push([d, s]); }
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, max).map((o) => o[1]);
  },
};

function addFish(i, x, z, len, intent) {
  const root = new THREE.Group();
  scene.add(root);
  const d = new YoujiuoDriver();
  const ind = individual(i, x, z, len);
  d.attach(root, ind);
  d.update(0.001, ctx());
  if (intent) d.setIntent(intent);
  fishes.push({ driver: d, ind, root });
  return d;
}

function ctx() {
  return { floor, player: new THREE.Vector3(camera.position.x + 30, 0, camera.position.z + 30), simScale: 1, nowMs: state.time * 1000 };
}

// ---------------------------------------------------------------- studio: lit like a fish in a clear case
function studio(view) {
  clear();
  scene.background = new THREE.Color(view === 'specimen' ? 0xf3f1ec : 0x0b0e0e);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;
  sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sun.position.set(0.3, 1, 0.5);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xc9d6dc, 0x4a4234, 0.8));
  YJ_UNIFORMS.uYjAir.value = 1;
  YJ_UNIFORMS.uYjCaustic.value = 0;
  YJ_UNIFORMS.uYjSkyGain.value = 0.22;
  floor = { heightAt: () => -0.12, waterAt: () => 0.5, meadow: null };
  const d = addFish(0, 0, 0, 200, { id: 1, kind: 'rest', urgency: 0, seconds: 600 });
  // the specimen view: the silvery, peppered form of the photograph of a fresh specimen on white
  d.recolor(Number(params.get('morph') ?? (view === 'specimen' ? SILVER_MORPH : 0)), view === 'specimen' ? 0 : 0.3);
  // no bed here: hide the contact shadow
  scene.traverse((o) => { if (o.isInstancedMesh) o.visible = false; });
  const f = d.behaviour;
  f.pos.set(0, 0, 0); f.heading = Math.PI / 2; f.pitch = 0.0; f.restPitch = 0.0;
  // a still, straight fish (the studio's own pose, no swimming)
  state.brain = false;
  renderer.toneMappingExposure = view === 'specimen' ? 0.95 : 1.1;
  camera.fov = 22;
  if (view === 'side') { camera.position.set(-0.035, 0.0, 0.66); controls.target.set(-0.035, 0, 0); }
  if (view === 'specimen') { camera.fov = 12; camera.position.set(-0.035, 0.012, 0.66); controls.target.set(-0.035, 0, 0); }
  if (view === 'head') { camera.fov = 18; camera.position.set(0.05, 0.02, 0.15); controls.target.set(0.05, 0.0, 0); }
  if (view === 'front') { camera.fov = 18; camera.position.set(0.24, 0.035, 0.07); controls.target.set(0.05, 0.0, 0); }
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- the dark aquarium: a few eelgrass shoots, a lamp from above
function aquarium() {
  clear();
  scene.background = new THREE.Color(0x020406);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;
  sun = new THREE.DirectionalLight(0xf2f4ff, 3.0);
  sun.position.set(0.1, 1, 0.35);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x26343c, 0x0a0806, 0.5));
  YJ_UNIFORMS.uYjCaustic.value = 0;
  YJ_UNIFORMS.uYjWater.value.set(0.02, 0.03, 0.035);
  kit = new AmamoKit();
  const ground = { heightAt: () => -0.32, poolAt: () => -1e3 };
  const grid = new ShootGrid();
  for (const [x, z, s] of [[0, 0, 5], [0.12, -0.08, 9], [-0.14, 0.05, 13]]) {
    const p = new AmamoPatch({ kit, ground, grid, lengthAt: () => 0.55, x, z, radius: 0.12, density: 220, kind: 'pioneer', seed: s });
    p.setLod(0, 1, -1);
    scene.add(p); patches.push(p);
  }
  floor = { heightAt: () => -0.32, waterAt: () => 0.3, meadow: probe };
  const d = addFish(0, 0.06, 0.03, 190);
  d.recolor(Number(params.get('morph') ?? 0), 0.4);
  d.behaviour.holdGrass({ floor, t: 0 }, 600);
  state.brain = false;
  renderer.toneMappingExposure = 0.9;
  camera.fov = 30;
  camera.position.set(0.05, -0.08, 0.75); controls.target.set(0.02, -0.12, 0);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- a portrait: the head three-quarters from the front in a
// public aquarium's eelgrass tank (blue back wall, sand, a lamp above), like the photograph of a golden fish
function portrait() {
  clear();
  scene.background = new THREE.Color(0x0a2a9a).convertSRGBToLinear();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.1;
  sun = new THREE.DirectionalLight(0xfff6e8, 2.8);
  sun.position.set(-0.2, 1, 0.45);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x8fa6c8, 0x6a5a44, 0.9));
  YJ_UNIFORMS.uYjAir.value = 1;
  YJ_UNIFORMS.uYjCaustic.value = 0.15;
  YJ_UNIFORMS.uYjSkyGain.value = 0.2;
  const S = 256, data = new Uint8Array(S * S * 4);
  let a = 5;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < S * S; i++) { const v = 150 + rnd() * 70 - 35; data[i * 4] = v; data[i * 4 + 1] = v * 0.92; data[i * 4 + 2] = v * 0.8; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(30, 30); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(0.55, 0.5, 0.42), roughness: 0.95 }));
  sand.position.y = -0.2;
  scene.add(sand);
  kit = new AmamoKit();
  const ground = { heightAt: () => -0.2, poolAt: () => -1e3 };
  const grid = new ShootGrid();
  // the shoots behind the fish and to its side, none between it and the camera
  for (const [x, z, sd] of [[-0.12, -0.16, 41], [0.12, -0.2, 43], [-0.3, -0.05, 47], [0.25, -0.02, 49]]) {
    const p = new AmamoPatch({ kit, ground, grid, lengthAt: () => 0.5, x, z, radius: 0.08, density: 260, kind: 'pioneer', seed: sd });
    p.setLod(0, 1, -1);
    scene.add(p); patches.push(p);
  }
  floor = { heightAt: () => -0.2, waterAt: () => 0.35, meadow: null };
  const d = addFish(0, 0, 0, 200, { id: 1, kind: 'rest', urgency: 0, seconds: 600 });
  d.recolor(Number(params.get('morph') ?? GOLDEN_MORPH), 0);
  // (the contact shadow is for the open bed under water; the tank's lamp gives its own)
  scene.traverse((o) => { if (o.name === 'HakuContactShadows') o.visible = false; });
  const f = d.behaviour;
  // swimming toward the camera's right, head down a little, the head turned three-quarters to the camera
  f.pos.set(-0.03, 0.0, 0); f.heading = 1.05; f.pitch = -0.3; f.restPitch = -0.3;
  f.pose.girth = 1.16;
  state.brain = false;
  renderer.toneMappingExposure = 1.0;
  camera.fov = 24;
  camera.position.set(0.075, -0.004, 0.115); controls.target.set(0.008, -0.02, 0.028);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- the meadow under water
const HALF = 12, N = 121;
const heightAt = (x, z) => 0.01 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.005 * Math.sin(x * 2.3 + z * 1.7);
let meadowBase = null;
function meadowScene(n = 5) {
  clear();
  if (!meadowBase) {
    const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 160, 160).rotateX(-Math.PI / 2);
    const p = bedGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    bedGeo.computeVertexNormals();
    const S = 256, data = new Uint8Array(S * S * 4);
    let a = 9;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < S * S; i++) { const v = 150 + rnd() * 44 - 22; data[i * 4] = v; data[i * 4 + 1] = v * 0.93; data[i * 4 + 2] = v * 0.8; data[i * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, S, S);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(120, 120); tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
    const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(0.66, 0.62, 0.55), roughness: 0.95 }));
    bed.receiveShadow = true;
    const hData = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hData[j * N + i] = heightAt(-HALF + (i / (N - 1)) * 2 * HALF, -HALF + (j / (N - 1)) * 2 * HALF);
    const heightTexture = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.FloatType);
    heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
    const fakeTerrain = { heightTexture, spillTexture: makeSpillTexture(new Float32Array(N * N).fill(-1e3), N), half: HALF };
    const w = new WaterPass(fakeTerrain, createWaves({ windDir: 0.7, depth: 0.8, seed: 11 }), surfUniforms(null));
    w.setPolarized(true);
    // the 走水 water (World.create does the same from the map's layout)
    w.setBody(0.07, 0.125, 0.125, 0.55);
    meadowBase = { bed, water: w };
  }
  water = meadowBase.water;
  waterOn = true;
  scene.add(meadowBase.bed);
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 55), THREE.MathUtils.degToRad(200));
  su.sunPosition.value.copy(sunDir);
  sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x88aabb, 0x44392c, 0.3));
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 2000, cubeRT).update(renderer, skyScene);
  meadowBase.cube = cubeRT;
  envTex = pmrem.fromScene(skyScene).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.08;
  YJ_UNIFORMS.uYjWater.value.set(0.085, 0.15, 0.145);
  kit = new AmamoKit();
  const ground = { heightAt, poolAt: () => -1e3 };
  const grid = new ShootGrid();
  let s = 300;
  // a bed whose edge runs along x = 0, open sand with a few pioneer clumps toward +x (where the camera stands)
  for (const [x, z, r, dens, kind] of [[-1.35, 0.1, 1.35, 95, 'dense'], [-0.9, -1.7, 1.0, 80, 'dense'], [-0.2, 1.5, 0.75, 32, 'sparse'], [0.55, -0.55, 0.32, 45, 'pioneer'], [0.85, 0.55, 0.28, 45, 'pioneer']]) {
    const p = new AmamoPatch({ kit, ground, grid, lengthAt: () => 0.62, x, z, radius: r, density: dens, kind, seed: s++ });
    p.setLod(0, 1, 0);
    scene.add(p); patches.push(p);
  }
  floor = { heightAt, waterAt: () => state.depth, meadow: probe };
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const d = addFish(i, -0.12 + 0.18 * Math.cos(a) * (i ? 1.6 : 0), 0.05 + 0.5 * Math.sin(a) * (i ? 1 : 0), 160 + 22 * ((i * 37) % 5));
    // the first fish (the one the camera follows) in the golden form of the photograph of a live fish
    if (i === 0) d.recolor(Number(params.get('morph') ?? GOLDEN_MORPH), 0.2);
  }
  state.brain = true;
  renderer.toneMappingExposure = 0.62;
  camera.fov = 42;
  camera.position.set(1.15, 0.32, 0.25); controls.target.set(-0.25, 0.16, 0.0);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- stepping
function think(f) {
  const d = f.driver;
  if (d.busy) return;
  const r = brainRng.next();
  const kind = r < 0.5 ? 'rest' : r < 0.78 ? 'forage' : 'wander';
  const a = brainRng.range(0, 6.28), dist = brainRng.range(0.3, 0.8);
  const target = new THREE.Vector3(f.root.position.x + Math.sin(a) * dist, 0, f.root.position.z + Math.cos(a) * dist);
  d.setIntent({ id: 1, kind, urgency: 0.3, seconds: kind === 'rest' ? brainRng.range(15, 30) : brainRng.range(10, 18), target });
}
function step(dt) {
  state.time += dt;
  if (kit) {
    const u = kit.uniforms;
    u.uAmTime.value = state.time;
    u.uAmWater.value = waterOn ? state.depth : 0.3;
    u.uAmCurrent.value.set(0.02, 0.05);
    u.uAmWave.value.set(Math.cos(0.7), Math.sin(0.7), waterOn ? 0.1 : 0.03, 0.6);
  }
  for (const f of fishes) {
    if (state.brain) think(f);
    f.driver.update(dt, ctx());
  }
  applyLod();
}
function applyLod() {
  for (const f of fishes) {
    const lod = f.root.getObjectByName('YoujiuoLOD');
    if (!lod) continue;
    if (state.lod === 'auto') { lod.autoUpdate = true; continue; }
    lod.autoUpdate = false;
    lod.levels.forEach((l, i) => { l.object.visible = i === state.lod; });
    f.driver.behaviour.lod = state.lod;
  }
}

function target() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rt || rt.width !== s.x || rt.height !== s.y) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(s.x, s.y, THREE.FloatType);
  }
  return rt;
}
function render() {
  for (const p of patches) p.visible = true;
  if (!waterOn) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  water.setLevel(state.depth);
  sunCol.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  water.update(0, { sunUp: 1, sunDir, sunCol, ambient: 0.45, fogColor, fogDensity: 0.004, env: meadowBase.cube.texture, day: 1 });
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
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- panel
const SCENES = { meadow: 'アマモ場', aquarium: '水槽', portrait: '頭部（水槽）', side: '側面', specimen: '標本', head: '頭部', front: '正面' };
function setScene(k) {
  state.scene = k;
  brainRng = new Rng(77);
  if (k === 'meadow') meadowScene();
  else if (k === 'aquarium') aquarium();
  else if (k === 'portrait') portrait();
  else studio(k);
  applyLod();
  step(1 / 60);
  info();
}
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
const first = () => fishes[0]?.driver;
const ACTS = {
  hold: ['アマモに沿う', () => first()?.behaviour.holdGrass({ floor, t: state.time }, 30)],
  forage: ['摂餌', () => first()?.setIntent({ id: 2, kind: 'forage', urgency: 0.3, seconds: 20 })],
  swim: ['ゆっくり泳ぐ', () => { const p = fishes[0].root.position; first()?.setIntent({ id: 3, kind: 'wander', urgency: 0.3, seconds: 14, target: new THREE.Vector3(p.x + 0.7, 0, p.z - 0.2) }); }],
  hover: ['静止', () => first()?.setIntent({ id: 4, kind: 'special', param: 'hover', urgency: 0.1, seconds: 12 })],
  startle: ['脅かす', () => startle()],
};
function startle() {
  for (const f of fishes) f.driver.setIntent({ id: 9, kind: 'flee', urgency: 1, seconds: 2, from: camera.position.clone() });
}
seg('scenes', Object.entries(SCENES), () => state.scene, setScene);
seg('acts', Object.entries(ACTS).map(([k, [l]]) => [k, l]), () => '', (k) => ACTS[k][1]());
seg('lods', [['auto', '自動'], [0, '0'], [1, '1'], [2, '2']], () => state.lod, (k) => { state.lod = k; applyLod(); });
function info() {
  const s = fishes.map((f) => f.driver.debugLabel()).join('\n');
  document.getElementById('info').textContent = s;
}
setScene(state.scene);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  controls.update();
  step(dt);
  render();
  if ((now | 0) % 10 === 0) info();
  requestAnimationFrame(loop);
}
if (!capture) requestAnimationFrame(loop);

// ---------------------------------------------------------------- scripted renders
window.__yj = {
  set(o) {
    if (o.scene && o.scene !== state.scene) setScene(o.scene);
    if (o.lod !== undefined) { state.lod = o.lod; applyLod(); }
    if (o.depth !== undefined) state.depth = o.depth;
    if (o.brain !== undefined) state.brain = o.brain;
    if (o.cam) { camera.position.fromArray(o.cam); controls.target.fromArray(o.target ?? [0, 0, 0]); camera.lookAt(controls.target); }
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    render();
    return this.state();
  },
  /** follow fish i: camera at an offset from its middle */
  follow(i = 0, off = [0.25, 0.05, 0.3]) {
    const a = fishes[i].driver.anchor().clone();
    controls.target.copy(a);
    camera.position.set(a.x + off[0], a.y + off[1], a.z + off[2]);
    camera.lookAt(a);
    render();
    return this.state();
  },
  /** look at fish i's flank square on from `dist` metres (the side nearer the camera), `along` toward the head */
  followSide(i = 0, dist = 0.2, along = 0, up = 0) {
    const f = fishes[i];
    f.root.updateMatrixWorld(true);
    const bone = f.root.getObjectByName('Body_3');
    const q = bone.getWorldQuaternion(new THREE.Quaternion());
    const a = f.driver.anchor().clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), along);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    if (left.dot(camera.position.clone().sub(a)) < 0) left.negate();
    controls.target.copy(a);
    camera.position.copy(a).addScaledVector(left, dist);
    camera.position.y += up;
    camera.lookAt(a);
    render();
    return this.state();
  },
  /** follow fish i's head: camera at an offset in the head's own frame (to its left, up, forward) */
  followHead(i = 0, off = [0.06, 0.01, 0.02]) {
    const f = fishes[i], b = f.driver.behaviour;
    const a = b.occiput(new THREE.Vector3());
    // aim between the eye and the snout tip
    const tip = b.snoutTip(new THREE.Vector3());
    const aim = a.clone().lerp(tip, 0.35);
    controls.target.copy(aim);
    f.root.updateMatrixWorld(true);
    const q = f.root.getObjectByName('Head').getWorldQuaternion(new THREE.Quaternion());
    camera.position.copy(aim).add(new THREE.Vector3(...off).applyQuaternion(q));
    camera.up.set(0, 1, 0);
    camera.lookAt(aim);
    render();
    return this.state();
  },
  act(k) { ACTS[k][1](); return this.state(); },
  startle() { startle(); return this.state(); },
  advance(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) step(dt); render(); return this.state(); },
  /** run until fish 0 is in a state (and sub-state), up to `max` seconds */
  until(st, sub, max = 30, dt = 1 / 60) {
    for (let t = 0; t < max; t += dt) { step(dt); const b = first()?.behaviour; if (b && b.state === st && (!sub || b.sub === sub)) break; }
    render();
    return this.state();
  },
  state() {
    return fishes.map((f) => { const b = f.driver.behaviour; return { state: b.state, sub: b.sub, pos: b.pos.toArray().map((v) => +v.toFixed(3)), fin: +b.finHz.toFixed(1) }; });
  },
  info() { return renderer.info.render; },
  /** the drivers and the scene, for experiments from the console */
  get fishes() { return fishes; },
  get scene() { return scene; },
  render,
};
