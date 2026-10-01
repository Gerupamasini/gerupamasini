import './styles.css';
import { App } from './app/App';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const app = new App(canvas, uiRoot);
app.start().catch((err: unknown) => {
  console.error(err);
  uiRoot.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#06111a;color:#fff;padding:24px;text-align:center">起動に失敗しました<br><small>${String((err as Error)?.message ?? err)}</small></div>`;
});
