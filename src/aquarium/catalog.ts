import { EQUIPMENT_KINDS, EQUIPMENT_LABELS, type EquipmentKind, type EquipmentLayout } from './state';

export type EquipmentCategory = 'tank' | 'stand' | EquipmentKind;
export type EquipmentStyle = 'classic' | 'ivory' | 'studio';
export interface EquipmentItem {
  id: string;
  category: EquipmentCategory;
  name: string;
  description: string;
  style: EquipmentStyle;
  rarity: 'initial' | 'N' | 'R';
  stand?: 'wood' | 'metal';
}
export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ['tank', 'stand', ...EQUIPMENT_KINDS];
export const CATEGORY_LABELS: Record<EquipmentCategory, string> = { tank: '水槽本体', stand: '水槽台', ...EQUIPMENT_LABELS };
const INITIAL_NAMES: Record<EquipmentCategory, string> = {
  tank: 'クリアガラス水槽 60', stand: 'オークキャビネット 60',
  glassLid: 'クリアガラス蓋', lightFixture: 'ベーシックライトバー', ledLight: 'デイライトLED 60',
  filter: 'ベーシック水中フィルター', canisterFilter: 'クラシック外部フィルター', topFilter: 'ベーシック上部フィルター',
  spongeFilter: 'クラシックスポンジフィルター', airPump: 'クラシックエアポンプ', airStone: 'セラミックエアストーン',
  heater: 'ガラス管ヒーター', thermometer: 'デジタル水温計', thermostat: 'ベーシックサーモスタット',
  flowPump: 'ベーシック水流ポンプ', circulationPump: 'ミニ循環ポンプ', chiller: 'クラシッククーラー', powerStrip: 'ベーシック6口タップ',
};
const DESCRIPTIONS: Record<EquipmentCategory, string> = {
  tank: '幅60cmのガラス水槽。生物がよく見える、すっきりしたシルエット。',
  stand: '水槽を支える高さ73cmの台。裏側に配線・ホースをまとめられます。',
  glassLid: '水面を覆うガラス蓋。背面には設備用のすき間があります。',
  lightFixture: '支持アーム付きのライトバー。水槽の上からやさしく照らします。',
  ledLight: '薄型のLEDバー。水面と生物を明るく見せるインテリアです。',
  filter: '水槽の壁面に取り付けるコンパクトなフィルター。',
  canisterFilter: '水槽台の中に置く外部フィルター。吸水・戻りのホースが付属します。',
  topFilter: '水槽の上に置くフィルターボックス。水の戻り口を備えています。',
  spongeFilter: '気泡とスポンジを組み合わせた、水槽内のアクセント。',
  airPump: '水槽の背面に置くエアポンプ。エア用品のホースは自動でつながります。',
  airStone: '細かな気泡が立ち上るエアストーン。底面の好きな位置に置けます。',
  heater: '吸盤で取り付けるヒーター。コードは背面にまとめられます。',
  thermometer: '水温を表示する小さなメーター。見やすい位置に取り付けられます。',
  thermostat: '数値表示付きの温度コントローラー。水槽のそばに置けます。',
  flowPump: '水槽の壁に取り付ける水流ポンプ。向きを変えて飾れます。',
  circulationPump: '底面付近に設置する小型ポンプ。配管込みのデザインです。',
  chiller: '通気口付きのクーラー。水槽の横に置く存在感のある設備。',
  powerStrip: '配線をまとめる6口電源タップ。水槽の背面に設置します。',
};
export const initialItemId = (category: EquipmentCategory): string => `${category}-initial`;
export const EQUIPMENT_ITEMS: EquipmentItem[] = EQUIPMENT_CATEGORIES.flatMap((category) => [
  { id: initialItemId(category), category, name: INITIAL_NAMES[category], description: DESCRIPTIONS[category], style: 'classic' as const, rarity: 'initial' as const, ...(category === 'stand' ? { stand: 'wood' as const } : {}) },
  { id: `${category}-ivory`, category, name: category === 'stand' ? 'アイボリーキャビネット 60' : `アイボリー ${CATEGORY_LABELS[category]}`, description: `${DESCRIPTIONS[category]} 明るいアイボリーの仕上げ。`, style: 'ivory' as const, rarity: 'N' as const, ...(category === 'stand' ? { stand: 'wood' as const } : {}) },
  { id: `${category}-studio`, category, name: category === 'stand' ? 'スタジオメタルフレーム 60' : `スタジオ ${CATEGORY_LABELS[category]}`, description: `${DESCRIPTIONS[category]} 金属とチャコールを合わせた落ち着いた仕上げ。`, style: 'studio' as const, rarity: 'R' as const, ...(category === 'stand' ? { stand: 'metal' as const } : {}) },
]);
const ITEMS = new Map(EQUIPMENT_ITEMS.map((i) => [i.id, i]));
export const equipmentItem = (id: string | undefined): EquipmentItem | undefined => id ? ITEMS.get(id) : undefined;
export const itemsForCategory = (category: EquipmentCategory): EquipmentItem[] => EQUIPMENT_ITEMS.filter((i) => i.category === category);
export function itemForCategory(id: string | undefined, category: EquipmentCategory): EquipmentItem {
  const item = equipmentItem(id); return item?.category === category ? item : ITEMS.get(initialItemId(category))!;
}
export const MULTIPLE_EQUIPMENT = new Set<EquipmentCategory>(['ledLight', 'spongeFilter', 'airPump', 'airStone', 'flowPump', 'circulationPump', 'powerStrip']);
export const categoryLimit = (category: EquipmentCategory): number => MULTIPLE_EQUIPMENT.has(category) ? 4 : 1;

export const INITIAL_GACHA_TICKETS = 10;
export const RESEARCH_PER_GACHA_TICKET = 100;
export interface EquipmentCollection { version: 1; stock: Record<string, number>; draws: number; tickets: number; researchClaimed?: number }
export const emptyEquipmentCollection = (): EquipmentCollection => ({ version: 1, stock: {}, draws: 0, tickets: INITIAL_GACHA_TICKETS });
/** Initial items are always available; acquired items have real quantities for multiple placement. */
export function ownedQuantity(collection: EquipmentCollection, id: string): number {
  const item = equipmentItem(id); return item?.rarity === 'initial' ? Infinity : collection.stock[id] ?? 0;
}
export function usedQuantity(layout: EquipmentLayout, id: string, excluding?: string): number {
  return Number(excluding !== 'tank' && layout.tankItemId === id) + Number(excluding !== 'stand' && layout.standItemId === id) + layout.devices.filter((d) => d.id !== excluding && d.itemId === id).length;
}
export function normalizeCollection(raw: unknown, legacyLayout?: EquipmentLayout): EquipmentCollection {
  const result = emptyEquipmentCollection();
  if (raw && typeof raw === 'object' && (raw as EquipmentCollection).version === 1) {
    const r = raw as EquipmentCollection;
    if (r.stock && typeof r.stock === 'object') for (const [id, count] of Object.entries(r.stock)) {
      if (equipmentItem(id)?.rarity !== 'initial' && equipmentItem(id) && Number.isFinite(count) && count >= 1) result.stock[id] = Math.min(9999, Math.floor(count));
    }
    result.draws = Number.isFinite(r.draws) ? Math.max(0, Math.floor(r.draws)) : 0;
    if (Number.isSafeInteger(r.researchClaimed) && r.researchClaimed! >= 0) result.researchClaimed = r.researchClaimed;
    // Only saves without a ticket balance receive the welcome grant. A spent balance stays zero.
    if (Object.prototype.hasOwnProperty.call(r, 'tickets')) result.tickets = Number.isFinite(r.tickets) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(r.tickets))) : 0;
  } else if (legacyLayout) {
    // Existing saves keep their metal stand and any previously equipped valid designs.
    const ids = [legacyLayout.standItemId ?? (legacyLayout.stand === 'metal' ? 'stand-studio' : initialItemId('stand')), legacyLayout.tankItemId, ...legacyLayout.devices.map((d) => d.itemId)];
    for (const id of ids) if (id && equipmentItem(id)?.rarity !== 'initial' && equipmentItem(id)) result.stock[id] = (result.stock[id] ?? 0) + 1;
  }
  return result;
}
/** A malformed/imported save cannot equip designs or quantities outside its collection. */
export function ownedEquipmentLayout(layout: EquipmentLayout, collection: EquipmentCollection): EquipmentLayout {
  const used = new Map<string, number>();
  const choose = (id: string | undefined, category: EquipmentCategory): EquipmentItem => {
    let item = itemForCategory(id, category);
    if ((used.get(item.id) ?? 0) >= ownedQuantity(collection, item.id)) item = itemForCategory(undefined, category);
    used.set(item.id, (used.get(item.id) ?? 0) + 1); return item;
  };
  const tank = choose(layout.tankItemId, 'tank'), stand = choose(layout.standItemId ?? (layout.stand === 'metal' ? 'stand-studio' : undefined), 'stand');
  return { ...layout, tankItemId: tank.id, standItemId: stand.id, stand: stand.stand!, devices: layout.devices.map((d) => ({ ...d, position: [...d.position], itemId: choose(d.itemId, d.kind).id })) };
}

/** Each research milestone pays once, including after spent tickets and reloads. */
export function claimResearchTickets(collection: EquipmentCollection, research: number): { collection: EquipmentCollection; awarded: number } {
  if (!Number.isFinite(research) || research < 0) return { collection, awarded: 0 };
  const earned = Math.floor(research / RESEARCH_PER_GACHA_TICKET);
  const awarded = Math.max(0, earned - (collection.researchClaimed ?? 0));
  return awarded ? { collection: { ...collection, tickets: Math.min(Number.MAX_SAFE_INTEGER, collection.tickets + awarded), researchClaimed: earned }, awarded } : { collection, awarded: 0 };
}

export const GACHA_TICKET_COST = 1;
export const GACHA_POOL = EQUIPMENT_ITEMS.filter((i) => i.rarity !== 'initial');
const weight = (item: EquipmentItem): number => item.rarity === 'R' ? 1 : 4;
const TOTAL_WEIGHT = GACHA_POOL.reduce((n, i) => n + weight(i), 0);
export const gachaProbability = (id: string): number => { const item = GACHA_POOL.find((i) => i.id === id); return item ? weight(item) / TOTAL_WEIGHT : 0; };
export interface GachaResult { itemId: string; isNew: boolean; quantity: number }
export function drawEquipment(collection: EquipmentCollection, count: number, random: () => number = Math.random): { collection: EquipmentCollection; results: GachaResult[] } | null {
  if ((count !== 1 && count !== 10) || !Number.isSafeInteger(collection.tickets) || collection.tickets < GACHA_TICKET_COST * count) return null;
  const stock = { ...collection.stock }, results: GachaResult[] = [];
  for (let n = 0; n < count; n++) {
    const r = random(); if (!Number.isFinite(r) || r < 0 || r >= 1) return null;
    let pick = r * TOTAL_WEIGHT, item = GACHA_POOL[GACHA_POOL.length - 1];
    for (const candidate of GACHA_POOL) { pick -= weight(candidate); if (pick < 0) { item = candidate; break; } }
    const quantity = (stock[item.id] ?? 0) + 1; stock[item.id] = quantity;
    results.push({ itemId: item.id, isNew: quantity === 1, quantity });
  }
  return { collection: { ...collection, stock, draws: collection.draws + count, tickets: collection.tickets - GACHA_TICKET_COST * count }, results };
}
