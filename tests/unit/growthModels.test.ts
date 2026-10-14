import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SpeciesSchema } from '../../src/data/schemas/species';
import { modelFor, variantOf } from '../../src/creatures/models/choice';
import { generateIndividual } from '../../src/creatures/Individual';
import { morphCount, morphPick, type MorphTable } from '../../src/creatures/species/mahaze/colourMorph.js';

// マハゼ comes in three growth forms (juvenile / subadult / adult GLBs), each carrying nine looks (three patterns × three
// colour morphs): every pattern's melanophores in a channel of the pigment map, the colour morphs in a table the game
// rebuilds each fish's colour from (src/creatures/species/mahaze/colourMorph.js).
const root = fileURLToPath(new URL('../../', import.meta.url));
const sp = SpeciesSchema.parse(JSON.parse(readFileSync(root + 'public/data/species/acanthogobius_flavimanus.json', 'utf8')));

interface Glb {
  extensionsUsed?: string[];
  nodes: { extras?: Record<string, unknown> }[];
  materials: { extras?: { mahaze?: { role?: string; morphs?: MorphTable; channels?: Record<string, unknown>; tint?: number[] } } }[];
  meshes: { name: string; primitives: { extensions?: Record<string, unknown> }[] }[];
}
function glbJson(rel: string): Glb {
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

  const morphsOf = (j: Glb) => j.materials.find((mm) => mm.extras?.mahaze?.role === 'body')!.extras!.mahaze!;

  it('every tier of every growth form carries the nine looks (three patterns × three colour morphs), tagged with its growth stage', () => {
    for (const [stage, variant] of [['juvenile', 'juvenile'], ['young', 'subadult'], ['adult', 'adult']] as const) {
      const m = modelFor(sp, stage);
      const tables: string[] = [];
      for (const key of ['hero', 'lod1', 'lod2'] as const) {
        expect(existsSync(root + 'src/assets/models/' + m[key]!), `${stage} ${key}`).toBe(true);
        const j = glbJson(m[key]!);
        // (in channels and uniforms: no glTF material variants, one body material and one fin material)
        expect(j.extensionsUsed ?? [], `${stage} ${key}`).not.toContain('KHR_materials_variants');
        const body = morphsOf(j);
        expect(body.channels?.pigment, `${stage} ${key}`).toBe('melanin3+iridophores');
        expect(body.morphs!.patterns).toEqual(['pattern1', 'pattern2', 'pattern3']);
        expect(body.morphs!.colors.map((c) => c.name)).toEqual(['standard', 'amber', 'dark']);
        tables.push(JSON.stringify(body.morphs));
        const fish = j.nodes.find((n) => n.extras?.totalLength_mm);
        expect(fish?.extras?.variant, `${stage} ${key}`).toBe(variant);
        // the fins in the standard colour (the morphs tint them)
        const fin = j.materials.find((mm) => mm.extras?.mahaze?.role === 'fin')!.extras!.mahaze!;
        expect(fin.tint).toEqual([1, 1, 1]);
      }
      // the same looks at every level: a fish keeps its pattern and colour as it comes nearer
      expect(new Set(tables).size, stage).toBe(1);
    }
    // the colour morphs follow the growth stage (the juvenile's amber keeps fewer xanthophores)
    const xanK = (stage: string) => morphsOf(glbJson(modelFor(sp, stage).lod1!)).morphs!.colors[1].xanK;
    expect(xanK('juvenile')).toBeLessThan(xanK('adult'));
  });

  it('the look is fixed by the id and spread over all nine patterns and colours', () => {
    expect(variantOf('acanthogobius_flavimanus#0001abcd')).toBe(variantOf('acanthogobius_flavimanus#0001abcd'));
    const table = morphsOf(glbJson(modelFor(sp, 'young').lod1!)).morphs!;
    expect(morphCount(table)).toBe(9);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = morphPick(table, variantOf(`acanthogobius_flavimanus#${i.toString(16).padStart(8, '0')}`));
      seen.add(`${p.pattern}${p.color}`);
    }
    expect([...seen].sort()).toEqual(['00', '01', '02', '10', '11', '12', '20', '21', '22']);
    // the order the glTF variants had (patterns outer, colours inner): every fish keeps the look it had
    expect(morphPick(table, 5)).toEqual({ pattern: 1, color: 2 });
    expect(morphPick(table, -1)).toEqual({ pattern: 2, color: 2 });
  });
});
