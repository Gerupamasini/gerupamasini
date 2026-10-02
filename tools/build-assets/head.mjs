// Spec-driven head sculpt for the Yamame loft.  Pure data, no three.js.
//
// The head is described in "chord coordinates" measured on photographs: origin = snout tip, u along the chord snout tip -> rear-most point of the
// gill-cover margin (HL = 1), v perpendicular, dorsal = +.  See docs/yamame/photo_analysis/head_profile_stats.json for the measured statistics and
// assets/src/head_adult.json for the adopted numbers.
//
//   applyHead(params, spec)  -> new params with the head silhouette / section stations / eye / mouth / operculum fields filled in
//   createHead(surface, params, spec) -> { displacement(s, alpha, ctx), mouthLineHeight(s), lateral(s, alpha), landmarks(), regions(u, v, nz) , ... }
//
// Features are 2-D shapes on the lateral face (u, v) multiplied by a lateral mask (outward normal pointing sideways), displaced along the surface normal.
// Everything is deterministic.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- 2-D helpers --------------------------------------------------------------------------------------------------
/** piecewise-linear v(u) through points sorted by u */
export function polyV(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const t = (u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1); return lerp(pts[i - 1][1], pts[i][1], t); }
  return pts[pts.length - 1][1];
}
/** smooth (Catmull-Rom) v(u) through points sorted by u */
export function splineV(pts, u) {
  const n = pts.length; if (u <= pts[0][0]) return pts[0][1]; if (u >= pts[n - 1][0]) return pts[n - 1][1];
  let i = 1; while (u > pts[i][0]) i++;
  const p0 = pts[Math.max(i - 2, 0)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(i + 1, n - 1)];
  const t = (u - p1[0]) / (p2[0] - p1[0] || 1);
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1) * (p2[0] - p1[0]), m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1) * (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
/** distance from (u,v) to a polyline given as [[u,v],...]; also returns the parameter along it (0..1 of total length) */
export function distPolyline(pts, u, v) {
  let best = 1e9, bestT = 0, acc = 0, total = 0;
  const lens = []; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
    const t = clamp(((u - ax) * dx + (v - ay) * dy) / l2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(u - px, v - py);
    if (d < best) { best = d; bestT = (acc + t * lens[i - 1]) / (total || 1); }
    acc += lens[i - 1];
  }
  return { d: best, t: bestT };
}
/** signed distance to a closed polygon (inside > 0) */
export function sdPolygon(poly, u, v) {
  let inside = false, best = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy || 1e-12, t = clamp(((u - xi) * dx + (v - yi) * dy) / l2, 0, 1);
    best = Math.min(best, Math.hypot(u - (xi + dx * t), v - (yi + dy * t)));
  }
  return inside ? best : -best;
}
const gauss = (x, w) => Math.exp(-(x / w) * (x / w));
const GEO_MIN = 0.03, GEO_LIP = 0.009;       // narrowest feature (in HL) the loft grid is asked to carry

// ---- applying the spec to the parameter set --------------------------------------------------------------------------
/**
 * Fill the head part of `params` from a head spec.  Returns a deep copy.
 * spec.stations: [{u, top, bot, ywf, nT, nB, wd}]  (u, top, bot in HL units; top/bot = heights above the snout-tip height, dorsal +)
 */
export function applyHead(params, spec) {
  const p = structuredClone(params); const HL = spec.HL_over_SL, y0 = spec.tip_y_over_sl ?? 0;
  const st = spec.stations, cap = spec.cap_over_sl ?? 0.004;
  p.head_length_over_sl = { v: HL, prov: 'P', src: 'head_adult.json' };
  p.cap_length_over_sl = { v: cap, prov: 'E', note: 'closure of the snout tip only' };
  const sil = p.silhouette, bodyDorsal = (s) => interpTable(sil.s, sil.dorsal, s), bodyVentral = (s) => interpTable(sil.s, sil.ventral, s);
  const col = (key) => st.map((q) => [q.u, q[key] ?? (key === 'ywf' ? 0.5 : 0)]);
  const top = col('top'), bot = col('bot'), ywf = col('ywf'), nT = st.map((q) => [q.u, q.nT ?? 2.2]), nB = st.map((q) => [q.u, q.nB ?? 2.0]), wdS = st.map((q) => [q.u, q.wd ?? 0.55]);
  // fit-to-body: head heights are measured relative to HL; the body table is the authority at the junction, so they are scaled (from u = 0.35, full effect at u = 1) to meet it
  const lo = spec.fit_min ?? 0.85, hi = spec.fit_max ?? 1.3;
  const fTop = clamp((bodyDorsal(HL - cap) - y0) / Math.max(splineV(top, 1) * HL, 1e-6), lo, hi), fBot = clamp((bodyVentral(HL - cap) - y0) / Math.min(splineV(bot, 1) * HL, -1e-6), lo, hi);
  const fit = (u, f) => 1 + (f - 1) * smooth(0.35, 1.0, u);
  const blendLen = spec.blend_len_over_sl ?? 0.09, sEnd = HL - cap;                    // end of the head (opercle rear) in s
  const step = 0.004, sNew = [], dNew = [], vNew = [], wdNew = [], ywNew = [], nTNew = [], nBNew = [];
  const sMax = sEnd + blendLen;
  const headD = (s) => { const uu = clamp((s + cap) / HL, 0, 1); return y0 + splineV(top, uu) * HL * fit(uu, fTop); };
  const headV = (s) => { const uu = clamp((s + cap) / HL, 0, 1); return y0 + splineV(bot, uu) * HL * fit(uu, fBot); };
  // cubic Hermite from the head end (value + slope) to the body table (value + slope): no nape hump / step at the junction
  const hermite = (f0, m0, f1, m1, t, L) => { const t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * f0 + (t3 - 2 * t2 + t) * L * m0 + (-2 * t3 + 3 * t2) * f1 + (t3 - t2) * L * m1; };
  const eps = 0.006, slope = (f, s) => (f(s + eps) - f(s - eps)) / (2 * eps);
  const dE = headD(sEnd), vE = headV(sEnd), mdE = (headD(sEnd) - headD(sEnd - 0.02)) / 0.02, mvE = (headV(sEnd) - headV(sEnd - 0.02)) / 0.02;
  const dB = bodyDorsal(sMax), vB = bodyVentral(sMax), mdB = slope(bodyDorsal, sMax), mvB = slope(bodyVentral, sMax);
  for (let k = 0; ; k++) {
    const s = Math.min(k * step, sMax); const u = (s + cap) / HL, uu = clamp(u, 0, 1);
    const t = clamp((s - sEnd) / blendLen, 0, 1), w = t * t * (3 - 2 * t);
    if (s <= sEnd) { sNew.push(s); dNew.push(headD(s)); vNew.push(headV(s)); }
    else { sNew.push(s); dNew.push(hermite(dE, mdE, dB, mdB, t, blendLen)); vNew.push(hermite(vE, mvE, vB, mvB, t, blendLen)); }
    ywNew.push(lerp(splineV(ywf, uu), 0.5, w)); nTNew.push(lerp(splineV(nT, uu), p.section.exponent_dorsal.v, w)); nBNew.push(lerp(splineV(nB, uu), p.section.exponent_ventral.v, w));
    wdNew.push(lerp(splineV(wdS, uu), interpTable(p.section.width_over_depth_by_s.s, p.section.width_over_depth_by_s.v, s), w));
    if (s >= sMax) break;
  }
  const sBody = sil.s.filter((s) => s > sMax + 1e-9);
  p.silhouette = { ...sil, s: [...sNew, ...sBody], dorsal: [...dNew, ...sBody.map(bodyDorsal)], ventral: [...vNew, ...sBody.map(bodyVentral)] };
  p.section.stations = { s: sNew, yw: ywNew, nT: nTNew, nB: nBNew, wd: wdNew, s_end: sMax };
  // landmarks the other modules read from `params`
  if (spec.mouth?.corner) p.mouth.corner_s = { v: spec.mouth.corner[0] * HL - cap, prov: 'P', src: 'head_adult.json' };
  if (spec.eye) { p.eye.center_s = { v: spec.eye.u * HL - cap, prov: 'P', src: 'head_adult.json' }; p.eye.outer_d_over_sl = { v: spec.eye.d_over_hl * HL, prov: 'P', src: 'head_adult.json' }; }
  if (spec.opercle) { const um = Math.max(...spec.opercle.margin.map((q) => q[0])); p.operculum.edge_s = { v: um * HL - cap, prov: 'P', src: 'head_adult.json' }; }
  if (spec.pectoral_base_u && p.fins?.pectoral) p.fins.pectoral = { ...p.fins.pectoral, origin_s: spec.pectoral_base_u * HL - cap };
  p.head_fit = { top: fTop, bottom: fBot };
  return p;
}
/** after createSurface(params): make the legacy eye parameter (height fraction) agree with the eye centre of the spec */
export function syncEyeParams(surface, params, spec) {
  if (!spec.eye) return params;
  const SL = surface.SL, HL = spec.HL_over_SL, y = ((spec.tip_y_over_sl ?? 0) + spec.eye.v * HL), s = spec.eye.u * HL - surface.cap;      // SL units
  const sec = surface.section(s); const hf = 0.5 * (1 - (y - sec.c) / sec.h);
  params.eye.center_height_frac_from_top = { v: clamp(hf, 0.05, 0.95), prov: 'P', src: 'head_adult.json' };
  return params;
}
function interpTable(xs, ys, x) {
  if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return lerp(ys[i - 1], ys[i], t); } return ys[ys.length - 1];
}
function interpStations(st, key, u) {
  if (u <= st[0].u) return st[0][key]; for (let i = 1; i < st.length; i++) if (u <= st[i].u) { const t = (u - st[i - 1].u) / (st[i].u - st[i - 1].u); return lerp(st[i - 1][key], st[i][key], t); } return st[st.length - 1][key];
}


/** Catmull-Rom densification of the spec polylines whose u is a function of v (opercle margin, preopercle line) and v a function of u (mouth line):
 *  the hand-placed control points would otherwise leave visible kinks in the relief, the weights and the painted lines. Returns a deep copy. */
function smoothSpec(spec0, n = 26) {
  const spec = structuredClone(spec0);
  const byV = (pts) => {                                              // pts top -> bottom (v decreasing); resample u(v)
    const asc = pts.map(([u, v]) => [v, u]).reverse(); const out = [];
    for (let i = 0; i < n; i++) { const v = asc[asc.length - 1][0] - (asc[asc.length - 1][0] - asc[0][0]) * (i / (n - 1)); out.push([splineV(asc, v), v]); }
    return out;
  };
  if (spec.opercle?.margin?.length >= 3) spec.opercle.margin = byV(spec.opercle.margin);
  if (spec.preopercle?.line?.length >= 3) spec.preopercle.line = byV(spec.preopercle.line);
  if (spec.mouth?.line?.length >= 3) { const l = spec.mouth.line, out = []; for (let i = 0; i < n; i++) { const u = l[0][0] + (l[l.length - 1][0] - l[0][0]) * (i / (n - 1)); out.push([u, splineV(l, u)]); } spec.mouth.line = out; }
  return spec;
}

// ---- the head object used by the loft ---------------------------------------------------------------------------------
import { socketDisplacement } from './eyes.mjs';

/**
 * createHead(surface, params, spec): features and landmark queries in chord coordinates.
 * u = (s_tip_x - x)/HL, v = (y - y_tip)/HL where the tip is the foremost point of the snout (x of s = -cap).
 */
export function createHead(surface, params, spec0) {
  const spec = smoothSpec(spec0);
  const SL = surface.SL, HLs = spec.HL_over_SL, HLm = HLs * SL, y0 = (spec.tip_y_over_sl ?? 0) * SL;
  const tipX = surface.sToX(-surface.cap);                       // snout tip
  const toUV = (x, y) => [(tipX - x) / HLm, (y - y0) / HLm];
  const fromUV = (u, v) => [tipX - u * HLm, y0 + v * HLm];
  const mouth = spec.mouth || {};
  const line = mouth.line || null;                               // tip -> corner [[u,v]...]
  const corner = mouth.corner || (line ? line[line.length - 1] : null);
  /** mouth-line height (SL units) at body position s; beyond the corner it relaxes to the section-relative height so the column stays well-behaved */
  function mouthLineHeight(s) {
    if (!line) return null;
    const u = (s + surface.cap) / HLs;
    const uc = corner[0];
    if (u <= uc) return (y0 + polyV(line, u) * HLm) / SL;
    const secC = surface.section(s); const yCorner = (y0 + corner[1] * HLm) / SL;
    const w = smooth(uc, uc + 0.18, u);
    return lerp(yCorner, secC.c - 0.25 * secC.h, w);
  }
  // eye ---------------------------------------------------------------------------------------------------------------------
  const eye = spec.eye || null;
  // lateral face mask from the outward normal
  const NZ = (n) => Math.abs(n[2]);

  /** displacement (metres, outward) at a vertex.  ctx: { p: unoffset surface point [x,y,z], n: unit normal, fine?: boolean }
   *  Geometry (fine = false) is band-limited: every feature is at least GEO_MIN HL wide so the loft grid resolves it without aliasing.
   *  The texture painter evaluates fine = true; (fine - geometry) is the residual that belongs in the normal map. */
  function displacement(s, alpha, ctx) {
    const p = ctx.p, n = ctx.n, fine = !!ctx.fine;
    const W = (w) => (fine ? w : Math.max(w, GEO_MIN));
    const [u, v] = toUV(p[0], p[1]);
    const lat = smooth(0.30, 0.78, NZ(n));                       // lateral face only
    let d = 0;
    // ---- gape: lip ridges along the mouth line -----------------------------------------------------------------------
    if (line && u > -0.05 && u < corner[0] + 0.03) {
      const vl = polyV(line, clamp(u, line[0][0], line[line.length - 1][0]));
      const dv = v - vl;                                         // + = above the gape line (upper lip / maxilla side)
      const fade = smooth(corner[0] + 0.03, corner[0] - 0.04, u) * smooth(0.0, 0.10, u);      // lips fade out towards the very tip, where the cap rings are thinner than the crease is deep
      const mm = (mouth.lip_ridge_mm ?? 0.18) * 1e-3, WL = (w) => (fine ? w : Math.max(w, GEO_LIP));   // the loft clusters its columns at the mouth line, so lips can be narrower than other features
      d += mm * 1.5 * gauss(dv - 0.021, WL(0.014)) * fade * lat;      // upper lip pad (rolled lip)
      d += mm * 1.1 * gauss(dv + 0.019, WL(0.013)) * fade * lat;      // lower lip pad
      d -= mm * 1.1 * gauss(dv, WL(0.0035)) * fade * lat;             // the gape crease itself
    }
    // ---- maxilla plate -------------------------------------------------------------------------------------------------
    if (spec.maxilla) {
      const sd = sdPolygon(spec.maxilla.outline, u, v), e = W(spec.maxilla.edge ?? 0.014);
      d += (spec.maxilla.height_mm ?? 0.35) * 1e-3 * smooth(-e, e, sd) * lat * smooth(0.0, 0.16, u);
      d -= (spec.maxilla.groove_mm ?? 0.10) * 1e-3 * gauss(sd, e * 0.8) * lat;                  // groove along the plate's border
    }
    // ---- dentary (lower jaw) -------------------------------------------------------------------------------------------
    if (spec.dentary) {
      const sd = sdPolygon(spec.dentary.outline, u, v), e = W(spec.dentary.edge ?? 0.014);
      d += (spec.dentary.height_mm ?? 0.25) * 1e-3 * smooth(-e, e, sd) * lat * smooth(0.0, 0.16, u);
      if (spec.dentary.suture) { const r = distPolyline(spec.dentary.suture, u, v); d -= (spec.dentary.suture_mm ?? 0.10) * 1e-3 * gauss(r.d, W(0.006)) * lat; }
    }
    // ---- cheek (suborbital) bulge ----------------------------------------------------------------------------------------
    if (spec.cheek) {
      const c = spec.cheek, q = ((u - c.c[0]) / c.r[0]) ** 2 + ((v - c.c[1]) / c.r[1]) ** 2;
      d += (c.height_mm ?? 0.35) * 1e-3 * Math.exp(-q) * lat;
    }
    // ---- preopercle line ------------------------------------------------------------------------------------------------
    if (spec.preopercle) {
      const r = distPolyline(spec.preopercle.line, u, v);
      d -= (spec.preopercle.groove_mm ?? 0.14) * 1e-3 * gauss(r.d, W(spec.preopercle.width ?? 0.007)) * lat;
    }
    // ---- opercle plate and its free margin -------------------------------------------------------------------------------
    if (spec.opercle) {
      const o = spec.opercle, m = o.margin, vTop = m[0][1], vBot = m[m.length - 1][1];
      const vv = clamp(v, vBot, vTop), um = polyUofV(m, vv);                                    // margin position at this height
      const du = u - um;                                                                         // < 0 in front of (on) the plate, > 0 on the body behind
      const inside = smooth(vBot - 0.03, vBot + 0.02, v) * smooth(vTop + 0.03, vTop - 0.02, v);  // margin only spans its own height range
      const plate = (o.plate_mm ?? 0.5) * 1e-3, w = W(o.edge ?? 0.010);
      const pf = spec.preopercle?.line;                                                          // the plate begins at the preopercle line
      const front = pf ? smooth(polyUofV(pf, clamp(v, pf[pf.length - 1][1], pf[0][1])) - w * 1.2, polyUofV(pf, clamp(v, pf[pf.length - 1][1], pf[0][1])) + w * 1.2, u) : 1;
      d += plate * front * (1 - smooth(-w, w * 0.5, du)) * inside * lat;                         // plate sits proud of the body, between preopercle line and free margin
      d += (o.rim_mm ?? 0.14) * 1e-3 * gauss(du + w * 0.55, w * 0.55) * inside * lat;           // thin raised rim
      d -= (o.shadow_mm ?? 0.16) * 1e-3 * gauss(du - w * 0.9, w * 0.7) * inside * lat;           // groove under the free edge (body tucks under)
    }
    // ---- nostrils ---------------------------------------------------------------------------------------------------------
    if (spec.nostrils) {
      const a = spec.nostrils.anterior, b = spec.nostrils.posterior;
      if (a) { const r = Math.hypot((u - a[0]) * HLm, (v - a[1]) * HLm), R = Math.max(spec.nostrils.radius_mm ?? 0.85, fine ? 0 : GEO_MIN * HLm * 1e3 * 0.8) * 1e-3; if (r < R * 2.4) { d -= (spec.nostrils.depth_mm ?? 0.5) * 1e-3 * Math.max(0, 1 - (r / R) ** 2) ** 2; d += 0.25e-3 * gauss(r - R * 1.3, R * 0.35) * smooth(-0.2, 0.6, (u - a[0]) * 20); } }
      if (b) { const du = (u - b[0]) * HLm, dv = (v - b[1]) * HLm, R = Math.max(spec.nostrils.radius_mm ?? 0.85, fine ? 0 : GEO_MIN * HLm * 1e3 * 0.8) * 1e-3 * 0.8; const r = Math.hypot(du / 1.5, dv); if (r < R * 2.2) d -= (spec.nostrils.depth_mm ?? 0.5) * 1e-3 * 0.8 * Math.max(0, 1 - (r / R) ** 2) ** 2; }
    }
    // ---- orbit: socket + rim around the eyeball (shared constants with eyes.mjs) ------------------------------------------------
    if (eye && ctx.eyeCenters) for (const c of ctx.eyeCenters) {
      const rr = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      if (rr < ctx.eyeRo * 3.2) d += socketDisplacement(rr, ctx.eyeRo);
    }
    // ---- branchiostegal rays on the throat -----------------------------------------------------------------------------------
    if (spec.branchiostegal && fine) {                                                          // too fine for the loft grid: normal map only
      const b = spec.branchiostegal, vent = smooth(0.35, 0.85, -n[1]);
      const du = u - b.apex_u, dz = p[2] / HLm;
      if (vent > 0 && du > 0.02) {
        const th = Math.atan2(Math.abs(dz), du), pitch = b.pitch ?? 0.07;                       // rays fan out from the hyoid symphysis
        const ridge = 0.5 + 0.5 * Math.cos((th / pitch) * TAU);
        d += (b.height_mm ?? 0.12) * 1e-3 * ridge * vent * smooth(b.apex_u + 0.02, b.apex_u + 0.1, u) * smooth(b.end_u ?? 1.0, (b.end_u ?? 1.0) - 0.12, u) * smooth(0.55, 0.15, th);
      }
    }
    return d * smooth(0.0, 0.045, u);                              // the cap rings at the tip are thinner than any feature: no relief there
  }

  /** skin-weight masks from the chord coordinates of a vertex (x, y metres) and its body angle alpha */
  const flank = (alpha) => { const aa = alpha <= Math.PI ? alpha : TAU - alpha; return smooth(0.45, 0.85, aa) * (1 - smooth(2.35, 2.75, aa)); };
  function opercleWeight(x, y, alpha) {
    if (!spec.opercle) return 0;
    const [u, v] = toUV(x, y), m = spec.opercle.margin, pf = spec.preopercle?.line, vTop = m[0][1], vBot = m[m.length - 1][1];
    if (v > vTop + 0.03 || v < vBot - 0.03) return 0;
    const um = polyUofV(m, clamp(v, vBot, vTop)), uf = pf ? polyUofV(pf, clamp(v, pf[pf.length - 1][1], pf[0][1])) : um - 0.2;
    const inV = smooth(vBot - 0.03, vBot + 0.015, v) * smooth(vTop + 0.03, vTop - 0.015, v);
    return smooth(uf, um - 0.015, u) * (1 - smooth(um + 0.0, um + 0.05, u)) * inV * flank(alpha) * 0.9;     // plate: 0 at the preopercle hinge line .. 1 at the free margin
  }
  function maxillaWeight(x, y, alpha) {
    if (!spec.maxilla) return 0;
    const [u, v] = toUV(x, y), sd = sdPolygon(spec.maxilla.outline, u, v);
    return smooth(0.12, corner[0], u) * smooth(-0.01, 0.02, sd) * smooth(0.45, 0.85, alpha <= Math.PI ? alpha : TAU - alpha) * (1 - smooth(2.0, 2.4, alpha <= Math.PI ? alpha : TAU - alpha));
  }

  function landmarks() {
    const out = {};
    out.snout_tip = [tipX, y0];
    if (line) out.mouth_corner = fromUV(corner[0], corner[1]);
    if (eye) out.eye_center = fromUV(eye.u, eye.v);
    if (spec.opercle) { const m = spec.opercle.margin; let best = m[0]; for (const q of m) if (q[0] > best[0]) best = q; out.opercle_post_mid = fromUV(best[0], best[1]); out.opercle_top = fromUV(m[0][0], m[0][1]); out.opercle_bottom = fromUV(m[m.length - 1][0], m[m.length - 1][1]); }
    if (spec.nostrils?.anterior) out.nostril = fromUV(...spec.nostrils.anterior);
    return out;
  }

  /** 3-D positions (metres, right side) of the named photo landmarks: chord coordinates -> point on the skin (relief ignored, eye rim at the eye radius) */
  function landmarks3d() {
    const out = {}, at = (u, v, off = 0) => { const s = u * HLs - surface.cap, a = surface.alphaAtHeight(s, y0 + v * HLm); return surface.point(s, a, off); };
    out.snout_tip = [tipX, y0, 0];
    if (line) { out.mouth_corner = at(corner[0], corner[1]); out.lower_jaw_tip = at(0.0, polyV(line, 0.0) - 0.06); }
    if (spec.maxilla) { const o = spec.maxilla.outline; let b = o[0]; for (const q of o) if (q[0] > b[0]) b = q; out.maxilla_post_end = at(b[0], b[1]); }
    if (spec.nostrils?.anterior) out.nostril = at(spec.nostrils.anterior[0], spec.nostrils.anterior[1]);
    if (eye) {
      const ro = (eye.d_over_hl * 0.8) / 2;                                                   // visible aperture radius (HL)
      out.eye_center = at(eye.u, eye.v, 0.0012);
      out.eye_ant = at(eye.u - ro, eye.v, 0.0006); out.eye_post = at(eye.u + ro, eye.v, 0.0006); out.eye_top = at(eye.u, eye.v + ro, 0.0006); out.eye_bottom = at(eye.u, eye.v - ro, 0.0006);
    }
    if (spec.opercle) { const m = spec.opercle.margin; let b = m[0]; for (const q of m) if (q[0] > b[0]) b = q; out.opercle_post_mid = at(b[0], b[1]); out.opercle_top = at(m[0][0], m[0][1]); out.opercle_bottom = at(m[m.length - 1][0], m[m.length - 1][1]); }
    if (spec.preopercle) { const l = spec.preopercle.line; out.preopercle_top = at(l[0][0], l[0][1]); out.preopercle_mid = at(l[Math.floor(l.length / 2)][0], l[Math.floor(l.length / 2)][1]); out.preopercle_bottom = at(l[l.length - 1][0], l[l.length - 1][1]); }
    return out;
  }
  return { HLm, HLs, y0, tipX, toUV, fromUV, displacement, landmarks3d, mouthLineHeight, landmarks, opercleWeight, maxillaWeight, corner, line, eye, spec };
}

/** margin polyline given top -> bottom as [[u,v]...] with v decreasing: u at height v */
function polyUofV(m, v) {
  if (v >= m[0][1]) return m[0][0];
  for (let i = 1; i < m.length; i++) if (v >= m[i][1]) { const t = (v - m[i - 1][1]) / (m[i][1] - m[i - 1][1] || -1e-9); return lerp(m[i - 1][0], m[i][0], t); }
  return m[m.length - 1][0];
}
