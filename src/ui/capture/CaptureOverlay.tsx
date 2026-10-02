import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';

/** The タモ: a timing bar while aiming, then a quiet line while the net comes up, then what was in it. */
export function CaptureOverlay({ app }: { app: App }) {
  const st = app.capture.state.value;
  if (!st) return null;
  if (st.phase === 'aim') {
    return (
      <div class="capture-box">
        <div class="capture-title"><span class="tool">{st.toolName}</span>{st.speciesName}</div>
        <div class="capture-bar">
          <div class="band" style={{ left: `${st.bandStart * 100}%`, width: `${(st.bandEnd - st.bandStart) * 100}%` }} />
          <div class="cursor" style={{ left: `${st.cursor * 100}%` }} />
        </div>
        <div class="capture-msg">{t('capture.hint')}</div>
      </div>
    );
  }
  if (st.phase === 'swing') return null;
  const cls = !st.revealed ? 'wait' : st.result === 'success' ? 'success' : 'fail';
  return (
    <div class={`capture-reveal ${cls}`} key={cls}>
      {!st.revealed ? (
        <span class="eyebrow">{t('capture.checking')}</span>
      ) : st.result === 'success' ? (
        <Fragment>
          <span class="eyebrow">{t('capture.got')}</span>
          <span class="display">{st.catchText}</span>
        </Fragment>
      ) : (
        <Fragment>
          <span class="eyebrow">{t('capture.empty')}</span>
          <span class="display">{t('capture.fail')}</span>
        </Fragment>
      )}
    </div>
  );
}
