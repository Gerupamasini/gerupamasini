import type { Object3D, Vector3 } from 'three';
import type { Individual } from '../Individual';
import type { HabitatSample } from '../../world/Habitat';

export type IntentKind = 'rest' | 'wander' | 'moveTo' | 'flee' | 'forage' | 'display' | 'burrow' | 'special';

export interface Intent {
  id: number;
  kind: IntentKind;
  target?: Vector3;
  from?: Vector3;
  urgency: number;
  param?: string;
  /** seconds the brain expects the intent to last (0 = until the driver reports done) */
  seconds: number;
}

export interface BehaviorEvent {
  individualId: string;
  behaviorId: string;
  t: number;
}

/** What drivers need from the world: ground height and water surface at a point. */
export interface Floor {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
  sampleAt?(x: number, z: number): HabitatSample | null;
}

export interface DriverContext {
  /** keep the animal inside this box (the home tank) */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  floor: Floor;
  player: Vector3;
  simScale: number;
  nowMs: number;
  /** the observed / locked animal: keep full detail whatever the distance to the player */
  locked?: boolean;
}

export interface Driver {
  /** attach to a model root placed in the scene; sets up the rig and the individual's scale */
  attach(root: Object3D, individual: Individual, extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[]): void;
  detach(): void;
  setIntent(intent: Intent): void;
  /** true while the current intent is still being executed */
  readonly busy: boolean;
  update(dt: number, ctx: DriverContext): void;
  onEvent(cb: (e: BehaviorEvent) => void): () => void;
  /** anchor point for cameras (world) */
  anchor(): Vector3;
  /** mouth / gill opening for hero interior materials (species that have them) */
  readonly openings?: { mouth: number; gill: number };
  /** out of sight (e.g. down its burrow): not pickable, not catchable */
  readonly hidden?: boolean;
  /** wants an update every frame whatever its distance tier (procedural gaits that plant feet) */
  readonly everyFrame?: boolean;
  /** a line of state for the debug markers */
  readonly debugText?: string;
  dispose(): void;
}

export type DriverFactory = () => Driver;
