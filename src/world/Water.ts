import {
  ClampToEdgeWrapping, Color, CubeTexture, DataTexture, FloatType, LinearFilter, LinearMipmapLinearFilter, Matrix4, RedFormat,
  RepeatWrapping, RGBAFormat, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Terrain } from './Terrain';

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
}

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoiseW(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float snoise(vec2 p) { return vnoiseW(p) * 2.0 - 1.0; }
`;

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
  level = 0;

  constructor(terrain: Terrain) {
    this.uniforms = {
      tColor: { value: null as unknown },
      tDepth: { value: null as unknown },
      tNormal: { value: makeWaveNormal() },
      tHeight: { value: terrain.heightTexture },
      tSpill: { value: terrain.spillTexture },
      tEnv: { value: null as CubeTexture | null },
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
      uWaterCol: { value: new Color(0.12, 0.22, 0.19) },
      uAbsorb: { value: new Vector3(1.1, 0.42, 0.5) },
      uScatter: { value: 0.45 },
      uRefr: { value: 0.6 },
      uRes: { value: new Vector2(1, 1) },
      uEnvI: { value: 0.9 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tNormal, tHeight, tSpill;
        uniform samplerCube tEnv;
        uniform mat4 uProjInv, uCamWorld;
        uniform vec3 uCamPos, uSunDir, uSunCol, uFogColor, uWaterCol, uAbsorb;
        uniform float uWater, uTime, uSunUp, uAmbient, uFogDensity, uScatter, uEnvI, uHalf, uRefr;
        uniform vec2 uRes;
        varying vec2 vUv;
        ${NOISE_GLSL}

        vec3 worldPos(vec2 uv, float d) {
          vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 v = uProjInv * c; v /= v.w;
          return (uCamWorld * v).xyz;
        }
        vec2 tuv(vec2 xz) { return (xz + uHalf) / (2.0 * uHalf); }
        float groundAt(vec2 xz) { return texture2D(tHeight, tuv(xz)).r; }
        float spillAt(vec2 xz) { return texture2D(tSpill, tuv(xz)).r; }
        vec2 nrm(vec2 p) { return texture2D(tNormal, p).xy * 2.0 - 1.0; }

        // ripples: four scales drifting in different directions; gusts make the surface rougher in patches; pools are calm
        vec3 waterNormal(vec2 p, float dist, float calm) {
          float gust = smoothstep(-0.4, 0.6, snoise(p * 0.08 + uTime * vec2(0.03, 0.02)));
          vec2 s = nrm(p * 2.0 + uTime * vec2(0.35, 0.2)) * 0.5;
          s += nrm(p * 5.2 + uTime * vec2(-0.5, 0.38)) * 0.35;
          s += nrm(p * 14.8 + uTime * vec2(0.9, -0.7)) * 0.25 * (1.0 - smoothstep(8.0, 40.0, dist));
          s += nrm(p * 36.0 + uTime * vec2(-1.3, 1.1)) * 0.08 * (1.0 - smoothstep(2.0, 12.0, dist));
          float amp = mix(0.05, 0.2, gust) * mix(1.0, 0.1, calm);
          return normalize(vec3(-s.x * amp, 1.0, -s.y * amp));
        }

        void main() {
          vec2 uv = vUv;
          float d = texture2D(tDepth, uv).r;
          vec3 base = texture2D(tColor, uv).rgb;
          bool sky = d >= 0.9995;
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

          if (uCamPos.y > level && rd.y < -1e-5) {
            float t = (level - uCamPos.y) / rd.y;
            if (t < sceneDist) {
              vec3 S = uCamPos + rd * t;
              vec3 N = waterNormal(S.xz, t, calm);

              // refraction: the bottom's image wobbles in proportion to the water's thickness (things above the surface are left alone)
              float thick0 = min(sceneDist - t, 30.0);
              vec2 off = N.xz * uRefr * min(thick0, 0.5) / max(t, 1.0);
              off *= smoothstep(0.0, 0.02, thick0);
              vec2 uv2 = uv + off;
              float d2 = texture2D(tDepth, uv2).r;
              bool sky2 = d2 >= 0.9995;
              vec3 P2 = worldPos(uv2, sky2 ? 0.9995 : d2);
              if (P2.y > level || any(lessThan(uv2, vec2(0.0))) || any(greaterThan(uv2, vec2(1.0)))) { uv2 = uv; P2 = P; sky2 = sky; }
              vec3 refr = texture2D(tColor, uv2).rgb;
              float thick = sky2 ? 1e4 : max(length(P2 - uCamPos) - t, 0.0);

              // absorption and scattering: shallow water is nearly clear, thicker water turns green-grey; pools are clearer
              vec3 absorb = uAbsorb * mix(1.0, 0.5, calm);
              float scatterK = uScatter * mix(1.0, 0.4, calm);
              vec3 T = exp(-absorb * thick);
              float sc = 1.0 - exp(-scatterK * thick);
              vec3 inscatter = uWaterCol * (0.3 + 0.7 * uSunUp) * uAmbient;
              vec3 under = refr * T + inscatter * sc;

              // the sky, reflected (the sun's disc is handled by the glitter below) and weighted by Fresnel
              vec3 R = reflect(rd, N);
              R.y = max(abs(R.y), 0.06);   // never sample the dome's dark underside at the horizon
              vec3 env = min(textureCube(tEnv, R).rgb * uEnvI, vec3(12.0));
              float cosT = clamp(dot(-rd, N), 0.0, 1.0);
              float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

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

              col = mix(under, env, F) + spec;

              // the shoreline: a bright rim where the water is a few millimetres deep, and small bubbles
              float vdepth = level - P.y;
              float rim = smoothstep(0.0, 0.004, vdepth) * (1.0 - smoothstep(0.004, 0.03, vdepth));
              rim *= smoothstep(-0.2, 0.5, snoise(S.xz * 3.0 + uTime * 0.1));
              col += env * rim * 0.05;
              float bub = smoothstep(0.86, 0.97, snoise(S.xz * 14.0 + uTime * vec2(0.05, 0.03))) * (1.0 - smoothstep(0.0, 0.06, vdepth)) * smoothstep(0.0, 0.004, vdepth);
              col = mix(col, vec3(0.85) * (0.4 + 0.6 * uSunUp) * uAmbient, bub * 0.55 * (1.0 - calm * 0.6));
              // flecks floating on the surface, near the viewer
              float speck = smoothstep(0.93, 0.99, snoise(S.xz * 9.0 + uTime * vec2(0.04, 0.025))) * smoothstep(0.02, 0.2, vdepth) * (1.0 - smoothstep(4.0, 14.0, t));
              col = mix(col, vec3(0.75, 0.72, 0.62) * uAmbient, speck * 0.25);

              // far water fades into the haze
              float fogF = 1.0 - exp(-pow(uFogDensity * t, 2.0));
              col = mix(col, uFogColor, fogF);
            }
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
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
  }
}

/** Spill-level texture (R, metres) for the terrain and water shaders. */
export function makeSpillTexture(spill: Float32Array, n: number): DataTexture {
  const t = new DataTexture(spill, n, n, RedFormat, FloatType);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
