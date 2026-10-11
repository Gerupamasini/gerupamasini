import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { OYSTER_BEHAVIOR_ID } from '../../src/creatures/oyster/OysterDriver';
import { SpeciesSchema } from '../../src/data/schemas/species';

describe('マガキの図鑑データ', () => {
  const sp = SpeciesSchema.parse(JSON.parse(fs.readFileSync(new URL('../../public/data/species/crassostrea_gigas.json', import.meta.url).pathname, 'utf8')));

  it('is a sessile, observe-only species the reef lays itself', () => {
    expect(sp.locomotion).toBe('sessile');
    expect(sp.collectable).toBe(false);
    expect(sp.model.driver).toBe('oyster');
    expect(sp.spawn[0].maxPopulation).toBe(1);
  });

  it('records every behaviour state the driver can report', () => {
    const ids = new Set(sp.encyclopedia.behaviors.map((b) => b.id));
    for (const id of Object.values(OYSTER_BEHAVIOR_ID)) expect(ids.has(id), id).toBe(true);
    expect(new Set(Object.values(OYSTER_BEHAVIOR_ID)).size).toBe(5);
  });

  it('stages follow the genome age classes', () => {
    const max = Object.fromEntries(sp.stages.map((s) => [s.id, s.maxLength_mm]));
    expect(max.spat).toBe(26);
    expect(max.juvenile).toBe(60);
    expect(max.adult).toBe(115);
    expect(sp.stages[sp.stages.length - 1].id).toBe('old');
  });
});
