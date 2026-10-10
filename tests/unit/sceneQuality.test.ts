import { describe, expect, it } from 'vitest';
import { normalizeSettings, QUALITY_PRESETS } from '../../src/core/Settings';
import { claimResearchTickets, drawEquipment, emptyEquipmentCollection, normalizeCollection } from '../../src/aquarium/catalog';

describe('independent scene quality', () => {
  it('migrates a legacy setting to both scenes without overwriting independent choices', () => {
    const old = normalizeSettings({ quality: 'low', mouseSensitivity: 4 });
    expect(old.homeQuality).toBe('low'); expect(old.fieldQuality).toBe('low');
    const split = normalizeSettings({ ...old, homeQuality: 'minimum', fieldQuality: 'high' });
    expect(split.homeQuality).toBe('minimum'); expect(split.fieldQuality).toBe('high');
    expect(split.mouseSensitivity).toBe(4);
    expect(normalizeSettings(undefined, { quality: 'low' }).homeQuality).toBe('low');
  });
  it('repairs corrupt settings and bounds finite numeric values before rendering', () => {
    const s = normalizeSettings({ homeQuality: 'broken', fieldQuality: 'minimum', mouseSensitivity: 'abc', eyeHeight: Infinity, sunglasses: 0 });
    expect(s.homeQuality).toBe('mid'); expect(s.fieldQuality).toBe('minimum');
    expect(s.mouseSensitivity).toBe(1); expect(s.eyeHeight).toBe(1.5); expect(s.sunglasses).toBe(true);
    expect(normalizeSettings({ mouseSensitivity: 100 }).mouseSensitivity).toBe(10);
    expect(QUALITY_PRESETS.minimum.hero).toBe(false);
    expect(QUALITY_PRESETS.minimum.tankWaterHz).toBe(0);
  });
});
describe('repeatable research ticket rewards', () => {
  it('awards crossed milestones once and preserves a spent balance through migration', () => {
    let collection = emptyEquipmentCollection();
    expect(claimResearchTickets(collection, 99).awarded).toBe(0);
    const reward = claimResearchTickets(collection, 250); expect(reward.awarded).toBe(2);
    collection = drawEquipment(reward.collection, 10, () => 0)!.collection;
    expect(collection.tickets).toBe(2);
    collection = normalizeCollection(collection);
    expect(claimResearchTickets(collection, 250).awarded).toBe(0);
    expect(claimResearchTickets(collection, 300).collection.tickets).toBe(3);
    expect(claimResearchTickets(collection, 100).awarded).toBe(0);
  });
});
