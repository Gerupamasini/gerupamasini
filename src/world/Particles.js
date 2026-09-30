// Suspended particulate matter (depth cue, catches the light shafts), an
// air-stone bubble column, and substrate "puffs" when goldfish spit out grit
// while sifting the gravel.

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { RNG } from '../core/random.js';
import { U } from '../render/SharedUniforms.js';
import { underwaterCommon, noiseCommon } from '../fish/shaders/common.glsl.js';
import { groundHeight } from './Substrate.js';

const uwNoCaustics = underwaterCommon;

export class SuspendedParticles {
  constructor(scene, count = 1400) {
    const rng = new RNG(5);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-TANK.L / 2, TANK.L / 2);
      pos[i * 3 + 1] = rng.range(0.03, TANK.water - 0.01);
      pos[i * 3 + 2] = rng.range(-TANK.D / 2, TANK.D / 2);
      seed[i] = rng.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uPixel: { value: 1 },
        uCaustics: U.uCaustics,
        uCausticParams: U.uCausticParams,
        uCausticLightDir: U.uCausticLightDir,
        uWaterMin: U.uWaterMin,
        uWaterMax: U.uWaterMax,
        uWaterAbsorb: U.uWaterAbsorb,
        uWaterScatter: U.uWaterScatter,
        uWaterDensity: U.uWaterDensity,
        uIntensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixel;
        varying float vA;
        varying vec3 vW;
        void main() {
          vec3 p = position;
          float t = uTime * (0.3 + aSeed * 0.4);
          p.x += sin(t * 0.21 + aSeed * 40.0) * 0.02 + uTime * 0.0015;
          p.y += sin(t * 0.17 + aSeed * 13.0) * 0.012 - mod(uTime * 0.0006 * aSeed, 0.4);
          p.z += cos(t * 0.19 + aSeed * 27.0) * 0.015;
          p.x = mod(p.x + ${(TANK.L / 2).toFixed(3)}, ${TANK.L.toFixed(3)}) - ${(TANK.L / 2).toFixed(3)};
          p.y = 0.03 + mod(p.y - 0.03, ${(TANK.water - 0.04).toFixed(3)});
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(0.0003, 0.0011, aSeed * aSeed);
          gl_PointSize = max(1.0, size * uPixel / -mv.z);
          vA = mix(0.08, 0.35, fract(aSeed * 7.3)) * smoothstep(0.02, 0.2, -mv.z);
          vW = (modelMatrix * vec4(p, 1.0)).xyz;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        varying float vA;
        varying vec3 vW;
        ${noiseCommon}
        ${uwNoCaustics}
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d)) * vA * uIntensity;
          float c = causticsAt(vW, vec3(0.0, 1.0, 0.0));
          vec3 col = vec3(0.75, 0.8, 0.72) * (0.35 + 0.65 * c);
          col = waterAttenuate(col, vW) * a;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
    this.points.renderOrder = 4;
    this.points.layers.enable(1);
    scene.add(this.points);
  }
  resize(h) {
    this.material.uniforms.uPixel.value = h * 1.2;
  }
}

// ------------------------------------------------------------ bubbles
export class BubbleColumn {
  constructor(scene, origin, count = 90) {
    this.origin = origin;
    this.count = count;
    this.rng = new RNG(31);
    const geo = new THREE.SphereGeometry(1, 12, 8);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uWaterMin: U.uWaterMin, uWaterMax: U.uWaterMax, uWaterAbsorb: U.uWaterAbsorb, uWaterScatter: U.uWaterScatter, uWaterDensity: U.uWaterDensity, uCaustics: U.uCaustics, uCausticParams: U.uCausticParams, uCausticLightDir: U.uCausticLightDir },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        ${noiseCommon}
        ${underwaterCommon}
        void main() {
          // (normalise: MSAA may extrapolate varyings on these tiny triangles)
          vec3 N = normalize(vN);
          vec3 V = normalize(vV);
          float nv = abs(dot(N, V));
          // air bubble in water: bright total-reflection rim, clear centre, specular dot
          float rim = spow(clamp(1.0 - nv, 0.0, 1.0), 2.2);
          vec3 R = reflect(-V, N);
          float spec = spow(clamp(R.y, 0.0, 1.0), 40.0) * 3.0;
          vec3 col = vec3(0.85, 0.95, 1.0) * (rim * 1.4 + spec);
          float a = clamp(rim * 0.9 + spec * 0.3 + 0.04, 0.0, 1.0);
          col = min(waterAttenuate(col, vW), vec3(8.0));
          gl_FragColor = vec4(col * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'bubbles';
    this.mesh.layers.enable(1);
    scene.add(this.mesh);
    this.b = [];
    for (let i = 0; i < count; i++) this.b.push(this._spawn(this.rng.range(0, TANK.water - origin.y)));
    this.m4 = new THREE.Matrix4();
    this.enabled = true;
  }
  _spawn(h = 0) {
    const r = this.rng;
    return { x: this.origin.x + r.normal(0, 0.004), y: this.origin.y + h, z: this.origin.z + r.normal(0, 0.004), r: Math.exp(r.normal(Math.log(0.0014), 0.35)), ph: r.range(0, 6.28), v: 0 };
  }
  update(dt, time) {
    this.mesh.visible = this.enabled;
    if (!this.enabled) return;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const b = this.b[i];
      // terminal rise speed of mm bubbles ~ 0.2–0.3 m/s, zig-zag path
      const vt = 0.12 + b.r * 90;
      b.v += (vt - b.v) * Math.min(1, dt * 6);
      b.y += b.v * dt;
      b.x += Math.sin(time * 9 + b.ph) * 0.004 * dt * 10 + 0.01 * dt;
      b.z += Math.cos(time * 7 + b.ph) * 0.003 * dt * 10;
      if (b.y > TANK.water - b.r) Object.assign(b, this._spawn(0));
      // oblate, wobbling shape
      const w = 1 + 0.15 * Math.sin(time * 25 + b.ph);
      s.set(b.r * w, b.r * (0.8 / w), b.r * w);
      p.set(b.x, b.y, b.z);
      this.m4.compose(p, q, s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** upward flow velocity at a point (entrainment near the column) */
  flowAt(p, out) {
    const d = Math.hypot(p.x - this.origin.x, p.z - this.origin.z);
    const k = this.enabled ? Math.exp(-(d * d) / (2 * 0.03 * 0.03)) : 0;
    return out.set(0, 0.06 * k, 0);
  }
}

// ------------------------------------------------------------ substrate puffs
export class PuffSystem {
  constructor(scene, max = 240) {
    this.max = max;
    this.p = [];
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b5043, roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4();
    this.rng = new RNG(8);
  }
  /** spit out a few grains from a fish mouth */
  emit(pos, dir, n = 6) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const r = this.rng;
      this.p.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * r.range(0.05, 0.18) + r.normal(0, 0.04),
        vy: dir.y * r.range(0.05, 0.18) + r.normal(0, 0.04),
        vz: dir.z * r.range(0.05, 0.18) + r.normal(0, 0.04),
        s: r.range(0.0008, 0.0018),
        life: 0,
      });
    }
  }
  update(dt) {
    let n = 0;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    this.p = this.p.filter((g) => g.life < 6);
    for (const g of this.p) {
      g.life += dt;
      const drag = Math.exp(-dt * 6);
      g.vx *= drag;
      g.vz *= drag;
      g.vy = g.vy * drag - 0.25 * dt; // grains sink quickly
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;
      const floor = groundHeight(g.x, g.z);
      if (g.y < floor) { g.y = floor; g.vx = g.vz = g.vy = 0; }
      s.setScalar(g.s);
      v.set(g.x, g.y, g.z);
      this.m4.compose(v, q, s);
      this.mesh.setMatrixAt(n++, this.m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
