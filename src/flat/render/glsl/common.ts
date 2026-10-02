import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { mulberry32 } from '../../gen/noise';

/**
 * Shared GLSL: constants, integer hashes (the flat is 400 m across and the detail is a millimetre, so cell ids run
 * into the hundreds of thousands — float-trick hashes fall apart there), and smooth value noise read from a small
 * tiling texture (one bilinear fetch with a smoothstep-warped coordinate gives C1 noise, four channels at once).
 */
export const COMMON_GLSL = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
#define INV_PI 0.31830988618
uniform sampler2D uNoise;
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float sq(float x) { return x * x; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

uint hashU(uvec2 v) {
  uint h = v.x * 0x27d4eb2du ^ v.y * 0x165667b1u;
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du; h ^= h >> 12u; h *= 0x297a2d39u; h ^= h >> 15u;
  return h;
}
float hash21(vec2 p) { return float(hashU(uvec2(ivec2(floor(p))))) * (1.0 / 4294967296.0); }
vec2 hash22(vec2 p) {
  uint h = hashU(uvec2(ivec2(floor(p))));
  return vec2(float(h & 0xffffu), float(h >> 16u)) * (1.0 / 65536.0);
}
vec4 hash24(vec2 p) {
  uint h = hashU(uvec2(ivec2(floor(p))));
  uint g = hashU(uvec2(h, 0x9e3779b9u));
  return vec4(float(h & 0xffffu), float(h >> 16u), float(g & 0xffffu), float(g >> 16u)) * (1.0 / 65536.0);
}

// smooth value noise from the noise texture: four independent channels in [0, 1]
vec4 vnoise4(vec2 x) {
  vec2 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (p + f + 0.5) * (1.0 / 256.0), 0.0);
}
float vnoise(vec2 x) { return vnoise4(x).x; }
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    n += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.3, -9.1);
    a *= 0.5;
  }
  return s / n;
}
// signed fbm in about [-1, 1] with a little domain rotation per octave
float sfbm(vec2 p, int oct) { return fbm(p, oct) * 2.0 - 1.0; }
`;

/** 256² RGBA8 white noise (four independent channels), repeat-wrapped, bilinear (read with textureLod 0). */
export function makeNoiseTexture(seed = 1234): DataTexture {
  const S = 256, data = new Uint8Array(S * S * 4), r = mulberry32(seed);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(r() * 256);
  const t = new DataTexture(data, S, S, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
