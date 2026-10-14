import type { App } from '../../app/App';
import type { IndividualRecord } from '../../creatures/Individual';

export function SpecimenPicker({ app, items, selected, onSelect }: { app: App; items: IndividualRecord[]; selected?: string; onSelect: (id: string) => void }) {
  return <div class="mobile-specimen-grid" aria-label="生物を選ぶ">
    {items.map((r) => <button class={`btn mobile-specimen ${r.id === selected ? 'on' : ''}`} key={r.id} aria-pressed={r.id === selected} onClick={() => onSelect(r.id)}>
      <b>{app.data.species.get(r.speciesId)?.names.ja ?? r.speciesId}</b><span class="num">{(r.length_mm / 10).toFixed(1)} cm <small>#{r.number}</small></span>
    </button>)}
  </div>;
}
