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
  /** the scales of the normal map: rows along the body and round it, and how deep */
  scales: { along: number; around: number; depth: number };
  /** wetness (clearcoat) */
  wet: number;
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
      nTop: curve(spec.nTop), nBot: curve(spec.nBot), gape: curve(spec.mouth.gape),
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

export interface Section { hwL: number; hwR: number; top: number; bot: number; nTop: number; nBot: number }

/** the body's section at s (TL), with the snout rounding and the peduncle's end */
export function sectionAt(spec: FishSpec, s: number, out: Section = { hwL: 0, hwR: 0, top: 0, bot: 0, nTop: 2, nBot: 2 }): Section {
  const P = profilesOf(spec);
  // the snout's front is a dome: the section a little behind the tip, rounded off toward it
  const k = nose(s, spec.snoutCap), sf = Math.max(s, 0.6 * spec.snoutCap);
  out.hwL = Math.max(1e-5, P.width(sf)) * k;
  out.hwR = Math.max(1e-5, P.widthR(sf)) * k;
  out.top = Math.max(1e-5, P.top(sf)) * k;
  out.bot = Math.max(1e-5, P.bot(sf)) * k;
  out.nTop = P.nTop(s);
  out.nBot = P.nBot(s);
  return out;
}

/** the point of a section at angle φ (0 dorsal, π/2 left, π ventral), TL units: [x, y] */
export function sectionPoint(sec: Section, phi: number, out: [number, number] = [0, 0]): [number, number] {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  const n = cp >= 0 ? sec.nTop : sec.nBot;
  const hw = sp >= 0 ? sec.hwL : sec.hwR;
  out[0] = hw * Math.sign(sp) * Math.pow(Math.abs(sp), 2 / n);
  out[1] = (cp >= 0 ? sec.top : sec.bot) * Math.sign(cp) * Math.pow(Math.abs(cp), 2 / n);
  return out;
}

/** the angle (0..π) on the left of the section whose height is y */
export function phiAtHeight(sec: Section, y: number): number {
  if (y >= 0) {
    const c = Math.min(1, y / sec.top);
    return Math.acos(Math.pow(c, sec.nTop / 2));
  }
  const c = Math.min(1, -y / sec.bot);
  return Math.PI - Math.acos(Math.pow(c, sec.nBot / 2));
}

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** model z (forward +Z, metres) of a point at s */
export const zOf = (spec: FishSpec, s: number): number => (spec.pivot - s) * spec.modelTL;
