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
VFLAT float vTone; // packed pigment tone (darkness, saturation, belly paleness)

vec3 gFishPos;
vec3 gFishNormal;

void fishDeform() {
  vFishRow = aFishRow;
  vec4 m0 = rigMisc(0); // mouthOpen, opercL, opercR, SL
  vec4 m1 = rigMisc(1); // depthScale, widthScale, colorType, seed
  float side = aMask2.z;
  float operc = side > 0.0 ? m0.y : m0.z;
  vec4 m4 = rigMisc(4); // protrusion, throat, yawn, pigment tone
  vec3 p = position + aMorphMouth * m0.x + aMorphProt * (m0.x * m4.x) + aMorphOperc * operc;
  p += normal * aSect.w * m4.y; // hyoid / branchiostegal (throat) expansion
  vec3 n = normalize(normal + aMorphMouthN * m0.x);
  // individual depth applies to the trunk only (the head keeps the standard
  // profile): k(s) eases from 1 at s = 0.16 to depthScale at s = 0.36
  // (trunkDepthK in Fish.js); the normal gets the matching shear term
  float s = -p.x;
  float kx = clamp((s - 0.16) / 0.2, 0.0, 1.0);
  float dk = m1.x - 1.0;
  float kS = 1.0 + dk * kx * kx * (3.0 - 2.0 * kx);
  float kD = dk * 6.0 * kx * (1.0 - kx) / 0.2; // dk/ds
  vec3 sc = vec3(1.0, kS, m1.y);
  // y' = y k(s), s = -x: inverse-transpose of the Jacobian
  n = vec3(n.x + n.y * p.y * kD / kS, n.y / kS, n.z / m1.y);
  float yRest = p.y;
  p.yz *= sc.yz;
  n = normalize(n);
  float s0 = clamp(s, 0.0, 1.0);
  vec3 P; vec4 Q;
  spineSample(s0, P, Q);
  vec3 local = vec3(-(s - s0), p.y, p.z) * m0.w;
  gFishPos = P + qrot(Q, local);
  gFishNormal = qrot(Q, n);
  vec3 t = aTangent; t.y = t.y * kS - yRest * kD * t.x; t.z *= sc.z;
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
  vTone = m4.w;
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
flat in float vTone;
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
  float l = length(q);
  q /= max(l, 1e-4); // project onto the ellipse
  vec2 dd = vec2(d.x / sect.z, d.y / sect.y);
  float a = max(dot(dd, dd), 1e-6);
  float b = dot(q, dd);
  float cs = b < 0.0 ? -2.0 * b / a : 0.0;
  // points far inside the local ellipse (the lips and the front of the
  // snout, where the section says little) have no defined projection: the
  // chord flips there (a dark dot on the lip). Use the half chord through
  // the centre for them instead.
  float ch = mix(inversesqrt(a), cs, smoothstep(0.3, 0.7, l));
  // rays running along the body (front / rear views) cross it lengthwise:
  // the cylinder model does not hold there, and its chord flips between
  // zero and the cap across the face
  return min(mix(0.6, ch, smoothstep(0.2, 0.55, length(d))), 0.6);
}

// ---------------------------------------------------------------- pattern ----
// colorType: 0 sarasa (red/white), 1 red, 2 orange, 3 yellow, 4 white
// (sarasaField() lives in noiseCommon: the fins sample it at their base)
// individual pigment tone, decoded from the packed misc value (0..1 each)
vec3 fishTone() {
  float t = vTone;
  return vec3(floor(t / 4096.0), mod(floor(t / 64.0), 64.0), mod(t, 64.0)) / 63.0;
}

// pearly white skin (white fish and sarasa white): a warm-neutral diffuse
// base (pale flesh under a dense iridophore layer) shared by the scaled body
// and the scaleless head, so both read as one continuous material
vec3 pearlWhite() { return uColWhite * vec3(1.0, 0.97, 0.92); }

vec3 bodyPigment(vec3 rp, float red, out float whiteness, out vec3 specTint) {
  float type = vFishA.z;
  vec3 tone = fishTone(); // x darkness, y saturation, z belly paleness
  // dorso-ventral coordinate of the local cross-section (-1 belly .. +1
  // dorsal ridge), so the gradient follows the body all the way to the tail
  float a = clamp(mix(rp.y / 0.17, vMask2.y, 0.6), -1.0, 1.0);
  float hueShift = vFishB.y;
  // sarasa patches are a deep red with a modest individual spread (blood
  // red .. orange-red); solid red fish range from blood red to orange
  float oMix = clamp(0.25 + hueShift, 0.0, 1.0);
  vec3 redCol = type < 0.5 ? mix(uColRed, uColOrange, oMix * 0.3) : mix(uColRed, uColOrange, oMix * 0.95);
  // carotenoid density: denser pigment absorbs more green / blue (crimson,
  // darker), sparse pigment lets the guanine underneath lift it (orange)
  vec3 deep = mix(vec3(1.12, 1.45, 1.3), vec3(0.62, 0.32, 0.44), tone.x);
  redCol *= type < 0.5 ? mix(vec3(1.0), deep, 0.5) : deep;
  // carotenoid density follows the dorsal-ventral axis (p12_1, p42_1):
  // deep crimson along the back, red-orange on the flank, yellow-orange
  // toward the belly, pale golden cream on the ventral keel
  float gS = type < 0.5 ? 0.6 : 1.0; // sarasa red is deeper and more even (p40_1)
  vec3 flank = mix(redCol, uColOrange, 0.2 * gS * (1.0 - 0.6 * tone.x));
  vec3 crimson = redCol * vec3(0.72, 0.36, 0.46);
  vec3 bellyCol = mix(uColOrange, uColYellow, 0.4 + 0.35 * tone.z);
  vec3 redGrad = mix(flank, crimson, smoothstep(0.05, 0.85, a) * mix(0.75, 1.0, gS));
  redGrad = mix(redGrad, bellyCol, smoothstep(-0.05, -0.7, a) * 0.8 * gS);
  redGrad = mix(redGrad, vec3(0.86, 0.6, 0.34), smoothstep(-0.55, -1.0, a) * (0.2 + 0.45 * tone.z) * gS);
  // individual saturation (clean .. a little dusky; never the fully clean
  // vermilion of a dyed plastic: the photographed reds carry some grey)
  float sat = mix(0.72, 0.94, tone.y);
  redGrad = mix(vec3(dot(redGrad, vec3(0.2126, 0.7152, 0.0722))), redGrad, sat);
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
    vec3 patchCol = redGrad * pigVar;
    col = mix(pearlWhite(), patchCol, red);
    whiteness = 1.0 - red;
  } else if (type < 1.5) {
    col = redGrad * pigVar;
    // some red comets are bicoloured: a pearly white belly / throat under
    // the red (sharpish but soft lateral border, noise-broken)
    float wb = step(0.84, tone.z);
    float wEdge = -0.25 + 0.2 * (vnoise3(rp * vec3(9.0, 14.0, 14.0) + vFishA.w) - 0.5);
    float wBelly = wb * smoothstep(wEdge + 0.08, wEdge - 0.12, a);
    col = mix(col, pearlWhite(), wBelly);
    whiteness = wBelly;
  } else if (type < 2.5) {
    vec3 o = mix(uColOrange, uColYellow, 0.12 + 0.2 * oMix) * mix(vec3(1.0), deep, 0.5);
    col = mix(o, mix(uColYellow, vec3(0.86, 0.62, 0.34), 0.3), smoothstep(-0.2, -0.9, a) * (0.4 + 0.3 * tone.z));
    col = mix(col, o * vec3(0.85, 0.55, 0.45), smoothstep(0.3, 0.95, a) * 0.45);
    col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, sat) * pigVar;
  } else if (type < 3.5) {
    // "yellow" goldfish are a golden yellow-orange (xanthophores with a
    // little carotenoid), never lemon yellow; paler toward the belly
    vec3 gold = mix(uColOrange, uColYellow, 0.5 + 0.18 * tone.z);
    gold = mix(gold, vec3(dot(gold, vec3(0.3, 0.59, 0.11))), mix(0.18, 0.06, tone.y));
    col = mix(gold, vec3(0.8, 0.6, 0.3), smoothstep(-0.3, -0.95, a) * 0.5);
    col = mix(col, uColOrange * vec3(0.9, 0.7, 0.6), smoothstep(0.3, 0.95, a) * 0.4) * pigVar;
  } else {
    // white: guanine over pale flesh — warm pearl, not chalk or grey chrome
    col = pearlWhite();
    whiteness = 1.0;
  }
  // dorsal darkening / ventral lightening (countershading from chromatophore
  // density; white skin only a little)
  col *= mix(mix(0.72, 0.92, whiteness), 1.05, smoothstep(0.9, -0.6, a));
  // white skin: the belly underside carries fewer iridophore layers (the
  // pale flesh shows): a gentle darker, warmer gradient below the flank
  col *= mix(vec3(1.0), vec3(0.9, 0.88, 0.88), smoothstep(-0.45, -0.95, a) * whiteness);
  vec3 pig = col / max(max(col.r, col.g), max(col.b, 1e-3));
  // light reflected by the guanine under a carotenoid layer crosses that
  // layer once: gold-orange (diffuse light crosses it twice: crimson);
  // iridophore-only white scales reflect a warm-neutral pearly silver
  // (dense, deep red pigment keeps even the sheen red; sparse orange
  // pigment lets more gold through, so the individual tone survives the
  // reflection instead of every fish turning the same sheened orange)
  float goldMix = type < 0.5 ? 0.16 : 0.05 + 0.22 * (1.0 - tone.x);
  specTint = mix(mix(pig * pig, vec3(1.0, 0.6, 0.22), goldMix), vec3(1.0, 0.95, 0.88), whiteness);
  return col;
}

// Melanophore stipple: sparse small dark dots (one candidate per 3D cell,
// kept inside its cell, so no neighbour search). p in cell units; returns
// dot coverage 0..1, antialiased and faded out once a cell is under ~3 px.
float stipple(vec3 p, float density) {
  vec3 c = floor(p);
  float h = hash13(c + 17.0);
  vec3 o = vec3(hash13(c + 3.1), hash13(c + 5.7), hash13(c + 9.3)) - 0.5;
  float dd = length(fract(p) - 0.5 - o * 0.4);
  float r = 0.12 + 0.14 * hash13(c + 23.0);
  float fwp = max(max(fwidth(p.x), fwidth(p.y)), fwidth(p.z));
  float dotC = 1.0 - smoothstep(r - 0.6 * fwp, r + 0.6 * fwp, dd);
  return dotC * step(h, density) * (1.0 - smoothstep(0.18, 0.36, fwp));
}

// ---------------------------------------------------------------- scales -----
struct ScaleHit { vec2 q; vec2 id; float d; float dPrev; };

// Imbricate cycloid scales on a staggered grid (U: along body, V: around).
// The anterior-most scale covering a point is on top (roof-tile overlap),
// so the visible boundaries are the scalloped free (posterior) margins.
// rk: regional scale size (smaller along the dorsal ridge, the belly and the
// peduncle, larger on the mid-flank), evaluated once per pixel.
ScaleHit scaleLookup(vec2 uv, float rk) {
  // radius 1.0 against a unit column spacing: each scale is overlapped by
  // the ones in front so only its posterior ~half (the "exposed field") shows
  const float R = 1.0;
  ScaleHit h; h.d = 9.0; h.dPrev = 9.0; h.q = vec2(0.0); h.id = vec2(0.0);
  float i0 = floor(uv.x - 0.5 - R - 0.1);
  bool found = false;
  float fbD = 9.0; vec2 fbQ = vec2(0.0); vec2 fbId = vec2(0.0);
  for (int k = 0; k < 3; k++) {
    float i = i0 + float(k);
    float par = mod(i, 2.0);
    // the rows are not a perfect half-step stagger: each column of scales
    // slides a little up or down against its neighbours (imbrication of
    // real scale rows is irregular; an exact stagger reads as a hex decal)
    float colOff = (hash12(vec2(i, 7.31)) - 0.5) * 0.36;
    float jc = floor(uv.y - 0.5 * par - colOff + 0.5);
    // within a column the dorsal neighbour overlaps the ventral one, so the
    // boundary between them is also a rounded margin (not a Voronoi edge)
    float best = 9.0; vec2 bq = vec2(0.0); vec2 bid = vec2(0.0);
    bool cov = false;
    for (int m = 1; m >= -1; m--) {
      float j = jc + float(m);
      vec2 id = vec2(i, j);
      vec3 jr = hash32(id * 1.37 + 11.0);
      vec3 jr2 = hash32(id * 2.11 + 37.0);
      // no two scales alike: centre, size, outline and orientation vary
      // from scale to scale (a regular lattice reads as a decal)
      vec2 c = vec2(i + 0.5, j + 0.5 * par + colOff) + (jr.xy - 0.5) * vec2(0.24, 0.26);
      vec2 q = uv - c;
      float ra = (jr2.x - 0.5) * 0.38; // +-11 deg
      q = mat2(cos(ra), sin(ra), -sin(ra), cos(ra)) * q;
      float rr = R * rk * (0.86 + 0.3 * jr.z);
      // the free (posterior) margin is blunt-pointed rather than circular,
      // so the overlapping margins form the rhombic net seen on goldfish
      // (some scales rounder, some more pointed)
      vec2 qa = abs(q * vec2(1.0, 1.1 + 0.28 * jr2.y));
      float pe = 1.45 + 0.6 * jr2.z;
      float d = (q.x > 0.0 ? pow(pow(qa.x, pe) + pow(qa.y, pe), 1.0 / pe) : length(qa)) / rr;
      if (!cov && d < 1.0) { cov = true; best = d; bq = q; bid = id; }
      else if (!cov && d < best) { best = d; bq = q; bid = id; }
    }
    if (best < fbD) { fbD = best; fbQ = bq; fbId = bid; }
    if (!found) {
      if (best < 1.0) { found = true; h.d = best; h.q = bq; h.id = bid; }
      else h.dPrev = min(h.dPrev, best);
    }
  }
  // (rare gaps left by the jitter: the nearest scale fills them, at its margin)
  if (!found) { h.d = min(fbD, 0.995); h.q = fbQ; h.id = fbId; }
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
  float a = vMask2.y;

  // ---- scales
  // the scale rows are not a ruled lattice: a slow warp (a few scales in
  // period) bends the rows and columns and lets the scale size drift by
  // about +-15 % over the flank
  vec2 suv = vScaleUV;
  {
    vec2 wq = vScaleUV * vec2(0.19, 0.31) + seed * 0.37;
    suv += (vec2(vnoise2(wq), vnoise2(wq * 1.13 + 5.3)) - 0.5) * vec2(0.7, 0.55)
         + (vec2(vnoise2(wq * 2.7 + 9.1), vnoise2(wq * 2.9 + 2.7)) - 0.5) * vec2(0.18, 0.14);
  }
  vec2 fw = fwidth(vScaleUV);
  float fwm = max(fw.x, fw.y);
  // (the scale relief is kept down to scales ~3 px wide: its margins are
  // antialiased with the pixel footprint below, so it does not shimmer)
  float detail = (1.0 - smoothstep(0.2, 0.55, fwm)) * scaleMask;
  // Band-limited stand-in for the scale net once single scales get small on
  // screen (and for distant LODs): the three lowest lattice frequencies of
  // the staggered scale grid, peaking on the exposed fields (half a scale
  // behind the centres), each attenuated by its own pixel footprint. The
  // texture fades gradually into an even sheen instead of vanishing into a
  // smooth plastic surface.
  vec2 lu = suv - vec2(1.0, 0.0);
  float bl1 = exp(-3.0 * fwm * fwm);
  float bl2 = exp(-3.0 * fwm * fwm * 1.25);
  float netF = (cos(6.2831853 * lu.x) * bl1 + (cos(6.2831853 * (0.5 * lu.x + lu.y)) + cos(6.2831853 * (0.5 * lu.x - lu.y))) * bl2) * (1.0 / 3.0);
  netF *= scaleMask * (1.0 - detail);
  // per-scale sparkle survives down to scales a couple of pixels wide (the
  // relief fades much earlier): every scale is tilted a little differently
  // and reflects a little more or less, so the sheen breaks into glints
  float sparkle = (1.0 - smoothstep(0.5, 1.3, fwm)) * scaleMask;
#if FISH_LOD >= 2
  // distant fish: no per-scale lookup, just the cell of the staggered grid
  detail = 0.0;
  float cI = floor(suv.x - 0.5);
  ScaleHit sh; sh.q = vec2(0.0); sh.id = vec2(cI, floor(suv.y - 0.5 * mod(cI, 2.0) + 0.5)); sh.d = 0.5; sh.dPrev = 9.0;
#else
  // regional scale size: scales are smaller and more crowded along the
  // dorsal ridge, the belly keel and on the peduncle than on the mid-flank,
  // plus a slow patchy drift (clusters of larger / smaller scales)
  float rk = mix(0.9, 1.08, 1.0 - a * a) * mix(1.0, 0.92, smoothstep(0.75, 0.98, -rp.x))
           * mix(0.93, 1.07, vnoise2(suv * 0.16 + seed * 2.9 + 21.0));
  ScaleHit sh = scaleLookup(suv, rk);
#endif
  vec3 rnd = hash32(sh.id + seed * 17.0);
  float d = sh.d;
  vec2 q = sh.q;

  // height-field gradient of one scale: a thin, nearly flat bony plate,
  // lifted toward its free (posterior) margin which rolls down onto the next
  // scale; the character comes from each plate's own tilt and rim.
  vec2 grad = vec2(0.035, 0.0);
  grad += -0.024 * q * vec2(1.0, 1.56);
  // free-margin roll-off, widened to at least ~1.5 px so small scales keep
  // a soft, antialiased net instead of aliasing into speckle
  float edge = smoothstep(1.0 - max(0.1, 1.5 * fwm), 1.0, d);
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

  // the net is not equally marked everywhere: iridophore / melanophore
  // density along the margins drifts over the flank (patches where the
  // net almost vanishes into the sheen, others where it reads clearly)
  float netVar = 0.35 + 1.25 * (0.65 * vnoise2(suv * 0.21 + seed * 1.3 + 11.0) + 0.35 * vnoise2(suv * 0.57 - seed + 3.0));
  // and it is drawn more strongly toward the dorsum (denser margin
  // chromatophores, the scales seen more obliquely), fading on the belly
  netVar *= mix(0.55, 1.35, smoothstep(-0.6, 0.75, a));
  // thin shadow cast by the overlapping margin of the scale in front
  float marginShadow = 1.0 - smoothstep(1.0, 1.0 + max(0.09, 1.5 * fwm), sh.dPrev);
  float ao = mix(1.0, 1.0 - 0.16 * marginShadow, detail);

  // ---- pigment pattern (snapped partly to scale boundaries)
  float cover = vFishB.x;
  float red = 0.0;
  if (vFishA.z < 0.5) {
    // Organic, noise-broken borders: the smooth patch field plus a ragged
    // component at one to three scale widths, sampled on axes rotated off
    // the scale grid (no staircase along rows / columns)
    vec2 ru = mat2(0.8, -0.6, 0.6, 0.8) * vScaleUV;
    float rag = (vnoise2(ru * 0.85 + seed * 1.7) - 0.5) * 0.06
              + (vnoise2(mat2(0.6, -0.8, 0.8, 0.6) * ru * 2.1 + 7.3 - seed) - 0.5) * 0.015;
    float v = sarasaField(rp, seed) + rag * scaleMask;
    // Edge width: about half a scale on the body (soft but defined,
    // as in p40_1 / p42_0) and never under ~1 px, so the border is
    // antialiased at every distance. |grad v| per scale = fwidth(v) / fwidth(uv).
    float fwv = max(fwidth(v), 1e-5);
    float bw = fwv * max(0.9, 0.22 / max(fwm, 1e-3));
    // where single scales are well resolved, border scales lean a little
    // toward all-red or all-white (the pattern partly follows the scales),
    // as a soft bias, never a hard per-scale switch
    vec3 rp2 = rp + vec3(q.x * 0.0255, -q.y * 0.03, 0.0);
    // (no per-scale threshold jitter: its steps are not antialiased and read
    // as a sawtooth / pixel staircase along the border)
    float vScale = sarasaField(rp2, seed) + rag;
    v = mix(v, vScale, 0.15 * scaleMask * detail * (1.0 - smoothstep(0.05, 0.12, fwm)));
    float th = 1.0 - cover;
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
  // reflect. Kept at about 40 % of the relief / tilt of pigmented scales: in
  // photographs of white comets (p12_0, p41_0) the net and the scale-to-scale
  // change of the silver sheen stay clearly visible at every distance; with
  // less, the flank reads as smooth porcelain.
  vec3 nT = normalize(vec3(-(grad * mix(1.0, 0.44 * mix(1.0, netVar, 0.6), whiteness) * detail + jit * mix(1.0, 0.45, whiteness) * sparkle) * uScaleIntensity, 1.0));
  // per-scale pigment variation (subtle) and a thin darker net along the
  // free margins: melanophores / the overlap shadow (p12_1)
  // (white scales differ more: iridophore density varies from scale to scale)
  col *= mix(1.0, mix(0.98 + 0.04 * rnd.z, 0.965 + 0.07 * rnd.z, whiteness), max(detail, 0.6 * sparkle));
  // pigmented scales: each scale carries its own chromatophore density, so
  // neighbouring scales differ in value and a little in hue (denser: deeper
  // crimson; sparser: the guanine lifts it toward orange-gold). Broad enough
  // (a whole exposed field) to survive the lens blur of a close-up.
  float pigS = (1.0 - whiteness) * scaleMask * max(detail, 0.7 * sparkle);
  {
    float sv = rnd.z - 0.5;
    float sv2 = hash12(sh.id * 5.17 + seed * 3.0) - 0.5;
    col *= mix(vec3(1.0), vec3(1.0 + 0.12 * sv, 1.0 + 0.3 * sv + 0.12 * sv2, 1.0 + 0.3 * sv), pigS);
    // the exposed field is lit by the guanine pocket under its centre and
    // darkens toward the free margin (melanophores along the edge)
    col *= mix(1.0, 0.86, smoothstep(0.45, 1.0, d) * pigS);
  }
  // dorsal melanophore / dense-carotenoid mottling on pigmented skin:
  // irregular darker clouds a few scales across, partly snapped to whole
  // scales (sampled at the scale centre), concentrated on the back and
  // fading by mid-flank
  {
    vec2 sc = mix(suv, suv - q * 0.9, 0.75 * detail);
    float mN = 0.6 * vnoise2(sc * 0.42 + seed * 4.1 + 2.0) + 0.4 * vnoise2(sc * 1.05 - seed * 2.3 + 9.0);
    float mot = smoothstep(0.42, 0.78, mN) * smoothstep(-0.1, 0.8, a);
    float mW = (1.0 - whiteness) * mix(0.55, 1.0, scaleMask);
    col *= mix(vec3(1.0), vec3(0.8, 0.62, 0.68), mot * mW * 0.75);
    // fine melanophore stipple over the red, densest on the head top and the
    // back, a few dots down the flank (p40_1: dusky red patches)
#if FISH_LOD < 2
    if (mW > 0.01) {
      float stD = mix(0.05, 0.42, smoothstep(-0.3, 0.9, a)) * (0.5 + mN);
      float st = stipple(rp * 260.0 + seed * 13.0, stD) + 0.6 * stipple(rp * 150.0 - seed * 7.0, stD * 0.4);
      col *= 1.0 - 0.42 * min(st, 1.0) * mW;
    }
#endif
  }
  col *= mix(1.0, mix(0.9, 0.97, whiteness), regen * detail);
  // lateral-line pore: a tiny dark opening at the end of the canal
  col *= 1.0 - 0.14 * llRow * smoothstep(0.05, 0.015, length((q - vec2(0.3, 0.0)) * vec2(1.0, 2.0))) * detail;
  col *= 1.0 - (0.28 * edge + 0.15 * marginShadow) * mix(1.0, netVar, 0.5) * (1.0 - whiteness) * detail;
  // reticulated slightly darker margins on white scales (fewer iridophores
  // at the edge), irregular in strength
  col *= 1.0 - 0.13 * netVar * (edge * 0.5 + marginShadow * 0.5) * whiteness * detail;
  // far: the averaged net (darker pockets between the exposed fields)
  col *= 1.0 + netF * mix(0.11, 0.14, whiteness) * mix(1.0, netVar, 0.6);

  // the head skin is not a guanine mirror like the white scales: on white
  // and sarasa fish it is a warm, fleshy white (R >= G >= B), never a cool
  // grey or lilac (p05_1, p12_0, p42_1)
  // (shares the pearly base with the scaled body; only a touch fleshier,
  // so there is no seam at the scale boundary)
  float headSkinW = (1.0 - scaleMask) * whiteness * (lip > -0.5 ? 1.0 : 0.0);
  // (not lighter than the flank either: a brighter head read as a
  // translucent, glowing sweet next to the scaled body)
  col = mix(col, col * vec3(1.02, 0.98, 0.93), headSkinW);
  // the gill cover is a bony plate: a little less diffuse white, its
  // brightness comes from the sheen where the light hits it (p12_0)
  col *= 1.0 - 0.1 * operc * headSkinW;
  specTint = mix(specTint, vec3(1.0, 0.96, 0.92), headSkinW);

  // guanine reflector strength (metallic scale type, some duller scales)
  // (pigmented scales reflect much less: the carotenoid layer on top keeps
  // red patches saturated; per-scale jitter ±10 % up close, ±25 % as sparkle
  // at mid range; far away the averaged net modulates the sheen)
  // (pigmented scales keep the full spread up close too: each scale's
  // guanine pocket is a separate small reflector, p42_1, which breaks the
  // flank highlight into scale-sized glints instead of one smooth stripe)
  float jitR = mix(1.0, 0.7 + 0.6 * rnd.x, sparkle * mix(1.0, mix(1.0, 0.6, whiteness), detail));
  // (duller regenerated / odd scales: much subtler on white, whose mirror
  // reflection would turn every dull scale into a dark tile)
  // (white: a pearly sheen, not a chrome mirror — part of the light is
  // diffused back by the dense iridophore stack, the albedo carries that)
  float pigRefl = 0.5 * mix(1.0, 0.6, fishTone().x * step(0.5, vFishA.z)); // denser carotenoid layer: weaker sheen
  // (white: about 80 % of the full reflector. The rest of the light the
  // dense, disordered platelet stack returns is diffuse: pearly, not a
  // chrome mirror. A full-strength mirror F0 also takes the same energy
  // away from the diffuse term, so the flank went dark grey wherever it
  // mirrored the dark surroundings.)
  float refl = uGuanine * mix(1.0, mix(0.7, 0.9, whiteness), regen) * jitR * mix(pigRefl, 0.8, whiteness);
  refl *= mix(1.0 + 0.3 * netF, mix(1.0, 0.85, edge) * (rnd.y < 0.03 ? mix(0.82, 0.94, whiteness) : 1.0), detail);
  // head: iridophores on operculum/cheek give a softer golden sheen
  // the opercle is a pearly plate: guanine-rich, smooth, no scales
  float headSheen = uGuanine * (0.16 + 0.75 * operc + 0.2 * smoothstep(0.1, -0.6, a));
  // white head skin keeps part of the body's pearly reflectance (p11_1:
  // the cheek and gill cover shine where the light hits them), but it is
  // thin skin over bone, not a deep platelet stack: at the flank's strength
  // the whole head read as a glossy, pearl-coated gummy sweet
  headSheen = mix(headSheen, max(headSheen, refl * 0.58), whiteness);
  refl = mix(headSheen, refl, scaleMask);
  // belly: silvery stratum argenteum
  refl *= mix(1.0, 1.25, smoothstep(-0.3, -0.9, a));

  vec3 spec = specTint * refl;
  // white (iridophore-only) scales are smoother, more mirror-like reflectors
  // white scales: a soft, broad pearly lobe (not a sharp chrome mirror); the
  // white head skin is only a little rougher than the scaled flank
  float rough = uRoughness * mix(0.93, 1.07, rnd.z) * mix(1.0, 0.9, whiteness);
  rough = mix(uRoughness * mix(1.55, 1.2, whiteness), rough, scaleMask);
  // lost relief / sub-pixel tilt spread widens the lobe (Toksvig-like),
  // mostly once the per-scale glints are gone too
  // While single scales are resolved but their relief is not (mid range),
  // each scale acts as a small, fairly smooth mirror with its own tilt:
  // a tighter lobe there gives distinct glints instead of one broad sheen.
  rough = mix(rough, min(rough, 0.24), sparkle * (1.0 - detail));
  rough += (0.04 * (1.0 - detail) + 0.08 * (1.0 - sparkle)) * scaleMask;
  // the mucus film is uneven: a slow variation of its thickness / gloss over
  // the body softens and breaks the large-scale highlight into patches
  // (pigmented skin a little more satin overall than a clean lacquer)
  {
    float mucus = 0.65 * vnoise3(rp * vec3(13.0, 17.0, 17.0) + seed * 1.9) + 0.35 * vnoise3(rp * 31.0 - seed);
    rough += (mucus - 0.5) * mix(0.14, 0.08, whiteness) + 0.035 * (1.0 - whiteness) * scaleMask;
    spec *= mix(0.72, 1.18, mucus);
  }

  // ---- lips, buccal cavity, gill slit, orbit
  float sB = -rp.x; // axial position (rest)
  if (lip > 0.0) {
    // upper lip: a paler, warmer version of the head colour (yellow-orange
    // on red, peach on white); lower lip: pink-cream; the moist margin at
    // the cleft a little pinker. (Measured: #db9174 on crimson, #e37c17 on
    // orange, #eac7ae on white; lower lip #dcbba5 / #d1b4a8.)
    float upperW = smoothstep(-0.2, 0.3, a);
    vec3 upperC = mix(col * vec3(1.06, 0.94, 0.72) + vec3(0.1, 0.07, 0.025), col * vec3(1.02, 0.84, 0.6), whiteness);
    vec3 lowerC = mix(vec3(0.8, 0.57, 0.47), col * vec3(1.0, 0.8, 0.66) + vec3(0.1, 0.06, 0.04), 0.4 * (1.0 - whiteness));
    float dyC = rp.y - (MOUTH_Y - MOUTH_DROOP * min(1.0, pow(abs(rp.z) / MOUTH_RW, 2.0)));
    float margin = smoothstep(0.0035, 0.0008, abs(dyC + 0.0006));
    vec3 lc = mix(lowerC, upperC, upperW);
    lc = mix(lc, mix(lowerC, vec3(0.7, 0.4, 0.36), 0.35), margin * 0.5);
    // opened, the everted lips show their thick, pale fleshy rim all round,
    // whatever the patch colour of the snout (p09_1): upper lip cream-peach
    // (#eac7ae on white .. #db9174 on deep red), lower lip pink-cream #dcbba5
    float lipOpen = smoothstep(0.04, 0.3, vHead.x);
    vec3 upOpen = mix(vec3(0.823, 0.571, 0.423), vec3(0.708, 0.283, 0.178), 0.8 * (1.0 - whiteness));
    vec3 lc2 = mix(vec3(0.716, 0.497, 0.376), upOpen, upperW);
    lc = mix(lc, lc2, lipOpen);
    // closed, the upper lip is only a paler, warmer tint of the snout: the
    // mask is broad and soft, so at full strength it read as a stripe / blob
    // above the cleft
    // (open, the pale rim is concentrated at the everted margin: the outer
    // part of the upper-lip mask blends back into the snout, no band)
    // (closed, the lower lip keeps mostly the chin colour, pale only along
    // its moist margin: a full pale lower lip drew a crescent under the
    // cleft that read as a cartoon smile from the front and above)
    float lipW = lip * mix(mix(0.55, mix(0.4, 0.85, margin), 1.0 - upperW), mix(1.0, lip, upperW), lipOpen);
    col = mix(col, lc, lipW);
    spec *= 1.0 - 0.7 * lip;
    rough = mix(rough, 0.3, lip);
    // closed mouth: the lips meet in a soft shadowed line, not a lit edge
    // (the same vertices form the inner margin of the open lips)
    float closed = 1.0 - smoothstep(0.04, 0.3, vHead.x);
    // (the top of the lower lip lies in the shadow of the upper lip)
    // (a fine line: a broad shadow band under it read as a mouth left a
    // little open in the resting face)
    float cleftLine = smoothstep(dyC > -0.0002 ? 0.0016 : 0.0024, 0.0003, abs(dyC + 0.0002)) * closed;
    // the dark line is short: it fades out well before the corners, which
    // are tucked under the rounded upper lip (a long dark line curving back
    // around the snout read as a smile)
    cleftLine *= 1.0 - 0.75 * smoothstep(0.45, 1.0, abs(rp.z) / MOUTH_RW);
    col *= 1.0 - 0.35 * cleftLine;
    ao *= 1.0 - 0.4 * cleftLine;
    spec *= 1.0 - 0.8 * cleftLine;
  }
  // chin and throat: warm white (or the body colour), lit from the dark
  // ground below it reflects little; keep it from going grey-mauve
  {
    float chin = smoothstep(-0.2, -0.7, a) * smoothstep(0.12, 0.05, sB) * (lip > -0.5 ? 1.0 : 0.0) * (1.0 - scaleMask);
    col = mix(col, col * vec3(1.06, 1.0, 0.92), chin * whiteness);
    spec *= 1.0 - 0.35 * chin;
  }
  if (lip < -0.5) {
    // buccal cavity: pale pink mucosa behind the lips, blood-red chamber,
    // a dark red pharynx; a pink basihyal pad (tongue) on the floor and
    // the gill arches far back. Seen through the open mouth it reads red /
    // pink (p09_1: #af3d35 at the front of the chamber), never black.
    // One smooth gradient (p09_1): pale pink mucosa just behind the lips,
    // #af3d35 at the front of the chamber, darker red deeper in. No ridges,
    // arches or bands: any structure along the cavity rings reads as a
    // concentric target in the front view.
    float c = clamp(sB / 0.075, 0.0, 1.0);
    vec3 muc = mix(vec3(0.66, 0.3, 0.26), vec3(0.43, 0.047, 0.036), smoothstep(0.0, 0.35, c));
    muc = mix(muc, vec3(0.2, 0.025, 0.022), smoothstep(0.3, 1.0, c));
    // light reaching into the chamber falls off with depth (the head shades
    // it); the closed slit is only a dark line
    muc *= mix(1.0, 0.6, smoothstep(0.1, 0.7, c));
    float shut = 1.0 - smoothstep(0.04, 0.3, vHead.x);
    // (closed: the meeting lips' moist margin in shadow, a dull dark red
    // line, not a black hole)
    col = mix(muc, vec3(0.16, 0.06, 0.05), shut);
    // wet, but the lips and the head hide most of the bright surroundings
    spec = vec3(0.025) * (1.0 - 0.75 * smoothstep(0.04, 0.3, c)) * (1.0 - shut);
    rough = 0.34;
    ao = mix(0.95, 0.6, smoothstep(0.3, 1.0, c));
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
    // (resting ventilation keeps the slit shut: a slightly open slit only
    // drew a thin dark-red seam along the whole margin)
    float show = slit * smoothstep(0.35, 0.9, gOpen) * 0.85;
    col = mix(col, filCol, show);
    nT = normalize(nT + vec3(0.0, sin(filPh) * 0.16 * (1.0 - bsm) * filAA, 0.0) * show);
    spec = mix(spec, vec3(0.04), show);
    rough = mix(rough, 0.22, show);
    // closed cover: only the soft contact shadow under the step of the plate
    // (faint: on white skin a stronger one reads as a drawn seam)
    ao *= 1.0 - gill * mix(0.1, 0.05, whiteness) * (1.0 - show) - show * deep * 0.5;
  }
  // opercular membrane: the thin free edge of the gill cover is translucent,
  // so the blood of the gills behind it tints it a little pinker (a soft
  // band, not a drawn stroke); opercle bone: only very faint radiating striae
  // (both sides of the band fade softly, so it never closes into a line
  // along the margin)
  float memb = smoothstep(-0.02, -0.004, eG) * smoothstep(0.006, -0.003, eG) * operc;
  // (on white fish a broad, soft pink rim: blood seen through the thin
  // membrane, p12_0)
  col = mix(col, col * vec3(1.0, 0.8, 0.8), memb * mix(0.3, 0.38, whiteness));
  spec *= 1.0 - 0.3 * memb;
  if (operc > 0.01) {
    vec2 hv = vec2(sB - 0.205, rp.y - 0.055);
    float rang = atan(hv.y, hv.x);
    float striae = spow(abs(sin(rang * 46.0 + vnoise2(hv * 90.0) * 1.5)), 6.0);
    float wOp = operc * smoothstep(-0.004, -0.02, eG);
    nT = normalize(nT + vec3(-sin(rang), cos(rang), 0.0) * (striae - 0.3) * 0.018 * wOp);
    col *= 1.0 + (striae - 0.3) * 0.015 * wOp;
  }
  // nostrils: the paired nares in front of the eye are small dark openings
  // under a pale flap
  // under a fleshy flap that is a little paler than the surrounding skin
  {
    float sideN = smoothstep(0.008, 0.016, abs(rp.z));
    float dn = length(vec2(sB - NARE_S - 0.0012, rp.y - NARE_Y));
    float nare = smoothstep(0.0055, 0.0015, dn) * sideN;
    vec2 fq = vec2(sB - NARE_S + NARE_FLAP_S, rp.y - NARE_Y - NARE_FLAP_Y) / vec2(0.0028, 0.0042);
    float flapM = exp(-dot(fq, fq)) * sideN;
    col = mix(col, col * 0.75 + vec3(0.2, 0.17, 0.15), flapM * 0.45);
    col *= 1.0 - 0.55 * nare * (1.0 - flapM);
    ao *= 1.0 - 0.4 * nare * (1.0 - flapM);
    spec *= 1.0 - 0.5 * flapM;
  }
  // fleshy orbital rim: pale, fleshy and less reflective (p05_1, p12_0,
  // p25_0); narrow (a broad ring reads as a swollen lid) and a paler, partly
  // desaturated version of the local skin, never a pink halo.
  // The rim is drawn per pixel from the rest-frame eye (the vertex mask is
  // only 2-3 vertices across it and smeared into an airbrushed halo): a
  // hard inner edge where the skin meets the ball, with a thin moist contact
  // shadow, a narrow fleshy band of skin-coloured, slightly paler and less
  // saturated tissue, and a soft outer falloff into the head skin.
  {
    vec3 eq = rp - vec3(EYE_C.xy, EYE_C.z * sign(rp.z));
    vec3 eax = vec3(EYE_AX.xy, EYE_AX.z * sign(rp.z));
    float eh = dot(eq, eax);
    vec3 erad = eq - eh * eax;
    float erho = length(erad);
    // distance outside the visible edge of the eye, in eyeball radii
    float eu = (erho - EYE_VR) / EYE_R;
    float front = step(-EYE_R, eh) * step(0.006, abs(rp.z));
    // the skin's free edge against the eye is an exact circle: skin that the
    // mesh leaves above the ball inside the opening (where the flat cap
    // meets the head at a shallow angle) is cut away per pixel, so the edge
    // never shows the mesh as a ragged or sawtooth margin
    if (erho < EYE_VR && eh > 0.0 && abs(rp.z) > 0.006) discard;
    // over the top of the eye the rim merges into the forehead
    float upE = erad.y / max(erho, 1e-6);
    float dorsE = smoothstep(0.1, 0.85, upE);
    float aaE = fwidth(eu);
    // fleshy band: full right up to the eye, soft outside (wider and fainter
    // above, narrowest below and in front of the eye)
    float bandO = mix(0.2, 0.3, dorsE);
    float band = (1.0 - smoothstep(bandO * 0.35, bandO + 0.12 + aaE, eu)) * front;
    band *= mix(1.0, 0.55, dorsE);
    // natural flesh: the local skin, a little paler and warmer, partly
    // desaturated (cream-beige on white, a muted lighter red / orange on red)
    float lumC = dot(col, vec3(0.3, 0.5, 0.2));
    // (barely paler: a brighter band read as a bright ring around the eye)
    vec3 flesh = mix(col, vec3(lumC), 0.25) * vec3(1.02, 0.97, 0.9) + vec3(0.008, 0.006, 0.004);
    col = mix(col, flesh, 0.7 * band);
    // the skin's free edge against the ball: a fine moist contact shadow
    // (hard toward the eye, fading over ~0.06 R outward)
    float contact = (1.0 - smoothstep(0.0, 0.06 + aaE, eu)) * front;
    col *= 1.0 - 0.35 * contact;
    ao *= 1.0 - 0.45 * contact;
    // a faint soft crease just outside the band (shading only, no colour)
    float crE = (eu - bandO - 0.18) / 0.12; // (pow of a negative base is undefined)
    ao *= 1.0 - 0.18 * front * (1.0 - dorsE) * exp(-crE * crE);
    // fleshy, moist but not glossy
    spec *= 1.0 - 0.45 * band;
    rough = mix(rough, rough + 0.12, band);
  }

  // ---- head skin: fine micro-relief and mottled chromatophores (no scales)
  float headSkin = 1.0 - scaleMask;
  if (headSkin > 0.01 && lip > -0.5) {
    // (a soft, low micro-relief faded out with the pixel footprint: a
    // stronger / finer one read as sandpaper speckle on the white gill cover)
    vec3 hp = rp * 90.0;
    float mAA = 1.0 - smoothstep(0.15, 0.5, fwidth(hp.x) + fwidth(hp.y));
    float mn = (vnoise3(hp) - 0.5) * mAA;
    float mn2 = (vnoise3(hp * 1.9 + 3.1) - 0.5) * mAA;
    nT = normalize(nT + vec3(mn, mn2, 0.0) * mix(0.04, 0.02, whiteness) * headSkin);
    // uneven iridophore / chromatophore density: soft mottling of tone and
    // a patchy, broken sheen instead of one smooth plastic highlight
    float mot = vnoise3(rp * 55.0 + seed);
    float mot2 = vnoise3(rp * 21.0 + seed * 1.7 + 4.0);
    col *= 1.0 + ((mot - 0.5) * 0.14 + (mot2 - 0.5) * 0.12) * mix(1.0, 0.5, whiteness) * headSkin;
    // pigmented head skin: the chromatophore field is visibly uneven — deeper
    // crimson clouds (denser erythrophores absorb more green / blue) and paler
    // orange-gold flecks where the guanine shows through (p40_1, p42_1)
    float mot3 = vnoise3(rp * vec3(120.0, 140.0, 140.0) + seed * 2.7 + 1.3);
    vec3 cloud = mix(vec3(1.06, 1.22, 1.15), vec3(0.88, 0.7, 0.76), smoothstep(0.3, 0.75, 0.55 * mot2 + 0.45 * mot3));
    col *= mix(vec3(1.0), cloud, (1.0 - whiteness) * headSkin);
    spec *= 1.0 + ((mot2 - 0.5) * 0.9 + mn * 0.15) * headSkin;
    rough += (mot - 0.5) * 0.12 * headSkin;
    // forehead and snout top: thick skin over the frontal bones, with few
    // reflective iridophores. A soft, broken satin sheen, not the glossy
    // white dome of a porcelain figurine
    // (down to the level of the eyes: the brow across them is matte too)
    float brow = headSkin * smoothstep(-0.15, 0.35, a) * (1.0 - operc) * smoothstep(0.3, 0.18, sB);
    spec *= 1.0 - brow * (0.8 + 0.25 * (mot2 - 0.5));
    rough += 0.22 * brow;
    // the rounded front of the snout above the lips faces the viewer in
    // every frontal view: kept matte as well, or it shows as a glossy knob
    float snoutF = headSkin * smoothstep(0.05, 0.015, sB) * smoothstep(-0.4, 0.0, a) * (lip > 0.5 ? 0.0 : 1.0);
    spec *= 1.0 - 0.5 * snoutF;
    rough += 0.1 * snoutF;
    nT = normalize(nT + vec3(mn, mn2, 0.0) * 0.03 * brow);
  }
  // white head: its skin inherits the flank's pearly reflector strength, so
  // over the nape and the top of the gill cover (behind the forehead term
  // above) it still mirrored like a lacquered dome: a little weaker, broader
  {
    float dome = headSkin * whiteness * smoothstep(0.1, 0.75, a) * smoothstep(0.01, 0.08, sB) * (lip > -0.5 ? 1.0 : 0.0);
    spec *= 1.0 - 0.4 * dome;
    rough += 0.08 * dome;
  }
  // ventral xanthophore wash behind the pectorals (yellowish belly in sarasa)
  float bellyY = smoothstep(-0.2, -0.75, a) * smoothstep(0.2, 0.36, -rp.x) * smoothstep(0.62, 0.42, -rp.x);
  col = mix(col, col * vec3(1.05, 0.95, 0.62), bellyY * 0.35 * whiteness);

  // ---- sub-surface tissue
  // gill blush: blood-filled filaments under the thin opercular bone show
  // through pale skin as a pink flush, strongest toward the free margin
  float blush = operc * whiteness * uTranslucency;
  col = mix(col, col * vec3(1.0, 0.68, 0.7), blush * 0.42);
  // fin bases: blood vessels feeding the fins run in the thin fleshy base
  // and show through pale skin as a soft pink flush (p11_1, p12_0): the
  // pectoral and pelvic insertions, along the anal and dorsal bases and the
  // caudal peduncle
  if (whiteness > 0.01) {
    vec2 pq = vec2(sB - 0.318, rp.y + 0.098) / vec2(0.034, 0.026);
    float fb = exp(-dot(pq, pq));
    fb = max(fb, smoothstep(0.42, 0.47, sB) * smoothstep(0.53, 0.49, sB) * smoothstep(-0.7, -0.92, a));
    fb = max(fb, smoothstep(0.71, 0.75, sB) * smoothstep(0.88, 0.83, sB) * smoothstep(-0.72, -0.95, a));
    fb = max(fb, 0.6 * smoothstep(0.44, 0.5, sB) * smoothstep(0.86, 0.8, sB) * smoothstep(0.8, 0.97, a));
    fb = max(fb, 0.8 * smoothstep(0.86, 1.0, sB));
    // (broken up a little: the capillary bed is not an even airbrush)
    fb *= 0.75 + 0.5 * vnoise3(rp * 70.0 + seed);
    col = mix(col, col * vec3(1.0, 0.76, 0.76), fb * whiteness * uTranslucency * 0.55);
  }
  // flesh seen through the thin white (iridophore-only) skin: pinkish depth,
  // stronger where the body is thin (peduncle, belly, throat) and when viewed
  // head-on (grazing views see the reflective guanine layer instead)
  float thickW = 2.0 * vSect.y * sqrt(max(0.0, 1.0 - a * a * 0.92)) + 0.006; // lateral thickness at this height
  float fleshThin = 1.0 - smoothstep(0.03, 0.12, thickW);
  float nvB = gNV;
  // (the head skin lies on the skull and the opercular bones: no flesh
  // shows through it, so it stays an opaque warm white instead of a
  // translucent pink, except for the gill blush above)
  float headBone = (1.0 - scaleMask) * (lip > -0.5 ? 1.0 : 0.0);
  col = mix(col, col * vec3(1.0, 0.8, 0.8), whiteness * uTranslucency * (0.16 + 0.42 * fleshThin) * (0.4 + 0.6 * nvB) * (1.0 - 0.7 * headBone));
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
  // (a dense carotenoid layer passes almost only red: no white leak through
  // red skin, which would lift green and turn every red fish orange; but
  // not much purer than the pigment itself either: a squared filter made the
  // diffused light a pure spectral red that over-saturated every red flank)
  vec3 exitF = mix(mix(pig * pig, pig, 0.4), vec3(1.0), mix(0.03, 0.18, whiteness)) * mix(0.95, 0.45, whiteness);

  gFS.albedo = col;
  gFS.rough = clamp(rough, 0.06, 1.0);
  gFS.spec = spec;
  gFS.irid = uIridescence * mix(0.35, 1.0, whiteness) * mix(0.6 + 0.4 * rnd.y, 0.93 + 0.07 * rnd.y, whiteness) * mix(0.4, 1.0, max(scaleMask, max(operc * 0.85, whiteness * 0.75)));
  // film thickness: a narrow spread (warm gold to pale green glints on
  // pigmented scales); white scales: a pearly film whose thickness drifts
  // slowly over the body (faint pink / green shifts, no per-scale mosaic)
  float pearlDrift = vnoise3(rp * 6.0 + seed * 2.3);
  gFS.iridThick = mix(mix(330.0, 420.0, rnd.x), mix(360.0, 420.0, pearlDrift) + 8.0 * (rnd.x - 0.5), whiteness);
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
// (F90 below 1: the reflector lies under a mucus film index-matched to
// the water, and at grazing angles the platelet stack is seen edge-on; a
// full Fresnel rise turns the silhouette of a pale fish against the bright
// surface into a glowing rim)
material.specularF90 = 0.55;
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
  // (on the back, facing the surface, the dapple is a little stronger: the
  // faint moving net of light that marks a fish lit from above in a tank)
  vec3 caus = max(vec3(0.0), 1.0 + (causticsPattern(vFishWorld, nW) - 1.0) * (1.0 + 0.7 * smoothstep(0.3, 0.9, nW.y) * uWaterDensity)) * lightFalloff(vFishWorld);
  reflectedLight.directDiffuse *= caus;
  reflectedLight.directSpecular *= mix(vec3(1.0), caus, 0.7);
  vec3 V = normalize(vViewPosition); // toward camera (view space)
  float slMM = vSL * 1000.0;
  // extinction of goldfish tissue (1/mm): red travels furthest, blue is
  // absorbed by blood and scattered out quickly
  vec3 sigma = vec3(0.2, 0.62, 0.95) / max(uTranslucency, 0.05);
  // white head skin lies directly on the skull and the opercular bones:
  // opaque, little sideways spread, no light through it (the gill blush is
  // a colour, not a glow). At the flank's translucency the white head and
  // gill cover glowed like a gummy sweet in close-ups
  float headW = gFS.whiteness * (1.0 - vMask.x) * (vMask.z > -0.5 ? 1.0 : 0.0);
  // ---- short-range diffusion: per-channel wrapped lighting (red wraps
  // furthest past the terminator), shadowed from slightly inside the skin
  #if NUM_DIR_LIGHTS > 0
    vec3 L = directionalLights[0].direction;
    vec3 lc = directionalLights[0].color;
    vec3 Lw = uCausticLightDir;
    float NL = dot(normal, L);
    // (white skin: the dense iridophore stack scatters every wavelength back
    // near the surface, so its wrap is short and nearly neutral; a red-only
    // wrap there paints a dark red band along the terminator of the belly)
    vec3 w = mix(vec3(0.55, 0.24, 0.14), vec3(0.3, 0.26, 0.23), gFS.whiteness) * uSSS * (1.0 - 0.45 * headW);
    vec3 wrapD = saturate((vec3(NL) + w) / (1.0 + w)) / (1.0 + w);
    #if FISH_LOD >= 2
      float sScat = 1.0;
    #else
      float sScat = keyShadowAt(vFishWorld + Lw * 0.0025 + nW * 0.0015, 3.0);
    #endif
    vec3 extra = max(wrapD - vec3(saturate(NL)), vec3(0.0));
    // in the tank the light past the terminator fades toward the belly (the
    // underside only sees the dark bed): wrap and guanine fill follow it
    float downK = uWaterDensity > 0.0 ? mix(0.45, 1.0, smoothstep(-0.8, 0.35, nW.y)) : 1.0;
    extra *= downK;
    reflectedLight.directDiffuse += lc * gFS.albedo * RECIPROCAL_PI * extra * sScat * caus;
    // ---- guanine multiple scattering (white skin): light entering the lit
    // side spreads sideways through the stacked iridophore platelets before
    // it leaves the skin, so shadowed white keeps a soft, slightly warm
    // luminous fill instead of falling to porcelain grey. It thins out on
    // the belly underside (fewer layers, flesh shows), which keeps the
    // darker ventral gradient of the photographs.
    float aV = vMask2.y;
    // (pearly, not chalky: what the platelet stack returns sideways is a
    // faintly cool silver that drifts toward blue-green at grazing angles
    // (thin-film platelets seen obliquely), so shadowed white reads as
    // nacre instead of turning grey)
    float lateral = gFS.whiteness * mix(0.45, 1.0, smoothstep(-0.95, -0.2, aV)) * (1.0 - 0.45 * saturate(NL));
    // (head: a thin skin over bone has no deep platelet stack to spread the
    // light around; what is left keeps its shadow side from going grey)
    lateral *= 1.0 - 0.5 * headW;
    vec3 pearlT = mix(vec3(0.97, 0.98, 1.02), vec3(0.86, 0.96, 1.1), spow(1.0 - gNV, 1.5));
    // (the multiply-scattered part does not need the shadow map tap from
    // just under this point: it entered the lit side and spread around)
    reflectedLight.directDiffuse += lc * gFS.albedo * pearlT * RECIPROCAL_PI * 0.42 * lateral * mix(1.0, downK, 0.5) * mix(0.5, 1.0, sScat) * caus;
    // ---- thin-part transmission of the key light: chord from this point
    // toward the light through the local cross-section; light enters on the
    // lit surface (shadowed there) and exits here, filtered by the tissue
    float cL = sectChord(vRestPos.yz, vLocL.yz, vSect) * slMM;
    vec3 Tr = exp(-sigma * max(cL, 0.35));
    // (white skin: the dense iridophore layer re-scatters what leaves the
    // flesh, so the exiting light is a pale rosy white, not the deep
    // orange-red of light that crossed millimetres of muscle)
    Tr = mix(Tr, vec3(dot(Tr, vec3(0.5, 0.3, 0.2))), 0.55 * gFS.whiteness);
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
    transK = min(transK, mix(1.5, 0.8, gFS.whiteness) * lc * max(gFS.albedo, vec3(0.15 * gFS.whiteness + 0.02)) * RECIPROCAL_PI);
    reflectedLight.directDiffuse += transK * mix(vec3(1.0), caus, 0.5) * (1.0 - 0.75 * headW);
  #endif
  // ---- in-tank ambient comes down from the surface; the dark gravel below
  // returns little of it, so the back sees a bright hemisphere and the belly
  // a dark one, darker still close over the bed (studio: unchanged)
  if (uWaterDensity > 0.0) {
    float grad = mix(0.38, 1.3, smoothstep(-0.85, 0.75, nW.y));
    float nearBed = 1.0 - smoothstep(0.03, 0.14, vFishWorld.y - uWaterMin.y - 0.035);
    grad *= 1.0 - 0.35 * nearBed * smoothstep(0.1, -0.7, nW.y);
    reflectedLight.indirectDiffuse *= grad;
    reflectedLight.indirectSpecular *= mix(1.0, grad, 0.5);
  }
  // ---- ambient light from behind (water column / surface) diffusing
  // through thin parts toward the viewer: chord along the view ray
  float cV = sectChord(vRestPos.yz, -vLocV.yz, vSect) * slMM;
  float cMin = min(vSect.y, vSect.z) * slMM * 0.6;
  vec3 Tv = exp(-sigma * max(cV, max(cMin, 0.35)));
  Tv = mix(Tv, vec3(dot(Tv, vec3(0.5, 0.3, 0.2))), 0.55 * gFS.whiteness);
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
  // (weaker through white skin: at full strength the whole lower flank of a
  // white fish glowed as an orange band)
  reflectedLight.indirectDiffuse += bg * gFS.tissue * Tv * mix(0.45, 0.33, gFS.whiteness) * (1.0 - 0.75 * headW);
  // buccal cavity: light entering through the open gape bounces around the
  // pink chamber (its walls see each other and the opening, not the
  // surroundings their normals face), so it reads red, not black (p09_1)
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    if (vMask.z < -0.5) {
      vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      vec3 inLight = 0.5 * (getIBLIrradiance(V) + getIBLIrradiance(upV));
      reflectedLight.indirectDiffuse += gFS.albedo * inLight * 0.45 * smoothstep(0.04, 0.4, vHead.x);
    }
  #endif
  // the direct key on the ring-shaped cavity wall turns every ring of
  // facets into a light / dark band (a "target"): the chamber is lit mostly
  // by the light bouncing inside it
  #if NUM_DIR_LIGHTS > 0
    if (vMask.z < -0.5) reflectedLight.directDiffuse *= 0.25;
  #endif
  reflectedLight.indirectDiffuse *= gFS.ao;
  {
    vec3 tS = gFS.spec / max(max(gFS.spec.r, gFS.spec.g), max(gFS.spec.b, 1e-4));
    reflectedLight.directSpecular *= tS;
    reflectedLight.indirectSpecular *= tS;
  }
  reflectedLight.indirectSpecular *= mix(1.0, gFS.ao, 0.8);
  // white head: the even environment sheen coated the whole face in pearl;
  // keep the sheen mostly where the key light hits (direct specular)
  reflectedLight.indirectSpecular *= 1.0 - 0.3 * headW;
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
