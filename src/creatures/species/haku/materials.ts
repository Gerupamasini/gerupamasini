import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { EYE, GAPE, MODEL_TL, OPER_BONE_PTS, OPER_EDGE_PTS, PEC, PREOP_EDGE_PTS } from './anatomy';

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
 * Shared materials of the ハク: standard PBR (MeshPhysicalMaterial: metalness/roughness, clearcoat for the mucus and
 * the cornea, thin-film iridescence) with the pattern and the underwater light worked in through onBeforeCompile, so
 * every fish of every school draws with one of a handful of material objects (one shader program per tier).
 *
 * Silver: the flank is a guanine mirror (metalness ≈ 0.86, a near-white F0, roughness ≈ 0.22) under a golden-olive,
 * peppered back. A mirror under water shows the water around it, so the reflection is not the sky cube but the light
 * field of shallow silty water: the sky squeezed into Snell's window overhead, the olive glow of the water at the
 * sides, the sunlit bottom below. Seen from above a ハク is a grey-olive sliver with pale edges; when it rolls the
 * flank to the window, it flashes. The reflectors are not all parallel to the skin: fine upright streaks lean up or
 * down, each overlapping scale is tilted a little its own way, the gill cover is crumpled foil, so a moving fish
 * glitters. (For comparison with photographs taken in a tank, `uAir` swaps the water's light field for the room's.)
 *
 * Also: the dark rim, silver iris and glossy cornea of the eye, the gill cover's folds, the crown's brown blotches, the
 * orange patch on the snout, the translucent lips, and the thin caudal peduncle letting the bottom's light through.
 * Fins are a separate transparent material: a milky membrane that scatters the light around it, rays that branch
 * toward the edge, spines on the first dorsal, a few melanophores at the base of the tail.
 */

export const HAKU_UNIFORMS = {
  uHakuTime: { value: 0 } as IUniform<number>,
  /** olive glow of the silty water at full daylight (matches the water pass's in-scatter colour) */
  uWaterTint: { value: new Color(0.16, 0.172, 0.14) } as IUniform<Color>,
  /** bottom albedo seen in the fish's lower flank */
  uSandTint: { value: new Color(0.3, 0.26, 0.19) } as IUniform<Color>,
  /** how much of the environment cube shows in Snell's window */
  uSkyGain: { value: 0.5 } as IUniform<number>,
  /** strength of the ripple caustics on the fish */
  uCaustic: { value: 0.55 } as IUniform<number>,
  /** 0 under water; 1 for a fish photographed in a tank, its mirror showing the room (the reference viewer) */
  uAir: { value: 0 } as IUniform<number>,
};

// ------------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
attribute vec3 aBody;
attribute vec2 aPat;
attribute float aPart;
attribute float aOcc;
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
varying vec3 vRest;
varying float vOcc;
varying vec3 vWPos;
`;

const FIN_VERT_PARS = /* glsl */ `
attribute vec3 aFin;
varying vec3 vFin;
varying vec3 vWPos;
`;

/** helpers that need the light uniforms: placed just before main() */
const HELPERS = /* glsl */ `
uniform float uHakuTime;
uniform vec3 uWaterTint;
uniform vec3 uSandTint;
uniform float uSkyGain;
uniform float uCaustic;
uniform float uAir;
varying vec3 vWPos;

float hkHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hkHash3(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float hkNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hkHash(i), hkHash(i + vec2(1.0, 0.0)), f.x), mix(hkHash(i + vec2(0.0, 1.0)), hkHash(i + vec2(1.0, 1.0)), f.x), f.y); }

vec3 hkSunDir() {
#if NUM_DIR_LIGHTS > 0
  return normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix));
#else
  return vec3(0.3, 0.9, 0.3);
#endif
}
vec3 hkSunCol() {
#if NUM_DIR_LIGHTS > 0
  return directionalLights[0].color;
#else
  return vec3(1.0);
#endif
}
vec3 hkSky() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].skyColor;
#else
  return ambientLightColor;
#endif
}
vec3 hkGround() {
#if NUM_HEMI_LIGHTS > 0
  return hemisphereLights[0].groundColor;
#else
  return ambientLightColor * 0.5;
#endif
}
// the silt's own glow (in-scattered daylight), following the daylight like the water pass does
vec3 hkWaterGlow() {
  float lum = dot(hkSky(), vec3(0.2126, 0.7152, 0.0722));
  return uWaterTint * (0.06 + 0.94 * clamp((lum - 0.042) / 0.158, 0.0, 1.25));
}
// the sky as seen from under the water through Snell's window (direction d has d.y > 0 inside the 48.6° cone)
vec3 hkWindow(vec3 d, float rough) {
  vec2 h = d.xz * 1.333;
  float hl = length(h);
  vec3 a = hl < 0.995 ? vec3(h.x, sqrt(1.0 - hl * hl), h.y) : normalize(vec3(h.x, 0.1, h.y));
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  vec3 s = textureCubeUV(envMap, envMapRotation * a, max(rough, 0.04)).rgb;
  return min(s, vec3(4.0)) * uSkyGain;
#else
  return hkSky() * 2.2 + hkSunCol() * 0.15;
#endif
}
// radiance arriving from direction d at a fish a few centimetres under the surface of shallow, silty water
vec3 hkUnderwater(vec3 d, float rough) {
  vec3 glow = hkWaterGlow();
  float up = d.y;
  // Snell's window: inside cos 48.6° = 0.66 the sky, softened by roughness and by the ripples
  float w = smoothstep(0.6 - rough * 0.3, 0.74 + rough * 0.08, up);
  // just outside it the surface mirrors the water below (total internal reflection), a little brighter than the side
  vec3 tir = glow * 1.18;
  // below: the sunlit bed through a few centimetres of silt
  vec3 L = hkSunDir();
  vec3 bed = uSandTint * (hkSunCol() * max(L.y, 0.0) * 0.85 + hkSky() * 0.6 + hkGround() * 0.4) * RECIPROCAL_PI;
  vec3 below = mix(glow, bed, 0.6);
  vec3 c = mix(glow, tir, smoothstep(0.05, 0.5, up));
  c = mix(c, below, smoothstep(0.0, -0.45, up));
  c = mix(c, hkWindow(d, rough), w);
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  if (uAir > 0.0) c = mix(c, textureCubeUV(envMap, envMapRotation * d, max(rough, 0.04)).rgb * uSkyGain, uAir);
#endif
  return c;
}
// ripple caustics playing over the fish (bright net drifting with the waves), around 1.0
float hkCaustic(vec3 p) {
  vec2 q = p.xz * 26.0 + vec2(uHakuTime * 0.21, -uHakuTime * 0.13);
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    q = mat2(1.6, 1.2, -1.2, 1.6) * q + vec2(uHakuTime * (0.35 + 0.2 * fi), uHakuTime * 0.27);
    c += abs(sin(q.x + 1.7 * sin(q.y * 0.9 + uHakuTime * 0.8)) * sin(q.y + 1.5 * sin(q.x * 1.1 - uHakuTime * 0.6)));
  }
  c *= 0.5;
  return 0.62 + 1.25 * pow(1.0 - c, 4.0) * 1.6;
}
`;

/** what replaces the indirect lighting's environment: the underwater light field */
const ENV_INJECT = /* glsl */ `
#include <lights_fragment_maps>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);   // camera → point
  vec3 rW = reflect(vW, nW);
  radiance += hkUnderwater(rW, material.roughness);
  iblIrradiance += PI * hkUnderwater(nW, 1.0) * 0.45;
#ifdef USE_CLEARCOAT
  vec3 cW = reflect(vW, inverseTransformDirection(clearcoatNormal, viewMatrix));
  clearcoatRadiance += hkUnderwater(cW, material.clearcoatRoughness);
#endif
}
`;

/** caustics over the direct (sun) light, on the faces that look up */
const CAUSTIC_INJECT = /* glsl */ `
#include <lights_fragment_begin>
{
  float upW = inverseTransformDirection(normal, viewMatrix).y;
  float cs = mix(1.0, hkCaustic(vWPos), uCaustic * smoothstep(-0.3, 0.5, upW));
  reflectedLight.directDiffuse *= cs;
  reflectedLight.directSpecular *= cs;
}
`;

/** the body's ambient occlusion over the light it receives: indirect fully, direct (sun through the crease) mostly */
const OCC_DIRECT = /* glsl */ `
{
  float od = mix(1.0, hkOcc, 0.75);
  reflectedLight.directDiffuse *= od;
  reflectedLight.directSpecular *= od;
}
`;
const OCC_INDIRECT = /* glsl */ `
irradiance *= hkOcc;
iblIrradiance *= hkOcc;
radiance *= hkOcc;
#ifdef USE_CLEARCOAT
clearcoatRadiance *= hkOcc;
#endif
`;

const BODY_FRAG_PARS = /* glsl */ `
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
varying vec3 vRest;
varying float vOcc;
uniform vec3 uBack;
uniform float uPigment;
uniform float uSilver;
uniform float uIri;
${glslTable('hkPreopEdge', PREOP_EDGE_PTS)}
${glslTable('hkOperEdge', OPER_EDGE_PTS)}
${glslTable('hkOperBone', OPER_BONE_PTS)}
`;

/**
 * The body's surface, laid out after a lateral photograph of a live ハク (and measured against it in the reference
 * viewer's photo match): a tan dorsal band densely peppered with melanophores, its lower edge low on the shoulder and
 * high on the peduncle; under it the silver, a guanine mirror whose look is mostly the surroundings it reflects (a bright
 * streak where the flank turns up to the light, a greyer band below it, a bright lower flank); fine upright streaks in
 * the silver where the reflectors stand a little steeper; overlapping cycloid scales, each its own slightly tilted
 * mirror, their free edges showing as scallops low on the flank. On the head: the crown's tan running forward to a pale
 * gold snout with an orange-brown patch before the eye, dark vermiculations where the crown meets the silver, thick
 * pale translucent lips, the cheek and gill cover a sheet of crumpled foil; a brown spot at the pectoral base and
 * another above the gill opening. The mouth and the gill cover are geometry on the near tier (the lips' groove, the
 * mouth's lining, the plates' rims and the shadows under their free edges, the red gills in the chamber under the
 * opercle); the far tiers paint soft stand-ins for their edges.
 * Computed once at the colour stage and read again by the roughness / metalness / normal / clearcoat / iridescence
 * stages. vRest is the rest-pose position in TL units (y = height above the snout–tail axis, z = forward); hkTilt
 * leans the reflector toward the head (x) and the back (y), applied in the body's own frame.
 */
const BODY_SURFACE = /* glsl */ `
float hkMetal = 0.0, hkRough = 0.5, hkCoat = 0.15, hkIriAmt = 0.0, hkIriThick = 380.0, hkThin = 0.0;
// ambient occlusion from the geometry (the gape between the lips, the mouth, under the gill cover's edges)
float hkOcc = vOcc;
vec2 hkTilt = vec2(0.0);
{
  float s = vBody.x, cd = vBody.y;
  float part = vPart;
  float h = vRest.y;
  vec3 col;
  if (part > 0.5 && part < 1.5) {
    // ---- the eye: a silver iris, brightest round the black pupil and greyer to the thin dark rim; pale yellow low and
    // forward; the cornea glossy over it
    vec2 e = vPat;
    float r = length(e);
    vec2 pc = e + vec2(0.0, 0.05);
    float pupil = 1.0 - smoothstep(${f(EYE.pupil - 0.015)}, ${f(EYE.pupil + 0.012)}, length(pc * vec2(1.0, 1.04)));
    float rp = length(pc);
    float ang = atan(e.y, e.x);
    float mott = 0.95 + 0.05 * hkNoise(vec2(ang * 9.0, r * 5.0)) + 0.03 * hkNoise(vec2(ang * 30.0, r * 4.0));
    // bright silver round the pupil, light grey toward the rim, a brighter crescent just inside the rim high and forward
    vec3 iris = mix(vec3(0.82, 0.82, 0.81), vec3(0.6, 0.61, 0.62), smoothstep(0.4, 0.62, r));
    iris = mix(iris, vec3(0.4, 0.41, 0.43), smoothstep(0.74, 0.9, r)) * mott;
    iris = mix(iris, vec3(0.9, 0.9, 0.89), 0.5 * smoothstep(0.72, 0.88, r) * (1.0 - smoothstep(0.9, 0.95, r)) * smoothstep(-0.1, 0.6, e.y + 0.6 * e.x));
    iris = mix(iris, vec3(0.86, 0.85, 0.62), 0.5 * smoothstep(0.0, -0.5, e.y) * smoothstep(-0.3, 0.35, e.x) * smoothstep(0.75, 0.45, rp));
    iris *= 1.0 - 0.2 * (1.0 - smoothstep(${f(EYE.pupil)}, ${f(EYE.pupil + 0.07)}, rp));
    iris *= 1.0 - 0.22 * smoothstep(0.8, 0.94, r) * smoothstep(0.1, 0.8, e.y - 0.4 * e.x);
    // the thin dark rim, and past it the skin closing over the eye
    float aa = max(fwidth(r), 0.004);
    float rim = smoothstep(0.915 - aa, 0.915 + aa, r) * (1.0 - smoothstep(0.995, 1.03, r));
    vec3 skin = vec3(0.86, 0.86, 0.86);
    col = mix(iris, skin, smoothstep(0.985, 1.02, r));
    col = mix(col, vec3(0.06, 0.06, 0.065), rim);
    col = mix(col, vec3(0.0), pupil);
    hkMetal = mix(mix(0.6, 0.05, rim), 0.0, pupil);
    hkMetal = mix(hkMetal, 0.8, smoothstep(1.0, 1.04, r));
    hkRough = mix(0.26, 0.1, pupil);
    hkCoat = 1.0 - smoothstep(0.985, 1.02, r);
  } else if (part > 1.5 && part < 2.5) {
    // ---- LOD2's tail sliver: a faint grey fan
    col = vec3(0.3, 0.31, 0.3);
    hkMetal = 0.1; hkRough = 0.6; hkCoat = 0.0;
  } else if (part > 2.5 && part < 3.5) {
    // ---- the mouth's lining: pale, wet, in shadow
    col = vec3(0.42, 0.3, 0.3) * (0.85 + 0.3 * hkNoise(vRest.xz * 900.0));
    hkMetal = 0.0; hkRough = 0.4; hkCoat = 0.5;
  } else if (part > 3.5) {
    // ---- the gill cover's rounded free edge and its inner face: a pale silvery lining
    col = vec3(0.76, 0.75, 0.77);
    hkMetal = 0.45; hkRough = 0.3; hkCoat = 0.25;
    hkThin = 0.35;
  } else {
    // the pattern's coordinates: s and the arc from the dorsal midline, signed by side so that the two sides are not
    // mirror images of each other (and the crown's patterns run across its top, where the height hardly changes)
    vec2 pat = vec2(vPat.x, vBody.z < 0.0 ? -vPat.y : vPat.y);
    vec2 q = vec2(s, h);
    float trunk = smoothstep(0.2, 0.28, s);
    float headK = 1.0 - smoothstep(0.24, 0.3, s);
    // ---- the dorsal band: over the eye only the crown's top, low on the nape, then rising along the trunk
    float edge = mix(0.64, 0.56, smoothstep(0.12, 0.19, s));
    edge = mix(edge, 0.63, smoothstep(0.21, 0.28, s));
    edge = mix(edge, 0.78, smoothstep(0.3, 0.6, s));
    edge += 0.035 * (hkNoise(vec2(s * 45.0, 3.1)) - 0.5);
    float band = smoothstep(edge - 0.04, edge + 0.05, cd);
    float belly = smoothstep(-0.25, -0.75, cd);
    // ---- the snout and lips
    // the lips: the rolls either side of the gape (geometry), pale and translucent
    float gapeH = ${f(GAPE.y0)} + (${f(GAPE.y1)} - ${f(GAPE.y0)}) * clamp(s / ${f(GAPE.s)}, 0.0, 1.0);
    float lips = (1.0 - smoothstep(${f(GAPE.s - 0.004)}, ${f(GAPE.s + 0.006)}, s))
      * (h > gapeH ? 1.0 - smoothstep(0.011, 0.016, h - gapeH) : 1.0 - smoothstep(0.02, 0.027, gapeH - h));
    float snoutPatch = (1.0 - smoothstep(0.3, 1.0, length(vec2((s - 0.046) / 0.04, (h - 0.03) / 0.022)))) * (0.55 + 0.45 * hkNoise(vec2(s * 120.0, h * 120.0)));
    // forward of the nape the crown is not tan but a pale silver-gold, finely dotted
    float headTop = 1.0 - smoothstep(0.15, 0.2, s);
    float crown = headK * band;
    // ---- melanophores: dense and fine in the band, scattered on the snout, a few down the upper flank, a band at the tail's base
    // (none on the lips and the snout's front, where the pattern's s barely changes and its cells would smear into streaks)
    float dens = smoothstep(0.02, 0.032, s) * uPigment * (1.9 * band * (1.0 - 0.8 * headTop) + 0.9 * snoutPatch
      + 0.06 * smoothstep(0.0, edge, cd) * trunk + 0.5 * smoothstep(0.81, 0.84, s) * (1.0 - belly));
    float mel = 0.0;
#ifndef HAKU_LOW
    {
      vec2 mp = pat * 330.0;
      vec2 c0 = floor(mp);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = c0 + vec2(float(i), float(j));
        vec3 hh = hkHash3(c);
        if (hh.z > dens) continue;
        vec2 dv = mp - c - 0.15 - 0.7 * hh.xy;
        float rr = (0.1 + 0.2 * hh.x) * (1.0 + 0.35 * cos(5.0 * atan(dv.y, dv.x) + hh.y * 6.28));
        mel = max(mel, (1.0 - smoothstep(rr * 0.45, rr, length(dv))) * (0.55 + 0.45 * hh.y));
      }
      float fade = 1.0 - smoothstep(0.55, 1.2, max(fwidth(mp.x), fwidth(mp.y)));
      mel = mix(dens * 0.26, mel, fade);
    }
#else
    mel = dens * 0.26;
#endif
    // gold iridophores between the melanophores: the back's golden sheen
    float gold = 0.0;
#ifndef HAKU_LOW
    {
      vec2 gp = pat * 330.0 + 0.37;
      vec3 gh = hkHash3(floor(gp) + 41.0);
      float gd = length(fract(gp) - 0.2 - 0.6 * gh.xy);
      gold = (1.0 - smoothstep(0.08, 0.22, gd)) * step(gh.z, 0.4) * band * (1.0 - 0.6 * headTop) * smoothstep(0.02, 0.032, s)
        * (1.0 - smoothstep(0.35, 0.9, max(fwidth(gp.x), fwidth(gp.y))));
    }
#endif
    // ---- the crown's dark brown blotches where it meets the silver: a chain along the edge from the nape forward, a big
    // spot on the nape, dashes over the eye, the orbit's upper edge; a few fine vermiculations between
    float tch = clamp((s - 0.174) / 0.069, 0.0, 1.0);
    float chain = (1.0 - smoothstep(0.0025, 0.0065, length(q - mix(vec2(0.174, 0.056), vec2(0.243, 0.08), tch))))
      * smoothstep(0.4, 0.62, hkNoise(q * 170.0)) * smoothstep(0.165, 0.18, s) * (1.0 - smoothstep(0.24, 0.255, s));
    float blot = max(chain, 1.0 - smoothstep(0.45, 1.0, length((q - vec2(0.226, 0.076)) / vec2(0.0065, 0.0055))));
    float cloud = smoothstep(0.64, 0.8, hkNoise(pat * 150.0) * 0.6 + hkNoise(pat * 380.0) * 0.4) * headTop * band * smoothstep(0.02, 0.035, s);
    blot = max(blot, cloud * 0.45);
    blot = max(blot, (1.0 - smoothstep(0.5, 1.0, length((q - vec2(0.155, 0.061)) / vec2(0.0055, 0.0016)))) * 0.85);
    blot = max(blot, (1.0 - smoothstep(0.5, 1.0, length((q - vec2(0.162, 0.081)) / vec2(0.0018, 0.005)))) * 0.75);
    float vein = 1.0 - abs(2.0 * hkNoise(vec2(s * 95.0, h * 120.0)) - 1.0);
    float crownEdge = headK * smoothstep(0.12, 0.16, s) * (1.0 - smoothstep(0.0, 0.16, abs(cd - edge + 0.02)));
    float verm = smoothstep(0.88, 0.96, vein) * crownEdge * smoothstep(0.4, 0.65, hkNoise(vec2(s * 30.0, h * 30.0) + 5.0));
    blot = max(blot, verm * 0.6);
    // ---- the back: translucent tan, the vertebral column dark beneath it; on the head a paler gold
    vec3 backCol = uBack * (0.88 + 0.24 * hkNoise(pat * 40.0));
    backCol *= 1.0 - 0.25 * smoothstep(0.88, 1.0, cd) * trunk;
    // over the eye and the snout the crown is a mottled grey-gold, finely dotted
    vec3 crownCol = vec3(0.6, 0.56, 0.44) * (0.88 + 0.24 * hkNoise(pat * 140.0)) * (0.92 + 0.16 * hkNoise(pat * 40.0 + 7.0));
    backCol = mix(backCol, crownCol, headTop);
    // ---- the silver: a translucent grey band under the dorsal band, bright silver-white below
    float upperBand = smoothstep(-0.05, 0.25, cd) * (1.0 - band) * trunk;
    float headSilver = 1.0 - smoothstep(0.12, 0.2, s);
    vec3 silver = mix(vec3(0.92, 0.915, 0.96), vec3(0.95, 0.94, 0.95), belly) * uSilver * (1.0 - 0.26 * headSilver);
    silver = mix(silver, vec3(0.74, 0.74, 0.78) * uSilver, upperBand * 0.75);
    float greyCore = (1.0 - smoothstep(0.0, 0.22, abs(cd - mix(-0.12, edge - 0.1, 0.45)))) * trunk * (1.0 - band) * smoothstep(0.82, 0.74, s);
    silver *= 1.0 - 0.12 * greyCore;
    float mid = (1.0 - smoothstep(0.0, 0.09, abs(cd - 0.04))) * trunk * smoothstep(0.84, 0.76, s);
    // fine upright streaks in the silver, like brush strokes: reflectors standing a little steeper, so they catch the
    // light from above. They hang from the bright line under the dorsal band and rise from the white lower flank,
    // leaving the middle of the grey band darkest.
    float streak = 0.0, streakUp = 0.0, scaleEdge = 0.0, scaleDome = 0.0;
    vec3 sh = vec3(0.5);
#ifndef HAKU_LOW
    {
      float cdTop = edge - 0.1, cdBot = -0.12;
      float fadeS = 0.0;
      for (int k = 0; k < 2; k++) {
        float cu = s / (k == 0 ? 0.0037 : 0.0033) + float(k) * 0.37;
        float ci = floor(cu);
        vec3 hr = hkHash3(vec2(ci, 7.0 + float(k) * 13.0));
        float wcol = 0.22 + 0.2 * hr.x;
        float line = 1.0 - smoothstep(wcol * 0.3, wcol * 0.5 + 0.28, abs(fract(cu) - 0.3 - 0.4 * hr.y + 0.08 * sin(cd * 9.0 + hr.x * 6.0)));
        fadeS = 1.0 - smoothstep(0.3, 0.8, fwidth(cu));
        // k = 0 hangs down from the top of the grey band, k = 1 rises from its foot
        float len = k == 0 ? 0.05 + 0.5 * hr.z * hr.z : 0.06 + 0.45 * hr.z;
        float start = (hkHash3(vec2(ci, 3.0 + float(k))).x - 0.5) * 0.08;
        float u = k == 0 ? (cdTop + start - cd) / len : (cd - cdBot - start) / len;
        // brightest at its root, tapering to nothing at its tip, broken softly here and there
        float body = smoothstep(-0.05, 0.05, u) * pow(max(1.0 - u, 0.0), 1.3);
        body *= smoothstep(0.1, 0.45, hkNoise(vec2(ci * 5.1, cd * 26.0 + float(k) * 7.0)));
        float v = line * body * (0.3 + 0.7 * hr.y) * fadeS;
        if (k == 0) streak = v; else streakUp = v;
      }
      float flankK = (1.0 - band) * trunk * smoothstep(0.82, 0.74, s);
      streak *= flankK;
      streakUp *= flankK;
      // imbricate cycloid scales: the most anterior scale covering a point lies on top; its free edge is an arc
      vec2 sc = vec2(s / 0.022, abs(pat.y) / 0.017);
      float best = 1e9, bestD = 0.0;
      vec2 bestC = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        float row = floor(sc.y) + float(j);
        float off = 0.5 * mod(row, 2.0);
        vec2 c = vec2(floor(sc.x - off) + float(i) + off + 0.5, row + 0.5);
        c += (hkHash3(c + 3.0).xy - 0.5) * vec2(0.22, 0.16);
        float d = length((sc - c) * vec2(1.0, 1.2));
        if (d < 0.8 && c.x < best) { best = c.x; bestC = c; bestD = d; }
      }
      sh = hkHash3(bestC + 17.0);
      float lod = 1.0 - smoothstep(0.25, 0.7, max(fwidth(sc.x), fwidth(sc.y)));
      float lower = lod * trunk * smoothstep(0.84, 0.8, s) * (1.0 - band) * smoothstep(-0.05, -0.35, cd);
      scaleEdge = smoothstep(0.6, 0.8, bestD) * lower * smoothstep(-0.4, -0.7, cd);
      // each scale of the lower flank a shallow dome: bright in its middle, greyer toward its free edge
      scaleDome = smoothstep(0.25, 0.78, bestD) * lower;
      hkTilt = (sh.xy - 0.5) * vec2(0.1, 0.04) * lod * trunk * (1.0 - band * 0.8);
    }
#endif
    // the hanging streaks lean up to the light overhead, the rising ones down to the bright bottom
    hkTilt.y += 0.26 * streak - 0.3 * streakUp;
    streak = max(streak, streakUp);
    float shoulder = smoothstep(edge - 0.2, edge - 0.08, cd) * (1.0 - smoothstep(edge - 0.06, edge + 0.01, cd)) * trunk * smoothstep(0.82, 0.74, s);
    hkTilt.y += 0.16 * shoulder;
    // ---- the gill cover is in the geometry: plates (aPart 0.3 the preopercle, 0.35 → 0.39 the opercle's bone → its
    // membranous flap) over the gill chamber (aPart up to 0.15 on the skin beneath), which shows its red gills when the
    // cover swings open
    float near = step(0.005, part) * step(part, 0.2);
    float preopP = step(0.25, part) * step(part, 0.32);
    float operP = step(0.33, part) * step(part, 0.45);
    float membrane = operP * clamp((part - 0.35) / 0.04, 0.0, 1.0);
    float gills = smoothstep(0.03, 0.12, part) * step(part, 0.2) * (1.0 - smoothstep(-0.006, -0.0025, s - hkOperEdge(h)));
    float gillPink = operP * smoothstep(-0.02, -0.06, h) * smoothstep(0.2, 0.25, s);
    // the cheek and gill cover are one mirror sheet of skin over the bones (its edges are geometry)
    float oper = smoothstep(0.13, 0.17, s) * (1.0 - smoothstep(-0.003, 0.003, s - hkOperEdge(h))) * (1.0 - band);
    // the skin in the lee of each free edge: behind the opercle's (on the shoulder) and behind the preopercle's (on the
    // opercle), on the near tier where the edges are real
    float behindOp = near * smoothstep(-0.0005, 0.001, s - hkOperEdge(h)) * (1.0 - smoothstep(0.0, 0.007, s - hkOperEdge(h)))
      * smoothstep(-0.09, -0.08, h) * (1.0 - smoothstep(0.04, 0.05, h));
    float behindPre = operP * (1.0 - smoothstep(0.0, 0.011, s - hkPreopEdge(h))) * smoothstep(-0.075, -0.06, h) * (1.0 - smoothstep(0.035, 0.05, h));
    // the step down from the opercle's bone to its membranous flap: a crease in the plate's own shadow
    float behindBone = operP * smoothstep(-0.001, 0.0005, s - hkOperBone(h)) * (1.0 - smoothstep(0.001, 0.006, s - hkOperBone(h)))
      * smoothstep(-0.08, -0.065, h) * (1.0 - smoothstep(0.035, 0.045, h));
    hkOcc *= 1.0 - 0.25 * behindOp - 0.35 * behindPre - 0.4 * behindBone;
    // the cheek and gill cover are crumpled foil: broad, soft undulations of the mirror
    float cheek = (1.0 - smoothstep(0.26, 0.3, s)) * smoothstep(0.07, 0.11, s) * (1.0 - band);
    float satin = (1.0 - smoothstep(0.16, 0.26, s)) * smoothstep(0.1, 0.5, cd) * (1.0 - band);
    vec2 foil = vec2(hkNoise(vec2(s * 32.0, h * 26.0)), hkNoise(vec2(s * 28.0 + 9.0, h * 34.0 + 3.0))) - 0.5;
    hkTilt += foil * 0.3 * cheek;
    // ---- the eye's orbit: a narrow pale ring of skin round the dark rim
    float de = length(vec2(s - ${f(EYE.s)}, h - ${f(EYE.y)})) / ${f(EYE.r)};
    float orbit = smoothstep(0.98, 1.04, de) * (1.0 - smoothstep(1.04, 1.2, de));
    float orbitShade = (1.0 - smoothstep(0.99, 1.1, de)) * smoothstep(0.95, 1.0, de) * smoothstep(-0.3, 0.6, (h - ${f(EYE.y)}) / ${f(EYE.r)});
    // the orbit's bony upper edge: a dark arc just above the eye
    float orbitTop = (1.0 - smoothstep(0.015, 0.04, abs(de - 1.12))) * smoothstep(0.45, 0.85, (h - ${f(EYE.y)}) / ${f(EYE.r)} / max(de, 0.01));
    // ---- the axillary spot: a small brown blotch at the pectoral base
    float axil = 1.0 - smoothstep(0.5, 1.0, length(vec2((s - ${f(PEC.s)}) / 0.008, (h - ${f(PEC.y)}) / 0.007)));
    // ---- the nostrils before the eye
    float nostril = 1.0 - smoothstep(0.5, 1.0, length(vec2((s - 0.056) / 0.004, (h - 0.04) / 0.003)));
    // a pink blush on the upper jaw below the front of the eye
    float blush = 1.0 - smoothstep(0.3, 1.0, length(vec2((s - 0.058) / 0.02, (h + 0.016) / 0.011)));
#ifdef HAKU_LOW
    // the far tier has no eye mesh: the dark eye painted on, still the first thing seen of a distant ハク
    axil = max(axil, (1.0 - smoothstep(0.5, 0.9, de)) * smoothstep(0.3, 0.6, abs(vBody.z)));
#endif
    // ---- thin tissue: the long peduncle, the fin bases, the back and the lips let the light through
    hkThin = smoothstep(0.6, 0.8, s) * 0.5 + 0.25 * smoothstep(0.7, 0.95, abs(cd)) * smoothstep(0.45, 0.6, s) + 0.3 * band * trunk + 0.4 * lips;
    hkThin *= 1.0 - blot;

    float silverAmt = (1.0 - band) * (1.0 - 0.7 * mel);
    col = mix(backCol, silver, silverAmt);
    col = mix(col, vec3(0.66, 0.4, 0.15), snoutPatch * 0.9);
    col = mix(col, vec3(0.66, 0.66, 0.65), lips * 0.85);
    col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.008, s));
    col = mix(col, vec3(0.8, 0.62, 0.6) * uSilver, max(gillPink * 0.12, blush * 0.45));
    col *= 1.0 - 0.8 * mel * (0.55 + 0.45 * band);
    col = mix(col, vec3(0.88, 0.76, 0.44), gold * 0.75 * (1.0 - mel));
    col = mix(col, vec3(0.07, 0.045, 0.03), blot * 0.92);
    col = mix(col, vec3(0.3, 0.29, 0.28), orbitTop * 0.4);
    col *= 1.0 - 0.04 * mid - 0.03 * scaleEdge - 0.035 * scaleDome;
    col *= 1.0 + 0.04 * streak;
    col = mix(col, vec3(0.34, 0.24, 0.15), axil * 0.75);
    col = mix(col, vec3(0.08, 0.07, 0.07), nostril * 0.55);
    // the tiers further off have no gill cover or split mouth in their geometry: the edges' shadows and the gape stand
    // in for them, soft, at the size they are seen there
    float far = 1.0 - step(0.005, part);
    float dPre = abs(s - hkPreopEdge(h) - 0.004), dOp = abs(s - hkOperEdge(h) - 0.003);
    float edgeLines = max((1.0 - smoothstep(0.0, 0.006, dPre)) * smoothstep(-0.07, -0.05, h) * (1.0 - smoothstep(0.035, 0.05, h)),
      0.7 * (1.0 - smoothstep(0.0, 0.006, dOp)) * smoothstep(-0.09, -0.07, h) * (1.0 - smoothstep(0.035, 0.05, h)));
    float farGape = (1.0 - smoothstep(0.001, 0.003, abs(h - gapeH))) * (1.0 - smoothstep(${f(GAPE.s - 0.004)}, ${f(GAPE.s)}, s));
    col *= 1.0 - far * max(0.3 * edgeLines, 0.6 * farGape);
    // the membranous flap: thinner, a little milky over the silver
    col = mix(col, col * 0.9 + vec3(0.06, 0.06, 0.07), membrane * 0.6);
    col = mix(col, vec3(0.8, 0.8, 0.79), orbit * 0.25);
    col *= 1.0 - 0.35 * orbitShade;
    float snoutFront = 1.0 - smoothstep(0.012, 0.04, s);
    hkMetal = mix(mix(0.16, 0.42, headTop), mix(0.86, 0.6, belly), silverAmt) * (1.0 - 0.6 * snoutFront) * (1.0 - 0.25 * upperBand) * (1.0 - 0.55 * gillPink) * (1.0 - 0.75 * lips);
    hkMetal = mix(hkMetal, 0.9, oper * 0.6 * (1.0 - membrane));
    hkMetal = mix(hkMetal, 0.6, membrane);
    hkMetal *= 1.0 - 0.3 * hkThin * (1.0 - lips);
    // pigment lies over the mirror: the blotches are matte
    hkMetal *= 1.0 - 0.85 * blot;
    hkMetal = mix(hkMetal, 0.85, gold * 0.7);
    hkRough = mix(0.48, 0.22 + 0.06 * (sh.x - 0.5), silverAmt) + 0.08 * scaleEdge + 0.06 * belly + 0.15 * lips;
    hkRough = mix(hkRough, 0.17, oper * 0.7 * (1.0 - membrane));
    hkRough = mix(hkRough, 0.4, snoutFront * 0.7);
    hkThin = max(hkThin, 0.3 * snoutFront);
    hkThin = max(hkThin, 0.4 * membrane);
    hkRough = mix(hkRough, 0.6, blot);
    hkMetal = mix(hkMetal, 0.6, satin);
    hkRough = mix(hkRough, 0.3, satin);
    hkMetal *= 1.0 - 0.15 * headSilver;
    hkRough = mix(hkRough, 0.3, headSilver * 0.5);
    hkCoat = 0.12 + 0.08 * band + 0.2 * lips;
    hkIriAmt = uIri * (0.08 * silverAmt * smoothstep(-0.2, 0.5, cd) + 0.18 * gillPink + 0.12 * crown * (1.0 - headTop));
    hkIriThick = 300.0 + 220.0 * hkNoise(pat * 9.0 + 2.0) + 120.0 * oper;
    if (gills > 0.0) {
      // gill arches running down the chamber, each fringed with fine blood-red filaments lying back across it; the
      // clefts between the arches dark
      float ga = fract(s * 150.0 + h * 25.0);
      float ridge = smoothstep(0.0, 0.25, ga) * (1.0 - smoothstep(0.75, 1.0, ga));
      float fil = 0.6 + 0.4 * sin(h * 2300.0 + 3.0 * ga);
      vec3 gc = mix(vec3(0.16, 0.02, 0.03), vec3(0.72, 0.15, 0.14) * fil, ridge);
      col = mix(col, gc, gills);
      hkMetal = mix(hkMetal, 0.0, gills); hkRough = mix(hkRough, 0.35, gills); hkCoat = mix(hkCoat, 0.6, gills);
      hkIriAmt *= 1.0 - gills; hkTilt *= 1.0 - gills; hkThin *= 1.0 - gills;
    }
  }
  diffuseColor.rgb = col;
}
`;

const FIN_FRAG_PARS = /* glsl */ `
varying vec3 vFin;
`;

const FIN_SURFACE = /* glsl */ `
{
  float a = vFin.x, t = vFin.y, id = vFin.z;
  float nR = id < 0.5 ? 24.0 : id < 1.5 ? 4.0 : id < 2.5 ? 9.0 : id < 3.5 ? 10.0 : id < 4.5 ? 6.0 : 14.0;
  float x = a * (nR - 1.0);
  float w = max(fwidth(x), 0.04);
  float ray = 1.0 - smoothstep(0.08, 0.15 + w, abs(fract(x + 0.5) - 0.5));
  // soft rays branch toward the edge; the first dorsal's are stiff spines
  float spiny = step(0.5, id) * step(id, 1.5);
  float branch = (1.0 - spiny) * smoothstep(0.45, 0.7, t) * (1.0 - smoothstep(0.06, 0.12 + w, abs(fract(x) - 0.5)));
  // ray segments: faint joints along each ray
  float seg = 1.0 - (id < 0.5 ? 0.2 : 0.0) * (1.0 - smoothstep(0.0, 0.25, abs(fract(t * 9.0) - 0.5)));
  float r = max(ray * (spiny > 0.5 ? 1.0 : seg), branch * 0.7);
  // the spiny dorsal's membrane is notched between the spines
  if (spiny > 0.5 && t > 1.0 - 0.16 * (1.0 - ray) - 0.03) discard;
  // a milky membrane, thicker toward the base; the pectoral lies pale against the flank
  float base = id > 4.5 ? 0.42 : id < 0.5 ? 0.45 : spiny > 0.5 ? 0.42 : 0.38;
  float alpha = (base * (1.0 - 0.3 * t) + (id < 0.5 ? 0.18 : id > 4.5 ? 0.12 : 0.55) * r + spiny * ray * 0.3) * (1.0 - smoothstep(0.92, 1.0, t)) * smoothstep(0.0, 0.05, t + 0.02);
  vec3 col = mix(id > 4.5 ? vec3(0.68, 0.69, 0.71) : vec3(0.82, 0.83, 0.84), vec3(0.97, 0.97, 0.95), r * (id < 0.5 ? 0.4 : id > 4.5 ? 0.35 : 1.0));
  // a few melanophores where the tail meets the body, and along the caudal rays
  float mel = 0.0;
  if (id < 0.5) {
    vec2 mp = vec2(a * 46.0, t * 14.0);
    vec3 h = hkHash3(floor(mp));
    float d = length(fract(mp) - 0.25 - 0.5 * h.xy);
    mel = (1.0 - smoothstep(0.12, 0.25, d)) * step(h.z, 0.025 * smoothstep(0.3, 0.0, t));
  }
  col = mix(col, vec3(0.04, 0.04, 0.045), mel);
  alpha = max(alpha, mel * 0.75);
  diffuseColor = vec4(col, alpha);
}
`;

// ------------------------------------------------------------------ materials

interface Variant { back: Color; pigment: number; silver: number; iri: number }

/** A few individual looks, shared: darker-backed, bronzer, bluer, paler. */
const VARIANTS: Variant[] = [
  { back: new Color(0.3, 0.29, 0.16), pigment: 1.0, silver: 1.0, iri: 1.0 },
  { back: new Color(0.34, 0.29, 0.15), pigment: 0.85, silver: 0.96, iri: 1.15 },
  { back: new Color(0.27, 0.27, 0.2), pigment: 1.15, silver: 1.02, iri: 0.9 },
  { back: new Color(0.36, 0.33, 0.22), pigment: 0.75, silver: 0.94, iri: 1.0 },
];

function bodyMaterial(v: Variant, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.9, roughness: 0.25,
    clearcoat: low ? 0 : 0.15, clearcoatRoughness: 0.2,
    iridescence: low ? 0 : 0.3, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 650],
    side: low ? DoubleSide : FrontSide,
  });
  m.name = low ? 'HakuBodyLOD2' : 'HakuBody';
  // the sky cube enters only through Snell's window (in the shader); the material's own IBL share stays faint
  m.envMapIntensity = 0.25;
  const own = { uBack: { value: v.back }, uPigment: { value: v.pigment }, uSilver: { value: v.silver }, uIri: { value: v.iri } };
  m.userData.hakuUniforms = own;
  if (low) m.defines = { HAKU_LOW: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, HAKU_UNIFORMS, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBody = aBody; vPat = aPat; vPart = aPart; vOcc = aOcc; vRest = position / ${f(MODEL_TL)};`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BODY_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(hkRough, 0.06, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = hkMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // lean the reflector in the body's own frame: toward the back along the surface gradient of the height, toward the
  // head along that of s (screen-space derivatives of the rest-pose coordinates, so it follows every bend)
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 gUp = (dFdx(vRest.y) * r1 + dFdy(vRest.y) * r2) * sign(det);
  vec3 gFwd = -(dFdx(vBody.x) * r1 + dFdy(vBody.x) * r2) * sign(det);
  float lu = length(gUp), lf = length(gFwd);
  vec3 tilt = (lu > 1e-12 ? gUp / lu * hkTilt.y : vec3(0.0)) + (lf > 1e-12 ? gFwd / lf * hkTilt.x : vec3(0.0));
  normal = normalize(normal + tilt);
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = hkCoat;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = hkIriAmt;
  material.iridescenceThickness = hkIriThick;
#endif`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT + OCC_DIRECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT + OCC_INDIRECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the bottom's light through the thin tail and fin bases (subtle translucency), and the sun through them from behind
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);   // camera → point, on past the fish
  vec3 through = hkUnderwater(vW, 0.7);
  float back = pow(clamp(dot(vW, hkSunDir()), 0.0, 1.0), 6.0);
  totalEmissiveRadiance += hkThin * (through * vec3(0.8, 0.78, 0.66) * 0.45 + hkSunCol() * back * 0.08);
}`);
  };
  m.customProgramCacheKey = () => (low ? 'haku-body-lod2-v33' : 'haku-body-v33');
  return m;
}

function finMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.32, transparent: true, depthWrite: false, side: DoubleSide,
    iridescence: 0.3, iridescenceIOR: 1.5, iridescenceThicknessRange: [300, 500],
  });
  m.name = 'HakuFin';
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, HAKU_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFin = aFin;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FIN_SURFACE}`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the membrane is thin living tissue: it scatters the light it is bathed in, from in front and from behind, so a
  // fin reads milky rather than as glass
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  totalEmissiveRadiance += diffuseColor.rgb * (hkUnderwater(nW, 1.0) + hkUnderwater(-nW, 1.0)) * 0.2;
}`);
  };
  m.customProgramCacheKey = () => 'haku-fin-v11';
  return m;
}

export interface HakuMaterials {
  /** LOD0/LOD1 body, one per individual look */
  body: MeshPhysicalMaterial[];
  /** LOD2 body (no scale, pigment or clearcoat detail; double-sided for the tail sliver) */
  bodyLow: MeshPhysicalMaterial[];
  fins: MeshPhysicalMaterial;
}

let shared: HakuMaterials | null = null;

/** The shared materials (created on first use, never disposed: they live as long as the page). */
export function hakuMaterials(): HakuMaterials {
  if (!shared) {
    shared = { body: VARIANTS.map((v) => bodyMaterial(v, false)), bodyLow: VARIANTS.map((v) => bodyMaterial(v, true)), fins: finMaterial() };
  }
  return shared;
}

export const VARIANT_COUNT = VARIANTS.length;

let lastTick = -1;
/** Advance the materials' clock (call every frame; repeated calls with the same time are free). */
export function tickHakuMaterials(seconds: number): void {
  if (seconds === lastTick) return;
  lastTick = seconds;
  HAKU_UNIFORMS.uHakuTime.value = seconds % 3600;
}
