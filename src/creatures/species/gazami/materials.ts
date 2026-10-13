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
}

/** the morphs' colours (linear albedo): dorsum base, band, mottle; claw, leg, finger, tip */
const MORPHS: { base: number[]; band: number[]; mottle: number[]; claw: number[]; leg: number[]; finger: number[]; tip: number[] }[] = [
  // olive (19, 62, 64, 65): olive-tan with pale olive bands, brown claws, blue legs
  { base: [0.135, 0.118, 0.072], band: [0.27, 0.24, 0.15], mottle: [0.06, 0.05, 0.032], claw: [0.095, 0.064, 0.043], leg: [0.07, 0.105, 0.14], finger: [0.11, 0.055, 0.11], tip: [0.3, 0.035, 0.045] },
  // purplish brown (4, 17, 57, 61)
  { base: [0.12, 0.068, 0.078], band: [0.26, 0.2, 0.17], mottle: [0.055, 0.03, 0.04], claw: [0.17, 0.1, 0.17], leg: [0.11, 0.105, 0.15], finger: [0.14, 0.06, 0.16], tip: [0.28, 0.03, 0.06] },
  // dark brown (45, 55)
  { base: [0.036, 0.028, 0.021], band: [0.09, 0.075, 0.05], mottle: [0.018, 0.014, 0.011], claw: [0.045, 0.03, 0.024], leg: [0.05, 0.05, 0.055], finger: [0.06, 0.03, 0.05], tip: [0.16, 0.03, 0.03] },
  // green-olive (21, 32, 62)
  { base: [0.07, 0.078, 0.055], band: [0.17, 0.17, 0.11], mottle: [0.032, 0.036, 0.026], claw: [0.07, 0.06, 0.05], leg: [0.06, 0.09, 0.12], finger: [0.08, 0.05, 0.1], tip: [0.26, 0.04, 0.05] },
];
/** the sandy, translucent juvenile (1, 3, 23, 24, 68; the pink-tipped fingers of 26–31) */
const JUVENILE = { base: [0.24, 0.2, 0.12], band: [0.36, 0.32, 0.21], mottle: [0.12, 0.09, 0.055], claw: [0.24, 0.19, 0.13], leg: [0.2, 0.2, 0.2], finger: [0.3, 0.22, 0.22], tip: [0.42, 0.06, 0.07] };

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
if (aAux.y > 0.5 && aAux.y < 2.5 && abs(aAux.y - (uSex + 1.0)) > 0.5) transformed = vec3(0.0);
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
uniform float uJuv, uSandCoat, uWet, uGroundY, uMmScale;
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
  vec3 c = mix(uVentral * 0.9, base * (0.85 + 0.3 * amNoise(mm * 0.35 + seed)), smoothstep(-0.85, -0.2, upper));
  return mix(c, uSpot * 0.92, gzSpots(mm, cell, dens, 0.2, 0.46, fw, seed) * smoothstep(-0.5, 0.1, upper) * 0.88);
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
float gzRough = 0.42, gzCoat = 0.0, gzHgt = 0.0, gzThin = 0.0, gzSand = 0.0, gzEye = 0.0, gzAO = 1.0;
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
    // ---- the dorsum
    vec2 X = P.xz;
    float ax = abs(X.x);
    float lowf = gzFbm(X * 0.07 + sd * 13.0);
    gzCol = uBase * (0.85 + 0.32 * lowf);
    // dark mottling over the gastric, cardiac and branchial regions
    float mot = smoothstep(0.5, 0.78, gzFbm(X * 0.16 + sd.yx * 21.0));
    gzCol = mix(gzCol, uMottle, mot * 0.55);
    // pale granular bands: the epibranchial lines (from the spine's base forward and in) and the H of the grooves
    float dEpi = min(min(gzSeg(vec2(ax, X.y), vec2(34.5, -3.6), vec2(24.0, 1.2)), gzSeg(vec2(ax, X.y), vec2(24.0, 1.2), vec2(13.2, 5.6))), gzSeg(vec2(ax, X.y), vec2(13.2, 5.6), vec2(8.5, 6.0)));
    float dH = min(min(abs(X.y - (-2.4 + 0.028 * X.x * X.x)) + step(12.0, ax) * 9.0, gzSeg(vec2(ax, X.y), vec2(6.2, -4.5), vec2(8.2, -17.0))), gzSeg(vec2(ax, X.y), vec2(5.5, 13.5), vec2(9.5, 3.5)));
    float wob = 0.6 * (amNoise(X * 0.9 + sd * 5.0) - 0.5);
    // (granular and broken, not painted lines: 61, 19)
    float brk = smoothstep(0.25, 0.75, amNoise(X * 0.45 + sd * 3.0)) * (0.7 + 0.3 * amNoise(X * 2.3));
    float band = ((1.0 - smoothstep(1.0, 2.8, dEpi + wob)) * 0.7 + (1.0 - smoothstep(0.4, 1.5, dH + wob * 0.6)) * 0.4) * (0.45 + 0.55 * brk);
    // a pale field over the front and along the posterior margin (4, 61)
    band += 0.35 * smoothstep(14.0, 20.0, X.y) * (1.0 - smoothstep(10.0, 16.0, ax)) + 0.3 * smoothstep(-19.0, -22.5, X.y);
    gzCol = mix(gzCol, uBand, clamp(band, 0.0, 1.0) * (0.75 + 0.25 * lowf));
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
    gzCol = mix(gzCol, uSpot * (0.82 + 0.15 * lowf), sp * 0.88);
    // the teeth: paler and a little translucent towards their tips; the lateral spines' tips dark
    float spine = smoothstep(37.0, 42.0, ax) * step(-9.0, X.y) * step(X.y, 1.5);
    gzCol = mix(gzCol, mix(uBand * 1.25, uTip * 0.5 + vec3(0.04, 0.03, 0.03), spine), smoothstep(0.35, 1.0, tooth) * 0.7);
    gzThin += tooth * 0.5;
    // the granulation (39, 61)
    gzHgt = 2.0 * gzGranules(X, 0.42, fw, sd.x * 7.0) + 0.6 * gzGranules(X * 1.9 + 3.0, 0.42, fw, sd.y * 7.0);
    gzCol *= 1.0 + 0.7 * gzHgt;
    gzRough = 0.36 + 0.4 * gzHgt;
  } else if (part == 1) {
    // ---- the carapace's underside, the body wall, the front face: bluish white, the margin's underside paler
    gzCol = uVentral * (0.82 + 0.16 * gzFbm(P.xz * 0.2 + sd));
    gzCol = mix(gzCol, uBand * 1.1, smoothstep(0.55, 0.0, cav) * 0.25);
    gzHgt = 0.6 * gzGranules(P.xz, 0.5, fw, sd.y);
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
    } else if (P.y < 2.0) {
      for (int k = 0; k < 4; k++) {
        float zc = 9.5 - 6.5 * float(k);
        suture = max(suture, 1.0 - smoothstep(0.1, 0.45, abs(P.z - zc - 0.012 * P.x * P.x)));
      }
      suture = max(suture, (1.0 - smoothstep(0.1, 0.35, abs(P.x))) * step(P.z, 2.0));
    } else {
      // the third maxillipeds: white with a violet inner edge (66)
      gzCol = mix(gzCol, uFinger * 1.4, smoothstep(0.8, 0.98, vSeg.x) * 0.8);
    }
    gzCol *= 1.0 - 0.28 * suture;
    gzRough = 0.26;
  } else if (part == 3 || part == 4 || part == 5 || part == 12) {
    // ---- the cheliped
    vec3 base = uClaw;
    gzCol = gzLimb(base, upper, vMm, 1.55, 0.55, fw, sd.x + float(part));
    // the costae a little paler (the shader sees them as the ridges' lighter tops)
    if (part == 4 || part == 5) {
      float fin = part == 5 ? t : smoothstep(0.55, 1.0, t);
      float tipK = part == 5 ? smoothstep(0.72, 1.0, t) : smoothstep(0.88, 1.0, t);
      vec3 f = mix(gzCol, uFinger, smoothstep(0.1, 0.6, fin) * 0.85);
      f = mix(f, uTip, tipK * 0.85);
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
    gzRough = 0.34;
  } else if (part == 13) {
    // ---- the fingers' teeth: ivory, the tips a little translucent
    gzCol = mix(uVentral * 0.95, vec3(0.62, 0.58, 0.5), t);
    gzRough = 0.3; gzThin = 0.35 * t;
  } else if (part == 6 || part == 8) {
    // ---- walking legs (and the paddle's merus, carpus): blue-grey above with white spots, white below
    vec3 base = part == 8 ? mix(uLeg, uClaw, 0.35) : uLeg;
    gzCol = gzLimb(base, upper, vMm, 1.5, part == 8 ? 0.5 : 0.24, fw, sd.y + float(part));
    // the joints a little warmer (46)
    gzCol = mix(gzCol, gzCol * vec3(1.25, 0.95, 0.8), (smoothstep(0.88, 1.0, t) + smoothstep(0.1, 0.0, t)) * 0.5);
    gzHgt = 0.4 * gzGranules(vMm, 0.45, fw, sd.y + float(part));
    gzRough = 0.36;
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
    // ---- the cornea: near black, the facets catching the light
    vec2 id;
    vec3 c = amCells(vec2(vSeg.y * 60.0, vSeg.x * 22.0), id);
    gzHgt = (1.0 - smoothstep(0.2, 0.5, c.x)) * 0.012 * (1.0 - smoothstep(0.05, 0.2, fw));
    gzCol = mix(vec3(0.03, 0.017, 0.011), vec3(0.11, 0.05, 0.03), smoothstep(0.6, 0.35, vSeg.x));
    gzRough = 0.12; gzEye = 1.0;
  } else if (part == 11) {
    // ---- eyestalks, antennae, antennules: the dorsum's pale olive, a reddish base to the eyestalk (19)
    gzCol = mix(uBand * 0.75, vec3(0.2, 0.08, 0.05), smoothstep(0.5, 0.0, t) * 0.5);
    gzRough = 0.4; gzThin = 0.3;
  }
  // a juvenile's shell lets the light through
  gzThin += uJuv * 0.35;
  // sand and silt: in the crevices, at the joints, under the margins; over the top after burying
  vec3 nW = normalize(vRestN);
  float grit = amNoise(P.xz * 3.1 + P.y * 1.7 + sd * 4.0);
  gzSand = clamp(smoothstep(0.45, 0.95, cav) * 0.55 * smoothstep(0.35, 0.75, grit) + uSandCoat * smoothstep(0.0, 0.6, nW.y + 0.25) * smoothstep(0.25, 0.65, grit + 0.25 * uSandCoat), 0.0, 1.0);
  // the sand where the crab sits in it (its own grains, its own light)
  float nearBed = 1.0 - smoothstep(0.0, 0.004 * uMmScale * 1000.0, vWPos.y - uGroundY);
  gzSand = max(gzSand, nearBed * 0.8 * smoothstep(0.2, 0.6, grit));
  gzAO = 1.0 - 0.45 * cav;
  gzCol *= gzAO;
  gzCol = mix(gzCol, uCover * (0.75 + 0.5 * grit), gzSand);
  gzRough = mix(gzRough, 0.92, gzSand);
  // wet: a film of water over the shell; drying out in the air it dulls
  gzCoat = uWet * (1.0 - gzSand) * (part == 9 ? 0.3 : 0.6);
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
  m.envMapIntensity = 0.45;
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
#ifdef USE_CLEARCOAT
  material.clearcoat = gzCoat;
#endif
#ifdef USE_IRIDESCENCE
  material.iridescence = gzEye * 0.7;
  material.iridescenceThickness = 380.0;
#endif`)
      .replace('#include <lights_fragment_begin>', SUN_INJECT)
      .replace('#include <lights_fragment_maps>', `${ENV_INJECT}
  // sand on the shell takes the bed's light, not the water's
  iblIrradiance *= mix(1.0, 0.3, gzSand);
  radiance *= mix(1.0, 0.2, gzSand);`)
      .replace('#include <emissivemap_fragment>', THIN);
  };
  m.customProgramCacheKey = () => (low ? 'gazami-shell-low-v1' : 'gazami-shell-v1');
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
    if (spec.sex === 1) tip.lerp(new Color(0.36, 0.09, 0.03), 0.5);
    this.uniforms = {
      uBase: { value: pick('base') }, uBand: { value: pick('band') }, uSpot: { value: new Color(0.6, 0.58, 0.52).multiplyScalar(0.92 + 0.1 * spec.value) },
      uMottle: { value: pick('mottle') }, uClaw: { value: pick('claw') }, uLeg: { value: pick('leg') }, uFinger: { value: pick('finger') }, uTip: { value: tip },
      uVentral: { value: new Color(0.58, 0.62, 0.68).lerp(new Color(0.6, 0.56, 0.48), j * 0.5) }, uPaddle: { value: pick('leg').lerp(new Color(0.2, 0.19, 0.14), 0.4) },
      uSeed: { value: new Vector2((spec.seed * 97.31) % 37.0, (spec.seed * 53.17) % 29.0) },
      uSex: { value: spec.sex }, uJuv: { value: j }, uSandCoat: { value: 0 }, uWet: { value: 1 },
      uCover: { value: new Color(0.37, 0.37, 0.355) }, uGroundY: { value: -1e3 }, uMmScale: { value: 0.001 },
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
