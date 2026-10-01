import { Object3D, Sphere, SkinnedMesh, Vector3, type Mesh } from 'three';
import type { Individual } from '../../Individual';
import type { BehaviorEvent, Driver, DriverContext, Intent, Floor } from '../../drivers/Driver';
import { createBehavior } from './Behavior.js';

type Behavior = ReturnType<typeof createBehavior>;

interface MahazeExtras {
  role: string;
  profile: { n: number; data: number[] };
  fishFrame: { S0: number; Y0: number; SL: number; SEND: number };
}

/**
 * Drives the マハゼ rig with the procedural behaviour model (perch / paddle / orient / dart / glide / yawn) and maps the
 * brain's intents onto it. Works for every LOD because all tiers share the rig.
 */
export class MahazeDriver implements Driver {
  private beh: Behavior | null = null;
  private root: Object3D | null = null;
  private ind: Individual | null = null;
  private floor: Floor | null = null;
  private listeners = new Set<(e: BehaviorEvent) => void>();
  private intent: Intent | null = null;
  private timer = 0;
  private alertUntil = 0;
  private waitingForPerch = false;
  private readonly tmp = new Vector3();
  busy = false;

  attach(root: Object3D, individual: Individual, _extras: Record<string, unknown>, bones: Record<string, Object3D>, meshes: Object3D[]): void {
    this.root = root;
    this.ind = individual;
    const scale = individual.length_mm / individual.species.model.modelLength_mm;
    const body = meshes.find((m) => ((m as Mesh).material as { userData?: { mahaze?: MahazeExtras } })?.userData?.mahaze?.role === 'body') as Mesh | undefined;
    const rigNode = root.getObjectByName('Mahaze_Juvenile');
    const rig = rigNode?.userData.mahazeRig as { axes: Record<string, number[]>; contactY: number; tailContactY: number } | undefined;
    if (!body || !rig) throw new Error('mahaze: rig data missing in glTF extras');
    const bx = (body.material as unknown as { userData: { mahaze: MahazeExtras } }).userData.mahaze;
    // rest-pose bone positions with the root at the origin and unit scale
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.updateMatrixWorld(true);
    for (const b of Object.values(bones)) b.userData.restObj = b.getWorldPosition(new Vector3());
    const F = bx.fishFrame, P = bx.profile;
    const botY = (s: number) => { const k = Math.min(P.n - 1, Math.round((s / F.SEND) * (P.n - 1))); return P.data[k * 6] - P.data[k * 6 + 2]; };
    const rimY = rig.contactY * 1000 + F.Y0;
    const contactDefs: [string, number, number][] = [
      ['J_pelvic', 13.0, rimY], ['J_pelvic', 14.8, rimY], ['J_pelvic', 16.6, rimY],
      ['J_root', 15.5, botY(15.5)], ['J_sp1', 18.5, botY(18.5)], ['J_sp2', 22.5, botY(22.5)], ['J_sp3', 26.5, botY(26.5)],
      ['J_sp4', 30.5, botY(30.5)], ['J_sp5', 34.5, botY(34.5)], ['J_sp6', 38.5, botY(38.5)], ['J_caudal2', 48.0, rig.tailContactY * 1000 + F.Y0],
    ];
    const contacts = contactDefs.map(([bone, s, y]) => ({ bone: bones[bone], p: new Vector3(0, (y - F.Y0) * 0.001, (F.S0 - s) * 0.001).sub(bones[bone].userData.restObj as Vector3) }));
    const finMeshes: Record<string, Mesh> = {};
    for (const m of meshes) {
      const mesh = m as Mesh;
      const role = (mesh.material as { userData?: { mahaze?: { role?: string } } }).userData?.mahaze?.role;
      if (role === 'fin') finMeshes[mesh.name] = mesh;
      if ((mesh as SkinnedMesh).isSkinnedMesh) (mesh as SkinnedMesh).boundingSphere = new Sphere(new Vector3(0, 0.002, 0.012), 0.04);
    }
    root.scale.setScalar(scale);
    this.beh = createBehavior({
      root, bones, finMeshes, axes: rig.axes, contacts, scale,
      floorY: (x: number, z: number) => (this.floor ? this.floor.heightAt(x, z) : 0),
      onEvent: (name: string) => this.emit(name),
    });
    const st = this.beh.state;
    st.pos.set(individual.pos.x, 0, individual.pos.z);
    this.beh.setHeading(individual.heading);
    this.beh.setAuto(false);
    // settle the pose once so the first frame is not a T-pose
    this.beh.update(1 / 60);
  }

  detach(): void {
    this.beh = null;
    this.root = null;
  }

  /** mouth / gill opening for the hero interior material */
  get openings(): { mouth: number; gill: number } {
    const st = this.beh?.state;
    return { mouth: st?.mouthOpen ?? 0, gill: st?.gillOpen ?? 0 };
  }

  setIntent(intent: Intent): void {
    const beh = this.beh, ind = this.ind;
    this.intent = intent;
    this.timer = intent.seconds > 0 ? intent.seconds : 8;
    this.busy = true;
    this.waitingForPerch = false;
    if (!beh || !ind) return;
    const st = beh.state;
    switch (intent.kind) {
      case 'rest':
        beh.setRestFor(intent.seconds);
        break;
      case 'wander':
      case 'moveTo':
      case 'flee': {
        const t = intent.target ?? ind.pos;
        const dx = t.x - st.pos.x, dz = t.z - st.pos.z;
        const dist = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        if (intent.kind === 'flee') { beh.setAlert(1); this.emit('flee'); }
        beh.dart(Math.max(0.03, dist), angle, intent.kind === 'flee');
        this.waitingForPerch = true;
        break;
      }
      case 'forage':
        beh.paddle();
        this.timer = Math.min(this.timer, 2.5);
        break;
      case 'display':
        beh.setAlert(1);
        this.alertUntil = this.timer;
        break;
      case 'special':
        if (intent.param === 'yawn') beh.yawn();
        this.timer = 3;
        break;
      default:
        this.timer = 1;
    }
  }

  update(dt: number, ctx: DriverContext): void {
    const beh = this.beh, ind = this.ind;
    if (!beh || !ind) return;
    this.floor = ctx.floor;
    const sdt = dt * ctx.simScale;
    beh.update(sdt);
    const st = beh.state;
    ind.pos.x = st.pos.x;
    ind.pos.z = st.pos.z;
    ind.pos.y = this.root ? this.root.position.y : ind.pos.y;
    ind.heading = st.heading;
    if (this.busy) {
      this.timer -= sdt;
      if (this.waitingForPerch) {
        if (st.mode === 'perch' && this.timer < 7.5) this.busy = false;
      }
      if (this.timer <= 0) {
        this.busy = false;
        if (this.intent?.kind === 'display') beh.setAlert(0);
      }
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

  anchor(): Vector3 {
    if (this.root) return this.tmp.copy(this.root.position).add(new Vector3(0, 0.004 * this.root.scale.x, 0));
    return this.ind ? this.ind.pos : this.tmp.set(0, 0, 0);
  }

  dispose(): void {
    this.detach();
    this.listeners.clear();
  }
}
