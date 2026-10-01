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
in vec4 aFinRoot;
out vec4 vFinCoord;
VOUT vec4 vFinRay;
VOUT vec4 vFinRoot;
VOUT float vFinRootRed;
VOUT vec3 vFishWorld;
VFLAT float vFinType;
VFLAT vec4 vFishA;
VFLAT vec4 vFishB;
VFLAT vec4 vFishC;
VFLAT float vTone; // packed pigment tone (see Fish.writeMisc)

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
  // ---- rest-shape relief on top of the simulated rays (shape only; the rig
  // drives the motion). The distal membrane carries a few broad longitudinal
  // folds (the same folds the fragment shader shades), so the margins also
  // undulate when seen edge-on. (No in-plane sweep of the rays here: the
  // distal rays of a caudal lobe converge to almost no spacing, and any
  // inward shift on top of the simulated rays folds the membrane over itself
  // into a bright flake.)
  float Lr = aFinRoot.w * SL; // true ray length (m)
  float foldPh = rc * 0.85 + seed * 3.0 + t * 3.5;
  P += N * ((aFinIdx.w < 0.5 ? 0.03 : 0.012) * t * t * Lr * cos(foldPh));
#ifndef DEPTH_ONLY
  // sarasa: body pattern where the fin attaches (the caudal samples it out to
  // the margin of the fleshy tongue that covers its base), per vertex
  vFinRootRed = 0.0;
  if (rigMisc(1).z < 0.5) {
    float sR = aFinRoot.x + (aFinIdx.w < 0.5 ? min(t * aFinRoot.w, 0.1) : 0.0);
    float v = sarasaField(vec3(-sR, aFinRoot.y, aFinRoot.z), seed);
    float th = 1.0 - rigMisc(2).x;
    vFinRootRed = smoothstep(th - 0.06, th + 0.06, v);
  }
#endif
  gFishPos = P + N * (layer * aFinCoord.w * 0.5 * SL);
  gFishNormal = N * layer;
  vFinCoord = aFinCoord;
  vFinRay = aFinRay;
  vFinRoot = aFinRoot;
  vFinType = aFinIdx.w;
  vFishWorld = gFishPos;
  vFishA = rigMisc(1);
  vFishB = rigMisc(2);
  vFishC = rigMisc(3);
  vTone = rigMisc(4).w;
}
`;

export const finFragmentPars = /* glsl */ `
in vec4 vFinCoord;
in vec4 vFinRay;
in vec4 vFinRoot;
in float vFinRootRed;
in vec3 vFishWorld;
flat in float vFinType;
float gPleat;   // signed pleat slope across the rays
flat in vec4 vFishA;
flat in vec4 vFishB;
flat in vec4 vFishC;
flat in float vTone;

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
vec3 gFinSpec;

// distance (in ray-spacing units) to the nearest (possibly branched) ray
float rayDistance(float rc, float t, float type, float nRays) {
  float k = floor(rc + 0.5);
  float x = rc - k;
  // outermost rays & the first unbranched rays of dorsal/anal are simple
  bool simple = (k < 0.5) || (k > nRays - 1.5) || (type > 0.5 && type < 2.5 && k < 2.5);
  // rays branch early (dichotomously, twice), so distally the membrane is
  // ribbed by many fine rays rather than a few thick ones
  float tb1 = type < 0.5 ? mix(0.2, 0.4, abs(k / (nRays - 1.0) - 0.5) * 2.0) : 0.34;
  float d = abs(x);
  if (!simple && t > tb1) {
    float sp = 0.2 * smoothstep(tb1, tb1 + 0.3, t);
    d = min(abs(x - sp), abs(x + sp));
    float tb2 = tb1 + 0.24;
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
  float deep = smoothstep(0.92, 0.995, h);
  return deep * (type < 0.5 ? 0.045 : 0.03) + 0.008 * h;
}

void computeFinSurface() {
  float t = vFinCoord.y;
  float rc = vFinRay.x;
  float nRays = vFinRay.y;
  float rN = vFinRay.z;
  float lead = vFinRay.w;
  float type = vFinType;
  float seed = vFishA.w;
  // fleshy fin base: skin with guanine and blood vessels continues from the
  // body over the first few millimetres of the rays (absolute length, so the
  // short central caudal rays and the long lobe rays share one base line)
  float tAbs = t * vFinRoot.w;
  float fleshL = type < 0.5 ? 0.15 : 0.022;
  float flesh = 1.0 - smoothstep(0.2 * fleshL, fleshL, tAbs);

  float fwr = max(fwidth(rc), 1e-4);
  float rd = rayDistance(rc, t, type, nRays);
  float w = mix(0.08, 0.028, t) + lead * 0.09;
  float ray = 1.0 - smoothstep(w - fwr * 0.7, w + fwr * 0.7, rd);
  // fade the ray pattern to its average when rays get sub-pixel
  float rayAA = smoothstep(1.4, 0.5, fwr);
  // sub-pixel rays: their averaged coverage. Rays branch twice, so distally
  // two to four fine rays share one inter-ray space (~30 % of the width);
  // a fin seen from afar keeps the density and colour of its rays
  float rayMean = clamp((t > 0.3 ? (t > 0.6 ? 4.0 : 2.0) : 1.0) * 2.0 * w, 0.12, 0.36);
  ray = mix(rayMean, ray, rayAA);
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
  if (ctype < 0.5) {
    // sarasa: the fin base continues the body pattern where it attaches —
    // red runs out from a red peduncle / back along the rays, a fin rooted
    // in white skin stays white at its base (only a faint own wash)
    float rootRed = vFinRootRed;
    float runOut = (type < 0.5 ? 0.15 : 0.28) + nz * 0.2 + nzr * 0.25;
    float cont = rootRed * smoothstep(runOut + 0.1, runOut - 0.1, t - ray * 0.06);
    redM = max(redM * mix(0.15, 1.0, rootRed), cont);
  }
  // the same individual red as the body (see bodyPigment)
  float tDark = floor(vTone / 4096.0) / 63.0;
  vec3 deep = mix(vec3(1.12, 1.45, 1.3), vec3(0.62, 0.32, 0.44), tDark);
  float oMix = clamp(0.25 + vFishB.y, 0.0, 1.0);
  vec3 redCol = ctype < 0.5 ? mix(uColRed, uColOrange, oMix * 0.06) * mix(vec3(1.0), deep, 0.5) : mix(uColRed, uColOrange, oMix * 0.85) * deep;
  vec3 pig = redCol;
  if (ctype > 1.5 && ctype < 2.5) pig = mix(uColOrange, uColYellow, 0.3);
  if (ctype > 2.5 && ctype < 3.5) pig = mix(uColOrange, uColYellow, 0.62); // golden, not lemon
  // distal red thins out to a translucent orange wash before it clears
  pig = mix(pig, mix(pig, uColOrange, 0.35), smoothstep(0.0, 1.0, t) * (1.0 - redM));
  // white membrane: a thin turbid collagen sheet — bluish-white where it
  // scatters light back toward the viewer, warmer in transmission
  // (a thin sheet: it scatters back only a fraction of the light)
  // (milky, warm-neutral: blue-grey membranes read as ghosts in the tank)
  vec3 membraneWhite = vec3(0.56, 0.58, 0.6);
  // the fleshy base is pale pink skin, the same tone as the thin peduncle
  vec3 fleshWhite = uColWhite * vec3(1.0, 0.8, 0.78);
  vec3 col = mix(mix(membraneWhite, fleshWhite, flesh), pig, redM);
  // rays carry more chromatophores + iridophores: denser pigment / whiter
  col = mix(col, mix(vec3(0.72, 0.75, 0.8), pig * 1.04, redM), ray * 0.3);
  col *= 1.0 - joint * 0.3;
  // individual rays differ a little in tint (faint bluish / golden
  // iridophores), and fine blood vessels run along the rays near the base
  float rh = hash12(vec2(floor(rc + 0.5) * 1.7 + 0.3, seed * 2.1 + type * 5.0)) - 0.5;
  col *= mix(vec3(1.0), mix(vec3(0.9, 0.97, 1.1), vec3(1.08, 1.0, 0.86), step(0.0, rh)), ray * (1.0 - redM) * abs(rh) * 1.6);
  col = mix(col, col * vec3(1.0, 0.74, 0.74), ray * (1.0 - redM) * smoothstep(0.45, 0.08, t) * 0.45);
  // blood in the thicker proximal membrane shows through as a soft pink
  // flush next to the fleshy base of an unpigmented fin (p12_0, p11_1)
  col = mix(col, col * vec3(1.0, 0.8, 0.8), (1.0 - redM) * smoothstep(0.3, 0.02, t) * 0.35);

  // ---- opacity (only the shell layer facing the camera is drawn): milky
  // membrane with streaks along the rays, denser rays, fleshy base, and a
  // distal zone that thins and clears toward the margin
  // (the membrane between the rays is clearly see-through, the rays carry
  // most of the density; distally both thin out further)
  float distal = smoothstep(0.25, 0.9, t);
  float aMem = mix(0.4, 0.54, redM) * mix(1.0, 0.55, distal * (1.0 - 0.35 * redM));
  // paired fins: clearer membrane between strongly marked rays (p42_1)
  aMem *= type > 2.5 ? mix(0.6, 0.85, redM) : 1.0;
  float aRay = mix(0.62, 0.78, redM) * mix(1.0, 0.55, distal);
  float alpha = mix(aMem, aRay, ray);
  // milky streaks: elongated along the rays, varying from ray to ray
  float milk = vnoise2(vec2(rc * 0.62 + seed * 5.0, t * 1.6 - seed)) * 0.6 + vnoise2(vec2(rc * 1.7 + seed, t * 4.5 + seed * 2.0)) * 0.4;
  // (with clear windows between the rays where the membrane is thinnest)
  alpha *= mix(1.0, 0.15 + 1.25 * milk, (1.0 - ray * 0.6) * smoothstep(0.05, 0.3, t));
  alpha = mix(alpha, 0.97, flesh); // fleshy base
  // seen from afar the clear windows and streaks average out: the fin keeps
  // its mean milky density (it never vanishes into a ghost at distance)
  alpha = mix(max(alpha, 0.3 * mix(1.0, 0.7, distal)), alpha, rayAA);
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
  // the fleshy base is opaque tissue (the end of the body lies inside it)
  alpha = max(alpha, flesh * 0.985);

  gFinAlpha = clamp(alpha, 0.0, 1.0);
  gFinAlbedo = col;
  // transmitted light: warm white through the clear membrane, deeply
  // saturated through pigment (light crosses the chromatophore layer)
  gFinTrans = mix(vec3(1.0, 0.85, 0.7), pig * pig * 1.15, redM);
  gFinRay = ray;
  gFinRough = uFinRoughness * mix(1.0, 0.8, ray);
  // the fleshy base keeps a little of the body's guanine sheen
  vec3 pigN = col / max(max(col.r, col.g), max(col.b, 1e-3));
  gFinSpec = mix(vec3(mix(0.02, 0.03, ray)), mix(vec3(0.9, 0.93, 1.0) * 0.45, mix(pigN * pigN, vec3(1.0, 0.6, 0.22), 0.45) * 0.22, redM), flesh);
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
material.specularColor = gFinSpec;
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
    reflectedLight.directDiffuse += lc * gFinTrans * uFinTransmission * (backLit * 0.75 + fwd * 0.8) * RECIPROCAL_PI * caus;
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
