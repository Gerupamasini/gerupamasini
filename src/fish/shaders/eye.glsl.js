// Eye shader: unit eyeball with +Z optical axis. Round fixed pupil (teleost,
// about half the visible eye), spherical lens bulging through it, guanine
// iris (gold / orange / silver) with fine radial fibres and pigment crypts,
// dark limbus ring. Layers:
//   * cornea  — the clearcoat on the geometric (eyeball) sphere: a faint,
//               crisp window highlight
//   * lens    — high-index sphere seen through the pupil: base specular with
//               a strongly curved normal, so its highlight is small and sharp
//   * iris    — a nearly flat diaphragm behind the cornea: diffuse shading
//               with a flattened normal (evenly lit ring, not a shaded ball)

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
float gIris;

vec3 eyeColor() {
  vec3 p = normalize(vEyeLocal);
  float r = length(p.xy);           // sin(angle from optical axis)
  float front = step(0.0, p.z);
  float ang = atan(p.y, p.x);
  float pupilR = uPupil * vEyeParams.y;
  float irisR = 0.88;
  float seed = vEyeParams.w;
  float t = smoothstep(pupilR, irisR, r); // 0 pupil margin .. 1 limbus
  // iris: bright collarette near the pupil grading to the individual outer
  // colour (gold / red-orange / silver)
  vec3 outer = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  outer = mix(outer, uIrisSilver, clamp(vEyeParams.x - 1.0, 0.0, 1.0));
  // a pale, pearly gold collarette (dense guanine) around the pupil
  vec3 inner = mix(vec3(0.86, 0.74, 0.46), uIrisSilver * 1.08, clamp(vEyeParams.x - 1.0, 0.0, 1.0));
  vec3 iris = mix(inner, outer, smoothstep(0.06, 0.5, t));
  // patchy guanine coverage: some sectors paler, some more pigmented
  float patchI = vnoise2(vec2(ang * 3.0 + seed * 7.0, r * 4.0 + seed));
  iris = mix(iris, iris * vec3(0.72, 0.66, 0.6), smoothstep(0.45, 0.85, patchI) * 0.6);
  // fine radial fibres (stroma) at two scales, softly varying in radius
  float fib = vnoise2(vec2(ang * 24.0 + seed * 10.0, r * 9.0)) * 0.5 + vnoise2(vec2(ang * 61.0 + seed, r * 22.0 + seed)) * 0.5;
  iris *= 0.72 + 0.56 * fib;
  // guanine flecks and dark pigment crypts
  vec2 sp = vec2(ang * 34.0, r * 55.0) + seed * 3.0;
  float cellR = length(fract(sp) - 0.5);
  float hs = hash12(floor(sp));
  float fleck = step(0.88, hs) * smoothstep(0.45, 0.1, cellR);
  float crypt = step(hs, 0.07) * smoothstep(0.42, 0.12, cellR) * smoothstep(0.15, 0.4, t);
  iris = mix(iris, iris * 1.35 + vec3(0.05, 0.045, 0.03), fleck * 0.5);
  iris *= 1.0 - 0.45 * crypt;
  iris *= vEyeParams.z;
  // pupillary margin: a thin bright ruff, then a soft shadow cast by the lens
  iris = mix(iris * 1.2 + vec3(0.06, 0.05, 0.02), iris, smoothstep(0.0, 0.07, t));
  // dark limbus: melanin-rich outer rim of the iris fading into the sclera
  iris = mix(iris, iris * vec3(0.3, 0.28, 0.27), smoothstep(0.6, 1.0, t));
  float pupil = 1.0 - smoothstep(pupilR - 0.01, pupilR + 0.006, r);
  // the spherical lens behind the pupil: very dark with a faint blue-green depth
  vec3 lens = mix(vec3(0.01, 0.016, 0.018), vec3(0.0015), smoothstep(0.0, pupilR, r));
  vec3 col = mix(iris, lens, pupil);
  // outer eyeball (mostly hidden in the orbit): the iris guanine continues
  // as a dull, darker silvery band, never a black crescent
  float sclera = smoothstep(irisR, irisR + 0.05, r);
  col = mix(col, outer * vec3(0.22, 0.22, 0.23) + vec3(0.02), sclera);
  col = mix(vec3(0.02), col, front);
  gPupil = pupil * front;
  gIris = (1.0 - pupil) * (1.0 - sclera) * front;
  // guanine iris: a soft metallic sheen, rough (fibrous), not a polished coin
  gEyeMetal = uIrisMetal * gIris;
  gEyeRough = mix(mix(0.5, 0.42, gIris), 0.11, gPupil);
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
    // iris: nearly flat diaphragm
    vec3 nIris = normalize(vec3(pe.xy * 0.3, pe.z + 0.6));
    vec3 nL = normalize(mix(mix(pe, nIris, gIris), nLens, gPupil));
    normal = normalize(vEyeX * nL.x + vEyeY * nL.y + vEyeZ * nL.z);
  }
}
`;
