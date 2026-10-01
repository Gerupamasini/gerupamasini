import type { Object3D, Vector3 } from 'three';
export interface MahazeBehaviorState {
  mode: string; t: number; next: number; pos: Vector3; heading: number; propGoal: number; mouthOpen?: number; gillOpen?: number;
  yaw: Float64Array; headGoal: number; targetHeading: number; auto: boolean; paused: boolean;
}
export interface MahazeBehavior {
  update(dt: number): void;
  dart(dist?: number, angle?: number | null, force?: boolean): void;
  yawn(): void;
  flick(): void;
  paddle(): void;
  pose(name: string, time: number): void;
  setRestFor(seconds: number): void;
  setAlert(v: number): void;
  setHeading(h: number): void;
  anchor(): Vector3;
  setAuto(v: boolean): void;
  setPaused(v: boolean): void;
  state: MahazeBehaviorState;
}
export function createBehavior(opts: {
  root: Object3D; bones: Record<string, Object3D>; finMeshes: Record<string, Object3D>; axes: Record<string, number[]>;
  contacts: { bone: Object3D; p: Vector3 }[]; floorY: number | ((x: number, z: number) => number); scale?: number; onEvent?: ((name: string) => void) | null;
}): MahazeBehavior;
export const SPINE: [string, number][];
