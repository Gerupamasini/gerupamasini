// Eyeball mesh (local frame: +Z = optical axis, metres) and the baked iris / sclera texture.
// トビハゼ eyes are large, raised and very mobile; the visible globe shows a golden-bronze iris with dark reticulation
// around a round black pupil, and the rest of the globe is covered by thin, dark, speckled skin.
import { EYE, dirToObject, norm3 } from './anatomy.mjs';
import { perlin3, fbm3, clamp, mix, smoothstep } from '../../lib/noise.mjs';

export const PUPIL_ANGLE = 0.4; // rad (half-angle from the axis)
export const IRIS_ANGLE = 1.12;
export const CORNEA_BULGE = 0.07;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function radiusAt(theta) {
  const k = 1 - smoothstep(0, IRIS_ANGLE + 0.1, theta);
  return EYE.radius * (1 + CORNEA_BULGE * k * k);
}
function eyePoint(theta, psi) {
  const r = radiusAt(theta) / 1000;
  return [r * Math.sin(theta) * Math.cos(psi), r * Math.sin(theta) * Math.sin(psi), r * Math.cos(theta)];
}

export function buildEyeMesh(NT = 48, NP = 64) {
  const cols = NP + 1, rows = NT + 1;
  const position = new Float32Array(cols * rows * 3);
  const normal = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const e = 1e-4;
  for (let j = 0; j < rows; j++) {
    const theta = (j / NT) * Math.PI;
    for (let i = 0; i < cols; i++) {
      const psi = (i / NP) * Math.PI * 2;
      const idx = j * cols + i;
      const p = eyePoint(theta, psi);
      position.set(p, idx * 3);
      let n;
      if (j === 0) n = [0, 0, 1];
      else if (j === NT) n = [0, 0, -1];
      else {
        const a = eyePoint(theta + e, psi), b = eyePoint(theta - e, psi), c = eyePoint(theta, psi + e), d = eyePoint(theta, psi - e);
        n = norm3(cross([a[0] - b[0], a[1] - b[1], a[2] - b[2]], [c[0] - d[0], c[1] - d[1], c[2] - d[2]]));
        if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = n.map((v) => -v);
      }
      normal.set(n, idx * 3);
      const r = theta / Math.PI;
      uv[idx * 2] = 0.5 + 0.5 * r * Math.cos(psi);
      uv[idx * 2 + 1] = 0.5 - 0.5 * r * Math.sin(psi);
    }
  }
  const tris = [];
  for (let j = 0; j < NT; j++) for (let i = 0; i < NP; i++) {
    const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1, d = (j + 1) * cols + i;
    tris.push(a, d, c, a, c, b);
  }
  // outward winding at the equator
  {
    const j = NT >> 1, i = 3;
    const a = j * cols + i, d = (j + 1) * cols + i, c = (j + 1) * cols + i + 1;
    const P = (k) => [position[k * 3], position[k * 3 + 1], position[k * 3 + 2]];
    const fn = cross([P(d)[0] - P(a)[0], P(d)[1] - P(a)[1], P(d)[2] - P(a)[2]], [P(c)[0] - P(a)[0], P(c)[1] - P(a)[1], P(c)[2] - P(a)[2]]);
    if (fn[0] * P(a)[0] + fn[1] * P(a)[1] + fn[2] * P(a)[2] < 0) for (let k = 0; k < tris.length; k += 3) { const t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
  }
  return { position, normal, uv, indices: new Uint32Array(tris) };
}

/** quaternion rotating +Z onto the optical axis (object space); side +1 = left, -1 = right */
export function eyeRotation(side) {
  const a = dirToObject(EYE.axis);
  const ax = side > 0 ? a : [-a[0], a[1], a[2]];
  const z = [0, 0, 1];
  const c = cross(z, ax);
  const d = ax[2];
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

/** Iris + sclera texture (sRGB). uv: polar layout, centre = optical axis, radius 0.5 = posterior pole. */
export function paintIris(size = 512) {
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
    const r = Math.hypot(dx, dy) * 2; // 0 … 1 = theta / pi
    const theta = r * Math.PI;
    const psi = Math.atan2(-dy, dx);
    let col;
    if (theta < PUPIL_ANGLE) {
      // pupil: black, a faint deep reflection of the lens
      col = [6, 7, 8].map((c) => c + 10 * smoothstep(PUPIL_ANGLE * 0.7, PUPIL_ANGLE, theta));
    } else if (theta < IRIS_ANGLE) {
      const f = (theta - PUPIL_ANGLE) / (IRIS_ANGLE - PUPIL_ANGLE);
      // golden-bronze iris, brighter toward the pupil rim, with dark reticulation and radial fibres
      const fib = 0.5 + 0.5 * Math.sin(psi * 46 + 3 * fbm3(Math.cos(psi) * 2, Math.sin(psi) * 2, f * 3, 3, 601));
      const reti = smoothstep(0.55, 0.78, fbm3(Math.cos(psi) * 5 * (1 + f), Math.sin(psi) * 5 * (1 + f), f * 6, 4, 607) * 0.5 + 0.5);
      col = [mix(150, 88, f), mix(118, 70, f), mix(62, 42, f)];
      col = col.map((c) => c * (0.82 + 0.18 * fib));
      col = col.map((c, i) => mix(c, [36, 30, 24][i], reti * 0.85));
      // greenish sheen in a ring and a thin bright pupil margin
      col = col.map((c, i) => mix(c, [128, 150, 112][i], 0.25 * Math.exp(-(((f - 0.55) / 0.2) ** 2))));
      col = col.map((c, i) => mix(c, [228, 196, 120][i], smoothstep(0.08, 0.0, f) * 0.7));
      // dark limbus
      col = col.map((c) => c * (1 - 0.6 * smoothstep(0.8, 1.0, f)));
    } else {
      // pigmented skin over the rest of the globe (hidden in the cup), speckled
      const n = fbm3(Math.cos(psi) * 3, Math.sin(psi) * 3, theta * 3, 3, 613);
      const sp = smoothstep(0.6, 0.75, perlin3(Math.cos(psi) * 14, Math.sin(psi) * 14, theta * 14, 617) * 0.5 + 0.5);
      col = [58, 52, 44].map((c, i) => mix(c * (1 + 0.15 * n), [30, 27, 24][i], sp * 0.6));
      col = col.map((c, i) => mix(c, [96, 88, 74][i], 0.3 * smoothstep(IRIS_ANGLE + 0.15, IRIS_ANGLE + 0.02, theta)));
    }
    const k = (y * size + x) * 3;
    for (let c = 0; c < 3; c++) rgb[k + c] = clamp(Math.round(col[c]), 0, 255);
  }
  return { size, rgb };
}
