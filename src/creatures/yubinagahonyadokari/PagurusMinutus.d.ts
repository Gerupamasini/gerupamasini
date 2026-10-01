import type { Group, Object3D, Vector3 } from 'three';

export interface CrabEnv {
  groundAt(x: number, z: number): number;
  waterAt?(x: number, z: number): number;
  sample?: { depth?: number; substrate?: string; exposed?: boolean; distToWater?: number; inPool?: boolean } | null;
  player?: Vector3 | null;
  alert?: number;
  tank?: boolean;
  sunElevation?: number;
  season?: string;
  frame?: number;
  lodDistance?: number;
  locked?: boolean;
  closeup?: boolean;
}

export interface ShellSpec {
  species: string;
  size_mm?: number;
  damage?: number;
  fouling?: number;
  seed?: number;
}

export interface CrabState {
  pos: Vector3;
  heading: number;
  home: Vector3;
  internal: Record<string, number>;
  shell: ShellSpec | null;
}

export class Shell {
  constructor(o: ShellSpec & { lod?: number });
  key: string;
  object3D: Group;
  props: Record<string, unknown> & { ja: string; mass_g: number; size_mm: number };
}

export class PagurusWorld {
  static of(obj: Object3D): PagurusWorld;
  register(crab: HermitCrab): void;
  unregister(crab: HermitCrab): void;
  autoSpawn: boolean;
}

export const STATE: Record<string, string>;
export const LOD_TIERS: { id: number; name: string }[];

export class HermitCrab {
  constructor(opts?: { seed?: number; sex?: 'm' | 'f'; shieldLength_mm?: number; shell?: ShellSpec | Shell; lod?: number; id?: string });
  readonly id: string;
  readonly root: Group;
  readonly SL: number;
  readonly shieldLength_mm: number;
  shell: Shell | null;
  world: PagurusWorld | null;
  lod: number;
  debugEnabled: boolean;
  active: boolean;
  home: Vector3;
  loco: { position: Vector3; heading: number; speed: number; initialised: boolean };
  rig: { root: Object3D };
  behavior: {
    state: string;
    sub: string;
    internal: { hunger: number; fear: number; curiosity: number; energy: number; shellSatisfaction: number; activity: number };
    suggest(intent: { kind: string; target?: Vector3; from?: Vector3; urgency?: number; seconds?: number; param?: string }, playerPos?: Vector3): void;
    snapshot(): Record<string, unknown> & { state: string; sub: string };
  };
  placeAt(pos: Vector3, heading: number, env: CrabEnv): void;
  update(dt: number, env: CrabEnv): void;
  setLOD(i: number): void;
  adoptMaterials(): void;
  chainForeignMaterials(from: HermitCrab): void;
  onEvent(cb: (id: string, crab: HermitCrab) => void): () => void;
  saveState(): CrabState;
  restoreState(s: CrabState, env: CrabEnv): void;
  dispose(): void;
}

export function createPreviewCrab(opts?: { seed?: number; sex?: 'm' | 'f'; shieldLength_mm?: number; shell?: ShellSpec; lod?: number }): HermitCrab;
