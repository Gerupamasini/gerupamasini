import {
  BufferAttribute, CircleGeometry, Color, DoubleSide, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry,
  Vector2, Vector3, type Scene,
} from 'three';
import type { Habitat } from './Habitat';
import type { Terrain } from './Terrain';
import { Rng, hashInts } from '../core/Rng';

/**
 * Mudskipper burrows. トビハゼ dig J- or Y-shaped burrows 25–35 cm deep in soft mud, with one to three openings about
 * 1 cm across; the male digs with his mouth and spits the mud out in pellets around the entrance (Ishimatsu et al.
 * 2007; Mai et al. 2020). They hide in them from predators and from heat and drying at low tide, spend the night and
 * the winter in them, and breed in them. Each animal gets a home burrow near where it lives; the openings are drawn
 * as a dark hole in a low collar of wet mud with scattered pellets.
 */
export interface Burrow {
  id: number;
  x: number;
  z: number;
  y: number;
  /** horizontal direction the tunnel descends toward (radians, like a heading) */
  dir: number;
  /** opening radius (m) */
  r: number;
  owner: string | null;
  /** ground normal at the opening */
  normal: Vector3;
}

const SOFT = new Set(['mud', 'muddy_sand', 'channel']);

export class BurrowField {
  readonly group = new Group();
  private readonly list: Burrow[] = [];
  private readonly views = new Map<number, Group>();
  private readonly holeMat: MeshStandardMaterial;
  private readonly rimMat: MeshStandardMaterial;
  private readonly pelletMat: MeshStandardMaterial;
  private readonly holeGeo: CircleGeometry;
  private readonly rimGeo: LatheGeometry;
  private readonly pelletGeo: SphereGeometry;
  private nextId = 1;

  constructor(private readonly terrain: Terrain, private readonly habitat: Habitat, scene: Scene) {
    this.group.name = 'burrows';
    scene.add(this.group);
    this.holeGeo = new CircleGeometry(1, 28);
    this.holeGeo.rotateX(-Math.PI / 2);
    // dark at the centre, the wet mud wall at the edge (seen a little way down the tunnel)
    const hc: number[] = [];
    const pos = this.holeGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const k = Math.pow(r, 2.2);
      hc.push(0.012 + 0.11 * k, 0.011 + 0.095 * k, 0.009 + 0.075 * k);
    }
    this.holeGeo.setAttribute('color', new BufferAttribute(new Float32Array(hc), 3));
    this.holeMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    // collar: a low ring of wet mud around the hole, sloping into it
    const prof: Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const r = 0.95 + t * 2.4;
      const h = 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * Math.exp(-t * 1.4) - 0.02;
      prof.push(new Vector2(r, h));
    }
    this.rimGeo = new LatheGeometry(prof, 28);
    this.rimMat = new MeshStandardMaterial({ color: new Color(0.2, 0.17, 0.13), roughness: 0.3, metalness: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.pelletGeo = new SphereGeometry(1, 8, 6);
    this.pelletMat = new MeshStandardMaterial({ color: new Color(0.13, 0.11, 0.085), roughness: 0.62, metalness: 0 });
  }

  get all(): readonly Burrow[] { return this.list; }

  /** The nearest opening within maxR of (x, z), or null. */
  nearest(x: number, z: number, maxR: number): Burrow | null {
    let best: Burrow | null = null, bd = maxR * maxR;
    for (const b of this.list) {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** A home burrow for an animal: its own if it has one, else a new one dug deterministically near (x, z). */
  homeFor(owner: string, x: number, z: number, seed: number): Burrow | null {
    const own = this.list.find((b) => b.owner === owner);
    if (own) return own;
    const rng = new Rng(hashInts(seed, 9091));
    let best: { x: number; z: number; score: number } | null = null;
    for (let k = 0; k < 14; k++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(0.15, 1.4);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (!this.terrain.inside(px, pz, 2)) continue;
      const sub = this.terrain.substrateAt(px, pz);
      const depth = this.habitat.depthAt(px, pz);
      // soft mud near the water's edge, not in a pool and not under deep water
      let score = (SOFT.has(sub) ? 1 : sub === 'sand' ? 0.35 : 0) - Math.max(0, depth - 0.05) * 6 - d * 0.15;
      if (this.list.some((b) => (b.x - px) ** 2 + (b.z - pz) ** 2 < 0.35 * 0.35)) score -= 2;
      if (!best || score > best.score) best = { x: px, z: pz, score };
    }
    if (!best || best.score < 0) return null;
    const free = this.list.find((b) => !b.owner && (b.x - best!.x) ** 2 + (b.z - best!.z) ** 2 < 0.3 * 0.3);
    if (free) { free.owner = owner; return free; }
    const b: Burrow = {
      id: this.nextId++, x: best.x, z: best.z, y: this.terrain.heightAt(best.x, best.z), dir: rng.range(0, Math.PI * 2),
      r: rng.range(0.0055, 0.0075), owner, normal: this.terrain.normalAt(best.x, best.z, new Vector3()),
    };
    this.list.push(b);
    return b;
  }

  release(owner: string): void {
    for (const b of this.list) if (b.owner === owner) b.owner = null;
  }

  /** Show the openings near the viewer, drop the far ones. */
  update(viewer: Vector3): void {
    for (const b of this.list) {
      const d2 = (b.x - viewer.x) ** 2 + (b.z - viewer.z) ** 2;
      const v = this.views.get(b.id);
      if (d2 < 28 * 28) { if (!v) this.views.set(b.id, this.build(b)); } else if (v) { v.removeFromParent(); this.views.delete(b.id); }
    }
  }

  private build(b: Burrow): Group {
    const g = new Group();
    g.position.set(b.x, b.y, b.z);
    g.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.normal);
    const hole = new Mesh(this.holeGeo, this.holeMat);
    hole.scale.set(b.r, 1, b.r * 1.15);
    hole.rotation.y = b.dir;
    hole.position.y = 0.0006;
    hole.renderOrder = 1;
    const rim = new Mesh(this.rimGeo, this.rimMat);
    rim.scale.set(b.r, b.r * 0.9, b.r);
    rim.renderOrder = 1;
    g.add(rim, hole);
    // mud pellets spat out by the digger, mostly on one side of the opening
    const rng = new Rng(hashInts(b.id, 4127));
    const n = 7 + rng.int(0, 9);
    const pel = new InstancedMesh(this.pelletGeo, this.pelletMat, n);
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    for (let i = 0; i < n; i++) {
      const a = b.dir + Math.PI + rng.range(-1.4, 1.4), d = b.r * rng.range(2.6, 6.5);
      const r = rng.range(0.0007, 0.0016);
      p.set(Math.sin(a) * d, r * 0.45, Math.cos(a) * d);
      q.setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, 6.28));
      s.set(r * 1.25, r * 0.75, r);
      pel.setMatrixAt(i, m.compose(p, q, s));
    }
    g.add(pel);
    this.group.add(g);
    return g;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.holeGeo.dispose(); this.rimGeo.dispose(); this.pelletGeo.dispose();
    this.holeMat.dispose(); this.rimMat.dispose(); this.pelletMat.dispose();
  }
}
