import type { Object3D, Vector3 } from 'three';
import type { Individual } from '../Individual';
import type { HabitatSample } from '../../world/Habitat';
import type { AmamoUniforms } from '../../world/amamo/kit';
import type { ShootSpec } from '../../world/amamo/AmamoPatch';

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

/** The eelgrass of the flat as the animals living in it see it (the AmamoMeadow; world/amamo/flow.ts moves a shoot on the CPU). */
export interface MeadowProbe {
  readonly kit: { readonly uniforms: AmamoUniforms };
  /** eelgrass cover 0..1 */
  coverAt(x: number, z: number): number;
  /** grown shoots near a point, nearest first (none where the camera is too far for the patch to be grown) */
  shootsNear(x: number, z: number, r: number, max?: number): ShootSpec[];
}

/** What drivers need from the world: ground height and water surface at a point. */
export interface Floor {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
  sampleAt?(x: number, z: number): HabitatSample | null;
  /** the eelgrass meadow, on a flat that has one */
  meadow?: MeadowProbe | null;
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
  /** the water this animal must stay in (metres of depth); drivers that fence their own motion use it */
  minDepth?: number;
  /** false where there is nothing to dig into (an acrylic case, a bare tank): burrowers stay on the surface */
  canBurrow?: boolean;
}

export interface Driver {
  /** attach to a model root placed in the scene; sets up the rig and the individual's scale */
  attach(root: Object3D, individual: Individual, extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[]): void;
  detach(): void;
  setIntent(intent: Intent): void;
  /** true while the current intent is still being executed */
  readonly busy: boolean;
  update(dt: number, ctx: DriverContext): void;
  /**
   * Put the animal at (x, z), facing `heading` when given, and drop whatever move took it there: the water's edge
   * (an aquatic animal is never left on the sand).
   */
  holdAt?(x: number, z: number, heading?: number): void;
  onEvent(cb: (e: BehaviorEvent) => void): () => void;
  /** anchor point for cameras (world) */
  anchor(): Vector3;
  /** mouth / gill opening for hero interior materials (species that have them) */
  readonly openings?: { mouth: number; gill: number };
  /** short state text appended to the debug marker (species with an internal behaviour model) */
  debugLabel?(): string;
  dispose(): void;
}

export type DriverFactory = () => Driver;
