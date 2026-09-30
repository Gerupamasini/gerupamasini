// Body shader injections (MeshPhysicalMaterial.onBeforeCompile).
//
// Vertex: spine-curve deformation from the rig texture + mouth / operculum
// morphs + individual body proportions.
// Fragment: procedural imbricate cycloid scales (overlap order, tilt, rim
// roll-off, circuli, lateral-line pores), sarasa/solid pigment patterns that
// snap to scale boundaries, guanine (iridophore) specular tinted by the
// overlying carotenoid layer, pearlescent thin-film on white scales, head
// skin, lips, buccal cavity, gill slit and thin-tissue translucency.

export const bodyVertexPars = /* glsl */ `
in vec3 aTangent;
in vec2 aScaleUV;
in vec4 aMask;
in vec4 aMask2;
in vec3 aMorphMouth;
in vec3 aMorphMouthN;
in vec3 aMorphOperc;

VOUT vec3 vRestPos;
VOUT vec2 vScaleUV;
VOUT vec4 vMask;
VOUT vec4 vMask2;
VOUT vec3 vFishWorld;
VOUT vec3 vViewTangent;
VOUT float vOpercOpen;
VFLAT vec4 vFishA;
VFLAT vec4 vFishB;
VFLAT vec4 vFishC;

vec3 gFishPos;
vec3 gFishNormal;

void fishDeform() {
  vFishRow = aFishRow;
  vec4 m0 = rigMisc(0); // mouthOpen, opercL, opercR, SL
  vec4 m1 = rigMisc(1); // depthScale, widthScale, colorType, seed
  float side = aMask2.z;
  float operc = side > 0.0 ? m0.y : m0.z;
  vec3 p = position + aMorphMouth * m0.x + aMorphOperc * operc;
  vec3 n = normalize(normal + aMorphMouthN * m0.x);
  vec3 sc = vec3(1.0, m1.x, m1.y);
  float s = -p.x;
  p.yz *= sc.yz;
  n = normalize(n / sc);
  float s0 = clamp(s, 0.0, 1.0);
  vec3 P; vec4 Q;
  spineSample(s0, P, Q);
  vec3 local = vec3(-(s - s0), p.y, p.z) * m0.w;
  gFishPos = P + qrot(Q, local);
  gFishNormal = qrot(Q, n);
  vec3 t = aTangent; t.yz *= sc.yz;
  vec3 tw = normalize(qrot(Q, t));
  vViewTangent = normalize((viewMatrix * vec4(tw, 0.0)).xyz);
  vFishWorld = gFishPos;
  vRestPos = position;
  vScaleUV = aScaleUV;
  vMask = aMask;
  vMask2 = aMask2;
  vOpercOpen = operc;
  vFishA = m1;
  vFishB = rigMisc(2);
  vFishC = rigMisc(3);
}
`;

export const bodyFragmentPars = /* glsl */ `
in vec3 vRestPos;
in vec2 vScaleUV;
in vec4 vMask;
in vec4 vMask2;
in vec3 vFishWorld;
in vec3 vViewTangent;
in float vOpercOpen;
flat in vec4 vFishA;
flat in vec4 vFishB;
flat in vec4 vFishC;

uniform vec3 uColRed;
uniform vec3 uColOrange;
uniform vec3 uColYellow;
uniform vec3 uColWhite;
uniform vec3 uColGill;
uniform float uScaleIntensity;
uniform float uRoughness;
uniform float uGuanine;
uniform float uIridescence;
uniform float uSSS;
uniform float uDebugView; // 0 off, 1 normals, 2 pattern, 3 scales

// ---------------------------------------------------------------- pattern ----
// colorType: 0 sarasa (red/white), 1 red, 2 orange, 3 yellow, 4 white
float sarasaMask(vec3 rp, float seed, float cover) {
  vec3 q = rp * vec3(3.4, 4.6, 4.2) + vec3(seed * 13.17, seed * 5.31, seed * 2.73);
  float n = fbm3(q);
  float n2 = fbm3(q * 2.3 + 7.1);
  float a = clamp(rp.y / 0.17, -1.0, 1.0);
  float s = -rp.x;
  float h = hash11(seed * 91.7);
  float bias = 0.24 * a                                   // back redder than belly
    - 0.3 * smoothstep(-0.25, -0.85, a)                   // white belly
    + (h > 0.55 ? 0.22 : -0.1) * smoothstep(0.3, 0.1, s)  // red head cap vs white face
    - (h < 0.3 ? 0.25 : 0.0) * smoothstep(0.06, 0.0, s)   // white snout
    + 0.12 * smoothstep(0.8, 1.0, s);                     // red caudal base
  float v = n + 0.12 * (n2 - 0.5) + bias;
  float th = 1.0 - cover;
  return smoothstep(th - 0.018, th + 0.018, v);
}

vec3 bodyPigment(vec3 rp, float red, out float whiteness, out vec3 specTint) {
  float type = vFishA.z;
  float a = clamp(rp.y / 0.17, -1.0, 1.0);
  float hueShift = vFishB.y;
  vec3 redCol = mix(uColRed, uColOrange, clamp(0.25 + hueShift, 0.0, 1.0) * 0.55);
  vec3 col; whiteness = 0.0;
  if (type < 0.5) {
    // sarasa: red patches on pearly white
    vec3 white = uColWhite * mix(vec3(1.0), vec3(1.0, 0.95, 0.84), 0.35 * smoothstep(0.0, 0.5, red));
    col = mix(white, redCol, red);
    whiteness = 1.0 - red;
  } else if (type < 1.5) {
    col = mix(redCol, mix(uColOrange, uColYellow, 0.35), smoothstep(-0.2, -0.9, a) * 0.6);
  } else if (type < 2.5) {
    col = mix(uColOrange, uColYellow, 0.25 + smoothstep(-0.2, -0.9, a) * 0.5);
  } else if (type < 3.5) {
    col = mix(uColYellow, uColWhite, smoothstep(-0.3, -0.95, a) * 0.5);
  } else {
    col = uColWhite * vec3(1.0, 0.975, 0.96);
    whiteness = 1.0;
  }
  // dorsal darkening / ventral lightening (countershading from chromatophore density)
  col *= mix(0.86, 1.06, smoothstep(0.9, -0.6, a));
  vec3 pig = col / max(max(col.r, col.g), max(col.b, 1e-3));
  specTint = mix(pig * pig * vec3(1.0, 1.05, 1.1), vec3(0.93, 0.96, 1.0), whiteness);
  specTint = mix(specTint, vec3(1.0, 0.8, 0.45), (1.0 - whiteness) * 0.25);
  return col;
}

// ---------------------------------------------------------------- scales -----
struct ScaleHit { vec2 q; vec2 id; float d; float dPrev; };

// Imbricate cycloid scales on a staggered grid (U: along body, V: around).
// The anterior-most scale covering a point is on top (roof-tile overlap),
// so the visible boundaries are the scalloped free (posterior) margins.
ScaleHit scaleLookup(vec2 uv) {
  const float R = 0.7;
  ScaleHit h; h.d = 9.0; h.dPrev = 9.0; h.q = vec2(0.0); h.id = vec2(0.0);
  float i0 = floor(uv.x - 0.5 - R - 0.1);
  bool found = false;
  for (int k = 0; k < 3; k++) {
    float i = i0 + float(k);
    float par = mod(i, 2.0);
    float jc = floor(uv.y - 0.5 * par + 0.5);
    float best = 9.0; vec2 bq = vec2(0.0); vec2 bid = vec2(0.0);
    for (int m = -1; m <= 1; m++) {
      float j = jc + float(m);
      vec2 id = vec2(i, j);
      vec3 jr = hash32(id * 1.37 + 11.0);
      vec2 c = vec2(i + 0.5, j + 0.5 * par) + (jr.xy - 0.5) * vec2(0.1, 0.12);
      vec2 q = uv - c;
      float rr = R * (0.95 + 0.1 * jr.z);
      float d = length(q * vec2(1.0, 1.25)) / rr;
      if (d < best) { best = d; bq = q; bid = id; }
    }
    if (!found) {
      if (best < 1.0) { found = true; h.d = best; h.q = bq; h.id = bid; }
      else h.dPrev = min(h.dPrev, best);
    }
  }
  return h;
}

struct FishSurf {
  vec3 albedo;
  float rough;
  vec3 spec;     // F0 (guanine reflector, tinted)
  float irid;
  float iridThick;
  vec3 nT;       // tangent-space normal (x along body, y dorsal-ward, z out)
  float ao;
  vec3 sssCol;
  float thin;
};

FishSurf gFS;

void computeFishSurface() {
  vec3 rp = vRestPos;
  float seed = vFishA.w;
  float scaleMask = vMask.x;
  float gill = vMask.y;
  float lip = vMask.z;
  float operc = vMask2.x;
  float orbit = vMask2.w;
  float a = vMask2.y;

  // ---- scales
  vec2 fw = fwidth(vScaleUV);
  float detail = (1.0 - smoothstep(0.22, 0.75, max(fw.x, fw.y))) * scaleMask;
  ScaleHit sh = scaleLookup(vScaleUV);
  vec3 rnd = hash32(sh.id + seed * 17.0);
  float d = sh.d;
  vec2 q = sh.q;

  // height-field gradient of one scale: gently domed, slightly lifted
  // toward its free (posterior) margin which rolls down onto the next scale.
  vec2 grad = vec2(0.05, 0.0);
  grad += -0.16 * q * vec2(1.0, 1.56);
  float edge = smoothstep(0.84, 1.0, d);
  vec2 rad = normalize(q * vec2(1.0, 1.56) + 1e-5);
  grad -= rad * edge * 0.32;
  grad += (rnd.xy - 0.5) * 0.2; // per-scale orientation jitter => glints
  // circuli: fine concentric ridges around the (anterior) focus
  vec2 foc = q - vec2(-0.25, 0.0);
  float rf = length(foc * vec2(1.0, 1.25));
  float fineFade = 1.0 - smoothstep(0.03, 0.09, max(fw.x, fw.y));
  grad += normalize(foc + 1e-5) * sin(rf * 70.0) * 0.03 * fineFade;
  // radii: radial grooves in the exposed posterior field
  float ang = atan(foc.y, foc.x);
  grad += vec2(-sin(ang), cos(ang)) * spow(abs(sin(ang * 4.0 + rnd.z * 6.28)), 24.0) * 0.05 * step(0.0, foc.x) * fineFade;
  // lateral line pore (canal tube on the exposed field of lateral-line scales)
  float llRow = step(abs(sh.id.y), 0.5) * step(-0.5, sh.id.x);
  float pore = llRow * smoothstep(0.16, 0.05, length((q - vec2(0.16, 0.0)) * vec2(0.8, 2.2)));
  grad += llRow * normalize(q - vec2(0.16, 0.0) + 1e-5) * pore * 0.3;

  float amp = uScaleIntensity * detail;
  vec3 nT = normalize(vec3(-grad * amp, 1.0));
  // thin shadow cast by the overlapping margin of the scale in front
  float marginShadow = 1.0 - smoothstep(1.0, 1.09, sh.dPrev);
  float ao = mix(1.0, 1.0 - 0.28 * marginShadow, detail);

  // ---- pigment pattern (snapped partly to scale boundaries)
  float cover = vFishB.x;
  float red = 0.0;
  if (vFishA.z < 0.5) {
    red = sarasaMask(rp, seed, cover);
    // pigment borders follow scale outlines in real sarasa comets
    vec3 rp2 = rp + vec3(q.x * 0.0255, -q.y * 0.03, 0.0);
    float redScale = sarasaMask(rp2, seed, cover);
    red = mix(red, redScale, 0.7 * scaleMask);
  }
  float whiteness; vec3 specTint;
  vec3 col = bodyPigment(rp, red, whiteness, specTint);
  // per-scale pigment variation and lighter scale margins in pigmented areas
  col *= mix(1.0, 0.95 + 0.1 * rnd.z, detail);
  col = mix(col, col * vec3(1.06, 1.2, 1.3) + vec3(0.02, 0.025, 0.0), edge * (1.0 - whiteness) * 0.55 * detail);
  // reticulated slightly darker margins on white scales (fewer iridophores at the edge)
  col *= mix(1.0, 0.9, (edge * 0.6 + marginShadow * 0.6) * whiteness * detail);

  // guanine reflector strength (metallic scale type, some duller scales)
  float refl = uGuanine * mix(0.6, 1.0, rnd.x) * (rnd.y < 0.08 ? 0.5 : 1.0) * mix(1.0, 0.75, edge);
  refl = mix(uGuanine * 0.55, refl, detail);
  // head: iridophores on operculum/cheek give a softer golden sheen
  float headSheen = uGuanine * (0.25 + 0.45 * operc + 0.2 * smoothstep(0.1, -0.6, a));
  refl = mix(headSheen, refl, scaleMask);
  // belly: silvery stratum argenteum
  refl *= mix(1.0, 1.25, smoothstep(-0.3, -0.9, a));

  vec3 spec = specTint * refl;
  float rough = uRoughness * mix(0.8, 1.2, rnd.z);
  rough = mix(uRoughness * 1.35, rough, scaleMask);
  rough = mix(rough + 0.12, rough, detail * scaleMask + (1.0 - scaleMask));

  // ---- lips, buccal cavity, gill slit, orbit
  vec3 lipCol = mix(col, vec3(0.9, 0.52, 0.42) * mix(vec3(1.0), col * 1.3, 0.35), 0.55);
  if (lip > 0.0) { col = mix(col, lipCol, lip * 0.8); spec *= 1.0 - 0.6 * lip; rough = mix(rough, 0.5, lip); }
  if (lip < -0.5) {
    float depth = clamp(-rp.x / 0.07, 0.0, 1.0);
    col = mix(vec3(0.55, 0.16, 0.14), vec3(0.08, 0.01, 0.01), depth);
    spec = vec3(0.02); rough = 0.35; ao = mix(0.7, 0.15, depth);
  }
  vec3 gillCol = uColGill * mix(0.35, 1.0, clamp(vOpercOpen, 0.0, 1.0));
  col = mix(col, gillCol * 0.45, gill * mix(0.55, 1.0, clamp(vOpercOpen, 0.0, 1.0)));
  ao *= 1.0 - gill * 0.6;
  // fleshy orbital rim is pale and less reflective
  col = mix(col, mix(col, vec3(0.92, 0.86, 0.8), 0.45), orbit * 0.5);

  // ---- thin-tissue translucency
  float thick = vMask.w;
  float thin = 1.0 - smoothstep(0.02, 0.16, thick);
  thin = max(thin, operc * 0.55);
  vec3 sss = mix(vec3(1.0, 0.32, 0.18), vec3(1.0, 0.72, 0.62), whiteness);
  sss = mix(sss, vec3(1.0, 0.25, 0.2), operc * 0.6);

  gFS.albedo = col;
  gFS.rough = clamp(rough, 0.06, 1.0);
  gFS.spec = spec;
  gFS.irid = uIridescence * mix(0.35, 1.0, whiteness) * (0.6 + 0.4 * rnd.y) * mix(0.4, 1.0, scaleMask);
  gFS.iridThick = mix(260.0, 520.0, rnd.x);
  gFS.nT = nT;
  gFS.ao = ao;
  gFS.sssCol = sss * col;
  gFS.thin = thin;
}
`;

export const bodyFragmentColor = /* glsl */ `
computeFishSurface();
diffuseColor.rgb = gFS.albedo;
`;

export const bodyFragmentNormal = /* glsl */ `
{
  vec3 T = normalize(vViewTangent - normal * dot(vViewTangent, normal));
  vec3 B = normalize(cross(normal, T));
  // orient B toward the dorsal side of the fish (aScaleUV.y increases dorsally)
  B *= (vMask2.z > 0.0 ? -1.0 : 1.0);
  normal = normalize(T * gFS.nT.x + B * gFS.nT.y + normal * gFS.nT.z);
}
`;

export const bodyFragmentMaterial = /* glsl */ `
material.specularColor = gFS.spec;
material.specularColorBlended = gFS.spec;
material.specularF90 = clamp(max(max(gFS.spec.r, gFS.spec.g), gFS.spec.b) * 1.4 + 0.2, 0.0, 1.0);
material.diffuseContribution = gFS.albedo;
#ifdef USE_IRIDESCENCE
material.iridescence = gFS.irid;
material.iridescenceThickness = gFS.iridThick;
#endif
`;

export const bodyFragmentLightsEnd = /* glsl */ `
{
  // key light caustics + thin-tissue translucency + soft wrap scattering
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 caus = causticsRGB(vFishWorld, nW);
  reflectedLight.directDiffuse *= caus;
  reflectedLight.directSpecular *= mix(vec3(1.0), caus, 0.7);
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 V = normalize(vViewPosition); // toward camera (view space)
    float wrap = saturate((dot(normal, L) + 0.45) / 1.45) - saturate(dot(normal, L));
    float trans = spow(saturate(dot(V, -(L + normal * 0.35))), 3.0);
    vec3 lc = directionalLights[0].color;
    reflectedLight.directDiffuse += lc * gFS.sssCol * uSSS * (wrap * 0.35 + trans * gFS.thin * 1.6) * caus;
  #endif
  reflectedLight.indirectDiffuse *= gFS.ao;
  reflectedLight.indirectSpecular *= mix(1.0, gFS.ao, 0.8);
  reflectedLight.directDiffuse *= mix(1.0, gFS.ao, 0.5);
}
`;

export const bodyFragmentOutput = /* glsl */ `
outgoingLight = waterAttenuate(outgoingLight, vFishWorld);
if (uDebugView > 0.5) {
  if (uDebugView < 1.5) outgoingLight = normalize(inverseTransformDirection(normal, viewMatrix)) * 0.5 + 0.5;
  else if (uDebugView < 2.5) outgoingLight = gFS.albedo;
  else outgoingLight = gFS.nT * 0.5 + 0.5;
}
`;
