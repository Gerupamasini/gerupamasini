// Animated, tileable caustic pattern rendered into a small texture every frame
// (one full-screen pass at 512²) and sampled by every underwater material
// (projected along the light direction, blurred with depth via mip levels).
// The pattern is the classic iterated-trig "water caustic" (tileable), which
// produces the sharp bright filaments of light focused by surface ripples.

import * as THREE from 'three';
import { U } from '../render/SharedUniforms.js';

const vert = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
in vec2 vUv;
uniform float uTime;
uniform float uSharp;
#define TAU 6.28318530718
float spow(float x, float y) { return x <= 0.0 ? 0.0 : exp2(max(y * log2(x), -120.0)); }
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 5.0;
  c = 1.17 - spow(max(c, 1e-6), 1.4);
  return spow(max(abs(c), 1e-6), uSharp);
}
void main() {
  float t = uTime * 0.45 + 23.0;
  float c = caustic(vUv, t);
  // slow large-scale modulation (surface ripple groups) keeps it from looking tiled
  float m = 0.75 + 0.25 * sin(vUv.x * 6.2831 + uTime * 0.21) * sin(vUv.y * 6.2831 - uTime * 0.17);
  gl_FragColor = vec4(vec3(clamp(c * m, 0.0, 4.0)), 1.0);
}
`;

export class Caustics {
  constructor(renderer, size = 512) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.RepeatWrapping;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 }, uSharp: { value: 8.0 } },
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    U.uCaustics.value = this.rt.texture;
    this.enabled = true;
    this.speed = 1;
  }

  update(time) {
    if (!this.enabled) return;
    this.material.uniforms.uTime.value = time * this.speed;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
  }
}
