import { Quaternion, Sphere, Vector3, type Box3, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, BodyState, Driver, DriverContext, Intent } from '../../drivers/Driver';
import { createTobihaze, type TobiApi, type TobiEnv, type TobiFrame, type TobiIntent } from './behavior';
import { applyPose, bindPose, createPose, crawlWelds, poseInto, poseRig, pointOf, worldOf, type PoseBinding, type PoseOut, type PoseRig, type PoseWorld } from './pose.js';

/** Within this distance (m) of the player a crawling, hopping or striking トビハゼ is updated every frame (its welded
 *  fins and its flight stay smooth); farther, at most a few pixels long, every second frame does. */
const EVERY_FRAME_M = 10;

/**
 * What the materials need of one individual (material.ts reads it from the meshes' userData.tobihazeLook, the same
 * object on every mesh of the view, updated in place each frame): the skin's water film and mud, the colour states, the
 * pupil (behavior.ts TobiFrame.skin, .colour, .eyes.pupil).
 */
export interface TobihazeLook {
  /** 0 dry … 1 just out of the water */
  wet: number;
  mud: number;
  /** the excitement bars, the darkening of a fleeing fish (0..1) */
  bars: number;
  dark: number;
  /** 0 the slit of the light … 1 round and wide (water, dark) */
  pupil: number;
  /** under water (no film to dry) */
  submerged: boolean;
  /** the water's surface at the fish (m, the frame the root sits in: the flat's, the tank's, the case's), where the film
   *  is cut: a fish in the shallows glistens above the waterline only */
  waterY?: number;
  /** the individual (its tint and its pupil's colour, the same fish on the flat, in the case and in the tank) */
  id?: string;
  variation?: { tint?: { hueDeg?: [number, number]; sat?: [number, number]; val?: [number, number] } };
}

/** Debug: measure the welds through the skeleton on every individual (the observed one is always measured). */
export const TOBIHAZE_DEBUG = { welds: false };

/**
 * トビハゼ (Periophthalmus modestus): the mudskipper of the upper flat. Its behaviour (behavior.ts: the eleven states,
 * the crawl's welded crutches, the hops, the swimming, the turret eyes) runs without rendering; this driver feeds it the
 * brain's intents and the world (the ground, the water, the habitat, the walls of a tank), puts the model's root where
 * the behaviour says (the frame's root is final: the behaviour seats the body on the mud only at moments no welded
 * contact moves), and poses the tier's skeleton, Eye nodes and blend shapes through the pose module (pose.js) from the
 * GLB's own extras. The behaviour lives across tier changes (attach gives it the new tier's extras); every tier keeps
 * its own rig, bones and blend shapes bound by name. Welded contacts are checked through the skeleton for the observed
 * fish (debugLabel shows the worst drift).
 */
export class TobihazeDriver implements Driver {
  private beh: TobiApi | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private rig: PoseRig | null = null;
  private bound: PoseBinding | null = null;
  private pose: PoseOut | null = null;
  private world: PoseWorld | null = null;
  private ctx: DriverContext | null = null;
  private pending: Intent | null = null;
  private frame: TobiFrame | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly tmpRoot = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly bodyState: BodyState = { mode: 'bed', heading: 0, y: 0 };
  private readonly player = { x: 0, y: 0, z: 0 };
  private readonly env: TobiEnv;
  /** the individual's look for the materials (meshes' userData.tobihazeLook) */
  readonly look: TobihazeLook = { wet: 1, mud: 0, bars: 0, dark: 0, pupil: 0, submerged: false };
  /** the worst drift (mm, world) of a welded contact carried through the skeleton over the last second (measured on the
   *  observed fish, or on all with TOBIHAZE_DEBUG.welds) */
  weldDriftMM = 0;
  private weldT = 0;
  private weldWorst = 0;
  private welds: ReturnType<typeof crawlWelds> | null = null;
  everyFrame = false;
  busy = false;

  constructor() {
    const floor = () => this.ctx?.floor;
    this.env = {
      groundY: (x, z) => floor()?.heightAt(x, z) ?? 0,
      waterY: (x, z) => floor()?.waterAt(x, z) ?? -1e3,
      sample: (x, z) => floor()?.sampleAt?.(x, z) ?? null,
      bounds: null,
      canBurrow: true,
      player: null,
      alert: 0,
    };
  }

  attach(root: Object3D, individual: Individual, extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[]): void {
    this.root = root;
    this.ind = individual;
    this.look.id = individual.id;
    this.look.variation = individual.species.variation;
    let rig: PoseRig;
    try { rig = poseRig(extras); } catch (err) { console.warn('[tobihaze] the model carries no rig extras; left in its bind pose', err); return; }
    this.rig = rig;
    this.pose = createPose(rig);
    this.world = { q: new Float64Array(rig.joints.length * 4), p: new Float64Array(rig.joints.length * 3) };
    this.bound = bindPose(rig, { bones, meshes, root });
    if (this.bound.missing.length) console.warn(`[tobihaze] ${rig.tier}: no bones for ${this.bound.missing.join(', ')}`);
    // (a new tier's welds are measured afresh: the last tier's worst would show for a second on this one)
    this.welds = null; this.weldWorst = 0; this.weldT = 0; this.weldDriftMM = 0;
    for (const m of meshes) {
      // the materials read the individual's look here (material.ts)
      m.userData.tobihazeLook = this.look;
      const mesh = m as Mesh;
      if ((mesh as SkinnedMesh).isSkinnedMesh) {
        // a generous sphere for the culling (the skinned bounds move with the pose: a stride of the crawl, the tail
        // curled alongside in a hop), centred on the part itself so the blended fins sort by their own place
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox as Box3;
        (mesh as SkinnedMesh).boundingSphere = new Sphere(bb.getCenter(new Vector3()), bb.getSize(this.tmp).length() / 2 + 0.03);
      }
    }
    root.scale.setScalar(individual.length_mm / individual.species.model.modelLength_mm);
    if (!this.beh) {
      // (its own random stream: the same individual behaves alike on every tier and device)
      const rng = individual.rng;
      this.beh = createTobihaze({
        rng: () => rng.next(), length: individual.length_mm / 1000,
        start: { x: individual.pos.x, z: individual.pos.z, heading: individual.heading },
        home: { x: individual.home.x, z: individual.home.z }, extras,
      });
    } else this.beh.setRig(extras);
    // the pose at once (the room's tanks update once and never again; a tier change shows the frame it left)
    if (this.frame) this.show(this.frame);
    else if (this.ctx) this.update(0, this.ctx);
  }

  detach(): void {
    this.root = null;
    this.bound = null;
    this.pose = null;
    this.rig = null;
    this.welds = null;
  }

  /** the mouth and the gill slits (HeroInstance.update's interior; トビハゼ has no goby hero) */
  get openings(): { mouth: number; gill: number } {
    const h = this.frame?.head;
    return { mouth: h?.gape ?? 0, gill: h?.vent ?? 0 };
  }

  /** down its burrow: not pickable, not catchable */
  get hidden(): boolean {
    return this.frame?.hidden ?? false;
  }

  /** the net takes it out of its burrow only (a peeking head ducks back in) */
  canNetCapture(): boolean {
    return this.beh ? this.beh.catchable : true;
  }

  setIntent(intent: Intent): void {
    const b = this.beh;
    if (!b || !this.ctx) { this.pending = intent; this.busy = true; return; }
    const i: TobiIntent = {
      kind: intent.kind, urgency: intent.urgency, param: intent.param, seconds: intent.seconds,
      target: intent.target ? { x: intent.target.x, z: intent.target.z } : null,
      from: intent.from ? { x: intent.from.x, z: intent.from.z } : null,
    };
    b.setIntent(i);
    this.busy = true;
  }

  update(dt: number, ctx: DriverContext): void {
    const b = this.beh, ind = this.ind;
    if (!b || !ind) return;
    this.ctx = ctx;
    if (this.pending) { const p = this.pending; this.pending = null; this.setIntent(p); }
    const env = this.env;
    env.bounds = ctx.bounds ?? null;
    env.canBurrow = ctx.canBurrow !== false;
    this.player.x = ctx.player.x; this.player.y = ctx.player.y; this.player.z = ctx.player.z;
    env.player = this.player;
    env.alert = ind.alert;
    const f = b.update(Math.max(0, dt) * ctx.simScale, env);
    this.frame = f;
    this.show(f);
    // the individual where its body is (the brain samples the habitat there; the contacts and picking read it)
    ind.pos.set(f.root.x, f.root.y, f.root.z);
    ind.heading = f.root.heading;
    for (const id of f.events) this.emit(id);
    this.busy = b.busy;
    const dx = f.root.x - ctx.player.x, dz = f.root.z - ctx.player.z;
    this.everyFrame = b.wantsEveryFrame && (!!ctx.locked || dx * dx + dz * dz < EVERY_FRAME_M * EVERY_FRAME_M);
    const L = this.look;
    L.wet = f.skin.wet; L.mud = f.skin.mud; L.bars = f.colour.bars; L.dark = f.colour.dark; L.pupil = f.eyes.pupil; L.submerged = f.medium === 'water';
    L.waterY = ctx.floor.waterAt(f.root.x, f.root.z);
    if (ctx.locked || TOBIHAZE_DEBUG.welds) this.checkWelds(f, dt * ctx.simScale);
  }

  /** the frame on the model: the root as the behaviour placed it, the tier's joints, Eye nodes and blend shapes */
  private show(f: TobiFrame): void {
    const root = this.root, rig = this.rig, pose = this.pose, bound = this.bound;
    if (!root || !rig || !pose || !bound) return;
    root.position.set(f.root.x, f.root.y, f.root.z);
    root.quaternion.set(f.root.quat[0], f.root.quat[1], f.root.quat[2], f.root.quat[3]);
    root.scale.setScalar(f.scale);
    // (down its burrow nothing of it shows)
    root.visible = !f.hidden;
    poseInto(rig, f, pose);
    applyPose(bound, pose);
  }

  /**
   * Each contact the behaviour says is welded, carried through this tier's skeleton (pose.js forward kinematics, the
   * root as placed) against the place the behaviour gives it: the worst distance over a second, in mm. The crawl's
   * crutches are the cycle's bearing tips, the prop's soles the land state's, the cup the pelvic fin's.
   */
  private checkWelds(f: TobiFrame, dt: number): void {
    const rig = this.rig, pose = this.pose, W = this.world;
    if (!rig || !pose || !W) return;
    worldOf(rig, pose, W);
    // (the cup's place on the pelvic fin is the pose's own: the prone rest presses another part of it than the prop)
    const land = rig.contacts.land ?? [], cups = (f.pose === 'rest' && !f.stateBlend ? rig.contacts.rest : null) ?? land;
    const crawl = f.crawl && f.pose === 'crawl' && !f.stateBlend ? (this.welds ??= crawlWelds(rig)) : null;
    let seg = crawl?.segs[0];
    if (crawl && f.crawl) for (const s of crawl.segs) if (f.crawl.phase >= s.from) seg = s;
    const q = f.root.quat, s = f.scale, p = [0, 0, 0];
    for (const c of f.contacts) {
      if (!c.welded) continue;
      // (the behaviour's names: crutchL0 … the crawl's bearing tips by segment, soleL/R the prop's, cup the pelvic fin's)
      let bone: string | undefined, local: number[] | undefined;
      const m = /^(crutch|sole|pec)([LR])(\d*)$/.exec(c.name);
      if (c.name === 'cup' || c.name === 'pelvic') { const pc = cups.find((k) => k.name === 'pelvic'); if (pc) { bone = pc.bone; local = [0, pc.local[1], pc.local[2]]; } }
      else if (m && crawl && seg && m[1] !== 'sole') { const S = m[2] as 'L' | 'R', sg = m[3] ? crawl.segs[Number(m[3])] ?? seg : seg; bone = crawl.bone[S]; local = sg[S]; }
      else if (m) { const sc = land.find((k) => k.name === `sole${m[2]}`); if (sc) { bone = sc.bone; local = sc.local; } }
      if (!bone || !local) continue;
      pointOf(rig, W, bone, local, p);
      // the root's turn and scale, then its place
      const v = this.tmp.set(p[0] * s, p[1] * s, p[2] * s).applyQuaternion(this.tmpQ.set(q[0], q[1], q[2], q[3]));
      const d = Math.hypot(v.x + f.root.x - c.world[0], v.y + f.root.y - c.world[1], v.z + f.root.z - c.world[2]) * 1000;
      if (d > this.weldWorst) this.weldWorst = d;
    }
    this.weldT += dt;
    if (this.weldT >= 1) { this.weldDriftMM = this.weldWorst; this.weldWorst = 0; this.weldT = 0; }
  }

  holdAt(x: number, z: number, heading?: number): void {
    const b = this.beh, ind = this.ind;
    if (!b || !ind) return;
    b.place(x, z, heading);
    ind.pos.x = x; ind.pos.z = z;
    if (heading !== undefined) ind.heading = heading;
    this.busy = false;
  }

  /** on the mud or the bottom; swimming free in the water; out of everyone's way in its burrow or in the air */
  body(): BodyState {
    const f = this.frame, b = this.bodyState;
    if (!f) { b.mode = 'bed'; b.heading = this.ind?.heading ?? 0; b.y = this.ind?.pos.y ?? 0; return b; }
    const pose = f.stateBlend?.to ?? f.pose;
    b.mode = f.hidden ? 'away' : f.hop && (f.hop.stage === 'air' || f.hop.stage === 'push') ? 'away' : f.swim || (f.medium === 'water' && pose === 'swim') ? 'water' : 'bed';
    b.heading = f.root.heading;
    // (the underside: the pose's ground under the model's origin)
    const g = this.rig?.groundM[pose === 'prop' || pose === 'crawl' ? 'land' : pose] ?? this.rig?.groundM.land ?? -0.008;
    b.y = f.root.y + g * f.scale;
    return b;
  }

  /** a push from another body: the behaviour takes it when nothing is welded (the next stride, afloat, in the air) */
  nudge(dx: number, dz: number): void {
    this.beh?.nudge(dx, dz);
  }

  onEvent(cb: (e: BehaviorEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(behaviorId: string): void {
    if (!this.ind) return;
    const e: BehaviorEvent = { individualId: this.ind.id, behaviorId, t: performance.now() };
    for (const l of this.listeners) l(e);
  }

  /** the head and the eyes (what an observer looks at), world */
  anchor(): Vector3 {
    const f = this.frame;
    if (!f) return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
    const q = f.root.quat;
    return this.tmp.set(0, 0.004 * f.scale, 0.014 * f.scale).applyQuaternion(this.tmpQ.set(q[0], q[1], q[2], q[3])).add(this.tmpRoot.set(f.root.x, f.root.y, f.root.z));
  }

  debugLabel(): string {
    const b = this.beh;
    if (!b) return '';
    return `${b.debugLabel()}${this.weldDriftMM > 0 ? ` 溶接${this.weldDriftMM.toFixed(2)}mm` : ''}`;
  }

  /** the behaviour (the viewer and the tests drive it directly) */
  get behaviour(): TobiApi | null { return this.beh; }

  dispose(): void {
    this.detach();
    this.beh = null;
    this.frame = null;
    this.listeners.clear();
  }
}
