import { h } from 'preact';
import type { App } from '../../app/App';
import type { ToolDef } from '../../data/schemas/items';
import { t } from '../store';
import { CloseIcon } from '../common/Icons';
import { LOADOUT_MAX, skillKeyOf } from '../../systems/Encyclopedia';

/** A line of what a tool does: reach, hoop, speed, quietness for a net; the blade for a shovel. */
export function specs(tool: ToolDef): string {
  const p = tool.params;
  if (tool.type === 'capture') {
    const swing = p.swing ?? 1, quiet = p.quiet ?? 1;
    const speed = swing <= 0.8 ? t('tools.fast') : swing <= 1.05 ? t('tools.normal') : t('tools.slow');
    const q = quiet <= 0.8 ? t('tools.quietGood') : quiet <= 1.05 ? t('tools.normal') : t('tools.quietBad');
    return `${t('tools.reach')} ${(p.reach_m ?? 1.5).toFixed(1)} m ・ ${t('tools.hoop')} ×${(p.hoop ?? 1).toFixed(2)} ・ ${t('tools.speed')} ${speed} ・ ${q}`;
  }
  if (tool.type === 'dig') {
    const swing = p.swing ?? 1;
    const speed = swing <= 0.8 ? t('tools.fast') : swing <= 1.05 ? t('tools.normal') : t('tools.slow');
    return `${t('tools.blade')} ${((p.radius ?? 0.14) * 200).toFixed(0)} cm ・ ${t('tools.depth')} ${(p.depth_cm ?? 20).toFixed(0)} cm ・ ${t('tools.reach')} ${(p.reach_m ?? 1.2).toFixed(1)} m ・ ${t('tools.speed')} ${speed}`;
  }
  if (tool.type === 'optic') return `${t('tools.magnification')} ×${(p.magnification ?? 8).toFixed(0)} ・ ${t('tools.fov')} ${(p.fov_deg ?? 7.5).toFixed(1)}° ・ ${t('tools.reach')} ${(p.reach_m ?? 80).toFixed(0)} m`;
  return '';
}

/** The tools drawer on the home screen: what is owned and carried (three at most, on the number keys), and the shop. */
export function ToolsPanel({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const owned = enc.owned.value, loadout = enc.loadout.value, cr = enc.money.value;
  const all = [...app.data.tools.values()];
  const mine = all.filter((x) => owned.includes(x.id));
  const shop = all.filter((x) => !owned.includes(x.id));
  return (
    <aside class="glass drawer tools-drawer">
      <div class="drawer-head">
        <h2>{t('tools.title')}</h2>
        <button class="icon-btn" onClick={() => app.closeTools()} aria-label={t('ui.close')}><CloseIcon /></button>
      </div>
      <div class="drawer-body">
        <div class="stat-row"><span>{t('home.money')}</span><span class="num">{cr.toLocaleString()} CR</span></div>
        <h4>{t('tools.carry')} <span class="num" style={{ marginLeft: '8px' }}>{loadout.length} / {LOADOUT_MAX}</span></h4>
        <p class="dim small">{t('tools.carryHint')}</p>
        <ul class="tools-list">
          {mine.map((tool) => {
            const i = loadout.indexOf(tool.id), lv = enc.skillLevel(skillKeyOf(tool));
            return (
              <li key={tool.id} class={i >= 0 ? 'on' : ''}>
                <div class="row">
                  <span class="name">{i >= 0 && <span class="slot">{i + 1}</span>}{tool.ja}{lv > 0 && <span class="lv">Lv{lv}</span>}</span>
                  <button onClick={() => app.toggleCarry(tool.id)}>{i >= 0 ? t('tools.leave') : t('tools.take')}</button>
                </div>
                <div class="specs">{specs(tool)}</div>
              </li>
            );
          })}
        </ul>
        {shop.length > 0 && <p class="dim small">{t('tools.shopHint')}</p>}
      </div>
      <div class="foot">{t('tools.shelfHint')}</div>
    </aside>
  );
}
