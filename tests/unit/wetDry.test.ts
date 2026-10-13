import { describe, expect, it } from 'vitest';
import { DRYING, WetDry, dryingRate } from '../../src/world/WetDry';

// a plain semidiurnal tide: ±1 m, 12.42 h, high water at t = 0
const PERIOD = 12.42 * 3600000;
const level = (ms: number) => Math.cos((2 * Math.PI * ms) / PERIOD);
// 葛西
const LAT = 35.64, LON = 139.86;

/** The strip's four values (0..1) at a height. */
function at(w: WetDry, y: number): { filmSand: number; filmMud: number; moistSand: number; moistMud: number } {
  const b = Math.round(((y - w.range.x) / (w.range.y - w.range.x)) * 255);
  const d = w.texture.image.data as Uint8Array;
  return { filmSand: d[b * 4] / 255, filmMud: d[b * 4 + 1] / 255, moistSand: d[b * 4 + 2] / 255, moistMud: d[b * 4 + 3] / 255 };
}

describe('WetDry', () => {
  it('reads saturated below the water and dries with the time since the water left', () => {
    const w = new WetDry(-1.2, 2);
    // a quarter period after high water the tide is at mid level and falling
    const now = Date.UTC(2026, 6, 15, 3, 0) + PERIOD / 4 - (Date.UTC(2026, 6, 15, 3, 0) % PERIOD);
    w.update(level, now, level(now), LAT, LON);
    const under = at(w, level(now) - 0.3);
    expect(under.filmSand).toBe(1);
    expect(under.moistMud).toBe(1);
    const fresh = at(w, level(now) + 0.05);   // left minutes ago
    const older = at(w, 0.9);                 // left about an hour and a half ago
    expect(fresh.filmSand).toBeGreaterThan(older.filmSand);
    expect(fresh.moistSand).toBeGreaterThan(older.moistSand);
    // mud keeps its film and its water far longer than sand
    expect(older.filmMud).toBeGreaterThan(older.filmSand);
    expect(older.moistMud).toBeGreaterThan(0.9);
    // above every tide of the last day and more: dry
    const bank = at(w, 1.9);
    expect(bank.filmSand).toBe(0);
    expect(bank.moistSand).toBe(0);
  });

  it('dries faster under the sun than at night, and in summer than in winter', () => {
    const noonJul = Date.UTC(2026, 6, 15, 3, 0), midnightJul = Date.UTC(2026, 6, 15, 15, 0), noonJan = Date.UTC(2026, 0, 15, 3, 0);
    expect(dryingRate(70, noonJul)).toBeGreaterThan(dryingRate(-20, midnightJul) * 2.5);
    expect(dryingRate(40, noonJul)).toBeGreaterThan(dryingRate(40, noonJan));
  });

  it('follows the water it is given (the debug override) rather than the model at the present', () => {
    const w = new WetDry(-1.2, 2);
    const now = Date.UTC(2026, 6, 15, 3, 0);
    w.update(level, now, 1.5, LAT, LON);
    expect(at(w, 1.4).moistSand).toBe(1);
  });

  it('keeps the film shorter than the darkness', () => {
    expect(DRYING.film.sand).toBeLessThan(DRYING.moist.sand);
    expect(DRYING.film.mud).toBeLessThan(DRYING.moist.mud);
  });
});
