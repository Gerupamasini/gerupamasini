// マガキ viewer: one hero oyster, a cluster on a stone, or a patch of reef, under a low tidal-flat sun.
// ?capture hides the panel and exposes window.__oyster for scripted renders (tools/models/oyster/render.mjs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OysterAtlas } from '../../src/creatures/oyster/bake';
import { makeGenome, seedsFrom, gapeMillimetres, type AgeClass, type DeadState } from '../../src/creatures/oyster/genome';
import { DETAIL, OysterShape, triangleCount } from '../../src/creatures/oyster/geometry';
import { OysterIndividual } from '../../src/creatures/oyster/OysterIndividual';
import { OysterCluster } from '../../src/creatures/oyster/OysterCluster';
import { oysterEnv } from '../../src/creatures/oyster/material';
import { makeRockGeometry, makeRockMaterial, RockShape } from '../../src/world/Riprap';
import { OysterReef, type ReefSite } from '../../src/creatures/oyster/OysterReef';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
if (capture) document.body.classList.add('capture');

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture });
renderer.setPixelRatio(Number(params.get('dpr')) || Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color(0xb9c6cc);
scene.background = sky;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const hemi = new THREE.HemisphereLight(0xc4d6e6, 0x5a5044, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.002;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(35, 1, 0.004, 60);
camera.position.set(0.16, 0.12, 0.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.01, 0.04);
controls.enableDamping = true;

// the mud of the flat
const mudGeo = new THREE.PlaneGeometry(6, 6, 200, 200);
mudGeo.rotateX(-Math.PI / 2);
{
  const p = mudGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // a soft mud surface, flattened where the oyster lies
    const calm = Math.min(1, Math.hypot(x, z - 0.04) / 0.15);
    p.setY(i, (0.004 * Math.sin(x * 23 + z * 7) * Math.cos(z * 17) + 0.002 * Math.sin(x * 61 - z * 53)) * calm);
  }
  mudGeo.computeVertexNormals();
}
const mud = new THREE.Mesh(mudGeo, new THREE.MeshPhysicalMaterial({ color: 0x4b443a, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
mud.receiveShadow = true;
scene.add(mud);

let current: { dispose(): void; update?(dt: number): void; info(): string; centre?: THREE.Vector3; heading?: number } | null = null;
let shared: OysterAtlas | null = null;
const heroAtlases = new Map<number, OysterAtlas>();
const state = { mode: params.get('mode') ?? 'individual', seed: Number(params.get('seed') ?? 7), lod: 0 as 0 | 1 | 2, wet: 1, gape: 0.035, age: 'adult' as AgeClass, dead: 0 as DeadState, animate: false };

function sharedAtlas(): OysterAtlas { return (shared ??= OysterAtlas.shared(renderer, 'mid')); }

function buildIndividual(): void {
  const genome = makeGenome(seedsFrom(state.seed), { age: state.age, dead: state.dead, crowding: 0.45 });
  const v = genome.variant;
  let atlas = heroAtlases.get(v);
  if (!atlas) { atlas = OysterAtlas.hero(renderer, v, 'high'); heroAtlases.set(v, atlas); }
  const shape = new OysterShape(genome);
  const ind = new OysterIndividual({ genome, shape, atlas, lod: state.lod, lod0Detail: DETAIL.hero, state: 'FILTER_FEEDING' });
  // lying on the mud: the cup's lowest point set a little into it, the lower valve flattened there
  let minY = 0;
  const q = new THREE.Vector3();
  for (let i = 1; i < 20; i++) for (let j = 2; j < 10; j++) minY = Math.min(minY, shape.base(i / 20, j / 10, false, q).y);
  const embed = genome.embed * genome.length * 0.6;
  ind.setPlane(new THREE.Vector4(0, 1, 0, minY + embed));
  ind.root.position.y = -(minY + embed);
  ind.root.rotation.y = -0.5;
  scene.add(ind.root);
  ind.gape = genome.dead ? 0.6 : state.gape;
  ind.root.updateMatrixWorld(true);
  const centre = new THREE.Vector3(0, 0.25 * genome.cupDepth * genome.length, genome.length * 0.5).applyMatrix4(ind.root.matrixWorld);
  current = {
    centre,
    heading: ind.root.rotation.y,
    dispose: () => ind.dispose(),
    update: (dt) => {
      if (state.animate) ind.update(dt, { depth: 0.2, stimulus: 0 });
      else { ind.gape = genome.dead === 1 ? 0.6 : state.gape; ind.upperShell.rotation.x = -ind.gape; for (const m of [ind.mantle.material as any]) m.oy.uState.value.x = ind.gape; }
    },
    info: () => {
      let tris = 0;
      ind.root.traverse((o: any) => { if (o.isMesh && o.visible) tris += triangleCount(o.geometry); });
      return `殻長 ${(genome.length * 1000).toFixed(0)} mm  幅/長 ${genome.widthRatio.toFixed(2)}  型 ${genome.variant}${genome.mirror ? '′' : ''}\n開殻 ${gapeMillimetres(genome, ind.gape).toFixed(1)} mm  三角形 ${tris}\n${ind.state}`;
    },
  };
}

function buildCluster(): void {
  const atlas = sharedAtlas();
  // a stone to grow on
  const rockGeo = makeRockGeometry(state.seed, 0.32, 3);
  const rock = new THREE.Mesh(rockGeo, makeRockMaterial());
  rock.castShadow = rock.receiveShadow = true;
  rock.scale.set(1.6, 0.55, 1.2);
  rock.position.y = 0.02;
  scene.add(rock);
  rock.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const sub = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(rock, false)[0];
    if (!hit) return { y: 0, n: new THREE.Vector3(0, 1, 0) };
    return { y: hit.point.y, n: hit.face!.normal.clone().transformDirection(rock.matrixWorld) };
  };
  const centreC = new THREE.Vector3(0, 0.12, 0);
  const cluster = new OysterCluster({ seed: state.seed * 31 + 5, count: Number(params.get('count') ?? 18), radius: 0.1, atlas, substrate: sub });
  scene.add(cluster.group);
  current = {
    centre: centreC,
    heading: 0,
    dispose: () => { cluster.dispose(); rock.removeFromParent(); rockGeo.dispose(); },
    update: (dt) => cluster.update(dt, camera, state.animate ? 1 : -5, undefined),
    info: () => {
      let tris = 0;
      cluster.group.traverse((o: any) => { if (o.isMesh && o.visible) tris += triangleCount(o.geometry); });
      return `群生 ${cluster.oysters.length} 個体 (死殻 ${cluster.members.filter((m) => m.genome.dead).length})\n三角形 ${tris}`;
    },
  };
  if (!state.animate) for (const o of cluster.oysters) { o.gape = o.genome.dead === 1 ? 0.6 : state.gape * 0.8; o.upperShell.rotation.x = -o.gape; }
}

function buildReef(): void {
  const atlas = sharedAtlas();
  // a little revetment: stones on the mud, every upward face in reach of the tide offered to the oysters
  const rocks: THREE.Mesh[] = [];
  const sites: ReefSite[] = [];
  const rng = (() => { let a = state.seed * 7919 + 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const mat = makeRockMaterial();
  for (let i = 0; i < 14; i++) {
    const seed = state.seed * 100 + i, size = 0.45 + rng() * 0.5;
    const geo = makeRockGeometry(seed, 1, 3);
    const rock = new THREE.Mesh(geo, mat);
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 1.4;
    rock.position.set(Math.cos(a) * r, size * 0.15, Math.sin(a) * r * 0.7);
    rock.rotation.set((rng() - 0.5) * 0.4, rng() * 6.28, (rng() - 0.5) * 0.4);
    rock.scale.setScalar(size);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    rock.updateMatrixWorld(true);
    rocks.push(rock);
    const shape = new RockShape(seed);
    const m = rock.matrixWorld.clone(), inv = m.clone().invert(), nm = inv.clone().transpose();
    const surface = (w: THREE.Vector3, outP: THREE.Vector3, outN: THREE.Vector3) => {
      const l = w.clone().applyMatrix4(inv);
      shape.alongRay(l, outP);
      const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(l.x) > 0.9 * l.length()) t1.set(0, 1, 0);
      const t2 = new THREE.Vector3().crossVectors(l, t1).normalize(); t1.crossVectors(t2, l).normalize();
      const e = 0.02 * l.length();
      const pa = shape.alongRay(l.clone().addScaledVector(t1, e), new THREE.Vector3()).sub(outP), pb = shape.alongRay(l.clone().addScaledVector(t2, e), new THREE.Vector3()).sub(outP);
      outN.crossVectors(pa, pb); if (outN.dot(outP) < 0) outN.negate();
      outP.applyMatrix4(m); outN.transformDirection(nm).normalize();
    };
    for (let k = 0; k < 5; k++) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.9 + 0.1, rng() - 0.5);
      const p = new THREE.Vector3(), n = new THREE.Vector3();
      surface(dir.applyMatrix4(m), p, n);
      if (n.y < 0.1 || p.y < 0.03) continue;
      sites.push({ p, n, room: size * 0.6, surface });
    }
  }
  const reef = new OysterReef({ atlas, sites, seed: state.seed, quality: 'high', ground: (x, z, n) => { n.set(0, 1, 0); return 0; } });
  scene.add(reef.group);
  current = {
    centre: new THREE.Vector3(0, 0.15, 0),
    heading: 0,
    dispose: () => { reef.dispose(); for (const r of rocks) { r.removeFromParent(); r.geometry.dispose(); } },
    update: (dt) => reef.update(dt, camera, state.animate ? 1 : -5),
    info: () => { const s = reef.stats(); return `牡蠣礁 ${s.oysters} 個体 / ${s.clumps} 塊\n描画 LOD0 ${s.drawn[0]}  LOD1 ${s.drawn[1]}  LOD2 ${s.drawn[2]}\n原型三角形 ${s.protoTris.join(' / ')}`; },
  };
  camera.updateMatrixWorld();
  reef.update(0.016, camera, -5);
}

function buildLineup(): void {
  // individual differences: twelve oysters from consecutive seeds, laid out in a grid on the mud
  const atlas = sharedAtlas();
  const inds: OysterIndividual[] = [];
  const ages: AgeClass[] = ['adult', 'old', 'adult', 'juvenile', 'adult', 'adult', 'old', 'adult', 'spat', 'adult', 'juvenile', 'adult'];
  for (let i = 0; i < 12; i++) {
    const genome = makeGenome(seedsFrom(state.seed * 100 + i), { age: ages[i], dead: i === 5 ? 2 : i === 9 ? 1 : 0, crowding: (i % 4) / 3 });
    const shape = new OysterShape(genome);
    const ind = new OysterIndividual({ genome, shape, atlas, lod: state.lod, state: 'FILTER_FEEDING' });
    let minY = 0;
    const q = new THREE.Vector3();
    for (let a = 1; a < 16; a++) for (let b = 2; b < 9; b++) minY = Math.min(minY, shape.base(a / 16, b / 9, false, q).y);
    const embed = genome.embed * genome.length * 0.5;
    ind.setPlane(new THREE.Vector4(0, 1, 0, minY + embed));
    const col = i % 4, row = Math.floor(i / 4);
    ind.root.position.set((col - 1.5) * 0.16, -(minY + embed), (row - 1) * 0.17 - 0.06);
    ind.root.rotation.y = Math.PI + (i * 0.7) % 0.6 - 0.3;
    ind.gape = genome.dead === 1 ? 0.5 : state.gape;
    ind.upperShell.rotation.x = -ind.gape;
    (ind.mantle.material as any).oy.uState.value.x = ind.gape;
    scene.add(ind.root);
    inds.push(ind);
  }
  current = {
    centre: new THREE.Vector3(0, 0, 0),
    heading: 0,
    dispose: () => { for (const i of inds) i.dispose(); },
    info: () => inds.map((i) => `${(i.genome.length * 1000).toFixed(0)}mm ${i.genome.age}${i.genome.dead ? ' 死' : ''}`).join('  '),
  };
}

function rebuild(): void {
  current?.dispose();
  current = null;
  if (state.mode === 'cluster') buildCluster(); else if (state.mode === 'reef') buildReef(); else if (state.mode === 'lineup') buildLineup(); else buildIndividual();
  oysterEnv.uOyWetOverride.value = state.wet;
  info();
}

function info(): void {
  const el = document.getElementById('info');
  if (el && current) el.textContent = current.info();
}

function setSun(az: number, el: number): void {
  const r = 3;
  sun.position.set(Math.cos(el) * Math.sin(az) * r, Math.sin(el) * r, Math.cos(el) * Math.cos(az) * r);
  sun.target.position.set(0, 0, 0);
  const s = sun.shadow.camera as THREE.OrthographicCamera;
  s.left = s.bottom = -0.5; s.right = s.top = 0.5; s.near = 0.5; s.far = 6;
  s.updateProjectionMatrix();
}
setSun(0.9, 0.75);

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
seg('modes', [['individual', '単体'], ['lineup', '個体差'], ['cluster', '群生'], ['reef', '牡蠣礁']], () => state.mode, (v) => { state.mode = v; rebuild(); });
seg('lods', [['0', 'LOD0'], ['1', 'LOD1'], ['2', 'LOD2']], () => String(state.lod), (v) => { state.lod = Number(v) as 0 | 1 | 2; rebuild(); });
seg('acts', [['feed', '濾過'], ['touch', '接触'], ['anim', '自動']], () => '', (v) => {
  if (v === 'anim') state.animate = !state.animate;
  if (v === 'touch') state.gape = 0;
  if (v === 'feed') state.gape = 0.035;
});
const bind = (id: string, key: 'seed' | 'wet' | 'gape', live = false) => {
  const el = document.getElementById(id) as HTMLInputElement, out = document.getElementById(id + 'v')!;
  el.value = String(state[key]);
  out.textContent = String(state[key]);
  el.oninput = () => { (state as any)[key] = Number(el.value); out.textContent = el.value; if (key === 'wet') oysterEnv.uOyWetOverride.value = state.wet; else if (!live) rebuild(); };
};
bind('seed', 'seed');
bind('wet', 'wet', true);
bind('gape', 'gape', true);

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
rebuild();

const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  oysterEnv.uOyTime.value += dt;
  controls.update();
  current?.update?.(dt);
  renderer.render(scene, camera);
  if (!capture) requestAnimationFrame(frame);
}
if (!capture) requestAnimationFrame(frame);

// scripted renders
(window as any).__oyster = {
  set(o: { mode?: string; seed?: number; lod?: 0 | 1 | 2; wet?: number; gape?: number; age?: AgeClass; dead?: DeadState; cam?: number[]; target?: number[]; fov?: number; sun?: number[]; exposure?: number; count?: number }) {
    let re = false;
    if (o.mode && o.mode !== state.mode) { state.mode = o.mode; re = true; }
    if (o.seed !== undefined && o.seed !== state.seed) { state.seed = o.seed; re = true; }
    if (o.lod !== undefined && o.lod !== state.lod) { state.lod = o.lod; re = true; }
    if (o.age && o.age !== state.age) { state.age = o.age; re = true; }
    if (o.dead !== undefined && o.dead !== state.dead) { state.dead = o.dead; re = true; }
    if (o.count !== undefined) { params.set('count', String(o.count)); re = true; }
    if (o.wet !== undefined) state.wet = o.wet;
    if (o.gape !== undefined) state.gape = o.gape;
    if (re || !current) rebuild();
    oysterEnv.uOyWetOverride.value = state.wet;
    if (o.cam) camera.position.fromArray(o.cam);
    if (o.target) controls.target.fromArray(o.target);
    if ((o as any).orbit && current?.centre) {
      const [az, el, dist] = (o as any).orbit as number[];
      const a = az + (current.heading ?? 0);
      controls.target.copy(current.centre);
      camera.position.set(current.centre.x + Math.sin(a) * Math.cos(el) * dist, current.centre.y + Math.sin(el) * dist, current.centre.z + Math.cos(a) * Math.cos(el) * dist);
    }
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    if (o.sun) setSun(o.sun[0], o.sun[1]);
    if (o.exposure) renderer.toneMappingExposure = o.exposure;
    controls.update();
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    current?.update?.(0.016);
    current?.update?.(0.3);
    renderer.render(scene, camera);
    return current?.info();
  },
};
