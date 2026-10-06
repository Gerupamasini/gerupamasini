import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { AmamoKit, AmamoMeadow, AmamoPatch, ShootGrid, LEAF, MEADOW_QUALITY, SHOOT, ZONE, patchOutline, postureState } from '../../src/world/amamo';
import type { Terrain } from '../../src/world/Terrain';

/** A 320 m flat sloping from +1 m (z = -160, the shore) to -2.4 m (z = +160, the sea), sand everywhere. */
function fakeTerrain(): Terrain {
  const half = 160;
  const heightAt = (x: number, z: number) => 1 - ((z + half) / (2 * half)) * 3.4 + 0.05 * Math.sin(x * 0.05);
  return {
    half, size: 2 * half, cell: 0.5, n: 641,
    heightAt, inside: (x: number, z: number, m = 0) => Math.abs(x) < half - m && Math.abs(z) < half - m,
    pitMaskAt: () => 0, substrateAt: () => 'sand', substrateIndexAt: () => 0,
  } as unknown as Terrain;
}
const flat = { heightAt: () => -1.4 };

describe('アマモ: tide states', () => {
  it('sways freely and stands under deep water, sways little in the shallows, lies down when the water has gone', () => {
    const L = 0.6;
    const high = postureState(2 * L, L), shallow = postureState(0.3 * L, L), low = postureState(-0.05, L);
    expect(high.sway).toBeCloseTo(1, 5);
    expect(high.fall).toBe(0);
    expect(shallow.sway).toBeGreaterThan(0.15);
    expect(shallow.sway).toBeLessThan(0.35);
    expect(shallow.current).toBeLessThan(high.current);
    expect(shallow.fall).toBe(0);
    expect(low.sway).toBe(0);
    expect(low.fall).toBe(1);
  });
  it('changes smoothly with the water depth', () => {
    let prev = postureState(-0.1, 0.6);
    for (let d = -0.1; d <= 1.5; d += 0.01) {
      const s = postureState(d, 0.6);
      expect(s.sway).toBeGreaterThanOrEqual(prev.sway - 1e-9);
      expect(s.fall).toBeLessThanOrEqual(prev.fall + 1e-9);
      expect(Math.abs(s.sway - prev.sway)).toBeLessThan(0.05);
      prev = s;
    }
  });
});

describe('アマモ: a clonal patch', () => {
  const kit = new AmamoKit();
  it('grows close to its target density inside its outline, deterministically', () => {
    const opts = { x: 3, z: -2, radius: 2, density: 60, kind: 'dense' as const, seed: 1234, ground: flat, kit };
    const a = AmamoPatch.grow(opts), b = AmamoPatch.grow(opts);
    expect(a.shoots.length).toBe(b.shoots.length);
    expect(a.shoots[10]).toEqual(b.shoots[10]);
    const target = Math.PI * 4 * 60;
    expect(a.shoots.length).toBeGreaterThan(target * 0.75);
    expect(a.shoots.length).toBeLessThanOrEqual(target);
    const limit = patchOutline(1234, 2, 'dense');
    for (const s of a.shoots) {
      const dx = s.x - 3, dz = s.z + 2;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(limit(Math.atan2(dz, dx)) + 1e-6);
    }
  });
  it('keeps shoots apart, with the real leaf counts and widths, younger and shorter at the edge', () => {
    const { shoots } = AmamoPatch.grow({ x: 0, z: 0, radius: 2.2, density: 70, kind: 'dense', seed: 99, ground: flat, kit });
    const grid = new ShootGrid();
    let close = 0;
    for (const s of shoots) { if (!grid.free(s.x, s.z, 0.02)) close++; grid.add(s.x, s.z); }
    expect(close).toBe(0);
    for (const s of shoots) {
      expect(s.leaves).toBeGreaterThanOrEqual(SHOOT.leavesMin);
      expect(s.leaves).toBeLessThanOrEqual(SHOOT.leavesMax);
      expect(s.width).toBeGreaterThan(LEAF.widthMin * 0.8);
      expect(s.width).toBeLessThan(LEAF.widthMax * 1.2);
      expect(s.sheath).toBeGreaterThanOrEqual(SHOOT.sheathMin);
      expect(s.sheath).toBeLessThanOrEqual(SHOOT.sheathMax);
    }
    const core = shoots.filter((s) => s.edge < 0.4), rim = shoots.filter((s) => s.edge > 0.85);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(rim.map((s) => s.length))).toBeLessThan(mean(core.map((s) => s.length)));
    expect(mean(rim.map((s) => s.leaves))).toBeLessThan(mean(core.map((s) => s.leaves)));
  });
  it('is LeafCluster + Base + Root/Rhizome, three draw calls, thinned and coarsened with distance', () => {
    const p = new AmamoPatch({ x: 0, z: 0, radius: 1.5, density: 60, kind: 'sparse', seed: 5, ground: flat, kit });
    expect(p.children.map((c) => c.name)).toEqual(['LeafCluster', 'Base', 'Root/Rhizome']);
    p.setLod(0);
    expect(p.leafCluster.count).toBe(p.shootCount);
    expect(p.base.visible && p.rootRhizome.visible).toBe(true);
    const v0 = p.drawnVertices;
    p.setLod(1);
    expect(p.rootRhizome.visible).toBe(false);
    const v1 = p.drawnVertices;
    p.setLod(2);
    expect(p.base.visible).toBe(false);
    expect(p.leafCluster.count).toBeLessThan(p.shootCount * 0.5);
    expect(v1).toBeLessThan(v0 * 0.4);
    expect(p.drawnVertices).toBeLessThan(v1 * 0.4);
    p.setLod(-1);
    expect(p.visible).toBe(false);
    expect(p.drawnVertices).toBe(0);
    p.dispose();
  });
  it('can be a single plant with its rhizome and roots', () => {
    const p = new AmamoPatch({ x: 0, z: 0, radius: 0.1, density: 1, kind: 'single', seed: 3, ground: flat, kit, exposeRhizome: true });
    expect(p.shootCount).toBe(1);
    expect(p.rootRhizome.children.map((c) => c.name)).toEqual(['Rhizome', 'Roots']);
    p.setLod(2);
    expect(p.leafCluster.count).toBe(1);
    p.dispose();
  });
});

describe('アマモ: the beds on a flat', () => {
  const meadow = new AmamoMeadow(fakeTerrain(), null, 42);
  it('grows only in its band of the flat, in dense, sparse and pioneer clones', () => {
    expect(meadow.specs.length).toBeGreaterThan(50);
    const t = fakeTerrain();
    for (const s of meadow.specs) {
      const h = t.heightAt(s.x, s.z);
      expect(h).toBeLessThan(ZONE.top + 0.05);
      expect(h).toBeGreaterThan(ZONE.bottom - 0.05);
    }
    const kinds = new Set(meadow.specs.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(['dense', 'pioneer', 'sparse']);
  });
  it('knows which way the sea is, and where the cover is', () => {
    expect(meadow.seaward.y).toBeGreaterThan(0.95);
    expect(meadow.coverAt(0, -140)).toBe(0);
    const dense = meadow.specs.filter((s) => s.kind === 'dense');
    const covered = dense.filter((s) => meadow.coverAt(s.x, s.z) > 0.3).length;
    expect(covered / dense.length).toBeGreaterThan(0.6);
  });
  it('picks a tier by distance with a little hysteresis', () => {
    meadow.setQuality(MEADOW_QUALITY.mid);
    const L = MEADOW_QUALITY.mid.lod;
    expect(meadow.pickLod(1, -1)).toBe(0);
    expect(meadow.pickLod(L[0] + 0.5, -1)).toBe(1);
    expect(meadow.pickLod(L[0] + 0.5, 0)).toBe(0);
    expect(meadow.pickLod(L[0] + 1.5, 0)).toBe(1);
    expect(meadow.pickLod(L[2] + 5, 2)).toBe(-1);
  });
  it('streams patches round the camera, hides those lost in the turbid water, and drops them when far', () => {
    const cam = new PerspectiveCamera();
    const bed = meadow.nearest(0, 60, 'dense')!;
    cam.position.set(bed.x, 1.5, bed.z - bed.r - 2);
    const env = { tideLevel: -1.2, tideRate: -0.2, windDir: 0.7, waveGain: 1 };
    meadow.update(0.016, cam, env);
    const st = meadow.stats();
    expect(st.live).toBeGreaterThan(0);
    expect(st.lod[0]).toBeGreaterThan(0);
    // the ebb runs seaward
    expect(meadow.kit.uniforms.uAmCurrent.value.y).toBeGreaterThan(0);
    const p = meadow.live.get(bed.index)!;
    expect(meadow.hiddenByWater(p, bed.x, 1.5, bed.z - 40, 2.0)).toBe(true);
    expect(meadow.hiddenByWater(p, bed.x, 1.5, bed.z - 3, 2.0)).toBe(false);
    expect(meadow.hiddenByWater(p, bed.x, 1.5, bed.z - 40, p.groundY - 0.1)).toBe(false);
    cam.position.set(0, 1.5, -150);
    meadow.update(0.016, cam, env);
    expect(meadow.stats().live).toBe(0);
  });
});
