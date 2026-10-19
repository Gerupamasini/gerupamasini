import type { SpeciesDef } from '../../data/schemas';

export const SEASONS = [{ id: 'spring', ja: '春' }, { id: 'summer', ja: '夏' }, { id: 'autumn', ja: '秋' }, { id: 'winter', ja: '冬' }] as const;
export const TIMES = [{ id: 'dawn', ja: '明け方' }, { id: 'day', ja: '昼' }, { id: 'dusk', ja: '夕方' }, { id: 'night', ja: '夜' }] as const;
export const TIDES = { any: '指定なし', low: '干潮付近', rising: '上げ潮', high: '満潮付近', falling: '下げ潮' };

/** Keep seasonal/time/tide combinations together. Unioning each axis invents encounters that cannot occur. */
export function encounterConditions(species: SpeciesDef, mapId: string) {
  if (!mapId) return [];
  const rules = species.spawn.filter(rule => !rule.maps || rule.maps.includes(mapId)).map(rule => {
    const seasons = SEASONS.filter(season => !rule.season || rule.season.includes(season.id)).map(season => season.id);
    const times = TIMES.filter(time => !rule.time || rule.time.includes(time.id)).map(time => time.id);
    return { key: `${seasons.join(',')}/${times.join(',')}/${rule.tide}`, seasons, times, tide: rule.tide };
  });
  return [...new Map(rules.map(rule => [rule.key, rule])).values()];
}
