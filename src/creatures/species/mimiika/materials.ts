import { Color, DoubleSide, FrontSide, Matrix3, MeshPhysicalMaterial, Vector2, Vector4, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { AMH_UNIFORMS, ENV_INJECT, HELPERS, SUN_INJECT } from '../amimehagi/materials';
import { EYE, FIN, Z_ROOT, lidFrame } from './anatomy';
import { ARM_THIN_T } from './rig';

/**
 * Materials of the ミミイカ: standard PBR (MeshPhysicalMaterial: wet clearcoat, iridescence for the iridophores) with
 * the skin worked in through onBeforeCompile, lit by the underwater light field shared with the other animals of the
 * flat (the sun's beam through the water with its extinction and caustics, Snell's window, the water's glow).
 *
 * The skin is computed where it is drawn, on the rest position in millimetres, so it has no texture and no seams:
 *  - chromatophores  three sets measured on the photographs: the copper set (uChroma.y), a mosaic of rounded
 *                    polygonal sacs, one to each Voronoi cell of the skin (0.85 mm on the mantle, 0.55 on the head,
 *                    0.42 over the eyes' domes, spots on the arms), a share of them a darker brown class, with dark
 *                    gaps and a broken golden net; small brown-black dots (uChroma.z) that hide under spread copper;
 *                    the yellow set (uChroma.x), topmost. A dot when contracted, filling its cell when spread; the
 *                    expansion modulated by a slowly drifting mottle (uChroma.w), the animal's own pattern (dorsal
 *                    more than ventral, finer stipple under the belly) and each organ's own pulse
 *  - iridophores     plates of reflecting cells: soft clumps of emerald-to-cobalt flakes on the eyes' domes, the
 *                    gold-green flecks of the flank's sheet (shown when the copper is withdrawn), silver-blue plates on
 *                    a few cells of the back, the silver belly band; their colour is emitted (fixed, measured hues)
 *  - eyes            the lid skin's dome with the head-fixed almond opening of the lids (LID_GLSL), its margin, fold
 *                    and crease; the ball (EYE_SURFACE) and the cornea's bubble (corneaMaterial) under it
 *  - tissue          translucent, pale and bluish where no pigment is spread; light passes through the thin parts
 *                    (fins, arm tips, the mantle's rim) and the viscera show faintly through the belly
 *  - suckers         two rows of small pale cups on the oral face of the arms, a pad of them on the tentacle clubs
 *  - sand            grains stuck in the mucus of the back (uSandCoat) and thrown over the head when it buries
 *                    (uHeadCover), sparing the eyes
 * The far tier (MM_LOW) keeps the colours and drops the organs and the iridescence. The mantle's ventilation and jet
 * (uMantle), the fins' waves (uFinAmp, uFinPh, uFinK), the filling of the head's funnel groove (uGrooveFill) and the
 * thinning of a stretched arm (uArmThin, about its rest axis aArm) are vertex deformations.
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
  /** the lids' opening (0 narrowed … 1 wide open) */
  uLid: IUniform<number>;
  /** how far the head's funnel groove is filled (the funnel swung out of it) */
  uGrooveFill: IUniform<number>;
  /** world → head frame (the rotation of J_head, inverted): the eyes' shaders find the head-fixed lids with it */
  uHeadFromWorld: IUniform<Matrix3>;
  /** the lid skin's mean colour (linear), for the far tier's balls */
  uLidCol: IUniform<Color>;
  uRelief: IUniform<number>;
  /** the sand's height under the animal (world y): a buried animal's sand coat fades into it */
  uGroundY: IUniform<number>;
  /** over what height (world m) the coat fades into the bed: 2.2 mm on the model, scaled with the animal (setScale) */
  uSandFade: IUniform<number>;
  /** the sand grains' size (model mm): ≈ 0.45 mm in the real animal whatever its size (setScale, sandGrain) */
  uGrain: IUniform<number>;
  /** per arm (ARMS order): its radius factor as it is stretched (rig.ts armThin; 1 at rest length) */
  uArmThin: IUniform<Float32Array>;
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
vec4 mmReticle(vec3 p, vec3 n, float cell, vec2 expand2, float fracB, float rk, float seed, float aa, float t) {
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
  // (a share fracB of the cells is the brown class, with its own expansion)
  float expand = mix(expand2.x, expand2.y, step(h1.y, fracB));
  float e = clamp(expand * (0.75 + 0.6 * h1.x) - 0.08 * h1.y + 0.04 * sin(t * (0.6 + h1.z) + h1.y * 6.283), 0.0, 1.0);
  float w = aa / cell + 0.02;
  // contracted: a dot (a little irregular); spread: the cell less a pale line, thinner the more it spreads
  float wob = 1.0 + 0.12 * sin(h1.y * 40.0 + f1 * 9.0);
  float r = mix(0.17 * rk, 0.62, e) * (0.75 + 0.5 * h1.z) * wob;
  float dot1 = 1.0 - smoothstep(r - w, r + w, f1);
  float border = f2 - f1;
  float line = mix(0.3, 0.07, e) * (0.75 + 0.5 * h1.x);
  float poly = smoothstep(line - w, line + w, border);
  // the corners of a spread sac are rounded: small three-cornered gaps where three cells meet (29)
  poly *= 1.0 - smoothstep(mix(0.68, 0.8, h1.z) - w, mix(0.68, 0.8, h1.z) + w, f1);
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

const LF = lidFrame();
const v3s = (a: number[]) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;
const PATCH_C = (() => {
  const c = [LF.A[0] + 1.6 * LF.U[0] - 0.4, LF.A[1] + 1.6 * LF.U[1], LF.A[2] + 1.6 * LF.U[2]], n = Math.hypot(...c);
  return c.map((x) => x / n);
})();
/**
 * The lids' opening, fixed in the head (the lids are head skin; the ball turns behind them), in the lids' frame of the
 * left eye (A the opening's axis, U up, F forward): an almond of two arcs, the upper lid arched, the lower flatter,
 * rounded corners, the front corner a little higher (photograph 19). About 0.56 × 0.36 of the globe by day (29, 16),
 * 0.48 × 0.12 narrowed (20), rounded and 0.63 × 0.53 wide open (26). s: stereographic position (≈ rad) on the eye, +x forward, +y up;
 * negative inside the opening.
 */
const LID_GLSL = /* glsl */ `
const vec3 mmLidA = ${v3s(LF.A)};
const vec3 mmLidU = ${v3s(LF.U)};
const vec3 mmLidF = ${v3s(LF.F)};
const vec3 mmPatchC = ${v3s(PATCH_C)};
float mmLidSdfS(vec2 s, float op) {
  s = mat2(0.99500, -0.09983, 0.09983, 0.99500) * s;
  float W = 0.56 + 0.16 * op, H = 0.24 + 0.92 * pow(op, 0.85);
  float Hu = 0.6 * H, Hl = 0.4 * H, yc = 0.5 * (Hl - Hu);
  float Ru = (W * W + Hu * Hu) / (2.0 * Hu), Rl = (W * W + Hl * Hl) / (2.0 * Hl);
  float du = length(s - vec2(0.0, yc + Hu - Ru)) - Ru;
  float dl = length(s - vec2(0.0, yc - Hl + Rl)) - Rl;
  float h = clamp(0.5 + 0.5 * (du - dl) / 0.06, 0.0, 1.0);
  return mix(dl, du, h) + 0.06 * h * (1.0 - h);
}
float mmLidSdf(vec3 n, float op) {
  return mmLidSdfS(vec2(dot(n, mmLidF), dot(n, mmLidU)) * 2.0 / (1.0 + max(dot(n, mmLidA), -0.95)), op);
}
`;

const SKIN_VERT_PARS = /* glsl */ `
attribute vec4 aSkin;   // part, t along, oral-ness, section centre y (mm)
attribute float aGroove; // the head's funnel groove: how far down to its unimprinted surface (m)
attribute vec4 aArm;    // an arm's rest axis under the vertex (m), arm index + 1 (0 off the arms)
uniform float uMantle;
uniform float uGrooveFill;
uniform float uArmThin[8];
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
// (the funnel swung out of its groove: the head's skin settles back)
transformed.y += aGroove * uGrooveFill * step(0.5, aSkin.x) * step(aSkin.x, 1.5);
{
  float ay = aSkin.w * 0.001;
  transformed.x *= mmS;
  transformed.y = ay + (transformed.y - ay) * mmS;
  // (a contracted mantle is a little longer: the muscle keeps its volume)
  transformed.z -= (mmS - 1.0) * mmW * 0.25 * (transformed.z + 0.003);
}
// a stretched arm thins about its own axis (before the skinning), from just beyond its base on the crown outwards
if (aArm.w > 0.5) {
  float th = mix(1.0, uArmThin[int(aArm.w - 0.5)], smoothstep(${f(ARM_THIN_T[0])}, ${f(ARM_THIN_T[1])}, aSkin.y));
  transformed = aArm.xyz + (transformed - aArm.xyz) * th;
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
uniform float uSandFade;
uniform float uGrain;
uniform float uLid;
uniform float uPupil;
const vec3 mmEye = vec3(${f(EYE.x)}, ${f(EYE.y)}, ${f(EYE.z - Z_ROOT)});
${LID_GLSL}
${NOISE}
// one jittered lattice of sand grains (cell: its size, mm): how much of the point a grain covers, and that grain's draws. A
// grain sticks once the coat's density passes its own threshold (lo + thr × a draw), and is the larger the denser the coat
float mmGrain(vec3 p, float cell, float off, float dens, float thr, float lo, out vec3 h) {
  vec3 q = p / cell + off;
  vec3 id = floor(q);
  h = mmH3(id);
  float r0 = 0.26 + 0.24 * dens;
  float g = 1.0 - smoothstep(r0, r0 + 0.14, length(q - id - 0.5 - (h - 0.5) * 0.7) * (0.8 + 0.5 * h.z));
  return g * smoothstep(lo + h.x * thr, lo + h.x * thr + 0.08, dens);
}
`;

/**
 * Colour, relief, roughness, the iridophores' film and the translucency of the skin; read again by the roughness,
 * normal, clearcoat / iridescence and emissive stages.
 */
const SKIN_SURFACE = /* glsl */ `
float mmBed = 0.0, mmFun = 0.0, mmBore = 0.0, mmRough = 0.5, mmCoat = 0.06, mmIr = 0.0, mmIrT = 0.5, mmThin = 0.0, mmHgt = 0.0, mmSand = 0.0, mmPig = 0.0, mmFlank = 0.0, mmEyeIr = 0.0, mmDome = 0.0, mmRim = 0.0, mmSil = 0.0, mmCut = 1.0, mmSpang = 0.0;
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
  // ---- the eye (photographs 11, 19, 20, 26, 29, 32): the dome of tight lid skin over the ball (socketPush) and the
  // lids' almond opening in it, fixed in the head (LID_GLSL); the ball and the cornea's bubble show through the opening
  vec3 eyeV = vec3(abs(p.x), p.y, p.z) - mmEye;
  float eyeL = length(eyeV);
  vec3 eyeN = eyeV / max(eyeL, 1e-3);
  float eyeD = eyeL / ${f(EYE.r + EYE.skin)};
  float eA = dot(eyeN, mmLidA);
  bool headP = part > 0.5 && part < 1.5;
  float dome = headP ? (1.0 - smoothstep(1.02, 1.09, eyeD)) * smoothstep(-0.25, 0.1, eA) : 0.0;
  float lidS = (headP && eyeL < 6.0) ? mmLidSdf(eyeN, uLid) : 9.0;
  // (the cut is antialiased: its coverage is applied last of all, and the pixel discarded there, SKIN_ALPHA)
  float fwL = clamp(fwidth(lidS), 1e-4, 0.1);
  mmCut = (headP && eyeD < 1.06) ? smoothstep(-0.5 * fwL, 0.5 * fwL, lidS) : 1.0;
#ifdef MM_LOW
  mmCut = 1.0;
#endif
  // the lid's margin (≈ 0.5 mm, 0.07 of the globe: 26, 29), the wet lip right at the opening (widened rather than lost
  // when it is finer than a pixel), the soft fold behind it, the crease where the globe leaves the head
  float margin = dome * (1.0 - smoothstep(0.0, 0.14, lidS));
  float ew = max(0.02, 1.5 * fwL);
  float edge = dome * (1.0 - smoothstep(0.0, ew, lidS)) * (0.02 / ew);
  float fold = dome * smoothstep(0.04, 0.08, lidS) * (1.0 - smoothstep(0.14, 0.26, lidS));
  float crease = headP ? smoothstep(1.008, 1.03, eyeD) * (1.0 - smoothstep(1.05, 1.16, eyeD)) * smoothstep(0.0, 0.3, eA) : 0.0;
  mmDome = dome;
  // (the head's net runs over the dome right up to the margin: no pale halo round the eye)
  D = max(D, 0.8 * dome);
  // ---- the tissue between the organs: glassy, lilac-grey on the back, silver-blue under the belly (12, 29, 62)
  vec3 base = mix(vec3(0.44, 0.46, 0.5), vec3(0.46, 0.42, 0.43), D);
  if (arm) base = mix(vec3(0.42, 0.34, 0.35), vec3(0.50, 0.34, 0.20), D);
  // the funnel: pale, faintly lilac, glassy flesh (photographs 20, 29)
  // lilac-grey (B > R > G), paler towards the opening (29: lip lin (0.19, 0.16, 0.24) beside head skin (0.085, 0.064, 0.07))
  if (funnel) { base = mix(vec3(0.21, 0.19, 0.25), vec3(0.23, 0.21, 0.28), smoothstep(0.45, 1.0, vSkin.y)); mmFun = 1.0; }
  // the viscera through the belly: a soft darker body in the mantle's middle (the ink sac, the gills)
  if (part < 0.5) base *= 1.0 - 0.15 * (1.0 - D) * exp(-pow((zn + 11.0) / 6.0, 2.0) - pow(p.x / 4.0, 2.0));
  // ---- the pattern's regions
  vec3 pp = p * 0.13 + uSeed * 11.0;
  float mott = mmF(pp + vec3(0.0, 0.0, t * 0.012));
  float blot = smoothstep(0.42, 0.72, mott);
  // the skin of the eye's dome round the opening, the front of the back (the golden saddle of 29)
  float eyeRing = headP ? exp(-pow((eyeD - 1.04) / 0.2, 2.0)) * smoothstep(0.0, 0.1, lidS) : 0.0;
  float saddle = part < 0.5 ? exp(-pow((zn + 4.0) / 5.0, 2.0)) * smoothstep(0.55, 0.95, D) : 0.0;
  float armT = arm ? vSkin.y : 0.0;
  // the eyes' reflecting patch: the upper face of each dome, about 60° above the opening's axis and tipped towards the
  // midline, down to the upper lid (7, 22, 33, 62, 68)
  float eyeZone = headP ? (1.0 - smoothstep(1.04, 1.22, eyeD)) * smoothstep(-0.2, 0.15, eA) : 0.0;
  float eyePatch = eyeZone * smoothstep(0.12, 0.22, lidS) * smoothstep(0.55, 0.9, dot(eyeN, mmPatchC));
  eyePatch = max(eyePatch, 0.7 * eyeZone * smoothstep(0.3, 0.7, dot(eyeN, mmLidF)) * smoothstep(0.12, 0.22, lidS) * (1.0 - smoothstep(0.5, 0.75, lidS)));
  float ePm = eyePatch;
  // the copper set (the mosaic) spreads on the back and the arms' outer faces, hardly under the belly
  float regM = part < 0.5 ? mix(0.15, 1.0, smoothstep(-0.02, 0.2, D)) : part < 1.5 ? mix(0.8, 1.05, D) * (1.0 - 0.45 * eyePatch) : arm ? mix(0.1, 1.0, D) * (1.0 - 0.35 * armT) : 0.3;
  float regB = part < 0.5 ? mix(0.25, 1.0, smoothstep(0.05, 0.45, D)) : part < 1.5 ? mix(0.85, 1.0, D) * (1.0 - 0.5 * eyePatch) : arm ? mix(0.5, 1.3, D) : 0.3;
  float eY = uChroma.x * mix(0.45, 1.0, D) * (1.0 + 0.6 * eyeRing + 0.4 * saddle);
  float eR = uChroma.y * regM * (1.0 - 0.3 * uChroma.w + 0.5 * uChroma.w * mott);
  float eB = uChroma.z * regB * (1.0 - 0.45 * uChroma.w + 0.9 * uChroma.w * blot);
  float paleK = arm ? 0.45 : 1.0;   // (the arms keep more of their spots)
  eY *= 1.0 - 0.1 * uPale; eR *= 1.0 - 0.5 * uPale * paleK; eB *= 1.0 - 0.6 * uPale * paleK;
  // (the lid's margin: fewer dark organs; its gold-green is the rim's own colour and film)
  eB *= 1.0 - 0.65 * margin; eR *= 1.0 - 0.3 * margin;
  // (a few organs on its base under the mantle; the free tube and the lip all but clear: 20, 26, 29)
  if (funnel) { float fo = (1.0 - step(0.5, vSkin.z)) * (1.0 - smoothstep(0.22, 0.32, vSkin.y)); eY *= 0.25 * fo; eR *= 0.2 * fo; eB *= 0.12 * fo; }
  if (sucker || lining) { eY = 0.0; eR = 0.0; eB = 0.0; }
  // (the rolled edge of the collar is paler: its organs thin out over the lip)
  eB *= 1.0 - 0.6 * lip; eR *= 1.0 - 0.4 * lip;
  // glassy when the pigment is withdrawn: the tissue scatters less (and lets the light through, SKIN_THIN)
  vec3 alb = base * (1.0 - 0.45 * uPale * (1.0 - 0.5 * float(funnel)));
  // the mosaic's cells, one lattice per part (counted against the body: 12-14 across the back in 7, 22-24 along the
  // mantle in 29): 0.85 mm on the mantle, 0.55 mm on the head, 0.42 mm over the eye's dome, the arms' spots 0.5 → 0.3 mm;
  // a share of them the brown class (the darker cells of 29, the blotches of 12, all of them plum in 32)
  float fracB = clamp(0.25 + 0.9 * (uChroma.z - 0.5 * uChroma.y), 0.2, 0.85);
  // (in the pale hovering dress the contracted organs are bright orange-red on an apricot ground: 17, 34)
  float kP = clamp(uPale / 0.45, 0.0, 1.0) * (1.0 - smoothstep(0.3, 0.6, eB));
  float eRm = arm ? min(eR, 0.55) : eR;
  vec2 ex = vec2(eRm, max(eB, 0.85 * eRm));
#ifndef MM_LOW
  // (under the belly the contracted organs shrink into fine stipple: 12, 26, 29)
  vec4 rM = part < 0.5 ? mmReticle(p, nR, 0.85, ex, fracB, mix(0.4, 1.0, smoothstep(0.0, 0.3, D)), 13.3, aa, t)
                       : mmReticle(p, nR, arm ? mix(0.5, 0.3, armT) : mix(0.55, 0.42, dome), ex, arm ? 0.6 : fracB, 1.0, 21.7, aa, t);
  vec2 oB = mmOrgans(p, nR, 0.36, 0.07, arm && vSkin.z > 0.0 ? 0.15 : mix(0.22, 0.42, D), arm && vSkin.z > 0.0 ? eB * 0.3 : eB, 7.7, aa, t);
  vec2 oY = mmOrgans(p, nR, 0.3, 0.07, 0.34, eY, 3.1, aa, t);
  float cM = rM.x, cB = oB.x, cY = oY.x;
  // (the free funnel and its lip carry no organs at all: 20, 26, 29)
  if (funnel) { float fk = 1.0 - smoothstep(0.22, 0.32, vSkin.y); cM *= fk; cB *= fk; cY *= fk; }
  float isBr = step(rM.z, arm ? 0.6 : fracB);
  // (the small dark organs hide under a spread copper sac: no dots on the cells of 29, 22, 7; over them in 20, 68)
  cB *= 1.0 - 0.75 * cM * (1.0 - smoothstep(0.6, 1.0, eB));
  // a spread sac is thin and copper; contracted, its pigment is dense and rust-red; each organ its own shade
  vec3 colM = mix(mix(vec3(0.13, 0.03, 0.02), vec3(0.28, 0.06, 0.022), kP), vec3(0.17, 0.05, 0.02), smoothstep(0.2, 0.9, rM.w)) * (0.85 + 0.3 * rM.z);
  vec3 colB = mix(vec3(0.028, 0.012, 0.010), vec3(0.036, 0.011, 0.022), D * smoothstep(0.4, 1.0, eB)) * (0.8 + 0.4 * oB.y);
  vec3 colY = mix(vec3(0.66, 0.42, 0.10), vec3(0.58, 0.32, 0.07), oY.y);
  // the brown class: dark maroon-brown (12's blotches without the tank's blue), darker cells among the copper (29)
  // (in the copper dress they are only a shade darker than their neighbours; the dark set brings them out)
  vec3 colBr = mix(mix(vec3(0.05, 0.026, 0.024), vec3(0.08, 0.035, 0.026), smoothstep(0.2, 0.9, rM.w)), vec3(0.05, 0.018, 0.035), smoothstep(0.7, 1.0, eB));
  colM = mix(colM, colBr * (0.85 + 0.3 * rM.z), isBr * (0.35 + 0.65 * smoothstep(0.2, 0.8, eB)));
  // (the belly's stipple greyer and darker)
  if (part < 0.5) colM = mix(colM, vec3(0.06, 0.045, 0.042), 0.6 * (1.0 - smoothstep(0.0, 0.3, D)));
#else
  float cM = clamp(eR * 0.78, 0.0, 0.85), cB = clamp(eB * 0.3, 0.0, 0.8), cY = clamp(eY * 0.2, 0.0, 0.4);
  vec4 rM = vec4(cM, 0.0, 0.5, eR);
  vec3 colM = mix(vec3(0.13, 0.03, 0.02), vec3(0.17, 0.058, 0.03), clamp(eR, 0.0, 1.0));
  vec3 colB = vec3(0.03, 0.012, 0.014), colY = vec3(0.62, 0.37, 0.085);
  colM = mix(colM, vec3(0.07, 0.037, 0.032), fracB * 0.6);
#endif
  // under a spread dark set the copper turns maroon-plum (32, 61, 68)
  colM = mix(colM, vec3(0.085, 0.022, 0.03), 0.75 * smoothstep(0.5, 1.0, eB) * D);
  // the gaps: the tissue tinted by the stretched rims of the organs round them
  float spread = smoothstep(0.3, 0.9, eR) * mix(0.3, 1.0, smoothstep(0.0, 0.3, D));
  alb = mix(alb, mix(vec3(0.07, 0.03, 0.022), vec3(0.045, 0.016, 0.035), smoothstep(0.6, 1.0, eB)), 0.95 * spread);
  // the yellow set: a few organs in the gaps, an orange cast over the copper (the golden net: below, topmost)
  alb = mix(alb, colY, clamp(cY * mix(0.45, 0.12, spread) + kP * (0.35 * cY + 0.25 * clamp(eY, 0.0, 1.0)) * (1.0 - spread), 0.0, 0.85));
  alb = mix(alb, colM * mix(vec3(1.0), vec3(1.1, 0.95, 0.6), cY * 0.6), cM);
  alb = mix(alb, colB, cB * 0.95);
  // fully dark (the startle, a dark bottom): the dark set floods the back
  float deep = smoothstep(1.0, 1.3, eB) * D;
  alb = mix(alb, vec3(0.022, 0.009, 0.016), deep * 0.9);
#ifndef MM_LOW
  {
    // the golden net, topmost (the yellow organs are the outermost layer): broken dashes along the cells' borders,
    // 30-50 % of their length, brightest on the saddle and round the eye (29); kept in the dark dress with gold dust
    // (61, 66, 67), lost in the startle's flood
    float dash = smoothstep(0.55, 0.68, mmN(p * 2.6 + uSeed * 7.0));
    float gold = rM.y * rM.y * dash * clamp(eY, 0.0, 1.0) * (0.08 + 0.9 * saddle + 0.6 * eyeRing) * (1.0 - smoothstep(0.7, 0.95, eB));
    alb = mix(alb, vec3(0.72, 0.46, 0.15), clamp(gold, 0.0, 1.0) * 0.9);
    // the dark dress's gold dust: a few yellow organs over the flood (67)
    alb = mix(alb, vec3(0.6, 0.4, 0.1), smoothstep(0.55, 0.8, cY) * step(0.6, fract(oY.y * 7.0)) * 0.8 * smoothstep(1.0, 1.3, eB));
  }
#endif
  // the arms in the copper dress: a chocolate wash over their spots (29)
  if (arm) alb = mix(alb, colM * 0.8, (0.6 * smoothstep(0.7, 1.0, eR) * D + 0.3 * smoothstep(0.8, 1.0, uChroma.y) * (1.0 - D)) * (1.0 - 0.5 * armT));
  mmPig = max(max(cB, deep * 0.8), cM * 0.85);
  cB = max(max(cB, deep * 0.8), cM * 0.6);
#ifndef MM_LOW
  // the upper lid carries a row of large, translucent brown discs (≈ 0.9 mm), the silver ball between them (32, 33)
  float band = dome * smoothstep(0.1, 0.16, lidS) * (1.0 - smoothstep(0.38, 0.5, lidS)) * smoothstep(0.1, 0.4, dot(eyeN, mmLidU));
  if (band > 0.01) {
    vec2 oL = mmOrgans(p, nR, 0.95, 0.12, 0.42, uChroma.y * band, 41.0, aa, t);
    alb = mix(alb, vec3(0.2, 0.1, 0.075), 0.7 * oL.x);
    mmPig = max(mmPig, 0.45 * oL.x);
  }
#endif
  float net = rM.y;
  // the lid's margin: a tan-gold rim (26, 19), its wet lip catching the light (32, 12); darker where the globe leaves
  // the head (29)
  alb = mix(alb, vec3(0.42, 0.26, 0.11), 0.6 * margin * (1.0 - edge));
  alb = mix(alb, vec3(0.78, 0.76, 0.70), 0.65 * edge);
  alb *= 1.0 - 0.3 * crease;
  // the lining of the mantle cavity: pale, wet, darker the deeper into the cavity (the light reaches it through the gap)
  if (lining) alb = vec3(0.62, 0.52, 0.5) * mix(0.25, 0.85, smoothstep(${f(-6.2)}, ${f(-0.5)}, zn));
  // the suckers: pale, translucent cups, the rim brighter, the hollow shadowed
  if (sucker) {
    alb = mix(vec3(0.55, 0.49, 0.48), vec3(0.68, 0.63, 0.6), step(0.5, vSkin.z) * step(vSkin.z, 1.5));
    alb = mix(alb, vec3(0.34, 0.24, 0.22), step(1.5, vSkin.z));
  }
  // ---- iridophores: plates of reflecting cells under (and, over the eyes, among) the chromatophores
  float plate = 0.0, plateH = 0.5, eyePl = 0.5;
#ifndef MM_LOW
  {
    // a mosaic of plates 0.3 mm across, each its own brightness and film
    vec3 q = p / 0.3 + 17.0;
    vec3 b = floor(q - 0.5);
    float f1 = 9.0, f2 = 9.0; vec3 hh = vec3(0.5);
    for (int k = 0; k < 8; k++) {
      vec3 id = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
      vec3 h = mmH3(id);
      vec3 dq = q - (id + 0.5 + (h - 0.5) * 0.7);
      float d = length(dq - nR * dot(dq, nR));
      if (d < f1) { f2 = f1; f1 = d; hh = h; } else if (d < f2) f2 = d;
    }
    // each plate a core inside its cell (dark gaps between), most of them dim, a few bright
    float core = smoothstep(0.1, 0.26 + aa / 0.3, f2 - f1);
    plate = core * (0.12 + 0.88 * hh.x * hh.x * hh.x) * 1.6;
    eyePl = core * (0.35 + 0.65 * hh.x * sqrt(hh.x));
    plateH = hh.y;
    plate = mix(plate, 0.35, smoothstep(0.1, 0.3, aa));
  }
#else
  plate = 0.35; eyePl = 0.16;
#endif
  // spangles on the back: one plate in five, in the gaps (61, 67, 32)
  float spang = step(0.8, fract(plateH * 7.3)) * plate * (1.0 - cM) * (1.0 - cB) * D * (part < 1.5 ? 1.0 : 0.3) * (1.0 - 0.8 * spread * (1.0 - smoothstep(0.6, 1.0, eB)));
#ifndef MM_LOW
  if (ePm > 0.01) {
    // the eye's reflecting plates: soft clumps of flakes (≈ 0.4 mm) on a dark ground (7, 22)
    vec3 q = p / 0.4 + 5.0;
    vec3 b = floor(q - 0.5);
    float f1 = 9.0, f2 = 9.0; vec3 hh = vec3(0.5);
    for (int k = 0; k < 8; k++) {
      vec3 id = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
      vec3 h = mmH3(id);
      vec3 dq = q - (id + 0.5 + (h - 0.5) * 0.7);
      float d = length(dq - nR * dot(dq, nR));
      if (d < f1) { f2 = f1; f1 = d; hh = h; } else if (d < f2) f2 = d;
    }
    eyePl = smoothstep(0.0, 0.45 + aa / 0.4, f2 - f1) * (0.35 + 0.65 * smoothstep(0.3, 0.7, mmN(p * 1.3 + 9.0)));
    // (finer than the pixel: their mean)
    eyePl = mix(eyePl, 0.45, smoothstep(0.12, 0.4, aa));
    plateH = hh.z;
  }
#endif
  eyePatch *= eyePl;
  // the flank's sheet (12): flecks on the upper middle of the flank, under the chromatophores
  float flank = (part < 0.5 ? 1.0 : 0.0) * exp(-pow((zn + 5.0) / 3.8, 2.0)) * exp(-pow((nR.y - 0.15) / 0.42, 2.0)) * smoothstep(0.2, 0.5, mmF(p * 0.15 + 3.0 + uSeed));
  // (it shows over and between the spots of the grey dress, 12, but not under the spread copper, 29, 7, 22)
  flank *= (1.0 - 0.85 * spread) * (1.0 - 0.3 * cB) * (0.45 + 0.55 * smoothstep(0.15, 0.6, plate));
  // cell spangles (7): a few whole cells of the mosaic on the front and middle of the back carry silver-blue plates
  float cs = part < 0.5 ? step(0.94, fract(rM.z * 13.7)) * exp(-pow((zn + 8.0) / 5.0, 2.0)) * smoothstep(0.7, 0.95, D) : 0.0;
  // the chromatophores lie over the flank's sheet and the spangles; over the eyes the plates lie among them
  mmIr = (0.9 * spang + 1.1 * flank + (part < 0.5 ? 0.25 * smoothstep(-0.45, -0.75, nR.y) : 0.0)) + 1.8 * eyePatch * (1.0 - 0.3 * cB) + 0.35 * margin * (1.0 - edge) + 1.2 * cs * mix(0.6, 1.0, min(plate, 1.0));
  if (arm) mmIr = 0.2 * spang;
  mmIr *= uIrid;
  // the film: blue-green to teal over the eyes, gold-green on the flank, the spangles the animal's own hue
  // (the eye patch's hue in regions, emerald to cobalt, not per flake)
  mmIrT = ePm > 0.05 ? 0.5 * clamp(0.25 + 0.45 * mmN(vec3(abs(p.x), p.y, p.z) * 0.7 + uSeed * 5.0) + 0.2 * (plateH - 0.5), 0.0, 1.0) : flank > 0.05 ? 0.55 + 0.15 * plateH : fract(uSeed * 3.7) * 0.5 + 0.2 * plateH;
  mmSpang = cs;
  mmFlank = flank;
  mmEyeIr = eyePatch;
  // (the margin's ring of reflecting cells: gold-green face on, teal when grazing: 29, 61)
  mmRim = margin * (1.0 - edge);
  // (the silver only on the belly's band, the lowest 12-20 % of a side view: 26, 29)
  mmSil = part < 0.5 ? smoothstep(-0.45, -0.75, nR.y) : 0.0;
  // (over the eye's patch the chromatophores thin out to a dark ground under its flecks: 7)
  alb = mix(alb, vec3(0.03, 0.028, 0.02), 0.85 * ePm);
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
  mmThin = arm ? 0.35 + 0.55 * vSkin.y : funnel ? (vSkin.z > 1.5 ? 0.15 : vSkin.z > 0.5 ? 0.4 : 0.45) : sucker ? 0.45 : lining ? 0.1 : 0.12 * (1.0 - D) + 0.25 * lip;
  // the funnel's opening: the thick lip paler, the bore going dark within a millimetre
  // the opening: the thick rounded lip palest, lilac (29: B/G 1.4); in the bore the lit tan floor and the dark roof
  // (29: floor 0.6, roof 0.38 of the lip), dark deep inside (bore rows carry 0 the floor … 1 the roof in vSkin.y)
  if (funnel && vSkin.z > 0.5) {
    if (vSkin.z < 1.5) alb = vec3(0.27, 0.23, 0.33);
    else {
      mmBore = 1.0;
      alb = mix(vec3(0.32, 0.215, 0.21), vec3(0.17, 0.116, 0.137), vSkin.y) * mix(1.0, 0.1, smoothstep(0.2, 0.9, vSkin.w));
    }
  }
  // a fine relief of the organs and the skin; the raised fold of the lids (≈ 0.43 mm wide), the crease round the globe
  mmHgt += 0.02 * cB + 0.012 * (mmN(p * 3.0) - 0.5);
  mmHgt += 0.10 * fold - 0.05 * crease;
  // (the skin pulled tight over the globe glistens)
  mmRough = mix(mix(0.52, 0.56, cB), 0.34, dome);
  mmCoat = mix(mmCoat, mix(0.4, 0.2, ePm), dome);
  // (inside the tube: matt, no gleam)
  if (mmBore > 0.5) { mmIr = 0.0; mmCoat = 0.0; mmRough = 0.75; }
  // ---- sand: grains in the mucus of the back, and thrown over the head (not over the eyes)
  {
    // single grains on three jittered lattices (coarse, medium, fine); each sticks once the local cover passes its own
    // random threshold and grows as the coat thickens: a sprinkle on the bare skin while it strokes (46), then dense
    // grains with the skin only in small gaps once it lies buried (21); never a smooth layer
    // patches: the coat is laid by strokes, a cap or band of grains across the head first (18)
    float lay = mmN(p * 0.55 + 9.0) * 0.65 + mmN(p * 2.1 + 3.0) * 0.35;
    float back = D * (part < 0.5 ? 1.0 : part < 1.5 ? 0.85 : 0.0);
    float head = D * (part < 1.5 ? smoothstep(-6.0, 1.0, zn) : 0.0) * smoothstep(0.05, 0.25, lidS);
    // (the cap: a band over the top of the head and the eyes' upper rims, 18)
    float cap = headP ? exp(-pow((zn - 0.5) / 2.2, 2.0)) * smoothstep(0.35, 0.6, mmN(p * 0.9 + 21.0)) : 0.0;
    // (glue cells only at the arms' bases: none on the outer three quarters of the dorsal arms, Singley 1982)
    if (arm) { float ab = 1.0 - smoothstep(0.08, 0.25, vSkin.y); back = 0.6 * D * ab; head = 0.5 * D * ab; cap = 0.0; }
    // (the domes stay almost clear of sand, even buried: 16)
    float clearEye = mix(1.0, 0.25 * smoothstep(0.1, 0.4, lidS), dome);
    // (low on its sides too, the sand of the bed heaped against it: a mound with no clean edge, 21)
    float hb = vWPos.y - uGroundY;
    float heap = (1.0 - smoothstep(0.0, 3.0 * uSandFade, hb)) * step(part, 1.5) * (1.0 - dome);
    float cover = max(max(back, 0.9 * heap) * uSandCoat, head * uHeadCover * (1.0 + 0.4 * cap)) * clearEye;
    // (buried, the front of the head between the two domes stays bare copper, 16; its top takes the cap, 18)
    float strip = float(headP) * smoothstep(1.0, 3.0, zn) * exp(-pow(p.x / 3.0, 2.0));
    cover *= 1.0 - 0.75 * strip;
    float c = cover * (0.75 + 0.5 * lay);
    // how thick the coat lies here: the grains' share of the skin, ≈ 0.85 where it is complete
    float dens = smoothstep(0.3, 1.1, c);
    vec3 h, h2, h3;
    float s1 = mmGrain(p, uGrain, 51.0, dens, 0.9, 0.0, h);
    float s2 = mmGrain(p, uGrain * 0.62, 13.0, dens, 0.9, 0.1, h2);
    float s3 = mmGrain(p, uGrain * 0.4, 87.0, dens, 0.6, 0.35, h3);
    // the finest silt between the grains where it lies thickest, never opaque: the skin shows (21)
    float film = 0.15 * smoothstep(0.9, 1.25, c);
    // (finer than a pixel: the grains' mean cover, not a shimmer)
    float far = smoothstep(0.35, 0.9, aa / uGrain);
    float g = max(max(s1, s2), s3);
    mmSand = mix(max(g, film), clamp(0.9 * pow(dens, 1.4) + film, 0.0, 0.92), far);
    // each grain its own colour: grey and tan quartz, a few pale shell bits and dark grains (21, 46)
    vec3 hc = s1 >= max(s2, s3) ? h : s2 >= s3 ? h2 : h3;
    float fineN = mmN(p * 4.3) * 0.6 + mmN(p * 9.1) * 0.4;
    float br = hc.y < 0.12 ? 0.42 : hc.y > 0.86 ? 1.45 : 0.78 + 0.4 * hc.y;
    vec3 sand = uCover * mix(1.0, br, 1.0 - far) * (0.92 + 0.12 * fineN);
    sand = mix(sand, sand * vec3(1.1, 0.97, 0.8), step(0.6, hc.z) * (1.0 - far));
    sand = mix(sand, uCover * 0.8, (1.0 - g) * film / 0.15 * 0.6);
    // where it meets the bed the sand banks up against it (40-42, 21): the bed's own colour and light, its upper edge
    // ragged, so that the mound runs out into the sand round it with no line (not the bare strip of the head's front)
    float bank = (1.0 - smoothstep(0.0, uSandFade * (0.3 + 0.6 * lay), hb)) * smoothstep(0.3, 0.8, uSandCoat) * step(part, 1.5) * (1.0 - dome) * (1.0 - strip);
    sand = mix(sand, uCover * (0.92 + 0.12 * fineN), bank * (1.0 - g));
    mmSand = max(mmSand, bank);
    mmBed = bank * (1.0 - smoothstep(0.0, uSandFade * 0.6, hb) * 0.5);
    alb = mix(alb, sand, mmSand);
    mmRough = mix(mmRough, 0.9, mmSand);
    mmCoat *= 1.0 - mmSand;
    mmIr *= 1.0 - mmSand;
    // (the grains stand out of the mucus: a rough, broken surface, not a glaze)
    mmHgt += (0.06 + 0.06 * dens) * g * (1.0 - far) + 0.01 * film * fineN;
  }
  diffuseColor.rgb = alb * uTint;
  // glassy tissue: where no pigment is spread the background shows through (most in the pale, hunting dress)
  // a living bobtail is glassy: between the chromatophores the tissue lets most of the light through (more in the
  // pale dress, at the arm tips and the mantle's thin rim); the viewing angle is added in SKIN_THIN
  // (the mantle and head are a muscular wall: milky and see-through in the pale dress, hardly at all when the copper
  // is spread; the arms stay glassy)
  float clear = (arm ? (vSkin.z > 0.0 ? 0.5 : 0.42) + 0.4 * uPale : 0.16 + 0.5 * uPale + (part < 0.5 ? 0.12 * (1.0 - D) : 0.0)) * (1.0 - 0.9 * spread) * (1.0 - mmPig) * (1.0 - mmPig) * (1.0 - mmSand) * (funnel ? (vSkin.z > 1.5 ? 0.0 : vSkin.z > 0.5 ? 0.2 : 1.0) : lining ? 0.3 : 1.0) * (arm ? 1.0 + 0.3 * vSkin.y : 1.0);
  // (the funnel stays mostly opaque: its lilac must read against the brown flank behind it, 20, 29)
  if (funnel) clear = min(clear, 0.3);
  // (darker in the dark dresses: a dark violet rim in 32)
  if (funnel && mmBore < 0.5) diffuseColor.rgb *= mix(1.0, 0.45, smoothstep(0.85, 1.05, min(uChroma.y, uChroma.z)));
  // the skin of the eye's bulge is as opaque as the head's, but over the ball the thin lid lets its silver show between
  // the organs (32, 33, 62, 68); the gold gaps stay opaque (29)
  float bulge = headP ? smoothstep(1.7, 1.3, eyeL / ${f(EYE.r)}) : 0.0;
  clear = mix(clear * (1.0 - bulge), min(clear, mix(0.25, 0.5, smoothstep(0.2, 0.4, uPale))) * (1.0 - 0.8 * cY), dome);
  diffuseColor.a = 1.0 - clamp(clear, 0.0, 0.85);
}
`;

const SKIN_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
// (where the mound meets the bed its sand is lit as the bed is: facing up)
normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), mmBed));
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
  vec3 tissue = diffuseColor.rgb * mix(vec3(1.1, 0.88, 0.8), vec3(1.0, 0.94, 1.04), mmFun) * (1.0 - 0.95 * mmPig);
  // (no light comes through into the funnel's bore)
  float k = (0.1 + 0.4 * mmThin + 0.22 * uPale) * (1.0 - mmSand) * (1.0 - 0.9 * mmBore);
  totalEmissiveRadiance += tissue * amUnderwater(-nW, 1.0) * k;
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += tissue * amSunCol() * amSunThrough() * back * (0.03 + 0.25 * mmThin) * (1.0 - mmSand) * (1.0 - mmBore);
  // (the iridophores reflect structurally: a little of their colour whatever the light's direction)
  // (vW runs from the eye to the surface: the facing term and the reflection use it that way round)
  float cv = clamp(-dot(nW, vW), 0.0, 1.0);
  // translucent sac: seen face on the light passes through one thin wall, at the silhouette through a long path of
  // tissue — clear in the middle, milky towards the outline
  diffuseColor.a = mix(1.0, diffuseColor.a, pow(cv, 0.7) * (1.0 - mmSand));
  // the hues of the photographs: teal-green to blue over the eyes (7, 22, 61, 12), gold-green on the flank (12), the
  // back's spangles gold-green or blue-violet (the animal's own), the belly silver; the hue drifts a little with the angle
  float sh = (1.0 - cv) * 0.35;
  // (each eye fleck its own hue: about 55 % teal-green, 35 % blue, 10 % gold, 7; bluer seen obliquely)
  float eh = clamp(mmIrT * 2.0 + 0.25 * sh, 0.0, 1.0);
  vec3 eyeC = eh < 0.55 ? vec3(0.05, 0.55, 0.3) : eh < 0.95 ? vec3(0.03, 0.42, 0.85) : vec3(0.6, 0.5, 0.1);
  // (the flank's flecks drift gold → green → pink across the sheet, 12)
  float fhh = fract((mmIrT - 0.55) * 20.0 + 0.3 * sh);
  vec3 flankC = fhh < 0.4 ? vec3(0.85, 0.78, 0.35) : fhh < 0.75 ? vec3(0.4, 0.85, 0.4) : vec3(0.8, 0.45, 0.55);
  vec3 spC = mix(vec3(0.75, 0.80, 0.30), vec3(0.45, 0.35, 0.95), step(0.5, fract(uSeed * 3.7)));
  vec3 film = mmEyeIr > 0.02 ? eyeC : mmFlank > 0.05 ? flankC : spC;
  // (the cell spangles of the back: silver-blue-violet plates over whole cells, 7)
  film = mix(film, vec3(0.55, 0.6, 0.95), step(0.05, mmSpang));
  film = mix(film, vec3(0.78, 0.84, 0.95), mmSil * (1.0 - step(0.05, mmFlank)));
  film = mix(film, mix(vec3(0.62, 0.66, 0.24), vec3(0.1, 0.62, 0.55), sh * 2.0), mmRim);
  // (iridophores are stacks of thin plates: they send coloured light back over a broad cone, not only as a mirror)
  vec3 lightIn = amUnderwater(reflect(vW, nW), 0.3) * 0.7 + amUnderwater(nW, 1.0) * 0.6 + amSunCol() * amSunThrough() * 0.12;
  totalEmissiveRadiance += film * mmIr * lightIn * (0.45 + 0.5 * pow(1.0 - cv, 2.0));
  // the two big reflecting sheets the photographs show from every side: gold-green down the front of the mantle's
  // flank (12), blue-green over the eyes (3, 6, 7, 22); a rainbow drifting over them with the angle
  vec3 sheet = mmFlank * flankC;
  // the eyes' plates: bright structural colour from the water's light (7, 22: plates 0.2–0.5 linear in green)
  totalEmissiveRadiance += eyeC * mmEyeIr * uIrid * (1.0 - mmSand) * (amUnderwater(nW, 1.0) * 2.4 + lightIn * 1.2);
  totalEmissiveRadiance += sheet * uIrid * (1.0 - mmSand) * (amUnderwater(nW, 1.0) * 1.4 + lightIn * 0.8);
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
  gl_FragColor = vec4((max(gl_FragColor.rgb - spec, 0.0) * a0 + spec) / max(a1, 1e-3), a1 * mmCut);
  // (the lids' opening: after every derivative has been taken)
  if (gl_FragColor.a < 0.004) discard;
}
`;

function skinMaterial(u: MmUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.5, clearcoat: low ? 0.25 : 0.35, clearcoatRoughness: 0.24, side: FrontSide, transparent: true, depthWrite: true,
    iridescence: low ? 0 : 1, iridescenceIOR: 1.55, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 720, specularIntensity: 0.2, ior: 1.2,
  });
  m.name = low ? 'MimiikaSkinLOD2' : 'MimiikaSkin';
  // (skin against water: a relative index of only 1.05-1.2, a faint sheen)
  m.envMapIntensity = 0.1;
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
  material.iridescence = clamp(mmFlank, 0.0, 1.0) * 0.8;
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
  m.customProgramCacheKey = () => (low ? 'mimiika-skin-low-v5' : 'mimiika-skin-v5');
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
  float eY = uChroma.x * 0.3;
#ifndef MM_LOW
  float cB = mmOrgans(p, nF, 0.9, 0.05, 0.15, eB, 21.0, aa, t).x;
  float cR = mmOrgans(p, nF, 0.8, 0.06, 0.17, eR, 25.0, aa, t).x;
  float cY = mmOrgans(p, nF, 1.1, 0.06, 0.14, eY, 29.0, aa, t).x;
#else
  float cB = eB * 0.05, cR = eR * 0.06, cY = eY * 0.08;
#endif
  vec3 col = vec3(0.5, 0.47, 0.47);
  // (an orange-gold tint near the base, 66; the fleshy base strip takes the mantle's dress)
  col = mix(col, vec3(0.7, 0.48, 0.25), 0.35 * near * uChroma.x);
  col = mix(col, vec3(0.15, 0.05, 0.025), (1.0 - smoothstep(0.0, 0.12, v)) * smoothstep(0.3, 0.9, uChroma.y));
  col = mix(col, vec3(0.7, 0.34, 0.07), cY * 0.9);
  col = mix(col, vec3(0.30, 0.09, 0.045), cR * 0.9);
  col = mix(col, vec3(0.03, 0.013, 0.012), cB * 0.95);
  float alpha = 0.1 + 0.85 * max(cB, cR * 0.9) + 0.3 * cY + 0.1 * near * near;
  // the fleshy base, the clear, slightly thickened rim
  alpha = mix(alpha, 0.9, 1.0 - smoothstep(0.0, 0.1, v));
  alpha = max(alpha, 0.18 * exp(-pow((v - 0.985) / 0.02, 2.0)));
  // a clear membrane face on, milky towards its outline (26, 17, 19): not a veil over the flank where it lies folded
  alpha += 0.06 * pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 4.0);
  // sand on the fins of a buried animal
  // (grains, jittered like the skin's, not squares)
  vec3 sq = p / uGrain + 51.0, sid = floor(sq), sh3 = mmH3(sid);
  float grain = 1.0 - smoothstep(0.22, 0.42, length(sq - sid - 0.5 - (sh3 - 0.5) * 0.7) * (0.8 + 0.5 * sh3.z));
  float sand = smoothstep(0.3, 0.6, uSandCoat) * grain * step(0.35, sh3.x) * 0.8;
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
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.4, clearcoat: low ? 0 : 0.12, clearcoatRoughness: 0.2, transparent: true, depthWrite: false, side: DoubleSide });
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
      .replace('#include <common>', `#include <common>\nvarying vec3 vFin;\nvarying vec3 vRest;\nuniform vec3 uTint;\nuniform vec4 uChroma;\nuniform float uPale;\nuniform float uSeed;\nuniform float uSandCoat;\nuniform float uGrain;\nuniform vec3 uCover;\n${NOISE}`)
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
  totalEmissiveRadiance += diffuseColor.rgb * mfThin * ((amUnderwater(nW, 1.0) + amUnderwater(-nW, 1.0)) * 0.04 + amSunCol() * amSunThrough() * back * 0.12);
}`);
  };
  m.customProgramCacheKey = () => (low ? 'mimiika-fin-low-v3' : 'mimiika-fin-v3');
  return m;
}

// ------------------------------------------------------------------ eyes

/**
 * The eyeball (photographs 15, 19, 20, 26, 29, 32, 33, 47): its iris a warm silver reflector (the argentea) of very
 * fine radial fibres, a dark pigmented arch just above the pupil, a brighter fold under it, the pupil's margin the
 * brightest line; seen as the light it mirrors: silver-white towards Snell's window, grey-green towards the water, warm
 * beige towards the sand. The pupil a thin arched slit by day (uPupil 0), a bar, then a broad oval with a notch below in
 * the dark. Where the lids cover it (head-fixed: uHeadFromWorld, LID_GLSL) the ball is shaded; the cornea is its own
 * bubble (corneaMaterial). Eye_R is mirrored (scale.x −1), so +x of the uv is forward on both eyes.
 */
const EYE_SURFACE = /* glsl */ `
float meRough = 0.3, meIr = 0.0, meIrT = 380.0, mePup = 0.0, meMetal = 0.0, meSil = 0.0;
{
  vec2 q = (vUv - 0.5) * 6.28318;
  vec2 e = vec2(-q.x, q.y);
  float th = length(e), az = atan(e.y, e.x), u = clamp(uPupil, 0.0, 1.0);
  // the pupil: day slit (32, 33) → bar (20, 19) → broad notched oval (26, 34)
  float pa = mix(0.15, 0.36, u), pb = mix(0.014, 0.25, pow(u, 1.4));
  vec2 pq = e - vec2(0.02 * (1.0 - u), -0.01);
  float xn = clamp(pq.x / pa, -1.0, 1.0);
  pq.y -= 0.035 * (1.0 - smoothstep(0.0, 0.6, u)) * (1.0 - xn * xn);
  pq.y -= 0.2 * pb * smoothstep(0.45, 0.9, u) * exp(-pow(pq.x / (0.32 * pa), 2.0)) * step(pq.y, 0.0);
  float pd = length(pq / vec2(pa, pb)), sd = (pd - 1.0) * pb;
  float w = max(fwidth(e.y), 1e-4);
  mePup = 1.0 - smoothstep(-0.7 * w, 0.7 * w, sd);
  // (a slit thinner than a pixel keeps its share of dark)
  mePup = max(mePup, clamp(2.0 * pb / (1.5 * w), 0.0, 1.0) * (1.0 - smoothstep(0.0, 1.2 * w, abs(pq.y))) * (1.0 - smoothstep(0.85, 1.0, abs(pq.x) / pa)));
  // the iris
  float arch = (1.0 - smoothstep(0.7, 1.05, length((e - vec2(0.0, pb + 0.065)) / vec2(1.25 * pa + 0.04, 0.1)))) * (1.0 - 0.7 * u);
  float fold = exp(-pow((e.y + pb + 0.12 - 0.35 * e.x * e.x) / 0.05, 2.0)) * (1.0 - smoothstep(0.25, 0.42, abs(e.x)));
  float coll = exp(-pow(max(sd, 0.0) / 0.03, 2.0)) * (1.0 - mePup) * (1.0 + 0.3 * step(0.0, pq.y));
  float Fz = az * 20.3718;   // 128 fibres
  float dF = 20.3718 * length(fwidth(e)) / max(th, 1e-3);   // (analytic: atan's seam would show)
  float fib = (0.86 + 0.28 * mmH(vec3(floor(Fz), 3.1, 7.7))) * (0.82 + 0.18 * cos(6.28318 * fract(Fz)));
  // (a fine fringe close to the pupil, faint further out: 32)
  fib = mix(1.0, fib, 0.7 * (1.0 - smoothstep(0.3, 0.8, dF)) * smoothstep(0.02, 0.08, sd) * (0.25 + 0.75 * (1.0 - smoothstep(0.12, 0.35, sd))));
  // (a darker mirror than it looks under a flash: grey-olive in the water's light, 20, 26, 29; silver under a torch, 32)
  vec3 iris = mix(vec3(0.5, 0.48, 0.4), vec3(0.2, 0.15, 0.11), 0.8 * arch) * (1.0 + 0.18 * fold) * fib;
  // (the lower half brighter than the upper: 15, 26, 32, 47)
  iris *= mix(1.12, 0.8, smoothstep(-0.45, 0.4, e.y));
  iris = mix(iris, vec3(0.93, 0.92, 0.88), clamp(0.75 * coll, 0.0, 0.9) * (1.0 - 0.6 * arch));
  iris = mix(iris, vec3(0.36, 0.38, 0.2), smoothstep(0.72, 0.95, th));
  // round the iris the ball's silvery, iridescent coat (the argentea: green-gold through a pale lid, 62, 68)
  float outer = smoothstep(1.0, 1.2, th);
  vec3 c = mix(iris, vec3(0.4, 0.44, 0.38), outer);
  // the lids' shade: the opening is fixed in the head while the ball turns behind it; a soft contact shadow at the lid's
  // edge, a little darker under the upper lid
  vec3 nH = uHeadFromWorld * normalize(vEyeDirW);
  nH.x *= vSide;
  float lidB = dot(nH, mmLidA) > 0.0 ? mmLidSdf(nH, uLid) : 1.0;
  float upper = smoothstep(0.0, 0.4, dot(nH, mmLidU));
  float shade = (1.0 - 0.35 * smoothstep(-0.1, 0.0, lidB) * (0.6 + 0.4 * upper)) * mix(1.0, 0.8, smoothstep(0.0, 0.08, lidB));
  c *= shade;
  c = mix(c, vec3(0.004, 0.005, 0.006), mePup);
  meSil = (1.0 - mePup) * (1.0 - 0.55 * arch) * mix(1.0, 0.55, smoothstep(0.72, 1.1, th));
  meMetal = mix(0.85 * meSil, 0.6, outer);
  // (the glints underwater come off the silver iris: a tighter lobe on its bright parts)
  meRough = mix(0.2, 0.1, clamp(coll + 0.6 * fold, 0.0, 1.0)) + 0.12 * arch + 0.1 * smoothstep(0.8, 1.1, th);
  meIr = mix(0.5 * meSil * (1.0 - clamp(coll, 0.0, 1.0)), 0.75, outer);
  meIrT = mix(380.0, 470.0, outer);
#ifdef ME_LOW
  // the far tier: the ball stands for the whole dome (the head's skin is too coarse to bulge over it): lid-coloured but
  // for the opening, silver, the pupil dark when open (8, 9, 16: the eyes are the brightest spots of a far animal)
  float open = 1.0 - smoothstep(-0.02, 0.02, lidB);
  c = mix(uLidCol, vec3(0.58, 0.58, 0.52), open);
  c = mix(c, vec3(0.01), open * (1.0 - smoothstep(0.25, 0.35, th)) * smoothstep(0.5, 0.9, uPupil));
  meMetal = 0.6 * open; meIr = 0.0; meSil = 0.4 * open; meRough = mix(0.5, 0.15, open);
#endif
  diffuseColor.rgb = c * uTint;
}
`;

function eyeMaterial(u: MmUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.5, roughness: 0.3, clearcoat: 0, ior: 1.4,
    iridescence: low ? 0 : 1, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 380, iridescenceThicknessMaximum: 380,
  });
  m.name = low ? 'MimiikaEyeLOD2' : 'MimiikaEye';
  m.envMapIntensity = 0.35;
  m.defines = { USE_UV: '', ...(low ? { ME_LOW: '' } : {}) };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vEyeDirW;\nvarying float vSide;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vEyeDirW = mat3(modelMatrix) * position;
vSide = sign(determinant(mat3(modelMatrix)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uTint;\nuniform vec4 uChroma;\nuniform float uPupil;\nuniform float uLid;\nuniform vec3 uLidCol;\nuniform mat3 uHeadFromWorld;\nvarying vec3 vEyeDirW;\nvarying float vSide;\n${LID_GLSL}\n${NOISE}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${EYE_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = meRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = meMetal;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_IRIDESCENCE\n  material.iridescence = meIr;\n  material.iridescenceThickness = meIrT;\n#endif')
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  float cv = clamp(-dot(nW, vW), 0.0, 1.0);
  // the pupil's dark throws back a little blue-green; the iris's stack of plates sends its colour back over a broad lobe
  totalEmissiveRadiance += mePup * vec3(0.01, 0.03, 0.045) * amUnderwater(nW, 1.0) * cv * cv;
  totalEmissiveRadiance += meSil * diffuseColor.rgb * (amUnderwater(reflect(vW, nW), 0.6) * 0.1 + amUnderwater(nW, 1.0) * 0.03);
}`);
  };
  m.customProgramCacheKey = () => (low ? 'mimiika-eye-low-v4' : 'mimiika-eye-v4');
  return m;
}

/**
 * The corneas: clear bubbles over the lids' openings (geometry.ts buildCornea, uv = the stereographic position in the
 * lids' frame), with the optics of a cornea in water (F0 ≈ 0.005, F90 0.3: ior 1.29 at specularIntensity 0.3). Premultiplied: what they add is their reflection (the sun's glints, Snell's window, the water), and
 * they take from what is behind them only their Fresnel share; masked to the opening so the skirt under the lids
 * never shows.
 */
function corneaMaterial(u: MmUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: 0.05, ior: 1.29, specularIntensity: 0.3, transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  m.name = 'MimiikaCornea';
  m.envMapIntensity = 0.5;
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uLid;\n${LID_GLSL}`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float mcA = (1.0 - smoothstep(0.03, 0.1, mmLidSdfS(vUv, uLid))) * (1.0 - smoothstep(0.65, 0.8, 2.0 * atan(0.5 * length(vUv))));`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT)
      .replace('#include <premultiplied_alpha_fragment>', '')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  float cv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  // (against water the cornea's index is only ≈ 1.04 relative: it hardly reflects but at grazing angles)
  // (faded at its own outline: no ring floating beside the eye)
  float sil = smoothstep(0.02, 0.2, cv);
  gl_FragColor = vec4(outgoingLight * mcA * sil, (0.005 + 0.3 * pow(1.0 - cv, 5.0)) * mcA * sil);
}`);
  };
  m.customProgramCacheKey = () => 'mimiika-cornea-v3';
  return m;
}

// ------------------------------------------------------------------ viscera

/** the organs inside: their own colour, the ink sac's silvery iridophore coat glinting, lit by the water's light */
function visceraMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide, transparent: true, depthWrite: false, metalness: 0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.6, iridescenceIOR: 1.5, iridescenceThicknessMinimum: 250, iridescenceThicknessMaximum: 500 });
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
  diffuseColor.a *= 0.4 * smoothstep(0.35, 0.95, facing);
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

/**
 * the sand grains' size on the skin (model mm) for an animal K × the model: ≈ 0.45 mm real (the grains stuck on the
 * coat of 21 are 2–4 % of the mantle: medium sand, coarser than the silt; finer ones are lost under a pixel), within
 * 0.45 … 1.2
 */
export const sandGrain = (K: number): number => Math.min(1.2, Math.max(0.45, 0.45 / Math.max(K, 1e-3)));

/** One squid's materials (programs shared between animals, uniforms its own). */
export class MimiikaLook {
  readonly uniforms: MmUniforms;
  readonly skin: MeshPhysicalMaterial;
  readonly skinLow: MeshPhysicalMaterial;
  readonly fins: MeshPhysicalMaterial;
  readonly finsLow: MeshPhysicalMaterial;
  readonly eyes: MeshPhysicalMaterial;
  readonly eyesLow: MeshPhysicalMaterial;
  readonly cornea: MeshPhysicalMaterial;
  readonly viscera: MeshPhysicalMaterial;
  readonly spec: MmLookSpec;

  constructor(spec: MmLookSpec) {
    this.spec = spec;
    this.uniforms = {
      uTint: { value: new Color(...spec.tint) }, uChroma: { value: new Vector4(0.7, 0.95, 0.25 * spec.dark, 0.45) },
      uIrid: { value: 0.7 }, uPale: { value: 0 }, uSeed: { value: spec.seed }, uMantle: { value: 1 },
      uSandCoat: { value: 0 }, uHeadCover: { value: 0 }, uCover: { value: new Color(0.37, 0.37, 0.355) },
      uFinAmp: { value: new Vector2() }, uFinPh: { value: new Vector2() }, uFinK: { value: 1 }, uPupil: { value: 0.15 }, uLid: { value: 0.45 }, uGrooveFill: { value: 0 }, uHeadFromWorld: { value: new Matrix3() }, uLidCol: { value: new Color(0.2, 0.1, 0.07) }, uRelief: { value: 1 }, uGroundY: { value: -1e3 },
      uSandFade: { value: 0.0022 }, uGrain: { value: sandGrain(1) }, uArmThin: { value: new Float32Array(8).fill(1) },
    };
    this.skin = skinMaterial(this.uniforms, false);
    this.skinLow = skinMaterial(this.uniforms, true);
    this.fins = finMaterial(this.uniforms, false);
    this.finsLow = finMaterial(this.uniforms, true);
    this.eyes = eyeMaterial(this.uniforms, false);
    this.eyesLow = eyeMaterial(this.uniforms, true);
    this.cornea = corneaMaterial(this.uniforms);
    this.viscera = visceraMaterial();
  }

  /** the sediment it lies in (linear colour): the sand on its skin */
  setCover(r: number, g: number, b: number): void { this.uniforms.uCover.value.setRGB(r, g, b); }

  /** the individual's size (its mantle length / the model's): the coat's fade into the bed and the grains follow it */
  setScale(K: number): void {
    this.uniforms.uSandFade.value = 0.0022 * K;
    this.uniforms.uGrain.value = sandGrain(K);
  }

  dispose(): void {
    for (const m of [this.skin, this.skinLow, this.fins, this.finsLow, this.eyes, this.eyesLow, this.cornea, this.viscera]) m.dispose();
  }
}

/** the flat's sediments as the terrain draws them (Terrain.ts SUBSTRATE_COLORS) */
export const SUBSTRATE_TINT: Record<string, [number, number, number]> = {
  sand: [0.37, 0.37, 0.355], muddy_sand: [0.29, 0.285, 0.27], mud: [0.19, 0.185, 0.17],
  gravel: [0.33, 0.305, 0.27], channel: [0.15, 0.145, 0.135], rock: [0.3, 0.295, 0.28],
};
