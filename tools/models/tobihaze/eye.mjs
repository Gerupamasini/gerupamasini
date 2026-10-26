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
// The window, measured on the photos at their cameras: a flat-topped bean (u1 mirrored to the model's side view: h/w
// 0.55, the top quarter 1.6 × the bottom's width, the top edge level (slope −0.03) and straight (sagitta 0.015 of the
// width), the bottom rising toward the back (0.15), both ends round; B010 the same tilted 0.14 from above), the dark
// pupil a bean with a notch in its top edge (B009, B010) in a thin gold iris ring, wider under it (B010); its middle
// level with the near dome's centre in u1; from the front (u5, the cheeks blown) a tall crescent on the outer edge
// of each dome, reaching its outline, narrow at the top. The mesh splits the window into the pupil and the iris
// (eyeGlobe), so the clay and the textured eye show the iris ring light and only the pupil dark.
// Round fin_eye (the owner: 目の形; the lead's review at the photos' cameras): the window a big rounded oval with blunt
// round ends (EYE_SCULPT.windowPow) — T3's flat top cut across a round cap left near right-angled corners at the top's
// ends, which read as a pointed almond, worst at the states' default gaze — and the dark pupil filling it inside a thin
// gold rim (the mesh's pupil ring `pupil.follow`; the paint, iris.mjs EYE_PAINT.pupil.follow), the skin cap, its hood
// over the top and the lid margin as they were.

import { HEAD } from './anatomy.mjs';

/** Eye-mesh tunables (angles in degrees, heights as fractions of the globe's radius). */
export const EYE_SCULPT = {
  // the clear window (cornea over the iris and pupil): a big rounded oval, as the photos show it with the eye looking
  // into the lens (round fin_eye, the window traced on the photos at their cameras: u1 h/w 0.57, the pupil 0.53, the
  // height 10 % of the width in from either end 0.57 / 0.69 of the full height, the tightest radius at either end
  // 0.28 / 0.43 of it, the window 0.72 × 0.41 ED with its rim, its area 0.30 of the globe's disc; B010 h/w 0.69 (its
  // kidney) and 0.40 of the disc; B012 / B013 h/w 0.68 / 0.65): an oval of the half-angles `windowHalf` [behind the axis,
  // above it, below it, in front of it], each quadrant a superellipse of the exponents `windowPow` [back-top, front-top,
  // front-bottom, back-bottom] — [along, across] pairs, the along exponents 2.6–3.4 with 2 across, so the ends are blunt
  // and round and the top flatter than the bottom, the front end the roundest (the photos') — turned `windowRoll` 19°
  // about the axis, back end up (level in u1's view, the back end up 7–27° at B010's and B012 / B013's cameras, as in the
  // photos, 10–21°). Rendered at the photos' cameras with the eye turned into the lens: h/w 0.63, the pupil 0.59, ends
  // 0.65–0.72, their tightest radius 0.25–0.31 of H, 0.32–0.33 of the globe's disc, the pupil 0.78 of the window; at the
  // states' default gaze from u1's camera (the window 44° from the lens) the ends 0.57 / 0.53 and their radius ≥ 0.17 H.
  // Round T3's windowCaps — a round main cap cut by a wide flat-top cap — made two near right-angled corners at the top's
  // ends: ends 0.50 / 0.53 and radius 0.15–0.17 H at u1 looking into the lens, 0.36 and 0.12 H at the default gaze (the
  // pointed almond). The half-angles put the mesh pupil's centroid (rig.mjs EYE_REST) exactly where round T3 had it,
  // 71.7° out and 12.2° up (the runtime's rest gaze, src behaviour.ts), so the gaze channels keep their numbers.
  // (round fl_eye2, the owner: 目の形 — the window above was a symmetric stadium, top and bottom equally flat and both ends
  // equally round (u1 / B012 / B013 looking into the lens: rTop / rBot 1.5, the bottom's radius 1.7–1.8 H, the ends
  // 0.41–0.44 H), where all four photos show the top pressed flat by the hood, a rounder, deeper bottom and one end
  // tapering (u1 rTop / rBot 3.4, rBot 1.57, the tightest end 0.31 H against 0.42; B012 / B013 rBot 1.20 / 0.67, ends
  // 0.33 / 0.43). Now the top quadrants long along (back-top 2.72, front-top 4.46: flat), the bottom ones near an
  // ellipse's (front-bottom 2.46, back-bottom 1.63: round and deep), and the back end's across exponents and half-angle
  // drawn in (1.9 / 2.34, the back-bottom's along under 2), so the back end tapers: rendered at the photos' cameras
  // looking into the lens (u1 / B012 / B013, textured) h/w 0.597 / 0.596 / 0.602, the back end 0.33 / 0.33 / 0.35 H and
  // the front 0.43 / 0.43 / 0.42 H, rBot 1.11 / 1.11 / 1.12, rTop / rBot 2.73 / 2.87 / 2.81, 0.30 of the globe's disc;
  // at the default gaze the ends ≥ 0.19 H. The half-angles re-solved so the mesh pupil's centroid stays within 0.05° of
  // 71.7° out and 12.2° up (EYE_REST). The cornea's apex 0.072 over its edge (was 0.060): with the window's top lower, the
  // photo light's highlight on the cornea spread over the gold rim's top)
  // (windowCaps { k, caps: [{ at, r }] }: the older form, the smooth intersection of spherical caps, if given)
  windowHalf: [47.76, 19.57, 29.49, 42.15],
  windowPow: [[2.72, 2.34], [4.46, 2.04], [2.46, 1.71], [1.63, 1.9]],
  windowRoll: 19,
  // the window's axis in the eye's rest frame (fish frame: forward is −s, up +y, lateral +z for the left eye): 19°
  // forward of lateral, 13° above the equator (the window's mass lies under its flat top, so with the axis there its
  // middle is level with the dome's centre at the u1 camera, as in the photo)
  axis: [-0.3192, 0.225, 0.9206],
  // the skin's thickness: the cornea's edge lies this far under the skin round it
  skin: 0.055,
  // the cornea's apex above its edge
  bulge: 0.072,
  // the lid margin round the window: a rounded roll proud of the skin (`swell`: [hood, under the window]), its inner
  // face rounding over `round` degrees from the window's edge and the roll dying out `width` degrees from it; the
  // swell follows a crescent over the window's upper front (`hood`: its centre, degrees round from the window's back
  // edge through the top; `hoodPow` its narrowness), the single pale crescent of u5 and B020 on the upper-medial edge,
  // light under the window, where B064 and B007 show the window running down to the cup with no ring
  lid: { round: 4.0, width: 10, swell: [0.034, 0.012], hood: 140, hoodPow: 1.5 },
  // the fold outlining the lid: a soft groove `at` degrees out from the window's edge, `width` wide, `depth` deep,
  // along the hood only (`hood`: weighted by the lid's crescent), an arch over the window in side view (B064, B009,
  // u1), none under it (no porthole ring)
  // (centre, spread: the fold's own crescent, over the window's top rather than the hood's upper front, and 0.016 deep,
  // was 0.020 along the hood: with the eye turned 30° forward the deeper groove over the upper front let the head's
  // lobe show through it)
  fold: { at: 11, width: 2.6, depth: 0.016, hood: true, hoodPow: 1.0, centre: 105, spread: 2 },
  // the pupil inside the window (the rest of the window is the iris, gold-brown under the clear cornea): the
  // window's own outline drawn in toward its axis (follow [top, side, bottom] fractions of its bound), so the iris is
  // a thin even ring round it, a little wider under it (B010, u1), with a notch `dent` deep and `dentWidth` degrees
  // wide in its top edge at `dentAt` degrees round from the back edge (the kidney of B010, its notch over the front
  // third), kept `ring` of the window's radius inside its edge; at the u1 camera 0.55 ED wide, h/w 0.56 (u1's dark
  // area 0.55); a ring of the mesh runs along it (`half`, `lift`: the oval used without `follow`)
  // (round fin_eye: the mesh's pupil ring where the painted pupil now ends, iris.mjs EYE_PAINT — the window drawn in by
  // the thin rim, ρ 0.855 over it, 0.87 at the ends, 0.83 under it — with the paint's gentle dip; the clay shows the same
  // dark window with a thin rim)
  pupil: { follow: [0.815, 0.862, 0.82], dent: 0.03, dentAt: 112, dentWidth: 24, ring: 0.04, half: [0.88, 0.66], lift: 0.14 },
};

/** (round fl_eye2) The window's azimuth inset in its atlas rect: u = WINDOW_U_INSET + (φ / 2π)(1 − 2 WINDOW_U_INSET), so the
 * mesh's seam column (φ = 0 / 2π) samples the rect inside its edges, not on them (eyemesh.mjs eyePartUV, iris.mjs paintEye
 * the inverse): sampled on the rect's edge, the clay atlas (painted at 1024 over a rect 0.15 wide) blended the body clay
 * into the pupil there, a bright hairline from the window's centre to its back edge. 0.008 of the rect ≈ 1.2 texels at
 * 1024, 2.5 at 2048; the bake paints the rect past its edges round the azimuth, so the textured eye is the same. */
export const WINDOW_U_INSET = 0.008;
/** (round fl_eye2) The same for the window's pole: its ρ (the rect's height from its top, v down) starts WINDOW_V_INSET
 * down the rect, t = WINDOW_V_INSET + ρ (1 − WINDOW_V_INSET), so the pole is not on the rect's top edge (the clay's bright
 * dot at the window's centre). */
export const WINDOW_V_INSET = 0.015;

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

const wrapPi = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * The window's bound: its half-angle θb(φ) about the axis at the azimuth φ (φ = 0 its back edge, 90° its top, 180° its
 * front, on either eye): an oval of the half-angles `windowHalf` [behind the axis, above it, below it, in front of it],
 * with the upper front clipped (`clip`: the hood's skin coming down over the window's upper front, u5, B010).
 */
export function windowBound(K = EYE_SCULPT) {
  if (K.windowCaps) return capsBound(K.windowCaps, K.windowRoll ?? 0);
  const WH = Array.isArray(K.windowHalf) ? K.windowHalf : [K.windowHalf, K.windowHalf];
  const hh = WH[0] * D2R, hv = WH[1] * D2R, hb = (WH[2] ?? WH[1]) * D2R, hf = (WH[3] ?? WH[0]) * D2R, CL = K.clip;
  // (windowPow: the superellipse exponent per quadrant [back-top, front-top, front-bottom, back-bottom], 2 an oval's;
  // windowRoll: degrees the outline turns about the axis, back end up and front end down)
  // (round fin_eye: a quadrant's exponent may be a pair [along, across] — |x|^along + |y|^across = 1: an `along` over 2
  // with `across` 2 rounds the end out toward a half-circle (its radius along/2 × the oval's) and flattens the top and
  // bottom, where one exponent over 2 squares the quadrant's corner instead; the bound is then tabled, 2048 steps)
  const PW = K.windowPow ?? [2, 2, 2, 2], roll = (K.windowRoll ?? 0) * D2R;
  const pair = PW.some((n) => Array.isArray(n));
  const fn = (ph0) => {
    const ph = ph0 - roll, sn = Math.sin(ph), cs = Math.cos(ph);
    const n = PW[sn >= 0 ? (cs >= 0 ? 0 : 1) : cs < 0 ? 2 : 3];
    const x = Math.abs(cs / (cs < 0 ? hf : hh)), y = Math.abs(sn / (sn < 0 ? hb : hv));
    let b;
    if (Array.isArray(n)) {
      // r with (r x)^p + (r y)^q = 1: bisected on r (the sum rises with r)
      const [p, q] = n;
      let lo = 0, hi = 1 / Math.max(x, y, 1e-9);
      for (let i = 0; i < 2 && Math.pow(hi * x, p) + Math.pow(hi * y, q) < 1; i++) hi *= 2;
      for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (Math.pow(m * x, p) + Math.pow(m * y, q) < 1) lo = m; else hi = m; }
      b = (lo + hi) / 2;
    } else b = n === 2 ? 1 / Math.hypot(x, y) : Math.pow(Math.pow(x, n) + Math.pow(y, n), -1 / n);
    if (CL && CL.depth) b *= 1 - CL.depth * Math.exp(-((wrapPi(ph - CL.at * D2R) / (CL.width * D2R)) ** 2));
    return b;
  };
  if (!pair) return fn;
  const key = JSON.stringify([WH, PW, K.windowRoll ?? 0, CL ?? null]);
  if (pairCache.has(key)) return pairCache.get(key);
  const M = 2048, T = new Float64Array(M + 1);
  for (let i = 0; i <= M; i++) T[i] = fn((i / M) * 2 * Math.PI);
  const tab = (ph) => {
    const x = ((((ph / (2 * Math.PI)) % 1) + 1) % 1) * M, i = Math.floor(x), f = x - i;
    return T[i] + (T[Math.min(M, i + 1)] - T[i]) * f;
  };
  pairCache.set(key, tab);
  return tab;
}
const pairCache = new Map();

/**
 * The window as the smooth intersection of spherical caps (windowCaps: { caps: [{ at: [u, v], r }], k }): each cap a
 * circle on the globe of angular radius r (degrees) centred `at` [u, v] degrees from the window's axis (u toward its
 * back edge, v up; turned `roll` degrees about the axis, back end up), the intersection's corners rounded over k (in
 * radians of angle). Seen from any camera within 90° of every cap's centre such a window's outline is convex (each
 * cap is the superlevel set of a concave function of the image coordinates, and a smooth minimum keeps it concave),
 * so a flat top made by a wide cap centred under the window never reads as a bite. Returns θb(φ) (a table, 2048 steps).
 */
const capsCache = new Map();
function capsBound(WC, rollDeg) {
  const key = JSON.stringify([WC, rollDeg]);
  if (capsCache.has(key)) return capsCache.get(key);
  const roll = rollDeg * D2R, k = WC.k ?? 0.02;
  // cap centres in the (u, v, a) frame
  const C = WC.caps.map((c) => {
    const du = c.at[0] * D2R, dv = c.at[1] * D2R, t = Math.hypot(du, dv), ph = Math.atan2(dv, du) + roll;
    return { n: [Math.sin(t) * Math.cos(ph), Math.sin(t) * Math.sin(ph), Math.cos(t)], cr: Math.cos(c.r * D2R), sr: Math.sin(c.r * D2R) };
  });
  const F = (th, ph) => {
    const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    let s = 0;
    for (const c of C) s += Math.exp(-((d[0] * c.n[0] + d[1] * c.n[1] + d[2] * c.n[2] - c.cr) / c.sr) / k);
    return -k * Math.log(s);
  };
  const M = 2048, T = new Float64Array(M + 1);
  for (let i = 0; i <= M; i++) {
    const ph = (i / M) * 2 * Math.PI;
    let lo = 0, hi = Math.PI * 0.9;
    // the first crossing out from the axis
    for (let t = 0.01; t < hi; t += 0.01) if (F(t, ph) < 0) { hi = t; lo = t - 0.01; break; }
    for (let j = 0; j < 40; j++) { const m = (lo + hi) / 2; if (F(m, ph) >= 0) lo = m; else hi = m; }
    T[i] = (lo + hi) / 2;
  }
  const fn = (ph) => {
    const x = ((((ph / (2 * Math.PI)) % 1) + 1) % 1) * M, i = Math.floor(x), f = x - i;
    return T[i] + (T[Math.min(M, i + 1)] - T[i]) * f;
  };
  capsCache.set(key, fn);
  return fn;
}

/**
 * The pupil's edge as a fraction ρ of the window's bound at the azimuth φ about the window's axis (φ = 90° its top):
 * an oval of `half` [horizontal, vertical] fractions of the window's half-angles (above the axis), its centre `lift`
 * (a fraction of the same) above the axis, so the iris ring is wider under it (B010), with a notch `dent` deep and
 * `dentWidth` degrees wide in its top edge (the bean of B009, B010); never closer than `ring` (of ρ) to the window's
 * edge.
 */
export function pupilEdge(ph, K = EYE_SCULPT) {
  const PU = K.pupil ?? { half: [0.7, 0.7], dent: 0, dentWidth: 30 };
  if (PU.follow) {
    // (follow [top, side, bottom]: the pupil as the window's own outline scaled toward its axis by these fractions
    // (by the window's frame, so it keeps the window's flat top and rounded ends with an even ring), with the notch
    // `dent` deep and `dentWidth` wide at `dentAt` degrees round from the back edge in its top edge)
    const phr = ph - (K.windowRoll ?? 0) * D2R, sn = Math.sin(phr), [ft, fs, fb] = PU.follow;
    const f = sn >= 0 ? fs + (ft - fs) * sn * sn : fs + (fb - fs) * sn * sn;
    const dphi = wrapPi(phr - (PU.dentAt ?? 90) * D2R);
    return Math.min(1 - (PU.ring ?? 0.06), f * (1 - (PU.dent ?? 0) * Math.exp(-((dphi / ((PU.dentWidth ?? 30) * D2R)) ** 2))));
  }
  const WH = Array.isArray(K.windowHalf) ? K.windowHalf : [K.windowHalf, K.windowHalf];
  const A = PU.half[0] * WH[0] * D2R, B = PU.half[1] * WH[1] * D2R, c = (PU.lift ?? 0) * WH[1] * D2R;
  const phr = ph - (K.windowRoll ?? 0) * D2R, cs = Math.cos(phr), sn = Math.sin(phr);
  // the distance t from the axis along φ to the oval (|t cos φ / A|² + |(t sin φ − c) / B|² = 1)
  const qa = (cs * cs) / (A * A) + (sn * sn) / (B * B), qb = (sn * c) / (B * B), qc = (c * c) / (B * B) - 1;
  const t = (qb + Math.sqrt(Math.max(0, qb * qb - qa * qc))) / qa;
  const dphi = wrapPi(phr - Math.PI / 2);
  const e = (t * (1 - (PU.dent ?? 0) * Math.exp(-((dphi / ((PU.dentWidth ?? 30) * D2R)) ** 2)))) / windowBound(K)(ph);
  return Math.min(1 - (PU.ring ?? 0.06), e);
}

/**
 * The globe's surface as a radius function of the direction (unit vector in the eye's rest frame, left eye):
 * radius(d) → { R (in units of r), cornea (true inside the window), rho (the window's normalized radius) }. The
 * frame (axis a, horizontal u, up v) and the window's half-angle bound θb(φ) are exposed for the mesh and the tracers.
 */
export function eyeSurface({ side = 1, K = EYE_SCULPT } = {}) {
  const a = norm([K.axis[0], K.axis[1], K.axis[2] * side]);
  const up = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0 = norm([up[1] * a[2] - up[2] * a[1], up[2] * a[0] - up[0] * a[2], up[0] * a[1] - up[1] * a[0]]);
  // v up on both eyes, u toward the back edge on both (the right eye's frame is the left's mirror image, so the hood
  // and the fold lie over the window's upper front on both; its (u, v, a) is left-handed and eyeGlobe winds it the
  // other way)
  const v = [a[1] * u0[2] - a[2] * u0[1], a[2] * u0[0] - a[0] * u0[2], a[0] * u0[1] - a[1] * u0[0]];
  const u = u0.map((c) => c * side);
  const thB = windowBound(K);
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
      // (centre: the fold's own crescent, centred `centre` degrees round from the window's back edge, `spread` its
      // power, instead of the lid's hood)
      const hwF = F.centre !== undefined ? Math.pow(0.5 * (1 + Math.cos(ph - F.centre * D2R)), F.spread ?? 1.5) : hw;
      const wq = F.hood ? Math.pow(hwF, F.hoodPow ?? 1) : sp >= 0 ? F.weight[1] + (F.weight[0] - F.weight[1]) * sp : F.weight[1] + (F.weight[2] - F.weight[1]) * -sp;
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
 * iris texture (the pupil at the centre) and the skin's speckle. (straddle: the vertices stand out by half their
 * facets' sag, so the facets straddle the sphere: where the head's lobe (head.mjs cup.neck) crosses the eye's skin
 * nearly tangent, it emerges from the mesh at the crossing itself, not up to a sag lateral of it where its curl under
 * the skin has tilted it; the seam's columns and the poles move together)
 */
export function eyeGlobe(r = HEAD.eye.d / 2, { nt = 56, np = 96, side = 1, K = EYE_SCULPT, straddle = true, analytic = false } = {}) {
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
      const tri = side > 0 ? [p, s, t, p, t, q] : [p, t, s, p, q, t];
      (j + 1 <= nw ? cornea : skin).push(...tri);
      if (j + 1 <= nw) (j + 1 <= nwp ? pupil : iris).push(...tri);
    }
  // (straddle: each vertex pushed out by half the deepest sag of its facets under the sphere through their corners,
  // so the facets straddle the true surface instead of lying inside it: over the dome's top the head's surface
  // emerges from the eye's mesh where it crosses the skin, not up to 0.0002 HL lateral of it (0.0006 for a lod1 ring
  // count) where its curl under the skin has already tilted it; the globe grows by ≈0.1%)
  if (straddle) {
    const sag = new Float64Array(pos.length / 3);
    const all0 = skin.concat(cornea);
    const U = (k) => { const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l, l]; };
    for (let k = 0; k < all0.length; k += 3) {
      const A = U(all0[k]), B = U(all0[k + 1]), Cc = U(all0[k + 2]);
      // the centroid of the facet against the sphere through its corners (radii taken as equal: their mean)
      const rm = (A[3] + B[3] + Cc[3]) / 3, cx = (A[0] * A[3] + B[0] * B[3] + Cc[0] * Cc[3]) / 3, cy = (A[1] * A[3] + B[1] * B[3] + Cc[1] * Cc[3]) / 3, cz = (A[2] * A[3] + B[2] * B[3] + Cc[2] * Cc[3]) / 3;
      const sg = Math.max(0, 1 - Math.hypot(cx, cy, cz) / rm);
      for (const v of [all0[k], all0[k + 1], all0[k + 2]]) sag[v] = Math.max(sag[v], sg);
    }
    // (the seam's two columns and each pole's ring are the same points: they move together, or the mesh cracks)
    for (let j = 0; j < nr; j++) {
      const i0 = j * (np + 1), i1 = i0 + np;
      if (j === 0 || j === nr - 1) { let m = 0; for (let i = i0; i <= i1; i++) m = Math.max(m, sag[i]); for (let i = i0; i <= i1; i++) sag[i] = m; }
      else { const m = Math.max(sag[i0], sag[i1]); sag[i0] = m; sag[i1] = m; }
    }
    for (let v = 0; v < sag.length; v++) { const f = 1 + sag[v] / 2; pos[v * 3] *= f; pos[v * 3 + 1] *= f; pos[v * 3 + 2] *= f; }
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
  // (round fl_eye2, `analytic`: the sculpted surface's own normal at each vertex — the cross product of its tangents along
  // the polar angle and the azimuth, by central differences of S.R — instead of its facets': at lod1's ring count (12 rings,
  // 4 of them in the window) the facets' mean flattened the cornea's bulge, so its highlight spread into a halo that ran
  // over the gold rim's top, and kinked the hood's groove behind the window into a facet at the default gaze; the poles
  // keep the facets' mean)
  if (analytic) {
    const at = (th, ph) => { const st = Math.sin(th), ct = Math.cos(th), rr = S.R(th, ph); return [0, 1, 2].map((k) => (st * Math.cos(ph) * u[k] + st * Math.sin(ph) * v[k] + ct * a[k]) * rr); };
    const e = 1e-4;
    for (let j = 1; j + 1 < nr; j++)
      for (let i = 0; i <= np; i++) {
        const ph = (i / np) * Math.PI * 2, th = cols[i][j][0];
        if (th < 2e-3 || th > Math.PI - 2e-3) continue;
        // (not across the window's edge and the lid's roll, where R steps by the skin's thickness: there the facets' mean)
        const bd = (th - thB(ph)) / D2R;
        if (bd > -1.5 && bd < (L.round ?? 4) + 1) continue;
        const pa = at(th + e, ph), pb = at(th - e, ph), pc = at(th, ph + e), pd = at(th, ph - e);
        const dt = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]], dp = [pc[0] - pd[0], pc[1] - pd[1], pc[2] - pd[2]];
        let nn = [dt[1] * dp[2] - dt[2] * dp[1], dt[2] * dp[0] - dt[0] * dp[2], dt[0] * dp[1] - dt[1] * dp[0]];
        const q = (j * (np + 1) + i) * 3, l = Math.hypot(...nn) || 1;
        nn = nn.map((x) => x / l);
        // (outward: the side the facets' mean normal faces)
        if (nn[0] * Nf[q] + nn[1] * Nf[q + 1] + nn[2] * Nf[q + 2] < 0) nn = nn.map((x) => -x);
        Nf[q] = nn[0]; Nf[q + 1] = nn[1]; Nf[q + 2] = nn[2];
      }
  }
  // (p, s, t) runs along the polar angle, then the azimuth: counter-clockwise seen from outside on the left eye, as its
  // (u, v, a) is right-handed (the right eye's mirrored frame is wound (p, t, s))
  return { position: new Float32Array(pos), normal: Nf, uv: new Float32Array(uv), skin: new Uint32Array(skin), cornea: new Uint32Array(cornea), pupil: new Uint32Array(pupil), iris: new Uint32Array(iris) };
}
