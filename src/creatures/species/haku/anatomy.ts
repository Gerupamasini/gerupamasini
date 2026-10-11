/**
 * ハク (the 20–40 mm juvenile of the flathead grey mullet, Mugil cephalus): body plan, measured on a lateral photograph
 * of a live specimen in a clear case (and checked against the reference set: lateral studio shots of 20–30 mm
 * specimens, dorsal views of schools in turbid shallows, frontal head shots).
 *
 * Every length is a fraction of total length (TL, snout tip → caudal fork tips) and `s` runs along the body from the
 * snout (0) to the tips of the caudal lobes (1). The model is built at MODEL_TL and scaled per individual.
 *
 * What makes it a ハク and not "a small fish":
 *  - a slender, almost round trunk (depth ≈ 0.21 TL, width ≈ 0.56 of depth), deepest between the pectorals and the
 *    first dorsal
 *  - a broad, flat-topped head with a short blunt snout, its front nearly upright: two thick lips, the lower jutting
 *  - a very large eye (0.073 TL across, a third of the head) with a silver iris and a thin dark rim
 *  - two widely separated dorsal fins: four spines fanning from a short base at mid-body, a soft second dorsal (high in
 *    front) over the anal fin; pectorals set high on the flank right behind the gill cover; small subabdominal pelvics
 *  - a long caudal peduncle and a shallowly forked tail
 *  - countershading: a golden-olive back densely peppered with melanophores over mirror-silver flanks and a white
 *    belly, brown spots at the pectoral base and along the crown's edge, an orange-brown patch before the eye
 */

/** total length the geometry is built at (metres); species data gives `modelLength_mm` = 30 */
export const MODEL_TL = 0.03;
/** the rig's origin (J_root, the fish's position) sits on the body axis at this s: the centre of mass */
export const S_PIVOT = 0.38;
/** caudal fin base (end of the scaled body) */
export const S_CAUDAL_BASE = 0.845;
/** the lips' rounded front: the blunt, nearly upright snout closes over this length */
export const S_CAP = 0.005;
/** the head (dense rings in the loft) */
export const S_HEAD = 0.26;

/** model z (forward +Z) of a point at s, in TL units */
export const zOf = (s: number): number => S_PIVOT - s;

type Table = readonly (readonly [number, number])[];

/** Smooth interpolation through a table (cubic Hermite with Catmull-Rom tangents), clamped at the ends. */
export function curve(table: Table): (s: number) => number {
  const n = table.length;
  return (s: number) => {
    if (s <= table[0][0]) return table[0][1];
    if (s >= table[n - 1][0]) return table[n - 1][1];
    let i = 0;
    while (i < n - 2 && s > table[i + 1][0]) i++;
    const [x0, y0] = table[i], [x1, y1] = table[i + 1];
    const xm = i > 0 ? table[i - 1] : table[i], xp = i < n - 2 ? table[i + 2] : table[i + 1];
    const m0 = ((y1 - xm[1]) / (x1 - xm[0])) * (x1 - x0);
    const m1 = ((xp[1] - y0) / (xp[0] - x0)) * (x1 - x0);
    const t = (s - x0) / (x1 - x0), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
  };
}

/*
 * The outline, traced from a lateral photograph of a live ハク in a clear case (TL ≈ 825 px): heights of the dorsal
 * and ventral profile above and below the line from the snout tip to the middle of the caudal base, as fractions of
 * TL. The head is the deepest part of the fish after the shoulder; the snout is blunt and nearly upright, its front
 * the two thick lips with the lower one jutting a little past the upper (`lipShift`); the belly is fullest over the
 * pelvic fins; the long peduncle is under half the greatest depth.
 */
const TOP = curve([
  [0, 0.021], [0.004, 0.0265], [0.008, 0.0305], [0.013, 0.033], [0.018, 0.035], [0.023, 0.038], [0.028, 0.0435],
  [0.034, 0.05], [0.04, 0.0555], [0.05, 0.061], [0.06, 0.0665], [0.07, 0.0715], [0.08, 0.0765], [0.09, 0.0815],
  [0.1, 0.0855], [0.12, 0.091], [0.14, 0.0955], [0.164, 0.0985], [0.189, 0.101], [0.214, 0.103], [0.25, 0.1045],
  [0.3, 0.106], [0.35, 0.107], [0.41, 0.107], [0.45, 0.103], [0.5, 0.096], [0.55, 0.089], [0.6, 0.082], [0.65, 0.073],
  [0.7, 0.062], [0.745, 0.05], [0.78, 0.0425], [0.82, 0.041], [0.845, 0.045],
]);
const BOT = curve([
  [0, 0.034], [0.005, 0.036], [0.01, 0.0365], [0.015, 0.039], [0.02, 0.0415], [0.03, 0.0455], [0.04, 0.0485],
  [0.048, 0.0505], [0.056, 0.053], [0.067, 0.06], [0.078, 0.066], [0.09, 0.071], [0.114, 0.077], [0.137, 0.082],
  [0.173, 0.089], [0.209, 0.094], [0.246, 0.096], [0.282, 0.099], [0.319, 0.1], [0.345, 0.103], [0.38, 0.1], [0.43, 0.091],
  [0.48, 0.088], [0.53, 0.0865], [0.566, 0.085], [0.6, 0.081], [0.65, 0.072], [0.7, 0.059], [0.743, 0.048], [0.78, 0.0415],
  [0.82, 0.041], [0.845, 0.043],
]);
/** full width (dorsal view): a broad head, the snout narrower than the head, a slender peduncle */
const WIDTH = curve([
  [0, 0.042], [0.02, 0.062], [0.04, 0.078], [0.06, 0.09], [0.09, 0.104], [0.12, 0.114], [0.16, 0.121], [0.2, 0.125],
  [0.27, 0.124], [0.35, 0.118], [0.43, 0.108], [0.52, 0.092], [0.6, 0.077], [0.68, 0.061], [0.75, 0.05], [0.8, 0.044],
  [0.845, 0.04],
]);
/** superellipse exponents of the upper and lower halves of a section: a flat broad head top, a rounded belly */
const N_TOP = curve([[0, 2.7], [0.03, 2.5], [0.07, 2.35], [0.15, 2.35], [0.25, 2.2], [0.4, 2.05], [0.845, 2.0]]);
const N_BOT = curve([[0, 2.5], [0.03, 2.3], [0.1, 2.15], [0.3, 2.2], [0.6, 2.05], [0.845, 2.0]]);

/** the snout's front is rounded off over `cap` (an ellipse): S_CAP in profile, where the lips stand nearly upright */
function nose(s: number, cap = S_CAP): number {
  if (s >= cap) return 1;
  const u = 1 - s / cap;
  return Math.sqrt(Math.max(0, 1 - u * u));
}
/** in dorsal view the lips curve round in a broad U, from a front as wide as the mouth's opening (half width, TL) */
const S_CAP_WIDE = 0.018;
export const MOUTH_HALF_WIDTH = 0.008;

/**
 * Height of a section's widest point (TL units). On the snout it is the gape, so the two lips meet at the side of
 * every section there (the mouth splits the head's surface along one line of the loft); behind the corner of the mouth
 * it eases back to the body axis.
 */
export function axisY(s: number): number {
  if (s <= GAPE.s) return gapeY(s);
  const L = 0.06, t = (s - GAPE.s) / L;
  if (t >= 1) return 0;
  // cubic Hermite: the gape's height and slope at the corner, level at zero by the front of the eye
  const slope = (GAPE.y1 - GAPE.y0) / GAPE.s;
  return GAPE.y1 * (2 * t * t * t - 3 * t * t + 1) + L * slope * (t * t * t - 2 * t * t + t);
}

export interface Section {
  /** half width, height above and below the axis, axis height (TL units) */
  hw: number;
  top: number;
  bot: number;
  yc: number;
  nTop: number;
  nBot: number;
}

export function section(s: number): Section {
  const sc = Math.min(Math.max(s, 0), S_CAUDAL_BASE);
  const k = nose(s), yc = axisY(sc);
  // at s = 0 the section is the front of the gape: a short level line, the lips closing onto it from above and below
  const hw = MOUTH_HALF_WIDTH + (WIDTH(sc) / 2 - MOUTH_HALF_WIDTH) * nose(s, S_CAP_WIDE);
  return { hw, top: (TOP(sc) - yc) * k, bot: (BOT(sc) + yc) * k, yc, nTop: N_TOP(sc), nBot: N_BOT(sc) };
}

/**
 * A point of the section at angle φ (0 = dorsal midline, π/2 = the fish's left (+X), π = ventral), TL units, in the
 * section plane (x lateral, y up).
 */
export function sectionPoint(sec: Section, phi: number): [number, number] {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const n = cp >= 0 ? sec.nTop : sec.nBot;
  const x = sec.hw * Math.sign(sp) * Math.pow(Math.abs(sp), 2 / n);
  const y = sec.yc + (cp >= 0 ? sec.top : sec.bot) * Math.sign(cp) * Math.pow(Math.abs(cp), 2 / n);
  return [x, y];
}

/** height of the dorsal / ventral midline at s (TL units) */
export const dorsalY = (s: number): number => { const c = section(s); return c.yc + c.top; };
export const ventralY = (s: number): number => { const c = section(s); return c.yc - c.bot; };

/**
 * The eye: centre (s, height), the radius of its visible disc (to the dark rim where the skin closes over it), and how
 * far the shallow dome of its cornea stands proud of the head. A big silver disc, 7.3 % of TL across, its pupil a third
 * of that.
 */
export const EYE = { s: 0.106, y: 0.009, r: 0.0365, bulge: 0.0035, pupil: 0.335 } as const;

/**
 * The mouth, measured on the photograph: the gape runs from between the lips at the front (h −0.011) back and down to
 * its corner (the rictus) below the front of the nostrils; the jaw hinges there.
 */
export const GAPE = { s: 0.035, y0: -0.011, y1: -0.031 } as const;
export function gapeY(s: number): number {
  return GAPE.y0 + (GAPE.y1 - GAPE.y0) * Math.min(1, Math.max(0, s / GAPE.s));
}

/**
 * The lips: thick rolls meeting in the gape. `upper` / `lower` are the radii of the rolls where they meet (how deep the
 * groove between them is), `margin` the shallow furrow along each lip's outer edge.
 */
export const LIPS = { upper: 0.0068, lower: 0.0065, margin: 0.0012 } as const;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** how far (TL) a point of the snout at (s, height y) is pushed forward: the lower lip juts past the upper */
export function lipShift(s: number, y: number): number {
  if (s >= 0.03) return 0;
  const k = (1 - s / 0.03) ** 2;
  const dy = gapeY(s) - y;   // depth below the gape
  // the lower lip's front is a rounded roll: furthest forward a third of the way down, back in to the chin
  return 0.0055 * k * smooth(-0.001, 0.011, dy) * (1 - smooth(0.015, 0.032, dy));
}

/**
 * How far (TL) the skin at (s, height y) sinks in toward the gape: two rolled lips meeting in a groove along the whole
 * gape, the groove fading into a dimple at the corner of the mouth, a shallow furrow along each lip's outer edge.
 */
export function lipInset(s: number, y: number): number {
  const end = GAPE.s + 0.012;
  if (s >= end) return 0;
  const g = s <= GAPE.s ? gapeY(s) : GAPE.y1;
  const dy = y - g, a = Math.abs(dy);
  const r = dy >= 0 ? LIPS.upper : LIPS.lower;
  let inset = a < r ? r - Math.sqrt(r * r - (r - a) * (r - a)) : 0;
  inset += LIPS.margin * Math.exp(-(((a - 2 * r) / (0.5 * r)) ** 2));
  // deep at the front, a fold at the corner, gone a little behind it
  const depth = s <= GAPE.s ? 1 - 0.6 * smooth(0.4 * GAPE.s, GAPE.s, s) : 0.4 * (1 - smooth(GAPE.s, end, s));
  return inset * depth;
}

/*
 * The gill cover, measured on the photograph. Two plates lie over the cheek, each with a free edge standing off the
 * skin behind it: the preopercle (its posterior margin a little behind the eye, turning forward below) and the opercle
 * (its bony margin, then a thin membranous flap whose free edge is the gill opening, from above the pectoral fin's base
 * round and forward to the throat). Tables: s of the edge at height h (TL units), h ascending.
 */
export const PREOP_EDGE_PTS = [[-0.07, 0.15], [-0.055, 0.166], [-0.04, 0.176], [-0.02, 0.18], [0.0, 0.176], [0.02, 0.169], [0.04, 0.163], [0.052, 0.16]] as const;
export const OPER_BONE_PTS = [[-0.088, 0.18], [-0.075, 0.204], [-0.06, 0.224], [-0.04, 0.241], [-0.02, 0.249], [0.0, 0.252], [0.02, 0.252], [0.05, 0.251]] as const;
export const OPER_EDGE_PTS = [[-0.088, 0.186], [-0.075, 0.213], [-0.06, 0.24], [-0.045, 0.264], [-0.03, 0.276], [-0.015, 0.279], [0.0, 0.274], [0.015, 0.265], [0.03, 0.258], [0.05, 0.255]] as const;
export const PREOP_EDGE = curve(PREOP_EDGE_PTS);
export const OPER_BONE = curve(OPER_BONE_PTS);
export const OPER_EDGE = curve(OPER_EDGE_PTS);
export const GILL = {
  /** the plates' height ranges (top, bottom) */
  preop: { top: 0.052, bottom: -0.07, width: 0.03, lift: 0.0014 },
  oper: { top: 0.05, bottom: -0.088, lift: 0.002, membrane: 0.0007 },
  /** the opercle swings outward about this point (its articulation, high at the front) */
  hinge: { s: 0.2, y: 0.045 },
} as const;

/**
 * Axial chain (joint, s). The head is rigid back to J_sp1; the chain bends behind it. Joint spacing narrows toward
 * the tail where the bending is.
 */
export const SPINE: readonly (readonly [string, number])[] = [
  ['J_head', 0.07], ['J_sp1', 0.2], ['J_sp2', 0.31], ['J_sp3', 0.42], ['J_sp4', 0.52], ['J_sp5', 0.61],
  ['J_sp6', 0.69], ['J_sp7', 0.76], ['J_caudal', 0.825], ['J_tail', 0.91],
];
export const SPINE_S = SPINE.map(([, s]) => s);

/** every bone of the rig, in skeleton order (parents before children) */
export const BONES = ['J_root', ...SPINE.map(([n]) => n), 'J_pec_L', 'J_pec_R', 'J_d1', 'J_jaw', 'J_oper_L', 'J_oper_R'] as const;
export type BoneName = (typeof BONES)[number];
export const boneIndex = (name: BoneName): number => BONES.indexOf(name);

/** pectoral fin base: high on the flank behind the gill cover, at the dark axillary spot */
export const PEC = { s: 0.262, y: 0.028 } as const;
/** first dorsal fin (4 spines) and the jaw hinge (at the corner of the mouth) */
export const D1 = { s0: 0.425, s1: 0.447 } as const;
export const JAW = { s: GAPE.s, y: GAPE.y1 } as const;

/**
 * Median and paired fins, measured on the photograph. `base` is the attachment along s; lengths are ray lengths (TL)
 * from the front of the base to the back; `rake` is how far the rays lean back from the perpendicular (radians), at
 * the front of the base and at its back: the first dorsal's four spines fan out from a short base, the second dorsal
 * is high in front and low behind, the anal fin's long front rays slope back over its short hind ones.
 */
export const FINS = {
  d1: { s0: D1.s0, s1: D1.s1, len: [0.1, 0.097, 0.093, 0.05], rake: [0.86, 1.4], rays: 4 },
  d2: { s0: 0.645, s1: 0.7, len: [0.066, 0.068, 0.062, 0.055, 0.05, 0.047], rake: [0.8, 1.2], rays: 9 },
  anal: { s0: 0.58, s1: 0.68, len: [0.096, 0.09, 0.075, 0.055, 0.042, 0.034], rake: [0.88, 1.12], rays: 10 },
  pelvic: { s: 0.333, len: 0.11, spread: 0.024, rake: 1.05, rays: 6 },
  pectoral: { len: 0.094, spread: 0.03, rays: 14 },
  caudal: { s0: 0.832, halfBase: 0.044, fork: 0.962, tip: 1.0, span: 0.104, rays: 18 },
} as const;

/** fin ids (the fin shader's third attribute component) */
export const FIN_ID = { caudal: 0, d1: 1, d2: 2, anal: 3, pelvic: 4, pectoral: 5 } as const;
