import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { DORSAL, EYE, MODEL_TL, S_CAUDAL, S_EYE, S_HEAD, S_SNOUT } from './anatomy';

const f = (x: number): string => x.toFixed(5);

/**
 * The ヨウジウオ's materials: standard PBR (MeshPhysicalMaterial: roughness, clearcoat for the mucus over the bony
 * plates and for the cornea, a thin-film sheen on the gill cover) with the armour, the pattern and the underwater
 * light worked in through onBeforeCompile. One program per tier is shared by every fish; each fish has its own
 * material objects (its own colours: the species is very variable, and a fish living in the eelgrass is greener).
 *
 * Surface (from the photographs): the body is a tube of bony rings, each ring a set of plates between the ridges;
 * the joints between rings are fine dark seams with a groove, the plates are a little convex with faint radial
 * striae, the ridges catch the light. Colour: olive-brown, green, dark brown or tan above, mottled darker and often in
 * irregular bands a few rings wide, peppered with melanophores, small white dots on the plates; a pale cream belly
 * below the inferior ridges; some fish carry a ladder of pale ocelli ringed with brown along the lower flank. On the
 * head: a dark line along the snout's side through the eye, the gill cover a convex plate with radial ridges and a
 * green-silver sheen, the gill opening a dark slit at its upper back. Eye: a golden-brown iris crossed by the dark
 * stripe, a black pupil, a glossy cornea. Fins: thin membranes with fine brown rays; the caudal fan brown with pale
 * tips and white spots. Thin parts (snout, tail tip, fins) pass the light behind them (subtle translucency).
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
  /** banding 0..1, white dots 0..1, ocelli ladder 0..1, mottling 0..1 */
  band: number; dots: number; ocelli: number; mottle: number;
  seed: number;
}

/** The colour morphs seen in the photographs (linear RGB). */
export const MORPHS: readonly Omit<Look, 'seed'>[] = [
  // olive-brown, mottled, white dots (the commonest)
  { base: new Color(0.15, 0.11, 0.04), dark: new Color(0.045, 0.03, 0.012), pale: new Color(0.62, 0.56, 0.42), belly: new Color(0.62, 0.56, 0.38), band: 0.35, dots: 0.8, ocelli: 0.2, mottle: 0.8 },
  // green: the eelgrass fish (yellow-green with a darker back)
  { base: new Color(0.2, 0.25, 0.035), dark: new Color(0.055, 0.075, 0.012), pale: new Color(0.55, 0.62, 0.3), belly: new Color(0.5, 0.56, 0.22), band: 0.15, dots: 0.45, ocelli: 0.1, mottle: 0.5 },
  // dark brown, banded
  { base: new Color(0.075, 0.045, 0.02), dark: new Color(0.018, 0.012, 0.006), pale: new Color(0.45, 0.4, 0.3), belly: new Color(0.4, 0.33, 0.2), band: 0.9, dots: 0.5, ocelli: 0.0, mottle: 0.6 },
  // pale tan with a ladder of ocelli
  { base: new Color(0.3, 0.21, 0.11), dark: new Color(0.1, 0.06, 0.025), pale: new Color(0.72, 0.66, 0.52), belly: new Color(0.7, 0.64, 0.48), band: 0.2, dots: 0.6, ocelli: 0.95, mottle: 0.5 },
  // reddish brown with white spots
  { base: new Color(0.24, 0.09, 0.035), dark: new Color(0.07, 0.025, 0.01), pale: new Color(0.7, 0.62, 0.48), belly: new Color(0.62, 0.5, 0.3), band: 0.3, dots: 1.0, ocelli: 0.15, mottle: 0.7 },
];
export const GREEN_MORPH = 1;

// ------------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
attribute vec3 aBody;
attribute vec2 aPat;
attribute float aPart;
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
varying vec3 vWPos;
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
uniform vec3 uBase;
uniform vec3 uDark;
uniform vec3 uPale;
uniform vec3 uBelly;
uniform vec4 uPattern;   // band, dots, ocelli, mottle
uniform float uSeed;
`;

/**
 * Colour, roughness, relief and the thin-part translucency of the body, computed once at the colour stage.
 * s along the body, φ round it (0 dorsal midline, toward the left flank), e = φ in edges (ridges at 1, 2, 3 and 5,
 * 6, 7 on the trunk), r the ring coordinate.
 */
const BODY_SURFACE = /* glsl */ `
float yjRough = 0.4, yjCoat = 0.5, yjMetal = 0.0, yjIri = 0.0, yjThin = 0.0, yjH = 0.0;
{
  float s = vBody.x;
  float cphi = vBody.y, sphi = vBody.z;
  float phi = atan(sphi, cphi);
  float side = sign(sphi + 1e-5);
  float e = mod(phi / 6.2831853 * 8.0 + 8.0, 8.0);
  float r = vPat.x;
  float body = smoothstep(${f(S_HEAD - 0.004)}, ${f(S_HEAD + 0.006)}, s);
  vec3 col;
  if (vPart > 0.5 && vPart < 1.5) {
    // ---- the eye: golden-brown iris with radial streaks, the dark stripe across it, a black pupil
    vec2 q = vPat;
    float rr = length(q);
    float pupil = 1.0 - smoothstep(${f(EYE.pupil - 0.03)}, ${f(EYE.pupil + 0.02)}, rr);
    float ang = atan(q.y, q.x);
    float streak = 0.75 + 0.25 * yjNoise(vec2(ang * 7.0, rr * 3.0)) + 0.12 * sin(ang * 23.0 + rr * 5.0);
    vec3 iris = mix(vec3(0.42, 0.26, 0.07), vec3(0.62, 0.45, 0.16), smoothstep(0.75, 0.42, rr)) * streak;
    // a bright gold ring round the pupil, the rim dark
    iris = mix(iris, vec3(0.85, 0.66, 0.26), smoothstep(0.1, 0.0, abs(rr - 0.44)) * 0.6);
    iris *= mix(1.0, 0.3, smoothstep(0.78, 0.98, rr));
    // the stripe running from the snout through the eye
    iris = mix(iris, uDark * 0.6, smoothstep(0.17, 0.08, abs(q.y + 0.02)) * smoothstep(0.38, 0.5, rr) * 0.8);
    col = mix(iris, vec3(0.006, 0.007, 0.008), pupil);
    yjRough = 0.12; yjCoat = 1.0;
  } else if (vPart > 1.5 && vPart < 2.5) {
    // ---- the mouth's opening
    col = vec3(0.02, 0.012, 0.01);
    yjRough = 0.6; yjCoat = 0.2;
  } else if (vPart > 2.5) {
    // ---- LOD2's painted tail fan
    col = mix(uDark, uBase, 0.6) * 0.9;
    yjThin = 0.6;
  } else {
    float ridge = 0.0, joint = 0.0, plateH = 0.0;
    float ringId = floor(r);
    float pu = fract(r);
    if (body > 0.0) {
      // ridges: the corners of the section (the head has none)
      float de = min(min(abs(e - 1.0), abs(e - 2.0)), min(abs(e - 3.0), min(abs(e - 5.0), min(abs(e - 6.0), abs(e - 7.0)))));
      // the tail's lateral corners are no ridges
      float tailK = smoothstep(0.37, 0.44, s);
      float isLat = (1.0 - step(0.5, min(abs(e - 2.0), abs(e - 6.0))));
      ridge = exp(-de * de / 0.012) * (1.0 - isLat * tailK);
      float dj = min(pu, 1.0 - pu);
      // the seams fade out where a ring is only a few pixels long (no tape-measure stripes at a distance)
      joint = exp(-dj * dj / 0.004) * (1.0 - smoothstep(0.12, 0.45, fwidth(r)));
      // the plate: convex between the ridges and the joints, faint radial striae from its middle
      float pv = fract(e) - 0.5;
      float pw = pu - 0.5;
      float striae = sin(atan(pv, pw) * 16.0 + yjHash(vec2(ringId, floor(e))) * 6.0) * smoothstep(0.08, 0.3, length(vec2(pv, pw)));
      plateH = 0.18 * (1.0 - 4.0 * (pv * pv + pw * pw)) + 0.03 * striae * (1.0 - joint);
    }
    float s_ = s;
    // ---- body colour
    float dors = smoothstep(-0.55, 0.6, cphi);
    float bellyK = smoothstep(-0.48, -0.78, cphi) * body + smoothstep(-0.3, -0.7, cphi) * (1.0 - body);
    vec2 P = vec2(s_ * 60.0, phi * 1.4);
    float mott = yjFbm(P * vec2(0.9, 1.2) + uSeed * 13.0);
    // dark saddles over the back, a ring or two wide, and bands a few rings wide (irregular), darker above
    float saddle = smoothstep(0.5, 0.72, yjFbm(vec2(r * 0.55 + uSeed * 3.0, phi * 0.6 + 2.0)));
    float band = smoothstep(0.42, 0.62, yjNoise(vec2(r * 0.28 + uSeed * 7.0, 0.5))) * uPattern.x;
    col = uBase * (0.8 + 0.4 * mott);
    col = mix(col, uDark, clamp(smoothstep(0.42, 0.72, mott) * uPattern.w * 0.7 + saddle * uPattern.w * 0.55 + band * 0.75, 0.0, 0.92) * dors);
    // melanophore pepper
    float pep = yjHash(floor(vec2(s_ * 1400.0, phi * 40.0)));
    col *= 1.0 - 0.35 * smoothstep(0.82, 0.97, pep) * (0.4 + 0.6 * dors);
    // small white dots on the plates (one or two to a plate, here and there)
    vec2 cell = vec2(ringId, floor(e * 1.5));
    vec2 jitter = vec2(yjHash(cell + 3.1), yjHash(cell + 7.7));
    vec2 inPlate = vec2(pu, fract(e * 1.5));
    float dotR = 0.07 + 0.06 * yjHash(cell + 1.9);
    float dotK = (1.0 - smoothstep(dotR * 0.6, dotR, length((inPlate - (0.2 + 0.6 * jitter)) * vec2(1.0, 0.8)))) * step(1.0 - uPattern.y * 0.55, yjHash(cell + 5.3));
    dotK *= body * smoothstep(-0.7, -0.2, cphi);
    // the ladder of ocelli along the lower flank: a pale oval in each ring, ringed with brown
    float lowFlank = exp(-pow((abs(phi) - 2.35) / 0.32, 2.0));
    float oc = length(vec2((pu - 0.5) * 1.15, (abs(phi) - 2.35) * 1.6));
    float ocK = uPattern.z * lowFlank * body * smoothstep(${f(S_CAUDAL)}, 0.85, s_);
    col = mix(col, uDark * 0.8, ocK * smoothstep(0.42, 0.3, oc) * smoothstep(0.18, 0.28, oc));
    col = mix(col, uPale, ocK * smoothstep(0.24, 0.14, oc));
    col = mix(col, uPale, dotK * 0.75);
    // the belly
    col = mix(col, uBelly * (0.92 + 0.08 * mott), bellyK);
    // ridges a little paler, the ring joints dark seams
    col = mix(col, col * 1.15 + uPale * 0.03, ridge * 0.3 * body);
    col *= 1.0 - 0.12 * joint * body;
    // ---- the head
    float head = 1.0 - body;
    if (head > 0.0) {
      // the dark line along the snout's side through the eye, on over the gill cover
      float lat = abs(sphi);
      float stripe = smoothstep(0.5, 0.8, lat) * smoothstep(0.32, 0.12, abs(cphi - 0.08)) * smoothstep(${f(S_HEAD + 0.004)}, ${f(S_HEAD - 0.012)}, s_);
      col = mix(col, uDark * 0.8, stripe * 0.8 * head);
      // the head's top darker, freckled pale
      col = mix(col, uDark, smoothstep(0.55, 0.9, cphi) * 0.35 * head);
      // the snout: darker toward the tip, its underside pale; a fine dark rim at the mouth
      float snout = smoothstep(${f(S_SNOUT + 0.01)}, ${f(S_SNOUT - 0.01)}, s_);
      col = mix(col, col * 0.75, snout * smoothstep(0.02, 0.0, s_) * head);
      // the gill cover: radial ridges and a green-silver sheen
      float op = smoothstep(${f(S_EYE + 0.008)}, ${f(S_EYE + 0.016)}, s_) * smoothstep(${f(S_HEAD + 0.002)}, ${f(S_HEAD - 0.004)}, s_) * smoothstep(0.3, 0.75, lat) * smoothstep(0.75, 0.2, cphi);
      float rad = sin(atan(cphi + 0.1, (s_ - ${f(S_EYE)}) * 30.0) * 22.0);
      col = mix(col, mix(col, vec3(0.3, 0.38, 0.24), 0.45), op);
      yjIri = 0.55 * op; yjMetal = 0.2 * op;
      plateH += 0.08 * rad * op;
      // the gill opening: a dark slit high at the cover's back
      float slit = op * smoothstep(0.0025, 0.0, abs(s_ - ${f(S_HEAD - 0.003)})) * smoothstep(0.3, 0.6, cphi);
      col *= 1.0 - 0.7 * slit;
      // the orbit's rim
      plateH += 0.4 * smoothstep(0.25, 0.0, abs(s_ - ${f(S_EYE)}) / 0.012 - 0.8) * smoothstep(0.5, 0.9, lat) * head;
    }
    // ---- surface: mucus over bone; the ridges and the plates' middles glossier
    yjRough = 0.5 - 0.1 * ridge - 0.05 * plateH * body;
    yjCoat = 0.3;
    // the relief fades where a ring is only a few pixels long (it would only shimmer)
    float relief = 1.0 - smoothstep(0.08, 0.35, fwidth(r));
    yjH = (plateH * 0.35 + 0.25 * ridge - 0.8 * joint * body) * relief * ${f(MODEL_TL * 0.0012)};
    // thin parts let the light through: the snout tube, the tail toward its tip
    yjThin = 0.45 * smoothstep(${f(S_SNOUT)}, 0.0, s_) + 0.75 * smoothstep(0.7, 0.97, s_);
  }
  diffuseColor.rgb = col;
}
`;

const BODY_LIGHT = /* glsl */ `
{
  // the bony relief: the plates, the seams, the ridges, the gill cover's rays (a bump in the fish's own scale)
  normal = yjBump(-vViewPosition, normal, yjH * uScale);
}
`;

const TRANSLUCENCY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 through = yjUnderwater(vW, 0.7);
  float back = pow(clamp(dot(vW, yjSunDir()), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += yjThin * diffuseColor.rgb * (through * 0.55 + yjSunCol() * back * 0.12);
}
`;

const FIN_FRAG_PARS = /* glsl */ `
varying vec3 vFin;
varying float vRay;
uniform vec3 uBase;
uniform vec3 uDark;
uniform vec3 uPale;
uniform float uFinBlur;
uniform float uSeed;
`;
const FIN_SURFACE = /* glsl */ `
float yjThin = 1.0;
{
  float u = vFin.x, v = vFin.y, id = vFin.z;
  float ray = smoothstep(0.55, 0.98, vRay);
  vec3 mem = mix(vec3(0.62, 0.6, 0.5), uBase * 1.6, 0.35);
  vec3 rc = mix(uDark, uBase, 0.35) * 1.2;
  float a;
  if (id < 0.5) {
    // dorsal: clear with fine brown rays, a faint dark base; blurred when it buzzes fast
    a = mix(0.16, 0.6, ray) * smoothstep(1.0, 0.86, v);
    a = mix(a, a * 0.55 + 0.06, uFinBlur);
    mem = mix(mem, rc, ray);
    mem = mix(mem, uDark, smoothstep(0.25, 0.0, v) * 0.4);
  } else if (id < 1.5) {
    // pectoral: nearly clear
    a = mix(0.1, 0.38, ray) * smoothstep(1.0, 0.8, v);
    mem = mix(mem, rc, ray * 0.7);
  } else if (id < 2.5) {
    // caudal: brown rays, pale tips, white spots
    vec2 sp = vec2(u * 9.0, v * 6.0);
    float spot = smoothstep(0.32, 0.2, length(fract(sp + yjHash(floor(sp) + uSeed) * 0.3) - 0.5)) * step(0.55, yjHash(floor(sp) + 2.0 + uSeed));
    mem = mix(uDark * 1.3, mix(uBase, uDark, 0.3), ray);
    mem = mix(mem, uPale, smoothstep(0.8, 0.98, v) * 0.6 + spot * 0.5);
    a = mix(0.55, 0.92, ray) * smoothstep(1.0, 0.94, v);
  } else {
    a = mix(0.15, 0.5, ray);
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
  own: { uBase: IUniform<Color>; uDark: IUniform<Color>; uPale: IUniform<Color>; uBelly: IUniform<Color>; uPattern: IUniform<Vector4>; uSeed: IUniform<number>; uCover: IUniform<number>; uFinBlur: IUniform<number>; uScale: IUniform<number> };
  dispose(): void;
}

function bodyMaterial(own: YoujiuoMaterials['own'], low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.4, metalness: 0,
    clearcoat: low ? 0 : 0.3, clearcoatRoughness: 0.25,
    iridescence: low ? 0 : 0.5, iridescenceIOR: 1.5, iridescenceThicknessRange: [280, 560],
    side: low ? DoubleSide : FrontSide,
  });
  m.name = low ? 'YoujiuoBodyLOD2' : 'YoujiuoBody';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, YJ_UNIFORMS, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = aBody; vPat = aPat; vPart = aPart;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_FRAG_PARS}\nuniform float uScale;`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BODY_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(yjRough, 0.08, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = yjMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${low ? '' : BODY_LIGHT}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
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
  m.customProgramCacheKey = () => (low ? 'youjiuo-body-lod2-v1' : 'youjiuo-body-v1');
  return m;
}

function finMaterial(own: YoujiuoMaterials['own']): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, transparent: true, depthWrite: false, side: DoubleSide });
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
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
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
  m.customProgramCacheKey = () => 'youjiuo-fin-v1';
  return m;
}

/** An individual's materials (its own colours; programs shared with every other fish). */
export function youjiuoMaterials(look: Look, scale: number): YoujiuoMaterials {
  const own = {
    uBase: { value: look.base.clone() }, uDark: { value: look.dark.clone() }, uPale: { value: look.pale.clone() }, uBelly: { value: look.belly.clone() },
    uPattern: { value: new Vector4(look.band, look.dots, look.ocelli, look.mottle) },
    uSeed: { value: look.seed }, uCover: { value: 0 }, uFinBlur: { value: 0 }, uScale: { value: scale },
  };
  const body = bodyMaterial(own, false), bodyLow = bodyMaterial(own, true), fins = finMaterial(own);
  return { body, bodyLow, fins, own, dispose: () => { body.dispose(); bodyLow.dispose(); fins.dispose(); } };
}

/** A look from a morph, varied a little by the seed, greener when it lives in the eelgrass. */
export function lookFor(morph: number, seed: number, green: number): Look {
  const m = MORPHS[morph % MORPHS.length], g = MORPHS[GREEN_MORPH];
  // a fish living among the blades turns greener over the weeks (not all the way)
  const k = morph % MORPHS.length === GREEN_MORPH ? 0 : 0.45 * Math.max(0, Math.min(1, green));
  const mix = (a: Color, b: Color, i: number) => a.clone().lerp(b, k).multiplyScalar(1 + 0.12 * Math.sin(seed * 91.7 + i));
  return {
    base: mix(m.base, g.base, 1), dark: mix(m.dark, g.dark, 2), pale: mix(m.pale, g.pale, 3), belly: mix(m.belly, g.belly, 4),
    band: m.band, dots: m.dots, ocelli: m.ocelli, mottle: m.mottle, seed: seed % 1,
  };
}

let lastTick = -1;
export function tickYoujiuoMaterials(seconds: number): void {
  if (seconds === lastTick) return;
  lastTick = seconds;
  YJ_UNIFORMS.uYjTime.value = seconds % 3600;
}

export const DORSAL_SPAN = DORSAL.s1 - DORSAL.s0;
