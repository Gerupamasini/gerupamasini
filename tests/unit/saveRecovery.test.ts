import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), fail: false }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => structuredClone(db.data.get(key))),
  set: vi.fn(async (key: string, value: unknown) => { if (db.fail) throw new Error('QuotaExceededError'); db.data.set(key, structuredClone(value)); }),
  setMany: vi.fn(async (pairs: [string, unknown][]) => { if (db.fail) throw new Error('QuotaExceededError'); for (const [key, value] of pairs) db.data.set(key, structuredClone(value)); }),
  del: vi.fn(async (key: string) => { if (db.fail) throw new Error('QuotaExceededError'); db.data.delete(key); }),
}));
import { SaveStore, emptySave, parseSave, InvalidSaveError } from '../../src/core/Save';

beforeEach(() => { db.data.clear(); db.fail = false; });
describe('save validation and recovery', () => {
  it('rejects incomplete, nonfinite and wrong-shaped saves without changing the slot', async () => {
    const store = new SaveStore(), valid = emptySave('map', 1);
    await store.save(valid);
    for (const invalid of [{ version: 1 }, { ...valid, player: { ...valid.player, pos: [1, 2] } }, { ...valid, case: [{}] }, { ...valid, stats: { ...valid.stats, captures: -1 } }]) {
      expect(() => store.importJson(JSON.stringify(invalid))).toThrow(InvalidSaveError);
    }
    expect(() => parseSave({ ...valid, player: { ...valid.player, research: Infinity } })).toThrow(InvalidSaveError);
    expect(await store.load()).toEqual(parseSave(valid));
  });
  it('propagates quota failures and allows retrying the exact failed snapshot', async () => {
    const store = new SaveStore(), save = emptySave('map', 1);
    db.fail = true;
    await expect(store.save(save)).rejects.toThrow('QuotaExceededError');
    db.fail = false;
    await store.save(save);
    expect((await store.load())?.createdAt).toBe(1);
  });
  it('backs up replacement and reset after draining pending writes', async () => {
    const store = new SaveStore(), old = emptySave('map', 1), imported = emptySave('map', 2);
    old.player.money = 777; imported.player.money = 54321;
    const pending = store.save(old);
    await store.replace(imported); await pending;
    expect((await store.load())?.player.money).toBe(54321);
    expect((await store.loadBackup())?.player.money).toBe(777);
    const queued = store.save({ ...imported, updatedAt: 3 });
    await store.clear(); await queued;
    expect(await store.load()).toBeNull();
    expect((await store.loadBackup())?.updatedAt).toBe(3);
  });
  it('keeps a corrupt primary recoverable while preserving the last valid backup', async () => {
    const store = new SaveStore(), backup = emptySave('map', 7);
    db.data.set('save:slot1', { version: 1 }); db.data.set('save:backup', backup);
    await expect(store.load()).rejects.toThrow(InvalidSaveError);
    await store.replace(emptySave('map', 8));
    expect(db.data.get('save:unreadable')).toEqual({ version: 1 });
    expect((await store.loadBackup())?.createdAt).toBe(7);
  });
  it('leaves the previous slot intact when replacement fails', async () => {
    const store = new SaveStore(); await store.save(emptySave('map', 1));
    db.fail = true;
    await expect(store.replace(emptySave('map', 2))).rejects.toThrow();
    expect((await store.load())?.createdAt).toBe(1);
  });
  it('keeps a last-good checkpoint through regular autosaves, too', async () => {
    const store = new SaveStore(); await store.save(emptySave('map', 1));
    await store.save(emptySave('map', 2));
    expect((await store.load())?.createdAt).toBe(2);
    expect((await store.loadBackup())?.createdAt).toBe(1);
  });
});
