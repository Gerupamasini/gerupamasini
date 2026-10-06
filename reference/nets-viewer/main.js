// Hand-net viewer: studio and tidal-flat scenes for the six タモ網 GLBs, with wet / mud shading and
// the bag morph targets. ?capture hides the panel and exposes window.__nets for scripted renders
// (tools/models/nets/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { prepareNet, BAG_TARGETS } from '../../src/assets/models/nets/netMaterials.ts';

const URLS = Object.fromEntries(
  Object.entries(import.meta.glob(['../../src/assets/models/nets/*.glb', '../../src/assets/models/digging/*.glb', '../../src/assets/models/optics/*.glb', '../../src/assets/models/apparel/*.glb'], { eager: true, query: '?url', import: 'default' })).map(([k, v]) => [k.split('/').pop().replace('.glb', ''), v]),
);
const NET_IDS = ['net_small', 'net_shallow', 'net_fine', 'net_deep', 'net_dframe', 'net_carbon', 'dig_mini', 'dig_trowel', 'dig_shovel', 'dig_rake', 'obs_binoculars', 'wear_waders'];
const NET_JA = { net_small: '小型タモ', net_shallow: '浅瀬タモ', net_fine: '微細目タモ', net_deep: '深場タモ', net_dframe: 'D型底さらい網', net_carbon: 'カーボン網', dig_mini: 'ミニスコップ', dig_trowel: 'スコップ', dig_shovel: 'シャベル', dig_rake: '熊手', obs_binoculars: '双眼鏡', wear_waders: '胴長' };
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);

const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
camera.position.set(1.4, 1.1, 1.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0.4);
controls.enableDamping = true;

// ---------------------------------------------------------------- studio
function makeStudio() {
  const s = new THREE.Scene();
  s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.55;
  // seamless backdrop: a sphere with a soft vertical gradient and a matching floor that takes shadows
  const bgMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0xc9ced1) }, bottom: { value: new THREE.Color(0x8e9699) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.2, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), bgMat);
  s.add(bg);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(58, 64), new THREE.MeshStandardMaterial({ color: 0x9aa1a4, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  s.add(floor);
  const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
  key.position.set(-1.6, 3.2, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.left = -1.6; key.shadow.camera.right = 1.6; key.shadow.camera.top = 1.6; key.shadow.camera.bottom = -1.6;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 9;
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.002; key.shadow.radius = 4;
  s.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.6);
  fill.position.set(2.5, 1.2, 1.0);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(0.5, 2.0, -3.0);
  s.add(fill, rim);
  s.userData.key = key;
  return s;
}

// ---------------------------------------------------------------- tidal flat
function noiseFn(seed) {
  const h = (x, y) => { let n = x * 374761393 + y * 668265263 + seed * 982451653; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y, p) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const w = (a) => ((a % p) + p) % p;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h(w(ix), w(iy)), b = h(w(ix + 1), w(iy)), c = h(w(ix), w(iy + 1)), d = h(w(ix + 1), w(iy + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** wet silt with ripple marks, worm casts and shell grit (tileable canvas textures) */
function mudTextures(N = 1024) {
  const n1 = noiseFn(1), n2 = noiseFn(2), n3 = noiseFn(3);
  const H = new Float32Array(N * N), A = new Float32Array(N * N * 3), R = new Float32Array(N * N);
  const fbm = (x, y, p, o, f) => { let s = 0, a = 1, t = 0; for (let k = 0; k < o; k++) { s += a * f(x * 2 ** k, y * 2 ** k, p * 2 ** k); t += a; a *= 0.5; } return s / t; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const warp = fbm(u * 4, v * 4, 4, 3, n1);
    const rip = Math.sin((v * 36 + u * 5 + warp * 3.5 + fbm(u * 3, v * 3, 3, 3, n2) * 2.5) * Math.PI * 2);
    const ripMask = THREE.MathUtils.smoothstep(fbm(u * 3, v * 3, 3, 3, n1), 0.35, 0.65);
    const ripple = Math.pow(0.5 + 0.5 * rip, 1.6) * ripMask;
    const fine = fbm(u * 64, v * 64, 64, 3, n3);
    const blob = fbm(u * 8, v * 8, 8, 4, n2);
    const grit = n3(u * 700, v * 700, 700) > 0.965 && n1(u * 40, v * 40, 40) > 0.55 ? 1 : 0;
    // crab and worm burrows: a dark hole with a raised rim of spoil
    const cell = 24, cx = Math.floor(u * cell), cy = Math.floor(v * cell);
    let burrow = 0, rim = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = (cx + i + cell) % cell, gy = (cy + j + cell) % cell;
      if (n2(gx * 7.3, gy * 3.1, 1e9) < 0.8 || n1(gx * 0.37, gy * 0.41, 1e9) < 0.45) continue;
      const px = (cx + i + 0.2 + 0.6 * n1(gx * 1.7, gy * 2.9, 1e9)) / cell, py = (cy + j + 0.2 + 0.6 * n3(gx * 3.3, gy * 1.1, 1e9)) / cell;
      const r = (0.0015 + 0.003 * n3(gx, gy, 1e9)) * (1 + 0.0 * px);
      const d = Math.hypot(u - px, v - py);
      burrow = Math.max(burrow, 1 - THREE.MathUtils.smoothstep(d, r * 0.6, r));
      rim = Math.max(rim, Math.exp(-(((d - r * 1.5) / (r * 0.7)) ** 2)));
    }
    const h = ripple * 0.0025 + fine * 0.0012 + blob * 0.004 + grit * 0.0006 - burrow * 0.006 + rim * 0.0012;
    H[y * N + x] = h;
    const wetness = 0.5 + 0.5 * (1 - ripple) * (0.6 + 0.4 * blob);
    const base = [0.105, 0.088, 0.066].map((c) => c * (0.7 + 0.3 * fine + 0.25 * ripple + 0.2 * blob) * (1 - 0.3 * wetness));
    const shell = grit ? [0.32, 0.29, 0.25] : null;
    const tint = 0.85 + 0.3 * fbm(u * 6 + 9, v * 6, 6, 3, n3);
    let c = (shell ? base.map((b, k) => b * 0.4 + shell[k] * 0.6) : base).map((b, k) => b * tint * (k === 2 ? 0.95 : 1));
    c = c.map((b) => b * (1 - 0.8 * burrow) * (1 + 0.15 * rim));
    A.set(c, (y * N + x) * 3);
    R[y * N + x] = shell ? 0.6 : burrow > 0.5 ? 0.12 : 0.3 + 0.45 * (1 - wetness) + fine * 0.1;
  }
  const mk = (fill) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const c = fill(i); img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  };
  const albedo = mk((i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]].map((c) => Math.round(Math.pow(c, 1 / 2.2) * 255)));
  albedo.colorSpace = THREE.SRGBColorSpace;
  const px = 3 / N; // texture covers 3 m
  const normal = mk((i) => {
    const x = i % N, y = (i / N) | 0;
    const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    let nx = -hx / (2 * px), ny = hy / (2 * px), nz = 1; const l = Math.hypot(nx, ny, nz);
    return [((nx / l) * 0.5 + 0.5) * 255, ((ny / l) * 0.5 + 0.5) * 255, ((nz / l) * 0.5 + 0.5) * 255];
  });
  const rough = mk((i) => { const r = Math.round(R[i] * 255); return [255, r, 0]; });
  return { albedo, normal, rough };
}

/** gentle wind ripples for the water surface */
function waveNormal(N) {
  const n1 = noiseFn(7), n2 = noiseFn(8);
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    H[y * N + x] = n1(u * 6, v * 6, 6) * 0.6 + n2(u * 14 + 3, v * 9, 14) * 0.3 + n1(u * 32, v * 32, 32) * 0.1;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    const nx = -hx * 4, ny = hy * 4, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let mudTex = null;
function makeField() {
  const s = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 16), THREE.MathUtils.degToRad(215));
  Object.assign(sky.material.uniforms.sunPosition.value, sun);
  sky.material.uniforms.turbidity.value = 4.5;
  sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.85;
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  s.environment = pmrem.fromScene(envScene).texture;
  s.environmentIntensity = 0.35;
  s.add(sky);
  s.fog = new THREE.Fog(0xbfc9cc, 14, 90);
  mudTex ??= mudTextures(1024);
  for (const t of Object.values(mudTex)) t.repeat.set(10, 10);
  // ground with a shallow tidal channel along x, the water fills it
  const geo = new THREE.PlaneGeometry(30, 30, 300, 300);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const ground = (x, z) => {
    const ch = 1 - THREE.MathUtils.smoothstep(Math.abs(z + 0.25 + 0.35 * Math.sin(x * 0.4)), 0.4, 1.6);
    return -0.42 * ch + 0.02 * Math.sin(x * 1.3 + z * 0.7) + 0.012 * Math.sin(x * 3.1 - z * 2.3);
  };
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const mudMat = new THREE.MeshStandardMaterial({ map: mudTex.albedo, normalMap: mudTex.normal, roughnessMap: mudTex.rough, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7) });
  const mud = new THREE.Mesh(geo, mudMat);
  mud.receiveShadow = true;
  s.add(mud);
  const waterNormal = waveNormal(512);
  waterNormal.repeat.set(14, 14);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({ color: 0x223029, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.58, ior: 1.33, specularIntensity: 1, normalMap: waterNormal, normalScale: new THREE.Vector2(0.18, 0.18) }));
  // drawn before the blended nets: their underwater part is tinted in their own shader (netMaterials.ts)
  water.renderOrder = -1;
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.045;
  water.receiveShadow = true;
  s.add(water);
  const light = new THREE.DirectionalLight(0xffe2bf, 5.5);
  light.position.copy(sun).multiplyScalar(6);
  light.castShadow = true;
  light.shadow.mapSize.set(4096, 4096);
  Object.assign(light.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 20 });
  light.shadow.bias = -0.0003; light.shadow.normalBias = 0.003; light.shadow.radius = 3;
  s.add(light, light.target);
  s.add(new THREE.HemisphereLight(0xbfd6e8, 0x3a3226, 0.25));
  s.userData.exposure = 0.5;
  s.userData.waterY = water.position.y;
  s.userData.ground = ground;
  return s;
}

// ---------------------------------------------------------------- nets
const loader = new GLTFLoader();
const cache = new Map();
async function loadNet(id, tier) {
  const key = `${id}.${tier}`;
  if (!cache.has(key)) cache.set(key, loader.loadAsync(URLS[key]));
  const gltf = await cache.get(key);
  const root = gltf.scene.clone(true);
  const handle = prepareNet(root);
  handle.clips = gltf.animations;
  const ud = gltf.scene.children[0]?.userData;
  handle.info = ud?.higataNet ?? ud?.higataTool;
  return handle;
}

const scenes = { studio: makeStudio(), field: null };
const state = { scene: 'studio', nets: [] };
let active = scenes.studio;
const holder = new THREE.Group();

async function setScene(name) {
  if (name === 'field' && !scenes.field) scenes.field = makeField();
  state.scene = name;
  active = scenes[name];
  active.add(holder);
}

/**
 * Show nets. items: [{ id, tier, pos: [x,y,z], rot: [x,y,z] (deg, applied Y then X then Z), wet, mud, bag: {Stream..}, waterline }]
 */
async function show(items) {
  holder.clear();
  state.nets = [];
  for (const it of items) {
    const h = await loadNet(it.id, it.tier ?? 'hero');
    const r = h.root;
    r.position.fromArray(it.pos ?? [0, 0, 0]);
    const [rx, ry, rz] = (it.rot ?? [0, 0, 0]).map(THREE.MathUtils.degToRad);
    r.rotation.set(rx, ry, rz, 'YXZ');
    if (it.mouthAt || it.anchorAt) {
      // place the tool so a named node (the hoop centre by default) lands on a given world point
      r.updateMatrixWorld(true);
      const m = r.getObjectByName(it.anchor ?? 'Mouth').getWorldPosition(new THREE.Vector3());
      r.position.add(new THREE.Vector3().fromArray(it.mouthAt ?? it.anchorAt).sub(m));
    }
    h.setSurface({ wet: it.wet ?? 0, mud: it.mud ?? 0, waterline: it.waterline ?? null });
    h.setBag(it.bag ?? {});
    holder.add(r);
    state.nets.push(h);
  }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function renderOnce() {
  resize();
  controls.update();
  renderer.render(active, camera);
}

// ---------------------------------------------------------------- capture API
window.__nets = {
  async set({ scene = 'studio', nets, cam, fov = 30, exposure = 1, keyTarget }) {
    await setScene(scene);
    await show(nets);
    camera.fov = fov;
    camera.position.fromArray(cam.pos);
    controls.target.fromArray(cam.target);
    camera.lookAt(controls.target);
    renderer.toneMappingExposure = exposure * (active.userData.exposure ?? 1);
    if (scene === 'studio' && keyTarget) {
      const k = scenes.studio.userData.key;
      k.target.position.fromArray(keyTarget);
      k.position.set(keyTarget[0] - 1.6, keyTarget[1] + 3.2, keyTarget[2] + 2.2);
    }
    // two frames: the first compiles shaders and fills the shadow map
    renderOnce();
    renderOnce();
    return state.nets.map((n) => n.info && { id: n.info.id, mass_g: n.info.mass_g, len: n.info.overallLength_m });
  },
  ids: NET_IDS,
};

// ---------------------------------------------------------------- interactive UI
if (!capture) {
  const ui = { net: params.get('net') || 'net_shallow', tier: 'hero', scene: 'studio', wet: 0, mud: 0, bag: { Stream: 0, Invert: 0, Trail: 0, Wet: 0 } };
  const mixer = { m: null, clock: new THREE.Clock() };
  const seg = (el, items, cur, on) => {
    el.innerHTML = '';
    for (const [k, label] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = k === cur ? 'on' : '';
      b.onclick = () => { [...el.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); on(k); };
      el.appendChild(b);
    }
  };
  const refresh = async () => {
    await setScene(ui.scene);
    const field = ui.scene === 'field';
    await show([{ id: ui.net, tier: ui.tier, pos: field ? [0, 0.12, 0] : [0, 0.62, 0], rot: field ? [-32, -70, 0] : [0, -60, 0], wet: ui.wet, mud: ui.mud, bag: ui.bag, waterline: field ? scenes.field.userData.waterY : null }]);
    const h = state.nets[0];
    mixer.m = new THREE.AnimationMixer(h.root);
    const i = h.info;
    const sizeLine = i?.spec?.boot_cm ? `胸まで ${i.spec.chest_cm} cm・長靴 ${i.spec.boot_cm} cm` : i?.spec?.magnification ? `${i.spec.magnification}×${i.spec.objective_mm}・実視界 ${i.spec.fov_deg}°` : i?.spec?.hoop_cm ? `網口 ${i.spec.hoop_cm} cm・柄 ${i.spec.handle_cm} cm・網目 ${i.spec.mesh_mm} mm` : i ? `刃/爪 ${i.spec.blade_cm.join('×')} cm・柄 ${i.spec.handle_cm} cm・最大掘削深度 ${i.spec.maxDepth_cm} cm` : '';
    document.getElementById('info').textContent = i ? `${i.ja} / ${i.en}\n${sizeLine}\n全長 ${(i.overallLength_m * 100).toFixed(0)} cm・推定重量 ${i.mass_g} g\n重心 グリップから ${(i.balancePoint_m * 100).toFixed(0)} cm\n${i.materialsJa}` : '';
    seg(document.getElementById('clips'), h.clips.map((c) => [c.name, c.name.replace('Bag_', '').replace('Frame_', '')]), null, (name) => {
      mixer.m.stopAllAction();
      const a = mixer.m.clipAction(h.clips.find((c) => c.name === name));
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.reset().play();
    });
  };
  seg(document.getElementById('nets'), NET_IDS.map((k) => [k, NET_JA[k]]), ui.net, (k) => { ui.net = k; refresh(); });
  seg(document.getElementById('tiers'), [['hero', 'hero'], ['lod1', 'lod1'], ['lod2', 'lod2']], ui.tier, (k) => { ui.tier = k; refresh(); });
  seg(document.getElementById('scenes'), [['studio', 'スタジオ'], ['field', '干潟']], ui.scene, (k) => { ui.scene = k; refresh(); });
  for (const k of ['wet', 'mud']) {
    const el = document.getElementById(k);
    el.oninput = () => { ui[k] = +el.value; document.getElementById(`${k}v`).textContent = el.value; state.nets[0]?.setSurface({ [k]: ui[k] }); };
  }
  const morphs = document.getElementById('morphs');
  for (const k of BAG_TARGETS) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<span>${k}</span><input type="range" min="0" max="1" step="0.01" value="0"><span>0</span>`;
    const inp = row.querySelector('input');
    inp.oninput = () => { ui.bag[k] = +inp.value; row.lastChild.textContent = inp.value; state.nets[0]?.setBag({ [k]: ui.bag[k] }); };
    morphs.appendChild(row);
  }
  refresh();
  window.addEventListener('resize', resize);
  renderer.setAnimationLoop(() => {
    resize();
    controls.update();
    if (mixer.m) mixer.m.update(mixer.clock.getDelta());
    renderer.render(active, camera);
  });
}
