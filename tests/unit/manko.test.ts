import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { MapSchema, SpotsFileSchema, TideStationSchema } from '../../src/data/schemas';
import { creekX, heightAt } from '../../src/world/maps/manko/shape';
import { LAYOUTS } from '../../src/world/maps/hashirimizu';
import { MangroveForest } from '../../src/world/mangrove';
import { Terrain } from '../../src/world/Terrain';
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url)));
const map = MapSchema.parse(JSON.parse(read('maps/manko.json').toString()));
describe('漫湖 environment-only flat', () => {
  it('connects Okinawa to a 70 m map with a clearly labelled simulated tide', () => {
    const spots = SpotsFileSchema.parse(JSON.parse(read('spots.json').toString()));
    expect(spots.spots.find(s => s.id === 'manko')).toMatchObject({ area: '沖縄', map: map.id });
    expect(map.size_m).toBe(70); expect(map.animals).toBe(false);
    expect(map.props).toEqual([]);
    const tide = TideStationSchema.parse(JSON.parse(read(`tide/stations/${map.station}.json`).toString()));
    expect(tide.names.ja).toContain('仮潮汐');
    expect(LAYOUTS.manko.clams.beds).toBe(0); expect(LAYOUTS.manko.pits.clusters).toBe(0);
    expect(LAYOUTS.manko.props(null as unknown as Terrain, 1)).toEqual([]);
  });
  it('bakes shallow channels, an open muddy centre and a dry entry into the actual runtime terrain', () => {
    const h = PNG.sync.read(read(`maps/${map.height.file}`)), s = PNG.sync.read(read(`maps/${map.substrate.file}`));
    expect(h.width).toBe(281); expect(s.width).toBe(h.width);
    const heights = new Float32Array(h.width*h.height), substrate = new Uint8Array(heights.length);
    for (let i=0;i<heights.length;i++) {
      heights[i] = map.height.min_tp_m + ((h.data[i*4]<<8)|h.data[i*4+1])/65535*(map.height.max_tp_m-map.height.min_tp_m);
      substrate[i] = s.data[i*4];
    }
    const terrain = new Terrain({n:h.width,size:map.size_m,heights,substrate},map.substrate.palette);
    expect(terrain.heightAt(map.spawnStart.x,map.spawnStart.z)).toBeGreaterThan(1);
    expect(terrain.substrateAt(0,0)).toBe('mud');
    for (const z of [-20,0,20]) {
      const x=creekX(z), depth=heightAt(x-6,z)-heightAt(x,z);
      expect(depth).toBeGreaterThan(.35); expect(depth).toBeLessThan(.6);
      expect(terrain.heightAt(x,z)).toBeCloseTo(heightAt(x,z),2);
    }
    const forest = new MangroveForest(terrain,map.mangroves!);
    expect(forest.specs.length).toBeGreaterThan(90);
    expect(forest.specs.filter(t=>Math.abs(t.x)<6 && Math.abs(t.z)<20)).toHaveLength(0);
    expect(forest.collision.segments.length).toBeGreaterThan(1000);
    forest.dispose();terrain.dispose();
  });
});
