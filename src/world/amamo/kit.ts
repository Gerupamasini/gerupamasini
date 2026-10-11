import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, MeshDepthMaterial, MeshStandardMaterial, Sphere, Vector2, Vector4,
  type IUniform, type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';
import { AM_FRAG_COMMON, AM_LEAF_COLOR, AM_LEAF_DEFORM, AM_LIGHT_END, AM_LIGHT_PARS, AM_SHEATH_COLOR, AM_SHEATH_DEFORM, AM_VERT_COMMON } from './shader';
import { LEAF_SLOTS } from './params';

/** Leaf tiers: segments along the blade, vertices across, leaves per shoot, width factor (far tiers draw fewer, wider leaves). */
export const LEAF_TIERS = [
  { nseg: 12, across: 3, leaves: LEAF_SLOTS.length, widen: 1.0 },
  { nseg: 7, across: 2, leaves: 5, widen: 1.18 },
  { nseg: 4, across: 2, leaves: 3, widen: 1.75 },
] as const;
/** Sheath tiers (LOD0, LOD1; LOD2 has none). */
export const SHEATH_TIERS = [
  { rings: 4, radial: 8 },
  { rings: 2, radial: 4 },
] as const;
export type Lod = 0 | 1 | 2;

/** The values every アマモ material reads (one set for the whole flat). */
export interface AmamoUniforms {
  uAmTime: IUniform<number>;
  uAmWater: IUniform<number>;
  uAmCurrent: IUniform<Vector2>;
  uAmWave: IUniform<Vector4>;
  uAmSeaward: IUniform<Vector2>;
  /** animals swimming among the leaves, pushing them aside (xyz world, w reach in m; 0 = unused): see shader.amPush */
  uAmPush: IUniform<Vector4[]>;
  /** the surf's height over the still level (WaterPass.surfField), where an open shore has surf */
  tAmSurf: IUniform<Texture | null>;
  /** x: half the terrain's size (m, the field's extent), y: 1 with surf / 0 without */
  uAmSurf: IUniform<Vector2>;
}

/** how many animals at once can push the leaves aside (AM_PUSH in the shader) */
export const PUSH_SLOTS = 8;

function leafGeometry(nseg: number, across: number, leaves: number): BufferGeometry {
  const rows = nseg + 1, per = rows * across, n = per * leaves;
  const pos = new Float32Array(n * 3), leaf = new Float32Array(n * 3);
  const vs = across === 3 ? [-1, 0, 1] : [-1, 1];
  const idx: number[] = [];
  for (let l = 0; l < leaves; l++) {
    for (let k = 0; k < rows; k++) for (let c = 0; c < across; c++) {
      const i = l * per + k * across + c;
      pos[i * 3] = vs[c] * 0.003; pos[i * 3 + 1] = (k / nseg) * 0.6; pos[i * 3 + 2] = l * 0.002;
      leaf[i * 3] = k; leaf[i * 3 + 1] = vs[c]; leaf[i * 3 + 2] = l;
    }
    for (let k = 0; k < nseg; k++) for (let c = 0; c < across - 1; c++) {
      const a = l * per + k * across + c, b = a + across;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aLeaf', new BufferAttribute(leaf, 3));
  g.setIndex(idx);
  g.boundingSphere = new Sphere(undefined, 1.1);
  return g;
}

function sheathGeometry(rings: number, radial: number): BufferGeometry {
  const n = (rings + 1) * (radial + 1);
  const pos = new Float32Array(n * 3), ring = new Float32Array(n * 3);
  const idx: number[] = [];
  for (let k = 0; k <= rings; k++) for (let j = 0; j <= radial; j++) {
    const i = k * (radial + 1) + j, a = (j / radial) * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * 0.004; pos[i * 3 + 1] = (k / rings) * 0.12; pos[i * 3 + 2] = Math.sin(a) * 0.002;
    ring[i * 3] = k; ring[i * 3 + 1] = a;
  }
  for (let k = 0; k < rings; k++) for (let j = 0; j < radial; j++) {
    const a = k * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aRing', new BufferAttribute(ring, 3));
  g.setIndex(idx);
  g.boundingSphere = new Sphere(undefined, 0.3);
  return g;
}

interface PartDefs { part: 0 | 1; lod: Lod; nseg: number; across: number; rings: number; widen: number }

function defines(d: PartDefs): Record<string, number | string> {
  return { AM_PART: d.part, AM_LOD: d.lod, AM_NSEG: d.nseg, AM_ACROSS: d.across, AM_NRING: d.rings, AM_WIDEN: d.widen.toFixed(3) };
}

function hook(shader: WebGLProgramParametersWithUniforms, uniforms: AmamoUniforms, d: PartDefs, depthOnly: boolean): void {
  Object.assign(shader.uniforms, uniforms);
  const deform = d.part === 0 ? AM_LEAF_DEFORM : AM_SHEATH_DEFORM;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${AM_VERT_COMMON}\n${deform}`);
  if (depthOnly) {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 amPos, amNrmD; amDeform(amPos, amNrmD); vec3 transformed = amPos;');
    return;
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec3 amPos, objectNormal; amDeform(amPos, objectNormal);')
    .replace('#include <begin_vertex>', 'vec3 transformed = amPos;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAmW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${AM_FRAG_COMMON}`)
    .replace('#include <color_fragment>', d.part === 0 ? AM_LEAF_COLOR : AM_SHEATH_COLOR)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gAmRough;')
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${AM_LIGHT_PARS}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${AM_LIGHT_END}`);
}

function partMaterial(uniforms: AmamoUniforms, d: PartDefs): { mat: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, side: DoubleSide });
  mat.defines = { ...mat.defines, ...defines(d) };
  if (d.part === 0) {
    // the rounded / broken tips and nibbled edges are cut in the fragment; with MSAA the cut is antialiased
    mat.alphaTest = 0.5;
    mat.alphaToCoverage = true;
  }
  mat.onBeforeCompile = (shader) => hook(shader, uniforms, d, false);
  const key = `amamo-${d.part}-${d.lod}`;
  mat.customProgramCacheKey = () => key;
  mat.name = key;
  const depth = new MeshDepthMaterial();
  depth.defines = { ...depth.defines, ...defines(d) };
  depth.onBeforeCompile = (shader) => hook(shader, uniforms, d, true);
  depth.customProgramCacheKey = () => `${key}-depth`;
  return { mat, depth };
}

/**
 * Everything the patches share: the uniforms, one material per part and tier (and its shadow-depth twin), and the
 * vertex buffers of each tier (a patch only adds its own per-shoot attributes on top).
 */
export class AmamoKit {
  readonly uniforms: AmamoUniforms = {
    uAmTime: { value: 0 },
    uAmWater: { value: 0 },
    uAmCurrent: { value: new Vector2(0, 0) },
    uAmWave: { value: new Vector4(Math.cos(0.7), Math.sin(0.7), 0.1, 0.6) },
    uAmSeaward: { value: new Vector2(0, 1) },
    uAmPush: { value: Array.from({ length: PUSH_SLOTS }, () => new Vector4(0, -1e3, 0, 0)) },
    tAmSurf: { value: null },
    uAmSurf: { value: new Vector2(1, 0) },
  };
  readonly leafGeo: BufferGeometry[];
  readonly sheathGeo: BufferGeometry[];
  readonly leafMat: MeshStandardMaterial[] = [];
  readonly leafDepth: MeshDepthMaterial[] = [];
  readonly sheathMat: MeshStandardMaterial[] = [];
  readonly sheathDepth: MeshDepthMaterial[] = [];
  /** unit tube along +Y (0..1) for rhizome internodes and roots */
  readonly tubeGeo: BufferGeometry;
  readonly rhizomeMat: MeshStandardMaterial;
  readonly rootMat: MeshStandardMaterial;

  constructor() {
    this.leafGeo = LEAF_TIERS.map((t) => leafGeometry(t.nseg, t.across, t.leaves));
    this.sheathGeo = SHEATH_TIERS.map((t) => sheathGeometry(t.rings, t.radial));
    LEAF_TIERS.forEach((t, lod) => {
      const { mat, depth } = partMaterial(this.uniforms, { part: 0, lod: lod as Lod, nseg: t.nseg, across: t.across, rings: 1, widen: t.widen });
      this.leafMat.push(mat); this.leafDepth.push(depth);
    });
    SHEATH_TIERS.forEach((t, lod) => {
      const { mat, depth } = partMaterial(this.uniforms, { part: 1, lod: lod as Lod, nseg: 1, across: 2, rings: t.rings, widen: 1 });
      this.sheathMat.push(mat); this.sheathDepth.push(depth);
    });
    const tube = new CylinderGeometry(1, 1, 1, 6, 1, true);
    tube.translate(0, 0.5, 0);
    this.tubeGeo = tube;
    // rhizome: white-yellow when young, tan to brown with age (instance colour), darker scars at the nodes
    this.rhizomeMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
    this.rhizomeMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAmNode;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAmNode = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAmNode;')
        .replace('#include <color_fragment>', `#include <color_fragment>
  float node = 1.0 - smoothstep(0.0, 0.14, min(vAmNode, 1.0 - vAmNode));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.42, 0.33), node * 0.85);`);
    };
    this.rhizomeMat.customProgramCacheKey = () => 'amamo-rhizome';
    this.rootMat = new MeshStandardMaterial({ color: new Color(0.13, 0.09, 0.055), roughness: 0.8, metalness: 0 });
  }

  dispose(): void {
    for (const g of [...this.leafGeo, ...this.sheathGeo, this.tubeGeo]) g.dispose();
    for (const m of [...this.leafMat, ...this.leafDepth, ...this.sheathMat, ...this.sheathDepth, this.rhizomeMat, this.rootMat]) m.dispose();
  }
}
