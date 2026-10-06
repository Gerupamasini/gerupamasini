// The 走水 shore animals (ケフサイソガニ, ユビナガホンヤドカリ, アラムシロ, ボラ, ミズヒキゴカイ, マガキ) on a patch of
// sand, run by their game drivers. "flat" is the field (water over the sand, or none), "tank" puts walls round them as
// the case and the tank do. ?capture hides the panel and exposes window.__shore for scripted renders.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRIVERS } from '../../src/creatures/drivers/index.ts';
import { generateIndividual } from '../../src/creatures/Individual.ts';
import { SpeciesSchema } from '../../src/data/schemas/species.ts';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb3b8);
const camera = new THREE.PerspectiveCamera(35, 1, 0.002, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xdfeaf0, 0x6a6050, 1.3));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.position.set(0.6, 1.2, 0.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -0.4, right: 0.4, top: 0.4, bottom: -0.4, near: 0.1, far: 4 });
scene.add(sun);
// wet sand: a grainy canvas texture
const tex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8c8170'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { const v = 100 + Math.random() * 90; g.fillStyle = `rgba(${v},${v * 0.93},${v * 0.8},0.5)`; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
})();
const sand = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
sand.receiveShadow = true;
scene.add(sand);
const water = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f9aa0, transparent: true, opacity: 0.18, roughness: 0.1 }));
scene.add(water);

const SPECIES = ['hemigrapsus_penicillatus', 'pagurus_minutus', 'reticunassa_festiva', 'mugil_cephalus', 'cirriformia_comosa', 'crassostrea_gigas'];
const base = import.meta.env.BASE_URL ?? '/';
const defs = {};
for (const id of SPECIES) defs[id] = SpeciesSchema.parse(await (await fetch(`${base}data/species/${id}.json`)).json());

const state = { species: SPECIES[0], place: 'water', count: 3 };
let animals = [];
let waterY = 0.12;
const floor = { heightAt: () => 0, waterAt: () => waterY };

function clear() {
  for (const a of animals) { a.driver.dispose(); a.root.removeFromParent(); }
  animals = [];
}

function build() {
  clear();
  const sp = defs[state.species];
  const entry = DRIVERS[sp.model.driver];
  const n = sp.locomotion === 'swim' ? 8 : state.count;
  for (let i = 0; i < n; i++) {
    const ind = generateIndividual(sp, 1000 + i * 17, (i - (n - 1) / 2) * 0.07, (i % 2) * 0.05, 3, 0, Date.now());
    if (sp.id === 'mugil_cephalus') ind.length_mm = 40;
    ind.heading = 0.4 * i - 0.6;
    const ph = entry.placeholder();
    const root = ph.root;
    scene.add(root);
    const driver = entry.create();
    driver.attach(root, ind, {}, {}, []);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    animals.push({ ind, driver, root });
  }
  frame();
  info();
}

function intent(kind, extra = {}) {
  for (const a of animals) {
    const t = a.ind.pos.clone().add(new THREE.Vector3(0.12, 0, 0.05));
    a.driver.setIntent({ id: Math.random(), kind, urgency: kind === 'flee' ? 1 : 0.5, seconds: 6, target: t, ...extra });
  }
}

function frame() {
  const sp = defs[state.species];
  const L = sp.model.modelLength_mm / 1000;
  const d = sp.locomotion === 'swim' ? L * 9 : L * 7;
  camera.position.set(d * 0.6, d * 0.55, d * 0.9);
  controls.target.set(0, L * 0.25 + (sp.locomotion === 'swim' ? waterY - 0.06 : 0), 0);
  controls.update();
}

function info() {
  const sp = defs[state.species];
  document.getElementById('info').textContent = `${sp.names.ja}  ${sp.names.sci}\n${animals.map((a) => `${a.ind.length_mm} mm ${a.ind.sex} ${a.ind.stage}`).join('\n')}`;
}

function seg(id, items, on, pick) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const [k, label] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = k === on() ? 'on' : '';
    b.onclick = () => { pick(k); seg(id, items, on, pick); };
    el.appendChild(b);
  }
}
seg('species', SPECIES.map((id) => [id, defs[id].names.ja]), () => state.species, (k) => { state.species = k; build(); });
seg('intents', [['rest', '休む'], ['wander', '歩く'], ['forage', '採餌'], ['display', '威嚇'], ['flee', '逃げる'], ['burrow', '潜る'], ['special', '特別']], () => '', (k) => intent(k));
seg('places', [['water', '水中'], ['dry', '干出'], ['tank', '水槽']], () => state.place, (k) => { state.place = k; waterY = k === 'dry' ? -0.05 : 0.12; water.visible = k !== 'dry'; });

let simTime = 0;
function step(dt) {
  simTime += dt;
  const bounds = state.place === 'tank' || state.species === 'mugil_cephalus' ? { minX: -0.3, maxX: 0.3, minZ: -0.2, maxZ: 0.2 } : undefined;
  for (const a of animals) a.driver.update(dt, { floor, player: camera.position, simScale: 1, nowMs: simTime * 1000, locked: true, bounds, minDepth: undefined });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
build();
water.position.y = waterY;

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!capture) step(dt);
  water.position.y = waterY;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// scripted renders: pick a species and a place, run some intents for a while, set the view
window.__shore = {
  async shot({ species, place = 'water', steps = [], cam, target }) {
    state.species = species; state.place = place;
    waterY = place === 'dry' ? -0.05 : 0.12; water.visible = place !== 'dry';
    build();
    for (const [kind, secs] of steps) { if (kind) intent(kind); for (let t = 0; t < secs; t += 1 / 30) step(1 / 30); }
    if (cam) camera.position.set(...cam);
    if (target) controls.target.set(...target);
    controls.update();
    renderer.render(scene, camera);
    return animals.map((a) => a.ind.pos.toArray().map((v) => +v.toFixed(3)));
  },
};
