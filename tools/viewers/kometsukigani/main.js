// Dev-only viewer for the コメツキガニ model, rig, materials and (later) behaviour. Not part of the game build.
// URL params: view=front|side|top|q34|back|low|macro|under  pose=stand|feed|wave|fold|walk  lod=0|1|2
//             wet=0..1 sand=0..1 seed=int sex=m|f sun=elevationDeg az=deg w,h (canvas size) live=1 (run the sim)
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer, BackSide, SphereGeometry, ShaderMaterial,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CrabModel } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaModel.js';
import { STANCE } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaMorphology.js';
import { CHELA_POSES } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaRig.js';
import { crabTriangles } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaGeometry.js';
import { ScopimeraGlobosa, makeEnv, seasonFor } from '../../../src/creatures/kometsukigani/ScopimeraGlobosa.js';
import { BurrowRenderer, shaftAxis, RENDER_ORDER } from '../../../src/creatures/kometsukigani/Burrows.js';
import { SandPellets } from '../../../src/creatures/kometsukigani/SandPellets.js';
import { paletteFor } from '../../../src/creatures/kometsukigani/ScopimeraGlobosaMaterial.js';

const Q = new URLSearchParams(location.search);
/**
 * Photo-match presets: the camera, light, ground, colour morph and pose of the reference photographs, so a render
 * can be laid beside its photo and judged part by part (tools/viewers/kometsukigani/compare.mjs).
 *   p1 aquarium, front, just above the floor (pale individual)      p2 on its back on a palm (ventral)
 *   p3 aquarium, front, a little higher (khaki individual)          p4 field, 3/4 from above, dark sand, pellets
 *   p5 field, ground level, a dark purple male waving               p6 the pinned specimen from above (plate 007)
 * Any preset value can be overridden in the URL (e.g. &fov=5 for a close-up, &dbg=1 for the albedo alone).
 */
const PRESETS = {
  p1: { scene: 'studio', pal: 'pale', pose: 'stand', cam: '0,0.55,7.4', tgt: '0,0.36,0', fov: 13, sex: 'm', wet: 0.75, sand: 0.02, tip: 0, sun: 70, az: 175, exp: 1.15, env: 0.6, hemi: 1.5, fill: 0.55 },
  p2: { scene: 'hand', pal: 'pale', pose: 'flip', cam: '0,2.5,-3.0', tgt: '0,0.45,0.1', fov: 17, sex: 'm', wet: 0.9, sand: 0, tip: 0, sun: 60, az: 200, exp: 0.62, env: 0.5, hemi: 0.9 },
  p3: { scene: 'studio', pal: 'khaki', pose: 'stand', cam: '0,2.1,7.4', tgt: '0,0.34,0', fov: 13, sex: 'm', wet: 0.75, sand: 0.02, tip: 0, sun: 65, az: 190, exp: 1.15, env: 0.6, hemi: 1.5, fill: 0.55 },
  p4: { scene: 'dark', pal: 'grey', pose: 'feed', cam: '-3.2,5.2,7.2', tgt: '0,0.25,0.2', fov: 24, sex: 'f', wet: 0.4, sand: 0.5, tip: 0.6, sun: 50, az: 220, exp: 0.95, env: 0.25, hemi: 0.85, pellets: 260, heading: 0.35 },
  // the pinned specimen seen from above (p-007): dorsal pattern and leg proportions
  p6: { scene: 'dark', pal: 'brown', pose: 'stand', cam: '0,9.5,-0.01', tgt: '0,0.3,0', fov: 13.7, sex: 'm', wet: 0.3, sand: 0, tip: 0, sun: 80, az: 180, exp: 0.9, env: 0.3, hemi: 0.9 },
  p5: { scene: 'dark', pal: 'purple', pose: 'wave', cam: '0,0.4,11.5', tgt: '0,0.92,0', fov: 15, sex: 'm', wet: 0.25, sand: 0.35, tip: 0.5, sun: 60, az: 150, exp: 0.75, env: 0.12, hemi: 0.5 },
};
const PRE = PRESETS[Q.get('preset')] ?? {};
const param = (k) => (Q.has(k) ? Q.get(k) : PRE[k] !== undefined ? String(PRE[k]) : null);
const num = (k, d) => { const v = param(k); return v === null ? d : Number(v); };
const vec = (k) => { const v = param(k); return v === null ? null : v.split(',').map(Number); };
const canvas = document.getElementById('c');
const W = num('w', 0), H = num('h', 0);
if (W && H) { canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; }
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W || innerWidth, H || innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exp', 0.62);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const SCENE = param('scene') ?? 'field';
const scene = new Scene();
scene.background = new Color(SCENE === 'studio' ? 0xd9dde0 : SCENE === 'hand' ? 0xd9a48c : SCENE === 'dark' ? 0x8a8580 : 0x9fb3c0);

// sky gradient → environment
const skyMat = new ShaderMaterial({
  side: BackSide, depthWrite: false,
  uniforms: {},
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: SCENE === 'studio' || SCENE === 'hand'
    // a bright room seen through the tank: white walls, a window band, the bench below
    // a room seen from the tank: mid-grey walls, a bright window to the front-left, a ceiling light, the bench
    ? 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = vec3(0.32,0.33,0.34); c = mix(c, vec3(0.5,0.5,0.5), smoothstep(-0.05, 0.3, y)); float win = smoothstep(0.6, 0.88, dot(vD, normalize(vec3(-0.5,0.35,0.8)))); c += vec3(1.5,1.52,1.55) * win; c += vec3(1.2) * smoothstep(0.88, 0.98, y); c = mix(c, vec3(0.22,0.21,0.2), smoothstep(0.0, -0.4, y)); gl_FragColor = vec4(c, 1.0); }'
    : 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.62,0.66,0.62), vec3(0.32,0.5,0.78), smoothstep(0.0, 0.6, y)); c = mix(c, vec3(0.42,0.38,0.32), smoothstep(0.0, -0.3, y)); gl_FragColor = vec4(c, 1.0); }',
});
const envScene = new Scene();
envScene.add(new Mesh(new SphereGeometry(10, 32, 16), skyMat));
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.02).texture;
scene.environmentIntensity = num('env', 0.09);

const CW = num('cw', 9) / 1000;
// sun: tight shadow frustum around the crab (as in the game's focused observation shadows)
const sun = new DirectionalLight(0xfff3e6, 2.6);
const el = num('sun', 48) * Math.PI / 180, az = num('az', 130) * Math.PI / 180;
const sunDir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
sun.position.copy(sunDir).multiplyScalar(0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -0.05; sc.right = 0.05; sc.top = 0.05; sc.bottom = -0.05; sc.near = 0.01; sc.far = 1.5;
sun.shadow.bias = -0.00002;
sun.shadow.normalBias = 0.00004;
scene.add(sun, sun.target);
if (SCENE === 'studio' || SCENE === 'hand') {
  scene.add(new HemisphereLight(0xf2f5f8, 0x8c857e, num('hemi', 0.5)));
  // the tank is lit from the room: a broad soft fill from the front
  const fill = new DirectionalLight(0xffffff, num('fill', 0.9));
  fill.position.set(0, 0.2, 1);
  scene.add(fill);
} else scene.add(new HemisphereLight(0x95aec4, 0x5a4a36, num('hemi', 0.5)));

// sand: a procedural ground close enough to the game's flat to judge the crab against
const SANDC = SCENE === 'dark' ? [0.2, 0.195, 0.18] : [0.42, 0.34, 0.22];
// dark tidal sands (5.webp, 6.webp): salt and pepper — quartz and shell white, magnetite black, grey lithics
const PEPPER = SCENE === 'dark' ? 1 : 0;
const sandMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
sandMat.onBeforeCompile = (s) => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vW;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p+17.3)); }
float gH = 0.0; vec2 gN = vec2(0.0);`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 mm = vW.xz * 1000.0;
  vec2 ip = floor(mm / 0.22), fp = fract(mm / 0.22);
  float best = 9.0; vec2 id = vec2(0.0), off = vec2(0.0);
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){ vec2 g = vec2(i,j); vec2 r = g + h22(ip+g)*0.8+0.1 - fp; float d = dot(r,r); if (d<best){best=d; id=ip+g; off=r;} }
  float k = h21(id+3.1);
  vec3 base = vec3(${SANDC.join(', ')});
  vec3 c = base * (0.75 + 0.5 * k);
  float pep = ${PEPPER.toFixed(1)};
  if (k > 0.94 - 0.12 * pep) c = vec3(0.75, 0.72, 0.66) * (0.8 + 0.25 * h21(id + 7.7)); else if (k > 0.9 - 0.12 * pep || k < 0.22 * pep) c = base * 0.3;
  float disc = smoothstep(0.42, 0.3, sqrt(best));
  c = mix(base * 0.8, c, disc);
  diffuseColor.rgb = c * 0.85;
  gN = -off * disc * 0.9;
}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + (viewMatrix * vec4(gN.x, 0.0, gN.y, 0.0)).xyz * 0.6);`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = 0.62;');
};
let groundMat = sandMat;
if (SCENE === 'studio') groundMat = new MeshPhysicalMaterial({ color: new Color(0.62, 0.66, 0.68), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0 });
else if (SCENE === 'hand') groundMat = new MeshStandardMaterial({ color: new Color(0.62, 0.36, 0.27), roughness: 0.55 });
const ground = new Mesh(new PlaneGeometry(0.6, 0.6, 1, 1).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true;
scene.add(ground);

const seed = num('seed', 7);
const crab = new CrabModel({ sex: param('sex') ?? 'm', cw_m: CW, seed, juvenile: num('juv', 0) });
if (param('pal')) crab.applyPalette(paletteFor(param('pal'), seed));
crab.setLod(num('lod', 0));
crab.setShadows(true);
crab.setSurface(num('wet', 0.45), num('sand', 0.4), num('tip', 0.3), 0.5);
crab.root.rotation.y = num('heading', 0);
crab.setSandColor(new Color(SANDC[0] * 1.05, SANDC[1] * 1.05, SANDC[2] * 1.05));
crab.pelletMat.userData.uniforms.uPelPepper.value = PEPPER;
if (num('dbg', 0)) for (const m of [crab.mat, crab.setaeMat]) m.userData.uniforms.uKgMorph.value.y = 1;
if (param('fill')) scene.userData.fill = num('fill', 0.9);
scene.add(crab.root);
// a static field of pellets around the crab (p4)
const NPEL = LIVE_CHECK() ? 0 : num('pellets', 0);
let staticPellets = null;
if (NPEL > 0) {
  staticPellets = new SandPellets();
  staticPellets.setSandColor(new Color(SANDC[0] * 1.05, SANDC[1] * 1.05, SANDC[2] * 1.05));
  staticPellets.setPepper(PEPPER);
  staticPellets.setShadows(true);
  scene.add(staticPellets.group);
  let rs = seed * 7919 + 13;
  const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  for (let i = 0; i < NPEL; i++) {
    const a = rnd() * Math.PI * 2, d = CW * (1.2 + Math.sqrt(rnd()) * 6);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    staticPellets.add(x, 0, z, CW * (0.13 + rnd() * 0.05), 'feed', -900 - rnd() * 900, rnd());
  }
  staticPellets.update(0, new Vector3(0, 0.05, 0.1), null);
}
function LIVE_CHECK() { return Q.get('live') === '1'; }

const v = new Vector3();
function pose(kind, t = 0) {
  const r = crab.rig;
  if (kind === 'flip') { poseFlip(); return; }
  const h = kind === 'feed' ? STANCE.bodyHeight.feed : kind === 'wave' ? STANCE.bodyHeight.display : STANCE.bodyHeight.calm;
  r.body.position.set(0, h, 0);
  r.body.rotation.set(kind === 'feed' ? 0.12 : kind === 'wave' ? -0.12 : 0, 0, 0);
  r.root.updateMatrixWorld(true);
  const bodyInv = r.body.matrix.clone().invert();
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const k = i % 4;
    const reach = STANCE.footReach[k] * (kind === 'wave' ? 0.95 : 1);
    // home foot on the ground (Root space), then into Body space
    leg.homeFoot(v, reach, 0, 0);
    v.y = 0;
    v.applyMatrix4(bodyInv);
    leg.solve(v, undefined, [0.18, 0.06, -0.1, -0.25][k] * leg.side);
  }
  for (const c of r.chelae) {
    if (kind === 'wave') c.setPose(CHELA_POSES.wave);
    else if (kind === 'feed') c.setPose(CHELA_POSES.scoop);
    else if (kind === 'mouth') c.setPose(CHELA_POSES.mouth);
    else c.setPose(CHELA_POSES.fold);
  }
  const fold = kind === 'fold' ? 1 : 0;
  for (const e of r.eyes) e.pose(fold, null, 0);
  crab.setMouthPellet(kind === 'feed' ? 0.7 : 0);
}

/** on its back on a palm (p2): legs folded over the underside, chelae folded, the carapace resting on the hand */
function poseFlip() {
  const r = crab.rig;
  r.body.position.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  r.root.updateMatrixWorld(true);
  // the legs fold over the underside (knees toward the viewer), as a crab held on its back does (3.webp)
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const k = i % 4;
    // meri swung forward and level, the knee shut so carpus, propodus and dactylus lie folded back over the
    // merus' ventral edge: from below one sees the slender distal segments, not the broad meri (3.webp)
    // (yaw > 0 is backward on the left side, forward on the right)
    leg.ang.yaw = -leg.side * [0.62, 0.55, 0.45, 0.3][k];
    leg.ang.lev = [0.15, 0.2, 0.25, 0.3][k];
    leg.ang.knee = -2.55;
    leg.ang.cp = 0;
    leg.ang.dac = -1.0;
    leg.apply();
  }
  for (const c of r.chelae) c.setPose(CHELA_POSES.fold);
  for (const e of r.eyes) e.pose(0.15, null, 0);
  crab.setMouthPellet(0);
  // upside down, the dome on the palm
  crab.root.rotation.set(0, 0, Math.PI);
  crab.root.position.set(0, (0.58 + 0.02) * CW, 0);
}

const camera = new PerspectiveCamera(num('fov', 40), (W || innerWidth) / (H || innerHeight), 0.0005, 5);
const target = new Vector3(0, CW * 0.35, 0);
const views = {
  front: [0, 0.35, 3.2], side: [3.2, 0.4, 0], top: [0, 3.6, 0.001], q34: [2.1, 1.5, 2.3], back: [-1.6, 1.5, -2.6],
  low: [1.2, 0.15, 3.0], macro: [0.9, 0.7, 1.3], under: [0.4, -0.6, 2.4], eye: [0.5, 0.9, 1.0], chela: [0.6, 0.15, 1.2], leg: [1.6, 0.6, 0.5],
};
const vw = vec('cam') ?? views[Q.get('view') ?? 'q34'] ?? views.q34;
const tg = vec('tgt');
if (tg) target.set(tg[0], tg[1], tg[2]).multiplyScalar(CW);
camera.position.set(vw[0], vw[1], vw[2]).multiplyScalar(CW * num('dist', 1)).add(target);
if (Q.get('view') === 'eye') target.set(0, CW * 0.75, CW * 0.4);
if (Q.get('view') === 'chela') target.set(0, CW * 0.2, CW * 0.55);
if (Q.get('view') === 'leg') target.set(CW * 0.9, CW * 0.2, CW * 0.1);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.update();

// ---------------------------------------------------------------- live: a crab, its burrow, pellets, a passer-by
const LIVE = Q.get('live') === '1';
let live = null;
if (LIVE) {
  scene.remove(crab.root);
  const burrows = new BurrowRenderer();
  scene.add(burrows.group);
  const pellets = new SandPellets();
  scene.add(pellets.group);
  pellets.setShadows(true);
  const up = new Vector3(0, 1, 0);
  const bk = 1, az = num('baz', 0.4);
  const bE = new Vector3(0, 0, 0), bR = CW * 0.45;
  const burrow = { e: bE, axis: shaftAxis(bk, az, up), r: bR, az };
  const probe = {
    heightAt(x, z) {
      let h = 0;
      // the worn funnel at the mouth
      const d = Math.hypot(x - bE.x, z - bE.z);
      if (d < bR * 1.32) h -= 0.3 * bR * (1 - (d / (bR * 1.32)) ** 2);
      const ph = pellets.heightAt(x, z);
      return Math.max(h, ph);
    },
  };
  const c = new ScopimeraGlobosa({ seed, sex: Q.get('sex') ?? 'm', cw_mm: CW * 1000, resident: true });
  c.setLod(num('lod', 0));
  c.model.setShadows(true);
  for (const m of c.model.lods) m.renderOrder = RENDER_ORDER.crab;
  c.model.setup?.();
  scene.add(c.root);
  const startState = Q.get('state') ?? 'burrow';
  c.placeAt(0, 0, az, probe, startState === 'burrow');
  c.animator.heading = az;
  if (startState !== 'burrow') { c.behavior.state = 'IDLE'; c.behavior.idleFor = 0.5; c.behavior.plugged = false; c.animator.placeAt(CW * 0.6, CW * 0.2, az, probe); }
  pellets.setSandColor(new Color(0.36, 0.29, 0.19));
  c.model.setSandColor(new Color(0.36, 0.29, 0.19));
  c.onPellet = (p, r, k) => pellets.add(p.x, 0, p.z, r, k, pellets.time, Math.random());
  const env = makeEnv(probe);
  env.burrow = burrow;
  env.season = seasonFor(num('doy', 190));
  env.sinceExposed = 3000;
  env.onExcavate = () => {
    const a = Math.random() * Math.PI * 2;
    pellets.add(bE.x + Math.sin(a) * bR * 1.6, 0, bE.z + Math.cos(a) * bR * 1.6, CW * 0.22, 'dig', pellets.time, Math.random());
  };
  // a passer-by: walks toward the crab from t0 at v (m/s) (threat), param threat=t0
  const threatT0 = num('threat', -1);
  const threatPos = new Vector3(0.6, 0, 1.2);
  // pre-seed some old pellets around the burrow (a fan of radial trails)
  const seedPel = num('pellets', 120);
  for (let i = 0; i < seedPel; i++) {
    const trip = Math.floor(i / 12), a = trip * 0.45 + 1.2, d = (1.1 + (i % 12) * 0.55 + Math.random() * 0.3) * CW;
    const side = (Math.random() - 0.5) * 0.9 * CW;
    pellets.add(bE.x + Math.sin(a) * d + Math.cos(a) * side, 0, bE.z + Math.cos(a) * d - Math.sin(a) * side, CW * (0.09 + Math.random() * 0.04), 'feed', -600 - Math.random() * 600, Math.random());
  }
  live = { c, env, burrows, pellets, burrow, probe, threatT0, threatPos, t: 0 };
}

function stepLive(dt) {
  const L = live;
  L.t += dt;
  const env = L.env;
  // the passer-by
  env.threat = null;
  if (L.threatT0 >= 0 && L.t > L.threatT0) {
    const v = 0.6;
    const dir = new Vector3().subVectors(L.c.pos, L.threatPos).setY(0);
    const dist = dir.length();
    if (dist > 0.3) L.threatPos.addScaledVector(dir.normalize(), v * dt);
    const lvl = Math.max(0, Math.min(1, 1 - dist / 1.4)) + (dist < 0.9 ? 0.3 : 0);
    env.threat = lvl > 0.02 ? { pos: L.threatPos.clone(), level: Math.min(1, lvl), kind: 'player' } : null;
  }
  L.c.update(dt, env);
  L.pellets.update(dt, camera.position, () => -Infinity);
  // the burrow: a real hole while it is open
  L.burrows.begin();
  const plugged = L.c.behavior.plugged;
  if (!plugged) L.burrows.addOpen(L.burrow.e, L.burrow.r, 1, L.burrow.az, new Vector3(0, 1, 0));
  L.burrows.addDecal(L.burrow.e, new Vector3(0, 1, 0), L.burrow.r * 2.1, L.burrow.r * 2.1, 0, 0, plugged ? 0 : 1, 0.3, 1);
  // contact shadow under the body (soft, follows the sun)
  const a = new Vector3(); L.c.anchor(a);
  const hgt = Math.max(0, a.y - 0.0);
  const off = new Vector3(-sunDir.x, 0, -sunDir.z).multiplyScalar(hgt / Math.max(0.2, sunDir.y));
  if (!L.c.hidden) L.burrows.addDecal(new Vector3(a.x + off.x * 0.5, 0, a.z + off.z * 0.5), new Vector3(0, 1, 0), CW * 0.75, CW * 0.6 + off.length() * 0.3, Math.atan2(off.x, off.z), 1, 0.35);
  L.burrows.end();
}

const kind = param('pose') ?? 'stand';
let t = 0, frames = 0;
const hud = document.getElementById('hud');
if (Q.get('hud') === '0') hud.style.display = 'none';
const hudText = () => `CW ${(CW * 1000).toFixed(1)} mm  LOD${num('lod', 0)}  tris ${crabTriangles(num('lod', 0))}  ${LIVE ? `t ${live.t.toFixed(1)}s  ${live.c.behavior.debug}  pellets ${live.pellets.total}` : `pose ${kind}`}`;
hud.textContent = hudText();
// simulate ahead in fixed steps (screenshots of a given moment)
if (LIVE) {
  const T = num('t', 0);
  for (let k = 0; k < T * 60; k++) stepLive(1 / 60);
}
function frame() {
  t += 1 / 60;
  if (LIVE) {
    if (!Q.has('freeze')) stepLive(1 / 60);
    if (Q.has('follow')) { const a = new Vector3(); live.c.anchor(a); controls.target.lerp(a, 0.2); }
    if (Q.has('rel')) {
      // camera fixed in the crab's frame (e.g. rel=front): look at its face whatever way it turns
      const a = new Vector3(); live.c.anchor(a);
      const h = live.c.heading, o = vw;
      const ox = o[0] * Math.cos(h) + o[2] * Math.sin(h), oz = -o[0] * Math.sin(h) + o[2] * Math.cos(h);
      camera.position.set(ox, o[1], oz).multiplyScalar(CW * num('dist', 1)).add(a);
      controls.target.copy(a);
    }
  } else pose(kind, t);
  controls.update();
  renderer.render(scene, camera);
  frames++;
  if (frames % 10 === 0) hud.textContent = hudText();
  if (frames === 3) { hud.textContent = hudText(); window.__ready = true; }
  requestAnimationFrame(frame);
}
window.__crab = crab;
window.__live = live;
frame();
