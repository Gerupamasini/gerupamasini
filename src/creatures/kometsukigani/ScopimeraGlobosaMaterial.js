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
  // keep a speck until it is about two pixels across, then let it go to its mean
  return mix(m, min(mean, 1.0), smoothstep(0.8 * r, 2.4 * r, fw));
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
uniform vec4 uKgMorph;         // breeding red (pink chelae, maroon leg meri; 6.webp), debug view (1 albedo), pale cover of the dorsum, -
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
  vec3 limbG = mix(mix(vec3(0.6, 0.61, 0.6), ground, 0.18), mix(ground, marb, 0.45), 1.0 - pale);
  vec3 limbD = mix(mix(vec3(0.08, 0.078, 0.065), marb, 0.3), marb * 0.6, 1.0 - pale);
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
    vec2 q = vec2(abs(P.x), P.z);
    float dorsal = 1.0 - smoothstep(0.43, 0.5, s);
    float ventral = smoothstep(0.8, 0.9, s);
    float faceM = smoothstep(0.3, 0.38, P.z) * smoothstep(0.44, 0.52, s) * (1.0 - ventral);
    // ---- dorsal (specimens 008, 009; live 2.webp, 4.webp, 5.webp, 6.webp): a dark ground glittering with very
    // fine pale granule tips, the glitter crowded into bilaterally symmetric streaks radiating from the gastric
    // region; pale lines along the epibranchial arcs behind the orbits and the M-shaped ridge in front of the
    // intestinal region; a broad translucent rim inside the lateral and posterior margins
    vec2 rq = q - vec2(0.0, 0.03);
    float ang = atan(rq.x, rq.y);
    float rad = length(rq);
    // streaks stretched along the radius (tangential frequency 3× the radial; arc length, so no pole at the centre)
    // half radial streaks, half isotropic marbling, so no pinwheel shows when the pale pigment covers most
    float streak = mix(kgFbm(vec3(ang * rad * 11.0, rad * 6.0, seedP + 3.1)), kgFbm(vec3(q * 8.0, seedP + 6.3)), 0.5);
    float vein = kgFbm(vec3(q * 15.0, seedP + 9.0));
    float lightM = smoothstep(0.42, 0.66, streak + 0.3 * (vein - 0.5));
    float gastric = exp(-((q.x * q.x) / 0.02 + (q.y - 0.12) * (q.y - 0.12) / 0.02));
    float zM = -0.2 - 0.065 * sin(3.14159 * clamp(q.x / 0.36, 0.0, 1.0)) + 0.035 * exp(-pow(q.x / 0.035, 2.0));
    float brk = smoothstep(0.3, 0.6, kgFbm2(vec3(q * 22.0, seedP + 5.0)));   // the lines are broken, not drawn
    float mRidge = (1.0 - smoothstep(0.003, 0.009, abs(q.y - zM))) * (1.0 - smoothstep(0.32, 0.4, q.x)) * brk;
    float eArc = abs(length(vec2(q.x / 0.44, (q.y - 0.06) / 0.23)) - 1.0) * 0.23;
    float arc = (1.0 - smoothstep(0.002, 0.008, eArc)) * smoothstep(0.12, 0.17, q.x) * smoothstep(0.08, 0.14, q.y) * brk;
    // cover: how much of the dorsum the pale pigment takes — little in dark individuals (2.webp, 6.webp), most of
    // it in pale ones (4.webp, 5.webp), where the dark is left as marbling
    float cover = uKgMorph.z;
    vec3 base = mix(marb * 0.55, marb, 0.6 * kgFbm2(vec3(q * 9.0, seedP)));
    vec3 gold = ground * 1.1 + 0.015;
    base = mix(base, mix(ground * 0.7, marb, 0.3), clamp(lightM * 1.4 - 0.2, 0.0, 1.0) * smoothstep(0.55, 0.95, cover));
    float dens = clamp(cover + 0.4 * lightM - 0.3 * gastric, 0.15, 0.98);
    float fl1 = kgSpeck(vec3(q * 150.0, seedP * 0.5 + P.y * 150.0), dens, 0.34, fw * 150.0, idd);
    float fl2 = kgSpeck(vec3(q * 72.0, seedP * 0.7 + P.y * 72.0), dens * 0.45, 0.3, fw * 72.0, idd);
    vec3 dcol = mix(base, gold, clamp(fl1 * 0.85 + fl2 * 0.6, 0.0, 1.0));
    dcol = mix(dcol, gold * 0.8, clamp(mRidge * 0.45 + arc * 0.35, 0.0, 1.0));
    // a darker band just behind the M ridge
    dcol = mix(dcol, base * 0.75, exp(-pow((q.y - zM + 0.035) / 0.025, 2.0)) * 0.45 * (1.0 - smoothstep(0.3, 0.38, q.x)));
    // the translucent rim inside the lateral and posterior margins, its inner edge a fine golden line (008)
    float rimZ = 1.0 - smoothstep(0.24, 0.32, q.y) * (1.0 - smoothstep(0.36, 0.44, q.x));
    float rim = smoothstep(0.39, 0.43, s) * (1.0 - smoothstep(0.5, 0.56, s)) * rimZ;
    float rimLine = (1.0 - smoothstep(0.0, 0.006, abs(s - 0.395))) * rimZ;
    dcol = mix(dcol, mix(ground * 0.85, vec3(0.6, 0.56, 0.46), 0.3), rim * 0.75);
    dcol = mix(dcol, gold * 0.9, rimLine * 0.6);
    // ---- relief: tubercles dense on the branchial regions, cardiac & intestinal smooth [L]
    float branch = smoothstep(0.12, 0.3, q.x) * (1.0 - smoothstep(0.42, 0.5, s)) * smoothstep(-0.38, -0.05, -abs(q.y + 0.08) * 1.4);
    float smoothCard = exp(-((q.x * q.x) / 0.012 + (q.y + 0.2) * (q.y + 0.2) / 0.03));
    float tub = 0.0;
    if (det > 0.05) {
      tub = kgDome(vec3(q * 52.0, seedP * 0.37) + vec3(0.0, 0.0, P.y * 52.0), mix(0.12, 0.7, branch) * (1.0 - smoothCard * 0.9), 0.36, fw * 52.0, off, idd);
      float tub2 = kgDome(vec3(q * 110.0, seedP) + vec3(0.0, 0.0, P.y * 110.0), 0.55 * (1.0 - smoothCard), 0.34, fw * 110.0, off, idd);
      h += (tub * 0.009 + tub2 * 0.004) * dorsal;
      // only the granules' tips catch the pale pigment (the specimens' fine golden flecks), the ground stays dark
      dcol = mix(dcol, ground * 1.15 + 0.02, (smoothstep(0.45, 0.95, tub) * 0.25 + smoothstep(0.5, 1.0, tub2) * 0.08) * dorsal);
    }
    // grooves: cervical (curving across), the H between gastric and cardiac, faint; gastro-branchial furrows
    float cerv = abs(q.y - (0.08 - 0.55 * q.x * q.x));
    float groove = (1.0 - smoothstep(0.0, 0.014, cerv)) * smoothstep(0.05, 0.12, q.x) * (1.0 - smoothstep(0.3, 0.36, q.x));
    // regions are indistinct in this species [L]: the grooves are soft, shallow and wander a little
    float wob = (kgN3(vec3(q * 18.0, seedP)) - 0.5) * 0.012;
    float hgr = (1.0 - smoothstep(0.0, 0.016, abs(q.x - 0.065 + wob))) * smoothstep(-0.19, -0.12, q.y) * (1.0 - smoothstep(-0.01, 0.05, q.y));
    // the epibranchial furrow lies just in front of its pale line
    float eArcG = abs(length(vec2(q.x / 0.44, (q.y - 0.075) / 0.23)) - 1.0) * 0.23;
    float arcG = (1.0 - smoothstep(0.0, 0.014, eArcG)) * smoothstep(0.12, 0.17, q.x) * smoothstep(0.08, 0.14, q.y);
    float grooves = max(max(groove, hgr), arcG) * dorsal;
    h -= grooves * 0.005;
    dcol *= 1.0 - grooves * 0.35;
    // the crested lateral border: a beaded line along the girth [L]
    float crest = (1.0 - smoothstep(0.0, 0.009, abs(s - 0.485))) * (1.0 - faceM);
    float beads = 0.5 + 0.5 * cos(vKgUv.x * 6.2831853 * 140.0);
    h += crest * (0.004 + 0.002 * beads);
    dcol = mix(dcol, ground * 1.1, crest * 0.25 * (0.6 + 0.4 * kgN3(vec3(vKgUv.x * 90.0, seedP, 1.0))));
    // ---- sides (branchiostegite / pterygostomial): dark speckled, granular
    vec3 scol = mix(ground, marb, 0.6 + 0.3 * (1.0 - lightM));
    float spk = kgSpeck(P * 60.0 + seedP, 0.8, 0.3, fw * 60.0, idd);
    scol = mix(scol, black, spk * 0.6);
    if (det > 0.05) {
      float sg = kgDome(P * 90.0 + seedP + 4.0, 0.6, 0.34, fw * 90.0, off, idd);
      h += sg * 0.003 * (1.0 - dorsal) * (1.0 - ventral);
      scol = mix(scol, cream * 0.9, sg * 0.25);
    }
    // ---- face: suborbital ridge with a row of small granules [L], epistome; the buccal cavity is dark
    // the face around the mouth frame: dark, veined with the dorsum's pale colour (2.webp, 4.webp)
    vec3 fcol = mix(marb, ground, 0.25 * smoothstep(0.45, 0.7, kgFbm(P * 16.0 + seedP)));
    float subOrb = (1.0 - smoothstep(0.0, 0.02, abs(P.y - 0.48))) * smoothstep(0.08, 0.12, q.x) * (1.0 - smoothstep(0.34, 0.4, q.x));
    float gran = 0.5 + 0.5 * cos(q.x * 6.2831853 * 34.0);
    h += subOrb * faceM * 0.003 * gran;
    fcol = mix(fcol, ground, subOrb * gran * 0.25);
    fcol = mix(fcol, black, kgSpeck(P * 70.0 + seedP + 3.0, 0.5, 0.26, fw * 70.0, idd) * 0.7);
    // under the maxillipeds the face turns into the pale lavender front of the sternum (2.webp)
    fcol = mix(fcol, vec3(0.5, 0.46, 0.56), smoothstep(0.1, 0.04, P.y) * 0.85);
    // ---- ventral (3.webp): the sternum's lateral plates violet ("the underside red-purple" [L]), deepest toward the
    // legs, pale lavender in front of the chelipeds' bases; every suture and plate margin white; fine grey dots.
    // Preserved specimens have lost the violet (005, 006, 012).
    float zs = P.z;
    float sutD = min(min(abs(zs - 0.235 + 0.6 * q.x * q.x), abs(zs - 0.085 + 0.5 * q.x * q.x)), min(abs(zs + 0.05 + 0.4 * q.x * q.x), abs(zs + 0.18 + 0.3 * q.x * q.x)));
    // the sutures run in from between the coxae and stop short of the abdomen's groove
    float suture = (1.0 - smoothstep(0.004, 0.014, sutD)) * smoothstep(0.17, 0.27, q.x);
    float violetAmt = clamp(0.75 + 0.15 * purple + 0.15 * red, 0.0, 1.0);
    float violet = violetAmt * (1.0 - smoothstep(0.16, 0.26, zs)) * smoothstep(0.03, 0.12, q.x);
    vec3 vcol = mix(vec3(0.62, 0.6, 0.72), vec3(0.11, 0.045, 0.3), violet * (0.8 + 0.2 * smoothstep(0.1, 0.3, q.x)));
    vcol = mix(vcol, vec3(0.82, 0.82, 0.84), suture * 0.85);
    vcol = mix(vcol, vec3(0.1, 0.09, 0.11), kgSpeck(P * 85.0 + seedP + 11.0, 0.45, 0.26, fw * 85.0, idd) * 0.5);
    // the median groove where the abdomen locks in
    vcol *= 1.0 - (1.0 - smoothstep(0.004, 0.012, q.x)) * 0.3;
    // the underside of the branchiostegites, between the leg bases and the sternum: pale blue-grey washed with the
    // sternum's violet near the coxae, finely dotted (3.webp); only the outward-facing wall carries the dorsal colour
    float under = smoothstep(0.6, 0.72, s) * (1.0 - ventral) * (1.0 - smoothstep(0.3, 0.42, P.z));
    vec3 ucol = mix(vcol, vec3(0.55, 0.56, 0.62), (1.0 - smoothstep(0.6, 0.7, s)) * 0.6);
    scol = mix(scol, ucol, under);
    float side = (1.0 - dorsal) * (1.0 - ventral);
    col = dcol * dorsal + scol * side * (1.0 - faceM) + fcol * faceM * (1.0 - dorsal) + vcol * ventral;
    rough = mix(0.66, 0.78, tub) * dorsal + 0.7 * side + 0.55 * ventral;
    // the buccal cavity (behind the third maxillipeds): dark, evaluated continuously so its edge is smooth
    float cav = (1.0 - smoothstep(0.16, 0.2, q.x)) * smoothstep(0.09, 0.13, P.y) * (1.0 - smoothstep(0.39, 0.43, P.y)) * smoothstep(0.37, 0.4, P.z) * (1.0 - dorsal);
    col = mix(col, vec3(0.02, 0.016, 0.014), cav);
    rough = mix(rough, 0.35, cav);
    ao = mix(ao, 0.25, cav);
    // glitter: white chromatophores everywhere on the dorsum, denser on the sides
    if (det > 0.3) glint = kgSpeck(P * 160.0 + seedP + 41.0, 0.32 + 0.3 * side, 0.18, fw * 160.0, idd);
    trans = 0.08 + 0.4 * rim;
    // the granular dorsum breaks the water film into sparkles: no mirror coat there (2.webp)
    kgCoatK = 1.0 - 0.85 * dorsal - 0.5 * side;
    wetBias = 0.25 * ventral + 0.15 * faceM;
    sandExp = 0.35 * ventral + 0.25 * side * smoothstep(0.55, 0.75, s);
    ao *= mix(1.0, 0.6, smoothstep(0.6, 0.9, s) * (1.0 - ventral)); // under the overhang of the carapace
    // ovigerous female: the egg mass shows under the abdomen's rim (handled by the abdomen part)
  }
  // ------------------------------------------------------------------ eyestalks and cornea
  else if (part < 5.5) {
    float isDistal = step(0.5, seg);
    float th = vKgUv.x * 6.2831853;
    // the cornea is an oblique window: low on the front of the tip, high on its back (4.webp)
    float edge = 0.222 - 0.03 * cos(th - 0.6);
    float cornea = isDistal * smoothstep(edge - 0.004, edge + 0.004, P.x);
    // the stalk: grey-violet, mottled dark in irregular patches, finely speckled; a dusky band just below the
    // cornea (2.webp close-up: mean sRGB ≈ 93,90,85; 013)
    vec3 stalk = mix(vec3(0.4, 0.41, 0.46), ground * 0.6, 0.3 * (1.0 - pale));
    // the basal article sits in the orbit: shaded, no pattern of its own (its seam would show)
    float basal = 1.0 - isDistal;
    float mott = smoothstep(0.42, 0.64, kgFbm(vec3(P.x * 45.0, P.y * 45.0, P.z * 45.0 + seedP + limb)));
    stalk = mix(stalk, mix(marb, vec3(0.06, 0.055, 0.065), 0.5), mott * (0.2 + 0.45 * pale));
    stalk = mix(stalk, marb * 0.5, kgSpeck(P * 80.0 + seedP, 0.45, 0.24, fw * 80.0, idd) * 0.5);
    stalk = mix(stalk, mix(marb, vec3(0.1), 0.5), smoothstep(edge - 0.06, edge - 0.01, P.x) * isDistal * 0.3);
    if (det > 0.2) glint = kgSpeck(P * 170.0 + seedP + 3.0, 0.55, 0.2, fw * 170.0, idd) * (1.0 - cornea);
    // cornea: a dark grey cap, lighter toward its rim, golden flecks; the pseudopupil that faces the viewer is
    // darkened in the light stage (2.webp: dark centre, pale edge; 013)
    float rimC = smoothstep(0.012, 0.03, length(P.yz));
    vec3 corn = mix(vec3(0.045, 0.04, 0.038), vec3(0.16, 0.15, 0.14), rimC * 0.7);
    float fleck = kgSpeck(P * 220.0 + seedP + 7.0, 0.35, 0.2, fw * 220.0, idd);
    corn = mix(corn, vec3(0.34, 0.24, 0.1), fleck * 0.5);
    // ommatidial facets: a fine hexagonal-ish ripple at macro range
    float fac = (0.5 + 0.5 * cos(P.x * 900.0) * cos(th * 40.0)) * (1.0 - smoothstep(0.0, 0.002, fw));
    h += cornea * fac * 0.0004;
    // a pale ring at the cornea's lower edge
    float ring = (1.0 - smoothstep(0.0, 0.006, abs(P.x - edge))) * isDistal;
    stalk = mix(stalk, mix(marb, stalk, 0.35) * 0.8, basal);
    col = mix(stalk, corn, cornea);
    col = mix(col, cream, ring * 0.3);
    rough = mix(0.45, 0.2, cornea);
    trans = mix(0.4, 0.05, cornea);
    kgCoat = cornea;
    kgCornea = cornea;
  }
  // ------------------------------------------------------------------ third maxillipeds
  else if (part < 7.5) {
    // 2.webp, 4.webp, 002–005: each shield's merus and upper ischium a dark field dense with white specks, a white
    // oblique blaze across its upper part (the pair reads as a pale V), the lower ischium pale; some individuals
    // carry random blotches instead of a solid field [L]; rounded tubercles all over [L]
    float sideUp = limb < 12.5 ? 1.0 : -1.0;
    float xm = clamp(P.x / 0.24, 0.0, 1.0);          // 0 hinge … 1 midline
    float zn = P.z * sideUp / 0.17;                  // -1 bottom … 1 top
    float sutL = zn - (0.12 + 0.5 * (0.45 - xm));     // > 0 above the oblique ischium–merus suture
    float blotchy = step(0.62, seedC);
    // the dark field ends in a ragged edge a little below the middle; the lower ischium pale lavender-grey
    float field = smoothstep(-0.32, -0.05, zn + 0.2 * (kgFbm(vec3(P.x * 18.0, P.z * 18.0, seedP + limb)) - 0.5)) * (1.0 - smoothstep(0.9, 1.05, zn));
    float blot = smoothstep(0.42, 0.62, kgFbm(vec3(P.x * 22.0, P.z * 22.0, seedP + limb)));
    field *= mix(1.0, blot, blotchy);
    // pale morphs: black and white; dark morphs (6.webp): the body's dusky violet with little white
    vec3 m = mix(mix(ground, marb, 0.4), mix(vec3(0.66, 0.66, 0.72), ground, 0.2), pale);
    vec3 dark = mix(vec3(0.03, 0.03, 0.035), marb * 0.5, 0.3 + 0.5 * (1.0 - pale));
    float wspk = kgSpeck(P * 190.0 + seedP + 13.0, 0.5, 0.25, fw * 190.0, idd);
    vec3 fieldC = mix(dark, vec3(0.86, 0.86, 0.84), wspk * 0.9);
    // the blaze: a pale streak running obliquely down toward the midline in the upper half
    float bl = (zn - 0.15) - (xm - 0.75) * 0.9;
    float blaze = (1.0 - smoothstep(0.06, 0.2, abs(bl))) * smoothstep(0.25, 0.6, xm) * smoothstep(-0.1, 0.25, zn) * (1.0 - smoothstep(0.75, 0.95, zn));
    fieldC = mix(fieldC, vec3(0.88, 0.88, 0.86), blaze * (0.2 + 0.65 * pale));
    m = mix(m, fieldC, field);
    // a faint grey smudge low on the ischium, a pale rim all round
    m = mix(m, m * 0.72, exp(-pow((zn + 0.55) / 0.12, 2.0)) * 0.6 * (1.0 - field));
    float rimM = smoothstep(0.86, 1.0, max(abs(zn), abs(xm * 2.0 - 1.0)));
    m = mix(m, vec3(0.84, 0.83, 0.8), rimM * 0.5);
    // the suture line and tubercles
    float suture = (1.0 - smoothstep(0.0, 0.035, abs(sutL))) * (1.0 - smoothstep(0.85, 1.0, xm));
    h -= suture * 0.003;
    m *= 1.0 - suture * 0.35;
    if (det > 0.05) {
      float tb = kgDome(P * 95.0 + seedP + 3.0, 0.6, 0.32, fw * 95.0, off, idd);
      h += tb * 0.0024;
      m = mix(m, m * 1.15 + 0.02, tb * 0.2);
    }
    if (det > 0.2) glint = kgSpeck(P * 180.0 + seedP + 17.0, 0.6, 0.2, fw * 180.0, idd) * (0.4 + 0.6 * field);
    col = m; rough = mix(0.45, 0.6, field); trans = 0.12; wetBias = 0.35 + 0.4 * uKgFeed.y;
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
    col = a; rough = 0.42; wetBias = 0.3;
  }
  // ------------------------------------------------------------------ chelipeds
  else if (part < 11.5) {
    float t = vKgUv.y;
    float th = vKgUv.x * 6.2831853;
    float sideS = limb < 8.5 ? 1.0 : -1.0;
    float inner = smoothstep(0.35, 0.7, cos(th) * sideS);
    // merus and carpus: the body's colours, mottled and granular (2.webp: olive-black shoulders; 6.webp: violet)
    // olive-gold granular shoulders, brighter than the dorsum (2.webp), mottled dark
    vec3 arm = mix(mix(ground, limbG, 0.3), marb, 0.1 + 0.3 * smoothstep(0.45, 0.65, kgFbm(P * 18.0 + limb)));
    arm = mix(arm, black, kgSpeck(P * 70.0 + seedP + limb * 7.0 + seg, 0.6, 0.3, fw * 70.0, idd) * 0.35);
    arm = mix(arm, mix(arm, vec3(0.3, 0.22, 0.6) * 0.5, 0.6), red * 0.6);
    // granular arm; the palm finely so, the fingers smooth
    if (det > 0.05 && part < 9.5) {
      float g = kgDome(P * 120.0 + seg * 3.3 + limb, 0.55, 0.3, fw * 120.0, off, idd);
      h += g * 0.0025;
      arm = mix(arm, ground * 1.3 + 0.03, g * 0.35);
    } else if (det > 0.05 && part < 10.5) {
      float g = kgDome(P * 230.0 + limb, 0.45, 0.3, fw * 230.0, off, idd);
      h += g * 0.0008 * (1.0 - smoothstep(0.27, 0.32, P.x));
    }
    col = arm; rough = 0.6; trans = 0.15;
    if (seg > 2.5 && seg < 3.5) {
      // merus: a long oval tympanum on the inner face [L]
      float ty = inner * max(0.0, 1.0 - pow((t - 0.5) / 0.34, 2.0));
      float tym = smoothstep(0.0, 0.25, ty);
      vec3 tcol = mix(vec3(0.5, 0.48, 0.46), black, kgSpeck(P * 150.0 + seedP + 29.0, 0.7, 0.36, fw * 150.0, idd) * 0.8);
      tcol = mix(tcol, col * 0.85, 1.0 - pale);
      col = mix(col, tcol, tym);
      rough = mix(rough, 0.32, tym);
      h -= tym * 0.0015;
      if (det > 0.2) glint = max(glint, kgSpeck(P * 200.0 + seedP + 31.0, 0.5, 0.2, fw * 200.0, idd) * tym);
    }
    if (part > 9.5) {
      // propodus: palm, then the fixed finger (the dactylus is part 11 throughout)
      float x = P.x;
      float fing = part > 10.5 ? 1.0 : smoothstep(0.27, 0.32, x);
      // the palm: porcelain grey-white, finely speckled, a dusky patch over its proximal upper part (2.webp,
      // 4.webp); pink-red in breeding males (6.webp)
      // translucent blue-grey porcelain (2.webp: mean sRGB ≈ 155,153,149 in its light)
      vec3 palmC = mix(vec3(0.42, 0.45, 0.5), limbG, 0.25);
      float dusk = clamp(smoothstep(0.15, 0.03, x) * 0.8 + smoothstep(0.0, 0.05, P.y) * (1.0 - smoothstep(0.16, 0.27, x)), 0.0, 1.0);
      dusk *= 0.55 + 0.45 * kgFbm2(P * 30.0 + seedP);
      palmC = mix(palmC, mix(marb, vec3(0.06, 0.065, 0.075), 0.5), dusk * 0.85);
      palmC = mix(palmC, mix(marb * 0.6, vec3(0.05), 0.4), kgSpeck(P * 220.0 + seedP + 37.0, 0.5, 0.26, fw * 220.0, idd) * 0.3);
      // breeding males: pink-white, pinker along the upper margin, dark-speckled (6.webp)
      vec3 palmR = mix(mix(pinkL, vec3(0.82, 0.76, 0.76), 0.45), pink, smoothstep(0.0, 0.08, P.y) * 0.5);
      palmR = mix(palmR, vec3(0.06, 0.03, 0.03), kgSpeck(P * 150.0 + seedP + 39.0, 0.35, 0.3, fw * 150.0, idd) * 0.7);
      palmC = mix(palmC, palmR, smoothstep(0.4, 0.9, red) * 0.9);
      if (det > 0.2) glint = max(glint, kgSpeck(P * 190.0 + seedP + 43.0, 0.45, 0.2, fw * 190.0, idd) * (1.0 - fing));
      // fingers: porcelain, glossy; the cutting edges and tips flushed pink (3.webp, 2.webp), darker red-brown
      // tips in breeding males (6.webp)
      float ft = part > 10.5 ? clamp(x / 0.25, 0.0, 1.0) : clamp((x - 0.29) / 0.23, 0.0, 1.0);
      float cutSide = part > 10.5 ? -sin(th) : sin(th);
      float edge = smoothstep(0.1, 0.8, cutSide);
      vec3 fcol = vec3(0.7, 0.72, 0.75);
      fcol = mix(fcol, pinkL, edge * smoothstep(0.15, 0.7, ft) * (0.45 + 0.5 * red));
      fcol = mix(fcol, mix(pinkL, pink, 0.3 + 0.7 * red), smoothstep(0.5, 0.92, ft) * (0.55 + 0.4 * red));
      // the very tips: horn-yellow (3.webp), red-brown in breeding males (6.webp)
      fcol = mix(fcol, mix(vec3(0.62, 0.6, 0.22), vec3(0.25, 0.08, 0.06), red), smoothstep(0.9, 1.0, ft) * 0.75);
      col = mix(palmC, fcol, fing);
      rough = mix(0.42, 0.22, fing);
      trans = mix(0.45, 0.5, fing);
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
    if (part > 12.5 && part < 13.5) band = max(max(smoothstep(0.15, 0.03, abs(t - 0.24 - jitter)), smoothstep(0.14, 0.03, abs(t - 0.6 + jitter))), smoothstep(0.08, 0.0, abs(t - 0.9)));
    else if (part > 13.5 && part < 14.5) band = seg < 4.5 ? smoothstep(0.3, 0.08, abs(t - 0.5 - jitter)) : max(smoothstep(0.18, 0.04, abs(t - 0.38)), smoothstep(0.09, 0.0, abs(t - 0.88)));
    else if (part > 14.5) band = smoothstep(0.32, 0.18, t) * 0.8;
    band *= 0.45 + 0.55 * kgFbm2(P * 24.0 + limb * 3.1 + seg);
    // the bands are a dorsal pattern: the underside of the leg is pale, finely dotted (3.webp)
    band *= 0.35 + 0.65 * smoothstep(-0.85, -0.2, sin(th));
    // ragged dark bands over translucent grey-white (2.webp, 4.webp, 5.webp); breeding males: violet legs with
    // maroon meri (6.webp)
    // the bands are soft, cloudy dusky patches under a translucent cuticle (2.webp close-up), not painted rings
    band = smoothstep(0.1, 0.65, band + 0.3 * (kgFbm(P * 22.0 + limb * 1.7 + seg) - 0.5));
    vec3 lg = mix(limbG, limbD, band * 0.85);
    // fine dark chromatophore dots, sparse, a little denser in the bands
    lg = mix(lg, limbD * 0.5, kgSpeck(P * 110.0 + vec3(limb * 3.7, seg * 1.3, seedP), 0.45, 0.26, fw * 110.0, idd) * (0.3 + 0.4 * band));
    // the joints flush a little orange (009)
    float joint = smoothstep(0.1, 0.0, t) + smoothstep(0.93, 1.0, t);
    lg = mix(lg, orange * 0.8 + cream * 0.25, joint * 0.18 * (part < 14.5 ? 1.0 : 0.3));
    // purplish individuals: the legs carry the tint (024, 025, 040–044)
    lg = mix(lg, lg * vec3(1.04, 0.94, 1.08), purple * 0.5);
    if (part > 12.5 && part < 13.5) lg = mix(lg, maroon * (0.7 + 0.6 * kgFbm2(P * 20.0 + limb)), smoothstep(0.45, 0.9, red) * 0.85 * smoothstep(-0.2, 0.6, sin(th)));
    // the coxae share the underside's violet
    if (part < 12.5) lg = mix(lg, vec3(0.17, 0.075, 0.33), clamp(0.45 + 0.35 * purple + 0.3 * red, 0.0, 1.0) * 0.55 * (1.0 - smoothstep(0.0, 0.6, sin(th))));
    rough = 0.5;
    trans = 0.32;
    // the merus: one undivided oval tympanum on each broad face [L] — dark, densely speckled, glossier (010)
    if (part > 12.5 && part < 13.5) {
      float faceZ = abs(cos(th));
      float ov = max(0.0, 1.0 - pow((t - 0.5) / 0.36, 2.0)) * max(0.0, 1.0 - pow(sin(th) / 0.74, 2.0));
      float tym = smoothstep(0.02, 0.3, ov) * smoothstep(0.3, 0.6, faceZ);
      vec3 tcol = mix(lg * 0.82, limbD * 0.6, kgSpeck(P * 160.0 + vec3(limb, seedP, 2.0), 0.55, 0.3, fw * 160.0, idd) * 0.6);
      lg = mix(lg, tcol, tym * 0.6);
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
    // bristles: dark brown-black, stiff (2.webp, 4.webp, 6.webp: "black stout setae, sparse" [L]); the soft
    // water-wicking tufts at the leg bases and the maxillipeds' fringe pale [L]
    float tt = vKgInfo.x;
    float L = vKgLimb;
    float soft = (L < 50.0 && mod(L, 10.0) < 0.5) || (L > 115.0 && L < 145.0) ? 1.0 : 0.0;
    vec3 dark = mix(vec3(0.02, 0.016, 0.014), vec3(0.16, 0.12, 0.09), tt * 0.6);
    col = mix(dark, mix(vec3(0.66, 0.6, 0.48), vec3(0.85, 0.82, 0.74), tt), soft);
    rough = 0.45; trans = mix(0.25, 0.9, soft); wetBias = 0.1;
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
  material.clearcoat = clamp(kgCoat, 0.0, 1.0) * 0.5;
  material.clearcoatRoughness = clamp(0.1 + geometryRoughness + kgRough * 0.35 * smoothstep(0.004, 0.03, kgFw), 0.1, 0.6);
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
/**
 * Named colour morphs seen in the photographs, for the viewer's photo-match presets and for tests:
 * pale (aquarium, grey-olive marbling on near-white), khaki (aquarium, sandy), grey (field on dark sand, black and
 * white mottling), purple (field, a dark violet male with red-maroon legs and pink chelae — breeding colours).
 */
/**
 * Colour morphs calibrated on the photographs (linear values given in sRGB-ish authoring space, converted by lin):
 * pale (2.webp), khaki (4.webp), grey (5.webp, the field on dark sand), brown (specimens 007–009), purple (6.webp,
 * the displaying male). red: the breeding flush (pink-red chelae, maroon meri) of males in the waving season.
 */
const MORPHS = {
  pale: { tint: [0.66, 0.64, 0.44], dark: [0.07, 0.075, 0.065], purple: 0.08, pale: 0.85, red: 0.15, cover: 0.55 },
  khaki: { tint: [0.7, 0.67, 0.5], dark: [0.3, 0.28, 0.2], purple: 0.0, pale: 0.8, red: 0.05, cover: 0.85 },
  grey: { tint: [0.74, 0.74, 0.72], dark: [0.16, 0.16, 0.17], purple: 0.1, pale: 0.6, red: 0.35, cover: 0.85 },
  brown: { tint: [0.68, 0.55, 0.32], dark: [0.12, 0.08, 0.045], purple: 0.0, pale: 0.7, red: 0.1, cover: 0.65 },
  purple: { tint: [0.56, 0.44, 0.62], dark: [0.22, 0.13, 0.25], purple: 1.0, pale: 0.0, red: 0.9, cover: 0.5 },
};

export function paletteFor(name, seed = 1) {
  const P = MORPHS[name];
  if (!P) return null;
  const f = (seed * 0.618) % 1;
  return {
    tint: lin(...P.tint), dark: lin(...P.dark), purple: P.purple, pale: P.pale, red: P.red, cover: P.cover,
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
    red: P.red * (sex === 'm' ? 0.6 + 0.4 * rand() : 0.3), cover: Math.min(0.95, P.cover * (0.85 + 0.3 * rand())),
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
