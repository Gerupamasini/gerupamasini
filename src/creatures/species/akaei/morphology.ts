/**
 * アカエイ Hemitrygon akajei: body plan, traced from the 70 reference photos (docs/models/akaei/README.md lists them)
 * and the species literature. Everything is in units of the disc width (DW = 1); the model is scaled by the individual's
 * disc width. Frame: +Z toward the snout, +Y dorsal, +X the animal's left; origin on the margin plane under the middle
 * of the trunk (the widest point of the disc is a little ahead of it).
 *
 * Evidence tags: [PHOTO nnn] measured on that photo, [LIT] species literature (Last et al. 2016, FishBase), [EST] estimate.
 */

/** a smooth curve through (x, y) control points: monotone cubic (no overshoot between stations) */
export class Curve {
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly ms: number[];
  constructor(points: [number, number][]) {
    const p = [...points].sort((a, b) => a[0] - b[0]);
    this.xs = p.map((q) => q[0]);
    this.ys = p.map((q) => q[1]);
    const n = p.length, d: number[] = [], m: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((this.ys[i + 1] - this.ys[i]) / (this.xs[i + 1] - this.xs[i]));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    this.ms = m;
  }
  at(x: number): number {
    const xs = this.xs, n = xs.length;
    if (x <= xs[0]) return this.ys[0];
    if (x >= xs[n - 1]) return this.ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.ys[i] + (t3 - 2 * t2 + t) * h * this.ms[i] + (-2 * t3 + 3 * t2) * this.ys[i + 1] + (t3 - t2) * h * this.ms[i + 1];
  }
}

const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const MORPH = {
  // ------------------------------------------------------------------ disc
  /** snout tip; the snout is broadly triangular, its very tip a little produced [LIT, PHOTO 006, 014, 045, 052] */
  zSnout: 0.47,
  /** the free rear corner of the pectoral fin over the pelvic fins: DL = 0.87 DW, DW/DL = 1.15 [LIT 1.06–1.16; PHOTO 052 1.15] */
  zRear: -0.40,
  /** the end of the trunk where the tail tube takes over (behind the pelvic fins) */
  zEnd: -0.495,
  /**
   * The outline, measured: [distance behind the snout, half-width], both in DW, traced on the flat-lying photos 045 and
   * 052 in the body frame (axis perpendicular to the nostrils) and averaged, then scaled to DL = 0.87 DW. Snout angle
   * 2·atan(0.195 / 0.12) ≈ 117° [LIT 110–124°]; anterior margins almost straight, slightly convex toward the broadly
   * rounded outer corner at 0.42 (0.48 DL); posterior margins gently convex down to the bluntly rounded free rear tips
   * (half-width 0.17, at 0.87 = DL); behind them a notch and the squared pelvic fins (half-width 0.15) flanking the tail
   * base, which leaves the disc at 0.965 [PHOTO 045, 047, 052].
   */
  outline: [
    [0, 0], [0.004, 0.012], [0.015, 0.03], [0.04, 0.066], [0.08, 0.13], [0.12, 0.195], [0.2, 0.322], [0.28, 0.42], [0.35, 0.476],
    [0.42, 0.5], [0.47, 0.496], [0.53, 0.46], [0.63, 0.4], [0.72, 0.325], [0.81, 0.245], [0.85, 0.2], [0.87, 0.168],
    [0.882, 0.134], [0.9, 0.148], [0.93, 0.152], [0.948, 0.132], [0.957, 0.07], [0.965, 0.034],
  ] as [number, number][],

  // ------------------------------------------------------------------ thickness (DW units)
  /** half-width of the trunk (the raised, rigid body over the skull, gills and gut) [PHOTO 005, 006, 056] */
  trunkHalfWidth: [[0.47, 0.0], [0.43, 0.05], [0.36, 0.105], [0.27, 0.14], [0.2, 0.152], [0.08, 0.158], [-0.055, 0.165], [-0.198, 0.15], [-0.33, 0.122], [-0.407, 0.1], [-0.462, 0.07], [-0.49, 0.034]] as [number, number][],
  /** dorsal height of the trunk above the margin plane: "disc relatively thick" [LIT], domed behind the spiracles [PHOTO 005, 056, 069] */
  trunkHeight: [[0.47, 0.003], [0.42, 0.01], [0.34, 0.024], [0.25, 0.039], [0.15, 0.053], [0.02, 0.065], [-0.11, 0.067], [-0.242, 0.06], [-0.352, 0.048], [-0.44, 0.036], [-0.49, 0.024]] as [number, number][],
  /** ventral depth of the trunk below the margin plane: the belly is flat, a little full behind the gills [PHOTO 045, 047, 055] */
  trunkDepth: [[0.47, 0.003], [0.4, 0.008], [0.3, 0.015], [0.2, 0.019], [0.1, 0.023], [-0.055, 0.029], [-0.22, 0.031], [-0.352, 0.026], [-0.44, 0.02], [-0.49, 0.016]] as [number, number][],
  /** thickness of the pectoral fin where it leaves the trunk, thinning to a rounded edge [PHOTO 004, 008, 069] */
  finHeight: [[0.47, 0.002], [0.35, 0.012], [0.2, 0.018], [0.05, 0.02], [-0.165, 0.018], [-0.33, 0.012], [-0.407, 0.008], [-0.49, 0.006]] as [number, number][],
  rimHalf: 0.0022,

  // ------------------------------------------------------------------ head
  /**
   * The eye–spiracle complex, as in the close-ups [PHOTO 005, 006, 011, 027, 056]: the eye looks out sideways. It is a
   * dark, glossy, slightly almond-shaped dome set in the outer face of a raised orbit: a fleshy brow covers it from the
   * inner side and over the top, and the cornea bulges out of the orbit's outer wall, its lower lid running down to the
   * disc beside it — so from the side it looks straight at you [PHOTO 005, 027] and from above it shows as a dark
   * crescent along the outer edge of the orbit's hump [PHOTO 006]. The spiracle sits against its back and outer side,
   * its rim running on from the orbit's so the two share one low mound. Eyes 0.21 DW behind the snout; preorbital snout
   * ≈ 1.75 × the interorbital width between the orbits' inner edges (0.12) [LIT 1.36–2.14].
   *   r        radius of the cornea's dome; long  its elongation along the body (almond); flat  its depth along the gaze
   *   gaze     the dome's axis (left eye): out to the side, tilted a little up and forward
   *   lift     how far the eye's centre stands above the disc beside it (× r): the lower lid meets the disc
   *   browH / browX / browIn / browOut / browL  the orbit's hump (× r): its height above the disc, its crest's offset
   *            (inward is negative), its fall inward and outward, and its length along the body (× the eye's length)
   *   lidOpen / lidUp / lidT  the lids: skin covers the eyeball down to lidOpen° from the gaze, lidUp° more (−)
   *            on the top side — over the crown it rolls from the brow well down onto the dome [PHOTO 005, 027] —
   *            and ends in a thin rim lidT (× r) proud of the cornea
   *   socketR / socketH  the broad mound the complex stands on
   */
  eye: { x: 0.078, z: 0.262, r: 0.0172, long: 1.2, flat: 0.8, lift: 0.68, gaze: [0.9, 0.42, 0.15] as [number, number, number],
    browH: 1.66, browX: 0.05, browIn: 1.8, browOut: 0.62, browL: 1.5, lidOpen: 47, lidUp: -6, lidT: 0.08, socketR: 0.036, socketH: 0.009 },
  /**
   * spiracles 1.5–2 × the eye, wrapped round its back and outer side (the centre 0.022 outside and 0.026 behind the
   * eye's), a teardrop whose long axis runs back and inward from beside the eye; a thick rim; the valve, a pale flap
   * hinged on the outer wall, closes all but a dark crescent slit along the side next to the eye [PHOTO 006, 011, 027]
   */
  spiracle: { x: 0.104, z: 0.231, rx: 0.022, rz: 0.035, yaw: 0.55, depth: 0.009, rimH: 0.0035 },
  /** mouth a transverse, gently arched slit under the eyes; nostrils and the nasal curtain in front [PHOTO 047, 049, 050, 055] */
  mouth: { z: 0.258, halfW: 0.045, arch: 0.009 },
  /** nostrils at the mouth's corners, 0.12 DW apart, 0.19 DW behind the snout [PHOTO 049, 052] */
  nostril: { x: 0.056, z: 0.278, len: 0.024 },
  /** five pairs of gill slits, 0.30 → 0.44 DW behind the snout, 0.115 → 0.075 DW off the midline: arcs converging backward [PHOTO 045, 047–052, 055] */
  gills: [
    { x: 0.115, z: 0.17, len: 0.032, ang: 0.42 },
    { x: 0.108, z: 0.135, len: 0.031, ang: 0.36 },
    { x: 0.099, z: 0.1, len: 0.029, ang: 0.3 },
    { x: 0.088, z: 0.065, len: 0.026, ang: 0.24 },
    { x: 0.076, z: 0.03, len: 0.022, ang: 0.16 },
  ],
  cloaca: { z: -0.43, halfW: 0.012 },

  // ------------------------------------------------------------------ tail
  /** tail length from the pelvic fins, intact; tips are often lost [LIT < 1–1.6 DW, PHOTO 012, 014, 029, 061] */
  tailLength: 1.45,
  /** where the tail tube starts (inside the trunk, so the join is hidden) */
  tailStart: -0.455,
  /**
   * a stout, firm tail: broad and depressed at the base (0.062 DW across [PHOTO 045]), tapering steadily to the sting,
   * still a rod well beyond it, only the last fifth a whip [PHOTO 007, 012, 014, 035, 045, 061]
   */
  tailHalfWidth: [[-0.03, 0.036], [0.0, 0.033], [0.1, 0.027], [0.2, 0.0215], [0.3, 0.0175], [0.4, 0.0145], [0.55, 0.0115], [0.7, 0.0088], [0.82, 0.0062], [0.92, 0.0038], [1.0, 0.0016]] as [number, number][],
  tailHalfHeight: [[-0.03, 0.023], [0.0, 0.021], [0.1, 0.0185], [0.2, 0.0158], [0.3, 0.0137], [0.4, 0.0118], [0.55, 0.0096], [0.7, 0.0076], [0.82, 0.0056], [0.92, 0.0035], [1.0, 0.0015]] as [number, number][],
  /** a skin fold under the tail behind the sting, ~0.55 DL long [LIT 0.46–0.77 DL], a low keel on top [PHOTO 007, 014] */
  ventralFold: { s0: 0.34, s1: 0.68, h: 0.012 },
  dorsalKeel: { s0: 0.37, s1: 0.7, h: 0.0045 },
  /** the serrated sting on top of the tail at about 30 % of its length, ~5 tail widths long [LIT, PHOTO 007, 035] */
  sting: { s: 0.262, len: 0.165, halfW: 0.0085, halfT: 0.0021, lift: 0.12, teeth: 30 },
  /** small spear-shaped thorns on the midline in front of the sting (adults) [LIT] */
  thorns: [0.165, 0.2, 0.232],
};

export const DISC = {
  /** disc length (snout to the free rear corner of the pectorals) in DW */
  length: MORPH.zSnout - MORPH.zRear,
  span: MORPH.zSnout - MORPH.zEnd,
};

const trunkW = new Curve(MORPH.trunkHalfWidth);
const trunkH = new Curve(MORPH.trunkHeight);
const trunkD = new Curve(MORPH.trunkDepth);
const finH = new Curve(MORPH.finHeight);
const outline = new Curve(MORPH.outline);
const tailW = new Curve(MORPH.tailHalfWidth);
const tailH = new Curve(MORPH.tailHalfHeight);

/** half-width of the outline at z (the disc, then the pelvic fins) */
export function halfWidth(z: number): number {
  const along = MORPH.zSnout - z;
  return along <= 0 ? 0 : outline.at(along);
}

const gauss = (dx: number, dz: number, rx: number, rz: number): number => Math.exp(-(dx * dx) / (rx * rx) - (dz * dz) / (rz * rz));

/** the soft, rigid trunk: 1 on the midline, 0 where the pectoral fin begins (with zero slope) */
export function trunkBump(x: number, z: number, scale = 1): number {
  const b = trunkW.at(z) * scale;
  if (b <= 1e-5) return 0;
  const s = Math.abs(x) / b;
  return s >= 1 ? 0 : (1 - s * s) * (1 - s * s);
}

/** half-width of the trunk at z */
export function trunkHalfWidth(z: number): number { return trunkW.at(z); }

/**
 * The orbit round the eye (eye-local ex out to the side, ez forward): a rounded hump centred inside the eye, whose
 * brow covers the dome's inner side and its crown's inner half and whose outer flank falls away steeply under the
 * bulging cornea, so the cornea comes out through the flank, an almond facing outward.
 */
function orbit(ex: number, ez: number): number {
  const E = MORPH.eye, r = E.r;
  const dx = ex - E.browX * r;
  const wx = (dx > 0 ? E.browOut : E.browIn) * r;
  return E.browH * r * Math.exp(-((dx / wx) ** 2) - (ez / (E.browL * E.long * r)) ** 2);
}

type V3 = [number, number, number];
let eyeAxes: { x: V3; g: V3; z: V3 } | null = null;
/** the left eye's frame: its gaze g and the two axes across it, turned the shortest way from up (as the eye's mesh is) */
export function eyeFrame(): { x: V3; g: V3; z: V3 } {
  if (eyeAxes) return eyeAxes;
  const [a, b, c] = MORPH.eye.gaze, l = Math.hypot(a, b, c);
  const g: V3 = [a / l, b / l, c / l];
  // Rodrigues about k = up × g, with |k| = sin, g.y = cos
  const k: V3 = [g[2], 0, -g[0]], cs = g[1], s2 = k[0] * k[0] + k[2] * k[2];
  const rot = (v: V3): V3 => {
    const kv = k[0] * v[0] + k[2] * v[2], f = s2 > 1e-12 ? (1 - cs) / s2 : 0;
    const cr: V3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    return [v[0] * cs + cr[0] + k[0] * kv * f, v[1] * cs + cr[1] + k[1] * kv * f, v[2] * cs + cr[2] + k[2] * kv * f];
  };
  eyeAxes = { x: rot([1, 0, 0]), g, z: rot([0, 0, 1]) };
  return eyeAxes;
}

/** dorsal surface height above the margin plane at (x, z) inside the outline (withOrbit false: the disc under the eye) */
export function dorsalHeight(x: number, z: number, withOrbit = true): number {
  const M = MORPH;
  const w = Math.max(1e-5, halfWidth(z));
  const u = Math.min(1, Math.abs(x) / w);
  const F = finH.at(z), T = trunkH.at(z);
  const one = Math.max(0, 1 - u * u);
  let h = M.rimHalf * Math.sqrt(one) + F * Math.pow(one, 1.3) + Math.max(0, T - F) * trunkBump(x, z);
  const ax = Math.abs(x);
  // the eye–spiracle complex: a low mound, the orbit and the skin over the eyeball, the spiracle's hollow with its
  // thick rim, and a bridge where the two rims meet [PHOTO 005, 006, 011, 027]
  const E = M.eye, S = M.spiracle;
  const ex = ax - E.x, ez = z - E.z;
  h += E.socketH * gauss(ex - 0.008, ez + 0.01, E.socketR, E.socketR * 1.15);
  if (withOrbit) {
    h += orbit(ex, ez);
  }
  const sx = ax - S.x, sz = z - S.z, cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
  const su = sx * cy - sz * sy, sv = sx * sy + sz * cy;
  const sd = Math.hypot(su / S.rx, sv / S.rz);
  h += S.rimH * Math.exp(-((sd - 1.1) ** 2) / 0.2) - S.depth * Math.exp(-sd * sd * 1.6);
  const bx = (S.x + E.x) / 2 + 0.004, bz = (S.z + E.z) / 2;
  h += 0.004 * gauss(ax - bx, z - bz, 0.012, 0.012);
  h += 0.0012 * Math.exp(-(x * x) / (0.03 * 0.03)) * smoothstep(0.15, 0.0, z) * smoothstep(-0.48, -0.3, z);
  return h;
}

/** the centre of the eye's dome (left eye for sideX 1): it stands `lift` radii above the disc beside it */
let eyeY: number | null = null;
export function eyeCentre(sideX: number): [number, number, number] {
  const E = MORPH.eye;
  eyeY ??= dorsalHeight(E.x, E.z, false) + E.lift * E.r;
  return [E.x * sideX, eyeY, E.z];
}

/** ventral depth below the margin plane (positive down) at (x, z) */
export function ventralDepth(x: number, z: number): number {
  const M = MORPH;
  const w = Math.max(1e-5, halfWidth(z));
  const u = Math.min(1, Math.abs(x) / w);
  const F = finH.at(z) * 0.55, V = trunkD.at(z);
  const one = Math.max(0, 1 - u * u);
  return M.rimHalf * Math.sqrt(one) + F * Math.pow(one, 1.3) + Math.max(0, V - F) * trunkBump(x, z, 0.92);
}

/** the tail's cross-section half-axes at s (0 base … 1 tip; s < 0 runs inside the trunk) */
export function tailSection(s: number): { a: number; c: number } {
  return { a: tailW.at(s), c: tailH.at(s) };
}

/** the depth of the tail's ventral fold and dorsal keel at s */
export function tailFins(s: number): { fold: number; keel: number } {
  const F = MORPH.ventralFold, K = MORPH.dorsalKeel;
  const fold = F.h * smoothstep(F.s0, F.s0 + 0.06, s) * (1 - smoothstep(F.s1 - 0.18, F.s1, s));
  const keel = K.h * smoothstep(K.s0, K.s0 + 0.05, s) * (1 - smoothstep(K.s1 - 0.15, K.s1, s));
  return { fold, keel };
}

/** z of the tail at arc length s (bind pose: straight back from the trunk) */
export function tailZ(s: number): number { return MORPH.zEnd - s * MORPH.tailLength; }
