import type { EquipmentCategory, EquipmentStyle } from '../../aquarium/catalog';

/** A small design sample; the actual model is visible beside the equipment drawer. */
export function EquipmentSwatch({ style, category, large = false }: { style: EquipmentStyle; category: EquipmentCategory; large?: boolean }) {
  const silhouette = category === 'stand' ? 'cabinet' : category === 'tank' || category === 'glassLid' ? 'tank' : category === 'ledLight' || category === 'lightFixture' ? 'bar' : category === 'airStone' || category === 'spongeFilter' ? 'stone' : 'device';
  return <span class={`equipment-swatch finish-${style} silhouette-${silhouette} ${large ? 'large' : ''}`} aria-hidden="true"><i /><b /></span>;
}
