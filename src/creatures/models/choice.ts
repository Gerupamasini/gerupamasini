import type { SpeciesDef } from '../../data/schemas/species';

/** The model files of a species for one of its growth stages: the stage's own where it has them, else the species'. */
export function modelFor(sp: SpeciesDef, stage?: string): SpeciesDef['model'] {
  const st = stage ? sp.stages.find((s) => s.id === stage) : undefined;
  return st?.model ? { ...sp.model, ...st.model } : sp.model;
}

/** The pattern variant an individual wears, fixed by its id (the same fish in the net, the case and the tank). */
export function variantOf(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 8;
}
