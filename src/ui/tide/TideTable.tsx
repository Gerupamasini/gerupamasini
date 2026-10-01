import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t } from '../store';
import { formatJst, jstMidnight, jstParts } from '../../core/Time';
import { moonEmoji, tideName } from '../../core/Moon';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** 潮見表: seven days of highs and lows with a 24 h curve for the selected day. */
export function TideTable({ app }: { app: App }) {
  const now = app.clock.nowGame();
  const today = jstMidnight(now);
  const [sel, setSel] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const start = today + i * 86400000;
    return { start, extrema: app.tide.extrema(start, start + 86400000) };
  }), [app, today]);
  const day = days[sel];
  const curve = useMemo(() => Array.from({ length: 49 }, (_, i) => ({ t: day.start + i * 1800000, level: app.tide.level(day.start + i * 1800000) })), [app, day]);
  const W = 560, H = 140;
  const min = Math.min(...curve.map((p) => p.level)) - 0.1, max = Math.max(...curve.map((p) => p.level)) + 0.1;
  const x = (i: number) => (i / 48) * W, y = (v: number) => H - ((v - min) / (max - min)) * H;
  const d = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = sel === 0 ? ((now - today) / 86400000) * W : -10;
  const station = app.tide.station.names.ja;
  return (
    <div class="screen center">
      <div class="card tide-table">
        <div class="row"><h2>{t('home.tideTable')} <span class="dim small">{station} / 気象庁の調和定数による予測</span></h2><button onClick={() => app.closeOverlay()}>{t('zukan.close')}</button></div>
        <div class="tide-days">
          {days.map((dd, i) => {
            const p = jstParts(dd.start);
            return (
              <button key={i} class={i === sel ? 'on' : ''} onClick={() => setSel(i)}>
                <div>{p.month}/{p.day} ({WD[p.weekday]})</div>
                <div class="small">{moonEmoji(dd.start + 43200000)} {tideName(dd.start + 43200000)}</div>
              </button>
            );
          })}
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} class="tide-svg">
          <line x1={0} y1={y(0)} x2={W} y2={y(0)} class="tide-zero" />
          <path d={`${d} L${W},${H} L0,${H} Z`} class="tide-fill" />
          <path d={d} class="tide-line" />
          {nowX >= 0 && <line x1={nowX} y1={0} x2={nowX} y2={H} class="tide-now" />}
          {[0, 6, 12, 18, 24].map((hh) => <text key={hh} x={(hh / 24) * W} y={H - 4} class="tide-axis">{hh}</text>)}
        </svg>
        <table class="tide-list">
          <tbody>
            {day.extrema.map((e, i) => (
              <tr key={i}><td>{e.kind === 'high' ? t('hud.high') : t('hud.low')}</td><td>{formatJst(e.t)}</td><td>{e.level >= 0 ? '+' : ''}{(e.level * 100).toFixed(0)} cm</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
