import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { CATEGORY_LABELS, EQUIPMENT_CATEGORIES, GACHA_COST, GACHA_POOL, equipmentItem, gachaProbability, ownedQuantity, type EquipmentCategory } from '../../aquarium';
import { ui } from '../store';
import { EquipmentSwatch } from '../common/EquipmentSwatch';
import { CapsuleIcon, Key } from '../common/Icons';

export function GachaScreen({ app }: { app: App }) {
  const collection = app.equipmentCollection.value, money = app.encyclopedia.money.value, busy = app.gachaBusy.value, results = ui.gachaResults.value;
  const [category, setCategory] = useState<EquipmentCategory | 'all'>('all'), [showPool, setShowPool] = useState(false);
  const owned = GACHA_POOL.filter((item) => ownedQuantity(collection, item.id) > 0).length;
  return <div class="gacha-screen"><div class="gacha-panel glass">
    <div class="gacha-head"><div><span class="eyebrow">AQUARIUM COLLECTION</span><h2>水槽設備ガチャ</h2></div><button class="btn ghost sm" disabled={busy} onClick={() => app.closeGacha()}>戻る <Key k="Esc" /></button></div>
    <div class="gacha-body">
      <div class="gacha-intro"><span class={`gacha-capsule ${busy ? 'rolling' : ''}`} aria-hidden="true"><CapsuleIcon /></span><div><h3>水槽に、新しいデザインを。</h3><p>ライトやエアストーン、水槽台などのインテリアが出ます。獲得したアイテムは「水槽 → 設備」で選べます。</p><p class="small dim">初期設備はいつでも使用できます。同じアイテムが出た場合は所持数が増え、複数置ける設備に使えます。</p></div></div>
      <div class="gacha-wallet"><span>所持CR <strong class="num">{money.toLocaleString()}</strong></span><span>コレクション <b class="num">{owned} / {GACHA_POOL.length}</b></span></div>
      <div class="gacha-draw"><button class="btn primary" disabled={busy || money < GACHA_COST} onClick={() => void app.rollGacha(1)}>1回引く <span class="num">{GACHA_COST} CR</span></button><button class="btn" disabled={busy || money < GACHA_COST * 10} onClick={() => void app.rollGacha(10)}>10回引く <span class="num">{GACHA_COST * 10} CR</span></button></div>
      {money < GACHA_COST && <p class="small dim">CRは生物の発見・観察などで研究レベルを上げると獲得できます。</p>}
      {results.length > 0 && <div class="gacha-results" aria-live="polite"><h3>獲得したアイテム</h3><div class="gacha-grid">{results.map((result, i) => {
        const item = equipmentItem(result.itemId)!;
        return <article class={`gacha-result rarity-${item.rarity}`} key={`${result.itemId}-${i}`}><EquipmentSwatch style={item.style} category={item.category} large /><div><span class={`equipment-rarity rarity-${item.rarity}`}>{item.rarity}</span>{result.isNew && <span class="gacha-new">NEW</span>}<small>{CATEGORY_LABELS[item.category]}</small><h4>{item.name}</h4><p class="small dim">{result.isNew ? 'コレクションに追加しました' : `所持数 ${result.quantity}個`}</p><button disabled={busy} onClick={() => app.showGachaEquipment(item.id)}>設備を選ぶ</button></div></article>;
      })}</div></div>}
      <button class="gacha-pool-toggle" aria-expanded={showPool} onClick={() => setShowPool(!showPool)}>排出アイテム・確率を見る {showPool ? '−' : '＋'}</button>
      {showPool && <Fragment><p class="small dim">N：80% · R：20%　各回は独立した抽選です。</p><label class="gacha-filter">種類<select aria-label="ガチャの設備種類" value={category} onChange={(e) => setCategory(e.currentTarget.value as EquipmentCategory | 'all')}><option value="all">すべて</option>{EQUIPMENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label><ul class="gacha-pool">{GACHA_POOL.filter((item) => category === 'all' || item.category === category).map((item) => <li key={item.id}><EquipmentSwatch style={item.style} category={item.category} /><span><strong>{item.name}</strong><small>{item.rarity} · {(gachaProbability(item.id) * 100).toFixed(2)}% · {ownedQuantity(collection, item.id) ? `所持 ${ownedQuantity(collection, item.id)}個` : '未所持'}</small></span></li>)}</ul></Fragment>}
    </div>
  </div></div>;
}
