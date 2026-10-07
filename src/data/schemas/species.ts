import { z } from 'zod';

export const HabitatTagSchema = z.enum(['exposed_sand', 'exposed_mud', 'waterline', 'shallow', 'pool', 'small_pool', 'channel', 'deep', 'eelgrass', 'eelgrass_edge', 'bare']);
export const SubstrateSchema = z.enum(['sand', 'muddy_sand', 'mud', 'gravel', 'channel', 'rock']);
export const TimeOfDaySchema = z.enum(['dawn', 'day', 'dusk', 'night']);
export const SeasonSchema = z.enum(['spring', 'summer', 'autumn', 'winter']);
export const TidePhaseSchema = z.enum(['any', 'low', 'rising', 'high', 'falling']);
export const TaxonGroupSchema = z.enum(['fish', 'crustacean', 'bird', 'mollusc', 'worm', 'other']);
export const LocomotionSchema = z.enum(['swim', 'walk', 'burrow', 'fly', 'sessile']);

export const SpawnRuleSchema = z.object({
  tags: z.array(HabitatTagSchema).min(1),
  substrate: z.array(SubstrateSchema).optional(),
  depth_m: z.tuple([z.number(), z.number()]).optional(),
  time: z.array(TimeOfDaySchema).optional(),
  season: z.array(SeasonSchema).optional(),
  tide: TidePhaseSchema.default('any'),
  maps: z.array(z.string()).optional(),
  density_per_100m2: z.number().positive(),
  group: z.tuple([z.number().int().min(1), z.number().int().min(1)]).default([1, 1]),
  maxPopulation: z.number().int().positive().default(50),
  /** restrict the body length of individuals spawned by this rule (mm) */
  length_mm: z.tuple([z.number(), z.number()]).optional(),
});

export const SpeciesSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]+$/),
  names: z.object({ ja: z.string(), sci: z.string(), en: z.string().optional() }),
  taxon: z.object({ group: TaxonGroupSchema, family: z.string().optional() }),
  locomotion: LocomotionSchema,
  /** how deep a burrower sits (cm): a digging tool must reach at least this far */
  digDepth_cm: z.number().positive().optional(),
  /** lives in the water and is kept in it (default: swimmers and crustaceans); a crawling snail sets it */
  aquatic: z.boolean().optional(),
  collectable: z.boolean(),
  protected: z.boolean().default(false),
  model: z.object({
    hero: z.string().optional(),
    lod1: z.string().optional(),
    lod2: z.string().optional(),
    placeholder: z.string().optional(),
    modelLength_mm: z.number().positive(),
    /** beyond this distance from the player the animal has no view (default from its size) */
    viewDistance_m: z.number().positive().optional(),
    /** beyond this distance the driver's placeholder stands in for the GLB tiers (a species whose only GLB is dense) */
    placeholderBeyond_m: z.number().positive().optional(),
    driver: z.string().optional(),
    clips: z.object({ idle: z.string().default('Idle'), move: z.string().default('Move'), special: z.array(z.string()).default([]) }).default({ idle: 'Idle', move: 'Move', special: [] }),
    /** the gravid female's own model files (an egg-swollen form; the rest comes from `model`) */
    gravid: z.object({ hero: z.string().optional(), lod1: z.string().optional(), lod2: z.string().optional() }).optional(),
  }),
  size: z.object({
    length_mm: z.object({ min: z.number(), max: z.number(), mean: z.number(), sd: z.number() }),
    weightCoef: z.object({ a: z.number(), b: z.number() }),
  }),
  sex: z.object({ maleRatio: z.number().min(0).max(1).default(0.5), dimorphic: z.boolean().default(false) }).default({ maleRatio: 0.5, dimorphic: false }),
  /** when adult females carry eggs: the share in the spawning months, and out of them */
  breeding: z.object({ months: z.array(z.number().int().min(1).max(12)).min(1), gravidShare: z.number().min(0).max(1).default(0.7), offSeasonShare: z.number().min(0).max(1).default(0) }).optional(),
  stages: z.array(z.object({
    id: z.string(), ja: z.string(), maxLength_mm: z.number().optional(),
    /** this stage's own model files (a growth form of the species' model; the rest comes from `model`) */
    model: z.object({ hero: z.string().optional(), lod1: z.string().optional(), lod2: z.string().optional() }).optional(),
  })).min(1),
  traits: z.array(z.object({ id: z.string(), ja: z.string(), when: z.string() })).default([]),
  variation: z.object({
    scaleFromLength: z.boolean().default(true),
    tint: z.object({ hueDeg: z.tuple([z.number(), z.number()]), sat: z.tuple([z.number(), z.number()]), val: z.tuple([z.number(), z.number()]) }).optional(),
  }).default({ scaleFromLength: true }),
  spawn: z.array(SpawnRuleSchema).min(1),
  brain: z.object({ tree: z.string(), params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(z.number())])).default({}) }),
  capture: z.object({
    tools: z.array(z.string()).default([]),
    baseDifficulty: z.number().min(0).max(1).default(0.5),
    alertPenalty: z.number().min(0).max(1).default(0.4),
  }).default({ tools: [], baseDifficulty: 0.5, alertPenalty: 0.4 }),
  encyclopedia: z.object({
    description: z.string(),
    habitatHint: z.string(),
    behaviors: z.array(z.object({ id: z.string(), ja: z.string(), hint: z.string().optional(), /** animation clip that shows it in the 図鑑 preview */ clip: z.string().optional() })),
    placeholderModel: z.boolean().default(false),
  }),
});

export type SpeciesDef = z.infer<typeof SpeciesSchema>;

/** Animals kept in the water: placed in it, fenced by it, fleeing into it. */
export function isAquatic(sp: Pick<SpeciesDef, 'aquatic' | 'locomotion' | 'taxon'>): boolean {
  return sp.aquatic ?? (sp.locomotion === 'swim' || sp.taxon.group === 'crustacean');
}
export type SpawnRule = z.infer<typeof SpawnRuleSchema>;
export type HabitatTag = z.infer<typeof HabitatTagSchema>;
export type Substrate = z.infer<typeof SubstrateSchema>;
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;
export type TidePhase = z.infer<typeof TidePhaseSchema>;
