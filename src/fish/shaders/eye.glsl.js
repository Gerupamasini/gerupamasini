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
  // iris base: blend of gold / red-orange / silver
  vec3 iris = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  iris = mix(iris, uIrisSilver, clamp(vEyeParams.x - 1.0, 0.0, 1.0));
  // radial fibres + collarette
  float fib = vnoise2(vec2(ang * 9.0 + seed * 10.0, r * 14.0)) * 0.5 + vnoise2(vec2(ang * 23.0, r * 30.0 + seed)) * 0.5;
  iris *= 0.75 + 0.5 * fib;
  iris *= vEyeParams.z;
  float t = smoothstep(pupilR, irisR, r);
  iris = mix(iris * 1.35 + vec3(0.12, 0.1, 0.02), iris, smoothstep(0.0, 0.18, t)); // bright pupillary margin
  iris = mix(iris, iris * 0.18, smoothstep(0.72, 1.0, t));                        // dark limbus
  iris *= 1.0 - 0.25 * smoothstep(0.5, 0.2, abs(p.y + 0.35)) * step(0.0, -p.y) * 0.0;
  float pupil = 1.0 - smoothstep(pupilR - 0.012, pupilR + 0.008, r);
  vec3 col = mix(iris, vec3(0.004), pupil);
  // outer eyeball (mostly hidden in the orbit) : dark
  col = mix(col, vec3(0.06, 0.045, 0.04), smoothstep(irisR, irisR + 0.05, r));
  col = mix(vec3(0.03), col, front);
  gPupil = pupil;
  gEyeMetal = uIrisMetal * (1.0 - pupil) * (1.0 - smoothstep(irisR, irisR + 0.05, r));
  gEyeRough = mix(0.32, 0.06, pupil);
  return col;
}
`;
