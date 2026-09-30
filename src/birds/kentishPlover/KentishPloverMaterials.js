import * as THREE from 'three';
import { plumage as PLUMAGE, animation as ANIM } from './KentishPloverConfig.js';

// breathing displacement amplitude (m): fractional expansion × body half-width
const ANIM_BREATH = (ANIM.breathAmp * 0.021).toFixed(6);

// Materials for the Kentish Plover. All plumage patterns are evaluated procedurally in the bird's
// REST space (mm), so markings stay crisp at any distance and follow the skin when it deforms.
// Evidence for each marking: docs/research.md §3 (S5, S6, S7, S10); colours are estimates (C–D).

const srgb = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB → linear working space

// ------------------------------------------------------------------ shared GLSL
const GLSL_COMMON = /* glsl */ `
float kpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kpHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float kpNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kpHash(i), kpHash(i + vec2(1, 0)), u.x), mix(kpHash(i + vec2(0, 1)), kpHash(i + vec2(1, 1)), u.x), u.y);
}
`;

// ------------------------------------------------------------------ BODY PLUMAGE
const BODY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uForehead, uFrontalBar, uCrown, uNape, uSupercilium, uEyeStripe, uEarCoverts, uCollar;
uniform vec3 uMantle, uMantleDark, uFringe, uBreastPatch, uUnder;
uniform float uMelanin, uWear, uSeed, uDetail, uFluff;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowV; varying vec3 vFlowR;
`;

const BODY_FRAG_FUNCS = /* glsl */ `
${GLSL_COMMON}
float sdSeg2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Feather tract data: x = cell size (mm), y = normal strength, z = softness (0 hard, 1 downy)
vec3 kpTract(vec3 p, vec3 n) {
  float head = smoothstep(68.0, 74.0, p.y + p.z * 0.25 - 7.0) * smoothstep(34.0, 40.0, p.z);
  float neck = smoothstep(26.0, 32.0, p.z) * (1.0 - head);
  float dorsal = smoothstep(-0.15, 0.35, n.y);
  float rump = smoothstep(-26.0, -34.0, p.z);
  vec3 breast = vec3(${PLUMAGE.featherScale.breast.toFixed(2)}, ${PLUMAGE.normalStrength.breast.toFixed(2)}, 0.8);
  vec3 belly = vec3(${PLUMAGE.featherScale.belly.toFixed(2)}, ${PLUMAGE.normalStrength.belly.toFixed(2)}, 1.0);
  vec3 mantle = vec3(${PLUMAGE.featherScale.mantle.toFixed(2)}, ${PLUMAGE.normalStrength.mantle.toFixed(2)}, 0.15);
  vec3 flank = vec3(${PLUMAGE.featherScale.flank.toFixed(2)}, ${PLUMAGE.normalStrength.flank.toFixed(2)}, 0.5);
  vec3 rumpT = vec3(${PLUMAGE.featherScale.rump.toFixed(2)}, ${PLUMAGE.normalStrength.rump.toFixed(2)}, 0.4);
  vec3 t = mix(mix(belly, breast, smoothstep(0.0, 22.0, p.z)), flank, smoothstep(-0.55, 0.0, n.y) * (1.0 - smoothstep(0.1, 0.4, n.y)));
  t = mix(t, mantle, dorsal);
  t = mix(t, rumpT, rump * dorsal);
  t = mix(t, vec3(${PLUMAGE.featherScale.neck.toFixed(2)}, ${PLUMAGE.normalStrength.neck.toFixed(2)}, 0.6), neck);
  t = mix(t, vec3(${PLUMAGE.featherScale.head.toFixed(2)}, ${PLUMAGE.normalStrength.head.toFixed(2)}, 0.5), head);
  return t;
}

// Overlapping feather tips ("roof tiles"): returns height (0..1) of the visible feather, its local
// coordinates (fx across, fy exposed-length fraction) and a stable id.
float kpFeather(vec2 st, out vec2 fxy, out vec2 id) {
  const float K = 0.55; // tip roundness (in cells)
  float r0 = floor(st.y);
  // previous (anterior) row may still cover this point with its rounded tip
  float rp = r0 - 1.0;
  float xp = st.x + 0.5 * mod(rp, 2.0);
  float fxp = fract(xp);
  float tipP = r0 + K * (1.0 - pow(2.0 * fxp - 1.0, 2.0));
  float row = st.y < tipP ? rp : r0;
  float xx = st.x + 0.5 * mod(row, 2.0);
  float fx = fract(xx);
  float tip = row + 1.0 + K * (1.0 - pow(2.0 * fx - 1.0, 2.0));
  float fy = clamp(st.y - (tip - 1.0), 0.0, 1.2);
  fxy = vec2(fx, fy);
  id = vec2(floor(xx), row);
  float dome = 1.0 - pow(2.0 * fx - 1.0, 2.0);
  return pow(sin(3.14159 * clamp(fy, 0.0, 1.0)), 0.8) * 0.75 + dome * 0.25 + smoothstep(0.0, 0.7, fy) * 0.25;
}

// Coordinates on the body for the feather lattice: s = distance from the bill tip (along the flow),
// c = circumferential arc around the bill–tail axis. Seam placed on the ventral midline (softest plumage).
vec2 kpLattice(vec3 p) {
  vec3 bt = vec3(0.0, 77.0, 74.0);
  vec3 tt = vec3(0.0, 58.0, -90.0);
  vec3 ax = normalize(tt - bt);
  vec3 d = p - bt;
  float s = length(d);
  vec3 radial = d - ax * dot(d, ax);
  float rho = max(length(radial), 3.0);
  float phi = atan(radial.x, radial.y);
  return vec2(phi * rho, s);
}

vec3 kpPlumage(vec3 p, vec3 n, float jitter) {
  float ax = abs(p.x);
  float lateral = abs(n.x);
  vec3 col = uUnder;

  // Upperparts: grey-brown above the flank line (the line is mostly hidden by the folded wing).
  float dorsal = smoothstep(58.0, 61.5, p.y + n.y * 5.0 + jitter);
  float bodyZone = 1.0 - smoothstep(24.0, 30.0, p.z + (p.y - 60.0) * 0.4);
  col = mix(col, uMantle, dorsal * bodyZone);
  // White sides to the rump (S7, S27): grey-brown only along the centre line of rump/upper-tail
  float rumpSide = smoothstep(-26.0, -32.0, p.z) * smoothstep(4.0, 6.5, ax);
  col = mix(col, uUnder, rumpSide * dorsal);

  // Hind-neck collar (white, S7) and head hood (crown + nape)
  vec3 A = normalize(vec3(0.0, 0.62, 0.78));
  float q = dot(p - vec3(0.0, 69.5, 31.8), A) + jitter * 0.6;
  float collar = smoothstep(-3.0, -2.2, q) * (1.0 - smoothstep(1.8, 2.6, q));
  float headZone = smoothstep(1.8, 2.6, q);
  // Mantle continues up the back of the neck to the collar
  float neckBack = (1.0 - headZone) * (1.0 - collar) * smoothstep(-0.1, 0.35, n.y - n.z * 0.2) * (1.0 - bodyZone * 0.0);
  col = mix(col, uMantle, neckBack * smoothstep(20.0, 26.0, p.z) * smoothstep(64.0, 67.0, p.y));
  col = mix(col, uCollar, collar * smoothstep(-0.6, -0.2, n.y + 0.9));

  if (headZone > 0.0) {
    // Head markings in head-centred directions (u.y up, u.z forward, |u.x| lateral).
    vec3 hd = p - vec3(0.0, 80.4, 48.0);
    vec3 u = normalize(hd);
    float ux = abs(u.x);
    float j = jitter * 0.04;
    vec3 h = uUnder; // cheeks, chin, throat
    // Crown + nape "hood": top of the head behind the fore-crown, down the back of the head to the collar
    float hoodEdge = 0.47 - 0.1 * smoothstep(0.0, -0.5, u.z);
    float crownTop = smoothstep(hoodEdge - 0.04, hoodEdge + 0.04, u.y + j) * (1.0 - smoothstep(0.26, 0.34, u.z + j));
    float nape = smoothstep(-0.2, -0.4, u.z + j) * (1.0 - smoothstep(0.5, 0.66, ux)) * smoothstep(-0.35, -0.1, u.y);
    float hood = max(crownTop, nape);
    vec3 hoodCol = mix(uCrown, uNape, smoothstep(0.0, -0.6, u.z));
    h = mix(h, hoodCol, hood);
    // Supercilium: white band above the eye, continuous with the white forehead (S5, S7)
    float sup = smoothstep(0.26, 0.31, u.y + j) * (1.0 - hood) * smoothstep(-0.45, -0.3, u.z) * smoothstep(0.3, 0.45, ux);
    h = mix(h, uSupercilium, sup);
    // White forehead (front face above the lores)
    float fore = smoothstep(0.26, 0.34, u.z + j) * smoothstep(-0.05, 0.08, u.y);
    h = mix(h, uForehead, fore * (1.0 - hood));
    // Black frontal bar across the fore-crown (male breeding; palette gives crown colour otherwise)
    float bar = smoothstep(0.24, 0.3, u.z + j) * (1.0 - smoothstep(0.58, 0.64, u.z + j)) * smoothstep(0.4, 0.5, u.y) * (1.0 - smoothstep(0.42 * uMelanin, 0.52 * uMelanin, ux));
    h = mix(h, uFrontalBar, bar);
    // Eye stripe: lores → eye → ear coverts (black in male, brown in female; S5, S7, S10)
    vec2 zy = vec2(p.z, p.y);
    float dStripe = min(min(sdSeg2(zy, vec2(62.0, 77.9), vec2(53.5, 80.6)), sdSeg2(zy, vec2(53.5, 80.6), vec2(47.8, 81.2))), sdSeg2(zy, vec2(47.8, 81.2), vec2(43.8, 80.2)));
    float wStripe = mix(0.7, 1.45, smoothstep(60.0, 52.0, p.z)) * uMelanin;
    float stripe = (1.0 - smoothstep(wStripe - 0.3, wStripe + 0.3, dStripe + jitter * 0.12)) * smoothstep(0.22, 0.4, ux);
    vec2 e = (zy - vec2(45.0, 79.9)) / (vec2(4.4, 3.2) * uMelanin);
    float ear = (1.0 - smoothstep(0.85, 1.1, length(e) + jitter * 0.05)) * smoothstep(0.3, 0.55, ux);
    h = mix(h, uEyeStripe, stripe);
    h = mix(h, uEarCoverts, ear);
    col = mix(col, h, headZone);
  }

  // Lateral breast patches — never meet in the centre (S7, S10)
  vec3 bp = vec3(sign(p.x) * 13.5, 64.5, 31.5);
  vec3 br = vec3(6.5, 5.2, 5.2) * uMelanin;
  float patchD = length((p - bp) / br) + jitter * 0.06;
  float patchM = (1.0 - smoothstep(0.85, 1.05, patchD)) * smoothstep(5.0, 7.5, ax);
  col = mix(col, uBreastPatch, patchM);
  return col;
}
`;

function paletteUniforms(pal) {
  return {
    uForehead: { value: srgb(pal.forehead) },
    uFrontalBar: { value: srgb(pal.frontalBar) },
    uCrown: { value: srgb(pal.crown) },
    uNape: { value: srgb(pal.nape) },
    uSupercilium: { value: srgb(pal.supercilium) },
    uEyeStripe: { value: srgb(pal.eyeStripe) },
    uEarCoverts: { value: srgb(pal.earCoverts) },
    uCollar: { value: srgb(pal.collar) },
    uMantle: { value: srgb(pal.mantle) },
    uMantleDark: { value: srgb(pal.mantleDark) },
    uFringe: { value: srgb(pal.fringe) },
    uBreastPatch: { value: srgb(pal.breastPatch) },
    uUnder: { value: srgb(pal.underparts) },
  };
}

/**
 * Body plumage material. `detail` 0 = full micro-structure + sheen (LOD0), 1 = reduced, 2 = colour only.
 */
export function createBodyMaterial(pal, individual = {}, detail = 0) {
  const params = { roughness: 0.78, metalness: 0, color: 0xffffff };
  const mat = detail === 0 ? new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.55, 0.53, 0.5) }) : new THREE.MeshStandardMaterial(params);
  const uniforms = {
    ...paletteUniforms(pal),
    uMelanin: { value: individual.melaninPatchScale ?? 1 },
    uWear: { value: individual.plumageWear ?? 0.2 },
    uSeed: { value: individual.seed ?? 0.37 },
    uDetail: { value: detail },
    uFluff: { value: 0 },
    uBreath: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aRest; attribute vec3 aFlow;\nuniform float uFluff; uniform float uBreath;\nvarying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowV; varying vec3 vFlowR;`)
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vRest = aRest; vRestN = normal; vFlowR = aFlow;
        vec3 kpFl = aFlow;
        #ifdef USE_SKINNING
          kpFl = (skinMatrix * vec4(kpFl, 0.0)).xyz;
        #endif
        vFlowV = normalize(normalMatrix * kpFl);`
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normal * uFluff * 0.0012 * smoothstep(40.0, 60.0, aRest.y);\n transformed += normal * uBreath * ${ANIM_BREATH} * smoothstep(-30.0, -5.0, aRest.z) * (1.0 - smoothstep(22.0, 34.0, aRest.z)) * (1.0 - smoothstep(66.0, 74.0, aRest.y));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_UNIFORMS_GLSL}\n${BODY_FRAG_FUNCS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 kpN = normalize(vRestN);
        vec3 kpTr = kpTract(vRest, kpN);
        vec2 kpLat = kpLattice(vRest) / kpTr.x;
        vec2 kpFxy; vec2 kpId;
        float kpH = kpFeather(vec2(kpLat.x, kpLat.y), kpFxy, kpId);
        float kpRnd = kpHash(kpId + uSeed * 17.0);
        // Evaluate markings at the visible feather's root → boundaries follow feather tips (scalloped).
        vec3 kpRootP = vRest - normalize(vFlowR) * kpFxy.y * kpTr.x * 0.9;
        float kpJit = (kpRnd - 0.5) * 0.6;
        vec3 kpCol = kpPlumage(kpRootP, kpN, kpJit);
        // Within-feather tone: darker shaft streak & pale fringe on the grey-brown upperparts only.
        float kpLum = dot(kpCol, vec3(0.2126, 0.7152, 0.0722));
        float kpBrown = smoothstep(0.02, 0.06, kpCol.r - kpCol.b) * (1.0 - smoothstep(0.45, 0.6, kpLum));
        float kpShaft = (1.0 - smoothstep(0.05, 0.22, abs(kpFxy.x - 0.5))) * (1.0 - smoothstep(0.55, 0.9, kpFxy.y));
        float kpFringe = smoothstep(0.72, 0.98, kpFxy.y) * (1.0 - uWear);
        kpCol = mix(kpCol, kpCol * (uMantleDark / max(uMantle, vec3(1e-3))), kpShaft * kpBrown * 0.55);
        kpCol = mix(kpCol, mix(kpCol, uFringe, 0.55), kpFringe * kpBrown);
        // Very small per-feather tone variation (no dirty noise).
        kpCol *= 1.0 + (kpRnd - 0.5) * 0.05;
        // Micro shadowing at the tip overlap (feather-scale AO), fades with distance
        float kpFade = 1.0 - smoothstep(0.25, 0.9, fwidth(kpLat.y));
        kpCol *= mix(1.0, 0.9 + 0.1 * smoothstep(0.0, 0.3, kpFxy.y), kpFade * kpTr.y * kpBrown * smoothstep(1.6, 2.6, kpTr.x) * (uDetail < 1.5 ? 1.0 : 0.0));
        diffuseColor.rgb *= kpCol;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float kpDark = 1.0 - smoothstep(0.02, 0.2, kpLum);
        roughnessFactor = mix(0.8, 0.62, kpDark) + (kpRnd - 0.5) * 0.04;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uDetail < 1.5) {
          // Height gradient of the tile pattern in lattice units, then mapped to view space along the
          // skinned feather-flow direction (T) and its perpendicular (B).
          vec2 kpA; vec2 kpB;
          float kpE = 0.08;
          float kpHx = kpFeather(kpLat + vec2(kpE, 0.0), kpA, kpB);
          float kpHy = kpFeather(kpLat + vec2(0.0, kpE), kpA, kpB);
          float kpBarbs = sin((kpFxy.x * 2.0 - 1.0) * 26.0 + kpFxy.y * 9.0) * 0.05 * (1.0 - kpTr.z);
          vec3 kpT = normalize(vFlowV - normal * dot(vFlowV, normal));
          vec3 kpB2 = cross(normal, kpT);
          float kpStr = kpTr.y * kpFade * (uDetail < 0.5 ? 1.0 : 0.6) * mix(0.45, 1.0, smoothstep(1.3, 2.4, kpTr.x));
          vec2 kpG = vec2(kpHx - kpH, kpHy - kpH) / kpE;
          normal = normalize(normal - (kpT * (kpG.y * 0.9) + kpB2 * (kpG.x * 0.35 + kpBarbs)) * 0.1 * kpStr);
        }`
      );
  };
  mat.customProgramCacheKey = () => `kp-body-${detail}`;
  return mat;
}

// ------------------------------------------------------------------ FEATHERS (wing, tail, scapulars)
const FEATHER_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uMantle, uMantleDark, uFringe, uFlightDark, uFlightMid, uTailDark, uWhite, uUnder;
uniform float uWear, uDetail, uFold;
varying vec4 vFeather;

// Colour of the dorsal (upper) surface of a feather.
vec3 kpFeatherTop(float type, float idx, vec2 uv, float rnd) {
  float across = uv.x; float t = uv.y; float a = abs(across);
  float rachis = 1.0 - smoothstep(0.035, 0.07, a);
  float edge = smoothstep(0.62, 1.0, a) + smoothstep(0.8, 1.0, t);
  vec3 c;
  if (type < 0.5) {
    // primary: dark; inner primaries show a white base on the outer vane (wing-bar continues)
    c = uFlightDark;
    float whiteBase = (1.0 - smoothstep(0.26, 0.36, t)) * step(across, 0.0) * (1.0 - smoothstep(5.5, 7.5, idx));
    c = mix(c, uWhite, whiteBase);
    c = mix(c, mix(uFlightDark, uWhite, 0.75), rachis * smoothstep(0.1, 0.25, t) * (1.0 - smoothstep(0.75, 0.95, t)));
  } else if (type < 1.5) {
    // secondary: dark grey-brown, white base and narrow white tip
    c = uFlightMid;
    c = mix(c, uWhite, 1.0 - smoothstep(0.24, 0.32, t)); // white base hidden under the greater coverts
    c = mix(c, uWhite, smoothstep(0.9, 0.97, t) * (0.55 + 0.45 * (1.0 - uWear)));
  } else if (type < 2.5) {
    // tertial: grey-brown with darker centre and pale fringe
    c = mix(uMantle, uMantleDark, (1.0 - smoothstep(0.35, 0.75, a)) * 0.8);
    c = mix(c, uFringe, smoothstep(0.82, 0.97, max(a, t)) * (1.0 - uWear * 0.7));
  } else if (type < 3.5) {
    // primary covert: dark with narrow pale tip on the inner ones
    c = mix(uFlightDark, uFlightMid, 0.35);
    c = mix(c, uWhite, smoothstep(0.86, 0.96, t) * (1.0 - smoothstep(3.0, 6.0, idx)));
  } else if (type < 4.5) {
    // greater covert: grey-brown with broad white tip → the long white wing-bar (S7, S27)
    c = uMantle;
    c = mix(c, uMantleDark, (1.0 - smoothstep(0.2, 0.6, a)) * (1.0 - smoothstep(0.5, 0.7, t)) * 0.5);
    c = mix(c, uWhite, smoothstep(0.66, 0.74, t));
  } else if (type < 6.5) {
    // median / lesser covert: grey-brown, dark shaft streak, pale fringe
    c = mix(uMantle, uMantleDark, rachis * 0.7 + (1.0 - smoothstep(0.15, 0.5, a)) * 0.25);
    c = mix(c, uFringe, smoothstep(0.7, 0.95, max(a * 0.95, t)) * (1.0 - uWear * 0.8));
  } else if (type < 7.5) {
    c = uFlightDark; // alula
  } else if (type < 8.5) {
    // rectrices: central pair brown with dark subterminal band; outer pairs white (S7, S27)
    float i = idx;
    float sub = smoothstep(0.68, 0.76, t) * (1.0 - smoothstep(0.88, 0.94, t));
    vec3 brown = mix(uTailDark, uMantle, 0.35);
    c = brown;
    c = mix(c, uFlightDark, sub * 0.8);
    c = mix(c, uFringe, smoothstep(0.94, 0.99, t));
    float whiteness = smoothstep(3.5, 5.2, i);
    float outerVaneWhite = smoothstep(2.5, 3.5, i) * step(across, 0.0);
    c = mix(c, uWhite, max(whiteness, outerVaneWhite));
    // r4/r5 keep a small dark mark near the tip on the inner vane
    c = mix(c, mix(uTailDark, uWhite, 0.45), sub * step(3.5, i) * (1.0 - step(5.5, i)) * step(0.0, across) * 0.7);
  } else if (type < 9.5) {
    // upper-tail coverts: centre grey-brown, sides white
    c = idx < 0.5 ? uMantle : uWhite;
  } else if (type < 10.5) {
    // scapular: grey-brown, dark centre, pale fringe
    c = mix(uMantle, uMantleDark, (1.0 - smoothstep(0.1, 0.55, a)) * (1.0 - smoothstep(0.45, 0.85, t)) * 0.75);
    c = mix(c, uFringe, smoothstep(0.78, 0.97, max(a, t * 1.02)) * (1.0 - uWear * 0.75));
  } else if (type < 11.5) {
    // arm (propatagium surface under the lesser coverts); underside white only when the wing is open
    c = mix(uMantle, uUnder, smoothstep(-0.2, -0.6, across) * (1.0 - uFold));
  } else {
    c = uWhite; // under-tail coverts
  }
  // feather base is hidden under the next layer: darken slightly (contact AO)
  c *= mix(0.92, 1.0, smoothstep(0.0, 0.3, t));
  c *= 1.0 + (rnd - 0.5) * 0.05;
  return c;
}

// Ventral (under) surface: remiges pale grey, coverts white (under-wing coverts are white).
vec3 kpFeatherBottom(float type, float idx, vec2 uv) {
  if (type < 0.5) return mix(mix(uFlightMid, uWhite, 0.55), uWhite, 1.0 - smoothstep(0.3, 0.5, uv.y));
  if (type < 1.5) return mix(mix(uFlightMid, uWhite, 0.6), uWhite, 1.0 - smoothstep(0.35, 0.55, uv.y));
  if (type > 7.5 && type < 8.5) return mix(mix(uTailDark, uWhite, 0.4), uWhite, smoothstep(3.5, 5.0, idx));
  if (type > 9.5 && type < 10.5) return uMantleDark;
  if (type > 10.5 && type < 11.5) return mix(uMantle, uWhite, 1.0 - uFold);
  if (type > 6.5 && type < 7.5) return mix(uFlightDark, uFlightMid, 0.5);
  if (type > 2.5 && type < 6.5) return mix(uMantleDark, uWhite, 1.0 - uFold); // under-wing coverts (white) only matter when open
  return uWhite;
}
`;

export function createFeatherMaterial(pal, individual = {}, detail = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const uniforms = {
    uMantle: { value: srgb(pal.mantle) },
    uMantleDark: { value: srgb(pal.mantleDark) },
    uFringe: { value: srgb(pal.fringe) },
    uFlightDark: { value: srgb(pal.flightDark) },
    uFlightMid: { value: srgb(pal.flightMid) },
    uTailDark: { value: srgb(pal.tailDark) },
    uWhite: { value: srgb(pal.white) },
    uUnder: { value: srgb(pal.underparts) },
    uWear: { value: individual.plumageWear ?? 0.2 },
    uDetail: { value: detail },
    uFold: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: 0.35 },
  };
  mat.userData.uniforms = uniforms;
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 aFeather;\nvarying vec4 vFeather;\nuniform float uTime, uWind;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFeather = aFeather;
        // feather micro-motion: tips flutter slightly in the wind (strongest on tail, tertials, scapulars)
        float kfT = floor(aFeather.x + 0.5);
        float kfLoose = (kfT > 7.5 && kfT < 10.5) || (kfT > 1.5 && kfT < 2.5) ? 1.0 : 0.35;
        float kfPh = aFeather.z * 37.0 + aFeather.y * 1.7;
        float kfW = sin(uTime * 7.3 + kfPh) * 0.6 + sin(uTime * 13.1 + kfPh * 1.9) * 0.4;
        transformed += normal * (uWind * kfLoose * 0.00035 * uv.y * uv.y * kfW);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FEATHER_FRAG}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float kfType = floor(vFeather.x + 0.5);
        vec3 kfCol = gl_FrontFacing ? kpFeatherTop(kfType, vFeather.y, vUv, vFeather.z) : kpFeatherBottom(kfType, vFeather.y, vUv);
        diffuseColor.rgb *= kfCol;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float kfLum = dot(kfCol, vec3(0.2126, 0.7152, 0.0722));
        roughnessFactor = mix(0.58, 0.8, smoothstep(0.03, 0.35, kfLum));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uDetail < 1.5) {
          // Barbs run obliquely from the rachis toward the tip; rachis is a raised ridge.
          vec3 q0 = dFdx(-vViewPosition); vec3 q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vUv); vec2 st1 = dFdy(vUv);
          vec3 q1p = cross(q1, normal); vec3 q0p = cross(normal, q0);
          vec3 T = q1p * st0.x + q0p * st1.x; vec3 B = q1p * st0.y + q0p * st1.y;
          float det = max(dot(T, T), dot(B, B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
          T *= sc; B *= sc;
          float a = vUv.x;
          float fade = 1.0 - smoothstep(0.03, 0.12, fwidth(vUv.y));
          float barbs = cos((abs(a) * 1.6 - vUv.y * 3.2) * 70.0) * 0.1 * fade;
          float ridge = (1.0 - smoothstep(0.03, 0.09, abs(a))) * sign(a) * 0.9;
          normal = normalize(normal + T * (ridge + barbs * sign(a)) * 0.35 * (uDetail < 0.5 ? 1.0 : 0.5));
        }`
      );
  };
  mat.customProgramCacheKey = () => `kp-feather-${detail}`;
  return mat;
}

// ------------------------------------------------------------------ BARE PARTS (bill, legs, claws)
const BARE_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uBill, uLegs, uUnder, uMouth;
uniform float uDetail;
varying float vPart;
`;

export function createBarePartsMaterial(pal, detail = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  const uniforms = {
    uBill: { value: srgb(pal.bill) },
    uLegs: { value: srgb(pal.legs) },
    uUnder: { value: srgb(pal.underparts) },
    uMouth: { value: srgb('#8e6f6a') },
    uDetail: { value: detail },
  };
  mat.userData.uniforms = uniforms;
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aPart;\nvarying float vPart;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPart = aPart;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BARE_FRAG}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float kbP = floor(vPart + 0.5);
        vec3 kbCol = uLegs; float kbRough = 0.55;
        // Reticulate (polygonal) scales on the tarsus/toes; pattern cell ≈ 0.45 mm.
        vec2 kbSt = vec2(vUv.x * 16.0, vUv.y * 60.0);
        vec2 kbI = floor(kbSt + vec2(0.5 * mod(floor(kbSt.y), 2.0), 0.0));
        vec2 kbF = fract(kbSt + vec2(0.5 * mod(floor(kbSt.y), 2.0), 0.0)) - 0.5;
        float kbCell = 1.0 - smoothstep(0.28, 0.5, max(abs(kbF.x), abs(kbF.y)));
        if (kbP < 0.5) { kbCol = uBill; kbRough = 0.46 + 0.08 * kpNoise(vUv * vec2(20.0, 40.0)); }
        else if (kbP < 1.5) { kbCol = uLegs * (0.9 + 0.12 * kpHash(kbI)); kbRough = 0.5 + 0.1 * (1.0 - kbCell); }
        else if (kbP < 2.5) { kbCol = uBill * 0.85; kbRough = 0.3; }
        else if (kbP < 3.5) {
          // feathered tibia: staggered rows of small white contour feathers, each slightly shaded just
          // below the overlapping tip above it, fine barb striation along the leg
          vec2 kbFs = vec2(vUv.x * 12.0, vUv.y * 10.0);
          float kbRow = floor(kbFs.y);
          vec2 kbFi = floor(kbFs + vec2(0.5 * mod(kbRow, 2.0), 0.0));
          vec2 kbFf = fract(kbFs + vec2(0.5 * mod(kbRow, 2.0), 0.0));
          float kbTip = 0.55 + 0.35 * abs(kbFf.x - 0.5) * 2.0;
          float kbShade = smoothstep(0.0, 0.3, kbFf.y) * (1.0 - 0.5 * smoothstep(kbTip, kbTip + 0.12, kbFf.y));
          float kbBarb = 0.5 + 0.5 * sin(vUv.x * 190.0 + vUv.y * 14.0 + kpHash(kbFi) * 6.28);
          kbCol = uUnder * (0.8 + 0.12 * kbShade + 0.035 * kbBarb + 0.04 * kpHash(kbFi)) * mix(0.9, 1.0, smoothstep(0.1, 0.5, vUv.y));
          kbRough = 0.84;
        }
        else if (kbP < 4.5) { kbCol = uMouth; kbRough = 0.45; }
        else { kbCol = mix(uLegs, vec3(0.35, 0.33, 0.3), 0.25); kbRough = 0.75; }
        diffuseColor.rgb *= kbCol;`
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = kbRough;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uDetail < 0.5 && kbP > 0.5 && kbP < 1.5) {
          vec3 q0 = dFdx(-vViewPosition); vec3 q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(kbSt); vec2 st1 = dFdy(kbSt);
          vec3 q1p = cross(q1, normal); vec3 q0p = cross(normal, q0);
          vec3 T = q1p * st0.x + q0p * st1.x; vec3 B = q1p * st0.y + q0p * st1.y;
          float det = max(dot(T, T), dot(B, B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
          float fade = 1.0 - smoothstep(0.2, 0.6, fwidth(kbSt.y));
          vec2 g = -kbF * 2.0 * (1.0 - kbCell) * fade;
          normal = normalize(normal + (T * g.x + B * g.y) * sc * 0.5);
        }`
      );
  };
  mat.customProgramCacheKey = () => `kp-bare-${detail}`;
  return mat;
}

// ------------------------------------------------------------------ EYES
export function createEyeMaterials(pal) {
  // Iris: dark brown with radial fibres and a slightly lighter collarette; pupil round, black.
  const eyeball = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const irisU = { uIris: { value: srgb(pal.iris) }, uPupil: { value: 0.42 } };
  eyeball.userData.uniforms = irisU;
  eyeball.defines = { USE_UV: '' };
  eyeball.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, irisU);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nuniform vec3 uIris; uniform float uPupil;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float r = vUv.x / 0.86;          // 1.0 ≈ aperture edge
        float ang = vUv.y * 6.2831853;
        float fib = kpNoise(vec2(ang * 9.0, r * 3.0)) * 0.6 + kpNoise(vec2(ang * 23.0, r * 7.0)) * 0.4;
        vec3 iris = uIris * (0.75 + 0.5 * fib);
        iris = mix(iris, uIris * 1.35, (1.0 - smoothstep(0.04, 0.12, abs(r - uPupil - 0.06))) * 0.35);
        iris *= mix(1.0, 0.55, smoothstep(0.82, 0.98, r));   // limbal darkening
        vec3 c = mix(vec3(0.012, 0.01, 0.009), iris, smoothstep(uPupil - 0.03, uPupil + 0.03, r));
        diffuseColor.rgb = c;`
      );
  };
  eyeball.customProgramCacheKey = () => 'kp-eye';

  // Cornea: additive specular-only shell (black albedo) → crisp catch-lights without sorting issues.
  const cornea = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 3.0 });

  // Lids: rim (dark eyelid skin), lower lid (rises when asleep), nictitating membrane (blink).
  const lids = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false });
  const lidU = { uLidClose: { value: new THREE.Vector2(0, 0) }, uNict: { value: new THREE.Vector2(0, 0) }, uRim: { value: srgb('#171514') }, uLidCol: { value: srgb(pal.eyeStripe) } };
  lids.userData.uniforms = lidU;
  lids.defines = { USE_UV: '' };
  lids.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lidU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aPart;\nvarying float vPart; varying float vSide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPart = aPart; vSide = position.x > 0.0 ? 0.0 : 1.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 uLidClose; uniform vec2 uNict; uniform vec3 uRim; uniform vec3 uLidCol;\nvarying float vPart; varying float vSide;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lp = floor(vPart + 0.5);
        float closeAmt = vSide < 0.5 ? uLidClose.x : uLidClose.y;
        float nict = vSide < 0.5 ? uNict.x : uNict.y;
        float rr = vUv.x; float ph = vUv.y * 6.2831853;
        float ant = cos(ph) * rr;   // +1 anterior
        float ven = sin(ph) * rr;   // +1 ventral
        vec3 lc = uRim;
        float alpha = 1.0;
        if (lp > 6.5 && lp < 7.5) {
          // lower lid: covers from the ventral side upward
          alpha = step(-ven, -1.0 + 2.05 * closeAmt) * step(0.001, closeAmt);
          lc = mix(uLidCol, uRim, 0.35);
        } else if (lp > 7.5) {
          // nictitating membrane: sweeps from the anterior corner backward
          alpha = step(-ant, -1.0 + 2.1 * nict) * step(0.001, nict);
          lc = vec3(0.55, 0.55, 0.56);
        }
        diffuseColor.rgb = lc;
        diffuseColor.a = alpha;`
      );
  };
  lids.customProgramCacheKey = () => 'kp-lids';
  return { eyeball, cornea, lids };
}

export function createFarMaterial(pal) {
  // LOD3: vertex colours only
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
}

/** GLSL sources, exported for offline baking (tools/export-glb.mjs → src/validation/exportGLB.js). */
export const GLSL = { BODY_UNIFORMS_GLSL, BODY_FRAG_FUNCS, FEATHER_FRAG, paletteUniforms };

export function getPalette(name) {
  return PLUMAGE.palettes[name] ?? PLUMAGE.palettes.maleBreeding;
}
