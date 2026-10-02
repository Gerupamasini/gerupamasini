import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';
import { TANK_ITEM_TYPES, TANK_MAX_ITEMS, TANK_SUBSTRATES } from '../../app/TankLayout';
import { CloseIcon } from '../common/Icons';

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
  return (
    <aside class="glass drawer">
      <div class="drawer-head">
        <h2>{t('tank.title')}</h2>
        <button class="icon-btn" onClick={() => { ui.homePanel.value = 'none'; ui.tankSelected.value = null; }} aria-label={t('ui.close')}><CloseIcon /></button>
      </div>
      <div class="seg">
        <button class={tab === 'fish' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'fish'; ui.tankSelected.value = null; }}>{t('tank.tab.fish')}</button>
        <button class={tab === 'layout' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'layout'; }}>{t('tank.tab.layout')}</button>
      </div>
      <div class="drawer-body">
        {tab === 'fish' ? <FishTab app={app} /> : <LayoutTab app={app} />}
      </div>
      <div class="foot">{tab === 'fish' ? 'ドラッグで回転 ・ ホイールで接近' : t('tank.dragHint')}</div>
    </aside>
  );
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
          <li key={r.id}><Name app={app} r={r} />{!full && <button onClick={() => void app.tankPut(r)}>{t('tank.put')}</button>}</li>
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
