// Eyeball mesh (local frame: +Z = optical axis, +X horizontal, +Y up; metres) and its baked textures.
// Read from close-ups of live トビハゼ: the visible globe is mostly pupil — a big, horizontally oval, black pupil in
// which the lens throws a green-blue glow — rimmed by a thin copper ring (the pupillary margin of the iris); the
// rest of the iris is a narrow dark grey-brown band with bronze flecks. The ring is iridescent: copper in side
// light, turquoise-blue when lit and seen head-on (structural colour), so it carries a thin-film layer
// (KHR_materials_iridescence) and is partly metallic. A wet cornea (clearcoat) sits over everything.
import { EYE, dirToObject, norm3 } from './anatomy.mjs';
import { perlin3, fbm3, clamp, mix, smoothstep } from '../../lib/noise.mjs';

export const PUPIL_ANGLE = 0.6; // rad, mean half-angle from the axis
export const PUPIL_ELONG = 0.15; // the pupil is wider than tall (×1.35)
export const RING_ANGLE = 0.16; // angular width of the ring: a thin copper margin, then a turquoise band
export const IRIS_ANGLE = 1.02; // outer edge of the iris (limbus)
export const CORNEA_BULGE = 0.05;

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

/**
 * Rest orientation of an eyeball (object space quaternion): local +Z onto the optical axis, local +X horizontal and
 * local +Y up, so the oval pupil lies level and the lens glow sits in the upper half. side +1 = left, -1 = right.
 */
export function eyeRotation(side) {
  const a = dirToObject(EYE.axis);
  const Z = side > 0 ? a : [-a[0], a[1], a[2]];
  const X = norm3(cross([0, 1, 0], Z));
  const Y = cross(Z, X);
  // rotation matrix with columns X, Y, Z → quaternion
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S]; }
  else if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
  else if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
  else { const S = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S]; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return q.map((v) => v / l);
}

/** the pupil's half-angle in the direction psi (0 = horizontal) */
const pupilAt = (psi) => PUPIL_ANGLE * (1 + PUPIL_ELONG * Math.cos(2 * psi));

/** polar texel → (theta, psi, the zone parameters) */
function polar(x, y, size) {
  const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
  const theta = Math.hypot(dx, dy) * 2 * Math.PI;
  const psi = Math.atan2(-dy, dx);
  const tp = pupilAt(psi);
  return { theta, psi, tp, tr: tp + RING_ANGLE * (1 + 0.25 * Math.sin(3 * psi + 1)) };
}

/**
 * Textures of the globe (polar uv: centre = optical axis, radius 0.5 = posterior pole):
 *   rgb  — albedo (sRGB)
 *   mr   — glTF metallic-roughness (G roughness, B metalness)
 *   irid — iridescence (R strength, G film thickness)
 */
export function paintEye(size = 512) {
  const rgb = new Uint8Array(size * size * 3);
  const mr = new Uint8Array(size * size * 3);
  const irid = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const { theta, psi, tp, tr } = polar(x, y, size);
    const cx = Math.cos(psi), sy = Math.sin(psi);
    const k = (y * size + x) * 3;
    let col, rough = 0.32, metal = 0, ir = 0.15, th = 0.5;
    const grain = fbm3(cx * 9 * (theta + 0.2), sy * 9 * (theta + 0.2), theta * 4, 4, 701) * 0.5 + 0.5;
    if (theta < tp) {
      // pupil: black; the lens glow — a mottled green-teal-blue patch above the centre
      const q = theta / tp;
      const up = Math.pow(clamp(0.5 + 0.6 * sy), 0.8);
      const mot = smoothstep(0.35, 0.8, fbm3(cx * 3.2 * q + 5, sy * 3.2 * q, 1.3, 4, 709) * 0.5 + 0.5);
      const glow = smoothstep(0.95, 0.25, q) * up * (0.35 + 0.65 * mot);
      const hue = fbm3(cx * 2 * q, sy * 2 * q, 7.7, 3, 719) * 0.5 + 0.5;
      const gc = [mix(14, 46, hue), mix(78, 104, hue), mix(96, 52, hue)];
      col = [5, 6, 7].map((c, i) => mix(c, gc[i], glow * 0.8));
      rough = 0.18;
      ir = 0.55 + 0.35 * glow;
      th = 0.35 + 0.4 * hue;
    } else if (theta < tr) {
      // the ring: a thin copper margin round the pupil, then the turquoise band (iridophores) that glows in
      // frontal light, flecked, fading into the dark iris
      const f = (theta - tp) / (tr - tp);
      const fl = 0.75 + 0.35 * grain;
      const copper = [204, 120, 58].map((c) => c * fl);
      const teal = [44, 168, 160].map((c, i) => c * (0.8 + 0.3 * grain) * (1 - 0.35 * smoothstep(0.6, 1.0, f)));
      col = copper.map((c, i) => mix(c, teal[i], smoothstep(0.12, 0.3, f)));
      col = col.map((c, i) => mix(c, [240, 178, 108][i], smoothstep(0.1, 0.0, f) * 0.6));
      col = col.map((c, i) => mix(c, [40, 36, 32][i], smoothstep(0.8, 1.0, f) * 0.7));
      rough = mix(0.28, 0.22, smoothstep(0.12, 0.3, f));
      metal = 0.55 * (1 - smoothstep(0.12, 0.3, f)) + 0.2;
      ir = 1.0;
      th = mix(0.5, 0.36, smoothstep(0.12, 0.3, f)) + 0.12 * grain;
    } else if (theta < IRIS_ANGLE) {
      // the rest of the iris: dark grey-brown with radial striation and bronze flecks, darkest at the limbus
      const f = (theta - tr) / (IRIS_ANGLE - tr);
      const stri = 0.5 + 0.5 * Math.sin(psi * 70 + 4 * fbm3(cx * 2, sy * 2, f * 2, 3, 727));
      const fleck = smoothstep(0.62, 0.82, perlin3(cx * 22 * (1 + f), sy * 22 * (1 + f), f * 9, 733) * 0.5 + 0.5);
      col = [50, 43, 37].map((c) => c * (0.85 + 0.2 * stri) * (1 - 0.45 * smoothstep(0.55, 1.0, f)));
      col = col.map((c, i) => mix(c, [150, 104, 60][i], fleck * 0.55 * (1 - f)));
      rough = 0.34;
      metal = 0.15 * fleck;
      ir = 0.7 * (1 - 0.6 * f);
      th = 0.55 + 0.3 * stri;
    } else {
      // the globe beyond the limbus: dark, finely speckled; the part left uncovered by the socket reads near-black
      const n = fbm3(cx * 3, sy * 3, theta * 3, 3, 613);
      const sp = smoothstep(0.6, 0.75, perlin3(cx * 14, sy * 14, theta * 14, 617) * 0.5 + 0.5);
      col = [34, 30, 27].map((c, i) => mix(c * (1 + 0.15 * n), [18, 16, 14][i], sp * 0.6));
      col = col.map((c, i) => mix(c, [70, 62, 52][i], smoothstep(1.45, 1.9, theta)));
      rough = 0.36;
      ir = 0.2;
    }
    for (let c = 0; c < 3; c++) rgb[k + c] = clamp(Math.round(col[c]), 0, 255);
    mr[k] = 0; mr[k + 1] = clamp(Math.round(rough * 255), 0, 255); mr[k + 2] = clamp(Math.round(metal * 255), 0, 255);
    irid[k] = clamp(Math.round(ir * 255), 0, 255); irid[k + 1] = clamp(Math.round(th * 255), 0, 255); irid[k + 2] = 0;
  }
  return { size, rgb, mr, irid };
}
