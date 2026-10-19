// トビハゼ reference viewer: the GLB tiers (or a clay build of the sculpt) under studio light, with fixed cameras for
// the photo comparisons (front, side, top, 3/4 front, macro face). ?model=<url> picks the file; ?capture hides the
// panel and exposes window.__tobi for scripted renders (tools/models/tobihaze/render.mjs).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');
const canvas = document.getElementById('view');
const dpr = Number(params.get('dpr') ?? Math.min(2, devicePixelRatio));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f6f6f);

// studio light: a soft key from the front-left above, a fill, a rim from behind, and a sky/ground ambient
scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x4a4540, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.6, 1.0, 0.8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8eef8, 0.7);
fill.position.set(-0.9, 0.3, 0.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-0.2, 0.6, -1.0);
scene.add(rim);

const persp = new THREE.PerspectiveCamera(30, 1, 0.0005, 10);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.0005, 10);
let camera = persp;
const controls = new OrbitControls(persp, canvas);
controls.enableDamping = !capture;

const clayMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a8, roughness: 0.62, metalness: 0 });
const clayEye = new THREE.MeshStandardMaterial({ color: 0x9c958c, roughness: 0.35, metalness: 0 });
// the eye's clear window (a primitive with the material 'Cornea') stays dark in clay, so the skin cap reads
const clayCornea = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.12, metalness: 0 });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.35, metalness: 0 });
const silMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
// x-ray: the skeleton opaque (alizarin red, as a cleared and stained specimen) inside a faint skin
const boneMat = new THREE.MeshStandardMaterial({ color: 0xc0283c, roughness: 0.5, metalness: 0 });
const cartMat = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.5, metalness: 0 });
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xe8dc8a, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
let model = null, original = new Map(), mode = 'clay', box = new THREE.Box3(), regions = {};

function applyMode(m) {
  mode = m;
  if (!model) return;
  scene.background = new THREE.Color(m === 'silhouette' || m === 'xray' || m === 'bones' ? 0xffffff : 0x6f6f6f);
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!original.has(o)) original.set(o, o.material);
    const eye = /eye/i.test(o.name), cornea = /cornea/i.test(original.get(o)?.name ?? '');
    // bones are the meshes named Bone_* (Cart_* for cartilage); in 'xray' the rest is a faint skin, in 'bones' hidden
    const bone = /^Bone_/.test(o.name), cart = /^Cart_/.test(o.name), tooth = /^Teeth_/.test(o.name);
    o.visible = !(m === 'bones' && !bone && !cart && !tooth) && !((m === 'clay' || m === 'silhouette' || m === 'textured') && (bone || cart));
    if (m === 'xray' || m === 'bones') o.material = bone || tooth ? boneMat : cart ? cartMat : ghostMat;
    // a globe with a window has a skin cap (clay like the head); a bare globe keeps the eye clay
    const capped = eye && o.parent?.children.some((c) => /cornea/i.test((original.get(c) ?? c.material)?.name ?? ''));
    if (m !== 'xray' && m !== 'bones') o.material = m === 'clay' ? (tooth ? toothMat : cornea ? clayCornea : eye && !capped ? clayEye : clayMat) : m === 'silhouette' ? silMat : original.get(o);
  });
}

async function load(url) {
  if (model) { scene.remove(model); original.clear(); }
  const gltf = await new GLTFLoader().loadAsync(url);
  model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  regions = {};
  model.traverse((o) => { if (o.userData?.regions) Object.assign(regions, o.userData.regions); });
  applyMode(mode);
  return { box: [box.min.toArray(), box.max.toArray()], regions: Object.keys(regions) };
}

const tmpV = new THREE.Vector3();
/**
 * shot.view: { azim: deg (0 = from the front, 90 = from the fish's left, 180 = behind), elev: deg (90 = above),
 *   roll: deg, ortho: bool, fov: deg, fit: 'all' | region name | [[x,y,z],[x,y,z]], margin: share, shift: [x, y] share }
 */
function setView(v) {
  const azim = THREE.MathUtils.degToRad(v.azim ?? 0), elev = THREE.MathUtils.degToRad(v.elev ?? 0);
  const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
  let b = box;
  if (typeof v.fit === 'string' && v.fit !== 'all' && regions[v.fit]) b = new THREE.Box3(new THREE.Vector3(...regions[v.fit][0]), new THREE.Vector3(...regions[v.fit][1]));
  else if (Array.isArray(v.fit)) b = new THREE.Box3(new THREE.Vector3(...v.fit[0]), new THREE.Vector3(...v.fit[1]));
  const centre = b.getCenter(new THREE.Vector3());
  if (v.target) centre.set(...v.target);
  const size = b.getSize(new THREE.Vector3()).length();
  // camera basis
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, v.topUp ?? 1) : new THREE.Vector3(0, 1, 0);
  const w = canvas.clientWidth, h = canvas.clientHeight, aspect = w / h;
  const fwd = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, fwd).normalize();
  if (v.roll) { const q = new THREE.Quaternion().setFromAxisAngle(fwd, THREE.MathUtils.degToRad(v.roll)); right.applyQuaternion(q); camUp.applyQuaternion(q); }
  // extent of the fitted box across the view
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let c = 0; c < 8; c++) {
    tmpV.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).sub(centre);
    const x = tmpV.dot(right), y = tmpV.dot(camUp);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const margin = 1 + (v.margin ?? 0.08);
  const halfW = Math.max((maxX - minX) / 2, ((maxY - minY) / 2) * aspect) * margin;
  const halfH = halfW / aspect;
  const off = new THREE.Vector3().addScaledVector(right, (minX + maxX) / 2).addScaledVector(camUp, (minY + maxY) / 2);
  if (v.shift) off.addScaledVector(right, v.shift[0] * halfW * 2).addScaledVector(camUp, v.shift[1] * halfH * 2);
  const look = centre.clone().add(off);
  if (v.ortho) {
    camera = ortho;
    ortho.left = -halfW; ortho.right = halfW; ortho.top = halfH; ortho.bottom = -halfH;
    ortho.position.copy(look).addScaledVector(dir, size * 2);
    ortho.up.copy(camUp);
    ortho.lookAt(look);
    ortho.near = size * 0.01; ortho.far = size * 10;
    ortho.updateProjectionMatrix();
  } else {
    camera = persp;
    persp.fov = v.fov ?? 30;
    persp.aspect = aspect;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)) + size * 0.5;
    persp.position.copy(look).addScaledVector(dir, dist);
    persp.up.copy(camUp);
    persp.lookAt(look);
    persp.near = dist * 0.02; persp.far = dist * 20;
    persp.updateProjectionMatrix();
    controls.target.copy(look);
  }
  // the key light keeps its place relative to the camera (photos are lit from the camera's side and above)
  if (v.light !== 'fixed') {
    key.position.copy(dir).multiplyScalar(0.7).addScaledVector(camUp, 0.9).addScaledVector(right, -0.5);
    fill.position.copy(dir).multiplyScalar(0.5).addScaledVector(right, 0.9);
    rim.position.copy(dir).multiplyScalar(-1).addScaledVector(camUp, 0.6);
  }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
}

function render() { renderer.render(scene, camera); }

const initial = params.get('model');
const ready = initial ? load(initial) : Promise.resolve();
window.__tobi = {
  load,
  async set(shot) {
    await ready;
    if (shot.model) await load(shot.model);
    if (shot.mode) applyMode(shot.mode);
    resize();
    setView(shot.view ?? {});
    render();
    return { camera: camera.isOrthographicCamera ? 'ortho' : 'persp' };
  },
};

await ready;
resize();
setView({ azim: 35, elev: 20, fit: 'all' });
for (const b of document.querySelectorAll('[data-view]')) {
  const views = { front: { azim: 0, elev: 0, ortho: true }, side: { azim: 90, elev: 0, ortho: true }, top: { azim: 0, elev: 90, ortho: true }, q34: { azim: 40, elev: 18 }, macro: { azim: 25, elev: 22, fov: 20, fit: 'face' } };
  b.addEventListener('click', () => setView(views[b.dataset.view]));
}
document.getElementById('clay').addEventListener('click', () => applyMode(mode === 'clay' ? 'textured' : 'clay'));
if (!capture) {
  const loop = () => { controls.update(); render(); requestAnimationFrame(loop); };
  window.addEventListener('resize', resize);
  loop();
}
