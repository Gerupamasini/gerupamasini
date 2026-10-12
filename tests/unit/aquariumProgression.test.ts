import { describe, expect, it } from 'vitest';
import { defaultEquipmentLayout, makeEquipment, TANK_DIMENSIONS, TANK_SIZES } from '../../src/aquarium/state';
import { initialProgression, FILTER_KINDS, FILTER_MAX_LEVEL, FILTER_SPECS, tankAnimalCapacity, buyAquariumUpgrade, normalizeProgression, claimIntroQuests, INTRO_QUESTS, animalSlotPosition } from '../../src/aquarium/progression';
import { emptyEquipmentCollection, equipmentUnlocked, normalizeCollection, ownedEquipmentLayout } from '../../src/aquarium/catalog';
import { newRoomTank } from '../../src/aquarium/room';
import { emptySave, InvalidSaveError, parseSave } from '../../src/core/Save';

const fish = (n: number) => ({ id: `fish-${n}`, speciesId: 'acanthogobius_flavimanus', number: n + 1, length_mm: 80, weight_g: 10, sex: 'unknown' as const, stage: 'subadult', traits: [], caughtAt: 1, caughtWhere: [0, 0] as [number, number], tideLevel: 0 });
const state = { discovered: 0, captures: 0, behaviors: 0, tankAnimals: 0, tankCount: 1 };

describe('aquarium shop progression', () => {
  it('starts with only the 60cm size and underwater filter, keeping four animal slots', () => {
    const c = emptyEquipmentCollection(), p = c.progression!;
    expect(p.sizes).toEqual([60]); expect(p.filters.filter).toBe(1);
    expect(defaultEquipmentLayout().devices.filter(d => FILTER_KINDS.includes(d.kind as 'filter')).map(d => d.kind)).toEqual(['filter']);
    expect(tankAnimalCapacity(60, defaultEquipmentLayout(), p)).toBe(4);
    for (const id of ['tank-45-initial', 'stand-120-initial', 'canisterFilter-initial']) expect(equipmentUnlocked(c, id)).toBe(false);
    c.stock['canisterFilter-studio'] = 1; c.stock['tank-90-ivory'] = 1;
    expect(equipmentUnlocked(c, 'canisterFilter-studio')).toBe(false);
    expect(equipmentUnlocked(c, 'tank-90-ivory')).toBe(false);
  });
  it('charges CR atomically, prevents repeated unlocks, and bounds filter upgrades', () => {
    const p = initialProgression();
    expect(buyAquariumUpgrade(p, 149, 'tank', 45)).toBeNull();
    const bought = buyAquariumUpgrade(p, 150, 'tank', 45)!;
    expect(bought.money).toBe(0); expect(bought.progression.sizes).toContain(45); expect(p.sizes).toEqual([60]);
    expect(buyAquariumUpgrade(bought.progression, 9999, 'tank', 45)).toBeNull();
    expect(buyAquariumUpgrade(p, NaN, 'tank', 90)).toBeNull();
    for (const kind of FILTER_KINDS) {
      let current = initialProgression(), money = 5000;
      while (current.filters[kind] < FILTER_MAX_LEVEL) {
        const r = buyAquariumUpgrade(current, money, 'filter', kind)!;
        expect(r.money).toBe(money - r.cost); current = r.progression; money = r.money;
      }
      expect(buyAquariumUpgrade(current, money, 'filter', kind)).toBeNull();
      expect(current.filters[kind]).toBe(5);
    }
  });
  it('caps capacity by the tank size, never adds capacity for duplicate filters', () => {
    const p = initialProgression(); p.filters.canisterFilter = 5;
    const layout = defaultEquipmentLayout(); layout.devices = [makeEquipment('canisterFilter', 'external')];
    expect(TANK_SIZES.map(size => tankAnimalCapacity(size, layout, p))).toEqual([6, 10, 16, 20]);
    p.filters.spongeFilter = 3; layout.devices = [makeEquipment('spongeFilter', 'one'), makeEquipment('spongeFilter', 'two')];
    expect(tankAnimalCapacity(120, layout, p)).toBe(FILTER_SPECS.spongeFilter.capacities[2]);
  });
  it('retains only one unlocked filter type, supplies the starter when none are usable', () => {
    const c = emptyEquipmentCollection(), l = defaultEquipmentLayout();
    l.devices.push(makeEquipment('topFilter', 'top'), makeEquipment('spongeFilter', 'sponge'));
    let safe = ownedEquipmentLayout(l, c);
    expect(safe.devices.filter(d => FILTER_KINDS.includes(d.kind as 'filter')).map(d => d.kind)).toEqual(['filter']);
    c.progression!.filters.topFilter = 2; c.progression!.filters.spongeFilter = 1;
    safe = ownedEquipmentLayout(l, c);
    expect(safe.devices.filter(d => FILTER_KINDS.includes(d.kind as 'filter')).map(d => d.kind)).toEqual(['topFilter']);
    const empty = { ...l, tankItemId: 'tank-45-initial', devices: [] };
    safe = ownedEquipmentLayout(empty, c);
    expect(safe.devices[0].position[0]).toBeGreaterThan(-TANK_DIMENSIONS[45].width / 2);
  });
  it('grandfathers old equipped sizes and filter types across all rooms exactly once', () => {
    const s = emptySave('map', 1), one = newRoomTank('one', 90, [0, 0]), two = newRoomTank('two', 120, [-1.8, 0]);
    one.layout.equipment!.devices = [makeEquipment('topFilter', 'top')]; two.layout.equipment!.devices = [makeEquipment('canisterFilter', 'external')];
    s.aquariumRoom = { version: 1, mainTankId: 'one', tanks: [one, two] };
    s.equipmentCollection = { version: 1, stock: {}, draws: 5, tickets: 0 };
    const migrated = parseSave(s);
    expect(migrated.equipmentCollection!.progression!.sizes).toEqual(expect.arrayContaining([60, 90, 120]));
    expect(migrated.equipmentCollection!.progression!.filters).toMatchObject({ topFilter: 1, canisterFilter: 1 });
    expect(migrated.equipmentCollection!.tickets).toBe(0);
    expect(parseSave(migrated)).toEqual(migrated);
    // New saves do not acquire an unlock by importing an equipped filter.
    expect(normalizeCollection(emptyEquipmentCollection(), one.layout.equipment).progression!.filters.topFilter).toBe(0);
  });
  it('round-trips more than four animals without truncation and rejects excess capacity or locked sizes', () => {
    const s = emptySave('map', 1), tank = newRoomTank('one', 120, [0, 0]);
    s.equipmentCollection!.progression!.sizes.push(120); s.equipmentCollection!.progression!.filters.canisterFilter = 5;
    tank.layout.equipment!.devices = [makeEquipment('canisterFilter', 'external')];
    tank.individuals = Array.from({ length: 20 }, (_, n) => fish(n));
    s.aquariumRoom = { version: 1, mainTankId: 'one', tanks: [tank] };
    const restored = parseSave(s); expect(restored.tank.individuals).toHaveLength(20); expect(parseSave(restored)).toEqual(restored);
    tank.individuals.push(fish(20)); expect(() => parseSave(s)).toThrow(InvalidSaveError);
    tank.individuals.pop(); s.equipmentCollection!.progression!.filters.canisterFilter = 1;
    expect(() => parseSave(s)).toThrow(InvalidSaveError);
    tank.individuals = []; s.equipmentCollection!.progression!.sizes = [60];
    expect(() => parseSave(s)).toThrow(InvalidSaveError);
  });
  it('places every animal slot within every tank instead of sending later fish outside it', () => {
    for (const size of TANK_SIZES) for (let i = 0; i < 20; i++) {
      const d = TANK_DIMENSIONS[size], [x, z] = animalSlotPosition(i, 20, d.width, d.depth);
      expect(Math.abs(x)).toBeLessThan(d.width / 2 - 0.02); expect(Math.abs(z)).toBeLessThan(d.depth / 2 - 0.02);
    }
  });
});

describe('introduction quest CR', () => {
  it('awards only completed goals, once, and persists them through normalization', () => {
    const p = initialProgression(); p.visitedField = true;
    const first = claimIntroQuests(p, state);
    expect(first.awarded).toBe(100); expect(p.questRewards).toEqual([]);
    expect(claimIntroQuests(normalizeProgression(first.progression), state).awarded).toBe(0);
    const caught = claimIntroQuests(first.progression, { ...state, discovered: 1, captures: 1, tankAnimals: 1 });
    expect(caught.awarded).toBe(450);
    expect(claimIntroQuests(caught.progression, state).awarded).toBe(0); // Releasing the animal does not reset the reward.
    const s = emptySave('map', 1); s.equipmentCollection!.progression = caught.progression; s.player.money = 550;
    expect(parseSave(s).equipmentCollection!.progression!.questRewards).toEqual(caught.progression.questRewards);
  });
  it('does not award purchase goals until something is actually unlocked or upgraded', () => {
    const p = initialProgression(); expect(claimIntroQuests(p, state).awarded).toBe(0);
    const upgraded = buyAquariumUpgrade(p, 50, 'filter', 'filter')!;
    expect(claimIntroQuests(upgraded.progression, state).awarded).toBe(100);
    const all = initialProgression(); all.visitedField = true; all.sizes = [...TANK_SIZES]; for (const k of FILTER_KINDS) all.filters[k] = 5;
    const reward = claimIntroQuests(all, { discovered: 1, captures: 1, behaviors: 1, tankAnimals: 1, tankCount: 2 });
    expect(reward.awarded).toBe(INTRO_QUESTS.reduce((n, q) => n + q.cr, 0));
    expect(reward.progression.questRewards).toHaveLength(INTRO_QUESTS.length);
  });
  it('sanitizes corrupt progression without opening all filters or replaying a completed quest', () => {
    const p = normalizeProgression({ version: 1, sizes: [45, 777, 45], filters: { filter: -1, topFilter: NaN, canisterFilter: 900 }, questRewards: ['field', 'field', 'unknown'] });
    expect(p.sizes).toEqual([45, 60]); expect(p.filters).toMatchObject({ filter: 1, topFilter: 0, canisterFilter: 5 });
    expect(p.questRewards).toEqual(['field']);
  });
});
