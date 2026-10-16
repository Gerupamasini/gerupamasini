import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { Terrain } from '../../src/world/Terrain';
import { surfUniforms } from '../../src/world/Surf';
import { HASHIRIMIZU } from '../../src/world/maps/hashirimizu';

/** a small flat: sand on the west half, mud on the east, the ground at 0 m */
function flat(): Terrain {
  const n = 41, heights = new Float32Array(n * n), substrate = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) substrate[j * n + i] = i < n / 2 ? 0 : 1;
  return new Terrain({ n, size: 40, heights, substrate }, ['sand', 'mud']);
}

const lum = (c: Color) => (c.r + c.g + c.b) / 3;

describe('Terrain.colorAt: the sediment as drawn, for what takes the colour of the bottom', () => {
  it('follows the substrate, its tint and the water over it', () => {
    const t = flat(), c = new Color();
    t.setWater(-1, -1, 0);
    const sandDry = lum(t.colorAt(-10, 0, c)), mudDry = lum(t.colorAt(10, 0, c));
    expect(sandDry).toBeGreaterThan(mudDry * 1.5);
    // the patches stay within the shader's ±9 %
    expect(sandDry).toBeGreaterThan(0.365 * 0.9);
    expect(sandDry).toBeLessThan(0.365 * 1.1);
    // under the water: darker and a touch bluer, like the wet flat
    t.setWater(0.3, 0.3, 0);
    const wet = t.colorAt(-10, 0, new Color());
    expect(lum(wet) / sandDry).toBeGreaterThan(0.65);
    expect(lum(wet) / sandDry).toBeLessThan(0.8);
    expect(wet.b).toBeGreaterThan(wet.r);
    // the map's sand tint carries through
    t.setSandTint(1.2, 1, 0.8);
    const tinted = t.colorAt(-10, 0, new Color());
    expect(tinted.r / wet.r).toBeCloseTo(1.2, 2);
    expect(tinted.b / wet.b).toBeCloseTo(0.8, 2);
    // between the two the colour blends, as the vertices blend it
    const mid = lum(t.colorAt(0, 0, new Color()));
    expect(mid).toBeLessThan(lum(tinted));
  });
});

describe('Terrain: what its shaders carry', () => {
  it('compiles the silt flat\'s look out unless the map asks for it (NO_MUD)', () => {
    const t = flat();
    const defs = () => (t as unknown as { material: { defines: Record<string, unknown> } }).material.defines;
    expect('NO_MUD' in defs()).toBe(true);
    t.setSediment(1, 1);
    expect('NO_MUD' in defs()).toBe(false);
    t.setSediment(1, 0);
    expect('NO_MUD' in defs()).toBe(true);
  });

  it('compiles the surf out unless the shore has one (NO_SURF: the swash\'s memory, its foam, the planed sand)', () => {
    const t = flat();
    const defs = () => (t as unknown as { material: { defines: Record<string, unknown> } }).material.defines;
    expect('NO_SURF' in defs()).toBe(true);
    t.setSurf(surfUniforms(HASHIRIMIZU.surf));
    expect('NO_SURF' in defs()).toBe(false);
    t.setSurf(surfUniforms(null));
    expect('NO_SURF' in defs()).toBe(true);
  });
});
