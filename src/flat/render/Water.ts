import { GLSL3, Matrix4, ShaderMaterial, Vector2, Vector3, type IUniform, type PerspectiveCamera, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { COMMON_GLSL } from './glsl/common';
import { FIELD_GLSL, type FieldUniforms } from '../FlatField';
import { WAVES_GLSL, type WaveUniforms } from './glsl/waves';
import { LIGHTING_GLSL, cubeUVDefines } from './glsl/lighting';
import { SKY_GLSL, type SkyUniforms } from './Sky';

/**
 * Every water surface on the flat, per pixel, over the rendered ground (colour + depth).
 *
 * For each pixel the view ray meets the water level found under the ground point (the sea at the tide, a pool at
 * its own level, a creek at its flowing surface; open sea beyond the map). The surface normal comes from the shared
 * wave set (fetch, gusts, depth); then
 *  - refraction: the ground image is displaced by the slope, in proportion to the water's thickness;
 *  - the water itself: turbid bay water absorbs and scatters along the path (olive-brown, darker with depth);
 *    pools have settled and are clearer, creeks carry silt;
 *  - reflection: the sky with its clouds evaluated per pixel, and whatever stands above the water found by a short
 *    screen-space march (sea wall, breakwater, posts, stones, banks), weighted by the Fresnel term;
 *  - the sun: a microfacet highlight whose width comes from the ripples too small to resolve, plus sparkles;
 *  - the edges: water thins to nothing at a pool's shore, the swash runs up and back at the sea's edge with a
 *    lace of foam on its front.
 */
export class WaterPass {
  readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly viewProj = new Matrix4();

  constructor(field: FieldUniforms, sky: SkyUniforms, waves: WaveUniforms, shared: { uNoise: IUniform<Texture>; uTime: IUniform<number>; uEnv: IUniform<Texture | null> }, envHeight: number, opts: { ssr: boolean }) {
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      defines: { ...cubeUVDefines(envHeight), SSR: opts.ssr ? 1 : 0 },
      uniforms: {
        ...field, ...sky, ...waves, ...shared,
        tColor: { value: null },
        tDepth: { value: null },
        uProjInv: { value: new Matrix4() },
        uCamWorld: { value: new Matrix4() },
        uViewProj: { value: new Matrix4() },
        uCamPos: { value: new Vector3() },
        uRes: { value: new Vector2(1, 1) },
        uNear: { value: 0.05 },
        uFar: { value: 10000 },
      },
      vertexShader: /* glsl */ `out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${COMMON_GLSL}
        ${FIELD_GLSL}
        ${SKY_GLSL}
        ${WAVES_GLSL}
        ${LIGHTING_GLSL}
        uniform sampler2D tColor;
        uniform highp sampler2D tDepth;
        uniform mat4 uProjInv, uCamWorld, uViewProj;
        uniform vec3 uCamPos;
        uniform vec2 uRes;
        uniform float uNear, uFar;
        in vec2 vUv;
        out vec4 fragColor;

        vec3 worldAt(vec2 uv, float d) {
          vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 v = uProjInv * c; v /= v.w;
          return (uCamWorld * v).xyz;
        }
        float viewDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }

        // turbid estuarine water: extinction (1/m) and the colour it scatters
        void waterOptics(float kind, float vari, out vec3 sigT, out vec3 alb) {
          vec3 sa = vec3(0.62, 0.2, 0.28);          // water + yellow substance + phytoplankton
          float ss = 0.85;                           // silt
          float k = kind > 1.5 && kind < 2.5 ? 1.0 : kind > 2.5 ? 1.5 : 0.45 + 0.35 * vari;   // sea, creek, pool
          sigT = (sa + vec3(ss)) * k;
          alb = vec3(ss) / (sa + vec3(ss));
        }

        #if SSR
        // short screen-space march for what stands above the water (exponential steps out to ~1.5 km)
        vec4 ssrTrace(vec3 S, vec3 R) {
          float t = 0.12;
          float prevT = 0.0;
          for (int i = 0; i < 22; i++) {
            vec3 X = S + R * t;
            vec4 c = uViewProj * vec4(X, 1.0);
            if (c.w <= 0.0) break;
            vec2 uv = c.xy / c.w * 0.5 + 0.5;
            if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
            float sd = textureLod(tDepth, uv, 0.0).r;
            if (sd < 0.99999) {
              float sceneZ = viewDepth(sd);
              float rayZ = c.w;
              float th = max(0.25, t * 0.08);
              if (rayZ > sceneZ && rayZ - sceneZ < th) {
                // refine
                float a = prevT, b = t;
                for (int k = 0; k < 5; k++) {
                  float m = 0.5 * (a + b);
                  vec4 cm = uViewProj * vec4(S + R * m, 1.0);
                  vec2 um = cm.xy / cm.w * 0.5 + 0.5;
                  float zm = viewDepth(textureLod(tDepth, um, 0.0).r);
                  if (cm.w > zm) b = m; else a = m;
                }
                vec4 cb = uViewProj * vec4(S + R * b, 1.0);
                vec2 ub = cb.xy / cb.w * 0.5 + 0.5;
                vec2 edge = smoothstep(0.0, 0.06, ub) * smoothstep(1.0, 0.94, ub);
                return vec4(textureLod(tColor, ub, 0.0).rgb, edge.x * edge.y);
              }
            }
            prevT = t;
            t *= 1.45;
          }
          return vec4(0.0);
        }
        #endif

        // nearest Voronoi feature: (F1, F2) for the foam's bubble lace
        vec3 cellNearestW(vec2 p, out vec2 off, out vec2 id) {
          vec2 ip = floor(p), fp = fract(p);
          float best = 9.0, second = 9.0;
          off = vec2(0.0); id = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 r = g + hash22(ip + g) * 0.85 + 0.075 - fp;
            float d = dot(r, r);
            if (d < best) { second = best; best = d; id = ip + g; off = r; } else if (d < second) second = d;
          }
          return vec3(sqrt(best), sqrt(second), 0.0);
        }
        void main() {
          vec2 uv = vUv;
          float d = texture(tDepth, uv).r;
          vec3 base = texture(tColor, uv).rgb;
          bool skyPix = d >= 0.99999;
          vec3 P = worldAt(uv, skyPix ? 0.99999 : d);
          vec3 rd = normalize(P - uCamPos);
          float sceneDist = skyPix ? 1e7 : length(P - uCamPos);
          fragColor = vec4(base, 0.0);
          if (rd.y >= -1e-5) return;

          // the water here: at the ground point, or the open bay beyond the map
          float level, kind, vari, fetchN, distW;
          if (skyPix) { level = uTide; kind = 2.0; vari = 0.5; fetchN = 1.0; distW = 0.0; }
          else {
            vec2 lv = waterLevels(P.xz);
            vec4 wi = waterInfo(P.xz);
            level = lv.x; kind = wi.x; vari = wi.y; fetchN = wi.z; distW = wi.w;
          }
          if (level < -50.0) return;
          // the swash breathes at the sea's edge
          float swash = 0.0, swashRate = 0.0;
          // the ground under the pixel as the baked grid has it (independent of the mesh's level of detail)
          float gP = skyPix ? -30.0 : max(groundHeight(P.xz), P.y - 0.03);
          if (kind > 1.5 && kind < 2.5 && !skyPix) {
            float d0 = uTide - gP;
            swash = swashAt(P.xz, uTime, d0);
            swashRate = (swashAt(P.xz, uTime + 0.06, d0) - swash) / 0.06;
          }
          float lvl = level + swash;
          if (!skyPix && gP >= lvl) return;
          if (uCamPos.y <= lvl) return;
          float t = (lvl - uCamPos.y) / rd.y;
          vec3 S = uCamPos + rd * t;
          float vdepth = skyPix ? 30.0 : lvl - gP;                  // vertical depth over the ground point
          float thick = skyPix ? 1e4 : max(sceneDist - t, 0.0);     // path through the water
          float ground = skyPix ? lvl - 30.0 : groundHeight(S.xz);
          float depthS = max(lvl - ground, vdepth * 0.5);

          // ---- surface normal from the shared wave set
          float fp = max(length(fwidth(S.xz)), t * 0.0008);
          fp = min(fp, 4.0);
          float fetchM = fetchN * 60.0;
          if (kind > 2.5) fetchM = max(fetchM, 8.0);
          float gust = gustAt(S.xz, uTime);
          vec4 wg;
          if (kind > 2.5) {
            // creek water runs downstream and carries its ripples along: two copies of the pattern advected with the
            // flow over a 4 s cycle, each faded out while it is reset (a flow map; advecting by the clock alone would
            // shear the pattern a little more every second wherever the current turns)
            vec4 fl = texture(tFlow, fineUV(S.xz));
            vec2 vel = fl.rg * (0.12 + 0.25 * fl.b);
            float c0 = fract(uTime * 0.25), c1 = fract(uTime * 0.25 + 0.5);
            vec4 wA = waveGrad(S.xz - vel * c0 * 4.0, uTime, fp * 2.5, fetchM, depthS, gust);
            vec4 wB = waveGrad(S.xz - vel * c1 * 4.0 + vec2(3.7, -5.1), uTime, fp * 2.5, fetchM, depthS, gust);
            float wb = abs(1.0 - 2.0 * c0);
            wg = mix(wA, wB, wb);
            // two uncorrelated patterns averaged lose some contrast: give it back
            wg.yz *= inversesqrt(sq(1.0 - wb) + sq(wb));
          } else wg = waveGrad(S.xz, uTime, fp * 2.5, fetchM, depthS, gust);
          // capillary texture riding on the gusts (too fine for the wave set)
          float capK = smoothstep(0.02, 0.003, fp) * gust * 0.5;
          vec2 cp = S.xz * 38.0 + uWind.xy * uTime * 6.0;
          vec4 c0 = vnoise4(cp), c1 = vnoise4(cp + vec2(0.37, 0.0)), c2 = vnoise4(cp + vec2(0.0, 0.37));
          vec2 capG = vec2(c1.x - c0.x, c2.x - c0.x) * capK * 0.12;
          // the edge of the water is calm (the ripples die in the last millimetres)
          float edgeCalm = smoothstep(0.0, 0.03, vdepth);
          vec2 grad = (wg.yz + capG) * edgeCalm;
          vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
          float sig2 = wg.w * edgeCalm + 0.00012 + capK * 0.0004;

          // ---- refraction: the ground seen through the water
          vec3 V = -rd;
          float cosI = max(dot(N, V), 1e-3);
          float F = fresnelWater(cosI);
          vec3 under = base;
          float thickR = thick;
          if (!skyPix) {
            // the bed point seen along the refracted ray, against the one along the flat-surface ray: their screen
            // positions differ by what the ripples bend the view by (millimetres in shallow water)
            vec3 T = refract(rd, N, 1.0 / 1.333), T0 = refract(rd, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
            float len = min(vdepth / max(-T0.y, 0.15), 1.5);
            vec4 c1 = uViewProj * vec4(S + T * len, 1.0), c0 = uViewProj * vec4(S + T0 * len, 1.0);
            vec2 uv2 = uv + (c1.xy / c1.w - c0.xy / c0.w) * 0.5;
            float d2 = texture(tDepth, uv2).r;
            vec3 P2 = worldAt(uv2, min(d2, 0.99999));
            if (d2 < 0.99999 && P2.y < lvl && all(greaterThan(uv2, vec2(0.0))) && all(lessThan(uv2, vec2(1.0)))) {
              under = texture(tColor, uv2).rgb;
              thickR = max(length(P2 - uCamPos) - t, 0.0);
            }
          }
          vec3 sigT, alb;
          waterOptics(kind, vari, sigT, alb);
          vec3 Tw = exp(-sigT * thickR);
          // light inside the water: sun through the surface and the sky, scattered back toward the eye
          vec3 Lw = -refract(-uSunDir, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
          float mu = dot(refract(rd, N, 1.0 / 1.333), Lw);
          vec3 down = uSunE * max(uSunDir.y, 0.0) * cloudShadow(S) * (0.6 * hgPhase(-mu, 0.75) * 4.0 * PI * 0.08 + 0.12) + envIrradiance(vec3(0.0, 1.0, 0.0)) * 0.55;
          vec3 inscat = alb * down * 0.11;
          vec3 body = under * Tw + inscat * (1.0 - Tw);

          // ---- reflection
          vec3 R = reflect(rd, N);
          R.y = max(R.y, 0.004 + abs(R.y) * 0.3);
          // the sky with its clouds, blurred by the ripples too small to resolve (their slope spread widens the cone
          // of reflected directions, and the clouds are filtered to it)
          float spread = sqrt(2.0 * sig2) * 1.6;
          vec3 refl = skyColor(R, false, max(length(fwidth(R)), max(spread, 5e-4)));
          #if SSR
          if (t < 400.0) {
            vec4 hit = ssrTrace(S, R);
            refl = mix(refl, hit.rgb, hit.a * 0.92);
          }
          #endif
          // sun: microfacet lobe widened by the unresolved ripples, then sparkles from the resolved ones
          float rs = clamp(sqrt(sqrt(2.0 * sig2)), 0.03, 0.6);
          float cs = cloudShadow(S);
          vec3 sunSpec = uSunE * cs * specGGX(N, V, uSunDir, rs, 0.02);
          vec3 Hh = normalize(uSunDir + V);
          vec2 gp = S.xz * 55.0 + uWind.xy * uTime * 1.5;
          vec2 gc = floor(gp);
          vec4 gh = hash24(gc + floor(uTime * 3.0) * 13.0);
          vec3 Ng = normalize(N + vec3(gh.x - 0.5, 0.0, gh.y - 0.5) * 0.06 * gust);
          float sparkle = pow(max(dot(Ng, Hh), 0.0), 3000.0) * step(0.55, gh.z) * smoothstep(0.35, 0.0, length(fract(gp) - 0.5)) * (1.0 - smoothstep(30.0, 90.0, t));
          sunSpec += uSunE * cs * sparkle * 25.0 * F;

          vec3 col = body * (1.0 - F) + refl * F + sunSpec;

          // ---- edges
          // the water thins to nothing at the shore; a faint bright meniscus line
          float edge = smoothstep(0.0, 0.0025, vdepth);
          float men = smoothstep(0.0, 0.002, vdepth) * (1.0 - smoothstep(0.002, 0.012, vdepth)) * (0.5 + 0.5 * vnoise(S.xz * 4.0));
          col += refl * men * 0.06;
          // swash: a thin line of foam on the advancing front (a reticulate lace of bubbles, broken into pieces),
          // a fading trail behind it, and thin white lines where the small waves trip on the bars offshore
          if (kind > 1.5 && kind < 2.5 && !skyPix) {
            float rising = smoothstep(0.0, 0.015, swashRate);
            float front = smoothstep(0.0, 0.0005, vdepth) * (1.0 - smoothstep(0.0008, 0.0035, vdepth)) * rising;
            float trail = smoothstep(0.0005, 0.002, vdepth) * (1.0 - smoothstep(0.002, 0.009, vdepth)) * (1.0 - rising) * 0.35;
            vec2 o2, i2;
            vec3 cb = cellNearestW(S.xz / 0.018, o2, i2);
            float bubbles = smoothstep(0.02, 0.12, cb.y - cb.x) * 0.7 + 0.3;
            float pieces = smoothstep(0.35, 0.6, fbm(S.xz * vec2(1.6, 0.7) + vec2(uTime * 0.05, 0.0), 3));
            float foam = sat((front + trail) * pieces * bubbles * 1.6);
            float crestLine = smoothstep(0.86, 0.99, sin(dot(S.xz, vec2(0.12, -1.58)) - uTime * 2.6 + 0.3 * sin(S.xz.x * 0.05)) * 0.5 + 0.5);
            float breaking = crestLine * smoothstep(0.015, 0.03, vdepth) * (1.0 - smoothstep(0.045, 0.1, vdepth)) * smoothstep(0.5, 0.75, fbm(S.xz * 0.3 + uTime * 0.05, 3));
            foam = max(foam, breaking * 0.5 * bubbles);
            vec3 foamC = (uSunE * max(uSunDir.y, 0.0) * cs * 0.75 + envIrradiance(vec3(0.0, 1.0, 0.0)) * 0.9) * 0.8;
            col = mix(col, foamC, foam * 0.85);
          }
          // drifting flecks on the pools and in the creeks
          // (tiny: a few millimetres, a few per square metre, only near the eye)
          vec2 fc = S.xz * 60.0 - uWind.xy * uTime * 1.2;
          vec4 fh = hash24(floor(fc) + 17.0);
          float fleck = step(0.985, fh.x) * smoothstep(0.32, 0.18, length(fract(fc) - 0.5 - (fh.yz - 0.5) * 0.4)) * (1.0 - smoothstep(3.0, 9.0, t));
          col = mix(col, vec3(0.5, 0.48, 0.42) * (uSunE * uSunDir.y * 0.3 + envIrradiance(vec3(0.0, 1.0, 0.0))) * 0.5, fleck * 0.6 * (kind < 1.5 || kind > 2.5 ? 1.0 : 0.3));

          col = aerial(col, t, rd);
          col = mix(base, col, skyPix ? 1.0 : edge);
          // alpha: this pixel is water (TAA keeps less history here: the surface moves every frame)
          fragColor = vec4(col, skyPix ? 0.6 : edge);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setEnv(env: Texture, envHeight: number): void {
    (this.material.uniforms.uEnv as IUniform<Texture>).value = env;
    const d = cubeUVDefines(envHeight);
    let changed = false;
    for (const [k, v] of Object.entries(d)) if (this.material.defines[k] !== v) { this.material.defines[k] = v; changed = true; }
    if (changed) this.material.needsUpdate = true;
  }

  render(gl: WebGLRenderer, input: WebGLRenderTarget, output: WebGLRenderTarget | null, camera: PerspectiveCamera): void {
    const u = this.material.uniforms;
    u.tColor.value = input.texture;
    u.tDepth.value = input.depthTexture;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.uViewProj.value.copy(this.viewProj);
    (u.uCamPos.value as Vector3).setFromMatrixPosition(camera.matrixWorld);
    (u.uRes.value as Vector2).set(input.width, input.height);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    gl.setRenderTarget(output);
    this.quad.render(gl);
  }
}
