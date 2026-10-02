import { z } from 'zod';

export const ToolSchema = z.object({
  id: z.string(),
  ja: z.string(),
  /** capture: タモ; dig: スコップ; fishing: 釣り具; optic: 望遠鏡; observe/light/wear: reserved */
  type: z.enum(['capture', 'dig', 'fishing', 'optic', 'observe', 'light', 'wear']),
  targets: z.array(z.string()).default([]),
  minigame: z.enum(['timing', 'none']).default('none'),
  /** false: listed for the shop and the plan, not usable yet */
  available: z.boolean().default(true),
  params: z.record(z.string(), z.number()).default({}),
  description: z.string().default(''),
});

export const ToolsFileSchema = z.object({ tools: z.array(ToolSchema) });
export type ToolDef = z.infer<typeof ToolSchema>;
