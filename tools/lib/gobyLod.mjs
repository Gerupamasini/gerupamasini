// The goby GLBs' tiers (hero, lod1 near, lod2 far) within the model budget (docs/quality/model-budget.md,
// tools/models/budget.json), shared by the マハゼ, エドハゼ and ヒメハゼ builders:
//  - the body carries one albedo without the melanin (bodyA, alpha: the xanthophores, or on lod2 the melanin) and, on
//    lod1, one data map with the melanin of each pattern in its own channel and the iridophores in alpha (bodyB). The
//    game darkens the albedo by the melanin of the individual's pattern and colour morph and filters the light through
//    the same pigments (src/creatures/species/mahaze/bodyTranslucency.ts), so the patterns and colours share the maps
//    and the material instead of a texture set and a material each
//  - the hero's snout cap is one map of three panels (albedo and roughness, the melanin of every pattern and the
//    iridophores, the xanthophores); its fins carry their relief (normal, ray density, coverage) and their pigments
//    (the melanin of every pattern, the iridophores) in two data maps beside the colour atlas
//  - the eye's iris sits in the free corner of the fin atlas: one map for the fins and the eyes
//  - lod2 keeps only the joints a fish that small shows (body, tail, fins); the jaws, gill covers and eyes follow the head
import { clamp } from './noise.mjs';

/** where the iris goes in the fin atlas (pixels of the full 2048 atlas: the corner no fin uses) */
export const IRIS_RECT = { x: 1024, y: 1536, w: 512, h: 512 };
/** … as a UV rectangle (x, y, width, height) for the hero's eye shader, which maps its own iris coordinates */
export const irisRectUV = (ATLAS) => [IRIS_RECT.x / ATLAS, IRIS_RECT.y / ATLAS, IRIS_RECT.w / ATLAS, IRIS_RECT.h / ATLAS];

/** the joints a far fish keeps (the rest follow their nearest kept ancestor) */
export const LOD2_JOINTS = {
  // 14: no jaws, suspensoria, hyoid, gill covers or eyes
  L: ['J_root', 'J_head', 'J_pecL', 'J_pecR', 'J_pelvic', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2'],
  // 12: the pectoral fins follow the trunk too (their fold and flex are morph targets)
  M: ['J_root', 'J_head', 'J_pelvic', 'J_sp1', 'J_sp2', 'J_sp3', 'J_sp4', 'J_sp5', 'J_sp6', 'J_sp7', 'J_caudal', 'J_caudal2'],
};

/**
 * The distance tiers' melanin goes into the maps as the darkening it gives the albedo, exp(−mel · k) with the bake's own
 * coefficient k (the green one of melRGB), sRGB-encoded: a texture filter then averages darkening (the GPU decodes an
 * sRGB map before it filters), as it did when the melanin was baked into the albedo, not densities (an average density
 * darkens far more than the dots it averages: the melanophores would look bolder, a mipmapped fish darker); and the
 * darkest dots keep their precision through the block compression (the shader takes the density back out with a
 * logarithm, which would blow up a small error near 0). The hero keeps densities (melanin: 'density'): its shader
 * filters the light through the skin by the density, as before, and averages the albedo's darkening itself (four taps).
 */
const srgb8 = (c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
export function encodeMelanin(mel, k) {
  const out = new Uint8Array(mel.length);
  for (let i = 0; i < mel.length; i++) out[i] = srgb8(Math.exp((-mel[i] / 255) * k));
  return out;
}

/** a one-channel map softened by a [1 2 1] / 4 kernel (wrapping round the body in v, clamped along it in u) */
function soften3(src, w, h) {
  const tmp = new Float32Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
      tmp[y * w + x] = (src[y * w + xm] + 2 * src[y * w + x] + src[y * w + xp]) / 4;
    }
  for (let y = 0; y < h; y++) {
    const ym = (y - 1 + h) % h, yp = (y + 1) % h;
    for (let x = 0; x < w; x++) out[y * w + x] = Math.round((tmp[ym * w + x] + 2 * tmp[y * w + x] + tmp[yp * w + x]) / 4);
  }
  return out;
}

/**
 * The packed body maps of a growth stage's tier from the bakes (one per pattern, each with its `lod` maps; w × h texels).
 * bodyA: RGB albedo without the melanin (sRGB), A the xanthophores (hero, lod1) or the first pattern's melanin (lod2).
 * bodyB (hero, lod1): RGB the melanin of patterns 1…3 (a species with one pattern repeats it), A the iridophores.
 * The distance tiers store the melanin as its darkening (encodeMelanin, k: the green coefficient of the bake's
 * darkening): bodyB is a colour (sRGB) map for the GPU to decode, so its filter averages the darkening as the albedo's
 * did when the melanin was baked into it; bodyA's alpha is decoded by the shader. The hero (`density`) stores the
 * density: its translucency filters the density as before, and its shader averages the darkening over finer taps.
 * bodyB's melanin is softened by a texel: single melanophore texels are below what the near tier shows (it is drawn from
 * its smaller mipmaps), three channels of such speckle do not survive the block compression (tools/models/pack), and the
 * hero's melanophores keep the size and the softness they had in its JPEG albedo.
 */
export function packBodyMaps(bakes, far, w, h, k, density = false) {
  const L0 = bakes[0].lod;
  const enc = (m) => (density ? m : encodeMelanin(m, k));
  const mel0 = enc(L0.mel);
  const n = L0.mel.length;
  const A = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    A[i * 4] = L0.albedo[i * 3]; A[i * 4 + 1] = L0.albedo[i * 3 + 1]; A[i * 4 + 2] = L0.albedo[i * 3 + 2];
    A[i * 4 + 3] = far ? mel0[i] : L0.xan[i];
  }
  if (far) return { A, B: null };
  const mels = bakes.map((b) => soften3(enc(b.lod.mel), w, h));
  const B = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) B[i * 4 + c] = mels[Math.min(c, mels.length - 1)][i];
    B[i * 4 + 3] = L0.iri[i];
  }
  return { A, B };
}

/** mean iridophore and xanthophore densities (0…1): the far tier's pigment filter has no map for them */
export function meanPigments(bake) {
  const { iri, xan } = bake.lod;
  let si = 0, sx = 0;
  for (let i = 0; i < iri.length; i++) { si += iri[i]; sx += xan[i]; }
  return { iri: si / iri.length / 255, xan: sx / xan.length / 255 };
}

/** Paint the iris (rgb, size²) into the fin atlas (RGBA, `size`² of the full `ATLAS`²), opaque, at IRIS_RECT. */
export function insetIris(atlas, iris, ATLAS) {
  const k = atlas.w / ATLAS;
  const x0 = Math.round(IRIS_RECT.x * k), y0 = Math.round(IRIS_RECT.y * k), w = Math.round(IRIS_RECT.w * k);
  if (iris.size !== w) throw new Error(`iris ${iris.size} px, its place in the atlas ${w} px`);
  const out = atlas.data.slice();
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const o = ((y0 + y) * atlas.w + x0 + x) * 4, i = (y * w + x) * 3;
      out[o] = iris.rgb[i]; out[o + 1] = iris.rgb[i + 1]; out[o + 2] = iris.rgb[i + 2]; out[o + 3] = 255;
    }
  return { ...atlas, data: out };
}

/** the eye mesh's iris UVs ([0, 1]²) moved to the iris in the fin atlas */
export function eyeUvToAtlas(uv, ATLAS) {
  const out = new Float32Array(uv.length);
  for (let i = 0; i < uv.length; i += 2) {
    out[i] = (IRIS_RECT.x + uv[i] * IRIS_RECT.w) / ATLAS;
    out[i + 1] = (IRIS_RECT.y + uv[i + 1] * IRIS_RECT.h) / ATLAS;
  }
  return out;
}

/** the snout cap's panels: each `size`² with a `gutter` of repeated edge texels round it, side by side */
export const CAP_GUTTER = 8;
/**
 * The hero's snout cap in one map (one cap bake per pattern: { size, albedoNoMel RGBA (sRGB-encoded, roughness in
 * alpha), pigment RGB (melanin, iridophores, xanthophores) }), three panels side by side, stored as data (the shader
 * decodes the albedo panel's sRGB itself):
 *   0: albedo without the melanin (rgb, sRGB-encoded), roughness (a)
 *   1: melanin of patterns 1…3 (rgb, densities or sRGB-encoded darkening: encodeMelanin; one pattern repeats it), iridophores (a)
 *   2: xanthophores (r)
 */
export function packCap(caps, k, density = false) {
  const S = caps[0].size, G = CAP_GUTTER, P = S + 2 * G, W = P * 3;
  const data = new Uint8Array(W * P * 4);
  const dark = (m) => (density ? m : srgb8(Math.exp((-m / 255) * k)));
  const pig = (p, i, c) => caps[Math.min(p, caps.length - 1)].pigment[i * 3 + c];
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const sx = Math.min(S - 1, Math.max(0, x - G)), sy = Math.min(S - 1, Math.max(0, y - G)), i = sy * S + sx;
      const panel = [
        [caps[0].albedoNoMel[i * 4], caps[0].albedoNoMel[i * 4 + 1], caps[0].albedoNoMel[i * 4 + 2], caps[0].albedoNoMel[i * 4 + 3]],
        [dark(pig(0, i, 0)), dark(pig(1, i, 0)), dark(pig(2, i, 0)), pig(0, i, 1)],
        [pig(0, i, 2), 0, 0, 255],
      ];
      panel.forEach((px, k) => data.set(px, (y * W + k * P + x) * 4));
    }
  return { w: W, h: P, data, panels: { count: 3, size: S, gutter: G } };
}

/**
 * The hero's fin data maps from the fin atlases (one per pattern: color RGBA, normal RGB, data RGBA = ray density,
 * melanin, iridophores, coverage):
 *   relief: normal x, y (z is rebuilt), ray density, coverage
 *   pigment: melanin of patterns 1…3 (one pattern repeats it), iridophores
 * The colour atlas stays the first pattern's (its melanin included, for the standard material); the hero's fin shader
 * takes that melanin out and puts the individual's pattern's in.
 */
export function finHeroMaps(atlases, n) {
  const relief = new Uint8Array(n * 4), pigment = new Uint8Array(n * 4);
  const a0 = atlases[0];
  for (let i = 0; i < n; i++) {
    relief[i * 4] = a0.normal[i * 3]; relief[i * 4 + 1] = a0.normal[i * 3 + 1];
    relief[i * 4 + 2] = a0.data[i * 4]; relief[i * 4 + 3] = a0.data[i * 4 + 3];
    for (let c = 0; c < 3; c++) pigment[i * 4 + c] = atlases[Math.min(c, atlases.length - 1)].data[i * 4 + 1];
    pigment[i * 4 + 3] = a0.data[i * 4 + 2];
  }
  return { relief, pigment };
}

/** Which joints a tier keeps: `keep` (names) of `JOINTS` ({ name, parent }); every other one maps onto its nearest kept ancestor. */
export function collapseJoints(JOINTS, keep) {
  const index = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));
  const kept = JOINTS.map((j, i) => i).filter((i) => keep.includes(JOINTS[i].name));
  const map = JOINTS.map((j) => {
    let k = j;
    while (k && !keep.includes(k.name)) k = k.parent ? JOINTS[index[k.parent]] : null;
    if (!k) throw new Error(`joint ${j.name}: no kept ancestor`);
    return kept.indexOf(index[k.name]);
  });
  return { kept, map };
}

/** skin weights ({ joints, weights }: 4 Uint8 each, weights summing to 255) onto the kept joints */
export function remapWeights(w, map) {
  const n = w.joints.length / 4;
  const joints = new Uint8Array(n * 4), weights = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    const m = new Map();
    for (let k = 0; k < 4; k++) {
      const q = w.weights[v * 4 + k];
      if (q > 0) { const j = map[w.joints[v * 4 + k]]; m.set(j, (m.get(j) || 0) + q); }
    }
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
    arr.forEach(([j, q], k) => { joints[v * 4 + k] = j; weights[v * 4 + k] = q; });
  }
  return { joints, weights };
}

/**
 * What the game needs to make an individual's pattern and colour from the packed maps (body extras `lod`).
 *   variants: how many the hero has (pattern-major: variant i is pattern ⌊i / colours⌋ + 1 in colour i mod colours + 1)
 *   patternChannels: the patterns the maps hold (lod2: 1); melRGB: the melanin's darkening of the albedo per unit
 *   (exp(−mel · melRGB), as the bake applies it); far: the far tier's mean iridophores and xanthophores
 *   morphs (マハゼ): per colour the tissue colours (flank, back, belly), the melanophore factor and dusky layer, the
 *   xanthophore and iridophore factors and the fins' tint and melanophore factor; bellyRamp: the belly's height ramp (hn)
 */
export function lodExtras({ patterns = 1, colours = null, far, melRGB, bellyRamp = null, pigments, density = false }) {
  const morphs = colours?.map((c) => ({
    name: c.name, base: c.base, dors: c.dors, belly: c.belly, melK: c.melK, melAdd: c.melAdd, xanK: c.xanK, iriK: c.iriK, finTint: c.fin.tint, finMelK: c.fin.melK,
  })) ?? null;
  return {
    packing: 1,
    variants: patterns * (morphs?.length ?? 1),
    colours: morphs?.length ?? 1,
    patternChannels: far ? 1 : patterns,
    melRGB,
    // how the maps hold the melanin: its density (the hero) or its sRGB-encoded darkening (see encodeMelanin)
    melanin: density ? 'density' : 'darkening',
    ...(morphs ? { morphs, bellyRamp } : {}),
    ...(far ? { far: { iri: +pigments.iri.toFixed(3), xan: +clamp(pigments.xan).toFixed(3) } } : {}),
  };
}
