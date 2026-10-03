import { Color, Sphere, Vector3, type Mesh, type Object3D, type SkinnedMesh, type Texture, type Bone } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, DriverModelInfo, Intent } from '../../drivers/Driver';
import type { HabitatSample } from '../../../world/Habitat';
import { MUD_COLORS } from '../../../world/MudFx';
import { Motor, type TobiRig } from './Motor';
import { Mind, type MindWorld, type TobiState } from './Mind';
import { TobihazeMaterials, type TobiTier } from './TobihazeMaterial';
import { ContactShadow } from './ContactShadow';

/**
 * トビハゼ (Periophthalmus modestus): an amphibious goby that lives on the mud as much as in the water. The brain's
 * intents go to the Mind (what to do, where), which drives the Motor (how the body moves); the wet-skin materials
 * follow the animal's moisture, its mud coat and the water line, and a contact shadow ties it to the mud.
 */
export class TobihazeDriver implements Driver {
  private motor: Motor | null = null;
  private mind: Mind | null = null;
  private mats: TobihazeMaterials | null = null;
  private shadow: ContactShadow | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private placed = false;
  private readonly listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  private readonly nrm = new Vector3();
  private readonly mudColor = new Color();
  private sampleAt: HabitatSample | null = null;
  private sampleAcc = 1;
  private pendingIntent: Intent | null = null;
  private carry: { moisture: number; mud: number; hidden: boolean } | null = null;

  /** the behavioural state (for the debug HUD and tests) */
  get state(): TobiState { return this.mind?.state ?? 'IDLE'; }
  get busy(): boolean { return !!this.pendingIntent || (this.mind?.busy ?? false); }
  get debug(): Record<string, unknown> {
    const m = this.motor;
    return m ? { state: this.state, task: this.mind?.taskKind, gait: m.gait, medium: m.medium, depth: +m.depth.toFixed(4), moisture: +m.moisture.toFixed(2), mud: +m.mud.toFixed(2), hidden: m.hidden } : {};
  }

  attach(root: Object3D, individual: Individual, extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[], model?: DriverModelInfo): void {
    const rig = (extras.tobihazeRig ?? (root.getObjectByName('TobihazeRoot')?.userData.tobihazeRig)) as TobiRig | undefined;
    if (!rig) throw new Error('tobihaze: rig data missing in glTF extras');
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / individual.species.model.modelLength_mm;
    const prev = this.motor;
    if (prev) this.carry = { moisture: prev.moisture, mud: prev.mud, hidden: prev.gait === 'hidden' };
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.updateMatrixWorld(true);
    const rng = individual.rng;
    const motor = new Motor(root, bones as Record<string, Bone>, meshes as Mesh[], rig, scale, individual.heading, () => rng.next());
    motor.onEvent = (id) => this.emit(id);
    this.motor = motor;
    if (this.mind) this.mind.m = motor;
    else {
      this.mind = new Mind(motor, individual.id, individual.rng.int(1, 1 << 30), () => rng.next());
      this.mind.onEvent = (id) => this.emit(id);
    }
    // per-individual wet-skin materials
    const tier: TobiTier = model?.tier ?? 'lod1';
    this.mats = new TobihazeMaterials(tier);
    let data: Promise<Texture | null> | null = null;
    const skinMesh = (meshes as Mesh[]).find((m) => ((Array.isArray(m.material) ? m.material[0] : m.material)?.userData?.tobihaze as { role?: string } | undefined)?.role === 'skin');
    const skinMat = skinMesh ? (Array.isArray(skinMesh.material) ? skinMesh.material[0] : skinMesh.material) : null;
    const di = (skinMat?.userData?.tobihaze as { dataTexture?: number } | undefined)?.dataTexture;
    if (model && di !== undefined) data = model.parser.getDependency('texture', di) as Promise<Texture | null>;
    this.mats.apply(meshes as Mesh[], data);
    for (const m of meshes as Mesh[]) {
      if ((m as SkinnedMesh).isSkinnedMesh) (m as SkinnedMesh).boundingSphere = new Sphere(new Vector3(0, 0.004, -0.02), 0.075);
      m.castShadow = false;
    }
    if (root.parent) this.shadow = new ContactShadow(root.parent);
    this.placed = false;
  }

  detach(): void {
    this.mats?.dispose();
    this.mats = null;
    this.shadow?.dispose();
    this.shadow = null;
    this.root = null;
  }

  setIntent(intent: Intent): void {
    if (!this.mind || !this.placed) { this.pendingIntent = intent; return; }
    this.pendingIntent = intent;
  }

  update(dt: number, ctx: DriverContext): void {
    const motor = this.motor, mind = this.mind, ind = this.ind;
    if (!motor || !mind || !ind || !this.root) return;
    const floor = ctx.floor;
    const nowSec = ctx.nowMs / 1000;
    // habitat at the animal (coarse, refreshed twice a second)
    this.sampleAcc += dt;
    if (this.sampleAcc > 0.5 || !this.sampleAt) { this.sampleAcc = 0; this.sampleAt = floor.sampleAt?.(motor.pos.x, motor.pos.z) ?? null; }
    const s = this.sampleAt;
    const sub = s?.substrate ?? 'mud';
    const soft = sub === 'mud' ? 1 : sub === 'muddy_sand' ? 0.75 : sub === 'channel' ? 0.9 : sub === 'sand' ? 0.3 : 0.15;
    const sun = ctx.world?.sunUp ?? 0.6;
    const world: MindWorld = {
      ground: (x, z) => floor.heightAt(x, z),
      water: (x, z) => floor.waterAt(x, z),
      fx: ctx.world?.fx ?? null,
      wetGround: Math.max(s?.wetness ?? 0.8, motor.depth > -0.01 ? 1 : 0),
      soft,
      sand: sub === 'sand' || sub === 'gravel',
      drying: Math.min(1, 0.25 + 0.75 * sun) * (1 - 0.5 * (s?.wetness ?? 0.5)),
      detail: ind.lod <= 1 || !!ctx.locked,
      sample: (x, z) => floor.sampleAt?.(x, z) ?? null,
      burrows: ctx.world?.burrows ?? null,
      player: ctx.player,
      nowSec,
    };
    if (!this.placed) {
      this.placed = true;
      motor.place(ind.pos.x, ind.pos.z, ind.heading, world);
      if (this.carry) { motor.moisture = this.carry.moisture; motor.mud = this.carry.mud; this.carry = null; }
    }
    if (this.pendingIntent) { mind.setIntent(this.pendingIntent, world); this.pendingIntent = null; }
    const sdt = dt * ctx.simScale;
    // the brain's alarm reaches the eyes and the posture
    motor.attend.alert = Math.max(motor.attend.alert * Math.exp(-sdt * 0.3), ind.alert);
    if (ind.alert > 0.3) motor.attend.threat = ctx.player;
    mind.update(sdt, world);
    motor.update(sdt, world);
    const b = ctx.bounds;
    if (b) {
      motor.pos.x = Math.max(b.minX, Math.min(b.maxX, motor.pos.x));
      motor.pos.z = Math.max(b.minZ, Math.min(b.maxZ, motor.pos.z));
    }
    this.mudColor.copy(MUD_COLORS[sub] ?? MUD_COLORS.mud);
    this.mats?.update({ wet: motor.moisture, mud: motor.mud, waterY: motor.waterY, mudColor: this.mudColor });
    this.shadow?.update(motor, world.ground, (x, z, out) => this.normalAt(floor, x, z, out), world.detail);
    ind.pos.set(motor.pos.x, motor.pos.y, motor.pos.z);
    ind.heading = motor.heading;
    ind.moisture = motor.moisture;
    ind.hidden = motor.hidden;
  }

  private normalAt(floor: DriverContext['floor'], x: number, z: number, out: Vector3): Vector3 {
    const e = 0.02;
    const hx = floor.heightAt(x + e, z) - floor.heightAt(x - e, z);
    const hz = floor.heightAt(x, z + e) - floor.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
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

  anchor(): Vector3 {
    const m = this.motor;
    if (m && this.root) {
      // the head end, a little above the body (cameras look at the eyes and pectorals)
      const f = this.nrm.set(Math.sin(m.heading), 0, Math.cos(m.heading));
      return this.tmp.set(m.pos.x - f.x * 0.12 * m.L, m.pos.y + 0.06 * m.L, m.pos.z - f.z * 0.12 * m.L);
    }
    return this.ind ? this.ind.pos : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
    this.motor = null;
    this.mind = null;
  }
}
