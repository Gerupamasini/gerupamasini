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
  // wavelength (m) and amplitude (m): an almost calm pool. Only long, low undulations (λ 7–90 cm, steepness
  // a·k ≈ 0.012) — no wind ripples — so the bottom is seen clearly through the surface and the light on it
  // moves in broad, slow, soft bands instead of a tight caustic net
  const spec = [0.9, 0.7, 0.55, 0.45, 0.37, 0.3, 0.25, 0.21, 0.18, 0.155, 0.135, 0.12, 0.105, 0.092, 0.08, 0.07]
    .map((lambda) => [lambda, (0.012 * lambda) / (2 * Math.PI)]);
  const dirs = [], params = [];
  spec.forEach(([lambda, amp], i) => {
    const k = (2 * Math.PI) / lambda;
    // a slow swell from one side; the shorter components spread a little wider
    const spread = 0.35 + 0.9 * (i / (spec.length - 1));
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
