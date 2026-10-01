import * as THREE from 'three';
import { plumage as PLUMAGE, animation as ANIM } from './KentishPloverConfig.js';
import { FLUFF_REST } from './anatomy/bodyMesh.js';
import { CONFORM_FOLD } from './anatomy/wingFold.js';

// breathing displacement amplitude (m): fractional expansion × body half-width
const ANIM_BREATH = (ANIM.breathAmp * 0.021).toFixed(6);

// Materials for the Kentish Plover. All plumage patterns are evaluated procedurally in the bird's
// REST space (mm), so markings stay crisp at any distance and follow the skin when it deforms.
// Evidence for each marking: docs/research.md §3 (S5, S6, S7, S10); colours are estimates (C–D).

const srgb = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB → linear working space

// Palette colours are photo APPEARANCES: white-balanced medians in which the most sunlit white is linear 0.82
// (spec §13). Used directly as albedo, the scene's strong sun + ACES compress them toward the white: the
// rendered mantle / white luminance came out 0.51 / 0.37 / 0.42 / 0.37 (male / non-breeding / female /
// juvenile) against the photos' 0.31 / 0.20 / 0.23 / 0.19. Albedo = colour · (Y / 0.82)^(γ − 1) keeps the
// whites and darkens mid-tones so the RENDERED ratio matches the photo ratio (plumage.apparentGamma).
const WHITE_Y = 0.82;
export function plumageAlbedo(hex) {
  const c = srgb(hex);
  const y = Math.max(1e-4, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return c.multiplyScalar(Math.min(1, Math.pow(y / WHITE_Y, PLUMAGE.apparentGamma - 1)));
}

// Self-shadow strength: the sun's shadow map is sharp at feather scale, so every overlapping covert / scapular tip
// cast a hard dark band on the feather below it and the jagged wing edge a row of dark spikes on the white flank —
// the closed wing read as stacked plates (photos show soft rows: p039, p040, p052; spec §10.1, §10.4). Plumage
// receives the directional shadow scaled by `strength` (a GLSL expression, 0 none … 1 full).
function softSelfShadow(fragmentShader, strength) {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const a = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
  if (!chunk.includes(a)) return fragmentShader; // three.js changed the chunk: keep full shadows
  const patched = chunk.replace(a, `directLight.color *= ( directLight.visible && receiveShadow ) ? 1.0 - (${strength}) + (${strength}) * getShadow( directionalShadowMap[ i ]`);
  return fragmentShader.replace('#include <lights_fragment_begin>', patched);
}

// ------------------------------------------------------------------ shared GLSL
const GLSL_COMMON = /* glsl */ `
float kpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kpHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float kpNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kpHash(i), kpHash(i + vec2(1, 0)), u.x), mix(kpHash(i + vec2(0, 1)), kpHash(i + vec2(1, 1)), u.x), u.y);
}
`;

// Fluff displacement (mm per unit of fluff above the relaxed 0.15) at rest position p with rest normal n —
// mirrors bodyMesh.bodyDisplacementMasks / headness
const GLSL_FLUFF = /* glsl */ `
float kpFluffMM(vec3 p, vec3 n) {
  vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(13.0, 13.0, 15.5);
  float head = clamp((1.25 - length(e)) / 0.35, 0.0, 1.0) * (1.0 - clamp((83.0 - p.y) / 5.0, 0.0, 1.0));
  return (2.5 + 4.5 * smoothstep(-0.2, -0.9, n.y) - 0.3 * smoothstep(0.2, 0.9, n.y)) * (1.0 - 0.7 * head) * (1.0 - 0.8 * smoothstep(-25.0, -55.0, p.z)) * (1.0 - 0.6 * smoothstep(15.0, 30.0, p.z));
}
`;
const FLUFF_REST_GLSL = FLUFF_REST.toFixed(3);
// hind-neck fill (mm per mm, bodyMesh.napeMask)
const GLSL_NAPE = /* glsl */ `
float kpNapeMM(vec3 p, vec3 n) {
  vec2 d = vec2((p.y - 97.0) / 5.5, (p.z - 9.0) / 7.5); // (pow() of a negative base is undefined in GLSL)
  float e = dot(d, d);
  return exp(-e) * (1.0 - smoothstep(5.0, 11.0, abs(p.x))) * smoothstep(-0.1, 0.4, n.y) * (1.0 - smoothstep(0.3, 0.7, n.z));
}
`;

// ------------------------------------------------------------------ BODY PLUMAGE
const BODY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uForehead, uFrontalBar, uCrown, uCrownRear, uNape, uSupercilium, uEyeStripe, uEarCoverts, uCollar;
uniform vec3 uMantle, uMantleDark, uFringe, uBreastPatch, uUnder;
uniform float uMelanin, uWear, uSeed, uDetail, uFluff, uFringeMix, uSubterminal;
varying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowV; varying vec3 vFlowR;
`;

const BODY_FRAG_FUNCS = /* glsl */ `
${GLSL_COMMON}
float sdSeg2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Head membership: the enlarged head ellipsoid and throat cut of bodyMesh.headness (skinning), sharpened to
// a zone (body_shape_spec.md §17.2)
float kpHeadness(vec3 p) {
  vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(13.0, 13.0, 15.5);
  float below = clamp((83.0 - p.y) / 5.0, 0.0, 1.0);
  return clamp((1.25 - length(e)) / 0.35, 0.0, 1.0) * (1.0 - below);
}
// Signed distance (mm) to the collar plane: 0 through the nape (z 4, y 92) and the throat sides (z 30, y 80),
// + toward the head (spec §14)
float kpCollarQ(vec3 p) {
  return dot(p - vec3(0.0, 86.0, 17.0), vec3(0.0, 0.909, 0.42));
}

// Feather tract data: x = cell size (mm), y = normal strength, z = softness (0 hard, 1 downy)
vec3 kpTract(vec3 p, vec3 n) {
  float head = smoothstep(0.35, 0.65, kpHeadness(p));
  float neck = (1.0 - smoothstep(2.5, 4.0, abs(kpCollarQ(p)))) * (1.0 - head);
  float dorsal = smoothstep(-0.15, 0.35, n.y);
  float rump = smoothstep(-40.0, -50.0, p.z);
  vec3 breast = vec3(${PLUMAGE.featherScale.breast.toFixed(2)}, ${PLUMAGE.normalStrength.breast.toFixed(2)}, 0.8);
  vec3 belly = vec3(${PLUMAGE.featherScale.belly.toFixed(2)}, ${PLUMAGE.normalStrength.belly.toFixed(2)}, 1.0);
  vec3 mantle = vec3(${PLUMAGE.featherScale.mantle.toFixed(2)}, ${PLUMAGE.normalStrength.mantle.toFixed(2)}, 0.15);
  vec3 flank = vec3(${PLUMAGE.featherScale.flank.toFixed(2)}, ${PLUMAGE.normalStrength.flank.toFixed(2)}, 0.5);
  vec3 rumpT = vec3(${PLUMAGE.featherScale.rump.toFixed(2)}, ${PLUMAGE.normalStrength.rump.toFixed(2)}, 0.4);
  vec3 t = mix(mix(belly, breast, smoothstep(-10.0, 15.0, p.z)), flank, smoothstep(-0.55, 0.0, n.y) * (1.0 - smoothstep(0.1, 0.4, n.y)));
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
  vec3 bt = vec3(0.0, 84.0, 50.0);
  vec3 tt = vec3(0.0, 55.0, -95.0);
  vec3 ax = normalize(tt - bt);
  vec3 d = p - bt;
  float s = length(d);
  vec3 radial = d - ax * dot(d, ax);
  float rho = max(length(radial), 3.0);
  float phi = atan(radial.x, radial.y);
  return vec2(phi * rho, s);
}

// Lower edge of the grey-brown upperparts on the side = visible lower edge of the folded wing, (z, y)
// (20,63) (5,60) (−10,57) (−25,55.5) (−40,57) (−55,60) (photos, spec §10.1)
float kpUpperEdge(float z) {
  if (z > 5.0) return mix(60.0, 63.0, clamp((z - 5.0) / 15.0, 0.0, 1.0));
  if (z > -10.0) return mix(57.0, 60.0, (z + 10.0) / 15.0);
  if (z > -25.0) return mix(55.5, 57.0, (z + 25.0) / 15.0);
  if (z > -40.0) return mix(57.0, 55.5, (z + 40.0) / 15.0);
  return mix(60.0, 57.0, clamp((z + 55.0) / 15.0, 0.0, 1.0));
}

vec3 kpPlumage(vec3 p, vec3 n, float jitter) {
  float ax = abs(p.x);
  vec3 col = uUnder;

  // Upperparts: grey-brown above the wing's lower edge, behind the collar and behind the breast-side patch
  // axis (z, y) (6, 86) → (24, 63): white in front of it (spec §14, §17.2; p006, p066)
  float yb = kpUpperEdge(p.z);
  float dorsal = smoothstep(yb - 1.5, yb + 2.0, p.y + n.y * 3.0 + jitter);
  float q = kpCollarQ(p) + jitter * 0.6;
  float sFront = ((p.z - 6.0) * 23.0 + (p.y - 86.0) * 18.0) / 29.2;
  float qMantle = -3.2 + 2.2 * smoothstep(4.0, 8.0, ax) * smoothstep(0.1, 0.5, n.y);
  float bodyZone = (1.0 - smoothstep(-1.0, 1.5, sFront + jitter * 0.5)) * (1.0 - smoothstep(qMantle - 0.8, qMantle + 0.2, q));
  col = mix(col, uMantle, dorsal * bodyZone);
  // White sides to the rump (S7, S27): grey-brown only along the centre line of rump/upper-tail
  float rumpSide = smoothstep(-44.0, -50.0, p.z) * smoothstep(4.0, 6.5, ax);
  col = mix(col, uUnder, rumpSide * dorsal);

  // White collar 5–7 mm wide, from the nape obliquely round to the throat sides (S7; spec §14)
  // (on the upper sides, where the front scapulars lie, the band is narrower behind: the mantle colour reaches up
  // under the scapular tips so no white shows between them, p006, p029)
  float qBack = -3.2 + 2.2 * smoothstep(4.0, 8.0, ax) * smoothstep(0.1, 0.5, n.y);
  float collar = smoothstep(qBack, qBack + 0.8, q) * (1.0 - smoothstep(2.4, 3.2, q));
  float headZone = smoothstep(2.4, 3.2, q);
  // (the collar tint — buff-grey in juveniles — only on the hind-neck and sides: throat and fore-neck stay white
  // into the breast, p063, p059, p058)
  float foreNeck = smoothstep(16.0, 24.0, p.z) * (1.0 - smoothstep(6.0, 11.0, ax));
  col = mix(col, mix(uCollar, uUnder, foreNeck), collar * smoothstep(-0.6, -0.2, n.y + 0.9));

  if (headZone > 0.0) {
    // Head markings on the head ellipsoid (centre (0, 93.5, 24), radii 12.5, 12.5, 15; eye (25.5, 95)):
    // e = unit-sphere coordinates, u = directions (u.y up, u.z forward, |u.x| lateral)
    vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(12.5, 12.5, 15.0);
    vec3 u = normalize(e);
    float ux = abs(u.x);
    float j = jitter * 0.04;
    // angle over the head from the crown (0) to the forehead (≈84°) in the side plane
    float th = degrees(atan(e.z, e.y)) + jitter * 1.5;
    vec3 h = uUnder; // cheeks, chin, throat
    // Crown + nape cap behind the frontal bar, down the back of the head to the collar; brighter and warmer
    // toward the rear (spec §13.1)
    // (the cap reaches down to a narrow supercilium 1.5–2.5 mm above the eye, p001, p018, p050, p070)
    float hoodEdge = 0.37 - 0.08 * smoothstep(0.0, -0.5, u.z);
    float crownTop = smoothstep(hoodEdge - 0.04, hoodEdge + 0.04, u.y + j) * (1.0 - smoothstep(30.0, 32.0, th));
    float nape = smoothstep(-0.2, -0.4, u.z + j) * (1.0 - smoothstep(0.5, 0.66, ux)) * smoothstep(-0.35, -0.1, u.y);
    float hood = max(crownTop, nape);
    vec3 hoodCol = mix(uCrown, uCrownRear, smoothstep(0.2, -0.3, u.z));
    hoodCol = mix(hoodCol, uNape, smoothstep(-0.3, -0.7, u.z));
    h = mix(h, hoodCol, hood);
    // Supercilium: white 1.5–2.5 mm above the eye, ending 0.5–1.5 E behind it (males), continuous with the
    // white forehead under the end of the frontal bar (S5, S7; spec §14)
    float sup = smoothstep(0.2, 0.25, u.y + j) * (1.0 - hood) * smoothstep(-0.4, -0.26, u.z) * smoothstep(0.3, 0.45, ux);
    h = mix(h, uSupercilium, sup);
    // White forehead in front of the frontal bar, above the lores (3–7 mm under the bar)
    float fore = smoothstep(46.0, 49.0, th) * smoothstep(-0.05, 0.08, u.y);
    h = mix(h, uForehead, fore * (1.0 - hood));
    // Frontal bar (male black; palette gives crown colour otherwise): a transverse band 2.5–5 mm deep across the
    // fore-crown (θ 31–46°), 9–11 mm long, down each side to 0.3–0.5 E above the eye (y ≈ 97.2) (spec §14; p006)
    // (a broad band ≈ 0.8–1 E tall seen from the side, not a slash: p070, p043, p006, p012)
    float bar = smoothstep(25.0, 27.0, th) * (1.0 - smoothstep(46.0, 48.0, th)) * smoothstep(97.6, 98.3, p.y + jitter * 0.3);
    h = mix(h, uFrontalBar, bar);
    // Eye stripe: lores → eye → ear coverts, 2–3 mm wide in males (brown and narrower otherwise; S5, S7, S10)
    vec2 zy = vec2(p.z, p.y);
    // (the polyline runs through the VISIBLE eye — the cornea apex sits ≈0.5 mm above the eyeball centre — so
    // the eye is set into the stripe, not perched on it: p006, p070, p043)
    float dStripe = min(min(sdSeg2(zy, vec2(37.6, 91.9), vec2(29.1, 95.0)), sdSeg2(zy, vec2(29.1, 95.0), vec2(23.4, 95.7))), sdSeg2(zy, vec2(23.4, 95.7), vec2(19.4, 94.6)));
    float wStripe = mix(0.7, 1.6, smoothstep(37.0, 30.0, p.z)) * uMelanin;
    float stripe = (1.0 - smoothstep(wStripe - 0.3, wStripe + 0.3, dStripe + jitter * 0.12)) * smoothstep(0.22, 0.4, ux);
    // ear coverts: centre (18, 94), radii (5.8, 3.0): the patch touches the rear rim of the eye (z ≈ 23.3) and
    // its rear end the collar (p006, p070, p043; the spec §14 ellipse left a white gap behind the eye)
    vec2 ec = (zy - vec2(18.0, 94.0)) / (vec2(5.8, 3.0) * uMelanin);
    float ear = (1.0 - smoothstep(0.85, 1.1, length(ec) + jitter * 0.05)) * smoothstep(0.3, 0.55, ux);
    h = mix(h, uEyeStripe, stripe);
    h = mix(h, uEarCoverts, ear);
    col = mix(col, h, headZone);
  }

  // Breast-side patches (male: black rhombus 29 mm long along (z, y) (6, 86) → (24, 63), 52° from horizontal,
  // half-width 3 at the ends and 5 in the middle, |x| ≥ 7, 9 mm short of the breast front — never meeting in the
  // centre; it covers the carpal joint and meets the wing's lower edge at (20, 63)) (S7, S10; spec §14)
  vec2 pa = vec2(p.z - 6.0, p.y - 86.0);
  vec2 ba = vec2(18.0, -23.0);
  float tt = dot(pa, ba) / dot(ba, ba);
  float dPerp = abs(pa.x * ba.y - pa.y * ba.x) / length(ba);
  // (tapering rhombus, not a parallel bar; its top stays under the white hind-collar: p003, p006, p020, p070)
  float hw = (1.8 + 3.2 * (1.0 - abs(2.0 * clamp(tt, 0.0, 1.0) - 1.0))) * uMelanin;
  float ends = smoothstep(0.02, 0.1, tt) * (1.0 - smoothstep(0.96, 1.04, tt));
  float patchM = (1.0 - smoothstep(hw - 0.6, hw + 0.4, dPerp + jitter * 0.4)) * ends * smoothstep(6.0, 8.0, ax) * (1.0 - smoothstep(-6.5, -4.5, q));
  col = mix(col, uBreastPatch, patchM);
  return col;
}
`;

/** Cap colour of an individual: the palette's rufous cap toward the sandy one with rufousAmount (spec §13.1). */
function capColor(pal, key, rufous) {
  const c = plumageAlbedo(pal[key] ?? pal.crown);
  if (!pal.rufousCap || rufous >= 1) return c;
  return plumageAlbedo(PLUMAGE.sandyCap[key]).lerp(c, Math.max(0, (rufous - 0.3) / 0.7));
}

function paletteUniforms(pal, individual = {}) {
  const rufous = individual.rufousAmount ?? 1;
  return {
    uForehead: { value: plumageAlbedo(pal.forehead) },
    uFrontalBar: { value: plumageAlbedo(pal.frontalBar) },
    uCrown: { value: capColor(pal, 'crown', rufous) },
    uCrownRear: { value: capColor(pal, 'crownRear', rufous) },
    uNape: { value: capColor(pal, 'nape', rufous) },
    uSupercilium: { value: plumageAlbedo(pal.supercilium) },
    uEyeStripe: { value: plumageAlbedo(pal.eyeStripe) },
    uEarCoverts: { value: plumageAlbedo(pal.earCoverts) },
    uCollar: { value: plumageAlbedo(pal.collar) },
    uMantle: { value: plumageAlbedo(pal.mantle) },
    uMantleDark: { value: plumageAlbedo(pal.mantleDark) },
    uFringe: { value: plumageAlbedo(pal.fringe) },
    uBreastPatch: { value: plumageAlbedo(pal.breastPatch) },
    uUnder: { value: plumageAlbedo(pal.underparts) },
    uFringeMix: { value: pal.fringeMix ?? 0.55 },
    uSubterminal: { value: pal.subterminalDark ? 1 : 0 },
  };
}

/**
 * Body plumage material. `detail` 0 = full micro-structure + sheen (LOD0), 1 = reduced, 2 = colour only.
 */
export function createBodyMaterial(pal, individual = {}, detail = 0) {
  const params = { roughness: 0.78, metalness: 0, color: 0xffffff };
  const mat = detail === 0 ? new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.55, 0.53, 0.5) }) : new THREE.MeshStandardMaterial(params);
  const uniforms = {
    ...paletteUniforms(pal, individual),
    uMelanin: { value: individual.melaninPatchScale ?? 1 },
    uWear: { value: individual.plumageWear ?? 0.2 },
    uSeed: { value: individual.seed ?? 0.37 },
    uDetail: { value: detail },
    uFluff: { value: 0 },
    uBreath: { value: 0 },
    uNapeFill: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aRest; attribute vec3 aFlow;\nuniform float uFluff; uniform float uBreath; uniform float uNapeFill;\nvarying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowV; varying vec3 vFlowR;\n${GLSL_FLUFF}\n${GLSL_NAPE}`)
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
      // masks mirrored in bodyMesh.bodyDisplacementMasks (the plumage lying on the body follows them)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normal * (uFluff - ${FLUFF_REST_GLSL}) * 0.001 * kpFluffMM(aRest, normal);\n transformed += normal * uNapeFill * 0.001 * kpNapeMM(aRest, normal);\n transformed += normal * uBreath * ${ANIM_BREATH} * smoothstep(-40.0, -15.0, aRest.z) * (1.0 - smoothstep(18.0, 30.0, aRest.z)) * (1.0 - smoothstep(76.0, 84.0, aRest.y));`);
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
        // Evaluate markings at the visible feather's root → boundaries follow feather tips (scalloped) on the
        // upperparts; on the head and the white-and-black sides the edges stay nearly smooth (photos, spec §15)
        float kpHeadZ = smoothstep(0.2, 0.5, kpHeadness(vRest));
        // (and a clean hind-collar: no feather-tip tongues along its back edge, p006, p003, p038)
        float kpScallop = smoothstep(0.3, 0.65, kpN.y) * (1.0 - kpHeadZ) * smoothstep(8.0, 2.0, vRest.z) * (1.0 - smoothstep(-13.0, -7.0, kpCollarQ(vRest)));
        vec3 kpRootP = vRest - normalize(vFlowR) * kpFxy.y * kpTr.x * 0.9 * mix(0.15, 1.0, kpScallop);
        float kpJit = (kpRnd - 0.5) * 0.6;
        vec3 kpCol = kpPlumage(kpRootP, kpN, kpJit);
        // Within-feather tone: darker shaft streak & pale fringe on the grey-brown upperparts only.
        float kpLum = dot(kpCol, vec3(0.2126, 0.7152, 0.0722));
        float kpBrown = smoothstep(0.02, 0.06, kpCol.r - kpCol.b) * (1.0 - smoothstep(0.45, 0.6, kpLum));
        // the grey-brown band on the side between the folded wing's edge and the brown/white boundary reads as
        // part of the closed wing (smooth, spec §10.1, §10.4): feather tiles only on the mantle, rump and nape
        float kpTex = mix(1.0, smoothstep(0.25, 0.55, kpN.y), kpBrown);
        // (and none where the lattice converges on the bill–tail axis behind the rump, under the tail coverts)
        kpTex *= smoothstep(-58.0, -50.0, vRest.z);
        // head and neck: smooth, no colour scales or tiles (spec §15)
        kpTex *= 1.0 - max(kpHeadZ, smoothstep(-5.0, -3.0, kpCollarQ(vRest)));
        float kpShaft = (1.0 - smoothstep(0.05, 0.22, abs(kpFxy.x - 0.5))) * (1.0 - smoothstep(0.55, 0.9, kpFxy.y));
        // (thin, soft fringe scaled by fringeMix — the mantle between the scapulars and the coverts showed bright
        // scales in non-breeding / juvenile birds: p039, p040, p052, p007)
        float kpFringe = smoothstep(0.84, 0.99, kpFxy.y) * (1.0 - uWear) * 0.6;
        kpCol = mix(kpCol, kpCol * (uMantleDark / max(uMantle, vec3(1e-3))), kpShaft * kpBrown * kpTex * 0.55);
        kpCol = mix(kpCol, mix(kpCol, uFringe, uFringeMix), kpFringe * kpBrown * kpTex);
        // juvenile: dark subterminal band inside the pale fringe (spec §13.2)
        float kpSub = smoothstep(0.5, 0.6, kpFxy.y) * (1.0 - smoothstep(0.68, 0.74, kpFxy.y)) * uSubterminal;
        kpCol = mix(kpCol, kpCol * (uMantleDark / max(uMantle, vec3(1e-3))) * 0.9, kpSub * kpBrown * kpTex * 0.6);
        // Very small per-feather tone variation (no dirty noise).
        kpCol *= 1.0 + (kpRnd - 0.5) * 0.05;
        // Micro shadowing at the tip overlap (feather-scale AO), fades with distance
        float kpFade = 1.0 - smoothstep(0.25, 0.9, fwidth(kpLat.y));
        kpCol *= mix(1.0, 0.9 + 0.1 * smoothstep(0.0, 0.3, kpFxy.y), kpFade * kpTr.y * kpBrown * kpTex * smoothstep(1.6, 2.6, kpTr.x) * (uDetail < 1.5 ? 1.0 : 0.0));
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
          // (dark glossy patches showed every tile as a dark arc: keep them smooth)
          float kpStr = (1.0 - 0.75 * kpDark) * kpTr.y * kpTex * kpFade * (uDetail < 0.5 ? 1.0 : 0.6) * mix(0.45, 1.0, smoothstep(1.3, 2.4, kpTr.x));
          vec2 kpG = vec2(kpHx - kpH, kpHy - kpH) / kpE;
          normal = normalize(normal - (kpT * (kpG.y * 0.9) + kpB2 * (kpG.x * 0.35 + kpBarbs)) * 0.1 * kpStr);
        }`
      );
    shader.fragmentShader = softSelfShadow(shader.fragmentShader, '0.55');
  };
  mat.customProgramCacheKey = () => `kp-body-${detail}`;
  return mat;
}

// ------------------------------------------------------------------ FEATHERS (wing, tail, scapulars)
const FEATHER_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uMantle, uMantleDark, uFringe, uFlightDark, uFlightMid, uTailDark, uWhite, uUnder;
uniform float uWear, uDetail, uDebugType, uFringeMix, uSubterminal;
varying vec4 vFeather;

// validation: flat colour per feather type (validation page ?fdebug=1)
vec3 kpDebugType(float type) {
  vec3 P[13] = vec3[13](vec3(0.1), vec3(0.9, 0.1, 0.1), vec3(0.1, 0.8, 0.1), vec3(0.6, 0.0, 0.6), vec3(0.1, 0.3, 0.95), vec3(0.0, 0.8, 0.8), vec3(0.95, 0.85, 0.1), vec3(1.0, 0.5, 0.0), vec3(0.5, 0.3, 0.1), vec3(0.6, 0.6, 1.0), vec3(1.0, 0.6, 0.7), vec3(1.0), vec3(0.7, 0.9, 0.5));
  return P[int(clamp(type, 0.0, 12.0))];
}

// Grey-brown feather of the mantle / closed wing: slightly darker centre, a fine pale fringe only round the
// rounded tip (strength from the palette's fringeMix: adult male 0.25 … juvenile 0.9), juveniles with a dark
// subterminal line inside it — overlapping rows read as smooth scallops, not plates (spec §10.4, §15).
vec3 kpBrownFeather(vec2 uv, float centre) {
  float a = abs(uv.x); float t = uv.y;
  vec3 c = mix(uMantle, uMantleDark, (1.0 - smoothstep(0.1, 0.55, a)) * (1.0 - smoothstep(0.45, 0.85, t)) * centre);
  // (a soft band, not a thin bright crescent: the fringes of p052 / p039 fade into the feather)
  // (thin and soft, scaled by fringeMix: a fine pale edge, not a bright crescent)
  float tip = clamp(smoothstep(0.84, 0.99, t) + smoothstep(0.86, 0.99, a) * smoothstep(0.72, 0.92, t), 0.0, 1.0);
  float sub = smoothstep(0.72, 0.78, t) * (1.0 - smoothstep(0.84, 0.88, t)) * uSubterminal;
  c = mix(c, c * (uMantleDark / max(uMantle, vec3(1e-3))) * 0.9, sub * 0.6);
  return mix(c, uFringe, tip * min(0.65, uFringeMix * 0.75) * (1.0 - uWear * 0.7));
}

// Colour of the dorsal (upper) surface of a feather (fold: 1 wing folded … 0 spread). On the closed wing only
// the grey-brown tips of the coverts, tertials and outer secondaries show and the wing reads uniformly
// grey-brown with the dark primary tips behind (p006, p052, p066; spec §10.4); the white wing-bar (greater
// covert tips, remex bases) and the darker remiges appear as the wing opens (S7, S27).
vec3 kpFeatherTop(float type, float idx, vec2 uv, float rnd, float fold) {
  float across = uv.x; float t = uv.y; float a = abs(across);
  float rachis = 1.0 - smoothstep(0.035, 0.07, a);
  vec3 c;
  if (type < 0.5) {
    // primary: dark; inner primaries show a white base on the outer vane (wing-bar continues)
    // (on the closed wing the exposed primary tips read dark grey-brown, not black: p006, p066, p052)
    c = mix(uFlightDark, uMantleDark, 0.5 * fold);
    float whiteBase = (1.0 - smoothstep(0.26, 0.36, t)) * step(across, 0.0) * (1.0 - smoothstep(5.5, 7.5, idx)) * (1.0 - fold);
    c = mix(c, uWhite, whiteBase);
    // pale shafts, subdued: full white rachises split the spread hand into separate sticks (p002, p033)
    c = mix(c, mix(uFlightDark, uWhite, 0.4), rachis * smoothstep(0.1, 0.25, t) * (1.0 - smoothstep(0.7, 0.9, t)) * (1.0 - 0.9 * fold));
  } else if (type < 1.5) {
    // secondary: dark grey-brown, white base and narrow white tip (open wing)
    c = uFlightMid;
    c = mix(c, uWhite, 1.0 - smoothstep(0.24, 0.32, t)); // white base hidden under the greater coverts
    c = mix(c, uWhite, smoothstep(0.9, 0.97, t) * (0.55 + 0.45 * (1.0 - uWear)));
    c = mix(c, mix(kpBrownFeather(uv, 0.8), uMantleDark, 0.15), fold);
  } else if (type < 2.5) {
    c = kpBrownFeather(uv, 0.9); // tertial
  } else if (type < 3.5) {
    // primary covert: dark with narrow pale tip on the inner ones
    c = mix(uFlightDark, uFlightMid, 0.35);
    c = mix(c, uWhite, smoothstep(0.86, 0.96, t) * (1.0 - smoothstep(3.0, 6.0, idx)));
    c = mix(c, uMantleDark, fold);
  } else if (type < 4.5) {
    // greater covert: grey-brown with broad white tip → the long white wing-bar of the open wing (S7, S27)
    c = uMantle;
    c = mix(c, uMantleDark, (1.0 - smoothstep(0.2, 0.6, a)) * (1.0 - smoothstep(0.5, 0.7, t)) * 0.5);
    c = mix(c, uWhite, smoothstep(0.66, 0.74, t));
    c = mix(c, kpBrownFeather(uv, 0.6), fold);
  } else if (type < 6.5) {
    c = kpBrownFeather(uv, 0.3); // median / lesser covert
  } else if (type < 7.5) {
    c = mix(uFlightDark, uMantleDark, fold); // alula
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
    // upper-tail coverts: centre grey-brown, sides white — the white rump sides show in flight (spec §13.3);
    // at rest the folded wings cover them and the coverts that peek out between the tertials are grey-brown
    c = idx < 0.5 ? kpBrownFeather(uv, 0.4) : mix(uWhite, kpBrownFeather(uv, 0.4), fold);
  } else if (type < 10.5) {
    c = kpBrownFeather(uv, 0.7); // scapular
  } else if (type < 11.5) {
    // arm (propatagium under the lesser coverts): covert-coloured, only its underside white when the wing is open
    // (rnd slot = 0 ventral … 1 dorsal; the trailing half of the whole tube was white and read as a pale pipe
    // along the leading edge of a raised wing)
    c = mix(mix(uMantle, uMantleDark, 0.35), mix(uUnder, uMantle, 0.2), smoothstep(0.38, 0.15, rnd) * (1.0 - fold));
  } else {
    c = uWhite; // under-tail coverts
  }
  // feather base is hidden under the next layer: darken slightly (contact AO)
  c *= mix(0.92, 1.0, smoothstep(0.0, 0.3, t));
  c *= 1.0 + (type > 10.5 && type < 11.5 ? 0.0 : (rnd - 0.5) * 0.05);
  return c;
}

// Ventral (under) surface: the white under-wing coverts and axillaries cover the basal half of the remiges, whose
// exposed undersides are pale silvery grey (spec §13.3; p002, p033) — the underwing reads white with a pale grey
// trailing half, not grey-brown.
vec3 kpFeatherBottom(float type, float idx, vec2 uv, float fold) {
  // (primary tips and the secondaries' trailing edge darker grey, p002, p034)
  if (type < 0.5) return mix(mix(uFlightMid, uWhite, mix(0.62, 0.3, smoothstep(0.75, 0.95, uv.y) * (1.0 - smoothstep(3.5, 6.5, idx)))), uWhite, 1.0 - smoothstep(0.45, 0.65, uv.y));
  if (type < 1.5) return mix(mix(uFlightMid, uWhite, mix(0.72, 0.5, smoothstep(0.8, 0.95, uv.y))), uWhite, 1.0 - smoothstep(0.55, 0.75, uv.y));
  if (type > 1.5 && type < 2.5) return mix(uMantleDark, uWhite, 1.0 - fold); // tertial: axillary side
  if (type > 7.5 && type < 8.5) return mix(mix(uTailDark, uWhite, 0.4), uWhite, smoothstep(3.5, 5.0, idx));
  if (type > 9.5 && type < 10.5) return uMantleDark;
  if (type > 10.5 && type < 11.5) return mix(uMantle, uWhite, 1.0 - fold);
  if (type > 6.5 && type < 7.5) return mix(uFlightDark, uFlightMid, 0.5);
  if (type > 2.5 && type < 6.5) return mix(uMantleDark, uWhite, 1.0 - fold); // under-wing coverts (white) only matter when open
  return uWhite;
}
`;

export function createFeatherMaterial(pal, individual = {}, detail = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const uniforms = {
    uMantle: { value: plumageAlbedo(pal.mantle) },
    uMantleDark: { value: plumageAlbedo(pal.mantleDark) },
    uFringe: { value: plumageAlbedo(pal.fringe) },
    uFlightDark: { value: plumageAlbedo(pal.flightDark) },
    uFlightMid: { value: plumageAlbedo(pal.flightMid) },
    uTailDark: { value: plumageAlbedo(pal.tailDark) },
    uWhite: { value: plumageAlbedo(pal.white) },
    uUnder: { value: plumageAlbedo(pal.underparts) },
    uWear: { value: individual.plumageWear ?? 0.2 },
    uDetail: { value: detail },
    uDebugType: { value: 0 },
    uFringeMix: { value: pal.fringeMix ?? 0.55 },
    uSubterminal: { value: pal.subterminalDark ? 1 : 0 },
    uFold: { value: new THREE.Vector2(1, 1) }, // left, right wing
    uFluff: { value: 0 },
    uBreath: { value: 0 },
    uTime: { value: 0 },
    uWind: { value: 0.35 },
  };
  mat.userData.uniforms = uniforms;
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 aFeather; attribute vec3 aLie; attribute vec2 aLieMask; attribute vec3 aCore; attribute vec3 aConform; attribute vec3 aConformN;\nvarying vec4 vFeather; varying float vFold;\nuniform float uTime, uWind, uFluff, uBreath; uniform vec2 uFold;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = normalize(objectNormal + aConformN * smoothstep(${CONFORM_FOLD[0].toFixed(2)}, ${CONFORM_FOLD[1].toFixed(2)}, position.x >= 0.0 ? uFold.x : uFold.y));`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFeather = aFeather;
        float kfT = floor(aFeather.x + 0.5);
        vFold = position.x >= 0.0 ? uFold.x : uFold.y; // left wing is built at +x, right wing mirrored
        // the plumage lying on the body rises and falls with the body shader's fluffing / breathing
        // (wing feathers only while folded onto it); the arm tube (propatagium) folds away with the forearm,
        // gone by half the fold (wingFold.foldPath: the hand folds first, then the humerus tucks it in)
        float kfWing = kfT < 7.5 || (kfT > 10.5 && kfT < 11.5) ? vFold : 1.0;
        transformed += aLie * kfWing * ((uFluff - ${FLUFF_REST_GLSL}) * 0.001 * aLieMask.x + uBreath * ${ANIM_BREATH} * aLieMask.y);
        transformed += aCore * smoothstep(0.0, 0.5, vFold);
        // folded wing feathers bent onto their layer of the shell (wingFold.conformAt, CONFORM_FOLD)
        transformed += aConform * smoothstep(${CONFORM_FOLD[0].toFixed(2)}, ${CONFORM_FOLD[1].toFixed(2)}, vFold);
        // feather micro-motion: tips flutter slightly in the wind (strongest on tail, tertials, scapulars)
        float kfLoose = (kfT > 7.5 && kfT < 10.5) || (kfT > 1.5 && kfT < 2.5) ? 1.0 : 0.35;
        float kfPh = aFeather.z * 37.0 + aFeather.y * 1.7;
        float kfW = sin(uTime * 7.3 + kfPh) * 0.6 + sin(uTime * 13.1 + kfPh * 1.9) * 0.4;
        transformed += normal * (uWind * kfLoose * 0.00035 * uv.y * uv.y * kfW);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FEATHER_FRAG}\nvarying float vFold;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float kfType = floor(vFeather.x + 0.5);
        vec3 kfCol = gl_FrontFacing ? kpFeatherTop(kfType, vFeather.y, vUv, vFeather.z, vFold) : kpFeatherBottom(kfType, vFeather.y, vUv, vFold);
        if (uDebugType > 0.5) kfCol = kpDebugType(kfType) * (gl_FrontFacing ? 1.0 : 0.55);
        diffuseColor.rgb *= kfCol;`
      )
      // Spread wing seen from below: sunlight shines through the thin vanes and the white under-wing coverts, so
      // the underwing reads white (p002, p033); lit only by the ground bounce it rendered grey-brown
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (!gl_FrontFacing && uDebugType < 0.5) totalEmissiveRadiance += diffuseColor.rgb * 0.22 * (1.0 - smoothstep(0.0, 0.6, vFold)) * (kfType < 7.5 || (kfType > 10.5 && kfType < 11.5) ? 1.0 : 0.0);`
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
          // on the closed wing and on the body feathers (scapulars, tail coverts) the shafts are not seen:
          // soft rows, no ridged slats (spec §10.4; p006, p052); remiges and rectrices keep them
          float kfBody = kfType > 8.5 && kfType < 12.5 && kfType != 11.0 ? 1.0 : 0.0;
          float kfShaft = kfType < 0.5 || (kfType > 7.5 && kfType < 8.5) ? mix(1.0, 0.5, vFold) : mix(1.0, 0.08, max(vFold, kfBody));
          normal = normalize(normal + T * (ridge + barbs * sign(a)) * 0.35 * kfShaft * (uDetail < 0.5 ? 1.0 : 0.5));
        }`
      );
    // the folded wing and the body feathers lying on it: soft rows (remiges and rectrices keep more)
    shader.fragmentShader = softSelfShadow(shader.fragmentShader, 'mix(0.8, 0.35, vFold)');
  };
  mat.customProgramCacheKey = () => `kp-feather-${detail}`;
  return mat;
}

// ------------------------------------------------------------------ BARE PARTS (bill, legs, claws)
const BARE_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uBill, uLegs, uUnder, uMouth;
uniform float uDetail, uBillRough;
varying float vPart;
`;

export function createBarePartsMaterial(pal, detail = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  const uniforms = {
    uBill: { value: srgb(pal.bill) },
    uLegs: { value: srgb(pal.legs) },
    uUnder: { value: plumageAlbedo(pal.underparts) },
    uMouth: { value: srgb('#8e6f6a') },
    uBillRough: { value: pal.billRoughness ?? 0.46 },
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
        if (kbP < 0.5) { kbCol = uBill; kbRough = uBillRough + 0.08 * kpNoise(vUv * vec2(20.0, 40.0)); }
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
  const lidU = { uLidClose: { value: new THREE.Vector2(0, 0) }, uNict: { value: new THREE.Vector2(0, 0) }, uRim: { value: srgb('#171514') }, uLidRing: { value: srgb(pal.eyelidRing ?? '#171514') }, uLidCol: { value: plumageAlbedo(pal.eyeStripe) } };
  lids.userData.uniforms = lidU;
  lids.defines = { USE_UV: '' };
  lids.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lidU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aPart;\nvarying float vPart; varying float vSide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPart = aPart; vSide = position.x > 0.0 ? 0.0 : 1.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec2 uLidClose; uniform vec2 uNict; uniform vec3 uRim; uniform vec3 uLidRing; uniform vec3 uLidCol;\nvarying float vPart; varying float vSide;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lp = floor(vPart + 0.5);
        float closeAmt = vSide < 0.5 ? uLidClose.x : uLidClose.y;
        float nict = vSide < 0.5 ? uNict.x : uNict.y;
        float rr = vUv.x; float ph = vUv.y * 6.2831853;
        float ant = cos(ph) * rr;   // +1 anterior
        float ven = sin(ph) * rr;   // +1 ventral
        // rim: pale lower eyelid (0.3–0.5 mm, spec §13.1), dark above (vUv.x = angle round the rim, sin > 0 ventral)
        vec3 lc = lp < 6.5 ? mix(uRim, uLidRing, smoothstep(0.15, 0.45, sin(vUv.x * 6.2831853))) : uRim;
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
