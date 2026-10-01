// Translucent fins as their own image layer.
//
// A fin membrane is a thin, mostly transparent sheet. Composited straight into
// the scene, the lens can only give the pixel one depth: either the fin's
// (the plants seen through it then stay as sharp as the fin, a green hatching
// on the dorsal) or the background's (the fin smears into a ghost). Fins
// therefore render into a separate premultiplied layer that shares the scene
// depth (so bodies, plants and rocks still occlude them) and records the depth
// of the nearest fin. The opaque scene gets its depth of field from its own
// depth; the fin layer is blurred by the fin depth (scatter-as-gather bounded
// by a dilated blur radius, so in-focus fins cost a handful of taps) and laid
// over it: background through a fin blurs with the background, the fin with
// the fin, and a blurred fin in front of a sharp head no longer blurs the
// head beneath it.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const quadVS = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Replaces RenderPass: the scene without fin colour (its shadow maps still
 * include the fins) into the composer buffer, then the fins (layer
 * `finLayer`) into `finRT` over a copy of the scene depth.
 */
export class SceneLayersPass extends Pass {
  constructor(scene, camera, finLayer, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.finLayer = finLayer;
    this.needsSwap = false;
    this.finRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.finRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.sceneDepth = null;
    this._suppress = false;
    this._clear = new THREE.Color();
    this._copyZ = new FullScreenQuad(
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { tDepth: { value: null } },
        vertexShader: quadVS,
        fragmentShader: /* glsl */ `
          precision highp float;
          in vec2 vUv;
          out vec4 outColor;
          uniform sampler2D tDepth;
          void main() { gl_FragDepth = texture(tDepth, vUv).x; outColor = vec4(0.0); }
        `,
        depthTest: true,
        depthFunc: THREE.AlwaysDepth,
        depthWrite: true,
        colorWrite: false,
      }),
    );
  }

  setSize(w, h) {
    this.finRT.setSize(w, h);
  }

  setSamples(n) {
    if (this.finRT.samples !== n) {
      this.finRT.samples = n;
      this.finRT.dispose();
    }
  }

  // Scene depth into the fin layer: a full-screen pass writing the resolved
  // depth (a multisampled-to-multisampled blit is not allowed in WebGL 2).
  // Every sample of a pixel gets the same depth, so a fin passing behind a
  // body silhouette is cut on whole pixels.
  _copyDepth(renderer, src) {
    this._copyZ.material.uniforms.tDepth.value = src.depthTexture;
    this._copyZ.render(renderer);
  }

  // Fin meshes stay visible to the scene pass, so that the shadow maps
  // (rendered inside it) include them, but draw nothing there: their draw
  // range is emptied just before the draw call and restored right after.
  _hook(o) {
    if (o.userData.finLayerHooked) return;
    o.userData.finLayerHooked = true;
    const pass = this;
    const before = o.onBeforeRender;
    const after = o.onAfterRender;
    let saved = 0;
    o.onBeforeRender = function (...args) {
      before.apply(this, args);
      if (pass._suppress) {
        saved = args[3].drawRange.count;
        args[3].drawRange.count = 0;
      }
    };
    o.onAfterRender = function (...args) {
      if (pass._suppress) args[3].drawRange.count = saved;
      after.apply(this, args);
    };
  }

  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera } = this;
    const finBit = 1 << this.finLayer;
    const mask = camera.layers.mask;
    const sm = renderer.shadowMap;
    const smAuto = sm.autoUpdate;
    const autoClear = renderer.autoClear;
    scene.traverse((o) => {
      // lights must also pass the layer test of the fin-only camera
      if (o.isLight) o.layers.enable(this.finLayer);
      else if (o.isMesh && (o.layers.mask & finBit) !== 0) this._hook(o);
    });

    // 1. the scene (and the shadow maps, fins included) without fin colour
    camera.layers.mask = mask | finBit;
    this._suppress = true;
    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    renderer.render(scene, camera);
    this._suppress = false;
    this.sceneDepth = readBuffer.depthTexture;

    // 2. the fins over the scene depth, onto transparent black (premultiplied)
    renderer.getClearColor(this._clear);
    const clearA = renderer.getClearAlpha();
    const bg = scene.background;
    scene.background = null;
    sm.autoUpdate = false;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.finRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    this._copyDepth(renderer, readBuffer);
    camera.layers.mask = finBit;
    renderer.render(scene, camera);

    scene.background = bg;
    renderer.setClearColor(this._clear, clearA);
    renderer.autoClear = autoClear;
    camera.layers.mask = mask;
    sm.autoUpdate = smAuto;
  }

  dispose() {
    this.finRT.dispose();
    this._copyZ.material.dispose();
    this._copyZ.dispose();
  }
}

const finDepthGLSL = /* glsl */ `
uniform sampler2D tFin;
uniform sampler2D tFinDepth;
uniform sampler2D tSceneDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uFocus, uCoC, uMaxBlur;
float linZ(float d0) {
  float d = d0 * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - d * (uFar - uNear));
}
// blur diameter (pixels) of the fin at uv; -1 where the layer is empty. A
// partly covered edge pixel whose depth sample landed on the scene behind
// gets 0: it stays in place rather than spreading at the background's blur.
float finCoC(vec2 uv, float a) {
  if (a < 0.003) return -1.0;
  float fd = texture(tFinDepth, uv).x;
  if (fd >= texture(tSceneDepth, uv).x - 1e-7) return 0.0;
  return min(uCoC * abs(1.0 - uFocus / linZ(fd)), uMaxBlur);
}
const float GOLDEN = 2.39996323;
`;

/**
 * Blurs the fin layer by its own depth and lays it over the scene (after the
 * scene's depth of field). A half-resolution pre-pass finds the largest fin
 * blur circle reaching each texel, which bounds the gather radius.
 */
export class FinCompositePass extends Pass {
  constructor(layers, dof) {
    super();
    this.layers = layers;
    this.dof = dof;
    this.dilRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const common = () => ({
      tFin: { value: null },
      tFinDepth: { value: null },
      tSceneDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.01 },
      uFar: { value: 30 },
      uFocus: { value: 1 },
      uCoC: { value: 10 },
      uMaxBlur: { value: 12 },
    });
    this.dilMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: common(),
      vertexShader: quadVS,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        ${finDepthGLSL}
        void main() {
          float a0 = texture(tFin, vUv).a;
          float R = max(finCoC(vUv, a0), 0.0);
          float amax = a0;
          float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
          for (int i = 0; i < 28; i++) {
            float r = sqrt((float(i) + 0.5) / 28.0) * (uMaxBlur + 1.5);
            vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * r;
            float a = texture(tFin, tc).a;
            float s = finCoC(tc, a);
            // only blur circles that actually reach this texel
            if (s >= r - 1.5) R = max(R, s);
            amax = max(amax, a);
            ang += GOLDEN;
          }
          // own blur of the fin here (the composite reads it from this
          // texture: it writes into the buffer that holds the scene depth);
          // empty texels hold the dilated blur, so that filtering at a fin
          // edge never underestimates the blur of the fin (that would eat
          // into the edge)
          float s0 = finCoC(vUv, a0);
          outColor = vec4(R, amax, s0 < 0.0 ? R : s0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...common(), tDiffuse: { value: null }, tDil: { value: null }, uBlur: { value: 1 } },
      vertexShader: quadVS,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 outColor;
        uniform sampler2D tDiffuse;
        uniform sampler2D tDil;
        uniform float uBlur;
        ${finDepthGLSL}
        // non-finite fin samples (grazing fragments) are dropped, never smeared
        bool bad(vec4 c) { return any(isnan(c)) || any(isinf(c)) || !(c.r + c.g + c.b + c.a > -1.0); }
        void main() {
          vec3 sc = texture(tDiffuse, vUv).rgb;
          vec4 f0 = texture(tFin, vUv);
          if (bad(f0)) f0 = vec4(0.0);
          vec2 dil = uBlur > 0.5 ? texture(tDil, vUv).rg : vec2(0.0);
          float R = dil.x;
          vec4 fin = f0;
          if (R >= 0.75 && dil.y > 0.002) {
            vec4 acc = f0;
            float tot = 1.0;
            float radius = 0.75;
            float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
            for (int i = 0; i < 64; i++) {
              if (radius >= R) break;
              vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uTexel * radius;
              vec4 c = texture(tFin, tc);
              if (bad(c)) c = vec4(0.0);
              // the empty layer around a blurred fin is transparent, always counted
              float s = c.a < 0.003 ? R : texture(tDil, tc).b;
              float m = smoothstep(radius - 0.5, radius + 0.5, s);
              acc += mix(acc / tot, c, m);
              tot += 1.0;
              radius += 1.35 / radius;
              ang += GOLDEN;
            }
            fin = acc / tot;
          }
          vec3 o = sc * (1.0 - clamp(fin.a, 0.0, 1.0)) + max(fin.rgb, 0.0);
          // same highlight shoulder as the depth of field pass
          float pk = max(o.r, max(o.g, o.b));
          const float K = 5.0, W = 8.0;
          if (pk > K) o *= (K + (pk - K) / (1.0 + (pk - K) / W)) / pk;
          outColor = vec4(o, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.dilQuad = new FullScreenQuad(this.dilMat);
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.dilRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  _uniforms(u, readBuffer) {
    const L = this.layers;
    const du = this.dof.material.uniforms;
    u.tFin.value = L.finRT.texture;
    u.tFinDepth.value = L.finRT.depthTexture;
    // (not bound for the composite: it renders into the target holding it)
    u.tSceneDepth.value = u === this.dilMat.uniforms ? L.sceneDepth : null;
    u.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    u.uNear.value = du.uNear.value;
    u.uFar.value = du.uFar.value;
    u.uFocus.value = du.uFocus.value;
    u.uCoC.value = du.uCoC.value;
    u.uMaxBlur.value = du.uMaxBlur.value;
  }

  render(renderer, writeBuffer, readBuffer) {
    // lens parameters as the depth of field pass set them this frame
    const blur = this.dof.enabled;
    if (blur) {
      this._uniforms(this.dilMat.uniforms, readBuffer);
      renderer.setRenderTarget(this.dilRT);
      this.dilQuad.render(renderer);
    }
    const u = this.material.uniforms;
    this._uniforms(u, readBuffer);
    u.tDiffuse.value = readBuffer.texture;
    u.tDil.value = this.dilRT.texture;
    u.uBlur.value = blur ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.dilRT.dispose();
    this.dilMat.dispose();
    this.material.dispose();
    this.dilQuad.dispose();
    this.quad.dispose();
  }
}
