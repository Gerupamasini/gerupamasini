// The トビハゼ's eye as texture and material (round T1, key `eyefin`): the body atlas's `iris` rect (the clear window:
// the pupil, the gold ring round it, the olive-bronze iris outside it) and its eye-skin rects (the globe's skin cap: the
// head's speckled skin carried on the globe, its lid margin round the window), and the factors of the Eye material.
//
// The rects are the eye mesh's own parametrisation (eye.mjs eyeGlobe, eyemesh.mjs eyePartUV): u = φ / 2π the azimuth
// about the window's axis (φ = 0 the window's back edge, 90° its top, 180° its front, on either eye: the right globe is
// the left's mirror image and reads the same rects), and
//   iris     v from the rect's top (the window's axis, ρ = 0) to its bottom (the window's edge, ρ = 1), ρ the polar angle
//            over the window's bound θb(φ) (eye.mjs windowBound); the pupil is ρ < ρp(φ), the painted outline (below)
//   eyeSkin  v from the rect's top (the window's edge, the lid margin) to its bottom (the back pole), t = (θ − θb) / (π − θb)
//            (round T3: one rect per cap, eyeSkinL / eyeSkinR, textures.mjs paints each with its own side's skin)
// Measured on the photos (u1, B010, B002, B049, u5_eyes; ref/work/t1_eyefin): the pupil a horizontal bean, 0.60 x
// 0.38-0.42 ED, with a broad shallow dip in its top edge (B009, B010: a kidney / heart; u1 a gentle dip), near black with
// a teal-green light (u1, B002, B067; reddish-brown in B010, black in B049); a thin bright gold ring hugging it (u1
// #dac28c, B010 #e8cda0 as photographed, with their gloss), a hairline over the pupil and wider and paler under it
// (B010's cream-gold crescent); outside the ring, to the window's edge, olive-bronze iris finely stippled (B010 #a68d65,
// A004 #927652); no white of the eye; the window's edge a soft dark limbal line, then the lid margin (the skin) with a
// pale crescent along the hood over the window's upper front (u5, B020) and the hood's fold as a soft dark arch (B010,
// u1); the skin cap the head's speckled skin (o.skin: the pattern key's skin colour at the cap's point).
//
// Round T2 (key eyefin; ref/work/t2_eyefin): the ring gold by its colour and the film (not metallic), a teal glow in the
// pupil as albedo with its runtime variants (red-brown, black) through a mask in the baseColor's A, a notched top edge.
//
// Round T3 (key eyefin; the T2 eye review, ref/work/t2_findings/eyes.txt; scratch ref/work/t3_eyefin), calibrated
// against the owner's photo u1 first (B010, B002, B049 secondary) under the viewer's photo, u1 and game rigs, at the
// photos' cameras with the states' default gaze (55° out, 15° up), on the round's skin (pattern and surface T3):
//   the pupil  dark: near black-teal albedo (EYE_PALETTE.pupil) with a faint deep teal from the lens (EYE_GLOW 0.07 / 0.3,
//              T2 0.18 / 0.6): what reads teal is mostly the cornea's film mirroring the sky (the Eye has one specular
//              since round T3, the tech key's KHR_materials_specular 0.25 under the clearcoat). T2's pupil was a lit teal
//              bead (pupil / cap luminance 0.21–0.29 under the photo rig; the photos 0.13)
//   the bean   the outline drawn in the window's own plane (EYE_PAINT.pupil: a superellipse bean, its top edge dipping in a
//              broad smooth U between two rounded lobes, B010's kidney; u1's gentle dip), not T2's narrow V notch on a
//              flat top that read as lips; the window's sculpted flat top is the limit: the lobes keep ~0.035 ED of ring
//   the ring   less saturated (T2 #f0cc70, b* 50: C* 36.6 under the game light against the photos' 26–30), thin over the
//              pupil and widening into a pale cream-gold crescent under it that runs on over the lid margin below the
//              window (EYE_CAP.pale: the window leaves only ~0.065 ED under the pupil; B010's pale zone is ~0.14 ED)
//   the cap    the lid margin's concentric folds round the window as colour (EYE_CAP.folds: u1's rolled rings round the
//              window; the relief is the surface key's) and the dark rim at the window's edge eased under it
//   measured   (the photo rig, the final build) pupil / cap 0.12–0.19 at the u1, B010 and q34 cameras (T2 0.21–0.29;
//              zukan 0.10–0.17, the u1 rig 0.30); at B010 the outline's dip 0.043 ED, 0.27 W wide, its lobes 0.53 W
//              apart, H/W 0.62; the pale zone under the pupil 0.10–0.13 ED (T2 0.02–0.03); the ring's C* 22–25, 31 under
//              the game light (T2 26–37); the variants red dE 2.8 to B010's pupil, black 3.4 to B049's
//
// Round fin_eye (the owner: 目の形; scratch ref/work/fin_eye): the window a big rounded oval (eye.mjs) and the paint
// following it — the dark pupil fills the window inside a thin gold rim (EYE_PAINT.pupil.follow, the rim paler under the
// pupil, a thin dark limbal line outside it), where T3's bean sat in a broad cream / olive band that drew the window's
// corners as a pointed almond; no painted concentric folds on the cap (EYE_CAP.folds k 0: with the collar's they stacked
// as rings under the globe) and the pale zone under the window only a narrow lip of the rim's cream.
//
// Texels: the colour as linear RGB, the roughness (the ORM's G: the window 0.03–0.05, the lid margin's wet meniscus
// easing to the skin's), the glow mask (`glow`: the bake's baseColor A in the iris rect), the occlusion (1: the globe
// turns, so no occlusion is baked on it). Supersampled per texel (anti-aliased at every size) and every detail finer than
// about 1.5 texels faded to its mean, so lod1 (1024) and lod2 (256) keep the hero's read.
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
 * The eye's colours (sRGB hex; albedo, calibrated so the rendered regions land on the photos' as photographed: the
 * measures in ref/work/t3_eyefin).
 */
export const EYE_PALETTE = {
  pupil: '#070f0f',        // the pupil's ground: near black, a hair teal (round T3; T2 #0b1414)
  pupilRuff: '#020303',    // the pupil's margin, a hair darker
  ring: '#e6c47c',         // the gold ring (round T3: less saturated, T2 #f0cc70; u1 #dac28c, B010 #e8cda0 as photographed)
  ringPale: '#e6dcc2',     // the ring's wider, paler crescent under the pupil (B010), run on over the lid margin
  ringOrange: '#d9893a',   // the orange-copper variant (B020, B062): o.ring 'orange'
  iris: '#93774d',         // the olive-bronze iris outside the ring (A004 #927652, B010 #a68d65)
  irisOlive: '#7a7150',    // its olive end (the low-frequency variation)
  stipple: '#3a2e20',      // the iris's fine melanophore stipple
  limbus: '#3d3426',       // the dark line at the window's edge
  skin: '#8c7f66',         // the skin cap's ground when no skin colour function is given
  skinDark: '#4c3d2e',     // its speckle
  skinPale: '#cdbb8c',     // its pale granules
  lidPale: '#d8cbab',      // the hood's pale margin (u5, B020)
  fold: '#5a4c3a',         // the hood's fold, a soft dark arch over the window; the lid's concentric folds
};

/**
 * The pupil's glow: the light from inside the pupil, as albedo (lit by the scene like the rest of the window; no
 * emission). Its shape (EYE_GLOW): `floor` everywhere inside the pupil plus `low` toward its lower part (sstep over the
 * window's Y, radians, from y[0] to y[1]), fading out at the pupillary margin over `margin` radians. Its colour per
 * variant (EYE_PUPIL: the map holds `teal`; the runtime switches by the map's glow mask, EYE_MATERIAL.extras):
 *   teal   u1, B002, B067: a deep blue-green (round T3: a faint tint under the cornea's sky; T2 0.18 / 0.6 lit a bead)
 *   red    the reddish-brown pupils of B009, B010, B064 (round T3: brighter, the mask's weight is lower)
 *   black  B049 and fish in flat natural light: no glow (the ground's own colour)
 */
export const EYE_GLOW = { floor: 0.07, low: 0.3, y: [0.3, -0.35], margin: -0.08 };
export const EYE_PUPIL = {
  teal: { glow: '#2c6466', k: 1 },
  red: { glow: '#9a6656', k: 1 },
  black: { glow: '#070f0f', k: 0 },
};

/** Roughness (the ORM's G) of the eye's parts. */
export const EYE_ROUGH = { pupil: 0.03, ring: 0.04, iris: 0.05, meniscus: 0.06, skin: 0.45 };

/**
 * The Eye material's factors (glTF core + KHR extensions, three.js r186 MeshPhysicalMaterial), as the build writes them
 * (build.mjs texturedMaterials; round T3 these are the GLB's own, so this object and the GLB agree): the body atlas's
 * maps through the eye's rects — baseColorTexture the body colour (A in the iris rect: the pupil glow's mask),
 * metallicRoughnessTexture the ORM (G roughness, metallicFactor 0: the ring's gold is its colour and the film), the
 * body normal — no occlusionTexture (the globe turns, lifts and drops); the film as the skin's: clearcoat 1, its
 * roughness the ORM's G × 0.2 (clearcoatRoughnessTexture; the window under three's floor 0.0525), its normal the body
 * normal at the film's scale; KHR_materials_specular 0.25 (one specular under the film: round T3, the tech key's — T2's
 * Eye had the full base specular, which doubled the cornea's highlight and lit the pupil); ior 1.376 (the cornea).
 * extras.tobihaze.runtime.pupil: the pupil variant as a runtime parameter (build.mjs copies it into the Eye's extras).
 */
export const EYE_MATERIAL = {
  name: 'Tobihaze_Eye',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1, maps: { baseColorTexture: 'body colour (A in the iris rect: the pupil glow mask)', metallicRoughnessTexture: 'body ORM (G roughness; not metallic)' } },
  normalTexture: 'body normal',
  extensions: {
    KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.2, clearcoatRoughnessTexture: 'body ORM (G)', clearcoatNormalTexture: 'body normal (the film\'s scale)' },
    KHR_materials_specular: { specularFactor: 0.25 },
    KHR_materials_ior: { ior: 1.376 },
  },
  // (lod2: no Eye material: the globes are merged into the Body at rest; their window colour carries a soft sky
  // reflection instead, paintEye(..., { tier: 'lod2' }))
  tiers: { hero: 'as above', lod1: 'as above (the same maps at their sizes)', lod2: 'merged into Tobihaze_Body (paintEye tier lod2)' },
  extras: {
    tobihaze: {
      role: 'eye',
      wetness: 'none: the eye is kept wet (rolled and wiped); the clearcoat stays 1; the cap\'s G is the head\'s (surface WET.eye.skin)',
      runtime: {
        pupil: {
          uniform: 'pupilGlow: one of the variants (linear RGB), default teal (the map: no change)',
          channel: 'baseColor A inside the iris rect (irisRect): paintEye `glow`, the weight of the glow colour in the texel (round T3: at most ~0.34, the pupil\'s lower half); 0 on the rest of the window and on the caps (the Eye material has no bars term)',
          rule: 'albedo.rgb = max(0, albedo.rgb + A × (variant − teal)), in linear light, only for UV inside irisRect',
          teal: hexLinear(EYE_PUPIL.teal.glow).map((v) => +v.toFixed(5)),
          variants: Object.fromEntries(Object.entries(EYE_PUPIL).map(([k, v]) => [k, (v.k > 0 ? hexLinear(v.glow) : hexLinear(EYE_PALETTE.pupil)).map((x) => +x.toFixed(5))])),
          note: 'teal: u1, B002, B067 (the default); red: the reddish-brown pupils of B009, B010, B064; black: B049, flat natural light',
        },
      },
    },
  },
};

/**
 * The painted pupil (round T3): an outline in the window's own plane, in ED (the globe's diameter), in the window's
 * rolled frame (eye.mjs windowRoll: X toward the window's back edge, Y up; the plane through the globe's centre normal to
 * the window's axis, a point at polar angle θ and azimuth φ at (sin θ cos(φ − roll), sin θ sin(φ − roll)) / 2 ED):
 * a superellipse bean — centre `centre`, half-width `a`, `bt` up and `bb` down, exponents `nt` / `nb` (the ends rounded:
 * B010's end roundness 0.52) — its top tilted by `tilt` (the window's top is higher behind than in front) and dipping by
 * `notch` (a smooth U: depth × exp(−|(X − x) / width|^pow)) between two rounded lobes (B010's kidney: the dip 0.0375 ED
 * under the lobes' chord, its width at half depth 0.30 of the pupil's, the lobes 0.59 apart; u1 a gentler dip); never
 * closer than `minRingED` to the window's edge. The mesh's pupil ring (eye.mjs pupilEdge) only places vertices: the
 * texture's edge is what shows, at every tier. (T2 drew in the mesh's ring by fixed amounts and cut a 26° notch at the
 * window's flat top: a narrow V that read as lips.)
 * Round fin_eye (`follow`): the pupil is the window's own outline drawn in by a thin ring — the photos' dark window with
 * a thin gold rim (u1 face-on, traced: the rim 0.026 ED over the pupil, 0.036 at the ends and under it, the pupil
 * 0.65 × 0.35 ED in a 0.72 × 0.41 window, 0.76 of its area; B010 the rim wider and paler under the pupil, 0.05–0.08 ED;
 * B012 / B013 thin all round; rendered at u1's camera the pupil is 0.78 of the window, T3's 0.61) —
 * so the pupil has the window's round ends; T3's bean inside a broad cream band ended short of the window's ends and
 * the band drew them as an almond. `ring` { top, end, bottom } the rim's width in ED as seen face-on (eased round the
 * outline by the azimuth), `dent` a gentle dip in the pupil's top edge (u1's; B010's kidney deeper) `depth` ED at `at`
 * degrees round from the back edge, `width` degrees wide; never closer than `minRingED` to the window's edge.
 */
export const EYE_PAINT = {
  pupil: { follow: true, ring: { top: 0.026, end: 0.036, bottom: 0.038 }, dent: { at: 112, depth: 0.012, width: 24 }, minRingED: 0.012 },
};

/**
 * The cap's paint round the window (round T3), in degrees out from the window's edge on the globe (1° ≈ 0.0087 ED):
 *   rim    the margin's inner face in shade right at the edge (B010): its strength, eased by `under` below the window
 *   pale   the cream-gold crescent under the window, the ring's pale zone run on over the lid margin (B010: ~0.14 ED of
 *          pale under the pupil, the window leaves ~0.065): to `to` degrees, over the lower arc (`arc`: sstep on the
 *          share of straight-down), at `k`
 *   folds  the lid's concentric folds round the window (u1): soft dark lines at `at` degrees, `width` wide, at `k`,
 *          weighted `sides` round the sides and below against the top (where the hood's own fold and the sky sheen
 *          are), broken by noise
 * Round fin_eye: no painted folds (k 0) — round the window and under it the photos show the globe's smooth skin down to
 * the one rim of the cup (u1, B012, B013); T3's three painted rings stacked over the cup's rim and the collar's folds
 * under the globe — and the pale zone under the window only a narrow lip of the rim's cream (B010), not a band (T3's ran
 * 11° over the lid and widened the window's lower edge into a cream crescent).
 */
export const EYE_CAP = {
  rim: { k: 0.25, to: 1.6, under: 0.6 },
  pale: { to: [1.5, 4.0], arc: [0.3, 0.8], k: 0.5 },
  folds: { at: [6.5, 12.5, 19], width: 1.3, k: 0, sides: [0.45, 1] },
};

/** The window's geometry (eye.mjs) as tables over φ: θb (rad), the mesh's pupil ρ, the painted pupil's ρ (per pupil
 * parameter set: EYE_PAINT.pupil, or a test's own). */
const GEOS = new Map();
const sup = (u, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), n)), 1 / n);
/** The painted pupil's top and bottom edges (ED, the window's rolled plane) at X, or null past its ends. */
function pupilEdges(PP, X) {
  const u = (X - PP.centre[0]) / PP.a;
  if (Math.abs(u) >= 1) return null;
  const st = sup(u, PP.nt), N = PP.notch;
  const top = PP.centre[1] + PP.bt * st + (PP.tilt ?? 0) * (X - PP.centre[0]) * st - (N ? N.depth * Math.exp(-Math.pow(Math.abs((X - N.x) / N.width), N.pow ?? 2)) : 0);
  return { top, bot: PP.centre[1] - PP.bb * sup(u, PP.nb) };
}
/** The followed pupil's ρ at φ (EYE_PAINT.pupil with `follow`): the window's bound less the ring's width, a face-on width
 * w (ED) taken as the polar span 2w / cos θ at the bound. */
function followRho(PP, ph, b) {
  const roll = (EYE_SCULPT.windowRoll ?? 0) * D2R, phr = ph - roll, s = Math.sin(phr), c = Math.cos(phr);
  const R = PP.ring, w0 = c * c * R.end + s * s * (s >= 0 ? R.top : R.bottom);
  const D = PP.dent, dphi = D ? wrapPi(phr - D.at * D2R) : 0;
  const w = w0 + (D ? D.depth * Math.exp(-((dphi / (D.width * D2R)) ** 2)) : 0);
  const dth = (2 * Math.max(w, PP.minRingED ?? 0)) / Math.max(0.35, Math.cos(b));
  return Math.max(0.2, 1 - dth / b);
}
const wrapPi = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
function geometry(PP = EYE_PAINT.pupil) {
  const key = JSON.stringify(PP);
  if (GEOS.has(key)) return GEOS.get(key);
  const N = 1024, thB = windowBound(EYE_SCULPT), tb = new Float64Array(N + 1), rp = new Float64Array(N + 1), rt = new Float64Array(N + 1);
  const roll = (EYE_SCULPT.windowRoll ?? 0) * D2R;
  const inside = (X, Y) => { const e = pupilEdges(PP, X); return !!e && Y < e.top && Y > e.bot; };
  for (let i = 0; i <= N; i++) {
    const ph = (i / N) * 2 * Math.PI, b = thB(ph), r = pupilEdge(ph, EYE_SCULPT);
    tb[i] = b; rp[i] = r;
    if (PP.follow) { rt[i] = followRho(PP, ph, b); continue; }
    // (the outline's radius along this azimuth: from the window's axis, inside, out to the edge — the bean is star-shaped
    // about the axis — then bisected; ED in the plane, a chord sin θ / 2)
    const c = Math.cos(ph - roll), s = Math.sin(ph - roll);
    let lo = 0, hi = 0.5;
    for (let q = 0.002; q < 0.5; q += 0.002) if (!inside(q * c, q * s)) { hi = q; break; } else lo = q;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (inside(m * c, m * s)) lo = m; else hi = m; }
    const th = Math.asin(Math.min(1, 2 * lo));
    rt[i] = Math.min(1 - (2 * PP.minRingED) / b, th / b);
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
  // ---- the pupil: near black, a faint deep tint from inside (teal-green by default: u1, B002; EYE_PUPIL's variants),
  // a broad soft blob strongest low in the pupil and away from its margin — the light's exit through the lens
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
    // ---- the iris band: the gold ring hugging the pupil, thin over it and wider and paler under it (round T3: a hairline
    // of gold over the pupil, the band's outer part the olive-bronze iris; T2's ring filled the band over the pupil and
    // read as a thick gold outline); the olive-bronze iris to the edge
    const ringW = Math.max(0.026, Math.min(0.13, (0.42 + 0.48 * below) * w));
    const q = c.slice(), irisC = P.iris.slice();
    mixTo(irisC, P.irisOlive, sat(0.5 + 0.8 * perlin3(X * 6, Y * 6, 1.7, 33)) * 0.6);
    // radial fibres (the iris's stroma) and fine dark stipple (melanophores ~0.006 ED), faded under ~1.5 texels
    const fib = perlin3(Math.cos(ph) * 40, Math.sin(ph) * 40, dd * 30, 35);
    const fine = sstep(0.006, 0.002, fp);
    const st = dots(d, 0.012, 0.0032, 0.55, 37, fp) * fine;
    const irisT = irisC.map((v) => v * (1 + 0.12 * fib * fine));
    mixTo(irisT, P.stipple, 0.75 * st + (1 - fine) * 0.12);
    // the ring: brightest at the pupil's edge, easing into the iris; under the pupil the pale cream-gold crescent, which
    // (round T3) fills the band under the pupil down to the window's edge and runs on over the lid (EYE_CAP.pale)
    const ringC = P[o.ring === 'orange' ? 'ringOrange' : 'ring'].slice();
    // (round fin_eye, a followed pupil: the band is the thin gold rim itself, the pupil's edge to the window's — u1's, B012's
    // — its outer third easing a little toward the olive-bronze iris, the rim paler cream-gold under the pupil (B010) but
    // no broad pale zone; T3's band was a hairline of gold in a broad olive / cream band)
    const paleK = PP.follow ? 0.6 * sstep(0.3, 0.85, below) : sstep(0.15, 0.7, below);
    mixTo(ringC, P.ringPale, paleK * sstep(0.006, 0.03, dd) * 0.95);
    const r1 = PP.follow ? 1 - 0.3 * sstep(0.55 * w, w, dd) : Math.max(1 - sstep(ringW * 0.55, ringW * 1.15, dd), paleK * 0.95 * (1 - sstep(w - 0.02, w, dd) * 0.2));
    const tone = 0.9 + 0.12 * perlin3(Math.cos(ph) * 14, Math.sin(ph) * 14, 3.3, 39) + 0.06 * fib * fine;
    const band = irisT.slice();
    mixTo(band, ringC.map((v) => v * tone), r1);
    // the limbus: a dark line over the window's last 0.02 rad (round T3: faint under the pupil, where the pale zone runs
    // on over the lid; T2 0.4 all round; fin_eye: the thin dark line round the rim of u1 and B012, half as faint under)
    if (PP.follow) mixTo(band, P.limbus, sstep(w - 0.022, w - 0.003, dd) * 0.45 * (1 - 0.5 * paleK));
    else mixTo(band, P.limbus, sstep(w - 0.03, w - 0.004, dd) * 0.4 * (1 - 0.9 * paleK));
    // the edge between the pupil and the ring (anti-aliased by the supersampling: a 0.004 rad ramp)
    const a = sstep(-0.004, 0.004, dd);
    c[0] = q[0] + (band[0] - q[0]) * a; c[1] = q[1] + (band[1] - q[1]) * a; c[2] = q[2] + (band[2] - q[2]) * a;
    gw *= 1 - a;
    const rB = EYE_ROUGH.ring + (EYE_ROUGH.iris - EYE_ROUGH.ring) * (1 - r1);
    rough = rough === undefined ? rB : rough + (rB - rough) * a;
  }
  // (lod2: the far eye has no clearcoat; a soft reflection of the sky over the window's upper half keeps it wet)
  if (o.tier === 'lod2') { const s = 0.22 * sstep(-0.05, 0.25, Y); mixTo(c, [0.32, 0.36, 0.40], s); gw *= 1 - s; }
  return { c, rough, glow: gw };
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
  const L = EYE_SCULPT.lid, F = EYE_SCULPT.fold, deg = dd / D2R, C = { ...EYE_CAP, ...(o.cap ?? {}) };
  const below = sat(-Math.sin(ph)), under = sstep(C.pale.arc[0], C.pale.arc[1], below);
  // the lid's concentric folds round the window (u1): soft dark lines, broken, stronger round the sides and below; faded
  // to their mean where a texel cannot draw them
  const fw = C.folds, fineF = sstep(fw.width * D2R * 0.9, fw.width * D2R * 0.45, fp);
  const side = fw.sides[0] + (fw.sides[1] - fw.sides[0]) * sat(1 - Math.max(0, Math.sin(ph)));
  let fl = 0;
  for (const a0 of fw.at) fl = Math.max(fl, Math.exp(-(((deg - a0) / fw.width) ** 2)));
  const brk = sat(0.65 + 0.7 * perlin3(Math.cos(ph) * 7, Math.sin(ph) * 7, deg * 0.08, 47));
  mixTo(c, P.fold, (fl * fineF + (1 - fineF) * 0.25 * sstep(4, 8, deg) * sstep(24, 20, deg)) * fw.k * side * brk);
  // the lid margin round the window: a dark rim right at the edge (the margin's inner face in shade, B010) — eased under
  // the window, where the pale crescent runs on (round T3) — the pale crescent along the hood's inner edge (u5, B020: the
  // hood over the window's upper front, eye.mjs EYE_SCULPT.lid.hood) and the pale cream-gold crescent under the window
  const hood = Math.pow(0.5 * (1 + Math.cos(ph - L.hood * D2R)), L.hoodPow ?? 1.5);
  mixTo(c, P.limbus, sstep(C.rim.to, 0.2, deg) * C.rim.k * (1 - C.rim.under * under));
  mixTo(c, P.lidPale, Math.exp(-(((deg - 2.6) / 1.4) ** 2)) * hood * 0.6);
  mixTo(c, P.ringPale, sstep(C.pale.to[1], C.pale.to[0], deg) * under * C.pale.k);
  // the hood's fold: a soft dark arch (its crescent, eye.mjs EYE_SCULPT.fold)
  const hw = Math.pow(0.5 * (1 + Math.cos(ph - F.centre * D2R)), F.spread ?? 1.5);
  mixTo(c, P.fold, Math.exp(-(((deg - F.at) / (F.width * 1.2)) ** 2)) * hw * 0.35);
  // roughness: the wet meniscus at the window's edge easing to the skin's over ~6°
  const rs = typeof o.skinRough === 'function' ? o.skinRough(p, n) : (o.skinRough ?? EYE_ROUGH.skin);
  const rough = EYE_ROUGH.meniscus + (rs - EYE_ROUGH.meniscus) * sstep(0.5, 6, deg);
  return { c, rough, glow: 0 };
}

/**
 * Which part of the window a point is (for the checks: label renders, region measures): ρ (0 the axis, 1 the window's
 * edge) and φ as the iris rect's v and u·2π. Returns { part: 'pupil' | 'ring' | 'iris' | 'edge', dd (radians out from
 * the painted pupil's edge), w (the band's width there), ringW }.
 */
export function windowRegion(rho, ph, PP = EYE_PAINT.pupil) {
  const { thB, rhoP } = geometry(PP);
  const b = thB(ph), rp = rhoP(ph), dd = (rho - rp) * b, w = (1 - rp) * b, below = sat(-Math.sin(ph));
  const ringW = PP.follow ? w : Math.max(0.026, Math.min(0.13, (0.42 + 0.48 * below) * w));
  const part = PP.follow
    ? (dd < -0.012 ? 'pupil' : dd > 0.003 && dd < w - 0.012 ? 'ring' : 'edge')
    : (dd < -0.012 ? 'pupil' : dd > 0.003 && dd < ringW * 0.8 ? 'ring' : dd > ringW * 1.2 && dd < w - 0.01 ? 'iris' : 'edge');
  return { part, dd, w, ringW };
}

/** The cap's regions for the checks: 'pale' in the pale crescent under the window, else 'skin'. t and φ as skinTexel's. */
export function capRegion(t, ph, PP = EYE_PAINT.pupil) {
  const { thB } = geometry(PP);
  const b = thB(ph), deg = (t * (Math.PI - b)) / D2R, C = EYE_CAP;
  return deg < C.pale.to[1] - 1 && sstep(C.pale.arc[0], C.pale.arc[1], sat(-Math.sin(ph))) > 0.5 ? 'pale' : 'skin';
}

/** The painted pupil's outline and the window's in the window's rolled plane (ED), for drawings and checks. */
export function pupilOutline(PP = EYE_PAINT.pupil, n = 720) {
  const { thB, rhoP } = geometry(PP), roll = (EYE_SCULPT.windowRoll ?? 0) * D2R;
  const pt = (ph, r) => { const s = Math.sin(r) / 2; return [s * Math.cos(ph - roll), s * Math.sin(ph - roll)]; };
  return { pupil: Array.from({ length: n }, (_, i) => { const ph = (i / n) * 2 * Math.PI; return pt(ph, rhoP(ph) * thB(ph)); }), window: Array.from({ length: n }, (_, i) => { const ph = (i / n) * 2 * Math.PI; return pt(ph, thB(ph)); }) };
}

/**
 * Paint the eye's rects of the body atlas.
 * @param rects { iris: [x0, y0, x1, y1], eyeSkin: [x0, y0, x1, y1] } shares of the atlas (fishmesh.mjs BODY_LAYOUT /
 *   BODY_LAYOUT_LOD2: the same at every tier; round T3: the caller paints each cap's rect — eyeSkinL, eyeSkinR — with
 *   its own side's skin, passing it as `eyeSkin`; either rect may be absent)
 * @param size  the atlas's side in texels (hero 2048, lod1 1024, lod2 256)
 * @param o { skin: (p fish mm, n) → [r, g, b] linear — the skin cap's colour at its point on the LEFT globe at rest
 *   (the pattern key's skinColour(p, n, 'eyeSkin', ctx).rgb, mirrored by the caller for the right cap), else the
 *   fallback; skinRough: number | (p, n) → roughness (the surface key's WET.eye.skin; default 0.45); tier ('hero' |
 *   'lod1' | 'lod2': lod2 adds the window's sky reflection); pupilGlow ('teal' | 'red' | 'black': EYE_PUPIL, the map's
 *   own; the runtime switches it with the `glow` layer, EYE_MATERIAL.extras.tobihaze.runtime.pupil); pupil ({ glow, k }
 *   overrides), glow (EYE_GLOW overrides); ring ('gold' | 'orange'); paint (EYE_PAINT.pupil overrides); cap (EYE_CAP
 *   overrides); palette ({ key: hex } overrides); pad (texels painted past each rect's edges, wrapping round the
 *   azimuth: default 4 at 2048, scaled); ss (supersamples per side, default by size) }
 * @returns { size, rgb: Float32Array (size² × 3, linear), rough: Float32Array (size²), glow: Float32Array (size²: the
 *   pupil glow's weight in the texel's colour — the bake writes it into the baseColor's A inside the iris rect, the
 *   runtime pupil variant's mask), metal: Float32Array (size²: 0, the Eye is not metallic), ao: Float32Array (size², 1
 *   where painted), mask: Uint8Array (size²: 1 the window, 2 the skin cap, 0 untouched) }
 */
export function paintEye(rects, size, o = {}) {
  const P = Object.fromEntries(Object.entries({ ...EYE_PALETTE, ...(o.palette ?? {}) }).map(([k, h]) => [k, hexLinear(h)]));
  const PP = o.paint ? { ...EYE_PAINT.pupil, ...o.paint } : EYE_PAINT.pupil;
  const N = size * size;
  const out = { size, rgb: new Float32Array(N * 3), rough: new Float32Array(N), glow: new Float32Array(N), metal: new Float32Array(N), ao: new Float32Array(N), mask: new Uint8Array(N) };
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
        let ar = 0, ag = 0;
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
            acc[0] += q.c[0]; acc[1] += q.c[1]; acc[2] += q.c[2]; ar += q.rough; ag += q.glow;
          }
        const k = 1 / (ss * ss), i = py * size + px;
        const inside = px + 0.5 >= x0 && px + 0.5 <= x0 + W && py + 0.5 >= y0 && py + 0.5 <= y0 + H;
        // (the pad never overwrites the other rect's own texels)
        if (!inside && out.mask[i]) continue;
        out.rgb[i * 3] = acc[0] * k; out.rgb[i * 3 + 1] = acc[1] * k; out.rgb[i * 3 + 2] = acc[2] * k;
        out.rough[i] = ar * k; out.glow[i] = ag * k; out.metal[i] = 0; out.ao[i] = 1;
        out.mask[i] = part === 'window' ? 1 : 2;
      }
  }
  return out;
}

/**
 * The window's measures (for the checks and the docs), in ED: the mesh's pupil ring and the painted pupil (width, height
 * in the window's plane along its rolled axes; the notch's depth under the lobes' chord, its width at half depth and the
 * lobes' separation as shares of the pupil's width, the end roundness: the height 8 % of the width in from each end over
 * the height), the window, and the iris band (the ring and the iris outside it) over, behind, in front of and under the
 * painted pupil.
 */
export function eyeMeasures(PP = EYE_PAINT.pupil) {
  const { thB, rhoP, rhoMesh } = geometry(PP);
  const roll = (EYE_SCULPT.windowRoll ?? 0) * D2R;
  const ext = (R) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 2048; i++) { const ph = (i / 2048) * 2 * Math.PI, t = Math.sin(R(ph) * thB(ph)) / 2, X = t * Math.cos(ph - roll), Y = t * Math.sin(ph - roll); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    return { W: +(x1 - x0).toFixed(4), H: +(y1 - y0).toFixed(4) };
  };
  const band = (ph) => +(((1 - rhoP(ph)) * thB(ph)) / 2).toFixed(4);
  // the painted outline's top edge sampled along X: the notch under the chord of the highest points either side (within
  // 15–85 % of the width, as notchw.py measures a render's mask)
  // (a followed pupil: its outline's top and bottom edges sampled from the outline itself)
  const edgesOf = () => {
    if (!PP.follow) return (X) => pupilEdges(PP, X);
    const pts = Array.from({ length: 2048 }, (_, i) => { const ph = (i / 2048) * 2 * Math.PI, t = Math.sin(rhoP(ph) * thB(ph)) / 2; return [t * Math.cos(ph - roll), t * Math.sin(ph - roll)]; });
    return (X) => {
      const ys = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[0] - X) * (b[0] - X) <= 0 && a[0] !== b[0]) ys.push(a[1] + ((b[1] - a[1]) * (X - a[0])) / (b[0] - a[0])); }
      return ys.length >= 2 ? { top: Math.max(...ys), bot: Math.min(...ys) } : null;
    };
  };
  const pupilAt = edgesOf();
  const span = (() => { if (!PP.follow) return [PP.centre[0] - PP.a, 2 * PP.a]; let a = 1e9, b = -1e9; for (let i = 0; i < 2048; i++) { const ph = (i / 2048) * 2 * Math.PI, X = (Math.sin(rhoP(ph) * thB(ph)) / 2) * Math.cos(ph - roll); a = Math.min(a, X); b = Math.max(b, X); } return [a, b - a]; })();
  const shape = () => {
    const n = 600, [x0, Wd] = span, tops = [], bots = [];
    for (let i = 1; i < n; i++) { const e = pupilAt(x0 + (Wd * i) / n) ?? { top: 0, bot: 0 }; tops.push(e.top); bots.push(e.bot); }
    const a = Math.floor(0.15 * tops.length), b = Math.floor(0.85 * tops.length);
    let best = { d: 0 };
    for (let i = a + 1; i < b - 1; i++) {
      let il = a; for (let j = a; j < i; j++) if (tops[j] > tops[il]) il = j;
      let ir = i + 1; for (let j = i + 1; j < b; j++) if (tops[j] > tops[ir]) ir = j;
      const d = tops[il] + ((tops[ir] - tops[il]) * (i - il)) / Math.max(1, ir - il) - tops[i];
      if (d > best.d) best = { d, i, il, ir };
    }
    const H = Math.max(...tops) - Math.min(...bots), e = Math.round(0.08 * tops.length);
    const r = { H: +H.toFixed(4), W: +Wd.toFixed(4), endsRound: +(((tops[e] - bots[e]) + (tops[tops.length - 1 - e] - bots[bots.length - 1 - e])) / 2 / H).toFixed(2) };
    if (best.i) {
      const { d, i, il, ir } = best, dep = (k) => tops[il] + ((tops[ir] - tops[il]) * (k - il)) / Math.max(1, ir - il) - tops[k];
      let half = 0; for (let k = il; k <= ir; k++) if (dep(k) >= d / 2) half++;
      Object.assign(r, { notchED: +d.toFixed(4), fwhmW: +(half / tops.length).toFixed(3), lobesW: +((ir - il) / tops.length).toFixed(3) });
    }
    return r;
  };
  return {
    mesh: { pupil: ext(rhoMesh) },
    painted: { pupil: ext(rhoP), shape: shape() },
    window: ext(() => 1),
    ringED: { top: band(Math.PI / 2 + roll), back: band(roll), front: band(Math.PI + roll), bottom: band(1.5 * Math.PI + roll), min: Math.min(...Array.from({ length: 360 }, (_, i) => band((i / 360) * 2 * Math.PI))) },
  };
}
