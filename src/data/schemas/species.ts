import { z } from 'zod';

export const HabitatTagSchema = z.enum(['exposed_sand', 'exposed_mud', 'waterline', 'shallow', 'pool', 'channel', 'deep']);
export const SubstrateSchema = z.enum(['sand', 'muddy_sand', 'mud', 'gravel', 'channel']);
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
});

export const SpeciesSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]+$/),
  names: z.object({ ja: z.string(), sci: z.string(), en: z.string().optional() }),
  taxon: z.object({ group: TaxonGroupSchema, family: z.string().optional() }),
  locomotion: LocomotionSchema,
  collectable: z.boolean(),
  protected: z.boolean().default(false),
  model: z.object({
    hero: z.string().optional(),
    lod1: z.string().optional(),
    lod2: z.string().optional(),
    placeholder: z.string().optional(),
    modelLength_mm: z.number().positive(),
    driver: z.string().optional(),
    clips: z.object({ idle: z.string().default('Idle'), move: z.string().default('Move'), special: z.array(z.string()).default([]) }).default({ idle: 'Idle', move: 'Move', special: [] }),
  }),
  size: z.object({
    length_mm: z.object({ min: z.number(), max: z.number(), mean: z.number(), sd: z.number() }),
    weightCoef: z.object({ a: z.number(), b: z.number() }),
  }),
  sex: z.object({ maleRatio: z.number().min(0).max(1).default(0.5), dimorphic: z.boolean().default(false) }).default({ maleRatio: 0.5, dimorphic: false }),
  stages: z.array(z.object({ id: z.string(), ja: z.string(), maxLength_mm: z.number().optional() })).min(1),
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
    behaviors: z.array(z.object({ id: z.string(), ja: z.string(), hint: z.string().optional() })),
    placeholderModel: z.boolean().default(false),
  }),
});

export type SpeciesDef = z.infer<typeof SpeciesSchema>;
export type SpawnRule = z.infer<typeof SpawnRuleSchema>;
export type HabitatTag = z.infer<typeof HabitatTagSchema>;
export type Substrate = z.infer<typeof SubstrateSchema>;
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;
export type TidePhase = z.infer<typeof TidePhaseSchema>;
