import { h } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';

export function CaptureOverlay({ app }: { app: App }) {
  const st = app.capture.state.value;
  if (!st) return null;
  return (
    <div class="capture-box">
      <div class="capture-title">{st.toolName}: {st.speciesName}</div>
      <div class="capture-bar">
        <div class="band" style={{ left: `${st.bandStart * 100}%`, width: `${(st.bandEnd - st.bandStart) * 100}%` }} />
        <div class="cursor" style={{ left: `${st.cursor * 100}%` }} />
      </div>
      <div class={`capture-msg ${st.result}`}>
        {st.result === 'none' ? t('capture.hint') : st.result === 'success' ? t('capture.success') : t('capture.fail')}
      </div>
    </div>
  );
}
