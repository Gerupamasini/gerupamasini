import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../../src/render/AutoQuality';
import type { Quality } from '../../src/core/Settings';

/** Runs the measurement with a GPU whose time per frame depends on the tier, until it settles. */
function settle(start: Quality, gpuAt: (q: Quality) => number, timed = true): { quality: Quality; changes: Quality[] } {
  const a = new AutoQuality(start);
  const changes: Quality[] = [];
  for (let f = 0; f < 60 * 60; f++) {
    const v = a.update(1 / 60, timed ? gpuAt(a.quality) : Number.NaN);
    if (v.kind === 'change') changes.push(v.to);
    if (v.kind === 'done') return { quality: v.quality, changes };
  }
  throw new Error('never settled');
}

const cost: Record<Quality, number> = { minimal: 1, low: 1.8, mid: 3.2, high: 5.5, ultra: 9 };

describe('AutoQuality', () => {
  it('keeps a tier the GPU runs at its frame rate', () => {
    expect(settle('mid', (q) => 4 * cost[q]).quality).toBe('mid');
  });

  it('steps up on a fast GPU, up to 高', () => {
    const r = settle('mid', (q) => 0.8 * cost[q]);
    expect(r.quality).toBe('high');
    expect(r.changes).toEqual(['high']);
  });

  it('never steps up to 最高 (the player\'s own choice), and measures from 高 when asked again on it', () => {
    expect(settle('high', (q) => 0.5 * cost[q]).quality).toBe('high');
    expect(new AutoQuality('ultra').quality).toBe('high');
  });

  it('steps down on a slow GPU until it keeps up, and not back up', () => {
    // mid 32 ms (target 16.7), low 18 ms (target 33.3)
    const r = settle('mid', (q) => 10 * cost[q]);
    expect(r.quality).toBe('low');
    expect(r.changes).toEqual(['low']);
  });

  it('goes to 超軽量 on a very slow one', () => {
    expect(settle('mid', (q) => 30 * cost[q]).quality).toBe('minimal');
  });

  it('without a GPU timer, only steps down on slow frames', () => {
    const a = new AutoQuality('mid');
    let v;
    // (25 fps: too slow for 中, fine for 低 at 30)
    for (let f = 0; f < 600; f++) v = a.update(1 / 25, Number.NaN);
    expect(a.quality).toBe('low');
    for (let f = 0; f < 600; f++) v = a.update(1 / 60, Number.NaN);
    expect(v).toEqual({ kind: 'done', quality: 'low' });
  });
});
