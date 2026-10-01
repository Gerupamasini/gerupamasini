// Rocks and aquatic plants (Vallisneria ribbons, sword-plant rosettes).
// Plants sway in the filter current with height-dependent bending in the
// vertex shader and vary in shade, width and condition (old leaves yellow
// and brown from the tip); rocks are fractured, weathered stones bedded into
// the gravel. Both register colliders used by the fish obstacle avoidance.

import * as THREE from 'three';
import { RNG, noise3 } from '../core/random.js';
import { TANK } from './TankConfig.js';
import { groundHeight } from './Substrate.js';
import { patchUnderwater } from './UnderwaterMaterial.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A weathered stone: a noisy ellipsoid cut by a few fracture planes (a soft
// minimum keeps the edges rounded by erosion), with fine fracture roughness
// and faint strata. `radius(dir)` is the radial function in the stone's unit
// frame; it is also used to keep the gravel out of the stone's footprint.
function stoneShape(rng) {
  const o = rng.range(0, 100);
  const planes = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    // fracture faces on the sides and top (the bottom is buried)
    const th = rng.range(0, Math.PI * 2);
    const el = rng.range(-0.2, 1.15);
    planes.push({ n: new THREE.Vector3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)), d: rng.range(0.64, 0.86) });
  }
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const radius = (d) => {
    let r = 1 + 0.14 * noise3(d.x * 1.4 + o, d.y * 1.4, d.z * 1.4) + 0.05 * noise3(d.x * 3.3, d.y * 3.3 + o, d.z * 3.3);
    for (const p of planes) {
      const c = d.x * p.n.x + d.y * p.n.y + d.z * p.n.z;
      if (c > 0.05) r = smin(r, p.d / c, 0.1);
    }
    r += 0.016 * noise3(d.x * 9 + o, d.y * 9, d.z * 9 - o) + 0.006 * noise3(d.x * 23, d.y * 23 + o, d.z * 23);
    r += 0.006 * Math.sin((d.y + 0.25 * d.x) * 26 + o);
    return r;
  };
  return radius;
}

// natural stone albedos (linear): grey-brown, dark slate, warm ochre-grey
const STONE_TONES = [
  [0.135, 0.122, 0.105],
  [0.095, 0.1, 0.1],
  [0.17, 0.138, 0.1],
  [0.12, 0.11, 0.095],
];

function rockGeometry(radius, rng, sx, sy, sz) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 5));
  const p = g.attributes.position;
  const d = new THREE.Vector3();
  const o = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const r = radius(d);
    p.setXYZ(i, d.x * r * sx, d.y * r * sy, d.z * r * sz);
  }
  g.computeVertexNormals();
  // per-vertex curvature (umbrella operator): concave cavities stay wet and
  // dark and collect sediment, convex edges are worn lighter
  const idx = g.index.array;
  const sum = new Float32Array(p.count * 3);
  const cnt = new Float32Array(p.count);
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t + k];
      for (const b of [idx[t + ((k + 1) % 3)], idx[t + ((k + 2) % 3)]]) {
        sum[a * 3] += p.getX(b);
        sum[a * 3 + 1] += p.getY(b);
        sum[a * 3 + 2] += p.getZ(b);
        cnt[a]++;
      }
    }
  }
  const nrm = g.attributes.normal;
  const tone = STONE_TONES[Math.floor(rng.next() * STONE_TONES.length)];
  const scale = Math.min(sx, sy, sz);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const lx = sum[i * 3] / cnt[i] - p.getX(i);
    const ly = sum[i * 3 + 1] / cnt[i] - p.getY(i);
    const lz = sum[i * 3 + 2] / cnt[i] - p.getZ(i);
    const curv = (lx * nrm.getX(i) + ly * nrm.getY(i) + lz * nrm.getZ(i)) / (scale * 0.02);
    const cav = THREE.MathUtils.smoothstep(curv, 0.02, 0.35);
    const edge = THREE.MathUtils.smoothstep(-curv, 0.05, 0.4);
    const x = p.getX(i) / scale;
    const y = p.getY(i) / scale;
    const z = p.getZ(i) / scale;
    // mineral banding and mottling
    const band = 0.5 + 0.5 * Math.sin((y * 3.1 + 0.4 * x) * 2.2 + 1.7 * noise3(x * 0.8 + o, y * 0.8, z * 0.8));
    const mott = noise3(x * 2.5, y * 2.5 + o, z * 2.5);
    const b = (0.86 + 0.18 * band + 0.16 * mott) * (1 - 0.5 * cav) * (1 + 0.18 * edge);
    const warm = 0.03 * mott;
    col[i * 3] = tone[0] * b * (1 + warm);
    col[i * 3 + 1] = tone[1] * b;
    col[i * 3 + 2] = tone[2] * b * (1 - warm * 1.5);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function buildRocks() {
  const rng = new RNG(777);
  const group = new THREE.Group();
  group.name = 'rocks';
  const colliders = [];
  const footprints = []; // exact stone footprints (gravel scattering)
  // Under water the stone/water interface reflects only ~0.6 % (IOR ratio
  // 1.55 / 1.33), so the stones look matte: no air-like specular sheen.
  // Shader detail: fracture-scale bump, mineral grains, patchy algae on the
  // upward faces, a sediment film near the gravel line.
  const mat = patchUnderwater(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, ior: 1.17, envMapIntensity: 0.7 }), {
    key: 'rock',
    extraColor: `
      {
        vec3 wp = vUwWorld;
        float gr = fbm3(wp * 24.0);
        float sp = vnoise3(wp * 170.0);
        diffuseColor.rgb *= 0.8 + 0.4 * gr;
        diffuseColor.rgb *= 1.0 + 0.3 * smoothstep(0.82, 0.9, sp) - 0.25 * smoothstep(0.16, 0.08, sp);
        vec3 nW = inverseTransformDirection(normalize(vNormal), viewMatrix);
        float top = smoothstep(0.2, 0.85, nW.y);
        float patchy = smoothstep(0.4, 0.68, fbm3(wp * 13.0 + 3.0));
        vec3 algae = vec3(0.045, 0.07, 0.022) * (0.7 + 0.6 * vnoise3(wp * 90.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, algae, top * patchy * 0.8);
        // brownish diatom / mulm film where the stone meets the gravel
        float low = smoothstep(0.075, 0.035, wp.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.068, 0.045), low * 0.6);
      }`,
    extraNormal: `
      {
        vec3 p = vUwWorld * 70.0;
        float e = 0.35;
        float h0 = fbm3(p);
        vec3 g = vec3(fbm3(p + vec3(e, 0.0, 0.0)) - h0, fbm3(p + vec3(0.0, e, 0.0)) - h0, fbm3(p + vec3(0.0, 0.0, e)) - h0) / e;
        vec3 gv = (viewMatrix * vec4(g, 0.0)).xyz;
        normal = normalize(normal - (gv - normal * dot(gv, normal)) * 0.8);
      }`,
  });
  const defs = [
    { x: -0.34, z: -0.12, sx: 0.13, sy: 0.1, sz: 0.085, ry: 0.4 },
    { x: -0.2, z: -0.15, sx: 0.07, sy: 0.055, sz: 0.06, ry: 1.2 },
    { x: 0.33, z: -0.1, sx: 0.1, sy: 0.075, sz: 0.075, ry: -0.6 },
    { x: 0.08, z: 0.05, sx: 0.045, sy: 0.03, sz: 0.04, ry: 2.2 },
    // a few loose stones
    { x: -0.12, z: 0.1, sx: 0.022, sy: 0.014, sz: 0.018, ry: 0.9, small: true },
    { x: 0.45, z: 0.06, sx: 0.028, sy: 0.016, sz: 0.02, ry: -1.3, small: true },
    { x: 0.2, z: -0.02, sx: 0.018, sy: 0.012, sz: 0.015, ry: 2.6, small: true },
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of defs) {
    const radius = stoneShape(rng);
    const geo = rockGeometry(radius, rng, d.sx, d.sy, d.sz);
    const m = new THREE.Mesh(geo, mat);
    // bedded into the gravel (no visible flat underside)
    const y = groundHeight(d.x, d.z) + d.sy * (d.small ? 0.3 : 0.2);
    m.position.set(d.x, y, d.z);
    m.rotation.y = d.ry;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    const center = new THREE.Vector3(d.x, y, d.z);
    const q = new THREE.Vector3();
    // exact footprint test for the gravel scattering
    const contains = (x, yy, z, margin = 0) => {
      q.set(x - center.x, yy - center.y, z - center.z).applyAxisAngle(up, -d.ry);
      q.set(q.x / d.sx, q.y / d.sy, q.z / d.sz);
      const l = q.length();
      if (l < 1e-6) return true;
      return l < radius(q.divideScalar(l)) * (1 - margin);
    };
    footprints.push({ center, radius: Math.max(d.sx, d.sz), contains });
    // loose pebble-sized stones are not obstacles for the fish
    if (!d.small) colliders.push({ type: 'ellipsoid', center, radii: new THREE.Vector3(d.sx * 1.1, d.sy * 1.15, d.sz * 1.1), radius: Math.max(d.sx, d.sz) });
  }
  return { group, colliders, footprints };
}

// ----------------------------------------------------------------- plants
const plantSwayPars = /* glsl */ `
in vec4 aPlant; // x: phase, y: stiffness, z: height, w: leaf age / condition (0 fresh .. 1 old)
uniform vec3 uCurrent;
out float vPlantH;
out float vPlantAge;
out float vPlantSeed;
out vec2 vLeafUv;
`;
const plantSway = /* glsl */ `
{
  float h = clamp(position.y / max(aPlant.z, 1e-3), 0.0, 1.0);
  vPlantH = h;
  vPlantAge = aPlant.w;
  vPlantSeed = aPlant.x;
  vLeafUv = uv;
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
  const g = new THREE.PlaneGeometry(width, len, 2, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / len;
    const x = p.getX(i);
    // tapering tip & slight natural twist/curl; the blade is gently
    // channelled (edges forward), never a flat strip
    const w = (1 - Math.pow(t, 6)) * (0.8 + 0.2 * (1 - t));
    p.setX(i, x * w);
    p.setZ(i, 0.01 * Math.sin(t * 3.1) * t + (x * w) * (x * w) * 40.0);
  }
  g.computeVertexNormals();
  return g;
}

// Amazon-sword leaf: long petiole, lanceolate blade with a slightly wavy
// margin, cupped either side of the sunken midrib, arching outward.
function swordLeafGeometry(len, width) {
  const segs = 16;
  const g = new THREE.PlaneGeometry(width, len, 6, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / len;
    const x0 = p.getX(i) / width; // -0.5 .. 0.5
    const bt = Math.min(1, Math.max(0, (t - 0.28) / 0.72));
    const blade = Math.pow(Math.sin(bt * Math.PI), 0.62) * (1 - 0.25 * bt);
    const w = t < 0.3 ? 0.07 : Math.max(0.06, blade);
    const x = x0 * width * w;
    p.setX(i, x);
    // arch outward
    let z = 0.35 * len * t * t;
    // cupped blade, sunken midrib
    z -= Math.abs(x) * 0.22 - x * x * 3.5;
    // wavy margin
    z += Math.abs(x0) * 2 * 0.012 * len * Math.sin(t * 38 + x0 * 3) * (t > 0.3 ? 1 : 0);
    p.setZ(i, z);
    p.setY(i, y * (1 - 0.25 * t));
  }
  g.computeVertexNormals();
  return g;
}

// Fine-leaved stem plants. Each whorl leaf is a pair of crossed cards with a
// forked-needle texture (hornwort) or a finely dissected fan (Cabomba):
// mip-mapped alpha keeps them feathery at a distance instead of breaking up
// into single-pixel speckle, alpha-to-coverage keeps the edges smooth up
// close. Normals are bent outward from the stem, so a whorl shades like a
// soft volume (lit on top, darker inside) instead of a flicker of facets.
function leafTexture(kind) {
  const W = 128;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  // white on opaque black: three.js reads alpha maps from the green channel,
  // so it carries the antialiased coverage
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const rng = new RNG(kind === 'fan' ? 61 : 17);
  const seg = (x0, y0, x1, y1, w0, w1, bend) => {
    // tapered, slightly curved segment drawn as short pieces
    const n = 10;
    let px = x0;
    let py = y0;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t + bend * Math.sin(t * Math.PI);
      const y = y0 + (y1 - y0) * t;
      g.lineWidth = w0 + (w1 - w0) * t;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(x, y);
      g.stroke();
      // tiny marginal teeth on hornwort needles
      if (kind === 'needle' && k % 3 === 0 && rng.next() < 0.7) {
        const s = rng.next() < 0.5 ? -1 : 1;
        g.lineWidth = 1.0;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + s * 3, y - 3);
        g.stroke();
      }
      px = x;
      py = y;
    }
  };
  if (kind === 'needle') {
    // twice-forked needle (Ceratophyllum)
    const fy1 = 150;
    const fy2 = 78;
    seg(64, 254, 64, fy1, 5.5, 4.2, rng.range(-3, 3));
    for (const s of [-1, 1]) {
      const x2 = 64 + s * 22;
      seg(64, fy1, x2, fy2, 4.0, 3.0, s * 3);
      for (const s2 of [-1, 1]) seg(x2, fy2, x2 + s * 10 + s2 * 16, 4 + rng.range(0, 14), 2.8, 1.2, s2 * 3);
    }
  } else {
    // fan of finely divided segments (Cabomba)
    seg(64, 254, 64, 200, 4.5, 3.8, 0);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 1.5;
      const L = 120 + rng.range(-10, 10);
      const xm = 64 + Math.sin(a) * L * 0.55;
      const ym = 200 - Math.cos(a) * L * 0.55;
      seg(64, 200, xm, ym, 3.4, 2.6, a * 6);
      for (const s2 of [-1, 1]) {
        const a2 = a + s2 * 0.22;
        seg(xm, ym, xm + Math.sin(a2) * L * 0.5, ym - Math.cos(a2) * L * 0.5, 2.4, 1.1, s2 * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

function stemPlantGeometry(rng, whorls, kind) {
  const parts = [];
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const fan = kind === 'fan';
  // one leaf: two crossed, slightly curled cards, uv (0..1 across, 0..1 along)
  const leafCards = (len) => {
    const w = len * (fan ? 0.85 : 0.55);
    const out = [];
    for (const rot of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(w, len, 1, 2);
      g.translate(0, len / 2, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / len;
        // curls upward toward the tip
        p.setZ(i, 0.18 * len * t * t);
      }
      g.rotateY(rot);
      out.push(g);
    }
    return out;
  };
  // stem: two crossed thin strips
  for (const a of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(0.0035, 1, 1, 8);
    g.translate(0, 0.5, 0);
    g.rotateY(a);
    // the stem samples a solid part of the texture (the needle's base)
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.02);
    parts.push(g);
  }
  const nLeaves = fan ? 5 : 8;
  for (let k = 0; k < whorls; k++) {
    const t = (k + 0.5) / whorls;
    const y = 0.04 + 0.94 * Math.pow(t, 0.9);
    const len = (fan ? 0.085 : 0.1) * (1 + 0.45 * rng.next()) * (1 - 0.6 * Math.pow(t, 3));
    const az0 = rng.range(0, Math.PI * 2);
    for (let j = 0; j < nLeaves; j++) {
      const az = az0 + (j / nLeaves) * Math.PI * 2 + rng.range(-0.2, 0.2);
      // leaves rise more steeply near the tip (closed apical tuft)
      const lift = THREE.MathUtils.lerp(fan ? 0.15 : 0.3, 1.05, t * t) + rng.range(-0.15, 0.15);
      for (const g of leafCards(len)) {
        g.rotateZ(rng.range(-0.15, 0.15));
        // tilt out from the stem, then turn to the leaf azimuth
        g.rotateX(-(Math.PI / 2 - lift));
        q.setFromAxisAngle(up, az);
        m4.makeRotationFromQuaternion(q).setPosition(0, y, 0);
        g.applyMatrix4(m4);
        parts.push(g);
      }
    }
  }
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  // stems are never quite straight: a gentle arc toward the light / current
  const bx = rng.range(-0.08, 0.08);
  const bz = rng.range(-0.08, 0.08);
  const mp = merged.attributes.position;
  const nrm = merged.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < mp.count; i++) {
    const yy = mp.getY(i);
    // volume normal: outward from the stem axis and up
    v.set(mp.getX(i), 0, mp.getZ(i));
    const r = v.length();
    if (r > 1e-5) v.multiplyScalar(1 / r);
    v.y = 0.55;
    v.normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
    mp.setX(i, mp.getX(i) + bx * yy * yy);
    mp.setZ(i, mp.getZ(i) + bz * yy * yy);
  }
  return merged;
}

export function buildPlants() {
  const rng = new RNG(99);
  const group = new THREE.Group();
  group.name = 'plants';
  const colliders = [];
  const current = { value: new THREE.Vector3(0.6, 0, 0.15) };

  // Leaves under water: the cuticle/water interface reflects almost nothing
  // (low IOR ratio), so they are matte; thin blades transmit yellow-green
  // light when seen against the hood light. `kind` selects the leaf
  // structure drawn in leaf space (uv: across, along).
  const mkMat = (key, kind, extra = {}) => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, ior: 1.1, side: THREE.DoubleSide, ...extra });
    const structure = {
      // Vallisneria: 3–5 parallel longitudinal veins, faint cross-veinlets,
      // a paler translucent margin
      ribbon: `
          float ax = abs(vLeafUv.x - 0.5) * 2.0;
          float lv = abs(fract(ax * 2.0 + 0.5) - 0.5);
          diffuseColor.rgb *= 0.9 + 0.12 * smoothstep(0.12, 0.0, lv);
          float cv = abs(fract(vLeafUv.y * 160.0 + vPlantSeed) - 0.5);
          diffuseColor.rgb *= 1.0 - 0.05 * smoothstep(0.08, 0.0, cv);
          diffuseColor.rgb *= mix(1.0, 1.15, smoothstep(0.7, 1.0, ax));`,
      // Amazon sword: pale sunken midrib, two pairs of arcuate veins
      // converging at the tip, fine oblique cross-veins, darker blade between,
      // a few holes and torn margins on older leaves
      sword: `
          float sx = (vLeafUv.x - 0.5) * 2.0;
          float ax = abs(sx);
          float bl = smoothstep(0.26, 0.34, vLeafUv.y);
          float mid = smoothstep(0.07, 0.015, ax) * bl;
          float arc = smoothstep(0.035, 0.0, abs(ax - 0.36)) + 0.8 * smoothstep(0.03, 0.0, abs(ax - 0.7));
          float cross = smoothstep(0.06, 0.0, abs(fract(vLeafUv.y * 46.0 - ax * 2.2 + vPlantSeed) - 0.5) - 0.44);
          vec3 vein = diffuseColor.rgb * vec3(1.25, 1.3, 0.85);
          diffuseColor.rgb *= 0.86 + 0.1 * vnoise2(vLeafUv * vec2(9.0, 40.0) + vPlantSeed);
          diffuseColor.rgb = mix(diffuseColor.rgb, vein, clamp(mid * 0.8 + arc * 0.4 * bl + cross * 0.12 * bl, 0.0, 1.0));
          float dmg = smoothstep(0.5, 0.95, vPlantAge);
          float hole = vnoise2(vLeafUv * vec2(14.0, 55.0) + vPlantSeed * 3.1);
          if (bl > 0.5 && dmg > 0.0 && hole > 0.92 - 0.05 * dmg && ax < 0.8) discard;
          // an occasional nibbled margin (goldfish graze on soft leaves)
          float tear = vnoise2(vec2(vLeafUv.y * 18.0, vPlantSeed));
          if (bl > 0.5 && ax > 0.97 - 0.14 * dmg * smoothstep(0.62, 0.8, tear)) discard;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.08, 0.03), smoothstep(0.75, 0.97, ax) * dmg * 0.7);`,
      // stem plants: slight lighter tips, darker inner leaves
      stem: `
          diffuseColor.rgb *= mix(0.8, 1.1, vLeafUv.y);`,
    }[kind];
    patchUnderwater(m, {
      extraVertexPars: plantSwayPars,
      extraVertex: plantSway,
      extraFragmentPars: 'in float vPlantH;\nin float vPlantAge;\nin float vPlantSeed;\nin vec2 vLeafUv;\n',
      key,
      extraColor: `
        {
          ${structure}
          diffuseColor.rgb *= 1.0 + 0.16 * (vnoise3(vUwWorld * 35.0) - 0.5);
          // older leaves yellow and brown from the tip, with small dead spots
          float age = vPlantAge;
          vec3 brown = vec3(0.13, 0.08, 0.03) * (0.75 + 0.5 * vnoise3(vUwWorld * 110.0));
          float tip = smoothstep(1.0 - 0.45 * age, 1.02, vPlantH) * smoothstep(0.35, 0.6, age);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * vec3(1.2, 1.05, 0.4), brown, smoothstep(0.3, 0.8, tip)), tip);
          float spots = smoothstep(0.74, 0.82, vnoise3(vUwWorld * 150.0 + age * 13.0)) * smoothstep(0.55, 0.85, age);
          diffuseColor.rgb = mix(diffuseColor.rgb, brown, spots * 0.75);
          // a film of fine sediment / diatoms on the lower leaves
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.4, vPlantH));
          ${kind === 'stem' ? `
          // keep the needle coverage at a distance (alpha of the coarser mips
          // is rescaled, so whorls neither vanish nor turn to speckle)
          {
            vec2 tx = vAlphaMapUv * vec2(128.0, 256.0);
            float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
            diffuseColor.a *= 1.0 + 0.22 * lod;
          }` : ''}
        }`,
      extraLights: `
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lp = directionalLights[0].direction;
          float NL = dot(normal, Lp);
          vec3 Vp = normalize(vViewPosition);
          // diffuse transmission through the thin blade, strongest when
          // looking toward the light through it
          float back = saturate(-NL) * (0.45 + 0.9 * spow(saturate(dot(Vp, -Lp)), 3.0));
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * vec3(0.75, 1.0, 0.35) * back * uwDirect * 0.6;
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

  const col = new THREE.Color();
  // leaf colour: mostly greens of different depth, some yellow-green young
  // blades and a few old yellow-brown ones (sRGB HSL)
  const leafColor = (age, hue0, light0) => {
    if (age > 0.85) return col.setHSL(rng.range(0.11, 0.16), rng.range(0.35, 0.55), rng.range(0.2, 0.3));
    return col.setHSL(hue0 + rng.range(-0.04, 0.05), rng.range(0.32, 0.62), light0 * rng.range(0.7, 1.25));
  };

  // Vallisneria clumps at the back
  const valMat = mkMat('val', 'ribbon');
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
  for (const c of clumps) {
    // each clump (one runner's daughters) has its own shade
    const hue = 0.24 + rng.range(-0.03, 0.03);
    const light = rng.range(0.24, 0.34);
    for (let i = 0; i < c.n; i++) {
      const x = c.x + rng.normal(0, 0.018);
      const z = c.z + rng.normal(0, 0.012);
      const len = rng.range(0.2, 0.44);
      const age = Math.pow(rng.next(), 1.6);
      e.set(rng.range(-0.18, 0.18), rng.range(0, Math.PI * 2), rng.range(-0.18, 0.18));
      q.setFromEuler(e);
      // blade width 5–13 mm
      m4.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.004, z), q, new THREE.Vector3(rng.range(0.6, 1.45), len, 1));
      inst.setMatrixAt(k, m4);
      inst.setColorAt(k, leafColor(age, hue, light));
      aPlant[k * 4] = rng.range(0, 6.28);
      aPlant[k * 4 + 1] = rng.range(0.7, 1.3);
      aPlant[k * 4 + 2] = 1.0; // geometry height (unit leaf scaled by instance matrix)
      aPlant[k * 4 + 3] = age;
      k++;
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(c.x, 0, c.z), radius: 0.05, height: 0.4, soft: true });
  }
  leaf.setAttribute('aPlant', new THREE.InstancedBufferAttribute(aPlant, 4));
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);

  // Sword-plant rosettes
  const swordMat = mkMat('sword', 'sword');
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
    const hue = 0.27 + rng.range(-0.02, 0.02);
    for (let i = 0; i < r.n; i++) {
      const len = r.s * rng.range(0.7, 1.2);
      // outer (older, longer, flatter) leaves age first
      const age = Math.min(1, Math.pow(rng.next(), 1.4) * 0.8 + (len / r.s - 0.7) * 0.4);
      e.set(0, (i / r.n) * Math.PI * 2 + rng.range(-0.2, 0.2), 0, 'YXZ');
      q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rng.range(0.1, 0.5));
      q.multiply(tilt);
      m4.compose(new THREE.Vector3(r.x, groundHeight(r.x, r.z) - 0.003, r.z), q, new THREE.Vector3(len * rng.range(0.75, 1.2), len, len));
      sInst.setMatrixAt(k, m4);
      sInst.setColorAt(k, leafColor(age, hue, 0.24));
      aP2[k * 4] = rng.range(0, 6.28);
      aP2[k * 4 + 1] = rng.range(0.2, 0.4);
      aP2[k * 4 + 2] = 1.0;
      aP2[k * 4 + 3] = age;
      k++;
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(r.x, 0, r.z), radius: r.s * 0.75, height: r.s * 0.9, soft: true });
  }
  sLeaf.setAttribute('aPlant', new THREE.InstancedBufferAttribute(aP2, 4));
  sInst.castShadow = true;
  sInst.receiveShadow = true;
  group.add(sInst);

  // Fine-leaved stem plants (bright Cabomba-like fans and darker hornwort-
  // like needle whorls) in the gaps between rocks and ribbons
  const stemMats = {
    fan: mkMat('stemF', 'stem', { alphaMap: leafTexture('fan'), alphaTest: 0.3, alphaToCoverage: true }),
    needle: mkMat('stemN', 'stem', { alphaMap: leafTexture('needle'), alphaTest: 0.3, alphaToCoverage: true }),
  };
  const bunches = [
    { x: -0.11, z: -0.19, n: 7, hue: 0.27, light: 0.28, h: [0.24, 0.38], kind: 'fan' },
    { x: 0.37, z: -0.19, n: 6, hue: 0.29, light: 0.22, h: [0.22, 0.36], kind: 'needle' },
    { x: -0.55, z: 0.06, n: 5, hue: 0.26, light: 0.3, h: [0.14, 0.24], kind: 'fan' },
    { x: 0.27, z: -0.17, n: 4, hue: 0.28, light: 0.24, h: [0.18, 0.3], kind: 'needle' },
  ];
  const stemVariants = [];
  for (const kind of ['fan', 'needle']) for (const w of kind === 'fan' ? [18, 22] : [24, 30]) stemVariants.push({ kind, geo: stemPlantGeometry(rng, w, kind), list: [] });
  for (const b of bunches) {
    const vars = stemVariants.filter((v) => v.kind === b.kind);
    for (let i = 0; i < b.n; i++) {
      const x = b.x + rng.normal(0, 0.015);
      const z = b.z + rng.normal(0, 0.01);
      const hgt = rng.range(b.h[0], b.h[1]);
      const age = Math.pow(rng.next(), 2.2);
      e.set(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12));
      q.setFromEuler(e);
      vars[Math.floor(rng.next() * vars.length)].list.push({
        m: new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(x, z) - 0.006, z), q.clone(), new THREE.Vector3(hgt, hgt, hgt)),
        c: col.setHSL(b.hue + rng.range(-0.015, 0.015), rng.range(0.42, 0.6), b.light * rng.range(0.85, 1.15)).clone(),
        a: [rng.range(0, 6.28), rng.range(0.45, 0.8), 1.0, age],
      });
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(b.x, 0, b.z), radius: 0.045, height: b.h[1], soft: true });
  }
  for (const v of stemVariants) {
    const list = v.list;
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(v.geo, stemMats[v.kind], list.length);
    const ap = new Float32Array(list.length * 4);
    list.forEach((it, j) => {
      im.setMatrixAt(j, it.m);
      im.setColorAt(j, it.c);
      ap.set(it.a, j * 4);
    });
    v.geo.setAttribute('aPlant', new THREE.InstancedBufferAttribute(ap, 4));
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }
  return { group, colliders, current };
}
