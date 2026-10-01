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

function rockGeometry(radius, rng, sx, sy, sz, toneMul = 1) {
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
  // loose pebble-sized stones are washed river cobbles, as light as the gravel
  // around them (a near-black stone in a pale bed reads as a hole)
  const tone = STONE_TONES[Math.floor(rng.next() * STONE_TONES.length)].map((v) => v * toneMul);
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
        // (height above the local bed, which slopes up toward the back, so a
        // small loose stone is not filmed over as a whole)
        float bk = 0.5 - wp.z / ${TANK.D.toFixed(4)};
        float bed = ${TANK.gravel.toFixed(4)} + 0.028 * bk * bk;
        float low = smoothstep(0.03, 0.002, wp.y - bed);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.068, 0.045), low * 0.5);
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
    // a few loose stones (none in the open gravel at the centre, where the
    // low close-up cameras look along the bed: a stone there seen edge-on
    // shows a lit rim over a shaded flank and reads as a pit)
    { x: -0.12, z: 0.1, sx: 0.022, sy: 0.014, sz: 0.018, ry: 0.9, small: true },
    { x: 0.45, z: 0.06, sx: 0.028, sy: 0.016, sz: 0.02, ry: -1.3, small: true },
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of defs) {
    const radius = stoneShape(rng);
    const geo = rockGeometry(radius, rng, d.sx, d.sy, d.sz, d.small ? 2.1 : 1);
    const m = new THREE.Mesh(geo, mat);
    // bedded into the gravel (no visible flat underside)
    // (loose stones sink half into the bed: a stone perched on top shows a lit
    // rim over a shaded flank, which reads as a crater from a low camera)
    const y = groundHeight(d.x, d.z) + d.sy * (d.small ? -0.05 : 0.2);
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

// Vallisneria blades are built in world space (uv.y runs along the blade):
// the whole ribbon leans with the current and sways as one, the amplitude
// growing smoothly toward the tip (no kinks), and the part floating at the
// surface stays at the surface.
const ribbonSway = /* glsl */ `
{
  float h = uv.y;
  vPlantH = h;
  vPlantAge = aPlant.w;
  vPlantSeed = aPlant.x;
  vLeafUv = uv;
  float ph = aPlant.x;
  float t = uTime;
  float sway = sin(t * 0.7 + ph) * 0.55 + sin(t * 1.3 + ph * 2.3 - h * 2.5) * 0.25 + sin(t * 0.23 + ph * 0.7) * 0.4;
  float bend = h * h * (3.0 - 2.0 * h) * aPlant.y * aPlant.z * 2.2;
  vec3 dirW = normalize(uCurrent + vec3(0.0001));
  transformed.x += bend * (0.04 * sway + 0.05 * dirW.x);
  transformed.z += bend * (0.03 * cos(t * 0.9 + ph * 1.7) + 0.05 * dirW.z);
  transformed.y = min(transformed.y - bend * 0.012 * abs(sway), ${(TANK.water - 0.0015).toFixed(4)});
}
`;

// Vallisneria blade as one continuous ribbon built along a smooth centre
// line: it leaves the crown nearly upright, leans more and more toward the
// tip (its own weight and the filter current), drifts sideways in a gentle
// S, twists slowly about its own axis (the light runs along it in long
// bands) and, where it reaches the surface, arcs over smoothly and floats
// flat along it, as long tape grass does. Built in world space (the blades
// are merged into one mesh); uv: x across, y along the blade (0 base .. 1 tip).
const RIBBON_SEGS = 36;
// `xr` draws the per-blade irregularity (droop, surface arc, sinking tip) from
// its own stream so the rest of the planting keeps its layout.
function ribbonBlade(rng, base, len, width, xr) {
  // the floating run lies in the surface film (its mirror image in the
  // underside of the surface then joins it into one band, as a real
  // floating leaf does, instead of a second line a centimetre above)
  const surfY = TANK.water - 0.0018 - xr.range(0, 0.004) * 0.2;
  // the long blades that reach the surface are the old, broad ones
  if (len > 0.4) width *= 1.3;
  // radius of the arc over at the surface: stiff young blades turn late and
  // tight, old soft ones bow over in a long sweep
  const R = xr.range(0.035, 0.09);
  const lean0 = rng.range(0.03, 0.22);
  // some blades bow over under their own weight well below the surface,
  // most stay fairly upright (never past ~110°: a blade hanging back down
  // reads as a loop in mid-water)
  const curl = rng.range(0.15, 0.85) * (xr.next() < 0.3 ? xr.range(1.6, 2.8) : 1);
  const az0 = rng.range(0, Math.PI * 2);
  const drift = rng.range(-0.9, 0.9);
  const twist = rng.range(0.6, 2.8) * rng.sign();
  // a blade reaching the surface lies on it for a short run and ends there
  // (the floating tips of old blades are torn off / decayed): a wide flat
  // tape on the surface film, never a tip sinking back into the water
  const floatRun = xr.range(0.02, 0.09);
  xr.next(); // (former sinking-tip draw: keeps the per-blade stream aligned)
  // centre line by arc length s; the shape is a function of s / len, so a
  // blade cut short at the end of its floating run keeps its form
  const trace = (L) => {
    const ds = L / RIBBON_SEGS;
    const pts = [];
    const tans = [];
    const p = base.clone();
    let floated = 0;
    let cut = Infinity;
    for (let i = 0; i <= RIBBON_SEGS; i++) {
      const t = (i * ds) / len;
      let th = Math.min(lean0 + curl * Math.pow(t, 1.7), Math.PI * 0.61);
      const head = surfY - p.y;
      if (floated > 0 || head < R) {
        th = Math.max(Math.min(th, Math.PI / 2), (Math.PI / 2) * (1 - Math.max(0, head) / R));
        if (head < 0.003) {
          if (floated === 0) cut = i * ds + floatRun;
          floated += ds;
          th = Math.PI / 2;
        }
      }
      const az = az0 + drift * t;
      const d = new THREE.Vector3(Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az));
      pts.push(p.clone());
      tans.push(d);
      p.addScaledVector(d, ds);
      p.y = Math.min(p.y, surfY);
      p.x = THREE.MathUtils.clamp(p.x, -TANK.L / 2 + 0.012, TANK.L / 2 - 0.012);
      p.z = THREE.MathUtils.clamp(p.z, -TANK.D / 2 + 0.012, TANK.D / 2 - 0.012);
    }
    return { pts, tans, cut };
  };
  let { pts, tans, cut } = trace(len);
  if (cut < len) ({ pts, tans } = trace(cut));
  // tangents from the actual (clamped) centre line
  for (let i = 1; i < RIBBON_SEGS; i++) tans[i] = new THREE.Vector3().subVectors(pts[i + 1], pts[i - 1]).normalize();
  tans[RIBBON_SEGS] = new THREE.Vector3().subVectors(pts[RIBBON_SEGS], pts[RIBBON_SEGS - 1]).normalize();
  const pos = [];
  const uv = [];
  const up = new THREE.Vector3(0, 1, 0);
  // across-blade direction: parallel transported, slowly twisted, laid flat
  // where the blade floats
  const sa = az0 + Math.PI / 2 + rng.range(-1, 1);
  const side = new THREE.Vector3(Math.cos(sa), 0, Math.sin(sa));
  const flat = new THREE.Vector3();
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= RIBBON_SEGS; i++) {
    const t = i / RIBBON_SEGS;
    const T = tans[i];
    side.addScaledVector(T, -side.dot(T)).normalize();
    const floatW = THREE.MathUtils.smoothstep(pts[i].y, TANK.water - 0.025, TANK.water - 0.004);
    if (i > 0) side.applyQuaternion(q.setFromAxisAngle(T, (twist / RIBBON_SEGS) * (1 - floatW)));
    if (floatW > 0) {
      flat.crossVectors(T, up);
      if (flat.lengthSq() > 1e-6) {
        flat.normalize();
        if (flat.dot(side) < 0) flat.negate();
        // floating: the blade lies flat on the surface film (a tape, not
        // an edge-on wire)
        side.lerp(flat, floatW).normalize();
      }
    }
    // narrow sheath at the base, parallel sides, short blunt tip (blades
    // are at least 6 mm wide: narrower ones read as wires on the surface)
    // (floating parts slightly wider: the old outer blades that float are
    // the broadest, and a flat tape seen from below must not thin to a line)
    const w = Math.max(width, 0.006) * (1 + 0.45 * floatW) * (0.7 + 0.3 * THREE.MathUtils.smoothstep(t, 0, 0.06)) * Math.pow(Math.min(1, (1 - t) / 0.07), 0.55);
    n.crossVectors(side, T).normalize();
    for (let j = 0; j < 3; j++) {
      const a = j - 1; // -1, 0, 1
      // shallow channel: the midrib sits slightly behind the margins
      const off = a === 0 ? -0.0006 * (w / width) : 0;
      // floating: the margins cling to the surface film and the midrib sags
      // a little below them (a shallow trough, seen from below as a broad
      // band rather than a hairline)
      const sag = a === 0 ? floatW * 0.22 * w : 0;
      pos.push(pts[i].x + side.x * a * w * 0.5 + n.x * off, pts[i].y + side.y * a * w * 0.5 + n.y * off - sag, pts[i].z + side.z * a * w * 0.5 + n.z * off);
      uv.push(j / 2, t);
    }
  }
  return { pos, uv };
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

// Fine-leaved stem plants, built from real leaf geometry (no alpha cards):
//  * hornwort (Ceratophyllum): whorls of 9–11 stiff needle leaves, each
//    forked twice, rising from the stem; the whorls crowd into a dense
//    apical tuft, the lower stem is older and partly bare;
//  * Cabomba: opposite pairs of fans on short petioles, each fan a palm of
//    thread-like segments forking twice, opening nearly flat.
// Every leaf segment is a pair of crossed narrow strips (~0.6 mm), so the
// needles read from any side and stay crisp up close; at a distance the
// multisampled sub-pixel strips average into the soft, airy texture of a
// real whorl instead of a flat fern-like card. Normals are bent outward from
// the stem, so a whorl shades like a soft volume (lit on top, darker inside).
function stemPlantGeometry(rng, nodes, kind) {
  const fan = kind === 'fan';
  const pos = [];
  const nrm = [];
  const uvs = [];
  const idx = [];
  const W = fan ? 0.0019 : 0.0024; // strip width in unit-height space (instances are 0.14–0.38 m tall)
  const a1 = new THREE.Vector3();
  const a2 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const nOut = new THREE.Vector3();
  // one straight segment p0 -> p1 as two crossed strips; v0 / v1: position
  // along the leaf (uv.y), w0 / w1: half widths
  const segment = (p0, p1, v0, v1, w0, w1) => {
    const d = tmp.subVectors(p1, p0).normalize();
    a1.set(-d.z, 0, d.x);
    if (a1.lengthSq() < 1e-6) a1.set(1, 0, 0);
    a1.normalize();
    a2.crossVectors(d, a1).normalize();
    for (const ax of [a1, a2]) {
      const base = pos.length / 3;
      for (const [pp, v, w] of [[p0, v0, w0], [p1, v1, w1]]) {
        for (const sg of [-1, 1]) {
          pos.push(pp.x + ax.x * w * sg, pp.y + ax.y * w * sg, pp.z + ax.z * w * sg);
          // volume normal: outward from the stem axis and up
          nOut.set(pp.x, 0, pp.z);
          const r = nOut.length();
          if (r > 1e-5) nOut.multiplyScalar(1 / r);
          nOut.y = 0.55;
          nOut.normalize();
          nrm.push(nOut.x, nOut.y, nOut.z);
          uvs.push(0.5 + 0.5 * sg, v);
        }
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  };
  const up = new THREE.Vector3(0, 1, 0);
  // a branch from p along direction d (unit), length L, forking `levels`
  // times; `rise` bends each generation toward the vertical (stiff needles
  // curve up), `spread` is the fork half-angle, `plane` the fork axis
  const branch = (p, d, L, levels, v0, vLen, spread, rise, plane, w) => {
    const q = new THREE.Vector3().copy(d).lerp(up, rise).normalize();
    const e = p.clone().addScaledVector(q, L);
    const v1 = v0 + vLen;
    segment(p, e, v0, v1, w, w * 0.8);
    if (levels <= 0) return;
    const n = fan && levels === 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const ang = n === 3 ? (i - 1) * spread * 1.3 : (i === 0 ? -spread : spread);
      const nd = q.clone().applyAxisAngle(plane, ang + rng.range(-0.12, 0.12));
      branch(e, nd, L * rng.range(0.78, 0.95), levels - 1, v1, vLen, spread * 0.8, rise, plane, w * 0.8);
    }
  };
  // stem: a thin round-ish strip pair from the gravel to the apex
  {
    const segs = 10;
    let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 1; i <= segs; i++) {
      const cur = new THREE.Vector3(0, i / segs, 0);
      segment(prev, cur, 0.0, 0.0, 0.0024, 0.0018);
      prev = cur;
    }
  }
  let az0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < nodes; k++) {
    const t = (k + 0.5) / nodes;
    // internodes shorten toward the growing tip (dense apical tuft)
    const y = 0.03 + 0.95 * (1 - Math.pow(1 - t, 1.45));
    const tip = Math.pow(t, 3);
    // leaf length nearly constant along the stem (a cylindrical 'foxtail',
    // not a fir tree): only the youngest apical whorls are shorter
    const L = (fan ? 0.085 : 0.085) * (1 + 0.35 * rng.next()) * (1 - 0.4 * Math.pow(t, 6)) * (fan ? 1 - 0.3 * tip : 1);
    const c = new THREE.Vector3(0, y, 0);
    if (fan) {
      // opposite pair of fans, successive pairs crossed (decussate)
      az0 += Math.PI / 2 + rng.range(-0.15, 0.15);
      for (let j = 0; j < 2; j++) {
        const az = az0 + j * Math.PI;
        const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
        const el = THREE.MathUtils.lerp(0.25, 1.0, tip) + rng.range(-0.1, 0.1);
        const d = out.clone().multiplyScalar(Math.cos(el)).setY(Math.sin(el));
        // short petiole, then the palm opening in the near-horizontal plane
        const pe = c.clone().addScaledVector(d, L * 0.22);
        segment(c, pe, 0.0, 0.15, W * 0.6, W * 0.5);
        const plane = new THREE.Vector3().crossVectors(d, out.clone().cross(up)).normalize();
        for (let i = 0; i < 3; i++) {
          const nd = d.clone().applyAxisAngle(plane, (i - 1) * 0.55 + rng.range(-0.1, 0.1));
          branch(pe, nd, L * 0.3, 2, 0.15, 0.28, 0.32, 0.06, plane, W * 0.5);
        }
      }
    } else {
      // older lower whorls have lost some leaves
      const keep = THREE.MathUtils.lerp(0.55, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.35));
      const n = rng.int(9, 11);
      az0 += rng.range(0, Math.PI);
      for (let j = 0; j < n; j++) {
        if (rng.next() > keep) continue;
        const az = az0 + (j / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
        const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
        // leaves rise more steeply near the tip (closed apical tuft)
        const el = THREE.MathUtils.lerp(0.3, 1.15, tip) + rng.range(-0.3, 0.3);
        const d = out.clone().multiplyScalar(Math.cos(el)).setY(Math.sin(el));
        // forks spread across the leaf, each leaf rolled at random (no
        // regular fern-like rows)
        const plane = new THREE.Vector3().crossVectors(d, out.clone().cross(up).normalize()).normalize();
        plane.applyAxisAngle(d, rng.range(-1.0, 1.0));
        branch(c, d, L * 0.45, 2, 0.0, 0.34, 0.3, 0.12, plane, W * 0.5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  // stems are never quite straight: a gentle arc toward the light / current
  const bx = rng.range(-0.08, 0.08);
  const bz = rng.range(-0.08, 0.08);
  const mp = g.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const yy = mp.getY(i);
    mp.setX(i, mp.getX(i) + bx * yy * yy);
    mp.setZ(i, mp.getZ(i) + bz * yy * yy);
  }
  return g;
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
      extraVertex: kind === 'ribbon' ? ribbonSway : plantSway,
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
  const valMat = mkMat('val', 'ribbon', { vertexColors: true });
  const clumps = [
    { x: -0.5, z: -0.17, n: 26 },
    { x: -0.43, z: -0.19, n: 18 },
    { x: 0.47, z: -0.16, n: 28 },
    { x: 0.52, z: -0.19, n: 16 },
    { x: 0.2, z: -0.19, n: 20 },
    { x: -0.05, z: -0.2, n: 14 },
  ];
  const vPos = [];
  const vUv = [];
  const vCol = [];
  const vPlant = [];
  const vIdx = [];
  const xr = new RNG(5151);
  for (const c of clumps) {
    // each clump (one runner's daughters) has its own shade
    const hue = 0.24 + rng.range(-0.03, 0.03);
    const light = rng.range(0.24, 0.34);
    // and its own maturity: young clumps stay well below the surface, older
    // ones send a few long blades up to float (never an even fringe)
    const tall = [0.0, 0.07, 0.05, 0.0, 0.1, 0.03][clumps.indexOf(c)];
    const top = xr.range(0.3, 0.42);
    for (let i = 0; i < c.n; i++) {
      const x = c.x + rng.normal(0, 0.018);
      const z = c.z + rng.normal(0, 0.012);
      const u = (rng.range(0.2, 0.5) - 0.2) / 0.3;
      // mostly short-to-mid blades (skewed), a few long floaters
      const len = xr.next() < tall ? xr.range(0.44, 0.7) : 0.12 + (top - 0.12) * Math.pow(u, 0.8);
      const age = Math.pow(rng.next(), 1.6);
      // blade width 5–13 mm
      const { pos, uv } = ribbonBlade(rng, new THREE.Vector3(x, groundHeight(x, z) - 0.004, z), len, 0.009 * rng.range(0.6, 1.45), xr);
      leafColor(age, hue, light);
      const v0 = vPos.length / 3;
      const nv = pos.length / 3;
      const ph = rng.range(0, 6.28);
      const stiff = rng.range(0.7, 1.3);
      for (let j = 0; j < nv; j++) {
        vCol.push(col.r, col.g, col.b);
        vPlant.push(ph, stiff, len, age);
      }
      for (let s = 0; s < RIBBON_SEGS; s++) {
        for (let j = 0; j < 2; j++) {
          const a0 = v0 + s * 3 + j;
          const b0 = a0 + 3;
          vIdx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
        }
      }
      for (const v of pos) vPos.push(v);
      for (const v of uv) vUv.push(v);
    }
    colliders.push({ type: 'cylinder', center: new THREE.Vector3(c.x, 0, c.z), radius: 0.05, height: 0.4, soft: true });
  }
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(vPos, 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute(vUv, 2));
  leaf.setAttribute('color', new THREE.Float32BufferAttribute(vCol, 3));
  leaf.setAttribute('aPlant', new THREE.Float32BufferAttribute(vPlant, 4));
  leaf.setIndex(vIdx);
  leaf.computeVertexNormals();
  const valMesh = new THREE.Mesh(leaf, valMat);
  valMesh.name = 'vallisneria';
  valMesh.castShadow = true;
  valMesh.receiveShadow = true;
  group.add(valMesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let k = 0;
  let total = 0;

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
    fan: mkMat('stemF', 'stem'),
    needle: mkMat('stemN', 'stem'),
  };
  const bunches = [
    { x: -0.11, z: -0.19, n: 7, hue: 0.27, light: 0.28, h: [0.24, 0.38], kind: 'fan' },
    { x: 0.37, z: -0.19, n: 6, hue: 0.29, light: 0.22, h: [0.22, 0.36], kind: 'needle' },
    { x: -0.55, z: 0.06, n: 5, hue: 0.26, light: 0.3, h: [0.14, 0.24], kind: 'fan' },
    { x: 0.27, z: -0.17, n: 4, hue: 0.28, light: 0.24, h: [0.18, 0.3], kind: 'needle' },
  ];
  const stemVariants = [];
  for (const kind of ['fan', 'needle']) for (const w of kind === 'fan' ? [16, 20] : [22, 27]) stemVariants.push({ kind, geo: stemPlantGeometry(rng, w, kind), list: [] });
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
