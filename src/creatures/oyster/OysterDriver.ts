import { Group, Vector3, Vector4, type Object3D, type WebGLRenderer } from 'three';
import type { Individual } from '../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent } from '../drivers/Driver';
import type { PlaceholderModel } from '../models/placeholders';
import { hashInts } from '../../core/Rng';
import { OysterAtlas } from './bake';
import { playerStimulus, type OysterState } from './behavior';
import { makeGenome, seedsFrom, type AgeClass } from './genome';
import { DETAIL, OysterShape } from './geometry';
import { OysterIndividual } from './OysterIndividual';
import type { ReefOysterInfo } from './OysterReef';

/** the 図鑑's behaviour ids for the oyster's states */
export const OYSTER_BEHAVIOR_ID: Record<OysterState, string> = {
  FILTER_FEEDING: 'filter_feeding', SUBMERGED: 'submerged', LOW_TIDE_CLOSED: 'low_tide_closed', THREAT_CLOSE: 'threat_close', CLOSED: 'closed',
};

/** distances from the player (m) for the three LODs of a loose individual */
const LOD0_DIST = 0.6;
const LOD1_DIST = 2.5;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function ageFor(length_mm: number): AgeClass {
  return length_mm <= 26 ? 'spat' : length_mm <= 60 ? 'juvenile' : length_mm <= 115 ? 'adult' : 'old';
}

/**
 * マガキ driver: one oyster of the reef built in full for observation. The reef hands over the oyster's seed, age,
 * crowding, place and host plane (ReefOysterInfo) before the individual is spawned; the driver rebuilds the genome
 * (the same one the reef drew the instance from) at hero detail, sets it on its stone and runs the five-state
 * behaviour, reporting each state the 図鑑 can record.
 */
export class OysterDriver implements Driver {
  /** the field's shell atlas (set by the world once the reef is built); nothing can be shown without it */
  static atlas: OysterAtlas | null = null;
  /** reef oysters waiting to be built in full, by individual id */
  static readonly pending = new Map<string, ReefOysterInfo>();

  private oi: OysterIndividual | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private lastState: OysterState | null = null;
  private lastWater = NaN;
  private readonly lastPlayer = new Vector3(NaN, 0, 0);
  private playerSpeed = 0;
  private readonly listeners = new Set<(e: BehaviorEvent) => void>();
  private readonly tmp = new Vector3();
  readonly busy = false;

  /** an empty holder; the oyster is built once the individual (seed, place) is known */
  static makeModel(): PlaceholderModel {
    const root = new Group();
    root.name = 'Oyster';
    return { root, parts: {}, length: 0.1 };
  }

  /**
   * A representative adult for the 図鑑 turntable, lying cup-down with the lid a little open. The preview renders on
   * its own renderer, so the atlas is baked there (or the field's is used when none is given).
   */
  static makePreview(seed = 0.42, renderer?: WebGLRenderer): Object3D {
    const root = new Group();
    root.name = 'OysterPreview';
    let atlas = OysterDriver.atlas;
    if (renderer) { try { atlas = OysterAtlas.shared(renderer, 'mid'); } catch (e) { console.warn('[oysters] preview atlas', e); } }
    if (!atlas) return root;
    const genome = makeGenome(seedsFrom(hashInts(Math.floor(seed * 65536), 0x05e7)), { age: 'adult', crowding: 0.35 });
    const shape = new OysterShape(genome);
    const oi = new OysterIndividual({ genome, shape, atlas, lod: 0, lod0Detail: DETAIL.hero, state: 'FILTER_FEEDING' });
    // the cup's lowest point on the bench, the lower valve flattened a little into it
    let minY = 0;
    const q = new Vector3();
    for (let i = 1; i < 20; i++) for (let j = 2; j < 10; j++) minY = Math.min(minY, shape.base(i / 20, j / 10, false, q).y);
    const embed = genome.embed * genome.length * 0.6;
    oi.setPlane(new Vector4(0, 1, 0, minY + embed));
    oi.root.position.y = -(minY + embed);
    oi.root.rotation.y = -0.5;
    oi.setGape(genome.gapeMax * 0.8);
    root.add(oi.root);
    root.userData.disposer = () => oi.dispose();
    return root;
  }

  attach(root: Object3D, individual: Individual): void {
    this.root = root;
    this.ind = individual;
    const info = OysterDriver.pending.get(individual.id) ?? null;
    OysterDriver.pending.delete(individual.id);
    const atlas = OysterDriver.atlas;
    if (!atlas) return;
    const plane = info?.plane.clone() ?? new Vector4();
    let genome;
    if (info) {
      genome = makeGenome(seedsFrom(info.seed), { age: info.age, dead: info.dead, crowding: info.crowding, length: info.length });
      // the instance is a prototype rescaled; the full oyster has its own length, so only the place and turn are kept
      const scale = new Vector3();
      info.matrix.decompose(root.position, root.quaternion, scale);
      root.scale.setScalar(1);
      plane.w *= scale.x;
    } else {
      genome = makeGenome(seedsFrom(hashString(individual.id)), { age: ageFor(individual.length_mm), crowding: 0.45, length: individual.length_mm / 1000 });
      root.position.copy(individual.pos);
      root.rotation.set(0, individual.heading, 0);
    }
    const oi = new OysterIndividual({ genome, atlas, lod: 0, lod0Detail: DETAIL.hero, plane, state: info?.state ?? undefined });
    root.add(oi.root);
    root.updateMatrixWorld(true);
    this.oi = oi;
    individual.pos.copy(this.anchor());
    this.lastState = genome.dead ? null : oi.state;
    if (this.lastState) this.emit(OYSTER_BEHAVIOR_ID[this.lastState]);
  }

  detach(): void {
    this.oi?.dispose();
    this.oi = null;
    this.root = null;
  }

  setIntent(_intent: Intent): void {
    // cemented to its stone: the tree's rest is all it ever does
  }

  update(dt: number, ctx: DriverContext): void {
    const oi = this.oi, ind = this.ind;
    if (!oi || !ind) return;
    const sdt = Math.min(0.1, dt * ctx.simScale);
    const c = this.anchor();
    const water = ctx.floor.waterAt(c.x, c.z);
    const dist = c.distanceTo(ctx.player);
    if (dt > 0 && Number.isFinite(this.lastPlayer.x)) {
      const sp = Math.hypot(ctx.player.x - this.lastPlayer.x, ctx.player.z - this.lastPlayer.z) / dt;
      this.playerSpeed += (Math.min(sp, 10) - this.playerSpeed) * Math.min(1, dt * 4);
    }
    this.lastPlayer.copy(ctx.player);
    const shock = Number.isFinite(this.lastWater) && Math.abs(water - this.lastWater) > 0.08 && water > c.y;
    this.lastWater = water;
    oi.update(sdt, { depth: water - c.y, stimulus: playerStimulus(dist, this.playerSpeed, this.playerSpeed > 2.2), shock });
    oi.setLod(ctx.locked || dist < LOD0_DIST ? 0 : dist < LOD1_DIST ? 1 : 2);
    if (!oi.genome.dead && oi.state !== this.lastState) {
      this.lastState = oi.state;
      this.emit(OYSTER_BEHAVIOR_ID[oi.state]);
    }
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

  /** camera anchor: the middle of the shell */
  anchor(): Vector3 {
    if (this.root && this.oi) return this.tmp.set(0, 0, this.oi.genome.length * 0.45).applyMatrix4(this.root.matrixWorld);
    return this.ind ? this.tmp.copy(this.ind.pos) : this.tmp.set(0, 0, 0);
  }

  debugLabel(): string {
    return this.oi ? `${this.oi.state} 開${(this.oi.gape * 1000).toFixed(0)}` : '';
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
