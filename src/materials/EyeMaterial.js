// Eye: corneal dome with sharp wet reflections, refracted parallax onto the iris plane,
// protruding spherical lens in the pupil, golden iris with a view-dependent iridescent sheen.
import * as THREE from 'three';
import { commonGLSL } from './common.glsl.js';

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;
varying vec3 vLocalCam;
varying vec3 vLocalLight;
varying vec2 vUv;
uniform vec3 uLightDir;
void main() {
  vUv = uv;
  vLocalPos = position * 1000.0;               // mm
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  mat4 inv = inverse(modelMatrix);
  vLocalCam = (inv * vec4(cameraPosition, 1.0)).xyz * 1000.0;
  vLocalLight = normalize((inv * vec4(uLightDir, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
${commonGLSL}
uniform mat4 modelMatrix;
uniform sampler2D uIris;
uniform float uEyeR;         // mm
uniform float uPupil;        // rad
uniform float uIrisA;        // rad
uniform float uCausticAmt;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;
varying vec3 vLocalCam;
varying vec3 vLocalLight;
varying vec2 vUv;

vec2 irisUV(vec3 p) {
  float th = acos(clamp(normalize(p).z, -1.0, 1.0));
  float ps = atan(p.y, p.x);
  float r = th / PI;
  return vec2(0.5 + 0.5 * r * cos(ps), 0.5 - 0.5 * r * sin(ps));
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightDir);
  float NoV = max(dot(N, V), 1e-3);
  vec3 lp = vLocalPos;
  vec3 Vl = normalize(vLocalCam - lp);
  vec3 Nl = normalize(lp);
  float th = acos(clamp(Nl.z, -1.0, 1.0));
  vec3 axisW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));

  vec3 base;
  float irisMask = 1.0 - smoothstep(uIrisA - 0.03, uIrisA + 0.02, th);
  vec3 irisN = axisW;
  float pupil = 0.0;
  if (irisMask > 0.0) {
    // refraction through the cornea onto the (slightly domed) iris plane
    vec3 r = refract(-Vl, Nl, 1.0 / 1.035);
    float zI = uEyeR * cos(uIrisA) * 0.98;
    float tI = (zI - lp.z) / min(r.z, -1e-3);
    vec3 hitI = lp + r * max(tI, 0.0);
    hitI.z = sqrt(max(uEyeR * uEyeR - dot(hitI.xy, hitI.xy), 0.0));
    vec3 ic = texture(uIris, irisUV(hitI)).rgb;
    float thI = acos(clamp(normalize(hitI).z, -1.0, 1.0));
    pupil = 1.0 - smoothstep(uPupil - 0.02, uPupil + 0.01, thI);
    base = mix(texture(uIris, vUv).rgb, ic, irisMask);
  } else {
    base = texture(uIris, vUv).rgb;
  }
  float caus = mix(1.0, caustics(vWorldPos.xz * 180.0 - L.xz * vWorldPos.y * 180.0), uCausticAmt);
  vec3 Lc = uLightColor * caus;
  vec3 Nd = normalize(mix(N, irisN, irisMask * 0.7));
  vec3 diffuse = base * (Lc * sat(dot(Nd, L) * 0.8 + 0.2) * INV_PI + ambientIrr(Nd));
  // iridescent (guanine) sheen on the iris, strongest at grazing angles
  vec3 sheen = irisMask * (1.0 - pupil) * vec3(0.04, 0.1, 0.08) * pow(1.0 - NoV, 3.0) * (ambientIrr(N) + Lc * 0.03);
  // fish lens bulging through the pupil: tight secondary highlight, deep blue-black body
  vec3 lensC = vec3(0.0, 0.0, uEyeR * 0.28);
  vec3 lensN = normalize(lp - lensC);
  float lensSpec = pupil * specGGX(normalize(mat3(modelMatrix) * lensN), V, L, 0.06, 0.03);
  vec3 lensEnv = pupil * waterEnv(reflect(-V, normalize(mat3(modelMatrix) * lensN)), 0.08) * 0.03;
  diffuse = mix(diffuse, vec3(0.003, 0.005, 0.008) + ambientIrr(N) * 0.02, pupil);
  // cornea
  float spec = specGGX(N, V, L, 0.035, 0.03);
  vec3 envSpec = waterEnv(reflect(-V, N), 0.035) * F_Schlick(0.03, NoV) * 1.3;
  vec3 col = diffuse + sheen + Lc * (spec + lensSpec) + envSpec + lensEnv;
  col = applyFog(col, length(cameraPosition - vWorldPos));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createEyeMaterial({ irisTexture, params, shared }) {
  return new THREE.ShaderMaterial({
    name: 'MahazeEye',
    uniforms: {
      ...shared,
      uIris: { value: irisTexture },
      uEyeR: { value: params.radiusMM },
      uPupil: { value: params.pupilAngle },
      uIrisA: { value: params.irisAngle },
    },
    vertexShader,
    fragmentShader,
  });
}
