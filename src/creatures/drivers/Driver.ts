import type { Color, IUniform, Object3D, Vector3 } from 'three';
import type { Individual } from '../Individual';
import type { HabitatSample } from '../../world/Habitat';
import type { AmamoUniforms } from '../../world/amamo/kit';
import type { ShootSpec } from '../../world/amamo/AmamoPatch';
import type { BodyMode } from '../physics/contacts';
import type { WaterMotion } from '../physics/water';

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

/** A piece of carrion on the bed, as the scavengers find it. */
export interface Food {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** its radius on the bed (m) and the meat left on it (0..1) */
  readonly r: number;
  readonly meat: number;
}

/** The carrion of the flat as the scavengers smell it (the アラムシロ's CarrionField). */
export interface ScentProbe {
  sourcesNear(x: number, z: number, r: number): readonly Food[];
  /** a place at the food (an angle round it), or null when every place is taken */
  claim(food: Food, who: string, angle: number): number | null;
  release(food: Food, who: string): void;
  /** eat a share of the meat (of the whole piece) */
  eat(food: Food, share: number): void;
}

/** What drivers need from the world: ground height and water surface at a point. */
export interface Floor {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
  sampleAt?(x: number, z: number): HabitatSample | null;
  /** the sediment's colour as it is drawn here (linear albedo, before the light); null where there is none (a bare
   *  tank). For what takes on the colour of the bottom: sand over a buried flatfish, a fish matching its background */
  colorAt?(x: number, z: number, out: Color): Color | null;
  /** a bed drawn by the tank's sand shader (BED_SAND_GLSL): its uniforms, the world position of its frame's origin
   *  and the silt in it, so that sand over an animal can be drawn grain for grain as the bed round it */
  bed?: { uniforms: Record<string, IUniform>; origin: Vector3; siltAt(x: number, z: number): number } | null;
  /** the eelgrass meadow, on a flat that has one */
  meadow?: MeadowProbe | null;
  /** the carrion lying about, for the scavengers */
  scent?: ScentProbe | null;
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
  /** how the water moves (the swell, an open shore's surf), for what swims in it; absent: still water (a tank, the case) */
  water?: WaterMotion | null;
}

/** How an animal's body meets the others this frame (the physics' contacts, physics/contacts.ts). */
export interface BodyState {
  mode: BodyMode;
  /** its heading (rad; forward = (sin, cos)) */
  heading: number;
  /** the height of its underside (m) */
  y: number;
}

export interface Driver {
  /** Burrowers can be netted only while their shell/body is exposed above the ground. */
  canNetCapture?(): boolean;
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
  /** its body as the contacts see it (absent: on the bed at the individual's place, facing its heading) */
  body?(): BodyState;
  /**
   * Move the animal by (dx, dz) where it is, carrying on with whatever it was doing: a push from another body. Its own
   * position and the individual's move at once, its drawing at its next update. (Absent: it is never pushed; the
   * others give way to it.)
   */
  nudge?(dx: number, dz: number): void;
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
