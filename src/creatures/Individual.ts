import { Vector3 } from 'three';
import type { SpeciesDef } from '../data/schemas';
import { Rng, hashInts } from '../core/Rng';

export type Sex = 'm' | 'f' | 'unknown';

export interface IndividualRecord {
  id: string;
  speciesId: string;
  /** per-species catalogue number assigned at capture (0 = not catalogued) */
  number: number;
  length_mm: number;
  weight_g: number;
  sex: Sex;
  stage: string;
  traits: string[];
  caughtAt: number;
  caughtWhere: [number, number];
  tideLevel: number;
}

export interface BrainState {
  busyUntil: number;
  intentId: number;
  cooldowns: Map<string, number>;
  nextTick: number;
  done: boolean;
  lastIntentKind: string;
}

export interface Individual {
  id: string;
  species: SpeciesDef;
  pos: Vector3;
  home: Vector3;
  heading: number;
  length_mm: number;
  weight_g: number;
  sex: Sex;
  stage: string;
  traits: string[];
  /** percentile of length within the species distribution, 0..100 */
  lengthPct: number;
  alert: number;
  energy: number;
  lod: 0 | 1 | 2 | 3;
  brain: BrainState;
  rng: Rng;
  /** spawn bookkeeping */
  cell: number;
  ruleIndex: number;
  mismatchSince: number;
  spawnedAt: number;
  /** resident of a stingray feeding pit (kept until the player walks away) */
  pitId?: number;
  /** game time at which the water under an aquatic animal became too shallow (0 = fine) */
  strandedSince: number;
  /** skin moisture 0..1 of an amphibious animal (its driver keeps it) */
  moisture?: number;
  /** out of sight and reach (inside its burrow) */
  hidden?: boolean;
}

/** The least water an aquatic animal is placed in or will stay in: about 15 % of its length, never under 1.5 cm. */
export function minDepthFor(species: SpeciesDef, length_mm: number): number {
  return Math.max(0.015, (length_mm / 1000) * 0.15);
}

function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

function evalTraitCondition(expr: string, vars: Record<string, number>): boolean {
  const m = /^\s*([a-z_]+)\s*(>=|<=|>|<|==)\s*(-?[\d.]+)\s*$/.exec(expr);
  if (!m) return false;
  const v = vars[m[1]];
  const c = Number(m[3]);
  if (v === undefined) return false;
  switch (m[2]) {
    case '>=': return v >= c;
    case '<=': return v <= c;
    case '>': return v > c;
    case '<': return v < c;
    default: return v === c;
  }
}

/** Deterministically generate an individual from a species definition and a seed. */
export function generateIndividual(species: SpeciesDef, seed: number, x: number, z: number, cell: number, ruleIndex: number, nowMs: number, lengthRange?: [number, number]): Individual {
  const rng = new Rng(seed);
  const L = species.size.length_mm;
  let len = L.mean + L.sd * rng.normal();
  len = Math.max(L.min, Math.min(L.max, len));
  if (lengthRange) len = Math.max(L.min, Math.min(L.max, lengthRange[0] + (lengthRange[1] - lengthRange[0]) * rng.next()));
  const pct = 50 * (1 + erf((len - L.mean) / (L.sd * Math.SQRT2)));
  const weight = species.size.weightCoef.a * Math.pow(len, species.size.weightCoef.b);
  const sex: Sex = rng.chance(species.sex.maleRatio) ? 'm' : 'f';
  let stage = species.stages[species.stages.length - 1].id;
  for (const st of species.stages) if (st.maxLength_mm !== undefined && len <= st.maxLength_mm) { stage = st.id; break; }
  const traits = species.traits.filter((tr) => evalTraitCondition(tr.when, { length_pct: pct, length_mm: len, weight_g: weight })).map((tr) => tr.id);
  const id = `${species.id}#${hashInts(seed, 7).toString(16).padStart(8, '0')}`;
  return {
    id, species, pos: new Vector3(x, 0, z), home: new Vector3(x, 0, z), heading: rng.range(0, Math.PI * 2),
    length_mm: Math.round(len * 10) / 10, weight_g: Math.round(weight * 10) / 10, sex, stage, traits, lengthPct: pct,
    alert: 0, energy: rng.range(0.3, 0.9), lod: 3,
    brain: { busyUntil: 0, intentId: 0, cooldowns: new Map(), nextTick: 0, done: true, lastIntentKind: '' },
    rng: new Rng(seed ^ 0x9e3779b9), cell, ruleIndex, mismatchSince: 0, spawnedAt: nowMs, strandedSince: 0,
  };
}

export function toRecord(ind: Individual, number: number, nowMs: number, tideLevel: number): IndividualRecord {
  return {
    id: ind.id, speciesId: ind.species.id, number, length_mm: ind.length_mm, weight_g: ind.weight_g, sex: ind.sex, stage: ind.stage,
    traits: [...ind.traits], caughtAt: nowMs, caughtWhere: [Math.round(ind.pos.x), Math.round(ind.pos.z)], tideLevel,
  };
}
