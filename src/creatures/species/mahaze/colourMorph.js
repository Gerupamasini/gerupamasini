// The マハゼ's nine looks (three patterns × three colour morphs) from one set of maps. The budget-sized GLBs ship the
// standard colour's ground without its melanophores, every pattern's melanophores in a channel of their own, the
// iridophores and xanthophores, and a table of the colour morphs in the body's extras (`morphs`, written by
// tools/models/mahaze/body.mjs morphTable()); each fish's colour is rebuilt per pixel as the build tool's shadeAt()
// baked it (its reference: rebuildMorph() there):
//   ground   the standard's flank / back / belly tissue, xanthophore tint and iridophore sheen, with the lips, the
//            throat's blood and the shading baked in (sRGB, the colour map's rgb)
//   morph    the ground's tissue swapped for the morph's: × (morph tissue / standard tissue) at the pixel's height
//            in the section, the xanthophores and iridophores scaled by the morph
//   melanin  the pattern's melanophores (one channel of the pigment map, picked by uGbMorphPattern), as an optical
//            depth scaled by the morph, plus its dusky layer over the back and flanks
// The fins keep one atlas: the morph tints them (the material's colour) and scales their melanophores (the hero).
// Used by the field material (bodyTranslucency.ts) and the observed hero's volumetric one (hero/BodyMaterial.js).
import { Vector3, Vector4 } from 'three';

export const morphGLSL = /* glsl */ `
uniform vec3 uGbMorphPattern;   // which of the pigment map's rgb channels holds this fish's pattern (one-hot)
uniform vec3 uGbMorphStd[3];    // the standard colour's tissue (the ground's): flank, back, belly (linear)
uniform vec3 uGbMorphCol[3];    // this fish's colour morph's
uniform vec4 uGbMorphK;         // the morph's melanophore factor, dusky layer, xanthophore and iridophore factors
uniform vec4 uGbMorphHn;        // the back's ramp over the height in the section (x → y), the belly's (z → w)
float gbMorphRamp(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
// the pattern's melanophores, scaled by the morph (its dusky layer stays off the belly)
float gbMorphMel(vec3 mel3, float hn) {
  float belly = gbMorphRamp(uGbMorphHn.z, uGbMorphHn.w, hn);
  return 1.0 - pow(1.0 - clamp(dot(mel3, uGbMorphPattern), 0.0, 1.0), uGbMorphK.x) * (1.0 - uGbMorphK.y * (1.0 - belly));
}
// the skin's pigment as the light passes it: melanophores, iridophores, xanthophores
vec3 gbMorphPig(vec3 mel3, float iri, float xan, float hn) {
  return vec3(gbMorphMel(mel3, hn), clamp(iri * uGbMorphK.w, 0.0, 1.0), clamp(xan * uGbMorphK.z, 0.0, 1.0));
}
// the fish's albedo (linear) from the standard's ground (linear), at the height hn
vec3 gbMorphAlbedo(vec3 ground, vec3 mel3, float iri, float xan, float hn) {
  float dorsal = gbMorphRamp(uGbMorphHn.x, uGbMorphHn.y, hn);
  float belly = gbMorphRamp(uGbMorphHn.z, uGbMorphHn.w, hn);
  vec3 gs = mix(mix(uGbMorphStd[0], uGbMorphStd[1], 0.6 * dorsal), uGbMorphStd[2], belly);
  vec3 gc = mix(mix(uGbMorphCol[0], uGbMorphCol[1], 0.6 * dorsal), uGbMorphCol[2], belly);
  float ic = clamp(iri * uGbMorphK.w, 0.0, 1.0), xc = xan * uGbMorphK.z;
  const vec3 XT = vec3(0.012, -0.06, -0.27);  // the xanthophores' tint of the tissue
  const vec3 CI = vec3(0.78, 0.77, 0.7);      // the iridophores' pale sheen
  vec3 vs = mix(gs * (1.0 + XT * xan), CI, 0.4 * iri);
  vec3 vc = mix(gc * (1.0 + XT * xc), CI, 0.4 * ic);
  return ground * vc / max(vs, vec3(1e-3)) * exp(-1.6 * gbMorphMel(mel3, hn) * vec3(2.0, 2.15, 2.35));
}
`;

/**
 * The morph uniforms of one look: `morphs` is the body's extras table, `pick` the fish's pattern and colour (0-based;
 * absent: the first pattern in the standard colour, which the maps hold as baked).
 */
export function morphUniforms(morphs, pick) {
  const p = pick?.pattern ?? 0, c = pick?.color ?? 0;
  const S = morphs.colors[0], C = morphs.colors[c] ?? S;
  const v3 = (a) => new Vector3(a[0], a[1], a[2]);
  return {
    uGbMorphPattern: { value: new Vector3(p === 0 ? 1 : 0, p === 1 ? 1 : 0, p === 2 ? 1 : 0) },
    uGbMorphStd: { value: [v3(S.base), v3(S.dors), v3(S.belly)] },
    uGbMorphCol: { value: [v3(C.base), v3(C.dors), v3(C.belly)] },
    uGbMorphK: { value: new Vector4(C.melK, C.melAdd, C.xanK, C.iriK) },
    uGbMorphHn: { value: new Vector4(morphs.hn.dorsal[0], morphs.hn.dorsal[1], morphs.hn.belly[0], morphs.hn.belly[1]) },
  };
}

/** How many looks a table holds, and which pattern and colour the look `v` (any integer, taken modulo) is. */
export function morphCount(morphs) {
  return morphs.patterns.length * morphs.colors.length;
}
export function morphPick(morphs, v) {
  const n = morphCount(morphs);
  const k = ((Math.floor(v) % n) + n) % n;
  // (the order of the glTF variants the files carried before: patterns outer, colours inner)
  return { pattern: Math.floor(k / morphs.colors.length), color: k % morphs.colors.length };
}
