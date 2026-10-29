/**
 * ヤマトオサガニ (Macrophthalmus japonicus, Macrophthalmidae): the body plan of the model, in millimetres, for a crab
 * of 35 mm carapace width (CW, between the tips of the external orbital teeth: the game's `length_mm` of a crab is
 * its carapace width). Males reach 40 mm, females 38 mm (Wada 2018).
 *
 * Measured on the CC0 photogrammetry scan of a male (ffish.asia / floraZia.com) for the body's own shape — its
 * dorsal surface, walls, face, orbits and underside drawn from tables measured on it (`scanfit.ts`), its legs' and
 * eyestalks' lengths, sections and roots measured along their axes — and on the two photograph sheets that came with
 * the request — A1–A51 (Wikimedia Commons and iNaturalist) and B1–B70 (iNaturalist, and twelve stereo-microscope
 * photographs, B59–B70) — for what a scan does not show (colour, setae, teeth, the claws' forms); never a generic crab:
 *  - carapace  transversely rectangular and short: 0.56 CW long at the margins in plan (the scan; B65 0.55), the
 *              frontal lobe the furthest forward and the dorsal orbital margins 2 mm behind it, nearly straight across
 *              to the external orbital teeth; the lateral margins nearly parallel over the anterolateral teeth, the
 *              branchial regions rolling over behind them into rounded posterolateral corners (the scan, B65, B63)
 *  - front     a narrow deflexed lobe between the eyestalks' bases (≈ 0.08 CW across: B60, B66, B69) with a median
 *              furrow running back into the gastric region (B69)
 *  - orbits    long trenches open forwards and upwards in front of the dorsal orbital margin, from the eyestalks'
 *              sockets out to the external orbital teeth, floored by the infraorbital margin standing 2–3 mm out in
 *              front of the dorsal margin 2 mm below it (the scan's sections; B15, A32, A47): the eyestalks fold into
 *              them; the dorsal orbital margin finely beaded, the infraorbital margin crenulate (B15, B49)
 *  - margins   three anterolateral teeth a side counting the external orbital tooth (B63, B69, A32; Ito 2014 for
 *              the allied M. banzai): the first acute, forward and outward, the second and third smaller; the lateral
 *              margins fringed with setae (A32, B24, B49)
 *  - dorsum    regions marked by low grooves: the H of the mesogastric and cardiac regions, the curved posterior edge
 *              of the gastric region (A1, B63, B69), two oblique granular ridges across each branchial region (B63,
 *              B69); flat across the front half, the branchial regions rolling over into the sides behind the third
 *              anterolateral tooth (no marginal ridge there: the scan's transverse sections, B7, A47) and the posterior
 *              third falling to the posterior margin halfway down the back (the scan's sagittal sections, B7, A13)
 *  - depth     a deep body: sternum to the dorsal crest ≈ 0.42 CW (the scan); in front a box with vertical walls
 *              under margins overhanging them by 1.5 mm, in side view an egg — the underside rising forward from
 *              mid-length to the buccal frame, and backward to the abdomen's hinge (the scan, B7)
 *  - face      upright: flat across the maxillipeds 9.3 mm in front of the carapace's centre from the infraorbital
 *              margins down to the ischia's lower half, then sloping back to the sternum; falling back beyond the
 *              maxillipeds towards the corners (the scan; A47, A45, B60); dark with mud in the field (A45, A47, B7)
 *  - eyes      long, slender eyestalks set close to the midline (bases ≈ 0.22 CW apart: the scan, A1, A45, B12),
 *              ≈ 0.38 CW long (reaching the external orbital tooth when folded: B15), raised and splayed ≈ 17°,
 *              bowed out and forward (≈ 17 mm the radius of the bend): leaning out ≈ 30° from their sockets and
 *              turning upright towards the cornea, which leans back a little (the scan's stalks, A47, B60);
 *              a short thick basal article, a slender translucent stalk with a slight waist a third of the way up and a
 *              gentle swelling into the cornea; the cornea a terminal, elongate oval cap a little wider than the stalk
 *              (B59, B66: 1.15–1.25 ×), brown with dark mottling
 *  - mouth     the third maxillipeds two broad plates closing the buccal frame under the epistome (B60, B61, B67),
 *              together ≈ 0.4 CW across with a gap between them (B61, B64, A47, A45): the merus above (the "white
 *              ovals" of the field photographs: A19, A25, A47, B4, B12, B29; bluish in B39, B40) and the ischium below,
 *              the exopod along the outer edge, the palp at the inner upper corner
 *  - chelipeds the mature male's large and long: propodus 0.82 CW at CW 30 (Wada 2018), the palm long and stout (the
 *              scan's: 0.53 as high as long, thick through its proximal half), the fingers short and deflexed — the
 *              fixed finger ≈ 32°, the dactylus arched ≈ 50° over it — their tips curving in, a large wedge-shaped tooth
 *              on the fixed finger's cutting edge at a distance from its base, the cutting edges brown (the scan; A45,
 *              B12, B33, B34, B8, B29); the merus a long three-sided prism fringed with setae, the carpus long and stout
 *              (the scan; B2, B34). The female's (and the immature male's) small, slender, with pointed, little-deflexed
 *              fingers (A47, B62, B68)
 *  - walking   long: P2 < P3 < P4 > P5, 1.02, 1.31, 1.35, 0.71 CW from merus to dactylus, the merus over 0.4 of it
 *  legs        (the scan's legs along their axes). The meri deep blades standing in the knee's plane, ≈ 0.21 CW high
 *              and half as thick, a teardrop in section — the dorsal margin a thin keel set with spinules, the ventral
 *              margin blunt and setose (the scan's sections; B24); the carpus a rounded box, the propodus a high oval
 *              with stiff setae below (A1), the dactylus flattened across the plane, long, slender, slightly curved and
 *              sharp (B70, A1); each article's distal end lobed over the next (B65, B70). The knee's plane turned
 *              about the merus on the hind legs (P3 0.7, P4 and P5 ≈ 1 rad on the scan): their meri out and forward,
 *              their distal legs swinging back under them, the meri's faces seen from above (B24, B65)
 *  - ventral   a broad sternum rising fore and aft; the coxae of the walking legs in a row along its edge at the foot
 *              of the walls, stout and contiguous, running on into the meri (the scan; B61, B64, B67); the male's
 *              abdomen narrow, the female's broad (B16, B34, B55, B61, B67)
 * Frame: x the crab's left, y dorsal, z forward (anterior). Origin: under the carapace's centre on the plane of the
 * sternum. The legs' own frames: x distal along the article, y dorsal, z anterior on the left side (posterior on the
 * right, so that both frames are right-handed and a positive turn about z always lifts).
 */

import { DORSUM, LEGS, WALL } from './scanfit';

export const CW_MM = 35;
/** model carapace width (m): the geometry is built for a 35 mm crab and scaled to the individual */
export const MODEL_CW = CW_MM / 1000;

export type V2 = [number, number];
export type V3 = [number, number, number];

// ------------------------------------------------------------------ carapace

export const CARAPACE = {
  /** z of the frontal lobe's tip and of the posterior margin at the margins (19.8 mm, 0.56 CW: the scan, B65) */
  front: 9.15,
  back: -10.6,
  /** the centre the outline's rays start from (x, z): the wall table's axis (`WALL.c`) */
  centre: [0, -1.5] as V2,
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
 * geometry samples the smooth runs between the knots and keeps the teeth's tips and notches sharp. Measured on the
 * scan's dorsal surface (where it turns down at the margin) and its walls (where the dorsum rolls over behind): the
 * frontal lobe furthest forward, the dorsal orbital margins 2 mm behind it and nearly straight out to the external
 * orbital teeth, three anterolateral teeth, the lateral margins nearly parallel, the posterolateral corners rounded
 * into a broad, slightly convex posterior margin (B65, B63, A32).
 */
export const OUTLINE: { p: V2; kind: 'F' | 'O' | 'T' | 'N' | 'L' | 'P' }[] = [
  { p: [0.0, 9.15], kind: 'F' },
  { p: [1.2, 9.1], kind: 'F' },
  { p: [2.3, 8.9], kind: 'F' },
  // the eyestalk's socket at the orbit's inner end, then the dorsal orbital margin out to the external orbital tooth
  { p: [3.2, 8.4], kind: 'O' },
  { p: [4.6, 7.4], kind: 'O' },
  { p: [6.0, 7.0], kind: 'O' },
  { p: [8.6, 6.85], kind: 'O' },
  { p: [11.0, 6.3], kind: 'O' },
  { p: [13.2, 5.6], kind: 'O' },
  { p: [15.2, 5.3], kind: 'O' },
  // the external orbital tooth: acute, forward and outward at the corner; the second and third anterolateral teeth a
  // little further out, each with a notch behind it (the scan's top view; B63, B69)
  { p: [17.6, 5.9], kind: 'T' },
  { p: [17.0, 4.6], kind: 'N' },
  { p: [18.3, 3.7], kind: 'T' },
  { p: [17.6, 2.5], kind: 'N' },
  { p: [18.1, 1.1], kind: 'T' },
  { p: [17.4, 0.2], kind: 'N' },
  // the lateral margin, then where the branchial region rolls over into the wall: down the side and round the back
  { p: [17.0, -1.2], kind: 'L' },
  { p: [16.2, -2.6], kind: 'L' },
  { p: [14.9, -4.0], kind: 'L' },
  { p: [14.4, -6.1], kind: 'L' },
  { p: [13.0, -7.8], kind: 'L' },
  { p: [11.2, -9.0], kind: 'P' },
  { p: [9.2, -9.75], kind: 'P' },
  { p: [7.2, -10.1], kind: 'P' },
  { p: [5.4, -10.25], kind: 'P' },
  { p: [2.6, -10.4], kind: 'P' },
  { p: [0.0, -10.6], kind: 'P' },
];

/** bilinear in a table of rows (z) by columns (|x|), clamped at its edges */
function table2(T: { x0: number; z0: number; step: number; rows: number[][] }, x: number, z: number): number {
  const nz = T.rows.length, nx = T.rows[0].length;
  const u = Math.max(0, Math.min(nx - 1.0001, (Math.abs(x) - T.x0) / T.step)), v = Math.max(0, Math.min(nz - 1.0001, (z - T.z0) / T.step));
  const i = Math.floor(v), k = Math.floor(u), fv = v - i, fu = u - k;
  const R = T.rows;
  return (R[i][k] * (1 - fu) + R[i][k + 1] * fu) * (1 - fv) + (R[i + 1][k] * (1 - fu) + R[i + 1][k + 1] * fu) * fv;
}

/** the dorsal surface's height over (x, z) without the grooves' relief: the scan's (`DORSUM`) */
export function dorsalHeight(x: number, z: number): number {
  return table2(DORSUM, x, z);
}

/**
 * height of the free margin at an outline point: the dorsal surface's own there (the scan) — the frontal lobe bent
 * down between the eyestalks' sockets, the orbital and anterolateral margins level with the top, the margin falling
 * down the sides behind the third tooth and round the back halfway down it
 */
export function marginHeight(x: number, z: number): number {
  return dorsalHeight(x, z);
}

/**
 * The body's wall: the distance out from the vertical axis through `WALL.c` to the surface along the direction `deg`
 * (degrees from forward round to backward, either side) at the height `y` (the scan's; bilinear, clamped)
 */
export function wallRadius(deg: number, y: number): number {
  const W = WALL;
  const nt = W.rows.length, ny = W.rows[0].length;
  const u = Math.max(0, Math.min(nt - 1.0001, (Math.abs(deg) - W.th0) / W.thStep)), v = Math.max(0, Math.min(ny - 1.0001, (y - W.y0) / W.yStep));
  const i = Math.floor(u), k = Math.floor(v), fu = u - i, fv = v - k;
  const R = W.rows;
  return (R[i][k] * (1 - fv) + R[i][k + 1] * fv) * (1 - fu) + (R[i + 1][k] * (1 - fv) + R[i + 1][k + 1] * fv) * fu;
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
  { pts: [[2.5, 7.6], [4.4, 6.2], [6.2, 4.3], [6.9, 2.3], [6.5, 0.3], [4.6, -0.8], [2.2, -1.2], [0.0, -1.3]], depth: 0.4, w: 0.95 },
  // the cardiac region's sides and the branchiocardiac grooves (the H's legs behind: B63, B69)
  { pts: [[4.6, -0.6], [5.3, -3.0], [5.0, -5.8], [4.0, -7.9]], depth: 0.38, w: 0.9 },
  // the cervical groove's outer limb, dividing the hepatic region from the branchial (B63)
  { pts: [[6.9, 2.3], [9.6, 2.9], [12.0, 4.1], [14.0, 5.0]], depth: 0.24, w: 0.85 },
  // the median furrow of the front into the gastric region (B69)
  { pts: [[0.0, 9.2], [0.0, 6.4]], depth: 0.3, w: 0.55 },
];

/**
 * The carapace's regional relief over the dorsal surface (mm): the grooves and the granular ridges the scan's smoothed
 * surface has lost, and a little of the gastric and cardiac swellings, the branchial regions and the hepatic hollows
 * behind the orbits over its own (A1, A32, B54, B63, B69). `x` is mirrored by the caller only through |x| (the
 * shell's own asymmetry is added by the geometry).
 */
export function dorsalRelief(x: number, z: number): number {
  const ax = Math.abs(x);
  let h = 0;
  h += 0.16 * gauss((x * x) / 18 + ((z - 3.4) * (z - 3.4)) / 14);                    // gastric (mesogastric)
  h += 0.12 * gauss(((ax - 3.4) * (ax - 3.4)) / 5 + ((z - 5.6) * (z - 5.6)) / 5);      // protogastric lobes
  h += 0.16 * gauss((x * x) / 9 + ((z + 3.6) * (z + 3.6)) / 8);                       // cardiac
  h += 0.12 * gauss(((ax - 10.5) * (ax - 10.5)) / 22 + ((z + 2.5) * (z + 2.5)) / 28); // branchial
  h -= 0.2 * gauss(((ax - 10.8) * (ax - 10.8)) / 6 + ((z - 4.8) * (z - 4.8)) / 4);    // hepatic hollow behind the orbit
  for (const g of GROOVES) {
    const d = polyDist(ax, z, g.pts);
    h -= g.depth * gauss((d * d) / (g.w * g.w));
  }
  // the two oblique granular ridges across each branchial region, running in and back from the lateral margin
  // (B63, B69: the pale lines), and a short one on the hepatic region
  h += ridge(ax, z, [15.4, 1.6], [9.4, -1.0], 0.22, 0.7);
  h += ridge(ax, z, [15.0, -3.6], [9.0, -5.6], 0.2, 0.7);
  h += ridge(ax, z, [14.4, 4.4], [11.4, 3.5], 0.15, 0.6);
  return h;
}

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
 * The sternum's mid-line profile (z, y over the lowest point): flat over the middle, rising forward from mid-length
 * to the buccal frame and backward over the posterior third to the abdomen's hinge — the underside of the egg (the
 * scan's underside beside the male's abdomen; B61, B67)
 */
const STERNUM_PROFILE: V2[] = [[-11.2, 4.4], [-10.6, 3.0], [-10.0, 2.2], [-9.0, 1.5], [-8.0, 0.95], [-7.0, 0.55], [-6.0, 0.32], [-5.0, 0.25], [-2.0, 0.25], [0.0, 0.6], [1.0, 1.2], [2.0, 1.85], [3.0, 2.45], [4.0, 3.0], [5.0, 3.45], [6.0, 3.85], [7.0, 4.4]];

/** the sternum's surface (y, mm) under (x, z): the mid-line profile, a little higher out towards the coxae */
export function sternumY(x: number, z: number): number {
  return curveAt(STERNUM_PROFILE, z) + 0.25 * Math.min(1, (x / 14) ** 2);
}

// ------------------------------------------------------------------ eyes, mouthparts, abdomen

export const EYE = {
  /** the eyestalk's joint in its socket at the inner end of the orbit, just in front of the dorsal orbital margin (the
   *  scan: the stalks rise 7.8 mm apart; B59, B60, B66) */
  base: [3.8, 13.0, 8.4] as V3,
  /** raised: the chord from the socket to the cornea's tip — splayed ≈ 17° and a little back (the scan's front and
   *  side views, A47, B60) */
  up: [0.293, 0.952, -0.091] as V3,
  /** folded: out along the orbit's trench, a little down and back (the scan's orbits, B15) */
  folded: [0.97, -0.035, -0.23] as V3,
  /** the stalk's bow off its chord at mid-length (mm): out to the side and forward alike — it leaves its socket leaning
   *  out ≈ 30° and turns upright towards the cornea, which leans back a little (the scan's eyestalks: 0.28 mm out and
   *  0.27 mm forward over their middle 7 mm, both sides; A47, B60) */
  bow: [0.55, 0.5] as V2,
  /** basal article, stalk, cornea (the scan: the stalk 0.9 × 0.8 mm across, the cornea ≈ 1.4 mm; B59: the stalk ≈ 1/9
   *  as thick as long, the cornea 1.15–1.25 × the stalk) */
  basal: 1.4,
  basalR: 0.74,
  stalk: 10.0,
  stalkR: 0.45,
  waist: 0.4,
  cornea: 2.1,
  corneaR: 0.69,
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
export const MXP3 = { hinge: 7.0, width: 5.4, y0: 10.3, z0: 9.15, y1: 4.4, z1: 6.4, length: 6.5 };

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
  /** the distal end run straight on into what it carries (a chela's palm into its fingers): no lobe over the next
   *  article and no rim */
  flush?: boolean;
  /** a teardrop section (0 … 1): the dorsal margin drawn out to a thin keel, the ventral margin blunt and full (the
   *  walking legs' meri: the scan's sections); negative, the keel ventral (a chela's fixed finger, thin below where it
   *  runs on from the palm's lower margin) */
  tear?: number;
  /** a row of small spinules (the serrulate margin of a merus: B24): angle round, t from … to, count, length */
  serrate?: { a: number; t0: number; t1: number; count: number; length: number };
  /** the axis curved in the article's own plane (x, y): its direction turned by (t, rad) from the base's, the sections
   *  square to it (a chela's fingers: crescents) */
  bend?: [number, number][];
  /** the axis turned out of that plane towards +z (t, rad): a chela's fingers turned in towards the other claw */
  bendZ?: [number, number][];
}

/** a point on an article's axis (`bend`'s and `bendZ`'s curve, `length` long along it) and the axis's direction there
 *  (`a` its turn in the article's plane, `b` its turn out of it) */
export function articleAxis(spec: ArticleSpec, length: number, t: number): { x: number; y: number; z: number; a: number; b: number } {
  const turn = (k: [number, number][] | undefined, u: number) => {
    if (!k) return 0;
    if (u <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (u <= k[i][0]) return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (u - k[i - 1][0])) / (k[i][0] - k[i - 1][0]);
    return k[k.length - 1][1];
  };
  if ((!spec.bend && !spec.bendZ) || t <= 0) return { x: t * length, y: 0, z: 0, a: 0, b: 0 };
  const n = Math.max(2, Math.ceil(t * 48));
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * t, a = turn(spec.bend, u), b = turn(spec.bendZ, u), ds = (t * length) / n;
    x += Math.cos(b) * Math.cos(a) * ds;
    y += Math.cos(b) * Math.sin(a) * ds;
    z += Math.sin(b) * ds;
  }
  return { x, y, z, a: turn(spec.bend, t), b: turn(spec.bendZ, t) };
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

/** a walking leg's article lengths (mm), its sections' lean (rad, + the dorsal edge back) on the merus, the carpus and
 *  the propodus, and the merus's keel (`tear`); the sections themselves are the scan's (`LEGS`) */
export interface WalkingDims {
  cx: number; bi: number; me: number; ca: number; pr: number; da: number;
  lean: [number, number, number];
  tear: number;
}

/**
 * A walking leg, from the CC0 scan's legs (sections cut square to each article's chord every 5 % of its length, 0.25 mm
 * voxels; its 1.28 times to CW 35: `LEGS`). Every article its own shape, never a cylinder: the merus a deep blade
 * standing in the knee's plane, highest a third of the way out and its ventral margin rising towards the knee, the
 * dorsal margin a thin keel leaning ≈ 15° back, set with spinules and a subdistal spine, the ventral margin blunt, full
 * and fringed with setae; the carpus narrow at the knee and widening distally while it thins, crested above; the
 * propodus a high oval tapering distally and bowed a little up; the dactylus flattened the other way, broad across the
 * plane, arched, to a sharp, slightly down-curved point (B70, A1). Each narrowed a little at its proximal joint (B65,
 * B70). The leg's plane is turned on the hind legs (`BIND.roll`): the meri's faces look up and back from above.
 */
function walkingLeg(id: Exclude<LegId, 'P1'>, coxa: V3, yaw: number, D: WalkingDims): LegSpec {
  const T = LEGS[id];
  const rows = (r: number[][]) => r.map(([t, hy, hz, cy, cz]) => S(t, hy, hz, cy, cz));
  const mh = Math.max(...T.me.map((r) => r[1])), mt = Math.max(...T.me.map((r) => r[2]));
  // (the dactylus beyond the scan's blunt tips: on along its arch to a sharp point)
  const d = T.da[T.da.length - 1];
  const da = [...rows(T.da), S(0.85, 0.62 * d[1], 0.58 * d[2], 0.6 * d[3], 0.6 * d[4]), S(0.95, 0.16, 0.14, 0.2 * d[3]), S(1, 0.03, 0.03, 0)];
  // (each section's lean: a turn about the article's axis, its dorsal edge towards posterior)
  const [lm, lc, lp] = D.lean;
  return {
    id, coxa, yaw,
    articles: [
      // coxa and basis-ischium: short and stout, set in the body's foot and widening into the merus's deep base — no
      // pipe between body and leg (B61, B64, B67; the scan)
      // (as deep as the merus's base nearly: the scan's roots run on into the meri, contiguous along the body's foot)
      { name: 'cx', length: D.cx, n: 2.4, sections: [S(0, 0.55 * mh + 0.35, 0.95 * mt + 0.2), S(0.5, 0.62 * mh + 0.35, mt + 0.25), S(1, 0.62 * mh + 0.3, 0.95 * mt + 0.15)] },
      { name: 'bi', length: D.bi, n: 2.4, neck: 0.05, twist: [[0, 0], [1, lm * 0.6]], sections: [S(0, 0.58 * mh + 0.3, 0.92 * mt + 0.1), S(0.45, 0.7 * mh + 0.1, 0.95 * mt), S(1, 0.8 * mh, 0.9 * mt, -0.06 * mh)] },
      // merus: the deep blade, keeled above
      {
        name: 'me', length: D.me, n: 2.4, nz: 2.1, tear: D.tear, neck: 0.04, twist: [[0, lm * 0.8], [1, lm]], sections: rows(T.me),
        costae: [[0, 0.14, 0.18], [Math.PI / 2, 0.05, 0.45], [Math.PI, 0.05, 0.5]],
        serrate: { a: 0.08, t0: 0.12, t1: 0.86, count: 14, length: 0.34 },
        spines: [{ t: 0.9, a: 0.12, length: 0.8, r: 0.22, lean: 0.95 }],
      },
      // carpus: widening distally, a crest along its upper face (A1)
      { name: 'ca', length: D.ca, n: 2.6, nz: 2.4, tear: 0.18, neck: 0.1, twist: [[0, lm], [0.3, lc], [1, lc]], sections: rows(T.ca), costae: [[0, 0.12, 0.3]] },
      // propodus: a high oval tapering distally, stiff setae below (A1)
      { name: 'pr', length: D.pr, n: 2.3, nz: 2.1, tear: 0.2, neck: 0.08, twist: [[0, lc], [0.3, lp], [1, lp]], sections: rows(T.pr), costae: [[0, 0.08, 0.35]] },
      // dactylus: a slender blade, broad across the leg's plane, to the sharp, slightly down-curved tip (B70, A1)
      { name: 'da', length: D.da, n: 2.1, neck: 0.08, sections: da },
    ],
  };
}

/**
 * The leg pairs' article lengths measured on the scan from joint to joint (mm at CW 35): the meri long — P3's 0.61 CW
 * (B24, B65 from above, A45, A47 from the front) — P4 the longest leg, 1.35 CW from merus to dactylus; P2 smaller
 * throughout; P5 short, its propodus a flat oval. (P2's dactylus is short on the scan, its tip lost: set from P3's
 * proportions.) The sections' leans read off the scan's sections at mid-length.
 */
export const WALKING: Record<'P2' | 'P3' | 'P4' | 'P5', WalkingDims> = {
  P2: { cx: 1.7, bi: 1.9, me: 18.9, ca: 5.6, pr: 6.4, da: 4.8, lean: [0.28, 0.2, 0.2], tear: 0.5 },
  P3: { cx: 1.9, bi: 2.6, me: 21.5, ca: 8.0, pr: 9.4, da: 6.8, lean: [0.4, 0.15, 0.0], tear: 0.5 },
  P4: { cx: 1.7, bi: 1.9, me: 21.3, ca: 8.4, pr: 9.7, da: 7.8, lean: [0.15, 0.1, -0.4], tear: 0.3 },
  P5: { cx: 1.8, bi: 2.4, me: 10.0, ca: 4.3, pr: 6.3, da: 4.2, lean: [0.12, -0.35, -0.45], tear: 0.5 },
};

/**
 * The legs of the left side. Thoraco-coxal joints where the scan's legs leave the body: along the foot of the side
 * wall over the sternum's edge, P2 under the carapace's widest point, each further back and higher than the one before
 * (P5 high on the narrowing back), the cheliped's at the front corner of the sternum (B61, B64, B67). Rest directions
 * the meri's as they stand on the scan: forward and out on the front legs, out on P4, out and a little back on P5.
 */
export function legSpecs(): LegSpec[] {
  // the cheliped's arm, from the scan's left cheliped: its merus and carpus cut square to their chords, at the scan's own
  // proportions to the body (Wada's (2018) allometry is the propodus's: the chela alone is drawn larger, `CHELA_MALE`)
  const P1: LegSpec = {
    id: 'P1', coxa: [8.0, 4.2, 5.2], yaw: 0.7,
    articles: [
      { name: 'cx', length: 2.4, n: 2.3, sections: [S(0, 1.6, 1.7), S(0.5, 1.75, 1.85), S(1, 1.7, 1.75)] },
      { name: 'bi', length: 3.0, n: 2.3, neck: 0.15, sections: [S(0, 1.35, 1.4), S(0.3, 1.5, 1.55), S(1, 1.65, 1.75)] },
      // merus: a long three-sided prism, stout, its inner face swelling, its lower margins fringed with setae (B2, B34)
      {
        name: 'me', length: 11.0, n: 2.25, neck: 0.04, tri: [0.13, Math.PI / 2],
        sections: [S(0, 1.67, 1.81, 0, 0.22), S(0.1, 1.88, 2.03, 0.07, 0.36), S(0.35, 2.17, 2.25, 0.29, 0.58), S(0.6, 2.25, 2.32, 0.43, 0.65), S(0.8, 2.17, 1.96, 0.36, 0.36), S(0.9, 1.99, 1.59, 0.13, 0.04), S(1, 1.67, 1.59, 0.22, 0.11)],
        costae: [[Math.PI / 2, 0.14, 0.2], [Math.PI, 0.1, 0.25]],
        serrate: { a: Math.PI / 2 + 0.35, t0: 0.2, t1: 0.92, count: 10, length: 0.22 },
      },
      // carpus: stout, widening distally to the palm's joint, its inner angle blunt (B33, B34)
      { name: 'ca', length: 7.4, n: 2.3, neck: 0.1, sections: [S(0, 1.45, 1.81, 0.72, 0.07), S(0.15, 1.62, 2.04, 0.75, 0.09), S(0.3, 1.73, 2.07, 0.69, 0.06), S(0.5, 1.96, 2.17, 0.79, 0), S(0.7, 2.2, 2.07, 0.66, -0.25), S(0.85, 2.35, 1.8, 0.51, -0.53), S(1, 2.1, 1.72, 0.47, -0.14)], costae: [[0.0, 0.12, 0.3]] },
    ],
  };
  const P2 = walkingLeg('P2', [14.0, 2.6, -1.0], 0.75, WALKING.P2);
  const P3 = walkingLeg('P3', [14.2, 3.4, -4.1], 0.5, WALKING.P3);
  const P4 = walkingLeg('P4', [13.9, 4.2, -7.6], 0.2, WALKING.P4);
  const P5 = walkingLeg('P5', [11.4, 6.0, -10.0], -0.2, WALKING.P5);
  return [P1, P2, P3, P4, P5];
}

/** a chela on the cheliped's propodus bone (x along the palm, y its height, z its thickness): the palm, the fixed
 *  finger (its own piece set at the palm's distal lower corner and bent down by `fingerAngle`, or the palm's own distal
 *  part: `fixedFrom`), the dactylus on its own hinge at the palm's distal upper corner, at rest closed onto the fixed
 *  finger (`daAngle`) */
export interface ChelaSpec {
  palm: ArticleSpec;
  finger?: ArticleSpec;
  fingerAt?: V2;
  fingerAngle?: number;
  /** where along the palm piece the fixed finger begins, when the palm carries it (its axis turning down into it) */
  fixedFrom?: number;
  da: ArticleSpec;
  hinge: V2;
  daAngle: number;
  /** the fingertip (closed) in the propodus bone's frame, for the poses' fitting */
  tip: V3;
}

/**
 * The mature male's chela. The palm from the CC0 scan's left chela (a mature male: its PL 0.70 of its CW, on Wada's
 * (2018) curve for its size) laid flat on its outer face and measured every 0.75–1.5 mm along it, then 1.38 times to
 * the PL of a male of CW 35 (Wada 2018: log PL = −1.719 + 2.105 log CW, 0.97 CW): long and stout — 25 mm, its height
 * rising from 5 mm at the carpus to 13 mm, its upper margin straight from a third of the way along; 7.3 mm thick
 * through its proximal half, thinning to 3 mm distally. The fingers from the photographs of mature males' claws (the
 * scan's lie open and less deflexed): seen side-on (B23 closed, B29 open) strongly deflexed, hanging straight down from
 * the palm's end; from the front (B12, the claws' outline projected through the render's camera: the fit is best with
 * them turned in) and from above (B25) reaching in towards the other claw, turned 25° out of the palm's plane towards
 * its inner face, the tips ≈ 3 mm in (`bendZ`). The fixed finger the palm's lower distal corner drawn down — its
 * proximal edge the lower margin turning down without a break, its cutting edge facing distally — short and broad-
 * based, tapering to its point 7 mm below the palm's lower margin, with a large tooth on its cutting edge (Wada 2018);
 * the palm and the fixed finger one surface, its axis turning down round the corner (`bend`, `fixedFrom`). The dactylus
 * hinged at the palm's upper distal corner, a band ≈ 3 mm across hanging in front of the palm's distal face and on down
 * beside the fixed finger, its tip curving back to meet the fixed finger's; its outer edge convex. Between them a fine
 * slit, opening a little at its base. Both fingers flatter than they are broad, their outer faces running on from the
 * palm's. The cutting edges finely toothed and dark brown, the tips orange (B12, B23, B29, B33, B34, A45).
 */
export const CHELA_MALE: ChelaSpec & { tooth: { t: number; h: number } } = {
  palm: {
    // the scan's palm (to t ≈ 0.52), the corner (the axis turning down by 76°) and the fixed finger (from t ≈ 0.77,
    // turning in); the palm's upper margin a blunt crest, its lower margin rounded (B33)
    name: 'pr', length: 32.52, n: 2.05, neck: 0.03,
    sections: [S(0, 2.2, 1.7, 0, 0.15), S(0.043, 3.39, 2.01, 0.66, -0.21), S(0.085, 3.62, 2.5, 0.88, -0.26), S(0.127, 3.98, 2.85, 1.22, -0.31), S(0.192, 4.81, 3.21, 1.74, 0), S(0.256, 5.18, 3.45, 2.09, 0.36), S(0.318, 5.51, 3.49, 2.42, 0.48), S(0.38, 5.69, 3.63, 2.59, 0.39), S(0.446, 6.04, 3.49, 2.6, 0.36), S(0.511, 6.21, 3.27, 2.77, -0), S(0.523, 6.24, 3.23, 2.75, -0.05), S(0.553, 6.36, 2.87, 2.83, -0.32), S(0.584, 6.68, 2.45, 3.17, -0.53), S(0.614, 6.78, 2.11, 3.36, -0.69), S(0.645, 5.33, 1.95, 2.08, -0.76), S(0.675, 4.09, 1.83, 1.1, -0.82), S(0.706, 3.22, 1.73, 0.57, -0.87), S(0.737, 2.55, 1.63, 0.27, -0.91), S(0.767, 2.04, 1.55, 0.02, -0.95), S(0.794, 1.84, 1.52, 0.01, -0.93), S(0.823, 1.69, 1.46, -0.01, -0.87), S(0.858, 1.5, 1.35, -0.02, -0.75), S(0.894, 1.27, 1.22, -0.03, -0.57), S(0.929, 1, 1.07, -0.04, -0.34), S(0.958, 0.75, 0.93, -0.04, -0.11), S(0.981, 0.44, 0.57, -0.03, 0.11), S(0.993, 0.18, 0.5, -0.01, 0.23), S(1, 0.12, 0.12, 0, 0.3)],
    bend: [[0, 0], [0.523, 0], [0.767, -1.33]],
    bendZ: [[0, 0], [0.728, 0], [0.766, 0.11], [0.805, 0.32], [0.846, 0.44], [1, 0.44]],
    costae: [[0.0, 0.3, 0.2], [Math.PI, 0.16, 0.32]],
  },
  fixedFrom: 0.735,
  da: {
    // a band from its hinge at the palm's upper distal corner, hanging in front of the palm's distal face, its tip
    // curving back to the fixed finger's; its outer edge convex (B23, B29)
    name: 'da', length: 19.81, n: 2.3, neck: 0.03,
    sections: [S(0, 0.8, 1.45, 0, -1.03), S(0.049, 0.9, 1.45, 0.37, -1.03), S(0.117, 1.16, 1.43, 0.31, -1.01), S(0.195, 1.32, 1.4, 0.18, -0.98), S(0.292, 1.51, 1.36, 0.09, -0.91), S(0.39, 1.57, 1.3, 0.04, -0.82), S(0.487, 1.56, 1.23, 0.02, -0.7), S(0.586, 1.51, 1.15, 0.01, -0.55), S(0.687, 1.37, 1.05, 0.04, -0.38), S(0.791, 1.08, 0.95, 0.11, -0.18), S(0.875, 0.7, 0.87, 0.17, -0), S(0.937, 0.35, 0.5, 0.21, 0.15), S(0.969, 0.17, 0.35, 0.14, 0.22), S(1, 0.12, 0.12, 0, 0.3)],
    bend: [[0, 0], [0.195, -0.11], [0.292, -0.2], [0.39, -0.29], [0.487, -0.35], [0.586, -0.4], [0.687, -0.46], [0.791, -0.56], [0.875, -0.76], [0.937, -1.02]],
    bendZ: [[0, 0], [0.447, 0], [0.513, 0.06], [0.58, 0.18], [0.648, 0.31], [0.718, 0.36], [1, 0.36]],
    costae: [[0.0, 0.18, 0.22]],
  },
  hinge: [25.55, 7.15],
  daAngle: -1.242,
  tip: [24.5, -11.3, 3.16],
  /** the large tooth on the fixed finger's cutting edge (t along the palm piece, its height mm) */
  tooth: { t: 0.846, h: 0.8 },
};

/**
 * The female's (and the immature male's) chela, built at the size it has on a male-sized arm (the arm is scaled down
 * by the individual from the merus on: `chelaFor`): small, the palm short, the fingers slender, pointed and little
 * deflexed, the cutting edges finely toothed (B62, B68, A47).
 */
export const CHELA_FEMALE: ChelaSpec = {
  palm: {
    name: 'pr', length: 9.5, n: 2.4, neck: 0.05, flush: true,
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
  tip: [16.9, -3.8, 0],
};

/**
 * The rest (bind) pose of the leg joints (rad): the coxa's pitch, the basis's levation, the merus's turn and (the
 * cheliped) its swing at the ischio-meral joint, the carpus, the propodus and the dactylus (positive lifts). Chosen
 * near the standing pose so that the articular membranes bend least in use.
 */
export const BIND: Record<LegId, { pitch: number; lev: number; roll: number; mc: number; cp: number; pd: number; mcYaw?: number; meYaw?: number }> = {
  P1: { pitch: -0.1, lev: 0.35, roll: 0, meYaw: 1.1, mc: -0.55, mcYaw: -1.55, cp: 0.05, pd: 0.0 },
  // (the walking legs' `roll` turns the knee's plane about the merus, dorsal edge forward: the distal leg swings back
  // under the merus on the hind legs — the scan's legs: 0.1, 0.8, 1.1, 1.1 rad from P2 to P5, their meri out and
  // forward, their feet fanned back from them (B24, A1, B44, A20); `mcYaw` the knee's own swing (forward on P2))
  P2: { pitch: -0.08, lev: 0.3, roll: 0.1, mc: -1.2, cp: -0.12, pd: -0.25, mcYaw: -0.15 },
  P3: { pitch: -0.08, lev: 0.3, roll: 0.7, mc: -1.2, cp: -0.12, pd: -0.25, mcYaw: 0 },
  P4: { pitch: -0.08, lev: 0.3, roll: 0.9, mc: -1.2, cp: -0.12, pd: -0.25, mcYaw: 0 },
  P5: { pitch: -0.06, lev: 0.3, roll: 0.6, mc: -1.1, cp: -0.12, pd: -0.25, mcYaw: 0 },
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
