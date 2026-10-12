import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CORAL_IDS,
  CORAL_INFO,
  CORAL_WATER,
  coralSpec,
  CoralKit,
  OkinawaCoral,
  CoralReef,
} from '../../src/world/coral/index.ts';
import { Terrain } from '../../src/world/Terrain.ts';
import { Habitat } from '../../src/world/Habitat.ts';
import { WaterPass } from '../../src/world/Water.ts';
import { createWaves } from '../../src/world/Waves.ts';
import { surfUniforms } from '../../src/world/Surf.ts';
import { SkyDome } from '../../src/world/Sky.ts';
import { FieldRenderer } from '../../src/render/FieldRenderer.ts';
import { QUALITY_PRESETS } from '../../src/core/Settings.ts';
import { reflectInWater, LAYER_MIRROR } from '../../src/render/Mirror.ts';
const capture = new URLSearchParams(location.search).has('capture');
if (capture) document.body.classList.add('capture');
const canvas = document.querySelector('#view'),
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.012, 350),
  controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
const size = 70,
  n = 281,
  heights = new Float32Array(n * n),
  substrate = new Uint8Array(n * n);
for (let z = 0; z < n; z++)
  for (let x = 0; x < n; x++) {
    const xx = (x / (n - 1) - 0.5) * size,
      zz = (z / (n - 1) - 0.5) * size;
    const lane = Math.abs(xx - (10 + 2 * Math.sin(zz * 0.1))) < 2.5;
    // Broad consolidated reef mounds, with lower white-sand runnels between them.
    const reefRelief =
      0.11 * Math.sin(xx * 0.46 + Math.sin(zz * 0.31)) * Math.sin(zz * 0.38) +
      0.022 * Math.sin(xx * 2.4 + zz * 1.3) * Math.cos(zz * 2.1 - xx * 1.1);
    heights[z * n + x] =
      -2.85 + zz * 0.009 + 0.12 * Math.sin(xx * 0.11) * Math.sin(zz * 0.14) + (lane ? -0.06 : reefRelief);
    substrate[z * n + x] = lane ? 0 : 5;
  }
const terrain = new Terrain({ n, size, heights, substrate }, [
  'sand',
  'muddy_sand',
  'mud',
  'gravel',
  'channel',
  'rock',
]);
terrain.setSandTint(1.2, 1.15, 1.03);
terrain.setReefBottom(true);
terrain.setSediment(0.2, 0);
terrain.setLandLevel(4, 5);
scene.add(terrain.mesh);
const habitat = new Habitat(terrain, 2);
terrain.setSpill(habitat.poolLevels);
const waves = createWaves({ seed: 71, windDir: 0.8, depth: 2.5 });
terrain.setWaves(waves);
const surf = surfUniforms(null);
terrain.setSurf(surf);
const water = new WaterPass(terrain, waves, surf);
water.setBody(...CORAL_WATER.color, CORAL_WATER.turbidity, { absorption: CORAL_WATER.absorption });
water.setMirror(0);
const sky = new SkyDome(scene, renderer, true, 2048, {
  cloudCoverage: 0.12,
  turbidity: 1.8,
  rayleigh: 1.5,
  sunGain: 1.15,
  sunColor: [1, 0.98, 0.94],
  hemiSky: [0.55, 0.7, 0.8],
  hemiGround: [0.27, 0.25, 0.19],
});
const sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
sky.update(sunDir, 56, new THREE.Vector3(), 0);
sky.refreshEnvironment();
// Keep the shallow-water inspection area sharp enough to resolve contact and inter-branch shadows.
Object.assign(sky.sunLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
sky.sunLight.shadow.camera.updateProjectionMatrix();
sky.sunLight.shadow.normalBias = 0.0025;
sky.sunLight.shadow.bias = -0.00003;
reflectInWater(sky.sky);
reflectInWater(sky.sunLight);
reflectInWater(sky.hemi);
scene.add(terrain.mirrorProxy(LAYER_MIRROR));
const field = new FieldRenderer(renderer);
field.setQuality(QUALITY_PRESETS.high);
let kit = null,
  reef = null,
  models = [],
  config = { mode: 'single', species: CORAL_IDS[0], seed: 7123, lod: 'auto', water: true, quality: 'high' },
  frames = 0;
function disposeModels() {
  for (const m of models) {
    m.removeFromParent();
    m.dispose();
  }
  models = [];
  kit?.dispose();
  kit = null;
  reef?.group.removeFromParent();
  reef?.dispose();
  reef = null;
}
function rebuild() {
  disposeModels();
  if (config.mode === 'reef') {
    reef = new CoralReef(terrain, {
      seed: config.seed,
      waterLevel: 0,
      lowWater: -0.65,
      clusters: [
        { x: -17, z: -15, radius: 13, count: 70, exposure: 0.8 },
        { x: -18, z: 15, radius: 13, count: 70, exposure: 0.4 },
        { x: 23, z: -16, radius: 9, count: 45, exposure: 0.6 },
        { x: 23, z: 15, radius: 9, count: 45, exposure: 0.2 },
        { x: 0, z: 0, radius: 10, count: 40, exposure: 0.7 },
      ],
    });
    scene.add(reef.group);
  } else {
    kit = new CoralKit();
    let count = config.mode === 'five' ? 5 : config.mode === 'variants' ? 4 : 1;
    for (let i = 0; i < count; i++) {
      const s = coralSpec(config.seed, i, config.mode === 'five' ? CORAL_IDS[i] : config.species);
      s.yaw = 0.16;
      s.scale = 1;
      s.damageAmount = 0.015;
      s.algaeAmount = 0.015;
      s.growthDirection = [0.02, -0.02];
      if (config.mode === 'five') {
        s.x = (i - 2) * 2.5;
        s.variant = 1;
      }
      if (config.mode === 'variants') {
        s.variant = i;
        s.x = (i - 1.5) * 2.6;
      }
      const m = new OkinawaCoral(kit, s, terrain);
      models.push(m);
      scene.add(reflectInWater(m));
    }
  }
}
function pose() {
  const y = terrain.heightAt(0, 0);
  if (config.mode === 'reef') {
    camera.position.set(4, -1.55, 9);
    controls.target.set(-5, -1.9, -2);
  } else if (config.mode === 'five' || config.mode === 'variants') {
    camera.position.set(0, y + 2.5, 9.8);
    controls.target.set(0, y + 0.48, 0);
  } else if (config.mode === 'macro') {
    // Inspect a real surface patch at 20 cm, rather than photographing a whole metre of
    // a massive colony and expecting 1 mm corallites to remain visible at that scale.
    const mesh = models[0].levels[0];
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh),
      centre = box.getCenter(new THREE.Vector3()),
      span = box.getSize(new THREE.Vector3()).length(),
      from = centre.clone().add(new THREE.Vector3(0.15, 0.3, 1).multiplyScalar(span));
    const ray = new THREE.Raycaster(from, centre.clone().sub(from).normalize());
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit) {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(hit.instanceId ?? 0, matrix);
      matrix.premultiply(mesh.matrixWorld);
      const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
      const distance =
        config.species === 'porites_lobata' || config.species === 'montipora_foliosa' ? 0.1 : 0.2;
      camera.position.copy(hit.point).addScaledVector(normal, distance);
      controls.target.copy(hit.point);
    } else {
      camera.position.copy(from);
      controls.target.copy(centre);
    }
  } else {
    const box = new THREE.Box3().setFromObject(models[0]),
      centre = box.getCenter(new THREE.Vector3()),
      extent = box.getSize(new THREE.Vector3()),
      distance =
        Math.max(extent.y * 1.25, extent.x * 0.85, extent.z * 0.85) /
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(centre).add(new THREE.Vector3(0.5, 0.43, 0.84).normalize().multiplyScalar(distance));
    controls.target.copy(centre);
  }
  controls.update();
}
function update(dt) {
  const level = config.water ? 0 : -100;
  terrain.updateLod(camera.position.x, camera.position.z);
  water.setLevel(level);
  terrain.setWater(level, level, 2, 1, sunDir);
  water.update(dt, {
    sunUp: 1,
    sunDir,
    sunCol: sky.sunColorHdr(new THREE.Vector3()),
    ambient: 0.85,
    fogColor: new THREE.Color(0.55, 0.72, 0.8),
    fogDensity: 0.001,
    env: sky.envCube,
    day: 1,
  });
  if (kit) {
    kit.light.water.value = level;
    kit.light.time.value = 2;
    kit.light.sun.value.copy(sunDir);
    models.forEach((m) => m.setLod(config.lod === 'auto' ? 0 : Number(config.lod)));
  }
  if (reef) {
    reef.update(dt, camera, { tideLevel: level, sunDir });
  }
}
function info() {
  return {
    config,
    colonies: reef?.specs.length ?? models.length,
    triangles:
      reef?.stats.triangles ??
      models.reduce(
        (sum, m) =>
          sum + m.levels.filter((x) => x.visible).reduce((n, x) => n + x.geometry.index.count / 3, 0),
        0,
      ),
    calls: reef?.stats.calls ?? models.length,
    resources: reef?.kit.stats ?? kit?.stats,
    reef: reef?.stats ?? null,
    render: field.lastStats,
    terrain: terrain.chunkStats,
    frames,
  };
}
function render() {
  update(0);
  field.render(scene, camera, water);
  frames++;
  document.querySelector('#stats').textContent = JSON.stringify(info(), null, 2);
}
async function set(patch) {
  const old = config;
  config = { ...config, ...patch };
  if (
    (!kit && !reef) ||
    old.mode !== config.mode ||
    old.species !== config.species ||
    old.seed !== config.seed
  ) {
    rebuild();
    pose();
  }
  if (patch.cam) camera.position.fromArray(patch.cam);
  if (patch.target) controls.target.fromArray(patch.target);
  controls.update();
  renderer.shadowMap.enabled = config.quality === 'high' || config.quality === 'mid';
  field.setQuality(QUALITY_PRESETS[config.quality]);
  reef?.setQuality(config.quality);
  reef?.setLod(config.lod === 'auto' ? null : Number(config.lod));
  update(0);
  await field.compile(scene, camera, water);
  render();
  return info();
}
const species = document.querySelector('#species');
CORAL_IDS.forEach((id) => {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = CORAL_INFO[id].name;
  species.append(o);
});
for (const key of ['mode', 'species', 'lod', 'quality', 'water', 'seed'])
  document.querySelector('#' + key).addEventListener('change', (e) =>
    set({
      [key]: key === 'water' ? e.target.checked : key === 'seed' ? Number(e.target.value) : e.target.value,
    }),
  );
document.querySelector('#random').onclick = () => {
  const seed = config.seed + 17;
  document.querySelector('#seed').value = seed;
  void set({ seed });
};
controls.addEventListener('change', () => {
  if (kit || reef) render();
});
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  render();
});
await set({});
window.__coral = {
  set,
  info,
  render,
  renderer,
  scene,
  camera,
  terrain,
  field,
  water,
  get kit() {
    return kit ?? reef?.kit;
  },
  get reef() {
    return reef;
  },
};
if (!capture) {
  renderer.setAnimationLoop(() => {
    update(0.016);
    field.render(scene, camera, water);
    frames++;
  });
}
