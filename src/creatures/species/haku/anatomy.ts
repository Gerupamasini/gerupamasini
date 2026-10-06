/**
 * ハク (the 20–40 mm juvenile of the flathead grey mullet, Mugil cephalus): body plan, read off the reference set
 * (lateral studio shots of 20–30 mm specimens, dorsal views of schools in turbid shallows, frontal head shots).
 *
 * Every length is a fraction of total length (TL, snout tip → caudal fork tips) and `s` runs along the body from the
 * snout (0) to the tips of the caudal lobes (1). The model is built at MODEL_TL and scaled per individual.
 *
 * What makes it a ハク and not "a small fish":
 *  - a slender, almost round trunk (depth ≈ 0.18 TL, width ≈ 0.75 of depth), deepest just behind the head
 *  - a broad, flat-topped head with a short blunt snout and a small terminal mouth set slightly low
 *  - a very large eye (≈ 0.085 TL, a third of the head) with a bright silver iris
 *  - two widely separated dorsal fins: a small spiny first dorsal (4 spines) at mid-body, a soft second dorsal over
 *    the anal fin; pectorals set high on the flank right behind the gill cover; small subabdominal pelvics
 *  - a long caudal peduncle and a forked tail
 *  - countershading: a dark olive-grey, finely peppered back over mirror-silver flanks and a white belly, a dark
 *    axillary spot at the pectoral base, the chevron myomeres showing through the thin flank
 */

/** total length the geometry is built at (metres); species data gives `modelLength_mm` = 30 */
export const MODEL_TL = 0.03;
/** the rig's origin (J_root, the fish's position) sits on the body axis at this s: the centre of mass */
export const S_PIVOT = 0.38;
/** caudal fin base (end of the scaled body) */
export const S_CAUDAL_BASE = 0.835;
/** below this s the snout is a rounded cap */
export const S_CAP = 0.075;

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

// full body depth (dorsal to ventral) and full width, from S_CAP back to the caudal base
const DEPTH = curve([[0.075, 0.118], [0.09, 0.13], [0.14, 0.156], [0.2, 0.17], [0.27, 0.178], [0.35, 0.18], [0.43, 0.175], [0.52, 0.161], [0.6, 0.14], [0.68, 0.116], [0.75, 0.097], [0.8, 0.088], [0.835, 0.09]]);
const WIDTH = curve([[0.075, 0.096], [0.09, 0.106], [0.14, 0.12], [0.2, 0.127], [0.27, 0.126], [0.35, 0.121], [0.43, 0.11], [0.52, 0.094], [0.6, 0.078], [0.68, 0.062], [0.75, 0.051], [0.8, 0.045], [0.835, 0.041]]);
/** share of the depth above the axis: the head's top is flat and low, the belly full */
const TOP_SHARE = curve([[0.0, 0.36], [0.075, 0.43], [0.15, 0.46], [0.3, 0.48], [0.6, 0.49], [0.835, 0.5]]);
/** body axis height: the snout tip sits a little below the axis (the mouth is terminal, slightly low) */
const AXIS_Y = curve([[0, -0.014], [0.04, -0.009], [0.09, -0.003], [0.14, 0], [1, 0]]);
/** superellipse exponents of the upper and lower halves of a section: a flat broad head top, a rounded belly */
const N_TOP = curve([[0.075, 2.3], [0.15, 2.35], [0.25, 2.2], [0.4, 2.05], [0.835, 2.0]]);
const N_BOT = curve([[0.075, 2.0], [0.3, 2.1], [0.6, 2.05], [0.835, 2.0]]);

/**
 * The snout: a blunt wedge rather than a dome. Depth and width close toward the tip with different exponents (the
 * snout is narrower than the head in dorsal view and its upper profile slopes down to the mouth).
 */
function capDepth(s: number): number {
  if (s >= S_CAP) return 1;
  const u = 1 - s / S_CAP;
  return Math.pow(Math.max(0, 1 - Math.pow(u, 1.75)), 1 / 1.75);
}
function capWidth(s: number): number {
  if (s >= S_CAP) return 1;
  const u = 1 - s / S_CAP;
  return Math.pow(Math.max(0, 1 - Math.pow(u, 1.55)), 1 / 1.55) * (0.82 + 0.18 * (s / S_CAP));
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
  const sc = Math.min(Math.max(s, S_CAP), S_CAUDAL_BASE);
  const d = DEPTH(sc) * capDepth(s), w = WIDTH(sc) * capWidth(s);
  const ts = TOP_SHARE(Math.min(s, S_CAUDAL_BASE));
  return { hw: w / 2, top: d * ts, bot: d * (1 - ts), yc: AXIS_Y(s), nTop: N_TOP(sc), nBot: N_BOT(sc) };
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

/** the eye: centre (s, height), radius and how far it bulges out of the head (TL units) */
export const EYE = { s: 0.09, y: 0.013, r: 0.031, axial: 0.013, bulge: 0.002 } as const;

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
export const BONES = ['J_root', ...SPINE.map(([n]) => n), 'J_pec_L', 'J_pec_R', 'J_d1', 'J_jaw'] as const;
export type BoneName = (typeof BONES)[number];
export const boneIndex = (name: BoneName): number => BONES.indexOf(name);

/** pectoral fin base: high on the flank right behind the gill cover */
export const PEC = { s: 0.232, y: 0.008 } as const;
/** first dorsal fin (4 spines) and the jaw hinge */
export const D1 = { s0: 0.425, s1: 0.49 } as const;
export const JAW = { s: 0.045, y: -0.016 } as const;

/**
 * Median and paired fins. `base` is the attachment along s; lengths are ray lengths (TL) from the front of the base
 * to the back; `rake` is how far the rays lean back from the perpendicular (radians).
 */
export const FINS = {
  d1: { s0: D1.s0, s1: D1.s1, len: [0.07, 0.066, 0.052, 0.03], rake: 0.62, rays: 4 },
  d2: { s0: 0.635, s1: 0.705, len: [0.062, 0.058, 0.046, 0.034, 0.026], rake: 0.72, rays: 9 },
  anal: { s0: 0.6, s1: 0.7, len: [0.056, 0.052, 0.042, 0.03, 0.022], rake: 0.75, rays: 10 },
  pelvic: { s: 0.37, len: 0.072, spread: 0.022, rays: 6 },
  pectoral: { len: 0.112, spread: 0.034, rays: 14 },
  caudal: { s0: 0.815, halfBase: 0.042, fork: 0.925, tip: 1.0, span: 0.118, rays: 18 },
} as const;

/** fin ids (the fin shader's third attribute component) */
export const FIN_ID = { caudal: 0, d1: 1, d2: 2, anal: 3, pelvic: 4, pectoral: 5 } as const;
