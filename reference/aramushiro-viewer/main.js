// アラムシロ viewer: studio views of the shell (aperture, back, side, apex — like the photographs of shells on a
// ruler), a live snail in a dish, and a sandy shallow under the game's own screen-space water with several snails run
// by the game's AramushiroDriver and a stand-in brain, a crushed clam they gather on, their trails and burrows.
// ?capture hides the panel and exposes window.__am for scripted renders (tools/models/aramushiro/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { WaterPass, makeSpillTexture } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
import { AramushiroDriver } from '../../src/creatures/species/aramushiro/AramushiroDriver.ts';
import { CarrionField } from '../../src/creatures/species/aramushiro/carrion.ts';
import { buildModel, poseModel } from '../../src/creatures/species/aramushiro/model.ts';
import { AM_UNIFORMS, MORPHS, lookFor } from '../../src/creatures/species/aramushiro/materials.ts';
import { restPose } from '../../src/creatures/species/aramushiro/pose.ts';
import { Rng } from '../../src/core/Rng.ts';

const params = new URLSearchParams(location.search);
window.THREE = THREE;
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !capture, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const camera = new THREE.PerspectiveCamera(30, 1, 0.002, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const species = { id: 'reticunassa_festiva', model: { modelLength_mm: 12, driver: 'aramushiro' }, brain: { params: {} } };
function individual(i, x, z, len = 12, heading = (i * 2.1) % 6.28) {
  return {
    id: `reticunassa_festiva#${(0x3000 + i * 13).toString(16)}`, species, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), heading,
    length_mm: len, weight_g: 0.4, sex: 'f', stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 1, lod: 1,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(911 + i * 37), cell: 3, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

const state = { scene: params.get('scene') ?? (capture ? 'aperture' : 'sand'), lod: 'auto', time: 0, depth: 0.06, brain: true, morph: Number(params.get('morph') ?? 0) };
let scene = null, snails = [], floor = null, water = null, rt = null, sun = null, waterOn = false, carrion = null, shellModel = null;
const sunDir = new THREE.Vector3(), sunCol = new THREE.Vector3();
const fogColor = new THREE.Color(0.75, 0.82, 0.86);
const underFog = new THREE.FogExp2(0x3c5a50, 0.6);
let brainRng = new Rng(77);

function clear() {
  for (const m of forms) m.dispose();
  forms = [];
  for (const s of snails) { s.driver.dispose(); s.root.removeFromParent(); }
  snails = [];
  shellModel?.dispose();
  shellModel = null;
  carrion?.dispose();
  carrion = null;
  scene = new THREE.Scene();
  waterOn = false;
  AM_UNIFORMS.uAmAir.value = 0;
  AM_UNIFORMS.uAmCaustic.value = 0.55;
  AM_UNIFORMS.uAmSkyGain.value = 0.35;
  AM_UNIFORMS.uAmWater.value.set(0.085, 0.15, 0.145);
}

// ---------------------------------------------------------------- the sand: grains of quartz, feldspar, dark lithic bits and shell
function sandTextures(seed = 3) {
  const S = 1024, col = new Uint8Array(S * S * 4), hgt = new Float32Array(S * S);
  const rng = new Rng(seed);
  // background: fine silt between the grains
  for (let i = 0; i < S * S; i++) { const v = 0.55 + 0.1 * rng.next(); col[i * 4] = 150 * v + 40; col[i * 4 + 1] = 128 * v + 34; col[i * 4 + 2] = 96 * v + 24; col[i * 4 + 3] = 255; }
  // grains on a jittered grid (a tile is 3 cm: a 0.4 mm grain is ~14 px)
  const cell = 11;
  const kinds = [
    [0.78, 0.7, 0.58, 0.55], [0.86, 0.8, 0.7, 0.2], [0.72, 0.5, 0.36, 0.12], [0.35, 0.32, 0.3, 0.07], [0.9, 0.88, 0.84, 0.06],
  ];
  for (let gy = 0; gy < S / cell; gy++) for (let gx = 0; gx < S / cell; gx++) {
    for (let k = 0; k < 2; k++) {
      const cx = (gx + rng.next()) * cell, cy = (gy + rng.next()) * cell;
      const r = cell * (0.35 + 0.45 * rng.next());
      let u = rng.next(), kind = kinds[0];
      for (const kd of kinds) { if (u < kd[3]) { kind = kd; break; } u -= kd[3]; }
      const tone = 0.75 + 0.35 * rng.next();
      const ax = 0.7 + 0.6 * rng.next(), rot = rng.next() * 6.28, ca = Math.cos(rot), sa = Math.sin(rot);
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x - cx, dy = y - cy;
        const qx = (dx * ca + dy * sa) / ax, qy = (-dx * sa + dy * ca) * ax;
        const d = Math.hypot(qx, qy) / r;
        if (d > 1) continue;
        const xx = ((x % S) + S) % S, yy = ((y % S) + S) % S, i = yy * S + xx;
        const h = Math.sqrt(1 - d * d);
        if (h * (0.6 + 0.4 * tone) < hgt[i]) continue;
        hgt[i] = h * (0.6 + 0.4 * tone);
        const shade = (0.82 + 0.25 * h) * tone;
        col[i * 4] = Math.min(255, kind[0] * 255 * shade);
        col[i * 4 + 1] = Math.min(255, kind[1] * 255 * shade);
        col[i * 4 + 2] = Math.min(255, kind[2] * 255 * shade);
      }
    }
  }
  const map = new THREE.DataTexture(col, S, S);
  map.colorSpace = THREE.SRGBColorSpace;
  // normals from the grains' heights
  const nrm = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
    const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-hx * 1.6, -hy * 1.6, 1).normalize();
    nrm[i * 4] = (n.x * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
  }
  const normalMap = new THREE.DataTexture(nrm, S, S);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  }
  return { map, normalMap };
}
let sandTex = null;

// ---------------------------------------------------------------- studio: the shell on a white or black card, lit like the specimen photographs
function shellStudio(view) {
  clear();
  scene.background = new THREE.Color(view === 'black' ? 0x070708 : 0xe9e8e4);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  sun = new THREE.DirectionalLight(0xfff6ea, 1.7);
  sun.position.set(0.3, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdde6ea, 0x6a5d4c, 0.6));
  AM_UNIFORMS.uAmAir.value = 1;
  AM_UNIFORMS.uAmCaustic.value = 0;
  AM_UNIFORMS.uAmSkyGain.value = 0.5;
  shellModel = buildModel(lookFor(state.morph, 0.37), 1, [0, 1, 2]);
  scene.add(shellModel.root);
  const pose = restPose();
  pose.retractTubes = pose.retractHead = pose.retractFoot = 1;
  poseModel(shellModel, pose, 0);
  for (const lv of shellModel.lod.levels) for (const o of lv.object.children) if (!/Shell|LOD2/.test(o.name)) o.visible = false;
  shellModel.lod.autoUpdate = false;
  // (studio: the shell upright before the camera, apex up, the aperture facing it)
  const m = new THREE.Matrix4();
  if (view === 'back') m.makeRotationY(Math.PI);
  if (view === 'side') m.makeRotationY(-Math.PI / 2);
  m.multiply(new THREE.Matrix4().makeTranslation(0, 0.006, 0));
  if (view === 'apex') m.makeRotationX(Math.PI / 2);
  for (const sh of shellModel.shells) sh.matrix.copy(m);
  camera.fov = 14;
  camera.position.set(0, 0, 0.09);
  controls.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.update();
  state.brain = false;
  renderer.toneMappingExposure = 1.0;
}

// ---------------------------------------------------------------- the colour forms side by side, apertures to the camera
let forms = [];
function formsScene() {
  shellStudio('aperture');
  shellModel.root.visible = false;
  forms = MORPHS.map((_, i) => {
    const m = buildModel(lookFor(i, 0.31 + i * 0.17), 1, [0]);
    const pose = restPose();
    pose.retractTubes = pose.retractHead = pose.retractFoot = 1;
    poseModel(m, pose, 0);
    for (const o of m.root.getObjectByName('AramushiroLOD0').children) if (o.name !== 'Shell') o.visible = false;
    m.lod.autoUpdate = false;
    const sh = m.shells[0];
    sh.matrix.makeTranslation((i - (MORPHS.length - 1) / 2) * 0.0085, 0.006, 0).multiply(new THREE.Matrix4().makeRotationY(i % 2 ? Math.PI : 0));
    scene.add(m.root);
    return m;
  });
  camera.fov = 18;
  camera.position.set(0, 0, 0.14);
  controls.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- a live snail on a white dish in air (as in the photos of snails held or set down)
function dish() {
  clear();
  scene.background = new THREE.Color(0xdedcd6);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
  sun.position.set(0.4, 1, 0.3);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xe2e8ea, 0x8a7d6c, 0.7));
  AM_UNIFORMS.uAmAir.value = 1;
  AM_UNIFORMS.uAmCaustic.value = 0;
  AM_UNIFORMS.uAmSkyGain.value = 0.45;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.35 }));
  scene.add(plate);
  floor = { heightAt: () => 0, waterAt: () => 0.02, sampleAt: () => null };
  addSnail(0, 0, 0, 12, 0.6);
  snails[0].driver.setIntent({ id: 1, kind: 'wander', urgency: 0.3, seconds: 600, target: new THREE.Vector3(0.3, 0, 0.3) });
  state.brain = false;
  state.canBurrow = false;
  renderer.toneMappingExposure = 0.95;
  camera.fov = 20;
  camera.position.set(0.05, 0.045, 0.06); controls.target.set(0, 0.003, 0.004);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- the sandy shallow under water
const HALF = 3, N = 121;
const heightAt = (x, z) => 0.0015 * Math.sin(x * 9 + Math.sin(z * 3)) * Math.cos(z * 2.0) + 0.0008 * Math.sin(x * 23 + z * 17) + 0.004 * Math.sin(x * 1.3 + 0.4);
let sandBase = null;
function sandScene(kind) {
  clear();
  if (!sandTex) sandTex = sandTextures();
  if (!sandBase) {
    const bedGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 300, 300).rotateX(-Math.PI / 2);
    const p = bedGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    bedGeo.computeVertexNormals();
    const uv = bedGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (HALF * 2) / 0.03, uv.getY(i) * (HALF * 2) / 0.03);
    const mat = new THREE.MeshStandardMaterial({ map: sandTex.map, normalMap: sandTex.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), color: new THREE.Color(0.95, 0.92, 0.86), roughness: 0.92 });
    const bed = new THREE.Mesh(bedGeo, mat);
    bed.receiveShadow = true;
    const hData = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hData[j * N + i] = heightAt(-HALF + (i / (N - 1)) * 2 * HALF, -HALF + (j / (N - 1)) * 2 * HALF);
    const heightTexture = new THREE.DataTexture(hData, N, N, THREE.RedFormat, THREE.FloatType);
    heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
    const fakeTerrain = { heightTexture, spillTexture: makeSpillTexture(new Float32Array(N * N).fill(-1e3), N), half: HALF };
    const w = new WaterPass(fakeTerrain, createWaves({ windDir: 0.7, depth: 0.3, seed: 5 }), surfUniforms(null));
    w.setPolarized(true);
    w.setBody(0.07, 0.125, 0.125, 0.35);
    sandBase = { bed, water: w };
  }
  water = sandBase.water;
  waterOn = true;
  scene.add(sandBase.bed);
  const skyScene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  skyScene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.2; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.8;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 52), THREE.MathUtils.degToRad(210));
  su.sunPosition.value.copy(sunDir);
  sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -0.2, right: 0.2, top: 0.2, bottom: -0.2, near: 0.5, far: 10 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.002;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x88aabb, 0x44392c, 0.35));
  if (!sandBase.cube) {
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    new THREE.CubeCamera(1, 2000, cubeRT).update(renderer, skyScene);
    sandBase.cube = cubeRT;
    sandBase.env = pmrem.fromScene(skyScene).texture;
  }
  scene.environment = sandBase.env;
  scene.environmentIntensity = 0.08;
  AM_UNIFORMS.uAmSand.value.set(0.36, 0.3, 0.21);
  floor = { heightAt, waterAt: () => state.depth, sampleAt: () => ({ substrate: 'sand' }), meadow: null };
  carrion = new CarrionField({ heightAt, sampleAt: () => ({ substrate: 'sand' }) }, 5, 0);
  scene.add(carrion.group);
  floor.scent = carrion;
  state.canBurrow = true;
  if (kind === 'crowd') {
    // a population: sixty snails over two metres of sand, most of them seen at the far tiers
    const rng = new Rng(23);
    for (let i = 0; i < 60; i++) addSnail(i, rng.range(-1, 1), rng.range(-1, 1), rng.range(7, 15));
    carrion.add(0.3, -0.2, 0.7, 1);
    carrion.update(0, 0, 0);
    state.brain = true;
    camera.fov = 40;
    camera.position.set(0.0, 0.9, 1.6); controls.target.set(0, 0, 0);
  } else if (kind === 'feeding') {
    // a crushed clam in the water: a crowd already round it, more coming up the current
    carrion.add(0, 0, 0.6, 1);
    carrion.update(0, 0, 0);
    const rng = new Rng(19);
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, 6.28), d = i < 10 ? 0.02 : rng.range(0.12, 0.3);
      addSnail(i, Math.sin(a) * d, Math.cos(a) * d, rng.range(9, 14), a + Math.PI);
    }
    state.brain = true;
    camera.fov = 26;
    camera.position.set(0.09, 0.12, 0.12); controls.target.set(0, 0, 0);
  } else {
    // a few snails crawling and searching on open sand
    const rng = new Rng(7);
    for (let i = 0; i < 6; i++) addSnail(i, rng.range(-0.12, 0.12), rng.range(-0.12, 0.12), rng.range(10, 14));
    state.brain = true;
    camera.fov = 28;
    camera.position.set(0.12, 0.16, 0.16); controls.target.set(0, 0, 0);
  }
  renderer.toneMappingExposure = 0.62;
  camera.updateProjectionMatrix();
  controls.update();
}

function addSnail(i, x, z, len, heading) {
  const root = new THREE.Group();
  scene.add(root);
  const d = new AramushiroDriver();
  const ind = individual(i, x, z, len, heading ?? (i * 2.1) % 6.28);
  d.attach(root, ind);
  d.update(0.001, ctx());
  snails.push({ driver: d, ind, root });
  return d;
}

function ctx() {
  return { floor, player: new THREE.Vector3(camera.position.x + 30, 0, camera.position.z + 30), simScale: 1, nowMs: state.time * 1000, locked: false, canBurrow: state.canBurrow !== false, minDepth: waterOn ? 0.015 : undefined };
}

// ---------------------------------------------------------------- stepping
function think(s) {
  const d = s.driver;
  if (d.busy) return;
  const r = brainRng.next();
  const kind = r < 0.3 ? 'rest' : r < 0.55 ? 'wander' : r < 0.85 ? 'forage' : 'burrow';
  const a = brainRng.range(0, 6.28), dist = brainRng.range(0.03, 0.12);
  const target = new THREE.Vector3(s.root.position.x + Math.sin(a) * dist, 0, s.root.position.z + Math.cos(a) * dist);
  d.setIntent({ id: 1, kind, urgency: 0.3, seconds: kind === 'rest' ? brainRng.range(8, 20) : brainRng.range(20, 50), target });
}
function step(dt) {
  state.time += dt;
  carrion?.update(0, 0, dt);
  for (const s of snails) {
    if (state.brain) think(s);
    s.driver.update(dt, ctx());
  }
  applyLod();
}
function applyLod() {
  for (const s of snails) {
    const lod = s.root.getObjectByName('AramushiroLOD');
    if (!lod) continue;
    if (state.lod === 'auto') { lod.autoUpdate = true; continue; }
    lod.autoUpdate = false;
    lod.levels.forEach((l, i) => { l.object.visible = i === state.lod; });
  }
  if (shellModel && state.lod !== 'auto') shellModel.lod.levels.forEach((l, i) => { l.object.visible = i === state.lod; });
}

function target() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (!rt || rt.width !== s.x || rt.height !== s.y) {
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(s.x, s.y, THREE.FloatType);
  }
  return rt;
}
function render() {
  if (!waterOn) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  water.setLevel(state.depth);
  sunCol.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  water.update(0, { sunUp: 1, sunDir, sunCol, ambient: 0.45, fogColor, fogDensity: 0.004, env: sandBase.cube.texture, day: 1 });
  water.uniforms.uTime.value = state.time;
  const under = camera.position.y < state.depth;
  scene.fog = under ? underFog : null;
  scene.background = under ? underFog.color : fogColor;
  const r = target();
  renderer.setRenderTarget(r);
  renderer.render(scene, camera);
  water.render(renderer, r, null, camera);
  renderer.setRenderTarget(null);
}
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- panel
const SCENES = { sand: '砂地（水中）', feeding: '腐肉に集まる', crowd: '60 個体', dish: '皿の上（空気中）', forms: '色の型', aperture: '殻口', back: '背面', side: '側面', apex: '殻頂', black: '黒背景' };
function setScene(k) {
  state.scene = k;
  brainRng = new Rng(77);
  state.time = 0;
  if (k === 'sand' || k === 'feeding' || k === 'crowd') sandScene(k);
  else if (k === 'dish') dish();
  else if (k === 'forms') formsScene();
  else shellStudio(k);
  applyLod();
  step(1 / 60);
  info();
}
function seg(id, entries, get, set) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const [k, label] of entries) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = get() === k ? 'on' : '';
    b.onclick = () => { set(k); seg(id, entries, get, set); };
    el.appendChild(b);
  }
}
const first = () => snails[0]?.driver;
const ACTS = {
  crawl: ['這う', () => { const p = snails[0].root.position; first()?.setIntent({ id: 2, kind: 'wander', urgency: 0.3, seconds: 60, target: new THREE.Vector3(p.x + 0.08, 0, p.z - 0.03) }); }],
  forage: ['匂いを探る', () => first()?.setIntent({ id: 3, kind: 'forage', urgency: 0.3, seconds: 40 })],
  bait: ['餌を置く', () => { if (!carrion) return; const p = snails[0].root.position; carrion.add(p.x - 0.12, p.z + 0.05, 0.4); carrion.update(0, 0, 1); }],
  burrow: ['潜る', () => first()?.setIntent({ id: 4, kind: 'burrow', urgency: 0.2, seconds: 60 })],
  rest: ['静止', () => first()?.setIntent({ id: 5, kind: 'rest', urgency: 0.1, seconds: 20 })],
  startle: ['脅かす', () => startle()],
};
function startle() {
  for (const s of snails) s.driver.setIntent({ id: 9, kind: 'flee', urgency: 1, seconds: 6, from: camera.position.clone() });
}
seg('scenes', Object.entries(SCENES), () => state.scene, setScene);
seg('acts', Object.entries(ACTS).map(([k, [l]]) => [k, l]), () => '', (k) => ACTS[k][1]());
seg('lods', [['auto', '自動'], [0, '0'], [1, '1'], [2, '2']], () => state.lod, (k) => { state.lod = k; applyLod(); });
function info() {
  document.getElementById('info').textContent = snails.map((s) => s.driver.debugLabel()).join('\n') + `\n${renderer.info.render.triangles} tris, ${renderer.info.render.calls} draws`;
}
setScene(state.scene);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  controls.update();
  step(dt * (Number(params.get('speed')) || 1));
  render();
  if ((now | 0) % 10 === 0) info();
  requestAnimationFrame(loop);
}
if (!capture) requestAnimationFrame(loop);

// ---------------------------------------------------------------- scripted renders
window.__am = {
  set(o) {
    if (o.morph !== undefined) state.morph = o.morph;
    if (o.scene && (o.scene !== state.scene || o.reset)) setScene(o.scene);
    if (o.lod !== undefined) { state.lod = o.lod; applyLod(); }
    if (o.depth !== undefined) state.depth = o.depth;
    if (o.brain !== undefined) state.brain = o.brain;
    if (o.cam) { camera.position.fromArray(o.cam); controls.target.fromArray(o.target ?? [0, 0, 0]); camera.lookAt(controls.target); }
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    render();
    return true;
  },
  /** follow snail i: the camera at an offset (in the snail's frame: left, up, forward) from its shell */
  follow(i = 0, off = [0.03, 0.03, 0.04]) {
    const s = snails[i];
    const a = s.driver.anchor().clone();
    const h = s.driver.behaviour.heading, c = Math.cos(h), sn = Math.sin(h);
    controls.target.copy(a);
    camera.position.set(a.x + off[0] * c + off[2] * sn, a.y + off[1], a.z - off[0] * sn + off[2] * c);
    camera.lookAt(a);
    render();
    return true;
  },
  act(k) { ACTS[k][1](); return true; },
  red() { scene.background = new THREE.Color(1, 0, 0); scene.traverse((o) => { if (o.material) o.material.side = THREE.FrontSide; }); render(); return true; },
  startle() { startle(); return true; },
  intent(i, intent) { const t = intent.target; snails[i].driver.setIntent({ id: 99, urgency: 0.3, ...intent, target: t ? new THREE.Vector3(...t) : undefined }); return true; },
  advance(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) step(dt); render(); return true; },
  until(st, sub, max = 60, dt = 1 / 30, i = 0) {
    for (let t = 0; t < max; t += dt) { step(dt); const b = snails[i]?.driver.behaviour; if (b && b.state === st && (!sub || b.sub === sub)) break; }
    render();
    return true;
  },
  state() { return snails.map((s) => { const b = s.driver.behaviour; return { state: b.state, sub: b.sub, pos: b.pos.toArray().map((v) => +v.toFixed(4)), sink: +b.sink.toFixed(4) }; }); },
  /** where snail i's parts are (world): its root, the bed under it, the shell's apex and aperture */
  probe(i = 0) {
    const s = snails[i];
    s.root.updateMatrixWorld(true);
    const m = s.driver.modelOf;
    const w = (v) => v.clone().applyMatrix4(m.shellM).applyMatrix4(s.root.matrixWorld).toArray().map((x) => +x.toFixed(4));
    return { rootY: +s.root.position.y.toFixed(4), ground: +floor.heightAt(s.root.position.x, s.root.position.z).toFixed(4), sink: s.driver.behaviour.sink, apex: w(new THREE.Vector3()), ap: w(new THREE.Vector3(0.0026, -0.0086, 0)), visible: m.root.visible, lodVis: m.lod.levels.map((l) => l.object.visible) };
  },
  info() { return renderer.info.render; },
  get snails() { return snails; },
  get scene() { return scene; },
  /** draw calls and triangles of the scene alone (without the water's composite) */
  sceneInfo() { renderer.info.autoReset = false; renderer.info.reset(); renderer.setRenderTarget(null); renderer.render(scene, camera); const r = { ...renderer.info.render }; renderer.info.autoReset = true; return r; },
  morphs: MORPHS.length,
  render,
};
