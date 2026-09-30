// River-gravel substrate: a sloped heightfield base + thousands of instanced,
// individually shaped pebbles (coarse sand/gravel is also what goldfish
// forage in most — Smith & Gray 2011).

import * as THREE from 'three';
import { TANK } from './TankConfig.js';
import { RNG, noise3 } from '../core/random.js';
import { patchUnderwater } from './UnderwaterMaterial.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Height of the substrate surface at (x, z). */
export function groundHeight(x, z) {
  const back = (-z / TANK.D + 0.5); // 0 front .. 1 back
  let h = TANK.gravel + 0.028 * back * back;
  h += 0.004 * noise3(x * 6.1, 0.3, z * 6.1) + 0.0018 * noise3(x * 23, 1.7, z * 23);
  return h;
}

function pebbleGeometry(rng) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const o = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.18 * noise3(v.x * 1.6 + o, v.y * 1.6, v.z * 1.6);
    v.multiplyScalar(n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildSubstrate(rockColliders = []) {
  const group = new THREE.Group();
  group.name = 'substrate';
  const rng = new RNG(4242);

  // ---- base heightfield
  const segX = 240;
  const segZ = 90;
  const base = new THREE.PlaneGeometry(TANK.L, TANK.D, segX, segZ);
  base.rotateX(-Math.PI / 2);
  const pos = base.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z) - 0.002);
    const n = noise3(x * 40, 3.1, z * 40) * 0.5 + 0.5;
    c.setRGB(0.12 + 0.06 * n, 0.1 + 0.05 * n, 0.075 + 0.035 * n);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  base.computeVertexNormals();
  const baseMat = patchUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { key: 'gravelbase' });
  const baseMesh = new THREE.Mesh(base, baseMat);
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // ---- pebbles (3 shape variants)
  // natural river gravel (linear albedo): browns, ochres, greys, a few dark stones
  const palette = [
    [0.3, 0.22, 0.14], [0.22, 0.17, 0.12], [0.36, 0.3, 0.22], [0.14, 0.12, 0.1],
    [0.42, 0.36, 0.27], [0.09, 0.08, 0.07], [0.33, 0.2, 0.11], [0.5, 0.45, 0.38], [0.2, 0.2, 0.19],
  ];
  const variants = 3;
  const perVariant = 3200;
  const mat = patchUnderwater(new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 }), { key: 'pebble' });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let vI = 0; vI < variants; vI++) {
    const geo = pebbleGeometry(rng);
    const inst = new THREE.InstancedMesh(geo, mat, perVariant);
    let n = 0;
    for (let k = 0; k < perVariant * 3 && n < perVariant; k++) {
      const x = rng.range(-TANK.L / 2 + 0.004, TANK.L / 2 - 0.004);
      const z = rng.range(-TANK.D / 2 + 0.004, TANK.D / 2 - 0.004);
      // skip under rocks
      let blocked = false;
      for (const r of rockColliders) if ((x - r.center.x) ** 2 + (z - r.center.z) ** 2 < (r.radius * 0.8) ** 2) blocked = true;
      if (blocked) continue;
      const size = Math.exp(rng.normal(Math.log(0.0042), 0.35));
      s.set(size, size * rng.range(0.45, 0.8), size * rng.range(0.7, 1.1));
      e.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3));
      q.setFromEuler(e);
      p.set(x, groundHeight(x, z) - s.y * 0.35, z);
      m4.compose(p, q, s);
      inst.setMatrixAt(n, m4);
      const pc = palette[Math.floor(rng.next() * palette.length)];
      const b = rng.range(0.85, 1.12);
      c.setRGB(pc[0] * b, pc[1] * b, pc[2] * b);
      inst.setColorAt(n, c);
      n++;
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.castShadow = false;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }
  return group;
}
