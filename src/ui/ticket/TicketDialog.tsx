import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { jstMidnight, jstParts, formatJst } from '../../core/Time';
import { TICKET_RANGE_DAYS } from '../../core/GameClock';
import { CardHead } from '../common/Icons';

/** 潮時チケット: pick a day and a time; the flat is shown at that tide and sun for 30 minutes. */
export function TicketDialog({ app }: { app: App }) {
  const now = app.clock.nowReal();
  const today = jstMidnight(now);
  const [dayOffset, setDayOffset] = useState(0);
  const [minutes, setMinutes] = useState(() => { const p = jstParts(now); return p.hour * 60 + Math.floor(p.minute / 10) * 10; });
  const target = today + dayOffset * 86400000 + minutes * 60000;
  const tide = app.world?.tide ?? app.tide;
  const extrema = useMemo(() => tide.extrema(today + dayOffset * 86400000, today + (dayOffset + 1) * 86400000), [tide, today, dayOffset]);
  const level = tide.level(target);
  const active = ui.hud.value.ticket;
  const days: number[] = [];
  for (let d = -TICKET_RANGE_DAYS; d <= TICKET_RANGE_DAYS; d++) days.push(d);
  return (
    <div class="screen center">
      <div class="card wide ticket">
        <CardHead eyebrow={t('ticket.desc')} title={t('ticket.title')} onClose={() => app.closeOverlay()} />
        {active && <p class="warn">{t('ticket.active')} ・ <span class="num">{active.targetText}</span>（{t('ticket.remaining')} <span class="num">{Math.floor(active.remainingSec / 60)}</span> 分）</p>}
        <h4>{t('ticket.pick')}</h4>
        <div class="seg" style={{ flexWrap: 'wrap' }}>
          {days.map((d) => (
            <button key={d} class={d === dayOffset ? 'on' : ''} onClick={() => setDayOffset(d)}>{d === 0 ? '今日' : d > 0 ? `+${d}日` : `${d}日`}</button>
          ))}
        </div>
        <div class="timebar">
          <input type="range" min="0" max="1430" step="10" value={minutes} onInput={(e) => setMinutes(Number((e.target as HTMLInputElement).value))} aria-label="時刻" />
          <span class="num">{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</span>
        </div>
        <div class="target">
          <span class="when num">{formatJst(target, { date: true })}</span>
          <span class="lvl"><span class="dim small">{t('hud.tide')}</span> <span class="num">{level >= 0 ? '+' : ''}{(level * 100).toFixed(0)}</span><span class="unit">cm</span></span>
        </div>
        <div class="ext-line">
          {extrema.map((e, i) => <span key={i}>{e.kind === 'high' ? t('hud.high') : t('hud.low')} <span class="num">{formatJst(e.t)}</span> <span class="num">{e.level >= 0 ? '+' : ''}{(e.level * 100).toFixed(0)} cm</span></span>)}
        </div>
        <div class="buttons">
          <button class="btn primary" onClick={() => { if (app.useTicket(target)) app.closeOverlay(); }}>{t('ticket.use')}</button>
          {active && <button class="btn" onClick={() => { app.cancelTicket(); app.closeOverlay(); }}>{t('ticket.cancel')}</button>}
          <button class="btn ghost" onClick={() => app.closeOverlay()}>{t('menu.resume')}</button>
        </div>
      </div>
    </div>
  );
}
