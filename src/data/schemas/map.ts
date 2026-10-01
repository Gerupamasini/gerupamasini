import { z } from 'zod';
import { SubstrateSchema } from './species.ts';

export const MapSchema = z.object({
  id: z.string(),
  names: z.object({ ja: z.string(), en: z.string().optional() }),
  station: z.string(),
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
});

export type MapDef = z.infer<typeof MapSchema>;
