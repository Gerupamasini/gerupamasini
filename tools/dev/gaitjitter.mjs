// Gait judder probe (no rendering): drives the plover at realistic display timing and measures how much
// the BODY jolts on screen while walking/running, plus the leg/foot kinematics (to show they are unchanged).
//
// Scenarios
//   treadmill-walk/run  animator only, root fixed, ground scrolling (the validation-page preview)
//   viewer-walk/run     the demo's animation viewer: entity + manager scheduling, AI paused, gentle circle
//   ai                  the demo: 14 birds with the behaviour AI, follow camera on bird 0 (LOD0, visible)
//   viewer-run-12m      viewer run followed from 12 m (LOD2: throttled skeleton)
// Display timing: "60j" = 60 Hz vsync with ±0.3 ms timestamp jitter (performance.now() at frame start),
//   "60" = exact 1/60 s; likewise 30/120/144. The follow camera moves by the bird's position delta every
//   frame (src/demo/main.js), so body-relative-to-camera = what the viewer sees.
//
// usage: node tools/dev/gaitjitter.mjs [--secs=30] [--aiSecs=90] [--only=treadmill,viewer,far,ai]
//                                      [--rates=60,60j,30j,120j,144j] [--save=out.json] [--compare=before.json]
import * as THREE from 'three';
import { writeFileSync, readFileSync } from 'node:fs';
import { makeRng, wrapAngle } from '../../src/core/math.js';
import { Tide } from '../../src/world/Tide.js';
import { Terrain } from '../../src/world/Terrain.js';
import { PreyField } from '../../src/world/PreyField.js';
import { KentishPloverManager } from '../../src/birds/kentishPlover/KentishPloverLOD.js';
import { KentishPloverModel } from '../../src/birds/kentishPlover/KentishPloverModel.js';
import { KentishPloverAnimator } from '../../src/birds/kentishPlover/KentishPloverAnimator.js';
import { animation as ANIM } from '../../src/birds/kentishPlover/KentishPloverConfig.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SECS = Number(args.secs ?? 30);
const AI_SECS = Number(args.aiSecs ?? 90);
const ONLY = (args.only ?? 'treadmill,viewer,far,ai').split(',');
const RATES = (args.rates ?? '60,60j,30j,120j,144j').split(',');
const WARMUP = 3; // s ignored at the start of every run (the flock idles for the first ~19 s of the ai run)
const JOLT = 0.5; // mm: |2nd difference| of the body position on screen that counts as a jolt

globalThis.setTimeout = (fn) => fn(); // alarm delays resolve immediately
let rnd = makeRng(12345);
Math.random = () => rnd(); // deterministic runs (spawn headings, AI jitter)

// --------------------------------------------------------------- display timing
function frameDts(spec, secs, seed = 7) {
  const hz = parseFloat(spec);
  const jit = spec.endsWith('j') ? 0.0003 : 0;
  const r = makeRng(seed);
  const out = [];
  let prev = 0;
  for (let n = 1; n <= Math.round(secs * hz); n++) {
    const t = n / hz + (r() * 2 - 1) * jit;
    out.push(Math.min(t - prev, 1 / 20)); // main.js clamps dt to 1/20
    prev = t;
  }
  return out;
}

// --------------------------------------------------------------- per-frame probe
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _qh = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const w3 = (o) => (o.getWorldPosition(_p), [_p.x, _p.y, _p.z]);

function instrument(A) {
  const orig = A.update;
  A.update = function (dt, o) {
    this._probeUpd = true;
    return orig.call(this, dt, o);
  };
}

function sample(rec, t, dt, A, entity, cam) {
  const obj = A.model.object;
  obj.updateMatrixWorld(true); // what the renderer does before drawing
  const b = A.b;
  b.body.getWorldQuaternion(_q);
  const heading = entity ? entity.heading : A.heading;
  _qh.setFromAxisAngle(Y, heading).invert().multiply(_q);
  _e.setFromQuaternion(_qh, 'YXZ');
  const pos = entity ? [entity.pos.x, entity.pos.y, entity.pos.z] : [A.rootPos.x, A.rootPos.y, A.rootPos.z];
  rec.push({
    t,
    dt,
    upd: !!A._probeUpd,
    pos,
    heading,
    speed: entity ? entity.speed : A.velocity.length(),
    root: [obj.position.x, obj.position.y, obj.position.z],
    body: w3(b.body),
    head: w3(b.head),
    pitch: _e.x,
    roll: _e.z,
    cam: cam ? [cam.x, cam.y, cam.z] : [0, 0, 0],
    feet: A.feet.map((f) => [f.pos.x, f.pos.y, f.pos.z, f.swing]),
    footBone: ['L', 'R'].map((s) => w3(b[`foot_${s}`])),
    ankle: ['L', 'R'].map((s) => w3(b[`tarso_${s}`])),
    hz: A.stride.hz,
    duty: A.stride.duty,
    amount: A.stride.amount,
    lean: A.lean,
    act: A.action?.name ?? null,
  });
  A._probeUpd = false;
}

// --------------------------------------------------------------- scenarios
function runTreadmill(gait, dts) {
  const model = new KentishPloverModel({ lods: [2], shadows: false });
  const A = new KentishPloverAnimator(model, { seed: 1 });
  instrument(A);
  const speed = gait === 'walk' ? ANIM.walk.speed : ANIM.run.speed;
  A.setRoot(new THREE.Vector3(), 0, new THREE.Vector3(0, 0, speed));
  A.setPosture(gait === 'run' ? 'run' : 'relaxed');
  A.setGaze('forward');
  A._treadmill = speed;
  A._initFeet = true;
  const rec = [];
  let t = 0;
  for (const dt of dts) {
    t += dt;
    A.update(dt);
    sample(rec, t, dt, A, null, null);
  }
  return rec;
}

function makeWorld() {
  rnd = makeRng(12345);
  const tide = new Tide({ startHour: 8, timeScale: 60, phase: -1.9 });
  const terrain = new Terrain({ tide, segments: 8 });
  const prey = new PreyField(terrain, tide);
  const world = { terrain, tide, prey, threats: [], time: 0, context: 'foraging', birds: null, player: null };
  const mgr = new KentishPloverManager(world, new THREE.Scene());
  const findShoreZ = (x) => {
    for (let z = 80; z > -140; z -= 0.5) if (terrain.heightAt(x, z) < tide.level + 0.25) return z;
    return 0;
  };
  // src/demo/main.js spawnFlock(14), seed 3
  const n = 14;
  const cz = findShoreZ(0) + 1.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i;
    const r = 1.5 + (i % 5) * 1.4;
    mgr.spawn({ seed: 300 + i, palette: i % 3 === 1 ? 'femaleBreeding' : 'maleBreeding', position: new THREE.Vector3(Math.cos(a) * r * 2.2, 0, cz + Math.sin(a) * r * 0.8), heading: Math.random() * 6.28, lods: [2], shadows: false });
  }
  const player = { type: 'human', pos: new THREE.Vector3(6, 0, findShoreZ(0) + 55), vel: new THREE.Vector3() };
  world.threats.push(player);
  world.player = player;
  const camera = new THREE.PerspectiveCamera(40, 1280 / 800, 0.01, 600);
  return { world, mgr, camera, tide, prey };
}

function runDemo(kind, dts, dist = 0.6) {
  const { world, mgr, camera, tide, prey } = makeWorld();
  const b = mgr.all[0];
  instrument(b.animator);
  // camera: three-quarter side view at 0.6 m (main.js placeCameraAround), then follow by position delta
  const target = b.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
  const yaw = b.heading + 1.15;
  const pitch = 0.16;
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const last = b.pos.clone();
  if (kind !== 'ai') {
    // animation viewer (main.js applyAnimSelection / driveViewer)
    b.ai.manual = true;
    b.animator.stopAction();
    b.stop();
    b.faceTowards(null);
    b.animator.setPosture(kind === 'run' ? 'run' : 'relaxed');
    b.animator.setGaze('forward');
  }
  const rec = [];
  let t = 0;
  for (const dt of dts) {
    t += dt;
    world.time += dt;
    tide.update(dt);
    prey.update(dt);
    if (kind !== 'ai') {
      const tgt = b.pos.clone().add(new THREE.Vector3(Math.sin(b.heading + 0.25), 0, Math.cos(b.heading + 0.25)).multiplyScalar(0.6));
      b.moveTo(tgt, { gait: kind, arrive: 0.01 });
    }
    mgr.update(dt, camera);
    const delta = b.pos.clone().sub(last);
    camera.position.add(delta);
    target.add(delta);
    last.copy(b.pos);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    sample(rec, t, dt, b.animator, b, camera.position);
    rec[rec.length - 1].lod = b.lod;
    rec[rec.length - 1].state = b.ai.state;
  }
  return rec;
}

// --------------------------------------------------------------- metrics
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const rms = (xs) => (xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) : 0);
const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};
const range = (xs) => pct(xs, 0.98) - pct(xs, 0.02);
/** root-relative body position in the heading frame: [lateral(+left), up, forward] */
function local(r, key) {
  const d = sub(r[key], r.pos);
  const s = Math.sin(r.heading);
  const c = Math.cos(r.heading);
  return [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
}
/** dominant frequency of frame-sampled values (direct DFT, up to the display Nyquist) */
function dominant(ts, xs) {
  if (xs.length < 16) return [NaN, 0];
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const T = ts[ts.length - 1] - ts[0];
  const fs = xs.length / T;
  let best = [NaN, 0];
  for (let f = 0.5; f <= Math.min(40, fs / 2); f += 0.1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < xs.length; i++) {
      const w = 2 * Math.PI * f * ts[i];
      re += (xs[i] - m) * Math.cos(w);
      im += (xs[i] - m) * Math.sin(w);
    }
    const a = (2 * Math.hypot(re, im)) / xs.length;
    if (a > best[1]) best = [f, a];
  }
  return best;
}

function metrics(rec, { moving = false } = {}) {
  const r0 = rec.filter((r) => r.t > WARMUP);
  const idx = [];
  for (let i = 2; i < r0.length; i++) {
    const r = r0[i];
    // locomotion frames: moving or still in the gait, and not inside an action (a peck tips the body on purpose)
    if (moving && (!(r.speed > 0.02 || r.amount > 0.05) || r.act)) continue;
    idx.push(i);
  }
  const rel = (r, k) => sub(r[k], r.cam);
  const d2 = (i, k) => {
    const a = rel(r0[i], k);
    const b = rel(r0[i - 1], k);
    const c = rel(r0[i - 2], k);
    return [a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1], a[2] - 2 * b[2] + c[2]];
  };
  const d1 = (i, k) => sub(rel(r0[i], k), rel(r0[i - 1], k));
  const jud = idx.map((i) => len(d2(i, 'body')) * 1000);
  const judY = idx.map((i) => Math.abs(d2(i, 'body')[1]) * 1000);
  const head = idx.map((i) => len(d2(i, 'head')) * 1000);
  const step = idx.map((i) => len(d1(i, 'body')) * 1000);
  // jerk of the on-screen body position (m/s³), from the frame samples and their real timestamps
  const jerk = [];
  for (const i of idx) {
    if (i < 3) continue;
    const p = [3, 2, 1, 0].map((k) => rel(r0[i - k], 'body'));
    const tt = [3, 2, 1, 0].map((k) => r0[i - k].t);
    const v = [0, 1, 2].map((k) => sub(p[k + 1], p[k]).map((x) => x / (tt[k + 1] - tt[k])));
    const a = [0, 1].map((k) => sub(v[k + 1], v[k]).map((x) => x / ((tt[k + 2] - tt[k]) / 2)));
    jerk.push(len(sub(a[1], a[0])) / ((tt[3] - tt[1]) / 2 + (tt[2] - tt[0]) / 2) * 2);
  }
  const sel = idx.map((i) => r0[i]);
  const ts = sel.map((r) => r.t);
  const L = sel.map((r) => local(r, 'body'));
  const up = L.map((v) => v[1] * 1000);
  const lat = L.map((v) => v[0] * 1000);
  const pitch = sel.map((r) => (r.pitch * 180) / Math.PI);
  const roll = sel.map((r) => (r.roll * 180) / Math.PI);
  const pitchRate = [];
  for (const i of idx) pitchRate.push(Math.abs(wrapAngle(r0[i].pitch - r0[i - 1].pitch)) / r0[i].dt * (180 / Math.PI));
  const lag = sel.map((r) => len(sub(r.root, r.pos)) * 1000);
  const lean = sel.map((r) => (Math.abs(r.lean) * 180) / Math.PI);
  // gait / feet (unchanged-legs evidence)
  const mv = sel.filter((r) => r.speed > 0.02);
  const lift = [];
  for (const r of sel) for (const f of r.feet) if (f[3] > 0) lift.push((f[1] - r.pos[1]) * 1000);
  const footStep = [];
  for (const i of idx) for (const k of [0, 1]) footStep.push(len(sub(r0[i].footBone[k], r0[i - 1].footBone[k])) * 1000);
  return {
    frames: sel.length,
    noUpd: sel.filter((r) => !r.upd).length / Math.max(1, sel.length),
    lagMean: lag.reduce((a, b) => a + b, 0) / Math.max(1, lag.length),
    lagMax: Math.max(0, ...lag),
    judRms: rms(jud),
    judMax: Math.max(0, ...jud),
    judYRms: rms(judY),
    stepMax: Math.max(0, ...step),
    jolts: jud.filter((x) => x > JOLT).length / Math.max(1, jud.length),
    headRms: rms(head),
    jerkRms: rms(jerk),
    upPP: range(up),
    upHz: dominant(ts, up),
    latPP: range(lat),
    latHz: dominant(ts, lat),
    pitchPP: range(pitch),
    pitchHz: dominant(ts, pitch),
    rollPP: range(roll),
    rollHz: dominant(ts, roll),
    pitchRateMax: pct(pitchRate, 0.99),
    leanMax: Math.max(0, ...lean),
    movingFrac: mv.length / Math.max(1, sel.length),
    speedMean: mv.reduce((a, r) => a + r.speed, 0) / Math.max(1, mv.length),
    speedMax: Math.max(0, ...mv.map((r) => r.speed)),
    strideHz: mv.reduce((a, r) => a + r.hz, 0) / Math.max(1, mv.length),
    duty: mv.reduce((a, r) => a + r.duty, 0) / Math.max(1, mv.length),
    liftMax: Math.max(0, ...lift),
    swingFrac: sel.length ? sel.reduce((a, r) => a + r.feet.filter((f) => f[3] > 0).length, 0) / (2 * sel.length) : 0,
    footStepMax: Math.max(0, ...footStep),
  };
}

const f1 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
function printRow(name, m) {
  console.log(
    [
      name.padEnd(22),
      `${(m.noUpd * 100).toFixed(0).padStart(3)}%`,
      `lag ${f1(m.lagMean, 1).padStart(5)}/${f1(m.lagMax, 1).padStart(5)}`,
      `jud ${f1(m.judRms).padStart(5)}/${f1(m.judMax).padStart(6)} (y ${f1(m.judYRms)})`,
      `step ${f1(m.stepMax).padStart(6)}`,
      `jolts ${(m.jolts * 100).toFixed(1).padStart(5)}%`,
      `head ${f1(m.headRms)}`,
      `jerk ${f1(m.jerkRms, 1).padStart(7)}`,
      `bob ${f1(m.upPP)}mm@${f1(m.upHz[0], 1)}`,
      `lat ${f1(m.latPP)}mm@${f1(m.latHz[0], 1)}`,
      `pitch ${f1(m.pitchPP, 1)}°@${f1(m.pitchHz[0], 1)} (≤${f1(m.pitchRateMax, 0)}°/s, lean ≤${f1(m.leanMax, 1)}°)`,
      `roll ${f1(m.rollPP, 2)}°@${f1(m.rollHz[0], 1)}`,
    ].join('  ')
  );
}
function printGait(name, m) {
  console.log(
    `${name.padEnd(22)}  moving ${(m.movingFrac * 100).toFixed(0).padStart(3)}%  speed ${f1(m.speedMean, 3)} (max ${f1(m.speedMax, 3)}) m/s  stride ${f1(m.strideHz, 3)} Hz  duty ${f1(m.duty, 3)}  footLift max ${f1(m.liftMax)} mm  swing ${(m.swingFrac * 100).toFixed(1)}%  foot step max ${f1(m.footStepMax, 1)} mm/frame`
  );
}

// --------------------------------------------------------------- run
const out = { runs: {} };
const scen = [];
if (ONLY.includes('treadmill')) scen.push(['treadmill-walk', (d) => runTreadmill('walk', d), SECS], ['treadmill-run', (d) => runTreadmill('run', d), SECS]);
if (ONLY.includes('viewer')) scen.push(['viewer-walk', (d) => runDemo('walk', d), SECS], ['viewer-run', (d) => runDemo('run', d), SECS]);
// the same run followed from 12 m: LOD2, skeleton throttled to 30 Hz
if (ONLY.includes('far')) scen.push(['viewer-run-12m', (d) => runDemo('run', d, 12), SECS]);
if (ONLY.includes('ai')) scen.push(['ai', (d) => runDemo('ai', d), AI_SECS]);

console.log(`columns: no-anim-update frames | rendered-root lag mean/max (mm) | body judder on screen = |2nd diff| RMS/max (mm/frame) | max step (mm/frame) |`);
console.log(`         frames with a jolt > ${JOLT} mm | head judder RMS | jerk RMS (m/s³) | body bob, lateral sway, pitch, roll: 2–98% range @ dominant Hz (frame-sampled)`);
const gait = [];
for (const [name, fn, secs] of scen) {
  console.log(`\n== ${name}`);
  for (const rate of RATES) {
    const rec = fn(frameDts(rate, secs));
    const key = `${name}@${rate}`;
    const all = metrics(rec);
    const mov = metrics(rec, { moving: true });
    printRow(`${rate}`, name === 'ai' ? mov : all);
    gait.push([key, mov]);
    out.runs[key] = { metrics: all, moving: mov, feet: rec.map((r) => [r.t, ...r.feet[0].slice(0, 3), ...r.feet[1].slice(0, 3)]), footBone: rec.map((r) => [...r.footBone[0], ...r.footBone[1]]), ankle: rec.map((r) => [...r.ankle[0], ...r.ankle[1]]), pos: rec.map((r) => r.pos), states: name === 'ai' ? rec.map((r) => r.state) : undefined };
  }
}
console.log('\n== gait / legs (moving frames)');
for (const [k, m] of gait) printGait(k, m);

if (args.compare) {
  const base = JSON.parse(readFileSync(args.compare, 'utf8'));
  console.log(`\n== foot trajectories vs ${args.compare} (max |Δ| over all frames, mm)`);
  for (const [k, run] of Object.entries(out.runs)) {
    const b = base.runs[k];
    if (!b) continue;
    const n = Math.min(b.feet.length, run.feet.length);
    let dF = 0;
    let dB = 0;
    let dA = 0;
    let dP = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 1; j < 7; j++) dF = Math.max(dF, Math.abs(run.feet[i][j] - b.feet[i][j]));
      for (let j = 0; j < 6; j++) dB = Math.max(dB, Math.abs(run.footBone[i][j] - b.footBone[i][j]));
      for (let j = 0; j < 6; j++) dA = Math.max(dA, Math.abs(run.ankle[i][j] - b.ankle[i][j]));
      dP = Math.max(dP, len(sub(run.pos[i], b.pos[i])));
    }
    const g0 = b.moving;
    const g1 = run.moving;
    console.log(
      `${k.padEnd(22)} foot target ${f1(dF * 1000, 3)}  foot joint ${f1(dB * 1000, 3)}  intertarsal ${f1(dA * 1000, 3)}  entity pos ${f1(dP * 1000, 3)}  | speed ${f1(g0.speedMean, 3)}→${f1(g1.speedMean, 3)}  stride ${f1(g0.strideHz, 3)}→${f1(g1.strideHz, 3)} Hz  duty ${f1(g0.duty, 3)}→${f1(g1.duty, 3)}  lift ${f1(g0.liftMax)}→${f1(g1.liftMax)} mm`
    );
  }
}
if (args.save) {
  writeFileSync(args.save, JSON.stringify(out));
  console.log(`\nsaved ${args.save}`);
}
