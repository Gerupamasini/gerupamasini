import { describe, expect, it } from 'vitest';
import { TideModel, type TideStationData } from '../../src/tide/TideModel';
import { CONSTITUENTS } from '../../src/tide/constituents';
import { jstToMs } from '../../src/core/Time';
import station from '../../public/data/tide/stations/jma_tokyo.json';
import yokosuka from '../../public/data/tide/stations/jma_yokosuka.json';
import official from '../fixtures/tide/tokyo-2020.json';

describe('Tokyo astronomical tides versus JMA published predictions', () => {
  it('matches hourly tidal variation within 4cm RMS and low-water times within 20min on 16 independent days', () => {
    const model = new TideModel(station as TideStationData);
    let squaredError = 0, samples = 0;
    const timeErrors: number[] = [];
    for (const day of official.days) {
      const [year, month, date] = day.date.split('-').map(Number);
      const start = jstToMs(year, month, date);
      const predicted = day.hourlyCm.map((_, hour) => model.level(start + hour * 3600000) * 100);
      // JMA's chart zero and this game's MSL zero differ. Compare daily variation without inventing a datum offset.
      const meanPredicted = predicted.reduce((a, b) => a + b) / 24;
      const meanOfficial = day.hourlyCm.reduce((a, b) => a + b) / 24;
      predicted.forEach((cm, hour) => { squaredError += ((cm - meanPredicted) - (day.hourlyCm[hour] - meanOfficial)) ** 2; samples++; });
      const lows = model.extrema(start - 3600000, start + 25 * 3600000).filter(e => e.kind === 'low');
      for (const low of day.low) {
        const t = start + (low.hour * 60 + low.minute) * 60000;
        timeErrors.push(Math.min(...lows.map(e => Math.abs(e.t - t) / 60000)));
      }
    }
    expect(samples).toBe(384);
    expect(Math.sqrt(squaredError / samples)).toBeLessThan(4);
    expect(Math.max(...timeErrors)).toBeLessThan(20);
    expect(timeErrors.reduce((a, b) => a + b) / timeErrors.length).toBeLessThan(6);
  });
  it('bundles supported measured constituents with a credited UTC phase reference for both stations', () => {
    for (const data of [station, yokosuka]) {
      expect(data.phaseReference).toBe('UTC'); expect(data.constituents.length).toBeGreaterThan(30);
      expect(data.constituents.every(c => CONSTITUENTS[c.name])).toBe(true);
      expect(data.source.note).toContain('CC BY 4.0');
      expect(data.mslAboveChartDatum_cm).toBeNull();
    }
  });
});
