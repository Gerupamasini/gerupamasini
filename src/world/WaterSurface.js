// Water surface.
// Seen from below (typical front view through the glass) the surface acts as a
// mirror beyond the critical angle (48.6°, total internal reflection) and shows
// the bright hood light only inside Snell's window. The TIR mirror is a real
// planar reflection of the underwater content (half-resolution pass with an
// oblique near plane). Seen from above it is a weak Fresnel reflector.
// Interactive ripple rings are spawned by food drops and surface-feeding gulps.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { U } from '../render/SharedUniforms.js';
import { underwaterCommon, noiseCommon } from '../fish/shaders/common.glsl.js';

const MAX_RIPPLES = 16;

const vert = /* glsl */ `
out vec3 vWorld;
out vec4 vReflUv;
uniform mat4 uTexMatrix;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vReflUv = uTexMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const heightFn = /* glsl */ `
float heightAt(vec2 p) {
  float t = uTime;
  float h = 0.0;
  h += 0.00045 * sin(dot(p, vec2(21.0, 9.0)) + t * 1.9);
  h += 0.00035 * sin(dot(p, vec2(-13.0, 25.0)) + t * 2.3);
  h += 0.00025 * sin(dot(p, vec2(37.0, -31.0)) + t * 3.1);
  h += 0.00022 * (vnoise2(p * 45.0 + vec2(t * 0.6, -t * 0.4)) - 0.5);
  h *= uWaveAmp;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    if (r.w <= 0.0) continue;
    float age = t - r.z;
    if (age < 0.0 || age > 3.0) continue;
    float d = length(p - r.xy);
    float front = age * 0.22;
    float dd = (d - front) / 0.018;
    float env = exp(-dd * dd) * exp(-age * 1.4) / (1.0 + d * 25.0);
    h += r.w * 0.0025 * env * sin((d - front) * 260.0);
  }
  return h;
}
vec3 surfaceNormal(vec2 p) {
  float e = 0.0015;
  float hx = heightAt(p + vec2(e, 0.0)) - heightAt(p - vec2(e, 0.0));
  float hz = heightAt(p + vec2(0.0, e)) - heightAt(p - vec2(0.0, e));
  return normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
}
`;

const frag = /* glsl */ `
in vec3 vWorld;
in vec4 vReflUv;
uniform float uTime;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform sampler2D uReflection;
uniform float uUseReflection;
uniform vec3 uSkyColor;
uniform vec3 uRoomColor;
uniform vec3 uLedColor;
uniform vec3 uDeepColor;
uniform float uWaveAmp;
uniform float uDebugRefl;
${noiseCommon}
${underwaterCommon}

${heightFn}
void main() {
  vec2 p = vWorld.xz;
  vec3 N = surfaceNormal(p);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col;
  float alpha;
  if (V.y < 0.0) {
    // viewed from below (inside the water)
    vec3 n = -N;
    float cosI = clamp(dot(n, V), 0.0, 1.0);
    float sinI = sqrt(1.0 - cosI * cosI);
    float sinT = 1.333 * sinI;
    float F;
    if (sinT >= 1.0) F = 1.0;
    else {
      float cosT = sqrt(1.0 - sinT * sinT);
      float rs = (1.333 * cosI - cosT) / (1.333 * cosI + cosT);
      float rp = (cosI - 1.333 * cosT) / (cosI + 1.333 * cosT);
      F = 0.5 * (rs * rs + rp * rp);
    }
    // soften the Snell-window edge (surface micro-roughness)
    F = mix(F, 1.0, smoothstep(0.62, 0.66, sinI) * 0.0);
    vec2 ruv = vReflUv.xy / vReflUv.w + N.xz * 0.06;
    vec3 refl = uUseReflection > 0.5 ? texture(uReflection, ruv).rgb : uDeepColor;
    // light above the surface: LED hood (bright) + dim room
    vec3 T = refract(-V, n, 1.333);
    // the hood LED is a long bar along x: only the z-tilt of the refracted ray matters
    float tz = T.y / max(length(T.yz), 1e-4);
    float led = smoothstep(0.93, 0.995, tz) * smoothstep(0.2, 0.6, T.y) * 0.55;
    vec3 trans = mix(uRoomColor, uSkyColor, smoothstep(0.1, 0.8, T.y)) + uLedColor * led;
    col = mix(trans, refl, F);
    col = waterAttenuate(col, vWorld);
    if (uDebugRefl > 0.5) col = texture(uReflection, vReflUv.xy / vReflUv.w).rgb * 4.0;
    alpha = 1.0;
  } else {
    // viewed from above: weak Fresnel reflection of the dim room + LED glint
    float cosI = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + 0.98 * spow(clamp(1.0 - cosI, 0.0, 1.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 env = mix(uRoomColor, uLedColor * 0.5, smoothstep(0.85, 0.99, R.y));
    col = env * F / max(F, 0.001);
    alpha = clamp(F * 1.2, 0.0, 0.9);
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class WaterSurface {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
    this.rippleIdx = 0;
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, size.x >> 1), Math.max(2, size.y >> 1), { type: THREE.HalfFloatType, samples: 2 });
    this.textureMatrix = new THREE.Matrix4();
    this.virtualCamera = new THREE.PerspectiveCamera();
    this.useReflection = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: true,
      side: THREE.BackSide,
      uniforms: {
        uTime: U.uTime,
        uRipples: { value: this.ripples },
        uReflection: { value: this.rt.texture },
        uUseReflection: { value: 1 },
        uTexMatrix: { value: this.textureMatrix },
        uSkyColor: { value: new THREE.Color(0.55, 0.62, 0.64) },
        uRoomColor: { value: new THREE.Color(0.05, 0.05, 0.05) },
        uLedColor: { value: new THREE.Color(2.6, 2.5, 2.35) },
        uDeepColor: { value: new THREE.Color(0.05, 0.12, 0.12) },
        uWaveAmp: { value: 1 },
        uDebugRefl: { value: 0 },
        uCaustics: U.uCaustics,
        uCausticParams: U.uCausticParams,
        uCausticLightDir: U.uCausticLightDir,
        uWaterMin: U.uWaterMin,
        uWaterMax: U.uWaterMax,
        uWaterAbsorb: U.uWaterAbsorb,
        uWaterScatter: U.uWaterScatter,
        uWaterDensity: U.uWaterDensity,
      },
    });
    this.material.toneMapped = true;
    const geo = new THREE.PlaneGeometry(TANK.L, TANK.D, 4, 2);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = TANK.water;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'waterSurface';
    scene.add(this.mesh);

    // Seen from above: physically based refraction (IOR 1.333) of the tank
    // interior through the rippled surface, via three.js screen-space
    // transmission; normals come from the same animated height field.
    this.topMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.02,
      ior: 1.333,
      specularIntensity: 1,
      envMapIntensity: 0.6,
      attenuationColor: new THREE.Color(0.75, 0.9, 0.88),
      attenuationDistance: 0.6,
      side: THREE.FrontSide,
      // transparent fins/particles are drawn after transmissive objects and are
      // not part of the transmission buffer: don't let the surface occlude them
      depthWrite: false,
    });
    const tu = this.material.uniforms;
    this.topMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uRipples = tu.uRipples;
      shader.uniforms.uWaveAmp = tu.uWaveAmp;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSurfW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSurfW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSurfW;
          uniform float uTime;
          uniform vec4 uRipples[${MAX_RIPPLES}];
          uniform float uWaveAmp;
          ${noiseCommon}
          ${heightFn}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize((viewMatrix * vec4(surfaceNormal(vSurfW.xz), 0.0)).xyz);`);
    };
    this.topMaterial.customProgramCacheKey = () => 'water-top';
    this.top = new THREE.Mesh(geo, this.topMaterial);
    this.top.position.y = TANK.water + 0.0002;
    this.top.name = 'waterSurfaceTop';
    scene.add(this.top);
  }

  addRipple(x, z, strength = 1, time = U.uTime.value) {
    const r = this.ripples[this.rippleIdx];
    r.set(x, z, time, strength);
    this.rippleIdx = (this.rippleIdx + 1) % MAX_RIPPLES;
  }

  resize(w, h) {
    this.rt.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  /** Render the TIR mirror image (only needed when the camera is under the surface level). */
  renderReflection(camera) {
    const below = camera.position.y < TANK.water;
    this.material.uniforms.uUseReflection.value = below && this.useReflection ? 1 : 0;
    if (!below || !this.useReflection) return;
    const wl = TANK.water;
    const vc = this.virtualCamera;
    vc.copy(camera);
    // mirror camera across the plane y = wl
    vc.position.y = 2 * wl - camera.position.y;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = -dir.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.y = -up.y;
    vc.up.copy(up);
    vc.lookAt(vc.position.clone().add(dir));
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // texture matrix (world -> reflection uv)
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique near plane = water plane (keep the underwater half-space)
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), wl);
    plane.applyMatrix4(vc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vc.projectionMatrix;
    const q = new THREE.Vector4(
      (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5],
      -1.0,
      (1.0 + pm.elements[10]) / pm.elements[14]
    );
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x;
    pm.elements[6] = cp.y;
    pm.elements[10] = cp.z + 1.0;
    pm.elements[14] = cp.w;
    vc.layers.set(1);
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    this.mesh.visible = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, vc);
    r.setRenderTarget(prevRT);
    this.mesh.visible = true;
    r.shadowMap.autoUpdate = prevShadow;
  }
}
