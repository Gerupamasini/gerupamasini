import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, MathUtils, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Quaternion, RepeatWrapping, Scene, TubeGeometry, Vector3,
} from 'three';
import { CAPTURE_PHASE_SEC, REVEAL_SEC, type CaptureState } from '../systems/Capture';

/** D-frame hoop: 36 cm across the flat front edge, 30 cm deep; the handle leaves from the back. */
const HOOP: [number, number, number][] = [
  [-0.17, 0, -0.14], [-0.06, 0, -0.152], [0.06, 0, -0.152], [0.17, 0, -0.14], [0.185, 0, -0.05], [0.165, 0, 0.07],
  [0.095, 0, 0.14], [0, 0, 0.158], [-0.095, 0, 0.14], [-0.165, 0, 0.07], [-0.185, 0, -0.05],
];
const BAG_DEPTH = 0.3;
const NU = 72, NV = 20;
const DROPS = 64;
/** the net is drawn in a pass of its own over the finished frame, so it never clips into the ground or the water */
export const NET_LAYER = 1;

/** A pose is where the hoop's centre is and where the hands hold the handle, both in camera space (x right, y up, −z ahead). */
interface Pose { p: Vector3; hands: Vector3 }
const pose = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Pose => ({ p: new Vector3(x, y, z), hands: new Vector3(hx, hy, hz) });
const P_HIDDEN = pose(0.46, -0.72, -0.5, 0.4, -0.62, 0.12);
const P_READY = pose(0.3, -0.3, -0.72, 0.32, -0.46, -0.02);
const P_DIP = pose(-0.12, -0.52, -0.88, 0.28, -0.44, -0.04);
const P_SCOOP = pose(-0.05, -0.27, -0.6, 0.3, -0.44, -0.02);
const P_CHECK = pose(0.0, -0.09, -0.42, 0.02, -0.5, -0.1);

const ease = (t: number) => t * t * (3 - 2 * t);
function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.p.lerpVectors(a.p, b.p, t);
  out.hands.lerpVectors(a.hands, b.hands, t);
  return out;
}

/** The knotted mesh of the bag: one tile is a 4 × 4 cell grid, repeated around and down the bag. */
function netTexture(): CanvasTexture {
  const S = 256, cells = 4, cs = S / cells;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.lineCap = 'round';
  // threads with a slight wobble so the grid never reads as drawn with a ruler
  for (let k = 0; k <= cells; k++) {
    const o = k * cs;
    g.beginPath();
    for (let s = 0; s <= 16; s++) { const x = (s / 16) * S, y = o + Math.sin(x * 0.11 + k * 1.7) * 2.2; if (s === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.beginPath();
    for (let s = 0; s <= 16; s++) { const y = (s / 16) * S, x = o + Math.cos(y * 0.13 + k * 2.3) * 2.2; if (s === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // knots
  g.fillStyle = '#fff';
  for (let i = 0; i <= cells; i++) for (let j = 0; j <= cells; j++) { g.beginPath(); g.arc(i * cs, j * cs, 7, 0, Math.PI * 2); g.fill(); }
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The タモ as seen from the player's eyes: a D-frame hoop, a handle running back out of the frame, and a
 * knotted bag. It is driven by the capture state: resting at the hip while aiming, swept through the water,
 * lifted to the eye and held there while the water runs out of it — with whatever came up lying in the bag.
 */
export class NetView {
  readonly group = new Group();
  private readonly catchHolder = new Group();
  private readonly bagMat: MeshStandardMaterial;
  private readonly curve: CatmullRomCurve3;
  private readonly drops: Points;
  private readonly dropPos: Float32Array;
  private readonly dropVel: Float32Array;
  private readonly dropLife: Float32Array;
  private readonly weeds: Mesh[] = [];
  private readonly cur: Pose = pose(0, 0, 0, 0, 0, 0);
  private readonly from: Pose = pose(0, 0, 0, 0, 0, 0);
  private visible = false;
  private shown = 0;
  private time = 0;
  private splashed = false;
  private flopSeed = 0;
  private catchObj: Object3D | null = null;
  private readonly tmpM = new Matrix4();
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();
  private readonly ax = new Vector3();
  private readonly ay = new Vector3();
  private readonly az = new Vector3();
  private readonly up = new Vector3();

  constructor(scene: Scene) {
    this.group.name = 'tamo';
    this.group.visible = false;
    this.curve = new CatmullRomCurve3(HOOP.map(([x, y, z]) => new Vector3(x, y, z)), true, 'catmullrom', 0.6);
    const metal = new MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.32 });
    const hoop = new Mesh(new TubeGeometry(this.curve, 120, 0.0055, 10, true), metal);
    hoop.castShadow = true;
    this.group.add(hoop);
    // handle: from the back of the hoop toward the hand, out of the frame
    const handleMat = new MeshStandardMaterial({ color: 0x2c4660, metalness: 0.55, roughness: 0.45 });
    const handle = new Mesh(new CylinderGeometry(0.0115, 0.0125, 1.1, 14), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0, 0.158 + 0.55);
    this.group.add(handle);
    const ferrule = new Mesh(new CylinderGeometry(0.014, 0.014, 0.07, 14), metal);
    ferrule.rotation.x = Math.PI / 2;
    ferrule.position.set(0, 0, 0.19);
    this.group.add(ferrule);
    // bag
    this.bagMat = new MeshStandardMaterial({ color: 0xc9dcc0, roughness: 0.6, metalness: 0, side: DoubleSide, alphaMap: netTexture(), alphaTest: 0.35 });
    const bag = new Mesh(this.bagGeometry(), this.bagMat);
    bag.castShadow = false;
    this.group.add(bag);
    // what comes up lies at the bottom of the bag
    this.catchHolder.position.set(0, -BAG_DEPTH * 0.86, 0.02);
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
    this.group.traverse((o) => o.layers.set(NET_LAYER));
    this.drops.layers.set(NET_LAYER);
    // the lights must shine on that layer too
    scene.traverse((o) => { if ((o as { isLight?: boolean }).isLight) o.layers.enable(NET_LAYER); });
    scene.add(this.group);
    scene.add(this.drops);
  }

  /** The bag: the hoop outline shrinking and sagging to a rounded bottom 30 cm down. */
  private bagGeometry(): BufferGeometry {
    const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv = new Float32Array((NU + 1) * (NV + 1) * 2);
    const p = new Vector3();
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const shrink = 1 - 0.84 * Math.pow(ease(v), 0.9) + 0.06 * Math.sin(Math.PI * v);
      const y = -BAG_DEPTH * Math.pow(v, 0.85);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        this.curve.getPoint(u % 1, p);
        const k = j * (NU + 1) + i;
        pos[k * 3] = p.x * shrink; pos[k * 3 + 1] = y; pos[k * 3 + 2] = 0.02 + (p.z - 0.02) * shrink;
        uv[k * 2] = u * 56; uv[k * 2 + 1] = v * 18;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + NU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
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

  show(): void {
    this.visible = true;
    this.time = 0;
    this.splashed = false;
    for (const w of this.weeds) { w.visible = Math.random() < 0.6; w.position.set((Math.random() - 0.5) * 0.08, -BAG_DEPTH * (0.7 + Math.random() * 0.2), 0.02 + (Math.random() - 0.5) * 0.06); w.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); }
  }

  hide(): void {
    this.visible = false;
    this.setCatch(null);
  }

  /** Place the net for this frame from the capture state (null = at rest, out of sight). */
  update(camera: PerspectiveCamera, dt: number, st: CaptureState | null, waterY: number): void {
    this.time += dt;
    const want = this.visible && !!st;
    this.shown = MathUtils.damp(this.shown, want ? 1 : 0, 9, dt);
    if (this.shown < 0.01 && !want) { this.group.visible = false; this.updateDrops(dt, null); return; }
    this.group.visible = true;
    const cur = this.cur;
    const sway = this.time;
    let dripping = false;
    let roll = 0;
    if (!st || st.phase === 'aim') {
      lerpPose(P_HIDDEN, P_READY, ease(this.shown), cur);
      cur.p.y += Math.sin(sway * 1.9) * 0.008;
      cur.p.x += Math.sin(sway * 1.3 + 0.5) * 0.005;
      roll = Math.sin(sway * 1.3) * 0.03;
      this.bagMat.roughness = MathUtils.damp(this.bagMat.roughness, 0.6, 2, dt);
    } else if (st.phase === 'swing') {
      const t = st.elapsed / CAPTURE_PHASE_SEC.swing;
      if (t < 0.5) lerpPose(P_READY, P_DIP, ease(t / 0.5), cur);
      else lerpPose(P_DIP, P_SCOOP, ease((t - 0.5) / 0.5), cur);
      if (t >= 0.42 && !this.splashed) { this.splashed = true; this.splash(camera, waterY); }
      this.bagMat.roughness = 0.3;
    } else if (st.phase === 'lift') {
      const t = ease(st.elapsed / CAPTURE_PHASE_SEC.lift);
      lerpPose(P_SCOOP, P_CHECK, t, cur);
      dripping = t > 0.5;
    } else if (st.phase === 'check') {
      lerpPose(P_CHECK, P_CHECK, 0, cur);
      // the hands are not quite still
      cur.p.x += Math.sin(sway * 3.1) * 0.0025;
      cur.p.y += Math.sin(sway * 2.4 + 0.7) * 0.003;
      cur.hands.x += Math.sin(sway * 2.0 + 2) * 0.004;
      roll = Math.sin(sway * 1.7) * 0.015;
      dripping = st.elapsed < REVEAL_SEC + 0.9;
    } else {
      const t = ease(st.elapsed / CAPTURE_PHASE_SEC.done);
      lerpPose(P_CHECK, P_HIDDEN, t, cur);
    }
    // the bag is on the far side of the hoop from the eye while checking; only then is the catch lit for the eye
    this.catchHolder.visible = !!st && (st.phase === 'check' || st.phase === 'done') && st.revealed;
    if (this.catchObj && this.catchHolder.visible) this.flop(st!.elapsed);
    // the handle (local +z) runs from the hoop to the hands; the hoop plane holds it, the opening faces local +y
    this.az.subVectors(cur.hands, cur.p).normalize();
    this.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.ax.crossVectors(this.up, this.az).normalize();
    this.ay.crossVectors(this.az, this.ax);
    this.tmpM.makeBasis(this.ax, this.ay, this.az);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    // camera space → world
    camera.updateMatrixWorld();
    this.group.position.copy(cur.p).applyMatrix4(camera.matrixWorld);
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
    this.catchHolder.position.y = -BAG_DEPTH * 0.86 + Math.abs(wobble) * 0.012;
    obj.position.x = Math.sin(t * 0.7) * 0.01;
  }

  /** The hoop breaking the water: a burst of droplets from the front edge. */
  private splash(camera: PerspectiveCamera, waterY: number): void {
    camera.updateMatrixWorld();
    const base = this.tmpV.copy(P_DIP.p).applyMatrix4(camera.matrixWorld);
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
        const u = Math.random(), v = 0.45 + Math.random() * 0.55;
        const shrink = 1 - 0.84 * Math.pow(ease(v), 0.9) + 0.06 * Math.sin(Math.PI * v);
        this.curve.getPoint(u, this.tmpV);
        this.tmpV.set(this.tmpV.x * shrink, -BAG_DEPTH * Math.pow(v, 0.85), 0.02 + (this.tmpV.z - 0.02) * shrink).applyMatrix4(bagWorld);
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
    this.group.removeFromParent();
    this.drops.removeFromParent();
    this.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.bagMat.alphaMap?.dispose();
    this.bagMat.dispose();
  }
}
