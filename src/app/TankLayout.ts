import type { EquipmentLayout } from '../aquarium/state';
import { CatmullRomCurve3, DoubleSide, Group, IcosahedronGeometry, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type TankSubstrate = 'sand' | 'mud' | 'none';
export type TankItemType = 'stone_s' | 'stone_l' | 'driftwood' | 'shell' | 'plant';
export interface TankItem { id: string; type: TankItemType; x: number; z: number; rot: number }
export interface TankLayout { substrate: TankSubstrate; items: TankItem[]; equipment?: EquipmentLayout }

export const TANK_SUBSTRATES: TankSubstrate[] = ['sand', 'mud', 'none'];
export const TANK_ITEM_TYPES: TankItemType[] = ['stone_s', 'stone_l', 'driftwood', 'shell', 'plant'];
export const TANK_MAX_ITEMS = 12;
export const defaultTankLayout = (): TankLayout => ({ substrate: 'sand', items: [] });

/** Footprint radius (m) used to keep items apart when placing them. */
export const ITEM_RADIUS: Record<TankItemType, number> = { stone_s: 0.02, stone_l: 0.05, driftwood: 0.09, shell: 0.022, plant: 0.04 };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash3(x: number, y: number, z: number): number {
  let t = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}
/** value noise in 3D, deterministic in position (so shared vertices stay joined) */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  const x0 = (c(0, 0, 0) * (1 - u) + c(1, 0, 0) * u) * (1 - v) + (c(0, 1, 0) * (1 - u) + c(1, 1, 0) * u) * v;
  const x1 = (c(0, 0, 1) * (1 - u) + c(1, 0, 1) * u) * (1 - v) + (c(0, 1, 1) * (1 - u) + c(1, 1, 1) * u) * v;
  return x0 * (1 - w) + x1 * w;
}

// ------------------------------------------------------------------ the decorations' surfaces
const NOISE3 = /* glsl */ `
float dcH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dcN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dcH(i), dcH(i + vec3(1, 0, 0)), f.x), mix(dcH(i + vec3(0, 1, 0)), dcH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dcH(i + vec3(0, 0, 1)), dcH(i + vec3(1, 0, 1)), f.x), mix(dcH(i + vec3(0, 1, 1)), dcH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float dcF(vec3 p) { return 0.5 * dcN(p) + 0.25 * dcN(p * 2.03) + 0.125 * dcN(p * 4.01) + 0.0625 * dcN(p * 8.05); }
// a height on the surface bends the shading normal (after three.js's perturbNormalArb)
vec3 dcBump(vec3 surfPos, vec3 n, float h) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

/**
 * A decoration's surface, in the model's own coordinates: `albedo` and `rough` (GLSL using `vec3 dp`, the object
 * position, and `vec2 duv`) colour it, `height` (metres) bumps it. Works on its own and under the tank's caustic
 * light, which chains it.
 */
function surface(m: MeshStandardMaterial, key: string, seed: number, glsl: { albedo: string; rough?: string; height?: string }): MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDcSeed = { value: (seed % 997) * 0.731 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDcP;\nvarying vec2 vDcUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDcP = position;\nvDcUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDcP;\nvarying vec2 vDcUv;\nuniform float uDcSeed;\n${NOISE3}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n{ vec3 dp = vDcP + uDcSeed; vec2 duv = vDcUv; diffuseColor.rgb *= ${glsl.albedo}; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${glsl.rough ? `{ vec3 dp = vDcP + uDcSeed; vec2 duv = vDcUv; roughnessFactor = ${glsl.rough}; }` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${glsl.height ? `{ vec3 dp = vDcP + uDcSeed; vec2 duv = vDcUv; normal = dcBump(-vViewPosition, normal, ${glsl.height}); }` : ''}`);
  };
  m.customProgramCacheKey = () => `decor-${key}`;
  return m;
}

/** a water-worn stone: rounded, a flatter underside it rests on; granite-grey with crystals, or a darker basalt */
function stone(radius: number, seed: number, scale: Vector3, color: number): Mesh {
  const geo = mergeVertices(new IcosahedronGeometry(radius, 4).deleteAttribute('normal').deleteAttribute('uv'), 1e-6);
  const pos = geo.attributes.position;
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const u = p.clone().divideScalar(radius);
    const n = noise3(u.x * 1.4 + seed, u.y * 1.4, u.z * 1.4) - 0.5;
    const n2 = noise3(u.x * 3.6 + seed * 3, u.y * 3.6, u.z * 3.6) - 0.5;
    const n3 = noise3(u.x * 9 + seed * 7, u.y * 9, u.z * 9) - 0.5;
    p.multiplyScalar(1 + n * 0.3 + n2 * 0.09 + n3 * 0.025);
    // the side it lies on is flattened
    const y = p.y < -0.25 * radius ? -0.25 * radius + (p.y + 0.25 * radius) * 0.35 : p.y;
    pos.setXYZ(i, p.x * scale.x, y * scale.y, p.z * scale.z);
  }
  geo.computeVertexNormals();
  const mat = surface(new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }), 'stone', seed, {
    albedo: `(0.72 + 0.5 * dcF(dp * 160.0)) * mix(1.0, 1.35, step(0.82, dcN(dp * 900.0))) * mix(0.8, 1.0, smoothstep(0.2, 0.6, dcF(dp * 45.0)))`,
    rough: `0.78 + 0.18 * dcN(dp * 300.0)`,
    height: `(0.00035 * dcF(dp * 420.0) * (1.0 - smoothstep(0.2, 0.6, length(fwidth(dp * 420.0)))) + 0.0012 * dcF(dp * 90.0))`,
  });
  const m = new Mesh(geo, mat);
  m.position.y = radius * scale.y * 0.42;
  return m;
}

/** a sinker branch: a bent, tapering limb with a side branch or two, bark worn to grooves along the grain (one mesh) */
function driftwood(seed: number, rnd: () => number): Group {
  const g = new Group();
  const parts: BufferGeometry[] = [];
  const wood = surface(new MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9, metalness: 0 }), 'wood', seed, {
    // grooves along the grain (u runs along the limb), worn lighter on the ridges, darker in the cracks
    // (a smooth groove profile, faded out where the grooves get finer than a couple of pixels: no crawling stairs)
    albedo: `mix(0.6, 1.12, smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(duv.y * 6.2832 * 7.0 + dcF(vec3(duv.x * 14.0, duv.y * 3.0, 0.0)) * 4.0))) * (0.85 + 0.3 * dcF(dp * 120.0))`,
    rough: `0.82 + 0.15 * dcN(dp * 200.0)`,
    height: `0.0005 * (0.5 + 0.5 * sin(duv.y * 6.2832 * 7.0 + dcF(vec3(duv.x * 14.0, duv.y * 3.0, 0.0)) * 4.0)) * (1.0 - smoothstep(0.08, 0.25, length(fwidth(duv * vec2(14.0, 7.0)))))`,
  });
  const limb = (pts: Vector3[], r0: number, r1: number, seg: number) => {
    const curve = new CatmullRomCurve3(pts);
    const geo = new TubeGeometry(curve, seg, 1, 10, false);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    const c = new Vector3(), n = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      curve.getPointAt(t, c);
      n.fromBufferAttribute(nrm, i);
      const knot = 1 + 0.18 * (noise3(t * 9 + seed, uv.getY(i) * 3, 1) - 0.5) + 0.25 * Math.max(0, noise3(t * 4 + seed * 2, 0, 3) - 0.7);
      const r = (r0 + (r1 - r0) * t) * knot;
      pos.setXYZ(i, c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
    }
    geo.computeVertexNormals();
    parts.push(geo);
    // capped ends: a small sphere hides the open tube
    for (const [t, r] of [[0, r0], [1, r1]] as [number, number][]) {
      const p = curve.getPointAt(t);
      parts.push(new SphereGeometry(r * 0.98, 10, 8).translate(p.x, p.y, p.z));
    }
    return curve;
  };
  const bend = (rnd() - 0.5) * 0.04;
  const main = limb([new Vector3(-0.095, 0.009, 0), new Vector3(-0.04, 0.016, bend), new Vector3(0.02, 0.02, -bend * 0.5), new Vector3(0.07, 0.03, bend), new Vector3(0.1, 0.045, bend * 1.5)], 0.013, 0.006, 40);
  const a = main.getPointAt(0.45);
  limb([a, a.clone().add(new Vector3(0.015, 0.03, 0.012)), a.clone().add(new Vector3(0.022, 0.065, 0.02 + bend))], 0.006, 0.0028, 16);
  if (rnd() < 0.7) { const b = main.getPointAt(0.72); limb([b, b.clone().add(new Vector3(0.02, 0.012, -0.02)), b.clone().add(new Vector3(0.045, 0.02, -0.035))], 0.0045, 0.002, 12); }
  g.add(new Mesh(mergeGeometries(parts)!, wood));
  parts.forEach((p) => p.dispose());
  return g;
}

/** a cockle's valve, ribbed, with growth lines and bands of brown */
function shell(seed: number): Mesh {
  const geo = new SphereGeometry(0.02, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position, p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const a = Math.atan2(p.z, p.x), rib = 1 + 0.035 * Math.max(0, Math.cos(a * 22));
    pos.setXYZ(i, p.x * rib * 1.05, p.y * 0.48, p.z * 0.88 * rib);
  }
  geo.computeVertexNormals();
  const m = surface(new MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.5, metalness: 0, side: DoubleSide }), 'shell', seed, {
    // growth lines round the hinge (the top), the ribs' crests paler, bands of brown
    albedo: `mix(vec3(1.0), vec3(0.55, 0.42, 0.3), smoothstep(0.55, 0.7, sin(length(dp.xz) * 900.0 + dcN(dp * 300.0) * 2.0) * 0.5 + 0.5) * 0.6) * (0.9 + 0.2 * dcN(dp * 2000.0)) * (gl_FrontFacing ? 1.0 : 1.08)`,
    rough: `gl_FrontFacing ? 0.55 : 0.25`,
    height: `0.00008 * sin(length(dp.xz) * 1800.0)`,
  });
  const mesh = new Mesh(geo, m);
  mesh.rotation.set(0.2 + (seed % 7) * 0.03, 0, 0.12);
  mesh.position.y = 0.002;
  return mesh;
}

/** a tuft of eelgrass-like blades: narrow ribbons, leaning and arching, paler toward the tips, veined along (one mesh) */
function seagrass(seed: number, rnd: () => number): Group {
  const g = new Group();
  const parts: BufferGeometry[] = [], m = new Matrix4(), axis = new Vector3(0, 1, 0);
  const leaf = surface(new MeshStandardMaterial({ color: 0x3a7a34, roughness: 0.6, metalness: 0, side: DoubleSide, emissive: 0x0c2a0c, emissiveIntensity: 0.6 }), 'grass', seed, {
    albedo: `mix(vec3(0.62, 0.7, 0.55), vec3(1.25, 1.2, 0.85), duv.y) * (0.88 + 0.12 * abs(sin(duv.x * 3.1416 * 5.0))) * (0.9 + 0.2 * dcN(vec3(duv * vec2(4.0, 60.0), 1.0)))`,
    rough: `0.5`,
  });
  const n = 9 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const h = 0.07 + rnd() * 0.08, w = 0.005 + rnd() * 0.003;
    const geo = new PlaneGeometry(w, h, 1, 14).translate(0, h / 2, 0);
    const pos = geo.attributes.position, p = new Vector3();
    const lean = 0.25 + rnd() * 0.5, twist = (rnd() - 0.5) * 1.6;
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k);
      const t = p.y / h, x = p.x * (1 - 0.35 * t * t);
      // the blade arches away from the tuft and turns a little about its own length
      const ang = twist * t, bendZ = lean * t * t * h * 0.9;
      pos.setXYZ(k, x * Math.cos(ang), p.y * (1 - 0.18 * lean * t), bendZ + x * Math.sin(ang));
    }
    geo.computeVertexNormals();
    m.makeRotationAxis(axis, (i / n) * Math.PI * 2 + rnd() * 0.7).setPosition((rnd() - 0.5) * 0.012, 0, (rnd() - 0.5) * 0.012);
    parts.push(geo.applyMatrix4(m));
  }
  const tuft = new Mesh(mergeGeometries(parts)!, leaf);
  tuft.castShadow = false;
  parts.forEach((p) => p.dispose());
  g.add(tuft);
  return g;
}

/** A decoration as a group whose origin sits on the sand. The caller lights its meshes and sets the shadows. */
export function buildTankItem(type: TankItemType, seed: number): Group {
  const g = new Group();
  const rnd = mulberry(seed);
  switch (type) {
    case 'stone_s': {
      g.add(stone(0.016 + rnd() * 0.006, seed, new Vector3(1, 0.72, 0.9), [0x6e6a62, 0x7a726a, 0x5f5b58][seed % 3]));
      break;
    }
    case 'stone_l': {
      g.add(stone(0.042 + rnd() * 0.01, seed, new Vector3(1.15, 0.62, 0.95), [0x5d5852, 0x66605a, 0x544f4a][seed % 3]));
      break;
    }
    case 'driftwood': g.add(driftwood(seed, rnd)); break;
    case 'shell': g.add(shell(seed)); break;
    case 'plant': g.add(seagrass(seed, rnd)); break;
    default: break;
  }
  return g;
}
