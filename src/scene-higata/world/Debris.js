// Shell fragments and small pebbles lying half-buried in the sediment (instanced). Same light as the
// sediment: refracted sun with caustics and the gobies' shadows are left to the ground; fog by water path.
import * as THREE from 'three';
import { commonGLSL } from '../materials/common.glsl.js';
import { noiseGLSL, mulberry32 } from './noise.js';

// a broken piece of a ribbed bivalve valve: a shallow cap cut irregularly
function shellGeometry(rnd) {
  const geo = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * (0.9 + rnd() * 0.9), 0, Math.PI * 0.42);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    // radial ribs and growth lines
    const rib = 1 + 0.035 * Math.sin(a * 22) + 0.02 * Math.sin(Math.acos(Math.min(1, v.y)) * 40);
    v.multiplyScalar(rib);
    v.y *= 0.45;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
function pebbleGeometry(rnd) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const k = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = 1 + 0.12 * Math.sin(v.x * 3 + k[0]) * Math.sin(v.y * 2.5 + k[1]) + 0.08 * Math.sin(v.z * 4 + k[2]);
    v.multiplyScalar(d);
    v.y *= 0.6;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createDebris(shared, flat, { seed = 5, count = 160 } = {}) {
  const rnd = mulberry32(seed);
  const mat = new THREE.ShaderMaterial({
    name: 'SedimentDebris',
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec3 vCol;
      varying vec3 vObj;
      void main() {
        vCol = instanceColor;
        vObj = position;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${commonGLSL}
      ${noiseGLSL}
      varying vec3 vWorldPos;
      varying vec3 vN;
      varying vec3 vCol;
      varying vec3 vObj;
      void main() {
        vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        // weathered surface: growth bands, pits, a film of silt in the hollows
        float band = 0.85 + 0.15 * sin(length(vObj.xz) * 60.0 + vnoise(vObj.xz * 8.0) * 3.0);
        float pit = vnoise(vObj.xz * 30.0 + vObj.y * 11.0);
        vec3 alb = vCol * band * (0.85 + 0.25 * pit);
        alb = mix(alb, vec3(0.2, 0.18, 0.14), smoothstep(0.55, 0.0, N.y) * 0.35);
        vec3 Lc = uLightColor * mix(1.0, causticsAt(vWorldPos), uCausticAmt);
        vec3 col = alb * (Lc * max(dot(N, L), 0.0) * INV_PI + ambientIrr(N));
        col += Lc * specGGX(N, V, L, 0.35, 0.03) * 0.5;
        col = applyFogAt(col, vWorldPos);
        gl_FragColor = vec4(col, length(cameraPosition - vWorldPos));
      }
    `,
  });
  const group = new THREE.Group();
  group.name = 'Debris';
  const kinds = [
    { geo: shellGeometry(rnd), n: Math.round(count * 0.55), shell: true },
    { geo: shellGeometry(rnd), n: Math.round(count * 0.2), shell: true },
    { geo: pebbleGeometry(rnd), n: Math.round(count * 0.25), shell: false },
  ];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  for (const k of kinds) {
    const inst = new THREE.InstancedMesh(k.geo, mat, k.n);
    inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.n * 3), 3);
    let placed = 0;
    for (let tries = 0; placed < k.n && tries < k.n * 20; tries++) {
      // denser near the middle, thinning out with distance
      const a = rnd() * Math.PI * 2, d = 0.03 + Math.pow(rnd(), 1.6) * 1.6;
      p.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      if (flat.holeAt(p.x, p.z, 0.02)) continue;
      const size = k.shell ? 0.002 + Math.pow(rnd(), 2.2) * 0.009 : 0.0012 + Math.pow(rnd(), 2.5) * 0.006;
      // lie on the local slope, partly buried; shells mostly convex side up
      const n = flat.normal(p.x, p.z, size);
      p.y = flat.height(p.x, p.z) - size * (k.shell ? 0.12 : 0.3);
      e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5 + (k.shell && rnd() < 0.25 ? Math.PI : 0));
      q.setFromEuler(e).premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      sc.set(size * (0.8 + 0.4 * rnd()), size, size * (0.7 + 0.4 * rnd()));
      m.compose(p, q, sc);
      inst.setMatrixAt(placed, m);
      if (k.shell) c.setHSL(0.07 + rnd() * 0.05, 0.12 + rnd() * 0.15, 0.42 + rnd() * 0.32);
      else c.setHSL(0.08 + rnd() * 0.06, 0.05 + rnd() * 0.08, 0.15 + rnd() * 0.22);
      c.convertSRGBToLinear();
      inst.setColorAt(placed, c);
      placed++;
    }
    inst.count = placed;
    inst.frustumCulled = false;
    inst.renderOrder = -880;
    group.add(inst);
  }
  return group;
}
