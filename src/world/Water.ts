import {
  ClampToEdgeWrapping, Color, CubeTexture, DataTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, Matrix4,
  RedFormat, RGBAFormat, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderTarget, type Object3D, type PerspectiveCamera, type Scene,
  type Texture, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TONE_MAP_GLSL } from '../render/ToneMapGlsl';
import { MirrorView } from '../render/Mirror';
import type { Terrain } from './Terrain';
import { WAVES_GLSL, type WaveSet } from './Waves';
import { makeFoamTexture, SURF_GLSL, type SurfUniforms } from './Surf';
import { SURF_MEM_GLSL, type SurfMemoryUniforms } from './SurfMemory';
import type { SurfSpray } from './SurfSpray';

export interface WaterLight {
  sunUp: number;
  sunDir: Vector3;
  sunCol: Vector3;
  ambient: number;
  fogColor: Color;
  fogDensity: number;
  env: CubeTexture | null;
  /** 0 at night, 1 in full day: scales the glow of the water itself */
  day: number;
}

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoiseW(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float snoise(vec2 p) { return vnoiseW(p) * 2.0 - 1.0; }
`;

/** GLSL: the terrain's map coordinates and its smoothed height (needs tHeight, uHeightN and uHalf). */
const GROUND_GLSL = /* glsl */ `
vec2 tuv(vec2 xz) { return (xz + uHalf) / (2.0 * uHalf); }
// the bed through a cubic B-spline (four bilinear lookups): smooth in its slope too, so the surf, whose timing
// follows the depth, draws its crests without the kinks of the 25 cm grid
float groundSmooth(vec2 xz) {
  vec2 st = tuv(xz) * uHeightN - 0.5, i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0, w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uHeightN, h1 = (i + 1.5 + w3 / g1) / uHeightN;
  return g0.y * (g0.x * texture2D(tHeight, vec2(h0.x, h0.y)).r + g1.x * texture2D(tHeight, vec2(h1.x, h0.y)).r)
       + g1.y * (g0.x * texture2D(tHeight, vec2(h0.x, h1.y)).r + g1.x * texture2D(tHeight, vec2(h1.x, h1.y)).r);
}
`;

/** GLSL: the surf's surface at a point (after SURF_GLSL; needs uTime). */
const SURF_ETA_GLSL = /* glsl */ `
// the surf's surface height at a point, relative to the still level (on the beach: the swash sheet's, or the ground)
float surfEta(vec2 xz, float level) { return surfEtaAt(xz, level, uTime); }
`;

/** Texels across the surf's height field (over the whole terrain: 25 cm on 走水's 96 m). */
const SURF_FIELD_RES = 384;

/** What floats in the surf reads its surface from here: its height over the still level (R, m), redrawn every frame. */
export interface SurfField {
  texture: Texture;
  /** half the terrain's size (m): the field spans x, z in -half..half */
  half: number;
}

/**
 * Screen-space water (after the 葛西の渚 crab viewer): for every pixel, the view ray is met with the water surface,
 * which is the tide plane or, where the ground sits in a tide pool above the tide, that pool's own level. The bottom
 * image is refracted by the ripples and absorbed and scattered by the water's thickness read from the depth buffer;
 * the sky is reflected from a cube map with Fresnel; the sun glitters; the shoreline gets a bright rim and bubbles;
 * far water fades into the fog. Pools are calm (little ripple) and clearer, so their bottoms are easy to see.
 */
/** A shore's water beyond its colour and turbidity (every field optional; absent: 葛西's water). */
export interface WaterOptics {
  /** a milky body: the share of sun and sky light the suspended fines send back up (linear) */
  scatter?: readonly [number, number, number];
  /** factor on the Fresnel reflection, how broken it is (0..1), and a gain on the sky's brightness in it */
  reflect?: number; rough?: number; env?: number;
  /** the distance (m) over which the reflection rises to the physical Fresnel */
  reflNear?: readonly [number, number];
  /** a breezier surface: wave spectrum boost around `peak` (m), the footprint filter, calm damping, still shallows */
  ripple?: { peak?: number; boost?: number; aniso?: number; calmGain?: number; still?: number };
  /** an open shore's wind sea: how much rougher the deeper water is than the flat's breeze ripples (absent: 0) */
  chop?: number;
}

export class WaterPass {
  readonly uniforms;
  private readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  /** the land and sky mirrored in the sea (null: the sky cube alone) */
  private mirror: MirrorView | null = null;
  /** the water's own colour (linear) and how clear it is (1: 葛西's silty water; less is clearer) */
  private readonly tint = new Color(0.16, 0.172, 0.14);
  private clarity = 1;
  /** false while the mirror must wait (the sun's shadow map not made yet: its materials would sample nothing) */
  mirrorGate: () => boolean = () => true;
  level = 0;
  /** the surf's height over the whole terrain, for what floats in it (null: no surf on this shore) */
  private readonly surf: { target: WebGLRenderTarget; quad: FullScreenQuad; material: ShaderMaterial; half: number } | null = null;

  constructor(terrain: Terrain, waves: WaveSet, surf: SurfUniforms) {
    this.uniforms = {
      uSurf: surf.uSurf,
      uSurfDir: surf.uSurfDir,
      tSurfZone: surf.tSurfZone,
      tSurfAux: surf.tSurfAux,
      uSurfLv: surf.uSurfLv,
      uSurfGrid: surf.uSurfGrid,
      // the sand's memory of the swash (SurfMemory): what the sheet left on it; xy: the window's centre, z: its size,
      // w: 1 when there is one
      tSurfMem: { value: null as Texture | null },
      uMemBox: { value: new Vector4(0, 0, 1, 0) },
      // 0 off; 1 the zones; 2 the foams
      uSurfDebug: { value: 0 },
      // an open shore's wind sea: how much rougher the deeper water is than the flat's breeze ripples (0: not)
      uChop: { value: 0 },
      tFoam: { value: makeFoamTexture() },
      tColor: { value: null as unknown },
      tDepth: { value: null as unknown },
      uWaveA: waves.uniforms.uWaveA,
      uWaveB: waves.uniforms.uWaveB,
      uWaveGain: waves.uniforms.uWaveGain,
      tHeight: { value: terrain.heightTexture },
      uHeightN: { value: terrain.n },
      tSpill: { value: terrain.spillTexture },
      tEnv: { value: null as CubeTexture | null },
      tMirror: { value: null as unknown },
      uMirrorMat: { value: new Matrix4() },
      uMirrorOn: { value: 0 },
      uPolar: { value: 0 },
      uSurfSteps: { value: 12 },
      uProjInv: { value: new Matrix4() },
      uCamWorld: { value: new Matrix4() },
      uCamPos: { value: new Vector3() },
      uHalf: { value: terrain.half },
      uWater: { value: 0 },
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunCol: { value: new Vector3(3, 3, 3) },
      uSunUp: { value: 1 },
      uAmbient: { value: 0.7 },
      uFogColor: { value: new Color() },
      uFogDensity: { value: 0.0024 },
      // the water itself: silty, olive-green, seen wherever the view path through it is long (after MahazeViewer)
      uWaterFog: { value: new Color(0.16, 0.172, 0.14) },
      uFogW: { value: 0.8 },      // per metre of path through the open water: from above, 30 cm is nearly clear; along the surface it closes in
      uFogPool: { value: 0.35 },  // tide pools have settled and are clearer
      uRefr: { value: 0.6 },
      // how much of the sky the surface gives back: 1 = physical Fresnel; the game keeps it lower so the bottom shows,
      // and polarised sunglasses cut it further (uReflMax caps the glare at grazing angles)
      uReflK: { value: 0.55 },
      uReflMax: { value: 0.6 },
      uRes: { value: new Vector2(1, 1) },
      uEnvI: { value: 0.6 },
      // 1: drawn into the upscaler, which wants the finished picture (tone mapped and sRGB-encoded, as on the
      // screen); three does both only for the screen, so the shader does them itself, with three's exposure
      uLdrOut: { value: 0 },
      uExposure: { value: 1 },
      // the picture's last grade (World sets it with the sun: the warm cast of a sunset as a camera sees it)
      uGradeTint: { value: new Vector3(1, 1, 1) },
      // a milky body (漫湖's jade lake): the share of sun and sky light the suspended fines send back up (linear;
      // 0: none, 葛西 and 走水), the reflection's share of Fresnel (1: unchanged) and how broken it is (0: unchanged)
      uScatter: { value: new Vector3() },
      uReflScale: { value: 1 },
      uReflRough: { value: 0 },
      // a breezy opaque river (漫湖): ripples kept by the narrower footprint, calm shallows; the distance over
      // which the reflection rises to the physical Fresnel (5-20 m: clear water shows its bed up close)
      uAniso: { value: 0 },
      uCalmGain: { value: 0.22 },
      uStill: { value: 0 },
      uReflNear: { value: new Vector2(5, 20) },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      // a shore without surf (葛西, 漫湖) does without its code altogether (SURF_GLSL)
      defines: surf.uSurf.value.w > 0 ? {} : { NO_SURF: 1 },
      depthTest: false,
      depthWrite: false,
      // (the water's level at the eye, which decides whether the view is under the surf, is the same for every
      // pixel: it is found here, three times a frame, not two million times)
      vertexShader: /* glsl */ `
        uniform sampler2D tHeight;
        uniform float uHeightN, uHalf, uWater, uTime;
        uniform vec3 uCamPos;
        varying vec2 vUv;
        varying float vCamLevel;
        ${GROUND_GLSL}
        ${SURF_GLSL}
        ${SURF_ETA_GLSL}
        void main() {
          vUv = uv;
          vCamLevel = uWater + (uSurf.w > 0.0 ? surfEta(uCamPos.xz, uWater) : 0.0);
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tHeight, tSpill, tMirror, tFoam, tSurfMem;
        uniform samplerCube tEnv;
        uniform mat4 uProjInv, uCamWorld, uMirrorMat;
        uniform float uMirrorOn, uPolar, uSurfSteps, uHeightN, uSurfDebug, uChop;
        uniform vec3 uCamPos, uSunDir, uSunCol, uFogColor, uWaterFog, uScatter;
        uniform float uWater, uTime, uSunUp, uAmbient, uFogDensity, uFogW, uFogPool, uEnvI, uHalf, uRefr, uReflK, uReflMax, uReflScale, uReflRough, uAniso, uCalmGain, uStill;
        uniform vec2 uReflNear;
        uniform vec2 uRes;
        uniform float uLdrOut, uExposure;
        uniform vec3 uGradeTint;
        uniform vec4 uMemBox;
        varying vec2 vUv;
        varying float vCamLevel;
        ${TONE_MAP_GLSL}
        ${NOISE_GLSL}
        ${WAVES_GLSL}
        ${SURF_GLSL}
        // Fresnel for unpolarised light and its p-polarised part alone (what polarised glasses let through), water n = 1.333
        vec2 fresnelSP(float cosI) {
          float n = 1.333, sinT = sqrt(max(1.0 - cosI * cosI, 0.0)) / n, cosT = sqrt(max(1.0 - sinT * sinT, 0.0));
          float rs = (cosI - n * cosT) / (cosI + n * cosT), rp = (n * cosI - cosT) / (n * cosI + cosT);
          return vec2(rs * rs, rp * rp);
        }

        vec3 worldPos(vec2 uv, float d) {
          vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 v = uProjInv * c; v /= v.w;
          return (uCamWorld * v).xyz;
        }
        ${GROUND_GLSL}
        float groundAt(vec2 xz) { return texture2D(tHeight, tuv(xz)).r; }
        float spillAt(vec2 xz) { return texture2D(tSpill, tuv(xz)).r; }
        // an open shore's wind sea over the deeper water (set before waterNormal: 0 in the shallows and pools)
        float gChop = 0.0;
        // value noise with its gradient (quintic, so the slopes are smooth)
        vec3 vnoiseWD(vec2 x) {
          vec2 i = floor(x), f = fract(x);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
          float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
          float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
          return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
        }
        // the wind sea's short waves (after the reference shore's chop): four octaves from 1.6 m to 20 cm, two layers
        // each drifting their own way and turned so that the noise's grid never lines up; each octave fades out as it
        // nears the pixel's footprint. The gradient of the surface (x, z).
        vec2 windSea(vec2 p, float fp) {
          vec2 g = vec2(0.0);
          float amp = 0.05, sc = 0.62;
          for (int o = 0; o < 4; o++) {
            float fo = float(o);
            float keep = 1.0 - smoothstep(0.25, 0.6, fp * sc);
            if (keep <= 0.0) break;
            for (int l = 0; l < 2; l++) {
              float th = fo * 1.13 + float(l) * 2.1;
              mat2 R = mat2(cos(th), -sin(th), sin(th), cos(th));
              vec2 v = vec2(cos(th + 1.9), sin(th + 1.9)) * (0.35 + 0.25 * float(l)) * sqrt(0.62 / sc);
              vec3 n = vnoiseWD(R * p * sc + v * uTime * sc + fo * 17.3 + float(l) * 5.1);
              g += amp * sc * (n.yz * R) * keep;
            }
            sc *= 1.9; amp *= 0.55;
          }
          return g;
        }
        // the surface slope from the wave set (random directions and speeds, nothing periodic), band-limited to the
        // pixel footprint so distant water does not shimmer; gusts roughen the surface in drifting patches; pools are calm
        vec3 waterNormal(vec2 p, float dist, float calm) {
          // (uAniso: the footprint's geometric mean rather than its sum, which keeps the short chop alive at a distance)
          float fp = mix(max(length(fwidth(p)), dist * 0.0015), max(sqrt(length(dFdx(p)) * length(dFdy(p))), dist * 0.0008), uAniso);
          float gust = 0.65 + 0.7 * smoothstep(-0.4, 0.6, snoise(p * 0.08 + uTime * vec2(0.03, 0.02)));
          float gain = gust * mix(1.0, uCalmGain, calm) * (1.0 + 0.5 * gChop);
          vec3 g = waveGrad(p, uTime, fp * 4.0) * gain;
          if (gChop > 0.0) g.yz += windSea(p, fp) * gChop * gust;
          return normalize(vec3(-g.y, 1.0, -g.z));
        }
        // Henyey-Greenstein phase function: the silt scatters the sun forward
        float hgPhase(float cosT, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5)); }
        // what the water column itself radiates along a view direction: the silt's olive glow, brighter looking up
        // toward the lit surface, with the sun's forward-scattered halo
        vec3 waterGlow(vec3 d) {
          float mu = dot(d, uSunDir);
          // a milky body is lit like a matte surface just under the water: it follows the sun and the sky (dims at dusk)
          vec3 lit = uScatter * (uSunCol * uSunUp * (0.25 + 0.75 * max(uSunDir.y, 0.0)) + uAmbient * uFogColor);
          return (uWaterFog + lit) * (0.75 + 0.35 * smoothstep(-0.6, 0.8, -d.y)) + uSunCol * 0.035 * hgPhase(mu, 0.72) * uSunUp;
        }

        ${SURF_ETA_GLSL}
        ${SURF_MEM_GLSL}

        // ---- sun glitter. The small waves' facets, each tilted at random about the surface's own slope (the
        // unresolved slopes' spread, Cox & Munk's σ), flash wherever one turns the sun into the eye. The facets are
        // cells sized to the pixel's footprint, two sizes blended, so the sparks carry on to the horizon thinning into
        // the sun's broad path; each cell's facet is drawn anew a few times a second and eased across, so they twinkle.
        float glintCells(vec2 p, vec2 need, float sig, float tol, float cs, float seed) {
          vec2 q = p / cs;
          vec2 c = floor(q);
          vec2 o = fract(q) - 0.5 - (vec2(hash12(c + seed), hash12(c + seed + 9.1)) - 0.5) * 0.5;
          float spot = smoothstep(0.42, 0.1, length(o));
          float tt = uTime * (3.0 + 3.0 * hash12(c + seed + 3.3)) + hash12(c + seed + 7.7) * 10.0;
          float k = floor(tt), fk = fract(tt);
          // two draws of the facet's slope (Box-Muller), eased one into the next
          vec2 u1 = vec2(hash12(c + k * 1.31 + seed), hash12(c + k * 2.17 + seed + 4.2));
          vec2 u2 = vec2(hash12(c + (k + 1.0) * 1.31 + seed), hash12(c + (k + 1.0) * 2.17 + seed + 4.2));
          vec2 m1 = sqrt(-2.0 * log(max(u1.x, 1e-4))) * vec2(cos(6.2831853 * u1.y), sin(6.2831853 * u1.y));
          vec2 m2 = sqrt(-2.0 * log(max(u2.x, 1e-4))) * vec2(cos(6.2831853 * u2.y), sin(6.2831853 * u2.y));
          vec2 m = mix(m1, m2, smoothstep(0.3, 0.7, fk)) * sig;
          float d = length(m - need);
          return spot * smoothstep(tol, tol * 0.25, d);
        }
        float glitter(vec2 p, vec3 N, vec3 rd, float fp, float sig) {
          vec3 H = normalize(uSunDir - rd);
          if (H.y <= 0.05 || uSunUp <= 0.0) return 0.0;
          // the micro-slope a facet needs, against the surface's own normal
          vec2 need = -H.xz / H.y + N.xz / max(N.y, 0.2);
          float lr = log2(max(fp * 1.6, 0.004) / 0.004), l0 = floor(lr), fl = lr - l0;
          float cs0 = 0.004 * exp2(l0), cs1 = cs0 * 2.0;
          vec2 drift = uTime * vec2(0.21, 0.13);
          float tol = 0.03 + 0.012 * sig / 0.1;
          float g = mix(glintCells(p + drift, need, sig, tol, cs0, 0.0), glintCells(p + drift, need, sig, tol, cs1, 17.0), fl);
          return g;
        }
        // foam threads (after the reference shore's lace): the contour lines of a warped noise, thicker the more foam
        // there is; dense foam closes into a sheet with holes of uneven size
        float fbmW(vec2 p) { return 0.5 * vnoiseW(p) + 0.3 * vnoiseW(p * 2.03 + 1.7) + 0.2 * vnoiseW(p * 4.01 + 5.3); }
        // (fp: the pattern's footprint, pattern units per pixel: past half a cell the lace averages to its cover)
        float foamLace(vec2 q, float cov, float fp) {
          vec2 w = q + 0.7 * vec2(fbmW(q * 0.45 + 1.3), fbmW(q * 0.45 + 8.1)) - 0.35;
          float r = 1.0 - abs(2.0 * fbmW(w * 1.6 + 5.0) - 1.0);
          float r2 = 1.0 - abs(2.0 * vnoiseW(w * 3.3 + 11.0) - 1.0);
          float wd = 0.03 + 0.14 * cov, wd2 = 0.025 + 0.08 * cov;
          float thread = max(smoothstep(1.0 - wd, 1.0 - wd * 0.5, r), 0.75 * smoothstep(1.0 - wd2, 1.0 - wd2 * 0.5, r2));
          // only dense foam closes into a sheet (with holes of uneven size)
          float th = 0.8 - 0.32 * cov;
          float sheet = smoothstep(th - 0.012, th + 0.025, fbmW(w * 1.15 + 2.0) + 0.08 * (vnoiseW(w * 9.0) - 0.5));
          // threads break more where the foam is thin
          float brk = smoothstep(0.62 - 0.5 * cov, 0.8 - 0.5 * cov, vnoiseW(w * 2.2 + 7.0));
          float lace = max(sheet, thread * mix(0.15, 1.0, brk));
          return mix(lace, cov * 0.6, smoothstep(0.25, 0.8, fp)) * smoothstep(0.02, 0.1, cov);
        }

        void main() {
          vec2 uv = vUv;
          float d = texture2D(tDepth, uv).r;
          vec3 base = texture2D(tColor, uv).rgb;
          // SkyDome does not write depth: only the cleared far-plane value is sky. A 0.9995 cutoff
          // incorrectly hides distant vegetation/shore objects (about 100 m with the game's near plane).
          bool sky = d >= 1.0;
          vec3 P = worldPos(uv, sky ? 0.9995 : d);
          vec3 rd = normalize(P - uCamPos);
          float sceneDist = sky ? 1e5 : length(P - uCamPos);
          vec3 col = base;

          // the water level here: the tide, or the pool's own level when the ground sits in a tide pool above the tide
          float level = uWater, calm = 0.0;
          if (!sky) {
            float sp = spillAt(P.xz);
            if (sp > uWater + 0.01 && sp > P.y + 0.003) { level = sp; calm = 1.0; }
          }

          // the surf (an open shore only): the surface rises and falls with the waves, which break near the shore and
          // run up the beach as the swash sheet, so whether a point of the bed is under water is decided by the surface there
          bool surfOn = uSurf.w > 0.0 && calm < 0.5;
          float surface = level;
          if (surfOn && !sky) surface += surfEta(P.xz, level);
          // is the camera itself under the water (watching a fish down among the eelgrass)? (the level at the eye
          // comes from the vertex stage)
          float camLevel = vCamLevel;
          bool underCam = uCamPos.y < camLevel - 0.003;

          // Near the viewer the waves stand up from the plane: the view ray is traced through the band of heights the
          // waves can take (12–16 steps, closer together near the eye, and a few secant refinements), so a crest hides
          // the water behind it and its face is seen as a face. Within ~35 m; beyond, the plane with the waves' normals.
          float t = -1.0;
          bool traced = false;
          if (surfOn && uSurfSteps > 0.5 && rd.y < -1e-5 && !underCam) {
            float top = level + 2.2 * uSurf.x + 0.12, bot = level - 1.5 * uSurf.x;
            float t0 = max((top - uCamPos.y) / rd.y, 0.0), tb = (bot - uCamPos.y) / rd.y;
            float t1 = min(tb, sceneDist), tEnd = min(t1, 35.0);
            vec3 q0 = uCamPos + rd * t0;
            if (t0 < tEnd) {
              traced = tEnd >= t1 - 1e-3;   // (the whole band seen within reach: the trace has the last word)
              // one loop with a run-time bound and a single call of the surface (so the driver neither unrolls it nor
              // inlines the surf dozens of times): march until the ray goes under, then refine the bracket by the
              // secant method. The steps grow with the distance (the near water is the one looked at).
              float lo = t0, flo = q0.y - level - surfEta(q0.xz, level), hi = -1.0, fhi = 0.0;
              if (flo <= 0.0) t = t0;
              else {
                int steps = int(uSurfSteps), refined = 0;
                for (int i = 1; i <= steps + 4; i++) {
                  float a = float(i) / uSurfSteps;
                  float tt = hi < 0.0 ? t0 + (tEnd - t0) * a * (0.35 + 0.65 * a) : lo + (hi - lo) * flo / (flo - fhi);
                  if (hi < 0.0 && i > steps) break;
                  vec3 qq = uCamPos + rd * tt;
                  float ff = qq.y - level - surfEta(qq.xz, level);
                  if (hi >= 0.0) refined++;
                  if (ff <= 0.0) { hi = tt; fhi = ff; } else { lo = tt; flo = ff; }
                  if (refined >= 4) break;
                }
                if (hi >= 0.0) t = lo + (hi - lo) * flo / (flo - fhi);
                // (a sliver of water thinner than a step, missed: the bottom of the band is surely under it)
                if (t < 0.0 && traced && tb < sceneDist) t = tb;
              }
            }
          }
          if (t < 0.0 && !traced && uCamPos.y > surface && rd.y < -1e-5) {
            float tp = (surface - uCamPos.y) / rd.y;
            if (tp < sceneDist) t = tp;
          }

          if (underCam) {
            // the view runs through the water itself: everything fades into the water's glow over the path, and the
            // surface seen from below is the sky inside Snell's window and the water mirrored outside it
            float tUp = rd.y > 1e-4 ? (camLevel - uCamPos.y) / rd.y : 1e5;
            float path = min(sceneDist, tUp);
            vec3 glow = waterGlow(rd);
            vec3 seen = base;
            if (tUp < sceneDist) {
              vec3 S = uCamPos + rd * tUp;
              vec3 N = waterNormal(S.xz, tUp, calm);
              vec3 rr = refract(rd, -N, 1.333);
              float win = dot(rr, rr) > 0.0 ? smoothstep(0.0, 0.25, rr.y) : 0.0;
              vec3 skyC = min(textureCube(tEnv, rr).rgb * uEnvI, vec3(8.0));
              seen = mix(glow * 1.15, mix(skyC, base, 0.3) * 0.8, win);
            }
            col = mix(glow, seen, exp(-path * uFogW));
          } else if (t >= 0.0) {
            {
              vec3 S = uCamPos + rd * t;
              // the surf here: its slope added to the ripples', its foam, its swash
              // (a tide pool's calm water has no surf: a level far below the ground short-cuts the surf to nothing)
              Surf sf = surfEval(S.xz, surfOn ? level : -1e3, uTime, surfOn);
              float Ds = surfOn ? sf.D : 1e3;
              gChop = surfOn ? uChop * smoothstep(0.5, 3.0, Ds) : 0.0;
              // (uStill: water only centimetres deep over the mud lies mirror-calm, as the sheets on a flat do)
              float still = uStill > 0.0 ? uStill * (1.0 - smoothstep(0.02, 0.15, surface - groundSmooth(S.xz))) : 0.0;
              vec3 N = waterNormal(S.xz, t, max(calm, still));
              vec2 sy = surfFrame(S.xz);
              float sheetK = 0.0;   // 1 on a thin swash sheet
              if (surfOn) {
                // (near the viewer the slope is measured on the surface itself, so wandering crests and the swash's
                // edge are lit as they lie; further off, the waves' own gradient, fading into the far sea's ripples)
                vec2 surfGrad;
                if (uSurfSteps > 0.5 && t < 35.0) {
                  float h = 0.05 + 0.002 * t;
                  surfGrad = vec2(surfEta(S.xz + vec2(h, 0.0), level) - sf.eta, surfEta(S.xz + vec2(0.0, h), level) - sf.eta) / h;
                } else surfGrad = sf.grad * (1.0 - smoothstep(80.0, 260.0, t));
                // the swash sheet is rippled by its own flow: streaks along the slope moving with it (drawn on the
                // sheet's own parcels, Surf.swDx: they ride the water and draw out behind the front, never faster; some
                // three times as long as they are wide two seconds in), and fine wrinkles
                sheetK = sf.sw * (1.0 - smoothstep(0.004, 0.05, sf.film)) * step(1e-4, sf.film);
                if (sf.sw > 0.01 && sf.film > 0.0) {
                  vec2 fq = vec2(sy.y * 3.4, sf.swDx / pow((sf.swAge + 0.3) / 0.6, 0.6667) * 2.9) + vec2(sf.n * 3.1, 0.0);
                  fq += 0.8 * vec2(fbmW(S.xz * 1.3), fbmW(S.xz * 1.3 + 3.0));
                  float e = 0.06, f0 = fbmW(fq), fx = fbmW(fq + vec2(e, 0.0)), fz = fbmW(fq + vec2(0.0, e));
                  vec2 gS = vec2((fz - f0) / e * 1.3, (fx - f0) / e * 3.4);   // (d/ds, d/dy)
                  vec2 gW = gS.x * uSurfDir.xy + gS.y * vec2(-uSurfDir.y, uSurfDir.x);
                  surfGrad += gW * 0.045 * sf.sw * (0.4 + 0.6 * smoothstep(0.0, 0.8, abs(sf.flow)));
                }
                vec2 grad = -N.xz / N.y * mix(1.0, 0.35, sheetK) + surfGrad;
                N = normalize(vec3(-grad.x, 1.0, -grad.y));
              }
              float lip = sf.lip, face = sf.face * (1.0 - smoothstep(25.0, 50.0, t));

              // refraction: the bottom's image wobbles in proportion to the water's thickness (things above the surface are left alone)
              float thick0 = min(sceneDist - t, 30.0);
              vec2 off = N.xz * uRefr * min(thick0, 0.5) / max(t, 1.0);
              off *= smoothstep(0.0, 0.02, thick0);
              vec2 uv2 = uv + off;
              float d2 = texture2D(tDepth, uv2).r;
              bool sky2 = d2 >= 1.0;
              vec3 P2 = worldPos(uv2, sky2 ? 0.9995 : d2);
              if (P2.y > surface + 0.02 || any(lessThan(uv2, vec2(0.0))) || any(greaterThan(uv2, vec2(1.0)))) { uv2 = uv; P2 = P; sky2 = sky; }
              vec3 refr = texture2D(tColor, uv2).rgb;
              float thick = sky2 ? 1e4 : max(length(P2 - uCamPos) - t, 0.0);

              // turbidity: the bottom fades into the water over the length of the view path through it (a few tens of
              // centimetres on 葛西's silty flat, more in the bay mouth); tide pools have settled and stay clearer
              float fogW = mix(uFogW, uFogPool, calm);
              // the surf stirs the sand up: the breaking water is murkier, its colour going sandy-green
              float murk = surfOn ? sf.murk : 0.0;
              fogW *= 1.0 + 2.5 * murk;
              vec3 glow = waterGlow(rd) * mix(vec3(1.0), vec3(1.3, 1.15, 0.7), murk * 0.7);
              // (a steep front shades the water behind it from the sky: the face reads darker than the trough before it)
              vec3 under = mix(glow, refr, exp(-thick * fogW)) * mix(1.0, 0.55, face);

              // the sky, reflected (the sun's disc is handled by the glitter below) and weighted by Fresnel
              // (a rough reflection, for a ruffled milky lake: exaggerated slopes break the mirror up)
              vec3 Nr = N;
              if (uReflRough > 0.0) { float k = 1.0 + 3.0 * uReflRough; Nr = normalize(vec3(N.x * k, N.y, N.z * k)); }
              vec3 R = reflect(rd, Nr);
              R.y = max(abs(R.y), 0.06);   // never sample the dome's dark underside at the horizon
              vec3 envSky;
              if (uMirrorOn > 0.5) {
                // the mirror: the land, the town and the sky as the reflected eye sees them, looked up a few hundred
                // metres along the rippled reflection (where the hills are), so the ripples bend and smear it; a
                // short vertical smear stands in for the many small facets between the pixels
                vec4 mc = uMirrorMat * vec4(S + R * 300.0, 1.0);
                vec2 muv = clamp(mc.xy / mc.w, vec2(0.002), vec2(0.998));
                float smear = (0.0015 + 0.004 * clamp(length(N.xz) * 6.0, 0.0, 1.0)) * (1.0 + 4.0 * uReflRough);
                float side = 0.0007 * (1.0 + 2.0 * uReflRough);
                envSky = texture2D(tMirror, muv).rgb * 0.5
                  + texture2D(tMirror, clamp(muv + vec2(side, smear), vec2(0.002), vec2(0.998))).rgb * 0.25
                  + texture2D(tMirror, clamp(muv - vec2(side, smear), vec2(0.002), vec2(0.998))).rgb * 0.25;
              } else envSky = textureCube(tEnv, R).rgb;
              vec3 env = min(envSky * uEnvI, vec3(12.0));
              float cosT = clamp(dot(-rd, N), 0.0, 1.0);
              float F = min((0.02 + 0.98 * pow(1.0 - cosT, 5.0)) * uReflK, uReflMax);
              // further out (where nothing is looked for under the surface) the sea is the mirror it really is: the
              // full Fresnel reflectance, or with the glasses on the p-polarised part they pass, which still climbs
              // steeply toward grazing; so is a thin swash sheet, a mirror laid on the sand
              vec2 sp = fresnelSP(max(cosT, 0.02));
              float Fphys = mix(0.5 * (sp.x + sp.y), sp.y + 0.12 * sp.x, uPolar);
              F = mix(F, max(F, Fphys * 0.92), max(smoothstep(uReflNear.x, uReflNear.y, t), sheetK * 0.6));

              // sun glitter: to the horizon, in the sun's path; denser on rough water, finer on the swash sheet
              float fpx = max(length(fwidth(S.xz)), t * 0.0008);
              float gust = 0.7 + 0.6 * smoothstep(-0.4, 0.6, snoise(S.xz * 0.08 + uTime * vec2(0.03, 0.02)));
              float sig = mix(mix(0.09 + 0.05 * min(gChop, 1.5), 0.06, sheetK) * gust, 0.035, calm);
              float glint = glitter(S.xz, N, rd, fpx, sig);
              // and the broad sheen of the sun's path beneath the sparks (the facets too small to resolve)
              vec3 Hsun = normalize(uSunDir - rd);
              float nh = max(dot(N, Hsun), 0.0);
              float sheen = exp(-(1.0 - nh * nh) / max(nh * nh, 1e-3) / (2.0 * sig * sig)) / (sig * sig * 40.0);
              vec2 spS = fresnelSP(max(dot(uSunDir, Hsun), 0.02));
              float Fs = mix(0.5 * (spS.x + spS.y), spS.y + 0.12 * spS.x, uPolar);
              vec3 spec = uSunCol * uSunUp * Fs * (glint * 380.0 + sheen * 0.35) * (1.0 - smoothstep(0.05, 0.4, sf.roller + sf.crest));

              // (the sun's glitter keeps the full Fresnel: a milky lake still sparkles)
              col = mix(under, env, F * uReflScale) + spec;
              // the light through the thin top of a steepening wave: bottle green, brightest with the sun behind it
              float back = pow(max(dot(rd, uSunDir), 0.0), 2.0);
              vec3 skyL = env * 0.35 + uAmbient * uFogColor * 0.6;
              col += vec3(0.05, 0.2, 0.15) * (uSunCol * uSunUp * (0.25 + 0.9 * back) + skyL) * lip * 0.55 * (1.0 - F);
              // and the face itself, lit through from above: greener and brighter toward its top
              col = mix(col, col * vec3(0.8, 1.06, 1.0) + vec3(0.004, 0.022, 0.018) * uSunUp, face * 0.6);

              // the shoreline: a bright rim where the water is a few millimetres deep, and small bubbles
              float vdepth = surface - P.y;
              // (only where the ground itself meets the water: a blade floating just under the surface is not a shoreline)
              float onBed = 1.0 - smoothstep(0.015, 0.04, P.y - groundAt(P.xz));
              // (on an open shore the swash draws the edge itself: the rim stays a near-field touch)
              float nearOnly = 1.0 - uSurf.w * smoothstep(4.0, 12.0, t);
              float rim = smoothstep(0.0, 0.004, vdepth) * (1.0 - smoothstep(0.004, 0.03, vdepth)) * onBed * nearOnly;
              #ifdef WATER_LITE
              col += env * rim * 0.03;
              #else
              rim *= smoothstep(-0.2, 0.5, snoise(S.xz * 3.0 + uTime * 0.1));
              col += env * rim * 0.05;
              float bub = smoothstep(0.86, 0.97, snoise(S.xz * 14.0 + uTime * vec2(0.05, 0.03))) * (1.0 - smoothstep(0.0, 0.06, vdepth)) * smoothstep(0.0, 0.004, vdepth) * onBed * (1.0 - uSurf.w);
              col = mix(col, vec3(0.85) * (0.4 + 0.6 * uSunUp) * uAmbient, bub * 0.55 * (1.0 - calm * 0.6) * nearOnly);
              // flecks floating on the surface, near the viewer
              float speck = smoothstep(0.93, 0.99, snoise(S.xz * 9.0 + uTime * vec2(0.04, 0.025))) * smoothstep(0.02, 0.2, vdepth) * (1.0 - smoothstep(4.0, 14.0, t));
              col = mix(col, vec3(0.75, 0.72, 0.62) * uAmbient, speck * 0.25);
              #endif

              // the swash sheet's edge: a thin bright meniscus where the climbing (or draining) sheet meets the sand
              if (surfOn && sf.sw > 0.01) {
                float men = smoothstep(0.0, 0.0012, vdepth) * (1.0 - smoothstep(0.0015, 0.006, vdepth)) * onBed * (1.0 - smoothstep(6.0, 25.0, t));
                col += (vec3(dot(env, vec3(0.33))) * 0.1 + uSunCol * uSunUp * 0.03) * men * (0.4 + 0.6 * sf.swUp);
              }
              // a sheet only a millimetre or two thick hardly shows but for its shine: its edge dissolves into the wet sand
              if (uSurf.w > 0.0 && Ds < 0.02) col = mix(base, col, smoothstep(0.0, 0.0018, vdepth));

              // the surf's foam, four kinds: the whitecap on a crest tipping over (streaks along the crest), the bore's
              // roller (dense, bright, lumpy), the lace it leaves on the water (thinning and drifting in as it ages), and
              // the swash's (a band at the climbing front, a turbulent line where it runs into the last backwash,
              // streaks drawn down the slope by the backwash, bubbles left on the sand)
              if (surfOn) {
                vec2 sea = uSurfDir.xy, along = vec2(-sea.y, sea.x);
                float wn = sf.n;
                float far = smoothstep(8.0, 30.0, t), farther = smoothstep(40.0, 120.0, t);
                // the lace drifts shoreward with the bore (about 0.4 m/s) and is laid anew by each wave
                vec2 drift = -sea * min(sf.age, 6.0) * 0.4;
                vec2 fuv = (S.xz - drift) * 0.85 + vec2(wn * 0.37, wn * 0.61) + N.xz * 0.05;
                #ifdef WATER_LITE
                vec3 L1 = texture2D(tFoam, fuv).rgb;
                vec3 L2 = L1.gbr;
                float voro = max(L1.r, L1.b * 0.8);
                float patches = 0.5;
                #else
                vec2 fw = (vec2(vnoiseW(S.xz * 1.6 + wn * 1.7), vnoiseW(S.xz * 1.6 + vec2(7.3, -wn))) - 0.5) * 0.18;
                vec3 L1 = texture2D(tFoam, fuv + fw).rgb;
                vec3 L2 = texture2D(tFoam, mat2(0.8, 0.6, -0.6, 0.8) * (fuv + fw) * 2.13 + vec2(0.4, -uTime * 0.01)).rgb;
                float voro = max(max(L1.r, L2.g * 0.9), L1.b * 0.8);
                float patches = smoothstep(0.25, 0.7, vnoiseW(S.xz * 0.7 + vec2(wn * 3.1, uTime * 0.1)));
                #endif
                // 1. the whitecap: white tearing over the top and running down the front in streaks along the crest
                vec2 cq = vec2(dot(S.xz, along) * 0.7, dot(S.xz, sea) * 3.6) + wn * 1.3;
                float streak = fbmW(cq + vec2(0.0, uTime * 0.7)) * 0.7 + voro * 0.45;
                float fCrest = smoothstep(0.25, 0.5, sf.crest * 0.85 + (streak - 0.5) * 0.6) * mix(1.0, 0.75, far);
                // 2. the roller: lumps of foam tumbling forward with the bore (two octaves moving with it), sharp-edged and
                // nearly solid where it is thick, ragged where it thins
                vec2 rq = vec2(dot(S.xz, along) * 3.2, dot(S.xz, sea) * 3.2 + uTime * 1.6) + wn * 3.0;
                float lump = fbmW(rq) * 0.5 + fbmW(rq * 2.3 + 5.0) * 0.3 + vnoiseW(rq * 7.0 - uTime) * 0.2;
                float fRoll = smoothstep(0.3, 0.55, sf.roller * 0.95 + (lump - 0.5) * mix(0.75, 0.3, far)) * mix(0.9 + 0.1 * voro, 0.95, far);
                // 3. the lace left behind: the cell walls and the threads, thinning as it ages
                float cov = sf.trail * exp(-sf.age / 3.5) * mix(0.6, 1.25, patches);
                float fTrail = 0.0;
                #ifdef WATER_LITE
                fTrail = clamp(cov * 1.4 - (1.0 - voro) * 0.9, 0.0, 1.0);
                #else
                if (cov > 0.01) {
                  // a network of foam cells of uneven size (the lace's Voronoi walls at two scales, warped and broken),
                  // its walls thicker the more foam there is; rafts of dense foam where the bore left most, full of bubbles;
                  // and a few of the long threads between (the contours of a warped noise, thin)
                  float cv = min(cov, 0.9);
                  float walls = max(L1.r, L2.g * 0.85);
                  float net = smoothstep(1.0 - 0.6 * cv, 1.0 - 0.38 * cv, walls) * smoothstep(0.3, 0.65, vnoiseW((S.xz - drift) * 2.3 + wn * 3.0) + 0.4 * cv);
                  // (rafts only where the foam is thick, a fifth of it at most, ragged and full of bubbles)
                  float rn = fbmW((S.xz - drift) * 1.1 + wn * 1.9) + 0.12 * (vnoiseW((S.xz - drift) * 6.0) - 0.5);
                  float raft = smoothstep(0.8 - 0.2 * cv, 0.86 - 0.2 * cv, rn) * (0.55 + 0.45 * L1.b) * smoothstep(0.35, 0.8, cv);
                  float threads = foamLace((S.xz - drift) * 3.2 + wn * 7.0, cv * 0.45, fpx * 3.2 * 2.6) * 0.7;
                  fTrail = max(max(net, raft), threads) * smoothstep(0.0, 0.1, cov);
                }
                #endif
                fTrail = mix(fTrail, cov * 0.55, farther);
                // 4. the swash: the front band (thick climbing, thin lace draining), the collision line, the backwash's
                // streaks (the lace drawn down the slope and stretched as the flow below it runs faster: a parcel's
                // distance behind the front grows as t^(2/3), so the lace is drawn on that distance over t^(2/3) and
                // rides the sheet) and what the sand keeps (SurfMemory)
                float fSwash = 0.0;
                if (sf.sw > 0.01) {
                  float band = sf.front * mix(0.45, 1.0, sf.swUp) * smoothstep(0.0, 0.0015, vdepth) * onBed;
                  float stretch = pow((sf.swAge + 0.3) / 0.6, 0.6667);
                  vec2 bq = vec2(dot(S.xz, along) * 7.0, sf.swDx * 7.0 / stretch) + wn * 5.0;
                  float lace = foamLace(bq, 0.25 + 0.45 * band, fpx * 7.0 * 2.6);
                  float mem = 0.0;
                  if (uMemBox.w > 0.0) {
                    vec2 muv = (S.xz - uMemBox.xy) / uMemBox.z + 0.5;
                    float mw = surfMemWeight(muv);
                    if (mw > 0.0) mem = texture2D(tSurfMem, muv).b * mw;
                  }
                  // the backwash's streaks: what the sheet still carries, drawn out down the slope
                  float carried = (1.0 - sf.swUp) * exp(-sf.swAge / 3.0) * 0.55 * smoothstep(0.0005, 0.004, sf.film);
                  fSwash = max(band * mix(0.75, 1.0, lace), max(carried, mem) * lace);
                  fSwash = max(fSwash, sf.collide * (0.6 + 0.4 * lace));
                  fSwash *= sf.sw * (1.0 - smoothstep(10.0, 40.0, t));
                }
                float fm = clamp(max(max(fCrest, fRoll), max(fTrail, fSwash)), 0.0, 1.0) * (1.0 - smoothstep(90.0, 220.0, t));
                // foam is a bright, rough body: lit by the sun on its own lumpy slope and by the sky; the roller's lumps
                // shade themselves, thin lace lets the water through and reads a little grey
                vec3 nf = vec3(vnoiseW(S.xz * 7.0 + uTime * 0.6) - 0.5, 0.0, vnoiseW(S.xz * 7.0 + 4.3 - uTime * 0.5) - 0.5);
                vec3 Nf = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.35) + nf * 0.9 * (fRoll + fCrest) * (1.0 - far));
                float sunF = max(dot(Nf, uSunDir), 0.0);
                // (its light from the same sky the water reflects, so foam is always brighter than the water about it:
                // a white body lit by the whole sky and the sun, against a few tens of percent of the sky mirrored)
                vec3 skyE = (textureCube(tEnv, vec3(0.0, 1.0, 0.0)).rgb * 0.45 + textureCube(tEnv, normalize(vec3(-rd.x, 0.35, -rd.z))).rgb * 0.55) * uEnvI;
                vec3 foamCol = 0.92 * (uSunCol * uSunUp * (0.15 + 0.85 * sunF) * 0.34 + min(skyE, vec3(6.0)) * 1.05 + uAmbient * vec3(0.12, 0.13, 0.14));
                // (backlit, the thin foam glows a little: light through the bubbles)
                foamCol += uSunCol * uSunUp * back * 0.06 * (1.0 - fRoll);
                float dense = smoothstep(0.25, 0.95, fm);
                // the roller's lumps shade one another: darker in the creases
                foamCol *= mix(0.8, 1.0, dense) * (0.93 + 0.07 * max(L2.g, L2.b)) * mix(1.0, 0.72 + 0.4 * lump, fRoll * (1.0 - far));
                col = mix(col, foamCol, clamp(fm, 0.0, 0.96));
                // bubbles mixed into the water about the foam: a milky haze that softens its edges
                col = mix(col, foamCol * vec3(0.8, 0.92, 0.95), 0.1 * clamp(sf.roller + sf.trail * 0.6, 0.0, 1.0) * (1.0 - fm));
                if (uSurfDebug > 0.5) {
                  // the debug views: 1 the zones (deep blue, shallow cyan, breaker orange, swash yellow), 2 the foams
                  // (crest red, roller white, lace green, swash blue)
                  if (uSurfDebug < 1.5) {
                    float Hd = uSurf.x, L0 = 1.5613 * uSurf.y * uSurf.y, b = clamp(surfZoneAt(S.xz).w, 0.01, 0.2);
                    float R2 = 1.1 * (0.35 * b * sqrt(Hd * L0) + 0.5 * sqrt(Hd * L0 * (0.563 * b * b + 0.004)));
                    float gam = clamp(1.56 / (1.0 + exp(-19.5 * b)) - 43.8 * (1.0 - exp(-19.0 * b)) * Hd / (9.81 * uSurf.y * uSurf.y), 0.6, 1.3);
                    float DbM = pow(1.4 * Hd * pow(max(uSurfLv.w, 0.3), 0.25) / gam, 0.8);
                    vec3 zc = Ds < -R2 ? vec3(0.5, 0.4, 0.3) : Ds < 0.25 * DbM ? vec3(1.0, 0.9, 0.2) : Ds < 1.15 * DbM ? vec3(1.0, 0.45, 0.1) : Ds < L0 * 0.5 ? vec3(0.2, 0.8, 0.9) : vec3(0.1, 0.2, 0.8);
                    col = mix(col, zc * (0.4 + 0.6 * uSunUp), 0.55);
                  } else if (uSurfDebug < 2.5) col = vec3(fCrest, max(fRoll, fTrail * 0.3), fSwash) + vec3(fRoll * 0.7, fRoll * 0.4 + fTrail * 0.6, fRoll * 0.7);
                  // 3: the phase since the crest (red), how far broken (green), the swash's depth (blue, ×20)
                  else if (uSurfDebug < 3.5) col = vec3(fract(sf.age / uSurf.y), sf.brk, sf.film * 20.0) * (sf.sw > 0.5 ? vec3(0.3, 0.3, 1.0) : vec3(1.0));
                  // 4: the zone itself: arrival time (red, fractional seconds), ground (green, per 10 cm), slope (blue ×10)
                  else { vec4 zz = surfZoneAt(S.xz); col = vec3(fract(mix(zz.y, zz.z, surfLvMix(level))), fract(zz.x * 10.0), zz.w * 10.0); }
                }
              }

              // far water fades into the haze
              float fogF = 1.0 - exp(-pow(uFogDensity * t, 2.0));
              col = mix(col, uFogColor, fogF);
            }
          }
          // 5: (debug) the still depth by the zone at every pixel, water or not: blue wet, red dry, white the waterline
          if (uSurfDebug > 4.5 && !sky) { float Dd = level - surfZoneAt(P.xz).x; col = Dd > 0.0 ? vec3(0.0, 0.2, 1.0) * (0.3 + fract(Dd * 5.0)) : vec3(1.0, 0.1, 0.0) * (0.3 + fract(-Dd * 5.0)); col = mix(col, vec3(4.0), 1.0 - smoothstep(0.0, 0.01, abs(Dd))); }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          if (uLdrOut > 0.5) gl_FragColor.rgb = higataToneMap(gl_FragColor.rgb, uExposure);
          {
            // a light grade (warm highlights, cool shadows) and a soft vignette, as in the viewer
            vec3 c = gl_FragColor.rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(c * vec3(0.97, 1.0, 1.03), c * vec3(1.03, 1.0, 0.95), smoothstep(0.2, 0.8, l));
            vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
            c *= mix(0.84, 1.0, smoothstep(1.15, 0.3, length(q)));
            c *= uGradeTint;
            gl_FragColor.rgb = c;
          }
          #include <colorspace_fragment>
          if (uLdrOut > 0.5) gl_FragColor.rgb = srgbEncode(gl_FragColor.rgb);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
    if (surf.uSurf.value.w > 0) {
      // the surf's height field: the same surface the water pass draws, 25 cm apart, for the eelgrass afloat in it
      const u = this.uniforms;
      const material = new ShaderMaterial({
        uniforms: { tHeight: u.tHeight, uHeightN: u.uHeightN, uHalf: u.uHalf, uWater: u.uWater, uTime: u.uTime, uSurf: u.uSurf, uSurfDir: u.uSurfDir, tSurfZone: u.tSurfZone, tSurfAux: u.tSurfAux, uSurfLv: u.uSurfLv, uSurfGrid: u.uSurfGrid },
        depthTest: false,
        depthWrite: false,
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tHeight;
          uniform float uHeightN, uHalf, uWater, uTime;
          varying vec2 vUv;
          ${GROUND_GLSL}
          ${SURF_GLSL}
          ${SURF_ETA_GLSL}
          void main() { gl_FragColor = vec4(surfEta((vUv * 2.0 - 1.0) * uHalf, uWater), 0.0, 0.0, 1.0); }`,
      });
      const target = new WebGLRenderTarget(SURF_FIELD_RES, SURF_FIELD_RES, {
        type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false,
      });
      this.surf = { target, quad: new FullScreenQuad(material), material, half: terrain.half };
    }
  }

  /** The surf's height over the still level, redrawn every frame by prepare (null: a sheltered flat). */
  get surfField(): SurfField | null {
    return this.surf ? { texture: this.surf.target.texture, half: this.surf.half } : null;
  }

  /**
   * Polarised sunglasses: the surface gives back far less sky and the bottom reads clearer; off, the game's normal
   * (already softened) reflection.
   */
  setPolarized(on: boolean): void {
    this.uniforms.uPolar.value = on ? 1 : 0;
    this.uniforms.uReflK.value = on ? 0.22 : 0.55;
    this.uniforms.uReflMax.value = on ? 0.3 : 0.6;
    this.polarized = on;
    this.uniforms.uFogW.value = (on ? 0.6 : 0.8) * this.clarity;
    this.uniforms.uEnvI.value = (on ? 0.5 : 0.6) * this.envGain;
  }

  /** The sea's mirror of the land and sky at `scale` of the screen's resolution (0: off, the sky cube alone). */
  setMirror(scale: number): void {
    if (scale <= 0) { this.mirror?.dispose(); this.mirror = null; this.uniforms.uMirrorOn.value = 0; return; }
    if (this.mirror) this.mirror.scale = scale;
    else this.mirror = new MirrorView(scale);
  }

  private polarized = false;
  /** this shore's gain on the sky's reflection (1: 葛西's) */
  private envGain = 1;

  /** The water of this shore: its colour seen in depth (linear) and its turbidity against 葛西's silty water; optionally
   * a milky body (scatter, linear), a weaker (reflect, factor on Fresnel) and broken (rough, 0..1) reflection. */
  setBody(r: number, g: number, b: number, turbidity: number, optics: WaterOptics = {}): void {
    this.uniforms.uChop.value = optics.chop ?? 0;
    this.tint.setRGB(r, g, b);
    this.clarity = turbidity;
    const sc = optics.scatter ?? [0, 0, 0];
    this.uniforms.uScatter.value.set(sc[0], sc[1], sc[2]);
    this.uniforms.uReflScale.value = optics.reflect ?? 1;
    this.uniforms.uReflRough.value = optics.rough ?? 0;
    this.envGain = optics.env ?? 1;
    const rn = optics.reflNear ?? [5, 20];
    this.uniforms.uReflNear.value.set(rn[0], rn[1]);
    this.uniforms.uAniso.value = optics.ripple?.aniso ?? 0;
    this.uniforms.uCalmGain.value = optics.ripple?.calmGain ?? 0.22;
    this.uniforms.uStill.value = optics.ripple?.still ?? 0;
    this.setPolarized(this.polarized);
  }

  /** The full-screen quad the water is drawn with, to compile its shader ahead of the first frame (the same mesh,
   * so the same program variant). */
  compileTarget(): Object3D {
    return (this.quad as unknown as { _mesh: Object3D })._mesh;
  }

  /** More of the surf's programs to compile ahead (the sand's memory, the spray), each with the target it draws into. */
  readonly extraCompile: { mesh: Object3D; target: WebGLRenderTarget | null }[] = [];

  /** The surf field's quad and the target it is drawn into, to compile ahead too (null: no surf). */
  surfCompileTarget(): { mesh: Object3D; target: WebGLRenderTarget } | null {
    return this.surf ? { mesh: (this.surf.quad as unknown as { _mesh: Object3D })._mesh, target: this.surf.target } : null;
  }

  /** The lighter composite (超軽量): every other wave component, one unwarped foam lookup, no noise rim, bubbles or
   * flecks. The program is rebuilt on a change (a few hundred milliseconds, once). */
  setLite(on: boolean): void {
    const d = this.material.defines as Record<string, number | string>;
    if (('WATER_LITE' in d) === on) return;
    if (on) { d.WATER_LITE = 1; d.WAVE_STRIDE = 2; d.WAVE_AMP = '1.4'; }
    else { delete d.WATER_LITE; delete d.WAVE_STRIDE; delete d.WAVE_AMP; }
    this.material.needsUpdate = true;
  }

  /** What the sand remembers of the swash (SurfMemory), for the foam on the thin sheets (null: none). */
  setMemory(mem: SurfMemoryUniforms | null): void {
    this.memory = mem;
    if (!mem) this.uniforms.uMemBox.value.w = 0;
  }

  private memory: SurfMemoryUniforms | null = null;

  /** The spray drawn over the water after its composite (null: none). */
  setSpray(spray: SurfSpray | null): void {
    this.spray = spray;
  }

  private spray: SurfSpray | null = null;

  /** Debug views of the surf: 0 off, 1 the zones (deep, shallow, breaker, swash, land), 2 the four foams. */
  setSurfDebug(mode: number): void {
    this.uniforms.uSurfDebug.value = mode;
  }

  /** Steps of the trace that stands the surf up from the plane near the viewer (0: the surf on the flat plane). */
  setSurfSteps(n: number): void {
    this.uniforms.uSurfSteps.value = Math.max(0, Math.min(16, Math.round(n)));
  }

  /** Render what the water reflects (before the scene itself, every frame the water is drawn). */
  prepare(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    if (this.surf) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(this.surf.target);
      this.surf.quad.render(gl);
      gl.setRenderTarget(prev);
    }
    const m = this.mirror, u = this.uniforms;
    if (!m || !this.mirrorGate()) { u.uMirrorOn.value = 0; return; }
    m.render(gl, scene, camera, this.level);
    u.uMirrorOn.value = m.valid ? 1 : 0;
    u.tMirror.value = m.target.texture;
    u.uMirrorMat.value.copy(m.textureMatrix);
  }

  setLevel(y: number): void {
    this.level = y;
    this.uniforms.uWater.value = y;
  }

  update(dt: number, light: WaterLight): void {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uSunUp.value = light.sunUp;
    u.uSunDir.value.copy(light.sunDir);
    u.uSunCol.value.copy(light.sunCol);
    u.uAmbient.value = light.ambient;
    u.uFogColor.value.copy(light.fogColor);
    u.uFogDensity.value = light.fogDensity;
    u.tEnv.value = light.env;
    u.uWaterFog.value.copy(this.tint).multiplyScalar(0.06 + 0.94 * light.day);
  }

  /**
   * Composite the water over a rendered frame (colour + depth) into `output` (null = the screen). `ldr`: the output is
   * the upscaler's, which takes the finished picture (tone mapped and sRGB-encoded as the screen would get it).
   */
  render(gl: WebGLRenderer, input: WebGLRenderTarget, output: WebGLRenderTarget | null, camera: PerspectiveCamera, ldr = false): void {
    const u = this.uniforms;
    u.uLdrOut.value = ldr && output ? 1 : 0;
    u.uExposure.value = gl.toneMappingExposure;
    if (this.memory) { u.tSurfMem.value = this.memory.tSurfMem.value; u.uMemBox.value.copy(this.memory.uMemBox.value); }
    u.tColor.value = input.texture;
    u.tDepth.value = input.depthTexture;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uRes.value.set(input.width, input.height);
    gl.setRenderTarget(output);
    this.quad.render(gl);
    this.spray?.render(gl, camera, input.depthTexture, input.width, input.height, u.uLdrOut.value > 0.5);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
    this.mirror?.dispose();
    if (this.surf) { this.surf.target.dispose(); this.surf.quad.dispose(); this.surf.material.dispose(); }
    (this.uniforms.tFoam.value as DataTexture).dispose();
  }
}

/** Spill-level texture (R, metres) for the terrain and water shaders. */
export function makeSpillTexture(spill: Float32Array, n: number): DataTexture {
  const t = new DataTexture(spill, n, n, RedFormat, FloatType);
  // a pool's level is one number; between a pool cell and a dry one the blend would dive to the dry sentinel, so
  // the level is read unfiltered and the shoreline comes from the ground alone (exact under the pits' fine patches)
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
