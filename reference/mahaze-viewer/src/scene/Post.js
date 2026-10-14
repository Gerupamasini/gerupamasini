// Final pass: mip-chain bloom, exposure, ACES filmic tone mapping, vignette, sRGB + dither.
import * as THREE from 'three';

export function createPost() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const material = new THREE.ShaderMaterial({
    name: 'PostTonemap',
    uniforms: {
      uTex: { value: null },
      uExposure: { value: 1.0 },
      uBloom: { value: 0.35 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform float uExposure;
      uniform float uBloom;
      uniform vec2 uRes;
      varying vec2 vUv;
      vec3 rrtOdt(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }
      vec3 acesFitted(vec3 c) {
        const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        return clamp(outM * rrtOdt(inM * c), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      void main() {
        vec3 c = texture(uTex, vUv).rgb;
        vec3 bloom = vec3(0.0);
        float w = 0.0;
        for (int i = 2; i <= 7; i++) {
          float lod = float(i);
          float k = 1.0 / (1.0 + lod * 0.5);
          bloom += max(textureLod(uTex, vUv, lod).rgb - 0.9, 0.0) * k;
          w += k;
        }
        c += bloom / w * uBloom;
        c *= uExposure;
        c = acesFitted(c);
        vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        c *= mix(0.72, 1.0, smoothstep(1.15, 0.3, length(q)));
        c = toSRGB(c);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        c += (n - 0.5) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, camera, material };
}
