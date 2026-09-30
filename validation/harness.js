// Orthographic reference renders of the rest pose for comparison with photos.
// URL params: view=lateral|dorsal|ventral|front, bg=#rrggbb, w, h, span (metres visible across), mode=beauty|mask
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShrimpModel } from '../src/shrimp/ShrimpModel.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'lateral';
const W = +(q.get('w') ?? 1600);
const H = +(q.get('h') ?? 900);
const bg = new THREE.Color(q.get('bg') ?? '#111111');
const mode = q.get('mode') ?? 'beauty';
const sex = q.get('sex') ?? 'female';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = bg;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = +(q.get('env') ?? 0.6);
const key = new THREE.DirectionalLight(0xffffff, +(q.get('key') ?? 2.2));
key.position.set(0.3, 1, 0.6);
scene.add(key, new THREE.HemisphereLight(0xffffff, 0x404040, +(q.get('hemi') ?? 0.8)));

const model = new ShrimpModel({ sex, berried: q.get('berried') === '1', scale: 1 });
scene.add(model.root);
model.addFlagellaTo(scene);
model.root.updateMatrixWorld(true);

// Settle the flagella with no flow so they hang naturally.
const zero = (p, o) => o.set(0, 0, 0);
for (let i = 0; i < 240; i++) {
  for (const f of model.flagella) {
    const p = new THREE.Vector3();
    const d = new THREE.Vector3(1, 0, 0);
    f.anchor.getWorldPosition(p);
    d.transformDirection(f.anchor.matrixWorld);
    f.update(1 / 60, p, d, zero, null);
  }
}
if (q.get('flagella') === '0') for (const f of model.flagella) f.mesh.visible = false;

if (mode === 'mask') {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.material = white; });
  scene.background = new THREE.Color(0x000000);
  scene.environment = null;
}

// Frame on the body: bounds of the landmarks.
const lm = model.landmarks();
const box = new THREE.Box3();
for (const k in lm) box.expandByPoint(lm[k]);
const c = box.getCenter(new THREE.Vector3());
const span = +(q.get('span') ?? 0.08);
const cam = new THREE.OrthographicCamera(-span / 2, span / 2, (span / 2) * (H / W), -(span / 2) * (H / W), 0.001, 1);
const dist = 0.3;
if (view === 'lateral') { cam.position.set(c.x, c.y, c.z + dist); cam.up.set(0, 1, 0); }
if (view === 'lateralR') { cam.position.set(c.x, c.y, c.z - dist); cam.up.set(0, 1, 0); }
if (view === 'dorsal') { cam.position.set(c.x, c.y + dist, c.z); cam.up.set(1, 0, 0); }
if (view === 'ventral') { cam.position.set(c.x, c.y - dist, c.z); cam.up.set(1, 0, 0); }
if (view === 'front') { cam.position.set(c.x + dist, c.y, c.z); cam.up.set(0, 1, 0); }
cam.lookAt(c);
cam.updateMatrixWorld();
renderer.render(scene, cam);
window.__app = { THREE, scene, cam, renderer, model, render: () => renderer.render(scene, cam) };

const toScreen = (v) => {
  const p = v.clone().project(cam);
  return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
};
window.__landmarks = Object.fromEntries(Object.entries(lm).map(([k, v]) => [k, toScreen(v)]));
window.__metresPerPixel = span / W;
window.__ready = true;
