import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { HoldButton, MovementStick } from '../TouchControls';
import { ToolsPanel } from './ToolsPanel';

/** Keep the aquarium clear; occasional actions live behind one menu. */
export function MobileHome({ app }: { app: App }) {
  const [more, setMore] = useState(false);
  const [camera, setCamera] = useState(false);
  const hud = ui.hud.value;
  const info = ui.homeInfo.value;
  const species = info ? app.data.species.get(info.speciesId) : undefined;
  const tools = ui.homePanel.value === 'tools';
  return <Fragment>
    <div class="mobile-home-status">
      <button class="btn ghost" onClick={() => app.openOverlay('tidetable')} aria-label="潮見表">
        <span class="num">{hud.timeText}</span><span>潮位 {(hud.tideLevel * 100).toFixed(0)} cm</span>
      </button>
      <span class="mobile-standing">Lv.{app.encyclopedia.level} ・ {app.encyclopedia.money.value.toLocaleString()} CR</span>
    </div>
    {info && species && <button class="btn mobile-home-selected" onClick={() => { ui.homeInfo.value = null; }} aria-label="生物の情報を閉じる">
      <span>{species.names.ja}</span><span class="small">{(info.length_mm / 10).toFixed(1)} cm ・ {info.weight_g.toFixed(1)} g</span>
    </button>}
    <nav class="home-nav mobile-home-nav" aria-label="ホーム">
      <button class="nav-tile" onClick={() => app.openTankEdit()}>{t('home.tankShort')}</button>
      <button class="nav-primary" onClick={() => app.openSpots()}><span class="sea" aria-hidden="true" /><span class="label">{t('home.goShort')}</span></button>
      <button class="nav-tile" aria-expanded={more} aria-controls="mobile-home-more" onClick={() => { setCamera(false); setMore(!more); }}>{more ? '閉じる' : 'メニュー'}</button>
    </nav>
    {more && <nav id="mobile-home-more" class="mobile-home-more" aria-label="ホームメニュー">
      <button class="btn" onClick={() => app.openOverlay('zukan')}>{t('zukan.title')}</button>
      <button class="btn" onClick={() => app.openShop()}>{t('home.shop')}</button>
      <button class="btn" onClick={() => app.openGacha()}>{t('home.gacha')}</button>
      <button class="btn" onClick={() => { setMore(false); app.openTools(); }}>{t('tools.title')}</button>
      <button class="btn" onClick={() => { setMore(false); setCamera(true); }}>視点操作</button>
      <button class="btn" onClick={() => app.openOverlay('menu')}>設定</button>
    </nav>}
    {camera && !tools && <div class="touch-controls touch-home">
      <button class="touch-button touch-camera-close" onClick={() => setCamera(false)}>視点を閉じる</button>
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
