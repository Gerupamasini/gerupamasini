import { h } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import type { Quality } from '../../core/Settings';
import { CardHead, KeyHint } from '../common/Icons';
import { buildLabel } from '../../core/Build';

const KEYS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], '移動'], [['Shift'], '走る'], [['Space'], 'ジャンプ（走りながらで跳び込み）'], [['C'], '低い視点 ⇄ 立つ'], [['右クリック', 'Z'], '望遠'], [['G'], '偏光サングラス'],
  [['E'], '採集'], [['F'], '観察'], [['M'], '全体図'], [['Tab'], '図鑑'], [['H'], '自宅'], [['T'], '潮時チケット'], [['F3'], 'デバッグ'], [['Esc'], 'メニュー'],
];

export function Menu({ app }: { app: App }) {
  const s = ui.settings.value;
  return (
    <div class="screen center">
      <div class="card wide menu">
        <CardHead eyebrow={t('menu.settings')} title={t('menu.title')} aside={<span class="num dim">{buildLabel}</span>} onClose={() => app.closeOverlay()} />
        <div class="setting">
          <span class="label">{t('menu.quality')}</span>
          <div class="seg">
            {(['low', 'mid', 'high'] as Quality[]).map((q) => (
              <button key={q} class={s.quality === q ? 'on' : ''} onClick={() => void app.updateSettings({ quality: q })}>{t(`menu.quality.${q}`)}</button>
            ))}
          </div>
        </div>
        <div class="setting">
          <span class="label">{app.input.touchDevice ? '視点の感度' : t('menu.sensitivity')}<span class="num">{s.mouseSensitivity.toFixed(1)}</span></span>
          <input type="range" min="0.3" max="2.5" step="0.1" value={s.mouseSensitivity} onInput={(e) => void app.updateSettings({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting">
          <span class="label">{t('menu.eyeHeight')}<span class="num">{s.eyeHeight.toFixed(2)} m</span></span>
          <input type="range" min="1.1" max="1.9" step="0.05" value={s.eyeHeight} onInput={(e) => void app.updateSettings({ eyeHeight: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <h4>{t('menu.controls')}</h4>
        <div class="keys-grid">
          {app.input.touchDevice ? <p class="touch-instructions">左スティックで移動、画面をドラッグして視点を回します。採集・観察は右側のボタン、道具の切り替えは画面上部から。走る・望遠・双眼鏡は押している間だけ作動します。水槽と観察画面では1本指で回転、2本指で拡大できます。</p> : KEYS.map(([keys, label]) => <KeyHint key={label} keys={keys} label={label} />)}
        </div>
        <div class="buttons">
          <button class="btn primary" onClick={() => app.closeOverlay()}>{t('menu.resume')}</button>
          {app.save && <button class="btn" onClick={() => exportSave(app)}>{t('menu.export')}</button>}
          <button class="btn" onClick={() => importSave(app)}>{t('menu.import')}</button>
          <span class="spacer" />
          {app.save && <button class="btn ghost sm danger" onClick={() => { if (confirm('セーブデータを消しますか？')) void app.resetSave(); }}>{t('menu.reset')}</button>}
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
