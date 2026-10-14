import type { IUniform, Vector3, Vector4 } from 'three';

/** The colour morphs as the body's extras carry them (tools/models/mahaze/body.mjs morphTable()). */
export interface MorphTable {
  patterns: string[];
  hn: { dorsal: [number, number]; belly: [number, number] };
  colors: {
    name: string; base: number[]; dors: number[]; belly: number[];
    melK: number; melAdd: number; xanK: number; iriK: number;
    fin: { tint: [number, number, number]; melK: number };
  }[];
}
/** One fish's look: pattern and colour morph, 0-based. */
export interface MorphPick { pattern: number; color: number }

export const morphGLSL: string;
export function morphUniforms(morphs: MorphTable, pick?: MorphPick | null): {
  uGbMorphPattern: IUniform<Vector3>;
  uGbMorphStd: IUniform<Vector3[]>;
  uGbMorphCol: IUniform<Vector3[]>;
  uGbMorphK: IUniform<Vector4>;
  uGbMorphHn: IUniform<Vector4>;
};
export function morphCount(morphs: MorphTable): number;
export function morphPick(morphs: MorphTable, v: number): MorphPick;
