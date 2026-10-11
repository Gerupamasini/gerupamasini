// アカエイ viewer: one ray over shallow sand under water, driven by the game's own driver (the same behaviours as in
// the field). ?capture hides the panel and exposes window.__akaei for scripted renders (tools/models/akaei/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AkaeiDriver, type AkaeiState } from '../../src/creatures/species/akaei/AkaeiDriver';
import { AkaeiModel, AkaeiPose, BELLY } from '../../src/creatures/species/akaei/AkaeiModel';
import { akaeiGeometries, triangleCount, type Lod } from '../../src/creatures/species/akaei/geometry';
import type { Individual } from '../../src/creatures/Individual';
import type { DriverContext, Intent } from '../../src/creatures/drivers/Driver';
import { Rng } from '../../src/core/Rng';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
// shallow, slightly turbid bay water: the colour the game's water pass absorbs toward (uWaterFog)
const waterCol = new THREE.Color(0.36, 0.4, 0.36);
const airCol = new THREE.Color(0xb9c6cc);
scene.background = waterCol.clone();
scene.fog = new THREE.FogExp2(waterCol.clone(), 0.32);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const hemi = new THREE.HemisphereLight(0xc4d6d6, 0x4a463c, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 60);
camera.position.set(0.6, 0.5, 0.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.05, 0);
controls.enableDamping = true;

// ------------------------------------------------------------------ the sand: grey wet sand with ripple marks
const WATER = 0.45;
function sandHeight(x: number, z: number): number {
  const warp = 0.05 * Math.sin(x * 1.3 + z * 0.7);
  const ripple = 0.006 * Math.sin((x * 0.9 + z * 0.43) * 62 + warp * 30) * (0.6 + 0.4 * Math.sin(x * 0.8 - z * 1.1));
  return ripple + 0.02 * Math.sin(x * 0.6) * Math.cos(z * 0.5);
}
const SIZE = 10, SEG = 360;
const sandGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
sandGeo.rotateX(-Math.PI / 2);
{
  const p = sandGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, sandHeight(p.getX(i), p.getZ(i)));
  sandGeo.computeVertexNormals();
}
function sandTexture(): THREE.DataTexture {
  const N = 512, d = new Uint8Array(N * N * 4), r = new Rng(9);
  for (let i = 0; i < N * N; i++) {
    const g = 0.86 + 0.24 * r.next() + (r.next() < 0.02 ? 0.35 : 0) - (r.next() < 0.03 ? 0.3 : 0);
    const c = [0.53 * g, 0.525 * g, 0.51 * g];
    d[i * 4] = Math.min(255, c[0] * 255); d[i * 4 + 1] = Math.min(255, c[1] * 255); d[i * 4 + 2] = Math.min(255, c[2] * 255); d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(SIZE * 3, SIZE * 3);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.92, metalness: 0 }));
sand.receiveShadow = true;
scene.add(sand);
// the surface seen from below (only when the camera looks up at it)
const surface = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ color: 0x9fb3ad, side: THREE.BackSide, transparent: true, opacity: 0.55, fog: true }));
surface.rotateX(-Math.PI / 2);
surface.position.y = WATER;
scene.add(surface);

const world = new THREE.Group();
scene.add(world);

// ------------------------------------------------------------------ one ray, driven like in the field
const floor = { heightAt: sandHeight, waterAt: () => WATER, sampleAt: () => ({ substrate: 'sand' }) as never };
const state = { seed: Number(params.get('seed') ?? 5), length: Number(params.get('length') ?? 820), lod: 0 as Lod, behaviour: (params.get('b') ?? 'BOTTOM_REST') as AkaeiState, animate: true };
let driver: AkaeiDriver | null = null;
let holder: THREE.Object3D | null = null;
let ind: Individual | null = null;
let specimen: AkaeiModel | null = null;

function makeIndividual(seed: number, length: number): Individual {
  const rng = new Rng(seed * 7919 + 1);
  return {
    id: `hemitrygon_akajei#viewer${seed}`, species: {} as never, pos: new THREE.Vector3(0, sandHeight(0, 0), 0), home: new THREE.Vector3(), heading: 0,
    length_mm: length, weight_g: 0, sex: 'f', stage: 'adult', traits: [], lengthPct: 50, wariness: 1, alert: 0, energy: 0.5, lod: 0,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' }, rng, cell: 0, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
}

function ctx(): DriverContext {
  return { floor, player: lockedFar ? new THREE.Vector3(30, 0, 30) : camera.position, simScale: 1, nowMs: 0, locked: !lockedFar };
}
let lockedFar = false;

let intentId = 1;
function intentFor(b: AkaeiState): Intent {
  const d = ind!;
  const ahead = (m: number, a = 0) => new THREE.Vector3(d.pos.x + Math.sin(d.heading + a) * m, 0, d.pos.z + Math.cos(d.heading + a) * m);
  switch (b) {
    case 'GLIDE_SWIM': return { id: intentId++, kind: 'wander', target: ahead(3.5, 0.5), urgency: 0.5, seconds: 20 };
    case 'BURROW_IN_SAND': return { id: intentId++, kind: 'burrow', urgency: 0.5, seconds: 40 };
    case 'FORAGE': return { id: intentId++, kind: 'forage', urgency: 0.5, seconds: 30 };
    case 'ESCAPE': return { id: intentId++, kind: 'flee', target: ahead(4, 2.6), from: ahead(-1), urgency: 1, seconds: 4 };
    default: return { id: intentId++, kind: 'rest', urgency: 0.5, seconds: 30 };
  }
}

function clear(): void {
  driver?.dispose();
  holder?.removeFromParent();
  specimen?.dispose();
  driver = null; holder = null; specimen = null;
}

/** a fresh ray at rest on the sand, then the behaviour, simulated for `t` seconds */
function build(b: AkaeiState, t: number, start: 'rest' | 'buried' | 'swim' = 'rest'): void {
  clear();
  ind = makeIndividual(state.seed, state.length);
  holder = AkaeiDriver.makeModel().root;
  world.add(holder);
  driver = new AkaeiDriver();
  driver.lod = state.lod;
  driver.forceLod = state.lod;
  driver.initial = start === 'buried' ? 'buried' : 'rest';
  driver.attach(holder, ind);
  const c = ctx();
  for (let i = 0; i < 10; i++) driver.update(1 / 60, c);
  if (start === 'swim') { driver.setIntent(intentFor('GLIDE_SWIM')); for (let i = 0; i < 120; i++) driver.update(1 / 60, c); }
  if (b !== 'BOTTOM_REST' || start === 'swim') driver.setIntent(intentFor(b));
  step(t);
}

function step(t: number): void {
  if (!driver) return;
  const c = ctx();
  const n = Math.round(t * 60);
  for (let i = 0; i < n; i++) driver.update(1 / 60, c);
}

/** the animal alone, belly up toward a camera beneath it (like the aquarium photos) */
function buildSpecimen(): void {
  clear();
  const b = { tint: new THREE.Color(1, 1, 1), dark: 0.4, seed: 3 };
  specimen = new AkaeiModel(b, state.lod);
  const dw = 0.36;
  specimen.root.scale.setScalar(dw);
  specimen.root.position.set(0, 0.3, 0);
  const p = new AkaeiPose();
  p.amp = 0.05; p.phase = 2.2; p.camber = 0.006; p.mouth = 0.6; p.gills = 0.5; p.spiracle = 0.8;
  specimen.pose(p);
  world.add(specimen.root);
}

function info(): string {
  const g = akaeiGeometries(state.lod);
  const d = driver;
  return `LOD${state.lod}  ${Math.round(triangleCount(g))} tris\n` + (d ? `${d.state} / ${d.phase}\nDW ${(d.discWidth * 100).toFixed(1)} cm  sand ${d.sand.toFixed(2)}  sink ${d.sink.toFixed(3)}` : 'specimen');
}

function setSun(az: number, el: number, centre = new THREE.Vector3()): void {
  const r = 4;
  sun.position.set(centre.x + Math.cos(el) * Math.sin(az) * r, centre.y + Math.sin(el) * r, centre.z + Math.cos(el) * Math.cos(az) * r);
  sun.target.position.copy(centre);
  const s = sun.shadow.camera as THREE.OrthographicCamera;
  s.left = s.bottom = -1.2; s.right = s.top = 1.2; s.near = 0.5; s.far = 8;
  s.updateProjectionMatrix();
}
setSun(0.6, 1.05);

function centre(): THREE.Vector3 {
  if (driver) return driver.anchor().clone();
  return new THREE.Vector3(0, 0.3, 0);
}

// panel
function seg(id: string, items: [string, string][], get: () => string, set: (v: string) => void): void {
  const el = document.getElementById(id)!;
  el.innerHTML = '';
  for (const [v, label] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    if (get() === v) b.classList.add('on');
    b.onclick = () => { set(v); seg(id, items, get, set); };
    el.appendChild(b);
  }
}
seg('acts', [['GLIDE_SWIM', '滑空遊泳'], ['BOTTOM_REST', '着底'], ['BURROW_IN_SAND', '砂潜り'], ['FORAGE', '摂餌'], ['ESCAPE', '逃避'], ['SPECIMEN', '腹面']], () => state.behaviour, (v) => {
  if (v === 'SPECIMEN') { buildSpecimen(); return; }
  state.behaviour = v as AkaeiState;
  if (driver && ind) driver.setIntent(intentFor(state.behaviour)); else build(state.behaviour, 0);
});
seg('lods', [['0', 'LOD0'], ['1', 'LOD1'], ['2', 'LOD2']], () => String(state.lod), (v) => { state.lod = Number(v) as Lod; build(state.behaviour, 0.5); });

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
build(state.behaviour, 0.5);

const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  if (driver && state.animate) {
    driver.update(dt, ctx());
    // follow the animal
    const a = driver.anchor();
    const d = new THREE.Vector3().subVectors(a, controls.target);
    controls.target.add(d);
    camera.position.add(d);
    const el = document.getElementById('info');
    if (el) el.textContent = info();
  }
  controls.update();
  renderer.render(scene, camera);
  if (!capture) requestAnimationFrame(frame);
}
if (!capture) requestAnimationFrame(frame);

interface Shot {
  behaviour?: AkaeiState | 'SPECIMEN'; start?: 'rest' | 'buried' | 'swim'; t?: number; lod?: Lod; seed?: number; length?: number;
  orbit?: [number, number, number]; look?: [number, number, number]; fov?: number; sun?: [number, number]; exposure?: number; air?: boolean; far?: boolean;
  /** names of objects to hide (debugging the effects) */
  hide?: string[];
}

// scripted renders
(window as unknown as { __akaei: unknown }).__akaei = {
  set(o: Shot) {
    if (o.seed !== undefined) state.seed = o.seed;
    if (o.length !== undefined) state.length = o.length;
    if (o.lod !== undefined) state.lod = o.lod;
    lockedFar = !!o.far;
    const air = !!o.air;
    scene.background = air ? airCol.clone() : waterCol.clone();
    (scene.fog as THREE.FogExp2).density = air ? 0.02 : 0.32;
    surface.visible = !air;
    sand.visible = o.behaviour !== 'SPECIMEN';
    if (o.behaviour === 'SPECIMEN') buildSpecimen();
    else build(o.behaviour ?? 'BOTTOM_REST', o.t ?? 1, o.start ?? 'rest');
    const c = centre();
    const heading = driver ? driver.heading : 0;
    setSun((o.sun?.[0] ?? 0.6) + heading, o.sun?.[1] ?? 1.05, c);
    const [az, el, dist] = o.orbit ?? [0.6, 0.5, 1.2];
    const a = az + heading;
    const look = o.look ? new THREE.Vector3(...o.look) : new THREE.Vector3();
    // look offset in the animal's frame (x left, y up, z forward)
    const off = new THREE.Vector3(look.x, look.y, look.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    controls.target.copy(c).add(off);
    camera.position.set(controls.target.x + Math.sin(a) * Math.cos(el) * dist, controls.target.y + Math.sin(el) * dist, controls.target.z + Math.cos(a) * Math.cos(el) * dist);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    renderer.toneMappingExposure = o.exposure ?? 0.95;
    scene.traverse((ob) => { if (o.hide?.includes(ob.name)) ob.visible = false; });
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    return info();
  },
};
