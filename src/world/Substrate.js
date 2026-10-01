// River-gravel substrate: a sloped heightfield base of fine sediment +
// thousands of instanced, individually shaped pebbles (coarse sand/gravel is
// also what goldfish forage in most — Smith & Gray 2011), and the gravel
// layer's cross-section seen through the front and side glass.

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
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1));
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

// gravel bed variation shared by the pebbles and the sediment base: patches of
// darker mulm / lighter sand, a fine dust film on upward faces
const bedVariation = /* glsl */ `
  {
    vec2 xz = vUwWorld.xz;
    float patchN = vnoise2(xz * 7.0) * 0.6 + vnoise2(xz * 23.0 + 5.0) * 0.4;
    diffuseColor.rgb *= 0.74 + 0.5 * patchN;
    // mulm collects toward the back and around the stones' bases
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.055, 0.04), 0.35 * smoothstep(0.55, 0.85, vnoise2(xz * 11.0 + 17.0)));
  }`;

export function buildSubstrate(rockFootprints = []) {
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
  // between the pebbles: fine sand and detritus (sub-millimetre grain)
  const baseMat = patchUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.3 }), {
    key: 'gravelbase',
    extraColor: `
      {
        vec2 xz = vUwWorld.xz;
        float g = vnoise2(xz * 620.0) * 0.65 + vnoise2(xz * 170.0) * 0.35;
        diffuseColor.rgb *= 0.5 + 0.85 * g;
      }` + bedVariation,
  });
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
  // wet stone under water: the stone/water interface reflects ~0.6 %, so
  // pebbles are matte (no air-like glints)
  const mat = patchUnderwater(new THREE.MeshPhysicalMaterial({ roughness: 0.72, metalness: 0, ior: 1.17 }), {
    key: 'pebble',
    extraColor: bedVariation + `
      {
        vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
        float dust = smoothstep(0.5, 0.95, nW.y) * smoothstep(0.3, 0.75, vnoise2(vUwWorld.xz * 15.0 + 7.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.095, 0.07), dust * 0.4);
      }`,
  });
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
      const size = Math.exp(rng.normal(Math.log(0.0042), 0.35));
      s.set(size, size * rng.range(0.45, 0.8), size * rng.range(0.7, 1.1));
      // skip only where a stone actually covers the gravel (gravel runs right
      // up to the stones, no bare ring)
      let blocked = false;
      const gy = groundHeight(x, z) + s.y * 0.3;
      for (const r of rockFootprints) {
        if ((x - r.center.x) ** 2 + (z - r.center.z) ** 2 > (r.radius * 1.6) ** 2) continue;
        if (r.contains ? r.contains(x, gy, z) : (x - r.center.x) ** 2 + (z - r.center.z) ** 2 < (r.radius * 0.8) ** 2) blocked = true;
      }
      if (blocked) continue;
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

  // ---- the gravel layer seen through the glass: pebbles pressed against the
  // pane (Voronoi cells from the same palette, dark interstices)
  const sectionMat = patchUnderwater(new THREE.MeshStandardMaterial({ roughness: 0.9, envMapIntensity: 0.3 }), {
    key: 'gravelsection',
    caustics: false,
    extraColor: `
      {
        // in-plane coordinate along the pane (x on the front, z on the sides)
        vec2 q = vec2(abs(vUwWorld.z) > ${(TANK.D / 2 - 0.002).toFixed(4)} ? vUwWorld.x : vUwWorld.z, vUwWorld.y) * 210.0;
        vec2 iq = floor(q);
        float d1 = 9.0, d2 = 9.0;
        vec2 cell = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = iq + vec2(float(i), float(j));
          vec2 o = c + 0.1 + 0.8 * hash22(c);
          float d = length((q - o) * vec2(1.0, 1.3));
          if (d < d1) { d2 = d1; d1 = d; cell = c; } else if (d < d2) d2 = d;
        }
        vec3 h = hash32(cell);
        vec3 tint = mix(vec3(0.26, 0.19, 0.12), vec3(0.4, 0.34, 0.26), h.x);
        tint = mix(tint, vec3(0.09, 0.08, 0.07), step(0.82, h.y));
        tint *= 0.7 + 0.45 * h.z;
        // rounded pebbles pressed against the pane: lit centre, dark rims and
        // interstices filled with darker sand
        float gap = smoothstep(0.03, 0.25, d2 - d1);
        float dome = 1.0 - smoothstep(0.05, 0.75, d1);
        vec3 sand = vec3(0.07, 0.055, 0.04) * (0.6 + 0.8 * hash12(floor(q * 6.0)));
        vec3 c = mix(sand, tint * (0.45 + 0.55 * dome), gap);
        // deeper in the layer less light gets in
        float depthDark = smoothstep(-0.008, ${(TANK.gravel).toFixed(3)}, vUwWorld.y);
        // large-scale unevenness of the layer (finer / coarser, cleaner / dirtier)
        c *= 0.65 + 0.7 * vnoise2(q * 0.08);
        diffuseColor.rgb = c * mix(0.15, 0.6, depthDark);
      }`,
  });
  const section = (len, along) => {
    const segs = 120;
    const geo = new THREE.PlaneGeometry(len, 1, segs, 1);
    const pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const u = pp.getX(i);
      const top = pp.getY(i) > 0;
      const [x, z] = along(u);
      pp.setXYZ(i, x, top ? groundHeight(x, z) - 0.001 : -0.012, z);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const front = new THREE.Mesh(section(TANK.L, (u) => [u, TANK.D / 2 - 0.0008]), sectionMat);
  group.add(front);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(section(TANK.D, (u) => [sx * (TANK.L / 2 - 0.0008), u * sx]), sectionMat);
    group.add(side);
  }
  for (const m of group.children) if (m.material === sectionMat) m.receiveShadow = true;
  return group;
}
