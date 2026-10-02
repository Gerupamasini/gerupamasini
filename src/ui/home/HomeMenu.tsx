import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { TankPanel } from '../tank/TankPanel';
import { TideGauge } from '../hud/TideGauge';
import { formatJst } from '../../core/Time';
import { lunarDay, tideName } from '../../core/Moon';
import { ArrowIcon, Key, MoonIcon, TrendIcon } from '../common/Icons';

function remaining(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh > 0 ? `${hh} 時間 ${mm} 分` : `${mm} 分`;
}

/**
 * Home: the showcase tank is the picture. Around it, an almanac of the real tide (top right), the observer's standing
 * (top left), and one line of navigation at the bottom with the flat as the only loud thing on the screen.
 */
export function HomeMenu({ app }: { app: App }) {
  const hud = ui.hud.value;
  const now = app.clock.nowGame();
  const next = hud.extrema.find((e) => e.t > now);
  const panel = ui.homePanel.value;
  const info = ui.homeInfo.value;
  const enc = app.encyclopedia;
  const research = enc.research.value;
  const level = Math.floor(Math.sqrt(research / 100)) + 1;
  const nextAt = 100 * level * level;
  const infoSp = info ? app.data.species.get(info.speciesId) : undefined;
  const trend: 'up' | 'down' | 'flat' = hud.tideRate > 0.02 ? 'up' : hud.tideRate < -0.02 ? 'down' : 'flat';
  return (
    <Fragment>
      <div class="glass home-status rise">
        <div class="eyebrow">{t('home.observer')}</div>
        <div class="level"><span class="lv">LV</span><span class="num">{level}</span></div>
        <div class="exp"><i style={{ width: `${Math.min(100, (research / nextAt) * 100)}%` }} /></div>
        <div class="stat-row"><span>{t('home.research')}</span><span class="num">{research.toLocaleString()} <span class="dim">/ {nextAt.toLocaleString()}</span></span></div>
        <div class="stat-row"><span>{t('home.money')}</span><span class="num">{enc.money.value.toLocaleString()} CR</span></div>
        <div class="stat-row"><span>{t('hud.ticket')}</span><span class="num">∞ <span class="dim">{t('home.testVersion')}</span></span></div>
      </div>

      <div class="glass home-almanac rise d1" onClick={() => app.openOverlay('tidetable')} title={t('home.tideTable')} role="button" tabIndex={0}>
        <div class="eyebrow">{t('home.almanac')} ・ {hud.dateText}</div>
        <div class="time">{hud.timeText}</div>
        <div class="moonrow"><MoonIcon ms={now} size={15} /> {tideName(now)} <span class="dim">{t('home.lunar')} {lunarDay(now)} 日</span></div>
        <div class="level">
          <span class="dim">{t('hud.tide')}</span>
          <span class="num">{hud.tideLevel >= 0 ? '+' : ''}{(hud.tideLevel * 100).toFixed(0)}</span><span class="unit">cm</span>
          <span class={`gauge-trend trend-${trend}`}><TrendIcon dir={trend} />{trend === 'up' ? t('hud.rising') : trend === 'down' ? t('hud.falling') : ''}</span>
        </div>
        {next && (
          <div class="next">
            <span>{t('home.nextTide')}{next.kind === 'high' ? t('hud.high') : t('hud.low')}</span>
            <span class="num">{formatJst(next.t)}</span>
            <span>あと <span class="num">{remaining(next.t - now)}</span></span>
          </div>
        )}
        <TideGauge variant="almanac" />
        <div class="hint">{t('home.tideTable')} →</div>
      </div>

      <nav class="glass home-nav rise d2" aria-label="メニュー">
        <button class="nav-item" onClick={() => app.openOverlay('zukan')}>{t('zukan.title')}<Key k="Tab" /></button>
        <button class="nav-item" onClick={() => app.openShop()}>{t('home.shop')}<span class="key" style={{ visibility: 'hidden' }}>·</span></button>
        <button class="nav-primary" onClick={() => void app.enterField()}>{t('home.goShort')} <ArrowIcon size={16} /></button>
        <button class={`nav-item ${panel === 'tank' ? 'on' : ''}`} onClick={() => app.openTankEdit()}>{t('home.tankShort')}<span class="key" style={{ visibility: 'hidden' }}>·</span></button>
        <button class="nav-item" onClick={() => app.openOverlay('tidetable')}>{t('home.tideTable')}<Key k="T" /></button>
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
    </Fragment>
  );
}
