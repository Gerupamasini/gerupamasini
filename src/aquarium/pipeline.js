// Frame pipeline:
//   1. opaque scene  -> sceneRT (HDR colour + depth texture)
//   2. water volume  -> volRT   (Beer-Lambert absorption, in-scattering, caustic light shafts
//                                shadowed by the tank light's shadow map)
//   3. volRT copied back into sceneRT's colour (its depth is kept)
//   4. transparent layer (water surface, glass, bubbles, specks) -> sceneRT, sampling volRT
//   5. bloom, grade, tone map -> screen
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TANK } from './config.js';
import { CAUSTIC_SAMPLE_GLSL } from './water.js';

export const LAYER_TRANSPARENT = 1;

const VOLUME_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
uniform float uNear; uniform float uFar;
uniform vec3 uSigmaA; uniform float uSigmaS; uniform vec3 uScatterCol; uniform vec3 uAmbient;
uniform vec3 uSunCol; uniform vec3 uSunDirW;   // direction light travels in air
uniform sampler2D uShadow; uniform mat4 uShadowMat; uniform float uShaft; uniform float uFrame;
uniform int uSteps;
varying vec2 vUv;
${CAUSTIC_SAMPLE_GLSL}

vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
float shadowAt(vec3 P){
  vec4 sc = uShadowMat * vec4(P, 1.0);
  sc.xyz /= sc.w;
  if (any(lessThan(sc.xyz, vec3(0.0))) || any(greaterThan(sc.xyz, vec3(1.0)))) return 1.0;
  float d = unpackRGBAToDepth(texture2D(uShadow, sc.xy));
  return step(sc.z - 0.002, d);
}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float c, float g){ float g2 = g*g; return (1.0 - g2) / (4.0*3.14159 * pow(1.0 + g2 - 2.0*g*c, 1.5)); }

void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  float dz = texture2D(tDepth, vUv).x;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0);
  vp.xyz /= vp.w;
  vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
  vec3 rd = normalize(wp - uCamPos);
  float sceneT = dz >= 1.0 ? 1e6 : length(wp - uCamPos);
  vec2 hit = boxHit(uCamPos, rd, vec3(${(-TANK.w / 2).toFixed(4)}, 0.0, ${(-TANK.d / 2).toFixed(4)}), vec3(${(TANK.w / 2).toFixed(4)}, ${TANK.level.toFixed(4)}, ${(TANK.d / 2).toFixed(4)}));
  float t0 = max(hit.x, 0.0), t1 = min(hit.y, sceneT);
  if (t1 > t0) {
    float L = t1 - t0;
    vec3 sigmaT = uSigmaA + uSigmaS;
    vec3 Tr = exp(-sigmaT * L);
    // light traveling inside the water
    vec3 ld = refract(normalize(uSunDirW), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
    float phase = hg(dot(rd, ld), 0.55) * 4.0 * 3.14159 * 0.5 + 0.5;
    vec3 inscat = vec3(0.0);
    float jitter = ign(gl_FragCoord.xy + uFrame * 5.588238);
    float dt = L / float(uSteps);
    for (int i = 0; i < 64; i++){
      if (i >= uSteps) break;
      float t = t0 + (float(i) + jitter) * dt;
      vec3 P = uCamPos + rd * t;
      float depth = ${TANK.level.toFixed(4)} - P.y;
      vec3 atten = exp(-sigmaT * (t - t0)) * exp(-sigmaT * depth / max(-ld.y, 0.2));
      vec3 c = causticAt(P, 3.0);
      float sh = shadowAt(P);
      vec3 shaft = uSunCol * pow(c, vec3(1.6)) * sh * phase * uShaft;
      inscat += atten * (shaft + uAmbient) * uScatterCol * uSigmaS * dt;
    }
    col = col * Tr + inscat;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

class AquariumRenderPass extends Pass {
  constructor(renderer, scene, camera, { light, caustics, causticU, samples = 4 }) {
    super();
    this.scene = scene; this.camera = camera; this.light = light; this.caustics = caustics;
    this.needsSwap = true;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const depthTexture = new THREE.DepthTexture(size.x, size.y);
    depthTexture.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples, depthTexture });
    this.volRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.volume = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0 }, uFar: { value: 0 },
        uSigmaA: { value: new THREE.Vector3(0.5, 0.13, 0.09) }, uSigmaS: { value: 0.22 },
        uScatterCol: { value: new THREE.Color(0.55, 0.85, 0.95) }, uAmbient: { value: new THREE.Color(0.035, 0.09, 0.13) },
        uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunDirW: { value: new THREE.Vector3(0, -1, 0) },
        uShadow: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uShaft: { value: 0.3 }, uFrame: { value: 0 },
        uSteps: { value: 40 },
        ...causticU,
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: VOLUME_FRAG,
      depthTest: false, depthWrite: false,
    }));
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { t: { value: null } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }',
    }));
    this.frame = 0;
  }
  setSize(w, h) {
    this.sceneRT.setSize(w, h); this.volRT.setSize(w, h);
  }
  render(renderer, writeBuffer) {
    const cam = this.camera, scene = this.scene;
    const autoClear = renderer.autoClear;
    // 1. opaque
    cam.layers.set(0);
    renderer.setRenderTarget(this.sceneRT);
    renderer.autoClear = true;
    renderer.render(scene, cam);
    // 2. water volume
    const u = this.volume.material.uniforms;
    u.tColor.value = this.sceneRT.texture; u.tDepth.value = this.sceneRT.depthTexture;
    u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    const L = this.light;
    u.uSunCol.value.copy(L.color).multiplyScalar(L.intensity * 0.35);
    u.uSunDirW.value.copy(L.target.position).sub(L.position).normalize();
    u.uShadow.value = L.shadow.map ? L.shadow.map.texture : null;
    u.uShadowMat.value.copy(L.shadow.matrix);
    u.uFrame.value = this.frame++ % 64;
    renderer.setRenderTarget(this.volRT);
    if (this.debugNoVolume) { this.copy.material.uniforms.t.value = this.sceneRT.texture; this.copy.render(renderer); } else this.volume.render(renderer);
    // 3. back into sceneRT, keeping its depth
    renderer.setRenderTarget(this.sceneRT);
    renderer.autoClear = false;
    this.copy.material.uniforms.t.value = this.volRT.texture;
    this.copy.render(renderer);
    // 4. transparent layer
    cam.layers.set(LAYER_TRANSPARENT);
    const bg = scene.background; scene.background = null;   // a Color background forces a clear
    renderer.render(scene, cam);
    scene.background = bg;
    cam.layers.enableAll();
    // out
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.material.uniforms.t.value = this.sceneRT.texture;
    this.copy.render(renderer);
    renderer.autoClear = autoClear;
  }
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.9 }, uGrain: { value: 0.025 }, uCA: { value: 0.0012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uCA;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - d * uCA * r2 * 8.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + d * uCA * r2 * 8.0).b;
      c *= mix(1.0, smoothstep(0.85, 0.15, r2 * 1.6), uVignette * 0.6);
      c += (h(vUv * 1000.0 + fract(uTime) * 91.0) - 0.5) * uGrain * (0.3 + c);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPipeline(renderer, scene, camera, opts) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const main = new AquariumRenderPass(renderer, scene, camera, opts);
  composer.addPass(main);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 1.1);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, main, bloom, grade,
    volumeTexture: main.volRT.texture,
    setSize(w, h) { composer.setSize(w, h); },
    render(dt, t) { grade.uniforms.uTime.value = t; composer.render(dt); },
  };
}
