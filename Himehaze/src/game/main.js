// Game demo: several ヒメハゼ on a Tokyo Bay sand flat, each driven by HimehazeEcology (utility AI over
// drives + perception) on top of the shared Behavior controller. The camera is the "player": a fast
// approach (looming) frightens the fish, a slow one is tolerated until ~10 cm.
//
//   game.html?fish=6&seed=3&preset=turbidFlat&hour=17&lod=1
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HimehazeWorld, LIGHT_PRESETS } from './World.js';
import { HimehazeActor, loadHimehazeTemplate } from './HimehazeActor.js';
import { HimehazeEcology } from './Ecology.js';
import { mulberry32 } from '../fish/Behavior.js';

const params = new URLSearchParams(location.search);
const N_FISH = Math.max(1, Math.min(24, Number(params.get('fish')) || 6));
const SEED = Number(params.get('seed')) || 1;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Number(params.get('dpr')) || 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.003, 8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.04; controls.maxDistance = 1.6;
controls.maxPolarAngle = Math.PI * 0.49;

const world = new HimehazeWorld(scene, renderer, { seed: SEED });
if (params.get('preset') && LIGHT_PRESETS[params.get('preset')]) world.setPreset(params.get('preset'));
if (params.get('hour')) world.timeOfDay = Number(params.get('hour'));

// the player (camera): position + velocity relative to the followed frame, read by HimehazeEcology.perceive()
const player = { position: camera.position, velocity: new THREE.Vector3() };
world.player = player;

const ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);
const probe = new THREE.Vector3();
/** terrain query for Behavior: raycast the collision tile under (x, z) → { y, normal } */
function ground(x, z) {
  probe.set(x, world.heightAt(x, z), z);
  const hit = world.raycastGround(ray, probe);
  return hit ? { y: hit.point.y, normal: hit.normal } : { y: probe.y, normal: UP };
}

const fishes = [];
const ui = { list: document.getElementById('fish-list'), status: document.getElementById('status') };
let follow = 0;

async function spawn() {
  const base = new URL('../../models/', import.meta.url);
  const [female, male] = await Promise.all([
    loadHimehazeTemplate(new URL('himehaze.glb', base).href),
    loadHimehazeTemplate(new URL('himehaze_male.glb', base).href).catch(() => null),
  ]);
  const r = mulberry32(SEED * 101);
  const nest = world.nestSite;
  for (let i = 0; i < N_FISH; i++) {
    // fish 0: nest-holding breeding male; fish 1: a second (wandering) male; others female / non-breeding
    const isMale = (i === 0 || i === 1) && male;
    const seed = SEED * 1000 + i + 1;
    const ecoRef = { eco: null };
    const actor = new HimehazeActor(isMale ? male : female, {
      seed, ground, heightAt: (x, z) => world.heightAt(x, z),
      onEvent: (type, pos, a) => {
        ecoRef.eco?.onEvent(type);
        const k = { takeoff: 0.6, land: 0.35, bury: 0.8, unbury: 0.5, strike: 0.15 }[type];
        if (k) world.sand(pos, k * a.variation.scale, a.heading);
      },
    });
    // spread out: ≥ 9 cm from each other at the start [G]
    let x, z;
    for (let k = 0; k < 50; k++) {
      if (i === 0) { x = nest.position.x + 0.03; z = nest.position.z + 0.01; break; }
      const a = r() * Math.PI * 2, d = 0.12 + 0.35 * r(); x = Math.cos(a) * d; z = Math.sin(a) * d;
      if (fishes.every((e) => Math.hypot(e.pos.x - x, e.pos.z - z) > 0.09)) break;
    }
    actor.place(x, z, r() * Math.PI * 2);
    scene.add(actor.root);
    const eco = new HimehazeEcology(actor, world, {
      male: !!isMale, breeding: i === 0, nest: i === 0 ? nest : null,
      home: new THREE.Vector3(x, 0, z),
    });
    ecoRef.eco = eco;
    fishes.push(eco);
  }
  world.fishes = fishes;
  buildList();
  frameFish(0, true);
  document.getElementById('progress').hidden = true;
}

// ------------------------------------------------------------------ LOD by screen size (see HimehazeActor.setLOD)
const LOD_PX = [140, 45, 12]; // projected TL in pixels above which LOD0 / 1 / 2 are used; below → LOD3
function updateLOD() {
  const h = renderer.domElement.height, f = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  for (const e of fishes) {
    const d = camera.position.distanceTo(e.pos);
    const px = (e.actor.TL * f) / Math.max(d, 1e-3);
    const forced = window.__game?.lodOverride ?? (params.has('lod') ? Number(params.get('lod')) : null);
    const lod = forced ?? (px > LOD_PX[0] ? 0 : px > LOD_PX[1] ? 1 : px > LOD_PX[2] ? 2 : 3);
    e.actor.setLOD(lod);
  }
}

// ------------------------------------------------------------------ camera follow (orbit offset kept)
const lastTarget = new THREE.Vector3();
const prevCam = new THREE.Vector3();
function frameFish(i, snap = false) {
  follow = i;
  const p = fishes[i].pos;
  controls.target.set(p.x, p.y + 0.008, p.z);
  if (snap) camera.position.set(p.x + 0.16, p.y + 0.09, p.z + 0.16);
  lastTarget.copy(controls.target);
  prevCam.copy(camera.position);
  buildList();
}
const followDelta = new THREE.Vector3();
function updateFollow(dt) {
  followDelta.set(0, 0, 0);
  if (!document.getElementById('follow').checked || !fishes[follow]) return;
  const p = fishes[follow].pos;
  const goal = new THREE.Vector3(p.x, p.y + 0.008, p.z);
  const k = 1 - Math.exp(-2.5 * dt);
  const next = lastTarget.clone().lerp(goal, k);
  followDelta.subVectors(next, lastTarget);
  controls.target.add(followDelta);
  camera.position.add(followDelta);
  lastTarget.copy(next);
}

// ------------------------------------------------------------------ UI
function buildList() {
  ui.list.innerHTML = '';
  fishes.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = i === follow ? 'on' : '';
    li.innerHTML = `<b>${e.male ? '♂' : '♀'}${i + 1}</b> <span class="st"></span>`;
    li.onclick = () => frameFish(i);
    ui.list.appendChild(li);
  });
}
const STATE_JA = {
  IDLE: '静止', SCAN: '見回す', CRAWL: '這う・跳ねる', SHORT_SWIM: '短い遊泳', FREEZE: '警戒・停止', ESCAPE: '逃避',
  BURY: '砂に潜る', FORAGE: '採餌', REST: '休息', COURTSHIP: '求愛・巣の手入れ', TERRITORIAL: 'なわばり誇示',
};
function updateList() {
  const items = ui.list.children;
  fishes.forEach((e, i) => {
    const sub = e.state === 'FORAGE' && e.sub.step ? `:${e.sub.step}` : '';
    items[i].querySelector('.st').textContent =
      `${STATE_JA[e.state] || e.state}${sub}  空腹${bar(e.hunger)} 恐怖${bar(e.fear)} 体力${bar(e.energy)}  LOD${e.actor.lod}`;
  });
  const P = fishes[follow]?.P;
  if (P) ui.status.textContent = `カメラ→魚 ${(P.distanceToPlayer * 100).toFixed(1)} cm ／ 接近速度 ${(player.velocity.dot(fishes[follow].pos.clone().sub(camera.position).normalize()) * 100).toFixed(1)} cm/s ／ ${world.timeOfDay.toFixed(1)} 時`;
}
const bar = (v) => '▁▂▃▄▅▆▇█'[Math.max(0, Math.min(7, Math.round(v * 7)))];

document.getElementById('predator').onclick = () => world.predatorPass(fishes[follow].pos);
document.getElementById('feed').onclick = () => {
  const p = fishes[follow].pos, r = world.rng;
  for (let i = 0; i < 8; i++) {
    const f = world._addPrey(['amphipod', 'copepod', 'polychaete'][i % 3]);
    const a = r() * Math.PI * 2, d = 0.03 + 0.06 * r();
    f.home.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
    f.position.set(f.home.x, world.heightAt(f.home.x, f.home.z) + 0.001, f.home.z);
  }
};
document.getElementById('lunge').onclick = () => {
  // a sudden approach: the camera dives toward the followed fish (looming stimulus)
  const p = fishes[follow].pos, from = camera.position.clone();
  const to = p.clone().add(from.clone().sub(p).setLength(0.05));
  let t = 0;
  const step = () => { t += 1 / 20; camera.position.lerpVectors(from, to, Math.min(1, t)); if (t < 1) requestAnimationFrame(step); };
  step();
};
for (const b of document.querySelectorAll('#preset button')) {
  b.onclick = () => { world.setPreset(b.dataset.v); for (const o of document.querySelectorAll('#preset button')) o.classList.toggle('on', o === b); };
  b.classList.toggle('on', b.dataset.v === world.preset);
}
const hour = document.getElementById('hour');
hour.value = world.timeOfDay;
hour.oninput = () => { world.timeOfDay = Number(hour.value); };
document.getElementById('toggle-panel').onclick = () => document.body.classList.toggle('panel-hidden');

// ------------------------------------------------------------------ loop
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
let t = 0, frame = 0;
function simulate(dt) {
  t += dt;
  world.update(dt, t);
  for (const e of fishes) {
    e.update(dt);
    world.clampToArena(e.B.state.pos);
  }
  HimehazeActor.separate(fishes.map((e) => e.actor));
}
function tick(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  frame++;
  updateFollow(dt);
  controls.update();
  // player velocity relative to the followed frame (following a fish is not an approach)
  if (dt > 0) player.velocity.subVectors(camera.position, prevCam).sub(followDelta).divideScalar(dt);
  prevCam.copy(camera.position);
  simulate(dt);
  if (fishes[follow]) world.focus(fishes[follow].pos);
  if (frame % 6 === 0) { updateLOD(); if (fishes.length) updateList(); }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

spawn().catch((err) => {
  console.error(err);
  const p = document.getElementById('progress');
  p.classList.add('error');
  p.querySelector('.msg').textContent = `読み込みに失敗しました: ${err.message}`;
});
requestAnimationFrame(tick);

// test hooks (headless verification)
// step(seconds): advance the simulation at a fixed 60 Hz without rendering (slow software GL in CI)
window.__game = {
  world, fishes, camera, controls, frameFish, player,
  step(seconds, hz = 60) { for (let i = 0; i < Math.round(seconds * hz); i++) simulate(1 / hz); updateLOD(); updateList(); },
  setPlayerVelocity(v) { player.velocity.set(v[0], v[1], v[2]); },
};
