// スクリーン空間の水面パス
// 深度バッファから各画素の視線と水平な水面の交点を求め、
// 屈折（揺らぎ）・水の厚みによる吸収と散乱・空の反射・太陽のきらめきを合成する。
// 出力の alpha にはカメラからの距離を書き込み、後段の被写界深度で使う。
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { NOISE_GLSL } from './shaders.js';

export class WaterPass extends Pass {
  constructor(camera, world) {
    super();
    this.camera = camera;
    this.world = world;
    this.uniforms = {
      tColor: { value: null },
      tDepth: { value: null },
      tNormal: { value: world.waveNormal },
      tEnv: { value: null },
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uWater: world.uniforms.uWater,
      uTime: world.uniforms.uTime,
      uSunDir: world.uniforms.uSunDir,
      uSunCol: world.uniforms.uSunCol,
      uSunUp: world.uniforms.uSunUp,
      uAmbient: world.uniforms.uAmbient,
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0 },
      uWaterCol: { value: new THREE.Color(0.15, 0.22, 0.17) },
      uAbsorb: { value: new THREE.Vector3(0.05, 0.02, 0.028) },
      uScatter: { value: 0.016 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uEnvI: { value: 1.0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tNormal;
        uniform samplerCube tEnv;
        uniform mat4 uProjInv, uCamWorld;
        uniform vec3 uCamPos, uSunDir, uSunCol, uFogColor, uWaterCol, uAbsorb;
        uniform float uWater, uTime, uSunUp, uAmbient, uFogDensity, uScatter, uEnvI;
        uniform vec2 uRes;
        varying vec2 vUv;
        ${NOISE_GLSL}

        vec3 worldPos(vec2 uv, float d){
          vec4 c = vec4(uv*2.0-1.0, d*2.0-1.0, 1.0);
          vec4 v = uProjInv * c; v /= v.w;
          return (uCamWorld * v).xyz;
        }
        vec2 nrm(vec2 p){ return texture2D(tNormal, p).xy*2.0-1.0; }

        vec3 waterNormal(vec2 p, float dist){
          // 風の強弱によるさざ波の粗密（スリック）
          float gust = smoothstep(-0.4, 0.6, snoise(p*0.035 + uTime*vec2(0.012, 0.008)));
          vec2 s = nrm(p*0.05 + uTime*vec2(0.011, 0.006))*0.5;
          s += nrm(p*0.13 + uTime*vec2(-0.017, 0.012))*0.35;
          s += nrm(p*0.37 + uTime*vec2(0.035, -0.027))*0.25 * (1.0-smoothstep(10.0, 45.0, dist));
          s += nrm(p*0.9 + uTime*vec2(-0.05, 0.04))*0.08 * (1.0-smoothstep(3.0, 16.0, dist));
          float amp = mix(0.05, 0.2, gust);
          return normalize(vec3(-s.x*amp, 1.0, -s.y*amp));
        }

        void main(){
          vec2 uv = vUv;
          float d = texture2D(tDepth, uv).r;
          vec3 base = texture2D(tColor, uv).rgb;
          bool sky = d >= 0.99999;
          vec3 P = worldPos(uv, sky ? 0.9999 : d);
          vec3 rd = normalize(P - uCamPos);
          float sceneDist = sky ? 1e5 : length(P - uCamPos);
          vec3 col = base;
          float outDist = sceneDist;

          if (uCamPos.y > uWater && rd.y < -1e-5) {
            float t = (uWater - uCamPos.y) / rd.y;
            if (t < sceneDist) {
              vec3 S = uCamPos + rd * t;
              vec3 N = waterNormal(S.xz, t);

              // 屈折：水の厚みに比例して底の像を揺らす（水面より上の物は引き込まない）
              float thick0 = min(sceneDist - t, 30.0);
              vec2 off = N.xz * 0.9 * min(thick0, 2.5) / max(t, 1.0);
              off *= smoothstep(0.0, 0.08, thick0);
              vec2 uv2 = uv + off;
              float d2 = texture2D(tDepth, uv2).r;
              bool sky2 = d2 >= 0.99999;
              vec3 P2 = worldPos(uv2, sky2 ? 0.9999 : d2);
              if (P2.y > uWater || any(lessThan(uv2, vec2(0.0))) || any(greaterThan(uv2, vec2(1.0)))) { uv2 = uv; P2 = P; sky2 = sky; }
              vec3 refr = texture2D(tColor, uv2).rgb;
              float thick = sky2 ? 1e4 : max(length(P2 - uCamPos) - t, 0.0);

              // 吸収と散乱（浅い干潟の水はほぼ透明、厚みが増すと緑がかる）
              vec3 T = exp(-uAbsorb * thick);
              float sc = 1.0 - exp(-uScatter * thick);
              vec3 inscatter = uWaterCol * (0.3 + 0.7*uSunUp) * uAmbient;
              vec3 under = refr * T + inscatter * sc;

              // 反射（空の環境マップ）とフレネル
              vec3 R = reflect(rd, N);
              R.y = abs(R.y);
              vec3 env = min(textureCube(tEnv, R).rgb * uEnvI, vec3(2.0));   // 太陽円盤はきらめき項で扱う
              float cosT = clamp(dot(-rd, N), 0.0, 1.0);
              float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

              // 太陽のきらめき（細かな面が太陽を映す）
              vec3 H = normalize(uSunDir - rd);
              float nh = max(dot(N, H), 0.0);
              float glint = pow(nh, 6000.0) * 45.0 + pow(nh, 900.0) * 0.25;
              vec3 spec = uSunCol * glint * F * uSunUp;

              col = mix(under, env, F) + spec;

              // 汀線：ごく薄い水の縁のきらめきと小さな泡
              float vdepth = uWater - P.y;
              float rim = smoothstep(0.0, 0.004, vdepth) * (1.0 - smoothstep(0.004, 0.025, vdepth));
              rim *= smoothstep(-0.2, 0.5, snoise(S.xz*3.0 + uTime*0.1));
              col += env * rim * 0.035;
              float bub = smoothstep(0.86, 0.97, snoise(S.xz*14.0 + uTime*vec2(0.05, 0.03))) * (1.0 - smoothstep(0.0, 0.06, vdepth)) * smoothstep(0.0, 0.004, vdepth);
              col = mix(col, vec3(0.85) * (0.4 + 0.6*uSunUp) * uAmbient, bub * 0.55);
              // 水面に浮かぶ微細な浮遊物
              float speck = smoothstep(0.93, 0.99, snoise(S.xz*9.0 + uTime*vec2(0.04, 0.025))) * smoothstep(0.02, 0.2, vdepth) * (1.0 - smoothstep(4.0, 14.0, t));
              col = mix(col, vec3(0.75, 0.72, 0.62) * uAmbient, speck * 0.25);

              // 霧（遠くの海面）
              float fogF = 1.0 - exp(-pow(uFogDensity * t, 2.0));
              col = mix(col, uFogColor, fogF);
              if (sky) outDist = t;
            }
          }
          gl_FragColor = vec4(col, outDist);
        }`,
    });
    this.material = material;
    this.fsQuad = new FullScreenQuad(material);
  }

  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms, cam = this.camera;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.tEnv.value = this.world.envCube;
    u.uProjInv.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.uFogColor.value.copy(this.world.scene.fog.color);
    u.uFogDensity.value = this.world.scene.fog.density;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
