import * as THREE from 'three';
import { makeBodySDF, surfaceNets } from './sdf.js';

// Body (head–neck–torso–rump) mesh from the SDF sculpt. Attributes:
//   position/normal (metres), aRest (rest position, mm) and aFlow (feather flow direction, rest space)
//   for the procedural plumage shader, skinIndex/skinWeight for the spine chain.

// Feather flow: gradient of distance from the bill tip (feathers point away from the bill, toward the
// tail), with a slight ventral bias on the sides. Used identically in the shader.
export const BILL_TIP_MM = [0, 76, 78];

// Spine influence segments (mm) and falloff sigma — distance-weighted skinning.
const SPINE = [
  { bone: 'tail', a: [0, 58.5, -38], b: [0, 58, -56], s: 7 },
  { bone: 'body', a: [0, 56.5, -34], b: [0, 57, -8], s: 13 },
  { bone: 'chest', a: [0, 57.5, -2], b: [0, 60, 22], s: 13 },
  { bone: 'neck0', a: [0, 63, 27], b: [0, 66, 30], s: 4.5 },
  { bone: 'neck1', a: [0, 68, 32], b: [0, 70, 34], s: 4.5 },
  { bone: 'neck2', a: [0, 72, 36], b: [0, 74, 38.5], s: 4.5 },
  { bone: 'head', a: [0, 77, 44], b: [0, 79, 55], s: 5.5 },
];

function segDist(p, a, b) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  let t = ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (bx * bx + by * by + bz * bz);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - by * t, p[2] - a[2] - bz * t);
}

/** Head membership: inside an enlarged head ellipsoid → rigid with the head bone. */
function headness(p) {
  const x = p[0] / 11.5;
  const y = (p[1] - 80) / 12;
  const z = (p[2] - 50) / 13.5;
  const r = Math.sqrt(x * x + y * y + z * z);
  // Throat below the head is shared with the neck.
  const below = Math.max(0, (74 - p[1]) / 5);
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
  const order = w.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 4);
  const sum = order.reduce((acc, [v]) => acc + v, 0) || 1;
  return order.map(([v, i]) => [boneIndex[SPINE[i].bone], v / sum]);
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where the body shader displaces the outline along its normal (rest position, mm): [fluff mask, breathing
 * mask]. Same expressions as the body vertex shader (KentishPloverMaterials.createBodyMaterial); the
 * plumage lying on the body uses them to rise and fall with it.
 */
export function bodyDisplacementMasks(p) {
  const fluff = smooth(40, 60, p[1]);
  const breath = smooth(-30, -5, p[2]) * (1 - smooth(22, 34, p[2])) * (1 - smooth(66, 74, p[1]));
  return [fluff, breath];
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
  const { positions, normals, indices } = surfaceNets(sdf, cfg.bodySculpt.bounds, resolutionMM);
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

/** Outline without neck and head: what the shoulders look like while the neck is bent away from them. */
export function getTorsoSDF(cfg) {
  const neckHead = new Set(['neck', 'head', 'lores', 'chin']);
  return makeBodySDF({ ...cfg.bodySculpt, prims: cfg.bodySculpt.prims.filter((p) => !neckHead.has(p.name)), cuts: [] });
}
