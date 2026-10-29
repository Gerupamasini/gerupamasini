/**
 * The shared description of a coastal fish (共通 FishRig / SwimmingSystem / PBR / LOD / Behavior の種ごとの差分).
 *
 * Every length is a share of the total length (TL, snout tip → caudal fin tips) and `s` runs along the body from the
 * snout (0) to the caudal tips (1). The model is built at `modelTL` metres and scaled per individual. Model frame: +Z
 * forward (snout), +Y up, +X the fish's left. A flatfish is built the same way in its own frame and laid on its blind
 * side by its body frame (FishRig: the wave then runs up and down, the marginal fins ripple).
 *
 * A species is its silhouette and head first: the dorsal / ventral profiles and the half-width as tables along s,
 * superellipse sections (n < 2: keeled, n > 2: flat-sided or flat-topped), the snout's rounding, the gape line and
 * the corner of the mouth, the eye, the gill cover's free edge, then the fins.
 */

import { curve as hakuCurve, type Table } from '../species/haku/anatomy';

export type { Table };
/** Smooth interpolation through a table (shared with the ハク's anatomy). */
export const curve = hakuCurve;

export type FinId = 'd1' | 'd2' | 'a' | 'c' | 'p' | 'v';
/** fin atlas bands (rows of the fin texture), one per fin kind */
export const FIN_BANDS: Record<FinId, number> = { d1: 0, d2: 1, a: 2, c: 3, p: 4, v: 5 };
export const FIN_BAND_COUNT = 6;

/** A median fin (dorsal or anal): its base along s, ray length (TL) over the base u ∈ [0, 1], and the rays' rake. */
export interface MedianFinSpec {
  id: 'd1' | 'd2' | 'a';
  s0: number;
  s1: number;
  len: Table;
  /** rake of the rays back from upright (rad) at the front and back of the base */
  rake: readonly [number, number];
  rays: number;
  /** the first `spines` rays are spines: the membrane is notched between their tips */
  spines?: number;
  /** a flatfish's marginal fin: ripples */
  ripple?: number;
}

/**
 * The caudal fin: a fan from the peduncle. Ray length over a ∈ [−1 (ventral), 1 (dorsal)]:
 *   L(a) = len · (centre + (tip − centre) · |a|^p)
 * forked: centre < tip; truncate: equal; rounded: centre > tip. `spread` is the fan's half angle (rad).
 */
export interface CaudalSpec { len: number; centre: number; tip: number; p: number; spread: number; rays: number; base: number }

/** A paired fin: base point (TL), ray length over the fan u ∈ [0 (upper/leading), 1], the fan's directions. */
export interface PairedFinSpec {
  s: number;
  /** height of the base (TL, from the axis) */
  y: number;
  /** base length (TL) */
  base: number;
  len: Table;
  /** first and last ray direction in the side plane (rad up from straight back) */
  dirs: readonly [number, number];
  /** how far the rest pose holds it out from the flank (rad), and turns its blade flat (rad: a flathead's fans on the bed) */
  rest: number;
  roll?: number;
  rays: number;
}

export interface EyeSpec {
  s: number;
  /** height of the eye's centre (TL) */
  y: number;
  /** radius of the visible disc (TL) and how far its cornea domes out (TL) */
  r: number;
  bulge: number;
  /** pupil radius as a share of r, iris colours (inner, outer), the dark rim */
  pupil: number;
  iris: readonly [number, number];
  rim?: number;
  /** a gaze tilted up (rad): the eyes on top of a flathead's head */
  up?: number;
  /** which side (flatfish: both on one side); default a pair */
  side?: 1 | -1;
  /** forward tilt of the gaze (rad, default 0.15) */
  fwd?: number;
  /** a clear adipose eyelid over the front and back (the mullet's) */
  lid?: number;
  /** a fringed lappet of the iris over the top of the pupil (the flathead's, the flounder's) */
  lappet?: number;
  /** an eye on the top of a flat head: its centre this far (TL, along the skin) from the dorsal midline, not at `y` */
  across?: number;
}

export interface MouthSpec {
  /** s of the corner of the mouth */
  corner: number;
  /** the gape line: height (TL) at s ∈ [0, corner] */
  gape: Table;
  /** jaw drop at full gape (rad) */
  open: number;
  /** inside of the mouth (linear rgb multiplier) */
  inside: number;
  /** how far the lower jaw juts past the upper at the tip (TL): the bass's, the flathead's, the flounder's */
  jut?: number;
}

/** What the skin painter is asked about one point of the body. */
export interface SkinSample {
  s: number;
  /** angle round the section: 0 dorsal, π/2 the fish's left, π ventral, 3π/2 right */
  phi: number;
  /** +1 left, −1 right */
  side: number;
  /** height in the section: +1 dorsal edge, 0 axis, −1 ventral edge */
  h: number;
  /** the point (TL): lateral, height */
  x: number;
  y: number;
}

export interface SkinOut {
  r: number; g: number; b: number;
  rough: number;
  metal: number;
}

export interface FinOut { r: number; g: number; b: number; a: number }

export type Habit = 'cruiser' | 'reef' | 'sandForager' | 'ambusher' | 'flatfish' | 'schooler' | 'bottomShoal';
export type ForageStyle = 'hunt' | 'pick' | 'dig' | 'ambush' | 'graze' | 'filter' | 'peck';

export interface BehaviorSpec {
  habit: Habit;
  forage: ForageStyle;
  /** cruising and burst speeds (body lengths a second) */
  cruise: number;
  burst: number;
  /** preferred height of the belly above the bed, as a share of the water column (0 bottom … 1 surface) */
  level: number;
  /** keeps at least / at most this far off the bed (TL) */
  minLift: number;
  /** a group: cohesion 0 (alone) … 1 (a polarised school); spacing (TL) */
  school: number;
  spacing: number;
  /** extra behaviours the species has */
  extras: readonly ('bury' | 'strike' | 'leap' | 'flash' | 'rest')[];
  /** night: rests on the bottom / keeps schooling */
  nightRest?: boolean;
}

export interface SwimSpec {
  /** body wavelength (TL) and the envelope e(s) = c0 + c1 s + c2 s² (normalised to 1 at the tail) */
  lambda: number;
  env: readonly [number, number, number];
  /** tail-tip half amplitude at cruise (TL) */
  amp: number;
  /** body lengths per tail beat */
  stride: number;
  /**
   * how stiff the body is (0 an eel-like flathead … 1 a herring's spring-steel trunk): how far it bends in a routine turn
   * and in a sharp one
   */
  stiff?: number;
  /** below this speed (body lengths a second) the pectorals do the swimming and the tail is held still (a rockfish's) */
  pecSwim?: number;
}

export interface FishSpec {
  id: string;
  /** the tier size class of the budget (docs/quality/model-budget.md) */
  sizeClass: 'M' | 'L' | 'XL';
  /** total length the geometry is built at (m) */
  modelTL: number;
  /** body depth (TL): spacing, contacts, the water it needs */
  depth: number;
  /** the rig's origin (centre of mass) and the caudal fin's base */
  pivot: number;
  caudalBase: number;
  /** the first spine joint: in front of it the skull is rigid */
  headJoint: number;
  /** dorsal / ventral heights above and below the axis, half width (left; `widthR` for an asymmetric flatfish) */
  top: Table;
  bot: Table;
  width: Table;
  widthR?: Table;
  nTop: Table;
  nBot: Table;
  /**
   * the height of the section's widest point, as a share of the dorsal (+) or ventral (−) height: a fish is broadest
   * where its muscle is thickest, above the axis in most (a full back over a narrower belly), at the cheeks in the head
   */
  wide?: Table;
  /** the snout is rounded over this length of s (profile) */
  snoutCap: number;
  eyes: readonly EyeSpec[];
  mouth: MouthSpec;
  /** the gill cover's free edge: s at the axis, how far it sweeps back at the top/bottom (s per TL of height), height range */
  oper: { s: number; sweep: number; top: number; bot: number; step: number };
  fins: {
    median: readonly MedianFinSpec[];
    caudal: CaudalSpec;
    pectoral: PairedFinSpec;
    pelvic: PairedFinSpec;
  };
  /**
   * the scales: how many along the lateral line (head to caudal base; their size mid-flank, smaller on the cheek, toward
   * the back's and the belly's edges and on the peduncle), `around` the rows round the body (kept for the far tier's
   * proportions), how deep their relief, how dark their margins' pockets on the back; `type` ctenoid (spiny margins,
   * rough to the touch: the perches) or cycloid (smooth: the herrings, the mullet); `head` the s from which the head is
   * scaled (default: the cheek behind the eye); `loss` the share of scales lost (a patch of bare, darker skin)
   */
  scales: { along: number; around: number; depth: number; pigment?: number; type?: 'ctenoid' | 'cycloid'; head?: number; loss?: number; aspect?: number };
  /** the lateral line: its height (h, the share of the section's height) behind the head and how high it arches over the pectoral */
  lateral?: { h: number; arch: number };
  /** wetness (clearcoat) */
  wet: number;
  /** the thin-film sheen of guanine silver (iridescence 0..1): the rainbow flicker of a herring's flank */
  iridescence?: number;
  /** how strongly the head's anatomy shows (relief.ts): lips, the maxilla's height (TL), the orbit's rim, the preopercle */
  relief?: { lips?: number; maxilla?: number; orbit?: number; pre?: number; preDepth?: number };
  /** how much light the thin parts let through (0 opaque … 1: the pale, half-clear whiting) */
  translucent?: number;
  /** the colour of what is behind the skin where it opens (the gill chamber under a flared gill cover) */
  inside?: number;
  skin(p: SkinSample, out: SkinOut): void;
  fin(id: FinId, u: number, v: number, out: FinOut): void;
  swim: SwimSpec;
  behavior: BehaviorSpec;
  /** a flatfish laid on its blind side: +1 the left side up (ヒラメ) */
  flat?: 1 | -1;
}

/** Tables read through `curve` once per spec. */
export interface Profiles {
  top: (s: number) => number;
  bot: (s: number) => number;
  width: (s: number) => number;
  widthR: (s: number) => number;
  nTop: (s: number) => number;
  nBot: (s: number) => number;
  wide: (s: number) => number;
  gape: (s: number) => number;
}

const PROFILES = new WeakMap<FishSpec, Profiles>();

export function profilesOf(spec: FishSpec): Profiles {
  let p = PROFILES.get(spec);
  if (!p) {
    const width = curve(spec.width);
    p = {
      top: curve(spec.top), bot: curve(spec.bot), width,
      widthR: spec.widthR ? curve(spec.widthR) : width,
      nTop: curve(spec.nTop), nBot: curve(spec.nBot), wide: spec.wide ? curve(spec.wide) : () => 0, gape: curve(spec.mouth.gape),
    };
    PROFILES.set(spec, p);
  }
  return p;
}

/** the snout's front, rounded off over `cap` (an ellipse's quarter) */
export function nose(s: number, cap: number): number {
  if (s >= cap) return 1;
  const u = 1 - Math.max(0, s) / cap;
  return Math.sqrt(Math.max(0, 1 - u * u));
}

/**
 * A section across the body (TL): half-widths to the left and right, the heights of the back and the belly above and
 * below the axis, superellipse exponents for the upper and lower halves (n < 2 keeled, n > 2 full or flat-sided), and
 * `yc` the height of the widest point: the upper half runs from it to the back, the lower to the belly.
 */
export interface Section { hwL: number; hwR: number; top: number; bot: number; nTop: number; nBot: number; yc: number }

export const newSection = (): Section => ({ hwL: 0, hwR: 0, top: 0, bot: 0, nTop: 2, nBot: 2, yc: 0 });

/** the widest point's height (TL) for a section of these heights and that share (`wide`) */
export const wideAt = (w: number, top: number, bot: number): number => (w >= 0 ? w * top : w * bot);

/** the body's section at s (TL), with the snout rounding and the peduncle's end */
export function sectionAt(spec: FishSpec, s: number, out: Section = newSection()): Section {
  const P = profilesOf(spec);
  // the snout's front is a dome: the section a little behind the tip, rounded off toward it
  const k = nose(s, spec.snoutCap), sf = Math.max(s, 0.6 * spec.snoutCap);
  out.hwL = Math.max(1e-5, P.width(sf)) * k;
  out.hwR = Math.max(1e-5, P.widthR(sf)) * k;
  out.top = Math.max(1e-5, P.top(sf)) * k;
  out.bot = Math.max(1e-5, P.bot(sf)) * k;
  out.nTop = P.nTop(s);
  out.nBot = P.nBot(s);
  out.yc = wideAt(Math.max(-0.6, Math.min(0.6, P.wide(s))), out.top, out.bot);
  return out;
}

/** the point of a section at angle φ (0 dorsal, π/2 left, π ventral), TL units: [x, y] */
export function sectionPoint(sec: Section, phi: number, out: [number, number] = [0, 0]): [number, number] {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const n = cp >= 0 ? sec.nTop : sec.nBot;
  const hw = sp >= 0 ? sec.hwL : sec.hwR;
  out[0] = hw * Math.sign(sp) * Math.pow(Math.abs(sp), 2 / n);
  const e = Math.pow(Math.abs(cp), 2 / n);
  out[1] = cp >= 0 ? sec.yc + (sec.top - sec.yc) * e : sec.yc - (sec.bot + sec.yc) * e;
  return out;
}

/** the angle (0..π) on the left of the section whose height is y */
export function phiAtHeight(sec: Section, y: number): number {
  if (y >= sec.yc) {
    const c = Math.min(1, (y - sec.yc) / Math.max(1e-6, sec.top - sec.yc));
    return Math.acos(Math.pow(c, sec.nTop / 2));
  }
  const c = Math.min(1, (sec.yc - y) / Math.max(1e-6, sec.bot + sec.yc));
  return Math.PI - Math.acos(Math.pow(c, sec.nBot / 2));
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** body texture u for s (the body takes the texture's full width; the head, with its detail, a larger share of it) */
export const bodyU = (spec: FishSpec, s: number): number => Math.pow(Math.max(0, s) / (spec.caudalBase + 0.03), 0.7);
/** s at body texture u (the painter's inverse of bodyU) */
export const bodyS = (spec: FishSpec, u: number): number => (spec.caudalBase + 0.03) * Math.pow(Math.max(0, u), 1 / 0.7);

/** model z (forward +Z, metres) of a point at s */
export const zOf = (spec: FishSpec, s: number): number => (spec.pivot - s) * spec.modelTL;

/** φ (left flank) reached going `arc` (TL) along a section from φ0: up toward the back (+) or down (−) */
export function phiAlong(sec: Section, phi0: number, arc: number): number {
  const dir = arc > 0 ? -1 : 1, target = Math.abs(arc), step = 0.004;
  const p: [number, number] = [0, 0], q: [number, number] = [0, 0];
  let phi = phi0, a = 0;
  sectionPoint(sec, phi, p);
  for (let k = 0; k < 1500 && a < target; k++) {
    sectionPoint(sec, phi + dir * step, q);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (a + d >= target) { phi += (dir * step * (target - a)) / Math.max(d, 1e-9); break; }
    a += d; phi += dir * step; p[0] = q[0]; p[1] = q[1];
  }
  return Math.min(Math.PI - 1e-3, Math.max(1e-3, phi));
}

/** where on a section (φ, left flank) an eye's centre lies: at its height, or `across` from the dorsal midline */
export function eyePhi(e: EyeSpec, sec: Section): number {
  return e.across !== undefined ? phiAlong(sec, 0, -e.across) : phiAtHeight(sec, e.y);
}
