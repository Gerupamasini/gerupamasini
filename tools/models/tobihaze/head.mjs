// The トビハゼ head as a signed-distance sculpt, in head lengths (HL) of the fish frame (anatomy.mjs).
//
// The mass of the head is a loft whose silhouettes are the measured outlines (HEAD_SCULPT.loft: the half-width seen
// from above, the dorsal and ventral profiles seen from the side, and per station the height of the widest point and
// the superellipse exponents that make the bell seen from the front: flat-floored and wide low at the cheeks, narrower
// up to the turret). On it, in order of importance: the eye turret with its two dermal cups and the sockets the globes
// sit in; the snout bulb over a low mouth with a thick upper-lip roll ending in lateral lobes; the cheek balloons
// ending in a rim at the opercle; then the small features that read at macro range (labial groove, gape, tubular
// anterior nostrils).
import { HEAD } from './anatomy.mjs';
import { ellipsoid, sphere, smin, smax, ssub, tube, smoothPath, clamp, smoothstep } from './sdf.mjs';

const nrm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };

/** Every tunable of the sculpt (HL units), so a comparison round can change one number at a time. */
export const HEAD_SCULPT = {
  // stations s with, per station: half-width w (seen from above), top yT and bottom yB (seen from the side), the
  // height yW of the widest point, and the exponents of the section above (nU) and below (nL) that height
  loft: {
    s:  [0.030, 0.038, 0.050, 0.070, 0.095, 0.125, 0.170, 0.250, 0.350, 0.450, 0.620, 0.800, 1.000, 1.150, 1.300],
    w:  [0.000, 0.060, 0.102, 0.142, 0.175, 0.205, 0.234, 0.276, 0.306, 0.324, 0.322, 0.322, 0.322, 0.320, 0.318],
    yT: [0.270, 0.320, 0.370, 0.425, 0.465, 0.505, 0.545, 0.575, 0.592, 0.612, 0.632, 0.640, 0.642, 0.645, 0.650],
    yB: [0.250, 0.205, 0.175, 0.145, 0.120, 0.095, 0.075, 0.055, 0.025, -0.005, -0.045, -0.045, -0.045, -0.035, -0.025],
    yW: [0.250, 0.250, 0.248, 0.246, 0.246, 0.246, 0.248, 0.250, 0.250, 0.250, 0.250, 0.255, 0.265, 0.280, 0.300],
    nU: [2.00, 2.05, 2.10, 2.10, 2.05, 1.95, 1.85, 1.75, 1.70, 1.75, 1.90, 2.00, 2.05, 2.00, 2.00],
    nL: [2.00, 2.00, 2.00, 2.00, 2.00, 2.02, 2.05, 2.10, 2.80, 3.10, 3.00, 2.95, 2.90, 2.80, 2.50],
  },
  snoutBulb: { c: [0.165, 0.26], r: [0.165, 0.182, 0.225] },
  cheekBalloon: { c: [0.70, 0.24], r: [0.58, 0.26, 0.355] },
  // the balloon ends at the opercle's margin in a rounded rim standing proud of the trunk (it does not fade out)
  cheekClip: { blend: 0.012 },
  turret: { c: [0.33, 0.515], r: [0.16, 0.115, 0.13] },
  chin: { c: [0.31, 0.08], r: [0.17, 0.045, 0.15] },
  // the dermal cup: a fleshy shell round the globe, open on the side the eye looks out of (normal in the fish frame:
  // forward is −s; openCos: the opening's edge as the cosine of its half-angle), its rim rounded
  cup: { thick: 0.029, taper: 0.45, gap: 0.0015, open: [-0.28, 0.88, 0.40], openCos: 0.05, rimRound: 0.03 },
  // the skin between the two cups: the domes press together along the midline down to a shallow notch
  septum: { c: [0.32, 0.60], r: [0.06, 0.06, 0.035] },
  // upper lip roll (left half, mirrored) from the front midline to the corner, and its lateral lobe
  lip: {
    path: [[0.105, 0.122, 0.0], [0.118, 0.119, 0.06], [0.150, 0.114, 0.12], [0.200, 0.110, 0.165], [0.255, 0.106, 0.195], [0.305, 0.100, 0.21]],
    radius: [0.020, 0.022, 0.025, 0.028, 0.034, 0.033],
    lobe: { c: [0.26, 0.122, 0.20], r: [0.10, 0.07, 0.065] },
  },
  lowerLip: {
    path: [[0.160, 0.080, 0.0], [0.170, 0.079, 0.08], [0.205, 0.073, 0.14], [0.260, 0.066, 0.18], [0.300, 0.062, 0.20]],
    radius: [0.012, 0.012, 0.012, 0.012, 0.011],
  },
  // along the lip's lower edge, the corners a little lower than the front (the pout)
  gape: {
    path: [[0.115, 0.088, 0.0], [0.122, 0.086, 0.07], [0.145, 0.081, 0.13], [0.195, 0.075, 0.18], [0.290, 0.068, 0.215]],
    radius: [0.0065, 0.0065, 0.0065, 0.006, 0.005],
  },
  // grooves drawn roughly in the fish frame and snapped onto the surface (snapToSurface) before they are carved
  labialGroove: {
    path: [[0.070, 0.165, 0.0], [0.080, 0.168, 0.10], [0.110, 0.178, 0.19], [0.180, 0.186, 0.245], [0.265, 0.180, 0.272], [0.320, 0.150, 0.272], [0.348, 0.112, 0.262], [0.350, 0.088, 0.248]],
    radius: [0.004, 0.005, 0.008, 0.010, 0.010, 0.009, 0.007, 0.004],
  },
  opercle: { path: [[1.012, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]], radius: [0.004, 0.010, 0.013, 0.013, 0.011, 0.006] },
  nostril: { base: [0.045, 0.302, 0.084], tip: [0.016, 0.294, 0.086], r: [0.010, 0.0085], hole: 0.004 },
  furrow: { c: [0.21, 0.53], r: [0.10, 0.05, 0.03] },
  floorY: -0.010,
  cutS: 1.3,
  blend: { bulb: 0.03, cheek: 0.03, chin: 0.05, turret: 0.045, cups: 0.042, septum: 0.02, lip: 0.012, lobe: 0.04, lowerLip: 0.015, groove: 0.014, fold: 0.008, gape: 0.006, nostril: 0.012, cavity: 0.010, floor: 0.04, cut: 0.02 },
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
  const bulb = el(K.snoutBulb), balloon = el(K.cheekBalloon), turret = el(K.turret), chin = el(K.chin);
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
  const cheek = (x, y, z) => smax(balloon(x, y, z), (x - sOp(y)) * 0.9, K.cheekClip.blend);
  const rc = re + K.cup.thick;
  const g = nrm(K.cup.open);
  const eyeL = [E.s, E.y, E.z];
  // the cup for the left eye (z > 0); the right one is the mirror image
  const cupL = (x, y, z) => {
    const px = x - eyeL[0], py = y - eyeL[1], pz = z - eyeL[2];
    const r = Math.hypot(px, py, pz) || 1e-9;
    const c = (px * g[0] + py * g[1] + pz * g[2]) / r;
    // the shell thins from its full thickness below to nothing at the rim: the skin runs onto the globe without a step
    const k = smoothstep(K.cup.openCos, K.cup.openCos - K.cup.taper, c);
    const shell = r - (re + K.cup.gap + (rc - re - K.cup.gap) * k);
    const open = c * r - K.cup.openCos * rc;
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
  const groove = snapped(K.labialGroove), opercle = snapped(K.opercle);

  return (x, y, z) => {
    const za = Math.abs(z);
    let d = base(x, y, z);
    d = ssub(d, groove(x, y, za), b.groove);
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
