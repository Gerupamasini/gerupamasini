import { h } from 'preact';
import { moonAge } from '../../core/Moon';

/** The moon as a drawn phase (the lit part of the disc), not an emoji that renders differently everywhere. */
export function MoonIcon({ ms, size = 14 }: { ms: number; size?: number }) {
  const age = moonAge(ms);
  const p = age / 29.530588853;           // 0 new → 0.5 full → 1 new
  const r = 7, cx = 8, cy = 8;
  // terminator: an ellipse whose x-radius follows the phase; which half is lit depends on waxing / waning
  const k = Math.cos(p * Math.PI * 2);    // 1 new, -1 full
  const waxing = p < 0.5;
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = (k > 0) === waxing ? 0 : 1;
  const d = `M${cx},${cy - r} A${r},${r} 0 0 ${sweepOuter} ${cx},${cy + r} A${rx.toFixed(2)},${r} 0 0 ${sweepInner} ${cx},${cy - r} Z`;
  return (
    <svg class="moon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1" />
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

export function TrendIcon({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'flat') return <span class="trend flat" aria-hidden="true">—</span>;
  return (
    <svg class={`trend ${dir}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      {dir === 'up' ? <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /> : <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />}
    </svg>
  );
}

/** A keyboard key, as drawn on a keycap. */
export function Key({ k }: { k: string }) {
  return <kbd class="key">{k}</kbd>;
}

export function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span class="keyhint">
      <span class="keys">{keys.map((k) => <Key key={k} k={k} />)}</span>
      <span>{label}</span>
    </span>
  );
}

/** Overlay card header: eyebrow + title on the left, an optional aside, and a round close button with its key. */
export function CardHead({ eyebrow, title, aside, onClose, closeKey = 'Esc' }: { eyebrow?: string; title: string; aside?: h.JSX.Element | string | null; onClose: () => void; closeKey?: string }) {
  return (
    <header class="card-head">
      <div class="card-head-text">
        {eyebrow && <div class="eyebrow">{eyebrow}</div>}
        <h2 class="card-title">{title}</h2>
      </div>
      {aside && <div class="card-aside">{aside}</div>}
      <button class="icon-btn" onClick={onClose} aria-label="閉じる" title={`閉じる (${closeKey})`}>
        <CloseIcon />
        <kbd class="key">{closeKey}</kbd>
      </button>
    </header>
  );
}

const ico = (d: string, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export function BookIcon({ size = 20 }: { size?: number }) { return ico('M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2V5.5Z', size); }
export function CartIcon({ size = 20 }: { size?: number }) { return ico('M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', size); }
export function CapsuleIcon({ size = 20 }: { size?: number }) { return ico('M4 12a8 8 0 0 1 16 0 M4 12a8 8 0 0 0 16 0 M4 12h16 M12 4v3 M12 17v3', size); }
export function ToolboxIcon({ size = 20 }: { size?: number }) { return ico('M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z M9 9V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V9 M3 13h18 M10 12v2 M14 12v2', size); }
export function TankIcon({ size = 20 }: { size?: number }) { return ico('M3 7h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3 10c3 0 3 1.5 6 1.5s3-1.5 6-1.5 3 1.5 6 1.5 M8 15c1 0 1.5-.8 2.5-.8s1.5.8 2.5.8', size); }
export function CalendarIcon({ size = 20 }: { size?: number }) { return ico('M4 6h16v14H4V6Z M4 10h16 M8 3v5 M16 3v5 M8 14h2 M12 14h2 M16 14h2', size); }
export function MapPinIcon({ size = 20 }: { size?: number }) { return ico('M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', size); }
