// Eye shader: unit eyeball with +Z optical axis. Round fixed pupil (teleost,
// about half the visible eye), spherical lens bulging through it, guanine
// iris (pale silver-gold, pigment-clouded above) with flecks and crypts, thin
// dark limbus ring. Layers:
//   * cornea  — the clearcoat on the geometric (eyeball) sphere: a faint,
//               crisp window highlight
//   * lens    — high-index sphere seen through the pupil: base specular with
//               a strongly curved normal, so its highlight is small and sharp
//   * iris    — a nearly flat diaphragm behind the cornea: diffuse shading
//               with a flattened normal (evenly lit ring, not a shaded ball)

import { head } from '../morphology.js';

// The eye sits nearly flush in its orbit: only a low cap of the ball shows
// (see morphology.js). Edge of that cap as sin(angle from the optical axis);
// the rim of orbital skin laps a little over it.
const VIS_R = (0.97 * Math.sqrt(1 - (1 - head.eyeProtrusion) ** 2)).toFixed(4);

export const eyeVertexPars = /* glsl */ `
in vec4 aEyeParams; // x: iris hue mix, y: pupil size, z: iris brightness, w: seed
out vec3 vEyeLocal;
out vec3 vEyeWorld;
flat out vec4 vEyeParams;
flat out vec3 vEyeX;
flat out vec3 vEyeY;
flat out vec3 vEyeZ;
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
`;

export const eyeFragmentPars = /* glsl */ `
in vec3 vEyeLocal;
in vec3 vEyeWorld;
flat in vec4 vEyeParams;
flat in vec3 vEyeX;
flat in vec3 vEyeY;
flat in vec3 vEyeZ;
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

vec3 eyeColor() {
  vec3 p = normalize(vEyeLocal);
  float r = length(p.xy);           // sin(angle from optical axis)
  float front = step(0.0, p.z);
  float ang = atan(p.y, p.x);
  float seed = vEyeParams.w;
  float silver = clamp(vEyeParams.x - 1.0, 0.0, 1.0);
  // dorsal direction of the fish in the eye frame (the iris is more
  // pigmented and shaded by the orbit above, brighter below)
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec2 up2 = vec2(dot(upV, vEyeX), dot(upV, vEyeY));
  float upness = dot(p.xy, up2) / max(r * length(up2), 1e-4);
  // pupil: round, about half the visible eye; its margin is not a perfect
  // circle (the iris edge is slightly irregular)
  float pupilR = uPupil * vEyeParams.y * (1.0 + 0.03 * (vnoise2(vec2(ang * 2.5 + seed * 5.0, seed)) - 0.5));
  float irisR = ${VIS_R}; // edge of the visible eye (the skin meets the ball here)
  float t = smoothstep(pupilR, irisR, r); // 0 pupil margin .. 1 limbus
  // iris: a broad, pale guanine diaphragm (p05_1, p12_0, p11_1, p25_0):
  // silvery cream to pale gold, densely flecked with reflective
  // iridophores, a warm gold collar at the pupillary margin, chromatophore
  // pigment (the body colour) clouding its upper part, and a thin dark
  // limbus where it meets the orbital skin
  vec3 outer = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  outer = mix(outer, uIrisSilver, silver);
  float patchI = vnoise2(vec2(ang * 2.2 + seed * 7.0, r * 3.0 + seed));
  float patch2 = vnoise2(vec2(ang * 7.0 + seed * 3.0, r * 9.0 - seed));
  // the guanine base: pale silver-cream with a gold cast (a silver fish
  // keeps it nearly neutral)
  vec3 guanine = mix(vec3(0.62, 0.55, 0.41), uIrisSilver * 0.95, silver);
  guanine = mix(guanine, outer * 0.9 + 0.08, 0.22 * (1.0 - silver));
  vec3 iris = guanine;
  // a warm gold collar just outside the pupil
  vec3 collar = mix(uIrisGold * 1.05, uIrisSilver * 0.9, silver);
  iris = mix(iris, collar, smoothstep(0.3, 0.0, t) * 0.8);
  // irregular sectors of pigment over the guanine (never painted rings)
  iris = mix(iris, outer * 0.55, 0.32 * smoothstep(0.35, 0.8, patchI) * smoothstep(0.1, 0.5, t));
  iris *= mix(0.86, 1.08, patch2);
  // iridophore flecks at two scales (sparkle, averages to a light tone at
  // a distance) and a few dark melanophore spots
  float fl1 = vnoise2(vec2(ang * 38.0 + seed * 11.0, r * 60.0));
  float fl2 = vnoise2(vec2(ang * 90.0 - seed, r * 140.0 + seed));
  iris *= 0.84 + 0.26 * fl1 + 0.22 * smoothstep(0.6, 0.9, fl2);
  vec2 sp = vec2(ang * 26.0, r * 40.0) + seed * 3.0;
  float hs = hash12(floor(sp));
  float crypt = step(hs, 0.07) * smoothstep(0.45, 0.15, length(fract(sp) - 0.5)) * smoothstep(0.15, 0.5, t);
  iris *= 1.0 - 0.45 * crypt;
  iris *= vEyeParams.z;
  // dorsal iris: the skin over the top of the eye carries chromatophores
  // (red / orange in p05_1), the ventral iris stays bright silver
  float dors = smoothstep(-0.2, 0.8, upness) * smoothstep(0.1, 0.55, t);
  iris = mix(iris, outer * outer * 0.75, dors * 0.8 * (1.0 - 0.6 * silver));
  iris *= mix(1.0, 0.85, dors);
  iris *= mix(1.08, 1.0, smoothstep(-0.9, 0.0, upness));
  // the soft shadow of the lens / iris ruff at the pupillary margin
  iris *= mix(0.72, 1.0, smoothstep(0.0, 0.035, t));
  // thin dark limbus where the orbital rim laps over the edge of the eye
  iris *= mix(1.0, 0.3, smoothstep(0.8, 0.97, t));
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
  gIris = (1.0 - pupil) * (1.0 - sclera) * front;
  // guanine iris: a soft metallic sheen, rough (fibrous), not a polished coin
  // (reflective silver-gold in the photos: a stronger sheen than the
  // shared default, fading at the dark limbus)
  gEyeMetal = min(1.0, uIrisMetal * 2.2) * gIris * (1.0 - smoothstep(0.75, 0.95, t));
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
    vec3 nIris = normalize(vec3(pe.xy * 0.12 + up2 * 0.45, pe.z + 0.8));
    // (the outer band of the visible ball sits under the same flat cornea:
    // shading it as a sphere would draw a dark crescent around the eye)
    // (the lens only bulges in the middle of the pupil: no bright arc of
    // window reflection along the pupillary margin)
    float lensW = gPupil * smoothstep(gPupilR, 0.55 * gPupilR, r);
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
  material.specularF90 = mix(0.4, 0.15, rim);
  material.specularColor *= mix(1.0, 0.6, gPupil);
  material.specularColorBlended *= mix(1.0, 0.6, gPupil);
  #ifdef USE_CLEARCOAT
    material.clearcoat *= 0.6 * (1.0 - 0.85 * rim);
  #endif
}
`;
