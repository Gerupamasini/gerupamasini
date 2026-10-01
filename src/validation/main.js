import * as THREE from 'three';
import { KentishPloverModel } from '../birds/kentishPlover/KentishPloverModel.js';
import { Environment } from '../world/Environment.js';

// Validation sheet: orthographic side / front / top silhouettes on a 1 cm grid + perspective close-ups.
// Query: ?palette=maleBreeding&lod=0&pose=stand&action=walk&t=0.25&mode=sheet|silhouette|closeup&gaze=yaw[,pitch]

const q = new URLSearchParams(location.search);
const palette = q.get('palette') || 'maleBreeding';
const lod = Number(q.get('lod') ?? 0);
const mode = q.get('mode') || 'sheet';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// bg=rrggbb: backdrop colour (fringe / halo checks on dark and light backgrounds); ground=0 hides the ground
scene.background = new THREE.Color(mode === 'silhouette' ? 0xffffff : q.has('bg') ? Number('0x' + q.get('bg')) : 0xd9d6cf);
const env = new Environment(renderer, scene, { shadowSize: 0.3, shadowMapSize: 2048 });
env.follow(new THREE.Vector3(0, 0.04, 0));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0xb9ad96, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = q.get('ground') !== '0';
scene.add(ground);

// 1 cm grid (vertical, behind the bird for the side view; horizontal for the top view)
function grid(size, step, color) {
  const pts = [];
  for (let x = -size; x <= size + 1e-9; x += step) pts.push(x, 0, -size, x, 0, size, -size, 0, x, size, 0, x);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }));
}
const gSide = grid(0.12, 0.01, 0x333333);
gSide.rotation.z = Math.PI / 2;
gSide.position.set(-0.05, 0.0, 0);
const gFront = grid(0.12, 0.01, 0x333333);
gFront.rotation.x = Math.PI / 2;
gFront.position.set(0, 0, -0.12);
const gTop = grid(0.12, 0.01, 0x333333);
gTop.position.y = 0.0005;
scene.add(gSide, gFront, gTop);
gSide.layers.set(1);
gFront.layers.set(2);
gTop.layers.set(3);

const bird = new KentishPloverModel({ palette, lods: [lod], individual: { seed: 0.3 } });
scene.add(bird.object);
window.bird = bird;

// wdebug=1: the body coloured by where its skinning sits between trunk (blue) and head (red) along the neck
// sleeve (sleeve helpers green → yellow), with 1 mm rest-space stripes across the sleeve (shows its twist / stretch)
if (q.get('wdebug')) {
  const n = bird.spec.boneNames.filter((b) => b.startsWith('sleeve')).length;
  const at = Object.fromEntries(bird.spec.boneNames.map((b, i) => [i, b === 'head' || b === 'jaw' ? 1 : b.startsWith('sleeve') ? Number(b.slice(6)) / (n + 1) : 0]));
  bird.object.traverse((o) => {
    if (!o.isSkinnedMesh || !/^(body|shell)/.test(o.name)) return;
    const g = o.geometry;
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const R = g.getAttribute('aRest');
    const col = new Float32Array(si.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < si.count; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += sw.getComponent(i, k) * at[si.getComponent(i, k)];
      c.setHSL(0.66 * (1 - s), 0.85, 0.5);
      const stripe = Math.abs(((R.getX(i) + R.getY(i) * 0.3) % 3) + 3) % 3 < 0.6 ? 0.55 : 1;
      col.set([c.r * stripe, c.g * stripe, c.b * stripe], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (o.name.startsWith('shell')) o.visible = false;
  });
}

if (mode === 'silhouette') {
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  bird.object.traverse((o) => {
    if (o.isMesh) o.material = black;
  });
  ground.visible = false;
}

let poser = null;
if (mode === 'glb') {
  // verify the exported asset: load the GLB and pose it with its baked clip
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync('/assets/models/kentish_plover.glb');
  bird.object.visible = false;
  scene.add(gltf.scene);
  gltf.scene.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const clip = gltf.animations.find((c) => c.name === (q.get('clip') || '06_Peck_worm')) ?? gltf.animations[0];
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  mixer.setTime(Number(q.get('t') ?? 0.3) * clip.duration);
  window.__glb = { clips: gltf.animations.map((c) => c.name), clip: clip.name };
}
async function setupPose() {
  const pose = q.get('pose');
  if (!pose || pose === 'bind') return;
  const mod = await import('../birds/kentishPlover/KentishPloverAnimator.js');
  poser = new mod.KentishPloverAnimator(bird, { seed: 3 });
  if (q.has('gaze')) {
    // fixed gaze for photo comparisons: gaze=yaw,pitch (rad; pitch defaults to the resting one), no saccades
    // (gaze=yaw,pitch,roll: a third value tilts the head about the bill axis)
    const [yaw, pitch = mod.GAZE_PITCH_REST, roll = 0] = q.get('gaze').split(',').map(Number);
    Object.assign(poser.gaze, { yaw, tYaw: yaw, pitch, tPitch: pitch, roll, tRoll: roll, timer: 1e9, mode: 'idle' });
  }
  if (q.has('play')) {
    // play=1 (close-ups too): the action played in real time at 60 Hz from the settled forage stance up to t
    const target = new THREE.Vector3(0, 0, Number(q.get('dist') ?? 62) / 1000);
    poser.previewAction('forage', 0);
    poser.setGaze('ground', target);
    for (let i = 0; i < 60; i++) poser.update(1 / 60);
    const variant = q.get('variant') || undefined;
    poser.play(pose, { variant, target, preyType: pose === 'peck' ? variant || 'polychaete' : undefined });
    const end = Number(q.get('t') ?? 0.3) * poser.action.dur;
    for (let c = 0; c < end - 1e-6; c += 1 / 60) poser.update(1 / 60);
    bird.object.position.set(0, bird.object.position.y, 0);
    return;
  }
  poser.previewAction(pose, Number(q.get('t') ?? 0.3), q.get('variant') || undefined);
}

function ortho(w, h, span) {
  const a = w / h;
  return new THREE.OrthographicCamera(-span * a, span * a, span, -span, 0.001, 5);
}

const views = [];
function stripLayout() {
  // contact sheet: N frames of one action (side view, identical scale), row 2 = 3/4 view
  const W = window.innerWidth;
  const H = window.innerHeight;
  const n = Number(q.get('frames') ?? 6);
  const w = Math.floor(W / n);
  const h = Math.floor(H / 2);
  for (let i = 0; i < n; i++) {
    // t0 / t1: a sub-range of the action (e.g. the strike of a peck) spread over the frames
    const t0 = Number(q.get('t0') ?? 0);
    const t1 = Number(q.get('t1') ?? 1);
    const t = t0 + (t1 - t0) * (q.has('cyc') ? i / n : n === 1 ? 0 : i / (n - 1));
    // frames sized for the photo-scale bird (L 142 mm, bill tip z +54 … tail tip −85: centre z −0.015). The
    // ortho width is 2·span·(w/h): with 6 frames per row a span of 0.16 left 150 mm — the walking / pecking bird
    // (bill tip up to z +65) was cut at the frame edge; 0.21 gives ≈200 mm
    const cy = Number(q.get('camY') ?? 0);
    const cz = Number(q.get('camZ') ?? -0.01);
    const side = ortho(w, h, Number(q.get('span') ?? 0.21));
    side.position.set(0.5, 0.06 + cy, cz);
    side.lookAt(0, 0.06 + cy, cz);
    side.layers.enable(1);
    const p = new THREE.PerspectiveCamera(30, w / h, 0.005, 20);
    const pd = Number(q.get('pd') ?? 0.5);
    p.position.set(pd * 0.8, pd * 0.45 + cy, pd * 0.75 + cz);
    p.lookAt(0, 0.05 + cy, cz);
    views.push({ cam: side, rect: [i * w, 0, w, h], label: `t=${t.toFixed(q.has('t0') ? 3 : 2)}`, t });
    views.push({ cam: p, rect: [i * w, h, w, h], label: '', t });
  }
}
function layout() {
  if (mode === 'strip') return stripLayout();
  const W = window.innerWidth;
  const H = window.innerHeight;
  views.length = 0;
  if (mode === 'eye') {
    const c = new THREE.PerspectiveCamera(20, W / H, 0.002, 5);
    c.position.set(0.072, 0.106, 0.0505);
    c.lookAt(0.011, 0.095, 0.0256);
    views.push({ cam: c, rect: [0, 0, W, H], label: 'eye macro' });
    return;
  }
  if (mode === 'closeup' && q.has('cams')) {
    // several free cameras side by side in one page (one model build for a contact sheet):
    // cams=x,y,z,lx,ly,lz;x,y,z,lx,ly,lz;… (metres), common fov
    const list = q.get('cams').split(';').map((c) => c.split(',').map(Number));
    const w = Math.floor(W / list.length);
    list.forEach((c, i) => {
      const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 22), w / H, 0.005, 10);
      cam.position.set(c[0], c[1], c[2]);
      cam.lookAt(c[3], c[4], c[5]);
      views.push({ cam, rect: [i * w, 0, w, H], label: '' });
    });
    return;
  }
  if (mode === 'closeup') {
    // free camera: cam=x,y,z&look=x,y,z (metres) and fov
    const c = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 22), W / H, 0.005, 10);
    const cp = (q.get('cam') ?? '0.16,0.1,0.19').split(',').map(Number);
    const lk = (q.get('look') ?? '0.0,0.07,0.035').split(',').map(Number);
    c.position.set(cp[0], cp[1], cp[2]);
    c.lookAt(lk[0], lk[1], lk[2]);
    views.push({ cam: c, rect: [0, 0, W, H], label: 'head close-up' });
    return;
  }
  const w2 = Math.floor(W / 2);
  const h2 = Math.floor(H / 2);
  const side = ortho(w2, h2, 0.07);
  side.position.set(0.5, 0.05, 0.0);
  side.lookAt(0, 0.05, 0);
  side.layers.enable(1);
  const front = ortho(w2, h2, 0.07);
  front.position.set(0, 0.05, 0.5);
  front.lookAt(0, 0.05, 0);
  front.layers.enable(2);
  const top = ortho(w2, h2, 0.11);
  top.position.set(0, 0.6, 0.0);
  top.up.set(0, 0, 1);
  top.lookAt(0, 0, 0);
  top.layers.enable(3);
  const p = new THREE.PerspectiveCamera(26, w2 / h2, 0.005, 10);
  p.position.set(0.28, 0.14, 0.26);
  p.lookAt(0, 0.05, 0.005);
  views.push({ cam: side, rect: [0, 0, w2, h2], label: 'side (1 cm grid)' });
  views.push({ cam: front, rect: [w2, 0, w2, h2], label: 'front' });
  views.push({ cam: top, rect: [0, h2, w2, h2], label: 'top (1 cm grid)' });
  views.push({ cam: p, rect: [w2, h2, w2, h2], label: '3/4 perspective' });
}

function render() {
  const H = window.innerHeight;
  for (const v of views) {
    const [x, y, w, h] = v.rect;
    renderer.setViewport(x, H - y - h, w, h);
    renderer.setScissor(x, H - y - h, w, h);
    renderer.render(scene, v.cam);
  }
}

layout();
for (const v of views) {
  const d = document.createElement('div');
  d.className = 'lbl';
  d.style.left = `${v.rect[0] + 6}px`;
  d.style.top = `${v.rect[1] + 6}px`;
  d.textContent = v.label;
  document.body.appendChild(d);
}
if (mode !== 'strip') await setupPose();
const hide = (q.get('hide') || '').split(',').filter(Boolean);
// fdebug=1: wing / tail feathers in a flat colour per type (feathers.FEATHER_TYPE)
if (q.get('fdebug')) bird.object.traverse((o) => o.material?.userData?.uniforms?.uDebugType && (o.material.userData.uniforms.uDebugType.value = 1));
bird.object.traverse((o) => {
  if (o.isMesh && hide.some((h) => o.name.startsWith(h))) o.visible = false;
});
bird.object.updateMatrixWorld(true);
if (mode === 'strip') {
  const mod = await import('../birds/kentishPlover/KentishPloverAnimator.js');
  const H = window.innerHeight;
  // play=1: the action PLAYED in real time at 60 Hz from the foraging stance (smoothing, lag and overshoot as in
  // the game); the frames are then times in the action (t × its duration). Otherwise each frame is the action
  // frozen at t with the posture settled on it.
  let live = null;
  if (q.has('play')) {
    live = new mod.KentishPloverAnimator(bird, { seed: 3 });
    const pose = q.get('pose') || 'peck';
    const variant = q.get('variant') || undefined;
    const target = new THREE.Vector3(0, 0, Number(q.get('dist') ?? 62) / 1000);
    live.previewAction('forage', 0);
    live.setGaze('ground', target);
    for (let i = 0; i < 60; i++) live.update(1 / 60);
    live.play(pose, { variant, target, preyType: pose === 'peck' ? variant || 'polychaete' : undefined });
    live.clock = 0;
  }
  for (const v of views) {
    const a = live ?? new mod.KentishPloverAnimator(bird, { seed: 3 });
    if (live) {
      const dur = live.action?.dur ?? live.lastDur;
      live.lastDur = dur;
      while (live.clock < v.t * dur - 1e-6) {
        live.update(1 / 60);
        live.clock += 1 / 60;
      }
    } else a.previewAction(q.get('pose') || 'walk', v.t, q.get('variant') || undefined);
    bird.object.position.set(0, bird.object.position.y, 0);
    bird.object.updateMatrixWorld(true);
    const [x, y, w, h] = v.rect;
    renderer.setViewport(x, H - y - h, w, h);
    renderer.setScissor(x, H - y - h, w, h);
    renderer.render(scene, v.cam);
  }
} else {
  render();
  render();
}
window.__ready = true;
