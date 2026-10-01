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
in vec3 aMorphProt;
in vec4 aSect;
uniform vec3 uCausticLightDir;

VOUT vec3 vRestPos;
VOUT vec3 vSect;   // local elliptic cross-section: centre y, half width, half height (rest SL units)
VOUT vec4 vHead;   // mouth gape, protrusion, throat expansion, yawn
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
  vec4 m4 = rigMisc(4); // protrusion, throat, yawn, -
  vec3 p = position + aMorphMouth * m0.x + aMorphProt * (m0.x * m4.x) + aMorphOperc * operc;
  p += normal * aSect.w * m4.y; // hyoid / branchiostegal (throat) expansion
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
  vSect = aSect.xyz;
  vHead = vec4(m0.x, m4.x, m4.y, m4.z);
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
in vec4 vHead;
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
// (sarasaField() lives in noiseCommon: the fins sample it at their base)
vec3 bodyPigment(vec3 rp, float red, out float whiteness, out vec3 specTint) {
  float type = vFishA.z;
  // dorso-ventral coordinate of the local cross-section (-1 belly .. +1
  // dorsal ridge), so the gradient follows the body all the way to the tail
  float a = clamp(mix(rp.y / 0.17, vMask2.y, 0.6), -1.0, 1.0);
  float hueShift = vFishB.y;
  // sarasa patches are a deep, saturated red; solid red fish vary individually
  // toward orange
  vec3 redCol = type < 0.5 ? uColRed : mix(uColRed, uColOrange, clamp(0.25 + hueShift, 0.0, 1.0) * 0.55);
  // carotenoid density follows the dorsal-ventral axis: deep crimson along
  // the back, the base red-orange on the flank, orange to a pale
  // yellow-orange toward the belly (p12_1, p42_1)
  vec3 crimson = redCol * vec3(0.74, 0.44, 0.52);
  vec3 bellyCol = mix(uColOrange, uColYellow, 0.45);
  vec3 redGrad = mix(redCol, crimson, smoothstep(0.1, 0.9, a));
  redGrad = mix(redGrad, bellyCol, smoothstep(-0.1, -0.75, a) * 0.75);
  redGrad = mix(redGrad, vec3(0.85, 0.5, 0.2), smoothstep(-0.6, -1.0, a) * 0.4);
  // large, soft density variation of the chromatophore field (+-10 %) and a
  // fine xanthophore / melanophore grain
  vec3 bq = rp * vec3(7.0, 9.0, 9.0) + vec3(vFishA.w * 3.1);
  float blot = 0.65 * vnoise3(bq) + 0.35 * vnoise3(bq * 2.3 + 5.1);
  float grain = vnoise3(rp * 260.0 + vFishA.w);
  vec3 pigVar = vec3(1.0) + vec3(0.1, 0.13, 0.16) * (blot - 0.5) * 2.0;
  pigVar *= 1.0 - 0.06 * smoothstep(0.55, 0.85, grain);
  vec3 col; whiteness = 0.0;
  if (type < 0.5) {
    // sarasa: red patches on pearly white
    vec3 white = uColWhite * mix(vec3(1.0), vec3(1.0, 0.95, 0.84), 0.35 * smoothstep(0.0, 0.5, red));
    vec3 patchCol = redGrad * pigVar;
    col = mix(white, patchCol, red);
    whiteness = 1.0 - red;
  } else if (type < 1.5) {
    col = redGrad * pigVar;
  } else if (type < 2.5) {
    col = mix(uColOrange, uColYellow, 0.22 + smoothstep(-0.2, -0.9, a) * 0.45);
    col = mix(col, uColRed, smoothstep(0.3, 0.95, a) * 0.3) * pigVar;
  } else if (type < 3.5) {
    // "yellow" goldfish are a golden yellow-orange (xanthophores with a
    // little carotenoid), never lemon yellow; paler toward the belly
    vec3 gold = mix(uColOrange, uColYellow, 0.58);
    gold = mix(gold, vec3(dot(gold, vec3(0.3, 0.59, 0.11))), 0.12);
    col = mix(gold, vec3(0.8, 0.6, 0.3), smoothstep(-0.3, -0.95, a) * 0.5);
    col = mix(col, uColOrange * vec3(0.9, 0.7, 0.6), smoothstep(0.3, 0.95, a) * 0.35) * pigVar;
  } else {
    // white: guanine over pale flesh — a faint lavender-pink, not chalk
    col = uColWhite * vec3(1.0, 0.955, 0.955);
    whiteness = 1.0;
  }
  // dorsal darkening / ventral lightening (countershading from chromatophore density)
  col *= mix(mix(0.7, 0.88, whiteness), 1.05, smoothstep(0.9, -0.6, a));
  vec3 pig = col / max(max(col.r, col.g), max(col.b, 1e-3));
  // light reflected by the guanine under a carotenoid layer crosses that
  // layer once: gold-orange (diffuse light crosses it twice: crimson);
  // iridophore-only white scales reflect a faintly bluish silver
  specTint = mix(mix(pig * pig, vec3(1.0, 0.6, 0.22), 0.45), vec3(0.93, 0.96, 1.0), whiteness);
  return col;
}

// ---------------------------------------------------------------- scales -----
struct ScaleHit { vec2 q; vec2 id; float d; float dPrev; };

// Imbricate cycloid scales on a staggered grid (U: along body, V: around).
// The anterior-most scale covering a point is on top (roof-tile overlap),
// so the visible boundaries are the scalloped free (posterior) margins.
ScaleHit scaleLookup(vec2 uv) {
  // radius 1.0 against a unit column spacing: each scale is overlapped by
  // the ones in front so only its posterior ~half (the "exposed field") shows
  const float R = 1.0;
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
      // the free (posterior) margin is blunt-pointed rather than circular,
      // so the overlapping margins form the rhombic net seen on goldfish
      vec2 qa = abs(q * vec2(1.0, 1.25));
      float d = (q.x > 0.0 ? pow(pow(qa.x, 1.7) + pow(qa.y, 1.7), 1.0 / 1.7) : length(qa)) / rr;
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
  float fwm = max(fw.x, fw.y);
  float detail = (1.0 - smoothstep(0.12, 0.42, fwm)) * scaleMask;
  // Band-limited stand-in for the scale net once single scales get small on
  // screen (and for distant LODs): the three lowest lattice frequencies of
  // the staggered scale grid, peaking on the exposed fields (half a scale
  // behind the centres), each attenuated by its own pixel footprint. The
  // texture fades gradually into an even sheen instead of vanishing into a
  // smooth plastic surface.
  vec2 lu = vScaleUV - vec2(1.0, 0.0);
  float bl1 = exp(-3.0 * fwm * fwm);
  float bl2 = exp(-3.0 * fwm * fwm * 1.25);
  float netF = (cos(6.2831853 * lu.x) * bl1 + (cos(6.2831853 * (0.5 * lu.x + lu.y)) + cos(6.2831853 * (0.5 * lu.x - lu.y))) * bl2) * (1.0 / 3.0);
  netF *= scaleMask * (1.0 - detail);
  // per-scale sparkle survives down to scales a couple of pixels wide (the
  // relief fades much earlier): every scale is tilted a little differently
  // and reflects a little more or less, so the sheen breaks into glints
  float sparkle = (1.0 - smoothstep(0.35, 0.9, fwm)) * scaleMask;
#if FISH_LOD >= 2
  // distant fish: no per-scale lookup, just the cell of the staggered grid
  detail = 0.0;
  float cI = floor(vScaleUV.x - 0.5);
  ScaleHit sh; sh.q = vec2(0.0); sh.id = vec2(cI, floor(vScaleUV.y - 0.5 * mod(cI, 2.0) + 0.5)); sh.d = 0.5; sh.dPrev = 9.0;
#else
  ScaleHit sh = scaleLookup(vScaleUV);
#endif
  vec3 rnd = hash32(sh.id + seed * 17.0);
  float d = sh.d;
  vec2 q = sh.q;

  // height-field gradient of one scale: a thin, nearly flat bony plate,
  // lifted toward its free (posterior) margin which rolls down onto the next
  // scale; the character comes from each plate's own tilt and rim.
  vec2 grad = vec2(0.035, 0.0);
  grad += -0.024 * q * vec2(1.0, 1.56);
  float edge = smoothstep(0.9, 1.0, d);
  vec2 rad = normalize(q * vec2(1.0, 1.56) + 1e-5);
  grad -= rad * edge * 0.1;
  // regenerated scales (lost and regrown): irregular, no radii, duller
  float regen = step(0.972, rnd.z * 0.5 + hash12(sh.id * 3.1 + seed) * 0.5 + 0.02);
  // per-scale orientation: small (scales lie in a smooth, well-aligned
  // sheet); larger only on regenerated scales
  // Once single scales are only a few pixels wide their own relief is lost,
  // but each still has its own tilt: a larger tilt spread there turns the
  // smooth highlight into individual glints (sparkle) as in photographs.
  vec2 jit = (rnd.xy - 0.5) * mix(0.06, 0.13, regen) * mix(1.0, 3.0, smoothstep(0.15, 0.5, fwm)); // (added below)
  // the focus lies under the scales in front; on the exposed field only the
  // posterior radii show — fine grooves fanning out to the margin — plus a
  // faint granular texture; circuli run parallel to the free margin
  vec2 foc = q - vec2(-0.42, 0.0);
  float fineFade = 1.0 - smoothstep(0.03, 0.09, max(fw.x, fw.y));
  float ang = atan(foc.y, foc.x);
  float radii = spow(abs(sin(ang * 5.0 + rnd.z * 6.28)), 30.0) * smoothstep(0.4, 0.85, length(foc)) * (1.0 - regen);
  grad += vec2(-sin(ang), cos(ang)) * radii * 0.018 * fineFade; // under epidermis + mucus: faint
  float circ = sin(d * 95.0) * smoothstep(0.55, 0.9, d) * (1.0 - edge);
  grad += rad * circ * 0.004 * fineFade;
  grad += (vec2(vnoise2(q * 23.0 + rnd.xy * 40.0), vnoise2(q * 23.0 + rnd.yz * 40.0 + 7.0)) - 0.5) * 0.01 * fineFade * smoothstep(-0.1, 0.4, q.x);
  // lateral line: a canal tube on each scale of the lateral-line row,
  // opening at a pore on the exposed field
  float llRow = step(abs(sh.id.y), 0.5) * step(-0.5, sh.id.x);
  vec2 pq = (q - vec2(0.12, 0.0)) * vec2(0.55, 2.6);
  float tube = llRow * smoothstep(0.2, 0.06, length(pq));
  grad += llRow * normalize(pq + 1e-5) * tube * 0.07;

  // thin shadow cast by the overlapping margin of the scale in front
  float marginShadow = 1.0 - smoothstep(1.0, 1.09, sh.dPrev);
  float ao = mix(1.0, 1.0 - 0.16 * marginShadow, detail);

  // ---- pigment pattern (snapped partly to scale boundaries)
  float cover = vFishB.x;
  float red = 0.0;
  if (vFishA.z < 0.5) {
    float v = sarasaField(rp, seed);
    // pigment borders partly follow the scales in real sarasa comets: blend
    // in the field at the scale centre and a per-scale threshold jitter,
    // so border scales are irregularly in or out, without a grid staircase
    vec3 rp2 = rp + vec3(q.x * 0.0255, -q.y * 0.03, 0.0);
    float vScale = sarasaField(rp2, seed) + (rnd.y - 0.5) * 0.07;
    v = mix(v, vScale, 0.12 * scaleMask * detail);
    // crisp but ragged borders: scale-frequency raggedness that does not
    // follow the scale grid, and now and then an isolated red scale
    v += (vnoise2(vScaleUV * 1.3 + seed) - 0.5) * 0.05;
    v += step(0.986, hash12(sh.id * 2.71 + seed * 3.3)) * 0.14 * scaleMask;
    float th = 1.0 - cover;
    float bw = max(0.012, fwidth(v) * 0.75);
    red = smoothstep(th - bw, th + bw, v);
  }
  float whiteness; vec3 specTint;
  vec3 col = bodyPigment(rp, red, whiteness, specTint);
  // white (iridophore-only) scales are thinner, lie flatter and are more
  // uniformly aligned:
  // softer relief and much less per-scale tilt, so they read as a fine net
  // with a continuous pearly sheen instead of a sequin mosaic
  // (relief fades with the scale size on screen, the per-scale tilt later)
  // White scales are mirror-like: the slightest tilt changes what they
  // reflect, so their relief and tilt are kept very small (a fine net with a
  // continuous silver sheen, not a mosaic of sequins).
  vec3 nT = normalize(vec3(-(grad * mix(1.0, 0.2, whiteness) * detail + jit * mix(1.0, 0.18, whiteness) * sparkle) * uScaleIntensity, 1.0));
  // per-scale pigment variation (subtle) and a thin darker net along the
  // free margins: melanophores / the overlap shadow (p12_1)
  col *= mix(1.0, 0.98 + 0.04 * rnd.z, detail);
  col *= mix(1.0, mix(0.9, 0.97, whiteness), regen * detail);
  // lateral-line pore: a tiny dark opening at the end of the canal
  col *= 1.0 - 0.14 * llRow * smoothstep(0.05, 0.015, length((q - vec2(0.3, 0.0)) * vec2(1.0, 2.0))) * detail;
  col *= 1.0 - (0.28 * edge + 0.15 * marginShadow) * (1.0 - whiteness) * detail;
  // reticulated slightly darker margins on white scales (fewer iridophores at the edge)
  col *= mix(1.0, 0.93, (edge * 0.5 + marginShadow * 0.5) * whiteness * detail);
  // far: the averaged net (darker pockets between the exposed fields)
  col *= 1.0 + netF * mix(0.11, 0.06, whiteness);

  // guanine reflector strength (metallic scale type, some duller scales)
  // (pigmented scales reflect much less: the carotenoid layer on top keeps
  // red patches saturated; per-scale jitter ±10 % up close, ±25 % as sparkle
  // at mid range; far away the averaged net modulates the sheen)
  float jitR = mix(1.0, 0.75 + 0.5 * rnd.x, sparkle * mix(1.0, mix(0.4, 0.2, whiteness), detail));
  // (duller regenerated / odd scales: much subtler on white, whose mirror
  // reflection would turn every dull scale into a dark tile)
  float refl = uGuanine * mix(1.0, mix(0.7, 0.9, whiteness), regen) * jitR * mix(0.55, 1.05, whiteness);
  refl *= mix(1.0 + 0.3 * netF, mix(1.0, 0.85, edge) * (rnd.y < 0.03 ? mix(0.82, 0.94, whiteness) : 1.0), detail);
  // head: iridophores on operculum/cheek give a softer golden sheen
  // the opercle is a pearly plate: guanine-rich, smooth, no scales
  float headSheen = uGuanine * (0.16 + 0.75 * operc + 0.2 * smoothstep(0.1, -0.6, a));
  refl = mix(headSheen, refl, scaleMask);
  // belly: silvery stratum argenteum
  refl *= mix(1.0, 1.25, smoothstep(-0.3, -0.9, a));

  vec3 spec = specTint * refl;
  // white (iridophore-only) scales are smoother, more mirror-like reflectors
  float rough = uRoughness * mix(0.93, 1.07, rnd.z) * mix(1.0, 0.82, whiteness);
  rough = mix(uRoughness * 1.55, rough, scaleMask);
  // lost relief / sub-pixel tilt spread widens the lobe (Toksvig-like),
  // mostly once the per-scale glints are gone too
  // While single scales are resolved but their relief is not (mid range),
  // each scale acts as a small, fairly smooth mirror with its own tilt:
  // a tighter lobe there gives distinct glints instead of one broad sheen.
  rough = mix(rough, min(rough, 0.24), sparkle * (1.0 - detail));
  rough += (0.04 * (1.0 - detail) + 0.08 * (1.0 - sparkle)) * scaleMask;

  // ---- lips, buccal cavity, gill slit, orbit
  float sB = -rp.x; // axial position (rest)
  if (lip > 0.0) {
    // outer lips keep the body colour but paler and fleshier; the rolled lip
    // margin at the gape is pale pink (lower lip and chin palest), wet
    vec3 lipOuter = mix(col, col * vec3(1.02, 0.9, 0.86) + vec3(0.07, 0.05, 0.05), 0.45);
    vec3 lipInner = mix(vec3(0.62, 0.4, 0.37), col * vec3(1.0, 0.78, 0.72), 0.35 * (1.0 - whiteness));
    float margin = smoothstep(0.005, 0.0008, sB);
    float lowerLip = smoothstep(0.1, -0.5, a);
    vec3 lc = mix(lipOuter, lipInner, clamp(margin * mix(0.75, 1.0, lowerLip) + lowerLip * 0.25 * lip, 0.0, 1.0));
    col = mix(col, lc, lip);
    spec *= 1.0 - 0.75 * lip;
    rough = mix(rough, 0.24, lip);
  }
  if (lip < -0.5) {
    // buccal cavity: pale pink mucosa behind the lips, blood-red chamber,
    // dark pharynx; a paler basihyal pad on the floor, transverse palatal
    // folds on the roof, and the gill arches (red, with pale rakers) at the back
    float c = clamp(sB / 0.075, 0.0, 1.0);
    vec3 muc = mix(vec3(0.88, 0.55, 0.52), vec3(0.64, 0.19, 0.17), smoothstep(0.04, 0.45, c));
    muc = mix(muc, vec3(0.2, 0.035, 0.035), smoothstep(0.55, 1.0, c));
    muc = mix(muc, vec3(0.92, 0.66, 0.6), smoothstep(-0.25, -0.75, a) * smoothstep(0.06, 0.2, c) * smoothstep(0.62, 0.36, c) * 0.65);
    muc *= mix(1.0, 0.9 + 0.1 * (0.5 + 0.5 * sin(c * 55.0)), smoothstep(0.2, 0.75, a) * smoothstep(0.5, 0.12, c));
    // gill arches: a few soft red ridges at the back of the pharynx
    float arches = smoothstep(0.6, 0.72, c) * (1.0 - smoothstep(0.92, 1.0, c));
    float bar = smoothstep(0.35, 0.9, 0.5 + 0.5 * cos((c - 0.6) * 6.2831853 * 9.0));
    muc = mix(muc, mix(vec3(0.36, 0.04, 0.05), vec3(0.7, 0.13, 0.13), bar), arches * 0.7);
    col = muc;
    spec = vec3(0.035);
    rough = 0.2;
    ao = mix(0.9, 0.22, smoothstep(0.15, 1.0, c));
  }
  // ---- gill opening: when the operculum abducts, the stretched slit shows
  // the gill filaments (primary lamellae, stacked dorso-ventrally, tips
  // pointing back) — bright blood red, wet, darker deeper inside — and
  // ventrally the pale branchiostegal membrane
  float eG = vMask.w; // distance behind the free opercular margin (SL)
  float gOpen = clamp(vOpercOpen, 0.0, 2.0);
  float slit = smoothstep(-0.0012, 0.0015, eG) * smoothstep(0.016, 0.005, eG);
  {
    float filAA = 1.0 - smoothstep(0.5, 1.2, fwidth(rp.y * 1050.0) / 6.2831853);
    float filPh = rp.y * 1050.0 + vnoise2(vec2(rp.y * 260.0, seed)) * 4.0 + eG * 900.0 * (vnoise2(vec2(rp.y * 140.0, 3.0 + seed)) - 0.5);
    float fil = mix(0.5, 0.5 + 0.5 * cos(filPh), filAA);
    float deep = smoothstep(0.011, 0.002, eG);
    vec3 filCol = uColGill * mix(1.3, 0.95, fil) * mix(1.0, 0.45, deep * deep);
    float bsm = smoothstep(-0.055, -0.085, rp.y); // branchiostegal membrane
    filCol = mix(filCol, vec3(0.86, 0.6, 0.58) * mix(1.0, 0.6, deep), bsm);
    // (only a strong abduction opens the slit far enough to show red gills)
    float show = slit * smoothstep(0.12, 0.7, gOpen) * 0.85;
    col = mix(col, filCol, show);
    nT = normalize(nT + vec3(0.0, sin(filPh) * 0.16 * (1.0 - bsm) * filAA, 0.0) * show);
    spec = mix(spec, vec3(0.04), show);
    rough = mix(rough, 0.22, show);
    // closed cover: only the soft contact shadow under the step of the plate
    ao *= 1.0 - gill * 0.14 * (1.0 - show) - show * deep * 0.5;
  }
  // opercular membrane: the thin free edge of the gill cover is translucent,
  // so the blood of the gills behind it tints it a little pinker (a soft
  // band, not a drawn stroke); opercle bone: only very faint radiating striae
  float memb = smoothstep(-0.013, -0.003, eG) * smoothstep(0.0015, -0.0015, eG) * operc;
  col = mix(col, col * vec3(1.0, 0.8, 0.8), memb * 0.3);
  spec *= 1.0 - 0.3 * memb;
  if (operc > 0.01) {
    vec2 hv = vec2(sB - 0.19, rp.y - 0.055);
    float rang = atan(hv.y, hv.x);
    float striae = spow(abs(sin(rang * 46.0 + vnoise2(hv * 90.0) * 1.5)), 6.0);
    float wOp = operc * smoothstep(-0.004, -0.02, eG);
    nT = normalize(nT + vec3(-sin(rang), cos(rang), 0.0) * (striae - 0.3) * 0.018 * wOp);
    col *= 1.0 + (striae - 0.3) * 0.015 * wOp;
  }
  // nostrils: the paired nares in front of the eye are small dark openings
  // under a pale flap
  {
    float dn = length(vec2(sB - NARE_S, rp.y - NARE_Y));
    float nare = smoothstep(0.0065, 0.0018, dn) * smoothstep(0.012, 0.022, abs(rp.z));
    col *= 1.0 - 0.5 * nare;
    ao *= 1.0 - 0.35 * nare;
  }
  // fleshy orbital rim is pale and less reflective
  // skin around the eye: a little darker and duller (pigmented orbital skin;
  // no pale ring that would frame the eye like a bead)
  col *= 1.0 - 0.12 * orbit;
  spec *= 1.0 - 0.35 * orbit;

  // ---- head skin: fine micro-relief and mottled chromatophores (no scales)
  float headSkin = 1.0 - scaleMask;
  if (headSkin > 0.01 && lip > -0.5) {
    vec3 hp = rp * 180.0;
    float mn = vnoise3(hp) - 0.5;
    float mn2 = vnoise3(hp * 2.7 + 3.1) - 0.5;
    nT = normalize(nT + vec3(mn, mn2, 0.0) * 0.08 * headSkin);
    // uneven iridophore / chromatophore density: soft mottling of tone and
    // a patchy, broken sheen instead of one smooth plastic highlight
    float mot = vnoise3(rp * 55.0 + seed);
    float mot2 = vnoise3(rp * 21.0 + seed * 1.7 + 4.0);
    col *= 1.0 + ((mot - 0.5) * 0.14 + (mot2 - 0.5) * 0.12) * headSkin;
    spec *= 1.0 + ((mot2 - 0.5) * 0.9 + mn * 0.3) * headSkin;
    rough += (mot - 0.5) * 0.12 * headSkin;
  }
  // ventral xanthophore wash behind the pectorals (yellowish belly in sarasa)
  float bellyY = smoothstep(-0.2, -0.75, a) * smoothstep(0.2, 0.36, -rp.x) * smoothstep(0.62, 0.42, -rp.x);
  col = mix(col, col * vec3(1.05, 0.95, 0.62), bellyY * 0.35 * whiteness);

  // ---- sub-surface tissue
  // gill blush: blood-filled filaments under the thin opercular bone show
  // through pale skin as a pink flush, strongest toward the free margin
  float blush = operc * whiteness * uTranslucency;
  col = mix(col, col * vec3(1.0, 0.68, 0.7), blush * 0.55);
  // flesh seen through the thin white (iridophore-only) skin: pinkish depth,
  // stronger where the body is thin (peduncle, belly, throat) and when viewed
  // head-on (grazing views see the reflective guanine layer instead)
  float thickW = 2.0 * vSect.y * sqrt(max(0.0, 1.0 - a * a * 0.92)) + 0.006; // lateral thickness at this height
  float fleshThin = 1.0 - smoothstep(0.03, 0.12, thickW);
  float nvB = gNV;
  col = mix(col, col * vec3(1.0, 0.8, 0.8), whiteness * uTranslucency * (0.16 + 0.42 * fleshThin) * (0.4 + 0.6 * nvB));
  // pale belly and throat skin: faint warm flesh tone underneath the guanine
  col = mix(col, col * vec3(1.0, 0.9, 0.86), smoothstep(-0.35, -0.9, a) * whiteness * 0.3 * uTranslucency);
  float thin = 1.0 - smoothstep(0.02, 0.16, thickW);
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
  // (white skin: rosy rather than orange; its dense iridophores send much of
  // the light back inside)
  interior = mix(interior, vec3(1.0, 0.74, 0.72), whiteness * 0.6);
  vec3 exitF = mix(pig * pig, vec3(1.0), 0.18) * mix(0.95, 0.45, whiteness);

  gFS.albedo = col;
  gFS.rough = clamp(rough, 0.06, 1.0);
  gFS.spec = spec;
  gFS.irid = uIridescence * mix(0.35, 1.0, whiteness) * mix(0.6 + 0.4 * rnd.y, 0.93 + 0.07 * rnd.y, whiteness) * mix(0.4, 1.0, max(scaleMask, operc * 0.85));
  // film thickness: a narrow spread (warm gold to pale green glints on
  // pigmented scales); white scales keep a uniform pearly film
  gFS.iridThick = mix(mix(330.0, 420.0, rnd.x), mix(378.0, 394.0, rnd.x), whiteness);
  // the tangent frame mirrors at the dorsal / ventral midline: fade the
  // perturbation there so no seam shows (e.g. under the lower lip)
  float midFade = smoothstep(0.02, 0.2, sqrt(max(0.0, 1.0 - a * a)));
  gFS.nT = normalize(mix(vec3(0.0, 0.0, 1.0), nT, midFade));
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
// scalar F0 with F90 = 1 (Schlick on the reflector strength); the colour of
// the reflection is applied after the lighting (gFS.spec / max), so grazing
// reflections on red skin stay gold-red instead of turning white
float gSpecMax = max(max(gFS.spec.r, gFS.spec.g), max(gFS.spec.b, 1e-4));
material.specularColor = vec3(gSpecMax);
material.specularColorBlended = vec3(gSpecMax);
material.specularF90 = 1.0;
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
    vec3 transK = lc * gFS.tissue * Tr * (phase * back * sEntry) * RECIPROCAL_PI * 1.6;
    // never brighter than 1.5x the lit diffuse level (no glowing rims)
    transK = min(transK, 1.5 * lc * max(gFS.albedo, vec3(0.15)) * RECIPROCAL_PI);
    reflectedLight.directDiffuse += transK * mix(vec3(1.0), caus, 0.5);
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
  {
    vec3 tS = gFS.spec / max(max(gFS.spec.r, gFS.spec.g), max(gFS.spec.b, 1e-4));
    reflectedLight.directSpecular *= tS;
    reflectedLight.indirectSpecular *= tS;
  }
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
