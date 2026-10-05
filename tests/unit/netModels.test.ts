import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The hand-net GLBs (tools/models/nets) are an asset contract for the game: scale, origin, node names
// and morph targets must stay put when the builder changes.
const dir = fileURLToPath(new URL('../../src/assets/models/nets/', import.meta.url));
const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as { nets: Record<string, { spec: { handle_cm: number }; tiers: Record<string, { file: string; triangles: number }> }> };

interface Gltf {
  scenes: { nodes: number[] }[];
  nodes: { name: string; translation?: number[]; children?: number[]; mesh?: number; extras?: { higataNet?: Record<string, unknown> } }[];
  meshes: { name: string; extras?: { targetNames?: string[] }; primitives: { attributes: Record<string, number>; targets?: Record<string, number>[] }[] }[];
  animations?: { name: string }[];
}

function readGlb(file: string): Gltf {
  const buf = readFileSync(dir + file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as Gltf;
}

const IDS = ['net_small', 'net_shallow', 'net_fine', 'net_deep', 'net_dframe', 'net_premium'];

describe('hand-net GLBs', () => {
  it('ships six nets in three LOD tiers with decreasing triangle counts', () => {
    expect(Object.keys(manifest.nets).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const t = manifest.nets[id].tiers;
      expect(t.hero.triangles).toBeGreaterThan(t.lod1.triangles);
      expect(t.lod1.triangles).toBeGreaterThan(t.lod2.triangles);
      expect(t.hero.triangles).toBeLessThan(40000);
    }
  });

  for (const id of IDS) {
    for (const tier of ['hero', 'lod1', 'lod2']) {
      it(`${id}.${tier}: grip at the origin, real handle length, bag morphs`, () => {
        const g = readGlb(`${id}.${tier}.glb`);
        const root = g.nodes[g.scenes[0].nodes[0]];
        expect(root.name).toBe(id);
        const info = root.extras!.higataNet! as { buttZ_m: number; tipZ_m: number; mass_g: number; morphTargets: string[] };
        // the handle runs from the butt (behind the grip) to the frame pivot, as long as the catalogue says
        expect(info.tipZ_m - info.buttZ_m).toBeCloseTo(manifest.nets[id].spec.handle_cm / 100, 1);
        expect(info.buttZ_m).toBeLessThan(0);
        expect(info.mass_g).toBeGreaterThan(100);
        const byName = new Map(g.nodes.map((n) => [n.name, n]));
        for (const n of ['Grip_Main', 'Grip_Support', 'Frame_Pivot', 'Frame', 'Bag', 'Mouth']) expect(byName.has(n), n).toBe(true);
        expect(byName.get('Grip_Main')!.translation ?? [0, 0, 0]).toEqual([0, 0, 0]);
        const bag = g.meshes[byName.get('Bag')!.mesh!];
        expect(bag.extras!.targetNames).toEqual(['Stream', 'Invert', 'Trail', 'Wet']);
        for (const p of bag.primitives) {
          expect(p.targets).toHaveLength(4);
          expect(p.targets![0].NORMAL).toBeDefined();
        }
        for (const m of g.meshes) for (const p of m.primitives) {
          expect(p.attributes._DIRT, m.name).toBeDefined();
          expect(p.attributes.TEXCOORD_0, m.name).toBeDefined();
        }
        expect(g.animations!.map((a) => a.name)).toEqual(expect.arrayContaining(['Bag_Scoop', 'Bag_Dip', 'Bag_Shake']));
      });
    }
  }
});
