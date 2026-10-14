import type { ShaderMaterial } from 'three';
export function createFinMaterials(opts: Record<string, unknown>): { transmit: ShaderMaterial; scatter: ShaderMaterial };
