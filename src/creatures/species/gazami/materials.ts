import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { AMH_UNIFORMS, ENV_INJECT, HELPERS, SUN_INJECT } from '../amimehagi/materials';
import type { GazamiLookLike } from './model';

/**
 * Materials of the ガザミ: standard PBR (MeshPhysicalMaterial: roughness, a clearcoat for the film of water on the
 * shell, iridescence for the corneas) with the colour and the surface worked in through onBeforeCompile, lit by the
 * underwater light field the other animals of the flat share (the sun through the water column, caustics, Snell's
 * window, the water's own glow).
 *
 * Nothing is a texture: the colour is computed from the rest-pose position (mm, CW 100) and the part each vertex
 * belongs to, so it has no seams, is the individual's own (seeded, never mirrored) and stays sharp up close. Colours
 * measured on the photographs (linear):
 *  - dorsum: olive-brown (19, 62, 64, 65), purplish brown (4, 17, 57, 61) or dark brown (45, 55); juveniles sandy and
 *    translucent (1–3, 23, 24, 68); pale granular bands along the epibranchial lines and the grooves of the "H" (19, 61),
 *    scattered white spots, denser and larger towards the anterolateral margins, two large white spots on the
 *    branchial regions behind the epibranchial lines (19, 41, 62, 64); dark mottling; the teeth paler towards their
 *    tips, the lateral spines' tips dark
 *  - chelipeds: brown to violet above and on the outer face, crowded with white, irregular spots (19, 49, 61, 67),
 *    white below; the fingers purple-blue then maroon to red at the tips (22, 26, 29, 53, 54), their teeth white
 *  - walking legs: blue-grey above with white spots (19, 47), white below; the dactyli blue, purple-red at the tip
 *  - swimming legs: the merus and carpus spotted like the legs, the blades translucent, the paddle's distal part dark
 *    blue-black to brown (47, 55, 61, 65)
 *  - underside: bluish white, glossy (18, 63); the third maxillipeds white with violet inner edges (66)
 * The surface: a dense granulation (39, 61: ≈ 0.4 mm granules at CW 100) as relief in the shading; wet, the shell is
 * glossy under a film of water (clearcoat), the granule tips a little rougher; sand and silt settle in the crevices,
 * at the joints and under the margins, and cover the dorsum after burying (`uSandCoat`).
 */

export interface GzLookSpec {
  seed: number;
  /** 0 male, 1 female */
  sex: 0 | 1;
  /** 0 adult … 1 small juvenile (sandy, translucent) */
  juvenile: number;
  /** the dorsum's morph (0 olive, 1 purplish brown, 2 dark brown, 3 green-olive) and its own variation */
  morph: number;
  /** brightness and contrast of the individual (≈ 1) */
  value: number;
}

export interface GzUniforms {
  [k: string]: IUniform;
  uBase: IUniform<Color>;
  uBand: IUniform<Color>;
  uSpot: IUniform<Color>;
  uMottle: IUniform<Color>;
  uClaw: IUniform<Color>;
  uLeg: IUniform<Color>;
  uFinger: IUniform<Color>;
  uTip: IUniform<Color>;
  uVentral: IUniform<Color>;
  uPaddle: IUniform<Color>;
  uSeed: IUniform<Vector2>;
  uSex: IUniform<number>;
  uJuv: IUniform<number>;
  uSandCoat: IUniform<number>;
  uWet: IUniform<number>;
  uCover: IUniform<Color>;
  uGroundY: IUniform<number>;
  uMmScale: IUniform<number>;
  uLimbSpots: IUniform<number>;
}

/** the morphs' colours (linear albedo): dorsum base, band, mottle; claw, leg, finger, tip */
const MORPHS: { base: number[]; band: number[]; mottle: number[]; claw: number[]; leg: number[]; finger: number[]; tip: number[]; spots: number }[] = [
  // olive (19, 36, 62, 64, 65): olive-tan, pale olive bands, brown blotches; brown claws, blue legs, near-black fingers
  { base: [0.13, 0.112, 0.066], band: [0.25, 0.22, 0.13], mottle: [0.05, 0.034, 0.02], claw: [0.085, 0.056, 0.036], leg: [0.055, 0.095, 0.15], finger: [0.03, 0.017, 0.028], tip: [0.16, 0.025, 0.03], spots: 1 },
  // purplish brown (4, 17, 57, 61): purple-red, cream bands, violet claws, blue-violet legs
  { base: [0.105, 0.05, 0.068], band: [0.24, 0.18, 0.15], mottle: [0.045, 0.02, 0.03], claw: [0.18, 0.11, 0.17], leg: [0.09, 0.08, 0.16], finger: [0.07, 0.03, 0.09], tip: [0.2, 0.02, 0.05], spots: 0.5 },
  // dark brown (45, 55)
  { base: [0.034, 0.026, 0.019], band: [0.085, 0.07, 0.045], mottle: [0.016, 0.012, 0.009], claw: [0.04, 0.026, 0.02], leg: [0.045, 0.045, 0.055], finger: [0.02, 0.012, 0.014], tip: [0.12, 0.025, 0.025], spots: 0.8 },
  // green-olive (21, 32, 62)
  { base: [0.068, 0.076, 0.05], band: [0.16, 0.16, 0.1], mottle: [0.028, 0.032, 0.022], claw: [0.065, 0.055, 0.045], leg: [0.05, 0.085, 0.13], finger: [0.03, 0.02, 0.035], tip: [0.18, 0.03, 0.04], spots: 1 },
];
/** the sandy, translucent juvenile (1, 3, 23, 24, 68; the pink-tipped fingers of 26–31) */
const JUVENILE = { base: [0.3, 0.23, 0.14], band: [0.4, 0.33, 0.21], mottle: [0.15, 0.1, 0.06], claw: [0.3, 0.22, 0.15], leg: [0.24, 0.24, 0.28], finger: [0.36, 0.26, 0.24], tip: [0.45, 0.06, 0.08] };

const lerp3 = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

// ------------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
attribute float aPart;
attribute vec2 aSeg;
attribute vec2 aAux;
attribute vec2 aMm;
uniform float uSex;
varying float vPart;
varying vec2 vSeg;
varying vec2 vAux;
varying vec2 vMm;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vWPos;
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vPart = aPart; vSeg = aSeg; vAux = aAux; vMm = aMm;
vRest = position * 1000.0;
vRestN = normal;
// the other sex's abdomen folds away to nothing
if (aPart > 1.5 && aPart < 2.5 && aAux.y > 0.5 && aAux.y < 2.5 && abs(aAux.y - (uSex + 1.0)) > 0.5) transformed = vec3(0.0);
`;

const FRAG_PARS = /* glsl */ `
varying float vPart;
varying vec2 vSeg;
varying vec2 vAux;
varying vec2 vMm;
varying vec3 vRest;
varying vec3 vRestN;
uniform vec3 uBase, uBand, uSpot, uMottle, uClaw, uLeg, uFinger, uTip, uVentral, uPaddle, uCover;
uniform vec2 uSeed;
uniform float uJuv, uSandCoat, uWet, uGroundY, uMmScale, uLimbSpots;
`;

/** noise and pattern helpers (after the shared HELPERS: amHash, amHash2, amNoise, amCells) */
const GZ_FUNCS = /* glsl */ `
float gzFbm(vec2 p) { return 0.55 * amNoise(p) + 0.3 * amNoise(p * 2.13 + 7.1) + 0.15 * amNoise(p * 4.37 - 3.3); }
float gzSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
/**
 * spots: each cell of a jittered grid (cell mm) may hold a round spot; returns its cover (0 … 1), softened by the
 * pixel footprint fw (mm per pixel). density 0 … 1, rmin / rmax as shares of the cell.
 */
float gzSpots(vec2 p, float cell, float density, float rmin, float rmax, float fw, float seed) {
  vec2 q = p / cell;
  vec2 id;
  vec3 c = amCells(q + seed * 17.3, id);
  float h = amHash(id + seed * 3.1);
  float on = step(1.0 - density, h);
  float r = mix(rmin, rmax, amHash(id + 9.7 + seed));
  // a ragged edge, not a disc
  float edge = r * (0.82 + 0.3 * amNoise(q * 5.0 + id * 1.7));
  float soft = max(0.04, fw / cell * 1.2);
  float s = on * (1.0 - smoothstep(edge - soft, edge + soft, c.x));
  // far away the spots melt into their mean cover
  float far = smoothstep(0.25, 0.7, fw / cell);
  return mix(s, density * 3.14 * 0.35 * (rmin + rmax) * (rmin + rmax) * 0.5, far);
}
/** a limb's spotted look: its colour above and on the outer face, white below, white spots crowded on top (19, 49, 61) */
vec3 gzLimb(vec3 base, float upper, vec2 mm, float cell, float dens, float fw, float seed) {
  vec3 c = mix(uVentral * 0.9, base * (0.8 + 0.4 * amNoise(mm * 0.35 + seed)), smoothstep(-0.85, -0.25, upper));
  // large ragged spots that run together into a net in places, and a fine speckle between them
  float net = smoothstep(0.35, 0.75, amNoise(mm * 0.28 + seed * 2.0));
  float sp = gzSpots(mm, cell, dens * (0.7 + 0.6 * net), 0.24, 0.5, fw, seed);
  sp = max(sp, gzSpots(mm + 13.0, cell * 0.5, dens * 0.6, 0.18, 0.36, fw, seed + 5.0) * 0.8);
  return mix(c, mix(uSpot, uBand * 1.6, 0.35) * 0.9, sp * smoothstep(-0.45, 0.15, upper) * 0.85);
}
/** granules: rounded bumps on a cellular grid; returns height (mm) */
float gzGranules(vec2 p, float cell, float fw, float seed) {
  vec2 id;
  vec3 c = amCells(p / cell + seed, id);
  float r = 0.36 + 0.14 * amHash(id * 1.3 + seed);
  float g = 1.0 - smoothstep(0.0, r, c.x);
  return g * g * cell * 0.22 * (1.0 - smoothstep(0.18, 0.45, fw / cell));
}
`;

/**
 * The colour and surface of the shell at this fragment: gzCol, gzRough, gzCoat, gzHgt (mm, relief for the shading),
 * gzThin (light through thin parts), gzSand (sand and silt), gzEye (the cornea).
 */
const SURFACE = /* glsl */ `
vec3 gzCol = uBase;
float gzRough = 0.42, gzCoat = 0.0, gzHgt = 0.0, gzThin = 0.0, gzSand = 0.0, gzEye = 0.0, gzAO = 1.0, gzSpec = 1.0, gzCoatRough = 0.2;
{
  vec3 P = vRest;
  int part = int(vPart + 0.5);
  float fw = max(length(fwidth(P)), 1e-4);
  float t = vSeg.x;
  float ang = vSeg.y * 6.2831853;
  float upper = cos(ang);
  float outer = sin(ang);
  vec2 sd = uSeed;
  float tooth = vAux.y > 3.5 ? vAux.y - 4.0 : 0.0;
  float cav = vAux.x;

  if (part == 0) {
    // ---- the dorsum (on the steep faces of the free margin and the teeth, the pattern's coordinates move out with
    // the height, so that it runs on over the edge instead of streaking down it)
    vec3 nR = normalize(vRestN);
    vec2 X = P.xz + nR.xz * (P.y - 13.0) * (1.0 - abs(nR.y));
    float ax = abs(X.x);
    float lowf = gzFbm(X * 0.07 + sd * 13.0);
    gzCol = uBase * (0.85 + 0.32 * lowf);
    // the dark pattern laid on the regions (4, 17, 36, 57, 61): the gastric shield, the cardiac patch, a dark band
    // across each branchial region behind the epibranchial line, the hepatic patches; ragged-edged, never mirrored,
    // each crab its own strength of each (some nearly plain: 62, 64)
    float rag = 0.55 + 0.9 * gzFbm(X * 0.32 + sd * 11.0);
    float hk = amHash(sd + 3.3);
    float dark = 0.0;
    dark += (0.6 + 0.6 * amHash(sd + 0.1)) * exp(-(X.x * X.x) / 30.0 - ((X.y - 8.5) * (X.y - 8.5)) / 26.0);
    dark += (0.5 + 0.6 * amHash(sd + 0.2)) * exp(-(X.x * X.x) / 18.0 - ((X.y + 11.0) * (X.y + 11.0)) / 12.0);
    float zb = -6.5 + 0.009 * X.x * X.x + 1.2 * (amNoise(X * 0.2 + sd) - 0.5);
    dark += (0.5 + 0.7 * amHash(sd + 0.3 + step(0.0, X.x))) * exp(-((X.y - zb) * (X.y - zb)) / 5.0) * smoothstep(7.0, 12.0, ax) * (1.0 - smoothstep(28.0, 36.0, ax));
    dark += (0.35 + 0.5 * amHash(sd + 0.4 + step(0.0, X.x))) * exp(-((ax - 14.5) * (ax - 14.5)) / 12.0 - ((X.y - 13.0) * (X.y - 13.0)) / 9.0);
    dark += (0.3 + 0.5 * amHash(sd + 0.5 + step(0.0, X.x))) * exp(-((ax - 21.0) * (ax - 21.0)) / 30.0 - ((X.y + 13.0) * (X.y + 13.0)) / 12.0);
    dark = smoothstep(0.3, 0.9, dark * rag) * (0.55 + 0.5 * hk);
    gzCol = mix(gzCol, uMottle * 0.75, dark);
    // and a fine mottle everywhere
    float mot = smoothstep(0.5, 0.78, gzFbm(X * 0.16 + sd.yx * 21.0));
    gzCol = mix(gzCol, uMottle, mot * 0.3);
    // broad dark blotches and pale patches over the regions (36, 64), as strong as the individual has them (62: none)
    float mk = amHash(sd + 7.7);
    mk *= mk;
    float blot = gzFbm(X * 0.08 + sd * 6.0 + 3.0);
    gzCol = mix(gzCol, uMottle * 0.85, smoothstep(0.58, 0.78, blot) * (0.1 + 0.4 * mk));
    gzCol = mix(gzCol, uBand, smoothstep(0.42, 0.25, blot) * (0.08 + 0.3 * mk) * (1.0 - smoothstep(30.0, 42.0, ax)));
    // pale granular bands: the epibranchial lines (from the spine's base forward and in) and the H of the grooves
    float dEpi = min(min(gzSeg(vec2(ax, X.y), vec2(34.5, -3.6), vec2(24.0, 1.2)), gzSeg(vec2(ax, X.y), vec2(24.0, 1.2), vec2(13.2, 5.6))), gzSeg(vec2(ax, X.y), vec2(13.2, 5.6), vec2(8.5, 6.0)));
    float dH = min(min(abs(X.y - (-2.4 + 0.028 * X.x * X.x)) + step(12.0, ax) * 9.0, gzSeg(vec2(ax, X.y), vec2(6.2, -4.5), vec2(8.2, -17.0))), gzSeg(vec2(ax, X.y), vec2(5.5, 13.5), vec2(9.5, 3.5)));
    float wob = 0.6 * (amNoise(X * 0.9 + sd * 5.0) - 0.5);
    // (granular and broken, not painted lines: 61, 19)
    float brk = smoothstep(0.25, 0.75, amNoise(X * 0.45 + sd * 3.0)) * (0.7 + 0.3 * amNoise(X * 2.3));
    float band = ((1.0 - smoothstep(1.2, 3.4, dEpi + wob)) * 0.85 + (1.0 - smoothstep(0.5, 1.8, dH + wob * 0.6)) * 0.55) * (0.5 + 0.5 * brk);
    // a pale field over the front and along the posterior margin (4, 61)
    band += 0.35 * smoothstep(14.0, 20.0, X.y) * (1.0 - smoothstep(10.0, 16.0, ax)) + 0.3 * smoothstep(-19.0, -22.5, X.y);
    gzCol = mix(gzCol, uBand, clamp(band, 0.0, 1.0) * (0.85 + 0.15 * lowf));
    // the white spots: fine speckles everywhere, more and larger towards the anterolateral margins and the spines
    float s = vSeg.x;
    float margin = smoothstep(0.55, 1.0, s) + tooth;
    // (few over the middle of the dorsum, crowded along the anterolateral margins and on the spines: 19, 62, 64)
    float sp = gzSpots(X, 3.0, 0.04 + 0.32 * margin * margin, 0.14, 0.32, fw, sd.x * 3.0);
    sp = max(sp, gzSpots(X + 31.0, 1.5, 0.05 + 0.3 * margin, 0.1, 0.24, fw, sd.y * 5.0) * 0.75);
    sp *= 0.55 + 0.45 * smoothstep(0.35, 0.7, gzFbm(X * 0.11 + sd * 2.0));
    // the two large white spots of the branchial regions (each its own place, size and ragged edge; some crabs lack one)
    for (int k = 0; k < 2; k++) {
      float sg = k == 0 ? 1.0 : -1.0;
      vec2 c0 = vec2(sg * (17.5 + 3.0 * (amHash(sd + float(k)) - 0.5)), -9.0 + 4.0 * (amHash(sd * 1.7 + float(k)) - 0.5));
      float rr = 1.4 + 1.3 * amHash(sd * 2.3 + float(k) * 3.0);
      float dd = length(X - c0) - rr * (0.8 + 0.4 * amNoise((X - c0) * 1.2 + sd * 9.0 + float(k)));
      sp = max(sp, (1.0 - smoothstep(-0.25, 0.25, dd)) * step(0.12, amHash(sd * 4.1 + float(k) * 7.0)));
    }
    // (the pale spots are made of white-tipped granules, not paint: up close the spot breaks up into its granules,
    // the hollows between them keep some of the ground colour; 36, 61)
    float gn = gzGranules(X, 0.42, fw, sd.x * 7.0) / (0.42 * 0.22);
    float nearG = 1.0 - smoothstep(0.18, 0.45, fw / 0.42);
    sp *= mix(1.0, 0.35 + 0.75 * smoothstep(0.05, 0.5, gn), nearG);
    gzCol = mix(gzCol, mix(uSpot, uBand * 1.5, 0.3) * (0.82 + 0.15 * lowf), sp * 0.8);
    // the teeth: paler and a little translucent towards their tips; the lateral spines' tips dark
    float spine = smoothstep(37.0, 42.0, ax) * step(-9.0, X.y) * step(X.y, 1.5);
    gzCol = mix(gzCol, mix(uBand * 1.25, uTip * 0.5 + vec3(0.04, 0.03, 0.03), spine), smoothstep(0.35, 1.0, tooth) * 0.7);
    gzThin += tooth * 0.5;
    // the granulation (39, 61)
    gzHgt = 2.0 * gzGranules(X, 0.42, fw, sd.x * 7.0) + 0.6 * gzGranules(X * 1.9 + 3.0, 0.42, fw, sd.y * 7.0);
    gzCol *= 1.0 + 0.7 * gzHgt;
    // (granular: the wet film's reflection breaks up into a glitter, not a mirror)
    gzRough = 0.5 + 0.35 * gzHgt;
    gzCoatRough = 0.3 + 0.5 * gzHgt;
  } else if (part == 1) {
    // ---- the carapace's underside, the body wall, the front face: bluish white, the margin's underside paler
    // (two projections, or the noise runs in streaks down the steep faces)
    gzCol = uVentral * (0.82 + 0.08 * (gzFbm(P.xz * 0.2 + sd) + gzFbm(P.xy * 0.2 - sd)));
    gzCol = mix(gzCol, uBand * 1.1, smoothstep(0.55, 0.0, cav) * 0.25);
    // the face under the front (epistome, the orbits' floors, the pterygostomial regions round the mouth): a dull
    // grey-brown in the margin's shade, the white mouthparts standing out against it (66)
    float face = smoothstep(13.0, 19.5, P.z) * smoothstep(2.5, 6.0, P.y);
    gzCol = mix(gzCol, mix(uVentral * 0.5, uBase * 1.2, 0.6), face * 0.85);
    // the buccal frame behind the third maxillipeds: a dark cavity, seen as a gap round the plates and between them
    float bucc = smoothstep(9.4, 8.5, abs(P.x)) * smoothstep(2.4, 3.4, P.y) * smoothstep(11.6, 10.6, P.y) * smoothstep(17.5, 19.0, P.z);
    gzCol *= 1.0 - 0.6 * bucc;
    vec3 an1 = abs(vRestN);
    gzHgt = 0.3 * gzGranules(an1.y > max(an1.x, an1.z) ? P.xz : an1.x > an1.z ? P.zy : P.xy, 0.36, fw, sd.y);
    gzRough = 0.34;
    if (tooth > 0.0) gzCol = mix(gzCol, uBand * 1.3, 0.5);
  } else if (part == 2) {
    // ---- sternum, abdomen, mouthparts: glossy white, the sutures between the sternites a little darker
    gzCol = uVentral;
    float suture = 0.0;
    if (vAux.y > 0.5 && vAux.y < 2.5) {
      // the abdomen's somites
      float k = fract(vSeg.x * 6.5);
      suture = (1.0 - smoothstep(0.0, 0.06, min(k, 1.0 - k))) * step(0.04, vSeg.x);
    } else if (vAux.y > 2.5 && vAux.y < 3.5) {
      // the third maxillipeds' palps and exopods: white, a brownish band at each joint, the tips darker (66)
      gzCol = uVentral * 1.1;
      gzCol = mix(gzCol, mix(uVentral, uClaw * 2.0, 0.5), (1.0 - smoothstep(0.0, 0.12, t)) * 0.7 + smoothstep(0.8, 1.0, t) * 0.4);
      suture = 1.0 - smoothstep(0.0, 0.05, t);
    } else if (P.y < 2.0) {
      for (int k = 0; k < 4; k++) {
        float zc = 9.5 - 6.5 * float(k);
        suture = max(suture, 1.0 - smoothstep(0.1, 0.45, abs(P.z - zc - 0.012 * P.x * P.x)));
      }
      suture = max(suture, (1.0 - smoothstep(0.1, 0.35, abs(P.x))) * step(P.z, 2.0));
    } else {
      // the third maxillipeds: white with a violet inner edge and a brownish rim (66); the suture between the merus
      // (above) and the ischium, the ischium's groove near its inner edge, the inner edge finely toothed
      float u = vSeg.x, v = vSeg.y;
      gzCol = uVentral * 1.15;
      gzCol = mix(gzCol, mix(uVentral, uFinger * 4.0, 0.6), smoothstep(0.9, 1.0, u) * 0.8);
      gzCol = mix(gzCol, mix(uVentral, uClaw * 2.0, 0.6), (smoothstep(0.9, 1.0, v) + smoothstep(0.08, 0.0, u)) * 0.6);
      float mer = 1.0 - smoothstep(0.0, 0.03, abs(v - 0.38 - 0.06 * u));
      float sul = (1.0 - smoothstep(0.0, 0.035, abs(u - 0.66 - 0.04 * v))) * smoothstep(0.42, 0.5, v) * (1.0 - smoothstep(0.88, 0.96, v));
      float saw = smoothstep(0.93, 0.99, u) * step(0.5, fract(v * 26.0));
      suture = max(max(mer, sul * 0.7), saw * 0.6);
      gzHgt = -0.25 * (mer + sul * 0.6);
    }
    gzCol *= 1.0 - 0.28 * suture;
    // (glossy, but not a mirror: the mouthparts a little duller than the sternum)
    gzRough = P.y < 2.0 || (vAux.y > 0.5 && vAux.y < 2.5) ? 0.3 : 0.42;
  } else if (part == 3 || part == 4 || part == 5 || part == 12) {
    // ---- the cheliped
    vec3 base = uClaw;
    gzCol = gzLimb(base, upper, vMm, 1.7, 0.42 * uLimbSpots, fw, sd.x + float(part));
    // the costae a little paler (the shader sees them as the ridges' lighter tops)
    if (part == 4 || part == 5) {
      float fin = part == 5 ? t : smoothstep(0.55, 1.0, t);
      float tipK = part == 5 ? smoothstep(0.72, 1.0, t) : smoothstep(0.88, 1.0, t);
      // the fingers darken from their base to a near black purple-brown, maroon to red at the very tips (66, 61, 53)
      vec3 f = mix(gzCol, uFinger, smoothstep(0.05, 0.5, fin) * 0.92);
      f = mix(f, uTip, tipK * 0.8);
      // the cutting edges stay pale
      float edge = part == 5 ? smoothstep(0.75, 0.98, -upper) : smoothstep(0.75, 0.98, upper);
      f = mix(f, uVentral * 0.85, edge * step(0.56, part == 5 ? 1.0 : t) * 0.6);
      gzCol = part == 5 ? f : mix(gzCol, f, step(0.55, t));
    }
    if (part == 12) {
      // the spines: the article's colour at the base, translucent cream, then a dark tip
      gzCol = mix(gzCol, uBand * 1.3, smoothstep(0.2, 0.6, t));
      gzCol = mix(gzCol, uTip * 0.45, smoothstep(0.7, 1.0, t));
      gzThin = 0.3;
    }
    gzHgt = 1.1 * gzGranules(vMm, 0.45, fw, sd.x + float(part));
    gzRough = 0.5 + 0.3 * gzHgt;
  } else if (part == 13) {
    // ---- the fingers' teeth: ivory, the tips a little translucent
    gzCol = mix(uVentral * 0.95, vec3(0.62, 0.58, 0.5), t);
    gzRough = 0.3; gzThin = 0.35 * t;
  } else if (part == 6 || part == 8) {
    // ---- walking legs (and the paddle's merus, carpus): blue-grey above with white spots, white below
    vec3 base = part == 8 ? mix(uLeg, uClaw, 0.35) : uLeg;
    gzCol = gzLimb(base, upper, vMm, 1.5, (part == 8 ? 0.5 : 0.24) * uLimbSpots, fw, sd.y + float(part));
    // the joints a little warmer (46)
    gzCol = mix(gzCol, gzCol * vec3(1.25, 0.95, 0.8), (smoothstep(0.88, 1.0, t) + smoothstep(0.1, 0.0, t)) * 0.5);
    gzHgt = 0.4 * gzGranules(vMm, 0.45, fw, sd.y + float(part));
    gzRough = 0.48;
  } else if (part == 7) {
    // ---- the walking legs' dactyli: blue, purple-red at the tip
    gzCol = mix(uVentral * 0.9, uLeg * 1.35, smoothstep(-0.6, 0.3, upper));
    gzCol = mix(gzCol, mix(uFinger, uTip, 0.5), smoothstep(0.6, 0.98, t));
    gzRough = 0.3; gzThin = 0.2;
  } else if (part == 14 || part == 15) {
    // ---- the paddle: a translucent blade, the dactylus's distal part dark blue-black to brown (47, 55, 61, 65)
    vec3 blade = mix(uPaddle, uLeg * 1.2, 0.35);
    gzCol = mix(uVentral * 0.85, blade, smoothstep(-0.7, 0.3, upper));
    if (part == 14) gzCol = mix(gzCol, uSpot, gzSpots(vMm, 1.5, 0.35, 0.2, 0.42, fw, sd.x + 4.0) * smoothstep(-0.3, 0.3, upper) * 0.6);
    // the dark margin: over the distal half of the dactylus, narrowing back along its edges
    float rim = smoothstep(0.75, 0.98, abs(outer));
    float dark = part == 15 ? max(smoothstep(0.35, 0.75, t), rim * smoothstep(0.1, 0.4, t) * 0.8) : rim * smoothstep(0.6, 1.0, t) * 0.5;
    gzCol = mix(gzCol, vec3(0.018, 0.02, 0.035) + uFinger * 0.25, dark * 0.92);
    // the very edge pale (the setae's base)
    gzCol = mix(gzCol, uBand * 1.2, smoothstep(0.96, 1.0, abs(outer)) * 0.5);
    gzThin = 0.75 * (1.0 - dark * 0.8);
    gzRough = 0.3;
  } else if (part == 9) {
    // ---- the articular membranes: pale, soft, translucent
    gzCol = mix(uVentral, vec3(0.5, 0.36, 0.38), 0.3);
    gzRough = 0.55; gzThin = 0.6;
  } else if (part == 10) {
    // ---- the eye (one surface, stalk to tip; vSeg.x > 0 on the cornea)
    float sc = vSeg.x;
    float cm = smoothstep(-0.025, 0.025, sc);
    float facing = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
    // the cornea: grey-green with darker screening pigment (65, 66) to a glossy near black (61), each crab its own;
    // flecked (the pigment of groups of ommatidia), a paler band near its edge
    float tone = amHash(sd + 5.5);
    vec3 an = abs(normalize(vRestN));
    vec3 Pe = P * 3.2;
    float fleck = (amNoise(Pe.yz + sd) * an.x + amNoise(Pe.xz - sd) * an.y + amNoise(Pe.xy + sd.yx) * an.z) / (an.x + an.y + an.z);
    vec3 corn = mix(vec3(0.09, 0.1, 0.078), vec3(0.028, 0.026, 0.024), tone) * (0.7 + 0.6 * smoothstep(0.3, 0.7, fleck));
    corn = mix(corn, corn * 1.6 + vec3(0.01, 0.012, 0.008), (1.0 - smoothstep(0.02, 0.16, sc)) * 0.6);
    // the pseudopupil: the facets that look straight at the viewer show the dark pigment at their depths, a black spot
    // that follows the viewer round the eye (65, 66)
    float pp = smoothstep(0.84, 0.975, facing);
    corn = mix(corn, vec3(0.006, 0.005, 0.005), pp * 0.92);
    // the facets: a hexagonal lattice (≈ 0.06 mm, a little coarse so that it reads up close) catching the light
    vec2 fid;
    vec3 fc = amCells(vec2(vSeg.y * 150.0, sc * 46.0), fid);
    float facet = (1.0 - smoothstep(0.25, 0.55, fc.x)) * (1.0 - smoothstep(0.03, 0.09, fw));
    // the stalk's cuticle: amber and translucent at the base, maroon towards the eye (61, 66; amber in 64, 65), a pale
    // rim round the cornea
    // (on the inner side of the stalk, 66; all round in some crabs, 61)
    float medial = smoothstep(0.15, -0.55, normalize(vRestN).x * sign(P.x));
    float red = mix(medial, 1.0, 0.6 * amHash(sd + 6.6)) * (0.6 + 0.4 * amNoise(Pe.xy * 0.5 + Pe.z * 0.3 + sd * 3.0));
    vec3 stalk = mix(uBand * 0.75, vec3(0.19, 0.05, 0.045), smoothstep(-1.1, -0.25, sc) * red);
    stalk = mix(stalk, uBand * 1.3, (1.0 - smoothstep(0.0, 0.05, -sc)) * 0.7);
    gzCol = mix(stalk, corn, cm);
    gzHgt = facet * 0.0025 * cm;
    gzRough = mix(0.38, 0.2, cm);
    gzThin = (1.0 - cm) * 0.45;
    gzEye = cm;
  } else if (part == 11) {
    // ---- antennae, antennules: translucent, pale amber (66); the peduncles' joints darker, the flagella annulated
    // (≈ 0.22 mm annuli at CW 100), the antennules' outer flagellum a darker brush of aesthetascs
    float flag = vAux.y;
    gzCol = mix(uBand * 0.95, vec3(0.42, 0.33, 0.22), 0.4);
    gzCol = mix(gzCol, vec3(0.2, 0.08, 0.05), (1.0 - smoothstep(0.0, 0.1, t)) * 0.45);
    float ann = fract(vMm.x / 0.22);
    float ring = (1.0 - smoothstep(0.0, 0.18, min(ann, 1.0 - ann))) * step(0.5, flag) * (1.0 - smoothstep(0.15, 0.4, fw / 0.22));
    gzCol *= 1.0 - 0.35 * ring;
    if (flag > 1.5 && flag < 2.5) gzCol = mix(gzCol, vec3(0.16, 0.12, 0.08), 0.55 * smoothstep(0.1, 0.4, t));
    gzHgt = -0.03 * ring;
    gzRough = 0.42; gzThin = 0.5;
  }
  // a juvenile's shell lets the light through
  gzThin += uJuv * 0.35;
  // sand and silt: in the crevices, at the joints, under the margins; over the top after burying
  vec3 nW = normalize(vRestN);
  float grit = amNoise(P.xz * 3.1 + P.y * 1.7 + sd * 4.0);
  gzSand = clamp(smoothstep(0.45, 0.95, cav) * 0.55 * smoothstep(0.35, 0.75, grit) + uSandCoat * smoothstep(0.0, 0.6, nW.y + 0.25) * smoothstep(0.25, 0.65, grit + 0.25 * uSandCoat), 0.0, 1.0);
  // the sand where the crab sits in it (its own grains, its own light)
  float nearBed = 1.0 - smoothstep(0.0, 0.0025 * uMmScale * 1000.0, vWPos.y - uGroundY);
  gzSand = max(gzSand, nearBed * 0.8 * smoothstep(0.2, 0.6, amNoise(P.xz * 5.3 + P.y * 4.1 + sd * 2.0)) * (part == 2 ? 0.0 : 1.0));
  // (the eyes are kept clean: wiped in the orbits)
  if (part == 10) gzSand *= 1.0 - gzEye;
  gzAO = 1.0 - 0.45 * cav;
  gzCol *= gzAO;
  gzCol = mix(gzCol, uCover * (0.75 + 0.5 * grit), gzSand);
  gzRough = mix(gzRough, 0.92, gzSand);
  // wet: a film of water over the shell; drying out in the air it dulls
  gzCoat = uWet * (1.0 - gzSand) * (part == 9 ? 0.2 : part == 0 ? 0.2 : part == 10 ? mix(0.15, 0.7, gzEye) : 0.12);
  // the limbs' cuticle reflects less than the dorsum's, or a glossy sheen washes their colour out from above (19, 61)
  gzSpec = (part >= 3 && part <= 8) || part >= 12 ? 0.45 : part == 0 ? 0.7 : 1.0;
  // the cornea under its film of water: a small, crisp highlight (what makes the eye look alive)
  if (part == 10) gzCoatRough = mix(0.25, 0.03, gzEye);
  gzRough = mix(gzRough + 0.18, gzRough, uWet);
  diffuseColor.rgb = gzCol;
}
`;

const NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#ifndef GZ_LOW
{
  vec3 sp = -vViewPosition;
  vec2 dH = vec2(dFdx(gzHgt), dFdy(gzHgt)) * uMmScale;
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif
`;

/** light through the thin parts (the paddles, the membranes, the teeth's tips, a juvenile's shell) */
const THIN = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 vW = inverseTransformDirection(-normalize(vViewPosition), viewMatrix);
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float back = pow(clamp(dot(vW, amSunDir()), 0.0, 1.0), 2.0);
  vec3 through = diffuseColor.rgb * vec3(1.05, 0.95, 0.85);
  totalEmissiveRadiance += through * (amUnderwater(-nW, 1.0) * 0.35 + amSunCol() * amSunThrough() * back * 0.4) * gzThin * (1.0 - gzSand);
}
`;

function shellMaterial(u: GzUniforms, low: boolean): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, side: FrontSide,
    iridescence: low ? 0 : 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], specularIntensity: 0.55, ior: 1.52,
  });
  m.name = low ? 'GazamiShellLOD2' : 'GazamiShell';
  m.envMapIntensity = 0.3;
  m.defines = low ? { GZ_LOW: '' } : {};
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_BEGIN)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('void main() {', `${HELPERS}\n${GZ_FUNCS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gzRough, 0.06, 1.0);')
      .replace('#include <normal_fragment_maps>', NORMAL)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.specularColor *= gzSpec;
material.specularF90 *= gzSpec;
#ifdef USE_CLEARCOAT
  material.clearcoat = gzCoat;
  material.clearcoatRoughness = clamp(gzCoatRough, 0.06, 1.0);
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = gzEye * 0.4;
  material.iridescenceThickness = 380.0;
#endif`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}
  // sand on the shell takes the bed's light, not the water's
  iblIrradiance *= mix(1.0, 0.3, gzSand);
  radiance *= mix(1.0, 0.2, gzSand);`)
      .replace('#include <emissivemap_fragment>', THIN);
  };
  m.customProgramCacheKey = () => (low ? 'gazami-shell-low-v2' : 'gazami-shell-v2');
  return m;
}

/** the setae: fine hairs drawn strand by strand on their cards (yellowish, translucent at the tips: 6, 61, 65) */
function setaeMaterial(u: GzUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: DoubleSide, alphaTest: 0.5 });
  m.name = 'GazamiSetae';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, AMH_UNIFORMS, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aSeg;\nattribute float aPart;\nvarying vec2 vSeg;\nvarying float vPart;\nvarying vec3 vWPos;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeg = aSeg; vPart = aPart;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSeg;\nvarying float vPart;\nuniform vec3 uBand, uCover;\nuniform vec2 uSeed;\nuniform float uSandCoat;`)
      .replace('void main() {', `${HELPERS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // strands about 0.09 mm apart (CW 100), each its own length, a little wavy, thinning to the tip
  float x = vSeg.x / 0.09;
  float id = floor(x);
  float len = 0.55 + 0.45 * amHash(vec2(id, uSeed.x));
  float wave = 0.12 * sin(vSeg.y * 6.0 + id);
  float f = abs(fract(x + wave * vSeg.y) - 0.5);
  float w = 0.32 * (1.0 - vSeg.y / len);
  float on = step(vSeg.y, len) * step(f, w);
  if (on < 0.5) discard;
  diffuseColor.rgb = mix(uBand * 1.4, vec3(0.5, 0.42, 0.24), vSeg.y) * (vPart > 1.5 ? 0.8 : 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCover, uSandCoat * 0.5);
}`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', ENV_INJECT);
  };
  m.customProgramCacheKey = () => 'gazami-setae-v1';
  return m;
}

/** One crab's materials (programs shared between crabs, uniforms its own). */
export class GazamiLook implements GazamiLookLike {
  readonly uniforms: GzUniforms;
  readonly shell: MeshPhysicalMaterial;
  readonly shellLow: MeshPhysicalMaterial;
  readonly setae: MeshStandardMaterial;
  readonly spec: GzLookSpec;

  constructor(spec: GzLookSpec) {
    this.spec = spec;
    const mi = Math.max(0, Math.min(MORPHS.length - 1, Math.floor(spec.morph)));
    const M = MORPHS[mi];
    const j = Math.max(0, Math.min(1, spec.juvenile));
    const pick = (k: keyof typeof JUVENILE) => new Color(...lerp3(M[k], JUVENILE[k], j).map((v) => v * spec.value) as [number, number, number]);
    // a female's finger tips orange-red, a male's purple-blue fingers (61 male, 9 female)
    const tip = pick('tip');
    // the walking legs from bright blue (64) to a greyish olive (66), each crab its own
    const h = (x: number) => { const v = Math.sin(spec.seed * 12.9898 + x * 78.233) * 43758.5453; return v - Math.floor(v); };
    const leg = pick('leg').lerp(pick('claw').lerp(pick('base'), 0.5), 0.55 * h(1) * (1 - j));
    if (spec.sex === 1) tip.lerp(new Color(0.36, 0.09, 0.03), 0.5);
    this.uniforms = {
      uBase: { value: pick('base') }, uBand: { value: pick('band') }, uSpot: { value: new Color(0.6, 0.58, 0.52).multiplyScalar(0.92 + 0.1 * spec.value) },
      uMottle: { value: pick('mottle') }, uClaw: { value: pick('claw') }, uLeg: { value: leg }, uFinger: { value: pick('finger') }, uTip: { value: tip },
      uVentral: { value: new Color(0.58, 0.62, 0.68).lerp(new Color(0.6, 0.56, 0.48), j * 0.5) }, uPaddle: { value: leg.clone().lerp(new Color(0.2, 0.19, 0.14), 0.4) },
      uSeed: { value: new Vector2((spec.seed * 97.31) % 37.0, (spec.seed * 53.17) % 29.0) },
      uSex: { value: spec.sex }, uJuv: { value: j }, uSandCoat: { value: 0 }, uWet: { value: 1 },
      uCover: { value: new Color(0.37, 0.37, 0.355) }, uGroundY: { value: -1e3 }, uMmScale: { value: 0.001 },
      uLimbSpots: { value: (M.spots + (1 - M.spots) * j) * (0.8 + 0.4 * h(2)) },
    };
    this.shell = shellMaterial(this.uniforms, false);
    this.shellLow = shellMaterial(this.uniforms, true);
    this.setae = setaeMaterial(this.uniforms);
  }

  shellFor(tier: 0 | 1 | 2) { return tier === 2 ? this.shellLow : this.shell; }

  /** the sediment it lies in (linear colour): the sand on its shell */
  setCover(r: number, g: number, b: number): void { this.uniforms.uCover.value.setRGB(r, g, b); }

  dispose(): void {
    this.shell.dispose(); this.shellLow.dispose(); this.setae.dispose();
  }
}

/** the flat's sediments as the terrain draws them (Terrain.ts SUBSTRATE_COLORS) */
export const SUBSTRATE_TINT: Record<string, [number, number, number]> = {
  sand: [0.37, 0.37, 0.355], muddy_sand: [0.29, 0.285, 0.27], mud: [0.19, 0.185, 0.17],
  gravel: [0.33, 0.305, 0.27], channel: [0.15, 0.145, 0.135], rock: [0.3, 0.295, 0.28],
};
