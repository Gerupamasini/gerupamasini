// Behaviour test bed for the トビハゼ driver: a sloping mud flat running into water, scripted intents, fixed time steps.
//   /gerupamasini/tools/models/tobihaze/viewer/testbed.html?script=crawl&t=2.0&view=side&tier=lod1
import {
  ACESFilmicToneMapping, BufferAttribute, Color, DirectionalLight, HemisphereLight, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Bone,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { instantiateModel } from '../../../../src/creatures/models/ModelLoader';
import { TobihazeDriver } from '../../../../src/creatures/species/tobihaze/TobihazeDriver';
import { MudFx } from '../../../../src/world/MudFx';
import { BurrowField } from '../../../../src/world/Burrows';
import { Rng } from '../../../../src/core/Rng';
import type { Individual } from '../../../../src/creatures/Individual';
import type { SpeciesDef } from '../../../../src/data/schemas';
import type { Intent } from '../../../../src/creatures/drivers/Driver';
import type { Habitat, HabitatSample } from '../../../../src/world/Habitat';
import type { Terrain } from '../../../../src/world/Terrain';

const q = new URLSearchParams(location.search);
const tier = (q.get('tier') ?? 'lod1') as 'hero' | 'lod1' | 'lod2';
const script = q.get('script') ?? 'idle';
const T = Number(q.get('t') ?? 3);
const view = q.get('view') ?? 'oblique';
const waterY = Number(q.get('water') ?? 0.0);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene();
scene.background = new Color(0x8fa3ad);
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new HemisphereLight(0xcfdcf0, 0x4a4436, 0.7));
const sun = new DirectionalLight(0xfff0d8, 3.0);
sun.position.set(0.5, 1.0, -0.35);
scene.add(sun);

// the flat: gently sloping toward +z where the water is; a few hummocks and a runnel
const h = (x: number, z: number) => -0.05 * z + 0.006 * Math.sin(x * 7.1 + z * 2.3) + 0.004 * Math.sin(x * 17 - z * 11) - 0.012 * Math.exp(-((x - 0.25) ** 2) / 0.01);
const geo = new PlaneGeometry(3, 3, 300, 300);
geo.rotateX(-Math.PI / 2);
const pos = geo.getAttribute('position');
const col: number[] = [];
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), z = pos.getZ(i);
  const y = h(x, z);
  pos.setY(i, y);
  const n = 0.85 + 0.15 * Math.sin(x * 61 + Math.sin(z * 37) * 3) * Math.sin(z * 53);
  const wet = y < waterY + 0.03 ? 0.75 : 1;
  col.push(0.27 * n * wet, 0.235 * n * wet, 0.19 * n * wet);
}
geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
geo.computeVertexNormals();
const ground = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 }));
scene.add(ground);
const water = new Mesh(new PlaneGeometry(3, 3), new MeshPhysicalMaterial({ color: 0x5e6a52, roughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false }));
water.rotation.x = -Math.PI / 2;
water.position.y = waterY;
water.renderOrder = 3;
scene.add(water);

const groundAt = (x: number, z: number) => h(x, z);
const waterAt = () => waterY;
const sample = (x: number, z: number): HabitatSample => {
  const g = h(x, z);
  const depth = waterY - g;
  return { depth, substrate: 'mud', exposed: depth <= 0, wetness: depth > 0 ? 1 : 0.85, distToWater: Math.max(0, (g - waterY) / 0.05), inPool: false, tags: [], waterLevel: waterY, groundHeight: g };
};
const terrainStub = { heightAt: h, inside: () => true, substrateAt: () => 'mud', normalAt: (x: number, z: number, out = new Vector3()) => out.set(0.05 * 0, 1, 0.05).normalize() } as unknown as Terrain;
const habitatStub = { depthAt: (x: number, z: number) => waterY - h(x, z) } as unknown as Habitat;
const fx = new MudFx(scene);
fx.groundAt = h;
const burrows = new BurrowField(terrainStub, habitatStub, scene);

const species = (await (await fetch(`${import.meta.env.BASE_URL}data/species/periophthalmus_modestus.json`)).json()) as SpeciesDef;
const start = { x: Number(q.get('x') ?? 0), z: Number(q.get('z') ?? -0.3), heading: Number(q.get('h') ?? 0) };
const ind: Individual = {
  id: 'periophthalmus_modestus#test', species, pos: new Vector3(start.x, 0, start.z), home: new Vector3(start.x, 0, start.z), heading: start.heading,
  length_mm: Number(q.get('len') ?? 80), weight_g: 5, sex: 'm', stage: 'adult', traits: [], lengthPct: 50, alert: 0, energy: 0.5, lod: 0,
  brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' }, rng: new Rng(Number(q.get('seed') ?? 7)),
  cell: 0, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
};
const model = await instantiateModel(`tobihaze/tobihaze.${tier}.glb`);
scene.add(model.root);
const driver = new TobihazeDriver();
driver.attach(model.root, ind, model.extras, model.bones as Record<string, Bone>, model.meshes, { tier: model.tier, parser: model.parser });
const player = new Vector3(Number(q.get('px') ?? 3), 1.5, Number(q.get('pz') ?? 3));
const ctx = {
  floor: { heightAt: groundAt, waterAt, sampleAt: sample }, player, simScale: 1, nowMs: 0, locked: true,
  world: { fx, burrows, sunUp: 0.8 },
};
let id = 1;
const intent = (kind: Intent['kind'], extra: Partial<Intent> = {}): Intent => ({ id: id++, kind, urgency: 0.5, seconds: 10, ...extra });
// scripted intents (time → intent)
const plan: [number, Intent][] = [];
switch (script) {
  case 'crawl': plan.push([0.05, intent('moveTo', { target: new Vector3(start.x + 0.0, 0, start.z - 0.6), seconds: 20 })]); break;
  case 'turn': plan.push([0.05, intent('moveTo', { target: new Vector3(start.x + 0.4, 0, start.z - 0.1), seconds: 20 })]); break;
  case 'hop': plan.push([0.4, intent('flee', { from: new Vector3(start.x, 0, start.z + 0.5), urgency: 1 })]); break;
  case 'forage': plan.push([0.05, intent('forage', { seconds: 30 })]); break;
  case 'burrow': plan.push([0.05, intent('burrow', { seconds: 4 })]); break;
  case 'swim': plan.push([0.05, intent('moveTo', { target: new Vector3(start.x, 0, start.z + 0.8), seconds: 20 })]); break;
  case 'exit': plan.push([0.05, intent('moveTo', { target: new Vector3(start.x, 0, start.z - 0.9), seconds: 30 })]); break;
  case 'escape': plan.push([0.4, intent('flee', { from: new Vector3(start.x, 0, start.z - 0.6), urgency: 1 })]); break;
  case 'rewet': plan.push([0.05, intent('special', { param: 'rewet' })]); break;
  case 'display': plan.push([0.05, intent('display', { param: 'display', seconds: 8 })]); break;
  default: plan.push([0.05, intent('rest', { seconds: 60 })]);
}
const camera = new PerspectiveCamera(Number(q.get('fov') ?? 28), innerWidth / innerHeight, 0.005, 30);
const dist = Number(q.get('dist') ?? 0.32);
const views: Record<string, [number, number, number]> = { side: [1, 0.12, 0], oblique: [0.75, 0.42, 0.55], front: [0, 0.2, 1], top: [0.02, 1, 0.02], rear: [-0.3, 0.35, -1], low: [0.9, 0.06, 0.45], back: [0.4, 0.5, -0.8] };
// (vdir=x,y,z: any direction, in the fish's heading frame like the presets)
const vdirQ = q.get('vdir')?.split(',').map(Number) as [number, number, number] | undefined;
const vdir = new Vector3(...(vdirQ ?? views[view] ?? views.oblique)).normalize();
let simT = 0;
const dt = 1 / 60;
const step = () => {
  while (plan.length && plan[0][0] <= simT) driver.setIntent(plan.shift()![1]);
  ctx.nowMs = simT * 1000;
  driver.update(dt, ctx as never);
  fx.update(dt, camera.fov, innerHeight);
  simT += dt;
};
const follow = q.get('follow') !== '0';
const target = new Vector3();
const place = () => {
  const a = driver.anchor().clone();
  // (ty raises the target, tf moves it forward along the heading: frame the head)
  // (teye=1 frames the head: the target is the eyes' midpoint plus the ty / tf offsets)
  if (follow && q.get('teye')) {
    const bl = model.bones.J_eyeL as Bone, br = model.bones.J_eyeR as Bone;
    a.copy(bl.getWorldPosition(new Vector3())).add(br.getWorldPosition(new Vector3())).multiplyScalar(0.5);
  }
  if (follow) target.copy(a).add(new Vector3(Math.sin(ind.heading) * Number(q.get('tf') ?? 0), Number(q.get('ty') ?? 0), Math.cos(ind.heading) * Number(q.get('tf') ?? 0))); else target.set(start.x + Number(q.get('ox') ?? 0), h(start.x, start.z) + 0.01, start.z + Number(q.get('oz') ?? 0));
  // camera relative to the fish's heading (or to the start heading when the camera stays put)
  const hd = follow ? ind.heading : start.heading;
  const d = vdir.clone().applyAxisAngle(new Vector3(0, 1, 0), q.get('world') ? 0 : hd);
  camera.position.copy(target).addScaledVector(d, dist);
  camera.lookAt(target);
};
const hud = document.getElementById('hud')!;
const dbg: Mesh[] = [];
if (q.get('dbgfins')) {
  const { SphereGeometry, MeshBasicMaterial } = await import('three');
  for (const c of [0xff2020, 0x2060ff]) { const m = new Mesh(new SphereGeometry(0.0012, 8, 6), new MeshBasicMaterial({ color: c, depthTest: false })); m.renderOrder = 10; scene.add(m); dbg.push(m); }
}
const syncDbg = () => { const mo = (driver as unknown as { motor: { fins: { contact: Vector3 }[] } }).motor; dbg.forEach((m, i) => m.position.copy(mo.fins[i].contact)); };
if (q.get('marktest')) { for (const [i, k] of (['fin', 'drag', 'imprint', 'bite', 'scuff'] as const).entries()) fx.mark(k, start.x - 0.06 + i * 0.03, h(start.x - 0.06 + i * 0.03, start.z + 0.05), start.z + 0.05, 0, k === 'imprint' ? 0.06 : 0.02, k === 'imprint' ? 0.014 : 0.012, 1); }
while (simT < T) step();
place();
syncDbg();
if (q.get('noshadow')) scene.traverse((o) => { if (o.name === 'contactShadow') o.visible = false; });
if (q.get('nofx')) { fx.marks.visible = false; }
if (q.get('nofish')) model.root.visible = false;
for (const name of (q.get('hide') ?? '').split(',').filter(Boolean)) model.root.traverse((o) => { if (o.name === name) o.visible = false; });
if (q.get('dbgnormal')) { const { MeshNormalMaterial } = await import('three'); model.meshes.forEach((m) => { m.material = new MeshNormalMaterial(); }); }
if (q.get('dbgflat')) { const { MeshStandardMaterial: MSM } = await import('three'); model.meshes.forEach((m) => { m.material = new MSM({ color: 0x888888, roughness: 0.15, metalness: 0 }); }); }
if (q.get('dbgshadow')) scene.traverse((o) => { if (o.name === 'contactShadow') { const m = (o as Mesh).material as import('three').ShaderMaterial; m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4(0.02, 0.018, 0.015, clamp(a, 0.0, 1.0) * uOpacity);', 'gl_FragColor = vec4(clamp(a,0.0,1.0), fract(vP.x*100.0), fract(vP.y*100.0), 1.0);'); m.transparent = false; m.needsUpdate = true; } });
burrows.update(camera.position);
renderer.render(scene, camera);
hud.textContent = `t=${simT.toFixed(2)}s ${JSON.stringify(driver.debug)}`;
(window as unknown as { __ready: boolean }).__ready = true;
(window as unknown as { __scene: Scene }).__scene = scene;
(window as unknown as { __fx: MudFx }).__fx = fx;
(window as unknown as { __step: (n: number) => void }).__step = (n: number) => { for (let i = 0; i < n; i++) step(); place(); renderer.render(scene, camera); hud.textContent = `t=${simT.toFixed(2)}s ${JSON.stringify(driver.debug)}`; };
