import { describe, expect, it } from 'vitest';
import { emptySave, InvalidSaveError, parseSave } from '../../src/core/Save';
import { canPlaceTank, freeTankPosition, newRoomTank, resizedTankLayout, roomCapacity } from '../../src/aquarium/room';
import { equipmentItem, emptyEquipmentCollection, GACHA_POOL, tankSizeItemId } from '../../src/aquarium/catalog';
import { TANK_DIMENSIONS, TANK_SIZES } from '../../src/aquarium/state';
import type { IndividualRecord } from '../../src/creatures/Individual';

const fish = (id: string): IndividualRecord => ({ id, speciesId: 'acanthogobius_flavimanus', number: 1, length_mm: 80, weight_g: 10, sex: 'unknown', stage: 'subadult', traits: [], caughtAt: 1, caughtWhere: [0, 0], tideLevel: 0 });
const multiSave = () => {
  const a = newRoomTank('one', 45, [0, 0]), b = newRoomTank('two', 120, [1.8, 0]);
  a.individuals = [fish('first')]; b.individuals = [fish('second')];
  return { ...emptySave('map', 1), aquariumRoom: { version: 1 as const, mainTankId: 'two', tanks: [a, b] } };
};

describe('aquarium room', () => {
  it('unlocks exactly two tanks at level 5 and three at level 10', () => {
    expect([1, 4, 5, 9, 10, 99].map(roomCapacity)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('provides size-specific standard tanks and reinforced cabinets without renaming the old 60cm items', () => {
    for (const size of TANK_SIZES) {
      expect(TANK_DIMENSIONS[size].width).toBe(size / 100);
      const tank = newRoomTank('tank', size, [0, 0]);
      for (const category of ['tank', 'stand'] as const) {
        expect(equipmentItem(tankSizeItemId(category, size))).toMatchObject({ category, size, rarity: 'initial' });
        expect(GACHA_POOL.some(i => i.category === category && i.size === size)).toBe(true);
      }
      expect(tank.layout.equipment?.devices.find(d => d.kind === 'ledLight')?.position[1]).toBeCloseTo(TANK_DIMENSIONS[size].height + 0.07);
    }
    expect(tankSizeItemId('tank', 60)).toBe('tank-initial');
    expect(tankSizeItemId('stand', 60, 'studio')).toBe('stand-studio');
  });
  it('migrates an old single tank with its animals and layout, and preserves a deliberately empty room', () => {
    const old = emptySave('map', 1); old.tank.individuals = [fish('old')]; old.tank.layout!.substrate = 'mud';
    const migrated = parseSave(old);
    expect(migrated.aquariumRoom?.tanks).toHaveLength(1);
    expect(migrated.aquariumRoom?.tanks[0]).toMatchObject({ size: 60, position: [0, 0], individuals: [fish('old')], layout: { substrate: 'mud' } });
    const empty = parseSave({ ...emptySave('map', 1), aquariumRoom: { version: 1, mainTankId: null, tanks: [] } });
    expect(parseSave(empty).aquariumRoom?.tanks).toEqual([]);
    expect(empty.tank.individuals).toEqual([]);
  });
  it('round-trips all tanks and keeps the main tank in the legacy save field', () => {
    const saved = parseSave(multiSave());
    expect(saved.aquariumRoom?.mainTankId).toBe('two');
    expect(saved.tank.individuals.map(f => f.id)).toEqual(['second']);
    expect(saved.tank.layout?.equipment?.standItemId).toBe('stand-120-initial');
    expect(parseSave(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('rejects duplicate residents, IDs, invalid main choices, overlapping containers and out-of-room positions', () => {
    for (const change of [
      (s: ReturnType<typeof multiSave>) => { s.aquariumRoom.tanks[1].individuals = [fish('first')]; },
      (s: ReturnType<typeof multiSave>) => { s.aquariumRoom.tanks[1].id = 'one'; },
      (s: ReturnType<typeof multiSave>) => { s.aquariumRoom.mainTankId = 'missing'; },
      (s: ReturnType<typeof multiSave>) => { s.aquariumRoom.tanks[1].position = [0, 0]; },
      (s: ReturnType<typeof multiSave>) => { s.aquariumRoom.tanks[1].position = [3, 0]; },
      (s: ReturnType<typeof multiSave>) => { s.case = [fish('first')]; },
    ]) { const save = multiSave(); change(save); expect(() => parseSave(save)).toThrow(InvalidSaveError); }
  });
  it('enforces ownership across containers rather than granting each tank its own copy', () => {
    const save = multiSave(); save.equipmentCollection = { ...emptyEquipmentCollection(), stock: { 'ledLight-ivory': 1 } };
    for (const t of save.aquariumRoom.tanks) t.layout.equipment!.devices.find(d => d.kind === 'ledLight')!.itemId = 'ledLight-ivory';
    const owned = parseSave(save).aquariumRoom!.tanks.map(t => t.layout.equipment!.devices.find(d => d.kind === 'ledLight')!.itemId);
    expect(owned).toEqual(['ledLight-ivory', 'ledLight-initial']);
  });
  it('fits three 120cm presets and rejects overlaps, invalid numbers and a fourth tank at the same spot', () => {
    const tanks = [];
    for (let i = 0; i < 3; i++) { const position = freeTankPosition(tanks, 120); expect(position).not.toBeNull(); tanks.push(newRoomTank(String(i), 120, position!)); }
    expect(tanks.map(t => t.position)).toEqual([[0, 0], [-1.8, 0], [1.8, 0]]);
    expect(canPlaceTank(tanks, 45, [0, 0])).toBe(false);
    expect(canPlaceTank(tanks, 45, [NaN, 0])).toBe(false);
  });
  it('resizes layout coordinates and matching stands while retaining the animals and design selection', () => {
    const tank = newRoomTank('tank', 60, [0, 0]); tank.layout.items.push({ id: 'rock', type: 'stone_s', x: 0.2, z: 0.08, rot: 1 });
    const layout = resizedTankLayout(tank.layout, 60, 120, 'tank-120-ivory');
    expect(layout.equipment?.tankItemId).toBe('tank-120-ivory'); expect(layout.equipment?.standItemId).toBe('stand-120-initial');
    expect(layout.items[0]).toMatchObject({ type: 'stone_s', x: 0.4, rot: 1 }); expect(layout.items[0].z).toBeCloseTo(0.12);
    expect(layout.equipment?.devices.find(d => d.kind === 'ledLight')?.position[1]).toBeCloseTo(0.52);
  });
});
