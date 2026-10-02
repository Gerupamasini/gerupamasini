import type { FlatData } from './gen/generate';
import type { FlatField } from './FlatField';
import type { FlatState } from './main';
import type { Walker } from './Walker';

export interface FlatUI {
  progress(label: string, f: number): void;
  ready(data: FlatData, field: FlatField): void;
  error(msg: string): void;
  frame(dt: number, walker: Walker, field: FlatField, nodes: number): void;
  onChange: (key: keyof FlatState) => void;
}

const CSS = /* css */ `
:root { color-scheme: dark; }
html, body { margin: 0; height: 100%; background: #0b1216; overflow: hidden; }
#view { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; }
.fl { position: fixed; font: 13px/1.5 "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; color: #eef2f1; text-shadow: 0 1px 2px rgba(0,0,0,0.45); pointer-events: none; }
.fl-load { inset: 0; display: grid; place-items: center; background: radial-gradient(120% 90% at 50% 30%, #2a3a40 0%, #0b1216 70%); pointer-events: auto; transition: opacity 0.8s; }
.fl-load h1 { font-size: 28px; font-weight: 500; letter-spacing: 0.2em; margin: 0 0 4px; }
.fl-load p { margin: 0 0 22px; opacity: 0.7; letter-spacing: 0.05em; }
.fl-bar { width: min(340px, 70vw); height: 3px; background: rgba(255,255,255,0.15); border-radius: 2px; overflow: hidden; }
.fl-bar i { display: block; height: 100%; width: 0; background: #d9c7a3; transition: width 0.2s; }
.fl-lbl { margin-top: 10px; font-size: 12px; opacity: 0.6; text-align: center; }
.fl-title { left: 18px; top: 14px; font-size: 13px; letter-spacing: 0.12em; opacity: 0.85; }
.fl-title small { display: block; font-size: 11px; opacity: 0.7; letter-spacing: 0.04em; }
.fl-help { left: 18px; bottom: 16px; font-size: 12px; opacity: 0.8; transition: opacity 1.5s; }
.fl-help kbd { font: inherit; padding: 0 5px; border: 1px solid rgba(255,255,255,0.45); border-radius: 3px; margin-right: 3px; }
.fl-info { right: 18px; top: 14px; text-align: right; font-size: 12px; opacity: 0.85; font-variant-numeric: tabular-nums; }
.fl-panel { right: 14px; bottom: 14px; width: 250px; padding: 12px 14px; background: rgba(12,20,24,0.62); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; pointer-events: auto; text-shadow: none; }
.fl-panel[hidden] { display: none; }
.fl-panel label { display: grid; grid-template-columns: 64px 1fr 44px; gap: 6px; align-items: center; margin: 4px 0; font-size: 12px; }
.fl-panel input[type=range] { width: 100%; accent-color: #d9c7a3; }
.fl-panel output { text-align: right; opacity: 0.8; font-variant-numeric: tabular-nums; }
.fl-panel .row { display: flex; gap: 6px; margin-top: 8px; }
.fl-panel button, .fl-panel select { flex: 1; font: inherit; font-size: 12px; color: #eef2f1; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 4px 6px; cursor: pointer; }
.fl-err { inset: 0; display: grid; place-items: center; background: #0b1216; padding: 24px; text-align: center; pointer-events: auto; }
`;

export function buildUI(root: HTMLElement, state: FlatState, visible: boolean): FlatUI {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = (cls: string, html = '') => { const d = document.createElement('div'); d.className = `fl ${cls}`; d.innerHTML = html; root.appendChild(d); return d; };
  const load = el('fl-load', `<div><h1>なぎさ干潟</h1><p>葛西海浜公園をモデルにした架空の干潟</p><div class="fl-bar"><i></i></div><div class="fl-lbl">起動</div></div>`);
  const bar = load.querySelector('i') as HTMLElement, lbl = load.querySelector('.fl-lbl') as HTMLElement;
  const title = el('fl-title', `なぎさ干潟<small>架空の干潟 · 300 m 四方</small>`);
  const help = el('fl-help', `<kbd>クリック</kbd>視点 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>歩く <kbd>Shift</kbd>走る <kbd>C</kbd>しゃがむ <kbd>H</kbd>設定`);
  const info = el('fl-info');
  const panel = el('fl-panel');
  panel.hidden = true;
  if (!visible) { title.style.display = help.style.display = info.style.display = 'none'; }
  const sliders: [keyof FlatState, string, number, number, number, (v: number) => string][] = [
    ['hour', '時刻', 5, 19, 0.05, (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`],
    ['tide', '潮位', -1, 0.8, 0.01, (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}cm`],
    ['cover', '雲', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
    ['cirrus', '巻雲', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`],
    ['haze', '霞', 5, 90, 1, (v) => `${v.toFixed(0)}`],
    ['exposure', '露出', 0.4, 2.5, 0.01, (v) => v.toFixed(2)],
  ];
  const ui: FlatUI = {
    onChange: () => undefined,
    progress(label, f) { bar.style.width = `${Math.round(f * 100)}%`; lbl.textContent = label; },
    ready() {
      bar.style.width = '100%';
      load.style.opacity = '0';
      setTimeout(() => load.remove(), 900);
      setTimeout(() => { help.style.opacity = '0.35'; }, 12000);
    },
    error(msg) { el('fl-err', msg); },
    frame(dt, walker, field) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc < 0.5) return;
      const fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      const mud = field.mudAt(walker.x, walker.z);
      const depth = field.depthAt(walker.x, walker.z);
      const ground = depth > 0.005 ? `水深 ${(depth * 100).toFixed(0)} cm` : mud > 0.66 ? '泥地' : mud > 0.33 ? '砂泥' : '砂地';
      info.textContent = `${ground} · 潮位 ${state.tide >= 0 ? '+' : ''}${(state.tide * 100).toFixed(0)} cm · ${fps.toFixed(0)} fps`;
    },
  };
  let fpsAcc = 0, fpsN = 0;
  panel.innerHTML = sliders.map(([k, name, min, max, step]) => `<label>${name}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${state[k] as number}"><output data-o="${k}"></output></label>`).join('')
    + `<div class="row"><select data-k="quality">${['low', 'mid', 'high', 'ultra'].map((q) => `<option ${q === state.quality ? 'selected' : ''}>${q}</option>`).join('')}</select><button data-a="seed">別の干潟</button></div>`;
  const outs = new Map<string, HTMLOutputElement>();
  panel.querySelectorAll('output').forEach((o) => outs.set(o.dataset.o ?? '', o));
  const show = () => { for (const [k, , , , , f] of sliders) { const o = outs.get(k); if (o) o.textContent = f(state[k] as number); } };
  show();
  panel.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    const i = inp as HTMLInputElement, k = i.dataset.k as keyof FlatState;
    (state as unknown as Record<string, number>)[k] = Number(i.value);
    if (k === 'exposure') state.autoExposure = true;
    show();
    ui.onChange(k);
  }));
  panel.querySelector('select')?.addEventListener('change', (e) => { state.quality = (e.target as HTMLSelectElement).value as FlatState['quality']; ui.onChange('quality'); });
  panel.querySelector('[data-a=seed]')?.addEventListener('click', () => { state.seed = (Math.random() * 1e9) >>> 0; ui.onChange('seed'); });
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyH' && visible) panel.hidden = !panel.hidden; });
  return ui;
}
