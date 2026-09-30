// Rocks and aquatic plants (Vallisneria ribbons, sword-plant rosettes).
// Plants sway in the filter current with height-dependent bending in the
// vertex shader; rocks are displaced noise solids. Both register colliders
// used by the fish obstacle avoidance.

import * as THREE from 'three';
import { RNG, noise3 } from '../core/random.js';
import { TANK } from './TankConfig.js';
import { groundHeight } from './Substrate.js';
import { patchUnderwater } from './UnderwaterMaterial.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rockGeometry(rng, sx, sy, sz) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 5));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const o = rng.range(0, 100);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let n = 0.22 * noise3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3) + 0.08 * noise3(v.x * 3.7, v.y * 3.7 + o, v.z * 3.7) + 0.025 * noise3(v.x * 11, v.y * 11, v.z * 11 + o);
    // flatter bottom, stratified faces
    const strata = 0.03 * Math.sin((v.y + 0.3 * v.x) * 14 + o);
    v.multiplyScalar(1 + n + strata);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3;
    v.set(v.x * sx, v.y * sy, v.z * sz);
    p.setXYZ(i, v.x, v.y, v.z);
    const t = 0.5 + 0.5 * noise3(v.x * 18, v.y * 18 + o, v.z * 18);
    const lichen = Math.max(0, noise3(v.x * 6 + 3, v.y * 6, v.z * 6)) * 0.3;
    col[i * 3] = 0.34 * (0.75 + 0.5 * t) - lichen * 0.05;
    col[i * 3 + 1] = 0.33 * (0.75 + 0.5 * t) + lichen * 0.05;
    col[i * 3 + 2] = 0.31 * (0.75 + 0.5 * t) - lichen * 0.08;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildRocks() {
  const rng = new RNG(777);
  const group = new THREE.Group();
  group.name = 'rocks';
  const colliders = [];
  // procedural stone detail: multi-octave bump + mineral speckle + algae film on top faces
  const mat = patchUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), {
    key: 'rock',
    extraColor: `
      {
        vec3 wp = vUwWorld * 60.0;
        float sp = vnoise3(wp * 3.0);
        float gr = fbm3(vUwWorld * 22.0);
        diffuseColor.rgb *= 0.78 + 0.35 * gr + 0.12 * step(0.82, sp);
        vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
        float top = smoothstep(0.3, 0.9, nW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.75, 0.95, 0.6), top * 0.45 * smoothstep(0.35, 0.65, fbm3(vUwWorld * 9.0)));
      }`,
    extraNormal: `
      {
        vec3 p = vUwWorld * 70.0;
        float e = 0.35;
        float h0 = fbm3(p);
        vec3 g = vec3(fbm3(p + vec3(e, 0.0, 0.0)) - h0, fbm3(p + vec3(0.0, e, 0.0)) - h0, fbm3(p + vec3(0.0, 0.0, e)) - h0) / e;
        vec3 gv = (viewMatrix * vec4(g, 0.0)).xyz;
        normal = normalize(normal - (gv - normal * dot(gv, normal)) * 0.55);
      }`,
  });
  const defs = [
    { x: -0.34, z: -0.12, sx: 0.13, sy: 0.1, sz: 0.085, ry: 0.4 },
    { x: -0.2, z: -0.15, sx: 0.07, sy: 0.055, sz: 0.06, ry: 1.2 },
    { x: 0.33, z: -0.1, sx: 0.1, sy: 0.075, sz: 0.075, ry: -0.6 },
    { x: 0.08, z: 0.05, sx: 0.045, sy: 0.03, sz: 0.04, ry: 2.2 },
  ];
  for (const d of defs) {
    const geo = rockGeometry(rng, d.sx, d.sy, d.sz);
    const m = new THREE.Mesh(geo, mat);
    const y = groundHeight(d.x, d.z) + d.sy * 0.45;
    m.position.set(d.x, y, d.z);
    m.rotation.y = d.ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    colliders.push({ type: 'ellipsoid', center: new THREE.Vector3(d.x, y, d.z), radii: new THREE.Vector3(d.sx * 1.1, d.sy * 1.15, d.sz * 1.1), radius: Math.max(d.sx, d.sz) });
  }
  return { group, colliders };
}

// ----------------------------------------------------------------- plants
const plantSwayPars = /* glsl */ `
in vec4 aPlant; // x: phase, y: stiffness, z: height, w: unused
uniform vec3 uCurrent;
`;
const plantSway = /* glsl */ `
{
  float h = clamp(position.y / max(aPlant.z, 1e-3), 0.0, 1.0);
  float ph = aPlant.x;
  float t = uTime;
  // slow swaying in the filter current + travelling flutter along the blade
  float sway = sin(t * 0.7 + ph) * 0.55 + sin(t * 1.9 + ph * 2.3 + h * 3.0) * 0.25 + sin(t * 0.23 + ph * 0.7) * 0.4;
  float bend = h * h * aPlant.y;
  vec3 dirW = normalize(uCurrent + vec3(0.0001));
  // bend in instance-local space (approximate: same for all instances)
  transformed.x += bend * (0.06 * sway + 0.08 * dirW.x);
  transformed.z += bend * (0.05 * cos(t * 0.9 + ph * 1.7) + 0.08 * dirW.z);
  transformed.y -= bend * 0.02 * abs(sway);
}
`;

function ribbonGeometry(len, width, segs) {
  const g = new THREE.PlaneGeometry(width, len, 1, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / len;
    // tapering tip & slight natural twist/curl
    const w = (1 - Math.pow(t, 6)) * (0.8 + 0.2 * (1 - t));
    p.setX(i, p.getX(i) * w);
    p.setZ(i, 0.01 * Math.sin(t * 3.1) * t);
  }
  g.computeVertexNormals();
  return g;
}

function swordLeafGeometry(len, width) {
  const segs = 10;
  const g = new THREE.PlaneGeometry(width, len, 4, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / len;
    const petiole = t < 0.3 ? 0.12 : 1;
    const blade = Math.sin(Math.min(1, (t - 0.25) / 0.75) * Math.PI) ** 0.7;
    const w = t < 0.3 ? 0.1 : Math.max(0.08, blade);
    p.setX(i, p.getX(i) * w * petiole ** 0);
    // arch outward
    p.setZ(i, 0.35 * len * t * t);
    p.setY(i, y * (1 - 0.25 * t));
    // midrib crease
    p.setZ(i, p.getZ(i) - Math.abs(p.getX(i)) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function buildPlants() {
  const rng = new RNG(99);
  const group = new THREE.Group();
  group.name = 'plants';
  const colliders = [];
  const current = { value: new THREE.Vector3(0.6, 0, 0.15) };

  const mkMat = (color, key) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
    patchUnderwater(m, {
      extraVertexPars: plantSwayPars,
      extraVertex: plantSway,
      key,
      // thin leaves: diffuse transmission of the hood light + faint parallel veins
      extraColor: `
        {
          float v = abs(fract(vUwWorld.y * 90.0 + vUwWorld.x * 7.0) - 0.5);
          diffuseColor.rgb *= 0.92 + 0.16 * smoothstep(0.1, 0.0, v) + 0.1 * (vnoise3(vUwWorld * 40.0) - 0.5);
        }`,
      extraLights: `
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lp = directionalLights[0].direction;
          float back = saturate(-dot(normal, Lp)) + 0.35 * saturate(dot(normal, Lp));
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * vec3(0.8, 1.0, 0.55) * back * 0.45;
        }
        #endif`,
    });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.uniforms.uCurrent = current;
    };
    return m;
  };

  // Vallisneria clumps at the back
  const valMat = mkMat(0x5f8a30, 'val');
  const clumps = [
    { x: -0.5, z: -0.17, n: 26 },
    { x: -0.43, z: -0.19, n: 18 },
    { x: 0.47, z: -0.16, n: 28 },
    { x: 0.52, z: -0.19, n: 16 },
    { x: 0.2, z: -0.19, n: 20 },
    { x: -0.05, z: -0.2, n: 14 },
  ];
  const leaf = ribbonGeometry(1, 0.009, 18);
  let total = clumps.reduce((a, c) => a + c.n, 0);
  const inst = new THREE.InstancedMesh(leaf, valMat, total);
  const aPlant = new Float32Array(total * 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let k = 0;
  const col = new THREE.Color();
  for (const c of clumps) {
    for (let i = 0; i < c.n; i++) {
      const x = c.x + rng.normal(0, 0.018);
      const z = c.z + rng.normal(0, 0.012);
      const len = rng.range(0.22, 0.44);
      e.set(rng.range(-0.18, 0.18), rng.range(0, Math.PI * 2), rng.range(-0.18, 0.18));
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.004, z), q, new THREE.Vector3(1, len, 1));
      inst.setMatrixAt(k, m4);
      col.setHSL(0.24 + rng.range(-0.03, 0.03), 0.55, rng.range(0.32, 0.46));
      inst.setColorAt(k, col);
      aPlant[k * 4] = rng.range(0, 6.28);
      aPlant[k * 4 + 1] = rng.range(0.7, 1.3);
      aPlant[k * 4 + 2] = 1.0; // geometry height (unit leaf scaled by instance matrix)
      k++;
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(c.x, 0, c.z), radius: 0.05, height: 0.4, soft: true });
  }
  leaf.setAttribute('aPlant', new THREE.InstancedBufferAttribute(aPlant, 4));
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);

  // Sword-plant rosettes
  const swordMat = mkMat(0x3f6e24, 'sword');
  const rosettes = [
    { x: 0.05, z: -0.13, n: 14, s: 0.2 },
    { x: -0.24, z: 0.02, n: 9, s: 0.12 },
  ];
  const sLeaf = swordLeafGeometry(1, 0.28);
  total = rosettes.reduce((a, c) => a + c.n, 0);
  const sInst = new THREE.InstancedMesh(sLeaf, swordMat, total);
  const aP2 = new Float32Array(total * 4);
  k = 0;
  for (const r of rosettes) {
    for (let i = 0; i < r.n; i++) {
      const len = r.s * rng.range(0.7, 1.2);
      e.set(0, (i / r.n) * Math.PI * 2 + rng.range(-0.2, 0.2), 0, 'YXZ');
      q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rng.range(0.1, 0.5));
      q.multiply(tilt);
      m4.compose(new THREE.Vector3(r.x, groundHeight(r.x, r.z) - 0.003, r.z), q, new THREE.Vector3(len, len, len));
      sInst.setMatrixAt(k, m4);
      col.setHSL(0.26 + rng.range(-0.02, 0.03), 0.55, rng.range(0.24, 0.34));
      sInst.setColorAt(k, col);
      aP2[k * 4] = rng.range(0, 6.28);
      aP2[k * 4 + 1] = rng.range(0.2, 0.4);
      aP2[k * 4 + 2] = 1.0;
      k++;
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(r.x, 0, r.z), radius: r.s * 0.75, height: r.s * 0.9, soft: true });
  }
  sLeaf.setAttribute('aPlant', new THREE.InstancedBufferAttribute(aP2, 4));
  sInst.castShadow = true;
  sInst.receiveShadow = true;
  group.add(sInst);
  return { group, colliders, current };
}
