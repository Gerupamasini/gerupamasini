// ミミイカ viewer: one squid in the photo views (side, back, front, oblique; any tier, any skin state, any behaviour)
// and a sandy shallow with a few squid driven by the game's own driver, a stand-in brain and the game's water pass.
// ?capture hides the panel and exposes window.__mm for scripted renders (tools/models/mimiika/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildModel, disposeModel, syncLevel } from '../../src/creatures/species/mimiika/model.ts';
import { MimiikaLook } from '../../src/creatures/species/mimiika/materials.ts';
import { MimiikaDriver, lookSpecFor } from '../../src/creatures/species/mimiika/MimiikaDriver.ts';
import { createSquidBehavior } from '../../src/creatures/species/mimiika/behavior.ts';
import { applyPose } from '../../src/creatures/species/mimiika/rig.ts';
import { makeMysidModel, poseMysid } from '../../src/creatures/species/mimiika/prey.ts';
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
const camera = new THREE.PerspectiveCamera(30, 1, 0.002, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

let scene = null, sq = null, beh = null, studioFx = null, studioInk = null, studioPrey = null, squids = [], mode = 'side', lod = 0, seed = 1, simT = 0;
let chromaOverride = null;
const info = document.getElementById('info');

function clear() {
  if (sq) disposeModel(sq);
  sq = null; beh = null;
  studioFx?.dispose(); studioFx = null;
  studioInk?.dispose(); studioInk = null;
  studioPrey = null;
  for (const f of squids) f.driver.dispose();
  squids.length = 0;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

// ---------------------------------------------------------------- studio and tank
const FLOOR = -0.0001;
const studioWorld = { ground: () => FLOOR, waterY: () => 0.3, canBurrow: () => true };

function poseStudio(dt = 0) {
  if (!sq) return;
  const P = beh.update(dt || 1 / 60);
  applyPose(sq.root, sq.bones, P);
  syncLevel(sq, lod, P.ten[0].ext > 0.12);
  MimiikaDriver.applyMaterials(sq, P);
  if (chromaOverride) { sq.look.uniforms.uChroma.value.set(...chromaOverride.slice(0, 4)); sq.look.uniforms.uPale.value = chromaOverride[4] ?? 0; }
  for (const e of beh.fx) (e.kind === 'ink' ? studioInk : studioFx).emit(e.pos, e.vel, e.count, e.spread, e.size, e.life, e.alpha);
  beh.fx.length = 0;
  studioFx.update(dt || 1 / 60, () => FLOOR);
  studioInk.update(dt || 1 / 60, () => FLOOR - 1);
  if (beh.prey) {
    if (!studioPrey) { studioPrey = makeMysidModel(); scene.add(studioPrey); }
    if (beh.prey.state === 'caught' && beh.state.phase === 'capture') sq.bones.J_tenL_5.getWorldPosition(beh.prey.pos);
    poseMysid(studioPrey, beh.prey);
  } else if (studioPrey) studioPrey.visible = false;
}

function studio(view) {
  clear();
  const tank = view === 'tank';
  AMH_UNIFORMS.uAir.value = 1;
  scene.background = new THREE.Color(tank ? 0x8fb4c4 : 0x0d1112);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = tank ? 0.35 : 0.25;
  AMH_UNIFORMS.uSkyGain.value = tank ? 0.35 : 0.22;
  const sun = new THREE.DirectionalLight(0xfff4e6, tank ? 2.4 : 2.6);
  sun.position.set(0.3, 1, 0.5);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8c8d0, 0x4a4036, tank ? 0.8 : 0.4));
  if (tank) {
    // the aquarium's sand (pale coral grit, as in photos 12, 40 and 47)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sandMaterial(new THREE.Color(0.55, 0.52, 0.47)));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR;
    scene.add(floor);
  }
  sq = buildModel(new MimiikaLook(lookSpecFor(`viewer#${seed}`)));
  beh = createSquidBehavior({ world: studioWorld, rng: mulberry(seed * 977 + 3), scale: 1, start: { x: 0, z: 0, heading: Math.PI / 2 }, autonomous: false });
  studioFx = new SandFX(scene);
  studioFx.shadow.visible = false;
  studioFx.setSandColour(new THREE.Vector3(0.55, 0.52, 0.47));
  studioInk = new SandFX(scene);
  studioInk.shadow.visible = false;
  studioInk.setSandColour(new THREE.Vector3(0.012, 0.01, 0.011));
  if (tank) sq.look.setCover(0.55, 0.52, 0.47);
  for (let i = 0; i < 90; i++) beh.update(1 / 30);
  showLod(sq, lod);
  scene.add(sq.root);
  poseStudio();
  renderer.toneMappingExposure = tank ? 0.9 : 1.05;
  // the squid faces +x (arms to the right on screen in the side view)
  const cams = { side: [0.004, 0.012, 0.12], top: [0.002, 0.13, 0.0001], front: [0.12, 0.02, 0.0], oblique: [0.075, 0.06, 0.075], tank: [0.05, 0.03, 0.1] };
  camera.position.set(...(cams[view] ?? cams.side));
  controls.target.set(0.002, 0.006, 0);
  camera.fov = 30;
  camera.updateProjectionMatrix();
  controls.update();
}

function mulberry(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function sandMaterial(color) {
  // sand with grains up close (the game's flat sand: Terrain SUBSTRATE_COLORS.sand)
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

// ---------------------------------------------------------------- the sandy shallow
const HALF = 8, N = 129;
// a fine sand bed with low current ripples (λ ≈ 5 cm) over a gentle undulation
function heightAt(x, z) {
  const ph = (x * 0.82 + z * 0.57) / 0.052 + 1.6 * Math.sin(x * 2.1 + z * 1.3) + 0.6 * Math.sin(z * 5.7 - x * 3.1);
  const u = ph - Math.floor(ph);
  const w = u < 0.68 ? u / 0.68 : (1 - u) / 0.32;
  return 0.0011 * (0.5 - 0.5 * Math.cos(Math.PI * w)) * (0.7 + 0.3 * Math.sin(x * 1.3)) + 0.006 * Math.sin(x * 0.7) * Math.cos(z * 0.5);
}
let water = null, sun = null, rt = null, depth = 0.3, brainRng = new Rng(77), night = false;
const sunCol = new THREE.Vector3(), sunDir = new THREE.Vector3();
const fogColor = new THREE.Color(0.74, 0.82, 0.86);

function individual(i, x, z, len) {
  const species = { id: 'euprymna_morsei', model: { modelLength_mm: 25, driver: 'mimiika' }, brain: { params: {} } };
  return {
    id: `euprymna_morsei#${(0x5100 + i * 7919).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading: i * 1.9,
    length_mm: len, weight_g: 3, sex: 'f', stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(1234 + i * 77), cell: 7, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

function flatScene(opts = {}) {
  clear();
  AMH_UNIFORMS.uAir.value = 0;
  AMH_UNIFORMS.uSkyGain.value = 0.5;
  const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
  const near = new THREE.PlaneGeometry(1.6, 1.6, 640, 640);
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
  if (night) {
    // a diver's torch: the way the photographs at night were taken
    const torch = new THREE.SpotLight(0xf4f0e8, 0.9, 3, 0.55, 0.7, 1.5);
    torch.position.set(0.25, 0.35, 0.35);
    scene.add(torch, torch.target);
    camera.userData.torch = torch;
  }
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
    const a = i * 2.4, r = 0.05 + 0.1 * i;
    const ind = individual(i, Math.cos(a) * r, Math.sin(a) * r, [26, 22, 30, 24][i % 4]);
    const root = MimiikaDriver.makeModel().root;
    holder.add(root);
    const d = new MimiikaDriver();
    d.attach(root, ind);
    squids.push({ driver: d, ind, root });
  }
  for (const f of squids) f.driver.update(1 / 60, ctx());
  if (opts.awake) for (const f of squids) f.driver.setIntent({ id: 1, kind: 'rest', urgency: 0.3, seconds: 4 });
  renderer.toneMappingExposure = night ? 0.42 : 0.66;
  camera.fov = 40;
  camera.position.set(0.22, 0.25, 0.26);
  controls.target.set(0.0, 0.0, 0.0);
  camera.updateProjectionMatrix();
  controls.update();
}

const floor = { heightAt, waterAt: () => depth, sampleAt: () => ({ substrate: 'sand' }) };
function ctx() { return { floor, player: camera.position, simScale: 1, nowMs: 0, minDepth: 0.03, locked: false }; }

/** the stand-in brain: what the game's squid_sand tree would ask for, at random (day: mostly buried) */
function think(f) {
  if (f.driver.busy) return;
  const u = brainRng.next(), pos = f.driver.behaviour.pos;
  const tgt = () => new THREE.Vector3(pos.x + brainRng.range(-0.3, 0.3), 0, pos.z + brainRng.range(-0.3, 0.3));
  if (!night) {
    if (u < 0.75) f.driver.setIntent({ id: 1, kind: 'burrow', urgency: 0.3, seconds: 40 + 60 * brainRng.next() });
    else f.driver.setIntent({ id: 1, kind: 'forage', urgency: 0.4, seconds: 8 });
  } else if (u < 0.2) f.driver.setIntent({ id: 1, kind: 'rest', urgency: 0.3, seconds: 6 + 10 * brainRng.next() });
  else if (u < 0.55) f.driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 8, target: tgt() });
  else if (u < 0.9) f.driver.setIntent({ id: 1, kind: 'forage', urgency: 0.4, seconds: 8 });
  else f.driver.setIntent({ id: 1, kind: 'burrow', urgency: 0.3, seconds: 30 });
}

function stepFlat(dt) {
  simT += dt;
  tickAmimehagiMaterials(simT);
  for (const f of squids) { if (!f.manual) think(f); f.driver.update(dt, ctx()); }
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
  const torch = camera.userData.torch;
  if (torch) { torch.position.copy(camera.position); torch.target.position.copy(controls.target); torch.target.updateMatrixWorld(); }
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

/** the studio squid's behaviour, or every squid on the flat */
function command(m, i) {
  const run = (b) => {
    const p = b.pos;
    switch (m) {
      case 'REST': b.rest(30); break;
      case 'HOVER': b.hover(30); break;
      case 'SWIM': b.swim({ x: p.x + 0.3, z: p.z - 0.05 }); break;
      case 'CRAWL': b.crawl({ x: p.x + 0.05, z: p.z }); break;
      case 'BURROW': b.burrow(60); break;
      case 'HUNT': b.hunt(); break;
      case 'ESCAPE': b.escape(camera.position.clone()); break;
    }
  };
  if (mode !== 'flat') { run(beh); return; }
  for (const [j, f] of squids.entries()) { if (i !== undefined && i !== null && i !== j) continue; f.manual = true; f.driver.setIntent({ id: 9, kind: 'rest', urgency: 0, seconds: 0.01 }); run(f.driver.behaviour); }
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
  info.textContent = mode === 'flat' ? squids.map((f, i) => `${i}: ${f.driver.debugLabel()}`).join('\n') : `${mode}  LOD${lod}  ${beh ? `${beh.state.mode}/${beh.state.phase}` : ''}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { lod = Number(b.dataset.lod); if (sq) showLod(sq, lod); }));
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => command(b.dataset.mode)));
const CHROMA = { pale: [0.35, 0.25, 0.12, 0.3, 0.7], mid: null, dark: [1, 1, 1.15, 0.5, 0] };
document.querySelectorAll('[data-chroma]').forEach((b) => b.addEventListener('click', () => { chromaOverride = CHROMA[b.dataset.chroma]; }));

resize();
setScene('side');
requestAnimationFrame(loop);

window.__mm = {
  set(o) {
    if (o.seed !== undefined) seed = o.seed;
    if (o.lod !== undefined) lod = o.lod;
    if (o.depth !== undefined) depth = o.depth;
    if ('chroma' in o) chromaOverride = o.chroma ? (CHROMA[o.chroma] ?? o.chroma) : null;
    if (o.scene) setScene(o.scene, o);
    else if (sq) showLod(sq, lod);
    if (mode !== 'flat') poseStudio();
    if (o.mat && sq) for (const m of [sq.look.skin]) { Object.assign(m, o.mat); m.needsUpdate = true; }
    if (o.skyGain !== undefined) AMH_UNIFORMS.uSkyGain.value = o.skyGain;
    if (o.air !== undefined) AMH_UNIFORMS.uAir.value = o.air;
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    controls.update();
    render();
  },
  render,
  /** simulated seconds (30 steps a second) */
  advance(seconds) {
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) {
      simT += 1 / 30;
      tickAmimehagiMaterials(simT);
      if (mode === 'flat') stepFlat(1 / 30); else poseStudio(1 / 30);
    }
    render();
  },
  mode(m, i) { command(m, i); },
  follow(o) {
    const b = mode === 'flat' ? squids[o.i ?? 0]?.driver.behaviour : beh;
    if (!b) return;
    const p = o.prey && b.prey ? b.prey.pos : b.pos;
    controls.target.set(p.x + (o.dt?.[0] ?? 0), p.y + (o.dt?.[1] ?? 0), p.z + (o.dt?.[2] ?? 0));
    if (o.offset) camera.position.set(p.x + o.offset[0], p.y + o.offset[1], p.z + o.offset[2]);
    controls.update();
    render();
  },
  state() {
    if (mode === 'flat') return squids.map((f) => ({ s: f.driver.debugLabel(), p: f.driver.behaviour.pos.toArray().map((v) => +v.toFixed(3)) }));
    return { mode, lod, s: `${beh.state.mode}/${beh.state.phase}`, bury: +beh.state.bury.toFixed(2), alt: +(beh.state.alt * 1000).toFixed(1) };
  },
};
