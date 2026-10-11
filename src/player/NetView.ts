import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Quaternion, Scene, Vector3,
} from 'three';
import { CAPTURE_PHASE_SEC, EMPTY_PHASE_SEC, REVEAL_SEC, type CaptureState } from '../systems/Capture';
import type { ToolDef } from '../data/schemas';
import { instantiateModel, preloadModel, type Tier } from '../creatures/models/ModelLoader';
import { BAG_TARGETS, prepareNet, type BagTarget, type NetHandle } from '../assets/models/nets/netMaterials';

const DROPS = 64;

export const NET_LAYER = 1;

/** how far the hoop reaches from the eye (handle plus arm), metres */
export const REACH = 1.6;
/** the hoop as the catch zone: a vertical ellipse around the line of sight (half width, half height), metres */
export const ZONE_A = 0.21;
export const ZONE_B = 0.28;
/** nothing closer than this to the eye is under the hoop */
export const ZONE_NEAR = 0.25;

/** A pose: where the hoop's centre is and how the net is turned, both in camera space (x right, y up, −z ahead). */
interface Pose { p: Vector3; q: Quaternion }
const tmpBasis = new Matrix4();
/** the handle (local +z) runs from the hoop to the hands; the hoop plane holds it, the opening faces local +y */
function orientFromHands(p: Vector3, hands: Vector3, roll = 0): Quaternion {
  const az = new Vector3().subVectors(hands, p).normalize();
  const up = new Vector3(Math.sin(roll), Math.cos(roll), 0);
  const ax = new Vector3().crossVectors(up, az).normalize();
  const ay = new Vector3().crossVectors(az, ax);
  return new Quaternion().setFromRotationMatrix(tmpBasis.makeBasis(ax, ay, az));
}
const pose = (x: number, y: number, z: number, q: Quaternion): Pose => ({ p: new Vector3(x, y, z), q });
const P_HIDDEN = pose(0.46, -0.72, -0.5, orientFromHands(new Vector3(0.46, -0.72, -0.5), new Vector3(0.4, -0.62, 0.12)));
const P_READY = pose(0.3, -0.3, -0.72, orientFromHands(new Vector3(0.3, -0.3, -0.72), new Vector3(0.32, -0.46, -0.02)));
/** the thrust: hoop upright across the line of sight, opening ahead, handle straight down to the hands */
const Q_THRUST = new Quaternion().setFromRotationMatrix(tmpBasis.makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1, 0)));
const P_CHECK = pose(0.0, -0.09, -0.42, orientFromHands(new Vector3(0.0, -0.09, -0.42), new Vector3(0.02, -0.5, -0.1)));
const P_SCOOP = pose(0.0, -0.22, -0.56, new Quaternion().slerpQuaternions(Q_THRUST, P_CHECK.q, 0.45));

const ease = (t: number) => t * t * (3 - 2 * t);
function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.p.lerpVectors(a.p, b.p, t);
  out.q.slerpQuaternions(a.q, b.q, t);
  return out;
}

/** the bag's outline shrinking toward its bottom, as a fraction of the mouth (v: 0 at the mouth .. 1 at the bottom) */
const bagShrink = (v: number) => 1 - 0.84 * Math.pow(ease(v), 0.9) + 0.06 * Math.sin(Math.PI * v);

/**
 * Fit a net GLB (grip at the origin, handle along +z to the mouth, the Mouth node's +y the opening) into the view's
 * frame: the mouth centre at the origin, the opening along +y, the handle running along +z toward the hands.
 */
function fitToMouth(root: Object3D, fallbackMouthZ: number): Object3D {
  root.updateMatrixWorld(true);
  const mouth = root.getObjectByName('Mouth');
  const m = new Vector3(0, 0, fallbackMouthZ), n = new Vector3(0, 1, 0);
  if (mouth) {
    m.setFromMatrixPosition(mouth.matrixWorld);
    n.set(0, 1, 0).transformDirection(mouth.matrixWorld).normalize();
  }
  // toward the grip (the origin), made square to the opening
  const az = m.clone().negate();
  az.addScaledVector(n, -az.dot(n));
  if (az.lengthSq() < 1e-8) az.set(0, 0, -1);
  az.normalize();
  const ax = new Vector3().crossVectors(n, az).normalize();
  const basis = new Matrix4().makeBasis(ax, n, az).setPosition(m);
  root.matrix.copy(basis).invert();
  root.matrixAutoUpdate = false;
  root.matrixWorldNeedsUpdate = true;
  const wrapper = new Group();
  wrapper.name = 'netModel';
  wrapper.add(root);
  return wrapper;
}

/** Load a net's detailed model ahead of time (the carried nets, on the way to the flat). */
export function preloadNet(tool: ToolDef | undefined, tier: Tier = 'hero'): void {
  if (tool?.model) void preloadModel(`${tool.model}.${tier}.glb`).catch((e) => console.warn(e));
}

/**
 * The タモ as seen from the player's eyes: the carried net's own model (frame, handle and a bag with morphs for the
 * water's pull), driven by the capture state: resting at the hip while aiming, thrust through the water, lifted to the
 * eye and held there while the water runs out of it — with whatever came up lying in the bag.
 */
export class NetView {
  readonly group = new Group();
  private readonly catchHolder = new Group();
  private readonly drops: Points;
  private readonly dropPos: Float32Array;
  private readonly dropVel: Float32Array;
  private readonly dropLife: Float32Array;
  private readonly weeds: Mesh[] = [];
  private readonly cur: Pose = { p: new Vector3(), q: new Quaternion() };
  private readonly zone: Mesh;
  private readonly placeholder: Mesh;
  private model: Object3D | null = null;
  private net: NetHandle | null = null;
  private toolId: string | null = null;
  private loadSeq = 0;
  /** the bag below the mouth, and the mouth's half extents (x across, z along the handle), metres */
  private bagDepth = 0.3;
  private mouthRX = 0.15;
  private mouthRZ = 0.15;
  private pThrust: Pose = pose(0.0, -0.04, -0.95, Q_THRUST);
  private readonly bag: Record<BagTarget, number> = { Stream: 0, Invert: 0, Trail: 0, Wet: 0 };
  private mud = 0;
  private visible = false;
  private held = true;
  private shown = 0;
  private time = 0;
  private splashed = false;
  private flopSeed = 0;
  private catchObj: Object3D | null = null;
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();
  private readonly rollQ = new Quaternion();

  constructor(scene: Scene) {
    this.group.name = 'tamo';
    this.group.visible = false;
    // until a model is in: a plain ring at the mouth, so a swing still shows something
    const ring = new CylinderGeometry(1, 1, 0.006, 32, 1, true);
    this.placeholder = new Mesh(ring, new MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.32, side: DoubleSide }));
    this.placeholder.scale.set(0.15, 1, 0.15);
    this.placeholder.visible = false;
    this.group.add(this.placeholder);
    // what comes up lies at the bottom of the bag
    this.catchHolder.position.set(0, -this.bagDepth * 0.86, 0);
    this.group.add(this.catchHolder);
    // a scrap or two of アオサ for every sweep
    const weedMat = new MeshStandardMaterial({ color: 0x2e6b24, roughness: 0.7, side: DoubleSide });
    for (let i = 0; i < 3; i++) {
      const w = new Mesh(new PlaneGeometry(0.018, 0.011, 3, 2), weedMat);
      w.visible = false;
      this.group.add(w);
      this.weeds.push(w);
    }
    // water drops running off the bag (world space)
    this.dropPos = new Float32Array(DROPS * 3);
    this.dropVel = new Float32Array(DROPS * 3);
    this.dropLife = new Float32Array(DROPS).fill(0);
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(this.dropPos, 3));
    this.drops = new Points(dg, new PointsMaterial({ color: 0xdcecf2, size: 0.0045, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }));
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    // debug: the catch zone, an elliptical tube along the line of sight out to the hoop's reach
    const tube = new CylinderGeometry(1, 1, 1, 28, 1, true);
    tube.rotateX(-Math.PI / 2);
    this.zone = new Mesh(tube, new MeshBasicMaterial({ color: 0x7fe3d2, wireframe: true, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false }));
    this.zone.visible = false;
    this.zone.frustumCulled = false;
    this.zone.renderOrder = 50;
    scene.add(this.zone);
    this.group.traverse((o) => o.layers.set(NET_LAYER));
    this.drops.layers.set(NET_LAYER);
    // the lights must shine on that layer too
    scene.traverse((o) => { if ((o as { isLight?: boolean }).isLight) o.layers.enable(NET_LAYER); });
    scene.add(this.group);
    scene.add(this.drops);
  }

  /** The net in hand: its model is loaded (once per net) and fitted with the mouth centre at the group's origin. */
  async setTool(tool: ToolDef | null, tier: Tier = 'hero'): Promise<void> {
    const id = tool?.model ? `${tool.id}/${tier}` : null;
    if (id === this.toolId) return;
    this.toolId = id;
    const seq = ++this.loadSeq;
    if (this.model) { this.model.removeFromParent(); this.model = null; this.net = null; }
    if (!tool?.model) { this.placeholder.visible = false; return; }
    const p = tool.params;
    this.bagDepth = p.bag_depth ?? 0.3;
    this.mouthRX = (p.mouth_w ?? 0.3) / 2;
    this.mouthRZ = (p.mouth_h ?? 0.3) / 2;
    this.catchHolder.position.set(0, -this.bagDepth * 0.86, 0);
    this.placeholder.scale.set(this.mouthRX, 1, this.mouthRZ);
    this.placeholder.visible = true;
    // a longer net is thrust a little further out
    const reach = p.reach_m ?? 1.5;
    this.pThrust = pose(0.0, -0.04, -Math.min(1.15, Math.max(0.8, 0.55 + 0.25 * reach)), Q_THRUST);
    let loaded;
    try { loaded = await instantiateModel(`${tool.model}.${tier}.glb`); } catch (e) { if (seq === this.loadSeq) this.toolId = null; console.warn(e); return; }
    if (seq !== this.loadSeq) return;
    const wrapped = fitToMouth(loaded.root, p.handle_m ?? 1);
    const net = prepareNet(loaded.root);
    wrapped.traverse((o) => {
      o.layers.set(NET_LAYER);
      const m = o as Mesh;
      if (m.isMesh) { m.frustumCulled = false; m.receiveShadow = false; }
    });
    this.group.add(wrapped);
    this.model = wrapped;
    this.net = net;
    this.placeholder.visible = false;
    for (const k of BAG_TARGETS) this.bag[k] = 0;
    net.setSurface({ wet: 0, mud: this.mud, waterline: null });
  }

  /**
   * Is a point under the hoop for this view? The zone is the hoop's outline — a vertical ellipse — carried along the
   * line of sight from just in front of the eye out to the reach of the handle. Returns how far out toward the
   * rim the point is (0 centre … 1 rim), or -1 when it is outside; `margin` widens the ellipse by the animal's size.
   */
  static inZone(camera: PerspectiveCamera, p: Vector3, margin: number, scale = 1, reach = REACH): number {
    camera.updateMatrixWorld();
    const m = camera.matrixWorld.elements;
    const dx = p.x - m[12], dy = p.y - m[13], dz = p.z - m[14];
    // camera axes from the world matrix: right (column 0), up (column 1), back (column 2)
    const t = -(dx * m[8] + dy * m[9] + dz * m[10]);
    if (t < ZONE_NEAR || t > reach + margin) return -1;
    const ex = (dx * m[0] + dy * m[1] + dz * m[2]) / (ZONE_A * scale + margin), ey = (dx * m[4] + dy * m[5] + dz * m[6]) / (ZONE_B * scale + margin);
    const e = Math.sqrt(ex * ex + ey * ey);
    return e <= 1 ? e : -1;
  }

  /** Put the caught animal's model in the bag (scaled to its real length). */
  setCatch(obj: Object3D | null, scale = 1): void {
    if (this.catchObj) { this.catchObj.removeFromParent(); this.catchObj = null; }
    if (!obj) return;
    obj.scale.setScalar(scale);
    // on its side at the bottom of the bag, tail toward the hand
    obj.rotation.set(0, Math.PI / 2 + (Math.random() - 0.5) * 0.5, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1), 'YXZ');
    obj.traverse((o) => { (o as Mesh).frustumCulled = false; (o as Mesh).castShadow = false; o.layers.set(NET_LAYER); });
    this.catchHolder.add(obj);
    this.catchObj = obj;
    this.flopSeed = Math.random() * 100;
  }

  /** The net is the tool in hand (shown at rest) or stowed. */
  setHeld(held: boolean): void {
    this.held = held;
  }

  show(): void {
    this.visible = true;
    this.time = 0;
    this.splashed = false;
    for (const w of this.weeds) {
      w.visible = Math.random() < 0.6;
      w.position.set((Math.random() - 0.5) * this.mouthRX * 0.5, -this.bagDepth * (0.7 + Math.random() * 0.2), (Math.random() - 0.5) * this.mouthRZ * 0.4);
      w.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }
  }

  hide(): void {
    this.visible = false;
    this.setCatch(null);
  }

  /** Place the net for this frame from the capture state (null = at rest, out of sight). */
  update(camera: PerspectiveCamera, dt: number, st: CaptureState | null, waterY: number, showZone = false, zoneScale = 1, reach = REACH): void {
    this.time += dt;
    // debug: the zone tube rides along the line of sight
    this.zone.visible = showZone;
    if (showZone) {
      camera.updateMatrixWorld();
      this.zone.position.set(0, 0, -(ZONE_NEAR + reach) / 2).applyMatrix4(camera.matrixWorld);
      this.zone.quaternion.copy(camera.quaternion);
      this.zone.scale.set(ZONE_A * zoneScale, ZONE_B * zoneScale, reach - ZONE_NEAR);
    }
    const want = (this.visible && !!st) || (this.held && !st);
    this.shown = MathUtils.damp(this.shown, want ? 1 : 0, 9, dt);
    this.net?.update(dt);
    if (this.shown < 0.01 && !want) { this.group.visible = false; this.updateDrops(dt, null); return; }
    this.group.visible = true;
    const cur = this.cur;
    const sway = this.time;
    let dripping = false;
    let roll = 0;
    let inWater = false;
    const empty = !!st && st.result === 'fail';
    // the bag: pulled by the water as the net moves through it, hanging wet after
    const bag = { Stream: 0, Invert: 0, Trail: 0, Wet: 0 };
    if (!st) {
      lerpPose(P_HIDDEN, P_READY, ease(this.shown), cur);
      cur.p.y += Math.sin(sway * 1.9) * 0.008;
      cur.p.x += Math.sin(sway * 1.3 + 0.5) * 0.005;
      roll = Math.sin(sway * 1.3) * 0.03;
      bag.Wet = 0.6 * (this.net?.surface.wet ?? 0);
    } else if (st.phase === 'swing') {
      // thrust straight ahead along the line of sight, then turn the hoop up and draw it back
      const t = st.elapsed / st.swingSec;
      if (t < 0.5) lerpPose(P_READY, this.pThrust, ease(t / 0.5), cur);
      else lerpPose(this.pThrust, P_SCOOP, ease((t - 0.5) / 0.5), cur);
      if (t >= 0.42 && !this.splashed) { this.splashed = true; this.splash(camera, waterY); }
      inWater = t > 0.3;
      bag.Trail = t < 0.5 ? 0.35 : 0.15;
      bag.Invert = t < 0.5 ? 0.7 * ease(Math.min(1, t / 0.45)) : 0;
      bag.Stream = t >= 0.5 ? 0.8 * ease((t - 0.5) / 0.5) : 0;
    } else if (st.phase === 'lift') {
      const t = ease(st.elapsed / (empty ? EMPTY_PHASE_SEC.lift : CAPTURE_PHASE_SEC.lift));
      lerpPose(P_SCOOP, empty ? P_READY : P_CHECK, t, cur);
      dripping = !empty && t > 0.5;
      inWater = t < 0.3;
      bag.Stream = 0.6 * (1 - t);
      bag.Wet = 0.9 * t;
    } else if (st.phase === 'check') {
      if (empty) lerpPose(P_READY, P_READY, 0, cur);
      else {
        lerpPose(P_CHECK, P_CHECK, 0, cur);
        // the hands are not quite still
        cur.p.x += Math.sin(sway * 3.1) * 0.0025;
        cur.p.y += Math.sin(sway * 2.4 + 0.7) * 0.003;
        roll = Math.sin(sway * 1.7) * 0.015;
        dripping = st.elapsed < REVEAL_SEC + 0.9;
      }
      bag.Wet = empty ? 0.5 : 1;
    } else {
      const t = ease(st.elapsed / (empty ? EMPTY_PHASE_SEC.done : CAPTURE_PHASE_SEC.done));
      lerpPose(empty ? P_READY : P_CHECK, empty ? P_READY : P_HIDDEN, t, cur);
      bag.Wet = 0.8;
    }
    if (this.net) {
      let changed = false;
      for (const k of BAG_TARGETS) { const v = MathUtils.damp(this.bag[k], bag[k], 10, dt); if (Math.abs(v - this.bag[k]) > 1e-4) { this.bag[k] = v; changed = true; } }
      if (changed) this.net.setBag(this.bag);
      this.net.setSurface({ waterline: inWater ? waterY : null });
    }
    // the bag is on the far side of the hoop from the eye while checking; only then is the catch lit for the eye
    this.catchHolder.visible = !!st && (st.phase === 'check' || st.phase === 'done') && st.revealed;
    if (this.catchObj && this.catchHolder.visible) this.flop(st!.elapsed);
    // camera space → world
    camera.updateMatrixWorld();
    this.group.position.copy(cur.p).applyMatrix4(camera.matrixWorld);
    this.rollQ.setFromAxisAngle(this.tmpV.set(0, 0, 1), roll);
    this.tmpQ.copy(cur.q).premultiply(this.rollQ);
    this.group.quaternion.copy(camera.quaternion).multiply(this.tmpQ);
    this.group.updateMatrixWorld();
    this.updateDrops(dt, dripping ? this.group.matrixWorld : null);
  }

  /** A netted fish does not lie still: bursts of thrashing between pauses. */
  private flop(elapsed: number): void {
    const obj = this.catchObj!;
    const t = elapsed + this.flopSeed;
    const cycle = 1.3 + 0.5 * Math.sin(this.flopSeed * 3.3);
    const ph = (t % cycle) / cycle;
    const burst = ph < 0.35 ? Math.exp(-ph * 9) : 0;
    const wobble = Math.sin(t * 31) * burst;
    this.catchHolder.rotation.set(wobble * 0.35, wobble * 0.15, Math.sin(t * 27 + 1) * burst * 0.25);
    this.catchHolder.position.y = -this.bagDepth * 0.86 + Math.abs(wobble) * 0.012;
    obj.position.x = Math.sin(t * 0.7) * 0.01;
  }

  /** The hoop breaking the water: a burst of droplets from the front edge; the net comes up soaked and a little muddy. */
  private splash(camera: PerspectiveCamera, waterY: number): void {
    camera.updateMatrixWorld();
    const base = this.tmpV.copy(this.pThrust.p).applyMatrix4(camera.matrixWorld);
    base.y = Math.min(base.y, waterY + 0.02);
    base.y = Math.max(waterY + 0.01, base.y);
    let n = 0;
    for (let i = 0; i < DROPS && n < 36; i++) {
      if (this.dropLife[i] > 0) continue;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2;
      this.dropPos[i * 3] = base.x + Math.cos(a) * r; this.dropPos[i * 3 + 1] = base.y; this.dropPos[i * 3 + 2] = base.z + Math.sin(a) * r;
      this.dropVel[i * 3] = Math.cos(a) * (0.3 + Math.random() * 0.6); this.dropVel[i * 3 + 1] = 0.8 + Math.random() * 1.4; this.dropVel[i * 3 + 2] = Math.sin(a) * (0.3 + Math.random() * 0.6);
      this.dropLife[i] = 0.5 + Math.random() * 0.5;
      n++;
    }
    this.mud = Math.min(0.55, this.mud * 0.7 + 0.18);
    this.net?.setSurface({ wet: 1, mud: this.mud });
  }

  private updateDrops(dt: number, bagWorld: Matrix4 | null): void {
    let any = false;
    for (let i = 0; i < DROPS; i++) {
      if (this.dropLife[i] > 0) {
        this.dropLife[i] -= dt;
        this.dropVel[i * 3 + 1] -= 9.8 * dt;
        this.dropPos[i * 3] += this.dropVel[i * 3] * dt; this.dropPos[i * 3 + 1] += this.dropVel[i * 3 + 1] * dt; this.dropPos[i * 3 + 2] += this.dropVel[i * 3 + 2] * dt;
        any = true;
        if (this.dropLife[i] <= 0) { this.dropPos[i * 3 + 1] = -1e3; }
      } else if (bagWorld && Math.random() < dt * 14) {
        // a drop forms on the lower half of the bag and lets go
        const a = Math.random() * Math.PI * 2, v = 0.45 + Math.random() * 0.55, s = bagShrink(v);
        this.tmpV.set(Math.cos(a) * this.mouthRX * s, -this.bagDepth * Math.pow(v, 0.85), Math.sin(a) * this.mouthRZ * s).applyMatrix4(bagWorld);
        this.dropPos[i * 3] = this.tmpV.x; this.dropPos[i * 3 + 1] = this.tmpV.y; this.dropPos[i * 3 + 2] = this.tmpV.z;
        this.dropVel[i * 3] = (Math.random() - 0.5) * 0.05; this.dropVel[i * 3 + 1] = -0.05; this.dropVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
        this.dropLife[i] = 0.35 + Math.random() * 0.4;
        any = true;
      }
    }
    this.drops.visible = any;
    if (any) (this.drops.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.loadSeq++;
    this.group.removeFromParent();
    this.drops.removeFromParent();
    this.zone.removeFromParent();
    this.zone.geometry.dispose();
    this.placeholder.geometry.dispose();
  }
}
