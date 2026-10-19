/**
 * ヤマトオサガニ (Macrophthalmus japonicus, Macrophthalmidae): the body plan of the model, in millimetres, for a crab
 * of 35 mm carapace width (CW, between the tips of the external orbital teeth: the game's `length_mm` of a crab is
 * its carapace width). Males reach 40 mm, females 38 mm (Wada 2018).
 *
 * Measured on the two photograph sheets that came with the request — A1–A51 (Wikimedia Commons and iNaturalist) and
 * B1–B70 (iNaturalist, and twelve stereo-microscope photographs, B59–B70) — on Wada (2018, Crustacean Research
 * 47: 1–5) for the proportions a photograph cannot give, and on the sections of the CC0 photogrammetry scan of a male
 * (ffish.asia / floraZia.com) for the body's volumes (its sections measured and fitted; nothing of it is shipped);
 * never a generic crab:
 *  - carapace  transversely rectangular, CL = 0.451 + 0.663 CW (Wada 2018, males; 0.68 CW at this size, along the
 *              mid-line; the scan as a chord 0.65). The dorsal orbital margin convex forward, sweeping back to the
 *              external orbital angles ≈ 3 mm behind it (B63 straight down, the A47 front view; the scan 2 mm); the
 *              lateral margins nearly parallel, converging over the posterior third into rounded posterolateral
 *              corners (B65, B63, the scan); the posterior margin broad and straight (B65)
 *  - front     a narrow deflexed lobe between the eyestalks' bases (≈ 0.08 CW across: B60, B66, B69) with a median
 *              furrow running back into the gastric region (B69)
 *  - orbits    long trenches under the whole anterior margin, from the front out to the external orbital teeth
 *              (B15, A32, B63): the eyestalks fold into them; the dorsal orbital margin finely beaded, the
 *              infraorbital margin crenulate (B15, B49)
 *  - margins   three anterolateral teeth a side counting the external orbital tooth (B63, B69, A32; Ito 2014 for
 *              the allied M. banzai): the first acute, forward and outward, the second and third smaller; the lateral
 *              margins fringed with setae (A32, B24, B49)
 *  - dorsum    regions marked by low grooves: the H of the mesogastric and cardiac regions, the curved posterior edge
 *              of the gastric region (A1, B63, B69), two oblique granular ridges across each branchial region (B63,
 *              B69); flat across the front half, the branchial regions rolling over into the sides behind the third
 *              anterolateral tooth (no marginal ridge there: the scan's transverse sections, B7, A47) and the posterior
 *              third falling to the posterior margin halfway down the back (the scan's sagittal sections, B7, A13)
 *  - depth     a deep body: sternum to the dorsal crest ≈ 0.42 CW (the scan's sections); in front a box with vertical
 *              walls, in side view an egg — the underside rising fore and aft to the buccal frame and the abdomen's
 *              hinge (the scan, B7)
 *  - face      under the front margin it falls back towards the corners: flat across the maxillipeds, the orbits deeper
 *              and the infraorbital margins and pterygostomian faces ≈ 3 mm behind the external orbital angles, which
 *              overhang it (the scan's front map; A47, A45, B60); dark with mud in the field (A45, A47, B7)
 *  - eyes      long, slender eyestalks set close to the midline (bases ≈ 0.2 CW apart: A1, A45, B12), ≈ 0.38 CW long
 *              (reaching the external orbital tooth when folded: B15), raised upright and splayed ≈ 12° (A47, B60);
 *              a short thick basal article, a slender translucent stalk with a slight waist a third of the way up and a
 *              gentle swelling into the cornea; the cornea a terminal, elongate oval cap a little wider than the stalk
 *              (B59, B66: 1.15–1.25 ×), brown with dark mottling
 *  - mouth     the third maxillipeds two broad plates closing the buccal frame under the epistome (B60, B61, B67),
 *              together ≈ 0.4 CW across with a gap between them (B61, B64, A47, A45): the merus above (the "white
 *              ovals" of the field photographs: A19, A25, A47, B4, B12, B29; bluish in B39, B40) and the ischium below,
 *              the exopod along the outer edge, the palp at the inner upper corner
 *  - chelipeds the mature male's large and long: propodus 0.82 CW at CW 30 (Wada 2018), the palm elongate and
 *              compressed, the fingers deflexed ≈ 30°, a large wedge-shaped tooth on the fixed finger's cutting edge
 *              at a distance from its base, the cutting edges brown (A45, B12, B33, B34, B8, B29); the merus a long
 *              three-sided prism fringed with setae (B2, B34). The female's (and the immature male's) small, slender,
 *              with pointed, little-deflexed fingers (A47, B62, B68)
 *  - walking   P2 < P3 ≈ P4 > P5: 0.79, 0.94, 0.99, 0.67 CW (merus to dactylus: B70, B65, B64); merus 0.42, carpus
 *  legs        0.18, propodus 0.22, dactylus 0.19 of that. The meri broad plates (≈ 0.36 of their length across, seen
 *              broad from the front, from above and from below alike: A45, A47, B24, B65, B64), the anterior margin
 *              serrulate (B24), setose; the carpus shorter and a little narrower, the propodus narrower still with
 *              stiff setae below (A1), the dactylus long, slender, slightly curved and sharp (B70, A1); each article's
 *              distal end lobed over the next (B65, B70)
 *  - ventral   a broad sternum rising fore and aft; the coxae of the walking legs in a row along its edge at the foot
 *              of the walls (B61, B64, B67, the scan); the male's abdomen narrow, the female's broad (B16, B34, B55,
 *              B61, B67)
 * Frame: x the crab's left, y dorsal, z forward (anterior). Origin: under the carapace's centre on the plane of the
 * sternum. The legs' own frames: x distal along the article, y dorsal, z anterior on the left side (posterior on the
 * right, so that both frames are right-handed and a positive turn about z always lifts).
 */

export const CW_MM = 35;
/** model carapace width (m): the geometry is built for a 35 mm crab and scaled to the individual */
export const MODEL_CW = CW_MM / 1000;

export type V2 = [number, number];
export type V3 = [number, number, number];

// ------------------------------------------------------------------ carapace

export const CARAPACE = {
  /** z of the frontal lobe's tip and of the posterior margin as seen from above (CL 22.4 projected; 0.68 CW along the
   *  arched dorsum, which rolls down over the back: the CC0 scan's mid-sagittal section, A13, B7) */
  front: 11.15,
  back: -11.2,
  /** the centre the outline's rays start from (x, z) */
  centre: [0, 0.0] as V2,
  /** the dorsal crest (the gastric and cardiac regions' height over the sternum's plane: 0.44 CW, a deep body — the
   *  scan's sections give 0.42–0.47) and where along z it is */
  crest: 15.05,
  crestZ: 2.5,
  /** thickness of the free margin's shelf */
  edge: 0.45,
};

/**
 * The left half of the outline, front centre to posterior centre: (x, z, kind). Kinds: 'F' the frontal lobe, 'O' the
 * orbital margin, 'T' a tooth's tip, 'N' the notch behind a tooth, 'L' the lateral margin, 'P' the posterior. The
 * geometry samples the smooth runs between the knots and keeps the teeth's tips and notches sharp. The lateral margins
 * run nearly parallel (the scan's horizontal sections: the carapace as wide at mid-length as at the external orbital
 * teeth; B24, A32), the posterolateral corners rounded into a broad, straight posterior margin (0.72 CW: B65, the scan).
 */
export const OUTLINE: { p: V2; kind: 'F' | 'O' | 'T' | 'N' | 'L' | 'P' }[] = [
  { p: [0.0, 11.15], kind: 'F' },
  { p: [1.2, 11.08], kind: 'F' },
  { p: [1.95, 10.85], kind: 'F' },
  // the frontal lobe widening into its base between the eyestalks' sockets (B66, B69, the scan: ≈ 0.12 CW across)
  { p: [2.7, 10.55], kind: 'O' },
  // the dorsal orbital margin: convex forward, sweeping back to the external orbital angle — the corners ≈ 3 mm
  // behind the inner orbital margin and 4 mm behind the front (B63 straight down; the A47 front view, where the margin
  // dips at the middle; the scan 2 mm)
  { p: [5.6, 10.35], kind: 'O' },
  { p: [8.6, 9.95], kind: 'O' },
  { p: [11.4, 9.15], kind: 'O' },
  { p: [13.8, 8.25], kind: 'O' },
  { p: [15.75, 7.4], kind: 'O' },
  // the external orbital tooth: acute, forward and a little outward at the corner; the second and third anterolateral
  // teeth smaller, each with a notch behind it (between the scan's 0.92 / 0.78 / 0.66 CL from the back and B63's
  // 0.74 / 0.60 / 0.48)
  { p: [17.95, 6.95], kind: 'T' },
  { p: [16.9, 5.5], kind: 'N' },
  { p: [17.9, 4.2], kind: 'T' },
  { p: [17.0, 2.95], kind: 'N' },
  { p: [17.85, 1.75], kind: 'T' },
  { p: [17.15, 0.75], kind: 'N' },
  // the lateral margin: nearly parallel to mid-length, then converging over the posterior third into rounded
  // posterolateral corners (the scan's top view and its horizontal sections; B63, B65)
  { p: [17.55, -0.9], kind: 'L' },
  { p: [17.4, -3.3], kind: 'L' },
  { p: [16.9, -5.6], kind: 'L' },
  { p: [15.8, -8.0], kind: 'L' },
  { p: [14.2, -9.5], kind: 'P' },
  { p: [12.0, -10.5], kind: 'P' },
  { p: [9.8, -11.0], kind: 'P' },
  { p: [5.0, -11.2], kind: 'P' },
  { p: [0.0, -11.2], kind: 'P' },
];

/**
 * height of the free margin at an outline point: the dorsal orbital margin level with the flat top, the frontal lobe
 * bent down between the eyestalks' sockets (B60, B66), the lateral margins falling a little backwards, and over the
 * posterior third the margin rolling down to the posterior margin halfway down the back (the CC0 scan's sagittal and
 * transverse sections: 8 mm over the sternum at the middle, a little higher at the posterolateral corners; B7, A13)
 */
export function marginHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  // (the dorsal orbital margin's line runs back from the front to the external orbital angle: z ≈ 11.1 − 0.21 |x|)
  if (z > 10.75 - 0.21 * ax) return 14.2 - 0.35 * Math.min(1, ax / 17) - 0.75 * (1 - smooth01(1.6, 3.0, ax));
  if (z > 1.5) return 14.15 - 0.2 * ((8.2 - Math.min(8.2, z)) / 11.2);
  // behind the third anterolateral tooth the margin is no ridge on the top: the branchial regions roll over (a
  // shoulder of ≈ 4 mm radius) and the widest line runs back down the side to mid-height by the fourth legs, then
  // round the back to the posterior margin halfway down it (the scan's transverse sections z = −4, −8; B7, A13, A47)
  const k = smooth01(1.5, -4.5, z);
  const side = 14.03 - 4.1 * k;
  if (z > -4.5) return side;
  const k2 = smooth01(-4.5, -10.8, z);
  const post = 7.7 + 0.4 * Math.min(1, (ax / 14) ** 2);
  return side - (side - post) * k2;
}

/** smoothstep (here so that the body plan needs nothing from the geometry's helpers) */
export function smooth01(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const gauss = (d2: number) => Math.exp(-d2);
/** a raised line (granular ridge) from a to b: height h, half width w */
export function ridge(x: number, z: number, a: V2, b: V2, h: number, w: number): number {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const L2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
  const dx = x - a[0] - vx * t, dz = z - a[1] - vz * t;
  const end = Math.min(1, Math.min(t, 1 - t) * 5 + 0.3);
  return h * end * gauss((dx * dx + dz * dz) / (w * w));
}
/** distance from (x, z) to the polyline */
function polyDist(x: number, z: number, pts: V2[]): number {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t));
  }
  return best;
}

/** the grooves that mark the regions (left half; mirrored by |x|): the gastric region's outline, the H's bar, the cardiac's sides */
export const GROOVES: { pts: V2[]; depth: number; w: number }[] = [
  // the gastric region's lateral edges, from behind the frontal lobe out and back, then curving in behind it (the
  // "smile" of A1: its posterior edge convex backwards, B63, B69)
  { pts: [[2.6, 9.0], [4.6, 7.6], [6.4, 5.2], [7.0, 2.8], [6.5, 0.6], [4.6, -0.6], [2.2, -1.0], [0.0, -1.1]], depth: 0.44, w: 0.95 },
  // the cardiac region's sides and the branchiocardiac grooves (the H's legs behind: B63, B69)
  { pts: [[4.6, -0.6], [5.3, -3.0], [5.0, -5.8], [4.0, -7.9]], depth: 0.38, w: 0.9 },
  // the cervical groove's outer limb, dividing the hepatic region from the branchial (B63)
  { pts: [[7.0, 2.8], [9.6, 3.6], [12.2, 5.4], [14.4, 7.0]], depth: 0.26, w: 0.85 },
  // the median furrow of the front into the gastric region (B69)
  { pts: [[0.0, 11.2], [0.0, 7.8]], depth: 0.32, w: 0.55 },
];

/**
 * The carapace's regional relief over the dorsal surface (mm): the gastric and cardiac swellings, the branchial
 * regions with their oblique granular ridges, the hepatic hollows behind the orbits, the grooves (A1, A32, B54, B63,
 * B69). `x` is mirrored by the caller only through |x| (the shell's own asymmetry is added by the geometry).
 */
export function dorsalRelief(x: number, z: number): number {
  const ax = Math.abs(x);
  let h = 0;
  h += 0.45 * gauss((x * x) / 18 + ((z - 4.0) * (z - 4.0)) / 14);                    // gastric (mesogastric)
  h += 0.35 * gauss(((ax - 3.4) * (ax - 3.4)) / 5 + ((z - 7.0) * (z - 7.0)) / 5);      // protogastric lobes
  h += 0.42 * gauss((x * x) / 9 + ((z + 3.6) * (z + 3.6)) / 8);                       // cardiac
  h += 0.35 * gauss(((ax - 10.5) * (ax - 10.5)) / 22 + ((z + 2.5) * (z + 2.5)) / 28); // branchial
  h -= 0.45 * gauss(((ax - 10.8) * (ax - 10.8)) / 6 + ((z - 6.6) * (z - 6.6)) / 4);   // hepatic hollow behind the orbit
  for (const g of GROOVES) {
    const d = polyDist(ax, z, g.pts);
    h -= g.depth * gauss((d * d) / (g.w * g.w));
  }
  // the two oblique granular ridges across each branchial region, running in and back from the lateral margin
  // (B63, B69: the pale lines), and a short one on the hepatic region
  h += ridge(ax, z, [15.4, 1.6], [9.4, -1.0], 0.22, 0.7);
  h += ridge(ax, z, [15.0, -3.6], [9.0, -5.6], 0.2, 0.7);
  h += ridge(ax, z, [14.8, 5.4], [11.6, 4.3], 0.15, 0.6);
  // the beaded rim of the dorsal orbital margin
  if (z > 8.6) h += 0.16 * gauss(((z - (10.1 - 0.035 * ax)) ** 2) / 0.12) * Math.min(1, ax / 2.4);
  return h;
}

/**
 * The dorsal surface's mid-line profile (z, y): flat over the front and the gastric region, highest a little in front
 * of the middle, rolling down over the back to the posterior margin — an egg, not a box (the CC0 scan's mid-sagittal
 * section scaled to CW 35; B7, A13, A28)
 */
const VAULT: V2[] = [[-11.4, 7.0], [-10.0, 9.1], [-8.0, 11.0], [-6.0, 12.2], [-4.0, 13.1], [-2.0, 13.8], [0.0, 14.25], [2.5, 14.4], [5.0, 14.4], [8.0, 14.2], [10.5, 13.9], [11.6, 13.6]];

/** Catmull-Rom through (x, y) knots sorted by x, clamped at the ends */
export function curveAt(knots: V2[], x: number): number {
  if (x <= knots[0][0]) return knots[0][1];
  const n = knots.length;
  if (x >= knots[n - 1][0]) return knots[n - 1][1];
  let i = 0;
  while (i < n - 2 && knots[i + 1][0] < x) i++;
  const P = (j: number) => knots[Math.max(0, Math.min(n - 1, j))];
  const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
  const t = (x - p1[0]) / (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  // (tangents from the neighbours' slopes, in units of the segment's own length)
  const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * (p2[0] - p1[0]);
  const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * (p2[0] - p1[0]);
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}

/**
 * The dorsal surface without its relief: the mid-line profile, falling a little towards the lateral margins (≈ 0.75 mm
 * at mid-length: the scan's transverse sections — flat across, not domed). `s` is the share of the way from the centre
 * to the outline along the ray.
 */
export function vault(z: number, s: number): number {
  return curveAt(VAULT, z) - 0.75 * Math.pow(s, 2.6);
}

/**
 * The sternum's plane (y, mm) under (x, z): flat across the middle, rising forward to the buccal frame and backward
 * to the abdomen's hinge under the posterior margin — the underside's curve of the egg (the scan's sagittal sections:
 * 0.6 at mid-length, 1.5 by the fourth legs, 3.5 at the hinge; B61, B67)
 */
export function sternumY(x: number, z: number): number {
  const back = smooth01(-3.5, -10.6, z), front = smooth01(3.5, 6.6, z);
  return 0.55 + 0.35 * Math.min(1, (x / 16) ** 2) + 3.1 * back * back + 1.4 * front * front;
}

// ------------------------------------------------------------------ eyes, mouthparts, abdomen

export const EYE = {
  /** the eyestalk's joint deep in its socket at the inner end of the orbit (B59, B60, B66: the bases ≈ 0.2 CW apart) */
  base: [4.45, 12.55, 10.45] as V3,
  /** raised: upright, splayed ≈ 10° (the scan's front view, A47, B60), straight up from the side (the scan, B7) */
  up: [0.17, 0.985, 0.02] as V3,
  /** folded: out along the orbit's trench, a little down and back (B15) */
  folded: [0.97, -0.03, -0.24] as V3,
  /** basal article, stalk, cornea (B59: the stalk ≈ 1/9 as thick as long; the cornea 1.15–1.25 × the stalk) */
  basal: 1.4,
  basalR: 0.78,
  stalk: 10.7,
  stalkR: 0.5,
  waist: 0.44,
  cornea: 2.1,
  corneaR: 0.64,
};

/**
 * the third maxillipeds: two broad plates closing the buccal frame under the epistome (the "white ovals" of the front
 * views: A19, A25, A47, B4, B12; B60, B61, B64, B67 close up), together ≈ 0.4 CW across — their outer edges ≈ 0.2 CW
 * either side of the midline, the cheliped's coxa just outside them (B61, B64, A47) — and not meeting: a gap ≈ 3 mm
 * wide between their inner edges, the mouthparts dark in it (B61, B64, A47). Each the ischium below and the merus
 * above with the suture between, the narrow exopod along the outer edge, the palp folded at the merus's inner upper
 * corner. Below the orbits and the epistome, the upper ≈ 0.3 of the face left to them (B60, B61), sloping back ≈ 25°
 * from the vertical with the face (the scan's sagittal sections). `hinge` the x of a plate's
 * outer edge, `width` the plate's across, `y0`, `z0` the top of its outer edge, `y1`, `z1` its foot; `length` along it
 */
export const MXP3 = { hinge: 7.0, width: 5.4, y0: 10.2, z0: 9.6, y1: 3.6, z1: 6.55, length: 7.3 };

/**
 * The abdomen folded under the sternum: the male's narrow (B34, B16) and the female's broad, rounded flap (B55, B61,
 * B67). `w(t)` is the half width along it, from its hinge under the posterior margin (t = 0) to the telson (t = 1).
 */
export const ABDOMEN = {
  hinge: -10.2,
  male: { length: 13.5, w: [[0, 5.2], [0.12, 5.0], [0.3, 3.6], [0.55, 2.7], [0.8, 2.0], [0.94, 1.3], [1, 0.0]] as V2[] },
  female: { length: 15.0, w: [[0, 7.0], [0.12, 8.0], [0.4, 8.8], [0.68, 8.0], [0.86, 5.6], [0.96, 2.8], [1, 0.0]] as V2[] },
};

// ------------------------------------------------------------------ legs

/** cross-section knot along an article: t (0 proximal … 1 distal), half height (y), half breadth (z), offsets */
export interface SectionKnot { t: number; hy: number; hz: number; cy?: number; cz?: number }

export interface SpineSpec {
  /** where on the article (t), round it (angle about x from +y towards +z, rad), length, base radius, lean distally */
  t: number;
  a: number;
  length: number;
  r: number;
  lean: number;
}

export type ArticleName = 'cx' | 'bi' | 'me' | 'ca' | 'pr' | 'da';

export interface ArticleSpec {
  name: ArticleName;
  length: number;
  sections: SectionKnot[];
  /** superellipse exponent of the section (2 round, > 2 boxy, < 2 lens-edged) */
  n?: number;
  /** the exponent across the article's breadth (z) where it differs from `n`'s: a plate's flat faces (`n` > 2) meeting
   *  at keeled margins (`nz` < 2) */
  nz?: number;
  /** longitudinal costae or keels: angle, height (mm), half width (rad) */
  costae?: [number, number, number][];
  /** a three-sided prism: amplitude of the cos 3θ term and its phase */
  tri?: [number, number];
  spines?: SpineSpec[];
  /** the narrowed neck at the proximal end (inside the parent's socket, the articular membrane): its share of the article */
  neck?: number;
  /** the section turned about the article's own axis (t, rad) */
  twist?: [number, number][];
  /** a row of small spinules (the serrulate margin of a merus: B24): angle round, t from … to, count, length */
  serrate?: { a: number; t0: number; t1: number; count: number; length: number };
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

/**
 * A walking leg: article lengths (mm) and the merus's half breadth. Never a cylinder: every article is a compressed
 * plate — the CC0 scan's sections through the legs give lenses 4–5 times as broad as thick (the merus ≈ 0.2 CW
 * across, B24, B65, B70, B34) — with its plane turned ≈ 40° about the leg's axis (the scan's sections), the anterior
 * margin down so that the broad faces look forward and up: the meri show broad from the front (A45, A47), from above
 * (B24, B65) and from below (B64) alike. Each is narrowed a little at its proximal joint (B65, B70); the merus broadest a
 * little before its middle with a serrulate anterior
 * margin (B24); the carpus shorter; the propodus narrower, with stiff setae below (A1); the dactylus a slender blade to
 * a sharp, slightly down-curved point (B70, A1).
 */
function walkingLeg(id: LegId, coxa: V3, yaw: number, L: { cx: number; bi: number; me: number; ca: number; pr: number; da: number }, meB: number): LegSpec {
  const b = meB;
  const th = Math.sqrt(meB / 2.5);
  // (the plates turned about the leg's axis with the anterior margin down, so that their broad faces look forward
  // and up: broad from the front (A45, A47), from above (B24, B65) and from below (B64) alike)
  const tw = (a: number, c: number): [number, number][] => [[0, -a], [1, -c]];
  return {
    id, coxa, yaw,
    articles: [
      // coxa and basis-ischium: short and broad, set in the body's foot and widening into the merus's base — no pipe
      // between body and leg (B61, B64, B67; the scan)
      { name: 'cx', length: L.cx, n: 2.2, sections: [S(0, 1.35, 1.8), S(0.5, 1.45, 1.95), S(1, 1.35, 1.85)], twist: tw(0.1, 0.25) },
      { name: 'bi', length: L.bi, n: 2.2, neck: 0.05, sections: [S(0, 1.12, 1.6), S(0.4, 1.1, 1.85), S(1, 1.0, 0.68 * meB + 0.1)], twist: tw(0.3, 0.55) },
      // merus: the broad plate, its anterior margin a keel set with spinules
      {
        name: 'me', length: L.me, n: 2.7, nz: 1.6, neck: 0.04, twist: tw(0.62, 0.72),
        // (thinner with its breadth: a blade ≈ 0.36 of its length across and 2.5–3 times as broad as thick: B24, B65)
        sections: [S(0, 0.74 * th, 0.62 * b), S(0.1, 0.86 * th, 0.88 * b), S(0.42, 0.92 * th, 1.0 * b, 0.04), S(0.85, 0.88 * th, 0.94 * b, 0.04), S(1, 0.8 * th, 0.8 * b)],
        costae: [[Math.PI / 2, 0.2, 0.22], [-Math.PI / 2, 0.08, 0.3], [0, 0.1, 0.5]],
        serrate: { a: Math.PI / 2 - 0.2, t0: 0.15, t1: 0.9, count: 13, length: 0.32 },
        spines: [{ t: 0.93, a: 1.25, length: 0.75, r: 0.2, lean: 0.95 }],
      },
      // carpus: shorter, a little narrower, a crest along its upper face (A1)
      { name: 'ca', length: L.ca, n: 2.5, nz: 1.75, neck: 0.1, twist: tw(0.72, 0.78), sections: [S(0, 0.6 * th, 0.46 * b), S(0.22, 0.72 * th, 0.62 * b), S(0.85, 0.76 * th, 0.7 * b), S(1, 0.7 * th, 0.64 * b)], costae: [[0.25, 0.12, 0.35]] },
      // propodus: narrower again and tapering, stiff setae below (A1)
      { name: 'pr', length: L.pr, n: 2.4, nz: 1.8, neck: 0.08, twist: tw(0.78, 0.82), sections: [S(0, 0.5 * th, 0.44 * b), S(0.15, 0.6 * th, 0.55 * b), S(0.7, 0.58 * th, 0.53 * b), S(1, 0.52 * th, 0.45 * b)], costae: [[Math.PI / 2, 0.08, 0.4]] },
      // dactylus: a slender blade, compressed, to the sharp, slightly down-curved tip (B70, A1; the scan: thin lenses)
      { name: 'da', length: L.da, n: 2.05, neck: 0.08, twist: tw(0.82, 0.85), sections: [S(0, 0.48, 0.34 * b), S(0.12, 0.52, 0.37 * b), S(0.45, 0.42, 0.27 * b, -0.06), S(0.8, 0.26, 0.15 * b, -0.2), S(0.95, 0.1, 0.06, -0.33), S(1, 0.03, 0.03, -0.4)] },
    ],
  };
}

/** the leg pairs' article lengths (mm at CW 35): P2 0.79, P3 0.94, P4 0.99, P5 0.67 CW from merus to dactylus (B70, B65, B64) */
export const WALKING: Record<'P2' | 'P3' | 'P4' | 'P5', { cx: number; bi: number; me: number; ca: number; pr: number; da: number; b: number }> = {
  P2: { cx: 2.0, bi: 2.0, me: 11.6, ca: 5.0, pr: 6.1, da: 5.2, b: 2.25 },
  P3: { cx: 2.1, bi: 2.2, me: 13.8, ca: 5.9, pr: 7.2, da: 6.1, b: 2.5 },
  P4: { cx: 2.1, bi: 2.2, me: 14.5, ca: 6.2, pr: 7.6, da: 6.4, b: 2.55 },
  P5: { cx: 1.9, bi: 1.9, me: 9.8, ca: 4.4, pr: 5.0, da: 4.6, b: 1.95 },
};

/**
 * The legs of the left side. Thoraco-coxal joints along the body wall between the sternum and the pleural line (B61,
 * B64, B67); rest directions fanning from forward (P2) to back (P5) as they stand (A47, B4, B24, B44, A20).
 */
export function legSpecs(): LegSpec[] {
  const P1: LegSpec = {
    id: 'P1', coxa: [9.0, 3.5, 6.2], yaw: 0.7,
    articles: [
      { name: 'cx', length: 2.4, n: 2.3, sections: [S(0, 1.5, 1.6), S(0.5, 1.6, 1.7), S(1, 1.45, 1.5)] },
      { name: 'bi', length: 3.0, n: 2.3, neck: 0.15, sections: [S(0, 1.2, 1.25), S(0.3, 1.35, 1.35), S(1, 1.55, 1.45)] },
      // merus: a long three-sided prism, its lower margins fringed with setae (B2, B34)
      {
        name: 'me', length: 8.6, n: 2.25, neck: 0.04, tri: [0.13, Math.PI / 2],
        sections: [S(0, 1.75, 1.55), S(0.07, 1.95, 1.65), S(0.5, 2.35, 1.85, 0.1), S(0.9, 2.45, 1.92, 0.12), S(1, 2.2, 1.75)],
        costae: [[Math.PI / 2, 0.14, 0.2], [Math.PI, 0.1, 0.25]],
        serrate: { a: Math.PI / 2 + 0.35, t0: 0.2, t1: 0.92, count: 10, length: 0.22 },
      },
      // carpus: short and rounded, its inner angle blunt (B33, B34)
      { name: 'ca', length: 5.0, n: 2.2, neck: 0.1, sections: [S(0, 1.7, 1.6), S(0.25, 2.3, 2.1), S(0.75, 2.45, 2.2), S(1, 2.2, 1.9)], costae: [[0.0, 0.12, 0.3]] },
    ],
  };
  // (each side's four legs nearly parallel, out to the side and a little back, not a fan: A20, B44, A18, B24)
  // (the coxae at the foot of the vertical branchiostegal walls, the sternum nearly as broad as the carapace: the scan's
  // transverse sections, B61, B67)
  // (the joints a little inside the wall's foot, so that the coxa comes out of the body: the scan's transverse
  // sections put the coxae at the bottom corners of the box; P5 higher and further in on the narrowing back)
  const P2 = walkingLeg('P2', [14.9, 2.6, 3.3], 0.3, WALKING.P2, WALKING.P2.b);
  const P3 = walkingLeg('P3', [15.4, 2.3, -0.6], 0.02, WALKING.P3, WALKING.P3.b);
  const P4 = walkingLeg('P4', [15.2, 2.45, -4.5], -0.2, WALKING.P4, WALKING.P4.b);
  const P5 = walkingLeg('P5', [13.9, 3.7, -7.9], -0.5, WALKING.P5, WALKING.P5.b);
  return [P1, P2, P3, P4, P5];
}

/** a chela on the cheliped's propodus bone (x along the palm, y its height, z its thickness): the palm, the fixed
 *  finger set at the palm's distal lower corner and bent down by `fingerAngle`, the dactylus on its own hinge at the
 *  palm's distal upper corner, at rest closed onto the fixed finger (`daAngle`) */
export interface ChelaSpec {
  palm: ArticleSpec;
  finger: ArticleSpec;
  fingerAt: V2;
  fingerAngle: number;
  da: ArticleSpec;
  hinge: V2;
  daAngle: number;
  /** the fingertip (closed) in the propodus bone's frame, for the poses' fitting */
  tip: V2;
}

/**
 * The mature male's chela: the palm elongate, tall and compressed, its upper margin a straight blunt crest and its lower
 * margin falling away distally so that the palm is tallest (≈ 0.6 its length) where the fingers spring from it; the
 * fixed finger broad-based, taking the palm's whole lower half and running on from its lower margin; the dactylus
 * hinged at the upper distal corner, broad and arched over the fixed finger. Measured on the outer face seen square-on
 * (A45; the obliquer B33, B34 foreshorten the palm and make the fingers look steeper): the fingers' axes ≈ 38° and ≈ 42°
 * below the palm's, the closed tips 1.6 palm-lengths out. The large wedge-shaped tooth on the fixed finger's cutting
 * edge at a distance from its base (Wada 2018), the cutting edges finely toothed (B33, B34, A45, B12, B29). Propodus
 * (palm and fixed finger) ≈ 0.95 CW at this size (Wada 2018: log PL = −1.719 + 2.105 log CW, 0.97 CW at CW 35).
 */
export const CHELA_MALE: ChelaSpec & { tooth: { t: number; h: number } } = {
  palm: {
    name: 'pr', length: 19.5, n: 2.25, neck: 0.035,
    // (the upper margin nearly straight at y ≈ 3.8, the lower margin falling from −2.2 to −7.8)
    sections: [S(0, 2.2, 1.35), S(0.06, 3.3, 1.5, -0.25), S(0.2, 4.7, 1.6, -0.9), S(0.45, 5.4, 1.66, -1.5), S(0.75, 5.75, 1.62, -1.9), S(1, 5.8, 1.55, -2.0)],
    // the palm's upper margin a blunt crest, its lower margin rounded (B33)
    costae: [[0.0, 0.3, 0.2], [Math.PI, 0.16, 0.32]],
  },
  finger: {
    // its base the palm's distal lower half, narrowing fast and then evenly to the tip (A45)
    name: 'pr', length: 16.0, n: 2.3,
    sections: [S(0, 4.0, 1.55), S(0.16, 3.9, 1.5), S(0.35, 2.3, 1.35), S(0.6, 1.7, 1.12), S(0.85, 0.85, 0.74, -0.1), S(1, 0.1, 0.1, -0.25)],
    costae: [[Math.PI, 0.12, 0.3]],
  },
  fingerAt: [17.1, -1.5],
  fingerAngle: -0.66,
  da: {
    name: 'da', length: 18.4, n: 2.3, neck: 0.03,
    sections: [S(0, 1.6, 1.3), S(0.1, 1.75, 1.38), S(0.4, 1.7, 1.25, -0.25), S(0.7, 1.3, 1.0, -0.6), S(0.9, 0.7, 0.6, -0.9), S(1, 0.12, 0.12, -1.0)],
    costae: [[0.0, 0.18, 0.22]],
  },
  hinge: [18.2, 2.6],
  daAngle: -0.69,
  tip: [29.8, -11.3],
  /** the wedge tooth on the fixed finger (t along the finger, its height mm) */
  tooth: { t: 0.32, h: 1.4 },
};

/**
 * The female's (and the immature male's) chela, built at the size it has on a male-sized arm (the arm is scaled down
 * by the individual from the merus on: `chelaFor`): small, the palm short, the fingers slender, pointed and little
 * deflexed, the cutting edges finely toothed (B62, B68, A47).
 */
export const CHELA_FEMALE: ChelaSpec = {
  palm: {
    name: 'pr', length: 9.5, n: 2.4, neck: 0.05,
    sections: [S(0, 1.55, 1.25), S(0.08, 2.05, 1.4), S(0.4, 2.55, 1.5), S(0.8, 2.6, 1.45, -0.1), S(1, 2.3, 1.35, -0.2)],
    costae: [[0.0, 0.16, 0.22]],
  },
  finger: {
    name: 'pr', length: 8.5, n: 2.2,
    sections: [S(0, 1.15, 1.05), S(0.2, 1.0, 0.92), S(0.6, 0.7, 0.62), S(0.9, 0.35, 0.33, -0.08), S(1, 0.06, 0.06, -0.15)],
  },
  fingerAt: [9.0, -0.9],
  fingerAngle: -0.38,
  da: {
    name: 'da', length: 9.0, n: 2.2, neck: 0.05,
    sections: [S(0, 0.95, 0.88), S(0.1, 1.05, 0.9), S(0.45, 0.82, 0.72, -0.15), S(0.8, 0.48, 0.42, -0.38), S(1, 0.06, 0.06, -0.5)],
  },
  hinge: [9.2, 1.6],
  daAngle: -0.5,
  tip: [16.9, -3.8],
};

/**
 * The rest (bind) pose of the leg joints (rad): the coxa's pitch, the basis's levation, the merus's turn and (the
 * cheliped) its swing at the ischio-meral joint, the carpus, the propodus and the dactylus (positive lifts). Chosen
 * near the standing pose so that the articular membranes bend least in use.
 */
export const BIND: Record<LegId, { pitch: number; lev: number; roll: number; mc: number; cp: number; pd: number; mcYaw?: number; meYaw?: number }> = {
  P1: { pitch: -0.1, lev: 0.35, roll: 0, meYaw: 1.1, mc: -0.55, mcYaw: -1.55, cp: 0.05, pd: 0.0 },
  // (the walking legs' `mcYaw` is the knee's own swing: the distal leg does not lie in the merus's plane — it swings
  // forward on the front legs and back on the hind ones (B24, A1, B44, A20): never straight spokes)
  P2: { pitch: -0.08, lev: 0.55, roll: 0, mc: -1.05, cp: -0.18, pd: -0.3, mcYaw: -0.3 },
  P3: { pitch: -0.08, lev: 0.55, roll: 0, mc: -1.05, cp: -0.18, pd: -0.3, mcYaw: -0.08 },
  P4: { pitch: -0.08, lev: 0.55, roll: 0, mc: -1.05, cp: -0.18, pd: -0.3, mcYaw: 0.2 },
  P5: { pitch: -0.06, lev: 0.5, roll: 0, mc: -1.0, cp: -0.15, pd: -0.3, mcYaw: 0.42 },
};

/**
 * The cheliped's size against the carapace by sex and size (Wada 2018: the mature male's propodus 0.52 CW at CW 20,
 * 0.82 CW at 30; the female's small, B62, B68): the arm's scale from the merus on, and which chela it carries.
 */
export function chelaFor(sex: 'm' | 'f' | 'unknown', cw_mm: number): { arm: number; male: boolean } {
  // (the female's arm stout and its chela ≈ 0.3 CW long: B60, A47, B62)
  if (sex !== 'm') return { arm: 0.66, male: false };
  // (log PL = −1.719 + 2.105 log CW: PL/CW grows from 0.36 at CW 12 to 0.82 at CW 30; the male form from CW ≈ 18)
  const pl = Math.min(0.99, Math.max(0.36, Math.pow(10, -1.719) * Math.pow(cw_mm, 1.105)));
  if (cw_mm < 18) return { arm: 0.66 + 0.06 * Math.max(0, (cw_mm - 10) / 8), male: false };
  return { arm: Math.min(1.04, pl / 0.95), male: true };
}
