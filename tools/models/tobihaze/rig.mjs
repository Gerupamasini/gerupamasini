// Skeleton, skin weights and baked clips for the トビハゼ.
// The clips (Idle, Crawl, Hop, Swim, Blink, Feed) are sampled from the same pose model the runtime driver uses
// (src/creatures/species/tobihaze/pose.js); in the game the animal is animated procedurally, the clips serve the
// 図鑑 preview and any viewer without the driver.
import { section, botY, toObject, EYE, RICTUS_S, gapeY } from './anatomy.mjs';
import { PEC, PELVIC } from './fins.mjs';
import { clamp, smoothstep } from '../../lib/noise.mjs';
import { SPINE, computePose, defaultPose, swimMidline, bendFromMidline, TL_MM } from '../../../src/creatures/species/tobihaze/pose.js';

const yc = (s) => section(s).yc;
const at = (s) => [s, yc(s), 0];
const mirror = (p) => [p[0], p[1], -p[2]];
// the lower jaw hinges well behind the visible mouth corner (the quadrate lies under the eye)
export const JAW_HINGE = [6.5, 1.5, 0];

export const JOINTS = [
  { name: 'J_root', parent: null, at: at(17.0) },
  { name: 'J_head', parent: 'J_root', at: at(11.0) },
  { name: 'J_jaw', parent: 'J_head', at: JAW_HINGE },
  { name: 'J_eyeL', parent: 'J_head', at: EYE.center },
  { name: 'J_eyeR', parent: 'J_head', at: mirror(EYE.center) },
  { name: 'J_pecL', parent: 'J_root', at: PEC.base },
  { name: 'J_pecArmL', parent: 'J_pecL', at: PEC.wrist },
  { name: 'J_pecR', parent: 'J_root', at: mirror(PEC.base) },
  { name: 'J_pecArmR', parent: 'J_pecR', at: mirror(PEC.wrist) },
  { name: 'J_pelvic', parent: 'J_root', at: [PELVIC.s, botY(PELVIC.s) + 0.25, 0] },
  ...SPINE.slice(2).map(([name, s], k, arr) => ({ name, parent: k === 0 ? 'J_root' : arr[k - 1][0], at: at(Math.min(s, 64)) })),
];
export const J = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));
JOINTS.forEach((j) => { j.obj = toObject(j.at); });

const CHAIN = SPINE.map(([n, s]) => [s, n]);
export function spineWeights(s) {
  if (s <= CHAIN[0][0]) return [[J[CHAIN[0][1]], 1]];
  for (let k = 0; k < CHAIN.length - 1; k++) {
    const [s0, a] = CHAIN[k], [s1, b] = CHAIN[k + 1];
    if (s <= s1) {
      const f = smoothstep(0, 1, (s - s0) / (s1 - s0));
      return [[J[a], 1 - f], [J[b], f]];
    }
  }
  return [[J.J_caudal2, 1]];
}

export function pack(list, n) {
  const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  list.forEach((inf, i) => {
    const merged = new Map();
    for (const [j, w] of inf) merged.set(j, (merged.get(j) || 0) + w);
    let arr = [...merged.entries()].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = arr.reduce((a, [, w]) => a + w, 0) || 1;
    arr = arr.map(([j, w]) => [j, w / sum]);
    const q = arr.map(([, w]) => Math.round(w * 255));
    const diff = 255 - q.reduce((a, b) => a + b, 0);
    q[0] += diff;
    arr.forEach(([j], k) => { joints[i * 4 + k] = q[k] > 0 ? j : 0; weights[i * 4 + k] = q[k]; });
  });
  return { joints, weights };
}

function withRest(list, s) {
  let rest = 1;
  const out = [];
  for (const [j, w] of list) if (w > 1e-3) { out.push([j, w]); rest -= w; }
  rest = Math.max(rest, 0);
  for (const [j, w] of spineWeights(s)) out.push([j, w * rest]);
  return out;
}

/** skin vertices: spine chain; the lower jaw (below the gape cut) on J_jaw, sealed toward the mouth corner */
export function skinWeights(list) {
  return pack(list.map((v) => {
    const s = v.fish[0], y = v.fish[1];
    if (v.cut === 'upper') return spineWeights(s);
    if (v.jaw || v.cut === 'lower') {
      const seal = smoothstep(RICTUS_S - 1.0, RICTUS_S, s);
      return withRest([[J.J_jaw, 1 - 0.3 * seal]], s);
    }
    // the rest of the lower jaw and the throat: everything below the gape line (continued back under the lip pad
    // to the hinge) follows the jaw, fading out behind the hinge and up toward the cheek, so the skin stretches
    // smoothly instead of folding
    const w = jawWeight(s, y);
    if (w > 1e-3) return withRest([[J.J_jaw, w]], s);
    return spineWeights(s);
  }), list.length);
}

/** jaw influence of a skin point outside the gape strip */
export function jawWeight(s, y) {
  if (s > JAW_HINGE[0] + 2.4) return 0;
  const gy = gapeY(Math.min(s, RICTUS_S)) - 0.22 * Math.max(0, s - RICTUS_S);
  const along = 1 - smoothstep(RICTUS_S + 0.4, JAW_HINGE[0] + 2.4, s);
  const below = smoothstep(gy + 0.15, gy - 1.3, y);
  return 0.9 * along * below;
}

export function mouthWeights(m) {
  return pack(m.fish.map((p, k) => {
    const s = p[0];
    if (m.zone[k] === 0) return spineWeights(s);
    // the floor of the mouth goes with the lower jaw, less toward the back (the hyoid stays)
    return withRest([[J.J_jaw, 1 - 0.55 * smoothstep(RICTUS_S - 1, JAW_HINGE[0] + 1, s)]], s);
  }), m.fish.length);
}

export function armWeights(atList, side) {
  const jp = side > 0 ? J.J_pecL : J.J_pecR, jw = side > 0 ? J.J_pecArmL : J.J_pecArmR;
  return pack(atList.map((a) => {
    // the hand (past the wrist joint) moves with the web
    const wWrist = smoothstep(PEC.joint - 0.7, PEC.joint + 0.5, a);
    // the arm leaves the body's weights inside the flank (its first 1.2 mm are sunk in it): a blend over the visible
    // arm would pinch it when the shoulder swings and twists it
    const wPec = smoothstep(-1.1, -0.1, a) * (1 - wWrist);
    return withRest([[jp, wPec], [jw, wWrist]], PEC.base[0]);
  }), atList.length);
}

export function finWeights(name, mesh, side = 1) {
  const n = mesh.rayT.length;
  const list = [];
  for (let i = 0; i < n; i++) {
    const t = mesh.rayT[i];
    if (name === 'Fin_Pectoral') { list.push([[side > 0 ? J.J_pecArmL : J.J_pecArmR, 1]]); continue; }
    if (name === 'Fin_Pelvic') { list.push(withRest([[J.J_pelvic, smoothstep(0.0, 0.18, t)]], PELVIC.s)); continue; }
    if (name === 'Fin_Caudal') { list.push(spineWeights(mesh.fish[i * 3])); continue; }
    list.push(spineWeights(mesh.baseS[i]));
  }
  return pack(list, n);
}

// ------------------------------------------------------------------------------------------------ clips
function sampleClip(name, duration, fps, fn) {
  const n = Math.round(duration * fps) + 1;
  const times = new Float32Array(n);
  const rot = new Map(), tr = new Map(), mw = new Map();
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * duration;
    times[f] = t;
    const P = computePose(fn(t), { eyeRetract_m: EYE.retract / 1000 });
    for (const [k, v] of Object.entries(P.q)) { if (J[k] === undefined) continue; if (!rot.has(k)) rot.set(k, []); rot.get(k).push(...v); }
    for (const [k, v] of Object.entries(P.t)) {
      if (!tr.has(k)) tr.set(k, []);
      const j = JOINTS[J[k]], par = JOINTS[J[j.parent]];
      tr.get(k).push(j.obj[0] - par.obj[0] + v[0], j.obj[1] - par.obj[1] + v[1], j.obj[2] - par.obj[2] + v[2]);
    }
    for (const [k, v] of Object.entries(P.morph)) { if (!mw.has(k)) mw.set(k, []); mw.get(k).push(...v); }
  }
  const channels = [];
  for (const [k, v] of rot) channels.push({ joint: J[k], path: 'rotation', times, values: new Float32Array(v) });
  for (const [k, v] of tr) channels.push({ joint: J[k], path: 'translation', times, values: new Float32Array(v) });
  const weights = [...mw.entries()].map(([mesh, v]) => ({ mesh, times, values: new Float32Array(v) }));
  return { name, duration, channels, weights };
}

/** the land stance: propped on the pectorals, head raised, the trunk arched and the tail resting as a skid */
export function landPose(p = defaultPose()) {
  p.lift.J_head = 0.1;
  p.lift.J_sp1 = -0.05; p.lift.J_sp2 = -0.06; p.lift.J_sp3 = -0.04; p.lift.J_sp4 = -0.02;
  p.pecL.protract = p.pecR.protract = 0.55;
  p.pecL.depress = p.pecR.depress = 1.0;
  p.pecL.wrist = p.pecR.wrist = 0.55;
  p.pelvic = 0.15;
  return p;
}

export function buildClips() {
  const clips = [];
  // Idle on land: buccal pumping (the cheeks and throat swell and empty), small gaze shifts
  const idleDur = 3.2;
  clips.push(sampleClip('Idle', idleDur, 30, (t) => {
    const p = landPose();
    const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * 2 * t) / idleDur);
    p.morph.breathe = 0.55 * b;
    p.eyeL.yaw = 0.12 * Math.sin((2 * Math.PI * t) / idleDur);
    p.eyeR.yaw = -0.1 * Math.sin((2 * Math.PI * t) / idleDur + 1.3);
    p.eyeL.pitch = p.eyeR.pitch = -0.05;
    return p;
  }));
  // Crawl: one synchronous crutching stroke (Pace & Gibb 2009: ~2.1 strokes/s, push 45 % / recovery 55 %)
  const T = 0.48;
  clips.push(sampleClip('Crawl', T, 60, (t) => {
    const p = landPose();
    const ph = t / T;
    const push = ph < 0.45;
    const u = push ? ph / 0.45 : (ph - 0.45) / 0.55;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const pro = push ? 0.85 - 1.25 * e : -0.4 + 1.25 * e;
    p.pecL.protract = p.pecR.protract = pro;
    p.pecL.depress = p.pecR.depress = push ? 1.05 + 0.2 * Math.sin(Math.PI * u) : 0.7 + 0.1 * Math.sin(Math.PI * u);
    p.pecL.wrist = p.pecR.wrist = push ? 0.7 - 0.5 * e : 0.2 + 0.5 * e;
    p.lift.J_head = 0.1 + (push ? 0.08 * Math.sin(Math.PI * u) : 0);
    p.pelvic = push ? 0.15 - 0.45 * Math.sin(Math.PI * u) : 0.15 + 0.2 * Math.sin(Math.PI * u);
    p.morph.foldPelvic = push ? 0.6 * Math.sin(Math.PI * u) : 0;
    const sway = 0.05 * Math.sin(2 * Math.PI * ph);
    for (const n of ['J_sp5', 'J_sp6', 'J_sp7', 'J_sp8']) p.bend[n] = sway;
    return p;
  }));
  // Hop: J-shaped curl (the tail swings up beside the head, sharpest bend 2/3 down the body), then a fast
  // straightening that throws the fish forward (Swanson & Gibb 2004); fins folded in flight, spread on landing
  clips.push(sampleClip('Hop', 0.7, 60, (t) => {
    const p = landPose();
    const curl = t < 0.12 ? smoothstep(0, 0.12, t) : 1 - smoothstep(0.12, 0.2, t);
    const recoil = t > 0.16 && t < 0.3 ? -0.25 * Math.sin(((t - 0.16) / 0.14) * Math.PI) : 0;
    const prof = { J_root: 0.12, J_sp1: 0.18, J_sp2: 0.24, J_sp3: 0.3, J_sp4: 0.36, J_sp5: 0.36, J_sp6: 0.3, J_sp7: 0.2, J_sp8: 0.12, J_caudal: 0.08, J_caudal2: 0.05 };
    for (const [n, a] of Object.entries(prof)) p.bend[n] = (curl + recoil) * a * 1.25;
    p.bend.J_head = -0.25 * curl;
    p.lift.J_head = 0.1 + 0.12 * curl;
    const air = t > 0.2 && t < 0.58;
    if (air) { p.pecL.protract = p.pecR.protract = -0.9; p.pecL.depress = p.pecR.depress = 0.15; p.morph.foldPecL = p.morph.foldPecR = 0.7; }
    p.morph.foldD1 = air ? 1 : 0.6; p.morph.foldCaudal = air ? 0.1 : 0.4;
    p.eyeL.retract = p.eyeR.retract = t > 0.56 && t < 0.66 ? 0.6 : 0;
    return p;
  }));
  // Swim: axial undulation (fast swimming is body undulation only), fins folded to the flanks
  const f = 4.5;
  clips.push(sampleClip('Swim', 1 / f, 120, (t) => {
    const p = defaultPose();
    const phase = 2 * Math.PI * f * t;
    const b = bendFromMidline((x) => swimMidline(x, phase, 1));
    for (const [n, a] of Object.entries(b)) p.bend[n] = a;
    p.pecL.protract = p.pecR.protract = -1.0; p.pecL.depress = p.pecR.depress = 0.2; p.pecL.wrist = p.pecR.wrist = 0.0;
    p.morph.foldPecL = p.morph.foldPecR = 0.8; p.morph.foldD1 = 1; p.morph.foldD2 = 0.4; p.morph.foldAnal = 0.4; p.morph.foldCaudal = 0;
    p.pelvic = -0.2; p.morph.foldPelvic = 0.8;
    return p;
  }));
  // Blink: the eyes sink into the orbits and the dermal cups rise over them (Aiello et al. 2023: ~0.56 s, the cup
  // fully raised at 35 % of the blink)
  clips.push(sampleClip('Blink', 0.56, 60, (t) => {
    const p = landPose();
    const u = t / 0.56;
    const r = u < 0.35 ? smoothstep(0, 0.35, u) : 1 - smoothstep(0.5, 1.0, u);
    p.eyeL.retract = p.eyeR.retract = r;
    p.morph.blinkL = p.morph.blinkR = u < 0.35 ? smoothstep(0.05, 0.35, u) : 1 - smoothstep(0.45, 0.95, u);
    return p;
  }));
  // Feed: head pivots down over the prey on the propped pectorals, the lower jaw swings wide open, snaps shut,
  // then the cheeks pump (the 'hydrodynamic tongue' expels and re-takes the mouth water)
  clips.push(sampleClip('Feed', 1.1, 60, (t) => {
    const p = landPose();
    const down = smoothstep(0.0, 0.18, t) * (1 - smoothstep(0.55, 0.8, t));
    p.lift.J_head = 0.1 - 0.42 * down;
    p.lift.J_root = -0.08 * down;
    p.jaw = 0.95 * smoothstep(0.14, 0.24, t) * (1 - smoothstep(0.28, 0.36, t));
    p.morph.breathe = 0.6 * Math.max(0, Math.sin((t - 0.4) * 14)) * smoothstep(0.4, 0.5, t);
    p.eyeL.pitch = p.eyeR.pitch = -0.25 * down;
    return p;
  }));
  return clips;
}

export const CLIP_SPEED = { Crawl: 0.0215 / 0.48 };
export { TL_MM };
