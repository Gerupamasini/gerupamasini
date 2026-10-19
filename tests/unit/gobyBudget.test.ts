import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { checkSpecies, modelUses } from '../../tools/models/budget.mjs';

// The goby GLBs within the creatures' model budget (tools/models/budget.json, docs/quality/model-budget.md): every form's
// hero, near (lod1) and far (lod2) file, measured as the game loads it (the packed copy), and each level really lighter
// than the one above it. The masters carry the layout the runtime reads (bodyTranslucency.ts, hero/applyHero.ts).

const species = (id: string) => JSON.parse(fs.readFileSync(new URL(`../../public/data/species/${id}.json`, import.meta.url).pathname, 'utf8'));
const GOBIES = ['favonigobius_gymnauchen', 'gymnogobius_macrognathos', 'acanthogobius_flavimanus'];
// what the maps' spare channels hold: one fish per file, or the マハゼ's nine looks (colourMorph.js)
const LAYOUT: Record<string, { near: Record<string, string>; far: Record<string, string> }> = {
  favonigobius_gymnauchen: { near: { mapAlpha: 'ao', pigmentAlpha: 'roughness' }, far: { mapAlpha: 'melanin' } },
  gymnogobius_macrognathos: { near: { mapAlpha: 'ao', pigmentAlpha: 'roughness' }, far: { mapAlpha: 'melanin' } },
  acanthogobius_flavimanus: {
    near: { mapAlpha: 'xanthophores', normal: 'xy+ao+roughness', pigment: 'melanin3+iridophores' },
    far: { mapAlpha: 'xanthophores', pigment: 'melanin3+iridophores' },
  },
};

interface Row { file: string; tier: string; cls: string; m: Record<string, number>; bad: string[] }
interface GltfJson {
  images?: { name?: string }[];
  materials: { name: string; alphaMode?: string; normalTexture?: unknown; pbrMetallicRoughness?: { baseColorTexture?: { index: number } }; extras?: { mahaze?: Record<string, unknown> } }[];
  meshes: { name: string }[];
  skins: { joints: number[] }[];
  nodes: { name?: string }[];
}
/** a master's JSON chunk (only that is read: the hero files are 13–20 MB) */
const master = (rel: string): GltfJson => {
  const fd = fs.openSync(new URL(`../../src/assets/models/${rel}`, import.meta.url).pathname, 'r');
  try {
    const head = new Uint8Array(20);
    fs.readSync(fd, head, 0, 20, 0);
    const json = new Uint8Array(new DataView(head.buffer).getUint32(12, true));
    fs.readSync(fd, json, 0, json.length, 20);
    return JSON.parse(new TextDecoder().decode(json)) as GltfJson;
  } finally {
    fs.closeSync(fd);
  }
};
const role = (j: GltfJson, r: string) => j.materials.filter((m) => m.extras?.mahaze?.role === r);

// (measures 21 packed files, the hero ones 13 MB: generous time for a cold disk)
describe('goby models within the budget', { timeout: 60_000 }, () => {
  for (const id of GOBIES) {
    const sp = species(id);
    const rows = checkSpecies(sp) as Row[];

    it(`${id}: every file of every form fits its tier`, () => {
      const uses = modelUses(sp) as Map<string, Set<string>>;
      // every file the species names is packed and measured
      expect(rows.length).toBe([...uses.values()].reduce((a, t) => a + t.size, 0));
      for (const r of rows) expect(r.bad, `${r.file} (${r.cls} ${r.tier}) over: ${r.bad.map((k) => `${k} ${r.m[k]}`).join(', ')}`).toEqual([]);
    });

    it(`${id}: each level is really lighter than the one above (triangles, map size, download)`, () => {
      const forms = new Map<string, Partial<Record<string, Row>>>();
      for (const r of rows) {
        const base = r.file.replace(/\.(hero|lod1|lod2)\.glb$/, '');
        forms.set(base, { ...(forms.get(base) ?? {}), [r.tier]: r });
      }
      for (const [base, t] of forms) {
        expect(t.hero && t.lod1 && t.lod2, base).toBeTruthy();
        for (const k of ['tris', 'mapPx', 'downloadMB', 'gpuMB']) {
          expect(t.lod1!.m[k], `${base} lod1 ${k}`).toBeLessThan(t.hero!.m[k]);
          expect(t.lod2!.m[k], `${base} lod2 ${k}`).toBeLessThan(t.lod1!.m[k]);
        }
      }
    });

    it(`${id}: the near levels pack AO and roughness into the maps' spare channels; the far level is two meshes`, () => {
      const morphs = !!LAYOUT[id].near.pigment;
      for (const [rel] of modelUses(sp) as Map<string, Set<string>>) {
        const j = master(rel);
        const body = role(j, 'body')[0].extras!.mahaze!;
        // one body and one fin material: the マハゼ's looks in channels and uniforms, not in materials of their own
        expect(role(j, 'body').length, rel).toBe(1);
        expect(role(j, 'fin').length, rel).toBe(1);
        expect(body.morphs !== undefined, rel).toBe(morphs);
        if (rel.endsWith('.lod2.glb')) {
          expect(body.channels, rel).toMatchObject(LAYOUT[id].far);
          // (one look: the far level's mean iridophores and xanthophores stand in for the pigment map it does not carry)
          if (!morphs) expect((body.channels as { pigmentFill?: number[] }).pigmentFill?.length, rel).toBe(2);
          expect(typeof body.pigmentTexture, rel).toBe(morphs ? 'number' : 'undefined');
          expect(j.meshes.map((m) => m.name).sort(), rel).toEqual(['Body', 'Fins']);
          expect(role(j, 'fin')[0].alphaMode, rel).toBe('MASK');
          expect(j.skins[0].joints.map((k) => j.nodes[k].name), rel).toContain('J_pelvic');
        } else {
          expect(body.channels, rel).toMatchObject(LAYOUT[id].near);
          expect(typeof body.pigmentTexture, rel).toBe('number');
          // the same material features on the hero file's standard materials as on lod1 (one program for both)
          const body0 = role(j, 'body')[0];
          expect(body0.normalTexture, rel).toBeDefined();
          const fin = role(j, 'fin')[0], eye = role(j, 'eye')[0];
          expect(fin.alphaMode, rel).toBe('BLEND');
          expect(fin.normalTexture, rel).toBeUndefined();
          // the iris lives in the fin atlas
          expect(eye.pbrMetallicRoughness!.baseColorTexture!.index, rel).toBe(fin.pbrMetallicRoughness!.baseColorTexture!.index);
          expect((eye.extras!.mahaze!.irisRect as number[]).length, rel).toBe(4);
          // the volumetric hero's own maps only in the hero file
          const hero = rel.endsWith('.hero.glb');
          expect(body.snoutCap !== undefined, rel).toBe(hero);
          expect(fin.extras!.mahaze!.dataTexture !== undefined, rel).toBe(hero);
          expect(fin.extras!.mahaze!.normalTexture !== undefined, rel).toBe(hero);
        }
      }
    });
  }
});
