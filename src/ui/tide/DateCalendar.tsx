import { useEffect, useRef, useState } from 'preact/hooks';
import { jstParts, jstToMs } from '../../core/Time';
import { calendarDays, dateInputValue, parseJstDate } from '../../tide/calendar';
import { CloseIcon } from '../common/Icons';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function DateCalendar({ selected, today, onSelect, onClose }: { selected: number; today: number; onSelect: (ms: number) => void; onClose: () => void }) {
  const [month, setMonth] = useState(() => { const p = jstParts(selected); return jstToMs(p.year, p.month, 1); });
  const panel = useRef<HTMLDivElement>(null);
  const p = jstParts(month), value = dateInputValue(month).slice(0, 7);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  const move = (delta: number) => {
    const next = jstToMs(p.year, p.month + delta, 1);
    if (jstParts(next).year >= 1 && jstParts(next).year <= 9999) setMonth(next);
  };
  return <div class="tide-calendar-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="tide-calendar-card" ref={panel} role="dialog" aria-modal="true" aria-label="日付を選ぶ" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div class="calendar-sidebar">
        <div class="calendar-heading"><h3>日付を選ぶ</h3><button class="icon-btn" aria-label="カレンダーを閉じる" onClick={onClose}><CloseIcon /></button></div>
        <div class="calendar-month-nav">
          <button class="btn ghost calendar-prev" aria-label="前の月" disabled={p.year === 1 && p.month === 1} onClick={() => move(-1)}>‹</button>
          <input type="month" value={value} min="0001-01" max="9999-12" aria-label="カレンダーの年月" onInput={(e) => { const ms = parseJstDate(`${e.currentTarget.value}-01`); if (ms !== null) setMonth(ms); }} />
          <button class="btn ghost calendar-next" aria-label="次の月" disabled={p.year === 9999 && p.month === 12} onClick={() => move(1)}>›</button>
        </div>
        <button class="btn ghost calendar-today" onClick={() => onSelect(today)}>今日の潮見表</button>
      </div>
      <div class="calendar-grid">
        {WD.map((day) => <span class="calendar-weekday" key={day}>{day}</span>)}
        {calendarDays(p.year, p.month).map((ms, i) => ms === null ? <span key={`blank-${i}`} /> : <button class={`btn calendar-day ${ms === selected ? 'on' : ''} ${ms === today ? 'today' : ''}`} key={ms} data-calendar-date={dateInputValue(ms)} aria-label={dateInputValue(ms)} aria-pressed={ms === selected} onClick={() => onSelect(ms)}>{jstParts(ms).day}</button>)}
      </div>
    </div>
  </div>;
}
