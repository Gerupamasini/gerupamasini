// Eyeball mesh (local frame: +Z = optical axis, +X horizontal, +Y up; metres) and its baked textures.
// Read from close-ups of live トビハゼ (lateral studio photograph, field photographs): most of the eye's outer face
// shows in the window of the skin cup. A large black pupil, a horizontal oval, is framed by a thin bright copper
// pupillary margin; the iris round it is narrow and dark olive-brown, with a green-gold structural sheen that is
// strongest in its lower half (KHR_materials_iridescence over a reflective base). Through the pupil the eye glows
// like a squid's, an iridescent crescent that slides across it with the view (the game's eye shader,
// TobihazeMaterial.ts; only a faint trace of it is baked here); beyond the iris the globe is
// covered by the head's own skin, darkest at the limbus: it is painted from the head's skin pattern (body.mjs skinAt)
// at the globe's rest position, so the pattern runs on unbroken from the head and the eye cup over the dome
// (photographs 3, 8, 10, 12: one skin, the cornea set in it). A wet, bulging cornea over the pupil and iris. (The
// iris is symmetric fore and aft; the right eye's mesh mirrors the texture's u, as the right dome mirrors the left.)
import { EYE, dirToObject, norm3 } from './anatomy.mjs';
import { perlin3, fbm3, clamp, mix, smoothstep } from '../../lib/noise.mjs';

export const PUPIL_ANGLE = 0.6; // rad, mean half-angle of the pupil from the axis
export const PUPIL_H = 0.62, PUPIL_V = 0.46; // its half-angles fore-and-aft and up-and-down (a horizontal oval)
export const RING_ANGLE = 0.035; // the copper pupillary margin
export const IRIS_ANGLE = 0.92; // outer edge of the iris (limbus): a thin ring round the large pupil
export const CORNEA_BULGE = 0.09;
/** the globe is meshed as far as it can ever show (all but the part deep in the cup) */
export const CAP_ANGLE = 2.9;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function radiusAt(theta) {
  const k = 1 - smoothstep(0, IRIS_ANGLE + 0.15, theta);
  return EYE.radius * (1 + CORNEA_BULGE * k * k);
}
function eyePoint(theta, psi) {
  const r = radiusAt(theta) / 1000;
  return [r * Math.sin(theta) * Math.cos(psi), r * Math.sin(theta) * Math.sin(psi), r * Math.cos(theta)];
}

/** mirror: the right eye's mesh (texture u mirrored fore and aft, see paintEye) */
export function buildEyeMesh(NT = 48, NP = 64, mirror = false) {
  const cols = NP + 1, rows = NT + 1;
  const position = new Float32Array(cols * rows * 3);
  const normal = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const e = 1e-4;
  for (let j = 0; j < rows; j++) {
    const theta = (j / NT) * CAP_ANGLE;
    for (let i = 0; i < cols; i++) {
      const psi = (i / NP) * Math.PI * 2;
      const idx = j * cols + i;
      const p = eyePoint(theta, psi);
      position.set(p, idx * 3);
      let n;
      if (j === 0) n = [0, 0, 1];
      else {
        const a = eyePoint(theta + e, psi), b = eyePoint(theta - e, psi), c = eyePoint(theta, psi + e), d = eyePoint(theta, psi - e);
        n = norm3(cross([a[0] - b[0], a[1] - b[1], a[2] - b[2]], [c[0] - d[0], c[1] - d[1], c[2] - d[2]]));
        if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = n.map((v) => -v);
      }
      normal.set(n, idx * 3);
      const r = theta / Math.PI;
      uv[idx * 2] = 0.5 + (mirror ? -0.5 : 0.5) * r * Math.cos(psi);
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
 * Rest orientation of an eyeball (object space quaternion): local +Z onto the resting gaze (a little above the cup's
 * window axis), local +X horizontal and local +Y up, so the oval pupil lies level and the lens glow sits in the upper
 * half. side +1 = left, -1 = right.
 */
export function eyeRotation(side) {
  const a = dirToObject(EYE.gaze);
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
const pupilAt = (psi) => 1 / Math.hypot(Math.cos(psi) / PUPIL_H, Math.sin(psi) / PUPIL_V);
/** the limbus follows the pupil's oval: a thin iris ring of nearly even width */
const limbAt = (psi) => 1 / Math.hypot(Math.cos(psi) / (PUPIL_H + 0.2), Math.sin(psi) / (PUPIL_V + 0.22));

/** polar texel → (theta, psi, the zone parameters) */
function polar(x, y, size) {
  const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
  const theta = Math.hypot(dx, dy) * 2 * Math.PI;
  const psi = Math.atan2(-dy, dx);
  const tp = pupilAt(psi);
  return { theta, psi, tp, tr: tp + RING_ANGLE * (1 + 0.2 * Math.cos(2 * psi)) };
}

/**
 * Textures of the globe (polar uv: centre = optical axis, radius 0.5 = posterior pole):
 *   rgb  — albedo (sRGB)
 *   mr   — glTF metallic-roughness (G roughness, B metalness)
 *   irid — iridescence (R strength, G film thickness), B the cornea's clear coat
 */
export function paintEye(size = 512, skinAt = null) {
  // the left eye's rest frame: texture direction → fish space (for the skin over the globe)
  const q = eyeRotation(1);
  const rot = (v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
  };
  const rgb = new Uint8Array(size * size * 3);
  const mr = new Uint8Array(size * size * 3);
  const irid = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const { theta, psi, tp, tr } = polar(x, y, size);
    const cx = Math.cos(psi), sy = Math.sin(psi);
    const ax = Math.abs(cx); // symmetric fore and aft
    const k = (y * size + x) * 3;
    let col, rough = 0.3, metal = 0, ir = 0, th = 0.5;
    const grain = fbm3(ax * 9 * (theta + 0.2), sy * 9 * (theta + 0.2), theta * 4, 4, 701) * 0.5 + 0.5;
    if (theta < tp) {
      // pupil: black. Its glow - the light of the sky thrown back through it in teal, green and gold by the
      // iridescent layer deep in the eye, a crescent or patch that slides across it (photographs 1, 3, 7, 8) - is
      // drawn by the game's eye shader (TobihazeMaterial.ts); here only a faint, granular trace of it, low in the pupil,
      // for viewers without it. The cornea over it only tints its reflections a little.
      const q = theta / tp;
      const gran = smoothstep(0.45, 0.85, perlin3(ax * 60, sy * 60, 2.1, 711) * 0.5 + 0.5);
      const glow = smoothstep(0.1, 0.9, -sy * q) * (0.3 + 0.7 * gran);
      col = [6, 8, 10].map((c, i) => mix(c, [14, 58, 46][i], glow * 0.6));
      rough = 0.1;
      ir = 0.35;
      th = 0.5 + 0.06 * (fbm3(ax * 3 * q + 5, sy * 3 * q, 1.3, 3, 709));
    } else if (theta < limbAt(psi)) {
      const f = (theta - tp) / (limbAt(psi) - tp);
      // the stroma: a fine, irregular granulation (no regular radial striae - photographs show a granular, speckled
      // band) over a faint reticulation
      const stri = fbm3(ax * 7, sy * 7, f * 5, 3, 727) * 0.5 + 0.5;
      const reti = smoothstep(0.5, 0.78, fbm3(ax * 6 * (1 + f), sy * 6 * (1 + f), f * 7, 4, 607) * 0.5 + 0.5);
      const cloud = fbm3(ax * 2.5, sy * 2.5, f * 3, 3, 739) * 0.5 + 0.5;
      // dark olive-brown, mottled; greener low in the iris
      const low = smoothstep(0.25, -0.7, sy);
      col = [50, 47, 35].map((c, i) => mix(c, [54, 66, 42][i], low) * (0.85 + 0.25 * stri) * (1 - 0.3 * reti) * (0.85 + 0.3 * grain));
      // dense gold-green granules, finer and fewer toward the limbus
      const g1 = smoothstep(0.62, 0.8, perlin3(ax * 46, sy * 46, f * 11, 733) * 0.5 + 0.5);
      const g2 = smoothstep(0.66, 0.84, perlin3(ax * 24 + 4, sy * 24, f * 7, 735) * 0.5 + 0.5);
      const fleck = Math.max(g1, 0.8 * g2) * (1 - 0.5 * smoothstep(0.55, 1.0, f));
      col = col.map((c, i) => mix(c, mix([150, 130, 72][i], [112, 132, 82][i], low), fleck * 0.5));
      // the bright copper pupillary margin, its width wavering a little round the pupil
      const rimW = (tr - tp + 0.008) * (0.75 + 0.5 * (fbm3(cx * 3, sy * 3, 2.7, 2, 741) * 0.5 + 0.5));
      const rim = smoothstep(rimW, 0.0, theta - tp);
      col = col.map((c, i) => mix(c, [178, 112, 66][i] * (0.85 + 0.3 * grain), rim * 0.85));
      // the limbus darkens
      col = col.map((c) => c * (1 - 0.4 * smoothstep(0.75, 1.0, f)));
      rough = 0.2 + 0.08 * reti;
      metal = 0.2 + 0.45 * rim + 0.15 * fleck;
      // the iridescent cornea continues over the iris, its colour drifting with the film's thickness
      ir = (0.85 - 0.35 * smoothstep(0.6, 1.0, f)) * (0.85 + 0.15 * stri) * (1 - 0.6 * rim);
      th = 0.5 + 0.35 * (cloud - 0.5) + 0.15 * low;
    } else {
      // beyond the iris: the globe is covered by skin like the head's (photographs: matte grey-brown, peppered with
      // melanophores and studded with sand grains; only the cornea over the pupil and iris is glossy), darker in a
      // narrow band round the limbus
      const g = smoothstep(limbAt(psi), limbAt(psi) + 0.18, theta);
      if (skinAt) {
        // the head's skin at this point of the globe (left eye at rest; object space → fish space)
        const o = rot([Math.sin(theta) * Math.cos(psi), Math.sin(theta) * Math.sin(psi), Math.cos(theta)]);
        const d = [-o[2], o[1], o[0]];
        const c0 = EYE.center;
        const sk = skinAt([c0[0] + d[0] * EYE.radius, c0[1] + d[1] * EYE.radius, c0[2] + d[2] * EYE.radius], d);
        col = sk.col;
        rough = mix(0.3, sk.rough, g);
      } else {
        const n = fbm3(ax * 3, sy * 3, theta * 3, 3, 613);
        const sp = smoothstep(0.58, 0.76, perlin3(ax * 16, sy * 16, theta * 16, 617) * 0.5 + 0.5);
        const fine = smoothstep(0.62, 0.8, perlin3(ax * 40, sy * 40, theta * 40, 619) * 0.5 + 0.5);
        const grain = smoothstep(0.78, 0.86, perlin3(ax * 30 + 3, sy * 30, theta * 30, 621) * 0.5 + 0.5);
        col = [108, 102, 90].map((c) => c * (1 + 0.14 * n));
        col = col.map((c, i) => mix(c, [44, 40, 34][i], Math.max(sp * 0.55, fine * 0.5)));
        col = col.map((c, i) => mix(c, [228, 226, 216][i], grain * 0.8));
        rough = mix(0.3, 0.55, g);
      }
      col = col.map((c, i) => mix([34, 31, 27][i], c, g));
    }
    for (let c = 0; c < 3; c++) rgb[k + c] = clamp(Math.round(col[c]), 0, 255);
    mr[k] = 0; mr[k + 1] = clamp(Math.round(rough * 255), 0, 255); mr[k + 2] = clamp(Math.round(metal * 255), 0, 255);
    // B: the cornea (glossy clear coat) over the pupil and iris, fading out over the skin-covered rest of the globe
    const cornea = 1 - smoothstep(limbAt(psi) + 0.02, limbAt(psi) + 0.16, theta);
    irid[k] = clamp(Math.round(ir * 255), 0, 255); irid[k + 1] = clamp(Math.round(th * 255), 0, 255); irid[k + 2] = clamp(Math.round((0.4 + 0.6 * cornea) * 255), 0, 255);
  }
  return { size, rgb, mr, irid };
}
