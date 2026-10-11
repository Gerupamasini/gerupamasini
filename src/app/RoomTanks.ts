import { BoxGeometry, DoubleSide, Group, Light, LOD, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3, type Camera, type Material } from 'three';
import { AquariumEquipment, TANK_DIMENSIONS, type RoomTank } from '../aquarium';
import { TANK_OFFSET_Y, SAND_H } from './TankScene';
import { buildTankItem } from './TankLayout';
import { instantiateModel } from '../creatures/models/ModelLoader';
import { modelFor, variantOf } from '../creatures/models/choice';
import { generateIndividual } from '../creatures/Individual';
import { DRIVERS } from '../creatures/drivers';
import type { Driver } from '../creatures/drivers/Driver';
import type { SpeciesDef } from '../data/schemas';

/** Other containers share the room, with static water and light models while the viewed tank simulates. */
export class RoomTanks extends Group {
  private generation = 0;
  private key = '';
  private rigs: AquariumEquipment[] = [];
  private drivers: Driver[] = [];
  private readonly water = new MeshStandardMaterial({ color: 0x8eafbb, transparent: true, opacity: 0.14, roughness: 0.12, side: DoubleSide, depthWrite: false });
  private readonly glass = new MeshStandardMaterial({ color: 0xcde2e7, transparent: true, opacity: 0.08, roughness: 0.15, depthWrite: false });
  private readonly sand = new MeshStandardMaterial({ color: 0xb09c78, roughness: 0.95 });
  private readonly mud = new MeshStandardMaterial({ color: 0x655843, roughness: 0.96 });
  onChanged: (() => void) | null = null;

  setTanks(tanks: RoomTank[], active: string | null, species: (id: string) => SpeciesDef | undefined): void {
    const others = tanks.filter(t => t.id !== active), key = JSON.stringify(others);
    if (key === this.key) return;
    this.key = key; this.clearTanks(); const generation = this.generation;
    for (const tank of others) {
      const d = TANK_DIMENSIONS[tank.size], root = new Group(); root.name = tank.id; root.position.set(tank.position[0], TANK_OFFSET_Y, tank.position[1]); this.add(root);
      const rig = new AquariumEquipment(d); rig.setLayout(tank.layout.equipment); rig.applyPreset(); this.rigs.push(rig); root.add(rig);
      rig.traverse(o => { if (o instanceof Light) o.visible = false; if (o instanceof Mesh && o.material === rig.materials.glass) o.material = this.glass; });
      const water = new Mesh(new PlaneGeometry(d.width - 0.005, d.depth - 0.005).rotateX(-Math.PI / 2), this.water); water.position.y = d.waterHeight; root.add(water);
      const floor = tank.layout.substrate === 'none' ? 0 : SAND_H;
      if (floor) { const bed = new Mesh(new BoxGeometry(d.width - 0.005, floor, d.depth - 0.005), tank.layout.substrate === 'mud' ? this.mud : this.sand); bed.position.y = floor / 2; root.add(bed); }
      for (const item of tank.layout.items) { const decoration = buildTankItem(item.type, [...item.id].reduce((n, c) => n + c.charCodeAt(0), 0)); decoration.position.set(item.x, floor, item.z); decoration.rotation.y = item.rot; decoration.userData.roomDecoration = true; root.add(decoration); }
      for (const [slot, record] of tank.individuals.entries()) {
        const sp = species(record.speciesId), entry = sp && DRIVERS[sp.model.driver ?? '']; if (!sp || !entry) continue;
        void (async () => {
          const files = modelFor(sp, record.stage, record.gravid, record.dress);
          const model = files.lod2 ? await instantiateModel(files.lod2, variantOf(record.id)) : null;
          if (generation !== this.generation) return;
          const object = model?.root ?? entry.placeholder?.().root; if (!object) return;
          const ind = generateIndividual(sp, record.number + slot, 0, 0, 0, 0, Date.now());
          Object.assign(ind, { id: record.id, length_mm: record.length_mm, weight_g: record.weight_g, sex: record.sex, stage: record.stage, traits: record.traits, gravid: !!record.gravid, dress: !!record.dress });
          ind.pos.set((slot - 1.5) * Math.min(0.07, d.width / 6), floor, (slot % 2 ? 1 : -1) * d.depth * 0.12); ind.home.copy(ind.pos);
          const driver = entry.create(); driver.attach(object, ind, model?.extras ?? {}, model?.bones ?? {}, model?.meshes ?? []); this.drivers.push(driver); root.add(object); object.userData.roomOccupantId = record.id;
          driver.update(0, { floor: { heightAt: () => floor, waterAt: () => d.waterHeight }, player: new Vector3(0, 1, 2), simScale: 1, nowMs: Date.now(), bounds: { minX: -d.width / 2 + 0.02, maxX: d.width / 2 - 0.02, minZ: -d.depth / 2 + 0.02, maxZ: d.depth / 2 - 0.02 }, canBurrow: floor > 0 });
          this.onChanged?.();
        })().catch(error => console.warn('[room] background model unavailable', error));
      }
    }
  }
  updateLOD(camera: Camera): void { this.rigs.forEach(r => r.traverse(o => { if (o instanceof LOD) o.update(camera); })); }
  private clearTanks(): void {
    ++this.generation; this.drivers.forEach(d => d.dispose()); this.drivers = [];
    this.rigs.forEach(r => r.dispose()); this.rigs = [];
    this.traverse(o => {
      if (o.userData.roomDecoration) {
        const materials = new Set<Material>();
        o.traverse(part => { if (part instanceof Mesh) { part.geometry.dispose(); for (const m of Array.isArray(part.material) ? part.material : [part.material]) materials.add(m); } });
        materials.forEach(m => m.dispose());
      } else if (o instanceof Mesh && (o.material === this.water || o.material === this.sand || o.material === this.mud)) o.geometry.dispose();
    });
    this.clear();
  }
  override dispose(): void { this.clearTanks(); [this.water, this.glass, this.sand, this.mud].forEach(m => m.dispose()); this.removeFromParent(); }
}
