import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = 100; // display scale: 1 unit = 1 cm
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x15130f);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 200);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 0.35; controls.maxDistance = 30; controls.autoRotateSpeed = 1.2; controls.autoRotate = true;

const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(4, 7, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1.9, far: 57.0 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fd8ff, 1.1); rim.position.set(-5, 3, -5); scene.add(rim);
const head = new THREE.DirectionalLight(0xffffff, 0.9); camera.add(head); scene.add(camera);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6b5a44, 0.9));

// wet-mud ground
function mudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const im = g.createImageData(512, 512); const r = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  const n = (x, y, s) => { const ix = Math.floor(x / s), iy = Math.floor(y / s), fx = x / s - ix, fy = y / s - iy, N = 512 / s, m = (a) => ((a % N) + N) % N, h = (a, b) => r(m(a) * 131 + m(b) * 7 + s);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v; };
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const v = 0.5 * n(x, y, 64) + 0.3 * n(x, y, 16) + 0.2 * n(x, y, 4) + (r(x * 7 + y * 977) - 0.5) * 0.25, i = (y * 512 + x) * 4;
    im.data[i] = 70 + v * 70; im.data[i + 1] = 63 + v * 62; im.data[i + 2] = 52 + v * 50; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const mt = mudTexture();
const groundMat = new THREE.MeshStandardMaterial({ map: mt, bumpMap: mt, bumpScale: 3.5, roughness: 0.55, color: 0xffffff });
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), groundMat); ground.receiveShadow = true; ground.position.y = -0.003; scene.add(ground);

let root, crab, mixer, actions = {}, current = null, joints = [], selected = null, clock = new THREE.Clock();
const nodes = {};
new GLTFLoader().load('./models/ilyoplax_pusilla.glb', (gltf) => {
  root = gltf.scene; root.scale.multiplyScalar(S); scene.add(root);
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if (o.material.map) o.material.map.anisotropy = 8; }
    if (o.name) nodes[o.name] = o;
    if (o.userData?.joint) { joints.push(o); o.userData.rest = o.rotation.toArray().slice(0, 3); }
  });
  crab = nodes.Crab;
  mixer = new THREE.AnimationMixer(root);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  buildUI(gltf.animations.map((a) => a.name)); buildTree(); setView('front', true); window.__ready = true;
}, undefined, (e) => { document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:10px;left:10px;color:#f88">${e.message || e}</pre>`); });

function play(name) {
  if (current) actions[current].fadeOut(0.25);
  document.querySelectorAll('#clips button').forEach((b) => b.classList.toggle('on', b.dataset.n === name));
  if (!name) { current = null; return; }
  actions[name].reset().fadeIn(0.25).play(); current = name;
}
function buildUI(names) {
  const box = $('clips'); const add = (label, n) => { const b = document.createElement('button'); b.textContent = label; b.dataset.n = n || ''; b.onclick = () => play(n); box.appendChild(b); };
  add('停止（手動）', ''); const jp = { Wave: '鋏を振る', Sidewalk: '横歩き', Idle: 'アイドル' };
  names.forEach((n) => add(jp[n] || n, n));
  document.querySelector('#clips button').classList.add('on');
  $('wire').onchange = (e) => root.traverse((o) => { if (o.isMesh) o.material.wireframe = e.target.checked; });
  $('rot').onchange = (e) => (controls.autoRotate = e.target.checked);
  $('ground').onchange = (e) => (ground.visible = e.target.checked);
  $('mud').onchange = (e) => { const m = nodes.MudGrains_mesh; if (m) m.visible = e.target.checked; };
  $('reset').onclick = () => { play(''); mixer.stopAllAction(); joints.forEach((j) => j.rotation.set(...j.userData.rest)); selected && showSliders(selected); };
  $('mirror').onclick = (e) => e.target.classList.toggle('on');
  document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => setView(b.dataset.v)));
}
function buildTree() {
  const t = $('tree'); t.innerHTML = '';
  const walk = (o, d) => {
    if (o.userData?.joint) { const el = document.createElement('div'); el.style.paddingLeft = d * 9 + 'px'; el.textContent = o.name; el.dataset.n = o.name; el.onclick = () => select(o); t.appendChild(el); }
    o.children.forEach((c) => walk(c, o.userData?.joint ? d + 1 : d));
  }; walk(root, 0);
}
const mirrorOf = (n) => (n.startsWith('R_') ? 'L_' + n.slice(2) : n.startsWith('L_') ? 'R_' + n.slice(2) : null);
function select(o) {
  selected = o; $('sel').textContent = o.name;
  document.querySelectorAll('#tree div').forEach((d) => d.classList.toggle('sel', d.dataset.n === o.name));
  showSliders(o);
}
function showSliders(o) {
  const box = $('sliders'); box.innerHTML = '';
  ['x', 'y', 'z'].forEach((ax) => {
    const lim = o.userData.hinge === ax ? [o.userData.min ?? -120, o.userData.max ?? 120] : [-90, 90];
    const rest = o.userData.rest[{ x: 0, y: 1, z: 2 }[ax]] * 180 / Math.PI;
    const row = document.createElement('div'); row.className = 'sl';
    row.innerHTML = `<b>${ax}</b><input type="range" min="${Math.min(lim[0], rest - 60)}" max="${Math.max(lim[1], rest + 60)}" step="0.5" value="${o.rotation[ax] * 180 / Math.PI}"><span></span>`;
    const inp = row.querySelector('input'), sp = row.querySelector('span'); sp.textContent = (+inp.value).toFixed(0) + '°';
    inp.oninput = () => {
      play(''); mixer.stopAllAction();
      o.rotation[ax] = inp.value * Math.PI / 180; sp.textContent = (+inp.value).toFixed(0) + '°';
      if ($('mirror').classList.contains('on')) { const m = nodes[mirrorOf(o.name) || '']; if (m) m.rotation[ax] = o.rotation[ax]; }
    };
    box.appendChild(row);
  });
}
canvas.addEventListener('pointerdown', (e) => { canvas._d = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!canvas._d || Math.hypot(e.clientX - canvas._d[0], e.clientY - canvas._d[1]) > 4 || !root) return;
  const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
  const hit = rc.intersectObject(root, true).find((h) => h.object.isMesh);
  if (!hit) return; let o = hit.object; while (o && !o.userData?.joint) o = o.parent; if (o) select(o);
});

const VIEWS = {
  front: { d: [0, 0.35, 1], t: [0, 0.45, 0], r: 6.08 }, back: { d: [0, 0.4, -1], t: [0, 0.45, 0], r: 6.08 }, top: { d: [0, 1, 0.001], t: [0, 0.4, 0], r: 6.46 },
  side: { d: [1, 0.2, 0], t: [0, 0.45, 0], r: 6.08 }, under: { d: [0, -1, 0.15], t: [0, 0.3, 0], r: 6.46, ground: false },
  claw: { d: [0.5, 0.15, 1], t: [0.28, 0.35, 0.55], r: 2.28 }, eye: { d: [0.4, 0.3, 1], t: [0.1, 0.85, 0.3], r: 1.71 }, leg: { d: [1, 0.25, 0.2], t: [0.75, 0.3, 0.05], r: 2.47 },
};
function setView(k, instant) {
  const v = VIEWS[k]; const dir = new THREE.Vector3(...v.d).normalize(), tg = new THREE.Vector3(...v.t);
  camera.position.copy(tg).addScaledVector(dir, v.r); controls.target.copy(tg); controls.update();
  ground.visible = v.ground === false ? false : $('ground').checked;
}
function resize() {
  const w = innerWidth - (innerWidth > 700 ? 310 : 0), h = innerHeight - (innerWidth > 700 ? 0 : innerHeight * 0.46);
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = w / h;
  camera.setViewOffset(innerWidth, innerHeight, innerWidth > 700 ? 155 : 0, innerWidth > 700 ? 0 : (innerHeight * 0.46) / 2, innerWidth, innerHeight); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); mixer?.update(dt); controls.update(); renderer.render(scene, camera); });
window.__api = { setView, select, nodes: () => nodes, camera, controls, play, renderer, scene };
