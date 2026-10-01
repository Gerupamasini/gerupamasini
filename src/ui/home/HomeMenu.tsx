import { h, Fragment } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { TankPanel } from '../tank/TankPanel';
import { TideGauge } from '../hud/TideGauge';
import { formatJst } from '../../core/Time';
import { moonEmoji, tideName } from '../../core/Moon';

function remaining(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh > 0 ? `あと ${hh}時間${mm}分` : `あと ${mm}分`;
}

/** Home: the showcase tank fills the screen; status top-left, real tide top-right, glass navigation at the bottom. */
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
  return (
    <Fragment>
      <div class="glass home-status">
        <div class="home-name">{t('home.playerName')}</div>
        <div class="home-level">Lv.{level}</div>
        <div class="thin">EXP {research.toLocaleString()} / {nextAt.toLocaleString()}</div>
        <div class="exp-bar"><i style={{ width: `${Math.min(100, (research / nextAt) * 100)}%` }} /></div>
        <div class="thin">{enc.money.value.toLocaleString()} CR</div>
        <div class="thin">{t('hud.ticket')} ×∞ <span class="dim">{t('home.testVersion')}</span></div>
      </div>
      <div class="glass home-tide" onClick={() => app.openOverlay('tidetable')} title={t('home.tideTable')}>
        <div class="home-time">{hud.timeText}</div>
        <div class="thin">{moonEmoji(now)} {tideName(now)} <span class="dim">{hud.dateText}</span></div>
        <div class="thin">{t('hud.tide')} {(hud.tideLevel * 100).toFixed(0)} cm {hud.tideRate > 0.02 ? '↑' : hud.tideRate < -0.02 ? '↓' : ''}</div>
        {next && (
          <div class="thin">
            <span class="dim">次の{next.kind === 'high' ? t('hud.high') : t('hud.low')}</span> {formatJst(next.t)} <span class="dim">{remaining(next.t - now)}</span>
          </div>
        )}
        <div class="home-gauge"><TideGauge /></div>
      </div>
      <nav class="home-nav">
        <button onClick={() => app.openOverlay('zukan')}>{t('zukan.title')}</button>
        <button onClick={() => app.openShop()}>{t('home.shop')}</button>
        <button class="main" onClick={() => void app.enterField()}>{t('home.goShort')}</button>
        <button class={panel === 'tank' ? 'on' : ''} onClick={() => app.setHomePanel(panel === 'tank' ? 'none' : 'tank')}>{t('home.tankShort')}</button>
        <button onClick={() => app.openOverlay('tidetable')}>{t('home.tideTable')}</button>
      </nav>
      <div class="home-hint thin dim">{t('home.hint')}</div>
      {info && infoSp && (
        <div class="glass home-info" onClick={() => { ui.homeInfo.value = null; }}>
          <div class="home-info-name">{infoSp.names.ja} <span class="dim">#{String(info.number).padStart(4, '0')}</span></div>
          <div class="thin dim">{infoSp.names.sci}</div>
          <div class="thin">{t('individual.length')} {(info.length_mm / 10).toFixed(1)} cm / {t('individual.weight')} {info.weight_g.toFixed(1)} g / {t(`sex.${info.sex}`)} / {infoSp.stages.find((s) => s.id === info.stage)?.ja ?? info.stage}</div>
          <div class="thin dim">{formatJst(info.caughtAt, { date: true })} に採集</div>
        </div>
      )}
      {panel === 'tank' && <TankPanel app={app} />}
    </Fragment>
  );
}
