import { get, set, del } from 'idb-keyval';
import type { TicketState } from './GameClock';
import type { IndividualRecord } from '../creatures/Individual';
import type { TankLayout } from '../app/TankLayout';

export interface SpeciesProgress {
  discovered?: number;
  observed?: number;
  captured?: number;
  maleSeen?: number;
  femaleSeen?: number;
  behaviors: Record<string, number>;
  individuals: IndividualRecord[];
  nextNumber: number;
}

export interface SaveV1 {
  version: 1;
  createdAt: number;
  updatedAt: number;
  lastRealMs: number;
  player: {
    map: string; pos: [number, number, number]; heading: number; money: number; research: number;
    /** tools owned */
    tools: string[];
    /** tools carried to the flat, at most two, in key order */
    loadout?: string[];
    skills?: Record<string, number>;
    /** the observer level whose CR has been handed out */
    levelClaimed?: number;
  };
  ticket: { active: TicketState | null; usedCount: number };
  encyclopedia: Record<string, SpeciesProgress>;
  case: IndividualRecord[];
  tank: { individuals: IndividualRecord[]; lastSimMs: number; layout?: TankLayout };
  removedIndividuals: string[];
  stats: { playSeconds: number; captures: number; observations: number };
}

export type SaveData = SaveV1;
const KEY = 'save:slot1';

export function emptySave(map: string, now: number): SaveV1 {
  return {
    version: 1, createdAt: now, updatedAt: now, lastRealMs: now,
    player: { map, pos: [0, 0, 0], heading: 0, money: 0, research: 0, tools: [DEFAULT_NET, 'shovel'], loadout: [DEFAULT_NET, 'shovel'], skills: {}, levelClaimed: 1 },
    ticket: { active: null, usedCount: 0 },
    encyclopedia: {}, case: [], tank: { individuals: [], lastSimMs: now, layout: { substrate: 'sand', items: [] } }, removedIndividuals: [],
    stats: { playSeconds: 0, captures: 0, observations: 0 },
  };
}

function migrate(raw: unknown): SaveV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SaveV1>;
  if (s.version !== 1) return null;
  if (s.player) {
    if (!s.player.skills) s.player.skills = {};
    if (!s.player.tools) s.player.tools = [];
    s.player.tools = migrateTools(s.player.tools);
    for (const id of [DEFAULT_NET, 'shovel']) if (!s.player.tools.includes(id)) s.player.tools.push(id);
    s.player.loadout = migrateTools(s.player.loadout ?? []);
    if (!s.player.loadout.length) s.player.loadout = [DEFAULT_NET, 'shovel'];
    if (s.player.levelClaimed === undefined) s.player.levelClaimed = 1;
  }
  return s as SaveV1;
}

/** the net everyone starts with */
export const DEFAULT_NET = 'net_small';
/** the nets of earlier versions, by what they became (the long net's buyers keep a long net) */
export const TOOL_RENAMES: Record<string, string> = { hand_net: 'net_small', hand_net_short: 'net_small', hand_net_long: 'net_deep' };

/** Old tool ids become the new ones, without duplicates and in the same order. */
export function migrateTools(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) { const n = TOOL_RENAMES[id] ?? id; if (!out.includes(n)) out.push(n); }
  return out;
}

/** IndexedDB-backed single-slot save with a serialised write queue. */
export class SaveStore {
  private writing: Promise<void> = Promise.resolve();
  private lastJson = '';

  async load(): Promise<SaveV1 | null> {
    try {
      return migrate(await get(KEY));
    } catch (e) {
      console.warn('[save] load failed', e);
      return null;
    }
  }

  save(data: SaveV1): Promise<void> {
    const json = JSON.stringify(data);
    if (json === this.lastJson) return this.writing;
    this.lastJson = json;
    this.writing = this.writing.then(() => set(KEY, JSON.parse(json))).catch((e) => console.warn('[save] write failed', e));
    return this.writing;
  }

  async clear(): Promise<void> {
    this.lastJson = '';
    await del(KEY);
  }

  exportJson(data: SaveV1): string {
    return JSON.stringify(data, null, 2);
  }

  importJson(text: string): SaveV1 {
    const parsed = migrate(JSON.parse(text));
    if (!parsed) throw new Error('セーブデータの形式が違います');
    return parsed;
  }
}
