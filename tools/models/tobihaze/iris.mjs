// The トビハゼ's eye as texture and material (round T1, key `eyefin`): the body atlas's `iris` rect (the clear window:
// the pupil, the gold ring round it, the olive-bronze iris outside it) and its `eyeSkin` rect (the globe's skin cap: the
// head's speckled skin carried on the globe, its lid margin round the window), and the factors of the Eye material.
//
// The rects are the eye mesh's own parametrisation (eye.mjs eyeGlobe, eyemesh.mjs eyePartUV): u = φ / 2π the azimuth
// about the window's axis (φ = 0 the window's back edge, 90° its top, 180° its front, on either eye: the right globe is
// the left's mirror image and reads the same rects), and
//   iris     v from the rect's top (the window's axis, ρ = 0) to its bottom (the window's edge, ρ = 1), ρ the polar angle
//            over the window's bound θb(φ) (eye.mjs windowBound); the pupil is ρ < pupilEdge(φ), the mesh's own pupil
//            ring, so the painted pupil is the sculpted one at rest and at every gaze (the globe turns rigidly with its
//            skin: the window's outline in UV space is the sculpt's, ρ = 1, by construction; checked in the eyefin
//            harness, tools/models/tobihaze/out/eyefin)
//   eyeSkin  v from the rect's top (the window's edge, the lid margin) to its bottom (the back pole), t = (θ − θb) / (π − θb)
// Measured on the photos (u1, B010, B002, B049, u5_eyes; ref/work/t1_eyefin): the pupil a horizontal bean, 0.60 x
// 0.38-0.42 ED, with a notch in its top edge (B009, B010: a heart), near black with a teal-green light from inside (u1,
// B002, B067; reddish-brown in B010, black in B049); a thin bright gold ring hugging it (u1 #dac28c, B010 #e8cda0 as
// photographed, with their gloss: a guanine reflector, so it reads gold by what it reflects), a hairline over the pupil
// (the window's flat top leaves about 0.015 ED) and wider and paler under it (B010's cream-gold crescent); outside the
// ring, to the window's edge, olive-bronze iris finely stippled (B010 #a68d65, A004 #927652); no white of the eye; the
// window's edge a soft dark limbal line, then the lid margin (the skin) with a pale crescent along the hood over the
// window's upper front (u5, B020) and the hood's fold as a soft dark arch (B010, u1); the skin cap the head's speckled
// skin (o.skin: the pattern key's skin colour, with the part 'head', whose granules match the turret's round the cup;
// its 'eyeSkin' part's finer granules show a seam where the globe meets the turret, ref/work/t1_eyefin p5).
// The painted pupil (EYE_PAINT) refines the mesh's pupil ring (eye.mjs: 0.667 x 0.369 ED seen along the window's axis,
// its notch 0.003 ED) to the photos' 0.616 x 0.383 ED with a 0.008 ED notch; eyeMeasures() reports both.
//
// Texels: the colour as linear RGB, the roughness (the ORM's G: the window 0.03-0.05, the lid margin's wet meniscus
// easing to the skin's), a metal mask (the gold ring's reflector: the ORM's B, 0.25 on the ring, read by the Eye
// material only), the occlusion (1: the globe turns, so no occlusion is baked on it) and a thin-film mask (`irid`: the
// pupil 1, a trace on the ring; for the optional iridescence, EYE_MATERIAL.optional). Supersampled per texel
// (anti-aliased at every size) and every detail finer than about 1.5 texels faded to its mean, so lod1 (1024) and lod2
// (256) keep the hero's read.
//
// The Eye material (EYE_MATERIAL): clearcoat 1 over the whole globe (a wet film: the window's sharp highlights and the
// meniscus), its roughness read from the ORM's G (clearcoatRoughnessTexture x 0.4: the window's 0.03 -> 0.012, the
// skin cap's 0.45 -> 0.18, the head's wet film) at no extra map; ior 1.376 (the cornea); metallicFactor 1 with the
// ORM's B. Rendered at the photos' cameras (ref/cmp/t1_eyefin_eye.jpg) under the viewer's studio light and with a room
// environment (the runtime's envMapIntensity 0.8): the gold ring and the iris are reflectors and read as in the photos
// only with an environment to reflect (gates: ring dE2000 <= 8 with it; the cap matches the photos' median under the
// studio light, the pattern key's calibration light).
import { windowBound, pupilEdge, eyeSurface, EYE_SCULPT } from './eye.mjs';
import { EYE_MM } from './anatomy.mjs';
import { perlin3, hash3i } from '../../lib/noise.mjs';

const D2R = Math.PI / 180;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex → linear [r, g, b]. */
export const hexLinear = (h) => [1, 3, 5].map((i) => s2l(parseInt(h.slice(i, i + 2), 16) / 255));
const mixTo = (c, k, a) => { if (a <= 0) return; if (a > 1) a = 1; c[0] += (k[0] - c[0]) * a; c[1] += (k[1] - c[1]) * a; c[2] += (k[2] - c[2]) * a; };

/**
 * The eye's colours (sRGB hex; albedo under the viewer's studio light, round T1 — the photos' values are as photographed,
 * with their gloss; these are calibrated so the rendered regions land on them, ref/work/t1_eyefin/gates.json).
 */
export const EYE_PALETTE = {
  pupil: '#030404',        // the pupil's ground: black
  pupilGlow: '#1b3d3a',    // the teal-green light from inside (u1, B002, B067), strongest low in the pupil
  pupilGlowRed: '#3a1a12', // the reddish-brown variant (B009, B010, B064): o.pupilGlow 'red'
  pupilRuff: '#010101',    // the pupil's margin, a hair darker
  ring: '#e8c46a',         // the gold ring (u1, B010)
  ringPale: '#e6d29c',     // the ring's wider, paler crescent under the pupil (B010)
  ringOrange: '#d9893a',   // the orange-copper variant (B020, B062): o.ring 'orange'
  iris: '#9a7b4e',         // the olive-bronze iris outside the ring (A004 #927652, B010 #a68d65)
  irisOlive: '#7d7450',    // its olive end (the low-frequency variation)
  stipple: '#3a2e20',      // the iris's fine melanophore stipple
  limbus: '#3d3426',       // the dark line at the window's edge
  skin: '#8c7f66',         // the skin cap's ground when no skin colour function is given (pattern key: eyeCap)
  skinDark: '#4c3d2e',     // its speckle
  skinPale: '#cdbb8c',     // its pale granules
  lidPale: '#d8cbab',      // the hood's pale margin (u5, B020)
  fold: '#5a4c3a',         // the hood's fold, a soft dark arch over the window
};

/** Roughness (the ORM's G) of the eye's parts. */
export const EYE_ROUGH = { pupil: 0.03, ring: 0.04, iris: 0.05, meniscus: 0.06, skin: 0.45 };

/**
 * The Eye material's factors (glTF core + KHR extensions, three.js r186 MeshPhysicalMaterial; the runtime's loader keeps
 * the clearcoat at the hero and lod1, src/creatures/models/ModelLoader.ts). The maps are the body atlas's (the eye's UVs
 * land in its iris and eyeSkin rects): baseColorTexture = the body colour, metallicRoughnessTexture = the ORM (G
 * roughness, B metal: the ring's only; metallicFactor 1, the body's 0), normalTexture = the body normal, and the
 * clearcoat's roughness from the same ORM's G (clearcoatRoughnessTexture, glTF: its G channel): no map of its own. No
 * occlusion on the globe (it turns; paintEye's `ao` is 1).
 * optional: a thin film on the pupil (KHR_materials_iridescence, the teal to violet angle-dependent sheen of the pupil
 * in u1 and B067): iridescenceTexture = the ORM (its R channel, which the eye's own texels then hold as paintEye's
 * `irid` mask instead of the occlusion; the body never samples the eye's rects), 420 nm, ior 1.33. Measured (env
 * light): the pupil's dE2000 to u1 4.0 -> 3.3, the cap and the ring unchanged; the tech key decides (it costs the
 * iridescence shader on the two globes only).
 */
export const EYE_MATERIAL = {
  name: 'Tobihaze_Eye',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 1, roughnessFactor: 1, maps: { baseColorTexture: 'body colour', metallicRoughnessTexture: 'body ORM (G roughness, B metal)' } },
  normalTexture: 'body normal',
  extensions: {
    KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.4, clearcoatRoughnessTexture: 'body ORM (G)' },
    KHR_materials_ior: { ior: 1.376 },
  },
  optional: {
    KHR_materials_iridescence: { iridescenceFactor: 1, iridescenceTexture: 'body ORM (R) = paintEye irid in the eye rects', iridescenceIor: 1.33, iridescenceThicknessMinimum: 420, iridescenceThicknessMaximum: 420 },
  },
  // (lod2: no Eye material: the globes are merged into the Body at rest; their window colour carries a soft sky
  // reflection instead, paintEye(..., { tier: 'lod2' }))
  tiers: { hero: 'as above', lod1: 'as above (the same maps at their sizes)', lod2: 'merged into Tobihaze_Body (paintEye tier lod2)' },
  extras: { tobihaze: { role: 'eye', pupilGlow: 'teal (variants red, black: in the map)', wetness: 'the clearcoat stays 1 at every wetness (the eye is kept wet: rolled and wiped); the skin cap base roughness follows the head (paintEye o.skinRough)' } },
};

/**
 * The painted pupil against the mesh's pupil ring (eye.mjs pupilEdge: 0.635 × 0.364 ED as chords, its notch 0.10 of ρ
 * deep): the photos' pupil is 0.60 × 0.38–0.42 ED with a clear notch in its top edge (B009, B010: a heart; u1 a gentle
 * dip), so the texture draws its edge `endsED` in at the window's back and front ends, `topED` / `bottomED` out over
 * and under, and the notch `notchED` deeper over `notchWidth` degrees at eye.mjs's dentAt; never closer than
 * `minRingED` to the window's edge (the gold ring stays). The mesh's ring only places vertices: the texture's edge is
 * what shows, at every tier. (ED: the globe's diameter; on the globe an angle θ spans θ / 2 ED.)
 */
export const EYE_PAINT = { pupil: { endsED: 0.034, topED: 0.008, bottomED: 0.016, notchED: 0.02, notchWidth: 24, minRingED: 0.012 } };

/** The window's geometry (eye.mjs) as tables over φ: θb (rad), the mesh's pupil ρ, the painted pupil's ρ. */
let GEO = null;
function geometry() {
  if (GEO) return GEO;
  const N = 1024, thB = windowBound(EYE_SCULPT), tb = new Float64Array(N + 1), rp = new Float64Array(N + 1), rt = new Float64Array(N + 1);
  const PP = EYE_PAINT.pupil, roll = (EYE_SCULPT.windowRoll ?? 0) * D2R, dent = (EYE_SCULPT.pupil?.dentAt ?? 90) * D2R;
  for (let i = 0; i <= N; i++) {
    const ph = (i / N) * 2 * Math.PI, b = thB(ph), r = pupilEdge(ph, EYE_SCULPT);
    tb[i] = b; rp[i] = r;
    const phr = ph - roll, c = Math.cos(phr), sn = Math.sin(phr);
    // (radians of θ: ED × 2)
    let d = -2 * PP.endsED * c * c + 2 * (sn > 0 ? PP.topED : PP.bottomED) * sn * sn;
    let dn = phr - dent; dn = Math.atan2(Math.sin(dn), Math.cos(dn));
    d -= 2 * PP.notchED * Math.exp(-((dn / (PP.notchWidth * D2R)) ** 2));
    rt[i] = Math.min(1 - (2 * PP.minRingED) / b, r + d / b);
  }
  const at = (T, ph) => { const x = ((((ph / (2 * Math.PI)) % 1) + 1) % 1) * N, i = Math.floor(x), f = x - i; return T[i] + (T[Math.min(N, i + 1)] - T[i]) * f; };
  const S = eyeSurface({ side: 1, K: EYE_SCULPT });
  GEO = { thB: (ph) => at(tb, ph), rhoMesh: (ph) => at(rp, ph), rhoP: (ph) => at(rt, ph), S };
  return GEO;
}

/** The point on the left globe at rest (fish mm) and its outward normal for the window's polar angle θ (rad, from its
 * axis) and azimuth φ (eye.mjs eyeSurface's frame: the globe's sculpted radius included). */
export function eyePoint(th, ph) {
  const { S } = geometry(), st = Math.sin(th), ct = Math.cos(th), c = Math.cos(ph), s = Math.sin(ph);
  const d = [0, 1, 2].map((k) => st * c * S.u[k] + st * s * S.v[k] + ct * S.a[k]);
  const r = EYE_MM.radius * S.R(th, ph);
  return { p: [EYE_MM.center[0] + d[0] * r, EYE_MM.center[1] + d[1] * r, EYE_MM.center[2] + d[2] * r], n: d };
}

/** Noise on the globe's surface (unit-sphere coordinates × freq). */
const nz = (d, f, seed) => perlin3(d[0] * f, d[1] * f, d[2] * f, seed);
/** Jittered-lattice dots on the unit sphere's surface: coverage 0..1 of dots of radius `r` (in units of the cell `cell`,
 * both in ED·2 = sphere units), each kept with probability `p`; `aa` the texel's footprint (sphere units). */
function dots(d, cell, r, p, seed, aa) {
  const x = d[0] / cell, y = d[1] / cell, z = d[2] / cell;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = hash3i(ix + i, iy + j, iz + k, seed);
    if ((h & 1023) / 1023 > p) continue;
    const fx = ix + i + ((h >>> 10) & 255) / 255, fy = iy + j + ((h >>> 18) & 255) / 255, fz = iz + k + ((h >>> 26) & 63) / 63;
    const rr = r * (0.6 + 0.8 * (((h >>> 4) & 63) / 63));
    const dist = Math.hypot(fx - x, fy - y, fz - z) * cell;
    const e = Math.max(aa * 0.7, rr * 0.25);
    best = Math.max(best, sstep(rr + e, rr - e, dist));
  }
  return best;
}

/**
 * The window's texel: colour (linear), roughness, metal at the window's polar fraction ρ (0 the axis, 1 the edge) and
 * azimuth φ. `fp` the texel's footprint in radians on the globe (for fading the fine detail).
 */
function windowTexel(rho, ph, fp, P, o) {
  const { thB, rhoP } = geometry();
  const b = thB(ph), rp = rhoP(ph), th = rho * b;
  const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; // the window's own frame
  const X = th * Math.cos(ph), Y = th * Math.sin(ph); // radians across the window (Y up)
  const c = [0, 0, 0];
  let rough, metal = 0;
  // the band between the pupil and the window's edge, in radians: d0 from the pupil's edge, w its width here
  const dd = (rho - rp) * b, w = (1 - rp) * b;
  const below = sat(-Math.sin(ph)); // 1 straight under the pupil
  // ---- the pupil: black, lit from inside by the teal-green glow, strongest low and central, none at its margin
  if (dd < 0.01) {
    const glow = o.pupilGlow === 'black' ? 0 : 1;
    const k = P[o.pupilGlow === 'red' ? 'pupilGlowRed' : 'pupilGlow'];
    c[0] = P.pupil[0]; c[1] = P.pupil[1]; c[2] = P.pupil[2];
    // (low in the pupil and away from its margin; a broad soft blob, the light's exit through the lens)
    const g = glow * (0.12 + 0.6 * sstep(0.15, -0.3, Y)) * sstep(-0.006, -0.08, dd) * (0.85 + 0.15 * perlin3(X * 9, Y * 9, 0.5, 31));
    mixTo(c, k, g);
    // the pupillary margin (the iris's pigment ruff): darker over the last 0.012 rad
    mixTo(c, P.pupilRuff, sstep(-0.03, -0.004, dd) * 0.8);
    rough = EYE_ROUGH.pupil;
  }
  if (dd >= -0.01) {
    // ---- the iris band: the gold ring hugging the pupil, wider and paler under it; the olive-bronze iris to the edge
    const ringW = Math.max(0.03, Math.min(0.12, (0.55 + 0.3 * below) * w)); // ≈0.015–0.05 ED, wider under the pupil
    const q = c.slice(), irisC = P.iris.slice();
    mixTo(irisC, P.irisOlive, sat(0.5 + 0.8 * perlin3(X * 6, Y * 6, 1.7, 33)) * 0.6);
    // radial fibres (the iris's stroma) and fine dark stipple (melanophores ~0.006 ED), faded under ~1.5 texels
    const fib = perlin3(Math.cos(ph) * 40, Math.sin(ph) * 40, dd * 30, 35);
    const fine = sstep(0.006, 0.002, fp);
    const st = dots(d, 0.012, 0.0032, 0.55, 37, fp) * fine;
    const irisT = irisC.map((v) => v * (1 + 0.12 * fib * fine));
    mixTo(irisT, P.stipple, 0.75 * st + (1 - fine) * 0.12);
    // the ring: brightest at the pupil's edge, easing into the iris; under the pupil the pale crescent
    const ringC = P[o.ring === 'orange' ? 'ringOrange' : 'ring'].slice();
    mixTo(ringC, P.ringPale, sstep(0.15, 0.75, below) * sstep(0.006, 0.035, dd) * 0.95);
    const r1 = 1 - sstep(ringW * 0.55, ringW * 1.15, dd);
    const tone = 0.9 + 0.12 * perlin3(Math.cos(ph) * 14, Math.sin(ph) * 14, 3.3, 39) + 0.06 * fib * fine;
    const band = irisT.slice();
    mixTo(band, ringC.map((v) => v * tone), r1);
    // the limbus: a dark line over the window's last 0.02 rad
    mixTo(band, P.limbus, sstep(w - 0.03, w - 0.004, dd) * 0.4);
    // the edge between the pupil and the ring (anti-aliased by the supersampling: a 0.004 rad ramp)
    const a = sstep(-0.004, 0.004, dd);
    c[0] = q[0] + (band[0] - q[0]) * a; c[1] = q[1] + (band[1] - q[1]) * a; c[2] = q[2] + (band[2] - q[2]) * a;
    const rB = EYE_ROUGH.ring + (EYE_ROUGH.iris - EYE_ROUGH.ring) * (1 - r1);
    rough = rough === undefined ? rB : rough + (rB - rough) * a;
    metal = (o.ringMetal ?? 0.25) * r1 * a;
  }
  // (lod2: the far eye has no clearcoat; a soft reflection of the sky over the window's upper half keeps it wet)
  if (o.tier === 'lod2') mixTo(c, [0.32, 0.36, 0.40], 0.22 * sstep(-0.05, 0.25, Y));
  // (the thin-film mask: the pupil's angle-dependent tint, a trace on the ring; 0 on the iris and the skin)
  const ird = dd < 0 ? 1 : 0.25 * (1 - sstep(0, 0.05, dd));
  return { c, rough, metal, irid: ird };
}

/** The skin cap's texel at t (0 the window's edge → 1 the back pole) and φ. */
function skinTexel(t, ph, fp, P, o) {
  const { thB } = geometry();
  const b = thB(ph), th = b + t * (Math.PI - b), dd = th - b; // radians out from the window's edge
  const { p, n } = eyePoint(th, ph);
  let c;
  if (o.skin) c = o.skin(p, n).slice();
  else {
    // the fallback skin: olive-tan, mottled, finely speckled, with pale granules (B002, B049)
    c = P.skin.slice();
    const m = 1 + 0.10 * perlin3(n[0] * 5, n[1] * 5, n[2] * 5, 41) + 0.06 * perlin3(n[0] * 13, n[1] * 13, n[2] * 13, 42);
    c = c.map((v) => v * m);
    const fine = sstep(0.008, 0.003, fp);
    mixTo(c, P.skinPale, dots(n, 0.035, 0.009, 0.5, 43, fp) * 0.55 * fine + (1 - fine) * 0.06);
    mixTo(c, P.skinDark, dots(n, 0.016, 0.0035, 0.6, 44, fp) * 0.8 * fine + (1 - fine) * 0.1);
  }
  // the lid margin round the window: a dark rim right at the edge (the margin's inner face in shade, B010), the pale
  // crescent along the hood's inner edge (u5, B020: the hood over the window's upper front, eye.mjs EYE_SCULPT.lid.hood)
  const L = EYE_SCULPT.lid, F = EYE_SCULPT.fold, deg = dd / D2R;
  const hood = Math.pow(0.5 * (1 + Math.cos(ph - L.hood * D2R)), L.hoodPow ?? 1.5);
  mixTo(c, P.limbus, sstep(1.6, 0.2, deg) * 0.25);
  mixTo(c, P.lidPale, Math.exp(-(((deg - 2.6) / 1.4) ** 2)) * hood * 0.6);
  // the hood's fold: a soft dark arch (its crescent, eye.mjs EYE_SCULPT.fold)
  const fw = Math.pow(0.5 * (1 + Math.cos(ph - F.centre * D2R)), F.spread ?? 1.5);
  mixTo(c, P.fold, Math.exp(-(((deg - F.at) / (F.width * 1.2)) ** 2)) * fw * 0.35);
  // roughness: the wet meniscus at the window's edge easing to the skin's over ~6°
  const rs = typeof o.skinRough === 'function' ? o.skinRough(p, n) : (o.skinRough ?? EYE_ROUGH.skin);
  const rough = EYE_ROUGH.meniscus + (rs - EYE_ROUGH.meniscus) * sstep(0.5, 6, deg);
  return { c, rough, metal: 0, irid: 0 };
}

/**
 * Which part of the window a point is (for the checks: label renders, region measures): ρ (0 the axis, 1 the window's
 * edge) and φ as the iris rect's v and u·2π. Returns { part: 'pupil' | 'ring' | 'iris' | 'edge', dd (radians out from
 * the painted pupil's edge), w (the band's width there), ringW }.
 */
export function windowRegion(rho, ph) {
  const { thB, rhoP } = geometry();
  const b = thB(ph), rp = rhoP(ph), dd = (rho - rp) * b, w = (1 - rp) * b, below = sat(-Math.sin(ph));
  const ringW = Math.max(0.03, Math.min(0.12, (0.55 + 0.3 * below) * w));
  const part = dd < -0.012 ? 'pupil' : dd > 0.003 && dd < ringW * 0.8 ? 'ring' : dd > ringW * 1.2 && dd < w - 0.01 ? 'iris' : 'edge';
  return { part, dd, w, ringW };
}

/**
 * Paint the eye's rects of the body atlas.
 * @param rects { iris: [x0, y0, x1, y1], eyeSkin: [x0, y0, x1, y1] } shares of the atlas (fishmesh.mjs BODY_LAYOUT /
 *   BODY_LAYOUT_LOD2: the same at every tier)
 * @param size  the atlas's side in texels (hero 2048, lod1 1024, lod2 256)
 * @param o { skin: (p fish mm, n) → [r, g, b] linear — the skin cap's colour at its point on the LEFT globe at rest
 *   (the pattern key's skinColour(p, n, 'head', ctx).rgb: the turret's granules, see the header), else the fallback;
 *   skinRough: number | (p, n) → roughness (the head's, the surface key's WET; default 0.45); tier ('hero' | 'lod1' | 'lod2': lod2 adds the window's sky reflection); pupilGlow ('teal' |
 *   'red' | 'black'); ring ('gold' | 'orange'); ringMetal (0.25); palette ({ key: hex } overrides); pad (texels painted
 *   past each rect's edges, wrapping round the azimuth: default 4 at 2048, scaled; the gutters are 0.01 = 20 texels);
 *   ss (supersamples per side, default by size) }
 * @returns { size, rgb: Float32Array (size² × 3, linear), rough: Float32Array (size²), metal: Float32Array (size²),
 *   ao: Float32Array (size², 1 where painted), irid: Float32Array (size²: the optional thin film's mask), mask:
 *   Uint8Array (size²: 1 the window, 2 the skin cap, 0 untouched) }
 */
export function paintEye(rects, size, o = {}) {
  const P = Object.fromEntries(Object.entries({ ...EYE_PALETTE, ...(o.palette ?? {}) }).map(([k, h]) => [k, hexLinear(h)]));
  const N = size * size;
  const out = { size, rgb: new Float32Array(N * 3), rough: new Float32Array(N), metal: new Float32Array(N), ao: new Float32Array(N), irid: new Float32Array(N), mask: new Uint8Array(N) };
  const ss = o.ss ?? (size >= 2048 ? 2 : size >= 1024 ? 3 : 4);
  const pad = o.pad ?? Math.max(2, Math.round((4 * size) / 2048));
  const { thB } = geometry();
  for (const [part, R] of [['window', rects.iris], ['skin', rects.eyeSkin]]) {
    if (!R) continue;
    const x0 = R[0] * size, y0 = R[1] * size, W = (R[2] - R[0]) * size, H = (R[3] - R[1]) * size;
    const px0 = Math.max(0, Math.floor(x0) - pad), px1 = Math.min(size - 1, Math.ceil(x0 + W) - 1 + pad);
    const py0 = Math.max(0, Math.floor(y0) - pad), py1 = Math.min(size - 1, Math.ceil(y0 + H) - 1 + pad);
    for (let py = py0; py <= py1; py++)
      for (let px = px0; px <= px1; px++) {
        const acc = [0, 0, 0];
        let ar = 0, am = 0, ai = 0;
        for (let sy = 0; sy < ss; sy++)
          for (let sx = 0; sx < ss; sx++) {
            const u = (px + (sx + 0.5) / ss - x0) / W, v = (py + (sy + 0.5) / ss - y0) / H;
            let ph = u * 2 * Math.PI; // (wraps: the pad past either end continues round the azimuth)
            let q;
            if (part === 'window') {
              // (above the axis row: ρ < 0 is the point on the other side of the axis; past the edge: the edge's colour)
              let rho = v;
              if (rho < 0) { rho = -rho; ph += Math.PI; }
              rho = Math.min(rho, 1);
              const fp = Math.max(1e-4, (thB(ph) / H) * 1.0); // radians a texel spans along ρ
              q = windowTexel(rho, ph, fp, P, o);
            } else {
              const t = Math.min(1, Math.max(0, v));
              const fp = Math.max(1e-4, (Math.PI - thB(ph)) / H);
              q = skinTexel(t, ph, fp, P, o);
            }
            acc[0] += q.c[0]; acc[1] += q.c[1]; acc[2] += q.c[2]; ar += q.rough; am += q.metal; ai += q.irid;
          }
        const k = 1 / (ss * ss), i = py * size + px;
        const inside = px + 0.5 >= x0 && px + 0.5 <= x0 + W && py + 0.5 >= y0 && py + 0.5 <= y0 + H;
        // (the pad never overwrites the other rect's own texels)
        if (!inside && out.mask[i]) continue;
        out.rgb[i * 3] = acc[0] * k; out.rgb[i * 3 + 1] = acc[1] * k; out.rgb[i * 3 + 2] = acc[2] * k;
        out.rough[i] = ar * k; out.metal[i] = am * k; out.ao[i] = 1; out.irid[i] = ai * k;
        out.mask[i] = part === 'window' ? 1 : 2;
      }
  }
  return out;
}

/**
 * The window's measures (for the checks and the docs), in ED (chords of the globe through the window's axis): the
 * mesh's pupil ring and the painted pupil (width, height along the window's rolled axes; the notch's depth), the window,
 * and the iris band (the ring and the iris outside it) over, behind, in front of and under the painted pupil.
 */
export function eyeMeasures() {
  const { thB, rhoP, rhoMesh } = geometry();
  // the outline's extents seen along the window's axis (X = sin θ cos φ back, Y = sin θ sin φ up: eye.mjs's frame, v
  // the fish's up; in globe radii, ED = r × 2)
  const ext = (R) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 2048; i++) { const ph = (i / 2048) * 2 * Math.PI, t = Math.sin(R(ph) * thB(ph)), X = t * Math.cos(ph), Y = t * Math.sin(ph); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    return { W: +((x1 - x0) / 2).toFixed(4), H: +((y1 - y0) / 2).toFixed(4) };
  };
  const roll = (EYE_SCULPT.windowRoll ?? 0) * D2R, dent = (EYE_SCULPT.pupil?.dentAt ?? 90) * D2R + roll;
  // the notch: how far the top edge dips at the dent under the chord between its neighbours ±15° round (ED)
  const yAt = (R, ph) => Math.sin(R(ph) * thB(ph)) * Math.sin(ph);
  const notch = (R) => +((0.5 * (yAt(R, dent - 0.26) + yAt(R, dent + 0.26)) - yAt(R, dent)) / 2).toFixed(4);
  const band = (ph) => +(((1 - rhoP(ph)) * thB(ph)) / 2).toFixed(4);
  return {
    mesh: { pupil: ext(rhoMesh), notchED: notch(rhoMesh) },
    painted: { pupil: ext(rhoP), notchED: notch(rhoP) },
    window: ext(() => 1),
    ringED: { top: band(Math.PI / 2), back: band(0), front: band(Math.PI), bottom: band(1.5 * Math.PI), min: Math.min(...Array.from({ length: 360 }, (_, i) => band((i / 360) * 2 * Math.PI))) },
  };
}
