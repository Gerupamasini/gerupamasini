// Eyeball mesh (local frame: +Z = optical axis) and baked iris texture.
import { EYE, toObject, dirToObject } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../lib/noise.mjs';
import { pick } from './variant.mjs';

// photos: dark bronze iris with a bright golden band at its outer edge; the juvenile's large pupil shows a
// blue-green sheen
const IRIS_DARK = pick(0.75, 0.8), RIM_GOLD = pick(0.75, 0.9), PUPIL = pick([0.008, 0.01, 0.012], [0.004, 0.016, 0.02]);

export const PUPIL_ANGLE = EYE.pupil; // rad (half-angle from the axis)
export const IRIS_ANGLE = EYE.iris;
export const CORNEA_BULGE = 0.075;

const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function radiusAt(theta) {
  const k = 1 - smoothstep(0, 0.95, theta);
  return EYE.radius * (1 + CORNEA_BULGE * k * k);
}

function eyePoint(theta, psi) {
  const r = radiusAt(theta) / 1000; // metres
  return [r * Math.sin(theta) * Math.cos(psi), r * Math.sin(theta) * Math.sin(psi), r * Math.cos(theta)];
}

export function buildEyeMesh(NT = 64, NP = 96) {
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
        const dt = eyePoint(theta + e, psi).map((v, c) => v - eyePoint(theta - e, psi)[c]);
        const dp = eyePoint(theta, psi + e).map((v, c) => v - eyePoint(theta, psi - e)[c]);
        n = nrm(cross(dt, dp));
        if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = n.map((v) => -v);
      }
      normal.set(n, idx * 3);
      const r = theta / Math.PI;
      uv[idx * 2] = 0.5 + 0.5 * r * Math.cos(psi);
      uv[idx * 2 + 1] = 0.5 - 0.5 * r * Math.sin(psi);
    }
  }
  const tris = [];
  for (let j = 0; j < NT; j++)
    for (let i = 0; i < NP; i++) {
      const a = j * cols + i, b = j * cols + i + 1, c = (j + 1) * cols + i + 1, d = (j + 1) * cols + i;
      tris.push(a, d, c, a, c, b);
    }
  // verify outward winding at the equator
  {
    const j = NT >> 1, i = 3;
    const a = j * cols + i, d = (j + 1) * cols + i, c = (j + 1) * cols + i + 1;
    const P = (k) => [position[k * 3], position[k * 3 + 1], position[k * 3 + 2]];
    const u = P(d).map((v, k) => v - P(a)[k]), v = P(c).map((vv, k) => vv - P(a)[k]);
    const fn = cross(u, v);
    const nn = [normal[a * 3], normal[a * 3 + 1], normal[a * 3 + 2]];
    if (fn[0] * nn[0] + fn[1] * nn[1] + fn[2] * nn[2] < 0) {
      for (let k = 0; k < tris.length; k += 3) { const tmp = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = tmp; }
    }
  }
  return { position, normal, uv, indices: new Uint32Array(tris) };
}

/** Node transform (object space) for the left (+1) or right (-1) eye. */
export function eyeTransform(side) {
  const c = [EYE.center[0], EYE.center[1], EYE.center[2] * side];
  const ax = [EYE.axis[0], EYE.axis[1], EYE.axis[2] * side];
  const Z = nrm(dirToObject(ax));
  const up = [0, 1, 0];
  const Y = nrm(up.map((v, k) => v - Z[k] * (up[0] * Z[0] + up[1] * Z[1] + up[2] * Z[2])));
  const X = cross(Y, Z);
  // rotation matrix columns X, Y, Z -> quaternion
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * S; qx = (m21 - m12) / S; qy = (m02 - m20) / S; qz = (m10 - m01) / S;
  } else if (m00 > m11 && m00 > m22) {
    const S = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / S; qx = 0.25 * S; qy = (m01 + m10) / S; qz = (m02 + m20) / S;
  } else if (m11 > m22) {
    const S = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / S; qx = (m01 + m10) / S; qy = 0.25 * S; qz = (m12 + m21) / S;
  } else {
    const S = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / S; qx = (m02 + m20) / S; qy = (m12 + m21) / S; qz = 0.25 * S;
  }
  return { translation: toObject(c), rotation: [qx, qy, qz, qw] };
}

/** Iris / pupil texture (azimuthal-equidistant projection around the optical axis). */
export function paintIris(size = 1024) {
  const rgb = new Uint8Array(size * size * 3);
  const srgb = (c) => { c = clamp(c); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const dx = ((px + 0.5) / size) * 2 - 1;
      const dy = -(((py + 0.5) / size) * 2 - 1);
      const r = Math.min(Math.hypot(dx, dy), 1);
      const theta = r * Math.PI;
      const psi = Math.atan2(dy, dx);
      const lx = Math.sin(theta) * Math.cos(psi), ly = Math.sin(theta) * Math.sin(psi), lz = Math.cos(theta);
      // slightly irregular pupil margin
      const pupilEdge = PUPIL_ANGLE + 0.018 * perlin3(Math.cos(psi) * 2.2, Math.sin(psi) * 2.2, 0.5, 5) + 0.008 * perlin3(Math.cos(psi) * 9, Math.sin(psi) * 9, 1.5, 6);
      const upness = ly / Math.max(Math.sin(theta), 1e-3); // +1 dorsal … −1 ventral
      let c;
      if (theta < pupilEdge) {
        c = PUPIL.slice();
      } else if (theta < IRIS_ANGLE) {
        const f = (theta - pupilEdge) / (IRIS_ANGLE - pupilEdge);
        // As in the photos (IMG_1603, 03, user photo 1): brassy golden-cream guanine layer, brightest in a
        // band around the pupil, fading into olive-bronze; an irregular melanin cap darkens the dorsal iris;
        // the stroma is mottled with melanophores, not a clean gradient.
        // user close-ups: dark bronze-olive iris, narrow golden rim, pale silvery-cream crescent below the pupil
        const brass = [0.42, 0.33, 0.14], gold = [0.22, 0.16, 0.06], olive = [0.09, 0.075, 0.035], dark = [0.03, 0.026, 0.02];
        const t0 = smoothstep(0.02, 0.3, f), t1 = smoothstep(0.3, 0.75, f);
        c = brass.map((v, k) => mix(mix(v, gold[k], t0), olive[k], t1) * IRIS_DARK);
        const low = smoothstep(0.1, 0.75, -upness) * smoothstep(0.05, 0.25, f) * smoothstep(0.95, 0.6, f);
        c = c.map((v, k) => mix(v, [0.4, 0.36, 0.26][k], low * 0.4));
        // radial stroma fibres and crypts
        const fib = perlin3(Math.cos(psi) * 34, Math.sin(psi) * 34, f * 3.0, 11);
        const fib2 = perlin3(Math.cos(psi) * 80, Math.sin(psi) * 80, f * 7.0, 12);
        c = c.map((v) => v * (0.82 + 0.25 * fib + 0.12 * fib2));
        // mottled melanophores (cellular clusters)
        const m1 = fbm3(lx * 14, ly * 14, lz * 14, 3, 13);
        const m2 = fbm3(lx * 36, ly * 36, lz * 36, 2, 14);
        const mott = smoothstep(0.05, 0.35, m1) * 0.55 + smoothstep(0.25, 0.5, m2) * 0.35;
        c = c.map((v, k) => mix(v, dark[k] * 1.5, clamp(mott) * (0.35 + 0.4 * f)));
        // dorsal melanin cap with a ragged lower edge
        const capEdge = 0.25 + 0.18 * perlin3(Math.cos(psi) * 5, Math.sin(psi) * 5, 2.5, 15);
        const cap = smoothstep(capEdge, capEdge + 0.3, upness) * smoothstep(0.08, 0.3, f);
        c = c.map((v, k) => mix(v, dark[k] * 1.3, cap * 0.8));
        // golden band at the outer edge of the iris (broken by melanophores), then a thin dark limbus
        const band = smoothstep(0.66, 0.8, f) * smoothstep(0.98, 0.88, f) * (0.65 + 0.35 * smoothstep(-0.25, 0.3, perlin3(Math.cos(psi) * 11, Math.sin(psi) * 11, 4.1, 18))) * (1 - 0.45 * cap);
        c = c.map((v, k) => mix(v, [0.62, 0.45, 0.13][k], band * RIM_GOLD));
        c = c.map((v, k) => mix(v, dark[k], smoothstep(0.95, 1.0, f)));
        // pupillary ruff: a bright but broken golden rim
        const ruff = Math.exp(-(((theta - pupilEdge) / 0.022) ** 2)) * (0.55 + 0.45 * smoothstep(-0.2, 0.4, perlin3(Math.cos(psi) * 7, Math.sin(psi) * 7, 3.3, 16))) * (1 - 0.7 * cap);
        c = c.map((v, k) => v + [0.26, 0.19, 0.06][k] * ruff);
      } else {
        // outer eyeball (visible as a dark rim around the iris, as in the photos): brown-black with a
        // faint silvery-bronze sheen
        const sp = fbm3(lx * 16, ly * 16, lz * 16, 3, 17);
        const base = 0.045 + 0.035 * sp;
        c = [base * 1.2, base, base * 0.75];
        c = c.map((v) => v * (1 - 0.5 * smoothstep(0.2, 0.5, fbm3(lx * 40, ly * 40, lz * 40, 2, 19))));
      }
      const o = (py * size + px) * 3;
      rgb[o] = srgb(c[0]); rgb[o + 1] = srgb(c[1]); rgb[o + 2] = srgb(c[2]);
    }
  return { size, rgb };
}
