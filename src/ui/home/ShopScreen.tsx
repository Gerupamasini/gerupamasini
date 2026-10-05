import { h } from 'preact';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import { Key } from '../common/Icons';
import { specs } from './ToolsPanel';

/**
 * The shop: the room itself is drawn behind (the rack of nets, the parcels on the side table); this overlay carries
 * the keeper's line, the CR, and the card for whatever was clicked on the shelves.
 */
export function ShopScreen({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const cr = enc.money.value;
  const sel = ui.shopSelected.value;
  const tool = sel && !sel.startsWith('coming:') ? app.data.tools.get(sel) : undefined;
  const coming = sel?.startsWith('coming:') ? sel.slice(7) : null;
  const owned = tool ? enc.owns(tool.id) : false;
  return (
    <div class="screen shop-screen">
      <div class="shop-top">
        <div>
          <div class="eyebrow">{t('shop.eyebrow')}</div>
          <h1 class="shop-title">{t('shop.title')}</h1>
        </div>
        <div class="shop-cr"><span class="dim">{t('home.credits')}</span><b class="num">{cr.toLocaleString()}</b><span class="dim">CR</span></div>
        <button class="btn ghost sm" onClick={() => app.closeShop()}>{t('shop.leave')} <Key k="Esc" /></button>
      </div>
      <p class="shop-line">{t('shop.greeting')}</p>
      {tool ? (
        <div class={`glass shop-card float ${owned ? 'owned' : ''}`}>
          <div class="kind">{t('tools.nets')}</div>
          <div class="name">{tool.ja}</div>
          <div class="specs">{specs(tool)}</div>
          <p class="dim small">{tool.description}</p>
          <div class="buy-row">
            <span class="price num">{tool.price_cr} CR</span>
            {owned ? <span class="owned-mark">{t('shop.owned')}</span> : <button class="btn primary sm" disabled={cr < tool.price_cr} onClick={() => app.buyTool(tool.id)}>{t('tools.buy')}</button>}
          </div>
          <button class="btn ghost sm close" onClick={() => { ui.shopSelected.value = null; }}>{t('shop.closeCard')}</button>
        </div>
      ) : coming ? (
        <div class="glass shop-card float soon">
          <div class="kind">{t('shop.soonKind')}</div>
          <div class="name">{t(`shop.item.${coming}`)}</div>
          <p class="dim small">{t('shop.soonLine')}</p>
          <button class="btn ghost sm close" onClick={() => { ui.shopSelected.value = null; }}>{t('shop.closeCard')}</button>
        </div>
      ) : (
        <div class="shop-pick dim">{t('shop.pickHint')}</div>
      )}
      <p class="shop-foot dim small">{t('tools.crHint')}</p>
    </div>
  );
}
