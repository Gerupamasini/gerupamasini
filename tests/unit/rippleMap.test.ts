import { describe, expect, it } from 'vitest';
import { rippleMapTexel, uncoveredStrips } from '../../src/world/RippleMap';

/** the global texel each storage texel holds for a window whose first texel is (ox, oz) (as the bake shader maps it) */
function heldBy(sx: number, sz: number, ox: number, oz: number, n: number): [number, number] {
  const m = (v: number) => ((v % n) + n) % n;
  return [ox + m(sx - m(ox)), oz + m(sz - m(oz))];
}

describe('the ripple map window', () => {
  it('bakes exactly the texels a move brings in, wrapping round the texture', () => {
    const n = 64;
    for (const [ox, oz, tx, tz] of [[0, 0, 10, 0], [5, -7, -20, 30], [-100, 37, -80, 0], [3, 3, 3 + 63, 3 - 63]]) {
      const baked = new Set<string>();
      for (const [x, y, w, h] of uncoveredStrips(ox, oz, tx, tz, n)) {
        expect(x >= 0 && y >= 0 && x + w <= n && y + h <= n).toBe(true);
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) baked.add(`${i},${j}`);
      }
      // every storage texel whose global texel is new to the window is baked; every one it already held is kept
      for (let sz = 0; sz < n; sz++) for (let sx = 0; sx < n; sx++) {
        const [gx, gz] = heldBy(sx, sz, tx, tz, n);
        const old = gx >= ox && gx < ox + n && gz >= oz && gz < oz + n;
        if (!old) expect(baked.has(`${sx},${sz}`), `${sx},${sz}`).toBe(true);
        else if (baked.has(`${sx},${sz}`)) {
          // (a texel in both a new column and a new row band may be listed twice; a kept one only where a band covers it)
          const inNewCols = gx < ox || gx >= ox + n, inNewRows = gz < oz || gz >= oz + n;
          expect(inNewCols || inNewRows).toBe(true);
        }
        // and what it held before is the same texel when it is kept
        if (old) expect(heldBy(sx, sz, ox, oz, n)).toEqual([gx, gz]);
      }
    }
  });

  it('keeps some nine texels to a ripple near, about three far', () => {
    expect(0.1 / rippleMapTexel(2048, 0)).toBeGreaterThan(8);
    expect(0.1 / rippleMapTexel(2048, 1)).toBeGreaterThan(3);
    expect(rippleMapTexel(1024, 0)).toBeGreaterThan(rippleMapTexel(2048, 0));
  });
});
