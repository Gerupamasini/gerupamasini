import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter,
  Matrix4, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace, type Material,
} from 'three';
import { Rng } from '../../../core/Rng';
import { COAST_N, COAST_S, HALF, heightAt as shoreHeight, vnoise } from './shape';

/**
 * The land around the 走水 shore, in three dimensions and standing still in the world (it is near enough for the eye to
 * move against it): the shore's own beach, seawall and coast road carried on along the coast; behind them a small
 * seaside town of streets and two- and three-storey houses, climbing gently to the wooded Miura hills; to the north a
 * wooded headland after 観音崎 jutting out into the bay; to the south a lower wooded point with a harbour wall. The woods
 * are evergreen broadleaf (スダジイ, タブノキ): rounded crowns packed close, drawn as camera-facing cards in one
 * instanced draw. Nothing casts shadows; the haze is lighter than the scene's fog (that one is for the water's own
 * distance), so the hills stand clear at a few hundred metres and soften toward a kilometre.
 */

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const fbm = (x: number, z: number, seed: number): number => 0.55 * vnoise(x, z, seed) + 0.3 * vnoise(x * 2.03, z * 2.03, seed + 1) + 0.15 * vnoise(x * 4.1, z * 4.1, seed + 2);

// ------------------------------------------------------------------ the shape of the land
/** where the hills rise behind the town (x) */
export const HILL_FOOT_X = -175;

/** The Miura hills behind the town: a steep wooded front rounding off to a crest some 200–280 m further in. */
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

// ------------------------------------------------------------------ the town behind the beach
/** streets parallel to the shore (their x) and a cross street every CROSS m along it */
const STREETS_X = [-52, -90, -130, -168];
const CROSS = 46;

/** the town's ground rising gently from the coast road toward the hills (0 at the map's edge) */
export function townRise(x: number): number {
  return Math.max(0, (-50 - x) * 0.045);
}

/** whether (x, z) is on one of the town's streets */
export function onStreet(x: number, z: number): boolean {
  if (x > -49 || x < HILL_FOOT_X - 4) return false;
  for (const sx of STREETS_X) if (Math.abs(x - sx) < 3) return true;
  return (((z - COAST_N) % CROSS) + CROSS) % CROSS < 6;
}

/**
 * The ground (T.P. m) anywhere around the map: the shore's own profile (beach, seawall, the road behind it, the sea
 * floor) carried on along the coast, the town's gentle rise, and the hills and the points on top. Inside the map it is
 * the map's own terrain.
 */
export function landHeight(x: number, z: number): number {
  return shoreHeight(x, z) + townRise(x) + relief(x, z);
}

export interface Lot { x: number; z: number; w: number; d: number; h: number; rot: number; kind: 'house' | 'block' | 'garden' }

/**
 * The town's lots, in rows along both sides of the streets parallel to the shore: mostly two-storey houses, some of
 * three, now and then a small block of flats over two lots, and here and there a garden with a tree. None on the
 * hills or the points' slopes, none inside the map. (w runs along the street, d across it.)
 */
export function townLots(seed = 0x70e1): Lot[] {
  const rng = new Rng(seed);
  const out: Lot[] = [];
  const rows = [-60.5, -81.5, -98.5, -121.5, -138.5, -159.5];
  for (const rx of rows) {
    for (let z = COAST_N + 8; z < COAST_S - 8;) {
      const zz = (((z - COAST_N) % CROSS) + CROSS) % CROSS;
      if (zz < 7) { z += 7 - zz; continue; }
      const roll = rng.next();
      const w = roll < 0.06 ? rng.range(20, 26) : rng.range(9, 13);
      const x = rx + rng.range(-1.2, 1.2), cz = z + w / 2;
      z += w + rng.range(0.5, 2.5);
      if (Math.abs(x) < HALF + 4 && Math.abs(cz) < HALF + 4) continue;
      if (relief(x, cz) > 2.5 || relief(x, cz - w / 2) > 2.5 || relief(x, cz + w / 2) > 2.5) continue;
      if (roll < 0.06) out.push({ x, z: cz, w: w - 2, d: rng.range(10, 12), h: rng.range(10, 14), rot: 0, kind: 'block' });
      else if (roll < 0.15) out.push({ x, z: cz, w: w - 2, d: 9, h: 0, rot: 0, kind: 'garden' });
      else out.push({ x, z: cz, w: w - rng.range(1.5, 3.5), d: rng.range(7.5, 10.5), h: roll < 0.3 ? rng.range(8, 9.8) : rng.range(5.4, 7.2), rot: rng.chance(0.5) ? 0 : Math.PI / 2, kind: 'house' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ haze
const haze = { uHazeCol: { value: new Color(0.75, 0.8, 0.85) }, uHazeK: { value: 0.0009 } };

/** The land's own light haze in place of the scene fog: exp² with a quarter of the fog's density. */
function hazy<T extends Material>(mat: T, key: string, more?: (vs: string) => string, frag?: (fs: string) => string): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHazeCol = haze.uHazeCol;
    sh.uniforms.uHazeK = haze.uHazeK;
    let vs = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHaze;');
    if (more) vs = more(vs);
    sh.vertexShader = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\nvHaze = length(mvPosition.xyz);');
    let fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHazeCol;\nuniform float uHazeK;\nvarying float vHaze;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, 1.0 - exp(-pow(uHazeK * vHaze, 2.0)));');
    if (frag) fs = frag(fs);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `hashirimizu-land-${key}`;
  return mat;
}

// ------------------------------------------------------------------ the ground
// (linear colours) the shore's sand as the terrain draws it, the road and its verges, the woods' floor, bare cliff
const SAND = [0.36, 0.33, 0.26], WET = [0.23, 0.21, 0.17], VERGE = [0.12, 0.15, 0.07], FLOOR = [0.04, 0.065, 0.025], CLIFF = [0.13, 0.12, 0.1];

const ASPHALT = [0.055, 0.055, 0.06], YARD = [0.12, 0.12, 0.11];

function groundColour(x: number, z: number, h: number, steep: number, r: number): number[] {
  const n = 0.85 + 0.3 * vnoise(x * 0.15, z * 0.15, 131);
  let c: number[];
  if (r > 1.5) c = FLOOR;                                   // the woods (their floor, in the crowns' shade)
  else if (onStreet(x, z)) c = ASPHALT;
  else if (x < -49 && h > 2.2) {                            // the town's yards: paving and gardens
    const g = vnoise(x * 0.3, z * 0.3, 137);
    c = YARD.map((v, i) => v * (1 - g) + VERGE[i] * g);
  } else if (h > 2.2) c = VERGE;                             // the road side
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
  // a tree or two in each of the town's gardens
  for (const lot of townLots()) {
    if (lot.kind !== 'garden') continue;
    for (let k = 0; k < 2; k++) {
      const x = lot.x + rng.range(-2.5, 2.5), z = lot.z + rng.range(-lot.w / 3, lot.w / 3);
      out.push({ x, y: landHeight(x, z), z, size: rng.range(4, 6.5), variant: Math.floor(rng.next() * 4), tint: rng.next() });
    }
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

// ------------------------------------------------------------------ the town's houses and flats, the harbour wall
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

/** a block of flats: a box with a flat roof (the storeys, windows and balconies are drawn by the facade shader) */
function blockGeometry(wall: number[]): BufferGeometry {
  const P: number[] = [], C: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], col: number[]) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) C.push(...col); };
  const w = 0.5, dd = 0.5, dim = wall.map((v) => v * 0.8);
  quad([-w, 0, dd], [w, 0, dd], [w, 1, dd], [-w, 1, dd], wall);
  quad([w, 0, -dd], [-w, 0, -dd], [-w, 1, -dd], [w, 1, -dd], dim);
  quad([w, 0, dd], [w, 0, -dd], [w, 1, -dd], [w, 1, dd], dim);
  quad([-w, 0, -dd], [-w, 0, dd], [-w, 1, dd], [-w, 1, -dd], wall);
  quad([-w, 1, dd], [w, 1, dd], [w, 1, -dd], [-w, 1, -dd], [0.2, 0.2, 0.2]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The facades of the instanced houses and flats, in metres from each instance's own scale: storeys of 2.85 m, bays
 * of windows (aluminium frames, the upper panes catching the sky, some with the 雨戸 shutters drawn, some bays
 * blank), a darker plinth, shade under the eaves, a band at each floor, balconies on the flats, tile rows on the
 * roofs. All of it fades to the wall's average where a bay is under a few pixels.
 */
const FACADE_VS = (vs: string): string => vs
  .replace('#include <common>', `#include <common>
varying vec3 vFac;
varying vec4 vFacInfo;`)
  .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  {
    vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    bool sx = abs(normal.x) > 0.5;
    vFac = vec3(sx ? position.z * sc.z : position.x * sc.x, position.y * sc.y, normal.y > 0.3 ? 2.0 : (position.y > 1.001 ? 1.0 : 0.0));
    vFacInfo = vec4(0.5 * (sx ? sc.z : sc.x), sc.y, fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453), 1.0);
  }
#else
  vFac = vec3(0.0); vFacInfo = vec4(0.0);
#endif`);

const FACADE_FS = (fs: string): string => fs
  .replace('#include <common>', `#include <common>
varying vec3 vFac;
varying vec4 vFacInfo;
float facHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
  .replace('#include <color_fragment>', `#include <color_fragment>
if (vFacInfo.w > 0.5 && vFac.z < 0.5) {
  float y = vFac.y - 0.25, top = vFacInfo.y - 0.25;
  bool flats = vFacInfo.y > 9.5;
  float storey = flats ? 2.9 : 2.85;
  float fl = floor(y / storey), fy = y - fl * storey;
  float nFl = max(1.0, floor(top / storey + 0.25));
  float bayW = flats ? 2.6 : 1.7 + 0.7 * vFacInfo.z;
  float bx = vFac.x / bayW + vFacInfo.z * 7.0;
  float bay = floor(bx), fx = fract(bx);
  // (the house's seed rounded first: interpolation leaves it a hair different at every pixel, and the hash would
  // turn that hair into noise)
  float h = facHash(vec3(bay, fl, floor(vFacInfo.z * 97.0 + 0.5)));
  float inside = step(abs(vFac.x), vFacInfo.x - 0.5) * step(fl, nFl - 1.0) * step(0.0, y);
  float hasWin = inside * step(flats ? 0.08 : 0.3, h);
  float wx = smoothstep(0.16, 0.18, fx) * (1.0 - smoothstep(0.82, 0.84, fx));
  float wy = smoothstep(0.85, 0.87, fy) * (1.0 - smoothstep(2.15, 2.17, fy));
  float win = hasWin * wx * wy;
  float glass = win * smoothstep(0.2, 0.215, fx) * (1.0 - smoothstep(0.785, 0.8, fx)) * smoothstep(0.91, 0.93, fy) * (1.0 - smoothstep(2.09, 2.11, fy));
  float mullion = 1.0 - (1.0 - smoothstep(0.0, 0.012, abs(fx - 0.5))) * glass;
  vec3 glassCol = mix(vec3(0.025, 0.03, 0.04), vec3(0.15, 0.18, 0.21), smoothstep(1.2, 2.1, fy));
  vec3 paneCol = h > 0.86 && !flats ? vec3(0.3, 0.29, 0.27) : glassCol * mullion + vec3(0.4) * (1.0 - mullion);
  vec3 wall = diffuseColor.rgb;
  vec3 c = mix(wall, vec3(0.42, 0.43, 0.43), win);
  c = mix(c, paneCol, glass);
  if (flats) {
    // balconies: a slab at each floor and the rail's darker band across the lower window
    float slab = step(0.5, fl) * (1.0 - smoothstep(0.0, 0.18, fy)) * inside;
    float rail = step(0.5, fl) * smoothstep(0.18, 0.2, fy) * (1.0 - smoothstep(1.15, 1.17, fy)) * inside;
    c = mix(c, wall * 1.15, slab);
    c = mix(c, c * 0.55 + vec3(0.03), rail * 0.8);
  } else {
    c *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.1, abs(fy))) * step(0.5, fl);   // the band at each floor
  }
  c *= mix(0.6, 1.0, smoothstep(0.0, 0.45, y));                 // plinth, and the ground's shade
  c *= mix(0.72, 1.0, smoothstep(0.0, 0.6, top - y));            // under the eaves
  // a window bay under a few pixels: its average instead of shimmering stripes
  float far = smoothstep(0.12, 0.35, fwidth(bx));
  vec3 avg = wall * mix(0.6, 0.83, step(0.0, y)) * mix(1.0, 0.72, inside * 0.55);
  diffuseColor.rgb = mix(c, avg, far);
} else if (vFacInfo.w > 0.5 && vFac.z > 1.5) {
  // the roof: rows of tiles (or the ribs of a sheet roof), fading out with distance
  float r = vFac.y * 3.3;
  float rows = 0.86 + 0.14 * smoothstep(0.0, 0.3, fract(r));
  diffuseColor.rgb *= mix(rows, 0.93, smoothstep(0.2, 0.6, fwidth(r)));
}`);

function structures(rng: Rng): Object3D[] {
  const mat = hazy(new MeshLambertMaterial({ vertexColors: true }), 'built', FACADE_VS, FACADE_FS);
  const out: Object3D[] = [];
  // the town: houses in the colours of a Japanese seaside street (off-white, beige, grey siding), tiled or sheet roofs
  const walls = [[0.62, 0.6, 0.55], [0.55, 0.5, 0.4], [0.4, 0.4, 0.39], [0.66, 0.64, 0.6], [0.47, 0.42, 0.34]];
  const roofs = [[0.06, 0.06, 0.07], [0.07, 0.09, 0.12], [0.11, 0.065, 0.045], [0.16, 0.16, 0.17]];
  const kinds = [
    ...walls.flatMap((w, i) => [houseGeometry(w, roofs[i % roofs.length]), houseGeometry(w, roofs[(i + 2) % roofs.length])]),
    blockGeometry([0.66, 0.65, 0.62]), blockGeometry([0.56, 0.52, 0.46]),
  ];
  const nHouse = walls.length * 2;
  const byKind: Matrix4[][] = kinds.map(() => []);
  const q = new Object3D();
  for (const lot of townLots()) {
    if (lot.kind === 'garden') continue;
    q.position.set(lot.x, landHeight(lot.x, lot.z) - 0.25, lot.z);
    q.rotation.set(0, lot.rot + rng.range(-0.05, 0.05), 0);
    // the unit box is x across the street and z along it; turned a quarter, the ridge runs the other way
    if (lot.rot) q.scale.set(lot.w, lot.h, lot.d); else q.scale.set(lot.d, lot.h, lot.w);
    q.updateMatrix();
    const k = lot.kind === 'block' ? nHouse + Math.floor(rng.next() * 2) : Math.floor(rng.next() * nHouse);
    byKind[k].push(q.matrix.clone());
  }
  kinds.forEach((g, i) => {
    if (!byKind[i].length) { g.dispose(); return; }
    const im = new InstancedMesh(g, mat, byKind[i].length);
    byKind[i].forEach((mm, k) => im.setMatrixAt(k, mm));
    im.name = i < nHouse ? 'houses' : 'flats';
    out.push(im);
  });
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
