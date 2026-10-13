import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { FILTER_KINDS, FILTER_SPECS, FILTER_MAX_LEVEL, TANK_ANIMAL_LIMIT, TANK_UNLOCK_COST, TANK_SIZES, TANK_DIMENSIONS, EQUIPMENT_LABELS, tankUnlocked, filterCapacity, type FilterKind, type TankSize } from '../../aquarium';
import { EquipmentSwatch } from '../common/EquipmentSwatch';
import { QuestList } from './QuestList';

export function ShopEquipment({ app, tab }: { app: App; tab: 'tanks' | 'filters' | 'quests' }) {
  const [size, setSize] = useState<TankSize>(45), [filter, setFilter] = useState<FilterKind>('filter');
  const p = app.aquariumProgression, cr = app.encyclopedia.money.value;
  if (tab === 'quests') return <section class="glass shop-catalog" aria-label="導入クエスト"><QuestList app={app} /></section>;
  if (tab === 'tanks') {
    const unlocked = tankUnlocked(p, size), d = TANK_DIMENSIONS[size], cost = TANK_UNLOCK_COST[size];
    return <section class="glass shop-catalog" aria-label="水槽の解放">
      <nav class="shop-catalog-options" aria-label="水槽サイズ">{TANK_SIZES.map(s => <button class={`btn ${s === size ? 'on' : ''}`} aria-pressed={s === size} key={s} onClick={() => setSize(s)}>{s}cm<small>{tankUnlocked(p, s) ? '解放済み' : `${TANK_UNLOCK_COST[s]} CR`}</small></button>)}</nav>
      <article class="shop-equipment-detail"><div class="shop-equipment-name"><EquipmentSwatch category="tank" style="classic" /><h2>{size}cm水槽＋標準台</h2></div>
        <p class="small dim">幅{size} × 奥行{d.depth * 100} × 高さ{d.height * 100}cm。解放後は水槽編集・部屋への追加で選べます。</p>
        <p class="shop-capacity">水槽の飼育上限 <strong>{TANK_ANIMAL_LIMIT[size]}匹</strong><small>実際の上限は装備するろ過装置で決まります。</small></p>
        <div class="buy-row"><span class="price num">{unlocked ? '解放済み' : `${cost} CR`}</span><button class="btn primary sm" disabled={unlocked || cr < cost} onClick={() => app.buyTankSize(size)}>{unlocked ? '解放済み' : '水槽を解放'}</button></div>
      </article><p class="small dim shop-catalog-note">解放は何台でも利用可能。設置枠はLv.5で2台、Lv.10で3台。</p>
    </section>;
  }
  const lv = p.filters[filter], spec = FILTER_SPECS[filter], cost = lv ? spec.upgrades[lv - 1] : spec.unlock;
  return <section class="glass shop-catalog" aria-label="フィルターの解放と強化">
    <nav class="shop-catalog-options" aria-label="フィルター種類">{FILTER_KINDS.map(k => <button class={`btn ${k === filter ? 'on' : ''}`} aria-pressed={k === filter} key={k} onClick={() => setFilter(k)}><EquipmentSwatch category={k} style="classic" /><span>{EQUIPMENT_LABELS[k].replace('フィルター', '')}<small>{p.filters[k] ? `Lv.${p.filters[k]}` : `${FILTER_SPECS[k].unlock} CR`}</small></span></button>)}</nav>
    <article class="shop-equipment-detail"><div class="shop-equipment-name"><h2>{EQUIPMENT_LABELS[filter]}</h2><span>{lv ? `Lv.${lv}/${FILTER_MAX_LEVEL}` : '未解放'}</span></div>
      <p class="shop-capacity">ろ過装置の飼育上限 <strong>{lv ? filterCapacity(p, filter) : spec.capacities[0]}匹</strong>{lv > 0 && lv < FILTER_MAX_LEVEL && <span> → 強化後 <strong>{spec.capacities[lv]}匹</strong></span>}</p>
      <div class="shop-filter-levels" aria-label="レベルごとの飼育上限">{spec.capacities.map((n, i) => <span class={i + 1 === lv ? 'on' : ''} key={i}>Lv.{i + 1}<b>{n}匹</b></span>)}</div>
      <div class="buy-row"><span class="price num">{lv === FILTER_MAX_LEVEL ? '最大レベル' : `${cost} CR`}</span><button class="btn primary sm" disabled={lv === FILTER_MAX_LEVEL || cr < cost} onClick={() => app.buyFilterLevel(filter)}>{!lv ? 'フィルターを解放' : lv === FILTER_MAX_LEVEL ? '強化完了' : `Lv.${lv + 1}へ強化`}</button></div>
    </article><p class="small dim shop-catalog-note">強化は同じ種類の全水槽に適用。各水槽のろ過装置は1種類まで。飼育上限は水槽の上限内です。</p>
  </section>;
}
