import { Color } from 'three';
import { hashInts, Rng } from '../../core/Rng';
export const CORAL_IDS = [
  'acropora_digitifera',
  'acropora_hyacinthus',
  'porites_lobata',
  'montipora_foliosa',
  'platygyra_daedalea',
] as const;
export type CoralSpecies = (typeof CORAL_IDS)[number];
export type CoralLod = 0 | 1 | 2;
export type CoralVariant = 0 | 1 | 2 | 3;
/** Clear shallow-water art profile; coefficients are scene settings, not an Okinawa water measurement. */
export const CORAL_WATER = {
  color: [0.018, 0.105, 0.16] as const,
  turbidity: 0.025,
  absorption: [0.1, 0.025, 0.012] as const,
};
export const CORAL_INFO: Record<
  CoralSpecies,
  {
    name: string;
    scientific: string;
    form: string;
    depth: readonly [number, number];
    polypSpacing: number;
    colour: string;
  }
> = {
  acropora_digitifera: {
    name: 'コユビミドリイシ',
    scientific: 'Acropora digitifera',
    form: '短い指状の枝',
    depth: [0.8, 6],
    polypSpacing: 0.0038,
    colour: '#a48361',
  },
  acropora_hyacinthus: {
    name: 'クシハダミドリイシ',
    scientific: 'Acropora hyacinthus',
    form: '放射状に分岐するテーブル',
    depth: [1.3, 10],
    polypSpacing: 0.003,
    colour: '#b48987',
  },
  porites_lobata: {
    name: 'ハマサンゴ類（P. lobata 型）',
    scientific: 'Porites lobata',
    form: '融合した丸い大型塊',
    depth: [0.8, 12],
    polypSpacing: 0.0015,
    colour: '#927038',
  },
  montipora_foliosa: {
    name: '葉状コモンサンゴ（M. foliosa 型）',
    scientific: 'Montipora foliosa',
    form: '重なった薄い葉状板',
    depth: [2, 12],
    polypSpacing: 0.001,
    colour: '#aa7959',
  },
  platygyra_daedalea: {
    name: 'ノウサンゴ類（P. daedalea 型）',
    scientific: 'Platygyra daedalea',
    form: '連続した蛇行谷と隆起壁',
    depth: [1.5, 12],
    polypSpacing: 0.011,
    colour: '#988b57',
  },
};
export interface CoralSpec {
  id: number;
  species: CoralSpecies;
  variant: CoralVariant;
  seed: number;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  growthDirection: readonly [number, number];
  branchDensity: number;
  surfaceColor: Color;
  damageAmount: number;
  algaeAmount: number;
}
/** Seeds select four shared structural variants, while continuous appearance stays instance-owned. */
export function coralSpec(seed: number, id = 0, species: CoralSpecies = CORAL_IDS[id % 5]): CoralSpec {
  const r = new Rng(hashInts(seed, id, CORAL_IDS.indexOf(species)));
  const density = r.range(0.7, 1.3);
  return {
    id,
    seed: hashInts(seed, id),
    species,
    variant: Math.min(3, Math.floor((density - 0.7) / 0.15)) as CoralVariant,
    x: 0,
    z: 0,
    yaw: r.range(0, Math.PI * 2),
    // Recruitment and old colonies coexist; bias toward smaller individuals without extra geometry.
    scale: 0.42 + Math.pow(r.next(), 0.72) * 0.9,
    growthDirection: [r.range(-0.14, 0.14), r.range(-0.14, 0.14)],
    branchDensity: density,
    surfaceColor: new Color(CORAL_INFO[species].colour).offsetHSL(
      r.range(-0.025, 0.025),
      r.range(-0.08, 0.07),
      r.range(-0.06, 0.05),
    ),
    damageAmount: r.range(0, 0.07),
    algaeAmount: r.range(0, 0.08),
  };
}
