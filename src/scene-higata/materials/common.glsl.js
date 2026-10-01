// Shared GLSL used by every custom material.
// Uniform names prefixed with uEnv / uLight are shared across all materials (see the shared uniforms in
// ../main.js). The higata scene adds the water surface: caustics from the ripple field (./../world/waves.js),
// and fog that only accumulates along the part of a view ray that is under water.
import { wavesGLSL } from '../world/waves.js';

export const commonGLSL = /* glsl */ `
#define PI 3.14159265359
#define INV_PI 0.31830988618

uniform vec3 uLightDir;      // world-space direction towards the key light
uniform vec3 uLightColor;    // key light irradiance (linear)
uniform vec3 uWaterDeep;     // radiance of the water column below the horizon
uniform vec3 uWaterUp;       // radiance of the water column above the horizon
uniform vec3 uSurfaceGlow;   // Snell's window brightness
uniform vec3 uAmbUp;         // hemispherical irradiance from above / PI
uniform vec3 uAmbDown;       // hemispherical irradiance from below / PI
uniform vec3 uFogColor;
uniform float uFogDensity;   // per world unit (metre)
uniform float uTime;
uniform float uWaterY;       // mean height of the water surface (m)
uniform float uCausticGain;  // focusing strength (depth × (1 − 1/n) is applied in causticsAt)
uniform float uCausticAmt;   // 0 = flat light, 1 = full caustics (sediment)
uniform float uCausticFish;  // the same on the fish (curved, partly translucent surfaces)
${wavesGLSL}

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float V_SmithCorrelated(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
float F_Schlick(float f0, float c) { float k = pow(1.0 - c, 5.0); return f0 + (1.0 - f0) * k; }
float F_SchlickRough(float f0, float c, float r) { float k = pow(1.0 - c, 5.0); return f0 + (max(1.0 - r, f0) - f0) * k; }

// GGX specular * NoL (scalar, white)
float specGGX(vec3 N, vec3 V, vec3 L, float rough, float f0) {
  vec3 H = normalize(V + L);
  float NoL = sat(dot(N, L));
  if (NoL <= 0.0) return 0.0;
  float NoV = max(dot(N, V), 1e-4);
  float NoH = sat(dot(N, H));
  float VoH = sat(dot(V, H));
  float a = max(rough * rough, 0.002);
  return D_GGX(NoH, a) * V_SmithCorrelated(NoV, NoL, a) * F_Schlick(f0, VoH) * NoL;
}

// Henyey-Greenstein phase function, normalised over the sphere
float hgPhase(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5));
}

// Radiance of the surrounding water for direction d, pre-blurred for a given roughness.
vec3 waterEnv(vec3 d, float rough) {
  float up = d.y;
  vec3 c = mix(uWaterDeep, uWaterUp, smoothstep(-0.55 - rough * 0.3, 0.85 + rough * 0.2, up));
  float w0 = 0.66 - rough * 0.45;
  c += uSurfaceGlow * smoothstep(w0, w0 + 0.16 + rough * 0.35, up);
  float sd = max(dot(d, uLightDir), 0.0);
  float p = mix(1400.0, 5.0, sqrt(sat(rough)));
  c += uLightColor * (pow(sd, p) * (p + 2.0) / (8.0 * PI) * 0.22 + pow(sd, 5.0) * 0.045 + pow(sd, 40.0) * 0.08);
  return c;
}

vec3 ambientIrr(vec3 n) { return mix(uAmbDown, uAmbUp, n.y * 0.5 + 0.5); }

// Caustics on a point under the rippled surface: the light reaching p was refracted at the surface point
// straight up the (refracted) light direction; the focusing is the inverse Jacobian of that mapping,
// 1 / det(I + D (1 − 1/n) ∇²h), evaluated analytically from the ripple field. Water disperses a little
// (n = 1.331 red … 1.340 blue), which gives the bright lines faint coloured fringes. Values around 1.0.
vec3 causticsAt3(vec3 p) {
  vec3 L = normalize(uLightDir);
  float D = max(uWaterY - p.y, 0.0) / max(L.y, 0.2);
  vec2 s = p.xz + L.xz * D;
  // footprint of a pixel at p: caustic detail finer than that is averaged out (no shimmering aliasing)
  float fp = length(fwidth(p));
  vec3 H = waveHess(s, uTime, fp * 5.0) * (D * uCausticGain);
  vec3 g = vec3(0.2487, 0.2513, 0.2537);
  vec3 det = (1.0 + H.x * g) * (1.0 + H.z * g) - H.y * H.y * g * g;
  // the sun's disk (0.53°) and the spread of what the band limit removed keep the lines finite
  float soft = 0.09 + 6.0 * fp / max(D, 1e-3);
  vec3 I = 1.0 / max(abs(det), vec3(soft));
  // energy is conserved on average: past a focus the light spreads into the dimmer cells; forward
  // scattering by the silt in the water fills the dark cells a little
  I = mix(I, vec3(1.0), smoothstep(0.0, -1.5, det) * 0.3);
  I = mix(vec3(1.0), clamp(I, 0.0, 6.0), 0.72);
  return mix(vec3(1.0), I, smoothstep(0.0, 0.004, D));
}
float causticsAt(vec3 p) { return causticsAt3(p).g; }
float caustics(vec2 p) { return 1.0; }

// Length of the part of the segment camera → p that runs under water (the fog only builds up there).
float waterPath(vec3 p) {
  float d = length(cameraPosition - p);
  if (cameraPosition.y <= uWaterY) return d;
  float k = (uWaterY - p.y) / max(cameraPosition.y - p.y, 1e-5);
  return d * clamp(k, 0.0, 1.0);
}
// in-scattered light of the turbid water seen along direction d: suspended silt scatters the sun forward
vec3 fogRadiance(vec3 d) {
  float mu = dot(d, normalize(uLightDir));
  return uFogColor * (0.75 + 0.35 * smoothstep(-0.6, 0.8, d.y)) + uLightColor * 0.035 * hgPhase(mu, 0.72);
}
vec3 applyFogAt(vec3 col, vec3 p) {
  float f = exp(-waterPath(p) * uFogDensity);
  return mix(fogRadiance(normalize(p - cameraPosition)), col, f);
}

vec3 applyFog(vec3 col, float dist) {
  float f = exp(-dist * uFogDensity);
  return mix(uFogColor, col, f);
}
`;
