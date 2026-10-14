import { z } from 'zod';

export const ManifestSchema = z.object({
  version: z.number().int(),
  species: z.array(z.string()),
  behaviors: z.array(z.string()),
  maps: z.array(z.string()),
  stations: z.array(z.string()),
  items: z.string(),
  strings: z.string(),
  defaultMap: z.string(),
  /** the places on the coast the player picks from (optional: one spot per map when missing) */
  spots: z.string().optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const StringsSchema = z.record(z.string(), z.string());
