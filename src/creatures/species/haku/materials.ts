import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Shared materials of the ハク: standard PBR (MeshPhysicalMaterial: metalness/roughness, clearcoat for the mucus,
 * thin-film iridescence) with the pattern and the underwater light worked in through onBeforeCompile, so every fish
 * of every school draws with one of a handful of material objects (one shader program per tier).
 *
 * Silver: the flank is a guanine mirror (metalness ≈ 0.95, a near-white F0, low roughness) under a dark, peppered
 * back. A mirror under water shows the water around it, so the reflection is not the sky cube but the light field
 * of shallow silty water: the sky squeezed into Snell's window overhead, the olive glow of the water at the sides,
 * the sunlit bottom below. Seen from above a ハク is a grey-olive sliver with pale edges; when it rolls the flank to
 * the window, it flashes. Each scale is a slightly tilted mirror of its own, so a moving fish glitters.
 *
 * Also: the chevron myomeres and the scale rows in the silver, the iridescent gill cover, the dark axillary spot,
 * the large silver-irised eye with a cornea (clearcoat), and the thin caudal peduncle letting the bottom's light
 * through. Fins are a separate transparent material: clear membrane, rays that branch toward the edge, spines on
 * the first dorsal, a few melanophores at the base of the tail.
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
};

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
  return mix(c, hkWindow(d, rough), w);
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

const BODY_FRAG_PARS = /* glsl */ `
varying vec3 vBody;
varying vec2 vPat;
varying float vPart;
uniform vec3 uBack;
uniform float uPigment;
uniform float uSilver;
uniform float uIri;
`;

/**
 * The body's surface: computed once at the colour stage, read again by the roughness / metalness / normal / clearcoat
 * / iridescence stages.
 */
const BODY_SURFACE = /* glsl */ `
float hkMetal = 0.0, hkRough = 0.5, hkCoat = 0.35, hkIriAmt = 0.0, hkIriThick = 380.0, hkThin = 0.0;
vec3 hkTilt = vec3(0.0);
{
  float s = vBody.x, cd = vBody.y;
  float part = vPart;
  vec3 col;
  if (part > 0.5 && part < 1.5) {
    // ---- the eye: a large black pupil, a silver iris with a brassy outer ring, a dark rim, the cornea (clearcoat)
    vec2 e = vPat;
    float r = length(e * vec2(1.0, 1.04));
    float pupil = 1.0 - smoothstep(0.5, 0.54, length(e * vec2(0.94, 1.05)));
    float rim = smoothstep(0.8, 0.93, r);
    float ang = atan(e.y, e.x);
    float stri = 0.8 + 0.2 * hkNoise(vec2(ang * 11.0, r * 4.0));
    vec3 iris = mix(vec3(0.66, 0.68, 0.68), vec3(0.72, 0.6, 0.36), smoothstep(0.62, 0.8, r)) * stri;
    iris *= 1.0 - 0.5 * smoothstep(0.58, 0.52, r);    // darker at the pupil's margin
    col = mix(iris, vec3(0.02, 0.024, 0.024), rim);
    col = mix(col, vec3(0.004), pupil);
    hkMetal = mix(mix(0.7, 0.2, rim), 0.0, pupil);
    hkRough = mix(0.3, 0.1, pupil);
    hkCoat = 1.0;
    hkIriAmt = 0.2 * (1.0 - pupil);
  } else if (part > 1.5) {
    // ---- LOD2's tail sliver: a faint grey fan
    col = vec3(0.2, 0.21, 0.2);
    hkMetal = 0.1; hkRough = 0.6; hkCoat = 0.0;
  } else {
    vec2 pat = vPat;
    float up = cd;
    // ---- countershading: the dark back's lower edge wanders a little along the body
    float edge = 0.36 + 0.07 * (hkNoise(vec2(s * 26.0, 3.1)) - 0.5) - 0.12 * smoothstep(0.7, 0.83, s) + 0.06 * smoothstep(0.2, 0.05, s);
    float back = smoothstep(edge - 0.2, edge + 0.14, up);
    float belly = smoothstep(-0.3, -0.72, up);
    // ---- melanophores: fine dark dots, dense on the back and the top of the head, a band at the tail's base,
    // a row along the dorsal and anal fin bases, few on the flank, none on the belly
    float dens = uPigment * (1.35 * back + 0.22 * smoothstep(edge - 0.45, edge, up) + 0.6 * smoothstep(0.8, 0.83, s) * (1.0 - belly)
      + 0.35 * smoothstep(0.62, 0.6, s) * smoothstep(0.88, 0.97, abs(up)) * step(0.55, s));
    float mel = 0.0;
#ifndef HAKU_LOW
    {
      // stellate, a fifth of a millimetre at 3 cm
      vec2 mp = pat * 210.0;
      vec2 c0 = floor(mp);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = c0 + vec2(float(i), float(j));
        vec3 h = hkHash3(c);
        if (h.z > dens) continue;
        vec2 dv = mp - c - 0.15 - 0.7 * h.xy;
        float rr = (0.14 + 0.24 * h.x) * (1.0 + 0.35 * cos(5.0 * atan(dv.y, dv.x) + h.y * 6.28));
        mel = max(mel, (1.0 - smoothstep(rr * 0.45, rr, length(dv))) * (0.6 + 0.4 * h.y));
      }
      float fade = 1.0 - smoothstep(0.35, 0.9, max(fwidth(mp.x), fwidth(mp.y)));
      mel = mix(dens * 0.3, mel, fade);
    }
#else
    mel = dens * 0.3;
#endif
    // ---- the back: translucent olive-grey over the dark spine
    vec3 backCol = uBack * (0.85 + 0.3 * hkNoise(pat * 40.0));
    backCol *= 1.0 - 0.35 * smoothstep(0.82, 1.0, up);                         // the vertebral column showing through
    // the top of the head: bronze, the brain dark beneath it
    float crown = smoothstep(0.22, 0.12, s) * smoothstep(0.45, 0.8, up);
    backCol = mix(backCol, vec3(0.2, 0.16, 0.085), crown * 0.55);
    // ---- the silver: bluish high on the flank, white on the belly
    vec3 silver = mix(vec3(0.82, 0.88, 0.93), vec3(0.93, 0.93, 0.9), smoothstep(0.2, -0.5, up)) * uSilver;
    // myomeres: '<' chevrons, the point forward at the midline, showing through the thin flank
    float q = (s - 0.05 * pow(abs(up), 0.85)) * 43.0;
    float myo = (1.0 - smoothstep(0.0, 0.09, min(fract(q), 1.0 - fract(q)))) * smoothstep(0.24, 0.3, s) * smoothstep(0.82, 0.76, s) * smoothstep(0.8, 0.45, abs(up));
    // scales: cycloid, staggered rows; each scale a mirror tilted its own way
    float scaleEdge = 0.0;
    vec3 sh = vec3(0.5);
#ifndef HAKU_LOW
    {
      vec2 sc = vec2((s - 0.2) / 0.0155, pat.y / 0.0132);
      float row = floor(sc.y);
      sc.x += mod(row, 2.0) * 0.5;
      vec2 cell = floor(sc);
      vec2 f = fract(sc);
      float r = length((f - vec2(0.0, 0.5)) * vec2(1.0, 1.12));
      sh = hkHash3(cell + 17.0);
      float lod = 1.0 - smoothstep(0.25, 0.7, max(fwidth(sc.x), fwidth(sc.y)));
      scaleEdge = (1.0 - smoothstep(0.0, 0.14, abs(r - 0.9))) * step(0.0, f.x) * lod * smoothstep(0.21, 0.26, s) * smoothstep(0.84, 0.8, s) * 0.6;
      hkTilt = (sh - 0.5) * 0.09 * lod * smoothstep(0.2, 0.28, s) * (1.0 - back * 0.7);
    }
#endif
    // ---- the gill cover: a curved rear margin, mirror-bright and iridescent; the gills' pink below
    float opEdgeS = 0.228 - 0.03 * (up - 0.1) * (up - 0.1);
    float oper = smoothstep(opEdgeS + 0.003, opEdgeS - 0.003, s) * smoothstep(0.08, 0.13, s) * smoothstep(0.6, 0.3, up);
    float opLine = (1.0 - smoothstep(0.0, 0.004, abs(s - opEdgeS))) * smoothstep(0.65, 0.35, up) * smoothstep(-0.9, -0.6, up);
    float preop = (1.0 - smoothstep(0.0, 0.003, abs(s - (0.17 - 0.016 * up * up)))) * smoothstep(0.35, 0.0, up) * smoothstep(-0.85, -0.5, up) * 0.6;
    float gillPink = oper * smoothstep(0.0, -0.45, up) * smoothstep(0.14, 0.2, s);
    // ---- the axillary spot at the pectoral base
    float axil = 1.0 - smoothstep(0.55, 1.0, length(vec2((s - 0.243) / 0.008, (up - 0.13) / 0.17)));
#ifdef HAKU_LOW
    // the far tier has no eye mesh: the dark eye painted on, still the first thing seen of a distant ハク
    axil = max(axil, 1.0 - smoothstep(0.6, 1.0, length(vec2((s - 0.09) / 0.024, (up - 0.12) / 0.32))) * smoothstep(0.3, 0.6, abs(vBody.z)));
#endif
    // ---- mouth: a dark line across the snout tip
    float mouth = (1.0 - smoothstep(0.0, 0.07, abs(up + 0.3 + 0.25 * s / 0.04))) * smoothstep(0.042, 0.03, s) * smoothstep(0.98, 0.85, abs(up));
    // ---- thin tissue: the long peduncle and the fin bases let the light through
    hkThin = smoothstep(0.58, 0.8, s) * 0.55 + 0.25 * smoothstep(0.7, 0.95, abs(up)) * smoothstep(0.45, 0.6, s) + 0.32 * back * (1.0 - crown);

    float silverAmt = (1.0 - back) * (1.0 - 0.75 * mel) * (1.0 - 0.45 * myo) * (1.0 - axil);
    col = mix(backCol, silver, silverAmt);
    col = mix(col, vec3(0.92, 0.92, 0.9), belly * 0.5);
    col = mix(col, vec3(0.86, 0.66, 0.64) * uSilver, gillPink * 0.18);
    col *= 1.0 - 0.82 * mel * (0.6 + 0.4 * back);
    col *= 1.0 - 0.18 * scaleEdge * (1.0 - back);
    col = mix(col, vec3(0.025, 0.028, 0.028), max(max(axil * 0.85, opLine * 0.32), max(preop * 0.25, mouth * 0.85)));
    col = mix(col, col * vec3(0.92, 0.9, 0.8), hkThin * 0.3);
    hkMetal = mix(mix(0.18, 0.88, silverAmt), 0.55, belly * 0.7) * (1.0 - 0.55 * gillPink);
    hkMetal = mix(hkMetal, 0.93, oper * (1.0 - back));
    hkMetal *= 1.0 - 0.35 * hkThin;
    hkRough = mix(0.46, 0.24 + 0.08 * (sh.x - 0.5), silverAmt) + 0.08 * scaleEdge + 0.1 * belly;
    hkRough = mix(hkRough, 0.11, oper);
    hkCoat = 0.32 + 0.2 * back;
    hkIriAmt = uIri * (0.3 * silverAmt * smoothstep(-0.2, 0.5, up) + 0.45 * oper + 0.35 * crown);
    hkIriThick = 300.0 + 220.0 * hkNoise(pat * 9.0 + 2.0) + 120.0 * oper;
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
  float nR = id < 0.5 ? 18.0 : id < 1.5 ? 4.0 : id < 2.5 ? 9.0 : id < 3.5 ? 10.0 : id < 4.5 ? 6.0 : 14.0;
  float x = a * (nR - 1.0);
  float w = max(fwidth(x), 0.04);
  float ray = 1.0 - smoothstep(0.06, 0.12 + w, abs(fract(x + 0.5) - 0.5));
  // soft rays branch toward the edge; the first dorsal's are stiff spines
  float spiny = step(0.5, id) * step(id, 1.5);
  float branch = (1.0 - spiny) * smoothstep(0.45, 0.7, t) * (1.0 - smoothstep(0.06, 0.12 + w, abs(fract(x) - 0.5)));
  // ray segments: faint joints along each ray
  float seg = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.25, abs(fract(t * 9.0) - 0.5)));
  float r = max(ray * (spiny > 0.5 ? 1.0 : seg), branch * 0.7);
  // the spiny dorsal's membrane is notched between the spines
  if (spiny > 0.5 && t > 1.0 - 0.38 * (1.0 - ray) - 0.04) discard;
  float alpha = (0.1 + 0.4 * r + spiny * ray * 0.25) * (1.0 - smoothstep(0.86, 1.0, t)) * smoothstep(0.0, 0.05, t + 0.02);
  vec3 col = mix(vec3(0.7, 0.72, 0.66), vec3(0.88, 0.88, 0.84), r);
  // a few melanophores where the tail meets the body, and along the caudal rays
  float mel = 0.0;
  if (id < 0.5) {
    vec2 mp = vec2(a * 46.0, t * 14.0);
    vec3 h = hkHash3(floor(mp));
    float d = length(fract(mp) - 0.25 - 0.5 * h.xy);
    mel = (1.0 - smoothstep(0.12, 0.25, d)) * step(h.z, 0.35 * smoothstep(0.45, 0.0, t) + 0.12 * r);
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
  { back: new Color(0.075, 0.088, 0.08), pigment: 1.0, silver: 1.0, iri: 1.0 },
  { back: new Color(0.09, 0.092, 0.068), pigment: 0.85, silver: 0.95, iri: 1.15 },
  { back: new Color(0.062, 0.076, 0.084), pigment: 1.15, silver: 1.04, iri: 0.9 },
  { back: new Color(0.1, 0.106, 0.092), pigment: 0.7, silver: 0.92, iri: 1.0 },
];

function bodyMaterial(v: Variant, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.9, roughness: 0.25,
    clearcoat: low ? 0 : 0.35, clearcoatRoughness: 0.14,
    iridescence: low ? 0 : 0.4, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 650],
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
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = aBody; vPat = aPat; vPart = aPart;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BODY_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(hkRough, 0.06, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = hkMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // each scale its own small mirror
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  nW = normalize(nW + hkTilt);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = hkCoat;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = hkIriAmt;
  material.iridescenceThickness = hkIriThick;
#endif`)
      .replace('#include <lights_fragment_begin>', CAUSTIC_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // the bottom's light through the thin tail and fin bases (subtle translucency), and the sun through them from behind
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);   // camera → point, on past the fish
  vec3 through = hkUnderwater(vW, 0.7);
  float back = pow(clamp(dot(vW, hkSunDir()), 0.0, 1.0), 6.0);
  totalEmissiveRadiance += hkThin * (through * vec3(0.8, 0.78, 0.66) * 0.45 + hkSunCol() * back * 0.08);
}`);
  };
  m.customProgramCacheKey = () => (low ? 'haku-body-lod2-v1' : 'haku-body-v1');
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
      .replace('#include <lights_fragment_maps>', ENV_INJECT);
  };
  m.customProgramCacheKey = () => 'haku-fin-v1';
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
