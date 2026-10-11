import { describe, expect, it } from 'vitest';
import { QUALITY_ORDER, QUALITY_PRESETS, type Quality } from '../../src/core/Settings';
import { MEADOW_QUALITY } from '../../src/world/amamo/AmamoMeadow';

// The quality tiers (超軽量 / 低 / 中 / 高) and what each one turns down: every tier is listed, every tier has
// a meadow setting, and the knobs fall monotonically from 高 to 超軽量 (a lighter tier never costs more).
describe('quality presets', () => {
  it('lists every tier in order, each with a meadow setting', () => {
    expect(QUALITY_ORDER).toEqual(['minimal', 'low', 'mid', 'high']);
    for (const q of QUALITY_ORDER) {
      expect(QUALITY_PRESETS[q]).toBeDefined();
      expect(MEADOW_QUALITY[q]).toBeDefined();
    }
    expect(Object.keys(QUALITY_PRESETS).sort()).toEqual([...QUALITY_ORDER].sort());
  });

  it('never costs more on a lighter tier', () => {
    const numeric = ['maxDpr', 'maxPixels', 'shadowMapSize', 'creatureScale', 'lod1Count', 'surfaceDetail', 'mirror', 'surfSteps', 'msaa', 'viewScale', 'oysters'] as const;
    const flags = ['shadows', 'post', 'contactShadows', 'hero'] as const;
    const rank = { lite: 0, full: 1 } as const;
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      const lo = QUALITY_PRESETS[QUALITY_ORDER[i - 1]], hi = QUALITY_PRESETS[QUALITY_ORDER[i]];
      for (const k of numeric) expect(lo[k], k).toBeLessThanOrEqual(hi[k]);
      for (const k of flags) expect(Number(lo[k]), k).toBeLessThanOrEqual(Number(hi[k]));
      expect(rank[lo.water]).toBeLessThanOrEqual(rank[hi.water]);
      expect(rank[lo.tankWater]).toBeLessThanOrEqual(rank[hi.tankWater]);
      const ml = MEADOW_QUALITY[QUALITY_ORDER[i - 1]], mh = MEADOW_QUALITY[QUALITY_ORDER[i]];
      expect(ml.density).toBeLessThanOrEqual(mh.density);
      expect(ml.lod[2]).toBeLessThanOrEqual(mh.lod[2]);
    }
  });

  it('超軽量 is the tier the slow-frame hint points to: the lightest water, buffer and crowd', () => {
    const p = QUALITY_PRESETS.minimal;
    expect(p.water).toBe('lite');
    expect(p.tankWater).toBe('lite');
    expect(p.msaa).toBe(0);
    expect(p.maxDpr).toBeLessThan(1);
    expect(p.creatureScale).toBeLessThan(0.5);
    expect(p.contactShadows).toBe(false);
    expect(p.hero).toBe(false);
    const q: Quality = 'minimal';
    expect(MEADOW_QUALITY[q].shadowLod).toBeLessThan(0);
  });
});
