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
import { polyV, distPolyline, sdPolygon } from './head.mjs';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bell = (x, c, w) => { const q = (x - c) / w; return Math.exp(-q * q); };

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
export const LOOK = {
  gain: 0.42,                 // photo appearance -> linear albedo (photos include light and highlights); calibrated against renders of the viewer still
  capFrac: 0.235,             // dorsal cap: lower border at this fraction of the head height (cheek column)
  snoutFrac: 0.60,            // ... and in front of the eye (down to the maxilla strap)
  capRagged: 0.06, capEdge: 0.04,
  palette: {
    capDark: [60, 46, 26], capMid: [92, 72, 42], capLight: [124, 100, 60], fleck: [176, 142, 88], snout: [84, 76, 60], band: [146, 120, 76], smudge: [104, 92, 100],
    cheekBronze: [160, 128, 72], cheekPearl: [176, 156, 130], cheekLilac: [160, 142, 152], cheekGreen: [140, 136, 84], cheekGold: [186, 152, 86], cheekBlue: [140, 150, 164],
    opercle: [160, 146, 120], opercleLilac: [172, 160, 166], rimGold: [200, 168, 98], copper: [186, 128, 84], preLine: [226, 206, 184],
    jaw: [178, 170, 160], throat: [178, 174, 172], ventral: [200, 194, 184], bran: [176, 174, 180],
    strap: [144, 122, 100], strapLight: [178, 158, 134], groove: [56, 40, 28], gape: [22, 15, 30], lip: [200, 188, 206],
    nostril: [38, 32, 28], nostrilRim: [126, 124, 128], orbit: [50, 40, 30], smear: [88, 62, 56], spot: [18, 15, 12], poreDark: [46, 38, 34], porePale: [222, 214, 206],
  },
};
const PAL = {}; for (const [k, c] of Object.entries(LOOK.palette)) PAL[k] = lin3(c[0], c[1], c[2]);
// vertical gradient of the pale field in height fraction t = 0.2 .. 0.95 (bronze -> pearl-warm -> silver-cream -> white)
const GRAD = [lin3(138, 112, 70), lin3(152, 126, 88), lin3(162, 142, 116), lin3(178, 166, 150), lin3(200, 194, 182)];

// ------------------------------------------------------------------------------------------------------------------
// geometry helpers on the spec
function polyUofV(m, v) {     // u at height v of a polyline given top -> bottom with v decreasing (same as head.mjs)
  if (v >= m[0][1]) return m[0][0];
  for (let i = 1; i < m.length; i++) if (v >= m[i][1]) { const t = (v - m[i - 1][1]) / (m[i][1] - m[i - 1][1] || -1e-9); return lerp(m[i - 1][0], m[i][0], t); }
  return m[m.length - 1][0];
}

function makeLook(seed, over = {}) {
  const r = rngOf(seed, 'headlook');
  const L = {
    capFrac: LOOK.capFrac + 0.03 * (r() - 0.5), snoutFrac: LOOK.snoutFrac, capRagged: LOOK.capRagged, capEdge: LOOK.capEdge, reliefGain: 0.7, metalScale: 0.7,
    nSpots: 9 + Math.floor(r() * 9),              // 5-20 per head
    smear: r() < 0.5 ? 0.45 + 0.55 * r() : 0.12,  // dark post-orbital smear (some fish only)
    warm: 0.45 + 0.55 * r(),                      // copper / salmon flush on the upper rear opercle
    hueBias: r() * 2 - 1,                         // gold <-> lilac balance of the pearly cheek
    gain: LOOK.gain,
  };
  return Object.assign(L, over);
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
export function generateHeadTextures({ surface, params, head, spec, seed = 1, bodyTex = null, sEnd = 0.27, width = 1536, height = 2048, look = {} }) {
  const T0 = Date.now(), timing = {};
  const tick = (k) => { timing[k] = Date.now() - T0; };
  const L = makeLook(seed, look);
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
  const F = {}; for (const k of ['u', 'v', 't', 'px', 'py', 'pz', 'nx', 'ny', 'nz', 'Hg', 'Hf', 'mmX', 'mmY', 'ddm', 'sdMax', 'sdDen', 'gDv', 'gU', 'preDu', 'preS', 'opDu', 'opIn', 'eR', 'eA', 'n1', 'n2', 'th', 'vent', 'ao']) F[k] = new Float32Array(NC);
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
      F.t[k] = clamp(0.5 - (p[1] / SL - secC[i]) / (2 * secH[i] * capSc[i]), 0, 1);
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
  const line = spec.mouth?.line || null, corner = spec.mouth?.corner || (line ? line[line.length - 1] : null);
  const maxP = spec.maxilla?.outline, denP = spec.dentary?.outline, preL = spec.preopercle?.line, opM = spec.opercle?.margin, nos = spec.nostrils, bran = spec.branchiostegal;
  const vTopO = opM ? opM[0][1] : 0, vBotO = opM ? opM[opM.length - 1][1] : 0;
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
      const dg = head.displacement(s, alpha, ctx), df = head.displacement(s, alpha, ctxF);
      F.Hg[k] = dg * 1e6; F.Hf[k] = df * 1e6; if (dg !== df) haveFine = true;
      if (maxP) F.sdMax[k] = sdPolygon(maxP, u, v);
      if (denP) F.sdDen[k] = sdPolygon(denP, u, v);
      if (line) { F.gDv[k] = v - polyV(line, clamp(u, line[0][0], line[line.length - 1][0])); F.gU[k] = u - corner[0]; }
      if (preL) F.preDu[k] = u - polyUofV(preL, clamp(v, preL[preL.length - 1][1], preL[0][1]));
      if (opM) { F.opDu[k] = u - polyUofV(opM, clamp(v, vBotO, vTopO)); F.opIn[k] = smoothH(vBotO - 0.03, vBotO + 0.02, v) * smoothH(vTopO + 0.03, vTopO - 0.02, v); }
      if (eyeC) {
        let best = 1e9; for (const c of eyeC) { const d = Math.hypot(px - c[0], py - c[1], pz - c[2]); if (d < best) best = d; }
        F.eR[k] = best / eyeRo; F.eA[k] = Math.atan2(v - eyeSpec.v, u - eyeSpec.u);
      } else F.eR[k] = 9;
      if (nos?.anterior) F.n1[k] = Math.hypot((u - nos.anterior[0]) * HLmm, (v - nos.anterior[1]) * HLmm);
      if (nos?.posterior) F.n2[k] = Math.hypot((u - nos.posterior[0]) * HLmm / 1.5, (v - nos.posterior[1]) * HLmm);
      if (bran) { const du = u - bran.apex_u; F.th[k] = Math.atan2(Math.abs(pz) / HLm, du); F.vent[k] = sstep(0.35, 0.85, -F.ny[k]); }
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
  // dorsal head spots: area-uniform on the dark cap, bigger and denser towards the nape, none at the snout tip
  {
    const rng = rngOf(seed, 'spots'); const cand = []; let tot = 0;
    for (let j = 1; j < Hc - 1; j += 2) for (let i = 0; i < Wc; i += 2) {
      const k = j * Wc + i, u = F.u[k]; if (u < 0.10 || u > 0.97) continue;
      const tb = lerp(L.snoutFrac, L.capFrac, sstep(0.16, 0.46, u)); if (F.t[k] > tb * 0.85) continue;
      const w = F.mmX[k] * F.mmY[k] * (0.3 + 1.2 * sstep(0.1, 0.9, u)); tot += w; cand.push([k, tot]);
    }
    for (let n = 0; n < L.nSpots && cand.length; n++) {
      const r = rng() * tot; let lo = 0, hi = cand.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cand[m][1] < r) lo = m + 1; else hi = m; }
      const k = cand[lo][0], gi = k % Wc, gj = (k / Wc) | 0; const cx = (gi + rng() * 2 - 1) / (Wc - 1) * (W - 1), cy = (gj + rng() * 2 - 1) / (Hc - 1) * (H - 1);
      const u = F.u[k];
      let f = Math.exp(gaussR(rng) * 0.42) * (0.10 + 0.13 * sstep(0.15, 0.95, u));       // diameter / eye diameter (0.07 .. 0.40)
      f = clamp(f, 0.065, 0.4); const dia = f * eyeDmm, el = 1 + 0.3 * rng(), rot = rng() * Math.PI;
      feat.spots.push({ cx, cy, dia, el, rot, ph: rng() * TAU, amp: 0.12 + 0.12 * rng(), soft: 0.10 + 0.12 * rng() });
    }
    for (const sp of feat.spots) {
      const r = sp.dia / 2, ca = Math.cos(sp.rot), sa = Math.sin(sp.rot);
      splat(sp.cx, sp.cy, r * 1.4, (idx, rho, dx, dy) => {
        const X = (dx * ca + dy * sa) / sp.el, Y = -dx * sa + dy * ca, d = Math.hypot(X, Y), ang = Math.atan2(Y, X);
        const rr = r * (1 + sp.amp * Math.sin(2 * ang + sp.ph) * 0.5 + sp.amp * 0.4 * Math.sin(3 * ang + 2 * sp.ph));
        const m = 1 - sstep(rr * (1 - sp.soft), rr * (1 + sp.soft), d); if (m > maskSpot[idx]) maskSpot[idx] = m;
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
  const rowKeys = ['u', 'v', 't', 'px', 'py', 'pz', 'nz', 'sdMax', 'sdDen', 'gDv', 'preDu', 'opDu', 'opIn', 'eR', 'eA', 'n1', 'n2', 'th', 'vent', 'ddm'];
  const R = {}; for (const k of rowKeys) R[k] = new Float32Array(W);
  const RN = {}; for (const k of Object.keys(Nz)) RN[k] = new Float32Array(W);
  const Rres = new Float32Array(W);
  const sdG = sd('grain'), sdG2 = sd('grain2'), sdSp = sd('speck'), sdIr1 = sd('iri1'), sdIr2 = sd('iri2'), sdSc = sd('scales'), sdSc2 = sd('scales2'), sdFl = sd('fleck'), sdRg = sd('rough'), sdRg2 = sd('rough2'), sdNet = sd('net'), sdCu = sd('copper');
  const capLo = PAL.capDark, capMi = PAL.capMid, capHi = PAL.capLight;
  // hinge of the opercle (radial striations fan out from it): between the top of the preopercle line and the top of the free margin
  const hinge = (preL && opM) ? [0.5 * (preL[0][0] + opM[0][0]), 0.5 * (preL[0][1] + opM[0][1])] : [0.77, 0.11];
  const stats = { cap: [], snout: [], cheek: [], opercle: [], rim: [], jaw: [], strap: [], gape: [], throat: [], nostril: [], orbit: [], band: [], spot: [] };
  const statStep = Math.max(1, Math.floor(N / 260000));
  let cr = 0, cg = 0, cb = 0;
  const mixTo = (c, w) => { cr += (c[0] - cr) * w; cg += (c[1] - cg) * w; cb += (c[2] - cb) * w; };
  const mul = (f) => { cr *= f; cg *= f; cb *= f; };
  const sB1 = sEnd - 0.024, sB2 = sEnd - 0.008;                      // cross-fade into the body atlas (weight 0 at sB1 -> 1 at sB2)
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
      const tb = lerp(L.snoutFrac, L.capFrac, sstep(0.16, 0.46, u));
      const bOff = (nb - 0.5) * 2 * L.capRagged * (0.6 + 0.8 * n3);
      const wB = L.capEdge * (0.6 + 0.9 * n3);
      const pale = sstep(tb + bOff - wB, tb + bOff + wB, t);
      const capW = 1 - pale;
      // cap: olive-brown melanophore mottling, lighter bronze patches, scale-lattice of the nape, gold flecks
      const mott = sstep(0.25, 0.8, n2 * 0.6 + n1 * 0.4);
      cr = lerp(capLo[0], capMi[0], mott); cg = lerp(capLo[1], capMi[1], mott); cb = lerp(capLo[2], capMi[2], mott);
      const lw = sstep(0.55, 0.85, n1 * 0.5 + n3 * 0.5) * 0.5; cr += (capHi[0] - cr) * lw; cg += (capHi[1] - cg) * lw; cb += (capHi[2] - cb) * lw;
      const nape = sstep(0.30, 0.62, u);
      if (capW > 0.02 && nape > 0) {
        const c = scaleCell(px, R.ddm[x], 0.95, sdSc, 0.32);
        const edge = sstep(0.30, 0.52, c.d) * (0.55 + 0.45 * sstep(0.1, -0.25, c.ox));
        mul(1 + capW * nape * (0.14 * (c.id - 0.5) + 0.16 * edge * (0.5 + n2) - 0.04));
        const fl = dots3(px, py, pz, 0.36, 0.09, 0.5, sdFl) * capW * (0.15 + 0.85 * nape) * sstep(0.3, 0.7, n2 + 0.25 * (n1 - 0.5)); mixTo(PAL.fleck, fl * 0.6);
      }
      // snout side (grey-olive), lighter than the cap, towards the strap
      const snW = (1 - sstep(0.22, 0.5, u)) * sstep(0.06, 0.40, t);
      mixTo(PAL.snout, snW * 0.85 * capW);
      // pale field: bronze/gold band right under the border, then bronze -> pearl -> silver-cream -> white with large pearly hue patches (gold, lilac, olive-green, blue-silver)
      let pr, pg, pb;
      { const tt = clamp01((t - 0.2) / 0.75), k = tt * 4, i0 = Math.min(Math.floor(k), 3), f = k - i0, A = GRAD[i0], B = GRAD[i0 + 1];
        pr = lerp(A[0], B[0], f); pg = lerp(A[1], B[1], f); pb = lerp(A[2], B[2], f); }
      const wGold = sstep(0.52, 0.78, n1 * 0.6 + nh * 0.4 + 0.1 * L.hueBias) * 0.55, wLil = sstep(0.55, 0.8, nh2) * 0.6, wGrn = sstep(0.55, 0.82, n2 * 0.5 + nh * 0.5) * 0.45, wBlue = sstep(0.6, 0.85, nh2 * 0.5 + n1 * 0.5) * 0.35 * sstep(0.45, 0.8, t);
      pr += (PAL.cheekGold[0] - pr) * wGold; pg += (PAL.cheekGold[1] - pg) * wGold; pb += (PAL.cheekGold[2] - pb) * wGold;
      pr += (PAL.cheekLilac[0] - pr) * wLil; pg += (PAL.cheekLilac[1] - pg) * wLil; pb += (PAL.cheekLilac[2] - pb) * wLil;
      pr += (PAL.cheekGreen[0] - pr) * wGrn; pg += (PAL.cheekGreen[1] - pg) * wGrn; pb += (PAL.cheekGreen[2] - pb) * wGrn;
      pr += (PAL.cheekBlue[0] - pr) * wBlue; pg += (PAL.cheekBlue[1] - pg) * wBlue; pb += (PAL.cheekBlue[2] - pb) * wBlue;
      const lumP = 0.92 + 0.16 * n1 + 0.06 * (n2 - 0.5); pr *= lumP; pg *= lumP; pb *= lumP;
      const vent = sstep(0.60, 0.95, t);
      pr = lerp(pr, PAL.throat[0], vent); pg = lerp(pg, PAL.throat[1], vent); pb = lerp(pb, PAL.throat[2], vent);
      const bandW = bell(t, tb + bOff + 0.07, 0.07) * (1 - vent) * sstep(0.2, 0.45, u);
      pr = lerp(pr, PAL.band[0], bandW * 0.7); pg = lerp(pg, PAL.band[1], bandW * 0.7); pb = lerp(pb, PAL.band[2], bandW * 0.7);
      cr += (pr - cr) * pale; cg += (pg - cg) * pale; cb += (pb - cb) * pale;
      rough = lerp(0.60, 0.34, pale); metal = lerp(0.02, 0.22, pale);
      // cheek: faint embedded scales (irregular, patchy), nothing like a regular mesh
      const cheekM = pale * lat * (1 - vent) * sstep(0.36, 0.5, u) * (1 - sstep(0.72, 0.8, u)) * sstep(0.30, 0.62, n2 * 0.5 + n1 * 0.5 + 0.1);
      if (cheekM > 0.02) {
        const c = scaleCell(px, py, 0.72, sdSc2, 0.34);
        const edge = sstep(0.30, 0.52, c.d), rimL = edge * (0.5 + 0.5 * sstep(0.05, -0.25, c.ox));
        mul(1 + cheekM * (0.045 * (c.id - 0.5) + 0.05 * rimL - 0.02 * edge * sstep(-0.05, 0.25, c.ox)));
        micro += cheekM * 5 * rimL;
      }
      // upper cheek / opercle: reticulate melanophore network (olive-brown, ~1 mm mesh) fading out towards the silver below, copper-gold flecks
      { const rw = pale * lat * (1 - vent) * (1 - sstep(0.40, 0.70, t)) * sstep(0.34, 0.5, u) * (0.5 + n1);
        if (rw > 0.02) {
          const c = scaleCell(px, py, 1.05, sdNet, 0.45), net = sstep(0.28, 0.55, c.d) * (0.6 + 0.8 * n3);
          mul(1 - 0.20 * rw * net * (0.5 + 0.5 * c.id));
          const cu = dots3(px, py, pz, 0.40, 0.075, 0.45, sdCu) * rw; mixTo(PAL.fleck, cu * 0.55);
        } }
      // ---- maxilla strap -------------------------------------------------------------------------------------
      let strapW = 0, jawW = 0;
      if (maxP) {
        strapW = sstep(-0.004, 0.004, R.sdMax[x]) * lat;
        if (strapW > 0) {
          const k = clamp01(1 - sstep(0.0, 0.07, R.sdMax[x])) * 0.9;
          const sr = lerp(PAL.strap[0], PAL.strapLight[0], k), sg = lerp(PAL.strap[1], PAL.strapLight[1], k), sb = lerp(PAL.strap[2], PAL.strapLight[2], k);
          const m = strapW * (0.88 + 0.12 * n2), nn = 0.92 + 0.16 * n3; cr += (sr * nn - cr) * m; cg += (sg * nn - cg) * m; cb += (sb * nn - cb) * m;
          rough = lerp(rough, 0.36, strapW); metal = lerp(metal, 0.06, strapW);
        }
        const gv = bell(R.sdMax[x], 0.0, 0.0035) * lat * sstep(0.02, 0.1, u) * (1 - sstep(0.40, 0.46, u));      // dark groove along the upper border of the strap
        mixTo(PAL.groove, gv * 0.8); aoP *= 1 - 0.35 * gv;
      }
      // ---- dentary / lower jaw ---------------------------------------------------------------------------------
      if (denP) {
        jawW = sstep(-0.004, 0.004, R.sdDen[x]) * lat * (1 - strapW);
        if (jawW > 0) {
          const nn = 0.94 + 0.12 * n2, mx = 0.4 * wLil;
          const jr = lerp(PAL.jaw[0], PAL.cheekLilac[0], mx) * nn, jg = lerp(PAL.jaw[1], PAL.cheekLilac[1], mx) * nn, jb = lerp(PAL.jaw[2], PAL.cheekLilac[2], mx) * nn;
          cr += (jr - cr) * jawW; cg += (jg - cg) * jawW; cb += (jb - cb) * jawW;
          rough = lerp(rough, 0.30, jawW); metal = lerp(metal, 0.2, jawW);
        }
      }
      // ---- gape line, lips ---------------------------------------------------------------------------------------
      let gapeW = 0;
      if (line) {
        const fadeEnd = 1 - sstep(corner[0] - 0.01, corner[0] + 0.03, u), gv = R.gDv[x];
        const lipUp = bell(gv, 0.013, 0.008) * 0.55 * fadeEnd * lat, lipLo = bell(gv, -0.014, 0.009) * 0.6 * fadeEnd * lat;
        mixTo(PAL.lip, lipUp + lipLo); rough = lerp(rough, 0.2, clamp01(lipUp + lipLo)); metal = lerp(metal, 0.0, clamp01(lipUp + lipLo));
        gapeW = bell(gv, 0.0, 0.0030) * fadeEnd * (1 - 0.3 * (1 - lat));
        mixTo(PAL.gape, gapeW * 0.96); aoP *= 1 - 0.7 * gapeW; metal *= 1 - gapeW;
      }
      // ---- opercle, preopercle ------------------------------------------------------------------------------------
      let opW = 0, rimW = 0;
      if (opM) {
        const du = R.opDu[x], inside = R.opIn[x];
        const front = preL ? sstep(-0.006, 0.008, R.preDu[x]) : 1;
        opW = front * (1 - sstep(-0.004, 0.003, du)) * inside * lat;
        if (opW > 0) {
          const op = sstep(0.4, 0.7, nh2 * 0.6 + nh * 0.4);
          const orr = lerp(PAL.opercle[0], PAL.opercleLilac[0], op * 0.6), og = lerp(PAL.opercle[1], PAL.opercleLilac[1], op * 0.6), ob = lerp(PAL.opercle[2], PAL.opercleLilac[2], op * 0.6);
          const nn = 0.95 + 0.1 * n3, m = opW * 0.78; cr += (orr * nn - cr) * m; cg += (og * nn - cg) * m; cb += (ob * nn - cb) * m;
          rough = lerp(rough, 0.26, opW); metal = lerp(metal, 0.42, opW);
          // striations of the bone: rays from the hinge + concentric growth lines; soft melanophore smudges on the upper plate
          const dh = u - hinge[0], vh = v - hinge[1], rho = Math.hypot(dh, vh), th = Math.atan2(vh, dh);
          const ray = Math.sin(th * 80 + 9 * (nh2 - 0.5) + 14 * (n3 - 0.5)), grow = Math.sin(rho * (TAU / 0.0125) + 9 * (nh - 0.5));
          const sw = opW * sstep(0.04, 0.12, rho);
          mul(1 + sw * (0.02 * ray + 0.012 * grow) * (0.4 + 1.2 * n2)); micro += sw * (3.5 * ray + 2 * grow);
          const smud = sstep(0.60, 0.80, n2 * 0.5 + nh2 * 0.5) * (1 - sstep(0.25, 0.7, t)); mixTo(PAL.smudge, 0.32 * smud * opW);
        }
        rimW = bell(du, -0.007, 0.0075) * inside * lat * (preL ? sstep(-0.004, 0.01, R.preDu[x]) : 1);
        mixTo(PAL.rimGold, rimW * 0.36); metal = lerp(metal, 0.5, rimW * 0.6); rough = lerp(rough, 0.24, rimW);
        const gapB = bell(du, 0.008, 0.0055) * inside * lat;                  // groove under the free edge: the body tucks under
        mul(1 - 0.18 * gapB); aoP *= 1 - 0.4 * gapB;
        const fl = bell(du, -0.05, 0.05) * sstep(0.02, 0.08, v) * sstep(0.2, 0.9, RN.warm[x]) * inside * lat * L.warm;       // warm copper / salmon flush on the upper rear opercle
        mixTo(PAL.copper, fl * 0.3);
      }
      if (preL) {
        const pd = R.preDu[x], pl = bell(pd, 0.0, 0.0042) * lat * (1 - sstep(0.80, 0.90, u));
        mixTo(PAL.preLine, pl * 0.16); metal = lerp(metal, 0.5, pl * 0.4);
        mul(1 - 0.18 * bell(pd, -0.009, 0.006) * lat);
      }
      // ---- nostrils -----------------------------------------------------------------------------------------------------
      let nosW = 0;
      if (nos?.anterior) {
        const r1 = R.n1[x], R0 = nos.radius_mm ?? 0.85;
        const pit = 1 - sstep(R0 * 0.32, R0 * 0.62, r1), rim = bell(r1, R0 * 1.0, R0 * 0.3) * (1 - pit);
        mixTo(PAL.nostrilRim, rim * 0.5 * lat); mixTo(PAL.nostril, pit * 0.95); nosW = pit; aoP *= 1 - 0.7 * pit;
      }
      if (nos?.posterior) {
        const r2 = R.n2[x], R0 = (nos.radius_mm ?? 0.85) * 0.8;
        const pit = 1 - sstep(R0 * 0.3, R0 * 0.6, r2); mixTo(PAL.nostril, pit * 0.9); nosW = Math.max(nosW, pit); aoP *= 1 - 0.6 * pit;
      }
      // ---- orbit: dark skin ring round the eye + socket shadow, dark post-orbital smear -----------------------------------
      let orbW = 0;
      if (eyeC) {
        const er = R.eR[x], ea = R.eA[x];
        const ang = 0.6 + 0.4 * Math.cos(ea - 2.3) + 0.25 * Math.cos(ea - 0.2);              // thicker at the upper front and rear
        orbW = bell(er, 1.18, 0.20) * ang * 0.85 * (1 - sstep(1.9, 2.4, er)); mixTo(PAL.orbit, clamp01(orbW)); aoP *= 1 - 0.5 * (1 - sstep(1.0, 2.0, er));
        if (L.smear > 0) {
          const sm = bell(er, 2.2, 0.8) * sstep(-0.3, 0.6, Math.cos(ea - 0.45)) * sstep(0.55, 0.15, Math.abs(Math.sin(ea - 0.3) * 0.4 + (nh2 - 0.5) * 0.3)) * L.smear * lat * (0.6 + 0.8 * n2);
          mixTo(PAL.smear, clamp01(sm) * 0.45);
        }
      }
      // ---- branchiostegal ribs on the throat -----------------------------------------------------------------------------------
      if (bran) {
        const vt = R.vent[x];
        if (vt > 0) {
          const w = sstep(bran.apex_u + 0.02, bran.apex_u + 0.1, u) * sstep(bran.end_u ?? 1, (bran.end_u ?? 1) - 0.12, u) * vt;
          const ridge = 0.5 + 0.5 * Math.cos((R.th[x] / (bran.pitch ?? 0.07)) * TAU);
          mixTo(PAL.bran, w * 0.5); mul(1 - 0.035 * w * (1 - ridge) * (0.5 + n3));
        }
      }
      // ---- dark head spots and pores --------------------------------------------------------------------------------------
      const sp = maskSpot[idx]; if (sp > 0) { mixTo(PAL.spot, sp * 0.95); rough = lerp(rough, 0.55, sp); metal *= 1 - sp; }
      const pd = maskPoreD[idx], pp = maskPoreP[idx];
      if (pd > 0 || pp > 0) { mixTo(PAL.porePale, pp * 0.14); mixTo(PAL.poreDark, pd * 0.7); aoP *= 1 - 0.4 * pd; }
      // snout tip (the pole of the atlas): the chord coordinates degenerate there, so the pale lower jaw tip / gape ring are set from the height fraction
      { const tipW = 1 - sstep(0.012, 0.06, u);
        if (tipW > 0) { const jt = sstep(0.54, 0.60, t) * tipW; mixTo(PAL.jaw, jt * 0.9); mixTo(PAL.gape, bell(t, 0.52, 0.02) * tipW * 0.7); } }
      // ---- fine structure ------------------------------------------------------------------------------------------------------
      const g1 = vn3(px / 0.16, py / 0.16, pz / 0.16, sdG) - 0.5, g2 = vn3(px / 0.07, py / 0.07, pz / 0.07, sdG2) - 0.5;
      const spk = dots3(px, py, pz, 0.16, 0.05, 0.6, sdSp) * 0.9;          // melanophore speckle: dense on the cap, thin on the pale field
      const drip = 1 - sstep(0.0, 0.14, t - (tb + bOff));
      mul(1 - spk * (0.34 * capW + (0.16 + 0.30 * drip) * pale * (1 - vent)));
      const pearlM = clamp01(pale * (1 - vent * 0.4) + opW * 0.6);                        // iridophore glitter: low-amplitude pink / lilac / green hue shifts
      const i1 = vn3(px / 0.2, py / 0.2, pz / 0.2, sdIr1) - 0.5, i2 = vn3(px / 0.33, py / 0.33, pz / 0.33, sdIr2) - 0.5;
      cr *= 1 + pearlM * (0.22 * i1 + 0.12 * i2); cg *= 1 + pearlM * (-0.08 * i1 - 0.12 * i2); cb *= 1 + pearlM * (-0.24 * i1 + 0.14 * i2);
      mul(1 + 0.10 * g1 + 0.06 * g2);
      micro += 3.2 * g1 + 1.8 * g2 + pitH[idx];
      // ---- roughness variation (water-film streaks along the body axis) -----------------------------------------------------------------
      const streak = vn3(px / 3.2, py / 0.9, pz / 0.9, sdRg) - 0.5, st2 = vn3(px / 0.5, py / 0.5, pz / 0.5, sdRg2) - 0.5;
      rough += 0.07 * streak + 0.03 * st2; metal *= (0.9 + 0.3 * i1) * L.metalScale;
      // ---- cross-fade into the body atlas at the rear of the head -----------------------------------------------------------------------
      const s = (x / (W - 1)) * sSpan - cap;
      const photoEq = [cr, cg, cb];
      cr *= L.gain; cg *= L.gain; cb *= L.gain;
      const swr = 1 - sstep(sB1, sB2, s);
      if (bodyTex && swr < 1) {
        sampleAtlas(bodyTex.albedo, s, vTex, bodyTmp);
        const br = SRGB_DEC[Math.round(bodyTmp[0])], bg = SRGB_DEC[Math.round(bodyTmp[1])], bb = SRGB_DEC[Math.round(bodyTmp[2])];
        cr = br + (cr - br) * swr; cg = bg + (cg - bg) * swr; cb = bb + (cb - bb) * swr;
        sampleAtlas(bodyTex.orm, s, vTex, bodyTmp);
        aoP = bodyTmp[0] / 255 + (aoP - bodyTmp[0] / 255) * swr; rough = bodyTmp[1] / 255 + (rough - bodyTmp[1] / 255) * swr; metal = bodyTmp[2] / 255 + (metal - bodyTmp[2] / 255) * swr;
        micro *= swr;
      }
      albedo[o4] = toByte(cr); albedo[o4 + 1] = toByte(cg); albedo[o4 + 2] = toByte(cb); albedo[o4 + 3] = 255;
      ormB[o4] = Math.round(clamp01(aoP) * 255); ormB[o4 + 1] = Math.round(clamp(rough, 0.05, 1) * 255); ormB[o4 + 2] = Math.round(clamp01(metal) * 255); ormB[o4 + 3] = 255;
      const poleF = sstep(0.0, 0.05, u);
      microH[idx] = micro * poleF; reliefR[idx] = Rres[x] * swr * L.reliefGain * (1 - 0.6 * R.vent[x] * (0.35 + 0.65 * n3)) * poleF;
      if (idx % statStep === 0 && swr > 0.99) {
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
        else if (orbW > 0.6) stats.orbit.push(px8);
        else if (sp > 0.9) stats.spot.push(px8);
        else if (vent > 0.9 && u > 0.3 && u < 0.9 && anz < 0.6) stats.throat.push(px8);
        else if (bandW > 0.5 && pale > 0.5) stats.band.push(px8);
      }
    }
  }
  tick('paint');

  // ---------------------------------------------------------------- C. normal map
  const normal = new Uint8Array(N * 4);
  const tanMax = Math.tan(48 * Math.PI / 180);
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
  for (let y = 0; y < H; y++) {
    up.row(F.ao, y, Rres);
    for (let x = 0; x < W; x++) { const o4 = (y * W + x) * 4; ormB[o4] = Math.round(ormB[o4] * Rres[x]); }
  }
  tick('normal');

  // ---------------------------------------------------------------- D. seam: normal / wrap
  if (bodyTex) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (x / (W - 1)) * sSpan - cap; const swr = 1 - sstep(sB1, sB2, s); if (swr >= 1) continue;
      const o4 = (y * W + x) * 4; sampleAtlas(bodyTex.normal, s, y / (H - 1), bodyTmp);
      for (let c = 0; c < 3; c++) normal[o4 + c] = Math.round(bodyTmp[c] + (normal[o4 + c] - bodyTmp[c]) * swr);
    }
    // the row-wise AO / rough above already blended with the body for ORM
  }
  for (const im of [albedo, ormB, normal]) { const a = (H - 1) * W * 4; for (let i = 0; i < W * 4; i++) im[a + i] = im[i]; }      // exact wrap: last row == first row (both alpha = 0)
  tick('seam');

  const med = (arr) => { if (!arr.length) return null; const m = [0, 1, 2].map((c) => { const a = arr.map((p) => p[c]).sort((p, q) => p - q); return a[a.length >> 1]; }); return m; };
  const regions = {}; for (const [k, a] of Object.entries(stats)) regions[k] = { n: a.length, median_srgb_photo_equiv: med(a) };
  const report = {
    module: 'headpaint.mjs', seed, width: W, height: H, coarse: [Wc, Hc], gain: L.gain, timing_ms: timing, haveFineRelief: haveFine,
    look: { capFrac: +L.capFrac.toFixed(3), nSpots: L.nSpots, spotsPainted: feat.spots.map((s) => +(s.dia / eyeDmm).toFixed(3)), smear: +L.smear.toFixed(2), warm: +L.warm.toFixed(2), pores: feat.pores },
    normal: { max_tilt_deg: +(maxTilt * 180 / Math.PI).toFixed(1), mean_tilt_deg: +(sumTilt / N * 180 / Math.PI).toFixed(2) },
    regions,
  };
  return { albedo: { width: W, height: H, data: albedo }, normal: { width: W, height: H, data: normal }, orm: { width: W, height: H, data: ormB }, report };
}

// ------------------------------------------------------------------------------------------------------------------
/** Overwrite the head region of the BODY atlas (2048 x 1024, u = s, v = alpha / 2PI) with a down-sampled copy of the head atlas. */
export function bakeHeadIntoBody({ surface, bodyTex, headTex, sEnd = 0.27, feather = 0.006 }) {
  const cap = surface.cap, sSpan = sEnd + cap, sB2 = sEnd - 0.008;                  // the head atlas equals the body atlas from sB2 on (cross-faded in generateHeadTextures)
  const Hh = headTex.albedo.width, Hv = headTex.albedo.height;
  const res = {};
  for (const key of ['albedo', 'normal', 'orm']) {
    const B = bodyTex[key], Hd = headTex[key], Wb = B.width, Hb = B.height;
    const xEnd = Math.floor((sB2 - 0.0) * (Wb - 1));
    const fx = Wb / Hh * 0 + (sSpan / 1) * (Wb - 1) / (Hh - 1), fy = (Hv - 1) / (Hb - 1);          // head texels per body texel (x: s-span ratio, y)
    const sx = 3, sy = 2, tmp = new Float64Array(4);
    for (let yb = 0; yb < Hb - 1; yb++) {
      for (let xb = 0; xb <= xEnd + 1; xb++) {
        const s0 = xb / (Wb - 1);
        const w = 1 - sstep(sB2 - feather, sB2 + 0.0005, s0);
        if (w <= 0) continue;
        let a0 = 0, a1 = 0, a2 = 0;
        for (let q = 0; q < sy; q++) for (let p = 0; p < sx; p++) {
          const s = (xb + (p + 0.5) / sx - 0.5) / (Wb - 1), v = (yb + (q + 0.5) / sy - 0.5) / (Hb - 1);
          const xh = clamp((s + cap) / sSpan, 0, 1) * (Hh - 1), yh = (((v % 1) + 1) % 1) * (Hv - 1);
          const x0 = Math.min(Math.floor(xh), Hh - 2), y0 = Math.min(Math.floor(yh), Hv - 2), ffx = xh - x0, ffy = yh - y0;
          for (let c = 0; c < 3; c++) {
            const g = (xx, yy) => Hd.data[(yy * Hh + xx) * 4 + c];
            let val = (g(x0, y0) * (1 - ffx) + g(x0 + 1, y0) * ffx) * (1 - ffy) + (g(x0, y0 + 1) * (1 - ffx) + g(x0 + 1, y0 + 1) * ffx) * ffy;
            if (key === 'albedo') val = SRGB_DEC[Math.round(val)]; else if (key === 'normal') val = val / 255 * 2 - 1; else val /= 255;
            tmp[c] = c === 0 ? (a0 += val) : c === 1 ? (a1 += val) : (a2 += val);
          }
        }
        let m0 = a0 / (sx * sy), m1 = a1 / (sx * sy), m2 = a2 / (sx * sy);
        const o4 = (yb * Wb + xb) * 4;
        if (key === 'albedo') { m0 = toByte(m0); m1 = toByte(m1); m2 = toByte(m2); }
        else if (key === 'normal') { const l = Math.hypot(m0, m1, m2) || 1; m0 = (m0 / l * 0.5 + 0.5) * 255; m1 = (m1 / l * 0.5 + 0.5) * 255; m2 = (m2 / l * 0.5 + 0.5) * 255; }
        else { m0 *= 255; m1 *= 255; m2 *= 255; }
        B.data[o4] = Math.round(B.data[o4] + (m0 - B.data[o4]) * w); B.data[o4 + 1] = Math.round(B.data[o4 + 1] + (m1 - B.data[o4 + 1]) * w); B.data[o4 + 2] = Math.round(B.data[o4 + 2] + (m2 - B.data[o4 + 2]) * w);
      }
    }
    for (let i = 0; i < Wb * 4; i++) B.data[(Hb - 1) * Wb * 4 + i] = B.data[i];       // wrap row
    res[key] = true;
  }
  return res;
}
