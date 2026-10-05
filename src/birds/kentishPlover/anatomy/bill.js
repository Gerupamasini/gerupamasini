// Bill of the Kentish Plover: upper and lower mandible as separate parametric surfaces (keratin rhamphotheca,
// mouth lining, rictal skin). Units mm (Skinned.v converts to metres). Shape from the user's close side photo
// and the catalogue's side views (p012, p022, p035, p010, p001, p023, p003, p006, p008), measured on the
// bill-axis frame (body_shape_spec.md §6 bill, docs/morphology.md §3 bill; scratchpad bill/ref).
//
// Frame: origin BILL.base (hidden 4–5 mm inside the feathering), `a` along the bill toward the tip, `u` up
// (perpendicular to a), `s` to the bird's left. Stations are measured by xt = distance from the tip along a.
// The commissure (gape line) runs at height c(xt) above the base→tip axis: it bends down over the last 3 mm
// (the hard tip hooks slightly over the lower mandible) and dips toward the rictus near the base; the whole bill
// is lifted so the upper mandible's apex is exactly BILL.tip (the Animator's bill-tip / peck reference).

// Relaxed bind (spec §3, §6, §16): feather line (0, 89.7, 39.6), tip (0, 83.4, 54) — the bill points 23.6° down
// in the bind, 25° with the resting gaze pitch. The mesh starts inside the feathering on the same axis so no seam
// can open at the lores. (Placement unchanged by the 2026-10 bill rebuild.)
export const BILL = { base: [0, 91.5, 35.4], featherLine: [0, 89.7, 39.6], tip: [0, 83.4, 54] };

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const scl = (p, k) => [p[0] * k, p[1] * k, p[2] * k];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const norm = (p) => {
  const l = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};
const sm = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (p, q, t) => p + (q - p) * t;

/** Monotone cubic (Fritsch–Carlson) through knots [[x, y], …]: no overshoot between the measured stations. */
function mono(knots) {
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const al = m[i] / d[i];
    const be = m[i + 1] / d[i];
    const h = al * al + be * be;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * al * d[i];
      m[i + 1] = t * be * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---------------------------------------------------------------- shape (mm, by distance from the tip xt)
// Photo profile (depth across both mandibles, on the bill-axis frame, blur-corrected; exposed culmen L ≈ 15.5):
// 1.4 at 1 mm from the tip, 2.8 at 3 mm, 3.6 at 8 mm, 4.5 at the feather line — a wedge that tapers over the distal
// 40 % and is nearly parallel-sided behind it (no visible waist from the side). The upper mandible carries most
// of the depth: a convex, slightly swollen hard tip (dertrum) over the distal 4–5 mm, a barely sunken culmen behind
// it where the nasal groove ends (xt 7.5–9), then the deeper base. The lower mandible is thin, its ventral line
// straight from the base to the gonys (xt ≈ 4.5) and rising more steeply from there to the tip.
// From above / the front (user's front-3/4 photo, p013, p037): broad at the base, narrowing quickly to a slender
// parallel-sided middle (narrowest xt 6–8, the mid-bill constriction) and very slightly widened again at the
// dertrum before the fine point.
export const BILL_SHAPE = {
  // culmen height above the commissure (upper mandible)
  Hu: [[0, 0], [0.25, 0.2], [0.6, 0.42], [1, 0.62], [1.6, 0.9], [2.4, 1.2], [3.4, 1.5], [4.6, 1.77], [6, 1.92], [7.5, 1.96], [9, 2.01], [10.5, 2.12], [12, 2.24], [13.5, 2.37], [15, 2.52], [16.5, 2.7], [18, 2.9], [20.3, 3.1]],
  // depth of the lower mandible below the commissure (ends 0.45 mm short of the upper tip)
  Hl: [[0.25, 0], [0.5, 0.2], [1, 0.42], [1.5, 0.58], [2.2, 0.75], [3, 0.86], [4, 0.94], [5, 0.99], [6.5, 1.05], [8, 1.1], [10, 1.19], [12, 1.28], [14, 1.38], [15.5, 1.47], [17, 1.6], [20.3, 1.85]],
  // full width (widest, near the tomia)
  W: [[0, 0], [0.25, 0.3], [0.6, 0.58], [1, 0.82], [1.6, 1.1], [2.4, 1.38], [3.4, 1.6], [4.6, 1.76], [6, 1.72], [7.5, 1.68], [9, 1.8], [10.5, 2.25], [12, 3.1], [13.5, 4.3], [15, 5.5], [16.5, 6.2], [18, 6.5], [20.3, 6.6]],
  // the lower mandible's width toward its tip (it sits inside the upper's tomia elsewhere)
  WlTip: [[0.25, 0], [0.5, 0.38], [1, 0.66], [1.6, 0.95], [2.4, 1.22], [3.4, 1.45], [5, 9]],
  lowerTip: 0.25,
  // nasal groove (fossa) and nostril on the side of the upper mandible: |v| is the around-parameter (0 culmen,
  // 1 tomium); depths in mm. Groove from the feathering forward to xt ≈ 7 (about half the exposed bill), the
  // slit-like nostril (≈3.4 mm × 0.35 mm) at its front-basal part just ahead of the feathering, a soft operculum
  // swelling above it (photos: the dark slit at 60–90 % of the bill from the tip, upper half of the upper mandible)
  groove: { v: 0.79, w: 0.075, depth: 0.17, front: [5.5, 9], back: [17.5, 19.5] },
  nostril: { v: 0.78, w: 0.06, depth: 0.12, front: [9.4, 10.3], back: [12.6, 13.4] },
  operculum: { v: 0.66, w: 0.06, h: 0.07, front: [8, 9.5], back: [13, 14.5] },
};

const fHu = mono(BILL_SHAPE.Hu);
const fHl = mono(BILL_SHAPE.Hl);
const fW = mono(BILL_SHAPE.W);
const fWlTip = mono(BILL_SHAPE.WlTip);
const XL0 = BILL_SHAPE.lowerTip;

/** Commissure height above the base→tip axis (before the lift that puts the apex on BILL.tip). */
const commissure = (xt) => -0.16 * (1 - sm(0, 3, xt)) ** 2 - 0.22 * sm(12.5, 19, xt);
/** How far the upper tomium hangs below the commissure (the upper's edge sheathes the lower; more at the hook). */
const lipDrop = (xt) => 0.12 * sm(0, 1.0, xt) + 0.06 * sm(0, 0.3, xt) * (1 - sm(0.3, 2.0, xt));
const widthU = (xt) => Math.max(0, fW(xt));
const widthL = (xt) => (xt <= XL0 ? 0 : Math.max(0, Math.min(fW(xt) - Math.min(0.16, 0.15 * fW(xt)), fWlTip(xt))));
const heightU = (xt) => Math.max(0, fHu(xt));
const heightL = (xt) => (xt <= XL0 ? 0 : Math.max(0, fHl(xt)));
const g1 = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const band = (xt, f, b) => sm(f[0], f[1], xt) * (1 - sm(b[0], b[1], xt));

/** Back-compatible profile by t (0 = mesh base, 1 = tip): widths / heights in mm. */
export function billProfile(t) {
  const xt = (1 - t) * billFrame().L;
  return { W: widthU(xt), Hu: heightU(xt), Hl: heightL(xt) };
}

let FRAME = null;
export function billFrame() {
  if (FRAME) return FRAME;
  const { base, tip } = BILL;
  const a = norm(sub(tip, base));
  const u = norm(cross(cross(a, [0, 1, 0]), a));
  const s = norm(cross(u, a));
  const L = Math.hypot(...sub(tip, base));
  FRAME = { a, u, s, L, lift: -commissure(0) };
  return FRAME;
}

/** Bill-frame section point (x lateral, y above the commissure) at station xt → bird-local mm. */
function toBird(xt, x, y) {
  const F = billFrame();
  return add(add(add(BILL.base, scl(F.a, F.L - xt)), scl(F.u, y + commissure(xt) + F.lift)), scl(F.s, x));
}

// Section curves. v ∈ [−1, 1] around the outer keratin (upper: 0 = culmen; lower: 0 = ventral keel), k ∈ [0, 1]
// across a lining (0 = left tomium). `detail` 0 carves the nasal groove / nostril into the geometry.
function upperOuter(xt, v, detail) {
  const W = widthU(xt);
  const H = heightU(xt);
  const th = (v * Math.PI) / 2;
  const sn = Math.abs(Math.sin(th));
  const co = Math.cos(th);
  // triangular at the broad base (sides converging on a rounded culmen ridge), rounder over the hard tip
  const px = lerp(lerp(0.72, 0.82, 1 - sm(2, 7, xt)), 1.08, sm(9.5, 14, xt));
  let x = Math.sign(v) * 0.5 * W * sn ** px;
  const y = H * co ** 0.85 - lipDrop(xt) * sn ** 6;
  if (detail === 0 && W > 0) {
    const av = Math.abs(v);
    const S = BILL_SHAPE;
    const dx =
      -S.groove.depth * band(xt, S.groove.front, S.groove.back) * g1(av, S.groove.v, S.groove.w) -
      S.nostril.depth * band(xt, S.nostril.front, S.nostril.back) * g1(av, S.nostril.v, S.nostril.w) +
      S.operculum.h * band(xt, S.operculum.front, S.operculum.back) * g1(av, S.operculum.v, S.operculum.w);
    x += Math.sign(v) * dx;
  }
  return [x, y];
}
function lowerOuter(xt, v) {
  const W = widthL(xt);
  const H = heightL(xt);
  const th = (v * Math.PI) / 2;
  const sn = Math.abs(Math.sin(th));
  const co = Math.cos(th);
  return [Math.sign(v) * 0.5 * W * sn ** 0.7, 0.05 * sn ** 8 - H * co ** 0.8];
}
function upperLining(xt, k) {
  const hw = 0.5 * widthU(xt);
  const th = Math.min(0.25, 0.3 * hw);
  const pc = Math.min(0.18, 0.35 * heightU(xt));
  const kk = 1 - 2 * k;
  const ak = Math.abs(kk);
  if (ak > 0.85) {
    const f = (ak - 0.85) / 0.15;
    return [Math.sign(kk) * (hw - th + th * f), lerp(-0.03, -lipDrop(xt), f)];
  }
  const r = ak / 0.85;
  return [Math.sign(kk) * (hw - th) * r, lerp(pc, -0.03, r * r)];
}
function lowerLining(xt, k) {
  const hw = 0.5 * widthL(xt);
  const th = Math.min(0.22, 0.3 * hw);
  const lc = Math.min(0.25, 0.4 * heightL(xt));
  const kk = 1 - 2 * k;
  const ak = Math.abs(kk);
  if (ak > 0.85) {
    const f = (ak - 0.85) / 0.15;
    return [Math.sign(kk) * (hw - th + th * f), lerp(0, 0.05, f)];
  }
  const r = ak / 0.85;
  return [Math.sign(kk) * (hw - th) * r, lerp(-lc, 0, r * r)];
}

/** Outer keratin point (bird-local mm) at station xt, around-parameter v (upper: 0 culmen; lower: 0 keel). */
export function billSurfacePoint(xt, v, lower = false, detail = 1) {
  return toBird(xt, ...(lower ? lowerOuter(xt, v) : upperOuter(xt, v, detail)));
}

// ---------------------------------------------------------------- feathered sheath round the bill base
// The face plumage does not end in a wall where the bill is plugged in: it tapers onto the keratin and meets it
// along a slanted, curved feather line (user's side photo, p012, p022, p035, p010): the forehead feathering reaches
// furthest forward, in a short rounded point over the culmen; the line runs back and down the side of the upper
// mandible to the rictus (the corner of the gape, hidden under the loral feathering), and forward again under the
// lower mandible, where the interramal (chin) feathering runs out along the keel in a short wedge.
// The sheath is the bill's own cross-section (the Lamé curves the section functions trace, centred on the
// commissure) grown by pad(d), d = xt − xf(φ): xf the feather line by section angle φ (normalised: 90° culmen, 0 the
// commissure, −90° the keel). The pad rises from 0 at the line at a shallow angle (the feathers lie flat on the bill,
// ≈ 17°) and steepens behind it into the face; ahead of the line it sinks just under the keratin and the sheath is
// capped inside the bill, so nothing of it shows there. Smooth-unioned with the face (bodySculpt prim 'billSheath').
export const BILL_SHEATH = {
  // feather line: [φ (deg), xt (mm from the tip)]
  line: [[-90, 14.2], [-70, 14.8], [-45, 16.3], [-20, 17.4], [0, 17.7], [20, 17.4], [45, 16.6], [65, 15.8], [80, 15.3], [90, 15.1]],
  slope: [[-90, 0.5], [-45, 0.38], [0, 0.3], [90, 0.3]], // pad per mm at the feather line, by φ
  // pad growth (per mm²) behind it, by φ: steepest under the bill (the chin falls away to the throat), steep over the
  // culmen (the forehead), least at the sides (the lores taper back to the eye)
  curve: [[-90, 1.0], [-45, 0.4], [0, 0.24], [45, 0.24], [90, 0.2]],
  sink: 0.45, // how far under the keratin the sheath lies ahead of the line (≥ groove + nostril depth)
  back: 27, // capped behind the mesh base (inside the face)
};
const fXf = mono(BILL_SHEATH.line);
/** Feather-line station (mm from the tip) at normalised section angle φ (deg). */
// (looked up by 90°·sin φ: flat at the culmen and the keel, where the two sides meet — a slope there drew a crease
// along the midline)
const sinDeg = (phi) => 90 * Math.sin((Math.max(-90, Math.min(90, phi)) * Math.PI) / 180);
export const featherLineXt = (phiDeg) => fXf(sinDeg(phiDeg));
const XF_MIN = Math.min(...BILL_SHEATH.line.map((k) => k[1]));

/** Section half-width, height and Lamé exponents at xt (y ≥ 0 upper, < 0 lower). */
// (upper and lower blended over ±0.4 mm round the commissure: a switch there creased the sheath along the gape line)
function sectionAt(xt, Y) {
  const xc = Math.max(0.3, Math.min(billFrame().L, xt));
  const w = sm(-0.4, 0.4, Y);
  const px = lerp(lerp(0.72, 0.82, 1 - sm(2, 7, xc)), 1.08, sm(9.5, 14, xc));
  const a = 0.5 * widthU(xc);
  return [a, lerp(Math.max(heightL(xc), 0.05), heightU(xc), w), lerp(2 / 0.7, 2 / px, w), lerp(2 / 0.8, 2 / 0.85, w)];
}
/** Radius of the Lamé section curve (|x/a|^m + |y/b|^n = 1) along the unit direction (c, s), c, s ≥ 0. */
function lameRadius(a, b, m, n, c, s) {
  let R = 1 / Math.sqrt((c / a) ** 2 + (s / b) ** 2); // the ellipse as a start
  for (let i = 0; i < 6; i++) {
    const tx = (R * c) / a;
    const ty = (R * s) / b;
    const f = tx ** m + ty ** n - 1;
    const df = (m * tx ** (m - 1) * c) / a + (n * ty ** (n - 1) * s) / b;
    if (!(df > 1e-9)) break;
    const R1 = R - f / df;
    R = R1 > 0.2 * R ? R1 : 0.2 * R;
    if (Math.abs(f) < 1e-5) break;
  }
  return R;
}

/** Bill-frame coordinates of bird-local p: [xt, r (from the commissure, across the bill), section radius R there,
 *  feather-line distance d = xt − xf(φ), φ, geometric section angle θ (deg)] (R … null far from the bill). */
function sheathFrame(x, y, z) {
  const F = billFrame();
  const B = BILL.base;
  const dx = x - B[0];
  const dy = y - B[1];
  const dz = z - B[2];
  const xt = F.L - (dx * F.a[0] + dy * F.a[1] + dz * F.a[2]);
  const X = dx * F.s[0] + dy * F.s[1] + dz * F.s[2];
  const U = dx * F.u[0] + dy * F.u[1] + dz * F.u[2];
  const Y = U - commissure(Math.max(0, Math.min(F.L, xt))) - F.lift;
  const r = Math.hypot(X, Y);
  if (r > 26) return [xt, r, null, null, null, null];
  const [a, b, m, n] = sectionAt(xt, Y);
  const c = r > 1e-6 ? Math.abs(X) / r : 1;
  const s = r > 1e-6 ? Math.abs(Y) / r : 0;
  const R = lameRadius(a, b, m, n, c, s);
  const phi = (Math.atan2(Y / b, Math.abs(X) / a) * 180) / Math.PI;
  return [xt, r, R, xt - featherLineXt(phi), phi, (Math.atan2(Y, Math.abs(X)) * 180) / Math.PI, -Y - heightL(Math.max(XL0, Math.min(F.L, xt))), Y];
}
const fCurve = mono(BILL_SHEATH.curve);
const fSlope = mono(BILL_SHEATH.slope);
const padAt = (d, phi, P) => {
  const sl = fSlope(sinDeg(phi));
  return d < 0 ? Math.max(-P.sink, sl * d) : sl * d + fCurve(sinDeg(phi)) * d * d;
};

/**
 * Signed distance (≈, mm) of the feathered sheath at bird-local p (mode 'sheath'); 'bare': the keratin itself (an
 * implicit bill for the tools); 'section': r − R. Exact enough near the surface, a bound far from the bill.
 */
export function billSheathDist(x, y, z, P = BILL_SHEATH, mode = 'sheath') {
  const F = billFrame();
  const [xt, r, R, d, phi] = sheathFrame(x, y, z);
  if (mode === 'bare') return R === null ? r - 9 : Math.max(r - R, -xt, xt - F.L);
  if (mode === 'section') return R === null ? r - 9 : r - R;
  const front = XF_MIN - 1.6 - xt; // capped inside the keratin ahead of the line
  const back = xt - P.back;
  if (R === null) return Math.max(r - 9, front, back);
  return Math.max(r - R - padAt(d, phi, P), front, back);
}

/**
 * How much of the lower jaw's turn the face plumage at bird-local p takes (0 … 1): the chin and interramal feathering
 * round the lower mandible's base, below the commissure and within a few millimetres of the keratin, turns with the
 * jaw (it is skin on the mandible), fading out behind the bill base and further from it — so the opening bill keeps its
 * base sheathed instead of sliding out of a fixed chin (bodyMesh skinning).
 */
export function chinJawWeight(x, y, z) {
  const [xt, r, R] = sheathFrame(x, y, z);
  if (R === null) return 0;
  const F = billFrame();
  const B = BILL.base;
  const U = (x - B[0]) * F.u[0] + (y - B[1]) * F.u[1] + (z - B[2]) * F.u[2];
  const Y = U - commissure(Math.max(0, Math.min(F.L, xt))) - F.lift;
  return sm(0.3, -0.3, Y) * (1 - sm(20, 24, xt)) * (1 - sm(R + 2.5, R + 6.5, r));
}

/**
 * The face field `face` (bird-local mm → mm) with its front round the bill base remodelled into the feathered sheath
 * (bodySculpt.billBlend {d0, d1, rA, rB, shear, slot, mouthBack}). The two fields are morphed, not unioned: the sheath
 * alone up to d0 behind the feather line (and ahead of it), the face again from d1 behind it and beyond rA … rB from
 * the keratin — a smooth funnel from the face onto the bill. (A union kept the head's, the lores' and the throat's
 * fronts, which reached the keratin in a near-vertical wall well ahead of the slanted line; cutting the face to an
 * envelope left creases and hollows.) Below the keel the station is sheared back by `shear` per mm: the throat lies
 * ahead of the bill base along the downward-pointing bill axis and stays as it is, under the chin wedge.
 */
export function makeBillBlend(face, o) {
  const P = BILL_SHEATH;
  // The mouth: no plumage in the slot between the mandibles (|Y| < slot) inside the keratin, from the tip back to just
  // behind the jaw's hinge — the face filled the bill's core there and showed white through the opening gape
  const mouth = (v, xt, r, R, Y) => (xt < o.mouthBack && R !== null ? Math.max(v, Math.min(o.slot - Math.abs(Y), R - 0.3 - r, o.mouthBack - xt)) : v);
  const fn = (x, y, z) => {
    const f = face(x, y, z);
    const [xt, r, R, d, phi, th, below, Y] = sheathFrame(x, y, z);
    if (R === null || r >= R + o.rB) return f;
    const dd = d + o.shear * softPlus(below, 1);
    const w = Math.max(sm(o.d0, o.d1, dd), sm(R + o.rA, R + o.rB, r));
    if (w >= 1) return mouth(f, xt, r, R, Y);
    const pad = padAt(d, phi, P);
    const S = Math.max(r - R - pad, XF_MIN - 1.6 - xt);
    return mouth(S + (f - S) * w, xt, r, R, Y);
  };
  return fn;
}
/** Smooth max(0, x) over about ±k. */
const softPlus = (x, k) => (x > 4 * k ? x : x < -4 * k ? 0 : k * Math.log1p(Math.exp(x / k)));
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/**
 * Emit a parametric patch P(i, j) (i along, j across) with numerically differentiated normals.
 * fn(xt, w) → bird-local point; xs: stations; ws: across parameters; orient(p, n, xt, w) → true if n faces out.
 */
function patch(sk, fn, xs, ws, { part, bones, orient, uvx, aux, both = false, normalFix }) {
  const start = sk.count;
  const nW = ws.length;
  const pts = [];
  for (const xt of xs) {
    for (const w of ws) {
      const p = fn(xt, w);
      // central differences (forward / backward at the ends); the apex (all points equal) takes normalFix
      const ex = 0.004;
      const ew = 0.002;
      const dX = sub(fn(xt + ex, w), fn(Math.max(0, xt - ex), w));
      const dW = sub(fn(xt, Math.min(ws[nW - 1], w + ew)), fn(xt, Math.max(ws[0], w - ew)));
      let n = cross(dX, dW);
      if (Math.hypot(...n) < 1e-9 && normalFix) n = normalFix(xt, w);
      else if (Math.hypot(...n) < 1e-9) n = cross(sub(fn(xt + 0.05, w), p), sub(fn(xt + 0.05, Math.min(ws[nW - 1], w + 0.05)), fn(xt + 0.05, Math.max(ws[0], w - 0.05))));
      n = norm(n);
      if (!orient(p, n, xt, w)) n = scl(n, -1);
      pts.push({ p, n, xt, w });
    }
  }
  const emit = (flipN) => {
    const s0 = sk.count;
    for (const q of pts) sk.v(q.p, flipN ? scl(q.n, -1) : q.n, [uvx(q.w), q.xt], part, bones(q.xt, q.w), aux ? aux(fn, q.xt, q.w) : 99);
    // one winding for the whole patch (the grid's topology), chosen by majority so that it is CCW seen from the
    // side the normals point to (per-triangle choices flipped faces inside narrow carved features)
    const tris = [];
    let vote = 0;
    const P = (k) => pts[k - s0];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < nW - 1; j++) {
        const a = s0 + i * nW + j;
        const b = a + 1;
        const c = a + nW;
        const d = c + 1;
        for (const [x, y, z] of [[a, c, b], [b, c, d]]) {
          const gn = cross(sub(P(y).p, P(x).p), sub(P(z).p, P(x).p));
          if (Math.hypot(...gn) < 1e-12) continue;
          vote += Math.sign(dot(gn, add(add(P(x).n, P(y).n), P(z).n)));
          tris.push([x, y, z]);
        }
      }
    }
    const keep = vote * (flipN ? -1 : 1) >= 0;
    for (const [x, y, z] of tris) {
      if (keep) sk.index.push(x, y, z);
      else sk.index.push(x, z, y);
    }
  };
  emit(false);
  if (both) emit(true);
  return start;
}

/** Stations from 0 … 1 mapped onto [x0, x1], dense toward x0 (the tip). */
const stations = (x0, x1, n, pow = 1.7) => Array.from({ length: n }, (_, i) => x0 + (x1 - x0) * (i / (n - 1)) ** pow);
const across = (n, a = -1, b = 1) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

export const BILL_LOD = [
  { along: 64, aroundU: 40, aroundL: 26, lining: 7, web: [10, 3], throat: [6, 3], carve: true },
  { along: 26, aroundU: 16, aroundL: 12, lining: 5, web: [4, 2], throat: [4, 2], carve: false },
  { along: 9, aroundU: 8, aroundL: 6, lining: 3, web: null, throat: null, carve: false },
];

/**
 * Upper mandible (head bone) and lower mandible (jaw bone) with their mouth linings, the rictal skin that
 * spans the corner of the gape when the jaw opens, and the back of the mouth.
 * aPart 0 = keratin (uv = (v, xt): upper v ∈ [−1, 1], lower v + 4), 4 = mouth lining (uv.x ≥ 10).
 * aux (aBillF): the plumage's signed distance at the vertex (mm, < 0 under the feathering) — the bill shader
 * draws the feather tips that lie over the base from it.
 */
export function buildBill(sk, boneIndex, J, opts = {}) {
  const lod = BILL_LOD[Math.min(2, opts.detail ?? 0)];
  const F = billFrame();
  const L = F.L;
  const head = [[boneIndex.head, 1]];
  const jawB = [[boneIndex.jaw, 1]];
  const sdf = opts.sdf;
  // aBillF: how far along the bill (mm, by station) the vertex lies ahead of the plumage's edge on its own line round
  // the bill (+ exposed, − under the feathering; ±4 at most) — the edge is where the body SDF changes sign along it.
  // (The plumage now meets the keratin at a shallow angle, so the SDF value itself stayed small for millimetres
  // ahead of the line and the feather tips drawn from it spread far over the bill.)
  const aux = sdf
    ? (fn, xt, w) => {
        const inside = (x) => sdf(...fn(Math.max(0, Math.min(L, x)), w)) < 0;
        const s0 = inside(xt);
        const dir = s0 ? -1 : 1; // covered: look toward the tip for the edge; exposed: toward the base
        let a = xt;
        for (let k = 1; k <= 40; k++) {
          const b = xt + dir * 0.1 * k;
          if (b < 0 || b > L || inside(b) !== s0) {
            if (b < 0 || b > L) return s0 ? -4 : 4;
            let lo = a;
            let hi = b;
            for (let it = 0; it < 10; it++) {
              const m = 0.5 * (lo + hi);
              if (inside(m) === s0) lo = m;
              else hi = m;
            }
            return Math.max(-4, Math.min(4, (s0 ? -1 : 1) * Math.abs(0.5 * (lo + hi) - xt)));
          }
          a = b;
        }
        return s0 ? -4 : 4;
      }
    : null;
  const carve = lod.carve ? 0 : 1;
  const apexN = (lower) => () => norm(add(F.a, scl(F.u, lower ? -0.6 : -0.15)));
  const xsU = stations(0, L, lod.along);
  const xsL = stations(XL0, L, Math.max(6, Math.round(lod.along * 0.92)));
  const vU = across(lod.aroundU + 1);
  const vL = across(lod.aroundL + 1);
  const kk = across(lod.lining, 0, 1);
  // a point faces outward if it points away from the section's core (between culmen and keel at mid-width)
  const core = (xt, lower) => toBird(xt, 0, lower ? -0.45 * heightL(xt) : 0.45 * heightU(xt));
  const U = (xt, v) => toBird(xt, ...upperOuter(xt, v, carve));
  const Lo = (xt, v) => toBird(xt, ...lowerOuter(xt, v));
  patch(sk, U, xsU, vU, { part: 0, bones: () => head, uvx: (v) => v, aux, orient: (p, n, xt) => dot(n, sub(p, core(xt, false))) >= 0 || xt < 0.02, normalFix: apexN(false) });
  patch(sk, Lo, xsL, vL, { part: 0, bones: () => jawB, uvx: (v) => v + 4, aux, orient: (p, n, xt) => dot(n, sub(p, core(xt, true))) >= 0 || xt <= XL0 + 0.01, normalFix: apexN(true) });
  // linings: the palate faces down into the mouth, the floor of the lower mandible up
  const UL = (xt, k) => toBird(xt, ...upperLining(xt, k));
  const LL = (xt, k) => toBird(xt, ...lowerLining(xt, k));
  patch(sk, UL, xsU.filter((x) => x > 0), kk, { part: 4, bones: () => head, uvx: (k) => 10 + k, orient: (p, n) => dot(n, F.u) <= 0 });
  patch(sk, LL, xsL.filter((x) => x > XL0), kk, { part: 4, bones: () => jawB, uvx: (k) => 12 + k, orient: (p, n) => dot(n, F.u) >= 0 });
  // Rictal skin: from the inner edge of the upper tomium to that of the lower, both sides, from the corner of the
  // gape (xt ≈ 17, at the rictus under the loral feathering, next to the jaw's hinge) back into the head. Skinned head → jaw across, so it lies
  // flat inside the closed bill and stretches into a membrane at the corner of the open gape (no hole into the
  // head). Its free front edge runs obliquely back from the upper to the lower tomium.
  if (lod.web) {
    const [nA, nK] = lod.web;
    for (const side of [1, -1]) {
      const edgeU = (xt) => upperLining(xt, side > 0 ? 0.075 : 0.925);
      const edgeL = (xt) => lowerLining(xt, side > 0 ? 0.075 : 0.925);
      const front = (k) => 16.9 + 0.8 * k; // the rictus (BILL_SHEATH line at the commissure, 17.7)
      const fn = (sA, k) => {
        const xt = lerp(front(k), L - 0.2, sA);
        const pu = edgeU(xt);
        const pl = edgeL(xt);
        return toBird(xt, lerp(pu[0], pl[0], k), lerp(pu[1], pl[1], k));
      };
      const w = (sA, k) => (k <= 0 ? head : k >= 1 ? jawB : [[boneIndex.head, 1 - k], [boneIndex.jaw, k]]);
      patch(sk, fn, across(nA, 0, 1), across(nK + 1, 0, 1), { part: 4, bones: w, uvx: (k) => 14 + k, orient: (p, n) => dot(n, F.s) * side >= 0, both: true });
    }
  }
  // Tongue: a slender, flat-topped strap lying in the trough of the lower mandible's floor, from ≈7 mm behind the tip
  // back into the mouth (plovers' tongues are narrow and pointed; seen only in the open bill), pinkish flesh (uv.x 18)
  if (lod.web) {
    const [nA] = lod.web;
    const tongue = (xt, k) => {
      const hw = Math.min(0.55, 0.22 * widthL(xt)) * sm(6.6, 9.5, xt) ** 0.5; // half-width, pointed tip
      const kk = 2 * k - 1;
      const fl = lowerLining(xt, 0.5 - kk * hw / Math.max(0.05, widthL(xt)));
      const top = 0.16 * sm(6.6, 8, xt) * (1 - kk * kk) ** 0.6; // rounded upper surface over the floor
      return toBird(xt, fl[0], fl[1] + 0.04 + top);
    };
    const xs = stations(6.6, Math.min(L - 0.6, 18.5), Math.max(6, nA + 4), 1);
    patch(sk, tongue, xs, across(lod.lining + 2, 0, 1), { part: 4, bones: () => jawB, uvx: () => 18, orient: (p, n) => dot(n, F.u) >= 0 });
  }
  // back of the mouth: palate → floor across the bill, facing the tip
  if (lod.throat) {
    const [nX, nK] = lod.throat;
    const xt = L - 0.25;
    const fn = (kx, k) => {
      const pu = upperLining(xt, kx);
      const pl = lowerLining(xt, kx);
      return toBird(xt, lerp(pu[0], pl[0], k), lerp(pu[1], pl[1], k));
    };
    // (patch differentiates along its first parameter: here the across-bill kx stands in for xt)
    const pts = across(nX, 0.075, 0.925);
    const w = (kx, k) => (k <= 0 ? head : k >= 1 ? jawB : [[boneIndex.head, 1 - k], [boneIndex.jaw, k]]);
    patch(sk, fn, pts, across(nK + 1, 0, 1), { part: 4, bones: w, uvx: () => 16, orient: (p, n) => dot(n, F.a) >= 0 });
  }
}
