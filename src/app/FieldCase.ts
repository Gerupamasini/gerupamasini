import {
  BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Vector3,
} from 'three';
import type { IndividualRecord, Individual } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { generateIndividual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';

/** the acrylic box between the posts: 36 cm wide, 16 cm deep, 18 cm tall, water 13 cm */
export const CASE_W = 0.36, CASE_D = 0.16, CASE_H = 0.18, CASE_WATER = 0.13;
const POST = 0.038, POST_H = 0.22, BASE_T = 0.018, WALL = 0.004;
export const CASE_MAX = 6;

interface CaseOccupant {
  record: IndividualRecord;
  ind: Individual;
  driver: Driver;
  root: Object3D;
  unsub: () => void;
}

/**
 * The observation case set down on the flat: a small acrylic box held between two hinoki posts on a board, filled
 * from the nearest pool, with the day's catch swimming in it. The animals are driven like the tank's, kept inside
 * the glass; the whole thing is placed where the player stands and taken up again when the look is over.
 */
export class FieldCase {
  readonly group = new Group();
  /**
   * The animals live in a group at the world origin (like the flat and the tank), not under the case: the drivers
   * rest their animal on the floor they are given, measured in their parent's frame, so the parent has to be the
   * world. The case is set down at a multiple of a right angle so its walls stay axis-aligned for them.
   */
  readonly animals = new Group();
  private readonly occupants: CaseOccupant[] = [];
  /** the acrylic bottom's top face and the water line, world y */
  private floorY = 0;
  private readonly floor: Floor = { heightAt: () => this.floorY, waterAt: () => this.floorY + CASE_WATER };
  /** half extents of the inside in world x / z (the case may be turned a right angle) */
  private halfX = CASE_W / 2;
  private halfZ = CASE_D / 2;
  private readonly surface: Mesh;
  private time = 0;
  private readonly tmp = new Vector3();

  constructor() {
    this.group.name = 'fieldCase';
    const wood = new MeshStandardMaterial({ color: 0xd8bf96, roughness: 0.78, metalness: 0 });
    const woodDark = new MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.7, metalness: 0 });
    const acrylic = new MeshStandardMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.12, roughness: 0.12, metalness: 0, side: DoubleSide, depthWrite: false });
    const water = new MeshStandardMaterial({ color: 0xcdeee8, transparent: true, opacity: 0.18, roughness: 0.3, metalness: 0, depthWrite: false });
    const surfaceMat = new MeshStandardMaterial({ color: 0xe6f7f4, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0, depthWrite: false, side: DoubleSide });

    // the board and the two posts, with a dark cap on each
    const board = new Mesh(new BoxGeometry(CASE_W + 2 * POST + 0.03, BASE_T, CASE_D + 0.05), wood);
    board.position.y = BASE_T / 2;
    board.castShadow = true; board.receiveShadow = true;
    this.group.add(board);
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(POST, POST_H, CASE_D + 0.02), wood);
      post.position.set(sx * (CASE_W / 2 + POST / 2), BASE_T + POST_H / 2, 0);
      post.castShadow = true; post.receiveShadow = true;
      this.group.add(post);
      const cap = new Mesh(new BoxGeometry(POST + 0.004, 0.006, CASE_D + 0.024), woodDark);
      cap.position.set(post.position.x, BASE_T + POST_H + 0.003, 0);
      this.group.add(cap);
    }
    // the mark burnt into the right post
    const mark = new Mesh(new PlaneGeometry(POST * 0.7, POST_H * 0.55), new MeshStandardMaterial({ map: makeMark(), transparent: true, roughness: 0.8, side: DoubleSide }));
    mark.position.set(CASE_W / 2 + POST / 2, BASE_T + POST_H * 0.55, CASE_D / 2 + 0.0105);
    this.group.add(mark);

    // the acrylic: five thin panels
    const y0 = BASE_T;
    const panel = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, h, d), acrylic);
      m.position.set(x, y, z);
      m.renderOrder = 5;
      this.group.add(m);
    };
    panel(CASE_W, WALL, CASE_D, 0, y0 + WALL / 2, 0);
    panel(CASE_W, CASE_H, WALL, 0, y0 + CASE_H / 2, CASE_D / 2 - WALL / 2);
    panel(CASE_W, CASE_H, WALL, 0, y0 + CASE_H / 2, -CASE_D / 2 + WALL / 2);
    panel(WALL, CASE_H, CASE_D, CASE_W / 2 - WALL / 2, y0 + CASE_H / 2, 0);
    panel(WALL, CASE_H, CASE_D, -CASE_W / 2 + WALL / 2, y0 + CASE_H / 2, 0);

    // the water and its surface
    const body = new Mesh(new BoxGeometry(CASE_W - 2 * WALL, CASE_WATER, CASE_D - 2 * WALL), water);
    body.position.set(0, y0 + WALL + CASE_WATER / 2, 0);
    body.renderOrder = 3;
    this.group.add(body);
    this.surface = new Mesh(new PlaneGeometry(CASE_W - 2 * WALL, CASE_D - 2 * WALL), surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.set(0, y0 + WALL + CASE_WATER, 0);
    this.surface.renderOrder = 4;
    this.group.add(this.surface);

    this.animals.name = 'fieldCaseAnimals';
    this.group.visible = false;
  }

  /** Set the case down at a spot on the flat, its long side across the player's view (to the nearest right angle). */
  place(x: number, y: number, z: number, yaw: number): void {
    const snapped = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, snapped, 0);
    this.group.visible = true;
    this.group.updateMatrixWorld(true);
    this.floorY = y + BASE_T + WALL;
    const turned = Math.abs(Math.sin(snapped)) > 0.5;
    this.halfX = (turned ? CASE_D : CASE_W) / 2 - WALL;
    this.halfZ = (turned ? CASE_W : CASE_D) / 2 - WALL;
  }

  takeUp(): void {
    this.group.visible = false;
    this.clearOccupants();
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** the middle of the water, world space */
  get center(): Vector3 {
    return this.tmp.set(0, BASE_T + WALL + CASE_WATER / 2, 0).applyMatrix4(this.group.matrixWorld);
  }

  /** world-space half extents of the inside, for anyone placing things in it */
  get inside(): { x: number; z: number } {
    return { x: this.halfX, z: this.halfZ };
  }

  get count(): number {
    return this.occupants.length;
  }

  async setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    for (const rec of records.slice(0, CASE_MAX)) {
      if (this.occupants.some((o) => o.record.id === rec.id)) continue;
      await this.addOccupant(rec, species(rec.speciesId));
    }
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined): Promise<void> {
    if (!species || !this.group.visible) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits];
    const slot = this.occupants.length;
    const c = this.group.position;
    const long = this.halfX >= this.halfZ;
    const u = (slot % 3 - 1) * 0.09, v = (slot >= 3 ? 0.03 : -0.03);
    ind.pos.set(c.x + (long ? u : v), this.floorY, c.z + (long ? v : u));
    ind.home.copy(ind.pos);
    ind.heading = (long ? Math.PI / 2 : 0) + (slot % 2 ? Math.PI : 0);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    const rel = species.model.lod1 ?? species.model.lod2 ?? species.model.hero;
    if (rel) {
      const model = await instantiateModel(rel);
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      root = ph.root;
    } else return;
    if (!this.group.visible || this.occupants.some((o) => o.record.id === record.id)) { root.removeFromParent(); return; }
    const driver = entry.create();
    const unsub = driver.onEvent(() => {});
    this.animals.add(root);
    driver.attach(root, ind, extras, bones, meshes);
    root.traverse((o) => { (o as Mesh).castShadow = false; (o as Mesh).frustumCulled = false; });
    this.occupants.push({ record, ind, driver, root, unsub });
  }

  removeOccupant(id: string): void {
    const i = this.occupants.findIndex((o) => o.record.id === id);
    if (i < 0) return;
    const o = this.occupants[i];
    o.unsub();
    o.driver.dispose();
    o.root.removeFromParent();
    this.occupants.splice(i, 1);
  }

  clearOccupants(): void {
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  update(dt: number, player: Vector3): void {
    if (!this.group.visible) return;
    this.time += dt;
    this.surface.position.y = BASE_T + WALL + CASE_WATER + Math.sin(this.time * 1.7) * 0.0006;
    const c = this.group.position;
    for (const o of this.occupants) {
      const d = o.driver;
      const S = o.ind.length_mm / 1000;
      const hx = Math.max(0.01, this.halfX - 0.008 - S * 0.35), hz = Math.max(0.01, this.halfZ - 0.008 - S * 0.35);
      const minX = c.x - hx, maxX = c.x + hx, minZ = c.z - hz, maxZ = c.z + hz;
      if (!d.busy) {
        const r = o.ind.rng.next();
        if (r < 0.6) d.setIntent({ id: Date.now(), kind: 'rest', urgency: 0, seconds: 4 + o.ind.rng.next() * 12 });
        else if (r < 0.92) d.setIntent({ id: Date.now(), kind: 'wander', urgency: 0.3, seconds: 6, target: new Vector3(c.x + (o.ind.rng.next() * 2 - 1) * hx, 0, c.z + (o.ind.rng.next() * 2 - 1) * hz) });
        else d.setIntent({ id: Date.now(), kind: 'special', urgency: 0, seconds: 3, param: 'yawn' });
      }
      d.update(dt, { floor: this.floor, player, simScale: 1, nowMs: Date.now(), bounds: { minX, maxX, minZ, maxZ } });
      o.ind.pos.x = Math.max(minX, Math.min(maxX, o.ind.pos.x));
      o.ind.pos.z = Math.max(minZ, Math.min(maxZ, o.ind.pos.z));
      o.root.position.x = Math.max(minX, Math.min(maxX, o.root.position.x));
      o.root.position.z = Math.max(minZ, Math.min(maxZ, o.root.position.z));
    }
  }

  dispose(): void {
    this.clearOccupants();
    this.group.removeFromParent();
    this.animals.removeFromParent();
  }
}

/** The mark burnt into the post: the game's name, the long way down. */
function makeMark(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(70, 40, 22, 0.85)';
  g.strokeStyle = 'rgba(70, 40, 22, 0.85)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 44, 44);
  g.font = 'bold 22px sans-serif';
  g.textAlign = 'center';
  g.fillText('潟', 32, 42);
  g.font = '18px sans-serif';
  const word = '干潟図鑑';
  for (let i = 0; i < word.length; i++) g.fillText(word[i], 32, 92 + i * 26);
  g.font = '9px sans-serif';
  g.fillText('HIGATA ZUKAN', 32, 220);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
