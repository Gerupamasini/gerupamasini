import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ModelPreview } from './ModelPreview';
import type { App } from '../../app/App';
import { t } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';
import { CardHead } from '../common/Icons';
import { formatJst } from '../../core/Time';

/** The encyclopedia: every species down the left, the chosen one as a plate on the right. */
export function Zukan({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const progress = enc.progress.value;
  const species = [...app.data.species.values()];
  const [sel, setSel] = useState(species[0]?.id ?? '');
  const [playing, setPlaying] = useState<string | null>(null);
  const sp = app.data.species.get(sel);
  const p = sp ? progress[sp.id] : undefined;
  const known = !!(p?.discovered || p?.captured);
  const stageName = (id: string) => sp?.stages.find((s) => s.id === id)?.ja ?? id;
  const traitName = (id: string) => sp?.traits.find((s) => s.id === id)?.ja ?? id;
  const inds = p?.individuals ?? [];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<ModelPreview | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const pv = new ModelPreview(canvasRef.current);
    previewRef.current = pv;
    return () => { pv.dispose(); previewRef.current = null; };
  }, []);
  useEffect(() => {
    const pv = previewRef.current;
    if (!pv || !sp) return;
    setPlaying(null);
    if (known) void pv.show(sp, sp.model.clips.idle); else pv.clear();
  }, [sp?.id, known]);
  // a recorded behaviour plays its clip in the plate (species whose shapes have no clips just show the note)
  const play = (b: { id: string; clip?: string }) => {
    const pv = previewRef.current;
    if (!sp || !p?.behaviors[b.id]) return;
    setPlaying(b.id);
    if (pv && b.clip) void pv.show(sp, b.clip);
  };
  const playingDef = sp?.encyclopedia.behaviors.find((b) => b.id === playing);
  const found = species.filter((s) => progress[s.id]?.discovered || progress[s.id]?.captured).length;
  const largest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm > a.length_mm ? b : a), null);
  const smallest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm < a.length_mm ? b : a), null);
  const recordedCount = sp ? sp.encyclopedia.behaviors.filter((b) => p?.behaviors[b.id]).length : 0;
  return (
    <div class="screen center">
      <div class="card zukan">
        <CardHead
          eyebrow={`${t('zukan.found')} ${found} / ${species.length} ${t('zukan.species')}`}
          title={t('zukan.title')}
          aside={<span>{t('progress.research')} <b>{enc.research.value}</b></span>}
          onClose={() => app.closeOverlay()}
          closeKey="Tab"
        />
        <div class="zukan-body">
          <ul class="zukan-list" role="listbox">
            {species.map((s) => {
              const pp = progress[s.id];
              const k = !!(pp?.discovered || pp?.captured);
              return (
                <li key={s.id}>
                  <button class={`zukan-item ${s.id === sel ? 'on' : ''}`} onClick={() => setSel(s.id)} role="option" aria-selected={s.id === sel}>
                    <span class={`name ${k ? '' : 'unknown'}`}>{k ? s.names.ja : t('zukan.unknown')}</span>
                    <span class="status-dots">
                      <i class={pp?.discovered ? 'on' : ''}>{t('zukan.discovered')}</i>
                      <i class={pp?.observed ? 'on' : ''}>{t('zukan.observed')}</i>
                      {s.collectable && <i class={pp?.captured ? 'on' : ''}>{t('zukan.captured')}</i>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {sp && (
            <div class="zukan-detail">
              <h3>{known ? sp.names.ja : t('zukan.unknown')}</h3>
              <div class="sci">{known ? sp.names.sci : ''}</div>
              <canvas ref={canvasRef} class="zukan-preview" style={{ display: known ? 'block' : 'none' }} />
              {!known && <div class="zukan-preview empty">まだ出会っていない</div>}
              <div class="tags">
                {!sp.collectable && <span class="tag">{t('zukan.notCollectable')}</span>}
                {sp.encyclopedia.placeholderModel && <span class="tag warn">{t('zukan.placeholder')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.maleSeen ? 'on' : ''}`}>{t('zukan.male')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.femaleSeen ? 'on' : ''}`}>{t('zukan.female')}</span>}
              </div>
              <p class="desc">{known ? sp.encyclopedia.description : '干潟で出会うと、ここに姿と暮らしが記されます。'}</p>
              <div class="habitat">{t('zukan.habitat')} ・ {known ? sp.encyclopedia.habitatHint : '？'}</div>
              <h4>{t('zukan.behaviors')} <span class="num" style={{ marginLeft: '8px' }}>{recordedCount} / {sp.encyclopedia.behaviors.length}</span></h4>
              <ul class="behaviors">
                {sp.encyclopedia.behaviors.map((b) => {
                  const seen = p?.behaviors[b.id];
                  return (
                    <li key={b.id} class={`${seen ? 'on' : ''} ${playing === b.id ? 'playing' : ''}`}>
                      <button class="beh" disabled={!seen} onClick={() => play(b)} title={seen ? '観察の記録を見る' : undefined}>
                        <span class="mark">{seen ? '✓' : ''}</span>
                        <span class="bname">{b.ja}</span>
                        <span class="bhint">{seen ? b.hint ?? '' : '？'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {playingDef && p?.behaviors[playingDef.id] && (
                <div class="beh-note rise">
                  <span class="eyebrow">観察の記録 ・ <span class="num">{formatJst(p.behaviors[playingDef.id], { date: true })}</span></span>
                  <div><b>{playingDef.ja}</b> — {playingDef.hint}{playingDef.clip ? '' : '（この種は動きを再生できないので記録だけ）'}</div>
                </div>
              )}
              {sp.collectable && (
                <div>
                  <h4>{t('zukan.individuals')} <span class="num" style={{ marginLeft: '8px' }}>{inds.length}</span></h4>
                  {largest && (
                    <div class="ind-stats">
                      <span>{t('zukan.largest')} <span class="num">{(largest.length_mm / 10).toFixed(1)} cm</span></span>
                      {smallest && smallest !== largest && <span>{t('zukan.smallest')} <span class="num">{(smallest.length_mm / 10).toFixed(1)} cm</span></span>}
                    </div>
                  )}
                  {inds.length > 0 && (
                    <table class="ind-table">
                      <tbody>
                        {inds.slice().reverse().slice(0, 30).map((r) => (
                          <tr key={r.id}>
                            <td class="num dim">#{String(r.number).padStart(4, '0')}</td>
                            <td class="num">{(r.length_mm / 10).toFixed(1)} cm</td>
                            <td class="num">{r.weight_g.toFixed(1)} g</td>
                            <td>{t(`sex.${r.sex}`)}</td>
                            <td class="dim">{stageName(r.stage)} {r.traits.map(traitName).join(' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
