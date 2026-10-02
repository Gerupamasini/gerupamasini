import { ShaderChunk } from 'three';

/** Defines three's cube-UV sampling needs for a PMREM texture of the given height (see WebGLProgram). */
export function cubeUVDefines(imageHeight: number): Record<string, string | number> {
  const maxMip = Math.log2(imageHeight) - 2;
  return {
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: (1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16))).toPrecision(9),
    CUBEUV_TEXEL_HEIGHT: (1 / imageHeight).toPrecision(9),
    CUBEUV_MAX_MIP: maxMip.toFixed(1),
  };
}

/** BRDF pieces and image-based lighting from the sky's PMREM. */
export const LIGHTING_GLSL = /* glsl */ `
uniform sampler2D uEnv;
${ShaderChunk.cube_uv_reflection_fragment}
vec3 envRadiance(vec3 d, float rough) { return textureCubeUV(uEnv, d, rough).rgb; }
// cosine-weighted sky light on a surface with normal n (radiance; multiply by albedo for the diffuse)
vec3 envIrradiance(vec3 n) { return textureCubeUV(uEnv, n, 1.0).rgb; }

float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float V_Smith(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2), gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
float F_Schlick(float f0, float c) { float k = pow(1.0 - c, 5.0); return f0 + (1.0 - f0) * k; }
// GGX specular times NoL (white light, scalar)
float specGGX(vec3 N, vec3 V, vec3 L, float rough, float f0) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return 0.0;
  vec3 H = normalize(V + L);
  float NoV = max(dot(N, V), 1e-4), NoH = sat(dot(N, H)), VoH = sat(dot(V, H));
  float a = max(rough * rough, 0.0025);
  return D_GGX(NoH, a) * V_Smith(NoV, NoL, a) * F_Schlick(f0, VoH) * NoL;
}
// split-sum environment BRDF (Karis' analytic fit, as three's DFGApprox)
vec2 envBRDF(float NoV, float rough) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}
// unpolarised Fresnel reflectance of an air–water interface (n = 1.333) for cos of the incidence angle
float fresnelWater(float cosI) {
  cosI = clamp(cosI, 1e-4, 1.0);
  float n = 1.333;
  float sinT2 = (1.0 - cosI * cosI) / (n * n);
  float cosT = sqrt(max(1.0 - sinT2, 0.0));
  float rs = (cosI - n * cosT) / (cosI + n * cosT);
  float rp = (cosT - n * cosI) / (cosT + n * cosI);
  return 0.5 * (rs * rs + rp * rp);
}
`;
