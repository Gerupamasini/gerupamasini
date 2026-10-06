import { Group, Mesh, Vector4, type BufferGeometry } from 'three';
import type { OysterAtlas } from './bake';
import { OysterBehavior, type OysterSenses, type OysterState } from './behavior';
import type { OysterGenome } from './genome';
import { buildOysterParts, DETAIL, OysterShape, type GeometryDetail, type OysterParts } from './geometry';
import { cloneOysterMaterial, depthOf, lookOf, makeOysterMaterial, type OysterMaterial } from './material';

export type OysterLod = 0 | 1 | 2;

/** Shared material templates per atlas and LOD (an individual clones them for its own uniforms). */
const templates = new WeakMap<OysterAtlas, OysterMaterial[]>();
export function oysterMaterials(atlas: OysterAtlas): OysterMaterial[] {
  let t = templates.get(atlas);
  if (!t) { t = [makeOysterMaterial(atlas, 0), makeOysterMaterial(atlas, 1), makeOysterMaterial(atlas, 2)]; templates.set(atlas, t); }
  return t;
}

export interface OysterIndividualOptions {
  genome: OysterGenome;
  atlas: OysterAtlas;
  /** the shape, if it is already built (clusters build it for the layout) */
  shape?: OysterShape;
  /** initial level of detail */
  lod?: OysterLod;
  /** geometry detail used for LOD0 ('hero' for the close-up individual) */
  lod0Detail?: GeometryDetail;
  /** the host surface under it in its own frame (n.xyz, d): the lower valve is pressed onto it */
  plane?: Vector4;
  /** gape held by a dead, gaping shell (radians) */
  deadGape?: number;
  /** start state (default: decided by the first update) */
  state?: OysterState;
}

/**
 * One マガキ, built for close looking:
 *
 *   OysterRoot (Group, the oyster's frame: hinge at the origin, +z toward the ventral margin)
 *   ├── LowerShell  the cupped left valve, cemented: never moves (barnacles on it go with it)
 *   ├── UpperShell  the flat right valve, pivoting about the hinge axis (+x through the origin)
 *   ├── Mantle      mantle lobes with their tentacled margins and the body behind, seen through the gape;
 *   │               the upper lobe follows the lid partway (in the shader)
 *   └── Hinge       the ligament
 *
 * Every level of detail keeps that hierarchy; switching LOD swaps the geometry and material in place.
 */
export class OysterIndividual {
  readonly root = new Group();
  readonly lowerShell = new Mesh();
  readonly upperShell = new Mesh();
  readonly mantle = new Mesh();
  readonly hinge = new Mesh();
  readonly shape: OysterShape;
  readonly behavior: OysterBehavior;
  readonly genome: OysterGenome;
  lod: OysterLod = 2;
  private readonly parts: (OysterParts | null)[] = [null, null, null];
  private readonly shellMats: OysterMaterial[] = [];
  private readonly softMats: OysterMaterial[] = [];
  private readonly lod0Detail: GeometryDetail;
  readonly plane: Vector4;
  /** gape shown (radians) */
  gape = 0;

  constructor(private readonly opts: OysterIndividualOptions) {
    const g = opts.genome;
    this.genome = g;
    this.shape = opts.shape ?? new OysterShape(g);
    this.lod0Detail = opts.lod0Detail ?? DETAIL.lod0;
    this.plane = opts.plane?.clone() ?? new Vector4();
    this.behavior = new OysterBehavior(g.gapeMax, g.seeds.shellSeed ^ g.seeds.attachmentSeed, opts.state ?? 'LOW_TIDE_CLOSED');
    this.root.name = 'OysterRoot';
    this.lowerShell.name = 'LowerShell';
    this.upperShell.name = 'UpperShell';
    this.mantle.name = 'Mantle';
    this.hinge.name = 'Hinge';
    this.root.add(this.lowerShell, this.upperShell, this.mantle, this.hinge);
    this.root.userData.oyster = this;
    const templ = oysterMaterials(opts.atlas);
    for (let l = 0; l < 3; l++) {
      const shell = cloneOysterMaterial(templ[l]);
      const soft = cloneOysterMaterial(templ[l]);
      for (const m of [shell, soft]) {
        m.oy.uState.value.set(0, g.dead, (g.seeds.colorSeed % 1000) / 1000, g.erosion);
        lookOf(g, m.oy.uLook.value);
        m.oy.uPlane.value.copy(this.plane);
      }
      this.shellMats.push(shell);
      this.softMats.push(soft);
    }
    for (const m of [this.lowerShell, this.upperShell, this.mantle, this.hinge]) { m.castShadow = true; m.receiveShadow = true; }
    if (g.dead === 1) this.gape = opts.deadGape ?? 0.6;
    this.setLod(opts.lod ?? 0);
    this.applyGape();
  }

  private partsFor(l: OysterLod): OysterParts {
    let p = this.parts[l];
    if (!p) {
      const d = l === 0 ? this.lod0Detail : l === 1 ? DETAIL.lod1 : DETAIL.lod2;
      p = buildOysterParts(this.shape, d, this.opts.atlas.layout);
      this.parts[l] = p;
    }
    return p;
  }

  /** Switch the level of detail (geometry built on first use and kept). */
  setLod(l: OysterLod): void {
    if (l === this.lod && this.lowerShell.geometry.getAttribute('position')) return;
    this.lod = l;
    const p = this.partsFor(l);
    const shell = this.shellMats[l], soft = this.softMats[l];
    const set = (mesh: Mesh, geo: BufferGeometry | null, mat: OysterMaterial) => {
      mesh.visible = !!geo && geo.getAttribute('position').count > 0;
      if (geo) mesh.geometry = geo;
      mesh.material = mat;
      mesh.customDepthMaterial = depthOf(mat);
      mesh.castShadow = l < 2;
    };
    set(this.lowerShell, p.lower, shell);
    set(this.upperShell, p.upper, shell);
    set(this.hinge, p.hinge, shell);
    set(this.mantle, p.mantle, soft);
  }

  private applyGape(): void {
    // the lid turns about the hinge axis; the mantle's upper lobe follows it partway in the shader
    this.upperShell.rotation.set(-this.gape, 0, 0);
    for (const m of this.softMats) m.oy.uState.value.x = this.gape;
  }

  /** Run the behaviour (live oysters) and show the gape. */
  update(dt: number, senses: OysterSenses): void {
    if (this.genome.dead) return;
    this.gape = this.behavior.update(dt, senses);
    this.applyGape();
  }

  /** Set the attachment plane (own frame). */
  setPlane(p: Vector4): void {
    this.plane.copy(p);
    for (const m of [...this.shellMats, ...this.softMats]) m.oy.uPlane.value.copy(p);
  }

  get state(): OysterState {
    return this.behavior.state;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const p of this.parts) if (p) { p.lower.dispose(); p.upper.dispose(); p.mantle?.dispose(); p.hinge.dispose(); }
    for (const m of [...this.shellMats, ...this.softMats]) { depthOf(m).dispose(); m.dispose(); }
  }
}
