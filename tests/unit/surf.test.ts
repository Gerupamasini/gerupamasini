import { describe, expect, it } from 'vitest';
import { makeFoamTexture, surfUniforms } from '../../src/world/Surf';
import type { Terrain } from '../../src/world/Terrain';
import { WaterPass } from '../../src/world/Water';
import { createWaves } from '../../src/world/Waves';
import { HASHIRIMIZU } from '../../src/world/maps/hashirimizu';
import { profile, REF_TIDE } from '../../src/world/maps/hashirimizu/shape';

/** distance from the 0 m line where the ground lies `depth` below the reference tide */
function whereDepth(depth: number): number {
  for (let d = -10; d < 60; d += 0.01) if (REF_TIDE - profile(d) >= depth) return d;
  return NaN;
}

describe('走水 surf and sand', () => {
  it('turns the ripple crests to run along the coast (z), not across it', () => {
    // the ripple field's phase grows along its own y, which the turn maps onto world (-x): crests along z
    const a = HASHIRIMIZU.rippleAngle;
    expect(Math.abs(Math.cos(a))).toBeLessThan(1e-9);
    expect(Math.abs(Math.sin(a))).toBeCloseTo(1, 9);
  });

  it('breaks its waves on the clam flat, a few metres out from the waterline at the reference tide', () => {
    const s = HASHIRIMIZU.surf!;
    // (breaker index ~1.05 on this slope: the depth at which a wave of the layout's height goes over)
    const shore = whereDepth(0), breaker = whereDepth(s.height / 1.05);
    expect(shore).toBeGreaterThan(2);
    expect(breaker - shore).toBeGreaterThan(1.5);
    expect(breaker - shore).toBeLessThan(10);
    // inside the clam flat and short of the eelgrass, where the player wades
    expect(breaker).toBeLessThan(12.5);
  });

  it('has no surf on a sheltered flat', () => {
    expect(surfUniforms(null).uSurf.value.w).toBe(0);
    expect(surfUniforms(null).uSurfDir.value.w).toBe(0);
    expect(surfUniforms(HASHIRIMIZU.surf).uSurf.value.w).toBe(1);
  });

  it('makes a foam lace that tiles without a seam', () => {
    const t = makeFoamTexture(64);
    const S = t.image.width, d = t.image.data as Uint8Array;
    const at = (i: number, j: number, c: number) => d[(j * S + i) * 4 + c];
    let jumpEdge = 0, jumpIn = 0;
    for (let j = 0; j < S; j++) for (const c of [0, 1]) {
      jumpEdge += Math.abs(at(S - 1, j, c) - at(0, j, c));
      jumpIn += Math.abs(at(S / 2, j, c) - at(S / 2 - 1, j, c));
    }
    // across the wrap the lace changes no more than between any two neighbouring columns
    expect(jumpEdge).toBeLessThan(jumpIn * 1.6 + 1);
    // and it is a lace: mostly open, with bright cell walls
    let bright = 0;
    for (let k = 0; k < S * S; k++) if (d[k * 4 + 1] > 128) bright++;
    expect(bright / (S * S)).toBeGreaterThan(0.03);
    expect(bright / (S * S)).toBeLessThan(0.5);
    t.dispose();
  });
});

describe('the surf field for what floats in it', () => {
  // (only what the water reads from the terrain at construction; no GL needed to build the pass)
  const terrain = { heightTexture: null, spillTexture: null, n: 8, half: 48 } as unknown as Terrain;

  it('is drawn over the whole terrain where the shore has surf, and not at all on a sheltered flat', () => {
    const waves = createWaves();
    const open = new WaterPass(terrain, waves, surfUniforms(HASHIRIMIZU.surf));
    const calm = new WaterPass(terrain, waves, surfUniforms(null));
    expect(open.surfField?.half).toBe(48);
    expect(open.surfCompileTarget()).not.toBeNull();
    expect(calm.surfField).toBeNull();
    expect(calm.surfCompileTarget()).toBeNull();
    open.dispose();
    calm.dispose();
  });
});
