import { z } from 'zod';

/** A place on the coast to go to: a pin on the map, with the flat (map) it opens when it is ready. */
export const SpotSchema = z.object({
  id: z.string(),
  ja: z.string(),
  en: z.string().optional(),
  /** the stretch of coast it belongs to, for grouping on the map */
  area: z.string().default('東京湾'),
  lat: z.number(),
  lon: z.number(),
  /** the map it opens; null while the flat is not built yet */
  map: z.string().nullable().default(null),
  description: z.string().default(''),
});
export const SpotsFileSchema = z.object({ spots: z.array(SpotSchema).min(1) });
export type SpotDef = z.infer<typeof SpotSchema>;
