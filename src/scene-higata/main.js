// 干潟 — a few エドハゼ and マハゼ on a sandy-mud flat under 10 cm of water.
//
// Photoreal procedural goby models and their behaviour come from the model branches
// (claude/adoring-faraday-h25n7c: マハゼ juvenile, claude/awesome-ride-3rde4w: エドハゼ adult); this page
// puts several individuals of both species into one natural scene and renders it in the same way as the
// single-fish viewer (volumetric translucent bodies refracting the scene behind them, thin-slab fins,
// refracting eyes), extended with the water surface, caustics from the actual ripples, the mudflat with
// burrows, silt and a macro depth of field.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import mahazeUrl from '@/assets/models/mahaze/mahaze_juvenile.hero.glb?url';
import edohazeUrl from '@/assets/models/edohaze/edohaze.hero.glb?url';
import { createWaves } from './world/waves.js';
import { Mudflat, MAX_FISH } from './world/Terrain.js';
import { SKY_UNIFORMS, createUnderwaterBackground, createSkyBackground, createSurfaceBelow, createSurfaceAbove } from './world/Water.js';
import { createSuspended, createPuffs } from './world/Silt.js';
import { createDebris } from './world/Debris.js';
import { mulberry32 } from './world/noise.js';
import { loadSpecies, createIndividual, updateIndividual, writeShadow, LAYER_FISH, LAYER_BEHIND } from './fish/Goby.js';
import { createPost } from './render/Post.js';

const LAYER_FX = 6;      // particles: main pass only
const LAYER_ABOVE = 5;   // sky and the surface seen from above
const params = new URLSearchParams(location.search);
const WATER_Y = 0.1;
const SEED = Number(params.get('seed')) || 20261001;

// ------------------------------------------------------------------------------------------ renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) {
  fail('WebGL2 と浮動小数点レンダーターゲット (EXT_color_buffer_float) に対応したブラウザが必要です。');
}
renderer.toneMapping = THREE.NoToneMapping;
const MAX_DPR = Math.min(window.devicePixelRatio || 1, Number(params.get('dpr')) || 1.5);
let pixelRatio = MAX_DPR;
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.002, 20);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 0.012;
controls.maxDistance = 1.4;
controls.zoomSpeed = 0.8;
controls.rotateSpeed = 0.6;
controls.screenSpacePanning = false;

// ------------------------------------------------------------------------------------------ shared uniforms
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const waves = createWaves({ windDir: 0.7, depth: WATER_Y });
const shared = {
  uLightDir: { value: v3(0.3, 0.9, 0.2).normalize() },
  uLightColor: { value: v3(2.7, 2.65, 2.45) },
  uWaterDeep: { value: v3(0.2, 0.185, 0.15) },
  uWaterUp: { value: v3(0.17, 0.18, 0.15) },
  uSurfaceGlow: { value: v3(0.42, 0.52, 0.6) },
  uAmbUp: { value: v3(0.21, 0.245, 0.25) },
  uAmbDown: { value: v3(0.15, 0.13, 0.1) },
  uFogColor: { value: v3(0.16, 0.172, 0.14) },
  uFogDensity: { value: 2.2 },
  uTime: { value: 0 },
  uScatter: { value: 1.0 },
  uInterior: { value: 0.45 },
  uCausticAmt: { value: 0.7 },
  uCausticGain: { value: 7.0 }, // long, low swells focus weakly: broad soft bands of light
  uCausticFish: { value: 0.5 },
  uWaterY: { value: WATER_Y },
  uFinDensity: { value: 1.0 },
  uFinGrazeMin: { value: 0.1 },
  uFinEdge: { value: v3(0.03, 0.3, 0) },
  uFinOpCap: { value: v3(1, 0, 0) },
  uDebug: { value: 0 },
  uFloorY: { value: -1e3 },
  uBg: { value: null },
  uResolution: { value: new THREE.Vector2(1, 1) },
  ...waves.uniforms,
};
shared.uWaveGain.value = Number(params.get('wind')) || 1.0; // the spectrum itself is a near-calm swell
const sky = SKY_UNIFORMS();

// sun: direction in air → refracted direction and transmitted irradiance in the water
const SUN = { elevation: Number(params.get('sunEl')) || 52, azimuth: Number(params.get('sunAz')) || 215 };
function updateSun() {
  const el = THREE.MathUtils.degToRad(SUN.elevation), az = THREE.MathUtils.degToRad(SUN.azimuth);
  const s = sky.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  const cosI = s.y, sinI = Math.sqrt(1 - cosI * cosI);
  const sinT = sinI / 1.333, cosT = Math.sqrt(1 - sinT * sinT);
  const h = Math.hypot(s.x, s.z) || 1;
  shared.uLightDir.value.set((s.x / h) * sinT, cosT, (s.z / h) * sinT);
  // Fresnel transmission, beam compression, absorption of ~11 cm of turbid estuarine water
  const rs = (cosI - 1.333 * cosT) / (cosI + 1.333 * cosT), rp = (cosT - 1.333 * cosI) / (cosT + 1.333 * cosI);
  const T = 1 - 0.5 * (rs * rs + rp * rp);
  const path = WATER_Y / cosT;
  const E = 3.3 * Math.min(1, Math.sin(el) * 2.2);
  const warm = THREE.MathUtils.smoothstep(SUN.elevation, 5, 35);
  const k = E * T * (cosI / cosT);
  shared.uLightColor.value.set(k * Math.exp(-1.2 * path) * (1.0), k * Math.exp(-0.7 * path) * (0.93 + 0.05 * warm), k * Math.exp(-1.0 * path) * (0.78 + 0.13 * warm));
  sky.uSunRad.value.set(E, E * (0.92 + 0.06 * warm), E * (0.78 + 0.16 * warm));
}
updateSun();

// ------------------------------------------------------------------------------------------ render targets
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
const envRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
const mainRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, samples: 4 });
mainRT.depthTexture = new THREE.DepthTexture(4, 4);
mainRT.depthTexture.type = THREE.FloatType;
const compRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false });
// mirror image of the gobies in the underside of the surface (half resolution)
const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true });
const reflCam = new THREE.PerspectiveCamera();
shared.uBg.value = envRT.texture;
const post = createPost();
post.material.uniforms.uDepth.value = mainRT.depthTexture;
post.material.uniforms.uNear.value = camera.near;
post.material.uniforms.uFar.value = camera.far;
post.material.uniforms.uExposure.value = Number(params.get('exposure')) || 1.5;

// ------------------------------------------------------------------------------------------ world
const flat = new Mudflat({ seed: SEED % 1000 + 3 });
const terrain = flat.build(shared);
scene.add(terrain, createDebris(shared, flat, { seed: SEED % 977 }));
const underBg = createUnderwaterBackground(shared);
const surfBelow = createSurfaceBelow(shared, sky);
scene.add(underBg, surfBelow);
const skyBg = createSkyBackground(shared, sky);
const surfAbove = createSurfaceAbove(shared, sky);
surfAbove.material.uniforms.uUnder.value = mainRT.texture;
surfBelow.material.uniforms.uRefl.value = reflRT.texture;
surfAbove.material.uniforms.uUnderDist.value = envRT.texture;
skyBg.layers.set(LAYER_ABOVE);
surfAbove.layers.set(LAYER_ABOVE);
const aboveScene = new THREE.Scene();
aboveScene.add(skyBg, surfAbove);
const suspended = createSuspended(shared);
suspended.layers.set(LAYER_FX);
const puffs = createPuffs(shared, (x, z) => flat.height(x, z));
puffs.object.layers.set(LAYER_FX);
scene.add(suspended, puffs.object);

// ------------------------------------------------------------------------------------------ fish
const fish = [];
const behaviors = [];
const camVel = new THREE.Vector3();
const world = {
  ground: (x, z) => flat.height(x, z),
  normal: (x, z, s, out) => flat.normal(x, z, s, out),
  holeAt: (x, z, m) => flat.holeAt(x, z, m),
  others: (self) => behaviors.filter((b) => b !== self),
  threat: () => (state.threats ? { pos: camera.position, vel: camVel } : null),
  silt: (p, v, n, s) => puffs.emit(p, v, n, s),
  alarm: (self, pos, strength) => {
    for (const b of behaviors) {
      if (b === self) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < 0.14) b.alarm(strength * (1 - d / 0.14));
    }
  },
};

const state = { threats: !params.has('calm'), dof: params.get('dof') !== '0', paused: false, focus: 0, userT: 0, auto: !params.has('cam'), above: false, ready: false };

function placeFish(spEdo, spMaha) {
  const rng = mulberry32(SEED);
  const rand = (a, b) => a + rng() * (b - a);
  const nEdo = Math.min(4, Number(params.get('edo') ?? 3));
  const nMaha = Math.min(4, Number(params.get('maha') ?? 3));
  // エドハゼ: each owns one of the mud-shrimp burrows near the middle
  const near = flat.burrows.filter((b) => !b.far).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const homes = [];
  for (const b of near) {
    if (homes.length >= nEdo) break;
    if (homes.some((h) => Math.hypot(h.x - b.x, h.z - b.z) < 0.09)) continue;
    homes.push(b);
  }
  let slot = 0;
  homes.forEach((b, i) => {
    b.owner = i;
    const a = rand(0, Math.PI * 2), d = b.r + rand(0.014, 0.03);
    const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
    const scale = rand(0.92, 1.1);
    const f = createIndividual(spEdo, {
      shared, world, slot: slot++, scale, rng,
      tint: [rand(0.94, 1.06), rand(0.95, 1.04), rand(0.92, 1.04)], melanin: rand(0.9, 1.15),
      start: { x, z, heading: Math.atan2(x - b.x, z - b.z) + rand(-0.8, 0.8) },
      home: { x: b.x, z: b.z }, range: 0.07, burrow: b, startHidden: i === 1,
    });
    fish.push(f);
  });
  // マハゼ: juveniles spread over the open, sandier ground
  for (let i = 0; i < nMaha; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 60; k++) {
      const a = rand(0, Math.PI * 2), d = rand(0.06, 0.26);
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      if (flat.holeAt(x, z, 0.03)) continue;
      if (fish.some((o) => Math.hypot(o.behavior.pos.x - x, o.behavior.pos.z - z) < 0.06)) continue;
      break;
    }
    const sand = flat.sandiness(x, z);
    const f = createIndividual(spMaha, {
      shared, world, slot: slot++, scale: rand(0.86, 1.12), rng,
      tint: [rand(0.95, 1.05), rand(0.95, 1.04), rand(0.92, 1.03)], melanin: 1.18 - 0.3 * sand + rand(-0.06, 0.06),
      start: { x, z, heading: rand(-Math.PI, Math.PI) },
      home: { x, z }, range: rand(0.12, 0.2),
    });
    fish.push(f);
  }
  for (const f of fish) {
    scene.add(f.root);
    behaviors.push(f.behavior);
    // settle into a resting pose before the first frame
    for (let t = 0; t < 0.6; t += 1 / 60) updateIndividual(f, 1 / 60);
  }
}

// ------------------------------------------------------------------------------------------ loading
const progressEl = document.getElementById('progress');
const progressBar = progressEl.querySelector('.bar i');
const progressText = progressEl.querySelector('.msg');
const prog = { maha: 0, edo: 0 };
const showProg = () => {
  const f = (prog.maha + prog.edo) / 2;
  progressBar.style.width = `${Math.round(f * 95)}%`;
  progressText.textContent = `ハゼを読み込み中… ${Math.round(f * 100)}%`;
};
// hosts that cap file sizes get the models split into glTF + buffer + textures (tools/scene/build-web.mjs)
const MODEL_URLS = { mahaze: mahazeUrl, edohaze: edohazeUrl, ...(window.HIGATA_MODEL_URLS || {}) };
Promise.all([
  loadSpecies('mahaze', MODEL_URLS.mahaze, (f) => { prog.maha = f; showProg(); }),
  loadSpecies('edohaze', MODEL_URLS.edohaze, (f) => { prog.edo = f; showProg(); }),
]).then(([spMaha, spEdo]) => {
  progressText.textContent = 'シェーダーを準備中…';
  placeFish(spEdo, spMaha);
  if (fish.length > MAX_FISH) throw new Error('too many fish');
  setInitialView();
  // compile everything before the first visible frame
  renderer.compile(scene, camera);
  state.ready = true;
  progressEl.hidden = true;
  document.body.classList.add('ready');
  window.__higataScene = { fish, camera, controls, THREE, state, shared, flat, scene, post, snapFocus, camVel, renderExternal, advance: (dt) => stepWorld(dt), step: (sec) => { for (let t = 0; t < sec; t += 1 / 60) stepWorld(1 / 60); }, frameCount: 0 };
}).catch((err) => fail(`読み込みに失敗しました: ${err && err.message ? err.message : err}`));

// ------------------------------------------------------------------------------------------ camera
const camGoal = { target: new THREE.Vector3(), pos: new THREE.Vector3(), active: false };
function fishCenter(f, out = new THREE.Vector3()) {
  const b = f.behavior;
  if (b.state.inPath && b.state.burrow) return out.set(b.state.burrow.x, b.state.burrow.rimY + 0.004, b.state.burrow.z);
  return out.copy(f.root.position).add(_tmp.set(0, 0.003, 0));
}
const _tmp = new THREE.Vector3();
function setInitialView() {
  // low under water, a few centimetres off the bottom, looking at an エドハゼ at its burrow
  const f = fish[0];
  state.focus = 0;
  const c = fishCenter(f);
  const b = f.behavior.state;
  const side = b.heading + Math.PI / 2 + 0.5;
  controls.target.copy(c);
  camera.position.set(c.x + Math.sin(side) * 0.15, c.y + 0.03, c.z + Math.cos(side) * 0.15);
  if (params.get('cam')) {
    const v = params.get('cam').split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]);
    controls.target.set(v[3], v[4], v[5]);
  }
  controls.update();
}
function viewPreset(kind) {
  const f = fish[state.focus];
  const c = fishCenter(f);
  const dir = _tmp.subVectors(camera.position, controls.target).setY(0).normalize();
  if (dir.lengthSq() < 0.5) dir.set(1, 0, 0);
  camGoal.target.copy(c);
  if (kind === 'under') camGoal.pos.copy(c).addScaledVector(dir, 0.16).setY(c.y + 0.03);
  else if (kind === 'above') camGoal.pos.copy(c).addScaledVector(dir, 0.16).setY(WATER_Y + 0.2);
  else if (kind === 'macro') camGoal.pos.copy(c).addScaledVector(dir, 0.055).setY(c.y + 0.016);
  camGoal.active = true;
  state.userT = 0;
}
/** jump the focus distance (after a cut) instead of racking it */
function snapFocus() { focusSnap = true; }
function nextFish(delta = 1) {
  state.focus = (state.focus + delta + fish.length) % fish.length;
  const c = fishCenter(fish[state.focus]);
  const off = _tmp.subVectors(camera.position, controls.target);
  const len = THREE.MathUtils.clamp(off.length(), 0.06, 0.25);
  camGoal.target.copy(c);
  camGoal.pos.copy(c).add(off.setLength(len));
  camGoal.active = true;
}
let userBusy = false;
controls.addEventListener('start', () => { userBusy = true; camGoal.active = false; state.userT = 0; });
controls.addEventListener('end', () => { userBusy = false; });

// double click / tap on a goby: focus on it
canvas.addEventListener('dblclick', (e) => {
  const r = canvas.getBoundingClientRect();
  let best = -1, bestD = 70;
  fish.forEach((f, i) => {
    if (!f.root.visible) return;
    const p = fishCenter(f).project(camera);
    if (p.z > 1) return;
    const x = (p.x * 0.5 + 0.5) * r.width, y = (-p.y * 0.5 + 0.5) * r.height;
    const d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) { state.focus = best; nextFish(0); }
});

const lastCam = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  state.userT += dt;
  const f = fish[state.focus];
  if (f) {
    // follow the focused fish softly (the target trails it, the camera keeps its offset)
    const c = fishCenter(f, _tmp2);
    const follow = userBusy ? 0 : 1 - Math.exp(-dt * (camGoal.active ? 0 : 1.6));
    const delta = _tmp3.subVectors(c, controls.target).multiplyScalar(follow);
    controls.target.add(delta);
    camera.position.add(delta);
    // documentary mode: after a while without input, drift slowly around and visit other fish
    if (state.auto && state.userT > 25 && !userBusy) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.25;
      if (state.userT > 70) {
        // prefer a fish that is visible and doing something
        let pick = (state.focus + 1) % fish.length;
        for (let k = 1; k < fish.length; k++) {
          const g = fish[(state.focus + k) % fish.length];
          if (g.root.visible && g.behavior.state.mode !== 'perch') { pick = (state.focus + k) % fish.length; break; }
        }
        state.focus = pick;
        nextFish(0);
        state.userT = 26;
      }
    } else controls.autoRotate = false;
  }
  if (camGoal.active) {
    const k = 1 - Math.exp(-dt * 2.4);
    controls.target.lerp(camGoal.target, k);
    camera.position.lerp(camGoal.pos, k);
    if (camera.position.distanceTo(camGoal.pos) < 0.0008) camGoal.active = false;
  }
  controls.update();
  // stay above the sediment and off the surface film
  const g = flat.height(camera.position.x, camera.position.z) + 0.006;
  if (camera.position.y < g) camera.position.y = g;
  const dw = camera.position.y - WATER_Y;
  if (Math.abs(dw) < 0.003) camera.position.y = WATER_Y + (dw >= 0 ? 0.003 : -0.003);
  // camera velocity (for the fishes' threat assessment), smoothed
  if (!camInit) { lastCam.copy(camera.position); camInit = true; }
  const v = _tmp3.subVectors(camera.position, lastCam).divideScalar(Math.max(dt, 1e-3));
  camVel.lerp(v, 1 - Math.exp(-dt * 12));
  lastCam.copy(camera.position);
  state.above = camera.position.y > WATER_Y;
}
const _tmp2 = new THREE.Vector3(), _tmp3 = new THREE.Vector3();

// ------------------------------------------------------------------------------------------ frame
const finList = [];
const _fv = new THREE.Vector3();
function sortFins() {
  // all fins of all fish, back to front (each fin: transmit pass then scatter pass)
  finList.length = 0;
  for (const f of fish) {
    if (!f.root.visible) continue;
    for (const fin of f.fins) finList.push({ fin, d: _fv.copy(fin.center).applyMatrix4(fin.mesh.matrixWorld).distanceToSquared(camera.position) });
  }
  finList.sort((a, b) => b.d - a.d);
  finList.forEach(({ fin }, i) => {
    fin.mesh.renderOrder = 100 + i * 2;
    fin.scatter.renderOrder = 101 + i * 2;
  });
}

function stepWorld(dt) {
  shared.uTime.value += dt;
  for (const f of fish) updateIndividual(f, dt);
  puffs.update(dt, shared.uTime.value);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  const bw = Math.max(1, Math.floor(w * pixelRatio)), bh = Math.max(1, Math.floor(h * pixelRatio));
  envRT.setSize(bw, bh);
  mainRT.setSize(bw, bh);
  compRT.setSize(bw, bh);
  reflRT.setSize(Math.max(1, bw >> 1), Math.max(1, bh >> 1));
  shared.uResolution.value.set(bw, bh);
  post.material.uniforms.uRes.value.set(bw, bh);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pxScale = bh * camera.projectionMatrix.elements[5] * 0.5;
  suspended.material.uniforms.uPxScale.value = pxScale;
  puffs.object.material.uniforms.uPxScale.value = pxScale;
  // circle of confusion scales with the image height
  post.material.uniforms.uDofK.value = state.dof ? 0.0042 * bh : 0;
  post.material.uniforms.uDofMax.value = 0.012 * bh;
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
const frozenTime = params.has('t') ? Number(params.get('t')) : null;
let focusDist = 0.15;
let focusSnap = true;
// adaptive resolution: keep the frame time around 16–25 ms by scaling the render resolution
const perf = { acc: 0, n: 0, wait: 2 };
function adaptResolution(rawDt) {
  if (params.has('dpr') || params.has('capture')) return;
  perf.acc += rawDt; perf.n++;
  if (perf.acc < 1.5) return;
  const ms = (perf.acc / perf.n) * 1000;
  perf.acc = 0; perf.n = 0;
  if (perf.wait-- > 0) return; // let shader compilation and loading settle
  let next = pixelRatio;
  if (ms > 26) next = Math.max(0.55, pixelRatio * 0.85);
  else if (ms < 13) next = Math.min(MAX_DPR, pixelRatio * 1.1);
  if (Math.abs(next - pixelRatio) > 0.02) { pixelRatio = next; resize(); }
}
function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 1 / 20);
  if (!state.ready || state.external) return;
  adaptResolution(rawDt);
  if (!state.paused) stepWorld(dt);
  if (frozenTime !== null) shared.uTime.value = frozenTime;
  updateCamera(dt);
  finishFrame(dt);
}

/**
 * Offline rendering (video capture): step the world by exactly dt, put the camera where the caller says
 * and draw one frame. The interactive loop stands still while state.external is set.
 */
function renderExternal(dt, pos, target, focus = null) {
  state.external = true;
  stepWorld(dt);
  const prev = _tmp3.copy(camera.position);
  camera.position.set(pos[0], pos[1], pos[2]);
  controls.target.set(target[0], target[1], target[2]);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  camVel.subVectors(camera.position, prev).divideScalar(dt);
  state.above = camera.position.y > WATER_Y;
  if (focus !== null) { focusDist = focus; focusSnap = false; }
  finishFrame(dt, focus !== null);
}

function finishFrame(dt, fixedFocus = false) {
  // shadows of all fish on the sediment
  const tu = flat.material.uniforms;
  for (const f of fish) writeShadow(f, tu.uShadow.value, tu.uCore.value, tu.uFishB.value);
  sortFins();
  surfBelow.position.set(camera.position.x, 0, camera.position.z);
  surfAbove.position.set(camera.position.x, 0, camera.position.z);
  suspended.material.uniforms.uCam.value.copy(camera.position);
  // focus: the fish being watched (or whatever the camera orbits)
  if (!fixedFocus) {
    const fd = fish[state.focus] ? camera.position.distanceTo(fishCenter(fish[state.focus], _tmp2)) : camera.position.distanceTo(controls.target);
    focusDist = focusSnap ? fd : focusDist + (fd - focusDist) * (1 - Math.exp(-dt * 6));
    focusSnap = false;
  }
  post.material.uniforms.uFocus.value = Math.max(focusDist, 0.01);
  post.material.uniforms.uTime.value = shared.uTime.value;
  render();
  if (window.__higataScene) window.__higataScene.frameCount++;
}

// virtual camera mirrored in the plane of the water surface (as three's Reflector does)
const _mn = new THREE.Vector3(0, -1, 0), _mp = new THREE.Vector3(), _mv = new THREE.Vector3(), _mt = new THREE.Vector3(), _mr = new THREE.Matrix4();
const reflBias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderReflection() {
  const u = surfBelow.material.uniforms;
  u.uReflOn.value = 0;
  if (state.above || params.has('norefl')) return;
  _mp.set(camera.position.x, WATER_Y, camera.position.z);
  _mv.subVectors(_mp, camera.position);
  _mv.reflect(_mn).negate().add(_mp);
  reflCam.position.copy(_mv);
  _mr.extractRotation(camera.matrixWorld);
  _mt.set(0, 0, -1).applyMatrix4(_mr).add(camera.position);
  _mv.subVectors(_mp, _mt).reflect(_mn).negate().add(_mp);
  reflCam.up.set(0, 1, 0).applyMatrix4(_mr).reflect(_mn);
  reflCam.lookAt(_mv);
  reflCam.near = camera.near; reflCam.far = camera.far;
  reflCam.updateMatrixWorld();
  reflCam.projectionMatrix.copy(camera.projectionMatrix);
  reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  u.uReflMat.value.copy(reflBias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  reflCam.layers.set(LAYER_FISH);
  const res = shared.uResolution.value;
  const bw = res.x, bh = res.y;
  res.set(reflRT.width, reflRT.height);
  renderer.setRenderTarget(reflRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, reflCam);
  renderer.setClearColor(0x000000, 1);
  res.set(bw, bh);
  u.uReflOn.value = 1;
}

function render() {
  renderReflection();
  // 1) what lies behind the fish: water, sediment, burrows, surface (from below) and the fins
  camera.layers.set(0);
  camera.layers.enable(LAYER_BEHIND);
  renderer.setRenderTarget(envRT);
  renderer.render(scene, camera);
  // 2) the full underwater image
  camera.layers.set(0);
  camera.layers.enable(LAYER_FISH);
  camera.layers.enable(LAYER_FX);
  renderer.setRenderTarget(mainRT);
  renderer.render(scene, camera);
  let src = mainRT;
  // 3) above the water: sky and the surface, which refracts the underwater image
  if (state.above) {
    camera.layers.set(LAYER_ABOVE);
    renderer.setRenderTarget(compRT);
    renderer.render(aboveScene, camera);
    src = compRT;
  }
  post.material.uniforms.uTex.value = src.texture;
  renderer.setRenderTarget(null);
  renderer.render(post.scene, post.camera);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------------------------------ UI
const help = document.getElementById('help');
function toggleHelp(v) { help.classList.toggle('show', v ?? !help.classList.contains('show')); }
document.getElementById('help-btn').addEventListener('click', () => toggleHelp());
window.addEventListener('keydown', (e) => {
  if (!state.ready) return;
  const k = e.key.toLowerCase();
  if (k === '1') viewPreset('under');
  else if (k === '2') viewPreset('above');
  else if (k === '3') viewPreset('macro');
  else if (k === 'f' || k === 'tab') { e.preventDefault(); nextFish(e.shiftKey ? -1 : 1); }
  else if (k === ' ') { state.paused = !state.paused; e.preventDefault(); }
  else if (k === 'p') { state.dof = !state.dof; resize(); }
  else if (k === 'h' || k === '?') toggleHelp();
  else if (k === 'a') { state.auto = !state.auto; state.userT = 0; }
  else if (k === 'c') state.threats = !state.threats;
});
if (!params.has('nohelp')) setTimeout(() => toggleHelp(true), 600);
setTimeout(() => toggleHelp(false), 9000);

function fail(msg) {
  msg = String(msg);
  if (msg.length > 260) msg = `${msg.slice(0, 260)}…`;
  progressEl.hidden = false;
  progressEl.classList.add('error');
  progressEl.querySelector('.msg').textContent = msg;
  console.error(msg);
}
