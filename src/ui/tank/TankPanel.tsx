import { researchFor } from '../../systems/Encyclopedia';
import { h, Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';
import { TANK_ITEM_TYPES, TANK_MAX_ITEMS, TANK_SUBSTRATES } from '../../app/TankLayout';
import { TankSwitcher } from './TankSwitcher';
import { CloseIcon } from '../common/Icons';
import { EquipmentTab } from './EquipmentTab';
import { SpecimenPicker } from '../common/SpecimenPicker';
import { usePanelViewport } from '../common/usePanelViewport';

function Name({ app, r }: { app: App; r: IndividualRecord }) {
  const sp = app.data.species.get(r.speciesId);
  return (
    <span>
      <span class="occ-name">{sp?.names.ja ?? r.speciesId}<span class="num">#{String(r.number).padStart(4, '0')}</span></span>
      <div class="occ-facts"><span class="num">{(r.length_mm / 10).toFixed(1)} cm</span> ・ {t(`sex.${r.sex}`)}</div>
    </span>
  );
}

/** The tank drawer: who lives in it, and how it is laid out (substrate and decorations). */
export function TankPanel({ app }: { app: App }) {
  const tab = ui.tankTab.value;
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef<HTMLElement>(null);
  usePanelViewport(app, panel, app.tank.camera, 56, true);
  return (
    <aside ref={panel} class={`glass drawer tank-editor-panel ${collapsed ? 'sheet-collapsed' : ''}`}>
      <div class="drawer-head">
        <h2>{t('tank.title')}</h2>
        {app.input.touchDevice && <button class="btn ghost sm sheet-toggle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed ? '編集を表示' : '水槽を見る'}</button>}
        <button class="icon-btn" onClick={() => app.closeTankEdit()} aria-label={t('ui.close')}><CloseIcon /></button>
      </div>
      <div class="tank-room-controls"><TankSwitcher app={app} editor /><button class="btn sm" onClick={() => app.openRoomPlacement()}>部屋に設置</button></div>
      <div class="seg">
        <button class={tab === 'fish' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'fish'; ui.tankSelected.value = null; }}>{t('tank.tab.fish')}</button>
        <button class={tab === 'layout' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'layout'; }}>{t('tank.tab.layout')}</button>
        <button class={tab === 'equipment' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'equipment'; ui.tankSelected.value = null; }}>設備</button>
      </div>
      <div class="drawer-body">
        {tab === 'fish' ? app.input.touchDevice ? <MobileFishTab app={app} /> : <FishTab app={app} /> : tab === 'layout' ? <LayoutTab app={app} /> : <EquipmentTab app={app} />}
      </div>
      <div class="foot">{app.input.touchDevice ? tab === 'layout' ? '飾りは水槽内でドラッグして配置。' : '1本指で回転・2本指で拡大／移動。' : tab === 'layout' ? t('tank.dragHint') : 'ドラッグで回転 ・ ホイールで接近 ・ WASD で視点'}</div>
    </aside>
  );
}

function MobileFishTab({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const [source, setSource] = useState<'tank' | 'case'>(enc.tankItems.value.length ? 'tank' : 'case');
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(0);
  const records = source === 'tank' ? enc.tankItems.value : enc.caseItems.value;
  const lastPage = Math.max(0, Math.ceil(records.length / 6) - 1), currentPage = Math.min(page, lastPage);
  const shown = records.slice(currentPage * 6, currentPage * 6 + 6), chosen = shown.find((r) => r.id === selected) ?? shown[0];
  const sp = chosen ? app.data.species.get(chosen.speciesId) : undefined;
  return <div class="mobile-fish-tab">
    <div class="seg specimen-source"><button class={source === 'tank' ? 'on' : ''} onClick={() => { setSource('tank'); setPage(0); }}>水槽 {enc.tankItems.value.length}/{app.tankMax}</button><button class={source === 'case' ? 'on' : ''} onClick={() => { setSource('case'); setPage(0); }}>ケース {enc.caseItems.value.length}/{enc.caseMax}</button></div>
    <SpecimenPicker app={app} items={shown} selected={chosen?.id} onSelect={setSelected} />
    {lastPage > 0 && <div class="specimen-pagination"><button class="btn ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button><span>{currentPage + 1}/{lastPage + 1}</span><button class="btn ghost" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>次へ</button></div>}
    {chosen ? <div class="mobile-specimen-detail">
      <span class="small dim">{t(`sex.${chosen.sex}`)} ・ {chosen.weight_g.toFixed(1)} g</span>
      <div class="mobile-specimen-actions">
        {source === 'tank' ? <button class="btn" onClick={() => void app.tankRelease(chosen)}>{t('tank.release')}</button> : <Fragment>
          <button class="btn" disabled={enc.tankItems.value.length >= app.tankMax} onClick={() => void app.tankPut(chosen)}>{t('tank.put')}</button>
          <button class="btn" onClick={() => app.caseRelease(chosen)}>{t('case.release')}</button>
          <button class="btn" onClick={() => app.caseToResearch(chosen)}>{t('case.toResearch')} +{researchFor(chosen)}</button>
        </Fragment>}
      </div>
      {source === 'tank' && <details class="mobile-behavior-details"><summary>行動記録</summary><ul class="behaviors compact">{sp?.encyclopedia.behaviors.map((b) => <li key={b.id} class={enc.progress.value[chosen.speciesId]?.behaviors[b.id] ? 'on' : ''}>{b.ja}</li>)}</ul></details>}
    </div> : <p class="dim small">{source === 'tank' ? t('tank.empty') : t('case.empty')}</p>}
  </div>;
}

function FishTab({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const inTank = enc.tankItems.value;
  const inCase = enc.caseItems.value;
  const full = inTank.length >= app.tankMax;
  return (
    <Fragment>
      <h4>{t('tank.tab.fish')} <span class="num" style={{ marginLeft: '8px' }}>{inTank.length} / {app.tankMax}</span></h4>
      {inTank.length ? inTank.map((occupant) => {
        const recorded = enc.progress.value[occupant.speciesId]?.behaviors ?? {};
        const sp = app.data.species.get(occupant.speciesId);
        return (
          <div key={occupant.id} class="occupant">
            <div class="row"><Name app={app} r={occupant} /><button onClick={() => void app.tankRelease(occupant)}>{t('tank.release')}</button></div>
            <ul class="behaviors compact">
              {sp?.encyclopedia.behaviors.map((b) => <li key={b.id} class={recorded[b.id] ? 'on' : ''}><span class="mark">{recorded[b.id] ? '✓' : ''}</span>{b.ja}</li>)}
            </ul>
          </div>
        );
      }) : <p class="dim small">{t('tank.empty')}</p>}
      <h4>{t('hud.case')} <span class="num" style={{ marginLeft: '8px' }}>{inCase.length} / {enc.caseMax}</span></h4>
      <ul class="case-list">
        {inCase.map((r) => (
          <li key={r.id}>
            <Name app={app} r={r} />
            <span class="acts">
              {!full && <button onClick={() => void app.tankPut(r)}>{t('tank.put')}</button>}
              <button onClick={() => app.caseRelease(r)}>{t('case.release')}</button>
              <button onClick={() => app.caseToResearch(r)} title={`+${researchFor(r)} ${t('progress.research')}`}>{t('case.toResearch')} +{researchFor(r)}</button>
            </span>
          </li>
        ))}
      </ul>
    </Fragment>
  );
}

function LayoutTab({ app }: { app: App }) {
  void ui.tankLayoutVersion.value;   // re-render on layout changes
  const layout = app.tank.currentLayout;
  const selected = ui.tankSelected.value;
  return (
    <Fragment>
      <h4>{t('tank.substrate')}</h4>
      <div class="seg">
        {TANK_SUBSTRATES.map((s) => (
          <button key={s} class={layout.substrate === s ? 'on' : ''} onClick={() => app.tankSetSubstrate(s)}>{t(`tank.sub.${s}`)}</button>
        ))}
      </div>
      <h4>{t('tank.add')} <span class="num" style={{ marginLeft: '8px' }}>{layout.items.length} / {TANK_MAX_ITEMS}</span></h4>
      <div class="tank-add">
        {TANK_ITEM_TYPES.map((ty) => <button key={ty} onClick={() => app.tankAddItem(ty)}>+ {t(`tank.item.${ty}`)}</button>)}
      </div>
      {layout.items.length ? (
        <ul class="tank-items">
          {layout.items.map((it) => (
            <li key={it.id} class={selected === it.id ? 'on' : ''} onClick={() => { ui.tankSelected.value = it.id; }}>
              <span>{t(`tank.item.${it.type}`)}</span>
              <span class="tank-item-actions">
                <button onClick={(e) => { e.stopPropagation(); app.tankRotateItem(it.id); }}>{t('tank.rotate')}</button>
                <button onClick={(e) => { e.stopPropagation(); app.tankRemoveItem(it.id); }}>{t('tank.remove')}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p class="dim small">{t('tank.noItems')}</p>}
    </Fragment>
  );
}
