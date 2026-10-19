// ヤマトオサガニ viewer: one crab in the photographs' views (front, top, side, three-quarter, underside, macro; any
// tier; clay or PBR; a still posture or any behaviour).
// ?capture hides the panel and exposes window.__os for scripted renders (tools/models/osagani/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildModel, disposeModel, osaganiRig } from '../../src/creatures/species/osagani/model.ts';
import { ClayLook } from '../../src/creatures/species/osagani/clay.ts';
import { applyPose } from '../../src/creatures/species/osagani/rig.ts';
import { stillPose as stillPoseOf } from '../../src/creatures/species/osagani/poses.ts';
import { chelaFor } from '../../src/creatures/species/osagani/anatomy.ts';

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
const S = { view: 'top', lod: 0, sex: 0, clay: true, cw: 35, pose: 'stand', legs: {}, hideLegs: false, ortho: 0, floor: true, bg: 0xe9e7e2, body: null, scan: 0, scanXf: null, scanClay: true };
// the CC0 photogrammetry scan of a male (ffish.asia / floraZia.com, Sketchfab): a local reference only, never shipped
let scanSrc = null;
async function loadScan() {
  if (scanSrc) return scanSrc;
  const g = await new GLTFLoader().loadAsync('./scan.glb');
  scanSrc = g.scene;
  return scanSrc;
}
let scene = null, crab = null, P = null, floorMesh = null;
const FLOOR = 0;

function clear() {
  if (crab) disposeModel(crab);
  crab = null;
  scene = new THREE.Scene();
}

function showLod(m, l) {
  m.lod.autoUpdate = false;
  m.lod.levels.forEach((lv, i) => { lv.object.visible = i === l; });
}

const chela = () => chelaFor(S.sex ? 'f' : 'm', S.cw);
function lookFor() { return new ClayLook(S.sex, chela().male); }
const SCALE = () => S.cw / 35;

function studio(v) {
  clear();
  scene.background = new THREE.Color(S.bg);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdde4ea, 0x6a6258, 1.25));
  if (v === 'under') { const l2 = new THREE.DirectionalLight(0xffffff, 1.6); l2.position.set(0.2, -1, 0.3); scene.add(l2, l2.target); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR - 0.0002;
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
  if (v === 'under') P.lift = 30;
  applyPose(crab.root, crab.bones, rig, P, chela().arm);
  crab.root.scale.setScalar(SCALE());
  if (v === 'under') crab.root.position.y = 0.02 * SCALE();
  crab.root.updateMatrixWorld(true);
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

function render() {
  controls.update();
  renderer.render(scene, camera);
}

function loop() {
  if (!capture) render();
  info.textContent = `${S.view}  LOD${S.lod}  ${S.clay ? 'clay' : 'PBR'}  ${S.pose}`;
  requestAnimationFrame(loop);
}

document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.scene; studio(S.view); }));
document.querySelectorAll('[data-lod]').forEach((b) => b.addEventListener('click', () => { S.lod = Number(b.dataset.lod); if (crab) showLod(crab, S.lod); }));
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
    for (const k of ['lod', 'sex', 'clay', 'cw', 'pose', 'hideLegs', 'ortho', 'floor', 'bg', 'body', 'scan', 'scanXf', 'scanClay']) if (o[k] !== undefined) S[k] = o[k];
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
  info() {
    const shell = crab?.shells[S.lod];
    return { view: S.view, lod: S.lod, tris: shell ? shell.geometry.index.count / 3 : 0, pose: S.pose };
  },
};
