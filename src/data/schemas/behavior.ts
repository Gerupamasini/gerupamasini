import { z } from 'zod';

const ArgValue = z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]);
const Args = z.record(z.string(), ArgValue).default({});

export type BTNode =
  | { type: 'selector'; children: BTNode[] }
  | { type: 'sequence'; children: BTNode[] }
  | { type: 'random'; weights?: number[]; children: BTNode[] }
  | { type: 'cooldown'; seconds: number; child: BTNode }
  | { type: 'condition'; name: string; args: Record<string, number | string | boolean | number[]> }
  | { type: 'action'; name: string; args: Record<string, number | string | boolean | number[]>; interrupt?: boolean };

export const BTNodeSchema: z.ZodType<BTNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('selector'), children: z.array(BTNodeSchema).min(1) }),
    z.object({ type: z.literal('sequence'), children: z.array(BTNodeSchema).min(1) }),
    z.object({ type: z.literal('random'), weights: z.array(z.number().nonnegative()).optional(), children: z.array(BTNodeSchema).min(1) }),
    z.object({ type: z.literal('cooldown'), seconds: z.number().positive(), child: BTNodeSchema }),
    z.object({ type: z.literal('condition'), name: z.string(), args: Args }),
    z.object({ type: z.literal('action'), name: z.string(), args: Args, interrupt: z.boolean().optional() }),
  ]),
) as z.ZodType<BTNode>;

export const BehaviorTreeSchema = z.object({
  id: z.string(),
  tickHz: z.object({ near: z.number().positive(), mid: z.number().positive(), far: z.number().positive() }).default({ near: 5, mid: 2, far: 0.5 }),
  root: BTNodeSchema,
});

export type BehaviorTreeDef = z.infer<typeof BehaviorTreeSchema>;
