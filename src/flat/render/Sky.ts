import {
  BackSide, BoxGeometry, Matrix4, CubeCamera, Float32BufferAttribute, BufferGeometry, HalfFloatType, LinearFilter, Mesh, OrthographicCamera,
  PMREMGenerator, RGBAFormat, Scene, ShaderMaterial, Vector2, Vector3, WebGLCubeRenderTarget, WebGLRenderTarget, ClampToEdgeWrapping,
  type Texture, type WebGLRenderer, type IUniform,
} from 'three';
import { COMMON_GLSL } from './glsl/common';

/**
 * Daylight over the bay.
 *
 * Atmosphere: single scattering by air (Rayleigh) and two aerosol layers (Mie: the background haze, 1.2 km scale
 * height, and the shallow marine haze over the bay, 0.45 km) with ozone absorption, integrated numerically (after
 * Hillaire 2020; no transmittance LUT, the sky-view table is only rebuilt when the sun moves) into a 256×128
 * latitude–longitude table around the sun, plus an isotropic multiple-scattering share. The shallow haze whitens
 * the horizon and swallows the far shores without greying the zenith.
 *
 * Clouds are optical depth, not paint: a sheet of altocumulus (≈ 3.8 km) and thin cirrus (≈ 8.5 km) on spherical
 * shells (so they crowd and thicken toward the horizon), each lit with a two-stream estimate of the sunlight that
 * diffuses through (bright white bases, greyer where thick), a forward-scattering glow toward the sun, the blue sky
 * above and the bright flat below. The same depth dims the sun on the ground under each cloud: soft shadows drift
 * across the flat while the sky itself (through the image-based lighting) takes over.
 * Every octave of the cloud texture is filtered to the pixel's footprint on the cloud layer, so the sky never
 * aliases toward the horizon, and the water's reflections get the clouds blurred by their own ripples.
 */

export interface SkyParams {
  /** sun direction (unit, world) */
  sunDir: Vector3;
  /** marine haze: multiplier on the clean-air aerosol density in the shallow layer */
  haze: number;
  /** altocumulus cover 0…1 */
  cover: number;
  /** cirrus amount 0…1 */
  cirrus: number;
}

// km-based constants shared by the LUT pass and the CPU sun colour
const RG = 6360, RT = 6460;
const RAY = [5.802e-3, 13.558e-3, 33.1e-3];
const OZONE = [0.65e-3, 1.881e-3, 0.085e-3];
const MIE_S = 3.996e-3, MIE_A = 0.444e-3;
const HAZE_BG = 5, H_BG = 1.2, H_BL = 0.45;
/** top-of-atmosphere sun irradiance in scene units (linear sRGB): the exposure is set for this */
export const SUN_E0 = new Vector3(4.2, 4.08, 3.92);

export const ATMOS_GLSL = /* glsl */ `
uniform sampler2D uSkyLUT;
uniform vec3 uSunDir;
uniform vec3 uSunE;       // sun irradiance at the ground (after the atmosphere), normal incidence
uniform vec3 uSunE0;      // above the atmosphere
uniform float uHazeExt;   // extinction of the air near the ground (1/m), for aerial perspective
// sky-view table: azimuth from the sun (0…π), elevation with more rows near the horizon
vec3 atmosphere(vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (0.5 * PI));
  vec2 dh = d.xz, sh = uSunDir.xz;
  float ld = length(dh), ls = length(sh);
  float ca = (ld > 1e-5 && ls > 1e-5) ? dot(dh / ld, sh / ls) : 1.0;
  float u = acos(clamp(ca, -1.0, 1.0)) / PI;
  return textureLod(uSkyLUT, vec2(u, v), 0.0).rgb;
}
// the haze seen toward the horizon in direction d (aerial perspective colour)
vec3 hazeColor(vec3 d) {
  vec3 h = normalize(vec3(d.x, clamp(d.y, -0.01, 0.015), d.z));
  return atmosphere(h);
}
// aerial perspective over a path of dist metres starting near the ground (the haze is shallow)
vec3 aerial(vec3 col, float dist, vec3 d) {
  float up = max(d.y, 0.0);
  float eff = dist / (1.0 + up * dist / 600.0);
  float T = exp(-eff * uHazeExt);
  return col * T + hazeColor(d) * (1.0 - T);
}
float hgPhase(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
`;

export const CLOUDS_GLSL = /* glsl */ `
uniform vec2 uCloudShift;  // km: the layers drift with the wind aloft
uniform float uCover;
uniform float uCirrus;
uniform float uCloudTime;
uniform vec3 uSkyUp;       // sky radiance falling on the clouds from above
uniform vec3 uGroundUp;    // radiance of the sunlit flat and bay below them
const float R_EARTH = 6360.0;
// distance (km) from the viewer (2 m up) to a shell h km above the sea, along d (d.y > 0)
float shellDist(vec3 d, float h) {
  float r0 = R_EARTH + 0.002, rc = R_EARTH + h, mu = d.y;
  return -r0 * mu + sqrt(max(r0 * r0 * mu * mu + rc * rc - r0 * r0, 0.0));
}
// soft round cloudlets: per cell a blob of random size, slightly offset (smooth Worley)
float cloudlets(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float v = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec4 h = hash24(ip + g + 311.0);
    vec2 r = g + 0.2 + h.xy * 0.6 - fp;
    float rad = 0.35 + 0.4 * h.z;
    v = max(v, (1.0 - smoothstep(0.0, rad, length(r * vec2(1.0, 1.25)))) * (0.6 + 0.4 * h.w));
  }
  return v;
}
// Vertical optical depth of the altocumulus sheet at layer coordinates q (km). fp: the pixel's footprint on the
// layer (km): octaves finer than it are replaced by their mean.
float acTau(vec2 q, float fp) {
  vec2 s = q + uCloudShift;
  // large structure: patches and broad bands with clear lanes (tens of km), wavering
  vec2 b = mat2(0.92, 0.39, -0.39, 0.92) * s;
  vec2 w = vec2(sfbm(s * 0.045 + 3.1, 3), sfbm(s * 0.045 - 7.7, 3));
  float macro = fbm(vec2(b.x * 0.06, b.y * 0.075) + w * 0.9, 4);
  // cloud masses, a few km, folded by a warp
  float meso = fbm(s * 0.28 + w * 2.2 + 11.0, 4);
  float base = macro * 0.55 + meso * 0.45;
  float thr = mix(0.66, 0.36, uCover);
  float cover = smoothstep(thr - 0.12, thr + 0.1, base);
  // the sheet's grain: rounded cloudlets 150–500 m packed irregularly (altocumulus), shrinking toward the
  // edges of a patch and merging into a smooth sheet where it is thick
  float kC = 1.0 - smoothstep(0.06, 0.3, fp);
  vec2 c = s * 2.3 + vec2(sfbm(s * 0.6, 2), sfbm(s * 0.6 + 5.0, 2)) * 1.3;
  float cl = kC > 0.0 ? mix(0.55, cloudlets(c) * 0.7 + cloudlets(c * 2.1 + 7.3) * 0.3, kC) : 0.55;
  float kF = 1.0 - smoothstep(0.012, 0.05, fp);
  float fine = kF > 0.0 ? mix(0.5, fbm(s * 12.0, 3), kF) : 0.5;
  float sheet = smoothstep(0.75, 1.0, cover) * 0.35;
  float d = cover * (cl * 1.15 + sheet) - (1.0 - cover) * 0.3 + (fine - 0.5) * 0.35 * cover;
  return 5.5 * pow(sat(d), 1.7);
}
float ciTau(vec2 q, float fp) {
  vec2 s = q * 0.6 + uCloudShift * 1.6;
  // fibrous streaks: stretched noise, hooked by a slow warp
  vec2 w = s + 1.3 * vec2(sfbm(s * 0.21, 3), sfbm(s * 0.21 + 11.0, 3));
  vec2 r = mat2(0.6, 0.8, -0.8, 0.6) * w;
  float kF = 1.0 - smoothstep(0.02, 0.12, fp);
  float streak = mix(fbm(vec2(r.x * 0.4, r.y * 3.6), 3), fbm(vec2(r.x * 0.4, r.y * 3.6), 5), kF);
  float patchy = smoothstep(0.42, 0.75, fbm(s * 0.12 + 40.0, 3));
  return 0.3 * sat((streak - 0.48) * 2.6) * patchy * uCirrus;
}
// light of a cloud layer with vertical optical depth tau, seen along d from below: (radiance, opacity)
vec4 cloudLight(vec3 d, float tau, vec3 sunE, float g) {
  float mv = max(d.y, 0.035);
  float ms = max(uSunDir.y, 0.05);
  float tv = tau / mv;
  float alpha = 1.0 - exp(-tv);
  // two-stream: the diffuse part of the sunlight that comes out of the bottom of the sheet
  float Td = (1.0 - exp(-tau / ms)) / (1.0 + 0.75 * (1.0 - 0.85) * tau);
  float mu = dot(d, uSunDir);
  vec3 diffuse = sunE * ms * Td * INV_PI * 1.15;
  // single forward scattering: thin parts glow toward the sun
  vec3 forward = sunE * hgPhase(mu, g) * exp(-tau * 0.45 / ms) * 2.2;
  // the blue sky above shines through; the bright flat and bay below light the base
  float Tsky = 1.0 / (1.0 + 0.4 * tau);
  vec3 amb = uSkyUp * Tsky + uGroundUp * (1.0 - Tsky) * 0.85;
  return vec4((diffuse + amb) * alpha + forward * min(tv, 1.5) * exp(-tv * 0.5), alpha);
}
vec4 cloudAC(vec3 d, vec3 sunE, float fpAng) {
  if (d.y < 0.006) return vec4(0.0);
  float t = shellDist(d, 3.8);
  float fp = t * fpAng / max(d.y, 0.02);
  float tau = acTau(d.xz * t, fp);
  if (tau <= 1e-3) return vec4(0.0);
  vec4 c = cloudLight(d, tau, sunE, 0.75);
  // the far sheet sinks into the haze (and its texture with it)
  float haze = 1.0 - exp(-t / 45.0);
  c.rgb = mix(c.rgb, atmosphere(d) * c.a * 1.15, haze * 0.85);
  return c;
}
vec4 cloudCI(vec3 d, vec3 sunE, float fpAng) {
  if (d.y < 0.015 || uCirrus <= 0.001) return vec4(0.0);
  float t = shellDist(d, 8.5);
  float fp = t * fpAng / max(d.y, 0.02);
  float tau = ciTau(d.xz * t * 0.1, fp * 0.1);
  if (tau <= 1e-3) return vec4(0.0);
  vec4 c = cloudLight(d, tau, sunE, 0.8);
  c.rgb = mix(c.rgb, atmosphere(d) * c.a, (1.0 - exp(-t / 90.0)) * 0.8);
  return c;
}
// direct sunlight left after the altocumulus sheet at a point on the ground: soft shadows drifting over the flat
// (blurred by the sun's disk seen from 4 km: tens of metres of penumbra)
float cloudShadow(vec3 wp) {
  vec3 L = uSunDir;
  float hk = 3.8 - wp.y * 0.001;
  vec2 q = wp.xz * 0.001 + L.xz / max(L.y, 0.1) * hk;
  float tau = acTau(q, 0.06);
  return exp(-tau / max(L.y, 0.1) * 0.8);
}
`;

export const SKY_GLSL = /* glsl */ `
${ATMOS_GLSL}
${CLOUDS_GLSL}
// The far shores across the bay (15–30 km): a faint, broken line on the horizon, a few blocks and stacks
// standing out of it, almost lost in the haze. East-south-east and west-south-west, open water due south.
vec4 farLand(vec3 d, float fpAng) {
  float el = d.y;
  if (el > 0.004 || el < -0.0015) return vec4(0.0);
  float az = atan(d.x, -d.z);
  if (az < 0.0) az += TAU;
  float seg = smoothstep(1.72, 1.86, az) * (1.0 - smoothstep(2.74, 2.88, az)) + smoothstep(3.44, 3.58, az) * (1.0 - smoothstep(4.5, 4.62, az));
  if (seg <= 0.0) return vec4(0.0);
  float h = (0.0003 + 0.0008 * fbm(vec2(az * 35.0, 3.0), 4)) * seg;
  float cell = floor(az * 700.0);
  h += step(0.86, hash21(vec2(cell, 7.0))) * 0.0011 * hash21(vec2(cell, 3.0)) * seg;
  float edge = max(fpAng, 1e-4);
  float a = smoothstep(h + edge * 0.5, h - edge * 0.5, el);
  vec3 col = hazeColor(d) * vec3(0.84, 0.87, 0.92);
  return vec4(col, a * 0.85);
}
// the full sky along d: atmosphere, far shores, cirrus, altocumulus, sun disk (optional).
// fpAng: the angular size of what one pixel sees (the clouds are filtered to it)
vec3 skyColor(vec3 d, bool withSun, float fpAng) {
  vec3 c = atmosphere(d);
  if (withSun) {
    float mu = dot(d, uSunDir);
    float r = 0.00465;
    float x = sqrt(max(1.0 - mu * mu, 0.0)) / r;
    if (mu > 0.0 && x < 1.0) {
      float limb = 1.0 - 0.6 * (1.0 - sqrt(1.0 - x * x));
      c += uSunE / (PI * r * r) * limb;
    }
  }
  vec4 fl = farLand(d, fpAng);
  c = mix(c, fl.rgb, fl.a);
  vec4 ci = cloudCI(d, uSunE, fpAng);
  c = c * (1.0 - ci.a) + ci.rgb;
  vec4 ac = cloudAC(d, uSunE, fpAng);
  c = c * (1.0 - ac.a) + ac.rgb;
  return c;
}
`;

const fullscreenGeo = (() => {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
})();

export interface SkyUniforms {
  uSkyLUT: IUniform<Texture | null>;
  uSunDir: IUniform<Vector3>;
  uSunE: IUniform<Vector3>;
  uSunE0: IUniform<Vector3>;
  uHazeExt: IUniform<number>;
  uCloudShift: IUniform<Vector2>;
  uCover: IUniform<number>;
  uCirrus: IUniform<number>;
  uCloudTime: IUniform<number>;
  uSkyUp: IUniform<Vector3>;
  uGroundUp: IUniform<Vector3>;
}

export class Sky {
  readonly uniforms: SkyUniforms;
  readonly lut: WebGLRenderTarget;
  /** the sky drawn behind everything (full-screen triangle at the far plane) */
  readonly background: Mesh;
  private readonly lutMat: ShaderMaterial;
  private readonly lutScene = new Scene();
  private readonly orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly cubeRT: WebGLCubeRenderTarget;
  private readonly cubeCam: CubeCamera;
  private readonly envScene = new Scene();
  private readonly pmrem: PMREMGenerator;
  private envRT: WebGLRenderTarget | null = null;
  private lastKey = '';
  private lastEnvKey = '';

  constructor(private readonly renderer: WebGLRenderer, noise: IUniform<Texture>, readonly params: SkyParams) {
    this.lut = new WebGLRenderTarget(256, 128, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping });
    this.uniforms = {
      uSkyLUT: { value: this.lut.texture },
      uSunDir: { value: params.sunDir.clone() },
      uSunE: { value: new Vector3() },
      uSunE0: { value: SUN_E0.clone() },
      uHazeExt: { value: 1e-4 },
      uCloudShift: { value: new Vector2(0, 0) },
      uCover: { value: params.cover },
      uCirrus: { value: params.cirrus },
      uCloudTime: { value: 0 },
      uSkyUp: { value: new Vector3(0.3, 0.38, 0.5) },
      uGroundUp: { value: new Vector3(0.1, 0.09, 0.08) },
    };
    this.lutMat = new ShaderMaterial({
      uniforms: {
        uSunDir: this.uniforms.uSunDir, uSunE0: this.uniforms.uSunE0,
        uHaze: { value: params.haze }, uRayleigh: { value: new Vector3(RAY[0], RAY[1], RAY[2]) }, uOzone: { value: new Vector3(OZONE[0], OZONE[1], OZONE[2]) },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #define PI 3.14159265359
        uniform vec3 uSunDir, uSunE0, uRayleigh, uOzone;
        uniform float uHaze;
        varying vec2 vUv;
        const float RG = ${RG.toFixed(1)}, RT = ${RT.toFixed(1)};
        const float MIE_S = ${MIE_S}, MIE_A = ${MIE_A}, HAZE_BG = ${HAZE_BG.toFixed(1)}, H_BG = ${H_BG}, H_BL = ${H_BL};
        float mieDensity(float h) { return HAZE_BG * exp(-h / H_BG) + uHaze * exp(-h / H_BL); }
        vec3 extinctionAt(float h) {
          float r = exp(-h / 8.0), o = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
          return uRayleigh * r + vec3((MIE_S + MIE_A) * mieDensity(h)) + uOzone * o;
        }
        float sphereExit(vec3 p, vec3 d, float R) {
          float b = dot(p, d), c = dot(p, p) - R * R, disc = b * b - c;
          if (disc < 0.0) return -1.0;
          return -b + sqrt(disc);
        }
        float sphereHit(vec3 p, vec3 d, float R) {
          float b = dot(p, d), c = dot(p, p) - R * R, disc = b * b - c;
          if (disc < 0.0) return -1.0;
          float t = -b - sqrt(disc);
          return t > 0.0 ? t : -1.0;
        }
        vec3 sunTransmittance(vec3 p) {
          float g = sphereHit(p, uSunDir, RG);
          if (g > 0.0) return vec3(0.0);
          float L = sphereExit(p, uSunDir, RT);
          vec3 od = vec3(0.0);
          const int N = 16;
          float tp = 0.0;
          for (int i = 0; i < N; i++) {
            float f = (float(i) + 0.5) / float(N);
            float t = L * f * f;
            float dt = L * (float(i + 1) * float(i + 1) - float(i) * float(i)) / float(N * N);
            od += extinctionAt(length(p + uSunDir * t) - RG) * dt;
          }
          return exp(-od);
        }
        void main() {
          float az = vUv.x * PI;
          float v = vUv.y * 2.0 - 1.0;
          float el = sign(v) * v * v * 0.5 * PI;
          // frame: the sun's azimuth along +x
          vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-6, 0.0, 0.0));
          vec3 side = vec3(-sh.z, 0.0, sh.x);
          vec3 d = normalize(sh * cos(az) * cos(el) + side * sin(az) * cos(el) + vec3(0.0, sin(el), 0.0));
          vec3 p0 = vec3(0.0, RG + 0.002, 0.0);
          float tMax = sphereExit(p0, d, RT);
          float g = sphereHit(p0, d, RG);
          if (g > 0.0) tMax = g;
          float mu = dot(d, uSunDir);
          float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
          float gm = 0.78;
          float pm = 3.0 / (8.0 * PI) * ((1.0 - gm * gm) * (1.0 + mu * mu)) / ((2.0 + gm * gm) * pow(max(1.0 + gm * gm - 2.0 * gm * mu, 1e-4), 1.5));
          vec3 L = vec3(0.0), T = vec3(1.0);
          const int N = 48;
          float tPrev = 0.0;
          float day = clamp(uSunDir.y * 3.0 + 0.3, 0.0, 1.0);
          for (int i = 0; i < N; i++) {
            float f = (float(i) + 0.5) / float(N);
            float t = tMax * f * f;
            float dt = t - tPrev; tPrev = t;
            vec3 p = p0 + d * t;
            float h = max(length(p) - RG, 0.0);
            vec3 sR = uRayleigh * exp(-h / 8.0);
            float sM = MIE_S * mieDensity(h);
            vec3 ext = extinctionAt(h);
            vec3 Ts = sunTransmittance(p);
            // single scattering, plus an isotropic share for the light scattered more than once (it keeps the sky
            // bright and whitens the horizon; the ground's light reflected back up adds to it)
            vec3 S = (sR * pr + vec3(sM * pm)) * Ts * uSunE0;
            S += (sR + vec3(sM)) * (0.3 + 0.7 * Ts) * uSunE0 * 0.055 * day;
            vec3 Tseg = exp(-ext * dt);
            L += T * S * (1.0 - Tseg) / max(ext, vec3(1e-6));
            T *= Tseg;
          }
          gl_FragColor = vec4(L, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const q = new Mesh(fullscreenGeo, this.lutMat);
    q.frustumCulled = false;
    this.lutScene.add(q);

    const skyFrag = /* glsl */ `
      ${COMMON_GLSL}
      ${SKY_GLSL}
      uniform mat4 uInvProj, uCamWorld;
      uniform float uEnvMode;
      varying vec2 vNdc;
      varying vec3 vDir;
      void main() {
        vec3 d;
        if (uEnvMode > 0.5) d = normalize(vDir);
        else { vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); d = normalize(mat3(uCamWorld) * (v.xyz / v.w)); }
        vec3 c;
        if (uEnvMode > 0.5 && d.y < 0.0) {
          // the environment's lower half: the flat and the bay, hazed toward the horizon
          c = mix(hazeColor(d), uGroundUp, smoothstep(0.0, -0.25, d.y));
        } else c = skyColor(d, uEnvMode < 0.5, max(length(fwidth(d)), 2e-4));
        gl_FragColor = vec4(min(c, vec3(60000.0)), 1.0);
      }
    `;
    const bgMat = new ShaderMaterial({
      uniforms: { ...this.uniforms, uNoise: noise, uInvProj: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() }, uEnvMode: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vNdc; varying vec3 vDir; void main() { vNdc = position.xy; vDir = vec3(0.0); gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: skyFrag,
      depthTest: true,
      depthWrite: false,
    });
    this.background = new Mesh(fullscreenGeo, bgMat);
    this.background.frustumCulled = false;
    this.background.renderOrder = -1000;
    this.background.onBeforeRender = (_r, _s, camera) => {
      bgMat.uniforms.uInvProj.value = camera.projectionMatrixInverse;
      bgMat.uniforms.uCamWorld.value = camera.matrixWorld;
    };
    // environment: a box around a cube camera, same shader by direction
    const envMat = new ShaderMaterial({
      uniforms: { ...this.uniforms, uNoise: noise, uInvProj: { value: new Matrix4() }, uCamWorld: { value: new Matrix4() }, uEnvMode: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vNdc; varying vec3 vDir; void main() { vDir = position; vNdc = vec2(0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: skyFrag,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.envScene.add(new Mesh(new BoxGeometry(10, 10, 10), envMat));
    this.cubeRT = new WebGLCubeRenderTarget(128, { type: HalfFloatType, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.cubeCam = new CubeCamera(0.1, 100, this.cubeRT);
    this.pmrem = new PMREMGenerator(renderer);
  }

  /** Prefiltered environment (PMREM, cube-UV) for image-based lighting; null until the first update. */
  get env(): Texture | null {
    return this.envRT ? this.envRT.texture : null;
  }

  get envHeight(): number {
    return this.envRT ? this.envRT.height : 512;
  }

  /** Set the sun and recompute what depends on it (cheap when nothing changed). */
  update(dt: number, cloudWind: Vector2): void {
    const u = this.uniforms, p = this.params;
    u.uCloudTime.value += dt;
    u.uCloudShift.value.addScaledVector(cloudWind, dt);
    u.uCover.value = p.cover;
    u.uCirrus.value = p.cirrus;
    u.uSunDir.value.copy(p.sunDir).normalize();
    const key = `${p.sunDir.x.toFixed(4)},${p.sunDir.y.toFixed(4)},${p.sunDir.z.toFixed(4)},${p.haze.toFixed(3)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lutMat.uniforms.uHaze.value = p.haze;
      const r = this.renderer, prev = r.getRenderTarget();
      r.setRenderTarget(this.lut);
      r.render(this.lutScene, this.orthoCam);
      r.setRenderTarget(prev);
      u.uSunE.value.copy(sunIrradiance(u.uSunDir.value, p.haze));
      // extinction near the ground (green), 1/m: what the far shore and the breakwater fade by
      u.uHazeExt.value = (RAY[1] + (MIE_S + MIE_A) * (HAZE_BG + p.haze)) * 1e-3;
      // light falling on the clouds from the sky above, and coming up from the sunlit flat and bay
      const s = Math.max(0, u.uSunDir.value.y);
      u.uSkyUp.value.set(0.2, 0.26, 0.36).multiplyScalar(0.2 + 0.95 * s);
      const e = u.uSunE.value;
      u.uGroundUp.value.set(0.28 * (e.x * s + 0.4), 0.26 * (e.y * s + 0.42), 0.22 * (e.z * s + 0.48)).multiplyScalar(1 / Math.PI);
    }
  }

  /** Rebuild the environment cube + PMREM (after a sun or cloud change; a few ms on a GPU). */
  updateEnvironment(force = false): void {
    const p = this.params;
    const key = `${this.lastKey}|${p.cover.toFixed(2)}|${p.cirrus.toFixed(2)}`;
    if (!force && key === this.lastEnvKey && this.envRT) return;
    this.lastEnvKey = key;
    this.cubeCam.update(this.renderer, this.envScene);
    const prev = this.envRT;
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    prev?.dispose();
  }
}

/** Sun irradiance at sea level for a sun direction (numerical transmittance, same model as the LUT). */
export function sunIrradiance(sunDir: Vector3, haze: number): Vector3 {
  const p = [0, RG + 0.002, 0];
  const d = [sunDir.x, sunDir.y, sunDir.z];
  const b = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
  const c = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - RT * RT;
  const L = -b + Math.sqrt(Math.max(b * b - c, 0));
  const cg = p[1] * p[1] - RG * RG;
  const disc = b * b - cg;
  if (disc > 0 && -b - Math.sqrt(disc) > 0) return new Vector3(0, 0, 0);
  const od = [0, 0, 0];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const t = L * ((i + 0.5) / N) ** 2;
    const dt = (L * ((i + 1) ** 2 - i ** 2)) / (N * N);
    const x = p[0] + d[0] * t, y = p[1] + d[1] * t, z = p[2] + d[2] * t;
    const h = Math.max(0, Math.hypot(x, y, z) - RG);
    const r = Math.exp(-h / 8), m = HAZE_BG * Math.exp(-h / H_BG) + haze * Math.exp(-h / H_BL), o = Math.max(0, 1 - Math.abs(h - 25) / 15);
    for (let k = 0; k < 3; k++) od[k] += (RAY[k] * r + (MIE_S + MIE_A) * m + OZONE[k] * o) * dt;
  }
  return new Vector3(SUN_E0.x * Math.exp(-od[0]), SUN_E0.y * Math.exp(-od[1]), SUN_E0.z * Math.exp(-od[2]));
}
