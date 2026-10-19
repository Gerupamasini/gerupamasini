// The トビハゼ eye globe: a sphere whose surface is mostly skin (the pigmented conjunctiva over the sclera, the same
// speckled skin as the head) with only an iris-sized clear window (the cornea over the iris and pupil) on its
// lateral face. The skin cap turns with the globe (B013: the window moves to the front of the dome with the cap
// following); the dermal cup and collar round the globe's lower part are the head's (head.mjs).
// research/anat_soft.md §2 and the eye critique of round n11: the visibly dark window is a horizontal oval set low on
// the dome (0.62–0.70 ED wide, 0.37–0.49 ED tall, skin 0.33–0.40 ED above it: u1, B009, B010, B020), facing about 25°
// forward of lateral and 12° up; the cornea bulges a little (a smaller radius of curvature) and a faint limbus groove
// rings it.

import { HEAD } from './anatomy.mjs';

/** Eye-mesh tunables: the window's half-angles (deg, horizontal and vertical about its axis), the corneal bulge
 * (fraction of the radius), the limbus ring. */
export const EYE_SCULPT = {
  windowHalf: [40, 23],
  bulge: 0.035,
  limbus: { width: 0.12, depth: 0.006 },
  // the window's axis in the eye's rest frame (fish frame: forward is −s, up +y, lateral +z for the left eye)
  axis: [-0.4134, 0.2079, 0.8865],
};

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * The globe as a sphere about its window axis (fish frame, centred on the origin, radius r), split into the skin
 * (conjunctiva) and the cornea (window). The rings follow the window's oval: a ring at ρ lies at the polar angle
 * ρ·θb(φ) inside the window (θb: the oval's half-angle at the azimuth φ about the axis) and beyond it runs on to the
 * back of the globe, so the window's edge is exactly a ring. Returns { position, normal, uv, skin, cornea } with
 * skin and cornea index arrays; uv: (azimuth about the axis, ρ / 2 inside the window and 0.5 … 1 beyond), for the
 * iris texture (the pupil at the centre) and the skin's speckle.
 */
export function eyeGlobe(r = HEAD.eye.d / 2, { nt = 48, np = 96, side = 1, K = EYE_SCULPT } = {}) {
  const a = norm([K.axis[0], K.axis[1], K.axis[2] * side]);
  // a frame with w along the window axis, u horizontal, v up
  const up = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([up[1] * a[2] - up[2] * a[1], up[2] * a[0] - up[0] * a[2], up[0] * a[1] - up[1] * a[0]]);
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const [hh, hv] = (Array.isArray(K.windowHalf) ? K.windowHalf : [K.windowHalf, K.windowHalf]).map((d) => (d * Math.PI) / 180);
  const thB = (ph) => 1 / Math.hypot(Math.cos(ph) / hh, Math.sin(ph) / hv);
  const lw = K.limbus.width;
  // rings in ρ: 0 … 1 across the window (denser), then 1 … 2 from its edge to the back pole
  const rings = [];
  const nw = Math.round(nt * 0.45);
  for (let j = 0; j <= nw; j++) rings.push(j / nw);
  for (let j = 1; j <= nt - nw; j++) rings.push(1 + j / (nt - nw));
  const pos = [], nrm = [], uv = [];
  for (const rho of rings) {
    // the cornea bulges toward the axis; the limbus is a shallow groove at the edge
    const inWin = rho < 1 ? Math.cos(rho * Math.PI * 0.5) : 0;
    const groove = Math.exp(-(((rho - 1) / (lw * 0.6)) ** 2)) * K.limbus.depth;
    const rr = r * (1 + K.bulge * inWin * inWin - groove);
    for (let i = 0; i <= np; i++) {
      const ph = (i / np) * Math.PI * 2, b = thB(ph);
      // beyond the edge the polar angle eases from the oval to the back pole (π)
      const th = rho <= 1 ? rho * b : b + (rho - 1) * (Math.PI - b);
      const st = Math.sin(th), ct = Math.cos(th);
      const d = [0, 1, 2].map((k) => st * Math.cos(ph) * u[k] + st * Math.sin(ph) * v[k] + ct * a[k]);
      pos.push(d[0] * rr, d[1] * rr, d[2] * rr);
      nrm.push(...d);
      uv.push(i / np, rho / 2);
    }
  }
  const skin = [], cornea = [];
  for (let j = 0; j + 1 < rings.length; j++)
    for (let i = 0; i < np; i++) {
      const p = j * (np + 1) + i, q = p + 1, s = p + np + 1, t = s + 1;
      (rings[j + 1] <= 1 + 1e-9 ? cornea : skin).push(p, s, t, p, t, q);
    }
  // smooth normals from the geometry (the bulge and the groove tilt them)
  const N = new Float32Array(nrm.length);
  const P = pos;
  const all = skin.concat(cornea);
  for (let k = 0; k < all.length; k += 3) {
    const [i0, i1, i2] = [all[k], all[k + 1], all[k + 2]];
    const e1 = [0, 1, 2].map((c) => P[i1 * 3 + c] - P[i0 * 3 + c]), e2 = [0, 1, 2].map((c) => P[i2 * 3 + c] - P[i0 * 3 + c]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of [i0, i1, i2]) for (let c = 0; c < 3; c++) N[i * 3 + c] += n[c];
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  // (p, s, t) runs along the polar angle, then the azimuth: counter-clockwise seen from outside, as (u, v, a) is
  // right-handed
  return { position: new Float32Array(pos), normal: N, uv: new Float32Array(uv), skin: new Uint32Array(skin), cornea: new Uint32Array(cornea) };
}
