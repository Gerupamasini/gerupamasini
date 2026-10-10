import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import type { SpotDef } from '../../data/schemas';
import { t, ui } from '../store';
import { CardHead, Key } from '../common/Icons';

// a rough outline of the four main islands (lon, lat), enough to read as Japan at this size
const HOKKAIDO: [number, number][] = [[141.0, 45.4], [142.0, 45.0], [143.5, 44.3], [144.3, 44.0], [145.3, 44.3], [145.5, 43.6], [145.0, 43.2], [144.3, 43.0], [143.3, 42.0], [142.0, 42.5], [141.0, 42.2], [140.7, 41.8], [140.0, 41.5], [139.8, 42.5], [140.3, 43.2], [141.3, 43.3], [141.5, 44.0], [141.7, 44.8]];
const HONSHU: [number, number][] = [[140.9, 41.0], [141.5, 41.3], [141.4, 40.5], [141.9, 39.5], [141.5, 38.5], [141.0, 38.3], [141.0, 37.5], [140.9, 36.9], [140.6, 36.2], [140.9, 35.7], [140.4, 35.2], [139.9, 34.9], [139.8, 35.3], [140.0, 35.6], [139.7, 35.5], [139.6, 35.2], [139.7, 35.0], [139.2, 35.2], [138.9, 34.7], [138.8, 35.0], [138.5, 34.7], [137.5, 34.6], [137.0, 34.6], [136.8, 34.5], [136.9, 34.2], [136.6, 34.3], [136.3, 34.1], [136.0, 33.5], [135.8, 33.5], [135.3, 33.7], [135.2, 34.0], [135.4, 34.6], [135.0, 34.65], [134.5, 34.7], [133.9, 34.5], [133.0, 34.4], [132.4, 34.3], [131.7, 34.0], [131.0, 33.9], [130.9, 34.3], [131.5, 34.6], [132.5, 35.3], [133.3, 35.5], [134.5, 35.6], [135.3, 35.7], [136.0, 35.7], [136.1, 36.2], [136.7, 36.9], [137.3, 37.5], [137.0, 37.1], [137.3, 36.8], [138.0, 37.1], [138.5, 37.5], [139.0, 38.0], [139.5, 38.5], [139.8, 39.0], [140.0, 39.8], [139.9, 40.5], [140.3, 41.0]];
const SHIKOKU: [number, number][] = [[134.7, 34.2], [134.3, 33.9], [134.3, 33.4], [133.9, 33.3], [133.4, 33.4], [133.0, 33.0], [132.8, 33.4], [132.5, 33.9], [133.5, 34.0], [134.0, 34.3]];
const KYUSHU: [number, number][] = [[131.0, 33.9], [131.7, 33.6], [131.9, 33.0], [131.5, 32.5], [131.4, 31.7], [131.1, 31.4], [130.7, 31.0], [130.5, 31.3], [130.3, 31.6], [130.1, 32.2], [130.4, 32.7], [129.8, 32.8], [129.8, 33.2], [130.1, 33.6], [130.6, 33.9]];
// Tokyo Bay's shore (lon, lat), from the Miura side round to Futtsu
const BAY: [number, number][] = [[139.73, 35.14], [139.67, 35.25], [139.65, 35.32], [139.64, 35.40], [139.73, 35.48], [139.78, 35.53], [139.82, 35.60], [139.86, 35.64], [139.92, 35.66], [139.98, 35.68], [140.05, 35.62], [140.03, 35.55], [139.95, 35.48], [139.90, 35.40], [139.85, 35.30], [139.80, 35.20], [139.78, 35.12]];

const OKINAWA: [number, number][] = [[127.65,26.08],[127.82,26.2],[127.88,26.4],[128.05,26.55],[128.28,26.87],[128.18,26.88],[127.98,26.7],[127.84,26.53],[127.7,26.42],[127.66,26.23]];
const JP = { lon0: 128.5, lat0: 46.2, k: 36, cos: Math.cos((36 * Math.PI) / 180) };
const jp = (lon: number, lat: number): [number, number] => [(lon - JP.lon0) * JP.k * JP.cos, (JP.lat0 - lat) * JP.k];
const BAYV = { lon0: 139.55, lat0: 35.75, k: 560, cos: Math.cos((35.5 * Math.PI) / 180) };
const bay = (lon: number, lat: number): [number, number] => [(lon - BAYV.lon0) * BAYV.k * BAYV.cos, (BAYV.lat0 - lat) * BAYV.k];
const path = (pts: [number, number][], f: (lon: number, lat: number) => [number, number]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0], p[1]).map((v) => v.toFixed(1)).join(' ')}`).join(' ') + ' Z';

/** The map of the coast: where to go today. One pin opens the flat; the others wait to be built. */
export function SpotSelect({ app }: { app: App }) {
  const allSpots = app.data.spots;
  const [area, setArea] = useState(allSpots.find(s => s.id === ui.spot.value)?.area ?? '東京湾');
  const areas = [...new Set(allSpots.map(s => s.area))];
  const spots = allSpots.filter(s => s.area === area);
  const chooseArea = (next: string) => { setArea(next); ui.spot.value = allSpots.find(s => s.area === next)?.id ?? null; };
  const regionButtons = <div class="spot-regions">{areas.map(a => <button class={`btn ${a === area ? 'primary' : 'ghost'}`} aria-pressed={a === area} onClick={() => chooseArea(a)}>{a}</button>)}</div>;
  const selId = ui.spot.value ?? spots[0]?.id ?? null;
  const sel = spots.find((s) => s.id === selId) ?? spots[0];
  const pick = (s: SpotDef) => { ui.spot.value = s.id; };
  if (app.input.touchDevice) return <div class="screen center mobile-spots">
    <div class="card mobile-spots-card">
      <CardHead title={t('spots.title')} onClose={() => app.closeOverlay()} />
{regionButtons}
      <div class="mobile-spot-layout"><CoastMaps spots={spots} selected={sel?.id} onPick={pick} area={area} chooseArea={chooseArea} /><div class="mobile-spot-content">
      <div class="mobile-spot-options">
        {spots.map((s) => <button key={s.id} class={`btn mobile-spot ${s.id === sel?.id ? 'selected' : ''}`} aria-pressed={s.id === sel?.id} onClick={() => pick(s)}>
          <span class="name">{s.ja}</span><span class="dim small">{s.area}</span>
          <span class="small">{s.map ? t('spots.open') : t('spots.soon')}</span>
        </button>)}
      </div>
      {sel && <div class="mobile-spot-detail">
        <p class="dim small">{sel.description}</p>
        <button class="btn primary spot-go" disabled={!sel.map} onClick={() => { if (sel.map) void app.enterField(sel.id); }}>{sel.map ? t('spots.go') : t('spots.soon')}</button>
      </div>}
      </div></div>
    </div>
  </div>;
  return (
    <div class="screen center">
      <div class="card spots-card">
        <CardHead eyebrow={t('spots.eyebrow')} title={t('spots.title')} onClose={() => app.closeOverlay()} />
        {regionButtons}
        <div class="spots-body">
<CoastMaps spots={spots} selected={sel?.id} onPick={pick} area={area} chooseArea={chooseArea} />
          <div class="spots-side">
            <ul class="spots-list">
              {spots.map((s) => (
                <li key={s.id} class={`${s.id === sel?.id ? 'on' : ''} ${s.map ? '' : 'soon'}`} onClick={() => pick(s)}>
                  <span class="name">{s.ja}</span>
                  <span class="dim small">{s.map ? t('spots.open') : t('spots.soon')}</span>
                </li>
              ))}
            </ul>
            {sel && (
              <div class="spots-detail">
                <div class="name">{sel.ja} <span class="dim small">{sel.area}</span></div>
                <p class="dim small">{sel.description}</p>
                {sel.map
                  ? <button class="btn primary" onClick={() => void app.enterField(sel.id)}>{t('spots.go')} <Key k="Enter" /></button>
                  : <button class="btn ghost" disabled>{t('spots.soon')}</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoastMaps({ spots, selected, onPick, area, chooseArea }: { spots: SpotDef[]; selected?: string; onPick: (s: SpotDef) => void; area: string; chooseArea: (area: string) => void }) {
  const [bx0, by0] = jp(139.5, 35.75), [bx1, by1] = jp(140.1, 35.1);
  const regionPoint = area === '沖縄' ? (lon: number, lat: number): [number, number] => [(lon - 127.5) * 275, (27 - lat) * 350] : bay;
  return (<div class="spots-maps">
            <svg class="spots-japan" viewBox="0 0 520 560" aria-label="日本">
              <path class="land" d={path(HOKKAIDO, jp)} />
              <path class="land" d={path(HONSHU, jp)} />
              <path class="land" d={path(SHIKOKU, jp)} />
              <path class="land" d={path(KYUSHU, jp)} />
              <rect class="focus" x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} rx="2" />
              <g role="button" tabIndex={0} aria-label="東京湾を選ぶ" onClick={() => chooseArea('東京湾')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') chooseArea('東京湾'); }}>
                <rect x={bx0-10} y={by0-10} width="100" height="50" fill="transparent" />
                <text class="label" x={bx1 + 8} y={by0 + 10}>{t('spots.tokyoBay')}</text>
              </g>
              <g role="button" tabIndex={0} aria-label="沖縄を選ぶ" onClick={() => chooseArea('沖縄')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') chooseArea('沖縄'); }}>
                <rect x="18" y="325" width="120" height="90" rx="8" class="focus" />
                <path class="land" d={path(OKINAWA, (lon,lat) => [38+(lon-127.5)*100, 340+(27-lat)*65])} />
                <text class="label" x="92" y="390">沖縄</text>
              </g>
            </svg>
            <svg class="spots-bay" viewBox="-20 -20 300 380" aria-label={area}>
              <path class="shore" d="M-20 -20 H280 V360 H-20 Z" />
              <path class={area === '沖縄' ? 'land' : 'water'} d={path(area === '沖縄' ? OKINAWA : BAY, regionPoint)} />
              {spots.map((s) => {
                const [x, y] = regionPoint(s.lon, s.lat);
                const on = s.id === selected, ready = !!s.map;
                return (
                  <g key={s.id} class={`pin ${ready ? 'open' : 'soon'} ${on ? 'on' : ''}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={() => onPick(s)} role="button" tabIndex={0}>
                    <circle class="halo" r="14" />
                    <circle class="dot" r="5" />
                    <text class="name" x="10" y="4">{s.ja}</text>
                  </g>
                );
              })}
            </svg>
          </div>);
}
