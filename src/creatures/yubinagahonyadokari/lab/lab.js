// Stand-alone lab for ユビナガホンヤドカリ (hermit-lab.html): renders individuals on a small patch of
// tidal-flat substrate for close inspection, screenshots and tuning. Not part of the game loop.
//
// URL parameters:
//   mode=single|pose|walk|retract|shells|group|change   scenario
//   view=oblique|front|side|top|back|macro|dactyl|follow camera preset
//   lod=0|1|2   seed=n   shell=<species key>   water=0|1   debug=1   t=<seconds to pre-simulate>   shot=1
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HermitCrab, PagurusWorld, STATE } from '../PagurusMinutus.js';
import { SHELL_SPECIES, SHELL_SPECIES_KEYS, Shell } from '../PagurusMinutusShell.js';

const params = new URLSearchParams(location.search);
const P = (k, d) => params.get(k) ?? d;
const mode = P('mode', 'single');
if (P('shot', '0') === '1') document.body.classList.add('shot');

// ── renderer / scene ─────────────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4b8);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.0008, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(0.35, 0.9, 0.25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -0.12; sun.shadow.camera.right = 0.12; sun.shadow.camera.top = 0.12; sun.shadow.camera.bottom = -0.12;
sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 3;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.0004;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4b38, 0.35));

// ── substrate: muddy sand with ripples, pebbles and shell grit ────────────────────────────────
const pebbles = [];
{
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) pebbles.push({ x: (r() - 0.5) * 0.3, z: (r() - 0.5) * 0.3, r: 0.003 + r() * 0.007, h: 0.0012 + r() * 0.003 });
}
const groundAt = (x, z) => {
  let h = 0.0006 * Math.sin(x * 160 + Math.sin(z * 40) * 1.5) + 0.0004 * Math.sin(z * 230 + x * 30) + 0.015 * Math.sin(x * 6) * Math.cos(z * 5);
  for (const p of pebbles) {
    const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
    if (d2 < 1) h += p.h * Math.sqrt(1 - d2);
  }
  return h;
};
const waterOn = P('water', '1') === '1';
let waterY = 0.03;
const waterAt = () => (waterOn ? waterY : -1);
{
  const N = 260, S = 0.4;
  const g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundAt(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 90 + Math.cos(z * 70) * 2) * Math.sin(z * 55);
    const peb = pebbles.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r);
    const grit = Math.sin(x * 2100.0 + z * 1300.0) * Math.sin(z * 1700.0 - x * 900.0);
    if (peb) c.setRGB(0.2 + 0.06 * n, 0.19 + 0.05 * n, 0.17 + 0.04 * n);
    else c.setRGB(0.16 + 0.03 * n + 0.02 * grit, 0.14 + 0.025 * n + 0.02 * grit, 0.1 + 0.02 * n + 0.015 * grit);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);
}
let water = null;
if (waterOn) {
  water = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x6f9a92, roughness: 0.04, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1 }));
  water.position.y = waterY;
  water.renderOrder = 5;
  scene.add(water);
}

// ── crabs ────────────────────────────────────────────────────────────────────────────────────
const world = PagurusWorld.of(scene);
world.autoSpawn = false;
const crabs = [];
const lodSel = Number(P('lod', mode === 'group' ? '1' : '0'));
function addCrab(opts, pos, heading) {
  const crab = new HermitCrab({ lod: lodSel, ...opts });
  scene.add(crab.root);
  crab.world = world;
  world.register(crab);
  crab.placeAt(pos, heading, { groundAt });
  crab.debugEnabled = P('debug', '0') === '1';
  crabs.push(crab);
  return crab;
}
const seed = Number(P('seed', '7'));
const shellKey = P('shell', 'batillaria_attramentaria');
const player = new THREE.Vector3(0.6, 1.5, 1.2);
let playerOverride = null;

if (mode === 'shells') {
  SHELL_SPECIES_KEYS.forEach((k, i) => {
    const sp = SHELL_SPECIES[k];
    addCrab({ seed: seed + i, sex: i % 2 ? 'f' : 'm', shieldLength_mm: 4.6, shell: { species: k, size_mm: sp.sizeMeasure === 'height' ? 23 : 14, seed: i + 1, fouling: 0.3 } }, new THREE.Vector3((i - 2) * 0.042, 0, 0.0), 0);
    world.addShell({ species: k, size_mm: sp.typical_mm, seed: 20 + i, fouling: 0.1 }, new THREE.Vector3((i - 2) * 0.042, 0, -0.045), groundAt);
  });
} else if (mode === 'group') {
  for (let i = 0; i < 9; i++) addCrab({ seed: seed + i * 13 }, new THREE.Vector3(((i % 3) - 1) * 0.04, 0, (Math.floor(i / 3) - 1) * 0.04), i * 1.3);
  world.addFood('carrion', new THREE.Vector3(0.01, 0, 0.02), groundAt);
  world.addFood('algae', new THREE.Vector3(-0.05, 0, -0.03), groundAt);
} else if (mode === 'change') {
  addCrab({ seed, sex: 'm', shieldLength_mm: 4.8, shell: { species: 'reticunassa_festiva', size_mm: 10, damage: 0.75, seed: 3 } }, new THREE.Vector3(0, 0, 0), 0);
  world.addShell({ species: 'umbonium_moniliferum', size_mm: 14.5, seed: 9, fouling: 0.1 }, new THREE.Vector3(0.004, 0, 0.032), groundAt);
} else {
  addCrab({ seed, sex: P('sex', 'm'), shieldLength_mm: Number(P('sl', '4.8')), shell: { species: shellKey, size_mm: Number(P('size', SHELL_SPECIES[shellKey].sizeMeasure === 'height' ? 24 : 14.5)), seed: 5, fouling: Number(P('fouling', '0.35')) } }, new THREE.Vector3(0, 0, 0), Number(P('heading', '0')));
}

const main = crabs[0];
function scriptAI(crab, t) {
  const B = crab.behavior;
  if (mode === 'pose') {
    if (B.state !== STATE.IDLE) B.enter(STATE.IDLE, crab.lastEnv ?? { groundAt });
    B.stateDur = 1e9;
    B.internal.fear = 0;
  } else if (mode === 'walk') {
    if (B.state !== STATE.EXPLORE) B.enter(STATE.EXPLORE, crab.lastEnv ?? { groundAt });
    B.stateDur = 1e9;
    const a = t * 0.25;
    B.moveTarget.set(Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06);
  } else if (mode === 'retract') {
    playerOverride = t > 1.0 ? new THREE.Vector3(main.loco.position.x + 0.15, 0.3, main.loco.position.z + 0.15) : new THREE.Vector3(5, 1.5, 5);
  }
}

// ── camera presets ───────────────────────────────────────────────────────────────────────────
const VIEWS = {
  oblique: [0.045, 0.032, 0.07], front: [0.0, 0.012, 0.075], side: [0.085, 0.012, -0.004], top: [0.0, 0.095, 0.002],
  back: [-0.045, 0.035, -0.07], macro: [0.022, 0.012, 0.042], dactyl: [0.04, 0.006, 0.03], wide: [0.12, 0.12, 0.2],
};
let viewName = P('view', mode === 'shells' ? 'wide' : 'oblique');
function applyView(name) {
  viewName = name;
  const v = VIEWS[name] ?? VIEWS.oblique;
  const tgt = mode === 'shells' || mode === 'group' ? new THREE.Vector3(0, 0.006, -0.01) : main.root.position.clone().add(new THREE.Vector3(0, 0.006, 0.004));
  controls.target.copy(tgt);
  camera.position.copy(tgt).add(new THREE.Vector3(...v));
  if (name === 'macro' || name === 'dactyl') camera.fov = 28;
  camera.updateProjectionMatrix();
  controls.update();
}

// ── UI ───────────────────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
for (const k of SHELL_SPECIES_KEYS) {
  const o = document.createElement('option');
  o.value = k; o.textContent = `${SHELL_SPECIES[k].ja} ${SHELL_SPECIES[k].sci}`;
  if (k === shellKey) o.selected = true;
  $('shell').appendChild(o);
}
$('shell').onchange = () => { params.set('shell', $('shell').value); location.search = params.toString(); };
$('lod').value = String(lodSel);
$('lod').onchange = () => crabs.forEach((c) => c.setLOD(Number($('lod').value)));
$('debug').checked = P('debug', '0') === '1';
$('debug').onchange = () => crabs.forEach((c) => (c.debugEnabled = $('debug').checked));
$('water').checked = waterOn;
$('water').onchange = () => { params.set('water', $('water').checked ? '1' : '0'); location.search = params.toString(); };
let timeScale = 1;
$('speed').oninput = () => (timeScale = Number($('speed').value));
$('scare').onclick = () => crabs.forEach((c) => c.behavior.suggest({ kind: 'flee', urgency: 1, seconds: 3, from: camera.position.clone() }));
$('food').onclick = () => world.addFood(Math.random() < 0.6 ? 'carrion' : 'algae', new THREE.Vector3(main.loco.position.x + (Math.random() - 0.5) * 0.06, 0, main.loco.position.z + 0.03), groundAt);
$('emptyShell').onclick = () => {
  const k = SHELL_SPECIES_KEYS[Math.floor(Math.random() * SHELL_SPECIES_KEYS.length)];
  world.addShell({ species: k, size_mm: SHELL_SPECIES[k].typical_mm * 1.2, seed: Math.floor(Math.random() * 1000) }, new THREE.Vector3(main.loco.position.x + 0.03, 0, main.loco.position.z + 0.02), groundAt);
};
$('more').onclick = () => addCrab({ seed: Math.floor(Math.random() * 1e6) }, new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1), Math.random() * 6);

// ── loop ─────────────────────────────────────────────────────────────────────────────────────
let frame = 0, simTime = 0;
function step(dt) {
  simTime += dt;
  frame++;
  for (const c of crabs) {
    if (c === main) scriptAI(c, simTime);
    c.update(dt, {
      groundAt, waterAt, player: playerOverride ?? camera.position, frame, season: 'summer', sunElevation: 50,
      closeup: c.lod === 0, tank: mode === 'pose',
    });
    if (P('hideAbd', '0') === '1') { for (const b of c.rig.abdomen) b.scale.setScalar(0.001); c.rig.root.updateMatrixWorld(true); }
  }
}
const preSim = Number(P('t', mode === 'pose' ? '1.5' : '0'));
for (let t = 0; t < preSim; t += 1 / 60) step(1 / 60);
applyView(viewName);
let last = performance.now();
const hud = $('hud');
window.__lab = {
  ready: false, frames: 0, crabs, world, step: (s) => { for (let t = 0; t < s; t += 1 / 60) step(1 / 60); }, view: applyView,
  stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs?.length }),
};
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
  last = now;
  if (P('shot', '0') !== '1') step(dt);
  if (viewName === 'follow') { controls.target.lerp(main.root.position, 0.1); }
  controls.update();
  renderer.render(scene, camera);
  window.__lab.frames++;
  if (window.__lab.frames > 2) window.__lab.ready = true;
  if (frame % 10 === 0) {
    const s = main.behavior.snapshot();
    hud.textContent = `${s.state} ${s.sub}  LOD${main.lod}  shell ${main.shell?.props.ja} ${main.shell?.size_mm.toFixed(1)}mm ${main.shell?.props.mass_g.toFixed(2)}g\n` +
      `fear ${s.fear.toFixed(2)} hunger ${s.hunger.toFixed(2)} shellSat ${s.shellSatisfaction.toFixed(2)} curiosity ${s.curiosity.toFixed(2)} energy ${s.energy.toFixed(2)} activity ${s.activity.toFixed(2)}\n` +
      `draw calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
export { Shell };
