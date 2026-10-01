// Subtle volumetric light shafts: a few depth-layered additive slabs parallel
// to the front glass. Each slab integrates the same animated caustic field
// that lights the gravel, sampled along the key-light direction from the
// surface, so shafts and floor caustics stay physically correlated.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { U } from '../render/SharedUniforms.js';
import { underwaterCommon, noiseCommon } from '../fish/shaders/common.glsl.js';

export class LightShafts {
  constructor(scene, layers = [-0.16, -0.06, 0.04, 0.13]) {
    this.group = new THREE.Group();
    this.group.name = 'lightShafts';
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uIntensity: { value: 0.0025 },
        uCaustics: U.uCaustics,
        uCausticParams: U.uCausticParams,
        uCausticLightDir: U.uCausticLightDir,
        uWaterMin: U.uWaterMin,
        uWaterMax: U.uWaterMax,
        uWaterAbsorb: U.uWaterAbsorb,
        uWaterScatter: U.uWaterScatter,
        uWaterDensity: U.uWaterDensity,
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vW;
        ${noiseCommon}
        ${underwaterCommon}
        void main() {
          float depth = uCausticParams.z - vW.y;
          vec3 L = uCausticLightDir;
          // trace back to the surface along the light: where did this light enter?
          vec2 ps = vW.xz + L.xz * (depth / max(0.2, L.y));
          // broad, soft rays: the in-water glow is the caustic field blurred
          // over the extent of the LED bar (high mip levels), never thin streaks
          float c = 0.0;
          for (int i = 0; i < 3; i++) {
            vec2 uv = (ps + vec2(float(i) * 0.012, 0.0)) / uCausticParams.x;
            c += textureLod(uCaustics, uv, 3.2 + float(i) * 0.5).r;
          }
          c = c / 3.0;
          float shafts = spow(clamp(c / 0.16, 0.0, 3.0), 1.5);
          // slow large-scale variation (the surface ripples drift)
          shafts *= 0.6 + 0.4 * vnoise2(vW.xz * 6.0 + vec2(uTime * 0.05, 0.0));
          float fade = exp(-depth * 6.0) * smoothstep(0.0, 0.04, depth) * smoothstep(0.0, 0.08, vW.y);
          float edge = smoothstep(0.0, 0.06, ${(TANK.L / 2).toFixed(3)} - abs(vW.x));
          vec3 col = vec3(0.85, 0.95, 1.0) * shafts * fade * edge * uIntensity;
          // additive layer: apply only the transmittance (no extra in-scatter fog)
          col *= exp(-uWaterAbsorb * waterPath(vW) * uWaterDensity);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    for (const z of layers) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TANK.L, TANK.water), this.material);
      m.position.set(0, TANK.water / 2, z);
      m.renderOrder = 4;
      m.frustumCulled = false;
      this.group.add(m);
    }
    scene.add(this.group);
  }
}
