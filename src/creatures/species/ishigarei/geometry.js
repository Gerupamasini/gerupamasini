// Procedural geometry of the イシガレイ juvenile: skeleton definition, the body (lens-shaped sections with the
// head features, a real mouth cleft and the gill covers), the marginal, caudal, pectoral and pelvic fins
// (rays aligned with the texture's v axis) and the eyeballs, at three levels of detail.
//
// Every skinned geometry shares one skeleton definition; vertices carry up to four bone influences.
import * as THREE from 'three';
import { eyeQuaternion } from './rig.js';
import {
  S_ROOT, S_END, SL_MM, HEAD_END, X_RANGE, EYES, MOUTH, FINS, SPINE, SPINE_S,
  dorsalEdge, ventralEdge, thickTop, thickBot, sectionProfile, surfaceFeatures, surfaceY, eyeCentre,
  cleftX, cornerS, opercE, spineWeights, clamp, smoothstep, lerp,
} from './anatomy.js';

const M = 0.001;
const model = (s, x, y) => new THREE.Vector3(x * M, y * M, (S_ROOT - s) * M);

// level of detail parameters: body rings × ring vertices, fin columns × rows, eye segments
export const LODS = [
  { body: [118, 76], fin: [1.0, 9], eye: [40, 22], cleft: true, split: true },
  { body: [52, 36], fin: [0.45, 4], eye: [18, 10], cleft: true, split: true },
  { body: [22, 16], fin: [0.16, 2], eye: null, cleft: false, split: false },
];

// ------------------------------------------------------------------------------------------ skeleton
function finBase(fin, u) {
  const F = FINS[fin];
  const s = lerp(F.s0, F.s1, u);
  const dorsal = fin === 'dorsal';
  const edge = dorsal ? dorsalEdge : ventralEdge;
  const e = 0.05;
  const slope = (edge(s + e) - edge(s - e)) / (2 * e);
  // outward normal of the margin in the (s, x) plane, rotated backwards by the ray sweep
  let nx = dorsal ? 1 : -1, ns = dorsal ? -slope : slope;
  const nl = Math.hypot(nx, ns); nx /= nl; ns /= nl;
  const sw = F.sweep(u);
  const ts = 1 / Math.hypot(1, slope), tx = slope / Math.hypot(1, slope);
  const ds = ns * Math.cos(sw) + ts * Math.sin(sw), dx = nx * Math.cos(sw) + tx * Math.sin(sw);
  const inset = 0.35;
  return { s: s - ds * inset, x: edge(s) - dx * inset, ds, dx, ts, tx, len: F.height(u) + inset };
}

function spineParent(s) {
  if (s < 13) return 'J_head';
  let p = 'J_root';
  for (const [name, sb] of SPINE.slice(1)) if (sb <= s + 1.0 && name !== 'J_caudal2') p = name;
  return p;
}

/** Bones: name, parent, rest position (model, absolute), rest rotation, and for fin bones the flap axis. */
export function rigDefinition() {
  const defs = [];
  const add = (name, parent, pos, extra = {}) => { defs.push({ name, parent, pos, quat: new THREE.Quaternion(), ...extra }); };
  add('J_root', null, model(SPINE_S.J_root, 0, 0));
  add('J_head', 'J_root', model(SPINE_S.J_head, 0, 0));
  let prev = 'J_root';
  for (const [name, s] of SPINE.slice(2)) { add(name, prev, model(s, 0, 0)); prev = name; }
  add('J_jaw', 'J_head', model(MOUTH.joint.s, MOUTH.joint.x, 0));
  add('J_premax', 'J_head', model(MOUTH.premax.s, MOUTH.premax.x, 0));
  for (const e of EYES) {
    const [s, x, y] = eyeCentre(e);
    const g = new THREE.Vector3(...e.gaze).normalize();
    add(e.bone, 'J_head', model(s, x, y), { quat: eyeQuaternion(g), eye: e });
  }
  const pe = FINS.pectoralEyed, pb = FINS.pectoralBlind;
  add('J_pecE', 'J_root', model(pe.s, pe.x, surfaceY(pe.s, pe.x, 1) + 0.08), { axis: new THREE.Vector3(1, 0, 0).normalize() });
  add('J_pecB', 'J_root', model(pb.s, pb.x, surfaceY(pb.s, pb.x, -1) - 0.08), { axis: new THREE.Vector3(1, 0, 0) });
  const pv = FINS.pelvic;
  add('J_pelE', 'J_head', model(pv.s, ventralEdge(pv.s) + 0.5, 0.3));
  add('J_pelB', 'J_head', model(pv.s, ventralEdge(pv.s) + 0.5, -0.3));
  for (const fin of ['dorsal', 'anal']) {
    const F = FINS[fin];
    const tag = fin === 'dorsal' ? 'D' : 'A';
    for (let k = 0; k < F.bones; k++) {
      const u = k / (F.bones - 1);
      const b = finBase(fin, u);
      // flap axis: along the fin base; the sign makes a positive angle lift the margin (+Y)
      const e = 0.01;
      const b0 = finBase(fin, Math.max(0, u - e)), b1 = finBase(fin, Math.min(1, u + e));
      const axis = model(b1.s, b1.x, 0).sub(model(b0.s, b0.x, 0)).normalize();
      const margin = new THREE.Vector3(b.dx, 0, -b.ds).normalize();
      const sign = Math.sign(new THREE.Vector3().crossVectors(axis, margin).y) || 1;
      add(`J_${tag}${k}`, spineParent(b.s), model(b.s, b.x, 0), { axis: axis.multiplyScalar(sign), fin, u });
    }
  }
  const byName = Object.fromEntries(defs.map((d, i) => [d.name, i]));
  for (const d of defs) {
    d.index = byName[d.name];
    d.world = new THREE.Matrix4().compose(d.pos, d.quat, new THREE.Vector3(1, 1, 1));
    d.inverse = d.world.clone().invert();
  }
  return { defs, byName };
}

// ------------------------------------------------------------------------------------------ helpers
function packWeights(list, byName) {
  const m = new Map();
  for (const [n, w] of list) if (w > 1e-5) m.set(n, (m.get(n) || 0) + w);
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = arr.reduce((a, b) => a + b[1], 0) || 1;
  const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
  arr.forEach(([n, w], i) => { idx[i] = byName[n]; wt[i] = w / sum; });
  return [idx, wt];
}

function finishGeometry(g, { pos, nrm, uv, tan, si, sw, extra = {}, index }) {
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('tangent', new THREE.Float32BufferAttribute(tan, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  for (const [k, v] of Object.entries(extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(v.data, v.size));
  g.setIndex(index);
  if (!nrm) g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const texV = (x, side) => {
  const t = clamp((x - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0]), 0, 1);
  return side > 0 ? 0.625 * t : 0.625 + 0.375 * t;
};

// ------------------------------------------------------------------------------------------ body
/**
 * Body surface: rings of lens-shaped sections along s. The top half of each ring (φ ∈ [0, π]) is the eyed
 * side, the bottom half the blind side; vertex columns are warped so that one column runs exactly along the
 * mouth cleft of each side (the lower jaw is skinned to J_jaw: opening the mouth parts the surface along it).
 */
function buildBodySurface(rig, lod) {
  const [NS, NR] = lod.body;
  const half = NR / 2;
  const kc = Math.round(half * 0.3); // cleft column (counted from the ventral margin)
  // ring positions s_i: dense at the head
  const rows = [];
  for (let i = 0; i <= NS; i++) rows.push(S_END * Math.pow(i / NS, 1.32));
  const P = [], META = [];
  const phiMap = (s, side) => {
    // knots in column index → φ; default is uniform, near the mouth one column sits on the cleft
    const xd = dorsalEdge(s), xv = ventralEdge(s), xc = 0.5 * (xd + xv), hw = 0.5 * (xd - xv);
    const def = (k) => (Math.PI * k) / half;
    if (!lod.cleft) return def;
    const corner = cornerS(side);
    const w = 1 - smoothstep(corner - 0.3, corner + 2.4, s);
    if (w <= 0) return def;
    const pc = Math.acos(clamp((xc - cleftX(s, side)) / hw, -0.999, 0.999));
    const pt = lerp(def(kc), pc, w);
    const d = lerp(Math.PI / half, (Math.PI / half) * 0.3, w);
    const knots = [[0, 0], [kc - 1, pt - d], [kc, pt], [kc + 1, pt + d], [half, Math.PI]];
    return (k) => {
      for (let i = 0; i < knots.length - 1; i++) {
        const [k0, p0] = knots[i], [k1, p1] = knots[i + 1];
        if (k <= k1) return lerp(p0, p1, (k - k0) / (k1 - k0));
      }
      return Math.PI;
    };
  };
  for (const s of rows) {
    const xd = dorsalEdge(s), xv = ventralEdge(s), xc = 0.5 * (xd + xv), hw = 0.5 * (xd - xv);
    const top = phiMap(s, 1), bot = phiMap(s, -1);
    const ring = [], meta = [];
    for (let j = 0; j < NR; j++) {
      const side = j <= half ? 1 : -1;
      const k = side > 0 ? j : NR - j; // column index from the ventral margin
      const phi = side > 0 ? top(k) : bot(k);
      const u = -Math.cos(phi);
      const x = xc + hw * u;
      const T = side > 0 ? thickTop(s) : thickBot(s);
      const fade = 1 - smoothstep(0.86, 1.0, Math.abs(u));
      const y = (j === 0 || j === half) ? 0 : side * (T * sectionProfile(u, side) + surfaceFeatures(s, x, side) * fade);
      ring.push(model(s, x, y));
      meta.push({ s, x, side, k });
    }
    P.push(ring); META.push(meta);
  }
  // snout cap: a vertex in front of the first ring, on the line of the mouth
  const cap = model(-0.2, MOUTH.tipX, 0);
  // normals on the closed (welded) ring grid
  const NN = P.map((r) => r.map(() => new THREE.Vector3()));
  const capN = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NR; j++) {
      const j1 = (j + 1) % NR;
      const p00 = P[i][j], p01 = P[i][j1], p10 = P[i + 1][j], p11 = P[i + 1][j1];
      _n.crossVectors(_a.subVectors(p10, p00), _b.subVectors(p01, p00));
      NN[i][j].add(_n); NN[i][j1].add(_n); NN[i + 1][j].add(_n);
      _n.crossVectors(_a.subVectors(p01, p11), _b.subVectors(p10, p11));
      NN[i][j1].add(_n); NN[i + 1][j].add(_n); NN[i + 1][j1].add(_n);
    }
  }
  for (let j = 0; j < NR; j++) {
    const j1 = (j + 1) % NR;
    _n.crossVectors(_a.subVectors(P[0][j], cap), _b.subVectors(P[0][j1], cap));
    NN[0][j].add(_n); NN[0][j1].add(_n); capN.add(_n);
  }
  // orientation check: normals must point outwards (+Y on the eyed side)
  const flip = NN[Math.floor(NS / 2)][Math.floor(half / 2)].y < 0 ? -1 : 1;
  for (const r of NN) for (const n of r) n.normalize().multiplyScalar(flip);
  capN.normalize().multiplyScalar(flip);
  return { P, NN, META, rows, cap, capN, NS, NR, half, kc, flip };
}

function bodyVertexAttribs(rig, surf, lod, i, j, side) {
  const { P, NN, META, NS, NR, kc } = surf;
  const m = META[i][j % NR];
  const { s, x } = m;
  const k = side > 0 ? j : NR - j;
  // skinning: spine, lower jaw (below the cleft) and upper jaw (premaxilla, above it)
  let wJ = 0, wP = 0, cleft = 0, lip = 0;
  if (lod.cleft) {
    const corner = cornerS(side);
    const fadeJ = 1 - smoothstep(corner - 0.2, corner + 1.5, s);
    const fadeP = 1 - smoothstep(0.4, 2.6, s);
    const jawSide = k < kc ? 1 : k === kc ? 0.5 : 0;
    wJ = jawSide * fadeJ;
    wP = (k > kc ? 1 : k === kc ? 0.5 : 0) * fadeP * 0.9;
    if (k === kc) cleft = 1 - smoothstep(corner - 0.25, corner + 0.6, s);
    if (Math.abs(k - kc) === 1) lip = 1 - smoothstep(corner - 0.4, corner + 0.8, s);
  }
  const rest = Math.max(0, 1 - wJ - wP);
  const wl = spineWeights(s).map(([n, w]) => [n, w * rest]);
  wl.push(['J_jaw', wJ], ['J_premax', wP]);
  const [idx, wt] = packWeights(wl, rig.byName);
  // tangent along s (towards the tail), bitangent sign so that B = cross(N, T)·w points to +x (dorsal)
  const i0 = Math.max(0, i - 1), i1 = Math.min(NS, i + 1);
  const T = new THREE.Vector3().subVectors(P[i1][j % NR], P[i0][j % NR]).normalize();
  const jm = (j - 1 + NR) % NR, jp = (j + 1) % NR;
  const Bexp = new THREE.Vector3().subVectors(P[i][jp], P[i][jm]).multiplyScalar(side > 0 ? 1 : -1);
  if (j === 0 || j === surf.half || j === NR) Bexp.set(1, 0, 0).multiplyScalar(j === 0 || j === NR ? 1 : 1);
  const N = NN[i][j % NR];
  const w = Math.sign(new THREE.Vector3().crossVectors(N, T).dot(Bexp)) || 1;
  // breathing: the free margin of the gill cover lifts; the opening shows as a dark line
  const e = opercE(s, x);
  const operc = s > 6 ? smoothstep(0.5, 0.97, e) * (1 - smoothstep(0.97, 1.06, e)) : 0;
  const gill = s > 6 ? Math.exp(-(((e - 1.0) / 0.05) ** 2)) * smoothstep(-9, -3, x) * smoothstep(6, 2, x) : 0;
  return { idx, wt, T, w, fish: [s, x, side, cleft], mask: [operc, gill, lip, 0] };
}

function emitBodyPart(rig, surf, lod, i0, i1, withCap, sides = [1, -1]) {
  const { P, NN, NR, half, cap, capN } = surf;
  const pos = [], nrm = [], uv = [], tan = [], si = [], sw = [], aFish = [], aMask = [], index = [];
  let vc = 0;
  for (const side of sides) {
    const j0 = side > 0 ? 0 : half, j1 = side > 0 ? half : NR;
    const cols = j1 - j0 + 1;
    const base = vc;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const p = P[i][j % NR], n = NN[i][j % NR];
        const a = bodyVertexAttribs(rig, surf, lod, i, j, side);
        pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z);
        uv.push(a.fish[0] / S_END, texV(a.fish[1], side));
        tan.push(a.T.x, a.T.y, a.T.z, a.w);
        si.push(...a.idx); sw.push(...a.wt);
        aFish.push(...a.fish); aMask.push(...a.mask);
        vc++;
      }
    }
    for (let i = 0; i < i1 - i0; i++) {
      for (let c = 0; c < cols - 1; c++) {
        const v00 = base + i * cols + c, v01 = v00 + 1, v10 = v00 + cols, v11 = v10 + 1;
        // winding so that faces point outwards (matches the normals)
        if (side > 0) { index.push(v00, v01, v10, v01, v11, v10); } else { index.push(v00, v01, v10, v01, v11, v10); }
      }
    }
    if (withCap) {
      const c0 = vc;
      const s = -0.35;
      const [idx, wt] = packWeights(lod.cleft ? [['J_head', 0.1], ['J_jaw', 0.5], ['J_premax', 0.4]] : [['J_head', 1]], rig.byName);
      pos.push(cap.x, cap.y, cap.z); nrm.push(capN.x, capN.y, capN.z);
      uv.push(0, texV(MOUTH.tipX, side));
      tan.push(0, 0, -1, 1); si.push(...idx); sw.push(...wt);
      aFish.push(s, MOUTH.tipX, side, lod.cleft ? 1 : 0); aMask.push(0, 0, 0, 0);
      vc++;
      for (let c = 0; c < cols - 1; c++) index.push(c0, base + c + 1, base + c);
    }
  }
  // the winding above was chosen for one orientation; make it agree with the normals
  const g = new THREE.BufferGeometry();
  fixWinding(pos, nrm, index);
  return finishGeometry(g, { pos, nrm, uv, tan, si, sw, index, extra: { aFish: { data: aFish, size: 4 }, aMask: { data: aMask, size: 4 } } });
}

function fixWinding(pos, nrm, index) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    e1.subVectors(b, a); e2.subVectors(c, a);
    const fn = e1.cross(e2);
    if (fn.lengthSq() < 1e-30) continue;
    n.fromArray(nrm, i0 * 3).add(e2.fromArray(nrm, i1 * 3)).add(e2.fromArray(nrm, i2 * 3));
    if (fn.dot(n) < 0) { index[t + 1] = i2; index[t + 2] = i1; }
  }
}

export function buildBody(rig, lod) {
  const surf = buildBodySurface(rig, lod);
  if (!lod.split) return { body: emitBodyPart(rig, surf, lod, 0, surf.NS, true), head: null, surf };
  let iS = surf.rows.findIndex((s) => s >= HEAD_END);
  if (iS < 1) iS = 1;
  const head = emitBodyPart(rig, surf, lod, 0, iS, true);
  return {
    head: mergeSkinned([head, buildLips(rig, lod, 1), buildLips(rig, lod, -1)], ['aFish', 'aMask']),
    body: emitBodyPart(rig, surf, lod, iS, surf.NS, false),
    surf,
  };
}

// ------------------------------------------------------------------------------------------ lips
/**
 * One jaw's lip: a fleshy tube along its edge of the cleft, from the corner of the mouth on the eyed side, round
 * the front of the snout, back to the corner on the blind side. The upper lip (premaxilla) runs on the dorsal
 * side of the cleft and follows J_premax; the lower lip (dentary, thicker, a little further forward, with the chin
 * knob in front) on the ventral side follows J_jaw. Closed, the two lips meet along the cleft.
 */
export function buildLips(rig, lod, jaw) {
  const L = MOUTH.lip;
  const upper = jaw > 0;
  const rFront = upper ? L.upper : L.lower;
  const sTip = upper ? MOUTH.upperTip : MOUTH.lowerTip;
  const s0 = MOUTH.front;
  const radius = (s, front) => {
    // thin at the corners, full along the front; the lower jaw's chin knob at the very front
    const c = lerp(L.corner, rFront * 0.85, smoothstep(cornerS(1) - 0.2, s0, s));
    return Math.max(c, front * rFront) + (upper ? 0 : L.chin * Math.max(0, front) ** 4);
  };
  // centre line in the fish frame: (s, x, y, side, radius)
  const pts = [];
  const side = (sgn) => {
    const c = cornerS(sgn);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const s = sgn > 0 ? lerp(c, s0, i / n) : lerp(s0, c, i / n);
      if ((sgn > 0 && i === n) || (sgn < 0 && i === 0)) continue;
      const r = radius(s, 0) * (1 - 0.85 * smoothstep(c - 0.5, c + 0.05, s));
      const x = cleftX(s, sgn) + jaw * r * 0.8;
      const y = surfaceY(s, x, sgn) - sgn * r * 0.45;
      pts.push([s, x, y, sgn, Math.max(r, 0.02)]);
    }
  };
  side(1);
  // round the front: an arc in the (s, y) plane from the top of the snout to its underside
  const yT = surfaceY(s0, cleftX(s0, 1), 1), yB = -surfaceY(s0, cleftX(s0, -1), -1);
  const nA = 12;
  for (let i = 0; i <= nA; i++) {
    const phi = Math.PI / 2 - (Math.PI * i) / nA;
    const k = Math.cos(phi);
    const s = s0 - (s0 - sTip) * k;
    const y = phi > 0 ? yT * Math.sin(phi) * 0.8 : yB * Math.sin(phi) * 0.8;
    const r = radius(s0, k);
    pts.push([s, MOUTH.tipX + jaw * r * 0.8, y, phi >= 0 ? 1 : -1, r]);
  }
  side(-1);
  const curve = new THREE.CatmullRomCurve3(pts.map(([s, x, y]) => model(s, x, y)), false, 'centripetal');
  const rOf = (t) => {
    const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return lerp(pts[i][4], pts[i + 1][4], u);
  };
  const metaOf = (t) => pts[Math.round(t * (pts.length - 1))];
  const NT = lod === LODS[0] ? 64 : 28, NR = lod === LODS[0] ? 10 : 6;
  const frames = curve.computeFrenetFrames(NT, false);
  const pos = [], nrm = [], uv = [], tan = [], si = [], sw = [], aFish = [], aMask = [], index = [];
  for (let i = 0; i <= NT; i++) {
    const t = i / NT;
    const c = curve.getPointAt(t);
    const T = frames.tangents[i], N = frames.normals[i], B = frames.binormals[i];
    const r = rOf(t) * M;
    const [s, x, , sg] = metaOf(t);
    const wJ = upper ? (1 - smoothstep(cornerS(sg) - 1.6, cornerS(sg) + 0.2, s)) : 1;
    const [idx, wt] = packWeights([[upper ? 'J_premax' : 'J_jaw', wJ], ['J_head', 1 - wJ]], rig.byName);
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2;
      const n = new THREE.Vector3().addScaledVector(N, Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      // a little flattened against the head
      const p = c.clone().addScaledVector(n, r);
      pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z);
      uv.push(s / S_END, texV(x, sg));
      tan.push(T.x, T.y, T.z, 1);
      si.push(...idx); sw.push(...wt);
      aFish.push(s, x, sg, 0);
      aMask.push(0, 0, 1, 0);
    }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + 1, c = a + NR + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  fixWinding(pos, nrm, index);
  return finishGeometry(new THREE.BufferGeometry(), { pos, nrm, uv, tan, si, sw, index, extra: { aFish: { data: aFish, size: 4 }, aMask: { data: aMask, size: 4 } } });
}

// ------------------------------------------------------------------------------------------ fins
// fin texture atlas: four bands in v; band 3 holds pectorals (u < 0.6) and pelvics (u ≥ 0.6)
export const FIN_BANDS = {
  dorsal: [0, 0, 1, 0.25], anal: [0, 0.25, 1, 0.5], caudal: [0, 0.5, 1, 0.75],
  pectoral: [0, 0.75, 0.6, 1.0], pelvic: [0.6, 0.75, 1.0, 1.0],
};

function finGrid(rig, { nu, nv, at, band, weights, centerOut }) {
  const pos = [], uv = [], tan = [], si = [], sw = [], index = [];
  const [u0, v0, u1, v1] = band;
  const P = [];
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = at(u, v);
      row.push(p);
      pos.push(p.x, p.y, p.z);
      uv.push(lerp(u0, u1, u), lerp(v0, v1, v));
      const [idx, wt] = packWeights(weights(u, v), rig.byName);
      si.push(...idx); sw.push(...wt);
    }
    P.push(row);
  }
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const a = P[j][Math.max(0, i - 1)], b = P[j][Math.min(nu, i + 1)];
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      tan.push(t.x, t.y, t.z, 1);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  finishGeometry(g, { pos, uv, tan, si, sw, index });
  // fin normals face the eyed side (+Y) by convention (the fin shader is two-sided)
  const nrm = g.attributes.normal;
  let sy = 0;
  for (let i = 0; i < nrm.count; i++) sy += nrm.getY(i);
  if (sy < 0) {
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  if (centerOut) g.userData.center = centerOut;
  return g;
}

function marginalFin(rig, fin, lod) {
  const F = FINS[fin];
  const nu = Math.max(8, Math.round(F.rays * 2 * lod.fin[0]));
  const nv = lod.fin[1];
  const tag = fin === 'dorsal' ? 'D' : 'A';
  const nb = F.bones;
  return finGrid(rig, {
    nu, nv, band: FIN_BANDS[fin],
    at: (u, v) => {
      const b = finBase(fin, u);
      const L = b.len;
      // rays curve back a little towards their tips; the membrane pleats between rays
      const s = b.s + b.ds * L * v + b.ts * 0.1 * L * v * v;
      const x = b.x + b.dx * L * v + b.tx * 0.1 * L * v * v;
      const pleat = 0.03 * Math.cos(2 * Math.PI * u * F.rays) * smoothstep(0, 0.35, v) * (L / 6);
      return model(s, x, pleat);
    },
    weights: (u, v) => {
      const f = u * (nb - 1), k = Math.min(nb - 2, Math.floor(f)), t = f - k;
      const b = finBase(fin, u);
      const wf = smoothstep(0.0, 0.18, v);
      const sp = spineWeights(b.s).map(([n, w]) => [n, w * (1 - wf)]);
      return [[`J_${tag}${k}`, (1 - t) * wf], [`J_${tag}${k + 1}`, t * wf], ...sp];
    },
  });
}

function caudalFin(rig, lod) {
  const C = FINS.caudal;
  const nu = Math.max(6, Math.round(C.rays * 3 * lod.fin[0]));
  const nv = lod.fin[1] + 1;
  return finGrid(rig, {
    nu, nv, band: FIN_BANDS.caudal,
    at: (u, v) => {
      const x0 = lerp(C.x0, C.x1, u);
      const a = (u - 0.5) * C.spread;
      // rounded margin: the middle rays are the longest
      const L = C.len * (0.84 + 0.16 * (1 - (2 * u - 1) ** 2)) + 0.5;
      const s = C.s + Math.cos(a) * L * v;
      const x = x0 + Math.sin(a) * L * v;
      const pleat = 0.04 * Math.cos(2 * Math.PI * u * C.rays) * smoothstep(0, 0.3, v);
      return model(s, x, pleat);
    },
    weights: (u, v) => {
      const t = smoothstep(0.05, 0.85, v);
      return [['J_caudal', 1 - t], ['J_caudal2', t]];
    },
  });
}

function pectoralFin(rig, lod, eyed) {
  const F = eyed ? FINS.pectoralEyed : FINS.pectoralBlind;
  const side = eyed ? 1 : -1;
  const nu = Math.max(4, Math.round(F.rays * 3 * lod.fin[0]));
  const nv = Math.max(2, lod.fin[1]);
  return finGrid(rig, {
    nu, nv, band: FIN_BANDS.pectoral,
    at: (u, v) => {
      const bs = F.s - 0.35 + 0.7 * u, bx = F.x - F.width * 0.5 + F.width * u;
      const a = lerp(0.42, -0.32, u); // dorsal rays point back and up, ventral rays back and down
      const L = F.len * (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + 0.75 * u)));
      const s = bs + Math.cos(a) * L * v, x = bx + Math.sin(a) * L * v;
      // lies against the body, lifting a little towards its tip
      const y = surfaceY(s, x, side) + side * (0.09 + 0.22 * v * v);
      return model(s, x, y);
    },
    weights: (u, v) => {
      const t = smoothstep(0.0, 0.2, v);
      return [[eyed ? 'J_pecE' : 'J_pecB', t], ['J_root', 1 - t]];
    },
  });
}

function pelvicFin(rig, lod, eyed) {
  const F = FINS.pelvic;
  const nu = Math.max(3, Math.round(F.rays * 3 * lod.fin[0]));
  const nv = Math.max(2, lod.fin[1] - 2);
  const side = eyed ? 1 : -1;
  return finGrid(rig, {
    nu, nv, band: FIN_BANDS.pelvic,
    at: (u, v) => {
      const bs = F.s - 1.0 + 2.0 * u;
      const bx = ventralEdge(bs) + 0.55;
      const a = lerp(-0.35, -0.85, u); // posteroventral
      const L = F.len * (0.7 + 0.3 * Math.sin(Math.PI * u));
      const s = bs + Math.cos(a) * L * v, x = bx + Math.sin(a) * L * v;
      return model(s, x, side * (0.28 - 0.12 * v));
    },
    weights: (u, v) => {
      const t = smoothstep(0.0, 0.25, v);
      return [[eyed ? 'J_pelE' : 'J_pelB', t], ['J_head', 1 - t]];
    },
  });
}

export function buildFins(rig, lod) {
  const merge = (list) => mergeSkinned(list);
  const dorsal = marginalFin(rig, 'dorsal', lod);
  const anal = marginalFin(rig, 'anal', lod);
  const tail = caudalFin(rig, lod);
  const pect = merge([pectoralFin(rig, lod, true), pectoralFin(rig, lod, false)]);
  const pelv = merge([pelvicFin(rig, lod, true), pelvicFin(rig, lod, false)]);
  if (!lod.split) return { all: merge([dorsal, anal, tail]) };
  return { dorsal, anal, tail, pectoral: pect, pelvic: pelv };
}

function mergeSkinned(list, extra = []) {
  const names = ['position', 'normal', 'uv', 'tangent', 'skinIndex', 'skinWeight', ...extra];
  const out = {};
  for (const n of names) {
    const a0 = list[0].attributes[n];
    const total = list.reduce((s, g) => s + g.attributes[n].array.length, 0);
    const arr = new a0.array.constructor(total);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out[n] = new THREE.BufferAttribute(arr, a0.itemSize);
  }
  const idx = [];
  let base = 0;
  for (const g of list) {
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(out)) g.setAttribute(n, a);
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------------------------------ eyes
/** Eyeball in its own frame (metres, +Z = optical axis) with the polar iris UVs the eye shader expects. */
export function buildEye(e, lod) {
  if (!lod.eye) return null;
  const [ws, hs] = lod.eye;
  // only the front ~115° cap is ever visible above the turret
  const g = new THREE.SphereGeometry(e.r * M, ws, hs, 0, Math.PI * 2, 0, Math.PI * 0.64);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const th = Math.acos(clamp(v.z, -1, 1)), ps = Math.atan2(v.y, v.x), r = th / Math.PI;
    uv.setXY(i, 0.5 + 0.5 * r * Math.cos(ps), 0.5 - 0.5 * r * Math.sin(ps));
  }
  g.computeBoundingSphere();
  return g;
}
