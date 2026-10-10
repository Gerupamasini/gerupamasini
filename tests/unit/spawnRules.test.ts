import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SpeciesSchema, type SpeciesDef } from '../../src/data/schemas';

const json = (rel: string) => JSON.parse(readFileSync(new URL(`../../public/data/${rel}`, import.meta.url), 'utf8')) as unknown;
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
    const grass = new Set(['bare', 'eelgrass', 'eelgrass_edge']), pools = new Set(['pool', 'small_pool']);
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
