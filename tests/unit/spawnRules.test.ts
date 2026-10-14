import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SpeciesSchema, type SpeciesDef } from '../../src/data/schemas';

const json = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${rel}`, import.meta.url)), 'utf8')) as unknown;
const manifest = json('manifest.json') as { species: string[] };
const species: SpeciesDef[] = manifest.species.map((id) => SpeciesSchema.parse(json(`species/${id}.json`)));

// Rules that can never fire, by the habitat's own logic (Habitat.update / featureTagsOf): the 'channel' tag is only
// given to cells whose substrate is 'channel'; 'bare' and 'eelgrass*' exist only in an eelgrass zone (走水);
// 'pool' / 'small_pool' need the pits and pools of 葛西.
describe('spawn rules can fire where they are declared', () => {
  it('a channel-tagged rule with a substrate filter includes the channel substrate', () => {
    for (const sp of species) for (const [i, r] of sp.spawn.entries()) {
      if (r.tags.includes('channel') && r.substrate) expect(r.substrate, `${sp.id} rule ${i}`).toContain('channel');
    }
  });
  it('an eelgrass-only rule is not declared for 葛西, a pool-only rule not for 走水', () => {
    // ('small_pool' can also be a small depression or a pit, so only the big pools are 葛西-only)
    const grass = new Set(['bare', 'eelgrass', 'eelgrass_edge']), pools = new Set(['pool']);
    for (const sp of species) for (const [i, r] of sp.spawn.entries()) {
      if (r.tags.every((t) => grass.has(t))) expect(r.maps ?? [], `${sp.id} rule ${i}`).not.toContain('kasai_west');
      if (r.tags.every((t) => pools.has(t))) expect(r.maps ?? [], `${sp.id} rule ${i}`).not.toContain('hashirimizu');
    }
  });
});

describe('the Tokyo Bay newcomers of round 28', () => {
  it('イシガレイ, アカエイ and アラムシロ live on both flats and never on 漫湖', () => {
    for (const id of ['platichthys_bicoloratus', 'hemitrygon_akajei', 'reticunassa_festiva']) {
      const sp = species.find((s) => s.id === id)!;
      expect(sp, id).toBeDefined();
      for (const r of sp.spawn) {
        expect(r.maps, id).toBeDefined();
        for (const m of r.maps!) expect(['kasai_west', 'hashirimizu'], `${id}: ${m}`).toContain(m);
      }
      expect(sp.spawn.some((r) => r.maps!.includes('kasai_west')), `${id} on 葛西`).toBe(true);
      expect(sp.spawn.some((r) => r.maps!.includes('hashirimizu')), `${id} on 走水`).toBe(true);
    }
  });
});

describe('ミミイカ', () => {
  const sp = species.find((s) => s.id === 'euprymna_morsei')!;
  it('lives on 走水 only (not on 葛西), up to 20 at a time', () => {
    expect(sp).toBeDefined();
    for (const [i, r] of sp.spawn.entries()) {
      expect(r.maps, `rule ${i}`).toEqual(['hashirimizu']);
      expect(r.maxPopulation, `rule ${i}`).toBe(20);
    }
  });
  it('is measured by its mantle (ML 4–40 mm, mostly 1–2 cm), every rule inside that range', () => {
    const L = sp.size.length_mm;
    expect(L).toEqual({ min: 4, max: 40, mean: 14, sd: 5 });
    expect(sp.size.measure_ja).toBe('外套長');
    for (const [i, r] of sp.spawn.entries()) {
      expect(r.length_mm, `rule ${i}`).toBeDefined();
      expect(r.length_mm![0], `rule ${i}`).toBeGreaterThanOrEqual(L.min);
      expect(r.length_mm![1], `rule ${i}`).toBeLessThanOrEqual(L.max);
    }
  });
  it('is larger in winter and spring, with the new juveniles in summer and autumn', () => {
    // density-weighted mean of the rules' midpoints (ML mm), aimed at spring 15–18, summer 11–15, autumn 12–14
    // and winter 17–21
    const mean = (season: 'spring' | 'summer' | 'autumn' | 'winter') => {
      const rs = sp.spawn.filter((r) => r.season?.includes(season));
      const w = rs.reduce((s, r) => s + r.density_per_100m2, 0);
      return rs.reduce((s, r) => s + r.density_per_100m2 * (r.length_mm![0] + r.length_mm![1]) / 2, 0) / w;
    };
    expect(mean('spring')).toBeCloseTo(17.4, 0);
    expect(mean('summer')).toBeCloseTo(12.0, 0);
    expect(mean('autumn')).toBeCloseTo(13, 0);
    expect(mean('winter')).toBeCloseTo(19, 0);
  });
  it('weighs about 2 g at the common 14 mm, near the lab adults (Jolly et al. 2022)', () => {
    const { a, b } = sp.size.weightCoef, w = (ml: number) => a * ml ** b;
    expect(Math.abs(w(14) - 2.0)).toBeLessThanOrEqual(0.2);
    // ♂ 11.45 mm 1.41 g, ♀ 18.95 mm 3.70 g, each within 25 %
    expect(Math.abs(w(11.45) / 1.41 - 1)).toBeLessThan(0.25);
    expect(Math.abs(w(18.95) / 3.7 - 1)).toBeLessThan(0.25);
  });
  it('grows through 幼体 (≤ 9 mm) and 若い個体 (≤ 13 mm), its traits on absolute lengths', () => {
    expect(sp.stages.map((s) => [s.id, s.maxLength_mm])).toEqual([['juvenile', 9], ['young', 13], ['adult', undefined]]);
    // (each rule draws uniformly, so a percentile of N(mean, sd) would flag most of a rule)
    for (const tr of sp.traits) expect(tr.when, tr.id).toMatch(/^length_mm[<>]=\d+$/);
  });
});

describe('ボラ', () => {
  const sp = species.find((s) => s.id === 'mugil_cephalus')!;
  const overlap = (a: readonly string[] | undefined, b: readonly string[] | undefined) => !a || !b || a.some((x) => b.includes(x));

  it('has スバシリ (5–10 cm) all year, in the eelgrass of 走水 and on the open flats', () => {
    const big = sp.spawn.filter((r) => r.length_mm && r.length_mm[0] >= 45);
    expect(big.length).toBeGreaterThanOrEqual(2);
    expect(big.some((r) => r.maps?.includes('hashirimizu') && r.tags.includes('eelgrass'))).toBe(true);
    for (const r of big) {
      expect(r.season ?? ['spring', 'summer', 'autumn', 'winter']).toEqual(expect.arrayContaining(['spring', 'summer', 'autumn', 'winter']));
      expect(r.length_mm![1]).toBeLessThanOrEqual(sp.size.length_mm.max);
    }
  });

  it('is not capped out of the スバシリ by the fry: a rule caps the whole species, so theirs is at least as high as any rule of the same season and place', () => {
    // (the spawner skips a rule once the species' count reaches that rule's maxPopulation, whichever rule spawned them)
    for (const [i, r] of sp.spawn.entries()) {
      if (!r.length_mm || r.length_mm[0] < 45) continue;
      for (const [j, o] of sp.spawn.entries()) {
        if (j === i || !overlap(r.season, o.season) || !overlap(r.maps, o.maps)) continue;
        expect(r.maxPopulation, `rule ${i} against rule ${j}`).toBeGreaterThanOrEqual(o.maxPopulation);
      }
    }
  });
});
