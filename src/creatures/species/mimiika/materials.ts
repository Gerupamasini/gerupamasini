import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, Vector2, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { AMH_UNIFORMS, ENV_INJECT, HELPERS, SUN_INJECT } from '../amimehagi/materials';
import { EYE, FIN, Z_ROOT } from './anatomy';

/**
 * Materials of the ミミイカ: standard PBR (MeshPhysicalMaterial: wet clearcoat, iridescence for the iridophores) with
 * the skin worked in through onBeforeCompile, lit by the underwater light field shared with the other animals of the
 * flat (the sun's beam through the water with its extinction and caustics, Snell's window, the water's glow).
 *
 * The skin is computed where it is drawn, on the rest position in millimetres, so it has no texture and no seams:
 *  - chromatophores  three sets of discrete organs on jittered 3-D grids (yellow 0.3 mm apart, red-orange 0.5 mm,
 *                    dark brown 0.8 mm), each a dot when contracted and a disc up to most of its cell when expanded
 *                    (uChroma.xyz), the expansion modulated by a slowly drifting mottle (uChroma.w), the animal's
 *                    own pattern (dorsal more than ventral, the arms' outer faces spotted) and each organ's own pulse
 *  - iridophores     green-gold sparkle under the chromatophores on the back and the head, the bright patch over the
 *                    eyes and the bluish silver of the belly (MeshPhysicalMaterial.iridescence, per fragment)
 *  - tissue          translucent, pale and bluish where no pigment is spread; light passes through the thin parts
 *                    (fins, arm tips, the mantle's rim) and the viscera show faintly through the belly
 *  - suckers         two rows of small pale cups on the oral face of the arms, a pad of them on the tentacle clubs
 *  - sand            grains stuck in the mucus of the back (uSandCoat) and thrown over the head when it buries
 *                    (uHeadCover), sparing the eyes
 * The far tier (MM_LOW) keeps the colours and drops the organs and the iridescence. The mantle's ventilation and jet
 * (uMantle) and the fins' waves (uFinAmp, uFinPh, uFinK) are vertex deformations.
 */

const f = (x: number): string => x.toFixed(5);

export interface MmUniforms {
  uTint: IUniform<Color>;
  /** expansion of the yellow, red and brown chromatophores (0 … 1), the mottle's strength */
  uChroma: IUniform<Vector4>;
  /** iridophores showing (0 … 1), the glassy pale of a hovering hunter (0 … 1) */
  uIrid: IUniform<number>;
  uPale: IUniform<number>;
  uSeed: IUniform<number>;
  uMantle: IUniform<number>;
  uSandCoat: IUniform<number>;
  uHeadCover: IUniform<number>;
  uCover: IUniform<Color>;
  uFinAmp: IUniform<Vector2>;
  uFinPh: IUniform<Vector2>;
  uFinK: IUniform<number>;
  uPupil: IUniform<number>;
  uRelief: IUniform<number>;
  /** the sand's height under the animal (world y): a buried animal's sand coat fades into it */
  uGroundY: IUniform<number>;
}

// ------------------------------------------------------------------ shared GLSL

const NOISE = /* glsl */ `
float mmH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 mmH3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float mmN(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mmH(i), mmH(i + vec3(1, 0, 0)), f.x), mix(mmH(i + vec3(0, 1, 0)), mmH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mmH(i + vec3(0, 0, 1)), mmH(i + vec3(1, 0, 1)), f.x), mix(mmH(i + vec3(0, 1, 1)), mmH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mmF(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * mmN(p); p = p * 2.03 + 5.7; a *= 0.5; } return s / 0.875; }
/*
 * One set of chromatophores: organs on a jittered grid (cell mm), each with its own size and a share of the set's
 * expansion; returns the pigment's coverage at p (the 8 nearest cells, so an expanded organ can fill its cell).
 * 'aa' is the pixel's footprint in mm: smaller organs than that merge into their mean.
 */
vec2 mmOrgans(vec3 p, vec3 n, float cell, float r0, float r1, float expand, float seed, float aa, float t) {
  vec3 q = p / cell + seed;
  vec3 b = floor(q - 0.5);
  float cov = 0.0, rnd = 0.5;
  for (int k = 0; k < 8; k++) {
    vec3 id = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 h = mmH3(id);
    vec3 c = id + 0.5 + (h - 0.5) * 0.62;
    // each organ: its own threshold of the set's expansion, and a small pulse (the muscles never quite rest)
    float e = clamp(expand * (0.55 + 0.9 * h.x) - 0.12 * h.y + 0.05 * sin(t * (0.7 + 1.1 * h.z) + h.y * 6.283), 0.0, 1.0);
    float r = mix(r0, r1, e) * (0.6 + 0.8 * h.z);
    // organs lie in the skin: the distance along it, from those within half a cell of it
    vec3 dq = q - c;
    float hn = dot(dq, n);
    vec3 dt = dq - n * hn;
    float d = length(dt);
    // a stretched pigment sac is not a disc: its rim wavers, more the more it is spread
    float wob = 1.0 + e * (0.16 * sin(dot(dt, vec3(7.1, 5.3, -6.2)) / max(r, 0.05) + h.y * 6.283) + 0.1 * sin(dot(dt, vec3(-4.7, 8.9, 3.1)) / max(r, 0.05) + h.x * 6.283));
    d /= wob;
    float w = aa / cell + 0.03 + 0.04 * e;
    float m = (1.0 - smoothstep(r - w, r + w, d)) * (1.0 - smoothstep(0.4, 0.55, abs(hn)));
    // the core is denser than the stretched rim
    m *= mix(1.0, 0.72 + 0.28 * (1.0 - smoothstep(0.0, r, d)), e);
    if (m > cov) { cov = m; rnd = h.y; }
  }
  // too small to resolve: the set's mean cover, not a shimmer
  float rm = mix(r0, r1, clamp(expand, 0.0, 1.0));
  float mean = 3.1 * rm * rm;
  return vec2(mix(cov, min(mean, 1.0), smoothstep(0.35, 0.9, aa / cell)), rnd);
}
/*
 * The dark (brown-black) chromatophores as they are in the photographs: a mosaic of organs, each in its own cell of
 * the skin (a Voronoi cell along the skin, from the 8 nearest jittered points). Contracted, an organ is a round dot
 * in its cell; spread, it fills the cell up to a thin pale line where it meets its neighbours: the reticulated net of
 * a resting bobtail. Returns (pigment cover, the pale net between organs, the organ's random, its expansion).
 */
vec4 mmReticle(vec3 p, vec3 n, float cell, float expand, float seed, float aa, float t) {
  vec3 q = p / cell + seed;
  vec3 b = floor(q - 0.5);
  float f1 = 9.0, f2 = 9.0;
  vec3 h1 = vec3(0.5);
  for (int k = 0; k < 8; k++) {
    vec3 id = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 h = mmH3(id);
    vec3 c = id + 0.5 + (h - 0.5) * 0.66;
    vec3 dq = q - c;
    float hn = dot(dq, n);
    // the distance along the skin, those off it counting further (one layer of organs)
    float d = length(dq - n * hn) + 1.4 * max(abs(hn) - 0.25, 0.0);
    if (d < f1) { f2 = f1; f1 = d; h1 = h; } else if (d < f2) f2 = d;
  }
  float e = clamp(expand * (0.75 + 0.6 * h1.x) - 0.08 * h1.y + 0.04 * sin(t * (0.6 + h1.z) + h1.y * 6.283), 0.0, 1.0);
  float w = aa / cell + 0.02;
  // contracted: a dot (a little irregular); spread: the cell less a pale line, thinner the more it spreads
  float wob = 1.0 + 0.12 * sin(h1.y * 40.0 + f1 * 9.0);
  float r = mix(0.17, 0.62, e) * (0.75 + 0.5 * h1.z) * wob;
  float dot1 = 1.0 - smoothstep(r - w, r + w, f1);
  float border = f2 - f1;
  float line = mix(0.3, 0.045, e) * (0.75 + 0.5 * h1.x);
  float poly = smoothstep(line - w, line + w, border);
  float cov = mix(dot1, max(dot1, poly), smoothstep(0.35, 0.8, e));
  // the core denser than the stretched rim
  cov *= mix(1.0, 0.8 + 0.2 * smoothstep(0.0, 0.5, border), e);
  float net = 1.0 - smoothstep(line * 0.5, line + w, border);
  // too fine to resolve: the mean
  float mean = mix(3.0 * r * r, 1.0 - 1.6 * line, smoothstep(0.35, 0.8, e));
  float far = smoothstep(0.3, 0.8, aa / cell);
  return vec4(mix(cov, clamp(mean, 0.0, 1.0), far), net * (1.0 - far), h1.y, e);
}
`;

const SKIN_VERT_PARS = /* glsl */ `
attribute vec4 aSkin;   // part, t along, oral-ness, section centre y (mm)
uniform float uMantle;
varying vec4 vSkin;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vWPos;
`;

/** the mantle's radial scale about its own axis (ventilation, the jet), fading out across the neck */
const MANTLE_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
float mmZn = position.z * 1000.0 + ${f(Z_ROOT)};
float mmW = aSkin.x < 0.5 ? 1.0 - smoothstep(-2.5, 0.6, mmZn) : 0.0;
float mmS = mix(1.0, uMantle, mmW);
objectNormal = normalize(vec3(objectNormal.xy / mmS, objectNormal.z));
`;
const MANTLE_POS = /* glsl */ `
#include <begin_vertex>
vRest = position * 1000.0;
vRestN = normal;
vSkin = aSkin;
{
  float ay = aSkin.w * 0.001;
  transformed.x *= mmS;
  transformed.y = ay + (transformed.y - ay) * mmS;
  // (a contracted mantle is a little longer: the muscle keeps its volume)
  transformed.z -= (mmS - 1.0) * mmW * 0.25 * (transformed.z + 0.003);
}
`;

const SKIN_FRAG_PARS = /* glsl */ `
varying vec4 vSkin;
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uTint;
uniform vec4 uChroma;
uniform float uIrid;
uniform float uPale;
uniform float uSeed;
uniform float uSandCoat;
uniform float uHeadCover;
uniform vec3 uCover;
uniform float uRelief;
uniform float uGroundY;
const vec3 mmEye = vec3(${f(EYE.x)}, ${f(EYE.y)}, ${f(EYE.z - Z_ROOT)});
const vec3 mmEyeUp = vec3(-0.19083, 0.97969, -0.06156);
const vec3 mmEyeFwd = vec3(-0.30700, 0.00000, 0.95171);
const vec3 mmGaze = vec3(${f(EYE.gaze[0] / Math.hypot(...EYE.gaze))}, ${f(EYE.gaze[1] / Math.hypot(...EYE.gaze))}, ${f(EYE.gaze[2] / Math.hypot(...EYE.gaze))});
${NOISE}
`;

/**
 * Colour, relief, roughness, the iridophores' film and the translucency of the skin; read again by the roughness,
 * normal, clearcoat / iridescence and emissive stages.
 */
const SKIN_SURFACE = /* glsl */ `
float mmRough = 0.5, mmCoat = 0.35, mmIr = 0.0, mmIrT = 0.5, mmThin = 0.0, mmHgt = 0.0, mmSand = 0.0, mmPig = 0.0, mmFlank = 0.0, mmEyeIr = 0.0, mmCornea = 0.0;
{
  vec3 p = vRest;
  float part = vSkin.x;
  float zn = p.z + ${f(Z_ROOT)};
  float aa = max(length(fwidth(p)), 1e-4);                 // mm per pixel
  float t = uAmhTime * 0.6 + uSeed * 37.0;
  bool arm = part > 1.5 && part < 3.5;
  vec3 nR = normalize(vRestN);
  bool funnel = part > 3.5 && part < 4.5;
  // the suckers' cups; the mantle's collar lip and its lining inside the cavity
  bool sucker = part > 6.5;
  bool lining = part < 0.5 && vSkin.y > 0.75;
  float lip = part < 0.5 ? smoothstep(0.2, 0.5, vSkin.y) * (1.0 - smoothstep(0.5, 0.8, vSkin.y)) : 0.0;
  // dorsal (back) or the outer, aboral face of an arm
  float D = arm ? smoothstep(-0.3, 0.7, -vSkin.z) : sucker || lining ? 0.0 : smoothstep(-0.75, 0.45, nR.y);
  vec3 eyeV = vec3(abs(p.x), p.y, p.z) - mmEye;
  float eyeD = length(eyeV) / ${f(EYE.r)};
  // the cornea: over the eye the head's skin (pushed out into a dome round the ball, socketPush) is clear, a
  // rounded almond between the lids, wider along the body than up and down (photographs 20, 22, 29, 32); a few
  // organs linger on its upper part, the ball and its silvery iris show through it
  vec3 eyeN = eyeV / max(length(eyeV), 1e-3);
  float eg = dot(eyeN, mmGaze), eu = dot(eyeN, mmEyeUp), ef = dot(eyeN, mmEyeFwd);
  float eyeE = length(vec2(atan(eu, eg) / ${f(EYE.window * 0.82)}, atan(ef - 0.05, eg) / ${f(EYE.window * 1.08)}));
  bool onEye = part > 0.5 && part < 1.5 && eyeD < 1.35 && eg > 0.0;
  mmCornea = onEye ? 1.0 - smoothstep(0.9, 1.0, eyeE) : 0.0;
  float lid = (1.0 - smoothstep(1.0, 1.45, eyeE)) * (onEye ? 1.0 : 0.0);
  // the tissue: silvery, opaque-looking white under the belly (its reflecting cells), pale grey-flesh above
  vec3 base = mix(vec3(0.72, 0.74, 0.77), vec3(0.6, 0.55, 0.5), D);
  if (arm) base = mix(vec3(0.72, 0.66, 0.63), vec3(0.62, 0.55, 0.5), D);
  // the funnel: pale, faintly lilac, glassy flesh (photographs 20, 29)
  if (funnel) base = vec3(0.6, 0.56, 0.64);
  // the viscera through the belly: a soft darker body in the mantle's middle (the ink sac, the gills)
  if (part < 0.5) base *= 1.0 - 0.15 * (1.0 - D) * exp(-pow((zn + 11.0) / 6.0, 2.0) - pow(p.x / 4.0, 2.0));
  // the animal's pattern: where the dark set spreads first (back, head, arm faces), a drifting mottle over it
  vec3 pp = p * 0.13 + uSeed * 11.0;
  float mott = mmF(pp + vec3(0.0, 0.0, t * 0.012));
  float blot = smoothstep(0.42, 0.72, mott);
  float region = (part < 0.5 ? 1.0 : part < 1.5 ? 1.05 : arm ? 1.0 : 0.35) * mix(0.42, 1.0, D);
  // (round the eye's opening the dark set thins to a ring)
  float eY = uChroma.x * mix(0.5, 1.0, D);
  float eR = uChroma.y * region * (1.0 - 0.35 * uChroma.w + 0.6 * uChroma.w * mott);
  float eB = uChroma.z * region * (1.0 - 0.45 * uChroma.w + 0.9 * uChroma.w * blot);
  float paleK = arm ? 0.45 : 1.0;   // (the arms keep more of their spots)
  eY *= 1.0 - 0.1 * uPale; eR *= 1.0 - 0.5 * uPale * paleK; eB *= 1.0 - 0.6 * uPale * paleK;
  // (on the cornea only a few organs, on its upper part)
  float upC = smoothstep(0.15, 0.6, eu);
  eB *= mix(1.0, 0.2 * upC, mmCornea); eR *= mix(1.0, 0.15 * upC, mmCornea); eY *= mix(1.0, 0.15 * upC, mmCornea);
  if (funnel) { float fo = 1.0 - step(0.5, vSkin.z); eY *= 0.3 * fo; eR *= 0.3 * fo; eB *= 0.22 * fo; }
  if (sucker || lining) { eY = 0.0; eR = 0.0; eB = 0.0; }
  // (the rolled edge of the collar is paler: its organs thin out over the lip)
  eB *= 1.0 - 0.6 * lip; eR *= 1.0 - 0.4 * lip;
  // glassy when the pigment is withdrawn: the tissue scatters less (and lets the light through, SKIN_THIN)
  vec3 alb = base * (1.0 - 0.45 * uPale * (1.0 - 0.5 * float(funnel)));
  // the organs are larger and fewer on the back, small and crowded down the flanks and under the belly
  float coarseW = smoothstep(0.15, 0.75, D);
#ifndef MM_LOW
  vec4 rC = coarseW > 0.02 ? mmReticle(p, nR, 0.6, eB, 13.3, aa, t) : vec4(0.0);
  vec4 rF = coarseW < 0.98 ? mmReticle(p, nR, 0.34, eB * 0.9, 21.7, aa, t) : vec4(0.0);
  vec4 rB = mix(rF, rC, coarseW);
  vec2 oY = mmOrgans(p, nR, 0.3, 0.1, 0.5, eY, 3.1, aa, t);
  vec2 oR = mmOrgans(p, nR, 0.55, 0.12, 0.55, eR * 0.7, 7.7, aa, t);
  float cY = oY.x, cR = oR.x, cB = rB.x, net = rB.y;
  // each organ its own shade: the dark set from a warm red-brown to almost black, red organs among them
  vec3 colB = mix(vec3(0.085, 0.03, 0.02), vec3(0.028, 0.013, 0.012), rB.z);
  colB = mix(colB, vec3(0.3, 0.08, 0.04), (1.0 - smoothstep(0.25, 0.6, rB.w)) * 0.7);
  colB = mix(colB, vec3(0.22, 0.055, 0.028), 0.7 * eR * step(0.62, rB.z) * step(rB.z, 0.8));
  vec3 colY = mix(vec3(1.0, 0.82, 0.34), vec3(1.0, 0.66, 0.26), oY.y);
  vec3 colR = mix(vec3(0.5, 0.14, 0.06), vec3(0.36, 0.09, 0.045), oR.y);
#else
  // (the mean of the organs: their cover, and the colour they give the skin seen from afar)
  float cY = clamp(eY * 0.5, 0.0, 1.0), cR = clamp(eR * 0.5, 0.0, 0.9), cB = clamp(eB * 1.05, 0.0, 0.85), net = 0.0;
  vec3 colY = vec3(1.0, 0.75, 0.3), colR = vec3(0.6, 0.19, 0.08), colB = vec3(0.075, 0.03, 0.022);
#endif
  // the pale net between the dark organs: golden where the yellow set is spread under it (photographs 26, 29)
  vec3 gold = mix(alb, vec3(0.86, 0.64, 0.26), clamp(eY * 0.85, 0.0, 1.0) * D);
  alb = mix(alb, gold, net * 0.8);
  // the yellow set: discrete organs, and (spread, in the pale dress) a warm yellow-orange ground (photographs 17, 34)
  alb *= mix(vec3(1.0), vec3(1.0, 0.74, 0.42), clamp(eY * 0.5 * (0.4 + 0.6 * D) * (1.0 - 0.6 * cB), 0.0, 0.6) * (sucker || lining ? 0.3 : 1.0));
  alb = mix(alb, alb * colY, cY * 0.7 * (1.0 - cB));
  alb = mix(alb, colR, cR * 0.5 * (1.0 - 0.5 * cB));
  alb = mix(alb, colB, cB * 0.95);
  float deep = smoothstep(0.8, 1.15, eB) * D;
  alb = mix(alb, vec3(0.06, 0.022, 0.02), deep * 0.7);
  cB = max(cB, deep * 0.8);
  mmPig = max(cB, cR * 0.7);
  // the eyelid's rim round the window: a dark crease, then a thin pale edge right at the cornea
  alb *= 1.0 - 0.5 * lid;
  alb = mix(alb, vec3(0.62, 0.6, 0.56), 0.45 * smoothstep(0.8, 1.0, lid) * smoothstep(1.0, 1.08, eyeE + 0.08));
  // the lining of the mantle cavity: pale, wet, darker the deeper into the cavity (the light reaches it through the gap)
  if (lining) alb = vec3(0.62, 0.52, 0.5) * mix(0.25, 0.85, smoothstep(${f(-6.2)}, ${f(-0.5)}, zn));
  // the suckers: pale, translucent cups, the rim brighter, the hollow shadowed
  if (sucker) {
    alb = mix(vec3(0.74, 0.68, 0.64), vec3(0.86, 0.82, 0.78), step(0.5, vSkin.z) * step(vSkin.z, 1.5));
    alb = mix(alb, vec3(0.34, 0.24, 0.22), step(1.5, vSkin.z));
  }
  // ---- iridophores (photographs 7, 12, 22, 60): blue-green sheets over the eyes, a golden-green sheet down the
  // front of the mantle's side, blue and violet flecks in the net on the back, the belly's silver
  float sparkle = 0.0;
#ifndef MM_LOW
  {
    vec3 q = p / 0.26 + 17.0;
    vec3 id = floor(q), h = mmH3(id);
    vec3 c = id + 0.5 + (h - 0.5) * 0.5;
    sparkle = step(0.55, h.x) * (1.0 - smoothstep(0.2, 0.4 + aa * 0.8, length(q - c)));
    sparkle = mix(sparkle, 0.3, smoothstep(0.1, 0.3, aa));
  }
#endif
  float patchy = smoothstep(0.32, 0.66, mmF(p * 0.21 + 40.0 + uSeed));
  // over each eye (not across the midline), broken into the mosaic of reflecting cells
  float eyePatch = exp(-pow((eyeD - 1.4) / 0.42, 2.0)) * smoothstep(-0.5, 1.0, p.y - 1.2) * smoothstep(1.6, 3.2, abs(p.x)) * (part > 0.5 && part < 1.5 ? 1.0 : 0.0);
  eyePatch *= (0.35 + 0.65 * smoothstep(0.25, 0.6, mmN(p * 2.2 + 7.0) * 0.6 + sparkle * 0.5)) * (1.0 - 0.85 * mmCornea);
  float flank = (part < 0.5 ? 1.0 : 0.0) * exp(-pow((zn + 5.5) / 4.0, 2.0)) * exp(-pow(nR.y / 0.45, 2.0)) * smoothstep(0.25, 0.55, mmF(p * 0.15 + 3.0 + uSeed));
  mmIr = (part < 1.5 ? (0.35 * net + 0.65 * sparkle) * patchy * D : 0.0) + eyePatch * (0.65 + 0.45 * sparkle) + 1.3 * flank + (part < 0.5 ? 0.2 * (1.0 - D) : 0.0);
  if (arm) mmIr = 0.25 * sparkle * D;
  // the chromatophores lie over them
  mmIr *= (1.0 - 0.92 * cB * (1.0 - 0.5 * flank)) * (1.0 - 0.4 * cR) * uIrid;
  // the film's thickness: blue-green over the eyes, gold-green on the flank, mixed on the back
  mmIrT = clamp(fract(h1(floor(p / 0.5)) + 0.3 * mott) * 0.6 + 0.4 * eyePatch * 0.0 + (eyePatch > 0.3 ? 0.15 : flank > 0.3 ? 0.62 : 0.0), 0.0, 1.0);
  mmFlank = flank;
  mmEyeIr = eyePatch;
  // ---- suckers on the oral faces
  if (arm && vSkin.z > 0.2) {
    float tt = vSkin.y;
    float isTen = part > 2.5 ? 1.0 : 0.0;
    float club = isTen * smoothstep(0.7, 0.76, tt);
    float n = mix(28.0, 34.0, isTen);
    float row = vUv.x * 2.0 - 1.0;   // 0 at the oral line
    float k = tt * n;
    float sk = fract(k + step(0.0, row) * 0.5) - 0.5;
    float dr = abs(abs(row - 0.0) - mix(0.07, 0.05, tt)) / 0.06;
    float rs = mix(0.42, 0.22, tt);
    float cup = (1.0 - smoothstep(rs * 0.8, rs, length(vec2(sk, dr * 0.5)))) * step(0.03, tt) * (1.0 - isTen + club);
    float rim = cup * smoothstep(rs * 0.35, rs * 0.7, length(vec2(sk, dr * 0.5)));
    float fine = 1.0 - smoothstep(0.08, 0.25, aa);
    alb = mix(alb, vec3(0.88, 0.84, 0.8), rim * 0.5 * fine);
    alb = mix(alb, alb * 0.7, (cup - rim) * 0.5 * fine);
    mmHgt += (rim * 0.04 - (cup - rim) * 0.03) * fine;
  }
  // the arm tips and the tentacles are thin: they pass light
  mmThin = arm ? 0.35 + 0.55 * vSkin.y : funnel ? (vSkin.z > 1.5 ? 0.0 : 0.3) : sucker ? 0.45 : lining ? 0.1 : 0.12 * (1.0 - D) + 0.25 * lip;
  // the funnel's opening: the thick lip paler, the bore going dark within a millimetre
  if (funnel && vSkin.z > 0.5) alb = vSkin.z < 1.5 ? vec3(0.72, 0.67, 0.73) : mix(vec3(0.3, 0.2, 0.23), vec3(0.015, 0.01, 0.012), smoothstep(0.0, 0.45, vSkin.w));
  // a fine relief of the organs and the skin; round the cornea the soft fold of the lids, a shallow groove outside it
  mmHgt += 0.02 * cB + 0.012 * (mmN(p * 3.0) - 0.5) * (1.0 - mmCornea);
  if (onEye) mmHgt += 0.085 * exp(-pow((eyeE - 1.1) / 0.11, 2.0)) - 0.035 * exp(-pow((eyeE - 1.36) / 0.13, 2.0));
  mmRough = mix(mix(0.46, 0.56, cB), 0.05, mmCornea);
  mmCoat = mix(mmCoat, 1.0, mmCornea);
  mmIr *= 1.0 - mmCornea;
  // ---- sand: grains in the mucus of the back, and thrown over the head (not over the eyes)
  {
    // grains: jittered points at two sizes over a fine noise (no lattice), a few pale quartz and dark grains
    vec3 q = p / 0.3 + 51.0;
    vec3 id = floor(q), h = mmH3(id);
    float gd = length(q - id - 0.5 - (h - 0.5) * 0.7);
    float grain = 1.0 - smoothstep(0.22, 0.42, gd * (0.8 + 0.5 * h.z));
    float lay = mmN(p * 0.6 + 9.0) * 0.45 + mmN(p * 2.7 + 3.0) * 0.25 + h.x * 0.3;
    float back = mix(D, 1.0, 0.6 * uHeadCover) * (part < 0.5 ? 1.0 : part < 1.5 ? 0.85 : arm ? mix(0.35, 0.9, uHeadCover) : 0.0);
    float head = D * (part < 1.5 ? smoothstep(-6.0, 1.0, zn) : arm ? 0.4 * (1.0 - vSkin.y) : 0.0) * smoothstep(1.0, 1.25, eyeE);
    float cover = max(back * uSandCoat, head * uHeadCover);
    mmSand = smoothstep(lay - 0.08, lay + 0.08, cover * 1.15) * mix(0.5 + 0.5 * grain, 1.0, smoothstep(0.5, 0.95, cover));
    float fineN = mmN(p * 4.3) * 0.6 + mmN(p * 9.1) * 0.4;
    vec3 sand = uCover * (0.86 + 0.22 * fineN);
    float odd = step(0.9, h.y) * grain * (1.0 - smoothstep(0.05, 0.2, aa));
    sand = mix(sand, mix(sand * 0.55, sand * 1.35 + 0.02, step(0.5, h.z)), odd * 0.6);
    alb = mix(alb, sand, mmSand);
    mmRough = mix(mmRough, 0.9, mmSand);
    mmCoat *= 1.0 - mmSand;
    mmIr *= 1.0 - mmSand;
    mmHgt += 0.035 * mmSand * (grain + fineN * 0.5);
  }
  diffuseColor.rgb = alb * uTint;
  // glassy tissue: where no pigment is spread the background shows through (most in the pale, hunting dress)
  // a living bobtail is glassy: between the chromatophores the tissue lets most of the light through (more in the
  // pale dress, at the arm tips and the mantle's thin rim); the viewing angle is added in SKIN_THIN
  float clear = (0.42 + 0.4 * uPale) * (1.0 - mmPig) * (1.0 - mmPig) * (1.0 - mmSand) * (funnel ? (vSkin.z > 1.5 ? 0.0 : 1.0) : lining ? 0.3 : 1.0) * (arm ? 1.0 + 0.3 * vSkin.y : 1.0);
  diffuseColor.a = 1.0 - clamp(clear, 0.0, 0.85);
  // the cornea: clear but for its few organs (its gloss is kept by SKIN_ALPHA)
  diffuseColor.a = mix(diffuseColor.a, 0.025 + 0.9 * mmPig, mmCornea);
  // buried: the sand on it runs out into the bed's sand (no hard line where the mound meets it)
  diffuseColor.a *= 1.0 - mmSand * (1.0 - smoothstep(0.0, ${f(0.0022)}, vWPos.y - uGroundY));
}
`;

const SKIN_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#ifndef MM_LOW
{
  vec3 sp = -vViewPosition;
  vec2 dH = vec2(dFdx(mmHgt), dFdy(mmHgt)) * 0.001 * uRelief;
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif
`;

/** soft tissue: the light it is bathed in scatters through it, warmed by blood and pigment; the iridophores' film glints */
const SKIN_THIN = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 tissue = diffuseColor.rgb * vec3(1.1, 0.88, 0.8) * (1.0 - 0.95 * mmPig);
  float k = (0.1 + 0.4 * mmThin + 0.22 * uPale) * (1.0 - mmSand) * (1.0 - mmCornea);
  totalEmissiveRadiance += tissue * amUnderwater(-nW, 1.0) * k;
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += tissue * amSunCol() * amSunThrough() * back * (0.03 + 0.25 * mmThin) * (1.0 - mmSand) * (1.0 - mmCornea);
  // (the iridophores reflect structurally: a little of their colour whatever the light's direction)
  // (vW runs from the eye to the surface: the facing term and the reflection use it that way round)
  float cv = clamp(-dot(nW, vW), 0.0, 1.0);
  // translucent sac: seen face on the light passes through one thin wall, at the silhouette through a long path of
  // tissue — clear in the middle, milky towards the outline
  diffuseColor.a = mix(mix(1.0, diffuseColor.a, pow(cv, 0.7) * (1.0 - mmSand)), diffuseColor.a, mmCornea);
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (mmIrT * 1.6 + cv * 0.9 + vec3(0.0, 0.33, 0.67)));
  // the hues the photographs show: blue-green over the eyes, gold-green on the flank, green-blue-violet flecks
  film = mix(film, vec3(0.35, 0.85, 0.6), 0.3);
  film = mix(film, vec3(0.15, 0.75, 0.85), mmEyeIr * 0.6);
  film = mix(film, vec3(0.8, 0.85, 0.35), mmFlank * 0.6);
  // (iridophores are stacks of thin plates: they send coloured light back over a broad cone, not only as a mirror)
  vec3 lightIn = amUnderwater(reflect(vW, nW), 0.3) * 0.7 + amUnderwater(nW, 1.0) * 0.6 + amSunCol() * amSunThrough() * 0.12;
  totalEmissiveRadiance += film * mmIr * lightIn * (0.45 + 0.5 * pow(1.0 - cv, 2.0));
  // the two big reflecting sheets the photographs show from every side: gold-green down the front of the mantle's
  // flank (12), blue-green over the eyes (3, 6, 7, 22); a rainbow drifting over them with the angle
  vec3 bow = 0.55 + 0.45 * cos(6.2832 * (cv * 1.3 + mmIrT + vec3(0.0, 0.33, 0.67)));
  vec3 sheet = mmFlank * mix(vec3(0.75, 0.82, 0.3), bow, 0.45) + mmEyeIr * 0.7 * mix(vec3(0.12, 0.7, 0.75), bow, 0.3);
  totalEmissiveRadiance += sheet * uIrid * (1.0 - mmSand) * (amUnderwater(nW, 1.0) * 0.55 + lightIn * 0.35);
}
`;

/**
 * Blending a glassy skin by its alpha would dim its highlights with it (the cornea would lose its gleam): the
 * specular light is laid over the blend instead — the alpha is raised where the highlight is and the colour scaled
 * so that the tissue still shows by its own alpha.
 */
const SKIN_ALPHA = /* glsl */ `
#include <opaque_fragment>
{
  vec3 spec = totalSpecular;
#ifdef USE_CLEARCOAT
  spec += (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;
#endif
  float a0 = gl_FragColor.a;
  float a1 = max(a0, clamp(max(spec.r, max(spec.g, spec.b)) * 1.2, 0.0, 1.0));
  gl_FragColor = vec4((max(gl_FragColor.rgb - spec, 0.0) * a0 + spec) / max(a1, 1e-3), a1);
}
`;

function skinMaterial(u: MmUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.5, clearcoat: low ? 0.25 : 0.35, clearcoatRoughness: 0.24, side: FrontSide, transparent: true, depthWrite: true,
    iridescence: low ? 0 : 1, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 720], specularIntensity: 0.7,
  });
  m.name = low ? 'MimiikaSkinLOD2' : 'MimiikaSkin';
  m.envMapIntensity = 0.2;
  m.defines = { USE_UV: '', ...(low ? { MM_LOW: '' } : {}) };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKIN_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', MANTLE_NORMAL)
      .replace('#include <begin_vertex>', MANTLE_POS)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SKIN_FRAG_PARS}\nfloat h1(vec3 p) { return mmH(p); }`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SKIN_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mmRough;')
      .replace('#include <normal_fragment_maps>', SKIN_NORMAL)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat = mmCoat;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = clamp(mmIr, 0.0, 1.0);
  material.iridescenceThickness = mix(260.0, 640.0, mmIrT);
#endif`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}
  // sand on the skin takes the bed's light, not the water's: it must read as the sand round it
  iblIrradiance *= mix(1.0, 0.12, mmSand);
  radiance *= mix(1.0, 0.15, mmSand);`)
      .replace('#include <emissivemap_fragment>', SKIN_THIN)
      .replace('#include <opaque_fragment>', SKIN_ALPHA);
  };
  m.customProgramCacheKey = () => (low ? 'mimiika-skin-low-v2' : 'mimiika-skin-v2');
  return m;
}

// ------------------------------------------------------------------ fins

const FIN_VERT = /* glsl */ `
attribute vec4 aSkin;
attribute vec3 aFin;   // u along the base (front → back), v out to the edge, side
uniform vec2 uFinAmp;
uniform vec2 uFinPh;
uniform float uFinK;
uniform float uMantle;
varying vec3 vFin;
varying vec3 vRest;
varying vec3 vWPos;
`;

/** the travelling wave along the fin (front → back), growing towards the free edge; normals from its slopes */
const FIN_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
float mfSide = aFin.z;
float mfAmp = mfSide > 0.0 ? uFinAmp.x : uFinAmp.y;
float mfPh = mfSide > 0.0 ? uFinPh.x : uFinPh.y;
float mfEnv = pow(aFin.y, 1.35) * (0.75 + 0.25 * sin(3.1416 * aFin.x));
float mfArg = 6.2832 * uFinK * aFin.x - mfPh;
float mfW = mfAmp * mfEnv * sin(mfArg) * ${f(FIN.span * 0.001)};
vec3 mfN = vec3(-sin(${f(FIN.tilt)}) * mfSide, cos(${f(FIN.tilt)}), 0.0);
vec3 mfOut = vec3(cos(${f(FIN.tilt)}) * mfSide, sin(${f(FIN.tilt)}), 0.0);
{
  // slopes: d/du over the base's length (u runs backwards, −z), d/dv over the span
  float dU = mfAmp * mfEnv * cos(mfArg) * 6.2832 * uFinK * ${f(FIN.span / (FIN.z0 - FIN.z1))};
  float dV = mfAmp * 1.35 * pow(max(aFin.y, 1e-3), 0.35) * sin(mfArg);
  objectNormal = normalize(objectNormal - mfOut * dV * sign(dot(objectNormal, mfN)) + vec3(0.0, 0.0, dU) * sign(dot(objectNormal, mfN)));
}
`;
const FIN_POS = /* glsl */ `
#include <begin_vertex>
vFin = aFin;
vRest = position * 1000.0;
transformed += mfN * mfW;
// the base rides on the mantle's side as it swells and contracts
transformed.x += mfSide * (uMantle - 1.0) * 0.0078 * (1.0 - 0.3 * aFin.y);
`;

const FIN_SURFACE = /* glsl */ `
float mfThin = 1.0;
{
  vec3 p = vRest;
  float v = vFin.y;
  float aa = max(length(fwidth(p)), 1e-4);
  float t = uAmhTime * 0.6 + uSeed * 37.0;
  // sparse chromatophores, densest at the base; the membrane's edge clear
  float near = 1.0 - smoothstep(0.15, 0.85, v);
  vec3 nF = vec3(-sin(${f(FIN.tilt)}) * sign(vFin.z), cos(${f(FIN.tilt)}), 0.0);
  float eB = uChroma.z * (0.35 + 0.65 * near) * (1.0 - 0.5 * uPale);
  float eR = uChroma.y * (0.4 + 0.6 * near) * (1.0 - 0.5 * uPale);
  float eY = uChroma.x * 0.8;
#ifndef MM_LOW
  float cB = mmOrgans(p, nF, 0.95, 0.12, 0.44, eB, 21.0, aa, t).x;
  float cR = mmOrgans(p, nF, 0.65, 0.1, 0.42, eR, 25.0, aa, t).x;
  float cY = mmOrgans(p, nF, 0.42, 0.1, 0.45, eY, 29.0, aa, t).x;
#else
  float cB = eB * 0.35, cR = eR * 0.3, cY = eY * 0.4;
#endif
  vec3 col = vec3(0.82, 0.8, 0.78);
  col = mix(col, col * vec3(1.0, 0.8, 0.35), cY * 0.8);
  col = mix(col, vec3(0.6, 0.2, 0.08), cR * 0.9);
  col = mix(col, vec3(0.14, 0.06, 0.045), cB * 0.95);
  float alpha = 0.12 + 0.75 * max(cB, cR * 0.8) + 0.3 * cY + 0.22 * near * near;
  // the fleshy base, the clear, slightly thickened rim
  alpha = mix(alpha, 0.9, 1.0 - smoothstep(0.0, 0.1, v));
  alpha = max(alpha, 0.22 * exp(-pow((v - 0.985) / 0.02, 2.0)));
  // sand on the fins of a buried animal
  float sand = smoothstep(0.3, 0.6, uSandCoat) * step(0.35, mmH(floor(p / 0.34))) * 0.8;
  col = mix(col, uCover, sand);
  alpha = mix(alpha, 0.95, sand);
  mfThin = 1.0 - sand;
#ifdef MM_LOW
  alpha *= 0.75;
#endif
  diffuseColor = vec4(col * uTint, clamp(alpha, 0.0, 1.0));
}
`;

function finMaterial(u: MmUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.32, clearcoat: low ? 0 : 0.5, clearcoatRoughness: 0.12, transparent: true, depthWrite: false, side: DoubleSide });
  m.name = low ? 'MimiikaFinLOD2' : 'MimiikaFin';
  m.envMapIntensity = 0.3;
  m.defines = low ? { MM_LOW: '' } : {};
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_VERT}`)
      .replace('#include <beginnormal_vertex>', FIN_NORMAL)
      .replace('#include <begin_vertex>', FIN_POS)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFin;\nvarying vec3 vRest;\nuniform vec3 uTint;\nuniform vec4 uChroma;\nuniform float uPale;\nuniform float uSeed;\nuniform float uSandCoat;\nuniform vec3 uCover;\n${NOISE}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FIN_SURFACE}`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // a living membrane: it scatters the light it is bathed in from both sides, the sun shines through it
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * mfThin * ((amUnderwater(nW, 1.0) + amUnderwater(-nW, 1.0)) * 0.1 + amSunCol() * amSunThrough() * back * 0.12);
}`);
  };
  m.customProgramCacheKey = () => (low ? 'mimiika-fin-low-v1' : 'mimiika-fin-v1');
  return m;
}

// ------------------------------------------------------------------ eyes

/**
 * The eyeball under the clear cornea of the head's skin (photographs 20, 22, 29, 32): a silvery iris of reflecting
 * cells with a warm cast, fine radial fibres, a ring of bronze-gold at the pupil's margin, a darker rim and a bright
 * silver crescent under the pupil; the pupil a thin horizontal crescent in the light, its ends turned up, that opens
 * into a broad rounded kidney in the dark (uPupil). Round the iris the ball is the eye's silvery-dark coat
 * (iridophores over the pigment), never skin, so it looks right wherever the eye turns in its socket.
 */
const EYE_SURFACE = /* glsl */ `
float meRough = 0.2, meIr = 0.0, mePup = 0.0, meMetal = 0.0;
{
  vec2 q = (vUv - 0.5) * 2.0 * 3.14159;   // angle from the optical axis (rad), +y up
  float th = length(q);
  float a = atan(q.y, q.x);
  // the pupil: a crescent, its ends turned up (a little below the axis), opening into a kidney dented from above
  float pw = mix(0.4, 0.5, uPupil), ph = mix(0.045, 0.38, uPupil * uPupil);
  vec2 pq = q - vec2(0.0, -0.07 + 0.04 * uPupil);
  pq.y -= mix(0.07, 0.02, uPupil) * (pq.x / pw) * (pq.x / pw);
  pq.y += 0.09 * uPupil * exp(-pow(pq.x / 0.16, 2.0)) * step(0.0, pq.y);
  float pd = length(pq / vec2(pw, ph));
  float aa = fwidth(pd) + 1e-3;
  mePup = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, pd);
  // the iris: radial fibres (finer and denser towards the pupil), silver-white below, shaded and warmer above
  float fib = 0.5 + 0.5 * sin(a * 58.0 + 4.0 * sin(a * 9.0) + th * 5.0);
  float fib2 = 0.5 + 0.5 * sin(a * 131.0 + 7.0 * sin(a * 23.0));
  vec3 iris = mix(vec3(0.62, 0.61, 0.55), vec3(0.36, 0.33, 0.25), smoothstep(-0.35, 0.45, q.y));
  iris *= 0.82 + 0.12 * fib + 0.06 * fib2;
  // a bright crescent of silver under the pupil (32), a faint green cast where the reflecting cells are thickest
  iris = mix(iris, vec3(0.78, 0.78, 0.74), 0.5 * smoothstep(0.08, 0.3, -q.y) * (1.0 - smoothstep(0.6, 0.9, th)) * smoothstep(1.4, 2.4, pd));
  iris = mix(iris, iris * vec3(0.85, 1.05, 0.9), 0.4 * smoothstep(0.25, 0.8, th));
  // the pupil's margin: a collarette of bronze-gold (26, 29), and the iris darker to its rim
  float coll = exp(-pow((pd - 1.35) / 0.32, 2.0)) * (1.0 - smoothstep(0.5, 0.8, th));
  iris = mix(iris, vec3(0.6, 0.44, 0.18), 0.65 * coll);
  iris = mix(iris, vec3(0.24, 0.22, 0.15), smoothstep(0.8, 1.12, th));
  // round the iris (only seen when the eye turns far): the ball's coat, silvery dark, darker into the socket
  float outer = smoothstep(1.1, 1.22, th);
  vec3 coat = mix(vec3(0.16, 0.17, 0.16), vec3(0.05, 0.05, 0.05), smoothstep(1.2, 1.9, th));
  vec3 col = mix(iris, coat, outer);
  col = mix(col, vec3(0.004, 0.005, 0.006), mePup);
  meIr = (1.0 - mePup) * mix(0.55 + 0.3 * coll, 0.8, outer);
  meMetal = (1.0 - mePup) * mix(0.35, 0.55, outer);
  meRough = mix(mix(0.18, 0.3, fib2 * (1.0 - outer)), 0.22, outer);
  diffuseColor.rgb = col * uTint;
}
`;

function eyeMaterial(u: MmUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.15, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.07, ior: 1.4,
    iridescence: low ? 0 : 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 600],
  });
  m.name = low ? 'MimiikaEyeLOD2' : 'MimiikaEye';
  m.envMapIntensity = 0.35;
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec4 uChroma;\nuniform float uPupil;')
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = meRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = meMetal;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_IRIDESCENCE\n  material.iridescence = meIr;\n#endif')
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float head = pow(clamp(-dot(nW, vW), 0.0, 1.0), 2.0);
  // the tapetum-less dark of the pupil still throws back a little blue-green; the silver iris its own light
  totalEmissiveRadiance += mePup * vec3(0.02, 0.07, 0.08) * amUnderwater(nW, 1.0) * head;
  totalEmissiveRadiance += meIr * diffuseColor.rgb * amUnderwater(reflect(vW, nW), 0.3) * 0.18;
}`);
  };
  m.customProgramCacheKey = () => (low ? 'mimiika-eye-low-v2' : 'mimiika-eye-v2');
  return m;
}

// ------------------------------------------------------------------ viscera

/** the organs inside: their own colour, the ink sac's silvery iridophore coat glinting, lit by the water's light */
function visceraMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide, transparent: true, depthWrite: false, metalness: 0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.6, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 500] });
  m.name = 'MimiikaViscera';
  m.envMapIntensity = 0.3;
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}
  // inside the animal: the light reaching them has crossed the tissue
  iblIrradiance *= 0.45;
  radiance *= 0.5;`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= 0.5;')
      // seen through the tissue the organs have no hard outline: they fade towards their silhouettes
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 nV = normalize(normal);
  float facing = abs(dot(nV, normalize(vViewPosition)));
  diffuseColor.a *= 0.62 * smoothstep(0.05, 0.75, facing);
}`);
  };
  m.customProgramCacheKey = () => 'mimiika-viscera-v1';
  return m;
}

// ------------------------------------------------------------------ one animal's look

export interface MmLookSpec {
  /** individual colour (multiplies the skin) */
  tint: [number, number, number];
  /** the pattern's own seed */
  seed: number;
  /** how dark it is at rest (scales the brown set) */
  dark: number;
}

/** One squid's materials (programs shared between animals, uniforms its own). */
export class MimiikaLook {
  readonly uniforms: MmUniforms;
  readonly skin: MeshPhysicalMaterial;
  readonly skinLow: MeshPhysicalMaterial;
  readonly fins: MeshPhysicalMaterial;
  readonly finsLow: MeshPhysicalMaterial;
  readonly eyes: MeshPhysicalMaterial;
  readonly eyesLow: MeshPhysicalMaterial;
  readonly viscera: MeshPhysicalMaterial;
  readonly spec: MmLookSpec;

  constructor(spec: MmLookSpec) {
    this.spec = spec;
    this.uniforms = {
      uTint: { value: new Color(...spec.tint) }, uChroma: { value: new Vector4(0.7, 0.8, 1.0 * spec.dark, 0.5) },
      uIrid: { value: 0.7 }, uPale: { value: 0 }, uSeed: { value: spec.seed }, uMantle: { value: 1 },
      uSandCoat: { value: 0 }, uHeadCover: { value: 0 }, uCover: { value: new Color(0.37, 0.37, 0.355) },
      uFinAmp: { value: new Vector2() }, uFinPh: { value: new Vector2() }, uFinK: { value: 1 }, uPupil: { value: 0.4 }, uRelief: { value: 1 }, uGroundY: { value: -1e3 },
    };
    this.skin = skinMaterial(this.uniforms, false);
    this.skinLow = skinMaterial(this.uniforms, true);
    this.fins = finMaterial(this.uniforms, false);
    this.finsLow = finMaterial(this.uniforms, true);
    this.eyes = eyeMaterial(this.uniforms, false);
    this.eyesLow = eyeMaterial(this.uniforms, true);
    this.viscera = visceraMaterial();
  }

  /** the sediment it lies in (linear colour): the sand on its skin */
  setCover(r: number, g: number, b: number): void { this.uniforms.uCover.value.setRGB(r, g, b); }

  dispose(): void {
    for (const m of [this.skin, this.skinLow, this.fins, this.finsLow, this.eyes, this.eyesLow, this.viscera]) m.dispose();
  }
}

/** the flat's sediments as the terrain draws them (Terrain.ts SUBSTRATE_COLORS) */
export const SUBSTRATE_TINT: Record<string, [number, number, number]> = {
  sand: [0.37, 0.37, 0.355], muddy_sand: [0.29, 0.285, 0.27], mud: [0.19, 0.185, 0.17],
  gravel: [0.33, 0.305, 0.27], channel: [0.15, 0.145, 0.135], rock: [0.3, 0.295, 0.28],
};
