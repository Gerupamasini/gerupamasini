import { describe, expect, it } from 'vitest';
import { generateFlat, shoreLine, WALK_HALF, type FlatData } from '../../src/flat/gen/generate';
import { computeWater, fillDepressions, KIND_DRY, KIND_POOL, KIND_SEA, LAST_HIGH_WATER } from '../../src/flat/gen/water';
import { toHalf } from '../../src/flat/gen/noise';

let cached: FlatData | null = null;
function flat(): FlatData {
  cached ??= generateFlat(20261002);
  return cached;
}

function walkableCells(d: FlatData, f: (k: number) => void): void {
  const g = d.fine;
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    const x = g.origin + i * g.cell, z = g.origin + j * g.cell;
    if (Math.abs(x) <= WALK_HALF && Math.abs(z) <= WALK_HALF) f(j * g.n + i);
  }
}

describe('flat generator', () => {
  it('is deterministic per seed', { timeout: 120000 }, () => {
    const a = flat();
    const b = generateFlat(20261002);
    let diff = 0;
    for (let k = 0; k < a.fine.height.length; k += 997) diff = Math.max(diff, Math.abs(a.fine.height[k] - b.fine.height[k]));
    expect(diff).toBe(0);
    const c = generateFlat(7);
    let other = 0;
    for (let k = 0; k < a.fine.height.length; k += 997) other = Math.max(other, Math.abs(a.fine.height[k] - c.fine.height[k]));
    expect(other).toBeGreaterThan(0.01);
  });

  it('slopes from a dry beach in the north to the bay in the south', { timeout: 60000 }, () => {
    const d = flat();
    const shore = shoreLine(d.seed, d.shore);
    const at = (x: number, z: number) => {
      const g = d.fine, i = Math.round((x - g.origin) / g.cell), j = Math.round((z - g.origin) / g.cell);
      return g.height[j * g.n + i];
    };
    // the upper beach well above the last high water, the lower flat below the mean tide
    expect(at(0, shore(0) - 160)).toBeGreaterThan(1.6);
    expect(at(0, shore(0) + 150)).toBeLessThan(0);
    for (const v of d.fine.height) expect(Number.isFinite(v)).toBe(true);
  });

  it('has both sand and mud on the walkable flat', { timeout: 60000 }, () => {
    const d = flat();
    let n = 0, sand = 0, mud = 0;
    walkableCells(d, (k) => {
      const m = d.fine.mat[k * 4] / 255;
      n++;
      if (m < 0.3) sand++;
      if (m > 0.7) mud++;
    });
    expect(sand / n).toBeGreaterThan(0.3);
    expect(mud / n).toBeGreaterThan(0.08);
  });

  it('cuts creeks whose beds never rise downstream', { timeout: 60000 }, () => {
    const d = flat();
    expect(d.channels.length).toBeGreaterThanOrEqual(4);
    for (const c of d.channels) for (let i = 1; i < c.bed.length; i++) expect(c.bed[i]).toBeLessThanOrEqual(c.bed[i - 1] + 1e-6);
    // the main creek reaches the bay
    const main = d.channels[0];
    expect(main.pts[main.pts.length - 1]).toBeGreaterThan(300);
  });

  it('leaves pools and a sea at low tide, nothing standing above the last high water', { timeout: 120000 }, () => {
    const d = flat();
    const w = computeWater(d, -0.45);
    expect(w.pools).toBeGreaterThan(15);
    expect(w.wetFraction).toBeGreaterThan(0.02);
    expect(w.wetFraction).toBeLessThan(0.6);
    const g = d.fine;
    let sea = 0;
    for (let k = 0; k < g.n * g.n; k++) {
      // info carries the kind of the nearest water; a cell is wet when the level stands above its ground
      const kind = w.fine.info[k * 4] >> 6;
      const lv = w.fine.levels[k * 2];
      const wet = w.fine.info[k * 4 + 2] <= 12 && lv > g.height[k];
      expect(kind).not.toBe(KIND_DRY);
      if (wet && kind === KIND_SEA) sea++;
      if (wet && kind === KIND_POOL) expect(lv).toBeLessThanOrEqual(LAST_HIGH_WATER);
    }
    expect(sea).toBeGreaterThan(1000);
    // a higher tide covers more of the flat
    const hi = computeWater(d, 0.4);
    expect(hi.wetFraction).toBeGreaterThan(w.wetFraction);
  });
});

describe('depression filling', () => {
  it('fills a closed bowl to its lowest sill and leaves slopes alone', () => {
    const n = 9;
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = 1 + 0.01 * j;   // slopes toward j = 0
    // a bowl in the middle, its rim broken at one point (the sill) at 1.02
    for (let j = 2; j <= 6; j++) for (let i = 2; i <= 6; i++) H[j * n + i] = 1.1;
    for (let j = 3; j <= 5; j++) for (let i = 3; i <= 5; i++) H[j * n + i] = 0.9;
    H[2 * n + 4] = 1.02;
    const F = fillDepressions(H, n);
    expect(F[4 * n + 4]).toBeCloseTo(1.02, 5);
    expect(F[0]).toBeCloseTo(H[0], 6);
    expect(F[8 * n + 8]).toBeCloseTo(H[8 * n + 8], 6);
  });
});

describe('half floats', () => {
  const fromHalf = (h: number) => {
    const e = (h >> 10) & 31, m = h & 1023, sg = h & 0x8000 ? -1 : 1;
    return e === 0 ? sg * m * 2 ** -24 : e === 31 ? sg * Infinity : sg * (1 + m / 1024) * 2 ** (e - 15);
  };
  it('encodes exactly representable values exactly and the rest to the nearest half', () => {
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(-2)).toBe(0xc000);
    expect(toHalf(0)).toBe(0);
    expect(toHalf(65504)).toBe(0x7bff);
    for (const v of [0.07, -0.731, 0.123456, 0.999, 1e-5, 0.2]) expect(Math.abs(fromHalf(toHalf(v)) - v)).toBeLessThanOrEqual(Math.abs(v) * 2 ** -11 + 2 ** -25);
  });
});
