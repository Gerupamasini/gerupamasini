import { Vector3 } from 'three';
import type { HabitatTag, Substrate } from '../data/schemas';
import type { FeedingPit } from './FeedingPits';
import type { Terrain } from './Terrain';

export interface HabitatSample {
  /** water depth [m]; negative when exposed */
  depth: number;
  substrate: Substrate;
  exposed: boolean;
  /** 0..1, 1 = just submerged */
  wetness: number;
  /** horizontal distance to the nearest wet cell [m] (0 when submerged) */
  distToWater: number;
  inPool: boolean;
  tags: HabitatTag[];
  /** local water surface height (tide or pool level) */
  waterLevel: number;
  groundHeight: number;
}

export interface PoolInfo {
  id: number;
  level: number;
  cells: number[];
  cx: number;
  cz: number;
  area: number;
}

/** Min-heap keyed by number. */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number { return this.keys.length; }
  push(k: number, v: number): void {
    const keys = this.keys, vals = this.vals;
    keys.push(k); vals.push(v);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      [keys[p], keys[i]] = [keys[i], keys[p]];
      [vals[p], vals[i]] = [vals[i], vals[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const keys = this.keys, vals = this.vals;
    const top: [number, number] = [keys[0], vals[0]];
    const lk = keys.pop()!, lv = vals.pop()!;
    if (keys.length) {
      keys[0] = lk; vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < keys.length && keys[l] < keys[m]) m = l;
        if (r < keys.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [vals[m], vals[i]] = [vals[i], vals[m]];
        i = m;
      }
    }
    return top;
  }
}

const WET_TAU_MS: Record<Substrate, number> = {
  sand: 40 * 60 * 1000,
  muddy_sand: 80 * 60 * 1000,
  mud: 120 * 60 * 1000,
  gravel: 30 * 60 * 1000,
  channel: 180 * 60 * 1000,
};

/**
 * Habitat state derived from the terrain and the tide: depth, exposure, tide pools (depressions keep water at their
 * spill height), wetness memory and the habitat tags used by spawn rules. Tags live on a coarse grid (COARSE m cells).
 */
/** pools smaller than this (m²) count as 'small_pool' habitat */
const SMALL_POOL_M2 = 40;

export class Habitat {
  readonly spill: Float32Array;
  readonly pools: PoolInfo[] = [];
  /** per fine cell: the level of the tide pool it belongs to (dilated two cells), else -1e3; drives the shaders */
  readonly poolLevels: Float32Array;
  readonly coarse: number;
  readonly cn: number;
  readonly tags: HabitatTag[][];
  readonly lastWet: Float64Array;
  readonly coarseHeight: Float32Array;
  readonly coarseSubstrate: Uint8Array;
  readonly coarseSpill: Float32Array;
  readonly coarseDist: Float32Array;
  /** per coarse cell: the level of the small pool or feeding pit in it (else -1e3) */
  readonly coarseSmallPool: Float32Array;
  tideLevel = 0;
  /** running high-water mark that decays toward the tide level (drives the wet band) */
  wetLevel = 0;
  private lastUpdateMs = 0;

  constructor(readonly terrain: Terrain, coarseCell = 5, readonly pits: FeedingPit[] = []) {
    this.spill = this.computeSpill();
    this.findPools();
    this.poolLevels = this.buildPoolLevels();
    this.coarse = coarseCell;
    this.cn = Math.max(2, Math.round(terrain.size / coarseCell));
    const cn2 = this.cn * this.cn;
    this.tags = Array.from({ length: cn2 }, () => []);
    this.lastWet = new Float64Array(cn2);
    this.coarseHeight = new Float32Array(cn2);
    this.coarseSubstrate = new Uint8Array(cn2);
    this.coarseSpill = new Float32Array(cn2);
    this.coarseDist = new Float32Array(cn2);
    this.coarseSmallPool = new Float32Array(cn2).fill(-1e3);
    for (const p of this.pools) if (p.area < SMALL_POOL_M2) for (const k of p.cells) {
      const ci = this.coarseIndex(-terrain.half + (k % terrain.n) * terrain.cell, -terrain.half + Math.floor(k / terrain.n) * terrain.cell);
      this.coarseSmallPool[ci] = Math.max(this.coarseSmallPool[ci], p.level);
    }
    for (const pit of pits) { const ci = this.coarseIndex(pit.x, pit.z); this.coarseSmallPool[ci] = Math.max(this.coarseSmallPool[ci], this.spillAt(pit.x, pit.z)); }
    for (let j = 0; j < this.cn; j++) for (let i = 0; i < this.cn; i++) {
      const [x, z] = this.coarseCenter(i, j);
      const k = j * this.cn + i;
      this.coarseHeight[k] = terrain.heightAt(x, z);
      this.coarseSubstrate[k] = terrain.substrateIndexAt(x, z);
      this.coarseSpill[k] = this.spillAt(x, z);
    }
  }

  /** Priority-flood: for each fine cell, the lowest height one must climb to in order to reach the map edge. */
  private computeSpill(): Float32Array {
    const t = this.terrain, n = t.n, h = t.heights;
    const spill = new Float32Array(n * n).fill(Infinity);
    const done = new Uint8Array(n * n);
    const heap = new Heap();
    for (let i = 0; i < n; i++) for (const k of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
      if (!done[k]) { done[k] = 1; spill[k] = h[k]; heap.push(h[k], k); }
    }
    while (heap.size) {
      const [lvl, k] = heap.pop();
      const i = k % n, j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const kk = jj * n + ii;
        if (done[kk]) continue;
        done[kk] = 1;
        spill[kk] = Math.max(lvl, h[kk]);
        heap.push(spill[kk], kk);
      }
    }
    return spill;
  }

  private findPools(): void {
    const t = this.terrain, n = t.n, h = t.heights, spill = this.spill;
    const seen = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) {
      if (seen[k] || spill[k] - h[k] < 0.03) continue;
      const level = spill[k];
      const cells: number[] = [];
      const stack = [k];
      seen[k] = 1;
      let sx = 0, sz = 0;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        const i = c % n, j = (c - i) / n;
        sx += i; sz += j;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const kk = jj * n + ii;
          if (seen[kk] || spill[kk] - h[kk] < 0.03 || Math.abs(spill[kk] - level) > 1e-4) continue;
          seen[kk] = 1;
          stack.push(kk);
        }
      }
      if (cells.length < 6) continue;
      const area = cells.length * t.cell * t.cell;
      this.pools.push({ id: this.pools.length, level, cells, cx: -t.half + (sx / cells.length) * t.cell, cz: -t.half + (sz / cells.length) * t.cell, area });
    }
    this.pools.sort((a, b) => b.area - a.area);
  }

  private buildPoolLevels(): Float32Array {
    const n = this.terrain.n, out = new Float32Array(n * n).fill(-1e3);
    for (const p of this.pools) for (const k of p.cells) out[k] = p.level;
    // grow each pool by two cells so its shallow fringe (less than 3 cm deep) is covered too
    for (let pass = 0; pass < 2; pass++) {
      const src = out.slice();
      for (let k = 0; k < n * n; k++) {
        if (src[k] > -1e2) continue;
        const i = k % n, j = (k - i) / n;
        let best = -1e3;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          best = Math.max(best, src[jj * n + ii]);
        }
        if (best > -1e2) out[k] = best;
      }
    }
    // stingray pits: too small for the pool search. Each holds water up to just under the foot of its rim (the
    // flood's spill height of its centre cell, capped a little below the undisturbed ground, so the coarse cells
    // around the bowl never read as a sheet of water lying on the flat)
    const cell = this.terrain.cell, half = this.terrain.half;
    for (const pit of this.pits) {
      const ci = Math.round((pit.x + half) / cell), cj = Math.round((pit.z + half) / cell);
      if (ci < 0 || cj < 0 || ci >= n || cj >= n) continue;
      const span = Math.ceil((pit.r * 1.15 + cell * 0.5) / cell);
      // never above the lowest undisturbed ground among the cells it is written to, so a slope cannot leave a
      // film of water lying on the flat beside the bowl
      let level = Math.min(this.spill[cj * n + ci], pit.rim - 0.035);
      for (let j = cj - span; j <= cj + span; j++) for (let i = ci - span; i <= ci + span; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const dd = Math.hypot(-half + i * cell - pit.x, -half + j * cell - pit.z);
        if (dd > pit.r * 1.15 + cell * 0.5 || dd < pit.r * 0.8) continue;
        level = Math.min(level, this.terrain.base[j * n + i] - 0.008);
      }
      for (let j = cj - span; j <= cj + span; j++) for (let i = ci - span; i <= ci + span; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        if (Math.hypot(-half + i * cell - pit.x, -half + j * cell - pit.z) > pit.r * 1.15 + cell * 0.5) continue;
        const k = j * n + i;
        out[k] = Math.max(out[k], level);
      }
    }
    return out;
  }

  /** A random point inside a tide pool or feeding pit within a coarse cell (water above the tide), or null. */
  randomPoolPoint(coarseIndex: number, rnd: () => number): [number, number] | null {
    const t = this.terrain, n = t.n;
    const ci = coarseIndex % this.cn, cj = (coarseIndex - ci) / this.cn;
    const x0 = -t.half + ci * this.coarse, z0 = -t.half + cj * this.coarse;
    const i0 = Math.max(0, Math.round((x0 + t.half) / t.cell)), j0 = Math.max(0, Math.round((z0 + t.half) / t.cell));
    const span = Math.ceil(this.coarse / t.cell);
    const cands: number[] = [];
    for (let j = j0; j < Math.min(n, j0 + span); j++) for (let i = i0; i < Math.min(n, i0 + span); i++) {
      const k = j * n + i;
      if (this.poolLevels[k] > this.tideLevel + 0.01 && this.poolLevels[k] > t.heights[k] + 0.03) cands.push(k);
    }
    if (!cands.length) return null;
    const k = cands[Math.floor(rnd() * cands.length)];
    return [-t.half + (k % n) * t.cell + (rnd() - 0.5) * t.cell * 0.6, -t.half + Math.floor(k / n) * t.cell + (rnd() - 0.5) * t.cell * 0.6];
  }

  spillAt(x: number, z: number): number {
    const t = this.terrain;
    const i = Math.max(0, Math.min(t.n - 1, Math.round((x + t.half) / t.cell)));
    const j = Math.max(0, Math.min(t.n - 1, Math.round((z + t.half) / t.cell)));
    return this.spill[j * t.n + i];
  }

  /** Local water surface: tide, or the pool level where a depression holds water above the tide. */
  waterAt(x: number, z: number): number {
    const ground = this.terrain.heightAt(x, z);
    const spill = this.spillAt(x, z);
    if (spill > this.tideLevel && spill > ground + 0.02) return spill;
    return this.tideLevel;
  }

  depthAt(x: number, z: number): number {
    return this.waterAt(x, z) - this.terrain.heightAt(x, z);
  }

  /** Nearest spot (rings of 0.75 m, up to `radius`) with at least `minDepth` of water; the deepest on the first ring that has one. */
  nearestWater(x: number, z: number, minDepth: number, radius = 6): Vector3 | null {
    const step = 0.75, rays = 12;
    for (let ring = 1; ring * step <= radius; ring++) {
      let best: Vector3 | null = null, bestD = minDepth;
      for (let r = 0; r < rays; r++) {
        const ang = (r / rays) * Math.PI * 2 + ring * 0.26;
        const px = x + Math.sin(ang) * step * ring, pz = z + Math.cos(ang) * step * ring;
        if (Math.abs(px) > this.terrain.half - 2 || Math.abs(pz) > this.terrain.half - 2) continue;
        const d = this.depthAt(px, pz);
        if (d >= bestD) { bestD = d; best = new Vector3(px, 0, pz); }
      }
      if (best) return best;
    }
    return null;
  }

  coarseCenter(i: number, j: number): [number, number] {
    const t = this.terrain;
    return [-t.half + (i + 0.5) * this.coarse, -t.half + (j + 0.5) * this.coarse];
  }

  coarseIndex(x: number, z: number): number {
    const t = this.terrain;
    const i = Math.max(0, Math.min(this.cn - 1, Math.floor((x + t.half) / this.coarse)));
    const j = Math.max(0, Math.min(this.cn - 1, Math.floor((z + t.half) / this.coarse)));
    return j * this.cn + i;
  }

  /** Recompute coarse tags for the current tide. Call every couple of seconds. */
  update(nowMs: number, tideLevel: number): void {
    this.tideLevel = tideLevel;
    const dtH = this.lastUpdateMs ? (nowMs - this.lastUpdateMs) / 3600000 : 0;
    this.lastUpdateMs = nowMs;
    // high-water mark decays 0.25 m per hour toward the tide; capped so a tide jump
    // (ticket, debug override) does not leave the whole flat looking freshly wetted
    this.wetLevel = Math.min(Math.max(tideLevel, this.wetLevel - 0.25 * dtH), tideLevel + 0.18);
    const cn = this.cn, cn2 = cn * cn;
    const wet = new Uint8Array(cn2);
    for (let k = 0; k < cn2; k++) {
      const ground = this.coarseHeight[k];
      const spill = this.coarseSpill[k];
      const water = spill > tideLevel && spill > ground + 0.02 ? spill : tideLevel;
      if (water > ground) { wet[k] = 1; this.lastWet[k] = nowMs; }
    }
    // distance to water (BFS over coarse cells)
    const dist = this.coarseDist.fill(1e9);
    const queue: number[] = [];
    for (let k = 0; k < cn2; k++) if (wet[k]) { dist[k] = 0; queue.push(k); }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q];
      const i = k % cn, j = (k - i) / cn;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= cn || jj >= cn) continue;
        const kk = jj * cn + ii;
        if (dist[kk] > dist[k] + this.coarse) { dist[kk] = dist[k] + this.coarse; queue.push(kk); }
      }
    }
    const palette = this.terrain.palette;
    for (let k = 0; k < cn2; k++) {
      const tags: HabitatTag[] = [];
      const ground = this.coarseHeight[k];
      const spill = this.coarseSpill[k];
      const inPool = spill > tideLevel && spill > ground + 0.02;
      const water = inPool ? spill : tideLevel;
      const depth = water - ground;
      const sub = palette[this.coarseSubstrate[k]] ?? 'mud';
      if (depth <= 0) {
        tags.push(sub === 'sand' || sub === 'gravel' ? 'exposed_sand' : 'exposed_mud');
        if (dist[k] <= this.coarse * 1.01) tags.push('waterline');
      } else {
        if (inPool) tags.push('pool');
        else if (depth <= 0.6) tags.push('shallow');
        else tags.push('deep');
        if (sub === 'channel' && depth > 0.05) tags.push('channel');
      }
      // a small pool or a feeding pit in this cell still holds water above the tide: a nursery for small animals
      if (this.coarseSmallPool[k] > tideLevel + 0.01) tags.push('small_pool');
      this.tags[k] = tags;
    }
  }

  sample(x: number, z: number, nowMs: number): HabitatSample {
    const ground = this.terrain.heightAt(x, z);
    const spill = this.spillAt(x, z);
    const inPool = spill > this.tideLevel && spill > ground + 0.02;
    const water = inPool ? spill : this.tideLevel;
    const depth = water - ground;
    const k = this.coarseIndex(x, z);
    const sub = this.terrain.substrateAt(x, z);
    const wetness = depth > 0 ? 1 : Math.exp(-(nowMs - this.lastWet[k]) / WET_TAU_MS[sub]);
    return {
      depth, substrate: sub, exposed: depth <= 0, wetness, distToWater: depth > 0 ? 0 : this.coarseDist[k], inPool,
      tags: this.tags[k], waterLevel: water, groundHeight: ground,
    };
  }

  tagsAt(x: number, z: number): HabitatTag[] {
    return this.tags[this.coarseIndex(x, z)];
  }
}
