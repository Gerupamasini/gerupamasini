import { describe, expect, it } from 'vitest';
import { Mesh, PerspectiveCamera, Vector3 } from 'three';
import { AquariumEquipment, CATEGORY_LABELS, EQUIPMENT_CATEGORIES, EQUIPMENT_ITEMS, GACHA_COST, GACHA_POOL, categoryLimit, defaultEquipmentLayout, drawEquipment, emptyEquipmentCollection, gachaProbability, itemForCategory, normalizeCollection, normalizeEquipment, ownedEquipmentLayout, ownedQuantity, usedQuantity } from '../../src/aquarium';
import { emptySave, SaveStore } from '../../src/core/Save';

describe('aquarium collection and gacha', () => {
  it('offers three designs per category and a complete, normalized reward pool', () => {
    expect(new Set(EQUIPMENT_ITEMS.map((i) => i.id)).size).toBe(EQUIPMENT_ITEMS.length);
    for (const category of EQUIPMENT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
      expect(EQUIPMENT_ITEMS.filter((i) => i.category === category)).toHaveLength(3);
      expect(ownedQuantity(emptyEquipmentCollection(), `${category}-initial`)).toBe(Infinity);
    }
    expect(GACHA_POOL).toHaveLength(36);
    expect(GACHA_POOL.reduce((n, i) => n + gachaProbability(i.id), 0)).toBeCloseTo(1);
    expect(GACHA_POOL.filter((i) => i.rarity === 'R').reduce((n, i) => n + gachaProbability(i.id), 0)).toBeCloseTo(0.2);
    expect(categoryLimit('stand')).toBe(1); expect(categoryLimit('airStone')).toBeGreaterThan(1);
  });

  it('charges once per draw, awards quantities, and leaves the input snapshot intact', () => {
    const initial = emptyEquipmentCollection(), draw = drawEquipment(initial, GACHA_COST * 10, 10, () => 0)!;
    expect(draw.money).toBe(0); expect(draw.results).toHaveLength(10); expect(draw.collection.draws).toBe(10);
    expect(draw.results[0]).toEqual({ itemId: GACHA_POOL[0].id, isNew: true, quantity: 1 });
    expect(draw.results[9]).toEqual({ itemId: GACHA_POOL[0].id, isNew: false, quantity: 10 });
    expect(draw.collection.stock[GACHA_POOL[0].id]).toBe(10); expect(initial).toEqual(emptyEquipmentCollection());
    expect(drawEquipment(initial, GACHA_COST, 1, () => 1 - Number.EPSILON)!.results[0].itemId).toBe(GACHA_POOL.at(-1)!.id);
  });

  it('rejects insufficient credits, invalid counts and invalid random values atomically', () => {
    const initial = emptyEquipmentCollection();
    for (const money of [99, -1, NaN, Infinity]) expect(drawEquipment(initial, money, 1)).toBeNull();
    for (const count of [0, 2, 9, NaN]) expect(drawEquipment(initial, 1000, count)).toBeNull();
    let i = 0; expect(drawEquipment(initial, 1000, 10, () => ++i < 4 ? 0 : NaN)).toBeNull();
    expect(initial).toEqual(emptyEquipmentCollection());
  });

  it('preserves equipped legacy designs while enforcing ownership and quantities in new saves', () => {
    const legacy = normalizeEquipment({ ...defaultEquipmentLayout(), stand: 'metal' });
    const migrated = normalizeCollection(undefined, legacy);
    expect(migrated.stock['stand-studio']).toBe(1);
    expect(ownedEquipmentLayout(legacy, migrated).stand).toBe('metal');
    const layout = normalizeEquipment(defaultEquipmentLayout());
    layout.devices.find((d) => d.kind === 'airStone')!.itemId = 'airStone-ivory';
    layout.devices.push({ ...layout.devices.find((d) => d.kind === 'airStone')!, id: 'stone-two' });
    layout.standItemId = 'stand-studio'; layout.stand = 'metal';
    const owned = { version: 1 as const, stock: { 'airStone-ivory': 1 }, draws: 1 };
    const safe = ownedEquipmentLayout(layout, owned);
    expect(safe.stand).toBe('wood'); expect(safe.devices.filter((d) => d.itemId === 'airStone-ivory')).toHaveLength(1);
    expect(usedQuantity(safe, 'airStone-ivory')).toBe(1);
    expect(usedQuantity(safe, 'airStone-ivory', 'airStone')).toBe(0);
    expect(layout.devices.filter((d) => d.itemId === 'airStone-ivory')).toHaveLength(2);
    expect(itemForCategory('heater-studio', 'airStone').id).toBe('airStone-initial');
    expect(normalizeCollection({ version: 1, stock: { invalid: 2, 'tank-ivory': NaN, 'stand-studio': -1, 'airStone-ivory': 2.9 }, draws: Infinity })).toEqual({ version: 1, stock: { 'airStone-ivory': 2 }, draws: 0 });
  });

  it('round-trips collection and equipped designs through the real save migration', () => {
    const store = new SaveStore(), save = emptySave('map', 1);
    save.tank.layout!.equipment = normalizeEquipment({ ...defaultEquipmentLayout(), stand: 'metal' });
    const old = store.importJson(JSON.stringify(save)); expect(old.equipmentCollection!.stock['stand-studio']).toBe(1);
    expect(old.tank.layout!.equipment!.standItemId).toBe('stand-studio');
    const restored = store.importJson(store.exportJson(old)); expect(restored).toEqual(old);
    restored.tank.layout!.equipment!.tankItemId = 'tank-studio';
    expect(store.importJson(store.exportJson(restored)).tank.layout!.equipment!.tankItemId).toBe('tank-initial');
  });

  it('swaps models without moving endpoints or changing operation and shares finish materials', () => {
    const rig = new AquariumEquipment(), before = rig.currentLayout, camera = new PerspectiveCamera(); camera.position.set(0, 0.4, 1);
    rig.setItem('airStone', 'airStone-ivory'); rig.setItem('ledLight', 'ledLight-ivory'); rig.setItem('stand', 'stand-studio'); rig.setItem('tank', 'tank-ivory'); rig.applyPreset(); rig.update(0.016, camera);
    expect(rig.currentLayout.devices.find((d) => d.id === 'airStone')!.position).toEqual(before.devices.find((d) => d.id === 'airStone')!.position);
    expect(rig.lightLevel).toBe(1); expect(rig.flows).toHaveLength(1); expect(rig.currentLayout.stand).toBe('metal'); expect(rig.warnings).toHaveLength(0);
    const materials = new Set(Object.values(rig.materials));
    rig.traverse((o) => { if (o instanceof Mesh) expect(materials.has(o.material)).toBe(true); });
    const snapshot = JSON.parse(JSON.stringify(rig.currentLayout)); rig.setLayout(snapshot); rig.applyPreset(); expect(rig.currentLayout).toEqual(snapshot); rig.dispose();
  });

  it('automatically supplies multiple air interiors and additional electric loads', () => {
    const rig = new AquariumEquipment();
    for (let i = 0; i < 3; i++) rig.addDevice('airStone');
    for (const kind of ['flowPump', 'circulationPump', 'filter', 'lightFixture', 'chiller', 'spongeFilter'] as const) rig.addDevice(kind);
    rig.applyPreset(); const camera = new PerspectiveCamera(); camera.position.set(0, 1, 1); rig.position.y = 0.73; rig.update(0.3, camera);
    expect(rig.currentLayout.devices.filter((d) => d.kind === 'airPump')).toHaveLength(2);
    expect(rig.currentLayout.devices.filter((d) => d.kind === 'powerStrip').length).toBeGreaterThan(1);
    expect(rig.currentLayout.connections.filter((c) => c.kind === 'air')).toHaveLength(5);
    expect(rig.warnings).toHaveLength(0);
    for (const d of rig.devices.values()) if (d.ports.has('power') && d.kind !== 'heater') expect(d.powered, d.kind).toBe(true);
    const bubbles: boolean[] = []; rig.traverse((o) => { if (o.type === 'Points') bubbles.push(o.visible); }); expect(bubbles.every(Boolean)).toBe(true);
    const saved = rig.currentLayout; rig.applyPreset(); expect(rig.currentLayout).toEqual(saved);
    rig.removeDevice('airPump'); rig.removeDevice('powerStrip'); rig.applyPreset(); rig.update(0.016, camera); expect(rig.warnings).toHaveLength(0); expect(rig.lightLevel).toBe(2);
    rig.dispose();
  });

  it('places duplicate lights and wall pumps inside the aquarium and wires spare strips', () => {
    const rig = new AquariumEquipment();
    for (let i = 0; i < 3; i++) rig.addDevice('ledLight');
    for (let i = 0; i < 4; i++) rig.addDevice('flowPump');
    rig.addDevice('powerStrip'); rig.addDevice('powerStrip');
    expect(rig.applyPreset()).toBe(true); const camera = new PerspectiveCamera(); camera.position.set(0, 1, 1); rig.update(0.016, camera);
    expect(rig.lightLevel).toBe(4); expect(rig.flows.filter((f) => rig.devices.get(f.device)?.kind === 'flowPump')).toHaveLength(4);
    for (const record of rig.currentLayout.devices.filter((d) => d.kind === 'ledLight')) { expect(record.position[0]).toBe(0); expect(Math.abs(record.position[2])).toBeLessThan(0.15); }
    for (const d of rig.devices.values()) if (d.kind === 'powerStrip') expect(d.powered).toBe(true);
    expect(rig.canRemoveDevice('airPump')).toBe(false); expect(rig.canRemoveDevice('thermometer')).toBe(false); expect(rig.canRemoveDevice('airStone')).toBe(true); expect(rig.canRemoveDevice('powerStrip')).toBe(true);
    rig.dispose();
  });
});
