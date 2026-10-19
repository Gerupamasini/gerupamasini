// The トビハゼ head with its cheeks and gill covers inflated (the owner's photo u5; B018, B024, A070): the head of
// head.mjs inside a balloon of skin, the target of the rig's `inflate` blend shape (headrig.mjs inflateTargets, the
// poses `inflated` and `inflatedHalf`). The bind mesh is carried onto it across each cross-section; the snout, the lower
// lip and chin, the eye domes and their collars keep their shape, and what rides on the skin (the gill margin with its
// shut slit, the pads' hind ends) goes out with it.
//
// What inflates (research/anat_soft.md §3.4, anat_mech.md §3): the mouth and gill chambers fill with water or air, the
// suspensoria and the gill covers swing out, the hyoid drops and the branchiostegal membrane balloons the throat, the
// gill slits stay shut and the skin stretches taut. Measured on u5 (front view, the camera ≈6° above, scaled by the
// eye pair): the head 2.5 eye pairs wide (1.05 HL, +50 % on the relaxed 0.70), its
// outline a superellipse widest at y ≈ 0.17 (exponent ≈2.4 above, ≈2.5 below), its top shoulders at y ≈ 0.43 a
// quarter of the way in, the throat down to y ≈ −0.15; the cheek (in front of the preopercular groove, ≈0.82 HL wide)
// stands inside the wider gill-cover balloon, which shows round its sides as a second outline; the cheeks fill up to
// the eyes' collars and round the snout, and the mouth's corners are pushed out and down into a downturned arc.
import { HEAD_SCULPT, headSDF, loftTables, loftSDF } from './head.mjs';
import { smin, smax, smoothstep } from './sdf.mjs';

/**
 * The balloon (HL, symmetric about the midline), lofted like the head (head.mjs loftSDF, its tables smoothed along s):
 * per station s its half-width w, top yT, bottom yB, the height yW of its widest point and the exponents of its section
 * above (nU) and below (nL) that height. Fitted to u5's front outline (within 0.01 HL at every height, measured on the
 * posed mesh) and the throat's profile (A070: deepest at s ≈ 0.6–0.7, rising smoothly to the isthmus); the cheek's own
 * bulge (w 0.42 at s 0.46) stands in front of a shallow preopercular groove (s 0.54) and the wider gill covers (0.52 at
 * s 0.72), and fills forward under the eyes and round the snout (the stations at s 0.2–0.38 set high).
 */
export const INFLATE = {
  loft: {
    s:  [0.200, 0.290, 0.380, 0.460, 0.540, 0.620, 0.720, 0.820, 0.920, 1.020, 1.100],
    w:  [0.170, 0.290, 0.385, 0.418, 0.405, 0.458, 0.524, 0.512, 0.436, 0.320, 0.240],
    yT: [0.400, 0.460, 0.500, 0.515, 0.515, 0.515, 0.510, 0.505, 0.520, 0.515, 0.450],
    yB: [0.140, 0.060, -0.040, -0.105, -0.140, -0.155, -0.155, -0.118, -0.060, -0.018, 0.010],
    yW: [0.280, 0.260, 0.230, 0.205, 0.185, 0.178, 0.172, 0.172, 0.180, 0.195, 0.215],
    nU: [2.20, 2.30, 2.40, 2.40, 2.40, 2.40, 2.40, 2.45, 2.60, 2.60, 2.30],
    nL: [2.20, 2.40, 2.50, 2.50, 2.45, 2.45, 2.45, 2.45, 2.40, 2.30, 2.20],
  },
  // the balloon ends at the gill margin, `back` behind the bind margin, its rim rounded by `blend`; below the margin's
  // lowest point (y0) the end leans forward (`lean` s per y) with the gill membranes to the isthmus
  margin: { back: 0.008, blend: 0.04, y0: 0.02, lean: 0.5 },
  // the balloon onto the head: `blend` in front, `rear` behind the eyes (the skin taut from the nape to the balloon)
  blend: 0.06, rear: { blend: 0.09, from: 0.45, to: 0.70 },
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

/** The balloon alone (its distance, HL). */
export function balloonSDF(K = HEAD_SCULPT, I = INFLATE) {
  const loft = loftSDF(smoothTables(loftTables(I.loft, 1024), I.smooth)), end = balloonEnd(K, I);
  return (x, y, z) => smax(loft(x, y, z), (x - end(y)) * 0.9, I.margin.blend);
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
