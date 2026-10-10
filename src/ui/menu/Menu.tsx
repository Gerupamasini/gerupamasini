import { h } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { QUALITY_LABELS, QUALITY_ORDER } from '../../core/Settings';
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
        {(['homeQuality', 'fieldQuality'] as const).map((scene) => <div class="setting" key={scene}>
          <span class="label">{scene === 'homeQuality' ? 'ホーム（水槽）の画質' : '干潟の画質'}</span>
          <div class="seg">
            {QUALITY_ORDER.map((q) => (
              <button key={q} class={s[scene] === q ? 'on' : ''} aria-pressed={s[scene] === q} onClick={() => void app.updateSettings({ [scene]: q })}>{QUALITY_LABELS[q]}</button>
            ))}
          </div>
        </div>)}
        <p class="small dim">超軽量（最低画質）では図鑑を写真で表示します。</p>
        <div class="setting">
          <span class="label">{app.input.touchDevice ? '視点の感度' : t('menu.sensitivity')}<span class="num">{s.mouseSensitivity.toFixed(1)}</span></span>
          <input type="range" min="0.3" max="10" step="0.1" value={s.mouseSensitivity} onInput={(e) => void app.updateSettings({ mouseSensitivity: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <div class="setting">
          <span class="label">{t('menu.eyeHeight')}<span class="num">{s.eyeHeight.toFixed(2)} m</span></span>
          <input type="range" min="1.1" max="1.9" step="0.05" value={s.eyeHeight} onInput={(e) => void app.updateSettings({ eyeHeight: Number((e.target as HTMLInputElement).value) })} />
        </div>
        <h4>{t('menu.controls')}</h4>
        <p class="small">干潟で採集 → ケースに保管 → 自宅の「水槽」で移す。研究所への提供・観察で100 RPごとに設備ガチャチケット1枚。</p>
        <button class="btn ghost sm" onClick={() => { ui.guideDismissed.value = false; app.requestSave(); app.enterHome(); }}>採集の案内をホームに表示</button>
        <div class="keys-grid">
          {app.input.touchDevice ? <p class="touch-instructions">左スティックで移動、画面をドラッグして視点を回します。右下で道具を選び、採集・観察を押します。立つ・走る・ジャンプは右側のボタン。走る・望遠・双眼鏡は長押しです。ホームの上下移動は下部の「視点移動」から。「UI非表示」で水槽だけを眺められます。水槽と観察画面では1本指で回転、2本指で拡大できます。</p> : KEYS.map(([keys, label]) => <KeyHint key={label} keys={keys} label={label} />)}
        </div>
        <div class="buttons">
          <button class="btn primary" onClick={() => app.closeOverlay()}>{t('menu.resume')}</button>
          {app.save && <button class="btn" onClick={() => void app.downloadSave()}>{t('menu.export')}</button>}
          <button class="btn" onClick={() => void app.restoreBackup()}>バックアップを復元</button>
          <button class="btn" onClick={() => importSave(app)}>{t('menu.import')}</button>
          <span class="spacer" />
          {app.save && <button class="btn ghost sm danger" onClick={() => { if (confirm('セーブデータを消しますか？')) void app.resetSave(); }}>{t('menu.reset')}</button>}
        </div>
      </div>
    </div>
  );
}

function importSave(app: App): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { await app.importSave(await f.text()); } catch (e) { alert(String((e as Error).message ?? e)); }
  };
  input.click();
}
