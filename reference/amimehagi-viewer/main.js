// アミメハギ viewer: studio views of one fish (side / top / front / a photo case, any tier, any look) and a patch of
// アマモ with a few fish driven by the game's own driver and a stand-in brain. ?capture hides the panel and exposes
// window.__amh for scripted renders (tools/models/amimehagi/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel, disposeModel } from '../../src/creatures/species/amimehagi/model.ts';
import { AmimehagiLook, AMH_UNIFORMS, PALETTES } from '../../src/creatures/species/amimehagi/materials.ts';
import { applyPose, restPose } from '../../src/creatures/species/amimehagi/pose.ts';
import { AmimehagiDriver } from '../../src/creatures/species/amimehagi/AmimehagiDriver.ts';
import { SeagrassField } from '../../src/creatures/species/amimehagi/seagrass.ts';
import { AmamoKit, AmamoPatch, ShootGrid } from '../../src/world/amamo/index.ts';
import { WaterPass, makeSpillTexture } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
import { Sky } from 'three/addons/objects/Sky.js';
import { Rng } from '../../src/core/Rng.ts';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const pmrem = new THREE.PMREMGenerator(renderer);
const camera = new THREE.PerspectiveCamera(30, 1, 0.002, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

let scene = null, studioFish = null, fishes = [], mode = 'side', lod = 0, palette = 1, pose = restPose(), simT = 0, extra = null;
const info = document.getElementById('info');

function look(p) { return new AmimehagiLook({ palette: p, seed: new THREE.Vector2(3.1 + p * 7.7, 1.7 + p * 3.3), value: 0, warmth: 0 }); }

function clear() {
  if (studioFish) disposeModel(studioFish);
  studioFish = null;
  for (const f of fishes ?? []) f.driver.dispose();
  if (fishes) fishes.length = 0;
  field?.bind(null);
  meadow = null;
  renderer.shadowMap.enabled = false;
  extra?.dispose?.();
  extra = null;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

function studio(view) {
  clear();
  AMH_UNIFORMS.uAir.value = 1;
  const white = view === 'tank';
  scene.background = new THREE.Color(white ? 0xd8dcdc : view === 'front' ? 0x0b0d0e : 0x0d1112);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = white ? 0.7 : 0.4;
  AMH_UNIFORMS.uSkyGain.value = white ? 0.55 : 0.32;
  const sun = new THREE.DirectionalLight(0xfff4e6, white ? 2.2 : 2.8);
  sun.position.set(0.3, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8c8d0, 0x4a4036, white ? 0.7 : 0.35));
  studioFish = buildModel(look(palette));
  showLod(studioFish, lod);
  scene.add(studioFish.root);
  applyPose(studioFish.rig, pose, 0);
  renderer.toneMappingExposure = white ? 0.9 : 1.0;
  const r = 0.04;
  if (view === 'side' || view === 'tank') { camera.position.set(r * 3.0, 0.0, -0.002); controls.target.set(0, -0.001, -0.002); }
  if (view === 'top') { camera.position.set(0.0001, r * 3.2, -0.002); controls.target.set(0, 0, -0.002); }
  if (view === 'front') { camera.position.set(0.0, 0.0, r * 2.2); controls.target.set(0, -0.001, 0); }
  camera.fov = 30;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- the eelgrass bed
const HALF = 12, N = 97;
const heightAt = (x, z) => 0.01 * Math.sin(x * 0.9) * Math.cos(z * 0.7) + 0.005 * Math.sin(x * 2.3 + z * 1.7);
let meadow = null;
const field = new SeagrassField();
let water = null, sky = null, sun = null, hemi = null, envTex = null, rt = null, depth = 0.75, current = 0.05, brainRng = new Rng(77);
const sunCol = new THREE.Vector3(), sunDir = new THREE.Vector3();
const fogColor = new THREE.Color(0.74, 0.82, 0.86);
const underFog = new THREE.FogExp2(0x2c4a40, 0.32);

function sandTexture() {
  const S = 256, data = new Uint8Array(S * S * 4);
  let a = 9;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < S * S; i++) { const v = 150 + rnd() * 44 - 22; data[i * 4] = v; data[i * 4 + 1] = v * 0.97; data[i * 4 + 2] = v * 0.88; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(140, 140); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

function individual(i, x, z, len) {
  const species = { id: 'rudarius_ercodes', model: { modelLength_mm: 40, driver: 'amimehagi' }, brain: { params: {} } };
  return {
    id: `rudarius_ercodes#${(0x2000 + i * 7919).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: i * 1.7,
    length_mm: len, weight_g: 1, sex: 'f', stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(1234 + i * 77), cell: 7, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

function meadowScene(opts = {}) {
  clear();
  AMH_UNIFORMS.uAir.value = 0;
  AMH_UNIFORMS.uSkyGain.value = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 160, 160);
  bedGeo.rotateX(-Math.PI / 2);
  const p = bedGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  bedGeo.computeVertexNormals();
  const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ map: sandTexture(), color: new THREE.Color(0.66, 0.62, 0.54), roughness: 0.95 }));
  bed.receiveShadow = true;
  scene.add(bed);
  // sky, sun, environment
  const skyScene = new THREE.Scene();
  sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
  const elev = opts.elev ?? 52, azim = opts.azim ?? 200;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  su.sunPosition.value.copy(sunDir);
  sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
  hemi = new THREE.HemisphereLight(0x88aabb, 0x44392c, 0.35);
  scene.add(sun, sun.target, hemi);
  envTex = pmrem.fromScene(skyScene).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.08;
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 2000, cubeRT).update(renderer, skyScene);
  // the game's screen-space water over the bed
  const hData = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hData[j * N + i] = heightAt(-HALF + (i / (N - 1)) * 2 * HALF, -HALF + (j / (N - 1)) * 2 * HALF);
  const heightTexture = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.FloatType);
  heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
  const fakeTerrain = { heightTexture, spillTexture: makeSpillTexture(new Float32Array(N * N).fill(-1e3), N), half: HALF };
  water = new WaterPass(fakeTerrain, createWaves({ windDir: 0.7, depth: 0.6, seed: 11 }), surfUniforms(null));
  water.setBody(0.07, 0.125, 0.125, 0.55);
  water.setPolarized(true);
  water.cubeRT = cubeRT;
  // the eelgrass: a dense clone, sparse ones round it and a pioneer clump on the sand
  const kit = new AmamoKit();
  const ground = { heightAt, poolAt: () => -1e3 };
  const grid = new ShootGrid();
  const live = new Map();
  let k = 0;
  const add = (o) => { const pa = new AmamoPatch({ kit, ground, grid, lengthAt: () => 0.55, ...o }); pa.setLod(0, 1, 0); scene.add(pa); live.set(k++, pa); };
  add({ x: -0.6, z: 0.1, radius: 1.3, density: 70, kind: 'dense', seed: 45 });
  add({ x: 1.0, z: -0.6, radius: 0.9, density: 28, kind: 'sparse', seed: 33 });
  add({ x: 1.0, z: 1.2, radius: 0.45, density: 40, kind: 'pioneer', seed: 21 });
  meadow = { live, kit, coverAt: (x, z) => { let c = 0; for (const pa of live.values()) { const d = Math.hypot(x - pa.cx, z - pa.cz) / Math.max(pa.reach, 0.1); c = Math.max(c, (1 - Math.min(1, d)) * (pa.kind === 'dense' ? 1 : 0.5)); } return c; } };
  field.bind(meadow);
  // the fish
  const n = opts.count ?? 5;
  const holder = new THREE.Group();
  holder.name = 'creatures';
  scene.add(holder);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 0.15 + 0.25 * (i % 3);
    const ind = individual(i, Math.cos(a) * r + 0.2, Math.sin(a) * r, [42, 36, 48, 30, 55, 40][i % 6]);
    const root = AmimehagiDriver.makeModel().root;
    holder.add(root);
    const d = new AmimehagiDriver();
    d.grass = field;
    d.attach(root, ind);
    fishes.push({ driver: d, ind, root });
  }
  for (const f of fishes) f.driver.update(0.001, ctx(f));
  renderer.toneMappingExposure = 0.62;
  camera.fov = 40;
  camera.position.set(0.55, 0.32, 0.55);
  controls.target.set(0.15, 0.22, 0.0);
  camera.updateProjectionMatrix();
  controls.update();
}

const floor = { heightAt, waterAt: () => depth };
function ctx(f, dt) {
  return { floor, player: camera.position, simScale: 1, nowMs: 0, minDepth: 0.03, locked: false };
}

/** the stand-in brain: what the game's fish_seagrass tree would ask for, at random */
function think(f) {
  if (f.driver.busy) return;
  const u = brainRng.next();
  const pos = f.driver.behaviour.pos;
  if (u < 0.34) f.driver.setIntent({ id: 1, kind: 'rest', urgency: 0.3, seconds: 4 + 8 * brainRng.next() });
  else if (u < 0.66) f.driver.setIntent({ id: 1, kind: 'forage', urgency: 0.4, seconds: 8 + 8 * brainRng.next() });
  else if (u < 0.88) f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 12, target: new THREE.Vector3(pos.x + brainRng.range(-0.7, 0.7), 0, pos.z + brainRng.range(-0.7, 0.7)) });
  else f.driver.setIntent({ id: 1, kind: 'special', urgency: 0.3, seconds: 8, param: 'hide' });
}

function stepMeadow(dt) {
  simT += dt;
  const u = meadow.kit.uniforms;
  u.uAmTime.value = simT;
  u.uAmWater.value = depth;
  u.uAmCurrent.value.set(0, current);
  u.uAmWave.value.set(Math.cos(0.7), Math.sin(0.7), 0.1, 0.6);
  for (const f of fishes) { think(f); f.driver.update(dt, ctx(f, dt)); }
  water.setLevel(depth);
  water.uniforms.uTime.value = simT;
}

function target() {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rt || rt.width !== sz.x || rt.height !== sz.y) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(sz.x, sz.y, THREE.FloatType);
  }
  return rt;
}

function renderMeadow() {
  sunCol.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  water.update(0, { sunUp: 1, sunDir, sunCol, ambient: 0.45, fogColor, fogDensity: 0.004, env: water.cubeRT.texture, day: 1 });
  water.uniforms.uTime.value = simT;
  // (under the surface the water pass itself fades the view into the water)
  scene.fog = null;
  scene.background = fogColor;
  const r = target();
  camera.updateMatrixWorld();
  water.prepare(renderer, scene, camera);
  renderer.setRenderTarget(r);
  renderer.render(scene, camera);
  water.render(renderer, r, null, camera);
  renderer.setRenderTarget(null);
}

function setScene(s, opts) {
  mode = s;
  if (s === 'meadow') meadowScene(opts);
  else studio(s);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function render() {
  controls.update();
  if (mode === 'meadow') renderMeadow();
  else renderer.render(scene, camera);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!capture && mode === 'meadow') {
    stepMeadow(dt);
    render();
  } else if (!capture) {
    simT += dt;
    if (studioFish) {
      pose.medPhase = simT * 2 * Math.PI * 3.5;
      pose.pecPhaseL = simT * 2 * Math.PI * 6; pose.pecPhaseR = pose.pecPhaseL + Math.PI;
      applyPose(studioFish.rig, pose, lod);
    }
    render();
  }
  info.textContent = mode === 'meadow' ? fishes.map((f, i) => `${i}: ${f.driver.debugLabel()}`).join('\n') : `${mode}  LOD${lod}  ${PALETTES[palette].name}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
function startle() { for (const f of fishes) f.driver.setIntent({ id: 2, kind: 'flee', urgency: 1, seconds: 6, from: camera.position.clone() }); }
function intentAll(kind, param) { for (const f of fishes) f.driver.setIntent({ id: 3, kind, urgency: 0.5, seconds: 12, param }); }
document.getElementById('startle').addEventListener('click', startle);
document.getElementById('feed').addEventListener('click', () => intentAll('forage'));
document.getElementById('hide').addEventListener('click', () => intentAll('display'));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { lod = Number(b.dataset.lod); if (studioFish) showLod(studioFish, lod); }));
document.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', () => { palette = (palette + 1) % PALETTES.length; setScene(mode); }));

resize();
setScene('side');
requestAnimationFrame(loop);

window.__amh = {
  set(o) {
    if (o.palette !== undefined) palette = o.palette;
    if (o.lod !== undefined) lod = o.lod;
    if (o.pose) pose = Object.assign(restPose(), o.pose);
    if (o.depth !== undefined) depth = o.depth;
    if (o.current !== undefined) current = o.current;
    if (o.scene) setScene(o.scene, o);
    else if (studioFish) { showLod(studioFish, lod); applyPose(studioFish.rig, pose, lod); }
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    controls.update();
    render();
  },
  render,
  advance(seconds) { const n = Math.round(seconds * 30); for (let i = 0; i < n; i++) stepMeadow(1 / 30); render(); },
  startle() { startle(); render(); },
  intent(kind, param, i) { for (const [j, f] of fishes.entries()) if (i === undefined || i === j) f.driver.setIntent({ id: 4, kind, urgency: 0.5, seconds: 20, param, from: camera.position.clone() }); },
  /** the camera beside a fish, level with it, looking at its flank (side 1: its left) */
  portrait(o) {
    const f = fishes[o.i ?? 0];
    if (!f) return;
    const b = f.driver.behaviour, p = b.pos, d = o.dist ?? 0.12, side = o.side ?? 1;
    const lx = Math.cos(b.heading) * side, lz = -Math.sin(b.heading) * side;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const a = o.angle ?? 0.25;
    camera.position.set(p.x + (lx * Math.cos(a) + fx * Math.sin(a)) * d, p.y + (o.up ?? 0.01), p.z + (lz * Math.cos(a) + fz * Math.sin(a)) * d);
    controls.target.copy(p);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    controls.update();
    render();
  },
  follow(o) {
    const f = fishes[o.i ?? 0];
    if (!f) return;
    const p = f.driver.behaviour.pos;
    controls.target.copy(p);
    if (o.offset) camera.position.set(p.x + o.offset[0], p.y + o.offset[1], p.z + o.offset[2]);
    controls.update();
    render();
  },
  state() { return mode === 'meadow' ? fishes.map((f) => ({ s: f.driver.debugLabel(), p: f.driver.behaviour.pos.toArray().map((v) => +v.toFixed(3)) })) : { mode, lod, palette: PALETTES[palette].name }; },
};
