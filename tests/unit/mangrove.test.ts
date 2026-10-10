import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from 'three';
import { buildSkeleton } from '../../src/world/mangrove/skeleton';
import { buildTreeGeometry } from '../../src/world/mangrove/geometry';
import { HirugiKit, YaeyamaHirugi, MangroveForest, RootCollisionWorld, collisionSegments, segmentSurface, treeSpec, shapePoint, worldPoint, treeScale, placeMangroves } from '../../src/world/mangrove';
import type { HirugiBase, RootSegment } from '../../src/world/mangrove/types';
import type { Terrain } from '../../src/world/Terrain';
import type { Input } from '../../src/core/Input';
import type { Habitat } from '../../src/world/Habitat';
import type { MapDef } from '../../src/data/schemas';
import { MapSchema } from '../../src/data/schemas';
import { FPSController } from '../../src/player/FPSController';

const ground = { heightAt: (x: number, z: number) => 0.02 * x + 0.01 * z, n: 33, size: 64 };
function flatTerrain(): Terrain {
  return { size: 96, half: 48, n: 33, heightAt: () => 0, substrateAt: () => 'mud', pitMaskAt: () => 0, inside: (x: number, z: number, m = 0) => Math.abs(x) < 48 - m && Math.abs(z) < 48 - m,
    normalAt: (_x: number, _z: number, out = new Vector3()) => out.set(0, 1, 0) } as unknown as Terrain;
}
const segment = (a: number[], b: number[], r: number, root = true): RootSegment => ({ a: new Vector3(...a), b: new Vector3(...b), ra: r, rb: r, tree: 1, root });

describe('ヤエヤマヒルギ: shared assets', () => {
  it('has precisely five distinct authored adult silhouettes, deterministic skeletons and opposite leaves', () => {
    const skeletons = [0, 1, 2, 3, 4].map(i => buildSkeleton(i as HirugiBase));
    expect(new Set(skeletons.map(s => `${s.height}/${s.reach}/${s.trunk.length}`)).size).toBe(5);
    expect(skeletons[2].trunk[1].points.at(-1)!.x).not.toEqual(skeletons[0].trunk[1].points.at(-1)!.x);
    for (let i = 0; i < 5; i++) {
      const s = skeletons[i]; expect(s).toEqual(buildSkeleton(i as HirugiBase));
      expect(s.roots.filter(r => r.order === 0).length).toBeGreaterThan(9);
      expect(s.leaves.length).toBeGreaterThan(1700);
      expect(s.leaves[0].center.distanceTo(s.leaves[1].center)).toBeLessThan(0.03);
      expect(s.leaves[0].axis.dot(s.leaves[1].axis)).toBeLessThan(0);
      for (const root of s.roots) { expect(root.points[0].y).toBeGreaterThan(0); expect(root.points.at(-1)!.y).toBeLessThan(0); }
    }
  });
  it('keeps the four-part hierarchy and reduces geometry substantially through three LODs', () => {
    const kit = new HirugiKit(ground), a = new YaeyamaHirugi(kit, treeSpec(317)), b = new YaeyamaHirugi(kit, treeSpec(318));
    expect(a.children.map(c => c.name)).toEqual(['Trunk', 'Branches', 'Leaves', 'Roots']);
    const tris = [0, 1, 2].map(l => { a.setLod(l as 0 | 1 | 2); return a.triangles; });
    expect(tris[1]).toBeLessThan(tris[0] * 0.35); expect(tris[2]).toBeLessThan(tris[1] * 0.25);
    expect(a.levels[0].Roots.geometry.getAttribute('position')).toBe(b.levels[0].Roots.geometry.getAttribute('position'));
    expect(kit.templateCount).toBe(1); expect(kit.geometryCount).toBe(12);
    for (const level of a.levels) for (const mesh of Object.values(level)) {
      for (const attr of Object.values(mesh.geometry.attributes)) expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
    }
    a.dispose(); b.dispose(); kit.dispose();
  });
  it('uses sparse flat cards only for low-quality far trees and preserves collisions when switching quality', () => {
    const terrain = flatTerrain(), spec = treeSpec(317);
    const forest = new MangroveForest(terrain, { seed: 1, clusters: [] }, [spec]);
    const camera = { position: new Vector3(0, 5, 50) }, env = { tideLevel: 0, wetLevel: 0 };
    forest.setLod(2); forest.setQuality('mid'); forest.update(0, camera, env);
    const normal = forest.stats.triangles, segments = forest.collision.segments;
    forest.setQuality('low'); forest.update(0, camera, env);
    expect(forest.stats.triangles).toBeGreaterThan(0);
    expect(forest.stats.triangles).toBeLessThan(normal * 0.25);
    expect(forest.stats.calls).toBe(3);
    expect(forest.collision.segments).toBe(segments);
    forest.setQuality('high'); forest.update(0, camera, env);
    expect(forest.stats.triangles).toBe(normal);
    expect(forest.collision.segments).toBe(segments);
    forest.dispose();
  });
  it('provides fixed, progressively taller juveniles; roots develop only on the larger model', () => {
    const juveniles = [0, 1, 2].map(s => buildSkeleton(0, s as 0 | 1 | 2));
    juveniles.forEach((s,i) => expect(s.height).toBeCloseTo([0.53, 0.98, 1.68][i]));
    expect(juveniles[0].roots).toHaveLength(0); expect(juveniles[2].roots).toHaveLength(3);
    const a = { ...treeSpec(10), sapling: 1 as const }, b = { ...treeSpec(999), sapling: 1 as const };
    expect(shapePoint(new Vector3(1, 1, 0), a, true)).toEqual(shapePoint(new Vector3(1, 1, 0), b, true));
    expect(treeScale(a)).toBe(treeScale(b));
  });
  it('releases repeated standalone instances without unbounded shared-view growth', () => {
    const kit = new HirugiKit(ground);
    for (let i=0;i<12;i++) { const tree=new YaeyamaHirugi(kit,treeSpec(400+i));tree.dispose(); }
    expect(kit.batchGeometryCount).toBe(12);expect(kit.geometryCount).toBe(12);kit.dispose();
  });
  it('separates seed streams without multiplying geometry, and conforms root tips to sloping ground', () => {
    const a = treeSpec(317), p = new Vector3(2, 0.4, 1), crown = new Vector3(1, 4, 0);
    const b = { ...a, rootSeed: 1 };
    expect(shapePoint(p, a, true)).not.toEqual(shapePoint(p, b, true));
    expect(shapePoint(crown, a, false)).toEqual(shapePoint(crown, b, false));
    const s = buildSkeleton(0), roots = collisionSegments(s, a, ground);
    const last = roots.find(r => r.root && r.b.y < 0)!; expect(last).toBeDefined();
    const endpoint = s.roots[0].points.at(-1)!; const world = worldPoint(endpoint, a, true, ground);
    expect(world.y - ground.heightAt(world.x, world.z)).toBeCloseTo(endpoint.y * treeScale(a), 6);
  });
  it('attaches primary and branch-borne prop roots to real woody stems, including above a low fork', () => {
    for(const base of [0,1,2,3,4] as const) {
      const s=buildSkeleton(base), points=s.trunk.flatMap(p=>new CatmullRomCurve3(p.points,false,'centripetal').getPoints(96));
      for(const root of s.roots.filter(p=>p.order===0 || p.points[0].y>2)) {
        expect(Math.min(...points.map(p=>p.distanceTo(root.points[0])))).toBeLessThan(0.1);
      }
    }
  });
});

describe('support and obstacles: tapered prop roots', () => {
  it('returns the upper surface and upward normal, with no floor in the gap', () => {
    const physics = new RootCollisionWorld(); physics.add([segment([-1, 0.4, 0], [1, 0.4, 0], 0.12)]);
    const hit = physics.supportAt(0, 0, 1)!; expect(hit.height).toBeCloseTo(0.52); expect(hit.normal.y).toBeCloseTo(1);
    expect(physics.supportAt(0, 0.5, 1)).toBeNull(); expect(physics.supportAt(0, 0, 0.3)).toBeNull();
  });
  it('has a walkable top on inclined and tapered roots, but no fake top on a near-vertical trunk', () => {
    const s = segment([-1, 0.3, 0], [1, 0.9, 0], 0.12); s.rb = 0.05;
    const hit = segmentSurface(s, 0, 0, 2)!; expect(hit.height).toBeGreaterThan(0.65); expect(hit.height).toBeLessThan(0.71); expect(hit.normal.y).toBeGreaterThan(0.9);
    const world = new RootCollisionWorld(); world.add([segment([0, 0, 0], [0, 2, 0], 0.2, false)]);
    expect(world.supportAt(0, 0, 2.5)).toBeNull(); expect(world.overlapsBody(0.1, 0, 0)).toBe(true);
  });
  it('supports a small animal at the rounded joint and allows bounded drops below overhead roots', () => {
    const physics = new RootCollisionWorld(); physics.add([segment([-1, 0.2, 0], [0, 0.2, 0], 0.07), segment([0, 0.2, 0], [1, 0.6, 0], 0.07), segment([-1, 1.6, 0], [1, 1.6, 0], 0.08)]);
    expect(physics.supportAt(0, 0, 0.4, 0.1)!.height).toBeCloseTo(0.2+0.07*Math.sqrt(1.16),6);
    expect(physics.supportAt(0, 0, 0.15, 0.1)).toBeNull();
    expect(physics.supportAt(0, 0, 1.9)!.height).toBeCloseTo(1.68);
  });
  it('blocks a swept body even when both endpoints lie beyond a narrow obstacle', () => {
    const physics = new RootCollisionWorld(); physics.add([segment([0, 0.6, -0.5], [0, 1.5, 0.5], 0.05)]);
    expect(physics.canMove(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), { heightAt: () => 0 })).toBe(false);
    expect(physics.canMove(new Vector3(-1, 0, 2), new Vector3(1, 0, 2), { heightAt: () => 0 })).toBe(true);
  });
  it('does not expose internal capsule joints as steps on a vertical root', () => {
    const physics=new RootCollisionWorld();physics.add([segment([0,0,0],[0,1,0],0.1),segment([0,1,0],[0,2,0],0.1)]);
    expect(physics.supportAt(0,0,1.5)).toBeNull();
    expect(physics.supportAt(0,0,3)!.height).toBeCloseTo(2.1);
  });
  it('permits stepping onto a low root, and rejects a root above the step limit', () => {
    const low = new RootCollisionWorld(); low.add([segment([-1, 0.05, 0], [1, 0.05, 0], 0.07)]);
    expect(low.canMove(new Vector3(0, 0, -0.5), new Vector3(0, 0.12, 0), { heightAt: () => 0 })).toBe(true);
    const high = new RootCollisionWorld(); high.add([segment([-1, 0.65, 0], [1, 0.65, 0], 0.1)]);
    expect(high.canMove(new Vector3(0, 0, -0.5), new Vector3(0, 0, 0.5), { heightAt: () => 0 })).toBe(false);
  });
  it('retains collision when a whole forest is culled and builds one separate simplified debug mesh', () => {
    const terrain = flatTerrain(), forest = new MangroveForest(terrain, { seed: 4, clusters: [] }, [treeSpec(1)]);
    const camera = new PerspectiveCamera(); camera.position.set(2000, 1, 0);
    const n = forest.collision.segments.length; forest.update(0, camera, { tideLevel: 0, wetLevel: 0.2 });
    expect(forest.stats.calls).toBe(0); expect(forest.collision.segments.length).toBe(n);
    const m = forest.collision.debugMesh(); expect(m.geometry.index!.count).toBeGreaterThan(100); expect(m.name).toBe('RootCollision');
    m.geometry.dispose(); (m.material as { dispose(): void }).dispose(); forest.dispose();
  });
});

describe('forest and game integration', () => {
  it('places all five bases in irregular reproducible clusters, includes juveniles and rejects unsuitable ground', () => {
    const terrain = flatTerrain(), layout = { seed: 317, clusters: [{ x: 0, z: 0, radius: 20, count: 90 }], juvenileFraction: 0.3 };
    const specs = placeMangroves(terrain, layout); expect(specs).toEqual(placeMangroves(terrain, layout));
    expect(specs.length).toBe(90); expect(new Set(specs.filter(s => s.sapling === null).map(s => s.base)).size).toBe(5);
    expect(specs.some(s => s.sapling !== null)).toBe(true);
    expect(placeMangroves({ ...terrain, heightAt: () => -2 } as unknown as Terrain, layout)).toHaveLength(0);
  });
  it('switches near/mid/far geometry with hysteresis, never changes physics, and shares only five adult templates', () => {
    const terrain = flatTerrain(), specs = Array.from({ length: 15 }, (_, i) => ({ ...treeSpec(300, i), x: i * 2 }));
    const forest = new MangroveForest(terrain, { seed: 1, clusters: [] }, specs), cam = new PerspectiveCamera();
    const n = forest.collision.segments.length;
    cam.position.set(0, 2, 0); forest.update(0, cam, { tideLevel: 0, wetLevel: 0.1 });
    expect(forest.stats.templates).toBe(5); expect(forest.stats.lod[0]).toBeGreaterThan(0);
    cam.position.set(100, 2, 0); forest.update(1, cam, { tideLevel: 0.5, wetLevel: 0.6 });
    expect(forest.stats.lod[0]).toBe(0); expect(forest.stats.lod[2]).toBe(15); expect(forest.stats.collisionSegments).toBe(n);
    expect(forest.kit.uniforms.uHgWater.value).toBe(0.5); expect(forest.kit.uniforms.uHgWet.value).toBe(0.6); forest.dispose();
  });
  it('the actual FPS controller lands on a root instead of the terrain underneath it', () => {
    const terrain = flatTerrain(), root = new RootCollisionWorld(); root.add([segment([-2, 0.12, 0], [2, 0.12, 0], 0.1)]);
    const input = { looking: false, mouseRightDown: false, pressed: () => false, held: () => false, moveForward: 0, moveRight: 0 } as unknown as Input;
    const habitat = { depthAt: () => 0, waterAt: () => -1 } as unknown as Habitat;
    const map = { spawnStart: { x: 0, z: 0, heading: 0 }, bounds: { walkable: [[-40,-40],[40,40]], noEntry: [] } } as unknown as MapDef;
    const player = new FPSController(new PerspectiveCamera(), terrain, habitat, input, map);
    player.supportHeight = (x,z,maxY) => root.supportAt(x,z,maxY)?.height ?? null;
    player.obstacleFree = (a,b) => root.canMove(a,b,terrain);
    player.setPose(0, 0, 0); expect(player.position.y).toBeCloseTo(0.22);
    player.update(0.016, 1, false); expect(player.position.y).toBeCloseTo(0.22);
    (input as unknown as { held: () => boolean }).held = () => true;
    player.update(0.016, 1, false); expect(player.airborne).toBe(true);
    (input as unknown as { held: () => boolean }).held = () => false;
    for (let i = 0; i < 60; i++) player.update(0.016, 1, false);
    expect(player.airborne).toBe(false); expect(player.position.y).toBeCloseTo(0.22);
  });
});
