import type { SpeciesDef, MapDef } from '../../data/schemas';
import type { SpeciesProgress } from '../../core/Save';
import { spawnsOnMap } from '../../creatures/Spawner';

export const TAXA = [
  { id: 'fish', ja: '魚類' },
  { id: 'crustacean', ja: '甲殻類' },
  { id: 'mollusc', ja: '貝・軟体動物' },
  { id: 'bird', ja: '鳥類' },
  { id: 'worm', ja: '環形動物' },
  { id: 'other', ja: 'その他' },
] as const;

export type CatalogFilters = { query: string; taxon: string; map: string; status: string };
export const EMPTY_FILTERS: CatalogFilters = { query: '', taxon: '', map: '', status: '' };
export const isKnown = (p?: SpeciesProgress) => !!(p?.discovered || p?.captured);
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ja').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');

/** The same map restrictions as spawning, including environment-only maps. Not a guarantee of an encounter. */
export function livesOnMap(sp: SpeciesDef, map: MapDef): boolean {
  return map.animals && spawnsOnMap(sp, map.id);
}

export function filterCatalog(species: SpeciesDef[], progress: Record<string, SpeciesProgress>, maps: Map<string, MapDef>, filters: CatalogFilters): SpeciesDef[] {
  const query = normalize(filters.query);
  return species.filter(sp => {
    const p = progress[sp.id], known = isKnown(p);
    if (filters.taxon && sp.taxon.group !== filters.taxon) return false;
    if (filters.map) {
      const map = maps.get(filters.map);
      if (!map || !livesOnMap(sp, map)) return false;
    }
    if (filters.status === 'known' && !known) return false;
    if (filters.status === 'unknown' && known) return false;
    if (filters.status === 'captured' && !p?.captured) return false;
    // Undiscovered entries reveal only their Japanese name, even through search.
    return !query || normalize(known ? `${sp.names.ja} ${sp.names.sci} ${sp.names.en ?? ''}` : sp.names.ja).includes(query);
  });
}
