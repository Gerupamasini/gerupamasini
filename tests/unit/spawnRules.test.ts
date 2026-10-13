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
  it('lives on 走水 only (not on 葛西), up to 20 at a time', () => {
    const sp = species.find((s) => s.id === 'euprymna_morsei')!;
    expect(sp).toBeDefined();
    for (const [i, r] of sp.spawn.entries()) {
      expect(r.maps, `rule ${i}`).toEqual(['hashirimizu']);
      expect(r.maxPopulation, `rule ${i}`).toBe(20);
    }
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
