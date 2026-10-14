import { describe, it, expect } from 'vitest';
import { TideModel, type TideStationData } from '../../src/tide/TideModel';
import { astroArgs } from '../../src/tide/astro';
import station from '../../public/data/tide/stations/jma_tokyo.json';

const model = new TideModel(station as TideStationData);

describe('astro arguments', () => {
  it('J2000 epoch mean longitudes match reference values', () => {
    const a = astroArgs(Date.UTC(2000, 0, 1, 12));
    expect(a.T).toBeCloseTo(0, 9);
    expect(a.s).toBeCloseTo(218.3164477, 5);
    expect(a.h).toBeCloseTo(280.46646, 5);
    expect(a.N).toBeCloseTo(125.0445479, 5);
  });
});

describe('TideModel (Tokyo, measured constituents)', () => {
  it('stays within the summed amplitude', () => {
    const max = model.maxAmplitude();
    for (let i = 0; i < 24 * 30; i++) {
      const v = model.level(Date.UTC(2026, 9, 1) + i * 3600000);
      expect(Math.abs(v)).toBeLessThanOrEqual(max + 1e-9);
    }
    expect(max).toBeGreaterThan(1.0);
  });

  it('finds roughly two highs and two lows per day', () => {
    const from = Date.UTC(2026, 9, 1);
    const ex = model.extrema(from, from + 7 * 86400000);
    const highs = ex.filter((e) => e.kind === 'high').length;
    const lows = ex.filter((e) => e.kind === 'low').length;
    expect(highs).toBeGreaterThanOrEqual(11);
    expect(highs).toBeLessThanOrEqual(15);
    expect(Math.abs(highs - lows)).toBeLessThanOrEqual(1);
    for (let i = 1; i < ex.length; i++) expect(ex[i].kind).not.toBe(ex[i - 1].kind);
  });

  it('M2 alone repeats every 12.42 h', () => {
    const m2 = new TideModel({ ...(station as TideStationData), constituents: [{ name: 'M2', amplitude_cm: 100, phase_deg: 0 }] });
    const t0 = Date.UTC(2026, 9, 1, 3);
    const period = (360 / 28.9841042) * 3600000;
    expect(m2.level(t0 + period)).toBeCloseTo(m2.level(t0), 3);
  });

  it('rate has the sign of the next extremum', () => {
    const t0 = Date.UTC(2026, 9, 2, 0);
    const next = model.extrema(t0, t0 + 86400000)[0];
    const r = model.rate(t0);
    expect(next.kind === 'high' ? r > 0 : r < 0).toBe(true);
  });
});
