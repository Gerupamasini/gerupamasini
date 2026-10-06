import { Color, DoubleSide, FrontSide, MeshPhysicalMaterial, MeshStandardMaterial, Vector4 } from 'three';

/**
 * アサリ materials — everything is procedural, no textures.
 *
 * Shell geometry carries uv = (u, s): u runs once around the valve margin (umbo → anterior → ventral →
 * posterior → umbo), s is the growth coordinate (0 at the umbo, 1 at the margin). Growth lines are lines
 * of constant s, radial ribs lines of constant u, so the sculpture and the colour pattern are both
 * evaluated in that space and follow the shell the way the mantle laid them down.
 *
 * Each individual owns its material instances (cheap JS objects) so its seeds / sand level / deformation
 * are plain uniforms; the GLSL is identical across instances, so they all share one compiled program.
 *
 * uSand = (ground y in world, soft band width in shell lengths, enabled, wetness)
 */

const COMMON = /* glsl */ `
float asH(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float asN(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(asH(i), asH(i+vec2(1,0)), f.x), mix(asH(i+vec2(0,1)), asH(i+vec2(1,1)), f.x), f.y);
}
float asH3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float asN3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(asH3(i), asH3(i+vec3(1,0,0)), f.x), mix(asH3(i+vec3(0,1,0)), asH3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(asH3(i+vec3(0,0,1)), asH3(i+vec3(1,0,1)), f.x), mix(asH3(i+vec3(0,1,1)), asH3(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float asFbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*asN(p); p = p*2.03+17.1; a *= 0.5; } return s; }
// u wraps around the margin: evaluate noise on a circle so there is no seam at the umbo
float asFbmU(float u, float v, float freq){ float a = u*6.2831853; return asFbm(vec2(cos(a), sin(a))*freq*0.16 + vec2(v, v*0.37)); }
vec3 asLin(vec3 c){ return pow(c, vec3(2.2)); }
// bump from an analytic height (in metres): three's perturbNormalArb
vec3 asBump(vec3 pos, vec3 n, float h, float faceDir){
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 g = sign(det) * (dH.x*r1 + dH.y*r2);
  return normalize(abs(det)*n - g);
}
`;

const SAND_VERT_DECL = /* glsl */ `
varying vec3 vAsWorld;
varying float vAsScale;
`;
const SAND_VERT = /* glsl */ `
#ifdef USE_INSTANCING
  vec4 asW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vAsScale = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
#else
  vec4 asW = modelMatrix * vec4(transformed, 1.0);
  vAsScale = length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
#endif
  vAsWorld = asW.xyz;
`;
const SAND_FRAG_DECL = /* glsl */ `
uniform vec4 uSand;
varying vec3 vAsWorld;
varying float vAsScale;
`;
// soft intersection: nothing below the sand; a thin band just above it picks up wet sand and loses light
const SAND_CLIP = /* glsl */ `
  float asAbove = (vAsWorld.y - uSand.x) / max(1e-5, uSand.y * vAsScale);
  if (uSand.z > 0.5 && asAbove < 0.0) discard;
  float asBand = uSand.z > 0.5 ? 1.0 - smoothstep(0.0, 1.0, asAbove) : 0.0;
`;
const SAND_TINT = /* glsl */ `
  diffuseColor.rgb = mix(diffuseColor.rgb, asLin(vec3(0.36, 0.32, 0.26)) * (0.8 + 0.4*asN(vAsWorld.xz*1800.0)), asBand*0.85);
`;

function sandUniforms() {
  return { uSand: { value: new Vector4(-1e9, 0.04, 0, 0.9) } };
}

// ------------------------------------------------------------------------------------------------ shell, outer

const SHELL_OUTER_FRAG = /* glsl */ `
uniform vec4 uSeed;      // patternSeed, colorSeed, valve side (+1 left / -1 right), detail (0 far .. 1 macro)
varying vec2 vAsUv;
varying vec3 vAsLocal;
// seeds are hashed, so they must be bit-exact across the surface: a uniform, or a flat varying per instance
#ifdef AS_INSTANCED
flat varying vec4 vAsSeed;
#define AS_SEED vAsSeed
#else
#define AS_SEED uSeed
#endif

vec3 asPalette(float k){
  // ground colours seen in the reference set: tan-brown, grey, cream, charcoal-black, purplish brown, olive
  k = fract(k) * 6.0;
  vec3 c0 = vec3(0.56, 0.44, 0.31), c1 = vec3(0.55, 0.54, 0.50), c2 = vec3(0.82, 0.77, 0.67);
  vec3 c3 = vec3(0.17, 0.17, 0.17), c4 = vec3(0.44, 0.33, 0.33), c5 = vec3(0.50, 0.49, 0.37);
  vec3 a = k < 1.0 ? c0 : k < 2.0 ? c1 : k < 3.0 ? c2 : k < 4.0 ? c3 : k < 5.0 ? c4 : c5;
  vec3 b = k < 1.0 ? c1 : k < 2.0 ? c2 : k < 3.0 ? c0 : k < 4.0 ? c1 : k < 5.0 ? c0 : c1;
  return mix(a, b, smoothstep(0.55, 1.0, fract(k)) * 0.6);
}

// Height of the shell sculpture (≈0..1) and the growth checks. アサリ feel rough (布目状) because three scales
// stack: ~100 radial ribs, finer commarginal threads crossing them into small beads, and granules over all.
// Each layer fades out as it falls below a pixel; what is filtered away is returned in lost and turned into
// roughness, so the shell stays matte and gritty at any distance instead of turning smooth and glossy.
// extra = (granule, bead, grit); asRibVis / asLamVis: the lattice as the eye still resolves it (for colour)
float asRibVis, asLamVis;
float asSculpt(vec2 uv, vec3 lp, float seed, float detail, out float checks, out float lost, out vec3 extra){
  float u = uv.x, s = uv.y;
  float post = smoothstep(0.45, 0.75, u) * (1.0 - smoothstep(0.9, 1.0, u));
  // radial ribs: ~100 fine flat-topped ribs, stronger on the posterior slope
  // ribs wander a little and vary in strength, as on a real shell
  // ~110 narrow ribs (reference shells): a fine texture, never broad stripes. Each layer is faded out well
  // before it reaches the pixel size, otherwise it beats against the pixel grid into radial bands.
  float ribC = u * 110.0 + (asFbmU(u, s*3.0 + seed*9.0, 12.0) - 0.5) * 1.6;
  float aR = pow(clamp(1.0 - 2.4*fwidth(ribC), 0.0, 1.0), 2.0);
  float ribW = pow(0.5 + 0.5*cos(6.2831853*ribC), 1.6) * mix(0.8, 1.1, asH(vec2(floor(ribC + 0.5), seed*3.0)));
  float ribA = mix(0.45, 1.0, post) * smoothstep(0.03, 0.5, s);
  // commarginal threads with irregular spacing (growth rate varies)
  float g = s*s*34.0 + s*30.0 + asFbmU(u, s*9.0 + seed*7.0, 3.0) * 1.8;
  float aG = pow(clamp(1.0 - 2.4*fwidth(g), 0.0, 1.0), 2.0);
  float lamW = pow(0.5 + 0.5*cos(6.2831853*g), 3.0) * mix(0.5, 1.3, asH(vec2(floor(g + 0.5), seed*7.0)));
  float lamA = mix(0.5, 1.0, smoothstep(0.2, 0.9, s)) * mix(0.8, 1.25, 1.0 - post);
  // finer threads between them (about two per lamella)
  float g2 = g * 3.0 + 0.25;
  float aT = pow(clamp(1.0 - 2.6*fwidth(g2), 0.0, 1.0), 2.0);
  float thrW = pow(0.5 + 0.5*cos(6.2831853*g2), 2.0);
  // beads where ribs and threads cross
  asRibVis = mix(0.42, ribW, aR) * ribA;
  asLamVis = mix(0.33, lamW, aG) * lamA;
  float bead = ribW * max(lamW, thrW*0.7) * (0.6 + 0.8*asN(vec2(ribC*1.7, g*1.3)));
  float aB = aR * min(aG, aT);
  // granules: isotropic noise on the shell's own surface (shell-length units), ~260 grains per length
  vec3 m = lp * 260.0 + seed * 31.0;
  float aM = 1.0 - smoothstep(0.2, 0.5, length(fwidth(m)));
  // discrete grains rather than smooth noise: they catch light on one side and shadow on the other
  float n1 = asN3(m), n2 = asN3(m * 2.2 + 7.3);
  float gran = smoothstep(0.35, 0.8, n1) * 0.7 + smoothstep(0.4, 0.85, n2) * 0.5 * (1.0 - smoothstep(0.2, 0.5, length(fwidth(m * 2.2))));
  // how gritty this part is: patchy, strongest on the posterior slope and the younger margin, polished at the umbo
  float grit = mix(0.55, 1.0, post) * smoothstep(0.0, 0.45, s) * (0.55 + 0.7*asFbmU(u, s*4.0 + seed*17.0, 5.0));
  // a few strong growth checks (winter / spawning stops): grooves and a colour break
  checks = 0.0;
  for (int i = 0; i < 4; i++) {
    float c = 0.4 + 0.14*float(i) + (asH(vec2(seed*31.0, float(i))) - 0.5)*0.1;
    float w = 0.004 + 0.004*asH(vec2(float(i), seed*13.0));
    float wob = (asFbmU(u, float(i)*3.1 + seed, 2.0) - 0.5) * 0.012;
    float wob2 = (asFbmU(u, float(i)*1.7 + seed*3.0, 6.0) - 0.5) * 0.02;
    float present = step(asH(vec2(seed*5.0, float(i)+0.5)), 0.6) * smoothstep(0.25, 0.6, asFbmU(u, float(i)*5.3 + seed, 3.0));
    checks = max(checks, (1.0 - smoothstep(0.0, w, abs(s - c + wob + wob2))) * present);
  }
  float h = ribW * ribA * 0.4 * aR
          + lamW * lamA * 0.38 * aG
          + thrW * 0.12 * aT
          + bead * ribA * 0.45 * aB
          + (gran - 0.4) * 0.9 * grit * aM * mix(0.5, 1.0, detail)
          - checks * 0.45;
  lost = ribA * 0.4 * (1.0 - aR) + lamA * 0.38 * (1.0 - aG) + 0.12 * (1.0 - aT)
       + ribA * 0.45 * (1.0 - aB) + 0.6 * grit * (1.0 - aM);
  extra = vec3((gran - 0.4) * aM * grit, bead * ribA * aB, grit);
  return h;
}

vec3 asShellColor(vec2 uv, vec4 seed, float checks, float h, out float worn){
  float u = uv.x, s = uv.y;
  float ps = seed.x, cs = seed.y;
  float hp = asH(vec2(ps, 1.7)), hp2 = asH(vec2(ps, 4.3)), hp3 = asH(vec2(ps, 9.1));
  vec3 ground = asPalette(cs);
  float darkK = asH(vec2(cs, 2.2));
  vec3 dark = mix(ground * 0.35, vec3(0.10, 0.08, 0.07), darkK);
  dark = mix(dark, vec3(0.20, 0.12, 0.20), step(0.82, asH(vec2(cs, 6.6))) * 0.7);   // purple-black marks
  vec3 light = mix(vec3(0.86, 0.83, 0.75), ground * 1.35, 0.25);

  // pattern weights: net/tent zigzag, radial rays, concentric bands, mottle (2..4 active)
  vec4 w = vec4(hp, hp2, hp3, asH(vec2(ps, 12.7)));
  w = smoothstep(vec4(0.35), vec4(0.85), w);

  // warp so nothing is perfectly regular
  float warp = (asFbmU(u, s*4.0 + ps*11.0, 4.0) - 0.5);
  // A: 網目 — two families of oblique lines crossing into a net of tents
  float K = mix(26.0, 46.0, asH(vec2(ps, 3.3)));
  float M = mix(5.0, 9.0, asH(vec2(ps, 5.5)));
  float warp2 = asFbmU(u, s*9.0 + ps*5.0, 10.0) - 0.5;
  float l1 = abs(fract(u*K + s*M + warp*3.0 + warp2*0.8) - 0.5);
  float l2 = abs(fract(u*K - s*M*1.2 + warp*2.4 - warp2*0.8 + 0.25) - 0.5);
  float tri = min(l1, l2);
  float lw = 0.04 + 0.08*asFbmU(u, s*4.0 + ps*9.0, 7.0);
  float net = (1.0 - smoothstep(lw, lw + 0.08, tri)) * smoothstep(0.3, 0.55, asFbmU(u, s*3.0 + ps*13.0, 5.0));
  float tent = smoothstep(0.18, 0.3, max(l1, l2)) * smoothstep(0.35, 0.65, asFbmU(u, s*6.0 + ps*3.0, 9.0));
  float A = max(net*0.85, tent);
  // B: 帯状 radial rays (2–3) from the umbo, light or dark
  float B = 0.0;
  for (int i = 0; i < 3; i++) {
    float c = 0.2 + 0.6*asH(vec2(ps*7.0, float(i)*2.3));
    float wid = 0.015 + 0.05*asH(vec2(float(i), ps*3.7));
    B = max(B, 1.0 - smoothstep(wid*0.5, wid, abs(u - c + warp*0.04)));
  }
  B *= smoothstep(0.05, 0.25, s);
  float rayLight = step(0.5, asH(vec2(ps, 21.0)));
  // C: concentric colour bands
  float C = smoothstep(0.45, 0.65, asN(vec2(s*mix(5.0, 11.0, hp2) + ps*9.0, u*1.5 + warp)));
  // D: mottle / flames
  float D = smoothstep(0.52, 0.7, asFbmU(u, s*5.0 + ps*2.0, 14.0 + 10.0*hp3) + warp*0.2);

  vec3 col = ground * (0.85 + 0.3*asFbmU(u, s*3.0 + cs*5.0, 6.0));
  float fade = smoothstep(0.15, 0.6, asFbmU(u, s*2.0 + ps, 3.0) + 0.25);    // patterns fade in and out
  col = mix(col, dark, A * w.x * fade * 0.8);
  col = mix(col, mix(dark, light, rayLight), B * w.y * 0.85);
  col = mix(col, mix(col*0.55, col*1.25, step(0.5, hp)), C * w.z * 0.7);
  col = mix(col, dark, D * w.w * 0.8 * fade);
  // growth checks show as darker lines
  col *= 1.0 - checks*0.22;
  // worn umbo: periostracum gone, chalky
  worn = (1.0 - smoothstep(0.0, 0.14, s + (asN(vec2(u*40.0, ps)) - 0.5)*0.05));
  col = mix(col, vec3(0.74, 0.71, 0.66), worn * 0.55);
  // dirt sits in the grooves
  col *= mix(0.72, 1.0, clamp(h*1.3 + 0.2, 0.0, 1.0));
  return clamp(col, 0.0, 1.0);
}
`;

const SHELL_OUTER_VERT_DECL = /* glsl */ `
uniform vec4 uSeed;
varying vec2 vAsUv;
varying vec3 vAsLocal;
#ifdef AS_INSTANCED
flat varying vec4 vAsSeed;
attribute vec4 aSeed;
#endif
`;

/**
 * @param {object} [o]
 * @param {boolean} [o.instanced] seeds come from the per-instance `aSeed` attribute
 */
export function makeShellOuterMaterial(o = {}) {
  const uniforms = { uSeed: { value: new Vector4(0.37, 0.61, 1, 1) }, ...sandUniforms() };
  const mat = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.55, metalness: 0,
    ior: 1.53, specularIntensity: 0.4,
    clearcoat: 0.4, clearcoatRoughness: 0.38,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SAND_VERT_DECL + SHELL_OUTER_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + SAND_VERT + `
  vAsUv = uv;
  vAsLocal = position;
#ifdef AS_INSTANCED
  vAsSeed = aSeed;
#endif
`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + SAND_FRAG_DECL + SHELL_OUTER_FRAG)
      .replace('#include <map_fragment>', `#include <map_fragment>
${SAND_CLIP}
  float asChecks, asLost;
  vec3 asX;
  float asDetail = AS_SEED.w;
  float asHt = asSculpt(vAsUv, vAsLocal, AS_SEED.x, asDetail, asChecks, asLost, asX);
  float asWorn;
  vec3 asCol = asShellColor(vAsUv, AS_SEED, asChecks, asHt, asWorn);
  // grit in the colour: grain pits hold dirt, bead crests are abraded paler; sub-pixel grit greys the surface slightly
  asCol *= 1.0 + asX.x * 0.45;
  asCol *= mix(0.84, 1.05, clamp(asRibVis*0.8 + asLamVis*0.35, 0.0, 1.0));
  asCol = mix(asCol, asCol * 1.18 + 0.03, clamp(asX.y, 0.0, 1.0) * 0.35);
  asCol = mix(asCol, asCol * 0.93 + 0.03, clamp(asLost, 0.0, 1.0) * 0.25);
  float asWet = uSand.w;
  diffuseColor.rgb = asLin(asCol) * mix(1.0, 0.7, asWet);
${SAND_TINT}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  // matte calcite; pits rougher than crests; relief filtered below a pixel becomes microfacet roughness
  roughnessFactor = 0.58 + (0.4 - asHt)*0.25 + asWorn*0.15 - asX.y*0.12 - asX.x*0.3 + asLost*0.35 + asX.z*0.08;
  roughnessFactor = clamp(roughnessFactor, 0.4, 0.97);
  roughnessFactor = mix(roughnessFactor, roughnessFactor*0.8, asWet);
  roughnessFactor = mix(roughnessFactor, 0.9, asBand);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  // sculpture relief ~0.35 % of the shell length (≈0.12 mm on a 35 mm clam)
  normal = asBump(-vViewPosition, normal, asHt * 0.0045 * vAsScale * mix(0.6, 1.0, asDetail), faceDirection);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  // the water film is broken up by the grit: only the smoother patches keep a wet sheen
  material.clearcoat *= asWet * (1.0 - asBand) * (1.0 - clamp(asX.z * 0.6 + asLost * 0.5, 0.0, 0.85));`);
  };
  if (o.instanced) mat.defines = { AS_INSTANCED: '' };
  mat.customProgramCacheKey = () => 'asari-shell-out-v4' + (o.instanced ? 'i' : '');
  mat.userData.uniforms = uniforms;
  return mat;
}

// ------------------------------------------------------------------------------------------------ shell, inner

const SHELL_INNER_FRAG = /* glsl */ `
uniform vec4 uSeed;
varying vec2 vAsUv;
varying vec3 vAsLocal;
`;

export function makeShellInnerMaterial() {
  const uniforms = { uSeed: { value: new Vector4(0.37, 0.61, 1, 1) }, ...sandUniforms() };
  const mat = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.22, metalness: 0,
    ior: 1.56, specularIntensity: 0.6,
    iridescence: 0.18, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    clearcoat: 0.3, clearcoatRoughness: 0.15,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SAND_VERT_DECL + 'varying vec2 vAsUv;\nvarying vec3 vAsLocal;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + SAND_VERT + '\n  vAsUv = uv;\n  vAsLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + SAND_FRAG_DECL + SHELL_INNER_FRAG)
      .replace('#include <map_fragment>', `#include <map_fragment>
${SAND_CLIP}
  vec2 p = vAsLocal.xy;          // shell-length units, anterior +x, dorsal +y
  float s = vAsUv.y;
  float cs = uSeed.y;
  vec3 col = vec3(0.90, 0.88, 0.84) * (0.94 + 0.08*asN(p*9.0 + cs*20.0));
  // warm yellow-orange centre in some individuals
  col = mix(col, vec3(0.93, 0.80, 0.55), smoothstep(0.55, 0.1, length(p - vec2(0.0, 0.05))) * step(0.55, asH(vec2(cs, 8.8))) * 0.55);
  // posterior / marginal violet stain, very common in アサリ
  float purp = asH(vec2(cs, 3.1));
  float stain = smoothstep(0.05, -0.35, p.x + (asN(p*5.0 + cs) - 0.5)*0.25) * 0.85 + smoothstep(0.82, 0.98, s) * 0.6;
  col = mix(col, vec3(0.30, 0.17, 0.34), clamp(stain * purp * 1.3, 0.0, 0.92));
  // adductor scars: slightly glossier and tinted
  float scarA = 1.0 - smoothstep(0.8, 1.0, length((p - vec2(0.34, 0.08)) / vec2(0.075, 0.11)));
  float scarP = 1.0 - smoothstep(0.8, 1.0, length((p - vec2(-0.34, 0.07)) / vec2(0.085, 0.12)));
  float scar = max(scarA, scarP);
  col *= mix(1.0, 0.86, scar);
  // pallial line with the pallial sinus reaching in from the posterior
  float sinus = exp(-pow((p.y + 0.04) / 0.12, 2.0)) * smoothstep(0.05, -0.45, p.x);
  float f = s - 0.87 + 0.3*sinus;
  float pal = (1.0 - smoothstep(0.0, max(0.004, fwidth(f)*1.5), abs(f))) * smoothstep(0.12, -0.02, p.y + 0.05*(1.0 - sinus));
  col *= 1.0 - pal*0.18;
  // the hinge plate: worn and chalky near the umbo
  float hinge = 1.0 - smoothstep(0.06, 0.16, s);
  col = mix(col, vec3(0.80, 0.77, 0.72), hinge*0.6);
  // the broken edge of the shell: outer prismatic layer and periostracum, not porcelain
  col = mix(col, vec3(0.42, 0.35, 0.29) * (0.8 + 0.4*asN(vAsUv*vec2(300.0, 2.0))), smoothstep(0.975, 0.998, s));
  diffuseColor.rgb = asLin(col);
  float asScar = scar; float asHinge = hinge;
${SAND_TINT}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.2, 0.12, asScar) + asHinge*0.4 + asBand*0.6;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // hinge teeth: a few ridges fanning from the umbo; faint growth undulation elsewhere
    float ang = atan(vAsLocal.y - 0.35, vAsLocal.x - 0.13);
    float teeth = pow(0.5 + 0.5*cos(ang*9.0), 4.0) * asHinge;
    float und = sin(vAsUv.y*60.0 + asN(vAsUv*vec2(20.0, 6.0))*3.0) * 0.08;
    normal = asBump(-vViewPosition, normal, (teeth + und) * 0.006 * vAsScale, faceDirection);
  }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  material.iridescence *= 1.0 - asHinge;`);
  };
  mat.customProgramCacheKey = () => 'asari-shell-in-v1';
  mat.userData.uniforms = uniforms;
  return mat;
}

// ------------------------------------------------------------------------------------------------ soft tissue

/**
 * Mantle, visceral mass, foot and siphons. `kind` picks the deformation:
 *  0 static (body / mantle / ligament via aTent) — uDeform.x breathes the mantle edge
 *  1 foot   — geometry runs along +x over [0,1]; uDeform = (extension, tip swell, bend, length)
 *  2 siphon — tube along +x over [0,1]; uDeform = (length, aperture, sway y, sway z)
 * Colours: cream mantle with a brown pigmented edge, pale ivory foot, siphons translucent white grading to a
 * tan, dark-speckled tip (reference photos 067–070).
 */
const SOFT_VERT = /* glsl */ `
uniform vec4 uDeform;
uniform float uKind;
varying vec2 vAsUv;
attribute float aTent;
attribute vec3 aDir;
varying float vAsTent;
vec3 asDeform(vec3 p){
  if (uKind > 0.5 && uKind < 1.5) {
    // foot: slender while probing, the tip dilates to anchor, curls ventrally
    float t = clamp(p.x, 0.0, 1.0);
    float ext = uDeform.x;
    float L = mix(0.18, 1.0, ext) * uDeform.w;
    float thin = mix(1.25, 0.8, ext);
    float swell = 1.0 + uDeform.y * 1.4 * smoothstep(0.45, 0.95, t);
    p.yz *= thin * swell;
    p.x = t * L;
    p.y -= uDeform.z * t * t * L * 0.6;
  } else if (uKind > 1.5) {
    // siphon: telescopes, the rim and its tentacles open and close, the tip sways
    float t = clamp(p.x, 0.0, 1.0);
    float L = uDeform.x;
    float ap = mix(0.5, 1.0, uDeform.y);
    float rim = smoothstep(0.75, 1.0, t);
    p.yz *= mix(1.0, ap, rim);
    // squeezed where it passes between the valve margins (~0.12 shell lengths from its root)
    if (aTent == 0.0) p.yz *= 1.0 - 0.42*exp(-pow((t*L - 0.12) / 0.05, 2.0));
    if (aTent > 0.0) {
      // tentacles fold over the opening when closed
      float r = length(p.yz);
      float fold = (1.0 - uDeform.y) * aTent;
      p.yz *= mix(1.0, 0.35, fold);
      p.x -= fold * r * 0.4;
    }
    p.x = t * L + max(0.0, p.x - 1.0);
    p.y += uDeform.z * t * t * L;
    p.z += uDeform.w * t * t * L;
  } else {
    // mantle lips (aDir = outward in the commissure plane): drawn in when the valves close, pushed out past the
    // shell edge when the clam relaxes, swelling slightly with each breath. aDir is zero on the body and ligament.
    p += aDir * (mix(-0.02, 0.02, uDeform.y) + uDeform.x * 0.004);
    // relaxed lips also roll in toward the midline until the two sides press together and fill the gape
    p.z -= length(aDir) * uDeform.y * 0.024;
  }
  return p;
}
`;

export function makeSoftMaterial(kind) {
  const uniforms = { uDeform: { value: new Vector4(0, 0, 0, 1) }, uKind: { value: kind }, ...sandUniforms() };
  const mat = new MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.5, sheenColor: new Color(0.95, 0.8, 0.75),
    clearcoat: kind === 2 ? 0.4 : 0.7, clearcoatRoughness: kind === 2 ? 0.3 : 0.2,
    side: kind === 1 ? FrontSide : DoubleSide,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SAND_VERT_DECL + SOFT_VERT)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = asDeform(position);\n  vAsUv = uv;\n  vAsTent = aTent;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + SAND_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + SAND_FRAG_DECL + 'uniform vec4 uDeform;\nuniform float uKind;\nvarying vec2 vAsUv;\nvarying float vAsTent;')
      .replace('#include <map_fragment>', `#include <map_fragment>
${SAND_CLIP}
  vec3 col;
  float t = vAsUv.x;
  if (uKind > 1.5) {
    // cream-white translucent sheath; the last fifth tan-orange with dark brown speckles and a dark band at the rim
    float ang = vAsUv.y*6.2831853;
    col = mix(vec3(0.92, 0.88, 0.76), vec3(0.62, 0.50, 0.36), smoothstep(0.8, 0.96, t));
    col *= 0.94 + 0.06*sin(ang*9.0);    // faint longitudinal muscle lines
    float spk = smoothstep(0.5, 0.68, asFbm(vec2(t*30.0, sin(ang)*3.5 + cos(ang)*3.5))) * smoothstep(0.8, 0.95, t);
    col = mix(col, vec3(0.20, 0.15, 0.11), spk*0.85);
    col = mix(col, vec3(0.42, 0.30, 0.19), smoothstep(0.94, 0.975, t) * (1.0 - smoothstep(0.99, 1.0, t)) * 0.5);
    // tentacles: brown with darker tips (photos 043, 050)
    col = mix(col, mix(vec3(0.72, 0.58, 0.40), vec3(0.45, 0.32, 0.20), smoothstep(0.4, 1.0, vAsTent)), step(0.01, vAsTent));
    if (!gl_FrontFacing) col *= mix(0.25, 0.6, smoothstep(0.85, 1.0, t));   // inside of the tube, dark below the rim
  } else if (uKind > 0.5) {
    col = vec3(0.93, 0.88, 0.80) * (0.92 + 0.1*asN(vAsUv*vec2(14.0, 6.0)));
    col = mix(col, vec3(0.95, 0.78, 0.68), smoothstep(0.6, 1.0, t) * 0.35);
  } else {
    // mantle: cream yellow, brown pigment streaks on the outward face of the lip, papillae tipped brown
    col = vec3(0.92, 0.83, 0.60) * (0.9 + 0.15*asN(vAsUv*vec2(60.0, 8.0)));
    float outward = 0.5 + 0.5*cos(vAsUv.y*6.2831853);
    float pig = smoothstep(0.55, 0.92, outward) * smoothstep(0.45, 0.8, asFbm(vec2(vAsUv.x*70.0, vAsUv.y*3.0)));
    col = mix(col, vec3(0.40, 0.29, 0.18), pig * 0.6);
    if (vAsTent > 0.01 && vAsTent < 1.5) col = mix(vec3(0.92, 0.82, 0.60), vec3(0.50, 0.37, 0.24), smoothstep(0.55, 1.0, vAsTent) * 0.8);
    if (vAsTent > 1.5) col = vec3(0.22, 0.15, 0.09);   // external ligament
  }
  diffuseColor.rgb = asLin(col);
${SAND_TINT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uKind > 1.5 && vAsTent == 0.0) {
    // annular wrinkles of the siphon wall: crowded when contracted, smoothing out as it stretches
    float stretch = smoothstep(0.08, 0.45, uDeform.x);
    float wr = vAsUv.x * uDeform.x * mix(320.0, 150.0, stretch) + asN(vAsUv*vec2(20.0, 9.0))*2.0;
    float hw = sin(wr) * mix(1.0, 0.35, stretch) + (asN(vAsUv*vec2(60.0, 40.0)) - 0.5)*0.5;
    normal = asBump(-vViewPosition, normal, hw * 0.0018 * vAsScale, faceDirection);
  } else if (uKind > 0.5 && uKind < 1.5) {
    float hw = sin(vAsUv.x*90.0 + asN(vAsUv*vec2(12.0, 7.0))*3.0) * (1.0 - uDeform.x*0.6) + (asN(vAsUv*vec2(70.0, 30.0)) - 0.5);
    normal = asBump(-vViewPosition, normal, hw * 0.0012 * vAsScale, faceDirection);
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // thin living tissue: light scattered through it shows most at grazing angles (cheap translucency)
    float ndv = abs(dot(normal, normalize(vViewPosition)));
    float thin = uKind > 1.5 ? 0.22 : uKind > 0.5 ? 0.12 : 0.06;
    totalEmissiveRadiance += diffuseColor.rgb * (0.03 + thin * pow(1.0 - ndv, 2.0));
  }`);
  };
  mat.customProgramCacheKey = () => 'asari-soft-v4-' + kind;
  mat.userData.uniforms = uniforms;
  return mat;
}

// ------------------------------------------------------------------------------------------------ sand decal

/**
 * Contact shadow + disturbed wet sand + the two siphon holes, drawn on a small quad lying on the terrain.
 * uDecal = (disturbance 0..1, holes 0..1, hole separation, contact shadow); uHole = (x, z, angle, siphon open)
 */
export function makeDecalMaterial() {
  const uniforms = { uDecal: { value: new Vector4(0, 0, 0.1, 0.6) }, uHole: { value: new Vector4(0, 0, 0, 0) } };
  const mat = new MeshStandardMaterial({ color: 0x000000, roughness: 0.3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAsQ;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAsQ = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + 'uniform vec4 uDecal;\nuniform vec4 uHole;\nvarying vec2 vAsQ;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 q = vAsQ;                 // quad spans [-1,1]
  float r = length(q);
  float n = asFbm(q*6.0);
  float shadow = (1.0 - smoothstep(0.05, 0.55, r)) * uDecal.w;
  float disturb = (1.0 - smoothstep(0.2, 0.95, r + (n - 0.5)*0.3)) * uDecal.x;
  vec2 hq = q - uHole.xy;
  float ca = cos(uHole.z), sa = sin(uHole.z);
  hq = vec2(ca*hq.x - sa*hq.y, sa*hq.x + ca*hq.y);
  float sep = uDecal.z;
  float hr = mix(0.045, 0.075, uHole.w);
  // two openings (inhalant larger): dark throat, a fringe of pale radial tentacle streaks round each (photo 049)
  vec2 d1 = hq - vec2(sep*0.55, 0.0), d2 = hq + vec2(sep*0.45, 0.0);
  float r1 = length(d1), r2 = length(d2) / 0.8;
  float h1 = 1.0 - smoothstep(hr*0.55, hr*0.85, r1);
  float h2 = 1.0 - smoothstep(hr*0.55, hr*0.85, r2);
  float f1 = smoothstep(hr*0.7, hr*0.9, r1) * (1.0 - smoothstep(hr*1.1, hr*1.45, r1)) * smoothstep(0.2, 0.8, sin(atan(d1.y, d1.x)*13.0));
  float f2 = smoothstep(hr*0.7, hr*0.9, r2) * (1.0 - smoothstep(hr*1.05, hr*1.3, r2)) * smoothstep(0.3, 0.9, sin(atan(d2.y, d2.x)*10.0));
  float holes = max(h1, h2) * uDecal.y;
  float fringe = max(f1, f2 * 0.7) * uDecal.y * uHole.w;
  vec3 c = mix(vec3(0.05, 0.04, 0.03), vec3(0.78, 0.72, 0.62), fringe);
  diffuseColor = vec4(c, clamp(max(shadow*0.45 + disturb*0.3 + holes*0.9, fringe*0.75), 0.0, 0.92));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.9, 0.25, clamp(disturb + holes, 0.0, 1.0));');
  };
  mat.customProgramCacheKey = () => 'asari-decal-v2';
  mat.userData.uniforms = uniforms;
  return mat;
}
