// 被写界深度（マクロレンズ風）と仕上げの色調
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 入力の alpha にカメラからの距離が入っている前提（WaterPass が書き込む）
export function makeDOFPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFocus: { value: 10 },
      uAperture: { value: 8 },
      uMaxBlur: { value: 12 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus, uAperture, uMaxBlur;
      varying vec2 vUv;
      float coc(float dist){ return clamp(abs(dist - uFocus) / max(dist, 1e-3) * uAperture, 0.0, uMaxBlur); }
      void main(){
        vec4 c0 = texture2D(tDiffuse, vUv);
        float cc = coc(c0.a);
        vec3 acc = c0.rgb; float wsum = 1.0;
        const int N = 40;
        float maxR = uMaxBlur;
        for (int i = 0; i < N; i++) {
          float fi = float(i) + 0.5;
          float r = sqrt(fi / float(N)) * maxR;
          float a = fi * 2.39996323;
          vec2 o = vec2(cos(a), sin(a)) * r / uRes;
          vec4 s = texture2D(tDiffuse, vUv + o);
          float sc = coc(s.a);
          // 手前のボケは広がり、奥のボケは手前の合焦部に滲まない
          float size = s.a > c0.a ? min(sc, cc * 2.0 + 0.5) : sc;
          float w = smoothstep(r - 1.0, r + 0.5, size);
          acc += s.rgb * w; wsum += w;
        }
        gl_FragColor = vec4(acc / wsum, c0.a);
      }`,
  });
}

export function makeGradePass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 q = vUv - 0.5;
        // わずかな色収差
        vec2 ca = q * 0.0016;
        vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.06);
        c *= 1.0 - dot(q, q) * 0.45;
        // フィルムグレイン
        float g = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        c += g * 0.012 * (0.3 + l);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
