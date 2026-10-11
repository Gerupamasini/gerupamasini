import { z } from 'zod';
import { SubstrateSchema } from './species.ts';

export const MapSchema = z.object({
  id: z.string(),
  names: z.object({ ja: z.string(), en: z.string().optional() }),
  station: z.string(),
  /** Environment-only maps can disable every animal spawn, including buried shellfish. */
  animals: z.boolean().default(true),
  origin: z.object({ lat: z.number(), lon: z.number() }),
  size_m: z.number().positive(),
  resolution: z.number().int().positive(),
  height: z.object({ file: z.string(), min_tp_m: z.number(), max_tp_m: z.number() }),
  substrate: z.object({ file: z.string(), palette: z.array(SubstrateSchema).min(1) }),
  spawnStart: z.object({ x: z.number(), z: z.number(), heading: z.number() }),
  bounds: z.object({
    walkable: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]),
    noEntry: z.array(z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])).default([]),
  }),
  props: z.array(z.object({ type: z.string(), x: z.number(), z: z.number(), rot: z.number().default(0), scale: z.number().default(1) })).default([]),
  /** the map's own shore features (src/world/maps/<layout>); absent: the 葛西 features */
  layout: z.string().optional(),
  /** Opt-in Rhizophora stylosa forest; heights are in the map's terrain datum. Existing temperate shores are unchanged. */
  mangroves: z.object({
    seed: z.number().int(),
    clusters: z.array(z.object({ x: z.number(), z: z.number(), radius: z.number().positive(), count: z.number().int().nonnegative().max(1000),
      /** overrides the layout's fraction: 1 scatters seedlings over open mud */
      juvenileFraction: z.number().min(0).max(1).optional(),
      /** deep forest rows: mid/high quality only */
      deep: z.boolean().optional() })).max(1024),
    juvenileFraction: z.number().min(0).max(1).optional(),
    minGround: z.number().optional(), maxGround: z.number().optional(), minSpacing: z.number().positive().optional(),
    scale: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  }).optional(),
  /** how deep the player can wade: boots (the default, 35 cm) or chest waders */
  wading: z.object({ gear: z.enum(['boots', 'waders']), maxDepth_m: z.number().positive() }).optional(),
  /** habitat grid (coarse cell size) and how close to the player animals may appear */
  habitat: z.object({ coarse_m: z.number().positive().default(5), minSpawnDist_m: z.number().nonnegative().default(10) }).optional(),
});

export type MapDef = z.infer<typeof MapSchema>;
