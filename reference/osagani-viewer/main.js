// ヤマトオサガニ viewer: one crab in the photographs' views (front, top, side, three-quarter, underside, macro; any
// tier; clay or PBR; a still posture or any behaviour).
// ?capture hides the panel and exposes window.__os for scripted renders (tools/models/osagani/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildModel, disposeModel, osaganiRig } from '../../src/creatures/species/osagani/model.ts';
import { ClayLook } from '../../src/creatures/species/osagani/clay.ts';
import { OsaganiLook } from '../../src/creatures/species/osagani/materials.ts';
import { applyPose } from '../../src/creatures/species/osagani/rig.ts';
import { stillPose as stillPoseOf } from '../../src/creatures/species/osagani/poses.ts';
import { chelaFor } from '../../src/creatures/species/osagani/anatomy.ts';
import { createCrabBehavior } from '../../src/creatures/species/osagani/behavior.ts';
import { burrowsFor, mouthRadius, CRAB_RENDER_ORDER } from '../../src/creatures/species/osagani/burrows.ts';

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

const rig = osaganiRig();
const info = document.getElementById('info');
const S = { view: 'top', lod: 0, sex: 0, clay: true, morph: 0, seed: 1, mud: 0.25, palmBlue: 0, juvenile: 0, wet: 1, mudFloor: false, cw: 35, pose: 'stand', legs: {}, hideLegs: false, ortho: 0, floor: true, bg: 0xe9e7e2, body: null, scan: 0, scanXf: null, scanClay: true };
// the CC0 photogrammetry scan of a male (ffish.asia / floraZia.com, Sketchfab): a local reference only, never shipped
let scanSrc = null;
async function loadScan() {
  if (scanSrc) return scanSrc;
  const g = await new GLTFLoader().loadAsync('./scan.glb');
  scanSrc = g.scene;
  return scanSrc;
}
let scene = null, crab = null, P = null, floorMesh = null, beh = null, simT = 0, burrowEntry = null;
// the behaviour's mud: low ripples and lumps (mm) so that the feet have something to follow
const mudHeight = (x, z) => 0.0025 * Math.sin(x * 23 + 1.3) * Math.cos(z * 17) + 0.0012 * Math.sin(x * 71 + z * 43) + 0.006 * Math.sin(x * 3.1) * Math.cos(z * 2.3);
const BURROW = { x: 0.07, z: 0.03, az: 0.9 };
const FLOOR = 0;

function clear() {
  if (crab) disposeModel(crab);
  crab = null; beh = null; burrowEntry = null;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

// (`arm` overrides the arm's scale: the scan's claw compared at its own size)
const chela = () => { const c = chelaFor(S.sex ? 'f' : 'm', S.cw); return S.arm ? { ...c, arm: S.arm } : c; };
function lookFor() {
  if (S.clay) return new ClayLook(S.sex, chela().male);
  return new OsaganiLook({ seed: S.seed * 13.7, sex: S.sex, maleChela: chela().male, juvenile: S.juvenile, morph: S.morph, palmBlue: S.palmBlue, mud: S.mud, value: 1 });
}

// ---------------------------------------------------------------- the mud (the game's flat: wet, fine, a little glossy)
function mudMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.12, 0.075), roughness: 0.55 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
float hM(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float nM(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hM(i), hM(i + vec2(1, 0)), f.x), mix(hM(i + vec2(0, 1)), hM(i + vec2(1)), f.x), f.y); }
`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 mm = vW.xz * 1000.0;
  diffuseColor.rgb *= 0.8 + 0.35 * nM(mm * 0.03) + 0.12 * nM(mm * 0.4) + 0.1 * (hM(floor(mm * 3.0)) - 0.5);
}`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n{ vec2 mm = vW.xz * 1000.0; roughnessFactor = mix(0.25, 0.75, smoothstep(0.35, 0.7, nM(mm * 0.05))); }');
  };
  return m;
}
const SCALE = () => S.cw / 35;

function studio(v) {
  clear();
  scene.background = new THREE.Color(S.bg);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdde4ea, 0x6a6258, S.clay ? 1.25 : 0.55));
  if (v === 'under') { const l2 = new THREE.DirectionalLight(0xffffff, 1.6); l2.position.set(0.2, -1, 0.3); scene.add(l2, l2.target); }
  const fg = S.behave ? new THREE.PlaneGeometry(1.2, 1.2, 600, 600) : new THREE.PlaneGeometry(3, 3);
  if (S.behave) { fg.rotateX(-Math.PI / 2); const p = fg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, mudHeight(p.getX(i), p.getZ(i))); fg.computeVertexNormals(); fg.rotateX(Math.PI / 2); }
  const floor = new THREE.Mesh(fg, S.mudFloor || S.behave ? mudMaterial() : new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR - (S.behave ? 0 : 0.0002);
  floor.visible = v !== 'under' && S.pose !== 'bind' && S.floor;
  floorMesh = floor;
  scene.add(floor);
  crab = buildModel(lookFor());
  showLod(crab, S.lod);
  scene.add(crab.root);
  crab.root.visible = S.scan !== 2;
  if (S.scan && scanSrc) {
    const sc = scanSrc.clone(true);
    const x = S.scanXf ?? {};
    sc.position.set(...(x.pos ?? [0, 0, 0]));
    sc.rotation.set(...(x.rot ?? [0, 0, 0]), 'YXZ');
    sc.scale.setScalar(x.scale ?? 1);
    if (S.scanClay) sc.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xa9b3b9, roughness: 0.62 }); });
    sc.traverse((o) => { if (o.name === 'Cube_0' || o.name === 'Object_4') o.visible = !!x.cube; });
    scene.add(sc);
  }
  P = stillPoseOf(rig, S.pose, S.legs, chela().male);
  if (S.body) Object.assign(P, S.body);
  if (S.behave) {
    const cw = S.cw / 1000;
    beh = createCrabBehavior({ world: { ground: mudHeight, waterY: () => -1, threat: () => (S.threat ? { pos: camera.position } : null) }, rng: mulberry(S.seed * 977 + 3), rig, scale: cw, start: { x: 0, z: 0, heading: 0 }, burrow: BURROW, maleChela: chela().male });
    for (const m of crab.shells) m.renderOrder = CRAB_RENDER_ORDER;
    burrowEntry = { ...BURROW, r: mouthRadius(cw), crab: { x: 0, z: 0, heading: 0, cw, out: true, shadow: 0.38 } };
    burrowsFor(scene).entries.add(burrowEntry);
    P = beh.update(1 / 60, S.lod);
  }
  if (v === 'under') P.lift = 30;
  applyPose(crab.root, crab.bones, rig, P, chela().arm);
  crab.root.scale.setScalar(SCALE());
  if (v === 'under') crab.root.position.y = 0.02 * SCALE();
  crab.root.updateMatrixWorld(true);
  if (!S.clay) { const u = crab.look.uniforms; u.uMmScale.value = 0.001 * SCALE(); u.uGroundY.value = v === 'under' ? -1 : FLOOR; u.uWet.value = S.wet; }
  if (S.hideLegs) { for (const leg of rig.legs) crab.bones[`J_${leg.id}${leg.side}_cx`].scale.setScalar(1e-4); crab.root.updateMatrixWorld(true); }
  renderer.toneMappingExposure = 1.0;
  const k = SCALE();
  const cams = {
    top: [0, 0.2, 0.0001], front: [0, 0.012, 0.18], side: [0.18, 0.012, 0], oblique: [0.1, 0.09, 0.12], under: [0, -0.2, 0.0001], macro: [0.025, 0.03, 0.04],
  };
  camera.position.set(...(cams[v] ?? cams.top).map((x) => x * k));
  camera.up.set(0, 1, 0);
  if (v === 'top' || v === 'under') camera.up.set(0, 0, 1);
  controls.target.set(0, (v === 'under' ? 0.02 : 0.006) * k, 0);
  persp.fov = v === 'macro' ? 35 : 22;
  setCamera();
}

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

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const asp = w / Math.max(1, h);
  persp.aspect = asp;
  persp.updateProjectionMatrix();
  if (S.ortho > 0) { orthoCam.top = S.ortho; orthoCam.bottom = -S.ortho; orthoCam.left = -S.ortho * asp; orthoCam.right = S.ortho * asp; orthoCam.updateProjectionMatrix(); }
}
window.addEventListener('resize', resize);

const viewerFloor = { heightAt: mudHeight, waterAt: () => -1 };
function stepBehaviour(dt) {
  if (!beh) return;
  simT += dt;
  P = beh.update(dt, S.lod);
  applyPose(crab.root, crab.bones, rig, P, chela().arm);
  crab.root.scale.setScalar(SCALE());
  crab.root.updateMatrixWorld(true);
  crab.root.visible = !beh.hidden;
  if (!S.clay) { const u = crab.look.uniforms; u.uGroundY.value = mudHeight(beh.pos.x, beh.pos.z); u.uMudCoat.value = Math.min(1, S.mud + P.mudCoat * 0.6); }
  const st = beh.state, e = burrowEntry.crab;
  e.x = st.pos.x; e.z = st.pos.z; e.heading = st.heading; e.out = st.burrow < 0.3; e.shadow = 0.38 * (1 - st.burrow / 0.3);
  burrowsFor(scene).frame(simT, viewerFloor, camera.position);
}
function mulberry(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function render() {
  controls.update();
  renderer.render(scene, camera);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, ((now ?? last) - last) / 1000);
  last = now ?? last;
  if (!capture) { stepBehaviour(dt); render(); }
  info.textContent = `${S.view}  LOD${S.lod}  ${S.clay ? 'clay' : 'PBR'}  ${S.pose}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.scene; studio(S.view); }));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { S.lod = Number(b.dataset.lod); if (crab) showLod(crab, S.lod); }));
function command(m) {
  if (!beh) { S.behave = true; studio(S.view); }
  const p = beh.pos, k = SCALE();
  switch (m) {
    case 'IDLE': beh.idle(30); break;
    case 'WALK': beh.walk({ x: p.x - 0.18 * k, z: p.z + 0.05 * k }); break;
    case 'RUN': beh.walk({ x: p.x - 0.3 * k, z: p.z + 0.1 * k }, true); break;
    case 'FORAGE': beh.forage(30); break;
    case 'BURROW_ENTRY': beh.enterBurrow(60); break;
    case 'BURROW_EXIT': beh.exitBurrow(2); break;
    case 'DEFEND': beh.defend(camera.position.clone(), 30); break;
    case 'ESCAPE': beh.escape(camera.position.clone()); break;
  }
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => command(b.dataset.mode)));
document.querySelectorAll('[data-clay]').forEach((b) => b.addEventListener('click', () => { S.clay = b.dataset.clay === '1'; studio(S.view); }));
document.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => { S.sex = Number(b.dataset.sex); studio(S.view); }));

resize();
studio(S.view);
requestAnimationFrame(loop);

window.__os = {
  async loadScan() { await loadScan(); },
  /** the scan's vertices (mm, world) within `w` mm of the plane axis = at: [[u, v], …] in the other two axes */
  scanSlice(axis, at, w = 0.25) {
    const out = [];
    const v = new THREE.Vector3();
    scanSrc.updateMatrixWorld(true);
    scanSrc.traverse((o) => {
      if (!o.isMesh || o.name === 'Object_4') return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).multiplyScalar(1000);
        const a = axis === 'x' ? v.x : axis === 'y' ? v.y : v.z;
        if (Math.abs(a - at) > w) continue;
        out.push(axis === 'x' ? [v.z, v.y] : axis === 'y' ? [v.x, v.z] : [v.x, v.y]);
      }
    });
    return out;
  },
  scanBox() {
    const b = new THREE.Box3().setFromObject(scanSrc);
    return { min: b.min.toArray(), max: b.max.toArray() };
  },
  set(o) {
    for (const k of ['arm', 'lod', 'sex', 'clay', 'cw', 'pose', 'hideLegs', 'ortho', 'floor', 'bg', 'body', 'scan', 'scanXf', 'scanClay', 'morph', 'seed', 'mud', 'palmBlue', 'juvenile', 'wet', 'mudFloor', 'behave', 'threat']) if (o[k] !== undefined) S[k] = o[k];
    if (o.legs !== undefined) S.legs = o.legs ?? {};
    if (o.view) { S.view = o.view; studio(o.view); } else if (crab) showLod(crab, S.lod);
    if (o.floor !== undefined && floorMesh) floorMesh.visible = S.floor && S.pose !== 'bind';
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.up) camera.up.set(...o.up);
    if (o.fov) { persp.fov = o.fov; persp.updateProjectionMatrix(); }
    if (o.ortho !== undefined || o.view) setCamera();
    if (o.exposure !== undefined) renderer.toneMappingExposure = o.exposure;
    controls.update();
    render();
  },
  render,
  mode(m) { command(m); },
  /** simulated seconds (40 steps a second) */
  advance(seconds) { for (let i = 0; i < Math.round(seconds * 40); i++) stepBehaviour(1 / 40); render(); },
  /** simulated time until the behaviour reaches `phase` (or `max` s), then `after` more */
  until(phase, max = 20, after = 0) {
    for (let k = 0; k < max * 40; k++) { stepBehaviour(1 / 40); if (beh?.state.phase === phase) break; }
    for (let i = 0; i < Math.round(after * 40); i++) stepBehaviour(1 / 40);
    render();
  },
  follow(o) {
    if (!beh) return;
    const p = beh.pos;
    controls.target.set(p.x + (o.dt?.[0] ?? 0), p.y + (o.dt?.[1] ?? 0.008), p.z + (o.dt?.[2] ?? 0));
    if (o.offset) camera.position.set(p.x + o.offset[0], p.y + o.offset[1], p.z + o.offset[2]);
    controls.update();
    render();
  },
  info() {
    const shell = crab?.shells[S.lod];
    return { view: S.view, lod: S.lod, tris: shell ? shell.geometry.index.count / 3 : 0, pose: beh ? `${beh.state.mode}/${beh.state.phase} b${beh.state.burrow.toFixed(2)}` : S.pose };
  },
};
