/**
 * なぎさ干潟 — a fictional tidal flat after 葛西海浜公園, 300 × 300 m to walk on, no people and no creatures:
 * sand and mud, ripple marks that never repeat, tide pools and creeks, さざ波 on every water surface, a hazy bay
 * sky. Everything is generated from one seed (URL ?seed=) in a worker at load.
 *
 * URL: seed, tide (m T.P.), time (hours JST), date (YYYY-MM-DD), cover, cirrus, haze, wind, q (low|mid|high|ultra),
 *      cam=x,z,yawDeg,pitchDeg[,eye], exposure, curve (0 AgX, 1 ACES), ui=0
 */
import {
  DepthTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, PerspectiveCamera, RGBAFormat, Scene, Vector2, Vector3,
  WebGLRenderer, WebGLRenderTarget, type IUniform, type Texture,
} from 'three';
import { FlatField } from './FlatField';
import type { FlatData } from './gen/generate';
import type { WaterState } from './gen/water';
import { Sky } from './render/Sky';
import { TerrainRenderer } from './render/Terrain';
import { WaterPass } from './render/Water';
import { Post } from './render/Post';
import { Scenery } from './render/Scenery';
import { Debris } from './render/Debris';
import { TAA } from './render/TAA';
import { SunShadow, SHADOW_LAYER } from './render/Shadow';
import { createWaves } from './render/glsl/waves';
import { makeNoiseTexture } from './render/glsl/common';
import { Walker } from './Walker';
import { sunPosition, sunDirection } from '../world/Sun';
import { buildUI, type FlatUI } from './ui';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) && params.get(k) !== '' && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);

type Quality = 'low' | 'mid' | 'high' | 'ultra';
const QUALITY: Record<Quality, { dpr: number; msaa: number; detail: number; ssr: boolean; bloom: number; lod: number }> = {
  low: { dpr: 0.75, msaa: 0, detail: 0, ssr: false, bloom: 4, lod: 10 },
  mid: { dpr: 1, msaa: 4, detail: 1, ssr: true, bloom: 5, lod: 14 },
  high: { dpr: 1.5, msaa: 4, detail: 1, ssr: true, bloom: 6, lod: 20 },
  ultra: { dpr: 2, msaa: 4, detail: 1, ssr: true, bloom: 6, lod: 24 },
};

export interface FlatState {
  seed: number;
  tide: number;
  hour: number;
  date: string;
  cover: number;
  cirrus: number;
  haze: number;
  wind: number;
  exposure: number;
  autoExposure: boolean;
  curve: number;
  quality: Quality;
}

const state: FlatState = {
  seed: num('seed', 20261002) >>> 0,
  tide: num('tide', -0.42),
  hour: num('time', 13.6),
  date: params.get('date') ?? '2026-04-18',
  cover: num('cover', 0.66),
  cirrus: num('cirrus', 0.3),
  haze: num('haze', 42),
  wind: num('wind', 1.0),
  exposure: num('exposure', 1),
  autoExposure: !params.has('exposure'),
  curve: num('curve', 1),
  quality: (['low', 'mid', 'high', 'ultra'].includes(params.get('q') ?? '') ? params.get('q') : 'high') as Quality,
};

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const ui: FlatUI = buildUI(uiRoot, state, params.get('ui') !== '0');

function fail(msg: string): never {
  ui.error(msg);
  throw new Error(msg);
}

const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) fail('WebGL2 と浮動小数点レンダーターゲット（EXT_color_buffer_float）に対応したブラウザが必要です。');
renderer.autoClear = true;

const camera = new PerspectiveCamera(62, 1, 0.04, 12000);
const scene = new Scene();
const noise = { value: makeNoiseTexture(77) as Texture };
const shared = { uNoise: noise as IUniform<Texture>, uTime: { value: 0 }, uEnv: { value: null as Texture | null } };

// ---------------------------------------------------------------------------------- render targets
let sceneRT: WebGLRenderTarget | null = null;
let waterRT: WebGLRenderTarget | null = null;
const post = new Post(renderer, QUALITY[state.quality].bloom);
let taa: TAA | null = null;
const useTAA = params.get('taa') !== '0';
const size = new Vector2();
function resize(): void {
  const q = QUALITY[state.quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr) * num('scale', 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.getDrawingBufferSize(size);
  const w = Math.max(1, size.x), h = Math.max(1, size.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sceneRT?.dispose();
  waterRT?.dispose();
  sceneRT = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, samples: q.msaa, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter });
  const depth = new DepthTexture(w, h, FloatType);
  depth.minFilter = NearestFilter;
  depth.magFilter = NearestFilter;
  sceneRT.depthTexture = depth;
  waterRT = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  post.setSize(w, h);
  if (useTAA) { if (taa) taa.setSize(w, h); else taa = new TAA(renderer, w, h); }
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------------- sun and sky
const sunDir = new Vector3(0.3, 0.8, 0.4).normalize();
function sunFor(st: FlatState): Vector3 {
  const [y, m, d] = st.date.split('-').map(Number);
  const ms = Date.UTC(y || 2026, (m || 4) - 1, d || 18, 0, 0) + (st.hour - 9) * 3600000;
  const sp = sunPosition(ms, 35.636, 139.858);
  return sunDirection(sp, new Vector3());
}
sunDir.copy(sunFor(state));
const sky = new Sky(renderer, noise as IUniform<Texture>, { sunDir, haze: state.haze, cover: state.cover, cirrus: state.cirrus });
scene.add(sky.background);
sky.background.renderOrder = 1000;   // after the ground: early depth test skips the covered pixels

// ---------------------------------------------------------------------------------- the flat
interface Ready { field: FlatField; terrain: TerrainRenderer; water: WaterPass; walker: Walker; debris: Debris; shadow: SunShadow }
let world: Ready | null = null;
let frames = 0;
let tideBusy = false;
let tidePending: number | null = null;
const worker = new Worker(new URL('./gen/worker.ts', import.meta.url), { type: 'module' });
let tideId = 0;
const tideWaiters = new Map<number, () => void>();

function requestTide(t: number): Promise<void> {
  state.tide = t;
  if (!world) return Promise.resolve();
  if (tideBusy) { tidePending = t; return new Promise((r) => tideWaiters.set(-1, r)); }
  tideBusy = true;
  const id = ++tideId;
  worker.postMessage({ type: 'tide', tide: t, id });
  return new Promise((r) => tideWaiters.set(id, r));
}

worker.onmessage = (e: MessageEvent) => {
  const m = e.data as { type: string; label?: string; f?: number; data?: FlatData; normals?: { fine: Uint8Array; far: Uint8Array }; water?: WaterState; ms?: number; id?: number };
  if (m.type === 'progress') ui.progress(m.label ?? '', m.f ?? 0);
  else if (m.type === 'flat') {
    console.info(`[flat] generated in ${m.ms?.toFixed(0)} ms`);
    setup(m.data!, m.normals!, m.water!);
  } else if (m.type === 'water') {
    world?.field.setWater(m.water!);
    tideBusy = false;
    tideWaiters.get(m.id!)?.();
    tideWaiters.delete(m.id!);
    if (tidePending !== null) {
      const t = tidePending;
      tidePending = null;
      const w = tideWaiters.get(-1);
      tideWaiters.delete(-1);
      void requestTide(t).then(() => w?.());
    }
  }
};
worker.onerror = (e) => ui.error(`地形の生成に失敗しました: ${e.message}`);
ui.progress('起動', 0);
worker.postMessage({ type: 'generate', seed: state.seed, tide: state.tide });

function setup(data: FlatData, normals: { fine: Uint8Array; far: Uint8Array }, water: WaterState): void {
  const field = new FlatField(data, normals, water);
  const q = QUALITY[state.quality];
  sky.update(0, new Vector2());
  sky.updateEnvironment(true);
  shared.uEnv.value = sky.env;
  const waves = createWaves(data.wind, data.seed % 997, state.wind);
  const shadow = new SunShadow(renderer, q.detail > 0 ? 2048 : 1024, 16);
  const terrain = new TerrainRenderer(field.uniforms, sky.uniforms, waves, shared, shadow.uniforms, sky.envHeight, { detail: q.detail, debug: num('debug', 0), range0: q.lod });
  scene.add(terrain.mesh);
  const waterPass = new WaterPass(field.uniforms, sky.uniforms, waves, shared, sky.envHeight, { ssr: q.ssr });
  const scenery = new Scenery(data, sky.uniforms, shared, field.uniforms.uTide, sky.envHeight);
  scene.add(scenery.group);
  const debris = new Debris(field, field.uniforms, sky.uniforms, shared, sky.envHeight);
  scene.add(debris.group);
  debris.group.traverse((o) => o.layers.enable(SHADOW_LAYER));
  for (const name of ['poles', 'lamps']) scenery.group.getObjectByName(name)?.layers.enable(SHADOW_LAYER);
  const walker = new Walker(camera, field, canvas);
  const cam = (params.get('cam') ?? '').split(',').map(Number);
  if (cam.length >= 4 && cam.every(Number.isFinite)) {
    if (cam.length >= 5) walker.eye = cam[4];
    walker.setPose(cam[0], cam[1], (cam[2] * Math.PI) / 180, (cam[3] * Math.PI) / 180);
  } else walker.setPose(-40, 70, (188 * Math.PI) / 180, (-6 * Math.PI) / 180);
  world = { field, terrain, water: waterPass, walker, debris, shadow };
  (waves.uWind.value).z = state.wind;
  ui.ready(data, field);
  (window as unknown as { __flat: unknown }).__flat = api;
}

// ---------------------------------------------------------------------------------- controls from the panel
let envDirty = false;
ui.onChange = (k) => {
  if (k === 'tide') void requestTide(state.tide);
  if (k === 'hour' || k === 'date') { sunDir.copy(sunFor(state)); envDirty = true; }
  if (k === 'cover' || k === 'cirrus' || k === 'haze') envDirty = true;
  if (k === 'quality') location.search = new URLSearchParams({ ...Object.fromEntries(params), q: state.quality }).toString();
  if (k === 'seed') location.search = new URLSearchParams({ ...Object.fromEntries(params), seed: String(state.seed) }).toString();
};

// ---------------------------------------------------------------------------------- loop
let last = performance.now();
let envTimer = 0;
const cloudWind = new Vector2(0.0042, -0.0026);   // km/s aloft
const fixedDt = params.has('fixed') ? 1 / 30 : 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = fixedDt || Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!world || !sceneRT || !waterRT) return;
  const { terrain, water, walker, debris, shadow } = world;
  walker.update(dt);
  debris.update(walker.x, walker.z);
  shadow.render(scene, camera.position, sunDir);
  shared.uTime.value += dt;
  sky.params.cover = state.cover;
  sky.params.cirrus = state.cirrus;
  sky.params.haze = state.haze;
  sky.params.sunDir.copy(sunDir);
  sky.update(dt, cloudWind);
  envTimer += dt;
  if (envDirty && envTimer > 0.25) {
    envDirty = false;
    envTimer = 0;
    sky.updateEnvironment();
    shared.uEnv.value = sky.env;
  }
  if (taa) taa.begin(camera, sceneRT.width, sceneRT.height);
  terrain.update(camera);
  renderer.setRenderTarget(sceneRT);
  renderer.clear();
  renderer.render(scene, camera);
  const noWater = params.has('nowater');
  if (!noWater) water.render(renderer, sceneRT, waterRT, camera);
  const sunEl = Math.max(0.02, sunDir.y);
  const autoExp = 1.5 / Math.min(1, 0.25 + 0.95 * sunEl);
  let shown: WebGLRenderTarget = noWater ? sceneRT : waterRT;
  if (taa) shown = taa.resolve(shown.texture, sceneRT.depthTexture!, camera);
  post.render(shown, { exposure: (state.autoExposure ? autoExp : 1) * state.exposure, bloom: 0.05, time: shared.uTime.value, curve: state.curve });
  frames++;
  ui.frame(dt, walker, world.field, terrain.nodeCount);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------------- automation hooks (tests, screenshots)
const api = {
  get ready() { return world !== null; },
  get frames() { return frames; },
  state,
  setCam(x: number, z: number, yawDeg: number, pitchDeg: number, eye?: number) {
    if (!world) return;
    taa?.reset();
    if (eye !== undefined) world.walker.eye = eye;
    world.walker.setPose(x, z, (yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180);
  },
  setTime(h: number) { state.hour = h; sunDir.copy(sunFor(state)); envDirty = true; envTimer = 1; },
  setTide(t: number) { return requestTide(t); },
  setSky(o: Partial<Pick<FlatState, 'cover' | 'cirrus' | 'haze'>>) { Object.assign(state, o); envDirty = true; envTimer = 1; },
  get field() { return world?.field ?? null; },
  setDebug(n: number) { if (world) world.terrain.material.uniforms.uDebug.value = n; },
};
(window as unknown as { __flatBoot: unknown }).__flatBoot = api;
