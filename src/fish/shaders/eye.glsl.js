// Eye shader: unit eyeball with +Z optical axis. Round fixed pupil (teleost,
// about half the visible eye), spherical lens bulging through it, guanine
// iris (brass or silver-grey, pigment-clouded above) with flecks and crypts, thin
// dark limbus ring; a dark brass / silver-grey overall value. Layers:
//   * cornea  — the clearcoat on the geometric (eyeball) sphere: a faint,
//               crisp window highlight
//   * lens    — high-index sphere seen through the pupil: base specular with
//               a strongly curved normal, so its highlight is small and sharp
//   * iris    — a nearly flat diaphragm behind the cornea: diffuse shading
//               with a flattened normal (evenly lit ring, not a shaded ball)

import { head } from '../morphology.js';
import { eyeRest } from '../BodyGeometry.js';

// The eye sits nearly flush in its orbit: only a low cap of the ball shows
// (see morphology.js). Edge of that cap as sin(angle from the optical axis);
// the rim of orbital skin laps a little over it.
const VIS_R = (0.97 * Math.sqrt(1 - (1 - head.eyeProtrusion) ** 2)).toFixed(4);
// depth of the iris plane in the unit ball (the base of the exposed cap)
const IRIS_PLANE = (1 - head.eyeProtrusion).toFixed(4);
const VIS_R_EDGE = (1.0 * Math.sqrt(1 - (1 - head.eyeProtrusion) ** 2)).toFixed(4);
// rest-frame point where the eye meets the head (left side), around which
// the head pigment is sampled
const [EYE_SX, EYE_SY, EYE_SZ] = eyeRest(1).surface.toArray().map((v) => v.toFixed(5));

export const eyeVertexPars = /* glsl */ `
in vec4 aEyeParams; // x: iris hue mix, y: pupil size, z: iris brightness, w: seed
out vec3 vEyeLocal;
out vec3 vEyeWorld;
flat out vec4 vEyeParams;
flat out vec3 vEyeX;
flat out vec3 vEyeY;
flat out vec3 vEyeZ;
in vec4 aEyeHead; // x: sarasa, y: red coverage, z: body pattern seed, w: side
flat out float vHeadSilver;
`;

export const eyeVertexMain = /* glsl */ `
vEyeLocal = position;
vEyeParams = aEyeParams;
vEyeWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
{
  // eye frame in view space (uniform scale, so the normal matrix is a rotation)
  mat3 im = mat3(instanceMatrix);
  vEyeX = normalize(normalMatrix * (im * vec3(1.0, 0.0, 0.0)));
  vEyeY = normalize(normalMatrix * (im * vec3(0.0, 1.0, 0.0)));
  vEyeZ = normalize(normalMatrix * (im * vec3(0.0, 0.0, 1.0)));
}
{
  // a sarasa's iris follows the skin around its eye: silver-grey where the
  // head is white, brass under a red cap (the body's own patch field,
  // sampled above, behind and below the orbit; constant per eye)
  float hs = 0.0;
  if (aEyeHead.x > 0.5) {
    float th = 1.0 - aEyeHead.y;
    vec3 c = vec3(${EYE_SX}, ${EYE_SY}, ${EYE_SZ} * aEyeHead.w);
    float red = smoothstep(th - 0.04, th + 0.04, sarasaField(c + vec3(0.0, 0.045, -0.006 * aEyeHead.w), aEyeHead.z));
    red += smoothstep(th - 0.04, th + 0.04, sarasaField(c + vec3(-0.05, 0.0, 0.004 * aEyeHead.w), aEyeHead.z));
    red += smoothstep(th - 0.04, th + 0.04, sarasaField(c + vec3(0.0, -0.04, -0.004 * aEyeHead.w), aEyeHead.z));
    hs = 1.0 - red / 3.0;
  }
  vHeadSilver = hs;
}
`;

export const eyeFragmentPars = /* glsl */ `
#define IRIS_PLANE ${IRIS_PLANE}
in vec3 vEyeLocal;
in vec3 vEyeWorld;
flat in vec4 vEyeParams;
flat in vec3 vEyeX;
flat in vec3 vEyeY;
flat in vec3 vEyeZ;
flat in float vHeadSilver;
uniform vec3 uIrisGold;
uniform vec3 uIrisRed;
uniform vec3 uIrisSilver;
uniform float uPupil;
uniform float uIrisMetal;
float gEyeMetal;
float gEyeRough;
float gPupil;
float gPupilR;
float gIris;
float gIrisR;

vec3 eyeColor() {
  vec3 pb = normalize(vEyeLocal);
  // the iris is a flat diaphragm behind a clear corneal dome: look it up
  // where the view ray meets that plane (partial parallax: the cornea is
  // flatter than the ball it is drawn on), so an oblique view shows a domed
  // window over a foreshortened iris instead of a painted ball whose far
  // side swells into a pale grey crescent
  vec3 p = pb;
  if (pb.z > 0.0) {
    vec3 V = normalize(vViewPosition);
    vec3 d = -vec3(dot(V, vEyeX), dot(V, vEyeY), dot(V, vEyeZ));
    // (weak: the fish iris lies just under a flat cornea with the lens
    // bulging through the pupil; a deep plane slid the pupil toward an
    // oblique viewer, so the eyes seemed to turn and look at the camera)
    float k = 0.18 * (pb.z - IRIS_PLANE) / max(-d.z, 0.35);
    p = vec3(pb.xy + d.xy * k, pb.z);
  }
  float r = length(p.xy);           // sin(angle from optical axis)
  float front = step(0.0, p.z);
  float ang = atan(p.y, p.x);
  float seed = vEyeParams.w;
  float silver = max(clamp(vEyeParams.x - 1.0, 0.0, 1.0), 0.85 * vHeadSilver);
  // dorsal direction of the fish in the eye frame (the iris is more
  // pigmented and shaded by the orbit above, brighter below)
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec2 up2 = vec2(dot(upV, vEyeX), dot(upV, vEyeY));
  float upness = dot(p.xy, up2) / max(r * length(up2), 1e-4);
  // pupil: round, about half the visible eye; its margin is not a perfect
  // circle (the iris edge is slightly irregular)
  float pupilR = uPupil * vEyeParams.y * (1.0 + 0.03 * (vnoise2(vec2(ang * 2.5 + seed * 5.0, seed)) - 0.5));
  // edge of the visible eye (the skin meets the ball here): the iris runs
  // right out to it, so the dark limbus is a thin line at the skin margin
  // rather than a broad grey band
  // (it runs on a little under the skin: on the flatter cap of the larger
  // ball a saccade slides the iris noticeably, and a disc ending exactly at
  // the edge then bared a dark crescent of ball on one side)
  float irisR = ${VIS_R_EDGE} * 1.1;
  float t = smoothstep(pupilR, irisR, r); // 0 pupil margin .. 1 limbus
  // iris: a broad guanine diaphragm (p05_1, p12_0, p11_1, p25_0, p29_0):
  // brass / bronze (silver-grey on white fish), radially fibred, mottled and flecked with reflective
  // iridophores, a warm gold collar at the pupillary margin, chromatophore
  // pigment (the body colour) clouding its upper part, and a thin dark
  // limbus where it meets the orbital skin
  vec3 outer = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  outer = mix(outer, uIrisSilver, silver);
  float patchI = vnoise2(vec2(ang * 2.2 + seed * 7.0, r * 3.0 + seed));
  float patch2 = vnoise2(vec2(ang * 7.0 + seed * 3.0, r * 9.0 - seed));
  // the guanine base: a dark brass / bronze on red and orange fish, a mid
  // silver-grey on white ones (p29_0, p09_1, p12_0, p11_1): a much darker
  // value than the body (iris luminance ~0.4), never a pale glassy grey
  vec3 brass = mix(vec3(0.3, 0.17, 0.045), outer * vec3(0.5, 0.48, 0.5), 0.25);
  vec3 greyI = uIrisSilver * vec3(0.38, 0.39, 0.4);
  vec3 guanine = mix(brass, greyI, silver);
  vec3 iris = guanine;
  // a warm gold collar just outside the pupil (narrow: the photos show a
  // gold glint at the pupillary margin, the rest of the iris darker)
  vec3 collar = mix(uIrisGold * 0.75, uIrisSilver * 0.6, silver);
  iris = mix(iris, collar, smoothstep(0.22, 0.0, t) * 0.75);
  // radial texture: fine iris fibres (stretched along the radius) and
  // broader radial streaks, so the ring has grain rather than a smooth tone
  float fib = vnoise2(vec2(ang * 70.0 + seed * 13.0, r * 6.0 + 0.6 * vnoise2(vec2(ang * 9.0, seed))));
  float streak = vnoise2(vec2(ang * 16.0 - seed * 4.0, r * 2.5 + seed));
  iris *= 0.82 + 0.24 * fib;
  iris *= 0.85 + 0.25 * streak;
  // mottling: irregular darker grey-brown clouds of melanophores (densest
  // above the pupil, p12_0) and paler silver patches
  float mot = vnoise2(vec2(ang * 3.2 + seed * 7.0, r * 5.0 + seed)) * 0.6 + vnoise2(vec2(ang * 9.0 - seed * 2.0, r * 14.0)) * 0.4;
  vec3 melan = mix(vec3(0.08, 0.065, 0.05), outer * 0.2, 0.3);
  iris = mix(iris, melan, 0.6 * smoothstep(0.42, 0.7, mot + 0.12 * upness) * smoothstep(0.08, 0.3, t));
  iris = mix(iris, mix(brass * 1.5, greyI * 1.4, silver), 0.25 * smoothstep(0.4, 0.15, mot) * smoothstep(0.1, 0.4, t));
  iris = mix(iris, outer * 0.55, 0.22 * smoothstep(0.35, 0.8, patchI) * smoothstep(0.1, 0.5, t));
  iris *= mix(0.88, 1.06, patch2);
  // iridophore flecks (sparkle) and a few dark melanophore spots
  float fl1 = vnoise2(vec2(ang * 38.0 + seed * 11.0, r * 60.0));
  float fl2 = vnoise2(vec2(ang * 90.0 - seed, r * 140.0 + seed));
  iris *= 0.88 + 0.18 * fl1 + 0.22 * smoothstep(0.65, 0.92, fl2);
  vec2 sp = vec2(ang * 26.0, r * 40.0) + seed * 3.0;
  float hs = hash12(floor(sp));
  float crypt = step(hs, 0.09) * smoothstep(0.45, 0.15, length(fract(sp) - 0.5)) * smoothstep(0.15, 0.5, t);
  iris *= 1.0 - 0.5 * crypt;
  iris *= vEyeParams.z;
  // dorsal iris: the skin over the top of the eye carries chromatophores
  // (red / orange in p05_1) and the orbit shades it; the ventral iris stays
  // bright silver
  float dors = smoothstep(-0.2, 0.8, upness) * smoothstep(0.1, 0.55, t);
  iris = mix(iris, outer * outer * 0.6, dors * 0.55 * (1.0 - 0.6 * silver));
  iris *= mix(1.0, 0.8, dors);
  iris *= mix(1.1, 1.0, smoothstep(-0.9, 0.0, upness));
  // the soft shadow of the lens / iris ruff at the pupillary margin
  iris *= mix(0.65, 1.0, smoothstep(0.0, 0.04, t));
  // thin, distinct dark limbal ring at the outer edge of the iris, with the
  // iris darkening a little toward it
  // (the outer iris shades off into the orbit: no bright ring at the edge)
  iris *= mix(1.0, 0.7, smoothstep(0.55, 0.92, t));
  iris = mix(iris, vec3(0.03, 0.028, 0.03), smoothstep(0.92, 0.97, t) * 0.85);
  float pupil = 1.0 - smoothstep(pupilR - 0.012, pupilR + 0.008, r);
  // the spherical lens behind the pupil: very dark with a faint blue-green depth
  vec3 lens = mix(vec3(0.012, 0.018, 0.02), vec3(0.002), smoothstep(0.0, pupilR, r));
  vec3 col = mix(iris, lens, pupil);
  // outer eyeball (hidden in the orbit): the dark outer iris covers the
  // whole front of the ball, so a saccade (up to ~20 deg) slides more dark
  // iris into the opening, never a pale sclera ring
  float sclera = smoothstep(0.93, 0.99, r);
  col = mix(col, outer * vec3(0.16, 0.15, 0.15) + vec3(0.01), sclera);
  col = mix(vec3(0.02), col, front);
  gPupil = pupil * front;
  gPupilR = pupilR;
  gIrisR = r;
  gIris = (1.0 - pupil) * (1.0 - sclera) * front;
  // guanine iris: a soft metallic sheen, rough (fibrous), not a polished coin
  // (reflective silver-gold in the photos: a stronger sheen than the
  // shared default, fading at the dark limbus)
  // (a weaker sheen than before: a strong metallic env reflection read as
  // pale glass at a distance)
  gEyeMetal = min(1.0, uIrisMetal * 1.3) * gIris * (1.0 - smoothstep(0.6, 0.9, t));
  gEyeRough = mix(mix(0.5, 0.4, gIris), 0.2, gPupil);
  return col;
}
`;

export const eyeFragmentNormal = /* glsl */ `
{
  vec3 pe = normalize(vEyeLocal);
  if (pe.z > 0.0) {
    float r = length(pe.xy);
    // lens: sphere of radius 0.55 bulging through the pupil
    vec3 nLens = normalize(vec3(pe.xy, sqrt(max(0.3025 - r * r, 0.02))));
    // iris: nearly flat diaphragm behind the refracting cornea, which bends
    // light from the bright hemisphere above onto it (effective normal tilted
    // toward the fish's dorsal side): it stays lit when the key is overhead
    vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec2 up2 = vec2(dot(upV, vEyeX), dot(upV, vEyeY));
    // (with enough curvature left that the eye reads as a dome, darkening
    // and catching light across its face, not as a flat evenly lit lens)
    vec3 nIris = normalize(vec3(pe.xy * 0.45 + up2 * 0.35, pe.z + 0.5));
    // (the outer band of the visible ball sits under the same flat cornea:
    // shading it as a sphere would draw a dark crescent around the eye)
    // (the lens only bulges in the middle of the pupil: no bright arc of
    // window reflection along the pupillary margin)
    float lensW = gPupil * smoothstep(gPupilR, 0.55 * gPupilR, gIrisR);
    vec3 nL = normalize(mix(mix(pe, nIris, max(1.0 - lensW, smoothstep(${VIS_R} + 0.15, ${VIS_R}, r))), nLens, lensW));
    normal = normalize(vEyeX * nL.x + vEyeY * nL.y + vEyeZ * nL.z);
  }
}
`;

// The fish cornea is much flatter than the eyeball sphere it is drawn on, so
// the sphere's grazing Fresnel near the edge of the visible eye would put a
// bright ring around it (a bead in a socket): fade the rim reflection out.
export const eyeFragmentMaterial = /* glsl */ `
{
  float rr = length(normalize(vEyeLocal).xy);
  float rim = smoothstep(0.4, ${VIS_R}, rr);
  // (immersed: even at grazing angles the eye reflects far less than in air;
  // the corneal reflection is a small, dim window, not a glassy bead)
  // (the ball outside the iris is tucked under the orbital skin: where a
  // sliver of it shows at an oblique view it must not light up as a glassy
  // crescent)
  float hidden = smoothstep(${VIS_R}, ${VIS_R_EDGE} + 0.02, rr);
  // (toward the edge the cornea is seen at grazing angles: a Fresnel rise
  // there put a pale grey crescent around the iris, the "bright limbal
  // ring" -- keep the edge nearly unreflective)
  float edgeR = smoothstep(0.42, ${VIS_R} - 0.05, rr);
  material.specularF90 = mix(0.4, 0.0, edgeR) * (1.0 - hidden);
  material.specularColor *= mix(1.0, 0.6, gPupil) * mix(1.0, 0.08, edgeR) * (1.0 - hidden);
  material.specularColorBlended *= mix(1.0, 0.6, gPupil) * mix(1.0, 0.08, edgeR) * (1.0 - hidden);
  #ifdef USE_CLEARCOAT
    // (the corneal reflection is kept toward the edge of the iris, so the
    // eye shows its curvature as a dome)
    // (and gone at the edge itself, where its grazing Fresnel rises to a
    // full mirror)
    material.clearcoat *= 0.6 * (1.0 - 0.5 * rim) * (1.0 - smoothstep(0.5, ${VIS_R}, rr)) * (1.0 - hidden);
  #endif
}
`;
