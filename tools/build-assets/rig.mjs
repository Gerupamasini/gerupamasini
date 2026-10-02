// 62-bone Hero rig (docs/yamame/spec/05_アニメーション仕様.md §5.1.2) and skin-weight assignment. Pure data; no three.js.
// Rest pose = identity rotations; bone positions are body-local rest positions (see CONTRACT.md).

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const SPINE_COUNT = 24;
export const FIN_IDS = { dorsal: 0, adipose: 1, pectoral_R: 2, pectoral_L: 3, pelvic_R: 4, pelvic_L: 5, anal: 6, caudal: 7 };

export function buildRig(surface, params, extra = {}) {
  const SL = surface.SL; const F = params.fins;
  const bones = []; const index = new Map();
  const add = (name, parent, pos) => { index.set(name, bones.length); bones.push({ name, parent, pos }); return bones.length - 1; };
  const yAt = (s) => surface.section(clamp(s, 0, 1)).c * SL;
  const nearestSpine = (s) => `spine_${String(clamp(Math.round(s * SPINE_COUNT), 0, SPINE_COUNT - 1)).padStart(2, '0')}`;
  const P = (s, alpha, off = 0) => surface.point(s, alpha, off);

  add('fish_root', null, [0, 0, 0]);
  const spineS = [];
  for (let j = 0; j < SPINE_COUNT; j++) {
    const s = j / SPINE_COUNT; spineS.push(s);
    add(`spine_${String(j).padStart(2, '0')}`, j === 0 ? 'fish_root' : `spine_${String(j - 1).padStart(2, '0')}`, [surface.sToX(s), yAt(s), 0]);
  }
  // head
  const hinge = extra.jawHinge || [surface.sToX(params.mouth.corner_s.v), yAt(params.mouth.corner_s.v) - 0.003, 0];
  add('jaw_lower', 'spine_03', hinge);
  for (const side of ['L', 'R']) {
    const z = side === 'R' ? 1 : -1;
    const lip = P(0.04, side === 'R' ? 1.65 : (2 * Math.PI - 1.65));
    add(`maxilla_${side}`, 'spine_01', [lip[0], lip[1], lip[2]]);
  }
  add('hyoid', 'spine_03', [surface.sToX(0.13), P(0.13, Math.PI)[1] + 0.002, 0]);
  const opS = params.operculum.edge_s.v - 0.04;
  for (const side of ['L', 'R']) {
    const a = side === 'R' ? 0.72 : (2 * Math.PI - 0.72);
    const hp = P(opS, a);
    add(`opercle_${side}`, 'spine_05', [hp[0], hp[1], hp[2]]);
  }
  for (const side of ['L', 'R']) {
    const c = extra.eyeCenters ? extra.eyeCenters[side] : null;
    const sE = params.eye.center_s.v;
    const a = side === 'R' ? surface.alphaAtHeight(sE, 0.0045) : 2 * Math.PI - surface.alphaAtHeight(sE, 0.0045);
    const sp = P(sE, a, -0.003);
    add(`eye_${side}`, 'spine_02', c || [sp[0], sp[1], sp[2]]);
  }
  // paired fins
  const finBase = (s, alpha) => P(s, alpha, -0.0004);
  for (const side of ['R', 'L']) {
    const pa = side === 'R' ? 2.55 : (2 * Math.PI - 2.55);        // ~lower flank, behind the gill cover
    const pb = finBase(F.pectoral.origin_s, pa);
    add(`pectoral_${side}`, nearestSpine(F.pectoral.origin_s), [pb[0], pb[1], pb[2]]);
    for (let r = 0; r < 3; r++) add(`pectoral_${side}_r${r}`, `pectoral_${side}`, [pb[0] - 0.012 * (r + 1) * 0.5, pb[1] - 0.003 * (r + 1), pb[2] + (side === 'R' ? 1 : -1) * 0.004]);
  }
  for (const side of ['R', 'L']) {
    const pa = side === 'R' ? 2.85 : (2 * Math.PI - 2.85);
    const pb = finBase(F.pelvic.origin_s, pa);
    add(`pelvic_${side}`, nearestSpine(F.pelvic.origin_s), [pb[0], pb[1], pb[2]]);
    for (let r = 0; r < 2; r++) add(`pelvic_${side}_r${r}`, `pelvic_${side}`, [pb[0] - 0.01 * (r + 1) * 0.5, pb[1] - 0.004 * (r + 1), pb[2] + (side === 'R' ? 1 : -1) * 0.002]);
  }
  // median fins
  const dOrig = finBase(F.dorsal.origin_s, 0);
  add('dorsal_hinge', nearestSpine(F.dorsal.origin_s + F.dorsal.base_len * 0.4), [surface.sToX(F.dorsal.origin_s + F.dorsal.base_len * 0.45), P(F.dorsal.origin_s + F.dorsal.base_len * 0.45, 0, -0.0004)[1], 0]);
  for (let r = 0; r < 3; r++) add(`dorsal_r${r}`, 'dorsal_hinge', [surface.sToX(F.dorsal.origin_s + F.dorsal.base_len * (0.15 + 0.35 * r)), P(F.dorsal.origin_s + F.dorsal.base_len * (0.15 + 0.35 * r), 0)[1] + 0.006, 0]);
  const aMid = F.anal.origin_s + F.anal.base_len * 0.45;
  add('anal_hinge', nearestSpine(aMid), [surface.sToX(aMid), P(aMid, Math.PI, -0.0004)[1], 0]);
  for (let r = 0; r < 2; r++) { const sr = F.anal.origin_s + F.anal.base_len * (0.2 + 0.5 * r); add(`anal_r${r}`, 'anal_hinge', [surface.sToX(sr), P(sr, Math.PI)[1] - 0.005, 0]); }
  add('adipose_01', nearestSpine(F.adipose.origin_s), [surface.sToX(F.adipose.origin_s + 0.02), P(F.adipose.origin_s + 0.02, 0, -0.0004)[1], 0]);
  add('adipose_02', 'adipose_01', [surface.sToX(F.adipose.origin_s + F.adipose.base_len), P(F.adipose.origin_s + F.adipose.base_len, 0)[1] + 0.003, 0]);
  add('caudal_hub', 'spine_23', [surface.sToX(1.0), yAt(1.0), 0]);
  const cl = F.caudal.length * SL, span = F.caudal.span * SL;
  [['u2', 0.42], ['u1', 0.21], ['mid', 0], ['l1', -0.21], ['l2', -0.42]].forEach(([n, f]) => add(`caudal_ray_${n}`, 'caudal_hub', [surface.sToX(1.0) - 0.45 * cl, yAt(1.0) + f * span, 0]));
  return { bones, index, spineS };
}

export function boneLocalTranslations(rig) {
  return rig.bones.map((b) => {
    const par = b.parent ? rig.bones[rig.index.get(b.parent)] : null;
    return par ? [b.pos[0] - par.pos[0], b.pos[1] - par.pos[1], b.pos[2] - par.pos[2]] : [...b.pos];
  });
}

// ---- weights -----------------------------------------------------------------------------------------------------
// Collect up to 4 influences (bone index, weight); merge duplicates; normalise.
function pack(entries) {
  const m = new Map(); for (const [b, w] of entries) if (w > 1e-5) m.set(b, (m.get(b) || 0) + w);
  let arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = arr.reduce((s, e) => s + e[1], 0) || 1;
  while (arr.length < 4) arr.push([0, 0]);
  return arr.map(([b, w]) => [b, w / sum]);
}

export function spineEntries(rig, s, scale = 1) {
  const x = clamp(s, 0, 1) * SPINE_COUNT; let j = Math.min(Math.floor(x), SPINE_COUNT - 1); const t = smooth(0, 1, x - j);
  const b0 = rig.index.get(`spine_${String(j).padStart(2, '0')}`);
  if (j >= SPINE_COUNT - 1) return [[b0, scale]];
  const b1 = rig.index.get(`spine_${String(j + 1).padStart(2, '0')}`);
  return [[b0, (1 - t) * scale], [b1, t * scale]];
}

export function bodyWeights(rig, attrs, count, extra = {}) {
  const J = new Uint16Array(count * 4), W = new Float32Array(count * 4);
  const jaw = rig.index.get('jaw_lower');
  const opR = rig.index.get('opercle_R'), opL = rig.index.get('opercle_L');
  const e = extra.operculumEdge;           // s of the free rear edge of the gill cover
  for (let v = 0; v < count; v++) {
    const f = attrs._JAW ? attrs._JAW[v] : 0; const s = attrs._S[v];
    const list = [];
    // gill-cover flap: weight grows from the hinge (e-0.045) to the free edge, lateral sectors only (alpha ~ right flank pi/2 .. ventral, mirrored on the left)
    let wop = 0, opBone = opR;
    if (e !== undefined && attrs._ALPHA && f === 0) {
      const a = attrs._ALPHA[v]; const right = a <= Math.PI; const aa = right ? a : 2 * Math.PI - a;   // 0 dorsal .. pi ventral
      const lat = smooth(0.45, 0.85, aa) * (1 - smooth(2.35, 2.75, aa));
      wop = smooth(e - 0.045, e - 0.004, s) * (1 - smooth(e + 0.002, e + 0.012, s)) * lat * 0.9;
      opBone = right ? opR : opL;
    }
    if (f > 0) list.push([jaw, f]);
    list.push(...spineEntries(rig, s, (1 - f) * (1 - wop)));
    if (wop > 0) list.push([opBone, (1 - f) * wop]);
    const p = pack(list);
    for (let k = 0; k < 4; k++) { J[v * 4 + k] = p[k][0]; W[v * 4 + k] = p[k][1]; }
  }
  return { joints: J, weights: W };
}

// Fin vertices: _FINID picks the fin; _FINT (0..1 across) selects ray-group bones; _FINR (0 root .. 1 tip) blends root->rays.
export function finWeights(rig, fins, count) {
  const J = new Uint16Array(count * 4), W = new Float32Array(count * 4);
  const idx = (n) => rig.index.get(n);
  for (let v = 0; v < count; v++) {
    const id = Math.round(fins._FINID[v]), T = fins._FINT[v], Rr = fins._FINR[v];
    const root = (name) => idx(name);
    let e = [];
    const rayBlend = (rootName, rayNames) => {
      const k = rayNames.length; const x = clamp(T, 0, 1) * (k - 1); const i0 = Math.min(Math.floor(x), k - 2 < 0 ? 0 : k - 2); const t = k === 1 ? 0 : x - i0;
      const wRay = smooth(0.05, 0.85, Rr);
      e.push([root(rootName), 1 - wRay]);
      if (k === 1) e.push([idx(rayNames[0]), wRay]); else { e.push([idx(rayNames[i0]), wRay * (1 - t)]); e.push([idx(rayNames[i0 + 1]), wRay * t]); }
    };
    switch (id) {
      case 0: rayBlend('dorsal_hinge', ['dorsal_r0', 'dorsal_r1', 'dorsal_r2']); break;
      case 1: { const w = smooth(0, 1, Rr); e.push([idx('adipose_01'), 1 - w], [idx('adipose_02'), w]); break; }
      case 2: rayBlend('pectoral_R', ['pectoral_R_r0', 'pectoral_R_r1', 'pectoral_R_r2']); break;
      case 3: rayBlend('pectoral_L', ['pectoral_L_r0', 'pectoral_L_r1', 'pectoral_L_r2']); break;
      case 4: rayBlend('pelvic_R', ['pelvic_R_r0', 'pelvic_R_r1']); break;
      case 5: rayBlend('pelvic_L', ['pelvic_L_r0', 'pelvic_L_r1']); break;
      case 6: rayBlend('anal_hinge', ['anal_r0', 'anal_r1']); break;
      default: rayBlend('caudal_hub', ['caudal_ray_u2', 'caudal_ray_u1', 'caudal_ray_mid', 'caudal_ray_l1', 'caudal_ray_l2']); break;
    }
    const p = pack(e);
    for (let k = 0; k < 4; k++) { J[v * 4 + k] = p[k][0]; W[v * 4 + k] = p[k][1]; }
  }
  return { joints: J, weights: W };
}

export function inverseBindMatrices(rig) {
  // rest world transform = translation only (identity rotations) -> IBM = translate(-pos)
  const out = new Float32Array(rig.bones.length * 16);
  rig.bones.forEach((b, i) => { out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.pos[0], -b.pos[1], -b.pos[2], 1], i * 16); });
  return out;
}
