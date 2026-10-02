import { Vector4 } from 'three';

/**
 * The wind ripples on the flat, after Gerupamasini/MahazeViewer (world/waves.js): one set of sinusoidal components
 * with random directions and phases, each travelling at its own speed from the capillary–gravity dispersion relation
 * ω² = (g k + σ/ρ k³) tanh(k h). Nothing repeats and nothing lines up, so the surface never looks like a tiled pattern.
 * The same set drives the surface normals (refraction, reflection, glitter) and the caustics on the bed, so the light
 * on the sand follows the ripples that bend the view of it.
 */
export const N_WAVES = 20;
const G = 9.81, SIGMA_RHO = 0.0728 / 1000;

export interface WaveSet {
  uniforms: { uWaveA: { value: Vector4[] }; uWaveB: { value: Vector4[] }; uWaveGain: { value: number } };
  /** surface elevation (m) at (x, z, t) */
  height(x: number, z: number, t: number): number;
}

/** A light breeze from `windDir` (radians, direction of travel) over water of typical depth `depth` (m). */
export function createWaves({ windDir = 0.7, depth = 0.6, seed = 7 }: { windDir?: number; depth?: number; seed?: number } = {}): WaveSet {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // wavelengths from a 2.5 m swell to 2 cm capillaries; steepness peaks around 20 cm (a fetch-limited breeze in the bay)
  const lambdas = [2.5, 1.8, 1.3, 0.95, 0.7, 0.52, 0.4, 0.31, 0.24, 0.19, 0.15, 0.12, 0.095, 0.075, 0.06, 0.047, 0.037, 0.03, 0.024, 0.02];
  const dirs: Vector4[] = [], params: Vector4[] = [];
  lambdas.forEach((lambda, i) => {
    const k = (2 * Math.PI) / lambda;
    const ln = Math.log(lambda / 0.2);
    // near-calm: the viewer's pool uses 0.012; a light breeze on the bay is not much steeper (gusts roughen patches)
    const steep = 0.004 + 0.009 * Math.exp(-(ln * ln) / 0.9);
    const amp = (steep * lambda) / (2 * Math.PI) * (0.8 + 0.4 * rnd()) * (lambda < 0.05 ? 0.55 : 1);
    // the long components come from one side; the short ones spread wider
    const spread = 0.35 + 0.95 * (i / (lambdas.length - 1));
    const a = windDir + (rnd() * 2 - 1) * spread;
    const w = Math.sqrt((G * k + SIGMA_RHO * k * k * k) * Math.tanh(k * depth));
    dirs.push(new Vector4(Math.cos(a), Math.sin(a), k, amp));
    params.push(new Vector4(w, rnd() * Math.PI * 2, 0, 0));
  });
  const uniforms = { uWaveA: { value: dirs }, uWaveB: { value: params }, uWaveGain: { value: 1.0 } };
  return {
    uniforms,
    height(x, z, t) {
      let h = 0;
      const g = uniforms.uWaveGain.value;
      for (let i = 0; i < N_WAVES; i++) {
        const d = dirs[i], p = params[i];
        h += d.w * g * Math.sin(d.z * (d.x * x + d.y * z) - p.x * t + p.y);
      }
      return h;
    },
  };
}

/** GLSL: elevation + gradient, and the Hessian, of the ripple field (band-limited to the pixel footprint). */
export const WAVES_GLSL = /* glsl */ `
#define N_WAVES ${N_WAVES}
uniform vec4 uWaveA[N_WAVES];
uniform vec4 uWaveB[N_WAVES];
uniform float uWaveGain;
float hashWv(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoiseWv(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashWv(i), hashWv(i + vec2(1, 0)), f.x), mix(hashWv(i + vec2(0, 1)), hashWv(i + vec2(1, 1)), f.x), f.y); }
// Real wave trains are not perfect planes: each component's phase wanders slowly across the water, so crests bend and
// no two components ever lock into a lattice. The wander is a smooth noise field per component (metre-scale), too
// gentle to change the wavelength noticeably but enough to kill any visible regularity.
float phaseWander(vec2 p, int i) {
  float fi = float(i);
  return 2.6 * (vnoiseWv(p * (0.12 + 0.05 * fract(fi * 0.37)) + fi * 7.31) - 0.5) + 0.9 * (vnoiseWv(p * 0.55 + fi * 3.17) - 0.5);
}
// Each train also waxes and wanes across the water (a few metres), so no single family of stripes dominates a view:
// where one component fades, others of a different direction show through.
float ampWander(vec2 p, int i) {
  float fi = float(i);
  return 0.45 + 1.1 * vnoiseWv(p * (0.22 + 0.08 * fract(fi * 0.61)) + fi * 5.73);
}
// h, dh/dx, dh/dz
vec3 waveGrad(vec2 p, float t, float minLambda) {
  vec3 r = vec3(0.0);
  for (int i = 0; i < N_WAVES; i++) {
    vec4 A = uWaveA[i];
    float lam = 6.2831853 / A.z;
    float f = smoothstep(minLambda, minLambda * 2.0, lam);
    if (f <= 0.0) continue;
    float th = A.z * dot(A.xy, p) - uWaveB[i].x * t + uWaveB[i].y + phaseWander(p, i);
    float a = A.w * uWaveGain * f * ampWander(p, i);
    r.x += a * sin(th);
    float c = a * A.z * cos(th);
    r.y += c * A.x;
    r.z += c * A.y;
  }
  return r;
}
// Hessian (xx, xz, zz)
vec3 waveHess(vec2 p, float t, float minLambda) {
  vec3 H = vec3(0.0);
  for (int i = 0; i < N_WAVES; i++) {
    vec4 A = uWaveA[i];
    float lam = 6.2831853 / A.z;
    float f = smoothstep(minLambda, minLambda * 2.0, lam);
    if (f <= 0.0) continue;
    float th = A.z * dot(A.xy, p) - uWaveB[i].x * t + uWaveB[i].y + phaseWander(p, i);
    float s = -A.w * uWaveGain * f * ampWander(p, i) * A.z * A.z * sin(th);
    H += s * vec3(A.x * A.x, A.x * A.y, A.y * A.y);
  }
  return H;
}
// Focusing of the sunlight that reaches a point D below the rippled surface: the inverse Jacobian of the refraction
// map, 1 / det(I + D (1 - 1/n) H), from the same wave field (after MahazeViewer). Around 1.0; bright lines where
// the surface curvature focuses the light, dimmer cells between them.
float waveCaustic(vec2 p, vec3 L, float D, float t, float fp, float gain) {
  vec2 s = p + L.xz * D;
  // capillaries (under ~5 cm) are damped before they focus anything; the net on the bed comes from the 5–30 cm ripples
  vec3 H = waveHess(s, t, max(fp * 5.0, 0.04)) * (D * gain);
  float g = 0.2513;
  float det = (1.0 + H.x * g) * (1.0 + H.z * g) - H.y * H.y * g * g;
  float soft = 0.09 + 6.0 * fp / max(D, 1e-3);
  float I = 1.0 / max(abs(det), soft);
  I = mix(I, 1.0, smoothstep(0.0, -1.5, det) * 0.3);
  I = mix(1.0, clamp(I, 0.0, 4.0), 0.65);
  return mix(1.0, I, smoothstep(0.0, 0.004, D));
}
`;
