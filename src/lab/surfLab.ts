// 波打ち際ラボ (surf-lab.html): the game's surf on a beach made to show it (src/world/maps/surflab): the same terrain,
// water, sky and surf as the field, with the sea, the tide, the hour and the camera in hand. ?shot hides the panel and
// exposes window.__surfLab for scripted renders.
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GameRenderer } from '../render/Renderer';
import { FieldRenderer } from '../render/FieldRenderer';
import { World } from '../app/World';
import { TideModel } from '../tide/TideModel';
import { QUALITY_PRESETS, type Quality } from '../core/Settings';
import { MapSchema } from '../data/schemas';
import { makeGrid, SIZE, RES, ZERO_X } from '../world/maps/surflab/shape';
import { classifyDepth } from '../world/surfPhysics';

const params = new URLSearchParams(location.search);
if (params.has('shot')) document.body.classList.add('shot');
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const renderer = new GameRenderer(canvas);
const field = new FieldRenderer(renderer.gl);
const camera = new PerspectiveCamera(65, renderer.aspect, 0.05, 2500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

const MAP = MapSchema.parse({
  id: 'surflab', names: { ja: '波打ち際ラボ' }, station: 'surflab', animals: false,
  origin: { lat: 35.25, lon: 139.74 }, size_m: SIZE, resolution: RES,
  height: { file: '-', min_tp_m: -4.4, max_tp_m: 3.4 },
  substrate: { file: '-', palette: ['sand', 'muddy_sand', 'mud', 'gravel', 'channel', 'rock'] },
  spawnStart: { x: ZERO_X - 2, z: 0, heading: 270 },
  bounds: { walkable: [[-46, -46], [46, 46]] },
  layout: 'surflab',
});
// (the tide is set by hand: the model only has to exist)
const TIDE = new TideModel({ id: 'surflab', names: { ja: '-' }, lat: 35.25, lon: 139.74, phaseReference: 'UTC', mslAboveChartDatum_cm: null, constituents: [{ name: 'M2', amplitude_cm: 60, phase_deg: 0 }] });

const state = {
  tide: 0.3, hs: 0.6, period: 7, angle: -0.25, spread: 0.14, hour: 8.5, cloud: 0, speed: 1, quality: (params.get('q') as Quality) || 'mid', debug: 0,
  view: 'beach', paused: false,
};
let world: World | null = null;
let building: Promise<void> | null = null;
let surfTime = 600;

async function build(): Promise<void> {
  renderer.setQuality(state.quality);
  const preset = QUALITY_PRESETS[state.quality];
  field.setQuality(preset);
  world?.dispose();
  world = null;
  const w = await World.create(MAP, TIDE, renderer.gl, preset, undefined, 20261011, makeGrid());
  w.tideOverride = state.tide;
  applySea(w);
  world = w;
  setView(state.view);
  await field.compile(w.scene, camera, w.water);
}

function applySea(w: World): void {
  w.setSeaState({ height: state.hs, period: state.period, angle: state.angle, spread: state.spread });
}

/** the still waterline's x at z, for the tide */
function waterline(z: number): number {
  const w = world!;
  let x = -46;
  for (; x < 46; x += 0.05) if (w.terrain.heightAt(x, z) < state.tide) break;
  return x;
}

function setView(v: string): void {
  state.view = v;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.classList.toggle('on', b.dataset.view === v);
  if (!world) return;
  const t = world.terrain;
  const place = (x: number, z: number, eye: number, tx: number, ty: number, tz: number) => {
    camera.position.set(x, t.heightAt(x, z) + eye, z);
    controls.target.set(tx, ty, tz);
    controls.update();
  };
  const wl = waterline(0);
  switch (v) {
    case 'beach': place(wl - 3.2, 0, 1.6, wl + 30, state.tide - 0.6, 0); break;
    case 'feet': place(wl - 2.6, 0, 1.6, wl + 0.6, state.tide - 0.2, 0.3); break;
    case 'along': place(wl - 2.2, 4, 1.6, wl + 7, state.tide, -24); break;
    case 'side': { const x = waterline(-2) + 1.0; place(x, 6, 0.9, x + 2, state.tide, -20); break; }
    case 'reef': { const x = waterline(-22); place(x - 2, -18, 1.8, x + 22, state.tide - 0.4, -32); break; }
    case 'drone': place(wl - 14, 18, 22, wl + 18, state.tide, 0); break;
  }
}

// ---- the panel
const fmt: Record<string, (v: number) => string> = {
  tide: (v) => `${(v * 100).toFixed(0)}cm`, hs: (v) => `${v.toFixed(2)}m`, period: (v) => `${v.toFixed(1)}s`, angle: (v) => `${Math.round((v * 180) / Math.PI)}°`,
  spread: (v) => `${Math.round((v * 180) / Math.PI)}°`, hour: (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`, cloud: (v) => `${Math.round(v * 100)}%`, speed: (v) => `×${v.toFixed(2)}`,
};
for (const k of Object.keys(fmt) as (keyof typeof fmt)[]) {
  const el = $<HTMLInputElement>(k), out = $(`${k}V`);
  el.value = String(state[k as keyof typeof state]);
  out.textContent = fmt[k](Number(el.value));
  el.addEventListener('input', () => {
    (state as Record<string, unknown>)[k] = Number(el.value);
    out.textContent = fmt[k](Number(el.value));
    if (!world) return;
    if (k === 'tide') world.tideOverride = state.tide;
    if (k === 'hs' || k === 'period' || k === 'angle' || k === 'spread') applySea(world);
    if (k === 'cloud') world.overcast = state.cloud;
  });
}
$<HTMLSelectElement>('quality').value = state.quality;
$<HTMLSelectElement>('quality').addEventListener('change', (e) => { state.quality = (e.target as HTMLSelectElement).value as Quality; building = build(); });
$<HTMLSelectElement>('debug').addEventListener('change', (e) => { state.debug = Number((e.target as HTMLSelectElement).value); world?.water.setSurfDebug(state.debug); });
for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.addEventListener('click', () => setView(b.dataset.view!));
$('pause').addEventListener('click', () => { state.paused = !state.paused; $('pause').classList.toggle('on', state.paused); });
$('step').addEventListener('click', () => { surfTime += 0.1; });
$('toggle').addEventListener('click', () => document.body.classList.toggle('folded'));
addEventListener('resize', () => { renderer.resize(); camera.aspect = renderer.aspect; camera.updateProjectionMatrix(); });

// ---- the loop
let last = performance.now(), frames = 0, fpsAcc = 0, fps = 0;
const anchor = new Vector3();
function gameMs(): number {
  // a fixed autumn day at the lab's latitude, the hour from the slider (JST)
  const day = Date.UTC(2026, 9, 11, 0, 0) - 9 * 3600000;
  return day + state.hour * 3600000;
}
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!world) return;
  controls.update();
  anchor.copy(camera.position);
  const step = state.paused ? 0 : dt * state.speed;
  surfTime += step;
  world.update(gameMs(), dt, anchor, camera);
  // (the surf's own clock: slowed, stopped or stepped by hand)
  world.water.uniforms.uTime.value = surfTime;
  renderer.gl.toneMappingExposure = world.exposure;
  field.render(world.scene, camera, world.water);
  frames++; fpsAcc += dt;
  if (fpsAcc > 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; updateHud(); }
}
function updateHud(): void {
  if (!world) return;
  const p = camera.position, D = state.tide - world.terrain.heightAt(controls.target.x, controls.target.z);
  const sea = world.sea!;
  const kind = classifyDepth(D, sea.height, sea.period, world.surfZone!.uniforms.uSurfLv.value.w, world.surfZone!.slopeAt(controls.target.x, controls.target.z));
  $('hud').textContent = `${fps.toFixed(0)} fps  ${renderer.gl.domElement.width}×${renderer.gl.domElement.height}\n目 (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  注視点の水深 ${(D * 100).toFixed(0)}cm (${KIND_JA[kind]})`;
}
const KIND_JA = { land: '陸', swash: '遡上帯', breaker: '砕波帯', shallow: '浅い海', deep: '深い海' } as const;

(window as unknown as { __surfLab: unknown }).__surfLab = {
  get world() { return world; }, camera, controls, state, setView, build,
  setClock: (t: number) => { surfTime = t; }, ready: () => building,
  set: (k: string, v: number) => { const el = $<HTMLInputElement>(k); el.value = String(v); el.dispatchEvent(new Event('input')); },
};
camera.aspect = renderer.aspect; camera.updateProjectionMatrix();
renderer.resize();
building = build();
requestAnimationFrame(frame);
