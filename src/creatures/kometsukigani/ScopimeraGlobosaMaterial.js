import { Color, DoubleSide, FrontSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MultiplyBlending, Vector4 } from 'three';

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
  return mix(m, min(mean, 1.0), smoothstep(0.35 * r, 1.6 * r, fw));
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
  float vis = 1.0 - smoothstep(0.4 * r, 1.4 * r, fw);
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
float kgCornea = 0.0;
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
  vec3 pal = mix(ground, vec3(0.62, 0.6, 0.56), 0.35);           // translucent limb ground
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
    vec2 q = vec2(abs(P.x), P.z);
    float dorsal = 1.0 - smoothstep(0.43, 0.5, s);
    float ventral = smoothstep(0.8, 0.9, s);
    float faceM = smoothstep(0.3, 0.38, P.z) * smoothstep(0.44, 0.52, s) * (1.0 - ventral);
    // ---- dorsal: mottled, bilaterally symmetric; darker gastric field, pale spots, the posterior pale "mask" (009)
    vec3 qp = vec3(q * 6.5, seedP);
    float marble = kgFbm(qp + vec3(0.0, 0.0, 3.1));
    float blot = smoothstep(0.42, 0.66, marble + 0.12 * (kgN3(vec3(q * 24.0, seedP + 5.0)) - 0.5));
    float spots = kgSpeck(vec3(q * 34.0, seedP * 0.5 + P.y * 34.0), 0.55, 0.3, fw * 34.0, idd);
    float gastric = exp(-((q.x * q.x) / 0.03 + (q.y - 0.1) * (q.y - 0.1) / 0.03));
    float mask = exp(-pow((q.y + 0.27) / 0.06, 2.0)) * smoothstep(0.02, 0.1, q.x) * (1.0 - smoothstep(0.2, 0.3, q.x));
    vec3 dcol = mix(ground, marb, clamp(blot * 0.8 + gastric * 0.3, 0.0, 1.0));
    dcol = mix(dcol, cream * 0.9, spots * 0.4 * (1.0 - blot * 0.5));
    dcol = mix(dcol, cream, mask * 0.45);
    dcol = mix(dcol, black, kgSpeck(P * 75.0 + seedP + 2.0, 0.6, 0.3, fw * 75.0, idd) * 0.55);
    // the rim of the carapace is paler and a little translucent (009)
    float rim = smoothstep(0.38, 0.47, s) * (1.0 - smoothstep(0.5, 0.56, s));
    dcol = mix(dcol, mix(cream, orange, 0.25), rim * 0.55);
    // ---- relief: tubercles dense on the branchial regions, cardiac & intestinal smooth [L]
    float branch = smoothstep(0.12, 0.3, q.x) * (1.0 - smoothstep(0.42, 0.5, s)) * smoothstep(-0.38, -0.05, -abs(q.y + 0.08) * 1.4);
    float smoothCard = exp(-((q.x * q.x) / 0.012 + (q.y + 0.2) * (q.y + 0.2) / 0.03));
    float tub = 0.0;
    if (det > 0.05) {
      tub = kgDome(vec3(q * 52.0, seedP * 0.37) + vec3(0.0, 0.0, P.y * 52.0), mix(0.12, 0.7, branch) * (1.0 - smoothCard * 0.9), 0.36, fw * 52.0, off, idd);
      float tub2 = kgDome(vec3(q * 110.0, seedP) + vec3(0.0, 0.0, P.y * 110.0), 0.55 * (1.0 - smoothCard), 0.34, fw * 110.0, off, idd);
      h += (tub * 0.009 + tub2 * 0.004) * dorsal;
      dcol = mix(dcol, cream * 1.05, (smoothstep(0.0, 0.5, tub) * 0.45 + tub2 * 0.2) * dorsal);
    }
    // grooves: cervical (curving across), the H between gastric and cardiac, faint; gastro-branchial furrows
    float cerv = abs(q.y - (0.08 - 0.55 * q.x * q.x));
    float groove = (1.0 - smoothstep(0.0, 0.014, cerv)) * smoothstep(0.05, 0.12, q.x) * (1.0 - smoothstep(0.3, 0.36, q.x));
    // regions are indistinct in this species [L]: the grooves are soft, shallow and wander a little
    float wob = (kgN3(vec3(q * 18.0, seedP)) - 0.5) * 0.012;
    float hgr = (1.0 - smoothstep(0.0, 0.016, abs(q.x - 0.065 + wob))) * smoothstep(-0.19, -0.12, q.y) * (1.0 - smoothstep(-0.01, 0.05, q.y));
    float grooves = max(groove, hgr) * dorsal;
    h -= grooves * 0.005;
    dcol *= 1.0 - grooves * 0.18;
    // the crested lateral border: a beaded line along the girth [L]
    float crest = (1.0 - smoothstep(0.0, 0.009, abs(s - 0.485))) * (1.0 - faceM);
    float beads = 0.5 + 0.5 * cos(vKgUv.x * 6.2831853 * 140.0);
    h += crest * (0.004 + 0.002 * beads);
    dcol = mix(dcol, cream * 1.2, crest * 0.4);
    // ---- sides (branchiostegite / pterygostomial): dark speckled, granular
    vec3 scol = mix(ground, marb, 0.25 + 0.35 * blot);
    float spk = kgSpeck(P * 60.0 + seedP, 0.8, 0.3, fw * 60.0, idd);
    scol = mix(scol, black, spk * 0.6);
    if (det > 0.05) {
      float sg = kgDome(P * 90.0 + seedP + 4.0, 0.6, 0.34, fw * 90.0, off, idd);
      h += sg * 0.003 * (1.0 - dorsal) * (1.0 - ventral);
      scol = mix(scol, cream * 0.9, sg * 0.25);
    }
    // ---- face: suborbital ridge with a row of small granules [L], epistome; the buccal cavity is dark
    vec3 fcol = mix(cream * 0.9, marb, 0.3);
    float subOrb = (1.0 - smoothstep(0.0, 0.02, abs(P.y - 0.36))) * smoothstep(0.08, 0.12, q.x) * (1.0 - smoothstep(0.34, 0.4, q.x));
    float gran = 0.5 + 0.5 * cos(q.x * 6.2831853 * 34.0);
    h += subOrb * faceM * 0.003 * gran;
    fcol = mix(fcol, cream * 1.25, subOrb * gran * 0.4);
    fcol = mix(fcol, black, kgSpeck(P * 70.0 + seedP + 3.0, 0.5, 0.26, fw * 70.0, idd) * 0.7);
    // ---- ventral: white sternum with fine black dots and a lilac sheen (012, 062)
    vec3 vcol = vec3(0.78, 0.77, 0.74);
    vcol = mix(vcol, lilac * 1.6, 0.18 + 0.35 * purple);
    float dots = kgSpeck(P * 85.0 + seedP + 11.0, 0.9, 0.32, fw * 85.0, idd);
    vcol = mix(vcol, black, dots * 0.85);
    // sternal sutures
    float sut = 1.0 - smoothstep(0.0, 0.01, abs(fract(P.z * 5.0 + 0.3) - 0.5) - 0.47);
    vcol *= 1.0 - sut * 0.25 * ventral;
    // the median line where the abdomen locks in
    vcol = mix(vcol, orange * 0.9 + cream * 0.3, (1.0 - smoothstep(0.03, 0.06, q.x)) * 0.35);
    float side = (1.0 - dorsal) * (1.0 - ventral);
    col = dcol * dorsal + scol * side * (1.0 - faceM) + fcol * faceM * (1.0 - dorsal) + vcol * ventral;
    rough = mix(0.66, 0.78, tub) * dorsal + 0.7 * side + 0.55 * ventral;
    // the buccal cavity (behind the third maxillipeds): dark, evaluated continuously so its edge is smooth
    float cav = (1.0 - smoothstep(0.13, 0.17, q.x)) * smoothstep(0.06, 0.1, P.y) * (1.0 - smoothstep(0.29, 0.33, P.y)) * smoothstep(0.37, 0.4, P.z) * (1.0 - dorsal);
    col = mix(col, vec3(0.02, 0.016, 0.014), cav);
    rough = mix(rough, 0.35, cav);
    ao = mix(ao, 0.25, cav);
    // glitter: white chromatophores everywhere on the dorsum, denser on the sides
    if (det > 0.3) glint = kgSpeck(P * 160.0 + seedP + 41.0, 0.32 + 0.3 * side, 0.18, fw * 160.0, idd);
    trans = 0.08 + 0.25 * rim;
    wetBias = 0.25 * ventral + 0.15 * faceM;
    sandExp = 0.35 * ventral + 0.25 * side * smoothstep(0.55, 0.75, s);
    ao *= mix(1.0, 0.6, smoothstep(0.6, 0.9, s) * (1.0 - ventral)); // under the overhang of the carapace
    // ovigerous female: the egg mass shows under the abdomen's rim (handled by the abdomen part)
  }
  // ------------------------------------------------------------------ eyestalks and cornea
  else if (part < 5.5) {
    float isDistal = step(0.5, seg);
    float th = vKgUv.x * 6.2831853;
    float edge = 0.202 - 0.018 * cos(th - 0.6);
    float cornea = isDistal * smoothstep(edge - 0.004, edge + 0.004, P.x);
    vec3 stalk = mix(vec3(0.42, 0.41, 0.38), ground, 0.4);
    stalk = mix(stalk, marb * 0.8, kgSpeck(P * 80.0 + seedP, 0.35, 0.22, fw * 80.0, idd) * 0.5);
    if (det > 0.2) glint = kgSpeck(P * 170.0 + seedP + 3.0, 0.55, 0.2, fw * 170.0, idd) * (1.0 - cornea);
    // cornea: very dark with golden flecks and a dark pseudopupil facing the viewer (in the light stage)
    vec3 corn = vec3(0.035, 0.026, 0.02);
    float fleck = kgSpeck(P * 220.0 + seedP + 7.0, 0.35, 0.2, fw * 220.0, idd);
    corn = mix(corn, vec3(0.34, 0.2, 0.07), fleck * 0.6);
    // ommatidial facets: a fine hexagonal-ish ripple at macro range
    float fac = (0.5 + 0.5 * cos(P.x * 900.0) * cos(th * 40.0)) * (1.0 - smoothstep(0.0, 0.002, fw));
    h += cornea * fac * 0.0004;
    // a pale ring at the cornea's lower edge
    float ring = (1.0 - smoothstep(0.0, 0.006, abs(P.x - edge))) * isDistal;
    col = mix(stalk, corn, cornea);
    col = mix(col, cream * 1.2, ring * 0.6);
    rough = mix(0.45, 0.12, cornea);
    trans = mix(0.7, 0.05, cornea);
    kgCoat = cornea;
    kgCornea = cornea;
  }
  // ------------------------------------------------------------------ third maxillipeds
  else if (part < 7.5) {
    // dense black speckles over cream, pale rims, the ischium–merus suture across each plate
    vec3 m = mix(cream * 1.05, ground, 0.3);
    float sp1 = kgSpeck(P * 120.0 + seedP + 13.0, 0.97, 0.47, fw * 120.0, idd);
    float rimM = smoothstep(0.55, 0.95, length(vec2((P.x - 0.0825) / 0.0825, P.z / 0.1)));
    m = mix(m, black, sp1 * 0.85 * (1.0 - rimM));
    m = mix(m, mix(cream, orange, 0.3), rimM * 0.5);
    float suture = 1.0 - smoothstep(0.0, 0.006, abs(P.z + 0.01));
    h -= suture * 0.003;
    m *= 1.0 - suture * 0.3;
    if (det > 0.2) glint = kgSpeck(P * 180.0 + seedP + 17.0, 0.6, 0.2, fw * 180.0, idd);
    col = m; rough = 0.5; trans = 0.2; wetBias = 0.35 + 0.4 * uKgFeed.y;
  }
  // ------------------------------------------------------------------ abdomen (folded under the sternum)
  else if (part < 8.5) {
    vec3 a = vec3(0.8, 0.78, 0.74);
    a = mix(a, lilac * 1.6, 0.2 + 0.3 * purple);
    a = mix(a, black, kgSpeck(P * 85.0 + seedP + 23.0, 0.35, 0.18, fw * 85.0, idd) * 0.8);
    float segs = 1.0 - smoothstep(0.0, 0.008, abs(fract(P.z * 16.0) - 0.5) - 0.46);
    a *= 1.0 - segs * 0.3;
    h -= segs * 0.002;
    col = a; rough = 0.5; wetBias = 0.3;
  }
  // ------------------------------------------------------------------ chelipeds
  else if (part < 11.5) {
    float t = vKgUv.y;
    float th = vKgUv.x * 6.2831853;
    float sideS = limb < 8.5 ? 1.0 : -1.0;
    float inner = smoothstep(0.35, 0.7, cos(th) * sideS);
    vec3 arm = mix(ground, marb, 0.45);
    arm = mix(arm, black, kgSpeck(P * 70.0 + seedP + limb * 7.0 + seg, 0.85, 0.38, fw * 70.0, idd) * 0.7);
    if (det > 0.05) {
      // finely granular
      float g = kgDome(P * 120.0 + seg * 3.3 + limb, 0.55, 0.3, fw * 120.0, off, idd);
      h += g * 0.0025;
      arm = mix(arm, cream * 1.1, g * 0.3);
    }
    col = arm; rough = 0.6; trans = 0.15;
    if (seg > 2.5 && seg < 3.5) {
      // merus: a long oval tympanum on the inner face [L]
      float ty = inner * max(0.0, 1.0 - pow((t - 0.5) / 0.34, 2.0));
      float tym = smoothstep(0.0, 0.25, ty);
      vec3 tcol = mix(vec3(0.5, 0.48, 0.46), black, kgSpeck(P * 150.0 + seedP + 29.0, 0.95, 0.42, fw * 150.0, idd) * 0.9);
      col = mix(col, tcol, tym);
      rough = mix(rough, 0.32, tym);
      h -= tym * 0.0015;
      if (det > 0.2) glint = max(glint, kgSpeck(P * 200.0 + seedP + 31.0, 0.5, 0.2, fw * 200.0, idd) * tym);
    }
    if (part > 9.5) {
      // propodus: palm, then the fixed finger (the dactylus is part 11 throughout)
      float x = P.x;
      float fing = part > 10.5 ? 1.0 : smoothstep(0.24, 0.29, x);
      vec3 palmC = mix(vec3(0.5, 0.52, 0.54), ground * 1.1, 0.4);
      float upper = smoothstep(-0.02, 0.08, P.y);
      palmC = mix(palmC, mix(marb, black, 0.3), kgSpeck(P * 110.0 + seedP + 37.0, 0.9, 0.36, fw * 110.0, idd) * (0.25 + 0.6 * upper));
      if (det > 0.2) glint = max(glint, kgSpeck(P * 190.0 + seedP + 43.0, 0.45, 0.2, fw * 190.0, idd) * (1.0 - fing));
      // fingers: porcelain white-blue, smooth, glossy; brownish tips; the cutting edges paler [P]
      float ft = part > 10.5 ? clamp(x / 0.28, 0.0, 1.0) : clamp((x - 0.27) / 0.27, 0.0, 1.0);
      vec3 fcol = vec3(0.6, 0.63, 0.67);
      fcol = mix(fcol, mix(vec3(0.55, 0.36, 0.42), vec3(0.6, 0.3, 0.5), purple), purple * 0.55 * smoothstep(0.2, 0.9, ft));
      fcol = mix(fcol, vec3(0.32, 0.17, 0.07), smoothstep(0.86, 0.97, ft));
      col = mix(palmC, fcol, fing);
      rough = mix(0.5, 0.24, fing);
      trans = mix(0.12, 0.3, fing);
      // feeding leaves sand on the fingertips
      sandExp = fing * smoothstep(0.5, 0.95, ft) * (0.4 + uKgFeed.x);
      wetBias = fing * 0.2 * uKgFeed.x;
    }
  }
  // ------------------------------------------------------------------ walking legs
  else if (part < 15.5) {
    float t = vKgUv.y;
    float th = vKgUv.x * 6.2831853;
    float L = limb - floor(limb / 4.0) * 4.0;           // 0..3 within the side
    float jitter = (kgH31(vec3(limb, seg, seedP)) - 0.5) * 0.06;
    // banding: dark bands at the same places on every leg (009, 018–021, 035, 049, 054, 069) [P]
    float band = 0.0;
    if (part > 12.5 && part < 13.5) band = max(max(smoothstep(0.09, 0.0, abs(t - 0.2 - jitter)), smoothstep(0.08, 0.0, abs(t - 0.55 + jitter))), smoothstep(0.07, 0.0, abs(t - 0.88)));
    else if (part > 13.5 && part < 14.5) band = seg < 4.5 ? smoothstep(0.16, 0.02, abs(t - 0.55 - jitter)) : max(smoothstep(0.1, 0.0, abs(t - 0.3)), smoothstep(0.08, 0.0, abs(t - 0.85)));
    else if (part > 14.5) band = smoothstep(0.32, 0.18, t) * 0.8;
    band *= 0.45 + 0.55 * kgFbm2(P * 24.0 + limb * 3.1 + seg);
    vec3 legG = mix(vec3(0.42, 0.4, 0.36), ground, 0.6) * (1.0 + 0.25 * pale);
    vec3 lg = mix(legG, marb, band * 0.85);
    // fine dark speckles everywhere on the cuticle, denser in the bands
    lg = mix(lg, black, kgSpeck(P * 90.0 + vec3(limb * 3.7, seg * 1.3, seedP), 0.8, 0.3, fw * 90.0, idd) * (0.35 + 0.5 * band));
    // the joints flush a little orange (009)
    float joint = smoothstep(0.1, 0.0, t) + smoothstep(0.93, 1.0, t);
    lg = mix(lg, orange * 0.8 + cream * 0.25, joint * 0.18 * (part < 14.5 ? 1.0 : 0.3));
    // purplish individuals: the legs carry the tint (024, 025, 040–044)
    lg = mix(lg, lg * vec3(1.12, 0.84, 1.16) + lilac * 0.08, purple * 0.7);
    rough = 0.55;
    // the merus: one undivided oval tympanum on each broad face [L] — dark, densely speckled, glossier (010)
    if (part > 12.5 && part < 13.5) {
      float faceZ = abs(cos(th));
      float ov = max(0.0, 1.0 - pow((t - 0.5) / 0.36, 2.0)) * max(0.0, 1.0 - pow(sin(th) / 0.74, 2.0));
      float tym = smoothstep(0.02, 0.3, ov) * smoothstep(0.3, 0.6, faceZ);
      vec3 tcol = mix(vec3(0.42, 0.4, 0.38) * (1.0 + 0.3 * pale), black, kgSpeck(P * 160.0 + vec3(limb, seedP, 2.0), 0.95, 0.42, fw * 160.0, idd) * 0.9);
      lg = mix(lg, tcol, tym * 0.92);
      rough = mix(rough, 0.3, tym);
      trans += tym * 0.15;
      if (det > 0.2) glint = kgSpeck(P * 220.0 + vec3(limb, seedP, 5.0), 0.5, 0.2, fw * 220.0, idd) * (0.35 + 0.65 * tym);
      // the margins of the merus: a granular crest
      float margin = smoothstep(0.75, 0.97, abs(sin(th)));
      if (det > 0.05) h += margin * kgDome(P * 140.0 + limb, 0.6, 0.3, fw * 140.0, off, idd) * 0.002;
    } else if (det > 0.3) {
      glint = kgSpeck(P * 200.0 + vec3(limb, seedP, 9.0), 0.25, 0.2, fw * 200.0, idd);
    }
    // dactylus: pale and translucent toward the sharp tip, with longitudinal ridges
    if (part > 14.5) {
      lg = mix(lg, vec3(0.72, 0.7, 0.64), smoothstep(0.35, 0.9, t) * 0.6);
      h += (0.5 + 0.5 * cos(th * 6.0)) * 0.0008 * (1.0 - smoothstep(0.0, 0.002, fw));
      rough = 0.42;
      sandExp = 0.55 + 0.45 * smoothstep(0.3, 1.0, t);
      wetBias = 0.35;
    } else if (part > 13.5) {
      sandExp = seg > 4.5 ? 0.3 : 0.15;
      wetBias = 0.15;
    }
    // setal sockets: tiny pits along the margins
    float sock = kgSpeck(P * 120.0 + vec3(limb * 5.0, seg, 1.0), 0.35, 0.16, fw * 120.0, idd) * smoothstep(0.7, 0.95, abs(sin(th)));
    h -= sock * 0.001;
    col = lg;
  }
  // ------------------------------------------------------------------ setae
  else {
    float tt = vKgInfo.x;
    col = mix(vec3(0.66, 0.58, 0.42), vec3(0.85, 0.82, 0.74), tt);
    col = mix(col, col * vec3(1.1, 0.85, 1.1), purple * 0.4);
    rough = 0.5; trans = 0.9; wetBias = 0.1;
  }
  // arthrodial membranes: pale, soft, translucent, finely wrinkled
  float mem = vKgInfo.x * step(4.5, part) * step(part, 15.5);
  if (mem > 0.001) {
    col = mix(col, cream * vec3(1.15, 1.08, 0.95), mem * 0.85);
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
    float grain = kgDome(P * 52.0 + seedP + 71.0, coat * 0.85, 0.36, fw * 52.0, off, idd);
    vec3 sandC = idd > 0.92 ? vec3(0.85, 0.82, 0.78) : (idd > 0.86 ? vec3(0.12, 0.11, 0.1) : mix(vec3(0.52, 0.44, 0.32), vec3(0.66, 0.58, 0.44), idd));
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
  rough = mix(rough, 0.38, wet * 0.55);
  // what is lost below the pixel becomes roughness, not shine
  rough = mix(rough, min(1.0, rough + 0.12), smoothstep(0.002, 0.02, fw));
  col = mix(col, col * vec3(1.05, 0.98, 1.06), purple * 0.15);
  kgRough = rough; kgHeight = h; kgWet = wet; kgGlint = glint; kgTrans = trans; kgAO = ao;
  kgCoat = max(kgCoat, smoothstep(0.45, 0.95, wet) * 0.7);
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
  material.clearcoat = clamp(kgCoat, 0.0, 1.0) * 0.9;
  material.clearcoatRoughness = max(0.12, 0.12 + geometryRoughness);
#endif
`;

const FRAG_LIGHT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  vec3 L = directionalLights[0].direction;
  vec3 C = directionalLights[0].color;
  vec3 V = normalize(vViewPosition);        // toward the viewer
  vec3 N = normal;
  // thin cuticle: light through the leg from behind, and a softened terminator (wrap)
  float back = max(0.0, dot(-N, L)) * 0.55 + pow(max(0.0, dot(-V, L)), 3.0) * 0.45;
  vec3 transCol = diffuseColor.rgb * vec3(1.0, 0.86, 0.68) * 1.6;
  reflectedLight.directDiffuse += transCol * C * back * kgTrans * 0.32;
  float wrap = max(0.0, (dot(N, L) + 0.35) / 1.35) - max(0.0, dot(N, L));
  reflectedLight.directDiffuse += diffuseColor.rgb * C * wrap * kgTrans * 0.25;
  // chromatophore glints: tiny mirrors, each tilted its own way
  if (kgGlint > 0.001) {
    vec3 Hh = normalize(L + V);
    vec3 gn = normalize(N + (kgGlintN - vec3(0.0, 0.0, 0.6)) * 0.9);
    float spec = pow(max(dot(gn, Hh), 0.0), 90.0);
    reflectedLight.directSpecular += C * kgGlint * spec * 2.2 * (1.0 - kgWet * 0.5);
    reflectedLight.directDiffuse += C * kgGlint * 0.04;
  }
}
#endif
{
  // the cornea's pseudopupil: the ommatidia aimed straight at the viewer look black
  if (kgCornea > 0.001) {
    float facing = max(0.0, dot(normal, normalize(vViewPosition)));
    float pupil = smoothstep(0.88, 0.97, facing) * kgCornea;
    reflectedLight.directDiffuse *= 1.0 - 0.85 * pupil;
    reflectedLight.indirectDiffuse *= 1.0 - 0.85 * pupil;
  }
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
  };
  const mat = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    ior: 1.5, specularIntensity: 0.6, side: FrontSide,
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
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${FRAG_COAT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_LIGHT}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${FRAG_AO}`);
  };
  mat.customProgramCacheKey = () => 'kg-exo-v1';
  return mat;
}

/** the setae: same shader (part 17 branch), double-sided */
export function makeSetaeMaterial() {
  const m = makeExoskeletonMaterial({ lod: 0 });
  m.side = DoubleSide;
  m.clearcoat = 0;
  m.name = 'kg-setae';
  m.customProgramCacheKey = () => 'kg-setae-v1';
  return m;
}

/**
 * Individual colouring from a seeded generator: most crabs are dull sand-grey-brown (cryptic, "a motionless crab is
 * effectively invisible" [L]); some darker (065–070), some paler / translucent (027, 028), a few strongly purplish.
 */
export function crabPalette(rand) {
  const r = rand();
  let tint, dark;
  if (r < 0.55) { tint = [0.5, 0.44, 0.35]; dark = [0.16, 0.12, 0.09]; }
  else if (r < 0.75) { tint = [0.43, 0.39, 0.34]; dark = [0.1, 0.085, 0.075]; }
  else if (r < 0.9) { tint = [0.6, 0.53, 0.41]; dark = [0.26, 0.2, 0.14]; }
  else { tint = [0.5, 0.42, 0.4]; dark = [0.2, 0.13, 0.15]; }
  const j = () => 0.94 + rand() * 0.12;
  const purple = r >= 0.9 ? 0.55 + rand() * 0.45 : rand() < 0.3 ? rand() * 0.35 : 0;
  const pale = r >= 0.75 && r < 0.9 ? 0.6 : rand() * 0.3;
  return {
    tint: lin(tint[0] * j(), tint[1] * j(), tint[2] * j()),
    dark: lin(dark[0] * j(), dark[1] * j(), dark[2] * j()),
    purple, pale, patternSeed: rand(), colorSeed: rand(),
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
  c = id > 0.93 ? vec3(0.8, 0.77, 0.72) : (id > 0.88 ? c * 0.35 : c);
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
  mat.customProgramCacheKey = () => 'kg-pellet-v1';
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
