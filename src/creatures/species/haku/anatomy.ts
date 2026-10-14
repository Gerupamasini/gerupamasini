/**
 * The young flathead grey mullet (Mugil cephalus) in two forms that share one rig and one way of building: the ハク
 * (20–40 mm fry, HAKU) and the スバシリ (50–110 mm juvenile, SUBASHIRI). Each form's body plan is measured on a lateral
 * photograph of a live fish (a ハク in a clear case; a スバシリ in a tank) and checked against the reference sets.
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
 *
 * …and what changes as it grows into a スバシリ (5–10 cm): a deeper body (0.225 TL) behind a longer, more pointed head
 * whose front is the upper lip, the gape below it a ∧ seen from in front; a relatively smaller eye with a bigger pupil
 * and a gold ring; a longer pectoral with a blue-black spot at its base; taller, more raked fins and a bigger, deeper
 * forked tail; large regular scales in rows, a golden-olive back.
 */

/** total length the geometry is built at (metres); species data gives `modelLength_mm` = 30 */
export const MODEL_TL = 0.03;
/** the rig's origin (J_root, the fish's position) sits on the body axis at this s: the centre of mass */
export const S_PIVOT = 0.38;
/** caudal fin base (end of the scaled body) */
export const S_CAUDAL_BASE = 0.845;
/** the head (dense rings in the loft) */
export const S_HEAD = 0.26;

/** model z (forward +Z) of a point at s, in TL units */
export const zOf = (s: number): number => S_PIVOT - s;

export type Table = readonly (readonly [number, number])[];

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


const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the snout's front is rounded off over `cap` (an ellipse) */
function nose(s: number, cap: number): number {
  if (s >= cap) return 1;
  const u = 1 - s / cap;
  return Math.sqrt(Math.max(0, 1 - u * u));
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

type Pts = readonly (readonly [number, number])[];

/** A median fin: its base along s, ray lengths (TL) front to back, and the rays' rake from upright (rad) front and back. */
export interface MedianFin { s0: number; s1: number; len: readonly number[]; rake: readonly [number, number]; rays: number }

/** Everything a form is built from (TL units throughout). */
export interface FormSpec {
  id: 'haku' | 'subashiri';
  /** body depth (TL): how much water the fish needs, how far apart it keeps */
  depth: number;
  /** dorsal / ventral heights above and below the snout → caudal-base axis, full width, superellipse exponents */
  top: Table; bot: Table; width: Table; nTop: Table; nBot: Table;
  /** the snout's front: rounded over sCap in profile and sCapWide in dorsal view, onto a front as wide as the mouth */
  sCap: number; sCapWide: number; mouthHalfWidth: number;
  /** the eye: centre, radius of the visible disc, the cornea's dome, the pupil's share of the radius */
  eye: { s: number; y: number; r: number; bulge: number; pupil: number };
  /** the gape: from between the lips at the front (y0) back and down to the corner of the mouth (s, y1) */
  gape: { s: number; y0: number; y1: number };
  /** the lips' rolls where they meet (their radii) and the furrow along their outer edges */
  /**
   * the lips' rolls (the skin rounding into the gape) and the furrow along their outer edge; `rolls`: fleshy lips built
   * on top of that as tubes along the gape (radius at the middle of the front, TL), upper and lower
   */
  lips: { upper: number; lower: number; margin: number; rolls?: { upper: number; lower: number } };
  /** how far the lower lip juts past the upper (TL) */
  jut: number;
  /** seen from in front, how much higher the gape is in the middle than at its sides (a ∧) */
  chevron: number;
  /** the gill cover's edges: s at height h (ascending h) */
  preopEdge: Pts; operBone: Pts; operEdge: Pts;
  gill: {
    /** each plate's extent, how far its free edge stands off the skin, and how dark the shadow under that edge is */
    preop: { top: number; bottom: number; width: number; lift: number; shade: number };
    oper: { top: number; bottom: number; lift: number; membrane: number; shade: number };
    /** how far in under the opercle's free edge the chamber's lining stays pale before the red gills (TL) */
    lining: number;
    /** the opercle swings outward about this point (its articulation, high at the front) */
    hinge: { s: number; y: number };
  };
  /** pectoral fin base (at the axillary spot) */
  pec: { s: number; y: number };
  fins: {
    d1: MedianFin; d2: MedianFin; anal: MedianFin;
    pelvic: { s: number; len: number; spread: number; rake: number; rays: number };
    pectoral: { len: number; spread: number; rays: number };
    caudal: { s0: number; halfBase: number; fork: number; tip: number; span: number; rays: number };
  };
}

/** A form of the young mullet: its measurements and the body's shape built from them. */
export class MulletForm {
  readonly id: FormSpec['id'];
  readonly depth: number;
  readonly sCap: number;
  readonly mouthHalfWidth: number;
  readonly eye: FormSpec['eye'];
  readonly gape: FormSpec['gape'];
  readonly lips: FormSpec['lips'];
  readonly chevron: number;
  readonly gill: FormSpec['gill'];
  readonly pec: FormSpec['pec'];
  readonly fins: FormSpec['fins'];
  /** the first dorsal (its own bone folds it) and the jaw's hinge at the corner of the mouth */
  readonly d1: { s0: number; s1: number };
  readonly jaw: { s: number; y: number };
  readonly preopEdgePts: Pts;
  readonly operBonePts: Pts;
  readonly operEdgePts: Pts;
  readonly preopEdge: (y: number) => number;
  readonly operBone: (y: number) => number;
  readonly operEdge: (y: number) => number;
  private readonly TOP: (s: number) => number;
  private readonly BOT: (s: number) => number;
  private readonly WIDTH: (s: number) => number;
  private readonly N_TOP: (s: number) => number;
  private readonly N_BOT: (s: number) => number;
  private readonly sCapWide: number;
  private readonly jut: number;

  constructor(f: FormSpec) {
    this.id = f.id; this.depth = f.depth; this.sCap = f.sCap; this.sCapWide = f.sCapWide; this.mouthHalfWidth = f.mouthHalfWidth;
    this.eye = f.eye; this.gape = f.gape; this.lips = f.lips; this.jut = f.jut; this.chevron = f.chevron;
    this.gill = f.gill; this.pec = f.pec; this.fins = f.fins;
    this.d1 = { s0: f.fins.d1.s0, s1: f.fins.d1.s1 };
    this.jaw = { s: f.gape.s, y: f.gape.y1 };
    this.preopEdgePts = f.preopEdge; this.operBonePts = f.operBone; this.operEdgePts = f.operEdge;
    this.preopEdge = curve(f.preopEdge); this.operBone = curve(f.operBone); this.operEdge = curve(f.operEdge);
    this.TOP = curve(f.top); this.BOT = curve(f.bot); this.WIDTH = curve(f.width); this.N_TOP = curve(f.nTop); this.N_BOT = curve(f.nBot);
  }

  gapeY(s: number): number {
    const g = this.gape;
    return g.y0 + (g.y1 - g.y0) * Math.min(1, Math.max(0, s / g.s));
  }

  /**
   * Height of a section's widest point (TL units). On the snout it is the gape, so the two lips meet at the side of
   * every section there (the mouth splits the head's surface along one line of the loft); behind the corner of the
   * mouth it eases back to the body axis.
   */
  axisY(s: number): number {
    const G = this.gape;
    if (s <= G.s) return this.gapeY(s);
    const L = 0.06, t = (s - G.s) / L;
    if (t >= 1) return 0;
    // cubic Hermite: the gape's height and slope at the corner, level at zero by the front of the eye
    const slope = (G.y1 - G.y0) / G.s;
    return G.y1 * (2 * t * t * t - 3 * t * t + 1) + L * slope * (t * t * t - 2 * t * t + t);
  }

  section(s: number): Section {
    const sc = Math.min(Math.max(s, 0), S_CAUDAL_BASE);
    const k = nose(s, this.sCap), yc = this.axisY(sc);
    // at s = 0 the section is the front of the gape: a short level line, the lips closing onto it from above and below
    const hw = this.mouthHalfWidth + (this.WIDTH(sc) / 2 - this.mouthHalfWidth) * nose(s, this.sCapWide);
    return { hw, top: (this.TOP(sc) - yc) * k, bot: (this.BOT(sc) + yc) * k, yc, nTop: this.N_TOP(sc), nBot: this.N_BOT(sc) };
  }

  /** height of the dorsal / ventral midline at s (TL units) */
  dorsalY(s: number): number { const c = this.section(s); return c.yc + c.top; }
  ventralY(s: number): number { const c = this.section(s); return c.yc - c.bot; }

  /** half width of the body at (s, height y) in TL units: where a point on the flank at that height sits */
  halfWidthAt(s: number, y: number): number {
    const c = this.section(s);
    const h = y - c.yc;
    const span = h >= 0 ? c.top : c.bot, n = h >= 0 ? c.nTop : c.nBot;
    const v = Math.min(1, Math.abs(h) / Math.max(span, 1e-6));
    return c.hw * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
  }

  /** how far (TL) a point of the snout at (s, height y) is pushed forward: the lower lip juts past the upper */
  lipShift(s: number, y: number): number {
    if (s >= 0.03 || this.jut <= 0) return 0;
    const k = (1 - s / 0.03) ** 2;
    const dy = this.gapeY(s) - y;   // depth below the gape
    // the lower lip's front is a rounded roll: furthest forward a third of the way down, back in to the chin
    return this.jut * k * smooth(-0.001, 0.011, dy) * (1 - smooth(0.015, 0.032, dy));
  }

  /**
   * How far (TL) a point of the snout's front at lateral x is raised: seen from in front the gape is a ∧, highest at
   * the middle (the lips follow it, so the mouth stays shut along it).
   */
  frontLift(s: number, x: number, y: number): number {
    if (this.chevron <= 0) return 0;
    const w = 1.7 * this.mouthHalfWidth;
    // only about the mouth: the snout's profile above and the chin below keep their measured lines
    const near = 1 - smooth(0.01, 0.026, Math.abs(y - this.gapeY(s)));
    // straight sides, rounded over the middle (a point there would crease the lips)
    const a = Math.abs(x) / w, r = 0.22;
    const tent = a < r ? 1 - r / 2 - (a * a) / (2 * r) : 1 - a;
    return this.chevron * Math.max(0, tent) / (1 - r / 2) * (1 - smooth(0.004, 0.024, s)) * near;
  }

  /**
   * How far (TL) the skin at (s, height y) sinks in toward the gape: two rolled lips meeting in a groove along the
   * whole gape, the groove fading into a dimple at the corner of the mouth, a shallow furrow along each lip's outer edge.
   */
  lipInset(s: number, y: number): number {
    const G = this.gape, Lp = this.lips;
    const end = G.s + 0.012;
    if (s >= end) return 0;
    const g = s <= G.s ? this.gapeY(s) : G.y1;
    const dy = y - g, a = Math.abs(dy);
    const r = dy >= 0 ? Lp.upper : Lp.lower;
    let inset = a < r ? r - Math.sqrt(r * r - (r - a) * (r - a)) : 0;
    inset += Lp.margin * Math.exp(-(((a - 2 * r) / (0.5 * r)) ** 2));
    // deep at the front, a fold at the corner, gone a little behind it
    const depth = s <= G.s ? 1 - 0.6 * smooth(0.4 * G.s, G.s, s) : 0.4 * (1 - smooth(G.s, end, s));
    return inset * depth;
  }
}

/*
 * ハク: the outline, traced from a lateral photograph of a live ハク in a clear case (TL ≈ 825 px): heights of the
 * dorsal and ventral profile above and below the line from the snout tip to the middle of the caudal base, as fractions
 * of TL. The head is the deepest part of the fish after the shoulder; the snout is blunt and nearly upright, its front
 * the two thick lips with the lower one jutting a little past the upper; the belly is fullest over the pelvic fins; the
 * long peduncle is under half the greatest depth. The eye a big silver disc, 7.3 % of TL across, its pupil a third of
 * that. The gill cover: two plates over the cheek, each with a free edge standing off the skin behind it: the
 * preopercle (its posterior margin a little behind the eye, turning forward below) and the opercle (its bony margin,
 * then a thin membranous flap whose free edge is the gill opening, from above the pectoral fin's base round and
 * forward to the throat). Fins: the first dorsal's four spines fan out from a short base, the second dorsal is high in
 * front and low behind, the anal fin's long front rays slope back over its short hind ones.
 */
export const HAKU = new MulletForm({
  id: 'haku',
  depth: 0.18,
  top: [
    [0, 0.021], [0.004, 0.0265], [0.008, 0.0305], [0.013, 0.033], [0.018, 0.035], [0.023, 0.038], [0.028, 0.0435],
    [0.034, 0.05], [0.04, 0.0555], [0.05, 0.061], [0.06, 0.0665], [0.07, 0.0715], [0.08, 0.0765], [0.09, 0.0815],
    [0.1, 0.0855], [0.12, 0.091], [0.14, 0.0955], [0.164, 0.0985], [0.189, 0.101], [0.214, 0.103], [0.25, 0.1045],
    [0.3, 0.106], [0.35, 0.107], [0.41, 0.107], [0.45, 0.103], [0.5, 0.096], [0.55, 0.089], [0.6, 0.082], [0.65, 0.073],
    [0.7, 0.062], [0.745, 0.05], [0.78, 0.0425], [0.82, 0.041], [0.845, 0.045],
  ],
  bot: [
    [0, 0.034], [0.005, 0.036], [0.01, 0.0365], [0.015, 0.039], [0.02, 0.0415], [0.03, 0.0455], [0.04, 0.0485],
    [0.048, 0.0505], [0.056, 0.053], [0.067, 0.06], [0.078, 0.066], [0.09, 0.071], [0.114, 0.077], [0.137, 0.082],
    [0.173, 0.089], [0.209, 0.094], [0.246, 0.096], [0.282, 0.099], [0.319, 0.1], [0.345, 0.103], [0.38, 0.1], [0.43, 0.091],
    [0.48, 0.088], [0.53, 0.0865], [0.566, 0.085], [0.6, 0.081], [0.65, 0.072], [0.7, 0.059], [0.743, 0.048], [0.78, 0.0415],
    [0.82, 0.041], [0.845, 0.043],
  ],
  // a broad head, the snout narrower than the head, a slender peduncle
  width: [
    [0, 0.042], [0.02, 0.062], [0.04, 0.078], [0.06, 0.09], [0.09, 0.104], [0.12, 0.114], [0.16, 0.121], [0.2, 0.125],
    [0.27, 0.124], [0.35, 0.118], [0.43, 0.108], [0.52, 0.092], [0.6, 0.077], [0.68, 0.061], [0.75, 0.05], [0.8, 0.044],
    [0.845, 0.04],
  ],
  // a flat broad head top, a rounded belly
  nTop: [[0, 2.7], [0.03, 2.5], [0.07, 2.35], [0.15, 2.35], [0.25, 2.2], [0.4, 2.05], [0.845, 2.0]],
  nBot: [[0, 2.5], [0.03, 2.3], [0.1, 2.15], [0.3, 2.2], [0.6, 2.05], [0.845, 2.0]],
  sCap: 0.005, sCapWide: 0.018, mouthHalfWidth: 0.008,
  eye: { s: 0.106, y: 0.009, r: 0.0365, bulge: 0.0035, pupil: 0.335 },
  gape: { s: 0.035, y0: -0.011, y1: -0.031 },
  lips: { upper: 0.0068, lower: 0.0065, margin: 0.0012 },
  jut: 0.0055,
  chevron: 0,
  preopEdge: [[-0.07, 0.15], [-0.055, 0.166], [-0.04, 0.176], [-0.02, 0.18], [0.0, 0.176], [0.02, 0.169], [0.04, 0.163], [0.052, 0.16]],
  operBone: [[-0.088, 0.18], [-0.075, 0.204], [-0.06, 0.224], [-0.04, 0.241], [-0.02, 0.249], [0.0, 0.252], [0.02, 0.252], [0.05, 0.251]],
  operEdge: [[-0.088, 0.186], [-0.075, 0.213], [-0.06, 0.24], [-0.045, 0.264], [-0.03, 0.276], [-0.015, 0.279], [0.0, 0.274], [0.015, 0.265], [0.03, 0.258], [0.05, 0.255]],
  gill: {
    preop: { top: 0.052, bottom: -0.07, width: 0.03, lift: 0.0014, shade: 1 },
    oper: { top: 0.05, bottom: -0.088, lift: 0.002, membrane: 0.0007, shade: 1 },
    lining: 0.0025,
    hinge: { s: 0.2, y: 0.045 },
  },
  pec: { s: 0.262, y: 0.028 },
  fins: {
    d1: { s0: 0.425, s1: 0.447, len: [0.1, 0.097, 0.093, 0.05], rake: [0.86, 1.4], rays: 4 },
    d2: { s0: 0.645, s1: 0.7, len: [0.066, 0.068, 0.062, 0.055, 0.05, 0.047], rake: [0.8, 1.2], rays: 9 },
    anal: { s0: 0.58, s1: 0.68, len: [0.096, 0.09, 0.075, 0.055, 0.042, 0.034], rake: [0.88, 1.12], rays: 10 },
    pelvic: { s: 0.333, len: 0.11, spread: 0.024, rake: 1.05, rays: 6 },
    pectoral: { len: 0.094, spread: 0.03, rays: 14 },
    caudal: { s0: 0.832, halfBase: 0.044, fork: 0.962, tip: 1.0, span: 0.104, rays: 18 },
  },
});

/*
 * スバシリ: traced from a lateral photograph of a live 5–8 cm fish in a tank (TL ≈ 581 px, the snout tip at the upper
 * lip, the axis to the middle of the caudal base) and checked against a 5.0 cm fish in an aquarium, specimens on a
 * scale and the front view of the lips. Deeper than the fry and deepest over the pelvics (0.225 TL); the head longer,
 * its upper profile running straight down to a pointed snout whose tip is the upper lip; the chin well below and a
 * little behind it, the gape a ∧ from in front (the lower jaw's knob fits the upper lip's notch). The eye a little
 * smaller for the body, its pupil nearly half its width. The pectoral long (it reaches the pelvics' tips), the fins
 * taller and more raked, the tail bigger and more deeply forked.
 */
export const SUBASHIRI = new MulletForm({
  id: 'subashiri',
  depth: 0.215,
  top: [
    [0, 0.004], [0.01, 0.013], [0.02, 0.0207], [0.03, 0.0267], [0.04, 0.0318], [0.05, 0.0361], [0.06, 0.042], [0.07, 0.0458],
    [0.08, 0.0512], [0.09, 0.0545], [0.1, 0.0594], [0.12, 0.0654], [0.14, 0.0702], [0.16, 0.0766], [0.18, 0.0835], [0.2, 0.0885],
    [0.22, 0.0921], [0.24, 0.0962], [0.26, 0.099], [0.28, 0.1022], [0.3, 0.1046], [0.33, 0.1068], [0.36, 0.1095], [0.4, 0.1112],
    [0.44, 0.1115], [0.48, 0.109], [0.52, 0.1055], [0.55, 0.1012], [0.58, 0.0966], [0.62, 0.0925], [0.66, 0.0872], [0.7, 0.077],
    [0.73, 0.068], [0.76, 0.0555], [0.78, 0.048], [0.8, 0.0448], [0.82, 0.0442], [0.845, 0.048],
  ],
  bot: [
    [0, 0.012], [0.005, 0.03], [0.01, 0.0396], [0.02, 0.0499], [0.03, 0.0577], [0.04, 0.0628], [0.05, 0.0671], [0.06, 0.0714],
    [0.07, 0.0749], [0.08, 0.0778], [0.1, 0.0846], [0.12, 0.0898], [0.14, 0.0948], [0.16, 0.0985], [0.18, 0.1005], [0.2, 0.1024],
    [0.22, 0.105], [0.24, 0.1074], [0.26, 0.1092], [0.28, 0.1105], [0.3, 0.1112], [0.32, 0.1132], [0.34, 0.1142], [0.37, 0.1135],
    [0.4, 0.111], [0.44, 0.1062], [0.48, 0.1028], [0.52, 0.1022], [0.56, 0.1018], [0.58, 0.0995], [0.6, 0.0972], [0.63, 0.093],
    [0.66, 0.086], [0.7, 0.075], [0.73, 0.0645], [0.75, 0.0555], [0.77, 0.0505], [0.8, 0.0465], [0.82, 0.047], [0.845, 0.054],
  ],
  // the head broad and flat on top, the snout's front a broad U
  width: [
    [0, 0.05], [0.03, 0.07], [0.06, 0.088], [0.1, 0.106], [0.15, 0.121], [0.2, 0.131], [0.27, 0.135], [0.35, 0.131], [0.43, 0.121],
    [0.52, 0.104], [0.6, 0.087], [0.68, 0.07], [0.75, 0.056], [0.8, 0.048], [0.845, 0.044],
  ],
  nTop: [[0, 2.4], [0.04, 2.35], [0.1, 2.4], [0.2, 2.3], [0.35, 2.12], [0.6, 2.02], [0.845, 2.0]],
  nBot: [[0, 2.2], [0.06, 2.15], [0.2, 2.2], [0.4, 2.15], [0.6, 2.05], [0.845, 2.0]],
  sCap: 0.006, sCapWide: 0.022, mouthHalfWidth: 0.012,
  eye: { s: 0.093, y: -0.019, r: 0.036, bulge: 0.0035, pupil: 0.5 },
  // the gape: just under the upper lip at the front (the ∧ raises its middle to −0.007), down to its corner
  gape: { s: 0.042, y0: -0.0125, y1: -0.027 },
  lips: { upper: 0.0048, lower: 0.0046, margin: 0.0008, rolls: { upper: 0.0056, lower: 0.0047 } },
  jut: 0.0015,
  chevron: 0.0055,
  preopEdge: [[-0.085, 0.13], [-0.068, 0.146], [-0.05, 0.155], [-0.03, 0.159], [-0.01, 0.157], [0.01, 0.152], [0.03, 0.147], [0.045, 0.145]],
  operBone: [[-0.1, 0.162], [-0.085, 0.184], [-0.068, 0.202], [-0.048, 0.216], [-0.028, 0.222], [-0.008, 0.224], [0.012, 0.224], [0.04, 0.223]],
  operEdge: [[-0.1, 0.168], [-0.085, 0.192], [-0.068, 0.216], [-0.052, 0.235], [-0.036, 0.245], [-0.02, 0.248], [-0.004, 0.244], [0.012, 0.237], [0.026, 0.231], [0.045, 0.228]],
  gill: {
    preop: { top: 0.045, bottom: -0.085, width: 0.028, lift: 0.00025, shade: 0.2 },
    oper: { top: 0.043, bottom: -0.1, lift: 0.0004, membrane: 0.00025, shade: 0.12 },
    lining: 0.009,
    hinge: { s: 0.18, y: 0.035 },
  },
  pec: { s: 0.25, y: 0.006 },
  fins: {
    d1: { s0: 0.45, s1: 0.49, len: [0.102, 0.096, 0.083, 0.052], rake: [0.74, 1.25], rays: 4 },
    d2: { s0: 0.65, s1: 0.725, len: [0.115, 0.108, 0.093, 0.08, 0.072, 0.068], rake: [0.8, 1.4], rays: 9 },
    anal: { s0: 0.6, s1: 0.7, len: [0.12, 0.11, 0.09, 0.07, 0.052, 0.04], rake: [1.0, 1.3], rays: 10 },
    pelvic: { s: 0.335, len: 0.13, spread: 0.026, rake: 0.85, rays: 6 },
    pectoral: { len: 0.14, spread: 0.034, rays: 16 },
    caudal: { s0: 0.83, halfBase: 0.05, fork: 0.93, tip: 1.0, span: 0.17, rays: 18 },
  },
});

/** From this total length (mm) a young mullet is a スバシリ, drawn and moving as one. */
export const SUBASHIRI_FROM_MM = 45;

/** The form an individual of this length is drawn with. */
export function formFor(length_mm: number): MulletForm {
  return length_mm >= SUBASHIRI_FROM_MM ? SUBASHIRI : HAKU;
}

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

/** fin ids (the fin shader's third attribute component) */
export const FIN_ID = { caudal: 0, d1: 1, d2: 2, anal: 3, pelvic: 4, pectoral: 5 } as const;
