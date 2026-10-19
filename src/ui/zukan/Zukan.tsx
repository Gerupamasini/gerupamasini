import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ModelPreview } from './ModelPreview';
import type { App } from '../../app/App';
import { t, ui } from '../store';
import type { IndividualRecord } from '../../creatures/Individual';
import { CardHead } from '../common/Icons';
import { formatJst } from '../../core/Time';
import { EMPTY_FILTERS, filterCatalog, isKnown, livesOnMap, TAXA, type CatalogFilters } from './catalog';

/** A filtered field guide; compact screens navigate between its index and specimen plate. */
export function Zukan({ app }: { app: App }) {
  const enc = app.encyclopedia;
  const progress = enc.progress.value;
  const species = [...app.data.species.values()];
  const [sel, setSel] = useState(species.find(s => isKnown(progress[s.id]))?.id ?? species[0]?.id ?? '');
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [section, setSection] = useState('overview');
  const [selected, setSelected] = useState(false);
  const compactQuery = '(max-width: 720px), (pointer: coarse) and (max-width: 1100px)';
  const [compact, setCompact] = useState(() => window.matchMedia(compactQuery).matches);
  const dialogRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = filterCatalog(species, progress, app.data.maps, filters);
  const changeFilter = (patch: Partial<CatalogFilters>) => { setFilters(f => ({ ...f, ...patch })); setSelected(false); if (listRef.current) listRef.current.scrollTop = 0; };
  const showDetail = !compact || selected;
  useEffect(() => {
    const media = window.matchMedia(compactQuery);
    const resize = () => setCompact(media.matches);
    media.addEventListener('change', resize);
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('.card-head button')?.focus({ preventScroll: true });
    return () => { media.removeEventListener('change', resize); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const [playing, setPlaying] = useState<string | null>(null);
  const sp = visible.find(s => s.id === sel) ?? visible[0];
  const p = sp ? progress[sp.id] : undefined;
  const known = isKnown(p);
  const detailWasOpen = useRef(false);
  useLayoutEffect(() => {
    if (compact && selected) detailRef.current?.querySelector<HTMLButtonElement>('.zukan-back')?.focus({ preventScroll: true });
    else if (compact && detailWasOpen.current) listRef.current?.querySelector<HTMLButtonElement>(`[data-species="${sp?.id}"]`)?.focus({ preventScroll: true });
    detailWasOpen.current = compact && selected;
  }, [compact, selected, sp?.id]);
  void ui.settings.value;
  const quality = app.activeQuality;
  const photo = quality === 'minimal';
  const [previewError, setPreviewError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const stageName = (id: string) => sp?.stages.find((s) => s.id === id)?.ja ?? id;
  const traitName = (id: string) => sp?.traits.find((s) => s.id === id)?.ja ?? id;
  const inds = p?.individuals ?? [];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<ModelPreview | null>(null);
  useEffect(() => {
    if (!showDetail || photo || !known || !canvasRef.current) return;
    try {
      const pv = new ModelPreview(canvasRef.current, quality);
      previewRef.current = pv;
      const observer = new ResizeObserver(() => pv.resize());
      observer.observe(canvasRef.current);
      return () => { observer.disconnect(); pv.dispose(); previewRef.current = null; };
    } catch (e) { console.warn('[preview] unavailable', e); setPreviewError(true); }
  }, [showDetail, photo, quality, known, retry]);
  useEffect(() => {
    const pv = previewRef.current;
    setLoading(false);
    if (!showDetail || photo || !sp || !known) { setPreviewError(false); return; }
    if (!pv) { setPreviewError(true); return; }
    setPreviewError(false);
    setPlaying(null);
    let cancelled = false;
    setLoading(true);
    void pv.show(sp, sp.model.clips.idle).catch((e) => {
      if (!cancelled) { console.warn('[preview] failed', e); setPreviewError(true); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; pv.clear(); };
  }, [sp?.id, known, showDetail, photo, quality, retry]);
  useEffect(() => { setSection('overview'); setPlaying(null); if (detailRef.current) detailRef.current.scrollTop = 0; }, [sp?.id]);
  // a recorded behaviour plays its clip in the plate (species whose shapes have no clips just show the note)
  const play = (b: { id: string; clip?: string }) => {
    const pv = previewRef.current;
    if (!sp || !p?.behaviors[b.id]) return;
    setPlaying(b.id);
    if (pv && b.clip) void pv.show(sp, b.clip).catch(() => setPreviewError(true));
  };
  const playingDef = sp?.encyclopedia.behaviors.find((b) => b.id === playing);
  const found = species.filter((s) => progress[s.id]?.discovered || progress[s.id]?.captured).length;
  const largest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm > a.length_mm ? b : a), null);
  const smallest = inds.reduce<IndividualRecord | null>((a, b) => (!a || b.length_mm < a.length_mm ? b : a), null);
  const recordedCount = sp ? sp.encyclopedia.behaviors.filter((b) => p?.behaviors[b.id]).length : 0;
  return (
    <div class="screen center zukan-screen">
      <div ref={dialogRef} class={`card zukan field-guide ${selected ? 'has-selection' : ''}`} role="dialog" aria-modal="true" aria-label={t('zukan.title')}
        onKeyDown={e => {
          // Native form navigation must not trigger the game's Tab/Space bindings.
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); app.closeOverlay(); }
          if (e.key === 'Tab') {
            const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        }}>
        <CardHead
          eyebrow="TIDAL FIELD NOTES / 干潟の観察帳"
          title={t('zukan.title')}
          aside={<span>{t('progress.research')} <b class="num">{enc.research.value}</b></span>}
          onClose={() => app.closeOverlay()}
          closeKey="Esc"
        />
        <div class="zukan-discovery">
          <span>出会ったいきもの <b class="num">{found}</b><span class="dim"> / {species.length} 種</span></span>
          <progress value={found} max={species.length || 1} aria-label="図鑑の発見状況" />
          <span class="num dim">{species.length ? Math.round(found / species.length * 100) : 0}%</span>
        </div>
        <div class="zukan-tools">
          <label class="zukan-search"><span>名前で探す</span><input type="search" aria-label="生物名を検索" placeholder="名前を入力…" value={filters.query} onInput={e => changeFilter({ query: e.currentTarget.value })} /></label>
          <label><span>分類</span><select aria-label="生物の分類" value={filters.taxon} onChange={e => changeFilter({ taxon: e.currentTarget.value })}><option value="">すべての分類</option>{TAXA.filter(taxon => species.some(s => s.taxon.group === taxon.id)).map(taxon => <option key={taxon.id} value={taxon.id}>{taxon.ja}</option>)}</select></label>
          <label><span>干潟</span><select aria-label="干潟で絞り込む" value={filters.map} onChange={e => changeFilter({ map: e.currentTarget.value })}><option value="">すべての干潟</option>{[...app.data.maps.values()].map(map => <option key={map.id} value={map.id}>{map.names.ja}</option>)}</select></label>
          <label><span>記録</span><select aria-label="発見状況" value={filters.status} onChange={e => changeFilter({ status: e.currentTarget.value })}><option value="">すべての記録</option><option value="known">発見済み</option><option value="unknown">未発見</option><option value="captured">採集済み</option></select></label>
        </div>
        <div class="zukan-body">
          <section class="zukan-index" aria-label="生物の一覧">
            <div class="zukan-index-head"><span aria-live="polite">{visible.length} 種を表示</span>{Object.values(filters).some(Boolean) && <button class="btn ghost sm" onClick={() => changeFilter(EMPTY_FILTERS)}>絞り込み解除</button>}</div>
            <div class="zukan-catalog" ref={listRef}>
              {TAXA.map(taxon => {
                const entries = visible.filter(s => s.taxon.group === taxon.id);
                if (!entries.length) return null;
                return <section class="zukan-group" key={taxon.id} aria-label={taxon.ja}>
                  <h3>{taxon.ja}<span class="num">{entries.filter(s => isKnown(progress[s.id])).length} / {entries.length}</span></h3>
                  <ul class="zukan-list">
                    {entries.map(s => {
                      const pp = progress[s.id], k = isKnown(pp);
                      return <li key={s.id}><button class={`zukan-item ${s.id === sp?.id ? 'on' : ''} ${k ? 'is-known' : 'is-unknown'}`} aria-pressed={s.id === sp?.id} data-species={s.id} onClick={() => { setSel(s.id); setSelected(true); }}>
                        {k && <img class="zukan-thumb" src={`${import.meta.env.BASE_URL}data/photos/${s.id}.jpg`} alt="" loading="lazy" width="64" height="48" />}
                        <span class="zukan-item-text"><span class={`name ${k ? '' : 'unknown'}`}>{s.names.ja}</span>
                          {k && <span class="status-dots"><i class={pp?.discovered ? 'on' : ''}>{t('zukan.discovered')}</i><i class={pp?.observed ? 'on' : ''}>{t('zukan.observed')}</i>{s.collectable && <i class={pp?.captured ? 'on' : ''}>{t('zukan.captured')}</i>}</span>}
                        </span>
                        <span class="zukan-item-arrow" aria-hidden="true">›</span>
                      </button></li>;
                    })}
                  </ul>
                </section>;
              })}
              {!visible.length && <div class="zukan-no-results"><h3>該当するいきものがいません</h3><p>名前や絞り込み条件を変えて探してみましょう。</p><button class="btn sm" onClick={() => changeFilter(EMPTY_FILTERS)}>すべて表示</button></div>}
            </div>
          </section>
          {sp && showDetail && (
            <div class="zukan-detail" ref={detailRef}>
              <button class="btn ghost sm zukan-back" onClick={() => setSelected(false)}>‹ 一覧に戻る</button>
              <div class="zukan-detail-heading">
                {known && <span class="eyebrow">{TAXA.find(taxon => taxon.id === sp.taxon.group)?.ja}{sp.taxon.family ? ` / ${sp.taxon.family}` : ''}</span>}
                <h3>{sp.names.ja}</h3>
                {known && <div class="sci">{sp.names.sci}</div>}
              </div>
              {known && <>
              <div class="zukan-plate">
                {photo ? <img class="zukan-preview zukan-photo" src={`${import.meta.env.BASE_URL}data/photos/${sp.id}.jpg`} alt={`${sp.names.ja}の3Dモデルの静止画像`} width="640" height="400" /> : <canvas key={`${quality}-${retry}`} ref={canvasRef} class="zukan-preview" aria-label={`${sp.names.ja}の3Dモデル。ドラッグで回転、ピンチで拡大縮小`} />}
                <span class="zukan-plate-caption">{photo ? 'モデルの静止画像' : 'ドラッグで回転 · 拡大縮小'}</span>
                {loading && <p class="small dim" role="status">モデルを読み込み中…</p>}
                {previewError && !photo && <div class="preview-error" role="alert">表示できませんでした。<button class="btn sm" onClick={() => setRetry(retry + 1)}>再読み込み</button></div>}
              </div>
              <div class="zukan-sections" aria-label="記録の種類">
                <button class={`btn sm ${section === 'overview' ? 'on' : ''}`} aria-pressed={section === 'overview'} onClick={() => setSection('overview')}>生態</button>
                <button class={`btn sm ${section === 'behaviors' ? 'on' : ''}`} aria-pressed={section === 'behaviors'} onClick={() => setSection('behaviors')}>行動 <span class="num">{recordedCount}/{sp.encyclopedia.behaviors.length}</span></button>
                {sp.collectable && <button class={`btn sm ${section === 'individuals' ? 'on' : ''}`} aria-pressed={section === 'individuals'} onClick={() => setSection('individuals')}>採集 <span class="num">{inds.length}</span></button>}
              </div>
              {section === 'overview' && <section class="zukan-notes" aria-label="生態の記録">
              <div class="tags">
                {!sp.collectable && <span class="tag">{t('zukan.notCollectable')}</span>}
                {sp.encyclopedia.placeholderModel && <span class="tag warn">{t('zukan.placeholder')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.maleSeen ? 'on' : ''}`}>{t('zukan.male')}</span>}
                {sp.sex.dimorphic && <span class={`tag ${p?.femaleSeen ? 'on' : ''}`}>{t('zukan.female')}</span>}
              </div>
              <p class="desc">{sp.encyclopedia.description}</p>
              <div class="habitat">{t('zukan.habitat')} ・ {sp.encyclopedia.habitatHint}</div>
              <div class="zukan-locations"><span>出現する干潟</span><div>{[...app.data.maps.values()].filter(map => livesOnMap(sp, map)).map(map => <span class="tag" key={map.id}>{map.names.ja}</span>)}</div><small class="dim">季節・潮位・時間によって出会いやすさは変わります。</small></div>
              </section>}
              {section === 'behaviors' && <section aria-label="行動の記録">
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
              </section>}
              {section === 'individuals' && sp.collectable && (
                <div>
                  <h4>{t('zukan.individuals')} <span class="num" style={{ marginLeft: '8px' }}>{inds.length}</span></h4>
                  {largest && (
                    <div class="ind-stats">
                      <span>{t('zukan.largest')} <span class="num">{(largest.length_mm / 10).toFixed(1)} cm</span></span>
                      {smallest && smallest !== largest && <span>{t('zukan.smallest')} <span class="num">{(smallest.length_mm / 10).toFixed(1)} cm</span></span>}
                    </div>
                  )}
                  {!inds.length && <p class="dim small">採集すると、体長や重さを記録できます。</p>}
                  {inds.length > 0 && (
                    <div class="zukan-table-wrap"><table class="ind-table">
                      <thead><tr><th>個体番号</th><th>体長</th><th>重さ</th><th>性別</th><th>成長・特徴</th></tr></thead>
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
                    </table></div>
                  )}
                </div>
              )}
              </>}
            </div>
          )}
          {!sp && <div class="zukan-detail zukan-empty-selection" aria-hidden="true">TIDAL FIELD NOTES</div>}
        </div>
      </div>
    </div>
  );
}
