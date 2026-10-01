import { h } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';
import type { Quality } from '../../core/Settings';

export function Menu({ app }: { app: App }) {
  const s = app.settings;
  return (
    <div class="screen center">
      <div class="card wide">
        <h2>{t('menu.title')}</h2>
        <div class="row">
          <span>{t('menu.quality')}</span>
          <div class="seg">
            {(['low', 'mid', 'high'] as Quality[]).map((q) => (
              <button key={q} class={s.quality === q ? 'on' : ''} onClick={() => void app.updateSettings({ quality: q })}>{t(`menu.quality.${q}`)}</button>
            ))}
          </div>
        </div>
        <div class="row">
          <span>{t('menu.sensitivity')}</span>
          <input type="range" min="0.3" max="2.5" step="0.1" value={s.mouseSensitivity} onInput={(e) => void app.updateSettings({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="row">
          <span>{t('menu.eyeHeight')} <span class="dim small">{s.eyeHeight.toFixed(2)} m</span></span>
          <input type="range" min="1.1" max="1.9" step="0.05" value={s.eyeHeight} onInput={(e) => void app.updateSettings({ eyeHeight: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="row">
          <span>{t('menu.controls')}</span>
          <span class="dim small">{t('hud.hint.move')}</span>
        </div>
        <div class="buttons">
          <button class="primary" onClick={() => app.closeOverlay()}>{t('menu.resume')}</button>
          {app.save && <button onClick={() => exportSave(app)}>{t('menu.export')}</button>}
          <button onClick={() => importSave(app)}>{t('menu.import')}</button>
          {app.save && <button onClick={() => { if (confirm('セーブデータを消しますか？')) void app.resetSave(); }}>{t('menu.reset')}</button>}
        </div>
      </div>
    </div>
  );
}

function exportSave(app: App): void {
  const json = app.exportSave();
  if (!json) return;
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `higata-zukan-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importSave(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { await app.importSave(await f.text()); location.reload(); } catch (e) { alert(String((e as Error).message ?? e)); }
  };
  input.click();
}
