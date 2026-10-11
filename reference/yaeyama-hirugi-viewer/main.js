import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HirugiKit, YaeyamaHirugi, MangroveForest, RootCollisionWorld, collisionSegments, treeSpec, worldPoint, BASE_NAMES } from '../../src/world/mangrove/index.ts';
import { Terrain } from '../../src/world/Terrain.ts';
import { Habitat } from '../../src/world/Habitat.ts';
import { WaterPass } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
import { SkyDome } from '../../src/world/Sky.ts';
import { FieldRenderer } from '../../src/render/FieldRenderer.ts';
import { reflectInWater, LAYER_MIRROR } from '../../src/render/Mirror.ts';
import { Input } from '../../src/core/Input.ts';
import { FPSController } from '../../src/player/FPSController.ts';

const params = new URLSearchParams(location.search), capture = params.has('capture');
if (capture) document.body.classList.add('capture');
const canvas = document.querySelector('#view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.75;
renderer.shadowMap.enabled = !params.has('noshadow'); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xabbec4, 0.006);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.012, 400);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = false; controls.maxPolarAngle = Math.PI * 0.51; controls.minDistance = 0.08;
const n = 193, size = 96, heights = new Float32Array(n * n), substrate = new Uint8Array(n * n);
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const x = (i / (n - 1) - 0.5) * size, z = (j / (n - 1) - 0.5) * size;
  const creek = 11 + 2.4 * Math.sin(z * 0.11), d = Math.abs(x - creek);
  heights[j * n + i] = -0.17 + z * 0.0018 + 0.015 * Math.sin(x * 0.53) * Math.cos(z * 0.47) - 0.58 * Math.exp(-d * d / 7.0);
  substrate[j * n + i] = d < 1.7 ? 2 : 0;
}
const terrain = new Terrain({ n, size, heights, substrate }, ['mud', 'muddy_sand', 'channel']);
terrain.setLandLevel(3, 4); scene.add(terrain.mesh); scene.add(terrain.mirrorProxy(LAYER_MIRROR));
const habitat = new Habitat(terrain, 2), waves = createWaves({ seed: 91, windDir: 0.7, depth: 0.3 });
terrain.setWaves(waves); terrain.setSpill(habitat.poolLevels);
const surf = surfUniforms(null); terrain.setSurf(surf);
const water = new WaterPass(terrain, waves, surf); water.setBody(0.10, 0.13, 0.09, 0.7); water.setMirror(params.has('nomirror') ? 0 : 0.35);
const sky = new SkyDome(scene, renderer, renderer.shadowMap.enabled, 2048);
const sunDir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
sky.update(sunDir, 45, new THREE.Vector3(), 0.1); sky.refreshEnvironment();
reflectInWater(sky.sky); reflectInWater(sky.sunLight); reflectInWater(sky.hemi);
sky.sunLight.shadow.camera.left = sky.sunLight.shadow.camera.bottom = -20;
sky.sunLight.shadow.camera.right = sky.sunLight.shadow.camera.top = 20; sky.sunLight.shadow.camera.updateProjectionMatrix();
const field = new FieldRenderer(renderer), input = new Input(canvas);
let trees = [], forest = null, kit = null, collisions = null, debug = null, walker = null, frame = 0;
let config = { mode: 'single', quality: 'high', base: 0, seed: 317, lod: 'auto', tide: -0.05, collision: false };

function clearTrees() {
  if (debug) { debug.removeFromParent(); debug.geometry.dispose(); debug.material.dispose(); debug = null; }
  for (const tree of trees) { tree.removeFromParent(); tree.dispose(); } trees = [];
  forest?.group.removeFromParent(); forest?.dispose(); forest = null;
  kit?.dispose(); kit = null; collisions?.clear(); collisions = null;
}
function rebuild() {
  clearTrees(); walker = null; controls.enabled = true;
  if (config.mode === 'forest') {
    forest = new MangroveForest(terrain, { seed: config.seed, minSpacing: 2.6, juvenileFraction: 0.25, minGround: -0.35, maxGround: 0.25,
      clusters: [{ x: -9, z: -5, radius: 15, count: 85 }, { x: -13, z: 21, radius: 15, count: 80 }, { x: 29, z: 17, radius: 12, count: 50 }] });
    forest.setQuality(config.quality); scene.add(forest.group); collisions = forest.collision;
  } else {
    kit = new HirugiKit(terrain); collisions = new RootCollisionWorld();
    const count = config.mode === 'five' ? 5 : config.mode === 'saplings' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const s = treeSpec(config.seed, i, config.mode === 'five' ? i : config.base); s.yaw = config.mode === 'five' ? -0.25 + i * 0.2 : 0;
      if (config.mode === 'five') { s.x = (i - 2) * 7.5; s.z = 0; }
      if (config.mode === 'saplings') { s.sapling = i; s.x = (i - 1) * 0.6; }
      const tree = new YaeyamaHirugi(kit, s); scene.add(reflectInWater(tree)); trees.push(tree);
      collisions.add(collisionSegments(kit.skeleton(s.base, s.sapling), s, terrain));
    }
  }
  if (config.collision) { debug = collisions.debugMesh(); scene.add(debug); }
}
function pose() {
  const mode = config.mode;
  const cams = { single: [8.8, 4, 10], roots: [3.4, 1.3, 4.2], five: [17, 9, 34], saplings: [2.0, 1.25, 2.7], forest: [17, 5.5, 30] };
  const targets = { single: [0, 2.2, 0], roots: [0, 0.65, 0], five: [0, 2.5, 0], saplings: [0, 0.58, 0], forest: [-5, 2, 5] };
  if (mode === 'leaf') {
    const tree = trees[0], skeleton = kit.skeleton(tree.spec.base), leaf = skeleton.leaves[7];
    const p = worldPoint(leaf.center, tree.spec, false, terrain).addScaledVector(leaf.axis, 0.065);
    camera.position.copy(p).add(new THREE.Vector3(0.2, 0.13, 0.25)); controls.target.copy(p);
  } else { camera.position.fromArray(cams[mode]); controls.target.fromArray(targets[mode]); }
  camera.near = mode === 'leaf' ? 0.02 : 0.15;
  camera.fov = 45; camera.updateProjectionMatrix(); controls.update();
}
function updateEnvironment(dt = 0) {
  habitat.update(Date.UTC(2026, 9, 9, 3), config.tide);
  water.setLevel(config.tide);
  water.update(dt, { sunUp: 1, sunDir, sunCol: sky.sunColorHdr(new THREE.Vector3()), ambient: 0.24,
    fogColor: sky.fogColor, fogDensity: 0.006, env: sky.envCube, day: 1 });
  terrain.setWater(config.tide, Math.max(config.tide, 0.16), 3.2, 1, sunDir);
  terrain.updateLod(camera.position.x, camera.position.z);
  if (kit) {
    kit.uniforms.uHgTime.value = capture ? 3.2 : kit.uniforms.uHgTime.value + dt;
    kit.uniforms.uHgWater.value = config.tide; kit.uniforms.uHgWet.value = Math.max(config.tide, 0.16);
    for (const tree of trees) {
      const d = camera.position.distanceTo(new THREE.Vector3(tree.spec.x, 2, tree.spec.z));
      tree.setLod(config.lod === 'auto' ? d < 18 ? 0 : d < 52 ? 1 : 2 : Number(config.lod));
    }
  }
  forest?.update(dt, camera, { tideLevel: config.tide, wetLevel: Math.max(config.tide, 0.16), wind: capture ? 0 : 1 });
  sky.sky.position.copy(camera.position);
}
function info() {
  return { mode: config.mode, base: BASE_NAMES[config.base], seed: config.seed, lod: trees.map(t => t.lod),
    trees: forest?.specs.length ?? trees.length, triangles: forest?.stats.triangles ?? trees.reduce((n, t) => n + t.triangles, 0),
    calls: forest?.stats.calls ?? trees.length * 4, templates: forest?.kit.templateCount ?? kit?.templateCount,
    geometryCount: forest?.kit.geometryCount ?? kit?.geometryCount, collisionSegments: collisions?.segments.length, frame,
    renderCalls: field.lastStats.calls, renderTriangles: field.lastStats.triangles };
}
function render() { updateEnvironment(0); field.render(scene, camera, water); frame++; document.querySelector('#stats').textContent = `${info().trees}本 · ${info().triangles.toLocaleString()} triangles\n${info().calls} vegetation draws · ${info().collisionSegments} collision segments`; }
async function set(patch) {
  const old = config; config = { ...config, ...patch };
  if (old.mode !== config.mode || old.base !== config.base || old.seed !== config.seed || !collisions) { rebuild(); pose(); }
  if (patch.cam) camera.position.fromArray(patch.cam); if (patch.target) controls.target.fromArray(patch.target); controls.update();
  forest?.setQuality(config.quality);
  forest?.setLod(config.lod === 'auto' ? null : Number(config.lod));
  if (patch.collision !== undefined && patch.collision !== old.collision) {
    if (debug) { debug.removeFromParent(); debug.geometry.dispose(); debug.material.dispose(); debug = null; }
    if (config.collision) { debug = collisions.debugMesh(); scene.add(debug); }
  }
  updateEnvironment(0); await field.compile(scene, camera, water); render(); return info();
}
function walk() {
  if (config.mode !== 'forest') return set({ mode: 'forest' }).then(walk);
  const map = { spawnStart: { x: 3, z: 8, heading: 55 }, bounds: { walkable: [[-45,-45],[45,45]], noEntry: [] }, wading: { maxDepth_m: 1 } };
  walker = new FPSController(camera, terrain, habitat, input, map); walker.lowView = false;
  walker.supportHeight = (x,z,maxY) => collisions.supportAt(x,z,maxY,terrain.heightAt(x,z),0.35,0.18)?.height ?? null;
  walker.obstacleFree = (a,b) => collisions.canMove(a,b,terrain,0.18,walker.lowView ? 0.65 : 1.45);
  controls.enabled = false; canvas.requestPointerLock();
}
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => set({ mode: b.dataset.mode });
for (const id of ['base','seed','lod','tide','collision']) document.getElementById(id).onchange = e => set({ [id]: id === 'collision' ? e.target.checked : id === 'lod' ? e.target.value : Number(e.target.value) });
document.querySelector('#shuffle').onclick = () => { document.querySelector('#seed').value = config.seed + 1; set({ seed: config.seed + 1 }); };
document.querySelector('#walk').onclick = walk;
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && walker) { walker = null; controls.enabled = true; controls.target.copy(camera.position).add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion)); controls.update(); } });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); render(); });
let last = performance.now();
function animate(now) {
  const dt = Math.min(0.05,(now-last)/1000); last=now;
  if (walker) walker.update(dt,1,false); input.endFrame(); controls.update(); updateEnvironment(dt); field.render(scene,camera,water); frame++; requestAnimationFrame(animate);
}
await set({});
window.__hirugi = { set, info, render, get kit() { return kit ?? forest?.kit; }, get trees() { return trees; }, get forest() { return forest; }, get collision() { return collisions; }, camera, terrain, renderer, scene, field, water, walk };
document.querySelector('#status').textContent = '写真資料に基づく5樹形 · 支柱根に乗れる衝突判定';
if (!capture) requestAnimationFrame(animate);
