// Materials for ユビナガホンヤドカリ and its shells.
//
// Physically based (MeshPhysicalMaterial: PBR, image-based lighting from the scene environment,
// ACES tone mapping and shadows come from the engine) with the species' surface written procedurally in
// the shader – no textures, so texture memory is zero and every LOD shares one program:
//   * pattern: shield gastric spot and lateral markings, olive cheliped with white granules, walking-leg
//     longitudinal stripe + transverse bands, dactyl median white section, banded eyestalk with two-striped
//     corneas, white-ringed antennal flagellum, banded third maxillipeds, translucent olive abdomen
//   * micro relief: cellular granules / pits / membrane wrinkles via derivative bump mapping
//   * roughness variation, wet film (clearcoat + darkening) driven by exposure/wetness
//   * thin-cuticle translucency (membranes, dactyl tips, antennae, abdomen) with a back-light term
//   * view-dependent pseudopupil on the compound eyes
//   * optional shallow-water caustics on up-facing surfaces when submerged
// Per-individual colour (morph, hue/value) is held in uniforms of a per-crab material instance; all
// instances share the same compiled program (customProgramCacheKey).
import * as THREE from 'three';
import { PALETTE } from './PagurusMinutusMorphology.js';
import { SHELL_SPECIES, setShellMaterialFactory } from './PagurusMinutusShell.js';

const col = (hex) => new THREE.Color(hex); // sRGB hex → linear working colour space

const NOISE_GLSL = /* glsl */ `
float pmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pmNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pmHash(i), pmHash(i + vec3(1, 0, 0)), f.x), mix(pmHash(i + vec3(0, 1, 0)), pmHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(pmHash(i + vec3(0, 0, 1)), pmHash(i + vec3(1, 0, 1)), f.x), mix(pmHash(i + vec3(0, 1, 1)), pmHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float pmFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * pmNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float pmCell(vec3 p) {
  vec3 i = floor(p), f = fract(p); float d = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(pmHash(i + g), pmHash(i + g + 19.1), pmHash(i + g + 47.3));
    vec3 r = g + o - f; d = min(d, dot(r, r));
  }
  return sqrt(d);
}
float pmCaustic(vec2 p, float t) {
  vec2 q = p; float c = 0.0;
  for (int i = 0; i < 2; i++) {
    q = q * 1.63 + vec2(sin(q.y * 1.31 + t * 0.9), cos(q.x * 1.13 - t * 0.83));
    c += pow(1.0 - abs(sin(q.x + q.y * 0.71 + t * 0.6)), 7.0);
  }
  return c;
}
vec3 pmBump(vec3 surfPos, vec3 surfNorm, float h, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const COMMON_VERT_HEAD = /* glsl */ `
varying vec3 vPmWorld;
varying float vPmScale;
`;
const COMMON_VERT_BODY = /* glsl */ `
vPmScale = length(modelMatrix[0].xyz);
vPmWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

// light-dependent extras shared by crab and shell (appended after lights_fragment_end)
const LIGHT_EXTRAS = /* glsl */ `
{
  #if NUM_DIR_LIGHTS > 0
    vec3 pmL = directionalLights[0].direction;
    vec3 pmV = normalize(vViewPosition);
    float pmBack = pow(saturate(dot(pmV, -pmL)), 3.0);
    float pmWrap = saturate((dot(-normal, pmL) + 0.45) / 1.45);
    reflectedLight.directDiffuse += directionalLights[0].color * pmTransColor * pmThin * (0.22 * pmWrap + 0.95 * pmBack * pmWrap);
  #endif
  if (uPmCaus > 0.0 && vPmWorld.y < uPmWaterY) {
    vec3 pmUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float up = saturate(dot(normal, pmUp));
    float depth = clamp(uPmWaterY - vPmWorld.y, 0.0, 1.0);
    float c = pmCaustic(vPmWorld.xz * 95.0, uPmTime * 1.4) * up * exp(-depth * 3.0);
    reflectedLight.directDiffuse += uPmCausColor * c * uPmCaus * diffuseColor.rgb;
  }
}
`;

// ---------------------------------------------------------------------------------------------
// Exoskeleton
// ---------------------------------------------------------------------------------------------

const EXO_FRAG_PARS = /* glsl */ `
varying float vPmRegion;
varying vec4 vPmSeg;
varying vec3 vPmBind;
varying vec3 vPmWorld;
varying float vPmScale;
uniform float uPmWet, uPmHue, uPmSat, uPmVal, uPmGreen, uPmContrast;
uniform float uPmCaus, uPmWaterY, uPmTime;
uniform vec3 uPmCausColor;
uniform vec3 uShield, uShieldDark, uBranchio, uSoft, uSternum, uLegBase, uLegStripe, uLegBand, uLegPale;
uniform vec3 uDactBase, uDactWhite, uDactTip, uChel, uGran, uFinger, uFingerTip, uMembrane, uEyestalk, uEyeBand;
uniform vec3 uCornea, uCorneaStripe, uAntenna, uAntennaWhite, uAntennule, uMxp, uMxpBand, uAbd, uAbdDeep, uUropod, uSetae;
uniform float uAnnuli, uWhitePeriod;
float pmThin = 0.1;
float pmClear = 1.0;
float pmHeight = 0.0;
float pmRough = 0.45;
vec3 pmTransColor = vec3(1.0);
${NOISE_GLSL}
vec3 pmAdjust(vec3 c) {
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  float I = dot(c, vec3(0.596, -0.274, -0.322));
  float Q = dot(c, vec3(0.211, -0.523, 0.312));
  float h = uPmHue * 6.2831853; float cs = cos(h), sn = sin(h);
  float I2 = (I * cs - Q * sn) * uPmSat, Q2 = (I * sn + Q * cs) * uPmSat;
  Y *= uPmVal;
  vec3 r = vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2);
  r.g *= 1.0 + 0.16 * (uPmGreen - 0.5);
  r.r *= 1.0 - 0.1 * (uPmGreen - 0.5);
  return max(r, vec3(0.0));
}
vec3 pmSurface(vec3 p, vec4 sg, float region, vec3 nView, vec3 vView) {
  int R = int(region + 0.5);
  float t = sg.x, ang = sg.y * 6.2831853, kind = sg.z, side = sg.w;
  float mott = pmFbm(p * 9.0);
  vec3 c = uLegBase;
  float ant = cos(ang) * side; // +1 on the anterior ("lateral") face of a leg article
  float dors = sin(ang);
  if (R == 0) {
    c = uShield * (0.9 + 0.2 * mott);
    float gs = 1.0 - smoothstep(0.035, 0.1, length(vec2(p.x * 1.25, p.z - 0.55)));
    c = mix(c, uShieldDark, gs * 0.88);
    float lat = smoothstep(0.12, 0.42, abs(p.x)) * smoothstep(0.5, 0.72, pmFbm(p * 7.0 + 3.1));
    c = mix(c, uShieldDark, lat * 0.65 * uPmContrast);
    c *= 1.0 - 0.4 * exp(-pow(p.z / 0.022, 2.0));
    c = mix(c, uShieldDark, step(0.82, pmNoise(p * 55.0)) * 0.35);
    pmHeight = (pmNoise(p * 85.0) - 0.5) * 0.004 - 0.006 * exp(-pow(p.z / 0.02, 2.0));
    pmRough = 0.36; pmThin = 0.08;
  } else if (R == 1) {
    c = uBranchio * (0.86 + 0.28 * mott);
    pmHeight = (pmNoise(p * 70.0) - 0.5) * 0.003;
    pmRough = 0.5; pmThin = 0.32;
  } else if (R == 2) {
    c = uSoft * (0.8 + 0.4 * mott);
    pmHeight = (pmNoise(p * 50.0) - 0.5) * 0.004;
    pmRough = 0.56; pmThin = 0.5; pmClear = 0.7;
  } else if (R == 3) {
    c = uSternum * (0.92 + 0.15 * mott); pmRough = 0.5; pmThin = 0.25;
  } else if (R == 4 || R == 5) {
    c = uChel * (0.82 + 0.36 * mott);
    // irregular brown blotches under the granules (photos 001, 002)
    c = mix(c, uLegStripe, smoothstep(0.58, 0.74, pmFbm(p * 12.0 + 4.7)) * 0.4 * uPmContrast);
    // dense small granules (photos 001, 002, 033), a few larger tubercles among them
    float cell = pmCell(p * 38.0);
    float g = 1.0 - smoothstep(0.12, 0.32, cell);
    float big = 1.0 - smoothstep(0.1, 0.3, pmCell(p * 11.0 + 5.0));
    pmHeight = g * 0.011 + big * 0.006;
    c = mix(c, uGran, g * (R == 5 ? 0.78 : 0.5) * (0.55 + 0.45 * max(dors, 0.0)));
    if (R == 5) c = mix(c, uShieldDark, smoothstep(0.42, 0.58, t) * 0.45 * smoothstep(0.1, 0.7, dors) * (1.0 - g));
    pmRough = 0.47 - g * 0.17; pmThin = 0.06;
  } else if (R == 6) {
    c = mix(uFinger, uFingerTip, smoothstep(0.8, 0.99, t));
    float g = 1.0 - smoothstep(0.2, 0.42, pmCell(p * 30.0));
    c = mix(c, uGran, g * 0.4 * (1.0 - smoothstep(0.7, 0.9, t)));
    pmHeight = g * 0.006;
    pmRough = mix(0.4, 0.26, smoothstep(0.75, 1.0, t)); pmThin = mix(0.12, 0.55, smoothstep(0.7, 1.0, t));
  } else if (R == 7) {
    c = uLegBase * (0.84 + 0.32 * mott);
    // irregular dark-brown mottling over the whole article (photos 001, 021, 038)
    c = mix(c, uLegStripe, smoothstep(0.56, 0.72, pmFbm(p * 14.0 + 7.3)) * 0.5 * uPmContrast);
    float stripe = smoothstep(0.45, 0.8, ant) * step(1.5, kind);
    c = mix(c, uLegStripe, stripe * 0.88 * uPmContrast);
    if (kind > 1.5 && kind < 2.5) c = mix(c, uLegBand, smoothstep(0.55, 0.62, t) * (1.0 - smoothstep(0.78, 0.85, t)) * 0.65 * uPmContrast);
    if (kind > 2.5 && kind < 3.5) c = mix(c, uLegPale, smoothstep(0.8, 0.9, t) * 0.55);
    if (kind > 3.5 && kind < 4.5) {
      c = mix(c, uLegBand, smoothstep(0.3, 0.38, t) * (1.0 - smoothstep(0.62, 0.7, t)) * 0.6 * uPmContrast);
      c = mix(c, uLegPale, smoothstep(0.9, 0.97, t) * 0.42);
    }
    float g = (1.0 - smoothstep(0.14, 0.34, pmCell(p * 32.0))) * smoothstep(-0.1, 0.6, dors);
    c = mix(c, uGran, g * 0.3);
    pmHeight = g * 0.005;
    pmRough = 0.42; pmThin = 0.2;
  } else if (R == 8) {
    c = uDactBase * (0.88 + 0.24 * mott);
    c = mix(c, uLegStripe, smoothstep(0.58, 0.74, pmFbm(p * 16.0 + 2.1)) * 0.35 * uPmContrast);
    float w = smoothstep(0.24, 0.3, t) * (1.0 - smoothstep(0.47, 0.53, t));
    c = mix(c, uDactWhite, w * 0.82);
    c = mix(c, uLegStripe, smoothstep(0.62, 0.88, ant) * (1.0 - w) * (1.0 - smoothstep(0.75, 0.86, t)) * 0.7 * uPmContrast);
    c = mix(c, uDactTip, smoothstep(0.8, 0.95, t));
    pmRough = mix(0.4, 0.24, smoothstep(0.85, 1.0, t)); pmThin = mix(0.28, 0.85, t);
  } else if (R == 9) {
    c = uMembrane * (0.92 + 0.12 * mott);
    pmHeight = (pmNoise(p * vec3(160.0, 40.0, 160.0)) - 0.5) * 0.003;
    pmRough = 0.62; pmThin = 0.9; pmClear = 0.55;
  } else if (R == 10) {
    c = uEyestalk * (0.93 + 0.12 * mott);
    c = mix(c, uEyeBand, smoothstep(0.36, 0.44, t) * (1.0 - smoothstep(0.6, 0.68, t)) * 0.85);
    c = mix(c, uEyeBand * 0.85, step(0.7, pmNoise(p * 48.0)) * smoothstep(-0.2, 0.6, dors) * 0.6);
    pmRough = 0.42; pmThin = 0.42;
  } else if (R == 11) {
    c = uCornea;
    float s1 = smoothstep(0.34, 0.4, t) * (1.0 - smoothstep(0.47, 0.53, t));
    float s2 = smoothstep(0.58, 0.64, t) * (1.0 - smoothstep(0.71, 0.77, t));
    c = mix(c, uCorneaStripe, max(s1, s2) * 0.75);
    float f = pmCell(p * 150.0);
    c *= 0.82 + 0.18 * smoothstep(0.15, 0.5, f);
    float pp = smoothstep(0.86, 0.985, dot(nView, vView));
    c = mix(c, vec3(0.006), pp * 0.92);
    pmHeight = (0.5 - f) * 0.0015;
    pmRough = 0.1; pmThin = 0.15; pmClear = 1.0;
    return c;
  } else if (R == 12) {
    c = mix(uAntenna, uAntennaWhite, step(0.8, fract(t * 4.0)) * 0.55);
    pmRough = 0.45; pmThin = 0.35;
  } else if (R == 13) {
    float ann = t * uAnnuli; float idx = floor(ann); float ph = fract(ann);
    c = uAntenna * (0.9 + 0.2 * mott);
    float isW = 1.0 - step(0.5, mod(idx, uWhitePeriod));
    c = mix(c, uAntennaWhite, isW * 0.72);
    c *= 0.78 + 0.22 * smoothstep(0.0, 0.14, ph) * smoothstep(1.0, 0.86, ph);
    pmRough = 0.42; pmThin = 0.75;
  } else if (R == 14) {
    c = kind > 4.5 ? uAntennule : mix(uEyestalk, uEyeBand, smoothstep(0.75, 0.9, t) * 0.5);
    pmRough = 0.45; pmThin = 0.55;
  } else if (R == 15) {
    c = mix(uMxp, uMxpBand, step(0.5, fract(t * 2.0 + kind * 0.5)) * 0.85);
    pmRough = 0.5; pmThin = 0.45;
  } else if (R == 16) {
    c = mix(uAbdDeep, uAbd, smoothstep(0.3, 0.75, pmFbm(p * 6.0)));
    c = mix(c, uMembrane, smoothstep(0.75, 0.95, pmNoise(p * 26.0)) * 0.25);
    pmHeight = (pmNoise(p * vec3(30.0, 120.0, 30.0)) - 0.5) * 0.004;
    pmRough = 0.55; pmThin = 0.62; pmClear = 0.8;
  } else if (R == 17) {
    c = uUropod * (0.9 + 0.2 * mott); pmRough = 0.38; pmThin = 0.35;
  } else if (R == 18) {
    c = mix(uLegBase, uMembrane, 0.3) * (0.9 + 0.2 * mott); pmRough = 0.45; pmThin = 0.3;
  } else if (R == 19) {
    c = mix(uGran, uDactTip, smoothstep(0.35, 1.0, t)); pmRough = 0.3; pmThin = 0.3;
  } else {
    c = uSetae; pmRough = 0.5; pmThin = 0.9;
  }
  return pmAdjust(c);
}
`;

function exoHook(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aRegion;
attribute vec4 aSeg;
varying float vPmRegion;
varying vec4 vPmSeg;
varying vec3 vPmBind;
${COMMON_VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPmRegion = aRegion; vPmSeg = aSeg; vPmBind = position;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
${COMMON_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${EXO_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 pmAlbedo = pmSurface(vPmBind, vPmSeg, vPmRegion, normalize(vNormal), normalize(vViewPosition));
float pmWetDark = mix(1.0, 0.8, uPmWet * (1.0 - pmThin * 0.4));
diffuseColor.rgb = pmAlbedo * pmWetDark;
pmTransColor = vec3(1.0, 0.93, 0.78) * pmAlbedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(pmRough, pmRough * 0.55, uPmWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = pmBump(-vViewPosition, normal, pmHeight * vPmScale, faceDirection);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = saturate(uPmWet * pmClear);
  material.clearcoatRoughness = max(0.06, mix(0.25, 0.07, uPmWet));
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${LIGHT_EXTRAS}`);
  };
}

function paletteUniforms() {
  const P = PALETTE;
  const u = (hex) => ({ value: col(hex) });
  return {
    uShield: u(P.shield), uShieldDark: u(P.shieldDark), uBranchio: u(P.branchio), uSoft: u(P.softCarapace), uSternum: u(P.sternum),
    uLegBase: u(P.legBase), uLegStripe: u(P.legStripe), uLegBand: u(P.legBand), uLegPale: u(P.legPale),
    uDactBase: u(P.dactylBase), uDactWhite: u(P.dactylWhite), uDactTip: u(P.dactylTip),
    uChel: u(P.cheliped), uGran: u(P.chelaGranule), uFinger: u(P.chelaFinger), uFingerTip: u(P.chelaFingerTip),
    uMembrane: u(P.membrane), uEyestalk: u(P.eyestalk), uEyeBand: u(P.eyeBand), uCornea: u(P.cornea), uCorneaStripe: u(P.corneaStripe),
    uAntenna: u(P.antenna), uAntennaWhite: u(P.antennaWhite), uAntennule: u(P.antennule), uMxp: u(P.mxp), uMxpBand: u(P.mxpBand),
    uAbd: u(P.abdomen), uAbdDeep: u(P.abdomenDeep), uUropod: u(P.uropod), uSetae: u(P.setae),
    uAnnuli: { value: 108 }, uWhitePeriod: { value: 3 },
  };
}

function envUniforms() {
  return {
    uPmWet: { value: 0.6 }, uPmCaus: { value: 0 }, uPmWaterY: { value: -1e6 }, uPmTime: { value: 0 },
    uPmCausColor: { value: new THREE.Color(1.0, 0.97, 0.85).multiplyScalar(0.9) },
  };
}

/**
 * Per-crab material set. `colorway` = { hue, sat, val, green, contrast }.
 * @returns {{ body: THREE.MeshPhysicalMaterial, setae: THREE.MeshStandardMaterial, uniforms: object, update(o): void, dispose(): void }}
 */
export function createCrabMaterials(colorway = {}) {
  const uniforms = {
    ...paletteUniforms(), ...envUniforms(),
    uPmHue: { value: colorway.hue ?? 0 }, uPmSat: { value: colorway.sat ?? 1 }, uPmVal: { value: colorway.val ?? 1 },
    uPmGreen: { value: colorway.green ?? 0.5 }, uPmContrast: { value: colorway.contrast ?? 1 },
  };
  const body = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12,
    ior: 1.52, specularIntensity: 0.7, envMapIntensity: 1.0,
  });
  body.name = 'PagurusMinutus_Exoskeleton';
  const hook = exoHook(uniforms);
  body.onBeforeCompile = hook;
  body.customProgramCacheKey = () => 'pagurus-exo-v1';
  body.userData.pm = { hook, key: 'pagurus-exo-v1', uniforms };

  const setae = createSetaeMaterial(uniforms);
  const update = (o) => {
    if (o.wet !== undefined) uniforms.uPmWet.value = o.wet;
    if (o.caustics !== undefined) uniforms.uPmCaus.value = o.caustics;
    if (o.waterY !== undefined) uniforms.uPmWaterY.value = o.waterY;
    if (o.time !== undefined) uniforms.uPmTime.value = o.time;
  };
  return { body, setae, uniforms, update, dispose() { body.dispose(); setae.dispose(); } };
}

// ---------------------------------------------------------------------------------------------
// Setae: alpha-tested cards with procedural strands (opaque pass, alpha-to-coverage under MSAA)
// ---------------------------------------------------------------------------------------------

function createSetaeMaterial(crabUniforms) {
  const uniforms = { uSetae: crabUniforms.uSetae, uPmWet: crabUniforms.uPmWet, uPmHue: crabUniforms.uPmHue, uPmVal: crabUniforms.uPmVal };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45 });
  m.alphaToCoverage = true;
  m.name = 'PagurusMinutus_Setae';
  const hook = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSeta;
attribute vec2 aPmUv;
varying vec2 vPmUv;
varying vec4 vPmSeta;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPmUv = aPmUv; vPmSeta = aSeta;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vPmUv;
varying vec4 vPmSeta;
uniform vec3 uSetae;
uniform float uPmWet, uPmHue, uPmVal;
float pmH1(float n) { return fract(sin(n * 91.345) * 47453.31); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float a = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float seed = vPmSeta.x * 13.7 + fk * 3.1;
    float len = 0.62 + 0.38 * pmH1(seed);
    float cx = 0.22 + 0.28 * fk + 0.07 * sin(vPmUv.y * 3.0 + seed * 6.0) * vPmUv.y;
    float wd = mix(0.075, 0.012, vPmUv.y / len);
    float s = (1.0 - smoothstep(wd * 0.45, wd, abs(vPmUv.x - cx))) * step(vPmUv.y, len);
    a = max(a, s);
  }
  diffuseColor.a = a;
  diffuseColor.rgb = uSetae * uPmVal * mix(0.75, 1.0, vPmUv.y) * mix(1.0, 0.85, uPmWet);
}`);
  };
  m.onBeforeCompile = hook;
  m.customProgramCacheKey = () => 'pagurus-setae-v1';
  m.userData.pm = { hook, key: 'pagurus-setae-v1', uniforms };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------------------------

const PATTERN_ID = { band: 0, zigzag: 1, nodule: 2, streak: 3 };

const SHELL_FRAG_PARS = /* glsl */ `
varying vec4 vPmShell;
varying float vPmRelief;
varying vec3 vPmObj;
varying vec3 vPmWorld;
varying float vPmScale;
uniform vec3 uBase, uAlt, uBand, uInterior, uInteriorBand, uLip, uCallus, uFoul;
uniform float uPattern, uBandPhi, uBandWidth, uGloss, uNacre, uFouling, uPmWet, uSeed, uDamage, uSilt;
uniform vec3 uSiltColor;
uniform float uPmCaus, uPmWaterY, uPmTime;
uniform vec3 uPmCausColor;
float pmThin = 0.0;
float pmHeight = 0.0;
float pmRough = 0.4;
float pmNacreMask = 0.0;
vec3 pmTransColor = vec3(1.0);
${NOISE_GLSL}
vec3 pmShell() {
  float whorl = vPmShell.x;            // growth angle in whorls (negative toward apex)
  float phi = vPmShell.y * 6.2831853;  // around the generating curve
  int part = int(vPmShell.z + 0.5);
  float depth = vPmShell.w;
  vec3 p = vPmObj * 18.0 + uSeed;
  float mott = pmFbm(p * 0.7);
  vec3 c = uBase;
  if (part == 0) {
    int pat = int(uPattern + 0.5);
    float th = whorl * 6.2831853;
    if (pat == 0) {
      float band = smoothstep(uBandWidth, uBandWidth * 0.4, abs(atan(sin(phi - uBandPhi), cos(phi - uBandPhi))));
      c = mix(uBase, uAlt, smoothstep(0.35, 0.7, mott));
      c = mix(c, uBand, band * 0.8);
      c = mix(c, uBand * 0.9, smoothstep(0.55, 0.9, vPmRelief) * 0.45);
    } else if (pat == 1) {
      float z = sin(th * 34.0 + sin(phi * 3.0 + th) * 2.4 + mott * 3.0);
      c = mix(uBase, uAlt, smoothstep(0.2, 0.9, z) * 0.85);
      c = mix(c, uBand, smoothstep(0.82, 1.0, cos(phi - 1.2)) * 0.55);
    } else if (pat == 2) {
      c = mix(uBase, uBand, smoothstep(0.3, 0.8, mott) * 0.5);
      c = mix(c, uAlt, smoothstep(0.35, 0.8, vPmRelief) * 0.85);
    } else {
      float streak = smoothstep(0.55, 0.9, sin(th * 18.0 + mott * 5.0 + phi * 0.8));
      c = mix(uBase, uAlt, streak * 0.7);
      c = mix(c, uBand, smoothstep(0.6, 1.0, vPmRelief) * 0.5);
    }
    // growth lines
    c *= 0.93 + 0.07 * sin(th * 220.0 + mott * 4.0);
    // eroded / worn tops of the sculpture and the apex region are chalky
    c = mix(c, vec3(0.62, 0.6, 0.56), smoothstep(-4.0, -9.0, whorl) * 0.5 + uDamage * smoothstep(0.6, 1.0, vPmRelief) * 0.3);
    pmHeight = vPmRelief * 0.0;
    pmRough = mix(0.68, 0.22, uGloss) + mott * 0.1;
    // biofouling: diatom/algal film and spirorbid tubes
    float film = smoothstep(0.35, 0.75, pmFbm(vPmObj * 9.0 + uSeed) + uFouling * 0.45 - 0.3) * uFouling;
    c = mix(c, uFoul, film * 0.85);
    pmRough = mix(pmRough, 0.85, film);
    float sp = pmCell(vPmObj * 26.0 + uSeed);
    float ring = smoothstep(0.08, 0.05, abs(sp - 0.18)) * step(0.94, pmHash(floor(vPmObj * 26.0 + uSeed)));
    c = mix(c, vec3(0.86, 0.84, 0.78), ring * smoothstep(0.45, 0.8, uFouling));
    // silt film: settles in the sutures and between the cords, rubbed off the crests
    float silt = smoothstep(0.15, 0.6, pmFbm(vPmObj * 7.0 + uSeed * 1.3) * 0.7 + (1.0 - vPmRelief) * 0.45 + uSilt * 0.5 - 0.25) * uSilt;
    c = mix(c, uSiltColor * (0.85 + 0.3 * mott), silt * 0.85);
    pmRough = mix(pmRough, 0.92, silt);
    pmThin = 0.05;
  } else if (part == 1) {
    c = mix(uInterior, uInteriorBand, smoothstep(0.75, 0.95, cos(phi - uBandPhi)) * 0.6);
    c *= exp(-depth * 2.6);
    pmNacreMask = uNacre * exp(-depth * 1.5);
    pmRough = mix(0.35, 0.12, uGloss);
    pmThin = 0.25 * exp(-depth * 2.0);
  } else if (part == 2) {
    c = uLip * (0.9 + 0.2 * mott);
    pmRough = 0.3;
  } else if (part == 3) {
    c = mix(vec3(0.6, 0.58, 0.54), uSiltColor, uSilt * 0.5) * (0.85 + 0.3 * mott);
    pmRough = 0.85;
  } else {
    c = uCallus * (0.95 + 0.1 * mott);
    pmRough = 0.15;
  }
  return c;
}
`;

function shellHook(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aShell;
attribute float aRelief;
varying vec4 vPmShell;
varying float vPmRelief;
varying vec3 vPmObj;
${COMMON_VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPmShell = aShell; vPmRelief = aRelief; vPmObj = position;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
${COMMON_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${SHELL_FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = pmShell() * mix(1.0, 0.82, uPmWet);
pmTransColor = diffuseColor.rgb;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(pmRough, pmRough * 0.6, uPmWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
float pmFade = 1.0 - smoothstep(0.004, 0.02, length(fwidth(vPmObj)));
normal = pmBump(-vViewPosition, normal, (pmNoise(vPmObj * 90.0) - 0.5) * 0.0015 * vPmScale * pmFade, faceDirection);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = saturate((uPmWet - 0.15) * 1.2 * (int(vPmShell.z + 0.5) == 1 ? 0.3 : 1.0));
  material.clearcoatRoughness = 0.08;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = pmNacreMask;
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${LIGHT_EXTRAS}`);
  };
}

/** per-shell material (fouling, damage, wetness are individual) */
export function createShellMaterial(shell) {
  const sp = SHELL_SPECIES[shell.key];
  const C = sp.color;
  const uniforms = {
    ...envUniforms(),
    uBase: { value: col(C.base) }, uAlt: { value: col(C.alt) }, uBand: { value: col(C.band) },
    uInterior: { value: col(C.interior) }, uInteriorBand: { value: col(C.interiorBand) }, uLip: { value: col(C.lipColor) },
    uCallus: { value: col(C.callus ?? sp.umbilicalCallus?.color ?? C.lipColor) }, uFoul: { value: col('#5d6a3a') },
    uPattern: { value: PATTERN_ID[C.pattern] ?? 0 }, uBandPhi: { value: C.bandPhi }, uBandWidth: { value: C.bandWidth || 0.3 },
    uGloss: { value: C.gloss }, uNacre: { value: C.nacre }, uFouling: { value: shell.fouling }, uSeed: { value: (shell.seed % 997) * 0.37 },
    uDamage: { value: shell.damage }, uSilt: { value: shell.silt ?? 0 }, uSiltColor: { value: col('#8a8273') },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 0.6,
    iridescence: C.nacre > 0 ? 0.01 : 0, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 520],
    side: THREE.FrontSide,
  });
  m.name = `Shell_${shell.key}`;
  const hook = shellHook(uniforms);
  m.onBeforeCompile = hook;
  const key = `pagurus-shell-v1${C.nacre > 0 ? '-nacre' : ''}`;
  m.customProgramCacheKey = () => key;
  m.userData.pm = { hook, key, uniforms };
  m.userData.update = (o) => {
    if (o.wet !== undefined) uniforms.uPmWet.value = o.wet;
    if (o.caustics !== undefined) uniforms.uPmCaus.value = o.caustics;
    if (o.waterY !== undefined) uniforms.uPmWaterY.value = o.waterY;
    if (o.time !== undefined) uniforms.uPmTime.value = o.time;
  };
  return m;
}
setShellMaterialFactory(createShellMaterial);

// ---------------------------------------------------------------------------------------------
// Contact shadow (soft ambient-occlusion blob under crab and shell)
// ---------------------------------------------------------------------------------------------

export function createContactShadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.55 }, uSoft: { value: 1.0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uOpacity;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float r = length(q);
        float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * uOpacity;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/**
 * The tank lights its occupants by replacing each MeshStandardMaterial's onBeforeCompile with its caustics
 * shader (on a clone). Re-attach our hook in front of theirs so both apply, sharing our uniforms.
 */
export function adoptForeignMaterial(mesh) {
  const mat = mesh.material;
  const pm = mat?.userData?.pm;
  if (!pm || mat.onBeforeCompile === pm.hook || mat.userData.pmChained) return false;
  const foreign = mat.onBeforeCompile;
  const foreignKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (shader, renderer) => {
    pm.hook(shader, renderer);
    foreign.call(mat, shader, renderer);
  };
  mat.customProgramCacheKey = () => `${pm.key}|${foreignKey}`;
  mat.userData.pmChained = true;
  mat.needsUpdate = true;
  return true;
}

/**
 * Give `target` (one of our materials) the shader hook a host scene installed on `foreign` (a clone of
 * another crab's material, e.g. the tank's caustics), so both run on the target.
 */
export function chainForeignHook(target, foreign) {
  const pm = target?.userData?.pm;
  if (!pm || !foreign?.onBeforeCompile || foreign.onBeforeCompile === foreign.userData?.pm?.hook) return false;
  const fhook = foreign.onBeforeCompile;
  const fkey = foreign.customProgramCacheKey ? foreign.customProgramCacheKey() : '';
  target.onBeforeCompile = (shader, renderer) => {
    pm.hook(shader, renderer);
    fhook.call(foreign, shader, renderer);
  };
  target.customProgramCacheKey = () => `${pm.key}|${fkey}`;
  target.userData.pmChained = true;
  target.needsUpdate = true;
  return true;
}
