/**
 * ガザミ (Portunus trituberculatus, Portunidae): the body plan of the model, in millimetres, for a crab of 100 mm
 * carapace width measured between the tips of the lateral spines (CW; the game's `length_mm` of a crab is its
 * carapace width, as the fisheries and field guides give it).
 *
 * Measured on the 70 photographs of the reference sheet (dorsal 4, 6, 19, 39, 55, 61, 62; ventral 6, 16, 18, 63, 70;
 * front 66; three-quarter 26–31, 64, 65; chelae 49, 61, 67; swimming legs 6, 47, 55, 61, 65; buried 13; defence 12,
 * 47, 53, 58) — never a generic crab:
 *  - carapace  very broad: the length (front to posterior margin) only ≈ 0.47 CW (61: 0.46, 19: 0.48, 39: 0.47);
 *              its widest point is the tips of the lateral spines, 57 % of the length back from the front (61, 39)
 *  - margins   nine anterolateral teeth a side counting the external orbital tooth, the ninth drawn out into the long
 *              lateral spine (≈ 0.13 CW from its base: 61, 39, 41, 44); teeth 2–8 sharp, forward-leaning triangles
 *              (≈ 3 mm) on a nearly straight, gently convex margin at ≈ 40° to the transverse axis; the posterolateral
 *              margins concave and smooth, the posterior margin short (≈ 0.28 CW) and nearly straight
 *  - front     four frontal teeth between the orbits, the median pair smaller (61, 64, 66); orbits as notches at the
 *              front corners with the short eyestalks in them; the eyes dark and glossy (19, 61)
 *  - dorsum    finely and densely granular (39, 61), the dome ≈ 0.1 CW above the margin (66); transverse granular
 *              lines (frontal, protogastric, mesogastric and the long epibranchial line from the spine's base), and the
 *              three tubercles that name the species — one mesogastric, two cardiac (39)
 *  - chelipeds long (male: merus 0.32, carpus 0.11, palm 0.34, fingers 0.26 CW: 61), the merus with four spines on
 *              its anterior border and one distal on the posterior, the carpus with an inner and an outer spine, the
 *              palm prismatic with longitudinal costae and a spine at its distal upper end; long, ribbed fingers with
 *              alternately large and small teeth, the tips crossing (49, 61, 65, 67)
 *  - walking   P2–P4 long, slender and compressed, merus : carpus : propodus : dactylus ≈ 0.36 : 0.13 : 0.24 : 0.27
 *  legs        (6, 61); the dactyli lanceolate blades (P4 the broadest), the joints with pale articular membranes
 *  - swimming  P5 the paddle: merus and carpus short and broad, the propodus a flat oval blade (0.18 × 0.12 CW), the
 *  legs        dactylus a broad oval paddle (0.16 × 0.125 CW) with a dark distal margin and a fringe of setae (6, 47,
 *              55, 61, 65)
 *  - ventral   white to bluish white; broad sternum; the male abdomen a narrow T (18, 63), the female's broad (9, 70)
 * Frame: x the crab's left, y dorsal, z forward (anterior). Origin: under the carapace's centre on the plane of the
 * sternum (the crab's underside). The legs' own frames: x distal along the article, y dorsal, z anterior on the left
 * side (posterior on the right, so that both frames are right-handed and a positive turn about z always lifts).
 */

export const CW_MM = 100;
/** model carapace width (m): the geometry is built for a 100 mm crab and scaled to the individual */
export const MODEL_CW = CW_MM / 1000;

export type V2 = [number, number];
export type V3 = [number, number, number];

// ------------------------------------------------------------------ carapace

export const CARAPACE = {
  /** z of the frontal margin between the median teeth, and of the posterior margin (CL ≈ 46.5) */
  front: 21.9,
  back: -23.8,
  /** the centre the outline's rays start from (x, z) */
  centre: [0, -2] as V2,
  /** height of the free margin above the sternum's plane: front, anterolateral, posterior */
  marginFront: 13.6,
  margin: 13.0,
  marginBack: 9.8,
  /** the dome above the margin (66: the body ≈ 0.23 CW deep) */
  dome: 9.8,
  /** thickness of the free margin, and of the teeth's bases */
  edge: 0.9,
  /** the underside: the pleural line (the carapace meets the body wall over the coxae) and the sternum's edge */
  pleural: { ax: 23.5, front: 19.5, back: -16.5, y: 6.2, yFront: 4.2, yBack: 5.0 },
  sternum: { ax: 19.0, front: 12.0, back: -17.0, y: 0.5 },
};

export interface ToothSpec {
  name: string;
  /** tip (x, z), length from the base to the tip, lean of the tooth off the margin's outward normal (rad, + forward) */
  tip: V2;
  length: number;
  /** half width of the base along the margin */
  base: number;
  /** extra height of the tip over the margin (the teeth turn up a little: 64, 66) and thickness at the base */
  lift: number;
  thick: number;
  /** a robust conical spine rather than a flat tooth */
  conical?: boolean;
}

/**
 * The teeth of the left half's margin, front to back (the right half mirrors it with its own small differences):
 * the median and submedian frontal teeth, the inner orbital angle, the external orbital tooth (T1), T2–T8 and the
 * lateral spine (T9). Tips measured on 61 (with 39, 19 and 55 for the spacing).
 */
export function marginTeeth(): ToothSpec[] {
  const teeth: ToothSpec[] = [
    { name: 'F1', tip: [1.7, 22.9], length: 1.3, base: 1.15, lift: 0.0, thick: 0.8 },
    { name: 'F2', tip: [4.5, 23.3], length: 1.9, base: 1.3, lift: 0.1, thick: 0.85 },
    { name: 'IO', tip: [7.2, 22.7], length: 1.7, base: 1.05, lift: 0.2, thick: 0.85 },
    { name: 'T1', tip: [16.4, 22.1], length: 2.6, base: 1.9, lift: 0.3, thick: 1.0 },
  ];
  // T2–T8: evenly along the tips' gently convex arc from T1 to T8 (Bézier through the measured tips)
  const p0: V2 = [16.4, 22.1], p1: V2 = [32.0, 15.0], p2: V2 = [42.2, 0.7];
  const bez = (t: number): V2 => [
    (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0],
    (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1],
  ];
  // arc-length table
  const N = 200, acc: number[] = [0];
  let prev = bez(0);
  for (let i = 1; i <= N; i++) { const p = bez(i / N); acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const at = (s: number): V2 => {
    const L = acc[N] * s;
    let i = 1;
    while (i < N && acc[i] < L) i++;
    const f = (L - acc[i - 1]) / Math.max(1e-9, acc[i] - acc[i - 1]);
    return bez((i - 1 + f) / N);
  };
  const len = [3.0, 3.25, 3.35, 3.35, 3.3, 3.2, 3.15];
  for (let k = 1; k <= 7; k++) {
    teeth.push({ name: `T${k + 1}`, tip: at(k / 7), length: len[k - 1], base: 2.05, lift: 0.35, thick: 1.0 });
  }
  // the lateral spine: a long, robust cone straight out to the side, a little forward and up (61, 39, 41, 44)
  teeth.push({ name: 'T9', tip: [50.0, -4.1], length: 12.6, base: 3.9, lift: 1.3, thick: 3.0, conical: true });
  return teeth;
}

/**
 * The margin's envelope for the left half (the teeth's bases lie on it), front centre to posterior centre, as knots
 * the geometry interpolates; the teeth are placed on it by the geometry (each tooth's base centre is its tip moved
 * back along its axis). Points between the frontal teeth, the orbital notch, the anterolateral bases, the spine's
 * base and the smooth posterolateral and posterior margins.
 */
export const ENVELOPE_BACK: V2[] = [
  // behind the lateral spine: the concave posterolateral margin and the posterior margin (61, 39, 6)
  [35.6, -6.7], [33.0, -8.4], [30.0, -10.6], [27.0, -13.1], [24.0, -15.9], [21.3, -18.3], [18.6, -20.3], [16.0, -21.7],
  [13.6, -22.6], [10.5, -23.2], [7.0, -23.55], [3.5, -23.75], [0.0, -23.8],
];
/** the orbit: a rounded notch between the inner orbital angle and the external orbital tooth (61, 19, 64) */
export const ORBIT = { x0: 8.3, x1: 14.5, depth: 2.3, z: 21.3 };

/**
 * Height of the free margin round the outline (`x`, `z` on the envelope): high at the front, level along the
 * anterolateral margin and the spine, falling over the posterolateral margin to the posterior border (66, 64).
 */
export function marginHeight(x: number, z: number): number {
  const C = CARAPACE;
  if (z > 10) return C.margin + (C.marginFront - C.margin) * Math.min(1, (z - 10) / 11) * (1 - Math.min(1, Math.abs(x) / 22) * 0.6);
  if (z > -6) return C.margin;
  const k = Math.min(1, (-6 - z) / 17.8);
  return C.margin + (C.marginBack - C.margin) * (k * k * (3 - 2 * k));
}

const gauss = (d2: number) => Math.exp(-d2);
/** a raised line (granular ridge) from a to b: height h, half width w */
function ridge(x: number, z: number, a: V2, b: V2, h: number, w: number): number {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const L2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
  const dx = x - a[0] - vx * t, dz = z - a[1] - vz * t;
  const end = Math.min(1, Math.min(t, 1 - t) * 6 + 0.25);
  return h * end * gauss((dx * dx + dz * dz) / (w * w));
}

/**
 * The carapace's regional relief over the dome (mm): the gastric, cardiac and branchial swellings, the cervical and
 * branchiocardiac grooves, the transverse granular lines and the three tubercles (39, 61, 19). `x` is mirrored by the
 * caller where the relief is bilateral; `seed` adds the individual-free but side-specific unevenness of a real shell.
 */
export function dorsalRelief(x: number, z: number): number {
  const ax = Math.abs(x);
  let h = 0;
  // swellings
  h += 1.0 * gauss((x * x) / 80 + ((z - 8) * (z - 8)) / 45);            // gastric
  h += 0.85 * gauss((x * x) / 45 + ((z + 11) * (z + 11)) / 22);         // cardiac
  h += 0.95 * gauss(((ax - 17) * (ax - 17)) / 120 + ((z + 6) * (z + 6)) / 75); // branchial
  h += 0.5 * gauss(((ax - 14) * (ax - 14)) / 30 + ((z - 13) * (z - 13)) / 20); // hepatic
  // the cervical groove: a shallow arc across behind the gastric region, and the grooves beside the cardiac region
  if (ax < 15) h -= 0.55 * gauss(((z - (-2.4 + 0.028 * x * x)) ** 2) / 1.6) * (1 - ax / 15);
  h -= 0.4 * ridge(ax, z, [6.2, -4.5], [8.2, -17], 1, 1.1);
  h -= 0.3 * ridge(ax, z, [5.5, 13.5], [9.5, 3.5], 1, 1.0);           // the gastric region's lateral margins
  // granular transverse lines
  h += ridge(ax, z, [2.0, 19.4], [6.0, 18.8], 0.32, 0.6);               // frontal
  h += ridge(ax, z, [3.6, 15.4], [9.4, 14.2], 0.36, 0.65);              // protogastric
  if (ax < 3.8) h += 0.34 * gauss(((z - 11.6) * (z - 11.6)) / 0.45);    // mesogastric
  // the long epibranchial line, from the spine's base forward and inward, convex forward (61: the pale band)
  h += ridge(ax, z, [34.5, -3.6], [24.0, 1.2], 0.42, 0.7);
  h += ridge(ax, z, [24.0, 1.2], [13.2, 5.6], 0.42, 0.7);
  h += ridge(ax, z, [13.2, 5.6], [9.0, 6.0], 0.3, 0.6);
  if (ax < 5.5) h += 0.18 * gauss(((z + 15.6) * (z + 15.6)) / 0.5) * (1 - ax / 5.5);  // cardiac line, faint
  // the three tubercles
  h += 0.95 * gauss((x * x + (z - 6.2) * (z - 6.2)) / 1.7);
  h += 0.85 * gauss(((ax - 3.3) * (ax - 3.3) + (z + 12.2) * (z + 12.2)) / 1.5);
  return h;
}

/** the dome's fall from the centre (s = 0) to the margin (s = 1): flat on top, sloping to a thin edge */
export const domeProfile = (s: number): number => {
  const q = Math.min(1, Math.max(0, s));
  return (1 - q * q) * (1 + 0.42 * q * q) * (1 - 0.18 * q);
};

// ------------------------------------------------------------------ eyes, antennae, mouthparts

export const EYE = {
  /** the eyestalk's base deep in the orbit, its rest direction (forward, out and up), length and radius */
  base: [10.9, 12.1, 19.6] as V3,
  dir: [0.32, 0.3, 0.9] as V3,
  stalk: 4.4,
  stalkR: 1.25,
  /** the cornea: a dark, glossy, faceted globe at the tip (61: ≈ 4.5 mm across at CW 100) */
  r: 2.05,
};

/** antennae: short flagella out of the inner orbital hiatus (61, 66); antennules folded in their fossae */
export const ANTENNA = { base: [6.6, 11.2, 20.6] as V3, dir: [0.62, -0.12, 0.77] as V3, length: 5.2, r: 0.3 };
export const ANTENNULE = { base: [2.6, 10.2, 21.2] as V3, length: 4.2, r: 0.55 };

/** the third maxillipeds: two plates closing the buccal frame, sloping from under the front down and back (66: white, purple-edged) */
export const MXP3 = { z0: 21.0, z1: 12.4, halfWidth: 7.4, y: 4.4, slope: 0.62 };

/**
 * The abdomen folded under the sternum: the male's narrow T (18, 63) and the female's broad, rounded flap (9, 70).
 * `w(t)` is the half width along it, from its hinge under the posterior margin (t = 0) to the telson's tip (t = 1).
 */
export const ABDOMEN = {
  hinge: -18.2,
  male: { length: 23.5, w: [[0, 11.0], [0.08, 11.2], [0.16, 6.2], [0.3, 4.6], [0.55, 3.4], [0.8, 2.6], [0.93, 1.6], [1, 0.0]] as V2[] },
  female: { length: 26.0, w: [[0, 11.5], [0.1, 13.0], [0.35, 14.0], [0.6, 13.0], [0.82, 9.5], [0.95, 5.0], [1, 0.0]] as V2[] },
};

// ------------------------------------------------------------------ legs

/** cross-section knot along an article: t (0 proximal … 1 distal), half height (y), half width (z), offsets */
export interface SectionKnot { t: number; hy: number; hz: number; cy?: number; cz?: number }

export interface SpineSpec {
  /** where on the article (t), round it (angle about x from +y towards +z, rad), length, base radius, lean distally */
  t: number;
  a: number;
  length: number;
  r: number;
  lean: number;
}

export interface ArticleSpec {
  name: 'cx' | 'bi' | 'me' | 'ca' | 'pr' | 'da';
  length: number;
  sections: SectionKnot[];
  /** superellipse exponent of the section (2 round, > 2 boxy) */
  n?: number;
  /** longitudinal costae: angle, height (mm), half width (rad) */
  costae?: [number, number, number][];
  /** a three-sided prism: amplitude of the cos 3θ term and its phase */
  tri?: [number, number];
  spines?: SpineSpec[];
  /** the narrowed neck at the proximal end (inside the parent's socket, the articular membrane) */
  neck?: number;
  /** a flat blade (paddle, lanceolate dactylus): thin margins */
  blade?: boolean;
}

export type LegId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export interface LegSpec {
  id: LegId;
  /** the thoraco-coxal joint (left side, mm) and the leg's rest direction in the horizontal plane (rad from +x towards +z) */
  coxa: V3;
  yaw: number;
  articles: ArticleSpec[];
}

const S = (t: number, hy: number, hz: number, cy = 0, cz = 0): SectionKnot => ({ t, hy, hz, cy, cz });

/** a walking leg (P2–P4): article lengths (mm), `h` scales the height, `bladeW` the lanceolate dactylus's width */
function walkingLeg(id: LegId, coxa: V3, yaw: number, me: number, ca: number, pr: number, da: number, h0: number, bladeW: number): LegSpec {
  // (compressed and slender: 61 and 66 at 0.88 of the height and 0.92 of the breadth first drawn)
  const h = h0 * 0.88;
  const S = (t: number, hy: number, hz: number, cy = 0, cz = 0): SectionKnot => ({ t, hy, hz: hz * 0.92, cy, cz });
  return {
    id, coxa, yaw,
    articles: [
      { name: 'cx', length: 4.2, n: 2.4, sections: [S(0, 3.1 * h, 2.9), S(0.5, 3.3 * h, 3.0), S(1, 3.0 * h, 2.7)] },
      { name: 'bi', length: 5.4, n: 2.6, neck: 0.12, sections: [S(0, 2.6 * h, 2.3), S(0.25, 2.8 * h, 2.35), S(1, 2.95 * h, 2.1)] },
      // merus: long and compressed (taller than broad), a low keel above and below, nearly parallel-sided (61, 6)
      { name: 'me', length: me, n: 3.0, neck: 0.035, sections: [S(0, 2.7 * h, 1.75), S(0.06, 2.85 * h, 1.8), S(0.5, 3.05 * h, 1.75, 0.12), S(0.92, 2.8 * h, 1.6, 0.08), S(1, 2.55 * h, 1.5)], costae: [[0, 0.22, 0.22], [Math.PI, 0.16, 0.28]] },
      { name: 'ca', length: ca, n: 2.8, neck: 0.09, sections: [S(0, 2.0 * h, 1.35), S(0.18, 2.4 * h, 1.55), S(0.85, 2.3 * h, 1.45), S(1, 2.05 * h, 1.3)], costae: [[0, 0.2, 0.22]] },
      { name: 'pr', length: pr, n: 2.8, neck: 0.06, sections: [S(0, 1.75 * h, 1.15), S(0.08, 2.0 * h, 1.3), S(0.9, 1.75 * h, 1.15), S(1, 1.55 * h, 1.05)], costae: [[0, 0.16, 0.2], [Math.PI, 0.13, 0.24]] },
      // dactylus: a lanceolate blade, broadest at a third of its length, to a sharp tip (6, 61; P4 the broadest)
      { name: 'da', length: da, n: 2.1, neck: 0.05, blade: true, sections: [S(0, 1.35 * h, 0.95), S(0.1, 1.7 * h * bladeW, 0.95), S(0.33, 1.9 * h * bladeW, 0.85), S(0.66, 1.3 * h * bladeW, 0.6, -0.1), S(0.9, 0.55 * h, 0.3, -0.3), S(1, 0.06, 0.06, -0.45)] },
    ],
  };
}

/**
 * The legs of the left side. Thoraco-coxal joints round the sternum's edge under the carapace (18, 63); rest
 * directions fanning from the cheliped forward to the paddle back (19, 55, 61). Lengths in mm at CW 100: male
 * cheliped (the female's is scaled by the individual), walking legs P2 ≈ P3 > P4 (6, 61).
 */
export function legSpecs(): LegSpec[] {
  const P1: LegSpec = {
    id: 'P1', coxa: [16.2, 5.4, 12.8], yaw: 0.6,
    articles: [
      { name: 'cx', length: 5.4, n: 2.4, sections: [S(0, 3.8, 3.6), S(0.5, 4.0, 3.7), S(1, 3.6, 3.3)] },
      // basis-ischium: the merus starts ≈ 0.3 CW out from the midline under the front corner (61, 50)
      { name: 'bi', length: 8.6, n: 2.5, neck: 0.1, sections: [S(0, 3.2, 2.9), S(0.3, 3.5, 3.1), S(1, 3.9, 3.2)] },
      // merus: a long three-sided prism, four spines on the anterior border, one distal on the posterior (61, 49)
      {
        name: 'me', length: 31.5, n: 2.4, neck: 0.025, tri: [0.12, Math.PI / 2],
        sections: [S(0, 3.5, 2.75), S(0.06, 3.75, 2.85), S(0.5, 4.05, 2.95, 0.2), S(0.9, 3.95, 2.8, 0.2), S(1, 3.65, 2.65)],
        costae: [[Math.PI / 2, 0.35, 0.18], [0.15, 0.3, 0.2]],
        spines: [
          { t: 0.33, a: 1.2, length: 3.2, r: 1.0, lean: 0.85 },
          { t: 0.5, a: 1.2, length: 3.7, r: 1.05, lean: 0.82 },
          { t: 0.67, a: 1.2, length: 4.1, r: 1.1, lean: 0.8 },
          { t: 0.84, a: 1.2, length: 3.6, r: 1.0, lean: 0.85 },
          { t: 0.95, a: -1.75, length: 2.4, r: 0.85, lean: 0.95 },
        ],
      },
      // carpus: short, the strong inner spine and a smaller outer one (61, 65)
      {
        name: 'ca', length: 11.0, n: 2.5, neck: 0.1, sections: [S(0, 3.3, 2.9), S(0.22, 4.1, 3.6), S(0.8, 4.3, 3.7), S(1, 3.9, 3.3)],
        costae: [[0.0, 0.35, 0.22], [0.9, 0.3, 0.2], [-0.9, 0.3, 0.2]],
        spines: [{ t: 0.7, a: 1.4, length: 5.2, r: 1.35, lean: 0.75 }, { t: 0.84, a: -0.45, length: 2.2, r: 0.8, lean: 0.85 }],
      },
      // propodus: the palm (t 0 … 0.55) with its costae and distal spine, the fixed finger beyond, its tip turned up
      // to meet the dactylus's (49, 61, 67)
      {
        name: 'pr', length: 60.0, n: 2.7, neck: 0.03,
        sections: [S(0, 3.3, 2.3), S(0.04, 3.7, 2.45), S(0.25, 4.2, 2.55, 0.1), S(0.5, 4.6, 2.55, 0.0), S(0.56, 4.25, 2.4, -0.9), S(0.62, 2.75, 2.05, -2.1), S(0.75, 2.1, 1.7, -2.05, -0.15), S(0.9, 1.35, 1.2, -1.6, -0.45), S(0.97, 0.78, 0.72, -1.1, -0.75), S(1, 0.13, 0.13, -0.8, -0.9)],
        // the costae: the upper margin's crest, two on the outer face, one on the inner, the lower margin (49, 61, 67)
        costae: [[0.0, 0.75, 0.16], [0.95, 0.55, 0.12], [1.7, 0.5, 0.12], [2.6, 0.45, 0.14], [3.14, 0.55, 0.18], [-0.95, 0.4, 0.12], [-1.9, 0.35, 0.14]],
        spines: [{ t: 0.5, a: 0.3, length: 3.0, r: 0.95, lean: 0.85 }, { t: 0.06, a: 0.5, length: 2.0, r: 0.75, lean: 0.85 }],
      },
      // dactylus (the movable finger): hinged at the palm's distal upper corner, long, curving down to cross the
      // fixed finger's tip
      {
        name: 'da', length: 27.5, n: 2.6, neck: 0.03,
        sections: [S(0, 2.1, 1.8), S(0.07, 2.25, 1.85), S(0.4, 1.9, 1.55, -0.45), S(0.75, 1.35, 1.15, -1.35, -0.3), S(0.93, 0.72, 0.68, -2.35, -0.7), S(1, 0.11, 0.11, -2.9, -1.0)],
        costae: [[0.0, 0.45, 0.16], [0.95, 0.35, 0.15], [-0.95, 0.35, 0.15], [1.9, 0.25, 0.15]],
      },
    ],
  };
  const P2 = walkingLeg('P2', [18.8, 5.0, 6.9], 0.42, 20.0, 7.6, 12.9, 15.0, 1.0, 1.0);
  const P3 = walkingLeg('P3', [20.6, 5.0, 0.4], 0.04, 20.8, 7.9, 13.0, 15.2, 1.0, 1.05);
  const P4 = walkingLeg('P4', [20.2, 5.2, -6.1], -0.36, 18.0, 7.0, 11.6, 13.6, 0.96, 1.25);
  // P5: the swimming leg — short, stout merus and carpus, the flat oval propodus and the dactylus paddle
  const P5: LegSpec = {
    id: 'P5', coxa: [16.6, 6.2, -12.4], yaw: -0.86,
    articles: [
      { name: 'cx', length: 4.6, n: 2.4, sections: [S(0, 3.4, 3.2), S(0.5, 3.7, 3.4), S(1, 3.3, 3.0)] },
      { name: 'bi', length: 6.0, n: 2.5, neck: 0.12, sections: [S(0, 2.9, 2.7), S(0.3, 3.2, 3.0), S(1, 3.3, 3.1)] },
      { name: 'me', length: 10.0, n: 3.4, neck: 0.05, sections: [S(0, 2.6, 3.3), S(0.12, 2.8, 4.0), S(0.88, 2.8, 4.3), S(1, 2.6, 3.9)], costae: [[0, 0.25, 0.3]] },
      { name: 'ca', length: 8.6, n: 3.4, neck: 0.07, sections: [S(0, 2.2, 3.2), S(0.15, 2.4, 4.0), S(0.9, 2.3, 4.4), S(1, 2.1, 3.9)], costae: [[0, 0.22, 0.3]] },
      // propodus: flat oval blade, four times broader than thick, a thick midrib (61: 18.5 × 11.5)
      { name: 'pr', length: 18.5, n: 2.2, neck: 0.05, blade: true, sections: [S(0, 2.0, 3.2), S(0.1, 1.8, 4.6), S(0.45, 1.6, 5.8, 0, 0.4), S(0.82, 1.4, 5.4, 0, 0.4), S(1, 1.15, 3.8, 0, 0.2)] },
      // dactylus: the paddle, a broad oval with a rounded-pointed tip (6, 61, 65: 16 × 12.5)
      { name: 'da', length: 16.0, n: 2.1, neck: 0.04, blade: true, sections: [S(0, 0.95, 2.8), S(0.1, 0.88, 4.8), S(0.42, 0.8, 6.25, 0, 0.3), S(0.72, 0.65, 5.6, 0, 0.2), S(0.92, 0.45, 3.2, 0, -0.2), S(1, 0.15, 0.3, 0, -0.6)] },
    ],
  };
  return [P1, P2, P3, P4, P5];
}

/** the position of the cheliped's dactylus hinge on the propodus: the palm's distal upper corner (t, y) */
export const DACTYL_HINGE = { t: 0.52, y: 2.9 };

/**
 * The rest (bind) pose of the leg joints (rad): the coxa's pitch, then the basis's levation, the merus's turn about its
 * axis (and, in the cheliped, its swing out to the side at the ischio-meral joint), the carpus, the propodus and the
 * dactylus (a positive turn lifts). Chosen near the standing pose so that the
 * articular membranes bend least in use.
 */
export const BIND: Record<LegId, { pitch: number; lev: number; roll: number; mc: number; cp: number; pd: number; mcYaw?: number; meYaw?: number }> = {
  P1: { pitch: -0.1, lev: 0.1, roll: 0, meYaw: 0.9, mc: 0, mcYaw: -1.6, cp: 0.0, pd: 0.0 },
  P2: { pitch: -0.12, lev: 0.34, roll: 0, mc: -0.75, cp: -0.12, pd: -0.42 },
  P3: { pitch: -0.12, lev: 0.34, roll: 0, mc: -0.75, cp: -0.12, pd: -0.42 },
  P4: { pitch: -0.12, lev: 0.32, roll: 0, mc: -0.72, cp: -0.12, pd: -0.42 },
  P5: { pitch: -0.05, lev: 0.42, roll: 0, mc: -0.2, cp: -0.05, pd: -0.1 },
};

/** the sexes and ages differ (Kim 2000; 61 male, 9 female; juveniles 1–3, 23–31): cheliped scale, colour */
export const DIMORPHISM = {
  /** a female's chelipeds are shorter and stouter than a male's of her width */
  femaleCheliped: 0.86,
  /** one cheliped is a little larger than the other (subequal): the larger's extra */
  asymmetry: 0.06,
};
