import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { ui } from '../store';
import { jstParts, jstToMs, formatJst } from '../../core/Time';

function toLocalInput(ms: number): string {
  const p = jstParts(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
function fromLocalInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return jstToMs(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

/** Debug mode (F3): free control of time, tide and weather, creature markers, teleports and render stats. */
export function DebugPanel({ app }: { app: App }) {
  const d = ui.debugState.value;
  const hud = ui.hud.value;
  const [timeInput, setTimeInput] = useState(() => toLocalInput(app.clock.nowGame()));
  const shift = (ms: number) => app.setDebugTime(app.clock.nowGame() + ms);
  return (
    <div class="debug-panel">
      <div class="debug-title">DEBUG <span class="dim small">F3 で閉じる</span></div>
      <div class="debug-row"><b>時刻</b> {hud.dateText} {hud.timeText} {d.timeOverride && <span class="warn">(固定中)</span>}</div>
      <div class="debug-row">
        <input type="datetime-local" value={timeInput} onInput={(e) => setTimeInput((e.target as HTMLInputElement).value)} />
        <button onClick={() => { const ms = fromLocalInput(timeInput); if (ms !== null) app.setDebugTime(ms); }}>設定</button>
      </div>
      <div class="debug-row seg">
        <button onClick={() => shift(-3600000)}>-1h</button>
        <button onClick={() => shift(-600000)}>-10m</button>
        <button onClick={() => shift(600000)}>+10m</button>
        <button onClick={() => shift(3600000)}>+1h</button>
        <button onClick={() => shift(86400000)}>+1日</button>
        <button onClick={() => app.setDebugTime(null)}>リアルに戻す</button>
      </div>
      <div class="debug-row">
        <label><input type="checkbox" checked={d.tideOverride !== null} onChange={(e) => app.setTideOverride((e.target as HTMLInputElement).checked ? hud.tideLevel : null)} /> 潮位を固定</label>
        <input type="range" min="-1.3" max="1.3" step="0.01" value={d.tideOverride ?? hud.tideLevel} disabled={d.tideOverride === null} onInput={(e) => app.setTideOverride(Number((e.target as HTMLInputElement).value))} />
        <b>{((d.tideOverride ?? hud.tideLevel) * 100).toFixed(0)} cm</b>
      </div>
      <div class="debug-row">
        <span>曇り</span>
        <input type="range" min="0" max="1" step="0.05" value={d.overcast} onInput={(e) => app.setOvercast(Number((e.target as HTMLInputElement).value))} />
        <b>{Math.round(d.overcast * 100)}%</b>
      </div>
      <div class="debug-row">
        <label><input type="checkbox" checked={d.markers} onChange={(e) => app.setMarkers((e.target as HTMLInputElement).checked)} /> 生物マーカー</label>
        <label><input type="checkbox" checked={app.settings.heroMaterials} onChange={(e) => void app.updateSettings({ heroMaterials: (e.target as HTMLInputElement).checked })} /> ヒーロー材質</label>
      </div>
      <div class="debug-row seg">
        <span>移動</span>
        <button onClick={() => app.teleport('spawn')}>浜</button>
        <button onClick={() => app.teleport('waterline')}>汀線</button>
        <button onClick={() => app.teleport('runnel')}>澪</button>
        <button onClick={() => app.teleport('creek')}>水路</button>
        <button onClick={() => app.teleport('pool')}>潮だまり</button>
        <button onClick={() => app.teleport('clams')}>貝床</button>
        <button onClick={() => app.teleport('oysters')}>牡蠣礁</button>
        <button onClick={() => app.teleport('amamo')}>アマモ場</button>
        <button onClick={() => app.forceSpawn()}>周囲に生物</button>
      </div>
      <div class="debug-row seg">
        <span>出す生物</span>
        <button onClick={() => app.setAllSpeciesShown(true)}>全部</button>
        <button onClick={() => app.setAllSpeciesShown(false)}>なし</button>
      </div>
      <div class="debug-row wrap">
        {[...app.data.species.values()].map((sp) => (
          <label key={sp.id}><input type="checkbox" checked={!d.hidden.includes(sp.id)} onChange={(e) => app.setSpeciesShown(sp.id, (e.target as HTMLInputElement).checked)} /> {sp.names.ja}</label>
        ))}
      </div>
      <div class="debug-row seg">
        <span>習熟</span>
        <button onClick={() => app.addMoney(500)}>+500 CR</button>
        {(['hand_net', 'shovel'] as const).map((id) => {
          const n = app.encyclopedia.skillCount(id), lv = app.encyclopedia.skillLevel(id);
          return (
            <span key={id} style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <b>{app.data.tools.get(id)?.ja ?? id} Lv{lv}</b><span class="dim small">({n})</span>
              <button onClick={() => app.setSkill(id, 0)}>0</button>
              <button onClick={() => app.setSkill(id, n + 5)}>+5</button>
              <button onClick={() => app.setSkill(id, 40)}>最大</button>
            </span>
          );
        })}
      </div>
      <div class="debug-row dim small">
        draw {d.stats.calls} / tris {(d.stats.tris / 1000).toFixed(0)}k / 生物 {d.stats.creatures}（表示 {d.stats.visible}、近距離 {d.stats.lod1}） / アサリ 近く {d.stats.clamsNear}（全 {d.stats.clamsTotal}） / マガキ 描画 {d.stats.oysters ?? '-'}（全 {d.stats.oystersTotal ?? 0}） / アマモ {d.stats.amamo ?? '-'} / {hud.fps} fps / 次の満干 {hud.extrema.slice(0, 2).map((e) => `${e.kind === 'high' ? '満' : '干'} ${formatJst(e.t)}`).join(' ')}
      </div>
    </div>
  );
}
