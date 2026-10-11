import { get, set, setMany, del } from 'idb-keyval';
import { z } from 'zod';
import type { TicketState } from './GameClock';
import type { IndividualRecord } from '../creatures/Individual';
import type { TankLayout } from '../app/TankLayout';
import { emptyEquipmentCollection, normalizeCollection, ownedEquipmentLayout, type EquipmentCollection } from '../aquarium/catalog';
import { normalizeEquipment } from '../aquarium/state';

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
  equipmentCollection?: EquipmentCollection;
  removedIndividuals: string[];
  stats: { playSeconds: number; captures: number; observations: number };
  guideDismissed?: boolean;
}

export type SaveData = SaveV1;
const KEY = 'save:slot1';
const BACKUP_KEY = 'save:backup';
const RECOVERY_KEY = 'save:unreadable';

const finite = z.number().finite();
const count = finite.int().nonnegative();
const recordSchema = z.object({
  id: z.string().min(1), speciesId: z.string().min(1), number: count,
  length_mm: finite.positive().max(10000), weight_g: finite.nonnegative(),
  sex: z.enum(['m', 'f', 'unknown']), stage: z.string().min(1), traits: z.array(z.string()),
  gravid: z.boolean().optional(), dress: z.boolean().optional(), caughtAt: finite,
  caughtWhere: z.tuple([finite, finite]), tideLevel: finite,
});
const progressSchema = z.object({
  discovered: finite.optional(), observed: finite.optional(), captured: finite.optional(),
  maleSeen: finite.optional(), femaleSeen: finite.optional(),
  behaviors: z.record(z.string(), finite), individuals: z.array(recordSchema), nextNumber: count.min(1),
});
const layoutSchema = z.object({
  substrate: z.enum(['sand', 'mud', 'none']),
  items: z.array(z.object({ id: z.string().min(1), type: z.enum(['stone_s', 'stone_l', 'driftwood', 'shell', 'plant']), x: finite.min(-1).max(1), z: finite.min(-1).max(1), rot: finite })).max(12),
  equipment: z.unknown().optional(),
});
/** Validate before migration or writing: a version number alone is not a save. */
const saveSchema = z.object({
  version: z.literal(1), createdAt: finite, updatedAt: finite, lastRealMs: finite,
  player: z.object({
    map: z.string().min(1), pos: z.tuple([finite, finite, finite]), heading: finite,
    money: finite.nonnegative(), research: finite.nonnegative(),
    tools: z.array(z.string()).default([]), loadout: z.array(z.string()).optional(),
    skills: z.record(z.string(), count).default({}), levelClaimed: count.min(1).default(1),
  }),
  ticket: z.object({ active: z.object({
    targetGameMs: finite, startedRealMs: finite, remainingSec: finite.min(0).max(1800),
    paused: z.boolean(), phase: z.enum(['active', 'ending']),
  }).nullable(), usedCount: count }),
  encyclopedia: z.record(z.string(), progressSchema), case: z.array(recordSchema).max(6),
  tank: z.object({ individuals: z.array(recordSchema).max(4), lastSimMs: finite, layout: layoutSchema.optional() }),
  equipmentCollection: z.unknown().optional(), removedIndividuals: z.array(z.string()),
  stats: z.object({ playSeconds: finite.nonnegative(), captures: count, observations: count }),
  guideDismissed: z.boolean().optional(),
});
export class InvalidSaveError extends Error {
  constructor() { super('セーブデータが不完全または破損しています。現在のデータは変更していません。'); this.name = 'InvalidSaveError'; }
}

export function emptySave(map: string, now: number): SaveV1 {
  return {
    version: 1, createdAt: now, updatedAt: now, lastRealMs: now,
    player: { map, pos: [0, 0, 0], heading: 0, money: 0, research: 0, tools: [DEFAULT_NET, 'shovel'], loadout: [DEFAULT_NET, 'shovel'], skills: {}, levelClaimed: 1 },
    ticket: { active: null, usedCount: 0 },
    encyclopedia: {}, case: [], tank: { individuals: [], lastSimMs: now, layout: { substrate: 'sand', items: [] } }, removedIndividuals: [],
    equipmentCollection: emptyEquipmentCollection(),
    stats: { playSeconds: 0, captures: 0, observations: 0 },
  };
}

export function parseSave(raw: unknown): SaveV1 {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidSaveError();
  const s = parsed.data as SaveV1;
  const equipment = normalizeEquipment(s.tank?.layout?.equipment);
  s.equipmentCollection = normalizeCollection(s.equipmentCollection, equipment);
  if (s.tank?.layout) s.tank.layout.equipment = ownedEquipmentLayout(equipment, s.equipmentCollection);
  if (s.player) {
    if (!s.player.skills) s.player.skills = {};
    if (!s.player.tools) s.player.tools = [];
    s.player.tools = migrateTools(s.player.tools);
    for (const id of [DEFAULT_NET, 'shovel']) if (!s.player.tools.includes(id)) s.player.tools.push(id);
    s.player.loadout = migrateTools(s.player.loadout ?? []);
    if (!s.player.loadout.length) s.player.loadout = [DEFAULT_NET, 'shovel'];
    if (s.player.levelClaimed === undefined) s.player.levelClaimed = 1;
  }
  const activeIds = [...s.case, ...s.tank.individuals].map((r) => r.id);
  if (new Set(activeIds).size !== activeIds.length) throw new InvalidSaveError();
  return s;
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
    const raw: unknown = await get(KEY);
    return raw == null ? null : parseSave(raw);
  }

  async loadBackup(): Promise<SaveV1 | null> {
    const raw: unknown = await get(BACKUP_KEY);
    return raw == null ? null : parseSave(raw);
  }

  async exportStored(): Promise<string> { return JSON.stringify(await get(KEY) ?? await get(RECOVERY_KEY), null, 2); }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const job = this.writing.then(work);
    // A failed job reaches its caller, while later jobs can still run.
    this.writing = job.then(() => {}, () => {});
    return job;
  }

  save(data: SaveV1): Promise<void> {
    const json = JSON.stringify(data);
    return this.enqueue(async () => {
      if (json === this.lastJson) return;
      const old: unknown = await get(KEY);
      const pairs: [string, unknown][] = [[KEY, JSON.parse(json)]];
      if (old != null) {
        let valid = true; try { parseSave(old); } catch { valid = false; }
        pairs.push([valid ? BACKUP_KEY : RECOVERY_KEY, old]);
      }
      await setMany(pairs);
      this.lastJson = json;
    });
  }

  /** New game/import: preserve the old slot in the same transaction as its replacement. */
  replace(data: SaveV1): Promise<void> {
    const json = JSON.stringify(data);
    return this.enqueue(async () => {
      const old: unknown = await get(KEY), pairs: [string, unknown][] = [[KEY, JSON.parse(json)]];
      if (old != null) {
        let valid = true; try { parseSave(old); } catch { valid = false; }
        pairs.push([valid ? BACKUP_KEY : RECOVERY_KEY, old]);
      }
      await setMany(pairs);
      this.lastJson = json;
    });
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      const old: unknown = await get(KEY);
      if (old != null) {
        let valid = true; try { parseSave(old); } catch { valid = false; }
        await set(valid ? BACKUP_KEY : RECOVERY_KEY, old);
      }
      await del(KEY);
      this.lastJson = '';
    });
  }

  exportJson(data: SaveV1): string {
    return JSON.stringify(data, null, 2);
  }

  importJson(text: string): SaveV1 {
    try { return parseSave(JSON.parse(text)); } catch { throw new InvalidSaveError(); }
  }
}
