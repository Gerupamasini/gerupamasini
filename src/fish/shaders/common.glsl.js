// Shared GLSL snippets for the fish rig (vertex) and procedural shading.

import { NS } from '../RigLayout.js';

export const rigVertexCommon = /* glsl */ `
#ifdef DEPTH_ONLY
  #define VOUT
  #define VFLAT
#else
  #define VOUT out
  #define VFLAT flat out
#endif
uniform highp sampler2D uRig;
in float aFishRow;
VFLAT float vFishRow;

vec4 rigFetch(int x) { return texelFetch(uRig, ivec2(x, int(aFishRow + 0.5)), 0); }

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }

vec3 cr3(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3);
}

#define RIG_NS ${NS}

// Spine sample at axial parameter s in [0,1]
void spineSample(float s, out vec3 P, out vec4 Q) {
  float u = clamp(s, 0.0, 1.0) * float(RIG_NS - 1);
  int i = min(int(floor(u)), RIG_NS - 2);
  float f = u - float(i);
  vec3 p1 = rigFetch(i).xyz;
  vec3 p2 = rigFetch(i + 1).xyz;
  vec3 p0 = i > 0 ? rigFetch(i - 1).xyz : 2.0 * p1 - p2;
  vec3 p3 = i + 2 < RIG_NS ? rigFetch(i + 2).xyz : 2.0 * p2 - p1;
  P = cr3(p0, p1, p2, p3, f);
  vec4 q1 = rigFetch(RIG_NS + i);
  vec4 q2 = rigFetch(RIG_NS + i + 1);
  if (dot(q1, q2) < 0.0) q2 = -q2;
  Q = normalize(mix(q1, q2, f));
}

// per-fish misc parameters
vec4 rigMisc(int k) { return rigFetch(RIG_MISC + k); }

// ---- fin chains --------------------------------------------------------------
vec3 finNodeP(int base, int chain, int node, int nNodes) { return rigFetch(base + (chain * nNodes + node) * 2).xyz; }
vec3 finNodeN(int base, int chain, int node, int nNodes) { return rigFetch(base + (chain * nNodes + node) * 2 + 1).xyz; }

// t in [0, 1] runs from the root to the tip node; t > 1 extrapolates along the
// last segment (rays longer than the chain interpolated at their column)
vec3 chainPoint(int base, int chain, int nNodes, float t) {
  float u = max(t, 0.0) * float(nNodes - 1);
  int k = min(int(floor(u)), nNodes - 2);
  float f = u - float(k);
  vec3 p1 = finNodeP(base, chain, k, nNodes);
  vec3 p2 = finNodeP(base, chain, k + 1, nNodes);
  if (f > 1.0) return p2 + (p2 - p1) * (f - 1.0);
  vec3 p0 = k > 0 ? finNodeP(base, chain, k - 1, nNodes) : 2.0 * p1 - p2;
  vec3 p3 = k + 2 < nNodes ? finNodeP(base, chain, k + 2, nNodes) : 2.0 * p2 - p1;
  return cr3(p0, p1, p2, p3, f);
}

vec3 finPoint(int base, int nChains, int nNodes, float c, float t) {
  int j = clamp(int(floor(c)), 0, nChains - 2);
  float f = clamp(c - float(j), 0.0, 1.0);
  vec3 q1 = chainPoint(base, j, nNodes, t);
  vec3 q2 = chainPoint(base, j + 1, nNodes, t);
  vec3 q0 = j > 0 ? chainPoint(base, j - 1, nNodes, t) : 2.0 * q1 - q2;
  vec3 q3 = j + 2 < nChains ? chainPoint(base, j + 2, nNodes, t) : 2.0 * q2 - q1;
  return cr3(q0, q1, q2, q3, f);
}

vec3 finNormal(int base, int nChains, int nNodes, float c, float t) {
  int j = clamp(int(floor(c)), 0, nChains - 2);
  float f = clamp(c - float(j), 0.0, 1.0);
  float u = clamp(t, 0.0, 1.0) * float(nNodes - 1); // extrapolated tips keep the tip normal
  int k = min(int(floor(u)), nNodes - 2);
  float g = u - float(k);
  vec3 n00 = finNodeN(base, j, k, nNodes);
  vec3 n01 = finNodeN(base, j, k + 1, nNodes);
  vec3 n10 = finNodeN(base, j + 1, k, nNodes);
  vec3 n11 = finNodeN(base, j + 1, k + 1, nNodes);
  return normalize(mix(mix(n00, n01, g), mix(n10, n11, g), f) + 1e-6);
}
`;

export const noiseCommon = /* glsl */ `
// pow() with a zero/negative base is undefined (NaN on some ANGLE back-ends)
float spow(float x, float y) { return x <= 0.0 ? 0.0 : exp2(max(y * log2(x), -120.0)); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

float vnoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0)), n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1)), n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.9375;
}
float vnoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}
`;

// Underwater light transport shared by every material inside the tank.
export const underwaterCommon = /* glsl */ `
uniform sampler2D uCaustics;
uniform vec4 uCausticParams;   // x: world tile size, y: intensity, z: surface height, w: time
uniform vec3 uCausticLightDir; // direction TOWARD the light (normalised)
uniform vec3 uWaterMin;
uniform vec3 uWaterMax;
uniform vec3 uWaterAbsorb;     // per-channel extinction (1/m)
uniform vec3 uWaterScatter;    // in-scattered radiance colour (at mid depth)
uniform float uWaterDensity;   // 0 = no water (studio): no extinction, no hood-light falloff

// Hood-light falloff with depth. The LED bar hangs ~10 cm above the water and
// behaves like a line source (irradiance ~ 1/r); together with the vertical
// absorption this makes fish near the surface bright and the gravel and the
// lower back wall noticeably darker. Normalised to 1 at mid-water depth, so
// the key-light intensity keeps its meaning. Close under the surface the
// bar no longer acts as a line source (its 7 cm width and the diffuser
// spread the light), so the rise is soft-capped at 1.5: white skin and fins
// right under the lamp stay below clipping.
#define UW_LAMP_H 0.13
#define UW_REF_DEPTH 0.2
float lightFalloff(vec3 wp) {
  float depth = max(0.0, uCausticParams.z - wp.y);
  float f = (UW_LAMP_H + UW_REF_DEPTH) / (UW_LAMP_H + depth) * exp(-0.4 * (depth - UW_REF_DEPTH));
  // soft knee from 1.0, asymptote 1.5
  f = f > 1.0 ? 1.0 + 0.5 * (f - 1.0) / (0.5 + (f - 1.0)) : f;
  return uWaterDensity > 0.0 ? f : 1.0;
}
// the in-water ambient (light scattered down from the surface) falls off more gently
float ambientFalloff(vec3 wp) { return mix(1.0, lightFalloff(wp), 0.55); }

// projected caustic pattern only (mean 1): bright filaments near the surface,
// widening and softening with depth (the LED bar is an extended source)
vec3 causticsPattern(vec3 wp, vec3 n) {
  float depth = max(0.0, uCausticParams.z - wp.y);
  vec3 L = uCausticLightDir;
  vec2 ps = wp.xz + L.xz * (depth / max(0.2, L.y));
  vec2 uv = ps / uCausticParams.x;
  float lod = clamp(0.3 + depth * 3.2, 0.0, 2.6);
  // slight chromatic dispersion of the focused light
  float d = 0.0015 + depth * 0.004;
  vec3 c = vec3(textureLod(uCaustics, uv + vec2(d, 0.0), lod).r, textureLod(uCaustics, uv, lod).r, textureLod(uCaustics, uv - vec2(d, 0.0), lod).r);
  float facing = smoothstep(-0.1, 0.6, dot(n, L));
  float contrast = uCausticParams.y * facing * (0.35 + 0.65 * exp(-depth * 2.2));
  // texture mean ≈ 0.15 -> factor averages to 1 (energy conserving redistribution)
  return max(vec3(0.0), 1.0 + 0.9 * contrast * (c / 0.15 - 1.0));
}
// direct hood light modulation: caustics x depth falloff
vec3 causticsRGB(vec3 wp, vec3 n) { return causticsPattern(wp, n) * lightFalloff(wp); }
float causticsAt(vec3 wp, vec3 n) { return dot(causticsPattern(wp, n), vec3(0.3333)) * lightFalloff(wp); }

// distance travelled inside the water volume between the camera and wp, and
// the point where the view ray enters the water
float waterSegment(vec3 wp, out vec3 entry) {
  vec3 ro = cameraPosition;
  vec3 rd = wp - ro;
  float len = length(rd);
  rd /= max(len, 1e-5);
  vec3 inv = 1.0 / (rd + vec3(1e-6));
  vec3 t0 = (uWaterMin - ro) * inv;
  vec3 t1 = (uWaterMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  float tNear = max(max(tmin.x, tmin.y), tmin.z);
  tNear = clamp(tNear, 0.0, len);
  entry = ro + rd * tNear;
  return max(0.0, len - tNear);
}
float waterPath(vec3 wp) {
  vec3 e;
  return waterSegment(wp, e);
}

// wavelength-dependent extinction (red first: distant things turn blue-green
// and lose contrast) plus in-scattering, which is brighter in the upper,
// better lit part of the water column
vec3 waterAttenuate(vec3 col, vec3 wp) {
  vec3 e;
  float d = waterSegment(wp, e) * uWaterDensity;
  vec3 T = exp(-uWaterAbsorb * d);
  vec3 S = uWaterScatter * ambientFalloff(vec3(0.0, 0.5 * (e.y + wp.y), 0.0));
  return col * T + S * (1.0 - T);
}
`;
