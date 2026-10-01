// River-gravel substrate: a sloped heightfield base of fine sand and mulm +
// thousands of instanced, individually shaped pebbles (coarse sand/gravel is
// also what goldfish forage in most — Smith & Gray 2011). Where the layer
// meets the front and side glass it is built from real pebbles pressed
// against the pane (two staggered rows, darker the deeper they sit), with a
// dark sandy backdrop showing through the interstices — no painted cut face.
// Pebbles are grouped into spatial chunks with distance LODs so close-ups get
// round silhouettes without paying for them over the whole bed.

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
  // broad drifts and shallow pits dug by foraging goldfish (the bed is never
  // a level tray, also not along the front glass)
  h += 0.0045 * noise3(x * 2.4 + 3.3, 4.1, z * 2.4);
  h -= 0.003 * Math.max(0, noise3(x * 11.0, 2.2, z * 11.0) - 0.15);
  return h;
}

// one pebble shape at a given tessellation; the same offset gives the same
// shape at every level of detail (no popping between LODs, only smoother
// outlines up close)
function pebbleGeometry(o, detail) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 1 + 0.18 * noise3(v.x * 1.6 + o, v.y * 1.6, v.z * 1.6) + 0.03 * noise3(v.x * 4.1, v.y * 4.1 + o, v.z * 4.1);
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
    // mulm collects toward the back and in drifts between the stones
    float mulm = smoothstep(0.55, 0.85, vnoise2(xz * 11.0 + 17.0)) + 0.35 * smoothstep(0.0, -0.2, xz.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.055, 0.04), 0.35 * clamp(mulm, 0.0, 1.0));
  }`;

// LOD switch distances (m from the chunk centre): icosphere detail 2 up
// close, detail 1 beyond
const LOD_NEAR = 0.42;

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
    c.setRGB(0.06 + 0.035 * n, 0.05 + 0.028 * n, 0.038 + 0.02 * n);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  base.computeVertexNormals();
  // between the pebbles: fine sand with a few pale quartz grains, flecks of
  // decaying leaf litter and fluffy mulm, all in the pebbles' shadow
  const baseMat = patchUnderwater(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.2 }), {
    key: 'gravelbase',
    extraColor: `
      {
        vec2 xz = vUwWorld.xz;
        float g = vnoise2(xz * 620.0) * 0.65 + vnoise2(xz * 170.0) * 0.35;
        diffuseColor.rgb *= 0.45 + 0.8 * g;
        float quartz = smoothstep(0.8, 0.9, vnoise2(xz * 700.0 + 9.0)) * smoothstep(0.4, 0.7, vnoise2(xz * 60.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.19, 0.16), quartz * 0.45);
        // the sand right along the glass lies in the shade of the stacked pebbles
        float wallD = min(${(TANK.D / 2).toFixed(4)} - abs(xz.y), ${(TANK.L / 2).toFixed(4)} - abs(xz.x));
        diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(0.002, 0.014, wallD));
        float litter = smoothstep(0.7, 0.78, vnoise2(xz * 260.0 + 3.0)) * smoothstep(0.45, 0.7, vnoise2(xz * 31.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.032, 0.015), litter * 0.8);
      }` + bedVariation,
  });
  const baseMesh = new THREE.Mesh(base, baseMat);
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // ---- pebble material
  // natural river gravel (linear albedo): browns, ochres, greys, a few dark stones
  const palette = [
    [0.3, 0.22, 0.14], [0.22, 0.17, 0.12], [0.36, 0.3, 0.22], [0.14, 0.12, 0.1],
    [0.42, 0.36, 0.27], [0.09, 0.08, 0.07], [0.33, 0.2, 0.11], [0.5, 0.45, 0.38], [0.2, 0.2, 0.19],
  ];
  // wet stone under water: the stone/water interface reflects ~0.6 %, so
  // pebbles are matte (no air-like glints). Each pebble is darker toward its
  // underside and where it touches its neighbours (contact occlusion), and
  // carries faint mineral speckle and a dust film on its upper face.
  const mat = patchUnderwater(new THREE.MeshPhysicalMaterial({ roughness: 0.72, metalness: 0, ior: 1.17, envMapIntensity: 0.7 }), {
    key: 'pebble',
    extraVertexPars: 'out vec4 vPeb;\n',
    extraVertex: `
      {
        vec4 pc = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          pc = instanceMatrix * pc;
          float ps = length(instanceMatrix[1].xyz);
        #else
          float ps = 1.0;
        #endif
        vPeb = vec4((modelMatrix * pc).xyz, ps);
      }`,
    extraFragmentPars: 'in vec4 vPeb;\n',
    extraColor: bedVariation + `
      {
        vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
        float dust = smoothstep(0.5, 0.95, nW.y) * smoothstep(0.3, 0.75, vnoise2(vUwWorld.xz * 15.0 + 7.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.095, 0.07), dust * 0.4);
        // mineral grain / speckle
        float sp = vnoise3(vUwWorld * 2600.0);
        diffuseColor.rgb *= 0.9 + 0.2 * sp;
        // contact occlusion toward the underside
        float rel = (vUwWorld.y - vPeb.y) / max(vPeb.w, 1e-4);
        diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(-0.9, 0.55, rel));
      }`,
  });

  // three pebble shapes, each at two tessellations
  const shapes = [0, 1, 2].map(() => {
    const o = rng.range(0, 100);
    return [pebbleGeometry(o, 2), pebbleGeometry(o, 1)];
  });

  // ---- scatter into spatial chunks (bed) ----------------------------------
  const chunks = new Map();
  const addTo = (key, center, m, color, shape) => {
    let ch = chunks.get(key);
    if (!ch) {
      ch = { center: center.clone(), items: [], shape };
      chunks.set(key, ch);
    }
    ch.items.push({ m: m.clone(), c: color.clone() });
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const pebbleColor = (mul = 1) => {
    const pc = palette[Math.floor(rng.next() * palette.length)];
    const b = rng.range(0.85, 1.12) * mul;
    return c.setRGB(pc[0] * b, pc[1] * b, pc[2] * b);
  };
  const CX = 6;
  const CZ = 3;
  const total = 10800;
  let n = 0;
  for (let k = 0; k < total * 3 && n < total; k++) {
    const x = rng.range(-TANK.L / 2 + 0.0025, TANK.L / 2 - 0.0025);
    const z = rng.range(-TANK.D / 2 + 0.0025, TANK.D / 2 - 0.0025);
    const size = Math.exp(rng.normal(Math.log(0.0044), 0.36));
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
    const ix = Math.min(CX - 1, Math.floor((x / TANK.L + 0.5) * CX));
    const iz = Math.min(CZ - 1, Math.floor((z / TANK.D + 0.5) * CZ));
    tmpC.set(((ix + 0.5) / CX - 0.5) * TANK.L, TANK.gravel + 0.01, ((iz + 0.5) / CZ - 0.5) * TANK.D);
    addTo(`b${ix}_${iz}`, tmpC, m4, pebbleColor(), (ix + iz * 2) % 3);
    n++;
  }

  // ---- the layer against the glass ----------------------------------------
  // Pebbles pressed against the pane in two staggered rows: the front row
  // touches the glass, the second fills its gaps from behind. Light reaches
  // into the layer only from above, so pebbles darken with burial depth.
  const wallFace = (len, along, normalAxis, sign, chunkLen, keyPrefix) => {
    for (let row = 0; row < 2; row++) {
      const placed = [];
      const cell = 0.012;
      const grid = new Map();
      const near = (u, y, r) => {
        const gu = Math.floor(u / cell);
        const gyy = Math.floor(y / cell);
        for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
          const list = grid.get(`${gu + a},${gyy + b2}`);
          if (!list) continue;
          for (const o of list) if ((o.u - u) ** 2 + ((o.y - y) * 1.15) ** 2 < ((o.r + r) * 0.82) ** 2) return true;
        }
        return false;
      };
      const tries = Math.round(len * 26000);
      for (let k = 0; k < tries; k++) {
        const u = rng.range(-len / 2 + 0.003, len / 2 - 0.003);
        const [wx, wz] = along(u, 0);
        const top = groundHeight(wx, wz);
        const size = Math.exp(rng.normal(Math.log(row === 0 ? 0.004 : 0.0045), 0.33));
        const sy = size * rng.range(0.45, 0.8);
        const sz = size * rng.range(0.7, 1.1);
        const yaw = rng.range(0, Math.PI * 2);
        // footprint on the pane (lying pebbles, random heading)
        const wu = size * Math.abs(Math.cos(yaw)) + sz * Math.abs(Math.sin(yaw));
        const r = 0.5 * (wu + sy);
        const y = rng.range(-0.004, top - sy * 0.25);
        if (near(u, y, r)) continue;
        const o = { u, y, r };
        placed.push(o);
        const key = `${Math.floor(u / cell)},${Math.floor(y / cell)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(o);
        // depth into the tank: the front row's nose touches the glass
        const ext = size * Math.abs(Math.sin(yaw)) + sz * Math.abs(Math.cos(yaw));
        const inset = row === 0 ? ext * 0.92 + 0.0004 : ext * 0.9 + size * 1.25;
        const [px, pz] = along(u, inset);
        e.set(rng.range(-0.25, 0.25), yaw, rng.range(-0.25, 0.25));
        q.setFromEuler(e);
        s.set(size, sy, sz);
        p.set(px, y, pz);
        m4.compose(p, q, s);
        // light falls off with burial depth (and behind the front row)
        const bury = Math.max(0, top - y);
        const lit = (0.16 + 0.84 * Math.exp(-bury / 0.008)) * (row === 0 ? 1 : 0.45);
        const ci = Math.min(Math.floor((u / len + 0.5) * Math.max(1, Math.round(len / chunkLen))), 99);
        const [cxw, czw] = along(((ci + 0.5) / Math.max(1, Math.round(len / chunkLen)) - 0.5) * len, 0.01);
        tmpC.set(cxw, TANK.gravel * 0.5, czw);
        addTo(`${keyPrefix}${ci}`, tmpC, m4, pebbleColor(lit), (ci + row) % 3);
      }
    }
  };
  const fz = TANK.D / 2;
  const fx = TANK.L / 2;
  wallFace(TANK.L, (u, d) => [u, fz - d], 'z', 1, 0.2, 'wf');
  wallFace(TANK.D, (u, d) => [-fx + d, u], 'x', -1, 0.45, 'wl');
  wallFace(TANK.D, (u, d) => [fx - d, u], 'x', 1, 0.45, 'wr');

  // ---- build chunk LODs (all levels share one instance buffer) -------------
  const inv = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (const ch of chunks.values()) {
    const cnt = ch.items.length;
    if (!cnt) continue;
    const lod = new THREE.LOD();
    lod.position.copy(ch.center);
    inv.makeTranslation(-ch.center.x, -ch.center.y, -ch.center.z);
    const geos = shapes[ch.shape];
    let shared = null;
    geos.forEach((geo, li) => {
      const inst = new THREE.InstancedMesh(geo, mat, cnt);
      if (!shared) {
        ch.items.forEach((it, j) => {
          local.multiplyMatrices(inv, it.m);
          inst.setMatrixAt(j, local);
          inst.setColorAt(j, it.c);
        });
        shared = { m: inst.instanceMatrix, c: inst.instanceColor };
      } else {
        inst.instanceMatrix = shared.m;
        inst.instanceColor = shared.c;
      }
      inst.receiveShadow = true;
      inst.castShadow = false;
      inst.name = 'pebbles';
      lod.addLevel(inst, li === 0 ? 0 : LOD_NEAR);
    });
    group.add(lod);
  }

  // ---- dark backdrop behind the pebble rows (seen only through the gaps):
  // deep, shadowed sand and grit, darker toward the tank floor
  const sectionMat = patchUnderwater(new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.15 }), {
    key: 'gravelsection',
    caustics: false,
    extraColor: `
      {
        // in-plane coordinate (x on the front pane, z on the side panes)
        vec2 q = vec2(vUwWorld.x + vUwWorld.z, vUwWorld.y);
        float g = vnoise2(q * 900.0) * 0.6 + vnoise2(q * 260.0) * 0.4;
        vec3 c = vec3(0.05, 0.04, 0.03) * (0.5 + 0.9 * g);
        c *= 0.6 + 0.6 * vnoise2(q * 40.0);
        float depthDark = smoothstep(-0.004, ${TANK.gravel.toFixed(3)}, vUwWorld.y);
        diffuseColor.rgb = c * mix(0.25, 0.8, depthDark);
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
      pp.setXYZ(i, x, top ? groundHeight(x, z) - 0.0026 : -0.012, z);
    }
    geo.computeVertexNormals();
    return geo;
  };
  // set back behind the second pebble row
  const back = 0.016;
  const front = new THREE.Mesh(section(TANK.L, (u) => [u, TANK.D / 2 - back]), sectionMat);
  group.add(front);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(section(TANK.D, (u) => [sx * (TANK.L / 2 - back), u * sx]), sectionMat);
    group.add(side);
  }
  for (const m of group.children) if (m.material === sectionMat) m.receiveShadow = true;
  return group;
}
