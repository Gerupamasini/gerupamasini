// The トビハゼ head as a signed-distance sculpt, in head lengths (HL) of the fish frame (anatomy.mjs).
//
// The mass of the head is a loft whose silhouettes are the measured outlines (HEAD_SCULPT.loft: the half-width seen
// from above, the dorsal and ventral profiles seen from the side, and per station the height of the widest point and
// the superellipse exponents that make the bell seen from the front: flat-floored and wide low at the cheeks, narrower
// up to the turret). On it, in order of importance: the eye turret with its two dermal cups and the sockets the globes
// sit in; the snout bulb over a low mouth with a thick upper-lip roll ending in lateral lobes; the cheek balloons; then
// the small features that read at macro range (labial groove, gape, tubular anterior nostrils, the arch over the
// snout bulb, the opercle's soft margin).
import { HEAD } from './anatomy.mjs';
import { ellipsoid, sphere, smin, smax, ssub, tube, smoothPath, clamp } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

/** Every tunable of the sculpt (HL units), so a comparison round can change one number at a time. */
export const HEAD_SCULPT = {
  // stations s with, per station: half-width w (seen from above), top yT and bottom yB (seen from the side), the
  // height yW of the widest point, and the exponents of the section above (nU) and below (nL) that height
  loft: {
    s:  [0.030, 0.038, 0.050, 0.070, 0.095, 0.125, 0.170, 0.250, 0.350, 0.450, 0.620, 0.800, 1.000, 1.150, 1.300],
    w:  [0.000, 0.065, 0.112, 0.158, 0.196, 0.228, 0.256, 0.300, 0.345, 0.350, 0.350, 0.346, 0.330, 0.315, 0.305],
    yT: [0.270, 0.340, 0.400, 0.458, 0.502, 0.536, 0.562, 0.580, 0.592, 0.612, 0.632, 0.640, 0.642, 0.645, 0.650],
    yB: [0.250, 0.205, 0.175, 0.145, 0.120, 0.085, 0.045, 0.012, -0.004, -0.008, -0.010, -0.010, -0.008, -0.004, 0.000],
    yW: [0.250, 0.250, 0.248, 0.246, 0.246, 0.246, 0.248, 0.250, 0.250, 0.250, 0.250, 0.255, 0.265, 0.280, 0.300],
    nU: [2.00, 2.10, 2.20, 2.25, 2.25, 2.15, 2.00, 1.80, 1.60, 1.50, 1.50, 1.55, 1.70, 1.90, 2.00],
    nL: [2.00, 2.00, 2.00, 2.00, 2.00, 2.05, 2.10, 2.20, 2.40, 2.70, 3.00, 3.00, 2.80, 2.50, 2.30],
  },
  snoutBulb: { c: [0.17, 0.30], r: [0.17, 0.19, 0.25] },
  cheekBalloon: { c: [0.66, 0.24], r: [0.37, 0.235, 0.36] },
  turret: { c: [0.33, 0.515], r: [0.16, 0.115, 0.15] },
  chin: { c: [0.29, 0.045], r: [0.16, 0.045, 0.15] },
  // the dermal cup: a fleshy shell round the globe, open on the side the eye looks out of (normal in the fish frame:
  // forward is −s; openCos: the opening's edge as the cosine of its half-angle), its rim rounded
  cup: { thick: 0.03, gap: 0.003, open: [-0.33, 0.80, 0.50], openCos: 0.06, rimRound: 0.025 },
  // the skin between the two cups: the domes press together along the midline down to a shallow notch
  septum: { c: [0.32, 0.60], r: [0.06, 0.06, 0.035] },
  // upper lip roll (left half, mirrored) from the front midline to the corner, and its lateral lobe
  lip: {
    path: [[0.110, 0.122, 0.0], [0.116, 0.119, 0.08], [0.138, 0.114, 0.15], [0.180, 0.110, 0.200], [0.240, 0.106, 0.220], [0.290, 0.100, 0.225]],
    radius: [0.016, 0.019, 0.026, 0.032, 0.035, 0.032],
    lobe: { c: [0.245, 0.124, 0.208], r: [0.105, 0.066, 0.056] },
  },
  lowerLip: {
    path: [[0.140, 0.072, 0.0], [0.150, 0.071, 0.09], [0.185, 0.064, 0.16], [0.240, 0.056, 0.20], [0.295, 0.050, 0.215]],
    radius: [0.012, 0.012, 0.012, 0.012, 0.011],
  },
  // along the lip's lower edge, the corners a little lower than the front (the pout)
  gape: {
    path: [[0.100, 0.090, 0.0], [0.108, 0.088, 0.09], [0.132, 0.082, 0.165], [0.195, 0.072, 0.218], [0.300, 0.062, 0.236]],
    radius: [0.0065, 0.0065, 0.0065, 0.006, 0.005],
  },
  // grooves drawn roughly in the fish frame and snapped onto the surface (snapToSurface) before they are carved
  labialGroove: {
    path: [[0.070, 0.165, 0.0], [0.080, 0.168, 0.10], [0.110, 0.180, 0.19], [0.180, 0.195, 0.245], [0.265, 0.188, 0.275], [0.320, 0.158, 0.278], [0.350, 0.115, 0.268], [0.360, 0.075, 0.252]],
    radius: [0.009, 0.009, 0.010, 0.010, 0.010, 0.010, 0.009, 0.008],
  },
  // the faint valley each side of the snout bulb, from below the eye's front down to the lip corner
  bulbArch: { path: [[0.20, 0.445, 0.18], [0.235, 0.40, 0.225], [0.25, 0.32, 0.25], [0.265, 0.24, 0.262], [0.285, 0.17, 0.262]], radius: [0.002, 0.003, 0.003, 0.003, 0.002] },
  opercle: { path: [[1.0, 0.44, 0.29], [1.02, 0.36, 0.325], [1.02, 0.26, 0.34], [0.995, 0.15, 0.33], [0.95, 0.06, 0.29], [0.90, 0.02, 0.24]], radius: [0.001, 0.002, 0.003, 0.003, 0.003, 0.002] },
  nostril: { base: [0.075, 0.172, 0.070], tip: [0.050, 0.158, 0.072], r: [0.0095, 0.008], hole: 0.0045 },
  furrow: { c: [0.21, 0.53], r: [0.10, 0.05, 0.03] },
  floorY: -0.015,
  cutS: 1.3,
  blend: { bulb: 0.06, cheek: 0.05, chin: 0.05, turret: 0.045, cups: 0.04, septum: 0.02, lip: 0.022, lobe: 0.05, lowerLip: 0.015, groove: 0.014, fold: 0.012, arch: 0.02, gape: 0.006, nostril: 0.008, cavity: 0.006, floor: 0.04, cut: 0.02 },
};

/** Sample the loft's station tables into dense arrays (Catmull-Rom between stations). */
function loftTables(L, n = 2048) {
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
function loftSDF(T) {
  const { n, sMax, s0 } = T;
  return (x, y, z) => {
    const sc = clamp(x, s0 + 2e-3, sMax);
    const f = (sc / sMax) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const L = (a) => a[i] + (a[i + 1] - a[i]) * t;
    const w = Math.max(1e-4, L(T.w)), yT = L(T.yT), yB = L(T.yB), yW = L(T.yW);
    const up = y >= yW;
    const hh = Math.max(1e-4, up ? yT - yW : yW - yB);
    const nn = up ? L(T.nU) : L(T.nL);
    const u = Math.abs(z) / w, v = Math.abs(y - yW) / hh;
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

/** The head's distance function in HL units (s, y, z). */
export function headSDF(K = HEAD_SCULPT, { cut = true } = {}) {
  const E = HEAD.eye, re = E.d / 2;
  const el = (p, zc = 0) => ellipsoid([p.c[0], p.c[1], zc], p.r);
  const loft = loftSDF(loftTables(K.loft));
  const bulb = el(K.snoutBulb), cheek = el(K.cheekBalloon), turret = el(K.turret), chin = el(K.chin);
  const rc = re + K.cup.thick;
  const g = nrm(K.cup.open);
  const eyeL = [E.s, E.y, E.z];
  // the cup for the left eye (z > 0); the right one is the mirror image
  const cupL = (x, y, z) => {
    const px = x - eyeL[0], py = y - eyeL[1], pz = z - eyeL[2];
    const shell = Math.hypot(px, py, pz) - rc;
    const open = px * g[0] + py * g[1] + pz * g[2] - K.cup.openCos * rc;
    return smax(shell, open, K.cup.rimRound);
  };
  const cavityL = sphere(eyeL, re + K.cup.gap);
  const lipP = smoothPath(K.lip.path, K.lip.radius, 24);
  const lipRoll = tube(lipP.points, lipP.radii);
  const lobe = ellipsoid(K.lip.lobe.c, K.lip.lobe.r);
  const llP = smoothPath(K.lowerLip.path, K.lowerLip.radius, 20);
  const lowerLip = tube(llP.points, llP.radii);
  const gP = smoothPath(K.gape.path, K.gape.radius, 20);
  const gape = tube(gP.points, gP.radii);
  const septum = el(K.septum);
  const nostril = tube([K.nostril.base, K.nostril.tip], K.nostril.r);
  const nostrilHole = sphere(K.nostril.tip, K.nostril.hole);
  const furrow = el(K.furrow);
  const b = K.blend;

  // the additive mass (what the grooves are snapped onto)
  const base = (x, y, z) => {
    const za = Math.abs(z);
    let d = loft(x, y, z);
    d = smin(d, bulb(x, y, z), b.bulb);
    d = smin(d, cheek(x, y, z), b.cheek);
    d = smin(d, chin(x, y, z), b.chin);
    d = smin(d, turret(x, y, z), b.turret);
    d = smin(d, cupL(x, y, za), b.cups);
    d = smin(d, septum(x, y, z), b.septum);
    d = smin(d, smin(lipRoll(x, y, za), lobe(x, y, za), b.lobe), b.lip);
    d = smin(d, lowerLip(x, y, za), b.lowerLip);
    return d;
  };
  const snapped = (p) => { const q = smoothPath(snapToSurface(base, p.path), p.radius, 40); return tube(q.points, q.radii); };
  const groove = snapped(K.labialGroove), arch = snapped(K.bulbArch), opercle = snapped(K.opercle);

  return (x, y, z) => {
    const za = Math.abs(z);
    let d = base(x, y, z);
    d = ssub(d, groove(x, y, za), b.groove);
    d = ssub(d, arch(x, y, za), b.arch);
    d = ssub(d, opercle(x, y, za), b.fold);
    d = ssub(d, gape(x, y, za), b.gape);
    d = smin(d, nostril(x, y, za), b.nostril);
    d = ssub(d, nostrilHole(x, y, za), 0.003);
    d = ssub(d, cavityL(x, y, za), b.cavity);
    d = smax(d, K.floorY - y, b.floor);
    if (cut) d = smax(d, x - K.cutS, b.cut);
    return d;
  };
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
