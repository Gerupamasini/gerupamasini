import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { jstMidnight, jstParts, formatJst } from '../../core/Time';
import { TICKET_RANGE_DAYS } from '../../core/GameClock';

export function TicketDialog({ app }: { app: App }) {
  const now = app.clock.nowReal();
  const today = jstMidnight(now);
  const [dayOffset, setDayOffset] = useState(0);
  const [minutes, setMinutes] = useState(() => { const p = jstParts(now); return p.hour * 60 + Math.floor(p.minute / 10) * 10; });
  const target = today + dayOffset * 86400000 + minutes * 60000;
  const tide = app.world?.tide;
  const extrema = useMemo(() => (tide ? tide.extrema(today + dayOffset * 86400000, today + (dayOffset + 1) * 86400000) : []), [tide, today, dayOffset]);
  const level = tide ? tide.level(target) : 0;
  const active = ui.hud.value.ticket;
  const days: number[] = [];
  for (let d = -TICKET_RANGE_DAYS; d <= TICKET_RANGE_DAYS; d++) days.push(d);
  return (
    <div class="screen center">
      <div class="card wide">
        <h2>{t('ticket.title')}</h2>
        <p class="dim">{t('ticket.desc')}</p>
        {active && <p class="warn">{t('ticket.active')}: {active.targetText}（{t('ticket.remaining')} {Math.floor(active.remainingSec / 60)} 分）</p>}
        <div class="row">
          <div class="seg">
            {days.map((d) => (
              <button key={d} class={d === dayOffset ? 'on' : ''} onClick={() => setDayOffset(d)}>{d === 0 ? '今日' : d > 0 ? `+${d}日` : `${d}日`}</button>
            ))}
          </div>
        </div>
        <div class="row">
          <input type="range" min="0" max="1430" step="10" value={minutes} onInput={(e) => setMinutes(Number((e.target as HTMLInputElement).value))} style={{ flex: 1 }} />
          <b style={{ minWidth: '5em', textAlign: 'right' }}>{String(Math.floor(minutes / 60)).padStart(2, '0')}:{String(minutes % 60).padStart(2, '0')}</b>
        </div>
        <div class="row">
          <span>{formatJst(target, { date: true })}</span>
          <span>{t('hud.tide')} <b>{level >= 0 ? '+' : ''}{(level * 100).toFixed(0)} cm</b></span>
        </div>
        <div class="dim small">
          {extrema.map((e) => `${e.kind === 'high' ? t('hud.high') : t('hud.low')} ${formatJst(e.t)} (${(e.level * 100).toFixed(0)} cm)`).join(' / ')}
        </div>
        <div class="buttons">
          <button class="primary" onClick={() => { if (app.useTicket(target)) app.closeOverlay(); }}>{t('ticket.use')}</button>
          {active && <button onClick={() => { app.cancelTicket(); app.closeOverlay(); }}>{t('ticket.cancel')}</button>}
          <button onClick={() => app.closeOverlay()}>{t('menu.resume')}</button>
        </div>
      </div>
    </div>
  );
}
