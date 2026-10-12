import { Color, DoubleSide, FrontSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MultiplyBlending, Vector4 } from 'three';
import { CHELIPED, EYE, MXP3 } from './ScopimeraGlobosaMorphology.js';

/**
 * コメツキガニ materials. Everything procedural, evaluated in the shader from the bind-pose coordinates the geometry
 * carries (aLocal: bone-local position in carapace widths; uv: (along, around) on limb segments, (θ, s) on the
 * carapace; aInfo: part, limb·10 + segment, joint membrane, thinness), so patterns ride on their segment exactly as
 * pigment does on cuticle.
 *
 * Layers, each separated by scale, each fading out (into roughness) when it falls below a pixel:
 *   baseColor   — mottled sand-grey / brown marbling (bilaterally symmetric on the carapace), banded legs, porcelain
 *                 fingers with brown tips, dark-speckled maxillipeds and tympana, white sternum with black dots,
 *                 a purplish tinge that some individuals carry strongly (024, 025, 040–044) [P][L]
 *   height      — tubercles (dense on the branchial regions, cardiac/intestinal smooth [L]), grooves (cervical, H),
 *                 the crested lateral border, suborbital granules, setal sockets, membrane wrinkles → normal
 *   roughness   — matte granular cuticle, glossy fingers and cornea, a wet film that breaks into patches as it dries
 *   wetness     — darker albedo + clearcoat; ventral side, mouth and leg tips stay wetter
 *   sand        — grains clinging to dactyli, fingertips (feeding) and the ventral side
 *   glints      — white chromatophores sparkle (002–013 look glittery under the flash)
 *   translucency— thin cuticle of legs and eyestalks lets back-light through
 *
 * Each crab owns material instances (cheap); the GLSL is identical, so all share one compiled program.
 */

const lin = (r, g, b) => new Color(r, g, b).convertSRGBToLinear();
/**
 * The flat's clean sand as the terrain draws it (Terrain SUBSTRATE_COLORS.sand — a linear vertex colour, not
 * sRGB): pellets are that same sand, sorted and pressed; burrow walls are it, wet.
 */
const SAND_LINEAR = new Color(0.68, 0.56, 0.36);

const COMMON = /* glsl */ `
float kgH31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 kgH33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float kgN3(vec3 x){
  vec3 i = floor(x), f = fract(x); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kgH31(i), kgH31(i + vec3(1,0,0)), u.x), mix(kgH31(i + vec3(0,1,0)), kgH31(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(kgH31(i + vec3(0,0,1)), kgH31(i + vec3(1,0,1)), u.x), mix(kgH31(i + vec3(0,1,1)), kgH31(i + vec3(1,1,1)), u.x), u.y), u.z);
}
float kgFbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * kgN3(p); p = p * 2.03 + vec3(17.1, 9.2, 3.7); a *= 0.5; } return s / 0.9375; }
float kgFbm2(vec3 p){ return (kgN3(p) * 0.65 + kgN3(p * 2.1 + 7.7) * 0.35); }
// Speckles: points jittered anywhere in their cell, found among the 2×2×2 nearest cells (no grid shows), each
// with its own size and a ragged, stellate outline (melanophores are not discs). Coverage is anti-aliased and,
// once a speck is smaller than a pixel, fades to its mean so nothing shimmers. id: the nearest speck's hash.
float kgSpeck(vec3 p, float density, float r, float fw, out float id){
  vec3 b = floor(p - 0.5);
  float m = 0.0; id = 0.0;
  float best = 1e9;
  for (int k = 0; k < 8; k++) {
    vec3 c = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 h = kgH33(c);
    if (h.x > density) continue;
    vec3 ctr = c + kgH33(c + 19.7);
    vec3 d = p - ctr;
    float rr = r * (0.55 + 0.9 * h.y);
    float dl = length(d);
    // ragged outline: a few lobes
    float lobe = 1.0 + (0.12 * sin(atan(d.y + d.z * 0.7, d.x) * 3.0 + h.z * 30.0) + 0.1 * (kgN3(d / max(rr, 1e-4) * 2.5 + h * 9.0) - 0.5)) * smoothstep(0.0, 0.6, dl / max(rr, 1e-4));
    float cov = 1.0 - smoothstep(rr * lobe - fw * 0.6, rr * lobe + fw * 0.6, dl);
    if (cov > m) m = cov;
    if (dl < best) { best = dl; id = h.z; }
  }
  float mean = density * 4.18879 * r * r * r * 1.3;
  // keep a speck until it is about two pixels across, then let it go to its mean
  return mix(m, min(mean, 1.0), smoothstep(0.8 * r, 2.4 * r, fw));
}
// Pigment, the way the crab is coloured (060, 063, 010 under a lens): a pale cuticle carrying dark melanophore dots
// of two sizes — dots ≈ 0.015 CW and a dust ≈ 0.005 CW — whose DENSITY D (0..1) makes every pattern: bands,
// mottling, marks. tone: each dot's own shade (some near black, some pale brown).
float kgPig(vec3 p, float D, float fw, out float tone){
  float id1, id2, i3, i4, i5;
  // distinct dots (≈ 0.006–0.009 CW, each its own size and opacity), crowding where D is high: a fine stipple, 1–2 px
  // in the photographs (049, 060, 063: never sparse big spots)
  float rr = mix(0.24, 0.32, D);
  float m1 = kgSpeck(p * 80.0, clamp(D * 0.7, 0.0, 0.92), rr, fw * 80.0 + 0.12, id1);
  float m2 = kgSpeck(p * 140.0 + 3.1, clamp(D * 0.95, 0.0, 0.95), rr, fw * 140.0 + 0.12, id2);
  tone = m1 > m2 ? id1 : id2;
  float dots = max(m1 * (0.32 + 0.36 * id1), m2 * (0.3 + 0.36 * id2));
  // and between them a dust of the finest melanophores — soft-edged specks, three overlapping layers so the
  // covered fraction can follow D up to dense fields (060, 063 under a lens: stipple, never blobs); once the dust is
  // below a pixel only its mean remains (and the loops are skipped)
  float dust;
  if (fw * 230.0 > 1.4) dust = D * 0.8;
  else {
    float r3 = mix(0.3, 0.46, D);
    float dd = clamp(D * 1.35, 0.0, 0.98);
    float d1 = kgSpeck(p * 230.0 + 11.7, dd, r3, fw * 230.0 + 0.2, i3);
    float d2 = kgSpeck(p.zxy * 265.0 + 4.9, dd, r3, fw * 265.0 + 0.2, i4);
    float d3 = kgSpeck(p.yzx * 300.0 + 8.3, dd, r3 * 0.9, fw * 300.0 + 0.2, i5);
    dust = 1.0 - (1.0 - d1 * (0.6 + 0.4 * i3)) * (1.0 - d2 * (0.6 + 0.4 * i4)) * (1.0 - d3 * (0.5 + 0.4 * i5));
    dust = mix(dust, D * 0.8, smoothstep(0.6, 1.4, fw * 230.0));
  }
  return clamp(dots + dust * 0.9, 0.0, 1.0);
}
// fine scratches and scuffs: short random straight grooves, a few per 0.1 CW cell (the worn dorsum of an adult)
float kgScratch(vec2 p, float fw){
  vec2 c = floor(p * 10.0);
  float sc = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cc = c + vec2(float(i), float(j));
    vec3 hh = kgH33(vec3(cc, 7.0));
    if (hh.x > 0.4) continue;
    vec2 a = (cc + hh.yz) / 10.0;
    float an = hh.x * 47.0 + hh.y * 3.0;
    vec2 dir = vec2(cos(an), sin(an));
    vec2 d = p - a;
    float along = dot(d, dir), perp = abs(dot(d, vec2(-dir.y, dir.x)));
    float len = 0.02 + 0.05 * hh.z;
    float w = 0.0005 + 0.0006 * hh.y;
    sc = max(sc, (1.0 - smoothstep(w, w + fw * 0.7, perp)) * (1.0 - smoothstep(len * 0.8, len, abs(along))) * (0.4 + 0.6 * hh.z));
  }
  return sc * (1.0 - smoothstep(0.002, 0.006, fw));
}
// the same for raised granules / grains: a dome height and the offset to the nearest centre (for a normal)
float kgDome(vec3 p, float density, float r, float fw, out vec3 off, out float id){
  vec3 b = floor(p - 0.5);
  float hgt = 0.0; id = 0.0; off = vec3(1.0);
  for (int k = 0; k < 8; k++) {
    vec3 c = b + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 h = kgH33(c);
    if (h.x > density) continue;
    vec3 ctr = c + kgH33(c + 19.7);
    vec3 d = p - ctr;
    float rr = r * (0.6 + 0.8 * h.y);
    float q = length(d) / rr;
    float dome = sqrt(max(0.0, 1.0 - q * q)) * (0.6 + 0.4 * h.y);
    if (dome > hgt) { hgt = dome; off = d; id = h.z; }
  }
  float vis = 1.0 - smoothstep(0.7 * r, 2.2 * r, fw);
  return hgt * vis;
}
`;

const FRAG_COMMON = /* glsl */ `
vec3 kgPerturb(vec3 n, vec3 viewPos, float h){
  vec3 dpx = dFdx(viewPos), dpy = dFdy(viewPos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - g);
}
`;

const VERT_DECL = /* glsl */ `
attribute vec3 aLocal;
attribute vec4 aInfo;
varying vec3 vKgLocal;
varying vec2 vKgUv;
varying vec3 vKgInfo;          // membrane, thinness, (unused)
flat varying float vKgPart;
flat varying float vKgLimb;
varying vec3 vKgWorldN;
`;
const VERT_BODY = /* glsl */ `
vKgLocal = aLocal;
vKgUv = uv;
vKgInfo = vec3(aInfo.z, aInfo.w, 0.0);
vKgPart = aInfo.x;
vKgLimb = aInfo.y;
`;

const FRAG_DECL = /* glsl */ `
uniform vec4 uKgSeed;          // pattern seed, colour seed, purple phase (0..1), paleness (0..1)
uniform vec4 uKgState;         // wetness, sand coat, detail (0 far … 1 macro), crab scale (metres per CW)
uniform vec4 uKgFeed;          // fingertip sand (feeding), mouth wetness, juvenile (0..1), ovigerous (0..1)
uniform vec3 uKgTint;          // individual ground colour (linear)
uniform vec3 uKgDark;          // individual marbling colour (linear)
uniform vec4 uKgMorph;         // breeding red (pink chelae, maroon leg meri; 6.webp), debug view (1 albedo), pale cover of the dorsum, leg tint
uniform vec4 uKgAsym;          // per crab, per side: setae density left, right; dirt amount; roughness bias
varying vec3 vKgLocal;
varying vec2 vKgUv;
varying vec3 vKgInfo;
flat varying float vKgPart;
flat varying float vKgLimb;
${COMMON}
${FRAG_COMMON}
// outputs of the colour stage, read by the later stages
float kgRough = 0.6;
float kgHeight = 0.0;     // CW units
float kgWet = 0.0;
float kgGlint = 0.0;
float kgTrans = 0.0;
float kgAO = 1.0;
float kgCoat = 0.0;
float kgCoatK = 1.0;
float kgCornea = 0.0;
float kgFw = 0.0;
vec3 kgGlintN = vec3(0.0, 0.0, 1.0);
`;

/** the per-part colour / height / roughness model */
const FRAG_SURFACE = /* glsl */ `
{
  vec3 P = vKgLocal;
  float part = vKgPart;
  float limb = floor(vKgLimb / 10.0 + 0.001);
  float seg = vKgLimb - limb * 10.0;
  float fw = max(length(fwidth(P)), 1e-5);        // CW per pixel
  float det = uKgState.z;
  float seedP = uKgSeed.x * 31.0, seedC = uKgSeed.y;
  float purple = uKgSeed.z, pale = uKgSeed.w, juv = uKgFeed.z;
  vec3 ground = uKgTint, marb = uKgDark;
  float red = uKgMorph.x;
  vec3 pal = mix(ground, vec3(0.62, 0.6, 0.56), 0.35);           // translucent limb ground
  // limbs: grey-white translucent cuticle in pale morphs (2.webp, 4.webp), the body's own colours in dark ones
  // how far the legs take the body's tint: little in the grey-white legs of 2.webp and 5.webp, much in the khaki
  // and brown individuals (4.webp, the specimens)
  float legTint = uKgMorph.w;
  vec3 limbG = mix(mix(vec3(0.5, 0.47, 0.39), ground * 0.95, legTint), mix(ground, marb, 0.4), 1.0 - pale);
  vec3 limbD = mix(mix(vec3(0.15, 0.12, 0.085), marb * 1.1 + vec3(0.02, 0.015, 0.008), 0.35 + 0.45 * legTint), marb * 0.75, 1.0 - pale);
  vec3 pink = vec3(0.74, 0.25, 0.27), pinkL = vec3(0.86, 0.5, 0.52), maroon = vec3(0.24, 0.025, 0.035);
  vec3 black = vec3(0.012, 0.010, 0.009);
  vec3 cream = vec3(0.62, 0.55, 0.40);
  vec3 orange = vec3(0.55, 0.24, 0.06);
  vec3 lilac = vec3(0.42, 0.26, 0.44);
  vec3 col = ground;
  float rough = 0.62;
  float h = 0.0;
  float glint = 0.0;
  float trans = vKgInfo.y;
  float wetBias = 0.0;
  float sandExp = 0.0;
  float ao = 1.0;
  float idd;
  vec3 off;
  // ------------------------------------------------------------------ body: carapace, sides, face, sternum
  if (part < 4.5) {
    float s = vKgUv.y;
    vec2 q = vec2(abs(P.x), P.z);      // mirrored (the body plan is symmetric)
    vec2 qs = P.xz;                    // signed (the pigment and the wear are not)
    float dorsal = 1.0 - smoothstep(0.43, 0.5, s);
    float ventral = smoothstep(0.8, 0.9, s);
    float faceM = smoothstep(0.3, 0.38, P.z) * smoothstep(0.44, 0.52, s) * (1.0 - ventral);
    float side = (1.0 - dorsal) * (1.0 - ventral);
    float cover = uKgMorph.z;
    // ---- pigment density, built from several scales (060, 049, 057, 008, 009): a broad, asymmetric variation of
    // the whole dorsum; medium mottling, half mirrored and half not; the radial streaks from the gastric region;
    // the regions' marks — the dark H between gastric and cardiac regions, the arcs behind the orbits, the M before
    // the intestinal region — all drawn only as a crowding of dots, broken and irregular
    vec2 rq = q - vec2(0.0, 0.03);
    float ang = atan(rq.x, rq.y);
    float rad = length(rq);
    float streak = mix(kgFbm(vec3(ang * rad * 11.0, rad * 6.0, seedP + 3.1)), kgFbm(vec3(qs * 8.0, seedP + 6.3)), 0.5);
    float macro = kgFbm2(vec3(qs * 2.4, seedP + 1.7));
    float mott = mix(kgFbm(vec3(q * 10.0, seedP + 6.3)), kgFbm(vec3(qs * 10.0, seedP + 12.1)), 0.5);
    float mott2 = kgFbm(vec3(qs * 23.0, seedP + 17.7));
    float gastric = exp(-((q.x * q.x) / 0.02 + (q.y - 0.12) * (q.y - 0.12) / 0.02));
    float zM = -0.2 - 0.065 * sin(3.14159 * clamp(q.x / 0.36, 0.0, 1.0)) + 0.035 * exp(-pow(q.x / 0.035, 2.0));
    float brk = smoothstep(0.25, 0.6, kgFbm2(vec3(qs * 22.0, seedP + 5.0)));
    float mRidge = (1.0 - smoothstep(0.004, 0.016, abs(q.y - zM))) * (1.0 - smoothstep(0.32, 0.4, q.x));
    float eArc = abs(length(vec2(q.x / 0.44, (q.y - 0.06) / 0.23)) - 1.0) * 0.23;
    float arc = (1.0 - smoothstep(0.004, 0.016, eArc)) * smoothstep(0.12, 0.17, q.x) * smoothstep(0.08, 0.14, q.y);
    float hx = abs(q.x - 0.07 + (kgN3(vec3(qs * 14.0, seedP)) - 0.5) * 0.025);
    float hMark = (1.0 - smoothstep(0.01, 0.035, hx)) * smoothstep(-0.2, -0.12, q.y) * (1.0 - smoothstep(0.0, 0.07, q.y));
    float marks = clamp(hMark * 0.8 + arc * 0.55 + mRidge * 0.45, 0.0, 1.0) * brk;
    // (soft, several sizes: the patches never have the hard edges of a printed camouflage)
    // (the photographs' contrast: L spans 30 units between the 10th and 90th percentile of the dorsum — 049, 069)
    // patches 0.05–0.15 CW across, with fairly sharp edges (049: dark blotches between the pale-granuled fields)
    // the regions' lobes (as the geometry raises them) carry the pale granules; the furrows between them and the
    // blotches are dark (049, 008)
    float lobe = clamp(1.4 * exp(-(pow(q.x - 0.29, 2.0) + pow(q.y + 0.1, 2.0)) / 0.029) + 1.2 * exp(-(pow(q.x - 0.31, 2.0) + pow(q.y - 0.17, 2.0)) / 0.0081)
      + 1.1 * exp(-(pow(q.x - 0.11, 2.0) + pow(q.y - 0.2, 2.0)) / 0.0064) + 0.9 * exp(-(q.x * q.x + pow(q.y + 0.15, 2.0)) / 0.0064), 0.0, 1.0);
    float blot = clamp(smoothstep(0.42, 0.62, mott) + 0.55 * (1.0 - lobe) - 0.25, 0.0, 1.0);
    float D = 0.06 + 0.4 * (1.0 - cover) + 1.05 * blot + 0.4 * smoothstep(0.3, 0.7, mott2) + 0.35 * smoothstep(0.3, 0.7, macro) + 0.25 * (streak - 0.5) + 0.5 * marks - 0.04 * gastric;
    D += side * 0.1;
    // the face is dark: densely dusted around the orbits and the buccal frame (063, 027)
    D = mix(D, 0.66 + 0.6 * (mott - 0.5) + 0.25 * (1.0 - cover), faceM);
    D = clamp(D, 0.03, 0.95);
    // ---- the ground under the dots: sand-beige, grey-beige, pale brown in broad patches (no two areas alike)
    vec3 baseC = ground * (0.72 + 0.24 * macro);
    baseC = mix(baseC, baseC * vec3(0.93, 0.97, 1.05), smoothstep(0.4, 0.72, kgFbm2(vec3(qs * 4.0, seedP + 21.0))));
    baseC = mix(baseC, baseC * vec3(1.06, 0.98, 0.88), smoothstep(0.45, 0.78, kgFbm2(vec3(qs * 3.0, seedP + 27.0))));
    float tone;
    float pig = kgPig(P + vec3(seedP), D, fw, tone);
    // the dorsum's ground is darker than the limbs' (049, 069: the pale is in the granules, not between them), and
    // darkest in the blotches
    baseC *= 1.0 - (0.25 + 0.42 * blot) * dorsal;
    vec3 pigC = mix(marb * 0.42, marb * 1.05 + vec3(0.01, 0.007, 0.0), tone);
    vec3 dcol = mix(baseC, pigC, pig);
    // the translucent rim inside the lateral and posterior margins: fewer dots, paler (008)
    float rimZ = 1.0 - smoothstep(0.24, 0.32, q.y) * (1.0 - smoothstep(0.36, 0.44, q.x));
    float rim = smoothstep(0.39, 0.43, s) * (1.0 - smoothstep(0.5, 0.56, s)) * rimZ;
    dcol = mix(dcol, mix(baseC, vec3(0.5, 0.47, 0.4), 0.3), rim * 0.45);
    // ---- relief: granules everywhere, coarser tubercles on the branchial regions, cardiac & intestinal smooth [L]
    float branch = smoothstep(0.12, 0.3, q.x) * (1.0 - smoothstep(0.42, 0.5, s)) * smoothstep(-0.38, -0.05, -abs(q.y + 0.08) * 1.4);
    float smoothCard = exp(-((q.x * q.x) / 0.012 + (q.y + 0.2) * (q.y + 0.2) / 0.03));
    float tub = 0.0, tub2 = 0.0, scr = 0.0;
    if (det > 0.05) {
      // (049: some 700 pale granules over the dorsum, 0.012–0.025 CW across, densest on the branchial and gastric
      // regions, sparse on the cardiac)
      // the pale granules crowd in the pale fields and thin out in the dark blotches: the pattern IS their density
      float gd = 0.25 + 0.75 * (1.0 - blot);
      tub = kgDome(vec3(qs * 52.0, seedP * 0.37) + vec3(0.0, 0.0, P.y * 52.0), mix(0.55, 0.9, branch) * (1.0 - smoothCard * 0.6) * gd, 0.46, fw * 52.0, off, idd);
      tub2 = kgDome(P * 110.0 + seedP, 0.75 * (1.0 - 0.5 * smoothCard) * gd, 0.36, fw * 110.0, off, idd);
      float tub3 = kgDome(P * 260.0 + seedP + 3.0, 0.55, 0.34, fw * 260.0, off, idd);
      h += (tub * 0.013 + tub2 * 0.0045 + tub3 * 0.0012) * (dorsal + 0.6 * side);
      // the granules' tips are pale (the specimens' golden flecks; 049's pale dots on a dark back)
      // (049, 060: pale yellowish dots salt every dark field — the granules' tips)
      dcol = mix(dcol, ground * 1.25 + vec3(0.06, 0.05, 0.025), clamp(smoothstep(0.3, 0.85, tub) * 0.85 + smoothstep(0.45, 1.0, tub2) * (0.25 + 0.6 * D), 0.0, 0.92) * (dorsal + 0.5 * side));
      // micro-relief that no two square millimetres share: fine pits and a grainy skin
      h += (kgN3(P * 420.0 + seedP) - 0.5) * 0.0007 * (1.0 - smoothstep(0.0008, 0.003, fw));
      // the scuffs of a life on sand: fine scratches, slightly paler and smoother
      scr = kgScratch(qs + seedP * 0.013, fw) * dorsal;
      h -= scr * 0.0012;
      dcol = mix(dcol, dcol * 1.18 + 0.015, scr * 0.5);
    }
    // grooves: cervical (curving across), the H between gastric and cardiac, the epibranchial furrows; soft
    float cerv = abs(q.y - (0.08 - 0.55 * q.x * q.x));
    float groove = (1.0 - smoothstep(0.0, 0.014, cerv)) * smoothstep(0.05, 0.12, q.x) * (1.0 - smoothstep(0.3, 0.36, q.x));
    float wob = (kgN3(vec3(qs * 18.0, seedP)) - 0.5) * 0.012;
    float hgr = (1.0 - smoothstep(0.0, 0.016, abs(q.x - 0.065 + wob))) * smoothstep(-0.19, -0.12, q.y) * (1.0 - smoothstep(-0.01, 0.05, q.y));
    float eArcG = abs(length(vec2(q.x / 0.44, (q.y - 0.075) / 0.23)) - 1.0) * 0.23;
    float arcG = (1.0 - smoothstep(0.0, 0.014, eArcG)) * smoothstep(0.12, 0.17, q.x) * smoothstep(0.08, 0.14, q.y);
    float grooves = max(max(groove, hgr), arcG) * dorsal;
    h -= grooves * 0.005;
    dcol *= 1.0 - grooves * 0.22;
    // the lateral border: a beaded crest along the girth [L]
    float crest = (1.0 - smoothstep(0.0, 0.012 + 0.006 * kgN3(vec3(vKgUv.x * 60.0, seedP, 2.0)), abs(s - 0.485))) * (1.0 - faceM);
    float beads = 0.5 + 0.5 * cos(vKgUv.x * 6.2831853 * 140.0 + kgN3(vec3(vKgUv.x * 40.0, seedP, 5.0)) * 4.0);
    h += crest * (0.0015 + 0.0015 * beads);
    dcol = mix(dcol, ground * 1.1, crest * 0.2 * (0.6 + 0.4 * kgN3(vec3(vKgUv.x * 90.0, seedP, 1.0))));
    // ---- face: suborbital ridge with a row of small granules [L]; below the maxillipeds the pale front of the
    // sternum (2.webp)
    float subOrb = (1.0 - smoothstep(0.0, 0.02, abs(P.y - 0.36))) * smoothstep(0.08, 0.12, q.x) * (1.0 - smoothstep(0.34, 0.4, q.x));
    float gran = 0.5 + 0.5 * cos(q.x * 6.2831853 * 34.0);
    h += subOrb * faceM * 0.003 * gran;
    vec3 fcol = mix(dcol, ground, subOrb * gran * 0.2);
    float lowF = smoothstep(0.12, 0.04, P.y);
    fcol = mix(fcol, mix(vec3(0.5, 0.46, 0.4), vec3(0.5, 0.46, 0.56), clamp(purple + red, 0.0, 1.0)), lowF * 0.3);
    // ---- ventral (3.webp): the sternum's lateral plates violet ("the underside red-purple" [L]), deepest toward the
    // legs, pale lavender in front of the chelipeds' bases; every suture and plate margin white; fine grey dots.
    float zs = P.z;
    float sutD = min(min(abs(zs - 0.235 + 0.6 * q.x * q.x), abs(zs - 0.085 + 0.5 * q.x * q.x)), min(abs(zs + 0.05 + 0.4 * q.x * q.x), abs(zs + 0.18 + 0.3 * q.x * q.x)));
    float suture = (1.0 - smoothstep(0.004, 0.014, sutD)) * smoothstep(0.17, 0.27, q.x);
    // the live underside's violet: deep in pale and purplish individuals (3.webp), faint in the sand-coloured ones
    float violetAmt = clamp(0.35 + 0.5 * purple + 0.3 * red + 0.4 * smoothstep(0.82, 0.86, pale), 0.0, 1.0);
    float violet = violetAmt * (1.0 - smoothstep(0.16, 0.26, zs)) * smoothstep(0.03, 0.12, q.x);
    vec3 vcol = mix(vec3(0.54, 0.52, 0.6), vec3(0.11, 0.045, 0.3), violet * (0.8 + 0.2 * smoothstep(0.1, 0.3, q.x)));
    vcol = mix(vcol, vec3(0.82, 0.82, 0.84), suture * 0.85);
    vcol = mix(vcol, vec3(0.1, 0.09, 0.11), kgSpeck(P * 85.0 + seedP + 11.0, 0.45, 0.26, fw * 85.0, idd) * 0.5);
    vcol *= 1.0 - (1.0 - smoothstep(0.004, 0.012, q.x)) * 0.3;
    // the front of the sternum lies back under the maxillipeds and the folded chelae: in their shade in the living
    // crab (063, 027), whatever the sun — too small for the shadow map to catch
    vcol *= 1.0 - 0.55 * smoothstep(0.14, 0.3, zs);
    float under = smoothstep(0.6, 0.72, s) * (1.0 - ventral) * (1.0 - smoothstep(0.3, 0.42, P.z));
    vec3 ucol = mix(vcol, vec3(0.55, 0.56, 0.62), (1.0 - smoothstep(0.6, 0.7, s)) * 0.6);
    vec3 scol = mix(dcol, ucol, under);
    col = dcol * dorsal + scol * side * (1.0 - faceM) + fcol * faceM * (1.0 - dorsal) + vcol * ventral;
    // ---- roughness: a satin cuticle, uneven — tubercle tips and scuffs worn smoother, the granular flanks
    // rougher, never one value (063: broad soft highlights broken by the granules)
    float rN = kgFbm2(vec3(qs * 14.0, seedP + 33.0));
    rough = (0.56 + 0.16 * (rN - 0.5) - 0.12 * smoothstep(0.5, 1.0, tub) - 0.1 * scr + 0.06 * branch) * dorsal + (0.62 + 0.1 * (rN - 0.5)) * side + 0.5 * ventral;
    rough += uKgAsym.w;
    // ---- dirt: silt and sand lodged in the grooves, along the girth and the orbits, in patches that differ left and
    // right (049, 060, 069)
    float cavity = clamp(grooves * 1.2 + vKgInfo.x * 0.9 + crest * 0.5 + rim * 0.35 + side * 0.25, 0.0, 1.0);
    float dn = kgFbm(vec3(qs * 7.0, seedP + 44.0));
    float dirt = clamp(smoothstep(0.5, 0.85, dn + cavity * 0.45), 0.0, 1.0) * uKgAsym.z * (1.0 - ventral);
    col = mix(col, vec3(0.3, 0.25, 0.18), dirt * 0.5);
    rough = mix(rough, 0.86, dirt * 0.6);
    // the buccal cavity (behind the third maxillipeds): dark
    float cav = (1.0 - smoothstep(0.16, 0.2, q.x)) * smoothstep(0.09, 0.13, P.y) * (1.0 - smoothstep(0.33, 0.37, P.y)) * smoothstep(0.37, 0.4, P.z) * (1.0 - dorsal);
    col = mix(col, vec3(0.02, 0.016, 0.014), cav);
    rough = mix(rough, 0.35, cav);
    ao = mix(ao, 0.25, cav);
    ao *= 1.0 - 0.25 * grooves - 0.15 * dirt;
    // glitter: a few white chromatophores catch the sun
    if (det > 0.3) glint = kgSpeck(P * 160.0 + seedP + 41.0, 0.12 + 0.18 * side, 0.18, fw * 160.0, idd) * 0.6;
    trans = 0.1 + 0.25 * rim + 0.08 * side;
    // the granular dorsum breaks the water film into sparkles: no mirror coat there (2.webp)
    kgCoatK = 1.0 - 0.85 * dorsal - 0.5 * side - 0.75 * ventral;
    wetBias = 0.25 * ventral + 0.15 * faceM + 0.2 * cavity;
    sandExp = 0.35 * ventral + 0.25 * side * smoothstep(0.55, 0.75, s) + dirt * 0.6;
    ao *= mix(1.0, 0.6, smoothstep(0.6, 0.9, s) * (1.0 - ventral)); // under the overhang of the carapace
    // the underside faces the sand a few tenths of a millimetre away: it sees little sky and no sun, and shows no
    // sheen — seen from the front it is a shadow under the maxillipeds (063, 027), not a pale glassy plate
    ao *= 1.0 - 0.7 * ventral;
    trans *= 1.0 - ventral;
    // and the low front of the sternum under the maxillipeds, a hair above the sand, is in their shadow (063)
    ao *= 1.0 - 0.5 * lowF * faceM;
    kgCoatK -= 0.6 * lowF * faceM;
  }
  // ------------------------------------------------------------------ eyestalks and cornea
  else if (part < 5.5) {
    float isDistal = step(0.5, seg);
    float th = vKgUv.x * 6.2831853;
    // the cornea is an oblique oval window on the front and outer face of the tip: low on the front, and the clear,
    // speckled cuticle of the stalk wraps round behind it and over its very end — the eye is a club with a dark
    // window, not a black ball on a stick (013, 063, 4.webp)
    float edge = ${(EYE.stalkLen + 0.007).toFixed(4)} - 0.014 * cos(th - 0.6);
    float facing = smoothstep(-0.5, 0.15, cos(th - 0.6));
    float tipX = ${(EYE.stalkLen + EYE.corneaLen).toFixed(4)};
    float cornea = isDistal * smoothstep(edge - 0.003, edge + 0.003, P.x) * facing * (1.0 - 0.6 * smoothstep(tipX - 0.01, tipX + 0.004, P.x));
    // the stalk: pale, translucent, dusted with fine dark dots, denser just under the cornea (063, 013)
    // (063, 027: the stalk is densely speckled brown-grey, darkest just under the cornea)
    float Ds = 0.68 + 0.25 * smoothstep(edge - 0.06, edge - 0.005, P.x) * isDistal + 0.3 * (kgFbm(P * 40.0 + seedP + limb) - 0.5);
    vec3 stalk = mix(limbG * 0.95, mix(ground, marb, 0.5), 0.3);
    float tone;
    float pg = kgPig(P * 1.4 + vec3(limb * 3.0, seedP, 1.0), clamp(Ds, 0.03, 0.9), fw * 1.4, tone);
    stalk = mix(stalk, mix(limbD * 0.3, limbD * 0.85, tone), pg * 0.9);
    // the basal article sits in the orbit: shaded
    stalk *= 1.0 - 0.25 * (1.0 - isDistal);
    if (det > 0.2) glint = kgSpeck(P * 170.0 + seedP + 3.0, 0.3, 0.2, fw * 170.0, idd) * (1.0 - cornea) * 0.6;
    // cornea: wet and nearly black, a faint bronze in the facets (063, 027, 013); it shows the sky and the sun
    float rimE = smoothstep(${(EYE.corneaR * 0.32).toFixed(4)}, ${(EYE.corneaR * 0.8).toFixed(4)}, length(P.yz));
    // (063, 027: dark grey-brown, not black, a little paler round its rim)
    vec3 corn = mix(vec3(0.07, 0.058, 0.045), vec3(0.17, 0.14, 0.1), rimE * 0.8);
    float fleck = kgSpeck(P * 240.0 + seedP + 7.0, 0.4, 0.28, fw * 240.0, idd);
    corn = mix(corn, vec3(0.16, 0.12, 0.06), fleck * 0.5);
    // ommatidial facets: a fine ripple at macro range
    float fac = (0.5 + 0.5 * cos(P.x * 900.0) * cos(th * 40.0)) * (1.0 - smoothstep(0.0, 0.002, fw));
    h += cornea * fac * 0.00025;
    // a pale ring where cornea meets stalk (063: a cream band under each eye)
    float ring = (1.0 - smoothstep(0.0, 0.007, abs(P.x - edge + 0.004))) * isDistal;
    col = mix(stalk, corn, cornea);
    col = mix(col, vec3(0.6, 0.55, 0.42), ring * 0.45 * (1.0 - cornea));
    rough = mix(0.4, 0.035, cornea);
    trans = mix(0.55, 0.0, cornea);
    kgCoat = cornea;
    kgCornea = cornea;
    wetBias = 0.3;
  }
  // ------------------------------------------------------------------ third maxillipeds
  else if (part < 7.5) {
    // most crabs: the face in the body's own pale ground under a dense dusting of dark dots, densest on the upper
    // (merus) field, a pale oblique gap (the blaze) and a thinly dotted lower ischium (063, 027, 035, 069); a black
    // and white face only in dark-backed individuals (2.webp, 003); rounded tubercles all over [L]
    float sideUp = limb < 12.5 ? 1.0 : -1.0;
    float xm = clamp(P.x / ${MXP3.width.toFixed(4)}, 0.0, 1.0);          // 0 hinge … 1 midline
    float zn = P.z * sideUp / ${(MXP3.height * 0.5).toFixed(4)};                  // -1 bottom … 1 top
    float sutL = zn - (0.1 - 0.14 * xm);             // > 0 above the ischium–merus suture (Geometry mxpSuture)
    // the merus densely dotted, the ischium thinly (063, 027: the upper plate darker)
    float field = smoothstep(-0.12, 0.08, sutL + 0.2 * (kgFbm(vec3(P.x * 18.0, P.z * 18.0, seedP + limb)) - 0.5));
    float contrast = 1.0 - smoothstep(0.55, 0.85, uKgMorph.z);
    float bl = (zn - 0.15) - (xm - 0.75) * 0.9;
    float blaze = (1.0 - smoothstep(0.06, 0.2, abs(bl))) * smoothstep(0.25, 0.6, xm) * smoothstep(-0.1, 0.25, zn) * (1.0 - smoothstep(0.75, 0.95, zn));
    float Dm = clamp(0.4 + field * (0.45 + 0.3 * contrast) - blaze * (0.22 + 0.4 * contrast) + 0.35 * (kgFbm(vec3(P.xz * 24.0, seedP + limb + 4.0)) - 0.5), 0.03, 0.95);
    vec3 m = mix(mix(limbG, ground, 0.45) * (0.68 + 0.14 * kgFbm2(P * 9.0 + seedP + limb)), vec3(0.7, 0.67, 0.6), contrast * 0.6);
    float tone;
    float pg = kgPig(P + vec3(limb * 5.0, seedP, 3.0), Dm, fw, tone);
    // (the contrasting faces are dark brown over cream, not black over white: 002–004)
    vec3 pc = mix(mix(marb * 0.42, marb * 1.05, tone), marb * 0.35 + vec3(0.02, 0.012, 0.005), contrast * 0.8);
    m = mix(m, pc, pg);
    float rimM = smoothstep(0.86, 1.0, max(abs(zn), abs(xm * 2.0 - 1.0)));
    m = mix(m, mix(ground * 1.1, vec3(0.84, 0.83, 0.8), contrast), rimM * 0.35);
    // the suture line and tubercles
    float suture = (1.0 - smoothstep(0.0, 0.06, abs(sutL))) * (1.0 - smoothstep(0.92, 1.0, xm)) * smoothstep(0.0, 0.06, xm);
    h -= suture * 0.003;
    m *= 1.0 - suture * 0.3;
    if (det > 0.05) {
      float tb = kgDome(P * 95.0 + seedP + 3.0, 0.6, 0.32, fw * 95.0, off, idd);
      float tb2 = kgDome(P * 240.0 + seedP + 9.0, 0.5, 0.34, fw * 240.0, off, idd);
      h += tb * 0.0024 + tb2 * 0.0009;
      m = mix(m, m * 1.15 + 0.02, tb * 0.2);
    }
    if (det > 0.2) glint = kgSpeck(P * 180.0 + seedP + 17.0, 0.25, 0.2, fw * 180.0, idd) * (0.4 + 0.6 * field) * 0.6;
    col = m;
    rough = 0.46 + 0.12 * (kgFbm2(P * 20.0 + seedP + limb) - 0.5) + uKgAsym.w;
    trans = 0.15; wetBias = 0.35 + 0.4 * uKgFeed.y;
    kgCoatK = 0.35;
  }
  // ------------------------------------------------------------------ abdomen (folded under the sternum)
  else if (part < 8.5) {
    // pale grey-blue, finely speckled, a dusky patch on its middle segments; sutures faint (3.webp)
    vec3 a = mix(vec3(0.6, 0.64, 0.7), limbG, 0.25);
    a = mix(a, a * 0.62, exp(-pow((P.z - 0.22) / 0.07, 2.0)) * 0.6);
    a = mix(a, vec3(0.08, 0.08, 0.1), kgSpeck(P * 95.0 + seedP + 23.0, 0.55, 0.26, fw * 95.0, idd) * 0.55);
    float segs = 1.0 - smoothstep(0.0, 0.006, abs(fract(P.z * 9.0 + 0.2) - 0.5) - 0.47);
    a *= 1.0 - segs * 0.15;
    h -= segs * 0.0015;
    col = a; rough = 0.5; wetBias = 0.15;
    ao *= 0.5;
  }
  // ------------------------------------------------------------------ chelipeds
  else if (part < 11.5) {
    float t = vKgUv.y;
    float th = vKgUv.x * 6.2831853;
    float sideS = limb < 8.5 ? 1.0 : -1.0;
    float inner = smoothstep(0.35, 0.7, cos(th) * sideS);
    float cover = uKgMorph.z;
    float sj = kgH31(vec3(limb * 7.0 + seg, seedP, 3.0));
    // merus and carpus: the legs' translucent sandy cuticle, densely dotted, darker above (063, 049, 027)
    vec3 armB = mix(limbG, ground, 0.35) * (0.9 + 0.2 * sj);
    // the carpus' rounded top is as densely dotted as the carapace — a dark cap over the pale palm (063, 027, 049)
    // (which way is up: the world's, as the folded carpus lies — its own axes turn with the pose)
    float upF = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float capTop = seg > 3.5 ? 0.25 + 0.35 * smoothstep(-0.3, 0.5, upF) : 0.2 * smoothstep(-0.2, 0.6, sin(th));
    float Da = clamp(0.42 + 0.25 * (1.0 - cover) + 0.55 * (kgFbm(P * 16.0 + vec3(limb, seg, seedP)) - 0.5) + capTop, 0.03, 0.95);
    float tone;
    float pg = kgPig(P + vec3(limb * 4.0, seg * 2.0, seedP), Da, fw, tone);
    armB *= 1.0 - 0.18 * capTop;
    vec3 arm = mix(armB, mix(limbD * 0.3, limbD * 0.85, tone), pg * 0.92);
    // (the violet flush of the arm is a breeding male's, 6.webp — not the faint red of the grey morph, 069)
    arm = mix(arm, mix(arm, vec3(0.3, 0.22, 0.6) * 0.5, 0.6), smoothstep(0.5, 0.9, red) * 0.6);
    // granular arm; the palm finely so, the fingers smooth
    if (det > 0.05 && part < 9.5) {
      float g = kgDome(P * 120.0 + seg * 3.3 + limb, 0.55, 0.3, fw * 120.0, off, idd);
      h += g * 0.0025;
      arm = mix(arm, ground * 1.2 + 0.02, g * 0.25);
    } else if (det > 0.05 && part < 10.5) {
      float g = kgDome(P * 230.0 + limb, 0.45, 0.3, fw * 230.0, off, idd);
      h += g * 0.0008 * (1.0 - smoothstep(0.21, 0.26, P.x));
    }
    col = arm; rough = 0.48 + 0.1 * (sj - 0.5) + uKgAsym.w; trans = 0.3;
    if (seg > 2.5 && seg < 3.5) {
      // merus: a long oval tympanum on the inner face [L] — darker, glossier
      float ty = inner * max(0.0, 1.0 - pow((t - 0.5) / 0.34, 2.0));
      float tym = smoothstep(0.0, 0.25, ty);
      col = mix(col, col * 0.75, tym * 0.6);
      rough = mix(rough, 0.32, tym);
      h -= tym * 0.0015;
    }
    if (part > 9.5) {
      // propodus: palm, then the fixed finger (the dactylus is part 11 throughout)
      float x = P.x;
      float fing = part > 10.5 ? 1.0 : smoothstep(${(CHELIPED.palm - 0.02).toFixed(3)}, ${(CHELIPED.palm + 0.025).toFixed(3)}, x);
      // the palm: translucent, a pale yellow-brown (063, 027: cream; 011: grey), its dots crowding over the
      // proximal upper part; never white
      // (063: a warm golden tan, rgb ≈ 144, 118, 88 under the evening sun — darker and warmer than cream)
      // (warm tan in the sandy individuals, 063; bluish-white and glassy in the pale ones, 002–004)
      vec3 palmB = mix(limbG, vec3(0.56, 0.41, 0.22), 0.15 + 0.85 * legTint) * (0.95 + 0.1 * kgFbm2(P * 7.0 + seedP + limb));
      float dusk = clamp(smoothstep(0.12, 0.025, x) * 0.8 + smoothstep(-0.03, 0.05, P.y) * (1.0 - smoothstep(0.15, 0.24, x)), 0.0, 1.0);
      dusk *= 0.55 + 0.45 * kgFbm2(P * 30.0 + seedP);
      float Dp = clamp(0.46 + 0.5 * dusk + 0.55 * (kgFbm(P * 22.0 + vec3(limb, 4.0, seedP)) - 0.5), 0.03, 0.95);
      float tp;
      float pp = kgPig(P * 1.2 + vec3(limb * 6.0, seedP, 5.0), Dp, fw * 1.2, tp);
      vec3 palmC = mix(palmB, mix(limbD * 0.3, limbD * 0.8, tp), pp * 0.92);
      // breeding males: pink-white, pinker along the upper margin, dark-speckled (6.webp)
      vec3 palmR = mix(mix(pinkL, vec3(0.82, 0.76, 0.76), 0.45), pink, smoothstep(0.0, 0.08, P.y) * 0.5);
      palmR = mix(palmR, vec3(0.06, 0.03, 0.03), kgSpeck(P * 150.0 + seedP + 39.0, 0.35, 0.3, fw * 150.0, idd) * 0.7);
      palmC = mix(palmC, palmR, smoothstep(0.4, 0.9, red) * 0.9);
      // fine silt in the palm's pits
      palmC = mix(palmC, vec3(0.3, 0.25, 0.18), smoothstep(0.6, 0.9, kgFbm(P * 34.0 + seedP + 8.0)) * uKgAsym.z * 0.45);
      if (det > 0.2) glint = max(glint, kgSpeck(P * 190.0 + seedP + 43.0, 0.2, 0.2, fw * 190.0, idd) * (1.0 - fing) * 0.6);
      // fingers: pale horn, smooth and glossy; yellowish where they leave the palm (063: the joints glow yellow-
      // orange), a darker line along the denticulate edge, horn-yellow tips; pink only in breeding males
      float ft = part > 10.5 ? clamp(x / ${CHELIPED.dactylus.toFixed(3)}, 0.0, 1.0) : clamp((x - ${CHELIPED.palm.toFixed(3)}) / ${CHELIPED.finger.toFixed(3)}, 0.0, 1.0);
      float cutSide = part > 10.5 ? -sin(th) : sin(th);
      float edge = smoothstep(0.1, 0.8, cutSide);
      vec3 fcol = mix(limbG, vec3(0.6, 0.5, 0.32), 0.5) * (0.88 + 0.12 * kgFbm2(P * 12.0 + seedP + limb));
      fcol = mix(fcol, vec3(0.72, 0.48, 0.16), (1.0 - smoothstep(0.0, 0.25, ft)) * 0.5);
      fcol = mix(fcol, fcol * 0.72, edge * smoothstep(0.1, 0.4, ft) * 0.4);
      fcol = mix(fcol, mix(pinkL, pink, 0.3 + 0.7 * red), smoothstep(0.5, 0.92, ft) * smoothstep(0.3, 0.8, red) * 0.8);
      fcol = mix(fcol, mix(vec3(0.55, 0.42, 0.16), vec3(0.25, 0.08, 0.06), red), smoothstep(0.88, 1.0, ft) * 0.7);
      // fine growth lines and pits along the fingers
      if (det > 0.05) h += ((kgN3(vec3(x * 180.0, P.y * 30.0, P.z * 30.0 + limb)) - 0.5) * 0.0005 + kgDome(P * 260.0 + seedP + limb, 0.35, 0.3, fw * 260.0, off, idd) * 0.0005) * fing;
      float tf;
      fcol = mix(fcol, limbD * 0.55, kgPig(P * 1.5 + vec3(limb * 2.0, seedP, 9.0), 0.1 + 0.25 * (1.0 - ft), fw * 1.5, tf) * 0.6);
      col = mix(palmC, fcol, fing);
      rough = mix(0.42 + 0.1 * (kgFbm2(P * 18.0 + seedP) - 0.5), 0.24, fing) + uKgAsym.w;
      trans = mix(0.5, 0.55, fing);
      // feeding leaves sand on the fingertips
      sandExp = fing * smoothstep(0.5, 0.95, ft) * (0.4 + uKgFeed.x);
      wetBias = fing * 0.2 * uKgFeed.x;
    }
  }
  // ------------------------------------------------------------------ walking legs
  else if (part < 15.5) {
    float t = vKgUv.y;
    float th = vKgUv.x * 6.2831853;
    float jitter = (kgH31(vec3(limb, seg, seedP)) - 0.5) * 0.06;
    // every segment its own shade and pigment (no two alike; 049, 057, 068)
    float sj = kgH31(vec3(limb * 7.0 + seg, seedP, 3.0)), sj2 = kgH31(vec3(limb * 5.0 + seg, seedP, 9.0));
    // banding: dark bands at about the same places on every leg (009, 018–021, 035, 049, 054, 069) [P]
    float band = 0.0;
    float w1 = 0.08 + 0.1 * sj, w2 = 0.07 + 0.1 * sj2;
    float tw = t + 0.06 * (kgN3(vec3(th * 1.5, limb + seg * 3.0, seedP)) - 0.5);   // the band's edge wavers across
    if (part > 12.5 && part < 13.5) band = max(max(smoothstep(w1 + 0.08, w1 * 0.3, abs(tw - 0.24 - jitter * 2.0)), smoothstep(w2 + 0.08, w2 * 0.3, abs(tw - 0.6 + jitter * 2.0))), 0.7 * smoothstep(0.09, 0.0, abs(tw - 0.9)));
    else if (part > 13.5 && part < 14.5) band = seg < 4.5 ? smoothstep(0.32, 0.06 + 0.1 * sj, abs(tw - 0.5 - jitter)) : max(smoothstep(0.2, 0.03, abs(tw - 0.38 - jitter)), 0.7 * smoothstep(0.1, 0.0, abs(tw - 0.88)));
    else if (part > 14.5) band = smoothstep(0.32, 0.12, tw) * 0.8;
    // broken: a band is a cloud of blotches; and blotches turn up between the bands too
    band *= 0.3 + 0.7 * smoothstep(0.3, 0.62, kgFbm(P * 34.0 + vec3(limb * 3.1, seg, seedP)));
    band = max(band, 0.55 * smoothstep(0.6, 0.78, kgFbm(P * 22.0 + vec3(limb * 1.9, seg * 2.0, seedP + 40.0))));
    // the bands are a dorsal pattern: the underside of the leg is pale, finely dotted (3.webp)
    band *= 0.35 + 0.65 * smoothstep(-0.85, -0.2, sin(th));
    band = smoothstep(0.08, 0.7, band + 0.4 * (kgFbm(P * 26.0 + limb * 1.7 + seg) - 0.5));
    // the margins (fore and aft edges of the flattened segments) are clear and glassy, the core — muscle under
    // the cuticle — a little darker (010, 049)
    float marginT = smoothstep(0.6, 0.92, abs(cos(th)));
    vec3 lgB = limbG * (0.86 + 0.18 * sj) * mix(vec3(1.0), vec3(1.05, 1.0, 0.9), sj2);
    lgB = mix(lgB, lgB * 0.84, (1.0 - marginT) * 0.55);
    lgB = mix(lgB, lgB * 1.12 + vec3(0.02, 0.018, 0.012), marginT * 0.5);
    // the bands, the mottling and everything else are only the density of the dark dots
    // (the bands are soft: a crowding of the dots, not a solid ring — 063, 010, 068)
    float D = clamp(0.22 + 0.2 * sj2 + band * 0.75 + 0.3 * (kgFbm(P * 30.0 + vec3(limb * 1.3, seg, seedP)) - 0.5), 0.03, 0.95) * (1.0 - 0.7 * marginT);
    float tone;
    float pg = kgPig(P + vec3(limb * 1.7, seg * 2.3, seedP), D, fw, tone);
    vec3 lg = mix(lgB, mix(limbD * 0.3, limbD * 0.85, tone), pg * 0.92);
    // erythrophores: a few red-brown dots (010)
    lg = mix(lg, vec3(0.32, 0.06, 0.03), kgSpeck(P * 120.0 + vec3(limb, seg, seedP + 5.0), 0.06, 0.3, fw * 120.0, idd) * 0.6);
    // the cuticle darkens toward each articulation; the joint membranes themselves are pale orange (009, 049)
    float jd = clamp((1.0 - smoothstep(0.0, 0.07, t)) + (1.0 - smoothstep(0.0, 0.06, 1.0 - t)), 0.0, 1.0);
    lg = mix(lg, limbD * 0.55, jd * (0.35 + 0.25 * sj));
    ao *= 1.0 - 0.3 * jd;
    // purplish individuals: the legs carry the tint (024, 025, 040–044)
    lg = mix(lg, lg * vec3(1.04, 0.94, 1.08), purple * 0.5);
    if (part > 12.5 && part < 13.5) lg = mix(lg, maroon * (0.7 + 0.6 * kgFbm2(P * 20.0 + limb)), smoothstep(0.45, 0.9, red) * 0.85 * smoothstep(-0.2, 0.6, sin(th)));
    // the coxae share the underside's violet
    if (part < 12.5) lg = mix(lg, vec3(0.17, 0.075, 0.33), clamp(0.45 + 0.35 * purple + 0.3 * red, 0.0, 1.0) * 0.55 * (1.0 - smoothstep(0.0, 0.6, sin(th))));
    // glossier than the carapace, smoothest on the clear margins, uneven (049, 068: the legs shine)
    rough = 0.3 + 0.12 * (kgFbm2(P * 16.0 + vec3(limb, seg, seedP)) - 0.5) - 0.08 * marginT + 0.06 * jd + uKgAsym.w;
    trans = 0.5 + 0.35 * marginT;
    // the merus: one undivided oval tympanum on each broad face [L] — a little darker and glossier (010)
    if (part > 12.5 && part < 13.5) {
      float faceY = abs(sin(th));
      float ov = max(0.0, 1.0 - pow((t - 0.52) / 0.36, 2.0)) * max(0.0, 1.0 - pow(cos(th) / 0.74, 2.0));
      float tym = smoothstep(0.02, 0.3, ov) * smoothstep(0.3, 0.6, faceY);
      lg = mix(lg, lg * 0.86, tym * 0.5);
      rough = mix(rough, 0.28, tym * 0.6);
      trans += tym * 0.1;
      if (det > 0.2) glint = kgSpeck(P * 220.0 + vec3(limb, seedP, 5.0), 0.3, 0.2, fw * 220.0, idd) * (0.25 + 0.5 * tym);
      // the margins of the merus: a granular crest
      float margin = smoothstep(0.75, 0.97, abs(cos(th)));
      if (det > 0.05) h += margin * kgDome(P * 140.0 + limb, 0.6, 0.3, fw * 140.0, off, idd) * 0.002;
    } else if (det > 0.3) {
      glint = kgSpeck(P * 200.0 + vec3(limb, seedP, 9.0), 0.15, 0.2, fw * 200.0, idd) * 0.6;
    }
    // granulation, pits and a slightly uneven skin over every segment (no smooth tubes; 010, 049)
    if (det > 0.05) {
      h += kgDome(P * 210.0 + vec3(limb * 3.0, seg, seedP), 0.55, 0.36, fw * 210.0, off, idd) * 0.0015;
      h += kgDome(P * 95.0 + vec3(limb * 7.0, seg, seedP + 2.0), 0.3, 0.32, fw * 95.0, off, idd) * 0.0012;
      h += (kgFbm2(P * 70.0 + vec3(limb, seg, seedP)) - 0.5) * 0.0016 * (1.0 - smoothstep(0.001, 0.006, fw));
    }
    // dactylus: paler and more translucent toward the sharp tip, horn-brown at the very point
    if (part > 14.5) {
      // toward the point clear horn, amber where the light comes through, the very point brown (063, 068)
      lg = mix(lg, vec3(0.6, 0.5, 0.32), smoothstep(0.35, 0.85, t) * 0.55);
      lg = mix(lg, vec3(0.3, 0.2, 0.1), smoothstep(0.88, 1.0, t) * 0.7);
      trans = 0.75;
      rough = 0.42 + uKgAsym.w;
      sandExp = 0.55 + 0.45 * smoothstep(0.3, 1.0, t);
      wetBias = 0.35;
    } else if (part > 13.5) {
      sandExp = seg > 4.5 ? 0.3 : 0.15;
      wetBias = 0.15;
    }
    // silt along the joints and the margins, more on some legs than others
    float ld = smoothstep(0.55, 0.85, kgFbm(P * 20.0 + vec3(limb * 2.0, seg, seedP + 6.0)) + jd * 0.3) * uKgAsym.z;
    lg = mix(lg, vec3(0.3, 0.25, 0.18), ld * 0.45);
    rough = mix(rough, 0.8, ld * 0.5);
    // setal sockets: tiny pits along the margins
    float sock = kgSpeck(P * 120.0 + vec3(limb * 5.0, seg, 1.0), 0.35, 0.16, fw * 120.0, idd) * smoothstep(0.7, 0.95, abs(cos(th)));
    h -= sock * 0.001;
    col = lg;
  }
  // ------------------------------------------------------------------ setae
  else {
    // fine, stiff, dark brown, paler and translucent toward the tip (063, 049, 068, 010); the soft water-wicking
    // tufts at the leg bases and the maxillipeds' fringe pale [L]. Each crab carries its own number, and its left
    // and right sides differ: a seta whose random id exceeds that side's density is not drawn.
    float tt = vKgInfo.x;
    float L = vKgLimb;
    bool left = L < 39.5 || (L > 79.5 && L < 89.5) || (L > 119.5 && L < 129.5);
    if (vKgInfo.y > (left ? uKgAsym.x : uKgAsym.y)) discard;
    float soft = (L < 50.0 && mod(L, 10.0) < 0.5) || (L > 115.0 && L < 145.0) ? 1.0 : 0.0;
    vec3 dark = mix(vec3(0.02, 0.016, 0.012), vec3(0.14, 0.1, 0.06), tt * tt) * (0.7 + 0.6 * fract(vKgInfo.y * 7.3));
    col = mix(dark, mix(vec3(0.66, 0.6, 0.48), vec3(0.85, 0.82, 0.74), tt), soft);
    rough = 0.4; trans = mix(0.35 + 0.4 * tt, 0.9, soft); wetBias = 0.1;
  }
  // arthrodial membranes: pale, soft, translucent, finely wrinkled
  float mem = vKgInfo.x * step(4.5, part) * step(part, 15.5);
  if (mem > 0.001) {
    // the joint membrane: soft, translucent amber-brown, darker than the cuticle on either side (009, 049, 063)
    col = mix(col, vec3(0.36, 0.25, 0.14) * (0.8 + 0.4 * kgFbm2(P * 60.0 + seedP)), mem * 0.8);
    ao *= 1.0 - 0.35 * mem;
    rough = mix(rough, 0.45, mem);
    trans = mix(trans, 0.8, mem);
    h += mem * (0.5 + 0.5 * sin(P.x * 900.0)) * 0.0005 * (1.0 - smoothstep(0.0, 0.002, fw));
  }
  // juveniles are paler and more translucent (027, 028, 055–058)
  col = mix(col, col * 1.25 + vec3(0.03), juv * 0.5);
  trans = mix(trans, min(1.0, trans + 0.25), juv);
  // ---- sand grains stuck to the cuticle
  float coat = clamp(uKgState.y * sandExp, 0.0, 1.0);
  if (coat > 0.01 && det > 0.1) {
    float grain = kgDome(P * 70.0 + seedP + 71.0, coat * 0.7, 0.34, fw * 70.0, off, idd);
    vec3 sandC = idd > 0.97 ? vec3(0.72, 0.7, 0.64) : (idd > 0.94 ? vec3(0.16, 0.14, 0.12) : mix(vec3(0.46, 0.38, 0.27), vec3(0.62, 0.53, 0.4), idd));
    col = mix(col, sandC, smoothstep(0.0, 0.25, grain));
    h += grain * 0.006;
    rough = mix(rough, 0.85, smoothstep(0.0, 0.25, grain));
    // a muddy film under the grains
    col = mix(col, col * 0.75 + vec3(0.06, 0.05, 0.035), coat * 0.35);
  }
  // ---- wetness: the dorsum dries in patches, crevices and the underside stay wet
  float wet = clamp(uKgState.x + wetBias * (0.4 + 0.6 * uKgState.x), 0.0, 1.0);
  float patchy = kgFbm2(P * 9.0 + seedP + 3.0);
  wet *= smoothstep(0.15, 0.5, wet + (patchy - 0.5) * 0.6 + max(0.0, -h) * 60.0);
  col *= mix(1.0, 0.72, wet);
  // a water film is glossy on smooth cuticle; the granules of the dorsum break it into sparkles
  rough = mix(rough, mix(0.38, 0.58, 1.0 - kgCoatK), wet * 0.55);
  // what is lost below the pixel becomes roughness, not shine
  rough = mix(rough, min(1.0, rough + 0.12), smoothstep(0.002, 0.02, fw));
  col = mix(col, col * vec3(1.05, 0.98, 1.06), purple * 0.15);
  kgRough = rough; kgHeight = h; kgWet = wet; kgGlint = glint; kgTrans = trans; kgAO = ao; kgFw = fw;
  kgCoat = max(kgCoat, smoothstep(0.55, 1.0, wet) * 0.6 * kgCoatK);
  // a random tilt for each glint so they flash one at a time as the crab or the camera moves
  kgGlintN = normalize(kgH33(floor(P * 160.0 + seedP + 41.0)) - 0.5 + vec3(0.0, 0.0, 0.6));
  diffuseColor.rgb = col;
}
`;

const FRAG_NORMAL = /* glsl */ `
{
  // height (CW) → metres → perturbed normal; fades with detail so the far crab is not noisy
  normal = kgPerturb(normal, -vViewPosition, kgHeight * uKgState.w * mix(0.35, 1.0, uKgState.z));
}
`;

const FRAG_ROUGH = /* glsl */ `
roughnessFactor = kgRough;
`;

const FRAG_COAT = /* glsl */ `
#ifdef USE_CLEARCOAT
  material.clearcoat = max(clamp(kgCoat, 0.0, 1.0) * 0.5, kgCornea);
  material.clearcoatRoughness = mix(clamp(0.1 + geometryRoughness + kgRough * 0.35 * smoothstep(0.004, 0.03, kgFw), 0.1, 0.6), 0.03 + geometryRoughness, kgCornea);
#endif
`;

const FRAG_LIGHT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 L = directionalLights[0].direction;
  vec3 C = directionalLights[0].color;
  vec3 V = normalize(vViewPosition);        // toward the viewer
  vec3 N = normal;
  // thin cuticle: sunlight through the shell from behind, warmed by the tissue it crosses (063: the legs and the
  // joints glow amber against the light), strongest where the view looks toward the sun and at thin edges
  float thru = pow(max(0.0, dot(-V, L)), 4.0);
  float back = max(0.0, dot(-N, L)) * 0.5 + thru * 0.5;
  float edgeT = pow(1.0 - max(0.0, dot(N, V)), 2.0) * max(0.0, dot(-V, L));
  vec3 transCol = sqrt(max(diffuseColor.rgb, vec3(0.0))) * vec3(1.0, 0.72, 0.42);
  reflectedLight.directDiffuse += transCol * C * (back + edgeT * 0.8) * kgTrans * 0.38;
  // subsurface softening: the terminator wraps a little, tinted by the cuticle
  float wrap = max(0.0, (dot(N, L) + 0.4) / 1.4) - max(0.0, dot(N, L));
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.85, 0.7) * C * wrap * (0.08 + kgTrans * 0.3);
  // chromatophore glints: tiny mirrors, each tilted its own way
  if (kgGlint > 0.001) {
    vec3 Hh = normalize(L + V);
    vec3 gn = normalize(N + (kgGlintN - vec3(0.0, 0.0, 0.6)) * 0.9);
    float spec = pow(max(dot(gn, Hh), 0.0), 90.0);
    reflectedLight.directSpecular += C * kgGlint * spec * 1.4 * (1.0 - kgWet * 0.5);
  }
}
#endif
{
  // the cornea's pseudopupil: the ommatidia aimed straight at the viewer look black
  if (kgCornea > 0.001) {
    float facing = max(0.0, dot(normal, normalize(vViewPosition)));
    float pupil = smoothstep(0.8, 0.96, facing) * kgCornea;
    reflectedLight.directDiffuse *= 1.0 - 0.85 * pupil;
    reflectedLight.indirectDiffuse *= 1.0 - 0.85 * pupil;
  }
}
`;

const FRAG_DEBUG = /* glsl */ `
if (uKgMorph.y > 0.5) {
  // debug: the albedo alone, unlit (the viewer's dbg=1)
  reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0);
  reflectedLight.indirectSpecular = vec3(0.0); reflectedLight.indirectDiffuse = diffuseColor.rgb;
  #ifdef USE_CLEARCOAT
  clearcoatSpecularDirect = vec3(0.0); clearcoatSpecularIndirect = vec3(0.0);
  #endif
}
`;

const FRAG_AO = /* glsl */ `
reflectedLight.indirectDiffuse *= kgAO;
reflectedLight.indirectSpecular *= mix(1.0, kgAO, 0.7);
`;

/**
 * The exoskeleton material (skinned). Per-crab instance; call setCrab() to fill its uniforms.
 */
export function makeExoskeletonMaterial({ lod = 1 } = {}) {
  const uniforms = {
    uKgSeed: { value: new Vector4(0.3, 0.5, 0, 0) },
    uKgState: { value: new Vector4(0.6, 0.3, 1, 0.009) },
    uKgFeed: { value: new Vector4(0, 0, 0, 0) },
    uKgTint: { value: lin(0.5, 0.43, 0.34) },
    uKgDark: { value: lin(0.17, 0.13, 0.1) },
    uKgMorph: { value: new Vector4(0, 0, 0, 0) },
    uKgAsym: { value: new Vector4(1, 1, 0.5, 0) },
  };
  const mat = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    ior: 1.5, specularIntensity: 0.5, side: FrontSide,
  });
  mat.name = `kg-exo-${lod}`;
  mat.envMapIntensity = 1;
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_SURFACE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_NORMAL}`)
      // the wet film follows the granules: its highlight breaks into sparkles instead of a glassy sheet
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal = normal;\n#endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FRAG_COAT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_LIGHT}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${FRAG_AO}\n${FRAG_DEBUG}`);
  };
  mat.customProgramCacheKey = () => 'kg-exo-v2';
  return mat;
}

/** the setae: same shader (part 17 branch), double-sided */
export function makeSetaeMaterial() {
  const m = makeExoskeletonMaterial({ lod: 0 });
  m.side = DoubleSide;
  m.clearcoat = 0;
  m.name = 'kg-setae';
  m.customProgramCacheKey = () => 'kg-setae-v2';
  return m;
}

/**
 * Individual colouring from a seeded generator: most crabs are dull sand-grey-brown (cryptic, "a motionless crab is
 * effectively invisible" [L]); some darker (065–070), some paler / translucent (027, 028), a few strongly purplish.
 */
/**
 * Named colour morphs seen in the photographs, for the viewer's photo-match presets and for tests:
 * pale (aquarium and specimens, yellowish-tan marbling on near-white, 002–004), khaki (aquarium, sandy), grey (field on dark sand, black and
 * white mottling), purple (field, a dark violet male with red-maroon legs and pink chelae — breeding colours).
 */
/**
 * Colour morphs calibrated on the photographs (linear values given in sRGB-ish authoring space, converted by lin):
 * pale (2.webp), khaki (4.webp), grey (5.webp, the field on dark sand), brown (specimens 007–009), purple (6.webp,
 * the displaying male). red: the breeding flush (pink-red chelae, maroon meri) of males in the waving season.
 */
const MORPHS = {
  pale: { tint: [0.7, 0.63, 0.45], dark: [0.3, 0.23, 0.15], purple: 0.08, pale: 0.85, red: 0.15, cover: 0.6, legTint: 0.12 },
  khaki: { tint: [0.7, 0.6, 0.44], dark: [0.33, 0.23, 0.14], purple: 0.0, pale: 0.8, red: 0.05, cover: 0.8, legTint: 0.6 },
  grey: { tint: [0.72, 0.7, 0.66], dark: [0.2, 0.18, 0.16], purple: 0.1, pale: 0.6, red: 0.35, cover: 0.85, legTint: 0.2 },
  brown: { tint: [0.74, 0.62, 0.42], dark: [0.2, 0.14, 0.09], purple: 0.0, pale: 0.7, red: 0.1, cover: 0.35, legTint: 0.7 },
  purple: { tint: [0.56, 0.44, 0.62], dark: [0.22, 0.13, 0.25], purple: 1.0, pale: 0.0, red: 0.9, cover: 0.5, legTint: 0.5 },
};

export function paletteFor(name, seed = 1) {
  const P = MORPHS[name];
  if (!P) return null;
  const f = (seed * 0.618) % 1;
  return {
    tint: lin(...P.tint), dark: lin(...P.dark), purple: P.purple, pale: P.pale, red: P.red, cover: P.cover, legTint: P.legTint,
    patternSeed: f, colorSeed: (f * 7.13) % 1, morph: name,
  };
}

/**
 * a random individual: a morph with jitter. The crabs match the sand they live on (cryptic, [L]): on the flat's
 * pale grey-brown sand the sand-coloured morphs are the common ones (on dark volcanic sand, 5.webp and 6.webp,
 * it would be grey and purple)
 */
export function crabPalette(rand, sex = 'm') {
  const r = rand();
  const name = r < 0.34 ? 'khaki' : r < 0.58 ? 'brown' : r < 0.78 ? 'pale' : r < 0.92 ? 'grey' : 'purple';
  const P = MORPHS[name];
  const j = () => 0.92 + rand() * 0.16;
  const tint = P.tint.map((v) => v * j()), dark = P.dark.map((v) => v * j());
  return {
    tint: lin(tint[0], tint[1], tint[2]), dark: lin(dark[0], dark[1], dark[2]),
    purple: Math.min(1, P.purple * (0.7 + 0.6 * rand())), pale: P.pale,
    red: P.red * (sex === 'm' ? 0.6 + 0.4 * rand() : 0.3), cover: Math.min(0.95, P.cover * (0.85 + 0.3 * rand())), legTint: P.legTint,
    patternSeed: rand(), colorSeed: rand(), morph: name,
  };
}

// ============================================================================================ pellets

/**
 * Sand pellets (instanced). Feeding pellets: small, round, the sorted sand pressed into a ball; excavation lumps:
 * larger, wetter, irregular. Fresh pellets are dark and glossy with moisture and dry paler and matte over minutes;
 * under water they slump and wash away. Instance attribute aPel = (seed, birth time s, kind 0 feed / 1 dig, wet0).
 */
export function makePelletMaterial({ detail = 1 } = {}) {
  const uniforms = {
    uPelTime: { value: 0 },
    uPelSand: { value: SAND_LINEAR.clone() },
    uPelDissolve: { value: 0 },
    uPelDetail: { value: detail },
    uPelScale: { value: 0.002 },
    /** 0: the odd pale / dark grain (the flat's sand); 1: salt and pepper (dark volcanic sands, 5.webp) */
    uPelPepper: { value: 0 },
  };
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.name = 'kg-pellet';
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aPel;
attribute float aWash;
uniform float uPelTime;
uniform float uPelDissolve;
varying vec3 vPelLocal;
varying vec4 vPel;
varying float vPelDiss;
${COMMON}
float pelDiss() { return max(uPelDissolve, aWash > 0.0 ? clamp((uPelTime - aWash) / 150.0, 0.0, 1.0) : 0.0); }
// a lumpy, slightly flattened ball; excavation lumps are rougher; under water they slump
vec3 pelDisp(vec3 p) {
  float uDiss = pelDiss();
  float s = aPel.x * 97.0;
  float lump = (kgN3(p * 2.6 + s) - 0.5) * mix(0.28, 0.55, aPel.z) + (kgN3(p * 6.0 + s * 1.7) - 0.5) * 0.12;
  vec3 q = p * (1.0 + lump);
  q.y *= mix(0.82, 0.7, aPel.z);
  if (q.y < -0.35) q.y = mix(q.y, -0.35, 0.7);
  q.y = mix(q.y, -0.3 + q.y * 0.25, uDiss);
  q.xz *= 1.0 + uDiss * 0.6;
  return q;
}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
{
  vec3 t1 = normalize(cross(abs(normal.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), normal));
  vec3 t2 = cross(normal, t1);
  float e = 0.04;
  vec3 c0 = pelDisp(normal);
  vec3 a1 = pelDisp(normalize(normal + t1 * e)) - c0;
  vec3 a2 = pelDisp(normalize(normal + t2 * e)) - c0;
  vec3 nn = normalize(cross(a1, a2));
  objectNormal = dot(nn, normal) < 0.0 ? -nn : nn;
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed = pelDisp(position);
vPelLocal = position + aPel.x * 97.0;
vPel = aPel;
vPelDiss = pelDiss();`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uPelTime;
uniform vec3 uPelSand;
uniform float uPelDissolve;
uniform float uPelDetail;
uniform float uPelScale;
uniform float uPelPepper;
varying vec3 vPelLocal;
varying vec4 vPel;
varying float vPelDiss;
${COMMON}
${FRAG_COMMON}
float pelWet = 0.0;
float pelH = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float age = max(0.0, uPelTime - vPel.y);
  // moisture: fresh feeding pellets glisten; excavation lumps from below are wetter still; both dry in minutes
  pelWet = clamp(vPel.w * exp(-age / mix(420.0, 900.0, vPel.z)), 0.0, 1.0);
  float fw = max(length(fwidth(vPelLocal)), 1e-4);
  vec3 off; float id;
  float g = kgDome(vPelLocal * 7.0, 0.85, 0.38, fw * 7.0, off, id);
  vec3 c = uPelSand * (0.85 + 0.3 * kgH31(floor(vPelLocal * 7.0)));
  // the odd pale quartz or shell grain and dark mineral grain, as in the sand around (not salt and pepper)
  c = id > 0.95 - 0.13 * uPelPepper ? mix(c, vec3(0.78, 0.75, 0.7), 0.6 + 0.3 * uPelPepper) : (id > 0.92 - 0.13 * uPelPepper ? c * 0.62 : (id < 0.25 * uPelPepper ? c * 0.35 : c));
  c = mix(uPelSand * 0.9, c, smoothstep(0.0, 0.3, g) * uPelDetail + (1.0 - uPelDetail) * 0.5);
  // the sorted pellet is a touch paler than the surface it came from (organic film removed)
  c *= mix(1.06, 0.9, vPel.z);
  c *= mix(1.0, 0.62, pelWet);
  pelWet = max(pelWet, vPelDiss);
  c = mix(c, uPelSand * 0.7, vPelDiss * 0.5);
  pelH = g * 0.08;
  diffuseColor.rgb = c;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.92, 0.35, pelWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = kgPerturb(normal, -vViewPosition, pelH * uPelScale * uPelDetail);`);
  };
  mat.customProgramCacheKey = () => 'kg-pellet-v3';
  return mat;
}

// ============================================================================================ burrows

/** inside of a burrow shaft (instanced tube): wet sand, darker with depth; aDepth (vertex) 0 at the mouth … 1 deep */
export function makeShaftMaterial() {
  const uniforms = { uShaftSand: { value: SAND_LINEAR.clone().multiplyScalar(0.62) } };
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: DoubleSide });
  mat.name = 'kg-shaft';
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aDepth;
varying float vDepth;
varying vec3 vShaftP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDepth = aDepth;
vShaftP = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uShaftSand;
varying float vDepth;
varying vec3 vShaftP;
${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float fw = max(length(fwidth(vShaftP)), 1e-4);
  float id; vec3 off;
  float g = kgDome(vShaftP * 9.0, 0.8, 0.36, fw * 9.0, off, id);
  vec3 c = uShaftSand * (0.8 + 0.4 * id) * (0.9 + 0.2 * g);
  // the walls are wet and darken fast with depth (no light reaches far down a 1 cm hole)
  c *= mix(1.0, 0.03, smoothstep(0.05, 0.75, vDepth));
  c *= 0.85;
  diffuseColor.rgb = c;
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= mix(1.0, 0.05, smoothstep(0.08, 0.6, vDepth));
reflectedLight.directDiffuse *= mix(1.0, 0.15, smoothstep(0.12, 0.55, vDepth));
reflectedLight.indirectSpecular *= mix(1.0, 0.0, smoothstep(0.0, 0.5, vDepth));`);
  };
  mat.customProgramCacheKey = () => 'kg-shaft-v1';
  return mat;
}

/** depth cap over an open burrow: writes depth only (drawn after the shaft and crabs, before the terrain) */
export function makeCapMaterial() {
  const mat = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, fog: false });
  mat.name = 'kg-cap';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -4;
  return mat;
}

/**
 * Ground decal for burrows and their surroundings (instanced quads lying on the sand). Unlit and multiplied onto
 * whatever the terrain drew, so wet collars and shadows darken the real sand colour underneath:
 * aDec = (kind, strength 0..1, seed, extra). kind 0: a burrow mouth (dark hole, crumbled wet collar; far holes and
 * plugged ones), kind 1: a contact shadow (soft ellipse; the quad is stretched along the sun), kind 2: a scraped
 * feeding trail (the surface film taken: damp, a touch darker).
 */
export function makeGroundDecalMaterial() {
  const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: MultiplyBlending, premultipliedAlpha: true, fog: false, toneMapped: false });
  mat.name = 'kg-decal';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aDec;
varying vec4 vDec;
varying vec2 vDecUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDec = aDec;
vDecUv = position.xz * 2.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vDec;
varying vec2 vDecUv;
${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vDecUv;                // -1..1 across the quad
  float r = length(p);
  float kind = vDec.x;
  float k = 1.0;                  // multiply factor
  if (kind < 0.5) {
    float open = vDec.y;
    float ang = atan(p.y, p.x);
    float wob = 0.06 * (kgN3(vec3(cos(ang) * 3.0, sin(ang) * 3.0, vDec.z * 10.0)) - 0.5);
    float hole = 1.0 - smoothstep(0.4 + wob, 0.5 + wob, r);
    float collar = (1.0 - smoothstep(0.42, 1.0, r + wob * 2.0)) * (1.0 - hole);
    float crumbs = step(0.6, kgN3(vec3(p * 11.0, vDec.z * 31.0))) * collar;
    k = mix(1.0, 0.04, hole * mix(0.2, 1.0, open) * (1.0 - open * 0.0));
    k *= mix(1.0, 0.86, collar * vDec.w);
    k *= mix(1.0, 0.85, crumbs * vDec.w);
  } else if (kind < 1.5) {
    k = 1.0 - vDec.y * exp(-r * r * 3.0) * (1.0 - smoothstep(0.8, 1.0, r));
  } else if (kind < 2.5) {
    float edge = 1.0 - smoothstep(0.5, 1.0, r);
    k = 1.0 - edge * vDec.y * 0.22 * (0.7 + 0.3 * kgN3(vec3(p * 4.0, vDec.z * 7.0)));
  } else {
    // a pellet field seen from afar: no single pellet resolves, but the trips do — wandering radial streaks,
    // dense by the mouth, ragged where the trips end (each bearing its own length); sunlit pellets darken the
    // sand a little with their shadows and break it into specks
    float ang = atan(p.y, p.x);
    vec2 cs = vec2(cos(ang), sin(ang));
    float sd = vDec.z * 17.0;
    float reach = 0.4 + 0.55 * kgN3(vec3(cs * 1.7, sd));
    float streak = smoothstep(0.38, 0.78, kgN3(vec3(cs * 5.5, r * 1.3 + sd)));
    float cover = smoothstep(reach, reach * 0.35, r) * smoothstep(0.07, 0.18, r) * (0.3 + 0.7 * streak);
    float fw = max(length(fwidth(p)), 1e-4);
    float id;
    float specks = kgSpeck(vec3(p * 30.0, sd), 0.7, 0.3, fw * 30.0, id);
    k = 1.0 - vDec.y * cover * (0.05 + 0.12 * specks);
  }
  diffuseColor = vec4(vec3(k), 1.0);
}`);
  };
  mat.customProgramCacheKey = () => 'kg-decal-v3';
  return mat;
}

export { lin, SAND_LINEAR };
