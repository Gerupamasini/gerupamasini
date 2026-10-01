// Suspended silt in the water around the camera, and the clouds of sediment a goby kicks up when it takes
// off, lands, pecks at the bottom, flushes sand out of its gills or dives into its burrow.
import * as THREE from 'three';
import { commonGLSL } from '../materials/common.glsl.js';

/** Fine particles drifting in the water layer around the camera (wrapped into a box that follows it). */
export function createSuspended(shared, { count = 2200, box = 0.36 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box;
    pos[i * 3 + 1] = Math.random();
    pos[i * 3 + 2] = Math.random() * box;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    name: 'SuspendedSilt',
    uniforms: { ...shared, uPxScale: { value: 1000 }, uBox: { value: box }, uCam: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector2(0.004, 0.0015) } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPxScale;
      uniform float uBox;
      uniform vec3 uCam;
      uniform vec2 uDrift;
      uniform float uWaterY;
      varying float vSeed;
      varying vec3 vWorldPos;
      varying float vFade;
      void main() {
        vSeed = seed;
        // slow tidal drift plus a little turbulence; wrapped into a box centred on the camera
        vec2 xz = position.xz + uDrift * uTime * (0.7 + 0.6 * seed) + vec2(sin(uTime * 0.31 + seed * 40.0), cos(uTime * 0.27 + seed * 23.0)) * 0.0025;
        xz = mod(xz - uCam.xz + uBox * 0.5, uBox) + uCam.xz - uBox * 0.5;
        float y = mix(-0.004, uWaterY - 0.002, fract(position.y - uTime * (0.0004 + 0.0012 * seed * seed) * 0.6 / max(uWaterY, 0.02)));
        vec3 p = vec3(xz.x, y, xz.y);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float size = 0.00006 + 0.0002 * seed * seed * seed;
        gl_PointSize = clamp(size * uPxScale / -mv.z, 1.0, 40.0);
        // fade at the edges of the box (no popping when particles wrap)
        vec2 e = abs(xz - uCam.xz) / (uBox * 0.5);
        vFade = (1.0 - smoothstep(0.7, 1.0, max(e.x, e.y))) * smoothstep(0.004, 0.02, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      varying float vSeed;
      varying vec3 vWorldPos;
      varying float vFade;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = exp(-r * 3.0);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ph = hgPhase(dot(-normalize(uLightDir), V), 0.75) * 4.0 * PI;
        float caus = mix(1.0, causticsAt(vWorldPos), 0.6 * uCausticAmt);
        vec3 col = (uLightColor * caus * ph * 0.05 + ambientIrr(vec3(0.0, 1.0, 0.0)) * 0.5) * a * (0.3 + 0.7 * vSeed);
        float fog = exp(-waterPath(vWorldPos) * uFogDensity * 2.0);
        gl_FragColor = vec4(col * fog * vFade * 0.5, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5000;
  return pts;
}

/** Pool of sediment puffs: CPU-simulated (drag, settling, turbulence), drawn as soft lit blobs. */
export function createPuffs(shared, groundAt, max = 900) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const attr = new Float32Array(max * 4); // age/life, size, seed, alive
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aState', new THREE.BufferAttribute(attr, 4).setUsage(THREE.DynamicDrawUsage));
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const age = new Float32Array(max);
  const size = new Float32Array(max);
  const floor = new Float32Array(max);
  let head = 0;
  const mat = new THREE.ShaderMaterial({
    name: 'SiltPuff',
    uniforms: { ...shared, uPxScale: { value: 1000 } },
    vertexShader: /* glsl */ `
      attribute vec4 aState;
      uniform float uPxScale;
      varying vec4 vState;
      varying vec3 vWorldPos;
      void main() {
        vState = aState;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        gl_Position = aState.w > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
        // grains spread as they age (diffusion of the cloud)
        float s = aState.y * (0.6 + 1.8 * sqrt(aState.x));
        gl_PointSize = clamp(s * uPxScale / -mv.z, 1.0, 96.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      varying vec4 vState;
      varying vec3 vWorldPos;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float k = vState.x;
        float a = exp(-r * 2.6) * smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.35, 1.0, k)) * (0.35 + 0.3 * vState.z);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ph = hgPhase(dot(-normalize(uLightDir), V), 0.6) * 4.0 * PI;
        vec3 silt = vec3(0.3, 0.27, 0.22);
        vec3 col = silt * (uLightColor * causticsAt(vWorldPos) * (0.25 + 0.35 * ph) * INV_PI + ambientIrr(vec3(0.0, 1.0, 0.0)));
        col = applyFogAt(col, vWorldPos);
        gl_FragColor = vec4(col, a * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4000;
  const rnd = Math.random;
  return {
    object: pts,
    /** Kick up `n` grains at p (world), with an optional mean velocity; `s` scales grain size and spread. */
    emit(p, v, n, s = 1) {
      n = Math.round(n);
      for (let i = 0; i < n; i++) {
        const k = head;
        head = (head + 1) % max;
        const a = rnd() * Math.PI * 2, u = rnd();
        const sp = (0.006 + 0.02 * u) * s;
        pos[k * 3] = p.x + (rnd() - 0.5) * 0.003 * s;
        pos[k * 3 + 1] = p.y + rnd() * 0.0015;
        pos[k * 3 + 2] = p.z + (rnd() - 0.5) * 0.003 * s;
        vel[k * 3] = Math.cos(a) * sp + (v ? v.x : 0);
        vel[k * 3 + 1] = (0.006 + 0.018 * rnd()) * s + (v ? v.y : 0);
        vel[k * 3 + 2] = Math.sin(a) * sp + (v ? v.z : 0);
        age[k] = 0;
        life[k] = 1.5 + rnd() * 3.5;
        size[k] = (0.0006 + 0.0016 * rnd() * rnd()) * s;
        floor[k] = groundAt(p.x, p.z) - 0.0004;
        attr[k * 4 + 2] = rnd();
        attr[k * 4 + 3] = 1;
      }
    },
    update(dt, time) {
      for (let k = 0; k < max; k++) {
        if (attr[k * 4 + 3] < 0.5) continue;
        age[k] += dt;
        if (age[k] > life[k]) { attr[k * 4 + 3] = 0; continue; }
        const drag = Math.exp(-dt * 5.5);
        vel[k * 3] *= drag; vel[k * 3 + 2] *= drag;
        vel[k * 3 + 1] = vel[k * 3 + 1] * drag - 0.0025 * (1 - drag); // settling
        const x = pos[k * 3], z = pos[k * 3 + 2];
        // weak eddies
        pos[k * 3] += (vel[k * 3] + 0.0015 * Math.sin(time * 1.3 + z * 900 + k)) * dt;
        pos[k * 3 + 1] += vel[k * 3 + 1] * dt;
        pos[k * 3 + 2] += (vel[k * 3 + 2] + 0.0015 * Math.cos(time * 1.1 + x * 900 + k)) * dt;
        const g = floor[k];
        if (pos[k * 3 + 1] < g) { pos[k * 3 + 1] = g; vel[k * 3 + 1] = 0; }
        attr[k * 4] = age[k] / life[k];
        attr[k * 4 + 1] = size[k];
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aState.needsUpdate = true;
    },
  };
}
