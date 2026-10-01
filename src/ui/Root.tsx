import { h, Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import type { App } from '../app/App';
import { ui, t } from './store';
import { TideGauge } from './hud/TideGauge';
import { Minimap } from './hud/Minimap';
import { MapOverlay } from './hud/MapOverlay';
import { Toasts } from './hud/Toasts';
import { Menu } from './menu/Menu';
import { TicketDialog } from './ticket/TicketDialog';
import { TideTable } from './tide/TideTable';
import { Zukan } from './zukan/Zukan';
import { ObserveOverlay } from './observe/ObserveOverlay';
import { CaptureOverlay } from './capture/CaptureOverlay';
import { HomeMenu } from './home/HomeMenu';
import { DebugPanel } from './debug/DebugPanel';
import { CreatureMarkers } from './debug/CreatureMarkers';
import './ui.css';

export function Root({ app }: { app: App }) {
  const screen = ui.screen.value;
  useEffect(() => {
    const onClick = () => app.focusGame();
    app.canvas.addEventListener('click', onClick);
    return () => app.canvas.removeEventListener('click', onClick);
  }, [app]);
  const inField = screen === 'field' || screen === 'capture' || screen === 'observe';
  return (
    <Fragment>
      {screen === 'boot' && <Loading />}
      {screen === 'error' && <ErrorScreen />}
      {screen === 'title' && <Title app={app} />}
      {screen === 'home' && <HomeMenu app={app} />}
      {(screen === 'field' || screen === 'capture') && <Hud app={app} />}
      {screen === 'observe' && <ObserveOverlay app={app} />}
      {screen === 'capture' && <CaptureOverlay app={app} />}
      {inField && <CreatureMarkers />}
      {screen === 'field' && ui.mapOpen.value && <MapOverlay app={app} />}
      {screen === 'zukan' && <Zukan app={app} />}
      {screen === 'menu' && <Menu app={app} />}
      {screen === 'ticket' && <TicketDialog app={app} />}
      {screen === 'tidetable' && <TideTable app={app} />}
      {ui.debug.value && (inField || screen === 'home') && <DebugPanel app={app} />}
      <Toasts />
    </Fragment>
  );
}

function Loading() {
  const { frac, label } = ui.loading.value;
  return (
    <div class="screen center">
      <div class="card">
        <h1 class="title">{t('app.title')}</h1>
        <div class="progress"><i style={{ width: `${Math.round(frac * 100)}%` }} /></div>
        <div class="dim">{label}</div>
      </div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div class="screen center">
      <div class="card"><h2>起動できません</h2><p>{ui.error.value}</p></div>
    </div>
  );
}

function Title({ app }: { app: App }) {
  const hud = ui.hud.value;
  return (
    <div class="screen title-screen">
      <div class="title-block">
        <h1 class="title big">{t('app.title')}</h1>
        <div class="dim">{t('app.subtitle')}</div>
        <div class="title-buttons">
          <button class="primary" onClick={() => void app.startNewGame()}>{t('title.start')}</button>
          {ui.hasSave.value && <button onClick={() => void app.continueGame()}>{t('title.continue')}</button>}
          <button onClick={() => app.openOverlay('menu')}>{t('title.settings')}</button>
        </div>
        <div class="dim small">{hud.dateText} {hud.timeText}</div>
      </div>
      <div class="version">v0.2 身内テスト版</div>
    </div>
  );
}

function Hud({ app }: { app: App }) {
  const hud = ui.hud.value;
  const screen = ui.screen.value;
  return (
    <Fragment>
      {!hud.pointerLocked && screen === 'field' && (
        <div class="screen center transparent" onClick={() => app.focusGame()}>
          <div class="hint-big">{t('hud.clickToPlay')}</div>
          <div class="dim small">{t('hud.clickToPlay.sub')}</div>
        </div>
      )}
      <div class="hud-top-left">
        <div class="clock">{hud.dateText} <b>{hud.timeText}</b> <span class="dim">{t(`tod.${hud.tod}`)} / {t(`season.${hud.season}`)}</span></div>
        <TideGauge />
        {hud.ticket && (
          <div class={`ticket-badge ${hud.ticket.phase}`}>
            {t('hud.ticket')}: {hud.ticket.phase === 'ending' ? t('ticket.ending') : `${hud.ticket.targetText}  ${t('ticket.remaining')} ${Math.floor(hud.ticket.remainingSec / 60)}:${String(hud.ticket.remainingSec % 60).padStart(2, '0')}`}
          </div>
        )}
      </div>
      <div class="hud-top-right">
        <Minimap app={app} />
        <div class="stats">
          <div>{t('progress.research')} <b>{hud.research}</b></div>
          <div>{t('hud.case')} <b>{hud.caseCount}</b>/{hud.caseMax}</div>
          <div class="dim small">{hud.fps} fps</div>
        </div>
      </div>
      <div class="reticle" />
      <div class="hud-center-bottom">
        {hud.tooDeep && <div class="warn">{t('hud.tooDeep')}</div>}
        {hud.prompt && <div class="prompt">{hud.prompt}</div>}
      </div>
      <div class="hud-bottom dim small">{t('hud.hint.move')}<br />{t('hud.hint.view')}</div>
    </Fragment>
  );
}
