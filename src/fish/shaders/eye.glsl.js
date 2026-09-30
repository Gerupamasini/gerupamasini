// Eye shader: unit eyeball with +Z optical axis. Round fixed pupil (teleost),
// spherical lens bulging through it, guanine iris (gold/orange/silver) with
// radial fibres, dark limbus ring and bright pupillary margin; glossy cornea.

export const eyeVertexPars = /* glsl */ `
in vec4 aEyeParams; // x: iris hue mix, y: pupil size, z: iris brightness, w: seed
out vec3 vEyeLocal;
out vec3 vEyeWorld;
flat out vec4 vEyeParams;
`;

export const eyeVertexMain = /* glsl */ `
vEyeLocal = position;
vEyeParams = aEyeParams;
vEyeWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
`;

export const eyeFragmentPars = /* glsl */ `
in vec3 vEyeLocal;
in vec3 vEyeWorld;
flat in vec4 vEyeParams;
uniform vec3 uIrisGold;
uniform vec3 uIrisRed;
uniform vec3 uIrisSilver;
uniform float uPupil;
uniform float uIrisMetal;
float gEyeMetal;
float gEyeRough;
float gPupil;

vec3 eyeColor() {
  vec3 p = normalize(vEyeLocal);
  float r = length(p.xy);           // sin(angle from optical axis)
  float front = step(0.0, p.z);
  float ang = atan(p.y, p.x);
  float pupilR = uPupil * vEyeParams.y;
  float irisR = 0.84;
  float seed = vEyeParams.w;
  // iris: bright golden collarette near the pupil grading to the individual
  // outer colour (gold / red-orange / silver), guanine speckles, radial fibres
  vec3 outer = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  outer = mix(outer, uIrisSilver, clamp(vEyeParams.x - 1.0, 0.0, 1.0));
  float t = smoothstep(pupilR, irisR, r);
  vec3 inner = mix(vec3(0.95, 0.72, 0.25), uIrisSilver * 1.1, clamp(vEyeParams.x - 1.0, 0.0, 1.0));
  vec3 iris = mix(inner, outer, smoothstep(0.08, 0.55, t));
  float fib = vnoise2(vec2(ang * 11.0 + seed * 10.0, r * 16.0)) * 0.55 + vnoise2(vec2(ang * 29.0, r * 40.0 + seed)) * 0.45;
  iris *= 0.72 + 0.56 * fib;
  vec2 sp = vec2(ang * 38.0, r * 60.0) + seed * 3.0;
  float speck = step(0.86, hash12(floor(sp))) * smoothstep(0.5, 0.1, length(fract(sp) - 0.5));
  iris = mix(iris, iris * 1.6 + vec3(0.08, 0.06, 0.0), speck * 0.6);
  iris *= vEyeParams.z;
  iris = mix(iris * 1.25 + vec3(0.1, 0.08, 0.02), iris, smoothstep(0.0, 0.12, t)); // pupillary margin
  iris = mix(iris, iris * 0.15, smoothstep(0.78, 1.0, t));                         // dark limbus
  float pupil = 1.0 - smoothstep(pupilR - 0.012, pupilR + 0.008, r);
  // the spherical lens behind the pupil: very dark with a faint blue-green depth
  vec3 lens = mix(vec3(0.012, 0.02, 0.022), vec3(0.002), smoothstep(0.0, pupilR, r));
  vec3 col = mix(iris, lens, pupil);
  // outer eyeball (mostly hidden in the orbit) : dark
  col = mix(col, vec3(0.06, 0.045, 0.04), smoothstep(irisR, irisR + 0.05, r));
  col = mix(vec3(0.03), col, front);
  gPupil = pupil;
  gEyeMetal = uIrisMetal * (1.0 - pupil) * (1.0 - smoothstep(irisR, irisR + 0.05, r));
  gEyeRough = mix(0.32, 0.06, pupil);
  return col;
}
`;
