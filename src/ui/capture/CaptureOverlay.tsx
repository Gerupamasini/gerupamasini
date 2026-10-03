import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';

/** While the tool comes up: a quiet line, then what was in it. */
export function CaptureOverlay({ app }: { app: App }) {
  const st = app.capture.state.value;
  if (!st || st.phase === 'swing' || st.result === 'fail') return null;
  const cls = !st.revealed ? 'wait' : st.result === 'success' ? 'success' : 'fail';
  const checking = st.toolId === 'shovel' ? '砂の中は…' : t('capture.checking');
  const empty = st.toolId === 'shovel' ? t('capture.sandOnly') : t('capture.empty');
  return (
    <div class={`capture-reveal ${cls}`} key={cls}>
      {!st.revealed ? (
        <span class="eyebrow">{checking}</span>
      ) : st.result === 'success' ? (
        <Fragment>
          <span class="eyebrow">{st.toolId === 'shovel' ? '出てきた！' : t('capture.got')}</span>
          <span class="display">{st.catchText}</span>
        </Fragment>
      ) : (
        <Fragment>
          <span class="eyebrow">{empty}</span>
          <span class="display">{t('capture.fail')}</span>
        </Fragment>
      )}
    </div>
  );
}
