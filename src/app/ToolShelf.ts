import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Raycaster, SpotLight, SRGBColorSpace,
  Vector2, Vector3, type Camera,
} from 'three';
import type { ToolDef } from '../data/schemas';
import { instantiateModel } from '../creatures/models/ModelLoader';

export interface ShelfTool {
  tool: ToolDef;
  carried: boolean;
  slot: number | null;
  /** text on the tag instead of the key number (the shop's price) */
  tag?: string;
  /** the tag lit (default: when carried) */
  lit?: boolean;
}

/** where the rack stands in the home room: against the back wall, left of the tank, its base at table height */
export const SHELF_POS = new Vector3(-1.55, 0.05, -1.1);
/** one column per tool, the longest nets standing nearly two metres tall */
const PITCH = 0.36, RACK_H = 2.05, RACK_D = 0.26, RAIL_Y = 0.6, BUTT = 0.09;

/**
 * The tool rack: a tall pegboard with a low bench, the nets standing on it in a row (the hoops up, the bags draped
 * down the handles, a clip on the rail holding each), the shovel at the end. A tag beside each hoop glows for the
 * tools that go to the flat. Clicking a tool takes it along or leaves it.
 */
export class ToolShelf {
  readonly group = new Group();
  private readonly hooks = new Group();
  private readonly props = new Map<string, Object3D>();
  private readonly raycaster = new Raycaster();
  private readonly wood = new MeshStandardMaterial({ color: 0x8a6646, roughness: 0.75, metalness: 0 });
  private readonly woodDark = new MeshStandardMaterial({ color: 0x4a3222, roughness: 0.8, metalness: 0 });
  private readonly metal = new MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.35, metalness: 0.85 });
  private readonly tagOn = new MeshStandardMaterial({ color: 0x7fe3d2, emissive: new Color(0x3fb8a6), emissiveIntensity: 1.6, roughness: 0.4 });
  private readonly tagOff = new MeshStandardMaterial({ color: 0x3a4347, roughness: 0.8 });
  private readonly back: Mesh;
  private readonly bench: Mesh;
  private readonly rail: Mesh;
  private readonly lamp: Mesh;
  private width = PITCH * 7;
  private gen = 0;

  constructor() {
    this.group.name = 'toolShelf';
    this.group.position.copy(SHELF_POS);
    // the pegboard, the bench the tools stand on, the rail that holds them up, a strip lamp over it
    this.back = new Mesh(new PlaneGeometry(1, RACK_H), new MeshStandardMaterial({ color: 0x4a403a, roughness: 0.92 }));
    this.back.position.set(0, RACK_H / 2 - 0.02, -0.1);
    this.back.receiveShadow = true;
    this.group.add(this.back);
    this.bench = new Mesh(new BoxGeometry(1, 0.03, RACK_D), this.wood);
    this.bench.position.set(0, -0.015, 0.03);
    this.bench.castShadow = true; this.bench.receiveShadow = true;
    this.group.add(this.bench);
    this.rail = new Mesh(new BoxGeometry(1, 0.025, 0.02), this.woodDark);
    this.rail.position.set(0, RAIL_Y, -0.03);
    this.rail.castShadow = true;
    this.group.add(this.rail);
    this.lamp = new Mesh(new BoxGeometry(1, 0.012, 0.03), new MeshStandardMaterial({ color: 0x222222, emissive: new Color(0.9, 0.8, 0.6), emissiveIntensity: 1.2 }));
    this.lamp.position.set(0, RACK_H - 0.04, 0.0);
    this.group.add(this.lamp);
    // the strip lamp's light: warm, down over the nets and onto the board
    const light = new SpotLight(0xffe2bf, 6, 4.5, 1.05, 0.6, 1.0);
    light.position.set(0, RACK_H + 0.1, 0.55);
    light.target.position.set(0, 0.6, -0.05);
    light.castShadow = false;
    this.group.add(light);
    this.group.add(light.target);
    this.group.add(this.hooks);
    this.fit(7);
  }

  /** the rack sized to its tools */
  private fit(n: number): void {
    this.width = PITCH * Math.max(4, n);
    const w = this.width + 0.18;
    this.back.scale.x = w;
    this.bench.scale.x = w;
    this.rail.scale.x = w - 0.06;
    this.lamp.scale.x = w * 0.85;
  }

  /** world position of the rack's middle, for the camera */
  get center(): Vector3 {
    return SHELF_POS.clone().add(new Vector3(0, 0.95, 0.05));
  }

  /** how far back the camera stands to take in the whole rack (metres) */
  get viewDistance(): number {
    return Math.max(1.7, this.width * 0.95 + 0.6);
  }

  /** Stand the owned tools in the rack, in order; carried ones get a lit tag with their key. */
  setTools(list: ShelfTool[]): void {
    const gen = ++this.gen;
    for (const o of this.hooks.children.slice()) { o.removeFromParent(); }
    this.props.clear();
    this.fit(list.length);
    const x0 = -((list.length - 1) * PITCH) / 2;
    list.forEach((st, i) => {
      const x = x0 + i * PITCH;
      const root = new Group();
      root.position.set(x, 0, 0);
      root.userData.toolId = st.tool.id;
      const isNet = st.tool.type === 'capture';
      const p = st.tool.params;
      const top = isNet ? BUTT + (p.handle_m ?? 1) + (p.mouth_h ?? 0.3) / 2 : 0.46;
      // the clip on the rail (nets) or the hook (the shovel), and the tag with its key beside the top
      const clip = new Mesh(new BoxGeometry(0.03, 0.03, 0.05), this.metal);
      clip.position.set(0, isNet ? RAIL_Y : 0.44, isNet ? 0.0 : -0.02);
      root.add(clip);
      const tagX = isNet ? (p.mouth_w ?? 0.3) / 2 + 0.06 : 0.09;
      const lit = st.lit ?? st.carried;
      const text = st.tag ?? (st.carried && st.slot !== null ? String(st.slot + 1) : null);
      const wide = text !== null && text.length > 2;
      const tag = new Mesh(new BoxGeometry(wide ? 0.11 : 0.05, 0.022, 0.006), lit ? this.tagOn : this.tagOff);
      tag.position.set(tagX + (wide ? 0.03 : 0), top - 0.03, -0.06);
      root.add(tag);
      if (text !== null) {
        const key = new Mesh(new PlaneGeometry(wide ? 0.09 : 0.03, 0.016), new MeshStandardMaterial({ map: label(text, wide ? 192 : 64, 36, lit ? '#05121a' : '#dfe6e8', wide ? 'bold 24px sans-serif' : 'bold 28px sans-serif'), transparent: true }));
        key.position.set(tag.position.x, top - 0.03, -0.0565);
        root.add(key);
      }
      // the tool itself
      if (isNet && st.tool.model) void this.loadNet(root, st.tool, gen);
      else root.add(st.tool.type === 'dig' ? this.shovel() : this.generic());
      // the name plate on the bench
      const plate = new Mesh(new PlaneGeometry(0.16, 0.036), new MeshStandardMaterial({ map: label(st.tool.ja, 256, 58, '#f0e6d2', '26px sans-serif', '#3a2a1e'), roughness: 0.8 }));
      plate.position.set(0, 0.02, 0.14);
      plate.rotation.x = -0.4;
      root.add(plate);
      root.traverse((o) => { (o as Mesh).castShadow = true; });
      this.hooks.add(root);
      this.props.set(st.tool.id, root);
    });
  }

  /**
   * A net standing on the bench: its light model (lod2) set grip-down, the handle up (+z → +y), the opening toward
   * the room, the bag draped down the handle with the Trail morph.
   */
  private async loadNet(root: Group, tool: ToolDef, gen: number): Promise<void> {
    let loaded;
    try { loaded = await instantiateModel(`${tool.model}.lod2.glb`); } catch (e) { console.warn(e); return; }
    if (gen !== this.gen || !root.parent) return;
    const model = loaded.root;
    model.matrix.copy(new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0)).setPosition(0, BUTT, 0.06));
    model.matrixAutoUpdate = false;
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      const k = m.morphTargetDictionary?.Trail;
      if (k !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[k] = 1;
    });
    root.add(model);
  }

  /** The tool under a canvas point, or null. */
  pick(ndcX: number, ndcY: number, camera: Camera): string | null {
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
    const hits = this.raycaster.intersectObjects([...this.props.values()], true);
    if (!hits.length) return null;
    let o: Object3D | null = hits[0].object;
    while (o && o.userData.toolId === undefined) o = o.parent;
    return o ? (o.userData.toolId as string) : null;
  }

  /** The shovel standing on its blade, the handle up against the board. */
  private shovel(): Object3D {
    const g = new Group();
    const blade = new Mesh(new BoxGeometry(0.085, 0.11, 0.004), this.metal);
    blade.position.set(0, 0.055, 0.0);
    g.add(blade);
    const handle = new Mesh(new CylinderGeometry(0.009, 0.01, 0.3, 10), this.wood);
    handle.position.set(0, 0.11 + 0.15, 0.0);
    g.add(handle);
    const grip = new Mesh(new BoxGeometry(0.06, 0.012, 0.012), this.woodDark);
    grip.position.set(0, 0.41, 0.0);
    g.add(grip);
    g.position.z = 0.04;
    return g;
  }

  private generic(): Object3D {
    const m = new Mesh(new BoxGeometry(0.05, 0.12, 0.03), this.metal);
    m.position.set(0, 0.06, 0.04);
    return m;
  }
}

function label(text: string, w: number, h: number, ink: string, font: string, paper?: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (paper) { g.fillStyle = paper; g.fillRect(0, 0, w, h); }
  else g.clearRect(0, 0, w, h);
  g.fillStyle = ink;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
