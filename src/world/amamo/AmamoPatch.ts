import { BufferGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Sphere, Vector3 } from 'three';
import { Rng } from '../../core/Rng';
import { LEAF_TIERS, SHEATH_TIERS, type AmamoKit, type Lod } from './kit';
import { LEAF, RHIZOME, SHOOT, smoothstep } from './params';

export type PatchKind = 'dense' | 'sparse' | 'pioneer' | 'single';

/** What a patch needs to know about the ground it grows on (the Terrain, or a flat bed in the viewer). */
export interface GroundSampler {
  heightAt(x: number, z: number): number;
  /** level of water held above the tide here (a tide pool), or a very low number */
  poolAt?(x: number, z: number): number;
  /** may a shoot grow here (substrate, a stingray pit, a bare hole in the meadow)? */
  accept?(x: number, z: number): boolean;
}

/** Minimum spacing between shoots, shared by the patches of a meadow so overlapping clones do not double up. */
export class ShootGrid {
  private readonly cells = new Map<number, number[]>();
  constructor(readonly cell = 0.1) {}
  private key(i: number, j: number): number { return (j + 40000) * 80000 + (i + 40000); }
  free(x: number, z: number, r: number): boolean {
    const c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.cells.get(this.key(i, j));
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) { const dx = list[k] - x, dz = list[k + 1] - z; if (dx * dx + dz * dz < r2) return false; }
    }
    return true;
  }
  add(x: number, z: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let list = this.cells.get(k);
    if (!list) { list = []; this.cells.set(k, list); }
    list.push(x, z);
  }
}

export interface PatchOptions {
  x: number;
  z: number;
  /** mean radius of the clone (m); the outline is irregular */
  radius: number;
  /** shoots per m² in the core (thinner toward the edge) */
  density: number;
  kind: PatchKind;
  seed: number;
  ground: GroundSampler;
  kit: AmamoKit;
  grid?: ShootGrid;
  /** leaf length factor of the clone */
  vigour?: number;
  maxShoots?: number;
  /** show the rhizome and roots lying on the sand (a washed-out edge, or a specimen); otherwise only where the edge is scoured */
  exposeRhizome?: boolean;
  /** longest-leaf length for a ground height (default: by the T.P. height, SHOOT.lengthAt) */
  lengthAt?: (groundY: number) => number;
}

/** One shoot, as generated (also returned for tests and tools). */
export interface ShootSpec {
  x: number; y: number; z: number;
  fan: number; length: number; leaves: number; seed: number;
  width: number; age: number; gx: number; gz: number;
  pool: number; edge: number; sheath: number; layer: number;
}

interface RhizomeNode { x: number; z: number; parent: number; rel: number; order: number }
/** The grown clone: its shoots and the rhizome nodes they hang on. */
export interface Grown { shoots: ShootSpec[]; nodes: RhizomeNode[] }

/** The irregular outline of a clone: its radius at an angle (deterministic from the seed, so a meadow can test it before growing the patch). */
export function patchOutline(seed: number, radius: number, kind: PatchKind): (angle: number) => number {
  const rng = new Rng((seed ^ 0x2545f491) >>> 0);
  const ph = [rng.range(0, 6.283), rng.range(0, 6.283), rng.range(0, 6.283)];
  const amp = kind === 'single' ? [0, 0, 0] : [0.17, 0.11, 0.07].map((a) => a * rng.range(0.6, 1.4));
  return (a: number) => radius * (1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]));
}

const UP = new Vector3(0, 1, 0);

/**
 * A clonal patch of アマモ: shoots strung along branching rhizomes, grown outward from a few founders, older and
 * denser in the middle and younger, shorter and sparser at the edge.
 *
 * AmamoPatch (Group, at the patch centre)
 * ├── LeafCluster   InstancedMesh, one instance per shoot (2–7 blades each, bent in the vertex shader)
 * ├── Base          InstancedMesh, the sheath of each shoot
 * └── Root/Rhizome  Group: Rhizome (internodes) and Roots, only where they lie exposed on the sand
 *
 * Every instance is a shoot; per-shoot data lives in instanced attributes and the shared materials do the rest, so a
 * patch is three draw calls whatever its size. Instances are shuffled, so drawing the first n is a uniform thinning.
 */
export class AmamoPatch extends Group {
  readonly kind: PatchKind;
  readonly cx: number;
  readonly cz: number;
  /** distance from the centre that contains every shoot (m) */
  readonly reach: number;
  readonly shootCount: number;
  readonly meanLength: number;
  readonly maxLength: number;
  readonly groundY: number;
  readonly shoots: ShootSpec[];
  readonly leafCluster: InstancedMesh;
  readonly base: InstancedMesh;
  readonly rootRhizome: Group;
  lod: Lod | -1 = 0;
  private readonly leafGeos: BufferGeometry[];
  private readonly sheathGeos: BufferGeometry[];
  private readonly rhizome: InstancedMesh | null;
  private readonly roots: InstancedMesh | null;

  /** `grown`: the clone already grown (AmamoPatch.growSteps run elsewhere, a little each frame); else it is grown here. */
  constructor(private readonly opts: PatchOptions, grown?: Grown) {
    super();
    const { kit } = opts;
    this.kind = opts.kind;
    this.cx = opts.x;
    this.cz = opts.z;
    const { shoots, nodes } = grown ?? AmamoPatch.grow(opts);
    this.shoots = shoots;
    const n = shoots.length;
    this.shootCount = n;
    this.position.set(opts.x, 0, opts.z);
    this.name = 'AmamoPatch';
    let reach = 0, sumL = 0, maxL = 0, sumY = 0;
    for (const s of shoots) { reach = Math.max(reach, Math.hypot(s.x - opts.x, s.z - opts.z)); sumL += s.length; maxL = Math.max(maxL, s.length); sumY += s.y; }
    this.reach = reach;
    this.meanLength = n ? sumL / n : 0;
    this.maxLength = maxL;
    this.groundY = n ? sumY / n : opts.ground.heightAt(opts.x, opts.z);

    // per-shoot attributes (shared by every tier's geometry)
    const A = new Float32Array(Math.max(1, n) * 4), B = new Float32Array(Math.max(1, n) * 4), C = new Float32Array(Math.max(1, n) * 4);
    shoots.forEach((s, i) => {
      A.set([s.fan, s.length, s.leaves, s.seed], i * 4);
      B.set([s.width, s.age, s.gx, s.gz], i * 4);
      C.set([s.pool, s.edge, s.sheath, s.layer], i * 4);
    });
    const aA = new InstancedBufferAttribute(A, 4), aB = new InstancedBufferAttribute(B, 4), aC = new InstancedBufferAttribute(C, 4);
    const wrap = (src: BufferGeometry): BufferGeometry => {
      const g = new BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
      g.setIndex(src.index);
      g.setAttribute('aShootA', aA); g.setAttribute('aShootB', aB); g.setAttribute('aShootC', aC);
      g.boundingSphere = src.boundingSphere?.clone() ?? null;
      return g;
    };
    this.leafGeos = kit.leafGeo.map(wrap);
    this.sheathGeos = kit.sheathGeo.map(wrap);

    const count = Math.max(1, n);
    this.leafCluster = new InstancedMesh(this.leafGeos[0], kit.leafMat[0], count);
    this.leafCluster.name = 'LeafCluster';
    const m = new Matrix4();
    shoots.forEach((s, i) => this.leafCluster.setMatrixAt(i, m.makeTranslation(s.x - opts.x, s.y, s.z - opts.z)));
    this.leafCluster.count = n;
    this.leafCluster.customDepthMaterial = kit.leafDepth[0];
    this.leafCluster.receiveShadow = true;
    // the blades bend anywhere within their length of the base
    this.leafCluster.boundingSphere = new Sphere(new Vector3(0, this.groundY, 0), reach + maxL + 0.05);
    this.base = new InstancedMesh(this.sheathGeos[0], kit.sheathMat[0], count);
    this.base.name = 'Base';
    this.base.instanceMatrix = this.leafCluster.instanceMatrix;
    this.base.count = n;
    this.base.customDepthMaterial = kit.sheathDepth[0];
    this.base.receiveShadow = true;
    this.base.boundingSphere = new Sphere(new Vector3(0, this.groundY, 0), reach + 0.25);

    this.rootRhizome = new Group();
    this.rootRhizome.name = 'Root/Rhizome';
    const built = this.buildRhizome(nodes);
    this.rhizome = built.rhizome;
    this.roots = built.roots;
    if (this.rhizome) this.rootRhizome.add(this.rhizome);
    if (this.roots) this.rootRhizome.add(this.roots);
    this.add(this.leafCluster, this.base, this.rootRhizome);
  }

  /** Grow the clone: runners from a few founders, a shoot every node or two where there is room. */
  static grow(opts: PatchOptions): Grown {
    const it = AmamoPatch.growSteps(opts);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }

  /** The same, yielding every few hundred runner steps so a caller can spread the work over frames. */
  static *growSteps(opts: PatchOptions): Generator<void, Grown, void> {
    const rng = new Rng(opts.seed);
    const { x: cx, z: cz, radius: R, density, kind, ground } = opts;
    const grid = opts.grid ?? new ShootGrid();
    const vigour = opts.vigour ?? 1;
    const limit = patchOutline(opts.seed, R, kind);
    const target = kind === 'single' ? 1 : Math.min(opts.maxShoots ?? 6000, Math.max(1, Math.round(Math.PI * R * R * density)));
    const ok = (x: number, z: number) => (ground.accept ? ground.accept(x, z) : true);
    const shoots: ShootSpec[] = [];
    const nodes: RhizomeNode[] = [];
    // the edge of a patch is a front of young shoots; the middle has the old ones
    const maturityAt = (rel: number) => {
      const base = kind === 'pioneer' ? 0.55 : kind === 'single' ? 0.85 : 1;
      return Math.max(0.12, Math.min(1, base * (1 - 0.62 * smoothstep(0.45, 1.0, rel)) + rng.normal() * 0.12));
    };
    const addShoot = (x: number, z: number, heading: number, rel: number) => {
      const y = ground.heightAt(x, z);
      const m = maturityAt(rel);
      const length = (opts.lengthAt ?? SHOOT.lengthAt)(y) * vigour * (0.6 + 0.4 * m) * rng.range(0.85, 1.15);
      const leaves = m < 0.35 ? rng.int(2, 3) : m < 0.7 ? rng.int(3, 5) : Math.min(SHOOT.leavesMax, rng.int(4, 6) + (rng.chance(0.08) ? 1 : 0));
      const wl = Math.max(0, Math.min(1, (length - 0.28) / 0.6));
      const width = (LEAF.widthMin + (LEAF.widthMax - LEAF.widthMin) * wl) * rng.range(0.85, 1.15);
      const e = 0.25;
      const gx = (ground.heightAt(x + e, z) - ground.heightAt(x - e, z)) / (2 * e);
      const gz = (ground.heightAt(x, z + e) - ground.heightAt(x, z - e)) / (2 * e);
      shoots.push({
        x, y, z,
        fan: heading + Math.PI / 2 + rng.normal() * 0.35,
        length, leaves, seed: rng.next(),
        width,
        age: Math.max(0, Math.min(1, m * 0.75 + rng.next() * 0.35 - 0.1)),
        gx: Math.max(-0.2, Math.min(0.2, gx)), gz: Math.max(-0.2, Math.min(0.2, gz)),
        pool: ground.poolAt ? ground.poolAt(x, z) : -1e3,
        edge: Math.min(1, rel),
        sheath: Math.max(SHOOT.sheathMin, Math.min(SHOOT.sheathMax, (0.055 + 0.14 * length) * rng.range(0.8, 1.2))),
        layer: rng.next(),
      });
      grid.add(x, z);
    };
    const spacingAt = (rel: number) => 0.75 / Math.sqrt(Math.max(1, density * (1 - 0.55 * smoothstep(0.55, 1.0, rel))));

    if (kind === 'single') {
      // one plant: its shoot and a short run of rhizome behind it, as dug up and laid on the sand
      const h = rng.range(0, 6.283);
      let px = cx, pz = cz, prev = -1;
      for (let k = 0; k < 6; k++) {
        nodes.push({ x: px, z: pz, parent: prev, rel: 1, order: k });
        prev = nodes.length - 1;
        const step = rng.range(RHIZOME.internodeMin, RHIZOME.internodeMax) * 1.4;
        px -= Math.cos(h + rng.normal() * 0.15) * step; pz -= Math.sin(h + rng.normal() * 0.15) * step;
      }
      addShoot(cx, cz, h, 0);
      return { shoots, nodes };
    }

    interface Apex { x: number; z: number; h: number; node: number; since: number; blocked: number; turns: number }
    const apices: Apex[] = [];
    const founders = kind === 'pioneer' ? 1 : 1 + rng.int(0, 2);
    for (let f = 0; f < founders; f++) {
      const a = rng.range(0, 6.283), d = rng.next() * R * 0.25;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!ok(x, z)) continue;
      nodes.push({ x, z, parent: -1, rel: d / R, order: 0 });
      const h = rng.range(0, 6.283);
      if (grid.free(x, z, spacingAt(0))) addShoot(x, z, h, d / R);
      for (let b = 0; b < 2; b++) apices.push({ x, z, h: h + b * Math.PI + rng.normal() * 0.3, node: nodes.length - 1, since: 0, blocked: 0, turns: 0 });
    }
    let iter = 0;
    const maxIter = target * 16 + 200;
    while (apices.length && shoots.length < target && iter++ < maxIter) {
      if (iter % 256 === 0) yield;
      const ai = Math.floor(rng.next() * apices.length);
      const a = apices[ai];
      a.h += rng.normal() * 0.22;
      const step = rng.range(RHIZOME.internodeMin, RHIZOME.internodeMax) * 1.8;
      const nx = a.x + Math.cos(a.h) * step, nz = a.z + Math.sin(a.h) * step;
      const dx = nx - cx, dz = nz - cz, r = Math.hypot(dx, dz), lim = limit(Math.atan2(dz, dx));
      if (r > lim || !ok(nx, nz)) {
        // the runner met the edge (or bare ground): it turns back once or twice, then stops
        if (a.turns < 2) { a.h += (rng.chance(0.5) ? 1 : -1) * rng.range(1.2, 2.2); a.turns++; continue; }
        apices.splice(ai, 1);
        continue;
      }
      const rel = r / lim;
      nodes.push({ x: nx, z: nz, parent: a.node, rel, order: nodes[a.node].order + 1 });
      a.x = nx; a.z = nz; a.node = nodes.length - 1; a.since++;
      if (a.since >= 1 && grid.free(nx, nz, spacingAt(rel))) { addShoot(nx, nz, a.h, rel); a.since = 0; a.blocked = 0; }
      else if (++a.blocked > 7) { apices.splice(ai, 1); continue; }
      if (apices.length < 48 && rng.chance(0.15)) apices.push({ x: nx, z: nz, h: a.h + (rng.chance(0.5) ? 1 : -1) * rng.range(0.5, 1.2), node: a.node, since: 0, blocked: 0, turns: 0 });
    }
    // where the runners left gaps, shoots from rhizomes that run buried (not drawn)
    for (let tries = 0; shoots.length < target * 0.85 && tries < target * 6; tries++) {
      if (tries % 256 === 255) yield;
      const a = rng.range(0, 6.283), d = Math.sqrt(rng.next()) * limit(a);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, rel = d / limit(a);
      if (!ok(x, z) || !grid.free(x, z, spacingAt(rel))) continue;
      addShoot(x, z, rng.range(0, 6.283), rel);
    }
    // shuffle: the first n instances are then a uniform thinning (far tiers, low quality)
    for (let i = shoots.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [shoots[i], shoots[j]] = [shoots[j], shoots[i]]; }
    return { shoots, nodes };
  }

  /** Internodes and roots that lie exposed: the scoured edge of a patch, a pioneer runner on bare sand, a specimen. */
  private buildRhizome(nodes: RhizomeNode[]): { rhizome: InstancedMesh | null; roots: InstancedMesh | null } {
    const { kit, ground, kind } = this.opts;
    const rng = new Rng(this.opts.seed ^ 0x5bd1e995);
    const expose = this.opts.exposeRhizome ? 1 : kind === 'pioneer' ? 0.9 : kind === 'sparse' ? 0.7 : kind === 'single' ? 1 : 0.45;
    const segs: Matrix4[] = [], cols: Color[] = [], roots: Matrix4[] = [];
    const a = new Vector3(), b = new Vector3(), d = new Vector3(), q = new Quaternion(), s = new Vector3();
    const maxOrder = nodes.reduce((mx, n) => Math.max(mx, n.order), 1);
    const young = new Color(0.62, 0.56, 0.36), old = new Color(0.3, 0.21, 0.11);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.parent < 0) continue;
      const e = (this.opts.exposeRhizome || kind === 'single') ? 1 : smoothstep(0.72, 1.02, n.rel) * expose + (rng.chance(0.035) ? 0.6 : 0);
      if (e < 0.45) continue;
      const p = nodes[n.parent];
      const r = RHIZOME.radiusMin + (RHIZOME.radiusMax - RHIZOME.radiusMin) * (1 - n.order / maxOrder) * rng.range(0.8, 1.1);
      // half sunk in the sand
      const sink = r * (0.15 + 0.5 * (1 - e) + 0.3 * rng.next());
      a.set(p.x - this.cx, ground.heightAt(p.x, p.z) - sink, p.z - this.cz);
      b.set(n.x - this.cx, ground.heightAt(n.x, n.z) - sink, n.z - this.cz);
      d.subVectors(b, a);
      const len = d.length();
      if (len < 1e-4) continue;
      q.setFromUnitVectors(UP, d.normalize());
      segs.push(new Matrix4().compose(a, q, s.set(r, len, r)));
      cols.push(young.clone().lerp(old, Math.min(1, (1 - n.order / maxOrder) * 0.8 + rng.next() * 0.3)));
      // two bundles of roots at the node, reaching down into the sand
      if (rng.chance(0.75)) for (let k = 0; k < 2 + rng.int(0, 3); k++) {
        const az = rng.range(0, 6.283), dip = rng.range(0.25, 1.1);
        d.set(Math.cos(az) * Math.cos(dip), -Math.sin(dip), Math.sin(az) * Math.cos(dip));
        q.setFromUnitVectors(UP, d);
        const rl = rng.range(RHIZOME.rootLenMin, RHIZOME.rootLenMax);
        roots.push(new Matrix4().compose(b, q, s.set(RHIZOME.rootRadius * rng.range(0.7, 1.3), rl, RHIZOME.rootRadius * rng.range(0.7, 1.3))));
      }
    }
    let rhizome: InstancedMesh | null = null, rootMesh: InstancedMesh | null = null;
    if (segs.length) {
      rhizome = new InstancedMesh(kit.tubeGeo, kit.rhizomeMat, segs.length);
      rhizome.name = 'Rhizome';
      segs.forEach((mm, i) => { rhizome!.setMatrixAt(i, mm); rhizome!.setColorAt(i, cols[i]); });
      rhizome.computeBoundingSphere();
    }
    if (roots.length) {
      rootMesh = new InstancedMesh(kit.tubeGeo, kit.rootMat, roots.length);
      rootMesh.name = 'Roots';
      roots.forEach((mm, i) => rootMesh!.setMatrixAt(i, mm));
      rootMesh.computeBoundingSphere();
    }
    return { rhizome, roots: rootMesh };
  }

  /**
   * Detail by distance: 0 full (all blades, 12 segments with a midrib, flutter, sheaths, exposed rhizome),
   * 1 (≤5 blades, 7 segments, plain sheaths), 2 (3 wider blades, 4 segments, no sheath, fewer shoots), -1 hidden.
   * `density` thins every tier (quality); `shadowLod` is the coarsest tier that still casts shadows (-1: none).
   */
  setLod(lod: Lod | -1, density = 1, shadowLod = 0): void {
    this.lod = lod;
    if (lod === -1) { this.visible = false; return; }
    this.visible = true;
    const { kit } = this.opts;
    const frac = density * (lod === 2 ? 0.45 : lod === 1 ? 0.8 : 1);
    const count = this.kind === 'single' ? this.shootCount : Math.max(1, Math.round(this.shootCount * frac));
    const lc = this.leafCluster;
    lc.geometry = this.leafGeos[lod];
    lc.material = kit.leafMat[lod];
    lc.customDepthMaterial = kit.leafDepth[lod];
    lc.count = Math.min(count, this.shootCount);
    lc.castShadow = lod <= shadowLod;
    const sheathTier = lod < SHEATH_TIERS.length ? lod : -1;
    this.base.visible = sheathTier >= 0;
    if (sheathTier >= 0) {
      this.base.geometry = this.sheathGeos[sheathTier];
      this.base.material = kit.sheathMat[sheathTier];
      this.base.customDepthMaterial = kit.sheathDepth[sheathTier];
      this.base.count = lc.count;
      this.base.castShadow = lod <= shadowLod;
    }
    this.rootRhizome.visible = lod === 0;
  }

  /** Vertices the leaf cluster draws at its current tier (stats). */
  get drawnVertices(): number {
    if (!this.visible || this.lod === -1) return 0;
    const t = LEAF_TIERS[this.lod];
    return this.leafCluster.count * (t.nseg + 1) * t.across * t.leaves;
  }

  override dispose(): void {
    this.removeFromParent();
    for (const g of [...this.leafGeos, ...this.sheathGeos]) g.dispose();
    this.rhizome?.dispose();
    this.roots?.dispose();
    this.leafCluster.dispose();
    this.base.dispose();
  }
}
