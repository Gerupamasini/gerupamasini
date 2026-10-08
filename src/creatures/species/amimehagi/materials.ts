import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, Vector2, Vector3, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { ANAL, CAUDAL, DORSAL, DORSAL_PTS, EYE, GAPE, GILL, MODEL_TL, PEC, SPINE_D1, VENTRAL_PTS } from './anatomy';

const f = (x: number): string => x.toFixed(5);

/** a GLSL function through a table of (x, y) points, linear between them, clamped at the ends */
function glslTable(name: string, pts: readonly (readonly [number, number])[]): string {
  let body = `float y = ${f(pts[0][1])};\n`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    body += `  y = mix(y, ${f(y0)} + (${f(y1 - y0)}) * clamp((x - ${f(x0)}) / ${f(x1 - x0)}, 0.0, 1.0), step(${f(x0)}, x));\n`;
  }
  return `float ${name}(float x) {\n  ${body}  return y;\n}\n`;
}

/**
 * Materials of the アミメハギ: standard PBR (MeshPhysicalMaterial: roughness, sheen for the velvety granular skin,
 * clearcoat for its film of mucus and for the cornea) with the pattern and the underwater light worked in through
 * onBeforeCompile.
 *
 * The skin is not a fish's mirror but a filefish's shagreen: tiny prickly scales, each a granule, so the skin is matte
 * with a soft sheen and sparkles where the granules catch the light. Its pattern is the 網目: pale round spots in a
 * darker net, smaller and tighter on the head, the net bolder in the darker fish, often with darker saddles and a dark
 * tip to the pelvic flap; the colour is the individual's (orange, olive, brown, grey, yellow) and darkens and turns
 * blotchy when it is frightened or asleep among the leaves. The thin parts (the flap, the knife edges of back and belly,
 * the fins, the filaments) let the light from behind through (subtle translucency).
 *
 * Under water the light that reaches the fish has come down through the water: the sun's beam reddens and dims with
 * the depth (underwater attenuation, per channel), ripple caustics play over the back, and what the skin and the
 * cornea reflect is the light field of the clear green water of an eelgrass bed: Snell's window overhead, the water's
 * own glow at the sides, the sunlit sand below. (For comparison with photographs taken in a tank, `uAir` swaps the
 * water's light field for the room's.)
 *
 * Every fish has its own skin and fin materials (one shader program per tier, shared), so its pattern, colour and
 * mood are its own; the eye material is shared.
 */

export const AMH_UNIFORMS = {
  uAmhTime: { value: 0 } as IUniform<number>,
  /** glow of the eelgrass bed's water at full daylight (in-scattered light, linear) */
  uWaterTint: { value: new Color(0.085, 0.15, 0.14) } as IUniform<Color>,
  /** the bed seen in the fish's lower side */
  uSandTint: { value: new Color(0.3, 0.27, 0.2) } as IUniform<Color>,
  /** how much of the environment cube shows in Snell's window */
  uSkyGain: { value: 0.5 } as IUniform<number>,
  /** strength of the ripple caustics on the fish */
  uCaustic: { value: 0.5 } as IUniform<number>,
  /** 0 under water; 1 for a fish photographed in a tank, lit by the room (the reference viewer) */
  uAir: { value: 0 } as IUniform<number>,
  /** the water surface's height (world y) over the fish: the light's path down to it */
  uSurfaceY: { value: 0 } as IUniform<number>,
  /** what a metre of this water takes out of the light (per channel, 1/m): red first, then blue */
  uExtinction: { value: new Vector3(0.42, 0.075, 0.11) } as IUniform<Vector3>,
};

// ------------------------------------------------------------------ GLSL

const HELPERS = /* glsl */ `
uniform float uAmhTime;
uniform vec3 uWaterTint;
uniform vec3 uSandTint;
uniform float uSkyGain;
uniform float uCaustic;
uniform float uAir;
uniform float uSurfaceY;
uniform vec3 uExtinction;
varying vec3 vWPos;

float amHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 amHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float amNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(amHash(i), amHash(i + vec2(1.0, 0.0)), f.x), mix(amHash(i + vec2(0.0, 1.0)), amHash(i + vec2(1.0, 1.0)), f.x), f.y); }

vec3 amSunDir() {
#if NUM_DIR_LIGHTS > 0
  return normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
#else
  return vec3(0.3, 0.9, 0.3);
#endif
}
vec3 amSunCol() {
#if NUM_DIR_LIGHTS > 0
  return directionalLights[0].color;
#else
  return vec3(1.0);
#endif
}
vec3 amSky() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].skyColor;
#else
  return ambientLightColor;
#endif
}
vec3 amGround() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].groundColor;
#else
  return ambientLightColor * 0.5;
#endif
}
float amDepth() { return uAir > 0.5 ? 0.0 : max(uSurfaceY - vWPos.y, 0.0); }
// the light that is left of the sun's beam after its path down through the water
vec3 amSunThrough() {
  vec3 L = amSunDir();
  float path = amDepth() / max(L.y, 0.3);
  return exp(-uExtinction * path);
}
// the water's own glow (in-scattered daylight), following the daylight
vec3 amWaterGlow() {
  float lum = dot(amSky(), vec3(0.2126, 0.7152, 0.0722));
  return uWaterTint * (0.06 + 0.94 * clamp((lum - 0.042) / 0.158, 0.0, 1.25));
}
// the sky as seen from under the water through Snell's window
vec3 amWindow(vec3 d, float rough) {
  vec2 h = d.xz * 1.333;
  float hl = length(h);
  vec3 a = hl < 0.995 ? vec3(h.x, sqrt(1.0 - hl * hl), h.y) : normalize(vec3(h.x, 0.1, h.y));
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  vec3 s = textureCubeUV(envMap, envMapRotation * a, max(rough, 0.04)).rgb;
  return min(s, vec3(4.0)) * uSkyGain;
#else
  return amSky() * 2.2 + amSunCol() * 0.15;
#endif
}
// radiance arriving from direction d at a fish in the bed
vec3 amUnderwater(vec3 d, float rough) {
  vec3 glow = amWaterGlow();
  float up = d.y;
  float w = smoothstep(0.6 - rough * 0.3, 0.74 + rough * 0.08, up);
  vec3 tir = glow * 1.15;
  vec3 L = amSunDir();
  vec3 bed = uSandTint * (amSunCol() * max(L.y, 0.0) * 0.8 * amSunThrough() + amSky() * 0.55 + amGround() * 0.4) * RECIPROCAL_PI;
  vec3 below = mix(glow, bed, 0.55);
  vec3 c = mix(glow, tir, smoothstep(0.05, 0.5, up));
  c = mix(c, below, smoothstep(0.0, -0.45, up));
  // the deeper the fish, the dimmer and greener the window above it
  c = mix(c, amWindow(d, rough) * exp(-uExtinction * amDepth() * 0.6), w);
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  if (uAir > 0.0) c = mix(c, textureCubeUV(envMap, envMapRotation * d, max(rough, 0.04)).rgb * uSkyGain, uAir);
#endif
  return c;
}
// ripple caustics: a bright net drifting with the waves, fading with the depth
float amCaustic(vec3 p) {
  vec2 q = p.xz * 22.0 + vec2(uAmhTime * 0.21, -uAmhTime * 0.13);
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    q = mat2(1.6, 1.2, -1.2, 1.6) * q + vec2(uAmhTime * (0.35 + 0.2 * fi), uAmhTime * 0.27);
    c += abs(sin(q.x + 1.7 * sin(q.y * 0.9 + uAmhTime * 0.8)) * sin(q.y + 1.5 * sin(q.x * 1.1 - uAmhTime * 0.6)));
  }
  c *= 0.5;
  return 0.62 + 1.25 * pow(1.0 - c, 4.0) * 1.6;
}
// cellular noise: distance to the nearest and second-nearest jittered point, and the nearest cell's id
vec3 amCells(vec2 p, out vec2 id) {
  vec2 i = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  id = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.05 + 0.9 * amHash2(i + g);
    float d = length(g + o - fp);
    if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2, amHash(id + 7.7));
}
`;

/** the underwater light field in place of the image-based light */
const ENV_INJECT = /* glsl */ `
#include <lights_fragment_maps>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 rW = reflect(vW, nW);
  radiance += amUnderwater(rW, material.roughness);
  iblIrradiance += PI * amUnderwater(nW, 1.0) * 0.5;
#ifdef USE_CLEARCOAT
  vec3 cW = reflect(vW, inverseTransformDirection(clearcoatNormal, viewMatrix));
  clearcoatRadiance += amUnderwater(cW, material.clearcoatRoughness);
#endif
}
`;

/** the sun's beam through the water column, with caustics over the faces that look up */
const SUN_INJECT = /* glsl */ `
#include <lights_fragment_begin>
{
  float upW = inverseTransformDirection(normal, viewMatrix).y;
  float deep = exp(-amDepth() * 1.6);
  float cs = mix(1.0, amCaustic(vWPos), uCaustic * deep * (1.0 - uAir) * smoothstep(-0.3, 0.5, upW));
  vec3 T = amSunThrough();
  reflectedLight.directDiffuse *= cs * T;
  reflectedLight.directSpecular *= cs * T;
}
`;

const SKIN_VERT_PARS = /* glsl */ `
attribute float aPart;
attribute float aThin;
attribute vec2 aSkin;
varying vec2 vSkin;
varying float vPart;
varying float vThin;
varying vec3 vRest;
varying vec3 vWPos;
`;

const SKIN_FRAG_PARS = /* glsl */ `
varying vec2 vSkin;
varying float vPart;
varying float vThin;
varying vec3 vRest;
uniform vec3 uBase;
uniform vec3 uBelly;
uniform vec3 uSpot;
uniform vec3 uNet;
uniform vec3 uBlotch;
uniform vec4 uAmt;      // x: net, y: spots, z: saddles / blotches, w: spot size
uniform vec2 uSeed;
uniform float uDark;    // 0 calm .. 1 frightened / asleep: darker, blotchier
uniform float uEyeRing;
${glslTable('amDorsalY', DORSAL_PTS)}
${glslTable('amVentralY', VENTRAL_PTS)}
`;

/**
 * The skin's colour and surface, computed once at the colour stage and read again by the roughness / normal /
 * clearcoat / sheen stages. vRest is the rest-pose position in TL units (x the fish's left, y up, z forward); the
 * pattern is laid on the flank's side view (the fish is so thin that the side view is the skin), each side its own.
 */
const SKIN_SURFACE = /* glsl */ `
float amRough = 0.62, amCoat = 0.3, amSheen = 0.4, amGran = 0.0, amThinK = vThin;
vec2 amGranP = vec2(0.0);
{
  float s = vSkin.x;
  float y = vSkin.y;
  float side = vRest.x >= 0.0 ? 1.0 : -1.0;
  vec2 P = vSkin;
  float top = amDorsalY(s), bot = -amVentralY(s);
  float hrel = clamp((y - bot) / max(top - bot, 1e-3), 0.0, 1.0);
  // countershaded ground: the back a shade darker, the belly paler
  vec3 col = mix(uBelly, uBase, smoothstep(0.18, 0.62, hrel));
  float dark = uDark;
#ifndef AMH_LOW
  // the 網目: pale spots in a darker net, tighter on the head. The net is the skin between the spots, darkest where
  // three spots meet, with fine dark seams along the cells' borders
  float cell = mix(0.019, 0.031, smoothstep(0.08, 0.42, s));
  vec2 cid;
  vec3 c = amCells(P / cell + uSeed + side * vec2(13.7, 5.3), cid);
  float rad = uAmt.w * (0.6 + 0.75 * c.z);
  // the spots lie under a translucent skin: a soft edge, a brighter heart, the edge blurred more where the skin is thick
  float aa = fwidth(c.x);
  float soft = 0.1 + 0.06 * (1.0 - vThin);
  float spot = 1.0 - smoothstep(rad - soft - aa, rad + 0.09 + aa, c.x);
  float heart = 1.0 - smoothstep(0.0, rad * 0.7 + aa, c.x);
  float seam = 1.0 - smoothstep(0.02, 0.14 + 0.05 * dark, c.y - c.x);
  float between = smoothstep(rad + 0.02, rad + 0.32, c.x);
  float net = clamp(0.55 * seam + 0.75 * between, 0.0, 1.0);
  float mott = amNoise(P * 18.0 + uSeed * 0.37 + side * 3.1);
  col *= 0.88 + 0.24 * amNoise(P * 41.0 + uSeed * 1.7);
  col = mix(col, uNet, net * clamp(uAmt.x * (0.55 + 0.6 * mott) + 0.35 * dark, 0.0, 1.0));
  // a few cells lack their spot, a few spots are brighter (the photographs' irregular rows)
  float spotK = uAmt.y * step(0.1, c.z) * (0.7 + 0.4 * amHash(cid + 3.1));
  col = mix(col, uSpot * (0.88 + 0.2 * amHash(cid + 9.4)), spot * clamp(spotK, 0.0, 1.0) * (1.0 - 0.45 * dark));
  col = mix(col, uSpot * 1.12, heart * clamp(spotK, 0.0, 1.0) * 0.35 * (1.0 - 0.5 * dark));
  // small pale dots scattered in the net between the big spots (sparser on the belly)
  {
    vec2 sid;
    vec3 d = amCells(P / (cell * 0.36) + uSeed * 1.9 + side * 4.4, sid);
    float on = step(0.62, d.z) * between * (0.5 + 0.5 * hrel);
    float dot1 = 1.0 - smoothstep(0.18, 0.34 + fwidth(d.x), d.x);
    col = mix(col, uSpot * 0.95, dot1 * on * uAmt.y * 0.55 * (1.0 - 0.6 * dark));
  }
  // saddles: darker bands under the spine, mid-body and over the peduncle, ragged at the edges; and loose blotches
  float rag = (amNoise(P * 22.0 + uSeed) - 0.5) * 0.05;
  float sad = max(max(1.0 - smoothstep(0.03, 0.07, abs(s + rag - 0.31)), 1.0 - smoothstep(0.03, 0.075, abs(s + rag - 0.5))), 1.0 - smoothstep(0.02, 0.05, abs(s + rag - 0.665)));
  sad *= smoothstep(0.25, 0.7, hrel + 0.25 * (amNoise(P * 9.0 + uSeed * 1.3) - 0.5));
  float blot = smoothstep(0.55, 0.8, amNoise(P * 7.0 + uSeed * 2.1 + side * 7.0));
  float bk = clamp(uAmt.z + 0.75 * dark, 0.0, 1.0) * max(sad, 0.6 * blot) * (0.55 + 0.45 * net);
  col = mix(col, uBlotch, bk);
  // fine melanophores: tiny dark stars, denser on the back and in a dark mood (they spread as the fish darkens), faded
  // out where they would be under a pixel; and the odd pale fleck of an iridophore
  {
    vec2 mp = P * 420.0 + side * 31.0;
    vec2 mi = floor(mp), mf = fract(mp) - 0.5;
    vec2 jo = (vec2(amHash(mi + 1.3), amHash(mi + 7.1)) - 0.5) * 0.5;
    float mr = 0.16 + 0.22 * dark;
    float mel = step(0.86 - 0.12 * hrel - 0.1 * dark, amHash(mi)) * (1.0 - smoothstep(mr * 0.5, mr, length(mf - jo)));
    float vis = 1.0 - smoothstep(0.25, 0.7, fwidth(mp.x));
    col = mix(col, uNet * 0.35, mel * 0.55 * vis * (1.0 - 0.6 * spot));
    float fl = step(0.985, amHash(mi + 19.0)) * (1.0 - smoothstep(0.1, 0.25, length(mf - jo)));
    col = mix(col, uSpot * 1.2, fl * 0.5 * vis);
  }
  // the granules: a dome per prickly scale (normal perturbation below), sparkling a little
  vec2 gid;
  vec3 g = amCells(P / 0.0038 + side * 71.0, gid);
  float dome = max(0.0, 1.0 - g.x * g.x / 0.36);
  amGran = sqrt(dome) * (0.7 + 0.3 * g.z);
  amGranP = P / 0.0038;
  // each granule's tip catches a little light: a faint stipple
  col *= 0.975 + 0.045 * amGran * (1.0 - smoothstep(0.3, 0.8, fwidth(amGranP.x)));
#else
  // the far tier: the pattern's average tone, with a soft hint of the saddles, and the eye painted in
  col = mix(col, mix(uNet, uSpot, 0.45), 0.4);
  col = mix(col, uBlotch, clamp(uAmt.z + 0.75 * dark, 0.0, 1.0) * 0.5 * smoothstep(0.35, 0.7, hrel) * (1.0 - smoothstep(0.04, 0.08, abs(s - 0.5))));
  float re = length(vec2((s - ${f(EYE.s)}) / 1.1, y - ${f(EYE.y)})) / ${f(EYE.r * 0.8)};
  col = mix(col, mix(vec3(0.02, 0.02, 0.02), vec3(0.4, 0.28, 0.1), smoothstep(0.4, 0.6, re)), 1.0 - smoothstep(0.85, 1.0, re));
#endif
  // the pelvic flap's dark tip, and a dark edge along the bases of the soft dorsal and anal fins
  float flapTip = (1.0 - smoothstep(0.035, 0.07, y - bot)) * (1.0 - smoothstep(0.035, 0.07, abs(s - 0.428)));
  col = mix(col, uBlotch * 0.5, flapTip * 0.85);
  float finEdge = (1.0 - smoothstep(0.0, 0.012, top - y)) * step(${f(DORSAL.s0)}, s) * step(s, ${f(DORSAL.s1)})
                + (1.0 - smoothstep(0.0, 0.012, y - bot)) * step(${f(ANAL.s0)}, s) * step(s, ${f(ANAL.s1)});
  col = mix(col, uNet * 0.6, clamp(finEdge, 0.0, 1.0) * 0.55);
  // the eye: a pale ring of skin round the socket
  float de = length(vec2((s - ${f(EYE.s)}) / 1.1, y - ${f(EYE.y)}));
  // (the ring round the eye is on the skin that covers the eyeball's edge, part 8 below)
  // lips: pale, a little pink; the mouth's line between them, which opens with the jaw
  float lip = 1.0 - smoothstep(0.012, 0.03, s);
  col = mix(col, mix(uBelly, vec3(0.62, 0.42, 0.36), 0.55), lip * 0.7);
  float gy = ${f(GAPE.y0)} + ${f(GAPE.slope)} * s;
  float mouth = (1.0 - smoothstep(0.0009, 0.0024, abs(y - gy))) * (1.0 - smoothstep(${f(GAPE.s - 0.004)}, ${f(GAPE.s + 0.002)}, s));
  col = mix(col, vec3(0.09, 0.035, 0.03), mouth);
  amRough = mix(amRough, 0.42, lip);
  // the gill slit: a short dark oblique cut in front of the pectoral
  {
    vec2 a = vec2(${f(GILL.s0)}, ${f(GILL.y0)}), b = vec2(${f(GILL.s1)}, ${f(GILL.y1)});
    vec2 pa = P - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    col = mix(col, uNet * 0.4, (1.0 - smoothstep(0.0008, 0.0026, d)) * 0.7);
    col = mix(col, uSpot, (1.0 - smoothstep(0.0015, 0.004, abs(d - 0.0035))) * 0.15);
  }
  // the pectoral's base: a pale fleshy lobe
  col = mix(col, mix(col, uSpot, 0.5), (1.0 - smoothstep(0.006, 0.014, length(vec2(s - ${f(PEC.s)}, (y - ${f(PEC.y)}) * 0.5)))) * 0.6);
  // the spine: dark brown with paler barbs; its membrane darker still; the filaments white
  if (vPart > 3.5 && vPart < 4.5) {
    float u = clamp((y - amDorsalY(${f(SPINE_D1.s)})) / ${f(SPINE_D1.len)}, 0.0, 1.0);
    col = mix(uBase * 0.8, uNet * 0.7, smoothstep(0.1, 0.6, u));
    col = mix(col, uSpot * 0.8, 0.25 * (1.0 - smoothstep(0.0, 0.15, u)));
    amRough = 0.45; amThinK = 0.25; amGran = 0.0;
  } else if (vPart > 4.5 && vPart < 5.5) {
    col = mix(uSpot, vec3(0.8, 0.78, 0.72), 0.4);
    amRough = 0.5; amThinK = 1.0; amGran = 0.0;
  } else if (vPart > 5.5 && vPart < 6.5) {
    col = uNet * 0.55;
    amThinK = 0.8; amGran = 0.0;
  } else if (vPart > 7.5) {
    // the skin over the eyeball's edge: the cheek's pattern on a fleshy ring, a pale ring round the opening (paler in
    // some fish than others), a thin dark wet margin at the opening itself, the margin thin enough to glow
    float t = vThin;
    col = mix(col, mix(col, uSpot, 0.7), uEyeRing * smoothstep(0.35, 0.6, t) * (1.0 - smoothstep(0.7, 0.88, t)));
    col = mix(col, uBase * 0.55, smoothstep(0.86, 0.97, t) * 0.7);
    amRough = mix(0.62, 0.42, smoothstep(0.6, 1.0, t));
    amCoat = 0.15;
    amSheen = 0.15;
    amThinK = 0.25 + 0.6 * smoothstep(0.7, 1.0, t);
    amGran *= 1.0 - smoothstep(0.5, 0.8, t);
  } else if (vPart > 6.5) {
    // the far tiers' small eye: dark pupil, golden iris, a pale ring
    float r = length(vec2((s - ${f(EYE.s)}) / 1.0, y - ${f(EYE.y)})) / ${f(EYE.r * 0.8)};
    col = mix(vec3(0.015, 0.02, 0.02), vec3(0.42, 0.3, 0.1), smoothstep(0.35, 0.45, r));
    col = mix(col, uSpot, smoothstep(0.85, 1.0, r));
    amRough = 0.15; amCoat = 1.0; amGran = 0.0; amSheen = 0.0;
  } else if (vPart > 1.5 && vPart < 2.5) {
    col = mix(uBase, uNet, 0.4) * 0.85;
    amThinK = 0.8; amGran = 0.0;
  }
  col *= 1.0 - 0.3 * dark;
  diffuseColor.rgb = col;
}
`;

/** the skin's granules as bumps (screen-space derivatives of their height), fading out where they are sub-pixel */
const SKIN_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#ifndef AMH_LOW
{
  float fw = max(fwidth(amGranP.x), fwidth(amGranP.y));
  float k = 1.0 - smoothstep(0.35, 0.9, fw);
  if (k > 0.0) {
    float h = amGran * 0.00045 * ${f(MODEL_TL)} * k;
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    normal = normalize(abs(det) * normal - grad);
  }
}
#endif
`;

const THIN_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  // a small fish is soft, half-clear tissue: light goes into it and comes out elsewhere, warmed by the blood and
  // pigment it passed. amThinK is how much gets through here (the flap, the knife edges, the fin bases, the filaments
  // most; the thick middle of the body least)
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 L = amSunDir();
  vec3 sunIn = amSunCol() * amSunThrough();
  vec3 tissue = diffuseColor.rgb * vec3(1.15, 0.92, 0.72);
  // the water's light from behind the fish, seen through it
  vec3 through = amUnderwater(vW, 0.8);
  totalEmissiveRadiance += tissue * through * (0.12 + 0.85 * amThinK);
  // the sun behind it: a glow toward the sun's side
  float back = pow(clamp(dot(vW, L), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += tissue * sunIn * back * (0.02 + 0.3 * amThinK);
  // light bleeding round from the lit side into the shaded side (soft terminator)
  float wrapL = clamp((dot(nW, L) + 0.45) / 1.45, 0.0, 1.0) - clamp(dot(nW, L), 0.0, 1.0);
  totalEmissiveRadiance += tissue * sunIn * wrapL * (0.05 + 0.12 * amThinK) * RECIPROCAL_PI;
  // a faint milky rim where the view grazes the skin: the scattering in its outer layer
  float fr = pow(1.0 - clamp(abs(dot(nW, vW)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * amUnderwater(nW, 1.0) * fr * 0.22;
}
`;

// ------------------------------------------------------------------ the individual's look

export interface Palette {
  name: string;
  base: Color;
  belly: Color;
  spot: Color;
  net: Color;
  blotch: Color;
  /** net, spots, saddles, spot size (cell-relative radius) */
  amt: [number, number, number, number];
  eyeRing: number;
  /** soft fins: the rays' tint; caudal: the bars' colour and strength */
  fin: Color;
  bar: Color;
  barAmt: number;
  /** a golden iris (else pale silvery cream) */
  goldEye: boolean;
}

const c = (r: number, g: number, b: number) => new Color(r, g, b);
/**
 * Individual looks after the photographs (linear colour): the orange white-spotted fish, the brown reticulate one,
 * the olive-green one of the eelgrass, the grey-brown blue-dotted one, the yellow one, the dark mottled young, the
 * rusty one with faint spots, the pale one with brown saddles.
 */
export const PALETTES: Palette[] = [
  { name: 'orange', base: c(0.42, 0.16, 0.03), belly: c(0.6, 0.32, 0.1), spot: c(0.82, 0.7, 0.5), net: c(0.2, 0.07, 0.015), blotch: c(0.16, 0.06, 0.015), amt: [0.35, 0.95, 0.15, 0.33], eyeRing: 0.6, fin: c(0.5, 0.26, 0.07), bar: c(0.15, 0.05, 0.015), goldEye: true, barAmt: 0.85 },
  { name: 'reticulate', base: c(0.17, 0.11, 0.045), belly: c(0.42, 0.33, 0.17), spot: c(0.6, 0.53, 0.36), net: c(0.06, 0.035, 0.015), blotch: c(0.05, 0.03, 0.012), amt: [0.85, 0.8, 0.35, 0.28], eyeRing: 0.3, fin: c(0.36, 0.22, 0.1), bar: c(0.08, 0.04, 0.015), goldEye: true, barAmt: 0.75 },
  { name: 'olive', base: c(0.2, 0.17, 0.045), belly: c(0.4, 0.36, 0.12), spot: c(0.55, 0.55, 0.36), net: c(0.08, 0.07, 0.02), blotch: c(0.07, 0.06, 0.02), amt: [0.4, 0.55, 0.12, 0.27], eyeRing: 0.2, fin: c(0.34, 0.3, 0.12), bar: c(0.1, 0.08, 0.03), goldEye: false, barAmt: 0.7 },
  { name: 'grey', base: c(0.11, 0.085, 0.07), belly: c(0.24, 0.21, 0.18), spot: c(0.52, 0.56, 0.6), net: c(0.05, 0.035, 0.03), blotch: c(0.04, 0.03, 0.025), amt: [0.35, 0.85, 0.2, 0.23], eyeRing: 0.15, fin: c(0.3, 0.24, 0.18), bar: c(0.07, 0.05, 0.04), goldEye: false, barAmt: 0.6 },
  { name: 'yellow', base: c(0.48, 0.32, 0.03), belly: c(0.62, 0.48, 0.1), spot: c(0.85, 0.82, 0.6), net: c(0.22, 0.14, 0.02), blotch: c(0.2, 0.12, 0.02), amt: [0.25, 0.65, 0.08, 0.20], eyeRing: 0.4, fin: c(0.55, 0.42, 0.1), bar: c(0.25, 0.12, 0.03), goldEye: true, barAmt: 0.5 },
  { name: 'dark', base: c(0.06, 0.035, 0.018), belly: c(0.22, 0.16, 0.09), spot: c(0.55, 0.5, 0.4), net: c(0.025, 0.015, 0.008), blotch: c(0.02, 0.012, 0.006), amt: [0.6, 0.9, 0.45, 0.31], eyeRing: 0.25, fin: c(0.25, 0.17, 0.1), bar: c(0.05, 0.03, 0.015), goldEye: false, barAmt: 0.85 },
  { name: 'rust', base: c(0.3, 0.12, 0.04), belly: c(0.45, 0.25, 0.1), spot: c(0.6, 0.45, 0.32), net: c(0.13, 0.05, 0.02), blotch: c(0.1, 0.04, 0.015), amt: [0.25, 0.35, 0.1, 0.25], eyeRing: 0.2, fin: c(0.45, 0.22, 0.09), bar: c(0.14, 0.05, 0.02), goldEye: true, barAmt: 0.55 },
  { name: 'saddled', base: c(0.4, 0.33, 0.22), belly: c(0.6, 0.55, 0.45), spot: c(0.75, 0.72, 0.62), net: c(0.16, 0.08, 0.03), blotch: c(0.13, 0.06, 0.02), amt: [0.55, 0.6, 0.8, 0.31], eyeRing: 0.35, fin: c(0.5, 0.4, 0.3), bar: c(0.17, 0.08, 0.03), goldEye: false, barAmt: 0.8 },
];
/** how often each look turns up in the eelgrass (the olive and brown ones match the leaves) */
export const PALETTE_WEIGHTS = [0.14, 0.22, 0.22, 0.1, 0.06, 0.1, 0.08, 0.08];

export function pickPalette(u: number): number {
  let acc = 0;
  for (let i = 0; i < PALETTE_WEIGHTS.length; i++) { acc += PALETTE_WEIGHTS[i]; if (u < acc) return i; }
  return 0;
}

export interface SkinLook {
  palette: number;
  /** pattern offset, so no two fish share a spot */
  seed: Vector2;
  /** small shifts of the palette's brightness and hue (−1..1) */
  value: number;
  warmth: number;
}

// ------------------------------------------------------------------ materials

/** per-fish uniforms of the skin and fins */
export interface AmhLookUniforms {
  uBase: IUniform<Color>;
  uBelly: IUniform<Color>;
  uSpot: IUniform<Color>;
  uNet: IUniform<Color>;
  uBlotch: IUniform<Color>;
  uAmt: IUniform<Vector4>;
  uSeed: IUniform<Vector2>;
  uDark: IUniform<number>;
  uEyeRing: IUniform<number>;
  uFin: IUniform<Color>;
  uBar: IUniform<Color>;
  uBarAmt: IUniform<number>;
  uIris: IUniform<Color>;
  uIrisRim: IUniform<Color>;
}

function lookUniforms(look: SkinLook): AmhLookUniforms {
  const p = PALETTES[look.palette % PALETTES.length];
  const adj = (col: Color) => {
    const k = 1 + 0.18 * look.value;
    return col.clone().multiplyScalar(k).multiply(new Color(1 + 0.06 * look.warmth, 1, 1 - 0.08 * look.warmth));
  };
  return {
    uBase: { value: adj(p.base) }, uBelly: { value: adj(p.belly) }, uSpot: { value: adj(p.spot) }, uNet: { value: adj(p.net) }, uBlotch: { value: adj(p.blotch) },
    uAmt: { value: new Vector4(...p.amt) }, uSeed: { value: look.seed.clone() }, uDark: { value: 0 }, uEyeRing: { value: p.eyeRing },
    uFin: { value: adj(p.fin) }, uBar: { value: adj(p.bar) }, uBarAmt: { value: p.barAmt },
    // the iris: pale silvery cream in most, gold in the warm-coloured fish; a little of each fish's own
    uIris: { value: (p.goldEye ? new Color(0.46, 0.3, 0.09) : new Color(0.5, 0.47, 0.38)).multiplyScalar(1 + 0.12 * look.value) },
    uIrisRim: { value: p.goldEye ? new Color(0.28, 0.12, 0.03) : new Color(0.36, 0.2, 0.08) },
  };
}

function skinMaterial(u: AmhLookUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.6,
    clearcoat: low ? 0 : 0.32, clearcoatRoughness: 0.34,
    sheen: low ? 0 : 0.35, sheenRoughness: 0.5, sheenColor: new Color(0.5, 0.46, 0.4),
    side: FrontSide,
  });
  m.name = low ? 'AmimehagiSkinLOD2' : 'AmimehagiSkin';
  m.envMapIntensity = 0.25;
  if (low) m.defines = { AMH_LOW: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPart = aPart; vThin = aThin; vSkin = aSkin; vRest = position / ${f(MODEL_TL)};`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKIN_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SKIN_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(amRough - 0.12 * amGran, 0.08, 1.0);')
      .replace('#include <normal_fragment_maps>', SKIN_NORMAL)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = amCoat;
#endif
#ifdef USE_SHEEN
  material.sheenColor *= amSheen * (0.25 + 0.75 * diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), 0.05));
#endif`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', THIN_EMISSIVE);
  };
  m.customProgramCacheKey = () => (low ? 'amimehagi-skin-low-v2' : 'amimehagi-skin-v2');
  return m;
}

const FIN_VERT_PARS = /* glsl */ `
attribute vec3 aFin;
varying vec3 vFin;
varying vec3 vWPos;
`;

const FIN_FRAG_PARS = /* glsl */ `
varying vec3 vFin;
uniform vec3 uFin;
uniform vec3 uBar;
uniform float uBarAmt;
uniform float uDark;
`;

/** fin membranes: ray-resolution rays with joints, branching toward the edge; the tail's dark bars */
const FIN_SURFACE = /* glsl */ `
{
  float a = vFin.x, t = vFin.y, id = vFin.z;
  float nR = id < 0.5 ? ${f(CAUDAL.rays)} : id < 1.5 ? ${f(DORSAL.rays)} : id < 2.5 ? ${f(ANAL.rays)} : ${f(PEC.rays)};
  float x = a * (nR - 1.0);
  float w = max(fwidth(x), 0.03);
  float ray = 1.0 - smoothstep(0.07, 0.13 + w, abs(fract(x + 0.5) - 0.5));
  // soft rays fork toward their tips
  float fork = smoothstep(0.5, 0.75, t) * (1.0 - smoothstep(0.05, 0.1 + w, abs(fract(x) - 0.5))) * (id < 0.5 ? 1.0 : 0.6);
  float joint = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.18, abs(fract(t * (id < 0.5 ? 11.0 : 7.0)) - 0.5)));
  float r = max(ray * joint, fork * 0.75);
  // the free edge is ragged between the rays' tips
  float edge = 1.0 - 0.06 * (1.0 - ray) - 0.025 * amHash(vec2(floor(x * 2.0), id));
  if (t > edge) discard;
  float alpha = (id < 0.5 ? 0.32 : id > 2.5 ? 0.16 : 0.22) * (1.0 - 0.3 * t) + (id < 0.5 ? 0.5 : 0.45) * r;
  // a clear membrane faintly tinted, the rays the body's colour, paler toward their tips
  vec3 col = mix(mix(vec3(0.5, 0.5, 0.46), uFin * 1.3, 0.5), uFin * mix(1.25, 1.7, t), r);
  if (id < 0.5) {
    // the tail's bars: three or four rows of dark dashes across the rays, the membrane darkened between them
    float bar = smoothstep(0.35, 0.75, sin(t * 6.2832 * 1.85 - 1.2 + 0.4 * (a - 0.5) * (a - 0.5)) * 0.5 + 0.5);
    bar *= smoothstep(0.08, 0.2, t);
    col = mix(col, uBar, bar * uBarAmt * (0.45 + 0.55 * r));
    alpha = mix(alpha, max(alpha, 0.62), bar * uBarAmt * (0.35 + 0.65 * r));
    // the base of the tail is fleshy, carrying the body's colour onto the fin
    col = mix(col, uBar * 1.6, 1.0 - smoothstep(0.0, 0.1, t));
    alpha = mix(alpha, 0.9, 1.0 - smoothstep(0.02, 0.1, t));
  } else if (id < 2.5) {
    // the soft dorsal and anal: clear, the rays faintly yellow-brown, a dusky line at the base
    col = mix(col, uBar * 1.4, (1.0 - smoothstep(0.0, 0.1, t)) * 0.6);
    alpha = max(alpha, 0.6 * (1.0 - smoothstep(0.0, 0.08, t)));
  } else {
    alpha *= 0.85;
  }
  col *= 1.0 - 0.35 * uDark;
  alpha *= smoothstep(0.0, 0.04, edge - t);
  diffuseColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

function finMaterial(u: AmhLookUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.38, transparent: true, depthWrite: false, side: DoubleSide });
  m.name = 'AmimehagiFin';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFin = aFin;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FIN_SURFACE}`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the membrane is thin living tissue: it scatters the light it is bathed in from both sides
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += diffuseColor.rgb * ((amUnderwater(nW, 1.0) + amUnderwater(-nW, 1.0)) * 0.22 + amSunCol() * amSunThrough() * back * 0.1);
}`);
  };
  m.customProgramCacheKey = () => 'amimehagi-fin-v1';
  return m;
}

const EYE_VERT_PARS = /* glsl */ `
attribute vec3 aEye;
varying vec3 vEye;
varying vec3 vWPos;
`;

/**
 * the eye, as in close photographs of live fish: a round black pupil that glows deep blue to blue-green where it
 * catches the light (the eye's reflecting layer), an iris pale silvery cream or gold (the individual's) with fine
 * radial fibres, a brighter collar round the pupil and an orange-brown outer zone running under the skin's edge
 */
const EYE_SURFACE = /* glsl */ `
float amEyeRough = 0.2, amPupil = 0.0, gAmRp = 0.0;
{
  float th = vEye.x * 1.2, psi = vEye.y;
  vec2 dir = vec2(cos(psi), sin(psi));
  vec2 q = dir * th;
  // the opening's edge (the skin over the ball) is at about 0.75 rad from the axis
  float r = th / 0.75;
  float rp = length(q / vec2(0.3, 0.29));
  gAmRp = rp;
  float aa = fwidth(rp) + 1e-4;
  // radial fibres (noise on the direction, stretched along the radius), crypts, a few dark flecks
  float fib = amNoise(dir * 26.0 + vec2(th * 6.0, 0.0)) * 0.55 + amNoise(dir * 61.0 + vec2(0.0, th * 9.0)) * 0.45;
  vec3 iris = uIris * (0.72 + 0.56 * fib);
  iris = mix(iris, uIris * 1.35 + vec3(0.06, 0.04, 0.0), (1.0 - smoothstep(0.0, 0.18, rp - 1.0)) * 0.7);
  iris = mix(iris, uIrisRim, smoothstep(0.62, 0.95, r));
  iris *= 1.0 - 0.45 * step(0.9, amHash(floor(dir * 30.0 + th * 18.0)));
  // a thin dark ring at the pupil's edge, then the pupil
  iris *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.08, rp - 1.0));
  amPupil = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rp);
  vec3 col = mix(iris, vec3(0.003, 0.008, 0.016), amPupil);
  // under the skin's edge the ball is dark
  col = mix(col, vec3(0.04, 0.03, 0.02), smoothstep(0.98, 1.06, r));
  amEyeRough = mix(0.14, 0.45, smoothstep(0.95, 1.05, r));
  diffuseColor.rgb = col;
}
`;

function eyeMaterial(u: AmhLookUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.376,
    iridescence: 0.35, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 500],
  });
  m.name = 'AmimehagiEye';
  m.envMapIntensity = 0.3;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${EYE_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEye = aEye;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEye;\nuniform vec3 uIris;\nuniform vec3 uIrisRim;')
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = amEyeRough;')
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the pupil's deep blue glow: light sent back by the reflecting layer behind the retina, strongest head-on
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float head = pow(clamp(-dot(nW, vW), 0.0, 1.0), 1.5);
  // (a dark core, the blue gathering toward the pupil's rim and where the eye faces the viewer)
  float rim = smoothstep(0.2, 1.0, gAmRp);
  totalEmissiveRadiance += amPupil * vec3(0.02, 0.12, 0.26) * (amUnderwater(nW, 1.0) * 1.2 + amSunCol() * amSunThrough() * 0.02) * (0.25 + 0.75 * head) * (0.3 + 0.7 * rim);
  // the iris is thin tissue too: a little of the light round it comes through
  totalEmissiveRadiance += (1.0 - amPupil) * diffuseColor.rgb * amUnderwater(nW, 1.0) * 0.18;
}`);
  };
  m.customProgramCacheKey = () => 'amimehagi-eye-v2';
  return m;
}

/** One fish's own materials: skin for the near tiers and the far tier, and its fins. */
export class AmimehagiLook {
  readonly uniforms: AmhLookUniforms;
  readonly skin: MeshPhysicalMaterial;
  readonly skinLow: MeshPhysicalMaterial;
  readonly fins: MeshPhysicalMaterial;
  readonly eyes: MeshPhysicalMaterial;
  readonly palette: Palette;

  constructor(readonly look: SkinLook) {
    this.uniforms = lookUniforms(look);
    this.palette = PALETTES[look.palette % PALETTES.length];
    this.skin = skinMaterial(this.uniforms, false);
    this.skinLow = skinMaterial(this.uniforms, true);
    this.fins = finMaterial(this.uniforms);
    this.eyes = eyeMaterial(this.uniforms);
  }

  /** frightened or asleep: darker and blotchier (0 .. 1) */
  set dark(v: number) { this.uniforms.uDark.value = v; }
  get dark(): number { return this.uniforms.uDark.value; }

  dispose(): void {
    this.skin.dispose();
    this.skinLow.dispose();
    this.fins.dispose();
    this.eyes.dispose();
  }
}

let lastTick = -1;
/** Advance the materials' clock (call every frame; repeated calls with the same time are free). */
export function tickAmimehagiMaterials(seconds: number): void {
  if (seconds === lastTick) return;
  lastTick = seconds;
  AMH_UNIFORMS.uAmhTime.value = seconds % 3600;
}
