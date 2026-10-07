import { Bone, Group, Matrix4, Skeleton, SkinnedMesh, Sphere, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import {
  BONE_COUNT, LATTICE_BASE, LATTICE_COLS, LATTICE_ROWS, TAIL_BASE, TAIL_BONES, akaeiGeometries, bindPosition, latticeU, latticeZ, type Lod,
} from './geometry';
import { MORPH, dorsalHeight, halfWidth, trunkBump, ventralDepth } from './morphology';
import { makeEyeMaterial, makeInteriorMaterial, makeSkinMaterial, makeStingMaterial, skinUniforms, type SkinLook, type SkinUniforms } from './material';

/**
 * The pose of the disc, set by the driver every frame and turned into the lattice bones by AkaeiModel.
 *
 * The swimming wave runs from the snout back along both pectoral fins [Blevins & Lauder 2012; Rosenberger 2001]:
 *   y = amp · A(s) · m(u) · sin(phase − 2π·waves·s − lag·m(u))
 * where s runs 0 (snout) … 1 (rear), A(s) is small at the head and full from mid-disc back, and m(u) is 0 over the
 * rigid trunk, growing toward the margin. Both fins beat in phase going straight; a turn beats the outer fin harder and
 * advances its wave. On top of it: a standing flap (burrowing, taking off), a static camber of the margins (up in a
 * glide, pressed down at rest), the head pumping (burrowing, feeding: the disc rises and falls over the head), the drape
 * of the margins onto uneven ground, and the breath.
 */
export class AkaeiPose {
  phase = 0;
  /** margin amplitude of the travelling wave (DW) */
  amp = 0;
  /** waves on the disc at once (≈1 for this undulatory ray) */
  waves = 1.05;
  /** -1 … 1: turning toward +X (the animal's left) */
  turn = 0;
  /** standing oscillation of the whole margin (DW) and its phase */
  flapAmp = 0;
  flapPhase = 0;
  /** static lift of the margins (DW; negative = pressed down) */
  camber = 0;
  /** the front of the disc lifted (DW): the snout up in a landing flare or while feeding */
  frontLift = 0;
  /** head pump (DW): the trunk over the head pushed down (+) or lifted (-) */
  pump = 0;
  /** breathing: 0..1 */
  breath = 0;
  /** 0..1: how much the margins follow the ground under them */
  drapeK = 0;
  /** per lattice bone: where the ground is relative to the underside there (model units; the drape target) */
  readonly drape = new Float32Array(LATTICE_ROWS * LATTICE_COLS);
  /** tail points in model space (TAIL_BONES); null = straight back */
  tail: Float32Array | null = null;
  /** openings 0..1 */
  spiracle = 0;
  mouth = 0;
  gills = 0;
}

const span = MORPH.zSnout - MORPH.zEnd;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** precomputed per lattice bone: bind x, z, s, u and how flexible the disc is there */
interface Node { x: number; z: number; s: number; u: number; flex: number; trunk: number; belly: number }

const NODES: Node[] = (() => {
  const out: Node[] = [];
  for (let r = 0; r < LATTICE_ROWS; r++) for (let c = 0; c < LATTICE_COLS; c++) {
    const z = latticeZ(r), u = latticeU(c), w = halfWidth(z), x = u * w;
    const tb = trunkBump(x, z, 1.15);
    // the fin flexes outside the trunk, and more toward its margin; the pelvic region and the tail base are stiff
    const fin = Math.pow(Math.max(0, 1 - tb), 1.4) * Math.pow(Math.abs(u), 1.25);
    const rearStiff = 1 - smooth(MORPH.zRear + 0.02, MORPH.zRear - 0.05, z);
    out.push({ x, z, s: (MORPH.zSnout - z) / span, u, flex: fin * rearStiff, trunk: tb, belly: ventralDepth(x, z) });
  }
  return out;
})();

/** the resting belly line: the deepest point of the trunk, which sits on the sand */
export const BELLY = Math.max(...NODES.map((n) => n.belly));

function waveEnvelope(s: number): number {
  // small at the head, full from about mid-disc back [Blevins & Lauder 2012: amplitude rises to mid-disc, then holds;
  // PHOTO 004, 069: the crest is in the rear half, the front of the disc much flatter]
  return 0.12 + 0.88 * smooth(0.06, 0.55, s);
}

/** the static lift of the margins at a node (what the drape replaces on the bottom) */
function camberY(p: AkaeiPose, n: Node, side: number): number {
  return p.camber * Math.pow(n.flex, 1.4) * (1 - side * p.turn * 0.4);
}

/** the disc's displacement (model units, +y up) at a lattice node, without the camber */
function fieldY(p: AkaeiPose, n: Node, side: number): number {
  const m = n.flex;
  // the outer fin of a turn beats harder and leads
  const turnK = 1 - p.turn * side * 0.55;
  let y = 0;
  if (p.amp > 0) y += p.amp * turnK * waveEnvelope(n.s) * m * Math.sin(p.phase - 2 * Math.PI * p.waves * n.s - 0.7 * m - p.turn * side * 0.35);
  if (p.flapAmp !== 0) y += p.flapAmp * Math.pow(m, 1.15) * Math.sin(p.flapPhase - 1.3 * n.s);
  // the snout and the front margins lift together (the disc's front curls up)
  y += p.frontLift * smooth(0.45, 0.0, n.s) * (0.35 + 0.65 * Math.abs(n.u));
  // head pump: the trunk over the head and gills presses down, the fins follow less
  y -= p.pump * smooth(0.65, 0.1, n.s) * (0.4 + 0.6 * n.trunk);
  y += p.breath * 0.0018 * n.trunk * smooth(0.0, 0.3, n.s) * smooth(0.95, 0.55, n.s);
  return y;
}

const _m = new Matrix4(), _v = new Vector3(), _n = new Vector3(), _up = new Vector3(0, 1, 0);
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3();

/** one individual's rig: skeleton, the named skinned parts, LOD switching and posing */
export class AkaeiModel {
  readonly root = new Group();
  readonly bones: Bone[] = [];
  readonly skeleton: Skeleton;
  readonly disc: SkinnedMesh;
  readonly tail: SkinnedMesh;
  readonly sting: SkinnedMesh;
  readonly eyeL: SkinnedMesh;
  readonly eyeR: SkinnedMesh;
  readonly spiracleL: SkinnedMesh;
  readonly spiracleR: SkinnedMesh;
  readonly mouth: SkinnedMesh;
  readonly skin: Material;
  readonly skinCheap: Material;
  /** shared by the full and the LOD2 skin */
  readonly uniforms: SkinUniforms;
  private readonly eyeMat: Material;
  private readonly eyeMatCheap: Material;
  private readonly interior: Material;
  private readonly stingMat: Material;
  private readonly stingMatCheap: Material;
  lod: Lod = 0;
  /** world-space y of the belly / tail bottoms are found from these (model units) */
  readonly ys = new Float32Array(LATTICE_ROWS * LATTICE_COLS);

  constructor(look: SkinLook, lod: Lod = 0) {
    this.root.name = 'AkaeiRoot';
    const rootBone = new Bone();
    rootBone.name = 'AkaeiSpine';
    this.bones.push(rootBone);
    for (let i = 1; i < BONE_COUNT; i++) {
      const b = new Bone();
      if (i < TAIL_BASE) { const k = i - LATTICE_BASE; b.name = `Disc_${Math.floor(k / LATTICE_COLS)}_${k % LATTICE_COLS}`; } else b.name = `Tail_${i - TAIL_BASE}`;
      bindPosition(i, b.position);
      rootBone.add(b);
      this.bones.push(b);
    }
    this.root.add(rootBone);
    this.root.updateMatrixWorld(true);
    this.skeleton = new Skeleton(this.bones);

    this.skin = makeSkinMaterial(look, false);
    this.uniforms = skinUniforms(this.skin);
    this.skinCheap = makeSkinMaterial(look, true, this.uniforms);
    this.eyeMat = makeEyeMaterial(false);
    this.eyeMatCheap = makeEyeMaterial(true);
    this.interior = makeInteriorMaterial();
    this.stingMat = makeStingMaterial(false);
    this.stingMatCheap = makeStingMaterial(true);

    const g = akaeiGeometries(lod);
    const mk = (name: string, geo: BufferGeometry, mat: Material | Material[], parent: Object3D = this.root): SkinnedMesh => {
      const m = new SkinnedMesh(geo, mat);
      m.name = name;
      parent.add(m);
      m.updateMatrixWorld(true);
      m.bind(this.skeleton);
      m.castShadow = true;
      m.receiveShadow = false;
      return m;
    };
    this.disc = mk('DiscBody', g.disc, this.skin);
    this.tail = mk('Tail', g.tail, this.skin);
    this.sting = mk('TailSting', g.sting, this.stingMat, this.tail);
    this.eyeL = mk('Eye_L', g.eyeL, this.eyeMat);
    this.eyeR = mk('Eye_R', g.eyeR, this.eyeMat);
    const lg = akaeiGeometries(0);
    this.spiracleL = mk('Spiracle_L', g.spiracleL ?? lg.spiracleL!, [this.skin, this.interior]);
    this.spiracleR = mk('Spiracle_R', g.spiracleR ?? lg.spiracleR!, [this.skin, this.interior]);
    this.mouth = mk('MouthAndGillArea', g.mouth ?? lg.mouth!, [this.skin, this.interior]);
    for (const m of [this.eyeL, this.eyeR, this.spiracleL, this.spiracleR, this.mouth, this.sting]) m.castShadow = false;
    // the skinned parts move within these (model units): the disc and head about the trunk, the tail within its reach
    const discSphere = new Sphere(new Vector3(0, 0, 0), 0.75);
    for (const m of [this.disc, this.eyeL, this.eyeR, this.spiracleL, this.spiracleR, this.mouth]) m.boundingSphere = discSphere.clone();
    const tailSphere = new Sphere(new Vector3(0, 0, MORPH.zEnd), MORPH.tailLength * 1.05);
    this.tail.boundingSphere = tailSphere;
    this.sting.boundingSphere = tailSphere.clone();
    this.lod = -1 as Lod;
    this.setLod(lod);
    this.pose(new AkaeiPose());
  }

  /** swap the shared geometry and the materials of a detail level */
  setLod(lod: Lod): void {
    if (lod === this.lod) return;
    this.lod = lod;
    const g = akaeiGeometries(lod);
    const cheap = lod === 2;
    this.disc.geometry = g.disc;
    this.tail.geometry = g.tail;
    this.sting.geometry = g.sting;
    this.eyeL.geometry = g.eyeL;
    this.eyeR.geometry = g.eyeR;
    this.disc.material = cheap ? this.skinCheap : this.skin;
    this.tail.material = cheap ? this.skinCheap : this.skin;
    this.eyeL.material = this.eyeR.material = cheap ? this.eyeMatCheap : this.eyeMat;
    this.sting.material = cheap ? this.stingMatCheap : this.stingMat;
    if (g.spiracleL && g.spiracleR && g.mouth) {
      this.spiracleL.geometry = g.spiracleL;
      this.spiracleR.geometry = g.spiracleR;
      this.mouth.geometry = g.mouth;
    }
    for (const m of [this.spiracleL, this.spiracleR, this.mouth]) { m.visible = !cheap; m.updateMorphTargets(); }
    // fine relief and translucency only near; the sting is too small to shadow anything
    this.tail.castShadow = lod < 2;
  }

  /** set every bone from the pose */
  pose(p: AkaeiPose): void {
    const ys = this.ys;
    // displacement, then the slopes from it, then pull the fin in so its chord keeps its length
    for (let i = 0; i < NODES.length; i++) {
      const n = NODES[i];
      const side = Math.sign(n.u) || 1;
      let y = fieldY(p, n, side);
      // on the bottom the margins lie on the sand (or just under it) instead of holding their camber
      const k = p.drapeK * Math.max(0, Math.min(1, n.flex * 2.5 + 0.1));
      y += camberY(p, n, side) * (1 - k) + p.drape[i] * k;
      ys[i] = y;
    }
    const C = LATTICE_COLS, mid = (C - 1) / 2;
    for (let r = 0; r < LATTICE_ROWS; r++) {
      const z = latticeZ(r);
      const w = halfWidth(z);
      for (const dir of [-1, 1]) {
        let px = 0;
        for (let k = 0; k <= mid; k++) {
          const c = mid + dir * k;
          const i = r * C + c;
          const n = NODES[i];
          let x = n.x;
          if (k > 0) {
            const iPrev = r * C + c - dir;
            const L = Math.abs(n.x - NODES[iPrev].x);
            const dy = ys[i] - ys[iPrev];
            px += dir * Math.sqrt(Math.max(L * L * 0.25, L * L - dy * dy));
            x = px;
          }
          // slopes across (from the neighbours) and along (from the rows)
          const iL = r * C + Math.max(0, c - 1), iR = r * C + Math.min(C - 1, c + 1);
          const dxN = NODES[iR].x - NODES[iL].x;
          const sx = dxN > 1e-6 ? (ys[iR] - ys[iL]) / dxN : 0;
          const rF = Math.max(0, r - 1), rB = Math.min(LATTICE_ROWS - 1, r + 1);
          const dzN = latticeZ(rF) - latticeZ(rB);
          const sz = dzN > 1e-6 ? (ys[rF * C + c] - ys[rB * C + c]) / dzN : 0;
          const bone = this.bones[LATTICE_BASE + i];
          bone.position.set(w < 1e-4 ? 0 : x, ys[i], z);
          _n.set(-sx, 1, -sz).normalize();
          bone.quaternion.setFromUnitVectors(_up, _n);
        }
      }
    }
    // tail: from the follow chain, or straight back from the trunk
    const t = p.tail;
    const baseY = ys[(LATTICE_ROWS - 1) * C + mid];
    for (let j = 0; j < TAIL_BONES; j++) {
      const b = this.bones[TAIL_BASE + j];
      if (t) b.position.set(t[j * 3], t[j * 3 + 1], t[j * 3 + 2]);
      else { bindPosition(TAIL_BASE + j, b.position); b.position.y += baseY; }
    }
    for (let j = 0; j < TAIL_BONES; j++) {
      const b = this.bones[TAIL_BASE + j];
      const a = this.bones[TAIL_BASE + Math.min(TAIL_BONES - 1, j + 1)], prev = this.bones[TAIL_BASE + Math.max(0, j - 1)];
      if (j < TAIL_BONES - 1) _v.subVectors(a.position, b.position); else _v.subVectors(b.position, prev.position);
      if (_v.lengthSq() < 1e-12) _v.set(0, 0, -1);
      _z.copy(_v).normalize().negate();
      _x.crossVectors(_up, _z);
      if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
      _x.normalize();
      _y.crossVectors(_z, _x);
      _m.makeBasis(_x, _y, _z);
      b.quaternion.setFromRotationMatrix(_m);
    }
    // openings
    this.spiracleL.morphTargetInfluences![0] = this.spiracleR.morphTargetInfluences![0] = p.spiracle;
    const mi = this.mouth.morphTargetInfluences!;
    mi[0] = p.mouth;
    mi[1] = p.gills;
  }

  /** the bind-pose tail point j, lifted onto the trunk's end (model units) */
  static tailRest(j: number, out: Vector3): Vector3 {
    bindPosition(TAIL_BASE + j, out);
    return out;
  }

  /** model-space height of the disc's top at its middle (for anchors) */
  static topAt(z: number): number { return dorsalHeight(0, z); }


  dispose(): void {
    // geometry is shared; the materials and the skeleton belong to this individual
    for (const m of [this.skin, this.skinCheap, this.eyeMat, this.eyeMatCheap, this.interior, this.stingMat, this.stingMatCheap]) m.dispose();
    this.skeleton.dispose();
    this.root.removeFromParent();
  }
}
