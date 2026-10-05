import {
  BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry,
  Raycaster, SRGBColorSpace, TubeGeometry, Vector2, Vector3, type Camera,
} from 'three';
import type { ToolDef } from '../data/schemas';

export interface ShelfTool { tool: ToolDef; carried: boolean; slot: number | null }

/** where the shelf hangs in the home room: on the back wall, to the left of the tank */
export const SHELF_POS = new Vector3(-1.08, 0.42, -1.05);
const BOARD_W = 0.78, BOARD_D = 0.2, PEG_SPACING = 0.19;

/**
 * The tool shelf: a board and a pegboard on the wall with the tools hung up by their handles. A tag on the peg
 * glows for the ones that go to the flat. Clicking a tool takes it along or leaves it.
 */
export class ToolShelf {
  readonly group = new Group();
  private readonly hooks = new Group();
  private readonly props = new Map<string, Object3D>();
  private readonly raycaster = new Raycaster();
  private readonly wood = new MeshStandardMaterial({ color: 0x8a6646, roughness: 0.75, metalness: 0 });
  private readonly woodDark = new MeshStandardMaterial({ color: 0x4a3222, roughness: 0.8, metalness: 0 });
  private readonly metal = new MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.35, metalness: 0.85 });
  private readonly alu = new MeshStandardMaterial({ color: 0xb9c2c6, roughness: 0.3, metalness: 0.9 });
  private readonly mesh = new MeshStandardMaterial({ color: 0xdfe9ec, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.45, side: DoubleSide, depthWrite: false });
  private readonly tagOn = new MeshStandardMaterial({ color: 0x7fe3d2, emissive: new Color(0x3fb8a6), emissiveIntensity: 1.6, roughness: 0.4 });
  private readonly tagOff = new MeshStandardMaterial({ color: 0x3a4347, roughness: 0.8 });

  constructor() {
    this.group.name = 'toolShelf';
    this.group.position.copy(SHELF_POS);
    // the pegboard against the wall and the board under it
    const back = new Mesh(new PlaneGeometry(BOARD_W + 0.08, 0.62), new MeshStandardMaterial({ color: 0x2a2320, roughness: 0.95 }));
    back.position.set(0, 0.1, -0.1);
    back.receiveShadow = true;
    this.group.add(back);
    const board = new Mesh(new BoxGeometry(BOARD_W, 0.028, BOARD_D), this.wood);
    board.position.set(0, -0.22, 0);
    board.castShadow = true; board.receiveShadow = true;
    this.group.add(board);
    for (const sx of [-1, 1]) {
      const bracket = new Mesh(new BoxGeometry(0.02, 0.12, BOARD_D - 0.04), this.woodDark);
      bracket.position.set(sx * (BOARD_W / 2 - 0.03), -0.29, -0.01);
      this.group.add(bracket);
    }
    // a little lamp over the shelf
    const lamp = new Mesh(new BoxGeometry(BOARD_W * 0.8, 0.012, 0.03), new MeshStandardMaterial({ color: 0x222222, emissive: new Color(0.9, 0.8, 0.6), emissiveIntensity: 1.2 }));
    lamp.position.set(0, 0.4, -0.02);
    this.group.add(lamp);
    this.group.add(this.hooks);
  }

  /** world position of the shelf's middle, for the camera */
  get center(): Vector3 {
    return SHELF_POS.clone().add(new Vector3(0, 0.04, 0));
  }

  /** Hang the owned tools up, in order; carried ones get a lit tag with their key. */
  setTools(list: ShelfTool[]): void {
    for (const o of this.hooks.children.slice()) { o.removeFromParent(); }
    this.props.clear();
    const n = list.length, x0 = -((n - 1) * PEG_SPACING) / 2;
    list.forEach((st, i) => {
      const x = x0 + i * PEG_SPACING;
      const root = new Group();
      root.position.set(x, 0, 0);
      root.userData.toolId = st.tool.id;
      // the peg and the tag
      const peg = new Mesh(new CylinderGeometry(0.006, 0.006, 0.05, 8), this.metal);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(0, 0.3, -0.08);
      root.add(peg);
      const tag = new Mesh(new BoxGeometry(0.05, 0.022, 0.006), st.carried ? this.tagOn : this.tagOff);
      tag.position.set(0, 0.36, -0.09);
      root.add(tag);
      if (st.carried && st.slot !== null) {
        const key = new Mesh(new PlaneGeometry(0.03, 0.016), new MeshStandardMaterial({ map: label(String(st.slot + 1), 64, 36, '#05121a', 'bold 28px sans-serif'), transparent: true }));
        key.position.set(0, 0.36, -0.0865);
        root.add(key);
      }
      // the tool itself, hanging from the peg
      const prop = st.tool.type === 'capture' ? this.net(st.tool) : st.tool.type === 'dig' ? this.shovel() : this.generic();
      prop.position.set(0, 0.3, -0.055);
      root.add(prop);
      // the name plate on the board
      const plate = new Mesh(new PlaneGeometry(0.16, 0.036), new MeshStandardMaterial({ map: label(st.tool.ja, 256, 58, '#f0e6d2', '26px sans-serif', '#3a2a1e'), roughness: 0.8 }));
      plate.position.set(0, -0.2, 0.06);
      plate.rotation.x = -0.35;
      root.add(plate);
      root.traverse((o) => { (o as Mesh).castShadow = true; });
      this.hooks.add(root);
      this.props.set(st.tool.id, root);
    });
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

  /** A net hung by its handle: hoop at the bottom, bag hanging through it. Longer nets are drawn longer. */
  private net(tool: ToolDef): Object3D {
    const g = new Group();
    const reach = tool.params.reach_m ?? 1.5, hoop = tool.params.hoop ?? 1;
    const handleLen = 0.22 + 0.1 * (reach - 1.1);
    const handle = new Mesh(new CylinderGeometry(0.007, 0.0085, handleLen, 10), this.alu);
    handle.position.set(0, -handleLen / 2, 0);
    g.add(handle);
    const grip = new Mesh(new CylinderGeometry(0.0095, 0.0095, 0.07, 10), this.woodDark);
    grip.position.set(0, -0.035, 0);
    g.add(grip);
    // D-frame hoop under the handle, in the plane of the wall
    const r = 0.075 * hoop;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); pts.push(new Vector3(Math.cos(a) * r, -handleLen - r * 0.55 - Math.sin(a) * r * 0.85, 0)); }
    pts.push(new Vector3(-r, -handleLen - r * 0.55, 0));
    const frame = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, true), 48, 0.0045, 8, true), this.alu);
    g.add(frame);
    const flat = new Mesh(new CylinderGeometry(0.0045, 0.0045, r * 2, 8), this.alu);
    flat.rotation.z = Math.PI / 2;
    flat.position.set(0, -handleLen - r * 0.55, 0);
    g.add(flat);
    // the bag: a shallow lathe hanging a little below the hoop
    const prof: Vector2[] = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; prof.push(new Vector2(r * 0.92 * (1 - u * u * 0.85), -u * r * 1.4)); }
    const bag = new Mesh(new LatheGeometry(prof, 20), this.mesh);
    bag.position.set(0, -handleLen - r * 0.55 - r * 0.3, 0.004);
    bag.scale.set(1, 1, 0.35);
    g.add(bag);
    return g;
  }

  private shovel(): Object3D {
    const g = new Group();
    const handle = new Mesh(new CylinderGeometry(0.009, 0.01, 0.3, 10), this.wood);
    handle.position.set(0, -0.15, 0);
    g.add(handle);
    const blade = new Mesh(new BoxGeometry(0.085, 0.11, 0.004), this.metal);
    blade.position.set(0, -0.355, 0);
    g.add(blade);
    const grip = new Mesh(new BoxGeometry(0.06, 0.012, 0.012), this.woodDark);
    grip.position.set(0, 0.004, 0);
    g.add(grip);
    return g;
  }

  private generic(): Object3D {
    const m = new Mesh(new BoxGeometry(0.05, 0.12, 0.03), this.metal);
    m.position.y = -0.06;
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
