import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Binoculars and chest waders (tools/models/digging/build.mjs --set optics|apparel): node contract and LODs.
const CASES: [string, string, string[]][] = [
  ['optics', 'obs_binoculars', ['Tool', 'Eye_L', 'Eye_R', 'Grip_Main', 'Grip_Support', 'Objective_Center']],
  ['apparel', 'wear_waders', ['Tool', 'Hips', 'Chest_Top', 'Foot_L', 'Foot_R']],
];

describe('prop GLBs', () => {
  for (const [set, id, nodes] of CASES) {
    const dir = fileURLToPath(new URL(`../../src/assets/models/${set}/`, import.meta.url));
    it(`${id}: three tiers with decreasing detail and the expected nodes`, () => {
      const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as { tools: Record<string, { tiers: Record<string, { triangles: number }> }> };
      const t = manifest.tools[id].tiers;
      expect(t.hero.triangles).toBeGreaterThan(t.lod1.triangles);
      expect(t.lod1.triangles).toBeGreaterThan(t.lod2.triangles);
      for (const tier of ['hero', 'lod1', 'lod2']) {
        const buf = readFileSync(`${dir}${id}.${tier}.glb`);
        const g = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { nodes: { name: string }[] };
        const names = new Set(g.nodes.map((n) => n.name));
        for (const n of [id, ...nodes]) expect(names.has(n), `${tier} ${n}`).toBe(true);
      }
    });
  }
});
