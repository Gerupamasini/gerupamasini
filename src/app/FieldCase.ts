import {
  BoxGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry,
  SRGBColorSpace, Vector3,
} from 'three';
import type { IndividualRecord, Individual } from '../creatures/Individual';
import type { SpeciesDef } from '../data/schemas';
import type { Driver, Floor } from '../creatures/drivers/Driver';
import { DRIVERS } from '../creatures/drivers/index';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { modelFor, variantOf } from '../creatures/models/choice';
import { QUALITY_PRESETS, type QualityPreset } from '../core/Settings';
import { generateIndividual } from '../creatures/Individual';
import { hashInts } from '../core/Rng';

/** the clear acrylic case: 36 cm wide, 16 cm deep, 18 cm tall, water 13 cm; 5 mm walls */
export const CASE_W = 0.36, CASE_D = 0.16, CASE_H = 0.18, CASE_WATER = 0.13;
const WALL = 0.005;
/** how deep the case sits when it floats: the outside water line a little under the inside one */
export const CASE_DRAFT = 0.11;
export const CASE_MAX = 6;

interface CaseOccupant {
  record: IndividualRecord;
  ind: Individual;
  driver: Driver;
  root: Object3D;
  unsub: () => void;
}

/**
 * The observation case: a plain clear acrylic box with a centimetre rule along its front edge, filled from the
 * nearest pool, with the day's catch swimming in it. Set down on the sand, or, when the player stands in the water,
 * floated on the surface in front of them. The animals are driven like the tank's, kept inside the walls; the case is
 * taken up again when the look is over.
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
  /** the acrylic bottom's top face, world y (follows the bob when afloat) */
  private floorY = 0;
  private readonly floor: Floor = { heightAt: () => this.floorY, waterAt: () => this.floorY + CASE_WATER };
  /** half extents of the inside in world x / z (the case may be turned a right angle) */
  private halfX = CASE_W / 2;
  private halfZ = CASE_D / 2;
  private readonly surface: Mesh;
  private readonly body: Mesh;
  private time = 0;
  /** afloat: the case bobs on the water around its rest height */
  private afloat = false;
  private restY = 0;
  private readonly tmp = new Vector3();
  private preset = QUALITY_PRESETS.mid;
  private generation = 0;
  private records: IndividualRecord[] = [];
  private lookup: ((id: string) => SpeciesDef | undefined) | null = null;

  constructor() {
    this.group.name = 'fieldCase';
    const acrylic = new MeshStandardMaterial({ color: 0xf6fcff, transparent: true, opacity: 0.1, roughness: 0.06, metalness: 0, side: DoubleSide, depthWrite: false });
    const edge = new LineBasicMaterial({ color: new Color(0xdff6ff), transparent: true, opacity: 0.55 });
    const water = new MeshStandardMaterial({ color: 0xcdeee8, transparent: true, opacity: 0.16, roughness: 0.3, metalness: 0, depthWrite: false });
    const surfaceMat = new MeshStandardMaterial({ color: 0xe6f7f4, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0, depthWrite: false, side: DoubleSide });

    // the acrylic: a bottom and four walls, each with its edges drawn so the clear box still reads as a box
    const panel = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geo = new BoxGeometry(w, h, d);
      const m = new Mesh(geo, acrylic);
      m.position.set(x, y, z);
      m.renderOrder = 5;
      this.group.add(m);
      const lines = new LineSegments(new EdgesGeometry(geo), edge);
      lines.position.copy(m.position);
      lines.renderOrder = 6;
      this.group.add(lines);
    };
    panel(CASE_W, WALL, CASE_D, 0, WALL / 2, 0);
    panel(CASE_W, CASE_H, WALL, 0, CASE_H / 2, CASE_D / 2 - WALL / 2);
    panel(CASE_W, CASE_H, WALL, 0, CASE_H / 2, -CASE_D / 2 + WALL / 2);
    panel(WALL, CASE_H, CASE_D, CASE_W / 2 - WALL / 2, CASE_H / 2, 0);
    panel(WALL, CASE_H, CASE_D, -CASE_W / 2 + WALL / 2, CASE_H / 2, 0);

    // the centimetre rule printed along the bottom of the front and the back (either side faces the viewer)
    // a printed white strip: lit a little from within so it stays readable on the shaded side
    const ruleTex = makeRule();
    const ruleMat = new MeshStandardMaterial({ map: ruleTex, emissive: new Color(0xffffff), emissiveMap: ruleTex, emissiveIntensity: 0.35, transparent: true, roughness: 0.6, metalness: 0, side: DoubleSide, depthWrite: false });
    for (const sz of [1, -1]) {
      const rule = new Mesh(new PlaneGeometry(CASE_W - 0.004, 0.016), ruleMat);
      rule.position.set(0, WALL + 0.011, sz * (CASE_D / 2 + 0.0006));
      rule.rotation.y = sz > 0 ? 0 : Math.PI;
      rule.renderOrder = 7;
      this.group.add(rule);
    }
    // the small label in the top corner
    const labelTex = makeLabel();
    const label = new Mesh(new PlaneGeometry(0.05, 0.014), new MeshStandardMaterial({ map: labelTex, emissive: new Color(0xffffff), emissiveMap: labelTex, emissiveIntensity: 0.3, transparent: true, roughness: 0.7, side: DoubleSide, depthWrite: false }));
    label.position.set(CASE_W / 2 - 0.035, CASE_H - 0.016, CASE_D / 2 + 0.0006);
    label.renderOrder = 7;
    this.group.add(label);

    // the water and its surface
    this.body = new Mesh(new BoxGeometry(CASE_W - 2 * WALL, CASE_WATER, CASE_D - 2 * WALL), water);
    this.body.position.set(0, WALL + CASE_WATER / 2, 0);
    this.body.renderOrder = 3;
    this.group.add(this.body);
    this.surface = new Mesh(new PlaneGeometry(CASE_W - 2 * WALL, CASE_D - 2 * WALL), surfaceMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.set(0, WALL + CASE_WATER, 0);
    this.surface.renderOrder = 4;
    this.group.add(this.surface);

    this.animals.name = 'fieldCaseAnimals';
    this.group.visible = false;
  }

  /**
   * Set the case down with its bottom at `y`, its long side across the player's view (to the nearest right angle).
   * `afloat` lets it ride the water: a slow bob and a slight roll.
   */
  place(x: number, y: number, z: number, yaw: number, afloat = false): void {
    const snapped = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, snapped, 0);
    this.group.visible = true;
    this.group.updateMatrixWorld(true);
    this.restY = y;
    this.afloat = afloat;
    this.floorY = y + WALL;
    const turned = Math.abs(Math.sin(snapped)) > 0.5;
    this.halfX = (turned ? CASE_D : CASE_W) / 2 - WALL;
    this.halfZ = (turned ? CASE_W : CASE_D) / 2 - WALL;
  }

  takeUp(): void {
    this.group.visible = false;
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.clearOccupants();
  }

  get visible(): boolean {
    return this.group.visible;
  }

  get floating(): boolean {
    return this.afloat;
  }

  /** the middle of the water, world space */
  get center(): Vector3 {
    return this.tmp.set(0, WALL + CASE_WATER / 2, 0).applyMatrix4(this.group.matrixWorld);
  }

  /** world-space half extents of the inside, for anyone placing things in it */
  get inside(): { x: number; z: number } {
    return { x: this.halfX, z: this.halfZ };
  }

  get count(): number {
    return this.occupants.length;
  }

  async setOccupants(records: IndividualRecord[], species: (id: string) => SpeciesDef | undefined): Promise<void> {
    this.records = [...records]; this.lookup = species;
    const generation = ++this.generation;
    const wanted = new Set(records.map((r) => r.id));
    for (const o of [...this.occupants]) if (!wanted.has(o.record.id)) this.removeOccupant(o.record.id);
    for (const rec of records.slice(0, CASE_MAX)) {
      if (this.occupants.some((o) => o.record.id === rec.id)) continue;
      if (generation !== this.generation) return;
      try { await this.addOccupant(rec, species(rec.speciesId), generation); }
      catch (e) { console.warn('[case] model unavailable; retry when reopened', e); }
    }
  }

  setQuality(preset: QualityPreset): void {
    if (this.preset === preset) return;
    this.preset = preset;
    const records = this.records, lookup = this.lookup;
    this.clearOccupants();
    if (lookup && this.group.visible) void this.setOccupants(records, lookup);
  }

  private async addOccupant(record: IndividualRecord, species: SpeciesDef | undefined, generation: number): Promise<void> {
    if (!species || !this.group.visible) return;
    const entry = DRIVERS[species.model.driver ?? ''];
    if (!entry) return;
    const seed = hashInts(record.number, record.caughtAt % 100000);
    const ind = generateIndividual(species, seed, 0, 0, 0, 0, Date.now());
    ind.length_mm = record.length_mm; ind.weight_g = record.weight_g; ind.sex = record.sex; ind.stage = record.stage; ind.traits = [...record.traits]; ind.gravid = !!record.gravid; ind.dress = !!record.dress;
    const slot = this.occupants.length;
    const c = this.group.position;
    const long = this.halfX >= this.halfZ;
    const u = (slot % 3 - 1) * 0.09, v = (slot >= 3 ? 0.03 : -0.03);
    ind.pos.set(c.x + (long ? u : v), this.floorY, c.z + (long ? v : u));
    ind.home.copy(ind.pos);
    ind.heading = (long ? Math.PI / 2 : 0) + (slot % 2 ? Math.PI : 0);
    let root: Object3D, bones: Record<string, Object3D> = {}, meshes: Object3D[] = [], extras: Record<string, unknown> = {};
    const files = modelFor(species, ind.stage, ind.gravid, ind.dress);
    const rel = this.preset.modelTier === 'lod2' ? files.lod2 ?? (entry.placeholder ? undefined : files.lod1) : files.lod1 ?? files.lod2 ?? (entry.placeholder ? undefined : files.hero);
    if (rel) {
      const model = await instantiateModel(rel, variantOf(ind.id));
      root = model.root; bones = model.bones as Record<string, Object3D>; meshes = model.meshes; extras = model.extras;
    } else if (entry.placeholder) {
      const ph = entry.placeholder();
      ph.root.userData.placeholder = ph;
      // the whole shell on the acrylic, nothing to dig into
      ph.root.userData.startOnSurface = true;
      root = ph.root;
    } else return;
    if (generation !== this.generation || !this.group.visible || this.occupants.some((o) => o.record.id === record.id)) { root.removeFromParent(); return; }
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
    ++this.generation;
    this.records = [];
    for (const o of [...this.occupants]) this.removeOccupant(o.record.id);
  }

  update(dt: number, player: Vector3): void {
    if (!this.group.visible) return;
    this.time += dt;
    this.surface.position.y = WALL + CASE_WATER + Math.sin(this.time * 1.7) * 0.0006;
    if (this.afloat) {
      // riding the water: a slow bob, a slight roll; the animals' floor rides with it
      const yaw = this.group.rotation.y;
      this.group.position.y = this.restY + Math.sin(this.time * 1.25) * 0.004 + Math.sin(this.time * 0.53 + 1.1) * 0.002;
      this.group.rotation.set(Math.sin(this.time * 0.9 + 0.7) * 0.012, yaw, Math.sin(this.time * 1.1) * 0.014);
      this.group.updateMatrixWorld(true);
      this.floorY = this.group.position.y + WALL;
    }
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
      d.update(dt, { floor: this.floor, player, simScale: 1, nowMs: Date.now(), bounds: { minX, maxX, minZ, maxZ }, canBurrow: false });
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

/** The centimetre rule along the bottom edge: millimetre ticks, numbers every centimetre, like a printed scale. */
function makeRule(): CanvasTexture {
  const W = 2048, H = 96;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255, 255, 255, 0.92)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1b2226';
  g.fillStyle = '#1b2226';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H - 2); g.lineTo(W, H - 2); g.stroke();
  const cm = W / 36;
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  for (let mm = 0; mm <= 360; mm++) {
    const x = (mm / 10) * cm;
    const long = mm % 10 === 0, mid = mm % 5 === 0;
    const len = long ? 46 : mid ? 30 : 18;
    g.lineWidth = long ? 3 : 2;
    g.beginPath(); g.moveTo(x, H); g.lineTo(x, H - len); g.stroke();
    if (long && mm > 0 && mm < 360) g.fillText(String(mm / 10), x, 36);
  }
  g.font = '26px sans-serif';
  g.textAlign = 'left';
  g.fillText('cm', 8, 36);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The small label in the corner: the game's name. */
function makeLabel(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.fillRect(0, 0, 256, 72);
  g.fillStyle = '#1b2226';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.fillText('干潟図鑑', 128, 38);
  g.font = '16px sans-serif';
  g.fillText('OBSERVATION CASE', 128, 62);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
