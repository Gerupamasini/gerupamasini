import './styles.css';
import { App } from './app/App';
import { buildLabel, BUILD } from './core/Build';

console.info(`干潟図鑑 ${buildLabel}${BUILD.builtAt ? ` built ${BUILD.builtAt}` : ''}`);

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

function showBootError(err: unknown): void {
  console.error(err);
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;gap:16px;background:#06111a;color:#fff;padding:24px;text-align:center';
  const message = document.createElement('p');
  message.textContent = `起動できませんでした。WebGL2対応のブラウザで、ハードウェアアクセラレーションを有効にしてください。通信エラーの場合は再読み込みしてください。\n${String((err as Error)?.message ?? err)}`;
  const retry = document.createElement('button'); retry.textContent = '再読み込み'; retry.className = 'btn'; retry.onclick = () => location.reload();
  panel.append(message, retry); uiRoot.replaceChildren(panel);
}
try { const app = new App(canvas, uiRoot); void app.start().catch(showBootError); }
catch (err) { showBootError(err); }
