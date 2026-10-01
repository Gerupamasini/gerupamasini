// Eyeball mesh (local frame: +Z = optical axis) and baked iris texture.
import { EYE, toObject, dirToObject } from './anatomy.mjs';
import { perlin3, fbm3, hash01, clamp, mix, smoothstep } from '../lib/noise.mjs';

export const PUPIL_ANGLE = 0.42; // エドハゼ: large pupil relative to the small eye // rad (half-angle from the axis)
export const IRIS_ANGLE = 1.08;
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
        c = [0.008, 0.01, 0.012];
      } else if (theta < IRIS_ANGLE) {
        const f = (theta - pupilEdge) / (IRIS_ANGLE - pupilEdge);
        // エドハゼ (photos 004, 028, 054, 055, 058): a strong cyan–turquoise iridescent ring hugs the pupil
        // (broken, brighter below), edged by a thin silvery-white rim; the outer iris is dark brown with
        // sparse gold flecks, darkest under a dorsal melanin cap; a pale silvery crescent lies below.
        const dark = [0.022, 0.018, 0.014], brown = [0.075, 0.05, 0.028], cyan = [0.05, 0.36, 0.34], teal = [0.025, 0.16, 0.17];
        const ringW = 0.3 + 0.06 * perlin3(Math.cos(psi) * 4, Math.sin(psi) * 4, 0.7, 21);
        const ring = smoothstep(ringW, ringW * 0.45, f);
        // ring brightness: broken by melanophores, brighter on the ventral side
        const brk = smoothstep(-0.25, 0.35, perlin3(Math.cos(psi) * 9, Math.sin(psi) * 9, 1.9, 22));
        const ventral = smoothstep(0.6, -0.5, upness);
        let c0 = cyan.map((v, k) => mix(teal[k], v, 0.45 + 0.55 * ventral) * (0.55 + 0.45 * brk));
        c = brown.map((v, k) => mix(v, c0[k], ring));
        // thin silvery rim at the pupil margin
        const rim = Math.exp(-(((theta - pupilEdge) / 0.02) ** 2)) * (0.6 + 0.4 * brk);
        c = c.map((v, k) => v + [0.32, 0.38, 0.36][k] * rim);
        // radial stroma fibres
        const fib = perlin3(Math.cos(psi) * 34, Math.sin(psi) * 34, f * 3.0, 11);
        c = c.map((v) => v * (0.85 + 0.22 * fib));
        // gold flecks in the outer iris
        const fl = smoothstep(0.55, 0.85, fbm3(lx * 30, ly * 30, lz * 30, 2, 23)) * smoothstep(0.35, 0.6, f) * (1 - smoothstep(0.9, 1.0, f));
        c = c.map((v, k) => v + [0.2, 0.15, 0.05][k] * fl * 0.7);
        // mottled melanophores
        const m1 = fbm3(lx * 14, ly * 14, lz * 14, 3, 13);
        c = c.map((v, k) => mix(v, dark[k], smoothstep(0.1, 0.4, m1) * 0.5 * smoothstep(0.25, 0.6, f)));
        // dorsal melanin cap with a ragged edge
        const capEdge = 0.2 + 0.18 * perlin3(Math.cos(psi) * 5, Math.sin(psi) * 5, 2.5, 15);
        const cap = smoothstep(capEdge, capEdge + 0.35, upness) * smoothstep(0.2, 0.45, f);
        c = c.map((v, k) => mix(v, dark[k], cap * 0.85));
        // pale silvery crescent below the pupil (outer iris)
        const cres = smoothstep(0.45, 0.85, -upness) * smoothstep(0.45, 0.6, f) * smoothstep(0.95, 0.75, f);
        c = c.map((v, k) => mix(v, [0.36, 0.38, 0.36][k], cres * 0.45));
        // limbal darkening
        c = c.map((v, k) => mix(v, dark[k], smoothstep(0.85, 1.0, f)));
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
