// Wind ripples on a 10 cm deep tidal-flat pool.
//
// One wave set drives everything that depends on the surface: the displaced surface mesh, its normals
// (refraction, reflection, Snell's window), the caustic network on the sand, fish and fins (focused
// light is computed from the curvature of the same surface) and the light shafts. Phase speeds follow
// the capillary–gravity dispersion relation in finite depth, ω² = (g k + σ/ρ k³) tanh(k h).
import * as THREE from 'three';

export const N_WAVES = 16;
const G = 9.81, SIGMA_RHO = 0.0728 / 1000;

/** Build the wave set for a breeze from `windDir` (radians, direction of travel). */
export function createWaves({ windDir = 0.6, depth = 0.1, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // wavelength (m) and amplitude (m). Long, gentle undulations plus the capillary–gravity ripples of a light
  // breeze (λ 1–2.5 cm, steepness a·k ≈ 0.1): only those are curved enough (a·k² ≈ 30–50 m⁻¹) to focus the
  // sunlight into a caustic network on a bottom 10 cm down (focal length ≈ 1 / (a·k² (1 − 1/n)))
  const spec = [
    [0.31, 0.0017], [0.17, 0.0011], [0.083, 0.0008], [0.056, 0.00062], [0.041, 0.00052], [0.033, 0.00046],
    [0.027, 0.0004], [0.024, 0.00037], [0.021, 0.00033], [0.019, 0.0003], [0.017, 0.00027], [0.0152, 0.00024],
    [0.0138, 0.00021], [0.0124, 0.00018], [0.0112, 0.00015], [0.0101, 0.00012],
  ];
  const dirs = [], params = [];
  spec.forEach(([lambda, amp], i) => {
    const k = (2 * Math.PI) / lambda;
    // short waves are spread wider around the wind direction (capillary ripples are nearly isotropic)
    const spread = 0.3 + 2.2 * Math.pow(i / (spec.length - 1), 0.7);
    const a = windDir + (rnd() * 2 - 1) * spread;
    const w = Math.sqrt((G * k + SIGMA_RHO * k * k * k) * Math.tanh(k * depth));
    dirs.push(new THREE.Vector4(Math.cos(a), Math.sin(a), k, amp));
    params.push(new THREE.Vector4(w, rnd() * Math.PI * 2, 0, 0));
  });
  return {
    uniforms: {
      uWaveA: { value: dirs },   // dir.x, dir.z, k, amplitude
      uWaveB: { value: params }, // ω, phase
      uWaveGain: { value: 1.0 }, // global amplitude (wind strength)
    },
    /** Surface elevation (m) at (x, z, t), for CPU-side queries. */
    height(x, z, t) {
      let h = 0;
      const g = this.uniforms.uWaveGain.value;
      for (let i = 0; i < N_WAVES; i++) {
        const d = dirs[i], p = params[i];
        h += d.w * g * Math.sin(d.z * (d.x * x + d.y * z) - p.x * t + p.y);
      }
      return h;
    },
  };
}

// GLSL: elevation, gradient and Hessian of the ripple field. Included by every shader that needs it.
export const wavesGLSL = /* glsl */ `
#define N_WAVES ${N_WAVES}
uniform vec4 uWaveA[N_WAVES];
uniform vec4 uWaveB[N_WAVES];
uniform float uWaveGain;
// h, dh/dx, dh/dz
vec3 waveGrad(vec2 p, float t, float minLambda) {
  vec3 r = vec3(0.0);
  for (int i = 0; i < N_WAVES; i++) {
    vec4 A = uWaveA[i];
    // band-limit: fade components shorter than the footprint of a pixel
    float lam = 6.2831853 / A.z;
    float f = smoothstep(minLambda, minLambda * 2.0, lam);
    float th = A.z * dot(A.xy, p) - uWaveB[i].x * t + uWaveB[i].y;
    float a = A.w * uWaveGain * f;
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
    float th = A.z * dot(A.xy, p) - uWaveB[i].x * t + uWaveB[i].y;
    float s = -A.w * uWaveGain * f * A.z * A.z * sin(th);
    H += s * vec3(A.x * A.x, A.x * A.y, A.y * A.y);
  }
  return H;
}
`;
