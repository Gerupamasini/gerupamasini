import { h } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';

function label(app: App, r: IndividualRecord): string {
  const sp = app.data.species.get(r.speciesId);
  return `${sp?.names.ja ?? r.speciesId} #${String(r.number).padStart(4, '0')}  ${(r.length_mm / 10).toFixed(1)} cm  ${t(`sex.${r.sex}`)}`;
}

export function TankPanel({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const inTank = enc.tankItems.value;
  const inCase = enc.caseItems.value;
  const occupant = inTank[0];
  const recorded = occupant ? enc.progress.value[occupant.speciesId]?.behaviors ?? {} : {};
  const sp = occupant ? app.data.species.get(occupant.speciesId) : undefined;
  return (
    <div class="tank-panel card">
      <h2>{t('tank.title')}</h2>
      {occupant ? (
        <div>
          <div class="row"><span>{label(app, occupant)}</span><button onClick={() => void app.tankRelease(occupant)}>{t('tank.release')}</button></div>
          <ul class="behaviors compact">
            {sp?.encyclopedia.behaviors.map((b) => <li key={b.id} class={recorded[b.id] ? 'on' : ''}>{recorded[b.id] ? '✓' : '○'} {b.ja}</li>)}
          </ul>
        </div>
      ) : <p class="dim">{t('tank.empty')}</p>}
      <h4>{t('hud.case')} ({inCase.length}/{enc.caseMax})</h4>
      <ul class="individuals">
        {inCase.map((r) => (
          <li key={r.id} class="row"><span>{label(app, r)}</span>{!occupant && <button onClick={() => void app.tankPut(r)}>{t('tank.put')}</button>}</li>
        ))}
      </ul>
      <div class="buttons"><button class="primary" onClick={() => app.leaveTank()}>{t('tank.back')} (Esc)</button></div>
      <div class="dim small">ドラッグで回転 / ホイールで接近</div>
    </div>
  );
}
