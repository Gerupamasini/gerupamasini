import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { MudflatWorld } from '../world/MudflatWorld.js';
import { Water } from '../world/Water.js';
import { Sediment } from '../world/Sediment.js';
import { HandNet, PredatorProxy, CameraThreat, PreyField } from '../world/Actors.js';
import { Edohaze } from '../creatures/edohaze/Edohaze.js';
import { EdohazeDebug } from '../creatures/edohaze/EdohazeDebug.js';
import { S as STATES } from '../creatures/edohaze/EdohazeBehavior.js';

// URL options: ?fish=8&seed=3&shot=profile|top|front|close&pause=1&debug=1&t=5
const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.002, 30);
camera.position.set(0.12, 0.12, 0.18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.02; controls.maxDistance = 3;

const world = new MudflatWorld(scene, { seed: num('seed', 3) });
const water = new Water(scene, world, renderer);
const sediment = new Sediment(scene);
if (Q.has('neutral')) { water.setNeutral(true); sediment.points.visible = false; }
const net = new HandNet(scene, world);
const predator = new PredatorProxy(scene, world);
const player = new CameraThreat(camera);
const prey = new PreyField(scene, world);
world.threats.push(net, predator, player);
player.active = false;

// ---- fish -------------------------------------------------------------
const fishes = [];
const N = num('fish', 8);
for (let i = 0; i < N; i++) {
  const b = world.burrows[i % world.burrows.length];
  const a = i * 2.4;
  const p = new THREE.Vector3(b.opening.x + Math.cos(a) * 0.06, 0, b.opening.z + Math.sin(a) * 0.06);
  const f = new Edohaze({ world, seed: num('seed', 3) * 100 + i + 1, position: p, yaw: a + 1.3 });
  scene.add(f.object); fishes.push(f);
}
world.fish = fishes;

// ---- GUI / debug -------------------------------------------------------
const gui = new GUI({ title: 'Mudflat / Edohaze' });
if (Q.has('nogui')) { gui.hide(); document.getElementById('hud').style.display = 'none'; }
const params = { timeScale: 1, follow: 0, followOn: !Q.has('shot'), tideManual: false, tideLevel: world.tide.mean, month: world.month, daylight: 1, visibility: world.visibility, cameraIsThreat: false, predator: true, forceLOD: -1, escapeSelected: () => { const f = fishes[params.follow]; f.behavior.pendingEscape = { t: 0.01, threat: { th: net, d: 0.05, loom: 1, dir: new THREE.Vector3(1, 0, 0), vis: 1, size: 0.1, closing: 0.5 } }; } };
gui.add(params, 'timeScale', 0, 2, 0.05);
gui.add(params, 'follow', 0, Math.max(0, N - 1), 1).name('follow fish #');
gui.add(params, 'followOn').name('camera follows');
const env = gui.addFolder('Environment');
env.add(params, 'tideManual').name('manual tide').onChange((v) => { world.tide.manual = v ? params.tideLevel : null; });
env.add(params, 'tideLevel', -0.05, 0.4, 0.001).onChange((v) => { if (params.tideManual) world.tide.manual = v; });
env.add(params, 'month', 1, 12, 1).onChange((v) => { world.month = v; });
env.add(params, 'daylight', 0.05, 1, 0.01).onChange((v) => { world.daylight = v; });
env.add(params, 'visibility', 0.3, 3, 0.05).onChange((v) => { world.visibility = v; });
env.add(params, 'cameraIsThreat').name('camera = diver threat').onChange((v) => { player.active = v; });
env.add(params, 'predator').onChange((v) => { predator.active = v; predator.object.visible = v; });
const fishF = gui.addFolder('Fish');
fishF.add(params, 'forceLOD', -1, 2, 1).onChange((v) => fishes.forEach((f) => { f.lod.forced = v; }));
fishF.add(params, 'escapeSelected').name('trigger escape (followed)');
const debug = new EdohazeDebug(scene, camera, document.body, gui);
if (Q.has('debug')) debug.opts.enabled = true;

// ---- input: click to sweep the net --------------------------------------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(world.terrain)[0];
  if (hit) net.sweepTo(hit.point);
});
addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') params.follow = (params.follow + 1) % N; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---- screenshot presets (for validation) ---------------------------------
function applyShot(kind, f) {
  const p = f.loco.pos, L = f.TL;
  const fwd = f.loco.forward(new THREE.Vector3()).setY(0).normalize();
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const tgt = p.clone();
  switch (kind) {
    case 'profile': camera.position.copy(p).addScaledVector(left, 2.6 * L).add(new THREE.Vector3(0, 0.1 * L, 0)); break;
    case 'top': camera.position.copy(p).add(new THREE.Vector3(0, 2.8 * L, 0)).addScaledVector(fwd, 0.001); break;
    case 'front': camera.position.copy(p).addScaledVector(fwd, 2.2 * L).add(new THREE.Vector3(0, 0.25 * L, 0)); break;
    case 'front34': camera.position.copy(p).addScaledVector(fwd, 1.5 * L).addScaledVector(left, 1.3 * L).add(new THREE.Vector3(0, 0.6 * L, 0)); break;
    case 'rear34': camera.position.copy(p).addScaledVector(fwd, -1.7 * L).addScaledVector(left, 1.2 * L).add(new THREE.Vector3(0, 0.7 * L, 0)); break;
    case 'belly': camera.position.copy(p).add(new THREE.Vector3(0, -0.4 * L, 0)).addScaledVector(left, 1.8 * L); tgt.y -= 0.2 * L; break;
    case 'head': camera.position.copy(p).addScaledVector(fwd, 0.9 * L).addScaledVector(left, 0.7 * L).add(new THREE.Vector3(0, 0.35 * L, 0)); tgt.addScaledVector(fwd, 0.3 * L); break;
    case 'wide': camera.position.copy(p).add(new THREE.Vector3(0.25, 0.18, 0.3)); break;
  }
  controls.target.copy(tgt); camera.lookAt(tgt);
}

// ---- loop -------------------------------------------------------------------
const timer = new THREE.Timer();
let simTime = 0;
const followPrev = new THREE.Vector3();
function step(dt) {
  simTime += dt;
  world.update(dt);
  net.update(dt); predator.update(dt, fishes); player.update(dt); prey.update(dt);
  for (const f of fishes) f.update(dt, camera, renderer.domElement.clientHeight);
}
function frame() {
  timer.update();
  const raw = Math.min(timer.getDelta(), 1 / 20);           // clamp long frames (tab switches)
  const dt = raw * params.timeScale;
  if (dt > 0) step(dt);
  const f = fishes[params.follow];
  if (params.followOn && f) {
    const d = f.loco.pos.clone().sub(followPrev);
    camera.position.add(d); controls.target.add(d);
  }
  if (f) followPrev.copy(f.loco.pos);
  controls.update();
  if (dt === 0) for (const f of fishes) f.updateLOD(camera, renderer.domElement.clientHeight);
  water.update(camera, controls.target);
  sediment.update(simTime, controls.target, world.getWaterLevel(), world.getGroundHeight(controls.target.x, controls.target.z), renderer.domElement.clientHeight);
  debug.update(fishes, renderer);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// warm-up simulation for screenshots, then place camera
const warm = num('t', 0);
for (let t = 0; t < warm; t += 1 / 60) step(1 / 60);
if (Q.has('shot')) {
  const f = fishes[num('follow', 0)];
  params.follow = num('follow', 0);
  if (Q.has('pose')) { f.behavior.setState(STATES.BOTTOM_REST, {}, 1e9); }
  applyShot(Q.get('shot'), f);
  followPrev.copy(f.loco.pos);
  params.followOn = true;
  if (Q.has('pause')) params.timeScale = 0;
} else {
  controls.target.copy(fishes[0].loco.pos); followPrev.copy(fishes[0].loco.pos);
}
window.__edo = { fishes, world, camera, controls, params, step, applyShot, renderer, scene };
frame();
