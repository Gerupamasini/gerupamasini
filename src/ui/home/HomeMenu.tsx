import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { TankPanel } from '../tank/TankPanel';
import { ToolsPanel } from './ToolsPanel';
import { MobileHome } from './MobileHome';
import { FirstSteps } from './FirstSteps';
import { nextLevelAt } from '../../systems/Encyclopedia';
import { formatJst } from '../../core/Time';
import { moonAge, tideName } from '../../core/Moon';
import { BookIcon, CalendarIcon, CapsuleIcon, CartIcon, Key, MoonIcon, TankIcon, ToolboxIcon } from '../common/Icons';

function remaining(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh > 0 ? `${hh} 時間 ${mm} 分` : `${mm} 分`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function dateLine(ms: number): string {
  const d = new Date(ms + 9 * 3600000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} (${WEEKDAYS[d.getUTCDay()]})`;
}

/**
 * Home: the showcase tank is the picture. Around it, the observer's standing (top left), the name (top centre), an
 * almanac of the real tide (top right), and a row of seven tiles along the bottom with the flat as the loud one.
 */
export function HomeMenu({ app }: { app: App }) {
  if (app.input.touchDevice) return <MobileHome app={app} />;
  const hud = ui.hud.value;
  const now = app.clock.nowGame();
  const nextLow = hud.extrema.find((e) => e.t > now && e.kind === 'low');
  const panel = ui.homePanel.value;
  const info = ui.homeInfo.value;
  const enc = app.encyclopedia;
  const research = enc.research.value;
  const level = enc.level;
  const nextAt = nextLevelAt(level);
  const infoSp = info ? app.data.species.get(info.speciesId) : undefined;
  return (
    <Fragment>
      <FirstSteps app={app} />
      <div class="glass home-status rise">
        <div class="level-row">
          <span class="lv">Lv.</span><span class="num">{level}</span>
          <span class="exp-label">EXP</span>
          <span class="exp-num">{research.toLocaleString()} / {nextAt.toLocaleString()}</span>
        </div>
        <div class="exp"><i style={{ width: `${Math.min(100, (research / nextAt) * 100)}%` }} /></div>
        <div class="stat-line">
          <span class="stat" title={t('home.credits')}><span class="coin" /><span class="stat-name">{t('home.credits')}</span><b class="num">{enc.money.value.toLocaleString()}</b></span>
          <span class="sep" />
          <span class="stat" title={t('hud.ticket')}><span class="ticket-mark" /><span class="stat-name">{t('hud.ticket')}</span><b class="num">∞</b></span>
        </div>
      </div>

      <div class="home-title rise d1">
        <div class="jp">干潟図鑑</div>
        <div class="en">HIGATA ZUKAN</div>
      </div>

      <div class="glass home-almanac rise d1" onClick={() => app.openOverlay('tidetable')} title={t('home.tideTable')} role="button" tabIndex={0}>
        <div class="row head"><span class="date">{dateLine(now)}</span><span class="time">{hud.timeText}</span></div>
        <div class="row body">
          <div class="moon-col">
            <MoonIcon ms={now} size={46} />
            <div class="age"><span class="dim">{t('home.moonAge')}</span> <span class="num">{moonAge(now).toFixed(1)}</span></div>
            <div class="tidename">{tideName(now)}</div>
          </div>
          <div class="tide-col">
            <div class="kv"><span>{t('home.tideNow')}</span><span class="num">{(hud.tideLevel * 100).toFixed(0)} <small>cm</small></span></div>
            <div class="kv"><span>{t('home.nextLow')}</span><span class="num">{nextLow ? formatJst(nextLow.t) : '--:--'} <small>{nextLow ? `(${nextLow.level >= 0 ? '+' : ''}${(nextLow.level * 100).toFixed(0)} cm)` : ''}</small></span></div>
            <div class="kv"><span>{t('home.untilLow')}</span><span class="num">{nextLow ? remaining(nextLow.t - now) : '--'}</span></div>
          </div>
        </div>
      </div>

      <nav class="home-nav rise d2" aria-label="メニュー">
        <button class="nav-tile" onClick={() => app.openOverlay('zukan')}><BookIcon />{t('zukan.title')}<Key k="Tab" /></button>
        <button class="nav-tile" onClick={() => app.openShop()}><CartIcon />{t('home.shop')}</button>
        <button class="nav-tile" onClick={() => app.openGacha()}><CapsuleIcon />{t('home.gacha')}</button>
        <button class="nav-primary" onClick={() => app.openSpots()}><span class="sea" aria-hidden="true" /><span class="label">{t('home.goShort')}</span></button>
        <button class={`nav-tile ${panel === 'tools' ? 'on' : ''}`} onClick={() => app.openTools()}><ToolboxIcon />{t('tools.title')}</button>
        <button class={`nav-tile ${panel === 'tank' ? 'on' : ''}`} onClick={() => app.openTankEdit()}><TankIcon />{t('home.tankShort')}</button>
        <button class="nav-tile" onClick={() => app.openOverlay('tidetable')}><CalendarIcon />{t('home.tideTable')}<Key k="T" /></button>
      </nav>
      <div class="home-hint">{t('home.hint')}</div>

      {info && infoSp && (
        <div class="glass home-info rise" onClick={() => { ui.homeInfo.value = null; }}>
          <div class="name">{infoSp.names.ja}<span class="num">#{String(info.number).padStart(4, '0')}</span></div>
          <div class="sci">{infoSp.names.sci}</div>
          <div class="facts">
            <span>{t('individual.length')} <span class="num">{(info.length_mm / 10).toFixed(1)} cm</span></span>
            <span>{t('individual.weight')} <span class="num">{info.weight_g.toFixed(1)} g</span></span>
            <span>{t(`sex.${info.sex}`)}</span>
            <span>{infoSp.stages.find((s) => s.id === info.stage)?.ja ?? info.stage}</span>
          </div>
          <div class="when">{formatJst(info.caughtAt, { date: true })} 採集</div>
        </div>
      )}
      {panel === 'tank' && <TankPanel app={app} />}
      {panel === 'tools' && <ToolsPanel app={app} />}
    </Fragment>
  );
}
