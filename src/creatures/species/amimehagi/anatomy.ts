/**
 * アミメハギ (Rudarius ercodes, Monacanthidae): body plan, measured on lateral photographs of live and fresh specimens
 * (docs/models/amimehagi/README.md: the black-background studio shot of a ~35 mm fish, a ~45 mm fish in the hand, a
 * pale reticulate ~65 mm fish on a white board) and checked against the dorsal and frontal views in the same set.
 *
 * Every length is a fraction of total length (TL, snout tip → caudal fin tip) and `s` runs along the body from the
 * snout (0) to the tip of the tail (1). The model is built at MODEL_TL and scaled per individual.
 *
 * What makes it an アミメハギ and not "a small filefish":
 *  - a rhomboid, very deep body (≈ 0.56 TL from the soft dorsal's origin to the tip of the pelvic flap) and very thin:
 *    the greatest width is ≈ 0.095 TL, at the eyes, a sixth of the depth; the back and the belly are knife edges
 *  - the deepest point above is the origin of the soft dorsal (s ≈ 0.48); between it and the first dorsal spine the
 *    back dips in a shallow saddle; below, the belly runs straight from the chin to the pelvic flap (s ≈ 0.43), a dark
 *    triangular point behind which the profile steps up to the anal fin's origin
 *  - a short pointed snout with a small terminal mouth and thick pale lips, slightly upturned
 *  - a large eye set high (centre 0.07 TL above the snout–tail axis, 0.09 TL across), well behind the snout
 *  - the first dorsal spine right over the back of the eye: stout, curved back, its rear edge set with two rows of
 *    downturned barbs; it stands up or folds back into a groove (a tiny second spine locks it)
 *  - long, low soft dorsal and anal fins (≈ 26 and 24 rays) on the rear half, mirror images of each other: the fish
 *    swims by sending waves along them
 *  - a small rounded pectoral just behind a short oblique gill slit, level with the bottom of the eye
 *  - a very short, narrow caudal peduncle and a rounded fan of a tail (12 rays), crossed by dark bars
 *  - a skin of fine prickly granules (velvety, a soft sheen) bearing scattered tiny white filaments
 *  - pattern: pale round spots in a darker net (the 網目), very variable in colour (orange, olive, brown, grey, yellow),
 *    often with darker saddles and a dark flap tip
 */

/** total length the geometry is built at (metres); species data gives `modelLength_mm` = 40 */
export const MODEL_TL = 0.04;
/** the rig's origin (J_root, the fish's position) sits on the body axis at this s: near the centre of mass */
export const S_PIVOT = 0.38;
/** caudal fin base (end of the scaled body) */
export const S_CAUDAL_BASE = 0.77;
/** the head ends just behind the gill slit and the pectoral base (the Head mesh / Body mesh seam) */
export const S_HEAD = 0.31;

/** model z (forward +Z) of a point at s, in TL units */
export const zOf = (s: number): number => S_PIVOT - s;
/** inverse of zOf */
export const sOf = (z: number): number => S_PIVOT - z;

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
 * The outline: heights of the dorsal and ventral profile above and below the line from the snout tip to the middle of
 * the caudal base, as fractions of TL. Averaged over three lateral photographs (the deepest of them is a little
 * deeper still); the soft dorsal origin and the pelvic flap are the rhomboid's two corners.
 */
export const DORSAL_PTS: Table = [
  [0, 0.012], [0.012, 0.026], [0.03, 0.047], [0.05, 0.066], [0.075, 0.09], [0.1, 0.112], [0.13, 0.138], [0.16, 0.162],
  [0.19, 0.184], [0.22, 0.202], [0.245, 0.212], [0.27, 0.214], [0.3, 0.209], [0.33, 0.207], [0.37, 0.213], [0.41, 0.224],
  [0.45, 0.236], [0.48, 0.241], [0.5, 0.235], [0.53, 0.219], [0.56, 0.198], [0.6, 0.168], [0.64, 0.135], [0.68, 0.1],
  [0.71, 0.073], [0.735, 0.057], [0.755, 0.051], [0.77, 0.049],
];
export const VENTRAL_PTS: Table = [
  [0, 0.011], [0.012, 0.021], [0.03, 0.038], [0.05, 0.056], [0.08, 0.083], [0.11, 0.11], [0.15, 0.143], [0.19, 0.174],
  [0.23, 0.203], [0.27, 0.23], [0.31, 0.256], [0.35, 0.281], [0.38, 0.3], [0.405, 0.316], [0.425, 0.325], [0.44, 0.318],
  [0.455, 0.297], [0.47, 0.278], [0.5, 0.262], [0.54, 0.236], [0.58, 0.205], [0.62, 0.17], [0.66, 0.13], [0.69, 0.096],
  [0.715, 0.071], [0.74, 0.056], [0.755, 0.051], [0.77, 0.05],
];
/** full width (dorsal view): widest at the eyes, the snout a narrow wedge, a thin peduncle */
export const WIDTH_PTS: Table = [
  [0, 0.022], [0.02, 0.036], [0.05, 0.05], [0.09, 0.066], [0.14, 0.08], [0.19, 0.09], [0.23, 0.094], [0.28, 0.091],
  [0.34, 0.085], [0.4, 0.077], [0.48, 0.067], [0.56, 0.056], [0.64, 0.045], [0.7, 0.037], [0.74, 0.031], [0.77, 0.029],
];
/** height of the widest line of the section: at eye level on the head, near the axis behind */
export const BELT_PTS: Table = [[0, 0.0], [0.1, 0.03], [0.2, 0.05], [0.3, 0.035], [0.42, 0.012], [0.55, 0.0], [0.77, 0.0]];

export const dorsalY = curve(DORSAL_PTS);
export const ventralY = curve(VENTRAL_PTS);
export const fullWidth = curve(WIDTH_PTS);
export const beltY = curve(BELT_PTS);

/**
 * the eye: centre (s, y), radius of the eyeball, how far its centre sits inside the skin, the socket's raised rim, and
 * the skin that covers the ball's edge: a thick fleshy ring from the opening (`aperture`, radius round the eye's axis)
 * out to where it runs into the cheek (`lidOut`). The opening shows the iris and pupil; the rest of the ball is under skin
 */
export const EYE = { s: 0.215, y: 0.072, r: 0.052, sink: 0.03, rim: 0.06, aperture: 0.036, lidOut: 0.057 } as const;
/** the gape: mouth corner at s, the line between the lips just below the axis, rising a little to the front */
export const GAPE = { s: 0.032, y0: -0.002, slope: -0.07 } as const;
export const gapeY = (s: number): number => GAPE.y0 + GAPE.slope * s;
/** the gill slit, short and oblique, in front of the pectoral base */
export const GILL = { s0: 0.278, y0: 0.022, s1: 0.288, y1: 0.002 } as const;

/** the first dorsal spine: base, length, rest lean back from upright (rad) and its curl toward the tip */
export const SPINE_D1 = { s: 0.245, len: 0.15, lean: 0.32, curl: 0.42, depth: 0.026, width: 0.014, barbs: 7 } as const;
/** soft dorsal and anal fins: base from s0 to s1 along the profile, ray count, ray length front → back, rake (rad back from the outward normal of the profile) */
export const DORSAL = { s0: 0.475, s1: 0.725, rays: 26, len: [0.074, 0.08, 0.072, 0.06, 0.047, 0.036] as const, rake: [0.45, 0.62, 0.78, 0.9, 1.0, 1.08] as const };
export const ANAL = { s0: 0.468, s1: 0.72, rays: 24, len: [0.068, 0.075, 0.069, 0.058, 0.045, 0.034] as const, rake: [0.5, 0.66, 0.8, 0.92, 1.02, 1.1] as const };
/** pectoral: base centre on the flank, oblique base length, ray length, ray count */
export const PEC = { s: 0.3, y: -0.004, base: 0.034, len: 0.064, rays: 11, tilt: 0.35 } as const;
/** caudal fin: rounded fan from the caudal base; half-spread closed / open (rad) */
export const CAUDAL = { s: 0.77, halfBase: 0.042, len: 0.23, rays: 12, closed: 0.2, open: 0.62 } as const;
/** the pelvic flap (the rhomboid's lower corner, over the pelvic bone's tip): swings down and forward when the fish is roused */
export const FLAP = { s: 0.425, hinge: { s: 0.39, y: -0.235 } } as const;
/** the lower jaw's articulation */
export const JAW = { s: 0.034, y: -0.006 } as const;

/** Spine joints (name, s at the joint): a stiff, deep body that bends only behind the anal fin when it bursts. */
export const SPINE = [['J_head', 0.2], ['J_sp1', 0.38], ['J_sp2', 0.55], ['J_ped', 0.67], ['J_tail', 0.77]] as const;
export const SPINE_S = SPINE.map(([, s]) => s);
/** bones along the bases of the soft dorsal and the anal fin (the undulating fins) */
export const FIN_BONES = 7;

export const BONES = [
  'J_root', 'J_head', 'J_sp1', 'J_sp2', 'J_ped', 'J_tail',
  'J_jaw', 'J_eye_L', 'J_eye_R', 'J_spine', 'J_flap',
  'J_pec_L', 'J_pec_L2', 'J_pec_R', 'J_pec_R2', 'J_cau_U', 'J_cau_L',
  'J_dor0', 'J_dor1', 'J_dor2', 'J_dor3', 'J_dor4', 'J_dor5', 'J_dor6',
  'J_ana0', 'J_ana1', 'J_ana2', 'J_ana3', 'J_ana4', 'J_ana5', 'J_ana6',
] as const;
export type BoneName = (typeof BONES)[number];
export const boneIndex = (n: BoneName): number => BONES.indexOf(n);

/** The section at s: the profile edges, the belt height and half width (TL units), and the edge sharpness. */
export interface Section {
  top: number;
  bot: number;
  belt: number;
  hw: number;
  /** exponents of x = hw · (1 − v^p)^(1/q) above and below the belt (q near 1: a knife edge) */
  pTop: number;
  qTop: number;
  pBot: number;
  qBot: number;
}

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function section(s: number): Section {
  const top = dorsalY(s), bot = -ventralY(s);
  const belt = Math.min(top - 0.004, Math.max(bot + 0.004, beltY(s)));
  // the snout is a rounder wedge; behind it the back and the belly sharpen into keels (the flap thinnest of all)
  const round = 1 - smooth(0.0, 0.07, s);
  const keel = smooth(0.35, 0.43, s) * (1 - smooth(0.44, 0.5, s));
  return {
    top, bot, belt, hw: fullWidth(s) / 2,
    pTop: 1.9, qTop: 1.35 + 0.65 * round,
    pBot: 1.7, qBot: 1.15 + 0.85 * round - 0.08 * keel,
  };
}

/** a point on the skin at s and around-angle phi (0 = the dorsal edge, π = the ventral edge, (0, π) the left flank: +x) */
export function sectionPoint(s: number, phi: number): [number, number] {
  const c = section(s);
  const cc = Math.cos(phi), sn = Math.sin(phi);
  const up = cc >= 0;
  const v = Math.abs(cc);
  const y = up ? c.belt + (c.top - c.belt) * v : c.belt - (c.belt - c.bot) * v;
  const p = up ? c.pTop : c.pBot, q = up ? c.qTop : c.qBot;
  let x = c.hw * Math.pow(Math.max(0, 1 - Math.pow(v, p)), 1 / q);
  // the eye socket's rim stands out of the flat cheek
  const de = Math.hypot((s - EYE.s) / 1.1, y - EYE.y);
  x += 0.007 * Math.exp(-Math.pow(de / EYE.rim, 2)) * Math.pow(Math.max(0, 1 - v), 0.5);
  // fleshy lips at the snout tip
  x += 0.0045 * Math.exp(-Math.pow((s - 0.012) / 0.012, 2)) * Math.exp(-Math.pow((y - gapeY(s)) / 0.012, 2));
  return [Math.sign(sn) * x, y];
}

/** half width of the body at (s, height y): where a point on the flank at that height sits */
export function halfWidthAt(s: number, y: number): number {
  const c = section(s);
  const up = y >= c.belt;
  const v = Math.min(1, up ? (y - c.belt) / Math.max(c.top - c.belt, 1e-6) : (c.belt - y) / Math.max(c.belt - c.bot, 1e-6));
  // invert y(phi) for this height: v is |cos phi| by construction, so the same expression applies
  const p = up ? c.pTop : c.pBot, q = up ? c.qTop : c.qBot;
  let x = c.hw * Math.pow(Math.max(0, 1 - Math.pow(v, p)), 1 / q);
  const de = Math.hypot((s - EYE.s) / 1.1, y - EYE.y);
  x += 0.007 * Math.exp(-Math.pow(de / EYE.rim, 2)) * Math.pow(Math.max(0, 1 - v), 0.5);
  return x;
}

/** greatest depth of the body (TL units), soft dorsal origin to the flap's tip, and its greatest width */
export function bodyDepth(): { depth: number; width: number } {
  let top = 0, bot = 0, w = 0;
  for (let s = 0; s <= S_CAUDAL_BASE; s += 0.002) { top = Math.max(top, dorsalY(s)); bot = Math.max(bot, ventralY(s)); w = Math.max(w, fullWidth(s)); }
  return { depth: top + bot, width: w };
}
