import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MapSchema, SpeciesSchema } from '../../src/data/schemas';
import type { SpeciesProgress } from '../../src/core/Save';
import { EMPTY_FILTERS, filterCatalog, livesOnMap } from '../../src/ui/zukan/catalog';

const json = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${path}`, import.meta.url)), 'utf8'));
const manifest = json('manifest.json') as { species: string[]; maps: string[] };
const species = manifest.species.map(id => SpeciesSchema.parse(json(`species/${id}.json`)));
const maps = new Map(manifest.maps.map(id => [id, MapSchema.parse(json(`maps/${id}.json`))]));
const progress: Record<string, SpeciesProgress> = {
  acanthogobius_flavimanus: { discovered: 1, behaviors: {}, individuals: [], nextNumber: 1 },
  palaemon_pacificus: { captured: 2, behaviors: {}, individuals: [], nextNumber: 1 },
};
const find = (patch = {}) => filterCatalog(species, progress, maps, { ...EMPTY_FILTERS, ...patch }).map(s => s.id);

describe('field guide catalog', () => {
  it('combines map, classification, discovery and name filters', () => {
    expect(find({ map: 'hashirimizu', taxon: 'crustacean', status: 'captured', query: 'イソスジ' })).toEqual(['palaemon_pacificus']);
    expect(find({ map: 'kasai_west', taxon: 'crustacean', status: 'captured' })).toEqual([]);
  });
  it('matches hiragana, half-width kana and case-insensitive scientific names for known species', () => {
    expect(find({ query: ' まはぜ ' })).toEqual(['acanthogobius_flavimanus']);
    expect(find({ query: 'ﾏﾊｾﾞ' })).toEqual(['acanthogobius_flavimanus']);
    expect(find({ query: 'ACANTHOGOBIUS' })).toEqual(['acanthogobius_flavimanus']);
  });
  it('lets undiscovered species be found by name without exposing scientific names through search', () => {
    expect(find({ query: 'シロチドリ', status: 'unknown' })).toEqual(['charadrius_alexandrinus']);
    expect(find({ query: 'Charadrius' })).toEqual([]);
    expect(find({ status: 'known' })).toEqual(['acanthogobius_flavimanus', 'palaemon_pacificus']);
    expect(find({ status: 'unknown' })).not.toContain('palaemon_pacificus');
  });
  it('does not list world-managed oysters on the shore without a reef', () => {
    expect(find({ map: 'kasai_west', query: 'マガキ' })).toEqual(['crassostrea_gigas']);
    expect(find({ map: 'hashirimizu', query: 'マガキ' })).toEqual([]);
  });
  it('respects environment-only maps even for species with unrestricted spawn rules', () => {
    const clam = species.find(s => s.id === 'ruditapes_philippinarum')!;
    expect(livesOnMap(clam, maps.get('hashirimizu')!)).toBe(true);
    expect(livesOnMap(clam, maps.get('manko')!)).toBe(false);
    expect(find({ map: 'manko' })).toEqual([]);
    expect(find({ map: 'missing-map' })).toEqual([]);
  });
});
