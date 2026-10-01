import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';
import { TANK_ITEM_TYPES, TANK_MAX_ITEMS, TANK_SUBSTRATES } from '../../app/TankLayout';

function label(app: App, r: IndividualRecord): string {
  const sp = app.data.species.get(r.speciesId);
  return `${sp?.names.ja ?? r.speciesId} #${String(r.number).padStart(4, '0')}  ${(r.length_mm / 10).toFixed(1)} cm  ${t(`sex.${r.sex}`)}`;
}

/** The tank editor: who lives in it, and how it is laid out (substrate and decorations). */
export function TankPanel({ app }: { app: App }) {
  const tab = ui.tankTab.value;
  return (
    <div class="tank-panel card glass-card">
      <div class="row">
        <h2>{t('tank.title')}</h2>
        <button onClick={() => { ui.homePanel.value = 'none'; ui.tankSelected.value = null; }}>×</button>
      </div>
      <div class="seg tank-tabs">
        <button class={tab === 'fish' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'fish'; ui.tankSelected.value = null; }}>{t('tank.tab.fish')}</button>
        <button class={tab === 'layout' ? 'on' : ''} onClick={() => { ui.tankTab.value = 'layout'; }}>{t('tank.tab.layout')}</button>
      </div>
      {tab === 'fish' ? <FishTab app={app} /> : <LayoutTab app={app} />}
    </div>
  );
}

function FishTab({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const inTank = enc.tankItems.value;
  const inCase = enc.caseItems.value;
  const full = inTank.length >= app.tankMax;
  return (
    <Fragment>
      <div class="dim small">{inTank.length}/{app.tankMax}</div>
      {inTank.length ? inTank.map((occupant) => {
        const recorded = enc.progress.value[occupant.speciesId]?.behaviors ?? {};
        const sp = app.data.species.get(occupant.speciesId);
        return (
          <div key={occupant.id} class="tank-occupant">
            <div class="row"><span>{label(app, occupant)}</span><button onClick={() => void app.tankRelease(occupant)}>{t('tank.release')}</button></div>
            <ul class="behaviors compact">
              {sp?.encyclopedia.behaviors.map((b) => <li key={b.id} class={recorded[b.id] ? 'on' : ''}>{recorded[b.id] ? '✓' : '○'} {b.ja}</li>)}
            </ul>
          </div>
        );
      }) : <p class="dim">{t('tank.empty')}</p>}
      <h4>{t('hud.case')} ({inCase.length}/{enc.caseMax})</h4>
      <ul class="individuals">
        {inCase.map((r) => (
          <li key={r.id} class="row"><span>{label(app, r)}</span>{!full && <button onClick={() => void app.tankPut(r)}>{t('tank.put')}</button>}</li>
        ))}
      </ul>
      <div class="dim small">ドラッグで回転 / ホイールで接近</div>
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
      <h4>{t('tank.add')} <span class="dim small">{layout.items.length}/{TANK_MAX_ITEMS}</span></h4>
      <div class="tank-add">
        {TANK_ITEM_TYPES.map((ty) => <button key={ty} onClick={() => app.tankAddItem(ty)}>+ {t(`tank.item.${ty}`)}</button>)}
      </div>
      {layout.items.length ? (
        <ul class="tank-items">
          {layout.items.map((it) => (
            <li key={it.id} class={`row ${selected === it.id ? 'on' : ''}`} onClick={() => { ui.tankSelected.value = it.id; }}>
              <span>{t(`tank.item.${it.type}`)}</span>
              <span class="tank-item-actions">
                <button onClick={(e) => { e.stopPropagation(); app.tankRotateItem(it.id); }}>{t('tank.rotate')}</button>
                <button onClick={(e) => { e.stopPropagation(); app.tankRemoveItem(it.id); }}>{t('tank.remove')}</button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p class="dim small">{t('tank.noItems')}</p>}
      <div class="dim small">{t('tank.dragHint')}</div>
    </Fragment>
  );
}
