export const TL_MM: number;
export const SPINE: [string, number][];
export const POSTERIOR: string[];
export const MORPHS: Record<string, string[]>;
export type Quat = [number, number, number, number];
export function quat(axis: number[], ang: number): Quat;
export function qmul(a: Quat, b: Quat): Quat;
export function qrot(q: Quat, v: number[]): [number, number, number];
export function qX(a: number): Quat;
export function qY(a: number): Quat;
export function qZ(a: number): Quat;
export const QI: Quat;
export interface FinPose { protract: number; depress: number; twist: number; wrist: number; q: Quat | null; wq: Quat | null }
export interface EyePose { yaw: number; pitch: number; retract: number }
export interface Pose {
  bend: Record<string, number>;
  lift: Record<string, number>;
  roll: number;
  jaw: number;
  eyeL: EyePose;
  eyeR: EyePose;
  pecL: FinPose;
  pecR: FinPose;
  pelvic: number;
  morph: {
    breathe: number; blinkL: number; blinkR: number; foldD1: number; foldD2: number; foldAnal: number; foldCaudal: number;
    foldPecL: number; foldPecR: number; foldPelvic: number;
  };
}
export function defaultPose(): Pose;
export function computePose(p: Pose, rig?: { eyeRetract_m?: number; pecBindFix?: number[]; pec?: { dir: number[] } }): { q: Record<string, Quat>; t: Record<string, [number, number, number]>; morph: Record<string, number[]> };
export function swimMidline(xmm: number, phase: number, amp: number, tl?: number): number;
export function bendFromMidline(f: (xmm: number) => number, tl?: number): Record<string, number>;
