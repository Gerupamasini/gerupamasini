import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { buildHashirimizuSkyline, NAVY_ODDS, type ShipMark } from '../../src/world/maps/hashirimizu/skyline';

describe('走水 horizon ships', () => {
  // (no canvas here: the factory only names each picture, the drawings are not run)
  const ships: ShipMark[] = [];
  const keyOf = new Map<Mesh, string>();
  buildHashirimizuSkyline((key) => { const m = new Mesh(); keyOf.set(m, key); return m; }, ships);
  const fleet = (s: ShipMark) => s.meshes.map((m) => keyOf.get(m));

  it('keeps each lane its merchantman, adds the escorts to the lanes but the ferry, the carrier only close in', () => {
    expect(ships.map((s) => fleet(s)[0])).toEqual(['container', 'tanker', 'carcarrier', 'ferry', 'tanker']);
    expect(fleet(ships[3])).toEqual(['ferry']);
    for (const i of [0, 1]) expect(fleet(ships[i])).toEqual([fleet(ships[i])[0], 'kongo', 'atago', 'mogami', 'carrier']);
    for (const i of [2, 4]) expect(fleet(ships[i])).toEqual([fleet(ships[i])[0], 'kongo', 'atago', 'mogami']);
    // the inbound lanes (close to this shore) run north
    expect(ships[0].degPerSec).toBeLessThan(0);
    expect(ships[1].degPerSec).toBeLessThan(0);
  });

  it('sends a 護衛艦 now and then and the carrier very rarely, the same ship for the same pass', () => {
    const N = 200000;
    for (const [i, s] of ships.entries()) {
      const counts = new Map<string, number>();
      // (pass numbers around today's: the lanes have come round about a million times since 1970)
      for (let n = 1_800_000 - N / 2; n < 1_800_000 + N / 2; n++) {
        const k = fleet(s)[s.pick(n)]!;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const share = (k: string) => (counts.get(k) ?? 0) / N;
      const escorts = share('kongo') + share('atago') + share('mogami');
      if (i === 3) { expect(share('ferry')).toBe(1); continue; }
      expect(escorts).toBeGreaterThan(NAVY_ODDS.escort - 0.01);
      expect(escorts).toBeLessThan(NAVY_ODDS.escort + 0.01);
      for (const k of ['kongo', 'atago', 'mogami']) expect(Math.abs(share(k) - NAVY_ODDS.escort / 3)).toBeLessThan(0.008);
      if (i < 2) {
        expect(share('carrier')).toBeGreaterThan(NAVY_ODDS.carrier - 0.004);
        expect(share('carrier')).toBeLessThan(NAVY_ODDS.carrier + 0.004);
      } else expect(share('carrier')).toBe(0);
    }
    for (const n of [-5, 0, 7, 1_812_345]) expect(ships[0].pick(n)).toBe(ships[0].pick(n));
  });
});
