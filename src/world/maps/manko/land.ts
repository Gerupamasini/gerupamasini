import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, LinearMipmapLinearFilter,
  Mesh, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace, type IUniform,
} from 'three';
import { Rng } from '../../../core/Rng';
import type { Land } from '../hashirimizu/land';
import type { BackdropCrown } from '../../mangrove/MangroveForest';
import type { ImpostorSite } from '../../mangrove/impostor';
import type { HirugiBase } from '../../mangrove/types';
import { canopyAt, crownAt, CROWN_CELL, FAR_SHORE_X, forestDepth, groundAt, HALF, shellProfile, smooth, vnoise } from './shape';

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
const TOP = [0.17, 0.19, 0.024], SHADE = [0.058, 0.075, 0.011], HOLLOW = [0.013, 0.016, 0.004], UNDER = [0.02, 0.017, 0.012], MUD = [0.17, 0.145, 0.105];

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

/** (the roof opens round the wetland centre, defined below, so its walls stand in a clearing, not inside the trees, and
 * along the bridge's approach roads, which run through the forest in a cutting) */
const roofAt = (x: number, z: number) => canopyAt(x, z) * shellProfile(forestDepth(x, z)) * (1 - centreClear(x, z)) * (1 - roadClear(x, z));

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

/**
 * Original tiling foliage texture for the roof (5 m square): the mangrove's leaf rosettes, a little larger than life
 * (leaves ~0.3–0.4 m) so they still read as leaves a couple of hundred metres off, in three layers — shaded ones deep
 * in the canopy, then the middle, then the sunlit tops — each leaf pointed, folded along a pale midrib, lighter at
 * its upper half; the gaps between them near black. RGB: young yellow-green and older darker leaves among the mean.
 * No photographs. `userData.norm` brings its mean (linear) to that of the old leaf-mass texture.
 */
function roofTexture(): CanvasTexture {
  const size = 512, canvas = document.createElement('canvas'), r = new Rng(0x1eaf5);
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!, px = size / 5;
  c.fillStyle = '#1c1d18'; c.fillRect(0, 0, size, size);
  const leaf = (x: number, y: number, a: number, len: number, v: number, warm: number) => {
    const w = len * 0.4, rgb = (k: number) => `rgb(${Math.min(255, v * k * (1 + 0.1 * warm)) | 0},${Math.min(255, v * k) | 0},${Math.min(255, v * k * (1 - 0.22 * warm)) | 0})`;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const cx = x + ox, cy = y + oy;
      if (cx < -len || cy < -len || cx > size + len || cy > size + len) continue;
      c.save(); c.translate(cx, cy); c.rotate(a);
      // the lower half of the blade (in the leaf's own shade), then the upper half catching the light
      c.fillStyle = rgb(0.78);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.3, w * 1.05, len * 0.78, w * 0.8, len, 0); c.closePath(); c.fill();
      c.fillStyle = rgb(1.0);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.3, -w * 1.05, len * 0.78, -w * 0.8, len, 0); c.closePath(); c.fill();
      c.strokeStyle = rgb(1.18); c.lineWidth = Math.max(1, len * 0.045);
      c.beginPath(); c.moveTo(len * 0.04, 0); c.lineTo(len * 0.86, 0); c.stroke();
      c.restore();
    }
  };
  const layer = (count: number, lo: number, hi: number, scale: number) => {
    for (let i = 0; i < count; i++) {
      const x = r.next() * size, y = r.next() * size, leaves = r.int(4, 6), turn = r.next() * Math.PI * 2;
      const v = lo + r.next() * (hi - lo), warm = r.next() < 0.25 ? 1 : r.next() < 0.3 ? -0.6 : 0;
      for (let k = 0; k < leaves; k++) {
        const a = turn + k / leaves * Math.PI * 2 + r.range(-0.25, 0.25), len = r.range(0.28, 0.4) * px * scale;
        leaf(x + Math.cos(a) * len * 0.08, y + Math.sin(a) * len * 0.08, a, len, v * r.range(0.9, 1.08), warm);
      }
    }
  };
  layer(150, 55, 95, 1.05); layer(130, 105, 160, 1); layer(110, 165, 235, 0.95);
  // the mean (linear) of what was drawn, to keep the canopy's overall tone
  const data = c.getImageData(0, 0, size, size).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 16) { const v = data[i + 1] / 255; sum += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 8;
  t.colorSpace = SRGBColorSpace;
  t.userData.norm = 0.75 / Math.max(0.05, sum / (data.length / 16));
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
    // the roof's leaves (normalised to the canopy's mean tone): held out to a few hundred metres, where the mips
    // have long since merged them into the crowns' own texture
    if (fadeMap) {
      const norm = (mat.map?.userData.norm as number | undefined ?? 1.55).toFixed(3);
      fs = fs.replace('#include <map_fragment>', `#ifdef USE_MAP\nvec4 sampledDiffuseColor = texture2D(map, vMapUv);\ndiffuseColor.rgb *= mix(sampledDiffuseColor.rgb * ${norm}, vec3(0.75), smoothstep(250.0, 600.0, vHaze));\n#endif`);
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `manko-land-v2-${key}`;
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

/** The background forest's edge: three rows of mangroves (as impostors of the tree models) wherever the forest
 * meets the open water or mud beyond the rows of real trees — across the lake, along its shores, round the
 * terrain's edge — so no edge of the far forest is a bare wall of canopy. */
export function edgeImpostorSites(): ImpostorSite[] {
  const out: ImpostorSite[] = [], r = new Rng(0x1ed9e), inner = HALF - 6, step = 3.6;
  for (let z = -700; z <= 700; z += step) for (let x = -700; x <= 700; x += step) {
    const px = x + r.range(-1.4, 1.4), pz = z + r.range(-1.4, 1.4);
    if (Math.abs(px) < inner && Math.abs(pz) < inner) continue;   // the tree models' rows
    if (Math.hypot(px, pz) > 700) continue;
    const depth = forestDepth(px, pz);
    if (depth < 0.8 || depth > 12.5 || centreClear(px, pz) > 0 || roadClear(px, pz) > 0) continue;
    const scale = r.range(0.62, 0.92) * r.range(0.86, 1.14) * (1 + depth * 0.012);
    out.push({ x: px, y: groundAt(px, pz), z: pz, scale, base: r.int(0, 4) as HirugiBase, yaw: r.range(0, Math.PI * 2) });
  }
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
/** A raised strip (3 faces) along a-b: the white mortar (漆喰) on an Okinawan roof's ridge and hips. Drawn in the
 * walls' mesh at UV (0, 0), the facade texture's plain white, so it shows exactly its vertex colour. */
function strip(buf: Buf, a: number[], b: number[], width: number, height: number, colour: number[]): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, sx = -dz / l * width / 2, sz = dx / l * width / 2;
  const up = (p: number[], k: number) => [p[0] + sx * k, p[1] + height, p[2] + sz * k];
  const lo = (p: number[], k: number) => [p[0] + sx * k, p[1], p[2] + sz * k];
  quad(buf, up(a, 1), up(b, 1), up(a, -1), up(b, -1), colour);
  quad(buf, lo(b, -1), lo(a, -1), up(b, -1), up(a, -1), colour);
  quad(buf, lo(a, 1), lo(b, 1), up(a, 1), up(b, 1), colour);
}
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
  // (wound to face down: seen from under the eave)
  quad(walls, S(a, b), S(-a, b), S(W, D), S(-W, D), soffit);
  quad(walls, S(-a, -b), S(a, -b), S(-W, -D), S(W, -D), soffit);
  quad(walls, S(-a, b), S(-a, -b), S(-W, D), S(-W, -D), soffit);
  quad(walls, S(a, -b), S(a, b), S(W, -D), S(W, D), soffit);
  const F = (u: number, v: number, y: number) => P(u, y, v);
  for (const [p, q] of [[[-a, b], [a, b]], [[a, -b], [-a, -b]], [[-a, -b], [-a, b]], [[a, b], [a, -b]]])
    quad(walls, F(p[0], p[1], yEave - 0.28), F(q[0], q[1], yEave - 0.28), F(p[0], p[1], yEave), F(q[0], q[1], yEave), fascia);
  const white = [0.86, 0.84, 0.8];
  strip(walls, R0, R1, 0.5, 0.18, white);
  for (const [e, r] of [[E0, R0], [E3, R0], [E1, R1], [E2, R1]]) strip(walls, e, r, 0.4, 0.14, white);
}
/** A rooftop water tank on a stand (stainless or FRP), a fixture of Okinawan flat roofs. */
function tank(buf: Buf, x: number, y: number, z: number, r: number, h: number, colour: number[]): void {
  const n = 6, ring = (yy: number) => Array.from({ length: n }, (_, k) => [x + Math.cos(k / n * Math.PI * 2) * r, yy, z + Math.sin(k / n * Math.PI * 2) * r]);
  const lo = ring(y + 0.5), hi = ring(y + 0.5 + h);
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; quad(buf, lo[j], lo[k], hi[j], hi[k], colour); }
  for (let k = 1; k < n - 1; k++) quad(buf, hi[0], hi[k + 1], hi[k], hi[k], colour);
}

/** Original Okinawan clay-tile texture: 2.4 m × 2.4 m, 8 columns of flat tiles under round cover tiles set in white
 * mortar, 8 courses; tint jitter and faint mould. */
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

// ------------------------------------------------------------------ the bridge
/**
 * The road bridge across the lake to the north (after the concrete girder bridges over 国場川; not a copy of one): a
 * continuous box-girder deck with cantilevered slabs, concrete parapets and a steel handrail, on twin-column piers
 * with hammerhead caps every ~42 m over the water, street lights along it. Long approach viaducts carry the road
 * down to the land on both sides, into a cutting through the forest to the west and between the blocks to the east,
 * so from the basin it runs out of sight into the trees and the town, never ends in the air.
 */
export const BRIDGE = { z: -330, x0: -150, x1: 600, half: 6.5 };
/** The deck's top (road surface) along the bridge: on the ground at the ends, rising at ~4% to ~9 m over the lake. */
export function deckTop(x: number): number {
  const ground = groundAt(x, BRIDGE.z) + 0.45;
  const crest = 8.6 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 96) / 334)));
  const rise = smooth(-100, 104, x) * (1 - smooth(436, 590, x));
  return ground + (Math.max(crest, ground) - ground) * rise;
}
/** 1 in the approach roads' cutting through the forest (and the town), 0 elsewhere. */
function roadClear(x: number, z: number): number {
  if (x < BRIDGE.x0 - 20 || x > BRIDGE.x1 + 20) return 0;
  return smooth(BRIDGE.half + 7, BRIDGE.half + 3, Math.abs(z - BRIDGE.z));
}
function bridge(buf: Buf): void {
  const z0 = BRIDGE.z, H = BRIDGE.half, step = 5, r = new Rng(0xb71d6e);
  const concrete = [0.68, 0.68, 0.66], fascia = [0.78, 0.78, 0.76], shade = [0.3, 0.3, 0.3], soffit = [0.36, 0.36, 0.35];
  const asphalt = [0.16, 0.16, 0.17], walk = [0.5, 0.5, 0.48], rail = [0.55, 0.58, 0.6], joint = [0.12, 0.12, 0.12];
  const slab = 0.38, girder = 2.1, web0 = 3.7, web1 = 3.1, parapet = 0.95;
  /** a quad facing +z (facing 1) or -z (facing -1), between x a..b, bottoms ya, yb and tops ta, tb, at the signed
   * offset u from the axis (its top at u2: a sloping face) */
  const side = (facing: number, xa: number, xb: number, u: number, ya: number, yb: number, ta: number, tb: number, col: number[], u2 = u) => {
    const z = z0 + u, z2 = z0 + u2;
    if (facing > 0) quad(buf, [xa, ya, z], [xb, yb, z], [xa, ta, z2], [xb, tb, z2], col);
    else quad(buf, [xb, yb, z], [xa, ya, z], [xb, tb, z2], [xa, ta, z2], col);
  };
  /** a horizontal-ish strip (facing up, or down when `down`) across u0..u1 (signed, toward +z), between x a..b */
  const flat = (xa: number, xb: number, ya: number, yb: number, u0: number, u1: number, col: number[], down = false) => {
    if (!down) quad(buf, [xa, ya, z0 + u1], [xb, yb, z0 + u1], [xa, ya, z0 + u0], [xb, yb, z0 + u0], col);
    else quad(buf, [xa, ya, z0 + u0], [xb, yb, z0 + u0], [xa, ya, z0 + u1], [xb, yb, z0 + u1], col);
  };
  const weather = new Map<number, number>();
  for (let xa = BRIDGE.x0; xa < BRIDGE.x1; xa += step) {
    const xb = xa + step, ya = deckTop(xa), yb = deckTop(xb), ga = groundAt(xa, z0), gb = groundAt(xb, z0);
    // each span's concrete weathers a little differently
    const span = Math.floor((xa + 400) / 42), w = weather.get(span) ?? (weather.set(span, 0.92 + 0.12 * r.next()), weather.get(span)!);
    const tint = (c: number[]) => c.map((v) => v * w);
    // the road, its kerbs and footways
    flat(xa, xb, ya, yb, -H + 1.3, H - 1.3, asphalt);
    for (const sgn of [-1, 1]) {
      const u0 = sgn > 0 ? H - 1.3 : -H + 0.3, u1 = sgn > 0 ? H - 0.3 : -H + 1.3;
      flat(xa, xb, ya + 0.18, yb + 0.18, u0, u1, walk);
      side(-sgn, xa, xb, sgn * (H - 1.3), ya, yb, ya + 0.18, yb + 0.18, walk);   // the kerb, facing the road
      // the parapet: inner face, top, and the outer face running down over the slab's edge (the fascia)
      side(-sgn, xa, xb, sgn * (H - 0.3), ya + 0.18, yb + 0.18, ya + parapet, yb + parapet, tint(concrete));
      flat(xa, xb, ya + parapet, yb + parapet, sgn > 0 ? H - 0.3 : -H, sgn > 0 ? H : -H + 0.3, tint(fascia));
      side(sgn, xa, xb, sgn * H, ya - slab, yb - slab, ya + parapet, yb + parapet, tint(fascia));
      // the handrail over it on its posts (seen at distance as a fine line above the parapet)
      side(sgn, xa, xb, sgn * (H - 0.12), ya + parapet + 0.22, yb + parapet + 0.22, ya + parapet + 0.3, yb + parapet + 0.3, rail);
      side(-sgn, xa, xb, sgn * (H - 0.2), ya + parapet + 0.22, yb + parapet + 0.22, ya + parapet + 0.3, yb + parapet + 0.3, rail);
      for (let k = 0; k < 2; k++) {
        const px = xa + k * step / 2 + 0.2;
        side(sgn, px, px + 0.08, sgn * (H - 0.12), ya + parapet, ya + parapet, ya + parapet + 0.3, ya + parapet + 0.3, rail);
      }
      const clear = Math.min(ya - ga, yb - gb);
      if (clear > girder + 0.8) {
        // the cantilever's soffit in shadow, then the box girder's sloping web and its bottom
        flat(xa, xb, ya - slab, yb - slab, sgn > 0 ? web0 : -H, sgn > 0 ? H : -web0, soffit, true);
        side(sgn, xa, xb, sgn * web1, ya - girder, yb - girder, ya - slab, yb - slab, tint(shade.map((v, i) => v + 0.18 * concrete[i])), sgn * web0);
      } else {
        // on the embankment: a retaining wall down to the ground
        side(sgn, xa, xb, sgn * H, Math.min(ga, ya - slab) - 0.3, Math.min(gb, yb - slab) - 0.3, ya - slab, yb - slab, tint(concrete.map((v) => v * 0.85)));
      }
    }
    if (Math.min(ya - ga, yb - gb) > girder + 0.8) flat(xa, xb, ya - girder, yb - girder, -web1, web1, shade, true);
  }
  // piers: twin round columns under a hammerhead cap, a dark tide band at their feet over the water; on the land
  // approaches, closer and plainer
  const piers: number[] = [];
  for (let x = 118; x <= 428; x += 44.5) piers.push(x);
  for (let x = 86; x > BRIDGE.x0; x -= 34) piers.push(x);
  for (let x = 462; x < BRIDGE.x1; x += 34) piers.push(x);
  for (const x of piers) {
    const top = deckTop(x), under = top - girder, g = groundAt(x, z0);
    if (under - g < 1.6) continue;
    const capH = 1.3, cap = under - capH, wet = lakeOpenAt(x) ? 1 : 0;
    // the cap: wider at the top (a hammerhead), on two columns
    boxAt(buf, x, z0, 0, 1.0, 4.6, capH, cap, concrete, 1, 1, true);
    for (const u of [-2.5, 2.5]) {
      const n = 8, rad = 0.75, ring = (y: number) => Array.from({ length: n }, (_, k) => [x + Math.cos(k / n * Math.PI * 2) * rad, y, z0 + u + Math.sin(k / n * Math.PI * 2) * rad]);
      const bands = wet ? [[g - 0.2, 0.9, [0.26, 0.27, 0.25]], [0.9, cap, concrete]] as const : [[g - 0.2, cap, concrete]] as const;
      for (const [y0, y1, col] of bands) {
        const lo = ring(y0), hi = ring(y1);
        for (let k = 0; k < n; k++) { const j = (k + 1) % n; quad(buf, lo[j], lo[k], hi[j], hi[k], col as number[]); }
      }
    }
    // the deck's expansion joint over the pier: a dark seam across the fascia
    for (const sgn of [-1, 1]) side(sgn, x - 0.06, x + 0.06, sgn * (H + 0.01), top - slab, top - slab, top + parapet, top + parapet, joint);
  }
  // street lights, alternating sides every 36 m along the raised deck
  for (let x = 40, k = 0; x < 560; x += 36, k++) {
    const sgn = k % 2 ? 1 : -1, top = deckTop(x) + 0.18, u = (H - 0.55) * sgn;
    boxAt(buf, x, z0 + u, 0, 0.09, 0.09, 9, top, rail, 1, 1, true);
    boxAt(buf, x, z0 + u - sgn * 0.9, 0, 0.06, 0.95, 0.12, top + 8.9, rail, 1, 1, true);
    boxAt(buf, x, z0 + u - sgn * 1.75, 0, 0.18, 0.32, 0.14, top + 8.8, [0.85, 0.85, 0.8], 1, 1, true);
  }
}
const lakeOpenAt = (x: number) => groundAt(x, BRIDGE.z) < -0.6;

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
    // (the bridge's road runs between the blocks)
    const clear = (zz: number, dd: number) => Math.abs(zz - BRIDGE.z) > dd + BRIDGE.half + 4;
    const col = palette[Math.floor(rnd() * palette.length)];
    if (clear(z, d)) block(x, z, w, d, floors, col);
    if (rnd() < 0.5) { const x2 = x + 40 + rnd() * 60, f2 = 9 + Math.floor(rnd() * 8), w2 = 10 + rnd() * 10, c2 = palette[Math.floor(rnd() * palette.length)]; if (clear(z + 10, 8)) block(x2, z + 10, w2, 8, f2, c2); }
  }
  bridge(out);
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
