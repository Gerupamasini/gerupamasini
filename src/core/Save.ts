import { get, set, del } from 'idb-keyval';
import type { TicketState } from './GameClock';
import type { IndividualRecord } from '../creatures/Individual';

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
  player: { map: string; pos: [number, number, number]; heading: number; money: number; research: number; tools: string[] };
  ticket: { active: TicketState | null; usedCount: number };
  encyclopedia: Record<string, SpeciesProgress>;
  case: IndividualRecord[];
  tank: { individuals: IndividualRecord[]; lastSimMs: number };
  removedIndividuals: string[];
  stats: { playSeconds: number; captures: number; observations: number };
}

export type SaveData = SaveV1;
const KEY = 'save:slot1';

export function emptySave(map: string, now: number): SaveV1 {
  return {
    version: 1, createdAt: now, updatedAt: now, lastRealMs: now,
    player: { map, pos: [0, 0, 0], heading: 0, money: 0, research: 0, tools: ['hand_net'] },
    ticket: { active: null, usedCount: 0 },
    encyclopedia: {}, case: [], tank: { individuals: [], lastSimMs: now }, removedIndividuals: [],
    stats: { playSeconds: 0, captures: 0, observations: 0 },
  };
}

function migrate(raw: unknown): SaveV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SaveV1>;
  if (s.version !== 1) return null;
  return s as SaveV1;
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
