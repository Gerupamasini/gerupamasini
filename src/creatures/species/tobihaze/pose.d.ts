/** The poses a frame is built from: the GLB's reference states, the welded prop at a raise, the crawl cycle at a phase. */
export type PoseRef = 'land' | 'reach' | 'rest' | 'water' | 'swim' | 'prop' | 'crawl';

/**
 * What pose.js reads of a frame: the part of behavior.ts's TobiFrame that shapes the body (a TobiFrame is one). Every
 * field but `pose`/`state` may be absent: the pose's own values stand (the clips, the tests).
 */
export interface PoseFrame {
  /** the pose the body is in (the target while blending); without it the state's (IDLE → prop, LAND_CRAWL → crawl …) */
  pose?: PoseRef | string;
  state?: string;
  /** between two poses: e(u) = u²(3 − 2u) on everything, plus sin(πu)·lift on the arms (deg: J_pec depression −lift,
   *  J_pecFin flexion +lift; a number, the extras' { J_pec, J_pecFin } object, or absent: the extras' own transition) */
  stateBlend?: { from: PoseRef | string; to: PoseRef | string; u: number; lift?: number | Record<string, Record<string, number>> } | null;
  /** the prop's raise (deg, 10–25; 15 the land state) */
  prop?: { raise: number } | null;
  /** the crawl cycle's phase (0..1; the stance 0 … duty), this cycle's turn (rad, the recovery's turn about the cup) */
  crawl?: { phase: number; turn?: number; stride?: number; cycleS?: number } | null;
  /** the hop: the J-curl (−1..1, + the tail to the fish's left), the display jump's arch (0..1), its stage */
  hop?: { phase?: number; stage?: 'coil' | 'push' | 'air' | 'land' | string; u?: number; curl?: number; arch?: number } | null;
  /** swimming: the wave's phase (cycles), amplitude (0..1), the turn rate (rad/s, + the heading rising) */
  swim?: { phase: number; amp?: number; speed?: number; turn?: number } | null;
  /** each eye's gaze in the GLB's gaze channels (deg: yaw + the window forward, pitch + up; the rest yaw 16.7, pitch 2.8),
   *  its lift on the turret (m at model scale; 0.03 HL the alert), the blinks (0..1: the eye dropped 0.1 HL at 1) */
  eyes?: { L?: { yaw?: number; pitch?: number; lift?: number }; R?: { yaw?: number; pitch?: number; lift?: number }; blink?: { L?: number; R?: number }; pupil?: number } | null;
  /** 0..1: the gape (gapeHalf at 32/70, gapeFull at 1), the buccal pump, the cheeks (inflatedHalf 0.5, inflated 1), the gill vents */
  head?: { gape?: number; gulp?: number; inflate?: number; vent?: number } | null;
  /** 0 folded … 0.5 the bind (half raised) … 1 erect: the first dorsal, the second dorsal and anal; the caudal 0 the spear … 1 spread */
  fins?: { d1?: number; median?: number; caudal?: number; pect?: string; pelvic?: string } | null;
}

export interface RigJoint {
  name: string;
  i: number;
  parent: number;
  /** the bind pivot (m, the model frame) */
  pivot: [number, number, number];
  order: string[];
  axes: [number, number, number][];
  ranges: [number, number][];
  c0: number;
  t0: number;
}

/** A tier's compiled rig (poseRig). */
export interface PoseRig {
  tier: string;
  /** the head's length and the total length */
  hl: number;
  hlMM: number;
  tlMM: number;
  joints: RigJoint[];
  index: Record<string, number>;
  /** the blend shapes the poses weight, by target name (the meshes' morphTargetDictionary keys) */
  targets: string[];
  targetIndex: Record<string, number>;
  /** { mesh: [target names] } of the tier */
  meshTargets: Record<string, string[]>;
  hasHead: boolean;
  hasEyes: boolean;
  /** the reference states' ground height (m, the model frame) */
  groundM: Record<string, number>;
  crawl: { at: number[]; duty: number; cycleS: number; strideMM: number; lift: number; setDown: number; groundM: number | null; segs: { from: number; L: [number, number, number]; R: [number, number, number] }[] } | null;
  prop: { at: number[] } | null;
  contacts: Record<string, { name: string; kind: string; bone: string; local: [number, number, number] }[]>;
  footprint: { width: number; height: number; core: number; ahead: number } | null;
}

/** A pose's buffers: per joint `q` (x, y, z, w) and `t` (m, added to the rest position), the Eye nodes (L, R), the weights by target. */
export interface PoseOut {
  rig: PoseRig;
  q: Float64Array;
  t: Float64Array;
  eye: Float64Array;
  w: Float64Array;
}

/** The joints' world transforms in the model frame: rotations (4 a joint) and the pivots' places (3 a joint, m). */
export interface PoseWorld { q: Float64Array; p: Float64Array }

/** Objects as three has them (used duck-typed). */
interface PoseObject {
  name: string;
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
  quaternion: { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): unknown };
  children?: PoseObject[];
  /** pose.js keeps each bone's rest here at its first binding (tobihazeRestPosition, tobihazeRestQuaternion) */
  userData?: Record<string, unknown>;
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
  getObjectByName?(name: string): PoseObject | undefined;
}
export interface PoseBinding {
  rig: PoseRig;
  joints: { obj: PoseObject; i: number; rest: [number, number, number] }[];
  eyes: ({ obj: PoseObject; rest: [number, number, number, number] } | null)[];
  morphs: { infl: number[]; idx: number; k: number }[];
  /** rig joints the model has no bone for */
  missing: string[];
}

export const GAPE_HALF: number;
export const CUBIC: { crawl: boolean; prop: boolean };
export const SWIM_WAVE: { a0: number; a1: number; a2: number; wavelength: number; turnBend: number; maxTurnBend: number; caudalFlex: number; paddleDeg: number };
export const WELD_HOLD: { iters: number; damping: number; channels: [string, string][] };

/** The tier's rig from its root extras (LoadedModel.extras, or extras.tobihaze), compiled once per extras object. */
export function poseRig(extras: Record<string, unknown>): PoseRig;
export function createPose(rig: PoseRig): PoseOut;
/** The frame's pose on the rig's tier into `out`. */
export function poseInto(rig: PoseRig, frame: PoseFrame, out?: PoseOut): PoseOut;
/** The contract's form: { q: { J_x: quat }, t: { J_x: [x, y, z] (m) }, eyeNodes: { L, R }, morph: { mesh: { target: w } } }. */
export function poseFor(frame: PoseFrame, extras: Record<string, unknown>, tier?: string): {
  q: Record<string, [number, number, number, number]>;
  t: Record<string, [number, number, number]>;
  eyeNodes: { L: [number, number, number, number]; R: [number, number, number, number] };
  morph: Record<string, Record<string, number>>;
  weights: Record<string, number>;
};
export function bindPose(rig: PoseRig, model: { bones?: Record<string, unknown>; meshes?: unknown[]; root?: unknown }): PoseBinding;
export function applyPose(bind: PoseBinding, pose: PoseOut): void;
export function worldOf(rig: PoseRig, pose: PoseOut, W?: PoseWorld): PoseWorld;
/** a bone-local point (the extras contacts' `local`) in the model frame */
export function pointOf(rig: PoseRig, W: PoseWorld, bone: string, local: ArrayLike<number>, o?: number[]): number[];
export function localOf(rig: PoseRig, W: PoseWorld, bone: string, p: ArrayLike<number>, o?: number[]): number[];
/** the crawl's bearing crutch per side and, per stance segment, its bone-local point and weld spot (model m) */
export function crawlWelds(rig: PoseRig): {
  bone: { L: string; R: string };
  segs: { from: number; to: number; L: number[]; R: number[]; weldL: [number, number, number]; weldR: [number, number, number] }[];
} | null;
