import { h } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { formatJst, jstMidnight, jstParts } from '../../core/Time';
import { tideName } from '../../core/Moon';
import { dailyTides, DAY_MS, julySpringLows } from '../../tide/calendar';
import { DateCalendar } from './DateCalendar';
import './tide.css';
import { tidePhaseAt, type TidePhase } from '../../tide/TideModel';
import { CardHead, MoonIcon } from '../common/Icons';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const DAY = DAY_MS, SNAP = 600000;

/** Choose any JST calendar date and reproduce a predicted tide with a ticket. */
export function TideTable({ app }: { app: App }) {
  const now = app.clock.nowReal();
  const today = jstMidnight(now);
  const [sel, setSel] = useState(() => jstMidnight(app.clock.nowGame()));
  const [calendar, setCalendar] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const day = useMemo(() => ({ start: sel, extrema: dailyTides(app.tide, sel) }), [app.tide, sel]);
  const year = jstParts(sel).year;
  const recommended = useMemo(() => julySpringLows(app.tide, year), [app.tide, year]);
  const selectDay = (ms: number) => { setSel(jstMidnight(ms)); setPick(null); setHover(null); setCalendar(false); };
  const curve = useMemo(() => Array.from({ length: 97 }, (_, i) => ({ t: day.start + i * 900000, level: app.tide.level(day.start + i * 900000) })), [app, day]);
  const W = 600, H = 170, PAD = 14;
  const min = Math.min(...curve.map((p) => p.level)) - 0.12, max = Math.max(...curve.map((p) => p.level)) + 0.16;
  const x = (tt: number) => ((tt - day.start) / DAY) * W;
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const d = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = sel === today ? x(now) : -10;
  const active = ui.hud.value.ticket;
  const level = (ms: number) => app.tide.level(ms);
  const cm = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`;
  /** the moment under the pointer, snapped to ten minutes */
  const timeAt = (e: MouseEvent): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0) return day.start;
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return day.start + Math.min(DAY - SNAP, Math.round((u * DAY) / SNAP) * SNAP);
  };
  const confirm = () => {
    if (pick === null) return;
    if (app.useTicket(pick)) app.closeOverlay();
    else setPick(null);
  };
  const phaseWord = (ph: TidePhase) => ph === 'high' ? t('hud.high') : ph === 'low' ? t('hud.low') : ph === 'rising' ? t('hud.rising') : t('hud.falling');
  const hoverLevel = hover !== null ? level(hover) : 0;
  return (
    <div class="screen center">
      <div class={`card tide-table ${active ? 'ticket-active' : ''}`}>
        <CardHead eyebrow={t('tidetable.sub').replace('{station}', app.tide.station.names.ja)} title={t('home.tideTable')} onClose={() => app.closeOverlay()} />
        {active && (
          <p class="warn ticket-now">
            <span class="ticket-status">{t('ticket.active')} ・ <span class="num">{active.targetText}</span><span class="ticket-remaining">（{t('ticket.remaining')} <span class="num">{Math.floor(active.remainingSec / 60)}</span> 分）</span></span>
            <button class="btn small" onClick={() => { app.cancelTicket(); app.closeOverlay(); }}>{t('ticket.cancel')}</button>
          </p>
        )}
        <div class="tide-date-nav">
          <button class="btn ghost" aria-label="前の日" disabled={year === 1 && jstParts(sel).month === 1 && jstParts(sel).day === 1} onClick={() => selectDay(sel - DAY)}>‹</button>
          <button class="btn tide-date-select" aria-expanded={calendar} onClick={() => setCalendar(true)}>
            <span class="num">{year}年{jstParts(sel).month}月{jstParts(sel).day}日（{WD[jstParts(sel).weekday]}）</span>
            <span class="small"><MoonIcon ms={sel + DAY / 2} size={14} /> {tideName(sel + DAY / 2)} ▾</span>
          </button>
          <button class="btn ghost" aria-label="次の日" disabled={year === 9999 && jstParts(sel).month === 12 && jstParts(sel).day === 31} onClick={() => selectDay(sel + DAY)}>›</button>
          <button class="btn ghost tide-today" onClick={() => selectDay(today)}>{t('tidetable.today')}</button>
        </div>
        <div class="tide-table-layout"><div class="tide-day-view">
        <svg
          ref={svg} viewBox={`0 0 ${W} ${H}`} class="tide-chart pickable" aria-label="潮位の変化"
          onMouseMove={(e) => setHover(timeAt(e as unknown as MouseEvent))} onMouseLeave={() => setHover(null)} onClick={(e) => setPick(timeAt(e as unknown as MouseEvent))}
        >
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
              <text x={Math.max(20, Math.min(W - 20, x(e.t)))} y={e.kind === 'high' ? y(e.level) - 8 : y(e.level) + 14} text-anchor="middle" class="ext">{formatJst(e.t)}</text>
            </g>
          ))}
          {nowX >= 0 && <line x1={nowX} y1={PAD} x2={nowX} y2={H - PAD} class="gauge-now" />}
          {hover !== null && (
            <g class="hover">
              <line x1={x(hover)} y1={PAD} x2={x(hover)} y2={H - PAD} class="pick-line" />
              <circle cx={x(hover)} cy={y(hoverLevel)} r={7} fill="rgba(127, 227, 210, 0.25)" />
              <circle cx={x(hover)} cy={y(hoverLevel)} r={3.2} fill="#fff" />
              <text x={Math.max(34, Math.min(W - 34, x(hover)))} y={PAD + 10} text-anchor="middle" class="pick-label">{formatJst(hover)} {cm(hoverLevel)} cm</text>
            </g>
          )}
          {[0, 6, 12, 18, 24].map((hh) => <text key={hh} x={Math.min(W - 10, Math.max(6, (hh / 24) * W))} y={H - 3} text-anchor="middle" class="axis">{hh}</text>)}
        </svg>
        <p class="dim small pick-hint">{t('tidetable.pickHint')}</p>
        <div class="tide-extrema" aria-label="満潮・干潮の時刻">
          {day.extrema.map((e) => <button key={e.t} class={`btn tide-extremum ${e.kind}`} onClick={() => setPick(e.t)}>
            <span>{e.kind === 'high' ? t('hud.high') : t('hud.low')} <b class="num">{formatJst(e.t)}</b></span>
            <span class="num">{cm(e.level)} cm</span>
          </button>)}
        </div>
        </div><section class="tide-recommendations" aria-label="７月の大潮のおすすめ">
          <h3>{year}年7月の大潮</h3>
          <p class="dim small">干潮が低い日のおすすめ（JST）</p>
          <div class="tide-recommendation-list">
            {recommended.map((e) => { const p = jstParts(e.t); return <button class="btn tide-recommendation" key={e.t} data-tide-time={e.t} onClick={() => { selectDay(e.t); setPick(e.t); }}>
              <span>{p.month}/{p.day}（{WD[p.weekday]}）</span><b class="num">干潮 {formatJst(e.t)}</b><span class="num">{cm(e.level)} cm</span>
            </button>; })}
          </div>
        </section></div>
        {calendar && <DateCalendar selected={sel} today={today} onSelect={selectDay} onClose={() => setCalendar(false)} />}
        {pick !== null && (
          <div class="tide-confirm" role="dialog" aria-label={t('ticket.confirmTitle')} onClick={(e) => { if (e.target === e.currentTarget) setPick(null); }}>
            <div class="confirm-card">
              <div class="eyebrow">{t('ticket.title')}</div>
              <h3>{t('ticket.confirmTitle')}</h3>
              <div class="when num">{jstParts(pick).year}年 {formatJst(pick, { date: true })}（JST）</div>
              <div class="facts">
                <div><span class="dim">{t('hud.tide')}</span><b class="num">{cm(level(pick))}<span class="unit">cm</span></b></div>
                <div><span class="dim">{t('tidetable.phase')}</span><b>{phaseWord(tidePhaseAt(level, app.tide.extrema(pick - DAY, pick + DAY), pick))}</b></div>
                <div><span class="dim">{t('ticket.durationLabel')}</span><b>{t('ticket.duration')}</b></div>
              </div>
              <p class="dim small">{t('ticket.confirmDesc')}</p>
              <div class="buttons">
                <button class="btn primary" onClick={confirm}>{t('ticket.use')}</button>
                <button class="btn ghost" onClick={() => setPick(null)}>{t('ticket.no')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
