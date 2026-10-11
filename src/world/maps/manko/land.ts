import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, LinearMipmapLinearFilter,
  Mesh, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace, type IUniform,
} from 'three';
import { Rng } from '../../../core/Rng';
import type { Land } from '../hashirimizu/land';
import type { BackdropCrown } from '../../mangrove/MangroveForest';
import { canopyAt, crownAt, CROWN_CELL, FAR_SHORE_X, forestDepth, groundAt, HALF, shellProfile, vnoise } from './shape';

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

/** (the roof opens round the wetland centre, defined below, so its walls stand in a clearing, not inside the trees) */
const roofAt = (x: number, z: number) => canopyAt(x, z) * shellProfile(forestDepth(x, z)) * (1 - centreClear(x, z));

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
      if (roof < 1.2 || centreClear(cx, cz) > 0) continue;
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

function box(out: Buf, x: number, z: number, w: number, d: number, h: number, y0: number, colour: number[], floors: number, bays: number): void {
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

type Buf = { pos: number[]; uv: number[]; col: number[]; idx: number[] };
const newBuf = (): Buf => ({ pos: [], uv: [], col: [], idx: [] });
/** A quad a(bottom-left) b(bottom-right) c(top-left) d(top-right), counter-clockwise from its front, as box() does. */
function quad(buf: Buf, a: number[], b: number[], c: number[], d: number[], colour: number[], uv: number[] = [0, 0, 0, 0, 0, 0, 0, 0]): void {
  const o = buf.pos.length / 3;
  buf.pos.push(...a, ...b, ...c, ...d); buf.uv.push(...uv);
  for (let i = 0; i < 4; i++) buf.col.push(...colour);
  buf.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
}
/** Local building frame: u across the front, v toward the front, y up; yaw turns +v toward the basin. */
const frame = (cx: number, cz: number, yaw: number) => (u: number, y: number, v: number) =>
  [cx + Math.cos(yaw) * u + Math.sin(yaw) * v, y, cz - Math.sin(yaw) * u + Math.cos(yaw) * v];
/** A turned box (walls with the facade texture's floors/bays; a plain roof). */
function boxAt(buf: Buf, cx: number, cz: number, yaw: number, w: number, d: number, h: number, y0: number, colour: number[], floors: number, bays: number, plain = false): void {
  const P = frame(cx, cz, yaw), t = (n: number) => plain ? 0 : n;
  const fu = t(bays / 8), fv = t(floors / 16), su = t(bays * d / w / 8);
  quad(buf, P(-w, y0, d), P(w, y0, d), P(-w, y0 + h, d), P(w, y0 + h, d), colour, [0, 0, fu, 0, 0, fv, fu, fv]);
  quad(buf, P(w, y0, -d), P(-w, y0, -d), P(w, y0 + h, -d), P(-w, y0 + h, -d), colour, [0, 0, fu, 0, 0, fv, fu, fv]);
  quad(buf, P(-w, y0, -d), P(-w, y0, d), P(-w, y0 + h, -d), P(-w, y0 + h, d), colour, [0, 0, su, 0, 0, fv, su, fv]);
  quad(buf, P(w, y0, d), P(w, y0, -d), P(w, y0 + h, d), P(w, y0 + h, -d), colour, [0, 0, su, 0, 0, fv, su, fv]);
  quad(buf, P(-w, y0 + h, d), P(w, y0 + h, d), P(-w, y0 + h, -d), P(w, y0 + h, -d), colour);
}
/** A raised strip (3 faces) along a-b: the white mortar (漆喰) on an Okinawan roof's ridge and hips. */
function strip(buf: Buf, a: number[], b: number[], width: number, height: number, colour: number[]): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l * width / 2, sz = dx / l * width / 2;
  const up = (p: number[], k: number) => [p[0] + sx * k, p[1] + height, p[2] + sz * k];
  const lo = (p: number[], k: number) => [p[0] + sx * k, p[1], p[2] + sz * k];
  quad(buf, up(a, 1), up(b, 1), up(a, -1), up(b, -1), colour, MORTAR_UV);
  quad(buf, lo(a, -1), lo(b, -1), up(a, -1), up(b, -1), colour, MORTAR_UV);
  quad(buf, lo(b, 1), lo(a, 1), up(b, 1), up(a, 1), colour, MORTAR_UV);
}
/** the tile texture's plain white patch (constant UV: the face shows exactly its vertex colour) */
const MORTAR_UV = [0.985, 0.985, 0.985, 0.985, 0.985, 0.985, 0.985, 0.985];
/**
 * Okinawan hipped roof of red clay tiles (赤瓦): four slopes over a deep eave (雨端) with a dark soffit, white mortar
 * along the ridge and the four hips. W, D: half-sizes of the walls; the tiles' columns run down the slopes.
 */
function hipRoof(buf: Buf, walls: Buf, cx: number, cz: number, yaw: number, W: number, D: number, yEave: number, pitchDeg: number, overhang: number, tint: number[]): void {
  const P = frame(cx, cz, yaw), a = W + overhang, b = D + overhang, rise = b * Math.tan(pitchDeg * Math.PI / 180), L = Math.max(0, a - b), yr = yEave + rise;
  const E0 = P(-a, yEave, -b), E1 = P(a, yEave, -b), E2 = P(a, yEave, b), E3 = P(-a, yEave, b), R0 = P(-L, yr, 0), R1 = P(L, yr, 0);
  const slope = Math.hypot(b, rise) / 2.4, along = (2 * a) / 2.4, end = (2 * b) / 2.4;
  quad(buf, E3, E2, R0, R1, tint, [0, 0, along, 0, (a - L) / 2.4, slope, (a + L) / 2.4, slope]);
  quad(buf, E1, E0, R1, R0, tint, [0, 0, along, 0, (a - L) / 2.4, slope, (a + L) / 2.4, slope]);
  quad(buf, E2, E1, R1, R1, tint, [0, 0, end, 0, end / 2, slope, end / 2, slope]);
  quad(buf, E0, E3, R0, R0, tint, [0, 0, end, 0, end / 2, slope, end / 2, slope]);
  // the soffit under the eave and the fascia board round it (in the walls' mesh: plain colours)
  const S = (u: number, v: number) => P(u, yEave - 0.02, v), soffit = [0.2, 0.19, 0.17], fascia = [0.62, 0.58, 0.54];
  quad(walls, S(-a, b), S(a, b), S(-W, D), S(W, D), soffit);
  quad(walls, S(a, -b), S(-a, -b), S(W, -D), S(-W, -D), soffit);
  quad(walls, S(-a, -b), S(-a, b), S(-W, -D), S(-W, D), soffit);
  quad(walls, S(a, b), S(a, -b), S(W, D), S(W, -D), soffit);
  const F = (u: number, v: number, y: number) => P(u, y, v);
  for (const [p, q] of [[[-a, b], [a, b]], [[a, -b], [-a, -b]], [[-a, -b], [-a, b]], [[a, b], [a, -b]]])
    quad(walls, F(p[0], p[1], yEave - 0.28), F(q[0], q[1], yEave - 0.28), F(p[0], p[1], yEave), F(q[0], q[1], yEave), fascia);
  const white = [0.86, 0.84, 0.8];
  strip(buf, R0, R1, 0.5, 0.18, white);
  for (const [e, r] of [[E0, R0], [E3, R0], [E1, R1], [E2, R1]]) strip(buf, e, r, 0.4, 0.14, white);
}
/** A rooftop water tank on a stand (stainless or FRP), a fixture of Okinawan flat roofs. */
function tank(buf: Buf, x: number, y: number, z: number, r: number, h: number, colour: number[]): void {
  const n = 6, ring = (yy: number) => Array.from({ length: n }, (_, k) => [x + Math.cos(k / n * Math.PI * 2) * r, yy, z + Math.sin(k / n * Math.PI * 2) * r]);
  const lo = ring(y + 0.5), hi = ring(y + 0.5 + h);
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; quad(buf, lo[j], lo[k], hi[j], hi[k], colour); }
  for (let k = 1; k < n - 1; k++) quad(buf, hi[0], hi[k + 1], hi[k], hi[k], colour);
}

/** Original Okinawan clay-tile texture: 2.4 m × 2.4 m, 8 columns of flat tiles under round cover tiles set in white
 * mortar, 8 courses; tint jitter and faint mould. The top-right corner is a plain white patch for the mortar. */
function tileTexture(): CanvasTexture {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!, r = new Rng(0x7a11e5);
  c.fillStyle = '#b04e34'; c.fillRect(0, 0, size, size);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const x = col * 32, y = row * 32, jit = r.next();
    c.fillStyle = jit > 0.7 ? 'rgba(224,138,96,0.22)' : jit < 0.25 ? 'rgba(122,58,42,0.2)' : 'rgba(0,0,0,0)';
    c.fillRect(x, y, 32, 32);
  }
  for (let col = 0; col < 8; col++) {
    const x = col * 32 + 16;
    // white mortar beds either side of the round cover tile
    c.fillStyle = '#ece6da'; c.fillRect(x - 9, 0, 3, size); c.fillRect(x + 6, 0, 3, size);
    const g = c.createLinearGradient(x - 6, 0, x + 6, 0);
    g.addColorStop(0, '#9a4430'); g.addColorStop(0.5, '#d8714c'); g.addColorStop(1, '#9a4430');
    c.fillStyle = g; c.fillRect(x - 6, 0, 12, size);
  }
  for (let row = 0; row < 8; row++) { c.fillStyle = 'rgba(70,25,15,0.45)'; c.fillRect(0, row * 32 + 30, size, 2); }
  for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(40,45,30,${0.05 + r.next() * 0.08})`; c.beginPath(); c.ellipse(r.next() * size, r.next() * size, 6 + r.next() * 18, 4 + r.next() * 10, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#ece6da'; c.fillRect(size - 6, size - 6, 6, 6);
  const t = new CanvasTexture(canvas); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}

/**
 * The wetland centre (after 漫湖水鳥・湿地センター, user's photo): a long two-storey white concrete building under a big
 * hipped red-tile roof, standing just behind the mangroves to the south-west so the roof shows over the canopy
 * from the basin; a lower wing at one end steps the silhouette. Not a copy of the real building.
 */
export const CENTRE = { x: -140, z: 100, yaw: Math.atan2(140, -100), w: 17, d: 7.5 };
function centre(walls: Buf, tiles: Buf): void {
  const { x, z, yaw, w, d } = CENTRE, y0 = groundAt(x, z) - 0.3, h = 9.2, wallCol = [0.84, 0.83, 0.8];
  boxAt(walls, x, z, yaw, w, d, h, y0, wallCol, 2, 9);
  // the shade under the deep eave (the land casts no shadows): a dark band hugging the top of the walls
  boxAt(walls, x, z, yaw, w + 0.02, d + 0.02, 0.9, y0 + h - 0.9, wallCol.map(c => c * 0.55), 1, 1, true);
  hipRoof(tiles, walls, x, z, yaw, w, d, y0 + h, 24, 1.6, [1, 1, 1]);
  // the lower wing, set back at the east end
  const P = frame(x, z, yaw), wing = P(w + 5.5, 0, -1);
  boxAt(walls, wing[0], wing[2], yaw, 6, 5, 4.8, y0, wallCol, 1, 4);
  hipRoof(tiles, walls, wing[0], wing[2], yaw, 6, 5, y0 + 4.8, 24, 1.2, [0.92, 0.88, 0.85]);
}
/** visual-only clearing round the centre (the thicket and collision are unchanged) */
function centreClear(x: number, z: number): number {
  const dx = x - CENTRE.x, dz = z - CENTRE.z, c = Math.cos(CENTRE.yaw), s = Math.sin(CENTRE.yaw);
  const u = dx * c - dz * s, v = dx * s + dz * c;
  return Math.max(Math.abs(u) - (CENTRE.w + 15), Math.abs(v) - (CENTRE.d + 4)) < 0 ? 1 : 0;
}

/** Mid-rise apartment blocks behind the far shore's trees and a road bridge crossing the lake (user's photo). */
function city(): { walls: Mesh; tiles: Mesh } {
  const out = newBuf(), tiles = newBuf(), ok = new Rng(0x0c1a7a);
  const palette = [[1, 1, 1], [0.95, 0.93, 0.88], [0.92, 0.9, 0.86], [0.85, 0.83, 0.8], [1, 0.94, 0.86]];
  // Okinawan concrete: peach, pale yellow, mint and weathered grey among the white (picked with their own seed)
  const tropic = [[0.98, 0.88, 0.82], [0.98, 0.95, 0.8], [0.88, 0.95, 0.9], [0.8, 0.79, 0.76]];
  const block = (x: number, z: number, w: number, d: number, floors: number, col: number[]) => {
    const g = groundAt(x, z), h = floors * 3.1, c = ok.next() < 0.3 ? tropic[ok.int(0, tropic.length - 1)] : col;
    box(out, x, z, w, d, h, g, c, floors, Math.round(w / 3));
    const top = g + h;
    // rooftop water tanks and the stair house (塔屋), or a red-tile hipped cap on some lower blocks
    if (floors <= 10 && ok.next() < 0.25) { hipRoof(tiles, out, x, z, 0, w, d, top, 22, 0.6, [0.95, 0.9, 0.88]); return; }
    for (let k = ok.next() < 0.7 ? ok.int(1, 3) : 0; k > 0; k--)
      tank(out, x + ok.range(-w + 2, w - 2), top, z + ok.range(-d + 1.5, d - 1.5), ok.range(1, 1.3), ok.range(1.8, 2.4), ok.next() < 0.5 ? [0.72, 0.74, 0.78] : [0.86, 0.85, 0.8]);
    if (ok.next() < 0.4) box(out, x + ok.range(-w + 3, w - 3), z, 1.5, 1.5, 2.8, top, c, 1, 1);
  };
  for (let z = -520; z < 420; z += 30 + rnd() * 35) {
    const x = FAR_SHORE_X + 80 + rnd() * 90, floors = 6 + Math.floor(rnd() * 9), w = 12 + rnd() * 22, d = 7 + rnd() * 5;
    block(x, z, w, d, floors, palette[Math.floor(rnd() * palette.length)]);
    if (rnd() < 0.5) { const x2 = x + 40 + rnd() * 60, f2 = 9 + Math.floor(rnd() * 8); block(x2, z + 10, 10 + rnd() * 10, 8, f2, palette[Math.floor(rnd() * palette.length)]); }
  }
  // the bridge: a long low deck on piers, crossing the lake to the north
  const by = 7, z0 = -330;
  for (let x = 140; x < FAR_SHORE_X + 60; x += 34) box(out, x, z0, 1.2, 4, by, -2, [0.75, 0.75, 0.73], 2, 1);
  box(out, (140 + FAR_SHORE_X + 60) / 2, z0, (FAR_SHORE_X - 80) / 2 + 2, 7, 1.6, by, [0.8, 0.82, 0.84], 1, 1);
  centre(out, tiles);
  const mesh = (b: Buf, mat: MeshLambertMaterial, name: string) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new Mesh(g, mat); m.name = name; return m;
  };
  return {
    walls: mesh(out, hazy(new MeshLambertMaterial({ vertexColors: true, map: facadeTexture() }), 'city', false), 'manko-city'),
    tiles: mesh(tiles, hazy(new MeshLambertMaterial({ vertexColors: true, map: tileTexture() }), 'tiles', false), 'manko-tiles'),
  };
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
  const town = city();
  group.add(near, far, shore, town.walls, town.tiles);
  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = false; o.updateMatrix(); });
  return {
    group,
    setHaze: (color) => { haze.uHazeCol.value.copy(color); },
    dispose: () => {
      for (const m of [near, far, shore, town.walls, town.tiles]) m.geometry.dispose();
      map.dispose(); mat.dispose();
      for (const m of [town.walls, town.tiles]) { const tm = m.material as MeshLambertMaterial; tm.map?.dispose(); tm.dispose(); }
      group.removeFromParent();
    },
  };
}
