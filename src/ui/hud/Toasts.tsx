import { h } from 'preact';
import { ui } from '../store';
import { BUILD } from '../../core/Build';

export function Toasts() {
  const nb = ui.newBuild.value;
  return (
    <div class="toasts">
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
