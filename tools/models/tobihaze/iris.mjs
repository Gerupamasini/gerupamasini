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
// its notch 0.003 ED) to 0.616 x 0.368 ED with B010's heart: eyeMeasures() reports both.
//
// Round T2 (key eyefin; the T1 eye review's P2, P3, P6; ref/work/t2_eyefin), calibrated under the viewer's canonical
// photo rig (t2_tech/LIGHT.md: the game's HDR pipeline and tone curve, a soft sun and a bright hazy sky) at the photos'
// cameras with the rig's default gaze (55° out, 15° up), on the round's integrated skin (pattern and surface T2):
//   the ring   gold by its colour and the film (the Eye material is not metallic: T1's metal leaked through the mips and
//              needed a strong environment): the yellowest 3 % of its pixels dE2000 1.9 / 4.0 against u1 / B010 at u1's
//              camera, 1.6 / 4.5 at B010's, 2.8 / 3.3 at B002's (gate ≤ 8; T1 under this rig 2.0 / 3.7–5.2 with its metal
//              off), 1.2–3.2 / 3.7–6.8 under the 図鑑's zukan rig
//   the pupil  no longer black: a teal glow (EYE_PUPIL, EYE_GLOW: the lens's light, low in the pupil) — at u1's camera
//              L* 32, a* −7 (u1 34.5, −4.8: dE 3.5, T1 8.1); the variants (red-brown, black) switch at runtime through
//              the glow mask the bake writes into the baseColor's A in the iris rect (EYE_MATERIAL.extras.runtime.pupil):
//              red at B010's camera dE 3.7 to B010's pupil, black dE 4.3 to B049's
//   the heart  the notch 0.037 ED deep under the chord between its lobes (B010 ~0.036; T1 0.0001: none), the ring over
//              the lobes 0.037 ED (T1 0.018; the photos 0.035–0.044), the pupil 0.616 × 0.368 ED (the window's flat top
//              is the limit: a taller pupil leaves no ring over it)
//
// Texels: the colour as linear RGB, the roughness (the film map's G: the window 0.03-0.05, the lid margin's wet meniscus
// easing to the skin's), the glow mask (`glow`: the bake's baseColor A in the iris rect), the occlusion (1: the globe
// turns, so no occlusion is baked on it) and a thin-film mask (`irid`: the pupil 1, a trace on the ring; unused since
// round T2 — the film map's R is the film now). Supersampled per texel (anti-aliased at every size) and every detail
// finer than about 1.5 texels faded to its mean, so lod1 (1024) and lod2 (256) keep the hero's read.
//
// The Eye material (EYE_MATERIAL): clearcoat 1 over the whole globe (a wet film: the window's sharp highlights and the
// meniscus), its roughness read from the film map's G (clearcoatRoughnessTexture x 0.4: the window's 0.03 -> 0.012, the
// skin cap's -> ~0.11) at no extra map; ior 1.376 (the cornea); not metallic.
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
  pupil: '#0b1414',        // the pupil's ground: near black, a hair green (round T2: T1's #030404 rendered L* 3.5)
  pupilRuff: '#020303',    // the pupil's margin, a hair darker
  ring: '#f0cc70',         // the gold ring (u1 #dac28c, B010 #e8cda0 as photographed, their gloss included)
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

/**
 * The pupil's glow (round T2): the light from inside the pupil, as albedo (lit by the scene like the rest of the window;
 * no emission). Its shape (EYE_GLOW): `floor` everywhere inside the pupil plus `low` toward its lower part (sstep over
 * the window's Y, radians, from y[0] to y[1]), fading out at the pupillary margin over `margin` radians. Its colour per
 * variant (EYE_PUPIL: the map holds `teal`; the runtime switches by the map's glow mask, EYE_MATERIAL.extras):
 *   teal   u1, B002, B067: behaviour §2.4's samples #2f695d / #0c3b45 between (#2f695d alone read too green at u1's
 *          camera: a* −11 against the photo's −4.8)
 *   red    the reddish-brown pupils of B009, B010, B064
 *   black  B049 and fish in flat natural light: no glow (the ground's own colour)
 */
export const EYE_GLOW = { floor: 0.18, low: 0.6, y: [0.3, -0.35], margin: -0.08 };
export const EYE_PUPIL = {
  teal: { glow: '#2f5e60', k: 1 },
  red: { glow: '#6a3526', k: 1 },
  black: { glow: '#0b1414', k: 0 },
};

/** Roughness (the ORM's G) of the eye's parts. */
export const EYE_ROUGH = { pupil: 0.03, ring: 0.04, iris: 0.05, meniscus: 0.06, skin: 0.45 };

/**
 * The Eye material's factors (glTF core + KHR extensions, three.js r186 MeshPhysicalMaterial; the runtime's loader keeps
 * the clearcoat at the hero and lod1, src/creatures/models/ModelLoader.ts). The maps are the body atlas's (the eye's UVs
 * land in its iris and eyeSkin rects): baseColorTexture = the body colour (A in the iris rect: the pupil glow's mask),
 * metallicRoughnessTexture = the film map (G roughness; metallicFactor 0 — round T2: not metallic, the ring's gold is
 * its colour and the film), normalTexture = the body normal, and the clearcoat's roughness from the same map's G
 * (clearcoatRoughnessTexture, glTF: its G channel): no map of its own. No occlusion on the globe (it turns; paintEye's
 * `ao` is 1). extras.tobihaze.runtime.pupil: the pupil variant as a runtime parameter (for build.mjs to copy into the
 * Eye material's runtime extras, and the runtime / the viewer's patchRuntime to apply).
 * (round T1's optional thin film on the pupil, KHR_materials_iridescence through the ORM's R, is dropped: in round T2 R
 * is the film, and the glow gives u1's teal at dE 3.5 without it)
 */
export const EYE_MATERIAL = {
  name: 'Tobihaze_Eye',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1, maps: { baseColorTexture: 'body colour (A in the iris rect: the pupil glow mask)', metallicRoughnessTexture: 'body film map (G roughness; not metallic)' } },
  normalTexture: 'body normal',
  extensions: {
    KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.4, clearcoatRoughnessTexture: 'body ORM (G)' },
    KHR_materials_ior: { ior: 1.376 },
  },
  // (lod2: no Eye material: the globes are merged into the Body at rest; their window colour carries a soft sky
  // reflection instead, paintEye(..., { tier: 'lod2' }))
  tiers: { hero: 'as above', lod1: 'as above (the same maps at their sizes)', lod2: 'merged into Tobihaze_Body (paintEye tier lod2)' },
  extras: {
    tobihaze: {
      role: 'eye',
      wetness: 'the clearcoat stays 1 at every wetness (the eye is kept wet: rolled and wiped); the skin cap base roughness follows the head (paintEye o.skinRough)',
      // (round T2) the pupil's colour variant as a runtime parameter: one map for every fish
      runtime: {
        pupil: {
          uniform: 'pupilGlow: one of the variants (linear RGB), default teal (the map)',
          channel: 'baseColor A inside the iris rect (irisRect): paintEye `glow`, the weight of the glow colour in the texel; 0 on the rest of the window and on the skin cap (whose A the body\'s bars uniform would read: the Eye material skips the bars term)',
          rule: 'albedo.rgb += A × (variant − teal), in linear light, only for UV inside irisRect (the eye\'s own rects; the body never samples them)',
          teal: hexLinear(EYE_PUPIL.teal.glow).map((v) => +v.toFixed(5)),
          variants: Object.fromEntries(Object.entries(EYE_PUPIL).map(([k, v]) => [k, (v.k > 0 ? hexLinear(v.glow) : hexLinear(EYE_PALETTE.pupil)).map((x) => +x.toFixed(5))])),
          note: 'teal: u1, B002, B067 (the default); red: the reddish-brown pupils of B009, B010, B064; black: B049, flat natural light',
        },
      },
    },
  },
};

/**
 * The painted pupil against the mesh's pupil ring (eye.mjs pupilEdge: 0.635 × 0.364 ED as chords, its notch 0.10 of ρ
 * deep): the photos' pupil is 0.60 × 0.38–0.42 ED with a clear notch in its top edge (B009, B010: a heart; u1 a gentle
 * dip), so the texture draws its edge `endsED` in at the window's back and front ends, `topED` / `bottomED` out over
 * and under, and the notch `notchED` deeper over `notchWidth` degrees at eye.mjs's dentAt; never closer than
 * `minRingED` to the window's edge (the gold ring stays). The mesh's ring only places vertices: the texture's edge is
 * what shows, at every tier. (ED: the globe's diameter; on the globe an angle θ spans θ / 2 ED.)
 */
export const EYE_PAINT = { pupil: { endsED: 0.034, topED: -0.008, bottomED: 0.016, notchED: 0.05, notchWidth: 26, minRingED: 0.012 } };

/** The window's geometry (eye.mjs) as tables over φ: θb (rad), the mesh's pupil ρ, the painted pupil's ρ (per pupil
 * parameter set: EYE_PAINT.pupil, or a test's own). */
const GEOS = new Map();
function geometry(PP = EYE_PAINT.pupil) {
  const key = JSON.stringify(PP);
  if (GEOS.has(key)) return GEOS.get(key);
  const N = 1024, thB = windowBound(EYE_SCULPT), tb = new Float64Array(N + 1), rp = new Float64Array(N + 1), rt = new Float64Array(N + 1);
  const roll = (EYE_SCULPT.windowRoll ?? 0) * D2R, dent = (EYE_SCULPT.pupil?.dentAt ?? 90) * D2R;
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
  const G = { thB: (ph) => at(tb, ph), rhoMesh: (ph) => at(rp, ph), rhoP: (ph) => at(rt, ph), S };
  GEOS.set(key, G);
  return G;
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
 * The window's texel: colour (linear), roughness, the glow's weight (`glow`: how much of the texel's colour is the pupil
 * glow's — the runtime's pupil variant moves the colour by glow × (variant − the painted glow)) at the window's polar
 * fraction ρ (0 the axis, 1 the edge) and azimuth φ. `fp` the texel's footprint in radians on the globe (for fading
 * the fine detail).
 */
function windowTexel(rho, ph, fp, P, o, PP) {
  const { thB, rhoP } = geometry(PP);
  const b = thB(ph), rp = rhoP(ph), th = rho * b;
  const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]; // the window's own frame
  const X = th * Math.cos(ph), Y = th * Math.sin(ph); // radians across the window (Y up)
  const c = [0, 0, 0];
  let rough, gw = 0;
  // the band between the pupil and the window's edge, in radians: d0 from the pupil's edge, w its width here
  const dd = (rho - rp) * b, w = (1 - rp) * b;
  const below = sat(-Math.sin(ph)); // 1 straight under the pupil
  const G = { ...EYE_GLOW, ...(o.glow ?? {}) };
  // ---- the pupil: near black, lit from inside by the glow (teal-green by default: u1, B002; EYE_PUPIL's variants), a
  // broad soft blob strongest low in the pupil and away from its margin — the light's exit through the lens
  if (dd < 0.01) {
    const v = { ...(EYE_PUPIL[o.pupilGlow ?? 'teal'] ?? EYE_PUPIL.teal), ...(o.pupil ?? {}) };
    c[0] = P.pupil[0]; c[1] = P.pupil[1]; c[2] = P.pupil[2];
    gw = (G.floor + G.low * sstep(G.y[0], G.y[1], Y)) * sstep(-0.006, G.margin, dd) * (0.85 + 0.15 * perlin3(X * 9, Y * 9, 0.5, 31)) * v.k;
    mixTo(c, hexLinear(v.glow), gw);
    // the pupillary margin (the iris's pigment ruff): darker over the last 0.012 rad
    const rf = sstep(-0.03, -0.004, dd) * 0.8;
    mixTo(c, P.pupilRuff, rf);
    gw *= 1 - rf;
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
    gw *= 1 - a;
    const rB = EYE_ROUGH.ring + (EYE_ROUGH.iris - EYE_ROUGH.ring) * (1 - r1);
    rough = rough === undefined ? rB : rough + (rB - rough) * a;
  }
  // (lod2: the far eye has no clearcoat; a soft reflection of the sky over the window's upper half keeps it wet)
  if (o.tier === 'lod2') { const s = 0.22 * sstep(-0.05, 0.25, Y); mixTo(c, [0.32, 0.36, 0.40], s); gw *= 1 - s; }
  // (the thin-film mask: the pupil's angle-dependent tint, a trace on the ring; 0 on the iris and the skin)
  const ird = dd < 0 ? 1 : 0.25 * (1 - sstep(0, 0.05, dd));
  return { c, rough, glow: gw, irid: ird };
}

/** The skin cap's texel at t (0 the window's edge → 1 the back pole) and φ. */
function skinTexel(t, ph, fp, P, o, PP) {
  const { thB } = geometry(PP);
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
  return { c, rough, glow: 0, irid: 0 };
}

/**
 * Which part of the window a point is (for the checks: label renders, region measures): ρ (0 the axis, 1 the window's
 * edge) and φ as the iris rect's v and u·2π. Returns { part: 'pupil' | 'ring' | 'iris' | 'edge', dd (radians out from
 * the painted pupil's edge), w (the band's width there), ringW }.
 */
export function windowRegion(rho, ph, PP = EYE_PAINT.pupil) {
  const { thB, rhoP } = geometry(PP);
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
 *   skinRough: number | (p, n) → roughness (the head's, the surface key's WET; default 0.45); tier ('hero' | 'lod1' |
 *   'lod2': lod2 adds the window's sky reflection); pupilGlow ('teal' | 'red' | 'black': EYE_PUPIL, the map's own; the
 *   runtime switches it with the `glow` layer, EYE_MATERIAL.extras.tobihaze.runtime.pupil); pupil ({ glow, k }
 *   overrides), glow (EYE_GLOW overrides); ring ('gold' | 'orange'); paint (EYE_PAINT.pupil overrides); palette
 *   ({ key: hex } overrides); pad (texels painted past each rect's edges, wrapping round the azimuth: default 4 at 2048,
 *   scaled; the gutters are 0.01 = 20 texels); ss (supersamples per side, default by size) }
 * @returns { size, rgb: Float32Array (size² × 3, linear), rough: Float32Array (size²), glow: Float32Array (size²: the
 *   pupil glow's weight in the texel's colour — round T2: the bake writes it into the baseColor's A inside the iris rect,
 *   the runtime pupil variant's mask), metal: Float32Array (size²: 0 — round T2, the Eye is not metallic, the ring's gold
 *   is its colour and the film), ao: Float32Array (size², 1 where painted), irid: Float32Array (size²: the optional thin
 *   film's mask), mask: Uint8Array (size²: 1 the window, 2 the skin cap, 0 untouched) }
 */
export function paintEye(rects, size, o = {}) {
  const P = Object.fromEntries(Object.entries({ ...EYE_PALETTE, ...(o.palette ?? {}) }).map(([k, h]) => [k, hexLinear(h)]));
  const PP = o.paint ? { ...EYE_PAINT.pupil, ...o.paint } : EYE_PAINT.pupil;
  const N = size * size;
  const out = { size, rgb: new Float32Array(N * 3), rough: new Float32Array(N), glow: new Float32Array(N), metal: new Float32Array(N), ao: new Float32Array(N), irid: new Float32Array(N), mask: new Uint8Array(N) };
  const ss = o.ss ?? (size >= 2048 ? 2 : size >= 1024 ? 3 : 4);
  const pad = o.pad ?? Math.max(2, Math.round((4 * size) / 2048));
  const { thB } = geometry(PP);
  for (const [part, R] of [['window', rects.iris], ['skin', rects.eyeSkin]]) {
    if (!R) continue;
    const x0 = R[0] * size, y0 = R[1] * size, W = (R[2] - R[0]) * size, H = (R[3] - R[1]) * size;
    const px0 = Math.max(0, Math.floor(x0) - pad), px1 = Math.min(size - 1, Math.ceil(x0 + W) - 1 + pad);
    const py0 = Math.max(0, Math.floor(y0) - pad), py1 = Math.min(size - 1, Math.ceil(y0 + H) - 1 + pad);
    for (let py = py0; py <= py1; py++)
      for (let px = px0; px <= px1; px++) {
        const acc = [0, 0, 0];
        let ar = 0, ag = 0, ai = 0;
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
              q = windowTexel(rho, ph, fp, P, o, PP);
            } else {
              const t = Math.min(1, Math.max(0, v));
              const fp = Math.max(1e-4, (Math.PI - thB(ph)) / H);
              q = skinTexel(t, ph, fp, P, o, PP);
            }
            acc[0] += q.c[0]; acc[1] += q.c[1]; acc[2] += q.c[2]; ar += q.rough; ag += q.glow; ai += q.irid;
          }
        const k = 1 / (ss * ss), i = py * size + px;
        const inside = px + 0.5 >= x0 && px + 0.5 <= x0 + W && py + 0.5 >= y0 && py + 0.5 <= y0 + H;
        // (the pad never overwrites the other rect's own texels)
        if (!inside && out.mask[i]) continue;
        out.rgb[i * 3] = acc[0] * k; out.rgb[i * 3 + 1] = acc[1] * k; out.rgb[i * 3 + 2] = acc[2] * k;
        out.rough[i] = ar * k; out.glow[i] = ag * k; out.metal[i] = 0; out.ao[i] = 1; out.irid[i] = ai * k;
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
export function eyeMeasures(PP = EYE_PAINT.pupil) {
  const { thB, rhoP, rhoMesh } = geometry(PP);
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
  // (round T2) the heart's lobes: the top edge's highest points either side of the dent (within 75°), the notch as the
  // dip at the dent under the chord between them (as B010 is measured: its top edge's lobes and the dip between), and
  // the ring's width over each lobe
  const lobes = (R) => {
    const pt = (ph) => { const t = Math.sin(R(ph) * thB(ph)); return [t * Math.cos(ph), t * Math.sin(ph)]; };
    let a = null, b = null;
    for (let i = 1; i <= 150; i++) {
      const d = (i / 150) * 75 * D2R, pa = pt(dent - d), pb = pt(dent + d);
      if (!a || pa[1] > a.p[1]) a = { p: pa, ph: dent - d };
      if (!b || pb[1] > b.p[1]) b = { p: pb, ph: dent + d };
    }
    const c = pt(dent), f = (c[0] - a.p[0]) / (b.p[0] - a.p[0] || 1e-9), yc = a.p[1] + (b.p[1] - a.p[1]) * f;
    return { notchED: +((yc - c[1]) / 2).toFixed(4), bandLobesED: [band(a.ph), band(b.ph)], bandDentED: band(dent), lobesDeg: [+((a.ph - roll) / D2R).toFixed(1), +((b.ph - roll) / D2R).toFixed(1)] };
  };
  return {
    mesh: { pupil: ext(rhoMesh), notchED: notch(rhoMesh) },
    painted: { pupil: ext(rhoP), notchED: notch(rhoP), heart: lobes(rhoP) },
    window: ext(() => 1),
    ringED: { top: band(Math.PI / 2), back: band(0), front: band(Math.PI), bottom: band(1.5 * Math.PI), min: Math.min(...Array.from({ length: 360 }, (_, i) => band((i / 360) * 2 * Math.PI))) },
  };
}
