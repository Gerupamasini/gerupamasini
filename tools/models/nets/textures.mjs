// Procedural, seamlessly tiling PBR texture sets for the hand nets.
// Every set returns { name, size, tile: [u, v] metres per repeat, albedo (RGB or RGBA), normal (RGB,
// OpenGL +Y), orm (R = occlusion, G = roughness, B = metalness) } as Uint8Arrays, rows top first.
// Heights are kept in metres so normal maps have physically consistent slopes.
import { hash01 } from '../../lib/noise.mjs';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;

/** periodic 2D gradient noise, period (px, py) lattice cells, range ~[-1, 1] */
function pnoise(x, y, px, py, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const g = (cx, cy, dx, dy) => {
    const h = hash01(mod(cx, px), mod(cy, py), 0, seed) * Math.PI * 2;
    return Math.cos(h) * dx + Math.sin(h) * dy;
  };
  const u = fade(fx), v = fade(fy);
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy), c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return (a + u * (b - a) + v * (c - a) + u * v * (a - b - c + d)) * 1.41;
}

/** periodic fBm over normalized coordinates (u, v in [0,1)), base frequency (fx, fy) */
function pfbm(u, v, fx, fy, oct = 4, seed = 0, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * pnoise(u * fx, v * fy, fx, fy, seed + o * 31);
    n += a; a *= gain; fx *= 2; fy *= 2;
  }
  return s / n;
}

/** periodic Worley F1 (distance in cell units) and the cell id */
function pworley(u, v, f, seed = 0) {
  const x = u * f, y = v * f;
  const ix = Math.floor(x), iy = Math.floor(y);
  let best = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const wx = mod(cx, f), wy = mod(cy, f);
    const px = cx + hash01(wx, wy, 1, seed), py = cy + hash01(wx, wy, 2, seed);
    const d = Math.hypot(px - x, py - y);
    if (d < best) { best = d; id = hash01(wx, wy, 3, seed); }
  }
  return { d: best, id };
}

class TexSet {
  constructor(name, size, tile, alpha = false, w = size, h = size) {
    this.name = name; this.w = w; this.h = h; this.size = size; this.tile = tile; this.alpha = alpha;
    this.ch = alpha ? 4 : 3;
    this.albedo = new Uint8Array(w * h * this.ch);
    this.height = new Float32Array(w * h);
    this.orm = new Uint8Array(w * h * 3);
  }
  /** fn(u, v, x, y) -> { c: [r,g,b] sRGB 0..1, a?, h: metres, ao, r, m } */
  paint(fn) {
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = fn((x + 0.5) / w, (y + 0.5) / h, x, y);
      const k = y * w + x;
      const o = k * this.ch;
      this.albedo[o] = Math.round(clamp(s.c[0]) * 255);
      this.albedo[o + 1] = Math.round(clamp(s.c[1]) * 255);
      this.albedo[o + 2] = Math.round(clamp(s.c[2]) * 255);
      if (this.alpha) this.albedo[o + 3] = Math.round(clamp(s.a ?? 1) * 255);
      this.height[k] = s.h ?? 0;
      this.orm[k * 3] = Math.round(clamp(s.ao ?? 1) * 255);
      this.orm[k * 3 + 1] = Math.round(clamp(s.r ?? 0.5) * 255);
      this.orm[k * 3 + 2] = Math.round(clamp(s.m ?? 0) * 255);
    }
    return this;
  }
  /** OpenGL-convention normal map from the height field (wrapping), strength multiplies slopes */
  finish(strength = 1) {
    const { w, h } = this;
    const dx = this.tile[0] / w, dy = this.tile[1] / h;
    this.normal = new Uint8Array(w * h * 3);
    const H = (x, y) => this.height[mod(y, h) * w + mod(x, w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Sobel for a smoother derivative
      const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) / (8 * dx);
      const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) / (8 * dy);
      // image rows go down while +Y (green) is up
      let nx = -gx * strength, ny = gy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const o = (y * w + x) * 3;
      this.normal[o] = Math.round((nx / l * 0.5 + 0.5) * 255);
      this.normal[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      this.normal[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
    }
    delete this.height;
    return this;
  }
}

// ---------------------------------------------------------------- metals & coatings

/** brushed / drawn metal (stainless wire, aluminium tube). Grain runs along v (the length). */
export function brushedMetal(size, seed = 1) {
  const T = new TexSet('brushed_metal', size, [0.03, 0.03]);
  // a few long scratches, mostly along the grain
  const scratches = [];
  for (let k = 0; k < 90; k++) scratches.push({ u: hash01(k, 1, 0, seed), v: hash01(k, 2, 0, seed), a: (hash01(k, 3, 0, seed) - 0.5) * 0.5, L: 0.1 + hash01(k, 4, 0, seed) * 0.5, w: 0.0006 + hash01(k, 5, 0, seed) * 0.0012, d: 0.3 + hash01(k, 6, 0, seed) * 0.7 });
  T.paint((u, v) => {
    const streak = pfbm(u, v, 96, 3, 3, seed) * 0.6 + pfbm(u, v, 256, 6, 2, seed + 7) * 0.4;
    let sc = 0;
    for (const s of scratches) {
      // distance to a wrapped segment through (s.u, s.v) with direction (sin a, cos a)
      let du = fract(u - s.u + 0.5) - 0.5, dv = fract(v - s.v + 0.5) - 0.5;
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      const along = du * sa + dv * ca, across = du * ca - dv * sa;
      if (Math.abs(along) > s.L / 2) continue;
      sc = Math.max(sc, s.d * (1 - smooth(0, s.w, Math.abs(across))) * (1 - Math.abs(along) / (s.L / 2)) ** 0.5);
    }
    const blotch = pfbm(u, v, 3, 3, 3, seed + 3);
    const g = 0.8 + streak * 0.03 + blotch * 0.025 + sc * 0.04;
    return { c: [g, g * 1.005, g * 1.01], h: streak * 0.0000025 - sc * 0.000004, ao: 1, r: clamp(0.3 + streak * 0.07 + blotch * 0.05 + sc * 0.12), m: 1 };
  });
  return T.finish(1);
}

/** powder-coated steel: fine orange peel */
export function powderCoat(size, seed = 2) {
  const T = new TexSet('powder_coat', size, [0.04, 0.04]);
  T.paint((u, v) => {
    const peel = pfbm(u, v, 24, 24, 3, seed);
    const fine = pfbm(u, v, 128, 128, 2, seed + 5);
    const g = 0.9 + fine * 0.04;
    return { c: [g, g, g], h: peel * 0.000012 + fine * 0.000002, ao: 1, r: clamp(0.42 + fine * 0.05 + peel * 0.03), m: 0 };
  });
  return T.finish(1);
}

/** carbon fibre 2x2 twill under clear coat; tows along u (weft) and v (warp) */
export function carbonTwill(size, seed = 3) {
  const N = 8; // tows per tile -> 3 mm tows
  const T = new TexSet('carbon_twill', size, [0.024, 0.024]);
  T.paint((u, v) => {
    const x = u * N, y = v * N;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = fract(x), fy = fract(y);
    const warpOver = mod(i + j, 4) < 2; // 2/2 twill
    // tow cross sections (lens shaped) and fibre streaks
    const prof = (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2 * 0.85));
    const warpH = prof(fx), weftH = prof(fy);
    const fibreWarp = pfbm(u, v, N * 40, N * 2, 2, seed);
    const fibreWeft = pfbm(u, v, N * 2, N * 40, 2, seed + 9);
    const h = warpOver ? warpH * 0.00012 + fibreWarp * 0.000006 : weftH * 0.00012 + fibreWeft * 0.000006;
    const tone = warpOver ? 0.035 + fibreWarp * 0.012 : 0.05 + fibreWeft * 0.012;
    const gap = Math.min(warpOver ? fx : fy, 1 - (warpOver ? fx : fy));
    const ao = 0.7 + 0.3 * smooth(0, 0.12, gap);
    return { c: [tone, tone, tone * 1.05], h, ao, r: warpOver ? 0.32 : 0.42, m: 0 };
  });
  return T.finish(1);
}

// ---------------------------------------------------------------- organics & polymers

/** steamed beech, oil finish; grain along v */
export function beechWood(size, seed = 4) {
  const T = new TexSet('beech_wood', size, [0.07, 0.14]);
  T.paint((u, v) => {
    const warp = pfbm(u, v, 3, 1, 4, seed) * 0.45 + pfbm(u, v, 12, 2, 2, seed + 1) * 0.06;
    const ringPhase = u * 14 + warp;
    const ring = fract(ringPhase);
    const late = smooth(0.62, 0.9, ring) * (1 - smooth(0.9, 1.0, ring));
    const fine = pfbm(u, v, 160, 6, 2, seed + 11);
    // medullary ray flecks: short lens shapes along the grain
    const fl = pworley(u * 1, v * 0.25, 40, seed + 2);
    const fleck = (1 - smooth(0.08, 0.2, fl.d)) * (fl.id > 0.55 ? 1 : 0);
    const pores = Math.max(0, pfbm(u, v, 220, 20, 1, seed + 21) - 0.45) * 2;
    let r = 0.79, g = 0.6, b = 0.43;
    const dk = late * 0.11 + fleck * 0.12 + pores * 0.12 - fine * 0.03 + warp * 0.025;
    r -= dk * 0.9; g -= dk; b -= dk * 1.05;
    // flecks lean red-brown
    r += fleck * 0.03;
    return { c: [r, g, b], h: -late * 0.000012 - pores * 0.00002 + fleck * 0.000006 + fine * 0.000003, ao: 1 - pores * 0.15, r: clamp(0.5 + late * 0.08 + pores * 0.15 - fleck * 0.1), m: 0 };
  });
  return T.finish(1);
}

/** closed-cell EVA foam grip */
export function evaFoam(size, seed = 5) {
  const T = new TexSet('eva_foam', size, [0.025, 0.025]);
  T.paint((u, v) => {
    const a = pworley(u, v, 34, seed), b = pworley(u, v, 90, seed + 1);
    const pore = 1 - smooth(0.12, 0.32, a.d);
    const micro = 1 - smooth(0.1, 0.3, b.d);
    const n = pfbm(u, v, 16, 16, 3, seed + 3);
    const g = 0.86 + n * 0.05 - pore * 0.25;
    return { c: [g, g, g], h: -pore * 0.00006 - micro * 0.00001 + n * 0.00001, ao: 1 - pore * 0.45, r: clamp(0.82 + pore * 0.1 - n * 0.04), m: 0 };
  });
  return T.finish(1);
}

/** moulded TPR grip with a diamond knurl */
export function rubberKnurl(size, seed = 6) {
  const T = new TexSet('rubber_knurl', size, [0.012, 0.012]);
  const N = 6;
  T.paint((u, v) => {
    const a = fract((u + v) * N), b = fract((u - v) * N);
    const pyr = 1 - Math.max(Math.abs(a - 0.5), Math.abs(b - 0.5)) * 2; // 0 at grooves, 1 at peaks
    const top = smooth(0.0, 0.5, pyr);
    const n = pfbm(u, v, 64, 64, 2, seed);
    const g = 0.9 + n * 0.04 + top * 0.05;
    return { c: [g, g, g], h: top * 0.00035 + n * 0.000004, ao: 0.55 + top * 0.45, r: clamp(0.72 - top * 0.12 + n * 0.04), m: 0 };
  });
  return T.finish(1);
}

/** smooth moulded rubber / vinyl end cap, light grain */
export function plasticGrain(size, seed = 7) {
  const T = new TexSet('plastic_grain', size, [0.02, 0.02]);
  T.paint((u, v) => {
    const n = pfbm(u, v, 48, 48, 3, seed);
    const g = 0.9 + n * 0.03;
    return { c: [g, g, g], h: n * 0.000008, ao: 1, r: clamp(0.55 + n * 0.08), m: 0 };
  });
  return T.finish(1);
}

/** heavy cotton duck canvas, plain weave */
export function canvasDuck(size, seed = 8) {
  const N = 24;
  const T = new TexSet('canvas_duck', size, [0.012, 0.012]);
  T.paint((u, v) => {
    const x = u * N, y = v * N;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = fract(x), fy = fract(y);
    const warpOver = (i + j) % 2 === 0;
    const slubW = pfbm(u, v, N, 3, 2, seed) * 0.25, slubF = pfbm(u, v, 3, N, 2, seed + 4) * 0.25;
    const pw = Math.sqrt(Math.max(0, 1 - (2 * fx - 1) ** 2)) * (1 + slubW);
    const pf = Math.sqrt(Math.max(0, 1 - (2 * fy - 1) ** 2)) * (1 + slubF);
    const arch = (t) => Math.sin(Math.PI * t);
    const hw = pw * (warpOver ? 0.8 + 0.2 * arch(fy) : 0.45);
    const hf = pf * (!warpOver ? 0.8 + 0.2 * arch(fx) : 0.45);
    const hh = Math.max(hw, hf);
    const fuzz = pfbm(u, v, 200, 200, 2, seed + 9);
    const g = 0.86 + fuzz * 0.05 + (hh - 0.6) * 0.12 + pfbm(u, v, 4, 4, 3, seed + 2) * 0.04;
    return { c: [g, g * 0.985, g * 0.95], h: hh * 0.00018 + fuzz * 0.000008, ao: 0.6 + 0.4 * clamp(hh), r: 0.92, m: 0 };
  });
  return T.finish(1);
}

/** polyester binding tape (twill) */
export function tapeTwill(size, seed = 9) {
  const N = 20;
  const T = new TexSet('tape_twill', size, [0.008, 0.008]);
  T.paint((u, v) => {
    const d = fract((u * N + v * N) / 3);
    const rib = Math.sin(d * Math.PI);
    const fy = fract(v * N), fx = fract(u * N);
    const yarn = Math.sqrt(Math.max(0, 1 - (2 * fy - 1) ** 2)) * 0.5 + Math.sqrt(Math.max(0, 1 - (2 * fx - 1) ** 2)) * 0.5;
    const n = pfbm(u, v, 64, 64, 2, seed);
    const g = 0.9 + n * 0.03 + rib * 0.04;
    return { c: [g, g, g], h: (rib * 0.6 + yarn * 0.4) * 0.00008, ao: 0.75 + rib * 0.25, r: 0.7, m: 0 };
  });
  return T.finish(1);
}

/** three-strand twisted cord / twine, v along the cord, u around it (tile u = circumference) */
export function twistedCord(size, seed = 10) {
  const T = new TexSet('twisted_cord', size, [0.012, 0.012]);
  T.paint((u, v) => {
    const s = fract(u * 3 + v * 3 * 1.2);
    const strand = Math.sin(s * Math.PI);
    const fib = pfbm(u, v, 24, 160, 2, seed) * 0.5 + 0.5;
    const fibre = Math.sin(fract(u * 18 + v * 60) * Math.PI) * 0.3;
    const g = 0.86 + fib * 0.08 + strand * 0.05;
    return { c: [g, g, g], h: strand ** 0.6 * 0.0004 + fibre * 0.00003, ao: 0.55 + 0.45 * strand ** 0.5, r: 0.86, m: 0 };
  });
  return T.finish(1);
}

// ---------------------------------------------------------------- netting (alpha-cut, real-scale)

/** distance from p to segment a-b, plus the parameter t along it */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  return { d: Math.hypot(px - ax - vx * t, py - ay - vy * t), t, L: Math.hypot(vx, vy) };
}

/**
 * Diamond-lattice netting. Nodes sit on staggered rows; each node joins the two nodes of the row
 * above. opts: { n: cells across a tile, aspect: hole height / width, rt: thread radius (cell units),
 * junction: half length of a raschel junction bar (cell units, 0 = knotted), knot: knot radius
 * (cell units, 0 = none), plies: twist ridges, rough, name, physCell (m) }
 */
function diamondNet(size, o, seed) {
  const n = o.n;
  const rows = Math.round(n * 2 * o.aspect) || 2 * n;
  const cw = 1 / n, rh = 1 / rows; // in uv
  const T = new TexSet(o.name, size, [o.physCell * n, o.physCell * n * (rows / (2 * n)) / o.aspect * o.aspect], true);
  // physical tile height = rows * rowpitch with rowpitch = physCell*aspect/2
  T.tile = [o.physCell * n, (o.physCell * o.aspect / 2) * rows];
  const px2uv = 1 / size;
  const rtU = o.rt * cw; // thread radius in u units (assumes square texels map to physical aspect)
  const sy = T.tile[1] / T.tile[0]; // v units are stretched by sy relative to u in physical space
  const physPerU = T.tile[0];
  T.paint((u, v) => {
    // work in "u-units" where both axes are physically isotropic: Y = v * sy
    const Y = v * sy;
    const row = Math.floor(v * rows);
    let best = 9, hBest = 0, along = 0, isJ = false, kn = 9;
    for (let rr = row - 1; rr <= row + 1; rr++) {
      const off = mod(rr, 2) ? 0.5 : 0;
      const col = Math.floor(u * n - off);
      for (let cc = col - 1; cc <= col + 1; cc++) {
        const nx = (cc + off + 0.5) * cw, ny = (rr + 0.5) * rh * sy;
        const jl = o.junction * cw;
        // junction bar (vertical)
        if (jl > 0) {
          const s = segDist(u, Y, nx, ny - jl, nx, ny + jl);
          const d = s.d / 1.25;
          if (d < best) { best = d; along = s.t * s.L; isJ = true; }
        }
        if (o.knot > 0) kn = Math.min(kn, Math.hypot((u - nx) / (o.knot * cw * 1.25), (Y - ny) / (o.knot * cw * 0.85)));
        // bars to the two nodes of the next row
        for (const sgn of [-1, 1]) {
          const mx = nx + sgn * cw / 2, my = ny + rh * sy;
          const s = segDist(u, Y, nx, ny + jl, mx, my - jl);
          if (s.d < best) { best = s.d; along = s.t * s.L; isJ = false; }
        }
      }
    }
    const aa = px2uv * 0.9;
    const r = rtU;
    let cov = 1 - smooth(r - aa, r + aa, best);
    const prof = Math.sqrt(Math.max(0, 1 - (best / r) ** 2));
    // ply twist ridges along the thread
    const twist = o.plies ? Math.sin((along / r) * 2.2 + (best / r) * 2.0 + (isJ ? 1.7 : 0)) * 0.5 + 0.5 : 0.5;
    let h = (prof * (0.82 + 0.18 * twist)) * r * physPerU * (isJ ? 1.25 : 1);
    let ao = 0.72 + 0.28 * prof;
    if (o.knot > 0) {
      const kp = Math.sqrt(Math.max(0, 1 - kn * kn));
      if (kn < 1) {
        cov = Math.max(cov, 1 - smooth(1 - aa / (o.knot * cw), 1 + aa / (o.knot * cw), kn));
        const lumps = 0.85 + 0.15 * Math.sin(Math.atan2(Y, u) * 0 + (u * n * 17 + Y * n * 11) * 3.0);
        h = Math.max(h, kp * o.knot * cw * physPerU * 1.1 * lumps);
        ao = Math.min(ao, 0.6 + 0.4 * kp);
      }
    }
    if (o.fuzz) {
      const fz = pfbm(u, v, n * 24, rows * 24 / sy, 1, seed + 5);
      cov = clamp(cov + (best < r * 1.6 ? Math.max(0, fz - 0.35) * 0.6 : 0));
    }
    const tone = 0.9 + pfbm(u, v, n * 2, rows, 2, seed) * 0.05 - (1 - ao) * 0.15;
    return { c: [tone, tone, tone], a: cov, h, ao, r: o.rough + (1 - prof) * 0.05, m: 0 };
  });
  return T.finish(1);
}

/** knotless raschel netting (two-yarn pillar junctions, hexagonal openings) */
export const raschelNet = (size, seed = 11) => diamondNet(size, { name: 'net_raschel', n: 8, aspect: 1.0, rt: 0.066, junction: 0.15, knot: 0, plies: true, fuzz: true, rough: 0.66, physCell: 1 }, seed);
/** knotted twine netting (sheet-bend knots) */
export const knottedNet = (size, seed = 12) => diamondNet(size, { name: 'net_knotted', n: 6, aspect: 1.15, rt: 0.06, junction: 0, knot: 0.16, plies: true, fuzz: true, rough: 0.8, physCell: 1 }, seed);
/** rubber-coated knotless netting: fat, smooth strands */
export const rubberNet = (size, seed = 13) => diamondNet(size, { name: 'net_rubber', n: 8, aspect: 0.95, rt: 0.13, junction: 0.12, knot: 0, plies: false, fuzz: false, rough: 0.34, physCell: 1 }, seed);

/** square plain-weave monofilament gauze (fine-mesh nets) */
export function wovenMesh(size, seed = 14) {
  const N = 16;
  const T = new TexSet('net_woven', size, [N, N], true);
  const rt = 0.13; // filament radius / pitch
  const aa = (1 / size) * N * 0.8;
  T.paint((u, v) => {
    const x = u * N, y = v * N;
    const i = Math.floor(x), j = Math.floor(y);
    const dx = Math.abs(fract(x) - 0.5), dy = Math.abs(fract(y) - 0.5);
    // warp i undulates along y; weft j along x; warp is over at crossings where (i + j) even
    const warpZ = Math.cos(Math.PI * (y - 0.5 - i)) * (i % 2 ? -1 : 1);
    const weftZ = -Math.cos(Math.PI * (x - 0.5 - j)) * (j % 2 ? -1 : 1);
    const pw = Math.sqrt(Math.max(0, 1 - (dx / rt) ** 2));
    const pf = Math.sqrt(Math.max(0, 1 - (dy / rt) ** 2));
    const hw = dx < rt ? pw * rt + warpZ * rt * 0.6 : -9;
    const hf = dy < rt ? pf * rt + weftZ * rt * 0.6 : -9;
    const cov = Math.max(1 - smooth(rt - aa, rt + aa, dx), 1 - smooth(rt - aa, rt + aa, dy));
    const top = Math.max(hw, hf);
    const prof = hw > hf ? pw : pf;
    const tone = 0.93 + pfbm(u, v, 8, 8, 2, seed) * 0.03;
    return { c: [tone, tone, tone * 0.99], a: cov, h: Math.max(top, -rt) * 0.6, ao: 0.7 + 0.3 * clamp(prof), r: 0.38 + (1 - prof) * 0.1, m: 0 };
  });
  return T.finish(1);
}
