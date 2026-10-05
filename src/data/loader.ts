import type { ZodType } from 'zod';
import {
  BehaviorTreeSchema, ManifestSchema, MapSchema, SpeciesSchema, SpotsFileSchema, StringsSchema, TideStationSchema, ToolsFileSchema,
  type BehaviorTreeDef, type Manifest, type MapDef, type SpeciesDef, type SpotDef, type TideStationDef, type ToolDef,
} from './schemas';

export interface GameData {
  manifest: Manifest;
  species: Map<string, SpeciesDef>;
  behaviors: Map<string, BehaviorTreeDef>;
  maps: Map<string, MapDef>;
  stations: Map<string, TideStationDef>;
  tools: Map<string, ToolDef>;
  strings: Record<string, string>;
  /** the places to go, in the order they are listed */
  spots: SpotDef[];
}

export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(DATA_BASE + path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`データを読み込めません: ${path} (${res.status})`);
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(parsed.error);
    throw new Error(`データ形式が不正です: ${path}`);
  }
  return parsed.data;
}

export async function loadGameData(onProgress?: (frac: number, label: string) => void): Promise<GameData> {
  onProgress?.(0, 'データ一覧');
  const manifest = await fetchJson('manifest.json', ManifestSchema);
  const total = manifest.species.length + manifest.behaviors.length + manifest.maps.length + manifest.stations.length + 2;
  let done = 0;
  const tick = (label: string) => onProgress?.(++done / total, label);
  const all = async <T>(ids: string[], dir: string, schema: ZodType<T>): Promise<Map<string, T>> => {
    const entries = await Promise.all(ids.map(async (id) => {
      const v = await fetchJson(`${dir}/${id}.json`, schema);
      tick(id);
      return [id, v] as const;
    }));
    return new Map(entries);
  };
  const [species, behaviors, maps, stations, toolsFile, strings, spotsFile] = await Promise.all([
    all(manifest.species, 'species', SpeciesSchema),
    all(manifest.behaviors, 'behaviors', BehaviorTreeSchema),
    all(manifest.maps, 'maps', MapSchema),
    all(manifest.stations, 'tide/stations', TideStationSchema),
    fetchJson(manifest.items, ToolsFileSchema).then((v) => { tick('items'); return v; }),
    fetchJson(manifest.strings, StringsSchema).then((v) => { tick('strings'); return v; }),
    manifest.spots ? fetchJson(manifest.spots, SpotsFileSchema).then((v) => { tick('spots'); return v; }) : Promise.resolve(null),
  ]);
  const tools = new Map(toolsFile.tools.map((t) => [t.id, t] as const));
  // cross references
  for (const sp of species.values()) {
    if (!behaviors.has(sp.brain.tree)) throw new Error(`${sp.id}: 行動ツリー ${sp.brain.tree} がありません`);
    for (const t of sp.capture.tools) if (!tools.has(t)) throw new Error(`${sp.id}: 道具 ${t} がありません`);
  }
  for (const m of maps.values()) if (!stations.has(m.station)) throw new Error(`${m.id}: 観測点 ${m.station} がありません`);
  // the places: from the file, or one per map
  const spots: SpotDef[] = spotsFile ? spotsFile.spots : [...maps.values()].map((m) => ({ id: m.id, ja: m.names.ja, en: m.names.en, area: '東京湾', lat: m.origin.lat, lon: m.origin.lon, map: m.id, description: '' }));
  for (const s of spots) if (s.map && !maps.has(s.map)) throw new Error(`${s.id}: 地図 ${s.map} がありません`);
  return { manifest, species, behaviors, maps, stations, tools, strings, spots };
}
