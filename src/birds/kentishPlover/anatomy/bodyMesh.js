import * as THREE from 'three';
import { makeBodySDF, surfaceNets } from './sdf.js';

// Body (head–neck–torso–rump) mesh from the SDF sculpt. Attributes:
//   position/normal (metres), aRest (rest position, mm) and aFlow (feather flow direction, rest space)
//   for the procedural plumage shader, skinIndex/skinWeight for the spine chain.

// Feather flow: gradient of distance from the bill tip (feathers point away from the bill, toward the
// tail), with a slight ventral bias on the sides. Used identically in the shader. Relaxed bind bill tip
// (body_shape_spec.md §3, §17.1).
export const BILL_TIP_MM = [0, 83.4, 54];

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
export function headness(p) {
  const x = p[0] / 13;
  const y = (p[1] - 93.5) / 13;
  const z = (p[2] - 24) / 15.5;
  const r = Math.sqrt(x * x + y * y + z * z);
  // Throat below the head is shared with the neck; the fore-breast / chin band (y 74–83) stays off the head.
  const below = Math.max(0, (83 - p[1]) / 5);
  return Math.max(0, Math.min(1, (1.25 - r) / 0.35)) * Math.max(0, 1 - below);
}

export function computeSpineWeights(p, boneIndex) {
  const w = SPINE.map((s) => {
    const d = segDist(p, s.a, s.b);
    return Math.exp(-(d * d) / (2 * s.s * s.s));
  });
  const h = headness(p);
  for (let i = 0; i < SPINE.length; i++) w[i] *= SPINE[i].bone === 'head' ? 1 : 1 - h;
  w[SPINE.length - 1] = Math.max(w[SPINE.length - 1], h);
  // the head's blend band (throat, chin, nape) shares with the upper neck rather than straight with the chest:
  // with the head turned back to preen, skin half on the head and half on the chest stretched as a sheet
  // across the shoulder and the folded wing
  const n2 = SPINE.findIndex((s) => s.bone === 'neck2');
  w[n2] = Math.max(w[n2], 1.6 * Math.min(h, 1 - h));
  const order = w.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 4);
  const sum = order.reduce((acc, [v]) => acc + v, 0) || 1;
  return order.map(([v, i]) => [boneIndex[SPINE[i].bone], v / sum]);
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
  if (det && resolutionMM <= det.maxBaseRes) {
    // Face patch (eye sockets, lores, bill base, forehead): the same SDF polygonised finer inside a sphere and
    // laid over the base mesh, which is sunk 0.35 mm under it there (its facets would cut the 2.8 mm eye opening
    // and the feathering round the bill). Past r − 0.8 the base surfaces again and the patch's rim dips 0.1 mm
    // under it: no seam, no stitching (same SDF, same normals, same plumage shader).
    const rr = (q, x, y, z) => Math.hypot(x - q.c[0], y - q.c[1], z - q.c[2]);
    const sink = (x, y, z) => det.patches.reduce((s, q) => Math.max(s, 1 - smooth(q.r - 1.6, q.r - 0.8, rr(q, x, y, z))), 0);
    const base = surfaceNets((x, y, z) => sdf(x, y, z) + det.sink * sink(x, y, z), cfg.bodySculpt.bounds, resolutionMM);
    // the base mesh's own facets inside the patches are dropped (its coarse eye opening stood through the patch
    // in places once fluffing displaced both along their own normals)
    const inner = (i) => det.patches.some((q) => rr(q, base.positions[i * 3], base.positions[i * 3 + 1], base.positions[i * 3 + 2]) < q.r - 1.6);
    const kept = [];
    for (let t = 0; t < base.indices.length; t += 3) {
      const [a, b, c] = [base.indices[t], base.indices[t + 1], base.indices[t + 2]];
      if (!(inner(a) || inner(b) || inner(c))) kept.push(a, b, c);
    }
    base.indices = kept;
    const parts = [base];
    for (const q of det.patches) parts.push(surfaceNets((x, y, z) => sdf(x, y, z) + 0.1 * smooth(q.r - 0.8, q.r, rr(q, x, y, z)), null, det.res, q));
    const pos = [];
    const nrm = [];
    const ind = [];
    for (const p of parts) {
      const off = pos.length / 3;
      for (const v of p.positions) pos.push(v);
      for (const v of p.normals) nrm.push(v);
      for (const i of p.indices) ind.push(i + off);
    }
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
  for (let i = 0; i < n; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const nn = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    rest.set(p, i * 3);
    pos.set([p[0] / 1000, p[1] / 1000, p[2] / 1000], i * 3);
    flow.set(flowDirection(p, nn), i * 3);
    const w = computeSpineWeights(p, boneIndex);
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
  g.setIndex(new THREE.BufferAttribute(n > 65535 ? indices : new Uint16Array(indices), 1));
  g.computeBoundingSphere();
  g.userData.sdf = sdf;
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
  const drop = new Set(['neck', 'head', 'lores', 'billCuff', 'chin', ...(trunkOnly ? ['mantleNape', 'foreBreast'] : [])]);
  return makeBodySDF({ ...cfg.bodySculpt, prims: cfg.bodySculpt.prims.filter((p) => !drop.has(p.name)), cuts: [] });
}
