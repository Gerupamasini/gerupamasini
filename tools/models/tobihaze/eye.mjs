// The トビハゼ eye globe: a sphere whose surface is skin (the pigmented conjunctiva over the sclera, the same speckled
// skin as the head: everything on the dome that has the body's colour) with only a small clear window (the cornea over
// the iris and pupil) on its front-lateral face. The skin turns with the globe (B013: the window moves to the front of
// the dome with the skin following); the dermal cup and collar round the globe's lower part are the head's (head.mjs).
//
// The skin is a real layer: everywhere but the window the surface is the skin at the globe's radius r; the cornea lies
// a skin thickness deeper and bulges back up under it, and the skin ends at the window in a rounded margin like an
// eyelid's edge, a roll proud of the skin round it, a crescent over the window's upper front (a hood: B020, B064, u5,
// where the lid's pale margin runs along the crescent's inner edge) fading to a light lip under it (B064, B007: the
// window runs down to the cup with no ring). A soft groove outlines the hood, an arch over the window in side view
// (B064, B009, B010); there is no groove round the rest of the window (a full ring reads as a porthole).
// (The "cap" with a fold line over the top of the eye in u1, B009 and B010 is the far eye seen over the near one: the
// cameras are 15–18° above the fish, and the lobe stands forward of the near dome by the 0.2 ED that the inter-ocular
// distance gives at that yaw, as the renders at the same cameras show.)
//
// The window, measured on the photos at their cameras (the dark window with its gold ring): 0.56–0.71 ED wide and
// 0.33–0.61 ED tall face-on (u1 0.66×0.33, B009 0.56×0.36 dark, 0.80 h/w with the iris, B010 0.71×0.49, B064
// 0.68×0.49, B007 0.72×0.61; u5, the eyes raised in display, 0.34×0.57 ED front-on, from 0.29 ED above the centre to
// 0.28 under it); the clay shows the whole window dark, iris and all, where the photos' iris ring reads light; its centre
// 0.53–0.6 ED under the near dome's top in side view (u1, B009 with the camera 15–18° up: the axis 5–11° above the
// equator; B007 −10°; u5 +8°); from the front (u5) only a crescent on the outer edge of each dome, ≈0.3 of the dome's
// width: it faces about 27° forward of lateral.

import { HEAD } from './anatomy.mjs';

/** Eye-mesh tunables (angles in degrees, heights as fractions of the globe's radius). */
export const EYE_SCULPT = {
  // the clear window: its half-angles about its axis (horizontal, vertical); the height a compromise between u5 (0.57 ED
  // tall front-on, the eyes raised), B010 / B064 / B007 / B009 (h/w 0.78–0.85 with the iris ring) and u1 (0.52)
  windowHalf: [40, 31],
  // the window's axis in the eye's rest frame (fish frame: forward is −s, up +y, lateral +z for the left eye): 27°
  // forward of lateral, 4° above the equator
  axis: [-0.4529, 0.0698, 0.8889],
  // the skin's thickness: the cornea's edge lies this far under the skin round it
  skin: 0.055,
  // the cornea's apex above its edge
  bulge: 0.060,
  // the lid margin round the window: a rounded roll proud of the skin (`swell`: [hood, under the window]), its inner
  // face rounding over `round` degrees from the window's edge and the roll dying out `width` degrees from it; the
  // swell follows a crescent over the window's upper front (`hood`: its centre, degrees round from the window's back
  // edge through the top; `hoodPow` its narrowness), the single pale crescent of u5 and B020 on the upper-medial edge,
  // light under the window, where B064 and B007 show the window running down to the cup with no ring
  lid: { round: 4.0, width: 10, swell: [0.034, 0.012], hood: 120, hoodPow: 1.5 },
  // the fold outlining the lid: a soft groove `at` degrees out from the window's edge, `width` wide, `depth` deep,
  // along the hood only (`hood`: weighted by the lid's crescent), an arch over the window in side view (B064, B009,
  // u1), none under it (no porthole ring)
  fold: { at: 11, width: 2.6, depth: 0.020, hood: true, hoodPow: 1.0 },
  // the pupil inside the window (the rest of the window is the iris, gold-brown under the clear cornea): its edge at
  // `half` [horizontal, vertical] fractions of the window's half-angles, a horizontal oval with a notch `dent` deep
  // and `dentWidth` degrees wide in its top edge (B009, B010: a kidney- or heart-shaped dark pupil, h/w 0.53–0.66,
  // 0.63 / 0.53 of the window's width / height in B009, 0.80 / 0.69 in B010); a ring of the mesh runs along it
  pupil: { half: [0.78, 0.62], dent: 0.10, dentWidth: 32 },
};

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

/** The pupil's edge as a fraction ρ of the window's bound at the azimuth φ about the window's axis (φ = 90° its top). */
export function pupilEdge(ph, K = EYE_SCULPT) {
  const PU = K.pupil ?? { half: [0.7, 0.7], dent: 0, dentWidth: 30 };
  const e = 1 / Math.hypot(Math.cos(ph) / PU.half[0], Math.sin(ph) / PU.half[1]);
  const dphi = (((ph - Math.PI / 2 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return e * (1 - (PU.dent ?? 0) * Math.exp(-((dphi / ((PU.dentWidth ?? 30) * D2R)) ** 2)));
}

/**
 * The globe's surface as a radius function of the direction (unit vector in the eye's rest frame, left eye):
 * radius(d) → { R (in units of r), cornea (true inside the window), rho (the window's normalized radius) }. The
 * frame (axis a, horizontal u, up v) and the window's half-angle bound θb(φ) are exposed for the mesh and the tracers.
 */
export function eyeSurface({ side = 1, K = EYE_SCULPT } = {}) {
  const a = norm([K.axis[0], K.axis[1], K.axis[2] * side]);
  const up = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([up[1] * a[2] - up[2] * a[1], up[2] * a[0] - up[0] * a[2], up[0] * a[1] - up[1] * a[0]]);
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const [hh, hv] = (Array.isArray(K.windowHalf) ? K.windowHalf : [K.windowHalf, K.windowHalf]).map((d) => d * D2R);
  const thB = (ph) => 1 / Math.hypot(Math.cos(ph) / hh, Math.sin(ph) / hv);
  const L = K.lid, F = K.fold;
  // the radius at the polar angle θ from the axis and the azimuth φ about it (φ = 90° straight up)
  const R = (th, ph) => {
    const b = thB(ph);
    if (th < b) {
      const rho = th / b;
      return 1 - K.skin + K.bulge * (1 - rho * rho);
    }
    const dd = (th - b) / D2R; // degrees out from the window's edge
    // 1 over the top of the window, 0 under it
    const sp = Math.sin(ph), top = 0.5 * (1 + sp);
    // the lid margin: a quarter-round from the cornea's edge up onto the skin, with the roll's swell on it
    const x = Math.min(1, dd / L.round), roll = Math.sqrt(Math.max(0, 1 - (1 - x) * (1 - x)));
    // (with `hood`: the swell and the fold follow a crescent centred `hood` degrees round from the window's back edge,
    // over its upper front: full there, `swell[1]` under the window)
    const hw = L.hood !== undefined ? Math.pow(0.5 * (1 + Math.cos(ph - L.hood * D2R)), L.hoodPow ?? 1.5) : top;
    const sw = Array.isArray(L.swell) ? L.swell[1] + (L.swell[0] - L.swell[1]) * hw : L.swell;
    const swell = sw * (dd < L.width ? 0.5 * (1 + Math.cos((Math.PI * dd) / L.width)) : 0) * sstep(0, L.round * 1.5, dd);
    let Rs = 1 - K.skin + (K.skin + swell) * roll;
    if (F) {
      // the fold: a groove outlining the lid, deepest over the top, steeper on its outer side
      const wq = F.hood ? Math.pow(hw, F.hoodPow ?? 1) : sp >= 0 ? F.weight[1] + (F.weight[0] - F.weight[1]) * sp : F.weight[1] + (F.weight[2] - F.weight[1]) * -sp;
      const q = (dd - F.at) / F.width;
      Rs -= wq * F.depth * (q < 0 ? Math.exp(-q * q) : Math.exp(-q * q * 2.2));
    }
    return Rs;
  };
  const radius = (d) => {
    const ca = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
    const cu = d[0] * u[0] + d[1] * u[1] + d[2] * u[2], cv = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
    const th = Math.atan2(Math.hypot(cu, cv), ca), ph = Math.atan2(cv, cu);
    const b = thB(ph);
    return { R: R(th, ph), cornea: th < b, rho: th / b, th, ph };
  };
  return { a, u, v, thB, R, radius };
}

/**
 * The globe as a sphere about its window axis (fish frame, centred on the origin, radius r), split into the skin
 * (conjunctiva) and the cornea (window). The rings follow the window's oval: a ring at ρ ≤ 1 lies at the polar angle
 * ρ·θb(φ) inside the window; beyond the edge the rings run on to the back pole, packed where the skin turns (the lid
 * margin and the fold), so the window's edge is exactly a ring, and so is the pupil's (K.pupil). Returns { position,
 * normal, uv, skin, cornea, pupil, iris } with skin and cornea index arrays (cornea: the whole window; pupil and iris:
 * its two parts, for a clay or a material that shows the iris ring); uv: (azimuth about the axis, ρ / 2 inside the
 * window and 0.5 … 1 beyond), for the
 * iris texture (the pupil at the centre) and the skin's speckle.
 */
export function eyeGlobe(r = HEAD.eye.d / 2, { nt = 48, np = 96, side = 1, K = EYE_SCULPT } = {}) {
  const S = eyeSurface({ side, K });
  const { a, u, v, thB } = S;
  const nw = Math.round(nt * 0.3), no = nt - nw;
  const pupilRho = (ph) => pupilEdge(ph, K);
  const nwp = Math.max(2, Math.round(nw * 0.55));
  // ring positions beyond the window, per azimuth: equal steps of a density that peaks on the lid margin and on the
  // fold's band
  const L = K.lid, F = K.fold;
  const outer = (b) => {
    const M = 400, th = [], cdf = [0];
    for (let k = 0; k <= M; k++) th.push(b + ((Math.PI - b) * k) / M);
    const dens = (t) => {
      const dd = (t - b) / D2R;
      let w = 1;
      w += 7 * Math.exp(-(((dd - L.round * 0.5) / (L.round * 1.2)) ** 2));
      w += 2 * Math.exp(-(((dd - L.width * 0.5) / L.width) ** 2));
      if (F) w += 4 * Math.exp(-(((dd - F.at) / (F.width * 2.5)) ** 2));
      return w;
    };
    for (let k = 1; k <= M; k++) cdf.push(cdf[k - 1] + 0.5 * (dens(th[k - 1]) + dens(th[k])));
    const tot = cdf[M], out = [];
    let k = 0;
    for (let j = 1; j <= no; j++) {
      const target = (tot * j) / no;
      while (k < M - 1 && cdf[k + 1] < target) k++;
      const f = (target - cdf[k]) / (cdf[k + 1] - cdf[k] || 1);
      out.push(th[k] + (th[k + 1] - th[k]) * Math.min(1, Math.max(0, f)));
    }
    out[no - 1] = Math.PI;
    return out;
  };
  const pos = [], nrm = [], uv = [];
  const cols = [];
  for (let i = 0; i <= np; i++) {
    const ph = (i / np) * Math.PI * 2, b = thB(ph);
    const thetas = [];
    // inside the window: the pupil's rings out to its edge (a ring at ρp(φ)), then the iris's, denser toward the
    // window's edge (the bulge turns there)
    const rp = pupilRho(ph);
    for (let j = 0; j <= nw; j++) {
      let f;
      if (j <= nwp) f = rp * (j / nwp);
      else { const t = (j - nwp) / (nw - nwp); f = rp + (1 - rp) * (1 - 0.35 * (1 - t) * (1 - t) - 0.65 * (1 - t)); }
      thetas.push([b * f, f]);
    }
    const o = outer(b);
    for (let j = 0; j < no; j++) thetas.push([o[j], 1 + (o[j] - b) / (Math.PI - b)]);
    cols.push(thetas);
  }
  const nr = nw + 1 + no;
  for (let j = 0; j < nr; j++)
    for (let i = 0; i <= np; i++) {
      const ph = (i / np) * Math.PI * 2;
      const [th, rho] = cols[i][j];
      const st = Math.sin(th), ct = Math.cos(th);
      const d = [0, 1, 2].map((k) => st * Math.cos(ph) * u[k] + st * Math.sin(ph) * v[k] + ct * a[k]);
      const rr = r * S.R(th, ph);
      pos.push(d[0] * rr, d[1] * rr, d[2] * rr);
      nrm.push(...d);
      uv.push(i / np, rho / 2);
    }
  const skin = [], cornea = [], pupil = [], iris = [];
  for (let j = 0; j + 1 < nr; j++)
    for (let i = 0; i < np; i++) {
      const p = j * (np + 1) + i, q = p + 1, s = p + np + 1, t = s + 1;
      (j + 1 <= nw ? cornea : skin).push(p, s, t, p, t, q);
      if (j + 1 <= nw) (j + 1 <= nwp ? pupil : iris).push(p, s, t, p, t, q);
    }
  // smooth normals from the geometry (the bulge, the lid margin and the fold tilt them); the seam at φ = 0 / 2π is
  // welded by summing its two columns
  const N = new Float64Array(nrm.length);
  const P = pos;
  const all = skin.concat(cornea);
  for (let k = 0; k < all.length; k += 3) {
    const [i0, i1, i2] = [all[k], all[k + 1], all[k + 2]];
    const e1 = [0, 1, 2].map((c) => P[i1 * 3 + c] - P[i0 * 3 + c]), e2 = [0, 1, 2].map((c) => P[i2 * 3 + c] - P[i0 * 3 + c]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of [i0, i1, i2]) for (let c = 0; c < 3; c++) N[i * 3 + c] += n[c];
  }
  for (let j = 0; j < nr; j++) {
    const i0 = j * (np + 1), i1 = i0 + np;
    for (let c = 0; c < 3; c++) { const s = N[i0 * 3 + c] + N[i1 * 3 + c]; N[i0 * 3 + c] = s; N[i1 * 3 + c] = s; }
  }
  // the poles: one averaged normal
  for (const j of [0, nr - 1]) {
    const s = [0, 0, 0];
    for (let i = 0; i <= np; i++) for (let c = 0; c < 3; c++) s[c] += N[(j * (np + 1) + i) * 3 + c];
    for (let i = 0; i <= np; i++) for (let c = 0; c < 3; c++) N[(j * (np + 1) + i) * 3 + c] = s[c];
  }
  const Nf = new Float32Array(N.length);
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; Nf[i] = N[i] / l; Nf[i + 1] = N[i + 1] / l; Nf[i + 2] = N[i + 2] / l; }
  // (p, s, t) runs along the polar angle, then the azimuth: counter-clockwise seen from outside, as (u, v, a) is
  // right-handed
  return { position: new Float32Array(pos), normal: Nf, uv: new Float32Array(uv), skin: new Uint32Array(skin), cornea: new Uint32Array(cornea), pupil: new Uint32Array(pupil), iris: new Uint32Array(iris) };
}
