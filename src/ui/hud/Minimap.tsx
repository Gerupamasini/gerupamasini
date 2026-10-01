import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { App } from '../../app/App';
import { ui } from '../store';

const SIZE = 200;
const SPAN_M = 160;
const SUB_COLORS = ['#b8a67e', '#8c7d62', '#5c5346', '#9a948a', '#4a443a'];

/** North-up minimap: substrate base, water at the current tide, pools, player arrow and view cone. */
export function Minimap({ app }: { app: App }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const world = app.world;
    if (!canvas || !world) return;
    const t = world.terrain, n = t.n;
    // base image: substrate colours shaded by height
    const base = document.createElement('canvas');
    base.width = n; base.height = n;
    const bctx = base.getContext('2d')!;
    const img = bctx.createImageData(n, n);
    for (let k = 0; k < n * n; k++) {
      const hex = SUB_COLORS[t.substrate[k]] ?? '#777';
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      const shade = 0.8 + 0.25 * Math.max(-1, Math.min(1, t.heights[k] / 2));
      img.data[k * 4] = r * shade; img.data[k * 4 + 1] = g * shade; img.data[k * 4 + 2] = b * shade; img.data[k * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    const water = document.createElement('canvas');
    water.width = n; water.height = n;
    const wctx = water.getContext('2d')!;
    const wimg = wctx.createImageData(n, n);
    const ctx = canvas.getContext('2d')!;
    let lastTide = NaN;
    const draw = () => {
      const w = app.world, p = app.player;
      if (!w || !p) return;
      if (Math.abs(w.tideLevel - lastTide) > 0.005) {
        lastTide = w.tideLevel;
        const spill = w.habitat.spill;
        for (let k = 0; k < n * n; k++) {
          const ground = t.heights[k];
          const level = spill[k] > lastTide && spill[k] > ground + 0.02 ? spill[k] : lastTide;
          const depth = level - ground;
          const o = k * 4;
          if (depth > 0) {
            const a = Math.min(0.85, 0.35 + depth * 0.5);
            wimg.data[o] = 40; wimg.data[o + 1] = 120; wimg.data[o + 2] = 150; wimg.data[o + 3] = Math.round(a * 255);
          } else wimg.data[o + 3] = 0;
        }
        wctx.putImageData(wimg, 0, 0);
      }
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
