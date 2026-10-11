import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { MapSchema } from '../../src/data/schemas/map';
import { LeveeLine } from '../../src/world/LeveeLine';
import { REED_MIX, reedKindFor } from '../../src/world/ReedBed';

const map = MapSchema.parse(JSON.parse(fs.readFileSync('public/data/maps/kasai_west.json', 'utf8')));
const png = PNG.sync.read(fs.readFileSync('public/data/maps/kasai_west/height.png'));
const N = map.resolution, cell = map.size_m / (N - 1), half = map.size_m / 2;
function heightAt(x: number, z: number): number {
  const i = Math.round((x + half) / cell), j = Math.round((z + half) / cell), o = (j * N + i) * 4;
  return ((png.data[o] * 256 + png.data[o + 1]) / 65535) * (map.height.max_tp_m - map.height.min_tp_m) + map.height.min_tp_m;
}

describe('東なぎさ (kasai_west)', () => {
  const levee = new LeveeLine(map.levee!);

  it('turns the levee inward toward the enclosed flat', () => {
    for (const s of [40, levee.length / 3, levee.length / 2, (2 * levee.length) / 3, levee.length - 40]) {
      const p = levee.at(s);
      // the enclosure's middle lies on the inner side everywhere along the U
      expect((0 - p.x) * p.nx + (0 - p.z) * p.nz, `s=${s.toFixed(0)}`).toBeGreaterThan(0);
    }
  });

  it('stands the levee crest above the spring high water, sinking only at its tips', () => {
    for (let s = map.levee!.tip_m + 5; s < levee.length - map.levee!.tip_m - 5; s += 20) {
      const p = levee.at(s);
      expect(heightAt(p.x, p.z), `s=${s.toFixed(0)}`).toBeGreaterThan(2.3);
    }
    for (const s of [0, levee.length]) { const p = levee.at(s); expect(heightAt(p.x, p.z)).toBeLessThan(0.5); }
  });

  it('keeps the bay outside deep and starts the player on a dry bar', () => {
    expect(heightAt(-155, 0)).toBeLessThan(-1.8);
    expect(heightAt(0, -155)).toBeLessThan(-1.8);
    expect(heightAt(map.spawnStart.x, map.spawnStart.z)).toBeGreaterThan(0.9);
  });
});

describe('reeds by season', () => {
  it('shares each season among the three kinds', () => {
    for (const mix of Object.values(REED_MIX)) expect(mix.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('turns the same clumps from young to green to gold through the year', () => {
    const count = (season: keyof typeof REED_MIX) => {
      const c = { young: 0, summer: 0, golden: 0 };
      for (let i = 0; i < 1000; i++) c[reedKindFor((i + 0.5) / 1000, season)]++;
      return c;
    };
    expect(count('spring').young).toBeGreaterThan(count('spring').golden);
    expect(count('summer').summer).toBeGreaterThan(800);
    expect(count('autumn').golden).toBeGreaterThan(count('autumn').summer);
    expect(count('winter').golden).toBe(1000);
  });
});
