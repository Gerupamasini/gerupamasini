import { Rng, hashInts } from '../../core/Rng';

/**
 * マガキ Magallana (Crassostrea) gigas — what makes one oyster different from the next.
 *
 * Six independent seeds, so the shape, the growth history, the damage, the size, the colour and the way it sits on
 * its host can each be varied without the others moving:
 *   shellSeed       outline, cup depth, lid, bend, asymmetry, plication strength
 *   growthSeed      which growth pattern (lamella history, radial folds, rays) and whether it is mirrored
 *   damageSeed      chipped margins, broken-off frills, beak erosion
 *   sizeSeed        shell length
 *   colorSeed       ground colour, purple pigment, mantle pigment
 *   attachmentSeed  how it sits on the host (lying, oblique, standing), how deep the cement is, fouling
 *
 * The reference (FAO / NIES / prefectural keys): the valves are unequal, solid, very rough and laminated; the left
 * (lower) valve is cemented to the substrate and deeply cupped, its sides sometimes almost vertical; the right
 * (upper) valve is flat or slightly convex and sits inside it, smaller. Growth stages are prominent, raised and
 * frilled into flat scales, sometimes fluted into short open tubes; radial folds make the margin zig-zag where the
 * valves meet. Ground colour yellowish-white to grey with purple-brown radial bands; the inside white, porcelain-like
 * (calcite, not nacre) with chalky patches and a single kidney-shaped adductor scar, white to purple. The form is
 * extremely plastic: crowded oysters grow long and narrow, standing on their beaks; a lone one on a rock is round
 * and flat. The attached valve copies its host's surface.
 *
 * Local frame of every oyster: origin at the hinge (the beak), +x along the hinge axis, +z from the beak toward the
 * ventral margin (shell "length"), +y out of the lower valve toward the upper. Units are metres.
 */
export interface OysterSeeds {
  shellSeed: number;
  growthSeed: number;
  damageSeed: number;
  sizeSeed: number;
  colorSeed: number;
  attachmentSeed: number;
}

export type AgeClass = 'spat' | 'juvenile' | 'adult' | 'old';
/** 0 alive; 1 dead, both valves still hinged and gaping; 2 dead, only the cemented lower valve left */
export type DeadState = 0 | 1 | 2;

export interface MarginChip {
  /** centre along the margin (0..1) */
  u: number;
  /** half width along the margin (u units) */
  w: number;
  /** how far in the break goes (growth units, 0..1) */
  depth: number;
  /** which valve: 0 lower, 1 upper */
  valve: 0 | 1;
  seed: number;
}

export interface OysterGenome {
  seeds: OysterSeeds;
  age: AgeClass;
  dead: DeadState;
  /** growth pattern variant (texture atlas block) */
  variant: number;
  /** growth pattern mirrored along the margin */
  mirror: boolean;
  /** beak → ventral margin, metres */
  length: number;
  /** width / length */
  widthRatio: number;
  /** depth of the lower cup / length */
  cupDepth: number;
  /** convexity of the upper valve / length */
  lidDome: number;
  /** where the outline is widest along the length (0..1) */
  widest: number;
  /** beak sharpness: exponent of the outline near the beak (≈1 straight sides, <1 blunt) */
  beakExp: number;
  /** ventral roundness: exponent near the ventral margin (0.5 round) */
  ventralExp: number;
  /** left / right half-width difference (−0.3..0.3) */
  asym: number;
  /** sideways curvature of the growth axis (banana shape), fraction of length */
  bend: number;
  /** commissure warp: twist about the length (radians over the length) */
  twist: number;
  /** irregular outline: amplitude/phase pairs for harmonics 2..7 */
  harmonics: Float32Array;
  /**
   * growth wander: earlier growth stages sat off today's outline — the oyster changed direction as neighbours
   * crowded it — so the growth lines are not concentric. Sideways (two modes) and lengthwise, fractions of length.
   */
  drift: [number, number, number];
  /** radial fold amplitude (fraction of length) on the lower valve and at the commissure */
  plication: number;
  /** lower valve margin flaring up around the lid (fraction of length) */
  lipRise: number;
  /** upper valve inset from the lower margin (fraction of length) */
  inset: number;
  /** shell thickness at the margin / at the beak (fraction of length) */
  thinMargin: number;
  thickBeak: number;
  /** lamella prominence multiplier (old shells are more frilled) */
  frill: number;
  /** feeding gape at the ventral margin, radians (≈2–5 mm on a 10 cm shell) */
  gapeMax: number;
  // damage
  chips: MarginChip[];
  /** fraction of frill edges broken off */
  brokenFrills: number;
  /** beak / surface erosion 0..1 */
  erosion: number;
  // colour (0..1 parameters read by the material)
  colorKey: number;
  pigment: number;
  mantleDark: number;
  // attachment and fouling
  /** angle the ventral end rises off the host (radians): 0 lying, ~1.2 standing on the beak */
  rise: number;
  /** how deep the lower valve is set into its host plane (fraction of length): the cement footprint */
  embed: number;
  mud: number;
  algae: number;
  /** barnacles on the shell (0..1 of the prototype's slots shown) */
  barnacles: number;
}

/** Number of growth pattern variants baked into the shared atlas. */
export const GROWTH_VARIANTS = 6;

const unit = (seed: number, k: number): number => hashInts(seed, k, 0x5eed) / 4294967296;

/** Six seeds from one (e.g. a member index in a cluster). */
export function seedsFrom(seed: number): OysterSeeds {
  return {
    shellSeed: hashInts(seed, 1),
    growthSeed: hashInts(seed, 2),
    damageSeed: hashInts(seed, 3),
    sizeSeed: hashInts(seed, 4),
    colorSeed: hashInts(seed, 5),
    attachmentSeed: hashInts(seed, 6),
  };
}

export interface GenomeOptions {
  age?: AgeClass;
  dead?: DeadState;
  /** crowding 0 (alone on a rock) .. 1 (packed in a clump): crowded oysters are long, narrow and stand up */
  crowding?: number;
  /** force a length (metres) instead of drawing one from sizeSeed */
  length?: number;
  /** force a growth variant */
  variant?: number;
}

/** Everything about one oyster from its seeds. Deterministic. */
export function makeGenome(seeds: OysterSeeds, opts: GenomeOptions = {}): OysterGenome {
  const crowd = opts.crowding ?? 0.5;
  const age: AgeClass = opts.age ?? 'adult';
  const dead: DeadState = opts.dead ?? 0;
  const sh = new Rng(seeds.shellSeed), gr = new Rng(seeds.growthSeed), dm = new Rng(seeds.damageSeed);
  const sz = new Rng(seeds.sizeSeed), co = new Rng(seeds.colorSeed), at = new Rng(seeds.attachmentSeed);
  const young = age === 'spat' || age === 'juvenile';

  // size: Tokyo Bay intertidal oysters, 2nd–4th year mostly 7–13 cm; spat 1–2.5 cm, juveniles 2.5–5 cm
  const lenRange: Record<AgeClass, [number, number]> = { spat: [0.012, 0.026], juvenile: [0.028, 0.055], adult: [0.065, 0.12], old: [0.11, 0.16] };
  const [l0, l1] = lenRange[age];
  const length = opts.length ?? l0 + (l1 - l0) * Math.min(1, Math.max(0, 0.5 + 0.28 * sz.normal()));

  // outline: crowding makes them long and narrow (W/L 0.35–0.5); alone they are rounder (0.6–0.85)
  const wr = (0.78 - 0.36 * crowd) * (1 + 0.16 * sh.normal()) * (young ? 1.12 : 1);
  const widthRatio = Math.min(0.92, Math.max(0.3, wr));
  const harmonics = new Float32Array(12);
  for (let k = 0; k < 6; k++) {
    harmonics[k * 2] = (0.12 / (1 + k * 0.55)) * sh.range(0.25, 1.2) * (young ? 0.6 : 1);
    harmonics[k * 2 + 1] = sh.range(0, Math.PI * 2);
  }
  const g: OysterGenome = {
    seeds,
    age,
    dead,
    variant: opts.variant ?? Math.floor(unit(seeds.growthSeed, 11) * GROWTH_VARIANTS) % GROWTH_VARIANTS,
    mirror: unit(seeds.growthSeed, 12) < 0.5,
    length,
    widthRatio,
    cupDepth: (young ? 0.12 : 0.17 + 0.1 * crowd) * sh.range(0.8, 1.25),
    lidDome: sh.range(-0.005, 0.045) * (young ? 0.5 : 1),
    widest: sh.range(0.55, 0.74),
    beakExp: sh.range(0.78, 1.15),
    ventralExp: sh.range(0.42, 0.62),
    asym: sh.range(-0.22, 0.22),
    bend: sh.range(-0.22, 0.22) * (0.5 + crowd),
    twist: sh.range(-0.18, 0.18),
    harmonics,
    drift: [sh.range(-0.12, 0.12) * (0.5 + crowd), sh.range(-0.06, 0.06), sh.range(-0.08, 0.05)],
    plication: (young ? 0.006 : 0.012) * sh.range(0.4, 1.5),
    lipRise: young ? 0.004 : sh.range(0.006, 0.016),
    inset: sh.range(0.004, 0.011),
    thinMargin: sh.range(0.0035, 0.006),
    thickBeak: (young ? 0.03 : 0.055) * sh.range(0.8, 1.3),
    frill: (age === 'old' ? 1.3 : young ? 0.45 : 1) * gr.range(0.75, 1.25),
    gapeMax: sh.range(0.022, 0.05),
    chips: [],
    brokenFrills: young ? dm.range(0, 0.15) : dm.range(0.1, 0.65),
    erosion: (age === 'old' ? 0.7 : young ? 0.05 : 0.35) * dm.range(0.3, 1.4) + (dead ? 0.35 : 0),
    colorKey: co.next(),
    pigment: Math.min(1, Math.max(0, (young ? 0.75 : 0.45) + 0.3 * co.normal())),
    mantleDark: co.range(0.45, 1),
    rise: at.range(0, 1) * (0.25 + 1.0 * crowd),
    embed: at.range(0.04, 0.11),
    mud: at.range(0.25, 1),
    algae: Math.max(0, at.range(-0.3, 0.9)),
    barnacles: young ? 0 : Math.max(0, at.range(-0.2, 1)),
  };
  // chips: the thin margin breaks easily; old and dead shells have more
  const nChips = young ? dm.int(0, 1) : dm.int(0, age === 'old' || dead ? 4 : 3);
  for (let i = 0; i < nChips; i++) {
    g.chips.push({ u: dm.range(0.12, 0.88), w: dm.range(0.02, 0.07), depth: dm.range(0.02, 0.09), valve: dm.chance(0.6) ? 0 : 1, seed: dm.int(0, 1 << 30) });
  }
  if (dead) { g.mud = Math.min(1, g.mud + 0.3); g.algae = Math.min(1, g.algae + 0.3); g.pigment *= 0.5; }
  return g;
}

/**
 * The feeding gape in millimetres at the ventral margin (for the report and tests): a relaxed Pacific oyster gapes a
 * few millimetres; anything over ~6 mm on a 10 cm shell is spawning or dying, not feeding.
 */
export function gapeMillimetres(g: OysterGenome, angle = g.gapeMax): number {
  return Math.sin(angle) * g.length * 1000;
}
