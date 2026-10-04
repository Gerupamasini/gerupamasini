// トビハゼ showcase: one mudskipper, the game's own driver (Mind + Motor + wet-skin materials), on a small sloping
// mud flat that runs into water. Runs live at 60 Hz fixed steps; the page's controls send it intents, move the tide
// and change the view. Built into a single module by vite.config.mjs next to this file.
import {
  ACESFilmicToneMapping, BackSide, CanvasTexture, Color, DirectionalLight, Fog, HemisphereLight, Mesh,
  MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Raycaster, RepeatWrapping,
  RingGeometry, MeshBasicMaterial, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3, Vector4, WebGLRenderer,
  type Bone, type IUniform, type Object3D, type SkinnedMesh,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TobihazeDriver } from '../../../../src/creatures/species/tobihaze/TobihazeDriver';
import { setTobihazeEnvironment } from '../../../../src/creatures/species/tobihaze/TobihazeMaterial';
import type { Motor } from '../../../../src/creatures/species/tobihaze/Motor';
import type { TobiState } from '../../../../src/creatures/species/tobihaze/Mind';
import { MudFx } from '../../../../src/world/MudFx';
import { BurrowField } from '../../../../src/world/Burrows';
import { createWaves, WAVES_GLSL } from '../../../../src/world/Waves';
import { Rng } from '../../../../src/core/Rng';
import type { Individual } from '../../../../src/creatures/Individual';
import type { SpeciesDef } from '../../../../src/data/schemas';
import type { Intent } from '../../../../src/creatures/drivers/Driver';
import type { Habitat, HabitatSample } from '../../../../src/world/Habitat';
import type { Terrain } from '../../../../src/world/Terrain';
import speciesJson from '../../../../public/data/species/periophthalmus_modestus.json';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const species = speciesJson as unknown as SpeciesDef;
const BEHAVIOR_JA = new Map(species.encyclopedia.behaviors.map((b) => [b.id, b.ja]));
const STATE_JA: Record<TobiState, string> = {
  SWIM: '泳いでいる', SHALLOW_WATER: '浅い水の中', LAND_CRAWL: '胸びれで這う', LAND_HOP: '跳んでいる', IDLE: '休んでいる',
  FORAGE: '餌を探す', BURROW: '巣穴', ESCAPE: '逃げている', WATER_ENTRY: '水に入る', WATER_EXIT: '水から上がる',
};

// ------------------------------------------------------------------------------------------------ the flat
// T.P. height (m): a gentle slope down toward +z, broad swells, ripple marks, and a meandering runnel that carries the
// water up into the flat. The same expression runs in the ground and water shaders.
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h = (x: number, z: number) =>
  -0.045 * z + 0.01 * Math.sin(0.9 * x + 0.3) * Math.sin(0.7 * z + 1.1) + 0.004 * Math.sin(2.7 * x - 1.9 * z) + 0.0012 * Math.sin(6.1 * x + 4.3 * z + 0.7 + 0.8 * Math.sin(1.7 * x))
  - 0.024 * Math.exp(-((x - 0.55 - 0.35 * Math.sin(0.8 * z)) ** 2) / 0.045) * smooth(-2.6, 0.4, z);
const H_GLSL = /* glsl */ `
float flatH(vec2 p) {
  float x = p.x, z = p.y;
  float r = x - 0.55 - 0.35 * sin(0.8 * z);
  return -0.045 * z + 0.01 * sin(0.9 * x + 0.3) * sin(0.7 * z + 1.1) + 0.004 * sin(2.7 * x - 1.9 * z) + 0.0012 * sin(6.1 * x + 4.3 * z + 0.7 + 0.8 * sin(1.7 * x))
    - 0.024 * exp(-(r * r) / 0.045) * smoothstep(-2.6, 0.4, z);
}`;

let tide = 0;            // water level (m)
let speedMul = 1;
let auto = true;
const SUN = new Vector3(0.42, 0.78, -0.46).normalize();

function boot(): void {
  const canvas = $<HTMLCanvasElement>('scene');
  const loading = $('loading');
  if (!canvas) return;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    if (loading) loading.textContent = 'このブラウザでは WebGL が使えないため、3D 表示ができません。';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const HORIZON = new Color(0.8, 0.84, 0.85);
  scene.fog = new Fog(HORIZON, 4, 12.5);
  scene.background = HORIZON;

  // sky dome (also baked into the environment map, so the water and the wet skin reflect it)
  const skyMat = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun;
      void main(){ float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.80, 0.84, 0.85), vec3(0.42, 0.58, 0.74), pow(y, 0.55));
        c = mix(c, vec3(0.5, 0.48, 0.42), smoothstep(0.0, -0.25, vD.y));
        float s = max(dot(vD, uSun), 0.0);
        c += vec3(1.0, 0.93, 0.8) * (pow(s, 900.0) * 8.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new Mesh(new SphereGeometry(40, 32, 16), skyMat);
  const envScene = new Scene();
  envScene.add(sky.clone());
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
  scene.add(sky);
  scene.add(new HemisphereLight(0xd6e2ee, 0x4c4334, 0.75));
  const sunLight = new DirectionalLight(0xfff1dc, 2.4);
  sunLight.position.copy(SUN);
  scene.add(sunLight);

  // the sun's direction after refraction into the water (for the caustics on the bed and on the fish)
  const sinI = Math.hypot(SUN.x, SUN.z), sinT = sinI / 1.333, hx = SUN.x / sinI, hz = SUN.z / sinI;
  const sunT = new Vector3(hx * sinT, Math.sqrt(1 - sinT * sinT), hz * sinT);
  const waves = createWaves({ windDir: 0.9, depth: 0.1, seed: 11 });
  waves.uniforms.uWaveGain.value = 0.55;
  const uTime: IUniform<number> = { value: 0 };
  const caustics: Record<string, IUniform> = {
    uTime, uSunUp: { value: 1 }, uSunDirT: { value: sunT }, uCausticGain: { value: 2.6 }, ...(waves.uniforms as unknown as Record<string, IUniform>),
  };
  setTobihazeEnvironment(caustics);
  const uWater: IUniform<number> = { value: tide };

  // ground: procedural mud (tiled albedo + relief), darker and glossier toward the water, caustics where covered
  const tex = mudTextures();
  const groundGeo = new PlaneGeometry(26, 26, 416, 416);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, 0, 1.5);
  const gp = groundGeo.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setY(i, h(gp.getX(i), gp.getZ(i)));
  groundGeo.computeVertexNormals();
  const groundMat = new MeshStandardMaterial({ map: tex.albedo, normalMap: tex.normal, roughness: 1, metalness: 0 });
  groundMat.normalScale.set(1.2, 1.2);
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, caustics, { uWater });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      // tile the textures in world space (0.5 m)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position, 1.0)).xz * 2.0;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv = (modelMatrix * vec4(position, 1.0)).xz * 2.0;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW;
uniform float uWater, uTime, uSunUp, uCausticGain;
uniform vec3 uSunDirT;
${WAVES_GLSL}
float gWet, gDepth;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // break the tiling with a slow world-space variation
    float v = vnoiseWv(vGW.xz * 0.9) * 0.6 + vnoiseWv(vGW.xz * 3.1) * 0.4;
    diffuseColor.rgb *= 0.86 + 0.28 * v;
    gDepth = uWater - vGW.y;
    // wet within a few cm above the water (the film the ebb leaves), darker and slick; dry mud is pale and matte
    gWet = 1.0 - smoothstep(0.004, 0.09, -gDepth);
    diffuseColor.rgb *= mix(1.0, 0.62, gWet);
    if (gDepth > 0.0) {
      vec3 L = normalize(uSunDirT);
      float fp = length(fwidth(vGW));
      float c = waveCaustic(vGW.xz, L, gDepth / max(L.y, 0.2), uTime, fp, uCausticGain);
      diffuseColor.rgb *= mix(1.0, c, smoothstep(0.0, 0.01, gDepth) * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.15, 0.11), 1.0 - exp(-gDepth * 9.0));
    }
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.86, 0.16, gWet);`);
  };
  const ground = new Mesh(groundGeo, groundMat);
  scene.add(ground);

  // water: one sheet at the tide level; ripples from the wave set and from the fish; clear where shallow, more
  // opaque (and more reflective at a glancing view) where deep
  const N_RIP = 12;
  const uRip: IUniform<Vector4[]> = { value: Array.from({ length: N_RIP }, () => new Vector4(0, 0, -1e4, 0)) };
  const waterMat = new MeshPhysicalMaterial({ color: 0x55604a, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false, ior: 1.333, specularIntensity: 1 });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, caustics, { uWater, uRip });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWW;
uniform float uWater, uTime;
uniform vec4 uRip[${N_RIP}];
${WAVES_GLSL}
${H_GLSL}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float fp = max(length(fwidth(vWW.xz)), 0.0015);
    vec3 g = waveGrad(vWW.xz, uTime, fp * 4.0);
    for (int i = 0; i < ${N_RIP}; i++) {
      vec4 R = uRip[i];
      float age = uTime - R.z;
      if (age < 0.0 || age > 2.5) continue;
      vec2 d = vWW.xz - R.xy;
      float r = length(d) + 1e-5;
      float front = 0.012 + 0.23 * age;
      float x = (r - front) / (0.012 + 0.02 * age);
      float env = exp(-x * x) * R.w * exp(-age * 1.6) / (1.0 + 18.0 * front);
      g.yz += d / r * env * cos(x * 3.2) * 0.55;
    }
    vec3 nW = normalize(vec3(-g.y, 1.0, -g.z));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
    float depth = uWater - flatH(vWW.xz);
    float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
    float body = 1.0 - exp(-max(depth, 0.0) * 22.0);
    diffuseColor.a = smoothstep(0.0, 0.003, depth) * clamp(0.18 + 0.6 * body + 0.7 * fres, 0.0, 0.94);
  }`);
  };
  const water = new Mesh(new PlaneGeometry(40, 40), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.z = 6;
  water.renderOrder = 3;
  scene.add(water);
  let ripK = 0;
  const addRipple = (x: number, z: number, s: number) => { uRip.value[ripK].set(x, z, uTime.value, Math.min(1.5, s)); ripK = (ripK + 1) % N_RIP; };

  const sample = (x: number, z: number): HabitatSample => {
    const g = h(x, z), depth = tide - g;
    return { depth, substrate: 'mud', exposed: depth <= 0, wetness: depth > 0 ? 1 : Math.exp(-Math.max(0, -depth) / 0.08), distToWater: Math.max(0, -depth / 0.045), inPool: false, tags: [], waterLevel: tide, groundHeight: g };
  };
  const normalAt = (x: number, z: number, out = new Vector3()) => { const e = 0.01; return out.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); };
  const terrainStub = { heightAt: h, inside: (x: number, z: number) => Math.abs(x) < 7 && z > -6 && z < 9, substrateAt: () => 'mud', normalAt } as unknown as Terrain;
  const habitatStub = { depthAt: (x: number, z: number) => tide - h(x, z) } as unknown as Habitat;
  const fx = new MudFx(scene);
  fx.groundAt = h;
  fx.ripples = { addRipple };
  const burrows = new BurrowField(terrainStub, habitatStub, scene);
  // neighbours' burrows along the upper edge of the wet zone
  [[-0.9, -0.7], [0.4, -1.1], [1.3, -0.5], [-1.6, -0.2], [-0.3, -1.6]].forEach(([x, z], k) => { burrows.homeFor(`n${k}`, x, z, 31 + k); burrows.release(`n${k}`); });

  const camera = new PerspectiveCamera(40, 1, 0.005, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.07;
  controls.maxDistance = 4;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false;
  const resize = () => {
    const w = canvas.clientWidth || innerWidth, ht = canvas.clientHeight || innerHeight;
    renderer.setSize(w, ht, false);
    camera.aspect = w / ht;
    // centre the fish in the part of the view the panels leave open (the label only counts when it spans the middle)
    const lab = document.querySelector('.label')?.getBoundingClientRect();
    const ctl = document.querySelector('.controls')?.getBoundingClientRect();
    const top = lab && lab.width > w * 0.5 ? lab.bottom : 0;
    const bottom = ctl ? ctl.top : ht;
    const shift = Math.max(0, Math.min(ht * 0.3, ht / 2 - (top + bottom) / 2));
    camera.setViewOffset(w, ht, 0, shift, w, ht);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  document.querySelectorAll('.label, .controls').forEach((e) => ro.observe(e));
  resize();

  // the animal
  const start = { x: -0.15, z: -0.45, heading: 0.35 };
  const ind: Individual = {
    id: 'periophthalmus_modestus#showcase', species, pos: new Vector3(start.x, 0, start.z), home: new Vector3(start.x, 0, start.z), heading: start.heading,
    length_mm: 80, weight_g: 5, sex: 'm', stage: 'adult', traits: [], lengthPct: 50, alert: 0, energy: 0.5, lod: 0,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' }, rng: new Rng(23),
    cell: 0, ruleIndex: 0, mismatchSince: 0, spawnedAt: 0, strandedSince: 0,
  };
  const driver = new TobihazeDriver();
  const motor = () => (driver as unknown as { motor: Motor | null }).motor;
  const ctx = { floor: { heightAt: h, waterAt: () => tide, sampleAt: sample }, player: camera.position, simScale: 1, nowMs: 0, locked: true, world: { fx, burrows, sunUp: 0.85 } };

  // the model: a GLB, or (where .glb is not served) the same bytes as base64 text. Textures are decoded through image
  // elements rather than fetch() of blob URLs, which a sandboxed viewer may refuse
  const modelUrl = canvas.dataset.model ?? 'tobihaze.glb';
  const loader = new GLTFLoader();
  loader.register((parser) => {
    (parser as unknown as { textureLoader: TextureLoader }).textureLoader = new TextureLoader(parser.options.manager);
    return { name: 'showcase_image_elements' };
  });
  const progress = (f: number) => { if (loading) loading.textContent = `モデルを読み込み中… ${Math.round(f * 100)} %`; };
  const fail = () => { if (loading) loading.textContent = 'モデルを読み込めませんでした。ページを再読み込みしてください。'; };
  const onModel = (gltf: GLTF) => {
    const root = gltf.scene;
    const bones: Record<string, Bone> = {};
    const meshes: Mesh[] = [];
    root.traverse((o: Object3D) => {
      if ((o as Bone).isBone) bones[o.name] = o as Bone;
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    const extras = (root.children.find((c) => c.userData && Object.keys(c.userData).length)?.userData ?? root.userData) as Record<string, unknown>;
    scene.add(root);
    const tier = modelUrl.includes('hero') ? 'hero' : modelUrl.includes('lod2') ? 'lod2' : 'lod1';
    driver.attach(root, ind, extras, bones, meshes, { tier, parser: gltf.parser });
    for (const m of meshes) if ((m as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    driver.onEvent((e) => logEvent(e.behaviorId));
    driver.update(1 / 60, ctx as never);
    setView('oblique', true);
    loading?.setAttribute('hidden', '');
    document.body.classList.add('ready');
  };
  if (/\.txt$/.test(modelUrl)) {
    fetchBase64(modelUrl, progress).then((buf) => loader.parse(buf, '', onModel, fail)).catch(fail);
  } else {
    loader.load(modelUrl, onModel, (p) => { if (p.total) progress(p.loaded / p.total); }, fail);
  }

  // ---------------------------------------------------------------------------------------------- intents
  let nextId = 1;
  let simT = 0;
  let lastUser = -1e9;
  const send = (kind: Intent['kind'], extra: Partial<Intent> = {}) => driver.setIntent({ id: nextId++, kind, urgency: 0.4, seconds: 10, ...extra });
  const rng = new Rng(97);
  const around = (m: Motor, score: (x: number, z: number) => number, rMin: number, rMax: number, n = 14) => {
    let best: Vector3 | null = null, bs = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(rMin, rMax);
      const x = m.pos.x + Math.sin(a) * r, z = m.pos.z + Math.cos(a) * r;
      if (!terrainStub.inside(x, z, 0)) continue;
      const s = score(x, z);
      if (s > bs) { bs = s; best = new Vector3(x, 0, z); }
    }
    return best;
  };
  // a mudskipper's ground: wet mud just above the water, soft and near home
  const groundScore = (x: number, z: number) => { const above = h(x, z) - tide; return above < 0.002 ? -1 - above * 10 : Math.exp(-above / 0.035) + rng.range(0, 0.35) - 0.15 * Math.hypot(x - ind.home.x, z - ind.home.z); };
  const waterScore = (x: number, z: number) => { const d = tide - h(x, z); return d < 0.025 ? -1 : -Math.abs(d - 0.04) * 20 + rng.range(0, 0.2); };
  const actions: Record<string, () => void> = {
    crawl: () => { const m = motor(); if (!m) return; const t = around(m, groundScore, 0.35, 0.9); if (t) send('moveTo', { target: t, urgency: 0.35, seconds: 25 }); },
    forage: () => { const m = motor(); if (m && m.medium === 'water') actions.exit(); else send('forage', { seconds: 22 }); },
    flee: () => { const m = motor(); if (!m) return; ind.alert = 1; send('flee', { from: new Vector3(camera.position.x, 0, camera.position.z), urgency: 1, seconds: 6 }); },
    water: () => { const m = motor(); if (!m) return; const t = around(m, waterScore, 0.3, 1.6, 24); if (t) send('moveTo', { target: t, urgency: 0.35, seconds: 30 }); },
    exit: () => { const m = motor(); if (!m) return; const t = around(m, (x, z) => { const a = h(x, z) - tide; return a < 0.006 ? -1 : -Math.abs(a - 0.015) * 30 - Math.hypot(x - m.pos.x, z - m.pos.z) * 0.6; }, 0.15, 1.6, 30); if (t) send('moveTo', { target: t, urgency: 0.35, seconds: 30 }); },
    burrow: () => send('burrow', { seconds: 8 + rng.range(0, 6) }),
    rewet: () => send('special', { param: 'rewet', seconds: 3 }),
    display: () => send('display', { param: 'display', seconds: 5 }),
    rest: () => send('rest', { seconds: 5 + rng.range(0, 6) }),
  };
  // the autopilot: what a mudskipper does with its low tide when nobody tells it otherwise
  const autopilot = () => {
    const m = motor();
    if (!auto || !m || driver.busy || simT - lastUser < 2.5) return;
    if (m.moisture < 0.35 && m.medium === 'land') { actions.rewet(); return; }
    if (m.medium === 'water') { (rng.next() < 0.7 ? actions.exit : actions.rest)(); return; }
    const r = rng.next();
    if (r < 0.26) actions.rest();
    else if (r < 0.58) actions.forage();
    else if (r < 0.82) actions.crawl();
    else if (r < 0.88) actions.water();
    else if (r < 0.94) actions.display();
    else actions.burrow();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = actions[b.dataset.act ?? ''];
    if (!a) return;
    lastUser = simT;
    a();
  }));

  // tap the mud (without dragging) to startle the fish from that spot
  const ray = new Raycaster();
  const down = new Vector2();
  const ringMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const ring = new Mesh(new RingGeometry(0.85, 1, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 6;
  scene.add(ring);
  let ringT = 9;
  canvas.addEventListener('pointerdown', (e) => down.set(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(ground, false)[0];
    const m = motor();
    if (!hit || !m) return;
    const p = hit.point;
    ring.position.set(p.x, Math.max(p.y, tide) + 0.0015, p.z);
    ringT = 0;
    if (tide > h(p.x, p.z)) addRipple(p.x, p.z, 1.2);
    lastUser = simT;
    ind.alert = 1;
    send('flee', { from: new Vector3(p.x, 0, p.z), urgency: 1, seconds: 6 });
  });

  const tideIn = $<HTMLInputElement>('tide');
  const tideOut = $('tide-val');
  const setTide = () => { tide = Number(tideIn?.value ?? 0) / 100; uWater.value = tide; water.position.y = tide; if (tideOut) tideOut.textContent = `${tide >= 0 ? '+' : ''}${(tide * 100).toFixed(1)} cm`; };
  tideIn?.addEventListener('input', setTide);
  setTide();
  const autoIn = $<HTMLInputElement>('auto');
  autoIn?.addEventListener('change', () => { auto = !!autoIn.checked; });
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speedMul = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));

  // ---------------------------------------------------------------------------------------------- camera
  const target = new Vector3();
  const VIEWS: Record<string, [number, number, number, number]> = {
    // offset (fish's left, up, forward) and distance
    oblique: [0.7, 0.42, 0.6, 0.2], side: [1, 0.14, 0.05, 0.2], front: [0.06, 0.16, 1, 0.14], top: [0.02, 1, 0.12, 0.3], low: [0.75, 0.04, 0.45, 0.17],
  };
  function setView(name: string, snap = false): void {
    const m = motor();
    const v = VIEWS[name];
    if (!m || !v) return;
    const a = driver.anchor();
    const f = new Vector3(Math.sin(m.heading), 0, Math.cos(m.heading)), l = new Vector3(Math.cos(m.heading), 0, -Math.sin(m.heading));
    const d = l.multiplyScalar(v[0]).add(f.multiplyScalar(v[2])).setY(v[1]).normalize().multiplyScalar(v[3]);
    if (snap) target.copy(a);
    controls.target.copy(target);
    camera.position.copy(target).add(d);
    controls.update();
    document.querySelectorAll('[data-view]').forEach((o) => o.setAttribute('aria-pressed', String((o as HTMLElement).dataset.view === name)));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view ?? 'oblique')));

  // ---------------------------------------------------------------------------------------------- readout
  const logEl = $('log');
  const log: { t: number; id: string; n: number }[] = [];
  function logEvent(id: string): void {
    const last = log[0];
    if (last && last.id === id && simT - last.t < 8) { last.n++; last.t = simT; } else log.unshift({ t: simT, id, n: 1 });
    log.length = Math.min(log.length, 6);
    if (logEl) logEl.innerHTML = log.map((e) => `<li><span class="t">${fmtT(e.t)}</span>${BEHAVIOR_JA.get(e.id) ?? e.id}${e.n > 1 ? ` <span class="n">×${e.n}</span>` : ''}</li>`).join('');
  }
  const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const el = { code: $('st-code'), ja: $('st-ja'), depth: $('v-depth'), moist: $('v-moist'), moistBar: $('b-moist'), mud: $('v-mud'), speed: $('v-speed'), clock: $('v-clock') };
  const lastPos = new Vector3();
  let spd = 0, hudAcc = 0;
  function hud(dt: number): void {
    const m = motor();
    if (!m) return;
    spd += ((m.pos.distanceTo(lastPos) / Math.max(dt, 1e-3)) / m.L - spd) * Math.min(1, dt * 3);
    lastPos.copy(m.pos);
    hudAcc += dt;
    if (hudAcc < 0.15) return;
    hudAcc = 0;
    const st = driver.state as TobiState;
    if (el.code) el.code.textContent = st;
    if (el.ja) el.ja.textContent = STATE_JA[st] ?? '';
    if (el.depth) el.depth.textContent = m.depth >= 0 ? `水深 ${(m.depth * 1000).toFixed(0)} mm` : `水面上 ${(-m.depth * 1000).toFixed(0)} mm`;
    if (el.moist) el.moist.textContent = `${Math.round(m.moisture * 100)} %`;
    if (el.moistBar) el.moistBar.style.transform = `scaleX(${m.moisture.toFixed(3)})`;
    if (el.mud) el.mud.textContent = `${Math.round(m.mud * 100)} %`;
    if (el.speed) el.speed.textContent = `${spd.toFixed(2)} TL/s`;
    if (el.clock) el.clock.textContent = fmtT(simT);
  }

  // ---------------------------------------------------------------------------------------------- loop
  const DT = 1 / 60;
  let acc = 0, last = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepSim = () => {
    simT += DT;
    ctx.nowMs = simT * 1000;
    ind.alert = Math.max(0, ind.alert - DT * 0.25);
    autopilot();
    driver.update(DT, ctx as never);
  };
  // for automated checks on slow (software) renderers: run the simulation ahead without drawing
  (window as unknown as { __showcase: unknown }).__showcase = {
    advance(sec: number): void {
      for (let i = 0; i < Math.round(sec / DT); i++) { stepSim(); uTime.value += DT; fx.update(DT, camera.fov, canvas.clientHeight || innerHeight); }
      const d = driver.anchor().clone().sub(target);
      target.add(d); controls.target.add(d); camera.position.add(d);
    },
    act(name: string): void { lastUser = simT; actions[name]?.(); },
    get debug() { return { ...driver.debug, t: simT }; },
  };
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const m = motor();
    if (m) {
      acc += dt * speedMul;
      let n = 0;
      while (acc >= DT && n++ < 8) { stepSim(); acc -= DT; }
      // the orbit follows the fish
      const a = driver.anchor();
      const delta = a.clone().sub(target).multiplyScalar(reduced ? 1 : Math.min(1, dt * 6));
      target.add(delta);
      controls.target.add(delta);
      camera.position.add(delta);
      hud(dt);
    }
    uTime.value += dt * speedMul;
    if (ringT < 1) { ringT += dt * 1.6; const s = 0.02 + 0.12 * ringT; ring.scale.setScalar(s); ringMat.opacity = 0.7 * (1 - ringT); } else ringMat.opacity = 0;
    controls.update();
    fx.update(dt * speedMul, camera.fov, canvas.clientHeight || innerHeight);
    burrows.update(camera.position);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(tick);
}

/** Bytes from a base64 text file, with download progress (0–1) when the size is known. */
async function fetchBase64(url: string, onProgress: (f: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(Math.min(1, got / total));
  }
  let text = '';
  const dec = new TextDecoder();
  for (const p of parts) text += dec.decode(p, { stream: true });
  text += dec.decode();
  const bin = atob(text.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Tiled mud (0.5 m): silty grey-brown with fine grain, crab pellets and pits, shell grit; relief as a normal map. */
function mudTextures(): { albedo: CanvasTexture; normal: CanvasTexture } {
  const N = 512;
  const hgt = new Float32Array(N * N);
  const col = new Float32Array(N * N * 3);
  const rnd = new Rng(5);
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = (a: number) => ((a % p) + p) % p;
    const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N;
    let n = 0, amp = 0.5, f = 8, tot = 0;
    for (let o = 0; o < 5; o++) { n += amp * vnoise(x * f, y * f, f); tot += amp; amp *= 0.5; f *= 2; }
    n /= tot;
    const grain = vnoise(x * 256, y * 256, 256);
    const k = j * N + i;
    hgt[k] = n * 0.6 + grain * 0.12;
    const t = 0.92 + 0.16 * (n - 0.5) + 0.06 * (grain - 0.5);
    col[k * 3] = 0.155 * t; col[k * 3 + 1] = 0.142 * t; col[k * 3 + 2] = 0.118 * t;
  }
  // pits (crab and worm holes) and pellets (sediment balls), wrapped around the tile edges
  const stamp = (cx: number, cy: number, r: number, dh: number, dc: number) => {
    const R = Math.ceil(r * 2);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 > 4) continue;
      const k = (((cy + dy) % N + N) % N) * N + (((cx + dx) % N + N) % N);
      const f = Math.exp(-d2 * 1.6);
      hgt[k] += dh * f;
      col[k * 3] *= 1 + dc * f; col[k * 3 + 1] *= 1 + dc * f; col[k * 3 + 2] *= 1 + dc * f;
    }
  };
  for (let k = 0; k < 160; k++) stamp(rnd.int(0, N - 1), rnd.int(0, N - 1), rnd.range(1.2, 3.2), -0.5, -0.45);
  for (let k = 0; k < 700; k++) stamp(rnd.int(0, N - 1), rnd.int(0, N - 1), rnd.range(0.7, 1.6), 0.35, 0.12);
  for (let k = 0; k < 140; k++) stamp(rnd.int(0, N - 1), rnd.int(0, N - 1), rnd.range(0.4, 0.8), 0.05, 0.3);
  const mk = (fill: (img: ImageData) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    fill(img);
    g.putImageData(img, 0, 0);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const albedo = mk((img) => { for (let k = 0; k < N * N; k++) { img.data[k * 4] = Math.min(255, Math.pow(col[k * 3], 1 / 2.2) * 255); img.data[k * 4 + 1] = Math.min(255, Math.pow(col[k * 3 + 1], 1 / 2.2) * 255); img.data[k * 4 + 2] = Math.min(255, Math.pow(col[k * 3 + 2], 1 / 2.2) * 255); img.data[k * 4 + 3] = 255; } });
  albedo.colorSpace = SRGBColorSpace;
  const normal = mk((img) => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const at = (a: number, b: number) => hgt[(((b % N) + N) % N) * N + (((a % N) + N) % N)];
      const dx = (at(i + 1, j) - at(i - 1, j)) * 3, dy = (at(i, j + 1) - at(i, j - 1)) * 3;
      const l = Math.hypot(dx, dy, 1);
      const k = (j * N + i) * 4;
      img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
  });
  return { albedo, normal };
}

boot();
