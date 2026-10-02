// Parametric rest-pose body surface of the Yamame (no mesh, no three.js).
// Coordinates: metres. +X forward (snout), +Y up, +Z right. Body-local origin at s = s_origin.
//   s     : body position along SL, 0 = snout tip (upper jaw), 1 = caudal base. Negative s (down to -cap) is the rounded snout cap.
//   alpha : angle around the body axis, 0 = dorsal midline, PI/2 = right flank (+Z), PI = ventral midline, 3PI/2 = left flank.
// Browser-safe: Node built-ins are only touched inside loadParams() (Node >= 22.3 getBuiltinModule).
export function loadParams(file = new URL('../../assets/src/params.json', import.meta.url)) {
  const fs = process.getBuiltinModule('node:fs');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// monotone cubic (Fritsch–Carlson) interpolation on a table
function makeInterp(xs, ys) {
  const n = xs.length; const d = []; const m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i]; const h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a / h) * d[i]; m[i + 1] = (3 * b / h) * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i]; const t = (x - xs[i]) / h; const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

export function createSurface(params, overrides = {}) {
  if (!params) params = loadParams();
  const SL = overrides.sl_m ?? params.sl_m.v;
  const s0 = params.s_origin.v;
  const cap = params.cap_length_over_sl.v;
  const sil = params.silhouette;
  const dDorsal = makeInterp(sil.s, sil.dorsal);
  const dVentral = makeInterp(sil.s, sil.ventral);
  const wd = makeInterp(params.section.width_over_depth_by_s.s, params.section.width_over_depth_by_s.v);
  const nD = params.section.exponent_dorsal.v, nV = params.section.exponent_ventral.v;
  const depthScale = overrides.depth_scale ?? 1;       // individual variation hooks
  const widthScale = overrides.width_scale ?? 1;

  const sToX = (s) => (s0 - s) * SL;
  const xToS = (x) => s0 - x / SL;

  // section parameters at s >= 0 (SL fractions)
  function section(s) {
    const sc = Math.min(Math.max(s, 0), 1);
    const top = dDorsal(sc) * depthScale * (overrides.dorsal_mul ? overrides.dorsal_mul(sc) : 1), bot = dVentral(sc) * depthScale * (overrides.ventral_mul ? overrides.ventral_mul(sc) : 1);   // morph hooks (05 §5.1.3)
    const c = (top + bot) / 2, h = (top - bot) / 2;
    // caudal peduncle is laterally compressed into the fin base: width falls to w_end x normal over the last ~7 % of SL (so the open end is a thin vertical edge that the caudal fin root covers) [E]
    const tt = params.section.tail_taper || { s0: 0.93, w_end: 0.12 }; const tp = Math.min(1, Math.max(0, (sc - tt.s0) / (1 - tt.s0)));
    const w = h * wd(sc) * widthScale * (1 - (1 - tt.w_end) * tp * tp * (3 - 2 * tp));
    return { c, h, w };
  }

  // point on the skin. 'offset' pushes outwards along the (approximate) section normal (metres).
  function point(s, alpha, offset = 0) {
    let scale = 1, sx = s;
    if (s < 0) { const t = Math.min(-s / cap, 1); scale = Math.sqrt(Math.max(1 - t * t, 0)); sx = s; }
    const sec = section(Math.max(s, 0));
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const n = ca >= 0 ? nD : nV;
    // superellipse: y spans dorsal/ventral extents, z spans width
    const yy = sec.c + sec.h * scale * sgnPow(ca, 2 / n);
    const cc = sec.c;
    const y = cc + (yy - cc) ;
    const z = sec.w * scale * sgnPow(sa, 2 / n);
    let X = sToX(Math.max(s, -cap)) , Y = y * SL, Z = z * SL;
    if (s < 0) X = sToX(0) + (-s) * SL;   // cap bulges forward (x increases as s decreases)
    if (offset !== 0) {
      const nn = normal(s, alpha); X += nn[0] * offset; Y += nn[1] * offset; Z += nn[2] * offset;
    }
    return [X, Y, Z];
  }

  function normal(s, alpha) {
    const ds = 1e-4, da = 1e-3;
    const p = (ss, aa) => {
      // un-offset point
      let scale = 1; if (ss < 0) { const t = Math.min(-ss / cap, 1); scale = Math.sqrt(Math.max(1 - t * t, 0)); }
      const sec = section(Math.max(ss, 0)); const ca = Math.cos(aa), sa = Math.sin(aa); const n = ca >= 0 ? nD : nV;
      const y = sec.c + sec.h * scale * sgnPow(ca, 2 / n); const z = sec.w * scale * sgnPow(sa, 2 / n);
      const X = ss < 0 ? sToX(0) + (-ss) * SL : sToX(ss);
      return [X, y * SL, z * SL];
    };
    const a = p(s + ds, alpha), b = p(s - ds, alpha), c = p(s, alpha + da), d = p(s, alpha - da);
    const t1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], t2 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    // outward normal: alpha runs dorsal->right->ventral, s runs snout->tail (x decreasing)
    let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    // orient outward using the radial direction from the section centre
    const pc = p(s, alpha); const sec = section(Math.max(s, 0)); const cy = sec.c * SL;
    const rx = 0, ry = pc[1] - cy, rz = pc[2];
    if (nx * rx + ny * ry + nz * rz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  }

  // find alpha (right side, 0..PI) whose skin height equals y (metres) at section s
  function alphaAtHeight(s, yMetres) {
    const sec = section(s); const c = sec.c * SL, h = sec.h * SL;
    const r = Math.max(-1, Math.min(1, (yMetres - c) / h));
    const n = r >= 0 ? nD : nV;
    // r = sgnPow(cos a, 2/n) => cos a = sgnPow(r, n/2)
    return Math.acos(Math.max(-1, Math.min(1, sgnPow(r, n / 2))));
  }

  return { SL, s0, cap, sToX, xToS, section, point, normal, alphaAtHeight, params, depthScale, widthScale };
}

export { makeInterp };
