// Aquascape: sand bed, live rock, and a selection of Indo-Pacific corals.
import * as THREE from 'three';
import { TANK } from './config.js';
import { mulberry32, fbm3, ridged3, perlin3 } from './noise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const NOISE_GLSL = /* glsl */`
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbmS(vec3 p){ float a = 0.5, r = 0.0; for (int i = 0; i < 5; i++){ r += a * vn3(p); p = p * 2.03 + 1.7; a *= 0.5; } return r; }
`;

// Shader-side bump from a procedural height: perturb the normal with screen derivatives.
const BUMP_GLSL = /* glsl */`
vec3 bumpN(vec3 n, vec3 pos, float h, float scale){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - scale * g);
}
`;

function patch(material, { vert = '', frag = '', color = '', normal = '', rough = '', key }) {
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vWorldN;\n' + vert)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;\nvWorldN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vWorldN;\n' + NOISE_GLSL + BUMP_GLSL + frag)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + color)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + rough)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normal);
  };
  material.customProgramCacheKey = () => key;
}

// ---------------------------------------------------------------- sand -------------

function sandHeight(x, z) {
  // gentle slope up toward the back, dunes, and fine ripples
  let h = 0.055 + 0.03 * (-z / TANK.d + 0.5);
  h += 0.012 * fbm3(x * 3.2, 0.3, z * 3.2, 4);
  h += 0.0025 * Math.sin(x * 55 + 6 * fbm3(x * 2, 1.7, z * 2, 2)) * (0.6 + 0.4 * perlin3(x * 4, 2.2, z * 4));
  return h;
}

function createSand() {
  const geo = new THREE.PlaneGeometry(TANK.w, TANK.d, 360, 170);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, sandHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  patch(mat, {
    key: 'sand',
    color: /* glsl */`{
      vec3 q = vObjP * 900.0;
      float g = vn3(q), g2 = vn3(q * 0.37 + 11.0), g3 = h13(floor(q * 0.5));
      vec3 base = mix(vec3(0.33, 0.3, 0.24), vec3(0.45, 0.41, 0.33), g);
      base = mix(base, vec3(0.62, 0.55, 0.47), smoothstep(0.82, 0.95, g2) * 0.7);   // darker grains
      base = mix(base, vec3(0.9, 0.62, 0.62), step(0.985, g3) * 0.6);               // pink shell bits
      base = mix(base, vec3(0.3, 0.28, 0.26), step(0.995, h13(floor(q * 0.8) + 3.0)) * 0.8);
      float patchy = fbmS(vObjP * 6.0);
      base *= 0.82 + 0.3 * patchy;
      // coarse aragonite: millimetre-to-centimetre rubble grains of varied tone, visible at viewing distance
      vec3 cq = vObjP * 260.0; vec3 ci = floor(cq); vec3 cf3 = fract(cq) - 0.5;
      float rg = h13(ci + 7.0), rd = length(cf3.xz + (vec2(h13(ci), h13(ci + 2.0)) - 0.5) * 0.5);
      float grain = step(0.72, rg) * smoothstep(0.32, 0.18, rd);
      base = mix(base, base * mix(0.55, 1.25, h13(ci + 5.0)) * mix(vec3(1.0), vec3(1.05, 0.92, 0.85), step(0.5, h13(ci + 9.0))), grain);
      base *= 0.85 + 0.15 * vn3(vObjP * 80.0);                                // mid-scale mottling
      base = mix(base, base * vec3(0.72, 0.74, 0.62), smoothstep(0.55, 0.75, fbmS(vObjP * 14.0 + 4.0)) * 0.5);   // detritus / diatom film
      diffuseColor.rgb *= base;
    }`,
    normal: /* glsl */`{
      float hq = vn3(vObjP * 900.0) * 0.6 + vn3(vObjP * 2200.0) * 0.4;
      vec3 cq = vObjP * 260.0; vec3 ci = floor(cq); vec3 cf3 = fract(cq) - 0.5;
      float rd = length(cf3.xz + (vec2(h13(ci), h13(ci + 2.0)) - 0.5) * 0.5);
      hq += step(0.72, h13(ci + 7.0)) * smoothstep(0.32, 0.1, rd) * 1.5 + vn3(vObjP * 80.0) * 0.8;
      normal = bumpN(normal, -vViewPosition, hq, 0.0006);
    }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.name = 'sand';
  return m;
}

// ---------------------------------------------------------------- live rock --------

function rockGeometry(seed, r, stretch = [1, 0.7, 1], detail = 6) {
  let geo = new THREE.IcosahedronGeometry(r, detail);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const o = seed * 13.7;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    // domain warp gives the folded, eroded look of reef limestone
    const wx = fbm3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3, 3) * 0.9;
    const wy = fbm3(v.x * 1.3, v.y * 1.3 + o, v.z * 1.3 + 3.1, 3) * 0.9;
    const wz = fbm3(v.x * 1.3 + 7.7, v.y * 1.3, v.z * 1.3 + o, 3) * 0.9;
    const q = [v.x + wx, v.y + wy, v.z + wz];
    const big = fbm3(q[0] * 1.5, q[1] * 1.5, q[2] * 1.5, 4);
    const crag = ridged3(q[0] * 3.5 + o, q[1] * 3.5, q[2] * 3.5, 5);
    const pits = Math.max(0, perlin3(v.x * 9 + o, v.y * 9, v.z * 9) - 0.2);
    // terraces: limestone ledges
    let d = 1 + 0.55 * big + 0.28 * crag - 0.35 * pits;
    d = d + 0.015 * Math.sin(d * 28);
    v.multiplyScalar(r * d);
    v.set(v.x * stretch[0], v.y * stretch[1], v.z * stretch[2]);
    if (v.y < -r * 0.3 * stretch[1]) v.y = -r * 0.3 * stretch[1] + (v.y + r * 0.3 * stretch[1]) * 0.25;   // flattened base sits on the sand
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function rockMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, envMapIntensity: 0.3 });
  patch(mat, {
    key: 'rock',
    color: /* glsl */`{
      vec3 q = vObjP * 22.0;
      float n = fbmS(q), m = fbmS(q * 2.7 + 5.0), s = vn3(q * 9.0);
      vec3 stone = mix(vec3(0.22, 0.19, 0.15), vec3(0.42, 0.37, 0.3), n);
      // coralline algae: pink / purple crusts, strongest on lit faces
      float up = clamp(vWorldN.y * 0.5 + 0.5, 0.0, 1.0);
      float cor = smoothstep(0.58, 0.72, m + up * 0.1);
      vec3 coralline = mix(vec3(0.48, 0.14, 0.32), vec3(0.66, 0.26, 0.46), s);
      vec3 c = mix(stone, coralline, cor * 0.8);
      c = mix(c, vec3(0.62, 0.58, 0.5), smoothstep(0.6, 0.75, fbmS(q * 0.6 + 3.0)) * 0.5);   // bleached calcareous patches
      c = mix(c, vec3(0.42, 0.3, 0.16), smoothstep(0.55, 0.7, fbmS(q * 0.8 + 21.0)) * 0.55);  // brown sponge / diatom film
      c = mix(c, vec3(0.7, 0.2, 0.2), smoothstep(0.72, 0.8, fbmS(q * 1.7 + 40.0)) * 0.6);   // red coralline
      // greenish turf algae in shallow pockets
      float turf = smoothstep(0.55, 0.7, fbmS(q * 1.3 + 17.0)) * up;
      c = mix(c, vec3(0.32, 0.4, 0.2), turf * 0.7);
      // fine pores and cavities
      float pore = smoothstep(0.74, 0.84, vn3(q * 14.0)) * smoothstep(0.4, 0.65, fbmS(q * 2.0));
      c *= 1.0 - 0.12 * pore;
      c *= 0.75 + 0.35 * smoothstep(0.2, 0.8, fbmS(q * 4.0 + 9.0));
      // deep porous cavities (live rock is riddled with holes) read as dark occluded pits
      float cav = smoothstep(0.62, 0.78, vn3(q * 3.2 + 13.0)) * smoothstep(0.3, 0.6, fbmS(q * 1.1 + 4.0));
      c *= 1.0 - 0.7 * cav;
      diffuseColor.rgb *= c;
    }`,
    normal: /* glsl */`{
      vec3 q = vObjP * 22.0;
      float h = fbmS(q * 3.0) * 0.6 + vn3(q * 30.0) * 0.2 - smoothstep(0.7, 0.82, vn3(q * 14.0)) * 0.3;
      h -= 0.9 * smoothstep(0.62, 0.78, vn3(q * 3.2 + 13.0)) * smoothstep(0.3, 0.6, fbmS(q * 1.1 + 4.0));
      normal = bumpN(normal, -vViewPosition, h, 0.0016);
    }`,
  });
  return mat;
}

// ---------------------------------------------------------------- corals ----------

// Branching Acropora colony: several trunks forking repeatedly into a bushy crown, with
// radial corallites and pale, thickened growing tips.
function acropora(seed, { size = 0.14, color = [0.35, 0.55, 0.85], tip = [0.85, 0.75, 0.95], trunks = 7, depthMax = 4, spread = 0.55 }) {
  const rnd = mulberry32(seed);
  const geos = [];
  const up = new THREE.Vector3(0, 1, 0);
  const colAttr = (g, c) => g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(0).flatMap(() => c), 3));
  const mixC = (t) => color.map((c, k) => c + (tip[k] - c) * t);
  const branch = (start, dir, len, rad, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    const seg = new THREE.CylinderGeometry(rad * 0.8, rad, len, 8, 2, true);
    seg.translate(0, len / 2, 0);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    seg.translate(start.x, start.y, start.z);
    // colour: base colour, blending to the tip colour over the last level
    const cs = [], pa = seg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      const f = v.fromBufferAttribute(pa, i).sub(start).dot(dir) / len;
      cs.push(...mixC(depth >= depthMax ? Math.pow(f, 2) * 0.9 : depth / depthMax * 0.2));
    }
    seg.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    geos.push(seg);
    // radial corallites
    const nC = Math.round(len / (rad * 1.6));
    for (let k = 0; k < nC; k++) {
      const b = new THREE.ConeGeometry(rad * 0.32, rad * 0.9, 5, 1, true);
      const side = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(dir).normalize();
      const d2 = side.clone().multiplyScalar(0.8).addScaledVector(dir, 0.6).normalize();
      b.translate(0, rad * 0.45, 0);
      b.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d2));
      const at = start.clone().lerp(end, (k + rnd()) / nC).addScaledVector(side, rad * 0.75);
      b.translate(at.x, at.y, at.z);
      colAttr(b, mixC(0.15 + 0.2 * depth / depthMax));
      geos.push(b);
    }
    if (depth >= depthMax) {
      const cap = new THREE.SphereGeometry(rad * 0.85, 8, 6);
      cap.translate(end.x, end.y, end.z);
      colAttr(cap, tip);
      geos.push(cap);
      return;
    }
    const n = rnd() < 0.6 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const jitter = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.4, rnd() - 0.5).multiplyScalar(spread * 1.6);
      const d = dir.clone().add(jitter);
      d.y = Math.max(d.y, 0.35); d.normalize();
      branch(end, d, len * (0.78 + rnd() * 0.12), rad * 0.8, depth + 1);
    }
  };
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rnd();
    const d = new THREE.Vector3(Math.cos(a) * spread, 1, Math.sin(a) * spread).normalize();
    branch(new THREE.Vector3(Math.cos(a) * size * 0.05, 0, Math.sin(a) * size * 0.05), d, size * 0.22, size * 0.045, 0);
  }
  const g = mergeAll(geos);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(...tip), sheenRoughness: 0.5,
    emissive: new THREE.Color(...tip), emissiveIntensity: 0.02 });
  patch(mat, { key: 'coral-polyp', normal: /* glsl */`{ float h = vn3(vObjP * 1400.0); normal = bumpN(normal, -vViewPosition, h, 0.0003); }` });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Brain coral: a dome with meandering ridges and valleys.
function brainCoral(seed, r = 0.07) {
  const geo = new THREE.SphereGeometry(r, 160, 80, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const o = seed * 3.1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = v.clone().normalize();
    const mz = Math.abs(Math.sin(fbm3(u.x * 3 + o, u.y * 3, u.z * 3, 3) * 18));   // meanders
    v.multiplyScalar(1 + 0.05 * mz + 0.04 * fbm3(u.x * 2, u.y * 2 + o, u.z * 2, 3));
    v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0.6, 1, 0.6) });
  patch(mat, {
    key: 'brain',
    color: /* glsl */`{
      vec3 u = normalize(vObjP);
      float h = length(vObjP);
      float valley = smoothstep(${(r * 1.02).toFixed(4)}, ${(r * 1.05).toFixed(4)}, h / mix(1.0, 0.72, abs(u.y)));
      diffuseColor.rgb *= mix(vec3(0.12, 0.24, 0.05), vec3(0.52, 0.62, 0.14), valley);
    }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Gorgonian sea fan: a flat branching lattice that sways in the current.
function seaFan(seed, { size = 0.22, color = 0xd0452a }) {
  const rnd = mulberry32(seed);
  const pts = [];
  const grow = (a, ang, len, depth) => {
    const b = a.clone().add(new THREE.Vector3(Math.sin(ang) * len, Math.cos(ang) * len, (rnd() - 0.5) * len * 0.15));
    pts.push([a, b, 0.004 * Math.pow(0.78, depth)]);
    if (depth > 6) return;
    const n = depth < 2 ? 2 : (rnd() < 0.7 ? 2 : 1);
    for (let i = 0; i < n; i++) grow(b, ang + (i - (n - 1) / 2) * (0.5 + rnd() * 0.3) + (rnd() - 0.5) * 0.2, len * (0.78 + rnd() * 0.12), depth + 1);
  };
  grow(new THREE.Vector3(), 0, size * 0.18, 0);
  const geos = pts.map(([a, b, r]) => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r * 0.8, r, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    return g;
  });
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(1, 0.6, 0.4) });
  const m = new THREE.Mesh(mergeAll(geos), mat);
  m.castShadow = true;
  sway(mat, 0.006, 'fan');
  return m;
}

// Soft coral / anemone: a column with swaying tentacles.
function anemone(seed, { r = 0.035, color = [0.95, 0.55, 0.7], tipCol = [1, 0.9, 0.95], count = 260 }) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  // column: soft, slightly waisted, flaring into the oral disc; buried base
  const prof = [[0.7, -0.15], [0.78, 0.0], [0.72, 0.18], [0.7, 0.32], [0.86, 0.44], [1.0, 0.5], [0.95, 0.53], [0.5, 0.55], [0.0, 0.52]]
    .map(([a, b]) => new THREE.Vector2(a * r, b * r));
  const col = new THREE.LatheGeometry(prof, 48);
  { const pa = col.attributes.position; for (let i = 0; i < pa.count; i++) { const a = Math.atan2(pa.getZ(i), pa.getX(i)); const k = 1 + 0.06 * Math.sin(a * 5 + seed) + 0.03 * Math.sin(a * 11); pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); } col.computeVertexNormals(); }
  const cm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...color).multiplyScalar(0.75), roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(...tipCol), clearcoat: 0.3 });
  group.add(new THREE.Mesh(col, cm));
  const tg = new THREE.CylinderGeometry(0.0016, 0.0019, 0.045, 8, 8, false);   // bubble-tip tentacles
  tg.translate(0, 0.0225, 0);
  { const pa = tg.attributes.position; for (let i = 0; i < pa.count; i++) { const t = pa.getY(i) / 0.045;
      const k = 1 + 1.1 * Math.exp(-Math.pow((t - 0.8) / 0.1, 2)) - 0.4 * Math.max(0, t - 0.92) / 0.08;   // swollen bulb below a narrow tip
      pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); } tg.computeVertexNormals(); }
  const colors = [];
  for (let i = 0; i < tg.attributes.position.count; i++) {
    const t = (tg.attributes.position.getY(i)) / 0.045;
    colors.push(...color.map((c, k) => c + (tipCol[k] - c) * Math.pow(t, 3)));
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, sheen: 0.8, sheenColor: new THREE.Color(...tipCol), transmission: 0, emissive: new THREE.Color(...color), emissiveIntensity: 0.06 });
  const inst = new THREE.InstancedMesh(tg, mat, count);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.95;
    const pos = new THREE.Vector3(Math.cos(a) * rr, r * 0.53, Math.sin(a) * rr);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.3 + 1.4 * rr / r);
    const dir = new THREE.Vector3(out.x, 1, out.z).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const L = 0.8 + rnd() * 0.7;
    s.set(1, L, 1);
    M.compose(pos, q, s);
    inst.setMatrixAt(i, M);
  }
  inst.castShadow = true;
  sway(mat, 0.03, 'anemone', true);
  group.add(inst);
  return group;
}

// Leather coral (Sarcophyton): a stalk topped by a ruffled capitulum furred with polyps.
function leatherCoral(seed, { r = 0.07, color = [0.78, 0.7, 0.45] }) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...color), roughness: 0.75, sheen: 0.5, sheenColor: new THREE.Color(1, 0.95, 0.8) });
  const stalk = new THREE.CylinderGeometry(r * 0.35, r * 0.45, r * 0.8, 24, 4);
  stalk.translate(0, r * 0.4, 0);
  group.add(new THREE.Mesh(stalk, mat));
  const cap = new THREE.CircleGeometry(r, 96, 0, Math.PI * 2);
  const pa = cap.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), rr = Math.hypot(x, y) / r, a = Math.atan2(y, x);
    pa.setZ(i, (0.12 * Math.sin(a * 7 + seed) + 0.05 * Math.sin(a * 13)) * r * rr * rr + 0.08 * r * (1 - rr * rr));
  }
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, r * 0.8, 0);
  cap.computeVertexNormals();
  const capMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...color), roughness: 0.8, side: THREE.DoubleSide });
  capMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.55;'); };
  const capMesh = new THREE.Mesh(cap, capMat);
  group.add(capMesh);
  // polyps
  const pg = new THREE.CylinderGeometry(0.0004, 0.0007, 0.005, 5, 2);
  pg.translate(0, 0.0025, 0);
  const pm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color[0] * 1.1, color[1] * 1.1, color[2]), roughness: 0.6, emissive: new THREE.Color(0.3, 0.5, 0.2), emissiveIntensity: 0.08 });
  const n = 1600;
  const inst = new THREE.InstancedMesh(pg, pm, n);
  const M = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.95, q = rr / r;
    const z = (0.12 * Math.sin(a * 7 + seed) + 0.05 * Math.sin(a * 13)) * r * q * q + 0.08 * r * (1 - q * q);
    M.makeRotationFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5));
    M.setPosition(Math.cos(a) * rr, r * 0.8 + z, -Math.sin(a) * rr);
    inst.setMatrixAt(i, M);
  }
  sway(pm, 0.004, 'polyp', true);
  group.add(inst);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

// Zoanthid colony: packed polyps, each a short column flaring into an oral disc with a
// dark mouth, a coloured disc, a contrasting rim and a fringe of short tentacles.
function zoanthids(seed, { r = 0.04, disc = [0.2, 0.9, 0.5], ring = [1, 0.5, 0.1], count = 70 }) {
  const rnd = mulberry32(seed);
  const prof = [[0.0035, 0], [0.0033, 0.006], [0.0045, 0.0085], [0.0062, 0.0098], [0.0066, 0.0103], [0.0058, 0.0106],
    [0.0042, 0.0104], [0.0022, 0.0101], [0.0008, 0.0098], [0.0, 0.0096]];
  const cols = [[0.35, 0.28, 0.2], [0.4, 0.32, 0.22], ring.map((c) => c * 0.8), ring, ring, [0.95, 0.95, 0.85].map((c, i) => c * 0.5 + ring[i] * 0.5),
    disc, disc, [0.15, 0.1, 0.08], [0.1, 0.07, 0.05]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const colors = [];
  const segs = prof.length;
  for (let i = 0; i < g.attributes.position.count; i++) colors.push(...cols[i % segs]);
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, emissive: new THREE.Color(...disc), emissiveIntensity: 0.2, clearcoat: 0.5, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(g, mat, count);
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3(), Qt = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996 + rnd() * 0.3, rr = Math.sqrt((i + 0.5) / count) * r;
    const sc = 0.8 + rnd() * 0.45;
    Qt.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5 + Math.sin(a) * rr / r * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5 - Math.cos(a) * rr / r * 0.5));
    P.set(Math.cos(a) * rr, -0.002 * rr / r, Math.sin(a) * rr);
    S.set(sc, sc * (0.8 + rnd() * 0.5), sc);
    inst.setMatrixAt(i, M.compose(P, Qt, S));
  }
  inst.castShadow = true;
  return inst;
}

// Seagrass / macroalgae blades.
function seagrass(seed, { count = 40, h = 0.2, color = 0x3f7a2a }) {
  const rnd = mulberry32(seed);
  const blade = new THREE.PlaneGeometry(0.008, h, 1, 12);
  blade.translate(0, h / 2, 0);
  const pa = blade.attributes.position;
  for (let i = 0; i < pa.count; i++) { const t = pa.getY(i) / h; pa.setX(i, pa.getX(i) * (1 - t * 0.7)); }
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const M = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * 0.05;
    M.compose(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4)),
      new THREE.Vector3(1, 0.5 + rnd() * 0.8, 1));
    inst.setMatrixAt(i, M);
  }
  sway(mat, 0.015, 'grass', true);
  return inst;
}

// Current-driven sway: displacement grows with height above the base.
const swayUniforms = { uTime: { value: 0 } };
function sway(material, amt, key, instanced = false) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = swayUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 wp = position;
          #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          #else
          vec3 ip = vec3(0.0);
          #endif
          float hgt = max(position.y, 0.0);
          float ph = uTime * 1.3 + (ip.x + ip.z) * 40.0 + dot(modelMatrix[3].xyz, vec3(9.0, 0.0, 7.0));
          float s = ${amt.toFixed(4)} * pow(hgt / 0.1, 1.5);   // amt = offset at 10 cm
          transformed.x += s * (sin(ph) + 0.4 * sin(ph * 2.3 + 1.0));
          transformed.z += s * 0.7 * cos(ph * 0.8 + 0.5);
        }`);
  };
  const pk = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (pk ? pk() : '') + '|sway-' + key;
}

function mergeAll(geos) {
  let n = 0, m = 0;
  for (const g of geos) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); n += g.attributes.position.count; m += g.index.count; }
  const hasColor = geos.every((g) => g.attributes.color);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = hasColor ? new Float32Array(n * 3) : null, idx = new Uint32Array(m);
  let o = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o;
    o += g.attributes.position.count; oi += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------- layout ----------

export function createReef() {
  const group = new THREE.Group();
  group.add(createSand());
  const rockMat = rockMaterial();
  const obstacles = [];   // spheres the fish keep clear of
  const rock = (seed, x, z, r, st, rotY = 0, yOff = 0) => {
    const m = new THREE.Mesh(rockGeometry(seed, r, st, 7), rockMat);
    const y = sandHeight(x, z) + r * st[1] * 0.35 + yOff;
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    obstacles.push({ c: new THREE.Vector3(x, y, z), r: r * Math.max(...st) * 1.25 });
    return m;
  };
  // two main rock structures and a low bridge, built up from overlapping stones
  const stones = [
    // left mound
    [1, -0.42, -0.12, 0.09, [1.3, 0.8, 1.0], 0.3, 0], [2, -0.32, -0.17, 0.075, [1.1, 1.2, 0.9], 1.2, 0.03],
    [3, -0.45, 0.04, 0.055, [1.3, 0.6, 1.0], 2.0, 0], [4, -0.37, -0.13, 0.06, [1.1, 0.9, 1], 0.5, 0.12],
    [12, -0.24, -0.1, 0.05, [1.3, 0.7, 1.0], 2.6, 0], [13, -0.46, -0.18, 0.06, [1.0, 1.4, 0.9], 1.7, 0.08],
    [14, -0.3, -0.19, 0.045, [1.0, 1.0, 1.0], 0.9, 0.2],
    // bridge
    [5, -0.06, -0.19, 0.06, [1.7, 0.7, 0.9], 0.1, 0], [6, 0.12, -0.18, 0.06, [1.2, 1.3, 0.9], 0.9, 0.04],
    [15, 0.03, -0.2, 0.04, [2.2, 0.55, 0.8], 0.2, 0.11],
    // right mound
    [7, 0.38, -0.1, 0.085, [1.2, 1.0, 1.0], 1.9, 0], [8, 0.47, 0.04, 0.055, [1.3, 0.7, 1.1], 0.7, 0],
    [9, 0.33, -0.17, 0.06, [1, 1.2, 1], 2.4, 0.1], [16, 0.25, -0.12, 0.05, [1.2, 0.8, 1.0], 0.4, 0],
    [17, 0.45, -0.18, 0.055, [1.0, 1.5, 0.9], 1.1, 0.12], [18, 0.4, -0.13, 0.04, [1, 1, 1], 0.2, 0.2],
    // scattered rubble
    [10, -0.12, 0.1, 0.03, [1.3, 0.6, 1], 0.2, 0], [11, 0.2, 0.12, 0.025, [1.2, 0.6, 1.1], 1.0, 0],
    [19, -0.02, 0.17, 0.018, [1.2, 0.6, 1.0], 0.5, 0],
  ];
  for (const [seed, x, z, r, st, ry, yo] of stones) rock(seed, x, z, r, st, ry, yo);

  const place = (m, x, z, yOff = 0, s = 1, rotY = 0) => {
    m.position.set(x, sandHeight(x, z) + yOff, z); m.scale.setScalar(s); m.rotation.y = rotY; group.add(m); return m;
  };
  place(acropora(21, { size: 0.2, color: [0.14, 0.12, 0.08], tip: [0.2, 0.36, 0.78] }), -0.3, -0.13, 0.19, 1.0);
  place(acropora(22, { size: 0.16, color: [0.2, 0.1, 0.14], tip: [0.62, 0.22, 0.52], trunks: 6 }), 0.38, -0.1, 0.13, 1.0, 1.0);
  place(acropora(23, { size: 0.13, color: [0.12, 0.18, 0.06], tip: [0.34, 0.66, 0.16], trunks: 5 }), 0.12, -0.17, 0.12, 1.0, 2.0);
  place(acropora(24, { size: 0.12, color: [0.28, 0.17, 0.09], tip: [0.66, 0.48, 0.22], trunks: 5, spread: 0.8 }), -0.47, 0.03, 0.04, 1.0, 0.5);
  place(brainCoral(31, 0.06), -0.1, 0.02, 0.0);
  place(seaFan(41, { size: 0.26 }), 0.02, -0.21, 0.04, 1.0, 0.15);
  place(anemone(51, { color: [0.32, 0.2, 0.1], tipCol: [0.78, 0.32, 0.36] }), 0.3, 0.1, 0.0);
  place(anemone(52, { r: 0.028, color: [0.2, 0.3, 0.1], tipCol: [0.45, 0.7, 0.28] }), -0.46, 0.08, 0.025);
  place(zoanthids(61, {}), -0.42, -0.1, 0.1);
  place(zoanthids(62, { disc: [1, 0.4, 0.2], ring: [0.3, 0.9, 0.9] }), 0.44, 0.06, 0.035);
  place(zoanthids(63, { disc: [0.8, 0.95, 0.2], ring: [0.8, 0.2, 0.6], count: 28 }), 0.02, -0.16, 0.07);
  place(leatherCoral(81, { r: 0.06 }), 0.22, -0.1, 0.0, 1.0, 0.4);
  place(leatherCoral(82, { r: 0.045, color: [0.5, 0.56, 0.3] }), -0.17, -0.12, 0.0, 1.0, 1.4);
  // mushroom corals on the sand
  // mushroom corals (Fungia): oval discs with fine radial septa, olive-brown with a pale mouth
  const mush = new THREE.CircleGeometry(0.02, 72, 0, Math.PI * 2);
  { const pa = mush.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), r = Math.hypot(x, y) / 0.02; pa.setZ(i, 0.006 * (1 - r * r)); pa.setY(i, y * 0.75); } }
  mush.rotateX(-Math.PI / 2); mush.computeVertexNormals();
  const mushMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0.8, 0.9, 0.6) });
  patch(mushMat, { key: 'fungia',
    color: /* glsl */`{ float a = atan(vObjP.z, vObjP.x); float r = length(vObjP.xz / vec2(1.0, 0.75)) / 0.02;
      float sept = 0.5 + 0.5 * sin(a * 90.0);
      vec3 c = mix(vec3(0.42, 0.4, 0.22), vec3(0.6, 0.55, 0.32), sept * 0.6 + 0.2 * vn3(vObjP * 600.0));
      c = mix(c, vec3(0.78, 0.74, 0.6), 1.0 - smoothstep(0.05, 0.14, r));
      diffuseColor.rgb *= c; }`,
    normal: /* glsl */`{ float a = atan(vObjP.z, vObjP.x); normal = bumpN(normal, -vViewPosition, sin(a * 90.0) * 0.5, 0.0012); }` });
  [[0.1, 0.16], [0.13, 0.19], [0.07, 0.2], [-0.25, 0.15]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(mush, mushMat); m.position.set(x, sandHeight(x, z) + 0.001, z); m.rotation.set(0.12 * Math.sin(x * 50), i * 1.3, 0.12 * Math.cos(z * 40)); group.add(m);
  });
  group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
  return { group, obstacles, sandHeight, update: (t) => { swayUniforms.uTime.value = t; } };
}
