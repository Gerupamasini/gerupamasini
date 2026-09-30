import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from '../world/Environment.js';
import { Tide } from '../world/Tide.js';
import { Terrain } from '../world/Terrain.js';
import { PreyField } from '../world/PreyField.js';
import { KentishPloverManager } from '../birds/kentishPlover/KentishPloverLOD.js';
import { getGeometries } from '../birds/kentishPlover/KentishPloverModel.js';
import { Player } from './Player.js';

// Tidal-flat demo: free-roaming plovers with the behaviour AI, a player they react to, an animation
// viewer for each of the 12 required motions, and a debug HUD.
// URL options (also used by tools/validate.mjs): ?birds=14&cam=bird&dist=0.6&anim=walk&tide=-0.2&seed=3&t=8

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd0e0);
scene.fog = new THREE.Fog(0xc4d3de, 60, 240);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 600);
const env = new Environment(renderer, scene, { shadowSize: 3, shadowMapSize: 2048 });

// --------------------------------------------------------------- world
const tide = new Tide({ startHour: Number(q.get('hour') ?? 8), timeScale: Number(q.get('timescale') ?? 60), phase: -1.9 });
if (q.has('tide')) tide.override = Number(q.get('tide'));
const terrain = new Terrain({ tide });
scene.add(terrain.mesh, terrain.water);
const prey = new PreyField(terrain, tide);
prey.createVisuals(scene);
const world = { terrain, tide, prey, threats: [], time: 0, context: q.get('context') ?? 'foraging', birds: null, player: null };
const birds = new KentishPloverManager(world, scene);
const player = new Player(world, scene, new THREE.Vector3(0, 0, 0));

// pre-build geometries (one-off cost, shared by every bird)
await new Promise((r) => setTimeout(r, 30));
for (const d of [0, 1, 2]) getGeometries(d);
document.getElementById('loading').remove();

function findShoreZ(x) {
  // z where the ground is ~0.25 m above the current water level (feeding band near the edge)
  for (let z = 80; z > -140; z -= 0.5) if (terrain.heightAt(x, z) < tide.level + 0.25) return z;
  return 0;
}

let seedBase = Number(q.get('seed') ?? 3);
function spawnFlock(n) {
  for (const b of birds.all) scene.remove(b.model.object);
  birds.all.length = 0;
  const cx = Number(q.get('bx') ?? 0);
  const cz = findShoreZ(cx) + 1.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i;
    const r = 1.5 + (i % 5) * 1.4;
    const x = cx + Math.cos(a) * r * 2.2;
    const z = cz + Math.sin(a) * r * 0.8;
    const palette = i % 3 === 1 ? 'femaleBreeding' : 'maleBreeding';
    birds.spawn({ seed: seedBase * 100 + i, palette, position: new THREE.Vector3(x, 0, z), heading: Math.random() * 6.28 });
  }
}
spawnFlock(Number(q.get('birds') ?? 14));
// the observer starts well up-shore of the flock (outside the alert distance)
{
  const cz = findShoreZ(Number(q.get('bx') ?? 0));
  player.pos.set(Number(q.get('px') ?? 6), 0, Number(q.get('pz') ?? cz + 55));
}
let selected = birds.all[0];

// --------------------------------------------------------------- camera
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.12;
controls.maxDistance = 200;
let camMode = q.get('cam') ?? 'bird';
const camDist = Number(q.get('dist') ?? 0.9);
function placeCameraAround(target, dist, yaw = 0.8, pitch = 0.22) {
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  controls.target.copy(target);
}
placeCameraAround(selected.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), camDist, Number(q.get('yaw') ?? 0.9), Number(q.get('pitch') ?? 0.2));
const lastFollow = new THREE.Vector3().copy(selected.pos);

// --------------------------------------------------------------- selection
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (e) => {
  const m = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(m, camera);
  let best = null;
  let bestD = Infinity;
  for (const b of birds.all) {
    const c = b.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
    const d = ray.ray.distanceToPoint(c);
    const along = c.clone().sub(ray.ray.origin).dot(ray.ray.direction);
    const tol = Math.max(0.06, along * 0.015);
    if (d < tol && along < bestD) {
      best = b;
      bestD = along;
    }
  }
  if (best) {
    selected = best;
    lastFollow.copy(best.pos);
    applyAnimSelection();
  }
});

// --------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
$('cam').value = camMode;
$('cam').onchange = (e) => (camMode = e.target.value);
$('timescale').value = tide.timeScale;
$('timescaleV').textContent = tide.timeScale;
$('timescale').oninput = (e) => {
  tide.timeScale = Number(e.target.value);
  $('timescaleV').textContent = e.target.value;
};
$('tide').value = q.get('tide') ?? 'auto';
$('tide').onchange = (e) => (tide.override = e.target.value === 'auto' ? null : Number(e.target.value));
$('respawn').onclick = () => {
  spawnFlock(Number($('count').value));
  selected = birds.all[0];
};
$('count').value = birds.all.length;
let debug = q.get('debug') !== '0';
$('debug').checked = debug;
$('debug').onchange = (e) => (debug = e.target.checked);
const hud = $('hud');
hud.classList.toggle('hidden', !debug);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') {
    debug = !debug;
    $('debug').checked = debug;
  }
});

// Animation viewer: drives the selected bird directly (AI paused) so each motion can be inspected.
let animSel = q.get('anim') ?? '';
$('anim').value = animSel;
$('anim').onchange = (e) => {
  animSel = e.target.value;
  applyAnimSelection();
};
let viewerTimer = 0;
function applyAnimSelection() {
  for (const b of birds.all) b.ai.manual = false;
  if (!animSel) return;
  const b = selected;
  const ai = b.ai;
  const A = b.animator;
  ai.manual = true;
  A.stopAction();
  b.stop();
  b.faceTowards(null);
  viewerTimer = 0;
  const ahead = (d) => b.pos.clone().add(new THREE.Vector3(Math.sin(b.heading) * d, 0, Math.cos(b.heading) * d));
  const [name, variant] = animSel.split(':');
  ai.state = name.toUpperCase();
  switch (name) {
    case 'idle':
      A.setPosture('relaxed');
      A.setGaze('idle');
      break;
    case 'walk':
    case 'run':
      A.setPosture(name === 'run' ? 'run' : 'relaxed');
      A.setGaze('forward');
      break;
    case 'stop':
      break;
    case 'forage':
      A.setPosture('forage');
      A.setGaze('scan');
      break;
    case 'peck':
    case 'peckCrab':
      A.setPosture('forage');
      break;
    case 'alert':
      A.setPosture('alert');
      A.setGaze('fixate', player.pos);
      break;
    case 'restOneLeg':
    case 'restTucked':
    case 'sit':
      A.setPosture(name);
      A.setGaze('idle');
      break;
    case 'fly':
      ai.manual = false;
      ai._takeoff(ahead(22), 'demo');
      animSel = '';
      $('anim').value = '';
      break;
    default:
      A.setPosture('relaxed');
  }
  b._viewer = { name, variant, ahead };
}
function driveViewer(dt) {
  const b = selected;
  if (!b?._viewer || !b.ai.manual) return;
  const { name, variant } = b._viewer;
  const A = b.animator;
  viewerTimer -= dt;
  const aheadOf = (d) => b.pos.clone().add(new THREE.Vector3(Math.sin(b.heading) * d, 0, Math.cos(b.heading) * d));
  if (name === 'walk' || name === 'run') {
    // walk/run a gentle circle
    const tgt = b.pos.clone().add(new THREE.Vector3(Math.sin(b.heading + 0.25), 0, Math.cos(b.heading + 0.25)).multiplyScalar(0.6));
    b.moveTo(tgt, { gait: name, arrive: 0.01 });
  } else if (name === 'stop' && viewerTimer <= 0) {
    // run 1.2 m → abrupt stop → look around (stop/observe) → repeat
    const s = b._viewer.stage ?? 0;
    if (s === 0) {
      A.setPosture('run');
      A.setGaze('forward');
      b.moveTo(aheadOf(1.2), { gait: 'run', speed: 1.5, arrive: 0.02, onArrive: () => {
        A.setPosture('relaxed');
        A.setGaze('idle');
        A.gaze.timer = 0;
        viewerTimer = 1.8;
        b._viewer.stage = 0;
      } });
      b._viewer.stage = 1;
      viewerTimer = 99;
    }
    if (b.speed < 0.01 && b.loco.mode === 'idle' && b._viewer.stage === 1) {
      b._viewer.stage = 0;
      b.heading += 2.2;
    }
  } else if ((name === 'peck' || name === 'peckCrab') && !A.busy && viewerTimer <= 0) {
    A.play('peck', { target: aheadOf(0.055), preyType: name === 'peck' ? 'polychaete' : 'crab' }, (ev) => {
      if (ev === 'done') viewerTimer = 1.2;
    });
  } else if (['preen', 'scratch', 'wingStretch', 'shake', 'footTremble'].includes(name) && !A.busy && viewerTimer <= 0) {
    A.play(name, { variant }, (ev) => {
      if (ev === 'done') viewerTimer = 0.8;
    });
  }
}

// --------------------------------------------------------------- debug overlay
const dbg = new THREE.Group();
scene.add(dbg);
const lineMat = new THREE.LineBasicMaterial({ color: 0xff3366, depthTest: false, transparent: true });
const targetLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
targetLine.renderOrder = 10;
const detRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0x33aaff, transparent: true, opacity: 0.5, depthTest: false, side: THREE.DoubleSide }));
detRing.rotation.x = -Math.PI / 2;
const preyMark = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.018, 24), new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false, side: THREE.DoubleSide }));
preyMark.rotation.x = -Math.PI / 2;
const selMark = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.11, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
selMark.rotation.x = -Math.PI / 2;
dbg.add(targetLine, detRing, preyMark, selMark);

const bar = (v, cls = '') => `<span class="bar ${cls}" style="width:${Math.round(v * 90)}px"></span> ${v.toFixed(2)}`;
function updateHUD(fps) {
  hud.classList.toggle('hidden', !debug);
  dbg.visible = debug;
  if (!debug || !selected) return;
  const b = selected;
  const ai = b.ai;
  const P = ai.perception;
  const D = ai.drives;
  const tgt = ai.target ? `${ai.target.x.toFixed(2)}, ${ai.target.z.toFixed(2)} (${ai.purpose ?? ''})` : '—';
  const prey = P.detectedPrey ? `${P.detectedPrey.type} @ ${Math.hypot(P.detectedPrey.pos.x - b.pos.x, P.detectedPrey.pos.z - b.pos.z).toFixed(2)} m` : '—';
  const hh = tide.hourOfDay;
  hud.innerHTML = [
    `<b>Bird #${b.id}</b> (${b.individual.sex}, ${b.palette})  LOD${b.lod}`,
    `State      ${ai.state}${ai.manual ? ' [viewer]' : ''}`,
    `Activity   ${ai.activity}`,
    `Hunger     ${bar(D.hunger, 'hunger')}`,
    `Fear       ${bar(D.fear, 'fear')}`,
    `Fatigue    ${bar(D.fatigue)}`,
    `Alertness  ${bar(D.alertness)}`,
    `Social     ${bar(D.socialNeed)}`,
    `Preen need ${bar(D.comfort)}`,
    `Target     ${tgt}`,
    `Speed      ${b.speed.toFixed(2)} m/s${b.airborne ? ' (flying, alt ' + (b.pos.y - terrain.heightAt(b.pos.x, b.pos.z)).toFixed(1) + ' m)' : ''}`,
    `Detected   ${prey}`,
    `Prey dist  ${Number.isFinite(P.distanceToPrey) ? P.distanceToPrey.toFixed(2) + ' m' : '—'}`,
    `Player     ${P.distanceToPlayer.toFixed(1)} m  (threat L${P.threatLevel})`,
    `Nearest    ${Number.isFinite(P.distanceToBird) ? P.distanceToBird.toFixed(2) + ' m' : '—'}`,
    `Terrain    ${P.surface?.def.label ?? '—'}  (prey ×${(P.surface?.preyFactor ?? 0).toFixed(2)})`,
    `Water      ${P.distanceToWater.toFixed(1)} m`,
    `Tide       ${tide.state}  ${tide.level.toFixed(2)} m`,
    `Time       ${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}  daylight ${tide.daylight.toFixed(2)}`,
    `Stats      eaten ${ai.stats.eaten} / pecks ${ai.stats.pecks} / flights ${ai.stats.flights}`,
    `Log        ${ai.log.slice(-6).join(' › ')}`,
    ``,
    `FPS ${fps.toFixed(0)}  draws ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`,
    `LODs ${birds.stats.lod.join('/')}  culled ${birds.stats.culled}`,
  ].join('\n');
  // debug geometry
  const y = b.pos.y + 0.004;
  if (ai.target) {
    targetLine.geometry.setFromPoints([new THREE.Vector3(b.pos.x, y, b.pos.z), new THREE.Vector3(ai.target.x, terrain.heightAt(ai.target.x, ai.target.z) + 0.004, ai.target.z)]);
    targetLine.visible = true;
  } else targetLine.visible = false;
  detRing.position.set(b.pos.x, y, b.pos.z);
  detRing.scale.setScalar(2.2);
  selMark.position.set(b.pos.x, y, b.pos.z);
  if (P.detectedPrey) {
    preyMark.position.set(P.detectedPrey.pos.x, P.detectedPrey.pos.y + 0.003, P.detectedPrey.pos.z);
    preyMark.visible = true;
  } else preyMark.visible = false;
}

// --------------------------------------------------------------- loop
const clock = new THREE.Timer();
let fpsAvg = 60;
let frames = 0;
function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  world.time += dt;
  tide.update(dt);
  terrain.update(dt);
  prey.update(dt);
  const camYaw = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) + Math.PI;
  player.update(dt, camYaw);
  driveViewer(dt);
  birds.update(dt, camera);
  prey.updateVisuals(controls.target, 8);
  // camera follow
  if (camMode === 'bird' && selected) {
    const delta = selected.pos.clone().sub(lastFollow);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFollow.copy(selected.pos);
  } else if (camMode === 'player') {
    const delta = player.pos.clone().sub(lastFollow);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFollow.copy(player.pos);
  }
  controls.update();
  env.follow(controls.target);
  // sun follows time of day (lighting only; subtle)
  const d = tide.daylight;
  env.sun.intensity = 0.4 + 3.2 * d;
  env.hemi.intensity = 0.15 + 0.55 * d;
  renderer.render(scene, camera);
  updateHUD(fpsAvg);
  frames++;
  if (frames === Number(q.get('readyAfter') ?? 90)) window.__ready = true;
  $('status').textContent = `Tide ${tide.state} (${tide.level.toFixed(2)} m)   eaten ${prey.eaten}`;
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
applyAnimSelection();
window.demo = { birds, world, camera, controls, player, get selected() { return selected; }, set selected(b) { selected = b; lastFollow.copy(b.pos); } };
frame();
