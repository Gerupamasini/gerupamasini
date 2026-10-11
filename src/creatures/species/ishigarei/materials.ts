import { Color, DataTexture, DoubleSide, FrontSide, HalfFloatType, LinearFilter, MeshPhysicalMaterial, RedFormat, Vector3, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { AMH_UNIFORMS, ENV_INJECT, HELPERS, SUN_INJECT } from '../amimehagi/materials';
import { EYES, FINS, OPERC, S_END, dorsalEdge, ventralEdge, thickBot, thickTop } from './anatomy.js';

/**
 * Materials of the イシガレイ juvenile: standard PBR (MeshPhysicalMaterial) with the pattern, the burial and the
 * underwater light worked in through onBeforeCompile, sharing the underwater light field of the アミメハギ (the sun's
 * beam through the water column with ripple caustics, Snell's window, the water's glow; uAir for a tank photo).
 *
 * The skin's pattern is computed where it is drawn, in millimetres on the animal (aFish: s along the body from the
 * snout, x across it, the side), so it needs no texture and every fish can carry its own colour:
 *  eyed side   a mosaic of small rounded pale cells with darker borders (the sand-grain camouflage of the photographs),
 *              dense fine melanophores, irregular dark blotches along the dorsal and ventral thirds and the mid-line,
 *              scattered cream-white spots (the "bicoloured" leucophores) and a few rust flecks; the head a little
 *              darker, the gill cover's margin and the lateral line, the first rows of the bony tubercles ("stones")
 *  blind side  pearly white, translucent, the myosepta and the column faintly through it, pink over the gills
 * Melanophores expand and contract (uMelanin) and the ground tissue takes on the substrate's hue (uGroundTint): the
 * fish matches the sand it lies on. The fine layers fade with the pixel's footprint, so nothing shimmers far away.
 *
 * Burial: where sand lies on the fish (uBury against a priority that covers the margins first, the head last and
 * the eyes never) the skin is the sediment's colour and grain. The mouth parts along its cleft onto a pale-fleshed,
 * dark-throated cavity. The free margins of the gill covers lift with the breathing (uBreath). The blind side and
 * the fins are laid onto the sediment in the vertex stage (a small height patch of the ground under the fish), so
 * the body drapes over ripples instead of cutting through them.
 */

const f = (x: number): string => x.toFixed(5);

/** a GLSL function through samples of fn on [x0, x1], linear between them */
function glslFn(name: string, fn: (x: number) => number, x0: number, x1: number, n = 24): string {
  let body = `float y = ${f(fn(x0))};\n`;
  for (let i = 1; i <= n; i++) {
    const a = x0 + ((i - 1) / n) * (x1 - x0), b = x0 + (i / n) * (x1 - x0);
    body += `  y = mix(y, ${f(fn(a))} + (${f(fn(b) - fn(a))}) * clamp((x - ${f(a)}) / ${f(b - a)}, 0.0, 1.0), step(${f(a)}, x));\n`;
  }
  return `float ${name}(float x) {\n  ${body}  return y;\n}\n`;
}

// ------------------------------------------------------------------ the ground under the fish

/** Heights of the sediment round one fish (half float, relative to `ref`), resampled as it moves. */
export class GroundPatch {
  static readonly N = 48;
  readonly texture: DataTexture;
  readonly uniforms: { uGround: IUniform<DataTexture>; uGroundRect: IUniform<Vector4>; uGroundSink: IUniform<number> };
  private cx = Number.NaN;
  private cz = Number.NaN;
  constructor() {
    const N = GroundPatch.N;
    this.texture = new DataTexture(new Uint16Array(N * N), N, N, RedFormat, HalfFloatType);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms = { uGround: { value: this.texture }, uGroundRect: { value: new Vector4(0, 0, 1, -1e3) }, uGroundSink: { value: 0 } };
  }

  /** resample when the fish has moved away from the patch's centre (size: side of the square, m) */
  update(x: number, z: number, size: number, heightAt: (x: number, z: number) => number, force = false): void {
    if (!force && Math.hypot(x - this.cx, z - this.cz) < size * 0.1) return;
    const N = GroundPatch.N, data = this.texture.image.data as Uint16Array;
    const x0 = x - size * 0.5, z0 = z - size * 0.5, ref = heightAt(x, z);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      data[j * N + i] = toHalf(heightAt(x0 + (i / (N - 1)) * size, z0 + (j / (N - 1)) * size) - ref);
    }
    this.texture.needsUpdate = true;
    const t = size / (N - 1);
    this.uniforms.uGroundRect.value.set(x0 - t * 0.5, z0 - t * 0.5, 1 / (size + t), ref);
    this.cx = x; this.cz = z;
  }

  /** no ground (a preview, a viewer's studio): nothing is clamped */
  off(): void { this.uniforms.uGroundRect.value.w = -1e3; this.cx = Number.NaN; }

  dispose(): void { this.texture.dispose(); }
}

const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
function toHalf(v: number): number {
  _f32[0] = v;
  const x = _u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return s;
  if (e >= 31) return s | 0x7c00;
  return s | (e << 10) | (m >>> 13);
}

const GROUND_GLSL = /* glsl */ `
uniform sampler2D uGround;
uniform vec4 uGroundRect;   // x0, z0, 1 / size, reference height (w < −100: no ground)
uniform float uGroundSink;  // burial: the limit goes down into the sediment
float ishGroundAt(vec2 xz) {
  vec2 t = (xz - uGroundRect.xy) * uGroundRect.z;
  if (uGroundRect.w < -100.0 || any(lessThan(t, vec2(0.0))) || any(greaterThan(t, vec2(1.0)))) return -1e3;
  return texture2D(uGround, t).r + uGroundRect.w;
}
// soft limit: what would go into the ground flattens onto it
float ishGroundClamp(vec3 wp, float lim) {
  float g = ishGroundAt(wp.xz) - uGroundSink;
  float gap = wp.y - g;
  return gap < lim ? g + lim * exp((gap - lim) / lim) : wp.y;
}
`;

const PROJECT_ON_GROUND = /* glsl */ `
vec4 ishW = modelMatrix * vec4(transformed, 1.0);
ishW.y = ishGroundClamp(ishW.xyz, ISH_LIM);
vWPos = ishW.xyz;
vec4 mvPosition = viewMatrix * ishW;
gl_Position = projectionMatrix * mvPosition;
`;

// ------------------------------------------------------------------ skin

const SKIN_VERT_PARS = /* glsl */ `
attribute vec4 aFish;   // s (mm), x (mm), side (+1 eyed / −1 blind), mouth cleft
attribute vec4 aMask;   // gill-cover margin (breathing), gill opening, lips, —
uniform float uBreath;
varying vec4 vFish;
varying vec4 vMask;
varying vec3 vWPos;
${GROUND_GLSL}
`;

const PATTERN = /* glsl */ `
float ihH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 ihH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ihN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ihH(i), ihH(i + vec2(1.0, 0.0)), f.x), mix(ihH(i + vec2(0.0, 1.0)), ihH(i + vec2(1.0)), f.x), f.y); }
float ihF(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * ihN(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.1; a *= 0.5; } return s / 0.9375; }
// Voronoi: F1, F2 − F1 (the border), the cell's random
vec3 ihVoro(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + ihH2(ip + g) * 0.85 + 0.075 - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = ip + g; } else if (d < f2) f2 = d;
  }
  f1 = sqrt(f1);
  return vec3(f1, sqrt(f2) - f1, ihH(id * 1.73 + 0.37));
}
// scattered discs on a jittered grid (cell units): coverage and a random
vec2 ihDiscs(vec2 p, float prob, float r0, float r1, float seed) {
  vec2 ip = floor(p), fp = fract(p);
  float best = 0.0, rnd = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), id = ip + g;
    if (ihH(id + seed) > prob) continue;
    vec2 c = g + 0.2 + 0.6 * ihH2(id * 1.31 + seed) - fp;
    float r = mix(r0, r1, ihH(id * 2.7 + seed * 1.7));
    float m = 1.0 - smoothstep(r * 0.72, r, length(c));
    if (m > best) { best = m; rnd = ihH(id * 5.3 + seed); }
  }
  return vec2(best, rnd);
}
${glslFn('ihDorsal', dorsalEdge, 0, S_END, 30)}
${glslFn('ihVentral', ventralEdge, 0, S_END, 30)}
${glslFn('ihThick', (s) => thickTop(s) + thickBot(s), 0, S_END, 20)}
float ihLateral(float s) { return 0.15 + 1.25 * exp(-pow((s - 18.0) / 6.5, 2.0)); }
float ihOperc(vec2 p) { return pow((p.x - ${f(OPERC.s)}) / ${f(OPERC.rs)}, 2.0) + pow((p.y - ${f(OPERC.x)}) / ${f(OPERC.rx)}, 2.0); }
const vec3 ihEye0 = vec3(${f(EYES[0].s)}, ${f(EYES[0].x)}, ${f(EYES[0].r)});
const vec3 ihEye1 = vec3(${f(EYES[1].s)}, ${f(EYES[1].x)}, ${f(EYES[1].r)});
`;

const SKIN_FRAG_PARS = /* glsl */ `
varying vec4 vFish;
varying vec4 vMask;
uniform vec3 uTint;        // the individual's colour
uniform vec3 uGroundTint;  // the substrate it lies on (background matching of the ground tissue)
uniform float uMelanin;    // melanophores: expanded (dark, > 1) … contracted (pale, < 1)
uniform float uBury;
uniform vec3 uCover;       // colour of the sediment over it
uniform float uMouthOpen;
uniform float uBreath;
uniform float uSpots;      // how strongly the white spots show (individual)
${PATTERN}
`;

/** colour, relief, roughness, film and translucency of the skin at vFish (mm on the animal) */
const SKIN_SURFACE = /* glsl */ `
float ihRough = 0.45, ihCoat = 0.25, ihThin = 0.0, ihHgt = 0.0, ihCover = 0.0;
{
  vec2 p = vFish.xy;
  float side = vFish.z > 0.0 ? 1.0 : -1.0;
  float px = max(fwidth(p.x), fwidth(p.y));             // mm per pixel
  float dF = 1.0 - smoothstep(0.05, 0.16, px);           // fine detail (cells of a few tenths of a mm)
  float dM = 1.0 - smoothstep(0.2, 0.7, px);             // medium detail
  float xd = ihDorsal(p.x), xv = ihVentral(p.x);
  float u = (p.y - 0.5 * (xd + xv)) / max(0.5 * (xd - xv), 0.1);
  float au = abs(u);
  float thick = ihThick(p.x) * pow(max(1.0 - u * u, 0.0), 0.55);
  ihThin = 1.0 - smoothstep(0.35, 3.2, thick);
  vec3 base;
  float mel;
  if (side > 0.0) {
    base = mix(vec3(0.47, 0.41, 0.31), vec3(0.5, 0.42, 0.3), smoothstep(0.4, 1.0, au));
    base = mix(base, uGroundTint * dot(base, vec3(0.333)) / max(dot(uGroundTint, vec3(0.333)), 0.05), 0.35);
    mel = 0.27 + 0.16 * ihF(p * 0.11 + 4.0) + 0.08 * ihF(p * 0.6);
#ifndef ISH_LOW
    // the mosaic of rounded pale cells with darker borders
    vec3 c = ihVoro(p / 0.46 + 0.35 * vec2(ihN(p * 1.3), ihN(p * 1.3 + 9.0)));
    float border = 1.0 - smoothstep(0.03, 0.2, c.y);
    float patchy = smoothstep(0.35, 0.7, ihF(p * 0.45 + 2.0));
    mel += mix(0.04 + 0.06 * patchy, (0.1 + 0.12 * patchy) * border - 0.08 * c.z, dM);
    if (c.z > 0.86) { mel = mix(mel, mel * 0.6, dM); base = mix(base, vec3(0.56, 0.5, 0.4), 0.35 * dM); }
    ihHgt += (0.024 * pow(max(1.0 - c.x / 0.55, 0.0), 2.0) - 0.008 * border) * dF;
    vec3 c2 = ihVoro(p / 0.23 + 11.0);
    mel += 0.08 * mix(0.25, 1.0 - smoothstep(0.03, 0.18, c2.y), dF);
    // fine punctate melanophores with a dendritic halo
    vec2 md = ihDiscs(p / 0.27, 0.45, 0.1, 0.24, 41.0);
    vec2 mh = ihDiscs(p / 0.27, 0.45, 0.28, 0.5, 41.0);
    mel += mix(0.07, 0.45 * md.x + 0.14 * mh.x, dF);
    ihRough = 0.42 + 0.1 * border * dM;
#endif
    // dark blotches along the dorsal and ventral thirds and the mid-line
    float rows = 0.65 + 0.35 * max(exp(-pow((au - 0.62) / 0.16, 2.0)), exp(-pow(u / 0.12, 2.0)));
    mel += 0.42 * smoothstep(0.55, 0.74, ihF(p * 0.2 + vec2(3.1, 9.7)) * rows + 0.12 * ihN(p * 0.9));
    vec2 bd = ihDiscs(p / 5.5, 0.55, 0.16, 0.3, 17.0);
    mel += 0.3 * bd.x * smoothstep(0.25, 0.6, au + 0.2 * bd.y);
    // cream-white spots (leucophores)
    vec2 wd = ihDiscs(p / 3.4, 0.24, 0.08, 0.2, 3.0);
    vec2 wd2 = ihDiscs(p / 1.3, 0.1, 0.1, 0.2, 7.0);
    float white = max(wd.x, 0.7 * wd2.x * dM) * smoothstep(0.98, 0.85, au) * uSpots;
    base = mix(base, vec3(0.6, 0.55, 0.44), white * 0.8);
    mel *= 1.0 - 0.7 * white;
    // rust flecks
    vec2 od = ihDiscs(p / 2.1, 0.22, 0.07, 0.16, 29.0);
    base = mix(base, vec3(0.58, 0.31, 0.12), od.x * 0.85 * dM);
    // the head a little darker; the gill cover's margin; the lateral line with its pores
    float e = ihOperc(p);
    mel += 0.07 * (1.0 - smoothstep(10.0, 15.0, p.x));
    mel += 0.3 * exp(-pow((e - 1.0) / max(0.035, px * 0.12), 2.0)) * step(4.5, p.x) * mix(0.4, 1.0, dM);
    ihHgt -= 0.04 * exp(-pow((e - 1.0) / 0.02, 2.0)) * step(4.5, p.x) * dF;
    float ll = exp(-pow((p.y - ihLateral(p.x)) / max(0.13, px * 0.6), 2.0)) * smoothstep(13.0, 16.0, p.x) * (1.0 - smoothstep(55.0, 57.5, p.x));
    mel *= 1.0 - 0.35 * ll;
    ihHgt += 0.028 * ll * dF;
    // bony tubercles beginning to form in rows
    float trow = max(max(exp(-pow((u - 0.66) / 0.05, 2.0)), exp(-pow((u + 0.62) / 0.05, 2.0))), exp(-pow((p.y - ihLateral(p.x) - 0.9) / 0.35, 2.0)));
    vec2 tb = ihDiscs(vec2(p.x / 1.6, p.y / 1.2), 0.7, 0.12, 0.22, 61.0);
    float tub = tb.x * trow * smoothstep(16.0, 22.0, p.x) * (1.0 - smoothstep(50.0, 54.0, p.x)) * dM;
    ihHgt += 0.045 * tub;
    base = mix(base, vec3(0.52, 0.46, 0.36), 0.35 * tub);
    // fin-base zones: fine striations of the radials
    float zone = smoothstep(0.8, 0.97, au);
    mel += 0.07 * zone * (0.5 + 0.5 * sin(p.x * 6.2832 / 0.72)) * dF;
    // under the eyeballs (only seen at the far tier, where there are none) and the mouth's line
    for (int i = 0; i < 2; i++) {
      vec3 E = i == 0 ? ihEye0 : ihEye1;
      float d = length(p - E.xy);
      float eye = 1.0 - smoothstep(E.z * 0.75, E.z * 0.95, d);
      base = mix(base, vec3(0.05, 0.05, 0.045), eye);
      mel = mix(mel, 0.15, eye);
    }
    float lips = 1.0 - smoothstep(0.3, 1.2, p.x);
    mel *= 1.0 - 0.3 * lips;
  } else {
    base = vec3(0.44, 0.46, 0.47);
    mel = 0.015;
    float c = p.x - 0.5 * abs(abs(p.y) - 3.8) + 0.22 * abs(p.y);
    float myo = exp(-pow((fract(c / 1.15 + 0.15 * ihN(p * 0.7)) - 0.5) / 0.2, 2.0)) * smoothstep(15.0, 19.0, p.x) * (1.0 - smoothstep(0.75, 0.95, au)) * (0.6 + 0.4 * ihN(p * 0.5 + 3.0));
    base *= 1.0 - 0.12 * myo * dM;
    base *= 1.0 - 0.16 * exp(-pow(p.y / 0.55, 2.0)) * smoothstep(13.0, 17.0, p.x);
    float abd = exp(-pow((p.x - 15.5) / 4.0, 2.0) - pow((p.y + 5.0) / 3.6, 2.0));
    base = mix(base, vec3(0.74, 0.74, 0.73), 0.5 * abd);
    float e = ihOperc(p);
    base = mix(base, vec3(0.7, 0.5, 0.5), 0.32 * (1.0 - smoothstep(0.6, 1.0, e)) * smoothstep(5.0, 8.0, p.x));
    float zone = smoothstep(0.7, 0.98, au);
    base = mix(base, vec3(0.42, 0.36, 0.29), 0.6 * zone);
    mel += 0.05 * zone;
    ihRough = 0.3;
    ihCoat = 0.35;
  }
  vec3 alb = base * exp(-clamp(mel, 0.0, 1.0) * uMelanin * vec3(1.45, 1.6, 1.8));
  if (side > 0.0) alb *= uTint;
  // the mouth: closed, a dark line between the lips; open, the pale flesh and the dark throat
  float open = smoothstep(0.02, 0.25, uMouthOpen);
  alb = mix(alb, alb * vec3(1.15, 0.98, 0.92) + vec3(0.05, 0.03, 0.025), vMask.z * 0.5);
  float cleft = clamp(vFish.w, 0.0, 1.0);
  alb *= 1.0 - 0.7 * smoothstep(0.35, 0.95, cleft) * (1.0 - open);
  // a narrow rim of pale flesh inside the lips, then the dark of the mouth and throat
  alb = mix(alb, mix(vec3(0.36, 0.23, 0.2), vec3(0.03, 0.016, 0.014), smoothstep(0.2, 0.42, cleft)), smoothstep(0.08, 0.2, cleft) * open);
  // inside the mouth the skin's mosaic and film would be stretched into streaks: smooth, soft tissue there
  float cav = smoothstep(0.1, 0.28, cleft) * open;
  ihHgt *= 1.0 - cav;
  ihCoat *= 1.0 - cav;
  ihRough = mix(ihRough, 0.6, cav);
  // the gill opening shows while the cover is lifted
  alb *= 1.0 - vMask.y * clamp(uBreath, 0.0, 1.0) * 0.55;
  // ---- sand over the fish: margins first, the centre later, the head last, the eyes never
  if (side > 0.0) {
    float pri = 0.06 + 0.62 * smoothstep(0.0, 0.85, 1.0 - au) + 0.14 * (1.0 - smoothstep(8.0, 16.0, p.x));
    pri += 0.22 * (ihF(p * 0.35 + 5.0) - 0.5) + 0.06 * (ihN(p * 2.5) - 0.5);
    for (int i = 0; i < 2; i++) {
      vec3 E = i == 0 ? ihEye0 : ihEye1;
      pri = max(pri, 2.0 * (1.0 - smoothstep(E.z * 1.05, E.z * 1.35, length(p - E.xy))));
    }
    float jit = 0.1 * (ihN(p * 1.9) - 0.5) + 0.05 * (ihN(p * 6.0) - 0.5);
    ihCover = smoothstep(pri - 0.05, pri + 0.05, uBury * 1.12 + jit);
    // grains of the sediment in world millimetres (they do not move with the fish's skin)
    vec2 mm = vWPos.xz * 1000.0;
    vec3 g = ihVoro(mm / 0.35);
    vec3 sand = uCover * (0.82 + 0.3 * ihN(mm * 0.05) + 0.12 * (g.z - 0.5));
    sand = mix(sand, sand * 1.35 + 0.04, step(0.88, g.z) * (1.0 - smoothstep(0.25, 0.35, g.x)) * dF);
    sand = mix(sand, sand * 0.45, step(0.965, g.z) * (1.0 - smoothstep(0.25, 0.35, g.x)) * dF);
    float dust = smoothstep(pri - 0.45, pri - 0.05, uBury) * step(0.62, g.z) * (1.0 - smoothstep(0.22, 0.32, g.x));
    float k = max(ihCover, dust * 0.85);
    alb = mix(alb, sand, k);
    ihRough = mix(ihRough, 0.8, k);
    ihCoat *= 1.0 - k;
    ihHgt *= 1.0 - k;
  }
  diffuseColor.rgb = alb;
}
`;

/** bump from the procedural relief (screen-space derivatives, as three's bump map does) */
const SKIN_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#ifndef ISH_LOW
{
  vec3 sp = -vViewPosition;
  vec2 dH = vec2(dFdx(ihHgt), dFdy(ihHgt)) * 0.001 * uRelief;
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif
`;

/** a small fish is half-clear tissue: thin margins pass light, warmed by blood and the eyed side's pigment */
const SKIN_THIN = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 tissue = diffuseColor.rgb * vec3(1.15, 0.9, 0.7);
  float k = (vFish.z > 0.0 ? 0.04 : 0.14) + 0.6 * ihThin;
  totalEmissiveRadiance += tissue * amUnderwater(vW, 0.8) * k * (1.0 - ihCover);
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += tissue * amSunCol() * amSunThrough() * back * (0.02 + 0.3 * ihThin) * (1.0 - ihCover);
  // the blind side's guanine: a silvery sheen at grazing angles
  if (vFish.z < 0.0) totalEmissiveRadiance += vec3(0.48, 0.53, 0.6) * pow(1.0 - abs(dot(nW, vW)), 3.0) * amUnderwater(nW, 1.0) * 0.3;
}
`;

export interface IshSkinUniforms {
  uTint: IUniform<Color>;
  uGroundTint: IUniform<Color>;
  uMelanin: IUniform<number>;
  uBury: IUniform<number>;
  uCover: IUniform<Color>;
  uMouthOpen: IUniform<number>;
  uBreath: IUniform<number>;
  uSpots: IUniform<number>;
  uRelief: IUniform<number>;
}

function skinMaterial(u: IshSkinUniforms, ground: GroundPatch['uniforms'], low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.45, clearcoat: low ? 0 : 0.25, clearcoatRoughness: 0.3, side: FrontSide });
  m.name = low ? 'IshigareiSkinLOD2' : 'IshigareiSkin';
  m.envMapIntensity = 0.25;
  m.defines = { ISH_LIM: '0.0003', ...(low ? { ISH_LOW: '' } : {}) };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u, ground);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFish = aFish; vMask = aMask;\ntransformed += objectNormal * (aMask.x * uBreath * 0.00026);')
      .replace('#include <project_vertex>', PROJECT_ON_GROUND);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKIN_FRAG_PARS}\nuniform float uRelief;`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SKIN_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = ihRough;')
      .replace('#include <normal_fragment_maps>', SKIN_NORMAL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat = ihCoat;\n#endif')
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}
  // a flatfish lies on the bed and takes the bed's light: the water's light field counts for less on its upper
  // side, and on the sand over it hardly more than on the sand around it
  iblIrradiance *= mix(0.4, 0.12, ihCover);
  radiance *= mix(0.6, 0.25, ihCover);
#ifdef USE_CLEARCOAT
  // the mucus film too: at grazing angles it would otherwise mirror the bright surface like a silver fish
  clearcoatRadiance *= mix(0.4, 0.2, ihCover);
#endif`)
      .replace('#include <emissivemap_fragment>', SKIN_THIN);
  };
  m.customProgramCacheKey = () => (low ? 'ishigarei-skin-low-v2' : 'ishigarei-skin-v2');
  return m;
}

// ------------------------------------------------------------------ fins

const FIN_VERT_PARS = /* glsl */ `
varying vec2 vFinUv;
varying vec3 vWPos;
${GROUND_GLSL}
`;

/** fins from their atlas coordinates: band (v) dorsal | anal | caudal | pectoral + pelvic, u along the base, v up the ray */
const FIN_SURFACE = /* glsl */ `
float ihFinThin = 1.0;
{
  float band = floor(vFinUv.y * 4.0);
  float v = fract(vFinUv.y * 4.0);
  float u = vFinUv.x;
  float n = ${f(FINS.dorsal.rays)};
  float notch = 0.07, branch = 0.62;
  if (band == 1.0) n = ${f(FINS.anal.rays)};
  else if (band == 2.0) { n = ${f(FINS.caudal.rays)}; notch = 0.06; branch = 0.45; }
  else if (band == 3.0) {
    if (u < 0.6) { u = u / 0.6; n = ${f(FINS.pectoralEyed.rays)}; notch = 0.08; branch = 0.7; }
    else { u = (u - 0.6) / 0.4; n = ${f(FINS.pelvic.rays)}; notch = 0.1; branch = 0.8; }
  }
  float ru = u * n, ri = floor(ru), fr = fract(ru) - 0.5;
  float aa = fwidth(ru) + 1e-4;
  float w = mix(0.2, 0.12, v);
  float fb = abs(fr);
  if (v > (band < 2.0 ? 0.75 : branch)) {
    float t = smoothstep(branch, 1.0, v);
    fb = min(abs(fr - 0.16 * t), abs(fr + 0.16 * t));
    w *= 0.75;
  }
  float ray = (1.0 - smoothstep(w * 0.55, w + aa, fb));
  float fine = 1.0 - smoothstep(0.2, 0.6, aa);
  ray = mix(0.35, ray, fine);
  float seg = smoothstep(0.82, 1.0, fract(v * (band == 2.0 ? 9.0 : 7.0) + ihH(vec2(ri, band)) * 0.5)) * fine;
  // the membrane is incised between the rays' tips
  float tipEnd = mix(1.0 - notch, 1.0, exp(-pow(fr / 0.17, 2.0)) * fine + (1.0 - fine) * 0.6);
  if (v > tipEnd) discard;
  // melanophores: short streaks of irregular length on the rays, loosely in oblique bands; sparse dots between
  float mel = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float c = (fk + 0.25 + 0.5 * ihH(vec2(ri, fk * 7.0 + band))) / 4.0 + 0.08 * sin(u * (band == 2.0 ? 4.0 : 13.0) + fk);
    float len = 0.025 + 0.05 * ihH(vec2(ri * 3.1, fk + band));
    mel = max(mel, step(0.35, ihH(vec2(ri * 1.9 + fk, band * 3.0))) * (1.0 - smoothstep(len * 0.6, len, abs(v - c))));
  }
  // (only where a ray is resolved; further off they merge into a faint dusk on the fin)
  mel *= ray * (0.2 + 0.2 * ihH(vec2(ri, 5.0))) * smoothstep(0.35, 1.0, fine);
  mel = mix(0.05, mel, fine) + 0.05;
  if (band == 3.0) mel = mel * 0.6 + 0.12;
  vec3 col = mix(vec3(0.45, 0.39, 0.29), vec3(0.44, 0.31, 0.18), ray) * (1.0 - 0.15 * seg * ray);
  col *= exp(-mel * uMelanin * vec3(2.3, 2.6, 3.0)) * uTint;
  float alpha = 0.16 + 0.32 * ray + 0.3 * mel;
  // the base is fleshy where it joins the body
  alpha = mix(alpha, 0.85, 1.0 - smoothstep(0.0, 0.07, v));
  alpha *= smoothstep(0.0, 0.03, tipEnd - v);
  // buried, the fins are under the sand with the body
  diffuseColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

function finMaterial(u: IshSkinUniforms, ground: GroundPatch['uniforms']): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.38, transparent: true, depthWrite: false, side: DoubleSide });
  m.name = 'IshigareiFin';
  m.envMapIntensity = 0.25;
  m.defines = { ISH_LIM: '0.00032' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u, ground);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinUv = uv;')
      .replace('#include <project_vertex>', PROJECT_ON_GROUND);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFinUv;\nuniform vec3 uTint;\nuniform float uMelanin;\n${PATTERN}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FIN_SURFACE}`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // thin living membrane: it scatters the light it is bathed in from both sides
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += diffuseColor.rgb * ((amUnderwater(nW, 1.0) + amUnderwater(-nW, 1.0)) * 0.2 + amSunCol() * amSunThrough() * back * 0.1);
}`);
  };
  m.customProgramCacheKey = () => 'ishigarei-fin-v1';
  return m;
}

// ------------------------------------------------------------------ eyes

/**
 * The eye, as in the close photographs (49, 50): the ball stands out of the head on its turret and is mostly covered
 * by the same mottled, pigmented skin as the body (cream, rust and brown); the pupil is not round but a dark crescent
 * along the lower edge of the opening, the iris flap (operculum pupillare) hanging over it from above, and it glows
 * blue-green where it catches the light.
 */
const EYE_SURFACE = /* glsl */ `
float ihEyeRough = 0.25, ihPup = 0.0;
{
  // polar atlas: centre = the optical axis, radius ∝ the angle from it; +y towards the fish's back
  vec2 q = (vUv - 0.5) * vec2(2.0, -2.0) * 3.14159;
  float th = length(q);
  // the crescent: the opening's lower half, under the flap
  vec2 qp = q / vec2(0.36, 0.26);
  float outer = length(qp);
  float flap = length((q - vec2(0.02, 0.12)) / vec2(0.36, 0.22));
  float aa = fwidth(outer) + 1e-4;
  ihPup = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, outer)) * smoothstep(1.0 - aa, 1.0 + aa, flap);
  // the ball's skin: mottled cream, rust and brown, finer than the body's
  vec2 p = q * 6.0;
  vec3 cell = ihVoro(p * 1.6 + 3.0);
  vec3 skin = mix(vec3(0.5, 0.42, 0.3), vec3(0.58, 0.36, 0.18), smoothstep(0.4, 0.7, ihN(p * 0.8)));
  skin *= 0.8 + 0.25 * cell.z;
  skin *= 1.0 - 0.45 * step(0.82, ihH(floor(p * 3.0)));
  skin *= exp(-0.3 * uMelanin * vec3(1.45, 1.6, 1.8)) * uTint;
  // a dark rim round the opening, the iridescent edge of the pupil
  float rim = smoothstep(0.85, 1.0, outer) * (1.0 - smoothstep(1.0, 1.25, outer));
  vec3 col = mix(skin, skin * 0.55, rim * 0.6);
  col = mix(col, vec3(0.004, 0.008, 0.012), ihPup);
  // the turret's skin closes over the ball's lower half
  col = mix(col, skin * 0.85, smoothstep(1.1, 1.3, th));
  ihEyeRough = mix(0.08, 0.4, smoothstep(0.6, 1.2, th));
  diffuseColor.rgb = col;
}
`;

function eyeMaterial(u: IshSkinUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.376 });
  m.name = 'IshigareiEye';
  m.envMapIntensity = 0.3;
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uTint;\nuniform float uMelanin;\n${PATTERN}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = ihEyeRough;')
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float head = pow(clamp(dot(nW, vW), 0.0, 1.0), 1.5);
  totalEmissiveRadiance += ihPup * vec3(0.03, 0.14, 0.17) * amUnderwater(nW, 1.0) * (0.3 + 0.7 * head) * 1.4;
}`);
  };
  m.customProgramCacheKey = () => 'ishigarei-eye-v1';
  return m;
}

// ------------------------------------------------------------------ one fish's look

export interface IshLookSpec {
  /** individual colour (multiplies the eyed side) */
  tint: [number, number, number];
  /** 0.6 … 1.4: how much melanin the skin carries at rest */
  melanin: number;
  /** 0 … 1.4: how strongly the white spots show */
  spots: number;
}

/** One fish's materials (shader programs are shared between fish; the uniforms are its own). */
export class IshigareiLook {
  readonly uniforms: IshSkinUniforms;
  readonly ground = new GroundPatch();
  readonly skin: MeshPhysicalMaterial;
  readonly skinLow: MeshPhysicalMaterial;
  readonly fins: MeshPhysicalMaterial;
  readonly eyes: MeshPhysicalMaterial;
  readonly melaninBase: number;

  constructor(spec: IshLookSpec) {
    this.melaninBase = spec.melanin;
    this.uniforms = {
      uTint: { value: new Color(...spec.tint) }, uGroundTint: { value: new Color(0.37, 0.37, 0.355) },
      uMelanin: { value: spec.melanin }, uBury: { value: 0 }, uCover: { value: new Color(0.37, 0.37, 0.355) },
      uMouthOpen: { value: 0 }, uBreath: { value: 0 }, uSpots: { value: spec.spots }, uRelief: { value: 1 },
    };
    this.skin = skinMaterial(this.uniforms, this.ground.uniforms, false);
    this.skinLow = skinMaterial(this.uniforms, this.ground.uniforms, true);
    this.fins = finMaterial(this.uniforms, this.ground.uniforms);
    this.eyes = eyeMaterial(this.uniforms);
  }

  /** the substrate under the fish (linear colour): sand over a buried fish, and the hue it matches */
  setSubstrate(c: Color | Vector3): void {
    const r = (c as Color).r ?? (c as Vector3).x, g = (c as Color).g ?? (c as Vector3).y, b = (c as Color).b ?? (c as Vector3).z;
    this.uniforms.uCover.value.setRGB(r, g, b);
    this.uniforms.uGroundTint.value.setRGB(r, g, b);
  }

  dispose(): void {
    this.skin.dispose(); this.skinLow.dispose(); this.fins.dispose(); this.eyes.dispose();
    this.ground.dispose();
  }
}

/** the flat's sediments as the terrain draws them (Terrain.ts SUBSTRATE_COLORS) */
export const SUBSTRATE_TINT: Record<string, [number, number, number]> = {
  sand: [0.37, 0.37, 0.355], muddy_sand: [0.29, 0.285, 0.27], mud: [0.19, 0.185, 0.17],
  gravel: [0.33, 0.305, 0.27], channel: [0.15, 0.145, 0.135], rock: [0.3, 0.295, 0.28],
};

export const ISH_UNIFORMS = AMH_UNIFORMS;
