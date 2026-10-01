import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { App } from '../../app/App';
import { t } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';

function fmtInd(r: IndividualRecord): string {
  return `#${String(r.number).padStart(4, '0')}  ${t('individual.length')} ${(r.length_mm / 10).toFixed(1)} cm  ${t('individual.weight')} ${r.weight_g.toFixed(1)} g  ${t(`sex.${r.sex}`)}`;
}

export function Zukan({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const progress = enc.progress.value;
  const species = [...app.data.species.values()];
  const [sel, setSel] = useState(species[0]?.id ?? '');
  const sp = app.data.species.get(sel);
  const p = sp ? progress[sp.id] : undefined;
  const known = !!(p?.discovered || p?.captured);
  const stageName = (id: string) => sp?.stages.find((s) => s.id === id)?.ja ?? id;
  const traitName = (id: string) => sp?.traits.find((s) => s.id === id)?.ja ?? id;
  const inds = p?.individuals ?? [];
  const largest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm > a.length_mm ? b : a), null);
  const smallest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm < a.length_mm ? b : a), null);
  return (
    <div class="screen center">
      <div class="card zukan">
        <div class="zukan-head">
          <h2>{t('zukan.title')}</h2>
          <span class="dim">{t('progress.research')} <b>{enc.research.value}</b></span>
          <button onClick={() => app.closeOverlay()}>{t('zukan.close')}</button>
        </div>
        <div class="zukan-body">
          <ul class="zukan-list">
            {species.map((s) => {
              const pp = progress[s.id];
              const k = !!(pp?.discovered || pp?.captured);
              return (
                <li key={s.id} class={s.id === sel ? 'on' : ''} onClick={() => setSel(s.id)}>
                  <span class="name">{k ? s.names.ja : t('zukan.unknown')}</span>
                  <span class="flags">
                    <i class={pp?.discovered ? 'on' : ''}>{t('zukan.discovered')}</i>
                    <i class={pp?.observed ? 'on' : ''}>{t('zukan.observed')}</i>
                    {s.collectable && <i class={pp?.captured ? 'on' : ''}>{t('zukan.captured')}</i>}
                  </span>
                </li>
              );
            })}
          </ul>
          {sp && (
            <div class="zukan-detail">
              <h3>{known ? sp.names.ja : t('zukan.unknown')} <span class="dim small">{known ? sp.names.sci : ''}</span></h3>
              <div class="tags">
                {!sp.collectable && <span class="tag">{t('zukan.notCollectable')}</span>}
                {sp.encyclopedia.placeholderModel && <span class="tag warn">{t('zukan.placeholder')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.maleSeen ? 'on' : ''}`}>{t('zukan.male')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.femaleSeen ? 'on' : ''}`}>{t('zukan.female')}</span>}
              </div>
              <p>{known ? sp.encyclopedia.description : '―'}</p>
              <p class="dim small">{t('zukan.habitat')}: {known ? sp.encyclopedia.habitatHint : '？'}</p>
              <h4>{t('zukan.behaviors')}</h4>
              <ul class="behaviors">
                {sp.encyclopedia.behaviors.map((b) => (
                  <li key={b.id} class={p?.behaviors[b.id] ? 'on' : ''}>
                    <span>{p?.behaviors[b.id] ? '✓' : '○'} {b.ja}</span>
                    <span class="dim small">{b.hint ?? ''}</span>
                  </li>
                ))}
              </ul>
              {sp.collectable && (
                <div>
                  <h4>{t('zukan.individuals')} ({inds.length})</h4>
                  {largest && <div class="small">{t('zukan.largest')}: {fmtInd(largest)}</div>}
                  {smallest && smallest !== largest && <div class="small">{t('zukan.smallest')}: {fmtInd(smallest)}</div>}
                  <ul class="individuals">
                    {inds.slice().reverse().slice(0, 30).map((r) => (
                      <li key={r.id}>{fmtInd(r)} <span class="dim">{stageName(r.stage)} {r.traits.map(traitName).join(' ')}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
