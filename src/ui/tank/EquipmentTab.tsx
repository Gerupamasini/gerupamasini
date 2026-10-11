import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { CATEGORY_LABELS, EQUIPMENT_CATEGORIES, EQUIPMENT_MAX, TANK_SIZES, categoryLimit, equipmentItem, itemForCategory, itemsForCategory, ownedQuantity, tankSizeItemId, type TankSize, type EquipmentCategory, type Vec3 } from '../../aquarium';
import { ui } from '../store';
import { EquipmentSwatch } from '../common/EquipmentSwatch';

const MOBILE_GROUPS: { label: string; categories: EquipmentCategory[] }[] = [
  { label: '水槽・台・蓋', categories: ['tank', 'stand', 'glassLid'] },
  { label: '照明', categories: ['lightFixture', 'ledLight'] },
  { label: 'フィルター', categories: ['filter', 'canisterFilter', 'topFilter', 'spongeFilter'] },
  { label: 'エア用品', categories: ['airPump', 'airStone'] },
  { label: '水温', categories: ['heater', 'thermometer', 'thermostat', 'chiller'] },
  { label: '水流', categories: ['flowPump', 'circulationPump'] },
  { label: '電源', categories: ['powerStrip'] },
];

/** Interiors are selected from the collection; their bundled wiring is managed by the preset. */
export function EquipmentTab({ app }: { app: App }) {
  void ui.tankLayoutVersion.value;
  const [group, setGroup] = useState(0);
  const layout = app.tank.equipment.currentLayout, selected = ui.equipmentSelected.value;
  if (selected) return <EquipmentDetail key={selected} app={app} selected={selected} />;
  const categories = app.input.touchDevice ? MOBILE_GROUPS[group].categories : EQUIPMENT_CATEGORIES;
  return <Fragment>
    {!app.input.touchDevice && <p class="small dim">設備を選んで、デザインや設置位置を変えられます。初期アイテムはいつでも使用できます。</p>}
    <div class="equipment-view">
      {app.input.touchDevice && <select aria-label="設備の種類" value={group} onChange={(e) => setGroup(Number(e.currentTarget.value))}>{MOBILE_GROUPS.map((g, i) => <option value={i} key={g.label}>{g.label}</option>)}</select>}
      <button onClick={() => app.tank.resetView()}>正面</button><button onClick={() => app.tank.focusEquipmentRear()}>背面</button>
    </div>
    <div class="equipment-slots">{categories.map((category) => {
      const devices = layout.devices.filter((d) => d.kind === category), fixed = category === 'tank' || category === 'stand';
      const item = fixed ? itemForCategory(category === 'tank' ? layout.tankItemId : layout.standItemId, category) : devices[0] ? itemForCategory(devices[0].itemId, category) : undefined;
      return <button key={category} class="btn equipment-slot" data-category={category} onClick={() => { ui.equipmentPreview.value = null; ui.equipmentSelected.value = fixed ? category : devices[0]?.id ?? `category:${category}`; }}>
        <EquipmentSwatch style={item?.style ?? 'classic'} category={category} /><span><small>{CATEGORY_LABELS[category]}{devices.length > 1 ? ` · ${devices.length}個` : ''}</small><strong>{fixed ? item!.name : devices.length ? devices.map((d) => itemForCategory(d.itemId, category).name).join(' / ') : '未設置'}</strong></span><span aria-hidden="true">›</span>
      </button>;
    })}</div>
    {!app.input.touchDevice && <p class="small dim">ガチャで獲得したアイテムは、設備の詳細から入れ替えられます。</p>}<button onClick={() => app.openGacha()}>設備ガチャへ</button>
  </Fragment>;
}

function EquipmentDetail({ app, selected }: { app: App; selected: string }) {
  void ui.tankLayoutVersion.value;
  const layout = app.tank.equipment.currentLayout, record = layout.devices.find((d) => d.id === selected);
  const category = (selected === 'tank' || selected === 'stand' ? selected : record?.kind ?? selected.replace('category:', '')) as EquipmentCategory;
  if (!EQUIPMENT_CATEGORIES.includes(category)) return <button onClick={() => { ui.equipmentSelected.value = null; }}>設備一覧へ</button>;
  const fixed = category === 'tank' || category === 'stand';
  const current = fixed ? itemForCategory(category === 'tank' ? layout.tankItemId : layout.standItemId, category) : record ? itemForCategory(record.itemId, category) : undefined;
  const [previewId, setPreviewId] = useState(equipmentItem(ui.equipmentPreview.value ?? undefined)?.category === category ? ui.equipmentPreview.value! : current?.id ?? `${category}-initial`);
  const [tankSize, setTankSize] = useState<TankSize>(equipmentItem(previewId)?.size ?? app.currentRoomTank?.size ?? 60);
  const [tab, setTab] = useState<'position' | 'design'>(record ? 'position' : 'design');
  const preview = itemForCategory(previewId, category), collection = app.equipmentCollection.value;
  const quantity = ownedQuantity(collection, preview.id), owns = quantity > 0, replacing = fixed ? category : record?.id;
  const available = app.usedEquipmentQuantity(preview.id, replacing) < quantity, siblings = layout.devices.filter((d) => d.kind === category);
  const canAdd = !fixed && siblings.length < categoryLimit(category) && layout.devices.length < EQUIPMENT_MAX && app.usedEquipmentQuantity(preview.id) < quantity;
  const detail = <div class="equipment-item-detail"><EquipmentSwatch style={preview.style} category={category} large /><div><span class={`equipment-rarity rarity-${preview.rarity}`}>{preview.rarity === 'initial' ? '初期アイテム' : preview.rarity}</span><h3>{preview.name}</h3><p class="small dim">{preview.description}</p><p class="small">{preview.rarity === 'initial' ? 'いつでも使用できます' : owns ? `所持数 ${quantity}個` : 'ガチャで獲得できます'}</p></div></div>;
  return <Fragment>
    <div class="equipment-detail-head"><button class="btn equipment-back" onClick={() => { ui.equipmentSelected.value = null; }}>‹ 設備一覧</button><h4>{CATEGORY_LABELS[category]}{app.input.touchDevice && <small>現在：{current?.name ?? '未設置'}</small>}</h4></div>
    {!app.input.touchDevice && <p class="small equipment-current">現在：<strong>{current?.name ?? '未設置'}</strong></p>}
    {siblings.length > 1 && <div class="equipment-instances" aria-label="設置済みの設備">{siblings.map((d, i) => <button key={d.id} title={itemForCategory(d.itemId, category).name} aria-label={`設備${i + 1} ${itemForCategory(d.itemId, category).name}`} class={d.id === selected ? 'on' : ''} onClick={() => { ui.equipmentPreview.value = null; ui.equipmentSelected.value = d.id; }}>#{i + 1}</button>)}</div>}
    {app.input.touchDevice && record && <div class="seg equipment-tabs"><button class={tab === 'position' ? 'on' : ''} onClick={() => setTab('position')}>位置・向き</button><button class={tab === 'design' ? 'on' : ''} onClick={() => setTab('design')}>デザイン</button></div>}
    {record && (!app.input.touchDevice || tab === 'position') && <Fragment>{!app.input.touchDevice && <h4>設置位置</h4>}<div class="equipment-position">{(['X', '高さ', 'Z'] as const).map((axis, i) => <label key={axis}>{axis} (cm)<input aria-label={`設備の${axis} (cm)`} type="number" step="0.5" min={i === 1 ? -72 : -80} max="80" value={Number((record.position[i] * 100).toFixed(1))} onChange={(e) => {
      const value = e.currentTarget.valueAsNumber; if (!Number.isFinite(value)) return;
      const position = [...record.position] as Vec3; position[i] = value / 100; app.tankChangeEquipment(record.id, { position });
    }} /></label>)}</div><div class="equipment-actions"><button onClick={() => app.tankChangeEquipment(record.id, { rotation: record.rotation + Math.PI / 4 })}>45° 回転</button>
      {(category === 'ledLight' || category === 'lightFixture') && <button onClick={() => app.tankChangeEquipment(record.id, { enabled: !record.enabled })}>{record.enabled ? '消灯する' : '点灯する'}</button>}
      <button disabled={!app.tank.equipment.canRemoveDevice(record.id)} title="付属セットに必要な設備は、デザインや位置を変更できます" onClick={() => app.tankRemoveEquipment(record.id)}>{app.tank.equipment.canRemoveDevice(record.id) ? '取り外す' : '付属セット'}</button>
    </div></Fragment>}
    {(!app.input.touchDevice || tab === 'design') && <Fragment>
    {!app.input.touchDevice && detail}
    {category === 'tank' && <label class="equipment-add">水槽のサイズ<select aria-label="水槽のサイズ" disabled={app.roomBusy.value} value={tankSize} onChange={e => { const size = Number(e.currentTarget.value) as TankSize; setTankSize(size); const id = tankSizeItemId('tank', size); setPreviewId(id); ui.equipmentPreview.value = id; }}>{TANK_SIZES.map(size => <option key={size} value={size}>{size}cm</option>)}</select></label>}
    <div class="equipment-choices" aria-label="設備のアイテム候補">{itemsForCategory(category, category === 'tank' ? tankSize : category === 'stand' ? app.currentRoomTank?.size : undefined).map((item) => {
      const n = ownedQuantity(collection, item.id), active = item.id === preview.id;
      return <button key={item.id} class={`btn equipment-choice ${active ? 'on' : ''} ${n ? '' : 'locked'}`} aria-pressed={active} onClick={() => { setPreviewId(item.id); ui.equipmentPreview.value = item.id; }}><EquipmentSwatch style={item.style} category={category} /><span>{item.name}<small>{item.rarity === 'initial' ? '初期' : n ? `所持 ${n}個` : '未所持'}</small></span></button>;
    })}</div>
    <div class="equipment-actions"><button disabled={!owns || !available || current?.id === preview.id} onClick={() => app.tankInstallEquipment(preview.id, replacing)}>{current?.id === preview.id ? '使用中' : current ? '入れ替える' : '設置する'}</button>
      {categoryLimit(category) > 1 && record && <button disabled={!canAdd} onClick={() => app.tankInstallEquipment(preview.id)}>もう1個設置する</button>}
      {!owns && <button onClick={() => app.openGacha()}>設備ガチャへ</button>}
    </div>
    {owns && !available && current?.id !== preview.id && <p class="small dim">所持しているアイテムはすべて設置中です。</p>}

    {app.input.touchDevice ? <details class="equipment-spec"><summary>選択した設備の詳細・接続</summary>{detail}<p class="small dim">配線・ホースは付属セットで自動接続されます。</p></details> : <p class="small dim">配線・ホースは付属セットで自動接続されます。デザインによって生物の飼育性能は変わりません。</p>}
    </Fragment>}
  </Fragment>;
}
