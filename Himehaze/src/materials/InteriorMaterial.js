// Wet mucosa of the mouth, teeth, gill-cover lining, gill chamber and gill filaments.
// Only visible when the mouth gapes or the gill covers flare.
import * as THREE from 'three';
import { commonGLSL } from './common.glsl.js';

const vertexShader = /* glsl */ `
#include <skinning_pars_vertex>
attribute vec4 color;
attribute float _gill;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vColor;
varying vec2 vUv;
varying float vGill;
void main() {
  vUv = uv;
  vColor = color;
  vGill = _gill;
  vec3 transformed = position;
  vec3 objectNormal = normal;
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
  #endif
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${commonGLSL}
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vColor;
varying vec2 vUv;
varying float vGill;
uniform float uMouthOpen;
uniform float uGillOpen;
void main() {
  vec3 N = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightDir);
  vec3 alb = vColor.rgb;
  float rough = 0.28;
  // gill filaments: dense lamellae across the arch, bright arterial red with darker gaps
  if (vGill > 0.0) {
    float f = fract(vUv.x * 150.0);
    float lam = smoothstep(0.0, 0.25, f) * smoothstep(1.0, 0.6, f);
    float tip = smoothstep(0.0, 1.0, vUv.y);
    vec3 gillC = mix(vec3(0.28, 0.02, 0.02), vec3(0.78, 0.12, 0.1), lam) * (0.55 + 0.45 * tip);
    alb = mix(alb, gillC, vGill);
    rough = mix(rough, 0.18, vGill);
    N = normalize(N + (lam - 0.5) * 0.35 * normalize(cross(N, vec3(0.0, 1.0, 0.0)) + 1e-4));
  }
  // back of the mouth: the pharynx opens between the gill arches (pale arches, dark red filaments between
  // them) and narrows to the dark oesophagus at the midline
  if (vColor.a > 0.75 && vGill <= 0.0) {
    float u = vUv.y;
    float lat = abs(vUv.x - 0.5) * 2.0;
    float arches = smoothstep(0.6, 0.72, u) * smoothstep(0.3, 0.55, lat);
    float f = fract((u - 0.6) / 0.4 * 4.0);
    float ridge = smoothstep(0.0, 0.3, f) * smoothstep(0.75, 0.45, f);
    vec3 archC = mix(vec3(0.16, 0.02, 0.02), vec3(0.5, 0.33, 0.3), ridge);
    alb = mix(alb, archC * (1.0 - 0.5 * smoothstep(0.85, 1.0, u)), arches);
    alb *= 1.0 - 0.85 * smoothstep(0.78, 0.95, u) * (1.0 - smoothstep(0.1, 0.35, lat));
  }
  // light reaching into the cavities is strongly occluded: the vertex colour already carries the depth AO
  float cavity = clamp(dot(vColor.rgb, vec3(0.333)) * 1.6, 0.0, 1.0);
  // light only reaches the cavities through the gape / gill slit: a barely parted mouth reads as a
  // dark line, a wide yawn lets light in
  float isMouth = step(0.75, vColor.a);
  float open = isMouth > 0.5 ? smoothstep(0.02, 0.4, uMouthOpen) : smoothstep(0.03, 0.35, uGillOpen);
  float occl = mix(0.06, 1.0, open);
  // even a wide gape only lets light in through the opening: the cavity darkens quickly with depth
  if (isMouth > 0.5 && vGill <= 0.0) occl *= mix(1.0, 0.07, smoothstep(0.05, 0.5, vUv.y));
  // palatal / buccal folds break up the reflections
  float folds = sin(vUv.x * 90.0 + sin(vUv.y * 17.0) * 2.0) * 0.5 + 0.5;
  alb *= mix(0.88, 1.0, folds * (1.0 - vGill));
  vec3 diff = alb * (uLightColor * max(dot(N, L), 0.0) * INV_PI * (0.35 + 0.65 * cavity) + ambientIrr(N)) * occl;
  float spec = specGGX(N, V, L, rough, 0.03);
  vec3 env = waterEnv(reflect(-V, N), rough) * F_Schlick(0.03, max(dot(N, V), 1e-3)) * (0.3 + 0.7 * cavity) * occl;
  vec3 col = diff + uLightColor * spec * (0.3 + 0.7 * cavity) * occl + env;
  col = applyFog(col, length(cameraPosition - vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createInteriorMaterial({ shared }) {
  return new THREE.ShaderMaterial({
    name: 'HimehazeInterior',
    uniforms: { ...shared, uMouthOpen: { value: 0 }, uGillOpen: { value: 0 } },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}
