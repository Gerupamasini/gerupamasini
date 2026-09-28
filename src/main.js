import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { applyUnderwater } from './shaders.js';
import { setWorldUniforms } from './materials.js';
import { Ecosystem } from './creatures.js';
import { WaterPass } from './water.js';
import { makeDOFPass, makeGradePass } from './post.js';
import { SPECIES, ORDER } from './species.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.04, 6000);
camera.position.set(6, 30, 26);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.2;
controls.maxDistance = 110;
controls.maxPolarAngle = 1.4;
controls.screenSpacePanning = false;
controls.panSpeed = 1.2;
controls.zoomSpeed = 1.2;

const world = new World(scene, renderer);
setWorldUniforms(world.uniforms);
const eco = new Ecosystem(world);
scene.traverse((o) => {
  if (!o.isMesh || o === world.terrain) return;
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of ms) {
    if (!m.isMeshStandardMaterial || m === world.terrainMat || m === world.featureMat || m.userData.u) continue;
    applyUnderwater(m, world.uniforms);
  }
});

// ---------- ポストプロセス ----------
// シーン → 水面（屈折・吸収・反射） → 被写界深度 → ブルーム → 色調 → 出力
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
rt.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight, THREE.FloatType);
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const water = new WaterPass(camera, world);
composer.addPass(water);
const dof = makeDOFPass();
composer.addPass(dof);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.5, 1.4);
composer.addPass(bloom);
const grade = makeGradePass();
composer.addPass(grade);
composer.addPass(new OutputPass());
function sizePasses() {
  const pr = renderer.getPixelRatio();
  water.setSize(innerWidth * pr, innerHeight * pr);
  dof.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr);
}
sizePasses();

// ---------- 時間と潮 ----------
const state = {
  hour: params.has('hour') ? +params.get('hour') : 9.5,
  tidePhase: params.has('tide') ? +params.get('tide') : 0.02,   // 0: 干潮 0.5: 満潮
  speed: 1,
  paused: false,
  t: 0,
  follow: null,
  dof: true,
};
const TIDE_MID = -0.35, TIDE_AMP = 1.35;
const TIDE_PERIOD = 300; // 秒（速度1のとき）
const tideLevel = (ph) => TIDE_MID - TIDE_AMP * Math.cos(ph * Math.PI * 2);

// ---------- UI ----------
const $ = (s) => document.querySelector(s);
const listEl = $('#species-list');
for (const k of ORDER) {
  const sp = SPECIES[k];
  const li = document.createElement('button');
  li.className = 'sp';
  li.dataset.key = k;
  li.innerHTML = `<i style="background:${sp.color}"></i><span class="nm">${sp.name}</span><span class="ct">0</span>`;
  li.addEventListener('click', () => {
    const a = eco.findVisible(k, controls.target);
    if (a) select(a); else toast(`${sp.name} はいま姿を見せていません（${hint(k)}）`);
  });
  listEl.appendChild(li);
}
function hint(k) {
  if (k === 'mahaze' || k === 'himehaze') return '澪筋や潮だまりを探してみましょう';
  if (k === 'kometsuki' || k === 'yamato') return '潮が引くと巣穴から出てきます';
  if (k === 'sunamogri') return '潮が満ちると巣穴の入口に顔を出します';
  if (k === 'mategai') return 'ときどき穴から飛び出します';
  return 'しばらく待ってみましょう';
}

const tideSlider = $('#tide');
const hourSlider = $('#hour');
const speedSlider = $('#speed');
tideSlider.value = state.tidePhase;
hourSlider.value = state.hour;
tideSlider.addEventListener('input', () => { state.tidePhase = +tideSlider.value; });
hourSlider.addEventListener('input', () => { state.hour = +hourSlider.value; world.setTimeOfDay(state.hour); });
speedSlider.addEventListener('input', () => { state.speed = +speedSlider.value; $('#speed-v').textContent = `×${state.speed}`; });
$('#pause').addEventListener('click', () => { state.paused = !state.paused; $('#pause').textContent = state.paused ? '▶ 再生' : '❚❚ 一時停止'; });
$('#tiltbtn').addEventListener('click', () => { state.dof = !state.dof; $('#tiltbtn').classList.toggle('on', state.dof); });
$('#topbtn').addEventListener('click', () => {
  const d = camera.position.distanceTo(controls.target);
  camPos.set(controls.target.x, controls.target.y + d * 0.98, controls.target.z + d * 0.2);
  camFly = 1;
});
$('#close').addEventListener('click', () => deselect());
$('#hidebtn').addEventListener('click', () => document.body.classList.toggle('clean'));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') deselect();
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
  if (e.key === ' ') { $('#pause').click(); e.preventDefault(); }
});

let toastT = 0;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); toastT = 3.5; }

// ---------- 選択と追従 ----------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let downAt = null;
const camPos = new THREE.Vector3();
let camFly = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(eco.group.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.agent) o = o.parent;
    if (o && o.visible) { select(o.userData.agent); return; }
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.975, 1.0, 96).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false })
);
ring.renderOrder = 20;
ring.visible = false;
scene.add(ring);

function select(a) {
  state.follow = a;
  const sp = SPECIES[a.species];
  $('#card-name').textContent = sp.name;
  $('#card-sci').textContent = sp.sci;
  $('#card-size').textContent = sp.size;
  $('#card-text').textContent = sp.text;
  $('#card').classList.add('show');
  const dist = { kometsuki: 2.6, yamato: 4.5, sunamogri: 3.2, mahaze: 3.5, himehaze: 3, yadokari: 2.8, arumushiro: 2.6, asari: 3, mategai: 3.5 }[a.species] || 4;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.55) { dir.y = 0.8; dir.normalize(); }
  camPos.copy(a.root.position).addScaledVector(dir, dist);
  camFly = 1;
}
function deselect() { state.follow = null; $('#card').classList.remove('show'); ring.visible = false; }

// ---------- 観察用の固定表示（?inspect=種名&cam=方位,仰角,距離&state=行動） ----------
const inspectName = params.get('inspect');
const inspectAgent = inspectName ? eco.agents.find((a) => a.species === inspectName) : null;
const camSpec = (params.get('cam') || '0,0.35,3').split(',').map(Number);
function holdInspect() {
  const a = inspectAgent;
  if (a.sink !== undefined) { a.sink = 0; a.state = params.get('state') || 'idle'; a.timer = 99; if (a.state === 'wave') a.wave = 1; }
  if (a.targetOut !== undefined) { a.out = a.targetOut = 1; a.timer = 99; }
  const P = a.root.position;
  for (const o of eco.agents) if (o !== a && o.root.position.distanceTo(P) < 3) o.root.visible = false;
  const [az, el, d] = camSpec;
  const yaw = (a.yaw || 0) + az;
  controls.target.set(P.x, P.y + 0.15 * d / 3, P.z);
  camera.position.set(P.x + Math.sin(yaw) * Math.cos(el) * d, P.y + Math.sin(el) * d + 0.1, P.z + Math.cos(yaw) * Math.cos(el) * d);
  camera.lookAt(controls.target);
}

// ---------- ループ ----------
world.setTimeOfDay(state.hour);
const clock = new THREE.Clock();
let countT = 0;
const tideCanvas = $('#tidegraph');
const tctx = tideCanvas.getContext('2d');

function drawTide(ph) {
  const w = tideCanvas.width, h = tideCanvas.height;
  tctx.clearRect(0, 0, w, h);
  tctx.strokeStyle = 'rgba(255,255,255,0.18)';
  tctx.beginPath(); tctx.moveTo(0, h / 2); tctx.lineTo(w, h / 2); tctx.stroke();
  const grad = tctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(120,190,220,0.55)'); grad.addColorStop(1, 'rgba(120,190,220,0.05)');
  tctx.fillStyle = grad;
  tctx.beginPath(); tctx.moveTo(0, h);
  for (let x = 0; x <= w; x++) {
    const p = ph - 0.5 + x / w;
    tctx.lineTo(x, h * 0.5 + Math.cos(p * Math.PI * 2) * h * 0.36);
  }
  tctx.lineTo(w, h); tctx.fill();
  tctx.strokeStyle = '#bfe6f5'; tctx.lineWidth = 1.5;
  tctx.beginPath();
  for (let x = 0; x <= w; x++) { const p = ph - 0.5 + x / w; const y = h * 0.5 + Math.cos(p * Math.PI * 2) * h * 0.36; x ? tctx.lineTo(x, y) : tctx.moveTo(x, y); }
  tctx.stroke();
  const cy = h * 0.5 + Math.cos(ph * Math.PI * 2) * h * 0.36;
  tctx.fillStyle = '#fff'; tctx.beginPath(); tctx.arc(w / 2, cy, 3.5, 0, Math.PI * 2); tctx.fill();
}

function frame() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = state.paused ? 0 : rawDt * state.speed;
  state.t += dt;
  state.tidePhase = (state.tidePhase + dt / TIDE_PERIOD) % 1;
  if (!state.paused && document.activeElement !== tideSlider) tideSlider.value = state.tidePhase.toFixed(4);
  // 1潮（約12.4時間）を TIDE_PERIOD 秒に圧縮し、時刻も進める
  state.hour += dt * (12.4 / TIDE_PERIOD) * 0.25;
  if (state.hour > 18.8) state.hour = 5.2;
  if (Math.abs(+hourSlider.value - state.hour) > 0.05) { hourSlider.value = state.hour; world.setTimeOfDay(state.hour); }

  const level = tideLevel(state.tidePhase);
  const camDist = camera.position.distanceTo(controls.target);
  world.update(dt, state.t, level, controls.target, camDist);
  eco.update(dt, state.t, camera.position);
  if (inspectAgent) holdInspect();

  // 追従カメラ
  if (state.follow) {
    const a = state.follow;
    const p = a.root.position;
    const tgt = new THREE.Vector3(p.x, Math.max(p.y, world.heightAt(p.x, p.z)), p.z);
    const prev = controls.target.clone();
    controls.target.lerp(tgt, 1 - Math.exp(-rawDt * 4));
    camera.position.add(controls.target.clone().sub(prev));
    ring.visible = a.visible;
    ring.position.set(p.x, world.heightAt(p.x, p.z) + 0.03, p.z);
    const s = { yamato: 1.6, mategai: 0.8, asari: 1.1, sunamogri: 1.3 }[a.species] || 0.9;
    ring.scale.setScalar(s * (1 + 0.06 * Math.sin(state.t * 4)));
  }
  if (camFly > 0) {
    camera.position.lerp(camPos, 1 - Math.exp(-rawDt * 2.5));
    camFly -= rawDt * 0.6;
  }
  if (!inspectAgent) controls.update();
  // カメラが地面や水面に潜らないように
  const gh = world.heightAt(camera.position.x, camera.position.z);
  camera.position.y = Math.max(camera.position.y, Math.max(gh, level) + 0.3);

  // 被写界深度：注視点に合焦。近いほど浅い（マクロレンズの挙動）
  const focus = camera.position.distanceTo(controls.target);
  const realDt = Math.min((performance.now() - lastReal) / 1000, 1); lastReal = performance.now();
  focusDist = THREE.MathUtils.lerp(focusDist, focus, 1 - Math.exp(-realDt * 6));
  const pr = renderer.getPixelRatio();
  dof.uniforms.uFocus.value = focusDist;
  dof.uniforms.uAperture.value = state.dof ? (36 / focusDist) * (innerHeight * pr / 1080) : 0;
  dof.uniforms.uMaxBlur.value = 10 * (innerHeight * pr / 1080);
  grade.uniforms.uTime.value = state.t % 100;

  // HUD
  countT -= rawDt;
  if (countT <= 0) {
    countT = 0.5;
    const c = eco.counts();
    for (const el of listEl.children) {
      const n = c[el.dataset.key] || 0;
      el.querySelector('.ct').textContent = n;
      el.classList.toggle('none', n === 0);
    }
    const hh = Math.floor(state.hour), mm = Math.floor((state.hour - hh) * 60);
    $('#clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const ph = state.tidePhase;
    const rising = ph < 0.5;
    let label;
    if (ph < 0.06 || ph > 0.94) label = '干潮';
    else if (Math.abs(ph - 0.5) < 0.06) label = '満潮';
    else label = rising ? '上げ潮' : '下げ潮';
    $('#tide-label').textContent = label;
    $('#tide-level').textContent = `潮位 ${((level - TIDE_MID) / TIDE_AMP * 100 + 100).toFixed(0)} cm`;
    drawTide(ph);
  }
  if (toastT > 0) { toastT -= rawDt; if (toastT <= 0) $('#toast').classList.remove('show'); }

  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  sizePasses();
});

// 最初の数フレームで初期状態を安定させる
let focusDist = camera.position.distanceTo(controls.target);
let lastReal = performance.now();
for (let i = 0; i < 90; i++) { world.update(1 / 30, i / 30, tideLevel(state.tidePhase), controls.target, focusDist); eco.update(1 / 30, i / 30, camera.position); }
state.t = 3;
document.body.classList.add('ready');
window.__game = { world, eco, state, camera, controls, select, renderer, THREE };
requestAnimationFrame(frame);
