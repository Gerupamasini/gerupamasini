import {
  Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial, MeshStandardMaterial, RGBAFormat, SRGBColorSpace,
  Vector3, Vector4, type IUniform, type Material, type WebGLProgramParametersWithUniforms,
} from 'three';
import { MORPH } from './morphology';

/**
 * The skin of the アカエイ. One physical material per individual draws the disc, the tail and the skin parts of the
 * spiracles and mouth; its colour is computed in the shader from the bind-pose plan coordinates each vertex carries
 * (aPlan = x, z, side, |u| on the disc; s, angle, 2 on the tail), so it is exact at any size and shared by every LOD.
 *
 * Back [PHOTO 001–006, 014, 015, 030, 056]: olive grey-brown, darker over the trunk, a soft mottle, the faint lines of the
 * pectoral radials, a thin yellow line along the margin, yellow-orange skin round the eyes and spiracles.
 * Belly [PHOTO 045–052, 055]: white to cream in the middle, the margin yellow-orange to brown — narrow at the front,
 * wide behind, the boundary smoothly rounded [LIT] — the colour that gives the ray its name.
 * Tail [PHOTO 007, 012, 014]: dark above, a yellow-orange band low on the sides, pale below, the whip blackish.
 *
 * Wet skin: a mucus film as a clear coat over a fairly smooth, slightly velvety skin (sheen), patchy in roughness; the
 * thin margins pass light (backlit they glow orange [PHOTO 047–052]). Sand: uSand dusts the back from the middle out
 * until only the eyes and spiracles show [PHOTO 009–011, 037]; uSandTail does the same for the tail.
 */

export interface SkinLook {
  /** multiplies the dorsal ground colour (individual variation) */
  tint: Color;
  /** 0..1: a darker, browner animal or a paler, greyer one */
  dark: number;
  /** noise offset so no two backs mottle alike */
  seed: number;
}

export interface SkinUniforms {
  uAkTint: IUniform<Color>;
  uAkLook: IUniform<Vector4>;
  uAkSand: IUniform<Vector4>;
  uAkSandCol: IUniform<Color>;
  uAkTime: IUniform<number>;
}

const COMMON = /* glsl */ `
uniform vec3 uAkTint;
uniform vec4 uAkLook;   // x dark, y seed, z detail (0 far … 1 near), w unused
uniform vec4 uAkSand;   // x back cover 0..1, y tail cover, z settled grain, w margin cover
uniform vec3 uAkSandCol;
uniform float uAkTime;
varying vec4 vAkPlan;
float akH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float akN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(akH(i), akH(i + vec2(1, 0)), f.x), mix(akH(i + vec2(0, 1)), akH(i + vec2(1, 1)), f.x), f.y); }
float akF(vec2 p) { return 0.5 * akN(p) + 0.27 * akN(p * 2.07 + 5.3) + 0.15 * akN(p * 4.3 + 1.1) + 0.08 * akN(p * 8.9 + 7.7); }
vec3 akLin(vec3 c) { return pow(c, vec3(2.2)); }
float akSmin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
`;

const VERT_PARS = /* glsl */ `
attribute vec4 aPlan;
varying vec4 vAkPlan;
`;

const FRAG_PARS = /* glsl */ `
${COMMON}
// three's bump perturbation (bumpmap_pars_fragment), here for the procedural height
vec3 akPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

/** the colour, roughness, mucus and relief of the skin at a plan point; evaluated once per fragment */
const SKIN_FN = /* glsl */ `
const vec2 AK_EYE = vec2(${MORPH.eye.x.toFixed(4)}, ${MORPH.eye.z.toFixed(4)});
const vec2 AK_SPI = vec2(${MORPH.spiracle.x.toFixed(4)}, ${MORPH.spiracle.z.toFixed(4)});
float akSeg(vec2 p, vec2 a, vec2 b, float w) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return 1.0 - smoothstep(w * 0.4, w, length(pa - ba * h)); }
float akSlits(vec2 q) {
  float s = 0.0;
  // the mouth: a gently arched transverse slit; the nostrils; the five gill slits
  s = max(s, akSeg(q, vec2(0.0, ${(MORPH.mouth.z + MORPH.mouth.arch).toFixed(4)}), vec2(${MORPH.mouth.halfW.toFixed(4)}, ${MORPH.mouth.z.toFixed(4)}), 0.0035));
  s = max(s, 0.7 * akSeg(q, vec2(${(MORPH.nostril.x - 0.008).toFixed(4)}, ${(MORPH.nostril.z - MORPH.nostril.len * 0.45).toFixed(4)}), vec2(${(MORPH.nostril.x + 0.01).toFixed(4)}, ${(MORPH.nostril.z + MORPH.nostril.len * 0.45).toFixed(4)}), 0.003));
${MORPH.gills.map((g) => `  s = max(s, 0.8 * akSeg(q, vec2(${(g.x - g.len * 0.5 * Math.cos(g.ang)).toFixed(4)}, ${(g.z + g.len * 0.5 * Math.sin(g.ang)).toFixed(4)}), vec2(${(g.x + g.len * 0.5 * Math.cos(g.ang)).toFixed(4)}, ${(g.z - g.len * 0.5 * Math.sin(g.ang)).toFixed(4)}), 0.0028));`).join('\n')}
  return s;
}
struct AkSkin { vec3 col; float rough; float coat; float height; float sand; float thin; };
AkSkin akSkin(vec4 P) {
  AkSkin k;
  float side = P.z;
  float seed = uAkLook.y;
  float det = uAkLook.z;
  k.thin = 0.0;
  if (side > 1.5) {
    // ---------------------------------------------------------------- tail
    float s = P.x, th = P.y;
    float up = sin(th);                         // 1 on top, -1 underneath
    float sideBand = smoothstep(-0.75, -0.35, up) * (1.0 - smoothstep(-0.05, 0.3, up));
    vec3 back = akLin(vec3(0.27, 0.245, 0.2)) * uAkTint;
    vec3 band = akLin(vec3(0.74, 0.55, 0.24));
    vec3 belly = akLin(vec3(0.8, 0.7, 0.48));
    vec3 c = mix(belly, back, smoothstep(-0.2, 0.35, up));
    c = mix(c, band, sideBand * (1.0 - smoothstep(0.3, 0.7, s)) * 0.85);
    // darker toward the whip, almost black at the tip
    c = mix(c, akLin(vec3(0.1, 0.09, 0.08)), smoothstep(0.32, 0.9, s) * (0.55 + 0.35 * smoothstep(-0.5, 0.5, up)));
    float n = akF(vec2(s * 90.0 + seed * 13.0, th * 3.0));
    c *= 0.85 + 0.3 * n;
    k.col = c;
    k.rough = 0.42 + 0.12 * n;
    k.coat = 0.8;
    k.height = akN(vec2(s * 420.0, th * 9.0)) * 0.6 + 0.4 * sin(s * 900.0) * smoothstep(0.35, 0.6, s);
    k.sand = uAkSand.y * smoothstep(0.1, 1.0, up + 0.6) * smoothstep(0.35, 0.65, akF(vec2(s * 60.0, th * 2.0) + seed));
    return k;
  }
  vec2 p = P.xy;                                // plan: x across (left +), y along (snout +)
  float ax = abs(p.x);
  float hw = max(P.w, 1e-4);                    // the outline's half-width at this station
  float u = clamp(ax / hw, 0.0, 1.0);           // 0 on the midline … 1 at the margin
  float mott = akF(p * 9.0 + seed * 7.1);
  float fine = akF(p * 48.0 + seed * 3.3);
  // the pectoral radials run out from the trunk, sweeping back toward the rear corners
  float rayCoord = p.y - 0.32 * ax + 0.12 * ax * ax;
  float rays = 0.5 + 0.5 * sin(rayCoord * 330.0 + mott * 3.0);
  float finZone = smoothstep(0.32, 0.55, u);
  if (side > -0.5) {
    // ---------------------------------------------------------------- back
    vec3 ground = mix(akLin(vec3(0.3, 0.285, 0.235)), akLin(vec3(0.25, 0.215, 0.165)), uAkLook.x) * uAkTint;
    vec3 trunk = ground * vec3(0.72, 0.74, 0.76);
    float trunkM = 1.0 - smoothstep(0.08, 0.2, ax / max(0.3, 1.0 - 0.6 * smoothstep(0.2, 0.45, p.y)));
    vec3 c = mix(ground * vec3(1.06, 1.04, 1.0), trunk, trunkM * 0.8);
    // lighter, greyer toward the margins, with the soft mottle and the radials
    c *= mix(1.0, 1.12, finZone);
    c *= 0.72 + 0.5 * mott;
    c *= 1.0 + 0.05 * (rays - 0.5) * finZone * det;
    c *= 0.94 + 0.12 * fine;
    // orange-yellow skin round the eyes and spiracles [PHOTO 005, 011, 027, 056]
    vec2 e = vec2(ax, p.y);
    float eyeHalo = exp(-dot((e - AK_EYE) / vec2(0.03, 0.028), (e - AK_EYE) / vec2(0.03, 0.028)));
    float spiHalo = exp(-dot((e - AK_SPI) / vec2(0.034, 0.045), (e - AK_SPI) / vec2(0.034, 0.045)));
    // a yellowish rim round the eye and the spiracle, not a wash [PHOTO 005, 006, 011]
    float halo = clamp(eyeHalo + spiHalo, 0.0, 1.0);
    halo = smoothstep(0.35, 0.75, halo) * (1.0 - smoothstep(0.85, 1.0, halo)) * (0.55 + 0.45 * akN(p * 70.0));
    c = mix(c, akLin(vec3(0.6, 0.47, 0.22)), halo * 0.55);
    // a thin yellow line along the margin
    float line = smoothstep(0.986, 0.998, u);
    c = mix(c, akLin(vec3(0.7, 0.56, 0.28)), line * 0.8);
    k.col = c;
    k.rough = 0.36 + 0.16 * akF(p * 14.0 + 3.0 + seed) - 0.05 * trunkM;
    k.coat = 0.75 + 0.25 * akN(p * 22.0 + seed);
    float pores = akN(p * 520.0 + seed * 11.0);
    float wrinkle = akN(vec2(p.x * 900.0, p.y * 260.0) + seed) * smoothstep(0.25, 0.6, u);
    k.height = 0.55 * fine + 0.45 * pores * det + 0.35 * rays * finZone * det + 0.25 * wrinkle * det - 0.4 * mott;
  } else {
    // ---------------------------------------------------------------- belly
    // distance in from the margin (DW) and the margin band: narrow at the front, wide behind, smoothly rounded
    float inD = hw - ax;
    float bandW = mix(0.035, 0.13, smoothstep(0.35, -0.3, p.y)) * (0.85 + 0.3 * akF(p * 6.0 + seed));
    float band = (1.0 - smoothstep(bandW * 0.55, bandW * 1.45, inD)) * (0.82 + 0.18 * smoothstep(bandW * 0.6, 0.0, inD));
    vec3 cream = akLin(vec3(0.9, 0.87, 0.81));
    vec3 orange = mix(akLin(vec3(0.85, 0.6, 0.27)), akLin(vec3(0.66, 0.42, 0.2)), uAkLook.x * 0.7 + 0.3 * mott);
    vec3 c = mix(cream, orange, band);
    // a speckled boundary and a little pink about the jaws and gills
    c = mix(c, orange * 0.9, smoothstep(0.62, 0.8, fine) * smoothstep(bandW * 2.0, bandW, inD) * 0.5);
    float jaws = exp(-dot(vec2(p.x / 0.11, (p.y - 0.17) / 0.14), vec2(p.x / 0.11, (p.y - 0.17) / 0.14)));
    c = mix(c, akLin(vec3(0.86, 0.72, 0.68)), jaws * 0.35);
    c *= 0.95 + 0.08 * fine;
    // the mouth, nostrils and gill slits drawn into the skin too: they still read where the relief is not drawn
    c *= 1.0 - 0.55 * akSlits(vec2(ax, p.y));
    k.col = c;
    k.rough = 0.34 + 0.12 * akF(p * 16.0 + seed);
    k.coat = 0.85;
    k.height = 0.5 * fine + 0.3 * akN(p * 500.0) * det;
    k.thin = band;
  }
  // margins are thin: they pass light
  k.thin = max(k.thin * 0.5, smoothstep(0.5, 0.95, u));
  // sand on the back: settles first on the trunk and the hollows, last near the eyes, which always stay clear
  float cover = uAkSand.x;
  vec2 e2 = vec2(ax, p.y);
  float clear = min(length((e2 - AK_EYE) / vec2(0.035, 0.032)), length((e2 - AK_SPI) / vec2(0.033, 0.045)));
  float patchN = akF(p * 11.0 + seed * 5.0 + 17.0);
  float grow = cover * 1.25 - 0.25 + (1.0 - u) * 0.18 - patchN * 0.3 + smoothstep(0.88, 1.0, u) * uAkSand.w;
  float grains = akN(p * 700.0 + seed);
  float coat = smoothstep(0.0, 0.18, grow);
  k.sand = (side > -0.5) ? clamp(coat * smoothstep(0.55 - 0.6 * coat, 0.75 - 0.6 * coat, grains + 0.35 * coat), 0.0, 1.0) * smoothstep(0.75, 1.35, clear) : 0.0;
  return k;
}
`;

/** a skin material for one individual (cheap = LOD2: standard material, no coat, no relief) */
export function makeSkinMaterial(look: SkinLook, cheap: boolean, shared?: SkinUniforms): MeshPhysicalMaterial | MeshStandardMaterial {
  const uniforms: SkinUniforms = shared ?? {
    uAkTint: { value: look.tint.clone() },
    uAkLook: { value: new Vector4(look.dark, look.seed, cheap ? 0 : 1, 0) },
    uAkSand: { value: new Vector4(0, 0, 0, 0) },
    uAkSandCol: { value: new Color(0.25, 0.25, 0.24) },
    uAkTime: { value: 0 },
  };
  const mat = cheap
    ? new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 })
    : new MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.4, metalness: 0,
      clearcoat: 0.7, clearcoatRoughness: 0.16, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new Color(0.55, 0.6, 0.62),
      specularIntensity: 0.55,
    });
  mat.name = cheap ? 'AkaeiSkinLod2' : 'AkaeiSkin';
  mat.userData.akaei = uniforms;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAkPlan = aPlan;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${SKIN_FN}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        AkSkin akS = akSkin(vAkPlan);
        float akSandG = akF(vAkPlan.xy * 260.0 + 3.0);
        vec3 akSandC = uAkSandCol * (0.78 + 0.44 * akSandG) * mix(1.0, 0.82, uAkSand.z);
        diffuseColor.rgb *= mix(akS.col, akSandC, akS.sand);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(akS.rough, 0.92, akS.sand);`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        {
          float akHt = akS.height * 0.0006 * (1.0 - akS.sand) + akS.sand * akSandG * 0.0009;
          vec2 akDh = vec2(dFdx(akHt), dFdy(akHt)) * uAkLook.z;
          // fade the relief where it would alias
          akDh *= 1.0 - smoothstep(0.3, 1.0, length(fwidth(vAkPlan.xy)) * 220.0);
          normal = akPerturb(-vViewPosition, normal, akDh, faceDirection);
        }`)
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          // light through the thin margins: from behind, the fins glow warm [PHOTO 047–052]
          vec3 akTrans = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.85, 0.7), step(0.0, vAkPlan.z)) * akS.thin * (1.0 - akS.sand) * 0.3;
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
            float back = max(0.0, dot(-geometryNormal, directionalLights[i].direction));
            reflectedLight.directDiffuse += diffuseColor.rgb * akTrans * directionalLights[i].color * back;
          }
        }
        #endif`);
    if (!cheap) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', /* glsl */ `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
        material.clearcoat *= akS.coat * (1.0 - akS.sand);
        #endif
        #ifdef USE_SHEEN
        material.sheenColor *= 1.0 - akS.sand;
        #endif`);
    }
  };
  mat.customProgramCacheKey = () => (cheap ? 'akaei-skin-lod2' : 'akaei-skin');
  return mat;
}

export function skinUniforms(mat: Material): SkinUniforms {
  return mat.userData.akaei as SkinUniforms;
}

// ------------------------------------------------------------------ eyes

let eyeTex: DataTexture | null = null;
/**
 * The eye seen from above: a dark pupil under a lobed flap (the operculum that shades a ray's pupil), a bronze-olive iris
 * with fine radial streaks, darkening into the orbit. uv.y runs from the cornea's apex (0) toward the orbit (1).
 */
export function eyeTexture(): DataTexture {
  if (eyeTex) return eyeTex;
  const W = 128, H = 64, d = new Uint8Array(W * H * 4);
  const lin = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // SphereGeometry's uv.y is 1 at the pole (the cornea's apex)
    const v = 1 - y / (H - 1), a = (x / W) * Math.PI * 2;
    // pupil: wider across, cut from above by the operculum's lobes
    const lobes = 0.06 * Math.max(0, Math.cos(a - Math.PI / 2)) * (0.6 + 0.4 * Math.cos(a * 5));
    const pupilR = 0.3 - lobes;
    const streak = 0.85 + 0.15 * Math.sin(a * 41 + Math.sin(a * 7) * 2);
    let r: number, g: number, b: number;
    if (v < pupilR + 0.06) { r = 0.02; g = 0.025; b = 0.03; }
    else if (v < 0.62) {
      const t = (v - pupilR) / (0.62 - pupilR);
      const base = [0.15, 0.12, 0.055];
      const k = (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * streak;
      r = base[0] * k; g = base[1] * k; b = base[2] * k;
      if (t < 0.12) { r *= 0.5; g *= 0.5; b *= 0.5; }
    } else {
      const t = (v - 0.62) / 0.38;
      r = 0.2 * (1 - t) + 0.1 * t; g = 0.17 * (1 - t) + 0.08 * t; b = 0.12 * (1 - t) + 0.06 * t;
    }
    const i = (y * W + x) * 4;
    d[i] = lin(Math.pow(r, 1 / 2.2)); d[i + 1] = lin(Math.pow(g, 1 / 2.2)); d[i + 2] = lin(Math.pow(b, 1 / 2.2)); d[i + 3] = 255;
  }
  eyeTex = new DataTexture(d, W, H, RGBAFormat);
  eyeTex.colorSpace = SRGBColorSpace;
  eyeTex.magFilter = LinearFilter;
  eyeTex.minFilter = LinearMipmapLinearFilter;
  eyeTex.generateMipmaps = true;
  eyeTex.needsUpdate = true;
  return eyeTex;
}

export function makeEyeMaterial(cheap: boolean): Material {
  if (cheap) return new MeshStandardMaterial({ map: eyeTexture(), roughness: 0.25 });
  const m = new MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.38, specularIntensity: 0.5, envMapIntensity: 0.5 });
  m.name = 'AkaeiEye';
  return m;
}

/** the dark inside of the spiracles, the mouth and the gill slits (vertex colours carry the depth shading) */
export function makeInteriorMaterial(): Material {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  m.name = 'AkaeiInterior';
  return m;
}

/** the sting: dentine, smooth and hard, under a thin wet film; the sheath at its base is skin */
export function makeStingMaterial(cheap: boolean): Material {
  const m = cheap
    ? new MeshStandardMaterial({ vertexColors: true, roughness: 0.35 })
    : new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.08, specularIntensity: 0.7 });
  m.name = 'AkaeiSting';
  return m;
}

/** sediment colours under the water, close to the flat's own (Terrain SUBSTRATE_COLORS, wet) */
export const SAND_COLOURS: Record<string, Vector3> = {
  sand: new Vector3(0.26, 0.255, 0.24),
  muddy_sand: new Vector3(0.2, 0.195, 0.18),
  mud: new Vector3(0.16, 0.15, 0.135),
};
