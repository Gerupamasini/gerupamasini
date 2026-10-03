// Dev-only viewer for the コメツキガニ model, rig, materials and (later) behaviour. Not part of the game build.
// URL params: view=front|side|top|q34|back|low|macro|under  pose=stand|feed|wave|fold|walk  lod=0|1|2
//             wet=0..1 sand=0..1 seed=int sex=m|f sun=elevationDeg az=deg w,h (canvas size) live=1 (run the sim)
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap,
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

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);
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

const scene = new Scene();
scene.background = new Color(0x9fb3c0);

// sky gradient → environment
const skyMat = new ShaderMaterial({
  side: BackSide, depthWrite: false,
  uniforms: {},
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.62,0.66,0.62), vec3(0.32,0.5,0.78), smoothstep(0.0, 0.6, y)); c = mix(c, vec3(0.42,0.38,0.32), smoothstep(0.0, -0.3, y)); gl_FragColor = vec4(c, 1.0); }',
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
scene.add(new HemisphereLight(0x95aec4, 0x5a4a36, num('hemi', 0.5)));

// sand: a procedural ground close enough to the game's flat to judge the crab against
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
  vec3 base = vec3(0.42, 0.34, 0.22);
  vec3 c = base * (0.75 + 0.5 * k);
  if (k > 0.94) c = vec3(0.75, 0.72, 0.66); else if (k > 0.9) c = base * 0.35;
  float disc = smoothstep(0.42, 0.3, sqrt(best));
  c = mix(base * 0.8, c, disc);
  diffuseColor.rgb = c * 0.85;
  gN = -off * disc * 0.9;
}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + (viewMatrix * vec4(gN.x, 0.0, gN.y, 0.0)).xyz * 0.6);`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = 0.62;');
};
const ground = new Mesh(new PlaneGeometry(0.6, 0.6, 1, 1).rotateX(-Math.PI / 2), sandMat);
ground.receiveShadow = true;
scene.add(ground);

const seed = num('seed', 7);
const crab = new CrabModel({ sex: Q.get('sex') ?? 'm', cw_m: CW, seed, juvenile: num('juv', 0) });
crab.setLod(num('lod', 0));
crab.setShadows(true);
crab.setSurface(num('wet', 0.45), num('sand', 0.4), num('tip', 0.3), 0.5);
scene.add(crab.root);

const v = new Vector3();
function pose(kind, t = 0) {
  const r = crab.rig;
  const h = kind === 'feed' ? STANCE.bodyHeight.feed : kind === 'wave' ? STANCE.bodyHeight.alert : STANCE.bodyHeight.calm;
  r.body.position.set(0, h, 0);
  r.body.rotation.set(kind === 'feed' ? 0.12 : kind === 'wave' ? -0.12 : 0, 0, 0);
  r.root.updateMatrixWorld(true);
  const bodyInv = r.body.matrix.clone().invert();
  for (let i = 0; i < r.legs.length; i++) {
    const leg = r.legs[i];
    const k = i % 4;
    const reach = STANCE.footReach[k];
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

const camera = new PerspectiveCamera(num('fov', 40), (W || innerWidth) / (H || innerHeight), 0.0005, 5);
const target = new Vector3(0, CW * 0.35, 0);
const views = {
  front: [0, 0.35, 3.2], side: [3.2, 0.4, 0], top: [0, 3.6, 0.001], q34: [2.1, 1.5, 2.3], back: [-1.6, 1.5, -2.6],
  low: [1.2, 0.15, 3.0], macro: [0.9, 0.7, 1.3], under: [0.4, -0.6, 2.4], eye: [0.5, 0.9, 1.0], chela: [0.6, 0.15, 1.2], leg: [1.6, 0.6, 0.5],
};
const vw = views[Q.get('view') ?? 'q34'] ?? views.q34;
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

const kind = Q.get('pose') ?? 'stand';
let t = 0, frames = 0;
const hud = document.getElementById('hud');
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
