import { h } from 'preact';
import { ui } from '../store';
import { BUILD } from '../../core/Build';
import type { App } from '../../app/App';

export function Toasts({ app }: { app: App }) {
  const nb = ui.newBuild.value;
  return (
    <div class="toasts">
      {ui.saveError.value && <div class="toast warn save-warning" role="alert">
        <span>{ui.saveError.value}</span>
        <button class="btn sm" onClick={() => void app.writeSave()}>保存を再試行</button>
        <button class="btn sm" onClick={() => void app.downloadSave()}>JSONを保存</button>
      </div>}
      {nb && (
        <div class="toast update" role="status">
          <span>新しい版があります <span class="num">v{nb.version}{nb.build ? ` build ${nb.build}` : ''}</span>（いまは <span class="num">v{BUILD.version}{BUILD.build ? ` build ${BUILD.build}` : ''}</span>）</span>
          <button class="btn sm primary" onClick={() => location.reload()}>再読み込み</button>
        </div>
      )}
      {ui.toasts.value.map((tt) => <div key={tt.id} class={`toast ${tt.kind}`}>{tt.text}</div>)}
    </div>
  );
}
