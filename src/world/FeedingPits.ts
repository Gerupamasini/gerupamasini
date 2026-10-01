import { Rng } from '../core/Rng';
import type { Substrate } from '../data/schemas';
import type { TerrainGrid } from './Terrain';

/** A stingray feeding pit: a shallow bowl the ray dug into the flat; holds a little water when the tide is out. */
export interface FeedingPit {
  id: number;
  x: number;
  z: number;
  /** radius (m) */
  r: number;
  /** depth at the centre (m) */
  depth: number;
  /** the undisturbed ground level, the pit's rim; water stays in the pit up to this height */
  rim: number;
}

/**
 * Carve アカエイの食痕 into the height grid: clusters of round pits 90–140 cm wide and 4–9 cm deep on sandy and
 * muddy-sand parts of the intertidal flat. Deterministic for a seed, so the flat looks the same every visit.
 */
export function carveFeedingPits(grid: TerrainGrid, palette: Substrate[], seed: number, clusters = 48): FeedingPit[] {
  const rng = new Rng(seed);
  const n = grid.n, half = grid.size / 2, cell = grid.size / (n - 1);
  const h = grid.heights, sub = grid.substrate;
  const idx = (x: number, z: number) => {
    const i = Math.round((x + half) / cell), j = Math.round((z + half) / cell);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
  };
  const pits: FeedingPit[] = [];
  const okHere = (x: number, z: number): boolean => {
    const k = idx(x, z);
    if (k < 0) return false;
    const s = palette[sub[k]];
    if (s !== 'sand' && s !== 'muddy_sand') return false;
    const y = h[k];
    if (y < -1.25 || y > -0.25) return false;
    // flat ground only: no pits on the slopes of channels or the bar
    const kx = idx(x + cell * 2, z), kz = idx(x, z + cell * 2);
    if (kx < 0 || kz < 0 || Math.abs(h[kx] - y) > 0.06 || Math.abs(h[kz] - y) > 0.06) return false;
    return true;
  };
  for (let c = 0; c < clusters; c++) {
    let cx = 0, cz = 0, found = false;
    for (let tries = 0; tries < 40 && !found; tries++) {
      cx = rng.range(-half + 12, half - 12);
      cz = rng.range(-half + 12, half - 12);
      found = okHere(cx, cz);
    }
    if (!found) continue;
    const count = rng.int(4, 12);
    for (let p = 0; p < count; p++) {
      const x = cx + rng.range(-7, 7), z = cz + rng.range(-7, 7);
      if (!okHere(x, z)) continue;
      if (pits.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 1.2)) continue;
      const r = rng.range(0.45, 0.7), depth = rng.range(0.06, 0.12);
      const rim = h[idx(x, z)];
      const ci = Math.round((x + half) / cell), cj = Math.round((z + half) / cell), span = Math.ceil((r * 1.2) / cell);
      for (let j = cj - span; j <= cj + span; j++) for (let i = ci - span; i <= ci + span; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const d = Math.hypot(-half + i * cell - x, -half + j * cell - z) / r;
        if (d >= 1.15) continue;
        const w = Math.max(0, 1 - d * d);
        h[j * n + i] -= depth * w;
      }
      pits.push({ id: pits.length, x, z, r, depth, rim });
    }
  }
  return pits;
}
