import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { DORSAL, EYE, MODEL_TL, S_CAUDAL, S_EYE, S_HEAD, S_PIVOT, S_SNOUT } from './anatomy';

const f = (x: number): string => x.toFixed(5);

/**
 * The ヨウジウオ's materials: standard PBR (MeshPhysicalMaterial: roughness, a thin uneven clearcoat for the mucus,
 * thin-film iridescence for the iridophores, metalness for their mirror) with the skin, the armour, the eye, the
 * viscera seen through the belly wall and the underwater light worked in through onBeforeCompile. One program per
 * tier is shared by every fish; each fish has its own material objects (its own colours: the species is very
 * variable, and a fish living in the eelgrass is greener).
 *
 * The skin is built in layers like a real fish's, not painted on (see BODY_SURFACE): pigment cells laid out in true
 * arc length over the polygonal section (xanthophore ground, clustered melanophores of two sizes, raised white
 * leucophore granules, erythrophore hatching across the rings, an iridophore sheen), over bony plates with fine
 * grain, ridges and faint joints; the mucus a thin, uneven gloss whose highlights only half follow the relief.
 * Subsurface scattering is approximated by wrapped, tissue-tinted light and light through the thin parts (snout,
 * tail, fins, the belly wall, behind which the gut, the liver and the swim bladder show as soft shapes).
 *
 * Under water: the indirect light is the light field of the 走水 shallows (the sky squeezed into Snell's window above,
 * the blue-green glow of the water to the sides, greener inside the eelgrass, the sunlit sand below) and the ripples'
 * caustics play over the back.
 */

export const YJ_UNIFORMS = {
  uYjTime: { value: 0 } as IUniform<number>,
  /** the glow of the water at full daylight (the 走水 water pass's colour) */
  uYjWater: { value: new Color(0.085, 0.15, 0.145) } as IUniform<Color>,
  uYjSand: { value: new Color(0.36, 0.3, 0.2) } as IUniform<Color>,
  uYjSkyGain: { value: 0.35 } as IUniform<number>,
  uYjCaustic: { value: 0.5 } as IUniform<number>,
  /** 1: lit as in a photograph in a clear case (the reference viewer's studio); 0 under water */
  uYjAir: { value: 0 } as IUniform<number>,
};

/** One individual's look. */
export interface Look {
  base: Color; dark: Color; pale: Color; belly: Color;
  /** the erythrophores' orange-brown (the hatching on the lower flank) */
  accent: Color;
  /** banding, white spots, ocelli ladder, mottling 0..1 */
  band: number; dots: number; ocelli: number; mottle: number;
  /** orange hatching, melanophore pepper, silver-gold sheen, belly translucency 0..1 */
  streak: number; pepper: number; sheen: number; translucency: number;
  /** paler, translucent snout; white granules 0..1 */
  snout: number; granules: number;
  seed: number;
}

const c = (r: number, g: number, b: number) => new Color(r, g, b);
/** The colour morphs seen in the photographs (linear RGB). */
export const MORPHS: readonly Omit<Look, 'seed'>[] = [
  // olive-brown, mottled, peppered, white granules (the commonest)
  { base: c(0.17, 0.12, 0.045), dark: c(0.04, 0.028, 0.012), pale: c(0.7, 0.64, 0.48), belly: c(0.62, 0.55, 0.34), accent: c(0.3, 0.1, 0.03), band: 0.35, dots: 0.6, ocelli: 0.15, mottle: 0.7, streak: 0.35, pepper: 0.9, sheen: 0.35, translucency: 0.5, snout: 0.3, granules: 0.7 },
  // green: the eelgrass fish (yellow-green with a darker back)
  { base: c(0.22, 0.27, 0.045), dark: c(0.05, 0.07, 0.012), pale: c(0.62, 0.68, 0.36), belly: c(0.55, 0.6, 0.25), accent: c(0.28, 0.2, 0.03), band: 0.15, dots: 0.4, ocelli: 0.1, mottle: 0.5, streak: 0.2, pepper: 0.7, sheen: 0.3, translucency: 0.55, snout: 0.45, granules: 0.6 },
  // dark brown, banded
  { base: c(0.08, 0.05, 0.022), dark: c(0.016, 0.011, 0.006), pale: c(0.5, 0.45, 0.34), belly: c(0.42, 0.34, 0.2), accent: c(0.16, 0.06, 0.02), band: 0.9, dots: 0.5, ocelli: 0, mottle: 0.6, streak: 0.15, pepper: 1, sheen: 0.2, translucency: 0.35, snout: 0.15, granules: 0.5 },
  // golden yellow with orange-brown hatching low on the trunk and a pale snout (a live fish in eelgrass)
  { base: c(0.5, 0.38, 0.07), dark: c(0.16, 0.07, 0.015), pale: c(0.85, 0.8, 0.55), belly: c(0.72, 0.62, 0.28), accent: c(0.42, 0.12, 0.02), band: 0.1, dots: 0.7, ocelli: 0, mottle: 0.35, streak: 1, pepper: 0.45, sheen: 0.25, translucency: 0.7, snout: 0.65, granules: 1 },
  // silvery tan, densely peppered, a gold-silver sheen along the trunk (a fresh specimen)
  { base: c(0.24, 0.2, 0.12), dark: c(0.045, 0.032, 0.016), pale: c(0.7, 0.67, 0.55), belly: c(0.54, 0.5, 0.36), accent: c(0.25, 0.12, 0.05), band: 0.2, dots: 0.3, ocelli: 0.1, mottle: 0.4, streak: 0.1, pepper: 1, sheen: 0.85, translucency: 0.55, snout: 0.35, granules: 0.5 },
  // reddish brown with white spots
  { base: c(0.24, 0.09, 0.035), dark: c(0.07, 0.025, 0.01), pale: c(0.72, 0.64, 0.5), belly: c(0.62, 0.5, 0.3), accent: c(0.36, 0.1, 0.03), band: 0.3, dots: 1, ocelli: 0.15, mottle: 0.7, streak: 0.3, pepper: 0.8, sheen: 0.3, translucency: 0.5, snout: 0.3, granules: 0.8 },
  // pale tan with a ladder of ocelli
  { base: c(0.3, 0.21, 0.11), dark: c(0.1, 0.06, 0.025), pale: c(0.72, 0.66, 0.52), belly: c(0.7, 0.64, 0.48), accent: c(0.3, 0.14, 0.05), band: 0.2, dots: 0.6, ocelli: 0.95, mottle: 0.5, streak: 0.2, pepper: 0.7, sheen: 0.4, translucency: 0.6, snout: 0.5, granules: 0.7 },
];
export const GREEN_MORPH = 1;
export const GOLDEN_MORPH = 3;
export const SILVER_MORPH = 4;

// ------------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
attribute vec3 aBody;
attribute vec2 aPat;
attribute float aPart;
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
varying vec3 vWPos;
varying vec3 vRest;
varying vec3 vRestN;
`;
const FIN_VERT_PARS = /* glsl */ `
attribute vec3 aFin;
attribute float aRay;
varying vec3 vFin;
varying float vRay;
varying vec3 vWPos;
`;

const HELPERS = /* glsl */ `
uniform float uYjTime;
uniform vec3 uYjWater;
uniform vec3 uYjSand;
uniform float uYjSkyGain;
uniform float uYjCaustic;
uniform float uYjAir;
uniform float uCover;
varying vec3 vWPos;

float yjHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float yjNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(yjHash(i), yjHash(i + vec2(1.0, 0.0)), f.x), mix(yjHash(i + vec2(0.0, 1.0)), yjHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float yjFbm(vec2 p) { return 0.55 * yjNoise(p) + 0.3 * yjNoise(p * 2.03 + 7.1) + 0.15 * yjNoise(p * 4.1 + 3.3); }

vec3 yjSunDir() {
#if NUM_DIR_LIGHTS > 0
  return normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
#else
  return vec3(0.3, 0.9, 0.3);
#endif
}
vec3 yjSunCol() {
#if NUM_DIR_LIGHTS > 0
  return directionalLights[0].color;
#else
  return vec3(1.0);
#endif
}
vec3 yjSky() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].skyColor;
#else
  return ambientLightColor;
#endif
}
vec3 yjGround() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].groundColor;
#else
  return ambientLightColor * 0.5;
#endif
}
// the water's own glow (in-scattered daylight), greener in the eelgrass where the light comes through the blades
vec3 yjGlow() {
  float lum = dot(yjSky(), vec3(0.2126, 0.7152, 0.0722));
  vec3 g = uYjWater * mix(vec3(1.0), vec3(0.78, 1.12, 0.5), uCover * 0.8);
  return g * (0.06 + 0.94 * clamp((lum - 0.042) / 0.158, 0.0, 1.25));
}
vec3 yjWindow(vec3 d, float rough) {
  vec2 h = d.xz * 1.333;
  float hl = length(h);
  vec3 a = hl < 0.995 ? vec3(h.x, sqrt(1.0 - hl * hl), h.y) : normalize(vec3(h.x, 0.1, h.y));
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  return min(textureCubeUV(envMap, envMapRotation * a, max(rough, 0.04)).rgb, vec3(4.0)) * uYjSkyGain;
#else
  return yjSky() * 2.2 + yjSunCol() * 0.15;
#endif
}
// radiance from direction d at a fish in the shallows: Snell's window over the glow of the water, the sand below
vec3 yjUnderwater(vec3 d, float rough) {
  vec3 glow = yjGlow();
  float up = d.y;
  float w = smoothstep(0.6 - rough * 0.3, 0.74 + rough * 0.08, up);
  vec3 L = yjSunDir();
  vec3 bed = uYjSand * (yjSunCol() * max(L.y, 0.0) * 0.85 + yjSky() * 0.6 + yjGround() * 0.4) * RECIPROCAL_PI;
  // in the meadow the bed is shaded by the canopy
  bed *= 1.0 - 0.45 * uCover;
  vec3 c = mix(glow, glow * 1.15, smoothstep(0.05, 0.5, up));
  c = mix(c, mix(glow, bed, 0.6), smoothstep(0.0, -0.45, up));
  c = mix(c, yjWindow(d, rough) * (1.0 - 0.35 * uCover), w);
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  if (uYjAir > 0.0) c = mix(c, textureCubeUV(envMap, envMapRotation * d, max(rough, 0.04)).rgb * uYjSkyGain, uYjAir);
#endif
  return c;
}
float yjCaustic(vec3 p) {
  vec2 q = p.xz * 22.0 + vec2(uYjTime * 0.21, -uYjTime * 0.13);
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    q = mat2(1.6, 1.2, -1.2, 1.6) * q + vec2(uYjTime * (0.35 + 0.2 * fi), uYjTime * 0.27);
    c += abs(sin(q.x + 1.7 * sin(q.y * 0.9 + uYjTime * 0.8)) * sin(q.y + 1.5 * sin(q.x * 1.1 - uYjTime * 0.6)));
  }
  c *= 0.5;
  // the canopy breaks the caustics up and dims them
  return mix(0.62 + 1.25 * pow(1.0 - c, 4.0) * 1.6, 0.85, uCover * 0.6);
}
// bump from a height field h (in metres) by screen-space derivatives (Mikkelsen)
vec3 yjBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

const ENV_INJECT = /* glsl */ `
#include <lights_fragment_maps>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 rW = reflect(vW, nW);
  radiance += yjUnderwater(rW, material.roughness);
  iblIrradiance += PI * yjUnderwater(nW, 1.0) * 0.5;
#ifdef USE_CLEARCOAT
  clearcoatRadiance += yjUnderwater(reflect(vW, inverseTransformDirection(clearcoatNormal, viewMatrix)), material.clearcoatRoughness);
#endif
}
`;
const CAUSTIC_INJECT = /* glsl */ `
#include <lights_fragment_begin>
{
  float upW = inverseTransformDirection(normal, viewMatrix).y;
  float cs = mix(1.0, yjCaustic(vWPos), uYjCaustic * smoothstep(-0.3, 0.5, upW) * (1.0 - uYjAir));
  reflectedLight.directDiffuse *= cs;
  reflectedLight.directSpecular *= cs;
}
`;

const BODY_FRAG_PARS = /* glsl */ `
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uBase;
uniform vec3 uDark;
uniform vec3 uPale;
uniform vec3 uBelly;
uniform vec3 uAccent;
uniform vec4 uPattern;    // band, white spots, ocelli, mottle
uniform vec4 uPattern2;   // orange hatching, melanophore pepper, silver-gold sheen, belly translucency
uniform vec4 uPattern3;   // ivory snout, white granules
uniform float uSeed;
`;

/** functions of the skin, after the helpers */
const BODY_FNS = /* glsl */ `
// A lattice of chromatophores: p in cells, density the share of cells holding one, radii in cells. Each is a
// little star (the cells branch). Where a cell spans a pixel or less the dots give way to their mean cover, so the
// skin does not sparkle at a distance.
float yjDots(vec2 p, float density, float rMin, float rMax, float seed) {
  float rm = 0.5 * (rMin + rMax);
  float mean = density * 3.14159 * rm * rm * 0.55;
  float fw = length(fwidth(p));
  if (fw > 1.6) return mean;
  vec2 i = floor(p), fr = fract(p);
  float c = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = i + o + seed;
      if (yjHash(id + 5.3) > density) continue;
      vec2 at = o + 0.1 + 0.8 * vec2(yjHash(id), yjHash(id + 17.1));
      vec2 dv = fr - at;
      float r = mix(rMin, rMax, yjHash(id + 9.7));
      r *= 1.0 + 0.12 * sin(atan(dv.y, dv.x) * 5.0 + yjHash(id + 3.3) * 6.28) + 0.08 * sin(atan(dv.y, dv.x) * 3.0 + yjHash(id + 8.1) * 6.28);
      c = max(c, smoothstep(r, r * 0.4, length(dv)));
    }
  }
  return mix(c, mean, smoothstep(0.6, 1.6, fw));
}
`;

/**
 * The skin, computed once at the colour stage (and read again by the roughness, metalness, normal, clearcoat,
 * iridescence and emissive stages). From the photographs of live fish and fresh specimens:
 *  - not paint over plastic but layers of pigment cells in a thin, wet, slightly translucent skin over bony plates:
 *    a yellow-olive ground (xanthophores) varying slowly in hue; dense fine melanophores, little branched dots of two
 *    sizes, thick on the back and thin on the belly; white granules (leucophores) scattered over the plates, raised a
 *    little; on the lower trunk flank, orange-brown hatching across each ring (erythrophores); a silver-gold sheen of
 *    iridophores low on the trunk and on the gill cover; dark saddles and bands on some fish, a ladder of ocelli on
 *    others; the pale belly
 *  - the armour: ridges at the section's corners, faint seams at the ring joints, the plates a little convex with fine
 *    radial striae; the granules and striae break the highlights, the mucus is a thin, uneven gloss over it
 *  - the head: an ivory, translucent snout widening to the mouth; the bony rim of the orbit pale and finely striated;
 *    the eye a black pupil in a bright gold ring, olive-brown iris flecked with gold, the dark limbus; the gill cover
 *    with radial ridges and a silver-gold sheen, the gill opening a dark slit
 *  - the belly's thin wall lets the light through and shows the shadows inside: the gut, the liver at the front, the
 *    silvery swim bladder above them (seen a little below the surface)
 * s along the body, φ round it (0 = dorsal midline, toward the left flank), e = φ in edges (ridges at 1, 2, 3 and
 * 5, 6, 7 on the trunk), r the ring coordinate; vRest the rest-pose position in TL units.
 */
const BODY_SURFACE = /* glsl */ `
float yjRough = 0.55, yjCoat = 0.18, yjMetal = 0.0, yjIri = 0.0, yjThin = 0.0, yjH = 0.0, yjSSS = 0.0;
{
  float s = vBody.x, cphi = vBody.y, sphi = vBody.z;
  float phi = atan(sphi, cphi);
  float e = mod(phi / 6.2831853 * 8.0 + 8.0, 8.0);
  float r = vPat.x;
  float body = smoothstep(${f(S_HEAD - 0.004)}, ${f(S_HEAD + 0.006)}, s);
  float head = 1.0 - body;
  float rad = length(vRest.xy);
  vec3 col;
  if (vPart > 0.5 && vPart < 1.5) {
    // ---- the eye
    vec2 q = vPat;
    float rr = length(q);
    float ang = atan(q.y, q.x);
    float pupil = 1.0 - smoothstep(${f(EYE.pupil - 0.025)}, ${f(EYE.pupil + 0.012)}, rr * (1.0 + 0.035 * sin(ang * 2.0 + 0.4)));
    // the iris: fine radial fibres, dark olive-brown (the head's own pigment), a dull bronze below
    float fib = (0.6 + 0.4 * yjNoise(vec2(ang * 22.0, rr * 7.0))) * (0.85 + 0.25 * yjNoise(vec2(ang * 5.0, rr * 2.0) + 4.0));
    vec3 iris = mix(mix(uBase, uDark, 0.6), vec3(0.4, 0.28, 0.08), 0.15 + 0.4 * smoothstep(0.15, -0.35, q.y)) * fib;
    // a thin gold ring round the pupil, sparse gold flecks on the outer iris, its lower part a little paler
    float ring = smoothstep(0.05, 0.0, abs(rr - ${f(EYE.pupil + 0.045)})) * (0.7 + 0.3 * yjNoise(vec2(ang * 12.0, 1.0)));
    iris = mix(iris, vec3(0.72, 0.52, 0.16), ring * 0.75);
    float fl = yjDots(vec2(ang * 7.0, rr * 16.0), 0.4, 0.12, 0.28, 4.0);
    iris = mix(iris, vec3(0.62, 0.46, 0.17), fl * smoothstep(${f(EYE.pupil + 0.1)}, ${f(EYE.pupil + 0.2)}, rr) * 0.5);
    iris = mix(iris, vec3(0.55, 0.43, 0.2), smoothstep(0.0, -0.45, q.y) * smoothstep(${f(EYE.pupil + 0.05)}, ${f(EYE.pupil + 0.15)}, rr) * 0.2);
    // the dark limbus, and the snout's dark line running through the iris
    iris *= mix(1.0, 0.6, smoothstep(0.74, 0.95, rr));
    iris = mix(iris, uDark * 0.4, smoothstep(0.13, 0.05, abs(q.y - 0.02)) * smoothstep(${f(EYE.pupil + 0.12)}, ${f(EYE.pupil + 0.2)}, rr) * 0.75);
    col = mix(iris, vec3(0.003, 0.004, 0.005), pupil);
    // (the cornea against water barely reflects: its index is nearly the water's)
    yjRough = 0.05; yjCoat = mix(0.2, 1.0, uYjAir);
  } else if (vPart > 2.5) {
    // ---- LOD2's painted tail fan
    col = mix(uDark, uAccent, 0.5);
    yjThin = 0.6;
  } else {
    // ---- the armour's shape
    float ridge = 0.0, joint = 0.0, plateH = 0.0;
    float ringId = floor(r);
    float pu = fract(r);
    float relief = 1.0 - smoothstep(0.08, 0.35, fwidth(r));
    if (body > 0.0) {
      float de = min(min(abs(e - 1.0), abs(e - 2.0)), min(abs(e - 3.0), min(abs(e - 5.0), min(abs(e - 6.0), abs(e - 7.0)))));
      float tailK = smoothstep(0.37, 0.44, s);
      float isLat = 1.0 - step(0.5, min(abs(e - 2.0), abs(e - 6.0)));
      ridge = exp(-de * de / 0.008) * (1.0 - isLat * tailK);
      float dj = min(pu, 1.0 - pu);
      // the joint: a fine line, wandering a little in its darkness
      joint = exp(-dj * dj / 0.0012) * relief * (0.6 + 0.4 * yjNoise(vec2(ringId * 3.1, vPat.y * 400.0)));
      float pv = fract(e) - 0.5;
      float pw = pu - 0.5;
      // the bone's surface under the skin: faint, irregular pitting and grain (no regular ornament)
      float grain = yjNoise(vec2(s * 900.0, vPat.y * 900.0)) * 0.6 + yjNoise(vec2(s * 2300.0, vPat.y * 1800.0)) * 0.4;
      plateH = 0.06 * (1.0 - 4.0 * (pv * pv + pw * pw)) + 0.08 * (grain - 0.5) * (1.0 - joint);
    }
    // skin coordinates in TL units, about isotropic (s along, arc length round)
    vec2 sk = vec2(s, vPat.y);
    float dors = smoothstep(-0.55, 0.6, cphi);
    float lowFl = smoothstep(0.3, -0.1, cphi) * smoothstep(-0.92, -0.62, cphi);
    float bellyK = smoothstep(-0.5, -0.8, cphi) * body + smoothstep(-0.3, -0.72, cphi) * head;
    float mott = yjFbm(vec2(s * 60.0, phi * 1.4) * vec2(0.9, 1.2) + uSeed * 13.0);
    float hue = yjFbm(vec2(s * 12.0, phi * 0.7) + uSeed * 5.0);
    // the ground: xanthophore yellow, its hue and depth wandering slowly
    col = mix(uBase, uBase * vec3(1.12, 1.0, 0.78), hue) * (0.8 + 0.4 * mott);
    // dark saddles over the back, bands a few rings wide, mottling
    float saddle = smoothstep(0.5, 0.72, yjFbm(vec2(r * 0.55 + uSeed * 3.0, phi * 0.6 + 2.0)));
    float band = smoothstep(0.42, 0.62, yjNoise(vec2(r * 0.28 + uSeed * 7.0, 0.5))) * uPattern.x;
    col = mix(col, uDark, clamp(smoothstep(0.42, 0.72, mott) * uPattern.w * 0.55 + saddle * uPattern.w * 0.45 + band * 0.7, 0.0, 0.9) * dors);
    // the orange-brown hatching across each ring on the lower trunk flank, and its wash
    float hatch = 0.5 + 0.5 * sin(r * 12.566 + 1.6 * yjNoise(vec2(r * 1.7, phi * 3.0) + uSeed * 9.0));
    hatch = smoothstep(0.45, 0.95, hatch) * (0.55 + 0.45 * yjNoise(vec2(r * 0.6, phi * 2.0) + 7.0));
    float hatchK = uPattern2.x * lowFl * body * smoothstep(0.5, 0.36, s);
    col = mix(col, uAccent, hatchK * (0.25 + 0.65 * hatch));
    // the belly
    col = mix(col, uBelly * (0.92 + 0.12 * mott), bellyK);
    // melanophores: fine pepper of two sizes, thick on the back, thin on the belly
    // (clustered: the cells gather in patches a few millimetres across, which is what reads at a distance)
    float clump = smoothstep(0.25, 0.75, yjFbm(sk / 0.011 + uSeed * 19.0));
    float pepD = uPattern2.y * mix(0.3, 1.0, dors) * (1.0 - 0.85 * bellyK) * (0.45 + 0.9 * clump);
    float mel = yjDots(sk / 0.0022, min(1.0, 0.85 * pepD), 0.16, 0.36, uSeed * 31.0);
    mel = max(mel, 0.9 * yjDots(sk / 0.0052, min(1.0, 0.5 * pepD), 0.14, 0.3, uSeed * 17.0 + 3.0));
    col = mix(col, uDark * 0.45, mel * 0.85);
    col = mix(col, uDark * 0.7, clump * uPattern2.y * 0.18 * dors);
    // white granules (leucophores), raised a little
    float gran = yjDots(sk / 0.0016 + 0.37, 0.3 * uPattern3.y, 0.18, 0.36, uSeed * 7.0 + 11.0) * (0.35 + 0.65 * dors) * (1.0 - 0.6 * bellyK);
    col = mix(col, uPale * 1.08, gran * 0.6);
    // the larger white spots, one or two to a plate here and there
    vec2 cell = vec2(ringId, floor(e * 1.5));
    vec2 jitter = vec2(yjHash(cell + 3.1), yjHash(cell + 7.7));
    float dotR = 0.06 + 0.06 * yjHash(cell + 1.9);
    float dotK = (1.0 - smoothstep(dotR * 0.5, dotR, length((vec2(pu, fract(e * 1.5)) - (0.2 + 0.6 * jitter)) * vec2(1.0, 0.8)))) * step(1.0 - uPattern.y * 0.5, yjHash(cell + 5.3));
    dotK *= body * smoothstep(-0.7, -0.2, cphi) * relief;
    col = mix(col, uPale * 1.05, dotK * 0.7);
    // the ladder of ocelli along the lower flank
    float lowRow = exp(-pow((abs(phi) - 2.35) / 0.32, 2.0));
    float oc = length(vec2((pu - 0.5) * 1.15, (abs(phi) - 2.35) * 1.6));
    float ocK = uPattern.z * lowRow * body * smoothstep(${f(S_CAUDAL)}, 0.85, s);
    col = mix(col, uDark * 0.8, ocK * smoothstep(0.42, 0.3, oc) * smoothstep(0.18, 0.28, oc));
    col = mix(col, uPale, ocK * smoothstep(0.24, 0.14, oc));
    // the armour in the colour: ridges a shade paler, seams a shade darker
    col = mix(col, col * 1.12 + uPale * 0.02, ridge * 0.35 * body);
    col *= 1.0 - 0.06 * joint * body;
    // iridophores: a silver-gold sheen low on the trunk flank
    float sheen = uPattern2.z * body * smoothstep(0.45, 0.3, s) * smoothstep(0.4, 0.0, cphi) * smoothstep(-0.92, -0.55, cphi);
    float op = 0.0;
    // ---- the head
    if (head > 0.0) {
      float lat = abs(sphi);
      // the snout: paler and translucent, a little darker along its top, still peppered with melanophores
      float snoutK = smoothstep(${f(S_SNOUT + 0.008)}, ${f(S_SNOUT - 0.012)}, s);
      float snK = uPattern3.x * snoutK * head * 0.8;
      vec3 snoutCol = mix(mix(uPale * 0.88, uBase * 1.15, 0.35), uBase, 0.3 * dors) * (0.88 + 0.24 * mott);
      col = mix(col, snoutCol, snK);
      col = mix(col, uDark * 0.5, mel * 0.6 * snK);
      // the dark line along the snout's side through the eye, fainter on a pale snout
      float stripe = smoothstep(0.5, 0.8, lat) * smoothstep(0.3, 0.1, abs(cphi - 0.1)) * smoothstep(${f(S_HEAD + 0.004)}, ${f(S_HEAD - 0.012)}, s);
      col = mix(col, uDark * 0.8, stripe * 0.7 * (1.0 - 0.6 * uPattern3.x * snoutK) * head);
      col = mix(col, uDark, smoothstep(0.6, 0.92, cphi) * 0.25 * head);
      // the orbit: a pale bony rim with fine radial striae round the eye
      vec2 eo = vec2(vRest.z - ${f(S_PIVOT - S_EYE)}, vRest.y - ${f(EYE.y)});
      float de = length(eo);
      float rim = smoothstep(${f(EYE.r * 0.45)}, 0.0, abs(de - ${f(EYE.r * 1.1)})) * smoothstep(0.45, 0.85, lat);
      float rimStr = 0.5 + 0.5 * sin(atan(eo.y, eo.x) * 30.0 + 2.0 * yjNoise(eo * 900.0));
      col = mix(col, mix(col, uPale, 0.5), rim * (0.18 + 0.12 * rimStr) * head);
      plateH += (0.35 * rim + 0.12 * rim * rimStr) * head;
      // the gill cover: radial ridges from its hinge, a silver-gold sheen
      op = smoothstep(${f(S_EYE + 0.008)}, ${f(S_EYE + 0.016)}, s) * smoothstep(${f(S_HEAD + 0.002)}, ${f(S_HEAD - 0.004)}, s) * smoothstep(0.3, 0.75, lat) * smoothstep(0.75, 0.2, cphi);
      float rays = sin(atan(cphi + 0.1, (s - ${f(S_EYE)}) * 30.0) * 24.0);
      col = mix(col, mix(col, vec3(0.62, 0.58, 0.4), 0.15 + 0.3 * uPattern2.z), op);
      plateH += 0.09 * rays * op;
      float slit = op * smoothstep(0.0025, 0.0, abs(s - ${f(S_HEAD - 0.003)})) * smoothstep(0.3, 0.6, cphi);
      col *= 1.0 - 0.7 * slit;
      yjThin += 0.35 * uPattern3.x * snoutK;
    }
    sheen = max(sheen, op * (0.25 + 0.6 * uPattern2.z));
#ifndef YJ_LOW
    // ---- the belly's thin wall: the shadows of the gut, the liver and the swim bladder a little below the skin
    float trunk = smoothstep(0.125, 0.145, s) * smoothstep(0.405, 0.385, s);
    if (trunk > 0.0) {
      // a short march inward through the wall (Beer-Lambert): what lies nearer the skin shows more
      vec3 nIn = -normalize(vRestN);
      vec3 organ = vec3(0.0);
      float od = 0.0, tr = 1.0;
      for (int k = 0; k < 4; k++) {
        float dk = 0.0008 + 0.0015 * float(k);
        vec3 q = vRest + nIn * dk;
        // (the body cavity fills most of the lower trunk: the straight gut low in it with its contents, the liver in
        // front, the silvery swim bladder above)
        vec2 gc = vec2(0.0006 * sin(s * 70.0), -0.0082 + 0.0006 * sin(s * 95.0 + uSeed * 6.0));
        float gut = smoothstep(0.0008, -0.0005, length(q.xy - gc) - 0.0038 * smoothstep(0.13, 0.17, s) * smoothstep(0.405, 0.375, s));
        float food = smoothstep(0.45, 0.8, yjNoise(vec2(s * 160.0 + uSeed * 40.0, 0.5)));
        float liver = smoothstep(0.001, -0.0005, length((q.xy - vec2(0.0, -0.0045)) * vec2(1.0, 0.85)) - 0.0075 * smoothstep(0.215, 0.14, s));
        float bladder = smoothstep(0.0008, -0.0005, length((q.xy - vec2(0.0, 0.0032)) * vec2(1.0, 0.9)) - 0.0048 * smoothstep(0.35, 0.24, s) * smoothstep(0.16, 0.21, s));
        vec3 oc = vec3(0.72, 0.72, 0.68);
        float a = bladder * 0.55;
        oc = mix(oc, vec3(0.42, 0.26, 0.08), liver); a = max(a, liver * 0.75);
        oc = mix(oc, mix(vec3(0.16, 0.11, 0.05), vec3(0.05, 0.035, 0.02), food), gut); a = max(a, gut * 0.95);
        organ += tr * a * oc;
        od += tr * a;
        tr *= (1.0 - a * 0.8) * 0.82;
      }
      organ /= max(od, 1e-3);
      float see = uPattern2.w * smoothstep(0.25, -0.5, cphi) * trunk;
      col = mix(col, organ * (0.7 + 0.3 * uBelly / max(max(uBelly.r, uBelly.g), 0.01)), clamp(od, 0.0, 1.0) * see * 0.9);
      sheen *= 1.0 - 0.7 * see;
      yjThin += see * 0.5;
      yjSSS += see;
    }
#endif
    // the iridophores' mirror: pale gold to silver, broken by the pigment over it
    col = mix(col, mix(col, vec3(0.8, 0.72, 0.48), 0.55) * (1.0 - 0.5 * mel), sheen);
    // ---- the surface: a thin uneven gloss of mucus over granular skin and bone
    float mucus = yjNoise(sk / 0.005 + uSeed * 3.0);
    yjRough = 0.6 - 0.14 * ridge - 0.12 * gran - 0.06 * plateH * body + 0.12 * (mucus - 0.5) - 0.15 * sheen;
    yjCoat = (0.08 + 0.2 * smoothstep(0.35, 0.8, mucus) + 0.1 * ridge) * mix(0.5, 1.0, uYjAir);
    yjMetal = 0.36 * sheen * (1.0 - 0.6 * mel);
    yjIri = 0.75 * sheen;
    yjRough = mix(yjRough, 0.28, sheen * 0.7);
    yjH = (plateH * 0.35 + 0.2 * ridge - 0.28 * joint * body + 0.2 * gran * relief + 0.1 * dotK) * relief * ${f(MODEL_TL * 0.0012)};
    // light through the thin parts (the snout tube, the tail), scattered in the skin everywhere
    yjThin += 0.6 * smoothstep(0.0055, 0.0022, rad);
    yjSSS += 0.6 + 0.4 * bellyK;
    // the mouth: a small dark opening between the pale lips (part -1 at its middle)
    float mouthK = clamp(-vPart, 0.0, 1.0);
    col = mix(col, vec3(0.07, 0.04, 0.025), mouthK * mouthK);
    yjRough = mix(yjRough, 0.65, mouthK); yjThin *= 1.0 - mouthK; yjH *= 1.0 - mouthK;
  }
  diffuseColor.rgb = col;
}
`;

const BODY_LIGHT = /* glsl */ `
{
  // the relief of the skin: plates, seams, ridges, granules, the orbit's and the gill cover's rays
  normal = yjBump(-vViewPosition, normal, yjH * uScale);
}
`;
/**
 * Skin in water: the mucus' index (about 1.35) is close to the water's, so its own mirror is far weaker than in air;
 * what still shines under water is mostly the iridophores' guanine (the metallic sheen), which keeps its reflectance.
 */
const WET = /* glsl */ `
{
  float yjWet = mix(0.5, 1.0, uYjAir);
  material.specularColor *= yjWet;
  material.specularColorBlended = mix(material.specularColor, diffuseColor.rgb, metalnessFactor);
  material.specularF90 = mix(yjWet, 1.0, metalnessFactor);
#ifdef USE_CLEARCOAT
  material.clearcoatF90 = yjWet;
#endif
}
`;
/** the mucus is smoother than the skin under it: its highlights follow the relief only half way */
const COAT_NORMAL = /* glsl */ `
clearcoatNormal = normalize(mix(clearcoatNormal, normal, 0.5));
`;

const TRANSLUCENCY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 L = yjSunDir();
  float nl = dot(nW, L);
  // subsurface: light scattered in the skin reaches past the terminator, warmed by the tissue
  float wrap = max(0.0, (nl + 0.5) / 1.5) - max(0.0, nl);
  vec3 tissue = diffuseColor.rgb * vec3(1.0, 0.78, 0.55);
  totalEmissiveRadiance += tissue * yjSunCol() * wrap * 0.3 * yjSSS * RECIPROCAL_PI;
  totalEmissiveRadiance += tissue * yjUnderwater(-nW, 1.0) * 0.08 * yjSSS;
  // through the thin parts: what lies behind, and the sun from behind
  vec3 through = yjUnderwater(vW, 0.7);
  float back = pow(clamp(dot(vW, L), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += yjThin * diffuseColor.rgb * (through * 0.45 + yjSunCol() * back * 0.15);
}
`;

const FIN_FRAG_PARS = /* glsl */ `
varying vec3 vFin;
varying float vRay;
uniform vec3 uBase;
uniform vec3 uDark;
uniform vec3 uPale;
uniform vec3 uAccent;
uniform float uFinBlur;
uniform float uSeed;
`;
/** fins: clear membranes with fine rays dotted with melanophores; the caudal fan reddish brown with pale tips */
const FIN_SURFACE = /* glsl */ `
float yjThin = 1.0;
{
  float u = vFin.x, v = vFin.y, id = vFin.z;
  float ray = smoothstep(0.55, 0.98, vRay);
  float mel = yjDots(vec2(u * 60.0, v * 14.0), 0.5, 0.15, 0.3, uSeed * 13.0 + id);
  vec3 mem = mix(vec3(0.78, 0.76, 0.66), uBase * 2.0, 0.18);
  vec3 rc = mix(uBase, uAccent, 0.4) * 1.3;
  float a;
  if (id < 0.5) {
    // dorsal: nearly clear, fine pale-brown rays dotted dark, a pigmented band at the base; blurred when it buzzes
    a = mix(0.06, 0.38, ray) * smoothstep(1.0, 0.86, v) + 0.18 * ray * mel;
    mem = mix(mem, rc, ray);
    mem = mix(mem, uDark, max(ray * mel * 0.7, smoothstep(0.2, 0.0, v) * 0.45));
    a += smoothstep(0.2, 0.0, v) * 0.12;
    a = mix(a, a * 0.5 + 0.04, uFinBlur);
  } else if (id < 1.5) {
    // pectoral: clear, the rays faint
    a = mix(0.04, 0.24, ray) * smoothstep(1.0, 0.8, v);
    mem = mix(mem, rc, ray * 0.6);
  } else if (id < 2.5) {
    // caudal: reddish-brown rays densely dotted, a darker membrane, pale tips, a few white spots
    vec2 sp = vec2(u * 9.0, v * 6.0);
    float spot = smoothstep(0.3, 0.18, length(fract(sp + yjHash(floor(sp) + uSeed) * 0.3) - 0.5)) * step(0.62, yjHash(floor(sp) + 2.0 + uSeed));
    mem = mix(mix(uDark, uAccent, 0.5) * 1.2, mix(uAccent, uDark, 0.3) * 1.4, ray);
    mem = mix(mem, uDark * 0.6, mel * 0.6);
    mem = mix(mem, uPale, smoothstep(0.82, 0.98, v) * 0.5 + spot * 0.45);
    a = mix(0.5, 0.9, ray) * smoothstep(1.0, 0.94, v);
  } else {
    a = mix(0.1, 0.45, ray);
    mem = mix(mem, rc, ray);
  }
  diffuseColor.rgb = mem;
  diffuseColor.a = a;
}
`;

// ------------------------------------------------------------------ materials

export interface YoujiuoMaterials {
  body: MeshPhysicalMaterial;
  bodyLow: MeshPhysicalMaterial;
  fins: MeshPhysicalMaterial;
  /** the individual's own uniforms */
  own: {
    uBase: IUniform<Color>; uDark: IUniform<Color>; uPale: IUniform<Color>; uBelly: IUniform<Color>; uAccent: IUniform<Color>;
    uPattern: IUniform<Vector4>; uPattern2: IUniform<Vector4>; uPattern3: IUniform<Vector4>;
    uSeed: IUniform<number>; uCover: IUniform<number>; uFinBlur: IUniform<number>; uScale: IUniform<number>;
  };
  dispose(): void;
}

function bodyMaterial(own: YoujiuoMaterials['own'], low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.4, metalness: 0,
    clearcoat: low ? 0 : 0.2, clearcoatRoughness: 0.32,
    iridescence: low ? 0 : 0.5, iridescenceIOR: 1.45, iridescenceThicknessRange: [250, 620],
    side: low ? DoubleSide : FrontSide,
  });
  m.name = low ? 'YoujiuoBodyLOD2' : 'YoujiuoBody';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, YJ_UNIFORMS, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBody = aBody; vPat = aPat; vPart = aPart; vRest = position / ${f(MODEL_TL)}; vRestN = normal;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_FRAG_PARS}\nuniform float uScale;`)
      .replace('void main() {', `${HELPERS}\n${BODY_FNS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BODY_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(yjRough, 0.08, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = yjMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${low ? '' : BODY_LIGHT}`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n${low ? '' : COAT_NORMAL}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
${WET}
#ifdef USE_CLEARCOAT
  material.clearcoat = yjCoat;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = yjIri;
  material.iridescenceThickness = 420.0;
#endif`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', TRANSLUCENCY);
  };
  if (low) m.defines = { YJ_LOW: '' };
  m.customProgramCacheKey = () => (low ? 'youjiuo-body-lod2-v2' : 'youjiuo-body-v2');
  return m;
}

function finMaterial(own: YoujiuoMaterials['own']): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.28, metalness: 0, transparent: true, depthWrite: false, side: DoubleSide,
    iridescence: 0.3, iridescenceIOR: 1.4, iridescenceThicknessRange: [250, 450],
  });
  m.name = 'YoujiuoFin';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, YJ_UNIFORMS, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFin = aFin; vRay = aRay;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\n${BODY_FNS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FIN_SURFACE}`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // thin living tissue: it scatters the light it is bathed in from both faces
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  totalEmissiveRadiance += diffuseColor.rgb * (yjUnderwater(nW, 1.0) + yjUnderwater(-nW, 1.0)) * 0.22;
}`);
  };
  m.customProgramCacheKey = () => 'youjiuo-fin-v2';
  return m;
}

/** An individual's materials (its own colours; programs shared with every other fish). */
export function youjiuoMaterials(look: Look, scale: number): YoujiuoMaterials {
  const own = {
    uBase: { value: look.base.clone() }, uDark: { value: look.dark.clone() }, uPale: { value: look.pale.clone() }, uBelly: { value: look.belly.clone() },
    uAccent: { value: look.accent.clone() },
    uPattern: { value: new Vector4(look.band, look.dots, look.ocelli, look.mottle) },
    uPattern2: { value: new Vector4(look.streak, look.pepper, look.sheen, look.translucency) },
    uPattern3: { value: new Vector4(look.snout, look.granules, 0, 0) },
    uSeed: { value: look.seed }, uCover: { value: 0 }, uFinBlur: { value: 0 }, uScale: { value: scale },
  };
  const body = bodyMaterial(own, false), bodyLow = bodyMaterial(own, true), fins = finMaterial(own);
  return { body, bodyLow, fins, own, dispose: () => { body.dispose(); bodyLow.dispose(); fins.dispose(); } };
}

/** A look from a morph, varied a little by the seed, greener when it lives in the eelgrass. */
export function lookFor(morph: number, seed: number, green: number): Look {
  const m = MORPHS[morph % MORPHS.length], g = MORPHS[GREEN_MORPH];
  // a fish living among the blades turns greener over the weeks (not all the way)
  const k = morph % MORPHS.length === GREEN_MORPH ? 0 : 0.4 * Math.max(0, Math.min(1, green));
  const mix = (a: Color, b: Color, i: number) => a.clone().lerp(b, k).multiplyScalar(1 + 0.1 * Math.sin(seed * 91.7 + i));
  return {
    base: mix(m.base, g.base, 1), dark: mix(m.dark, g.dark, 2), pale: mix(m.pale, g.pale, 3), belly: mix(m.belly, g.belly, 4), accent: mix(m.accent, g.accent, 5),
    band: m.band, dots: m.dots, ocelli: m.ocelli, mottle: m.mottle, streak: m.streak, pepper: m.pepper, sheen: m.sheen, translucency: m.translucency,
    snout: m.snout, granules: m.granules, seed: seed % 1,
  };
}

let lastTick = -1;
export function tickYoujiuoMaterials(seconds: number): void {
  if (seconds === lastTick) return;
  lastTick = seconds;
  YJ_UNIFORMS.uYjTime.value = seconds % 3600;
}

export const DORSAL_SPAN = DORSAL.s1 - DORSAL.s0;
