import { h } from 'preact';
import type { App } from '../../app/App';
import { t } from '../store';
import { Key } from '../common/Icons';
import { specs } from './ToolsPanel';

/** things the shop will stock later: shown on the shelf, not for sale yet */
const COMING = ['fishing_rod', 'binoculars', 'case_large', 'tank_light', 'tank_backdrop'];

/** The shop, a room of its own: the counter, what is on the shelves, and the CR to spend. */
export function ShopScreen({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const cr = enc.money.value;
  const tools = [...app.data.tools.values()].filter((x) => x.price_cr > 0);
  return (
    <div class="screen shop-screen">
      <div class="shop-room" aria-hidden="true">
        <div class="lamp" /><div class="shelf s1" /><div class="shelf s2" /><div class="counter" />
      </div>
      <div class="shop-top">
        <div>
          <div class="eyebrow">{t('shop.eyebrow')}</div>
          <h1 class="shop-title">{t('shop.title')}</h1>
        </div>
        <div class="shop-cr"><span class="dim">{t('home.credits')}</span><b class="num">{cr.toLocaleString()}</b><span class="dim">CR</span></div>
        <button class="btn ghost sm" onClick={() => app.closeShop()}>{t('shop.leave')} <Key k="Esc" /></button>
      </div>
      <p class="shop-line">{t('shop.greeting')}</p>
      <div class="shop-grid">
        {tools.map((tool) => {
          const owned = enc.owns(tool.id);
          return (
            <div key={tool.id} class={`shop-card ${owned ? 'owned' : ''}`}>
              <div class="kind">{t('tools.nets')}</div>
              <div class="name">{tool.ja}</div>
              <div class="specs">{specs(tool)}</div>
              <p class="dim small">{tool.description}</p>
              <div class="buy-row">
                <span class="price num">{tool.price_cr} CR</span>
                {owned ? <span class="owned-mark">{t('shop.owned')}</span> : <button class="btn primary sm" disabled={cr < tool.price_cr} onClick={() => app.buyTool(tool.id)}>{t('tools.buy')}</button>}
              </div>
            </div>
          );
        })}
        {COMING.map((id) => (
          <div key={id} class="shop-card soon">
            <div class="kind">{t('shop.soonKind')}</div>
            <div class="name">{t(`shop.item.${id}`)}</div>
            <p class="dim small">{t('shop.soonLine')}</p>
          </div>
        ))}
      </div>
      <p class="shop-foot dim small">{t('tools.crHint')}</p>
    </div>
  );
}
