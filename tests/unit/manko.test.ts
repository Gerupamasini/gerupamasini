import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { MapSchema, SpotsFileSchema, TideStationSchema } from '../../src/data/schemas';
import { creekZ, heightAt, tributaryX, openness, lakeOpen, canopyAt, groundAt, inThicket, forestDepth } from '../../src/world/maps/manko/shape';
import { LAYOUTS } from '../../src/world/maps/hashirimizu';
import { MangroveForest } from '../../src/world/mangrove';
import { Terrain } from '../../src/world/Terrain';
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url)));
const map = MapSchema.parse(JSON.parse(read('maps/manko.json').toString()));
describe('漫湖 environment-only flat', () => {
  it('connects Okinawa to a 300 m lake basin (200 m walkable) with a clearly labelled simulated tide', () => {
    const spots = SpotsFileSchema.parse(JSON.parse(read('spots.json').toString()));
    expect(spots.spots.find(s => s.id === 'manko')).toMatchObject({ area: '沖縄', map: map.id });
    expect(map.size_m).toBe(300); expect(map.bounds.walkable).toEqual([[-100, -100], [100, 100]]); expect(map.animals).toBe(false);
    expect(map.props).toEqual([]);
    const tide = TideStationSchema.parse(JSON.parse(read(`tide/stations/${map.station}.json`).toString()));
    expect(tide.names.ja).toContain('仮潮汐');
    expect(LAYOUTS.manko.clams.beds).toBe(0); expect(LAYOUTS.manko.pits.clusters).toBe(0);
    expect(LAYOUTS.manko.props(null as unknown as Terrain, 1)).toEqual([]);
  });
  it('bakes shallow channels, an open muddy centre and a dry entry into the actual runtime terrain', () => {
    const h = PNG.sync.read(read(`maps/${map.height.file}`)), s = PNG.sync.read(read(`maps/${map.substrate.file}`));
    expect(h.width).toBe(601); expect(s.width).toBe(h.width);
    const heights = new Float32Array(h.width*h.height), substrate = new Uint8Array(heights.length);
    for (let i=0;i<heights.length;i++) {
      heights[i] = map.height.min_tp_m + ((h.data[i*4]<<8)|h.data[i*4+1])/65535*(map.height.max_tp_m-map.height.min_tp_m);
      substrate[i] = s.data[i*4];
    }
    const terrain = new Terrain({n:h.width,size:map.size_m,heights,substrate},map.substrate.palette);
    expect(terrain.heightAt(map.spawnStart.x,map.spawnStart.z)).toBeGreaterThan(1);
    expect(terrain.substrateAt(0,0)).toBe('mud');
    for (const x of [-60,-30,0]) {
      const z=creekZ(x), depth=heightAt(x,z-7)-heightAt(x,z);
      expect(depth).toBeGreaterThan(.3); expect(depth).toBeLessThan(.8);
      expect(terrain.heightAt(x,z)).toBeCloseTo(heightAt(x,z),1);
      expect(terrain.substrateAt(x,z)).toBe('channel');
    }
    expect(heightAt(tributaryX(40)+4,40)-heightAt(tributaryX(40),40)).toBeGreaterThan(.12);
    // Mud dominates the open part of the walkable square; it is a lake basin, ringed by forest, not a coast.
    let mud=0,open=0; for(let x=-100;x<=100;x+=4)for(let z=-100;z<=100;z+=4){ if(openness(x,z)>.5){open++; if(terrain.substrateAt(x,z)==='mud')mud++;} }
    expect(mud/open).toBeGreaterThan(.75); expect(open/2601).toBeGreaterThan(.5);
    for (let a=0;a<360;a+=10) {
      const r=900, x=Math.cos(a*Math.PI/180)*r, z=Math.sin(a*Math.PI/180)*r;
      // every direction ends in forest (canopy over land) except across the lake, whose far shore is ~400 m out
      expect(canopyAt(x,z)>2 || (lakeOpen(x,z)>.5 && Math.hypot(x,z)<500)).toBe(true);
      expect(groundAt(x,z)).toBeGreaterThan(0);
    }
    const forest = new MangroveForest(terrain,map.mangroves!);
    const adults=forest.specs.filter(t=>t.sapling===null);
    console.log('manko trees', forest.specs.length, 'adults', adults.length);
    expect(adults.length).toBeGreaterThan(500); expect(adults.length).toBeLessThan(1800);
    // deep rows exist for mid/high; the thicket beyond the front rows is impassable
    expect(adults.some(t=>t.deep)).toBe(true);
    expect(forest.specs.filter(t=>t.deep && forestDepth(t.x,t.z)<6).length).toBe(0);
    expect(inThicket(-140,140)).toBe(true); expect(inThicket(0,0)).toBe(false);
    // Open flat: adults only on the forest edge and the islands, seedlings on the mud.
    expect(adults.filter(t=>openness(t.x,t.z)>.9 && lakeOpen(t.x,t.z)<.1).length).toBeLessThan(adults.length*0.05);
    expect(forest.specs.filter(t=>t.sapling!==null && openness(t.x,t.z)>.5).length).toBeGreaterThan(20);
    expect(forest.collision.segments.length).toBeGreaterThan(1000);
    forest.dispose();terrain.dispose();
  });
});
