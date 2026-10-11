import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// イソスジエビ viewer: the シラタエビ viewer (claude/epic-noether-hzhjhj) with the game's shared shrimp model,
// switched to the イソスジエビ species profile, in a rocky tide pool with an eelgrass meadow.
import { World } from './World.js';
import { Shrimp } from '../../src/creatures/species/shrimp/model/Shrimp.js';
import { ISOSUJI } from '../../src/creatures/species/shrimp/model/isosuji.js';
import { IsosujiBrain } from '../../src/creatures/species/shrimp/model/IsosujiBrain.js';
import { TL as MODEL_TL } from '../../src/creatures/species/shrimp/model/morphology.js';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const waterDay = new THREE.Color(0x4a7a74); // clear, green-blue water of a rock pool
const waterNight = new THREE.Color(0x0a1820);
scene.background = waterDay.clone();
scene.fog = new THREE.FogExp2(waterDay.clone(), 2.6);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.002, 5);
camera.position.set(0.09, 0.06, 0.12);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.01, 0);
controls.enableDamping = true;
controls.minDistance = 0.03;
controls.maxDistance = 0.8;

const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(0.1, 0.5, 0.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.35, right: 0.35, top: 0.35, bottom: -0.35, near: 0.1, far: 1.2 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.0005;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x9fd0d0, 0x4a3f30, 0.9);
scene.add(hemi);
const rim = new THREE.DirectionalLight(0xbfe4ff, 0.8); // backlight reveals the translucency
rim.position.set(-0.3, 0.15, -0.3);
scene.add(rim);

const world = new World(scene);

// ---------------------------------------------------------------- macro-photography post stack
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Shallow depth of field like a macro lens (focus tracks the selected animal).
const bokeh = new BokehPass(scene, camera, { focus: 0.1, aperture: 0.004, maxblur: 0.006 });
composer.addPass(bokeh);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.6, 0.85));
const lens = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c = vUv-0.5; float r2 = dot(c,c);
      // Lateral chromatic aberration grows toward the frame edge.
      vec2 off = c*r2*0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
      col *= 1.0 - r2*0.9;                                   // vignette
      col += (h(vUv*1000.0+uTime)-0.5)*0.025;                // sensor grain
      gl_FragColor = vec4(col,1.0);
    }`,
});
composer.addPass(lens);
composer.addPass(new OutputPass());

// Individuals (total length mm): berried female (Apr-Sep), females larger than males; one starts in the アマモ場.
const specs = [
  { sex: 'female', berried: true, tl: 50, name: '♀ 抱卵', position: new THREE.Vector3(0.05, 0, 0.05) },
  { sex: 'female', tl: 47, name: '♀', position: new THREE.Vector3(-0.08, 0, 0.05) },
  { sex: 'male', tl: 40, name: '♂ A', position: new THREE.Vector3(-0.15, 0, -0.04) },
  { sex: 'male', tl: 38, name: '♂ アマモ', position: new THREE.Vector3(0.18, 0, 0.1) },
  { sex: 'female', tl: 44, name: '♀ アマモ', position: new THREE.Vector3(0.22, 0, 0.04) },
];
// ?species=shirata shows the unchanged シラタエビ (the base of this model) for comparison
const asShirata = params.get('species') === 'shirata';
for (const s of specs) {
  const sh = asShirata
    ? new Shrimp(world, { ...s, scale: (s.tl * 1.25) / 1000 / MODEL_TL })
    : new Shrimp(world, { ...s, species: ISOSUJI, Brain: IsosujiBrain, scale: s.tl / 1000 / MODEL_TL });
  world.shrimps.push(sh);
}
let selected = world.shrimps[0];

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const ui = {
  time: $('time'),
  flow: $('flow'),
  flowDir: $('flowDir'),
  tool: () => document.querySelector('input[name=tool]:checked').value,
  follow: $('follow'),
  slow: $('slow'),
  force: $('force'),
};
ui.force.onchange = () => {
  // force a state on the selected animal (for checking each behaviour)
  const b = selected.brain;
  const v = ui.force.value;
  ui.force.value = '';
  if (!v) return;
  if (v === 'ESCAPE_BACKWARD') {
    const back = new THREE.Vector3(Math.cos(selected.yaw), 0, -Math.sin(selected.yaw)).multiplyScalar(0.02).add(selected.position);
    b.stimulus(back, 1.5);
    return;
  }
  if (v !== 'CLING') b.cling = null;
  b.setBehavior(v, 20);
};
const sel = $('select');
world.shrimps.forEach((s, i) => sel.add(new Option(s.name, i)));
sel.onchange = () => (selected = world.shrimps[+sel.value]);

$('shadowBtn').onclick = () => {
  // Predator shadow passes overhead: a looming visual stimulus for everyone.
  const p = new THREE.Vector3(selected.position.x, 0.2, selected.position.z);
  world.stimulus(p, 0.45);
};

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // was a drag
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const tool = ui.tool();
  if (tool === 'select') {
    let best = null;
    let bd = 0.02;
    for (const s of world.shrimps) {
      const d = ray.ray.distanceToPoint(s.position);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) {
      selected = best;
      sel.value = world.shrimps.indexOf(best);
    }
    return;
  }
  const hit = ray.intersectObjects([world.terrain, ...world.walkables], false)[0];
  if (!hit) return;
  if (tool === 'food') world.addFood(hit.point);
  else if (tool === 'tap') world.stimulus(hit.point.clone().add(new THREE.Vector3(0, 0.01, 0)), 0.6);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

function applyEnvironment() {
  const day = +ui.time.value; // 0 night .. 1 day
  world.daylight = day;
  const c = waterNight.clone().lerp(waterDay, day);
  scene.background.copy(c);
  scene.fog.color.copy(c);
  sun.intensity = 0.15 + 2.5 * day;
  sun.color.setHSL(0.1, 0.4, 0.55 + 0.4 * day);
  hemi.intensity = 0.25 + 0.65 * day;
  rim.intensity = 0.5 + 0.3 * day;
  world.uniforms.uCaustic.value = 1.4 * day;
  const f = +ui.flow.value;
  const a = (+ui.flowDir.value * Math.PI) / 180;
  world.flowBase.set(Math.cos(a) * f, 0, Math.sin(a) * f);
}

// ---------------------------------------------------------------- HUD
const hud = $('hud');
function drawHud() {
  const b = selected.brain;
  const bars = (o) =>
    Object.entries(o)
      .map(([k, v]) => `<div class="row"><span>${k}</span><i style="width:${Math.max(0, Math.min(1, v)) * 100}%"></i><em>${v.toFixed(2)}</em></div>`)
      .join('');
  const scores = Object.fromEntries(Object.entries(b.scores).sort((a, b) => b[1] - a[1]).slice(0, 6));
  hud.innerHTML = `<b>${selected.name}</b> — <span class="beh">${b.behavior}</span> · ${selected.mode}${selected.flip ? ' · TAIL-FLIP #' + (selected.flip.i + 1) : ''}
  <div class="grp">internal state</div>${bars({ hunger: b.s.hunger, fear: b.s.fear, curiosity: b.s.curiosity, fatigue: b.s.fatigue, groomNeed: b.s.dirt, shelterPref: b.s.shelterPreference, flowPref: b.s.flowPreference, activity: b.s.activityLevel })}
  <div class="grp">utility (last decision)</div>${bars(scores)}
  <div class="grp">speed ${(selected.speed * 100).toFixed(1)} cm/s · ${(selected.speed / (MODEL_TL * selected.scale)).toFixed(2)} BL/s · TL ${(MODEL_TL * selected.scale * 1000).toFixed(0)} mm</div>`;
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let hudT = 0;
const camOffset = new THREE.Vector3();
function frame() {
  const raw = Math.min(clock.getDelta(), 1 / 20);
  const dt = ui.slow.checked ? raw * 0.1 : raw;
  applyEnvironment();
  // Fixed substeps keep the tail-flip (25 ms flexion) resolvable.
  const steps = Math.ceil(dt / (1 / 240));
  for (let i = 0; i < steps; i++) world.update(dt / steps);
  if (ui.follow.checked) {
    camOffset.subVectors(camera.position, controls.target);
    controls.target.lerp(selected.position, 0.08);
    camera.position.copy(controls.target).add(camOffset);
  }
  controls.update();
  bokeh.uniforms.focus.value = THREE.MathUtils.lerp(bokeh.uniforms.focus.value, camera.position.distanceTo(selected.position), 0.5);
  lens.uniforms.uTime.value = (lens.uniforms.uTime.value + 0.37) % 100;
  composer.render();
  hudT -= raw;
  if (hudT <= 0) {
    drawHud();
    hudT = 0.15;
  }
  requestAnimationFrame(frame);
}
frame();
window.__app = { world, scene, camera, renderer, controls, composer, THREE, select: (i) => (selected = world.shrimps[i]) };
if (capture) document.body.classList.add('capture');
