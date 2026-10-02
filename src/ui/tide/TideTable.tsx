import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t } from '../store';
import { formatJst, jstMidnight, jstParts } from '../../core/Time';
import { tideName } from '../../core/Moon';
import { CardHead, MoonIcon } from '../common/Icons';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** 潮見表: seven days of highs and lows, the chosen day drawn as a 24 h curve with its extremes marked. */
export function TideTable({ app }: { app: App }) {
  const now = app.clock.nowGame();
  const today = jstMidnight(now);
  const [sel, setSel] = useState(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const start = today + i * 86400000;
    return { start, extrema: app.tide.extrema(start, start + 86400000) };
  }), [app, today]);
  const day = days[sel];
  const curve = useMemo(() => Array.from({ length: 97 }, (_, i) => ({ t: day.start + i * 900000, level: app.tide.level(day.start + i * 900000) })), [app, day]);
  const W = 600, H = 170, PAD = 14;
  const min = Math.min(...curve.map((p) => p.level)) - 0.12, max = Math.max(...curve.map((p) => p.level)) + 0.16;
  const x = (tt: number) => ((tt - day.start) / 86400000) * W;
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const d = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = sel === 0 ? x(now) : -10;
  return (
    <div class="screen center">
      <div class="card tide-table">
        <CardHead eyebrow={t('tidetable.sub')} title={t('home.tideTable')} onClose={() => app.closeOverlay()} />
        <div class="day-chips">
          {days.map((dd, i) => {
            const p = jstParts(dd.start);
            const noon = dd.start + 43200000;
            return (
              <button key={i} class={`chip ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
                <span class="num">{p.month}/{p.day} <span class="dim">{WD[p.weekday]}</span></span>
                <span class="sub"><MoonIcon ms={noon} size={12} /> {tideName(noon)}</span>
              </button>
            );
          })}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} class="tide-chart" aria-label="潮位の変化">
          <defs>
            <linearGradient id="tideTableGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgba(127, 227, 210, 0.3)" />
              <stop offset="1" stop-color="rgba(127, 227, 210, 0.02)" />
            </linearGradient>
          </defs>
          {[3, 6, 9, 12, 15, 18, 21].map((hh) => <line key={hh} x1={(hh / 24) * W} y1={PAD} x2={(hh / 24) * W} y2={H - PAD} class="grid" />)}
          <line x1={0} y1={y(0)} x2={W} y2={y(0)} class="zero" />
          <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#tideTableGrad)" />
          <path d={d} class="gauge-line" />
          {day.extrema.map((e, i) => (
            <g key={i}>
              <circle cx={x(e.t)} cy={y(e.level)} r={3} fill={e.kind === 'high' ? '#7fe3d2' : '#e8cf9a'} />
              <text x={x(e.t)} y={e.kind === 'high' ? y(e.level) - 8 : y(e.level) + 14} text-anchor="middle" class="ext">{formatJst(e.t)}</text>
            </g>
          ))}
          {nowX >= 0 && <line x1={nowX} y1={PAD} x2={nowX} y2={H - PAD} class="gauge-now" />}
          {[0, 6, 12, 18, 24].map((hh) => <text key={hh} x={Math.min(W - 10, Math.max(6, (hh / 24) * W))} y={H - 3} text-anchor="middle" class="axis">{hh}</text>)}
        </svg>
        <table class="extrema">
          <tbody>
            {day.extrema.map((e, i) => (
              <tr key={i}>
                <td class={`kind ${e.kind}`}>{e.kind === 'high' ? t('hud.high') : t('hud.low')}</td>
                <td class="num">{formatJst(e.t)}</td>
                <td class="num">{e.level >= 0 ? '+' : ''}{(e.level * 100).toFixed(0)} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
