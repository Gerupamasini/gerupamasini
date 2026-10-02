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
