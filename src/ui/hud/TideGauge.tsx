import { h } from 'preact';
import { ui, t } from '../store';
import { formatJst } from '../../core/Time';

/** 24 h tide curve with the current moment and the next high / low water. */
export function TideGauge() {
  const hud = ui.hud.value;
  const W = 220, H = 60;
  const pts = hud.tideCurve;
  if (!pts.length) return <div class="tide-gauge" />;
  const min = Math.min(...pts.map((p) => p.level)) - 0.1;
  const max = Math.max(...pts.map((p) => p.level)) + 0.1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  const nowX = W / 2;
  const nowY = y(hud.tideLevel);
  const next = hud.extrema.filter((e) => e.t > pts[Math.floor(pts.length / 2)].t).slice(0, 2);
  return (
    <div class="tide-gauge">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={`${d} L${W},${H} L0,${H} Z`} class="tide-fill" />
        <path d={d} class="tide-line" />
        <line x1={nowX} y1={0} x2={nowX} y2={H} class="tide-now" />
        <circle cx={nowX} cy={nowY} r={3.5} class="tide-dot" />
      </svg>
      <div class="tide-text">
        <span>{t('hud.tide')} <b>{hud.tideLevel >= 0 ? '+' : ''}{(hud.tideLevel * 100).toFixed(0)} cm</b> {hud.tideRate > 0.02 ? '↑ ' + t('hud.rising') : hud.tideRate < -0.02 ? '↓ ' + t('hud.falling') : ''}</span>
        <span class="dim small">
          {next.map((e) => `${e.kind === 'high' ? t('hud.high') : t('hud.low')} ${formatJst(e.t)}`).join('  ')}
        </span>
      </div>
    </div>
  );
}
