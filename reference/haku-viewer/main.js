// ハク viewer: studio views of one fish (side / top / front, any tier) and a school over a sandy shallow,
// driven by the game's own HakuDriver with a stand-in brain. ?capture hides the panel and exposes window.__haku
// for scripted renders (tools/models/haku/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HakuDriver } from '../../src/creatures/species/haku/HakuDriver.ts';
import { liveSchools } from '../../src/creatures/species/haku/School.ts';
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

const species = { id: 'mugil_cephalus', model: { modelLength_mm: 30, driver: 'haku' }, brain: { params: {} } };
function individual(i, x, z, len = 28) {
  return {
    id: `mugil_cephalus#${(0x1000 + i).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: 0,
    length_mm: len, weight_g: 0.2, sex: 'f', stage: 'haku', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(1234 + i * 77), cell: 7, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

let scene = null, fishes = [], mode = 'side', lod = 0, floor = null, sun = null, simT = 0, lastIntent = 0, startleAt = -1;

function clear() {
  for (const f of fishes) f.driver.dispose();
  fishes = [];
  scene = new THREE.Scene();
}

function studio(view) {
  clear();
  scene.background = new THREE.Color(view === 'front' ? 0x0b0d0e : 0x0e1416);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sun.position.set(0.3, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x9fb8c4, 0x3a3226, 0.6));
  floor = { heightAt: () => -0.5, waterAt: () => 0.5 };
  const root = new THREE.Group();
  scene.add(root);
  const d = new HakuDriver();
  const ind = individual(0, 0, 0, 30);
  d.attach(root, ind);
  d.setIntent({ id: 1, kind: 'rest', urgency: 0, seconds: 60 });
  fishes.push({ driver: d, ind, root });
  renderer.toneMappingExposure = 1.0;
  const r = 0.03;
  if (view === 'side') { camera.position.set(r * 2.6, 0.002, 0.004); controls.target.set(0, 0, 0.0); }
  if (view === 'top') { camera.position.set(0.0001, r * 2.6, 0); controls.target.set(0, 0, 0); }
  if (view === 'front') { camera.position.set(0.004, 0.004, r * 1.4); controls.target.set(0, 0, 0.004); }
  camera.fov = 30;
  camera.updateProjectionMatrix();
  controls.update();
}

/** a sandy bed under a hand's depth of olive water, a school of ハク, sunlight from the south-west */
function shallows(n = 26) {
  clear();
  const waterY = 0, bedY = -0.14;
  floor = { heightAt: (x, z) => bedY + 0.006 * Math.sin(x * 9) * Math.sin(z * 7), waterAt: () => waterY };
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const sunDir = new THREE.Vector3(-0.35, 0.82, 0.45).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
  scene.environmentIntensity = 0.06;
  scene.background = new THREE.Color(0.16, 0.172, 0.14).multiplyScalar(1.6);
  sun = new THREE.DirectionalLight(0xfff6ea, 2.6);
  sun.position.copy(sunDir).multiplyScalar(50);
  scene.add(sun, sun.target, new THREE.HemisphereLight(new THREE.Color(0.58, 0.68, 0.78), new THREE.Color(0.28, 0.24, 0.18), 0.3));
  // the bed: fine sand with ripple marks
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const img = g.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const ripple = 0.5 + 0.5 * Math.sin((x * 0.11 + Math.sin(y * 0.03) * 3) );
    const v = 150 + 30 * ripple + (Math.random() - 0.5) * 40;
    const i = (y * 512 + x) * 4;
    img.data[i] = v * 0.98; img.data[i + 1] = v * 0.86; img.data[i + 2] = v * 0.66; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6); tex.colorSpace = THREE.SRGBColorSpace;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  const pos = bed.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, floor.heightAt(pos.getX(i), pos.getZ(i)));
  bed.geometry.computeVertexNormals();
  scene.add(bed);
  scene.fog = new THREE.FogExp2(new THREE.Color(0.16, 0.172, 0.14).multiplyScalar(1.6), 1.2);
  const group = new THREE.Group();
  scene.add(group);
  for (let i = 0; i < n; i++) {
    const root = new THREE.Group();
    group.add(root);
    const d = new HakuDriver();
    const ind = individual(i, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 24 + Math.random() * 7);
    d.attach(root, ind);
    fishes.push({ driver: d, ind, root });
  }
  for (const f of fishes) f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 12, target: new THREE.Vector3(0.6, 0, 0.2) });
  renderer.toneMappingExposure = 0.55;
  camera.fov = 40;
  camera.updateProjectionMatrix();
  camera.position.set(0.0, 0.55, 0.62);
  controls.target.set(0, -0.05, 0);
  controls.update();
}

function setLod(l) {
  lod = l;
  for (const f of fishes) {
    const lodObj = f.root.children.find((o) => o.isLOD);
    if (!lodObj) continue;
    lodObj.autoUpdate = l < 0;
    if (l >= 0) lodObj.levels.forEach((lv, i) => { lv.object.visible = i === l; });
  }
}

function startle() {
  // a hand coming down at the school from the camera's side
  const from = camera.position.clone(); from.y = 0;
  startleAt = simT;
  const f = fishes[0];
  if (f) f.driver.setIntent({ id: 99, kind: 'flee', urgency: 1, seconds: 4, from, target: f.ind.pos.clone().add(f.ind.pos.clone().sub(from).setY(0).normalize().multiplyScalar(1.2)) });
}

function step(dt) {
  simT += dt;
  // a stand-in brain: every few seconds someone asks for something
  if (mode === 'shallows' && simT - lastIntent > 3) {
    lastIntent = simT;
    const f = fishes[Math.floor(Math.random() * fishes.length)];
    if (f) {
      const r = Math.random();
      const t = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
      f.driver.setIntent(r < 0.4 ? { id: 2, kind: 'wander', urgency: 0.3, seconds: 10, target: t } : r < 0.6 ? { id: 3, kind: 'forage', urgency: 0.3, seconds: 9 } : r < 0.8 ? { id: 4, kind: 'special', param: 'surface', urgency: 0.3, seconds: 10 } : { id: 5, kind: 'rest', urgency: 0, seconds: 8 });
    }
  }
  const ctx = { floor, player: camera.position, simScale: 1, nowMs: performance.now(), minDepth: 0.015, bounds: mode === 'shallows' ? { minX: -1.3, maxX: 1.3, minZ: -1.3, maxZ: 1.3 } : undefined, locked: mode !== 'shallows' };
  for (const f of fishes) f.driver.update(dt, ctx);
  if (mode !== 'shallows') {
    // studio: hold the fish in place, slow swimming in place
    const f = fishes[0];
    f.root.position.set(0, 0, 0); f.root.rotation.set(0, mode === 'front' ? 0 : 0, 0);
  }
}

function setScene(s) {
  mode = s;
  if (s === 'shallows') shallows(Number(params.get('n')) || 26); else studio(s);
  setLod(s === 'shallows' ? -1 : lod);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => setLod(Number(b.dataset.lod))));
document.getElementById('startle').addEventListener('click', startle);

setScene(params.get('scene') ?? 'side');
resize();
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!capture) step(dt);
  controls.update();
  renderer.render(scene, camera);
  const s = liveSchools()[0];
  document.getElementById('info').textContent = s ? `${s.state}  ${fishes.length} 尾  draw ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}` : '';
}
requestAnimationFrame(loop);

// scripted renders: advance the simulation by fixed steps, then render once
window.__haku = {
  set({ scene: s, lod: l = 0, cam, target, fov, pose }) {
    if (s && s !== mode) setScene(s);
    setLod(l);
    if (cam) camera.position.set(...cam);
    if (target) controls.target.set(...target);
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    controls.update();
    // a studio fish needs a few frames to be placed and posed
    if (mode !== 'shallows') for (let i = 0; i < 20; i++) step(1 / 60);
    if (pose) for (const f of fishes) Object.assign(f.driver.fish.pose, pose);
    renderer.render(scene, camera);
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  },
  advance(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) step(dt); renderer.render(scene, camera); return liveSchools().map((s) => s.state); },
  startle() { startle(); },
  state() { return liveSchools().map((s) => ({ state: s.state, center: s.center.toArray(), radius: s.radius })); },
  fishes: () => fishes,
};
