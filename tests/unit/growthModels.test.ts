import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { modelFor, variantOf } from '../../src/creatures/models/choice';
import { generateIndividual } from '../../src/creatures/Individual';

// マハゼ comes in three growth forms (juvenile / subadult / adult GLBs), each carrying nine variants (three patterns × three colour morphs).
const root = fileURLToPath(new URL('../../', import.meta.url));
const sp = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/acanthogobius_flavimanus.json', 'utf8')));

function glbJson(rel: string): { extensions?: { KHR_materials_variants?: { variants: { name: string }[] } }; nodes: { extras?: Record<string, unknown> }[]; meshes: { name: string; primitives: { extensions?: Record<string, unknown> }[] }[] } {
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

  it('the hero GLBs carry nine variants (three patterns × three colour morphs) on the body and fins, tagged with their growth stage', () => {
    for (const [stage, variant] of [['juvenile', 'juvenile'], ['young', 'subadult'], ['adult', 'adult']] as const) {
      const m = modelFor(sp, stage);
      for (const key of ['hero', 'lod1', 'lod2'] as const) expect(existsSync(root + 'src/assets/models/' + m[key]!), `${stage} ${key}`).toBe(true);
      const j = glbJson(m.hero!);
      expect(j.extensions?.KHR_materials_variants?.variants.map((v) => v.name)).toEqual(
        [1, 2, 3].flatMap((p) => ['standard', 'amber', 'dark'].map((c) => `pattern${p}_${c}`)),
      );
      const fish = j.nodes.find((n) => n.extras?.totalLength_mm);
      expect(fish?.extras?.variant).toBe(variant);
      for (const name of ['Body', 'Fin_Caudal', 'Fin_Pectoral_L']) {
        const mesh = j.meshes.find((mm) => mm.name === name)!;
        expect(mesh.primitives[0].extensions?.KHR_materials_variants, name).toBeDefined();
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
