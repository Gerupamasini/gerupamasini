import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t } from '../store';
import { researchFor } from '../../systems/Encyclopedia';
import { Key } from '../common/Icons';
import { SpecimenPicker } from '../common/SpecimenPicker';
import { usePanelViewport } from '../common/usePanelViewport';

/** The case set down on the flat: who is in it, with a way to let each go or hand it to the lab. */
export function CaseOverlay({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const inCase = enc.caseItems.value;
  const [selected, setSelected] = useState(inCase[0]?.id);
  const panel = useRef<HTMLElement>(null);
  usePanelViewport(app, panel, app.camera);
  const chosen = inCase.find((r) => r.id === selected) ?? inCase[0];
  if (app.input.touchDevice) return <aside class="glass drawer case-drawer mobile-case-panel" ref={panel}>
    <div class="drawer-head"><h2>{t('case.title')} {inCase.length}/{enc.caseMax}</h2><button class="btn ghost sm" onClick={() => app.closeCase()}>{t('home.back')}</button></div>
    <div class="drawer-body">
      <SpecimenPicker app={app} items={inCase} selected={chosen?.id} onSelect={setSelected} />
      {chosen ? <div class="mobile-specimen-detail">
        <span class="small dim">{t(`sex.${chosen.sex}`)} ・ {chosen.weight_g.toFixed(1)} g ・ 研究P {enc.research.value}</span>
        <div class="mobile-specimen-actions"><button class="btn" onClick={() => app.caseRelease(chosen)}>{t('case.release')}</button><button class="btn" onClick={() => app.caseToResearch(chosen)}>{t('case.toResearch')} +{researchFor(chosen)}</button></div>
      </div> : <p class="dim small">{t('case.empty')}</p>}
    </div>
  </aside>;
  return (
    <aside class="glass drawer case-drawer" ref={panel}>
      <div class="drawer-head">
        <h2>{t('case.title')} <span class="num" style={{ marginLeft: '8px' }}>{inCase.length} / {enc.caseMax}</span></h2>
        <button class="btn ghost sm" onClick={() => app.closeCase()}>{t('home.back')} <Key k="Q" /></button>
      </div>
      <div class="drawer-body">
        {inCase.length ? (
          <ul class="case-list">
            {inCase.map((r) => {
              const sp = app.data.species.get(r.speciesId);
              return (
                <li key={r.id}>
                  <span><b>{sp?.names.ja ?? r.speciesId}</b> <span class="num dim">#{String(r.number).padStart(4, '0')}</span><br /><span class="dim small">{(r.length_mm / 10).toFixed(1)} cm ・ {t(`sex.${r.sex}`)}</span></span>
                  <span class="acts">
                    <button onClick={() => app.caseRelease(r)}>{t('case.release')}</button>
                    <button onClick={() => app.caseToResearch(r)}>{t('case.toResearch')} +{researchFor(r)}</button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <p class="dim small">{t('case.empty')}</p>}
        <div class="stat-row" style={{ marginTop: '10px' }}><span>{t('home.research')}</span><span class="num">{enc.research.value.toLocaleString()}</span></div>
      </div>
      <div class="foot">{app.input.touchDevice ? '1本指で回転・2本指で拡大。「戻る」で干潟へ。' : t('case.hint')}</div>
    </aside>
  );
}
