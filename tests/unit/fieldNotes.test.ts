import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapSchema, SpeciesSchema } from '../../src/data/schemas';
import type { GameData } from '../../src/data/loader';
import { Encyclopedia } from '../../src/systems/Encyclopedia';
import { emptySave, parseSave } from '../../src/core/Save';
import { generateIndividual } from '../../src/creatures/Individual';
import { encounterConditions } from '../../src/ui/zukan/conditions';
import { EMPTY_FILTERS, filterCatalog } from '../../src/ui/zukan/catalog';
import { jstToMs } from '../../src/core/Time';
import { recordDate } from '../../src/ui/zukan/FieldNotes';

const json = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${path}`, import.meta.url)), 'utf8'));
const manifest = json('manifest.json') as { species: string[]; maps: string[] };
const species = manifest.species.map(id => SpeciesSchema.parse(json(`species/${id}.json`)));
const maps = new Map(manifest.maps.map(id => [id, MapSchema.parse(json(`maps/${id}.json`))]));
const data = { species: new Map(species.map(s => [s.id, s])), maps } as GameData;
const goby = data.species.get('acanthogobius_flavimanus')!;
const animal = (seed = 123) => { const ind = generateIndividual(goby, seed, 1, 2, 0, 0, 100); ind.sex = 'unknown'; return ind; };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('saved bookmarks and field encounter records', () => {
  it('bookmarks an undiscovered name without discovery, research or catches, and survives save/import', () => {
    const enc = new Encyclopedia(data), changed = vi.fn(); enc.onChanged = changed;
    expect(enc.toggleBookmark(goby.id)).toBe(true);
    expect(enc.progress.value[goby.id].discovered).toBeUndefined();
    expect(enc.research.value).toBe(0); expect(enc.stats.captures).toBe(0);
    const save = emptySave('kasai_west', 1); enc.writeSave(save);
    const restored = new Encyclopedia(data); restored.applySave(parseSave(save));
    expect(restored.progress.value[goby.id].bookmarked).toBe(true);
    expect(restored.toggleBookmark(goby.id)).toBe(false);
    expect(enc.toggleBookmark('missing_species')).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('records repeat observations and catches per flat without repeating discovery rewards', () => {
    const enc = new Encyclopedia(data), ind = animal();
    enc.onObserved(ind, 100, 'kasai_west');
    const first = enc.progress.value;
    const research = enc.research.value;
    enc.onObserved(ind, 200, 'kasai_west');
    enc.onObserved(ind, 300, 'hashirimizu');
    expect(enc.research.value).toBe(research);
    const caught = enc.onCaptured(ind, 400, 0.3, 'hashirimizu');
    expect(caught?.caughtMap).toBe('hashirimizu');
    expect(enc.progress.value[goby.id].encounters).toEqual({
      kasai_west: { firstSeen: 100, lastSeen: 200, observations: 2, captures: 0 },
      hashirimizu: { firstSeen: 300, lastSeen: 400, observations: 1, captures: 1 },
    });
    expect(first[goby.id].encounters?.kasai_west.observations).toBe(1);
    const save = emptySave('kasai_west', 1); enc.writeSave(save);
    const restored = new Encyclopedia(data); restored.applySave(parseSave(save));
    expect(restored.progress.value).toEqual(enc.progress.value);
    expect(restored.caseItems.value[0].caughtMap).toBe('hashirimizu');
  });
  it('does not invent places for old records, unknown maps, home behavior or unsuccessful catches', () => {
    const enc = new Encyclopedia(data), ind = animal();
    enc.onObserved(ind, 100);
    enc.onObserved(ind, 200, 'manko');
    enc.onObserved(ind, 300, 'missing-map');
    enc.onBehavior(goby.id, goby.encyclopedia.behaviors[0].id, 400);
    expect(enc.progress.value[goby.id].encounters).toBeUndefined();
    for (let i = 0; i < enc.caseMax; i++) enc.onCaptured(animal(100 + i), 500, 0.2);
    expect(enc.onCaptured(animal(200), 600, 0.2, 'hashirimizu')).toBeNull();
    expect(enc.progress.value[goby.id].encounters).toBeUndefined();
    const parsed = parseSave({ ...emptySave('kasai_west', 1), encyclopedia: enc.progress.value });
    expect(parsed.encyclopedia[goby.id].encounters).toBeUndefined();
    expect(parsed.encyclopedia[goby.id].individuals[0].caughtMap).toBeUndefined();
  });
  it('keeps action order and the selected game date when a tide ticket moves time backwards', () => {
    const enc = new Encyclopedia(data);
    enc.onObserved(animal(), 2000, 'kasai_west');
    enc.onObserved(animal(), 1000, 'kasai_west');
    const save = emptySave('kasai_west', 1); enc.writeSave(save);
    expect(parseSave(save).encyclopedia[goby.id].encounters?.kasai_west).toEqual({ firstSeen: 2000, lastSeen: 1000, observations: 2, captures: 0 });
  });
  it('rejects corrupt new fields and retains a legacy save without guessed locations', () => {
    const enc = new Encyclopedia(data); enc.onObserved(animal(), 100, 'kasai_west');
    const save = emptySave('kasai_west', 1); enc.writeSave(save);
    expect(() => parseSave({ ...save, encyclopedia: { [goby.id]: { ...save.encyclopedia[goby.id], bookmarked: 'yes' } } })).toThrow();
    save.encyclopedia[goby.id].encounters!.kasai_west.observations = -1;
    expect(() => parseSave(save)).toThrow();
    expect(parseSave(emptySave('kasai_west', 1)).encyclopedia).toEqual({});
  });
  it('filters encounters using recorded places rather than global discovery or predicted habitat', () => {
    const enc = new Encyclopedia(data); enc.onObserved(animal(), 100, 'kasai_west');
    enc.toggleBookmark('charadrius_alexandrinus');
    const filter = (map: string) => filterCatalog(species, enc.progress.value, maps, { ...EMPTY_FILTERS, map, mapMode: 'encounters' }).map(s => s.id);
    expect(filter('kasai_west')).toEqual([goby.id]); expect(filter('hashirimizu')).toEqual([]);
    expect(filterCatalog(species, enc.progress.value, maps, { ...EMPTY_FILTERS, status: 'behaviors' }).map(s => s.id)).toEqual([goby.id]);
    for (const behavior of goby.encyclopedia.behaviors) enc.onBehavior(goby.id, behavior.id, 200);
    expect(filterCatalog(species, enc.progress.value, maps, { ...EMPTY_FILTERS, status: 'behaviors' })).toEqual([]);
  });
});

describe('conditions from spawn rules', () => {
  it('keeps map-specific seasons instead of borrowing another flat’s winter rules', () => {
    expect(encounterConditions(goby, 'hashirimizu').every(rule => !rule.seasons.includes('winter'))).toBe(true);
    expect(encounterConditions(goby, 'kasai_west').some(rule => rule.seasons.includes('winter'))).toBe(true);
    expect(encounterConditions(goby, '')).toEqual([]);
  });
  it('keeps disjoint season/time/tide combinations and deduplicates equivalent rules', () => {
    const first = { ...goby.spawn[0], maps: ['kasai_west'], season: ['spring' as const], time: ['day' as const], tide: 'low' as const };
    const second = { ...first, season: ['winter' as const], time: ['night' as const], tide: 'high' as const };
    const rules = encounterConditions({ ...goby, spawn: [first, second, first] }, 'kasai_west');
    expect(rules.map(({ seasons, times, tide }) => ({ seasons, times, tide }))).toEqual([
      { seasons: ['spring'], times: ['day'], tide: 'low' }, { seasons: ['winter'], times: ['night'], tide: 'high' },
    ]);
    expect(encounterConditions({ ...goby, spawn: [first] }, 'hashirimizu')).toEqual([]);
  });
  it('shows the year and Japan time for past or future ticket dates', () => {
    expect(recordDate(jstToMs(2030, 7, 12, 5, 30))).toBe('2030/7/12 05:30');
    expect(recordDate(NaN)).toBe('日時不明');
  });
});
