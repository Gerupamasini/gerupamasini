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
  float irisR = 0.82; // edge of the visible eye (the skin meets the ball here)
  float t = smoothstep(pupilR, irisR, r); // 0 pupil margin .. 1 limbus
  // iris: a guanine disc of fine metallic flecks — pale gold / silver,
  // brightest in a broad zone around the pupil and darker toward the rim,
  // with irregular paler and darker sectors (never concentric painted bands)
  vec3 outer = mix(uIrisGold, uIrisRed, clamp(vEyeParams.x, 0.0, 1.0));
  outer = mix(outer, uIrisSilver, silver);
  vec3 inner = mix(vec3(0.44, 0.31, 0.15), uIrisSilver * 0.8, silver);
  float patchI = vnoise2(vec2(ang * 2.2 + seed * 7.0, r * 3.0 + seed));
  float patch2 = vnoise2(vec2(ang * 7.0 + seed * 3.0, r * 9.0 - seed));
  vec3 iris = mix(inner, outer, smoothstep(0.0, 0.6, t + 0.35 * (patchI - 0.5)));
  iris *= mix(0.5, 1.15, patchI) * mix(0.78, 1.14, patch2);
  // iridophore flecks at two scales (sparkle, averages to a light tone at
  // a distance) and a few dark melanophore spots
  float fl1 = vnoise2(vec2(ang * 38.0 + seed * 11.0, r * 60.0));
  float fl2 = vnoise2(vec2(ang * 90.0 - seed, r * 140.0 + seed));
  iris *= 0.82 + 0.3 * fl1 + 0.16 * smoothstep(0.6, 0.9, fl2);
  vec2 sp = vec2(ang * 26.0, r * 40.0) + seed * 3.0;
  float hs = hash12(floor(sp));
  float crypt = step(hs, 0.06) * smoothstep(0.45, 0.15, length(fract(sp) - 0.5)) * smoothstep(0.2, 0.5, t);
  iris *= 1.0 - 0.4 * crypt;
  // (photographed goldfish irises are mid-toned: a dark-gold, orange-red or
  // grey ring around a large black pupil, not a bright cream disc)
  iris *= vEyeParams.z * 0.72;
  // dorsal iris darker and more pigmented (the skin over the top of the eye
  // carries chromatophores), ventral iris catches more light
  float dors = smoothstep(0.0, 0.9, upness) * smoothstep(0.15, 0.7, t);
  iris = mix(iris, outer * outer * 0.8, dors * 0.45);
  iris *= mix(1.0, 0.72, dors);
  // a thin bright guanine ring right at the pupillary margin (p05_1, p12_0),
  // then the soft shadow of the lens / iris ruff
  iris *= 1.0 + 0.45 * smoothstep(0.0, 0.035, t) * smoothstep(0.16, 0.06, t);
  iris *= mix(0.75, 1.0, smoothstep(0.0, 0.03, t));
  // limbus: melanin at the outer edge of the visible eye, an uneven soft rim
  // that fades into the skin (no hard dark ring framing a bead)
  float limb = smoothstep(0.68, 1.0, t + 0.1 * (patchI - 0.5));
  iris = mix(iris, iris * vec3(0.5, 0.47, 0.45), limb);
  float pupil = 1.0 - smoothstep(pupilR - 0.012, pupilR + 0.008, r);
  // the spherical lens behind the pupil: very dark with a faint blue-green depth
  vec3 lens = mix(vec3(0.012, 0.018, 0.02), vec3(0.002), smoothstep(0.0, pupilR, r));
  vec3 col = mix(iris, lens, pupil);
  // outer eyeball (mostly hidden in the orbit): the iris guanine continues
  // as a dull, darker silvery band, never a black crescent
  float sclera = smoothstep(irisR + 0.02, irisR + 0.07, r);
  col = mix(col, outer * vec3(0.32, 0.31, 0.3) + vec3(0.02), sclera);
  col = mix(vec3(0.02), col, front);
  gPupil = pupil * front;
  gIris = (1.0 - pupil) * (1.0 - sclera) * front;
  // guanine iris: a soft metallic sheen, rough (fibrous), not a polished coin
  gEyeMetal = uIrisMetal * gIris;
  gEyeRough = mix(mix(0.5, 0.45, gIris), 0.11, gPupil);
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
    vec3 nIris = normalize(vec3(pe.xy * 0.3 + up2 * 0.55, pe.z + 0.6));
    // (the outer band of the visible ball sits under the same flat cornea:
    // shading it as a sphere would draw a dark crescent around the eye)
    vec3 nL = normalize(mix(mix(pe, nIris, max(gIris, smoothstep(0.98, 0.9, r))), nLens, gPupil));
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
  float rim = smoothstep(0.5, 0.8, rr);
  // (immersed: even at grazing angles the eye reflects far less than in air)
  material.specularF90 = mix(0.55, 0.2, rim);
  #ifdef USE_CLEARCOAT
    material.clearcoat *= 1.0 - 0.85 * rim;
  #endif
}
`;
