// Fin shader injections: membrane reconstructed from simulated ray chains,
// branched + segmented lepidotrichia, pigment concentrated at the fin base and
// along rays, translucent membrane with diffuse transmission / forward
// scattering (backlit glow), serrated margin where ray tips project beyond
// the membrane.

export const finVertexPars = /* glsl */ `
in vec4 aFinIdx;
in vec4 aFinCoord;
in vec4 aFinRay;
in float aFinLen;
out vec4 vFinCoord;
VOUT vec4 vFinRay;
VOUT vec3 vFishWorld;
VFLAT float vFinType;
VFLAT vec4 vFishA;
VFLAT vec4 vFishB;
VFLAT vec4 vFishC;

vec3 gFishPos;
vec3 gFishNormal;

float finHash(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

void finDeform() {
  vFishRow = aFishRow;
  int base = int(aFinIdx.x + 0.5);
  int nC = int(aFinIdx.y + 0.5);
  int nN = int(aFinIdx.z + 0.5);
  float c = aFinCoord.x;
  float t = aFinCoord.y;
  float layer = aFinCoord.z;
  // true ray length along this column, with individual irregularity: every
  // ray a few per cent longer or shorter, plus a slow ripple of the margin
  // (worn / regrown ray tips)
  float seed = rigMisc(1).w;
  float rc = aFinRay.x;
  float k0 = floor(rc);
  float fr = rc - k0;
  float jit = mix(finHash(k0 * 1.37 + seed * 7.1), finHash((k0 + 1.0) * 1.37 + seed * 7.1), fr * fr * (3.0 - 2.0 * fr)) - 0.5;
  float ripple = 0.6 * sin(rc * 1.45 + seed * 3.7) + 0.4 * sin(rc * 0.61 + seed * 1.3);
  float irr = aFinIdx.w < 0.5 ? 1.0 : 0.6;
  float ts = t * aFinLen * (1.0 + irr * (0.035 * jit + 0.018 * ripple) * smoothstep(0.0, 0.6, t));
  vec3 P = finPoint(base, nC, nN, c, ts);
  vec3 N = finNormal(base, nC, nN, c, ts);
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

// depth (in t) by which the membrane between ray "cell" and the next is
// split back from the margin: most spaces intact, a few torn a little
float finSplit(float cell, float seed, float type) {
  float h = hash12(vec2(cell * 1.31 + 0.5, seed * 3.7 + type * 11.0));
  float deep = smoothstep(0.86, 0.99, h);
  return deep * (type < 0.5 ? 0.07 : 0.04) + 0.008 * h;
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
  gPleat = (sin(xr * 6.2831853) * 0.08 + (-2.0 * xr / (w * w)) * exp(-xr * xr / (w * w)) * w * 0.2) * rayAA * (1.0 - t * 0.5);
  // segmentation joints of the lepidotrichia (shorter segments distally)
  float segF = (type < 0.5 ? 34.0 : 22.0);
  float seg = fract(spow(max(t, 0.0), 0.8) * segF + rc * 0.37);
  float joint = smoothstep(0.08, 0.0, abs(seg - 0.5) - 0.42) * ray * rayAA * smoothstep(0.1, 0.25, t);

  // ---- pigment: red at the base and along the rays, clearer distally
  float ctype = vFishA.z;
  float ext = type < 0.5 ? vFishB.z : (type < 1.5 ? vFishB.w : vFishC.w);
  // the pigment front is streaky: it runs further out along some rays
  float nz = vnoise2(vec2(rN * 7.0 + seed * 3.1, t * 5.0 + seed)) - 0.5;
  float nzr = vnoise2(vec2(rc * 1.9 + seed * 2.3, seed * 0.7)) - 0.5;
  float redM = smoothstep(ext + 0.12, ext - 0.14, t + nz * 0.22 + nzr * 0.16 - ray * 0.1);
  vec3 redCol = mix(uColRed, uColOrange, clamp(0.25 + vFishB.y, 0.0, 1.0) * 0.6);
  vec3 pig = redCol;
  if (ctype > 1.5 && ctype < 2.5) pig = mix(uColOrange, uColYellow, 0.3);
  if (ctype > 2.5 && ctype < 3.5) pig = uColYellow;
  // distal red thins out to a translucent orange wash before it clears
  pig = mix(pig, mix(pig, uColOrange, 0.35), smoothstep(0.0, 1.0, t) * (1.0 - redM));
  // white membrane: a thin turbid collagen sheet — bluish-white where it
  // scatters light back toward the viewer, warmer in transmission
  vec3 membraneWhite = vec3(0.8, 0.86, 0.93);
  vec3 col = mix(membraneWhite, pig, redM);
  // rays carry more chromatophores + iridophores: denser pigment / whiter
  col = mix(col, mix(vec3(0.93, 0.95, 0.98), pig * 1.04, redM), ray * 0.3);
  col *= 1.0 - joint * 0.3;

  // ---- opacity (only the shell layer facing the camera is drawn): milky
  // membrane with streaks along the rays, denser rays, fleshy base, and a
  // distal zone that thins and clears toward the margin
  float distal = smoothstep(0.3, 0.95, t);
  float aMem = mix(0.55, 0.64, redM) * mix(1.0, 0.33, distal * (1.0 - 0.4 * redM));
  // paired fins: clearer membrane between strongly marked rays (p42_1)
  aMem *= type > 2.5 ? mix(0.55, 0.85, redM) : 1.0;
  float aRay = mix(0.64, 0.8, redM) * mix(1.0, 0.62, distal);
  float alpha = mix(aMem, aRay, ray);
  // milky streaks: elongated along the rays, varying from ray to ray
  float milk = vnoise2(vec2(rc * 0.62 + seed * 5.0, t * 1.6 - seed)) * 0.6 + vnoise2(vec2(rc * 1.7 + seed, t * 4.5 + seed * 2.0)) * 0.4;
  alpha *= mix(1.0, 0.4 + 1.2 * milk, (1.0 - ray * 0.6) * smoothstep(0.05, 0.3, t));
  alpha = mix(alpha, 0.95, smoothstep(0.1, 0.0, t)); // fleshy base
  alpha *= mix(1.0, vFishC.z, 0.6);                  // individual fin density
  // ragged margin: the membrane recedes between the ray tips (shallow
  // scallops), some inter-ray spaces are split further in (frayed), and the
  // outermost few per cent fade softly instead of a hard cut
  float cell = floor(rc);
  float split = finSplit(cell, seed, type);
  float xr0 = rc - cell;                       // 0..1 between two rays
  float scallop = 4.0 * xr0 * (1.0 - xr0);     // 0 at the rays, 1 midway
  float recede = (0.004 + 0.007 * scallop + split * scallop) * (1.0 - ray);
  float cut = 1.0 - recede;
  float soft = 0.03 + 0.015 * (1.0 - ray);
  alpha *= 1.0 - smoothstep(cut - soft, cut, t);
  // ray tips stand slightly proud of the membrane and taper
  alpha *= 1.0 - smoothstep(0.96, 1.0, t) * ray;
  // rays fade into the membrane toward the margin (thin distal segments)
  ray *= 1.0 - 0.55 * smoothstep(0.55, 1.0, t);
  alpha *= uFinOpacity;

  gFinAlpha = clamp(alpha, 0.0, 1.0);
  gFinAlbedo = col;
  // transmitted light: warm white through the clear membrane, deeply
  // saturated through pigment (light crosses the chromatophore layer)
  gFinTrans = mix(vec3(1.0, 0.95, 0.88), pig * pig * 1.15, redM);
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
  // broad longitudinal folds of the distal membrane (a long comet lobe is
  // never a flat sheet): slow light / dark bands running along the rays
  float tf = vFinCoord.y;
  float fold = sin(vFinRay.x * 0.85 + vFishA.w * 3.0 + tf * 3.5) * 0.6 + sin(vFinRay.x * 0.37 - vFishA.w + tf * 1.7) * 0.4;
  float foldAmp = (vFinType < 0.5 ? 0.32 : 0.18) * tf * tf;
  normal = normalize(normal + Tc * (gPleat + fold * foldAmp));
}
#endif
`;

export const finFragmentMaterial = /* glsl */ `
// mucus over collagen, immersed: a faint, fairly rough sheen (no lacquer)
material.specularColor = vec3(mix(0.02, 0.03, gFinRay));
material.specularColorBlended = material.specularColor;
material.specularF90 = 0.6;
material.diffuseContribution = gFinAlbedo;
`;

export const finFragmentLightsEnd = /* glsl */ `
{
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 caus = causticsRGB(vFishWorld, nW);
  reflectedLight.directDiffuse *= caus;
  reflectedLight.directSpecular *= caus;
  // the membrane is a thin scattering sheet: light arriving on the far face
  // is partly transmitted (diffusely, with a forward-scattering lobe when the
  // viewer looks toward the light through the fin); light on the near face
  // is reflected by the standard BRDF above. No light is created when the
  // key grazes the fin plane.
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 V = normalize(vViewPosition);
    vec3 lc = directionalLights[0].color;
    float NL = dot(normal, L);
    float backLit = saturate(-NL);
    float fwd = spow(saturate(dot(V, -L)), 8.0) * saturate(-NL * 4.0);
    reflectedLight.directDiffuse += lc * gFinTrans * uFinTransmission * (backLit * 0.75 + fwd * 1.6) * RECIPROCAL_PI * caus;
  #endif
  // ambient light from the hemisphere behind the membrane, transmitted
  vec3 backIrr = vec3(0.0);
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    backIrr += getIBLIrradiance(-normal);
  #endif
  #if NUM_HEMI_LIGHTS > 0
    for (int i = 0; i < NUM_HEMI_LIGHTS; i++) backIrr += getHemisphereLightIrradiance(hemisphereLights[i], -normal);
  #endif
  reflectedLight.indirectDiffuse += backIrr * gFinTrans * uFinTransmission * 0.6 * RECIPROCAL_PI;
}
`;

export const finFragmentOutput = /* glsl */ `
{
  float nv = abs(dot(normalize(normal), normalize(vViewPosition)));
  // grazing views see more membrane / specular sheen
  // (longer path through the sheet), but never past the margin fade
  diffuseColor.a = clamp(diffuseColor.a * (1.0 + spow(clamp(1.0 - nv, 0.0, 1.0), 3.0) * 0.45), 0.0, 1.0);
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
