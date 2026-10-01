// Shared GLSL used by every custom material.
// Uniform names prefixed with uEnv / uLight are shared across all materials (see sharedUniforms in main.js).

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

// Animated underwater caustics, value around 1.0
float caustics(vec2 p) {
  float t = uTime * 0.35;
  vec2 q = p;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q = vec2(q.x * 1.61 + q.y * 0.77, -q.x * 0.77 + q.y * 1.61) + vec2(t * (0.7 + fi * 0.3), -t * 0.5);
    c += abs(sin(q.x + sin(q.y * 1.3 + t) * 1.7) * sin(q.y + sin(q.x * 1.1 - t) * 1.7));
  }
  c /= 3.0;
  return 0.55 + 1.3 * pow(1.0 - c, 5.0) * 2.2;
}

vec3 applyFog(vec3 col, float dist) {
  float f = exp(-dist * uFogDensity);
  return mix(uFogColor, col, f);
}
`;
