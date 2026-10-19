type Quad = [number, number, number, number];
export const COLUMN: { hn: Quad; radius: [number, number] };
export const COLUMN_PLAIN: { hn: Quad; radius: [number, number] };
export const SLANT: { spine: number; rib: number };
export function columnHn(s: number, start: number, vent: number, sl: number, hn?: Quad): number;
export const COLUMN_GLSL: string;
