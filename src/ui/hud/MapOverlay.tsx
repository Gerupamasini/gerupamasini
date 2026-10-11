import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { makeBaseImage, WaterLayer, SUB_COLORS } from './mapImages';
import { CardHead } from '../common/Icons';

const PX = 720;

/** The whole flat, north up: substrate, water at the current tide, tide pools, the player and the way they face. */
export function MapOverlay({ app }: { app: App }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, world = app.world;
    if (!canvas || !world) return;
    const terrain = world.terrain, n = terrain.n;
    const base = makeBaseImage(world);
    const water = new WaterLayer(world);
    const ctx = canvas.getContext('2d')!;
    const scale = PX / terrain.size; // px per metre
    const toPx = (x: number, z: number) => [(x + terrain.half) * scale, (z + terrain.half) * scale] as const;
    const draw = () => {
      const p = app.player;
      if (!p) return;
      water.update();
      ctx.clearRect(0, 0, PX, PX);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, 0, 0, n, n, 0, 0, PX, PX);
      ctx.drawImage(water.canvas, 0, 0, n, n, 0, 0, PX, PX);
      // tide pools: label the larger ones
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      let labelled = 0;
      for (const pool of world.habitat.pools) {
        // only pools standing above the tide (a drowned hollow is just sea), the eight largest
        if (pool.area < 20 || pool.level < world.tideLevel + 0.02) continue;
        if (++labelled > 8) break;
        const [x, z] = toPx(pool.cx, pool.cz);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(t('map.legend.pool'), x, z - 6);
      }
      // clam beds (debug): rings on the sand where the siphon holes are
      if (ui.debug.value && app.clams) {
        ctx.strokeStyle = 'rgba(232,207,154,0.9)';
        ctx.lineWidth = 1;
        for (const b of app.clams.beds) {
          const [x, z] = toPx(b.x, b.z);
          ctx.beginPath(); ctx.arc(x, z, Math.max(2, b.r * scale), 0, Math.PI * 2); ctx.stroke();
        }
      }
      // creatures (debug)
      if (ui.debug.value && ui.debugState.value.markers && app.creatures) {
        for (const ind of app.creatures.individuals) {
          const [x, z] = toPx(ind.pos.x, ind.pos.z);
          ctx.fillStyle = ind.species.taxon.group === 'bird' ? '#ffd27a' : ind.species.taxon.group === 'fish' ? '#8ef0e0' : '#f0b0ff';
          ctx.beginPath(); ctx.arc(x, z, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // player: view cone and arrow
      const [px, pz] = toPx(p.position.x, p.position.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-p.yaw);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 70, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(t('map.you'), px, pz + 24);
      // compass and scale
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('N', PX / 2, 18);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillRect(PX - 20 - 100 * scale, PX - 18, 100 * scale, 2);
      ctx.fillText('100 m', PX - 20 - 50 * scale, PX - 24);
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, [app, app.world]);
  const legend: [string, string][] = [
    [SUB_COLORS[0], t('map.legend.sand')], [SUB_COLORS[1], t('map.legend.muddy')], [SUB_COLORS[2], t('map.legend.mud')],
    ['rgb(40,120,150)', t('map.legend.water')], ['rgb(70,150,165)', t('map.legend.pool')],
  ];
  return (
    <div class="map-overlay" onClick={(e) => { if (e.target === e.currentTarget) app.toggleMap(); }}>
      <div class="map-card glass">
        <CardHead title={t('map.title')} onClose={() => app.toggleMap()} closeKey="M" />
        <canvas ref={ref} class="map-canvas" width={PX} height={PX} />
        <div class="map-legend">{legend.map(([c, label]) => <span key={label}><i style={{ background: c }} />{label}</span>)}</div>
      </div>
    </div>
  );
}
