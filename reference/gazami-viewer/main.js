// ガザミ viewer: one crab in the photographs' views (front, top, side, three-quarter, underside, macro; any tier;
// clay or PBR; a still posture or any behaviour) and a sandy shallow with a few crabs driven by the game's own driver,
// a stand-in brain and the game's water pass.
// ?capture hides the panel and exposes window.__gz for scripted renders (tools/models/gazami/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildModel, disposeModel, gazamiRig } from '../../src/creatures/species/gazami/model.ts';
import { ClayLook } from '../../src/creatures/species/gazami/clay.ts';
import { GazamiLook } from '../../src/creatures/species/gazami/materials.ts';
import { GazamiDriver, chelaScaleFor, lookSpecFor } from '../../src/creatures/species/gazami/GazamiDriver.ts';
import { createCrabBehavior } from '../../src/creatures/species/gazami/behavior.ts';
import { applyPose } from '../../src/creatures/species/gazami/rig.ts';
import { stillPose as stillPoseOf } from '../../src/creatures/species/gazami/poses.ts';
import { SandFX } from '../../src/creatures/species/akaei/SandFX.ts';
import { AMH_UNIFORMS, tickAmimehagiMaterials } from '../../src/creatures/species/amimehagi/materials.ts';
import { WaterPass, makeSpillTexture } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
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
const persp = new THREE.PerspectiveCamera(30, 1, 0.002, 200);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 50);
let camera = persp;
let controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const rig = gazamiRig();
const info = document.getElementById('info');
const S = {
  view: 'top', lod: 0, sex: 0, clay: false, morph: 0, juvenile: 0, seed: 1, cw: 100,
  pose: 'stand', legs: {}, hideLegs: false, ortho: 0, floor: true, behave: false,
};
let scene = null, crab = null, P = null, beh = null, studioFx = null, floorMesh = null, crabs = [], mode = 'studio', simT = 0;
const FLOOR = 0;

function clear() {
  if (crab) disposeModel(crab);
  crab = null; beh = null;
  studioFx?.dispose(); studioFx = null;
  for (const f of crabs) f.driver.dispose();
  crabs.length = 0;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

function lookFor() {
  if (S.clay) return new ClayLook(S.sex);
  const spec = lookSpecFor(`viewer#${S.seed}`, S.sex ? 'f' : 'm', S.cw);
  return new GazamiLook({ ...spec, sex: S.sex, juvenile: S.juvenile, morph: S.morph, seed: S.seed * 13.7 });
}

// ---------------------------------------------------------------- the sand (the game's flat sand: Terrain SUBSTRATE_COLORS.sand)
function sandMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
float hS(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hS2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float nS(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hS(i), hS(i + vec2(1, 0)), f.x), mix(hS(i + vec2(0, 1)), hS(i + vec2(1)), f.x), f.y); }
`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 mm = vW.xz * 1000.0;
  float px = max(fwidth(mm.x), 1e-3);
  vec2 ip = floor(mm / 0.35), fp = fract(mm / 0.35);
  float best = 9.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 r = g + hS2(ip + g) * 0.85 + 0.075 - fp; float d = dot(r, r); if (d < best) { best = d; id = ip + g; } }
  float gz = hS(id * 1.73 + 0.37), gx = sqrt(best);
  float fine = 1.0 - smoothstep(0.05, 0.16, px);
  vec3 c = diffuseColor.rgb * (0.82 + 0.3 * nS(mm * 0.05) + 0.12 * (gz - 0.5) * fine);
  c = mix(c, c * 1.35 + 0.04, step(0.88, gz) * (1.0 - smoothstep(0.25, 0.35, gx)) * fine);
  c = mix(c, c * 0.45, step(0.965, gz) * (1.0 - smoothstep(0.25, 0.35, gx)) * fine);
  diffuseColor.rgb = c;
}`);
  };
  return m;
}

// ---------------------------------------------------------------- studio: one crab
const studioWorld = { ground: () => FLOOR, waterY: () => 0.4, canBurrow: () => true };
const SCALE = () => S.cw / 100;

function poseStudio(dt = 0) {
  if (!crab || !beh) return;
  P = beh.update(dt || 1 / 60);
  applyPose(crab.root, crab.bones, rig, P, chelaScaleFor(`viewer#${S.seed}`, S.sex ? 'f' : 'm', S.cw));
  crab.root.scale.setScalar(SCALE());
  crab.root.updateMatrixWorld(true);
  if (!S.clay) {
    const u = crab.look.uniforms;
    u.uSandCoat.value = P.sandCoat; u.uGroundY.value = FLOOR; u.uMmScale.value = 0.001 * SCALE();
  }
  for (const e of beh.fx) {
    if (e.kind === 'sand') studioFx.emit(e.pos, e.vel, e.count, e.spread, e.size, e.life, e.alpha);
    else if (e.kind === 'imprint') studioFx.imprint(e.pos.x, e.pos.z, e.heading ?? 0, 0.055 * SCALE(), 0.032 * SCALE(), () => FLOOR, e.strength ?? 0.2, e.life);
    else if (e.kind === 'grow') studioFx.growImprint(e.strength ?? 0.5);
  }
  beh.fx.length = 0;
  studioFx.update(dt || 1 / 60, () => FLOOR);
  const st = beh.state, k = st.alt / (0.05 * SCALE());
  studioFx.updateShadow(dt || 1 / 60, st.pos.x, st.pos.z, st.heading, 0.05 * SCALE() * (1 + 0.4 * k), 0.03 * SCALE() * (1 + 0.4 * k), (1 - st.bury) * Math.max(0.15, 1 - 0.3 * k), () => FLOOR, true);
}

function studio(v) {
  clear();
  mode = 'studio';
  AMH_UNIFORMS.uAir.value = 1;
  AMH_UNIFORMS.uSkyGain.value = 0.35;
  const tank = v === 'tank';
  scene.background = new THREE.Color(tank ? 0x8fb4c4 : 0xe9e7e2);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdde4ea, 0x6a6258, 0.9));
  if (v === 'under') { const l2 = new THREE.DirectionalLight(0xffffff, 1.6); l2.position.set(0.2, -1, 0.3); scene.add(l2, l2.target); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), S.behave || tank ? sandMaterial(new THREE.Color(0.55, 0.52, 0.47)) : new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR - 0.0002;
  floor.visible = v !== 'under' && S.pose !== 'bind' && S.floor;
  floorMesh = floor;
  scene.add(floor);
  crab = buildModel(lookFor());
  showLod(crab, S.lod);
  scene.add(crab.root);
  if (S.behave) {
    beh = createCrabBehavior({ world: studioWorld, rng: mulberry(S.seed * 977 + 3), rig, scale: S.cw / 1000, start: { x: 0, z: 0, heading: 0 }, autonomous: false });
    studioFx = new SandFX(scene);
    studioFx.setSandColour(new THREE.Vector3(0.55, 0.52, 0.47));
    if (!S.clay) crab.look.setCover(0.55, 0.52, 0.47);
    poseStudio(1 / 60);
  } else {
    P = stillPoseOf(rig, S.pose, S.legs);
    if (v === 'under') P.lift = 40;
    applyPose(crab.root, crab.bones, rig, P, chelaScaleFor(`viewer#${S.seed}`, S.sex ? 'f' : 'm', S.cw));
    crab.root.scale.setScalar(SCALE());
    if (v === 'under') { crab.root.rotation.z = Math.PI; crab.root.position.y = 0.05 * SCALE(); }
    crab.root.updateMatrixWorld(true);
    if (S.hideLegs) { for (const leg of rig.legs) crab.bones[`J_${leg.id}${leg.side}_cx`].scale.setScalar(1e-4); crab.root.updateMatrixWorld(true); }
    if (!S.clay) crab.look.uniforms.uMmScale.value = 0.001 * SCALE();
  }
  renderer.toneMappingExposure = 1.0;
  // the crab faces +z; the top view puts its front at the top of the image as in the photographs
  const k = SCALE();
  const cams = {
    top: [0, 0.42, 0.0001], front: [0, 0.03, 0.4], side: [0.4, 0.03, 0], oblique: [0.22, 0.2, 0.26], under: [0, -0.4, 0.0001], macro: [0.05, 0.06, 0.08], tank: [0.2, 0.15, 0.3],
  };
  camera.position.set(...(cams[v] ?? cams.top).map((x) => x * k));
  camera.up.set(0, 1, 0);
  if (v === 'top' || v === 'under') camera.up.set(0, 0, 1);
  controls.target.set(0, (v === 'under' ? 0.05 : 0.012) * k, 0);
  persp.fov = v === 'macro' ? 35 : 22;
  setCamera();
}

function mulberry(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** perspective, or (ortho > 0: the half height of the view in metres) an orthographic camera on the same line of sight */
function setCamera() {
  const next = S.ortho > 0 ? orthoCam : persp;
  if (next !== camera) {
    next.position.copy(camera.position); next.up.copy(camera.up);
    const t = controls.target.clone();
    controls.dispose();
    camera = next;
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(t);
  }
  resize();
  controls.update();
}

// ---------------------------------------------------------------- the sandy shallow
const HALF = 8, N = 129;
// a fine sand bed with low current ripples (λ ≈ 6 cm) over a gentle undulation
function heightAt(x, z) {
  const ph = (x * 0.82 + z * 0.57) / 0.062 + 1.6 * Math.sin(x * 2.1 + z * 1.3) + 0.6 * Math.sin(z * 5.7 - x * 3.1);
  const u = ph - Math.floor(ph);
  const w = u < 0.68 ? u / 0.68 : (1 - u) / 0.32;
  return 0.0013 * (0.5 - 0.5 * Math.cos(Math.PI * w)) * (0.7 + 0.3 * Math.sin(x * 1.3)) + 0.006 * Math.sin(x * 0.7) * Math.cos(z * 0.5);
}
let water = null, sun = null, rt = null, depth = 0.3, brainRng = new Rng(77), night = false;
const sunCol = new THREE.Vector3(), sunDir = new THREE.Vector3();
const fogColor = new THREE.Color(0.74, 0.82, 0.86);

function individual(i, x, z, len, sex) {
  const species = { id: 'portunus_trituberculatus', model: { modelLength_mm: 100, driver: 'gazami' }, brain: { params: {} } };
  return {
    id: `portunus_trituberculatus#${(0x6100 + i * 7919).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: i * 1.9,
    length_mm: len, weight_g: 50, sex, stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(1234 + i * 77), cell: 7, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

function flatScene(opts = {}) {
  clear();
  mode = 'flat';
  AMH_UNIFORMS.uAir.value = 0;
  AMH_UNIFORMS.uSkyGain.value = 0.5;
  const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
  const near = new THREE.PlaneGeometry(2.4, 2.4, 720, 720);
  for (const g of [bedGeo, near]) {
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) - (g === bedGeo ? 0.004 : 0));
    g.computeVertexNormals();
  }
  const mat = sandMaterial(new THREE.Color(0.37, 0.37, 0.355));
  scene.add(new THREE.Mesh(bedGeo, mat), new THREE.Mesh(near, mat));
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
  night = !!opts.night;
  const elev = night ? 4 : opts.elev ?? 55, azim = opts.azim ?? 200;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  su.sunPosition.value.copy(sunDir);
  sun = new THREE.DirectionalLight(0xfff2e0, night ? 0.5 : 2.6);
  sun.position.copy(sunDir).multiplyScalar(20);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x88aabb, 0x44392c, night ? 0.12 : 0.35));
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.environmentIntensity = night ? 0.02 : 0.08;
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 2000, cubeRT).update(renderer, skyScene);
  const hData = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hData[j * N + i] = heightAt(-HALF + (i / (N - 1)) * 2 * HALF, -HALF + (j / (N - 1)) * 2 * HALF);
  const heightTexture = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.FloatType);
  heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
  water = new WaterPass({ heightTexture, spillTexture: makeSpillTexture(new Float32Array(N * N).fill(-1e3), N), half: HALF }, createWaves({ windDir: 0.7, depth: 0.6, seed: 11 }), surfUniforms(null));
  water.setBody(0.09, 0.12, 0.11, 0.5);
  water.setPolarized(true);
  water.cubeRT = cubeRT;
  const holder = new THREE.Group();
  holder.name = 'creatures';
  scene.add(holder);
  const n = opts.count ?? 3;
  const sizes = opts.sizes ?? [110, 72, 140, 55];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 0.08 + 0.16 * i;
    const ind = individual(i, Math.cos(a) * r, Math.sin(a) * r, sizes[i % sizes.length], i % 2 ? 'f' : 'm');
    const root = GazamiDriver.makeModel().root;
    holder.add(root);
    const d = new GazamiDriver();
    d.attach(root, ind);
    crabs.push({ driver: d, ind, root });
  }
  for (const f of crabs) f.driver.update(1 / 60, ctx());
  if (opts.awake) for (const f of crabs) { f.manual = true; f.driver.behaviour.idle(60); }
  renderer.toneMappingExposure = night ? 0.42 : 0.66;
  persp.fov = 40;
  S.ortho = 0;
  setCamera();
  camera.position.set(0.32, 0.3, 0.38);
  controls.target.set(0.0, 0.0, 0.0);
  controls.update();
}

const floor = { heightAt, waterAt: () => depth, sampleAt: () => ({ substrate: 'sand' }) };
function ctx() { return { floor, player: camera.position, simScale: 1, nowMs: 0, minDepth: 0.03, locked: false }; }

/** the stand-in brain: what the game's swimming_crab tree would ask for, at random */
function think(f) {
  if (f.driver.busy) return;
  const u = brainRng.next(), pos = f.driver.behaviour.pos;
  const tgt = (r) => new THREE.Vector3(pos.x + brainRng.range(-r, r), 0, pos.z + brainRng.range(-r, r));
  if (u < 0.25) f.driver.setIntent({ id: 1, kind: 'rest', urgency: 0.3, seconds: 4 + 6 * brainRng.next() });
  else if (u < 0.55) f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 8, target: tgt(0.4) });
  else if (u < 0.8) f.driver.setIntent({ id: 1, kind: 'forage', urgency: 0.4, seconds: 8 });
  else if (u < 0.92) f.driver.setIntent({ id: 1, kind: 'burrow', urgency: 0.3, seconds: 20 });
  else f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 8, target: tgt(1.5) });
}

function stepFlat(dt) {
  simT += dt;
  tickAmimehagiMaterials(simT);
  for (const f of crabs) { if (!f.manual) think(f); f.driver.update(dt, ctx()); }
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

function renderFlat() {
  sunCol.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  water.update(0, { sunUp: night ? 0 : 1, sunDir, sunCol, ambient: night ? 0.08 : 0.45, fogColor, fogDensity: 0.004, env: water.cubeRT.texture, day: night ? 0 : 1 });
  water.uniforms.uTime.value = simT;
  scene.background = night ? new THREE.Color(0.01, 0.015, 0.02) : fogColor;
  const r = target();
  camera.updateMatrixWorld();
  water.prepare(renderer, scene, camera);
  renderer.setRenderTarget(r);
  renderer.render(scene, camera);
  water.render(renderer, r, null, camera);
  renderer.setRenderTarget(null);
}

function setScene(s, opts) {
  if (s === 'flat') flatScene(opts);
  else { S.view = s; studio(s); }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const asp = w / Math.max(1, h);
  persp.aspect = asp;
  persp.updateProjectionMatrix();
  if (S.ortho > 0) { orthoCam.top = S.ortho; orthoCam.bottom = -S.ortho; orthoCam.left = -S.ortho * asp; orthoCam.right = S.ortho * asp; orthoCam.updateProjectionMatrix(); }
}
window.addEventListener('resize', resize);

function render() {
  controls.update();
  if (mode === 'flat') renderFlat();
  else renderer.render(scene, camera);
}

/** the studio crab's behaviour, or every crab on the flat */
function command(m, i) {
  const run = (b) => {
    const p = b.pos, k = b === beh ? SCALE() : 1;
    switch (m) {
      case 'IDLE': b.idle(30); break;
      case 'WALK': b.walk({ x: p.x + 0.3 * k, z: p.z + 0.06 * k }); break;
      case 'RUN': b.walk({ x: p.x + 0.6 * k, z: p.z + 0.1 * k }, true); break;
      case 'FORAGE': b.forage(30); break;
      case 'BURROW': b.burrow(60); break;
      case 'DEFEND': b.defend(camera.position.clone(), 30); break;
      case 'ESCAPE': b.escape(camera.position.clone()); break;
      case 'SWIM': b.swim({ x: p.x - 0.9 * k, z: p.z + 0.15 * k }); break;
    }
  };
  if (mode !== 'flat') { if (!beh) { S.behave = true; studio(S.view); } run(beh); return; }
  for (const [j, f] of crabs.entries()) { if (i !== undefined && i !== null && i !== j) continue; f.manual = true; f.driver.setIntent({ id: 9, kind: 'rest', urgency: 0, seconds: 0.01 }); run(f.driver.behaviour); }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!capture) {
    if (mode === 'flat') stepFlat(dt);
    else { simT += dt; tickAmimehagiMaterials(simT); poseStudio(dt); }
    render();
  }
  info.textContent = mode === 'flat' ? crabs.map((f, i) => `${i}: ${f.driver.debugLabel()}`).join('\n') : `${S.view}  LOD${S.lod}  ${S.clay ? 'clay' : 'PBR'}  ${beh ? `${beh.state.mode}/${beh.state.phase}` : S.pose}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { S.lod = Number(b.dataset.lod); if (crab) showLod(crab, S.lod); }));
document.querySelectorAll('[data-clay]').forEach((b) => b.addEventListener('click', () => { S.clay = b.dataset.clay === '1'; studio(S.view); }));
document.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => { S.sex = Number(b.dataset.sex); studio(S.view); }));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => command(b.dataset.mode)));

resize();
setScene(S.view);
requestAnimationFrame(loop);

const step = (n) => {
  for (let i = 0; i < n; i++) {
    simT += 1 / 30;
    tickAmimehagiMaterials(simT);
    if (mode === 'flat') stepFlat(1 / 30); else poseStudio(1 / 30);
  }
};

window.__gz = {
  set(o) {
    for (const k of ['lod', 'sex', 'clay', 'morph', 'juvenile', 'seed', 'cw', 'pose', 'hideLegs', 'ortho', 'floor', 'behave']) if (o[k] !== undefined) S[k] = o[k];
    if (o.legs !== undefined) S.legs = o.legs ?? {};
    if (o.depth !== undefined) depth = o.depth;
    if (o.scene) setScene(o.scene, o);
    else if (o.view) setScene(o.view);
    else if (crab) showLod(crab, S.lod);
    if (o.floor !== undefined && floorMesh) floorMesh.visible = S.floor && S.pose !== 'bind';
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.up) camera.up.set(...o.up);
    if (o.fov) { persp.fov = o.fov; persp.updateProjectionMatrix(); }
    if (o.ortho !== undefined || o.view) setCamera();
    if (o.bg !== undefined) scene.background = new THREE.Color(o.bg);
    if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
    if (o.envI !== undefined) scene.environmentIntensity = o.envI;
    if (o.air !== undefined) AMH_UNIFORMS.uAir.value = o.air;
    if (o.sand !== undefined && crab && !S.clay) crab.look.uniforms.uSandCoat.value = o.sand;
    controls.update();
    render();
  },
  render,
  /** simulated seconds (30 steps a second) */
  advance(seconds) { step(Math.round(seconds * 30)); render(); },
  mode(m, i) { command(m, i); },
  /** simulated time until the behaviour (of crab i on the flat) reaches `phase` (or `max` seconds), then `after` more */
  until(phase, max = 20, i = 0, after = 0) {
    const b = () => (mode === 'flat' ? crabs[i]?.driver.behaviour : beh);
    for (let k = 0; k < max * 30; k++) { step(1); if (b()?.state.phase === phase) break; }
    step(Math.round(after * 30));
    render();
  },
  follow(o) {
    const b = mode === 'flat' ? crabs[o.i ?? 0]?.driver.behaviour : beh;
    if (!b) return;
    const p = b.pos;
    controls.target.set(p.x + (o.dt?.[0] ?? 0), p.y + (o.dt?.[1] ?? 0.01), p.z + (o.dt?.[2] ?? 0));
    if (o.offset) camera.position.set(p.x + o.offset[0], p.y + o.offset[1], p.z + o.offset[2]);
    controls.update();
    render();
  },
  info() {
    let tris = 0;
    crab?.shells.forEach((m, i) => { if (i === S.lod) tris += m.geometry.index.count / 3; });
    if (mode === 'flat') return crabs.map((f) => ({ s: f.driver.debugLabel(), p: f.driver.behaviour.pos.toArray().map((v) => +v.toFixed(3)) }));
    return { view: S.view, lod: S.lod, tris, s: beh ? `${beh.state.mode}/${beh.state.phase}` : S.pose, bury: beh ? +beh.state.bury.toFixed(2) : 0, alt: beh ? +(beh.state.alt * 1000).toFixed(1) : 0 };
  },
};
