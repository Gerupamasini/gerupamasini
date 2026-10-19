import { useState } from 'preact/hooks';
import type { MapDef, SpeciesDef } from '../../data/schemas';
import type { SpeciesProgress } from '../../core/Save';
import { jstParts } from '../../core/Time';
import { encounterConditions, SEASONS, TIMES, TIDES } from './conditions';
import { livesOnMap } from './catalog';

export function BookmarkIcon() {
  return <svg width="17" height="22" viewBox="0 0 18 24" fill="none" aria-hidden="true"><path d="M3 2h12v20l-6-4-6 4V2Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.5" /><path d="M6 6h6" stroke="currentColor" stroke-width="1.2" /></svg>;
}

export function EncounterConditions({ species, maps, selectedMap }: { species: SpeciesDef; maps: Map<string, MapDef>; selectedMap: string }) {
  const places = [...maps.values()].filter(map => livesOnMap(species, map));
  const [choice, setChoice] = useState(selectedMap);
  const mapId = places.some(map => map.id === choice) ? choice : places[0]?.id ?? '';
  const rules = encounterConditions(species, mapId);
  return <details class="encounter-conditions">
    <summary>出会いやすい条件 <span>季節・時間・潮の目安</span></summary>
    {places.length > 1 && <label class="conditions-map">干潟<select aria-label="条件を確認する干潟" value={mapId} onChange={e => setChoice(e.currentTarget.value)}>{places.map(map => <option key={map.id} value={map.id}>{map.names.ja}</option>)}</select></label>}
    {places.length === 1 && <p class="small dim">{places[0].names.ja}</p>}
    {rules.map(rule => <div class="encounter-rule" key={rule.key}>
      <div class="condition-seasons" role="group" aria-label={`出現する季節: ${SEASONS.filter(season => rule.seasons.includes(season.id)).map(season => season.ja).join('・')}`}>{SEASONS.map(season => <span aria-hidden="true" class={rule.seasons.includes(season.id) ? 'on' : ''} key={season.id}>{season.ja}</span>)}</div>
      <dl><div><dt>時間</dt><dd>{rule.times.length === TIMES.length ? '終日' : TIMES.filter(time => rule.times.includes(time.id)).map(time => time.ja).join('・')}</dd></div><div><dt>潮</dt><dd>{TIDES[rule.tide]}</dd></div></dl>
    </div>)}
    {!rules.length && <p class="small dim">この干潟に出現設定はありません。</p>}
    <small>ゲーム内の出現設定に基づく目安です。場所・水深によって条件が異なり、出現を保証するものではありません。</small>
  </details>;
}

export function recordDate(ms: number): string {
  if (!Number.isFinite(new Date(ms).getTime())) return '日時不明';
  const p = jstParts(ms);
  return `${p.year}/${p.month}/${p.day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function EncounterHistory({ progress, maps }: { progress: SpeciesProgress; maps: Map<string, MapDef> }) {
  const records = Object.entries(progress.encounters ?? {});
  const first = progress.discovered ?? progress.captured;
  const firstPlaceUnknown = first !== undefined && !records.some(([, record]) => record.firstSeen === first);
  const unplacedCatches = progress.individuals.filter(record => !record.caughtMap).length;
  return <section class="encounter-history" aria-label="干潟別の観察履歴">
    <h4>干潟別の観察履歴</h4>
    {first !== undefined && <p class="history-first">図鑑への初登録 <time>{recordDate(first)}</time></p>}
    {records.map(([mapId, record]) => <article class="history-place" key={mapId}>
      <header><h5>{maps.get(mapId)?.names.ja ?? '不明な干潟'}</h5><span>観察 <b class="num">{record.observations}</b>回 · 採集 <b class="num">{record.captures}</b>回</span></header>
      <dl><div><dt>最初の記録</dt><dd>{recordDate(record.firstSeen)}</dd></div><div><dt>最後の記録</dt><dd>{recordDate(record.lastSeen)}</dd></div></dl>
    </article>)}
    {!records.length && <p class="history-legacy">以前の記録：干潟不明<br />次に干潟で観察・採集すると、場所と日時がここに記録されます。</p>}
    {!!records.length && (firstPlaceUnknown || unplacedCatches > 0) && <p class="history-legacy">以前の記録：{firstPlaceUnknown && '初登録の干潟は不明です。'}{unplacedCatches > 0 && `採集 ${unplacedCatches} 件は干潟不明のまま残しています。`}</p>}
    <p class="small dim">日時はゲーム内の日本時間です。潮時チケットで日付を変えた記録も、その日付で残ります。</p>
  </section>;
}
