import {
  ClampToEdgeWrapping, Color, CubeTexture, DataTexture, FloatType, HalfFloatType, LinearFilter, NearestFilter, LinearMipmapLinearFilter, Matrix4,
  RedFormat, RepeatWrapping, RGBAFormat, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, type Object3D, type PerspectiveCamera, type Scene,
  type Texture, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MirrorView } from '../render/Mirror';
import type { Terrain } from './Terrain';
import { WAVES_GLSL, type WaveSet } from './Waves';
import { makeFoamTexture, SURF_GLSL, type SurfUniforms } from './Surf';

/** Tiling wave-slope map from a small random spectrum (two-sided, so it tiles), with mipmaps against far shimmer. */
export function makeWaveNormal(S = 256): DataTexture {
  let a = 3 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const waves: { kx: number; ky: number; a: number; ph: number }[] = [];
  for (let k = 0; k < 40; k++) {
    const kx = Math.round((rnd() - 0.5) * 16), ky = Math.round((rnd() - 0.5) * 16);
    if (kx === 0 && ky === 0) continue;
    const kl = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(kl, 1.4), ph: rnd() * 6.28 });
  }
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dy = 0;
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    for (const w of waves) {
      const c = Math.cos(w.kx * u + w.ky * v + w.ph) * w.a;
      dx += c * w.kx; dy += c * w.ky;
    }
    dx *= 0.12; dy *= 0.12;
    const i = (y * S + x) * 4;
    data[i] = Math.max(0, Math.min(255, (dx * 0.5 + 0.5) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (dy * 0.5 + 0.5) * 255));
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const t = new DataTexture(data, S, S, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

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

/** GLSL: the surf's surface at a point (after GROUND_GLSL and SURF_GLSL; needs uTime). */
const SURF_ETA_GLSL = /* glsl */ `
// the surf's surface height at a point, relative to the still level (0 beyond the surf, where the sea is the plane)
float surfEta(vec2 xz, float level) {
  float D = level - groundSmooth(xz);
  if (D > 1.4) return 0.0;
  return surfAt(xz, D, uTime, uSurf.z).x * (1.0 - smoothstep(0.8, 1.4, D));
}
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
      // a milky body (漫湖's jade lake): the share of sun and sky light the suspended fines send back up (linear;
      // 0: none, 葛西 and 走水), the reflection's share of Fresnel (1: unchanged) and how broken it is (0: unchanged)
      uScatter: { value: new Vector3() },
      uReflScale: { value: 1 },
      uReflRough: { value: 0 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tHeight, tSpill, tMirror, tFoam;
        uniform samplerCube tEnv;
        uniform mat4 uProjInv, uCamWorld, uMirrorMat;
        uniform float uMirrorOn, uPolar, uSurfSteps, uHeightN;
        uniform vec3 uCamPos, uSunDir, uSunCol, uFogColor, uWaterFog, uScatter;
        uniform float uWater, uTime, uSunUp, uAmbient, uFogDensity, uFogW, uFogPool, uEnvI, uHalf, uRefr, uReflK, uReflMax, uReflScale, uReflRough;
        uniform vec2 uRes;
        varying vec2 vUv;
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
        // the surface slope from the wave set (random directions and speeds, nothing periodic), band-limited to the
        // pixel footprint so distant water does not shimmer; gusts roughen the surface in drifting patches; pools are calm
        vec3 waterNormal(vec2 p, float dist, float calm) {
          float fp = max(length(fwidth(p)), dist * 0.0015);
          float gust = 0.65 + 0.7 * smoothstep(-0.4, 0.6, snoise(p * 0.08 + uTime * vec2(0.03, 0.02)));
          float gain = gust * mix(1.0, 0.22, calm);
          vec3 g = waveGrad(p, uTime, fp * 4.0) * gain;
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

          // the surf (an open shore only): near the waterline the surface rises and falls with the waves and runs up
          // the beach as the swash sheet, so whether a point of the bed is under water is decided by the surface there
          bool surfOn = uSurf.w > 0.0 && calm < 0.5;
          float surface = level;
          if (surfOn && !sky) surface += surfEta(P.xz, level);
          // is the camera itself under the water (watching a fish down among the eelgrass)?
          float camLevel = uWater + (uSurf.w > 0.0 ? surfEta(uCamPos.xz, uWater) : 0.0);
          bool underCam = uCamPos.y < camLevel - 0.003;

          // Near the viewer the surf stands up from the plane: the view ray is traced through the band of heights the
          // waves can take (12–16 steps and a few secant refinements), so a crest hides the water behind it and its
          // face is seen as a face. Only where that band lies in the surf and within ~35 m; beyond, the plane.
          float t = -1.0;
          bool traced = false;
          if (surfOn && uSurfSteps > 0.5 && rd.y < -1e-5 && !underCam) {
            float top = level + 2.2 * uSurf.x, bot = level - 1.5 * uSurf.x;
            float t0 = max((top - uCamPos.y) / rd.y, 0.0), tb = (bot - uCamPos.y) / rd.y;
            float t1 = min(tb, sceneDist), tEnd = min(t1, 35.0);
            vec3 q0 = uCamPos + rd * t0, q1 = uCamPos + rd * tEnd;
            if (t0 < tEnd && min(level - groundAt(q0.xz), level - groundAt(q1.xz)) < 1.4) {
              traced = tEnd >= t1 - 1e-3;   // (the whole band seen within reach: the trace has the last word)
              // one loop with a run-time bound and a single call of the surface (so the driver neither unrolls it nor
              // inlines the surf dozens of times): march in even steps until the ray goes under, then refine the bracket
              // by the secant method
              float lo = t0, flo = q0.y - level - surfEta(q0.xz, level), hi = -1.0, fhi = 0.0;
              if (flo <= 0.0) t = t0;
              else {
                int steps = int(uSurfSteps), refined = 0;
                float dt = (tEnd - t0) / uSurfSteps;
                for (int i = 1; i <= steps + 4; i++) {
                  float tt = hi < 0.0 ? t0 + dt * float(i) : lo + (hi - lo) * flo / (flo - fhi);
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
              vec3 N = waterNormal(S.xz, t, calm);
              // the waves of the surf tilt the surface (their slope added to the ripples'), and the broken ones foam
              float foam = 0.0, lip = 0.0, Ds = 1e3, waveN = 0.0, face = 0.0;
              if (surfOn) {
                float g0 = groundSmooth(S.xz), gx = groundSmooth(S.xz + vec2(0.7, 0.0)), gz = groundSmooth(S.xz + vec2(0.0, 0.7));
                vec2 gg = vec2(gx - g0, gz - g0) / 0.7;
                float bs = max(length(gg), 0.005);
                Ds = level - g0;
                vec4 sf = surfAt(S.xz, Ds, uTime, bs);
                waveN = gSurfN;
                // (the surface's gradient: the ripples' plus the surf's; the normal leans against it. Near the viewer the
                // surf's is measured on the surface itself, so wandering crests and the chop over them are lit as they
                // lie; further off, the main waves' slope along the seaward direction and the chop's)
                vec2 surfGrad;
                if (uSurfSteps > 0.5 && t < 35.0) {
                  float e0 = Ds > 1.4 ? 0.0 : sf.x * (1.0 - smoothstep(0.8, 1.4, Ds));   // (= surfEta here)
                  surfGrad = vec2(surfEta(S.xz + vec2(0.08, 0.0), level) - e0, surfEta(S.xz + vec2(0.0, 0.08), level) - e0) / 0.08;
                } else surfGrad = (-gg / bs * sf.z + gSurfCrossGrad) * (1.0 - smoothstep(40.0, 120.0, t));
                vec2 grad = -N.xz / N.y + surfGrad;
                N = normalize(vec3(-grad.x, 1.0, -grad.y));
                foam = sf.y;
                lip = sf.w;
                // the front of a wave turned toward the beach: it sees less of the sky and shows the stirred water in it
                face = smoothstep(0.06, 0.45, sf.z) * (1.0 - smoothstep(25.0, 50.0, t));
              }

              // refraction: the bottom's image wobbles in proportion to the water's thickness (things above the surface are left alone)
              float thick0 = min(sceneDist - t, 30.0);
              vec2 off = N.xz * uRefr * min(thick0, 0.5) / max(t, 1.0);
              off *= smoothstep(0.0, 0.02, thick0);
              vec2 uv2 = uv + off;
              float d2 = texture2D(tDepth, uv2).r;
              bool sky2 = d2 >= 1.0;
              vec3 P2 = worldPos(uv2, sky2 ? 0.9995 : d2);
              if (P2.y > level || any(lessThan(uv2, vec2(0.0))) || any(greaterThan(uv2, vec2(1.0)))) { uv2 = uv; P2 = P; sky2 = sky; }
              vec3 refr = texture2D(tColor, uv2).rgb;
              float thick = sky2 ? 1e4 : max(length(P2 - uCamPos) - t, 0.0);

              // turbidity: the bottom fades into the silty water over the length of the view path through it
              // (a few tens of centimetres); tide pools have settled and stay clearer
              float fogW = mix(uFogW, uFogPool, calm);
              // the surf stirs the sand up: the breaking water is murkier, its colour going sandy-green
              float murk = surfOn ? uSurf.w * (1.0 - smoothstep(0.1, 1.0, Ds)) : 0.0;
              fogW *= 1.0 + 2.5 * murk;
              vec3 glow = waterGlow(rd) * mix(vec3(1.0), vec3(1.3, 1.15, 0.7), murk * 0.7);
              // (a steep front shades the water behind it from the sky: the face reads darker than the trough before it)
              vec3 under = mix(glow, refr, exp(-thick * fogW)) * mix(1.0, 0.5, face);

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
              // steeply toward grazing
              vec2 sp = fresnelSP(max(cosT, 0.02));
              float Fphys = mix(0.5 * (sp.x + sp.y), sp.y + 0.12 * sp.x, uPolar);
              F = mix(F, max(F, Fphys * 0.92), smoothstep(5.0, 20.0, t));

              // sun glitter: small facets tilted at random break the sun's reflection into sparkles
              vec2 gp = S.xz * 40.0 + uTime * vec2(0.7, 0.4);
              vec2 gc = floor(gp);
              float gshape = smoothstep(0.32, 0.0, length(fract(gp) - 0.5 + (vec2(hash12(gc + 1.3), hash12(gc + 5.9)) - 0.5) * 0.4));
              vec3 jit = vec3(hash12(gc) - 0.5, 0.0, hash12(gc + 7.3) - 0.5) * 0.09 * mix(1.0, 0.3, calm);
              vec3 Ng = normalize(N + jit);
              vec3 H = normalize(uSunDir - rd);
              float nh = max(dot(Ng, H), 0.0);
              float tw = 0.5 + 0.5 * sin(uTime * 9.0 + hash12(gc + 3.1) * 40.0);
              float near = 1.0 - smoothstep(25.0, 70.0, t);
              float glint = pow(nh, 5000.0) * 90.0 * tw * gshape * near + pow(max(dot(N, H), 0.0), 1500.0) * 0.08;
              vec3 spec = uSunCol * glint * F * uSunUp;

              // (the sun's glitter keeps the full Fresnel: a milky lake still sparkles)
              col = mix(under, env, F * uReflScale) + spec;
              // the light through the thin top of a steepening wave: turquoise, brightest with the sun behind it
              col += vec3(0.03, 0.11, 0.085) * uSunCol * uSunUp * lip * (0.3 + 0.7 * pow(max(dot(rd, uSunDir), 0.0), 2.0)) * 0.5 * (1.0 - F);

              // the shoreline: a bright rim where the water is a few millimetres deep, and small bubbles
              float vdepth = surface - P.y;
              // (only where the ground itself meets the water: a blade floating just under the surface is not a shoreline)
              float onBed = 1.0 - smoothstep(0.015, 0.04, P.y - groundAt(P.xz));
              // (on an open shore the swash draws the edge itself: the rim stays a near-field touch)
              float nearOnly = 1.0 - uSurf.w * smoothstep(4.0, 12.0, t);
              float rim = smoothstep(0.0, 0.004, vdepth) * (1.0 - smoothstep(0.004, 0.03, vdepth)) * onBed * nearOnly;
              rim *= smoothstep(-0.2, 0.5, snoise(S.xz * 3.0 + uTime * 0.1));
              col += env * rim * 0.05;
              float bub = smoothstep(0.86, 0.97, snoise(S.xz * 14.0 + uTime * vec2(0.05, 0.03))) * (1.0 - smoothstep(0.0, 0.06, vdepth)) * smoothstep(0.0, 0.004, vdepth) * onBed;
              col = mix(col, vec3(0.85) * (0.4 + 0.6 * uSunUp) * uAmbient, bub * 0.55 * (1.0 - calm * 0.6) * nearOnly);
              // flecks floating on the surface, near the viewer
              float speck = smoothstep(0.93, 0.99, snoise(S.xz * 9.0 + uTime * vec2(0.04, 0.025))) * smoothstep(0.02, 0.2, vdepth) * (1.0 - smoothstep(4.0, 14.0, t));
              col = mix(col, vec3(0.75, 0.72, 0.62) * uAmbient, speck * 0.25);

              // a swash sheet only millimetres thick hardly shows: its edges dissolve into the wet sand (the froth on it, below,
              // stays)
              if (uSurf.w > 0.0 && Ds < 0.02) col = mix(base, col, smoothstep(0.0, 0.006, vdepth));

              // the surf's foam: lace from the Voronoi map, in drifting patches; and the white froth along the water's edge
              if (surfOn) {
                // each wave lays its own pattern (the lace shifts with the wave's number)
                // (looked up through a smooth warp and at a second, turned scale, so no cell pattern repeats in a line)
                vec2 fw = (vec2(vnoiseW(S.xz * 1.6 + waveN * 1.7), vnoiseW(S.xz * 1.6 + vec2(7.3, -waveN))) - 0.5) * 0.18;
                vec2 fuv = S.xz * 0.85 + vec2(uTime * 0.01, uTime * 0.006) + N.xz * 0.05 + vec2(waveN * 0.37, waveN * 0.61) + fw;
                vec3 L1 = texture2D(tFoam, fuv).rgb;
                vec3 L2 = texture2D(tFoam, mat2(0.8, 0.6, -0.6, 0.8) * fuv * 2.13 + vec2(0.4, -uTime * 0.01)).rgb;
                float lf = max(max(L1.r, L2.g * 0.9), L1.b * 0.8);
                float patches = smoothstep(0.25, 0.7, vnoiseW(S.xz * 0.7 + vec2(waveN * 3.1, uTime * 0.1)));
                // a little foam reads as lace along the cell walls; more fills the cells in, a roller is solid white.
                // (far off the lace is finer than a pixel and would average into a veil: the walls alone stay)
                float fa = foam * mix(0.45, 1.15, patches);
                if (Ds < 0.25) {
                  // the water's edge: the swash's leading edge is a band of white froth a hand or two wide, thickest while
                  // it climbs, thinning to lace as it stops and drains; and the sheet behind carries a little up the beach
                  vec2 sw = surfSwash(S.xz, uTime);
                  float band = (1.0 - smoothstep(0.006, 0.022, vdepth)) * smoothstep(0.0, 0.0012, vdepth) * onBed;
                  float sheet = (1.0 - smoothstep(-0.02, 0.04, Ds)) * smoothstep(0.0, 0.003, vdepth) * 0.4;
                  fa = max(fa, max(band * mix(0.8, 1.15, sw.y), sheet * (0.45 + 0.55 * sw.y)) * mix(0.7, 1.1, patches));
                }
                float fm = clamp(fa * 1.25 - (1.0 - lf) * 0.95, 0.0, 1.0) * mix(1.0, 0.8, smoothstep(8.0, 30.0, t));
                // foam is a bright, rough body: lit by the sun on its (softened) slope and the sky, darker in the thin lace
                // where the water shows through and in the hollows of the bubbles
                vec3 Nf = normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.4));
                vec3 foamCol = 0.85 * (uSunCol * max(dot(Nf, uSunDir), 0.0) * 0.32 * uSunUp + uAmbient * vec3(0.55, 0.6, 0.65));
                foamCol *= mix(0.72, 1.0, smoothstep(0.2, 0.9, fm)) * (0.9 + 0.1 * max(L2.g, L2.b));
                col = mix(col, foamCol, clamp(fm, 0.0, 0.95) * (1.0 - smoothstep(60.0, 150.0, t)));
              }

              // far water fades into the haze
              float fogF = 1.0 - exp(-pow(uFogDensity * t, 2.0));
              col = mix(col, uFogColor, fogF);
            }
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          {
            // a light grade (warm highlights, cool shadows) and a soft vignette, as in the viewer
            vec3 c = gl_FragColor.rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(c * vec3(0.97, 1.0, 1.03), c * vec3(1.03, 1.0, 0.95), smoothstep(0.2, 0.8, l));
            vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
            c *= mix(0.84, 1.0, smoothstep(1.15, 0.3, length(q)));
            gl_FragColor.rgb = c;
          }
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
    if (surf.uSurf.value.w > 0) {
      // the surf's height field: the same surface the water pass draws, 25 cm apart, for the eelgrass afloat in it
      const u = this.uniforms;
      const material = new ShaderMaterial({
        uniforms: { tHeight: u.tHeight, uHeightN: u.uHeightN, uHalf: u.uHalf, uWater: u.uWater, uTime: u.uTime, uSurf: u.uSurf, uSurfDir: u.uSurfDir },
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
    this.uniforms.uEnvI.value = on ? 0.5 : 0.6;
  }

  /** The sea's mirror of the land and sky at `scale` of the screen's resolution (0: off, the sky cube alone). */
  setMirror(scale: number): void {
    if (scale <= 0) { this.mirror?.dispose(); this.mirror = null; this.uniforms.uMirrorOn.value = 0; return; }
    if (this.mirror) this.mirror.scale = scale;
    else this.mirror = new MirrorView(scale);
  }

  private polarized = false;

  /** The water of this shore: its colour seen in depth (linear) and its turbidity against 葛西's silty water; optionally
   * a milky body (scatter, linear), a weaker (reflect, factor on Fresnel) and broken (rough, 0..1) reflection. */
  setBody(r: number, g: number, b: number, turbidity: number, optics: { scatter?: readonly [number, number, number]; reflect?: number; rough?: number } = {}): void {
    this.tint.setRGB(r, g, b);
    this.clarity = turbidity;
    const sc = optics.scatter ?? [0, 0, 0];
    this.uniforms.uScatter.value.set(sc[0], sc[1], sc[2]);
    this.uniforms.uReflScale.value = optics.reflect ?? 1;
    this.uniforms.uReflRough.value = optics.rough ?? 0;
    this.setPolarized(this.polarized);
  }

  /** The full-screen quad the water is drawn with, to compile its shader ahead of the first frame (the same mesh,
   * so the same program variant). */
  compileTarget(): Object3D {
    return (this.quad as unknown as { _mesh: Object3D })._mesh;
  }

  /** The surf field's quad and the target it is drawn into, to compile ahead too (null: no surf). */
  surfCompileTarget(): { mesh: Object3D; target: WebGLRenderTarget } | null {
    return this.surf ? { mesh: (this.surf.quad as unknown as { _mesh: Object3D })._mesh, target: this.surf.target } : null;
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

  /** Composite the water over a rendered frame (colour + depth) into `output` (null = the screen). */
  render(gl: WebGLRenderer, input: WebGLRenderTarget, output: WebGLRenderTarget | null, camera: PerspectiveCamera): void {
    const u = this.uniforms;
    u.tColor.value = input.texture;
    u.tDepth.value = input.depthTexture;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uRes.value.set(input.width, input.height);
    gl.setRenderTarget(output);
    this.quad.render(gl);
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
