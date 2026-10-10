import { Euler, Group, Mesh, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3, MathUtils } from 'three';
import { instantiateModel, type Tier } from '../creatures/models/ModelLoader';
import { prepareNet } from '../assets/models/nets/netMaterials';
import type { ToolDef } from '../data/schemas';
import { NET_LAYER } from './NetView';

/**
 * The binoculars: carried low in both hands while they are the tool in hand; raised to the eyes (E or the right
 * button held) the view narrows to their field (the camera does the zoom), a two-circle mask closes in, and the
 * model itself is out of sight. Far birds can then be picked and observed.
 */
const P_CARRY = new Vector3(0.17, -0.19, -0.38), Q_CARRY = new Quaternion().setFromEuler(new Euler(-0.5, 0.3, 0.08, 'YXZ'));
const P_RAISE = new Vector3(0.0, -0.05, -0.16);

export class BinocularView {
  readonly group = new Group();
  raised = false;
  private held = false;
  private model: Object3D | null = null;
  private loadSeq = 0;
  private shown = 0;
  private lift = 0;
  private time = 0;
  private readonly mask: HTMLDivElement;
  private readonly tmpP = new Vector3();
  private readonly tmpQ = new Quaternion();

  constructor(scene: Scene) {
    this.group.name = 'binoculars';
    this.group.visible = false;
    this.group.traverse((o) => o.layers.set(NET_LAYER));
    scene.add(this.group);
    this.mask = document.createElement('div');
    this.mask.className = 'binocular-mask';
    // under the HUD (first in the UI layer) so the prompt still reads through the eyepieces
    const ui = document.getElementById('ui');
    if (ui) ui.prepend(this.mask); else document.body.appendChild(this.mask);
  }

  /** The pair in hand: the hero GLB (origin between the eyecups, +z the way they look). */
  async setTool(tool: ToolDef | null, tier: Tier = 'hero'): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.model) { this.model.removeFromParent(); this.model = null; }
    if (!tool?.model) return;
    let loaded;
    try { loaded = await instantiateModel(`${tool.model}.${tier}.glb`); } catch (e) { console.warn(e); return; }
    if (seq !== this.loadSeq) return;
    const root = loaded.root;
    prepareNet(root).setSurface({ wet: 0, mud: 0, waterline: null });
    root.traverse((o) => { o.layers.set(NET_LAYER); const m = o as Mesh; if (m.isMesh) { m.frustumCulled = false; m.receiveShadow = false; m.castShadow = false; } });
    this.group.add(root);
    this.model = root;
  }

  setHeld(held: boolean): void {
    this.held = held;
    if (!held) this.setRaised(false);
  }

  /** Up to the eyes (the caller narrows the camera) or back down to the chest. */
  setRaised(on: boolean): void {
    if (this.raised === on) return;
    this.raised = on;
    this.mask.classList.toggle('on', on);
  }

  update(camera: PerspectiveCamera, dt: number): void {
    this.time += dt;
    this.shown = MathUtils.damp(this.shown, this.held ? 1 : 0, 9, dt);
    this.lift = MathUtils.damp(this.lift, this.raised ? 1 : 0, 11, dt);
    if (this.shown < 0.01 && !this.held) { this.group.visible = false; return; }
    this.group.visible = this.lift < 0.92;
    // from stowed (below the frame) up to the carry pose, then toward the eyes as they are raised
    const e = this.shown * this.shown * (3 - 2 * this.shown);
    this.tmpP.set(P_CARRY.x, P_CARRY.y - 0.4 * (1 - e), P_CARRY.z).lerp(P_RAISE, this.lift);
    this.tmpP.y += Math.sin(this.time * 1.6) * 0.004 * (1 - this.lift);
    this.tmpQ.copy(Q_CARRY).slerp(new Quaternion(), this.lift);
    camera.updateMatrixWorld();
    this.group.position.copy(this.tmpP).applyMatrix4(camera.matrixWorld);
    this.group.quaternion.copy(camera.quaternion).multiply(this.tmpQ);
    this.group.updateMatrixWorld();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mask.remove();
  }
}
