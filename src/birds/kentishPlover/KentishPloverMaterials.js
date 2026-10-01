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

// Soft plumage lighting: light reaches round the terminator of a feathered surface (the vanes scatter it and the
// outline is a fuzz of barb tips, not a hard skin), so the direct diffuse term is wrapped: (N·L + w) / (1 + w).
// A Lambert terminator made the bird read as porcelain (photos: soft light-to-shadow roll-off on the white
// underparts and the head, p006, p009, p039, p040). The specular / sheen terms keep the true N·L.
function softPlumageLighting(fragmentShader, wrap) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const a = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  if (!chunk.includes(a)) return fragmentShader; // three.js changed the chunk: plain Lambert
  const patched = chunk.replace(
    a,
    `float kpNL = dot( geometryNormal, directLight.direction );
  float kpWrap = clamp( ( kpNL + ${wrap} ) / ( 1.0 + ${wrap} ), 0.0, 1.0 );
  reflectedLight.directDiffuse += directLight.color * kpWrap * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`
  );
  return fragmentShader.replace('#include <lights_physical_pars_fragment>', patched);
}

// ------------------------------------------------------------------ shared GLSL
const GLSL_COMMON = /* glsl */ `
float kpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kpHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// (quintic fade: with the cubic one the cell grid showed as stair-steps along the edges of the markings and in
// the crown streaks in extreme close-ups)
float kpNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(kpHash(i), kpHash(i + vec2(1, 0)), u.x), mix(kpHash(i + vec2(0, 1)), kpHash(i + vec2(1, 1)), u.x), u.y);
}
// periodic in x (period per cells): round the eye
float kpNoiseP(vec2 p, float per) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float i0 = mod(i.x, per); float i1 = mod(i.x + 1.0, per);
  return mix(mix(kpHash(vec2(i0, i.y)), kpHash(vec2(i1, i.y)), u.x), mix(kpHash(vec2(i0, i.y + 1.0)), kpHash(vec2(i1, i.y + 1.0)), u.x), u.y);
}
`;

// Fluff displacement (mm per unit of fluff above the relaxed 0.15) at rest position p with rest normal n —
// mirrors bodyMesh.bodyDisplacementMasks / headness
const GLSL_FLUFF = /* glsl */ `
float kpFluffMM(vec3 p, vec3 n) {
  vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(13.0, 13.0, 15.5);
  float head = clamp((1.25 - length(e)) / 0.35, 0.0, 1.0) * (1.0 - clamp((83.0 - p.y) / 5.0, 0.0, 1.0));
  return (2.5 + 4.5 * smoothstep(-0.2, -0.9, n.y) + (1.5 - 1.8 * smoothstep(5.0, -5.0, p.z)) * smoothstep(0.2, 0.9, n.y)) * (1.0 - 0.7 * head) * (1.0 - 0.8 * smoothstep(-25.0, -55.0, p.z)) * (1.0 - 0.6 * smoothstep(15.0, 30.0, p.z));
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
uniform vec3 uMantle, uMantleDark, uFringe, uBreastPatch, uUnder, uEyeRing, uEyeRingUp, uHeadPat;
uniform float uMelanin, uWear, uSeed, uDetail, uFluff, uFringeMix, uSubterminal, uCapStreak, uCapDrop;
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

// Feathery boundary offset (−1…1) on the body surface: noise in the lattice (circumference, along-flow) mm,
// streaked along the flow like overlapping feather tips; weaker on the far LODs (no shimmer)
float kpEdgeN(vec3 p) {
  vec2 l = kpLattice(p);
  // (less drawn out along the flow, second octave rotated: long flat runs between steps read as blocky in close-ups)
  vec2 q2 = mat2(0.8, -0.6, 0.6, 0.8) * vec2(l.x * 3.6, l.y * 1.6);
  float a = kpNoise(vec2(l.x * 1.6, l.y * 0.8)) + 0.5 * kpNoise(q2 + 7.1);
  return (a / 1.5 - 0.5) * 2.0 * (uDetail < 0.5 ? 1.0 : 0.4);
}

// cap / hood membership of the last kpPlumage call (fine crown streaks, applied with screen-space fading)
float kpHoodM = 0.0;

vec3 kpPlumage(vec3 p, vec3 n, float jitter) {
  kpHoodM = 0.0;
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
    // Head markings. e/u: head-ellipsoid coordinates (centre (0, 93.5, 24), radii 12.5, 12.5, 15; u.y up, u.z
    // forward, |u.x| lateral) for the hind-head; the side and the face are drawn in the side plane (z, y)
    // against the photographed landmarks (eye (25.5, 95.4), bill feather line (39.6, 89.7)).
    vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(12.5, 12.5, 15.0);
    vec3 u = normalize(e);
    float ux = abs(u.x);
    vec2 zy = vec2(p.z, p.y);
    // feathery boundaries: offsets (mm) streaked along the feather flow, ≈0.5 mm feather-tip scale — the edges
    // of the markings are slightly broken, never a drawn line (p012, p070, p050)
    float ej = kpEdgeN(p) * 0.42 + jitter * 0.35;
    float supEnd = uHeadPat.x; // where the white supercilium ends behind the eye (z)
    vec3 h = uUnder; // cheeks, chin, throat
    // Frontal bar: a band 3–3.5 mm tall high on the fore-crown, lower edge y 100 over the forehead (z 36) and 100.8
    // over the eye, ending above the eye centre (z 26); it crosses the midline at the top of the tall white
    // forehead, with a white supercilium ≈3 mm deep between it and the eye. (Drawn lower, from the bill base to
    // the eye's top, it read as a second eye-stripe parallel to the lores: p012, p070, p006, p065, p066.)
    // Male black, the crown colour otherwise
    float fz = smoothstep(36.0, 26.0, p.z);
    float barW = smoothstep(24.6, 26.6, p.z + ej * 2.0); // the bar's rear end
    // (females / juveniles: no bar, the cap itself comes down to ≈1 mm above the eye — uCapDrop, p050, p062)
    float barLo = mix(100.0, 100.8, fz) - uCapDrop * smoothstep(34.0, 26.0, p.z);
    float barHi = barLo + mix(3.5, 2.9, fz) * mix(0.9, 1.1, uMelanin) * mix(1.0, 0.6, smoothstep(28.0, 25.0, p.z));
    float bar = smoothstep(barLo - 0.3, barLo + 0.3, p.y + ej) * (1.0 - smoothstep(barHi - 0.25, barHi + 0.25, p.y + ej)) * barW;
    // Cap (crown + nape hood): above the bar in front; behind the bar its lower edge runs back over the
    // supercilium (y 100 at z 24, 99 at z 13) and wraps down the hind-head to the collar. Where the supercilium
    // ends (supEnd: male z 13, females / juveniles 20–22) the cap drops to the ear coverts (p050, p062, p035)
    // (the cap runs down to the bar's LOWER edge and the bar is painted over it: a cap edge at the bar's top left
    // a white notch up to the crown wherever the bar tapered out, behind its rear end)
    float capLow = mix(99.0 - uCapDrop * 0.5, barLo, smoothstep(13.0, 26.0, p.z));
    capLow = mix(capLow, 96.6, smoothstep(supEnd + 1.5, supEnd - 2.5, p.z) * smoothstep(9.0, 13.0, p.z));
    float crownTop = smoothstep(capLow - 0.3, capLow + 0.3, p.y + ej);
    float nape = smoothstep(-0.18, -0.38, u.z + ej * 0.04) * (1.0 - smoothstep(0.5, 0.66, ux + ej * 0.03)) * smoothstep(-0.35, -0.1, u.y);
    float hood = max(crownTop, nape); // (the bar is painted over it: a (1 − bar) here left a pale seam along its top)
    vec3 hoodCol = mix(uCrown, uCrownRear, smoothstep(0.2, -0.3, u.z));
    hoodCol = mix(hoodCol, uNape, smoothstep(-0.3, -0.7, u.z));
    h = mix(h, hoodCol, hood);
    // (no streaks on the male's black bar; in females the bar is the cap itself)
    kpHoodM = hood * (1.0 - bar * clamp(length(uFrontalBar - uCrown) * 8.0, 0.0, 1.0)) * headZone;
    // Supercilium: white between the eye and the bar / cap, from the forehead back to supEnd
    float sup = smoothstep(96.6, 97.6, p.y + ej) * (1.0 - hood) * (1.0 - bar) * smoothstep(supEnd - 1.0, supEnd + 2.0, p.z + ej) * smoothstep(3.0, 6.0, ax);
    h = mix(h, uSupercilium, sup);
    // White forehead under the bar, above the lores
    float fore = smoothstep(31.0, 35.0, p.z) * smoothstep(92.5, 94.0, p.y) * (1.0 - hood) * (1.0 - bar);
    h = mix(h, uForehead, fore);
    h = mix(h, uFrontalBar, bar);
    // Eye mask (male black, brown in females / juveniles, S5, S7, S10):
    // (the visible eye: cornea apex at (z 26.8, y 95.6), 5.3 mm across)
    // lores: from the side of the bill base (z 39.8, y 90.6), thin there (1.7 mm) and widening into the front of
    // the eye (4.4 mm)
    // (3 mm deep at the bill base — the whole side of the bill base — widening to the eye's height, p012, p070)
    vec2 la = vec2(41.6, 90.2);
    vec2 lb = vec2(28.6, 95.4);
    float tl = clamp(dot(zy - la, lb - la) / dot(lb - la, lb - la), 0.0, 1.0);
    float lore = 1.0 - smoothstep(-0.3, 0.3, length(zy - mix(la, lb, tl)) + ej - mix(1.5, 2.35, tl) * uMelanin * mix(0.5, 1.0, clamp((uHeadPat.y - 0.4) / 0.6, 0.0, 1.0)));
    // (narrower where the loral stripe is pale: a thin brown line in females, p050)
    // (on the sides of the bill base only — over the culmen the two met as a moustache across the forehead)
    lore *= smoothstep(1.6, 2.7, ax) * smoothstep(0.35, 0.65, abs(n.x)) * uHeadPat.y;
    // round the eye: 1.3 mm of mask beyond the lids, a little more below and behind (the eye sits in the mask,
    // p012, p070, p043; females / juveniles only behind it)
    float surround = (1.0 - smoothstep(-0.3, 0.3, length((zy - vec2(26.2, 95.2)) * vec2(0.92, 1.0)) + ej - 4.0 * uMelanin)) * uHeadPat.z;
    // behind the eye the mask is as deep as the eye and runs on into the ear coverts (p012, p070, p065: no pale gap
    // between the eye and the ear patch)
    {
      vec2 pa = zy - vec2(25.6, 95.4); vec2 ba = vec2(-6.0, -0.4);
      float tb = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      surround = max(surround, (1.0 - smoothstep(-0.3, 0.3, length(pa - ba * tb) + ej - mix(2.7, 2.4, tb) * uMelanin)) * uHeadPat.z);
    }
    // ear coverts: behind the eye, as deep as the eye with its lids (≈5 mm) and ending ≈8 mm behind the eye
    // centre (p012, p006, p065: 14 mm reached the hind-crown)
    vec2 ec = (zy - vec2(20.0, 94.9)) / (vec2(4.9, 2.6) * uMelanin);
    // (a softer edge in females / juveniles, where the brown ear coverts shade into the cap and neck: p050, p062)
    float earS = 0.1 + 0.25 * clamp(uCapDrop, 0.0, 1.0);
    float ear = 1.0 - smoothstep(0.96 - earS, 0.96 + earS, length(ec) + ej * 0.16);
    // upper edge: the white supercilium lies on the upper lid (y 98.3 over the eye), lower over the lores (96.9)
    // and behind the eye (97.6 at z 20, 97.0 at z 14)
    float topY = p.z > 26.8 ? mix(98.3, 96.9, smoothstep(28.0, 32.0, p.z)) : mix(97.0, 98.3, smoothstep(14.0, 25.0, p.z));
    float maskTop = 1.0 - smoothstep(-0.3, 0.3, p.y + ej * 0.6 - topY);
    float sideM = smoothstep(3.5, 6.5, ax);
    h = mix(h, uEyeStripe, max(lore, surround * sideM) * maskTop);
    h = mix(h, uEarCoverts, ear * sideM * mix(maskTop, 1.0, hood));
    // Eyelids on the wall and rounded rim of the eye opening (bodySculpt.cuts: a 2.78 mm tube along the eye axis,
    // the aperture 1.2 mm down it): dark lid skin down the wall, then a thin eye-ring on the rim — pale all round
    // in females / juveniles (p001, p010, p035, p045), only below the eye in the male's black mask (p012, p043)
    // (the opening is an almond — feathered lid folds above and below, bodySculpt.adds — so the lid margin and
    // the ring are drawn on an ellipse in the eye's frame, 1.5× flatter vertically)
    vec3 eq = vec3(ax, p.y, p.z) - vec3(7.6, 95.0, 25.5);
    float es = dot(eq, vec3(0.954, 0.130, 0.270));
    float eV = dot(eq, vec3(0.125, -0.991, 0.035)); // + ventral
    float eU = dot(eq, vec3(-0.268, -0.036, 0.963)); // + anterior
    float er = length(vec2(eU, (eV - 0.15) * 1.5));
    float eAng = atan(eV, eU); // + ventral, 0 anterior
    float eRim = 1.0 - smoothstep(2.95, 3.25, er + jitter * 0.1 + 0.04 * sin(eAng * 9.0 + jitter * 3.0));
    float eWall = (1.0 - smoothstep(4.25, 4.5, es)) * (1.0 - smoothstep(2.85, 3.0, er));
    vec3 ring = mix(uEyeRingUp, uEyeRing, smoothstep(0.15, 0.65, sin(eAng)));
    h = mix(h, ring, eRim * smoothstep(4.3, 4.55, es));
    h = mix(h, vec3(0.012, 0.010, 0.009), eWall * smoothstep(2.0, 3.0, es));
    col = mix(col, h, headZone);
  }

  // Breast-side patches (male: black rhombus 29 mm long along (z, y) (6, 86) → (24, 63), 52° from horizontal,
  // half-width 3 at the ends and 5 in the middle, |x| ≥ 7, 9 mm short of the breast front — never meeting in the
  // centre; it covers the carpal joint and meets the wing's lower edge at (20, 63)) (S7, S10; spec §14)
  vec2 pa = vec2(p.z - 8.0, p.y - 85.5);
  vec2 ba = vec2(17.0, -21.0);
  float tt = dot(pa, ba) / dot(ba, ba);
  float dPerp = abs(pa.x * ba.y - pa.y * ba.x) / length(ba);
  // (tapering rhombus, not a parallel bar; its top stays under the white hind-collar: p003, p006, p020, p070)
  // (a wedge 6 mm across at most, broadest in its upper third under the collar and tapering to a point toward the
  // wing bend — the 10 mm parallel blade read as a black plate, p012, p006, p070, p043; feathery edges)
  float tc = clamp(tt, 0.0, 1.0);
  float hw = (0.9 + 2.6 * smoothstep(0.0, 0.28, tc) * (1.0 - smoothstep(0.32, 0.98, tc))) * uMelanin;
  float ends = smoothstep(0.0, 0.08, tt) * (1.0 - smoothstep(0.86, 0.98, tt));
  float bEdge = kpEdgeN(p) * 0.55 + jitter * 0.4;
  float patchM = (1.0 - smoothstep(hw - 0.45, hw + 0.45, dPerp + bEdge)) * ends * smoothstep(6.0, 8.0, ax) * (1.0 - smoothstep(-6.5, -4.5, q + bEdge * 0.6));
  // denser black at the top, a little browner where it thins toward the wing bend
  col = mix(col, mix(uBreastPatch, uBreastPatch * 1.6 + 0.012, smoothstep(0.45, 0.95, tc)), patchM);
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
    uEyeRing: { value: plumageAlbedo(pal.eyelidRing ?? '#dcd6cd') },
    // supercilium end behind the eye (z mm), loral stripe strength, mask round the eye (0 = only behind it)
    uHeadPat: { value: new THREE.Vector3(...(pal.headPattern ?? [13, 1, 1])) },
    uEyeRingUp: { value: plumageAlbedo(pal.eyelidRingUpper ?? pal.eyelidRing ?? '#dcd6cd') },
    uFringeMix: { value: pal.fringeMix ?? 0.55 },
    uSubterminal: { value: pal.subterminalDark ? 1 : 0 },
    uCapStreak: { value: pal.capStreak ?? 0.4 },
    uCapDrop: { value: pal.capDrop ?? 0 },
  };
}

// Plumage fringe (LOD0): the body drawn again as a few shells 0.2–1 mm out along the normal, each kept only where
// a barb tip reaches it (alpha-to-coverage), so the outline is a soft fuzz of feather tips instead of a hard CG
// edge — longest on the downy white underparts and flanks, short on the head, shortest on the mantle under the
// scapulars; none round the eyes (photos: p006, p009, p039, p040, p053, p019).
const GLSL_SHELL_VERT = /* glsl */ `
attribute float aShell; varying float vShell;
float kpShellMM(vec3 p, vec3 n) {
  vec3 e = (p - vec3(0.0, 93.5, 24.0)) / vec3(13.0, 13.0, 15.5);
  float head = clamp((1.25 - length(e)) / 0.35, 0.0, 1.0) * (1.0 - clamp((83.0 - p.y) / 5.0, 0.0, 1.0));
  float under = smoothstep(0.35, -0.3, n.y);       // breast, belly, flanks
  float len = mix(0.3, 0.6, under);
  len *= mix(1.0, 0.55, head);                       // short, dense head feathering
  len *= mix(1.0, 0.35, smoothstep(0.3, 0.7, n.y) * smoothstep(5.0, 9.0, abs(p.x)) * (1.0 - head)); // under the scapulars / wing
  vec3 q = vec3(abs(p.x), p.y, p.z) - vec3(7.6, 95.0, 25.5);
  float es = dot(q, vec3(0.954, 0.130, 0.270));
  float er = length(q - vec3(0.954, 0.130, 0.270) * es);
  len *= smoothstep(3.6, 5.0, er + max(0.0, 2.0 - es));  // keep the eye opening clear
  len *= smoothstep(-60.0, -50.0, p.z);              // not under the tail coverts
  // nor under the folded wing and the scapulars (they would stand through the gaps between the feathers): above
  // the wing's lower edge (kpUpperEdge, (z, y) (20, 63) … (−55, 60)) and behind the shoulder
  float yb = p.z > 5.0 ? mix(60.0, 63.0, clamp((p.z - 5.0) / 15.0, 0.0, 1.0)) : p.z > -25.0 ? mix(55.5, 60.0, (p.z + 25.0) / 30.0) : mix(60.0, 55.5, clamp((p.z + 55.0) / 30.0, 0.0, 1.0));
  len *= 1.0 - smoothstep(yb - 3.0, yb - 1.0, p.y + n.y * 3.0) * (1.0 - smoothstep(8.0, 16.0, p.z)) * (1.0 - head);
  return len;
}
`;
const GLSL_SHELL_FRAG = /* glsl */ `
  {
    // Barb tips. Two scales: individual strands (0.25 × 0.9 mm, streaked along the feather flow, each reaching a
    // random height and thinning toward its tip) where they span ≥ 2 px, and below that their mean density — a
    // smooth coverage ramp, so the fringe never resolves into a dotted line of sub-pixel strands (that read as a
    // pale stippled halo). Both are modulated by soft tufts (≈1.6 × 3.5 mm) so the edge is downy, not a blur.
    vec2 kpLt = kpLattice(vRest);
    float kpFoot = length(fwidth(vRest)) * 0.577;       // mm per pixel
    float kpTuft = kpNoise(kpLt * vec2(1.0 / 1.6, 1.0 / 3.5) + uSeed * 9.0);
    float kpS = vShell / mix(0.55, 1.0, kpTuft);        // height relative to the local tuft
    vec2 kpSL = kpLt * vec2(1.0 / 0.25, 1.0 / 0.9);
    vec2 kpSC = floor(kpSL);
    vec2 kpSF = fract(kpSL) - 0.5;
    float kpSH = 0.35 + 0.65 * kpHash(kpSC + 13.7);     // strand height (fraction of the shell stack)
    float kpSW = 0.42 * (1.0 - 0.75 * clamp(kpS / kpSH, 0.0, 1.0));
    float kpSX = abs(kpSF.x + (kpHash(kpSC + 3.1) - 0.5) * 0.3);
    float kpAA = clamp(kpFoot / 0.25, 0.02, 0.5);       // strand edge width in cells (≈1 px)
    float kpStrand = (1.0 - smoothstep(kpSW - kpAA, kpSW + kpAA, kpSX)) * smoothstep(kpSH, kpSH - 0.2, kpS);
    // mean density of the strands at this height: P(height > s) · mean width
    float kpMean = clamp((1.0 - kpS) / 0.65, 0.0, 1.0) * 0.84 * (1.0 - 0.5 * clamp(kpS, 0.0, 1.0));
    float kpCov = mix(kpStrand, kpMean, smoothstep(0.06, 0.14, kpFoot));
    // only toward the outline: face-on the tips lie flat over the vanes and the surface reads smooth
    float kpFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    kpCov *= 1.0 - smoothstep(0.15, 0.45, kpFacing);
    // and only while the fringe spans a few pixels (demo distance: the MSAA edge alone is soft enough)
    kpCov *= 1.0 - smoothstep(0.3, 0.6, kpFoot);
    if (kpCov < 0.03) discard;
    diffuseColor.a = kpCov;
    kpShellAO = 0.86 + 0.14 * vShell;                    // barbs shade each other toward the skin
  }
`;

/**
 * Body plumage material. `detail` 0 = full micro-structure + sheen (LOD0), 1 = reduced, 2 = colour only.
 */
export function createBodyMaterial(pal, individual = {}, detail = 0, { shellOf = null } = {}) {
  const params = { roughness: 0.78, metalness: 0, color: 0xffffff };
  // (the shell variant is the same material as the body — any difference in the BRDF shows as a rim: without
  // specular / sheen its diffuse escaped the grazing Fresnel and sheen energy terms and drew a pale halo; its
  // normal is bent toward the viewer instead, see below)
  const mat = detail === 0 ? new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.25, sheenRoughness: 0.75, sheenColor: new THREE.Color(0.55, 0.53, 0.5) }) : new THREE.MeshStandardMaterial(params);
  // shell variant (plumage fringe, KentishPloverModel): shares the body's uniforms, so it fluffs and breathes with it
  const shell = !!shellOf;
  if (shell) {
    mat.alphaToCoverage = true;
    mat.defines = { KP_SHELL: '' };
  }
  const uniforms = shell ? shellOf.userData.uniforms : {
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
      .replace('#include <common>', `#include <common>\nattribute vec3 aRest; attribute vec3 aFlow;\nuniform float uFluff; uniform float uBreath; uniform float uNapeFill;\nvarying vec3 vRest; varying vec3 vRestN; varying vec3 vFlowV; varying vec3 vFlowR;\n${GLSL_FLUFF}\n${GLSL_NAPE}\n${shell ? GLSL_SHELL_VERT : ''}`)
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
      .replace('#include <begin_vertex>', `#include <begin_vertex>${shell ? '\n vShell = aShell;' : ''}\n transformed += normal * (uFluff - ${FLUFF_REST_GLSL}) * 0.001 * kpFluffMM(aRest, normal);\n transformed += normal * uNapeFill * 0.001 * kpNapeMM(aRest, normal);\n transformed += normal * uBreath * ${ANIM_BREATH} * smoothstep(-40.0, -15.0, aRest.z) * (1.0 - smoothstep(18.0, 30.0, aRest.z)) * (1.0 - smoothstep(76.0, 84.0, aRest.y));`);
    // shell: lifted along the skinned normal for the projection only — the world position used for the shadow
    // lookup stays on the skin, so a strand is lit and shadowed exactly as the plumage under it (lifted, the
    // strands stood out of the body's own shadow along the terminator and drew a pale rim round the outline)
    if (shell)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `vec3 kpSkin = transformed;
        transformed += objectNormal * aShell * 0.001 * kpShellMM(aRest, normal) * (1.0 + 0.6 * max(uFluff, 0.0));
        #include <project_vertex>
        transformed = kpSkin;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BODY_UNIFORMS_GLSL}\n${BODY_FRAG_FUNCS}${shell ? '\nvarying float vShell;' : ''}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float kpShellAO = 1.0;
        ${shell ? GLSL_SHELL_FRAG : ''}
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
        // Crown, nape and hood: fine streaks of the ≈1 mm head feathers — dark shaft streaks and pale tips drawn out
        // along the flow, irregular (noise, not a lattice: a tiled crown read as scales) — clear in females and
        // juveniles, faint in the male's rufous cap (p050, p062, p001, p012). Fades out before a streak is ≈2 px.
        {
          vec2 kpL2 = kpLattice(vRest);
          vec2 kpQs = kpL2 * vec2(1.0 / 0.3, 1.0 / 1.1);       // shaft streaks
          vec2 kpQt = kpL2 * vec2(1.0 / 0.55, 1.0 / 0.75) + 9.1; // pale tips
          float kpN1 = kpNoise(kpQs + uSeed * 31.0) * 0.65 + kpNoise(kpQs * vec2(2.1, 1.6) + 5.3) * 0.35;
          float kpN2 = kpNoise(kpQt) * 0.65 + kpNoise(kpQt * 2.3 + 1.7) * 0.35;
          float kpSF = (1.0 - smoothstep(0.3, 0.7, fwidth(kpQs.y))) * (uDetail < 1.5 ? 1.0 : 0.0);
          float kpAmt = uCapStreak * kpHoodM * kpSF;
          kpCol = mix(kpCol, kpCol * 0.74, smoothstep(0.55, 0.82, kpN1) * kpAmt);
          kpCol = mix(kpCol, mix(kpCol, uFringe, 0.55) * 1.05, smoothstep(0.6, 0.85, kpN2) * kpAmt * 0.55);
        }
        // Face: the short, fine feathers of the head — radiating from the eye round it, drawn back along the flow
        // over the cheeks and ear coverts, forward onto the bill base over the lores (p012, p037, p050, p062). Soft
        // tone streaks and a faint bump; gone before a feather is ≈2 px (no shimmer at a distance)
        float kpFaceN = 0.0;
        {
          float kpFaceM = smoothstep(0.1, 0.6, kpHeadness(vRest)) * (uDetail < 1.5 ? 1.0 : 0.0);
          vec2 kpE = vec2(vRest.z - 25.8, vRest.y - 95.3);
          float kpEr = length(kpE);
          float kpRad = (1.0 - smoothstep(4.5, 8.0, kpEr)) * smoothstep(5.0, 9.0, abs(vRest.x));
          // 60 feathers round the eye, ≈0.9 mm long
          vec2 kpQe = vec2((atan(kpE.y, kpE.x) / 6.2832 + 0.5) * 60.0, kpEr / 0.9);
          vec2 kpQf = kpLattice(vRest) * vec2(1.0 / 0.34, 1.0 / 0.95) + 3.3;
          float kpNe = kpNoiseP(kpQe, 60.0) * 0.6 + kpNoiseP(kpQe * vec2(2.0, 1.7) + vec2(0.0, 4.1), 120.0) * 0.4;
          float kpNf = kpNoise(kpQf) * 0.6 + kpNoise(kpQf * vec2(2.3, 1.7) + 1.3) * 0.4;
          float kpFF = 1.0 - smoothstep(0.3, 0.7, max(fwidth(kpQf.x), fwidth(kpQe.x) * kpRad));
          kpFaceN = (mix(kpNf, kpNe, kpRad) - 0.5) * kpFaceM * kpFF;
          // (relative: the white face gets faint grey streaks, the black mask faint sheen streaks)
          float kpLumF = dot(kpCol, vec3(0.2126, 0.7152, 0.0722));
          kpCol = mix(kpCol * (1.0 + kpFaceN * 0.16), kpCol + kpFaceN * 0.03, 1.0 - smoothstep(0.05, 0.2, kpLumF));
        }
        // White breast, flanks and belly: the overlapping feather tips just show as faint soft shadows under each
        // tip, broken into patches (p006, p039, p053); none at a distance
        {
          float kpWt = (1.0 - kpBrown) * (1.0 - kpHeadZ) * smoothstep(-58.0, -50.0, vRest.z) * kpFade * (uDetail < 1.5 ? 1.0 : 0.0);
          float kpTipSh = (1.0 - smoothstep(0.0, 0.22, kpFxy.y)) * (0.5 + 0.5 * kpRnd) * smoothstep(0.35, 0.65, kpNoise(kpLat * 0.45 + 3.7));
          kpCol *= 1.0 - 0.06 * kpTipSh * kpWt;
        }
        kpCol *= mix(1.0, 0.9 + 0.1 * smoothstep(0.0, 0.3, kpFxy.y), kpFade * kpTr.y * kpBrown * kpTex * smoothstep(1.6, 2.6, kpTr.x) * (uDetail < 1.5 ? 1.0 : 0.0));
        diffuseColor.rgb *= kpCol * kpShellAO;`
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
          // soft clumps of feathers on the white underparts, flanks and head (the photographed belly is a fluffy
          // surface of groups of feathers, not a smooth shell: p006, p009, p039, p053): gentle lumps ≈4 × 7 mm,
          // elongated along the flow; none on the tiled upperparts
          {
            vec2 kpCl = kpLattice(vRest) * vec2(1.0 / 3.6, 1.0 / 6.5);
            float kpC0 = kpNoise(kpCl);
            float kpCx = kpNoise(kpCl + vec2(0.12, 0.0)) - kpC0;
            float kpCy = kpNoise(kpCl + vec2(0.0, 0.12)) - kpC0;
            float kpClS = (1.0 - kpTex * smoothstep(0.25, 0.55, kpN.y)) * (1.0 - smoothstep(0.6, 1.6, fwidth(kpCl.y) * 8.0));
            vec3 kpT0 = normalize(vFlowV - normal * dot(vFlowV, normal));
            normal = normalize(normal - (kpT0 * kpCy * 0.9 + cross(normal, kpT0) * kpCx * 0.6) * 1.1 * kpClS);
          }
          normal = normalize(normal - (kpT * (kpG.y * 0.9) + kpB2 * (kpG.x * 0.35 + kpBarbs)) * 0.1 * kpStr);
          // face feather bump (screen-space derivative bump of kpFaceN, ≈0.05 mm)
          {
            vec3 kpSX = dFdx(-vViewPosition); vec3 kpSY = dFdy(-vViewPosition);
            vec3 kpR1 = cross(kpSY, normal); vec3 kpR2 = cross(normal, kpSX);
            float kpDet = dot(kpSX, kpR1);
            float kpBH = kpFaceN * 0.00005;
            vec3 kpGrad = sign(kpDet) * (dFdx(kpBH) * kpR1 + dFdy(kpBH) * kpR2);
            if (abs(kpDet) > 0.0) normal = normalize(abs(kpDet) * normal - kpGrad);
          }
        }
        #ifdef KP_SHELL
          // the strands stand out past the outline, where the skin normal is edge-on to the view: shaded there,
          // they took the extreme grazing sheen / Fresnel lobes. Shade them as the plumage just inside the outline
          // (normal turned toward the viewer to N·V ≥ 0.35) — the fringe continues the edge colour, no rim
          {
            vec3 kpV = normalize(vViewPosition);
            normal = normalize(normal + kpV * max(0.0, 0.35 - dot(normal, kpV)) * 1.2);
          }
        #endif`
      );
    shader.fragmentShader = softPlumageLighting(softSelfShadow(shader.fragmentShader, '0.55'), '0.3');
  };
  mat.customProgramCacheKey = () => `kp-body-${detail}${shell ? '-shell' : ''}`;
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
  // frayed, soft vane edges (alpha-to-coverage, LOD0/1)
  if (detail < 2) mat.alphaToCoverage = true;
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
        diffuseColor.rgb *= kfCol;
        // Soft vane edges: the outer barbs end at slightly different lengths and thin out, so the outline of a
        // feather is a soft, slightly ragged fringe rather than a cut edge — strongest on the body-like feathers
        // (coverts, tertials, scapulars, tail coverts: the closed wing read as stacked plates, p039, p040, p052),
        // light on the remiges and rectrices
        {
          float kfSoftT = (kfType > 1.5 && kfType < 7.5) || kfType > 8.5 ? 1.0 : 0.45;
          float kfBarb = abs(vUv.x) * 1.6 - vUv.y * 3.2;
          // (fine and shallow: coarser, deeper notches read as torn paper along every covert row once the coverage
          // alpha stopped brightening them — the photographed rows are smooth rounded tips, p039, p052)
          float kfB = floor(kfBarb * 26.0);
          float kfJag = kpHash(vec2(kfB, kfType * 7.0 + vFeather.y)) * 0.6 + kpHash(vec2(kfB * 0.37, vFeather.z * 31.0)) * 0.4;
          float kfEdge = 1.0 - abs(vUv.x);
          float kfW = mix(0.035, 0.085, kfSoftT) * (uDetail < 0.5 ? 1.0 : 0.6);
          float kfFade = 1.0 - smoothstep(0.02, 0.1, fwidth(vUv.x));
          float kfA = mix(0.4, 1.0, smoothstep(0.0, kfW, kfEdge - kfW * 0.35 * kfJag));
          diffuseColor.a = mix(1.0, kfA, kfFade * smoothstep(0.55, 0.8, vUv.y));
        }`
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
        roughnessFactor = mix(0.72, 0.86, smoothstep(0.03, 0.35, kfLum));`
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
    shader.fragmentShader = softPlumageLighting(softSelfShadow(shader.fragmentShader, 'mix(0.8, 0.22, vFold)'), '0.25');
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
  const eyeball = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.2, side: THREE.DoubleSide });
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
  // (roughness 0.06 / env 1.3 drew a crisp sun disc and a bright sky lens: a glossy black ball; the photographed
  // eyes show one small soft catch-light, p012, p070, p050, p062)
  const cornea = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.14, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.75 });
  // the reflection fades out toward the cornea's rim, where the lid margin overlaps it: at grazing angles the
  // Fresnel term drew a bright ring round the eye (a glass bead; the photographed eyes show only the catch-light
  // and a faint sky reflection on the upper half)
  cornea.defines = { USE_UV: '' };
  cornea.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 - smoothstep(0.45, 0.85, vUv.x);\n#include <opaque_fragment>');
  };
  cornea.customProgramCacheKey = () => 'kp-cornea';

  // Lids: rim (dark eyelid skin), lower lid (rises when asleep), nictitating membrane (blink).
  const lids = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, envMapIntensity: 0.3, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false });
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
        vec3 lc = uRim; // (the pale eye-ring lies on the plumage rim: body shader)
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
