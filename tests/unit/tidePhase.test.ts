import { describe, it, expect } from 'vitest';
import { TideModel, tidePhaseAt, type TideStationData } from '../../src/tide/TideModel';
import station from '../../public/data/tide/stations/jma_tokyo.json';

const model = new TideModel(station as TideStationData);
const level = (ms: number) => model.level(ms);

describe('tidePhaseAt (the words on the ticket card)', () => {
  const day = Date.UTC(2026, 9, 5) - 9 * 3600000;
  const extrema = model.extrema(day, day + 86400000);
  it('names a high or a low when within the slack around one', () => {
    expect(extrema.length).toBeGreaterThan(1);
    for (const e of extrema) {
      expect(tidePhaseAt(level, extrema, e.t)).toBe(e.kind);
      expect(tidePhaseAt(level, extrema, e.t + 15 * 60000)).toBe(e.kind);
      expect(tidePhaseAt(level, extrema, e.t - 19 * 60000)).toBe(e.kind);
    }
  });
  it('between a low and the next high the water is rising, and falling the other way', () => {
    for (let i = 0; i + 1 < extrema.length; i++) {
      const a = extrema[i], b = extrema[i + 1];
      const mid = (a.t + b.t) / 2;
      expect(tidePhaseAt(level, extrema, mid)).toBe(a.kind === 'low' ? 'rising' : 'falling');
    }
  });
  it('agrees with the level itself', () => {
    for (let h = 0; h < 24; h++) {
      const ms = day + h * 3600000 + 1234;
      const ph = tidePhaseAt(level, extrema, ms, 0);
      expect(ph).toBe(level(ms + 600000) >= level(ms - 600000) ? 'rising' : 'falling');
    }
  });
});
