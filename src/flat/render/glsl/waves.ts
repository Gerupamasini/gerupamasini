import { Vector4 } from 'three';
import { mulberry32 } from '../../gen/noise';

/**
 * Wind ripples (さざ波) on the sea, the creeks and every pool, after MahazeViewer's wave set: sinusoidal
 * components with random directions and phases, each moving at its own speed from the capillary–gravity
 * dispersion relation ω² = (g k + σ/ρ k³) tanh(k h). On top of that, nothing about them is uniform:
 *  - each component's phase and amplitude wander slowly across the water (crests bend, no lattice ever forms);
 *  - gusts (cat's paws) drift downwind as patches of roughened water between glassy calms;
 *  - every water body only grows the waves its fetch allows: a pool is glassy on its upwind side and rippled
 *    downwind, a 2 m puddle never shows the sea's long components;
 *  - very thin water damps the longer ripples (the shallow margins of a pool stay smooth).
 * The same function feeds the water's normals (reflection, refraction, glitter) and the caustics on the bed.
 */
export const N_WAVES = 24;
const G = 9.81, SIGMA_RHO = 0.0728 / 1000;

export interface WaveUniforms {
  uWaveA: { value: Vector4[] };
  uWaveB: { value: Vector4[] };
  uWind: { value: Vector4 };
}

export function createWaves(windDir: [number, number], seed = 7, strength = 1): WaveUniforms {
  const rnd = mulberry32(seed);
  const base = Math.atan2(windDir[1], windDir[0]);
  // wavelengths from 3.6 m wind sea down to 1.6 cm capillaries
  const lambdas: number[] = [];
  for (let i = 0; i < N_WAVES; i++) lambdas.push(3.6 * Math.pow(0.016 / 3.6, i / (N_WAVES - 1)) * (0.92 + 0.16 * rnd()));
  const A: Vector4[] = [], B: Vector4[] = [];
  lambdas.forEach((lambda, i) => {
    const k = (2 * Math.PI) / lambda;
    // steepness: a light breeze on the bay; the short wind ripples are the steepest, the capillaries weaker
    const ln = Math.log(lambda / 0.12);
    const steep = (0.012 + 0.075 * Math.exp(-(ln * ln) / 1.6)) * (0.75 + 0.5 * rnd()) * (lambda < 0.03 ? 0.75 : 1);
    const amp = (steep * lambda) / (2 * Math.PI);
    // the long components come from the wind's side, the short ones spread wider
    const spread = 0.35 + 0.95 * (i / (N_WAVES - 1));
    const a = base + (rnd() * 2 - 1) * spread;
    const w = Math.sqrt((G * k + SIGMA_RHO * k * k * k) * Math.tanh(k * 1.0));
    A.push(new Vector4(Math.cos(a), Math.sin(a), k, amp));
    B.push(new Vector4(w, rnd() * Math.PI * 2, lambda, 0));
  });
  return { uWaveA: { value: A }, uWaveB: { value: B }, uWind: { value: new Vector4(windDir[0], windDir[1], strength, 0) } };
}

export const WAVES_GLSL = /* glsl */ `
#define N_WAVES ${N_WAVES}
uniform vec4 uWaveA[N_WAVES];   // dir.x, dir.z, k, amplitude
uniform vec4 uWaveB[N_WAVES];   // omega, phase, wavelength
uniform vec4 uWind;             // dir.x, dir.z, strength
uniform float uTime;

// wind strength over the water here: gusts drifting downwind in patches (0.15 calm … ~1.4 gust)
float gustAt(vec2 p, float t) {
  vec2 w = uWind.xy;
  vec2 q = p - w * t * 3.2;
  vec2 c = vec2(dot(q, w), dot(q, vec2(-w.y, w.x)));
  float big = fbm(c * vec2(0.022, 0.035) + 3.0, 3);
  float paw = fbm(c * vec2(0.09, 0.14) - t * 0.05, 3);
  float g = smoothstep(0.28, 0.72, big * 0.6 + paw * 0.55);
  return uWind.z * (0.18 + 1.3 * g);
}
// per water body: components the fetch has not let grow are absent, the rest scale with fetch, gust and depth
// fetchM: metres of open water upwind; depth: water depth (m); calm: 1 for sheltered (pools) multiplier
float waveWeight(int i, float lam, float fetchM, float depth, float gust) {
  float lamMax = 0.035 + fetchM * 0.055;
  float w = 1.0 - smoothstep(lamMax * 0.7, lamMax * 1.5, lam);
  w *= smoothstep(0.0, 1.0, depth / max(lam * 0.12, 0.002));
  // short ripples answer the gusts at once; long ones carry the average wind
  float resp = mix(gust, uWind.z * 0.8, smoothstep(0.08, 0.6, lam));
  return w * resp * mix(0.45, 1.0, sat(fetchM / 25.0));
}
// h, dh/dx, dh/dz and the unresolved slope variance; minLam: components shorter than this are averaged
vec4 waveGrad(vec2 p, float t, float minLam, float fetchM, float depth, float gust) {
  vec4 r = vec4(0.0);
  for (int q = 0; q < N_WAVES / 4; q++) {
    // four components share one noise fetch for their phase and amplitude wander
    vec4 nz = vnoise4(p * (0.07 + 0.045 * float(q)) + float(q) * 17.3) - 0.5;
    vec4 na = vnoise4(p * (0.13 + 0.05 * float(q)) - float(q) * 9.1);
    for (int j = 0; j < 4; j++) {
      int i = q * 4 + j;
      vec4 A = uWaveA[i], B = uWaveB[i];
      float lam = B.z;
      float ww = waveWeight(i, lam, fetchM, depth, gust);
      if (ww <= 0.001) continue;
      float a = A.w * ww * (0.4 + 1.2 * na[j]);
      float f = smoothstep(minLam, minLam * 2.0, lam);
      float th = A.z * dot(A.xy, p) - B.x * t + B.y + 3.2 * nz[j];
      float s = sin(th), c = cos(th);
      r.x += a * f * s;
      float g = a * f * A.z * c;
      r.y += g * A.x;
      r.z += g * A.y;
      r.w += 0.5 * (a * A.z) * (a * A.z) * (1.0 - f);
    }
  }
  return r;
}
// Hessian (xx, xz, zz) of the same field, for the caustics on the bed
vec3 waveHess(vec2 p, float t, float minLam, float fetchM, float depth, float gust) {
  vec3 H = vec3(0.0);
  for (int q = 0; q < N_WAVES / 4; q++) {
    vec4 nz = vnoise4(p * (0.07 + 0.045 * float(q)) + float(q) * 17.3) - 0.5;
    vec4 na = vnoise4(p * (0.13 + 0.05 * float(q)) - float(q) * 9.1);
    for (int j = 0; j < 4; j++) {
      int i = q * 4 + j;
      vec4 A = uWaveA[i], B = uWaveB[i];
      float lam = B.z;
      float ww = waveWeight(i, lam, fetchM, depth, gust);
      if (ww <= 0.001) continue;
      float a = A.w * ww * (0.4 + 1.2 * na[j]);
      float f = smoothstep(minLam, minLam * 2.0, lam);
      float th = A.z * dot(A.xy, p) - B.x * t + B.y + 3.2 * nz[j];
      float s = -a * f * A.z * A.z * sin(th);
      H += s * vec3(A.x * A.x, A.x * A.y, A.y * A.y);
    }
  }
  return H;
}
// sunlight focused on a point D (m, along the refracted ray) below the rippled surface: the inverse Jacobian of
// the refraction map, 1 / det(I + D (1 − 1/n) H) (after MahazeViewer). ~1 on average: bright lines, dim cells.
float causticAt(vec2 p, vec3 Lw, float D, float t, float fp, float fetchM, float depth, float gust) {
  vec2 s = p + Lw.xz / max(Lw.y, 0.2) * D;
  // capillaries (under ~6 cm) are damped and blurred by the silt before they focus anything
  vec3 H = waveHess(s, t, max(fp * 4.0, 0.06), fetchM, depth, gust) * D * 0.6;
  float k = 0.2497;
  float det = (1.0 + H.x * k) * (1.0 + H.z * k) - H.y * H.y * k * k;
  float soft = 0.08 + 5.0 * fp / max(D, 1e-3);
  float I = 1.0 / max(abs(det), soft);
  I = mix(I, 1.0, smoothstep(0.0, -1.5, det) * 0.3);
  I = mix(1.0, clamp(I, 0.0, 5.0), 0.7);
  return mix(1.0, I, smoothstep(0.0, 0.006, D));
}
// the swash: the bay's small waves running up the sand at the sea's edge (m above the tide)
// d0: static depth below the tide (negative on the sand above it)
float swashAt(vec2 p, float t, float d0) {
  // waves arrive roughly from the south, refracted shoreward
  float e = 0.0;
  e += 0.55 * sin(dot(p, vec2(0.12, -1.58)) - t * 2.6 + 0.3 * sin(p.x * 0.05));
  e += 0.35 * sin(dot(p, vec2(-0.21, -1.21)) - t * 2.05 + 1.7);
  e += 0.25 * sin(dot(p, vec2(0.33, -1.95)) - t * 3.1 + 4.1);
  // groups: every few waves a slightly larger set
  float grp = 0.65 + 0.35 * sin(dot(p, vec2(0.02, -0.3)) - t * 0.33);
  float a = 0.011 * grp * (0.75 + 0.5 * vnoise(p * 0.08 + 3.0));
  // full height offshore (until breaking caps it), dying out over the last centimetres of run-up
  float env = d0 > 0.0 ? min(1.0, d0 / 0.03) * 0.6 + 0.4 : exp(d0 / 0.012);
  return a * e * env;
}
`;
