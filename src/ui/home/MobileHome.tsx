import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { ui } from '../store';
import { HoldButton, MovementStick } from '../TouchControls';
import { ToolsPanel } from './ToolsPanel';
import { TideGauge } from '../hud/TideGauge';
import { BookIcon, CalendarIcon, CapsuleIcon, CartIcon, MoonIcon, TankIcon, ToolboxIcon } from '../common/Icons';

/** Keep all destinations visible, with optional camera controls above the navigation. */
export function MobileHome({ app }: { app: App }) {
  const [hidden, setHidden] = useState(false);
  const [camera, setCamera] = useState(false);
  const hud = ui.hud.value;
  const info = ui.homeInfo.value;
  const species = info ? app.data.species.get(info.speciesId) : undefined;
  const tools = ui.homePanel.value === 'tools';
  useEffect(() => { document.documentElement.classList.toggle('home-ui-hidden', hidden); return () => document.documentElement.classList.remove('home-ui-hidden'); }, [hidden]);
  useEffect(() => {
    app.tank.setViewInputEnabled(camera && !tools && !hidden);
    return () => app.tank.setViewInputEnabled(true);
  }, [app, camera, tools, hidden]);
  if (hidden) return <button class="btn mobile-home-restore" onClick={() => setHidden(false)}>UI表示</button>;
  return <Fragment>
    <div class="mobile-home-status">
      <button class="btn ghost" onClick={() => app.openOverlay('tidetable')} aria-label="潮見表">
        <MoonIcon ms={app.clock.nowGame()} size={18} /><span class="num">{hud.timeText}</span><span>潮位 {(hud.tideLevel * 100).toFixed(0)} cm</span>
      </button>
      <span class="mobile-standing">Lv.{app.encyclopedia.level} ・ {app.encyclopedia.money.value.toLocaleString()} CR</span>
    </div>
    {info && species && <button class="btn mobile-home-selected" onClick={() => { ui.homeInfo.value = null; }} aria-label="生物の情報を閉じる">
      <span>{species.names.ja}</span><span class="small">{(info.length_mm / 10).toFixed(1)} cm ・ {info.weight_g.toFixed(1)} g</span>
    </button>}
    <button class="mobile-home-tide" aria-label="潮位グラフ・潮見表" onClick={() => app.openOverlay('tidetable')}><TideGauge variant="almanac" /></button>
    <nav class="home-nav mobile-home-nav" aria-label="ホーム">
      <button class="nav-tile" onClick={() => app.openOverlay('zukan')}><BookIcon /><span>図鑑</span></button>
      <button class="nav-tile" onClick={() => app.openShop()}><CartIcon /><span>ショップ</span></button>
      <button class="nav-tile" onClick={() => app.openGacha()}><CapsuleIcon /><span>ガチャ</span></button>
      <button class="nav-primary" onClick={() => app.openSpots()}><span class="sea" aria-hidden="true" /><span class="label">干潟へ</span></button>
      <button class="nav-tile" onClick={() => { setCamera(false); app.openTools(); }}><ToolboxIcon /><span>道具</span></button>
      <button class="nav-tile" onClick={() => app.openTankEdit()}><TankIcon /><span>水槽</span></button>
      <button class="nav-tile" onClick={() => app.openOverlay('tidetable')}><CalendarIcon /><span>潮見表</span></button>
    </nav>
    <div class="mobile-home-utility">
      <button class="btn" aria-expanded={camera} onClick={() => { if (tools) app.closeTools(); setCamera(!camera); }}>{camera ? '視点を閉じる' : '視点移動'}</button>
      <button class="btn" onClick={() => { setCamera(false); app.input.clearTouch(); setHidden(true); }}>UI非表示</button>
      <button class="btn home-settings" onClick={() => app.openOverlay('menu')} aria-label="設定">⚙</button>
    </div>
    {camera && !tools && <div class="touch-controls touch-home">
      <MovementStick input={app.input} label="視点移動" />
      <div class="touch-home-height">
        <HoldButton input={app.input} action="viewUp">上へ</HoldButton>
        <HoldButton input={app.input} action="viewDown">下へ</HoldButton>
        <button class="touch-button" onClick={() => app.tank.resetView()}>視点リセット</button>
      </div>
    </div>}
    {tools && <ToolsPanel app={app} />}
  </Fragment>;
}
