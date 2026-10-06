// Volumetric translucent tissue material for the goby body.
//
// The body is shaded as an opaque surface (depth-writing, no blending → no sorting artefacts),
// while its translucency is computed by ray-marching the analytic body volume that ships with the
// model (profile table in the glTF extras):
//   * background transmission: refracted twice (water→tissue→water), attenuated per channel,
//     blurred by forward scattering (split into an unscattered and a scattered part)
//   * back-light diffusion: diffusion transmittance along the light path through the body
//   * interior structures (vertebral column, neural/haemal spines, myosepta, viscera + peritoneum,
//     gill filaments, skull) modulate scattering/absorption inside the volume
//   * skin chromatophores (melanin / iridophores / xanthophores) filter light at entry and exit
import * as THREE from 'three';
import { commonGLSL } from './common.glsl.js';

// Skinned: the volume is evaluated in the rest pose (vObjPos) and world directions are mapped into
// that rest space with the per-vertex skinning rotation (vObjToWorld).
export const skinnedVertexShader = /* glsl */ `
#include <skinning_pars_vertex>
attribute vec4 tangent;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vWorldTangent;
varying vec2 vUv;
varying vec3 vObjPos;
varying mat3 vObjToWorld;
void main() {
  vUv = uv;
  vObjPos = position;
  vec3 transformed = position;
  vec3 objectNormal = normal;
  vec3 objectTangent = tangent.xyz;
  mat3 skinRot = mat3(1.0);
  #ifdef USE_SKINNING
    #include <skinbase_vertex>
    mat4 skinMatrix = mat4(0.0);
    skinMatrix += skinWeight.x * boneMatX;
    skinMatrix += skinWeight.y * boneMatY;
    skinMatrix += skinWeight.z * boneMatZ;
    skinMatrix += skinWeight.w * boneMatW;
    skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
    transformed = (skinMatrix * vec4(position, 1.0)).xyz;
    skinRot = mat3(skinMatrix);
    objectNormal = skinRot * normal;
    objectTangent = skinRot * tangent.xyz;
  #endif
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vWorldNormal = normalize(m * objectNormal);
  vWorldTangent = vec4(normalize(m * objectTangent), tangent.w);
  vObjToWorld = m * skinRot;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const vertexShader = skinnedVertexShader;

const fragmentShader = /* glsl */ `
${commonGLSL}
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;

uniform sampler2D uAlbedo;
uniform sampler2D uNormalMap;
uniform sampler2D uORM;
uniform sampler2D uPigment;
uniform sampler2D uCapAlbedo;   // snout cap: rgb albedo, a roughness (planar y/z projection)
uniform sampler2D uCapPigment;
uniform vec4 uCapRect;          // y0, y1, z0, z1 (mm)
uniform sampler2D uProfile;
uniform sampler2D uBg;          // opaque scene behind the fish (rgb) + view distance (a)
uniform vec2 uResolution;
uniform vec4 uFrame;            // S0, Y0, SL, SEND (mm)
uniform vec4 uJaws;             // dense jaw/lip tissue: s ramp (x→y), height ramp (z→w)
uniform float uVertStart;
uniform float uVertLen;
uniform float uSigS;            // base tissue scattering (1/mm)
uniform vec3 uSigA;             // base tissue absorption (1/mm)
uniform float uScatter;         // user scale on scattering (milkiness)
uniform float uInterior;        // interior structure visibility
uniform float uIor;             // tissue / water relative IOR
uniform float uNormalStrength;
uniform float uBackStrength;
uniform float uCausticAmt;
uniform int uDebug;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec4 vWorldTangent;
varying vec2 vUv;
varying vec3 vObjPos;
varying mat3 vObjToWorld;
mat3 gWorldToObj;

#define PROFILE_N 512.0
#define G_FWD 0.82
#define G_TIS 0.78

vec3 toFish(vec3 o) { return vec3(uFrame.x - o.z * 1000.0, o.y * 1000.0 + uFrame.y, o.x * 1000.0); }
vec3 dirToFish(vec3 o) { return vec3(-o.z, o.y, o.x); }
vec3 fishToObj(vec3 f) { return vec3(f.z * 0.001, (f.y - uFrame.y) * 0.001, (uFrame.x - f.x) * 0.001); }
vec3 fishDirToObj(vec3 d) { return vec3(d.z, d.y, -d.x); }
vec3 worldDirToFish(vec3 d) { return normalize(dirToFish(gWorldToObj * d)); }

struct Sec { float yc; float t; float b; float w; float nT; float nB; };
Sec section(float s) {
  float u = clamp(s / uFrame.w, 0.0, 1.0);
  float x = (u * (PROFILE_N - 1.0) + 0.5) / PROFILE_N;
  vec4 a = texture(uProfile, vec2(x, 0.25));
  vec4 c = texture(uProfile, vec2(x, 0.75));
  return Sec(a.x, a.y, a.z, a.w, c.x, c.y);
}

// normalised superellipse radius (1 = body surface)
float bodyR(vec3 p) {
  if (p.x <= 0.02 || p.x >= uFrame.w - 0.02) return 4.0;
  Sec q = section(p.x);
  float dy = p.y - q.yc;
  bool up = dy > 0.0;
  float h = max(up ? q.t : q.b, 1e-3);
  float n = up ? q.nT : q.nB;
  float a = pow(abs(p.z) / max(q.w, 1e-3), n) + pow(abs(dy) / h, n);
  return pow(a, 1.0 / n);
}

vec3 gradR(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.02;
  return normalize(k.xyy * bodyR(p + k.xyy * e) + k.yyx * bodyR(p + k.yyx * e) +
                   k.yxy * bodyR(p + k.yxy * e) + k.xxx * bodyR(p + k.xxx * e));
}

float exitDist(vec3 p, vec3 d, float maxLen) {
  float stepL = maxLen / 12.0;
  float lo = 0.0, hi = maxLen;
  bool found = false;
  for (int i = 1; i <= 12; i++) {
    float t = stepL * float(i);
    if (bodyR(p + d * t) > 1.0) { hi = t; found = true; break; }
    lo = t;
  }
  if (!found) return maxLen;
  for (int i = 0; i < 6; i++) {
    float m = 0.5 * (lo + hi);
    if (bodyR(p + d * m) > 1.0) hi = m; else lo = m;
  }
  return 0.5 * (lo + hi);
}

// skin UV of an arbitrary point on the loft (inverse of the loft parameterisation)
vec2 fishUV(vec3 p) {
  Sec q = section(p.x);
  float dy = p.y - q.yc;
  bool up = dy > 0.0;
  float n = up ? q.nT : q.nB;
  float h = max(up ? q.t : q.b, 1e-3);
  float a = sign(p.z) * pow(abs(p.z) / max(q.w, 1e-3), n * 0.5);
  float c = -sign(dy) * pow(abs(dy) / h, n * 0.5);
  float phi = atan(a, c);
  if (phi < 0.0) phi += 2.0 * PI;
  return vec2(clamp(p.x / uFrame.w, 0.0, 1.0), phi / (2.0 * PI));
}

// chromatophore filter of the skin layer (melanin, iridophores, xanthophores)
vec3 skinT(vec3 pig) {
  vec3 t = exp(-pig.r * vec3(3.4, 3.8, 4.3));
  t *= exp(-pig.b * vec3(0.02, 0.12, 0.5));
  t *= 1.0 - 0.45 * pig.g;
  return t;
}

// Scattering (1/mm) and absorption (1/mm, rgb) of the tissue at a fish-space point
void medium(vec3 p, out float sS, out vec3 sA) {
  Sec q = section(p.x);
  float s = p.x;
  float dy = p.y - q.yc;
  float hn = dy / max(dy > 0.0 ? q.t : q.b, 1e-3);
  float zn = p.z / max(q.w, 1e-3);
  sS = uSigS * uScatter;
  sA = uSigA;
  float I = uInterior;

  // head: skull, brain case, jaws are denser
  float head = 1.0 - smoothstep(8.5, 11.5, s);
  sS += head * 1.5 * uScatter;
  sA += head * vec3(0.008, 0.016, 0.03);
  // gill filaments under the operculum (haemoglobin: absorbs green/blue)
  float gill = smoothstep(7.2, 8.6, s) * (1.0 - smoothstep(10.3, 11.3, s)) *
               smoothstep(0.25, 0.6, abs(zn)) * (1.0 - smoothstep(-0.1, 0.45, hn)) * smoothstep(-1.0, -0.6, hn);
  sA += gill * vec3(0.012, 0.2, 0.17) * (0.35 + 0.65 * I);

  float trunk = smoothstep(uVertStart - 0.5, uVertStart + 0.5, s) * (1.0 - smoothstep(uFrame.z - 0.3, uFrame.z + 0.5, s));
  if (trunk > 0.0 && I > 0.0) {
    // vertebral column with denser inter-vertebral joints
    float spineY = q.yc + 0.06 * q.t;
    float dys = p.y - spineY;
    float rad = mix(0.3, 0.16, clamp((s - uVertStart) / (uFrame.z - uVertStart), 0.0, 1.0));
    float vph = fract((s - uVertStart) / uVertLen);
    float joint = smoothstep(0.3, 0.5, abs(vph - 0.5));
    float spine = exp(-(dys * dys + p.z * p.z) / (rad * rad)) * trunk;
    sS += I * spine * (7.0 + 6.0 * joint);
    sA += I * spine * vec3(0.05, 0.065, 0.09);
    // neural & haemal spines: slanted rods in the median plane
    float mid = exp(-p.z * p.z / 0.03);
    float rph = fract(((s - uVertStart) - 0.62 * abs(dys)) / uVertLen);
    float rod = exp(-pow((rph - 0.5) * uVertLen / 0.06, 2.0)) * mid * trunk *
                smoothstep(0.25, 0.5, abs(dys)) * (1.0 - smoothstep(0.7, 0.95, abs(hn)));
    sS += I * rod * 3.5;
    // myosepta (W-shaped, apex forward at the horizontal septum)
    float an = abs(hn);
    float chev = an < 0.55 ? an / 0.55 : 1.0 - 0.45 * (an - 0.55) / 0.45;
    float mph = fract(((s - uVertStart) - 0.95 * chev) / uVertLen);
    float sept = exp(-pow((mph - 0.5) * uVertLen / 0.08, 2.0)) * trunk;
    sS += I * sept * 1.6;
    // horizontal septum
    sS += I * exp(-dys * dys / 0.02) * trunk * smoothstep(0.3, 0.85, abs(zn)) * 1.1;
  }
  if (trunk > 0.0) {
    // internal melanophores: a segmental row above the vertebral column and along the haemal arches
    float spineY = q.yc + 0.06 * q.t;
    float ph2 = fract((s - uVertStart) / uVertLen + 0.25);
    float seg = exp(-pow((ph2 - 0.5) * uVertLen / 0.2, 2.0));
    float rowU = exp(-(pow(p.y - spineY - 0.5, 2.0) + p.z * p.z) / 0.035);
    float rowD = exp(-(pow(p.y - spineY + 0.55, 2.0) + p.z * p.z) / 0.03) * smoothstep(23.0, 25.0, s);
    sA += (rowU * 0.9 + rowD * 0.7) * seg * trunk * vec3(1.5, 1.7, 1.9) * (0.5 + 0.5 * I);
  }
  // abdominal cavity: viscera + melanin-bearing peritoneum on its dorsal wall
  vec3 vc = vec3(17.2, q.yc - 0.42 * q.b, 0.0);
  vec3 vq = (p - vc) / vec3(6.0, 0.58 * q.b + 0.1, 0.66 * q.w + 0.05);
  float e = length(vq);
  float gut = 1.0 - smoothstep(0.7, 1.0, e);
  sS += I * gut * 2.2;
  sA += I * gut * vec3(0.03, 0.05, 0.08);
  float peri = exp(-pow((e - 0.93) / 0.07, 2.0)) * smoothstep(-0.3, 0.5, vq.y);
  float periSpots = 0.35 + 0.65 * smoothstep(0.2, 0.8, sin(s * 3.1 + p.z * 5.0) * sin(s * 1.7 - p.z * 3.3 + 1.0) * 0.5 + 0.5);
  sA += peri * periSpots * vec3(0.5, 0.53, 0.58) * (0.5 + 0.5 * I);
}

// ---- simple organs and the vertebral column (rest-space fish mm)
// Their optical depth along a ray is integrated analytically, so thin or small structures are never
// missed by the coarse march: they block the transmitted background, the back light and the floor light.
float erfA(float x) { return tanh(1.2025 * x); }
// chord through a uniform ellipsoid, softened toward the rim (∝ 1 − h², h = normalised impact parameter)
float ellChord(vec3 o, vec3 d, float L, vec3 c, vec3 r, inout float tFirst) {
  vec3 oo = (o - c) / r, dd = d / r;
  float a = dot(dd, dd), b = dot(oo, dd), cc = dot(oo, oo) - 1.0;
  float disc = b * b - a * cc;
  if (disc <= 0.0) return 0.0;
  float sq = sqrt(disc);
  float a0 = clamp((-b - sq) / a, 0.0, L), a1 = clamp((-b + sq) / a, 0.0, L);
  if (a1 <= a0) return 0.0;
  tFirst = min(tFirst, a0);
  float h2 = clamp(cc + 1.0 - b * b / a, 0.0, 1.0);
  return (a1 - a0) * sqrt(1.0 - h2);
}
// Gaussian tube around the (nearly straight) vertebral column, with denser centrum rims
float spineTau(vec3 o, vec3 d, float L, inout float tFirst) {
  float spineY = 3.68;
  vec2 dp = d.yz;
  float dd = max(dot(dp, dp), 0.02);
  float tc = 0.0, sc = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 w = o.yz - vec2(spineY, 0.0);
    tc = -dot(w, dp) / dd;
    sc = o.x + d.x * clamp(tc, 0.0, L);
    Sec q = section(clamp(sc, uVertStart, 40.6));
    spineY = q.yc + 0.06 * q.t;
  }
  vec2 cpt = o.yz - vec2(spineY, 0.0) + dp * tc;
  float u = clamp((sc - uVertStart) / (40.6 - uVertStart), 0.0, 1.0);
  float r = mix(0.34, 0.17, u);
  float sig = r / sqrt(dd);
  float g = exp(-dot(cpt, cpt) / (r * r)) * sig * 0.8862 * (erfA((L - tc) / sig) - erfA(-tc / sig));
  float win = smoothstep(uVertStart - 0.4, uVertStart + 0.4, sc) * (1.0 - smoothstep(40.2, 41.0, sc));
  float vph = fract((sc - uVertStart) / uVertLen);
  float rim = smoothstep(0.3, 0.48, abs(vph - 0.5));
  if (g * win > 0.02) tFirst = min(tFirst, max(tc - sig, 0.0));
  return g * win * (0.7 + 0.6 * rim);
}
// absorption optical depth (rgb) of the organs along o + d t, t ∈ [0, L]; tFirst = first organ hit
vec3 organTau(vec3 o, vec3 d, float L, out float tFirst) {
  tFirst = 1e3;
  vec3 tau = spineTau(o, d, L, tFirst) * vec3(4.0, 4.4, 5.0);                                      // vertebral column
  tau += ellChord(o, d, L, vec3(13.4, 1.55, 0.2), vec3(1.9, 1.05, 1.85), tFirst) * vec3(1.3, 2.3, 2.9); // liver
  tau += ellChord(o, d, L, vec3(17.9, 1.4, -0.1), vec3(3.7, 1.0, 1.35), tFirst) * vec3(1.0, 1.4, 2.3);  // stomach + gut
  tau += ellChord(o, d, L, vec3(16.9, 2.72, 0.0), vec3(5.4, 0.3, 1.75), tFirst) * vec3(3.8, 4.0, 4.2);    // dark peritoneum roof
  tau += ellChord(o, d, L, vec3(16.8, 3.2, 0.0), vec3(5.8, 0.22, 0.32), tFirst) * vec3(0.8, 2.6, 2.6);     // kidney under the column
  tau += ellChord(o, d, L, vec3(10.2, 0.9, 0.0), vec3(0.7, 0.5, 0.6), tFirst) * vec3(0.5, 4.0, 3.6);      // heart
  tau += ellChord(o, d, L, vec3(6.8, 4.4, 0.0), vec3(2.4, 0.75, 0.8), tFirst) * vec3(0.15, 0.2, 0.3);    // brain
  tau += ellChord(o, d, L, vec3(8.3, 3.75, 0.78), vec3(0.32, 0.2, 0.11), tFirst) * vec3(6.0);             // otoliths
  tau += ellChord(o, d, L, vec3(8.3, 3.75, -0.78), vec3(0.32, 0.2, 0.11), tFirst) * vec3(6.0);
  return tau;
}

vec3 sampleBg(vec2 uv, float lod) {
  if (lod < 0.5) return textureLod(uBg, uv, 0.0).rgb;
  vec2 px = exp2(lod - 1.0) / uResolution;
  vec3 c = textureLod(uBg, uv, lod).rgb * 0.4;
  c += textureLod(uBg, uv + vec2( px.x,  px.y * 0.5), lod - 0.5).rgb * 0.15;
  c += textureLod(uBg, uv + vec2(-px.x * 0.5,  px.y), lod - 0.5).rgb * 0.15;
  c += textureLod(uBg, uv + vec2(-px.x, -px.y * 0.5), lod - 0.5).rgb * 0.15;
  c += textureLod(uBg, uv + vec2( px.x * 0.5, -px.y), lod - 0.5).rgb * 0.15;
  return c;
}

void main() {
  vec3 Ng = normalize(vWorldNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  gWorldToObj = inverse(vObjToWorld);
  vec3 pF = toFish(vObjPos);
  vec3 NgF = worldDirToFish(Ng);

  // seam-free texture derivatives: v wraps at the ventral midline, so take the smaller of the plain
  // and the half-shifted derivative (otherwise the jump selects the coarsest mip → a line under the chin)
  vec2 uvA = vUv, uvB = vec2(vUv.x, fract(vUv.y + 0.5));
  vec2 dxA = dFdx(uvA), dyA = dFdy(uvA), dxB = dFdx(uvB), dyB = dFdy(uvB);
  vec2 gdx = dot(dxA, dxA) < dot(dxB, dxB) ? dxA : dxB;
  vec2 gdy = dot(dyA, dyA) < dot(dyB, dyB) ? dyA : dyB;

  // snout cap: the loft UVs converge at the snout tip, so the front face is shaded from a planar map
  float capW = (1.0 - smoothstep(0.75, 1.55, pF.x)) * smoothstep(0.05, 0.45, -NgF.x);
  vec2 capUV = vec2((pF.z - uCapRect.z) / (uCapRect.w - uCapRect.z), (pF.y - uCapRect.x) / (uCapRect.y - uCapRect.x));

  vec3 Tw = normalize(vWorldTangent.xyz - Ng * dot(Ng, vWorldTangent.xyz));
  vec3 Bw = cross(Ng, Tw) * vWorldTangent.w;
  vec3 nm = textureGrad(uNormalMap, vUv, gdx, gdy).xyz * 2.0 - 1.0;
  nm.xy *= uNormalStrength * (1.0 - capW);
  vec3 N = normalize(mat3(Tw, Bw, Ng) * nm);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float nv = dot(N, V);
  if (nv < 0.02) N = normalize(N + V * (0.02 - nv));
  vec3 L = normalize(uLightDir);

  vec3 albedo = textureGrad(uAlbedo, vUv, gdx, gdy).rgb;
  vec3 orm = textureGrad(uORM, vUv, gdx, gdy).rgb;
  vec3 pig = textureGrad(uPigment, vUv, gdx, gdy).rgb;
  float ao = orm.r;
  float rough = orm.g;
  if (capW > 0.001) {
    vec4 ca = texture(uCapAlbedo, capUV);
    albedo = mix(albedo, ca.rgb, capW);
    rough = mix(rough, ca.a, capW);
    pig = mix(pig, texture(uCapPigment, capUV).rgb, capW);
    ao = mix(ao, 1.0, capW * 0.5);
  }
  rough = clamp(rough, 0.06, 1.0);

  // ---- fish space
  vec3 NF = worldDirToFish(N);
  vec3 VF = worldDirToFish(-V);
  vec3 LF = worldDirToFish(L);
  Sec q0 = section(clamp(pF.x, 0.05, uFrame.w - 0.05));
  float dims = max(2.0 * q0.w, q0.t + q0.b);
  float maxLen = clamp(dims * 2.2, 1.2, 16.0);
  vec3 pIn = pF - NgF * 0.015;
  float jit = ign(gl_FragCoord.xy);

  // ---- view ray through the body
  // refract with the smooth volume normal: sculpted creases (gape, grooves) must not steer the ray
  // straight back out through a thin sliver of tissue
  vec3 NvolF = gradR(pIn);
  if (dot(NvolF, NgF) < 0.2) NvolF = NgF;
  vec3 NrF = normalize(mix(NF, NvolF, 0.75));
  vec3 R = refract(VF, NrF, 1.0 / uIor);
  if (dot(R, R) < 0.5) R = VF;
  if (dot(R, NvolF) > -0.25) R = normalize(R - NvolF * (dot(R, NvolF) + 0.25));
  float tExit = max(exitDist(pIn, R, maxLen), min(maxLen, 0.6));
  const int NSV = 14;
  float dt = tExit / float(NSV);
  vec3 tauE = vec3(0.0);
  vec3 tauA = vec3(0.0);
  float tauS = 0.0;
  vec3 tauNear = vec3(0.0);
  float innerScat = 0.0;
  for (int i = 0; i < NSV; i++) {
    float tt = (float(i) + jit) * dt;
    vec3 x = pIn + R * tt;
    float sS; vec3 sA;
    medium(x, sS, sA);
    float excess = max(sS - uSigS * uScatter, 0.0);
    innerScat += exp(-tauS * 0.3) * excess * dt;
    tauNear += max(sA - uSigA, vec3(0.0)) * dt * exp(-tt * 0.55);
    tauE += (sA + vec3(sS * (1.0 - G_FWD))) * dt;
    tauA += sA * dt;
    tauS += sS * dt;
  }
  // organs and the vertebral column (analytic): they block the light seen through the body
  float organK = 0.5 + uInterior;
  float tOrg;
  vec3 tauOrg = organTau(pIn, R, tExit, tOrg) * organK;
  tauE += tauOrg;
  tauA += tauOrg;
  tauNear += min(tauOrg, vec3(1.6)) * exp(-tOrg * 0.6) * 0.22;
  // sculpted appendages outside the analytic volume (orbit rims, lips, papilla) are solid tissue
  float outside = smoothstep(0.98, 1.1, bodyR(pIn));
  // lips and jaws are dense (dentary, premaxilla, thick lip tissue)
  float jaws = (1.0 - smoothstep(uJaws.x, uJaws.y, pF.x)) * (1.0 - smoothstep(uJaws.z, uJaws.w, pF.y));
  outside = max(outside, 0.8 * jaws);
  tauE += outside * vec3(4.0);
  tauA += outside * vec3(0.5);
  tauS += outside * 6.0;
  // lip rolls are dense, blood-perfused tissue: they scatter and absorb, they are not see-through
  tauE += jaws * vec3(6.0, 7.0, 7.5);
  tauA += jaws * vec3(0.15, 0.3, 0.4);
  tauS += jaws * 9.0;
  vec3 xE = pIn + R * tExit;
  vec3 skinIn = skinT(pig);
  vec3 skinOut = skinT(textureLod(uPigment, fishUV(xE), 2.0).rgb);

  // refraction back into the water at the far surface
  vec3 nE = gradR(xE);
  vec3 Rout = refract(R, -nE, uIor);
  if (dot(Rout, Rout) < 0.5) Rout = R;
  vec3 xEw = vWorldPos + vObjToWorld * (fishToObj(xE) - vObjPos);
  vec3 dOutW = normalize(vObjToWorld * fishDirToObj(Rout));
  vec2 suv = gl_FragCoord.xy / uResolution;
  float bgDist = texture(uBg, suv).a;
  float dE = length(xEw - cameraPosition);
  float beyond = clamp(bgDist - dE, 0.0, 1.5);
  vec4 clip = projectionMatrix * viewMatrix * vec4(xEw + dOutW * beyond, 1.0);
  vec2 ruv = clip.w > 0.0 ? clip.xy / clip.w * 0.5 + 0.5 : suv;
  ruv = clamp(ruv, vec2(0.001), vec2(0.999));
  float spread = sqrt(tauS * (1.0 - G_FWD)) * 0.45;
  float worldPerMM = length(vObjToWorld[0]) * 0.001;
  float blurW = (beyond + tExit * worldPerMM) * min(spread, 1.3);
  float pxPerW = uResolution.y * projectionMatrix[1][1] * 0.5 / max(dE, 1e-5);
  float lod = clamp(log2(max(blurW * pxPerW, 1.0)), 0.0, 9.0);
  vec3 Tbg = exp(-tauE);
  vec3 Tdirect = exp(-(tauA + vec3(tauS)));
  vec3 bgT = (textureLod(uBg, ruv, 0.0).rgb * Tdirect + sampleBg(ruv, lod) * max(Tbg - Tdirect, 0.0)) * skinIn * skinOut;

  // ---- key light
  float caus = mix(1.0, caustics(vWorldPos.xz * 180.0 - L.xz * vWorldPos.y * 180.0), uCausticAmt);
  vec3 Lc = uLightColor * caus;

  // back-light diffusion through the tissue
  vec3 back = vec3(0.0);
  float NgoL = dot(NgF, LF);
  float backW = smoothstep(0.35, -0.2, NgoL);
  float dL = 0.0;
  if (backW > 0.001) {
    dL = exitDist(pIn, LF, maxLen);
    vec3 tauL = vec3(0.0);
    const int NL = 6;
    for (int j = 0; j < NL; j++) {
      vec3 x = pIn + LF * ((float(j) + jit) / float(NL)) * dL;
      float sS; vec3 sA;
      medium(x, sS, sA);
      // diffusion attenuation + extra loss on denser scatterers (bone, septa, viscera) so they cast soft shadows
      float excess = max(sS - uSigS * uScatter, 0.0);
      tauL += (sqrt(3.0 * sA * (sA + vec3(sS * (1.0 - G_TIS)))) + vec3(excess * (1.0 - G_TIS) * 0.9)) * (dL / float(NL));
    }
    float tOrgL;
    tauL += organTau(pIn, LF, dL, tOrgL) * organK;
    vec3 skinL = skinT(textureLod(uPigment, fishUV(pIn + LF * dL), 2.0).rgb);
    float cosT = dot(-L, V);
    float ph = mix(1.0, 4.0 * PI * hgPhase(cosT, 0.45), 0.55);
    back = Lc * exp(-tauL) * skinIn * skinL * ph * backW * uBackStrength * (1.0 - 0.85 * smoothstep(0.98, 1.1, bodyR(pIn)));
  }

  // ---- surface diffuse (sub-surface softened) + interior tint near the surface
  // diffuse reflectance of a finite milky slab grows with its reduced optical depth
  vec3 tint = exp(-tauNear * 0.8);
  float tauR = tauS * (1.0 - G_TIS);
  float thickRefl = clamp(tauR / (1.0 + tauR) / 0.6, 0.1, 1.0);
  vec3 alb = albedo * tint * thickRefl;
  vec3 Nr = normalize(mix(N, Ng, 0.6));
  vec3 Ngm = normalize(mix(N, Ng, 0.3));
  vec3 wrap = vec3(0.5, 0.36, 0.26);
  vec3 ndl = vec3(dot(Nr, L), dot(Ngm, L), dot(N, L));
  vec3 diffL = max((ndl + wrap) / ((1.0 + wrap) * (1.0 + wrap)), 0.0);
  vec3 diffuse = alb * Lc * diffL * INV_PI;
  vec3 amb = alb * ambientIrr(N) * ao;
  // light scattered by denser interior structures (spine, septa, viscera) toward the eye
  vec3 inner = innerScat * 0.05 * (Lc * (0.35 + 0.65 * sat(dot(NgF, LF) * 0.5 + 0.5)) * INV_PI + ambientIrr(Ng)) * vec3(1.0, 0.96, 0.88) * skinIn;

  // iridophore sheen (guanine platelets): view dependent silvery-gold reflection
  float NoV = max(dot(N, V), 1e-3);
  vec3 H = normalize(L + V);
  vec3 irid = pig.g * (waterEnv(reflect(-V, N), 0.45) * 0.18 + Lc * pow(sat(dot(N, H)), 18.0) * 0.25 * sat(dot(N, L))) *
              mix(vec3(0.95, 0.92, 0.8), vec3(0.75, 0.9, 0.95), pow(1.0 - NoV, 2.0));

  // ---- wet specular: skin (map roughness) + thin mucus film
  vec3 Nm = normalize(mix(N, Ng, 0.55));
  float spec = specGGX(N, V, L, rough, 0.028) + 0.55 * specGGX(Nm, V, L, 0.085, 0.022);
  vec3 envSpec = waterEnv(reflect(-V, N), rough) * F_SchlickRough(0.028, NoV, rough) +
                 0.55 * waterEnv(reflect(-V, Nm), 0.085) * F_Schlick(0.022, max(dot(Nm, V), 1e-3));
  float specOcc = sat(pow(NoV + ao, 1.5) - 1.0 + ao);
  float Fv = F_Schlick(0.028, NoV);

  vec3 col = (1.0 - Fv) * (diffuse + amb + back + inner + bgT + irid) + (Lc * spec + envSpec) * specOcc;
  // the caudal blade thins to a translucent film over the fin-ray bases: dissolve it into what lies behind
  float endFade = smoothstep(uFrame.w - 1.6, uFrame.w - 0.15, pF.x) * 0.92;
  col = mix(col, textureLod(uBg, suv, 0.0).rgb * mix(vec3(1.0), skinIn, 0.6) + back * 0.35, endFade);
  col = applyFog(col, length(cameraPosition - vWorldPos));

  if (uDebug == 1) col = vec3(sat(tExit / 7.0), sat(tExit / 3.5), sat(tExit / 1.2)) * 0.8;
  else if (uDebug == 2) col = back + bgT;
  else if (uDebug == 3) col = vec3(sat(innerScat * 0.25)) + vec3(sat(tauNear.g * 2.0), 0.0, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createBodyMaterial({ textures, profileTexture, frame, vertebrae, shared, capRect }) {
  const uniforms = {
    ...shared,
    uAlbedo: { value: textures.albedo },
    uNormalMap: { value: textures.normal },
    uORM: { value: textures.orm },
    uPigment: { value: textures.pigment },
    uCapAlbedo: { value: textures.capAlbedo },
    uCapPigment: { value: textures.capPigment },
    uCapRect: { value: new THREE.Vector4(capRect.y0, capRect.y1, capRect.z0, capRect.z1) },
    uProfile: { value: profileTexture },
    uFrame: { value: new THREE.Vector4(frame.S0, frame.Y0, frame.SL, frame.SEND) },
    uJaws: { value: new THREE.Vector4(...(frame.jaws || [3.0, 4.6, 2.4, 3.2])) },
    uVertStart: { value: vertebrae.start },
    uVertLen: { value: (frame.SL - vertebrae.start) / vertebrae.count },
    uSigS: { value: 1.35 },
    uSigA: { value: new THREE.Vector3(0.02, 0.048, 0.12) },
    uIor: { value: 1.04 },
    uNormalStrength: { value: 1.0 },
    uBackStrength: { value: 0.3 },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'MahazeBodyVolumetric',
    uniforms,
    vertexShader,
    fragmentShader,
  });
  return mat;
}

/** Profile table (glTF extras) → 512×2 RGBA half-float texture: row0 = yc,t,b,w  row1 = nT,nB. */
export function createProfileTexture(profile) {
  const n = profile.n;
  const src = profile.data;
  const data = new Uint16Array(n * 2 * 4);
  for (let i = 0; i < n; i++) {
    const r = src.slice(i * 6, i * 6 + 6);
    const o0 = i * 4, o1 = (n + i) * 4;
    data[o0] = THREE.DataUtils.toHalfFloat(r[0]);
    data[o0 + 1] = THREE.DataUtils.toHalfFloat(r[1]);
    data[o0 + 2] = THREE.DataUtils.toHalfFloat(r[2]);
    data[o0 + 3] = THREE.DataUtils.toHalfFloat(r[3]);
    data[o1] = THREE.DataUtils.toHalfFloat(r[4]);
    data[o1 + 1] = THREE.DataUtils.toHalfFloat(r[5]);
    data[o1 + 2] = 0;
    data[o1 + 3] = 0;
  }
  const tex = new THREE.DataTexture(data, n, 2, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
