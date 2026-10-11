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

  it('keeps the bay outside deep and starts the player on the dry berm', () => {
    expect(heightAt(-155, 0)).toBeLessThan(-1.8);
    expect(heightAt(0, -155)).toBeLessThan(-1.8);
    expect(heightAt(map.spawnStart.x, map.spawnStart.z)).toBeGreaterThan(0.9);
  });

  it('holds many tide pools on the flat when the tide is out', () => {
    // priority flood from the map's edge: a cell is in a pool where the lowest way out stands above it
    const H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = heightAt(-half + i * cell, -half + j * cell);
    const fill = new Float32Array(N * N).fill(NaN);
    const heap: [number, number][] = [];
    const push = (v: number, k: number) => { heap.push([v, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    for (let k = 0; k < N * N; k++) { const i = k % N, j = (k / N) | 0; if (i === 0 || j === 0 || i === N - 1 || j === N - 1) { fill[k] = H[k]; push(H[k], k); } }
    while (heap.length) {
      const [v, k] = pop(); const i = k % N, j = (k / N) | 0;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const q = b * N + a;
        if (Number.isNaN(fill[q])) { fill[q] = Math.max(H[q], v); push(fill[q], q); }
      }
    }
    // pools above a low tide (−0.7 m), counted as separate patches
    const pooled = (k: number) => fill[k] > -0.69 && fill[k] > H[k] + 0.02;
    const seen = new Uint8Array(N * N);
    let pools = 0;
    for (let k = 0; k < N * N; k++) {
      if (seen[k] || !pooled(k)) continue;
      let size = 0; const stack = [k]; seen[k] = 1;
      while (stack.length) { const c = stack.pop()!; size++; const i = c % N, j = (c / N) | 0; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (a < 0 || b < 0 || a >= N || b >= N) continue; const q = b * N + a; if (!seen[q] && pooled(q)) { seen[q] = 1; stack.push(q); } } }
      if (size * cell * cell > 4) pools++;
    }
    expect(pools).toBeGreaterThan(60);
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
