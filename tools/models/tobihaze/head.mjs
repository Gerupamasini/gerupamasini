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
//   gill        the gill cover's margin a soft rounded rim standing proud of the trunk from the cover's top (y 0.50)
//               round to the throat; the opercular membrane fused to the body except a short slit under that rim on
//               the opercle's posterior edge, in front of the upper pectoral base, opening into the opercular chamber
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
    w:  [0.000, 0.060, 0.100, 0.138, 0.168, 0.200, 0.235, 0.278, 0.318, 0.336, 0.318, 0.290, 0.272, 0.282, 0.310],
    yT: [0.250, 0.300, 0.345, 0.392, 0.440, 0.482, 0.522, 0.560, 0.585, 0.603, 0.615, 0.620, 0.622, 0.625, 0.628],
    yB: [0.200, 0.170, 0.150, 0.128, 0.110, 0.095, 0.080, 0.060, 0.025, -0.005, -0.045, -0.045, -0.045, -0.035, -0.025],
    yW: [0.230, 0.235, 0.245, 0.260, 0.275, 0.290, 0.305, 0.310, 0.290, 0.250, 0.220, 0.220, 0.230, 0.245, 0.260],
    nU: [2.00, 2.05, 2.10, 2.10, 2.05, 1.95, 1.85, 1.80, 1.50, 1.70, 1.70, 1.70, 1.70, 1.70, 1.75],
    nL: [2.00, 1.90, 1.75, 1.60, 1.50, 1.50, 1.50, 1.55, 2.20, 3.40, 3.60, 3.60, 3.40, 3.10, 2.70],
  },
  // the near-vertical rounded front of the face, its most anterior point just above the pads' front ends
  snoutBulb: { c: [0.185, 0.240], r: [0.185, 0.185, 0.210] },
  cheekBalloon: { c: [0.73, 0.235], r: [0.62, 0.30, 0.35] },
  cheekRear: { c: [0.90, 0.235], r: [0.16, 0.235, 0.33], blend: 0.06 },
  cheekClip: { blend: 0.008 },
  // the block the eyes stand on, and its low front face (the "fleshy ridge anterior to the eyes", Murdy)
  turret: { c: [0.335, 0.525], r: [0.16, 0.12, 0.15] },
  // the window axis of the eye at rest (27° forward of lateral, 4° up: eye.mjs EYE_SCULPT.axis), for the charts of the
  // socket and the socket's carve round the window
  cup: {
    open: [-0.4529, 0.0698, 0.8889],
    gap: 0.0015,
    // the rim: its height above the globe's centre against the azimuth about the vertical (Δ from the low point,
    // which lies under the window, `low` degrees forward of lateral): h = A − B cos Δ − C cos 2Δ; low under the
    // window (−0.075), at the pupil's level front and back (−0.012), well above the centre medially (+0.065), where
    // the two cups fill the notch between the domes
    low: 25, A: -0.025, B: 0.039, C: 0.004,
    // the bead tapers away from the window (a real lip only under it; front, back and medially the skin runs onto
    // the dome), and the head is filleted onto the globe front and back
    taper: { from: 60, to: 120, thickMin: 0.2, roundMax: 0.018 },
    fillet: { k: 0.03, from: 60, to: 110, inset: 0.008 },
    // the web between the domes: the smooth union of the two globes (a dumbbell neck), its saddle the notch 0.15 ED
    // under the domes' tops (u5, B002: the domes touch up to a shallow notch), capped above it
    neck: { k: 0.13, inset: 0.008, top: 0.725, cap: 0.02 },
    // the socket is carved round the globe only inside the cup (up to `carveTop` [from, to] above the rim) and round
    // the window's side (within `carveWin` [from, to] degrees of the window's axis, where the cornea lies under the
    // skin's level); elsewhere the head's surface runs into the globe, so the web, the fillets and the rim's ends meet
    // it in clean lines instead of paper-thin wedges of skin over it (which mesh ragged). The insets above keep the
    // head inside the globe deeper than the cornea's recess, so it never shows through the window when the eye turns
    carveTop: [-0.014, 0.002], carveWin: [62, 78],
    // the bead of the rim: a shell `thick` proud of the globe, its edge rounded by `round`
    thick: 0.020, round: 0.010,
    // the collar under the bead: a fleshy column about the globe's vertical axis, radius r at the top flaring to rBase
    // at the infraorbital crease (y0), starting `drop` below the rim, blended into the bead
    // the collar: a fleshy ring round the lower globe, wider than the globe, sitting on the head; its underside curls
    // in to the infraorbital crease (y0: its centre, r: horizontal and vertical radii)
    collar: { y0: 0.528, r: [0.124, 0.054, 0.110], blend: 0.030 },
    crease: { r: 0.005, k: 0.008 },
  },
  // the skin between the two cups: the domes press together along the midline down to a shallow notch
  septum: { c: [0.33, 0.60], r: [0.10, 0.07, 0.045] },
  // ---- mouth
  // the gape: the closed mouth's line (y at the front, at the rictus), the slit's half-width (the gap is more than
  // two cells of the hero mesh, 0.075 mm, so the lips mesh as two clean edges and part cleanly when the jaw drops),
  // the rictus (where the upper head's cut ends), the slit's rounded end under the pad's rear end (slitEnd,
  // endRound), the rounding of the lower lip's edge
  // lean: the cut behind the rictus tilts back along the crease (no wall across the throat)
  gape: { yFront: 0.100, yBack: 0.092, half: 0.005, rictus: 0.290, close: 0.050, lean: 1.3, slitEnd: 0.290, endRound: 0.010, edge: 0.011 },
  // the upper lip (left half, mirrored): a swept roll from the thin median lip at the front midline along the
  // premaxilla's arm to the pad's rounded rear end over the maxilla's tip; a little taller than wide in section, its
  // rear end the fattest part; it hangs over the lower jaw's side (Murdy 1989: the upper lip overlaps both jaws when
  // the mouth is closed), 0.06–0.20 HL in side view (0.63 ED tall, 1.25 ED long: B006, B008, B009, B067)
  pad: {
    // the median lip: thin, from the front midline under the snout bulb to the pad's front end; it hangs over the
    // lower lip's front (Murdy 1989: the upper lip overlaps both jaws' teeth when the mouth is closed)
    // (blend: across the front it flows out of the snout without a crease, so the bulb's lower front runs on into it)
    // its lower edge reaches y 0.083, below the premaxillary canines' tips (0.079–0.09), so no tooth shows at rest
    median: { path: [[0.066, 0.101, 0.000], [0.068, 0.102, 0.040], [0.082, 0.112, 0.080], [0.104, 0.128, 0.118]], radius: [0.018, 0.018, 0.018, 0.022], blend: 0.025 },
    // the pad: a bean along the premaxilla's arm, its front end narrower and tucked under the bulb, its rear end the
    // fattest part, round, over the maxilla's tip at the rictus; sy: the section's vertical stretch
    path: [[0.100, 0.132, 0.122], [0.140, 0.132, 0.155], [0.185, 0.130, 0.180], [0.225, 0.128, 0.197], [0.255, 0.127, 0.208]],
    radius: [0.036, 0.054, 0.064, 0.069, 0.066],
    sy: 1.13,
    samples: 64,
    // the snout's skin sheath over the pad: a roll along its top carrying the face's side down onto it (from the front
    // the face runs on into the pads without a waist, B001, u5)
    sheath: { path: [[0.120, 0.200, 0.145], [0.160, 0.208, 0.170], [0.200, 0.213, 0.186], [0.240, 0.213, 0.196], [0.280, 0.208, 0.202], [0.320, 0.200, 0.205]], radius: [0.030, 0.044, 0.050, 0.050, 0.045, 0.030], k: 0.03 },
    // the labial groove: the fine crease where the sheath meets the pad (along its top and round its rear end)
    seam: { r: 0.003, k: 0.007 },
    // below the middle of the rear end the groove fades into the rictal fold's web
    web: { s: [0.26, 0.31], y: [0.095, 0.125], k: 0.025 },
  },
  // the lower jaw's tissue (left half): the mandible's flesh round the dentary rami, the floor between them, the
  // thin lower lip along the dentary's outer edge (just under the pads), and the narrow chin knob
  jaw: {
    ramus: { path: [[0.098, 0.102, 0.000], [0.108, 0.101, 0.040], [0.143, 0.098, 0.084], [0.204, 0.092, 0.126], [0.276, 0.087, 0.158], [0.340, 0.084, 0.182]], radius: [0.012, 0.013, 0.015, 0.018, 0.022, 0.028] },
    floor: { c: [0.34, 0.060], r: [0.25, 0.060, 0.15] },
    lip: { path: [[0.088, 0.100, 0.000], [0.091, 0.100, 0.040], [0.104, 0.099, 0.070], [0.145, 0.098, 0.094], [0.198, 0.097, 0.116], [0.255, 0.095, 0.136], [0.295, 0.092, 0.150]], radius: [0.0065, 0.0065, 0.006, 0.0055, 0.005, 0.0045, 0.004] },
    chin: { c: [0.120, 0.084], r: [0.034, 0.024, 0.042] },
    blend: 0.05, fuse: 0.05,
  },
  // the rictal fold: the web joining the pad's rear end to the lower lip at the corner, and its crease running on down
  // and back onto the cheek
  // (the web sits under the pad's rear end; the crease is the groove's continuation from the rear end's foot down to
  // the underside, B012, B013)
  rictal: { c: [0.292, 0.088, 0.195], r: [0.022, 0.022, 0.022], blend: 0.03 },
  rictalCrease: { path: [[0.322, 0.075, 0.240], [0.334, 0.055, 0.240], [0.345, 0.035, 0.230], [0.355, 0.018, 0.210]], radius: [0.0035, 0.0035, 0.003, 0.0025] },
  // the mouth cavity behind the gape (left half of a symmetric volume): it reaches forward to the lips' inner faces,
  // up under the palate and back into the pharynx, between the jaws
  cavity: { front: { c: [0.122, 0.128, 0], r: [0.052, 0.020, 0.072] }, mid: { c: [0.235, 0.152, 0], r: [0.140, 0.045, 0.125] }, back: { c: [0.430, 0.172, 0], r: [0.150, 0.060, 0.135] }, blend: 0.03 },
  tongue: { c: [0.250, 0.120, 0], r: [0.085, 0.022, 0.050] },
  // the anterior nostril: a short tube on the front of the snout pointing forward and down (B012: y 0.35–0.40), its
  // base snapped onto the snout (base: the point it is snapped from, sunk `sink` into the skin, `len` long); the
  // posterior nostril a small pore just in front of the eye
  nostril: { base: [0.050, 0.365, 0.074], dir: [-0.42, -0.9, 0.12], len: 0.013, sink: 0.003, r: [0.0052, 0.0030], hole: 0.0022 },
  nostrilPost: { c: [0.190, 0.500, 0.119], r: 0.0045 },
  // the opercle's margin: the skin edge just outside the opercular series' posterior margin (skull.mjs opPostDorsal
  // 0.99/0.46 … sopCurve), from the cover's top (y ≈ 0.50, where its dorsal edge turns forward under the nape) down and
  // round to the throat. The gill cover in front of it stands proud of the trunk behind (u1, B010, B012, A070: a soft
  // rounded rim with the body stepping in behind it): the surface is moved out by `cover.t` toward the margin (from
  // `cover.from` in front of it, full at `cover.full`) over the heights `cover.y`, the rim's edge a soft step `cover.edge`
  // wide across the margin; no bead (radius 0)
  opercle: {
    path: [[0.996, 0.50, 0.25], [1.014, 0.44, 0.29], [1.032, 0.36, 0.325], [1.032, 0.26, 0.34], [1.007, 0.15, 0.33], [0.962, 0.06, 0.29], [0.912, 0.02, 0.24]],
    radius: [0, 0, 0, 0, 0, 0, 0],
    cover: { t: 0.016, from: 0.10, full: 0.03, y: [0.0, 0.07, 0.43, 0.52], edge: 0.012 },
  },
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
export function cupField(K = HEAD_SCULPT, eyeDy = 0) {
  const E = HEAD.eye, re = E.d / 2, C = K.cup, lo = (C.low * Math.PI) / 180;
  const c = [E.s, E.y + eyeDy, E.z];
  // azimuth about the vertical through the globe's centre: 0 lateral (+z), +90° forward (−s)
  const rimH = (px, pz) => { const D = Math.atan2(-px, pz) - lo; return C.A - C.B * Math.cos(D) - C.C * Math.cos(2 * D); };
  const col = C.collar;
  const collarE = ellipsoid([c[0], col.y0, c[2]], [col.r[0], col.r[1], col.r[2] ?? col.r[0]]);
  return {
    rimH,
    field: (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const r = Math.hypot(px, py, pz), h = rimH(px, pz);
      // the bead: a shell hugging the globe, thinning away from the window
      const T = C.taper, cD = Math.cos(Math.atan2(-px, pz) - lo);
      const tw = T ? smoothstep(Math.cos((T.from * Math.PI) / 180), Math.cos((T.to * Math.PI) / 180), cD) : 0;
      const thick = C.thick * (1 - (1 - (T ? T.thickMin : 1)) * tw), round = C.round + ((T ? T.roundMax : C.round) - C.round) * tw;
      const bead = r - (re + C.gap + thick);
      // the collar ring (an oblate ellipsoid about the globe's vertical axis)
      const ring = collarE(x, y, z);
      const body = smin(bead, ring, col.blend);
      // everything above the rim is cut away, the edge rounded into a lip
      return smax(body, py - h, round);
    },
  };
}

/** The head's distance function in HL units (s, y, z); f.parts gives the parts (for the section plots and the rig). */
export function headSDF(K = HEAD_SCULPT, { cut = true, eyeDy = 0 } = {}) {
  const E = HEAD.eye, re = E.d / 2;
  const el = (p, zc = 0) => ellipsoid([p.c[0], p.c[1], zc], p.r);
  const loft = loftSDF(loftTables(K.loft));
  const bulb = el(K.snoutBulb), balloon = el(K.cheekBalloon), turret = el(K.turret);
  // the opercle's margin as s at height y (its path's own s, y), where the balloon ends in a rim
  const opP = K.opercle.path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  // (a cubic Hermite through the path's points: the rim and the slit follow a smooth curve, not a polyline)
  const opT = opP.map((_, i) => {
    const a = opP[Math.max(0, i - 1)], c = opP[Math.min(opP.length - 1, i + 1)];
    return (c[0] - a[0]) / (c[1] - a[1]);
  });
  const sOp = (y) => {
    if (y <= opP[0][1]) return opP[0][0];
    for (let i = 0; i + 1 < opP.length; i++) {
      const [s1, y1] = opP[i], [s2, y2] = opP[i + 1];
      if (y <= y2) {
        const h = y2 - y1, t = (y - y1) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * s1 + (t3 - 2 * t2 + t) * h * opT[i] + (-2 * t3 + 3 * t2) * s2 + (t3 - t2) * h * opT[i + 1];
      }
    }
    return opP[opP.length - 1][0];
  };
  const rear = el(K.cheekRear);
  const cheek = (x, y, z) => smax(smin(balloon(x, y, z), rear(x, y, z), K.cheekRear.blend), (x - sOp(y)) * 0.9, K.cheekClip.blend);
  // eyeDy: the globe moved along y (the blink's morph target is the head built round a retracted eye)
  const cup = cupField(K, eyeDy), cupL = cup.field;
  const eyeL = [E.s, E.y + eyeDy, E.z];
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
  const front = (x, y = 1, lean = G.lean ?? 0) => 1 - smoothstep(G.rictus - G.close * 0.4, G.rictus + G.close * 0.6, x - lean * Math.max(0, gapeY(x) - y));
  const padP = smoothPath(K.pad.path, K.pad.radius, K.pad.samples), medP = smoothPath(K.pad.median.path, K.pad.median.radius, 24);
  const bean0 = tube(padP.points, padP.radii, 0.2), median = tube(medP.points, medP.radii, 0.2);
  // the pad's section is a little taller than wide (sy: the vertical stretch about the path's height)
  const psy = K.pad.sy ?? 1, pyc = K.pad.path.reduce((a, p) => a + p[1], 0) / K.pad.path.length;
  const bean = psy === 1 ? bean0 : (x, y, z) => bean0(x, pyc + (y - pyc) / psy, z) * Math.min(1, psy);
  const pad = (x, y, z) => smin(bean(x, y, z), median(x, y, z), 0.02);
  // the snout's skin sheath over the pad (Murdy 1989): a fleshy roll along the pad's top that carries the face's side
  // down onto the pad, so the face has no waist over the pad seen from the front; the labial groove is where it
  // meets the pad
  const SH = K.pad.sheath;
  const sheath = SH ? (() => { const q = smoothPath(SH.path, SH.radius, 40); return tube(q.points, q.radii, 0.2); })() : null;
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
    const za = Math.abs(z), w = front(x, y);
    let m = mass(x, y, z);
    if (sheath) m = smin(m, sheath(x, y, za), SH.k);
    if (w > 0) m += (smax(m, gapeY(x) - y, 0.008) - m) * w;
    const p = pad(x, y, za);
    // the labial groove along the pad's top and round its rear end (across the front the median lip runs on into the
    // snout without it); below the middle of the rear end it fades, and the pad runs into the cheek through the
    // rictal fold, a soft web (web: the s and y ranges where it takes over, its blend)
    const RW = K.pad.web, rw = RW ? smoothstep(RW.s[0], RW.s[1], x) * (1 - smoothstep(RW.y[0], RW.y[1], y)) : 0;
    // across the front the median lip flows out of the snout (a soft blend, no crease: the sheath runs on into it)
    const mb = K.pad.median.blend ? K.pad.median.blend * (1 - smoothstep(0.04, 0.09, za)) : 0;
    let d = smin(m, p, Math.max(mb, 0.004 + (RW ? (RW.k - 0.004) * rw : 0)));
    const sw = smoothstep(0.05, 0.11, za) * (1 - rw);
    if (sw > 0) d += (ssub(d, Math.hypot(m, p) - K.pad.seam.r, K.pad.seam.k) - d) * sw;
    return smin(d, rictal(x, y, za), K.rictal.blend);
  };

  // the cups, the crease behind the pad's rear end, the nostrils, the gill margin and slit: snapped onto the mass
  const snapped = (p) => { const q = smoothPath(snapToSurface(mass, p.path), p.radius, 40); return tube(snapToSurface(mass, q.points), q.radii); };
  const opercle = K.opercle.radius.some((r) => r > 0) ? snapped(K.opercle) : null;
  // the gill cover: the surface moved out toward the margin, a soft step across it
  const OC = K.opercle.cover;
  const coverT = OC ? (x, y) => {
    if (y <= OC.y[0] || y >= OC.y[3]) return 0;
    const a = sOp(y) - x;
    if (a <= -OC.edge * 0.25 || a >= OC.from) return 0;
    const wy = smoothstep(OC.y[0], OC.y[1], y) * (1 - smoothstep(OC.y[2], OC.y[3], y));
    return OC.t * wy * (1 - smoothstep(OC.full, OC.from, a)) * smoothstep(-OC.edge * 0.25, OC.edge, a);
  } : null;
  const rictalCrease = (() => { const f0 = (x, y, z) => upper(x, y, z); const q = smoothPath(snapToSurface(f0, K.rictalCrease.path), K.rictalCrease.radius, 30); return tube(snapToSurface(f0, q.points), q.radii); })();
  // the anterior nostril grows out of the snout's skin: its base is snapped onto the outer mass (so it never floats
  // off a reshaped snout) and sunk a little into it, the tube running `len` along `dir` (forward and down)
  const NO = K.nostril;
  const nostrilAt = (() => {
    if (!NO.dir) return { base: NO.base, tip: NO.tip };
    const p = snapToSurface(mass, [NO.base])[0], dl = nrm(NO.dir);
    return { base: p.map((c, k) => c - dl[k] * NO.sink), tip: p.map((c, k) => c + dl[k] * NO.len) };
  })();
  const nostril = tube([nostrilAt.base, nostrilAt.tip], NO.r);
  const nostrilHole = sphere(nostrilAt.tip, NO.hole);
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
    const za = Math.abs(z), w = front(x, y);
    const m0 = mass(x, y, z);
    let u = withCups(x, y, z, upper(x, y, z));
    u = ssub(u, rictalCrease(x, y, za), b.groove);
    // the lower jaw: its tissue below the gape, carved off the upper head by the slit's width in front of the rictus;
    // behind the rictus it fuses into the cheek and the throat
    let j = jawTissue(x, y, z);
    // the slit between the lips: full width (two hero cells and more) up to its rounded end under the pad's rear
    // end (slitEnd), so it never tapers into a sliver the mesh cannot resolve, and never opens on the cheek behind
    // the pad; without slitEnd it tapers shut over the rictus
    if (G.slitEnd !== undefined) {
      j = smax(j, smin(G.half * 2 - u, G.slitEnd - x, G.endRound ?? 0.01), G.edge ?? 0.002);
    } else {
      const wg = G.gapLean === undefined ? w : front(x, y, G.gapLean);
      if (wg > 0) j = smax(j, G.half * 2 * wg * wg * wg - u, G.edge ?? 0.002);
    }
    // behind the rictus, and everywhere low down on the throat, the jaw's tissue fuses into the head
    const kf = J.fuse * Math.max(1 - w, 1 - smoothstep(0.03, 0.06, y));
    let d = kf > 1e-4 ? smin(u, j, kf) : Math.min(u, j);
    // the mouth cavity, reached through the slit
    d = ssub(d, cavity(x, y, z), b.cavity);
    // the head filleted onto the globes front and back, and the neck between the two domes
    const C = K.cup, FL = C.fillet, NK = C.neck, epx = x - eyeL[0], epy = y - eyeL[1];
    if (FL) {
      const az = Math.atan2(-epx, za - eyeL[2]) - (C.low * Math.PI) / 180;
      const wf = smoothstep(Math.cos((FL.from * Math.PI) / 180), Math.cos((FL.to * Math.PI) / 180), Math.cos(az)) * smoothstep(0, 0.03, za - 0.02);
      if (wf > 0) d = smin(d, Math.hypot(epx, epy, za - eyeL[2]) - (re - FL.inset), FL.k * wf);
    }
    if (NK) {
      const dl = Math.hypot(epx, epy, z - eyeL[2]) - (re - NK.inset), dr = Math.hypot(epx, epy, z + eyeL[2]) - (re - NK.inset);
      d = smin(d, smax(smin(dl, dr, NK.k), y - NK.top, NK.cap), 0.01);
    }
    // the eye sockets (the globes sit in them)
    if (K.cup.carveTop) {
      // the socket is carved only round the lower globe, inside the cup: above the rim the head's surface simply runs
      // into the globe (no paper-thin wedge of skin over it, which meshes ragged), so the junction is a clean line
      // (and always round the window's side of the globe, where the cornea lies under the skin's level)
      const [m0, m1] = K.cup.carveTop, hr = cup.rimH(epx, za - eyeL[2]), O = K.cup.open, epz = za - eyeL[2];
      const cw = (O[0] * epx + O[1] * epy + O[2] * epz) / (Math.hypot(epx, epy, epz) || 1);
      const wc = Math.max(1 - smoothstep(hr + m0, hr + m1, epy), smoothstep(Math.cos((K.cup.carveWin[1] * Math.PI) / 180), Math.cos((K.cup.carveWin[0] * Math.PI) / 180), cw));
      if (wc > 0) d += (ssub(d, socketL(x, y, za), b.socket) - d) * wc;
    } else d = ssub(d, socketL(x, y, za), b.socket);
    // the gill margin's fold, the slit through it and the chamber behind
    if (coverT) d -= coverT(x, y);
    if (opercle) d = smin(d, opercle(x, y, za), b.fold);
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
