// Photographic lens passes:
//  * DOFPass   — thin-lens depth of field from the scene depth buffer,
//                single-pass golden-angle "scatter-as-gather" bokeh (after
//                D. Gustafsson 2018) with foreground/background leak guards.
//  * LensPass  — lateral chromatic aberration, natural vignetting and
//                luminance-weighted film grain, applied to the linear HDR
//                image before tone mapping.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const quadVS = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class DOFPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.focus = 1.0; // metres
    this.fStop = 2.8; // relative aperture of the virtual lens
    this.maxBlur = 0.011; // max circle of confusion, fraction of image height
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.01 },
        uFar: { value: 30 },
        uFocus: { value: 1 },
        uCoC: { value: 10 },
        uMaxBlur: { value: 12 },
        uDebug: { value: 0 },
      },
      vertexShader: quadVS,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uNear, uFar, uFocus, uCoC, uMaxBlur, uDebug;
        float linZ(vec2 uv) {
          float d0 = texture(tDepth, uv).x;
          // nothing opaque was drawn here (the void behind a studio fish):
          // whatever covers the pixel is translucent (thin distal fin
          // membrane, which keeps no depth of its own) or a uniform
          // background, so it is treated as lying in the focal plane instead
          // of at infinity (fins would otherwise smear with maximum blur)
          if (d0 >= 0.999999) return uFocus;
          float d = d0 * 2.0 - 1.0;
          return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear));
        }
        // thin lens: blur diameter ~ |1 - focus / z| (pixels)
        float coc(float z) { return min(uCoC * abs(1.0 - uFocus / z), uMaxBlur); }
        const float GOLDEN = 2.39996323;
        void main() {
          vec3 c0 = texture(tDiffuse, vUv).rgb;
          float z0 = linZ(vUv);
          float s0 = coc(z0);
          if (uDebug > 0.5) { outColor = vec4(fract(z0 * 4.0), s0 / uMaxBlur, texture(tDepth, vUv).x, 1.0); return; }
          vec3 acc = c0;
          float tot = 1.0;
          float radius = 0.75;
          float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
          for (int i = 0; i < 72; i++) {
            if (radius >= uMaxBlur) break;
            vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * radius;
            vec3 c = texture(tDiffuse, tc).rgb;
            float z = linZ(tc);
            float s = coc(z);
            // sharp background must not bleed over a focused / nearer centre
            if (z > z0) s = min(s, s0 * 2.0);
            float m = smoothstep(radius - 0.5, radius + 0.5, s);
            acc += mix(acc / tot, c, m);
            tot += 1.0;
            radius += 1.35 / radius;
            ang += GOLDEN;
          }
          // highlight shoulder on the HDR signal before the glare pass: extreme
          // values (specular sparkles, the LED) are soft-limited so they bloom
          // as small glints instead of long saturated streaks
          vec3 o = acc / tot;
          float pk = max(o.r, max(o.g, o.b));
          const float K = 5.0, W = 8.0;
          if (pk > K) o *= (K + (pk - K) / (1.0 + (pk - K) / W)) / pk;
          outColor = vec4(o, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    const h = readBuffer.height;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uTexel.value.set(1 / readBuffer.width, 1 / h);
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uFocus.value = Math.max(0.02, this.focus);
    // thin lens on a 35 mm-equivalent frame (24 mm high): focal length from
    // the field of view, blur circle at infinity c = f^2 / (N (z_f - f))
    const fovK = 1 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    const fmm = 12 * fovK;
    const zf = Math.max(this.focus * 1000, fmm * 1.5);
    u.uCoC.value = ((fmm * fmm) / (this.fStop * (zf - fmm) * 24)) * h;
    u.uMaxBlur.value = Math.max(1, this.maxBlur * h);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

export class LensPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uCA: { value: 0.0005 },
        uVignette: { value: 0.18 },
        uGrain: { value: 0.012 },
      },
      vertexShader: quadVS,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        uniform sampler2D tDiffuse;
        uniform vec2 uRes;
        uniform float uTime, uCA, uVignette, uGrain;
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec2 d = vUv - 0.5;
          d.x *= uRes.x / uRes.y;
          float r2 = dot(d, d);
          // lateral chromatic aberration grows toward the frame edge
          vec2 off = (vUv - 0.5) * r2 * uCA * 4.0;
          vec3 col = vec3(texture(tDiffuse, vUv - off).r, texture(tDiffuse, vUv).g, texture(tDiffuse, vUv + off).b);
          // natural vignetting (cos^4 falloff of a real lens)
          float c = 1.0 / (1.0 + r2 * 1.6);
          col *= mix(1.0, c * c, uVignette);
          // fine sensor noise on the linear signal: photon shot noise grows with
          // sqrt(signal) (relatively strongest in the shadows) plus a small read
          // noise floor; mostly luminance with a weak chroma part, per pixel and frame
          vec2 fc = gl_FragCoord.xy + fract(uTime * 7.31) * 173.0;
          float g = hash(fc) + hash(fc * 1.37 + 19.1) - 1.0;
          vec3 gc = vec3(hash(fc + 3.7), hash(fc + 11.3), hash(fc + 29.9)) - 0.5;
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float sigma = uGrain * sqrt(max(lum, 0.0) + 0.0015);
          col += (vec3(g) * 0.85 + gc * 0.5) * sigma;
          outColor = vec4(max(col, 0.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer, dt) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uRes.value.set(readBuffer.width, readBuffer.height);
    u.uTime.value += dt || 1 / 60;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}
