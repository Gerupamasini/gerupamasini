// The トビハゼ eye globe: a sphere whose surface is mostly skin (the pigmented conjunctiva over the sclera, the same
// speckled skin as the head) with only an iris-sized clear window (the cornea over the iris and pupil) on its
// front-lateral face. The skin cap turns with the globe (B013: the window moves to the front of the dome with the cap
// following); the dermal cup and collar round the globe's lower part are the head's (head.mjs).
// research/anat_soft.md §2: window 0.6–0.72 ED across (0.62 here, a corneal cap of 38° half-angle: against the visible
// dome and collar it is the measured 0.53–0.65), its axis 55° out and 15° up at
// rest; the cornea bulges a little (a smaller radius of curvature) and a faint limbus groove rings it.
import { HEAD } from './anatomy.mjs';

/** Eye-mesh tunables: the window's half-angle (deg), the corneal bulge (fraction of the radius), the limbus ring. */
export const EYE_SCULPT = {
  windowHalf: 38,
  bulge: 0.035,
  limbus: { width: 4, depth: 0.006 },
  // the window's axis in the eye's rest frame (fish frame: forward is −s, up +y, lateral +z for the left eye)
  axis: [-0.554, 0.259, 0.791],
};

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * The globe as a UV sphere about its window axis (fish frame, centred on the origin, radius r), split into the skin
 * (conjunctiva) and the cornea (window) by the window's half-angle; returns { position, normal, uv, skin, cornea }
 * where skin and cornea are index arrays. uv: (azimuth about the axis, polar angle from the axis), for the iris
 * texture (the pupil at v = 0) and the skin's speckle.
 */
export function eyeGlobe(r = HEAD.eye.d / 2, { nt = 48, np = 96, side = 1, K = EYE_SCULPT } = {}) {
  const a = norm([K.axis[0], K.axis[1], K.axis[2] * side]);
  // a frame with w along the window axis
  const up = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([up[1] * a[2] - up[2] * a[1], up[2] * a[0] - up[0] * a[2], up[0] * a[1] - up[1] * a[0]]);
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const th0 = (K.windowHalf * Math.PI) / 180, lw = (K.limbus.width * Math.PI) / 180;
  // polar rings, denser across the window and the limbus
  const rings = [];
  const nw = Math.round(nt * 0.45);
  for (let j = 0; j <= nw; j++) rings.push((j / nw) * (th0 + lw));
  for (let j = 1; j <= nt - nw; j++) rings.push(th0 + lw + (j / (nt - nw)) * (Math.PI - th0 - lw));
  const pos = [], nrm = [], uv = [];
  for (const th of rings) {
    // the cornea bulges (a smaller radius of curvature toward the axis) and the limbus is a shallow groove
    const inWin = th < th0 ? Math.cos((th / th0) * Math.PI * 0.5) : 0;
    const groove = Math.exp(-(((th - th0) / (lw * 0.6)) ** 2)) * K.limbus.depth;
    const rr = r * (1 + K.bulge * inWin * inWin - groove);
    for (let i = 0; i <= np; i++) {
      const ph = (i / np) * Math.PI * 2, st = Math.sin(th), ct = Math.cos(th);
      const d = [0, 1, 2].map((k) => st * Math.cos(ph) * u[k] + st * Math.sin(ph) * v[k] + ct * a[k]);
      pos.push(d[0] * rr, d[1] * rr, d[2] * rr);
      nrm.push(...d);
      uv.push(i / np, th / Math.PI);
    }
  }
  const skin = [], cornea = [];
  for (let j = 0; j + 1 < rings.length; j++)
    for (let i = 0; i < np; i++) {
      const p = j * (np + 1) + i, q = p + 1, s = p + np + 1, t = s + 1;
      (rings[j + 1] <= th0 + 1e-9 ? cornea : skin).push(p, s, t, p, t, q);
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
