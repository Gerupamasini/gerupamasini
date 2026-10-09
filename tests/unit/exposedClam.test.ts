import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Group, Vector3 } from 'three';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { generateIndividual } from '../../src/creatures/Individual';
import { AsariDriver } from '../../src/creatures/asari/Asari.js';
import { FORMS } from '../../src/creatures/asari/AsariModel.js';
import { CreatureSystem } from '../../src/creatures/CreatureSystem';

function clam(form: typeof FORMS.asari, surface: boolean, floorY = 0) {
  const species = SpeciesSchema.parse(JSON.parse(readFileSync(new URL(`../../public/data/species/${form.id === 'hamaguri' ? 'meretrix_lusoria' : 'ruditapes_philippinarum'}.json`, import.meta.url).pathname, 'utf8')));
  const ind = generateIndividual(species, 17, 0, 0, floorY, 0, 0, [60, 60]);
  const root = new Group(); root.userData.startOnSurface = surface;
  const driver = new AsariDriver(form); driver.attach(root, ind);
  if (!surface) driver.beh!.burial = 1;
  const ctx = { floor: { heightAt: () => floorY, waterAt: () => floorY + .2 }, player: new Vector3(5, 1, 5), simScale: 1, nowMs: 0 };
  driver.update(0, ctx);
  return { ind, root, driver, ctx };
}

describe('exposed bivalves can be netted', () => {
  for (const form of [FORMS.asari, FORMS.hamaguri]) {
    it(`${form.id}: visible valves are nettable, buried shells and siphons are not`, () => {
      const exposed = clam(form, true, .13), buried = clam(form, false, .13);
      expect(exposed.driver.canNetCapture()).toBe(true);
      expect(buried.driver.canNetCapture()).toBe(false);
      exposed.driver.beh!.beginBurrow();
      for (let i = 0; i < 1000; i++) exposed.driver.update(.1, exposed.ctx);
      expect(exposed.driver.beh!.burial).toBeGreaterThan(.97);
      expect(exposed.driver.canNetCapture()).toBe(false);
      exposed.driver.detach();
      expect(exposed.driver.canNetCapture()).toBe(false);
      buried.driver.dispose();
    });
  }

  it('eligibility follows the rendered driver and keeps unknown burrowers and birds out', () => {
    const { ind, root, driver } = clam(FORMS.hamaguri, true);
    const entries = new Map([[ind.id, { ind, driver: driver as { canNetCapture?: () => boolean }, view: { root } as { root: Group } | null }]]);
    const can = () => CreatureSystem.prototype.canNetCapture.call({ entries } as unknown as CreatureSystem, ind.id);
    expect(can()).toBe(true);
    driver.beh!.burial = 1;
    driver.update(0, { floor: { heightAt: () => 0, waterAt: () => .2 }, player: new Vector3(5, 1, 5), simScale: 0 });
    expect(can()).toBe(false);
    expect(CreatureSystem.prototype.canNetCapture.call({ entries } as unknown as CreatureSystem, 'missing')).toBe(false);
    const entry = entries.get(ind.id)!;
    entry.view = null;
    expect(can()).toBe(false);
    entry.view = { root }; entry.driver = {};
    expect(can()).toBe(false);
    entry.ind = { ...ind, species: { ...ind.species, locomotion: 'swim' } };
    expect(can()).toBe(true);
    entry.ind = { ...ind, species: { ...ind.species, collectable: false } };
    expect(can()).toBe(false);
    entry.ind = { ...ind, species: { ...ind.species, taxon: { ...ind.species.taxon, group: 'bird' } } };
    expect(can()).toBe(false);
    driver.dispose();
  });
});
