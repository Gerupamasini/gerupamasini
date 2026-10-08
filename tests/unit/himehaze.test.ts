import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { modelFor } from '../../src/creatures/models/choice';
import { generateIndividual } from '../../src/creatures/Individual';

const sp = SpeciesSchema.parse(JSON.parse(fs.readFileSync(new URL('../../public/data/species/favonigobius_gymnauchen.json', import.meta.url).pathname, 'utf8')));
// JST noon on a date (ms)
const jst = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12 - 9);

describe('ヒメハゼ', () => {
  it('is a goby on the マハゼ rig with its own tiers and a breeding-male form', () => {
    expect(sp.model.driver).toBe('mahaze');
    expect(sp.model.clips).toEqual({ idle: 'Idle', move: 'Swim', special: ['Yawn'] });
    expect(modelFor(sp, 'adult').hero).toBe('himehaze/himehaze.hero.glb');
    expect(modelFor(sp, 'adult', false, true).hero).toBe('himehaze/himehaze_male.hero.glb');
    expect(modelFor(sp, 'adult', false, true).lod2).toBe('himehaze/himehaze_male.lod2.glb');
    expect(modelFor(sp, 'juvenile', false, true).modelLength_mm).toBe(sp.model.modelLength_mm);
    // the model files exist
    for (const f of [sp.model.hero!, sp.model.lod1!, sp.model.lod2!, sp.model.male!.hero!, sp.model.male!.lod1!, sp.model.male!.lod2!]) {
      expect(fs.existsSync(new URL(`../../src/assets/models/${f}`, import.meta.url).pathname), f).toBe(true);
    }
  });

  it('lives on both shores: rules without a map and one for the 走水 eelgrass edge', () => {
    const on = (map: string) => sp.spawn.filter((r) => !r.maps || r.maps.includes(map));
    expect(on('kasai_west').length).toBeGreaterThanOrEqual(2);
    expect(on('hashirimizu').length).toBeGreaterThanOrEqual(3);
    expect(sp.spawn.some((r) => r.maps?.includes('hashirimizu') && r.tags.includes('eelgrass_edge'))).toBe(true);
    expect(sp.spawn.some((r) => r.maps?.includes('kasai_west'))).toBe(false);
  });

  it('adult males wear the nuptial dress mostly in the spawning months and never outside them; females never', () => {
    const share = (ms: number) => {
      let m = 0, d = 0, bad = 0;
      for (let seed = 1; seed <= 1200; seed++) {
        const ind = generateIndividual(sp, seed, 0, 0, 0, 0, ms, [50, 80]);
        if (ind.dress && (ind.sex !== 'm' || ind.stage !== 'adult')) bad++;
        if (ind.sex === 'm' && ind.stage === 'adult') { m++; if (ind.dress) d++; }
        if (ind.dress) expect(ind.traits).toContain('nuptial');
        else expect(ind.traits).not.toContain('nuptial');
        expect(ind.gravid).toBe(false);
      }
      expect(bad).toBe(0);
      return d / m;
    };
    expect(share(jst(2026, 6, 15))).toBeGreaterThan(0.6);
    expect(share(jst(2026, 6, 15))).toBeLessThan(0.8);
    expect(share(jst(2026, 11, 20))).toBe(0);
    // juveniles never (the length range keeps them small)
    for (let seed = 1; seed <= 100; seed++) expect(generateIndividual(sp, seed, 0, 0, 0, 0, jst(2026, 6, 15), [30, 38]).dress).toBe(false);
  });

  it('a species without a dress share draws nothing extra: エドハゼ individuals keep their seeds', () => {
    const edo = SpeciesSchema.parse(JSON.parse(fs.readFileSync(new URL('../../public/data/species/gymnogobius_macrognathos.json', import.meta.url).pathname, 'utf8')));
    const a = generateIndividual(edo, 31, 0, 0, 0, 0, jst(2026, 4, 1), [55, 55]);
    expect(a.dress).toBe(false);
    expect(modelFor(edo, 'adult', false, true).hero).toBe('edohaze/edohaze.hero.glb');
  });
});
