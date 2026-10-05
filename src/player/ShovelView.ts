import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { CAPTURE_PHASE_SEC, REVEAL_SEC, type CaptureState } from '../systems/Capture';
import { NET_LAYER } from './NetView';

/** A pose is where the blade's centre is and where the hands hold the handle, both in camera space. */
interface Pose { p: Vector3; hands: Vector3 }
const pose = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Pose => ({ p: new Vector3(x, y, z), hands: new Vector3(hx, hy, hz) });
const P_HIDDEN = pose(0.46, -0.72, -0.5, 0.42, -0.6, 0.1);
const P_READY = pose(0.3, -0.34, -0.62, 0.36, -0.42, -0.1);
const P_DIG = pose(0.06, -0.52, -0.64, 0.3, -0.36, -0.14);
const P_LIFT = pose(0.0, -0.3, -0.5, 0.18, -0.46, -0.1);
const P_CHECK = pose(0.0, -0.12, -0.4, 0.04, -0.44, -0.08);
const ease = (t: number) => t * t * (3 - 2 * t);
function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.p.lerpVectors(a.p, b.p, t);
  out.hands.lerpVectors(a.hands, b.hands, t);
  return out;
}

/**
 * The スコップ (hand shovel) as seen from the player's eyes: a short wooden handle and a blade, drawn in the
 * tools' own layer. Driven by the capture state: at rest by the hip, thrust into the sand, lifted with a scoop
 * of sand on the blade, and held up to look through — with whatever was in the sand lying on top.
 */
export class ShovelView {
  readonly group = new Group();
  private readonly scoop: Mesh;
  private readonly catchHolder = new Group();
  private readonly cur: Pose = pose(0, 0, 0, 0, 0, 0);
  /** the dig pose for this swing: the blade's centre on the spot under the reticle (camera space), hands as usual */
  private readonly digPose: Pose = pose(P_DIG.p.x, P_DIG.p.y, P_DIG.p.z, P_DIG.hands.x, P_DIG.hands.y, P_DIG.hands.z);
  private visible = false;
  private held = false;
  private shown = 0;
  private time = 0;
  private catchObj: Object3D | null = null;
  private readonly tmpM = new Matrix4();
  private readonly tmpQ = new Quaternion();
  private readonly ax = new Vector3();
  private readonly ay = new Vector3();
  private readonly az = new Vector3();
  private readonly up = new Vector3();

  constructor(scene: Scene) {
    this.group.name = 'shovel';
    this.group.visible = false;
    const steel = new MeshStandardMaterial({ color: 0xb9bdc1, metalness: 0.55, roughness: 0.5 });
    const wood = new MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.7 });
    // blade: a slightly dished plate, its tip toward local −z and the sand side local +y
    const blade = new Mesh(new BoxGeometry(0.095, 0.004, 0.15), steel);
    blade.position.set(0, 0, -0.01);
    this.group.add(blade);
    const lip = new Mesh(new BoxGeometry(0.095, 0.012, 0.004), steel);
    lip.position.set(0, 0.005, 0.064);
    this.group.add(lip);
    const neck = new Mesh(new CylinderGeometry(0.009, 0.011, 0.05, 10), steel);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 0.006, 0.09);
    this.group.add(neck);
    const handle = new Mesh(new CylinderGeometry(0.014, 0.016, 0.26, 12), wood);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.008, 0.24);
    this.group.add(handle);
    // a scoop of sand on the blade while lifting and checking
    const sandMat = new MeshStandardMaterial({ color: 0x8f7d5c, roughness: 1 });
    this.scoop = new Mesh(new IcosahedronGeometry(1, 2), sandMat);
    this.scoop.scale.set(0.04, 0.018, 0.055);
    this.scoop.position.set(0, 0.012, -0.015);
    this.scoop.visible = false;
    this.group.add(this.scoop);
    this.catchHolder.position.set(0, 0.026, -0.015);
    this.group.add(this.catchHolder);
    this.group.traverse((o) => o.layers.set(NET_LAYER));
    scene.add(this.group);
  }

  /** Where the blade goes into the sand for this view (world), pressed down to the ground. */
  static digPoint(camera: PerspectiveCamera, groundAt: (x: number, z: number) => number, out: Vector3): void {
    camera.updateMatrixWorld();
    out.copy(P_DIG.p).applyMatrix4(camera.matrixWorld);
    out.y = groundAt(out.x, out.z);
  }

  setHeld(held: boolean): void {
    this.held = held;
  }

  /** Aim this swing's blade at a spot on the ground (world); null goes back to the stock pose. */
  setDigPoint(world: Vector3 | null, camera: PerspectiveCamera): void {
    if (!world) { this.digPose.p.copy(P_DIG.p); this.digPose.hands.copy(P_DIG.hands); return; }
    camera.updateMatrixWorld();
    this.digPose.p.copy(world).applyMatrix4(camera.matrixWorldInverse);
    this.digPose.p.y += 0.012;
    // the hands keep their place beside the body; the handle just reaches further
    this.digPose.hands.copy(P_DIG.hands);
  }

  show(): void {
    this.visible = true;
    this.time = 0;
  }

  hide(): void {
    this.visible = false;
    this.setCatch(null);
  }

  /** Lay what was dug up on the scoop (scaled to its real size). */
  setCatch(obj: Object3D | null, scale = 1): void {
    if (this.catchObj) { this.catchObj.removeFromParent(); this.catchObj = null; }
    if (!obj) return;
    obj.scale.setScalar(scale);
    obj.rotation.set(0, Math.random() * Math.PI * 2, 0);
    obj.traverse((o) => { (o as Mesh).frustumCulled = false; (o as Mesh).castShadow = false; o.layers.set(NET_LAYER); });
    this.catchHolder.add(obj);
    this.catchObj = obj;
  }

  update(camera: PerspectiveCamera, dt: number, st: CaptureState | null): void {
    this.time += dt;
    const want = (this.visible && !!st) || (this.held && !st);
    this.shown = MathUtils.damp(this.shown, want ? 1 : 0, 9, dt);
    if (this.shown < 0.01 && !want) { this.group.visible = false; return; }
    this.group.visible = true;
    const cur = this.cur, sway = this.time;
    let roll = 0;
    if (!st) {
      lerpPose(P_HIDDEN, P_READY, ease(this.shown), cur);
      cur.p.y += Math.sin(sway * 1.9) * 0.006;
      roll = Math.sin(sway * 1.3) * 0.03;
      this.scoop.visible = false;
    } else if (st.phase === 'swing') {
      const t = st.elapsed / CAPTURE_PHASE_SEC.swing;
      if (t < 0.55) lerpPose(P_READY, this.digPose, ease(t / 0.55), cur);
      else lerpPose(this.digPose, P_LIFT, ease((t - 0.55) / 0.45), cur);
      this.scoop.visible = t > 0.5;
    } else if (st.phase === 'lift') {
      lerpPose(P_LIFT, P_CHECK, ease(st.elapsed / CAPTURE_PHASE_SEC.lift), cur);
      this.scoop.visible = true;
    } else if (st.phase === 'check') {
      lerpPose(P_CHECK, P_CHECK, 0, cur);
      cur.p.x += Math.sin(sway * 3.1) * 0.002;
      cur.p.y += Math.sin(sway * 2.4 + 0.7) * 0.0025;
      roll = Math.sin(sway * 1.7) * 0.012;
      this.scoop.visible = true;
      // the sand falls off the scoop and shows what was in it
      const fall = MathUtils.clamp(st.elapsed / REVEAL_SEC, 0, 1);
      this.scoop.scale.set(0.04, 0.018 * (1 - 0.55 * fall), 0.055);
    } else {
      lerpPose(P_CHECK, P_HIDDEN, ease(st.elapsed / CAPTURE_PHASE_SEC.done), cur);
    }
    this.catchHolder.visible = !!st && (st.phase === 'check' || st.phase === 'done') && st.revealed;
    // the handle (local +z) runs from the blade to the hands; the sand side is local +y
    this.az.subVectors(cur.hands, cur.p).normalize();
    this.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.ax.crossVectors(this.up, this.az).normalize();
    this.ay.crossVectors(this.az, this.ax);
    this.tmpM.makeBasis(this.ax, this.ay, this.az);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    camera.updateMatrixWorld();
    this.group.position.copy(cur.p).applyMatrix4(camera.matrixWorld);
    this.group.quaternion.copy(camera.quaternion).multiply(this.tmpQ);
    this.group.updateMatrixWorld();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
}
