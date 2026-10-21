// The トビハゼ's fin atlas (round T1, key `eyefin`): the colour and the membrane's coverage (A) of every fin rect of
// fins.mjs FIN_ATLAS, for the near tiers' fin meshes and the far tier's cards (one texture: buildFinMesh and finCard
// share uvMap), and the Fin material's factors.
//
// A fin rect's texel is a place on the fin: fins.mjs maps u across the rays by their spacing (uvMap: U(a), a the
// fractional ray index, the hero's lens round ray k over a ∈ k ± uvHalf, lod1's single sheet with the ray on the line
// a = k) and v along them by length (l / the longest ray); paintFinAtlas inverts that map (the fin def's own `_uv`
// table, which finCard / buildFinMesh compute), so every texel knows its ray, its panel, its distance up the fin and,
// from the rays' bind directions, its distance across in HL: the rays, the spots and the dots are laid out in the fin's
// own millimetres, the bands at their share of the fin's height (l over the membrane's margin there).
//
// Looks (behaviour.md §2.1, §2.3; body_fins_colour §2.7, §3; the photos A001, A065, A070 (D1, D2), A017, A067, A070,
// A030 (caudal), A061, A070, B067 (pectoral), B014, B067 (pelvic); ref/work/t1_eyefin):
//   D1       a dark grey-brown membrane, darker in its distal half, a narrow pale margin, no band and no spots; the spines
//            pale cream along their whole length (A001, A070: white lines on the dark fan); a rust wash between the first
//            spines (A070, B004: finAccent); membrane 82–88 % opaque (T1 72–88) (behaviour §2.3 gives 40–60 %, but A001, A070 and
//            B014 photograph the fin at L* 43–49 over a background at L* 71–77, which no membrane under ~75 % reaches)
//   D2       top to bottom: the pale cream-white margin, the broad dark submarginal band (25–35 % of the height, nearly
//            opaque), the pale mid-zone, 1–2 rows of small dark dashes between the rays near the base (A001); a faint
//            orange tinge on the margin (A065, the folded fins' line)
//   anal     pale whitish, 25–40 % opaque, faint grey rays
//   caudal   amber, 68–80 % opaque (A067's folded spear reads that dense; the table's 50–70 %), rows of dark spots on
//            the rays (oblique bars across the spear: A067, A017), the fleshy base (the sheath, opaque) carrying the
//            peduncle's colour (o.skin: the pattern's own, so the body runs on over the seam) and the dark caudal-base
//            blotch just past it
//   pectoral the blade amber-grey, 32–45 % opaque (T2; T1 50–62), dark dots in lines along the rays (A061), a pale margin; its fleshy root
//            the lobe's own colour where the arm ends (opaque), easing into the blade
//   pelvic   pale cream-pink and translucent (55 %), faint pale rays, a few dark spots on the inner half (B067, B014)
// Soft rays are slightly darker, more opaque lines with faint segment joints, split in two past their branching point
// (on the hero's lens the two ridges, on lod1's sheet two lines); the membranes carry a sparse melanophore stipple.
//
// Round T2 (key eyefin; the T1 fin review; ref/work/t2_eyefin), calibrated under the viewer's canonical photo rig (the
// game's HDR pipeline: the fins blend in linear light; the tone curve AgX) with each fin drawn over its photo's own
// background, against the photos' fin colours, each independent photo once (A070 matched backlit, as it was taken):
//   the colours  T1's palette rendered 8–12 L* too light under the canonical rig (the fins brighter than the body beside
//                them, the photos' darker): the membranes darker by their measured gain (D1 0.45, the caudal 0.42, D2
//                0.7, the blade 0.62, the pelvic and the anal 0.75), D1's base warmer and darker, the caudal less golden
//                (A067, A017 sampled on the fin) — dE2000 to the photos' median: D1 6.1 (T1 10.0), the caudal 3.9
//                (11.4), D2 2.5 (4.4), its band 5.8, the blade in water (A061) 2.3 (7.4)
//   the light    the membranes transmit the sun from behind (FIN_TRANSLUCENCY: FIN_MATERIAL's runtime rule)
//   the caudal   its spots on the rays at every spread (FIN_LOOK.caudalSpot: across in ray slots, T1 in the bind's HL)
//   the blade    nearly clear in water (A061): 32–45 % opaque, dark ray lines with their dot rows, a narrow pale margin;
//                its fleshy root the lobe's own colour where the arm ends (o.skin at the rays' roots; T1 a flat ochre)
//   the pelvic   B014's dark spots visible (~0.5 mm), the shade under the belly baked in toward its root
//   the roots    every fin a little shaded at its base; the bare ray tips past the membrane thinner (the rake look)
//   the fold     a rust line on D1's and D2's very edge (FIN_LOOK.foldLine): the line along the back when they fold
//                (from above, D2's line C* 9.5 → 13.8, a* 1.8 → 3.7)
//   lod2         the cards composited over the lit mud as seen (#aaa69e, T1 its albedo #8e8a82: far fins too dark)
//
// Alpha (A) is the membrane's opacity times its coverage (1 inside the fin's outline, 0 past the margin, a soft edge);
// lod2 (the alpha-tested cards, MASK at 0.5): A is the coverage only where the fin is at least ~15 % opaque, and the
// colour is the translucent fin as seen over a mid background (the BLEND look composited), so the far fin keeps the near
// fins' read. Every texel of a rect is coloured (the fin's colour runs on past the margin): no dark fringe under
// filtering or mipmaps.
import { FIN_SCULPT, finCard } from './fins.mjs';
import { HL } from './anatomy.mjs';
import { perlin3, hash3i } from '../../lib/noise.mjs';

const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** sRGB hex → linear [r, g, b]. */
export const hexLinear = (h) => [1, 3, 5].map((i) => s2l(parseInt(h.slice(i, i + 2), 16) / 255));

/** The atlas's own frame (fins.mjs: FIN_ATLAS in px of a 2048² atlas, each rect inset by INSET px). */
const ATLAS = 2048, INSET_DEFAULT = 6;

/**
 * The fins' colours (sRGB hex; albedo; the opacities in FIN_ALPHA). Research values (behaviour §2.1, §2.3), the D1 and
 * D2 tones checked against A001 / A070, the caudal's against A067 / A017, the blade's against A061 / A070, the pelvic's
 * against B067 / B014 under the reference viewer's light (ref/work/t1_eyefin/gates.json).
 */
export const FIN_PALETTE = {
  d1Membrane: '#3e2f21', d1Distal: '#2a1e14', d1Base: '#453322', d1Spine: '#b2a68c', d1Margin: '#a3987f',
  finAccent: '#a0602c',
  d2Margin: '#b7ae9e', d2Band: '#3d332a', d2Mid: '#917f62', d2Base: '#806c50', d2Spot: '#342920', d2Ray: '#988c79', d2Orange: '#b0804e',
  anal: '#c2bcb0', analRay: '#918a7d',
  caudal: '#67594a', caudalDistal: '#5c4f40', caudalSpot: '#33271f', caudalRay: '#5f5140', caudalEdge: '#746755',
  sheath: '#a89a86', sheathPale: '#cfc3b2', sheathDark: '#3a2c20',
  pectBlade: '#877458', pectRay: '#644f37', pectDot: '#3e2e21', pectMargin: '#9e937c', pectLobe: '#8a7559',
  pelvic: '#b6a58e', pelvicRay: '#c7bcab', pelvicSpot: '#463529',
  stipple: '#3c3026',
  lod2Back: '#aaa69e',     // the background a far fin is seen against: the lit mud as seen, not its albedo (T1 #8e8a82)
};

/** Membrane opacities (behaviour §2.3; BFC §2.7). */
export const FIN_ALPHA = {
  d1: [0.82, 0.88],        // proximal → distal (darker distally: more pigment; A001, A070, B014 read it near opaque)
  d1Spine: 0.92, d1Margin: 0.7,
  d2Band: 0.93, d2Mid: 0.6, d2Margin: 0.65, d2Spot: 0.9, d2Ray: 0.75,
  anal: 0.35, analRay: 0.5,
  caudal: [0.68, 0.8], caudalSpot: 0.9, caudalRay: 0.8,
  pect: [0.32, 0.45], pectDot: 0.88, pectRay: 0.78, pectMargin: 0.3,
  pelvic: 0.55, pelvicRay: 0.65, pelvicSpot: 0.9,
};

/**
 * The fins' looks that are not colours (round T2; ref/work/t2_eyefin):
 *   caudalSpot  the spots on the caudal's rays: `w` their half-width across, a share of the ray slot (so they stay on the
 *               rays at every spread — T1 sized them from the bind spacing in HL and the spread fin showed blotches
 *               across the panels), `h` their half-length along the ray (HL)
 *   pelvicSpot  the pelvic's dark spots on its inner half (B014: ~0.5 mm): cell, radius (HL), keep probability, strength
 *   occlusion   the fins' own shade baked into the colour (the fin atlas has no occlusion map): `root` the darkening at
 *               every fin's base (tm < 0.15) and `pelvic` the pelvic's under the belly (tm < 0.5, B014)
 *   tips        the bare ray tips past the membrane: their opacity × tips (the furled blade and D1 read as a rake)
 *   foldLine    the rust line along the folded D1 / D2 (behaviour §2.3): the margin's very edge (the share `edge` of the
 *               fin's height) finAccent at `k` on D1, d2Orange at `d2` on D2 — folded, the fins stand edge-up in their
 *               groove and from above their edge is the line
 *   pectMargin  the blade's pale margin band (share of the height)
 */
export const FIN_LOOK = {
  caudalSpot: { w: 0.24, h: 0.016 },
  pelvicSpot: { cell: 0.045, r: 0.015, p: 0.6, k: 0.9 },
  occlusion: { root: 0.75, pelvic: 0.55 },
  tips: 0.6,
  foldLine: { k: 0.6, edge: [0.94, 0.99], d2: 0.75 },
  pectMargin: [0.93, 0.98],
};

/**
 * The membranes' light from behind (round T2; the T1 fin review's P1, A065: the dorsal fins glow against the
 * silhouetted body): a thin-surface diffuse transmission term in the fin material's shader — no extra pass, no map, the
 * same at hero, lod1 and lod2 (a few instructions per directional light) — added to the direct diffuse of the face the
 * camera sees:
 *   L_t = diffuse · (1 − smoothstep(stopAlpha)) · albedo^tintPower · Σ_dir E_i · (saturate(dot(−n, l_i))
 *         + forward · pow(saturate(dot(v, −l_i)), forwardPower) · step(0, dot(−n, l_i))) / π
 * n the shaded normal (the face toward the camera: three flips it on the back face), l_i the light's direction, v the
 * view direction, E_i its irradiance; the sun only (the directional lights): the sky's share from both sides is in the
 * atlas's colours, calibrated under the canonical rig's sky (environment 0: transmitting the environment as well
 * brightened every fin lit from the front by 5–10 L*). `stopAlpha`: the fleshy, opaque parts — the caudal's sheath and
 * the pectoral's root, A ≥ 0.95 in the atlas (finTexel makes them opaque before their skin colour shows) — transmit
 * nothing; the far cards (lod2: A the coverage) have no stop. `forward`: a membrane scatters forward — the glow when the
 * sun stands behind the fin near the line of sight (A065, A070). Measured (ref/work/t2_eyefin, the canonical rig's sun
 * moved behind the fish at A065's camera): D1 1.58× as bright as lit from the front (T1 0.75×), D2 1.41×; the backlit
 * A070's caudal dE2000 2.7 (front-lit render 13.6), its D1 6.1.
 */
export const FIN_TRANSLUCENCY = { diffuse: 0.8, tintPower: 0.8, forward: 2, forwardPower: 4, environment: 0, stopAlpha: [0.93, 0.99] };

/**
 * The Fin material per tier (glTF core + KHR extensions; three.js r186 MeshPhysicalMaterial, the runtime's loader keeps
 * these: src/creatures/models/ModelLoader.ts drops transmission below the hero and clearcoat at lod2 only). The near
 * tiers blend (the membrane's opacity in the atlas's A), both faces; the wet membrane a little glossy, ior of the
 * tissue in water; no KHR transmission (an extra scene pass, hero only in the runtime) but the shader's diffuse
 * transmission (FIN_TRANSLUCENCY, extras.tobihaze.runtime.translucency: every tier) and no normal map (the rays' relief
 * is the hero's geometry); no sheen (KHR_materials_sheen 0.35 tested in T1: the fins 1–2 L* lighter). The caudal's
 * sheath and the pectoral's fleshy root are opaque in the atlas (A 1): the GLB draws them opaque (build.mjs
 * FIN_SOLID). lod2: the cards alpha-tested.
 */
const TRANSLUCENCY_RULE = (cards) => ({
  ...FIN_TRANSLUCENCY, ...(cards ? { stopAlpha: null } : {}),
  rule: `the fin material's shader adds, after three's lights (#include <lights_fragment_end>), to reflectedLight.directDiffuse: diffuse × ${cards ? '' : '(1 − smoothstep(stopAlpha[0], stopAlpha[1], diffuseColor.a)) × '}pow(material.diffuseColor, tintPower) × Σ over the directional lights of color × (saturate(dot(−normal, direction)) + forward × pow(saturate(dot(viewDir, −direction)), forwardPower) × step(0, dot(−normal, direction))) / π; environment × getIBLIrradiance(−normal) is off (0): the atlas was calibrated under a sky from both sides`,
  ...(cards ? { note: 'lod2: the cards\' A is the coverage, so no stop' } : {}),
});
export const FIN_MATERIAL = {
  hero: {
    name: 'Tobihaze_Fin', alphaMode: 'BLEND', doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.38, maps: { baseColorTexture: 'fin colour (RGB sRGB, A opacity)' } },
    extensions: { KHR_materials_ior: { ior: 1.36 } },
    extras: { tobihaze: { role: 'fin', wetness: 'roughness 0.38 wet → 0.5 damp → 0.7 muddy (×, as the skin\'s)', sheath: 'A = 1 over the caudal\'s fleshy base and the pectoral\'s root', runtime: { translucency: TRANSLUCENCY_RULE(false) } } },
  },
  lod1: 'as hero (the same features: BLEND, double-sided, the atlas at 512, the translucency)',
  lod2: {
    name: 'Tobihaze_Fins', alphaMode: 'MASK', alphaCutoff: 0.5, doubleSided: true,
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.5, maps: { baseColorTexture: 'fin colour (lod2: composited over lod2Back, A coverage)' } },
    extensions: { KHR_materials_ior: { ior: 1.36 } },
    extras: { tobihaze: { role: 'fin', merged: true, runtime: { translucency: TRANSLUCENCY_RULE(true) } } },
  },
};

// ------------------------------------------------------------------------------------------------ the fin's frame
/** Jittered-lattice dots in 2D (x, y in HL; cell, radius in HL): coverage 0..1, each cell kept with probability p. */
function dots2(x, y, cell, r, p, seed, aa) {
  const X = x / cell, Y = y / cell, ix = Math.floor(X), iy = Math.floor(Y);
  let best = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = hash3i(ix + i, iy + j, 3, seed);
    if ((h & 1023) / 1023 > p) continue;
    const fx = ix + i + 0.1 + 0.8 * (((h >>> 10) & 255) / 255), fy = iy + j + 0.1 + 0.8 * (((h >>> 18) & 255) / 255);
    const rr = r * (0.65 + 0.7 * (((h >>> 26) & 63) / 63));
    const d = Math.hypot(fx - X, fy - Y) * cell, e = Math.max(aa * 0.7, rr * 0.3);
    best = Math.max(best, sstep(rr + e, rr - e, d));
  }
  return best;
}

/**
 * Everything a fin rect's painter needs: the inverse of the atlas map (texel → a, l), the margins, the spacing across.
 * def: one of fins.finDefinitions(); size: the atlas's side in texels.
 */
function finFrame(def) {
  const src = def.mirrorOf ?? def;
  if (!src._uv) finCard(src); // (uvMap is fins.mjs-internal: finCard computes it and keeps it on the def)
  const UV = src._uv, n = src.rays.length, uR = UV.rays, Lmax = UV.Lmax, uvH = FIN_SCULPT.ray.uvHalf;
  // a from U (the map is linear between the rays and past either end at the end slots' slopes)
  const aOfU = (U) => {
    if (U <= uR[0]) return (U - uR[0]) / (uR[1] - uR[0]);
    if (U >= uR[n - 1]) return n - 1 + (U - uR[n - 1]) / (uR[n - 1] - uR[n - 2]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (uR[m] <= U) lo = m; else hi = m; }
    return lo + (U - uR[lo]) / (uR[lo + 1] - uR[lo]);
  };
  // the inset (fins.mjs INSET), recovered from the card's UVs (x = rx + I + U·(rw − 2I)), else the default
  let inset = INSET_DEFAULT;
  try {
    const c = finCard(src), [rx, , rw] = src.rect;
    const est = [];
    for (let i = 0; i < c.ray.length; i++) { const U = UV.U(c.ray[i]); if (Math.abs(1 - 2 * U) > 0.2) est.push((c.uv[i * 2] * ATLAS - rx - U * rw) / (1 - 2 * U)); }
    if (est.length) { est.sort((p, q) => p - q); const m = est[est.length >> 1]; if (Math.abs(m - INSET_DEFAULT) < 3) inset = Math.round(m * 1000) / 1000; }
  } catch { /* the default */ }
  // the membrane's margin at a (HL along the rays): the hero's (relief: lens edges at k ± uvH) and lod1's (the flat
  // sheet's reach and notch, the panel from k to k + 1)
  const margin = (a, flat) => {
    const k = Math.max(0, Math.min(n - 2, Math.floor(a))), p = src.panels[k];
    const La = src.rays[k].len, Lb = src.rays[k + 1].len;
    const r0 = flat ? (p.flat0 ?? p.reach0) : p.reach0, r1 = flat ? (p.flat1 ?? p.reach1) : p.reach1;
    const notch = flat ? (p.flatNotch ?? p.notch) : p.notch;
    const L0 = La * r0, L1 = Lb * r1, Lm = Math.max(L0, L1);
    const a0 = flat ? k : k + uvH, a1 = flat ? k + 1 : k + 1 - uvH;
    const f = sat((a - a0) / (a1 - a0)), E = 1 - notch * Math.pow(Math.sin(Math.PI * f), p.notchPow ?? 1);
    return lerp(Math.min(E * Lm, L0), Math.min(E * Lm, L1), f);
  };
  // the spacing between rays k and k + 1 at l (HL; their bind lines, base + dir · l)
  const spacing = (k, l) => {
    k = Math.max(0, Math.min(n - 2, k));
    const A = src.rays[k], B = src.rays[k + 1], la = Math.min(l, A.len), lb = Math.min(l, B.len);
    const d = [0, 1, 2].map((i) => A.base[i] + A.dir[i] * la - B.base[i] - B.dir[i] * lb);
    return Math.max(0.004, Math.hypot(d[0], d[1], d[2]));
  };
  // the distance across from ray 0 to a, at l (HL)
  const across = (a, l) => {
    let x = 0;
    const k = Math.floor(a);
    if (a < 0) return a * spacing(0, l);
    for (let j = 0; j < Math.min(k, n - 1); j++) x += spacing(j, l);
    return x + (a - Math.min(k, n - 1)) * spacing(Math.min(k, n - 2), l);
  };
  return { src, n, Lmax, uvH, aOfU, inset, margin, spacing, across, rays: src.rays };
}

// ------------------------------------------------------------------------------------------------ the fins' looks
/**
 * The ray's presence at a: 1 on its centre line out to its lens edge (uvHalf of the slot), soft beyond; split in two
 * past `branch` of a soft ray's length. `aa` the texel's width in slot units. Returns { d (0..1), k, dA, branch }.
 */
function rayAt(F, a, l, aa, o = {}) {
  const k = Math.max(0, Math.min(F.n - 1, Math.round(a))), r = F.rays[k], dA = a - k;
  if (r.kind === 'frenum' || l > r.len * 1.02) return { d: 0, k, dA, joint: 0 };
  const t = l / r.len, half = (o.half ?? 0.085) * (1 - (r.kind === 'spine' ? 0.45 : 0.35) * t);
  let d;
  const soft = r.kind === 'soft' && !r.simple;
  const br = FIN_SCULPT.ray.soft.branch;
  if (soft && t > br && o.branch !== false) {
    const sp = 0.035 + 0.05 * sstep(br, 1, t);
    const h2 = half * 0.6;
    d = Math.max(sstep(h2 + aa, h2 - aa, Math.abs(dA - sp)), sstep(h2 + aa, h2 - aa, Math.abs(dA + sp)));
  } else d = sstep(half + aa, half - aa, Math.abs(dA));
  // the segments' joints (soft rays past segStart): a faint pale ring every ~0.025 HL
  let joint = 0;
  if (r.kind === 'soft' && t > FIN_SCULPT.ray.soft.segStart) {
    const ph = l / 0.025 + k * 0.37, fr = ph - Math.floor(ph);
    // (only where a texel resolves the ray: under ~1/16 of a slot)
    joint = aa < 0.06 ? Math.exp(-(((fr - 0.5) / 0.08) ** 2)) : 0;
  }
  return { d: d * sstep(r.len * 1.02, r.len * 0.99, l), k, dA, joint };
}

const mixTo = (c, k, a) => { if (a <= 0) return; if (a > 1) a = 1; c[0] += (k[0] - c[0]) * a; c[1] += (k[1] - c[1]) * a; c[2] += (k[2] - c[2]) * a; };

/**
 * The regions of the fins for the checks (round T2; paintFinAtlas o.labels → out.label, finLabelRGBA): 1 D1 proximal
 * half, 2 D1 distal half, 3 D2 mid, 4 D2's band, 5 D2's base, 6 anal, 7 caudal, 8 the caudal's sheath, 9 the pectoral
 * blade, 10 its fleshy root, 11 pelvic; 0 outside the fin.
 */
export const FIN_LABELS = { 1: ['D1p', [255, 0, 0]], 2: ['D1d', [255, 0, 128]], 3: ['D2', [0, 255, 0]], 4: ['D2band', [255, 255, 0]], 5: ['D2base', [0, 128, 255]], 6: ['anal', [0, 0, 255]], 7: ['caudal', [255, 0, 255]], 8: ['caudalSheath', [255, 128, 0]], 9: ['pect', [0, 255, 255]], 10: ['pectRoot', [128, 128, 255]], 11: ['pelvic', [128, 255, 0]] };
function finLabel(type, name, tm, solid, al, cov) {
  if (cov < 0.5) return 0;
  if (name === 'Fin_Dorsal1') return tm < 0.5 ? 1 : 2;
  if (name === 'Fin_Dorsal2') return tm >= 0.6 && tm <= 0.86 ? 4 : tm < 0.45 ? 5 : 3;
  if (name === 'Fin_Anal') return 6;
  if (type === 'caudal') return solid > 0.5 ? 8 : 7;
  if (type === 'pectoral') return solid > 0.5 ? 10 : 9;
  if (type === 'pelvic') return 11;
  return 0;
}
/** The label atlas as RGBA8 (A 255 inside a fin): for an unlit, alpha-tested ID render of the fins. */
export function finLabelRGBA(atlas) {
  const N = atlas.size * atlas.size, u8 = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { const L = FIN_LABELS[atlas.label[i]]; if (!L) continue; u8.set(L[1], i * 4); u8[i * 4 + 3] = 255; }
  return u8;
}

/**
 * One texel of a fin: { c: [r, g, b] linear, a: opacity, cov: coverage } at the fractional ray index a and the distance
 * l (HL) up the rays; `fpA` / `fpL` the texel's size in slot units and HL.
 */
function finTexel(F, type, def, a, l, fpA, fpL, P, A, o, LK = FIN_LOOK) {
  const n = F.n, mHero = F.margin(a, false), mFlat = F.margin(a, true), m = Math.max(mHero, mFlat);
  const tm = l / Math.max(1e-4, mHero); // the share of the fin's height (the hero's margin = 1)
  const k0 = Math.max(0, Math.min(n - 2, Math.floor(a))), f = a - k0;
  const sp = F.spacing(k0, l), X = F.across(a, l), Y = l; // HL across and along
  const fp = Math.max(fpL, fpA * sp); // the texel in HL
  const fineK = sstep(0.006, 0.0025, fp); // detail under ~1.5 texels fades to its mean
  const N1 = perlin3(X * 9, Y * 9, 0.5, 61), N2 = perlin3(X * 31, Y * 31, 1.5, 62);
  const R = rayAt(F, a, l, Math.max(0.01, fpA), { branch: type !== 'd1' });
  const c = [0, 0, 0];
  let al = 0, rayC, rayA, sheathK = 0;
  const name = def.name;
  if (name === 'Fin_Dorsal1') {
    // the dark membrane, lighter at the base, darker distally; the narrow pale margin; the rust wash on the front
    c.splice(0, 3, ...P.d1Base);
    mixTo(c, P.d1Membrane, sstep(0.05, 0.4, tm + 0.05 * N1));
    mixTo(c, P.d1Distal, sstep(0.45, 0.9, tm + 0.06 * N1) * 0.85);
    al = lerp(A.d1[0], A.d1[1], sstep(0.3, 0.85, tm));
    const rust = (o.rust ?? 0.5) * sstep(3.2, 1.6, a) * sstep(0.12, 0.3, tm) * sstep(0.9, 0.62, tm) * (0.7 + 0.3 * N1);
    mixTo(c, P.finAccent, rust);
    const mg = sstep(0.9, 0.97, tm + 0.015 * N2);
    mixTo(c, P.d1Margin, mg * 0.85); al = lerp(al, A.d1Margin, mg);
    // (round T2) the rust line on the margin's very edge: what shows along the back when the fin folds edge-up into its
    // groove (behaviour §2.3; seen from above the folded fin is its edge)
    const FL = LK.foldLine;
    mixTo(c, P.finAccent, FL.k * sstep(FL.edge[0], FL.edge[1], tm + 0.01 * N2));
    rayC = P.d1Spine; rayA = A.d1Spine;
  } else if (name === 'Fin_Dorsal2') {
    // margin / dark band / pale mid / the base with its rows of dark dashes between the rays
    const tb = tm + 0.035 * N1 + 0.012 * N2;
    c.splice(0, 3, ...P.d2Base);
    mixTo(c, P.d2Mid, sstep(0.08, 0.22, tb));
    al = A.d2Mid;
    const band = sstep(0.56, 0.62, tb) * sstep(0.9, 0.84, tb) * (o.d2Band ?? 1);
    mixTo(c, P.d2Band, band); al = lerp(al, A.d2Band, band);
    const mg = sstep(0.86, 0.92, tb);
    mixTo(c, P.d2Margin, mg); al = lerp(al, A.d2Margin, mg);
    // the margin's faint orange tinge (A065), and (round T2) its very edge orange: the folded fins' line along the back
    mixTo(c, P.d2Orange, mg * sstep(0.88, 0.96, tm) * 0.35);
    mixTo(c, P.d2Orange, sstep(LK.foldLine.edge[0] - 0.02, LK.foldLine.edge[1] - 0.02, tm + 0.01 * N2) * LK.foldLine.d2);
    // the dashes: two rows (t ≈ 0.38 and 0.15) of short dark marks centred between the rays, along them (A001), each
    // jittered, a few missing
    if (k0 >= 1) {
      let sp2 = 0;
      [[0.38, 0.05], [0.15, 0.04]].forEach(([tr, h], row) => {
        const hh = hash3i(k0, row, 11, 79);
        if ((hh & 255) > 215) return;
        const jt = (((hh >>> 8) & 255) / 255 - 0.5) * 0.06, jf = (((hh >>> 16) & 255) / 255 - 0.5) * 0.12, sz = 0.75 + 0.5 * (((hh >>> 24) & 255) / 255);
        const ex = (f - 0.5 - jf) / (0.15 * sz), ey = (tm - tr - jt) / (h * sz);
        sp2 = Math.max(sp2, sstep(1.15, 0.8, Math.hypot(ex, ey) + 0.15 * N2));
      });
      sp2 *= 0.65 + 0.35 * sat(0.5 + perlin3(X * 40, Y * 40, 3.5, 85));
      mixTo(c, P.d2Spot, sp2 * 0.8); al = lerp(al, A.d2Spot, sp2);
    }
    rayC = P.d2Ray; rayA = A.d2Ray;
  } else if (name === 'Fin_Anal') {
    c.splice(0, 3, ...P.anal);
    al = A.anal * (0.85 + 0.15 * sstep(0.2, 0.9, tm));
    rayC = P.analRay; rayA = A.analRay;
  } else if (type === 'caudal') {
    const r = F.rays[R.k];
    // the fleshy base: the sheath over the principal rays' roots (def.sheath: per principal ray its seam l0 and run
    // len) — opaque, the peduncle's tone with the caudal-base blotch on the middle rays
    const NP = FIN_SCULPT.caudal.procS.length, P1 = FIN_SCULPT.caudal.principal - 1;
    const ap = a - NP; // principal-ray units (0 the dorsal-most)
    const sh = def.sheath?.rays ?? [];
    const kk = Math.max(0, Math.min(P1, Math.round(ap)));
    const sEnd = sh.length ? lerp(sh[Math.max(0, Math.min(P1, Math.floor(ap)))].l0 + 0.55 * sh[Math.max(0, Math.min(P1, Math.floor(ap)))].len, sh[Math.max(0, Math.min(P1, Math.floor(ap) + 1))].l0 + 0.55 * sh[Math.max(0, Math.min(P1, Math.floor(ap) + 1))].len, sat(ap - Math.floor(ap))) : 0.12;
    const u = sat(ap / P1);
    c.splice(0, 3, ...P.caudal);
    mixTo(c, P.caudalDistal, sstep(0.45, 1.0, tm) * 0.6);
    mixTo(c, P.caudalEdge, sstep(0.93, 1.0, tm) * 0.5);
    al = lerp(A.caudal[0], A.caudal[1], sstep(0.2, 0.7, tm));
    // the spot rows (A067, A017): dark spots on the rays every ~0.055 HL, each ray's phase stepped so they line up in
    // oblique bars, jittered along the ray, sized 0.6–1.25, a quarter missing, clustered by a low-frequency mask
    if (r.kind === 'soft') {
      const per = 0.055, ph0 = 0.012 * kk + 0.03;
      const j0 = Math.round((l - ph0) / per);
      let s = 0;
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const hh = hash3i(R.k, j, 5, 71);
        if (j < 1 || (hh & 255) > 190) continue;
        const lc = ph0 + j * per + (((hh >>> 8) & 255) / 255 - 0.5) * 0.35 * per;
        if (lc > r.len * 0.95) continue;
        const sz = 0.6 + 0.65 * (((hh >>> 16) & 255) / 255);
        // (round T2: across in slot units — the spot stays on its ray at any spread; along in HL)
        const ex = R.dA / (LK.caudalSpot.w * sz), ey = (l - lc) / (LK.caudalSpot.h * sz);
        s = Math.max(s, sstep(1.15, 0.8, Math.hypot(ex, ey) + 0.12 * N2));
      }
      s *= sstep(-0.3, 0.25, perlin3(l * 9 - kk * 0.25, kk * 0.21, 0.5, 81)) * (0.55 + 0.45 * sat(0.5 + perlin3(l * 23, kk * 0.6, 2.5, 83)));
      mixTo(c, P.caudalSpot, s * 0.75); al = lerp(al, A.caudalSpot, s * 0.8);
      R.dot = s;
    }
    // the sheath zone (opaque): the body's tone (o.skin at the sheath's point: the pattern's colour runs on from the
    // body over the seam) and its dark blotch on the middle rays, easing into the fin
    if (ap > -1.5 && ap < P1 + 1.5) {
      const shz = sstep(sEnd + 0.06, sEnd - 0.04, l);
      sheathK = shz;
      let bodyC;
      if (o.skin && shz > 0) {
        // (the sheath's point: the principal rays' lines, extrapolated past the outermost by their spacing; on the
        // fish's left face, the sheath's half-thickness out)
        const k1 = Math.max(0, Math.min(P1 - 1, Math.floor(ap))), ff = ap - k1;
        const at = (k) => { const ry = F.rays[NP + k]; return ry.base.map((v, i) => v + ry.dir[i] * l); };
        const pa = at(k1), pb = at(k1 + 1), pt = pa.map((v, i) => v + (pb[i] - v) * ff);
        const hz = sh.length ? 0.6 * sh[Math.max(0, Math.min(P1, Math.round(ap)))].h * sat(1 - (l - sh[0].l0) / Math.max(0.05, sh[0].len)) : 0.01;
        bodyC = o.skin([pt[0] * HL, pt[1] * HL, Math.max(0, hz) * HL], [0, 0, 1]).slice();
      } else {
        bodyC = P.sheath.slice();
        mixTo(bodyC, P.sheathPale, sstep(0.35, 0.95, u) * 0.6);
      }
      const blot = sstep(0.15, 0.35, u) * sstep(0.85, 0.65, u) * (0.75 + 0.25 * N1);
      if (!o.skin) mixTo(bodyC, P.sheathDark, blot * 0.85);
      // (past the sheath the dark basal blotch runs on a little into the membrane)
      const after = sstep(sEnd + 0.1, sEnd, l) * (1 - shz) * blot;
      mixTo(c, P.sheathDark, after * 0.6); al = lerp(al, 0.92, after * 0.6);
      // (round T2: the flesh opaque before its colour shows — A ≥ 0.95 wherever the skin's colour is — so the
      // membrane's light transmission, which stops at A 0.95, never lights the pale skin through: FIN_MATERIAL)
      mixTo(c, bodyC, sstep(0.3, 1, shz)); al = lerp(al, 1, sstep(0, 0.3, shz));
    }
    rayC = P.caudalRay; rayA = A.caudalRay;
    if (r.thick) rayA = Math.min(1, rayA + 0.1);
  } else if (type === 'pectoral') {
    c.splice(0, 3, ...P.pectBlade);
    al = lerp(A.pect[0], A.pect[1], sstep(0.2, 0.8, tm));
    const mg = sstep(LK.pectMargin[0], LK.pectMargin[1], tm + 0.015 * N2);
    mixTo(c, P.pectMargin, mg * 0.8); al = lerp(al, A.pectMargin, mg);
    rayC = P.pectRay; rayA = A.pectRay;
    // the dot lines along the rays (A061): dark dots on each ray every ~0.038 HL from the fleshy root to near the
    // margin, jittered along the ray, sized 0.6–1.15, a few missing
    {
      const r = F.rays[R.k], per = 0.038, ph0 = 0.065 + 0.011 * ((R.k * 7) % 3);
      const j0 = Math.round((l - ph0) / per);
      let s = 0;
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const hh = hash3i(R.k, j, 9, 73);
        if (j < 0 || (hh & 255) > 215) continue;
        const lc = ph0 + j * per + (((hh >>> 8) & 255) / 255 - 0.5) * 0.3 * per;
        if (lc > r.len * 0.88) continue;
        const sz = 0.6 + 0.55 * (((hh >>> 16) & 255) / 255);
        const ex = (R.dA * sp) / (0.0055 * sz), ey = (l - lc) / (0.0085 * sz);
        s = Math.max(s, sstep(1.15, 0.8, Math.hypot(ex, ey) + 0.1 * N2));
      }
      mixTo(c, P.pectDot, s * 0.9); al = lerp(al, A.pectDot, s);
      R.dot = s;
    }
    // the fleshy root (fins.mjs pectoral flesh: held 0.02 HL, easing to the bare ray by 0.12): the lobe's own colour where
    // the arm ends (round T2: o.skin at the rays' roots — the pattern's lobe wash and speckle run on over the wrist; T1 a
    // flat pale ochre), else pectLobe
    const fl = sstep(0.085, 0.03, l + 0.01 * N1);
    if (fl > 0) {
      let rc = P.pectLobe;
      if (o.skin) {
        const k1 = Math.max(0, Math.min(n - 2, Math.floor(a))), ff = sat(a - k1);
        const ra = F.rays[k1].base, rb = F.rays[k1 + 1].base;
        rc = o.skin([0, 1, 2].map((i) => (ra[i] + (rb[i] - ra[i]) * ff) * HL), [0, 0, 1]);
      }
      mixTo(c, rc, sstep(0.3, 1, fl)); al = lerp(al, 1, sstep(0, 0.3, fl)); sheathK = Math.max(sheathK, fl);
    }
  } else if (type === 'pelvic') {
    c.splice(0, 3, ...P.pelvic);
    al = A.pelvic * (0.9 + 0.1 * sstep(0.1, 0.8, tm));
    rayC = P.pelvicRay; rayA = A.pelvicRay;
    // a few dark spots on the inner half (the medial rays, n/2 ± 3) between t 0.2 and 0.7 (round T2: B014's ~0.5 mm
    // spots, T1's 0.1 mm ones did not show)
    const mid = (n - 1) / 2, inner = sstep(3.6, 2.2, Math.abs(a - mid)), PS = LK.pelvicSpot;
    if (inner > 0) {
      const s = dots2(X, Y, PS.cell, PS.r, PS.p, 75, fp) * inner * sstep(0.15, 0.25, tm) * sstep(0.75, 0.6, tm);
      mixTo(c, P.pelvicSpot, s * PS.k); al = lerp(al, A.pelvicSpot, s);
    }
    // the shade under the belly (B014: the pelvic lies in the belly's shadow): darker toward its root
    const sh = lerp(LK.occlusion.pelvic, 1, sstep(0, 0.5, tm));
    c[0] *= sh; c[1] *= sh; c[2] *= sh;
  }
  // (round T2) every fin's root a little shaded (the fin atlas has no occlusion map), not the fleshy parts
  if (type !== 'pelvic') {
    const ro = lerp(1, lerp(LK.occlusion.root, 1, sstep(0, 0.15, tm)), 1 - sheathK);
    c[0] *= ro; c[1] *= ro; c[2] *= ro;
  }
  // the membrane's melanophore stipple (sparse, finer on the pale fins), faded to its mean under ~1.5 texels
  const stD = { d1: 0.55, d2: 0.35, anal: 0.12, caudal: 0.4, pectoral: 0.35, pelvic: 0.12 }[type === 'median' ? (name === 'Fin_Dorsal1' ? 'd1' : name === 'Fin_Dorsal2' ? 'd2' : 'anal') : type] ?? 0.3;
  const st = dots2(X, Y, 0.016, 0.0028, stD, 77, fp);
  mixTo(c, P.stipple, (st * 0.55 * fineK + (1 - fineK) * stD * 0.04) * (1 - sheathK));
  // the ray on top: its colour (the segment joints a little paler), its opacity
  if (rayC && R.d > 0) {
    const rc = rayC.slice();
    // (D2's rays cross its dark band as pale streaks, the band broken into dark panes between them (A001); on the
    // caudal / pectoral a dot on the ray keeps its colour)
    if (name === 'Fin_Dorsal2') mixTo(rc, P.d2Margin, sstep(0.56, 0.62, tm) * sstep(0.9, 0.84, tm) * 0.35);
    mixTo(rc, [rc[0] * 1.25, rc[1] * 1.25, rc[2] * 1.25], R.joint * 0.5 * fineK);
    const k = R.d * (1 - (R.dot ?? 0) * 0.85) * (1 - sheathK);
    mixTo(c, rc, k * (type === 'caudal' && F.rays[R.k].kind === 'proc' ? 0.6 : 1));
    al = lerp(al, Math.max(al, rayA), R.d);
  }
  // coverage: inside the outline (the larger of the hero's and lod1's margins: every tier's geometry is covered),
  // the rays out to their tips; a soft edge one texel wide, the membrane thinning over its last 3 %
  const e = Math.max(fpL, 0.002);
  const covM = sstep(m + e, m - e, l);
  const covR = R.d > 0.05 ? sstep(F.rays[R.k].len + e, F.rays[R.k].len - e, l) * sstep(0.02, 0.3, R.d) : 0;
  const cov = l < 0 ? 1 : Math.max(covM, covR);
  al *= 1 - 0.35 * sstep(0.95, 1.0, tm) * (1 - R.d);
  // (round T2) the bare ray tips past the membrane thinner (the furled blade and D1 read as a rake in T1)
  if (covR > covM) { const Lr = F.rays[R.k].len; al *= 1 - (1 - LK.tips) * (1 - covM) * sstep(m, m + 0.4 * Math.max(1e-4, Lr - m), l); }
  // (a calibration gain on the membrane's colour per fin, o.gain { D1, D2, anal, caudal, pectoral, pelvic }: the checks'
  // tool; the palette holds the result)
  const gk = o.gain?.[name === 'Fin_Dorsal1' ? 'D1' : name === 'Fin_Dorsal2' ? 'D2' : name === 'Fin_Anal' ? 'anal' : type];
  if (gk !== undefined) { const g = gk + (1 - gk) * sheathK; c[0] *= g; c[1] *= g; c[2] *= g; }
  return { c, a: sat(al), cov, label: o.labels ? finLabel(type, def.name, tm, sheathK, al, cov) : 0 };
}

/**
 * Paint the fin atlas.
 * @param size the atlas's side in texels (hero 1024, lod1 512, lod2 256): FIN_ATLAS's px scale by size / 2048
 * @param defs fins.finDefinitions() (each fin once; the pectorals share a rect, the right one reads the left's)
 * @param o { tier ('hero' | 'lod1' | 'lod2': lod2 composites the colour over FIN_PALETTE.lod2Back and makes A the
 *   coverage), skin ((p fish mm, n) → [r, g, b] linear: the body's skin colour — the pattern key's
 *   skinColour(p, n, 'body', ctx).rgb — for the caudal's fleshy base, so the peduncle's pattern runs on over the seam
 *   onto the sheath; without it a flat peduncle tone with the caudal-base blotch), palette / alpha ({ key: value }
 *   overrides of FIN_PALETTE / FIN_ALPHA), rust (D1's front wash, 0..1, default 0.5), d2Band (0..1), ss (supersamples
 *   per side, default by size), log }
 * @returns { size, rgba: Float32Array (size² × 4: linear RGB, A opacity × coverage), coverage: Float32Array (size²),
 *   mask: Uint8Array (size²: 1 + the fin's index in defs where a rect was painted) }
 */
export function paintFinAtlas(size, defs, o = {}) {
  const P = Object.fromEntries(Object.entries({ ...FIN_PALETTE, ...(o.palette ?? {}) }).map(([k, h]) => [k, hexLinear(h)]));
  const A = { ...FIN_ALPHA, ...(o.alpha ?? {}) };
  const LK = Object.fromEntries(Object.entries(FIN_LOOK).map(([k, v]) => [k, o.look?.[k] === undefined ? v : typeof v === 'object' && !Array.isArray(v) ? { ...v, ...o.look[k] } : o.look[k]]));
  const S = size, sc = S / ATLAS, N = S * S;
  const out = { size: S, rgba: new Float32Array(N * 4), coverage: new Float32Array(N), mask: new Uint8Array(N), ...(o.labels ? { label: new Uint8Array(N) } : {}) };
  const ss = o.ss ?? (S >= 1024 ? 2 : S >= 512 ? 3 : 4);
  const far = o.tier === 'lod2';
  const done = new Set();
  defs.forEach((def, di) => {
    const key = def.rect.join(',');
    if (done.has(key)) return;
    done.add(key);
    const F = finFrame(def), [rx, ry, rw, rh] = def.rect, I = F.inset;
    const type = def.type === 'median' ? 'median' : def.type;
    o.log?.(`fin atlas: ${def.name} (${F.n} rays, Lmax ${(F.Lmax * HL).toFixed(2)} mm, inset ${I})`);
    const x0 = Math.floor(rx * sc), x1 = Math.ceil((rx + rw) * sc), y0 = Math.floor(ry * sc), y1 = Math.ceil((ry + rh) * sc);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const acc = [0, 0, 0, 0];
        let cv = 0;
        for (let sy = 0; sy < ss; sy++)
          for (let sx = 0; sx < ss; sx++) {
            const X = (px + (sx + 0.5) / ss) / sc, Y = (py + (sy + 0.5) / ss) / sc; // 2048-atlas px
            const U = (X - rx - I) / (rw - 2 * I), V = (Y - ry - I) / (rh - 2 * I);
            const a = F.aOfU(U), l = V * F.Lmax;
            // the texel's size in slot units and in HL
            const k = Math.max(0, Math.min(F.n - 2, Math.floor(a)));
            const du = (F.src._uv.rays[k + 1] - F.src._uv.rays[k]) * (rw - 2 * I) * sc; // texels per slot here
            const fpA = 1 / Math.max(1e-3, du), fpL = F.Lmax / ((rh - 2 * I) * sc);
            const q = finTexel(F, type, F.src, a, l, fpA, fpL, P, A, o, LK);
            if (o.labels && sy === ss >> 1 && sx === ss >> 1) out.label[py * S + px] = q.label;
            let c = q.c, al = q.a * q.cov;
            if (far) {
              // the BLEND look over the mid background, alpha the coverage where the fin is ≥ ~15 % opaque (round T2
              // tested leaving the clear membranes — the blade, the anal, under 50 % — out of the cards: the far pectoral
              // then read worse against the hero, dE 6.1 → 8.0 at the 3/4 camera; kept)
              c = [0, 1, 2].map((i) => P.lod2Back[i] + (q.c[i] - P.lod2Back[i]) * q.a);
              al = q.cov * sstep(0.1, 0.2, q.a);
            }
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += al; cv += q.cov;
          }
        const kk = 1 / (ss * ss), i = py * S + px;
        out.rgba[i * 4] = acc[0] * kk; out.rgba[i * 4 + 1] = acc[1] * kk; out.rgba[i * 4 + 2] = acc[2] * kk; out.rgba[i * 4 + 3] = acc[3] * kk;
        out.coverage[i] = cv * kk; out.mask[i] = 1 + di;
      }
  });
  // (texels no rect covers — the old iris corner, the gutters' last pixels: the mean fin colour, A 0)
  let m = [0, 0, 0], cnt = 0;
  for (let i = 0; i < N; i++) if (out.mask[i]) { m[0] += out.rgba[i * 4]; m[1] += out.rgba[i * 4 + 1]; m[2] += out.rgba[i * 4 + 2]; cnt++; }
  m = m.map((v) => v / Math.max(1, cnt));
  for (let i = 0; i < N; i++) if (!out.mask[i]) { out.rgba[i * 4] = m[0]; out.rgba[i * 4 + 1] = m[1]; out.rgba[i * 4 + 2] = m[2]; out.rgba[i * 4 + 3] = 0; }
  return out;
}

/** The atlas as 8-bit RGBA (sRGB colour, linear alpha), for a PNG / the packer. */
export function finAtlasRGBA8(atlas) {
  const N = atlas.size * atlas.size, u8 = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) u8[i * 4 + c] = Math.round(255 * l2s(sat(atlas.rgba[i * 4 + c])));
    u8[i * 4 + 3] = Math.round(255 * sat(atlas.rgba[i * 4 + 3]));
  }
  return u8;
}
