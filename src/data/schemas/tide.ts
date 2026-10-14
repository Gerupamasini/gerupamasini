import { z } from 'zod';

export const TideStationSchema = z.object({
  id: z.string(),
  names: z.object({ ja: z.string(), en: z.string().optional() }),
  lat: z.number(),
  lon: z.number(),
  phaseReference: z.enum(['JST135E', 'UTC']),
  phaseConvention: z.enum(['zone_speed', 'meridian_species']).optional(),
  mslAboveChartDatum_cm: z.number().nullable(),
  constituents: z.array(z.object({ name: z.string(), amplitude_cm: z.number().nonnegative(), phase_deg: z.number() })).min(1),
  source: z.object({ name: z.string(), url: z.string().optional(), note: z.string().optional() }).optional(),
});

export type TideStationDef = z.infer<typeof TideStationSchema>;
