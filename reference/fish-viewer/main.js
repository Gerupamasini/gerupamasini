// The coastal fishes in four views (side, front, top, ¾) for comparing with photographs:
//   index.html?fish=suzuki&lod=0&jaw=0&t=0   (window.view.set({...}) from the render script)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FISH_SPECS } from '../../src/creatures/fish/species';
import { applyPose, buildFishModel, restPose } from '../../src/creatures/fish/rig';
import { HAKU_UNIFORMS } from '../../src/creatures/species/haku/materials';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Number(new URLSearchParams(location.search).get('dpr') ?? 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a4a50);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(0.35, 1, 0.25);
scene.add(sun, new THREE.HemisphereLight(0xb8d8e0, 0x6a5a40, 0.7));

let model = null;
const state = { fish: 'suzuki', lod: 0, jaw: 0, amp: 0.0, phase: 0, curv: 0, head: 0, photo: 0, mask: '', body: 0, water: 0, oper: 0 };
const params = new URLSearchParams(location.search);
for (const k of Object.keys(state)) if (params.has(k)) state[k] = k === 'fish' ? params.get(k) : Number(params.get(k));

function build() {
  if (model) model.frame.removeFromParent();
  const spec = FISH_SPECS[state.fish];
  model = buildFishModel(spec, [state.lod]);
  model.lod.autoUpdate = false;
  model.lod.levels[0].object.visible = true;
  scene.add(model.frame);
  const p = restPose();
  p.jaw = state.jaw; p.amp = state.amp; p.phase = state.phase; p.curv = state.curv; p.pecL = p.pecR = 0.35; p.oper = state.oper;
  applyPose(model, p, state.lod);
  // the body alone (its silhouette measured against the photographs' bodies)
  if (state.body) model.frame.traverse((o) => { if (o.name === 'Fins') o.visible = false; });
  scene.updateMatrixWorld(true);
}

function views() {
  const T = FISH_SPECS[state.fish].modelTL, flat = FISH_SPECS[state.fish].flat;
  const c = new THREE.Vector3(0, 0, (FISH_SPECS[state.fish].pivot - 0.5) * T);
  const d = T * 1.05;
  if (state.head) {
    // close-ups of the head: side, ¾ front, below-front, and the whole fish at ¾ from behind
    const h = new THREE.Vector3(0, 0, (FISH_SPECS[state.fish].pivot - 0.12) * T);
    const sd = flat ? new THREE.Vector3(0, d, 0.0001) : new THREE.Vector3(d, 0, 0);
    return [
      ['head', h, sd, 0.13 * T],
      ['head34', h, flat ? new THREE.Vector3(d * 0.5, d * 0.7, d * 0.5) : new THREE.Vector3(d * 0.7, d * 0.2, d * 0.7), 0.13 * T],
      ['front', h, flat ? new THREE.Vector3(-d * 0.3, d * 0.3, d) : new THREE.Vector3(d * 0.25, -d * 0.1, d), 0.13 * T],
      ['back34', c, flat ? new THREE.Vector3(-d * 0.4, d * 0.8, -d * 0.4) : new THREE.Vector3(d * 0.6, d * 0.5, -d * 0.6), 0.4 * T],
    ];
  }
  // flatfish: lying on its blind side, "side" is the view from above (the eyed side), "top" the dorsal edge
  const side = flat ? new THREE.Vector3(0, d, 0.0001) : new THREE.Vector3(d, 0, 0);
  const top = flat ? new THREE.Vector3(-d, 0.0001, 0) : new THREE.Vector3(0, d, 0.0001);
  return [
    ['side', c, side, 0.34 * T],
    ['front', new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, d), 0.2 * T],
    ['top', c, top, 0.34 * T],
    ['3/4', c, new THREE.Vector3(d * 0.62, d * 0.42, d * 0.62), 0.34 * T],
  ];
}

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  renderer.setSize(W, H, false);
  scene.background.set(state.photo ? 0x87837b : 0x3a4a50);
  if (state.mask) {
    // a silhouette for measuring against the photographs: the fish over magenta, from the side ('side', head left,
    // back up; a flatfish from above, its eyed side) or from above ('top', head left)
    const spec = FISH_SPECS[state.fish], T = spec.modelTL;
    scene.background.set(0xff00ff);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    const half = 0.32 * T, a = W / H;
    const cam = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 0.001, 10);
    const c = new THREE.Vector3(0, 0, (spec.pivot - 0.5) * T);
    const fromAbove = (state.mask === 'top') !== !!spec.flat;
    if (fromAbove) { cam.position.copy(c).add(new THREE.Vector3(0, T, 0)); cam.up.set(spec.flat ? -1 : 1, 0, 0); if (!spec.flat) cam.up.set(-1, 0, 0); }
    else if (spec.flat) { cam.position.copy(c).add(new THREE.Vector3(-T, 0, 0)); cam.up.set(0, 1, 0); }
    else { cam.position.copy(c).add(new THREE.Vector3(T, 0, 0)); cam.up.set(0, 1, 0); }
    cam.lookAt(c);
    renderer.render(scene, cam);
    return;
  }
  if (state.water) {
    // under water, as in the tank or the shallows: one view, from the side and a little above, close
    const spec = FISH_SPECS[state.fish], T = spec.modelTL;
    scene.background.set(0x2c4a4e);
    HAKU_UNIFORMS.uAir.value = 0;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    const c = new THREE.Vector3(0, 0, (spec.pivot - (state.water === 2 ? 0.16 : 0.5)) * T);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.001, 20);
    const off = state.water === 2 ? new THREE.Vector3(0.55, 0.12, 0.35) : spec.flat ? new THREE.Vector3(0.6, 1.4, 0.5) : new THREE.Vector3(1.9, 0.35, 0.45);
    cam.position.copy(c).addScaledVector(off, T * (state.water === 2 ? 0.75 : 1.0));
    cam.lookAt(c);
    renderer.render(scene, cam);
    return;
  }
  if (state.photo) {
    // the 図鑑's still: ¾ from the front and above, as the other species' stills
    const spec = FISH_SPECS[state.fish], T = spec.modelTL;
    const c = new THREE.Vector3(0, 0, (spec.pivot - 0.5) * T);
    const off = spec.flat ? new THREE.Vector3(-0.35, 1, 0.55) : new THREE.Vector3(1, 0.55, 0.75);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    const half = 0.42 * T, a = W / H;
    const cam = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 0.001, 10);
    cam.position.copy(c).addScaledVector(off.normalize(), T);
    cam.lookAt(c);
    renderer.render(scene, cam);
    return;
  }
  renderer.setScissorTest(true);
  const vs = views();
  vs.forEach(([, target, off, half], i) => {
    const x = (i % 2) * W / 2, y = (1 - Math.floor(i / 2)) * H / 2;
    renderer.setViewport(x, y, W / 2, H / 2);
    renderer.setScissor(x, y, W / 2, H / 2);
    const a = (W / 2) / (H / 2);
    const cam = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 0.001, 10);
    cam.position.copy(target).add(off);
    if (Math.abs(off.y) > 0.9 * off.length()) cam.up.set(0, 0, -1); else cam.up.set(0, 1, 0);
    if (off.x < -0.5 * off.length()) cam.up.set(0, 1, 0);
    cam.lookAt(target);
    renderer.render(scene, cam);
  });
}

window.view = { set(s) { Object.assign(state, s); build(); draw(); return true; }, ready: true };
build();
draw();
addEventListener('resize', draw);
