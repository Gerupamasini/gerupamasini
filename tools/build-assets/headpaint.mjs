// Head texture atlas (M_Head): spec-driven procedural painter (albedo / normal / ORM + mouth lining).  Node only, deterministic per seed.
//
// Atlas UV (fixed contract): u = (s + cap) / (sEnd + cap), v = alpha / 2PI; texel (x, y) of a W x H image has u = x/(W-1), v = y/(H-1).
//   s = body position along SL (0 = snout tip, < 0 = snout cap), alpha = angle round the body axis (0 dorsal midline, PI/2 right flank, PI ventral, 3PI/2 left flank).
//
// Everything is derived from `surface` (geometry), `head` (chord coordinates, relief) and `spec` (assets/src/head_adult.json): no landmark is hard-coded.
// Pipeline
//   A  coarse grid (every ~2 texels): surface point / normal, chord coords (u, v), height fraction t, distance fields to the spec features, relief
//      (head.displacement with fine = true and fine = false: the residual is what the loft mesh cannot carry -> normal map), low-frequency noise fields
//   B  per texel: colour (linear albedo), roughness, metalness, painted AO, micro relief; discrete features (spots, pores) are splatted beforehand
//   C  normal map from the relief (physical mm per texel taken from the grid), cavity AO from the fine relief
//   D  seam: cross-fade of every map into the body atlas at the rear of the head so there is no colour / normal jump at s = sEnd
//   bakeHeadIntoBody: down-sampled copy of the head atlas into the body atlas (lower LODs only use the body atlas)
// Colours are specified as photo-like sRGB (docs/yamame/photo_analysis/head_color_markings.json) and converted to linear albedo with LOOK.gain.
import { mulberry32 } from './textures.mjs';
import { polyV, sdPolygon } from './head.mjs';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bell = (x, c, w) => { const q = (x - c) / w; return q > 2.7 || q < -2.7 ? 0 : Math.exp(-q * q); };

// ------------------------------------------------------------------------------------------------------------------
// bilinear sample of an RGBA8 atlas image at (u, v) in [0,1]^2 (v wraps) -- same convention as the textures module
export function sampleAtlas(img, u, v, out = [0, 0, 0, 0]) {
  const { width: W, height: H, data } = img;
  const x = Math.min(Math.max(u, 0), 1) * (W - 1); let y = (((v % 1) + 1) % 1) * (H - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * W + x0) * 4 + c], b = data[(y0 * W + x1) * 4 + c], d = data[(y1 * W + x0) * 4 + c], e = data[(y1 * W + x1) * 4 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------
// noise (3-D lattice on the physical surface position: seamless across the dorsal midline, independent on the two flanks)
function h3(ix, iy, iz, sd) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ sd) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) * 2.3283064365386963e-10;
}
function vn3(x, y, z, sd) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = h3(ix, iy, iz, sd), b = h3(ix + 1, iy, iz, sd), c = h3(ix, iy + 1, iz, sd), d = h3(ix + 1, iy + 1, iz, sd);
  const e = h3(ix, iy, iz + 1, sd), f = h3(ix + 1, iy, iz + 1, sd), g = h3(ix, iy + 1, iz + 1, sd), k = h3(ix + 1, iy + 1, iz + 1, sd);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (k - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
function fbm3(x, y, z, sd, oct = 3) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vn3(x * f, y * f, z * f, sd + i * 7919); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const seedOf = (seed, tag) => (hashStr(tag) ^ Math.imul((Math.floor(seed) | 0) + 0x632be5ab, 0x9e3779b1)) | 0;
const rngOf = (seed, tag) => mulberry32(seedOf(seed, tag) >>> 0);
function gaussR(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng()); }

/** hex lattice of scale cells in a plane: returns the distance to the nearest (jittered) cell centre in pitch units and its x offset (cell-local, +x = towards the tail) */
const LAT = { d: 0, ox: 0, oy: 0, id: 0 };
function scaleCell(x, y, pitch, sd, jit = 0.18) {
  const q = x / pitch, r = y / (pitch * 0.8660254), j0 = Math.round(r);
  let best = 1e9, bx = 0, by = 0, bid = 0;
  for (let jj = j0 - 1; jj <= j0 + 1; jj++) {
    const off = (jj & 1) * 0.5, i = Math.round(q - off);
    for (let ii = i - 1; ii <= i + 1; ii++) {
      const hx = h3(ii, jj, 0, sd), hy = h3(ii, jj, 1, sd);
      const cx = ii + off + (hx - 0.5) * jit * 2, cy = (jj + (hy - 0.5) * jit * 2) * 0.8660254;
      const dx = q - cx, dy = r * 0.8660254 - cy, d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = dx; by = dy; bid = hx; }
    }
  }
  LAT.d = Math.sqrt(best); LAT.ox = bx; LAT.oy = by; LAT.id = bid;
  return LAT;
}

/** sparse round dots on a 3-D lattice (cell and radius in the units of x, y, z): coverage 0..1 of the dot the point falls in (dots never straddle cells) */
function dots3(x, y, z, cell, rad, dens, sd) {
  const gx = x / cell, gy = y / cell, gz = z / cell, ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
  if (h3(ix, iy, iz, sd) > dens) return 0;
  const r = (rad / cell) * (0.55 + 0.9 * h3(ix, iy, iz, sd + 11)), j = 1 - 2 * r;
  const cx = ix + r + j * h3(ix, iy, iz, sd + 3), cy = iy + r + j * h3(ix, iy, iz, sd + 5), cz = iz + r + j * h3(ix, iy, iz, sd + 7);
  const d = Math.hypot(gx - cx, gy - cy, gz - cz);
  return d >= r ? 0 : 1 - sstep(r * 0.45, r, d);
}

// ------------------------------------------------------------------------------------------------------------------
// colour
const decS = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const encS = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const SRGB_DEC = new Float32Array(256); for (let i = 0; i < 256; i++) SRGB_DEC[i] = decS(i / 255);
const SRGB_ENC = new Uint8Array(4096); for (let i = 0; i < 4096; i++) SRGB_ENC[i] = Math.round(clamp01(encS(i / 4095)) * 255);
const toByte = (v) => SRGB_ENC[(clamp01(v) * 4095 + 0.5) | 0];
const lin3 = (r, g, b) => Float64Array.of(decS(r / 255), decS(g / 255), decS(b / 255));

/** Look-development constants: photo-like sRGB colours of the painted regions (adult, non-spawning, dark-ish olive-bronze).  See head_color_markings.md. */
/** material settings the painter was calibrated with (KHR clearcoat / iridescence on M_Head); written to params.render.head unless the caller already set them */
export const RENDER_HEAD = { clearcoat: 0.2, clearcoat_roughness: 0.22, iridescence: 0.2 };

export const LOOK = {
  gain: 0.42,                 // photo appearance -> linear albedo (photos include light and highlights); calibrated against renders of the viewer still
  capFrac: 0.255,            // dorsal cap: lower border at this fraction of the head height (cheek column); photos 15-25 %
  snoutFrac: 0.30,           // ... and over the snout / lore (down to about nostril level)
  capRagged: 0.06, capEdge: 0.065,
  palette: {
    capDark: [64, 50, 30], capMid: [94, 76, 46], capLight: [128, 108, 70], fleck: [184, 150, 94], snout: [112, 102, 84], band: [150, 124, 82], smudge: [110, 98, 104],
    cheekBronze: [160, 132, 88], cheekPearl: [180, 158, 134], cheekLilac: [168, 146, 154], cheekGreen: [140, 138, 96], cheekGold: [192, 160, 96], cheekBlue: [138, 152, 172], cheekPink: [206, 158, 150],
    opercle: [158, 142, 120], opercleLilac: [174, 164, 168], rimGold: [200, 168, 104], copper: [186, 128, 84], preLine: [226, 210, 190],
    jaw: [190, 186, 186], throat: [230, 226, 226], ventral: [214, 208, 198], bran: [214, 210, 208],
    strap: [150, 128, 112], strapLight: [186, 166, 154], groove: [60, 44, 32], gape: [26, 17, 35], lip: [196, 188, 208],
    nostril: [38, 32, 28], nostrilRim: [126, 124, 128], orbit: [88, 74, 52], orbitDark: [52, 42, 30], smear: [84, 52, 50], spot: [30, 24, 18], poreDark: [46, 38, 34], porePale: [222, 214, 206], pinkFlush: [214, 168, 172],
  },
};
const PAL0 = {}; for (const [k, c] of Object.entries(LOOK.palette)) PAL0[k] = lin3(c[0], c[1], c[2]);
// vertical gradient of the pale field in height fraction t = 0.2 .. 0.95 (bronze -> pearl-warm -> silver-cream -> white)
const GRAD = [lin3(144, 120, 88), lin3(158, 136, 108), lin3(172, 150, 124), lin3(190, 174, 156), lin3(216, 210, 202)];
const GRAD_SILVER = [lin3(166, 154, 142), lin3(180, 170, 162), lin3(194, 188, 184), lin3(208, 204, 202), lin3(222, 218, 214)];

// ------------------------------------------------------------------------------------------------------------------
// geometry helpers on the spec
function polyUofV(m, v) {     // u at height v of a polyline given top -> bottom with v decreasing (same as head.mjs)
  if (v >= m[0][1]) return m[0][0];
  for (let i = 1; i < m.length; i++) if (v >= m[i][1]) { const t = (v - m[i - 1][1]) / (m[i][1] - m[i - 1][1] || -1e-9); return lerp(m[i - 1][0], m[i][0], t); }
  return m[m.length - 1][0];
}

/** Chaikin corner cutting (open polylines keep their end points); the painter follows smoothed copies of the spec polylines so the paint has no polyline corners */
function chaikin(pts, iters = 3, closed = false) {
  let P = pts.map((q) => [q[0], q[1]]);
  for (let it = 0; it < iters; it++) {
    const Q = [], n = P.length;
    if (!closed) Q.push(P[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = P[i], b = P[(i + 1) % n];
      Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!closed) Q.push(P[n - 1]);
    P = Q;
  }
  return P;
}

/** distance from (u, v) to a polyline (no allocation) */
function polyDist(pts, u, v) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay, l2 = dx * dx + dy * dy || 1e-12;
    const t = clamp(((u - ax) * dx + (v - ay) * dy) / l2, 0, 1), d = (u - ax - dx * t) ** 2 + (v - ay - dy * t) ** 2; if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function makeLook(seed, over = {}) {
  const r = rngOf(seed, 'headlook');
  const L = {
    capFrac: LOOK.capFrac + 0.10 * (r() - 0.5), snoutFrac: LOOK.snoutFrac, capRagged: LOOK.capRagged, capEdge: LOOK.capEdge, reliefGain: 0.4, reliefGainOp: 0.2, metalScale: 0.8, chroma: 1.0,
    nSpots: 22 + Math.floor(r() * 16),            // small head / nape spots (0.5-1.5 mm), plus 2-4 larger smudges
    smear: (() => { const q = rngOf(seed, 'maroon'); return q() < 0.64 ? 0.6 + 0.4 * q() : 0.08; })(),   // soft maroon-brown post-orbital patch behind the eye (about 60 % of fish; p050 p033 p027)
    warm: 0.45 + 0.55 * r(),                      // copper / salmon flush on the upper rear opercle
    hueBias: r() * 2 - 1,                         // gold <-> lilac balance of the pearly cheek
    silver: r() < 0.3 ? 0.5 + 0.5 * r() : 0.15 + 0.2 * r(),   // 0 = bronze-olive adult .. 1 = silvery lilac-white (p002, p015, p017, p021); default ~0.3
    gain: LOOK.gain,
  };
  let env = {}; try { if (process.env.HEADPAINT_LOOK) env = JSON.parse(process.env.HEADPAINT_LOOK); } catch { /* dev switch only */ }
  return Object.assign(L, over, env);
}

/** rows of the coarse grid -> row of the full-res image (bilinear, v wraps by construction: node row Hc-1 duplicates row 0) */
function makeUpsampler(W, H, Wc, Hc) {
  const ix = new Int32Array(W), fx = new Float32Array(W), jy = new Int32Array(H), fy = new Float32Array(H);
  for (let x = 0; x < W; x++) { const g = (x / (W - 1)) * (Wc - 1); let i = Math.floor(g); if (i >= Wc - 1) i = Wc - 2; ix[x] = i; fx[x] = g - i; }
  for (let y = 0; y < H; y++) { const g = (y / (H - 1)) * (Hc - 1); let j = Math.floor(g); if (j >= Hc - 2) j = Hc - 2; jy[y] = j; fy[y] = g - j; }
  return {
    ix, fx, jy, fy,
    row(F, y, out) {
      const o0 = jy[y] * Wc, o1 = o0 + Wc, f = fy[y], g = 1 - f;
      for (let x = 0; x < W; x++) { const i = ix[x], q = fx[x]; const a = F[o0 + i], b = F[o0 + i + 1], c = F[o1 + i], d = F[o1 + i + 1]; out[x] = (a + (b - a) * q) * g + (c + (d - c) * q) * f; }
      return out;
    },
  };
}

function blurWrap(F, Wc, Hc, rx, ry) {   // separable box blur on a coarse grid (rows wrap with period Hc-1, columns clamp)
  const T = new Float32Array(F.length), O = new Float32Array(F.length), n = 2 * rx + 1;
  for (let j = 0; j < Hc; j++) {
    let acc = 0; const o = j * Wc;
    for (let k = -rx; k <= rx; k++) acc += F[o + clamp(k, 0, Wc - 1)];
    for (let i = 0; i < Wc; i++) { T[o + i] = acc / n; acc += F[o + Math.min(i + rx + 1, Wc - 1)] - F[o + Math.max(i - rx, 0)]; }
  }
  const P = Hc - 1, m = 2 * ry + 1;
  const wrap = (j) => { j %= P; return j < 0 ? j + P : j; };
  for (let i = 0; i < Wc; i++) {
    let acc = 0; for (let k = -ry; k <= ry; k++) acc += T[wrap(k) * Wc + i];
    for (let j = 0; j < P; j++) { O[j * Wc + i] = acc / m; acc += T[wrap(j + ry + 1) * Wc + i] - T[wrap(j - ry) * Wc + i]; }
    O[P * Wc + i] = O[i];
  }
  return O;
}

// ------------------------------------------------------------------------------------------------------------------
export function generateHeadTextures({ surface, params, head, spec, seed = 1, bodyTex = null, sEnd = 0.27, width = 1536, height = 2048, look = {}, debug = false }) {
  const T0 = Date.now(), timing = {};
  const tick = (k) => { timing[k] = Date.now() - T0; };
  const L = makeLook(seed, look);
  const orbRGB = spec.eye?.orbit_rgb || params?.eye?.orbit_rgb?.v || LOOK.palette.orbit;                       // colour strip of the eye module's orbit ring: the skin around it blends with it
  const PAL = { ...PAL0, orbit: lin3(orbRGB[0], orbRGB[1], orbRGB[2]), orbitDark: lin3(orbRGB[0] * 0.58, orbRGB[1] * 0.56, orbRGB[2] * 0.56) };
  if (params && !params.render?.head) params.render = { ...(params.render || {}), head: { ...RENDER_HEAD } };       // picked up by write-glb (params.render.head)
  const devScale = Number(process.env.HEADPAINT_SCALE) || 1;                          // dev switch: 0.5 = quarter the texels (fast look-dev builds)
  const W = Math.max(64, Math.round(width * devScale)), H = Math.max(64, Math.round(height * devScale)), N = W * H;
  const SL = surface.SL, cap = surface.cap, HLs = spec.HL_over_SL, HLm = head.HLm, SLmm = SL * 1000, HLmm = HLm * 1000;
  const sSpan = sEnd + cap;
  const eyeSpec = spec.eye || null;
  const eyeDmm = eyeSpec ? eyeSpec.d_over_hl * HLmm : 10;
  const Ro_mm = eyeDmm / 2;

  // eye centres as the loft computes them (surface points at the eye ring)
  let eyeC = null, eyeRo = 0.5 * (params.eye?.outer_d_over_sl?.v ?? 0.056) * SL;
  if (eyeSpec) {
    const [ex, ey] = head.fromUV(eyeSpec.u, eyeSpec.v); const sE = surface.xToS(ex); const aR = surface.alphaAtHeight(sE, ey);
    eyeC = [surface.point(sE, aR), surface.point(sE, TAU - aR)];
  }

  // ---------------------------------------------------------------- A. coarse grid
  const CF = 2;
  const Wc = Math.ceil((W - 1) / CF) + 1, Hc = Math.ceil((H - 1) / CF) + 1, NC = Wc * Hc;
  const nodeS = (i) => (i / (Wc - 1)) * sSpan - cap;
  const F = {}; for (const k of ['u', 'v', 't', 'px', 'py', 'pz', 'nx', 'ny', 'nz', 'Hg', 'Hf', 'mmX', 'mmY', 'ddm', 'sdMax', 'sdDen', 'gDv', 'gU', 'preDu', 'preS', 'opDu', 'opIn', 'eR', 'eA', 'n1', 'n2', 'th', 'vent', 'ao', 'sut', 'opZone']) F[k] = new Float32Array(NC);
  // positions
  const secC = new Float64Array(Wc), secH = new Float64Array(Wc), capSc = new Float64Array(Wc);
  for (let i = 0; i < Wc; i++) {
    const s = nodeS(i); const sec = surface.section(Math.max(s, 0)); secC[i] = sec.c; secH[i] = sec.h;
    capSc[i] = s < 0 ? Math.sqrt(Math.max(1 - (s / cap) ** 2, 0.0025)) : 1;
  }
  for (let j = 0; j < Hc; j++) {
    const alpha = (TAU * j) / (Hc - 1);
    for (let i = 0; i < Wc; i++) {
      const p = surface.point(nodeS(i), alpha); const k = j * Wc + i;
      F.px[k] = p[0] * 1000; F.py[k] = p[1] * 1000; F.pz[k] = p[2] * 1000;
      const yRef = nodeS(i) < 0 ? surface.point(0, alpha)[1] : p[1];                           // snout cap: height fraction of the ring just behind it (the cap itself degenerates to a point)
      F.t[k] = clamp(0.5 - (yRef / SL - secC[i]) / (2 * secH[i]), 0, 1);
    }
  }
  tick('points');
  // normals (central differences on the grid; outward = away from the section centre line)
  const half = (Hc - 1) / 2;
  for (let j = 0; j < Hc; j++) {
    const jm = j === 0 ? Hc - 2 : j - 1, jp = j === Hc - 1 ? 1 : j + 1;
    for (let i = 0; i < Wc; i++) {
      const im = Math.max(i - 1, 0), ip = Math.min(i + 1, Wc - 1), k = j * Wc + i;
      const ax = F.px[j * Wc + ip] - F.px[j * Wc + im], ay = F.py[j * Wc + ip] - F.py[j * Wc + im], az = F.pz[j * Wc + ip] - F.pz[j * Wc + im];
      const bx = F.px[jp * Wc + i] - F.px[jm * Wc + i], by = F.py[jp * Wc + i] - F.py[jm * Wc + i], bz = F.pz[jp * Wc + i] - F.pz[jm * Wc + i];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const cy = 0.5 * (F.py[i] + F.py[Math.round(half) * Wc + i]);          // section centre height (dorsal + ventral midline points)
      if (nx * 0 + ny * (F.py[k] - cy) + nz * F.pz[k] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      F.nx[k] = nx; F.ny[k] = ny; F.nz[k] = nz;
      const nodesPerTexelX = (Wc - 1) / (W - 1), nodesPerTexelY = (Hc - 1) / (H - 1);
      F.mmX[k] = Math.max(Math.hypot(ax, ay, az) / (ip - im || 1) * nodesPerTexelX, 0.004);
      F.mmY[k] = Math.max(Math.hypot(bx, by, bz) / 2 * nodesPerTexelY, 0.004);
    }
  }
  tick('normals');
  // arc length from the dorsal midline (mm), symmetric: right flank 0..C/2, left flank C/2..0
  for (let i = 0; i < Wc; i++) {
    let acc = 0; F.ddm[i] = 0; const arc = new Float32Array(Hc);
    for (let j = 1; j < Hc; j++) { const k = j * Wc + i, k0 = k - Wc; acc += Math.hypot(F.py[k] - F.py[k0], F.pz[k] - F.pz[k0]); arc[j] = acc; }
    for (let j = 0; j < Hc; j++) F.ddm[j * Wc + i] = Math.min(arc[j], acc - arc[j]);
  }
  // semantic fields + relief
  // smoothed copies of the spec polylines: the paint follows these (no polyline corners); the relief (head.mjs) keeps the raw ones
  const sm = (pts, n, closed) => (pts ? chaikin(pts, n, closed) : null);
  const sutP = sm(spec.dentary?.suture, 2), lineRaw = spec.mouth?.line || null, line = sm(lineRaw, 2), corner = spec.mouth?.corner || (lineRaw ? lineRaw[lineRaw.length - 1] : null);
  const maxP = sm(spec.maxilla?.outline, 3, true), denP = sm(spec.dentary?.outline, 3, true), preL = sm(spec.preopercle?.line, 3), opM = sm(spec.opercle?.margin, 3), nos = spec.nostrils, bran = spec.branchiostegal;
  const vTopO = opM ? opM[0][1] : 0, vBotO = opM ? opM[opM.length - 1][1] : 0, vTopP = preL ? preL[0][1] : 0, vBotP = preL ? preL[preL.length - 1][1] : 0;
  const smoothH = (a, b, x) => sstep(a, b, x);
  const ctx = { p: [0, 0, 0], n: [0, 0, 0], eyeCenters: eyeC, eyeRo, fine: false };
  const ctxF = { p: ctx.p, n: ctx.n, eyeCenters: eyeC, eyeRo, fine: true };
  let haveFine = false;
  for (let j = 0; j < Hc; j++) {
    const alpha = (TAU * j) / (Hc - 1);
    for (let i = 0; i < Wc; i++) {
      const k = j * Wc + i; const s = nodeS(i);
      const px = F.px[k] / 1000, py = F.py[k] / 1000, pz = F.pz[k] / 1000;
      const [u, v] = head.toUV(px, py); F.u[k] = u; F.v[k] = v;
      ctx.p[0] = px; ctx.p[1] = py; ctx.p[2] = pz; ctx.n[0] = F.nx[k]; ctx.n[1] = F.ny[k]; ctx.n[2] = F.nz[k];
      F.Hf[k] = head.displacement(s, alpha, ctxF) * 1e6;
      if (maxP) F.sdMax[k] = sdPolygon(maxP, u, v);
      if (denP) F.sdDen[k] = sdPolygon(denP, u, v);
      F.sut[k] = sutP ? polyDist(sutP, u, v) : 9;
      if (line) { F.gDv[k] = v - polyV(line, clamp(u, line[0][0], line[line.length - 1][0])); F.gU[k] = u - corner[0]; }
      if (preL) F.preDu[k] = u - polyUofV(preL, clamp(v, vBotP, vTopP));
      if (opM) {
        F.opDu[k] = u - polyUofV(opM, clamp(v, vBotO, vTopO)); F.opIn[k] = smoothH(vBotO - 0.03, vBotO + 0.02, v) * smoothH(vTopO + 0.03, vTopO - 0.02, v);
        F.opZone[k] = F.opIn[k] * (preL ? sstep(-0.04, -0.01, F.preDu[k]) : 1) * (1 - sstep(0.02, 0.05, F.opDu[k]));          // gill-cover zone: gentler relief / cavity AO there
      }
      if (eyeC) {
        let best = 1e9; for (const c of eyeC) { const d = Math.hypot(px - c[0], py - c[1], pz - c[2]); if (d < best) best = d; }
        F.eR[k] = best / eyeRo; F.eA[k] = Math.atan2(v - eyeSpec.v, u - eyeSpec.u);
      } else F.eR[k] = 9;
      if (nos?.anterior) F.n1[k] = Math.hypot((u - nos.anterior[0]) * HLmm, (v - nos.anterior[1]) * HLmm);
      if (nos?.posterior) F.n2[k] = Math.hypot((u - nos.posterior[0]) * HLmm / 1.5, (v - nos.posterior[1]) * HLmm);
      if (bran) { const du = u - bran.apex_u; F.th[k] = Math.atan2(Math.abs(pz) / HLm, du); F.vent[k] = sstep(0.35, 0.85, -F.ny[k]); }
    }
  }
  // the geometry (band-limited) displacement is smooth over >= 1.4 mm: evaluate it on every 3rd node and interpolate
  {
    const ST = 3, nsx = Math.ceil((Wc - 1) / ST) + 1, nsy = Math.ceil((Hc - 1) / ST) + 1, G = new Float32Array(nsx * nsy);
    for (let gj = 0; gj < nsy; gj++) {
      const j = Math.min(gj * ST, Hc - 1), alpha = (TAU * j) / (Hc - 1);
      for (let gi = 0; gi < nsx; gi++) {
        const i = Math.min(gi * ST, Wc - 1), k = j * Wc + i;
        ctx.p[0] = F.px[k] / 1000; ctx.p[1] = F.py[k] / 1000; ctx.p[2] = F.pz[k] / 1000; ctx.n[0] = F.nx[k]; ctx.n[1] = F.ny[k]; ctx.n[2] = F.nz[k];
        const dg = head.displacement(nodeS(i), alpha, ctx) * 1e6; G[gj * nsx + gi] = dg;
        if (Math.abs(dg - F.Hf[k]) > 1e-6) haveFine = true;                 // head.mjs honours `fine` (band-limited geometry vs full-detail relief)
      }
    }
    for (let j = 0; j < Hc; j++) {
      const gy = Math.min(j / ST, nsy - 1), gj0 = Math.min(Math.floor(gy), nsy - 2), fy = gy - gj0;
      for (let i = 0; i < Wc; i++) {
        const gx = Math.min(i / ST, nsx - 1), gi0 = Math.min(Math.floor(gx), nsx - 2), fx = gx - gi0, o = gj0 * nsx + gi0;
        F.Hg[j * Wc + i] = (G[o] * (1 - fx) + G[o + 1] * fx) * (1 - fy) + (G[o + nsx] * (1 - fx) + G[o + nsx + 1] * fx) * fy;
      }
    }
  }
  tick('semantic');
  // relief residual that the loft cannot carry -> normal map.  Old head.mjs without the `fine` flag: high-pass of the full displacement instead.
  const Hres = new Float32Array(NC);
  if (haveFine) for (let k = 0; k < NC; k++) Hres[k] = F.Hf[k] - F.Hg[k];
  else { const lp = blurWrap(F.Hf, Wc, Hc, 10, 10); for (let k = 0; k < NC; k++) Hres[k] = F.Hf[k] - lp[k]; }
  // cavity AO from the fine relief at two scales
  {
    const b1 = blurWrap(F.Hf, Wc, Hc, 3, 3), b2 = blurWrap(F.Hf, Wc, Hc, 12, 12);
    for (let k = 0; k < NC; k++) {
      const c1 = clamp01((b1[k] - F.Hf[k]) / 70), c2 = clamp01((b2[k] - F.Hf[k]) / 260);
      F.ao[k] = (1 - 0.5 * c1) * (1 - 0.45 * c2);
    }
  }
  tick('relief');
  // low-frequency design noise (coarse): blotches, mottling, hue fields, cap-border wobble
  const sd = (t) => seedOf(seed, t);
  const sdN1 = sd('n1'), sdN2 = sd('n2'), sdN3 = sd('n3'), sdBnd = sd('bnd'), sdHue = sd('hue'), sdHue2 = sd('hue2'), sdWarm = sd('warm');
  const Nz = {}; for (const k of ['n1', 'n2', 'n3', 'bnd', 'hue', 'hue2', 'warm']) Nz[k] = new Float32Array(NC);
  for (let k = 0; k < NC; k++) {
    const x = F.px[k], y = F.py[k], z = F.pz[k];
    Nz.n1[k] = fbm3(x / 7.0, y / 7.0, z / 7.0, sdN1, 3);
    Nz.n2[k] = fbm3(x / 2.6, y / 2.6, z / 2.6, sdN2, 3);
    Nz.n3[k] = fbm3(x / 0.9, y / 0.9, z / 0.9, sdN3, 2);
    Nz.bnd[k] = fbm3(x / 2.3, y / 6.0, z / 2.3, sdBnd, 3);
    Nz.hue[k] = fbm3(x / 6.5, y / 6.5, z / 6.5, sdHue, 3);
    Nz.hue2[k] = fbm3(x / 2.2, y / 3.2, z / 2.2, sdHue2, 3);
    Nz.warm[k] = fbm3(x / 3.0, y / 3.0, z / 3.0, sdWarm, 2);
  }
  tick('noise');

  // ---------------------------------------------------------------- discrete features
  const toTexel = (u, v, side) => {            // chord coords + side -> fractional texel (x, y); null if off the head
    const s = u * HLs - cap; if (s > sEnd) return null;
    const [, yM] = head.fromUV(u, v); let a = surface.alphaAtHeight(Math.max(s, 0), yM); if (side < 0) a = TAU - a;
    return [(s + cap) / sSpan * (W - 1), (a / TAU) * (H - 1)];
  };
  const nodeAt = (x, y) => { const gi = clamp(Math.round(x / (W - 1) * (Wc - 1)), 0, Wc - 1), gj = clamp(Math.round(y / (H - 1) * (Hc - 1)), 0, Hc - 1); return gj * Wc + gi; };
  const maskSpot = new Float32Array(N), maskPoreD = new Float32Array(N), maskPoreP = new Float32Array(N), pitH = new Float32Array(N);
  const splat = (cx, cy, rmm, fn) => {                    // call fn(idx, rho) for texels within ~rho<=1.6 of an elliptical (physical circle) footprint
    const k = nodeAt(cx, cy); const rx = rmm * 1.7 / F.mmX[k], ry = rmm * 1.7 / F.mmY[k];
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      let yy = y; const per = H - 1; yy = ((yy % per) + per) % per;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) * F.mmX[k], dy = (y - cy) * F.mmY[k]; fn(yy * W + x, Math.hypot(dx, dy) / rmm, dx, dy);
      }
    }
  };
  const feat = { spots: [], pores: 0 };
  // dorsal head spots: area-uniform on the dark cap, bigger and denser towards the nape, none at the snout tip.  Photos: 0.5-1.5 mm irregular spots (0.03-0.13 eye diameters),
  // plus a few larger soft smudges (up to ~0.25) -- not round black discs
  {
    const rng = rngOf(seed, 'spots'); const cand = []; let tot = 0;
    for (let j = 1; j < Hc - 1; j += 2) for (let i = 0; i < Wc; i += 2) {
      const k = j * Wc + i, u = F.u[k]; if (u < 0.12 || u > 0.97) continue;
      const tb = lerp(L.snoutFrac, L.capFrac, sstep(0.05, 0.30, u)); if (F.t[k] > Math.max(tb, L.capFrac) * 0.95) continue;
      const w = F.mmX[k] * F.mmY[k] * (0.25 + 1.3 * sstep(0.1, 0.9, u)); tot += w; cand.push([k, tot]);
    }
    const pick = () => { const r = rng() * tot; let lo = 0, hi = cand.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cand[m][1] < r) lo = m + 1; else hi = m; } const k = cand[lo][0], gi = k % Wc, gj = (k / Wc) | 0; return { k, cx: (gi + rng() * 2 - 1) / (Wc - 1) * (W - 1), cy: (gj + rng() * 2 - 1) / (Hc - 1) * (H - 1) }; };
    const nBig = cand.length ? 2 + Math.floor(rng() * 3) : 0;
    for (let n = 0; n < L.nSpots + nBig && cand.length; n++) {
      const big = n >= L.nSpots, q = pick(), u = F.u[q.k];
      let f = big ? 0.15 + 0.10 * rng() : Math.exp(gaussR(rng) * 0.38) * (0.058 + 0.05 * sstep(0.15, 0.95, u));      // diameter / eye diameter
      f = clamp(f, 0.03, big ? 0.27 : 0.17); const dia = f * eyeDmm, el = 1 + 0.45 * rng(), rot = rng() * Math.PI;
      feat.spots.push({ cx: q.cx, cy: q.cy, dia, el, rot, ph: rng() * TAU, amp: big ? 0.08 + 0.06 * rng() : 0.12 + 0.12 * rng(), soft: big ? 0.4 : 0.14 + 0.14 * rng(), op: big ? 0.55 + 0.25 * rng() : 0.85 + 0.15 * rng() });
    }
    for (const sp of feat.spots) {
      const r = sp.dia / 2, ca = Math.cos(sp.rot), sa = Math.sin(sp.rot);
      splat(sp.cx, sp.cy, r * 1.6, (idx, rho, dx, dy) => {
        const X = (dx * ca + dy * sa) / sp.el, Y = -dx * sa + dy * ca, d = Math.hypot(X, Y), ang = Math.atan2(Y, X);
        const rr = r * (1 + sp.amp * (0.7 * Math.sin(2 * ang + sp.ph) + 0.35 * Math.sin(3 * ang + 2 * sp.ph) + 0.12 * Math.sin(5 * ang + 1.7 * sp.ph)));
        const m = (1 - sstep(rr * (1 - sp.soft), rr * (1 + sp.soft), d)) * sp.op; if (m > maskSpot[idx]) maskSpot[idx] = m;
      });
    }
  }
  // sensory-canal pores: mandibular row (lower jaw), preopercle row, supraorbital / snout row, infraorbital arc
  {
    const rng = rngOf(seed, 'pores'); const pts = [];
    const addP = (u, v) => { for (const side of [1, -1]) { const t = toTexel(u, v, side); if (t) pts.push({ x: t[0] + 0.0, y: t[1], r: 0.06 + 0.03 * rng(), pale: 0.14 + 0.05 * rng() }); } };
    if (line) for (let n = 0; n < 5; n++) { const u = 0.07 + n * 0.075 + (rng() - 0.5) * 0.02; const vL = polyV(line, clamp(u, 0, corner[0])); addP(u, vL - 0.062 - 0.012 * n + (rng() - 0.5) * 0.008); }
    if (preL) for (let n = 0; n < 6; n++) { const q = 0.08 + n * 0.16 + (rng() - 0.5) * 0.04; const idx = q * (preL.length - 1), i0 = Math.min(Math.floor(idx), preL.length - 2), f = idx - i0; addP(lerp(preL[i0][0], preL[i0 + 1][0], f) - 0.028, lerp(preL[i0][1], preL[i0 + 1][1], f)); }
    if (nos?.anterior) for (let n = 0; n < 4; n++) addP(nos.anterior[0] - 0.05 + n * 0.075 + (rng() - 0.5) * 0.015, nos.anterior[1] + 0.06 + 0.012 * n + (rng() - 0.5) * 0.01);
    if (eyeSpec) for (let n = 0; n < 5; n++) { const a = (-0.2 + n * 0.45) * Math.PI + Math.PI * 0.55; const rr = eyeSpec.d_over_hl * 0.5 * 1.45; addP(eyeSpec.u + rr * Math.cos(a), eyeSpec.v + rr * Math.sin(a) - 0.0); }
    feat.pores = pts.length;
    for (const p of pts) splat(p.x, p.y, 0.30, (idx, rho, dx, dy) => {
      const d = Math.hypot(dx, dy);
      const dark = 1 - sstep(p.r * 0.7, p.r * 1.25, d), pale = bell(d, p.r * 2.1, p.r * 0.9) * (1 - dark);
      if (dark > maskPoreD[idx]) maskPoreD[idx] = dark; if (pale > maskPoreP[idx]) maskPoreP[idx] = pale; pitH[idx] -= 26 * (1 - sstep(0, p.r * 1.6, d));
    });
  }
  tick('features');

  // ---------------------------------------------------------------- B. paint rows
  const albedo = new Uint8Array(N * 4), ormB = new Uint8Array(N * 4);
  const microH = new Float32Array(N), reliefR = new Float32Array(N);
  const up = makeUpsampler(W, H, Wc, Hc);
  const rowKeys = ['u', 'v', 't', 'px', 'py', 'pz', 'nz', 'sdMax', 'sdDen', 'gDv', 'preDu', 'opDu', 'opIn', 'eR', 'eA', 'n1', 'n2', 'th', 'vent', 'ddm', 'sut', 'opZone'];
  const R = {}; for (const k of rowKeys) R[k] = new Float32Array(W);
  const RN = {}; for (const k of Object.keys(Nz)) RN[k] = new Float32Array(W);
  const Rres = new Float32Array(W);
  const sdG = sd('grain'), sdG2 = sd('grain2'), sdSp = sd('speck'), sdIr1 = sd('iri1'), sdIr2 = sd('iri2'), sdSc = sd('scales'), sdSc2 = sd('scales2'), sdFl = sd('fleck'), sdRg = sd('rough'), sdRg2 = sd('rough2'), sdNet = sd('net'), sdCu = sd('copper'), sdTub = sd('tub');
  const capLo = PAL.capDark, capMi = PAL.capMid, capHi = PAL.capLight;
  const sil = clamp01(L.silver), gradL = GRAD.map((g, i) => g.map((v, c) => lerp(v, GRAD_SILVER[i][c], sil)));
  // hinge of the opercle (radial striations fan out from it): between the top of the preopercle line and the top of the free margin
  const hinge = (preL && opM) ? [0.5 * (preL[0][0] + opM[0][0]), 0.5 * (preL[0][1] + opM[0][1])] : [0.77, 0.11];
  const stats = { cap: [], snout: [], cheek: [], opercle: [], rim: [], jaw: [], strap: [], gape: [], throat: [], nostril: [], orbit: [], band: [], spot: [] };
  const statStep = Math.max(1, Math.floor(N / 260000));
  let nSamp = 0; const capBins = new Float64Array(50), capCnt = new Float64Array(50), snBins = new Float64Array(50), snCnt = new Float64Array(50);                // coverage: dark-cap share of the head height at the cheek column
  let cr = 0, cg = 0, cb = 0;
  const mixTo = (c, w) => { cr += (c[0] - cr) * w; cg += (c[1] - cg) * w; cb += (c[2] - cb) * w; };
  const mul = (f) => { cr *= f; cg *= f; cb *= f; };
  // cross-fade into the body atlas: right behind the free margin of the gill cover on the flank (the body lattice then starts there), s-based above / below it
  const sA1 = sEnd - 0.044, sA2 = sEnd - 0.014, sB2 = sEnd - 0.008;           // s-based fade (nape, belly) 0.226 .. 0.256; the head atlas equals the body atlas from sB2 on
  const bw = new Float32Array(N);                                              // per-texel weight of the body atlas
  const xc = Math.round(cap / sSpan * (W - 1));                                // first atlas column at s >= 0 (columns before it are the snout cap)
  const bodyTmp = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (const k of rowKeys) up.row(F[k], y, R[k]);
    for (const k of Object.keys(Nz)) up.row(Nz[k], y, RN[k]);
    up.row(Hres, y, Rres);
    const vTex = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const idx = y * W + x, o4 = idx * 4;
      const u = R.u[x], v = R.v[x], t = R.t[x], anz = Math.abs(R.nz[x]);
      const px = R.px[x], py = R.py[x], pz = R.pz[x];
      const lat = sstep(0.28, 0.72, anz);
      const n1 = RN.n1[x], n2 = RN.n2[x], n3 = RN.n3[x], nb = RN.bnd[x], nh = RN.hue[x], nh2 = RN.hue2[x];
      let rough = 0.4, metal = 0.1, aoP = 1, micro = 0;
      // ---- dorsal cap / snout / pale field -------------------------------------------------------------------
      const uS = sstep(0.05, 0.30, u);                                                    // 0 at the snout .. 1 behind the eye
      const tb = lerp(L.snoutFrac, L.capFrac, uS);                                        // lower border of the dark cap (fraction of the local head height)
      const bOff = (nb - 0.5) * 2 * L.capRagged * (0.6 + 0.8 * n3);
      const wB = L.capEdge * (0.6 + 0.9 * n3);
      const pale = sstep(tb + bOff - wB, tb + bOff + wB, t);
      const capW = 1 - pale;
      const vent = sstep(0.60, 0.95, t), snW = (1 - uS) * sstep(0.06, 0.40, t);
      const bandW = bell(t, tb + bOff + 0.07, 0.07) * (1 - vent) * sstep(0.2, 0.45, u);
      const nape = sstep(0.22, 0.55, u), wLil = sstep(0.36, 0.88, nh2 * 0.45 + nh * 0.55) * 0.6;
      cr = cg = cb = 0;
      if (capW > 0.004) {
        // olive-brown melanophore mottling, lighter bronze patches, lighter grey-olive on the snout, scale lattice on the nape, copper flecks
        const mott = sstep(0.25, 0.8, n2 * 0.6 + n1 * 0.4);
        cr = lerp(capLo[0], capMi[0], mott); cg = lerp(capLo[1], capMi[1], mott); cb = lerp(capLo[2], capMi[2], mott);
        const lw = sstep(0.55, 0.85, n1 * 0.5 + n3 * 0.5) * 0.5; cr += (capHi[0] - cr) * lw; cg += (capHi[1] - cg) * lw; cb += (capHi[2] - cb) * lw;
        mixTo(PAL.snout, (1 - uS) * 0.75);                                                // snout and lore: the grey-tan of the cheek, not the cap's brown
        mul(0.80 + 0.20 * sstep(0.0, 0.16, t));                                           // a little darker along the dorsal ridge
        if (capW > 0.02 && nape > 0) {
          const c = scaleCell(px, R.ddm[x], 1.25, sdSc, 0.26);
          const edge = sstep(0.28, 0.52, c.d) * (0.55 + 0.45 * sstep(0.1, -0.25, c.ox));
          mul(1 + capW * nape * (0.20 * (c.id - 0.5) + 0.26 * edge * (0.5 + n2) - 0.06));
          const fl = (1 - sstep(0.06, 0.15, c.d)) * (c.id > 0.62 ? 1 : 0) * capW * nape * sstep(0.25, 0.65, n2 + 0.25 * (n1 - 0.5)); mixTo(PAL.fleck, fl * 0.5);        // copper fleck in the centre of some scales
          micro += capW * nape * 5 * edge;
        }
      }
      // pale field: bronze -> pearl -> silver-cream -> white with large soft pearly hue patches (gold, lilac, olive, blue-silver, pink)
      if (pale > 0.004) {
        let pr, pg, pb;
        { const tt = clamp01((t - 0.2) / 0.75), k = tt * 4, i0 = Math.min(Math.floor(k), 3), f = k - i0, A = gradL[i0], B = gradL[i0 + 1];
          pr = lerp(A[0], B[0], f); pg = lerp(A[1], B[1], f); pb = lerp(A[2], B[2], f); }
        const wGold = sstep(0.34, 0.92, n1 * 0.6 + nh * 0.4 + 0.1 * L.hueBias) * 0.42 * (1 - 0.65 * sil), wGrn = sstep(0.36, 0.92, n2 * 0.3 + nh * 0.35 + n1 * 0.35) * 0.26 * (1 - 0.5 * sil), wBlue = sstep(0.36, 0.92, nh2 * 0.3 + n1 * 0.7) * 0.5 * sstep(0.4, 0.8, t);
        const wPink = sstep(0.36, 0.92, nh * 0.5 + (1 - n1) * 0.5) * 0.55 * sstep(0.3, 0.55, t) * (1 - sstep(0.85, 0.98, t));
        pr += (PAL.cheekGold[0] - pr) * wGold; pg += (PAL.cheekGold[1] - pg) * wGold; pb += (PAL.cheekGold[2] - pb) * wGold;
        pr += (PAL.cheekLilac[0] - pr) * wLil; pg += (PAL.cheekLilac[1] - pg) * wLil; pb += (PAL.cheekLilac[2] - pb) * wLil;
        pr += (PAL.cheekGreen[0] - pr) * wGrn; pg += (PAL.cheekGreen[1] - pg) * wGrn; pb += (PAL.cheekGreen[2] - pb) * wGrn;
        pr += (PAL.cheekBlue[0] - pr) * wBlue; pg += (PAL.cheekBlue[1] - pg) * wBlue; pb += (PAL.cheekBlue[2] - pb) * wBlue;
        pr += (PAL.cheekPink[0] - pr) * wPink; pg += (PAL.cheekPink[1] - pg) * wPink; pb += (PAL.cheekPink[2] - pb) * wPink;
        const lumP = 0.93 + 0.14 * n1 + 0.06 * (n2 - 0.5); pr *= lumP; pg *= lumP; pb *= lumP;
        pr = lerp(pr, PAL.throat[0], vent); pg = lerp(pg, PAL.throat[1], vent); pb = lerp(pb, PAL.throat[2], vent);
        const bw = bandW * 0.55 * (1 - 0.5 * sil); pr = lerp(pr, PAL.band[0], bw); pg = lerp(pg, PAL.band[1], bw); pb = lerp(pb, PAL.band[2], bw);
        cr += (pr - cr) * pale; cg += (pg - cg) * pale; cb += (pb - cb) * pale;
      }
      const bR = cr, bG = cg, bB = cb;                                                  // underlying (smooth) colour, used to converge to the body colour behind the gill cover
      const paleS = sstep(tb - 0.06, tb + 0.14, t + 0.05 * (nb - 0.5));                // gloss / metal change smoothly across the cap border (no ragged-edged highlight shapes)
      const metalS = sstep(tb + 0.05, tb + 0.32, t + 0.05 * (nb - 0.5));               // metallic reflectance would follow the ragged albedo border (F0 = albedo x metal): keep it ~0 there
      rough = lerp(0.62, 0.27, paleS); metal = lerp(0.03, 0.26, metalS);
      // cheek: scale rows (1.1 mm pitch, irregular, patchy), faint but visible; gold flecks sit on the lattice
      const cheekM = pale * lat * (1 - vent) * sstep(0.34, 0.5, u) * (1 - sstep(0.80, 0.9, u)) * sstep(0.22, 0.55, n2 * 0.5 + n1 * 0.5 + 0.18);
      let sc = null;
      if (cheekM > 0.02) {
        sc = scaleCell(px + 0.18 * (n3 - 0.5), py + 0.18 * (n2 - 0.5), 1.1, sdSc2, 0.3);
        const c = sc, edge = sstep(0.28, 0.52, c.d), rimL = edge * (0.5 + 0.5 * sstep(0.05, -0.25, c.ox));
        mul(1 + cheekM * (0.09 * (c.id - 0.5) + 0.12 * rimL - 0.04 * edge * sstep(-0.05, 0.25, c.ox)));
        micro += cheekM * 7 * rimL;
        const fk = (1 - sstep(0.07, 0.17, c.d)) * (c.id > 0.55 ? 1 : 0) * (1 - sstep(0.30, 0.6, t)) * (0.5 + n1); mixTo(PAL.fleck, fk * cheekM * 0.4);        // copper-gold fleck in the centre of some scales (upper cheek)
      }
      // upper cheek / opercle: reticulate melanophore network (olive-brown, soft) fading out towards the silver below
      { const rw = pale * lat * (1 - vent) * (1 - sstep(0.40, 0.70, t)) * sstep(0.34, 0.5, u) * (0.5 + n1);
        if (rw > 0.02) {
          const c = scaleCell(px + 0.5 * (n2 - 0.5), py + 0.5 * (n3 - 0.5), 1.05, sdNet, 0.45), net = sstep(0.22, 0.62, c.d) * (0.6 + 0.8 * n3);
          mul(1 - 0.09 * rw * net * (0.5 + 0.5 * c.id));
        } }
      // ---- maxilla strap: soft blend strap -> lip -> jaw (no flat polygon colour) ------------------------------------------------
      let strapW = 0, jawW = 0;
      if (maxP) {
        strapW = sstep(-0.010, 0.012, R.sdMax[x]) * lat;
        if (strapW > 0) {
          const kk = (1 - sstep(0.0, 0.06, R.gDv[x])) * 0.85;                           // lighter towards the gape (inner edge)
          const sr = lerp(PAL.strap[0], PAL.strapLight[0], kk), sg = lerp(PAL.strap[1], PAL.strapLight[1], kk), sb = lerp(PAL.strap[2], PAL.strapLight[2], kk);
          const m = strapW * (0.85 + 0.15 * n2), nn = 0.93 + 0.14 * n3; cr += (sr * nn - cr) * m; cg += (sg * nn - cg) * m; cb += (sb * nn - cb) * m;
          rough = lerp(rough, 0.38, strapW); metal = lerp(metal, 0.06, strapW);
        }
        const gv = bell(R.sdMax[x], 0.0, 0.0045) * lat * sstep(0.02, 0.1, u) * (1 - sstep(0.40, 0.46, u)) * (1 - strapW * 0.4);      // thin dark groove along the upper border of the strap
        mixTo(PAL.groove, gv * 0.7); aoP *= 1 - 0.3 * gv;
      }
      // ---- dentary / lower jaw ------------------------------------------------------------------------------------------------
      if (denP) {
        jawW = sstep(-0.010, 0.012, R.sdDen[x]) * Math.max(lat, 1 - sstep(0.0, 0.05, u)) * (1 - strapW);        // (the chin tip faces forward: lat -> 0 there, but it keeps the jaw colour)
        if (jawW > 0) {
          const nn = 0.95 + 0.1 * n2, mx = 0.22 * wLil;
          const jr = lerp(PAL.jaw[0], PAL.cheekLilac[0], mx) * nn, jg = lerp(PAL.jaw[1], PAL.cheekLilac[1], mx) * nn, jb = lerp(PAL.jaw[2], PAL.cheekLilac[2], mx) * nn;
          cr += (jr - cr) * jawW; cg += (jg - cg) * jawW; cb += (jb - cb) * jawW;
          rough = lerp(rough, 0.25, jawW); metal = lerp(metal, 0.28, jawW);
          const su = R.sut[x]; if (su < 0.03) { const sl = bell(su, 0, 0.005) * jawW; mul(1 - 0.06 * sl); aoP *= 1 - 0.12 * sl; }      // faint suture between dentary and angular
          const tub = dots3(px, py, pz, 0.30, 0.07, 0.30, sdTub) * jawW * (1 - sstep(0.30, 0.42, u)); mixTo(PAL.porePale, tub * 0.28);
        }
      }
      // ---- gape line, lips ---------------------------------------------------------------------------------------
      let gapeW = 0;
      if (line) {
        const fadeEnd = 1 - sstep(corner[0] - 0.01, corner[0] + 0.03, u), gv = R.gDv[x];
        const tipF = sstep(0.02, 0.08, u), lipUp = bell(gv, 0.013, 0.008) * 0.5 * fadeEnd * lat * tipF, lipLo = bell(gv, -0.014, 0.009) * 0.6 * fadeEnd * lat * tipF;
        mixTo(PAL.lip, lipUp + lipLo); rough = lerp(rough, 0.3, clamp01(lipUp + lipLo)); metal = lerp(metal, 0.0, clamp01(lipUp + lipLo));
        gapeW = bell(gv, 0.0, 0.0042) * fadeEnd * (1 - 0.3 * (1 - lat));
        mixTo(PAL.gape, Math.min(1, gapeW * 1.25)); aoP *= 1 - 0.85 * gapeW; metal *= 1 - gapeW; rough = lerp(rough, 0.8, gapeW);       // near-black violet, non-specular
      }
      // ---- opercle, preopercle: one faint curved line and a smooth, domed, translucent plate with a soft thin rear edge ---------
      let opW = 0, rimW = 0, opZone = 0;
      if (opM) {
        const du = R.opDu[x], inside = R.opIn[x];
        const front = preL ? sstep(-0.022, 0.022, R.preDu[x]) : 1;                       // wide feather: the colour change follows the dome, not the preopercle polyline
        opW = front * (1 - sstep(-0.034, 0.004, du)) * inside * lat;
        opZone = R.opZone[x];
        if (opW > 0) {
          const op = sstep(0.4, 0.7, nh2 * 0.6 + nh * 0.4);
          const orr = lerp(PAL.opercle[0], PAL.opercleLilac[0], op * 0.6), og = lerp(PAL.opercle[1], PAL.opercleLilac[1], op * 0.6), ob = lerp(PAL.opercle[2], PAL.opercleLilac[2], op * 0.6);
          const nn = (0.96 + 0.08 * n3) * (1 + 0.06 * sstep(-0.12, -0.01, du)), m = opW * 0.6; cr += (orr * nn - cr) * m; cg += (og * nn - cg) * m; cb += (ob * nn - cb) * m;
          rough = lerp(rough, 0.3, opW); metal = lerp(metal, 0.3, opW); aoP *= 1 - 0.18 * opW;       // (AO < 1 also tames clearcoat glints on the dome)
          // striations of the bone: rays from the hinge + concentric growth lines; faint melanophore smudges on the upper plate
          const dh = u - hinge[0], vh = v - hinge[1], rho = Math.hypot(dh, vh), th = Math.atan2(vh, dh);
          const ray = Math.sin(th * 80 + 9 * (nh2 - 0.5) + 14 * (n3 - 0.5)), grow = Math.sin(rho * (TAU / 0.0125) + 9 * (nh - 0.5));
          const sw = opW * sstep(0.04, 0.12, rho);
          mul(1 + sw * (0.016 * ray + 0.01 * grow) * (0.4 + 1.2 * n2)); micro += sw * (2.5 * ray + 1.5 * grow);
          const smud = sstep(0.62, 0.84, n2 * 0.5 + nh2 * 0.5) * (1 - sstep(0.25, 0.7, t)); mixTo(PAL.smudge, 0.22 * smud * opW);
        }
        rimW = bell(du, -0.004, 0.0065) * inside * lat * (preL ? sstep(-0.01, 0.02, R.preDu[x]) : 1);       // soft, thin rear edge
        mixTo(PAL.rimGold, rimW * 0.22); metal = lerp(metal, 0.46, rimW * 0.6); rough = lerp(rough, 0.26, rimW);
        const gapB = bell(du, 0.008, 0.0065) * inside * lat;                                                // shadow under the free edge: the body tucks under
        mul(1 - 0.10 * gapB); aoP *= 1 - 0.3 * gapB;
        const fl = bell(du, -0.05, 0.05) * sstep(0.02, 0.08, v) * sstep(0.2, 0.9, RN.warm[x]) * inside * lat * L.warm;       // warm copper / salmon flush on the upper rear opercle
        mixTo(PAL.copper, fl * 0.3);
      }
      if (preL) {
        const pd = R.preDu[x], topF = 1 - sstep(vTopP - 0.012, vTopP + 0.04, v), botF = sstep(vBotP - 0.03, vBotP + 0.02, v);        // the line ends where the polyline ends (no continuation over the cap)
        const pl = bell(pd, 0.0, 0.0034) * lat * topF * botF * (1 - sstep(0.80, 0.90, u));
        mixTo(PAL.preLine, pl * 0.13); metal = lerp(metal, 0.45, pl * 0.3);
        mul(1 - 0.10 * bell(pd, -0.008, 0.006) * lat * topF * botF);
      }
      // ---- nostrils -----------------------------------------------------------------------------------------------------
      let nosW = 0;
      if (nos?.anterior) {
        const r1 = R.n1[x], R0 = nos.radius_mm ?? 0.85;
        const pit = 1 - sstep(R0 * 0.5, R0 * 0.95, r1), rim = bell(r1, R0 * 1.35, R0 * 0.4) * (1 - pit);
        mixTo(PAL.nostrilRim, rim * 0.45 * lat); mixTo(PAL.nostril, pit * 0.95); nosW = pit; aoP *= 1 - 0.7 * pit;
      }
      if (nos?.posterior) {
        const r2 = R.n2[x], R0 = (nos.radius_mm ?? 0.85) * 0.8;
        const pit = 1 - sstep(R0 * 0.45, R0 * 0.9, r2); mixTo(PAL.nostril, pit * 0.9); nosW = Math.max(nosW, pit); aoP *= 1 - 0.6 * pit;
      }
      // ---- orbit: thin dark rim, olive skin ring (darker up front / behind, silvery below), soft post-orbital smear -----------------------
      let orbW = 0;
      if (eyeC) {
        const er = R.eR[x], ea = R.eA[x];
        const ang = clamp(0.22 + 0.55 * Math.cos(ea - 2.3) + 0.35 * Math.cos(ea - 0.15), 0.08, 1);       // upper front and rear arcs; lowest below
        const rimD = bell(er, 1.18, 0.11) * 0.45, ring = bell(er, 1.5, 0.35) * ang * 0.45 * (1 - sstep(1.9, 2.3, er));
        mixTo(PAL.orbitDark, rimD * lat + rimD * (1 - lat) * 0.5); mixTo(PAL.orbit, ring * lat);
        orbW = clamp01(rimD + ring); aoP *= (1 - 0.22 * (1 - sstep(1.0, 1.7, er))) * (1 - 0.15 * clamp01(orbW));
        if (L.smear > 0 && eyeSpec) {                                                     // soft maroon-brown patch just behind the eye on the upper cheek, ~0.5-0.9 eye diameters wide, with darker blotches inside
          const dE = eyeSpec.d_over_hl, a1 = (u - (eyeSpec.u + 0.95 * dE)) / (0.50 * dE), a2 = (v - (eyeSpec.v + 0.03 * dE)) / (0.42 * dE);
          const smr = Math.exp(-(a1 * a1 + a2 * a2)) * L.smear * lat * (0.55 + 0.9 * sstep(0.35, 0.7, n2 * 0.6 + nh2 * 0.4));
          mixTo(PAL.smear, clamp01(smr) * 0.9); aoP *= 1 - 0.1 * clamp01(smr);
        }
      }
      // ---- branchiostegal membrane: ~10-12 faint rays, mainly near the isthmus / gill-cover front, on a pearly-white throat ---------------
      if (bran) {
        const vt = R.vent[x];
        if (vt > 0) {
          const w = sstep(0.38, 0.55, u) * sstep(bran.end_u ?? 1, (bran.end_u ?? 1) - 0.12, u) * vt * sstep(0.04, 0.22, R.th[x]);
          const ridge = 0.5 + 0.5 * Math.cos((R.th[x] / (bran.pitch ?? 0.07)) * TAU);
          mixTo(PAL.bran, w * 0.35); mixTo(PAL.pinkFlush, w * 0.14 * (0.4 + 0.6 * n1)); mul(1 - 0.03 * w * (1 - ridge) * (0.5 + n3));
        }
      }
      // ---- dark head spots and pores --------------------------------------------------------------------------------------
      const sp = maskSpot[idx]; if (sp > 0) { mixTo(PAL.spot, sp * 0.92); rough = lerp(rough, 0.6, sp); metal *= 1 - sp; aoP *= 1 - 0.5 * sp; }   // AO also cuts the env-reflection veil, so black pigment stays black
      const pd = maskPoreD[idx], pp = maskPoreP[idx];
      if (pd > 0 || pp > 0) { mixTo(PAL.porePale, pp * 0.14); mixTo(PAL.poreDark, pd * 0.7); aoP *= 1 - 0.4 * pd; }
      // snout tip (the pole of the atlas): the cap texels (s < 0) are overwritten with the s = 0 ring of the same row (see below), so the tip has the snout's / jaw's own colour and no
      // gloss, speck or disc of its own; here only the gloss is taken out of the ring that gets copied
      { const tipW = 1 - sstep(0.0, 0.06, u); if (tipW > 0) { rough = lerp(rough, 0.6, tipW); metal *= 1 - tipW; aoP *= 1 - 0.55 * tipW; } }          // low AO also takes the clearcoat environment reflection out of the pole region
      // ---- fine structure ------------------------------------------------------------------------------------------------------
      const g1 = vn3(px / 0.16, py / 0.16, pz / 0.16, sdG) - 0.5, g2 = vn3(px / 0.07, py / 0.07, pz / 0.07, sdG2) - 0.5;
      const spk = dots3(px, py, pz, 0.16, 0.05, 0.6, sdSp) * 0.9;          // melanophore speckle: dense on the cap, thin on the pale field
      const drip = 1 - sstep(0.0, 0.14, t - (tb + bOff));
      mul(1 - spk * (0.34 * capW + (0.20 + 0.30 * drip) * pale * (1 - vent * 0.6)));
      // clustered mid-size melanophore flecks (0.1-0.25 mm) and mid-scale tonal mottling of the pale skin
      { const cl = sstep(0.45, 0.7, n2 * 0.6 + n3 * 0.4), fk = dots3(px, py, pz, 0.30, 0.085, 0.45, sdSp + 77) * cl; mul(1 - 0.26 * fk * (pale * (1 - vent * 0.5) + 0.3 * capW));
        mul(1 + 0.10 * (n3 - 0.5) * pale + 0.05 * (n2 - 0.5)); }
      const pearlM = clamp01(pale * (1 - vent * 0.4) + opW * 0.6);                        // iridophore glitter: low-amplitude pink / lilac / green hue shifts
      const i1 = vn3(px / 0.2, py / 0.2, pz / 0.2, sdIr1) - 0.5, i2 = vn3(px / 0.33, py / 0.33, pz / 0.33, sdIr2) - 0.5;
      cr *= 1 + pearlM * (0.16 * i1 + 0.10 * i2); cg *= 1 + pearlM * (-0.06 * i1 - 0.10 * i2); cb *= 1 + pearlM * (-0.18 * i1 + 0.12 * i2);
      mul(1 + 0.07 * g1 + 0.04 * g2);
      micro += 3.2 * g1 + 1.8 * g2 + pitH[idx];
      // ---- roughness variation (water-film streaks along the body axis) -----------------------------------------------------------------
      const streak = vn3(px / 3.2, py / 0.9, pz / 0.9, sdRg) - 0.5, st2 = vn3(px / 0.5, py / 0.5, pz / 0.5, sdRg2) - 0.5;
      rough += 0.07 * streak + 0.03 * st2 - 0.04 * sil; metal *= (0.9 + 0.3 * i1) * L.metalScale * (1 + 0.5 * sil);
      // ---- cross-fade into the body atlas at the rear of the head -----------------------------------------------------------------------
      const s = (x / (W - 1)) * sSpan - cap;
      { const Y = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb, k = 1 + L.chroma * (0.25 * pearlM + 0.1 * capW * (1 - pearlM)); cr = Y + (cr - Y) * k; cg = Y + (cg - Y) * k; cb = Math.max(0, Y + (cb - Y) * k); }   // chroma boost: the studio render (veil + ACES) desaturates
      const photoEq = [cr, cg, cb];
      cr *= L.gain; cg *= L.gain; cb *= L.gain;
      let wBody = sstep(sA1, sA2, s), conv = sstep(sA1 - 0.035, sA1 + 0.01, s);
      if (opM) {
        const io = R.opIn[x], wOp = io * sstep(0.004, 0.05, R.opDu[x]), cOp = io * sstep(-0.10, 0.015, R.opDu[x]);
        wBody = Math.max(wBody, wOp); conv = Math.max(conv, cOp);                         // max(): no horizontal step where the gill-cover span ends
      }
      wBody = Math.max(wBody, sstep(sB2 - 0.007, sB2, s)); bw[idx] = bodyTex ? wBody : 0;
      const swr = 1 - bw[idx];
      if (bodyTex && (swr < 1 || conv > 0.01)) {
        // (1) converge the level / hue of the head colour to the body colour just behind the gill cover (detail is kept), (2) cross-fade to the body atlas (lattice, parr marks) behind it
        const dsM = opM ? -R.opDu[x] * HLs : 0, sRef = clamp((opM && R.opIn[x] > 0.5 ? s + dsM : s) + 0.015, 0.0, 0.3);
        let rr = 0, rg = 0, rb = 0;
        for (let q = -1; q <= 1; q++) { sampleAtlas(bodyTex.albedo, sRef, vTex + q * 0.006, bodyTmp); rr += SRGB_DEC[Math.round(bodyTmp[0])]; rg += SRGB_DEC[Math.round(bodyTmp[1])]; rb += SRGB_DEC[Math.round(bodyTmp[2])]; }
        rr /= 3; rg /= 3; rb /= 3;
        const kc = conv * 0.6, g0 = L.gain;
        cr *= lerp(1, clamp(rr / Math.max(bR * g0, 1e-4), 0.4, 2.0), kc); cg *= lerp(1, clamp(rg / Math.max(bG * g0, 1e-4), 0.4, 2.0), kc); cb *= lerp(1, clamp(rb / Math.max(bB * g0, 1e-4), 0.4, 2.0), kc);
        if (swr < 1) {
          sampleAtlas(bodyTex.albedo, s, vTex, bodyTmp);
          const br = SRGB_DEC[Math.round(bodyTmp[0])], bg = SRGB_DEC[Math.round(bodyTmp[1])], bb = SRGB_DEC[Math.round(bodyTmp[2])];
          cr = br + (cr - br) * swr; cg = bg + (cg - bg) * swr; cb = bb + (cb - bb) * swr;
          sampleAtlas(bodyTex.orm, s, vTex, bodyTmp);                                       // (AO is cross-faded in the cavity pass below)
          rough = bodyTmp[1] / 255 + (rough - bodyTmp[1] / 255) * swr; metal = bodyTmp[2] / 255 + (metal - bodyTmp[2] / 255) * swr;
          micro *= swr;
        }
      }
      albedo[o4] = toByte(cr); albedo[o4 + 1] = toByte(cg); albedo[o4 + 2] = toByte(cb); albedo[o4 + 3] = 255;
      ormB[o4] = Math.round(clamp01(aoP) * 255); ormB[o4 + 1] = Math.round(clamp(rough, 0.05, 1) * 255); ormB[o4 + 2] = Math.round(clamp01(metal) * 255); ormB[o4 + 3] = 255;
      const poleF = sstep(xc * 0.6, xc + 16, x);                                          // no relief on the snout cap (single-point pole of the atlas)
      microH[idx] = micro * poleF; reliefR[idx] = Rres[x] * swr * lerp(L.reliefGain, L.reliefGainOp, opZone) * (1 - 0.7 * R.vent[x] * (0.35 + 0.65 * n3) * (1 - 0.5 * sstep(0.45, 0.65, u))) * poleF;
      if (idx % 3 === 0 && swr > 0.99 && u > 0.5 && u < 0.7 && lat > 0.2) { const bi = Math.min(49, (t * 50) | 0); capBins[bi] += capW; capCnt[bi]++; }
      if (idx % 3 === 0 && u > 0.06 && u < 0.16 && lat > 0.2) { const bi = Math.min(49, (t * 50) | 0); snBins[bi] += capW; snCnt[bi]++; }
      if (idx % statStep === 0 && swr > 0.99) {
        nSamp++;
        const px8 = [toByte(photoEq[0]), toByte(photoEq[1]), toByte(photoEq[2])];
        if (capW > 0.9 && strapW < 0.05 && jawW < 0.05 && sp < 0.05 && u > 0.4 && lat < 0.3) stats.cap.push(px8);
        else if (capW > 0.9 && u < 0.3 && snW > 0.5 && strapW < 0.05) stats.snout.push(px8);
        else if (opW > 0.9 && rimW < 0.1) stats.opercle.push(px8);
        else if (rimW > 0.5 && opW > 0.2) stats.rim.push(px8);
        else if (pale > 0.95 && opW < 0.05 && jawW < 0.05 && strapW < 0.05 && u > 0.45 && u < 0.7 && lat > 0.8 && t > 0.4 && t < 0.7) stats.cheek.push(px8);
        else if (strapW > 0.9) stats.strap.push(px8);
        else if (jawW > 0.9) stats.jaw.push(px8);
        else if (gapeW > 0.7) stats.gape.push(px8);
        else if (nosW > 0.8) stats.nostril.push(px8);
        else if (orbW > 0.3) stats.orbit.push(px8);
        else if (sp > 0.9) stats.spot.push(px8);
        else if (vent > 0.9 && u > 0.3 && u < 0.9 && anz < 0.6) stats.throat.push(px8);
        else if (bandW > 0.5 && pale > 0.5) stats.band.push(px8);
      }
    }
  }
  // snout cap: the cap texels (s < 0) take the s = 0 ring of the same row -- the tip is the snout's / lip's own colour, with no gloss, speck or disc of its own
  for (let y = 0; y < H; y++) {
    const src = (y * W + xc) * 4;
    for (let x = 0; x < xc; x++) {
      const o4 = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) { albedo[o4 + c] = albedo[src + c]; ormB[o4 + c] = ormB[src + c]; }
    }
  }
  tick('paint');

  // ---------------------------------------------------------------- C. normal map
  const normal = new Uint8Array(N * 4);
  const tanMax = Math.tan(42 * Math.PI / 180);
  const Ht = new Float32Array(N);
  for (let i = 0; i < N; i++) Ht[i] = reliefR[i] + microH[i];
  const rowMX = new Float32Array(W), rowMY = new Float32Array(W);
  let maxTilt = 0, sumTilt = 0;
  const per = H - 1;
  for (let y = 0; y < H; y++) {
    up.row(F.mmX, y, rowMX); up.row(F.mmY, y, rowMY);
    const ym = y === 0 ? per - 1 : y - 1, yp = y === H - 1 ? 1 : y + 1;
    for (let x = 0; x < W; x++) {
      const xm = Math.max(x - 1, 0), xp = Math.min(x + 1, W - 1), idx = y * W + x;
      const gx = (Ht[y * W + xp] - Ht[y * W + xm]) / 1000 / ((xp - xm) * rowMX[x]);
      const gy = (Ht[yp * W + x] - Ht[ym * W + x]) / 1000 / (2 * rowMY[x]);
      let gxx = gx, gyy = gy; const sl = Math.hypot(gxx, gyy);
      if (sl > 1e-9) { const kk = Math.tanh(sl / tanMax) * tanMax / sl; gxx *= kk; gyy *= kk; }
      let nx = -gxx, ny = gyy, nz = 1; const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      const tilt = Math.acos(nz); if (tilt > maxTilt) maxTilt = tilt; sumTilt += tilt;
      const o4 = idx * 4; normal[o4] = Math.round((nx * 0.5 + 0.5) * 255); normal[o4 + 1] = Math.round((ny * 0.5 + 0.5) * 255); normal[o4 + 2] = Math.round((nz * 0.5 + 0.5) * 255); normal[o4 + 3] = 255;
    }
  }
  // cavity AO from the grid (fine relief) multiplies the painted AO
  const rowZone = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    up.row(F.ao, y, Rres); up.row(F.opZone, y, rowZone);
    for (let x = 0; x < W; x++) {
      const o4 = (y * W + x) * 4, s = (x / (W - 1)) * sSpan - cap, swr = 1 - bw[y * W + x];
      const xr = x < xc ? xc : x;                                                       // the snout cap repeats the s = 0 ring (also its cavity term)
      let ao = 0.18 + 0.82 * clamp01((ormB[o4] / 255) * (1 - (1 - Rres[xr]) * (1 - 0.85 * rowZone[xr])));                          // painted pigment AO x cavity AO of the relief, with a floor
      if (bodyTex && swr < 1) { sampleAtlas(bodyTex.orm, s, y / (H - 1), bodyTmp); ao = bodyTmp[0] / 255 + (ao - bodyTmp[0] / 255) * swr; }
      ormB[o4] = Math.round(255 * ao);
    }
  }
  tick('normal');

  // ---------------------------------------------------------------- D. seam: normal / wrap
  if (bodyTex) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (x / (W - 1)) * sSpan - cap; const swr = 1 - bw[y * W + x]; if (swr >= 1) continue;
      const o4 = (y * W + x) * 4; sampleAtlas(bodyTex.normal, s, y / (H - 1), bodyTmp);
      for (let c = 0; c < 3; c++) normal[o4 + c] = Math.round(bodyTmp[c] + (normal[o4 + c] - bodyTmp[c]) * swr);
    }
    // the row-wise AO / rough above already blended with the body for ORM
  }
  for (const im of [albedo, ormB, normal]) { const a = (H - 1) * W * 4; for (let i = 0; i < W * 4; i++) im[a + i] = im[i]; }      // exact wrap: last row == first row (both alpha = 0)
  // glTF samplers default to REPEAT: a lookup at u = 1 (the head / body seam ring) averages the last column with column 0 (the snout pole), which drew a 1 px line of the tip colour at s = sEnd.
  // The pole column is only seen on a ~0.05 mm disc at the very tip, so it gets the colour of the last column instead (then the wrap mixes the same colour with itself).
  for (const im of [albedo, ormB, normal]) for (let y = 0; y < H; y++) { const o = y * W * 4, e = o + (W - 1) * 4; im[o] = im[e]; im[o + 1] = im[e + 1]; im[o + 2] = im[e + 2]; }
  tick('seam');

  const med = (arr) => { if (!arr.length) return null; const m = [0, 1, 2].map((c) => { const a = arr.map((p) => p[c]).sort((p, q) => p - q); return a[a.length >> 1]; }); return m; };
  const regions = {}; for (const [k, a] of Object.entries(stats)) regions[k] = { n: a.length, share: +(a.length / Math.max(nSamp, 1)).toFixed(4), median_srgb_photo_equiv: med(a) };
  let snMeasured = 0; for (let b = 0; b < 50; b++) { if (snCnt[b] && snBins[b] / snCnt[b] > 0.5) snMeasured = (b + 1) / 50; else if (snCnt[b]) break; }
  let capMeasured = 0; for (let b = 0; b < 50; b++) { if (capCnt[b] && capBins[b] / capCnt[b] > 0.5) capMeasured = (b + 1) / 50; else if (capCnt[b]) break; }
  // the photo medians the painted regions are meant to match (docs/yamame/photo_analysis/head_color_markings.json), when the file is available
  let json_targets = null;
  try {
    const fsm = process.getBuiltinModule('node:fs'), J = JSON.parse(fsm.readFileSync(new URL('../../docs/yamame/photo_analysis/head_color_markings.json', import.meta.url), 'utf8')).regions;
    const map = { cap: 'dorsal_head', snout: 'snout_side', cheek: 'cheek', opercle: 'opercle', rim: 'opercle_rim', jaw: 'lower_jaw_side', strap: 'upper_lip_maxilla_plate', gape: 'lip_edge', throat: 'gill_membrane_branchiostegal', nostril: 'nostril_pit', orbit: 'eye_outer_dark_rim' };
    json_targets = {}; for (const [k, n] of Object.entries(map)) if (J[n]) json_targets[k] = { pooled_median_srgb: J[n].median_srgb, range: J[n].range };
  } catch { /* optional */ }
  const report = {
    module: 'headpaint.mjs', seed, width: W, height: H, coarse: [Wc, Hc], gain: L.gain, timing_ms: timing, haveFineRelief: haveFine,
    look: { capFrac: +L.capFrac.toFixed(3), silver: +L.silver.toFixed(2), hueBias: +L.hueBias.toFixed(2), nSpots: L.nSpots, spotsPainted: feat.spots.map((s) => +(s.dia / eyeDmm).toFixed(3)), smear: +L.smear.toFixed(2), warm: +L.warm.toFixed(2), pores: feat.pores },
    coverage: { cap_frac_cheek_column: capMeasured, dark_frac_snout_u006_016: snMeasured, cap_frac_design: +L.capFrac.toFixed(3), spots: feat.spots.length, pores: feat.pores, region_share: Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, v.share])) },
    normal: { max_tilt_deg: +(maxTilt * 180 / Math.PI).toFixed(1), mean_tilt_deg: +(sumTilt / N * 180 / Math.PI).toFixed(2) },
    regions, json_targets,
  };
  return { albedo: { width: W, height: H, data: albedo }, normal: { width: W, height: H, data: normal }, orm: { width: W, height: H, data: ormB }, mouth: generateMouthTexture({ seed, size: 256, gain: L.gain }), render: RENDER_HEAD, report, ...(debug ? { debug: { F, Hres, Wc, Hc } } : {}) };
}

// ------------------------------------------------------------------------------------------------------------------
/**
 * Mouth lining (M_Mouth), RGBA8 sRGB: x = along the tube from the lips (0) to the throat (1), y = round the loop
 * (0 roof .. 0.25 left cheek .. 0.375-0.625 floor / tongue .. 0.75 right cheek .. 1 roof).  Pale lilac-pink lining at the lips, mauve palate, pale tongue,
 * violet-grey cheek mucosa, everything fading to a near-black navy cavity towards the throat (photos 007, 017, 021, 023).  Wraps in y.
 */
export function generateMouthTexture({ seed = 1, size = 256, gain = LOOK.gain } = {}) {
  // Layout of the mouth tube (loft.mjs buildMouthTube): v = 0 right upper-lip edge -> roof (centre 0.125) -> 0.25 left upper-lip edge -> left cheek ribbon -> 0.375 left lower-lip edge ->
  // floor / tongue (centre 0.5) -> 0.625 right lower-lip edge -> right cheek ribbon -> 0.75 == 0.  So the lining is periodic with period 0.75 in v (v > 0.75 repeats the roof),
  // which is what makes the closing quad of the tube seamless if the writer duplicates the first loop vertex with v = 0.75.
  const sd1 = seedOf(seed, 'mouth1'), sd2 = seedOf(seed, 'mouth2'), sd3 = seedOf(seed, 'mouth3');
  const roofC = lin3(170, 122, 138), cheekC = lin3(158, 118, 140), tongueC = lin3(206, 172, 176), lipC = lin3(228, 224, 232), cornerC = lin3(196, 92, 126), litC = lin3(163, 133, 139);
  const deepC = lin3(47, 48, 59), blackC = lin3(18, 16, 28), ridgeC = lin3(232, 206, 210), veinC = lin3(150, 74, 96), toothC = lin3(236, 232, 224);
  const data = new Uint8Array(size * size * 4);
  const P = 0.75, wrapD = (a, b) => { let d = Math.abs(a - b) % P; return Math.min(d, P - d); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), vm = v % P, ang = (vm / P) * TAU;
    const dRoof = wrapD(vm, 0.125), dFloor = wrapD(vm, 0.5);
    const roofW = 1 - sstep(0.085, 0.15, dRoof), floorW = (1 - sstep(0.08, 0.135, dFloor)) * (1 - roofW), cheekW = clamp01(1 - roofW - floorW);
    let r = litC[0], g = litC[1], b = litC[2];
    const mixc = (c, w) => { r += (c[0] - r) * w; g += (c[1] - g) * w; b += (c[2] - b) * w; };
    mixc(roofC, roofW); mixc(cheekC, cheekW); mixc(tongueC, floorW);
    // noise on the loop (periodic): mucosal mottling, fine vascular tint
    const nx = Math.cos(ang) * 2.2, ny = Math.sin(ang) * 2.2, px = u * 9;
    const n1 = fbm3(px, nx, ny, sd1, 3), n2 = vn3(px * 5, nx * 5, ny * 5, sd2);
    const m = 0.88 + 0.30 * n1 + 0.10 * (n2 - 0.5); r *= m; g *= m * (0.97 + 0.06 * n2); b *= m;
    mixc(veinC, sstep(0.64, 0.82, fbm3(px * 2.2, nx * 3.4, ny * 3.4, sd3, 2)) * 0.22 * (1 - sstep(0.4, 0.8, u)));
    // palate: pale median ridge and two faint side ridges, cross rugae; tongue: a raised pale bump along the middle of the floor
    mixc(ridgeC, roofW * (bell(vm, 0.125, 0.03) * 0.16 + (bell(vm, 0.125 - 0.05, 0.02) + bell(vm, 0.125 + 0.05, 0.02)) * 0.08) * (1 - sstep(0.3, 0.7, u)) * (0.6 + 0.8 * n2));
    mul3(0.96 + 0.04 * Math.sin(u * TAU / 0.07), roofW * 0.6);
    mixc(ridgeC, floorW * bell(u, 0.38, 0.22) * bell(dFloor, 0, 0.07) * 0.5);
    mixc(veinC, floorW * bell(dFloor, 0, 0.02) * 0.14 * (1 - sstep(0.3, 0.7, u)));                  // soft median groove of the tongue
    // commissure / lateral wall: magenta-pink towards the corner (far end of the cheek ribbons), pearly white lip rim at the lips
    mixc(cornerC, cheekW * bell(u, 0.45, 0.22) * 0.5);
    mixc(lipC, bell(u, 0.06, 0.016) * 0.7);
    mixc(cornerC, (1 - sstep(0.0, 0.03, u)) * 0.5); mixc(blackC, (1 - sstep(0.0, 0.028, u)) * 0.8);         // the very front edge (all that shows with closed lips) is dark violet, like the gape
    // tooth rows (vomer / dentary): tiny pale dots near the lips
    const tooth = (1 - sstep(0.02, 0.06, Math.abs(u - 0.17))) * (roofW * bell(dRoof, 0.03, 0.02) + floorW * bell(dFloor, 0.05, 0.03)) * (vn3(vm * 140, u * 90, 0, sd2 + 5) > 0.55 ? 1 : 0);
    mixc(toothC, tooth * 0.7);
    // pharynx: lit tissue near the lips fading through violet-grey to a blue-black cavity
    const deep = sstep(0.06, 0.6, u) ** 1.15, black = sstep(0.45, 0.95, u);
    mixc(deepC, deep * 0.95 * (0.88 + 0.12 * (1 - floorW))); mixc(blackC, black * 0.9);
    const o = (y * size + x) * 4; data[o] = toByte(r * gain * 1.3); data[o + 1] = toByte(g * gain * 1.3); data[o + 2] = toByte(b * gain * 1.3); data[o + 3] = 255;
    function mul3(f, w) { const k = 1 + (f - 1) * w; r *= k; g *= k; b *= k; }
  }
  for (let x = 0; x < size; x++) for (let c = 0; c < 4; c++) data[((size - 1) * size + x) * 4 + c] = data[x * 4 + c];       // exact wrap (v = 1 == v = 0)
  return { albedo: { width: size, height: size, data }, orientation: 'along-u', period_v: P, roughness: 0.6 };
}

// ------------------------------------------------------------------------------------------------------------------
/**
 * Overwrite the head region of the BODY atlas (2048 x 1024, u = s, v = alpha / 2PI) with a down-sampled copy of the head atlas, so that the lower LODs
 * (which only use the body atlas) match the hero head.  The head atlas already equals the body atlas from s = sEnd - 0.008 on (see generateHeadTextures),
 * the copy is feathered out over `feather` before that, so there is no step anywhere.  Colours are averaged in linear light, normals as vectors
 * (re-normalised), ORM linearly.
 */
export function bakeHeadIntoBody({ surface, bodyTex, headTex, sEnd = 0.27, feather = 0.004 }) {
  const cap = surface.cap, sSpan = sEnd + cap, sB2 = sEnd - 0.008;
  const TX = 4, TY = 3, inv = 1 / (TX * TY);
  const out = {};
  for (const key of ['albedo', 'normal', 'orm']) {
    const B = bodyTex[key], Hd = headTex[key], Wb = B.width, Hb = B.height, Wh = Hd.width, Hh = Hd.height;
    const xMax = Math.min(Wb - 1, Math.ceil((sB2 + 1e-4) * (Wb - 1)));
    const acc = [0, 0, 0];
    for (let yb = 0; yb < Hb - 1; yb++) for (let xb = 0; xb <= xMax; xb++) {
      const s0 = xb / (Wb - 1), w = 1 - sstep(sB2 - feather, sB2, s0); if (w <= 0) continue;
      acc[0] = acc[1] = acc[2] = 0;
      for (let q = 0; q < TY; q++) for (let p = 0; p < TX; p++) {
        const s = (xb + (p + 0.5) / TX - 0.5) / (Wb - 1), v = (yb + (q + 0.5) / TY - 0.5) / (Hb - 1);
        const xh = clamp((s + cap) / sSpan, 0, 1) * (Wh - 1), yh = (((v % 1) + 1) % 1) * (Hh - 1);
        const x0 = Math.min(Math.floor(xh), Wh - 2), y0 = Math.min(Math.floor(yh), Hh - 2), fx = xh - x0, fy = yh - y0;
        for (let c = 0; c < 3; c++) {
          const d = Hd.data, i00 = (y0 * Wh + x0) * 4 + c, i01 = i00 + 4, i10 = i00 + Wh * 4, i11 = i10 + 4;
          let val = (d[i00] * (1 - fx) + d[i01] * fx) * (1 - fy) + (d[i10] * (1 - fx) + d[i11] * fx) * fy;
          if (key === 'albedo') val = decS(val / 255); else if (key === 'normal') val = val / 127.5 - 1; else val /= 255;
          acc[c] += val;
        }
      }
      let m0 = acc[0] * inv, m1 = acc[1] * inv, m2 = acc[2] * inv;
      if (key === 'albedo') { m0 = toByte(m0); m1 = toByte(m1); m2 = toByte(m2); }
      else if (key === 'normal') { const l = Math.hypot(m0, m1, m2) || 1; m0 = (m0 / l + 1) * 127.5; m1 = (m1 / l + 1) * 127.5; m2 = (m2 / l + 1) * 127.5; }
      else { m0 *= 255; m1 *= 255; m2 *= 255; }
      const o4 = (yb * Wb + xb) * 4;
      B.data[o4] = Math.round(B.data[o4] + (m0 - B.data[o4]) * w); B.data[o4 + 1] = Math.round(B.data[o4 + 1] + (m1 - B.data[o4 + 1]) * w); B.data[o4 + 2] = Math.round(B.data[o4 + 2] + (m2 - B.data[o4 + 2]) * w);
    }
    for (let i = 0; i < Wb * 4; i++) B.data[(Hb - 1) * Wb * 4 + i] = B.data[i];       // wrap row (alpha = 2PI == 0)
    out[key] = true;
  }
  return out;
}
