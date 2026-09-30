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
in vec3 aSect;
uniform vec3 uCausticLightDir;

VOUT vec3 vRestPos;
VOUT vec3 vSect;   // local elliptic cross-section: centre y, half width, half height (rest SL units)
VOUT vec3 vLocV;   // direction to the camera in the unscaled rest frame
VOUT vec3 vLocL;   // direction to the key light in the unscaled rest frame
VFLAT float vSL;
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
#ifndef DEPTH_ONLY
  // light transport inside the body is traced in the rest frame of this
  // cross-section: rotate world directions back by the spine frame and undo
  // the individual depth / width scaling (so ray parameter = real distance).
  vec4 Qc = vec4(-Q.xyz, Q.w);
  vSect = aSect;
  vLocV = qrot(Qc, normalize(cameraPosition - gFishPos)) / sc;
  vLocL = qrot(Qc, uCausticLightDir) / sc;
  vSL = m0.w;
#endif
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
in vec3 vSect;
in vec3 vLocV;
in vec3 vLocL;
flat in float vSL;

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
uniform float uTranslucency;
uniform float uDebugView; // 0 off, 1 normals, 2 pattern, 3 scales, 4 thickness

// ------------------------------------------------------------ light transport --
// Chord length (rest SL units, i.e. real distance / SL) from surface point p
// (rest y, z) into the body along direction d (rest dy, dz), treating the body
// locally as an elliptic cylinder around the spine. Grazing rays near the
// silhouette give short chords, rays through the peduncle / fin bases / dorsal
// and ventral keels are short, rays across the trunk are long.
float sectChord(vec2 p, vec2 d, vec3 sect) {
  vec2 q = vec2((p.x - sect.x) / sect.z, p.y / sect.y);
  q /= max(length(q), 1e-4); // project onto the ellipse
  vec2 dd = vec2(d.x / sect.z, d.y / sect.y);
  float a = dot(dd, dd);
  float b = dot(q, dd);
  return b < 0.0 ? min(-2.0 * b / max(a, 1e-6), 0.6) : 0.0;
}

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
    // within a column the dorsal neighbour overlaps the ventral one, so the
    // boundary between them is also a rounded margin (not a Voronoi edge)
    float best = 9.0; vec2 bq = vec2(0.0); vec2 bid = vec2(0.0);
    bool cov = false;
    for (int m = 1; m >= -1; m--) {
      float j = jc + float(m);
      vec2 id = vec2(i, j);
      vec3 jr = hash32(id * 1.37 + 11.0);
      vec2 c = vec2(i + 0.5, j + 0.5 * par) + (jr.xy - 0.5) * vec2(0.1, 0.12);
      vec2 q = uv - c;
      float rr = R * (0.95 + 0.1 * jr.z);
      float d = length(q * vec2(1.0, 1.25)) / rr;
      if (!cov && d < 1.0) { cov = true; best = d; bq = q; bid = id; }
      else if (!cov && d < best) { best = d; bq = q; bid = id; }
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
  vec3 tissue;   // colour of light that has diffused through the body (interior x exit filter)
  float whiteness;
};

FishSurf gFS;
float gNV; // n.v of the interpolated normal (set in main before the surface is built)

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
#if FISH_LOD >= 2
  // distant fish: scales are sub-pixel -> skip the per-scale lookup entirely
  detail = 0.0;
  ScaleHit sh; sh.q = vec2(0.0); sh.id = floor(vScaleUV); sh.d = 0.5; sh.dPrev = 9.0;
#else
  ScaleHit sh = scaleLookup(vScaleUV);
#endif
  vec3 rnd = hash32(sh.id + seed * 17.0);
  float d = sh.d;
  vec2 q = sh.q;

  // height-field gradient of one scale: gently domed, slightly lifted
  // toward its free (posterior) margin which rolls down onto the next scale.
  vec2 grad = vec2(0.04, 0.0);
  // (a real scale is a thin, nearly flat bony plate: weak dome, the
  // character comes from each plate's own tilt and its rolled free margin)
  grad += -0.045 * q * vec2(1.0, 1.56);
  float edge = smoothstep(0.84, 1.0, d);
  vec2 rad = normalize(q * vec2(1.0, 1.56) + 1e-5);
  grad -= rad * edge * 0.2;
  vec2 jit = (rnd.xy - 0.5) * 0.11; // per-scale orientation jitter => glints (added below)
  // circuli: fine concentric ridges around the (anterior) focus
  vec2 foc = q - vec2(-0.25, 0.0);
  float rf = length(foc * vec2(1.0, 1.25));
  float fineFade = 1.0 - smoothstep(0.03, 0.09, max(fw.x, fw.y));
  grad += normalize(foc + 1e-5) * sin(rf * 70.0) * 0.014 * fineFade;
  // radii: radial grooves in the exposed posterior field
  float ang = atan(foc.y, foc.x);
  grad += vec2(-sin(ang), cos(ang)) * spow(abs(sin(ang * 4.0 + rnd.z * 6.28)), 24.0) * 0.05 * step(0.0, foc.x) * fineFade;
  // lateral line pore (canal tube on the exposed field of lateral-line scales)
  float llRow = step(abs(sh.id.y), 0.5) * step(-0.5, sh.id.x);
  float pore = llRow * smoothstep(0.16, 0.05, length((q - vec2(0.16, 0.0)) * vec2(0.8, 2.2)));
  grad += llRow * normalize(q - vec2(0.16, 0.0) + 1e-5) * pore * 0.3;

  float amp = uScaleIntensity * detail;
  // thin shadow cast by the overlapping margin of the scale in front
  float marginShadow = 1.0 - smoothstep(1.0, 1.09, sh.dPrev);
  float ao = mix(1.0, 1.0 - 0.16 * marginShadow, detail);

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
  // white (guanine-only) scales are thinner and lie flatter: softer relief
  // white (iridophore-only) scales lie flatter and more uniformly aligned:
  // softer relief and much less per-scale tilt, so they read as a fine net
  // with a continuous pearly sheen instead of a sequin mosaic
  vec3 nT = normalize(vec3(-(grad * mix(1.0, 0.65, whiteness) + jit * mix(1.0, 0.3, whiteness)) * amp, 1.0));
  // per-scale pigment variation and lighter scale margins in pigmented areas
  col *= mix(1.0, 0.97 + 0.06 * rnd.z, detail);
  col = mix(col, col * vec3(1.05, 1.16, 1.25) + vec3(0.015, 0.02, 0.0), edge * (1.0 - whiteness) * 0.38 * detail);
  // reticulated slightly darker margins on white scales (fewer iridophores at the edge)
  col *= mix(1.0, 0.93, (edge * 0.5 + marginShadow * 0.5) * whiteness * detail);

  // guanine reflector strength (metallic scale type, some duller scales)
  float refl = uGuanine * mix(mix(0.78, 0.93, whiteness), 1.0, rnd.x) * (rnd.y < 0.06 ? 0.6 : 1.0) * mix(1.0, 0.82, edge) * mix(1.0, 1.25, whiteness);
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
  col = mix(col, gillCol * 0.45, gill * mix(0.3, 1.0, clamp(vOpercOpen, 0.0, 1.0)));
  ao *= 1.0 - gill * (0.25 + 0.4 * clamp(vOpercOpen, 0.0, 1.0));
  // fleshy orbital rim is pale and less reflective
  col = mix(col, mix(col, vec3(0.92, 0.86, 0.8), 0.45), orbit * 0.5);

  // ---- head skin: fine micro-relief and mottled chromatophores (no scales)
  float headSkin = 1.0 - scaleMask;
  if (headSkin > 0.01 && lip > -0.5) {
    vec3 hp = rp * 180.0;
    float mn = vnoise3(hp) - 0.5;
    float mn2 = vnoise3(hp * 2.7 + 3.1) - 0.5;
    nT = normalize(nT + vec3(mn, mn2, 0.0) * 0.07 * headSkin);
    col *= 1.0 + (vnoise3(rp * 55.0 + seed) - 0.5) * 0.12 * headSkin;
  }
  // ventral xanthophore wash behind the pectorals (yellowish belly in sarasa)
  float bellyY = smoothstep(-0.2, -0.75, a) * smoothstep(0.2, 0.36, -rp.x) * smoothstep(0.62, 0.42, -rp.x);
  col = mix(col, col * vec3(1.05, 0.95, 0.62), bellyY * 0.35 * whiteness);

  // ---- sub-surface tissue
  // gill blush: blood-filled filaments under the thin opercular bone show
  // through pale skin as a pink flush, strongest toward the free margin
  float blush = operc * whiteness * uTranslucency;
  col = mix(col, col * vec3(1.0, 0.72, 0.72), blush * 0.45);
  // flesh seen through the thin white (iridophore-only) skin: pinkish depth,
  // stronger where the body is thin (peduncle, belly, throat) and when viewed
  // head-on (grazing views see the reflective guanine layer instead)
  float fleshThin = 1.0 - smoothstep(0.03, 0.12, vMask.w);
  float nvB = gNV;
  col = mix(col, col * vec3(1.0, 0.84, 0.83), whiteness * uTranslucency * (0.12 + 0.3 * fleshThin) * (0.4 + 0.6 * nvB));
  // pale belly and throat skin: faint warm flesh tone underneath the guanine
  col = mix(col, col * vec3(1.0, 0.9, 0.86), smoothstep(-0.35, -0.9, a) * whiteness * 0.3 * uTranslucency);
  float thick = vMask.w;
  float thin = 1.0 - smoothstep(0.02, 0.16, thick);
  thin = max(thin, operc * 0.55);
  vec3 sss = mix(vec3(1.0, 0.32, 0.18), vec3(1.0, 0.72, 0.62), whiteness);
  sss = mix(sss, vec3(1.0, 0.25, 0.2), operc * 0.6);
  // light leaving the body after diffusing through muscle / blood: warm flesh
  // (red gill chamber under the operculum), filtered by the pigment layer it
  // exits through (carotenoid cells pass red, dense white iridophores reflect
  // much of it back inside)
  vec3 interior = mix(vec3(1.0, 0.6, 0.48), vec3(1.0, 0.3, 0.26), operc * 0.8);
  interior = mix(interior, vec3(1.0, 0.72, 0.6), smoothstep(-0.3, -0.9, a) * 0.5);
  vec3 pig = col / max(max(col.r, col.g), max(col.b, 1e-3));
  vec3 exitF = mix(pig * pig, vec3(1.0), 0.18) * mix(0.95, 0.6, whiteness);

  gFS.albedo = col;
  gFS.rough = clamp(rough, 0.06, 1.0);
  gFS.spec = spec;
  gFS.irid = uIridescence * mix(0.35, 1.0, whiteness) * mix(0.6 + 0.4 * rnd.y, 0.85 + 0.15 * rnd.y, whiteness) * mix(0.4, 1.0, scaleMask);
  // film thickness: pigmented scales vary widely (gold / green / violet
  // glints); white scales keep a uniform pearly film
  gFS.iridThick = mix(mix(260.0, 520.0, rnd.x), mix(360.0, 410.0, rnd.x), whiteness);
  gFS.nT = nT;
  gFS.ao = ao;
  gFS.sssCol = sss * col;
  gFS.thin = thin;
  gFS.tissue = interior * exitF;
  gFS.whiteness = whiteness;
}
`;

export const bodyFragmentShadowPars = /* glsl */ `
uniform mat4 uKeyShadowMatrix;
uniform float uKeyShadowOn;
// Key-light visibility at an arbitrary world position (4-tap PCF). Used to
// shadow light that enters the body somewhere else than the shaded point.
float keyShadowAt(vec3 pw, float radiusTexels) {
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 ) && defined( SHADOWMAP_TYPE_PCF )
  if (uKeyShadowOn < 0.5) return 1.0;
  vec4 c = uKeyShadowMatrix * vec4(pw, 1.0);
  c.xyz /= c.w;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  vec2 ts = radiusTexels / directionalLightShadows[ 0 ].shadowMapSize;
  float z = c.z + directionalLightShadows[ 0 ].shadowBias;
  float r = interleavedGradientNoise(gl_FragCoord.xy) * 6.2831853;
  vec2 o1 = vec2(cos(r), sin(r)) * ts;
  vec2 o2 = vec2(-o1.y, o1.x);
  return 0.25 * (
    texture(directionalShadowMap[ 0 ], vec3(c.xy + o1, z)) +
    texture(directionalShadowMap[ 0 ], vec3(c.xy - o1, z)) +
    texture(directionalShadowMap[ 0 ], vec3(c.xy + o2 * 0.5, z)) +
    texture(directionalShadowMap[ 0 ], vec3(c.xy - o2 * 0.5, z)));
#else
  return 1.0;
#endif
}
`;

export const bodyFragmentColor = /* glsl */ `
gNV = saturate(dot(normalize(vViewPosition), normalize(vNormal)));
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
  // key light caustics + sub-surface light transport
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec3 caus = causticsRGB(vFishWorld, nW);
  reflectedLight.directDiffuse *= caus;
  reflectedLight.directSpecular *= mix(vec3(1.0), caus, 0.7);
  vec3 V = normalize(vViewPosition); // toward camera (view space)
  float slMM = vSL * 1000.0;
  // extinction of goldfish tissue (1/mm): red travels furthest, blue is
  // absorbed by blood and scattered out quickly
  vec3 sigma = vec3(0.2, 0.62, 0.95) / max(uTranslucency, 0.05);
  // ---- short-range diffusion: per-channel wrapped lighting (red wraps
  // furthest past the terminator), shadowed from slightly inside the skin
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 lc = directionalLights[0].color;
    vec3 Lw = uCausticLightDir;
    float NL = dot(normal, L);
    vec3 w = vec3(0.55, 0.24, 0.14) * uSSS;
    vec3 wrapD = saturate((vec3(NL) + w) / (1.0 + w)) / (1.0 + w);
    #if FISH_LOD >= 2
      float sScat = 1.0;
    #else
      float sScat = keyShadowAt(vFishWorld + Lw * 0.0025 + nW * 0.0015, 3.0);
    #endif
    vec3 extra = max(wrapD - vec3(saturate(NL)), vec3(0.0));
    reflectedLight.directDiffuse += lc * gFS.albedo * RECIPROCAL_PI * extra * sScat * caus;
    // ---- thin-part transmission of the key light: chord from this point
    // toward the light through the local cross-section; light enters on the
    // lit surface (shadowed there) and exits here, filtered by the tissue
    float cL = sectChord(vRestPos.yz, vLocL.yz, vSect) * slMM;
    vec3 Tr = exp(-sigma * max(cL, 0.35));
    float back = smoothstep(0.2, -0.3, NL);
    float fwd = spow(saturate(dot(V, -L)), 4.0);
    float phase = 0.3 + 1.8 * fwd;
    #if FISH_LOD >= 2
      float sEntry = 1.0;
    #else
      float sEntry = keyShadowAt(vFishWorld + Lw * (cL * 0.001 + 0.003), 2.0);
    #endif
    vec3 transK = lc * gFS.tissue * Tr * (phase * back * sEntry) * RECIPROCAL_PI;
    reflectedLight.directDiffuse += transK * mix(vec3(1.0), caus, 0.5) * 1.6;
  #endif
  // ---- ambient light from behind (water column / surface) diffusing
  // through thin parts toward the viewer: chord along the view ray
  float cV = sectChord(vRestPos.yz, -vLocV.yz, vSect) * slMM;
  float cMin = min(vSect.y, vSect.z) * slMM * 0.6;
  vec3 Tv = exp(-sigma * max(cV, max(cMin, 0.35)));
  // radiance arriving from behind the fish: the real surroundings (probe)
  // plus a little of the hemispherical fill
  vec3 bg = vec3(0.0);
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    bg += getIBLIrradiance(-V);
  #endif
  #if NUM_HEMI_LIGHTS > 0
    float hy = dot(-V, hemisphereLights[0].direction);
    bg += 0.35 * mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.5 + 0.5 * hy);
  #endif
  reflectedLight.indirectDiffuse += bg * gFS.tissue * Tv * 0.45;
  reflectedLight.indirectDiffuse *= gFS.ao;
  reflectedLight.indirectSpecular *= mix(1.0, gFS.ao, 0.8);
  reflectedLight.directDiffuse *= mix(1.0, gFS.ao, 0.5);
  gFS.thin = cV; // debug: view thickness in mm
}
`;

export const bodyFragmentOutput = /* glsl */ `
outgoingLight = waterAttenuate(outgoingLight, vFishWorld);
if (uDebugView > 0.5) {
  if (uDebugView < 1.5) outgoingLight = normalize(inverseTransformDirection(normal, viewMatrix)) * 0.5 + 0.5;
  else if (uDebugView < 2.5) outgoingLight = gFS.albedo;
  else if (uDebugView < 3.5) outgoingLight = gFS.nT * 0.5 + 0.5;
  else outgoingLight = vec3(exp(-gFS.thin * 0.2), exp(-gFS.thin * 0.62), exp(-gFS.thin * 0.95));
}
`;
