// Skeleton, skin weights, rig axes and baked animation clips (Idle, Swim, Yawn).
// The clips are produced by the same pose model the viewer runs procedurally (src/fish/pose.js).
import { section, toObject, dirToObject, EYE, PIVOTS, OPERCLE, PREOPERCLE, RICTUS_S, gapeY, surfaceAt, botY } from './anatomy.mjs';
import { clamp, smoothstep } from '../lib/noise.mjs';
import { quat, computePose, defaultPose, breathe, yawnCurves } from '../../src/fish/pose.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ------------------------------------------------------------------------------------------ joints
// pivots in fish space (mm); parent by name
const yc = (s) => section(s).yc;
const opHingeL = (() => { const p = surfaceAt(9.0, 2.7).p; return [p[0], p[1], p[2] - 0.2]; })();
const pecBase = (() => { const p = surfaceAt(12.45, 2.6).p; return [p[0], p[1], p[2] - 0.15]; })();

export const JOINTS = [
  { name: 'J_root', parent: null, at: [13.0, yc(13.0), 0] },
  { name: 'J_head', parent: 'J_root', at: [9.0, yc(9.0), 0] },
  { name: 'J_jaw', parent: 'J_head', at: PIVOTS.jaw },
  { name: 'J_premax', parent: 'J_head', at: PIVOTS.premax },
  { name: 'J_hyoid', parent: 'J_head', at: PIVOTS.hyoid },
  { name: 'J_opercL', parent: 'J_head', at: opHingeL },
  { name: 'J_opercR', parent: 'J_head', at: [opHingeL[0], opHingeL[1], -opHingeL[2]] },
  { name: 'J_eyeL', parent: 'J_head', at: EYE.center },
  { name: 'J_eyeR', parent: 'J_head', at: [EYE.center[0], EYE.center[1], -EYE.center[2]] },
  { name: 'J_pecL', parent: 'J_root', at: pecBase },
  { name: 'J_pecR', parent: 'J_root', at: [pecBase[0], pecBase[1], -pecBase[2]] },
  { name: 'J_pelvic', parent: 'J_root', at: [12.0, botY(12.0), 0] },
  { name: 'J_sp1', parent: 'J_root', at: [16.5, yc(16.5), 0] },
  { name: 'J_sp2', parent: 'J_sp1', at: [20.5, yc(20.5), 0] },
  { name: 'J_sp3', parent: 'J_sp2', at: [24.5, yc(24.5), 0] },
  { name: 'J_sp4', parent: 'J_sp3', at: [28.5, yc(28.5), 0] },
  { name: 'J_sp5', parent: 'J_sp4', at: [32.5, yc(32.5), 0] },
  { name: 'J_sp6', parent: 'J_sp5', at: [36.5, yc(36.5), 0] },
  { name: 'J_sp7', parent: 'J_sp6', at: [40.0, yc(40.0), 0] },
  { name: 'J_caudal', parent: 'J_sp7', at: [43.0, yc(41.0), 0] },
  { name: 'J_caudal2', parent: 'J_caudal', at: [46.5, yc(41.0), 0] },
];
export const J = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));
JOINTS.forEach((j) => { j.obj = toObject(j.at); });

// chain used for bending (s position, joint)
const SPINE = [[9.0, 'J_head'], [13.0, 'J_root'], [16.5, 'J_sp1'], [20.5, 'J_sp2'], [24.5, 'J_sp3'], [28.5, 'J_sp4'], [32.5, 'J_sp5'], [36.5, 'J_sp6'], [40.0, 'J_sp7'], [43.0, 'J_caudal'], [46.5, 'J_caudal2']];

function spineWeights(s) {
  if (s <= SPINE[0][0]) return [[J.J_head, 1]];
  for (let k = 0; k < SPINE.length - 1; k++) {
    const [s0, a] = SPINE[k], [s1, b] = SPINE[k + 1];
    if (s <= s1) {
      const f = smoothstep(0, 1, (s - s0) / (s1 - s0));
      return [[J[a], 1 - f], [J[b], f]];
    }
  }
  return [[J.J_caudal2, 1]];
}

function polyS(poly, y) {
  // poly ordered top → bottom in y
  if (y >= poly[0][1]) return poly[0][0];
  for (let i = 0; i < poly.length - 1; i++) {
    const [s0, y0] = poly[i], [s1, y1] = poly[i + 1];
    if (y <= y0 && y >= y1) return s0 + ((y - y0) / (y1 - y0)) * (s1 - s0);
  }
  return poly[poly.length - 1][0];
}

function opercWeight(p) {
  const [s, y] = p;
  const yTop = OPERCLE[0][1], yBot = OPERCLE[OPERCLE.length - 1][1];
  const sh = polyS(PREOPERCLE, y), sm = polyS(OPERCLE, y);
  const u = (s - sh) / Math.max(sm - sh, 0.3);
  const ends = smoothstep(yBot - 0.05, yBot + 0.55, y) * smoothstep(yTop + 0.05, yTop - 0.5, y);
  return smoothstep(0.02, 0.85, u) * ends;
}

function jawWeightBody(v) {
  const [s, y] = v.fish;
  const r = RICTUS_S;
  // behind the rictus the skin of the jaw angle blends softly into the cheek
  const yExt = gapeY(r) - Math.max(0, s - r) * 0.25;
  const soft = smoothstep(yExt + 0.1, yExt - 0.6, y) * smoothstep(r + 2.2, r + 0.1, s);
  if (s <= r - 0.8) return v.jawSide ? 1 : 0;
  if (v.jawSide) return 1 + (soft - 1) * smoothstep(r - 0.8, r + 0.05, s);
  return s > r ? soft : 0;
}

function combine(regional, s) {
  let rest = 1;
  const out = [];
  for (const [j, w] of regional) if (w > 1e-3) { out.push([j, w]); rest -= w; }
  rest = Math.max(rest, 0);
  for (const [j, w] of spineWeights(s)) out.push([j, w * rest]);
  return out;
}

function pack(list, n) {
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

export function bodyWeights(mesh) {
  const list = mesh.verts.map((v) => {
    const [s, y, z] = v.fish;
    const reg = [];
    const wj = clamp(jawWeightBody(v));
    if (wj > 0) reg.push([J.J_jaw, wj]);
    const gy = gapeY(Math.min(s, RICTUS_S));
    if (!v.jawSide && s < RICTUS_S + 0.3 && y > gy - 0.05) {
      const wp = smoothstep(gy + 0.75, gy + 0.18, y) * smoothstep(RICTUS_S + 0.3, RICTUS_S - 1.3, s);
      if (wp > 0) reg.push([J.J_premax, wp * 0.9]);
    }
    const hy = smoothstep(1.3, 0.2, y) * smoothstep(4.4, 6.0, s) * smoothstep(11.4, 9.4, s) * (1 - wj);
    if (hy > 0) reg.push([J.J_hyoid, hy * 0.9]);
    if (v.flap && v.cut !== 'opercBody') {
      const wo = opercWeight(v.fish) * (1 - hy * 0.5);
      if (wo > 0) reg.push([z >= 0 ? J.J_opercL : J.J_opercR, wo]);
    }
    return combine(reg, s);
  });
  return pack(list, mesh.verts.length);
}

export function interiorWeights(part) {
  const list = part.verts.map((v) => {
    const s = v.fish[0];
    const reg = [];
    const u = v.blend;
    switch (v.zone) {
      case 'mouthUpper':
        reg.push([J.J_premax, 0.8 * smoothstep(0.3, 0.0, u)]);
        reg.push([J.J_head, 1 - 0.8 * smoothstep(0.3, 0.0, u)]);
        return reg;
      case 'mouthLower': {
        const jaw = 1 + (0.35 - 1) * smoothstep(0.35, 1.0, u);
        const hy = 0.45 * smoothstep(0.4, 1.0, u);
        return [[J.J_jaw, jaw], [J.J_hyoid, hy], [J.J_head, Math.max(0, 1 - jaw - hy)]];
      }
      case 'mouthWall':
        return [[J.J_jaw, u * 0.85], [J.J_hyoid, u * 0.1], [J.J_head, 1 - u * 0.95]];
      case 'flapLining':
        reg.push([v.fish[2] >= 0 ? J.J_opercL : J.J_opercR, opercWeight(v.fish)]);
        return combine(reg, s);
      default:
        return combine([], s);
    }
  });
  return pack(list, part.verts.length);
}

/**
 * Dorsal and anal fins ride on the spine segment under each ray base (so they never detach from a
 * bending body); pectorals and pelvics hinge on their own joints; the caudal fin follows the tail.
 */
export function finWeights(name, fish, rayT, baseS) {
  const n = rayT.length;
  const bone = { Fin_Pectoral_L: J.J_pecL, Fin_Pectoral_R: J.J_pecR, Fin_Pelvic: J.J_pelvic }[name];
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = fish[i * 3];
    if (name === 'Fin_Caudal') { list.push(spineWeights(s)); continue; }
    if (bone === undefined) { list.push(spineWeights(baseS[i])); continue; }
    const f = smoothstep(0.02, 0.3, rayT[i]);
    list.push(combine([[bone, f]], s));
  }
  return pack(list, n);
}

// ------------------------------------------------------------------------------------------ axes
function rotateAbout(p, pivot, axis, ang) {
  const q = quat(axis, ang);
  const v = sub(p, pivot);
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [pivot[0] + v[0] + w * tx + (y * tz - z * ty), pivot[1] + v[1] + w * ty + (z * tx - x * tz), pivot[2] + v[2] + w * tz + (x * ty - y * tx)];
}
// axis (object space) oriented so that a positive angle moves `probeFish` along `want`
function axisFor(joint, axis, probeFish, want) {
  const pv = JOINTS[J[joint]].obj;
  const p = toObject(probeFish);
  const d = sub(rotateAbout(p, pv, axis, 0.1), p);
  return dot(d, want) >= 0 ? axis.slice() : axis.map((c) => -c);
}
const X = [1, 0, 0], Yax = [0, 1, 0], Z = [0, 0, 1];
const opAxis = nrm(dirToObject(sub([PIVOTS.opercBottom[0], PIVOTS.opercBottom[1], 0], [PIVOTS.opercTop[0], PIVOTS.opercTop[1], 0])));
export const AXES = {
  jaw: axisFor('J_jaw', X, [1.0, 1.0, 0], [0, -1, 0]),
  hyoid: axisFor('J_hyoid', X, [8.5, 0.3, 0], [0, -1, 0]),
  opercL: axisFor('J_opercL', opAxis, [11.4, 2.6, 3.2], [1, 0, 0]),
  opercR: axisFor('J_opercR', opAxis, [11.4, 2.6, -3.2], [-1, 0, 0]),
  pecL: axisFor('J_pecL', Yax, [18.0, 2.0, 4.5], [1, 0, 0]),
  pecR: axisFor('J_pecR', Yax, [18.0, 2.0, -4.5], [-1, 0, 0]),
  pecDepL: axisFor('J_pecL', Z, [18.0, 2.0, 4.5], [0, -1, 0]),
  pecDepR: axisFor('J_pecR', Z, [18.0, 2.0, -4.5], [0, -1, 0]),
  headUp: axisFor('J_head', X, [1.0, 2.0, 0], [0, 1, 0]),
};

// ------------------------------------------------------------------------------------------ clips
function sampleClip(name, duration, fps, fn) {
  const n = Math.round(duration * fps) + 1;
  const times = new Float32Array(n);
  const rot = new Map(), tr = new Map(), mw = new Map();
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * duration;
    times[f] = t;
    const P = computePose(fn(t), AXES);
    for (const [k, v] of Object.entries(P.q)) { if (!rot.has(k)) rot.set(k, []); rot.get(k).push(...v); }
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

export function buildClips() {
  // Idle: perched on the bottom, ventilating (~70 /min), pectorals gently sculling
  // (4 breaths = 3 sculling cycles, so the clip loops seamlessly)
  const idleDur = 4 / 1.15;
  const idle = sampleClip('Idle', idleDur, 30, (t) => {
    const p = breathe(defaultPose(), t);
    p.scullPhase = (2 * Math.PI * 3 * t) / idleDur;
    return p;
  });
  // Swim: one burst cycle at 8 Hz with streamlined fins (pectorals pressed to the flanks)
  const f = 8;
  const swim = sampleClip('Swim', 1 / f, 240, (t) => {
    const p = defaultPose();
    p.phase = 2 * Math.PI * f * t;
    p.gain = 1;
    p.headPitch = 0;
    p.pecAbdL = p.pecAbdR = -0.36; p.pecDepL = p.pecDepR = 0;
    p.foldPecL = p.foldPecR = 0.75; p.scullAmpL = p.scullAmpR = 0;
    p.foldD1 = 0.15; p.foldD2 = 0.05; p.foldAnal = 0.1; p.foldCaudal = 0; p.foldPelvic = 0.6;
    p.flexCaudal = -0.8 * Math.cos(p.phase - 2.2);
    p.flexD = -0.35 * Math.cos(p.phase - 1.2);
    return p;
  });
  // Yawn: slow gape with raised head and erect fins, brief hold, fast snap shut, opercular flush
  const yawn = sampleClip('Yawn', 2.4, 30, (t) => {
    const p = defaultPose();
    const y = yawnCurves(t);
    p.jaw = 0.62 * y.open;
    p.premax = y.open;
    p.hyoid = 0.3 * y.hyoid;
    p.opercL = p.opercR = 0.42 * y.operc;
    p.headPitch += 0.09 * y.open;
    p.foldD1 = 0.55 * (1 - y.fins); p.foldD2 = 0.3 * (1 - y.fins); p.foldAnal = 0.35 * (1 - y.fins); p.foldCaudal = 0.45 * (1 - y.fins);
    p.pecAbdL = p.pecAbdR = 0.5 + 0.25 * y.fins;
    return p;
  });
  return [idle, swim, yawn];
}
