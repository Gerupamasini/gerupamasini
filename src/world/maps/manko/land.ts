import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, IcosahedronGeometry, LinearMipmapLinearFilter,
  Mesh, MeshLambertMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type IUniform,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Land } from '../hashirimizu/land';
import type { BackdropCrown } from '../../mangrove/MangroveForest';
import { canopyAt, crownAt, CROWN_CELL, ENTRY, FAR_SHORE_X, forestDepth, groundAt, HALF, shellProfile, vnoise } from './shape';

/**
 * Everything round the 漫湖 basin beyond the rows of real tree models: the deep mangrove forest, the wider lake to
 * the north-east with forest on its far shore, and low wooded hills on the horizon. A lake, not the sea: no open
 * water horizon. No buildings.
 *
 * The deep forest is the distant-forest level of detail (never seen up close: its interior is impassable):
 * - a canopy roof (ground + canopy height from shape.ts) of rounded crowns, one per ~4.6 m cell, rising behind the
 *   front rows by depth into the forest; crown tops lighter, the gaps between them dark, the under-canopy dark;
 * - on its crowns (and the far shore's tree line), whole crowns of the trees' own twig-tuft foliage, drawn by
 *   MangroveForest with the leaf material (see backdropCrowns), so near and far forest are the same foliage.
 * Across the lake: mid-rise apartment blocks and a road bridge behind the far shore's trees (user's photo).
 * Two roof grids (2 m over the 300 m terrain, 12 m out to 1.6 km), no shadows; haze takes the sky's colour.
 */

const haze = { uHazeCol: { value: new Color(0.7, 0.75, 0.8) } as IUniform<Color>, uHazeK: { value: 1 / 2200 } as IUniform<number> };

// linear colours: sunlit crown tops, shaded crown sides, the dark gaps between crowns, the under-canopy, mud
const TOP = [0.09, 0.2, 0.032], SHADE = [0.035, 0.095, 0.016], HOLLOW = [0.01, 0.024, 0.007], UNDER = [0.02, 0.017, 0.012], MUD = [0.17, 0.145, 0.105];

function colour(x: number, z: number, canopy: number): number[] {
  if (canopy < 0.05) return MUD;
  const { dome } = crownAt(x, z);
  const lit = Math.min(1, dome * 1.3) * (0.75 + 0.5 * vnoise(x * 0.4, z * 0.4));
  const c = SHADE.map((s, i) => s + (TOP[i] - s) * Math.min(1, lit));
  const hollow = Math.max(0, 0.25 - dome) * 4;
  for (let i = 0; i < 3; i++) c[i] += (HOLLOW[i] - c[i]) * Math.min(1, hollow);
  const wall = 1 - Math.min(1, canopy / 2.2);
  for (let i = 0; i < 3; i++) c[i] += (UNDER[i] - c[i]) * wall;
  // yellower young flush in patches, as in the photos
  const flush = Math.max(0, vnoise(x * 0.07 + 11, z * 0.07) - 0.62) * 1.6;
  c[0] += 0.03 * flush; c[1] += 0.035 * flush;
  return c;
}

const roofAt = (x: number, z: number) => canopyAt(x, z) * shellProfile(forestDepth(x, z));

/** A heightfield over [x0,x1]×[z0,z1]; cells wholly inside `hole` (half-size) and cells with no canopy (when `canopyOnly`) are skipped. */
function grid(x0: number, x1: number, z0: number, z1: number, step: number, hole: number, canopyOnly: boolean): BufferGeometry {
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), canopy = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = j * nx + i, c = roofAt(x, z);
    canopy[k] = c;
    pos.set([x, groundAt(x, z) + c, z], k * 3);
    col.set(colour(x, z, c), k * 3);
    uv.set([x / 5, z / 5], k * 2);
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const cx = x0 + (i + 0.5) * step, cz = z0 + (j + 0.5) * step;
    if (Math.abs(cx) + step * 0.5 < hole && Math.abs(cz) + step * 0.5 < hole) continue;
    if (canopyOnly && Math.max(canopy[a], canopy[b], canopy[c], canopy[d]) < 0.05) continue;
    index.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

let seed = 0x2468ace;
const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 374761393) >>> 0; return seed / 4294967296; };

/** Original tiling leaf-mass texture for the roof: overlapping leaf blobs, light edges, dark gaps. No photographs. */
function roofTexture(): CanvasTexture {
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI, l = 7 + rnd() * 6, w = l * 0.45, v = 120 + rnd() * 135;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      c.save(); c.translate(x + ox, y + oy); c.rotate(a);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.beginPath(); c.ellipse(0, 0, l, w, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function hazy(mat: MeshLambertMaterial, key: string, fadeMap: boolean): MeshLambertMaterial {
  // the scene's fog is the water's own distance haze; the land takes the lighter air haze instead (as at 走水)
  mat.fog = false;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHazeCol = haze.uHazeCol;
    sh.uniforms.uHazeK = haze.uHazeK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHaze;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHaze = length(mvPosition.xyz);');
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol;\nuniform float uHazeK;\nvarying float vHaze;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, 1.0 - exp(-pow(uHazeK * vHaze, 2.0)));');
    // the roof's leaf texture is close-range sparkle: it fades to its mean by 60 m, where its mip would flatten it anyway
    if (fadeMap) fs = fs.replace('#include <map_fragment>', '#ifdef USE_MAP\nvec4 sampledDiffuseColor = texture2D(map, vMapUv);\ndiffuseColor.rgb *= mix(sampledDiffuseColor.rgb * 1.55, vec3(0.75), smoothstep(25.0, 60.0, vHaze));\n#endif');
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `manko-land-${key}`;
  return mat;
}

/** Crown sites for the backdrop forest (drawn by MangroveForest with the trees' own foliage): every crown of the
 * roof near the basin, and the far shore's tree line across the lake. */
export function backdropCrowns(): BackdropCrown[] {
  const out: BackdropCrown[] = [];
  const add = (x0: number, x1: number, z0: number, z1: number) => {
    for (let j = Math.floor(z0 / CROWN_CELL); j <= z1 / CROWN_CELL; j++) for (let i = Math.floor(x0 / CROWN_CELL); i <= x1 / CROWN_CELL; i++) {
      const { cx, cz, size } = crownAt((i + 0.5) * CROWN_CELL, (j + 0.5) * CROWN_CELL);
      const roof = roofAt(cx, cz);
      if (roof < 1.2) continue;
      const s = (2.1 + 0.9 * size) * (0.85 + 0.3 * vnoise(cx * 0.3, cz * 0.3)) * (cx > FAR_SHORE_X - 15 ? 1.8 : 1);
      out.push({ x: cx, z: cz, y: groundAt(cx, cz) + roof - s * 0.75, s });
    }
  };
  add(-HALF - 60, HALF + 40, -HALF - 60, HALF + 60);
  // (the far shore's tree line is the roof strip in buildMankoLand: at 450 m the scene fog would grey these out)
  return out;
}

// ------------------------------------------------------------------ the far shore: the city and the bridge
/** Original window-grid texture for the mid-rise blocks (balconies, glazing), sRGB greys tinted by vertex colour. */
function facadeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f0eee8'; c.fillRect(0, 0, 128, 256);
  for (let f = 0; f < 16; f++) for (let w = 0; w < 8; w++) {
    const lit = rnd();
    c.fillStyle = lit > 0.8 ? '#8d97a3' : lit > 0.3 ? '#6c7682' : '#525b66';
    c.fillRect(w * 16 + 3, f * 16 + 5, 10, 8);
  }
  for (let f = 0; f < 16; f++) { c.fillStyle = '#d8d6d0'; c.fillRect(0, f * 16 + 13, 128, 2); }
  const t = new CanvasTexture(canvas); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter;
  return t;
}

function box(out: { pos: number[]; uv: number[]; col: number[]; idx: number[] }, x: number, z: number, w: number, d: number, h: number, y0: number, colour: number[], floors: number, bays: number): void {
  const faces: [number[], number[], number[], number[]][] = [
    [[x - w, y0, z + d], [x + w, y0, z + d], [x - w, y0 + h, z + d], [x + w, y0 + h, z + d]],
    [[x + w, y0, z - d], [x - w, y0, z - d], [x + w, y0 + h, z - d], [x - w, y0 + h, z - d]],
    [[x - w, y0, z - d], [x - w, y0, z + d], [x - w, y0 + h, z - d], [x - w, y0 + h, z + d]],
    [[x + w, y0, z + d], [x + w, y0, z - d], [x + w, y0 + h, z + d], [x + w, y0 + h, z - d]],
    [[x - w, y0 + h, z + d], [x + w, y0 + h, z + d], [x - w, y0 + h, z - d], [x + w, y0 + h, z - d]],
  ];
  faces.forEach((f, k) => {
    const o = out.pos.length / 3, roof = k === 4, across = k < 2 ? bays : bays * d / w;
    for (const p of f) out.pos.push(...p);
    out.uv.push(0, 0, roof ? 0 : across / 8, 0, 0, roof ? 0 : floors / 16, roof ? 0 : across / 8, roof ? 0 : floors / 16);
    for (let i = 0; i < 4; i++) out.col.push(...colour);
    out.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  });
}

/** Mid-rise apartment blocks behind the far shore's trees and a road bridge crossing the lake (user's photo). */
function city(): Mesh {
  const out = { pos: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  const palette = [[1, 1, 1], [0.95, 0.93, 0.88], [0.92, 0.9, 0.86], [0.85, 0.83, 0.8], [1, 0.94, 0.86]];
  for (let z = -520; z < 420; z += 30 + rnd() * 35) {
    const x = FAR_SHORE_X + 80 + rnd() * 90, floors = 6 + Math.floor(rnd() * 9), h = floors * 3.1, w = 12 + rnd() * 22, d = 7 + rnd() * 5;
    box(out, x, z, w, d, h, groundAt(x, z), palette[Math.floor(rnd() * palette.length)], floors, Math.round(w / 3));
    if (rnd() < 0.5) { const x2 = x + 40 + rnd() * 60, f2 = 9 + Math.floor(rnd() * 8); box(out, x2, z + 10, 10 + rnd() * 10, 8, f2 * 3.1, groundAt(x2, z), palette[Math.floor(rnd() * palette.length)], f2, 6); }
  }
  // the bridge: a long low deck on piers, crossing the lake to the north
  const by = 7, z0 = -330;
  for (let x = 140; x < FAR_SHORE_X + 60; x += 34) box(out, x, z0, 1.2, 4, by, -2, [0.75, 0.75, 0.73], 2, 1);
  box(out, (140 + FAR_SHORE_X + 60) / 2, z0, (FAR_SHORE_X - 80) / 2 + 2, 7, 1.6, by, [0.8, 0.82, 0.84], 1, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out.pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(out.uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const mesh = new Mesh(g, hazy(new MeshLambertMaterial({ vertexColors: true, map: facadeTexture() }), 'city', false));
  mesh.name = 'manko-city';
  return mesh;
}

// ------------------------------------------------------------------ the entry shore's limestone and algae stones
/** Pale, pitted limestone blocks on the entry shore and darker algae-covered stones in the shallows (user's photo). */
function stones(): Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  // welded (smooth-shaded) unit rock; each stone displaces it with its own noise, so no two read alike
  const raw = new IcosahedronGeometry(1, 3); raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
  const base = mergeVertices(raw), bp = base.getAttribute('position'), bi = base.index!;
  raw.dispose();
  for (let k = 0; k < 260; k++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * 15, x = ENTRY.x + Math.cos(a) * r * 1.25, z = ENTRY.z + Math.sin(a) * r * 0.8;
    const wet = groundAt(x, z) < 0.5, s = wet ? 0.08 + rnd() * 0.16 : 0.08 + Math.pow(rnd(), 2.5) * 0.36, flat = 0.55 + rnd() * 0.35;
    // limestone: pale cream-grey; in the tidal shallows dark olive with algae (user's photo)
    const c = wet ? [0.035 + rnd() * 0.015, 0.05 + rnd() * 0.015, 0.02] : [0.28 + rnd() * 0.05, 0.275 + rnd() * 0.05, 0.235 + rnd() * 0.04];
    const o = pos.length / 3, y = groundAt(x, z) - s * flat * 0.35, rot = rnd() * 6.28, seedK = k * 3.7;
    for (let i = 0; i < bp.count; i++) {
      const vx = bp.getX(i), vy = bp.getY(i), vz = bp.getZ(i);
      // coral-limestone: lumpy, with sharp knobs and hollows at several scales
      const n = 0.55 + 0.55 * vnoise(vx * 1.6 + seedK, vz * 1.6 + vy * 1.3) + 0.3 * Math.abs(vnoise(vx * 4.5 + seedK, vy * 4.5 - vz * 3) - 0.5) * 2 - 0.12 * vnoise(vx * 11 + seedK, vz * 11 + vy * 9);
      const px = (vx * Math.cos(rot) - vz * Math.sin(rot)) * s * n * 1.25, pz = (vx * Math.sin(rot) + vz * Math.cos(rot)) * s * n;
      pos.push(x + px, y + vy * s * n * flat, z + pz);
      // solution pits and dark undersides in the limestone; mud staining at the foot
      const pit = vnoise(vx * 7 + seedK, vz * 7 - vy * 5) < 0.28 ? 0.55 : 1, foot = vy < -0.1 ? 0.55 : 1;
      col.push(c[0] * pit * foot, c[1] * pit * foot, c[2] * pit * foot);
    }
    for (let i = 0; i < bi.count; i++) idx.push(o + bi.getX(i));
  }
  base.dispose();
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  // porous coral limestone: solution pits and craggy relief from 3D noise in world space, as bump (no vertices)
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRockP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRockP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRockP;
float rkHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rkNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i), rkHash(i + vec3(1,0,0)), f.x), mix(rkHash(i + vec3(0,1,0)), rkHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkHash(i + vec3(0,0,1)), rkHash(i + vec3(1,0,1)), f.x), mix(rkHash(i + vec3(0,1,1)), rkHash(i + 1.0), f.x), f.y), f.z);
}
float rkField(vec3 p) { return rkNoise(p * 9.0) * 0.5 + rkNoise(p * 23.0) * 0.3 + rkNoise(p * 61.0) * 0.2; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float rkF = rkField(vRockP);
float rkPit = smoothstep(0.42, 0.3, rkF);
diffuseColor.rgb *= 0.78 + 0.4 * rkF - 0.35 * rkPit;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition), r1 = cross(dy, normal), r2 = cross(normal, dx);
  float det = dot(dx, r1), h = rkF * 0.012 - rkPit * 0.01;
  if (abs(det) > 1e-10) normal = normalize(abs(det) * normal - sign(det) * (dFdx(h) * r1 + dFdy(h) * r2)); }`);
  };
  mat.customProgramCacheKey = () => 'manko-limestone';
  const mesh = new Mesh(g, mat);
  mesh.name = 'manko-stones';
  return mesh;
}

export function buildMankoLand(): Land {
  const group = new Group();
  group.name = 'manko-land';
  const map = roofTexture();
  const mat = hazy(new MeshLambertMaterial({ vertexColors: true, map }), 'roof', true);
  // over the terrain: the roof only (the terrain draws the ground); beyond it, the whole land and the lake floor
  const near = new Mesh(grid(-HALF - 3, HALF + 3, -HALF - 3, HALF + 3, 2, 0, true), mat);
  const far = new Mesh(grid(-1608, 1608, -1608, 1608, 12, HALF - 4, false), mat);
  near.name = 'manko-canopy-near'; far.name = 'manko-land-far';
  // the far shore's tree line at 3 m, so its crowns make the skyline's lower edge (not the 12 m grid's steps)
  const shore = new Mesh(grid(FAR_SHORE_X - 30, FAR_SHORE_X + 90, -560, 460, 3, 0, true), mat);
  shore.name = 'manko-far-shore';
  const town = city(), rocks = stones();
  group.add(near, far, shore, town, rocks);
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = false; o.updateMatrix(); });
  rocks.castShadow = rocks.receiveShadow = true;
  return {
    group,
    setHaze: (color) => { haze.uHazeCol.value.copy(color); },
    dispose: () => {
      for (const m of [near, far, shore, town, rocks]) m.geometry.dispose();
      map.dispose(); mat.dispose();
      const tm = town.material as MeshLambertMaterial; tm.map?.dispose(); tm.dispose();
      (rocks.material as MeshStandardMaterial).dispose();
      group.removeFromParent();
    },
  };
}
