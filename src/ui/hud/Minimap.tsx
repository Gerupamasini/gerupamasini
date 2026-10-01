import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { App } from '../../app/App';
import { ui } from '../store';
import { makeBaseImage, WaterLayer } from './mapImages';

const SIZE = 200;
const SPAN_M = 160;

/** North-up minimap: substrate base, water at the current tide, pools, player arrow and view cone. */
export function Minimap({ app }: { app: App }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const world = app.world;
    if (!canvas || !world) return;
    const t = world.terrain, n = t.n;
    const base = makeBaseImage(world);
    const waterLayer = new WaterLayer(world);
    const water = waterLayer.canvas;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const w = app.world, p = app.player;
      if (!w || !p) return;
      waterLayer.update();
      const px = p.position.x, pz = p.position.z;
      const scale = SIZE / SPAN_M; // px per metre
      const cells = SPAN_M / t.cell; // grid cells across the view
      const gx = (px + t.half) / t.cell, gz = (pz + t.half) / t.cell;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#0a1418';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, gx - cells / 2, gz - cells / 2, cells, cells, 0, 0, SIZE, SIZE);
      ctx.drawImage(water, gx - cells / 2, gz - cells / 2, cells, cells, 0, 0, SIZE, SIZE);
      // creatures (debug)
      if (ui.debug.value && ui.debugState.value.markers && app.creatures) {
        for (const ind of app.creatures.individuals) {
          const dx = (ind.pos.x - px) * scale, dz = (ind.pos.z - pz) * scale;
          if (Math.hypot(dx, dz) > SIZE / 2) continue;
          ctx.fillStyle = ind.species.taxon.group === 'bird' ? '#ffd27a' : ind.species.taxon.group === 'fish' ? '#8ef0e0' : '#f0b0ff';
          ctx.beginPath(); ctx.arc(SIZE / 2 + dx, SIZE / 2 + dz, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      }
      // view cone and player
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(-p.yaw);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', SIZE / 2, 13);
      ctx.font = '10px sans-serif';
      ctx.fillText('50 m', SIZE / 2, SIZE - 5);
      ctx.fillRect(SIZE / 2 - 25 * scale, SIZE - 16, 50 * scale, 2);
    };
    draw();
    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [app, app.world]);
  return <canvas ref={ref} class="minimap" width={SIZE} height={SIZE} />;
}
