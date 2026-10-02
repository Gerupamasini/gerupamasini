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
        <div class="observe-name">{st.speciesName}<span class="sci">{sp?.names.sci}</span></div>
        <div class="observe-sub">{stage}{sp?.sex.dimorphic ? ` ・ ${t(`sex.${st.sex}`)}` : ''}</div>
      </div>
      <div class="observe-right">
        <div class="eyebrow">{t('zukan.behaviors')}</div>
        <ul class="behaviors compact">
          {sp?.encyclopedia.behaviors.map((b) => (
            <li key={b.id} class={recorded[b.id] ? 'on' : ''}><span class="mark">{recorded[b.id] ? '✓' : ''}</span>{b.ja}</li>
          ))}
        </ul>
      </div>
      <div class="observe-bottom">
        <div class="seg">
          {SPEEDS.map((s, i) => (
            <button key={s} class={st.speedIndex === i ? 'on' : ''} onClick={() => app.observation.setSpeedIndex(i)}>{s}×</button>
          ))}
        </div>
        <div class="seg">
          <button onClick={() => app.observation.nudge(-1)} title="+">{t('observe.closer')}</button>
          <button onClick={() => app.observation.nudge(1)} title="-">{t('observe.farther')}</button>
        </div>
        <span class="hint">{t('observe.hint')} ・ {t('observe.exit')}</span>
      </div>
    </Fragment>
  );
}
