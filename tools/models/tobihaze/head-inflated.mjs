// The トビハゼ head with its cheeks and gill covers inflated (the owner's photo u5; B018, B024, A070): the head of
// head.mjs inside a balloon of skin, the target of the rig's `inflate` blend shape (headrig.mjs inflateTargets, the
// poses `inflated` and `inflatedHalf`). The bind mesh is carried onto it across each cross-section; the snout, the lower
// lip and chin, the eye domes and their collars keep their shape, and what rides on the skin (the gill margin with its
// shut slit, the pads' hind ends) goes out with it.
//
// What inflates (research/anat_soft.md §3.4, anat_mech.md §3): the mouth and gill chambers fill with water or air, the
// suspensoria and the gill covers swing out, the hyoid drops and the branchiostegal membrane balloons the throat, the
// gill slits stay shut and the skin stretches taut. Measured on u5 (front view, the camera ≈6° above, scaled by the
// eye pair): the head 2.5 eye pairs wide (1.05 HL, +50 % on the relaxed 0.70), its outline widest at y ≈ 0.15–0.2 and
// narrowing above to its top shoulders at y ≈ 0.43, the throat down to y ≈ −0.15; one inner contour per side, a
// crescent of gill cover outside the cheek. Seen from above (B018, B024) the head is one smooth convex pear from the
// eyes to its widest point, no waist; the bones fill it: the gill covers, abducted (headrig.mjs HEAD_POSES.inflated),
// carry the widest part over their hind half, the throat hangs under the dropped hyoid. The upper lip's pads stay on
// their jaw bones and the swollen cheek closes round their hind ends (headrig.mjs INFLATE_TISSUE).
import { HEAD_SCULPT, headSDF, loftTables, loftSDF } from './head.mjs';
import { smin, smax, smoothstep } from './sdf.mjs';

/**
 * The balloon (HL, symmetric about the midline), lofted like the head (head.mjs loftSDF, its tables smoothed along s):
 * per station s its half-width w, top yT, bottom yB, the height yW of its widest point and the exponents of its section
 * above (nU) and below (nL) that height. The stations sample smooth profiles every 0.05 HL (a taut skin: no banding at
 * the stations): w rises convexly from the snout to its widest (0.525 at s ≈ 0.8, over the abducted gill covers) and
 * rounds off to the gill margin; within 0.01 HL of u5's front outline at every height up to the shoulders; the throat
 * deepest at s 0.6–0.7 (A070), low enough under the chin for the dropped hyoid (y −0.025 at s 0.3); above the widest
 * height the cheek's section narrows (nU 1.65 at s 0.7, over the gill cover's hinge, where the skin lies on the
 * opercle's front edge) and the gill cover's is fuller (nU 2.65 at s 0.95, round the abducted opercle's hind half).
 */
export const INFLATE = {
  loft: {
    s:  [0.200, 0.250, 0.300, 0.350, 0.400, 0.450, 0.500, 0.550, 0.600, 0.650, 0.700, 0.750, 0.800, 0.850, 0.900, 0.950, 1.000, 1.050, 1.100],
    w:  [0.220, 0.295, 0.342, 0.378, 0.408, 0.434, 0.457, 0.477, 0.493, 0.505, 0.515, 0.523, 0.525, 0.524, 0.512, 0.488, 0.444, 0.367, 0.280],
    yT: [0.400, 0.426, 0.450, 0.472, 0.490, 0.502, 0.510, 0.513, 0.515, 0.515, 0.515, 0.512, 0.510, 0.512, 0.515, 0.515, 0.515, 0.491, 0.450],
    yB: [0.110, 0.040, -0.025, -0.060, -0.085, -0.107, -0.125, -0.140, -0.150, -0.153, -0.155, -0.147, -0.130, -0.107, -0.080, -0.054, -0.030, -0.009, 0.010],
    yW: [0.200, 0.160, 0.150, 0.150, 0.150, 0.150, 0.150, 0.150, 0.150, 0.150, 0.150, 0.155, 0.165, 0.177, 0.190, 0.201, 0.210, 0.215, 0.220],
    nU: [2.20, 2.20, 2.20, 2.20, 2.20, 2.17, 2.10, 1.98, 1.85, 1.72, 1.65, 1.68, 1.90, 2.22, 2.50, 2.65, 2.62, 2.52, 2.30],
    nL: [2.20, 2.25, 2.30, 2.38, 2.45, 2.48, 2.50, 2.50, 2.50, 2.48, 2.45, 2.45, 2.45, 2.43, 2.40, 2.35, 2.30, 2.25, 2.20],
  },
  // the balloon ends at the gill margin, `back` behind the bind margin (the cover bulging back over the pectoral base,
  // and both lips of the shut slit carried out together), its rim rounded by `blend`; below the margin's lowest point
  // (y0) the end leans forward (`lean` s per y) with the gill membranes to the isthmus
  margin: { back: 0.03, blend: 0.06, y0: 0.02, lean: 0.5 },
  // the balloon onto the head: `blend` in front, `rear` behind the eyes (the skin taut from the nape to the balloon)
  blend: 0.06, rear: { blend: 0.09, from: 0.45, to: 0.70 },
  // the preopercular groove: a soft crease down the balloon's side between the cheek and the gill cover (u5's one inner
  // contour per side), [s, y, depth] from the shoulder to the throat, `width` its Gaussian half-width in s, on the
  // lateral face only (|z| between z[0] and z[1] the crease fades in)
  crease: { path: [[0.620, 0.440, 0.0060], [0.580, 0.360, 0.0130], [0.560, 0.270, 0.0100], [0.552, 0.150, 0.0000], [0.560, 0.060, 0.0090], [0.580, -0.020, 0.0130], [0.620, -0.090, 0.0060]], width: 0.030, z: [0.26, 0.36] },
  // the loft's tables smoothed along s by a Gaussian of this width (HL)
  smooth: 0.035,
};

/** The opercle's margin as s at height y (the path of HEAD_SCULPT.opercle, as head.mjs draws it: a cubic Hermite
 * through its points, so the balloon's end follows the gill cover's rim). */
export function marginS(K = HEAD_SCULPT) {
  const opP = K.opercle.path.map((p) => [p[0], p[1]]).sort((a, b) => a[1] - b[1]);
  const opT = opP.map((_, i) => {
    const a = opP[Math.max(0, i - 1)], c = opP[Math.min(opP.length - 1, i + 1)];
    return (c[0] - a[0]) / (c[1] - a[1]);
  });
  return (y) => {
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
}

/** Where the balloon ends (s at height y): just behind the gill margin, leaning forward under it to the isthmus. */
export function balloonEnd(K = HEAD_SCULPT, I = INFLATE) {
  const sOp = marginS(K), M = I.margin, k = 0.03;
  // the margin's polyline averaged over ±0.03 in y and the lean eased in (softplus), so the rim's normals turn
  // smoothly (a kinked end would crease the balloon's shading)
  const avg = (y) => { let a = 0; for (let i = -3; i <= 3; i++) a += sOp(y + i * 0.01); return a / 7; };
  const soft = (u) => k * Math.log1p(Math.exp(u / k));
  return (y) => avg(y) + M.back - (M.lean ?? 0) * soft((M.y0 ?? -9) - y);
}

/** The balloon alone (its distance, HL), with the preopercular crease on its sides (INFLATE.crease). */
export function balloonSDF(K = HEAD_SCULPT, I = INFLATE) {
  const loft = loftSDF(smoothTables(loftTables(I.loft, 1024), I.smooth)), end = balloonEnd(K, I);
  const C = I.crease, cs = C ? pathAt(C.path) : null;
  return (x, y, z) => {
    let d = smax(loft(x, y, z), (x - end(y)) * 0.9, I.margin.blend);
    if (C) {
      // a soft groove across the side: s at height y from its path, its depth varying with y (none at the widest
      // height, so the outline from above stays convex), only on the lateral face (|z| beyond the cheek's front)
      const [sc, dep] = cs(y), u = (x - sc) / C.width;
      if (Math.abs(u) < 3.5) d += dep * Math.exp(-u * u) * smoothstep(C.z[0], C.z[1], Math.abs(z));
    }
    return d;
  };
}

/** A path [[s, y, depth], …] (sorted by y) read at height y: [s, depth], the depth falling to 0 beyond its ends. */
function pathAt(P) {
  const Q = [...P].sort((a, b) => a[1] - b[1]);
  return (y) => {
    if (y <= Q[0][1]) return [Q[0][0], Q[0][2] * (1 - smoothstep(0, 0.04, Q[0][1] - y))];
    if (y >= Q[Q.length - 1][1]) { const q = Q[Q.length - 1]; return [q[0], q[2] * (1 - smoothstep(0, 0.04, y - q[1]))]; }
    for (let i = 0; i + 1 < Q.length; i++) {
      const a = Q[i], b = Q[i + 1];
      if (y <= b[1]) { let t = (y - a[1]) / (b[1] - a[1]); t = t * t * (3 - 2 * t); return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]; }
    }
    return [Q[0][0], 0];
  };
}

/** The loft's tables smoothed along s (a Gaussian of `sigma` HL, INFLATE.smooth): a taut skin has no creases at the
 * stations. */
export function smoothTables(T, sigma) {
  const ds = T.sMax / T.n, r = Math.ceil((3 * sigma) / ds), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-0.5 * ((i * ds) / sigma) ** 2));
  const out = { ...T };
  for (const key of ['w', 'yT', 'yB', 'yW', 'nU', 'nL']) {
    const a = T[key], b = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0, ws = 0;
      for (let j = -r; j <= r; j++) { const q = Math.min(a.length - 1, Math.max(0, i + j)); s += a[q] * k[j + r]; ws += k[j + r]; }
      b[i] = s / ws;
    }
    out[key] = b;
  }
  return out;
}

/** The inflated head's distance (HL): the head of head.mjs inside the balloon. o: headSDF's options, plus
 * { headSDF, inflate (INFLATE overrides) }. */
export function inflatedSDF(K = HEAD_SCULPT, o = {}, I = INFLATE) {
  if (o.inflate) I = { ...I, ...o.inflate };
  // (o.headSDF: the head module's own field, when the caller builds a head other than ./head.mjs)
  const f = (o.headSDF ?? headSDF)(K, o), B = balloonSDF(K, I);
  const R = I.rear;
  const g = (x, y, z) => smin(f(x, y, z), B(x, y, z), R ? I.blend + (R.blend - I.blend) * smoothstep(R.from, R.to, x) : I.blend);
  g.head = f; g.balloon = B;
  return g;
}

export { HEAD_SCULPT, headSDF };
