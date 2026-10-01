// Fin mesh topology.
//
// Each fin is a thin closed shell: two membrane layers (±normal) offset by a
// thickness that is large at the fleshy base and along the rays and tapers to
// a few micrometres at the margin. Vertex columns sit on every fin ray (with
// extra membrane columns between rays) so ray ridges and the corrugated
// ray/membrane shading follow the true lepidotrichia layout.
//
// Vertices carry only topological coordinates; the actual shape is
// reconstructed on the GPU from the simulated ray chains of the rig texture:
//   aFinIdx   = (texelBase, nChains, nNodes, finType)
//   aFinCoord = (chainCoord, t, layer ±1, thickness [SL])
//   aFinRay   = (rayCoord, rayCount, rNorm, leading-edge weight)
//   aFinLen   = true ray length / length of the chain interpolated at this
//               column: the GPU samples the interpolated chain at t * aFinLen
//               (extrapolating along its last segment), so the fin outline
//               follows the real per-ray lengths between the few simulated
//               chains (curved margins, forked / rounded lobes) instead of
//               straight spans from chain tip to chain tip

import * as THREE from 'three';
import { clamp } from '../core/math.js';

function chainCoordForR(r, chains) {
  for (let j = 0; j < chains.length - 1; j++) {
    if (r <= chains[j + 1] + 1e-9) {
      const f = (r - chains[j]) / Math.max(1e-9, chains[j + 1] - chains[j]);
      return j + clamp(f, 0, 1);
    }
  }
  return chains.length - 1;
}

/** Ray length at fin position r (linear between the defined rays, as the rig does). */
function rayLengthAt(rays, r) {
  for (let i = 0; i < rays.length - 1; i++) {
    const a = rays[i];
    const b = rays[i + 1];
    if (r <= b.r + 1e-9) {
      const f = clamp((r - a.r) / Math.max(1e-9, b.r - a.r), 0, 1);
      return a.length + (b.length - a.length) * f;
    }
  }
  return rays[rays.length - 1].length;
}

const cr1 = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

/** Chain length interpolated across chains exactly like finPoint() on the GPU. */
function chainLengthAt(lens, c) {
  const n = lens.length;
  const j = clamp(Math.floor(c), 0, n - 2);
  const f = clamp(c - j, 0, 1);
  const l1 = lens[j];
  const l2 = lens[j + 1];
  const l0 = j > 0 ? lens[j - 1] : 2 * l1 - l2;
  const l3 = j + 2 < n ? lens[j + 2] : 2 * l2 - l1;
  return cr1(l0, l1, l2, l3, f);
}

const T_SEG = { 0: 30, 1: 14, 2: 10, 3: 14, 4: 12 };

/**
 * @param layout   rig layout (from RigLayout.buildRigLayout)
 * @param quality  1 = LOD0, 0.5 = LOD1, 0.25 = LOD2
 */
export function buildFinGeometry(layout, quality = 1) {
  const membraneCols = quality >= 1 ? 2 : quality >= 0.5 ? 1 : 0;
  const rayStride = quality >= 0.5 ? 1 : 2; // LOD2 drops every other ray column

  const idxA = [];
  const coordA = [];
  const rayA = [];
  const lenA = [];
  const indices = [];
  let vcount = 0;

  for (const fin of layout.fins) {
    const { def, type } = fin;
    const rays = def.rays;
    const nRays = rays.length;
    const tSeg = Math.max(4, Math.round(T_SEG[type] * (quality >= 1 ? 1 : quality >= 0.5 ? 0.6 : 0.4)));

    // columns (rays + membranes)
    const cols = [];
    const rayIdx = [];
    for (let k = 0; k < nRays; k += rayStride) rayIdx.push(k);
    if (rayIdx[rayIdx.length - 1] !== nRays - 1) rayIdx.push(nRays - 1);
    for (let q = 0; q < rayIdx.length; q++) {
      const k = rayIdx[q];
      cols.push({ r: rays[k].r, rayCoord: k, isRay: 1, lead: k === 0 ? 1 : 0 });
      if (q < rayIdx.length - 1) {
        const k2 = rayIdx[q + 1];
        for (let m = 1; m <= membraneCols; m++) {
          const f = m / (membraneCols + 1);
          cols.push({ r: rays[k].r + (rays[k2].r - rays[k].r) * f, rayCoord: k + (k2 - k) * f, isRay: 0, lead: 0 });
        }
      }
    }
    const NCOL = cols.length;
    const NROW = tSeg + 1;
    // per-column length ratio (rest proportions; per-fish variation scales
    // whole fins, so the ratio is a shape property shared by all fish)
    const chainLens = def.chains.map((r) => rayLengthAt(rays, r));
    for (const col of cols) {
      col.c = chainCoordForR(col.r, def.chains);
      col.lenRatio = clamp(rayLengthAt(rays, col.r) / Math.max(1e-4, chainLengthAt(chainLens, col.c)), 0.25, 3);
    }

    const thicknessOf = (col, t) => {
      // fleshy base, thin distal membrane; rays add a tapered ridge
      let th = 0.0105 * Math.pow(1 - t, 7) + 0.0009 * (1 - t) + 0.00022;
      if (col.isRay) th += (0.0021 * (1 - t) * (1 - t) + 0.00028) * (col.lead ? (type === 0 ? 1.2 : 2.1) : 1);
      if (type === 3 || type === 4) th *= 0.85;
      return th;
    };

    const layerBase = [];
    for (const layer of [1, -1]) {
      layerBase.push(vcount);
      for (let i = 0; i < NROW; i++) {
        const t = Math.pow(i / tSeg, 1.12);
        for (let c = 0; c < NCOL; c++) {
          const col = cols[c];
          idxA.push(fin.base, fin.nChains, fin.nNodes, type);
          coordA.push(col.c, t, layer, thicknessOf(col, t));
          rayA.push(col.rayCoord, nRays, col.r, col.lead);
          lenA.push(col.lenRatio);
          vcount++;
        }
      }
    }
    // membrane triangles; winding follows cross(dP/dc, dP/dt) for layer +1
    for (let L = 0; L < 2; L++) {
      const b = layerBase[L];
      for (let i = 0; i < NROW - 1; i++) {
        for (let c = 0; c < NCOL - 1; c++) {
          const a = b + i * NCOL + c;
          const bb = a + 1;
          const d = a + NCOL;
          const e = d + 1;
          if (L === 0) indices.push(a, bb, d, bb, e, d);
          else indices.push(a, d, bb, bb, d, e);
        }
      }
    }
    // edge strips closing the shell along the first and last rays and the base
    const strip = (getA, getB, n, flip) => {
      for (let i = 0; i < n - 1; i++) {
        const a0 = getA(i);
        const a1 = getA(i + 1);
        const b0 = getB(i);
        const b1 = getB(i + 1);
        if (flip) indices.push(a0, b0, a1, a1, b0, b1);
        else indices.push(a0, a1, b0, a1, b1, b0);
      }
    };
    const [b0, b1] = layerBase;
    strip((i) => b0 + i * NCOL, (i) => b1 + i * NCOL, NROW, false); // first ray
    strip((i) => b0 + i * NCOL + NCOL - 1, (i) => b1 + i * NCOL + NCOL - 1, NROW, true); // last ray
    strip((c) => b0 + c, (c) => b1 + c, NCOL, true); // base
  }

  const g = new THREE.BufferGeometry();
  // three.js needs a position attribute for bookkeeping; shader ignores it
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vcount * 3), 3));
  g.setAttribute('aFinIdx', new THREE.BufferAttribute(new Float32Array(idxA), 4));
  g.setAttribute('aFinCoord', new THREE.BufferAttribute(new Float32Array(coordA), 4));
  g.setAttribute('aFinRay', new THREE.BufferAttribute(new Float32Array(rayA), 4));
  g.setAttribute('aFinLen', new THREE.BufferAttribute(new Float32Array(lenA), 1));
  g.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  return g;
}
