import { h } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { formatJst, jstMidnight, jstParts } from '../../core/Time';
import { tideName } from '../../core/Moon';
import { TICKET_RANGE_DAYS } from '../../core/GameClock';
import { tidePhaseAt, type TidePhase } from '../../tide/TideModel';
import { CardHead, MoonIcon } from '../common/Icons';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const DAY = 86400000, SNAP = 600000;

/**
 * 潮見表: three days either side of today, the chosen day drawn as a 24 h curve with its extremes marked. It is also
 * where the 潮時チケット is used: a click on the curve (to ten minutes) or on a high or low picks that moment, and a
 * confirmation card asks before the flat is set to it.
 */
export function TideTable({ app }: { app: App }) {
  const now = app.clock.nowReal();
  const today = jstMidnight(now);
  const [sel, setSel] = useState(TICKET_RANGE_DAYS);
  const [hover, setHover] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const days = useMemo(() => Array.from({ length: TICKET_RANGE_DAYS * 2 + 1 }, (_, i) => {
    const start = today + (i - TICKET_RANGE_DAYS) * DAY;
    return { start, extrema: app.tide.extrema(start, start + DAY) };
  }), [app, today]);
  const day = days[sel];
  const curve = useMemo(() => Array.from({ length: 97 }, (_, i) => ({ t: day.start + i * 900000, level: app.tide.level(day.start + i * 900000) })), [app, day]);
  const W = 600, H = 170, PAD = 14;
  const min = Math.min(...curve.map((p) => p.level)) - 0.12, max = Math.max(...curve.map((p) => p.level)) + 0.16;
  const x = (tt: number) => ((tt - day.start) / DAY) * W;
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const d = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = sel === TICKET_RANGE_DAYS ? x(now) : -10;
  const active = ui.hud.value.ticket;
  const level = (ms: number) => app.tide.level(ms);
  const cm = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`;
  /** the moment under the pointer, snapped to ten minutes */
  const timeAt = (e: MouseEvent): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0) return day.start;
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return day.start + Math.round((u * DAY) / SNAP) * SNAP;
  };
  const inRange = (ms: number) => Math.abs(ms - now) <= TICKET_RANGE_DAYS * DAY;
  const confirm = () => {
    if (pick === null) return;
    if (app.useTicket(pick)) app.closeOverlay();
    else setPick(null);
  };
  const phaseWord = (ph: TidePhase) => ph === 'high' ? t('hud.high') : ph === 'low' ? t('hud.low') : ph === 'rising' ? t('hud.rising') : t('hud.falling');
  const hoverLevel = hover !== null ? level(hover) : 0;
  return (
    <div class="screen center">
      <div class="card tide-table">
        <CardHead eyebrow={t('tidetable.sub')} title={t('home.tideTable')} onClose={() => app.closeOverlay()} />
        {active && (
          <p class="warn ticket-now">
            {t('ticket.active')} ・ <span class="num">{active.targetText}</span>（{t('ticket.remaining')} <span class="num">{Math.floor(active.remainingSec / 60)}</span> 分）
            <button class="btn small" onClick={() => { app.cancelTicket(); app.closeOverlay(); }}>{t('ticket.cancel')}</button>
          </p>
        )}
        <div class="day-chips">
          {days.map((dd, i) => {
            const p = jstParts(dd.start);
            const noon = dd.start + DAY / 2;
            const rel = i - TICKET_RANGE_DAYS;
            return (
              <button key={i} class={`chip ${i === sel ? 'on' : ''} ${rel < 0 ? 'past' : ''}`} onClick={() => setSel(i)}>
                <span class="num">{p.month}/{p.day} <span class="dim">{WD[p.weekday]}</span></span>
                <span class="sub"><MoonIcon ms={noon} size={12} /> {rel === 0 ? t('tidetable.today') : tideName(noon)}</span>
              </button>
            );
          })}
        </div>
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
        <table class="extrema">
          <tbody>
            {day.extrema.map((e, i) => (
              <tr key={i} class="pickable" onClick={() => setPick(e.t)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') setPick(e.t); }}>
                <td class={`kind ${e.kind}`}>{e.kind === 'high' ? t('hud.high') : t('hud.low')}</td>
                <td class="num">{formatJst(e.t)}</td>
                <td class="num">{cm(e.level)} cm</td>
                <td class="go">{t('ticket.useShort')} ›</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pick !== null && (
          <div class="tide-confirm" role="dialog" aria-label={t('ticket.confirmTitle')} onClick={(e) => { if (e.target === e.currentTarget) setPick(null); }}>
            <div class="confirm-card">
              <div class="eyebrow">{t('ticket.title')}</div>
              <h3>{t('ticket.confirmTitle')}</h3>
              <div class="when num">{formatJst(pick, { date: true })}</div>
              <div class="facts">
                <div><span class="dim">{t('hud.tide')}</span><b class="num">{cm(level(pick))}<span class="unit">cm</span></b></div>
                <div><span class="dim">{t('tidetable.phase')}</span><b>{phaseWord(tidePhaseAt(level, days.flatMap((dd) => dd.extrema), pick))}</b></div>
                <div><span class="dim">{t('ticket.durationLabel')}</span><b>{t('ticket.duration')}</b></div>
              </div>
              <p class="dim small">{inRange(pick) ? t('ticket.confirmDesc') : t('ticket.outOfRange')}</p>
              <div class="buttons">
                <button class="btn primary" disabled={!inRange(pick)} onClick={confirm}>{t('ticket.use')}</button>
                <button class="btn ghost" onClick={() => setPick(null)}>{t('ticket.no')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
