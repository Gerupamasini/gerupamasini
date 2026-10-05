import { skillKeyOf } from '../systems/Encyclopedia';
import { h, Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import type { App } from '../app/App';
import { ui, t } from './store';
import { TideGauge } from './hud/TideGauge';
import { Minimap } from './hud/Minimap';
import { MapOverlay } from './hud/MapOverlay';
import { Toasts } from './hud/Toasts';
import { Menu } from './menu/Menu';
import { TideTable } from './tide/TideTable';
import { Zukan } from './zukan/Zukan';
import { ObserveOverlay } from './observe/ObserveOverlay';
import { CaptureOverlay } from './capture/CaptureOverlay';
import { HomeMenu } from './home/HomeMenu';
import { TankPanel } from './tank/TankPanel';
import { CaseOverlay } from './field/CaseOverlay';
import { SpotSelect } from './home/SpotSelect';
import { ShopScreen } from './home/ShopScreen';
import { DebugPanel } from './debug/DebugPanel';
import { CreatureMarkers } from './debug/CreatureMarkers';
import { ArrowIcon, Key, KeyHint, MoonIcon } from './common/Icons';
import { tideName } from '../core/Moon';
import { BUILD, versionLabel, builtAtLabel } from '../core/Build';
import './ui.css';

export function Root({ app }: { app: App }) {
  const screen = ui.screen.value;
  useEffect(() => {
    const onClick = () => app.focusGame();
    app.canvas.addEventListener('click', onClick);
    return () => app.canvas.removeEventListener('click', onClick);
  }, [app]);
  const inField = screen === 'field' || screen === 'capture' || screen === 'observe' || screen === 'caseView';
  return (
    <Fragment>
      {screen === 'boot' && <Loading />}
      {screen === 'error' && <ErrorScreen />}
      {screen === 'title' && <Title app={app} />}
      {screen === 'home' && <HomeMenu app={app} />}
      {screen === 'tankEdit' && <TankEdit app={app} />}
      {ui.transition.value && <Transition label={ui.transition.value} />}
      {(screen === 'field' || screen === 'capture') && <Hud app={app} />}
      {screen === 'observe' && <ObserveOverlay app={app} />}
      {screen === 'caseView' && <CaseOverlay app={app} />}
      {screen === 'capture' && <CaptureOverlay app={app} />}
      {inField && <CreatureMarkers />}
      {screen === 'field' && ui.mapOpen.value && <MapOverlay app={app} />}
      {screen === 'zukan' && <Zukan app={app} />}
      {screen === 'menu' && <Menu app={app} />}
      {screen === 'spots' && <SpotSelect app={app} />}
      {screen === 'shop' && <ShopScreen app={app} />}
      {screen === 'ticket' && <TideTable app={app} />}
      {screen === 'tidetable' && <TideTable app={app} />}
      {ui.debug.value && (inField || screen === 'home') && <DebugPanel app={app} />}
      <Toasts />
    </Fragment>
  );
}

/** The tank's edit screen: the drawer, a badge saying time stands still, and a way back. */
function TankEdit({ app }: { app: App }) {
  return (
    <div class="tank-edit">
      <div class="edit-badge rise">
        <span class="eyebrow">{t('tank.editing')}</span>
        <button class="btn ghost sm" onClick={() => app.closeTankEdit()}>{t('home.back')} <Key k="Esc" /></button>
      </div>
      <TankPanel app={app} />
    </div>
  );
}

/** The curtain between screens. */
function Transition({ label }: { label: string }) {
  return (
    <div class="screen loading transition">
      <h1 class="wordmark">{t('app.title')}</h1>
      <div class="label rise d1">{label}</div>
    </div>
  );
}

function Loading() {
  const { frac, label } = ui.loading.value;
  return (
    <div class="screen loading">
      <h1 class="wordmark rise">{t('app.title')}</h1>
      <div class="progress rise d1"><i style={{ width: `${Math.round(frac * 100)}%` }} /></div>
      <div class="label rise d2">{label}</div>
    </div>
  );
}

function ErrorScreen() {
  return (
    <div class="screen center">
      <div class="card"><h2 class="card-title">起動できません</h2><p>{ui.error.value}</p></div>
    </div>
  );
}

/** The title: the wordmark over the quiet tank, a drawn tide line, and what the real flat is doing right now. */
function Title({ app }: { app: App }) {
  const hud = ui.hud.value;
  const now = app.clock.nowGame();
  const level = hud.tideLevel;
  return (
    <div class="screen title-screen">
      <div class="title-wrap">
        <h1 class="wordmark rise">{t('app.title')}</h1>
        <svg class="title-rule rise d1" viewBox="0 0 120 36" aria-hidden="true">
          <path pathLength="1" d="M2 24 C 18 24, 22 10, 36 10 S 54 26, 68 26 S 86 8, 100 8 S 112 20, 118 20" />
        </svg>
        <div class="tagline rise d2">{t('title.tagline')}</div>
        <div class="title-now rise d3">
          <span>{t('title.place')}</span>
          <span class="sep" />
          <span class="num">{hud.dateText} {hud.timeText}</span>
          <span class="sep" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MoonIcon ms={now} /> {tideName(now)}</span>
          <span class="sep" />
          <span>{t('hud.tide')} <span class="num">{level >= 0 ? '+' : ''}{(level * 100).toFixed(0)} cm</span></span>
        </div>
        <div class="title-actions rise d4">
          <button class="btn primary lg" onClick={() => void app.startNewGame()}>{t('title.start')} <ArrowIcon /></button>
          {ui.hasSave.value && <button class="btn lg" onClick={() => void app.continueGame()}>{t('title.continue')}</button>}
          <button class="btn ghost lg" onClick={() => app.openOverlay('menu')}>{t('title.settings')}</button>
        </div>
      </div>
      <div class="title-foot rise d5">
        <span class="build" title={BUILD.builtAt ? `ビルド ${BUILD.builtAt}` : undefined}>
          <span class="num">{versionLabel}</span> ・ 身内テスト版{BUILD.build && <span class="num">build {BUILD.build}</span>}{BUILD.commit && <span class="num commit">{BUILD.commit}</span>}{BUILD.builtAt && <span class="num dim">{builtAtLabel()}</span>}
        </span>
        <span>{t('home.station')} ・ 潮汐の予測</span>
      </div>
    </div>
  );
}

const KEY_HINTS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], '移動'], [['Shift'], '走る'], [['C'], '視点'], [['E'], '採集'], [['F'], '観察'],
  [['Q'], 'ケース'], [['M'], '地図'], [['Tab'], '図鑑'], [['H'], '自宅'], [['T'], 'チケット'], [['Esc'], 'メニュー'],
];

function Hud({ app }: { app: App }) {
  const hud = ui.hud.value;
  const screen = ui.screen.value;
  return (
    <Fragment>
      {!hud.pointerLocked && screen === 'field' && (
        <div class="screen center transparent" onClick={() => app.focusGame()}>
          <div class="ready">
            <div class="ready-pill">{t('hud.ready')} <Key k="Enter" /></div>
            <div class="ready-sub">{t('hud.ready.sub')}</div>
          </div>
        </div>
      )}
      <div class="hud-tl">
        <div class="hud-clock">
          <span class="num">{hud.timeText}</span>
          <span class="date num">{hud.dateText}</span>
          <span class="meta">{t(`tod.${hud.tod}`)} ・ {t(`season.${hud.season}`)}</span>
        </div>
        <TideGauge />
        {hud.ticket && (
          <div class={`ticket-badge ${hud.ticket.phase}`}>
            {t('hud.ticket')} ・ {hud.ticket.phase === 'ending' ? t('ticket.ending') : <span><span class="num">{hud.ticket.targetText}</span> {t('ticket.remaining')} <span class="num">{Math.floor(hud.ticket.remainingSec / 60)}:{String(hud.ticket.remainingSec % 60).padStart(2, '0')}</span></span>}
          </div>
        )}
      </div>
      <div class="hud-tr">
        <div class="minimap-wrap"><Minimap app={app} /></div>
        <div class="hud-stats">
          <div>{t('progress.research')}<b>{hud.research}</b></div>
          <div>{t('hud.case')}<b>{hud.caseCount}<span class="dim">/{hud.caseMax}</span></b></div>
          <div class="fps">{hud.fps} fps</div>
        </div>
        <div class="hud-tools" data-skills={Object.values(app.encyclopedia.skills.value).join(',')}>
          {app.encyclopedia.loadout.value.map((id, i) => {
            const tool = app.data.tools.get(id);
            const lv = tool ? app.encyclopedia.skillLevel(skillKeyOf(tool)) : 0;
            const on = ui.tool.value === id;
            return <button key={id} class={`tool-chip ${on ? 'on' : ''}`} onClick={() => app.setTool(id)} aria-pressed={on}><Key k={String(i + 1)} />{tool?.ja ?? id}{lv > 0 && <span class="lv">Lv{lv}</span>}{on && <span class="use">{t('hud.inUse')}</span>}</button>;
          })}
        </div>
      </div>
      <div class="reticle" />
      <div class="hud-cb">
        {hud.tooDeep && <div class="prompt warn">{t('hud.tooDeep')}</div>}
        {hud.prompt && <div class="prompt">{hud.prompt}</div>}
      </div>
      <div class="hud-keys">
        {KEY_HINTS.map(([keys, label]) => <KeyHint key={label} keys={keys} label={label} />)}
      </div>
    </Fragment>
  );
}
