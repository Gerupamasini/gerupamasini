import * as THREE from 'three';
import { makeBodySDF, surfaceNets } from './sdf.js';
import { KentishPloverConfig as CFG } from '../KentishPloverConfig.js';

// Body (head–neck–torso–rump) mesh from the SDF sculpt. Attributes:
//   position/normal (metres), aRest (rest position, mm) and aFlow (feather flow direction, rest space)
//   for the procedural plumage shader, skinIndex/skinWeight for the spine chain.

// Feather flow: gradient of distance from the bill tip (feathers point away from the bill, toward the
// tail), with a slight ventral bias on the sides. Used identically in the shader. Relaxed bind bill tip
// (body_shape_spec.md §3, §17.1).
export const BILL_TIP_MM = [0, 83.4, 54];

// Plumage of the sculpt that fills the neck at rest (KentishPloverConfig.bodySculpt prims with role 'neck'): it moves
// with the neck sleeve, not with the trunk, and the trunk-only outline (getTorsoSDF trunkOnly) leaves it out. Prims
// with role 'head' (head, face, cheeks) are left out of every torso outline.
export const NECK_FILL = CFG.bodySculpt.prims.filter((p) => p.role === 'neck').map((p) => p.name);
const HEAD_PRIMS = CFG.bodySculpt.prims.filter((p) => p.role === 'head').map((p) => p.name);

// Spine influence segments (mm) and falloff sigma — distance-weighted skinning (spec §17.1).
const SPINE = [
  { bone: 'tail', a: [0, 61, -42], b: [0, 58, -62], s: 7 },
  { bone: 'body', a: [0, 62, -38], b: [0, 64, -8], s: 13 },
  { bone: 'chest', a: [0, 64, -4], b: [0, 68, 20], s: 13 },
  { bone: 'neck0', a: [0, 74, 0], b: [0, 77, 3], s: 4.5 },
  { bone: 'neck1', a: [0, 80, 5], b: [0, 82, 7.5], s: 4.5 },
  { bone: 'neck2', a: [0, 85, 10], b: [0, 87, 12], s: 4.5 },
  { bone: 'head', a: [0, 89, 16], b: [0, 92, 34], s: 5.5 },
];

function segDist(p, a, b) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  let t = ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (bx * bx + by * by + bz * bz);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - by * t, p[2] - a[2] - bz * t);
}

/**
 * Head membership: inside an enlarged head ellipsoid → rigid with the head bone; the outer 0.35 band blends
 * into the neck bones (nape and throat, spec §7, §17.1). Mirrored in the body shader (kpHeadness).
 */
const HZ = CFG.bodySculpt.headZone;
export function headness(p) {
  const x = (p[0] - HZ.c[0]) / HZ.r[0];
  const y = (p[1] - HZ.c[1]) / HZ.r[1];
  const z = (p[2] - HZ.c[2]) / HZ.r[2];
  const r = Math.sqrt(x * x + y * y + z * z);
  // Throat below the head is shared with the neck; the fore-breast / chin band (y 74–83) stays off the head.
  const below = Math.max(0, (83 - p[1]) / 5);
  return Math.max(0, Math.min(1, (1.25 - r) / 0.35)) * Math.max(0, 1 - below);
}

/** Visible lower edge of the folded wing at z (bodySculpt.wingEdge, linear between its points, held at the ends). */
export function wingEdgeY(z) {
  const e = CFG.bodySculpt.wingEdge;
  if (z >= e[0][0]) return e[0][1];
  for (let i = 0; i < e.length - 1; i++) if (z >= e[i + 1][0]) return e[i][1] + ((e[i + 1][1] - e[i][1]) * (z - e[i][0])) / (e[i + 1][0] - e[i][0]);
  return e[e.length - 1][1];
}
/** The same as a GLSL function float `name`(float z). */
export function wingEdgeGLSL(name) {
  const e = CFG.bodySculpt.wingEdge;
  const f = (v) => v.toFixed(2);
  let s = `float ${name}(float z) {\n  if (z >= ${f(e[0][0])}) return ${f(e[0][1])};\n`;
  for (let i = 0; i < e.length - 1; i++) s += `  if (z >= ${f(e[i + 1][0])}) return mix(${f(e[i][1])}, ${f(e[i + 1][1])}, (z - ${f(e[i][0])}) / (${f(e[i + 1][0] - e[i][0])}));\n`;
  return s + `  return ${f(e[e.length - 1][1])};\n}\n`;
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const spineDist = (p) =>
  SPINE.map((s) => {
    const d = segDist(p, s.a, s.b);
    return Math.exp(-(d * d) / (2 * s.s * s.s));
  });

/** Trunk-only skinning (tail / body / chest by distance): the scapulars lie on the trunk, not on the neck plumage. */
export function trunkWeights(p, boneIndex) {
  const w = spineDist(p);
  const order = w.map((v, i) => [v, i]).filter(([, i]) => TRUNK.has(SPINE[i].bone));
  const sum = order.reduce((acc, [v]) => acc + v, 0) || 1;
  return order.map(([v, i]) => [boneIndex[SPINE[i].bone], v / sum]);
}
const TRUNK = new Set(['tail', 'body', 'chest']);

let TRUNK_SDF = null;
const trunkSDF = () => (TRUNK_SDF ??= getTorsoSDF(CFG, { trunkOnly: true }));

/**
 * Position of a body point along the neck sleeve before smoothing: 0 on the trunk … 1 on the head. The sleeve is the
 * plumage between the trunk outline (trunk-only SDF: without the neck-filling mantleNape, foreBreast and neck fills)
 * and the rigid part of the head (the enlarged head ellipsoid of headness up to r 1.05 above y 89, and the face in
 * front of the eyes): the point's distance a outside the trunk over the sum of a and its distance b outside the
 * rigid head, so its iso-surfaces follow the trunk near the trunk and the head near the head.
 */
export function sleeveRatio(p) {
  const a = Math.max(0, trunkSDF()(p[0], p[1], p[2]) - 1);
  const x = (p[0] - HZ.c[0]) / HZ.r[0];
  const y = (p[1] - HZ.c[1]) / HZ.r[1];
  const z = (p[2] - HZ.c[2]) / HZ.r[2];
  const face = smooth(30, 34, p[2]) * smooth(81, 85, p[1]);
  const bh = Math.max(0, Math.sqrt(x * x + y * y + z * z) - 1.05) * 13 * (1 - face);
  // (and below it, y < 89: the lower cheeks and the chin behind the bill base are sleeve too, so the neck's turn has room
  // to spread round the throat)
  const b = Math.max(bh, (89 - p[1]) * 0.9 * (1 - face));
  if (a === 0) return 0;
  return b === 0 ? 1 : a / (a + b);
}
const ease = (s) => s * s * (3 - 2 * s);
// half eased: zero slope would steepen the middle of the field by 1.5× (the turn folds where it is steep round the
// neck), none would leave a kink where the sleeve meets trunk and head
const EASE = (h) => h + 0.5 * (ease(h) - h);
/** Sleeve position of an isolated point (no mesh around it to smooth over): the eased ratio. */
export const sleeveParam = (p) => ease(sleeveRatio(p));

// trunk surface held at s 0: the breast below y 72, the mantle behind z −9, the shoulder under the folded wing's front
// edge, and the scapulars' bed (|x| > 3, z < 5, y < 89: neck plumage drawn out from under the scapulars showed as a
// bald patch when the neck stretched, and swept through them when it turned). Elsewhere a trunk-core surface within
// 1 mm of the outline (the breast-side ellipsoids at the base of the neck) would pin single points at 0 in the middle
// of the sleeve
const trunkHeld = (x, y, z) => y < 72 || z < -9 || (Math.abs(x) > 24 && y < 82) || (z < 5 && y < 89 && Math.abs(x) > 3);

let SLEEVE = null;
/**
 * The sleeve position as a harmonic field in a thin shell round the outline (1 mm grid, |SDF| < 2.2 mm — the
 * Laplacian there is the surface Laplacian), between the rigid head (1) and the held trunk (0), half eased. A harmonic field spreads the head's turn as evenly as the surface allows: the twist about
 * the neck shears the plumage by (turn) × ∂s/∂(angle round the neck), and where the plain ratio changed fast round
 * the neck — behind the cheek, where the side of the head comes within a few millimetres of the shoulder — the side
 * the head turned toward folded over itself. One field for every level of detail and for the body feathers.
 */
function sleeveGrid() {
  if (SLEEVE) return SLEEVE;
  const sdf = makeBodySDF(CFG.bodySculpt);
  const h = 1.0;
  const o = [-46, 55, -30];
  const N = [Math.ceil(92 / h) + 1, Math.ceil(58 / h) + 1, Math.ceil(80 / h) + 1];
  const id = (i, j, k) => i + N[0] * (j + N[1] * k);
  const val = new Float32Array(N[0] * N[1] * N[2]).fill(NaN);
  const state = new Uint8Array(val.length); // 0 outside the shell, 1 free, 2 held
  // (the outline first on a 4× coarser grid: fine cells further than the shell from it are skipped — the sculpt's
  // distance is ≈1-Lipschitz — a sixth of the evaluations)
  const C = 4;
  const NC = N.map((n) => Math.ceil((n - 1) / C) + 1);
  const coarse = new Float32Array(NC[0] * NC[1] * NC[2]);
  for (let k = 0; k < NC[2]; k++)
    for (let j = 0; j < NC[1]; j++)
      for (let i = 0; i < NC[0]; i++) coarse[i + NC[0] * (j + NC[1] * k)] = sdf(o[0] + i * C * h, o[1] + j * C * h, o[2] + k * C * h);
  const reach = 2.2 + 1.5 * C * h;
  for (let k = 0; k < N[2]; k++)
    for (let j = 0; j < N[1]; j++)
      for (let i = 0; i < N[0]; i++) {
        const ci = Math.round(i / C);
        const cj = Math.round(j / C);
        const ck = Math.round(k / C);
        if (Math.abs(coarse[Math.min(ci, NC[0] - 1) + NC[0] * (Math.min(cj, NC[1] - 1) + NC[1] * Math.min(ck, NC[2] - 1))]) > reach) continue;
        const p = [o[0] + i * h, o[1] + j * h, o[2] + k * h];
        if (Math.abs(sdf(p[0], p[1], p[2])) > 2.2) continue;
        const r = sleeveRatio(p);
        const c = id(i, j, k);
        val[c] = r;
        state[c] = r >= 1 || (r === 0 && trunkHeld(p[0], p[1], p[2])) || j === 0 ? 2 : 1;
      }
  // successive over-relaxation over the free cells (neighbour lists flattened), until no cell moves by 1e-4
  const nb = [1, -1, N[0], -N[0], N[0] * N[1], -N[0] * N[1]];
  const free = [];
  for (let c = 0; c < val.length; c++) if (state[c] === 1) free.push(c);
  const nf = free.length;
  const start = new Int32Array(nf + 1);
  const list = [];
  for (let f = 0; f < nf; f++) {
    for (const d of nb) if (state[free[f] + d]) list.push(free[f] + d);
    start[f + 1] = list.length;
  }
  const L = Int32Array.from(list);
  for (let it = 0; it < 600; it++) {
    let moved = 0;
    for (let f = 0; f < nf; f++) {
      const m = start[f + 1] - start[f];
      if (!m) continue;
      let acc = 0;
      for (let q = start[f]; q < start[f + 1]; q++) acc += val[L[q]];
      const c = free[f];
      const v = Math.min(1, Math.max(0, val[c] + 1.85 * (acc / m - val[c])));
      moved = Math.max(moved, Math.abs(v - val[c]));
      val[c] = v;
    }
    if (moved < 1e-4) break;
  }
  SLEEVE = { h, o, N, val, id };
  return SLEEVE;
}

/** Sleeve position (0 trunk … 1 head) of a rest point (mm): the harmonic field, eased; the eased ratio off its grid. */
export function sleeveAt(p) {
  const G = sleeveGrid();
  const f = [0, 1, 2].map((a) => (p[a] - G.o[a]) / G.h);
  const b = f.map(Math.floor);
  if (b.some((x, a) => x < 0 || x >= G.N[a] - 1)) return sleeveParam(p);
  let acc = 0;
  let wsum = 0;
  for (let dk = 0; dk < 2; dk++)
    for (let dj = 0; dj < 2; dj++)
      for (let di = 0; di < 2; di++) {
        const v = G.val[G.id(b[0] + di, b[1] + dj, b[2] + dk)];
        if (v !== v) continue;
        const w = (di ? f[0] - b[0] : 1 - f[0] + b[0]) * (dj ? f[1] - b[1] : 1 - f[1] + b[1]) * (dk ? f[2] - b[2] : 1 - f[2] + b[2]);
        acc += w * v;
        wsum += w;
      }
  return wsum > 1e-6 ? EASE(acc / wsum) : sleeveParam(p);
}

/**
 * Body skinning. Trunk: tail / body / chest by distance (SPINE). Head: rigid. Between them the neck sleeve
 * (sleeve position s, sleeveAt): hats over s on `n` sleeve helper bones evenly spaced between the trunk (s 0) and
 * the head (s 1). The animator places each helper on a smooth curve from the neck base to the head and turns it by
 * its share of the head's rotation (_poseSleeve), so a cross-section of the sleeve turns about its own centre and
 * neighbouring influences never differ by more than 1/(n+1) of the head's turn: the plumage twists evenly from the
 * breast to the head instead of shearing between bones 25 mm apart (the old chain + throat-helper weighting folded the
 * throat into smeared creases when the head turned 70–110° and collapsed it when preening). Linear blending between
 * neighbours stays volume preserving at these angles (≤ 30° for the 180° of preening the tail), which keeps the GLB
 * exact.
 */
export function computeSpineWeights(p, boneIndex, s = sleeveAt(p)) {
  const n = CFG.joints.sleeve.n;
  s *= n + 1;
  const W = {};
  const add = (bone, v) => {
    if (v > 1e-4) W[bone] = (W[bone] ?? 0) + v;
  };
  const wt = Math.max(0, 1 - s);
  if (wt > 0) for (const [bi, v] of trunkWeights(p, boneIndex)) add(bi, wt * v);
  for (let k = 1; k <= n + 1; k++) add(k === n + 1 ? boneIndex.head : boneIndex[`sleeve${k}`], Math.max(0, 1 - Math.abs(s - k)));
  const order = Object.entries(W)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const sum = order.reduce((acc, [, v]) => acc + v, 0) || 1;
  return order.map(([bi, v]) => [Number(bi), v / sum]);
}

// The sculpt is the relaxed stand, fluffing 0.15 (photos, body_shape_spec.md §12): the shaders displace by
// (fluff − FLUFF_REST) so the bind outline is the photographed one; alert (−0.25) sleeks it
export const FLUFF_REST = 0.15;

/**
 * Where the body shader displaces the outline along its normal (rest position and normal, mm): [fluff
 * displacement (mm per unit of fluff), breathing mask]. Same expressions as the body vertex shader
 * (KentishPloverMaterials.createBodyMaterial, kpFluffMM); the plumage lying on the body uses them to rise and
 * fall with it. Per unit of fluff the lower outline drops 7 mm, the back rises 2.2 mm (4 mm over the shoulders,
 * z > 5, where the folded wing's coverts are tucked under it) and each side 2.5 mm; the head, the throat (z > 15)
 * and the rear (z < −25) fluff less. With the rest postures at fluff 1.35 this matches
 * the fluffed / restSit photo medians (Frame-A IoU 0.878 / 0.877, profile 10/17 and 9/17; the earlier 4 mm top and
 * flat front / rear at fluff 0.8–0.9 gave 0.846 / 0.857 and 5/17, 3/17 with the belly 0.03 L too shallow).
 */
export function bodyDisplacementMasks(p, n = [0, 1, 0]) {
  const fluff = (2.5 + 4.5 * smooth(-0.2, -0.9, n[1]) + (1.5 - 1.8 * smooth(5, -5, p[2])) * smooth(0.2, 0.9, n[1])) * (1 - 0.7 * headness(p)) * (1 - 0.8 * smooth(-25, -55, p[2])) * (1 - 0.6 * smooth(15, 30, p[2]));
  // chest and flanks (breast front at z 35, neck base at y ≈ 80 in the relaxed bind)
  const breath = smooth(-40, -15, p[2]) * (1 - smooth(18, 30, p[2])) * (1 - smooth(76, 84, p[1]));
  return [fluff, breath, napeMask(p, n)];
}

/** Hind-neck plumage that fills out when the head tilts back against the body (mm per mm of fill): centred on the
 *  crease between the hind crown and the mantle, (0, 97, 9) at rest, facing up / back (KentishPloverMaterials
 *  kpNapeMM mirrors it). */
export function napeMask(p, n) {
  const e = ((p[1] - 97) / 5.5) ** 2 + ((p[2] - 9) / 7.5) ** 2;
  return Math.exp(-e) * (1 - smooth(5, 11, Math.abs(p[0]))) * smooth(-0.1, 0.4, n[1]) * (1 - smooth(0.3, 0.7, n[2]));
}

export function flowDirection(p, n) {
  let fx = p[0] - BILL_TIP_MM[0];
  let fy = p[1] - BILL_TIP_MM[1] - 0.12 * Math.abs(p[0]);
  let fz = p[2] - BILL_TIP_MM[2];
  const d = fx * n[0] + fy * n[1] + fz * n[2];
  fx -= d * n[0];
  fy -= d * n[1];
  fz -= d * n[2];
  const l = Math.hypot(fx, fy, fz) || 1;
  return [fx / l, fy / l, fz / l];
}

const cache = new Map();

/** Build (and cache per resolution) the body geometry. */
export function buildBodyGeometry(cfg, boneIndex, resolutionMM) {
  const key = resolutionMM;
  if (cache.has(key)) return cache.get(key);
  const sdf = makeBodySDF(cfg.bodySculpt);
  const det = cfg.bodySculpt.facePatch;
  let positions;
  let normals;
  let indices;
  let baseTris = Infinity; // triangles of the base mesh (the face patches follow)
  if (det && resolutionMM <= det.maxBaseRes) {
    // Face patch (eye sockets, lores, bill base, forehead): the same SDF polygonised finer inside a sphere and
    // laid over the base mesh, which is sunk 0.35 mm under it there (its facets would cut the 2.8 mm eye opening
    // and the feathering round the bill). Past r − 0.8 the base surfaces again and the patch's rim dips 0.1 mm
    // under it: no seam, no stitching (same SDF, same normals, same plumage shader).
    const rr = (q, x, y, z) => Math.hypot(x - q.c[0], y - q.c[1], z - q.c[2]);
    // (no sink / dip any more: both meshes lie on the same SDF with the same gradient normals, so their overlap
    // band shades identically; sinking tilted the base normals and drew a visible ring round each patch)
    const base = surfaceNets(sdf, cfg.bodySculpt.bounds, resolutionMM);
    // the base mesh's own facets inside the patches are dropped (its coarse eye opening stood through the patch
    // in places once fluffing displaced both along their own normals)
    const inner = (i) => det.patches.some((q) => rr(q, base.positions[i * 3], base.positions[i * 3 + 1], base.positions[i * 3 + 2]) < q.r - 1.6);
    const kept = [];
    for (let t = 0; t < base.indices.length; t += 3) {
      const [a, b, c] = [base.indices[t], base.indices[t + 1], base.indices[t + 2]];
      if (!(inner(a) && inner(b) && inner(c))) kept.push(a, b, c);
    }
    base.indices = kept;
    const parts = [base];
    for (const q of det.patches) parts.push(surfaceNets(sdf, null, det.res, q));
    const pos = [];
    const nrm = [];
    const ind = [];
    for (const p of parts) {
      const off = pos.length / 3;
      for (const v of p.positions) pos.push(v);
      for (const v of p.normals) nrm.push(v);
      for (const i of p.indices) ind.push(i + off);
    }
    baseTris = kept.length / 3;
    positions = new Float32Array(pos);
    normals = new Float32Array(nrm);
    indices = new Uint32Array(ind);
  } else {
    ({ positions, normals, indices } = surfaceNets(sdf, cfg.bodySculpt.bounds, resolutionMM));
  }
  const n = positions.length / 3;
  const pos = new Float32Array(n * 3);
  const rest = new Float32Array(n * 3);
  const flow = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const sleeve = new Float32Array(n); // sleeve position (0 trunk … 1 head): the shell shader's neck plumage
  const sleeveG = new Float32Array(n * 3); // ∇s / |∇s|² (rest mm): the pattern lookup along the sleeve
  for (let i = 0; i < n; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const nn = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    rest.set(p, i * 3);
    pos.set([p[0] / 1000, p[1] / 1000, p[2] / 1000], i * 3);
    flow.set(flowDirection(p, nn), i * 3);
    const sv = sleeveAt(p);
    sleeve[i] = sv;
    if (sv > 1e-4 && sv < 1 - 1e-4) {
      const e = 0.4;
      const gr = [0, 1, 2].map((k) => {
        const a = [...p];
        const b = [...p];
        a[k] += e;
        b[k] -= e;
        return (sleeveAt(a) - sleeveAt(b)) / (2 * e);
      });
      const g2 = gr[0] * gr[0] + gr[1] * gr[1] + gr[2] * gr[2];
      const f = Math.min(1 / (g2 + 1e-6), 40 / Math.sqrt(g2 + 1e-12));
      sleeveG.set([gr[0] * f, gr[1] * f, gr[2] * f], i * 3);
    }
    const w = computeSpineWeights(p, boneIndex, sv);
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = w[k] ? w[k][0] : 0;
      skinWeight[i * 4 + k] = w[k] ? w[k][1] : 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setAttribute('aSleeve', new THREE.BufferAttribute(sleeve, 1));
  g.setAttribute('aSleeveG', new THREE.BufferAttribute(sleeveG, 3));
  g.setIndex(new THREE.BufferAttribute(n > 65535 ? indices : new Uint16Array(indices), 1));
  g.computeBoundingSphere();
  g.userData.sdf = sdf;
  g.userData.baseTris = baseTris;
  g.userData.patches = det && resolutionMM <= det.maxBaseRes ? det.patches : [];
  cache.set(key, g);
  return g;
}

export function getBodySDF(cfg) {
  return makeBodySDF(cfg.bodySculpt);
}

/**
 * Outline without the head: what the shoulders look like while the neck is bent away from them.
 * trunkOnly also drops the plumage that fills the neck at rest (mantleNape, foreBreast; body_shape_spec.md §7):
 * it is skinned to the neck bones and moves with the head, so the head / neck contact checks (animator) see
 * only the trunk underneath.
 */
export function getTorsoSDF(cfg, { trunkOnly = false } = {}) {
  const drop = new Set([...HEAD_PRIMS, ...(trunkOnly ? NECK_FILL : [])]);
  return makeBodySDF({ ...cfg.bodySculpt, prims: cfg.bodySculpt.prims.filter((p) => !drop.has(p.name)), cuts: [], adds: [] });
}

/**
 * Plumage fringe shells (LOD0): the body geometry repeated `n` times with aShell = k / n (k = 1…n); the shell
 * variant of the body material lifts each copy along its normal and keeps only the barb tips that reach it
 * (KentishPloverMaterials GLSL_SHELL_*).
 */
export function buildShellGeometry(body, n = 4) {
  const g = new THREE.BufferGeometry();
  const nv = body.getAttribute('position').count;
  for (const name of ['position', 'normal', 'aRest', 'aFlow', 'skinIndex', 'skinWeight', 'aSleeve', 'aSleeveG']) {
    const a = body.getAttribute(name);
    const out = new a.array.constructor(a.array.length * n);
    for (let k = 0; k < n; k++) out.set(a.array, k * a.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  const sh = new Float32Array(nv * n);
  for (let k = 0; k < n; k++) sh.fill((k + 1) / n, k * nv, (k + 1) * nv);
  g.setAttribute('aShell', new THREE.BufferAttribute(sh, 1));
  // only triangles that grow a fringe at all (shellCovered mirrors the zero cases of GLSL kpShellMM: under the
  // folded wing and the scapulars, round the eyes, under the tail coverts)
  const R = body.getAttribute('aRest').array;
  const N = body.getAttribute('normal').array;
  const bare = new Uint8Array(nv);
  const SV = body.getAttribute('aSleeve').array;
  for (let v = 0; v < nv; v++) bare[v] = shellCovered([R[v * 3], R[v * 3 + 1], R[v * 3 + 2]], [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], SV[v]) ? 1 : 0;
  const all = body.index.array;
  const tri = [];
  // (and none from the base mesh where a face patch overlies it: doubled shells drew a ring round each patch)
  const inPatch = (v) => (body.userData.patches ?? []).some((q) => Math.hypot(R[v * 3] - q.c[0], R[v * 3 + 1] - q.c[1], R[v * 3 + 2] - q.c[2]) < q.r);
  for (let t = 0; t < all.length; t += 3) {
    if (bare[all[t]] && bare[all[t + 1]] && bare[all[t + 2]]) continue;
    if (t / 3 < (body.userData.baseTris ?? Infinity) && (inPatch(all[t]) || inPatch(all[t + 1]) || inPatch(all[t + 2]))) continue;
    tri.push(all[t], all[t + 1], all[t + 2]);
  }
  const idx = tri;
  const out = nv * n > 65535 ? new Uint32Array(idx.length * n) : new Uint16Array(idx.length * n);
  for (let k = 0; k < n; k++) for (let i = 0; i < idx.length; i++) out[k * idx.length + i] = idx[i] + k * nv;
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.computeBoundingSphere();
  return g;
}

/** Rest point where the plumage fringe has zero length (GLSL kpShellMM in KentishPloverMaterials). */
function shellCovered(p, n, sleeve = 0) {
  if (p[2] < -60) return true;
  const ax = Math.abs(p[0]);
  const q = [ax - 7.6, p[1] - 95, p[2] - 25.5];
  const es = q[0] * 0.954 + q[1] * 0.13 + q[2] * 0.27;
  const er = Math.hypot(q[0] - 0.954 * es, q[1] - 0.13 * es, q[2] - 0.27 * es);
  if (er + Math.max(0, 2 - es) < 3.6) return true;
  const z = p[2];
  const yb = wingEdgeY(z);
  // (neck plumage — on the sleeve — is never under the scapulars: drawn out by a stretched or turned neck it is in view)
  return headness(p) < 0.01 && p[1] + n[1] * 3 > yb - 1 && z < 8 && sleeve < 0.04;
}
