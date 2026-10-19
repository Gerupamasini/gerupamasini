// The トビハゼ head as a signed-distance sculpt over its skeleton (skull.mjs), in head lengths (HL) of the fish frame
// (anatomy.mjs).
//
// The outer mass is a loft whose silhouettes are the measured outlines (the half-width seen from above, the dorsal and
// ventral profiles seen from the side, and per station the height of the widest point and the superellipse exponents
// of the section above and below it), with the snout bulb, the cheek balloons and the eye turret on it. The soft
// tissues that move are built on the bones they ride on:
//   upper lip   the lateral pads ride on the premaxillae's toothed arms and end over the maxillae's tips at the
//               rictus; across the front they are joined by a thin median lip (a moustache seen from the front); the
//               snout's skin sheath (fixed to the skull) overlies them along the labial groove
//   lower jaw   the lower lip and the chin wrap the dentaries; between the lips the gape is a real slit opening into
//               the mouth cavity, closed at the rictus by the rictal fold, so the jaw can open (Murdy 1989: the fold
//               covers the posterior jaws even agape)
//   eye         the dermal cup: a U-shaped rim hugging the globe just under the iris, low under the window and rising
//               on the front and back to the pupil's level, over a thick collar that flares into the head at the
//               infraorbital crease (the globe's own skin cap and clear window are on the eye mesh, eye.mjs)
//   gill        the opercular membrane fused to the body except a short slit on the opercle's posterior edge, in
//               front of the upper pectoral base, opening into the opercular chamber
// Sources: research/anat_soft.md (measured on the photos), anat_osteo.md (the bones), anat_mech.md (the mechanism).
import { HEAD } from './anatomy.mjs';
import { lm } from './skull.mjs';
import { ellipsoid, sphere, smin, smax, ssub, tube, smoothPath, clamp, smoothstep } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

/** Every tunable of the sculpt (HL units), so a comparison round can change one number at a time. */
export const HEAD_SCULPT = {
  // stations s with, per station: half-width w (seen from above), top yT and bottom yB (seen from the side), the
  // height yW of the widest point, and the exponents of the section above (nU) and below (nL) that height. In front of
  // the rictus the face is narrow low down (the pads stand out from it) and widest under the eyes.
  loft: {
    s:  [0.030, 0.038, 0.050, 0.070, 0.095, 0.125, 0.170, 0.250, 0.350, 0.450, 0.620, 0.800, 1.000, 1.150, 1.300],
    w:  [0.000, 0.060, 0.100, 0.138, 0.168, 0.200, 0.235, 0.278, 0.318, 0.336, 0.318, 0.290, 0.290, 0.295, 0.310],
    yT: [0.250, 0.300, 0.345, 0.392, 0.440, 0.482, 0.522, 0.560, 0.585, 0.603, 0.615, 0.620, 0.622, 0.625, 0.628],
    yB: [0.200, 0.170, 0.150, 0.128, 0.110, 0.095, 0.080, 0.060, 0.025, -0.005, -0.045, -0.045, -0.045, -0.035, -0.025],
    yW: [0.230, 0.235, 0.245, 0.260, 0.275, 0.290, 0.305, 0.310, 0.290, 0.250, 0.220, 0.220, 0.230, 0.245, 0.260],
    nU: [2.00, 2.05, 2.10, 2.10, 2.05, 1.95, 1.85, 1.80, 1.50, 1.70, 1.70, 1.70, 1.70, 1.70, 1.75],
    nL: [2.00, 1.90, 1.75, 1.60, 1.50, 1.50, 1.50, 1.55, 2.20, 3.40, 3.60, 3.60, 3.40, 3.10, 2.70],
  },
  // the near-vertical rounded front of the face, its most anterior point just above the pads' front ends
  snoutBulb: { c: [0.185, 0.240], r: [0.185, 0.185, 0.210] },
  cheekBalloon: { c: [0.73, 0.245], r: [0.62, 0.29, 0.35] },
  cheekRear: { c: [0.90, 0.235], r: [0.16, 0.235, 0.33], blend: 0.06 },
  cheekClip: { blend: 0.012 },
  // the block the eyes stand on, and its low front face (the "fleshy ridge anterior to the eyes", Murdy)
  turret: { c: [0.335, 0.525], r: [0.16, 0.12, 0.15] },
  // the window axis of the eye at rest (55° out, 15° up), kept here for the charts of the socket
  cup: {
    open: [-0.554, 0.259, 0.791],
    gap: 0.0015,
    // the rim: its height above the globe's centre against the azimuth about the vertical (Δ from the low point,
    // which lies under the window, `low` degrees forward of lateral): h = A − B cos Δ − C cos 2Δ; low under the
    // window (−0.075), at the pupil's level front and back (−0.012), well above the centre medially (+0.065), where
    // the two cups fill the notch between the domes
    low: 35, A: -0.0085, B: 0.070, C: -0.0035,
    // the bead of the rim: a shell `thick` proud of the globe, its edge rounded by `round`
    thick: 0.020, round: 0.010,
    // the collar under the bead: a fleshy column about the globe's vertical axis, radius r at the top flaring to rBase
    // at the infraorbital crease (y0), starting `drop` below the rim, blended into the bead
    // the collar: a fleshy ring round the lower globe, wider than the globe, sitting on the head; its underside curls
    // in to the infraorbital crease (y0: its centre, r: horizontal and vertical radii)
    collar: { y0: 0.530, r: [0.124, 0.052], blend: 0.030 },
    crease: { r: 0.007, k: 0.006 },
  },
  // the skin between the two cups: the domes press together along the midline down to a shallow notch
  septum: { c: [0.33, 0.60], r: [0.10, 0.07, 0.045] },
  // ---- mouth
  // the gape: the closed mouth's line (y at the front, at the rictus), the slit's half-width, the rictus (where the
  // slit closes into the rictal fold)
  gape: { yFront: 0.104, yBack: 0.110, half: 0.0045, rictus: 0.315, close: 0.045 },
  // the upper lip (left half, mirrored): a swept roll from the thin median lip at the front midline along the
  // premaxilla's arm to the pad's rounded rear end over the maxilla's tip; round in section, widest at 55–60 % of its
  // length, standing out from the face above it
  pad: {
    // the median lip: thin, from the front midline under the snout bulb to the pad's front end
    median: { path: [[0.050, 0.110, 0.000], [0.054, 0.111, 0.040], [0.070, 0.117, 0.078], [0.096, 0.130, 0.108]], radius: [0.016, 0.016, 0.018, 0.026] },
    // the pad: a bean along the premaxilla's arm, its front end rounded and tucked under the bulb, its rear end the
    // fattest part, over the maxilla's tip at the rictus
    path: [[0.105, 0.156, 0.122], [0.145, 0.162, 0.152], [0.192, 0.165, 0.180], [0.236, 0.163, 0.200], [0.268, 0.158, 0.212]],
    radius: [0.046, 0.055, 0.056, 0.050, 0.038],
    samples: 64,
    // the labial groove: the crease where the snout's sheath meets the pad (along its top and round its rear end)
    seam: { r: 0.0085, k: 0.006 },
  },
  // the lower jaw's tissue (left half): the mandible's flesh round the dentary rami, the floor between them, the
  // thin lower lip along the dentary's outer edge (just under the pads), and the narrow chin knob
  jaw: {
    ramus: { path: [[0.078, 0.090, 0.000], [0.092, 0.088, 0.046], [0.136, 0.082, 0.092], [0.204, 0.076, 0.134], [0.276, 0.076, 0.166], [0.340, 0.084, 0.186]], radius: [0.020, 0.021, 0.024, 0.028, 0.032, 0.036] },
    floor: { c: [0.250, 0.058], r: [0.190, 0.058, 0.185] },
    lip: { path: [[0.062, 0.090, 0.000], [0.066, 0.090, 0.040], [0.092, 0.092, 0.074], [0.140, 0.096, 0.102], [0.198, 0.099, 0.128], [0.255, 0.102, 0.150], [0.295, 0.105, 0.164]], radius: [0.0065, 0.0065, 0.006, 0.0055, 0.005, 0.0045, 0.004] },
    chin: { c: [0.095, 0.068], r: [0.040, 0.030, 0.050] },
    blend: 0.035, fuse: 0.03,
  },
  // the rictal fold: the web joining the pad's rear end to the lower lip at the corner, and its crease running on down
  // and back onto the cheek
  rictal: { c: [0.300, 0.120, 0.215], r: [0.026, 0.030, 0.024], blend: 0.03 },
  rictalCrease: { path: [[0.310, 0.112, 0.226], [0.335, 0.086, 0.228], [0.365, 0.060, 0.218], [0.400, 0.040, 0.198]], radius: [0.0045, 0.0045, 0.004, 0.003] },
  // the mouth cavity behind the gape (left half of a symmetric volume): it reaches forward to the lips' inner faces,
  // up under the palate and back into the pharynx, between the jaws
  cavity: { front: { c: [0.122, 0.128, 0], r: [0.052, 0.020, 0.072] }, mid: { c: [0.235, 0.152, 0], r: [0.140, 0.045, 0.125] }, back: { c: [0.430, 0.172, 0], r: [0.150, 0.060, 0.135] }, blend: 0.03 },
  tongue: { c: [0.250, 0.120, 0], r: [0.085, 0.022, 0.050] },
  // the anterior nostril: a short tube on the front of the snout pointing forward and down (B012: y 0.35–0.40); the
  // posterior nostril a small pore just in front of the eye
  nostril: { base: [0.044, 0.372, 0.074], tip: [0.034, 0.366, 0.077], r: [0.0068, 0.006], hole: 0.0035 },
  nostrilPost: { c: [0.205, 0.520, 0.118], r: 0.0055 },
  // the opercle's margin: a soft fold standing proud of the trunk behind it
  opercle: { path: [[1.012, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]], radius: [0.0024, 0.006, 0.0078, 0.0078, 0.0066, 0.0036] },
  // the gill slit: the only part of the margin that opens, y 0.17–0.38 (Michel 2014 Fig. 1A; B010), a thin slot
  // running forward under the opercle's free edge into the opercular chamber
  gillSlit: { y0: 0.175, y1: 0.375, half: 0.005, depth: 0.020, reach: 0.10, edge: 0.006, round: 0.006 },
  gillChamber: { c: [0.86, 0.26, 0.205], r: [0.13, 0.10, 0.06] },
  floorY: -0.010,
  cutS: 1.3,
  blend: { bulb: 0.03, cheek: 0.04, turret: 0.045, cups: 0.020, septum: 0.04, groove: 0.008, fold: 0.012, nostril: 0.012, socket: 0.006, floor: 0.04, cut: 0.02, cavity: 0.008, tongue: 0.02 },
};

/** Sample the loft's station tables into dense arrays (Catmull-Rom between stations). */
export function loftTables(L, n = 2048) {
  const keys = ['w', 'yT', 'yB', 'yW', 'nU', 'nL'];
  const sMax = L.s[L.s.length - 1];
  const out = Object.fromEntries(keys.map((k) => [k, new Float64Array(n + 1)]));
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * sMax;
    let j = 0;
    while (j < L.s.length - 2 && L.s[j + 1] < s) j++;
    const s1 = L.s[j], s2 = L.s[j + 1], t = clamp((s - s1) / (s2 - s1), 0, 1);
    for (const k of keys) {
      const a = L[k], m = a.length;
      const p0 = a[Math.max(0, j - 1)], p1 = a[j], p2 = a[j + 1], p3 = a[Math.min(m - 1, j + 2)];
      // monotone-ish Catmull-Rom (tangents scaled by the station spacing)
      const h0 = L.s[j] - L.s[Math.max(0, j - 1)] || s2 - s1, h2 = L.s[Math.min(m - 1, j + 2)] - L.s[j + 1] || s2 - s1;
      const dt = s2 - s1;
      const m1 = ((p2 - p0) / (dt + h0)) * dt, m2 = ((p3 - p1) / (dt + h2)) * dt;
      const t2 = t * t, t3 = t2 * t;
      out[k][i] = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
    }
  }
  return { ...out, n, sMax, s0: L.s[0] };
}

/** Distance to the loft (approximate: the section's superellipse distance, the front closed by its own shrinking). */
export function loftSDF(T) {
  const { n, sMax, s0 } = T;
  return (x, y, z) => {
    const sc = clamp(x, s0 + 2e-3, sMax);
    const f = (sc / sMax) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    const w = Math.max(1e-4, L(T.w)), yT = L(T.yT), yB = L(T.yB), yW = L(T.yW);
    const up = y >= yW;
    const hh = Math.max(1e-4, up ? yT - yW : yW - yB);
    const u = Math.abs(z) / w, v = Math.abs(y - yW) / hh;
    // an upper exponent under 2 slopes the shoulders but would come to a point on the crest: near the midline it
    // eases back to a round 2.2, so the back is a rounded ridge, not a keel
    let nn = up ? L(T.nU) : L(T.nL);
    if (up && nn < 2.2) nn += (2.2 - nn) * (1 - smoothstep(0, 0.45, u));
    const r = Math.pow(Math.pow(u, nn) + Math.pow(v, nn), 1 / nn);
    let d;
    if (r < 1e-9) d = -Math.min(w, hh);
    else {
      // (r − 1) / |∇r|: the superellipse's own distance near its boundary
      const k = Math.pow(r, 1 - nn);
      const gz = (k * Math.pow(u, nn - 1)) / w, gy = (k * Math.pow(v, nn - 1)) / hh;
      d = (r - 1) / Math.max(1e-6, Math.hypot(gz, gy));
    }
    // ahead of the first station: the distance to its rim (a rounded end, not a cut plane)
    if (x < s0 + 2e-3) d = Math.hypot(Math.max(d, 0), s0 + 2e-3 - x);
    return d;
  };
}

/** The dermal cup of the left eye (z > 0) as a field, and the rim's height for an azimuth (exported for the rig). */
export function cupField(K = HEAD_SCULPT) {
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180;
  const c = [E.s, E.y, E.z];
  // azimuth about the vertical through the globe's centre: 0 lateral (+z), +90° forward (−s)
  const rimH = (px, pz) => { const D = Math.atan2(-px, pz) - lo; return C.A - C.B * Math.cos(D) - C.C * Math.cos(2 * D); };
  const col = C.collar;
  const collarE = ellipsoid([c[0], col.y0, c[2]], [col.r[0], col.r[1], col.r[0]]);
  return {
    rimH,
    field: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const r = Math.hypot(px, py, pz), h = rimH(px, pz);
      // the bead: a shell hugging the globe
      const bead = r - (re + C.gap + C.thick);
      // the collar ring (an oblate ellipsoid about the globe's vertical axis)
      const ring = collarE(x, y, z);
      const body = smin(bead, ring, col.blend);
      // everything above the rim is cut away, the edge rounded into a lip
      return smax(body, py - h, C.round);
    },
  };
}

/** The head's distance function in HL units (s, y, z). opts.parts: also return the parts (for the section plots). */
export function headSDF(K = HEAD_SCULPT, { cut = true } = {}) {
  const E = HEAD.eye, re = E.d / 2;
  const el = (p, zc = 0) => ellipsoid([p.c[0], p.c[1], zc], p.r);
  const loft = loftSDF(loftTables(K.loft));
  const bulb = el(K.snoutBulb), balloon = el(K.cheekBalloon), turret = el(K.turret);
  // the opercle's margin as s at height y (its path's own s, y), where the balloon ends in a rim
  const opP = K.opercle.path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  const sOp = (y) => {
    if (y <= opP[0][1]) return opP[0][0];
    for (let i = 0; i + 1 < opP.length; i++) {
      const [s1, y1] = opP[i], [s2, y2] = opP[i + 1];
      if (y <= y2) return s1 + ((s2 - s1) * (y - y1)) / (y2 - y1);
    }
    return opP[opP.length - 1][0];
  };
  const rear = el(K.cheekRear);
  const cheek = (x, y, z) => smax(smin(balloon(x, y, z), rear(x, y, z), K.cheekRear.blend), (x - sOp(y)) * 0.9, K.cheekClip.blend);
  const cup = cupField(K), cupL = cup.field;
  const eyeL = [E.s, E.y, E.z];
  const socketL = sphere(eyeL, re + K.cup.gap);
  const septum = el(K.septum);
  const b = K.blend;

  // ---- the outer mass (fixed to the skull, the cheeks and the gill covers): the loft and its swellings
  const mass = (x, y, z) => {
    const za = Math.abs(z);
    let d = loft(x, y, z);
    d = smin(d, bulb(x, y, z), b.bulb);
    d = smin(d, cheek(x, y, z), b.cheek);
    d = smin(d, turret(x, y, z), b.turret);
    d = smin(d, septum(x, y, z), b.septum);
    return d;
  };
  // the dermal cups with the infraorbital crease where each collar meets the head
  const withCups = (x, y, z, m) => {
    const za = Math.abs(z), c = cupL(x, y, za);
    const d = smin(m, c, b.cups);
    // the crease runs under the eye's lateral and front sides; medially and behind, the collar merges into the
    // turret and the nape
    const cw = smoothstep(0.02, 0.07, za - E.z);
    return cw > 0 ? d + (ssub(d, Math.hypot(m, c) - K.cup.crease.r, K.cup.crease.k) - d) * cw : d;
  };

  // ---- mouth
  const G = K.gape;
  const gapeY = (x) => G.yFront + (G.yBack - G.yFront) * smoothstep(0.03, G.rictus, x);
  // in front of the rictus the outer mass ends at the gape: the lower jaw's own tissue is below it
  const front = (x) => 1 - smoothstep(G.rictus - G.close * 0.4, G.rictus + G.close * 0.6, x);
  const padP = smoothPath(K.pad.path, K.pad.radius, K.pad.samples), medP = smoothPath(K.pad.median.path, K.pad.median.radius, 24);
  const bean = tube(padP.points, padP.radii, 0.2), median = tube(medP.points, medP.radii, 0.2);
  const pad = (x, y, z) => smin(bean(x, y, z), median(x, y, z), 0.02);
  const J = K.jaw;
  const ramus = (() => { const q = smoothPath(J.ramus.path, J.ramus.radius, 40); return tube(q.points, q.radii, 0.2); })();
  const lowerLip = (() => { const q = smoothPath(J.lip.path, J.lip.radius, 48); return tube(q.points, q.radii, 0.2); })();
  const jawFloor = el(J.floor), chin = el(J.chin);
  const rictal = ellipsoid(K.rictal.c, K.rictal.r);
  const jawTissue = (x, y, z) => {
    const za = Math.abs(z);
    let d = smin(ramus(x, y, za), jawFloor(x, y, z), J.blend);
    d = smin(d, chin(x, y, z), J.blend);
    d = smin(d, lowerLip(x, y, za), J.blend * 0.5);
    return d;
  };
  const cav = K.cavity;
  const cavF = el(cav.front), cavM = el(cav.mid), cavB = el(cav.back), tongue = el(K.tongue);
  const cavity = (x, y, z) => ssub(smin(smin(cavF(x, y, z), cavM(x, y, z), cav.blend), cavB(x, y, z), cav.blend), tongue(x, y, z), b.tongue);

  // the upper head: the outer mass, cut at the gape in front of the rictus, with the upper lip on it (the labial
  // groove where they meet), and the rictal fold at the corner
  const upper = (x, y, z) => {
    const za = Math.abs(z), w = front(x);
    let m = mass(x, y, z);
    if (w > 0) m += (smax(m, gapeY(x) - y, 0.008) - m) * w;
    const p = pad(x, y, za);
    let d = smin(m, p, 0.004);
    // the labial groove along the pads; across the front the median lip runs on into the snout without it
    const sw = smoothstep(0.05, 0.11, za);
    if (sw > 0) d += (ssub(d, Math.hypot(m, p) - K.pad.seam.r, K.pad.seam.k) - d) * sw;
    return smin(d, rictal(x, y, za), K.rictal.blend);
  };

  // the cups, the crease behind the pad's rear end, the nostrils, the gill margin and slit: snapped onto the mass
  const snapped = (p) => { const q = smoothPath(snapToSurface(mass, p.path), p.radius, 40); return tube(snapToSurface(mass, q.points), q.radii); };
  const opercle = snapped(K.opercle);
  const rictalCrease = (() => { const f0 = (x, y, z) => upper(x, y, z); const q = smoothPath(snapToSurface(f0, K.rictalCrease.path), K.rictalCrease.radius, 30); return tube(snapToSurface(f0, q.points), q.radii); })();
  const nostril = tube([K.nostril.base, K.nostril.tip], K.nostril.r);
  const nostrilHole = sphere(K.nostril.tip, K.nostril.hole);
  const pore = sphere(K.nostrilPost.c, K.nostrilPost.r);
  const GS = K.gillSlit, chamber = ellipsoid(K.gillChamber.c, K.gillChamber.r);
  // the slit: a thin slot under the opercle's free edge, from the margin forward `reach`, `depth` under the skin
  const gillSlit = (x, y, z, m) => {
    const sm = sOp(y), along = sm - x; // > 0 in front of the margin
    const inY = Math.max(GS.y0 - y, y - GS.y1);
    const slot = Math.max(Math.abs(m + GS.depth) - GS.half, -along - 0.004, along - GS.reach, inY);
    // the opening: a sheet across the margin's rim from the outside down to the slot
    const open = Math.max(Math.abs(along - GS.edge) - GS.half, inY, -(m + GS.depth + GS.half));
    return Math.min(slot, open);
  };

  const f = (x, y, z) => {
    const za = Math.abs(z), w = front(x);
    const m0 = mass(x, y, z);
    let u = withCups(x, y, z, upper(x, y, z));
    u = ssub(u, rictalCrease(x, y, za), b.groove);
    // the lower jaw: its tissue below the gape, carved off the upper head by the slit's width in front of the rictus;
    // behind the rictus it fuses into the cheek and the throat
    let j = jawTissue(x, y, z);
    if (w > 0) j = smax(j, G.half * 2 * w * w * w - u, 0.002);
    let d = w > 0.999 ? Math.min(u, j) : smin(u, j, J.fuse * (1 - w));
    // the mouth cavity, reached through the slit
    d = ssub(d, cavity(x, y, z), b.cavity);
    // the eye sockets (the globes sit in them)
    d = ssub(d, socketL(x, y, za), b.socket);
    // the gill margin's fold, the slit through it and the chamber behind
    d = ssub(d, opercle(x, y, za), b.fold);
    const slot = gillSlit(x, y, za, m0);
    d = smax(d, -Math.min(slot, chamber(x, y, za)), GS.round * 0.5);
    // the nostrils
    d = smin(d, nostril(x, y, za), b.nostril);
    d = ssub(d, nostrilHole(x, y, za), 0.003);
    d = ssub(d, pore(x, y, za), 0.003);
    d = smax(d, K.floorY - y, b.floor);
    if (cut) d = smax(d, x - K.cutS, b.cut);
    return d;
  };
  f.parts = (x, y, z) => ({ f: upper(x, y, z), u: pad(x, y, Math.abs(z)), j: jawTissue(x, y, z) });
  f.cup = cup;
  return f;
}

/** Move points onto the zero set of f (Newton steps along its gradient). */
export function snapToSurface(f, points, steps = 12) {
  return points.map(([x, y, z]) => {
    for (let i = 0; i < steps; i++) {
      const d = f(x, y, z), e = 1e-4;
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const gg = gx * gx + gy * gy + gz * gz || 1;
      x -= (d * gx) / gg; y -= (d * gy) / gg; z -= (d * gz) / gg;
      if (Math.abs(d) < 1e-6) break;
    }
    return [x, y, z];
  });
}

/** The head's distance in mm (fish frame) for a head length of HLmm. */
export function headSDFmm(HLmm, K = HEAD_SCULPT, o) {
  const f = headSDF(K, o), k = 1 / HLmm;
  return (x, y, z) => f(x * k, y * k, z * k) * HLmm;
}
