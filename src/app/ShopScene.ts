import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  Raycaster, Scene, SpotLight, SRGBColorSpace, Vector2, Vector3,
} from 'three';
import type { ToolDef } from '../data/schemas';
import { ToolShelf } from './ToolShelf';

/** the things the shop will stock later, shown as wrapped parcels on the side table */
export const SHOP_COMING = ['fishing_rod', 'binoculars', 'case_large', 'tank_light', 'tank_backdrop'];

/**
 * The shop as a room: a rack of the nets for sale (their real models, a price on each tag, lit once owned), a side
 * table with the parcels of what is still to come, and a warm lamp over it all. A click on the rack picks a tool.
 */
export class ShopScene {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rack = new ToolShelf();
  private readonly parcels = new Group();
  private readonly raycaster = new Raycaster();
  private readonly parcelById = new Map<string, Object3D>();
  private drift = 0;
  private readonly camBase = new Vector3();
  private readonly camTarget = new Vector3();

  constructor(aspect: number, names: (id: string) => string) {
    this.scene.background = new Color(0x0b0a09);
    this.camera = new PerspectiveCamera(36, aspect, 0.05, 30);
    // the room: a dark floor, the back wall, a counter edge in front
    const floor = new Mesh(new PlaneGeometry(10, 8), new MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.3, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wall = new Mesh(new PlaneGeometry(10, 4), new MeshStandardMaterial({ color: 0x1a1512, roughness: 1 }));
    wall.position.set(0, 1.5, -1.45);
    this.scene.add(wall);
    const counter = new Mesh(new BoxGeometry(3.6, 0.08, 0.5), new MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.7 }));
    counter.position.set(0, -0.26, 1.3);
    counter.castShadow = true;
    this.scene.add(counter);
    // the rack of nets at the back, the parcels on a table to the right
    this.rack.group.position.set(-0.3, 0.05, -1.1);
    this.scene.add(this.rack.group);
    const table = new Mesh(new BoxGeometry(0.9, 0.04, 0.5), new MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 }));
    table.position.set(1.75, 0.5, -0.9);
    table.castShadow = true; table.receiveShadow = true;
    this.scene.add(table);
    for (const sx of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.05, 0.8, 0.05), new MeshStandardMaterial({ color: 0x3a2616, roughness: 0.8 }));
      leg.position.set(1.75 + sx * 0.4, 0.1, -0.9);
      this.scene.add(leg);
    }
    this.scene.add(this.parcels);
    SHOP_COMING.forEach((id, i) => {
      const w = 0.16 + (i % 3) * 0.04, h = 0.1 + (i % 2) * 0.06, d = 0.12 + ((i + 1) % 3) * 0.03;
      const parcel = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color: [0xb79a6c, 0x9b8362, 0xc4a677][i % 3], roughness: 0.85 }));
      parcel.position.set(1.42 + (i % 3) * 0.3, 0.52 + h / 2 + (i >= 3 ? 0.0 : 0), -0.98 + (i >= 3 ? 0.17 : 0));
      parcel.rotation.y = (i * 0.7) % 0.5 - 0.25;
      parcel.castShadow = true;
      parcel.userData.comingId = id;
      // a paper label
      const tag = new Mesh(new PlaneGeometry(0.12, 0.03), new MeshStandardMaterial({ map: label(names(id), 256, 64), roughness: 0.9 }));
      tag.position.set(0, 0, d / 2 + 0.001);
      parcel.add(tag);
      this.parcels.add(parcel);
      this.parcelById.set(id, parcel);
    });
    // light: a warm hanging lamp over the rack, a cooler fill from the door
    const hemi = new HemisphereLight(0x5a5048, 0x1a1512, 0.5);
    this.scene.add(hemi);
    const lamp = new SpotLight(0xffd9a8, 9, 7, 0.9, 0.5, 1.0);
    lamp.position.set(0.4, 2.6, 0.6);
    lamp.target.position.set(0.2, 0.6, -1.0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    this.scene.add(lamp);
    this.scene.add(lamp.target);
    const fill = new DirectionalLight(0x9fb4c8, 0.35);
    fill.position.set(-2, 2, 3);
    this.scene.add(fill);
    this.camBase.set(0.35, 1.15, 2.45);
    this.camTarget.set(0.25, 0.92, -1.0);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
  }

  /** What is on the shelves: every net, its price on the tag (lit when already owned). */
  setStock(nets: ToolDef[], owns: (id: string) => boolean): void {
    this.rack.setTools(nets.map((tool) => ({ tool, carried: false, slot: null, tag: owns(tool.id) ? '所持' : `${tool.price_cr} CR`, lit: owns(tool.id) })));
  }

  /** The tool under a canvas point (a net's id), a parcel ('coming:<id>'), or null. */
  pick(ndcX: number, ndcY: number): string | null {
    const tool = this.rack.pick(ndcX, ndcY, this.camera);
    if (tool) return tool;
    this.raycaster.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.parcels.children, true);
    for (const h of hits) { let o: Object3D | null = h.object; while (o && !o.userData.comingId) o = o.parent; if (o) return `coming:${o.userData.comingId as string}`; }
    return null;
  }

  /** The camera drifts a little, as if the keeper shifts on their feet. */
  update(dt: number): void {
    this.drift += dt;
    this.camera.position.set(this.camBase.x + Math.sin(this.drift * 0.23) * 0.03, this.camBase.y + Math.sin(this.drift * 0.31 + 1) * 0.015, this.camBase.z);
    this.camera.lookAt(this.camTarget);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

function label(text: string, w: number, h: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe4cf';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a2a1e';
  g.font = '28px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
