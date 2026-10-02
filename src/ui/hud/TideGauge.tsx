import { h } from 'preact';
import { ui, t } from '../store';
import { formatJst } from '../../core/Time';
import { TrendIcon } from '../common/Icons';

/** 24 h tide curve around now, with the current level, its trend and the next high / low water. */
export function TideGauge({ variant = 'hud' }: { variant?: 'hud' | 'almanac' }) {
  const hud = ui.hud.value;
  const W = 236, H = 64;
  const pts = hud.tideCurve;
  if (!pts.length) return <div class="gauge" />;
  const min = Math.min(...pts.map((p) => p.level)) - 0.1;
  const max = Math.max(...pts.map((p) => p.level)) + 0.1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - min) / (max - min)) * (H - 12);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = W / 2;
  const nowY = y(hud.tideLevel);
  const next = hud.extrema.filter((e) => e.t > pts[Math.floor(pts.length / 2)].t).slice(0, 2);
  const trend: 'up' | 'down' | 'flat' = hud.tideRate > 0.02 ? 'up' : hud.tideRate < -0.02 ? 'down' : 'flat';
  const id = `tideGrad-${variant}`;
  return (
    <div class={`gauge ${variant}`}>
      <div class="gauge-head">
        <div class="gauge-level">
          <span class="dim small">{t('hud.tide')}</span>
          <span class="num">{hud.tideLevel >= 0 ? '+' : ''}{(hud.tideLevel * 100).toFixed(0)}</span>
          <span class="unit">cm</span>
        </div>
        <span class="gauge-trend"><TrendIcon dir={trend} />{trend === 'up' ? t('hud.rising') : trend === 'down' ? t('hud.falling') : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="rgba(127, 227, 210, 0.28)" />
            <stop offset="1" stop-color="rgba(127, 227, 210, 0.02)" />
          </linearGradient>
        </defs>
        <line x1={0} y1={y(0)} x2={W} y2={y(0)} class="gauge-grid" />
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
        <path d={d} class="gauge-line" />
        <line x1={nowX} y1={4} x2={nowX} y2={H - 4} class="gauge-now" />
        <circle cx={nowX} cy={nowY} r={7} class="gauge-dot-halo" />
        <circle cx={nowX} cy={nowY} r={3} class="gauge-dot" />
      </svg>
      <div class="gauge-next">
        {next.map((e) => (
          <span key={e.t}>{e.kind === 'high' ? t('hud.high') : t('hud.low')} <span class="num">{formatJst(e.t)}</span></span>
        ))}
      </div>
    </div>
  );
}
