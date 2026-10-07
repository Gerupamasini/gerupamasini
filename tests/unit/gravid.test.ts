import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { modelFor } from '../../src/creatures/models/choice';
import { generateIndividual } from '../../src/creatures/Individual';

const sp = SpeciesSchema.parse(JSON.parse(fs.readFileSync(new URL('../../public/data/species/gymnogobius_macrognathos.json', import.meta.url).pathname, 'utf8')));
// JST noon on a date (ms)
const jst = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12 - 9);

describe('エドハゼの抱卵個体', () => {
  it('a gravid female wears the gravid tiers; everyone else the stage model', () => {
    expect(modelFor(sp, 'adult', true).hero).toBe('edohaze/edohaze_gravid.hero.glb');
    expect(modelFor(sp, 'adult', true).lod2).toBe('edohaze/edohaze_gravid.lod2.glb');
    expect(modelFor(sp, 'adult', false).hero).toBe('edohaze/edohaze.hero.glb');
    expect(modelFor(sp, 'adult').hero).toBe('edohaze/edohaze.hero.glb');
    expect(modelFor(sp, 'adult', true).modelLength_mm).toBe(sp.model.modelLength_mm);
  });

  it('adult females carry eggs mostly in the spawning months, a few outside them, males and juveniles never', () => {
    const share = (ms: number) => {
      let f = 0, g = 0, bad = 0;
      for (let seed = 1; seed <= 1200; seed++) {
        const ind = generateIndividual(sp, seed, 0, 0, 0, 0, ms, [50, 70]);
        if (ind.gravid && (ind.sex !== 'f' || ind.stage !== 'adult')) bad++;
        if (ind.sex === 'f' && ind.stage === 'adult') { f++; if (ind.gravid) g++; }
        if (ind.gravid) expect(ind.traits).toContain('gravid');
        else expect(ind.traits).not.toContain('gravid');
      }
      expect(bad).toBe(0);
      return g / f;
    };
    expect(share(jst(2026, 3, 15))).toBeGreaterThan(0.6);
    expect(share(jst(2026, 3, 15))).toBeLessThan(0.8);
    expect(share(jst(2026, 10, 7))).toBeGreaterThan(0.08);
    expect(share(jst(2026, 10, 7))).toBeLessThan(0.25);
    // juveniles never (the length range keeps them small)
    for (let seed = 1; seed <= 100; seed++) expect(generateIndividual(sp, seed, 0, 0, 0, 0, jst(2026, 3, 15), [28, 34]).gravid).toBe(false);
  });

  it('is deterministic in the seed and the date', () => {
    const a = generateIndividual(sp, 77, 0, 0, 0, 0, jst(2026, 4, 1), [55, 55]);
    const b = generateIndividual(sp, 77, 0, 0, 0, 0, jst(2026, 4, 1), [55, 55]);
    expect(a.gravid).toBe(b.gravid);
    expect(a.id).toBe(b.id);
  });
});
