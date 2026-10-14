import { TANK_SIZES, type EquipmentLayout, type TankSize } from './state';

export const FILTER_KINDS = ['filter', 'spongeFilter', 'topFilter', 'canisterFilter'] as const;
export type FilterKind = typeof FILTER_KINDS[number];
export const isFilterKind = (kind: string): kind is FilterKind => (FILTER_KINDS as readonly string[]).includes(kind);
export const FILTER_MAX_LEVEL = 5;
export const MAX_TANK_ANIMALS = 20;
export const TANK_UNLOCK_COST: Record<TankSize, number> = { 45: 150, 60: 0, 90: 450, 120: 900 };
export const TANK_ANIMAL_LIMIT: Record<TankSize, number> = { 45: 6, 60: 10, 90: 16, 120: MAX_TANK_ANIMALS };
export const FILTER_SPECS: Record<FilterKind, { unlock: number; capacities: number[]; upgrades: number[] }> = {
  filter: { unlock: 0, capacities: [4, 5, 6, 7, 8], upgrades: [50, 100, 150, 200] },
  spongeFilter: { unlock: 150, capacities: [5, 6, 7, 8, 9], upgrades: [75, 125, 175, 225] },
  topFilter: { unlock: 300, capacities: [6, 8, 10, 12, 14], upgrades: [100, 150, 225, 300] },
  canisterFilter: { unlock: 500, capacities: [8, 11, 14, 17, 20], upgrades: [150, 225, 300, 450] },
};
export interface AquariumProgression {
  version: 1;
  sizes: TankSize[];
  filters: Record<FilterKind, number>;
  visitedField: boolean;
  questRewards: string[];
}
export const initialProgression = (): AquariumProgression => ({ version: 1, sizes: [60], filters: { filter: 1, spongeFilter: 0, topFilter: 0, canisterFilter: 0 }, visitedField: false, questRewards: [] });
export function normalizeProgression(raw: unknown): AquariumProgression {
  const p = initialProgression();
  if (!raw || typeof raw !== 'object' || (raw as AquariumProgression).version !== 1) return p;
  const r = raw as AquariumProgression;
  p.sizes = TANK_SIZES.filter(s => s === 60 || Array.isArray(r.sizes) && r.sizes.includes(s));
  for (const kind of FILTER_KINDS) {
    const level = r.filters?.[kind];
    p.filters[kind] = Number.isSafeInteger(level) ? Math.max(kind === 'filter' ? 1 : 0, Math.min(FILTER_MAX_LEVEL, level)) : p.filters[kind];
  }
  p.visitedField = r.visitedField === true;
  p.questRewards = Array.isArray(r.questRewards) ? [...new Set(r.questRewards.filter(id => INTRO_QUESTS.some(q => q.id === id)))] : [];
  return p;
}
export const tankUnlocked = (p: AquariumProgression, size: TankSize): boolean => p.sizes.includes(size);
export const filterCapacity = (p: AquariumProgression, kind: FilterKind): number => FILTER_SPECS[kind].capacities[p.filters[kind] - 1] ?? 0;
export const installedFilter = (layout: EquipmentLayout): FilterKind | undefined => layout.devices.find(d => isFilterKind(d.kind))?.kind as FilterKind | undefined;
export const tankAnimalCapacity = (size: TankSize, layout: EquipmentLayout, p: AquariumProgression): number => {
  const kind = installedFilter(layout);
  return Math.min(TANK_ANIMAL_LIMIT[size], kind ? filterCapacity(p, kind) : 0);
};
/** Unlocks and levels apply to a type in every room; finishes remain a separate collection. */
export function buyAquariumUpgrade(p: AquariumProgression, money: number, type: 'tank' | 'filter', id: TankSize | FilterKind): { progression: AquariumProgression; money: number; cost: number } | null {
  if (!Number.isFinite(money) || money < 0) return null;
  let cost: number, next = structuredClone(p);
  if (type === 'tank') {
    if (!(TANK_SIZES as readonly (number | string)[]).includes(id) || p.sizes.includes(id as TankSize)) return null;
    cost = TANK_UNLOCK_COST[id as TankSize]; next.sizes.push(id as TankSize);
  } else {
    if (!isFilterKind(String(id))) return null;
    const kind = id as FilterKind, level = p.filters[kind];
    if (level >= FILTER_MAX_LEVEL) return null;
    cost = level ? FILTER_SPECS[kind].upgrades[level - 1] : FILTER_SPECS[kind].unlock;
    next.filters[kind] = level + 1;
  }
  return money < cost ? null : { progression: next, money: money - cost, cost };
}

export interface IntroQuestState { discovered: number; captures: number; behaviors: number; tankAnimals: number; tankCount: number }
export const INTRO_QUESTS = [
  { id: 'field', title: '干潟へ出かける', hint: '「干潟へ」から場所を選んで出発。', cr: 100 },
  { id: 'discover', title: '生き物を図鑑に登録', hint: '干潟で生き物を観察、または採集。', cr: 150 },
  { id: 'capture', title: '初めての採集', hint: '水際は網、砂の中の貝はスコップ。', cr: 150 },
  { id: 'aquarium', title: '水槽に生き物を入れる', hint: '持ち帰ったら「水槽」でケースから移す。', cr: 150 },
  { id: 'level', title: 'ろ過装置を強化する', hint: 'ショップの「フィルター」でLv.2へ。', cr: 100 },
  { id: 'filter', title: '新しいフィルターを解放', hint: 'ショップで水中フィルター以外を解放。', cr: 150 },
  { id: 'size', title: '新しいサイズの水槽を解放', hint: 'ショップの「水槽」でサイズを解放。', cr: 150 },
  { id: 'room', title: '部屋に2台の水槽を設置', hint: 'Lv.5で「水槽 → 部屋に設置 → ＋追加」。', cr: 150 },
  { id: 'behavior', title: '生き物の行動を記録', hint: '干潟や水槽で、食事・遊泳などを観察。', cr: 100 },
] as const;
export function questComplete(id: string, p: AquariumProgression, s: IntroQuestState): boolean {
  switch (id) {
    case 'field': return p.visitedField;
    case 'discover': return s.discovered > 0;
    case 'capture': return s.captures > 0;
    case 'aquarium': return s.tankAnimals > 0;
    case 'level': return FILTER_KINDS.some(k => p.filters[k] >= 2);
    case 'filter': return FILTER_KINDS.some(k => k !== 'filter' && p.filters[k] > 0);
    case 'size': return p.sizes.some(size => size !== 60);
    case 'room': return s.tankCount >= 2;
    case 'behavior': return s.behaviors > 0;
    default: return false;
  }
}
export function claimIntroQuests(p: AquariumProgression, state: IntroQuestState): { progression: AquariumProgression; awarded: number; titles: string[] } {
  const quests = INTRO_QUESTS.filter(q => !p.questRewards.includes(q.id) && questComplete(q.id, p, state));
  return { progression: quests.length ? { ...p, questRewards: [...p.questRewards, ...quests.map(q => q.id)] } : p,
    awarded: quests.reduce((n, q) => n + q.cr, 0), titles: quests.map(q => q.title) };
}

/** Keep all initial positions inside the tank even after its animal limit grows. */
export function animalSlotPosition(index: number, count: number, width: number, depth: number): [number, number] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * width / depth))), rows = Math.ceil(count / columns);
  return [((index % columns + 0.5) / columns - 0.5) * (width - 0.08), ((Math.floor(index / columns) + 0.5) / rows - 0.5) * (depth - 0.06)];
}
