// Skeleton, skin weights, rig axes and baked animation clips (Idle, Swim, Yawn).
// The clips are produced by the same pose model the viewer runs procedurally (src/fish/pose.js).
import { section, toObject, dirToObject, EYE, PIVOTS, OPERCLE, PREOPERCLE, RICTUS_S, gapeY, surfaceAt, botY } from './anatomy.mjs';
import { clamp, smoothstep } from '../../lib/noise.mjs';
import { pick } from './variant.mjs';
import { quat, computePose, defaultPose, breathe, yawnCurves } from '../../../src/creatures/species/mahaze/pose.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ------------------------------------------------------------------------------------------ joints
// pivots in fish space (mm); parent by name
const yc = (s) => section(s).yc;
const opHingeL = (() => { const p = surfaceAt(9.0, 2.7).p; return [p[0], p[1], p[2] - 0.2]; })();
// Suspensorium (hyomandibula + quadrate + pterygoids + preopercle, carrying the cheek and the gill cover):
// it swings laterally about the line through its two articulations with the skull, the palatine (front,
// at the lateral ethmoid) and the hyomandibula (back, under the rear of the orbit). Abduction widens the
// mouth cavity and the cheeks; the quadrates, and with them the rear ends of the lower-jaw halves, move out.
const PALATINE = pick([2.3, 3.4, 0.8], [2.6, 3.95, 0.85]);
const HYOMAND = pick([7.6, 4.5, 1.2], [7.9, 4.7, 1.25]);
// lower jaw: each half (dentary + articular) hinges on its quadrate and meets the other at the symphysis
const JAW_JOINT = [PIVOTS.jaw[0], PIVOTS.jaw[1], 1.55];
const SYMPHYSIS = pick([0.35, 1.5, 0], [0.35, 1.95, 0]);
const pecBase = (() => { const p = surfaceAt(12.45, 2.6).p; return [p[0], p[1], p[2] - 0.15]; })();

export const JOINTS = [
  { name: 'J_root', parent: null, at: [13.0, yc(13.0), 0] },
  { name: 'J_head', parent: 'J_root', at: [9.0, yc(9.0), 0] },
  { name: 'J_suspL', parent: 'J_head', at: HYOMAND },
  { name: 'J_suspR', parent: 'J_head', at: [HYOMAND[0], HYOMAND[1], -HYOMAND[2]] },
  { name: 'J_jawL', parent: 'J_head', at: JAW_JOINT },
  { name: 'J_jawR', parent: 'J_head', at: [JAW_JOINT[0], JAW_JOINT[1], -JAW_JOINT[2]] },
  { name: 'J_premax', parent: 'J_head', at: PIVOTS.premax },
  { name: 'J_hyoid', parent: 'J_head', at: PIVOTS.hyoid },
  { name: 'J_opercL', parent: 'J_suspL', at: opHingeL },
  { name: 'J_opercR', parent: 'J_suspR', at: [opHingeL[0], opHingeL[1], -opHingeL[2]] },
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
  // goby gill openings are restricted to the sides: below the pectoral base the branchiostegal membrane is
  // joined to the isthmus, so the lower part of the cover follows the cheek and throat, it does not flare
  const ends = smoothstep(Math.max(yBot, 1.1), 2.2, y) * smoothstep(yTop + 0.05, yTop - 0.5, y);
  return smoothstep(0.02, 0.85, u) * ends;
}

// Toward the mouth corner the lips stay joined by the lip fold: over the last ~1.6 mm both lips share the
// jaw motion (the upper lip is pulled down, the lower one moves less), so a gaping mouth has rounded
// corners instead of a slot that opens all the way to the rictus.
export const cornerSeal = (s) => smoothstep(RICTUS_S - 1.6, RICTUS_S, s);
function jawWeightBody(v) {
  const [s, y] = v.fish;
  const r = RICTUS_S;
  // behind the rictus the skin of the jaw angle blends softly into the cheek
  const yExt = gapeY(r) - Math.max(0, s - r) * 0.25;
  // the lower jaw ends at its joint with the quadrate (PIVOTS.jaw): skin behind it must not follow the
  // rotation (it would ride up and pinch a notch into the throat line)
  const soft = smoothstep(yExt + 0.1, yExt - 0.6, y) * smoothstep(PIVOTS.jaw[0] + 0.55, PIVOTS.jaw[0] - 0.35, s);
  const seal = cornerSeal(s);
  const gy = gapeY(Math.min(s, r));
  if (v.jawSide) {
    const front = 1 - 0.55 * seal;
    return s <= r ? front : front + (soft - front) * smoothstep(r, r + 0.3, s);
  }
  const lip = 0.45 * seal * smoothstep(gy + 0.6, gy + 0.05, y);
  return s > r ? Math.max(soft, lip * smoothstep(r + 0.5, r, s)) : lip;
}

// share of the head skin carried by the suspensorium: the cheek and gill-cover region below the eye,
// lateral surfaces only (the throat midline and the skull roof stay with the head)
export function suspWeight(s, y, z) {
  const q = section(clamp(s, 0.3, 30));
  const lat = Math.abs(z) / Math.max(q.w, 0.3);
  return smoothstep(RICTUS_S - 0.4, RICTUS_S + 1.6, s) * smoothstep(12.2, 10.9, s) *
    smoothstep(EYE.center[1] - 0.6, EYE.center[1] - 1.7, y) * smoothstep(0.22, 0.7, lat);
}
const suspJ = (z) => (z >= 0 ? J.J_suspL : J.J_suspR);
// the lower jaw is two halves: split a jaw influence smoothly across the symphysis
function jawSplit(w, z) {
  const f = smoothstep(-0.3, 0.3, z);
  return [[J.J_jawL, w * f], [J.J_jawR, w * (1 - f)]];
}

function combine(regional, s, susp = 0, z = 0) {
  let rest = 1;
  const out = [];
  for (const [j, w] of regional) if (w > 1e-3) { out.push([j, w]); rest -= w; }
  rest = Math.max(rest, 0);
  if (susp > 1e-3) out.push([suspJ(z), rest * susp]);
  for (const [j, w] of spineWeights(s)) out.push([j, w * rest * (1 - susp)]);
  return out;
}
// replace the J_head part of an explicit influence list by head + suspensorium
function withSusp(list, susp, z) {
  if (susp < 1e-3) return list;
  const out = [];
  for (const [j, w] of list) {
    if (j === J.J_head) { out.push([j, w * (1 - susp)], [suspJ(z), w * susp]); } else out.push([j, w]);
  }
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

function skinInfluence(v) {
  {
    const [s, y, z] = v.fish;
    const reg = [];
    const wj = clamp(jawWeightBody(v));
    if (wj > 0) reg.push(...jawSplit(wj, z));
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
    return combine(reg, s, suspWeight(s, y, z), z);
  }
}
export function bodyWeights(mesh) {
  return pack(mesh.verts.map(skinInfluence), mesh.verts.length);
}

function mouthUpperW(s, u, y, z) {
  const edge = smoothstep(0.3, 0.0, u);
  const seal = 0.45 * cornerSeal(s) * edge;
  // at the lip margin the same premaxilla influence as the skin it is stitched to (see bodyWeights)
  const pm = 0.9 * smoothstep(RICTUS_S + 0.3, RICTUS_S - 1.3, s) * edge;
  return withSusp([...jawSplit(seal, z), [J.J_premax, pm], [J.J_head, Math.max(0, 1 - seal - pm)]], suspWeight(s, y, z * 1.25), z);
}
function mouthLowerW(s, u, y, z) {
  const edgeJaw = 1 - 0.55 * cornerSeal(s) * smoothstep(0.3, 0.0, u);
  const jaw = edgeJaw + (0.35 - edgeJaw) * smoothstep(0.35, 1.0, u);
  const hy = 0.45 * smoothstep(0.4, 1.0, u);
  return withSusp([...jawSplit(jaw, z), [J.J_hyoid, hy], [J.J_head, Math.max(0, 1 - jaw - hy)]], suspWeight(s, y, z * 1.25), z);
}

export function interiorWeights(part, body) {
  const list = part.verts.map((v) => {
    const [s, y, z] = v.fish;
    // gill-chamber parts move exactly like the skin they hang from (so nothing pokes through); the chamber
    // wall and arches stay with the cheek, not with the swinging gill cover (operculum → its suspensorium)
    if (v.src >= 0 && body) {
      const inf = skinInfluence(body.verts[v.src]);
      if (v.zone === 'flapLining') return inf;
      return inf.map(([j, w]) => [j === J.J_opercL ? J.J_suspL : j === J.J_opercR ? J.J_suspR : j, w]);
    }
    const reg = [];
    const u = v.blend;
    switch (v.zone) {
      case 'mouthUpper':
        return mouthUpperW(s, u, y, z);
      case 'mouthLower':
        return mouthLowerW(s, u, y, z);
      case 'mouthWall': {
        // corner wall between the two sheets: blend their influences across (u) at this depth
        const d = v.uv[1];
        const m = new Map();
        for (const [j, w] of mouthUpperW(s, d, y, z)) m.set(j, (m.get(j) || 0) + w * (1 - u));
        for (const [j, w] of mouthLowerW(s, d, y, z)) m.set(j, (m.get(j) || 0) + w * u);
        return [...m.entries()];
      }
      case 'flapLining':
        // the lining sits just under the flap skin: never more suspensorium influence than the skin above it
        reg.push([z >= 0 ? J.J_opercL : J.J_opercR, opercWeight(v.fish)]);
        return combine(reg, s, suspWeight(s, y, z), z);
      default:
        // gill-chamber wall and arches hang from the suspensorium and the hyoid arch laterally
        return combine([], s, 0.6 * suspWeight(s, y, z * 1.15), z);
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
const suspAxisL = nrm(dirToObject(sub(PALATINE, HYOMAND)));
const suspAxisR = [-suspAxisL[0], suspAxisL[1], suspAxisL[2]];
// quadrate distance from the suspensorium axis over the jaw length: quadrate lateral travel → ramus angle
const quadR = (() => {
  const a = HYOMAND, d = nrm(sub(PALATINE, HYOMAND)), v = sub(JAW_JOINT, a);
  const along = dot(v, d);
  return Math.hypot(v[0] - d[0] * along, v[1] - d[1] * along, v[2] - d[2] * along);
})();
const jawLen = Math.hypot(JAW_JOINT[0] - SYMPHYSIS[0], JAW_JOINT[1] - SYMPHYSIS[1], JAW_JOINT[2] - SYMPHYSIS[2]);
export const AXES = {
  jaw: axisFor('J_jawL', X, [1.0, 1.0, 0], [0, -1, 0]),
  suspL: axisFor('J_suspL', suspAxisL, [5.5, 1.0, 2.5], [1, 0, 0]),
  suspR: axisFor('J_suspR', suspAxisR, [5.5, 1.0, -2.5], [-1, 0, 0]),
  // lower-jaw geometry (object space, m) for the two-halves jaw (see pose.js)
  jawJointL: toObject(JAW_JOINT),
  symphysis: toObject(SYMPHYSIS),
  jawSpreadK: quadR / jawLen,
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
    // planted pectorals: a slight twitch with each breath and a faint membrane ripple
    p.scullPhase = (2 * Math.PI * 4 * t) / idleDur;
    p.pecAbdL += 0.012 * Math.sin(2 * Math.PI * 1.15 * t); p.pecAbdR = p.pecAbdL;
    return p;
  });
  // Swim: one burst cycle at 8 Hz with streamlined fins (pectorals pressed to the flanks)
  const f = 8;
  const swim = sampleClip('Swim', 1 / f, 240, (t) => {
    const p = defaultPose();
    p.phase = 2 * Math.PI * f * t;
    p.gain = 1;
    p.headPitch = 0;
    p.pecAbdL = p.pecAbdR = -0.06; p.pecDepL = p.pecDepR = 0;
    p.foldPecL = p.foldPecR = 0.85; p.scullAmpL = p.scullAmpR = 0;
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
    p.susp = 0.22 * y.susp;
    p.opercL = p.opercR = 0.3 * y.operc;
    p.headPitch += 0.09 * y.open;
    p.foldD1 = 0.55 * (1 - y.fins); p.foldD2 = 0.3 * (1 - y.fins); p.foldAnal = 0.35 * (1 - y.fins); p.foldCaudal = 0.45 * (1 - y.fins);
    p.pecAbdL = p.pecAbdR = 0.4 + 0.25 * y.fins;
    return p;
  });
  return [idle, swim, yawn];
}
