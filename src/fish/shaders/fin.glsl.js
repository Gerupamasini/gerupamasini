// Fin shader injections: membrane reconstructed from simulated ray chains,
// branched + segmented lepidotrichia, pigment concentrated at the fin base and
// along rays, translucent membrane with diffuse transmission / forward
// scattering (backlit glow), serrated margin where ray tips project beyond
// the membrane.

export const finVertexPars = /* glsl */ `
in vec4 aFinIdx;
in vec4 aFinCoord;
in vec4 aFinRay;
out vec4 vFinCoord;
VOUT vec4 vFinRay;
VOUT vec3 vFishWorld;
VFLAT float vFinType;
VFLAT vec4 vFishA;
VFLAT vec4 vFishB;
VFLAT vec4 vFishC;

vec3 gFishPos;
vec3 gFishNormal;

void finDeform() {
  vFishRow = aFishRow;
  int base = int(aFinIdx.x + 0.5);
  int nC = int(aFinIdx.y + 0.5);
  int nN = int(aFinIdx.z + 0.5);
  float c = aFinCoord.x;
  float t = aFinCoord.y;
  float layer = aFinCoord.z;
  vec3 P = finPoint(base, nC, nN, c, t);
  vec3 N = finNormal(base, nC, nN, c, t);
  float SL = rigMisc(0).w;
  gFishPos = P + N * (layer * aFinCoord.w * 0.5 * SL);
  gFishNormal = N * layer;
  vFinCoord = aFinCoord;
  vFinRay = aFinRay;
  vFinType = aFinIdx.w;
  vFishWorld = gFishPos;
  vFishA = rigMisc(1);
  vFishB = rigMisc(2);
  vFishC = rigMisc(3);
}
`;

export const finFragmentPars = /* glsl */ `
in vec4 vFinCoord;
in vec4 vFinRay;
in vec3 vFishWorld;
flat in float vFinType;
float gPleat;   // signed pleat slope across the rays
flat in vec4 vFishA;
flat in vec4 vFishB;
flat in vec4 vFishC;

uniform vec3 uColRed;
uniform vec3 uColOrange;
uniform vec3 uColYellow;
uniform vec3 uColWhite;
uniform float uFinOpacity;
uniform float uFinTransmission;
uniform float uFinRoughness;
uniform float uDebugView;

float gFinAlpha;
vec3 gFinAlbedo;
vec3 gFinTrans;
float gFinRay;
float gFinRough;

// distance (in ray-spacing units) to the nearest (possibly branched) ray
float rayDistance(float rc, float t, float type, float nRays) {
  float k = floor(rc + 0.5);
  float x = rc - k;
  // outermost rays & the first unbranched rays of dorsal/anal are simple
  bool simple = (k < 0.5) || (k > nRays - 1.5) || (type > 0.5 && type < 2.5 && k < 2.5);
  float tb1 = type < 0.5 ? mix(0.3, 0.52, abs(k / (nRays - 1.0) - 0.5) * 2.0) : 0.42;
  float d = abs(x);
  if (!simple && t > tb1) {
    float sp = 0.2 * smoothstep(tb1, tb1 + 0.3, t);
    d = min(abs(x - sp), abs(x + sp));
    float tb2 = tb1 + 0.3;
    if (t > tb2) {
      float sp2 = 0.085 * smoothstep(tb2, tb2 + 0.2, t);
      d = min(min(abs(x - sp - sp2), abs(x - sp + sp2)), min(abs(x + sp - sp2), abs(x + sp + sp2)));
    }
  }
  return d;
}

void computeFinSurface() {
  float t = vFinCoord.y;
  float rc = vFinRay.x;
  float nRays = vFinRay.y;
  float rN = vFinRay.z;
  float lead = vFinRay.w;
  float type = vFinType;
  float seed = vFishA.w;

  float fwr = max(fwidth(rc), 1e-4);
  float rd = rayDistance(rc, t, type, nRays);
  float w = mix(0.08, 0.028, t) + lead * 0.09;
  float ray = 1.0 - smoothstep(w - fwr * 0.7, w + fwr * 0.7, rd);
  // fade the ray pattern to its average when rays get sub-pixel
  float rayAA = smoothstep(1.4, 0.5, fwr);
  ray = mix(w * 1.4, ray, rayAA);
  // pleated membrane: rays are ridges, membrane sags between them
  float xr = rc - floor(rc + 0.5);
  gPleat = (sin(xr * 6.2831853) * 0.14 + (-2.0 * xr / (w * w)) * exp(-xr * xr / (w * w)) * w * 0.25) * rayAA * (1.0 - t * 0.5);
  // segmentation joints of the lepidotrichia (shorter segments distally)
  float segF = (type < 0.5 ? 34.0 : 22.0);
  float seg = fract(spow(max(t, 0.0), 0.8) * segF + rc * 0.37);
  float joint = smoothstep(0.08, 0.0, abs(seg - 0.5) - 0.42) * ray * rayAA * smoothstep(0.1, 0.25, t);

  // ---- pigment: red at the base and along the rays, clearer distally
  float ctype = vFishA.z;
  float ext = type < 0.5 ? vFishB.z : (type < 1.5 ? vFishB.w : vFishC.w);
  float nz = vnoise2(vec2(rN * 7.0 + seed * 3.1, t * 5.0 + seed)) - 0.5;
  float redM = smoothstep(ext + 0.1, ext - 0.12, t + nz * 0.25 - ray * 0.08);
  vec3 redCol = mix(uColRed, uColOrange, clamp(0.25 + vFishB.y, 0.0, 1.0) * 0.55);
  vec3 pig = redCol;
  if (ctype > 1.5 && ctype < 2.5) pig = mix(uColOrange, uColYellow, 0.3);
  if (ctype > 2.5 && ctype < 3.5) pig = uColYellow;
  vec3 membraneWhite = vec3(0.86, 0.89, 0.93);
  vec3 col = mix(membraneWhite, pig, redM);
  // rays carry more chromatophores + iridophores: denser pigment / whiter
  col = mix(col, mix(vec3(0.97, 0.98, 1.0), pig * 1.05, redM), ray * 0.5);
  col *= 1.0 - joint * 0.35;

  // ---- opacity (per shell layer; the fin is two layers thick): clear,
  // milky membrane with streaky density along the rays, denser rays, fleshy
  // opaque base, and a distal zone that clears toward the margin
  float aMem = mix(0.15, 0.46, redM);
  float aRay = mix(0.24, 0.72, redM);
  float alpha = mix(aMem, aRay, ray);
  float milk = vnoise2(vec2(rc * 1.7 + seed * 5.0, t * 3.0 - seed)) * 0.65 + vnoise2(vec2(rc * 0.45, t * 9.0 + seed * 2.0)) * 0.35;
  alpha *= mix(1.0, 0.7 + 0.6 * milk, 1.0 - ray);
  alpha = mix(alpha, 0.95, smoothstep(0.12, 0.0, t)); // fleshy base
  alpha *= 1.0 - 0.4 * smoothstep(0.35, 1.0, t) * (1.0 - ray) * (1.0 - 0.5 * redM);
  // fine serration: membrane recedes slightly between the ray tips; fraying
  float fray = vnoise2(vec2(rc * 3.0 + seed * 7.0, seed)) * 0.006;
  float cut = 1.0 - (0.005 + fray) * (1.0 - ray);
  alpha *= 1.0 - smoothstep(cut - 0.012, cut, t);
  // rays fade into the membrane toward the margin (thin distal segments)
  ray *= 1.0 - 0.55 * smoothstep(0.55, 1.0, t);
  alpha *= uFinOpacity;

  gFinAlpha = clamp(alpha, 0.0, 1.0);
  gFinAlbedo = col;
  gFinTrans = mix(vec3(0.95, 0.97, 1.0), pig * vec3(1.1, 0.9, 0.8), redM) * col;
  gFinRay = ray;
  gFinRough = uFinRoughness * mix(1.0, 0.8, ray);
}
`;

export const finFragmentColor = /* glsl */ `
computeFinSurface();
diffuseColor.rgb = gFinAlbedo;
diffuseColor.a = gFinAlpha;
`;

export const finFragmentNormal = /* glsl */ `
#if FISH_LOD < 2
{
  // tangent across the rays from screen-space derivatives of the ray coordinate
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float drx = dFdx(vFinRay.x);
  float dry = dFdy(vFinRay.x);
  vec3 Tc = dpx * dry - dpy * drx;
  Tc = normalize(cross(normal, cross(Tc, normal)) + 1e-6);
  if (dot(cross(dpx, dpy), normal) < 0.0) Tc = -Tc;
  normal = normalize(normal + Tc * gPleat);
}
#endif
`;

export const finFragmentMaterial = /* glsl */ `
material.specularColor = vec3(mix(0.03, 0.05, gFinRay));
material.specularColorBlended = material.specularColor;
material.specularF90 = 1.0;
material.diffuseContribution = gFinAlbedo;
`;

export const finFragmentLightsEnd = /* glsl */ `
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 caus = causticsRGB(vFishWorld, nW);
  reflectedLight.directDiffuse *= caus;
  reflectedLight.directSpecular *= caus;
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 V = normalize(vViewPosition);
    vec3 lc = directionalLights[0].color;
    // diffuse transmission through the thin membrane (light on the far side)
    float backLit = saturate(-dot(normal, L));
    // forward scattering peak when looking toward the light through the fin
    float fwd = spow(saturate(dot(V, -L)), 6.0);
    float wrapF = saturate((dot(normal, L) + 0.6) / 1.6) - saturate(dot(normal, L));
    // in-membrane scattering: light entering the thin collagen sheet at any
    // angle is diffused inside it and re-emitted from both faces (milky glow
    // even when the key light grazes the fin plane)
    float inScat = 0.28 * (1.0 - abs(dot(normal, L))) + 0.1;
    reflectedLight.directDiffuse += lc * gFinTrans * uFinTransmission * (backLit * 0.8 + fwd * 1.4 + wrapF * 0.5 + inScat) * RECIPROCAL_PI * 2.2 * caus;
  #endif
  // hemispherical transmitted ambient from behind the membrane
  reflectedLight.indirectDiffuse *= 1.0 + 0.6 * uFinTransmission;
}
`;

export const finFragmentOutput = /* glsl */ `
{
  float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
  // grazing views see more membrane / specular sheen
  diffuseColor.a = clamp(diffuseColor.a + spow(clamp(1.0 - nv, 0.0, 1.0), 3.0) * 0.22 * uFinOpacity, 0.0, 1.0);
  float a = max(diffuseColor.a, 0.02);
  outgoingLight = totalDiffuse + totalSpecular / a;
  outgoingLight = waterAttenuate(outgoingLight, vFishWorld);
  if (uDebugView > 0.5) {
    outgoingLight = uDebugView < 1.5 ? normalize(nW_dbg(normal)) * 0.5 + 0.5 : vec3(gFinRay, t_dbg(), 0.0);
    diffuseColor.a = 1.0;
  }
}
`;

export const finDebugHelpers = /* glsl */ `
vec3 nW_dbg(vec3 n) { return inverseTransformDirection(n, viewMatrix); }
float t_dbg() { return vFinCoord.y; }
`;
