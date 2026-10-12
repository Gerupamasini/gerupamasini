import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  CORAL_IDS,
  CORAL_INFO,
  coralSpec,
  coralGeometry,
  CoralKit,
  OkinawaCoral,
  CoralReef,
  placeCorals,
  coralMatrix,
} from '../../src/world/coral';
import type { CoralVariant } from '../../src/world/coral';
import { Terrain } from '../../src/world/Terrain';
import { MapSchema } from '../../src/data/schemas';
import { WaterPass } from '../../src/world/Water';
import { createWaves } from '../../src/world/Waves';
import { surfUniforms } from '../../src/world/Surf';
function terrain(sub = 'rock', h = -2.8): Terrain {
  return {
    heightAt: () => h,
    substrateAt: () => sub,
    normalAt: (_x: number, _z: number, out = new Vector3()) => out.set(0, 1, 0),
    pitMaskAt: () => 0,
    inside: (x: number, z: number, m = 0) => Math.abs(x) < 35 - m && Math.abs(z) < 35 - m,
  } as unknown as Terrain;
}
const layout = {
  seed: 7123,
  clusters: [{ x: 0, z: 0, radius: 25, count: 100 }],
  waterLevel: 0,
  lowWater: -0.65,
};
describe('Okinawa corals', () => {
  it.each(
    CORAL_IDS.flatMap((species) => ([0, 1, 2, 3] as const).map((variant) => [species, variant] as const)),
  )(
    'builds repeatable finite %s variant %i',
    (species, variant) => {
      const g = coralGeometry(species, variant, 0),
        again = coralGeometry(species, variant, 0),
        positions = g.getAttribute('position').array,
        repeated = again.getAttribute('position').array;
      const bytes = new Uint8Array(positions.buffer),
        repeatedBytes = new Uint8Array(repeated.buffer);
      expect(bytes.length).toBe(repeatedBytes.length);
      expect(bytes.every((value, i) => value === repeatedBytes[i])).toBe(true);
      for (const attr of Object.values(g.attributes)) expect(attr.array.every(Number.isFinite)).toBe(true);
      let highestIndex = 0;
      for (const index of g.index!.array) highestIndex = Math.max(highestIndex, index);
      expect(highestIndex).toBeLessThan(g.getAttribute('position').count);
      g.dispose();
      again.dispose();
    },
    10000,
  );
  it.each(CORAL_IDS)('keeps four distinct forms and reduced LODs for %s', (species) => {
    const signatures = new Set<string>(),
      counts: number[] = [];
    for (const variant of [0, 1, 2, 3] as const) {
      const g = coralGeometry(species, variant, 1);
      signatures.add(`${g.index!.count}/${g.boundingBox!.max.toArray()}`);
      g.dispose();
    }
    expect(signatures.size).toBe(4);
    for (const lod of [0, 1, 2] as const) {
      const g = coralGeometry(species, 0, lod);
      counts.push(g.index!.count);
      g.dispose();
    }
    expect(counts[1]).toBeLessThan(counts[0] * 0.45);
    expect(counts[2]).toBeLessThan(counts[1] * 0.4);
    if (species === 'acropora_digitifera') expect(counts[2] / 3).toBeLessThan(1000);
  });
  it('keeps massive colonies broad and table colonies flatter than branching forms', () => {
    const ratios = CORAL_IDS.map((species) => {
      const g = coralGeometry(species, 0, 1),
        size = g.boundingBox!.getSize(new Vector3());
      g.dispose();
      return size.y / size.x;
    });
    for (const ratio of [ratios[2], ratios[4]]) {
      expect(ratio).toBeGreaterThan(0.22);
      expect(ratio).toBeLessThan(0.6);
    }
    expect(ratios[1]).toBeLessThan(ratios[0]);
  });
  it.each([0, 1, 2, 3] as const)(
    'fuses branching variant %i into one closed surface with consistent winding',
    (variant) => {
      const g = coralGeometry('acropora_digitifera', variant, 1),
        p = g.getAttribute('position'),
        normal = g.getAttribute('normal'),
        indices = g.index!.array,
        parent = Int32Array.from({ length: p.count }, (_, i) => i),
        edges = new Map<string, number>();
      const root = (v: number): number => {
        while (parent[v] !== v) {
          parent[v] = parent[parent[v]];
          v = parent[v];
        }
        return v;
      };
      const a = new Vector3(),
        b = new Vector3(),
        c = new Vector3(),
        n = new Vector3();
      let degenerate = 0,
        reversed = 0,
        badNormals = 0;
      for (let i = 0; i < p.count; i++) {
        n.fromBufferAttribute(normal, i);
        if (Math.abs(n.lengthSq() - 1) > 0.01) badNormals++;
      }
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i],
          ib = indices[i + 1],
          ic = indices[i + 2];
        parent[root(ib)] = root(ia);
        parent[root(ic)] = root(ia);
        for (const [u, v] of [
          [ia, ib],
          [ib, ic],
          [ic, ia],
        ]) {
          const key = u < v ? `${u}/${v}` : `${v}/${u}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
        a.fromBufferAttribute(p, ia);
        b.fromBufferAttribute(p, ib).sub(a);
        c.fromBufferAttribute(p, ic).sub(a);
        b.cross(c);
        n.set(
          normal.getX(ia) + normal.getX(ib) + normal.getX(ic),
          normal.getY(ia) + normal.getY(ib) + normal.getY(ic),
          normal.getZ(ia) + normal.getZ(ib) + normal.getZ(ic),
        );
        if (b.lengthSq() < 1e-20) degenerate++;
        if (b.dot(n) <= 0) reversed++;
      }
      expect(new Set(Array.from(parent, (_, i) => root(i))).size).toBe(1);
      expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
      expect(degenerate).toBe(0);
      expect(reversed).toBe(0);
      expect(badNormals).toBe(0);
      g.dispose();
    },
  );
  it('has outward-facing closed masses and upward-facing thin plates', () => {
    const mass = coralGeometry('porites_lobata', 0, 1),
      p = mass.getAttribute('position'),
      n = mass.getAttribute('normal');
    let outward = 0,
      total = 0;
    const centre = mass.boundingBox!.getCenter(new Vector3());
    for (let i = 0; i < p.count; i++) {
      const point = new Vector3().fromBufferAttribute(p, i).sub(centre),
        normal = new Vector3().fromBufferAttribute(n, i);
      if (normal.lengthSq() > 0.5) {
        total++;
        if (point.dot(normal) > 0) outward++;
      }
    }
    expect(outward / total).toBeGreaterThan(0.97);
    mass.dispose();
    const plate = coralGeometry('montipora_foliosa', 0, 0),
      normal = plate.getAttribute('normal');
    let top = 0,
      bottom = 0;
    for (let i = 0; i < normal.count; i++) {
      top += Number(normal.getY(i) > 0.5);
      bottom += Number(normal.getY(i) < -0.5);
    }
    expect(top).toBeGreaterThan(5000);
    expect(bottom).toBeGreaterThan(5000);
    plate.dispose();
  });
  it('varies scale, growth, density, living colour, exposed skeleton and basal algae without rebuilding shared buffers', () => {
    const s = coralSpec(123),
      repeat = coralSpec(123),
      other = coralSpec(456);
    expect(s).toEqual(repeat);
    expect(s).not.toEqual(other);
    expect(s.surfaceColor.getHex()).not.toBe(other.surfaceColor.getHex());
    const ground = terrain(),
      kit = new CoralKit(),
      a = new OkinawaCoral(kit, s, ground),
      b = new OkinawaCoral(kit, { ...other, species: s.species, variant: s.variant }, ground);
    expect(a.levels[0].geometry.getAttribute('position')).toBe(b.levels[0].geometry.getAttribute('position'));
    expect(a.levels[0].material).toBe(b.levels[0].material);
    expect(a.levels[0].geometry.getAttribute('aCoralLook')).not.toBe(
      b.levels[0].geometry.getAttribute('aCoralLook'),
    );
    expect(coralMatrix(s, ground).elements).not.toEqual(
      coralMatrix({ ...s, growthDirection: [0.14, 0.1] }, ground).elements,
    );
    a.dispose();
    expect(b.levels[0].geometry.index!.count).toBeGreaterThan(0);
    b.dispose();
    kit.dispose();
    expect(() => kit.geometry(s.species, 0, 0)).toThrow();
  });
  it('bounds batch view ownership during repeated create and dispose', () => {
    const kit = new CoralKit(),
      s = coralSpec(7123);
    for (let i = 0; i < 12; i++) {
      const model = new OkinawaCoral(kit, s, terrain());
      model.dispose();
      expect(kit.stats.views).toBe(3);
    }
    kit.dispose();
    expect(kit.stats.views).toBe(0);
  });
  it('keeps a massive colony rim seated on a sloping bottom even with maximum growth lean', () => {
    const t = terrain();
    t.heightAt = (x) => -2.8 + x * 0.1;
    t.normalAt = (_x, _z, out = new Vector3()) => out.set(-0.1, 1, 0).normalize();
    for (const species of ['porites_lobata', 'platygyra_daedalea'] as const) {
      const spec = coralSpec(7123, 0, species);
      spec.scale = 1;
      spec.growthDirection = [0.14, 0.14];
      const matrix = coralMatrix(spec, t);
      for (let i = 0; i < 32; i++) {
        const angle = (i * Math.PI) / 16;
        const rim = new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35).applyMatrix4(matrix);
        expect(rim.y - t.heightAt(rim.x, rim.z)).toBeLessThan(0.01);
      }
    }
  });
  it('only places colonies on stable hard bottom with adequate low-water clearance and real gaps', () => {
    const t = terrain(),
      specs = placeCorals(t, layout);
    expect(specs.length).toBeGreaterThan(60);
    expect(specs).toEqual(placeCorals(t, layout));
    expect(new Set(specs.map((s) => s.species)).size).toBe(5);
    expect(new Set(specs.map((s) => s.variant)).size).toBe(4);
    for (const s of specs) {
      const g = coralGeometry(s.species, s.variant, 2);
      expect(t.heightAt(s.x, s.z) + g.boundingBox!.max.y * s.scale).toBeLessThan(layout.lowWater);
      g.dispose();
      expect(CORAL_INFO[s.species].depth[1]).toBeGreaterThan(-t.heightAt(s.x, s.z));
    }
    expect(placeCorals(terrain('mud'), layout)).toHaveLength(0);
    expect(placeCorals(terrain('sand'), layout)).toHaveLength(0);
    expect(placeCorals(terrain('rock', -0.25), layout)).toHaveLength(0);
    const slope = terrain();
    slope.normalAt = (_x, _z, out = new Vector3()) => out.set(0.6, 0.8, 0);
    expect(placeCorals(slope, layout)).toHaveLength(0);
  });
  it('uses shared instanced tiers with a close-up budget, quality changes and far culling', () => {
    const t = terrain(),
      reef = new CoralReef(t, layout),
      camera = { position: new Vector3(0, -1.4, 0) };
    reef.setQuality('high');
    reef.update(0, camera, { tideLevel: 0 });
    expect(reef.stats.lod[0]).toBeLessThanOrEqual(8);
    expect(reef.stats.colonies).toBeGreaterThan(60);
    expect(reef.stats.materials).toBeLessThanOrEqual(15);
    const specs = reef.specs;
    reef.setQuality('minimal');
    reef.update(0, camera, { tideLevel: 0.2 });
    expect(reef.stats.lod[0]).toBe(0);
    expect(reef.specs).toBe(specs);
    expect(reef.kit.light.water.value).toBe(0.2);
    camera.position.set(300, 50, 300);
    reef.update(0, camera, { tideLevel: 0 });
    expect(reef.stats.calls).toBe(0);
    expect(reef.kit.stats.geometries).toBeLessThanOrEqual(60);
    reef.dispose();
    expect(reef.group.children).toHaveLength(0);
  });
  it('keeps estuary water optics unchanged unless per-channel attenuation is explicitly enabled', () => {
    const n = 9,
      t = new Terrain(
        { n, size: 8, heights: new Float32Array(n * n).fill(-2), substrate: new Uint8Array(n * n) },
        ['sand'],
      );
    const water = new WaterPass(t, createWaves({ seed: 71, windDir: 0.8, depth: 2 }), surfUniforms(null));
    expect(water.uniforms.uAbsorption.value.toArray()).toEqual([0, 0, 0]);
    water.setBody(0.035, 0.16, 0.21, 0.08, { absorption: [0.18, 0.06, 0.025] });
    expect(water.uniforms.uAbsorption.value.toArray()).toEqual([0.18, 0.06, 0.025]);
    water.setBody(0.1, 0.1, 0.1, 0.8);
    expect(water.uniforms.uAbsorption.value.toArray()).toEqual([0, 0, 0]);
    water.dispose();
    t.dispose();
    expect(
      MapSchema.shape.corals.safeParse({ ...layout, clusters: [{ x: 0, z: 0, radius: -1, count: 1 }] })
        .success,
    ).toBe(false);
  });
});
