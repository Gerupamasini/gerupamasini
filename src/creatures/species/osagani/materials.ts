import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type IUniform, type WebGLProgramParametersWithUniforms } from 'three';
import { CHELA_MALE } from './anatomy';
import type { OsaganiLookLike } from './model';

/**
 * Materials of the ヤマトオサガニ: standard PBR (MeshPhysicalMaterial: roughness, a clearcoat for the film of water on
 * a wet shell) with the colour and the surface worked in through onBeforeCompile, lit by the scene's own light (it
 * lives on the exposed mud at low tide and in the shallow pools: the water pass draws the water over it).
 *
 * Nothing is a texture: the colour is computed from the rest-pose position (mm, CW 35) and the part each vertex belongs
 * to, so it has no seams, is the individual's own (seeded, never mirrored) and stays sharp up close. Colours measured on
 * the photographs (linear):
 *  - dorsum: mud-brown to grey-brown and dark olive-grey (A45, A13, A28, B7, B41, B49), pale and sandy in the young
 *    (B24, B52); a fine dense speckle of dark dots (B63, B65, B69), a low mottle of darker and paler patches, the
 *    grooves dark, the granular ridges and the beaded orbital margin paler (B15, B63); a film of mud in the grooves and
 *    over the back, thicker on some (B56, B57)
 *  - legs: the dorsum's colour, mottled in dark bands across the meri (B65, B70), paler below, the articular membranes
 *    and the joints' rims yellowish (A45, B29), the dactyli darker with pale tips
 *  - the mature male's chela: the palm cream-white, some bluish (A45, B12, B14, B29, B33), its upper margin brownish,
 *    the cutting edges dark brown, the finger tips orange-yellow (B29, A45); the arm (merus, carpus) like the legs. The
 *    female's: small, brownish to blue-grey, the fingers pinkish towards the tips (B62, B68)
 *  - third maxillipeds: pale cream (the white ovals of every front view: A47, B4, B12); underside cream-yellow (B34)
 *  - eyestalks: translucent grey-brown; the cornea dark brown, finely reticulated (B59, B60, B66)
 * The surface: the carapace finely granular, the margins beaded (B15, B63) — relief in the shading; wet, the shell is
 * glossy under a film of water (clearcoat), the mud film matt.
 */

export interface OsLookSpec {
  seed: number;
  /** 0 male, 1 female */
  sex: 0 | 1;
  /** the mature male's chela (otherwise the female's / the young male's) */
  maleChela: boolean;
  /** 0 adult … 1 small young (paler, sandier) */
  juvenile: number;
  /** the colour morph: 0 mud-brown, 1 grey-brown, 2 dark olive-grey */
  morph: number;
  /** the male's palm: 0 cream-white … 1 bluish white */
  palmBlue: number;
  /** mud on the shell (0 clean … 1 caked) */
  mud: number;
  /** brightness of the individual (≈ 1) */
  value: number;
}

export interface OsUniforms {
  [k: string]: IUniform;
  uBase: IUniform<Color>;
  uDark: IUniform<Color>;
  uPale: IUniform<Color>;
  uLeg: IUniform<Color>;
  uJoint: IUniform<Color>;
  uPalm: IUniform<Color>;
  uEdge: IUniform<Color>;
  uFingerTip: IUniform<Color>;
  uFemaleClaw: IUniform<Color>;
  uVentral: IUniform<Color>;
  uMxp: IUniform<Color>;
  uCornea: IUniform<Color>;
  uMud: IUniform<Color>;
  uSeed: IUniform<Vector2>;
  uSex: IUniform<number>;
  uMaleChela: IUniform<number>;
  uMudCoat: IUniform<number>;
  uWet: IUniform<number>;
  uGroundY: IUniform<number>;
  uMmScale: IUniform<number>;
}

/** the morphs' colours (linear albedo): dorsum base, dark speckle and mottle, pale granules, legs */
const MORPHS: { base: number[]; dark: number[]; pale: number[]; leg: number[] }[] = [
  // mud-brown (A45, A13, B29)
  { base: [0.17, 0.098, 0.04], dark: [0.04, 0.024, 0.011], pale: [0.38, 0.26, 0.12], leg: [0.2, 0.118, 0.045] },
  // grey-brown (B7, B43, B44, A47)
  { base: [0.11, 0.085, 0.055], dark: [0.028, 0.021, 0.014], pale: [0.27, 0.22, 0.15], leg: [0.125, 0.09, 0.052] },
  // dark olive-grey (A28, B41, B49)
  { base: [0.058, 0.048, 0.03], dark: [0.016, 0.013, 0.009], pale: [0.17, 0.15, 0.1], leg: [0.065, 0.05, 0.03] },
];
/** the young: pale, sandy grey (B24, B52, B53) */
const YOUNG = { base: [0.25, 0.22, 0.17], dark: [0.09, 0.075, 0.058], pale: [0.44, 0.4, 0.33], leg: [0.25, 0.22, 0.17] };

const lerp3 = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

// ------------------------------------------------------------------ GLSL

const VERT_PARS = /* glsl */ `
attribute float aPart;
attribute vec2 aSeg;
attribute vec2 aAux;
attribute vec2 aMm;
uniform float uSex;
uniform float uMaleChela;
varying float vPart;
varying vec2 vSeg;
varying vec2 vAux;
varying vec2 vMm;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vWPos;
`;

/** the other sex's abdomen and the other form's chela fold away to nothing */
export const FOLD_GLSL = /* glsl */ `
{
  float fl = aAux.y;
  if ((fl > 0.5 && fl < 2.5 && abs(fl - (uSex + 1.0)) > 0.5) || (fl > 4.5 && fl < 6.5 && abs(fl - (6.0 - uMaleChela)) > 0.5)) transformed = vec3(0.0);
}
`;

const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
vPart = aPart; vSeg = aSeg; vAux = aAux; vMm = aMm;
vRest = position * 1000.0;
vRestN = normal;
${FOLD_GLSL}
`;

const FRAG_PARS = /* glsl */ `
varying float vPart;
varying vec2 vSeg;
varying vec2 vAux;
varying vec2 vMm;
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vWPos;
uniform vec3 uBase, uDark, uPale, uLeg, uJoint, uPalm, uEdge, uFingerTip, uFemaleClaw, uVentral, uMxp, uCornea, uMud;
uniform vec2 uSeed;
uniform float uMudCoat, uWet, uGroundY, uMmScale, uMaleChela;
`;

const FUNCS = /* glsl */ `
float osHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 osHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float osNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(osHash(i), osHash(i + vec2(1.0, 0.0)), f.x), mix(osHash(i + vec2(0.0, 1.0)), osHash(i + vec2(1.0, 1.0)), f.x), f.y); }
float osFbm(vec2 p) { return 0.55 * osNoise(p) + 0.3 * osNoise(p * 2.13 + 7.1) + 0.15 * osNoise(p * 4.37 - 3.3); }
// cellular noise: distance to the nearest jittered point and the cell's id
float osCells(vec2 p, out vec2 id) {
  vec2 i = floor(p), fp = fract(p);
  float d1 = 8.0;
  id = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = 0.1 + 0.8 * osHash2(i + g);
    float d = length(g + o - fp);
    if (d < d1) { d1 = d; id = i + g; }
  }
  return d1;
}
/** a dense speckle of small dark dots (cell mm, how many cells hold a dot), melting into its mean cover far away */
float osSpeckle(vec2 p, float cell, float dens, float fw, float seed) {
  vec2 id;
  float d = osCells(p / cell + seed, id);
  float on = step(1.0 - dens, osHash(id + seed * 3.7));
  float r = 0.18 + 0.2 * osHash(id * 1.7 + seed);
  float soft = max(0.05, fw / cell * 1.2);
  float s = on * (1.0 - smoothstep(r - soft, r + soft, d));
  return mix(s, dens * 0.14, smoothstep(0.25, 0.7, fw / cell));
}
/** granules: rounded bumps on a cellular grid; height (mm) */
float osGranules(vec2 p, float cell, float fw, float seed) {
  vec2 id;
  float d = osCells(p / cell + seed, id);
  float r = 0.38 + 0.14 * osHash(id * 1.3 + seed);
  float g = 1.0 - smoothstep(0.0, r, d);
  return g * g * cell * 0.25 * (1.0 - smoothstep(0.2, 0.5, fw / cell));
}
`;

/**
 * The colour and surface at this fragment: osCol, osRough, osCoat (the water film's share), osHgt (mm, relief for the
 * shading), osMud (the mud film).
 */
const TPF = CHELA_MALE.fixedFrom!.toFixed(3);
const SURFACE = /* glsl */ `
vec3 osCol = uBase;
float osRough = 0.5, osHgt = 0.0, osMud = 0.0, osCoat = 1.0, osSpec = 1.0, osDry = 0.0;
{
  vec3 P = vRest;
  int part = int(vPart + 0.5);
  float fw = max(length(fwidth(P)), 1e-4);
  float cav = vAux.x;
  vec2 sd = uSeed;
  // the limbs' own surface coordinate (mm along, mm round) and where round the article this is
  vec2 mm = vMm;
  float t = vSeg.x;
  float ang = vSeg.y * 6.2831853;
  float upper = cos(ang);
  float fwL = max(length(fwidth(mm)), 1e-4);
  float lowMud = 0.0;

  if (part == 0 || part == 13 || part == 1) {
    // the carapace: a low mottle, the fine dark speckle, pale granular lines, dark grooves (the walls under the margin
    // take the plane they face, so that nothing streaks down them)
    vec3 nR = abs(normalize(vRestN));
    vec2 X = nR.y > 0.6 ? P.xz : nR.x > nR.z ? P.zy + vec2(0.0, 31.0) : P.xy + vec2(17.0, 0.0);
    float m = osFbm(X * 0.22 + sd * 13.0);
    osCol = uBase * (0.78 + 0.45 * m);
    osCol = mix(osCol, uDark * 1.6, smoothstep(0.55, 0.8, osFbm(X * 0.45 + sd.yx * 7.0)) * 0.45);
    float sp = osSpeckle(X, 0.3, 0.5, fw, sd.x);
    sp = max(sp, osSpeckle(X + 3.1, 0.6, 0.18, fw, sd.y) * 0.8);
    osCol = mix(osCol, uDark, sp * 0.6);
    float g = osGranules(X, 0.32, fw, sd.x * 0.37);
    osHgt += g;
    osCol = mix(osCol, uPale, smoothstep(0.03, 0.08, g) * 0.18);
    if (part == 0) {
      // the grooves (cavity from the geometry's relief) dark and muddy; the margin's rim and the orbital beading pale
      // (the beaded rim only along the front and the anterolateral margins: behind them the shoulder rolls over)
      float rim = smoothstep(0.55, 0.99, vSeg.x) * (1.0 - step(0.999, vSeg.x)) * smoothstep(-2.5, 1.5, P.z);
      osCol = mix(osCol, uPale * 0.9, rim * 0.35);
      osRough = 0.46 + 0.25 * smoothstep(0.03, 0.08, g);
    } else {
      // under the margin: the branchiostegal walls and the pterygostomian faces under a felt of short setae that holds
      // the mud — dark brown and matt in every field photograph (A45, A47, B7, B29), grey-blue only when washed (B60,
      // B61); darker down towards the coxae; the orbits' trenches in shadow
      // (the orbits' trenches by their cavity weight, which the geometry ramps up into them)
      float down = smoothstep(0.1, 0.9, vSeg.x);
      float orb = part == 13 ? 1.0 : smoothstep(0.62, 0.78, cav);
      vec3 felt = mix(uDark * 1.9, uMud * 0.55, 0.35 + 0.3 * osFbm(X * 0.9 + sd * 3.0));
      osCol = mix(osCol, felt, mix(0.62 + 0.25 * down, 0.4, orb));
      osCol = mix(osCol, uVentral * 0.7, 0.12 * (1.0 - uMudCoat) * (1.0 - orb));
      osCol *= mix(1.0 - 0.18 * down, 0.3, orb);
      // (where the wall's foot turns under towards the coxae it is the pale pleural and sternal edge: B61, B64, B67)
      float under = smoothstep(-0.25, -0.75, normalize(vRestN).y) * (1.0 - orb);
      osCol = mix(osCol, uVentral * 0.82, under * 0.85);
      osHgt *= 0.5;
      osRough = 0.82;
      lowMud = mix(0.35, 0.55, orb);
    }
  } else if (part == 2) {
    // sternum and abdomen: cream-yellow, the sutures darker
    osCol = uVentral * (0.85 + 0.25 * osFbm(P.xz * 0.5 + sd));
    // the sternites: sutures running out from the abdomen's cavity to the gaps between the coxae, a little curved
    // (B61, B64, B67); the abdomen's own somites across it (its flag: vAux.y 1 or 2)
    float ax = abs(P.x);
    float sut = 0.0;
    if (vAux.y > 0.5 && vAux.y < 2.5) sut = smoothstep(0.8, 0.97, abs(sin(P.z * 1.05 + 0.4)));
    else {
      for (int k = 0; k < 4; k++) {
        float z0 = k == 0 ? 5.0 : k == 1 ? 1.3 : k == 2 ? -2.7 : -6.4;
        float d = abs(P.z - (z0 + 0.012 * ax * ax * (k == 0 ? 1.0 : -0.6)));
        sut = max(sut, smoothstep(0.22, 0.04, d) * smoothstep(3.5, 6.0, ax));
      }
    }
    osCol = mix(osCol, uVentral * 0.5, sut * 0.5);
    osRough = 0.5;
    lowMud = 0.35;
  } else if (part == 3) {
    // third maxillipeds: pale cream, a fine pitting, the ischio-meral suture
    osCol = uMxp * (0.9 + 0.15 * osNoise(vSeg * 9.0 + sd));
    // the merus the white oval of the field photographs (A47, A45, B29); the ischium below greyer and muddier, the
    // plates' edges shaded
    osCol = mix(osCol, mix(uMxp * 0.62, uMud * 0.8, 0.45), smoothstep(0.42, 0.56, vSeg.y) * 0.7);
    osCol *= 0.78 + 0.22 * smoothstep(0.0, 0.12, min(vSeg.x, 1.0 - vSeg.x)) * smoothstep(0.0, 0.08, min(vSeg.y, 1.0 - vSeg.y));
    osCol = mix(osCol, uMxp * 0.6, smoothstep(0.03, 0.0, abs(vSeg.y - 0.42)) * 0.6);
    osCol = mix(osCol, uDark * 4.0, osSpeckle(vSeg * vec2(9.0, 12.0), 0.25, 0.25, fwL * 0.5, sd.x) * 0.15);
    // the merus's outer upper corner grey, finely speckled dark (B61, B64, B67)
    float mg = smoothstep(0.75, 0.2, length(vSeg * vec2(1.0, 2.2)));
    osCol = mix(osCol, uMxp * 0.5 * (0.8 + 0.4 * osNoise(vSeg * 23.0 + sd)), mg * 0.55);
    osCol = mix(osCol, uDark * 2.5, osSpeckle(vSeg * vec2(26.0, 34.0), 0.3, 0.3, fwL * 0.5, sd.y) * mg * 0.5);
    osRough = 0.38;
  } else if (part == 10 || part == 11) {
    // eyestalk and cornea (vSeg.x: signed distance from the cornea's edge, > 0 on the cornea)
    float cor = smoothstep(-0.06, 0.06, vSeg.x) * step(2.5, vAux.y);
    vec3 stalk = mix(uLeg * 1.25, uPale, 0.25) * (0.85 + 0.25 * osNoise(mm * 1.3 + sd));
    stalk = mix(stalk, uDark * 2.0, osSpeckle(mm, 0.35, 0.3, fwL, sd.y) * 0.5);
    vec2 id;
    float net = osCells(mm * 3.2 + sd, id);
    vec3 eye = uCornea * (0.7 + 0.6 * osHash(id)) * mix(0.6, 1.2, smoothstep(0.05, 0.3, net));
    osCol = mix(stalk, eye, cor);
    osRough = mix(0.4, 0.15, cor);
    osSpec = mix(0.9, 1.3, cor);
  } else if (part == 5 || part == 6 || part == 14 || part == 15) {
    // the chela: the male's palm cream-white with a brownish upper margin, the cutting edges dark brown and the finger
    // tips orange; the female's small, brownish, pink towards the tips. The fingers (6 the dactylus, 15 the fixed
    // finger) run t 0 … 1 to their tips; the cutting edge is the dactylus's lower face and the fixed finger's upper
    bool male = vAux.y > 4.5 && vAux.y < 5.5;
    bool finger = part == 6 || part == 15;
    float tipK = finger ? smoothstep(0.5, 1.0, t) : 0.0;
    // (the male's palm runs on into its fixed finger: from fixK on, t along the finger is ft)
    float fixK = male && part == 5 ? smoothstep(${TPF} - 0.03, ${TPF} + 0.01, t) : 0.0;
    float ft = male && part == 5 ? clamp((t - ${TPF}) / (1.0 - ${TPF}), 0.0, 1.0) : t;
    // (the cutting edges' brown band reaching round onto the outer face a little: a dark line along the slit, A45; the
    // palm's distal face behind the dactylus dark with it)
    float edge = part == 6 ? smoothstep(0.0, -0.5, upper) : part == 15 ? smoothstep(0.0, 0.5, upper) : fixK * smoothstep(0.0, 0.5, upper);
    if (male) {
      osCol = uPalm * (0.86 + 0.2 * osFbm(mm * 0.4 + sd));
      // the palm's surface: a fine reticulate granulation in faint grey (A45, B33: the "crazed" white enamel), the upper
      // margin and the carpal end brownish (A45, B12)
      vec2 rid;
      float ret = osCells(mm * 1.6 + sd, rid);
      osCol *= 0.9 + 0.1 * smoothstep(0.15, 0.45, ret);
      float palmK = part == 5 ? 1.0 - fixK : 0.0;
      osCol = mix(osCol, uLeg * 1.4, palmK * (smoothstep(0.55, 0.95, upper) * 0.65 + smoothstep(0.1, 0.0, t) * 0.5));
      osCol = mix(osCol, uDark * 2.0, palmK * osSpeckle(mm, 0.3, 0.35, fwL, sd.y) * smoothstep(0.3, 0.9, upper) * 0.6);
      osCol = mix(osCol, uEdge, edge);
      // (the brown edges matt, not glazed by the water film: they read dark even where the slit is seen glancingly)
      osSpec = 1.0 - 0.6 * edge;
      osDry = edge * 0.8;
      // (the fingers white to their tips, the tips orange: B23, B29, A45)
      osCol = mix(osCol, uFingerTip, smoothstep(0.68, 1.0, ft) * (finger ? 0.8 : 0.8 * fixK) * (1.0 - edge * 0.4));
      osHgt += osGranules(mm, 0.22, fwL, sd.x) * 0.35;
      osRough = 0.3;
    } else {
      osCol = mix(uFemaleClaw, uPale, 0.2) * (0.85 + 0.3 * osFbm(mm * 0.5 + sd));
      osCol = mix(osCol, uFingerTip * vec3(1.0, 0.55, 0.6), tipK * 0.7);
      osRough = 0.42;
    }
    if (part == 14) { osCol = male ? uEdge * 1.4 : uFemaleClaw; osRough = 0.35; }
  } else {
    // legs, the cheliped's arm, spines, membranes: the dorsum's colour, dark bands across the meri, paler below,
    // the joints' rims and membranes yellowish
    vec3 c = uLeg * (0.8 + 0.4 * osFbm(mm * 0.35 + sd));
    float band = smoothstep(0.45, 0.75, osFbm(vec2(mm.x * 0.42, mm.y * 0.12) + sd * 5.0));
    c = mix(c, uDark * 1.4, band * 0.55);
    c = mix(c, uDark, osSpeckle(mm, 0.45, 0.4, fwL, sd.x + 3.0) * 0.6);
    c = mix(c, uVentral * 0.8, smoothstep(-0.2, -0.85, upper) * 0.55);
    float rimK = smoothstep(0.9, 1.0, t) + smoothstep(0.08, 0.0, t);
    c = mix(c, uJoint, clamp(rimK, 0.0, 1.0) * 0.5);
    if (part == 9) c = mix(uJoint, uVentral, 0.3);
    if (part == 8) { c = mix(c * 0.75, uJoint * 1.2, smoothstep(0.8, 1.0, t)); }
    if (part == 12) c = mix(uPale, uJoint, 0.4);
    osCol = c;
    osHgt += osGranules(mm, 0.28, fwL, sd.y) * 0.6;
    osRough = part == 9 ? 0.62 : 0.5;
    lowMud = 0.15;
  }

  // the mud film: in the crevices, under the margins and on the body, over the back of the muddier ones (B56, B57),
  // and on the feet that stand in it
  float above = (vWPos.y - uGroundY) / max(uMmScale, 1e-6);
  float foot = 1.0 - smoothstep(0.4, 2.2, above);
  float mudPatch = smoothstep(0.35, 0.75, osFbm(P.xz * 0.18 + P.y * 0.12 + sd * 9.0));
  osMud = clamp(cav * 0.6 + lowMud + uMudCoat * (0.35 + 0.65 * mudPatch) + foot * 0.7, 0.0, 1.0) * (part == 10 ? 0.0 : 1.0);
  osMud *= part == 10 || part == 11 ? 0.3 : 1.0;
  osMud = smoothstep(0.25, 0.85, osMud + 0.15 * (osNoise(P.xz * 1.7 + P.y) - 0.5));
  osCol = mix(osCol, uMud * (0.85 + 0.3 * osNoise(P.xz * 2.3 + sd)), osMud * 0.85);
  osHgt *= 1.0 - osMud * 0.7;
  osRough = mix(osRough, 0.88, osMud);
  // a wet shell: a film of water over it (glossy), the matt mud drinks it in; dry, the shell dulls
  osCoat = 0.75 * uWet * (1.0 - osMud * 0.75) * (1.0 - osDry);
  osRough = mix(osRough + 0.15, osRough, uWet);
  diffuseColor.rgb = osCol;
}
`;

const NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 sp = -vViewPosition;
  vec2 dH = vec2(dFdx(osHgt), dFdy(osHgt)) * uMmScale;
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

function shellMaterial(u: OsUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12, side: FrontSide, specularIntensity: 0.6, ior: 1.5 });
  m.name = 'OsaganiShell';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_BEGIN)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('void main() {', `${FUNCS}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(osRough, 0.08, 1.0);')
      .replace('#include <normal_fragment_maps>', NORMAL)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.specularColor *= osSpec;
#ifdef USE_CLEARCOAT
  material.clearcoat = osCoat;
  material.clearcoatRoughness = 0.1 + 0.25 * (1.0 - uWet);
#endif`);
  };
  m.customProgramCacheKey = () => 'osagani-shell-v1';
  return m;
}

/** the setae: fine hairs drawn strand by strand on their cards (brownish, translucent at the tips: A32, B24, B49, B62) */
function setaeMaterial(u: OsUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, metalness: 0, side: DoubleSide, alphaTest: 0.5 });
  m.name = 'OsaganiSetae';
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 aSeg;\nattribute vec2 aAux;\nattribute float aPart;\nuniform float uSex;\nuniform float uMaleChela;\nvarying vec2 vSeg;\nvarying float vPart;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSeg = aSeg; vPart = aPart;\n${FOLD_GLSL}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vSeg;\nvarying float vPart;\nuniform vec3 uPale, uLeg, uMud;\nuniform vec2 uSeed;\nuniform float uMudCoat;`)
      .replace('void main() {', `float osHashS(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // strands ≈ 0.04 mm apart (CW 35), each its own length, a little wavy, thinning to the tip
  float x = vSeg.x / 0.045;
  float id = floor(x);
  float len = 0.5 + 0.5 * osHashS(vec2(id, uSeed.x));
  float wave = 0.12 * sin(vSeg.y * 6.0 + id);
  float f = abs(fract(x + wave * vSeg.y) - 0.5);
  float w = 0.3 * (1.0 - vSeg.y / len);
  if (step(vSeg.y, len) * step(f, w) < 0.5) discard;
  diffuseColor.rgb = mix(uLeg * 1.3, uPale * 1.1, vSeg.y * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMud, uMudCoat * 0.4 * (1.0 - vSeg.y));
}`);
  };
  m.customProgramCacheKey = () => 'osagani-setae-v1';
  return m;
}

/** One crab's materials (programs shared between crabs, uniforms its own). */
export class OsaganiLook implements OsaganiLookLike {
  readonly uniforms: OsUniforms;
  readonly shell: MeshPhysicalMaterial;
  readonly setae: MeshStandardMaterial;
  readonly spec: OsLookSpec;

  constructor(spec: OsLookSpec) {
    this.spec = spec;
    const mi = Math.max(0, Math.min(MORPHS.length - 1, Math.floor(spec.morph)));
    const M = MORPHS[mi];
    const j = Math.max(0, Math.min(1, spec.juvenile));
    const pick = (k: keyof typeof YOUNG) => new Color(...(lerp3(M[k], YOUNG[k], j).map((v) => v * spec.value) as [number, number, number]));
    const palm = new Color(0.52, 0.48, 0.36).lerp(new Color(0.36, 0.5, 0.56), spec.palmBlue);
    this.uniforms = {
      uBase: { value: pick('base') }, uDark: { value: pick('dark') }, uPale: { value: pick('pale') }, uLeg: { value: pick('leg') },
      uJoint: { value: new Color(0.48, 0.25, 0.055).lerp(pick('pale'), 0.25) },
      uPalm: { value: palm }, uEdge: { value: new Color(0.06, 0.035, 0.018) }, uFingerTip: { value: new Color(0.72, 0.3, 0.04) },
      uFemaleClaw: { value: pick('leg').lerp(new Color(0.2, 0.22, 0.26), 0.35) },
      uVentral: { value: new Color(0.5, 0.43, 0.25).lerp(new Color(0.55, 0.53, 0.48), j * 0.6) }, uMxp: { value: new Color(0.62, 0.6, 0.52) },
      uCornea: { value: new Color(0.09, 0.055, 0.03) }, uMud: { value: new Color(0.16, 0.12, 0.075) },
      uSeed: { value: new Vector2((spec.seed * 97.31) % 37.0, (spec.seed * 53.17) % 29.0) },
      uSex: { value: spec.sex }, uMaleChela: { value: spec.maleChela ? 1 : 0 },
      uMudCoat: { value: spec.mud }, uWet: { value: 1 }, uGroundY: { value: -1e3 }, uMmScale: { value: 0.001 },
    };
    this.shell = shellMaterial(this.uniforms);
    this.setae = setaeMaterial(this.uniforms);
  }

  /** (one program for every tier: the fine relief fades with the pixel's footprint by itself) */
  shellFor(): MeshPhysicalMaterial { return this.shell; }

  /** the mud it lives on (linear colour): the film on its shell */
  setMud(r: number, g: number, b: number): void { this.uniforms.uMud.value.setRGB(r, g, b); }

  dispose(): void {
    this.shell.dispose(); this.setae.dispose();
  }
}

/** the flat's sediments as the terrain draws them (Terrain.ts SUBSTRATE_COLORS), a little darker: wet */
export const SUBSTRATE_TINT: Record<string, [number, number, number]> = {
  sand: [0.3, 0.29, 0.27], muddy_sand: [0.22, 0.2, 0.18], mud: [0.15, 0.13, 0.1],
  gravel: [0.27, 0.25, 0.22], channel: [0.12, 0.11, 0.1], rock: [0.25, 0.24, 0.22],
};
