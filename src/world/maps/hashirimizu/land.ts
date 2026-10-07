import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter,
  Matrix4, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/Rng';
import { COAST_N, COAST_S, HALF, heightAt as shoreHeight, vnoise } from './shape';

/**
 * The land around the 走水 shore, in three dimensions and standing still in the world (it is near enough for the eye to
 * move against it): the shore's own beach, seawall and coast road carried on along the coast; behind the road the
 * steep wooded Miura hills; to the north a wooded headland after 観音崎, jutting out into the bay with a white radar
 * tower on its summit and a lighthouse on the point; to the south a lower wooded point with a harbour wall. Houses line
 * the road. The woods are evergreen broadleaf (スダジイ, タブノキ): rounded crowns packed close, drawn as camera-facing
 * cards in one instanced draw. Nothing casts shadows; the haze is lighter than the scene's fog (that one is for the
 * water's own distance), so the hills stand clear at a few hundred metres and soften toward a kilometre.
 */

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const fbm = (x: number, z: number, seed: number): number => 0.55 * vnoise(x, z, seed) + 0.3 * vnoise(x * 2.03, z * 2.03, seed + 1) + 0.15 * vnoise(x * 4.1, z * 4.1, seed + 2);

// ------------------------------------------------------------------ the shape of the land
/** where the hills rise behind the coast road (x) */
export const HILL_FOOT_X = -86;

/** The Miura hills behind the road: a steep wooded front rounding off to a crest some 200–280 m inland. */
export function westHills(x: number, z: number): number {
  const u = HILL_FOOT_X - x;
  if (u <= 0) return 0;
  const crest = 78 + 30 * (fbm(z * 0.0035 + 2.1, 0.7, 101) - 0.5) + 14 * (vnoise(z * 0.02, 3.1, 103) - 0.5);
  // the valley the village of 走水 sits in, to the south
  const valley = 1 - 0.55 * Math.exp(-(((z - 470) / 70) ** 2));
  const rise = 1 - Math.exp(-u / 55);
  const spurs = 1 + 0.3 * (fbm(x * 0.012, z * 0.012, 107) - 0.5);
  return crest * rise * valley * spurs;
}

interface Knot { x: number; z: number; h: number; w: number }
/** the 観音崎 headland: from its root in the hills out to the point (height and half-width along the spine) */
const HEADLAND: Knot[] = [
  { x: -230, z: -250, h: 86, w: 170 },
  { x: -40, z: -262, h: 76, w: 150 },
  { x: 90, z: -292, h: 70, w: 126 },
  { x: 230, z: -320, h: 44, w: 96 },
  { x: 355, z: -345, h: 28, w: 62 },
  { x: 415, z: -352, h: 0, w: 34 },
];
/** the low point south of the beach, toward the 走水 harbour */
const SOUTH_POINT: Knot[] = [
  { x: -210, z: 330, h: 58, w: 92 },
  { x: -60, z: 352, h: 40, w: 76 },
  { x: 40, z: 366, h: 16, w: 46 },
  { x: 82, z: 372, h: 0, w: 26 },
];

/** a ridge along a spine: full height on it, falling away to its half-width, steepest at the foot (a sea cliff) */
function ridge(knots: Knot[], x: number, z: number): number {
  let best = 0;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], b = knots[i + 1];
    const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const px = a.x + ex * t, pz = a.z + ez * t;
    const w = (a.w + (b.w - a.w) * t) * (1 + 0.2 * (fbm(x * 0.01 + 7.7, z * 0.01, 113) - 0.5));
    const u = Math.hypot(x - px, z - pz) / w;
    if (u >= 1) continue;
    const h = (a.h + (b.h - a.h) * t) * Math.pow(1 - u * u, 0.7) * (1 + 0.16 * (fbm(x * 0.02, z * 0.02, 117) - 0.5));
    best = Math.max(best, h);
  }
  return best;
}

/** how much the hills and the points raise the ground here (m) */
export function relief(x: number, z: number): number {
  return Math.max(westHills(x, z), ridge(HEADLAND, x, z), ridge(SOUTH_POINT, x, z));
}

/**
 * The ground (T.P. m) anywhere around the map: the shore's own profile (beach, seawall, the road behind it, the sea
 * floor) carried on along the coast, with the hills and the points on top. Inside the map it is the map's own terrain.
 */
export function landHeight(x: number, z: number): number {
  return shoreHeight(x, z) + relief(x, z);
}

/** the radar tower on the headland's summit and the lighthouse on its point */
export const TOWER = { x: 92, z: -296 };
export const LIGHTHOUSE = { x: 348, z: -344 };

// ------------------------------------------------------------------ haze
const haze = { uHazeCol: { value: new Color(0.75, 0.8, 0.85) }, uHazeK: { value: 0.0009 } };

/** The land's own light haze in place of the scene fog: exp² with a quarter of the fog's density. */
function hazy<T extends Material>(mat: T, key: string, more?: (vs: string) => string): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHazeCol = haze.uHazeCol;
    sh.uniforms.uHazeK = haze.uHazeK;
    let vs = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHaze;');
    if (more) vs = more(vs);
    sh.vertexShader = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\nvHaze = length(mvPosition.xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol;\nuniform float uHazeK;\nvarying float vHaze;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, 1.0 - exp(-pow(uHazeK * vHaze, 2.0)));');
  };
  mat.customProgramCacheKey = () => `hashirimizu-land-${key}`;
  return mat;
}

// ------------------------------------------------------------------ the ground
// (linear colours) the shore's sand as the terrain draws it, the road and its verges, the woods' floor, bare cliff
const SAND = [0.27, 0.255, 0.21], WET = [0.17, 0.16, 0.13], VERGE = [0.12, 0.15, 0.07], FLOOR = [0.04, 0.065, 0.025], CLIFF = [0.13, 0.12, 0.1];

function groundColour(x: number, z: number, h: number, steep: number, r: number): number[] {
  const n = 0.85 + 0.3 * vnoise(x * 0.15, z * 0.15, 131);
  let c: number[];
  if (r > 1.5) c = FLOOR;                                   // the woods (their floor, in the crowns' shade)
  else if (h > 2.2) c = VERGE;                               // the road side and the gardens
  else if (h > -0.2) c = SAND;
  else c = WET;
  // bare rock only where a point drops into the sea: its lowest few metres, steep and wave-washed
  const seaCliff = shoreHeight(x, z) < 0.5 ? sstep(0.8, 1.4, steep) * (1 - sstep(2.5, 6, h)) * (r > 0.5 ? 1 : 0) : 0;
  return c.map((v, i) => (v * (1 - seaCliff) + CLIFF[i] * seaCliff) * n);
}

/**
 * One grid of the ground over [x0, x1] × [z0, z1]: triangles inside `hole` (the map, or the finer grid) and those deep
 * under the sea are left out.
 */
function groundGeometry(x0: number, x1: number, z0: number, z1: number, cell: number, hole: number, deep: number): BufferGeometry {
  const nx = Math.round((x1 - x0) / cell) + 1, nz = Math.round((z1 - z0) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * nx + i;
    hs[k] = landHeight(x, z);
    pos[k * 3] = x; pos[k * 3 + 1] = hs[k]; pos[k * 3 + 2] = z;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell;
    const gx = (hs[j * nx + Math.min(nx - 1, i + 1)] - hs[j * nx + Math.max(0, i - 1)]) / (2 * cell);
    const gz = (hs[Math.min(nz - 1, j + 1) * nx + i] - hs[Math.max(0, j - 1) * nx + i]) / (2 * cell);
    const c = groundColour(x, z, hs[k], Math.hypot(gx, gz), relief(x, z));
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
    if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue;
    if (Math.max(hs[a], hs[b], hs[c], hs[d]) < deep) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the woods
/**
 * Four rounded broadleaf crowns in a 2 × 2 atlas (evergreen スダジイ / タブ: dense, dark and glossy): a lumpy outline
 * of a few lobes, filled with hundreds of small leaf clusters, deep shadow between them, the sunlit tops of the lobes
 * a little lighter and only a few highlights.
 */
function crownAtlas(): CanvasTexture {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S * 2;
  const c = cv.getContext('2d')!;
  let seed = 0x7a11;
  const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 374761393) >>> 0; return seed / 4294967296; };
  const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = Math.floor(v / 2) * S;
    // the crown's lobes (sub-crowns), the top ones higher and the outline rounded
    const lobes: [number, number, number][] = [[S * 0.5, S * 0.46, S * 0.27]];
    const nl = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2 + rnd() * 0.6;
      lobes.push([S * (0.5 + Math.cos(a) * (0.22 + 0.05 * rnd())), S * (0.45 - Math.sin(a) * (0.2 + 0.06 * rnd())), S * (0.12 + 0.07 * rnd())]);
    }
    // depth of a point inside the crown (0 at the rim) and how much it faces up toward the light, from its lobe
    const shape = (x: number, y: number): [number, number] => {
      let best = -1, lit = 0;
      for (const [lx, ly, lr] of lobes) {
        const d = 1 - Math.hypot(x - lx, y - ly) / lr;
        if (d > best) { best = d; lit = (ly - y) / lr * 0.8 + (lx - x) / lr * 0.25; }
      }
      return [best, lit];
    };
    // the dark mass inside the outline first
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S, y = rnd() * S;
      const [d] = shape(x, y);
      if (d < 0.05) continue;
      const r = S * (0.02 + 0.025 * rnd());
      c.fillStyle = rgb(24 + 12 * rnd(), 42 + 14 * rnd(), 18 + 9 * rnd());
      c.beginPath(); c.arc(ox + x, oy + y, r, 0, Math.PI * 2); c.fill();
    }
    // the leaf clusters: small, many; brighter where their lobe faces up, the rim ragged
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S, y = rnd() * S;
      const [d, lit] = shape(x, y);
      if (d < -0.02 || (d < 0.12 && rnd() < 0.5)) continue;
      const r = S * (0.008 + 0.016 * rnd());
      const k = Math.max(0, Math.min(1, 0.42 + 0.5 * lit + 0.28 * (rnd() - 0.5)));
      const base: [number, number, number] = [38 + 78 * k, 66 + 100 * k, 26 + 42 * k];
      const g = c.createRadialGradient(ox + x - r * 0.3, oy + y - r * 0.35, 0, ox + x, oy + y, r);
      g.addColorStop(0, rgb(base[0] * 1.15, base[1] * 1.12, base[2] * 1.05));
      g.addColorStop(0.75, rgb(base[0] * 0.8, base[1] * 0.82, base[2] * 0.75));
      g.addColorStop(1, rgb(base[0] * 0.55, base[1] * 0.6, base[2] * 0.5, 0.9));
      c.fillStyle = g;
      c.beginPath(); c.arc(ox + x, oy + y, r, 0, Math.PI * 2); c.fill();
    }
    // a few glints of glossy leaves on the sunlit tops
    for (let i = 0; i < 160; i++) {
      const x = rnd() * S, y = rnd() * S;
      const [d, lit] = shape(x, y);
      if (d < 0.08 || lit < 0.25) continue;
      c.fillStyle = rgb(120, 150, 80, 0.55);
      c.fillRect(ox + x, oy + y, 1.5, 1.5);
    }
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export interface TreeSite { x: number; y: number; z: number; size: number; variant: number; tint: number }

/**
 * Where the crowns stand: a jittered scatter, closer together near the map and wider apart toward the far ridges (the
 * crowns grow with the spacing, so the canopy stays closed), on the hills and the points but not on the road, the
 * beach, bare cliff or the far sides nobody sees.
 */
export function treeSites(seed = 0x5eed7): TreeSite[] {
  const rng = new Rng(seed);
  const out: TreeSite[] = [];
  const G = 4;
  for (let z = -640; z < 640; z += G) for (let x = -640; x < 520; x += G) {
    const dist = Math.hypot(x, z);
    const s = Math.max(4.5, Math.min(16, 3.6 + 0.012 * dist));
    if (!rng.chance((G / s) ** 2)) continue;
    const px = x + rng.range(0, G), pz = z + rng.range(0, G);
    if (Math.abs(px) < HALF + 2 && Math.abs(pz) < HALF + 2) continue;
    const r = relief(px, pz);
    if (r < 2) continue;
    const h = landHeight(px, pz);
    if (h < 3) continue;                                                   // the wave-washed foot of a point
    const e = 2;
    const gx = (landHeight(px + e, pz) - landHeight(px - e, pz)) / (2 * e), gz = (landHeight(px, pz + e) - landHeight(px, pz - e)) / (2 * e);
    if (Math.hypot(gx, gz) > 2.4) continue;                                // sheer
    // the slopes that face away from the shore, and the hills' back beyond the crest, cannot be seen
    const len = Math.hypot(px, pz), face = (gx * px + gz * pz) / Math.max(1, len);
    if (face < -0.35 && r < 0.92 * relief(px * 0.9, pz * 0.9)) continue;
    if (HILL_FOOT_X - px > 300) continue;
    // a closed canopy: each crown spreads over its neighbours'
    out.push({ x: px, y: h, z: pz, size: s * rng.range(1.55, 2.1), variant: Math.floor(rng.next() * 4), tint: rng.next() });
  }
  return out;
}

/** the canopy's greens (linear): the dark glossy スダジイ, the lighter タブ, the yellow-green of new growth */
const TINTS = [[0.66, 0.7, 0.58], [0.55, 0.62, 0.48], [0.8, 0.84, 0.58], [0.62, 0.64, 0.5], [0.88, 0.88, 0.6], [0.58, 0.64, 0.54]];

function woods(sites: TreeSite[]): InstancedMesh {
  const geo = new PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, 0.42, 0);
  const variant = new Float32Array(sites.length);
  const mat = hazy(new MeshLambertMaterial({ map: crownAtlas(), alphaTest: 0.5 }), 'crowns', (vs) => vs
    .replace('#include <common>', '#include <common>\nattribute float aVariant;\nvarying vec2 vCell;')
    // atlas cell 0..3; 4..7 the same crowns mirrored (in the texture, so every card stays front-facing and lit from the front)
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nfloat bbCell = mod(aVariant, 4.0);\nvMapUv.x = mix(vMapUv.x, 1.0 - vMapUv.x, step(3.5, aVariant));\nvMapUv = vMapUv * 0.5 + vec2(mod(bbCell, 2.0), floor(bbCell / 2.0)) * 0.5;\n#endif')
    // a card that turns about its upright to face the eye; its normal leans up and toward the eye, so a crown is lit
    // from the sky above and shaded on the side away from the sun
    .replace('#include <defaultnormal_vertex>', `
      vec3 bbCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 bbToEye = cameraPosition - bbCenter; bbToEye.y = 0.0; bbToEye = normalize(bbToEye + vec3(1e-4, 0.0, 0.0));
      vec3 bbRight = vec3(bbToEye.z, 0.0, -bbToEye.x);
      vec2 bbScale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
      float bbX = position.x;
      vec3 transformedNormal = normalize(mat3(viewMatrix) * normalize(bbRight * bbX * 0.5 + vec3(0.0, 1.0 + position.y * 0.35, 0.0) + bbToEye * 0.35));`)
    .replace('#include <project_vertex>', `
      vec4 mvPosition = viewMatrix * vec4(bbCenter + bbRight * bbX * bbScale.x + vec3(0.0, position.y * bbScale.y, 0.0), 1.0);
      gl_Position = projectionMatrix * mvPosition;`));
  const im = new InstancedMesh(geo, mat, sites.length);
  const m = new Matrix4(), col = new Color();
  sites.forEach((t, i) => {
    const w = t.size * (0.9 + 0.2 * ((t.tint * 7.3) % 1));
    m.makeScale(w, t.size * 0.9, 1);
    m.setPosition(t.x, t.y - 0.6, t.z);
    im.setMatrixAt(i, m);
    const tc = TINTS[Math.floor(t.tint * TINTS.length) % TINTS.length];
    im.setColorAt(i, col.setRGB(tc[0], tc[1], tc[2]));
    variant[i] = t.variant + ((t.tint * 13) % 1 < 0.5 ? 4 : 0);
  });
  geo.setAttribute('aVariant', new InstancedBufferAttribute(variant, 1));
  im.frustumCulled = false;
  im.name = 'woods';
  return im;
}

// ------------------------------------------------------------------ houses, the tower, the lighthouse, the harbour wall
/** a box with a gable roof (unit: 1 wide along x, 1 deep, walls 1 high, ridge 0.35 above), its own vertex colours */
function houseGeometry(wall: number[], roof: number[]): BufferGeometry {
  const box = new BufferGeometry();
  const P: number[] = [], C: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], col: number[]) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) C.push(...col); };
  const w = 0.5, dd = 0.5, H = 1, R = 1.35, o = 0.06;
  const dim = wall.map((v) => v * 0.8);
  quad([-w, 0, dd], [w, 0, dd], [w, H, dd], [-w, H, dd], wall);
  quad([w, 0, -dd], [-w, 0, -dd], [-w, H, -dd], [w, H, -dd], dim);
  quad([w, 0, dd], [w, 0, -dd], [w, H, -dd], [w, H, dd], dim);
  quad([-w, 0, -dd], [-w, 0, dd], [-w, H, dd], [-w, H, -dd], wall);
  // gable ends
  P.push(-w, H, dd, w, H, dd, 0, R, dd, w, H, -dd, -w, H, -dd, 0, R, -dd); for (let i = 0; i < 6; i++) C.push(...wall);
  // roof slopes (with eaves)
  quad([-w - o, H - 0.04, dd + o], [0, R, dd + o], [0, R, -dd - o], [-w - o, H - 0.04, -dd - o], roof);
  quad([0, R, dd + o], [w + o, H - 0.04, dd + o], [w + o, H - 0.04, -dd - o], [0, R, -dd - o], roof.map((v) => v * 0.75));
  box.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  box.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  box.computeVertexNormals();
  return box;
}

/** a white tower of stacked prisms (radius, base height, top height) with a dark band where the glass is */
function towerGeometry(parts: [number, number, number, number[]][], sides: number): BufferGeometry {
  const geos: BufferGeometry[] = [];
  for (const [r, y0, y1, col] of parts) {
    const P: number[] = [], C: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (a: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
      P.push(...p(a0, y0), ...p(a1, y0), ...p(a1, y1), ...p(a0, y0), ...p(a1, y1), ...p(a0, y1));
      P.push(...p(a1, y1), ...p(a0, y1), 0, y1, 0);
      for (let k = 0; k < 9; k++) C.push(...col);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
    geos.push(g);
  }
  const g = mergeGeometries(geos)!;
  geos.forEach((x) => x.dispose());
  g.computeVertexNormals();
  return g;
}

function structures(rng: Rng): Object3D[] {
  const mat = hazy(new MeshLambertMaterial({ vertexColors: true }), 'built');
  const out: Object3D[] = [];
  // houses along the coast road behind the seawall, and up the valley to the south
  const walls = [[0.62, 0.6, 0.55], [0.55, 0.5, 0.4], [0.4, 0.4, 0.39], [0.66, 0.64, 0.6], [0.47, 0.42, 0.34]];
  const roofs = [[0.06, 0.06, 0.07], [0.07, 0.09, 0.12], [0.11, 0.065, 0.045], [0.16, 0.16, 0.17]];
  const kinds = walls.flatMap((w, i) => [houseGeometry(w, roofs[i % roofs.length]), houseGeometry(w, roofs[(i + 2) % roofs.length])]);
  const placed: [number, number, number, number, number, number][] = [];
  for (let z = COAST_N + 14; z < COAST_S - 10; z += rng.range(11, 17)) {
    if (rng.chance(0.18)) continue;
    const x = rng.range(-78, -66);
    placed.push([x, z, rng.range(6, 10), rng.range(7, 11), rng.range(4.5, 7.5), rng.chance(0.5) ? 0 : Math.PI / 2]);
  }
  for (let k = 0; k < 26; k++) {
    const z = rng.range(400, 560), x = rng.range(-150, -80);
    if (relief(x, z) > 18) continue;
    placed.push([x, z, rng.range(6, 9), rng.range(7, 10), rng.range(4.5, 7), rng.range(0, Math.PI)]);
  }
  const byKind: Matrix4[][] = kinds.map(() => []);
  const m = new Matrix4(), q = new Object3D();
  for (const [x, z, w, d, h, rot] of placed) {
    q.position.set(x, landHeight(x, z) - 0.2, z);
    q.rotation.set(0, rot + rng.range(-0.08, 0.08), 0);
    q.scale.set(w, h, d);
    q.updateMatrix();
    byKind[Math.floor(rng.next() * kinds.length)].push(m.copy(q.matrix).clone());
  }
  kinds.forEach((g, i) => {
    if (!byKind[i].length) { g.dispose(); return; }
    const im = new InstancedMesh(g, mat, byKind[i].length);
    byKind[i].forEach((mm, k) => im.setMatrixAt(k, mm));
    im.name = 'houses';
    out.push(im);
  });
  // the radar tower of the traffic centre on the headland's summit: a white shaft, the radar deck, the mast
  const W = [0.8, 0.8, 0.78], D = [0.05, 0.06, 0.07];
  const tower = new Mesh(towerGeometry([[2.4, -2, 26, W], [3.8, 26, 27, W], [3.3, 27, 31, D], [3.9, 31, 32.5, W], [1.2, 32.5, 37, W], [0.25, 37, 44, W]], 8), mat);
  tower.position.set(TOWER.x, landHeight(TOWER.x, TOWER.z), TOWER.z);
  tower.name = 'tower';
  out.push(tower);
  // the lighthouse on the point: an octagonal white tower, the lamp room, the dome
  const light = new Mesh(towerGeometry([[2.6, -2, 3, W], [1.9, 3, 14, W], [2.5, 14, 15, W], [1.7, 15, 17.5, D], [1.9, 17.5, 18.2, W], [1.2, 18.2, 19.3, [0.2, 0.2, 0.2]]], 8), mat);
  light.position.set(LIGHTHOUSE.x, landHeight(LIGHTHOUSE.x, LIGHTHOUSE.z), LIGHTHOUSE.z);
  light.name = 'lighthouse';
  out.push(light);
  // the harbour wall off the south point
  const bw = houseGeometry([0.5, 0.49, 0.46], [0.5, 0.49, 0.46]);
  const wall = new Mesh(bw, mat);
  wall.position.set(70, -1.5, 372);
  wall.rotation.y = -0.22;
  wall.scale.set(140, 3.6, 7);
  wall.name = 'harbour-wall';
  out.push(wall);
  return out;
}

// ------------------------------------------------------------------ all of it
export interface Land {
  group: Group;
  /** the haze takes the sky's colour every frame */
  setHaze(color: Color): void;
  dispose(): void;
}

export function buildHashirimizuLand(): Land {
  const group = new Group();
  group.name = 'hashirimizu-land';
  const ground = hazy(new MeshLambertMaterial({ vertexColors: true }), 'ground');
  // a fine grid close round the map (its edge meets the map's own terrain), a coarse one out to the far ridges
  const near = new Mesh(groundGeometry(-208, 208, -208, 208, 4, HALF, -2.6), ground);
  const far = new Mesh(groundGeometry(-704, 704, -704, 704, 16, 208, -2.6), ground);
  near.name = 'land-near'; far.name = 'land-far';
  group.add(near, far);
  group.add(woods(treeSites()));
  for (const o of structures(new Rng(0x40e5))) group.add(o);
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = false; o.updateMatrix(); });
  return {
    group,
    setHaze: (color) => { haze.uHazeCol.value.copy(color); },
    dispose: () => {
      const mats = new Set<Material>();
      group.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mm = mesh.material as Material & { map?: { dispose(): void } | null };
        mats.add(mm);
      });
      for (const mm of mats) { (mm as Material & { map?: { dispose(): void } | null }).map?.dispose(); mm.dispose(); }
      group.removeFromParent();
    },
  };
}
