import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Himehaze, LOD_LEVELS } from '../Himehaze.js';
import { HimehazeBehavior } from '../HimehazeBehavior.js';
import { HimehazeWorld, patchCaustics } from './HimehazeWorld.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: q.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.004, 30);
camera.position.set(0.12, 0.08, 0.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.03; controls.maxDistance = 3;

const world = new HimehazeWorld(scene, renderer, { seed: 11 });
if (q.get('preset')) world.setPreset(q.get('preset'));
if (q.has('studio')) { world.ground.visible = false; scene.fog = null; scene.background = new THREE.Color(0x8a9a98); }

// Population: one nest-holding breeding male (hero), one female nearby, others in the home range.
const specs = [
  { seed: 3, sex: 'male', breeding: true, pos: [0.06, -0.08], nest: true },
  { seed: 8, sex: 'female', pos: [0.2, 0.05] },
  { seed: 21, sex: 'male', pos: [-0.3, 0.2] },
  { seed: 34, sex: 'female', pos: [-0.2, -0.3], TL: 0.055 },
  { seed: 55, sex: 'female', pos: [0.35, -0.35], TL: 0.045 },
  { seed: 89, sex: 'male', pos: [-0.45, -0.05] },
].slice(0, Number(q.get('n') ?? 6));
const behaviors = [];
for (const s of specs) {
  const f = new Himehaze({ seed: s.seed, sex: s.sex, breeding: s.breeding, TL: s.TL, quality: s === specs[0] ? 'high' : 'medium' });
  f.position.set(s.pos[0], 0, s.pos[1]);
  patchCaustics(f.materials.body, world.uniforms);   // body receives the same caustic pattern as the sand
  scene.add(f);
  const b = new HimehazeBehavior(f, world, { nest: s.nest ? world.nestSite : null, home: s.nest ? world.nestSite.position : undefined, heading: s.heading });
  behaviors.push(b);
}
world.fishes = behaviors;
const hero = behaviors[0];

// player = camera; velocity estimated for looming response
const player = { position: camera.position, velocity: new THREE.Vector3() };
const lastCam = camera.position.clone();
world.player = player;

// ---- UI
const hud = document.getElementById('hud');
const labels = document.getElementById('labels');
let follow = !q.has('free'), paused = q.has('pause'), showLabels = true;
const ui = {
  preset: (n) => world.setPreset(n),
  predator: () => world.predatorPass(hero.pos),
  food: () => { for (let i = 0; i < 8; i++) { const f = world._addPrey(); const a = Math.random() * 6.28, d = 0.03 + Math.random() * 0.1; f.position.set(hero.pos.x + Math.cos(a) * d, f.position.y, hero.pos.z + Math.sin(a) * d); f.position.y = world.heightAt(f.position.x, f.position.z) + (f.type === 'copepod' ? 0.01 : 0.001); } },
  lod: (i) => behaviors.forEach((b) => (b.fish.forcedLOD = i === 'auto' ? null : Number(i))),
  follow: () => (follow = !follow),
  labels: () => { showLabels = !showLabels; labels.style.display = showLabels ? '' : 'none'; },
  pause: () => (paused = !paused),
  time: (v) => (world.timeOfDay = Number(v)),
  tide: (v) => (world.tide = Number(v)),
};
window.himehaze = { world, behaviors, ui, camera, controls, renderer, scene };
document.querySelectorAll('[data-act]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'range' ? 'input' : 'click', () => ui[el.dataset.act](el.value ?? el.dataset.arg ?? el.dataset.val)));
document.querySelectorAll('[data-preset]').forEach((el) => el.addEventListener('click', () => ui.preset(el.dataset.preset)));
addEventListener('keydown', (e) => { if (e.key === 'p') ui.predator(); if (e.key === 'f') ui.food(); if (e.key === ' ') ui.pause(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---- fixed views for verification screenshots (?view=side|top|front|back34|front34|below&shot=1)
function applyView(name) {
  const f = hero.fish; f.updateMatrixWorld(true);
  const c = f.localToWorld(new THREE.Vector3(0, 0.004, 0));
  const TL = f.TL, d = TL * 1.6;
  const off = {
    side: [0, 0.2 * TL, d * 1.1], top: [0.0001, d * 1.3, 0.0], front: [d, 0.12 * TL, 0.0001],
    front34: [d * 0.7, d * 0.35, d * 0.7], back34: [-d * 0.8, d * 0.45, d * 0.6], head: [TL * 0.9, TL * 0.35, TL * 0.55],
    eye: [TL * 0.35, TL * 0.35, TL * 0.35],
  }[name];
  if (!off) return;
  const o = new THREE.Vector3(...off).applyQuaternion(f.quaternion);
  camera.position.copy(c).add(o);
  const tgt = name === 'head' || name === 'eye' ? f.localToWorld(new THREE.Vector3(0.2 * TL, 0.03 * TL, 0)) : c;
  controls.target.copy(tgt); camera.lookAt(tgt);
}

const clock = new THREE.Clock();
let t = 0, frames = 0, fpsT = 0, fps = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!paused) {
    t += dt;
    world.timeOfDay; // time is user-controlled via slider
    for (const b of behaviors) b.update(dt);
    world.update(dt, t);
  } else {
    // paused = pose freeze but keep breathing/eyes alive for observation
    for (const b of behaviors) b.fish.animator.update(dt, { ...b.cmd, gait: 'idle', turn: 0 });
  }
  player.velocity.copy(camera.position).sub(lastCam).divideScalar(Math.max(dt, 1e-3)); lastCam.copy(camera.position);
  if (q.has('view') && q.has('anim')) applyView(q.get('view'));
  else if (follow && !q.has('view')) {
    const p = hero.fish.position;
    controls.target.lerp(p, 1 - Math.exp(-3 * dt));
  }
  controls.update();
  world.focus(controls.target);
  for (const b of behaviors) b.fish.updateLOD(camera);
  renderer.render(scene, camera);

  frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  const info = renderer.info.render;
  hud.textContent = `${fps.toFixed(0)} fps | draw ${info.calls} | tris ${(info.triangles / 1000).toFixed(0)}k | ${world.preset} | hero: ${hero.debug} | LOD ${LOD_LEVELS[hero.fish.currentLOD].name}`;
  if (showLabels) {
    labels.innerHTML = behaviors.map((b) => {
      const p = b.fish.position.clone().add(new THREE.Vector3(0, 0.015, 0)).project(camera);
      if (p.z > 1) return '';
      return `<div class="lbl" style="left:${(p.x * 0.5 + 0.5) * innerWidth}px;top:${(-p.y * 0.5 + 0.5) * innerHeight}px">${b.fish.variation.male ? '♂' : '♀'} ${b.state}</div>`;
    }).join('');
  }
  requestAnimationFrame(frame);
}
if (q.has('view')) {
  // settle one frame so ground alignment is applied, then fix camera
  for (const b of behaviors) b.update(1 / 60);
  paused = !q.has('anim'); showLabels = false; labels.style.display = 'none';
  if (q.has('lod')) ui.lod(q.get('lod')); else ui.lod(0);
  applyView(q.get('view'));
}
if (q.has('state')) hero._enter(q.get('state'));
frame();
window.__ready = true;
