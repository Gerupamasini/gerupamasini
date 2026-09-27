// Airstone bubbles and suspended specks.
import * as THREE from 'three';
import { TANK } from './config.js';
import { CAUSTIC_SAMPLE_GLSL } from './water.js';
import { mulberry32 } from './noise.js';

export function createBubbles(env, { count = 90, origin = new THREE.Vector3(0.5, 0.06, -0.2) } = {}) {
  const rnd = mulberry32(7);
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uEnv: { value: env } },
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform samplerCube uEnv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(vW - cameraPosition); vec3 N = normalize(vN);
        float c = clamp(dot(-V, N), 0.0, 1.0);
        // air in water: strong rim (total internal reflection at the edge), clear centre
        float rim = pow(1.0 - c, 2.5);
        vec3 refl = textureLod(uEnv, reflect(V, N), 0.0).rgb;
        vec3 col = refl * (0.25 + rim * 1.2) + vec3(0.8, 0.95, 1.0) * rim * 0.35;
        col += vec3(1.0) * pow(max(dot(reflect(V, N), normalize(vec3(0.2, 1.0, 0.1))), 0.0), 60.0) * 2.0;
        gl_FragColor = vec4(col, clamp(rim * 0.8 + 0.05, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const B = [];
  const spawn = (b, initial) => {
    b.p = origin.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.02));
    if (initial) b.p.y += rnd() * (TANK.level - origin.y);
    b.r = 0.0015 + Math.pow(rnd(), 2) * 0.004;
    b.v = 0.12 + b.r * 40;
    b.ph = rnd() * 6.28; b.f = 6 + rnd() * 8;
  };
  for (let i = 0; i < count; i++) { const b = {}; spawn(b, true); B.push(b); }
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  // the airstone itself
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.018, 20), new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 1 }));
  stone.position.copy(origin).y -= 0.012;
  function update(dt, t) {
    B.forEach((b, i) => {
      b.p.y += b.v * dt;
      b.p.x += Math.sin(t * b.f + b.ph) * 0.02 * dt * (b.r * 300);
      b.p.z += Math.cos(t * b.f * 0.8 + b.ph) * 0.015 * dt * (b.r * 300);
      if (b.p.y > TANK.level - b.r) spawn(b, false);
      const wob = 1 + 0.12 * Math.sin(t * 25 + b.ph);
      s.set(b.r * wob, b.r / wob * 0.85, b.r * wob);
      M.compose(b.p, q, s);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, stone, update };
}

export function createSpecks(cu, { count = 2200 } = {}) {
  const rnd = mulberry32(99);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * TANK.w * 0.98;
    pos[i * 3 + 1] = 0.05 + rnd() * (TANK.level - 0.07);
    pos[i * 3 + 2] = (rnd() - 0.5) * TANK.d * 0.96;
    seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, ...cu },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPx; attribute float seed; varying float vA; varying vec3 vC;
      ${CAUSTIC_SAMPLE_GLSL}
      void main(){
        vec3 p = position;
        float t = uTime * (0.2 + seed * 0.3);
        p.x += sin(t + seed * 40.0) * 0.02 + uTime * 0.004 * (seed - 0.3);
        p.y += sin(t * 0.7 + seed * 13.0) * 0.015 - mod(uTime * 0.002 * seed, 0.0);
        p.z += cos(t * 0.9 + seed * 21.0) * 0.015;
        p.x = mod(p.x + ${(TANK.w / 2).toFixed(3)}, ${TANK.w.toFixed(3)}) - ${(TANK.w / 2).toFixed(3)};
        vec4 w = modelMatrix * vec4(p, 1.0);
        vC = causticAt(w.xyz, 1.0);
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        float sz = (0.6 + seed * 1.6) * 0.0012;
        gl_PointSize = max(uPx * sz / -mv.z * 800.0, 1.0);
        vA = (0.25 + 0.75 * seed) * smoothstep(3.0, 0.4, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying vec3 vC;
      void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
        gl_FragColor = vec4(vec3(0.7, 0.85, 0.9) * vC * a * vA * 0.35, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, update: (t) => { mat.uniforms.uTime.value = t; } };
}
