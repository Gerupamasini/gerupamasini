export const MORPH: {
  totalLengthPerSL: number;
  bodyVolumeK: number;
  shieldLength_mm: { mean: number; sd: number; min: number; max: number };
  [k: string]: unknown;
};
export const PALETTE: Record<string, string>;
export const COLORWAYS: { id: string; weight: number; hue: number; sat: number; val: number; green: number }[];
export function individualMorph(sex?: string, variation?: number): { sex: string; chelaR: number; chelaRWidth: number; chelaL: number; chelaLWidth: number };
export function slFromLength(length_mm: number): number;
export function lengthFromSL(sl_mm: number): number;
