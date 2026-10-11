// イシガレイ viewer: studio views of one juvenile (eyed side, side, head, blind side, a photo tray; any tier, the
// mouth shut or open) and a rippled sandy shallow with a few fish driven by the game's own driver and a stand-in
// brain. ?capture hides the panel and exposes window.__ish for scripted renders (tools/models/ishigarei/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildModel, disposeModel, syncEyes } from '../../src/creatures/species/ishigarei/model.ts';
import { IshigareiLook } from '../../src/creatures/species/ishigarei/materials.ts';
import { IshigareiDriver, lookSpecFor } from '../../src/creatures/species/ishigarei/IshigareiDriver.ts';
import { createFlounderBehavior } from '../../src/creatures/species/ishigarei/behavior.js';
import { applyPose, jawAxis } from '../../src/creatures/species/ishigarei/rig.js';
import { AMH_UNIFORMS } from '../../src/creatures/species/amimehagi/materials.ts';
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
const camera = new THREE.PerspectiveCamera(30, 1, 0.002, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const AXIS = jawAxis();

let scene = null, studioFish = null, studioBeh = null, fishes = [], mode = 'top', lod = 0, seed = 1, jaw = 0, simT = 0;
const info = document.getElementById('info');

function clear() {
  if (studioFish) disposeModel(studioFish);
  studioFish = null;
  for (const f of fishes) f.driver.dispose();
  fishes.length = 0;
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

/** the studio fish lying flat on a level floor at y = 0 (or flipped over, to see its blind side) */
function poseStudio() {
  if (!studioFish) return;
  const P = studioBeh.update(1 / 60);
  P.jaw = jaw; P.premax = jaw;
  applyPose(studioFish.root, studioFish.bones, P, AXIS);
  if (mode === 'blind') {
    studioFish.root.position.y = 0.006;
    studioFish.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
  }
  studioFish.root.updateMatrixWorld(true);
  syncEyes(studioFish);
  studioFish.look.uniforms.uMouthOpen.value = jaw;
  studioFish.look.uniforms.uBreath.value = P.breath;
}

function studio(view) {
  clear();
  const tray = view === 'tray';
  AMH_UNIFORMS.uAir.value = 1;
  scene.background = new THREE.Color(tray ? 0xd8dcdc : 0x0d1112);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = tray ? 0.7 : 0.45;
  AMH_UNIFORMS.uSkyGain.value = tray ? 0.55 : 0.35;
  const sun = new THREE.DirectionalLight(0xfff4e6, tray ? 2.2 : 2.8);
  sun.position.set(0.3, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8c8d0, 0x4a4036, tray ? 0.7 : 0.35));
  if (tray) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xe6e8e6, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.0021;
    scene.add(floor);
  }
  studioFish = buildModel(new IshigareiLook(lookSpecFor(`viewer#${seed}`)));
  studioFish.look.ground.off();
  studioBeh = createFlounderBehavior({ world: { ground: () => -0.0019 }, rng: () => 0.5, scale: 1, start: { x: 0, z: 0, heading: Math.PI / 2 }, autonomous: false });
  for (let i = 0; i < 40; i++) studioBeh.update(1 / 60);
  showLod(studioFish, lod);
  scene.add(studioFish.root);
  poseStudio();
  renderer.toneMappingExposure = tray ? 0.95 : 1.05;
  // the fish faces +x (head to the right on screen from above), its dorsal fin towards −z (the top of the screen)
  if (view === 'top' || view === 'tray') { camera.position.set(0.004, 0.15, 0.0001); controls.target.set(0.004, 0, 0); }
  if (view === 'side') { camera.position.set(0.01, 0.01, 0.11); controls.target.set(0.004, 0.0, 0); }
  if (view === 'head') { camera.position.set(0.05, 0.024, 0.026); controls.target.set(0.0175, 0.0012, -0.0005); }
  if (view === 'blind') { camera.position.set(0.004, 0.15, 0.0001); controls.target.set(0.004, 0.006, 0); }
  camera.fov = 30;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- the sandy shallow
const HALF = 8, N = 129;
// current ripples (λ ≈ 6 cm, asymmetric) over a gentle undulation
function heightAt(x, z) {
  const ph = (x * 0.82 + z * 0.57) / 0.062 + 1.6 * Math.sin(x * 2.1 + z * 1.3) + 0.6 * Math.sin(z * 5.7 - x * 3.1);
  const u = ph - Math.floor(ph);
  const w = u < 0.68 ? u / 0.68 : (1 - u) / 0.32;
  return 0.0016 * (0.5 - 0.5 * Math.cos(Math.PI * w)) * (0.7 + 0.3 * Math.sin(x * 1.3)) + 0.006 * Math.sin(x * 0.7) * Math.cos(z * 0.5);
}
let water = null, sun = null, rt = null, depth = 0.22, brainRng = new Rng(77);
const sunCol = new THREE.Vector3(), sunDir = new THREE.Vector3();
const fogColor = new THREE.Color(0.74, 0.82, 0.86);

function sandMaterial() {
  // the game's grey flat sand (Terrain SUBSTRATE_COLORS.sand) with grains up close
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.37, 0.37, 0.355), roughness: 0.95 });
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

function individual(i, x, z, len) {
  const species = { id: 'platichthys_bicoloratus', model: { modelLength_mm: 70, driver: 'ishigarei' }, brain: { params: {} } };
  return {
    id: `platichthys_bicoloratus#${(0x3100 + i * 7919).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: i * 1.9,
    length_mm: len, weight_g: 3, sex: 'f', stage: 'juvenile', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(1234 + i * 77), cell: 7, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

function flatScene(opts = {}) {
  clear();
  AMH_UNIFORMS.uAir.value = 0;
  AMH_UNIFORMS.uSkyGain.value = 0.5;
  const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
  // a fine mesh only round the fish, the rest coarse
  const near = new THREE.PlaneGeometry(1.6, 1.6, 640, 640);
  for (const g of [bedGeo, near]) {
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) - (g === bedGeo ? 0.004 : 0));
    g.computeVertexNormals();
  }
  const mat = sandMaterial();
  scene.add(new THREE.Mesh(bedGeo, mat), new THREE.Mesh(near, mat));
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
  const elev = opts.elev ?? 55, azim = opts.azim ?? 200;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  su.sunPosition.value.copy(sunDir);
  sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(20);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x88aabb, 0x44392c, 0.35));
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.environmentIntensity = 0.08;
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
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 0.06 + 0.12 * i;
    const ind = individual(i, Math.cos(a) * r, Math.sin(a) * r, [72, 58, 88, 64][i % 4]);
    const root = IshigareiDriver.makeModel().root;
    holder.add(root);
    const d = new IshigareiDriver();
    d.attach(root, ind);
    fishes.push({ driver: d, ind, root });
  }
  for (const f of fishes) f.driver.update(1 / 60, ctx());
  renderer.toneMappingExposure = 0.66;
  camera.fov = 40;
  camera.position.set(0.25, 0.3, 0.3);
  controls.target.set(0.0, 0.0, 0.0);
  camera.updateProjectionMatrix();
  controls.update();
}

const floor = { heightAt, waterAt: () => depth, sampleAt: () => ({ substrate: 'sand' }) };
function ctx() { return { floor, player: camera.position, simScale: 1, nowMs: 0, minDepth: 0.03, locked: false }; }

/** the stand-in brain: what the game's flatfish_sand tree would ask for, at random */
function think(f) {
  if (f.driver.busy) return;
  const u = brainRng.next(), pos = f.driver.behaviour.pos;
  if (u < 0.46) f.driver.setIntent({ id: 1, kind: 'rest', urgency: 0.3, seconds: 8 + 20 * brainRng.next() });
  else if (u < 0.72) f.driver.setIntent({ id: 1, kind: 'burrow', urgency: 0.3, seconds: 20 + 40 * brainRng.next() });
  else if (u < 0.86) f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 6, target: new THREE.Vector3(pos.x + brainRng.range(-0.4, 0.4), 0, pos.z + brainRng.range(-0.4, 0.4)) });
  else f.driver.setIntent({ id: 1, kind: 'forage', urgency: 0.4, seconds: 6 });
}

function stepFlat(dt) {
  simT += dt;
  for (const f of fishes) { think(f); f.driver.update(dt, ctx()); }
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
  water.update(0, { sunUp: 1, sunDir, sunCol, ambient: 0.45, fogColor, fogDensity: 0.004, env: water.cubeRT.texture, day: 1 });
  water.uniforms.uTime.value = simT;
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
  if (s === 'flat') flatScene(opts);
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
  if (mode === 'flat') renderFlat();
  else renderer.render(scene, camera);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!capture) {
    if (mode === 'flat') stepFlat(dt);
    else poseStudio();
    render();
  }
  info.textContent = mode === 'flat' ? fishes.map((f, i) => `${i}: ${f.driver.debugLabel()}`).join('\n') : `${mode}  LOD${lod}  口 ${jaw.toFixed(1)}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
function startle() { for (const f of fishes) f.driver.setIntent({ id: 2, kind: 'flee', urgency: 1, seconds: 6, from: camera.position.clone() }); }
function intentAll(kind, extra = {}) { for (const f of fishes) f.driver.setIntent({ id: 3, kind, urgency: 0.5, seconds: 30, ...extra }); }
document.getElementById('startle').addEventListener('click', startle);
document.getElementById('burrow').addEventListener('click', () => intentAll('burrow'));
document.getElementById('feed').addEventListener('click', () => intentAll('forage'));
document.getElementById('glide').addEventListener('click', () => { for (const f of fishes) { const p = f.driver.behaviour.pos; f.driver.setIntent({ id: 3, kind: 'wander', urgency: 0.4, seconds: 8, target: new THREE.Vector3(p.x + 0.3, 0, p.z - 0.1) }); } });
document.getElementById('mouth').addEventListener('click', () => { jaw = jaw > 0.5 ? 0 : 1; });
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { lod = Number(b.dataset.lod); if (studioFish) showLod(studioFish, lod); }));

resize();
setScene('top');
requestAnimationFrame(loop);

window.__ish = {
  set(o) {
    if (o.seed !== undefined) seed = o.seed;
    if (o.lod !== undefined) lod = o.lod;
    if (o.jaw !== undefined) jaw = o.jaw;
    if (o.depth !== undefined) depth = o.depth;
    if (o.scene) setScene(o.scene, o);
    else if (studioFish) showLod(studioFish, lod);
    poseStudio();
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    controls.update();
    render();
  },
  render,
  advance(seconds) { const n = Math.round(seconds * 30); for (let i = 0; i < n; i++) stepFlat(1 / 30); render(); },
  startle() { startle(); render(); },
  intent(kind, i, extra = {}) {
    for (const [j, f] of fishes.entries()) {
      if (i !== undefined && i !== null && i !== j) continue;
      const p = f.driver.behaviour.pos;
      const t = extra.dx !== undefined ? new THREE.Vector3(p.x + extra.dx, 0, p.z + (extra.dz ?? 0)) : undefined;
      f.driver.setIntent({ id: 4, kind, urgency: 0.5, seconds: extra.seconds ?? 20, target: t, from: camera.position.clone() });
    }
  },
  follow(o) {
    const f = fishes[o.i ?? 0];
    if (!f) return;
    const p = f.driver.behaviour.pos;
    controls.target.set(p.x + (o.dt?.[0] ?? 0), p.y + (o.dt?.[1] ?? 0), p.z + (o.dt?.[2] ?? 0));
    if (o.offset) camera.position.set(p.x + o.offset[0], p.y + o.offset[1], p.z + o.offset[2]);
    controls.update();
    render();
  },
  state() { return mode === 'flat' ? fishes.map((f) => ({ s: f.driver.debugLabel(), p: f.driver.behaviour.pos.toArray().map((v) => +v.toFixed(3)) })) : { mode, lod, jaw }; },
};
window.__ish.heights = () => fishes.map((f) => { const p = f.driver.behaviour.pos; return +((p.y - heightAt(p.x, p.z)) * 1000).toFixed(2); });
