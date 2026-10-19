// Thin-membrane fin material.
// Every fin is drawn twice, back-to-front per fin (sorted each frame):
//   pass 0: framebuffer *= per-channel transmittance  (blend ZERO, SRC_COLOR)
//   pass 1: framebuffer += scattered light + specular (blend ONE, ONE)
// This gives coloured, order-correct transmission without alpha-sorting artefacts between fins.
import * as THREE from 'three';
import { commonGLSL } from './common.glsl.js';

const vertexShader = /* glsl */ `
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
attribute vec4 tangent;
uniform float uFloorY;          // world height of the sand (far below when there is no floor)
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vWorldTangent;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 transformed = position;
  vec3 objectNormal = normal;
  vec3 objectTangent = tangent.xyz;
  // fin shape morphs (fold, trailing flex, sculling wave) before skinning
  #include <morphinstance_vertex>
  #include <morphtarget_vertex>
  #ifdef USE_SKINNING
    #include <skinbase_vertex>
    mat4 skinMatrix = mat4(0.0);
    skinMatrix += skinWeight.x * boneMatX;
    skinMatrix += skinWeight.y * boneMatY;
    skinMatrix += skinWeight.z * boneMatZ;
    skinMatrix += skinWeight.w * boneMatW;
    skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
    transformed = (skinMatrix * vec4(position, 1.0)).xyz;
    objectNormal = mat3(skinMatrix) * normal;
    objectTangent = mat3(skinMatrix) * tangent.xyz;
  #endif
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  // ground contact: whatever part of a fin is pressed into the sand lies flat on it (soft limit, so the
  // membrane rolls smoothly onto the sand instead of creasing)
  const float LIM = 0.00012;
  float gap = wp.y - uFloorY;
  if (gap < LIM) wp.y = uFloorY + LIM * exp((gap - LIM) / LIM);
  vWorldPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vWorldNormal = normalize(m * objectNormal);
  vWorldTangent = vec4(normalize(m * objectTangent), tangent.w);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${commonGLSL}
uniform sampler2D uColor;
uniform vec3 uTint;            // colour morph: tint of membrane and rays
uniform float uMelK;           // colour morph: melanophore optical-depth factor
uniform sampler2D uData;       // r: ray density, g: melanin, b: iridophores, a: membrane coverage
uniform sampler2D uNormalMap;
uniform int uPass;
uniform float uFinDensity;
uniform float uCausticAmt;
uniform int uDebug;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vWorldTangent;
varying vec2 vUv;

void main() {
  vec4 dat = texture(uData, vUv);
  float cov = dat.a;
  if (cov < 0.004) discard;
  vec3 alb = texture(uColor, vUv).rgb * uTint;
  float face = gl_FrontFacing ? 1.0 : -1.0;
  vec3 Ng0 = normalize(vWorldNormal);
  vec3 Ng = Ng0 * face;
  vec3 T = normalize(vWorldTangent.xyz - Ng0 * dot(Ng0, vWorldTangent.xyz));
  vec3 B = cross(Ng0, T) * vWorldTangent.w;
  vec3 nm = texture(uNormalMap, vUv).xyz * 2.0 - 1.0;
  // rays protrude on both faces: keep tangential components, flip only the normal component
  vec3 N = normalize(T * nm.x + B * nm.y + Ng * nm.z);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightDir);
  float muV = max(abs(dot(Ng, V)), 0.1);
  float cosL = dot(Ng, L);
  float muL = max(abs(cosL), 0.1);

  float ray = dat.r, mel = 1.0 - pow(max(1.0 - dat.g, 0.0), uMelK), irid = dat.b;
  float tauS = uFinDensity * (0.055 + 0.5 * ray + 0.7 * irid);
  vec3 tauA = vec3(0.004, 0.008, 0.02) + ray * vec3(0.05, 0.12, 0.26) + mel * vec3(2.3, 2.7, 3.1) + (1.0 - alb) * 0.05;
  // colour morph: diffuse pigment in membrane and rays (yellowish for amber, dusky for the dark morph)
  tauA += (1.0 - uTint) * (0.3 + 0.9 * ray);
  vec3 tauT = tauA + vec3(tauS);
  vec3 omega = vec3(tauS) * alb / tauT;

  float F = F_Schlick(0.03, max(dot(N, V), 1e-3));
  vec3 Tv = exp(-tauT / muV) * (1.0 - F);

  if (uPass == 0) {
    gl_FragColor = vec4(mix(vec3(1.0), Tv, cov), 1.0);
    return;
  }

  // single scattering in a thin slab (plane-parallel), HG phase with a weak back lobe
  float cosTh = dot(-L, V);
  float p = 0.72 * hgPhase(cosTh, 0.62) + 0.28 * hgPhase(cosTh, -0.3);
  vec3 ss;
  if (cosL > 0.0) {
    ss = omega * p * muL / (muL + muV) * (1.0 - exp(-tauT * (1.0 / muL + 1.0 / muV)));
    // multiple scattering in the collagenous rays/membrane: a soft Lambert-like milky reflection
    ss += omega * (1.0 - exp(-tauT * 2.0 / muV)) * muL * 0.075;
  } else {
    float d = muL - muV;
    if (abs(d) < 1e-3) ss = omega * p * (tauT / muV) * exp(-tauT / muV);
    else ss = omega * p * muL / d * (exp(-tauT / muL) - exp(-tauT / muV));
  }
  float caus = mix(1.0, caustics(vWorldPos.xz * 180.0 - L.xz * vWorldPos.y * 180.0), uCausticAmt);
  vec3 Lc = uLightColor * caus;
  vec3 scatter = Lc * ss * 4.0 * PI * 0.32;
  vec3 amb = (ambientIrr(Ng) + ambientIrr(-Ng)) * 0.5 * omega * (1.0 - exp(-tauT / muV)) * 1.2;
  float spec = 0.6 * specGGX(N, V, L, 0.32, 0.03) + 0.18 * specGGX(Ng, V, L, 0.12, 0.02);
  vec3 envSpec = waterEnv(reflect(-V, N), 0.32) * F * 0.7;
  vec3 col = (scatter + amb) + Lc * spec + envSpec;
  float fog = exp(-length(cameraPosition - vWorldPos) * uFogDensity);
  col = col * fog + uFogColor * (1.0 - fog) * (1.0 - dot(Tv, vec3(0.333)));
  if (uDebug == 1) col = vec3(0.0);
  gl_FragColor = vec4(col * cov, 1.0);
}
`;

export function createFinMaterials({ textures, shared, tint = [1, 1, 1], melK = 1 }) {
  const make = (pass) => new THREE.ShaderMaterial({
    name: pass === 0 ? 'MahazeFinTransmit' : 'MahazeFinScatter',
    uniforms: {
      ...shared,
      uColor: { value: textures.color },
      uTint: { value: new THREE.Vector3(...tint) },
      uMelK: { value: melK },
      uData: { value: textures.data },
      uNormalMap: { value: textures.normal },
      uPass: { value: pass },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: pass === 0 ? THREE.ZeroFactor : THREE.OneFactor,
    blendDst: pass === 0 ? THREE.SrcColorFactor : THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  return { transmit: make(0), scatter: make(1) };
}
