// Final pass: macro depth of field, mip-chain bloom, exposure, ACES filmic tone mapping, a light
// colour grade, vignette, sRGB and dither.
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
      uDepth: { value: null },
      uExposure: { value: 1.0 },
      uBloom: { value: 0.3 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.001 },
      uFar: { value: 20 },
      uFocus: { value: 0.2 },        // focus distance (m)
      uDofK: { value: 0.0 },         // circle of confusion (px) per dioptre of defocus; 0 = off
      uDofMax: { value: 14.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform sampler2D uDepth;
      uniform float uExposure;
      uniform float uBloom;
      uniform vec2 uRes;
      uniform float uNear, uFar, uFocus, uDofK, uDofMax, uTime;
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
      float viewDist(vec2 uv) {
        float z = texture(uDepth, uv).r;
        return uNear * uFar / (uFar - z * (uFar - uNear));
      }
      float coc(float d) { return min(uDofK * abs(1.0 / uFocus - 1.0 / max(d, 1e-4)), uDofMax); }
      void main() {
        vec3 c = texture(uTex, vUv).rgb;
        if (uDofK > 0.0) {
          float d0 = viewDist(vUv);
          float c0 = coc(d0);
          if (c0 > 0.6) {
            // gather over a Vogel disk; a tap only counts if its own blur reaches the centre and nearer taps
            // win, so sharp objects do not smear over a blurred background
            vec3 acc = c; float wsum = 1.0;
            float ang0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
            const int N = 28;
            for (int i = 0; i < N; i++) {
              float fi = float(i) + 0.5;
              float r = sqrt(fi / float(N)) * c0;
              float a = fi * 2.39996323 + ang0;
              vec2 o = vec2(cos(a), sin(a)) * r / uRes;
              float di = viewDist(vUv + o);
              float ci = coc(di);
              float w = smoothstep(r - 1.0, r + 0.5, ci) * (di < d0 ? 1.0 : smoothstep(r - 1.0, r + 0.5, c0));
              acc += textureLod(uTex, vUv + o, clamp(log2(c0 / 5.0), 0.0, 3.0)).rgb * w;
              wsum += w;
            }
            c = acc / wsum;
          }
        }
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
        // gentle grade: a touch of warmth in the highlights, cooler shadows
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c * vec3(0.97, 1.0, 1.03), c * vec3(1.03, 1.0, 0.95), smoothstep(0.2, 0.8, l));
        vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        c *= mix(0.74, 1.0, smoothstep(1.15, 0.3, length(q)));
        c = toSRGB(c);
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0, vec2(0.06711056, 0.00583715))));
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
