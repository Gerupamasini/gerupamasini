import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, normalizeSettings, QUALITY_PRESETS, savedQualityHint, saveSettings } from '../../src/core/Settings';
import { claimResearchTickets, drawEquipment, emptyEquipmentCollection, normalizeCollection } from '../../src/aquarium/catalog';

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('idb-keyval', () => storage);
beforeEach(() => {
  storage.get.mockReset(); storage.set.mockReset(); storage.set.mockResolvedValue(undefined);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('independent scene quality', () => {
  it('uses GPU suggestions only for a first run and migrates minimum without losing a saved high-quality field', async () => {
    storage.get.mockResolvedValue(undefined);
    const fresh = await loadSettings({}, () => ({ quality: 'low' }));
    expect([fresh.homeQuality, fresh.fieldQuality]).toEqual(['low', 'low']);
    storage.get.mockResolvedValue({ quality: 'high', homeQuality: 'minimum', fieldQuality: 'high' });
    const suggest = vi.fn(() => ({ quality: 'low' as const }));
    const saved = await loadSettings({}, suggest);
    expect([saved.homeQuality, saved.fieldQuality]).toEqual(['minimal', 'high']);
    expect(suggest).not.toHaveBeenCalled();
    await saveSettings(saved);
    expect(storage.set).toHaveBeenCalledWith('settings', saved);
    expect(savedQualityHint()).toBe('minimal');
  });
  it('keeps the shared canvas without MSAA when either scene is light and migrates an old startup hint', async () => {
    localStorage.setItem('higata.quality', 'minimum');
    expect(savedQualityHint()).toBe('minimal');
    await saveSettings(normalizeSettings({ homeQuality: 'high', fieldQuality: 'low' }));
    expect(QUALITY_PRESETS[savedQualityHint()].msaa).toBe(0);
    await saveSettings(normalizeSettings({ homeQuality: 'high', fieldQuality: 'mid' }));
    expect(QUALITY_PRESETS[savedQualityHint()].msaa).toBe(4);
  });
  it('migrates a legacy setting to both scenes without overwriting independent choices', () => {
    const old = normalizeSettings({ quality: 'low', mouseSensitivity: 4 });
    expect(old.homeQuality).toBe('low'); expect(old.fieldQuality).toBe('low');
    const split = normalizeSettings({ ...old, homeQuality: 'minimum', fieldQuality: 'high' });
    expect(split.homeQuality).toBe('minimal'); expect(split.fieldQuality).toBe('high');
    expect(split.mouseSensitivity).toBe(4);
    expect(normalizeSettings(undefined, { quality: 'low' }).homeQuality).toBe('low');
  });
  it('repairs corrupt settings and bounds finite numeric values before rendering', () => {
    const s = normalizeSettings({ homeQuality: 'broken', fieldQuality: 'minimum', mouseSensitivity: 'abc', eyeHeight: Infinity, sunglasses: 0 });
    expect(s.homeQuality).toBe('mid'); expect(s.fieldQuality).toBe('minimal');
    expect(s.mouseSensitivity).toBe(1); expect(s.eyeHeight).toBe(1.5); expect(s.sunglasses).toBe(true);
    expect(normalizeSettings({ mouseSensitivity: 100 }).mouseSensitivity).toBe(10);
    expect(QUALITY_PRESETS.minimal.hero).toBe(false);
    expect(QUALITY_PRESETS.minimal.tankWater).toBe('lite');
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
