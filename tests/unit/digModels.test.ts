import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The digging-tool GLBs (tools/models/digging): scale, origin and node names are an asset contract.
const dir = fileURLToPath(new URL('../../src/assets/models/digging/', import.meta.url));
const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as {
  tools: Record<string, { spec: { total_cm: number; mass_g: number }; mass_g: number; tiers: Record<string, { triangles: number }> }>;
};

interface Gltf {
  scenes: { nodes: number[] }[];
  nodes: { name: string; translation?: number[]; extras?: { higataTool?: Record<string, unknown> } }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
}
function readGlb(file: string): Gltf {
  const buf = readFileSync(dir + file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as Gltf;
}

const IDS = ['dig_mini', 'dig_trowel', 'dig_shovel', 'dig_rake'];

describe('digging-tool GLBs', () => {
  it('ships four tools in three LOD tiers, near the catalogue weights', () => {
    expect(Object.keys(manifest.tools).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const t = manifest.tools[id];
      expect(t.tiers.hero.triangles).toBeGreaterThan(t.tiers.lod1.triangles);
      expect(t.tiers.lod1.triangles).toBeGreaterThan(t.tiers.lod2.triangles);
      expect(Math.abs(t.mass_g - t.spec.mass_g) / t.spec.mass_g).toBeLessThan(0.1);
    }
  });
  for (const id of IDS) {
    for (const tier of ['hero', 'lod1', 'lod2']) {
      it(`${id}.${tier}: grip at the origin, real overall length, work nodes`, () => {
        const g = readGlb(`${id}.${tier}.glb`);
        const root = g.nodes[g.scenes[0].nodes[0]];
        expect(root.name).toBe(id);
        const info = root.extras!.higataTool! as { overallLength_m: number };
        expect(info.overallLength_m).toBeCloseTo(manifest.tools[id].spec.total_cm / 100, 1);
        const byName = new Map(g.nodes.map((n) => [n.name, n]));
        for (const n of ['Tool', 'Grip_Main', 'Grip_Support', 'Tip', 'Blade_Center']) expect(byName.has(n), n).toBe(true);
        expect(byName.get('Grip_Main')!.translation).toEqual([0, 0, 0]);
        expect(byName.get('Tip')!.translation![2]).toBeGreaterThan(0);
        for (const m of g.meshes) for (const p of m.primitives) expect(p.attributes._DIRT).toBeDefined();
      });
    }
  }
});
