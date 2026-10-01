import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';
import { SPEEDS } from '../../systems/Observation';

export function ObserveOverlay({ app }: { app: App }) {
  const st = app.observation.state.value;
  if (!st) return null;
  const sp = app.data.species.get(st.speciesId);
  const stage = sp?.stages.find((s) => s.id === st.stage)?.ja ?? st.stage;
  const recorded = app.encyclopedia.progress.value[st.speciesId]?.behaviors ?? {};
  return (
    <Fragment>
      <div class="observe-top">
        <div class="observe-name">{st.speciesName} <span class="dim small">{sp?.names.sci}</span></div>
        <div class="dim small">{stage}{sp?.sex.dimorphic ? ` / ${t(`sex.${st.sex}`)}` : ''}</div>
      </div>
      <div class="observe-right">
        <div class="small dim">{t('zukan.behaviors')}</div>
        <ul class="behaviors compact">
          {sp?.encyclopedia.behaviors.map((b) => (
            <li key={b.id} class={recorded[b.id] ? 'on' : ''}>{recorded[b.id] ? '✓' : '○'} {b.ja}</li>
          ))}
        </ul>
      </div>
      <div class="observe-bottom">
        <div class="seg">
          {SPEEDS.map((s, i) => (
            <button key={s} class={st.speedIndex === i ? 'on' : ''} onClick={() => app.observation.setSpeedIndex(i)}>{s}×</button>
          ))}
        </div>
        <span class="dim small">ドラッグで回転 / ホイールで接近 / [ ] 速度 / {t('observe.exit')}</span>
      </div>
    </Fragment>
  );
}
