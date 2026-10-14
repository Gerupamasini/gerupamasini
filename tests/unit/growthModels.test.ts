import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { modelFor, variantOf } from '../../src/creatures/models/choice';
import { generateIndividual } from '../../src/creatures/Individual';

// マハゼ comes in three growth forms (juvenile / subadult / adult GLBs), each carrying nine variants (three patterns × three colour morphs).
const root = fileURLToPath(new URL('../../', import.meta.url));
const sp = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/acanthogobius_flavimanus.json', 'utf8')));

interface Lod { variants: number; colours: number; patternChannels: number; melanin?: string; morphs?: { name: string }[] }
function glbJson(rel: string): {
  extensions?: Record<string, unknown>; extensionsUsed?: string[]; nodes: { extras?: Record<string, unknown> }[];
  materials: { extras?: { mahaze?: { role: string; lod?: Lod; pigmentTexture?: number; snoutCap?: unknown; relief?: number; pigment?: number } } }[];
} {
  const buf = readFileSync(root + 'src/assets/models/' + rel);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

describe('マハゼの成長段階ごとのモデル', () => {
  it('stage thresholds: ~7 cm juvenile, 8–14 cm young, bigger adult', () => {
    const stageAt = (len: number) => generateIndividual(sp, 1, 0, 0, 0, 0, 0, [len, len]).stage;
    expect(stageAt(50)).toBe('juvenile');
    expect(stageAt(74)).toBe('juvenile');
    expect(stageAt(80)).toBe('young');
    expect(stageAt(140)).toBe('young');
    expect(stageAt(150)).toBe('adult');
    expect(stageAt(200)).toBe('adult');
  });

  it('each stage has its own growth form; the species default is the subadult', () => {
    expect(modelFor(sp, 'juvenile').hero).toBe('mahaze/mahaze_juvenile.hero.glb');
    expect(modelFor(sp, 'young').hero).toBe('mahaze/mahaze_subadult.hero.glb');
    expect(modelFor(sp, 'adult').hero).toBe('mahaze/mahaze_adult.hero.glb');
    expect(modelFor(sp).hero).toBe('mahaze/mahaze_subadult.hero.glb');
    expect(modelFor(sp, 'adult').modelLength_mm).toBe(sp.model.modelLength_mm);
    expect(modelFor(sp, 'nonsense')).toBe(sp.model);
  });

  it('the hero GLBs carry nine variants (three patterns × three colour morphs) in packed maps, tagged with their growth stage', () => {
    for (const [stage, variant] of [['juvenile', 'juvenile'], ['young', 'subadult'], ['adult', 'adult']] as const) {
      const m = modelFor(sp, stage);
      for (const key of ['hero', 'lod1', 'lod2'] as const) expect(existsSync(root + 'src/assets/models/' + m[key]!), `${stage} ${key}`).toBe(true);
      const j = glbJson(m.hero!);
      // one body material for all nine (no glTF material variants): the patterns are channels of its pigment map,
      // the colour morphs a table the game rebuilds them from
      expect(j.extensionsUsed ?? []).not.toContain('KHR_materials_variants');
      const bodies = j.materials.filter((mm) => mm.extras?.mahaze?.role === 'body');
      expect(bodies.length).toBe(1);
      const x = bodies[0].extras!.mahaze!;
      // (the observed fish keeps the melanin as its density, the distance tiers as its darkening: tools/lib/gobyLod.mjs)
      expect(x.lod).toMatchObject({ variants: 9, colours: 3, patternChannels: 3, melanin: 'density' });
      expect(x.lod!.morphs!.map((c) => c.name)).toEqual(['standard', 'amber', 'dark']);
      expect(x.pigmentTexture).toBeDefined();
      expect(x.snoutCap).toBeDefined();
      const fins = j.materials.filter((mm) => mm.extras?.mahaze?.role === 'fin');
      expect(fins.length).toBe(1);
      expect(fins[0].extras!.mahaze).toMatchObject({ relief: expect.any(Number), pigment: expect.any(Number) });
      const fish = j.nodes.find((n) => n.extras?.totalLength_mm);
      expect(fish?.extras?.variant).toBe(variant);
      for (const key of ['lod1', 'lod2'] as const) {
        const lod = glbJson(m[key]!).materials.find((mm) => mm.extras?.mahaze?.role === 'body')!.extras!.mahaze!.lod;
        expect(lod, `${stage} ${key}`).toMatchObject({ variants: 9, colours: 3, melanin: 'darkening' });
      }
    }
  });

  it('the variant is fixed by the id and spread over all nine', () => {
    expect(variantOf('acanthogobius_flavimanus#0001abcd')).toBe(variantOf('acanthogobius_flavimanus#0001abcd'));
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(variantOf(`acanthogobius_flavimanus#${i.toString(16).padStart(8, '0')}`) % 9);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
