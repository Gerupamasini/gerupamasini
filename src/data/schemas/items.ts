import { z } from 'zod';

export const ToolSchema = z.object({
  id: z.string(),
  ja: z.string(),
  type: z.enum(['capture', 'observe', 'light', 'wear']),
  targets: z.array(z.string()).default([]),
  minigame: z.enum(['timing', 'none']).default('none'),
  params: z.record(z.string(), z.number()).default({}),
  description: z.string().default(''),
});

export const ToolsFileSchema = z.object({ tools: z.array(ToolSchema) });
export type ToolDef = z.infer<typeof ToolSchema>;
