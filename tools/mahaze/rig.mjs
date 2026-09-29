// Skeleton, skin weights and animation clips (idle breathing, swim burst, yawn).
import { section, toObject, dirToObject, EYE, PIVOTS, OPERCLE, PREOPERCLE, RICTUS_S, gapeY, surfaceAt, topY, botY } from './anatomy.mjs';
import { clamp, smoothstep } from '../lib/noise.mjs';

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ------------------------------------------------------------------------------------------ joints
// pivots in fish space (mm); parent by name
const yc = (s) => section(s).yc;
const opHingeL = (() => { const p = surfaceAt(8.9, 2.4).p; return [p[0], p[1], p[2] - 0.2]; })();
const pecBase = (() => { const p = surfaceAt(12.3, 2.3).p; return [p[0], p[1], p[2] - 0.15]; })();

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
  { name: 'J_pelvic', parent: 'J_root', at: [11.8, botY(11.8), 0] },
  { name: 'J_sp1', parent: 'J_root', at: [16.5, yc(16.5), 0] },
  { name: 'J_sp2', parent: 'J_sp1', at: [20.5, yc(20.5), 0] },
  { name: 'J_sp3', parent: 'J_sp2', at: [24.5, yc(24.5), 0] },
  { name: 'J_sp4', parent: 'J_sp3', at: [28.5, yc(28.5), 0] },
  { name: 'J_sp5', parent: 'J_sp4', at: [32.5, yc(32.5), 0] },
  { name: 'J_sp6', parent: 'J_sp5', at: [36.5, yc(36.5), 0] },
  { name: 'J_sp7', parent: 'J_sp6', at: [40.0, yc(40.0), 0] },
  { name: 'J_caudal', parent: 'J_sp7', at: [43.0, yc(41.0), 0] },
  { name: 'J_caudal2', parent: 'J_caudal', at: [46.5, yc(41.0), 0] },
  { name: 'J_d1', parent: 'J_root', at: [13.6, topY(13.6), 0] },
  { name: 'J_d2', parent: 'J_sp1', at: [19.2, topY(19.2), 0] },
  { name: 'J_anal', parent: 'J_sp2', at: [23.7, botY(23.7), 0] },
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
  const [s, y, z] = v.fish;
  const r = RICTUS_S;
  const yExt = gapeY(r) - Math.max(0, s - r) * 0.3;
  const soft = smoothstep(yExt + 0.15, yExt - 0.75, y) * smoothstep(r + 2.6, r + 0.1, s);
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
    let q = arr.map(([, w]) => Math.round(w * 255));
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
      const wp = smoothstep(gy + 0.85, gy + 0.2, y) * smoothstep(RICTUS_S + 0.3, RICTUS_S - 1.4, s);
      if (wp > 0) reg.push([J.J_premax, wp * 0.9]);
    }
    const hy = smoothstep(1.4, 0.25, y) * smoothstep(4.6, 6.2, s) * smoothstep(11.2, 9.2, s) * (1 - wj);
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

export function finWeights(name, fish, rayT) {
  const n = rayT.length;
  const bone = { Fin_Pectoral_L: J.J_pecL, Fin_Pectoral_R: J.J_pecR, Fin_Dorsal1: J.J_d1, Fin_Dorsal2: J.J_d2, Fin_Anal: J.J_anal, Fin_Pelvic: J.J_pelvic }[name];
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = fish[i * 3];
    if (bone === undefined) { list.push(spineWeights(s)); continue; }
    const f = smoothstep(0.02, 0.3, rayT[i]);
    list.push(combine([[bone, f]], s));
  }
  return pack(list, n);
}

// ------------------------------------------------------------------------------------------ clips
const quat = (axis, ang) => { const a = nrm(axis); const h = ang / 2; const sn = Math.sin(h); return [a[0] * sn, a[1] * sn, a[2] * sn, Math.cos(h)]; };
function rotateAbout(p, pivot, axis, ang) {
  const q = quat(axis, ang);
  const v = sub(p, pivot);
  // v' = q v q*
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [pivot[0] + v[0] + w * tx + (y * tz - z * ty), pivot[1] + v[1] + w * ty + (z * tx - x * tz), pivot[2] + v[2] + w * tz + (x * ty - y * tx)];
}
// sign so that a positive angle moves `probe` (fish space) along `want` (object space)
function signFor(joint, axis, probeFish, want) {
  const pv = JOINTS[J[joint]].obj;
  const p = toObject(probeFish);
  const d = sub(rotateAbout(p, pv, axis, 0.1), p);
  return dot(d, want) >= 0 ? 1 : -1;
}

const X = [1, 0, 0], Y = [0, 1, 0];
const opAxis = nrm(dirToObject(sub([PIVOTS.opercBottom[0], PIVOTS.opercBottom[1], 0], [PIVOTS.opercTop[0], PIVOTS.opercTop[1], 0])));
const AX = {
  jaw: [X, signFor('J_jaw', X, [1.0, 1.4, 0], [0, -1, 0])],
  hyoid: [X, signFor('J_hyoid', X, [8.0, 0.4, 0], [0, -1, 0])],
  opercL: [opAxis, signFor('J_opercL', opAxis, [11.2, 2.6, 3.0], [1, 0, 0])],
  opercR: [opAxis, signFor('J_opercR', opAxis, [11.2, 2.6, -3.0], [-1, 0, 0])],
  pecL: [Y, signFor('J_pecL', Y, [18.0, 2.0, 4.5], [1, 0, 0])],
  pecR: [Y, signFor('J_pecR', Y, [18.0, 2.0, -4.5], [-1, 0, 0])],
  d1: [X, signFor('J_d1', X, [16.0, 9.5, 0], [0, 1, 0])],
  d2: [X, signFor('J_d2', X, [24.0, 9.5, 0], [0, 1, 0])],
  anal: [X, signFor('J_anal', X, [27.0, -2.5, 0], [0, -1, 0])],
  headUp: [X, signFor('J_head', X, [2.0, 3.0, 0], [0, 1, 0])],
};
const rot = (name, deg) => quat(AX[name][0], AX[name][1] * deg * DEG);
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

function sampleClip(name, duration, fps, fn, loop) {
  const n = Math.round(duration * fps) + 1;
  const times = new Float32Array(n);
  const tracks = new Map(); // key -> {joint, path, values: []}
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * duration;
    times[f] = t;
    const pose = fn(loop ? t % duration : t);
    for (const [key, val] of Object.entries(pose)) {
      if (!tracks.has(key)) {
        const [joint, path] = key.split('.');
        tracks.set(key, { joint: J[joint], path, values: [] });
      }
      tracks.get(key).values.push(...val);
    }
  }
  return { name, duration, channels: [...tracks.values()].map((tr) => ({ ...tr, times, values: new Float32Array(tr.values) })) };
}

const restT = (name) => {
  const j = JOINTS[J[name]];
  const par = j.parent ? JOINTS[J[j.parent]].obj : [0, 0, 0];
  return sub(j.obj, par);
};

export function buildClips() {
  const chain = ['J_head', 'J_root', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2'];
  const premaxT = restT('J_premax');

  const idle = sampleClip('Idle', 4.0, 30, (t) => {
    const b = (lag = 0) => 0.5 - 0.5 * Math.cos(2 * Math.PI * 1.5 * (t - lag));
    const pose = {};
    pose['J_jaw.rotation'] = rot('jaw', 3.5 * b());
    pose['J_premax.translation'] = [premaxT[0], premaxT[1], premaxT[2] + 0.00003 * b()];
    pose['J_hyoid.rotation'] = rot('hyoid', 5 * b(0.07));
    pose['J_opercL.rotation'] = rot('opercL', 6 * b(0.22));
    pose['J_opercR.rotation'] = rot('opercR', 6 * b(0.22));
    pose['J_pecL.rotation'] = rot('pecL', 10 + 7 * Math.sin(2 * Math.PI * 0.5 * t));
    pose['J_pecR.rotation'] = rot('pecR', 10 + 7 * Math.sin(2 * Math.PI * 0.5 * t + Math.PI));
    pose['J_d1.rotation'] = rot('d1', 3 * Math.sin(2 * Math.PI * 0.25 * t));
    chain.forEach((j, k) => { pose[`${j}.rotation`] = quat(Y, 0.5 * DEG * Math.sin(2 * Math.PI * 0.25 * t - k * 0.35)); });
    pose['J_caudal.rotation'] = quat(Y, 2 * DEG * Math.sin(2 * Math.PI * 0.5 * t));
    return pose;
  }, true);

  const T = 0.3;
  const amp = [-1.6, 1.8, 2.8, 3.8, 4.8, 5.8, 6.8, 7.6, 8.4, 12, 10];
  const swim = sampleClip('Swim', T, 200, (t) => {
    const pose = {};
    chain.forEach((j, k) => { pose[`${j}.rotation`] = quat(Y, amp[k] * DEG * Math.sin((2 * Math.PI * t) / T - k * 0.62)); });
    pose['J_pecL.rotation'] = rot('pecL', -34 + 2 * Math.sin((2 * Math.PI * t) / T));
    pose['J_pecR.rotation'] = rot('pecR', -34 + 2 * Math.sin((2 * Math.PI * t) / T));
    pose['J_d1.rotation'] = rot('d1', -35);
    pose['J_d2.rotation'] = rot('d2', -18);
    pose['J_anal.rotation'] = rot('anal', -18);
    return pose;
  }, true);

  const yawnEnv = (t) => {
    if (t < 0) return 0;
    if (t < 0.65) return ease(t / 0.65);
    if (t < 1.2) return 1 + 0.07 * Math.sin((Math.PI * (t - 0.65)) / 0.55);
    if (t < 1.45) return 1 - 0.95 * ease((t - 1.2) / 0.25);
    return 0.05 * (1 - ease((t - 1.45) / 1.0));
  };
  const yawn = sampleClip('Yawn', 2.6, 30, (t) => {
    const e = yawnEnv(t);
    const eo = yawnEnv(t - 0.18) + 0.35 * Math.exp(-(((t - 1.85) / 0.13) ** 2));
    const pose = {};
    pose['J_jaw.rotation'] = rot('jaw', 32 * e);
    pose['J_premax.translation'] = [premaxT[0], premaxT[1] - 0.00012 * e, premaxT[2] + 0.00045 * e];
    pose['J_hyoid.rotation'] = rot('hyoid', 17 * yawnEnv(t - 0.1));
    pose['J_opercL.rotation'] = rot('opercL', 28 * eo);
    pose['J_opercR.rotation'] = rot('opercR', 28 * eo);
    pose['J_head.rotation'] = rot('headUp', 4 * e);
    pose['J_d1.rotation'] = rot('d1', 12 * e);
    pose['J_d2.rotation'] = rot('d2', 8 * e);
    pose['J_anal.rotation'] = rot('anal', 6 * e);
    pose['J_pecL.rotation'] = rot('pecL', 16 * e);
    pose['J_pecR.rotation'] = rot('pecR', 16 * e);
    return pose;
  }, false);

  return [idle, swim, yawn];
}

export { quat, qmul };
